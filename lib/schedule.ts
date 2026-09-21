export function addMonths(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  const cursor = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)
  ).getUTCDate();
  cursor.setUTCDate(Math.min(day, lastDay));
  return cursor.toISOString().slice(0, 10);
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
      status: "due" as const,
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
