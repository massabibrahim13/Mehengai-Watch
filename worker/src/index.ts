// Mehngai Watch chat — Cloudflare Worker.
//
// One job: when the website's rules can't understand a question, read it into a structured query
// {item_ids, city, week, since, intent} with Gemini. It never answers the question and never returns
// free text: the browser computes the answer from PBS data. The Gemini key lives here as a secret,
// so it never reaches the browser.
//
// Safety: only our website may call it (CORS), questions are at most 300 characters, everything the
// model returns is checked against the real item and city lists, and daily limits (per visitor and
// overall) keep us inside Gemini's free tier.
import PROMPT from "./parse_question.txt";

export interface Env {
  LIMITS: KVNamespace;
  LLM_API_KEY: string;
  ALLOWED_ORIGINS: string;
  SITE_DATA: string;
  MODEL: string;
  PER_VISITOR_DAILY: string;
  GLOBAL_DAILY: string;
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

/** Count one AI reading against the daily limits; false if a limit is already reached. */
async function takeQuota(env: Env, ip: string): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10);
  const visitor = await sha256(`${ip}|${day}`); // a hash, so no IP address is stored
  const gKey = `g:${day}`, vKey = `v:${day}:${visitor}`;
  const [g, v] = await Promise.all([env.LIMITS.get(gKey), env.LIMITS.get(vKey)]);
  const used = { all: Number(g ?? 0), visitor: Number(v ?? 0) };
  if (used.all >= Number(env.GLOBAL_DAILY) || used.visitor >= Number(env.PER_VISITOR_DAILY)) return false;
  await Promise.all([
    env.LIMITS.put(gKey, String(used.all + 1), { expirationTtl: 2 * 86_400 }),
    env.LIMITS.put(vKey, String(used.visitor + 1), { expirationTtl: 2 * 86_400 }),
  ]);
  return true;
}

/** Gemini call with one retry when it is briefly overloaded (HTTP 429/503), and a hard time limit so the chat never
 *  hangs: on timeout the browser simply shows the rules-based answer. */
async function gemini(env: Env, prompt: string): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${env.MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.LLM_API_KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json" } }),
      signal: AbortSignal.timeout(12_000),
    });
    if ((res.status === 429 || res.status === 503) && attempt === 0) {
      await new Promise((r) => setTimeout(r, 1_500));
      continue;
    }
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`); // the key is never part of an error message
    const out = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return out.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  }
  throw new Error("Gemini busy");
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

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get("Origin") ?? "";
    const allowed = env.ALLOWED_ORIGINS.split(",").includes(origin);
    const cors: Record<string, string> = allowed
      ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400", Vary: "Origin" }
      : {};
    if (req.method === "OPTIONS") return new Response(null, { status: allowed ? 204 : 403, headers: cors });
    if (new URL(req.url).pathname !== "/parse" || req.method !== "POST") return json({ error: "not found" }, 404, cors);
    if (!allowed) return json({ error: "origin not allowed" }, 403, cors);

    let question = "";
    try {
      const body = await req.json() as { question?: unknown };
      question = typeof body.question === "string" ? body.question.trim() : "";
    } catch {
      return json({ error: "send JSON: {\"question\": \"...\"}" }, 400, cors);
    }
    if (!question || question.length > MAX_QUESTION) return json({ error: `question must be 1–${MAX_QUESTION} characters` }, 400, cors);

    if (!(await takeQuota(env, req.headers.get("CF-Connecting-IP") ?? "unknown"))) return json({ limited: true }, 429, cors);
    try {
      return json(await readQuestion(env, question), 200, cors);
    } catch (err) {
      console.log("parse failed:", (err as Error).message);
      return json({ error: "the AI is unavailable right now" }, 502, cors);
    }
  },
};
