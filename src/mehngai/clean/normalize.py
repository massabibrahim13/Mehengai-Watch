"""Stage 3a — Normalise: map raw Appendix-A rows to our canonical tracked items.

In:  interim CSVs (one per report, all 51 items × 18 cities, raw names).
Out: rows for the 8 tracked items only, with item_id, unit and week_date — plus a list of rows
     whose SL number pointed at a tracked item but whose name didn't match (possible layout change).
"""
from __future__ import annotations

import logging
import re
from datetime import date
from pathlib import Path

import pandas as pd
import yaml

from mehngai.config import CONFIG_DIR, INTERIM_DIR

log = logging.getLogger(__name__)

REJECT_COLUMNS = ["week_date", "item_id", "city", "sl_no", "item_raw", "price", "reason"]


def load_items() -> tuple[date, list[dict]]:
    """Read config/items.yaml → (series_start, list of item dicts)."""
    with open(CONFIG_DIR / "items.yaml", encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    return cfg["series_start"], cfg["items"]


def letters_only(text: str) -> str:
    """'Vegetable Ghee DALDA/HABIB 2.5' → 'vegetablegheedaldahabib25'.

    Digits are kept so the 2.5 kg tin can't pass as the '... or Other superior' 1 kg pouch."""
    return re.sub(r"[^a-z0-9]", "", str(text).lower())


def name_matches(raw: str, prefix: str, min_chars: int) -> bool:
    """True if the raw name and the expected prefix start the same way.

    Garbled names get cut short ("Chicken F"), so we accept either one being a prefix of the
    other, as long as at least `min_chars` letters agree.
    """
    a, b = letters_only(raw), letters_only(prefix)
    shorter = min(len(a), len(b))
    return shorter >= min_chars and a[:shorter] == b[:shorter]


def read_interim(interim_dir: Path = INTERIM_DIR) -> pd.DataFrame:
    """Concatenate all interim CSVs into one DataFrame."""
    files = sorted(interim_dir.glob("*_annex.csv"))
    if not files:
        raise FileNotFoundError(f"no interim CSVs in {interim_dir} — run mehngai.ingest.parse first")
    return pd.concat((pd.read_csv(f) for f in files), ignore_index=True)


def normalize(raw: pd.DataFrame, items: list[dict], series_start: date,
              min_chars: int) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Keep tracked items from series_start on; return (matched rows, name-mismatch rejects)."""
    raw = raw[raw["report_date"] >= series_start.isoformat()]
    by_sl = {item["sl_no"]: item for item in items}
    tracked = raw[raw["sl_no"].isin(by_sl)].copy()

    tracked["item_id"] = tracked["sl_no"].map(lambda sl: by_sl[sl]["item_id"])
    tracked["unit"] = tracked["sl_no"].map(lambda sl: by_sl[sl]["unit"])
    ok = [name_matches(r, by_sl[sl]["name_prefix"], min_chars)
          for r, sl in zip(tracked["item_raw"], tracked["sl_no"])]
    tracked["name_ok"] = ok

    tracked = tracked.rename(columns={"report_date": "week_date", "price_avg": "price"})
    mismatched = tracked[~tracked["name_ok"]].assign(
        reason=lambda d: "name mismatch at SL " + d["sl_no"].astype(str))
    if len(mismatched):
        log.warning("%d rows where the SL number's name didn't match (see rejected_rows)",
                    len(mismatched))
    matched = tracked[tracked["name_ok"]][
        ["week_date", "item_id", "unit", "city", "price", "price_min", "price_max", "sl_no", "item_raw"]]
    return matched.reset_index(drop=True), mismatched[REJECT_COLUMNS].reset_index(drop=True)
