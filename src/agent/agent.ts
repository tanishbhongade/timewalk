import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { StructuredToolInterface } from "@langchain/core/tools";
import {
  HistoryResultSchema,
  LlmHistoryResultSchema,
  type HistoryResult,
} from "../schemas/response.schemas.js";
import type { ResolvedLocation } from "../schemas/location.schemas.js";
import { logger } from "../utils/logger.js";
import { buildSystemPrompt, SYNTHESIS_SYSTEM_PROMPT } from "./prompt.js";
import { ZodError, z } from "zod";

function hashUrl(url: string): string {
  let h = 2166136261;
  for (let i = 0; i < url.length; i++) {
    h ^= url.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36).slice(0, 8);
}

export interface AgentRunInput {
  question: string;
  location: ResolvedLocation;
  period?: { fromYear?: number; toYear?: number };
  language?: string;
}

export interface AgentRunOutput {
  result: HistoryResult;
  toolCallCount: number;
}

export interface AgentOptions {
  model: BaseChatModel;
  tools: StructuredToolInterface[];
  maxToolCalls: number;
}

export class HistoryAgent {
  constructor(private readonly opts: AgentOptions) {}

  async run(input: AgentRunInput): Promise<AgentRunOutput> {
    const { model, tools, maxToolCalls } = this.opts;
    const toolsByName = new Map(tools.map((t) => [t.name, t]));

    const modelWithTools = (
      model as unknown as {
        bindTools?: (t: StructuredToolInterface[]) => BaseChatModel;
      }
    ).bindTools
      ? (
          model as unknown as {
            bindTools: (t: StructuredToolInterface[]) => BaseChatModel;
          }
        ).bindTools(tools)
      : model;

    const system = buildSystemPrompt(input.location);
    const userContent = [
      `Question: ${input.question}`,
      input.period &&
        `Period: ${input.period.fromYear ?? "?"}–${input.period.toYear ?? "?"}`,
      input.language && `Preferred language: ${input.language}`,
    ]
      .filter(Boolean)
      .join("\n");

    const messages: Array<
      SystemMessage | HumanMessage | AIMessage | ToolMessage
    > = [new SystemMessage(system), new HumanMessage(userContent)];

    let toolCallCount = 0;
    const MAX_LOOPS = maxToolCalls + 3;

    for (let loop = 0; loop < MAX_LOOPS; loop++) {
      const ai = (await modelWithTools.invoke(messages)) as AIMessage;
      messages.push(ai);

      const calls = (
        ai as unknown as {
          tool_calls?: Array<{ id?: string; name: string; args: unknown }>;
        }
      ).tool_calls;

      if (!calls || calls.length === 0) break;
      if (toolCallCount >= maxToolCalls) break;

      for (const call of calls) {
        if (toolCallCount >= maxToolCalls) break;
        toolCallCount++;

        const tool = toolsByName.get(call.name);
        if (!tool) {
          messages.push(
            new ToolMessage({
              tool_call_id: call.id ?? call.name,
              content: JSON.stringify({ error: `Unknown tool ${call.name}` }),
            }),
          );
          continue;
        }

        try {
          const out = await tool.invoke(call.args as Record<string, unknown>);
          messages.push(
            new ToolMessage({
              tool_call_id: call.id ?? call.name,
              content: typeof out === "string" ? out : JSON.stringify(out),
            }),
          );
        } catch (err) {
          logger.warn(
            { err: (err as Error).message, tool: call.name },
            "agent tool call failed",
          );
          messages.push(
            new ToolMessage({
              tool_call_id: call.id ?? call.name,
              content: JSON.stringify({ error: (err as Error).message }),
            }),
          );
        }
      }
    }

    const result = await this.synthesize(messages, input);
    return { result, toolCallCount };
  }

  private async synthesize(
    messages: Array<SystemMessage | HumanMessage | AIMessage | ToolMessage>,
    input: AgentRunInput,
  ): Promise<HistoryResult> {
    const { model } = this.opts;
    const evidence = this.buildEvidenceBlock(messages);

    let parsed: z.infer<typeof LlmHistoryResultSchema> | null = null;
    let lastErrors: unknown = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      const prompt = buildSynthesisPrompt(input, evidence, attempt, lastErrors);
      const synthMessages = [
        new SystemMessage(SYNTHESIS_SYSTEM_PROMPT),
        new HumanMessage(prompt),
      ];

      // Attempt 0 — try native structured output if the model supports it.
      if (attempt === 0) {
        const structuredFn = (
          model as unknown as {
            withStructuredOutput?: (
              schema: unknown,
              opts?: { name?: string },
            ) => { invoke: (m: unknown) => Promise<unknown> };
          }
        ).withStructuredOutput;

        if (typeof structuredFn === "function") {
          try {
            const invoke = (
              model as unknown as {
                withStructuredOutput: (
                  schema: unknown,
                  opts?: { name?: string },
                ) => { invoke: (m: unknown) => Promise<unknown> };
              }
            ).withStructuredOutput(LlmHistoryResultSchema, {
              name: "HistoryResult",
            });
            const out = await invoke.invoke(synthMessages);
            parsed = LlmHistoryResultSchema.parse(out);
            break;
          } catch (err) {
            lastErrors =
              err instanceof ZodError
                ? err.issues
                : [{ message: (err as Error).message }];
            logger.warn(
              { attempt, strategy: "structured", err: lastErrors },
              "structured output attempt failed; retrying with raw JSON",
            );
            continue;
          }
        }
      }

      // Attempt 1 — raw invoke + extractJson with error feedback in the prompt.
      try {
        const raw = (await model.invoke(synthMessages)) as AIMessage;
        const text = extractTextFromContent(raw.content);
        const json = extractJson(text);
        if (!json) {
          lastErrors = [
            { code: "no_json", message: "No JSON object found in response" },
          ];
          logger.warn(
            { attempt, strategy: "raw" },
            "synthesis attempt produced no JSON",
          );
          continue;
        }
        parsed = LlmHistoryResultSchema.parse(json);
        break;
      } catch (err) {
        lastErrors =
          err instanceof ZodError
            ? err.issues
            : [{ message: (err as Error).message }];
        logger.warn(
          { attempt, strategy: "raw", err: lastErrors },
          "synthesis attempt failed validation",
        );
      }
    }

