"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import AdminShell, { adminHeaders, adminBasePath, currentAdminBook } from "../AdminShell";
import { useBookReload } from "../../../lib/admin-book-reload";
import PageHero from "../PageHero";

type Row = {
  agreement_number: string;
  agreement_type: string;
  company_name: string;
  asset_description: string | null;
  monthly_instalment: number;
  total_lend: number;
  start_date: string;
  term_months: number;
  paid_count: number;
  live: boolean;
  outstanding: number;
  overdue: number;
  has_mandate: boolean;
  has_schedule: boolean;
};

const gbp = (n: number) =>
  `£${Number(n).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;

function AgreementsInner() {
  const router = useRouter();
  const base = adminBasePath();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"live" | "past" | "all">(
    (searchParams.get("status") as "live" | "past" | "all") || "live"
  );
  const [q, setQ] = useState(searchParams.get("q") || "");
  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState({ live: 0, past: 0, all: 0 });

  const load = useCallback(async () => {
    const res = await fetch(
      `/api/admin/agreements?status=${status}&q=${encodeURIComponent(q)}&t=${Date.now()}`,
      {
        method: "POST",
        headers: {
          ...adminHeaders(),
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
        body: JSON.stringify({ refresh: true }),
        cache: "no-store",
      }
    );
    if (!res.ok) return;
    const json = await res.json();
    setRows(json.agreements || []);
    setCounts(json.counts);
  }, [status, q]);

  useBookReload(load);

  const overdueCount = rows.filter((a) => a.overdue > 0).length;
  const overdueTotal = rows.reduce((sum, a) => sum + a.overdue, 0);

  return (
    <>
      <PageHero
        title="Agreements"
        subtitle="Live deals are still collecting. Outstanding here is only arrears."
        search={q}
        onSearch={setQ}
        searchPlaceholder="Search HP number, company or asset"
        action={
          <button
            className="page-hero-action"
            type="button"
            onClick={() => router.push(`${base}/new-deal`)}
          >
            + Load a new deal
          </button>
        }
      />

      <div className="page-stat-row">
        <div className="page-stat">
          <div className="page-stat-icon blue">▤</div>
          <div>
            <b>{counts.live}</b>
            <span>Live agreements</span>
          </div>
        </div>
        <div className="page-stat">
          <div className="page-stat-icon navy">▣</div>
          <div>
            <b>{counts.past}</b>
            <span>Finished</span>
          </div>
        </div>
        <div className="page-stat">
          <div className="page-stat-icon gold">!</div>
          <div>
            <b>{overdueCount}</b>
            <span>In arrears on this list</span>
          </div>
        </div>
        <div className="page-stat">
          <div className="page-stat-icon green">£</div>
          <div>
            <b>{gbp(overdueTotal)}</b>
            <span>Overdue on this list</span>
          </div>
        </div>
      </div>

      <section className="page-panel">
        <div className="page-filters">
          {(["live", "past", "all"] as const).map((tab) => (
            <button
              key={tab}
              className={`page-chip ${status === tab ? "on" : ""}`}
              onClick={() => setStatus(tab)}
            >
              {tab === "live"
                ? `Live (${counts.live})`
                : tab === "past"
                  ? `Past (${counts.past})`
                  : `All (${counts.all})`}
            </button>
          ))}
        </div>
        <table className="page-table">
          <thead>
            <tr>
              <th>Agreement</th>
              <th>Customer</th>
              <th>Asset</th>
              <th>Paid</th>
              <th>Outstanding</th>
              <th></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr
                key={a.agreement_number}
                onClick={() =>
                  router.push(
                    `${base}/lookup?agreement=${encodeURIComponent(a.agreement_number)}`
                  )
                }
              >
                <td>
                  <strong>{a.agreement_number}</strong>
                  <span className="sub">
                    {a.agreement_type} · {a.start_date}
                  </span>
                </td>
                <td>{a.company_name}</td>
                <td>{a.asset_description || "—"}</td>
                <td className="mono">
                  {a.paid_count}/{a.term_months}
                </td>
                <td>
                  {a.overdue > 0 ? (
                    <span className="status-pill arrears">{gbp(a.overdue)}</span>
                  ) : (
                    <span className="status-pill active">Up to date</span>
                  )}
                </td>
                <td>
                  {currentAdminBook() !== "gg" && !a.has_mandate && (
                    <span className="admin-pill">No mandate</span>
                  )}
                  {!a.has_schedule && (
                    <span className="admin-pill">No schedule</span>
                  )}
                </td>
                <td>
                  <button type="button" className="view-agreement">
                    View →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

export default function AdminAgreementsPage() {
  return (
    <Suspense>
      <AdminShell>
        <AgreementsInner />
      </AdminShell>
    </Suspense>
  );
}
