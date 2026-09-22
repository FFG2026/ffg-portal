"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import AdminShell, { adminBasePath, adminHeaders } from "../AdminShell";
import { useBookReload } from "../../../lib/admin-book-reload";
import PageHero from "../PageHero";
import { parseCashAtBank, type LivePortfolio } from "../../../lib/portfolio-live";
import type { GlacierPortfolio } from "../../../lib/glacier-portfolio";

const gbp0 = (n: number | null | undefined) =>
  n == null
    ? "—"
    : `£${Number(n).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
const gbp2 = (n: number | null | undefined) =>
  n == null
    ? "—"
    : `£${Number(n).toLocaleString("en-GB", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
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

function Meter({
  value,
  max,
  tone = "blue",
}: {
  value: number;
  max: number;
  tone?: "blue" | "green" | "gold";
}) {
  const pctVal = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="figures-meter">
      <i className={tone} style={{ width: `${pctVal}%` }} />
    </div>
  );
}

function CashCard({
  cashText,
  setCashText,
  saveCash,
  savingCash,
  cashMsg,
  setCashMsg,
  netPosition,
  cashAtBank,
}: {
  cashText: string;
  setCashText: (v: string) => void;
  saveCash: () => void;
  savingCash: boolean;
  cashMsg: string;
  setCashMsg: (v: string) => void;
  netPosition: number;
  cashAtBank: number;
}) {
  const typed = parseCashAtBank(cashText);
  const delta = typed != null ? typed - cashAtBank : 0;
  const liveNet = typed != null ? netPosition - cashAtBank + typed : netPosition;
  return (
    <section className="page-panel figures-cash">
      <h2>Cash at bank</h2>
      <p className="panel-sub">Edit and save — net position updates as you type.</p>
      <label className="figures-cash-field">
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
      </label>
      <dl className="snapshot-kv">
        <dt>Net position</dt>
        <dd>{gbp0(liveNet)}</dd>
        {typed != null && Math.abs(delta) >= 0.01 && (
          <>
            <dt>Change</dt>
            <dd>{delta > 0 ? `+${gbp0(delta)}` : gbp0(delta)}</dd>
          </>
        )}
      </dl>
      {cashMsg && (
        <div
          className={
            cashMsg.startsWith("Cash at bank saved") ? "admin-ok" : "admin-error"
          }
        >
          {cashMsg}
        </div>
      )}
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
  const router = useRouter();
  const base = adminBasePath();
  const [horizon, setHorizon] = useState<"now" | "2030">("now");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [holder, setHolder] = useState(data.shareholders[0]?.name || "Ron");

  const repaidTotal = data.shareholders.reduce((sum, s) => sum + s.amount_repaid, 0);
  const valueTotal = data.shareholders.reduce((sum, s) => sum + s.value, 0);
  const projectedTotal = data.shareholders.reduce((sum, s) => sum + s.projected_2030, 0);
  const collectedPct =
    data.summary.total_repayments_contracted > 0
      ? Math.round(
          (data.summary.total_paid / data.summary.total_repayments_contracted) * 100
        )
      : 0;
  const maxLent = Math.max(...data.by_type.map((t) => t.total_lent), 1);
  const selectedType = data.by_type.find((t) => t.type === typeFilter) || null;
  const selectedHolder =
    data.shareholders.find((s) => s.name === holder) || data.shareholders[0];

  return (
    <>
      <PageHero
        title="Live figures"
        subtitle={`Owen-only book from 28 Aug 2026. ${
          data.added_deals.length
            ? `${data.added_deals.length} deals added since then.`
            : "No deals added since that book yet."
        }`}
        action={
          <button className="page-hero-action" type="button" onClick={onReload}>
            ↻ Reload figures
          </button>
        }
      />

      <div className="page-stat-row">
        <div className="page-stat">
          <div className="page-stat-icon navy">▤</div>
          <div>
            <b>{data.summary.total_deals}</b>
            <span>Total deals</span>
          </div>
        </div>
        <div className="page-stat">
          <div className="page-stat-icon blue">£</div>
          <div>
            <b>{gbp0(data.summary.total_lent)}</b>
            <span>Total lent</span>
          </div>
        </div>
        <div className="page-stat">
          <div className="page-stat-icon gold">●</div>
          <div>
            <b>{gbp0(data.summary.total_outstanding)}</b>
            <span>Still owed in</span>
          </div>
        </div>
        <div className="page-stat">
          <div className="page-stat-icon green">↗</div>
          <div>
            <b>{pct(data.summary.blended_yield)}</b>
            <span>Blended yield</span>
            <small>{gbp0(data.summary.total_profit)} profit</small>
          </div>
        </div>
      </div>

      <div className="page-layout">
        <section className="page-panel">
          <div className="page-panel-head">
            <div>
              <h2>Collections vs still due</h2>
              <p className="panel-sub">
                {gbp0(data.summary.total_paid)} collected of{" "}
                {gbp0(data.summary.total_repayments_contracted)} contracted
              </p>
            </div>
            <strong className="figures-rate">{collectedPct}%</strong>
          </div>
          <Meter value={data.summary.total_paid} max={data.summary.total_repayments_contracted} tone="green" />
          <div className="figures-split">
            <p>
              <b>{gbp0(data.summary.total_paid)}</b>
              <span>Paid to date</span>
            </p>
            <p>
              <b>{gbp0(data.summary.total_outstanding)}</b>
              <span>Remaining</span>
            </p>
            <p>
              <b>{gbp0(data.summary.total_commission)}</b>
              <span>Commission earned</span>
            </p>
          </div>
        </section>
        <CashCard
          cashText={cashText}
          setCashText={setCashText}
          saveCash={saveCash}
          savingCash={savingCash}
          cashMsg={cashMsg}
          setCashMsg={setCashMsg}
          netPosition={data.summary.net_position}
          cashAtBank={data.summary.cash_at_bank}
        />
      </div>

      <div className="page-layout" style={{ marginTop: 14 }}>
        <section className="page-panel">
          <div className="page-panel-head">
            <div>
              <h2>Breakdown by deal type</h2>
              <p className="panel-sub">Click a type to focus it.</p>
            </div>
            {typeFilter && (
              <button type="button" className="ghost-link" onClick={() => setTypeFilter(null)}>
                Show all
              </button>
            )}
          </div>
          <div className="figures-type-bars">
            {data.by_type.map((row) => (
              <button
                key={row.type}
                type="button"
                className={`figures-type ${typeFilter === row.type ? "on" : ""}`}
                onClick={() =>
                  setTypeFilter(typeFilter === row.type ? null : row.type)
                }
              >
                <div className="figures-type-top">
                  <strong>{row.type}</strong>
                  <span>{row.deals} deals</span>
                </div>
                <div className="figures-type-track">
                  <i style={{ width: `${(row.total_lent / maxLent) * 100}%` }} />
                </div>
                <div className="figures-type-meta">
                  <span>{gbp0(row.total_lent)} lent</span>
                  <span>{pct(row.avg_yield)} yield</span>
                </div>
              </button>
            ))}
          </div>
          {selectedType && (
            <p className="panel-sub" style={{ marginTop: 12, marginBottom: 0 }}>
              {selectedType.label}: {gbp0(selectedType.total_profit)} profit on{" "}
              {gbp0(selectedType.total_lent)} lent.
            </p>
          )}
        </section>

        <section className="page-panel">
          <div className="page-panel-head">
            <div>
              <h2>Deals added since 28 Aug</h2>
              <p className="panel-sub">Open a deal sheet from here.</p>
            </div>
          </div>
          {data.added_deals.length === 0 ? (
            <p className="empty-activity">Nothing added since the August book.</p>
          ) : (
            <div className="figures-deals">
              {(typeFilter
                ? data.added_deals.filter((d) => d.type === typeFilter)
                : data.added_deals
              ).map((deal) => (
                <button
                  key={deal.agreement_number}
                  type="button"
                  className="figures-deal"
                  onClick={() =>
                    router.push(
                      `${base}/lookup?agreement=${encodeURIComponent(deal.agreement_number)}`
                    )
                  }
                >
                  {deal.agreement_number}
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="page-panel" style={{ marginTop: 14 }}>
        <div className="page-panel-head">
          <div>
            <h2>Shareholdings</h2>
            <p className="panel-sub">
              {data.shares_issued.toLocaleString("en-GB")} shares · repayment{" "}
              {gbp2(data.repayment_per_share)} per share · click a name
            </p>
          </div>
          <div className="page-filters" style={{ margin: 0 }}>
            <button
              className={`page-chip ${horizon === "now" ? "on" : ""}`}
              onClick={() => setHorizon("now")}
              type="button"
            >
              Value now
            </button>
            <button
              className={`page-chip ${horizon === "2030" ? "on" : ""}`}
              onClick={() => setHorizon("2030")}
              type="button"
            >
              End 2030
            </button>
          </div>
        </div>
        <div className="figures-holders">
          {data.shareholders.map((row) => {
            const amount = horizon === "now" ? row.value : row.projected_2030;
            const max = horizon === "now" ? valueTotal : projectedTotal;
            return (
              <button
                key={row.name}
                type="button"
                className={`figures-holder ${holder === row.name ? "on" : ""}`}
                onClick={() => setHolder(row.name)}
              >
                <div className="figures-holder-top">
                  <strong>{row.name}</strong>
                  <span>{pct(row.pct_owned)}</span>
                </div>
                <b>{gbp0(amount)}</b>
                <Meter value={amount} max={max} tone={holder === row.name ? "gold" : "blue"} />
              </button>
            );
          })}
        </div>
        {selectedHolder && (
          <div className="figures-holder-detail">
            <div>
              <span>Shares</span>
              <strong>{selectedHolder.shares.toLocaleString("en-GB")}</strong>
            </div>
            <div>
              <span>Already repaid</span>
              <strong>{gbp0(selectedHolder.amount_repaid)}</strong>
            </div>
            <div>
              <span>Value now</span>
              <strong>{gbp0(selectedHolder.value)}</strong>
            </div>
            <div>
              <span>Projected 2030</span>
              <strong>{gbp0(selectedHolder.projected_2030)}</strong>
            </div>
            {selectedHolder.total_owed_in != null && (
              <div>
                <span>Book owed in</span>
                <strong>{gbp0(selectedHolder.total_owed_in)}</strong>
              </div>
            )}
          </div>
        )}
        <p className="panel-sub" style={{ marginTop: 12, marginBottom: 0 }}>
          Total repaid to shareholders {gbp0(repaidTotal)}. Book value now {gbp0(valueTotal)},
          projected {gbp0(projectedTotal)} by end 2030.
        </p>
      </section>
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
  const [horizon, setHorizon] = useState<"now" | "2030">("now");
  const [holder, setHolder] = useState(data.shareholders[0]?.name || "Owen");
  const invested = data.shareholders.reduce((sum, s) => sum + s.investment, 0);
  const valueTotal = data.shareholders.reduce((sum, s) => sum + s.value, 0);
  const projectedTotal = data.shareholders.reduce((sum, s) => sum + s.projected_2030, 0);
  const collectedPct =
    data.summary.total_repayments_contracted > 0
      ? Math.round(
          (data.summary.total_paid / data.summary.total_repayments_contracted) * 100
        )
      : 0;
  const selected = data.shareholders.find((s) => s.name === holder) || data.shareholders[0];

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
      <div className="page-stat-row">
        <div className="page-stat">
          <div className="page-stat-icon navy">▤</div>
          <div>
            <b>{data.summary.total_deals}</b>
            <span>Total deals</span>
          </div>
        </div>
        <div className="page-stat">
          <div className="page-stat-icon blue">£</div>
          <div>
            <b>{gbp0(data.summary.capital_in)}</b>
            <span>Capital in</span>
          </div>
        </div>
        <div className="page-stat">
          <div className="page-stat-icon gold">●</div>
          <div>
            <b>{gbp0(data.summary.total_outstanding)}</b>
            <span>Still owed in</span>
          </div>
        </div>
        <div className="page-stat">
          <div className="page-stat-icon green">↗</div>
          <div>
            <b>{pct(data.annual_yield)}</b>
            <span>Annualised yield</span>
            <small>{pct(data.summary.blended_yield)} blended</small>
          </div>
        </div>
      </div>

      <div className="page-layout">
        <section className="page-panel">
          <div className="page-panel-head">
            <div>
              <h2>Collections vs still due</h2>
              <p className="panel-sub">
                {gbp0(data.summary.total_paid)} collected of{" "}
                {gbp0(data.summary.total_repayments_contracted)} contracted
              </p>
            </div>
            <strong className="figures-rate">{collectedPct}%</strong>
          </div>
          <Meter value={data.summary.total_paid} max={data.summary.total_repayments_contracted} tone="green" />
          <div className="figures-split">
            <p>
              <b>{gbp0(data.summary.total_lent)}</b>
              <span>Lent out</span>
            </p>
            <p>
              <b>{gbp0(data.summary.total_profit)}</b>
              <span>Profit</span>
            </p>
            <p>
              <b>{gbp0(data.summary.net_position)}</b>
              <span>Net position</span>
            </p>
          </div>
        </section>
        <CashCard
          cashText={cashText}
          setCashText={setCashText}
          saveCash={saveCash}
          savingCash={savingCash}
          cashMsg={cashMsg}
          setCashMsg={setCashMsg}
          netPosition={data.summary.net_position}
          cashAtBank={data.summary.cash_at_bank}
        />
      </div>

      <section className="page-panel" style={{ marginTop: 14 }}>
        <div className="page-panel-head">
          <div>
            <h2>Four equal stakes</h2>
            <p className="panel-sub">{gbp0(invested)} in · click a shareholder</p>
          </div>
          <div className="page-filters" style={{ margin: 0 }}>
            <button
              className={`page-chip ${horizon === "now" ? "on" : ""}`}
              onClick={() => setHorizon("now")}
              type="button"
            >
              Value now
            </button>
            <button
              className={`page-chip ${horizon === "2030" ? "on" : ""}`}
              onClick={() => setHorizon("2030")}
              type="button"
            >
              End 2030
            </button>
          </div>
        </div>
        <div className="figures-holders">
          {data.shareholders.map((row) => {
            const amount = horizon === "now" ? row.value : row.projected_2030;
            const max = horizon === "now" ? valueTotal : projectedTotal;
            return (
              <button
                key={row.name}
                type="button"
                className={`figures-holder ${holder === row.name ? "on" : ""}`}
                onClick={() => setHolder(row.name)}
              >
                <div className="figures-holder-top">
                  <strong>{row.name}</strong>
                  <span>25%</span>
                </div>
                <b>{gbp0(amount)}</b>
                <Meter value={amount} max={max} tone={holder === row.name ? "gold" : "blue"} />
              </button>
            );
          })}
        </div>
        {selected && (
          <div className="figures-holder-detail">
            <div>
              <span>Investment</span>
              <strong>{gbp0(selected.investment)}</strong>
            </div>
            <div>
              <span>Value now</span>
              <strong>{gbp0(selected.value)}</strong>
            </div>
            <div>
              <span>Projected 2030</span>
              <strong>{gbp0(selected.projected_2030)}</strong>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
