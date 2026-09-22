import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { bookFromRequest } from "../../../../lib/admin-book";
import { fetchAllIn, fetchAllRows } from "../../../../lib/supabase/fetch-all";
import { authorizeAdminRequest } from "../../../../lib/admin";
import { isOwenBrunning } from "../../../../lib/owen";
import { getSetting, setSetting } from "../../../../lib/google/settings";
import {
  buildLivePortfolio,
  isDealAddedAfterSnapshot,
  parseCashAtBank,
  CASH_AT_BANK_SETTING,
  PORTFOLIO_BASE,
} from "../../../../lib/portfolio-live";
import {
  buildGlacierPortfolio,
  GLACIER_CASH_SETTING,
} from "../../../../lib/glacier-portfolio";
import {
  buildFiguresDashboard,
  deriveMonthlyFigures,
  type DashboardDeal,
} from "../../../../lib/figures-dashboard";
import {
  LATEST_MONTH_KEY,
  MONTHLY_FIGURES,
} from "../../../../lib/monthly-figures";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const NO_CACHE = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
};

async function requireOwen(request: Request, body?: { secret?: string }) {
  const auth = await authorizeAdminRequest(request, body);
  if (!auth.ok) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (
    !isOwenBrunning({
      email: auth.email,
      name: "name" in auth ? auth.name : null,
    })
  ) {
    return {
      error: NextResponse.json(
        { error: "This figures page is only for Owen Brunning." },
        { status: 403 }
      ),
    };
  }
  return { auth };
}

async function liveFigures(
  book: "ffg" | "gg",
  cashOverride?: number | null,
  monthKey?: string
) {
  const supabase = createAdminClient();
  const cashKey = book === "gg" ? GLACIER_CASH_SETTING : CASH_AT_BANK_SETTING;
  const [agreements, savedCash, customers] = await Promise.all([
    fetchAllRows(() =>
      supabase
        .from("agreements")
        .select(
          "id, agreement_number, agreement_type, customer_id, total_lend, commission, monthly_instalment, term_months, start_date, status"
        )
        .eq("book", book)
    ),
    getSetting(supabase, cashKey),
    fetchAllRows(() =>
      supabase.from("customers").select("id, company_name")
    ),
  ]);
  const ids = (agreements || []).map((a) => a.id);
  const payments = await fetchAllIn(
    (chunk) =>
      supabase
        .from("payments")
        .select("agreement_id, amount, status, due_date, paid_date")
        .in("agreement_id", chunk),
    ids
  );

  const rowsByAgreement = new Map<string, typeof payments>();
  for (const p of payments || []) {
    const list = rowsByAgreement.get(p.agreement_id) || [];
    list.push(p);
    rowsByAgreement.set(p.agreement_id, list);
  }

  const nameById = new Map(
    (customers || []).map((c) => [c.id, c.company_name as string])
  );
  const today = new Date().toISOString().slice(0, 10);

  /** Every agreement on this book, with its schedule and customer attached. */
  const dashboardDeals: DashboardDeal[] = (agreements || []).map((a) => ({
    agreement_number: a.agreement_number,
    company_name: nameById.get(a.customer_id) || null,
    status: a.status,
    term_months: a.term_months,
    start_date: a.start_date,
    total_lend: a.total_lend,
    payments: rowsByAgreement.get(a.id) || [],
  }));

  const cashParsed = parseCashAtBank(savedCash);
  if (book === "gg") {
    const cashAtBank = cashOverride != null ? cashOverride : cashParsed ?? 0;
    const deals = (agreements || []).map((a) => ({
      agreement_number: a.agreement_number,
      total_lend: a.total_lend,
      commission: a.commission,
      monthly_instalment: a.monthly_instalment,
      term_months: a.term_months,
      payments: rowsByAgreement.get(a.id) || [],
    }));
    const portfolio = buildGlacierPortfolio(deals, { cashAtBank });
    // Glacier Gem has no curated month-by-month book, so build one from
    // its own rows. It has a single deal type, so the mix donut is left off.
    const ggMonthly = deriveMonthlyFigures(dashboardDeals, today.slice(0, 7));
    return {
      ...portfolio,
      dashboard: buildFiguresDashboard({
        deals: dashboardDeals,
        monthly: ggMonthly,
        monthKey: monthKey || ggMonthly[ggMonthly.length - 1].key,
        today,
        totalBook: portfolio.summary.total_outstanding,
        totalLent: portfolio.summary.total_lent,
        cashAtBank: portfolio.summary.cash_at_bank,
        blendedYield: portfolio.summary.blended_yield,
        byType: [],
      }),
    };
  }

  const deals = (agreements || [])
    .filter((a) => isDealAddedAfterSnapshot(a.agreement_number))
    .map((a) => ({
      agreement_number: a.agreement_number,
      agreement_type: a.agreement_type,
      total_lend: a.total_lend,
      commission: a.commission,
      monthly_instalment: a.monthly_instalment,
      term_months: a.term_months,
      payments: rowsByAgreement.get(a.id) || [],
    }));

  const cashAtBank =
    cashOverride != null
      ? cashOverride
      : cashParsed ?? PORTFOLIO_BASE.cash_at_bank;

  const portfolio = buildLivePortfolio(deals, { cashAtBank });
  return {
    ...portfolio,
    dashboard: buildFiguresDashboard({
      deals: dashboardDeals,
      monthly: MONTHLY_FIGURES,
      monthKey: monthKey || LATEST_MONTH_KEY,
      today,
      totalBook: portfolio.summary.total_outstanding,
      totalLent: portfolio.summary.total_lent,
      cashAtBank: portfolio.summary.cash_at_bank,
      blendedYield: portfolio.summary.blended_yield,
      byType: portfolio.by_type,
    }),
  };
}

/** Only ever a YYYY-MM key from the month picker. */
function monthFromRequest(request: Request, body?: { month?: unknown }) {
  const raw =
    (body && typeof body.month === "string" ? body.month : "") ||
    new URL(request.url).searchParams.get("month") ||
    "";
  return /^\d{4}-\d{2}$/.test(raw) ? raw : undefined;
}

export async function GET(request: Request) {
  const gate = await requireOwen(request);
  if (gate.error) return gate.error;
  try {
    const book = bookFromRequest(request);
    return NextResponse.json(
      await liveFigures(book, null, monthFromRequest(request)),
      { headers: NO_CACHE }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Could not load figures" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (body && Object.prototype.hasOwnProperty.call(body, "cash_at_bank")) {
    return PATCH(
      new Request(request.url, {
        method: "PATCH",
        headers: request.headers,
        body: JSON.stringify(body),
      })
    );
  }
  return GET(request);
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  const gate = await requireOwen(request, body);
  if (gate.error) return gate.error;
  const cash = parseCashAtBank(body.cash_at_bank);
  if (cash == null) {
    return NextResponse.json(
      { error: "Enter a cash at bank amount." },
      { status: 400 }
    );
  }
  try {
    const book = bookFromRequest(request, body);
    const supabase = createAdminClient();
    await setSetting(
      supabase,
      book === "gg" ? GLACIER_CASH_SETTING : CASH_AT_BANK_SETTING,
      String(cash)
    );
    return NextResponse.json(
      await liveFigures(book, cash, monthFromRequest(request, body)),
      { headers: NO_CACHE }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Could not save cash at bank" },
      { status: 500 }
    );
  }
}
