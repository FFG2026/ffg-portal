"use client";

import { useEffect, useState } from "react";
import { adminHeaders } from "../AdminShell";
import type { AmortChart } from "../../../lib/amortisation";

function Graph({ chart }: { chart: AmortChart }) {
  const W = 640;
  const H = 220;
  const pad = { l: 56, r: 12, t: 12, b: 24 };
  const live = chart.lines.map((l) => ({ date: l.date, balance: l.balance, settle: l.kind === "settlement" }));
  const first = chart.original[0];
  const startBal = first ? first.balance : live[0]?.balance || 0;
  const dates = [...chart.original.map((p) => p.date), ...live.map((p) => p.date)].filter(Boolean).sort();
  if (dates.length < 2) return null;
  const t0 = new Date(dates[0]).getTime();
  const t1 = new Date(dates[dates.length - 1]).getTime();
  const max = Math.max(startBal, ...chart.original.map((p) => p.balance), ...live.map((p) => p.balance), 1);
  const x = (d: string) => pad.l + ((new Date(d).getTime() - t0) / Math.max(1, t1 - t0)) * (W - pad.l - pad.r);
  const y = (b: number) => pad.t + (1 - Math.max(0, b) / max) * (H - pad.t - pad.b);
  const path = (pts: { date: string; balance: number }[]) =>
    pts.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.balance).toFixed(1)}`).join(" ");
  const livePts = [{ date: first?.date || live[0].date, balance: startBal }, ...live];
  const settleDots = live.filter((p) => p.settle);
  const showOriginal = settleDots.length > 0;
  const gbp0 = (n: number) => "£" + Math.round(n).toLocaleString("en-GB");
  const year = (d: string) => d.slice(0, 4);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", maxHeight: 260 }} role="img" aria-label="Balance over the term">
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={pad.l} x2={W - pad.r} y1={y(max * f)} y2={y(max * f)} stroke="currentColor" opacity={0.12} />
          <text x={pad.l - 6} y={y(max * f) + 4} fontSize="10" textAnchor="end" fill="currentColor" opacity={0.6}>
            {gbp0(max * f)}
          </text>
        </g>
      ))}
      <text x={pad.l} y={H - 6} fontSize="10" fill="currentColor" opacity={0.6}>{year(dates[0])}</text>
      <text x={W - pad.r} y={H - 6} fontSize="10" textAnchor="end" fill="currentColor" opacity={0.6}>{year(dates[dates.length - 1])}</text>
      {showOriginal && (
        <path d={path(chart.original)} fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" opacity={0.4} />
      )}
      <path d={path(livePts)} fill="none" stroke="#1473e6" strokeWidth="2.5" />
      {settleDots.map((p, i) => (
        <circle key={i} cx={x(p.date)} cy={y(p.balance)} r={5} fill="#d9534f" stroke="#fff" strokeWidth="1.5" />
      ))}
    </svg>
  );
}

export default function Amortisation({
  agreementNumber,
  version,
  gbp,
  formatDate,
}: {
  agreementNumber: string;
  /** Changes whenever the deal's rows change, so the chart rebuilds itself. */
  version: string;
  gbp: (n: number) => string;
  formatDate: (d: string | null) => string;
}) {
  const [chart, setChart] = useState<AmortChart | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/amortisation?agreement=${encodeURIComponent(agreementNumber)}&_=${Date.now()}`,
          { headers: adminHeaders(), cache: "no-store" }
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Could not load the chart");
        if (!cancelled) {
          setChart(json.chart);
          setError("");
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || "Could not load the chart");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agreementNumber, version]);

  if (error) return <div className="lookup-error">{error}</div>;
  if (!chart) return null;

  const hasSettlement = chart.lines.some((l) => l.kind === "settlement");
  const cell = { textAlign: "right" as const, padding: "4px 8px" };

  return (
    <div className="lookup-manual">
      <button type="button" className="lookup-manual-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? "Hide" : "Show"} amortisation chart
        {hasSettlement ? " (includes early settlement)" : ""}
      </button>
      {open && (
        <div className="lookup-manual-form" style={{ display: "block" }}>
          <p className="lookup-manual-help">
            Implied rate {(chart.rate_annual * 100).toFixed(2)}% a year ({(chart.rate_monthly * 100).toFixed(3)}% a month),
            worked out from the amount lent and the original rentals.
            {chart.vat_divisor !== 1 && " Finance lease: shown net of VAT."} It rebuilds from the deal&apos;s live
            rows each time, so an early settlement appears as its own line and the later rentals follow the new
            monthly.
          </p>
          {chart.rate_note && <p className="lookup-manual-help">{chart.rate_note}</p>}
          <Graph chart={chart} />
          <p className="lookup-manual-help">
            Blue is the balance now{hasSettlement ? "; the dashed line is the balance had nothing been settled early, and red dots are early settlements" : ""}.
          </p>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13, margin: "8px 0" }}>
            <span>Interest in rentals: <b className="mono">{gbp(chart.totals.interest)}</b></span>
            {hasSettlement && (
              <span>Interest in settlements: <b className="mono">{gbp(chart.totals.settlement_premium)}</b></span>
            )}
            <span>Capital repaid: <b className="mono">{gbp(chart.totals.capital)}</b></span>
            <span>Balance at the end: <b className="mono">{gbp(chart.closing_balance)}</b></span>
          </div>
          {Math.abs(chart.closing_balance) > 1 && (
            <p className="lookup-manual-help">
              The rows do not run the balance to nil. A settlement payment that took the place of a month&apos;s rental, or a part settlement that shortened the term, will do this.
            </p>
          )}
          <div style={{ maxHeight: 360, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ ...cell, textAlign: "left" }}>#</th>
                  <th style={{ ...cell, textAlign: "left" }}>Due</th>
                  <th style={cell}>Payment</th>
                  <th style={cell}>Interest</th>
                  <th style={cell}>Capital</th>
                  <th style={cell}>Balance</th>
                  <th style={{ ...cell, textAlign: "left" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {chart.lines.map((l, i) => (
                  <tr key={i} style={l.kind === "settlement" ? { background: "rgba(217,83,79,0.10)", fontWeight: 600 } : undefined}>
                    <td style={{ ...cell, textAlign: "left" }} className="mono">{l.n ?? "–"}</td>
                    <td style={{ ...cell, textAlign: "left" }}>
                      {formatDate(l.date)}
                      {l.kind === "settlement" && <div style={{ fontWeight: 400, fontSize: 12 }}>{l.label}</div>}
                    </td>
                    <td style={cell} className="mono">{gbp(l.payment)}</td>
                    <td style={cell} className="mono">{gbp(l.interest)}</td>
                    <td style={cell} className="mono">{gbp(l.capital)}</td>
                    <td style={cell} className="mono">{gbp(l.balance)}</td>
                    <td style={{ ...cell, textAlign: "left" }}>{l.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
