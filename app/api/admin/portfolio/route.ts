import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { fetchAllRows } from "../../../../lib/supabase/fetch-all";
import { authorizeAdminRequest } from "../../../../lib/admin";
import { isOwenBrunning } from "../../../../lib/owen";
import {
  buildLivePortfolio,
  isDealAddedAfterSnapshot,
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

export async function GET(request: Request) {
  const auth = await authorizeAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (
    !isOwenBrunning({
      email: auth.email,
      name: "name" in auth ? auth.name : null,
    })
  ) {
    return NextResponse.json(
      { error: "This figures page is only for Owen Brunning." },
      { status: 403 }
    );
  }

  const supabase = createAdminClient();
  let agreements;
  let payments;
  try {
    [agreements, payments] = await Promise.all([
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
    ]);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Could not load figures" },
      { status: 500 }
    );
  }

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

  return NextResponse.json(buildLivePortfolio(deals), { headers: NO_CACHE });
}

export async function POST(request: Request) {
  return GET(request);
}
