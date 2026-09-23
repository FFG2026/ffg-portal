"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import AdminShell, { adminHeaders, currentAdminBook } from "../AdminShell";
import PageHero from "../PageHero";
import { notifyBookChanged } from "../../../lib/admin-book-reload";

type RelatedAgreement = {
  agreement_number: string;
  agreement_type: string;
  asset_description: string | null;
  live: boolean;
  paid_count: number;
  term_months: number;
  settlement_figure: number;
};

type LookupResult = {
  agreement: {
    agreement_number: string;
    agreement_type: string;
    asset_description: string | null;
    monthly_instalment: number;
    start_date: string;
    written_date?: string;
    term_months: number;
    total_lend: number;
    purchase_price: number | null;
    customer_deposit: number | null;
    commission: number | null;
    documentation_fee: number | null;
    gocardless_mandate_id: string | null;
  };
  customer: {
    company_name: string;
    contact_name: string | null;
    email: string | null;
    phone: string | null;
    has_portal_login: boolean;
  } | null;
  related_agreements?: RelatedAgreement[];
  status: {
    paid_count: number;
    term_months: number;
    live: boolean;
    settlement_figure: number;
    last_payment_date: string | null;
  };
  missed_months?: string[];
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
  missed_months?: string[];
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

function primaryAgreement(agreements: CompanyAgreement[]) {
  return agreements.find((a) => a.live) || agreements[0] || null;
}

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
    value: string,
    opts?: { companyName?: string }
  ) => {
    if (!value.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/admin/agreement-lookup?${mode}=${encodeURIComponent(value.trim())}`,
        { headers: adminHeaders() }
      );
      const data = await res.json();
      if (!res.ok) {
        setResult(null);
        setCompanyResult(null);
        setError(data.error || "Something went wrong");
        return;
      }
      if (data.mode === "company") {
        const only =
          data.customers.length === 1 ? data.customers[0] : null;
        const pick = only ? primaryAgreement(only.agreements) : null;
        if (only && pick) {
          setCompanyResult(null);
          setSearchMode("company");
          setQuery(only.company_name);
          const agrRes = await fetch(
            `/api/admin/agreement-lookup?agreement=${encodeURIComponent(
              pick.agreement_number
            )}`,
            { headers: adminHeaders() }
          );
          const agr = await agrRes.json();
          if (!agrRes.ok) {
            setResult(null);
            setCompanyResult(data);
            setError(agr.error || "Something went wrong");
            return;
          }
          setResult(agr);
          if (typeof window !== "undefined") {
            const url = new URL(window.location.href);
            url.searchParams.set("company", only.company_name);
            url.searchParams.set("agreement", pick.agreement_number);
            window.history.replaceState({}, "", `${url.pathname}${url.search}`);
          }
          return;
        }
        setResult(null);
        setCompanyResult(data);
        if (typeof window !== "undefined") {
          const url = new URL(window.location.href);
          url.searchParams.delete("agreement");
          url.searchParams.set("company", value.trim());
          window.history.replaceState({}, "", `${url.pathname}${url.search}`);
        }
        return;
      }
      setCompanyResult(null);
      setResult(data);
      const companyName =
        opts?.companyName ||
        (searchMode === "company" ? query : "");
      if (companyName) {
        setSearchMode("company");
        setQuery(companyName);
      }
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        if (companyName) {
          url.searchParams.set("company", companyName);
          url.searchParams.set("agreement", value.trim());
        } else {
          url.searchParams.delete("company");
          url.searchParams.set("agreement", value.trim());
        }
        window.history.replaceState({}, "", `${url.pathname}${url.search}`);
      }
    } catch {
      setError("Couldn't reach the server — try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const company = searchParams.get("company");
    const preset = searchParams.get("agreement");
    if (company && preset) {
      setQuery(company);
      setSearchMode("company");
      runLookup("agreement", preset, { companyName: company });
    } else if (company) {
      setQuery(company);
      setSearchMode("company");
      runLookup("company", company);
    } else if (preset) {
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
    <div className="lookup-page">
      <div className="lookup-wrap">
        <PageHero
          title="Lookup"
          subtitle="Find one agreement, or a company and every deal they have."
        />

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
                          {(a.missed_months || []).map((month) => (
                            <span className="lookup-warn" key={month}>
                              Missed{" "}
                              {new Date(`${month}-01`).toLocaleDateString("en-GB", {
                                month: "short",
                                year: "numeric",
                              })}
                            </span>
                          ))}
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
                            runLookup("agreement", a.agreement_number, {
                              companyName: c.company_name,
                            })
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
          <div className="lookup-split">
            <div className="lookup-card lookup-main">
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
                  {result.customer.has_portal_login
                    ? " · portal linked"
                    : " · no portal login yet"}
                </div>
              )}
              {(result.missed_months || []).length > 0 && (
                <div className="lookup-dd-misses">
                  <div className="lookup-dd-misses-label">
                    Missed Direct Debit
                    {(result.missed_months || []).length > 1 ? "s" : ""}
                    {(result.missed_months || []).length > 1
                      ? " · missing regularly"
                      : ""}
                  </div>
                  <div className="lookup-dd-misses-list">
                    {(result.missed_months || []).map((month) => (
                      <span key={month} className="lookup-dd-miss-chip">
                        {new Date(`${month}-01`).toLocaleDateString("en-GB", {
                          month: "long",
                          year: "numeric",
                        })}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {(result.related_agreements || []).length > 1 && (
                <div className="lookup-related">
                  <div className="lookup-related-label">
                    {(result.related_agreements || []).length} agreements
                  </div>
                  <div className="lookup-related-list">
                    {(result.related_agreements || []).map((a) => {
                      const on =
                        a.agreement_number ===
                        result.agreement.agreement_number;
                      return (
                        <button
                          key={a.agreement_number}
                          type="button"
                          className={`lookup-related-chip ${on ? "on" : ""}`}
                          disabled={loading || on}
                          onClick={() =>
                            runLookup("agreement", a.agreement_number, {
                              companyName:
                                result.customer?.company_name || undefined,
                            })
                          }
                        >
                          <strong>{a.agreement_number}</strong>
                          <span
                            className={`lookup-status ${a.live ? "live" : "finished"}`}
                          >
                            {a.live ? "Live" : "Done"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="lookup-hero">
                <div className="lookup-settlement">
                  <div className="lookup-settlement-label">
                    {result.status.live
                      ? result.agreement.agreement_type === "FL"
                        ? "Settlement figure — close of business today, including VAT"
                        : "Settlement figure — close of business today"
                      : "Paid in full"}
                  </div>
                  <div className="lookup-settlement-amt">
                    {gbp(result.status.settlement_figure)}
                  </div>
                  {result.status.last_payment_date && (
                    <div className="lookup-settlement-note">
                      {result.status.live
                        ? `Last payment ${formatDate(result.status.last_payment_date)}`
                        : `Nothing owing. Last payment ${formatDate(result.status.last_payment_date)}.`}
                    </div>
                  )}
                </div>
                <div className="lookup-grid">
                  <div className="lookup-item lookup-item-wide">
                    <div className="lookup-label">Asset</div>
                    <div className="lookup-value">
                      {result.agreement.asset_description || "Not on file"}
                    </div>
                  </div>
                  <div className="lookup-item">
                    <div className="lookup-label">Monthly</div>
                    <div className="lookup-value mono">
                      {gbp(result.agreement.monthly_instalment)}
                    </div>
                  </div>
                  <div className="lookup-item">
                    <div className="lookup-label">Start</div>
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
                  <div className="lookup-item lookup-item-wide">
                    <div className="lookup-label">
                      {currentAdminBook() === "gg"
                        ? "Collections"
                        : "GoCardless mandate"}
                    </div>
                    <div className="lookup-value mono">
                      {currentAdminBook() === "gg"
                        ? "Manual — standing order / bank"
                        : result.agreement.gocardless_mandate_id || "Not linked"}
                    </div>
                  </div>
                </div>
              </div>

              <div className="lookup-deal-actions">
              <AmendDealForm
                key={result.agreement.agreement_number}
                result={result}
                onDone={() => {
                  runLookup("agreement", result.agreement.agreement_number);
                  notifyBookChanged();
                }}
              />

              {result.status.live && result.status.settlement_figure > 0 && (
                  <ManualPaymentsForm
                    key={`${result.agreement.agreement_number}-manual`}
                    agreementNumber={result.agreement.agreement_number}
                    owing={result.status.settlement_figure}
                    onDone={() => {
                      runLookup("agreement", result.agreement.agreement_number);
                      notifyBookChanged();
                    }}
                    gbp={gbp}
                    formatDate={formatDate}
                  />
              )}
              </div>

              <DriveDocuments
                agreementNumber={result.agreement.agreement_number}
              />
            </div>

            <div className="lookup-card lookup-schedule">
              <div className="lookup-schedule-head">
                <h3>Payment schedule</h3>
                <span className="lookup-schedule-count">
                  {result.schedule.length} instalments
                </span>
              </div>
              <div className="lookup-schedule-scroll">
                <table className="lookup-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Due</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.schedule.map((row) => (
                      <tr
                        key={row.instalment_number}
                        className={
                          row.status === "paid"
                            ? "lookup-row-paid"
                            : row.status === "failed" ||
                              (result.missed_months || []).includes(
                                String(row.due_date || "").slice(0, 7)
                              )
                            ? "lookup-row-miss"
                            : ""
                        }
                      >
                        <td>{row.instalment_number}</td>
                        <td>
                          {formatDate(row.due_date)}
                          {row.status === "paid" &&
                            row.paid_date &&
                            row.paid_date.slice(0, 10) !==
                              String(row.due_date || "").slice(0, 10) && (
                              <div className="lookup-row-note">
                                Paid {formatDate(row.paid_date)}
                              </div>
                            )}
                        </td>
                        <td className="mono">{gbp(row.amount)}</td>
                        <td>
                          {row.status === "paid" ? (
                            <span className="lookup-paid">
                              {row.source === "manual" || row.source === "bank"
                                ? "Manual payment"
                                : (result.missed_months || []).includes(
                                    String(row.due_date || "").slice(0, 7)
                                  )
                                ? "Paid after miss"
                                : "Paid"}
                            </span>
                          ) : row.status === "failed" ? (
                            <span className="lookup-failed">Failed</span>
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
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AmendDealForm({
  result,
  onDone,
}: {
  result: LookupResult;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({
    company_name: result.customer?.company_name || "",
    contact_name: result.customer?.contact_name || "",
    email: result.customer?.email || "",
    phone: result.customer?.phone || "",
    asset_description: result.agreement.asset_description || "",
    purchase_price: String(result.agreement.purchase_price ?? ""),
    customer_deposit: String(result.agreement.customer_deposit ?? ""),
    total_lend: String(result.agreement.total_lend ?? ""),
    commission: String(result.agreement.commission ?? ""),
    documentation_fee: String(result.agreement.documentation_fee ?? ""),
    monthly_instalment: String(result.agreement.monthly_instalment ?? ""),
    term_months: String(result.agreement.term_months ?? ""),
    start_date: result.agreement.start_date || "",
    written_date: result.agreement.written_date || result.agreement.start_date || "",
    gocardless_mandate_id: result.agreement.gocardless_mandate_id || "",
  });

  const set = (key: string, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setMsg("");
    try {
      const res = await fetch("/api/admin/deals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...adminHeaders() },
        body: JSON.stringify({
          agreement_number: result.agreement.agreement_number,
          ...form,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save");
      setMsg(
        json.schedule_note ||
          (json.instalments
            ? `Saved. Schedule is now ${json.instalments} instalments.`
            : "Saved.")
      );
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
        {open ? "Cancel" : "Amend this deal"}
      </button>
      {open && (
        <p className="lookup-manual-help">
          Use this if Drive pulled a name, figure or date through wrongly.
          Changing the monthly, term or start date rebuilds the schedule
          (for a rewrite). Paid GoCardless collections of the new monthly
          amount are kept; the old instalments are replaced.
        </p>
      )}
      {msg && <div className="lookup-ok">{msg}</div>}
      {open && (
        <form className="lookup-manual-form" onSubmit={submit}>
          {(
            [
              ["company_name", "Company"],
              ["contact_name", "Contact"],
              ["email", "Email"],
              ["phone", "Phone"],
              ["asset_description", "Asset"],
              ["purchase_price", "Cash price"],
              ["customer_deposit", "Deposit"],
              ["total_lend", "Amount financed"],
              ["commission", "Commission"],
              ["documentation_fee", "Documentation fee"],
              ["monthly_instalment", "Monthly"],
              ["term_months", "Term (months)"],
              ["written_date", "Deal written date"],
              ["start_date", "Start date"],
              ["gocardless_mandate_id", "GoCardless mandate"],
            ] as const
          ).map(([key, label]) => (
            <div
              className={`lookup-field ${
                key === "asset_description" || key === "company_name"
                  ? "lookup-field-wide"
                  : ""
              }`}
              key={key}
            >
              <label>{label}</label>
              <input
                type={
                  key === "start_date" || key === "written_date"
                    ? "date"
                    : key === "email"
                      ? "email"
                      : "text"
                }
                value={form[key]}
                onChange={(e) => set(key, e.target.value)}
              />
            </div>
          ))}
          <button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
          {error && <div className="lookup-error">{error}</div>}
        </form>
      )}
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

function ManualPaymentsForm({
  agreementNumber,
  owing,
  onDone,
  gbp,
  formatDate,
}: {
  agreementNumber: string;
  owing: number;
  onDone: () => void;
  gbp: (n: number) => string;
  formatDate: (d: string | null) => string;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [paidDate, setPaidDate] = useState(todayIso);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const payAmount = Number(amount);
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
          amount,
          paid_date: paidDate,
          note,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save");
      setMsg(
        json.settled
          ? `Recorded ${gbp(json.applied)} on ${formatDate(paidDate)} — this agreement is now settled.`
          : `Recorded ${gbp(json.applied)} on ${formatDate(paidDate)}. ${gbp(
              Math.max(0, remainingAfter)
            )} still owing.`
      );
      setAmount("");
      setNote("");
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
        {open ? "Cancel" : "Manual payments"}
      </button>
      {msg && <div className="lookup-ok">{msg}</div>}
      {open && (
        <form className="lookup-manual-form" onSubmit={submit}>
          <p className="lookup-manual-help">
            Use this when they pay into the bank after a missed Direct Debit,
            or for any other receipt that is not a GoCardless collection. The
            amount and date sit on the schedule as their own line.
          </p>
          <div className="lookup-field">
            <label>Amount</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              max={owing}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={gbp(owing)}
              required
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
            <label>Reason</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Paid into bank after missed Direct Debit"
              required
            />
          </div>
          <p className="lookup-manual-preview">
            {remainingAfter <= 0.009
              ? "After this, the settlement figure will be £0.00."
              : Number.isFinite(payAmount) && payAmount > 0
              ? `After this, ${gbp(remainingAfter)} will still be owing.`
              : `Currently owing ${gbp(owing)}.`}
          </p>
          <button type="submit" disabled={saving}>
            {saving
              ? "Saving…"
              : payAmount > 0
              ? `Record ${gbp(payAmount)} on ${formatDate(paidDate)}`
              : "Record payment"}
          </button>
          {error && <div className="lookup-error">{error}</div>}
        </form>
      )}
    </div>
  );
}
