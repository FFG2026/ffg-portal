"use client";

import type { FiguresDashboard, Kpi } from "../../../lib/figures-dashboard";
import { adminBasePath } from "../AdminShell";
import { ForecastChart, IncomeChart, MixDonut, gbp0 } from "./charts";

function KpiIcon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    book: <><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6M9 13h8M9 17h5" /></>,
    inflow: <><path d="M3 17 9.5 10.5l4 4L21 7" /><path d="M21 12V7h-5" /></>,
    cash: <><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" /><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></>,
    arrears: <><path d="M12 3 2 20h20L12 3z" /><path d="M12 9v5M12 17h.01" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function Delta({ kpi, inverse }: { kpi: Kpi; inverse?: boolean }) {
  if (kpi.delta_pct == null) return null;
  const up = kpi.delta_pct >= 0;
  // On arrears a rise is bad, so the tone is flipped.
  const good = inverse ? !up : up;
  return (
    <p className={`fig-kpi-delta ${good ? "good" : "bad"}`}>
      <span aria-hidden="true">{up ? "↗" : "↘"}</span>
      {up ? "+" : ""}
      {kpi.delta_pct}%<em>vs last month</em>
    </p>
  );
}

function KpiCard({
  tone,
  icon,
  label,
  kpi,
  inverse,
}: {
  tone: string;
  icon: string;
  label: string;
  kpi: Kpi;
  inverse?: boolean;
}) {
  return (
    <article className={`fig-kpi ${tone}`}>
      <span className="fig-kpi-icon">
        <KpiIcon name={icon} />
      </span>
      <div>
        <p className="fig-kpi-label">{label}</p>
        <p className="fig-kpi-value">{gbp0(kpi.value)}</p>
        <Delta kpi={kpi} inverse={inverse} />
      </div>
    </article>
  );
}

export default function FiguresTop({
  dashboard,
  bookLabel,
}: {
  dashboard: FiguresDashboard;
  bookLabel: string;
}) {
  const { kpis, this_month: month, deployment, mix, next_receipts } = dashboard;
  const basePath = adminBasePath();

  return (
    <>
      <div className="fig-kpis">
        <KpiCard tone="blue" icon="book" label="Total book" kpi={kpis.total_book} />
        <KpiCard tone="green" icon="inflow" label="Monthly inflow" kpi={kpis.monthly_inflow} />
        <KpiCard tone="gold" icon="cash" label="Cash available" kpi={kpis.cash_available} />
        <KpiCard tone="red" icon="arrears" label="Arrears" kpi={kpis.arrears} inverse />
      </div>

      <div className="fig-row fig-row-main">
        <section className="fig-card">
          <header className="fig-card-head">
            <div>
              <h2>Income and lending</h2>
              <p>Monthly collections, new lending and net cash over the last 12 months.</p>
            </div>
          </header>
          <IncomeChart points={dashboard.income} />
        </section>

        <section className="fig-card">
          <header className="fig-card-head">
            <div>
              <h2>This month</h2>
              <p>From the live collection schedule.</p>
            </div>
            <span className="fig-card-note">{dashboard.month_label}</span>
          </header>

          <div className="fig-tiles">
            <div className="fig-tile blue">
              <span className="fig-tile-icon"><KpiIcon name="book" /></span>
              <p className="fig-tile-label">Collected</p>
              <p className="fig-tile-value">{gbp0(month.collected)}</p>
              <p className="fig-tile-sub">
                {month.collected_pct}% of {gbp0(month.due)} due
              </p>
            </div>
            <div className="fig-tile gold">
              <span className="fig-tile-icon"><KpiIcon name="cash" /></span>
              <p className="fig-tile-label">Still due</p>
              <p className="fig-tile-value gold">{gbp0(month.still_due)}</p>
              <p className="fig-tile-sub">
                {Math.round((100 - month.collected_pct) * 10) / 10}% remaining
              </p>
            </div>
            <div className="fig-tile green">
              <span className="fig-tile-icon">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v8M8 12h8" />
                </svg>
              </span>
              <p className="fig-tile-label">New lending</p>
              <p className="fig-tile-value">{gbp0(month.new_lending)}</p>
              <p className="fig-tile-sub">
                {month.new_agreements} new agreement{month.new_agreements === 1 ? "" : "s"}
              </p>
            </div>
            <div className="fig-tile plain">
              <div className="fig-deploy-head">
                <p className="fig-tile-label">Capital deployed</p>
                <span>{gbp0(deployment.total)} total</span>
              </div>
              <div
                className="fig-meter"
                role="img"
                aria-label={`${deployment.pct}% of capital deployed`}
              >
                <span style={{ width: `${Math.min(100, deployment.pct)}%` }} />
              </div>
              <p className="fig-tile-sub">
                <b>{deployment.pct}%</b> in the book ({gbp0(deployment.deployed)}) ·{" "}
                {gbp0(deployment.available)} cash
              </p>
            </div>
          </div>
        </section>
      </div>

      <div className={`fig-row ${mix.slices.length ? "fig-row-three" : "fig-row-two"}`}>
        <section className="fig-card">
          <header className="fig-card-head">
            <div>
              <h2>
                {dashboard.forecast.horizon_months}–{dashboard.forecast.points.length - 1}{" "}
                month forecast
              </h2>
              <p>Projected book value based on current lending and repayment performance.</p>
            </div>
            {dashboard.forecast.growth_pct > 0 && (
              <span className="fig-growth">
                <b>+{dashboard.forecast.growth_pct}%</b>
                <em>projected growth in {dashboard.forecast.horizon_months} months</em>
              </span>
            )}
          </header>
          <ForecastChart forecast={dashboard.forecast} />
        </section>

        {mix.slices.length > 0 && (
          <section className="fig-card">
            <header className="fig-card-head">
              <div>
                <h2>Portfolio mix</h2>
                <p>Total lent by agreement type.</p>
              </div>
            </header>
            <MixDonut slices={mix.slices} total={mix.total} />
          </section>
        )}

        <section className="fig-card">
          <header className="fig-card-head">
            <div>
              <h2>Next expected receipts</h2>
              <p>Upcoming customer receipts (next {next_receipts.length || 5}).</p>
            </div>
          </header>
          {next_receipts.length === 0 ? (
            <p className="fig-empty">
              Nothing scheduled ahead of today on the {bookLabel} book.
            </p>
          ) : (
            <table className="fig-receipts">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Customer</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {next_receipts.map((r) => (
                  <tr key={`${r.agreement_number}-${r.due_date}`}>
                    <td>
                      {new Date(`${r.due_date}T00:00:00Z`).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        timeZone: "UTC",
                      })}
                    </td>
                    <td>
                      {r.customer}
                      <span className="fig-receipt-ref">{r.agreement_number}</span>
                    </td>
                    <td className="num">{gbp0(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <a className="fig-card-link" href={`${basePath}/agreements`}>
            View all agreements <span aria-hidden="true">→</span>
          </a>
        </section>
      </div>
    </>
  );
}
