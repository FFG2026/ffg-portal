import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");

  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: agreements, error } = await supabase
    .from("agreements")
    .select("agreement_number, customer_id, asset_description, term_months")
    .or(
      "asset_description.is.null,asset_description.eq.,asset_description.ilike.Pending%"
    )
    .order("agreement_number");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: payments } = await supabase
    .from("payments")
    .select("agreement_id, status")
    .eq("status", "paid");

  const { data: allAgreements } = await supabase
    .from("agreements")
    .select("id, agreement_number");

  const idByNumber = new Map(
    (allAgreements || []).map((a) => [a.agreement_number, a.id])
  );

  const paidCountByAgreementId = new Map<string, number>();
  for (const p of payments || []) {
    paidCountByAgreementId.set(
      p.agreement_id,
      (paidCountByAgreementId.get(p.agreement_id) || 0) + 1
    );
  }

  const customerIds = Array.from(
    new Set((agreements || []).map((a) => a.customer_id))
  );

  const { data: customers } = await supabase
    .from("customers")
    .select("id, company_name")
    .in("id", customerIds);

  const nameById = new Map((customers || []).map((c) => [c.id, c.company_name]));

  const missing = (agreements || []).map((a) => {
    const agreementId = idByNumber.get(a.agreement_number);
    const paidCount = agreementId
      ? paidCountByAgreementId.get(agreementId) || 0
      : 0;
    const isLive = a.term_months ? paidCount < a.term_months : true;

    return {
      agreement_number: a.agreement_number,
      company_name: nameById.get(a.customer_id) || "(unknown)",
      paid: paidCount,
      term: a.term_months,
      live: isLive,
    };
  });

  return NextResponse.json(
    {
      summary: {
        total_missing: missing.length,
        live: missing.filter((m) => m.live).length,
        finished: missing.filter((m) => !m.live).length,
      },
      missing_live: missing.filter((m) => m.live),
      missing_finished: missing.filter((m) => !m.live),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
