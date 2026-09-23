export type UnpaidInstalment = {
  id: string;
  instalment_number: number;
  amount: number;
  due_date?: string;
};

export type PartSettlementPlan = {
  removeIds: string[];
  reduce: { id: string; amount: number } | null;
  leftover: number;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function allocateFromEnd(pool: UnpaidInstalment[], pay: number): PartSettlementPlan {
  const sorted = [...pool].sort((a, b) => {
    const byDate = String(b.due_date || "").localeCompare(String(a.due_date || ""));
    if (byDate) return byDate;
    return b.instalment_number - a.instalment_number;
  });
  let remaining = pay;
  const removeIds: string[] = [];
  let reduce: { id: string; amount: number } | null = null;

  for (const row of sorted) {
    if (remaining <= 0.009) break;
    const rowAmt = round2(Number(row.amount));
    if (remaining + 0.009 >= rowAmt) {
      removeIds.push(row.id);
      remaining = round2(remaining - rowAmt);
    } else {
      reduce = { id: row.id, amount: round2(rowAmt - remaining) };
      remaining = 0;
      break;
    }
  }

  return { removeIds, reduce, leftover: remaining };
}

/**
 * A lump that covers everything still due on or after that day (insurance
 * settlement, stolen van) clears those rows. A smaller past-dated amount
 * only shaves the back of the book so the HP does not look finished.
 * A lump dated today always shaves from the back so near-term Direct Debits stay.
 */
export function planPartSettlement(
  unpaid: UnpaidInstalment[],
  amount: number,
  paidDate?: string,
  _today: string = todayIsoDate()
): PartSettlementPlan {
  const pay = round2(amount);
  if (!(pay > 0)) {
    throw new Error("Enter an amount greater than zero.");
  }
  if (unpaid.length === 0) {
    throw new Error("There are no instalments left to apply this to.");
  }

  const allOwing = round2(
    unpaid.reduce((sum, row) => sum + Number(row.amount), 0)
  );

  // A lump that covers the whole remaining book (including an earlier
  // failed Direct Debit) settles the HP, even when dated mid-term.
  if (pay + 0.009 >= allOwing) {
    return {
      removeIds: unpaid.map((row) => row.id),
      reduce: null,
      leftover: 0,
    };
  }

  const dated = unpaid.some((row) => row.due_date);
  const fromPaidDate =
    paidDate && dated
      ? unpaid.filter((row) => String(row.due_date) >= paidDate)
      : unpaid;
  const pool = fromPaidDate.length > 0 ? fromPaidDate : unpaid;
  const owing = round2(pool.reduce((sum, row) => sum + Number(row.amount), 0));

  // Enough to clear everything still due from that day — also spend any
  // leftover on earlier unpaid rows (a bounced collection sitting behind).
  if (paidDate && pay + 0.009 >= owing) {
    const extra = round2(pay - owing);
    const earlier = unpaid.filter(
      (row) => !pool.some((p) => p.id === row.id)
    );
    const rest =
      extra > 0.009
        ? allocateFromEnd(earlier, extra)
        : { removeIds: [] as string[], reduce: null, leftover: 0 };
    return {
      removeIds: [...pool.map((row) => row.id), ...rest.removeIds],
      reduce: rest.reduce,
      leftover: rest.leftover,
    };
  }

  return allocateFromEnd(pool, pay);
}

export function nextInstalmentNumber(
  rows: { instalment_number: number; due_date: string }[],
  paidDate: string
) {
  const used = new Set(rows.map((r) => r.instalment_number));
  const onOrBefore = rows.filter((r) => r.due_date <= paidDate);
  let n =
    (onOrBefore.length
      ? Math.max(...onOrBefore.map((r) => r.instalment_number))
      : 0) + 1;
  while (used.has(n)) n += 1;
  return n;
}

export function sortByDueDate<T extends { due_date: string; instalment_number: number }>(
  rows: T[]
) {
  return [...rows].sort(
    (a, b) =>
      a.due_date.localeCompare(b.due_date) ||
      a.instalment_number - b.instalment_number
  );
}

function allocateFromFront(pool: UnpaidInstalment[], pay: number): PartSettlementPlan {
  const sorted = [...pool].sort((a, b) => {
    const byDate = String(a.due_date || "").localeCompare(String(b.due_date || ""));
    if (byDate) return byDate;
    return a.instalment_number - b.instalment_number;
  });
  let remaining = pay;
  const removeIds: string[] = [];
  let reduce: { id: string; amount: number } | null = null;

  for (const row of sorted) {
    if (remaining <= 0.009) break;
    const rowAmt = round2(Number(row.amount));
    if (remaining + 0.009 >= rowAmt) {
      removeIds.push(row.id);
      remaining = round2(remaining - rowAmt);
    } else {
      reduce = { id: row.id, amount: round2(rowAmt - remaining) };
      remaining = 0;
      break;
    }
  }

  return { removeIds, reduce, leftover: remaining };
}

/**
 * Bank / standing-order receipt: keep the payment on the date it arrived
 * and take it off the oldest unpaid rent so a £500 receipt does not rewrite
 * a £1,000 Direct Debit down to £500.
 */
export function planManualReceipt(
  unpaid: UnpaidInstalment[],
  amount: number
): PartSettlementPlan {
  const pay = round2(amount);
  if (!(pay > 0)) {
    throw new Error("Enter an amount greater than zero.");
  }
  if (unpaid.length === 0) {
    throw new Error("There are no instalments left to apply this to.");
  }
  const allOwing = round2(
    unpaid.reduce((sum, row) => sum + Number(row.amount), 0)
  );
  if (pay + 0.009 >= allOwing) {
    return {
      removeIds: unpaid.map((row) => row.id),
      reduce: null,
      leftover: round2(Math.max(0, pay - allOwing)),
    };
  }
  return allocateFromFront(unpaid, pay);
}

/**
 * Spreadsheet-style running remaining: start from the original book
 * (every instalment, paid or not) and count down each line. A deal paid
 * from start to finish ends at £0 — it must not keep showing the original
 * £93,911 as "balance after" on paid rows.
 */
export function withRemainingBalance<
  T extends { amount: number | string; status: string },
>(rows: T[]) {
  let left = round2(
    rows.reduce((sum, r) => sum + Number(r.amount || 0), 0)
  );
  return rows.map((row) => {
    left = round2(left - Number(row.amount || 0));
    return { ...row, balance_after: Math.max(0, left) };
  });
}
