# Decisions

Why we chose X over Y. Newest at the bottom of each section.

---

## Phase 0 — Scope & data source (2026-10-10)

### v1 scope

| Decision | Choice | Reason |
|---|---|---|
| Items (8, market-priced) | wheat flour (20 kg bag), sugar (refined, 1 kg), tomatoes (1 kg), onions (1 kg), potatoes (1 kg), chicken (farm broiler live, 1 kg), eggs (farm, dozen), vegetable ghee (1 kg pouch) | CLAUDE.md defaults. For "cooking oil/ghee" we pick the **1 kg ghee pouch**: it's the low-income purchase and exists in every year's list (`Veg. Ghee, Loose/Pouch` in 2019). |
| Geography | **National average** for v1; **Lahore is feasible** later | Appendix-A (city-wise) is present and parseable in every sample year (2019, 2022, 2024, 2026), so Lahore is cheap to add once national works. |
| LLM provider | **Gemini free tier** (Groq as backup) | CLAUDE.md default; both free. Will be hidden behind one function. |
| Python | 3.13 | 3.14 is installed but scientific libs (statsmodels, prophet) lag on the newest Python. |

### Data source — the PBS site changed (important)

- **PBS redesigned its website (WordPress).** Old URLs like
  `/sites/default/files/price_statistics/weekly_spi/...pdf` (including the example in CLAUDE.md §11) now return **404**.
- The **live site** only holds files from **July 2023 → today** under
  `https://www.pbs.gov.pk/wp-content/uploads/2020/07/<name>`. Files are discoverable via the
  WordPress media API: `/wp-json/wp/v2/media?search=SPI&per_page=100&page=N` (≈365 files).
  Weekly posts exist too, but only ~14 of them — the media API is the reliable index.
- **Older history (2014 → mid-2025)** survives on the **Internet Archive (Wayback Machine)**:
  ≈1,540 archived SPI PDFs. CDX index:
  `https://web.archive.org/cdx/search/cdx?url=pbs.gov.pk/sites/default/files/price_statistics/weekly_spi/&matchType=prefix`
  Raw file: `https://web.archive.org/web/<timestamp>id_/<original-url>`.
- **Decision:** ingestion (Phase 1) uses two link sources — PBS media API (2023-07+) and
  Wayback CDX (older) — and de-duplicates by report date. Both are free.
- Filenames are still inconsistent (`SPI Annex 07.03.2019.pdf`, `spi_annex_01042021.pdf`,
  `SPI%20Annex%26USCP_06062024.pdf`, `Annex_08.10.2026.pdf`, typos like `Exective`, `Eexecutive`),
  so the **report date is taken from the filename via regex** (`DD.MM.YYYY` / `DDMMYYYY`) and confirmed
  from the PDF text ("week ended on ...").

### PDF layout across years (samples: 2019-03-07, 2022-11-10, 2024-06-06, 2026-10-08)

Each week has two PDFs: a **Report** (exec summary + Annexure-III) and an **Annex** (Appendix-A city prices).

| | 2019 | 2022 / 2024 / 2026 |
|---|---|---|
| SPI base year | **2007-08 = 100, 53 items** | **2015-16 = 100, 51 items** |
| Report PDF | 4 pp, no exec summary; item table on **p2** | 4 pp, exec summary on p1; item table on **p3** (59×12) |
| Annex PDF | 4 pp: Appendix-A p1–3, fertilizers p4 | same + extra columns on p3 (national avg last week / last year prices) |
| Item names | `Sugar, Refined`, `Chicken Farm, Broiler, Live`, `Eggs Hen, Farm` | `Sugar Refined`, `Chicken Farm Broiler (Live)`, `Eggs Hen (Farm)` |
| Wheat flour unit | **10 kg bag** | **20 kg bag** → series break, convert or split |
| Excel (.xlsx) version | no | only from ~Apr 2025 onward (clean cells, same Annexure-III) |

Findings that drive Phase 1 parsing:
1. **Annexure-III rows are re-sorted every week** (grouped by increase / decrease / unchanged), so `Sr.` is
   not an item ID — items must be matched by **name**.
2. **Long item names garble in Annexure-III** (cooking oil 5 L tin, ghee 1 kg pouch): text overflows into the
   unit/price cells, e.g. `'1 k5g0 3P.7o8u'`. Short names parse perfectly.
3. **Appendix-A keeps a fixed item order (SL. 1–51) and its price columns stay clean** even when the
   name/unit text is garbled. Its national average equals Annexure-III (onions 133.93, sugar 143.18 on 06-06-2024).
4. **Decision:** primary parse target = **Appendix-A** (national `AVG` + optional city `AVG`), keyed by SL. number
   *and* a name check per base-year. Annexure-III is used as a cross-check.
5. Sanity anchor confirmed: **onions = Rs 133.93/kg on 06-06-2024** (matches CLAUDE.md).

### History window for v1

- **Decision:** use only the **2015-16 base era** (51 items) for v1 detection. The 2007-08 base (53 items) has
  different item specs and units; crossing it would create fake jumps. Exact switch date to be pinned down in
  Phase 1 (somewhere between Mar 2019 and Nov 2022). That still gives several years of weekly data.

### Libraries

- `openpyxl` added: pandas needs it to read the PBS `.xlsx` reports (cross-check source from 2025 on).

---

## Phase 1 — Ingestion (2026-10-10)

| Decision | Choice | Reason |
|---|---|---|
| Download tracking | `data/raw/manifest.csv` (date, kind, source, url, sha256) | The SQLite DB arrives in Phase 2; the manifest gives "never re-download" now and gets loaded into the `reports` table later. |
| Which PDF per week | Annex only (`kinds: [annex]` in settings) | Appendix-A is our parse target. The Report PDF can be added later for cross-checks. |
| Live vs Wayback copy | Live PBS copy wins when both exist | Original source beats the archive copy. |
| Backfill start | 2019-01-01 (`config/settings.yaml`) | Covers the 2007-08 → 2015-16 base switch so Phase 2 can locate it; ~378 weekly reports. |
| Report date | Taken from the filename, cross-checked against "PRICES ON dd-mm-yyyy" in the PDF | Filenames are inconsistent; the PDF text is the authority (mismatches are logged). |
| Interim format | One long CSV per report: `report_date, sl_no, item_raw, unit_raw, city, price_min/avg/max` | Long format (one row per item × city) loads straight into the `prices` table. |
| Garbled cells | Left blank, never guessed | Two long item names (cooking oil 5 L tin, ghee 1 kg pouch) are printed across the first city's cells on each page (Islamabad, Multan, Bannu). Those cells fail number parsing → blank. National + Lahore unaffected. |
| Packaging | `pyproject.toml` + `pip install -e .` | So `python -m mehngai...`, tests and later notebooks all import `mehngai` the same way. |

