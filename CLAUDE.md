# CLAUDE.md — Mehngai Watch

> Read this whole file at the start of every session. It is the source of truth for what this
> project is, how it is built, what phase we are in, and how to work with me (Massab).

---

## 1. What this project is

**Mehngai Watch** (مہنگائی = inflation) is an early-warning tool for unusual price spikes in
everyday essentials in Pakistan (flour, sugar, onions, tomatoes, chicken, etc.).

Prices rise every week in Pakistan, so "the price went up" is not news. The question this
project answers is: **"Is this week's jump *abnormal* compared to how this item normally
behaves — and if so, what is a plain-language explanation?"**

- **Data:** the Pakistan Bureau of Statistics (PBS) weekly **Sensitive Price Indicator (SPI)**
  report — free, public, published every week, archive going back to at least 2015.
  It covers 51 essential items across 17 cities.
- **Core technique:** time-series **anomaly detection** (statistics, not an LLM).
- **Supporting technique:** an LLM turns the detected anomalies into short, plain-language
  explanations. The LLM never decides *what* is anomalous — the math does.
- **Output:** a weekly report + a simple dashboard.

**Context:** This is my project for the **Edversity AI Solutions Engineers course (Cohort 1)**.
It is a course/portfolio project, credited to Edversity. It is based on idea #7 ("Market and
price monitoring agent") from the course's idea list, re-scoped to a Pakistani public-interest
problem. It is NOT connected to Brand PitStop.

### Problem statement (for the submission)
Ordinary households and small retailers in Pakistan cannot tell normal inflation apart from
abnormal spikes caused by shortages, hoarding, or seasonal gouging (e.g. before Ramazan).
The government publishes the data every week, but only as dense PDF tables that nobody reads.
Mehngai Watch turns that data into a weekly, plain-language "what's unusual this week" alert.

---

## 2. How to work with me (IMPORTANT — you build, I understand)

I want the project to **move fast**, and I want to **understand** what's being built — I don't
need to type every line myself. Follow these rules in every session:

1. **You (Claude) write the code.** Build each step yourself; don't hand me exercises or ask me
   to write parts of it.
2. **Explain as you go, briefly.** After each step, give me a short plain-language summary:
   what you built, what it does, and why it's done that way. A few sentences, not an essay.
   Point out the 1–2 lines or ideas that matter most so I know where to look.
3. **Explain new concepts once, simply.** When something new appears (a library, a statistical
   method, a pattern), explain it in plain words the first time, with a Java analogy if it
   helps. I have a Java/OOP/DSA background and know basic Python/pandas.
4. **Keep my workload minimal.** Only ask me to do things you truly can't (create an API key,
   make a GitHub repo, make a decision). Don't ask me to choose things you can sensibly decide —
   pick a reasonable default, tell me what you picked, and move on.
5. **Stay in the current phase** (see §8). Don't build later-phase features early.
6. **Don't over-engineer.** Simplest working version first; improve only if the evaluation
   (§5) shows it's needed.