    if (!parsed) {
      throw new Error(
        `Model output failed schema validation after retry: ${JSON.stringify(
          lastErrors,
        )}`,
      );
    }

    const validIds = this.collectSourceIds(messages);
    return this.sanitize(parsed, validIds);
  }

  private buildEvidenceBlock(
    messages: Array<SystemMessage | HumanMessage | AIMessage | ToolMessage>,
  ): string {
    const lines: string[] = [];
    for (const m of messages) {
      if (m instanceof AIMessage) {
        const calls = (
          m as unknown as {
            tool_calls?: Array<{ name: string; args: unknown }>;
          }
        ).tool_calls;
        if (calls && calls.length > 0) {
          for (const c of calls) {
            lines.push(`[tool call] ${c.name}(${JSON.stringify(c.args)})`);
          }
        } else if (typeof m.content === "string" && m.content.trim()) {
          lines.push(`[agent note] ${m.content}`);
        }
      } else if (m instanceof ToolMessage) {
        const content =
          typeof m.content === "string" ? m.content : JSON.stringify(m.content);
        lines.push(`[tool result] ${content}`);
      }
    }
    return lines.join("\n");
  }

  private collectSourceIds(
    messages: Array<SystemMessage | HumanMessage | AIMessage | ToolMessage>,
  ): Set<string> {
    const ids = new Set<string>();
    for (const m of messages) {
      if (!(m instanceof ToolMessage)) continue;
      const content =
        typeof m.content === "string" ? m.content : JSON.stringify(m.content);
      const matches = content.matchAll(/"id"\s*:\s*"(src_[^"]+)"/g);
      for (const match of matches) ids.add(match[1]);
    }
    return ids;
  }

  private sanitize(
    result: z.infer<typeof LlmHistoryResultSchema>,
    validIds: Set<string>,
  ): HistoryResult {
    const urlToId = new Map<string, string>();
    const sources = result.sources
      .map((s) => {
        const id =
          (s as unknown as { id?: string }).id ?? `src_${hashUrl(s.url)}`;
        urlToId.set(s.url, id);
        return { ...s, id };
      })
      .filter((s) => validIds.size === 0 || validIds.has(s.id));

    const stories = result.stories.map((s) => ({
      ...s,
      claims: s.claims.map((c) => ({
        ...c,
        sourceIds: c.sourceIds
          .map((id) => (validIds.has(id) ? id : (urlToId.get(id) ?? id)))
          .filter((id) => validIds.size === 0 || validIds.has(id)),
      })),
    }));

    return { ...result, stories, sources };
  }
}

function extractJson(text: string): unknown {
  // Prefer fenced blocks
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;

  const start = candidate.indexOf("{");
  if (start === -1) return null;

  // Walk forward to find the matching close brace, ignoring braces inside strings
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const slice = candidate.slice(start, i + 1);
        try {
          return JSON.parse(slice);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === "string") return block;
        if (block && typeof block === "object" && "text" in block) {
          return String((block as { text: unknown }).text ?? "");
        }
        return "";
      })
      .join("\n");
  }
  return JSON.stringify(content);
}

function buildSynthesisPrompt(
  input: AgentRunInput,
  evidence: string,
  attempt: number,
  lastErrors: unknown,
): string {
  const schemaShape = `{
  "title": string,
  "summary": string,
  "timeRange": { "fromYear"?: number, "toYear"?: number, "label": string },
  "stories": [{
    "heading": string,
    "narration": string,
    "relevance": string,
    "confidence": "high" | "medium" | "low",
    "claims": [{ "claim": string, "sourceIds": string[] }]
  }],
  "nearbyPlaces": [{ "name": string, "reasonRelevant": string, "distanceMeters"?: number }],
  "sources": [{ "id": string, "title": string, "url": string, "publisher"?: string, "publishedAt"?: string }],
  "caveats": string[]
}`;

  const placeLabel =
    input.location.city && input.location.locality
      ? `${input.location.locality}, ${input.location.city}`
      : (input.location.city ??
        input.location.locality ??
        input.location.displayName ??
        `${input.location.latitude},${input.location.longitude}`);
  const base = [
    `Question: ${input.question}`,
    `Location: ${placeLabel}`,
    input.period
      ? `Period: ${input.period.fromYear ?? "?"}–${input.period.toYear ?? "?"}`
      : "",
    "",
    "Evidence gathered by the research agent:",
    evidence || "(no tool evidence was gathered)",
    "",
    "Return ONLY a JSON object conforming to this shape:",
    schemaShape,
    "",
    "Every required field must be present.",
    'Every source object must include an "id" string.',
    "Every sourceIds entry in a claim must match an id present in sources.",
  ]
    .filter(Boolean)
    .join("\n");

  if (attempt === 0) return base;

  return [
    base,
    "",
    "Your previous attempt failed schema validation with these errors:",
    JSON.stringify(lastErrors, null, 2),
    "",
    "Produce a corrected JSON object that fixes exactly these issues.",
  ].join("\n");
}
