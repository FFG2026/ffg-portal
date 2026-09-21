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

  return (
    <>
      <div className="admin-kicker">{base === "/admin/gg" ? "Glacier Gem" : "Future FG"}</div>
      <h1>Company dashboard</h1>
      <p className="admin-lead">
        {base === "/admin/gg"
          ? "Glacier Gem book. Collections are standing orders — open a deal sheet to record a payment when money lands."
          : "Live book, collections and anything that needs a look. Collected this month is what GoCardless has paid out this calendar month — the same total as a payments export — not book ticks or money still going through."}
        {data?.generated_at && (
          <>
            {" "}
            Figures at{" "}
            {new Date(data.generated_at).toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
            .
          </>
        )}
      </p>

      <div className="admin-actions">
        {base !== "/admin/gg" && (
        <button className="primary" onClick={refreshCollections} disabled={syncing || reloading}>
          {syncing ? "Refreshing from GoCardless…" : "Refresh collections from GoCardless"}
        </button>
        )}
        <button
          onClick={() => load({ showBusy: true })}
          type="button"
          disabled={reloading || syncing}
        >
          {reloading ? "Reloading…" : "Reload figures"}
        </button>
        <button onClick={() => router.push(`${base}/new-deal`)}>Load a new deal</button>
      </div>
      {syncMsg && (
        <div className={syncMsg.startsWith("Updated") ? "admin-ok" : "admin-error"}>
          {syncMsg}
        </div>
      )}
      {error && <div className="admin-error">{error}</div>}
      {reloading && !data && !error && (
        <p className="admin-lead">Loading the book…</p>
      )}

      {data && (
        <>
          <div className="admin-stats">
            <div className="admin-stat">
              <div className="lbl">Live agreements</div>
              <div className="num">{data.totals.live}</div>
              <div className="sub">{data.totals.finished} finished</div>
            </div>
            <div className="admin-stat">
              <div className="lbl">Owed in</div>
              <div className="num">{gbp(data.totals.outstanding)}</div>
              <div className="sub">Unpaid instalments from today</div>
            </div>
            <div className="admin-stat good">
              <div className="lbl">Collected this month</div>
              <div className="num">{gbp(data.totals.collected_this_month)}</div>
              <div className="sub">
                {base === "/admin/gg"
                  ? `Standing order / bank this month · ${gbp(data.totals.due_this_month)} still due on this month’s instalments`
                  : data.totals.collected_from_gocardless
                    ? `${data.totals.collected_count ?? 0} paid-out collections in ${new Date().toLocaleDateString("en-GB", { month: "long" })}`
                    : `Book figure (GoCardless did not respond) · ${gbp(data.totals.due_this_month)} still due this month`}
              </div>
            </div>
            <div className="admin-stat warn">
              <div className="lbl">Overdue</div>
              <div className="num">{gbp(data.totals.overdue)}</div>
              <div className="sub">No payment in the last month</div>
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
                            `${base}/agreements?q=${encodeURIComponent(
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
