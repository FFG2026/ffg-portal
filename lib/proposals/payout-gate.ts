/**
 * The last check before a deal is paid out and loaded on the book.
 *
 * Everything here is pure (no database, no Drive, no model) so the same rules run on the server,
 * when the deal is booked, and in the browser, to show what is still open.
 *
 * The documents are read elsewhere (documents/payout-read.ts) into `PayoutFacts`; this file
 * compares those facts with the proposal and decides whether the deal is cleared.
 */

export type PayoutLevel = "ok" | "info" | "review" | "issue";
export type PayoutGroup = "Proposal" | "Agreement" | "Guarantee" | "Supplier invoice" | "Commission invoice";

export type PayoutItem = {
  id: string;
  group: PayoutGroup;
  label: string;
  level: PayoutLevel;
  detail: string;
};

export type AgreementFacts = {
  file: string;
  agreement_number: string | null;
  hirer_name: string | null;
  company_number: string | null;
  email: string | null;
  goods_description: string | null;
  reg: string | null;
  chassis: string | null;
  cash_price_ex_vat: number | null;
  vat: number | null;
  total_cost: number | null;
  deposit: number | null;
  balance_financed: number | null;
  documentation_fee: number | null;
  supplier_name: string | null;
  term_months: number | null;
  monthly: number | null;
  first_payment_date: string | null;
  insurer: string | null;
  option_fee: number | null;
  /** Taken from the e-signature "Final Audit Report" page, not from how the page looks. */
  audit_status: string | null;
  audit_completed: string | null;
  signers: { name: string | null; email: string | null; signed_at: string | null }[];
};

export type GuaranteeFacts = {
  file: string;
  guarantor_name: string | null;
  principal_name: string | null;
  principal_company_number: string | null;
  audit_status: string | null;
  audit_completed: string | null;
  signers: { name: string | null; email: string | null; signed_at: string | null }[];
};

export type SupplierInvoiceFacts = {
  file: string;
  invoice_number: string | null;
  invoice_date: string | null;
  supplier_name: string | null;
  billed_to: string | null;
  deliver_to: string | null;
  reg: string | null;
  chassis: string | null;
  net: number | null;
  vat: number | null;
  gross: number | null;
  amount_paid: number | null;
  balance_due: number | null;
  payee_name: string | null;
  sort_code: string | null;
  account_number: string | null;
};

export type CommissionInvoiceFacts = {
  file: string;
  invoice_number: string | null;
  invoice_date: string | null;
  bill_to: string | null;
  description: string | null;
  amount: number | null;
  vat: number | null;
  total: number | null;
  payee_sort_code: string | null;
  payee_account_number: string | null;
};

export type PayoutFacts = {
  agreement: AgreementFacts | null;
  guarantee: GuaranteeFacts | null;
  invoice: SupplierInvoiceFacts | null;
  commission: CommissionInvoiceFacts | null;
  /** Names of documents that were found but could not be read. */
  unread: string[];
  files: { role: string; name: string; modified: string | null }[];
};

export type ManualKey = "deposit_received" | "bank_verified" | "dd_set_up";

export const MANUAL_ITEMS: { key: ManualKey; label: string; hint: string; noteRequired: boolean }[] = [
  {
    key: "deposit_received",
    label: "Deposit received by the supplier",
    hint: "The invoice is billed to us for the full price, so only pay the balance once the customer's deposit has reached the supplier.",
    noteRequired: false,
  },
  {
    key: "bank_verified",
    label: "Supplier bank details verified",
    hint: "Confirm the sort code and account number on the invoice with the supplier on a number you already trust, not one printed on the invoice.",
    noteRequired: true,
  },
  {
    key: "dd_set_up",
    label: "Direct debit set up",
    hint: "The customer's mandate is live and the first collection date is set.",
    noteRequired: false,
  },
];

