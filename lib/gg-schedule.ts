import { isUnwoundAgreement, openingOwing } from "./deal-status";
import { sortByDueDate, withRemainingBalance } from "./part-settlement";

export type GgPaymentEdit = {
  due_date?: string | null;
  amount?: number | string | null;
  status?: string | null;
  paid_date?: string | null;
  notes?: string | null;
};

function isoDate(value: unknown) {
  const raw = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

function money(value: unknown) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** Build the payments row patch for a Glacier Gem standing-order edit. */
export function ggPaymentPatch(
  current: {
    due_date?: string | null;
    amount?: number | string | null;
    status?: string | null;
    paid_date?: string | null;
    notes?: string | null;
  },
  edit: GgPaymentEdit
) {
  const due_date = isoDate(edit.due_date ?? current.due_date);
  if (!due_date) throw new Error("Pick a due date.");

  const amount =
    edit.amount !== undefined ? money(edit.amount) : money(current.amount);
  if (!(amount != null && amount > 0)) {
    throw new Error("Enter an amount greater than zero.");
  }

  const statusRaw = String(
    edit.status !== undefined ? edit.status : current.status || "due"
  )
    .trim()
    .toLowerCase();
  const status = statusRaw === "paid" ? "paid" : "due";

  let paid_date: string | null = null;
  if (status === "paid") {
    paid_date =
      isoDate(edit.paid_date) ||
      isoDate(current.paid_date) ||
      due_date;
  }

  const notes =
    edit.notes !== undefined
      ? String(edit.notes || "").trim() || null
      : current.notes || null;

  return {
    due_date,
    amount,
    status,
    paid_date,
    notes,
    updated_at: new Date().toISOString(),
  };
}

export function nextGgAgreementStatus(
  agreement: {
    status?: string | null;
    monthly_instalment?: number | string | null;
  },
  rows: { status?: string | null }[]
) {
  if (isUnwoundAgreement(agreement.status)) return "cancelled";
  const stillDue = rows.some(
    (row) => String(row.status || "").trim().toLowerCase() !== "paid"
  );
  const asAndWhen =
    agreement.monthly_instalment != null &&
    Number(agreement.monthly_instalment) <= 0;
  return stillDue || asAndWhen ? "active" : "settled";
}

export async function refreshGgSchedule(
  supabase: {
    from: (table: string) => any;
  },
  agreement: {
    id: string;
    status?: string | null;
    monthly_instalment?: number | string | null;
    total_lend?: number | string | null;
    total_repayable?: number | string | null;
    commission?: number | string | null;
  }
) {
  const { data: rows, error } = await supabase
    .from("payments")
    .select("id, amount, due_date, instalment_number, status")
    .eq("agreement_id", agreement.id);
  if (error) throw new Error(error.message);

  const list = (rows || []) as {
    id: string;
    amount: number | string;
    due_date: string;
    instalment_number: number;
    status: string;
  }[];
  const sorted = sortByDueDate(list);
  const withBal = withRemainingBalance(sorted, openingOwing(agreement));
  for (const row of withBal) {
    const { error: balErr } = await supabase
      .from("payments")
      .update({ balance_after: row.balance_after })
      .eq("id", row.id);
    if (balErr) throw new Error(balErr.message);
  }

  const status = nextGgAgreementStatus(agreement, sorted);
  if (status !== String(agreement.status || "").trim().toLowerCase()) {
    const { error: agrErr } = await supabase
      .from("agreements")
      .update({ status })
      .eq("id", agreement.id);
    if (agrErr) throw new Error(agrErr.message);
  }
}
