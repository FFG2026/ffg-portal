"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import AdminShell, { adminHeaders, adminBasePath } from "../AdminShell";
import { useBookReload } from "../../../lib/admin-book-reload";

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
  `£${Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

  return (
    <>
      <div className="admin-kicker">Book</div>
      <h1>Agreements</h1>
      <p className="admin-lead">
        Live deals are still collecting. Outstanding here is only arrears —
        an account that is up to date shows as such, not the rest of the term.
      </p>
      <div className="admin-toolbar">
        <div className="admin-tabs">
          {(["live", "past", "all"] as const).map((tab) => (
            <button
              key={tab}
              className={`admin-tab ${status === tab ? "on" : ""}`}
              onClick={() => {
                setStatus(tab);
              }}
            >
              {tab === "live"
                ? `Live (${counts.live})`
                : tab === "past"
                  ? `Past (${counts.past})`
                  : `All (${counts.all})`}
            </button>
          ))}
        </div>
        <input
          value={q}
          placeholder="Search HP number, company or asset"
          onChange={(e) => {
            setQ(e.target.value);
          }}
        />
      </div>
      <table className="admin-table">
        <thead>
          <tr>
            <th>Agreement</th>
            <th>Customer</th>
            <th>Asset</th>
            <th>Paid</th>
            <th>Outstanding</th>
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
                <div style={{ fontSize: 11, color: "var(--slate)" }}>
                  {a.agreement_type} · {a.start_date}
                </div>
              </td>
              <td>{a.company_name}</td>
              <td>{a.asset_description || "—"}</td>
              <td className="mono">
                {a.paid_count}/{a.term_months}
              </td>
              <td className="mono">
                {a.overdue > 0 ? (
                  <>
                    {gbp(a.overdue)}
                    <div style={{ color: "#8A6A24", fontSize: 11 }}>overdue</div>
                  </>
                ) : (
                  <span style={{ color: "var(--green)", fontWeight: 600 }}>
                    Up to date
                  </span>
                )}
              </td>
              <td>
                {!a.has_mandate && <span className="admin-pill">No mandate</span>}
                {!a.has_schedule && (
                  <span className="admin-pill">No schedule</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
