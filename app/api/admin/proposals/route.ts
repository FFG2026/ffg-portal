import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { authorizeAdminRequest } from "../../../../lib/admin";
import { ingestEmail, ProposalError } from "../../../../lib/proposals/service";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const NO_CACHE = { "Cache-Control": "no-store, max-age=0" };

export async function GET(request: Request) {
  const auth = await authorizeAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_CACHE });
  }
  const { data, error } = await createAdminClient()
    .from("ffg_proposals")
    .select(
      "id, created_at, status, company_name, asset_description, product_type, cash_price, financed, term_months, quoted_rate_pct, quoted_monthly, agreed_rate_pct, agreed_monthly, rep_name, agreement_number, uw_decision"
    )
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE });
  }
  return NextResponse.json({ proposals: data || [] }, { headers: NO_CACHE });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const auth = await authorizeAdminRequest(request, body);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_CACHE });
  }
  try {
    const result = await ingestEmail(createAdminClient(), auth.name || auth.email, {
      filename: body.filename,
      contentBase64: body.contentBase64,
      text: body.text,
    });
    return NextResponse.json({ success: true, ...result }, { headers: NO_CACHE });
  } catch (err: any) {
    const status = err instanceof ProposalError ? err.status : 500;
    return NextResponse.json({ error: err.message || "Could not read that email." }, { status, headers: NO_CACHE });
  }
}
