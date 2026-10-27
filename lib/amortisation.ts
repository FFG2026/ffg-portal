/**
 * Amortisation chart for a deal, built from its live payment rows and its
 * per-vehicle rows, so it rebuilds itself whenever an early settlement is
 * recorded (the settlement shows as its own line and the later rentals
 * are the ones the database has already re-cut).
 *
 * Method
 *  - The interest rate is the rate that makes the ORIGINAL rentals repay the
 *    amount lent (internal rate of return, monthly). Original rentals are the
 *    current rows with any settled vehicle's rental put back, so the rate does
 *    not move when a vehicle is settled.
 *  - Each rental splits into interest (balance x rate) and capital.
 *  - A settlement clears the settled vehicles' share of the balance (their
 *    capital over the capital of every vehicle still on the deal). Settlement
 *    figures carry no rebate, so what is paid above that capital is shown as
 *    interest / premium.
 *  - Finance leases are collected gross; the chart runs on the net amounts.
 */

export type AmortRow = {
  id?: string;
  instalment_number: number;
  due_date: string;
  amount: number;
  status: string;
};

export type AmortVehicle = {
  registration: string;
  capital_financed: number;
  rental_share: number;
  status: string;
  settled_date: string | null;
  settled_amount: number | null;
  settlement_payment_id: string | null;
};

export type AmortLine = {
  kind: "rental" | "settlement";
  n: number | null;
  date: string;
  status: string;
  payment: number;
  net: number;
  interest: number;
  capital: number;
  balance: number;
  label: string;
};

export type AmortChart = {
  rate_monthly: number;
  rate_annual: number;
  rate_note: string | null;
  vat_divisor: number;
  lines: AmortLine[];
  /** Balance had nothing been settled early. */
  original: { date: string; balance: number }[];
  totals: { interest: number; capital: number; settlement_premium: number };
  closing_balance: number;
};

function r2(n: number) {
  return Math.round(n * 100) / 100;
}

function pvAt(flows: { t: number; a: number }[], rate: number) {
  let pv = 0;
  for (const f of flows) pv += f.a / Math.pow(1 + rate, f.t);
  return pv;
}

