# Chat Worker (Cloudflare, free plan)

The website's "Ask about prices" chat answers short lookups itself, in the browser (`web/src/lib/ask.ts`). This
Worker holds the Gemini key, so it never reaches the browser, and does the two jobs that need the AI:

**`POST /agent`: the price agent** (`src/agent.ts`). For questions that want an explanation ("why", "is this
normal", long questions, or ones the rules can't read). Gemini gets the brief and the tool declarations, asks for
tools, and reads the answers. Those answers come from files the Python export precomputed with the same tools
(`web/public/data/agent/`, made by `src/mehngai/agent/publish.py`), so every number is one the Python code
computed. Then the guardrail (`src/guard.ts`, a copy of the Python check, kept in step by `tests/test_agent.py`):
every number must come from a tool result, no causes or blame, ≤ 250 words. A failing answer is rewritten once;
if it still fails, the Worker returns `{fallback: true}` and the browser shows its plain answer.
Replies: `{answer, tools, turns}` · `{fallback: true}` · `429 {limited: true}` · `502` when Gemini is unavailable.

**`POST /parse`: read a question into fields** `{item_ids, city, week, since, intent}` with the same prompt as the
Python version (`src/parse_question.txt`, kept identical by `tests/test_v2.py`); the browser then answers from PBS
data. Used when the agent can't help (today's agent limit reached or its answer failed the check).

Safety: only the site may call it (CORS), questions ≤ 300 characters, every tool request and field checked against
the real item and city lists, and daily limits in Workers KV, kept separately per endpoint:

| Endpoint | Per visitor | Overall | Why |
|---|---|---|---|
| `/agent` | 2 | 6 | 1–4 Gemini requests per answer; the free tier is ~20 a day per model |
| `/parse` | 3 | 15 | 1 request each |

Visitors are counted by a hash of their IP address (no address is stored). Only answers the AI actually produced
count, so an overloaded model doesn't use anyone's tries. If `gemini-3.8-flash` is busy (HTTP 503/429) or slow,
the Worker switches to `gemini-3.5-flash-lite` and stays on it for the rest of the question. Visitors' questions
are not sent to LangSmith (the Python agent is where tracing and experiments happen; see `docs/langsmith.md`).

## Deploy

```bash
cd worker
npm install
npx wrangler login                         # once; approve in the browser (the project's own Cloudflare account)
npx wrangler kv namespace create LIMITS    # once; put the printed id into wrangler.toml
npx wrangler secret put LLM_API_KEY        # once; the Gemini key, typed into this prompt, never into a file
npx wrangler deploy                        # after every change to src/ or wrangler.toml
```

Then add the Worker's address as the GitHub repository **variable** `VITE_CHAT_URL` (Settings → Secrets and
variables → Actions → Variables) and re-run the "Update and publish" workflow. Without it the chat answers from the
rules only.

Local test: `npx wrangler dev --local` with the key in `.dev.vars` (gitignored). The agent reads its files from the
live site (`SITE_DATA`), so publish the site first. Guardrail check: `npm test` reads cases as JSON on stdin (see
`tests/test_agent.py`).
