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
