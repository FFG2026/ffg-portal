export type MonthlyFiguresRow = {
  key: string;
  label: string;
  mtd: boolean;
  payments_received: number;
  new_deals: number;
  amount_lent: number;
};

/**
 * Owen's last-12-months book. Live figures steps through these one month at
 * a time.
 *
 * Collections are counted the way GoCardless pays them out, not the day they
 * were charged, so a collection taken on 29 September that pays out on
 * 1 October belongs to October. The dashboard's Book health chart counts by
 * charge date instead, because that is what has to line up with instalments
 * falling due — so the two will differ by a few hundred pounds in any month,
 * and agree over any longer run.
 */
export const MONTHLY_FIGURES: MonthlyFiguresRow[] = [
  { key: "2025-09", label: "Sep 2025", mtd: false, payments_received: 88231.72, new_deals: 2, amount_lent: 98000 },
  { key: "2025-10", label: "Oct 2025", mtd: false, payments_received: 98240.19, new_deals: 0, amount_lent: 0 },
  { key: "2025-11", label: "Nov 2025", mtd: false, payments_received: 85512.7, new_deals: 4, amount_lent: 244460.22 },
  { key: "2025-12", label: "Dec 2025", mtd: false, payments_received: 102024.4, new_deals: 7, amount_lent: 164682.84 },
  { key: "2026-01", label: "Jan 2026", mtd: false, payments_received: 96602.69, new_deals: 2, amount_lent: 89047.37 },
  { key: "2026-02", label: "Feb 2026", mtd: false, payments_received: 84031.94, new_deals: 3, amount_lent: 86939 },
  { key: "2026-03", label: "Mar 2026", mtd: false, payments_received: 102146.34, new_deals: 5, amount_lent: 196585.93 },
  { key: "2026-04", label: "Apr 2026", mtd: false, payments_received: 97736.4, new_deals: 1, amount_lent: 76871.91 },
  { key: "2026-05", label: "May 2026", mtd: false, payments_received: 92005.01, new_deals: 2, amount_lent: 16597.33 },
  { key: "2026-06", label: "Jun 2026", mtd: false, payments_received: 87298.27, new_deals: 1, amount_lent: 44760 },
  { key: "2026-07", label: "Jul 2026", mtd: false, payments_received: 96542.96, new_deals: 3, amount_lent: 160820 },
  { key: "2026-08", label: "Aug 2026", mtd: false, payments_received: 80119.32, new_deals: 1, amount_lent: 8000 },
  { key: "2026-09", label: "Sep 2026", mtd: false, payments_received: 79210.75, new_deals: 2, amount_lent: 79369.12 },
  { key: "2026-10", label: "Oct 2026", mtd: true, payments_received: 2990.68, new_deals: 0, amount_lent: 0 },
];

export const LATEST_MONTH_KEY =
  MONTHLY_FIGURES[MONTHLY_FIGURES.length - 1].key;

export function monthLabel(row: MonthlyFiguresRow) {
  return row.mtd ? `${row.label}*` : row.label;
}

export function monthlyFiguresAt(key: string): MonthlyFiguresRow {
  return (
    MONTHLY_FIGURES.find((row) => row.key === key) ||
    MONTHLY_FIGURES[MONTHLY_FIGURES.length - 1]
  );
}

export function monthlyFiguresIndex(key: string) {
  const i = MONTHLY_FIGURES.findIndex((row) => row.key === key);
  return i < 0 ? MONTHLY_FIGURES.length - 1 : i;
}

export function neighbouringMonth(key: string, delta: number) {
  const i = monthlyFiguresIndex(key) + delta;
  if (i < 0 || i >= MONTHLY_FIGURES.length) return null;
  return MONTHLY_FIGURES[i];
}

/**
 * The month in progress, taken from the live book rather than the table.
 *
 * MONTHLY_FIGURES is a curated record: each closed month is reconciled against
 * the bank and then does not move. The row for the month still running is
 * marked `mtd` and was only ever a snapshot of the day it was written, so it
 * goes stale the moment the next collection lands — which is how the Live
 * figures page came to show a different total from the dashboard for the same
 * month. The closed months stay exactly as curated; only the open one is
 * replaced, and with the figure the dashboard itself computes, so the two
 * pages agree by construction rather than by being updated in step.
 */
export function withLiveMonthToDate(
  rows: MonthlyFiguresRow[],
  collectedSoFar: number | null | undefined
): MonthlyFiguresRow[] {
  if (collectedSoFar == null || !Number.isFinite(collectedSoFar)) return rows;
  return rows.map((row) =>
    row.mtd ? { ...row, payments_received: Math.round(collectedSoFar * 100) / 100 } : row
  );
}
