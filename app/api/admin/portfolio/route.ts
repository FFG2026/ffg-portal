import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { fetchAllRows } from "../../../../lib/supabase/fetch-all";
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

async function liveFigures(cashOverride?: number | null) {
  const supabase = createAdminClient();
  const [agreements, payments, savedCash] = await Promise.all([
    fetchAllRows(() =>
      supabase
        .from("agreements")
        .select(
          "id, agreement_number, agreement_type, total_lend, commission, monthly_instalment, term_months"
        )
    ),
    fetchAllRows(() =>
      supabase.from("payments").select("agreement_id, amount, status")
    ),
    getSetting(supabase, CASH_AT_BANK_SETTING),
  ]);

  const rowsByAgreement = new Map<string, typeof payments>();
  for (const p of payments || []) {
    const list = rowsByAgreement.get(p.agreement_id) || [];
    list.push(p);
    rowsByAgreement.set(p.agreement_id, list);
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
      : parseCashAtBank(savedCash) ?? PORTFOLIO_BASE.cash_at_bank;

  return buildLivePortfolio(deals, { cashAtBank });
}

export async function GET(request: Request) {
  const gate = await requireOwen(request);
  if (gate.error) return gate.error;
  try {
    return NextResponse.json(await liveFigures(), { headers: NO_CACHE });
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
    const supabase = createAdminClient();
    await setSetting(supabase, CASH_AT_BANK_SETTING, String(cash));
    return NextResponse.json(await liveFigures(cash), { headers: NO_CACHE });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Could not save cash at bank" },
      { status: 500 }
    );
  }
}
