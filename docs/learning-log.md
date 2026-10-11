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

## 2026-10-10 — v2: all 51 items, search, ask, live news

**Built** all 51 PBS items in three groups (market / fixed / government), `detect/changes.py` for set-price changes,
`search.py` (English / Roman Urdu / Urdu + typos), `ask.py` (question → structured lookup → answer from the DB),
`news.py` (Pakistani RSS headlines), a 3-page dashboard (Home with live news, Explore, Ask) and a 3-section report.

**Key concepts**
- *Profile before you generalise:* the same detector is wrong for set prices; the data showed three behaviours.
- *Sanity rules need exceptions grounded in reality:* a ×5.8 gas tariff hike was real.
- *LLM as a parser, not an oracle:* the AI turns a question into fields we validate; the database answers.
- *Keyword matching needs stop-lists:* "oil" in news is usually crude, "matches" is cricket.
- *Look at the screenshots:* a stale server, a colliding label and a misleading zero-based bar chart were all
  caught by viewing the real pages.

**Next** Phase 7 (bonus): GitHub Actions weekly run; optional free hosting on Streamlit Community Cloud.

## 2026-10-11 — v2.1: home page look and feel

**Built** `app/style.py` (one stylesheet + HTML builders): price ticker, live headline strip, unusual-move cards with
sparklines, set-price boards, headline cards with clickable item tags; light + dark mode; reduced-motion support.

**Key concepts**
- *CSS animation without JavaScript:* a ticker is a duplicated row moved by `translateX(-50%)` in a loop.
- *Sanitised HTML:* Streamlit strips `<svg>` and scripts from `st.html`, so the sparkline is an image (data URI).
- *Escape anything from outside:* news titles are text, never markup; links must be http(s).
- *Theme config gotcha:* setting one theme option creates a custom (light) theme; per-mode sections keep dark mode.
- *Verify visually, in both modes:* stale servers, stripped SVGs and forced light mode were all found in screenshots.

## 2026-10-11 — Phase 8a: website prototype (React)

**Built** `src/mehngai/export.py` (stage 8: JSON for the site, 5 tests) and `web/` — a React + TypeScript site: story
headline, count-up tiles, price ticker, live headline strip, unusual-move cards with sparklines, Pakistan city bubble
map, biggest movers, set-price boards, headline cards with filter, item quick-view, Ctrl+K search, method section.

**Key concepts**
- *Separation of concerns:* Python decides and computes; the website only presents exported JSON.
- *React components, props, state:* each section is a function that receives data (props); "which item is open"
  is state held in `App` and passed down as a callback.
- *Static site + build step:* Vite turns TypeScript/JSX into plain files; no server needed.
- *Honest visual encodings:* a min→max scale made a 0.6% spread look huge; scales must be anchored to meaning.
- *Accessibility and motion:* keyboard paths (Ctrl+K, Esc, arrows), reduced-motion support, colour never alone (▲▼).

**Next** Massab reviews the prototype → Phase 8b (item pages, browse, Ask, code-splitting) → 8c deploy with Phase 7.

## 2026-10-11 — Phase 8a: fintech redesign

**Built** a new home page modelled on fintech sites: dark hero with ticker tape and the Essentials index line,
Market summary (index chart with ranges, this week's signals, category cards), heatmap of all 51 items, sortable
watchlist, city map, news cards with live price strips, set prices, method band, light/dark toggle. New `index.json`.

**Key concepts**
- *Learn from references, don't copy:* list what the good sites have in common (dark hero, calm panels, one font,
  aligned numbers), then apply it to our own data.
- *An index:* chain each week's typical % change onto a starting value of 100 to get one number for "the basket".
- *Treemap:* nested rectangles; here every item gets equal area and colour carries the weekly change.
- *Scroll events vs IntersectionObserver:* the observer only fires when crossing a line, so a quick scroll left the
  top bar transparent; reading the hero's position on each scroll is simpler and always right.
- *YAML gotcha:* in `{ name: Bread (plain, small) }` the comma ends the value, so quote strings with commas.

**Next** Massab reviews the redesign → Phase 8b (item pages, browse, Ask, code-splitting) → 8c deploy with Phase 7.

## 2026-10-11 — theme fix + bug sweep

**Built** a working light/dark switch for the whole page and fixed nine bugs found by a click-through test
(search with Enter/Esc, quick reopen, failed loads, map labels, clipped hover, reduced motion, chart colours).

**Key concepts**
- *Design tokens:* colours are named variables (`--color-hero`); switching theme changes the variables, not the
  components. Hard-coded colours are what broke the switch.
- *Order of events:* the charts read colours during React's render, so the theme attribute must change first.
- *Keyboard events travel:* one Enter press is delivered again to whatever has focus next (keypress), so moving
  focus mid-keystroke can "click" a button. `preventDefault()` ends the keystroke where it was handled.
