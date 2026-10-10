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
