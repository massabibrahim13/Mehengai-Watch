"""Stage 6b — the LLM call, behind one small function so the provider can be swapped.

Provider: Google Gemini (free tier) over its REST API with `requests` — no extra SDK needed.
The API key is read from .env (LLM_API_KEY) and never logged.
"""
from __future__ import annotations

import logging
import os
import time

import requests
from dotenv import load_dotenv

from mehngai.config import PROJECT_ROOT

log = logging.getLogger(__name__)

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


class LLMError(RuntimeError):
    """The LLM could not produce an answer (network, quota, blocked, empty)."""


def api_key() -> str:
    load_dotenv(PROJECT_ROOT / ".env")
    key = os.getenv("LLM_API_KEY")
    if not key:
        raise LLMError("LLM_API_KEY missing — add it to .env (see .env.example)")
    return key


def retry_delay(resp: requests.Response) -> int | None:
    """Seconds the API asks us to wait: Gemini puts it in error.details[RetryInfo].retryDelay ("36s")."""
    try:
        for detail in resp.json().get("error", {}).get("details", []):
            if detail.get("@type", "").endswith("RetryInfo"):
                return int(float(detail["retryDelay"].rstrip("s"))) + 1
    except (ValueError, KeyError, AttributeError):
        pass
    header = resp.headers.get("Retry-After")
    return int(header) if header and header.isdigit() else None


def generate(prompt: str, cfg: dict, json_mode: bool = False) -> str:
    """Send one prompt, return the model's text. Retries on rate limits (HTTP 429/503).
    json_mode=True asks the model for a JSON object only (used to read questions into fields).

    This is the only function that knows which provider we use.
    """
    if cfg["provider"] != "gemini":
        raise LLMError(f"unknown provider {cfg['provider']!r}")
    generation = {"temperature": cfg["temperature"]}
    if json_mode:
        generation["responseMimeType"] = "application/json"
    body = {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": generation}
    for attempt in range(cfg["max_retries_on_rate_limit"] + 1):
        try:
            resp = requests.post(GEMINI_URL.format(model=cfg["model"]), json=body,
                                 headers={"x-goog-api-key": api_key()}, timeout=cfg["timeout_seconds"])
        except requests.RequestException as exc:
            raise LLMError(f"network error: {exc}") from exc
        if resp.status_code in (429, 503) and attempt < cfg["max_retries_on_rate_limit"]:
            wait = retry_delay(resp) or 20 * (attempt + 1)
            if wait > cfg["max_wait_seconds"]:
                # e.g. the free tier's daily request cap (20/day): waiting hours is pointless
                raise LLMError(f"quota exhausted; API says retry in {wait}s")
            log.warning("rate limited (HTTP %d), waiting %ds", resp.status_code, wait)
            time.sleep(wait)
            continue
        if not resp.ok:
            raise LLMError(f"HTTP {resp.status_code}: {resp.text[:200]}")
        parts = (resp.json().get("candidates") or [{}])[0].get("content", {}).get("parts", [])
        text = " ".join(p["text"] for p in parts if "text" in p and not p.get("thought")).strip()
        if not text:
            raise LLMError("empty response (blocked or no candidates)")
        return text
    raise LLMError("still rate limited after retries")
