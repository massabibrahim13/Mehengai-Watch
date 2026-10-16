# Chat Worker (Cloudflare, free plan)

The website's "Ask about prices" chat answers from PBS data in the browser (`web/src/lib/ask.ts`). When its simple
rules can't tell which item a question is about, it calls this Worker, which asks Gemini to read the question into
fields — `{item_ids, city, week, since, intent}` — using the same prompt as the Python version
(`src/parse_question.txt`, kept identical by `tests/test_v2.py`). The Worker never returns free text and the AI
never writes a number. It exists so the Gemini key stays secret.

Safety: only the site may call it (CORS), questions ≤ 300 characters, every field checked against the real item and
city lists, and daily limits in Workers KV (3 AI readings per visitor, 15 overall — Gemini's free tier is 20/day).
If `gemini-3.8-flash` is overloaded (HTTP 503/429) it falls back to `gemini-3.5-flash-lite`; only successful readings
count towards the limits.

## Deploy (once)

```bash
cd worker
npm install
npx wrangler login                         # approve in the browser
npx wrangler kv namespace create LIMITS    # put the printed id into wrangler.toml
npx wrangler secret put LLM_API_KEY        # the Gemini key — typed into this prompt, never into a file
npx wrangler deploy                        # prints the Worker's address
```

Then add that address as the GitHub repository **variable** `VITE_CHAT_URL` (Settings → Secrets and variables →
Actions → Variables) and re-run the "Update and publish" workflow. Without it the site simply has no chat button.

Local test: `npx wrangler dev --local` with the key in `.dev.vars` (gitignored).
