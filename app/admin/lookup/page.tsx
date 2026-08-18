"use client";

import { useState } from "react";

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
  }[];
};

export default function AgreementLookupPage() {
  const [secret, setSecret] = useState("");
  const [agreementNumber, setAgreementNumber] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
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

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secret.trim() || !agreementNumber.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    setScheduleOpen(false);
    try {
      const res = await fetch(
        `/api/admin/agreement-lookup?secret=${encodeURIComponent(secret.trim())}&agreement=${encodeURIComponent(agreementNumber.trim())}`
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
      } else {
        setResult(data);
      }
    } catch {
      setError("Couldn't reach the server — try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lookup-page">
      <div className="lookup-wrap">
        <div className="lookup-head">
          <div className="lookup-dot"></div>
          <h1>Agreement lookup</h1>
        </div>
        <p className="lookup-sub">
          Internal tool — type an agreement number to see its full details,
          payment history, and current settlement figure.
        </p>

        <form className="lookup-form" onSubmit={lookup}>
          <div className="lookup-field">
            <label>Admin secret</label>
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="Your admin secret"
              autoComplete="off"
            />
          </div>
          <div className="lookup-field">
            <label>Agreement number</label>
            <input
              type="text"
              value={agreementNumber}
              onChange={(e) => setAgreementNumber(e.target.value)}
              placeholder="e.g. HP116 or FL5"
              autoComplete="off"
            />
          </div>
          <button type="submit" disabled={loading}>
            {loading ? "Looking up…" : "Look up"}
          </button>
        </form>

        {error && <div className="lookup-error">{error}</div>}

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
                  Settlement figure — valid to close of business today
                </div>
                <div className="lookup-settlement-amt">
                  {gbp(result.status.settlement_figure)}
                </div>
                {result.status.last_payment_date && (
                  <div className="lookup-settlement-note">
                    Last payment recorded {formatDate(result.status.last_payment_date)}
                  </div>
                )}
              </div>

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
                            <span className="lookup-paid">Paid</span>
                          ) : (
                            <span className="lookup-due">Due</span>
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
