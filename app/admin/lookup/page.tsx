"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import AdminShell, { adminHeaders } from "../AdminShell";
import { notifyBookChanged } from "../../../lib/admin-book-reload";

type LookupResult = {
  agreement: {
    agreement_number: string;
    agreement_type: string;
    asset_description: string | null;
    monthly_instalment: number;
    start_date: string;
    term_months: number;
    total_lend: number;
    gocardless_mandate_id: string | null;
  };
  customer: {
    company_name: string;
    email: string | null;
    has_portal_login: boolean;
  } | null;
  status: {
    paid_count: number;
    term_months: number;
    live: boolean;
    settlement_figure: number;
    last_payment_date: string | null;
  };
  schedule: {
    instalment_number: number;
    due_date: string;
    amount: number;
    status: string;
    paid_date: string | null;
    balance_after: number;
    notes: string | null;
    source: string | null;
  }[];
};

type CompanyAgreement = {
  agreement_number: string;
  agreement_type: string;
  asset_description: string | null;
  monthly_instalment: number;
  paid_count: number;
  term_months: number;
  live: boolean;
  settlement_figure: number;
  has_schedule: boolean;
  gocardless_mandate_id: string | null;
};

type CompanyResult = {
  mode: "company";
  customers: {
    company_name: string;
    email: string | null;
    has_portal_login: boolean;
    agreements: CompanyAgreement[];
  }[];
};

export default function AgreementLookupPage() {
  return (
    <Suspense>
      <AdminShell>
        <LookupInner />
      </AdminShell>
    </Suspense>
  );
}

