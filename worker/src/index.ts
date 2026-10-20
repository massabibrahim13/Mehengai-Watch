// Mehngai Watch chat — Cloudflare Worker. The Gemini key lives here as a secret, so it never reaches the browser.
//
// Two endpoints:
//   POST /agent  the price agent (agent.ts): explains a price question from PBS data. Gemini picks tools, the
//                answers come from files the Python export precomputed, and the guardrail checks every number.
//   POST /parse  reads a question the browser's rules can't understand into {item_ids, city, week, since,
//                intent}; the browser then answers from PBS data itself. Used when the agent can't help.
//
// Safety: only our website may call it (CORS), questions are at most 300 characters, everything the model asks
// for or returns is checked, and daily limits (per visitor and overall) keep us inside Gemini's free tier.
import { runAgent, type Content, type Setup } from "./agent";
import PROMPT from "./parse_question.txt";

export interface Env {
  LIMITS: KVNamespace;
  LLM_API_KEY: string;
  ALLOWED_ORIGINS: string;
  SITE_DATA: string;
  MODEL: string;
  FALLBACK_MODEL: string;
  PER_VISITOR_DAILY: string;
  GLOBAL_DAILY: string;
  AGENT_PER_VISITOR_DAILY: string;
  AGENT_GLOBAL_DAILY: string;
}

interface Item { item_id: string; name: string; aliases?: string[] }
const INTENTS = ["price", "change", "cheapest", "priciest", "cities"];
const MAX_QUESTION = 300;

const json = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The site's own data files: kept in memory for 10 minutes (a warm Worker reuses them), fetched with a time limit. */
const cache = new Map<string, { at: number; data: unknown }>();
async function siteJSON<T>(env: Env, file: string): Promise<T> {
  const hit = cache.get(file);
  if (hit && Date.now() - hit.at < 600_000) return hit.data as T;
  const res = await fetch(env.SITE_DATA + file, { signal: AbortSignal.timeout(6_000) });
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  const data = await res.json();
  cache.set(file, { at: Date.now(), data });
  return data as T;
}

/** The daily limits, kept separately for each endpoint ("" = /parse, "a:" = /agent). Only answers the AI actually
 *  produced are counted, so an overloaded model doesn't use up anyone's tries. */
async function quota(env: Env, ip: string, prefix: "" | "a:", perVisitor: string, overall: string) {
  const day = new Date().toISOString().slice(0, 10);
  const visitor = await sha256(`${ip}|${day}`); // a hash, so no IP address is stored
  const gKey = `${prefix}g:${day}`, vKey = `${prefix}v:${day}:${visitor}`;
  const [g, v] = await Promise.all([env.LIMITS.get(gKey), env.LIMITS.get(vKey)]);
  const used = { all: Number(g ?? 0), visitor: Number(v ?? 0) };
  return {
    allowed: used.all < Number(overall) && used.visitor < Number(perVisitor),
    count: () => Promise.all([
      env.LIMITS.put(gKey, String(used.all + 1), { expirationTtl: 2 * 86_400 }),
      env.LIMITS.put(vKey, String(used.visitor + 1), { expirationTtl: 2 * 86_400 }),
    ]),
  };
}

/** Gemini call with a time limit so the chat never hangs. If the main model is overloaded or rate-limited
 *  (HTTP 503/429 — "high demand" happens for hours at a time), try the lighter backup model once. */
