// "Ask about prices": a chat window for longer questions, separate from the plain search box.
// Short lookups ("price of sugar in Lahore") are answered instantly in the browser from PBS data (lib/ask.ts).
// Questions that want an explanation ("why", "is this normal", long questions, or ones the rules can't read) go to
// the price agent in our Cloudflare Worker: Gemini looks the facts up with tools and explains them, and every
// number it writes is checked against PBS data before it is sent. If the agent is busy, out of today's free limit,
// or its answer fails the check, the chat says so and gives the plain answer instead.
import { MessageSquare, Send, X } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { answer, parseRules, validateAI, wantsAgent, type Answer, type Question } from "../lib/ask";
import { fetchSeries } from "../lib/data";
import { moneyExact } from "../lib/format";
import type { CitiesFile, Item, Summary } from "../types";

const CHAT_URL = import.meta.env.VITE_CHAT_URL;
const EXAMPLES = ["Price of sugar in Lahore", "How much has petrol gone up since last year?",
  "What happened to prices this week?", "Is the price of tomatoes normal right now?"];

interface Message { from: "you" | "us"; text: string; table?: Answer["table"]; aiHelped?: boolean; agent?: boolean; note?: string }
type Problem = "limited" | "busy" | "unchecked";

// **bold**, [title](https://…) and bare https:// links; everything else stays plain text (never injected as HTML)
const TOKENS = /(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s)]+)/g;

function Rich({ text }: { text: string }) {
  return <>{text.split(TOKENS).map((part, i) => {
    if (i % 2 === 0) return <span key={i}>{part}</span>;
    if (part.startsWith("**")) return <strong key={i} className="font-semibold text-ink">{part.slice(2, -2)}</strong>;
    const md = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    return (
      <a key={i} href={md ? md[2] : part} target="_blank" rel="noopener noreferrer"
        className="break-words underline decoration-line underline-offset-2 hover:decoration-ink">{md ? md[1] : part}</a>
    );
  })}</>;
}

async function post(path: string, question: string, seconds: number): Promise<{ data?: Record<string, unknown>; problem?: Problem }> {
  try {
    const res = await fetch(`${CHAT_URL!.replace(/\/$/, "")}/${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }),
      signal: AbortSignal.timeout(seconds * 1_000),
    });
    if (res.status === 429) return { problem: "limited" };
    if (!res.ok) return { problem: "busy" };
    return { data: await res.json() };
  } catch {
    return { problem: "busy" };
  }
}

/** The price agent's explained answer, or why there isn't one. It can take up to a minute (several AI turns). */
async function askAgent(question: string): Promise<{ text?: string; problem?: Problem }> {
  const { data, problem } = await post("agent", question, 100);
  if (problem) return { problem };
  return typeof data?.answer === "string" && data.answer.trim() ? { text: data.answer } : { problem: "unchecked" };
}

const NOTES: Record<Problem, string> = {
  limited: "The AI analyst has given today's limit of explained answers, so here is the plain answer.",
  busy: "The AI analyst is busy right now, so here is the plain answer. Try again later.",
  unchecked: "The AI's explanation didn't pass our number check, so here is the plain answer.",
};

export function ChatBubble({ show, items, cities, summary }: { show: boolean; items: Item[]; cities: CitiesFile; summary: Summary }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<"" | "rules" | "agent">("");
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
    let q: Question = parseRules(question, items, cityNames, summary.week);
    let note: string | undefined;
    let tryReading = !q.itemIds.length && !!CHAT_URL;     // ask the AI to read a question the rules couldn't
    if (CHAT_URL && wantsAgent(q)) {
      setBusy("agent");
      const agent = await askAgent(question);
      if (agent.text) {
        setMessages((m) => [...m, { from: "us", text: agent.text!, agent: true }]);
        setBusy("");
        return;
      }
      note = NOTES[agent.problem!];
      tryReading &&= agent.problem !== "busy";            // the AI is down: don't make them wait twice
    }
    setBusy("rules");
    if (tryReading) {
      const ai = await post("parse", question, 30);
      const read = ai.data ? validateAI(ai.data, question, items, cityNames, summary.week) : null;
      if (read?.itemIds.length) q = read;
      else if (!note && ai.problem === "limited") note = "The AI helper has used up today's free limit, so I could only match item names.";
      else if (!note && ai.problem === "busy") note = "The AI helper is busy right now, so I could only match item names. Try again later or name the item.";
    }
    try {
      const a = await answer(q, items, fetchSeries);
      setMessages((m) => [...m, { from: "us", text: a.text, table: a.table, aiHelped: q.via === "ai", note }]);
    } catch {
      setMessages((m) => [...m, { from: "us", text: "Sorry, I couldn't load the price history just now. Please try again." }]);
    }
    setBusy("");
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
                  <p>Ask about any item PBS tracks: a price, a city, a change over time, or whether a move is normal. English, Roman Urdu or Urdu.</p>
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
                      {m.note && <p className="text-xs text-muted">{m.note}</p>}
                      {m.text.split("\n\n").map((para, j) => (
                        <p key={j} className="whitespace-pre-line"><Rich text={para.replace(/^[*-] /gm, "• ")} /></p>
                      ))}
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
                      {m.agent && <p className="label">Explained by AI from PBS data · every number checked</p>}
                      {m.aiHelped && <p className="label">Question read with AI help · numbers from PBS data</p>}
                    </div>
                  )}
                </div>
              ))}
              {busy === "agent" && <p className="text-muted">Looking up the data and thinking it through… (can take up to a minute)</p>}
              {busy === "rules" && <p className="text-muted">Looking it up…</p>}
            </div>

            <form onSubmit={(e) => { e.preventDefault(); ask(draft); }} className="flex gap-2 border-t border-line p-3">
              <input ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={300}
                placeholder="e.g. is the price of sugar normal right now?" aria-label="Your question"
                className="h-10 min-w-0 flex-1 rounded-[2px] border border-line bg-bg px-3 text-sm text-ink outline-none placeholder:text-muted focus:border-ink focus-visible:outline-none" />
              <button type="submit" disabled={!!busy || !draft.trim()} aria-label="Ask"
                className="flex h-10 w-10 items-center justify-center rounded-[2px] bg-ink text-bg disabled:opacity-40"><Send size={16} /></button>
            </form>
            <p className="border-t border-line px-4 py-2 text-[11px] leading-snug text-muted">
              Every number comes from PBS data.{CHAT_URL && " Questions about why or whether a price is normal are explained by an AI, and every number it writes is checked first."}
            </p>
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}
