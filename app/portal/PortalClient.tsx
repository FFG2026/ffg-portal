"use client";

import { useState } from "react";
import LogoutButton from "./LogoutButton";

type PaymentRow = {
  instalment_number: number;
  due_date: string;
  amount: number;
  status: string;
};

type AgreementSummary = {
  agreementNumber: string;
  agreementType: string;
  assetDescription: string;
  monthlyInstalment: number;
  startDate: string;
  termMonths: number;
  paidCount: number;
  settlementFigure: number;
  lastPaymentDate: string | null;
  schedule: PaymentRow[];
};

type Props = {
  companyName: string;
  initials: string;
  agreements: AgreementSummary[];
};

export default function PortalClient(props: Props) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const active = props.agreements[selectedIndex];
  const pct = Math.round((active.paidCount / active.termMonths) * 1000) / 10;

  const gbp = (n: number) =>
    n.toLocaleString("en-GB", {
      style: "currency",
      currency: "GBP",
      minimumFractionDigits: 2,
    });

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  return (
    <>
      <nav>
        <div className="nav-inner">
          <div className="wordmark">
            <span className="dot"></span>
            FUTURE FG
          </div>
          <div className="nav-right">
            <a href="#">Agreements</a>
            <a href="#">Documents</a>
            <a href="#">Contact us</a>
            <LogoutButton />
            <div className="avatar">{props.initials}</div>
          </div>
        </div>
      </nav>

      <div className="wrap">
        <div className="page-head">
          <div className="eyebrow">Customer portal</div>
          <h1>Welcome back, {props.companyName}</h1>
          <p>
            {props.agreements.length > 1
              ? `You hold ${props.agreements.length} agreements with us — figures shown are accurate as of today.`
              : `Here's the latest on agreement ${active.agreementNumber} — figures shown are accurate as of today.`}
          </p>
        </div>

        {props.agreements.length > 1 && (
          <div className="agreement-switcher">
            {props.agreements.map((a, i) => (
              <button
                key={a.agreementNumber}
                className={`switcher-pill ${i === selectedIndex ? "active" : ""}`}
                onClick={() => {
                  setSelectedIndex(i);
                  setScheduleOpen(false);
                }}
              >
                <span className="num">{a.agreementNumber}</span>
                <span className="asset">{a.assetDescription}</span>
              </button>
            ))}
          </div>
        )}

        <div className="grid">
          <div>
            <div className="card">
              <div className="card-head">
                <h2>Agreement {active.agreementNumber}</h2>
                <span className="tag tag-hp">
                  {active.agreementType === "HP"
                    ? "HIRE PURCHASE"
                    : active.agreementType === "FL"
                    ? "FINANCE LEASE"
                    : "LOAN"}
                </span>
              </div>
              <div className="agreement-row">
                <div className="field">
                  <div className="label">Asset</div>
                  <div className="val">{active.assetDescription}</div>
                </div>
                <div className="field">
                  <div className="label">Monthly instalment</div>
                  <div className="val mono">
                    {gbp(active.monthlyInstalment)}
                  </div>
                </div>
                <div className="field">
                  <div className="label">Agreement start</div>
                  <div className="val mono">
                    {formatDate(active.startDate)}
                  </div>
                </div>
                <div className="field">
                  <div className="label">Original term</div>
                  <div className="val mono">{active.termMonths} months</div>
                </div>
              </div>

              <div className="progress-wrap">
                <div className="progress-labels">
                  <span>Instalments paid</span>
                  <span className="count">
                    {active.paidCount} / {active.termMonths}
                  </span>
                </div>
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${pct}%` }}
                  ></div>
                </div>
              </div>

              {active.lastPaymentDate && (
                <div className="status-strip">
                  <span className="status-dot"></span>
                  <span className="txt">
                    Direct debit <b>up to date</b> — last payment recorded{" "}
                    {formatDate(active.lastPaymentDate)}
                  </span>
                </div>
              )}

              <div
                className="schedule-toggle"
                onClick={() => setScheduleOpen((v) => !v)}
              >
                <span>{scheduleOpen ? "\u2212" : "+"}</span> View full
                payment schedule
              </div>
              <div className={`schedule ${scheduleOpen ? "open" : ""}`}>
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Instalment</th>
                      <th className="mono">Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.schedule.map((row) => (
                      <tr key={row.instalment_number}>
                        <td>{formatDate(row.due_date)}</td>
                        <td>{row.instalment_number}</td>
                        <td className="mono">{gbp(row.amount)}</td>
                        <td>
                          {row.status === "paid" ? (
                            <span className="paid-chip">&#10003;</span>
                          ) : (
                            <span className="due-chip"></span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card apply-card" style={{ marginTop: 24 }}>
              <h3>Financing another asset?</h3>
              <p>
                We already hold your business and payment details — apply
                for further finance in a couple of minutes.
              </p>
              <button
                className="btn"
                onClick={() =>
                  alert(
                    `This would open the apply flow, pre-filled with ${props.companyName}'s details.`
                  )
                }
              >
                Apply for further finance
              </button>
            </div>
          </div>

          <div>
            <div className="settlement-card">
              <div className="eyebrow">Settlement figure</div>
              <div className="settlement-amt">
                {gbp(active.settlementFigure)}
              </div>
              <div className="settlement-valid">
                Valid to close of business today
              </div>
              <div className="settlement-rows">
                <div className="row">
                  <span>Instalments paid</span>
                  <span>
                    {active.paidCount} / {active.termMonths}
                  </span>
                </div>
                <div className="row">
                  <span>Outstanding balance</span>
                  <span>{gbp(active.settlementFigure)}</span>
                </div>
                <div className="row">
                  <span>Early settlement rebate</span>
                  <span>£0.00</span>
                </div>
              </div>
              <div className="settlement-actions">
                <button
                  className="btn btn-white"
                  onClick={() =>
                    alert(
                      "This would generate a PDF settlement letter, same as the ones already being produced manually."
                    )
                  }
                >
                  Download settlement letter
                </button>
              </div>
              <div className="settlement-actions" style={{ marginTop: 10 }}>
                <button
                  className="btn btn-ghost"
                  onClick={() =>
                    alert("This would open a message to Future FG.")
                  }
                >
                  Request by phone instead
                </button>
              </div>
            </div>

            <div className="card bank-card">
              <h2>Payment details</h2>
              <div className="bank-row">
                <span className="label">Account name</span>
                <span className="val">Future F G Limited</span>
              </div>
              <div className="bank-row">
                <span className="label">Bank</span>
                <span className="val">Lloyds Bank</span>
              </div>
              <div className="bank-row">
                <span className="label">Sort code</span>
                <span className="val">30-98-97</span>
              </div>
              <div className="bank-row">
                <span className="label">Account number</span>
                <span className="val">52431263</span>
              </div>
              <div className="bank-row">
                <span className="label">Reference</span>
                <span className="val">{active.agreementNumber}</span>
              </div>
              <div className="copy-hint">
                Use agreement {active.agreementNumber} as your payment
                reference so we can match it quickly.
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
