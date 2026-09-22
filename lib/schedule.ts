import {
  daysBetween,
  looksLikeMonthlyVariation,
  looksLikeVatExclusive,
} from "./gocardless/match-payments";

/** Internal leftover label — a normal DD tick, not a different kind of paid. */
export function visibleScheduleNote(notes?: string | null) {
  const text = String(notes || "").trim();
  if (!text || /^gocardless collection$/i.test(text)) return null;
  return text;
}

export function addMonths(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  const cursor = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)
  ).getUTCDate();
  cursor.setUTCDate(Math.min(day, lastDay));
  return cursor.toISOString().slice(0, 10);
}

/** Commencement is the Drive folder created date; first instalment is one month later. */
export function startDateFromDriveFolder(
  createdTime?: string | null,
  modifiedTime?: string | null
) {
  const raw = String(createdTime || modifiedTime || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

export function instalmentDueFromStart(startDate: string, instalmentNumber: number) {
  return addMonths(String(startDate).slice(0, 10), instalmentNumber);
}

/** Commencement is always one calendar month before the first instalment. */
export function startDateFromFirstPayment(
  rows: { due_date?: string | null }[] | null | undefined,
  fallback?: string | null
) {
  const first = (rows || [])
    .map((r) => String(r.due_date || "").slice(0, 10))
    .filter((d) => d.length >= 10)
    .sort()[0];
  if (!first) return fallback ? String(fallback).slice(0, 10) : null;
  return addMonths(first, -1);
}

export function buildPaymentSchedule(opts: {
  termMonths: number;
  monthlyInstalment: number;
  startDate: string;
}) {
  const rows = [];
  const remainingStart = opts.monthlyInstalment * opts.termMonths;
  for (let i = 1; i <= opts.termMonths; i++) {
    const dueDate = addMonths(opts.startDate, i);
    const balanceAfter = Math.round((remainingStart - opts.monthlyInstalment * i) * 100) / 100;
    rows.push({
      instalment_number: i,
      due_date: dueDate,
      amount: opts.monthlyInstalment,
      status: "due" as "due" | "paid" | "failed",
      paid_date: null as string | null,
      balance_after: Math.max(0, balanceAfter),
      gocardless_payment_id: null as string | null,
      notes: null as string | null,
      source: null as string | null,
    });
  }
  return rows;
}

function amountsMatch(a: number, b: number) {
  return Math.abs(a - b) < 0.02;
}

/** Paid rows that match the new monthly, after netting off recorded refunds. */
export function rewritePaymentSchedule(
  existing: Array<{
    amount?: number | string | null;
    status?: string | null;
    paid_date?: string | null;
    gocardless_payment_id?: string | null;
    notes?: string | null;
    source?: string | null;
  }>,
  opts: {
    termMonths: number;
    monthlyInstalment: number;
    startDate: string;
  }
) {
  const schedule = buildPaymentSchedule(opts);
  const matching = (existing || []).filter(
    (row) =>
      row.status === "paid" &&
      amountsMatch(Number(row.amount), opts.monthlyInstalment)
  );
  const refunds = matching.filter((row) =>
    /refund/i.test(String(row.notes || ""))
  );
  const credits = matching
    .filter((row) => !/refund/i.test(String(row.notes || "")))
    .sort((a, b) =>
      String(a.paid_date || "").localeCompare(String(b.paid_date || ""))
    );
  const keep = Math.max(0, credits.length - refunds.length);
  for (let i = 0; i < keep && i < schedule.length; i++) {
    const src = credits[i];
    schedule[i].status = "paid";
    schedule[i].paid_date = src.paid_date
      ? String(src.paid_date).slice(0, 10)
      : schedule[i].due_date;
    schedule[i].gocardless_payment_id = src.gocardless_payment_id || null;
    schedule[i].notes = src.notes || null;
    schedule[i].source = src.source || null;
  }
  return schedule;
}

export type ScheduleCollection = {
  chargeDate: string;
  amount: number | string;
  gocardless_payment_id?: string | null;
  notes?: string | null;
  source?: string | null;
  status?: "paid" | "failed";
};

function collectionKey(row: ScheduleCollection) {
  const gc = row.gocardless_payment_id || "";
  if (gc) return `gc:${gc}`;
  return `dt:${String(row.chargeDate).slice(0, 10)}:${Math.round(Number(row.amount) * 100)}`;
}

/**
 * Finance leases collect VAT-inclusive rent on GoCardless. Rebuild the
 * contracted term from start_date at the monthly (gross) figure, then attach
 * collections to the nearest due date so leftover VAT rows cannot steal months.
 */
export function rebuildFinanceLeaseSchedule(
  opts: {
    termMonths: number;
    monthlyInstalment: number;
    startDate: string;
  },
  collections: ScheduleCollection[],
  windowDays = 40
) {
  const schedule = buildPaymentSchedule(opts);
  const used = new Set<number>();
  const seen = new Set<string>();
  const attached = new Set<string>();
  const ordered = [...(collections || [])]
    .filter((row) => {
      const key = collectionKey(row);
      if (seen.has(key)) return false;
      seen.add(key);
      return looksLikeMonthlyVariation(row.amount, opts.monthlyInstalment);
    })
    .sort((a, b) =>
      String(a.chargeDate).slice(0, 10).localeCompare(String(b.chargeDate).slice(0, 10))
    );

  const attach = (row: ScheduleCollection, maxDays: number) => {
    const key = collectionKey(row);
    if (attached.has(key)) return false;
    const charge = String(row.chargeDate).slice(0, 10);
    let best = -1;
    let bestDiff = Infinity;
    for (let i = 0; i < schedule.length; i++) {
      if (used.has(i)) continue;
      const diff = Math.abs(daysBetween(schedule[i].due_date, charge));
      if (diff > maxDays) continue;
      if (diff < bestDiff) {
        bestDiff = diff;
        best = i;
      }
    }
    if (best < 0) return false;
    used.add(best);
    attached.add(key);
    const status = row.status === "failed" ? "failed" : "paid";
    schedule[best].status = status;
    schedule[best].paid_date = status === "paid" ? charge : null;
    schedule[best].gocardless_payment_id = row.gocardless_payment_id || null;
    schedule[best].notes = visibleScheduleNote(row.notes);
    schedule[best].source = row.source || null;
    const collected = Math.round(Number(row.amount) * 100) / 100;
    if (collected > 0) schedule[best].amount = collected;
    return true;
  };

  for (const row of ordered) attach(row, windowDays);
  for (const row of ordered) attach(row, 400);

  return schedule;
}

export function financeLeaseScheduleNeedsRepair(
  rows: Array<{
    instalment_number?: number | null;
    due_date?: string | null;
    amount?: number | string | null;
    status?: string | null;
  }>,
  opts: { termMonths: number; monthlyInstalment: number; startDate: string }
) {
  const term = Number(opts.termMonths || 0);
  const monthly = Number(opts.monthlyInstalment || 0);
  const start = String(opts.startDate || "").slice(0, 10);
  if (term <= 0 || monthly <= 0 || start.length < 10) return false;
  if ((rows || []).some((row) => Number(row.instalment_number || 0) > term)) {
    return true;
  }
  if (
    (rows || []).some(
      (row) =>
        String(row.status) !== "paid" &&
        looksLikeVatExclusive(row.amount || 0, monthly)
    )
  ) {
    return true;
  }
  const byNumber = new Map(
    (rows || []).map((row) => [Number(row.instalment_number || 0), row])
  );
  for (let n = 1; n <= term; n++) {
    const row = byNumber.get(n);
    if (!row) return true;
    if (String(row.due_date || "").slice(0, 10) !== addMonths(start, n)) {
      return true;
    }
  }
  return false;
}
