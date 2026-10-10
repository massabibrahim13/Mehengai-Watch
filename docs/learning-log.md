# Learning log

One short entry per working session: what was built, the key concept, what's next.

---

## 2026-10-10 — Phase 0: setup & data reconnaissance

**Built**
- Git repo, `.venv` (Python 3.13), `.gitignore`, `requirements.txt`, `.env.example`, folder skeleton.
- Downloaded 4 sample weeks (2019, 2022, 2024, 2026) into `data/raw/samples/` and inspected them with pdfplumber.
- Recorded scope, data-source and layout findings in `docs/decisions.md`.

**Key concepts**
- *Read the source critically before coding.* The URL in our plan was already dead: PBS moved to a new
  website, and only July 2023+ is still live. The older archive survives on the Wayback Machine.
- *A website's API can be a better index than its pages.* The new PBS site runs on WordPress, so its media API
  lists every uploaded file. That beats scraping HTML.
- *A garbled PDF can still have clean numbers.* Long item names spill into neighbouring cells in one table,
  but the city-wise table (Appendix-A) keeps prices clean and in a fixed order. So we parse that one.

**Next**
- Phase 1: `fetch.py` (PBS media API + Wayback CDX → `data/raw/`), then `parse.py` on Appendix-A, starting with
  the 06-06-2024 report (test: onions = 133.93).

## 2026-10-10 — Phase 1: ingestion

**Built** `fetch.py` (PBS media API + Wayback CDX → 378 annex PDFs since 2019, manifest with sha256) and
`parse.py` (Appendix-A → long CSV per report). Tests check filenames and the 06-06-2024 values (onions 133.93).

**Key concepts**
- *Idempotent downloads:* a manifest of what we have means re-running never re-downloads.
- *Check that a file is complete, not just present:* 11 archive copies were silently cut at 1 MB. A PDF must end
  with `%%EOF`.
- *Trust the document over its label:* two filenames had the wrong date; the date printed inside the PDF was right.

## 2026-10-10 — Phase 2: clean, validate, store

**Built** `items.yaml` (8 items by SL number), `normalize.py`, `validate.py` (5 rules + rejected-rows log),
`db.py` (SQLite: reports, items, prices, rejected_rows). 354 complete weekly series per item, no duplicates.

**Key concepts**
- *Primary key = the database refuses duplicates.* Foreign key = refuses a price for a week we have no report for
  (it caught the wrong-date files).
- *Transactions:* the whole load commits or none of it does.
- *Validation protects detection:* a misread number would look exactly like a price spike.
- *SQLite quirk:* NULL in a primary key isn't treated as equal to another NULL, so national = `'National'`.

**Next** Phase 3: exploration notebook — price history charts with Ramazan marked, volatile vs sticky items,
weekly % change distributions; start `known_events.csv` from news.

## 2026-10-10 — Phase 3: exploration

**Built** `notebooks/01_explore.ipynb` (price history with Ramazan bands and documented shocks, volatility
ranking, change distributions, Ramazan heatmap, biggest moves) and `data/known_events.csv` (8 sourced events).

**Key concepts**
- *Median absolute change* = "how much does this item normally move in a week", robust to outliers.
- *Long tails / skew:* a few huge weeks dominate the mean and std, which is why we'll use median and MAD.
- *Seasonality on two calendars:* vegetables follow the solar year (harvests), Ramazan/Eid follow the lunar one.
- *Spike vs step:* a spike reverts; a step becomes the new normal.

**Next** Phase 4: L0 baseline (fixed threshold) → L1 rolling robust z-score → L2 relative-to-basket → L3 seasonal +
Ramazan-aware, with a no-look-ahead backtest against `known_events.csv`.

## 2026-10-10 — Phase 4: detection + evaluation

**Built** `detect/`: L0 fixed threshold, L1 rolling robust z, L2 relative-to-basket, L3 STL + Ramazan, and
`evaluate.py`, a backtest (recall, alerts/week, event precision, recall at a fixed alert budget) that writes all
flags to the `anomalies` table. Added a `basket` table (trimmed-mean weekly change of all 51 items). 15 detector
tests, including no-look-ahead.

**Result** L1 with a 52-week window is the production detector: same recall as L0 (0.75) with 60% fewer alerts;
13/14 spot-checked alerts were real news-reported moves. L2 and L3 didn't beat L1, so they're not kept.

**Key concepts**
- *Backtesting without look-ahead:* score week t using only data up to t. Tested by changing the future and
  checking that past scores don't move.
- *Fair comparison:* give every method the same alert budget, then compare recall.
- *A metric can be flattered by noise:* L0's recall looked fine because it fires on tomatoes every other week.
  The alert distribution and precision exposed it.
- *More complex isn't automatically better:* STL needs many years to separate seasons from one-off steps; with
  5 years it hurt.
- *Negative results are results:* "L2/L3 didn't help, and here's why" is a valid, defensible conclusion.
- *Tests find real bugs:* the "flat series" test exposed that one missing value blanked a whole year of scores.

**Next** Phase 5: explanation layer — facts JSON per anomaly, prompt file, Gemini call, number-check guardrail,
template fallback.

## 2026-10-10 — Phase 5: explanation layer

**Built** `explain/`: `facts.py` (facts JSON per anomaly), `prompts/explain_anomaly.txt`, `llm.py` (Gemini REST call,
rate-limit retries), `guardrails.py` (number + wording checks, template fallback), `__main__.py` (retry once →
fallback, cached in the `explanations` table). 19 tests, no network needed (the LLM is faked in tests).

**Result** 10/10 historical anomalies got an LLM explanation that passed every check first time. This week's alert:
wheat flour +5.7% (Rs 2,851.04 per 20 kg bag), about 6.3 times its typical weekly change.

**Key concepts**
- *Grounding:* the model may only use facts we hand it, and code checks every number afterwards.
- *Separation of duties:* statistics decide what's unusual; the LLM only phrases it.
- *Guardrail → retry → fallback:* never show unchecked LLM output; the report still works if the API is down.
- *Secrets:* the key lives in `.env` (gitignored), is read at call time and never logged.
- *Testing an LLM feature without the LLM:* swap the call for a fake (monkeypatch) and test our logic.

**Next** Phase 6: weekly report generator, Streamlit dashboard, `pipeline.py` single command, README.

## 2026-10-10 — Phase 6: report, dashboard, pipeline, README

**Built** `report/weekly_report.py` (+ `charts.py`), `app/dashboard.py` (Streamlit), `detect/run.py` (production
detector only), `pipeline.py` (stages 1→7, one command), README with screenshots and the evaluation table.
Each stage now has a callable `run()` and a thin `main()`.

**Result** `python -m mehngai.pipeline` rebuilds the DB and writes `reports/2026-10-08.md` (wheat flour +5.7%, notable).
Dashboard runs locally. 70 tests pass.

**Key concepts**
- *Separate "what a stage does" from "how it's called":* a `run()` function for code, `main()` for the command line.
- *Caching makes pipelines cheap to re-run:* downloads, parsed CSVs and LLM answers are reused; only new work runs.
- *Degrade gracefully:* no Wayback → live site only; no LLM quota → template sentence. The report always appears.
- *Streamlit:* a script that re-runs top to bottom on every click; `@st.cache_data` stops repeated DB reads.
- *Test the UI without a browser:* Streamlit's `AppTest` runs the page and reports exceptions.

**Next** Phase 7 (bonus): GitHub Actions weekly cron that runs the pipeline and commits the new report.
