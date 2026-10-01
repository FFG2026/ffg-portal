import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { fetchAllIn, fetchAllRows } from "../../../../lib/supabase/fetch-all";
import { bookFromRequest } from "../../../../lib/admin-book";
import { authorizeAdminRequest } from "../../../../lib/admin";
import {
  isLiveDeal,
  chaseOverdueSum,
  chaseArrearsBroughtForward,
  isManualCashReceipt,
  isPaidRow,
  unpaidSum,
  settlementFigure,
  currentMonthInstalmentTotals,
} from "../../../../lib/deal-status";
import {
  fetchGoCardlessPaymentsChargedBetween,
  fetchGoCardlessFailedPaymentsChargedBetween,
  fetchGoCardlessInFlightPaymentsChargedBetween,
} from "../../../../lib/gocardless/client";
import {
  collectedPoundsFromGoCardlessPayments,
  inFlightPoundsFromGoCardlessPayments,
  collectedThisMonthFromLinkedRows,
} from "../../../../lib/gocardless/match-payments";
import {
  DD_MISS_FROM,
  missMonthsFrom,
  summariseDdMisses,
} from "../../../../lib/gocardless/dd-misses";
import { webhookHealth } from "../../../../lib/gocardless/webhook-health";
import {
  missRowsForAgreements,
  persistDirectDebitMissRows,
} from "../../../../lib/gocardless/sync-payments";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const maxDuration = 60;

const NO_CACHE = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
};

function num(v: unknown) {
  return Number(v || 0);
}

