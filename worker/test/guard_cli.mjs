// Runs the Worker's guardrail (src/guard.ts) on cases read from stdin, so tests/test_agent.py can check that it
// gives the same verdicts as the Python one. Node runs the TypeScript directly (type stripping).
import { check } from "../src/guard.ts";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const { setup, cases } = JSON.parse(input);
console.log(JSON.stringify(cases.map((c) => check(c.text, c.results, c.question, setup))));
