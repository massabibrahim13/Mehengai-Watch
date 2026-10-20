// The price agent, as it runs for the website: the same loop as ask() in src/mehngai/agent/agent.py.
// Gemini gets the brief and the tool declarations (both published by the Python export in agent/setup.json),
// asks for tools, and we answer from the precomputed tool results (agent/items/<id>.json and friends), so every
// number is one the Python tools computed. Then the guardrail; one rewrite; otherwise the browser shows its own
// plain answer.
import { check, type GuardSetup } from "./guard";

export interface Setup extends GuardSetup {
  latest_week: string;
  brief: string;
  tools: unknown[];
  max_steps: number;
  temperature: number;
}

interface Call { name: string; args?: Record<string, unknown>; id?: string }
interface Part { text?: string; thought?: boolean; functionCall?: Call }
export interface Content { role: string; parts: Part[] }

export interface Deps {
  setup: Setup;
  tool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  model: (body: unknown) => Promise<Content>;   // one model turn; throws when Gemini is unavailable
}

export interface Result {
  answer?: string;          // set only if it passed the guardrail
  problems: string[];       // why not (empty if it passed)
  tools: string[];          // tools called, in order
  turns: number;            // model turns used
  rewritten: boolean;
}

const REWRITE = "Your answer broke these rules: {problems}. Rewrite it. Use only numbers that appear in the tool " +
  "results, copied as they are (don't calculate new ones), don't state causes or blame anyone, and stay under " +
  "{max_words} words.";

/** Model turns and tool calls until the model answers in words (on the last turn tools are switched off). */
async function converse(contents: Content[], maxSteps: number, deps: Deps, out: Result, results: unknown[]): Promise<string> {
  const { setup } = deps;
  for (let step = 0; step < maxSteps; step++) {
    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: setup.brief }] }, contents,
      tools: [{ functionDeclarations: setup.tools }], generationConfig: { temperature: setup.temperature },
    };
    if (step === maxSteps - 1) body.toolConfig = { functionCallingConfig: { mode: "NONE" } };
    const content = await deps.model(body);
    out.turns++;
    contents.push(content);
    const calls = content.parts.filter((p) => p.functionCall).map((p) => p.functionCall!);
    if (!calls.length) {
      const text = content.parts.filter((p) => !p.thought).map((p) => p.text ?? "").join("").trim();
      if (!text) throw new Error("no answer");
      return text;
    }
    const answers = [];
    for (const call of calls) {
      const result = await deps.tool(call.name, call.args ?? {});
      out.tools.push(call.name);
      results.push(result);
      answers.push({ functionResponse: { name: call.name, response: result, ...(call.id ? { id: call.id } : {}) } });
    }
    contents.push({ role: "user", parts: answers as Part[] });
  }
  throw new Error(`no answer after ${maxSteps} model turns`);
}

export async function runAgent(question: string, deps: Deps): Promise<Result> {
  const out: Result = { problems: [], tools: [], turns: 0, rewritten: false };
  const contents: Content[] = [{ role: "user", parts: [{ text: question }] }];
  const results: unknown[] = [];
  let text = await converse(contents, deps.setup.max_steps, deps, out, results);
  let problems = check(text, results, question, deps.setup);
  if (problems.length) {
    contents.push({ role: "user", parts: [{ text: REWRITE.replace("{problems}", problems.join("; "))
      .replace("{max_words}", String(deps.setup.max_words)) }] });
    text = await converse(contents, 2, deps, out, results);     // one more look-up at most
    problems = check(text, results, question, deps.setup);
    out.rewritten = true;
  }
  if (problems.length) out.problems = problems;
  else out.answer = text;
  return out;
}