export type PayoutState = {
  run_at: string;
  run_by: string | null;
  /** Hash of the figures the check ran against – if they change afterwards the check is stale. */
  figures_hash: string;
  items: PayoutItem[];
  facts: PayoutFacts;
  manual?: Partial<Record<ManualKey, { by: string | null; at: string; note: string | null; sort_code?: string | null; account_number?: string | null }>>;
  /** Accepted-anyway items, keyed by item id. Only valid while the item's detail is unchanged. */
  overrides?: Record<string, { reason: string; by: string | null; at: string; detail: string }>;
};

/* ---------- small helpers ---------- */

type P = Record<string, any>;

const num = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};
const gbp = (v: number) =>
  `£${v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const same = (a: number | null, b: number | null, tol = 0.01) => a !== null && b !== null && Math.abs(a - b) <= tol;
const upperNoSpace = (s: string | null | undefined) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const nameKey = (s: string | null | undefined) =>
  String(s || "")
    .toLowerCase()
    .replace(/\b(ltd|limited|plc|llp)\b\.?/g, "")
    .replace(/[^a-z0-9]/g, "");
const digits = (s: string | null | undefined) => String(s || "").replace(/\D/g, "");
const dateOnly = (s: string | null | undefined) => (s ? String(s).slice(0, 10) : null);

export function figuresHash(p: P): string {
  const keys = [
    "cash_price", "vat", "deposit", "commission", "financed", "term_months", "quoted_monthly",
    "agreed_deposit", "agreed_commission", "agreed_financed", "agreed_monthly", "agreed_term_months",
    "agreed_rate_pct", "agreed_total_repayable",
  ];
  return keys.map((k) => `${k}=${num(p[k]) ?? ""}`).join("|") + `|${p.company_number || ""}|${p.supplier_name || ""}`;
}

/** What the proposal says the deal is, in the terms the agreement uses. */
export function expectedFromProposal(p: P) {
  const cash = num(p.cash_price);
  const deposit = num(p.agreed_deposit) ?? num(p.deposit) ?? 0;
  return {
    cash,
    vat: num(p.vat),
    deposit,
    netLend: cash !== null ? Math.round((cash - deposit) * 100) / 100 : null,
    commission: num(p.agreed_commission) ?? num(p.commission),
    monthly: num(p.agreed_monthly),
    term: num(p.agreed_term_months),
    total: num(p.agreed_total_repayable),
    ratesAgreed: num(p.agreed_monthly) !== null && num(p.agreed_term_months) !== null,
  };
}

const signedOk = (status: string | null) => !!status && /^(signed|completed|agreement completed)/i.test(status.trim());

function pushSign(
  out: PayoutItem[],
  group: PayoutGroup,
  idPrefix: string,
  label: string,
  facts: { file: string; audit_status: string | null; audit_completed: string | null; signers: { name: string | null; signed_at: string | null }[] },
  expectedSigners: number
) {
  const done = signedOk(facts.audit_status);
  const names = facts.signers.filter((s) => s.signed_at).map((s) => s.name).filter(Boolean);
  if (!facts.audit_status) {
    out.push({
      id: `${idPrefix}-signed`, group, label: `${label} signed`, level: "review",
      detail: `${facts.file} has no e-signature completion report on it, so I can't tell it is fully signed. Check both signatures by eye.`,
    });
  } else if (!done) {
    out.push({
      id: `${idPrefix}-signed`, group, label: `${label} signed`, level: "issue",
      detail: `${facts.file}: the e-signature report says "${facts.audit_status}", not completed.`,
    });
  } else if (names.length < expectedSigners) {
    out.push({
      id: `${idPrefix}-signed`, group, label: `${label} signed`, level: "review",
      detail: `${facts.file}: marked completed${facts.audit_completed ? ` on ${dateOnly(facts.audit_completed)}` : ""}, but only ${names.length} of ${expectedSigners} signatures are listed (${names.join(", ") || "none"}).`,
    });
  } else {
    out.push({
      id: `${idPrefix}-signed`, group, label: `${label} signed`, level: "ok",
      detail: `${facts.file}: fully signed${facts.audit_completed ? ` ${dateOnly(facts.audit_completed)}` : ""} by ${names.join(" and ")}.`,
    });
  }
}

