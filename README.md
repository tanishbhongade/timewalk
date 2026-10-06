# TimeWalk

**A location-aware historical storytelling backend.** Give it coordinates and a question — it tells you what happened where you're standing.

> Where am I, what happened here, and can the AI prove it?

TimeWalk resolves a GPS point into geographic context, runs a two-phase LLM agent against real web sources, and returns a short, source-grounded story designed to be read while walking. No login. No account. Anonymous device identity.

Built as the backend for a future mobile walking companion.

---

## What it does

- **Accepts** a latitude/longitude pair and a natural-language historical question.
- **Resolves** the coordinates into human-readable place context (city, locality, region, country, landmark) via reverse geocoding.
- **Runs** a bounded ReAct-style research loop with an LLM that has access to a small, explicit toolset.
- **Searches** the web via Tavily, restricted to Wikipedia first, with broad fallback for places without pages.
- **Synthesizes** the gathered evidence into a strict, schema-validated JSON response.
- **Grounds** every factual claim against real source IDs and strips any that the model fabricated.
- **Returns** a lean, human-readable story: short sections, a `whyHere` line for each, walkable nearby places, sources, and an honest uncertainty field.

---

## Architecture

```
Client
   │
   │  POST /api/v1/history  (Authorization: Bearer <accessToken>)
   ▼
┌────────────────────────┐
│ Express                │  auth · rate limiting · validation · request IDs
└───────────┬────────────┘
            ▼
┌────────────────────────┐
│ Location service       │  reverse geocoding (Nominatim) → ResolvedLocation
└───────────┬────────────┘
            ▼
┌────────────────────────┐
│ HistoryService         │  cache check → agent run → cache write
└───────────┬────────────┘
            ▼
┌────────────────────────┐
│ HistoryAgent           │
│                        │
│  Phase 1 — Research    │  ReAct loop with bounded tool calls
│    · search_history    │
│    · search_specific   │
│    · get_nearby_...    │
│                        │
│  Phase 2 — Synthesis   │  withStructuredOutput + Zod schema
└───────────┬────────────┘
            ▼
┌────────────────────────┐
│ Source scrubber        │  drops fabricated IDs, filters claims
└───────────┬────────────┘
            ▼
┌────────────────────────┐
│ Response shaper        │  internal HistoryResult → client shape
└───────────┬────────────┘
            ▼
         Client
```

**Design principle:** the agent owns the reasoning, the tools own the facts, the API owns the contract.

---

## Tech stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 20+ |
| Language | TypeScript (ESM, NodeNext) |
| HTTP | Express 4 |
| LLM | AWS Bedrock — `google.gemma-3-27b-it` (open weights) |
| Agent framework | LangChain (`@langchain/core`, `@langchain/aws`) |
| Web search | Tavily |
| Geocoding | Nominatim (OpenStreetMap) |
| Validation | Zod |
| Auth | JWT (anonymous device identity) |
| Logging | Pino |
| Testing | Vitest + Supertest |

---

## Getting started

### Prerequisites

