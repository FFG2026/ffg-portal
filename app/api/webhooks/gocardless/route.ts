import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { fetchGoCardlessPayment } from "../../../../lib/gocardless/client";
import { syncAgreementPayments } from "../../../../lib/gocardless/sync-payments";
import { parseAgreementRefFromPayment } from "../../../../lib/gocardless/parse-ref";

const PAYMENT_ACTIONS = new Set([
  "confirmed",
  "paid_out",
  "failed",
  "charged_back",
  "cancelled",
]);

function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.GOCARDLESS_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("Webhook-Signature");

  if (!verifySignature(rawBody, signature)) {
    // A rejected delivery used to leave no trace anywhere, which made a wrong
    // secret look identical to no webhook at all. Say so in the logs.
    console.warn(
      "[gocardless-webhook] rejected delivery:",
      !process.env.GOCARDLESS_WEBHOOK_SECRET
        ? "GOCARDLESS_WEBHOOK_SECRET is not set"
        : !signature
          ? "no Webhook-Signature header — is this really GoCardless?"
          : "signature did not match GOCARDLESS_WEBHOOK_SECRET"
    );
    return NextResponse.json({ error: "Invalid signature" }, { status: 498 });
  }

  let body: { events?: any[] };
  try {
    body = JSON.parse(rawBody);
  } catch {
    // Signed but unreadable. 400 so GoCardless stops retrying it forever.
    console.error("[gocardless-webhook] signed body was not valid JSON");
    return NextResponse.json({ error: "Malformed body" }, { status: 400 });
  }
  const events = body.events || [];
  const supabase = createAdminClient();

  for (const event of events) {
    let matchStatus: "matched" | "unmatched" | "error" = "unmatched";
    let matchedPaymentId: string | null = null;
    let gcPaymentId: string | null = null;
    let gcMandateId: string | null = null;

    try {
      if (
        event.resource_type === "payments" &&
        PAYMENT_ACTIONS.has(event.action)
      ) {
        gcPaymentId = event.links?.payment || null;

        if (gcPaymentId) {
          const gcPayment = await fetchGoCardlessPayment(gcPaymentId);
          gcMandateId = gcPayment?.links?.mandate || null;
          const ref = parseAgreementRefFromPayment({
            description: gcPayment?.description,
            reference: gcPayment?.reference,
            metadata: gcPayment?.metadata,
          });

          let agreement = null;
          if (ref?.agreement_number) {
            const found = await supabase
              .from("agreements")
              .select("id, agreement_number, gocardless_mandate_id")
              .ilike("agreement_number", ref.agreement_number)
              .maybeSingle();
            agreement = found.data;
          }
          if (!agreement && gcMandateId) {
            // One customer can run several agreements off one mandate, so this
            // can return more than one row. maybeSingle() treats that as an
            // error; take the rows and only act when the mandate is
            // unambiguous. An unlabelled payment on a shared mandate is left
            // unmatched on purpose — the same rule the pull sync applies.
            const found = await supabase
              .from("agreements")
              .select("id, agreement_number, gocardless_mandate_id")
              .eq("gocardless_mandate_id", gcMandateId)
              .limit(2);
            agreement = found.data?.length === 1 ? found.data[0] : null;
          }

          if (agreement && gcPayment) {
            const result = await syncAgreementPayments(supabase, agreement, [
              gcPayment,
            ]);
            if ((result.markedPaid || result.markedFailed) && !result.error) {
              matchStatus = "matched";
            }
            if (result.error) matchStatus = "error";
          }
        }
      }
    } catch {
      matchStatus = "error";
    }

    await supabase.from("gocardless_events").insert({
      gc_event_id: event.id,
      resource_type: event.resource_type,
      action: event.action,
      gc_payment_id: gcPaymentId,
      gc_mandate_id: gcMandateId,
      matched_payment_id: matchedPaymentId,
      match_status: matchStatus,
      raw_payload: event,
    });
  }

  return NextResponse.json({ received: true });
}
