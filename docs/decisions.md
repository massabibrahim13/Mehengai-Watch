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
