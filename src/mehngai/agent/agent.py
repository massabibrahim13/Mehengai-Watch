"""The price agent: answers questions about Pakistan's essential prices with explanations, from PBS data.

One question, step by step:
  1. Gemini gets the question, a brief (prompts/system.txt: what the data is, how to work, the rules) and five
     data tools (tools.py). It decides which tools to call; we run them and send the results back.
  2. That repeats until it has what it needs (at most `max_steps` model turns; on the last one it must answer).
  3. Guardrail, same idea as the weekly explanations: every number in the answer must appear in a tool result,
     no causes or blame, not too long. A failing answer is rewritten once with the problems listed; if it still
     fails, or the AI is unavailable, the plain rules answer from ask.py is used instead.

LangSmith records each question as one trace (the model's reasoning summary, every tool call and result, the
guardrail, token use) when .env has LANGSMITH_TRACING=true and LANGSMITH_API_KEY. Without them, @traceable
does nothing and the agent works the same.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv
from langsmith import traceable
from langsmith.run_helpers import get_current_run_tree

from mehngai.agent import tools
from mehngai.ask import answer, understand
from mehngai.config import PROJECT_ROOT, load_settings
from mehngai.explain.facts import label, unit_phrase
from mehngai.explain.guardrails import allowed_numbers, numbers_in
from mehngai.explain.llm import LLMError, post

load_dotenv(PROJECT_ROOT / ".env")   # LangSmith reads LANGSMITH_* from the environment

log = logging.getLogger(__name__)

SYSTEM_FILE = Path(__file__).parent / "prompts" / "system.txt"
GROUP_SHORT = {"market": "market", "administered": "government-set", "fixed": "packaged"}
REWRITE = ("Your answer broke these rules: {problems}. Rewrite it. Use only numbers that appear in the tool "
           "results, copied as they are (don't calculate new ones), don't state causes or blame anyone, and stay "
           "under {max_words} words.")


@dataclass
class Reply:
    text: str = ""
    source: str = "agent"                # "agent" | "agent, rewritten" | "rules" (the AI's answer wasn't used)
    tool_calls: list[dict] = field(default_factory=list)    # {"name", "args"} in the order called
    model_turns: int = 0
    rewritten_because: list[str] = field(default_factory=list)   # guardrail problems with the first answer
    problems: list[str] = field(default_factory=list)       # why the AI's answer wasn't used (empty if it was)


def settings() -> dict:
    s = load_settings()
    return {**s["explain"], **s["agent"]}


def brief(cfg: dict) -> str:
    """The system prompt: prompts/system.txt with the date, item list and cities filled in."""
    d = tools.data()
    catalogue = "\n".join(
        f"- {i}: {it['name']}, {unit_phrase(it['unit'])}, {GROUP_SHORT[it['price_type']]}"
        + (f"; also: {', '.join(it['aliases'][:5])}" if it.get("aliases") else "")
        for i, it in sorted(d.items.items()))
    return (SYSTEM_FILE.read_text(encoding="utf-8").replace("{latest}", label(d.latest))
            .replace("{catalogue}", catalogue).replace("{cities}", ", ".join(d.cities))
            .replace("{max_words}", str(cfg["max_words"])))


# ── the model ────────────────────────────────────────────────────────────────────

@traceable(run_type="llm", name="Gemini", metadata={"ls_provider": "google_genai"},
           process_inputs=lambda inputs: {k: v for k, v in inputs.items() if k != "cfg"})
def call_model(system: str, contents: list[dict], cfg: dict, final: bool = False) -> dict:
    """One model turn. final=True forbids tool calls, so the model has to answer now."""
    generation = {"temperature": cfg["temperature"]}
    if cfg.get("show_thinking"):
        generation["thinkingConfig"] = {"includeThoughts": True}
    body = {"systemInstruction": {"parts": [{"text": system}]}, "contents": contents,
            "tools": [{"functionDeclarations": tools.declarations()}], "generationConfig": generation}
    if final:
        body["toolConfig"] = {"functionCallingConfig": {"mode": "NONE"}}
    response, model = post(body, cfg)
    run = get_current_run_tree()
    if run is not None:
        run.metadata["ls_model_name"] = model     # LangSmith shows the model (it may be the backup) and its cost
    candidate = (response.get("candidates") or [{}])[0]
    content = candidate.get("content") or {"role": "model", "parts": []}
    usage = response.get("usageMetadata", {})
    return {
        "model": model,
        "content": content,
        "thinking": " ".join(p["text"] for p in content.get("parts", []) if p.get("thought") and "text" in p),
        "finish_reason": candidate.get("finishReason"),
        "usage_metadata": {"input_tokens": usage.get("promptTokenCount", 0),
                           "output_tokens": usage.get("candidatesTokenCount", 0) + usage.get("thoughtsTokenCount", 0),
                           "total_tokens": usage.get("totalTokenCount", 0)},
    }


def run_tool(call: dict) -> dict:
    """Run one tool the model asked for; a bad request comes back as an error the model can read."""
    name, args = call.get("name", ""), call.get("args") or {}
    fn = tools.TOOLS.get(name)
    if fn is None:
        return {"error": f"there is no tool called {name!r}"}
    try:
        return traceable(run_type="tool", name=name)(fn)(**args)
    except TypeError as exc:                       # wrong or missing arguments
        return {"error": f"bad arguments for {name}: {exc}"}


def converse(system: str, contents: list[dict], cfg: dict, reply: Reply, results: list[dict]) -> str:
    """Model turns and tool calls until the model answers in words. Appends to contents/results/reply."""
    for step in range(cfg["max_steps"]):
        out = call_model(system, contents, cfg, final=step == cfg["max_steps"] - 1)
        reply.model_turns += 1
        cfg["model"] = out.get("model", cfg["model"])   # main model busy? stay on the backup for this question
        content = out["content"]
        contents.append(content)
        calls = [p["functionCall"] for p in content.get("parts", []) if "functionCall" in p]
        if not calls:
            text = "".join(p.get("text", "") for p in content.get("parts", []) if not p.get("thought")).strip()
            if not text:
                raise LLMError(f"no answer (finish reason: {out['finish_reason']})")
            return text
        answers = []
        for call in calls:
            result = run_tool(call)
            reply.tool_calls.append({"name": call.get("name"), "args": call.get("args") or {}})
            results.append(result)
            response = {"name": call.get("name"), "response": result}
            if call.get("id"):
                response["id"] = call["id"]
            answers.append({"functionResponse": response})
        contents.append({"role": "user", "parts": answers})
    raise LLMError(f"no answer after {cfg['max_steps']} model turns")


# ── the guardrail ────────────────────────────────────────────────────────────────

def headlines(results: list[dict]) -> list[str]:
    return [h["title"] for r in results for h in r.get("headlines", [])]


def guard_context() -> dict:
    """Numbers an answer may use besides the tool results and the question: facts stated in the brief
    (51 items, 17 cities, 52 reports, Sep 2019, item names and units). Published for the Worker too."""
    return {"brief": [51, 17, 52, "Sep 2019"],
            "items": [f"{it['name']} {it['unit']}" for it in tools.data().items.values()]}


@traceable(run_type="chain", name="guardrail")
def check(text: str, results: list[dict], question: str, cfg: dict) -> list[str]:
    """Problems with an answer (empty = it may be shown). The website's Worker runs the same check
    (worker/src/guard.ts; tests/test_agent.py keeps the two in step)."""
    allowed = allowed_numbers({"tools": results, "question": question, **guard_context()})
    problems = []
    invented = sorted({n for n in numbers_in(text) if round(n, 2) not in allowed})
    if invented:
        problems.append(f"numbers that are not in the tool results: {invented}")
    plain = text
    for title in headlines(results):     # quoting a headline is fine, even one that names a cause
        plain = plain.replace(title, "")
    hits = [p for p in cfg["banned_phrases"] if p in plain.lower()]
    if hits:
        problems.append(f"states a cause or blames someone: {hits}")
    words = len(text.split())
    if words > cfg["max_words"]:
        problems.append(f"too long ({words} words, at most {cfg['max_words']})")
    return problems


# ── one question ─────────────────────────────────────────────────────────────────

def rules_answer(question: str) -> str:
    """The plain answer from ask.py (rules only, no AI): the fallback."""
    d = tools.data()
    q = understand(question, d.items, [tools.NATIONAL, *d.cities], d.latest)
    return answer(q, d.prices, d.items).text


@traceable(run_type="chain", name="Mehngai Watch agent")
def ask(question: str, cfg: dict | None = None) -> Reply:
    """Answer one question. Never raises for AI problems: falls back to the rules answer."""
    cfg = dict(cfg or settings())          # a copy: converse() may switch it to the backup model
    system = brief(cfg)
    contents = [{"role": "user", "parts": [{"text": question}]}]
    reply, results = Reply(), []
    try:
        text = converse(system, contents, cfg, reply, results)
        problems = check(text, results, question, cfg)
        if problems:
            log.info("answer rejected (%s), asking for a rewrite", "; ".join(problems))
            reply.rewritten_because = problems
            contents.append({"role": "user", "parts": [{"text": REWRITE.format(
                problems="; ".join(problems), max_words=cfg["max_words"])}]})
            text = converse(system, contents, {**cfg, "max_steps": 2}, reply, results)   # one more look-up at most
            problems = check(text, results, question, cfg)
            reply.source = "agent, rewritten"
        if not problems:
            reply.text = text
            return reply
        reply.problems = problems
    except LLMError as exc:
        log.warning("AI unavailable: %s", exc)
        reply.problems = [f"AI unavailable: {exc}"]
    reply.text, reply.source = rules_answer(question), "rules"
    return reply
