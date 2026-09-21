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

function penceClose(a: number, b: number) {
  const diff = Math.abs(a - b);
  return diff <= 100 || diff <= Math.round(Math.max(a, b) * 0.02);
}

/** UK VAT 20% — FL spreadsheets often store net while GoCardless collects gross. */
export function withVatPence(netPence: number) {
  return Math.round(netPence * 1.2);
}

/** Same collection, allowing a small GC fee / rounding difference, or net vs VAT-gross. */
export function amountsClose(
  instalmentAmount: number | string,
  gcAmountPence: number
) {
  const inst = amountPence(instalmentAmount);
  if (penceClose(inst, gcAmountPence)) return true;
  if (penceClose(withVatPence(inst), gcAmountPence)) return true;
  return false;
}

export function looksLikeVatExclusive(
  amount: number | string,
  grossMonthly: number | string
) {
  return penceClose(withVatPence(amountPence(amount)), amountPence(grossMonthly));
}

/** Prefer the contracted monthly (VAT-inclusive) when a collection matches it. */
export function collectedScheduleAmount(
  instalmentAmount: number | string,
  gcAmountPence: number,
  monthlyInstalment?: number | string | null
) {
  const monthly =
    monthlyInstalment != null && Number(monthlyInstalment) > 0
      ? Number(monthlyInstalment)
      : null;
  if (monthly != null && amountsClose(monthly, gcAmountPence)) {
    return Math.round(monthly * 100) / 100;
  }
  if (looksLikeVatExclusive(instalmentAmount, gcAmountPence / 100)) {
    return Math.round(gcAmountPence) / 100;
  }
  return Math.round(Number(instalmentAmount) * 100) / 100;
}

const DEFAULT_DOCUMENTATION_FEE_PENCE = 19500;

/**
 * Documentation fees are sometimes collected on the same mandate as the
 * instalments. They must not be ticked onto the schedule or used to reduce
 * remaining owing.
 */
export function isDocumentationFeeCollection(
  gcAmountPence: number,
  documentationFee?: number | string | null,
  monthlyInstalment?: number | string | null
) {
  const feePence =
    documentationFee != null && Number(documentationFee) > 0
      ? Math.round(Number(documentationFee) * 100)
      : DEFAULT_DOCUMENTATION_FEE_PENCE;
  if (gcAmountPence === DEFAULT_DOCUMENTATION_FEE_PENCE) return true;
  if (gcAmountPence === feePence) return true;
  const monthlyPence =
    monthlyInstalment != null && Number(monthlyInstalment) > 0
      ? Math.round(Number(monthlyInstalment) * 100)
      : 0;
  return monthlyPence > 0 && gcAmountPence === monthlyPence + feePence;
}

/** Confirmed GoCardless cash in pounds, skipping the £195 documentation fee. */
export function collectedPoundsFromGoCardlessPayments(
  payments: { status?: string; amount?: number | string | null }[]
) {
  let pence = 0;
  for (const payment of payments || []) {
    if (!COLLECTED_STATUSES.has(String(payment.status || ""))) continue;
    const amount = Number(payment.amount) || 0;
    if (isDocumentationFeeCollection(amount)) continue;
    pence += amount;
  }
  return Math.round(pence) / 100;
}

/**
 * Cash actually collected this calendar month: GoCardless confirmed/paid_out
 * (skipping the £195 documentation fee) plus manual bank receipts.
 * Book yellow ticks without a GoCardless id are not cash in.
 */
export function collectedThisMonthPounds(opts: {
  gcPayments?: { status?: string; amount?: number | string | null }[] | null;
  manualPounds?: number;
}) {
  const gc = collectedPoundsFromGoCardlessPayments(opts.gcPayments || []);
  return Math.round((gc + Number(opts.manualPounds || 0)) * 100) / 100;
}

/** If GoCardless is unreachable, sum unique linked collections by paid_date. */
export function collectedThisMonthFromLinkedRows(
  rows: {
    status?: string | null;
    amount?: number | string | null;
    paid_date?: string | null;
    gocardless_payment_id?: string | null;
    source?: string | null;
  }[],
  monthStart: string,
  nextMonth: string
) {
  const seen = new Set<string>();
  let pounds = 0;
  for (const row of rows || []) {
    if (String(row.status || "") !== "paid") continue;
    const on = String(row.paid_date || "").slice(0, 10);
    if (on < monthStart || on >= nextMonth) continue;
    const gc = row.gocardless_payment_id || "";
    const manual = String(row.source || "") === "manual";
    if (!gc && !manual) continue;
    if (gc) {
      if (seen.has(gc)) continue;
      seen.add(gc);
    }
    pounds += Number(row.amount || 0);
  }
  return Math.round(pounds * 100) / 100;
}

export function scheduleCollectionsOnly(
  payments: GoCardlessPayment[],
  documentationFee?: number | string | null,
  monthlyInstalment?: number | string | null
) {
  return payments.filter(
    (p) =>
      !isDocumentationFeeCollection(
        p.amount,
        documentationFee,
        monthlyInstalment
      )
  );
}

function nearestInstalment(
  instalments: Instalment[],
  gcPayment: GoCardlessPayment,
  usedInstalmentIds: Set<string>,
  mode: "paid" | "failed",
  maxDays: number = MATCH_WINDOW_DAYS
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
    if (diff > maxDays) continue;
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
  const exactAmount = matches.find((row) =>
    amountsClose(row.amount, gcPayment.amount)
  );
  return exactAmount || matches[0];
}

export function matchGcPaymentsToInstalments(
  instalments: Instalment[],
  gcPayments: GoCardlessPayment[],
  opts?: { looseDateDays?: number }
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
      ) ||
      (opts?.looseDateDays
        ? nearestInstalment(
            instalments,
            payment,
            usedInstalmentIds,
            "paid",
            opts.looseDateDays
          )
        : null);
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
      ) ||
      (opts?.looseDateDays
        ? nearestInstalment(
            instalments,
            payment,
            usedInstalmentIds,
            "failed",
            opts.looseDateDays
          )
        : null);
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
