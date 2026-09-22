import { roundMoney, isPaidRow, isLiveDeal, chaseOverdueSum } from "./deal-status";
import type { MonthlyFiguresRow } from "./monthly-figures";

/** Series colours are validated for colour-vision deficiency — see README. */
export const SERIES_COLLECTIONS = "#0E8CF5";
export const SERIES_NEW_LENDING = "#B0841E";
export const SERIES_NET_CASH = "#1F9254";
/** The donut's three slices all touch, so "Other" avoids the gold/green pair. */
export const MIX_COLOURS = ["#0E8CF5", "#B0841E", "#6B4FA8"];

export type DashboardPaymentRow = {
  amount?: number | string | null;
  status?: string | null;
  due_date?: string | null;
  paid_date?: string | null;
};

export type DashboardDeal = {
  agreement_number: string;
  company_name?: string | null;
  status?: string | null;
  term_months?: number | null;
  start_date?: string | null;
  total_lend?: number | string | null;
  payments?: DashboardPaymentRow[];
};

export type Kpi = {
  value: number;
  /** Null when there is no honest basis for a comparison — the UI hides it. */
  delta_pct: number | null;
};

export type IncomePoint = {
  key: string;
  label: string;
  collections: number;
  new_lending: number;
  net_cash: number;
};

export type MixSlice = {
  key: string;
  label: string;
  value: number;
  pct: number;
  colour: string;
};

export type ReceiptRow = {
  due_date: string;
  customer: string;
  agreement_number: string;
  amount: number;
};

export type ForecastPoint = { month: number; label: string; value: number };

export type FiguresDashboard = {
  month_key: string;
  month_label: string;
  months: { key: string; label: string; mtd: boolean }[];
  kpis: {
    total_book: Kpi;
    monthly_inflow: Kpi;
    cash_available: Kpi;
    arrears: Kpi;
  };
  income: IncomePoint[];
  this_month: {
    collected: number;
    due: number;
    still_due: number;
    collected_pct: number;
    new_lending: number;
    new_agreements: number;
  };
  deployment: { deployed: number; available: number; total: number; pct: number };
  forecast: {
    points: ForecastPoint[];
    growth_pct: number;
    horizon_months: number;
    assumed_yield: number;
    monthly_collections: number;
  };
  mix: { slices: MixSlice[]; total: number };
  next_receipts: ReceiptRow[];
};

/** Fixed so labels do not shift with the runtime's ICU data. */
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function pctChange(now: number, before: number): number | null {
  if (!Number.isFinite(before) || before === 0) return null;
  return Math.round(((now - before) / Math.abs(before)) * 1000) / 10;
}

function monthOf(iso: string | null | undefined) {
  return String(iso || "").slice(0, 7);
}

/** Instalments falling in one calendar month, split by whether they landed. */
export function monthCollection(deals: DashboardDeal[], monthKey: string) {
  let collected = 0;
  let due = 0;
  for (const deal of deals) {
    for (const row of deal.payments || []) {
      if (monthOf(row.due_date) !== monthKey) continue;
      const amount = Number(row.amount || 0);
      due += amount;
      if (isPaidRow(row.status)) collected += amount;
    }
  }
  return {
    collected: roundMoney(collected),
    due: roundMoney(due),
    still_due: roundMoney(due - collected),
  };
}

/** Arrears across the book, honouring the chase-list exclusions. */
export function arrearsTotal(deals: DashboardDeal[], today: string) {
  return roundMoney(
    deals.reduce(
      (sum, deal) =>
        sum + chaseOverdueSum(deal.company_name, deal, deal.payments, today),
      0
    )
  );
}

