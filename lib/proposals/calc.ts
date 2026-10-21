/**
 * Hire-purchase maths for proposals. Matches the DCF calculator: a standard
 * reducing-balance annuity, interest compounded monthly at rate/12, payments
 * in arrears.
 */

export function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function monthlyPayment(
  principal: number,
  annualRatePct: number,
  termMonths: number,
  balloon = 0
) {
  if (!(principal > 0) || !(termMonths > 0)) return 0;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return (principal - balloon) / termMonths;
  const growth = Math.pow(1 + r, termMonths);
  return (principal * growth - balloon) * r / (growth - 1);
}

/** The rate (annual %) that produces `payment` on `principal` over `termMonths`. */
export function impliedRatePct(
  principal: number,
  payment: number,
  termMonths: number,
  balloon = 0
) {
  if (!(principal > 0) || !(payment > 0) || !(termMonths > 0)) return null;
  if (payment * termMonths + balloon < principal) return null;
  let lo = 0;
  let hi = 100;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (monthlyPayment(principal, mid, termMonths, balloon) < payment) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export type ProposalTerms = {
  cashPrice: number;
  deposit: number;
  commissionPct: number | null;
  commission: number | null;
  ratePct: number;
  termMonths: number;
};

/**
 * FFG convention (see the agreements table): net lend = cash price - deposit,
 * the commission is added on top, and the instalment repays both. Profit is
 * total repayable - net lend - commission.
 */
export function priceProposal(t: ProposalTerms) {
  const netLend = round2(t.cashPrice - t.deposit);
  const commission =
    t.commission !== null && Number.isFinite(t.commission)
      ? round2(t.commission)
      : round2(netLend * ((t.commissionPct ?? 0) / 100));
  const financed = round2(netLend + commission);
  const monthly = round2(monthlyPayment(financed, t.ratePct, t.termMonths));
  const totalRepayable = round2(monthly * t.termMonths);
  return {
    netLend,
    commission,
    financed,
    monthly,
    totalRepayable,
    profit: round2(totalRepayable - netLend - commission),
  };
}
