"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AdminShell, { adminHeaders } from "../AdminShell";
import PageHero from "../PageHero";
import { STATUS_LABEL } from "../../../lib/proposals/labels";
import "./proposals.css";

type Row = {
  id: string;
  created_at: string;
  status: string;
  company_name: string | null;
  asset_description: string | null;
  product_type: string | null;
  cash_price: number | null;
  financed: number | null;
  term_months: number | null;
  quoted_rate_pct: number | null;
  quoted_monthly: number | null;
  agreed_rate_pct: number | null;
  agreed_monthly: number | null;
  rep_name: string | null;
  agreement_number: string | null;
  uw_decision: string | null;
};

const gbp = (v: number | null | undefined) =>
  v === null || v === undefined
    ? "–"
    : `£${Number(v).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function ProposalsPage() {
  return (
    <AdminShell>
      <ProposalsInner />
    </AdminShell>
  );
}

function ProposalsInner() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [paste, setPaste] = useState("");
  const [tab, setTab] = useState<"open" | "book" | "declined" | "all">("open");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/proposals", { headers: adminHeaders(), cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load proposals");
      setRows(json.proposals || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const send = async (payload: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const res = await fetch("/api/admin/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...adminHeaders() },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not read that email");
      if (json.duplicate) setMsg("That email is already in – opening it.");
      router.push(`/admin/proposals/${json.id}`);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    await send({ filename: file.name, contentBase64: await toBase64(file) });
  };

  const shown = useMemo(() => {
    if (tab === "all") return rows;
    if (tab === "book") return rows.filter((r) => r.status === "on_book");
    if (tab === "declined") return rows.filter((r) => r.status === "declined");
    return rows.filter((r) => ["new", "underwriting", "approved", "accepted"].includes(r.status));
  }, [rows, tab]);

  return (
    <>
      <PageHero
        title="Proposals"
        subtitle="Drop in a quote proposal email. It's read, checked, underwritten, accepted at an agreed rate and put on the book from here."
      />
      <div className="page-panel" style={{ marginBottom: 14 }}>
        <div
          className={`pp-drop ${over ? "over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            onFile(e.dataTransfer.files?.[0]);
          }}
        >
          <strong>{busy ? "Reading the email…" : "Drop the proposal email here"}</strong>
          <span className="hint">An Outlook .msg or an .eml file</span>
          <label className="admin-file">
            <input
              type="file"
              accept=".msg,.eml,.txt,.html,.htm"
              disabled={busy}
              onChange={(e) => {
                onFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            Choose a file
          </label>
          <details className="pp-paste">
            <summary>Or paste the text of the email</summary>
            <textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste the quote details here" />
            <div className="pp-btns">
              <button className="primary" disabled={busy || !paste.trim()} onClick={() => send({ text: paste })}>
                Read pasted text
              </button>
            </div>
          </details>
        </div>
        {msg && <div className="admin-ok">{msg}</div>}
        {error && <div className="admin-error">{error}</div>}
      </div>

      <div className="admin-tabs" style={{ marginBottom: 12 }}>
        {(
          [
            ["open", "In progress"],
            ["book", "On book"],
            ["declined", "Declined"],
            ["all", "All"],
          ] as const
        ).map(([key, label]) => (
          <button key={key} className={`admin-tab ${tab === key ? "on" : ""}`} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th>Received</th>
            <th>Customer</th>
            <th>Asset</th>
            <th className="pp-num">Financed</th>
            <th className="pp-num">Term</th>
            <th className="pp-num">Rate</th>
            <th className="pp-num">Monthly</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={8}>Loading…</td>
            </tr>
          )}
          {!loading && shown.length === 0 && (
            <tr>
              <td colSpan={8}>Nothing here yet.</td>
            </tr>
          )}
          {shown.map((r) => (
            <tr key={r.id} className="pp-row" onClick={() => router.push(`/admin/proposals/${r.id}`)}>
              <td>{new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</td>
              <td>
                <strong>{r.company_name || "—"}</strong>
                <div style={{ color: "var(--slate)", fontSize: 12 }}>{r.rep_name}</div>
              </td>
              <td>{r.asset_description || "—"}</td>
              <td className="pp-num">{gbp(r.financed)}</td>
              <td className="pp-num">{r.term_months ? `${r.term_months}m` : "–"}</td>
              <td className="pp-num">
                {(r.agreed_rate_pct ?? r.quoted_rate_pct) !== null ? `${r.agreed_rate_pct ?? r.quoted_rate_pct}%` : "–"}
              </td>
              <td className="pp-num">{gbp(r.agreed_monthly ?? r.quoted_monthly)}</td>
              <td>
                <span className={`pp-status ${r.status}`}>{STATUS_LABEL[r.status] || r.status}</span>
                {r.agreement_number && <div style={{ fontSize: 12, marginTop: 3 }}>{r.agreement_number}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
