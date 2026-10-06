import { ChatBedrockConverse } from "@langchain/aws";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { loadEnv } from "../../config/env.js";

let singleton: BaseChatModel | null = null;

export function getChatModel(): BaseChatModel {
  if (singleton) return singleton;
  const env = loadEnv();

  singleton = new ChatBedrockConverse({
    model: env.AWS_LLM_MODEL,
    region: env.AWS_REGION,
  });

  return singleton;
}

export function setChatModel(m: BaseChatModel): void {
  singleton = m;
}