/** Monthly rate at which the flows are worth `lend`. 0 when they are worth less. */
export function impliedMonthlyRate(
  flows: { t: number; a: number }[],
  lend: number
) {
  if (!(lend > 0) || flows.length === 0) return 0;
  if (pvAt(flows, 0) <= lend) return 0;
  let lo = 0;
  let hi = 0.05;
  while (pvAt(flows, hi) > lend && hi < 5) hi *= 2;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (pvAt(flows, mid) > lend) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

type Event = {
  paymentId: string | null;
  date: string;
  amount: number;
  capital: number;
  registrations: string[];
  slot: AmortRow | null;
};

export function buildAmortisation(opts: {
  agreementType?: string | null;
  totalLend: number;
  rows: AmortRow[];
  vehicles: AmortVehicle[];
}): AmortChart | null {
  const divisor = String(opts.agreementType || "").toUpperCase() === "FL" ? 1.2 : 1;
  const lend = Number(opts.totalLend || 0);
  if (!(lend > 0)) return null;

  const net = (a: number) => a / divisor;
  const vehicles = (opts.vehicles || []).filter((v) => v.capital_financed >= 0);
  const settledVehicles = vehicles.filter((v) => v.status === "settled" && v.settled_date);
  const rowById = new Map(opts.rows.filter((r) => r.id).map((r) => [r.id as string, r]));

  // One event per settlement payment; a settled vehicle with no payment row
  // linked still shows, dated by its own settlement.
  const groups = new Map<string, AmortVehicle[]>();
  for (const v of settledVehicles) {
    const key = v.settlement_payment_id || `${v.settled_date}|loose`;
    groups.set(key, [...(groups.get(key) || []), v]);
  }
  const events: Event[] = [];
  for (const [key, vs] of Array.from(groups.entries())) {
    const payRow = vs[0].settlement_payment_id
      ? rowById.get(vs[0].settlement_payment_id) || null
      : null;
    const sumSettled = vs.reduce((s, v) => s + Number(v.settled_amount || 0), 0);
    events.push({
      paymentId: payRow ? key : null,
      date: String(vs[0].settled_date).slice(0, 10),
      amount: r2(payRow ? Number(payRow.amount) : sumSettled),
      capital: vs.reduce((s, v) => s + Number(v.capital_financed || 0), 0),
      registrations: vs.map((v) => v.registration),
      slot: payRow && payRow.instalment_number > 0 ? payRow : null,
    });
  }
  events.sort((a, b) => a.date.localeCompare(b.date));
  const slotIds = new Set(events.filter((e) => e.slot).map((e) => e.slot!.id));

  const rentals = opts.rows
    .filter((r) => r.instalment_number > 0 && !slotIds.has(r.id))
    .sort((a, b) => a.instalment_number - b.instalment_number);
  if (rentals.length === 0 && events.length === 0) return null;

  // --- The original contract: rentals with settled vehicles put back. ---
  const totalShare = vehicles.reduce((s, v) => s + Number(v.rental_share || 0), 0);
  const activeShareAt = (date: string) =>
    vehicles
      .filter((v) => !(v.status === "settled" && v.settled_date && String(v.settled_date).slice(0, 10) < date))
      .reduce((s, v) => s + Number(v.rental_share || 0), 0);
  const originalAmount = (r: AmortRow) => {
    const active = activeShareAt(r.due_date.slice(0, 10));
    return totalShare > 0 && active > 0 ? r.amount * (totalShare / active) : r.amount;
  };
  const originalSlots: { n: number; date: string; a: number }[] = [
    ...rentals.map((r) => ({ n: r.instalment_number, date: r.due_date.slice(0, 10), a: net(originalAmount(r)) })),
    ...events
      .filter((e) => e.slot)
      .map((e) => ({
        n: e.slot!.instalment_number,
        date: e.slot!.due_date.slice(0, 10),
        a: net(totalShare > 0 ? totalShare : e.slot!.amount),
      })),
  ].sort((a, b) => a.n - b.n);

  const rate = impliedMonthlyRate(
    originalSlots.map((s) => ({ t: s.n, a: s.a })),
    lend
  );

  // --- Walk the live schedule. ---
  type Step =
    | { kind: "rental"; row: AmortRow }
    | { kind: "settlement"; ev: Event; at: number };
  const steps: Step[] = rentals.map((row) => ({ kind: "rental", row }));
  for (const ev of events) {
    if (ev.slot) {
      const pos = steps.findIndex(
        (s) => s.kind === "rental" && s.row.instalment_number > ev.slot!.instalment_number
      );
      steps.splice(pos < 0 ? steps.length : pos, 0, { kind: "settlement", ev, at: ev.slot.instalment_number });
    } else {
      let pos = 0;
      steps.forEach((s, i) => {
        if (s.kind === "rental" && s.row.due_date.slice(0, 10) <= ev.date) pos = i + 1;
        if (s.kind === "settlement" && s.ev.date <= ev.date) pos = i + 1;
      });
      steps.splice(pos, 0, { kind: "settlement", ev, at: -1 });
    }
  }

  let balance = lend;
  let activeCap = vehicles.reduce((s, v) => s + Number(v.capital_financed || 0), 0);
  const lines: AmortLine[] = [];
  let interestTotal = 0;
  let capitalTotal = 0;
  let premiumTotal = 0;

  for (const step of steps) {
    if (step.kind === "rental") {
      const a = net(Number(step.row.amount));
      const interest = Math.max(0, balance * rate);
      const capital = a - interest;
      balance -= capital;
      interestTotal += interest;
      capitalTotal += capital;
      lines.push({
        kind: "rental",
        n: step.row.instalment_number,
        date: step.row.due_date.slice(0, 10),
        status: step.row.status,
        payment: r2(Number(step.row.amount)),
        net: r2(a),
        interest: r2(interest),
        capital: r2(capital),
        balance: r2(balance),
        label: "Rental",
      });
    } else {
      const f = activeCap > 0 ? Math.min(1, step.ev.capital / activeCap) : 0;
      const cleared = balance * f;
      const paid = net(step.ev.amount);
      balance -= cleared;
      activeCap -= step.ev.capital;
      const premium = paid - cleared;
      premiumTotal += premium;
      capitalTotal += cleared;
      lines.push({
        kind: "settlement",
        n: step.ev.slot ? step.ev.slot.instalment_number : null,
        date: step.ev.date,
        status: "paid",
        payment: r2(step.ev.amount),
        net: r2(paid),
        interest: r2(premium),
        capital: r2(cleared),
        balance: r2(balance),
        label: `Early settlement, ${step.ev.registrations.join(", ")}`,
      });
    }
  }

  // --- The same deal had nothing been settled. ---
  let ob = lend;
  const original = [{ date: originalSlots[0]?.date || "", balance: r2(lend) }];
  for (const s of originalSlots) {
    ob -= s.a - Math.max(0, ob * rate);
    original.push({ date: s.date, balance: r2(ob) });
  }
  if (!original[0].date && original[1]) original[0].date = original[1].date;

  return {
    rate_monthly: rate,
    rate_annual: rate * 12,
    rate_note:
      rate === 0
        ? "The rentals do not add up to more than the amount lent, so no interest is shown."
        : null,
    vat_divisor: divisor,
    lines,
    original,
    totals: {
      interest: r2(interestTotal),
      capital: r2(capitalTotal),
      settlement_premium: r2(premiumTotal),
    },
    closing_balance: r2(balance),
  };
}