Known source quirks found while parsing:
- 2019-07-18: PBS's PDF omits item 53 on page 1 (cities 1–7). A source gap, not a parse error.

### Phase 1 follow-up: truncated Wayback captures (found in Phase 2)

- 11 annexes (Jan–Mar 2023, Sep–Oct 2024) downloaded as exactly 1 MB: the *first* Wayback capture of those
  URLs was cut off. Later captures are complete (~3.8 MB).
- **Fix:** list every capture (no `collapse=urlkey`), keep the largest; reject any download that doesn't end
  with `%%EOF`; files on disk that fail this check are re-downloaded on the next run.
- PDF date beats filename date, confirmed twice: `…_01072022.pdf` is the week ended 2022-06-30, and
  `…_13062023.pdf` is really the week ended **2023-04-13** (PBS typo) — it fills an apparent gap.

---

## Phase 2 — Clean, validate, store (2026-10-10)

| Decision | Choice | Reason |
|---|---|---|
| Item matching | By **SL number** (fixed within the 2015-16 base) + name-prefix check (letters and digits, ≥ 5 chars) | Garbling spells the same item ~20 ways (`kEga cThin`, `Chicken F`), so exact name aliases would be fragile. Digits are kept so the 2.5 kg ghee tin can't pass as the 1 kg pouch. |
| Series start | **2019-09-05** (`series_start` in `items.yaml`) | Last 53-item (2007-08 base) report: 2019-08-22; first 51-item report: 2019-09-05. Older weeks have other SL numbers and units (wheat flour 10 kg vs 20 kg). |
| Stored data | 8 tracked items × 17 cities + National | Cheap (≈50k rows) and Lahore/city detection is a stretch goal. Detection v1 uses National only. |
| National row | `city = 'National'`, not NULL | In SQLite, NULLs in a PRIMARY KEY count as distinct values, so NULL would let duplicate national rows in. |
| Sanity bound | ×4 / ÷4 vs the **last accepted** price for that item + city (`max_weekly_ratio: 4.0`) | The ±300% rule. Comparing to the last *accepted* price means one misread week doesn't also get the next (correct) week rejected. |
| Loading | Rebuild `reports`, `prices`, `rejected_rows` in one transaction; upsert `items` | Idempotent by construction, no stale rows (an upsert-only version left one), and rule changes apply to old weeks. PKs make duplicates impossible. |
| L2 basket (later) | Not stored yet | Phase 4 can compute it from the interim CSVs (all 51 items) or the published SPI index. Decide then. |

**Result:** 354 weekly reports (2019-09-05 → 2026-10-08), every tracked item present every week nationally,
49,913 price rows, 0 duplicates. 1,063 rejected rows, all explained:
- 1,062 × blank price: the known garbled ghee-pouch cells (Islamabad, Multan, Bannu × 354 weeks).
- 1 × weekly jump: Larkana tomatoes Rs 20 → Rs 100 over a 2-week gap (2025-05-29 → 06-12). Looks real
  (seasonal), but it's a single city. Known limit: a fixed ×4 bound can catch real moves in cheap,
  volatile items, especially across a missing week. Revisit only if it starts affecting national rows.

---

## Phase 3 — Exploration (2026-10-10)

| Decision | Choice | Reason |
|---|---|---|
| Hijri dates | `hijridate` (not `hijri-converter`) | `hijri-converter` is deprecated; `hijridate` is its maintained successor, same API. Matches Pakistan's Ramazan starts within a day. |
| Known events | Only events with a news link; 8 so far (`data/known_events.csv`) | CLAUDE.md §5: never invent ground truth. Each event's PBS % matched our parsed data to the decimal. |
| Notebook tooling | `jupyter` + `matplotlib` | Notebook is exploration only; nothing in `src/` imports it. |

Findings that shape Phase 4 (details + charts in `notebooks/01_explore.ipynb`):
- Typical weekly move (median |Δ%|): tomatoes 12.0, onions 4.5, chicken 4.5, potatoes 2.1, eggs 2.1,
  wheat flour 0.7, sugar 0.6, ghee 0.2 → **per-item statistics are required**; one threshold can't fit all.
- Weekly changes are long-tailed (wheat flour skew 5.2) → **median/MAD**, not mean/std.
- **Ramazan:** tomatoes +10–15 pp the week before / first week, then −29 pp; chicken +5–7 pp around Eid.
  Staples show no pattern.
- **Steps vs spikes:** flour/sugar jump to a new level and stay; vegetables spike and revert.
- **Gaps:** 15 of 353 weekly steps span 2–3 weeks → the detector must account for the gap length.

---

## Phase 4 — Detection + evaluation (2026-10-10)

### Final backtest (`python -m mehngai.detect.evaluate`)

254 weeks (2021-09-16 → 2026-10-08, the weeks where every layer has a score), 8 items, 8 known events.
No look-ahead anywhere (unit-tested: changing future prices leaves past scores unchanged).

| Layer | Alerts | Alerts / week | Recall | Event precision (lower bound) | Recall @ 0.5 alerts/wk | Top item's share of alerts | Missed |
|---|---|---|---|---|---|---|---|
| L0 fixed 10% threshold | 287 | 1.13 | 0.75 | 0.04 | 0.75 | **53%** (tomatoes) | E03 flour Jan-23, E05 sugar Aug-23 |
| **L1 robust z, 52-wk window** | **114** | **0.45** | **0.75** | **0.10** | 0.75 | 32% (flour) | E01 tomatoes Aug-22, E08 tomatoes Jul-26 |
| L2 relative to basket | 113 | 0.44 | 0.75 | 0.09 | 0.75 | 35% | E01, E08 |
| L3 seasonal + Ramazan | 149 | 0.59 | 0.75 | 0.07 | 0.75 | 26% | E01, E08 |

