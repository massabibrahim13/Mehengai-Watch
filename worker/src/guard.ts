// The guardrail for the price agent's answers: a copy of check() in src/mehngai/agent/agent.py.
// tests/test_agent.py runs both on the same answers and requires the same verdicts, so they stay in step.
// An answer may only use numbers found in the tool results, the question, or the brief's own facts
// (rounding allowed); no causes or blame (quoting a headline is fine); not too long.

export interface GuardSetup {
  banned_phrases: string[];
  max_words: number;
  guard_context: Record<string, unknown>; // the brief's facts: 51 items, 17 cities, item names and units…
}

const NUMBER = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g; // 2,586.37 · 2586.37 · 22 · 4.4

export const numbersIn = (text: string): number[] =>
  (text.match(NUMBER) ?? []).map((n) => Number(n.replaceAll(",", "")));

/** x rounded to d decimals both ways: halves up (JavaScript) and halves to even (Python). Only exact halves differ. */
function roundings(x: number, d: number): number[] {
  const m = 10 ** d, v = x * m, f = Math.floor(v);
  const even = Math.abs(v - f - 0.5) < 1e-9 ? (f % 2 === 0 ? f : f + 1) : Math.round(v);
  return [Math.round(v) / m, even / m];
}

function allowedNumbers(known: unknown): Set<number> {
  const allowed = new Set<number>();
  for (const n of numbersIn(JSON.stringify(known))) {
    for (const d of [2, 1, 0]) for (const r of roundings(n, d)) allowed.add(r);
  }
  return allowed;
}

/** Problems with an answer (empty = it may be shown). */
export function check(text: string, results: unknown[], question: string, setup: GuardSetup): string[] {
  const allowed = allowedNumbers({ tools: results, question, ...setup.guard_context });
  const problems: string[] = [];
  const invented = [...new Set(numbersIn(text).filter((n) => !roundings(n, 2).some((r) => allowed.has(r))))];
  if (invented.length) problems.push(`numbers that are not in the tool results: [${invented.sort((a, b) => a - b).join(", ")}]`);
  let plain = text;
  for (const r of results as { headlines?: { title: string }[] }[]) {
    for (const h of r?.headlines ?? []) plain = plain.split(h.title).join(""); // quoting a headline is fine
  }
  const low = plain.toLowerCase();
  const hits = setup.banned_phrases.filter((p) => low.includes(p));
  if (hits.length) problems.push(`states a cause or blames someone: [${hits.join(", ")}]`);
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words > setup.max_words) problems.push(`too long (${words} words, at most ${setup.max_words})`);
  return problems;
}
