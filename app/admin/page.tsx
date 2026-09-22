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
    collected_this_month: number;
    collected_count?: number | null;
    collected_from_gocardless?: boolean;
    no_mandate: number;
  };
  chart: { month: string; paid: number; unpaid: number }[];
  lending: { month: string; deals: number; total_lent: number }[];
  attention: {
    agreement_number: string;
    company_name: string;
    reason: string;
    amount: number | null;
  }[];
  cashflow: { days: number; amount: number; count: number }[];
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
    setSyncMsg("");
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
      setSyncing(false);
    }
  };

  const collected = data?.totals.collected_this_month || 0;
  const stillDue = data?.totals.due_this_month || 0;
  const collectionTotal = collected + stillDue;
  const collectionRate = collectionTotal > 0 ? Math.round((collected / collectionTotal) * 100) : 0;
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
        <div className={syncMsg.startsWith("Updated") ? "admin-ok" : "admin-error"}>
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
                <div className="health-metric"><span className="metric-icon green">▥</span><p>Collected this month<strong className="green-text">{gbp(collected)}</strong><small>{data.totals.collected_count ?? "—"} paid-out collections</small></p></div>
                <div className="health-metric"><span className="metric-icon gold">●</span><p>Still due this month<strong className="gold-text">{gbp(stillDue)}</strong><small>Current month instalments</small></p></div>
              </div>
            </section>

            <section className="dashboard-panel action-centre">
              <div className="panel-heading"><div><h2>Action centre</h2><p>Agreements that need your attention.</p></div><button onClick={() => router.push(`${base}/agreements`)}>View all agreements →</button></div>
              <div className="overdue-alert"><span>!</span><div><small>Total overdue</small><strong>{gbp(data.totals.overdue)}</strong></div><p>No payment in the last month</p></div>
              <h3>Priority agreements</h3>
              {!data.attention.some((row) => row.amount != null) ? (
                <p className="admin-lead">No overdue agreements.</p>
              ) : (
                <div className="overdue-scroll">
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
                      {data.attention.filter((row) => row.amount != null).map((row) => (
                        <tr
                          key={row.agreement_number + row.reason}
                          onClick={() =>
                            router.push(
                              `${base}/agreements?q=${encodeURIComponent(
                                row.agreement_number
                              )}`
                            )
                          }
                        >
                          <td><strong>{row.agreement_number}</strong></td>
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
            </section>
          </div>

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