7. **End each working session** by writing a short entry in `docs/learning-log.md` (what was
   built, the key concept, what's next) and updating "Current status" in §12. Do this yourself.
8. **Record decisions.** When you make a non-obvious choice (thresholds, method, item list),
   add a line to `docs/decisions.md` with the reason.
9. **Cost must be zero.** Only free tools, free APIs and free tiers. If something would cost
   money, stop and tell me.
10. **If I ask "explain this"** about any file or line, explain it simply — that's how I'll dig
    deeper when I want to.

---

## 3. Concept architecture

The system is a **pipeline**: data flows through stages, and each stage has one job.
Each stage reads from the previous stage's output and writes its own output, so any stage
can be re-run or debugged on its own.

```
                         ┌──────────────────────────────────────────┐
  PBS website            │              MEHNGAI WATCH               │
  (weekly SPI PDFs) ───► │                                          │
                         │  1. INGEST      fetch PDF links, download│
                         │       │         new reports, cache them  │
                         │       ▼                                  │
                         │  2. PARSE       PDF tables ──► raw rows  │
                         │       │                                  │
                         │       ▼                                  │
                         │  3. CLEAN &     normalise item names,    │
                         │     VALIDATE    units, dates; reject     │
                         │       │         impossible values        │
                         │       ▼                                  │
                         │  4. STORE       SQLite database          │
                         │       │         (single source of truth) │
                         │       ▼                                  │
                         │  5. DETECT      statistics: what is      │
                         │       │         abnormal this week?      │
                         │       ▼                                  │
                         │  6. EXPLAIN     LLM writes plain-language│
                         │       │         note from the numbers    │
                         │       ▼                                  │
                         │  7. REPORT      weekly report + dashboard│
                         └──────────────────────────────────────────┘
                                         ▲
                     8. SCHEDULE: GitHub Actions runs 1→7 once a week
```

### Stage by stage

**1. Ingest (`src/mehngai/ingest/fetch.py`)**
- Reads the PBS weekly SPI listing page and collects links to the PDF reports.
- PBS filenames are **inconsistent** (e.g. `SPI%20Executive%20Sumary%26SPI%20Report_06062024.pdf`
  vs `SPI_Executive_Sumary%26Report_14072022.pdf`, some under a `/2024/` subfolder, some not).
  So we **discover links from the page**, we do not guess filenames.
- Downloads only reports we don't already have (cache in `data/raw/`, tracked in the DB by
  URL + file hash). Polite: small delay between requests, never re-download.
- Output: PDF files in `data/raw/`.

**2. Parse (`src/mehngai/ingest/parse.py`)**
- Extracts the item-wise price table (Annexure-III: item, unit, price this week, last week,
  same week last year, % changes, weights) from each PDF.
- Optionally the city-wise table (Appendix-A) — **verify in Phase 0 whether it is present
  and parseable**; it is not in every report.
- Tool: `pdfplumber` first (simplest); `camelot` only if tables don't extract cleanly.
- Output: one CSV per report in `data/interim/`.
- ⚠️ PDF parsing is the most fragile part of the whole project. Layouts change across years.

**3. Clean & validate (`src/mehngai/clean/`)**
- **Normalise item names** — the same item can be spelled differently across years
  ("Bananas (Kela) Local" vs "Bananas Kela"). A mapping file `config/items.yaml` maps every
  raw name/alias to one canonical item ID.
- **Normalise units** — record the unit; if PBS changes a unit/spec for an item, treat it as a
  break in that series, not a price jump.
- **Validate** — price > 0, date parses, every tracked item present, and week-over-week change
  within a sanity bound (e.g. ±300%).
- **Key insight:** a parsing error *looks exactly like an anomaly*. Validation exists so the
  detector never "discovers" a spike that is really a misread number. Rows that fail go to a
  `rejected_rows` log for manual review, not into the database.

**4. Store (`src/mehngai/store/db.py`) — SQLite**
Why SQLite: a real SQL database in a single file, no server, free, and it teaches me SQL.
Concept schema (not final):

| Table | Purpose | Key columns |
|---|---|---|
| `reports` | one row per downloaded PDF | `report_date`, `source_url`, `file_hash`, `parsed_ok` |
| `items` | canonical item list | `item_id`, `name`, `unit`, `category`, `price_type` (market / administered) |
| `prices` | the time series | `item_id`, `week_date`, `city` (NULL = national avg), `price` |
| `anomalies` | detector output | `item_id`, `week_date`, `method`, `score`, `severity`, `direction` |
| `explanations` | LLM output | `anomaly_id`, `text`, `model`, `created_at` |

Rule: the database is the **single source of truth**. Notebooks and the dashboard read from
it; they never read PDFs or CSVs directly.

**5. Detect (`src/mehngai/detect/`) — the core of the project**
Built in layers, simplest first. Each layer must beat the previous one on the evaluation
(§5) before we keep it.

| Layer | Method | Idea in one line |
|---|---|---|
| L0 baseline | Fixed threshold on week-over-week % change | "Flag anything up more than X%." Dumb on purpose — it's the benchmark. |
| L1 | Rolling z-score on weekly % changes | "How unusual is this week's change compared to this item's last ~12 weeks?" |
| L2 | Relative-to-basket | Subtract the overall SPI change from the item's change: "Is sugar rising faster than *everything else*?" Removes general inflation. |
| L3 | Seasonal + Ramazan-aware | Use STL decomposition (`statsmodels`) to separate trend / seasonality / leftover, then score the leftover. Add a Ramazan/Eid feature (see §6). |
| L4 (stretch) | Forecast interval | Forecast next week (e.g. Prophet / SARIMA); flag if the actual price falls outside the prediction interval. |

