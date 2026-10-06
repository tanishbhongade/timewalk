# TimeWalk Backend

Location-aware historical storytelling powered by tool-using AI.

A user sends coordinates and a question such as _"What is the history of this place?"_.
The backend resolves the coordinates into geographic context, gives an LLM a small
set of controlled tools, lets the agent research the place with Tavily, and returns
a strict, source-grounded JSON response.

## Stack

- Node.js 20+, TypeScript, Express
- LangChain (chat model + tools) with a bounded, two-phase agent loop
- Tavily for web research
- Nominatim (OpenStreetMap) for reverse geocoding (swappable adapter)
- Zod for request/tool/response validation
- Pino for structured logging
- In-memory TTL cache (swappable interface)

## Local setup

```bash
cp .env.example .env
# fill in LLM_API_KEY and TAVILY_API_KEY

npm install
npm run dev
```

The server listens on `PORT` (default `3000`).

## Example request

```bash
curl -s -X POST http://localhost:3000/api/v1/history \
  -H 'Content-Type: application/json' \
  -d '{
    "location": { "latitude": 18.5204, "longitude": 73.8567, "accuracyMeters": 25 },
    "question": "What is the history of this place?",
    "period": { "fromYear": 1800, "toYear": 1950 },
    "language": "en"
  }' | jq
```

### Example response (abridged)

```json
{
  "requestId": "req_8e1a...",
  "runId": "run_5c7d...",
  "location": {
    "latitude": 18.5204,
    "longitude": 73.8567,
    "country": "India",
    "region": "Maharashtra",
    "city": "Pune",
    "displayName": "Shaniwar Peth, Pune, Maharashtra, India",
    "accuracyMeters": 25
  },
  "result": {
    "title": "Pune: A City of Empires and Reform",
    "summary": "...",
    "timeRange": {
      "fromYear": 1800,
      "toYear": 1950,
      "label": "19th–20th century"
    },
    "stories": [
      {
        "heading": "The Peshwa Capital",
        "narration": "...",
        "relevance": "The Shaniwar Wada is a short walk from here.",
        "confidence": "high",
        "claims": [
          {
            "claim": "Shaniwar Wada was completed in 1732.",
            "sourceIds": ["src_a1b2c3d4"]
          }
        ]
      }
    ],
    "nearbyPlaces": [
      {
        "name": "Shaniwar Wada",
        "reasonRelevant": "Peshwa-era fortification",
        "distanceMeters": 480
      }
    ],
    "sources": [
      {
        "id": "src_a1b2c3d4",
        "title": "Shaniwar Wada — Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Shaniwar_Wada",
        "publisher": "en.wikipedia.org"
      }
    ],
    "caveats": []
  },
  "meta": { "toolCallCount": 3, "cached": false }
}
```

## Endpoints

| Method | Path                       | Purpose                                 |
| ------ | -------------------------- | --------------------------------------- |
| POST   | `/api/v1/history`          | Main agentic history request            |
| POST   | `/api/v1/location/resolve` | Resolve coordinates (debug / future UI) |
| GET    | `/health`                  | Liveness check                          |
| GET    | `/ready`                   | Readiness check                         |

## Design notes

- **The agent owns reasoning; tools own the facts; the API owns the contract.**
- The research loop is bounded by `AGENT_MAX_TOOL_CALLS`. Once the budget is exhausted,
  the agent is moved straight to synthesis.
- Synthesis uses `withStructuredOutput` against the Zod `HistoryResult` schema. If that
  fails, the backend asks for raw JSON and parses/validates once before failing closed.
- Every source ID emitted by the model is checked against the IDs actually returned by
  the tools. Fabricated sources and claim citations are stripped before the response
  is returned.
- Retrieved web content is treated as data, never as instructions; the system prompt
  explicitly forbids following instructions found in retrieved pages.
- Exact coordinates are never logged. The logger redacts `location.latitude` and
  `location.longitude` by default; only rounded values appear in run summaries.
- Provider-specific code (LLM, geocoder, search) sits behind adapters, so swapping a
  vendor does not touch domain logic.

## Testing

```bash
npm test
```

Unit tests cover coordinate validation and distance math. Integration tests exercise
`POST /api/v1/history` with mocked geocoder, cache, and agent, and assert the response
envelope.

## Project layout

See `src/` for routes, controllers, services, providers, agent, and schemas.