function LookupInner() {
  const searchParams = useSearchParams();
  const [searchMode, setSearchMode] = useState<"agreement" | "company">(
    "agreement"
  );
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [companyResult, setCompanyResult] = useState<CompanyResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const gbp = (n: number) =>
    `£${Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const formatDate = (d: string | null) =>
    d
      ? new Date(d).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "—";

  const runLookup = async (
    mode: "agreement" | "company",
    value: string
  ) => {
    if (!value.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    setCompanyResult(null);
    setScheduleOpen(false);
    try {
      const res = await fetch(
        `/api/admin/agreement-lookup?${mode}=${encodeURIComponent(value.trim())}`,
        { headers: adminHeaders() }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
      } else if (data.mode === "company") {
        setCompanyResult(data);
      } else {
        setResult(data);
      }
    } catch {
      setError("Couldn't reach the server — try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const preset = searchParams.get("agreement");
    if (preset) {
      setQuery(preset);
      setSearchMode("agreement");
      runLookup("agreement", preset);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lookup = (e: React.FormEvent) => {
    e.preventDefault();
    runLookup(searchMode, query);
  };

  return (
    <div className="lookup-page" style={{ padding: 0 }}>
      <div className="lookup-wrap">
        <div className="lookup-head">
          <div className="lookup-dot"></div>
          <h1>Agreement lookup</h1>
        </div>
        <p className="lookup-sub">
          Internal tool — look up a single agreement, or search a company to
          see all of their agreements in one place.
        </p>

        <div className="lookup-modes">
          <button
            className={`lookup-mode ${searchMode === "agreement" ? "active" : ""}`}
            onClick={() => setSearchMode("agreement")}
            type="button"
          >
            By agreement
          </button>
          <button
            className={`lookup-mode ${searchMode === "company" ? "active" : ""}`}
            onClick={() => setSearchMode("company")}
            type="button"
          >
            By company
          </button>
        </div>

        <form className="lookup-form" onSubmit={lookup}>
          <div className="lookup-field">
            <label>
              {searchMode === "agreement" ? "Agreement number" : "Company name"}
            </label>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                searchMode === "agreement"
                  ? "e.g. HP116 or FL5"
                  : "e.g. Howe, Seymour, Mulberry"
              }
              autoComplete="off"
            />
          </div>
          <button type="submit" disabled={loading}>
            {loading ? "Looking up…" : "Look up"}
          </button>
        </form>

        {error && <div className="lookup-error">{error}</div>}

        {companyResult &&
          companyResult.customers.map((c) => (
            <div className="lookup-card" key={c.company_name}>
              <div className="lookup-company">{c.company_name}</div>
              <div className="lookup-email">
                {c.email || "no email on file"}
                {c.has_portal_login ? " · portal linked" : " · no portal login yet"}
                {" · "}
                {c.agreements.length} agreement
                {c.agreements.length === 1 ? "" : "s"}
              </div>

              <table className="lookup-table">
                <thead>
                  <tr>
                    <th>Agreement</th>
                    <th>Asset</th>
                    <th>Paid</th>
                    <th>Settlement</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {c.agreements.map((a) => (
                    <tr key={a.agreement_number}>
                      <td>
                        <strong>{a.agreement_number}</strong>
                        <div className="lookup-flags">
                          <span
                            className={`lookup-status ${a.live ? "live" : "finished"}`}
                          >
                            {a.live ? "Live" : "Finished"}
                          </span>
                          {!a.has_schedule && (
                            <span className="lookup-warn">No schedule</span>
                          )}
                          {!a.gocardless_mandate_id && (
                            <span className="lookup-warn">No mandate</span>
                          )}
                        </div>
                      </td>
                      <td>
                        {a.asset_description &&
                        !a.asset_description.startsWith("Pending") ? (
                          a.asset_description
                        ) : (
                          <span className="lookup-warn">Not on file</span>
                        )}
                      </td>
                      <td className="mono">
                        {a.paid_count}/{a.term_months}
                      </td>
                      <td className="mono">{gbp(a.settlement_figure)}</td>
                      <td>
                        <span
                          className="lookup-toggle"
                          onClick={() =>
                            runLookup("agreement", a.agreement_number)
                          }
                        >
                          Open
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

        {result && (
          <div className="lookup-result">
            <div className="lookup-card">
              <div className="lookup-card-head">
                <h2>{result.agreement.agreement_number}</h2>
                <span className="lookup-tag">
                  {result.agreement.agreement_type}
                </span>
                <span
                  className={`lookup-status ${result.status.live ? "live" : "finished"}`}
                >
                  {result.status.live ? "Live" : "Finished"}
                </span>
              </div>

              <div className="lookup-company">
                {result.customer?.company_name || "(customer not found)"}
              </div>
              {result.customer?.email && (
                <div className="lookup-email">
                  {result.customer.email}
                  {result.customer.has_portal_login ? " · portal linked" : " · no portal login yet"}
                </div>
              )}

              <div className="lookup-grid">
                <div className="lookup-item">
                  <div className="lookup-label">Asset</div>
                  <div className="lookup-value">
                    {result.agreement.asset_description || "Not on file"}
                  </div>
                </div>
                <div className="lookup-item">
                  <div className="lookup-label">Monthly instalment</div>
                  <div className="lookup-value mono">
                    {gbp(result.agreement.monthly_instalment)}
                  </div>
                </div>
                <div className="lookup-item">
                  <div className="lookup-label">Start date</div>
                  <div className="lookup-value mono">
                    {formatDate(result.agreement.start_date)}
                  </div>
                </div>
                <div className="lookup-item">
                  <div className="lookup-label">Term</div>
                  <div className="lookup-value mono">
                    {result.status.paid_count} / {result.status.term_months} paid
                  </div>
                </div>
                <div className="lookup-item">
                  <div className="lookup-label">Total lend</div>
                  <div className="lookup-value mono">
                    {gbp(result.agreement.total_lend)}
                  </div>
                </div>
                <div className="lookup-item">
                  <div className="lookup-label">GoCardless mandate</div>
                  <div className="lookup-value mono">
                    {result.agreement.gocardless_mandate_id || "Not linked"}
                  </div>
                </div>
              </div>

              <div className="lookup-settlement">
                <div className="lookup-settlement-label">
                  {result.status.live
                    ? "Settlement figure — valid to close of business today"
                    : "Paid in full"}
                </div>
                <div className="lookup-settlement-amt">
                  {gbp(result.status.settlement_figure)}
                </div>
                {result.status.last_payment_date && (
                  <div className="lookup-settlement-note">
                    {result.status.live
                      ? `Last payment recorded ${formatDate(result.status.last_payment_date)}`
                      : `Nothing owing. Last payment ${formatDate(result.status.last_payment_date)}.`}
                  </div>
                )}
              </div>

              {result.status.live && result.status.settlement_figure > 0 && (
                <ManualPaymentForm
                  agreementNumber={result.agreement.agreement_number}
                  owing={result.status.settlement_figure}
                  onDone={() => {
                    setScheduleOpen(true);
                    runLookup("agreement", result.agreement.agreement_number);
                    notifyBookChanged();
                  }}
                  gbp={gbp}
                />
              )}

              <DriveDocuments
                agreementNumber={result.agreement.agreement_number}
              />

              <div
                className="lookup-toggle"
                onClick={() => setScheduleOpen((v) => !v)}
              >
                {scheduleOpen ? "− Hide" : "+ View"} full payment schedule
              </div>

              {scheduleOpen && (
                <table className="lookup-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Due</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Balance after</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.schedule.map((row) => (
                      <tr key={row.instalment_number}>
                        <td>{row.instalment_number}</td>
                        <td>{formatDate(row.due_date)}</td>
                        <td className="mono">{gbp(row.amount)}</td>
                        <td>
                          {row.status === "paid" ? (
                            <span className="lookup-paid">
                              {row.source === "manual" ? "Part settlement" : "Paid"}
                            </span>
                          ) : (
                            <span className="lookup-due">Due</span>
                          )}
                          {row.notes && (
                            <div className="lookup-row-note">{row.notes}</div>
                          )}
                        </td>
                        <td className="mono">{gbp(row.balance_after)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DriveDocuments({ agreementNumber }: { agreementNumber: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<{
    connected: boolean;
    folder: { name: string; company: string | null; url: string } | null;
    files: { id: string; name: string; kind: string; url: string }[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(
          `/api/admin/google/documents?agreement=${encodeURIComponent(agreementNumber)}`,
          { headers: adminHeaders() }
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Could not load documents");
        if (!cancelled) setData(json);
      } catch (err: any) {
        if (!cancelled) setError(err.message || "Could not load documents");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [agreementNumber]);

  return (
    <div className="lookup-docs">
      <h3>Google Drive</h3>
      {loading && <p className="lookup-docs-help">Loading documents…</p>}
      {!loading && error && <div className="lookup-error">{error}</div>}
      {!loading && data && !data.connected && (
        <p className="lookup-docs-help">
          Connect Google Drive by copying GOOGLE_SERVICE_ACCOUNT_JSON from
          the DCF Portal Vercel project, then scan folders under Drive.
        </p>
      )}
      {!loading && data?.connected && !data.folder && (
        <p className="lookup-docs-help">
          No matching folder in Agreements for {agreementNumber}. Folders are
          named like HP143 - Company.
        </p>
      )}
      {data?.folder && (
        <>
          <p className="lookup-docs-help">
            {data.folder.company
              ? `${data.folder.company} — `
              : ""}
            <a href={data.folder.url} target="_blank" rel="noreferrer">
              Open {data.folder.name} in Drive
            </a>
          </p>
          {data.files.length === 0 ? (
            <p className="lookup-docs-help">That folder is empty.</p>
          ) : (
            <ul className="lookup-docs-list">
              {data.files.map((file) => (
                <li key={file.id}>
                  <a href={file.url} target="_blank" rel="noreferrer">
                    <span>{file.name}</span>
                    <span className="lookup-docs-kind">{file.kind}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function ManualPaymentForm({
  agreementNumber,
  owing,
  onDone,
  gbp,
}: {
  agreementNumber: string;
  owing: number;
  onDone: () => void;
  gbp: (n: number) => string;
}) {
  const [open, setOpen] = useState(false);
  const [fullSettle, setFullSettle] = useState(false);
  const [amount, setAmount] = useState("");
  const [paidDate, setPaidDate] = useState(todayIso);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const payAmount = fullSettle ? owing : Number(amount);
  const remainingAfter =
    Number.isFinite(payAmount) && payAmount > 0
      ? Math.round((owing - payAmount) * 100) / 100
      : owing;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    setError("");
    try {
      const res = await fetch("/api/admin/manual-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...adminHeaders() },
        body: JSON.stringify({
          agreement_number: agreementNumber,
          amount: fullSettle ? owing : amount,
          paid_date: paidDate,
          note,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save");
      setMsg(
        json.settled
          ? `Recorded ${gbp(json.applied)} — this agreement is now settled.`
          : `Recorded ${gbp(json.applied)}. ${gbp(remainingAfter)} still owing.`
      );
      setAmount("");
      setNote("");
      setFullSettle(false);
      setOpen(false);
      onDone();
    } catch (err: any) {
      setError(err.message || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="lookup-manual">
      <button
        type="button"
        className="lookup-manual-toggle"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Cancel" : "Record a part settlement"}
      </button>
      <p className="lookup-manual-help">
        For a lump that is not a monthly Direct Debit — insurance on a stolen
        van, a vehicle sold off the agreement, or a customer paying down
        part of the balance. Dated today, it comes off the end of the
        schedule. Dated in the past, nothing after that day is left as due,
        and the line sits in date order.
      </p>
      {msg && <div className="lookup-ok">{msg}</div>}
      {open && (
        <form className="lookup-manual-form" onSubmit={submit}>
          <div className="lookup-field">
            <label>Amount</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              max={owing}
              value={fullSettle ? String(owing) : amount}
              onChange={(e) => {
                setFullSettle(false);
                setAmount(e.target.value);
              }}
              placeholder={gbp(owing)}
              required={!fullSettle}
              disabled={fullSettle}
            />
          </div>
          <div className="lookup-field">
            <label>Date received</label>
            <input
              type="date"
              value={paidDate}
              onChange={(e) => setPaidDate(e.target.value)}
              required
            />
          </div>
          <div className="lookup-field lookup-field-wide">
            <label>What was this for?</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Insurance payout — stolen van"
              required
            />
          </div>
          <label className="lookup-check">
            <input
              type="checkbox"
              checked={fullSettle}
              onChange={(e) => setFullSettle(e.target.checked)}
            />
            This pays the agreement off in full ({gbp(owing)})
          </label>
          <p className="lookup-manual-preview">
            {remainingAfter <= 0.009
              ? "After this, the settlement figure will be £0.00."
              : `After this, ${gbp(remainingAfter)} will still be owing.`}
          </p>
          <button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Apply to this agreement"}
          </button>
          {error && <div className="lookup-error">{error}</div>}
        </form>
      )}
    </div>
  );
}
