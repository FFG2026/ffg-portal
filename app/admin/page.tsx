"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminShell, { adminHeaders } from "./AdminShell";

type Dashboard = {
  totals: {
    live: number;
    finished: number;
    customers: number;
    paid_total: number;
    outstanding: number;
    overdue: number;
    due_this_month: number;
    collected_this_month: number;
    no_mandate: number;
  };
  chart: { month: string; paid: number; unpaid: number }[];
  attention: {
    agreement_number: string;
    company_name: string;
    reason: string;
    amount: number | null;
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
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  const load = async () => {
    const res = await fetch("/api/admin/dashboard", { headers: adminHeaders() });
    if (!res.ok) {
      setError("Couldn't load the dashboard.");
      return;
    }
    setData(await res.json());
  };

  useEffect(() => {
    load();
  }, []);

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

  return (
    <>
      <div className="admin-kicker">Book</div>
      <h1>Company dashboard</h1>
      <p className="admin-lead">
        Live book, collections and anything that needs a look. Payments come
        from GoCardless. Refresh after a collection run. New deals go on
        New deal — the workbook can still be dropped there if you have a
        batch of tabs to load.
      </p>

      <div className="admin-actions">
        <button className="primary" onClick={refreshCollections} disabled={syncing}>
          {syncing ? "Refreshing from GoCardless…" : "Refresh collections from GoCardless"}
        </button>
        <button onClick={() => router.push("/admin/new-deal")}>Load a new deal</button>
      </div>
      {syncMsg && (
        <div className={syncMsg.startsWith("Updated") ? "admin-ok" : "admin-error"}>
          {syncMsg}
        </div>
      )}
      {error && <div className="admin-error">{error}</div>}

      {data && (
        <>
          <div className="admin-stats">
            <div className="admin-stat">
              <div className="lbl">Live agreements</div>
              <div className="num">{data.totals.live}</div>
              <div className="sub">{data.totals.finished} finished</div>
            </div>
            <div className="admin-stat">
              <div className="lbl">Outstanding</div>
              <div className="num">{gbp(data.totals.outstanding)}</div>
              <div className="sub">Still to collect on the book</div>
            </div>
            <div className="admin-stat good">
              <div className="lbl">Collected this month</div>
              <div className="num">{gbp(data.totals.collected_this_month)}</div>
              <div className="sub">
                {gbp(data.totals.due_this_month)} still due this month
              </div>
            </div>
            <div className="admin-stat warn">
              <div className="lbl">Overdue</div>
              <div className="num">{gbp(data.totals.overdue)}</div>
              <div className="sub">
                {data.totals.no_mandate} live deals with no mandate
              </div>
            </div>
          </div>

          <div className="admin-grid-2">
            <div className="admin-card">
              <h2>Collections vs still due</h2>
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

            <div className="admin-card">
              <h2>Needs a look</h2>
              {data.attention.length === 0 ? (
                <p className="admin-lead">Nothing flagged.</p>
              ) : (
                <table className="admin-attn">
                  <thead>
                    <tr>
                      <th>Agreement</th>
                      <th>Customer</th>
                      <th>Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.attention.slice(0, 12).map((row) => (
                      <tr
                        key={row.agreement_number + row.reason}
                        onClick={() =>
                          router.push(
                            `/admin/agreements?q=${encodeURIComponent(
                              row.agreement_number
                            )}`
                          )
                        }
                      >
                        <td>
                          <strong>{row.agreement_number}</strong>
                        </td>
                        <td>{row.company_name}</td>
                        <td>
                          <span className="admin-pill">{row.reason}</span>
                          {row.amount != null && (
                            <div className="mono" style={{ marginTop: 4 }}>
                              {gbp(row.amount)}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
