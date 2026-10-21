import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { authorizeAdminRequest } from "../../../../lib/admin";
import { bookFromRequest } from "../../../../lib/admin-book";
import { createDeal } from "../../../../lib/create-deal";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const auth = await authorizeAdminRequest(request, body);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const book = bookFromRequest(request, body);
  const result = await createDeal(createAdminClient(), body, book);
  if (!result.ok) {
    return NextResponse.json(
      result.agreement
        ? { error: result.error, agreement: result.agreement }
        : { error: result.error },
      { status: result.status }
    );
  }

  return NextResponse.json({
    success: true,
    agreement_number: result.agreement_number,
    customer_id: result.customer_id,
    instalments: result.instalments,
    gocardless_mandate_id: result.gocardless_mandate_id,
    mandate_source: result.mandate_source,
  });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  const auth = await authorizeAdminRequest(request, body);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const agreementNumber = String(body.agreement_number || "").trim();
  if (!agreementNumber) {
    return NextResponse.json({ error: "Agreement number is required." }, { status: 400 });
  }
  try {
    const { updateAgreementFromFields } = await import("../../../../lib/admin-deal");
    const result = await updateAgreementFromFields(
      createAdminClient(),
      agreementNumber,
      body
    );
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Could not save changes" },
      { status: 400 }
    );
  }
}