/** Compares the documents' facts with the proposal. Software, not the model, decides every level here. */
export function buildPayoutItems(p: P, facts: PayoutFacts): PayoutItem[] {
  const out: PayoutItem[] = [];
  const want = expectedFromProposal(p);

  /* --- the proposal itself --- */
  if (!want.ratesAgreed) {
    out.push({
      id: "p-agreed", group: "Proposal", label: "Terms agreed", level: "issue",
      detail: "No monthly payment and term have been agreed on the proposal yet, so there is nothing to check the documents against.",
    });
  } else {
    const issues: string[] = [];
    const check = (want.monthly as number) * (want.term as number);
    if (want.total !== null && !same(check, want.total)) {
      issues.push(`the agreed total repayable ${gbp(want.total)} is not ${gbp(want.monthly as number)} × ${want.term} (${gbp(check)})`);
    }
    const financed = num(p.agreed_financed);
    if (financed !== null && want.netLend !== null && want.commission !== null && !same(financed, want.netLend + want.commission)) {
      issues.push(`the agreed financed ${gbp(financed)} is not the net lend ${gbp(want.netLend)} plus commission ${gbp(want.commission)}`);
    }
    out.push({
      id: "p-agreed", group: "Proposal", label: "Terms agreed", level: issues.length ? "review" : "ok",
      detail: `${gbp(want.monthly as number)} × ${want.term} months = ${gbp(check)}.${issues.length ? ` Worth a look: ${issues.join("; ")}.` : ""}`,
    });
  }

  /* --- signed hire purchase agreement --- */
  const a = facts.agreement;
  if (!a) {
    out.push({
      id: "a-found", group: "Agreement", label: "Signed agreement", level: "issue",
      detail: "No signed hire purchase agreement was found in the deal's Drive folder. Nothing to pay out against yet.",
    });
  } else {
    pushSign(out, "Agreement", "a", "Agreement", a, 2);

    const hirerOk = nameKey(a.hirer_name) === nameKey(p.company_name);
    const cnOk = !a.company_number || !p.company_number || upperNoSpace(a.company_number) === upperNoSpace(p.company_number);
    out.push({
      id: "a-hirer", group: "Agreement", label: "Hirer", level: hirerOk && cnOk ? "ok" : "issue",
      detail: hirerOk && cnOk
        ? `${a.hirer_name}${a.company_number ? ` (${a.company_number})` : ""} matches the proposal.`
        : `Agreement says ${a.hirer_name || "?"} (${a.company_number || "no number"}); proposal says ${p.company_name} (${p.company_number || "no number"}).`,
    });

    if (want.cash !== null) {
      const matches = same(a.total_cost, want.cash) || same(a.cash_price_ex_vat, want.cash);
      out.push({
        id: "a-price", group: "Agreement", label: "Price of the goods", level: matches ? "ok" : "issue",
        detail: matches
          ? `Agreement total cost of goods ${a.total_cost !== null ? gbp(a.total_cost) : "–"}${a.cash_price_ex_vat !== null ? ` (${gbp(a.cash_price_ex_vat)} + VAT ${a.vat !== null ? gbp(a.vat) : "–"})` : ""} agrees with the proposal's cash price ${gbp(want.cash)}.`
          : `Agreement total cost is ${a.total_cost !== null ? gbp(a.total_cost) : "?"} (ex VAT ${a.cash_price_ex_vat !== null ? gbp(a.cash_price_ex_vat) : "?"}) but the proposal's cash price is ${gbp(want.cash)}.`,
      });
    }

    if (want.vat !== null && a.vat !== null && !same(a.vat, want.vat)) {
      out.push({
        id: "a-vat", group: "Agreement", label: "VAT", level: "review",
        detail: `The agreement shows VAT of ${gbp(a.vat)} but the proposal still holds ${gbp(want.vat)}. Correct the proposal so the file matches the paperwork.`,
      });
    }

    out.push({
      id: "a-deposit", group: "Agreement", label: "Deposit", level: same(a.deposit, want.deposit) ? "ok" : "issue",
      detail: same(a.deposit, want.deposit)
        ? `${gbp(want.deposit)} on the agreement and the proposal.`
        : `Agreement deposit ${a.deposit !== null ? gbp(a.deposit) : "?"} but the proposal says ${gbp(want.deposit)}.`,
    });

    if (want.netLend !== null) {
      const internal = a.total_cost !== null && a.deposit !== null ? Math.round((a.total_cost - a.deposit) * 100) / 100 : null;
      const ok = same(a.balance_financed, want.netLend);
      const detail = ok
        ? `Balance financed ${gbp(want.netLend)} (price less deposit) agrees.`
        : `Agreement balance financed is ${a.balance_financed !== null ? gbp(a.balance_financed) : "?"} but the proposal's price less deposit is ${gbp(want.netLend)}.`;
      const selfConsistent = internal === null || a.balance_financed === null || same(internal, a.balance_financed);
      out.push({
        id: "a-financed", group: "Agreement", label: "Balance financed", level: ok && selfConsistent ? "ok" : "issue",
        detail: selfConsistent ? detail : `${detail} The agreement's own figures don't add up either: ${gbp(a.total_cost as number)} less ${gbp(a.deposit as number)} is ${gbp(internal as number)}.`,
      });
    }

    if (want.ratesAgreed) {
      const monthlyOk = same(a.monthly, want.monthly);
      const termOk = a.term_months !== null && a.term_months === want.term;
      out.push({
        id: "a-payments", group: "Agreement", label: "Monthly payment and term", level: monthlyOk && termOk ? "ok" : "issue",
        detail: monthlyOk && termOk
          ? `${a.term_months} × ${gbp(a.monthly as number)} = ${gbp((a.term_months as number) * (a.monthly as number))} agrees with the proposal's agreed terms.`
          : `Agreement says ${a.term_months ?? "?"} × ${a.monthly !== null ? gbp(a.monthly) : "?"}; the proposal's agreed terms are ${want.term} × ${gbp(want.monthly as number)}.`,
      });
    }

    const docFee = a.documentation_fee;
    out.push({
      id: "a-docfee", group: "Agreement", label: "Documentation fee",
      level: docFee === null ? "review" : docFee === 195 ? "ok" : "review",
      detail: docFee === null
        ? "No documentation fee is printed on the agreement. The book form defaults to £195.00."
        : docFee === 195
        ? "£195.00, as the book form will charge."
        : `Agreement shows ${gbp(docFee)} but the book form defaults to £195.00. Change it when you book.`,
    });

    if (a.email && p.customer_email && a.email.trim().toLowerCase() !== String(p.customer_email).trim().toLowerCase()) {
      out.push({
        id: "a-email", group: "Agreement", label: "Customer email", level: "review",
        detail: `The agreement uses ${a.email} but the proposal holds ${p.customer_email}. Agreement documents and notices go to the agreement's address; update the customer record once booked.`,
      });
    }

    const reserved = p.extras?.reserved_agreement_number || null;
    if (!a.agreement_number) {
      out.push({
        id: "a-number", group: "Agreement", label: "Agreement number", level: "review",
        detail: `The signed agreement has no agreement number written in${reserved ? ` – it will be booked as ${reserved}` : ""}. Make sure the number you book matches the one you quote to the customer.`,
      });
    } else if (reserved && upperNoSpace(a.agreement_number) !== upperNoSpace(reserved)) {
      out.push({
        id: "a-number", group: "Agreement", label: "Agreement number", level: "issue",
        detail: `The agreement says ${a.agreement_number} but ${reserved} is reserved for this proposal.`,
      });
    }

    const blanks: string[] = [];
    if (!a.first_payment_date) blanks.push("first payment date");
    if (!a.insurer) blanks.push("insurance details");
    if (a.option_fee === null) blanks.push("option to purchase fee");
    if (blanks.length) {
      out.push({
        id: "a-blanks", group: "Agreement", label: "Blank fields", level: "info",
        detail: `Left empty on the signed agreement: ${blanks.join(", ")}. The start date runs from the date you signed${a.audit_completed ? ` (${dateOnly(a.audit_completed)})` : ""}.`,
      });
    }
  }

  /* --- supplier invoice --- */
  const inv = facts.invoice;
  if (!inv) {
    out.push({
      id: "i-found", group: "Supplier invoice", label: "Supplier invoice", level: "issue",
      detail: "No supplier invoice was found in the deal's Drive folder. You can't pay the supplier without one.",
    });
  } else {
    out.push({
      id: "i-read", group: "Supplier invoice", label: "Invoice read", level: "ok",
      detail: `${inv.file}${inv.invoice_number ? ` · no. ${inv.invoice_number}` : ""}${inv.invoice_date ? ` · ${inv.invoice_date}` : ""} from ${inv.supplier_name || "?"}${inv.gross !== null ? ` · ${gbp(inv.gross)} gross` : ""}.`,
    });

    if (a) {
      const gross = inv.gross;
      const priceOk = same(gross, a.total_cost);
      out.push({
        id: "i-price", group: "Supplier invoice", label: "Invoice matches agreement price", level: priceOk && (a.cash_price_ex_vat === null || same(inv.net, a.cash_price_ex_vat)) ? "ok" : "issue",
        detail: priceOk
          ? `Invoice ${gross !== null ? gbp(gross) : "–"} gross${inv.net !== null ? ` (${gbp(inv.net)} + VAT ${inv.vat !== null ? gbp(inv.vat) : "–"})` : ""} agrees with the agreement.`
          : `Invoice is ${gross !== null ? gbp(gross) : "?"} gross (${inv.net !== null ? gbp(inv.net) : "?"} net) but the agreement says ${a.total_cost !== null ? gbp(a.total_cost) : "?"} (${a.cash_price_ex_vat !== null ? gbp(a.cash_price_ex_vat) : "?"} ex VAT).`,
      });

      const regOk = !a.reg || !inv.reg || upperNoSpace(a.reg) === upperNoSpace(inv.reg);
      const chOk = !a.chassis || !inv.chassis || upperNoSpace(a.chassis) === upperNoSpace(inv.chassis);
      const regMissing = !inv.reg && !inv.chassis;
      out.push({
        id: "i-asset", group: "Supplier invoice", label: "Same vehicle", level: !regOk || !chOk ? "issue" : regMissing ? "review" : "ok",
        detail: !regOk || !chOk
          ? `Agreement: ${a.reg || "no reg"} / ${a.chassis || "no chassis"}. Invoice: ${inv.reg || "no reg"} / ${inv.chassis || "no chassis"}. They don't agree.`
          : regMissing
          ? "The invoice shows no registration or chassis number, so the vehicle can't be matched to the agreement."
          : `Registration ${inv.reg || a.reg} and chassis ${inv.chassis || a.chassis} agree between the invoice and the agreement.`,
      });

      const suppOk = nameKey(inv.supplier_name) === nameKey(a.supplier_name);
      out.push({
        id: "i-supplier", group: "Supplier invoice", label: "Same supplier", level: !a.supplier_name || !inv.supplier_name ? "review" : suppOk ? "ok" : "issue",
        detail: !a.supplier_name || !inv.supplier_name
          ? `Couldn't compare: agreement supplier ${a.supplier_name || "blank"}, invoice supplier ${inv.supplier_name || "unreadable"}.`
          : suppOk
          ? `${inv.supplier_name} on both.`
          : `Agreement names ${a.supplier_name} but the invoice is from ${inv.supplier_name}.`,
      });
    }

    if (inv.net !== null && inv.vat !== null && inv.vat > 0 && Math.abs(inv.vat - inv.net * 0.2) > 0.02) {
      out.push({
        id: "i-vat", group: "Supplier invoice", label: "Invoice VAT", level: "review",
        detail: `VAT ${gbp(inv.vat)} is not 20% of ${gbp(inv.net)}.`,
      });
    }

    if (inv.billed_to && !/future\s*f\.?\s*g/i.test(inv.billed_to)) {
      out.push({
        id: "i-billed", group: "Supplier invoice", label: "Billed to us", level: "review",
        detail: `The invoice is billed to "${inv.billed_to}", not Future FG.`,
      });
    }

    if (inv.amount_paid !== null && inv.amount_paid > 0) {
      out.push({
        id: "i-paid", group: "Supplier invoice", label: "Already paid?", level: "review",
        detail: `The invoice shows ${gbp(inv.amount_paid)} already paid. Check it hasn't been paid before.`,
      });
    }

    const toPay = a?.balance_financed ?? want.netLend;
    if (toPay !== null && inv.gross !== null) {
      const unpaid = inv.balance_due ?? inv.gross;
      out.push({
        id: "i-topay", group: "Supplier invoice", label: "Amount to pay the supplier", level: "info",
        detail: `Pay ${gbp(toPay)} – the balance financed${want.deposit ? `, after the customer's ${gbp(want.deposit)} deposit` : ""}. The invoice itself asks for ${gbp(unpaid)}${same(unpaid, inv.gross) && want.deposit ? `, so the deposit has not been taken off it and must be confirmed as paid` : ""}.`,
      });
    }

    if (!inv.sort_code || !inv.account_number) {
      out.push({
        id: "i-bank", group: "Supplier invoice", label: "Supplier bank details", level: "review",
        detail: "No sort code and account number could be read from the invoice. Get the supplier's bank details in writing.",
      });
    } else {
      out.push({
        id: "i-bank", group: "Supplier invoice", label: "Supplier bank details", level: "info",
        detail: `Pay ${inv.payee_name || inv.supplier_name || "the supplier"}: sort code ${inv.sort_code}, account ${inv.account_number}. Verify these before paying (tick-off below).`,
      });
    }
  }

  /* --- personal guarantee --- */
  const g = facts.guarantee;
  if (!g) {
    out.push({
      id: "g-found", group: "Guarantee", label: "Signed guarantee", level: "review",
      detail: "No signed personal guarantee was found in the Drive folder. If none is required on this deal, accept this with a reason.",
    });
  } else {
    pushSign(out, "Guarantee", "g", "Guarantee", g, 2);
    const principalOk = !g.principal_name || nameKey(g.principal_name) === nameKey(p.company_name);
    const cnOk = !g.principal_company_number || !p.company_number || upperNoSpace(g.principal_company_number) === upperNoSpace(p.company_number);
    out.push({
      id: "g-principal", group: "Guarantee", label: "Guarantee covers this company", level: principalOk && cnOk ? "ok" : "issue",
      detail: principalOk && cnOk
        ? `${g.guarantor_name || "Guarantor"} guarantees ${g.principal_name || p.company_name}${g.principal_company_number ? ` (${g.principal_company_number})` : ""}.`
        : `The guarantee names ${g.principal_name || "?"} (${g.principal_company_number || "no number"}); the proposal is ${p.company_name} (${p.company_number || "no number"}).`,
    });
  }

  /* --- our commission invoice --- */
  const c = facts.commission;
  if (!c) {
    out.push({
      id: "c-found", group: "Commission invoice", label: "Commission invoice", level: "review",
      detail: "No DCF commission invoice was found in the Drive folder, so the commission hasn't been checked.",
    });
  } else {
    const commOk = same(c.total ?? c.amount, want.commission);
    out.push({
      id: "c-amount", group: "Commission invoice", label: "Commission amount", level: want.commission === null ? "review" : commOk ? "ok" : "issue",
      detail: want.commission === null
        ? `${c.file}: ${gbp((c.total ?? c.amount) as number)}. The proposal has no commission figure to compare with.`
        : commOk
        ? `${c.file}${c.invoice_number ? ` (no. ${c.invoice_number})` : ""}: ${gbp((c.total ?? c.amount) as number)} agrees with the proposal's commission.`
        : `${c.file}: invoice is ${c.total !== null || c.amount !== null ? gbp((c.total ?? c.amount) as number) : "?"} but the proposal's commission is ${gbp(want.commission)}.`,
    });
    const reserved = p.extras?.reserved_agreement_number || a?.agreement_number || null;
    if (reserved && c.description && upperNoSpace(c.description).indexOf(upperNoSpace(reserved)) < 0) {
      out.push({
        id: "c-ref", group: "Commission invoice", label: "Commission invoice reference", level: "review",
        detail: `The invoice description doesn't mention ${reserved}: "${c.description}".`,
      });
    }
  }

  if (facts.unread.length) {
    out.push({
      id: "x-unread", group: "Proposal", label: "Documents I couldn't read", level: "review",
      detail: `${facts.unread.join(", ")} – check ${facts.unread.length === 1 ? "it" : "them"} by hand.`,
    });
  }

  return out;
}