/** The next instalments due on deals that are still collecting. */
export function nextReceipts(
  deals: DashboardDeal[],
  today: string,
  limit = 5
): ReceiptRow[] {
  const rows: ReceiptRow[] = [];
  for (const deal of deals) {
    if (!isLiveDeal(deal, deal.payments)) continue;
    for (const row of deal.payments || []) {
      const due = String(row.due_date || "").slice(0, 10);
      if (due.length < 10 || due < today || isPaidRow(row.status)) continue;
      rows.push({
        due_date: due,
        customer: String(deal.company_name || deal.agreement_number),
        agreement_number: deal.agreement_number,
        amount: roundMoney(Number(row.amount || 0)),
      });
    }
  }
  return rows
    .sort(
      (a, b) =>
        a.due_date.localeCompare(b.due_date) ||
        b.amount - a.amount ||
        a.agreement_number.localeCompare(a.agreement_number)
    )
    .slice(0, limit);
}

/**
 * Book value projected forward on run-off plus reinvestment: every pound
 * collected is assumed to be lent again at the current blended yield, so
 * the book grows by (collections x yield) a month. This is a modelling
 * assumption, not a contracted figure — the page states it on the chart.
 */
export function buildForecast(
  openingBook: number,
  monthlyCollections: number,
  blendedYield: number,
  horizonMonths = 48,
  growthAt = 36,
  startKey?: string
): FiguresDashboard["forecast"] {
  const rate = blendedYield / 100;
  const perMonth = roundMoney(monthlyCollections * rate);
  const startYear = startKey ? Number(startKey.slice(0, 4)) : new Date().getUTCFullYear();
  const startMonth = startKey ? Number(startKey.slice(5, 7)) - 1 : new Date().getUTCMonth();

  const points: ForecastPoint[] = [];
  for (let m = 0; m <= horizonMonths; m += 1) {
    const absolute = startMonth + m;
    const year = startYear + Math.floor(absolute / 12);
    points.push({
      month: m,
      label: `${MONTH_NAMES[((absolute % 12) + 12) % 12]} ${String(year).slice(2)}`,
      value: roundMoney(openingBook + perMonth * m),
    });
  }

  const atHorizon = openingBook + perMonth * growthAt;
  return {
    points,
    growth_pct:
      openingBook > 0
        ? Math.round(((atHorizon - openingBook) / openingBook) * 1000) / 10
        : 0,
    horizon_months: growthAt,
    assumed_yield: blendedYield,
    monthly_collections: roundMoney(monthlyCollections),
  };
}

/**
 * A month-by-month book built from live rows, for a book that has no
 * curated history table of its own. Collections are counted on the date
 * money actually landed; new lending on the agreement's start date.
 */
export function deriveMonthlyFigures(
  deals: DashboardDeal[],
  endKey: string,
  months = 13
): MonthlyFiguresRow[] {
  const endYear = Number(endKey.slice(0, 4));
  const endMonth = Number(endKey.slice(5, 7)) - 1;

  const keys: MonthlyFiguresRow[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const absolute = endMonth - i;
    const year = endYear + Math.floor(absolute / 12);
    const m = ((absolute % 12) + 12) % 12;
    keys.push({
      key: `${year}-${String(m + 1).padStart(2, "0")}`,
      label: `${MONTH_NAMES[m]} ${year}`,
      mtd: i === 0,
      payments_received: 0,
      new_deals: 0,
      amount_lent: 0,
    });
  }
  const byKey = new Map(keys.map((row) => [row.key, row]));

  for (const deal of deals) {
    for (const row of deal.payments || []) {
      if (!isPaidRow(row.status)) continue;
      const landed = monthOf(row.paid_date || row.due_date);
      const bucket = byKey.get(landed);
      if (bucket) bucket.payments_received += Number(row.amount || 0);
    }
    const started = byKey.get(monthOf(deal.start_date));
    if (started) {
      started.new_deals += 1;
      started.amount_lent += Number(deal.total_lend || 0);
    }
  }

  for (const row of keys) {
    row.payments_received = roundMoney(row.payments_received);
    row.amount_lent = roundMoney(row.amount_lent);
  }
  return keys;
}

