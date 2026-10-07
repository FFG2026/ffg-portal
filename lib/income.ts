import { roundMoney } from "./deal-status";

/**
 * What a deal earns, as opposed to what it collects.
 *
 * Two kinds of cash come in that FFG holds for HMRC and never earns:
 *
 *  - Finance-lease rentals are billed VAT-inclusive. The lend is the net price,
 *    so a rental carries a sixth of itself in VAT that must not be counted
 *    against it as margin.
 *  - Deferred VAT on a hire purchase (HP125, HP140) is paid as its own row and
 *    is pure pass-through.
 *
 * Collected and outstanding stay on the cash basis — it is what is in the bank
 * and what is still to come in. Profit and yield use the figures here.
 */
export const VAT_RATE = 0.2;

export type IncomeRow = {
  amount?: number | string | null;
  notes?: string | null;
};

export type IncomeDeal = {
  agreement_number?: string;
  agreement_type?: string | null;
  payments?: IncomeRow[];
};

export function isFinanceLease(deal: IncomeDeal) {
  if (String(deal.agreement_type || "").toUpperCase() === "FL") return true;
  return /^FL\d/i.test(String(deal.agreement_number || ""));
}

/** A row that is VAT collected for HMRC rather than a rental. */
export function isVatPassThrough(row: IncomeRow) {
  return /^\s*deferred\s+vat/i.test(String(row.notes || ""));
}

/** The part of a row's amount that is income: net of VAT, or nothing. */
export function incomeOnRow(deal: IncomeDeal, row: IncomeRow) {
  const amount = Number(row.amount || 0);
  if (isVatPassThrough(row)) return 0;
  return isFinanceLease(deal) ? amount / (1 + VAT_RATE) : amount;
}

/** VAT sitting inside a deal's schedule: collected, but not earned. */
export function vatOnDeal(deal: IncomeDeal) {
  let vat = 0;
  for (const row of deal.payments || []) {
    vat += Number(row.amount || 0) - incomeOnRow(deal, row);
  }
  return roundMoney(vat);
}
