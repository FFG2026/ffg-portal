import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { authorizeAdminRequest } from "../../../../lib/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const noStore = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

// GET ?agreement=HP116&as_of=2026-11-16
// Returns every vehicle on the agreement plus a live settlement quote for
// the ones still active.
export async function GET(request: Request) {
  const auth = await authorizeAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const agreementNumber = String(searchParams.get("agreement") || "").trim();
  const asOfRaw = String(searchParams.get("as_of") || "").slice(0, 10);
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(asOfRaw)
    ? asOfRaw
    : new Date().toISOString().slice(0, 10);
  if (!agreementNumber) {
    return NextResponse.json(
      { error: "Missing agreement number." },
      { status: 400, headers: noStore }
    );
  }

  const supabase = createAdminClient();
  const { data: agreement, error: agrErr } = await supabase
    .from("agreements")
    .select("id, agreement_number, monthly_instalment, status")
    .ilike("agreement_number", agreementNumber)
    .maybeSingle();
  if (agrErr) {
    return NextResponse.json({ error: agrErr.message }, { status: 500, headers: noStore });
  }
  if (!agreement) {
    return NextResponse.json({ error: "Agreement not found." }, { status: 404, headers: noStore });
  }

  const { data: vehicles, error: vehErr } = await supabase
    .from("agreement_vehicles")
    .select(
      "registration, description, capital_financed, capital_basis, rental_share, status, settled_date, settled_amount, settled_instalments"
    )
    .eq("agreement_id", agreement.id)
    .order("registration");
  if (vehErr) {
    return NextResponse.json({ error: vehErr.message }, { status: 500, headers: noStore });
  }
  if (!vehicles || vehicles.length === 0) {
    return NextResponse.json(
      { tracked: false, vehicles: [] },
      { headers: noStore }
    );
  }

  const { data: quotes, error: quoteErr } = await supabase.rpc(
    "vehicle_settlement_quote",
    { p_agreement_number: agreement.agreement_number, p_as_of: asOf }
  );
  if (quoteErr) {
    return NextResponse.json({ error: quoteErr.message }, { status: 500, headers: noStore });
  }
  const quoteByReg = new Map<string, any>(
    (quotes || []).map((q: any) => [q.registration, q])
  );

  return NextResponse.json(
    {
      tracked: true,
      agreement_number: agreement.agreement_number,
      agreement_status: agreement.status,
      monthly_instalment: Number(agreement.monthly_instalment || 0),
      as_of: asOf,
      vehicles: vehicles.map((v) => {
        const q = quoteByReg.get(v.registration);
        return {
          registration: v.registration,
          description: v.description,
          capital_basis: v.capital_basis,
          status: v.status,
          rental_share: Number(v.rental_share || 0),
          instalments_remaining: q ? Number(q.instalments_remaining) : 0,
          settlement_figure: q ? Number(q.settlement_figure) : 0,
          settled_date: v.settled_date,
          settled_amount: v.settled_amount == null ? null : Number(v.settled_amount),
          settled_instalments: v.settled_instalments,
        };
      }),
    },
    { headers: noStore }
  );
}

// POST { agreement_number, registrations: [...], amount?, settled_date, note? }
// Settles the ticked vehicles in one transaction (database function).
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const auth = await authorizeAdminRequest(request, body);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agreementNumber = String(body.agreement_number || "").trim();
  const registrations: string[] = Array.isArray(body.registrations)
    ? body.registrations.map((r: unknown) => String(r).trim()).filter(Boolean)
    : [];
  const settledDate = String(body.settled_date || "").slice(0, 10);
  const note = String(body.note || "").trim();
  const amountRaw = body.amount;
  const amount =
    amountRaw === undefined || amountRaw === null || amountRaw === ""
      ? null
      : Number(amountRaw);

  if (!agreementNumber) {
    return NextResponse.json({ error: "Missing agreement number." }, { status: 400, headers: noStore });
  }
  if (registrations.length === 0) {
    return NextResponse.json({ error: "Tick at least one vehicle." }, { status: 400, headers: noStore });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(settledDate)) {
    return NextResponse.json({ error: "Pick the settlement date." }, { status: 400, headers: noStore });
  }
  if (amount !== null && !(amount > 0)) {
    return NextResponse.json({ error: "Amount must be greater than zero." }, { status: 400, headers: noStore });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("settle_vehicles", {
    p_agreement_number: agreementNumber,
    p_registrations: registrations,
    p_amount: amount,
    p_settled_date: settledDate,
    p_note: note || null,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400, headers: noStore });
  }
  const r = Array.isArray(data) ? data[0] : data;
  if (!r) {
    return NextResponse.json({ error: "Settlement returned nothing." }, { status: 500, headers: noStore });
  }

  return NextResponse.json(
    {
      success: true,
      agreement_number: r.out_agreement_number,
      vehicles: r.out_vehicles,
      figure: Number(r.out_figure),
      amount: Number(r.out_amount),
      difference: Number(r.out_difference),
      instalments: r.out_instalments,
      old_monthly: Number(r.out_old_monthly),
      new_monthly: Number(r.out_new_monthly),
      next_due: r.out_next_due,
      agreement_status: r.out_agreement_status,
    },
    { headers: noStore }
  );
}