- *Test like a user:* a script that presses keys and clicks (Playwright) found bugs that reading the code missed.

**Next** Phase 8b (item pages, browse, Ask in the browser, code-splitting) → 8c deploy with Phase 7.

## 2026-10-11 — premium redesign ("Pakistan from orbit")

**Built** a cinematic hero drawn entirely in code: a curved planet, Pakistan's outline tilted in 3D, the 17 survey
cities lighting up, glowing roads, stars at night and a sun by day. Plus an alert bar, a new nav, floating price
cards, a framed "This week in prices" window, a statement section and a floating "Find a price" button.

**Key concepts**
- *Map projection:* turning longitude/latitude into x/y (squeezed by cos(latitude) so shapes stay true).
- *CSS 3D:* `perspective(...) rotateX(70deg)` lays a flat SVG map "on the ground", like the view from orbit.
- *Layered scenes:* separate day and night layers whose opacity flips with the theme give a smooth sunrise/sunset.
- *Design borrowing done well:* take the idea (cinematic hero, product window, alert bar), not the look, and fill it
  with your own content.

**Next** Phase 8b (item pages, browse, Ask in the browser, code-splitting) → 8c deploy with Phase 7.

## 2026-10-11 — wave hero, own layout

**Built** `WaveField.tsx`: an animated canvas of flowing line ribbons that drift slowly, speed up and bend around the
pointer, and ripple where you click. New two-column hero with a "This week's moves" card; normal buttons; removed the
pieces that copied the reference sites.

**Key concepts**
- *Canvas animation loop:* `requestAnimationFrame` redraws ~60 times a second; each strand is a sum of sine waves
  whose phase moves with time.
- *Easing toward a target:* speed and pointer strength move a few % toward their target each frame, so changes feel
  smooth instead of jumpy.
- *Smooth fields:* a push that flips direction suddenly tears lines apart; a push that grows from zero doesn't.
- *Respect the device:* pause when off screen, cap the pixel ratio, and draw a still frame for "reduce motion".

**Next** Phase 8b (item pages, browse, Ask in the browser, code-splitting) → 8c deploy with Phase 7.

## 2026-10-11 — making the hero animation smooth

**Fixed** the laggy hero: from ~10 to ~50 frames per second on a deliberately slowed CPU.

**Key concepts**
- *Measure before fixing:* switching parts off one at a time (blur, canvas) showed the real cost was painting lines.
- *Pixels cost time:* drawing at a lower resolution and letting the browser scale it up is a big, almost invisible win.
- *Adaptive quality:* watch how long frames take and lower the resolution only on machines that need it.
- *Do maths once:* values that depend only on the column (not the strand) are computed once per frame, not 58 times.

## 2026-10-11 — proving the numbers are right; a simpler site

**Built** `verify.py`, which compares our numbers with the figures PBS prints in its own reports, an 8-test data
accuracy suite, and a pipeline check for every new report. Simplified the site: plain search box, clear section
navigation (with a phone menu), five calm sections.

**Key concepts**
- *Independent verification:* check results against a source that didn't come from your own code. PBS prints its
  own previous-week and year-ago figures, so agreement there proves parsing, storage and formulas together.
- *Edge cases hide in gaps:* the year-ago bug only appeared in weeks after PBS skipped a report.
- *Prefer "–" to a guess:* a blank is honest; a number from the wrong week is misleading.
- *One rule, one place:* the year-ago logic existed twice; now it is one shared helper.

## 2026-10-11 — institutional restyle

**Restyled** the whole site as an editorial data terminal: serif headings, monospace numbers, sharp flat panels,
underlined tabs, muted brick-red / steel-blue data colours, waves muted under a veil.

**Key concepts**
- *Design tokens pay off:* fonts, radii and colours live in one `@theme` block; changing them restyles every
  component at once (e.g. all `rounded-xl` became 2px by changing one token).
- *Monospace for numbers:* every digit has the same width, so prices line up in columns.
- *Colour must still be checked:* muted colours can fail colour-blind separation; the palette checker confirmed
  the new pair.

## 2026-10-12 — the site is live

**Deployed** to https://massabibrahim13.github.io/Mehengai-Watch/ with GitHub Actions: a weekly run downloads the new PBS report, rebuilds everything, runs the
tests, commits the new data and publishes; an hourly run refreshes the news.

**Key concepts**
- *CI/CD:* a workflow file tells GitHub's free machines what to run and when (cron schedule, on push, by hand).
- *Cron syntax:* `30 11 * * 5` = minute 30, hour 11 (UTC), every Friday.
- *Secrets:* the API key lives encrypted in the repo settings and reaches the workflow as an environment variable;
  it never appears in the code or the logs.
- *Fresh machines:* every run starts empty, so whatever it needs must be in git or rebuilt; we committed the small
  parsed tables, not the large PDFs.
- *Rehearse before going live:* running the whole thing from a fresh clone first found nothing broken — the point.
