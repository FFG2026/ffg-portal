import assert from "node:assert/strict";
import { buildPayoutItems, evaluatePayout, figuresHash, MANUAL_ITEMS, type PayoutFacts, type PayoutState } from "./payout-gate";

// Reynolds Interiors, HP147 – the figures on the signed paperwork.
const proposal: Record<string, any> = {
  company_name: "REYNOLDS INTERIORS LTD",
  company_number: "14776840",
  customer_email: "aaronellard@gmail.com",
  cash_price: 7794,
  vat: 1418,
  deposit: 1948.5,
  agreed_deposit: 1948.5,
  commission: 292.28,
  agreed_commission: 292.28,
  agreed_financed: 6137.78,
  agreed_monthly: 209.77,
  agreed_term_months: 36,
  agreed_total_repayable: 7551.72,
  extras: { reserved_agreement_number: "HP147" },
};

const signed = { audit_status: "Signed", audit_completed: "2026-11-10", signers: [
  { name: "Aaron Ellard", email: null, signed_at: "2026-11-09" },
  { name: "Owen Brunning", email: null, signed_at: "2026-11-10" },
] };

const facts = (): PayoutFacts => ({
  agreement: {
    file: "Fixed Rate Hire Purchase Agreement - signed.pdf", agreement_number: null, hirer_name: "Reynolds Interiors Ltd", company_number: "14776840",
    email: "aaron@reynoldsblinds.net", goods_description: "Vauxhall Vivaro 1.5 Diesel", reg: "KM70 LEJ", chassis: "VXEVBYHVKL7043324",
    cash_price_ex_vat: 6495, vat: 1299, total_cost: 7794, deposit: 1948.5, balance_financed: 5845.5, documentation_fee: 195,
    supplier_name: "Trade Vehicle Sales Ltd", term_months: 36, monthly: 209.77, first_payment_date: null, insurer: null, option_fee: null, ...signed,
  },
  guarantee: { file: "DPG Document AARON - signed.pdf", guarantor_name: "Aaron Lee Ellard", principal_name: "Reynolds Interiors Ltd", principal_company_number: "14776840", ...signed },
  invoice: {
    file: "invoice_136.pdf", invoice_number: "136", invoice_date: "2026-10-28", supplier_name: "Trade Vehicle Sales Ltd", billed_to: "future fg ltd", deliver_to: null,
    reg: "KM70 LEJ", chassis: "VXEVBYHVKL7043324", net: 6495, vat: 1299, gross: 7794, amount_paid: 0, balance_due: 7794,
    payee_name: "Trade Vehicle Sales Ltd", sort_code: "20-57-44", account_number: "03702103",
  },
  commission: { file: "Invoice_3382_from_Direct_Commercial_Finance_Ltd.pdf", invoice_number: "3382", invoice_date: "2026-11-10", bill_to: "Future F G Ltd", description: "Commissions:Hp Finance HP147 - Reynolds Interiors Ltd", amount: 292.28, vat: 0, total: 292.28, payee_sort_code: null, payee_account_number: null },
  unread: [],
  files: [],
});

const level = (items: ReturnType<typeof buildPayoutItems>, id: string) => items.find((i) => i.id === id)?.level;

{
  const items = buildPayoutItems(proposal, facts());
  assert.equal(level(items, "a-signed"), "ok");
  assert.equal(level(items, "g-signed"), "ok");
  assert.equal(level(items, "a-price"), "ok");
  assert.equal(level(items, "a-deposit"), "ok");
  assert.equal(level(items, "a-financed"), "ok");
  assert.equal(level(items, "a-payments"), "ok");
  assert.equal(level(items, "i-price"), "ok");
  assert.equal(level(items, "i-asset"), "ok");
  assert.equal(level(items, "i-supplier"), "ok");
  assert.equal(level(items, "c-amount"), "ok");
  assert.equal(level(items, "c-ref"), undefined);
  // The things that differ on this deal are surfaced, not hidden.
  assert.equal(level(items, "a-vat"), "review");
  assert.equal(level(items, "a-email"), "review");
  assert.equal(level(items, "a-number"), "review");
  assert.match(items.find((i) => i.id === "i-topay")!.detail, /Pay £5,845\.50/);
  assert.match(items.find((i) => i.id === "i-topay")!.detail, /deposit has not been taken off/);
}

{
  // A changed monthly on the agreement is an issue.
  const f = facts();
  f.agreement!.monthly = 203.86;
  assert.equal(level(buildPayoutItems(proposal, f), "a-payments"), "issue");
  // A different amount financed is an issue.
  const g = facts();
  g.agreement!.balance_financed = 6137.78;
  assert.equal(level(buildPayoutItems(proposal, g), "a-financed"), "issue");
  // Unsigned, and wrong commission.
  const h = facts();
  h.agreement!.audit_status = "Out for signature";
  h.commission!.total = 300;
  const hi = buildPayoutItems(proposal, h);
  assert.equal(level(hi, "a-signed"), "issue");
  assert.equal(level(hi, "c-amount"), "issue");
  // No agreement found.
  assert.equal(level(buildPayoutItems(proposal, { ...facts(), agreement: null }), "a-found"), "issue");
}

function stateFor(p: Record<string, any>, f: PayoutFacts): PayoutState {
  return { run_at: "2026-11-11T10:00:00Z", run_by: "Owen", figures_hash: figuresHash(p), items: buildPayoutItems(p, f), facts: f };
}

{
  const st = stateFor(proposal, facts());
  let p = { ...proposal, extras: { ...proposal.extras, payout_check: st } };
  let ev = evaluatePayout(p);
  assert.equal(ev.cleared, false);
  assert.ok(ev.blockers.some((b) => /Deposit received/.test(b)));

  // Accept each open item with a reason, tick the manual items: cleared.
  const overrides: NonNullable<PayoutState["overrides"]> = {};
  for (const i of ev.items.filter((x) => x.state === "open")) overrides[i.id] = { reason: "ok", by: "Owen", at: "now", detail: i.detail };
  const manual: NonNullable<PayoutState["manual"]> = {};
  for (const m of MANUAL_ITEMS) manual[m.key] = { by: "Owen", at: "now", note: "x", sort_code: "20-57-44", account_number: "03702103" };
  p = { ...proposal, extras: { ...proposal.extras, payout_check: { ...st, overrides, manual } } };
  ev = evaluatePayout(p);
  assert.equal(ev.cleared, true, ev.blockers.join(" | "));

  // Figures change after the check: stale.
  assert.equal(evaluatePayout({ ...p, agreed_monthly: 210 }).cleared, false);

  // Bank details change after you verified them: that tick resets.
  const f2 = facts();
  f2.invoice!.account_number = "99999999";
  const p2 = { ...p, extras: { ...p.extras, payout_check: { ...p.extras.payout_check, facts: f2, items: buildPayoutItems(proposal, f2) } } };
  const ev2 = evaluatePayout(p2);
  assert.equal(ev2.manual.find((m) => m.key === "bank_verified")!.done, false);

  // An accepted reason stops counting if the underlying detail changes.
  const changed = { ...p.extras.payout_check, overrides: { "a-vat": { reason: "ok", by: "o", at: "n", detail: "something else" } } };
  assert.equal(evaluatePayout({ ...p, extras: { ...p.extras, payout_check: changed } }).cleared, false);

  // Never run: not cleared.
  assert.equal(evaluatePayout(proposal).cleared, false);
}

console.log("payout-gate tests passed");
