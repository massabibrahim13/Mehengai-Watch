# The price agent and LangSmith

The price agent (`src/mehngai/agent/`) answers questions about prices with explanations, not one-line lookups.
LangSmith is where you watch it work, test it on a fixed set of questions, and see whether a change made it better.

## How the agent works

```
question ─► Gemini + brief (prompts/system.txt) + 5 data tools
              │  "I need chana daal's overview"            ─► item_overview(pulse_gram) ─► exact facts
              │  (more tool calls if needed, max 4 turns)
              ▼
            answer ─► guardrail: every number from a tool result? no causes or blame? ≤ 250 words?
              │ fails → rewrite once → fails again → plain rules answer (ask.py)
              ▼
            shown
```

- **The math still decides the facts.** The tools compute every number (prices, % changes, "9.4 times its
  typical weekly move", city gaps). The model chooses which facts matter and explains them.
- **Tools** (`tools.py`): `item_overview`, `price_history`, `compare_cities`, `this_week`, `price_news`.
- **Guardrail** (`agent.check`): same idea as the weekly explanations, now checked against tool results.

Try it: `python -m mehngai.agent "is the chana daal price rise this week normal?"`

## Connect LangSmith (once, about 5 minutes)

1. Sign up at https://smith.langchain.com. The free **Developer** plan is enough (5,000 traces a month). Don't add a
   card: without one, LangSmith stops at the free limit instead of charging.
2. Settings → API Keys → **Create API Key** (a personal key is fine). Copy it.
3. Add these lines to `.env` (never commit it, and don't paste the key into a chat):
   ```
   LANGSMITH_TRACING=true
   LANGSMITH_API_KEY=<your key>
   LANGSMITH_PROJECT=mehngai-watch
   ```
   For an EU account, also `LANGSMITH_ENDPOINT=https://eu.api.smith.langchain.com`.
4. Ask the agent a question. The last line should say `LangSmith: recorded in project 'mehngai-watch'`.
5. In LangSmith, open **Tracing projects → mehngai-watch**: your question is there.

How it's wired: functions in `agent.py` carry `@traceable` (a decorator, like a Java annotation that wraps a
method with logging). Each one becomes a step in the trace. With no key, the decorators do nothing.

## What a trace shows

Click a run in the project. On the left is a tree of steps:

| Step | What you see |
|---|---|
| **Mehngai Watch agent** | The question in, the final reply out (answer, source, tools used) |
| **Gemini** (one per model turn) | The full conversation sent, the model's reply (a tool request or the answer), its reasoning summary if the model gives one, token counts, which model answered (the backup when the main one is busy) |
| **item_overview**, **price_history**, … | The arguments the model chose and the exact facts returned |
| **guardrail** | The answer checked, and the problems found (empty list = passed) |

Things to look for: did it call the right tools? Did it fetch everything in one turn or take several? When the
guardrail rejected an answer, which number was invented? Where did the time go: the model or the tools?

## Evaluate: a test set of questions

`python -m mehngai.agent.evaluate` creates a **dataset** (`mehngai-agent-questions`, 7 questions with the items
each must look up) on first use, then runs an **experiment**: the agent answers every question and code
**evaluators** score each answer:

| Evaluator | Passes when |
|---|---|
| `answered_by_ai` | the agent's own answer was used, not the rules fallback |
| `passed_first_time` | no rewrite was needed |
| `looked_up_right_items` | it fetched data for every item in the question |
| `explained` | at least 50 words |
| `model_turns` | (a number) Gemini requests used: lower is cheaper and faster |

Open **Datasets & Experiments → mehngai-agent-questions** to see each experiment's scores. Select two experiments
to compare them question by question. The loop: change the brief (`prompts/system.txt`) or a tool, run
`python -m mehngai.agent.evaluate --name brief-v2`, compare with the previous experiment, keep what's better.

**Budget:** an experiment uses about 15–20 Gemini requests. The free tier gives about 20 a day per model (the agent
switches to the backup model when one runs out), so run one or two experiments a day.

## Next things to learn in LangSmith

- **Human feedback:** score answers yourself (thumbs up or down, with a note) in a trace or an annotation
  queue. It's the best check of "is this answer actually helpful?"
- **Add examples from real runs:** a bad answer in a trace → "Add to dataset", so the test set grows with real
  problems.
- **LLM-as-judge evaluators:** a model grades helpfulness. That costs extra AI requests, so add it only when the
  code checks stop being enough.
- **Playground:** re-run one model call with an edited prompt. This needs a model key stored in LangSmith; decide
  whether you want your Gemini key there first.
- **Studio:** a visual debugger for agents built with LangGraph. Ours is plain Python, so Studio would mean
  rewriting the loop in LangGraph. That's a later choice, not needed to learn tracing and evaluation.