- Node.js 20 or newer
- An AWS Bedrock API key with access to `google.gemma-3-27b-it` (or another supported model)
- A Tavily API key ([tavily.com](https://tavily.com) — free tier available)

No database required.

### Install

```bash
git clone https://github.com/tanish/time-machine.git
cd time-machine
npm install
```

### Configure

```bash
cp .env.example .env
```

Fill in `.env`:

```bash
NODE_ENV=development
PORT=3000
LOG_LEVEL=info

# Bedrock
AWS_REGION=us-east-1
AWS_LLM_MODEL=google.gemma-3-27b-it
AWS_BEARER_TOKEN_BEDROCK=your-bedrock-bearer-token

# Web research
TAVILY_API_KEY=tvly-your-key

# Geocoder
GEOCODER_BASE_URL=https://nominatim.openstreetmap.org
GEOCODER_USER_AGENT=TimeWalk/0.1 (contact: your-email@example.com)

# Agent tuning
AGENT_MAX_TOOL_CALLS=6
REQUEST_TIMEOUT_MS=45000
TOOL_TIMEOUT_MS=12000
CACHE_TTL_SECONDS=900

# JWT — generate with: openssl rand -hex 32
JWT_SECRET=your-64-char-hex-string
JWT_ACCESS_TTL_SECONDS=3600
JWT_REFRESH_TTL_SECONDS=2592000

# Rate limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_IP_MAX=120
RATE_LIMIT_DEVICE_RESOLVE_MAX=60
RATE_LIMIT_DEVICE_HISTORY_MAX=20
AUTH_RATE_LIMIT_PER_HOUR=10
```

Generate a real `JWT_SECRET`:

```bash
openssl rand -hex 32
```

**Note on `GEOCODER_USER_AGENT`:** Nominatim requires a real contact address in the user agent. Generic or missing user agents get blocked. Use your actual email.

### Run

```bash
npm run dev      # development with hot reload
npm run build    # compile to dist/
npm start        # run compiled output
```

The server listens on `PORT` (default `3000`).

### Test

```bash
npm test         # full suite
npm run typecheck
```

Tests mock the LLM, Tavily, and geocoder — no API calls are made during the test run.

---

## API reference

All endpoints except `/health`, `/ready`, and `/auth/*` require `Authorization: Bearer <accessToken>`.

### Authentication

TimeWalk uses anonymous JWT authentication. There is no login screen. Each app install generates a device UUID on first launch and exchanges it for a token pair.

#### `POST /auth/anonymous`

Exchange a device ID for a fresh token pair.

```json
{ "deviceId": "3f8a9b2c-1d4e-4a5b-9c8d-7e6f5a4b3c2d" }
```

Response:

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "3xY7...",
  "expiresIn": 3600
}
```

#### `POST /auth/refresh`

Exchange a valid refresh token for a new pair. The old token is invalidated. Reuse of an already-used refresh token revokes the entire token family.

```json
{ "refreshToken": "3xY7..." }
```

Response: same shape as `/auth/anonymous`.

#### `POST /auth/logout`

Revoke the token family associated with a refresh token.

```json
{ "refreshToken": "3xY7..." }
```

Response: `204 No Content`.

### Main endpoint

#### `POST /api/v1/history`

The primary agentic history request.

**Request**

```json
{
  "location": {
    "latitude": 18.5204,
    "longitude": 73.8567,
    "accuracyMeters": 25
  },
  "question": "What is the history of this place?",
  "period": { "fromYear": 1800, "toYear": 1950 },
  "language": "en"
}
```

| Field | Required | Notes |
|---|---|---|
| `location.latitude` | ✓ | -90 to 90 |
| `location.longitude` | ✓ | -180 to 180 |
| `location.accuracyMeters` | | Positive, ≤ 100000 |
| `question` | ✓ | 1–500 chars |
| `period.fromYear` / `period.toYear` | | Integer years |
| `language` | | ISO 639-1 |

**Response**

```json
{
  "requestId": "req_...",
  "location": {
    "locality": "Kasba Peth",
    "city": "Pune",
    "region": "Maharashtra",
    "country": "India",
    "coordinates": { "latitude": 18.5204, "longitude": 73.8567 },
    "displayName": "Kasba Peth, Pune"
  },
  "story": {
    "title": "Kasba Peth: The Ancient Heart of Pune",
    "summary": "Kasba Peth is Pune's oldest neighborhood...",
    "sections": [
      {
        "heading": "Ancient Origins",
        "body": "Archaeological discoveries in 2003 revealed Satavahana period artifacts...",
        "whyHere": "You're standing where Pune began over 2,000 years ago",
        "confidence": "high"
      }
    ],
    "nearby": [
      {
        "name": "Shaniwar Wada",
        "whyGo": "Historic palace-fort adjacent to Kasba Peth, seat of Peshwa rulers",
        "distanceMeters": 500
      }
    ],
    "sources": [
      {
        "title": "Kasba Peth, Pune — Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Kasba_Peth,_Pune"
      }
    ],
    "uncertainty": [
      "Some details about temple conversions come from traditional accounts."
    ]
  }
}
```

The response shape is deliberately lean. Claim-to-source mappings, tool-call counts, run IDs, and confidence internals are kept server-side and used for grounding checks, but not exposed to the client.

**Notes:**

- `sections` — typically 3–5 items. `body` is 2–4 sentences. `whyHere` is a one-line aside aimed at someone physically standing at the location.
- `nearby` — 0–5 walkable historical sites.
- `sources` — up to 5 items. Titles and URLs only.
- `uncertainty` — 0–3 short caveats. May be empty.

### Utility endpoints

#### `POST /api/v1/location/resolve`

Resolve coordinates into place names. Faster than `/history` (~1s vs 10–30s). Useful for a "you are here" header while the history request is in flight.

```json
{ "latitude": 18.5204, "longitude": 73.8567, "accuracyMeters": 25 }
```

Response shape differs from `/history`'s trimmed `location` block — this returns the full geocoder output.

#### `GET /health`

Liveness check. No auth. Returns `{ "status": "ok" }`.

#### `GET /ready`

Readiness check. No auth. Returns `{ "status": "ready" }`.

### Errors

Every error returns a consistent envelope:

```json
{
  "error": { "code": "UNAUTHORIZED", "message": "..." },
  "requestId": "req_..."
}
```

| Status | Codes |
|---|---|
| 400 | `VALIDATION_ERROR`, `MISSING_DEVICE_ID` |
| 401 | `UNAUTHORIZED`, `INVALID_TOKEN`, `INVALID_REFRESH_TOKEN`, `REFRESH_TOKEN_REUSED` |
| 429 | `RATE_LIMITED` |
| 500 | `INTERNAL_ERROR` |
| 502 | `MODEL_OUTPUT_INVALID`, `UPSTREAM_ERROR` |
| 503 | `SERVICE_UNAVAILABLE` |
| 504 | `UPSTREAM_TIMEOUT` |

---

## Quick demo

Paste this into your terminal to see the full flow. Nothing about tokens is printed.

```bash
ask() {
  local tok
  tok=$(curl -s -X POST http://localhost:3000/auth/anonymous \
    -H 'Content-Type: application/json' \
    -d '{"deviceId":"demo-device-001"}' | jq -r .accessToken)
  curl -s -X POST http://localhost:3000/api/v1/history \
    -H "Authorization: Bearer $tok" \
    -H 'Content-Type: application/json' \
    -d '{"location":{"latitude":18.5204,"longitude":73.8567},"question":"What is the history of this place?"}' \
    | jq '.story'
}

ask
```

Takes 10–30 seconds. Output is the story object.

---

## Project structure

```
src/
├── index.ts                      # Entry point
├── app.ts                        # Express wiring
├── config/
│   └── env.ts                    # Zod-validated environment
├── schemas/
│   ├── auth.schemas.ts
│   ├── location.schemas.ts
│   ├── request.schemas.ts
│   └── response.schemas.ts
├── middleware/
│   ├── auth.ts                   # JWT bearer verification
│   ├── error-handler.ts
│   ├── rate-limit.ts             # IP + per-device limiters
│   ├── request-id.ts
│   └── validate.ts               # Zod body validation
├── routes/
│   ├── index.ts
│   ├── auth.routes.ts
│   ├── health.routes.ts
│   ├── history.routes.ts
│   └── location.routes.ts
├── controllers/
│   ├── auth.controller.ts
│   ├── history.controller.ts
│   └── location.controller.ts
├── services/
│   ├── auth.service.ts           # JWT signing, verification, refresh
│   ├── cache.service.ts          # In-memory TTL cache
│   ├── history.service.ts        # Orchestration
│   ├── location.service.ts       # Geocoder wrapper
│   ├── refresh-token.store.ts    # Hashed refresh tokens, rotation, reuse detection
│   └── response-shaper.ts        # HistoryResult → client shape
├── providers/
│   ├── geocoder/
│   │   ├── geocoder.interface.ts
│   │   └── nominatim.geocoder.ts
│   ├── search/
│   │   ├── search.interface.ts
│   │   ├── tavily.provider.ts
│   │   └── index.ts
│   └── llm/
│       └── llm.factory.ts
├── agent/
│   ├── agent.ts                  # Two-phase agent
│   ├── prompt.ts                 # System + synthesis prompts
│   └── tools/
│       ├── search-history.tool.ts
│       ├── search-specific.tool.ts
│       └── nearby-context.tool.ts
└── utils/
    ├── errors.ts
    ├── geo.ts
    ├── logger.ts
    ├── retry.ts
    └── timeout.ts
```

---

## Design decisions

A few choices worth explaining.

### Two-phase agent instead of one

Standard ReAct agents do research and formatting in a single loop. The model's attention splits between "should I call another tool?" and "how do I structure this JSON correctly?" — and it fails at one or both.

TimeWalk splits them:

1. **Research phase** — native tool calling, no output constraints, bounded budget. Its only job is to gather evidence.
2. **Synthesis phase** — no tools, strict schema, `withStructuredOutput` with a repair retry. Its only job is to turn evidence into a valid response.

This is more reliable, and it gives you a clean seam to log, instrument, and scrub.

### Source grounding as a hard boundary

Three layers enforce it:

1. **Prompt rules** — never invent URLs, dates, people, or buildings.
2. **Synthesis requirement** — every factual claim must reference a source ID from the collected evidence.
3. **Post-synthesis scrubber** — collects the set of source IDs that tools *actually* returned, filters the model's output against it. Any fabricated source is stripped; any claim citing one loses the citation.

Fabrication becomes structurally impossible, not just discouraged.

### Wikipedia-first search

Tavily's `includeDomains` restricts the first search to `en.wikipedia.org`. If Wikipedia has a page for the place, that's the only source the model sees. If it doesn't, the search falls through to a broad query.

This produces clean tier-1 sources for well-covered places, and a graceful long tail for the rest. It also pre-empts the problem of the model citing travel blogs, review sites, or AI-generated encyclopedias when better sources exist.

### Lean client response

The internal `HistoryResult` — with claim-to-source mappings, confidence calibration, and full source metadata — stays server-side. The client gets a shaped response with just what a reader needs: short sections, a `whyHere` line, nearby places, sources, uncertainty.

The grounding machinery still runs. It just doesn't leak into the wire format.

### Anonymous JWT, no login

Nobody wants to create an account while standing on a street corner. Every install generates a device UUID, exchanges it for a token pair, and refreshes silently. If cross-device sync becomes a feature later, the upgrade path is a Sign in with Apple flow that swaps the `sub` claim from `device_xyz` to `user_abc` — the API shape doesn't change.

Refresh token rotation with reuse detection means a stolen refresh token can't be used silently. If a used token is presented again, the whole family is revoked and the client re-authenticates.

---

## Configuration reference

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | Runtime environment |
| `PORT` | `3000` | HTTP port |
| `LOG_LEVEL` | `info` | Pino log level |
| `AWS_REGION` | — | Bedrock region |
| `AWS_LLM_MODEL` | — | Bedrock model ID |
| `AWS_BEARER_TOKEN_BEDROCK` | — | Bedrock API key |
| `TAVILY_API_KEY` | — | Tavily API key |
| `GEOCODER_BASE_URL` | Nominatim | Geocoder base URL |
| `GEOCODER_USER_AGENT` | — | Required by Nominatim |
| `AGENT_MAX_TOOL_CALLS` | `6` | Bounded research budget |
| `REQUEST_TIMEOUT_MS` | `45000` | End-to-end request cap |
| `TOOL_TIMEOUT_MS` | `12000` | Per-tool timeout |
| `CACHE_TTL_SECONDS` | `900` | History result cache |
| `JWT_SECRET` | — | HS256 signing key (≥32 chars) |
| `JWT_ACCESS_TTL_SECONDS` | `3600` | Access token lifetime |
| `JWT_REFRESH_TTL_SECONDS` | `2592000` | Refresh token lifetime |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate-limit window |
| `RATE_LIMIT_IP_MAX` | `120` | Requests per IP per window |
| `RATE_LIMIT_DEVICE_RESOLVE_MAX` | `60` | `/location/resolve` per device |
| `RATE_LIMIT_DEVICE_HISTORY_MAX` | `20` | `/history` per device |
| `AUTH_RATE_LIMIT_PER_HOUR` | `10` | Auth endpoints per IP per hour |

All values are validated at startup with Zod. Invalid or missing configuration fails loudly rather than at request time.

---

## Roadmap

- [ ] Mobile frontend (React Native / Expo)
- [ ] Redis-backed refresh token store (survives server restarts)
- [ ] Source tier classifier for the broad-search fallback path
- [ ] Saved stories and optional Sign in with Apple
- [ ] Nearby explorer with map view
- [ ] Self-hosted Gemma 3 inference (fully private path)

---

## License

MIT

---

## Contributing

This project started as a Hacktoberfest submission. Issues and PRs welcome — especially around source quality, prompt tuning, and the long tail of places without Wikipedia coverage.