"""Evaluate the price agent in LangSmith.

LangSmith words, in short:
  dataset     a fixed set of test questions (with what a good answer must include), stored in LangSmith
  experiment  one run of the agent over the whole dataset, e.g. "after the prompt change"
  evaluator   code that scores each answer (here: free checks, no extra AI calls)
Compare experiments side by side in the LangSmith UI to see whether a change made the agent better.

    python -m mehngai.agent.evaluate                    # creates the dataset the first time, then one experiment
    python -m mehngai.agent.evaluate --name prompt-v2   # label the experiment
    python -m mehngai.agent.evaluate --match petrol iphone   # only the questions containing these words

Needs LANGSMITH_API_KEY in .env. Costs about 2–3 Gemini requests per question (free tier: ~20 a day per model),
so the dataset is kept small.
"""
from __future__ import annotations

import argparse
import logging
import os
import sys

from langsmith import Client

from mehngai.agent.agent import ask, settings

DATASET = "mehngai-agent-questions"
# (question, item ids the agent must look up, what it tests)
EXAMPLES = [
    ("Is the chana daal price rise this week normal? Should I be worried?", ["pulse_gram"],
     "an unusual move explained against the item's normal range"),
    ("How has the price of sugar changed over the past year, and is it cheap now?", ["sugar"],
     "a trend over a period, with the year's low and high"),
    ("Where is wheat flour cheapest, and how big is the gap between cities?", ["wheat_flour"],
     "a city comparison"),
    ("Petrol went up again. Is that an unusual spike?", ["petrol"],
     "a government-set price, which must not be called an unusual market move"),
    ("tamatar itne mehnge kyun hain?", ["tomatoes"],
     "Roman Urdu, and a 'why' question: no invented causes"),
    ("What happened to prices this week?", [],
     "the weekly overview"),
    ("How much does an iPhone cost?", [],
     "an item PBS doesn't track"),
]


def ensure_dataset(client: Client) -> None:
    """Create the dataset in LangSmith on first use (later edits are made in the LangSmith UI)."""
    if client.has_dataset(dataset_name=DATASET):
        return
    client.create_dataset(DATASET, description="Questions for Mehngai Watch's price agent (see evaluate.py).")
    client.create_examples(dataset_name=DATASET, examples=[
        {"inputs": {"question": q}, "outputs": {"items": items}, "metadata": {"tests": note}}
        for q, items, note in EXAMPLES])


def target(inputs: dict) -> dict:
    """What LangSmith runs for each question; the returned dict is what the evaluators see."""
    reply = ask(inputs["question"])
    return {"answer": reply.text, "source": reply.source, "problems": reply.problems,
            "tools": [c["name"] for c in reply.tool_calls], "model_turns": reply.model_turns,
            "items_looked_up": sorted({c["args"]["item_id"] for c in reply.tool_calls if c["args"].get("item_id")})}


# ── evaluators: each scores one answer; LangSmith shows the score per question and the average ──

def answered_by_ai(outputs: dict) -> bool:
    """The agent's own answer was shown (not the plain rules fallback)."""
    return outputs["source"].startswith("agent")


def passed_first_time(outputs: dict) -> bool:
    """The first answer already passed the guardrail (no rewrite needed)."""
    return outputs["source"] == "agent"


def looked_up_right_items(outputs: dict, reference_outputs: dict) -> bool:
    """It fetched data for every item the question is about."""
    return set(reference_outputs["items"]) <= set(outputs["items_looked_up"])


def explained(outputs: dict) -> bool:
    """A real explanation, not a one-liner: at least 50 words."""
    return len(outputs["answer"].split()) >= 50


def model_turns(outputs: dict) -> dict:
    """Gemini requests used (cost and speed): lower is better."""
    return {"key": "model_turns", "score": outputs["model_turns"]}


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the price agent over the LangSmith test questions.")
    parser.add_argument("--name", default="agent", help="experiment name prefix shown in LangSmith")
    parser.add_argument("--match", nargs="*", default=[], help="only questions containing any of these words")
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(message)s")
    if not os.getenv("LANGSMITH_API_KEY"):
        sys.exit("LANGSMITH_API_KEY is missing: add it to .env (see .env.example)")

    client = Client()
    ensure_dataset(client)
    cfg = settings()
    data = DATASET
    if args.match:      # a few questions only, to save the free AI quota
        data = [ex for ex in client.list_examples(dataset_name=DATASET)
                if any(w.lower() in ex.inputs["question"].lower() for w in args.match)]
    results = client.evaluate(
        target, data=data, experiment_prefix=args.name, max_concurrency=0,      # one question at a time
        evaluators=[answered_by_ai, passed_first_time, looked_up_right_items, explained, model_turns],
        metadata={"model": cfg["model"], "fallback_model": cfg["fallback_model"], "max_steps": cfg["max_steps"]})
    client.flush()
    print(f"Experiment '{results.experiment_name}' done: open the dataset '{DATASET}' in LangSmith to compare.")


if __name__ == "__main__":
    main()
