// "How we tested it": the detector backtest, the check against PBS's own printed figures, and the documented
// price shocks used as ground truth. Every number comes from evaluation.json (made by the Python pipeline).
import { ExternalLink } from "lucide-react";
import { dateLabel, shortName } from "../lib/format";
import type { Backtest, EvaluationFile, Item, Verification } from "../types";
import { Card, SectionHead } from "./ui";

const pct0 = (x: number) => `${Math.round(x * 100)}%`;
const n = (x: number) => x.toLocaleString("en-PK");
const monthYear = (iso: string) => dateLabel(iso).replace(/^\d+ /, "");

function DetectorTable({ bt, names }: { bt: Backtest; names: Record<string, string> }) {
  const events = bt.events.length;
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <h3 className="label text-ink">Four ways to spot an unusual week, replayed over history</h3>
        <p className="mt-1 text-sm text-muted">
          {bt.weeks} weeks ({monthYear(bt.first_week)} – {monthYear(bt.last_week)}), {bt.items} market-priced items. Each week is
          judged only with data up to that week, as if the site had been live.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="label">
            <tr className="border-b border-line">
              <th scope="col" className="px-5 py-3 font-semibold">Method</th>
              <th scope="col" className="px-5 py-3 text-right font-semibold">Alerts / week</th>
              <th scope="col" className="px-5 py-3 text-right font-semibold">Known shocks caught</th>
              <th scope="col" className="hidden px-5 py-3 text-right font-semibold md:table-cell">Alerts on the busiest item</th>
            </tr>
          </thead>
          <tbody>
            {bt.methods.map((m) => {
              const chosen = m.method === bt.production;
              return (
                <tr key={m.method} className={`border-b border-line last:border-0 ${chosen ? "bg-soft" : ""}`}>
                  <td className="px-5 py-3">
                    <span className="font-mono text-xs text-muted">{m.method.split("_")[0]}</span>{" "}
                    <span className="font-medium">{m.label}</span>
                    {chosen && <span className="ml-2 rounded-[2px] border border-accent px-1.5 py-0.5 text-[11px] font-semibold text-accent">in use</span>}
                  </td>
                  <td className="px-5 py-3 text-right font-mono">{m.alerts_per_week.toFixed(2)}</td>
                  <td className="px-5 py-3 text-right font-mono">{Math.round(m.recall * events)} of {events}</td>
                  <td className="hidden px-5 py-3 text-right md:table-cell">
                    <span className="font-mono">{pct0(m.top_item_share)}</span>{" "}
                    <span className="text-muted">({shortName(names[m.top_item] ?? m.top_item).toLowerCase()})</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line px-5 py-3 text-sm leading-relaxed text-muted">
        All four catch the same share of documented shocks. The one in use raises far fewer alarms than the fixed rule and
        doesn't spend them on one noisy item (the fixed rule puts about half on tomatoes). The more complex versions didn't
        do better, so the simpler one was kept.
      </p>
    </Card>
  );
}

function PbsCheck({ v }: { v: Verification }) {
  const now = v.checks[0];
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <h3 className="label text-ink">Checked against PBS's own figures</h3>
        <p className="mt-1 text-sm text-muted">
          Each PBS report also prints last week's price, the price a year ago and the % changes. We never use those columns,
          so comparing them with our numbers is an independent check. {n(v.reports)} reports, {monthYear(v.first_week)} – {monthYear(v.last_week)}.
        </p>
      </div>
      <div className="grid gap-px bg-line sm:grid-cols-[1fr_2fr]">
        <div className="bg-bg px-5 py-5">
          <p className="font-mono text-4xl font-medium">{now.match_pct?.toFixed(0)}%</p>
          <p className="mt-1 text-sm text-muted">of this-week prices match exactly ({n(now.match)} of {n(now.compared)})</p>
        </div>
        <table className="bg-bg text-sm">
          <tbody>
            {v.checks.slice(1).map((c) => (
              <tr key={c.check} className="border-b border-line last:border-0">
                <th scope="row" className="px-5 py-2 text-left font-normal text-muted">{c.check[0].toUpperCase() + c.check.slice(1)}</th>
                <td className="px-5 py-2 text-right font-mono">{c.match_pct?.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line px-5 py-3 text-sm leading-relaxed text-muted">
        The few differences are PBS later correcting an earlier week's figure, or a week missing from the archive.
      </p>
    </Card>
  );
}

function KnownShocks({ bt, names }: { bt: Backtest; names: Record<string, string> }) {
  const missed = new Set(bt.methods.find((m) => m.method === bt.production)?.missed ?? []);
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <h3 className="label text-ink">The documented price shocks we test against</h3>
        <p className="mt-1 text-sm text-muted">Collected from news coverage, each with its source. There is no official list of "abnormal" weeks, so we built one.</p>
      </div>
      <ol className="divide-y divide-line">
        {bt.events.map((e) => {
          const caught = !missed.has(e.id);
          return (
            <li key={e.id} className="grid gap-2 px-5 py-3 text-sm sm:grid-cols-[9rem_1fr_auto] sm:items-baseline">
              <span>
                <span className="font-medium">{shortName(names[e.item_id] ?? e.item_id)}</span>{" "}
                <span className="font-mono text-xs text-muted">{monthYear(e.start)}</span>
              </span>
              <span className="text-muted">
                {e.description}{" "}
                <a href={e.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-ink underline-offset-4 hover:underline">
                  {e.source} <ExternalLink size={12} aria-hidden="true" />
                </a>
              </span>
              <span className={`font-mono text-xs font-semibold ${caught ? "text-ink" : "text-muted"}`}>{caught ? "✓ caught" : "✗ missed"}</span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

export function Evidence({ evaluation, items }: { evaluation: EvaluationFile | null; items: Item[] }) {
  const bt = evaluation?.backtest, v = evaluation?.verification;
  if (!bt && !v) return null;
  const names = Object.fromEntries(items.map((i) => [i.item_id, i.name]));
  return (
    <section>
      <SectionHead id="evidence" eyebrow="How we tested it" title="Does it work?"
        sub="Two questions: are the numbers right, and do the alerts catch real price shocks without crying wolf?" />
      <div className="space-y-6">
        {v && <PbsCheck v={v} />}
        {bt && <DetectorTable bt={bt} names={names} />}
        {bt && <KnownShocks bt={bt} names={names} />}
        <p className="max-w-3xl text-sm leading-relaxed text-muted">
          <span className="font-semibold text-ink">Limits, honestly:</span> only {bt?.events.length ?? 8} documented shocks, so each
          one moves the score a lot. Items that swing wildly every year, like tomatoes, can have a real shock that still looks
          normal for them; that is where the missed shocks above come from. An alert is a statistical signal, not proof of
          hoarding or any cause.
        </p>
      </div>
    </section>
  );
}