async function gemini(env: Env, prompt: string): Promise<string> {
  let last = 0;
  // main model 10 s (an overload answer comes back in ~1–4 s), backup 18 s; the browser waits up to 30 s
  for (const [model, seconds] of [[env.MODEL, 10], [env.FALLBACK_MODEL, 18]] as const) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.LLM_API_KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json" } }),
      signal: AbortSignal.timeout(seconds * 1_000),
    });
    if (res.status === 429 || res.status === 503) {
      last = res.status;
      console.log(`${model} busy (HTTP ${res.status})`);
      continue;
    }
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`); // the key is never part of an error message
    const out = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    console.log(`answered by ${model}`);
    return out.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  }
  throw new Error(`Gemini busy (HTTP ${last})`);
}

async function readQuestion(env: Env, question: string) {
  const t0 = Date.now();
  const [items, summary, cities] = await Promise.all([
    siteJSON<Item[]>(env, "items.json"),
    siteJSON<{ week: string }>(env, "summary.json"),
    siteJSON<{ cities: { name: string }[] }>(env, "cities.json"),
  ]);
  const cityNames = cities.cities.map((c) => c.name);
  const catalogue = items.map((i) => `- ${i.item_id}: ${i.name} (${(i.aliases ?? []).slice(0, 4).join(", ")})`).join("\n");
  const prompt = PROMPT.replace("{items}", catalogue).replace("{cities}", cityNames.join(", "))
    .replace("{latest}", summary.week).replace("{question}", question);

  const t1 = Date.now();
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(await gemini(env, prompt)) as Record<string, unknown>;
  } catch (err) {
    if (err instanceof SyntaxError) raw = {}; // not JSON (e.g. the model refused): treat as "no item found"
    else throw err;
  }
  console.log(`timing: site data ${t1 - t0} ms, gemini ${Date.now() - t1} ms`);

  // keep only what we recognise; the browser checks again
  const ids = new Set(items.map((i) => i.item_id));
  const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  return {
    item_ids: (Array.isArray(raw.item_ids) ? raw.item_ids : []).filter((x): x is string => typeof x === "string" && ids.has(x)).slice(0, 3),
    city: typeof raw.city === "string" && cityNames.includes(raw.city) ? raw.city : null,
    week: date(raw.week), since: date(raw.since),
    intent: INTENTS.includes(raw.intent as string) ? raw.intent : "price",
  };
}

// ── the price agent ──────────────────────────────────────────────────────────────

// When the main model fails, the next questions (in this Worker instance) skip it for a while instead of waiting
// on it again: during Gemini's "high demand" spells it can fail for hours.
let mainSkippedUntil = 0;
const SKIP_MAIN_MS = 10 * 60_000;
const DEADLINE_MS = 85_000;   // the whole question; the browser gives up at 100 s

/** One model turn for the agent. Starts on the main model (unless it failed recently); if it is busy (HTTP 503/429)
 *  or slow, switches to the backup and stays there. A quick "busy" from the backup gets one more try; a hang
 *  doesn't. Everything must finish within DEADLINE_MS of the question, so the visitor always gets an answer. */
function agentModel(env: Env) {
  const deadline = Date.now() + DEADLINE_MS;
  let model = Date.now() < mainSkippedUntil ? env.FALLBACK_MODEL : env.MODEL;
  return async (body: unknown): Promise<Content> => {
    let backupTries = 0;
    for (;;) {
      const left = deadline - Date.now();
      if (left < 5_000) throw new Error("out of time");
      const ms = Math.min(model === env.MODEL ? 15_000 : 30_000, left);
      let status = 0;
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": env.LLM_API_KEY },
          body: JSON.stringify(body), signal: AbortSignal.timeout(ms),
        });
        if (res.ok) {
          const out = await res.json() as { candidates?: { content?: Content }[] };
          return out.candidates?.[0]?.content ?? { role: "model", parts: [] };
        }
        status = res.status;
      } catch (err) {
        if (!(err instanceof Error && err.name === "TimeoutError")) throw err;
      }
      if (status && status !== 429 && status !== 503) throw new Error(`Gemini HTTP ${status}`); // never includes the key
      console.log(`${model} ${status ? `busy (HTTP ${status})` : `no answer in ${Math.round(ms / 1000)}s`}`);
      if (model === env.MODEL) {
        mainSkippedUntil = Date.now() + SKIP_MAIN_MS;
        model = env.FALLBACK_MODEL;
      } else if (!status || ++backupTries >= 2) {
        throw new Error("Gemini unavailable");
      } else {
        await new Promise((resolve) => setTimeout(resolve, 3_000));
      }
    }
  };
}

const ITEM_ID = /^[a-z0-9_]{1,40}$/;
type ItemFile = { overview: Record<string, unknown>; history: Record<string, unknown>; cities: unknown; news: unknown };

/** A tool's answer, looked up in the files the Python export precomputed (same results as src/mehngai/agent/tools.py). */
async function agentTool(env: Env, setup: Setup, name: string, args: Record<string, unknown>): Promise<unknown> {
  const declared = setup.tools[0] as { parameters: { properties: { item_id: { enum: string[] } } } };
  const id = typeof args.item_id === "string" ? args.item_id : "";
  if (name === "this_week") return siteJSON(env, "agent/this_week.json");
  if (name === "price_news" && !id) return siteJSON(env, "agent/news.json");
  if (!["item_overview", "price_history", "compare_cities", "price_news"].includes(name)) {
    return { error: `there is no tool called '${name}'` };
  }
  if (!ITEM_ID.test(id) || !declared.parameters.properties.item_id.enum.includes(id)) {
    return { error: `unknown item_id '${id}'; use an id from the item list` };
  }
  const file = await siteJSON<ItemFile>(env, `agent/items/${id}.json`);
  if (name === "compare_cities") return file.cities;
  if (name === "price_news") return file.news;
  if (name === "price_history") {
    const period = typeof args.period === "string" ? args.period : "1 year";
    return file.history[period] ?? { error: `period must be one of: ${Object.keys(file.history).join(", ")}` };
  }
  const city = typeof args.city === "string" ? args.city : "National";
  const place = Object.keys(file.overview).find((p) => p.toLowerCase() === city.trim().toLowerCase());
  return place ? file.overview[place]
    : { error: `PBS has no data for that city; the 17 survey cities are: ${Object.keys(file.overview).slice(1).join(", ")}` };
}

async function answerWithAgent(env: Env, question: string) {
  const t0 = Date.now();
  const setup = await siteJSON<Setup>(env, "agent/setup.json");
  const result = await runAgent(question, {
    setup, model: agentModel(env), tool: (name, args) => agentTool(env, setup, name, args),
  });
  console.log(`agent: ${result.turns} turns, tools [${result.tools.join(", ")}], ${Date.now() - t0} ms, ` +
    (result.answer ? (result.rewritten ? "passed after a rewrite" : "passed") : `rejected: ${result.problems.join("; ")}`));
  return result;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get("Origin") ?? "";
    const allowed = env.ALLOWED_ORIGINS.split(",").includes(origin);
    const cors: Record<string, string> = allowed
      ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400", Vary: "Origin" }
      : {};
    if (req.method === "OPTIONS") return new Response(null, { status: allowed ? 204 : 403, headers: cors });
    const path = new URL(req.url).pathname;
    if (!["/parse", "/agent"].includes(path) || req.method !== "POST") return json({ error: "not found" }, 404, cors);
    if (!allowed) return json({ error: "origin not allowed" }, 403, cors);

    let question = "";
    try {
      const body = await req.json() as { question?: unknown };
      question = typeof body.question === "string" ? body.question.trim() : "";
    } catch {
      return json({ error: "send JSON: {\"question\": \"...\"}" }, 400, cors);
    }
    if (!question || question.length > MAX_QUESTION) return json({ error: `question must be 1–${MAX_QUESTION} characters` }, 400, cors);

    const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
    if (path === "/agent") {
      const limits = await quota(env, ip, "a:", env.AGENT_PER_VISITOR_DAILY, env.AGENT_GLOBAL_DAILY);
      if (!limits.allowed) return json({ limited: true }, 429, cors);
      try {
        const result = await answerWithAgent(env, question);
        await limits.count();                                     // the AI did the work, even if it was rejected
        return result.answer
          ? json({ answer: result.answer, tools: result.tools, turns: result.turns }, 200, cors)
          : json({ fallback: true }, 200, cors);                  // didn't pass the checks: the browser answers plainly
      } catch (err) {
        console.log("agent failed:", (err as Error).message);
        return json({ error: "the AI is unavailable right now" }, 502, cors);
      }
    }

    const limits = await quota(env, ip, "", env.PER_VISITOR_DAILY, env.GLOBAL_DAILY);
    if (!limits.allowed) return json({ limited: true }, 429, cors);
    try {
      const reading = await readQuestion(env, question);
      await limits.count();
      return json(reading, 200, cors);
    } catch (err) {
      console.log("parse failed:", (err as Error).message);
      return json({ error: "the AI is unavailable right now" }, 502, cors);
    }
  },
};
