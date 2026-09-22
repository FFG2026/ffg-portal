"use client";

import { useCallback, useState } from "react";
import AdminShell, { adminHeaders } from "../AdminShell";
import { useBookReload } from "../../../lib/admin-book-reload";
import type { LivePortfolio } from "../../../lib/portfolio-live";
import type { GlacierPortfolio } from "../../../lib/glacier-portfolio";

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

  const applyCash = (amount: number) => {
    setCashText(
      Number(amount).toLocaleString("en-GB", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  };

  const load = useCallback(async () => {
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
      return;
    }
    if (!res.ok) {
      setError("Couldn't load the live figures.");
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
        <div className="admin-kicker">Owner</div>
        <h1>Live figures</h1>
        <div className="admin-error">{error}</div>
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
      />
    );
  }

  if (!ffg) return null;

  const data = ffg;

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

  return (
    <>
      <div className="admin-kicker">Owner</div>
      <h1>Live figures</h1>
      <p className="admin-lead">
        Base book from 28 Aug 2026. That sheet does not include HP from 139,
        so HP139+, FL16+ and L5+ are added into these boxes as they go on.
        {data.added_deals.length > 0
          ? ` Added since then: ${data.added_deals
              .map((d) => d.agreement_number)
              .join(", ")}.`
          : " No deals added since that book yet."}
      </p>
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
            </div>
            <div>
              <dt>Net position (incl. facility)</dt>
              <dd>{gbp(data.summary.net_position)}</dd>
            </div>
          </dl>
        </section>

        <div className="figures-lower">
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

          <section className="figures-section shareholder-section">
            <div className="figures-section-head">
              <div><span>Capital accounts</span><h2>Shareholder loan repayments</h2></div>
              <p>Amounts returned against shareholder funding.</p>
            </div>
            <div className="figures-summary-strip">
              <div><span>Total repaid</span><strong>{gbp(repaidTotal)}</strong></div>
              <div><span>Repayment per share</span><strong>{gbp(data.repayment_per_share)}</strong></div>
              <div><span>Shares issued</span><strong>{data.shares_issued.toLocaleString("en-GB")}</strong></div>
            </div>
            <div className="figures-table-wrap">
              <table className="book-table figures-table">
                <thead><tr><th>Shareholder</th><th>Shares</th><th>Amount repaid</th><th>Total owed in</th></tr></thead>
                <tbody>
                  {data.shareholders.map((row) => (
                    <tr key={row.name}><td><strong>{row.name}</strong></td><td>{row.shares.toLocaleString("en-GB")}</td><td>{gbp(row.amount_repaid)}</td><td>{row.total_owed_in != null ? gbp(row.total_owed_in) : "—"}</td></tr>
                  ))}
                  <tr className="book-total"><td>Total</td><td>{data.shares_issued.toLocaleString("en-GB")}</td><td>{gbp(repaidTotal)}</td><td /></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="figures-section shareholder-section">
            <div className="figures-section-head">
              <div><span>Equity outlook</span><h2>Shareholding value</h2></div>
              <p>Current value based on total owed in, with the projected position at the end of 2030.</p>
            </div>
            <div className="figures-summary-strip value-strip">
              <div><span>Current total value</span><strong>{gbp(valueTotal)}</strong></div>
              <div><span>Projected 2030 value</span><strong>{gbp(projectedTotal)}</strong></div>
              <div><span>Projected growth</span><strong>{pct(projectedGrowth)}</strong></div>
            </div>
            <div className="figures-table-wrap">
              <table className="book-table figures-table">
                <thead><tr><th>Shareholder</th><th>Shares</th><th>% owned</th><th>Current value</th><th>Projected 2030</th></tr></thead>
                <tbody>
                  {data.shareholders.map((row) => (
                    <tr key={row.name}><td><strong>{row.name}</strong></td><td>{row.shares.toLocaleString("en-GB")}</td><td>{pct(row.pct_owned)}</td><td>{gbp(row.value)}</td><td className="projected-value">{gbp(row.projected_2030)}</td></tr>
                  ))}
                  <tr className="book-total"><td>Total</td><td>{data.shares_issued.toLocaleString("en-GB")}</td><td>100.0%</td><td>{gbp(valueTotal)}</td><td>{gbp(projectedTotal)}</td></tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </>
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

function GlacierFigures({
  data,
  cashText,
  setCashText,
  saveCash,
  savingCash,
  cashMsg,
  setCashMsg,
}: {
  data: GlacierPortfolio;
  cashText: string;
  setCashText: (v: string) => void;
  saveCash: () => void;
  savingCash: boolean;
  cashMsg: string;
  setCashMsg: (v: string) => void;
}) {
  const invested = data.shareholders.reduce((sum, s) => sum + s.investment, 0);
  const valueTotal = data.shareholders.reduce((sum, s) => sum + s.value, 0);
  const projectedTotal = data.shareholders.reduce(
    (sum, s) => sum + s.projected_2030,
    0
  );
  return (
    <>
      <div className="admin-kicker">Glacier Gem</div>
      <h1>Live figures</h1>
      <p className="admin-lead">
        Live Glacier Gem book. Owen, Ron, Bob and Len each put in{" "}
        {gbp(data.shareholders[0].investment)} (25% each). Projected values
        compound each share of what is still owed in at the current lending
        yield ({pct(data.annual_yield)} a year, from a {pct(data.summary.blended_yield)}{" "}
        blended return over {data.summary.avg_term_months} months), assuming
        collections are lent again at the same rate through 31 Dec 2030 (
        {data.years_to_horizon} years).
      </p>
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
