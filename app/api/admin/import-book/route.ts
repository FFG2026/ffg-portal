import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { authorizeAdminRequest } from "../../../../lib/admin";
import { parseWorkbookSheets, type SheetDeal } from "../../../../lib/spreadsheet";
import { importDealBook } from "../../../../lib/import-book";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isDeal(row: any): row is SheetDeal {
  return (
    row &&
    typeof row.agreement_number === "string" &&
    Array.isArray(row.payments) &&
    row.payments.length > 0
  );
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const auth = await authorizeAdminRequest(request, body);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let deals: SheetDeal[] = [];
  if (Array.isArray(body.deals)) {
    deals = body.deals.filter(isDeal);
  } else if (body.sheets && typeof body.sheets === "object") {
    deals = parseWorkbookSheets(body.sheets);
  }

  if (deals.length === 0) {
    return NextResponse.json(
      { error: "No agreement tabs with a payment schedule were found." },
      { status: 400 }
    );
  }

  const apply = body.apply === true;
  const supabase = createAdminClient();
  const summary = await importDealBook(supabase, deals, { apply });
  return NextResponse.json({
    success: true,
    apply,
    deal_count: deals.length,
    ...summary,
  });
}
