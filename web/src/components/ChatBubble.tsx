// "Ask about prices": a chat window for longer questions, separate from the plain search box.
// Answers are computed from PBS data in the browser (lib/ask.ts). Only when the simple rules can't tell which item a
// question is about does it ask the AI (our Cloudflare Worker → Gemini) to read the question — the AI never writes a
// number. If the AI is busy or today's free limit is used up, the chat says so and falls back to the rules.
import { MessageSquare, Send, X } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { answer, parseRules, validateAI, type Answer, type Question } from "../lib/ask";
import { fetchSeries } from "../lib/data";
import { moneyExact } from "../lib/format";
import type { CitiesFile, Item, Summary } from "../types";

const CHAT_URL = import.meta.env.VITE_CHAT_URL;
const EXAMPLES = ["Price of sugar in Lahore", "Cheapest city for aata", "How much has petrol gone up since last year?", "Tomatoes in Karachi in March 2024"];

interface Message { from: "you" | "us"; text: string; table?: Answer["table"]; aiHelped?: boolean; note?: string }

/** **bold** → <strong>, everything else plain text (never injected as HTML). */
function Rich({ text }: { text: string }) {
  return <>{text.split("**").map((part, i) => (i % 2 ? <strong key={i} className="font-semibold text-ink">{part}</strong> : <span key={i}>{part}</span>))}</>;
}

async function readWithAI(text: string): Promise<{ data?: unknown; problem?: "limited" | "busy" }> {
  try {
    const res = await fetch(`${CHAT_URL!.replace(/\/$/, "")}/parse`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text }),
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 429) return { problem: "limited" };
    if (!res.ok) return { problem: "busy" };
    return { data: await res.json() };
  } catch {
    return { problem: "busy" };
  }
}

export function ChatBubble({ show, items, cities, summary }: { show: boolean; items: Item[]; cities: CitiesFile; summary: Summary }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const cityNames = cities.cities.map((c) => c.name);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); // braces: scrollTo may return a promise
  }, [messages, busy]);

  const ask = async (text: string) => {
    const question = text.trim().slice(0, 300);
    if (!question || busy) return;
    setDraft("");
    setMessages((m) => [...m, { from: "you", text: question }]);
    setBusy(true);
    let q: Question = parseRules(question, items, cityNames, summary.week);
    let note: string | undefined;
    if (!q.itemIds.length && CHAT_URL) {
      const ai = await readWithAI(question);
      const read = ai.data ? validateAI(ai.data, question, items, cityNames, summary.week) : null;
      if (read?.itemIds.length) q = read;
      else if (ai.problem === "limited") note = "The AI helper has used up today's free limit, so I could only match item names.";
      else if (ai.problem === "busy") note = "The AI helper is busy right now, so I could only match item names. Try again later or name the item.";
    }
    try {
      const a = await answer(q, items, fetchSeries);
      setMessages((m) => [...m, { from: "us", text: a.text, table: a.table, aiHelped: q.via === "ai", note }]);
    } catch {
      setMessages((m) => [...m, { from: "us", text: "Sorry, I couldn't load the price history just now. Please try again." }]);
    }
    setBusy(false);
  };

  return (
    <>
      <AnimatePresence>
        {show && !open && (
          <m.button ref={buttonRef} type="button" onClick={() => setOpen(true)} aria-label="Ask about prices" aria-expanded={open}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
            className="fixed bottom-5 right-5 z-30 flex h-11 items-center gap-2 rounded-[2px] border border-line bg-ink px-4 text-sm font-semibold text-bg hover:opacity-90">
            <MessageSquare size={17} aria-hidden="true" /> Ask about prices
          </m.button>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {open && (
          <m.div role="dialog" aria-label="Ask about prices" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
            className="fixed bottom-0 right-0 z-50 flex h-[min(600px,85vh)] w-full flex-col border border-line bg-overlay sm:bottom-5 sm:right-5 sm:w-[420px] sm:rounded-[2px]">
            <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
              <div>
                <h2 className="font-serif text-lg font-bold">Ask about prices</h2>
                <p className="text-xs text-muted">51 essentials · 17 cities · weekly since Sep 2019</p>
              </div>
              <button type="button" onClick={() => { setOpen(false); buttonRef.current?.focus(); }} aria-label="Close"
                className="chip flex h-8 w-8 items-center justify-center rounded-[2px] border border-line text-muted hover:text-ink"><X size={16} /></button>
            </div>

            <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm" aria-live="polite">
              {!messages.length && (
                <div className="text-muted">
                  <p>Ask about any item PBS tracks — a price, a city, a change over time. English, Roman Urdu or Urdu.</p>
                  <ul className="mt-3 space-y-1.5">
                    {EXAMPLES.map((e) => (
                      <li key={e}><button type="button" onClick={() => ask(e)} className="text-left text-ink underline decoration-line underline-offset-4 hover:decoration-ink">{e}</button></li>
                    ))}
                  </ul>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} data-from={m.from} className={m.from === "you" ? "ml-10 border border-line bg-soft px-3 py-2" : "mr-4"}>
                  {m.from === "you" ? m.text : (
                    <div className="space-y-2 leading-relaxed text-ink/90">
                      {m.text.split("\n\n").map((para, j) => <p key={j}><Rich text={para} /></p>)}
                      {m.table && (
                        <table className="w-full border-t border-line text-xs">
                          <tbody>
                            {m.table.rows.map((r) => (
                              <tr key={r.city} className="border-b border-line">
                                <td className="py-1 pr-2">{r.city}</td>
                                <td className="py-1 text-right font-mono">{moneyExact(r.price)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      {m.note && <p className="text-xs text-muted">{m.note}</p>}
                      {m.aiHelped && <p className="label">Question read with AI help · numbers from PBS data</p>}
                    </div>
                  )}
                </div>
              ))}
              {busy && <p className="text-muted">Looking it up…</p>}
            </div>

            <form onSubmit={(e) => { e.preventDefault(); ask(draft); }} className="flex gap-2 border-t border-line p-3">
              <input ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={300}
                placeholder="e.g. cheapest city for cooking oil" aria-label="Your question"
                className="h-10 min-w-0 flex-1 rounded-[2px] border border-line bg-bg px-3 text-sm text-ink outline-none placeholder:text-muted focus:border-ink focus-visible:outline-none" />
              <button type="submit" disabled={busy || !draft.trim()} aria-label="Ask"
                className="flex h-10 w-10 items-center justify-center rounded-[2px] bg-ink text-bg disabled:opacity-40"><Send size={16} /></button>
            </form>
            <p className="border-t border-line px-4 py-2 text-[11px] leading-snug text-muted">
              Every number comes from PBS data.{CHAT_URL && " An AI only helps understand hard-to-read questions; it never writes the numbers."}
            </p>
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}

