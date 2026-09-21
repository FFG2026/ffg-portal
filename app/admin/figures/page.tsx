"use client";

import { useCallback, useState } from "react";
import AdminShell, { adminHeaders } from "../AdminShell";
import { useBookReload } from "../../../lib/admin-book-reload";
import type { LivePortfolio } from "../../../lib/portfolio-live";

const gbp = (n: number | null | undefined) => {
  if (n == null) return "";
  return `£${Number(n).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const pct = (n: number) =>
  `${n.toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

export default function OwnerFiguresPage() {
  return (
    <AdminShell>
      <FiguresInner />
    </AdminShell>
  );
}

function FiguresInner() {
  const [data, setData] = useState<LivePortfolio | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/portfolio?t=${Date.now()}`, {
      method: "POST",
      headers: {
        ...adminHeaders(),
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      body: JSON.stringify({ refresh: true }),
      cache: "no-store",
    });
    if (res.status === 403) {
      setError("This page is only for Owen Brunning.");
      setData(null);
      return;
    }
    if (!res.ok) {
      setError("Couldn't load the live figures.");
      return;
    }
    setError("");
    setData(await res.json());
  }, []);

  useBookReload(load);

  if (error && !data) {
    return (
      <>
        <div className="admin-kicker">Owner</div>
        <h1>Live figures</h1>
        <div className="admin-error">{error}</div>
      </>
    );
  }

  if (!data) return null;

  const repaidTotal = data.shareholders.reduce(
    (sum, s) => sum + s.amount_repaid,
    0
  );
  const valueTotal = data.shareholders.reduce((sum, s) => sum + s.value, 0);
  const projectedTotal = data.shareholders.reduce(
    (sum, s) => sum + s.projected_2030,
    0
  );

  return (
    <>
      <div className="admin-kicker">Owner</div>
      <h1>Live figures</h1>
      <p className="admin-lead">
        Base book from 28 Aug 2026. New agreements from HP142, FL16 and L5
        onwards are added into these boxes as they go on.
        {data.added_deals.length > 0
          ? ` Added since then: ${data.added_deals
              .map((d) => d.agreement_number)
              .join(", ")}.`
          : " No deals added since that book yet."}
      </p>

      <div className="book-dash">
        <section>
          <h2>Portfolio summary</h2>
          <dl className="book-kv">
            <div>
              <dt>Total deals</dt>
              <dd>{data.summary.total_deals}</dd>
            </div>
            <div>
              <dt>Total lent out</dt>
              <dd>{gbp(data.summary.total_lent)}</dd>
            </div>
            <div>
              <dt>Total commission earned</dt>
              <dd>{gbp(data.summary.total_commission)}</dd>
            </div>
            <div>
              <dt>Total repayments contracted</dt>
              <dd>{gbp(data.summary.total_repayments_contracted)}</dd>
            </div>
            <div>
              <dt>Total paid to date</dt>
              <dd>{gbp(data.summary.total_paid)}</dd>
            </div>
            <div>
              <dt>Total remaining outstanding</dt>
              <dd>{gbp(data.summary.total_outstanding)}</dd>
            </div>
            <div>
              <dt>Total profit</dt>
              <dd>{gbp(data.summary.total_profit)}</dd>
            </div>
            <div>
              <dt>Blended yield</dt>
              <dd>{pct(data.summary.blended_yield)}</dd>
            </div>
            <div>
              <dt>Cash at bank</dt>
              <dd>{gbp(data.summary.cash_at_bank)}</dd>
            </div>
            <div>
              <dt>Net position (incl. facility)</dt>
              <dd>{gbp(data.summary.net_position)}</dd>
            </div>
          </dl>
        </section>

        <section>
          <h2>Breakdown by deal type</h2>
          <table className="book-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Deals</th>
                <th>Total lent</th>
                <th>Total profit</th>
                <th>Avg yield</th>
              </tr>
            </thead>
            <tbody>
              {data.by_type.map((row) => (
                <tr key={row.type}>
                  <td>{row.label}</td>
                  <td>{row.deals}</td>
                  <td>{gbp(row.total_lent)}</td>
                  <td>{gbp(row.total_profit)}</td>
                  <td>{pct(row.avg_yield)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h2>Shareholder loan repayments</h2>
          <p className="book-note">
            Total shares issued {data.shares_issued.toLocaleString("en-GB")} ·
            Repayment per share {gbp(data.repayment_per_share)}
          </p>
          <table className="book-table">
            <thead>
              <tr>
                <th>Shareholder</th>
                <th>Shares</th>
                <th>Amount repaid</th>
                <th>Total owed in</th>
              </tr>
            </thead>
            <tbody>
              {data.shareholders.map((row) => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  <td>{row.shares.toLocaleString("en-GB")}</td>
                  <td>{gbp(row.amount_repaid)}</td>
                  <td>{row.total_owed_in != null ? gbp(row.total_owed_in) : ""}</td>
                </tr>
              ))}
              <tr className="book-total">
                <td>Total</td>
                <td>{data.shares_issued.toLocaleString("en-GB")}</td>
                <td>{gbp(repaidTotal)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </section>

        <section>
          <h2>Shareholding value (based on total owed in)</h2>
          <table className="book-table">
            <thead>
              <tr>
                <th>Shareholder</th>
                <th>Shares</th>
                <th>% owned</th>
                <th>Value of shareholding</th>
                <th>Projected value (end 2030)</th>
              </tr>
            </thead>
            <tbody>
              {data.shareholders.map((row) => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  <td>{row.shares.toLocaleString("en-GB")}</td>
                  <td>{pct(row.pct_owned)}</td>
                  <td>{gbp(row.value)}</td>
                  <td>{gbp(row.projected_2030)}</td>
                </tr>
              ))}
              <tr className="book-total">
                <td>Total</td>
                <td>{data.shares_issued.toLocaleString("en-GB")}</td>
                <td>100.0%</td>
                <td>{gbp(valueTotal)}</td>
                <td>{gbp(projectedTotal)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
