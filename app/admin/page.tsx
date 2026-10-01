"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AdminShell, { adminHeaders, adminBasePath } from "./AdminShell";
import { useBookReload } from "../../lib/admin-book-reload";

type Dashboard = {
  generated_at?: string;
  totals: {
    live: number;
    finished: number;
    customers: number;
    paid_total: number;
    outstanding: number;
    overdue: number;
    due_this_month: number;
    arrears_brought_forward: number;
    lumps_this_month: number;
    in_flight_this_month: number;
    in_flight_count: number | null;
    expected_this_month: number;
    collected_this_month: number;
    collected_count?: number | null;
    collected_from_gocardless?: boolean;
    no_mandate: number;
  };
  chart: { month: string; paid: number; unpaid: number }[];
  lending: { month: string; deals: number; total_lent: number }[];
  webhook?: {
    state: "never" | "stale" | "ok";
    last_event_at: string | null;
    days_since: number | null;
    message: string;
  };
  attention: {
    agreement_number: string;
    company_name: string;
    reason: string;
    amount: number | null;
  }[];
  dd_misses?: {
    agreement_number: string;
    company_name: string;
    months: string[];
    latest_amount: number;
    latest_charge_date: string;
  }[];
  dd_miss_months?: string[];
  cashflow: { days: number; amount: number; count: number }[];
  turnover?: {
    months: { month: string; existing: number; written: number; turnover: number; lent: number; agreements: number }[];
    uplift: number | null;
    term_months: number | null;
    opening: number;
    runoff_end: number;
    modelled_end: number;
    collected_total: number;
    runoff_total: number;
    lent_total: number;
  };
  recent_activity: {
    date: string;
    description: string;
    agreement_number: string;
    source: string;
  }[];
};

const gbp = (n: number) =>
  `£${Number(n).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;

const monthLabel = (m: string) =>
  new Date(m + "-01").toLocaleDateString("en-GB", { month: "short" });

const fullMonthLabel = (m: string) =>
  new Date(m + "-01").toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

/**
 * A column is about 30px wide, so the cap carries a rounded figure — enough to
 * read the shape of the year at a glance. The exact pounds are on hover.
 */
const compactGbp = (n: number) => {
  const value = Math.round(Number(n) || 0);
  if (value >= 1000) return `£${Math.round(value / 1000)}k`;
  return `£${value.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
};

export default function AdminDashboardPage() {
  return (
    <AdminShell>
      <DashboardInner />
    </AdminShell>
  );
}