Details that matter:
- Work on **% changes or log prices**, not raw prices. Pakistan had very high inflation in
  2023, so raw prices trend upward too much to compare across time.
- Use **robust statistics** (median and MAD instead of mean and standard deviation) so one
  past spike doesn't hide the next one.
- **No look-ahead.** When scoring week *t*, only use data up to week *t*. Using future data
  makes the backtest look great and the real system useless (this is "data leakage").
- Output per anomaly: score, severity (`watch` / `unusual` / `extreme`), direction (up/down).
- Price **drops** are also anomalies (e.g. a tomato glut) — report them, but rank spikes first.

**6. Explain (`src/mehngai/explain/`) — the LLM layer**
- Input to the LLM is a small **JSON of facts** computed by the code: item, city, this week's
  price, last week's, % change, how unusual (score), the item's typical weekly change, whether
  it's Ramazan season, whether the item is government-administered.
- The LLM writes 1–2 sentences, e.g. *"Sugar rose 9% this week to Rs 165/kg — about 4× its
  usual weekly movement and the biggest jump since March."*
- **Guardrails** (this is the "AI engineering" part):
  - Prompt says: use only the numbers given; never claim a cause you weren't given.
  - After generation, code **checks every number in the output** appears in the input facts.
    If not → regenerate once → if still wrong, fall back to a plain template sentence.
  - Wording rule: say "unusual" / "abnormal", never "hoarding" or accuse anyone. The tool
    detects statistical anomalies, not wrongdoing.
- LLM provider: a **free tier** (Google Gemini API or Groq — decide in Phase 0 and log it in
  `docs/decisions.md`). Keep the provider behind one small function so it can be swapped.
- Prompts live as text files in `src/mehngai/explain/prompts/`, not hard-coded strings.
- Stretch: pull that week's headlines from Pakistani news RSS feeds (e.g. Dawn, Business
  Recorder) mentioning the item, and let the LLM attach "possibly related news" **with the
  link** — or say "no clear cause found".

**7. Report (`src/mehngai/report/`, `src/mehngai/app/`)**
- **Weekly report**: a Markdown/HTML file — "This week's unusual prices" table + explanations
  + a small chart per flagged item. Saved to `reports/YYYY-MM-DD.md`.
- **Dashboard**: Streamlit app — pick an item → see its price history with anomalies marked,
  this week's flags, and the explanations. Runs locally (`streamlit run`).

**8. Schedule (`.github/workflows/weekly.yml`)**
- GitHub Actions cron job runs the whole pipeline once a week after PBS publishes, commits
  the new report. Free for public repos. API key stored as a GitHub secret.
- Phase 7 only — until then, everything runs manually with one command.

---

## 4. Tech stack

| Purpose | Tool | Why |
|---|---|---|
| Language | Python 3.11+ | course + my learning track |
| Data | pandas, numpy | already know the basics |
| HTTP / scraping | requests, BeautifulSoup | fetch the PBS listing page + PDFs |
| PDF tables | pdfplumber (camelot as fallback) | extract tables from PDFs |
| Database | SQLite (`sqlite3` stdlib) | file-based, free, teaches SQL |
| Statistics | statsmodels (STL), scipy | decomposition, robust stats |
| Forecast (stretch) | prophet or statsmodels SARIMAX | forecast intervals |
| LLM | Gemini API or Groq (free tier) | explanation layer |
| Hijri dates | `hijri-converter` (or similar) | Ramazan/Eid calendar feature |
| Charts | matplotlib / plotly | report + dashboard charts |
| Dashboard | Streamlit | quick Python-only UI |
| Config | YAML (`pyyaml`), `.env` (`python-dotenv`) | settings + secrets |
| Tests | pytest | parsing + detection tests |
| Automation | GitHub Actions | free weekly scheduler |

