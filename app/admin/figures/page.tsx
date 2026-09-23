"use client";

import { useCallback, useState } from "react";
import AdminShell, { adminHeaders } from "../AdminShell";
import { useBookReload } from "../../../lib/admin-book-reload";
import PageHero from "../PageHero";
import type { LivePortfolio } from "../../../lib/portfolio-live";
import type { GlacierPortfolio } from "../../../lib/glacier-portfolio";
import { MIX_COLOURS, type FiguresDashboard } from "../../../lib/figures-dashboard";
import FiguresTop from "./FiguresTop";
import {
  LATEST_MONTH_KEY,
  MONTHLY_FIGURES,
  monthLabel,
  monthlyFiguresAt,
  neighbouringMonth,
} from "../../../lib/monthly-figures";

type WithDashboard<T> = T & { dashboard?: FiguresDashboard };

const gbp = (n: number | null | undefined) => {
  if (n == null) return "";
  return `£${Number(n).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const pct = (n: number) =>
  `${n.toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

/** A figure with a share bar underneath — the same number, read twice. */
function BarCell({ value, share }: { value: string; share: number }) {
  return (
    <span className="book-cell">
      {value}
      <span className="book-bar" aria-hidden="true">
        <i style={{ width: `${Math.max(0, Math.min(100, share))}%` }} />
      </span>
    </span>
  );
}

function initialsOf(name: string) {
  return name.trim().slice(0, 2).toUpperCase();
}

export default function OwnerFiguresPage() {
  return (
    <AdminShell>
      <FiguresInner />
    </AdminShell>
  );
}

function FiguresInner() {
  const [ffg, setFfg] = useState<WithDashboard<LivePortfolio> | null>(null);
  const [gg, setGg] = useState<WithDashboard<GlacierPortfolio> | null>(null);
  const [monthKey, setMonthKey] = useState("");
  const [error, setError] = useState("");
  const [cashText, setCashText] = useState("");
  const [savingCash, setSavingCash] = useState(false);
  const [cashMsg, setCashMsg] = useState("");
  const [loading, setLoading] = useState(true);

  const applyCash = (amount: number) => {
    setCashText(
      Number(amount).toLocaleString("en-GB", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  };

  const load = useCallback(async (month?: string) => {
    setLoading(true);
    const qs = new URLSearchParams({ t: String(Date.now()) });
    if (month) qs.set("month", month);
    const res = await fetch(`/api/admin/portfolio?${qs}`, {
      method: "POST",
      headers: {
        ...adminHeaders(),
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      body: JSON.stringify({ refresh: true }),
      cache: "no-store",
    });
    if (res.status === 403) {
      setError("This page is only for Owen Brunning.");
      setFfg(null);
      setGg(null);
      setLoading(false);
      return;
    }
    if (!res.ok) {
      setError("Couldn't load the live figures.");
      setLoading(false);
      return;
    }
    setError("");
    const json = await res.json();
    if (json.dashboard?.month_key) setMonthKey(json.dashboard.month_key);
    if (json.shareholders?.[0]?.investment != null) {
      setGg(json);
      setFfg(null);
      applyCash(json.summary.cash_at_bank);
    } else {
      setFfg(json);
      setGg(null);
      applyCash(json.summary.cash_at_bank);
    }
    setLoading(false);
  }, []);

  const saveCash = async () => {
    setSavingCash(true);
    setCashMsg("");
    try {
      const res = await fetch("/api/admin/portfolio", {
        method: "PATCH",
        headers: {
          ...adminHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ cash_at_bank: cashText }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCashMsg(json.error || "Couldn't save cash at bank.");
        return;
      }
      if (json.shareholders?.[0]?.investment != null) {
        setGg(json);
        setFfg(null);
      } else {
        setFfg(json);
        setGg(null);
      }
      applyCash(json.summary.cash_at_bank);
      setCashMsg("Cash at bank saved.");
    } catch {
      setCashMsg("Couldn't save cash at bank.");
    } finally {
      setSavingCash(false);
    }
  };

  useBookReload(load);

  const pickMonth = (key: string) => {
    setMonthKey(key);
    load(key);
  };

  if (error && !ffg && !gg) {
    return (
      <>
        <PageHero title="Live figures" subtitle="Could not load the book." />
        <div className="admin-error">{error}</div>
      </>
    );
  }

  if (loading && !ffg && !gg) {
    return (
      <>
        <PageHero title="Live figures" subtitle="Loading the book…" />
        <div className="dashboard-loading">Loading live figures…</div>
      </>
    );
  }

  if (gg) {
    return (
      <GlacierFigures
        data={gg}
        monthKey={monthKey}
        onMonth={pickMonth}
        cashText={cashText}
        setCashText={setCashText}
        saveCash={saveCash}
        savingCash={savingCash}
        cashMsg={cashMsg}
        setCashMsg={setCashMsg}
        onReload={() => load(monthKey)}
      />
    );
  }

  if (!ffg) return null;

  return (
    <FfgFigures
      data={ffg}
      monthKey={monthKey}
      onMonth={pickMonth}
      cashText={cashText}
      setCashText={setCashText}
      saveCash={saveCash}
      savingCash={savingCash}
      cashMsg={cashMsg}
      setCashMsg={setCashMsg}
      onReload={() => load(monthKey)}
    />
  );
}

/** Flattens the dashboard into a spreadsheet the book can be checked against. */
function exportCsv(dashboard: FiguresDashboard, bookLabel: string) {
  const cell = (v: unknown) => {
    const t = String(v ?? "");
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const rows: (string | number)[][] = [
    [`${bookLabel} live figures`, dashboard.month_label],
    [],
    ["Measure", "Value"],
    ["Total book", dashboard.kpis.total_book.value],
    ["Monthly inflow", dashboard.kpis.monthly_inflow.value],
    ["Cash available", dashboard.kpis.cash_available.value],
    ["Arrears", dashboard.kpis.arrears.value],
    ["Collected this month", dashboard.this_month.collected],
    ["Due this month", dashboard.this_month.due],
    ["Still due this month", dashboard.this_month.still_due],
    ["New lending this month", dashboard.this_month.new_lending],
    ["New agreements this month", dashboard.this_month.new_agreements],
    ["Capital deployed", dashboard.deployment.deployed],
    ["Capital available", dashboard.deployment.available],
    [],
    ["Month", "Collections", "New lending", "Net cash"],
    ...dashboard.income.map((m) => [m.key, m.collections, m.new_lending, m.net_cash]),
  ];
  if (dashboard.mix.slices.length) {
    rows.push([], ["Agreement type", "Total lent", "Share %"]);
    for (const slice of dashboard.mix.slices) {
      rows.push([slice.label, slice.value, slice.pct]);
    }
  }
  if (dashboard.next_receipts.length) {
    rows.push([], ["Due date", "Customer", "Agreement", "Amount"]);
    for (const r of dashboard.next_receipts) {
      rows.push([r.due_date, r.customer, r.agreement_number, r.amount]);
    }
  }

  const csv = rows.map((r) => r.map(cell).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${bookLabel.toLowerCase().replace(/\s+/g, "-")}-live-figures-${dashboard.month_key}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function FiguresHero({
  subtitle,
  dashboard,
  monthKey,
  onMonth,
  bookLabel,
  onReload,
}: {
  subtitle: string;
  dashboard?: FiguresDashboard;
  monthKey: string;
  onMonth: (key: string) => void;
  bookLabel: string;
  onReload: () => void;
}) {
  return (
    <section className="fig-hero">
      <div className="fig-hero-copy">
        <h1>Live figures</h1>
        <p>{subtitle}</p>
      </div>
      <div className="fig-hero-tools">
        {dashboard && dashboard.months.length > 0 && (
          <label className="fig-month">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M3 10h18M8 3v4M16 3v4" />
            </svg>
            <select
              value={monthKey || dashboard.month_key}
              onChange={(e) => onMonth(e.target.value)}
              aria-label="Month"
            >
              {dashboard.months.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                  {m.mtd ? " (to date)" : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="button" className="fig-hero-ghost" onClick={onReload}>
          ↻ Reload
        </button>
        {dashboard && (
          <button
            type="button"
            className="fig-hero-action"
            onClick={() => exportCsv(dashboard, bookLabel)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 16V4M8 8l4-4 4 4" />
              <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
            </svg>
            Export report
          </button>
        )}
      </div>
    </section>
  );
}

function CashField({
  cashText,
  setCashText,
  saveCash,
  savingCash,
  setCashMsg,
}: {
  cashText: string;
  setCashText: (v: string) => void;
  saveCash: () => void;
  savingCash: boolean;
  setCashMsg: (v: string) => void;
}) {
  return (
    <dd className="book-cash">
      <span>£</span>
      <input
        value={cashText}
        onChange={(e) => {
          setCashText(e.target.value);
          setCashMsg("");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            saveCash();
          }
        }}
        inputMode="decimal"
        aria-label="Cash at bank"
      />
      <button type="button" onClick={saveCash} disabled={savingCash}>
        {savingCash ? "Saving…" : "Save"}
      </button>
    </dd>
  );
}

function MonthAtATime() {
  const [monthKey, setMonthKey] = useState(LATEST_MONTH_KEY);
  const row = monthlyFiguresAt(monthKey);
  const prev = neighbouringMonth(monthKey, -1);
  const next = neighbouringMonth(monthKey, 1);
  // Bars are relative to the best month on the table, not to zero.
  const peakReceived = Math.max(
    ...MONTHLY_FIGURES.map((m) => m.payments_received)
  );
  const lowestReceived = Math.min(
    ...MONTHLY_FIGURES.map((m) => m.payments_received)
  );
  const heatRange = Math.max(peakReceived - lowestReceived, 1);

  return (
    <section className="book-month">
      <div className="book-month-heading">
        <div>
          <span>Cash activity</span>
          <h2>Last 12 months</h2>
        </div>
        <div className="book-month-bar">
          <button
            type="button"
            disabled={!prev}
            onClick={() => prev && setMonthKey(prev.key)}
            aria-label="Previous month"
          >
            ←
          </button>
          <strong>{monthLabel(row)}</strong>
          <button
            type="button"
            disabled={!next}
            onClick={() => next && setMonthKey(next.key)}
            aria-label="Next month"
          >
            →
          </button>
          {row.mtd && <span className="book-month-mtd">Month to date</span>}
        </div>
      </div>
      <div className="book-month-kpis">
        <div>
          <span>Payments received</span>
          <b>{gbp(row.payments_received)}</b>
        </div>
        <div>
          <span>New deals</span>
          <b>{row.new_deals}</b>
        </div>
        <div>
          <span>Amount lent</span>
          <b>{gbp(row.amount_lent)}</b>
        </div>
      </div>
      <div className="book-heatmap-head">
        <span>Newest first · shade shows payments received</span>
        <span className="book-heatmap-scale"><i /> Lower <i /> <i /> <i /> Higher</span>
      </div>
      <div className="book-month-grid">
        {MONTHLY_FIGURES.slice().reverse().map((m) => {
          const heat = 1 + Math.round(((m.payments_received - lowestReceived) / heatRange) * 4);
          return (
            <button
              type="button"
              key={m.key}
              className={`${m.key === row.key ? "book-month-card on" : "book-month-card"} heat-${heat}`}
              onClick={() => setMonthKey(m.key)}
            >
              <span>{monthLabel(m)}</span>
              <strong>{gbp(m.payments_received)}</strong>
              <small><b>{m.new_deals}</b> deals <i /> {gbp(m.amount_lent)} lent</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function FfgFigures({
  data,
  monthKey,
  onMonth,
  cashText,
  setCashText,
  saveCash,
  savingCash,
  cashMsg,
  setCashMsg,
  onReload,
}: {
  data: WithDashboard<LivePortfolio>;
  monthKey: string;
  onMonth: (key: string) => void;
  cashText: string;
  setCashText: (v: string) => void;
  saveCash: () => void;
  savingCash: boolean;
  cashMsg: string;
  setCashMsg: (v: string) => void;
  onReload: () => void;
}) {
  const repaidTotal = data.shareholders.reduce(
    (sum, s) => sum + s.amount_repaid,
    0
  );
  const valueTotal = data.shareholders.reduce((sum, s) => sum + s.value, 0);
  const projectedTotal = data.shareholders.reduce(
    (sum, s) => sum + s.projected_2030,
    0
  );
  const projectedGrowth = valueTotal > 0
    ? ((projectedTotal - valueTotal) / valueTotal) * 100
    : 0;
  const maxProjected = Math.max(...data.shareholders.map((row) => row.projected_2030), 1);

  const asOf = new Date(data.as_of + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <>
      <FiguresHero
        subtitle="Your lending book performance and projected cash position."
        dashboard={data.dashboard}
        monthKey={monthKey}
        onMonth={onMonth}
        bookLabel="Future FG"
        onReload={onReload}
      />
      {data.dashboard && (
        <FiguresTop dashboard={data.dashboard} bookLabel="Future FG" />
      )}
      <div className="fig-detail-head">
        <div>
          <p className="book-kicker">FFG Deal Book</p>
          <h2>Portfolio detail</h2>
          <p>
            Book snapshot {asOf} — GoCardless reconciled
            {data.added_deals.length > 0
              ? `. Added since then: ${data.added_deals.map((d) => d.agreement_number).join(", ")}.`
              : "."}
          </p>
        </div>
      </div>
      {cashMsg && (
        <div
          className={
            cashMsg.startsWith("Cash at bank saved") ? "admin-ok" : "admin-error"
          }
        >
          {cashMsg}
        </div>
      )}

      <div className="book-dash">
        <div className="book-dash-top">
        <section>
          <h2>Portfolio summary</h2>
          <dl className="book-kv">
            <div>
              <dt>Total deals</dt>
              <dd>{data.summary.total_deals}</dd>
            </div>
            <div>
              <dt>Total lent out</dt>
              <dd>{gbp(data.summary.total_lent)}</dd>
            </div>
            <div>
              <dt>Total commission earned</dt>
              <dd>{gbp(data.summary.total_commission)}</dd>
            </div>
            <div>
              <dt>Total repayments contracted</dt>
              <dd>{gbp(data.summary.total_repayments_contracted)}</dd>
            </div>
            <div>
              <dt>Total paid to date</dt>
              <dd>{gbp(data.summary.total_paid)}</dd>
            </div>
            <div className="lead">
              <dt>Total remaining outstanding</dt>
              <dd>{gbp(data.summary.total_outstanding)}</dd>
            </div>
            <div className="lead">
              <dt>Total profit</dt>
              <dd>{gbp(data.summary.total_profit)}</dd>
            </div>
            <div>
              <dt>Blended yield</dt>
              <dd>{pct(data.summary.blended_yield)}</dd>
            </div>
            <div>
              <dt>Cash at bank</dt>
              <CashField
                cashText={cashText}
                setCashText={setCashText}
                saveCash={saveCash}
                savingCash={savingCash}
                setCashMsg={setCashMsg}
              />
            </div>
            <div className="lead">
              <dt>Net position (incl. facility)</dt>
              <dd>{gbp(data.summary.net_position)}</dd>
            </div>
          </dl>
        </section>

        <section className="figures-section deal-type-section">
          <div className="figures-section-head">
            <div><span>Portfolio mix</span><h2>Breakdown by deal type</h2></div>
            <p>Capital deployed, profit and average return across each product.</p>
          </div>
          <div className="deal-type-cards">
            {data.by_type.map((row, index) => (
              <article className={`deal-type-card tone-${index}`} key={row.type}>
                <div className="deal-type-title"><span>{row.type}</span><b>{row.deals} deals</b></div>
                <h3>{row.label}</h3>
                <dl>
                  <div><dt>Total lent</dt><dd>{gbp(row.total_lent)}</dd></div>
                  <div><dt>Total profit</dt><dd>{gbp(row.total_profit)}</dd></div>
                  <div><dt>Average yield</dt><dd>{pct(row.avg_yield)}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        </section>
        </div>

        <MonthAtATime />

        <div className="figures-lower">
          <section className="figures-section shareholder-section equity-visual">
            <div className="figures-section-head">
              <div><span>Equity outlook</span><h2>Shareholding value</h2></div>
              <p>Ownership today and the projected value of each holding at the end of 2030.</p>
            </div>
            <div className="figures-summary-strip value-strip compact-strip">
              <div><span>Current total</span><strong>{gbp(valueTotal)}</strong></div>
              <div><span>Projected 2030</span><strong>{gbp(projectedTotal)}</strong></div>
              <div><span>Projected growth</span><strong>{pct(projectedGrowth)}</strong></div>
            </div>
            <div className="shareholder-visual-grid">
              <div className="ownership-panel">
                <h3>Ownership split</h3>
                <div className="ownership-bar" aria-label="Shareholder ownership split">
                  {data.shareholders.map((row, index) => (
                    <i key={row.name} style={{ width: `${row.pct_owned}%`, background: MIX_COLOURS[index % MIX_COLOURS.length] }} />
                  ))}
                </div>
                <div className="ownership-legend">
                  {data.shareholders.map((row, index) => (
                    <div key={row.name}>
                      <span><i style={{ background: MIX_COLOURS[index % MIX_COLOURS.length] }} />{row.name}</span>
                      <strong>{pct(row.pct_owned)}</strong>
                    </div>
                  ))}
                </div>
              </div>
              <div className="projection-panel">
                <div className="projection-heading"><h3>Value by shareholder</h3><span>Current <i /> Projected <i /></span></div>
                {data.shareholders.map((row) => (
                  <div className="projection-row" key={row.name}>
                    <div><span>{row.name}</span><strong>{gbp(row.projected_2030)}</strong></div>
                    <div className="projection-track">
                      <i className="projected" style={{ width: `${(row.projected_2030 / maxProjected) * 100}%` }} />
                      <i className="current" style={{ width: `${(row.value / maxProjected) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="figures-section shareholder-section repayments-section">
            <div className="figures-section-head">
              <div><span>Capital accounts</span><h2>Amounts paid to shareholders</h2></div>
              <p>Repayments made against shareholder funding to date.</p>
            </div>
            <div className="repayment-layout">
              <div className="repayment-total">
                <span>Total repaid</span><strong>{gbp(repaidTotal)}</strong>
                <small>{gbp(data.repayment_per_share)} per share</small>
              </div>
              <div className="figures-table-wrap">
                <table className="book-table figures-table">
                  <thead><tr><th>Shareholder</th><th>Shares</th><th>Amount paid</th></tr></thead>
                  <tbody>
                    {data.shareholders.map((row) => (
                      <tr key={row.name}>
                        <td><span className="book-name"><span className="book-initials">{initialsOf(row.name)}</span>{row.name}</span></td>
                        <td>{row.shares.toLocaleString("en-GB")}</td>
                        <td>{gbp(row.amount_repaid)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function GlacierFigures({
  data,
  monthKey,
  onMonth,
  cashText,
  setCashText,
  saveCash,
  savingCash,
  cashMsg,
  setCashMsg,
  onReload,
}: {
  data: WithDashboard<GlacierPortfolio>;
  monthKey: string;
  onMonth: (key: string) => void;
  cashText: string;
  setCashText: (v: string) => void;
  saveCash: () => void;
  savingCash: boolean;
  cashMsg: string;
  setCashMsg: (v: string) => void;
  onReload: () => void;
}) {
  const invested = data.shareholders.reduce((sum, s) => sum + s.investment, 0);
  const valueTotal = data.shareholders.reduce((sum, s) => sum + s.value, 0);
  const projectedTotal = data.shareholders.reduce(
    (sum, s) => sum + s.projected_2030,
    0
  );
  return (
    <>
      <FiguresHero
        subtitle={`Glacier Gem · Owen, Ron, Bob and Len · ${pct(data.annual_yield)} a year through ${data.horizon.slice(0, 4)} (${data.years_to_horizon} years).`}
        dashboard={data.dashboard}
        monthKey={monthKey}
        onMonth={onMonth}
        bookLabel="Glacier Gem"
        onReload={onReload}
      />
      {data.dashboard && (
        <FiguresTop dashboard={data.dashboard} bookLabel="Glacier Gem" />
      )}
      {cashMsg && (
        <div
          className={
            cashMsg.startsWith("Cash at bank saved") ? "admin-ok" : "admin-error"
          }
        >
          {cashMsg}
        </div>
      )}
      <div className="book-dash">
        <section>
          <h2>Portfolio summary</h2>
          <dl className="book-kv">
            <div>
              <dt>Total deals</dt>
              <dd>{data.summary.total_deals}</dd>
            </div>
            <div>
              <dt>Capital in</dt>
              <dd>{gbp(data.summary.capital_in)}</dd>
            </div>
            <div>
              <dt>Total lent out</dt>
              <dd>{gbp(data.summary.total_lent)}</dd>
            </div>
            <div>
              <dt>Total repayments contracted</dt>
              <dd>{gbp(data.summary.total_repayments_contracted)}</dd>
            </div>
            <div>
              <dt>Total paid to date</dt>
              <dd>{gbp(data.summary.total_paid)}</dd>
            </div>
            <div className="lead">
              <dt>Total remaining outstanding</dt>
              <dd>{gbp(data.summary.total_outstanding)}</dd>
            </div>
            <div className="lead">
              <dt>Total profit</dt>
              <dd>{gbp(data.summary.total_profit)}</dd>
            </div>
            <div>
              <dt>Blended yield</dt>
              <dd>{pct(data.summary.blended_yield)}</dd>
            </div>
            <div>
              <dt>Annualised yield (for compounding)</dt>
              <dd>{pct(data.annual_yield)}</dd>
            </div>
            <div>
              <dt>Cash at bank</dt>
              <CashField
                cashText={cashText}
                setCashText={setCashText}
                saveCash={saveCash}
                savingCash={savingCash}
                setCashMsg={setCashMsg}
              />
            </div>
            <div className="lead">
              <dt>Net position</dt>
              <dd>{gbp(data.summary.net_position)}</dd>
            </div>
          </dl>
        </section>

        <section>
          <h2>Shareholders</h2>
          <p className="book-note">
            Four equal stakes · {gbp(data.shareholders[0].investment)} each
          </p>
          <table className="book-table">
            <thead>
              <tr>
                <th>Shareholder</th>
                <th>Investment</th>
                <th>% owned</th>
                <th>Value of shareholding</th>
                <th>Projected value (end 2030)</th>
              </tr>
            </thead>
            <tbody>
              {data.shareholders.map((row) => (
                <tr key={row.name}>
                  <td>
                    <span className="book-name">
                      <span className="book-initials">{initialsOf(row.name)}</span>
                      {row.name}
                    </span>
                  </td>
                  <td>{gbp(row.investment)}</td>
                  <td>
                    <BarCell value={pct(row.pct_owned)} share={row.pct_owned} />
                  </td>
                  <td>{gbp(row.value)}</td>
                  <td>{gbp(row.projected_2030)}</td>
                </tr>
              ))}
              <tr className="book-total">
                <td>Total</td>
                <td>{gbp(invested)}</td>
                <td>100.0%</td>
                <td>{gbp(valueTotal)}</td>
                <td>{gbp(projectedTotal)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