function DashboardInner() {
  const router = useRouter();
  const base = adminBasePath();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [reloading, setReloading] = useState(true);
  const [missMonth, setMissMonth] = useState("");
  const loadSeq = useRef(0);

  const load = useCallback(async (opts?: { showBusy?: boolean }) => {
    const seq = ++loadSeq.current;
    if (opts?.showBusy) setReloading(true);
    try {
      const res = await fetch(`/api/admin/dashboard?t=${Date.now()}`, {
        method: "POST",
        headers: {
          ...adminHeaders(),
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          Pragma: "no-cache",
        },
        body: JSON.stringify({ refresh: true }),
        cache: "no-store",
      });
      if (seq !== loadSeq.current) return;
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Couldn't load the dashboard.");
        return;
      }
      setError("");
      setData(json);
      const months: string[] = json.dd_miss_months || [];
      setMissMonth((current) =>
        current && months.includes(current) ? current : months[months.length - 1] || ""
      );
    } catch {
      if (seq !== loadSeq.current) return;
      setError("Couldn't load the dashboard.");
    } finally {
      if (seq === loadSeq.current) setReloading(false);
    }
  }, []);

  useBookReload(load);

  const refreshCollections = async () => {
    setSyncing(true);
    // A full pass over the book against every GoCardless payment takes a
    // while, and a silent spinner reads as a hang. Say what it is doing and
    // how long it has been going.
    setSyncMsg("Checking every agreement against GoCardless. This takes a minute or two — leave the page open.");
    const startedAt = Date.now();
    const ticker = setInterval(() => {
      const seconds = Math.round((Date.now() - startedAt) / 1000);
      setSyncMsg(
        `Checking every agreement against GoCardless — ${seconds}s so far. This takes a minute or two; leave the page open.`
      );
    }, 5000);
    try {
      const res = await fetch("/api/admin/sync-payments", {
        headers: adminHeaders(),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Sync failed");
      setSyncMsg(
        `Updated ${json.marked_paid} collections across ${json.agreements} mandates.`
      );
      await load();
    } catch (err: any) {
      setSyncMsg(err.message || "GoCardless refresh failed.");
    } finally {
      clearInterval(ticker);
      setSyncing(false);
    }
  };

  const collected = data?.totals.collected_this_month || 0;
  // What is still expected in this month: this month's own instalments plus
  // last month's misses, which are still owed and still have to be collected.
  const broughtForward = data?.totals.arrears_brought_forward || 0;
  const stillDue = (data?.totals.due_this_month || 0) + broughtForward;
  const collectionTotal = collected + stillDue;
  const collectionRate = collectionTotal > 0 ? Math.round((collected / collectionTotal) * 100) : 0;
  const monthName = new Date().toLocaleDateString("en-GB", { month: "long" });
  const lastMonthName = new Date(
    Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 1)
  ).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
  const updatedTime = data?.generated_at
    ? new Date(data.generated_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : "—";

  return (
    <div className="executive-dashboard">
      <section className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <h1>Company dashboard</h1>
          <p>Your lending book at a glance. Live figures, collections and what needs attention.</p>
        </div>
        <div className="dashboard-date">
          <span>{new Date().toLocaleDateString("en-GB", { weekday: "long" })}</span>
          <strong>{new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long" })}</strong>
          <small>Last synced today at {updatedTime} <i /> All systems up to date</small>
        </div>
        <div className="dashboard-hero-actions">
          {base !== "/admin/gg" && (
            <button className="refresh" onClick={refreshCollections} disabled={syncing || reloading}>
              <span aria-hidden="true">↻</span>{syncing ? "Refreshing…" : "Refresh collections"}
            </button>
          )}
          <button className="new-deal" onClick={() => router.push(`${base}/new-deal`)}>
            <span aria-hidden="true">＋</span>Load a new deal
          </button>
        </div>
      </section>

      {syncMsg && (
        <div className={syncMsg.startsWith("Updated") ? "admin-ok" : syncing ? "admin-ok" : "admin-error"}>
          {syncMsg}
        </div>
      )}
      {error && <div className="admin-error">{error}</div>}
      {reloading && !data && !error && <div className="dashboard-loading">Loading the book…</div>}

      {data && (
        <>
          <div className="dashboard-main-grid">
            <section className="dashboard-panel book-health">
              <div className="panel-heading">
                <div><h2>Book health</h2><p>Total value, collections performance and 12 month trend.</p></div>
                <button onClick={() => load({ showBusy: true })} disabled={reloading || syncing}>{reloading ? "Reloading…" : "↻ Reload figures"}</button>
              </div>
              <div className="book-health-chart">
                <div className="book-total">
                  <span>Total book value</span>
                  <strong>{gbp(data.totals.outstanding + data.totals.overdue)}</strong>
                  <small>{data.totals.live} live agreements</small>
                </div>
              <div className="admin-chart">
                {(() => {
                  const max = Math.max(
                    ...data.chart.map((c) => c.paid + c.unpaid),
                    1
                  );
                  return data.chart.map((c) => (
                    <div className="admin-col" key={c.month}>
                      <b className="admin-bar-value">{compactGbp(c.paid + c.unpaid)}</b>
                      <div className="admin-bars">
                        <div
                          className="admin-bar-unpaid"
                          style={{ height: `${(c.unpaid / max) * 100}%` }}
                        />
                        <div
                          className="admin-bar-paid"
                          style={{ height: `${(c.paid / max) * 100}%` }}
                        />
                      </div>
                      <span>{monthLabel(c.month)}</span>
                      <div className="admin-bar-tip" role="tooltip">
                        <b>{fullMonthLabel(c.month)}</b>
                        <i><em>Paid</em>{gbp(c.paid)}</i>
                        <i><em>Still due</em>{gbp(c.unpaid)}</i>
                        <i><em>Total</em>{gbp(c.paid + c.unpaid)}</i>
                      </div>
                    </div>
                  ));
                })()}
              </div>
              <div className="admin-legend">
                <span>
                  <i
                    className="admin-swatch"
                    style={{ background: "var(--blue)" }}
                  />
                  Paid
                </span>
                <span>
                  <i className="admin-swatch" style={{ background: "#EBD9AE" }} />
                  Still due that month
                </span>
              </div>
              </div>
              <div className="book-health-summary">
                <div className="collection-rate" style={{ "--rate": `${collectionRate * 3.6}deg` } as React.CSSProperties}>
                  <div><strong>{collectionRate}%</strong></div>
                  <p><b>Collection rate</b><span>{gbp(collected)} collected<br />of {gbp(collectionTotal)} due</span></p>
                </div>
                <div className="health-metric"><span className="metric-icon blue">▤</span><p>Live agreements<strong>{data.totals.live}</strong><small>{data.totals.finished} finished</small></p></div>
                <div className="health-metric"><span className="metric-icon green">▥</span><p>Collected this month<strong className="green-text">{gbp(collected)}</strong><small>{data.totals.collected_count ?? "—"} collections{data.totals.in_flight_this_month > 0 ? ` · ${gbp(data.totals.in_flight_this_month)} on its way` : ""}</small></p></div>
                <div className="health-metric"><span className="metric-icon gold">●</span><p>Still due this month<strong className="gold-text">{gbp(stillDue)}</strong><small>{[
                  broughtForward > 0 ? `${gbp(data.totals.due_this_month)} for ${monthName}, ${gbp(broughtForward)} owed from ${lastMonthName}` : `${monthName} instalments`,
                  data.totals.lumps_this_month > 0 ? `includes ${gbp(data.totals.lumps_this_month)} one-off` : "",
                ].filter(Boolean).join(" · ")}</small></p></div>
              </div>
            </section>

            <section className="dashboard-panel action-centre">
              <div className="panel-heading"><div><h2>Action centre</h2><p>Agreements that need your attention.</p></div><button onClick={() => router.push(`${base}/agreements`)}>View all agreements →</button></div>
              <div className="overdue-alert"><span>!</span><div><small>Total overdue</small><strong>{gbp(data.totals.overdue)}</strong></div><p>Missed in {lastMonthName} and {monthName}</p></div>
              {data.webhook && data.webhook.state !== "ok" && (
                <div className="webhook-alert">
                  <span aria-hidden="true">!</span>
                  <p>
                    <strong>Payments are not updating on their own.</strong>{" "}
                    {data.webhook.message}
                  </p>
                </div>
              )}
              <h3>Priority agreements</h3>
              {data.attention.filter((row) => row.reason === "Overdue collections").length === 0 ? (
                <p className="admin-lead">Nothing overdue.</p>
              ) : (
                <div className="admin-action-scroll">
                <table className="admin-attn">
                  <thead>
                    <tr>
                      <th>Agreement</th>
                      <th>Customer</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.attention.filter((row) => row.reason === "Overdue collections").map((row) => (
                      <tr
                        key={row.agreement_number + row.reason}
                        onClick={() =>
                          router.push(
                            `${base}/lookup?agreement=${encodeURIComponent(
                              row.agreement_number
                            )}`
                          )
                        }
                      >
                        <td>
                          <strong>{row.agreement_number}</strong>
                        </td>
                        <td>{row.company_name}</td>
                        <td className="mono"><strong>{row.amount != null ? gbp(row.amount) : "—"}</strong></td>
                        <td><span className="admin-pill">Overdue</span></td>
                        <td><button className="view-agreement">View →</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
              {base !== "/admin/gg" && (
                <DdMissPanel
                  months={data.dd_miss_months || []}
                  selected={missMonth}
                  onSelect={setMissMonth}
                  rows={data.dd_misses || []}
                  onOpen={(agreement) =>
                    router.push(
                      `${base}/lookup?agreement=${encodeURIComponent(agreement)}`
                    )
                  }
                />
              )}
            </section>
          </div>

          {data.turnover && data.turnover.months.length > 0 && (
            <section className="dashboard-panel turnover-panel">
              <div className="panel-heading">
                <div>
                  <h2>Turnover outlook</h2>
                  <p>
                    What the book is contracted to pay in over 24 months, and what it
                    becomes if every collection is written away again
                    {data.turnover.term_months
                      ? ` at the ${data.turnover.uplift ? `${Math.round((data.turnover.uplift - 1) * 1000) / 10}%` : ""} uplift over ${data.turnover.term_months} months you have been writing.`
                      : "."}
                  </p>
                </div>
              </div>
              <TurnoverChart data={data.turnover} />
            </section>
          )}

          <div className="dashboard-bottom-grid">
            <section className="dashboard-panel cashflow-panel">
              <div className="panel-heading"><div><h2>New lending</h2><p>Deals written and capital lent in the last 12 months.</p></div></div>
              <div className="cashflow-cards">
                {data.lending.slice(-3).map((item, index) => (
                  <div className={`cashflow-card tone-${index}`} key={item.month}>
                    <span>£</span><p>{monthLabel(item.month)}<strong>{gbp(item.total_lent)}</strong><small>{item.deals} {item.deals === 1 ? "deal" : "deals"} written</small></p>
                  </div>
                ))}
              </div>
              <table className="admin-attn">
                <thead><tr><th>Month</th><th>Deals written</th><th>Capital lent</th></tr></thead>
                <tbody>{data.lending.map((item) => (
                  <tr key={item.month}><td>{new Date(`${item.month}-01`).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</td><td>{item.deals}</td><td className="mono"><strong>{gbp(item.total_lent)}</strong></td></tr>
                ))}</tbody>
              </table>
            </section>
            <div className="dashboard-side-stack">
              <section className="dashboard-panel cashflow-panel compact-cashflow">
                <div className="panel-heading"><div><h2>Cashflow outlook</h2><p>Expected receipts from existing agreements.</p></div></div>
                <div className="cashflow-cards">
                  {data.cashflow.map((item, index) => (
                    <div className={`cashflow-card tone-${index}`} key={item.days}>
                      <span>▣</span><p>Next {item.days} days<strong>{gbp(item.amount)}</strong><small>{item.count} instalments</small></p>
                    </div>
                  ))}
                </div>
              </section>
              <section className="dashboard-panel recent-panel">
                <div className="panel-heading"><div><h2>Recent activity</h2><p>Latest payments across your book.</p></div></div>
                {data.recent_activity.length ? (
                  <table>
                    <tbody>{data.recent_activity.map((item, index) => (
                      <tr key={`${item.date}-${item.agreement_number}-${index}`}><td><i /></td><td>{new Date(item.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</td><td>{item.description}</td><td>{item.agreement_number}</td><td>{item.source}</td></tr>
                    ))}</tbody>
                  </table>
                ) : <p className="empty-activity">No recent payments to show.</p>}
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The run-off and the modelled turnover on one scale. The gap between the two
 * lines is the lending, so the chart answers the question it is there for:
 * how much writing it takes to stand still.
 */
function TurnoverChart({
  data,
}: {
  data: NonNullable<Dashboard["turnover"]>;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const rows: NonNullable<Dashboard["turnover"]>["months"] = data.months;
  const W = 900;
  const H = 230;
  const L = 50;
  const R = 74;
  const T = 16;
  const B = 28;
  const pw = W - L - R;
  const ph = H - T - B;
  const peak = Math.max(...rows.map((r) => r.turnover), 1);
  const top = Math.ceil(peak / 20000) * 20000 || 20000;
  const x = (i: number) => L + (pw * i) / Math.max(1, rows.length - 1);
  const y = (v: number) => T + ph - (ph * v) / top;
  const path = (pick: (r: (typeof rows)[number]) => number) =>
    "M" + rows.map((r, i) => `${x(i).toFixed(1)},${y(pick(r)).toFixed(1)}`).join(" L");
  const band =
    "M" +
    rows.map((r, i) => `${x(i).toFixed(1)},${y(r.turnover).toFixed(1)}`).join(" L") +
    " L" +
    rows
      .map((r, i) => `${x(i).toFixed(1)},${y(r.existing).toFixed(1)}`)
      .reverse()
      .join(" L") +
    " Z";
  const last = rows.length - 1;
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += 20000) ticks.push(v);
  const colW = pw / Math.max(1, rows.length - 1);
  const shown = hover != null ? rows[hover] : null;

  return (
    <div className="turnover-body">
      <div className="turnover-figures">
        <div>
          <span>Paying in today</span>
          <strong>{gbp(data.opening)}</strong>
          <small>{rows[0]?.agreements ?? 0} live agreements</small>
        </div>
        <div>
          <span>Contracted by {monthLabel(rows[last].month)} {rows[last].month.slice(2, 4)}</span>
          <strong className="gold-text">{gbp(data.runoff_end)}</strong>
          <small>{rows[last]?.agreements ?? 0} still paying, writing nothing new</small>
        </div>
        <div>
          <span>With collections relent</span>
          <strong className="green-text">{gbp(data.modelled_end)}</strong>
          <small>{gbp(data.lent_total)} written over the 24 months</small>
        </div>
      </div>
      <div className="turnover-chart">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Monthly turnover over 24 months: the book falls from ${gbp(data.opening)} to ${gbp(data.runoff_end)} on its own, or holds at ${gbp(data.modelled_end)} if collections are relent.`}>
          {ticks.map((v) => (
            <g key={v}>
              <line className="t-grid" x1={L} y1={y(v)} x2={L + pw} y2={y(v)} />
              <text className="t-axis" x={L - 8} y={y(v) + 3.5} textAnchor="end">
                {v ? `£${Math.round(v / 1000)}k` : "0"}
              </text>
            </g>
          ))}
          <path d={band} className="t-band" />
          <path d={path((r) => r.turnover)} className="t-line t-model" />
          <path d={path((r) => r.existing)} className="t-line t-runoff" />
          <circle cx={x(last)} cy={y(rows[last].turnover)} r="3.5" className="t-dot t-model-dot" />
          <circle cx={x(last)} cy={y(rows[last].existing)} r="3.5" className="t-dot t-runoff-dot" />
          <text className="t-end t-model-dot" x={x(last) + 8} y={y(rows[last].turnover) + 4}>
            £{Math.round(rows[last].turnover / 1000)}k
          </text>
          <text className="t-end t-runoff-dot" x={x(last) + 8} y={y(rows[last].existing) + 4}>
            £{Math.round(rows[last].existing / 1000)}k
          </text>
          {rows.map((r, i) =>
            i % 3 === 0 || i === last ? (
              <text className="t-axis" key={r.month} x={x(i)} y={T + ph + 18} textAnchor="middle">
                {monthLabel(r.month)} {r.month.slice(2, 4)}
              </text>
            ) : null
          )}
          {rows.map((r, i) => (
            <rect
              key={r.month}
              className="t-hit"
              x={x(i) - colW / 2}
              y={T}
              width={colW}
              height={ph}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? null : h))}
            />
          ))}
          {shown && (
            <line className="t-cursor" x1={x(hover!)} y1={T} x2={x(hover!)} y2={T + ph} />
          )}
        </svg>
        <div className="turnover-readout">
          {shown ? (
            <>
              <b>{monthLabel(shown.month)} {shown.month.slice(2, 4)}</b>
              <i><em>On the book today</em>{gbp(shown.existing)}</i>
              <i><em>Written from here</em>{gbp(shown.written)}</i>
              <i><em>Turnover</em>{gbp(shown.turnover)}</i>
            </>
          ) : (
            <>
              <b>Over the 24 months</b>
              <i><em>Collected as it stands</em>{gbp(data.runoff_total)}</i>
              <i><em>Collected if relent</em>{gbp(data.collected_total)}</i>
              <i><em>Difference</em>{gbp(data.collected_total - data.runoff_total)}</i>
            </>
          )}
        </div>
      </div>
      <div className="admin-legend">
        <span><i className="admin-swatch" style={{ background: "var(--blue)" }} />Contracted on today&rsquo;s book</span>
        <span><i className="admin-swatch" style={{ background: "var(--green)" }} />With collections relent</span>
      </div>
    </div>
  );
}

function DdMissPanel({
  months,
  selected,
  onSelect,
  rows,
  onOpen,
}: {
  months: string[];
  selected: string;
  onSelect: (month: string) => void;
  rows: {
    agreement_number: string;
    company_name: string;
    months: string[];
    latest_amount: number;
  }[];
  onOpen: (agreement: string) => void;
}) {
  const visible = rows.filter((row) => !selected || row.months.includes(selected));
  const countFor = (month: string) =>
    rows.filter((row) => row.months.includes(month)).length;

  return (
    <div className="dd-miss-panel">
      <h3>Direct Debit misses</h3>
      <p className="dd-miss-help">
        Failed collections from September 2026. Retries stay on the month they first missed.
      </p>
      <div className="dd-miss-months">
        {months.map((month) => (
          <button
            key={month}
            type="button"
            className={`dd-miss-chip ${selected === month ? "on" : ""} ${countFor(month) ? "has-miss" : ""}`}
            onClick={() => onSelect(month)}
          >
            {new Date(`${month}-01`).toLocaleDateString("en-GB", {
              month: "short",
              year: "numeric",
            })}
            <b>{countFor(month)}</b>
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <p className="admin-lead">No Direct Debit misses this month.</p>
      ) : (
        <div className="admin-action-scroll">
          <table className="admin-attn">
            <thead>
              <tr>
                <th>Agreement</th>
                <th>Customer</th>
                <th>Months missed</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.agreement_number} onClick={() => onOpen(row.agreement_number)}>
                  <td>
                    <strong>{row.agreement_number}</strong>
                  </td>
                  <td>{row.company_name}</td>
                  <td>
                    <div className="dd-miss-row-months">
                      {row.months.map((month) => (
                        <span
                          key={month}
                          className={`admin-pill miss ${month === selected ? "now" : ""}`}
                        >
                          {new Date(`${month}-01`).toLocaleDateString("en-GB", {
                            month: "short",
                          })}
                        </span>
                      ))}
                      {row.months.length > 1 && (
                        <span className="dd-miss-regular">Regular</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <button className="view-agreement">View →</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
