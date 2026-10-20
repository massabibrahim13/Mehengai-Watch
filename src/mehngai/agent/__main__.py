"""Ask the price agent a question from the command line:

    python -m mehngai.agent "is the chana daal price rise this week normal?"

Prints the answer, then how it was made (tools used, model turns) and whether LangSmith recorded it.
Each question costs about 2–3 Gemini requests (free tier: ~20 a day per model).
"""
from __future__ import annotations

import argparse
import logging
import os
import sys

from langsmith.run_trees import get_cached_client

from mehngai.agent.agent import ask


def main() -> None:
    parser = argparse.ArgumentParser(description="Ask Mehngai Watch's price agent a question.")
    parser.add_argument("question", nargs="+", help="the question, in plain words")
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")       # Urdu, "Rs", arrows on a Windows console
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(message)s")

    reply = ask(" ".join(args.question))
    print(reply.text, end="\n\n")
    used = ", ".join(f"{c['name']}({', '.join(f'{k}={v}' for k, v in c['args'].items())})" for c in reply.tool_calls)
    print(f"[{reply.source} · {reply.model_turns} model turns · tools: {used or 'none'}]")
    if reply.rewritten_because:
        print(f"[first answer rewritten because: {'; '.join(reply.rewritten_because)}]")
    if reply.problems:
        print(f"[the AI's answer wasn't used: {'; '.join(reply.problems)}]")
    if os.getenv("LANGSMITH_TRACING", "").lower() == "true" and os.getenv("LANGSMITH_API_KEY"):
        get_cached_client().flush()          # traces upload in the background: send them before we exit
        print(f"[LangSmith: recorded in project '{os.getenv('LANGSMITH_PROJECT', 'default')}']")
    else:
        print("[LangSmith: off. Add LANGSMITH_TRACING=true and LANGSMITH_API_KEY to .env to record runs]")


if __name__ == "__main__":
    main()