/* ---------- is the deal cleared? ---------- */

/** Only these block payout: the figures on the finance documents, supplier invoice and commission invoice must agree. */
export const BLOCKING_IDS = new Set([
  "p-agreed", "a-found", "i-found", "c-found", "a-price", "a-deposit", "a-financed", "a-payments",
  "i-price", "i-vat", "c-amount", "x-unread",
]);

export type EvaluatedItem = PayoutItem & {
  state: "ok" | "info" | "advisory" | "accepted" | "open";
  override?: { reason: string; by: string | null; at: string };
};

export type EvaluatedManual = {
  key: ManualKey;
  label: string;
  hint: string;
  noteRequired: boolean;
  done: boolean;
  by: string | null;
  at: string | null;
  note: string | null;
  /** Set when it was ticked but something changed afterwards and it needs doing again. */
  reset_reason: string | null;
};

export type PayoutEvaluation = {
  ran: boolean;
  stale: boolean;
  items: EvaluatedItem[];
  manual: EvaluatedManual[];
  blockers: string[];
  cleared: boolean;
};

export function evaluatePayout(p: P): PayoutEvaluation {
  const st: PayoutState | undefined = p.extras?.payout_check;
  const blank = MANUAL_ITEMS.map((m) => ({ ...m, done: false, by: null, at: null, note: null, reset_reason: null as string | null }));
  if (!st || !Array.isArray(st.items)) {
    return {
      ran: false, stale: false, items: [], manual: blank,
      blockers: ["Run the pre-payout check."], cleared: false,
    };
  }
  const stale = st.figures_hash !== figuresHash(p);
  const overrides = st.overrides || {};
  const items: EvaluatedItem[] = st.items.map((it) => {
    if (it.level === "ok") return { ...it, state: "ok" as const };
    if (it.level === "info") return { ...it, state: "info" as const };
    if (!BLOCKING_IDS.has(it.id)) return { ...it, state: "advisory" as const };
    const o = overrides[it.id];
    if (o && o.reason && o.detail === it.detail) {
      return { ...it, state: "accepted" as const, override: { reason: o.reason, by: o.by, at: o.at } };
    }
    return { ...it, state: "open" as const };
  });

  const invoiceBank = st.facts?.invoice;
  const manual: EvaluatedManual[] = MANUAL_ITEMS.map((m) => {
    const t = st.manual?.[m.key];
    let done = !!t;
    let reset: string | null = null;
    if (done && m.key === "bank_verified" && invoiceBank) {
      const s = digits(invoiceBank.sort_code);
      const n = digits(invoiceBank.account_number);
      if (digits(t?.sort_code) !== s || digits(t?.account_number) !== n) {
        done = false;
        reset = "The bank details on the invoice are not the ones you verified – verify them again.";
      }
    }
    return { ...m, done, by: t?.by ?? null, at: t?.at ?? null, note: t?.note ?? null, reset_reason: reset };
  });

  const blockers: string[] = [];
  if (stale) blockers.push("The proposal's figures have changed since the check ran – run it again.");
  const open = items.filter((i) => i.state === "open");
  for (const i of open) blockers.push(`${i.label}: ${i.level === "issue" ? "doesn't add up" : "needs a look"} – fix it or accept it with a reason.`);
  return { ran: true, stale, items, manual, blockers, cleared: blockers.length === 0 };
}