export async function GET(request: Request) {
  const auth = await authorizeAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const book = bookFromRequest(request);
  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + "01";
  const nextMonth = (() => {
    const [y, m] = monthStart.split("-").map(Number);
    return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  })();
  const chartMonths: string[] = [];
  const cursor = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 12, 1));
  for (let i = 0; i < 12; i++) {
    chartMonths.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  const chartStart = `${chartMonths[0]}-01`;

  let agreements;
  let payments;
  let customers;
  let gcCollectedThisMonth = 0;
  let gcMonthLoaded = false;
  let gcMonthCount = 0;
  let gcInFlight = 0;
  let gcInFlightCount = 0;
  let gcHistory: any[] = [];
  let gcFailed: any[] = [];
  try {
    [agreements, customers] = await Promise.all([
      fetchAllRows(() =>
        supabase
          .from("agreements")
          .select(
            "id, agreement_number, agreement_type, customer_id, asset_description, monthly_instalment, term_months, start_date, written_date, gocardless_mandate_id, total_lend, total_repayable, commission, status, book"
          )
          .eq("book", book)
      ),
      fetchAllRows(() => supabase.from("customers").select("id, company_name")),
    ]);

    if (book === "ffg" && process.env.GOCARDLESS_ACCESS_TOKEN) {
      try {
        const loaded = await Promise.race([
          Promise.all([
            fetchGoCardlessPaymentsChargedBetween(chartStart, nextMonth),
            fetchGoCardlessFailedPaymentsChargedBetween(DD_MISS_FROM, nextMonth),
            fetchGoCardlessInFlightPaymentsChargedBetween(monthStart, nextMonth),
          ]),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("GoCardless timed out")), 25000)
          ),
        ]);
        gcHistory = loaded[0];
        gcFailed = loaded[1];
        const gcMonth = gcHistory.filter((payment) => {
          const charged = String(payment.charge_date || "").slice(0, 10);
          return charged >= monthStart && charged < nextMonth;
        });
        gcCollectedThisMonth = collectedPoundsFromGoCardlessPayments(gcMonth);
        gcMonthCount = gcMonth.length;
        const inFlight = loaded[2] || [];
        gcInFlight = inFlightPoundsFromGoCardlessPayments(inFlight);
        gcInFlightCount = inFlight.length;
        gcMonthLoaded = true;
      } catch {
        // Book figures still load if GoCardless is down or slow.
      }
    }

    const ids = (agreements || []).map((a) => a.id);
    payments = await fetchAllIn(
      (chunk) =>
        supabase
          .from("payments")
          .select("agreement_id, amount, status, due_date, paid_date, source, gocardless_payment_id")
          .in("agreement_id", chunk)
          .order("id"),
      ids
    );

    if (book === "ffg" && gcFailed.length) {
      try {
        await persistDirectDebitMissRows(
          supabase,
          missRowsForAgreements(
            gcFailed,
            (agreements || []).map((agreement) => ({
              id: agreement.id,
              agreement_number: agreement.agreement_number,
              gocardless_mandate_id: agreement.gocardless_mandate_id,
              monthly_instalment: agreement.monthly_instalment,
            }))
          )
        );
      } catch {
        // Miss list still loads from anything already stored.
      }
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Could not load the book" },
      { status: 500 }
    );
  }

  const nameById = new Map(
    (customers || []).map((c) => [c.id, c.company_name as string])
  );

  const paymentsByAgreement = new Map<string, typeof payments>();
  for (const p of payments || []) {
    const list = paymentsByAgreement.get(p.agreement_id) || [];
    list.push(p);
    paymentsByAgreement.set(p.agreement_id, list);
  }

  const agreementNumberById = new Map(
    (agreements || []).map((agreement) => [agreement.id, agreement.agreement_number as string])
  );

  const liveById = new Map<string, boolean>();
  for (const a of agreements || []) {
    const rows = paymentsByAgreement.get(a.id) || [];
    liveById.set(a.id, isLiveDeal(a, rows));
  }

  let paidTotal = 0;
  let outstanding = 0;
  let overdue = 0;
  let arrearsBroughtIn = 0;
  let dueThisMonth = 0;
  let collectedThisMonth = 0;
  const monthMap = new Map<string, { paid: number; unpaid: number }>();

  const monthlyByAgreement = new Map(
    (agreements || []).map((a) => [a.id as string, a.monthly_instalment])
  );
  const monthSchedule = currentMonthInstalmentTotals(
    (payments || []).map((p) => ({
      live: liveById.get(p.agreement_id) !== false,
      monthly_instalment: monthlyByAgreement.get(p.agreement_id),
      due_date: p.due_date,
      amount: p.amount,
      status: p.status,
    })),
    monthStart,
    nextMonth
  );
  dueThisMonth = monthSchedule.still_due;
  const lumpsThisMonth = monthSchedule.lumps_still_due;

  for (const p of payments || []) {
    const amount = num(p.amount);
    const dueMonth = String(p.due_date).slice(0, 7);
    if (!monthMap.has(dueMonth)) monthMap.set(dueMonth, { paid: 0, unpaid: 0 });
    const bucket = monthMap.get(dueMonth)!;
    if (isPaidRow(p.status)) {
      paidTotal += amount;
      bucket.paid += amount;
    } else if (liveById.get(p.agreement_id) !== false) {
      bucket.unpaid += amount;
    }
  }
  const withMonthly = (payments || []).map((p) => ({
    ...p,
    monthly_instalment: monthlyByAgreement.get(p.agreement_id),
  }));
  collectedThisMonth = round2(
    book === "gg"
      ? collectedThisMonthFromLinkedRows(withMonthly, monthStart, nextMonth)
      : gcMonthLoaded
        ? gcCollectedThisMonth
        : collectedThisMonthFromLinkedRows(
            withMonthly.filter(
              (p) => String((p as { source?: string }).source || "") !== "manual"
            ),
            monthStart,
            nextMonth
          )
  );

  for (const a of agreements || []) {
    if (liveById.get(a.id) === false) continue;
    const rows = paymentsByAgreement.get(a.id) || [];
    const company = nameById.get(a.customer_id) || "";
    const od = chaseOverdueSum(company, a, rows, today);
    overdue += od;
    arrearsBroughtIn += chaseArrearsBroughtForward(company, a, rows, today);
    outstanding += settlementFigure(a, rows) - od;
  }

  // The book's own paid rows are bucketed by due month, GoCardless by charge
  // month, so they cannot be added together. When GoCardless has loaded it is
  // the authority on Direct Debit cash — but it only knows about Direct
  // Debits, so bank and manual receipts are added back on top. Replacing the
  // bar wholesale, as this used to, dropped them from the chart entirely.
  if (gcMonthLoaded) {
    const manualByMonth = new Map<string, number>();
    for (const p of payments || []) {
      if (!isPaidRow(p.status)) continue;
      if (
        !isManualCashReceipt({
          source: (p as { source?: string }).source,
          amount: p.amount,
          monthly_instalment: monthlyByAgreement.get(p.agreement_id),
        })
      ) {
        continue;
      }
      const month = String(p.paid_date || p.due_date || "").slice(0, 7);
      if (month.length !== 7) continue;
      manualByMonth.set(month, (manualByMonth.get(month) || 0) + num(p.amount));
    }
    for (const month of chartMonths) {
      const bucket = monthMap.get(month) || { paid: 0, unpaid: 0 };
      bucket.paid =
        collectedPoundsFromGoCardlessPayments(
          gcHistory.filter(
            (payment) => String(payment.charge_date || "").slice(0, 7) === month
          )
        ) + (manualByMonth.get(month) || 0);
      monthMap.set(month, bucket);
    }
  }

  const chart = chartMonths.map((month) => {
    const b = monthMap.get(month) || { paid: 0, unpaid: 0 };
    return { month, paid: round2(b.paid), unpaid: round2(b.unpaid) };
  });
  const lending = chartMonths.map((month) => {
    const deals = (agreements || []).filter(
      (agreement) => String(agreement.written_date || agreement.start_date || "").slice(0, 7) === month
    );
    return {
      month,
      deals: deals.length,
      total_lent: round2(deals.reduce((sum, agreement) => sum + num(agreement.total_lend), 0)),
    };
  });

  type Attention = {
    agreement_number: string;
    company_name: string;
    reason: string;
    amount: number | null;
  };
  const attention: Attention[] = [];

  let live = 0;
  let finished = 0;
  let noMandate = 0;

  for (const a of agreements || []) {
    const rows = paymentsByAgreement.get(a.id) || [];
    const isLive = isLiveDeal(a, rows);
    if (isLive) live += 1;
    else finished += 1;

    const company = nameById.get(a.customer_id) || "(unknown)";
    if (book === "ffg" && !a.gocardless_mandate_id) {
      noMandate += 1;
      if (isLive) {
        attention.push({
          agreement_number: a.agreement_number,
          company_name: company,
          reason: "No GoCardless mandate",
          amount: null,
        });
      }
    }
    if (isLive && rows.length === 0) {
      attention.push({
        agreement_number: a.agreement_number,
        company_name: company,
        reason: "No payment schedule",
        amount: null,
      });
    }
    const overdueAmt =
      unpaidSum(rows) > 0 ? chaseOverdueSum(company, a, rows, today) : 0;
    if (isLive && overdueAmt > 0) {
      attention.push({
        agreement_number: a.agreement_number,
        company_name: company,
        reason: "Overdue collections",
        amount: round2(overdueAmt),
      });
    }
    const asset = a.asset_description || "";
    if (
      book === "ffg" &&
      isLive &&
      (!asset || asset.startsWith("Pending"))
    ) {
      attention.push({
        agreement_number: a.agreement_number,
        company_name: company,
        reason: "Asset not on file",
        amount: null,
      });
    }
  }

  attention.sort((a, b) => (b.amount || 0) - (a.amount || 0));

  let storedMisses: {
    agreement_id: string;
    charge_date: string;
    amount: number | string;
    month: string;
  }[] = [];
  if (book === "ffg") {
    try {
      storedMisses = await fetchAllIn(
        (chunk) =>
          supabase
            .from("direct_debit_misses")
            .select("agreement_id, charge_date, amount, month")
            .gte("charge_date", DD_MISS_FROM)
            .in("agreement_id", chunk),
        (agreements || []).map((agreement) => agreement.id)
      );
    } catch {
      storedMisses = [];
    }
  }
  const dd_misses = summariseDdMisses(
    storedMisses,
    new Map(
      (agreements || []).map((agreement) => [
        agreement.id as string,
        {
          agreement_number: agreement.agreement_number as string,
          company_name: nameById.get(agreement.customer_id) || "(unknown)",
        },
      ])
    )
  );
  const dd_miss_months = book === "ffg" ? missMonthsFrom(DD_MISS_FROM, today) : [];

  const todayUtc = new Date(`${today}T00:00:00.000Z`);
  const cashflow = [30, 60, 90].map((days) => {
    const end = new Date(todayUtc);
    end.setUTCDate(end.getUTCDate() + days);
    const endDate = end.toISOString().slice(0, 10);
    const upcoming = (payments || []).filter(
      (payment) =>
        !isPaidRow(payment.status) &&
        liveById.get(payment.agreement_id) !== false &&
        payment.due_date >= today &&
        payment.due_date <= endDate
    );
    return {
      days,
      // Arrears are owed now, so they sit in every forward window.
      amount: round2(
        upcoming.reduce((sum, payment) => sum + num(payment.amount), 0) +
          arrearsBroughtIn
      ),
      count: upcoming.length,
    };
  });

  const recentActivity = (payments || [])
    .filter((payment) => isPaidRow(payment.status) && payment.paid_date)
    .sort((a, b) => String(b.paid_date).localeCompare(String(a.paid_date)))
    .slice(0, 4)
    .map((payment) => ({
      date: payment.paid_date,
      description: `Payment received (${formatGbp(num(payment.amount))})`,
      agreement_number: agreementNumberById.get(payment.agreement_id) || "—",
      source: String(payment.source || "Book"),
    }));

  // Is GoCardless actually pushing to us, or is the book only moving when
  // someone happens to open a page?
  let lastWebhookAt: string | null = null;
  try {
    const latest = await supabase
      .from("gocardless_events")
      .select("received_at")
      .order("received_at", { ascending: false })
      .limit(1);
    lastWebhookAt = latest.data?.[0]?.received_at ?? null;
  } catch {
    lastWebhookAt = null;
  }

  return NextResponse.json(
    {
    generated_at: new Date().toISOString(),
    webhook: webhookHealth(lastWebhookAt),
    totals: {
      live,
      finished,
      customers: new Set((agreements || []).map((a) => a.customer_id)).size,
      paid_total: round2(paidTotal),
      outstanding: round2(outstanding),
      overdue: round2(overdue),
      due_this_month: round2(dueThisMonth),
      // What is still expected in this month: this month's own instalments
      // plus last month's misses. This month's misses are already inside
      // due_this_month, so only the brought-forward part is added.
      arrears_brought_forward: round2(arrearsBroughtIn),
      // One-off payments inside due_this_month — a deferred VAT settlement,
      // a balloon — so a month carrying one can say so.
      lumps_this_month: round2(lumpsThisMonth),
      expected_this_month: round2(
        collectedThisMonth + dueThisMonth + arrearsBroughtIn
      ),
      collected_this_month: round2(collectedThisMonth),
      collected_count: gcMonthLoaded ? gcMonthCount : null,
      // Instructed to the bank but not yet collected. Shown beside the cash,
      // never added to it — a submitted Direct Debit can still fail.
      in_flight_this_month: round2(gcInFlight),
      in_flight_count: gcMonthLoaded ? gcInFlightCount : null,
      collected_from_gocardless: gcMonthLoaded,
      no_mandate: noMandate,
    },
    chart,
    lending,
    attention,
    dd_misses,
    dd_miss_months,
    cashflow,
    recent_activity: recentActivity,
    },
    { headers: NO_CACHE }
  );
}

export async function POST(request: Request) {
  return GET(request);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function formatGbp(n: number) {
  return `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