export function buildFiguresDashboard(opts: {
  deals: DashboardDeal[];
  monthly: MonthlyFiguresRow[];
  monthKey: string;
  today: string;
  totalBook: number;
  totalLent: number;
  cashAtBank: number;
  blendedYield: number;
  byType: { type: string; label: string; total_lent: number }[];
}): FiguresDashboard {
  const {
    deals,
    monthly,
    monthKey,
    today,
    totalBook,
    cashAtBank,
    blendedYield,
    byType,
  } = opts;

  const index = Math.max(
    0,
    monthly.findIndex((m) => m.key === monthKey)
  );
  const row = monthly[index] || monthly[monthly.length - 1];
  const prev = index > 0 ? monthly[index - 1] : null;

  // The chart is the twelve months ending on the month being viewed, so
  // picking an earlier month moves the window rather than redrawing the same
  // thirteen bars. January carries its year so the ends are never ambiguous.
  const window = monthly.slice(Math.max(0, index - 11), index + 1);
  const income: IncomePoint[] = window.map((m) => {
    const short = m.label.replace(/ \d{4}$/, "");
    return {
      key: m.key,
      label: short === "Jan" ? `Jan ${m.key.slice(2, 4)}` : short,
      collections: m.payments_received,
      new_lending: m.amount_lent,
      net_cash: roundMoney(m.payments_received - m.amount_lent),
    };
  });

  // The book falls by what is collected and rises by what is lent, so last
  // month's book is recoverable from this month's movements.
  const bookLastMonth = roundMoney(
    totalBook + row.payments_received - row.amount_lent
  );

  const schedule = monthCollection(deals, row.key);
  const arrears = arrearsTotal(deals, today);

  const deployed = roundMoney(totalBook);
  const totalCapital = roundMoney(deployed + cashAtBank);

  const avgCollections =
    window.length > 0
      ? roundMoney(
          window.reduce((sum, m) => sum + m.payments_received, 0) / window.length
        )
      : 0;

  const mixTotal = roundMoney(
    byType.reduce((sum, t) => sum + t.total_lent, 0)
  );
  const slices: MixSlice[] = byType.map((t, i) => ({
    key: t.type,
    // The key sits beside the donut, so drop the "(HP)" tail the tables use.
    label: t.label.replace(/\s*\([^)]*\)\s*$/, ""),
    value: t.total_lent,
    pct: mixTotal > 0 ? Math.round((t.total_lent / mixTotal) * 1000) / 10 : 0,
    colour: MIX_COLOURS[i % MIX_COLOURS.length],
  }));

  return {
    month_key: row.key,
    month_label: row.label,
    months: monthly.map((m) => ({ key: m.key, label: m.label, mtd: m.mtd })),
    kpis: {
      total_book: {
        value: totalBook,
        delta_pct: pctChange(totalBook, bookLastMonth),
      },
      monthly_inflow: {
        value: row.payments_received,
        delta_pct: prev ? pctChange(row.payments_received, prev.payments_received) : null,
      },
      // No stored history for either of these, so no comparison is claimed.
      cash_available: { value: cashAtBank, delta_pct: null },
      arrears: { value: arrears, delta_pct: null },
    },
    income,
    this_month: {
      collected: schedule.collected,
      due: schedule.due,
      still_due: schedule.still_due,
      collected_pct:
        schedule.due > 0
          ? Math.round((schedule.collected / schedule.due) * 1000) / 10
          : 0,
      new_lending: row.amount_lent,
      new_agreements: row.new_deals,
    },
    deployment: {
      deployed,
      available: cashAtBank,
      total: totalCapital,
      pct:
        totalCapital > 0
          ? Math.round((deployed / totalCapital) * 1000) / 10
          : 0,
    },
    forecast: buildForecast(totalBook, avgCollections, blendedYield, 48, 36, row.key),
    mix: { slices, total: mixTotal },
    next_receipts: nextReceipts(deals, today),
  };
}
