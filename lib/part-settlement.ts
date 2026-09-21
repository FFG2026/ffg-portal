export type UnpaidInstalment = {
  id: string;
  instalment_number: number;
  amount: number;
};

export type PartSettlementPlan = {
  removeIds: string[];
  reduce: { id: string; amount: number } | null;
  leftover: number;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Apply a lump sum from the back of the schedule so near-term DDs stay. */
export function planPartSettlement(
  unpaid: UnpaidInstalment[],
  amount: number
): PartSettlementPlan {
  const pay = round2(amount);
  if (!(pay > 0)) {
    throw new Error("Enter an amount greater than zero.");
  }

  const sorted = [...unpaid].sort(
    (a, b) => b.instalment_number - a.instalment_number
  );
  const owing = round2(sorted.reduce((sum, row) => sum + Number(row.amount), 0));
  if (pay - owing > 0.009) {
    throw new Error(
      `That is more than the £${owing.toLocaleString("en-GB", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} still owing.`
    );
  }

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
