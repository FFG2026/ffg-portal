export const MATCH_WINDOW_DAYS = 10;

export const COLLECTED_STATUSES = new Set(["confirmed", "paid_out"]);
export const FAILED_STATUSES = new Set([
  "failed",
  "charged_back",
  "cancelled",
]);

export type Instalment = {
  id: string;
  due_date: string;
  status: string;
  amount: number | string;
  gocardless_payment_id: string | null;
  instalment_number?: number | null;
};

export type GoCardlessPayment = {
  id: string;
  charge_date: string | null;
  status: string;
  amount: number;
  /** Set when the GC description is HP41/2 (instalment 2 on HP41). */
  instalment_number?: number | null;
  mandateId?: string | null;
};

export type PaymentMatch = {
  instalmentId: string;
  gcPaymentId: string;
  chargeDate: string;
  status: "paid" | "failed";
};

function dateOnly(value: string): string {
  return value.slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  const ms =
    Date.parse(dateOnly(a) + "T00:00:00Z") -
    Date.parse(dateOnly(b) + "T00:00:00Z");
  return Math.round(ms / 86400000);
}

function amountPence(amount: number | string): number {
  return Math.round(Number(amount) * 100);
}

/** Same collection, allowing a small GC fee / rounding difference. */
export function amountsClose(
  instalmentAmount: number | string,
  gcAmountPence: number
) {
  const inst = amountPence(instalmentAmount);
  const diff = Math.abs(inst - gcAmountPence);
  return diff <= 100 || diff <= Math.round(inst * 0.02);
}

function nearestInstalment(
  instalments: Instalment[],
  gcPayment: GoCardlessPayment,
  usedInstalmentIds: Set<string>,
  mode: "paid" | "failed"
): Instalment | null {
  const chargeDate = gcPayment.charge_date;
  if (!chargeDate) return null;

  let best: Instalment | null = null;
  let bestScore = Infinity;

  for (const instalment of instalments) {
    if (usedInstalmentIds.has(instalment.id)) continue;
    if (instalment.gocardless_payment_id) continue;
    if (mode === "paid") {
      // Attach a collected payment to a due/failed row, or to a
      // historically paid row that was imported without a GC id.
    } else if (instalment.status === "paid") {
      continue;
    }

    const diff = Math.abs(daysBetween(instalment.due_date, chargeDate));
    if (diff > MATCH_WINDOW_DAYS) continue;
    if (!amountsClose(instalment.amount, gcPayment.amount)) continue;
    if (diff < bestScore) {
      bestScore = diff;
      best = instalment;
    }
  }

  return best;
}

function instalmentByNumber(
  instalments: Instalment[],
  gcPayment: GoCardlessPayment,
  usedInstalmentIds: Set<string>,
  mode: "paid" | "failed"
): Instalment | null {
  const n = gcPayment.instalment_number;
  if (n == null) return null;
  const matches = instalments.filter((instalment) => {
    if (usedInstalmentIds.has(instalment.id)) return false;
    if (instalment.gocardless_payment_id) return false;
    if (instalment.instalment_number !== n) return false;
    if (mode === "failed" && instalment.status === "paid") return false;
    return true;
  });
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  const exactAmount = matches.find(
    (row) => amountPence(row.amount) === gcPayment.amount
  );
  return exactAmount || matches[0];
}

export function matchGcPaymentsToInstalments(
  instalments: Instalment[],
  gcPayments: GoCardlessPayment[]
): PaymentMatch[] {
  const usedInstalmentIds = new Set<string>();
  const usedGcIds = new Set(
    instalments
      .map((row) => row.gocardless_payment_id)
      .filter((id): id is string => !!id)
  );
  const matches: PaymentMatch[] = [];

  const collected = gcPayments
    .filter((p) => COLLECTED_STATUSES.has(p.status) && p.charge_date)
    .sort((a, b) => a.charge_date!.localeCompare(b.charge_date!));

  for (const payment of collected) {
    if (usedGcIds.has(payment.id)) continue;
    const instalment =
      instalmentByNumber(instalments, payment, usedInstalmentIds, "paid") ||
      nearestInstalment(
        instalments,
        payment,
        usedInstalmentIds,
        "paid"
      );
    if (!instalment) continue;
    usedInstalmentIds.add(instalment.id);
    usedGcIds.add(payment.id);
    matches.push({
      instalmentId: instalment.id,
      gcPaymentId: payment.id,
      chargeDate: dateOnly(payment.charge_date!),
      status: "paid",
    });
  }

  const failed = gcPayments
    .filter((p) => FAILED_STATUSES.has(p.status) && p.charge_date)
    .sort((a, b) => a.charge_date!.localeCompare(b.charge_date!));

  for (const payment of failed) {
    if (usedGcIds.has(payment.id)) continue;
    const instalment =
      instalmentByNumber(instalments, payment, usedInstalmentIds, "failed") ||
      nearestInstalment(
        instalments,
        payment,
        usedInstalmentIds,
        "failed"
      );
    if (!instalment) continue;
    usedInstalmentIds.add(instalment.id);
    usedGcIds.add(payment.id);
    matches.push({
      instalmentId: instalment.id,
      gcPaymentId: payment.id,
      chargeDate: dateOnly(payment.charge_date!),
      status: "failed",
    });
  }

  return matches;
}

export function unmatchedCollectedPayments(
  gcPayments: GoCardlessPayment[],
  matches: PaymentMatch[],
  alreadyLinkedIds: (string | null | undefined)[]
) {
  const used = new Set<string>([
    ...matches.map((m) => m.gcPaymentId),
    ...alreadyLinkedIds.filter((id): id is string => !!id),
  ]);
  return gcPayments
    .filter(
      (p) =>
        COLLECTED_STATUSES.has(p.status) &&
        p.charge_date &&
        !used.has(p.id)
    )
    .sort((a, b) =>
      String(a.charge_date).localeCompare(String(b.charge_date))
    );
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isDirectDebitUpToDate(
  instalments: { due_date: string; status: string }[],
  today: string = todayIsoDate()
): boolean {
  return !instalments.some(
    (row) => row.status !== "paid" && dateOnly(row.due_date) < today
  );
}
