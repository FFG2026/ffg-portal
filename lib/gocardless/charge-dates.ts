import {
  amountsClose,
  COLLECTED_STATUSES,
  daysBetween,
  FAILED_STATUSES,
  IN_FLIGHT_STATUSES,
  type GoCardlessPayment,
} from "./match-payments";

/** A charge sits this close to a schedule date to be taken for that instalment. */
const CHARGE_WINDOW_DAYS = 20;

type ChargeRow = {
  due_date?: string | null;
  status?: string | null;
  amount?: number | string | null;
  gocardless_payment_id?: string | null;
};

/**
 * Tags each unpaid instalment with the date GoCardless actually charges (or
 * charged) it, so overdue is counted from that and not the schedule date.
 *
 *  - a failed Direct Debit counts from the day it was charged;
 *  - one that is pending, submitted, or already collected but not yet ticked
 *    is on its way, so it is marked `collecting` and is not overdue;
 *  - an instalment with no Direct Debit at all counts from its schedule date.
 *
 * A charge is only ever used for one instalment, and never one that already
 * ticked off a paid row.
 */
export function withChargeDates<T extends ChargeRow>(
  rows: T[] | null | undefined,
  gcPayments: GoCardlessPayment[] | null | undefined
): (T & { effective_due?: string | null; collecting?: boolean })[] {
  const list = rows || [];
  const charges = gcPayments || [];
  if (!charges.length) return list as any;

  const byId = new Map(charges.map((p) => [p.id, p]));
  const used = new Set<string>();
  for (const row of list) {
    if (String(row.status) === "paid" && row.gocardless_payment_id) {
      used.add(row.gocardless_payment_id);
    }
  }

  const unpaid = list
    .filter((row) => String(row.status) !== "paid" && row.due_date)
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));
  const chargeFor = new Map<T, GoCardlessPayment>();
  for (const row of unpaid) {
    let found: GoCardlessPayment | undefined;
    const linked = row.gocardless_payment_id
      ? byId.get(row.gocardless_payment_id)
      : undefined;
    if (linked && !used.has(linked.id)) {
      found = linked;
    } else {
      let bestGap = Infinity;
      for (const p of charges) {
        if (used.has(p.id) || !p.charge_date) continue;
        if (!amountsClose(row.amount || 0, p.amount)) continue;
        const gap = Math.abs(
          daysBetween(String(row.due_date).slice(0, 10), p.charge_date)
        );
        if (gap <= CHARGE_WINDOW_DAYS && gap < bestGap) {
          bestGap = gap;
          found = p;
        }
      }
    }
    if (found) {
      used.add(found.id);
      chargeFor.set(row, found);
    }
  }

  return list.map((row) => {
    const charge = chargeFor.get(row);
    if (!charge) return row as any;
    if (
      COLLECTED_STATUSES.has(charge.status) ||
      IN_FLIGHT_STATUSES.has(charge.status)
    ) {
      return { ...row, collecting: true };
    }
    if (FAILED_STATUSES.has(charge.status) && charge.charge_date) {
      return { ...row, effective_due: String(charge.charge_date).slice(0, 10) };
    }
    return row as any;
  });
}
