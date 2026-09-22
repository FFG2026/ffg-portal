"use client";

import { useCallback, useState } from "react";
import AdminShell, { adminHeaders } from "../AdminShell";
import { useBookReload } from "../../../lib/admin-book-reload";
import PageHero from "../PageHero";
import type { LivePortfolio } from "../../../lib/portfolio-live";
import type { GlacierPortfolio } from "../../../lib/glacier-portfolio";
import {
  LATEST_MONTH_KEY,
  MONTHLY_FIGURES,
  monthLabel,
  monthlyFiguresAt,
  neighbouringMonth,
} from "../../../lib/monthly-figures";

const gbp = (n: number | null | undefined) => {
  if (n == null) return "";
  return `£${Number(n).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const pct = (n: number) =>
  `${n.toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

export default function OwnerFiguresPage() {
  return (
    <AdminShell>
      <FiguresInner />
    </AdminShell>
  );
}

function FiguresInner() {
  const [ffg, setFfg] = useState<LivePortfolio | null>(null);
  const [gg, setGg] = useState<GlacierPortfolio | null>(null);
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

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/portfolio?t=${Date.now()}`, {
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
        cashText={cashText}
        setCashText={setCashText}
        saveCash={saveCash}
        savingCash={savingCash}
        cashMsg={cashMsg}
        setCashMsg={setCashMsg}
        onReload={() => load()}
      />
    );
  }

  if (!ffg) return null;

  return (
    <FfgFigures
      data={ffg}
      cashText={cashText}
      setCashText={setCashText}
      saveCash={saveCash}
      savingCash={savingCash}
      cashMsg={cashMsg}
      setCashMsg={setCashMsg}
      onReload={() => load()}
    />
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

  return (
    <section className="book-month">
      <h2>Last 12 months</h2>
      <div className="book-month-bar">
        <button
          type="button"
          disabled={!prev}
          onClick={() => prev && setMonthKey(prev.key)}
        >
          ←
        </button>
        <strong>{monthLabel(row)}</strong>
        <button
          type="button"
          disabled={!next}
          onClick={() => next && setMonthKey(next.key)}
        >
          →
        </button>
        {row.mtd && <span className="book-month-mtd">Month to date</span>}
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
      <table className="book-table book-month-table">
        <thead>
          <tr>
            <th>Month</th>
            <th>Payments received</th>
            <th>New deals</th>
            <th>Amount lent</th>
          </tr>
        </thead>
        <tbody>
          {MONTHLY_FIGURES.map((m) => (
            <tr
              key={m.key}
              className={m.key === row.key ? "book-month-on" : undefined}
              onClick={() => setMonthKey(m.key)}
            >
              <td>{monthLabel(m)}</td>
              <td>{gbp(m.payments_received)}</td>
              <td>{m.new_deals}</td>
              <td>{gbp(m.amount_lent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function FfgFigures({
  data,
  cashText,
  setCashText,
  saveCash,
  savingCash,
  cashMsg,
  setCashMsg,
  onReload,
}: {
  data: LivePortfolio;
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

  return (
    <>
      <div className="book-titlebar">
        <div>
          <p className="book-kicker">FFG Deal Book</p>
          <h1>Portfolio Dashboard</h1>
          <p>
            Updated{" "}
            {new Date(data.as_of + "T00:00:00").toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}{" "}
            — GoCardless reconciled
            {data.added_deals.length > 0
              ? `. Added since then: ${data.added_deals.map((d) => d.agreement_number).join(", ")}.`
              : "."}
          </p>
        </div>
        <button className="page-hero-action" type="button" onClick={onReload}>
          ↻ Reload figures
        </button>
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
            <div>
              <dt>Total remaining outstanding</dt>
              <dd>{gbp(data.summary.total_outstanding)}</dd>
            </div>
            <div>
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
            <div>
              <dt>Net position (incl. facility)</dt>
              <dd>{gbp(data.summary.net_position)}</dd>
            </div>
          </dl>
        </section>

        <section>
          <h2>Breakdown by deal type</h2>
          <table className="book-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Deals</th>
                <th>Total lent</th>
                <th>Total profit</th>
                <th>Avg yield</th>
              </tr>
            </thead>
            <tbody>
              {data.by_type.map((row) => (
                <tr key={row.type}>
                  <td>{row.label}</td>
                  <td>{row.deals}</td>
                  <td>{gbp(row.total_lent)}</td>
                  <td>{gbp(row.total_profit)}</td>
                  <td>{pct(row.avg_yield)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        </div>

        <MonthAtATime />

        <section>
          <h2>Shareholder loan repayments</h2>
          <p className="book-note">
            Total shares issued {data.shares_issued.toLocaleString("en-GB")} ·
            Repayment per share {gbp(data.repayment_per_share)}
          </p>
          <table className="book-table">
            <thead>
              <tr>
                <th>Shareholder</th>
                <th>Shares</th>
                <th>Amount repaid</th>
                <th>Total owed in</th>
              </tr>
            </thead>
            <tbody>
              {data.shareholders.map((row) => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  <td>{row.shares.toLocaleString("en-GB")}</td>
                  <td>{gbp(row.amount_repaid)}</td>
                  <td>{row.total_owed_in != null ? gbp(row.total_owed_in) : ""}</td>
                </tr>
              ))}
              <tr className="book-total">
                <td>Total</td>
                <td>{data.shares_issued.toLocaleString("en-GB")}</td>
                <td>{gbp(repaidTotal)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </section>

        <section>
          <h2>Shareholding value (based on total owed in)</h2>
          <table className="book-table">
            <thead>
              <tr>
                <th>Shareholder</th>
                <th>Shares</th>
                <th>% owned</th>
                <th>Value of shareholding</th>
                <th>Projected value (end 2030)</th>
              </tr>
            </thead>
            <tbody>
              {data.shareholders.map((row) => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  <td>{row.shares.toLocaleString("en-GB")}</td>
                  <td>{pct(row.pct_owned)}</td>
                  <td>{gbp(row.value)}</td>
                  <td>{gbp(row.projected_2030)}</td>
                </tr>
              ))}
              <tr className="book-total">
                <td>Total</td>
                <td>{data.shares_issued.toLocaleString("en-GB")}</td>
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

function GlacierFigures({
  data,
  cashText,
  setCashText,
  saveCash,
  savingCash,
  cashMsg,
  setCashMsg,
  onReload,
}: {
  data: GlacierPortfolio;
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
      <PageHero
        title="Live figures"
        subtitle={`Glacier Gem · Owen, Ron, Bob and Len · ${pct(data.annual_yield)} a year through ${data.horizon.slice(0, 4)} (${data.years_to_horizon} years).`}
        action={
          <button className="page-hero-action" type="button" onClick={onReload}>
            ↻ Reload figures
          </button>
        }
      />
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
            <div>
              <dt>Total remaining outstanding</dt>
              <dd>{gbp(data.summary.total_outstanding)}</dd>
            </div>
            <div>
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
            <div>
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
                  <td>{row.name}</td>
                  <td>{gbp(row.investment)}</td>
                  <td>{pct(row.pct_owned)}</td>
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