**Precision spot-check (L1).** News search for (a) the 8 strongest L1 alerts not already in the event list and
(b) 6 random "watch"-level L1 alerts:
- 13 / 14 matched a real, news-reported price move that week; 7 / 14 had a stated cause (flour mill price
  hike Sep-22, wheat quota stopped May-22, sugar Ramazan demand + hoarding reports Apr-23, ghee palm-oil
  containers stuck at port Feb-23, flour smuggling ban Jul-24, chicken holiday demand Dec-24, sugar Aug-23 = E05).
- 1 / 14 looked like a false alarm: wheat flour +3.6% on 2024-10-03 (official data: only a slight rise).
- Caveat: "reported in the news" is partly circular, because PBS's weekly release names the biggest movers and
  the press repeats it. The stricter "has a stated cause" figure (7/14) is the honest precision estimate.

### Decision: **L1 (rolling robust z-score, 52-week window) is the production detector**

- **vs L0:** same recall with **60% fewer alerts** and 2.5× the event precision. L0 spends 53% of its alerts on
  tomatoes (it fires in 60% of tomato weeks) and almost never alerts on sugar (1), ghee (0) or flour (6). It
  "catches" tomato events only because it fires on tomatoes nearly every other week.
- **L2 not kept:** indistinguishable from L1 (113 vs 114 alerts, same events). Weekly item moves are much larger
  than the weekly general-inflation drift (trimmed-mean basket ≈ 0.2%/week), so subtracting it changes little.
  Rule: a layer must beat the previous one, so the simpler one wins.
- **L3 not kept:** same recall as L1 with 30% more alerts. With only ~5 years of weekly data, STL can't tell a
  one-off step from a season. Before gating, it learned flour's +42% step of Mar-2023 as "seasonal" and then
  flagged flat weeks in Mar-2024 as abnormal drops (282 alerts, 54 of them ghee "drops" averaging 0.46%).
  A seasonal-strength gate (≥ 0.4) halved that, but L3 still doesn't beat L1. Revisit when more years exist.
  A unit test confirms it works on clean data: a gradual 6-week yearly rise that L1 calls "unusual" stays below
  "unusual" in L3 (the first week of the rise can still reach "watch").

### How we got here (tuning log)

| Change | Why | Effect |
|---|---|---|
| L1 window 12 → **52 weeks** | 12 weeks adapted too fast: during a sustained surge (sugar 2023) the rising weeks *became* normal | L1 recall 0.62 → 0.75, alerts 0.58 → 0.45/wk (sweep: 12 / 26 / 52) |
| Basket = **trimmed mean**, not median | More than half of the 51 items don't move in a typical week, so the median was 0 | Basket tracks inflation (≈20%/yr 2022, ≈18% 2023, ≈1–5% 2024–25) |
| L3: smooth seasonal (5 wk), same adjustment for history and current week | Seasonal shape from few years is jagged week to week; in-sample spread vs out-of-sample change inflated z | L3 alerts 3.0 → 1.1/wk |
| L3: seasonal-strength gate 0.4 | Steps in sticky items were learned as "seasons" | L3 alerts 1.1 → 0.59/wk |
| L3: refit STL every 4 weeks | Robust STL ≈ 0.5 s per fit × ~2,000 fits | Backtest 10+ min → 3 min; still no look-ahead |
| Bug fix: `nanmedian` in rolling MAD | The first week (no previous price) made the whole first year's MAD NaN | L1/L2 now score from week 13 (2019-12-05), not week 53 |

### Known limitations (honest list for the demo)

- **Tomato swings are "normal" to L1 by design.** +43% (Aug-22 floods, z = 1.7) and +125% (Jul-26, z = 2.6)
  are within tomatoes' own typical range. If users want these, add an absolute guardrail (e.g. also flag any
  move ≥ 75%). Not done now: tuning a rule to catch one known event is overfitting.
- **Only 8 known events**, so recall moves in 12.5-point steps; a one-event difference isn't significant.
  The events were partly found by looking at big moves, which favours L0, and L0 still lost.
- **The Ramazan adjustment** lives only in L3 (not in production). Only 5–6 usable Ramazans so far.

---

## Phase 5 — Explanation layer (2026-10-10)

| Decision | Choice | Reason |
|---|---|---|
| Model | **`gemini-3.8-flash`**, pinned (not `gemini-flash-latest`) | Available on the free tier for this key (tested); `gemini-2.5-flash` is closed to new users. Pinning keeps output reproducible. |
| Client | Plain REST with `requests` (no SDK) | `requests` is already a dependency; one function (`llm.generate`) is the only provider-specific code, so swapping to Groq is one function. |
| What the LLM sees | A facts JSON only: item, unit, human dates, this/previous price, % change, direction, severity word, typical weekly change (median of the previous 52 weeks), × typical, "biggest move since", year-ago price, price_type, Ramazan flag, gap weeks | The detector decides *what* is anomalous; code computes *every* number; the LLM only phrases. No z-scores (jargon for households). |
| Number guardrail | Every number in the text must be in the facts (rounding to 1 or 0 decimals allowed) | Grounding: catches invented or miscalculated numbers. |
| Wording guardrail | Banned phrases (cause words like "due to"/"because"/"amid", accusations like "hoarding"/"mafia"), Ramazan only if flagged, direction verbs must match, ≤ 60 words | CLAUDE.md: never claim a cause we weren't given; detect anomalies, not wrongdoing. |
| Failure path | Retry once with the problems listed → template sentence | The report never shows unchecked LLM text and never breaks if the API is down (also on HTTP errors, rate limits after 3 waits). |
| Cache | `explanations` table keyed by anomaly, reused only while `facts_json` is identical; no FK | Detector runs rebuild `anomalies`; explanations must survive so we don't pay twice. |
| Rate limit | 6 s between calls; on 429 wait (Retry-After or 20/40/60 s) | Free tier ≈ 10 requests/min. Observed one 429 → recovered after 20 s. |

