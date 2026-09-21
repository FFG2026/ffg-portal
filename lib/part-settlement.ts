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
 * A lump on a past date clears everything still due on or after that day
 * (nothing later should show as due). A lump dated today shaves from the
 * back of the book so near-term Direct Debits stay.
 */
export function planPartSettlement(
  unpaid: UnpaidInstalment[],
  amount: number,
  paidDate?: string,
  today: string = todayIsoDate()
): PartSettlementPlan {
  const pay = round2(amount);
  if (!(pay > 0)) {
    throw new Error("Enter an amount greater than zero.");
  }

  const dated = unpaid.some((row) => row.due_date);
  const fromPaidDate =
    paidDate && dated
      ? unpaid.filter((row) => String(row.due_date) >= paidDate)
      : unpaid;
  const pool = fromPaidDate.length > 0 ? fromPaidDate : unpaid;

  const owing = round2(pool.reduce((sum, row) => sum + Number(row.amount), 0));
  if (pool.length === 0) {
    throw new Error("There are no instalments left to apply this to.");
  }

  if (paidDate && paidDate < today) {
    return {
      removeIds: pool.map((row) => row.id),
      reduce: null,
      leftover: 0,
    };
  }

  if (pay - owing > 0.009) {
    throw new Error(
      `That is more than the £${owing.toLocaleString("en-GB", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} still owing.`
    );
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
