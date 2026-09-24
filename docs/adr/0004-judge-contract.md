# 4. Define one judge contract over TypeSafe and LLM backends

Date: 2026-09-24. Status: accepted.

## Context

The PRD specifies `judge(state, questions) -> answers[{ value, probabilities, confidence }]` with TypeSafe Jev as the default backend and an OpenAI-compatible LLM as the fallback. Research on 2026-09-24 against the TypeSafe docs found these facts.

- The SDK is `@typesafe-ai/sdk`. A call is `client.systemOne({ state, questions, model })`, which posts to `https://api.typesafe.ai/v1/systemone`. It reads `TYPESAFE_API_KEY`. [SDK](https://docs.typesafe.ai/sdk/javascript.md), [API](https://docs.typesafe.ai/api.md)
- Choice and Score answers return probabilities and a confidence. A Noul returns only P(yes), with no confidence field. [Primitives](https://docs.typesafe.ai/primitives.md)
- One request carries one state and any number of questions, evaluated in parallel at almost no extra latency. State is capped at 32k tokens. A Choice allows at most 255 options. [Models](https://docs.typesafe.ai/models.md)
- `jev-1.13.0` is current, and `jev-latest` aliases it. Pricing is $0.042 per million input tokens, and the limit is 1,200 requests per minute. The docs say both can change without notice. There is no sandbox, so every live call is billed. [Models](https://docs.typesafe.ai/models.md)
- The hierarchical classification cookbook uses a beam of three with no "none of these" option. [Cookbook](https://docs.typesafe.ai/cookbooks/hierarchical_classification.md)

## Decision

- `src/judge/types.ts` defines the contract. Each answer stores backend, model version, and pack version.
- Each question type has an adapter. The Noul adapter derives confidence from the distance of P(yes) to 0.5. The pack's `detect: 0.6` threshold reads as P(yes).
- Send every question for one item in a single request. Chunk items whose state passes 32k tokens. Walk the opportunity tree one level per request so no Choice passes 255 options.
- Keep the PRD's beam of two plus a "none" option. Treat it as uncalibrated until triage labels exist.
- Three backends: `recorded` for tests and development, `jev`, and `llm`. Unit tests of the Jev backend use the SDK's `fetch` override.
- Read the rate limit from config, defaulting to 1,200 requests per minute. Retry 429 and 529 with backoff.

## Consequences

- Tests and development cost nothing and give the same answers every run.
- Swapping or adding a backend touches `src/judge/backends/` only.
- Placement accuracy is unknown until the first Jev run and the first triage labels. The Jev backend slice reports Jev and LLM agreement on 200 items as the first data point.
