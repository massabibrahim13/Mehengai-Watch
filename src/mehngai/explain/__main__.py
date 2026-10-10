"""Command line for the explanation layer.

  python -m mehngai.explain                     # the latest report week's anomalies (may be none)
  python -m mehngai.explain --week 2023-03-22   # one specific week
  python -m mehngai.explain --sample 10         # a spread of historical anomalies (Phase 5 check)
"""
import argparse
import logging

from mehngai.explain.run import run

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description="Explain detected anomalies in plain language.")
    parser.add_argument("--week", help="YYYY-MM-DD (default: the latest report week)")
    parser.add_argument("--sample", type=int, help="explain N varied historical anomalies instead")
    parser.add_argument("--force", action="store_true", help="ignore the cache and regenerate")
    args = parser.parse_args()
    for r in run(args.week, args.sample, args.force):
        print(f"[{r['week_date']}] {r['item_id']} ({r['severity']}, {r['direction']}) - {r['source']}")
        print(f"  {r['text']}")