**Done-when check:** 10 varied historical anomalies (the strongest per item + strongest drops) →
**10/10 LLM answers passed every guardrail on the first attempt**; 0 template fallbacks. Ramazan was mentioned
only for the 3 anomalies inside Ramazan season (sugar Apr-23, potatoes Mar-24, flour Apr-22), and only as timing.
The guardrail itself is unit-tested with deliberately bad sentences (invented number, "due to", "hoarders",
Ramazan out of season, wrong direction, too long) and with a fake LLM for the retry and fallback paths.

**Free-tier quota (found in Phase 6):** `gemini-3.8-flash` allows **20 requests/day** per project. A 429 now reads
Gemini's `RetryInfo.retryDelay`: short waits (per-minute limit) are honoured; anything over `max_wait_seconds`
(90 s — e.g. the daily cap, which asked for 23,207 s) gives up at once and the template is used. A normal week
needs 0–3 calls, so the cap only matters while testing.

---

## Phase 6 — Report, dashboard, pipeline, README (2026-10-10)

| Decision | Choice | Reason |
|---|---|---|
| Pipeline detector | `detect/run.py` runs only `production_method` (L1) | Seconds instead of the 3-min L0–L3 backtest; replaces only L1's rows in `anomalies`. |
| Stage functions | Each stage has a plain `run()`/`load()`/`write()`; `main()` only parses CLI args | `pipeline.py` can call stages directly (calling `main()` would read the pipeline's own CLI args). |
| Wayback in weekly runs | Optional: if the CDX listing fails, continue with the live PBS site | Wayback is only needed for history and is sometimes offline; new reports come from the live site. |
| Report format | Markdown in `reports/` (+ PNG chart per flag), committed | GitHub renders it; quiet weeks still get a report with all 8 prices. |
| Missing explanation | Report/dashboard use the guardrail template (no LLM call) | The dashboard never spends API quota; older flags without a cached LLM text still read well. |
| Dashboard | Streamlit + Plotly (hover tooltips); flags in orange with ▲/▼ shape; theme follows the user's light/dark setting | Colour never carries meaning alone; same palette as the notebook and report. |
| "Typical weekly move" | Median |% change| over the 52 weeks **before** the week shown, everywhere | The dashboard first included the current week (1.0% vs the report's 0.9% for flour); now one definition. |
| Screenshots | Playwright driving the installed Chrome (one-off, not in requirements) | Plain headless Chrome captured Streamlit's loading skeleton; Playwright waits for the chart to render. |
| Dropped dependency | `beautifulsoup4` | Never used: links come from PBS's JSON media API, not HTML scraping. |

**Done-when check:** with the database and `reports/` deleted, `python -m mehngai.pipeline` rebuilt everything and
wrote `reports/2026-10-08.md` in 2.5 min (cached PDFs; the explain stage hit the daily LLM quota and correctly fell
back to the template). With caches warm, a run takes ~7 s. A truly empty clone also downloads ~380 PDFs first
(~1 hour; the download stage itself was verified in Phase 1). The dashboard runs locally (`streamlit run
src/mehngai/app/dashboard.py`) and is smoke-tested with Streamlit's `AppTest`. 70 tests pass.

---

## v2 — all 51 items, three sections, search, ask, live news (2026-10-10)

Requested after v1: cover every PBS item, a separate section for petrol/diesel etc., search and a question box,
and a live home page with news. Discussed first; agreed the three-section layout and "search first, then ask".

| Decision | Choice | Reason |
|---|---|---|
| Item groups | `price_type` in items.yaml: **market** (25) / **fixed** (20) / **administered** (6) | Profiled all 51 items: fixed-price goods are unchanged 55–98% of weeks then jump in one step; government prices change by notification. One anomaly method for all would mislabel both (all 51 through L1 = 2.6 alerts/wk, petrol + diesel alone ~135 false "anomalies"). |
| Detector scope | L1 only on market items | Backtest on 25 market items: L1 ≈ 1.0 alerts/week, recall unchanged (0.75), no item > 15% of alerts; L0 still puts 51% on tomatoes. |
| Fixed / administered | List changes ≥ **2%** (fixed) / ≥ **1%** (administered) | Smaller moves are one city's shop nudging the 17-city average (median non-zero move 0.2–0.9%). ≈ 0.6 revisions + 1.3 government changes listed per week. |
| ×4 sanity rule | Not applied to administered prices | Gas went Rs 295 → 1,711 (×5.8) on 2023-11-16: a real tariff hike the rule would have rejected. |
| Zero prices | Rejected with reason "price is 0 (not sold in this city)" | PBS writes 0.00 where an item isn't sold (gas in Khuzdar, IRRI rice in Sialkot): 1,084 rows. National averages unaffected. |
| Name prefixes | At least 5 letters ("Curd (Dahi)", "LPG 11.67") | Shorter prefixes ("Curd", "LPG") failed the ≥ 5-letter name check: 31,860 false mismatches on the first load. |
| Search | Aliases per item (English, Roman Urdu, Urdu) + exact / word / prefix / difflib fuzzy scoring | Free, instant, works offline; typos ("onoin") and local names ("cheeni", "ٹماٹر") resolve. Longest match wins in sentences ("gas cylinder" → LPG). |
| Ask | Rules parse item / city / date / intent; Gemini only if no item found, returning JSON that is validated against the item and city lists | Same principle as explanations: the LLM never supplies numbers. Most questions cost no API quota (20/day). |
| News | 6 public RSS feeds; keep if a tracked item AND a price word (or inflation/SPI); drop foreign-country headlines; ignore misleading aliases ("oil" = crude, "matches" = cricket, "gram" = gold) | Free; first run kept 15 of 125 headlines, all relevant (OGRA petrol notices, "Flour prices jump by Rs20 per kg in Karachi", SPI stories). Shown as "possibly related", never summarised by AI. |
| Live home page | Streamlit page; news section is an `st.fragment(run_every="30m")`; stored headlines refetched when > 30 min old | PBS data changes weekly (pipeline); news changes hourly. `MEHNGAI_OFFLINE=1` disables fetching (tests). |
| Movers chart colours | Rises red `#e34948`, falls blue `#2a78d6` (validated pair, light + dark), always with ▲/▼ and signed % | Polarity encoding; colour never carries meaning alone. Falls drawn left-to-right so labels never collide. |
| City comparison | Dot plot zoomed to the price range, not bars | City prices are close (petrol Rs 397–401); bars must start at 0 and would hide the spread. |
| Theme | `.streamlit/config.toml` primary colour = project blue | Streamlit's default red accent clashed with "red = price rise". |

Result: 321,739 price rows (51 items × 18 places × 354 weeks, minus explained rejects); week ending 8 Oct 2026 →
2 unusual moves (chana daal +4.0%, wheat flour +5.7%), 2 government changes (petrol +2.4%, diesel −1.4%),
0 revisions. Pipeline incl. news: 37 s with caches. 101 tests pass.

### v2.1 — home page look and feel (2026-10-11)

Brief: dynamic and interactive, clean and professional, unique, not the generic "AI dashboard" look; bubbles
around buttons and news; moving news; a headlines section.

| Decision | Choice | Reason |
|---|---|---|
| Visual direction | Market rate-board / newspaper: serif headlines (Fraunces), tabular monospace prices (IBM Plex Mono), project palette only | Fits the subject (bazaar rate boards, news), distinct from the usual gradient/glass/emoji dashboards. |
| Motion | Two slow CSS tickers (prices 140 s loop, headlines 90 s), pause on hover; 0.45 s card fade-in; pulsing LIVE dot. All off under `prefers-reduced-motion` | "Dynamic but not overdone": motion only where it carries information. |
| "Bubbles" | Pills for buttons, search, source/item tags; soft blue ring + 1–2 px lift on hover; cards lift with a ring | Interactive feel without decoration that means nothing. |
| Navigation from HTML | Every ticker entry, card title and news tag links to `/explore?q=<item_id>`; Explore reads the query param | Makes the moving parts useful, not just decorative. |
| Sparklines | Tiny SVG trend (last 26 weeks) embedded as an `<img>` data URI | Streamlit's HTML sanitiser strips inline `<svg>` (found by inspecting the DOM). |
| Theme | `[theme.light]` / `[theme.dark]` in `.streamlit/config.toml`; CSS neutrals are semi-transparent | A plain `[theme]` section silently forced light mode; per-mode sections keep the viewer's choice. |
| Safety | All feed text HTML-escaped, only http(s) links emitted (`style.py`, tested) | Headlines come from outside sites and are rendered as HTML. |

---

## v3 / Phase 8a — website prototype (2026-10-11)

Massab: Streamlit is too dull and limited for a really good-looking, interactive app. Agreed plan: keep the
Python pipeline, export JSON, build a React website (CLAUDE.md §3 stages 8–9, Phase 8).

| Decision | Choice | Reason |
|---|---|---|
| Architecture | Python pipeline → `export.py` → JSON in `web/public/data/` → static React site | The AI/statistics stay in Python (the course focus); the site only displays exported values; static = free hosting, no server to run. |
| Stack | React 19 + TypeScript + Vite 8, Tailwind 4, Motion (Framer Motion), ECharts 6 (modular import, SVG renderer), fonts via `@fontsource` | Full control over layout and motion; TypeScript mirrors the JSON shapes (`types.ts`); self-hosted fonts work offline. |
| Data files | `summary.json`, `items.json`, `cities.json`, `news.json` (~60 KB, home page) + `series/<item>.json` (~50 KB each, loaded on demand) | The home page loads fast; full history only when an item is opened. `allow_nan=False` so browsers can always parse it. |
| Map | Natural Earth 1:50m Pakistan outline (public domain, 571 points, 9 KB) + `config/cities.yaml` coordinates; ECharts geo with `aspectScale` 0.87 (≈ cos 30°N) | Correct shape at Pakistan's latitude. Labelled "for orientation only; not an authoritative boundary". |
| Map encodings | Colour = % vs national average on a diverging blue–grey–red scale that saturates at **±10% or the real spread**; size = (price ÷ national)³, clamped | First version scaled min→max, so petrol's Rs 4 spread (±0.6%) looked dramatic. Now near-identical prices look identical. |
| Story headline | Built from the data by fixed rules ("Chana daal and wheat flour moved unusually this week.") | Newsroom feel without letting an LLM write numbers or claims. |
| Interaction | Price ticker + LIVE headline strip (pause on hover), count-up tiles, item quick-view panel (history chart with zoom, cities, flags, news), Ctrl+K search (alias + typo matching ported from `search.py`), map ↔ list hover linking, animated topic filter | Everything clickable leads to the item; motion only where it carries information; `prefers-reduced-motion` respected. |
| Known follow-up | JS bundle 350 KB gzip (ECharts) | Phase 8b: code-split the charts (load after first paint). |

Prototype checked with screenshots: light, dark, 390 px phone, map hover, item panel, search; no console errors.

---

## v3 / Phase 8a — fintech redesign (2026-10-11)

Massab: the prototype "still feels dull and almost the same as Streamlit"; wanted something more professional and
less "tech-y", like fiscal.ai, TrendSpider, TradingView and Koyfin, with interactive news cards. Common thread of
those sites (studied from screenshots): a dark hero with one big plain headline and a search box, then calm, rounded
light panels; one clean sans font; numbers in neat columns; small round logos beside each name.

| Decision | Choice | Reason |
|---|---|---|
| Look | Dark hero → light rounded "market summary" panel → dark method band; Manrope (one sans font), tabular numbers; lucide icons in round badges | Matches the references; replaces the serif/monospace newspaper look, which read as "tech-y". |
| Hero | Ticker tape of all 51 items, headline, search + popular picks, the Essentials index drawn as a line along the bottom | First screen says what the site does and shows real data, not decoration. |
| Essentials index | New `index.json`: trimmed-mean weekly log change of the basket, chained from 100 at Sep 2019 (188.0 now; +0.23% this week, +3.1% in a year) | Gives the market summary one headline number, like an index on a trading site. Labelled "our calculation, not the official SPI". |
| Heatmap | ECharts treemap of all 51 items grouped by category; diverging blue–grey–red saturating at ±5% weekly change | TradingView-style overview of the whole basket at a glance. |
| Watchlist | Koyfin-style sortable table (price, 1 week, 1 year, 6-month sparkline, type) with category tabs; 10 rows, then "Show all 51" | Comparable list without a wall of rows. On phones: item, price and 1 week only. |
| News cards | Featured + 2 side cards + scrollable rail; each card shows the live price, change and sparkline of the item it mentions (click opens the item) | Ties news to the numbers; still labelled "possibly related, not causes". |
| Names | `shortName()` with overrides (Basmati rice / IRRI rice, Ghee 1 kg / 2.5 kg, …) | Plain short names collided ("Rice" twice). |
| Theme | Light/dark toggle in the top bar (remembers the choice), follows the system by default | Both modes checked in screenshots, plus 390 px phone width. |
| Data fix | Quoted two item names in `items.yaml` ("Bread (plain, small)", "Cigarettes (Capstan, 20)") + a test | Unquoted commas in YAML flow mappings had silently split the names. |

### Theme fix + bug sweep (2026-10-11)

| Decision | Choice | Reason |
|---|---|---|
| Theme | The hero and method band use `hero` colour tokens that switch with the theme (white in light mode, near-black in dark) | They were always dark, so the toggle seemed broken (Massab: "light and dark mode doesn't work"). |
| Theme switching | Set `data-theme` on `<html>` *before* React re-renders; save the choice only when the visitor clicks; until then follow the system setting, live | Charts read CSS colour variables while rendering, so they picked up the previous theme's colours. |
| Search keys | Enter calls `preventDefault()`; Esc stops propagation; every opening of the search gets a fresh box (`key`) | The Enter press reached the item panel's close button (focused as the panel opened) and closed it; Esc closed the panel underneath too; a quick reopen reused the fading box with its old text. |
| Failure states | History or map files that fail to load show a message (or just the city list) instead of loading forever | A missing file must not leave a spinner on screen. |
| Map labels | Label only the single cheapest and dearest city, none when all prices are equal; note "Same price in every city" | For nationally set prices all 17 labels piled on top of each other. |
| Motion | `MotionConfig reducedMotion="user"` | Motion animations ignored the "reduce motion" setting (CSS ones already honoured it). |

### Premium redesign (2026-10-11)

Massab: make it unique, premium and memorable, avoiding generic "AI slop" layouts, taking elements from TradingView,
Koyfin and TrendSpider.

| Decision | Choice | Reason |
|---|---|---|
| Hero | "Pakistan from orbit", drawn in code (`OrbitScene.tsx`): a curved planet with an atmosphere glow, the Natural Earth outline laid in perspective, the 17 survey cities lighting up south → north, the Karachi–Peshawar corridor glowing | TradingView's earth-from-space drama, but specific to Pakistan and to our data (the survey cities). No stock photos: crisp at any size, tiny, themeable. The far (northern) edge fades into the horizon, so the outline reads as scenery, not a boundary claim. |
| Day / night | Dark mode = night (stars, warm city lights); light mode = day (sky, sun, sand-coloured land, green lights); the layers crossfade in 1.1 s on toggle | Makes the theme switch a memorable moment instead of a setting. |
| Borrowed elements | TradingView: centred huge headline, slanted white CTA, rounded panel rising over the hero. Koyfin: product shown in a window frame, floating help pill ("Find a price"), big statement band with abstract circle icons. TrendSpider: red alert bar, trust badge | Asked for by Massab; each one carries real content (this week's alerts, the 354-week badge, the live summary). |
| Brand colour | Pakistan green (#0c8f5a light / #3fd99a dark) for logo, buttons and labels only | Local identity; kept separate from the data colours (red = up, blue = down). |
| Type | Bricolage Grotesque for headings (characterful, 41 KB), Manrope for text, Noto Nastaliq Urdu for the "مہنگائی واچ" wordmark | Distinctive without being "techy"; the Urdu wordmark is a local touch. The Urdu font (239 KB) only downloads when Urdu text is on screen. |
| Copy | "Know when a price rise isn't normal." · "Built for the kitchen table, not the trading floor." | Says the core question in plain words and positions the site for households, not traders. |
| Motion | City lights switch on one by one, roads draw in, cards drift, mild mouse parallax; all off with "reduce motion" | Lively first impression; nothing moves for people who ask it not to. |
| Phone | The planet's horizon sits a fixed distance above the hero's bottom edge, and the hero grows with its text | On phones the text is taller; a percentage horizon put the planet behind the buttons. |

### Wave hero, own layout (2026-10-11)

Massab: don't replicate the reference sites (layouts, slanted buttons); normal button shape; replace the orbit with
flowing waves in the style of his reference images (silk ribbons, line waves, particle waves) — slow when idle,
quicker and interactive when the visitor moves or clicks.

| Decision | Choice | Reason |
|---|---|---|
| Hero backdrop | `WaveField.tsx`: two ribbons of fine lines (44 + 30 strands) on a canvas, brand green → teal → blue, additive glow at night, soft lines by day, a faint silk sheen between the outer strands | Our own take on the line-wave style, in our colours; crisp at any size, no images. |
| Interaction | Idle drift speed 0.16; moving the pointer raises it (up to 1.5, by pointer speed) and pushes nearby strands away; a click/tap sends a ripple ring (1.8 s) and a speed burst; everything eases back after 1.6 s of stillness | Exactly the requested behaviour: calm until the visitor engages, then lively. The push grows smoothly from zero at its centre, so strands never tear. |
| Performance / access | 60 fps measured; paused when off screen; device-pixel ratio capped at 1.75; "reduce motion" draws one still frame and ignores the pointer | Smooth without draining laptops; respects people who turn motion off. |
| Layout | Left: headline, subtitle, buttons. Right: one "This week's moves" card (two unusual moves, a government change, the biggest fall) | Replaces the centred TradingView composition and scattered floating cards with our own composition. |
| Removed copies | Slanted buttons, red TrendSpider-style alert bar (now a red count badge on "This week"), Koyfin-style floating pill (now a round search button whose label slides out), Koyfin-style circle icons (now line-art in the wave style), the orbit scene | Massab asked for no direct replication. |
| Hero cards | The four "this week" cards (unusual rise, notable rise, government price, biggest fall) return as a 2×2 group of floating glass cards with sparklines, right column offset lower | Massab liked them; grouped beside the headline instead of scattered around it. |

### Hero speed (2026-10-11)

Massab: the animated hero felt laggy. Measured with the CPU slowed 4× at 1880×1000, 1.25× pixel density: ~10 fps.
Hiding the canvas gave 57 fps and removing the glass blur changed nothing, so the cost was painting the lines.

| Decision | Choice | Reason |
|---|---|---|
| Resolution | Draw the canvas at ≤ 1 canvas px per CSS px (not the screen's 1.25–2×) and let the browser scale it; if 20 frames run slow, step down by 0.15 (to 0.5), step back up after 300 fast frames | Painting cost grows with pixel count; fine glowing lines look the same. Adapts to slow and fast machines. |
| Frame rate | Idle drift redrawn every other frame (30 fps); full 60 fps while the pointer moves or a ripple runs | The idle drift is too slow for the eye to notice the difference. |
| Work per frame | 58 strands (was 74); sine/cosine computed once per column and combined per strand (sin(a+b) = sin a·cos b + cos a·sin b); pointer/ripple maths skipped far from the disturbance | Same look, a fraction of the maths. |
| Result | ~50 fps with the CPU slowed 4× (idle and while moving); a steady 60 fps expected on a normal machine | Measured with `perf_hero.py` (Playwright + Chrome CPU throttling). |

---

## Accuracy check + a simpler site (2026-10-11)

Massab: test that the app works and that the data is accurately calculated and displayed; make the site easier to
navigate and less dense; keep search traditional; an AI chatbot later, separate from search.

**How accuracy is checked.** Every Annex PDF prints, next to PBS's national average, PBS's own previous-week price,
same-week-last-year price and % changes. Our pipeline never reads those columns — it computes everything from the
weekly averages — so comparing the two is an independent check of parsing, cleaning, storage and our formulas
(`python -m mehngai.verify`, report in `docs/verification.md`). Over all 352 reports since Sep 2019, this week's price matches PBS on 17,952 of 17,952 values (100%), the previous week on 98.7% and the year-ago price on 99.7%; every difference is PBS later correcting an earlier week's figure, or a week missing from our archive.

| Decision | Choice | Reason |
|---|---|---|
| Year-ago price | Only the report of the same week last year (±3 days), else "–"; one shared helper `same_week_last_year` used by the export and the explanation facts | The old rule took the nearest report within 10 days. When PBS skipped a week (e.g. around Eid 2025) it borrowed a neighbour, so our yearly % differed from PBS's (76 mismatches in the last 52 weeks). Showing "–" is honest; a wrong number is not. |
| Electricity, 27 Nov 2025 | Left as is, documented | PBS's own "previous week" (Rs 5.40) differs from the price PBS printed the week before (Rs 4.83): PBS revised that week's figure. We use the prices as published each week. |
| Ongoing checks | `tests/test_data_accuracy.py` (site JSON vs database vs parsed PDF vs PBS print, 8 tests, skipped without data); pipeline stage 4b checks every new report against PBS and logs any mismatch | Accuracy is re-proven every week, not just today. |
| Labels | Price-list tags show the real level (notable / unusual / extreme); counts are "alerts" | The list called a "notable" move "unusual", disagreeing with the cards. |
| Search | A plain box in the header (Ctrl+K or "/" to focus) with a results list under it; no chips or pop-up | Massab: more traditional search. |
| Navigation | Five sections in reading order (This week · Prices · Cities · News · How it works); the one on screen is underlined; ☰ menu on phones | Phones had no way to jump between sections. |
| Less dense | Removed the ticker band, the floating button and the four category cards; heatmap and list merged into one "Prices" section with a List/Heatmap switch; set-price boards moved into "This week"; plain "how to read this" lines | Fewer, calmer blocks; each section answers one question. |
| AI chat | Separate chat bubble for longer questions, built after deployment (needs a free Cloudflare Worker to keep the Gemini key secret) | Massab: keep search simple; AI for tricky questions. |

### Institutional restyle (2026-10-11)

Massab: strip the "AI/Web3 startup" look (bubbly fonts, pills, neon gradients, glows) for an "institutional fintech /
editorial data terminal" look (Bloomberg terminal, FT data hub); keep the interactive waves but mute them.

| Decision | Choice | Reason |
|---|---|---|
| Type | Merriweather (serif headings), Inter (text, labels), JetBrains Mono (every number: prices, %, index, table, chart axes) | Editorial credibility; monospace keeps columns of numbers aligned and reads as "data". |
| Geometry | Radius theme tokens set to 2px; flat panels = 3% tint + 1px border at 15%; no shadows, glows or blur | Sharp, flat and quiet, like a terminal. |
| Controls | Underlined tabs (categories, news topics, map items); sharp segmented controls (3M/1Y/3Y/All, List/Heatmap); rectangular buttons and search | Replaces pills. |
| Data colours | Up = brick red, down = steel blue, per theme; validated with the palette checker (CVD ΔE ≥ 17, contrast ≥ 3:1 as marks, ≥ 4.7:1 as text); heatmap and map use muted versions of the same pair | Muted but still colour-blind safe; ▲▼ always shown. |
| Charts | Index and history lines 2px in the text colour, no area fill; sparklines 1px; map bubbles 70% opaque with a 1px edge | No glows or gradients. |
| Waves | `WaveField` logic unchanged; colours desaturated to slate greys; an 85% veil of the page colour (#121212 / #f7f5f0) on top with `pointer-events: none` | A faint watermark that still reacts to the pointer. Also faster: 60 fps on a 4× slowed CPU. |
| Light mode | Same design on "editorial paper" (#f7f5f0, near-black ink) | Massab's spec describes the dark terminal; the light/dark toggle he asked for earlier is kept. |
| Motion | Removed floating/drift and scroll-triggered fade-ins | Content is always visible; a data tool shouldn't animate for show. |
| Falls in green | Price down = green: #3fa98a (dark, passes every palette check, text 6.5:1) / #0f7350 (light, text 5.4:1, colour-blind separation ΔE 7.9 — allowed because ▲▼ always accompany the colour); heatmap and map use muted versions | Massab: red vs green is the classic profit/loss convention. Greens were chosen to stay distinguishable from the red for colour-blind readers. |

---

## Phase 7 / 8c — deployment (2026-10-12)

Live at https://massabibrahim13.github.io/Mehengai-Watch/. Repo public (Massab); `LLM_API_KEY` added as a repository secret by Massab.

| Decision | Choice | Reason |
|---|---|---|
| Hosting | GitHub Pages, deployed by GitHub Actions (`actions/deploy-pages`) | Free for public repos, no server; the site is static files + JSON. |
| Fresh-machine problem | Commit `data/interim/` (parsed CSVs, 26 MB), `data/raw/manifest.csv` and one fixture PDF; the downloader skips weeks already parsed; the database is rebuilt from the CSVs (~30 s) | Every Actions run starts empty; re-downloading 870 MB of PDFs (an hour, partly from the Wayback Machine) each week would be slow and impolite. A cache could expire; files in git can't. |
| AI explanations | Cache exported to `data/explanations.csv` after each explain step and restored on every rebuild | Otherwise each run would lose them (and call Gemini again, against a 20/day quota). |
| Schedule | Weekly full run Fri 11:30 UTC + retry Sat 04:30 UTC (commits new data); hourly news-only rebuild; also on every push and by hand | PBS publishes the SPI on Friday; a late report is caught on Saturday. The weekly bot commits also keep GitHub from pausing the schedule (it pauses after 60 days without repo activity). |
| Safety | `pytest` runs before every publish; a failure stops the deploy. Runs never overlap (concurrency group) | A broken parse must not reach the public site. |
| Install | `requirements-pipeline.txt` (no Jupyter/Streamlit); Streamlit tests skip when it isn't installed | Faster runs; the Streamlit app is the private tool. |
| Rehearsal | Before the first push: fresh clone → pipeline → JSON identical to local (56 files), 119 tests pass, downloader wants 0 PDFs, site builds | Proved the automatic run works before it went public. |

---

## Phase 8b — item links, evidence section, chat (2026-10-16)

Massab: build the AI chat (separate from search; rules first, Gemini only for tricky questions), shareable item links
and a "How we tested it" page.

| Decision | Choice | Reason |
|---|---|---|
| Item links | `#/item/<id>` in the address; opening pushes a history entry, switching items replaces it, Back closes; unknown ids dropped; section anchors unchanged | Shareable without a server or a router library; Back behaves as people expect. |
| Evidence data | Backtest (`detect.evaluate --json` → `data/evaluation.json`) and PBS cross-check (`verify --all` → `data/verification_summary.json`) made locally and committed; `export.py` merges them into `evaluation.json` | Both need the PDFs or ~10–20 minutes; GitHub Actions has neither. They only change when a detector changes. |
| Evidence scope | Shows the 25-market-item backtest (what runs in production), not the original 8-item table in the README | Honest about what the site actually does; same conclusion (L1: same recall as L0, ~half the alerts, no item over 15%). |
| Chat design | Same as `ask.py`: rules first; only when no item is found does the Worker ask Gemini to **read the question into fields** (items, city, dates, intent); the answer is always a fixed sentence computed from the data | The AI never writes a number, so there is nothing to hallucinate and no answer to number-check (simpler than the planned "AI phrases the reply + guardrail"). |
| Chat code | `web/src/lib/ask.ts` is a port of `ask.py`; a browser test asks both 9 questions (English, Roman Urdu, Urdu, dates, cities) and requires identical words | Two implementations must not drift. The Python version now uses the site's strict year-ago rule too. |
| Worker | Cloudflare Worker (free): CORS locked to the site, 300-character cap, reads the item list from the live site (cached 10 min, 6 s timeout), Gemini with a 12 s timeout and one retry on 429/503, validates every field; daily limits in Workers KV (3 per visitor via a hashed IP, 15 overall) | Keeps the key off the browser; stays inside Gemini's 20/day free tier with room for the weekly run. A busy or exhausted AI just means the chat says so and answers from the rules. |
| Tested | Local Worker: CORS allow/deny, bad JSON, length cap, a real hard question (→ wheat flour, Lahore), prompt-injection text (no key/prompt returned), daily limit; browser: fake Worker replies (good reading, limit reached, busy, malicious ids) | Gemini was overloaded (HTTP 503) during testing — exactly the case the fallback handles. |
| Cloudflare account | A separate free account just for this project (Massab) | The existing account's shared workers.dev sub-address is "bps-connect-pk"; the project must not be tied to Brand PitStop. A test deploy there was deleted. |
| Chat before the Worker | The chat runs in rules-only mode until `VITE_CHAT_URL` is set; the AI line in its footer only shows when the helper is connected | Most questions name an item, so the rules already answer them; no claim about an AI that isn't there. |
| Chat Worker deployed | Project account (polyeyed@gmail.com): https://mehngai-watch-chat.mehngai-watch-chat.workers.dev; KV `LIMITS`; key stored with `wrangler secret put` piped from `.env` (never printed or committed) | Separate from the Brand PitStop account; the address is public (it is in the site's code), the key is not. |
| Backup model | Worker tries `gemini-3.8-flash` (10 s), and on HTTP 503/429 falls back to `gemini-3.5-flash-lite` (18 s); both pinned | On deploy day the main Flash models answered "high demand" (503) for hours; Lite answered. Reading a question into fields is a simple task Lite handles: live test read 3 of 3 hard questions correctly (roti stuff → wheat flour/Lahore; white sweet stuff for chai → sugar/Karachi/change; hen meat → chicken/cheapest). |
| Limits count successes only | Check the limits before the AI call, count after a successful reading | An overloaded model must not use up a visitor's 3 daily tries. |
