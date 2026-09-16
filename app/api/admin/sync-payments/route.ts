import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { syncAgreementsPayments } from "../../../../lib/gocardless/sync-payments";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");

  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: agreements, error } = await supabase
    .from("agreements")
    .select("id, agreement_number, gocardless_mandate_id")
    .not("gocardless_mandate_id", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results = await syncAgreementsPayments(supabase, agreements || []);
  const markedPaid = results.reduce((sum, r) => sum + r.markedPaid, 0);
  const markedFailed = results.reduce((sum, r) => sum + r.markedFailed, 0);
  const errors = results.filter((r) => r.error);

  return NextResponse.json({
    agreements: results.length,
    marked_paid: markedPaid,
    marked_failed: markedFailed,
    errors: errors.map((r) => ({
      agreement_id: r.agreementId,
      error: r.error,
    })),
  });
}