Don't add libraries outside this list without a one-line reason (rule §2.3).

---

## 5. How we know it works (evaluation)

There is no labelled dataset of "true anomalies", so we build a small one:

1. **Known-events list** (`data/known_events.csv`): real, documented price shocks found in news
   coverage — e.g. the 2023 wheat flour crisis, sugar price surges, onion/tomato spikes after
   floods or import bans. For each: item, approximate weeks, source link.
   *(Collect these from news in Phase 4 — do not invent them.)*
2. **Backtest**: run each detector layer over the full history (no look-ahead) and measure:
   - **Recall** — of the known events, how many did we flag?
   - **Precision** — of the weeks we flagged, how many were real events? (spot-check a sample)
   - **Alert volume** — how many flags per week on average? Target: a handful, not 20.
3. Each layer must beat L0 baseline to be kept. Record results in `docs/decisions.md`.

This evaluation section is what turns the project from "a script" into "data science", and
it's what I should talk about in my demo/interview.

---

## 6. Pakistan-specific knowledge the code must respect

- **Ramazan & Eid move ~11 days earlier every year** (lunar Hijri calendar). A seasonality
  model based on Gregorian months will miss them. Add a "weeks until/since Ramazan start" and
  "Eid week" feature using a Hijri date converter.
- **Administered vs market prices.** Some SPI items (petrol, diesel, LPG, electricity, gas
  charges) are set by the government/regulators, so their jumps are policy decisions, not
  market anomalies. Tag them `price_type = administered` in `config/items.yaml` and exclude
  them from v1 detection (or report them separately as "policy changes").
- **Volatile vs sticky items.** Tomatoes and onions swing wildly every few weeks; sugar and
  flour move slowly. Per-item statistics (not one global threshold) handle this.
- **High general inflation** (especially 2023) — see §3 stage 5: use % changes and the
  relative-to-basket layer.
- **PBS publishes weekly**, reports are dated by week. Reports may occasionally be missing
  (holidays) — the pipeline must handle gaps, not crash.

---

## 7. Folder structure (target)

```
mehngai-watch/
├── CLAUDE.md                 ← this file
├── README.md                 ← public-facing description (Phase 6)
├── requirements.txt
├── .env.example              ← LLM_API_KEY=... (real .env is gitignored)
├── .gitignore
├── config/
│   ├── items.yaml            ← tracked items, aliases, unit, category, price_type
│   └── settings.yaml         ← thresholds, window sizes, model name
├── data/
│   ├── raw/                  ← downloaded PDFs (cache)
│   ├── interim/              ← per-report extracted CSVs
│   ├── known_events.csv      ← evaluation ground truth
│   └── mehngai.db            ← SQLite database
├── src/mehngai/
│   ├── ingest/   fetch.py, parse.py
│   ├── clean/    normalize.py, validate.py
│   ├── store/    db.py
│   ├── detect/   baseline.py, zscore.py, relative.py, seasonal.py, evaluate.py
│   ├── explain/  llm.py, guardrails.py, prompts/
│   ├── report/   weekly_report.py
│   ├── app/      dashboard.py (Streamlit)
│   └── pipeline.py           ← runs stages 1→7 in order (one command)
├── notebooks/                ← exploration only, never imported by src/
├── reports/                  ← generated weekly reports
├── tests/
├── docs/
│   ├── decisions.md          ← why we chose X over Y
│   └── learning-log.md       ← what I learned each session
└── .github/workflows/weekly.yml
```

Create folders only when the phase that needs them begins.

---

## 8. Build phases

Each phase lists **what I'll learn** and a **done-when** check. Don't start a phase until the
previous one's done-when is met.

### Phase 0 — Setup & data reconnaissance
- Set up repo, venv, `.gitignore`, `requirements.txt`, `docs/decisions.md`, `docs/learning-log.md`.
- Download **3 SPI PDFs from different years** (e.g. 2019, 2022, 2025) and compare their table
  layouts. Check whether city-wise prices (Appendix-A) exist and look parseable. Show me a
  short summary of the differences.
