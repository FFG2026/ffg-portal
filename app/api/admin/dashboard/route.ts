import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { fetchAllRows } from "../../../../lib/supabase/fetch-all";
import { bookFromRequest } from "../../../../lib/admin-book";
import { authorizeAdminRequest } from "../../../../lib/admin";
import {
  isLiveDeal,
  liveOverdueSum,
  isPaidRow,
  unpaidSum,
  overdueSum,
} from "../../../../lib/deal-status";
import { fetchGoCardlessPaymentsChargedBetween } from "../../../../lib/gocardless/client";
import { collectedPoundsFromGoCardlessPayments } from "../../../../lib/gocardless/match-payments";
import { applyGoCardlessCollections } from "../../../../lib/gocardless/sync-payments";

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

  let agreements;
  let payments;
  let customers;
  let gcCollectedThisMonth = 0;
  try {
    [agreements, customers] = await Promise.all([
      fetchAllRows(() =>
        supabase
          .from("agreements")
          .select(
            "id, agreement_number, agreement_type, customer_id, asset_description, monthly_instalment, term_months, start_date, gocardless_mandate_id, total_lend, status, book"
          )
          .eq("book", book)
      ),
      fetchAllRows(() => supabase.from("customers").select("id, company_name")),
    ]);

    if (book === "ffg" && process.env.GOCARDLESS_ACCESS_TOKEN) {
      try {
        const gcMonth = await fetchGoCardlessPaymentsChargedBetween(
          monthStart,
          nextMonth
        );
        gcCollectedThisMonth = collectedPoundsFromGoCardlessPayments(gcMonth);
        await applyGoCardlessCollections(supabase, agreements || [], gcMonth);
      } catch {
        // Book figures still load if GoCardless is down.
      }
    }

    const ids = (agreements || []).map((a) => a.id);
    payments = ids.length
      ? await fetchAllRows(() =>
          supabase
            .from("payments")
            .select("agreement_id, amount, status, due_date, paid_date, source")
            .in("agreement_id", ids)
            .order("id")
        )
      : [];
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

  const liveById = new Map<string, boolean>();
  for (const a of agreements || []) {
    const rows = paymentsByAgreement.get(a.id) || [];
    liveById.set(a.id, isLiveDeal(a, rows));
  }

  let paidTotal = 0;
  let outstanding = 0;
  let overdue = 0;
  let dueThisMonth = 0;
  let collectedThisMonth = 0;
  let manualThisMonth = 0;
  const monthMap = new Map<string, { paid: number; unpaid: number }>();

  for (const p of payments || []) {
    const amount = num(p.amount);
    const dueMonth = String(p.due_date).slice(0, 7);
    if (!monthMap.has(dueMonth)) monthMap.set(dueMonth, { paid: 0, unpaid: 0 });
    const bucket = monthMap.get(dueMonth)!;
    if (isPaidRow(p.status)) {
      paidTotal += amount;
      bucket.paid += amount;
      const collectedOn = (p.paid_date || p.due_date || "").slice(0, 10);
      if (collectedOn >= monthStart && collectedOn < nextMonth) {
        collectedThisMonth += amount;
        if (String((p as { source?: string }).source || "") === "manual") {
          manualThisMonth += amount;
        }
      }
    } else if (liveById.get(p.agreement_id) !== false) {
      bucket.unpaid += amount;
      if (p.due_date && p.due_date >= monthStart && p.due_date < nextMonth) {
        dueThisMonth += amount;
      }
    }
  }
  collectedThisMonth = round2(
    book === "gg"
      ? collectedThisMonth
      : Math.max(collectedThisMonth, gcCollectedThisMonth + manualThisMonth)
  );

  for (const a of agreements || []) {
    if (liveById.get(a.id) === false) continue;
    const rows = paymentsByAgreement.get(a.id) || [];
    const od = overdueSum(rows, today);
    overdue += od;
    outstanding += unpaidSum(rows) - od;
  }

  const chartMonths: string[] = [];
  const cursor = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 12, 1));
  for (let i = 0; i < 12; i++) {
    chartMonths.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  const chart = chartMonths.map((month) => {
    const b = monthMap.get(month) || { paid: 0, unpaid: 0 };
    return { month, paid: round2(b.paid), unpaid: round2(b.unpaid) };
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
      unpaidSum(rows) > 0 ? liveOverdueSum(a, rows, today) : 0;
    if (isLive && overdueAmt > 0) {
      attention.push({
        agreement_number: a.agreement_number,
        company_name: company,
        reason: "Overdue collections",
        amount: round2(overdueAmt),
      });
    }
    const asset = a.asset_description || "";
    if (isLive && (!asset || asset.startsWith("Pending"))) {
      attention.push({
        agreement_number: a.agreement_number,
        company_name: company,
        reason: "Asset not on file",
        amount: null,
      });
    }
  }

  attention.sort((a, b) => (b.amount || 0) - (a.amount || 0));

  return NextResponse.json(
    {
    generated_at: new Date().toISOString(),
    totals: {
      live,
      finished,
      customers: new Set((agreements || []).map((a) => a.customer_id)).size,
      paid_total: round2(paidTotal),
      outstanding: round2(outstanding),
      overdue: round2(overdue),
      due_this_month: round2(dueThisMonth),
      collected_this_month: round2(collectedThisMonth),
      no_mandate: noMandate,
    },
    chart,
    attention: attention.slice(0, 40),
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
