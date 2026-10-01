import { roundMoney, isUnwoundAgreement, isSettledAgreement } from "./deal-status";

export type ScheduleRow = {
  due_date?: string | null;
  amount?: number | string | null;
  agreement_status?: string | null;
};

export type WritingShape = {
  /** Contracted back for every £1 lent — 1.2156 on the last twelve months. */
  uplift: number;
  /** Lend-weighted term in months. */
  termMonths: number;
};

export type TurnoverPoint = {
  month: string;
  /** Instalments already contracted on today's book. */
  existing: number;
  /** Instalments from agreements the model writes. */
  written: number;
  turnover: number;
  lent: number;
};

/** First day of the month, N months on. */
export function addMonthKey(key: string, months: number) {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7)) - 1 + months;
  const date = new Date(Date.UTC(year, month, 1));
  return date.toISOString().slice(0, 7);
}

/**
 * What today's book is contracted to pay in, month by month. This is the
 * schedule as it stands — no assumption in it — and it is the half of the
 * forecast that falls away as agreements reach their final instalment.
 */
export function runOffByMonth(
  rows: ScheduleRow[] | null | undefined,
  fromMonth: string,
  months: number
) {
  const totals = new Map<string, number>();
  for (let i = 0; i < months; i += 1) totals.set(addMonthKey(fromMonth, i), 0);
  for (const row of rows || []) {
    if (isUnwoundAgreement(row.agreement_status)) continue;
    const key = String(row.due_date || "").slice(0, 7);
    if (!totals.has(key)) continue;
    totals.set(key, totals.get(key)! + Number(row.amount || 0));
  }
  return Array.from(totals.entries()).map(([month, amount]) => ({
    month,
    amount: roundMoney(amount),
  }));
}

/**
 * The uplift and term the book is actually being written at, so the forecast
 * calibrates itself rather than carrying a rate someone typed in once.
 */
export function writingShape(
  agreements: {
    total_lend?: number | string | null;
    monthly_instalment?: number | string | null;
    term_months?: number | null;
    status?: string | null;
  }[] | null | undefined
): WritingShape | null {
  let lent = 0;
  let contracted = 0;
  let lendMonths = 0;
  for (const a of agreements || []) {
    if (isUnwoundAgreement(a.status)) continue;
    const lend = Number(a.total_lend || 0);
    const monthly = Number(a.monthly_instalment || 0);
    const term = Number(a.term_months || 0);
    if (!(lend > 0) || !(monthly > 0) || !(term > 0)) continue;
    lent += lend;
    contracted += monthly * term;
    lendMonths += lend * term;
  }
  if (!(lent > 0) || !(contracted > 0)) return null;
  return {
    uplift: Math.round((contracted / lent) * 10000) / 10000,
    termMonths: Math.max(1, Math.round(lendMonths / lent)),
  };
}

/**
 * Turnover with a share of each month's collections written away again.
 *
 * A deal written in a month starts collecting the month after — the book's
 * convention, where commencement is one calendar month before the first
 * instalment — and its own instalments then feed later months, so the model
 * compounds. Relending nothing just returns the run-off.
 */
export function modelTurnover(
  runOff: { month: string; amount: number }[],
  opts: { uplift: number; termMonths: number; relendPct?: number }
): TurnoverPoint[] {
  const term = Math.max(1, Math.round(opts.termMonths));
  const share = Math.min(100, Math.max(0, opts.relendPct ?? 100)) / 100;
  const n = runOff.length;
  const written = new Array(n + term + 1).fill(0);
  const points: TurnoverPoint[] = [];
  for (let i = 0; i < n; i += 1) {
    const existing = runOff[i].amount;
    const turnover = existing + written[i];
    const lent = turnover * share;
    const monthly = (lent * opts.uplift) / term;
    for (let k = i + 1; k < Math.min(i + 1 + term, written.length); k += 1) {
      written[k] += monthly;
    }
    points.push({
      month: runOff[i].month,
      existing: roundMoney(existing),
      written: roundMoney(written[i]),
      turnover: roundMoney(turnover),
      lent: roundMoney(lent),
    });
  }
  return points;
}

/** Live agreements still paying into each month, for the run-off caption. */
export function agreementsLiveInMonth(
  rows: (ScheduleRow & { agreement_id?: string })[] | null | undefined,
  month: string
) {
  const ids = new Set<string>();
  for (const row of rows || []) {
    if (isUnwoundAgreement(row.agreement_status)) continue;
    if (String(row.due_date || "").slice(0, 7) !== month) continue;
    if (row.agreement_id) ids.add(row.agreement_id);
  }
  return ids.size;
}

export { isSettledAgreement };