- Set **v1 scope** (defaults — use these unless the PDFs make them impossible): 8 market-priced
  items — wheat flour, sugar, tomatoes, onions, potatoes, chicken, eggs, cooking oil/ghee;
  national average prices (add Lahore later only if Appendix-A parses easily); LLM = Gemini
  free tier (Groq as backup).
- **Learn:** project setup, reading a real data source critically before coding.
- **Done when:** `docs/decisions.md` records the item list, geography, LLM provider, and a note
  on how the PDF layout differs across years.

### Phase 1 — Ingestion
- `fetch.py`: collect PDF links from the PBS page, download new ones into `data/raw/`.
- `parse.py`: get the item table out of **one** PDF into a clean CSV. Then make it work on the
  other two years. Then backfill ~2 years (≈100 reports).
- **Learn:** HTTP requests, HTML parsing, PDF table extraction, handling messy real data.
- **Done when:** ≈100 weekly CSVs exist; a pytest checks that one known report parses to the
  known values (e.g. onions = Rs 133.93/kg on 06-06-2024).

### Phase 2 — Clean, validate, store
- `items.yaml` mappings, validation rules, rejected-rows log, SQLite schema, load all CSVs.
- **Learn:** SQL (CREATE, INSERT, SELECT, JOIN), data validation, idempotent loading (running
  twice doesn't duplicate rows).
- **Done when:** one SQL query returns a complete weekly price series per tracked item with no
  duplicates, and rejected rows are explained.

### Phase 3 — Exploration (notebook)
- Plot each item's price over time. Mark Ramazan periods. Compare volatile vs sticky items.
  Plot weekly % change distributions.
- **Learn:** EDA, time-series plots, seeing seasonality and trend with my own eyes.
- **Done when:** you've shown me the key charts and summarised, for 3 items, what "normal"
  looks like and where obvious spikes were. Start collecting `known_events.csv` from news for
  those spikes.

### Phase 4 — Detection + evaluation (core phase, take the most time here)
- Build L0 → L1 → L2 → L3 one at a time. Write `evaluate.py` backtest. Compare each layer.
- **Learn:** z-scores, robust statistics, rolling windows, STL decomposition, data leakage,
  precision/recall, backtesting.
- **Done when:** a table in `docs/decisions.md` shows recall, precision and alerts/week for each
  layer, and we've chosen one as the production detector with a reason.

### Phase 5 — Explanation layer
- Facts-JSON builder, prompt file, LLM call, number-check guardrail, template fallback.
- **Learn:** structured prompting, grounding, output validation, handling API failures and
  rate limits, keeping secrets in `.env`.
- **Done when:** for 10 historical anomalies, every explanation passes the number check and
  contains no invented causes.

### Phase 6 — Report + dashboard + README
- Weekly report generator, Streamlit dashboard, `pipeline.py` single command, README with
  screenshots, problem statement, and evaluation results.
- **Learn:** Streamlit, presenting results for non-technical users.
- **Done when:** `python -m mehngai.pipeline` produces this week's report from scratch, and the
  dashboard runs locally.

### Phase 7 — Automation (nice-to-have for submission)
- GitHub Actions weekly cron + secret API key.
- **Learn:** CI/CD basics, cron syntax, secrets management.
- **Done when:** one scheduled run commits a new report on its own.

### Stretch ideas (only after v1 is done)
News-context layer · city-level detection and "which city is most out of line" · Prophet
forecast intervals (L4) · Urdu / Roman Urdu output · weekly email or Telegram alert.

### v1 = course submission
Phases 0–6 done for ~8 items, national (± Lahore), with the evaluation table. Phase 7 is a bonus.

---

## 9. Coding conventions

- Python 3.11+, virtual environment in `.venv/`. I'm on **Windows** — use `pathlib` for all
  paths, never hard-code `\` or `/` separators.
- Type hints on function signatures; short docstrings saying what goes in and what comes out.
- Small functions, one job each. Stages talk through files/DB, not through global variables.
- Config values (thresholds, window sizes, item list) live in `config/`, not in code.
- No secrets in the repo. `.env` is gitignored; `.env.example` shows the variable names.
- `notebooks/` are for exploring; anything reusable moves into `src/`.
- Tests in `tests/` with pytest — at minimum for parsing and for each detector on a tiny
  hand-made series where I know the right answer.
- Log with the `logging` module, not `print`, inside `src/`.
- Commit after each working step with a clear message (e.g. `parse: handle 2022 table layout`).

---

## 10. Glossary (concepts new to me in this project)

- **Time series** — values recorded over time at regular intervals (here: one price per week).
- **Anomaly detection** — finding data points that don't fit the usual pattern.
- **Z-score** — how many "typical deviations" a value is from the average. z = 3 means very unusual.
- **Robust statistics (median, MAD)** — versions of average/spread that one extreme value can't distort.
- **Rolling window** — computing stats over only the last N weeks, sliding forward each week.
- **STL decomposition** — splitting a series into trend + seasonal pattern + leftover (residual).
- **Data leakage / look-ahead** — accidentally using future data when judging the past.
- **Backtesting** — replaying history week by week as if the system was live, to measure it.
- **Precision / recall** — of my alerts, how many were real / of the real events, how many did I catch.
- **Grounding (LLM)** — making the model answer only from data you give it, then checking it did.
- **Idempotent** — running the same step twice gives the same result (no duplicates).

---

## 11. Data source reference

- PBS weekly SPI reports: https://www.pbs.gov.pk (Price Statistics → Weekly SPI)
- ⚠️ **PBS redesigned its site (found in Phase 0).** Old `/sites/default/files/...` URLs now 404.
  - Live files (Jul 2023+): `https://www.pbs.gov.pk/wp-content/uploads/2020/07/<name>`, listed by the
    WordPress media API `https://www.pbs.gov.pk/wp-json/wp/v2/media?search=SPI&per_page=100&page=N`.
  - Older files (2014–mid 2025): Wayback Machine CDX
    `https://web.archive.org/cdx/search/cdx?url=pbs.gov.pk/sites/default/files/price_statistics/weekly_spi/&matchType=prefix`,
    raw file at `https://web.archive.org/web/<timestamp>id_/<original-url>`.
  - Details in `docs/decisions.md` (Phase 0).
- Example report URL (week ending 06-06-2024, old site — now only via Wayback):
  https://www.pbs.gov.pk/sites/default/files/price_statistics/weekly_spi/2024/SPI%20Executive%20Sumary%26SPI%20Report_06062024.pdf
- Report contents (as of 2024 format): executive summary; Annexure-III item-wise table (51
  items: unit/spec, avg price this week / last week / same week last year, WoW %, YoY %,
  weights, impact); 10-week SPI trend; Appendix-A city-wise prices (17 cities) — not always
  included in the same file; verify per report.
- SPI base year: 2015-16 = 100.

---

## 12. Current status

- **Phase:** Phases 0–4 ✅ done → next is **Phase 5 (Explanation layer)**.
- **Last session (2026-10-10):** Phase 1: 378 annex PDFs since 2019 downloaded (PBS media API + Wayback),
  Appendix-A parsed to `data/interim/`. Phase 2: SQLite `data/mehngai.db` with 354 complete weekly national
  series per item (2019-09-05 → 2026-10-08), rejected rows explained. Phase 3: `notebooks/01_explore.ipynb`
  + 8 sourced events in `data/known_events.csv`. Phase 4: L0–L3 built + backtest; **production detector =
  L1 rolling robust z-score, 52-week window** (same recall as L0 with 60% fewer alerts; L2/L3 didn't beat it —
  see decisions.md). All layers' flags are in the `anomalies` table. 47 tests pass. All pushed to GitHub.
- **Next step:** Phase 5 — facts-JSON builder from `anomalies` (method = `production_method` in settings),
  prompt file, Gemini free-tier call behind one function, number-check guardrail, template fallback.
  Needs a Gemini API key in `.env` (Massab to create).
- **Run order:** `python -m mehngai.ingest.fetch` → `python -m mehngai.ingest.parse` → `python -m mehngai.store.db`
  → `python -m mehngai.detect.evaluate` (~3 min, mostly L3's STL fits).
- **Defaults in use:** 8 items (ghee = 1 kg pouch) · national average (Lahore stored too) ·
  Gemini free tier · 2015-16 base era only (from 2019-09-05).
