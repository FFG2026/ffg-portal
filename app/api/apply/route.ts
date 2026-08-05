import { NextResponse } from "next/server";
import { createAdminClient } from "../../../lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json();

  const {
    amount,
    bizType,
    companyName,
    companyNumber,
    assetType,
    assetDescription,
    assetCondition,
    assetCost,
    contactName,
    contactEmail,
    contactPhone,
  } = body || {};

  // Basic server-side validation -- never trust the client alone.
  if (
    !amount ||
    !companyName ||
    !companyNumber ||
    !assetType ||
    !assetDescription ||
    !contactName ||
    !contactEmail ||
    !contactPhone
  ) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  const { data: enquiry, error: insertErr } = await supabase
    .from("enquiries")
    .insert({
      amount,
      business_type: bizType,
      company_name: companyName,
      company_number: companyNumber,
      asset_type: assetType,
      asset_description: assetDescription,
      asset_condition: assetCondition,
      asset_cost: assetCost,
      contact_name: contactName,
      contact_email: contactEmail,
      contact_phone: contactPhone,
      status: "new",
    })
    .select("id")
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // Email notification via Resend -- best-effort. If this fails, the
  // enquiry is still safely saved in Supabase, so we don't fail the
  // whole request just because the notification email didn't send.
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Future FG Website <noreply@ffg.finance>",
          to: "olb@ffg.finance",
          subject: `New finance application \u2014 ${companyName}`,
          text: [
            `New application received via ffg.finance:`,
            ``,
            `Amount requested: £${Number(amount).toLocaleString("en-GB")}`,
            `Business type: ${bizType === "ltd" ? "Limited Company" : "Sole trader / Partnership"}`,
            `Company: ${companyName} (Company No. ${companyNumber})`,
            ``,
            `Asset type: ${assetType}`,
            `Asset: ${assetDescription} (${assetCondition})`,
            assetCost ? `Cost: £${Number(assetCost).toLocaleString("en-GB")}` : "",
            ``,
            `Contact: ${contactName}`,
            `Email: ${contactEmail}`,
            `Phone: ${contactPhone}`,
            ``,
            `Enquiry ID: ${enquiry.id}`,
          ]
            .filter(Boolean)
            .join("\n"),
        }),
      });
    } catch {
      // Swallow email errors -- the enquiry is already saved.
    }
  }

  return NextResponse.json({ success: true, id: enquiry.id });
}
