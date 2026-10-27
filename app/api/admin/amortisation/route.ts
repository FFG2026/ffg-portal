import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { fetchAllIn } from "../../../../lib/supabase/fetch-all";
import { authorizeAdminRequest } from "../../../../lib/admin";
import { buildAmortisation } from "../../../../lib/amortisation";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const noStore = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

// GET ?agreement=HP146
// Amortisation chart rebuilt from the deal's live payment rows and vehicle
// rows, so an early settlement shows up the next time it is read.
export async function GET(request: Request) {
  const auth = await authorizeAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const agreementNumber = String(searchParams.get("agreement") || "").trim();
  if (!agreementNumber) {
    return NextResponse.json(
      { error: "Missing agreement number." },
      { status: 400, headers: noStore }
    );
  }

  const supabase = createAdminClient();
  const { data: agreement, error } = await supabase
    .from("agreements")
    .select("id, agreement_number, agreement_type, total_lend")
    .ilike("agreement_number", agreementNumber)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: noStore });
  }
  if (!agreement) {
    return NextResponse.json({ error: "Agreement not found." }, { status: 404, headers: noStore });
  }

  const [rows, vehiclesRes] = await Promise.all([
    fetchAllIn(
      (chunk) =>
        supabase
          .from("payments")
          .select("id, agreement_id, instalment_number, due_date, amount, status")
          .in("agreement_id", chunk),
      [agreement.id]
    ),
    supabase
      .from("agreement_vehicles")
      .select(
        "registration, capital_financed, rental_share, status, settled_date, settled_amount, settlement_payment_id"
      )
      .eq("agreement_id", agreement.id),
  ]);
  if (vehiclesRes.error) {
    return NextResponse.json({ error: vehiclesRes.error.message }, { status: 500, headers: noStore });
  }

  const chart = buildAmortisation({
    agreementType: agreement.agreement_type,
    totalLend: Number(agreement.total_lend || 0),
    rows: (rows || []).map((r: any) => ({
      id: r.id,
      instalment_number: Number(r.instalment_number),
      due_date: String(r.due_date).slice(0, 10),
      amount: Number(r.amount || 0),
      status: String(r.status || ""),
    })),
    vehicles: (vehiclesRes.data || []).map((v: any) => ({
      registration: v.registration,
      capital_financed: Number(v.capital_financed || 0),
      rental_share: Number(v.rental_share || 0),
      status: v.status,
      settled_date: v.settled_date,
      settled_amount: v.settled_amount == null ? null : Number(v.settled_amount),
      settlement_payment_id: v.settlement_payment_id,
    })),
  });

  return NextResponse.json(
    { agreement_number: agreement.agreement_number, chart },
    { headers: noStore }
  );
}
