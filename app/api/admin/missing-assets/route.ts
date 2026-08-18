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
    .select("agreement_number, customer_id, asset_description")
    .or("asset_description.is.null,asset_description.eq.")
    .order("agreement_number");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const customerIds = Array.from(
    new Set((agreements || []).map((a) => a.customer_id))
  );

  const { data: customers } = await supabase
    .from("customers")
    .select("id, company_name")
    .in("id", customerIds);

  const nameById = new Map((customers || []).map((c) => [c.id, c.company_name]));

  const missing = (agreements || []).map((a) => ({
    agreement_number: a.agreement_number,
    company_name: nameById.get(a.customer_id) || "(unknown)",
  }));

  return NextResponse.json(
    {
      summary: { total_missing: missing.length },
      missing,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
