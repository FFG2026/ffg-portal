import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";

const GC_API_BASE = "https://api.gocardless.com";
const GC_VERSION = "2015-07-06";

// Events that mean "this instalment is settled, one way or another"
const PAID_ACTIONS = new Set(["confirmed", "paid_out"]);
const FAILED_ACTIONS = new Set(["failed", "charged_back", "cancelled"]);

function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.GOCARDLESS_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

async function fetchGoCardlessPayment(paymentId: string) {
  const res = await fetch(`${GC_API_BASE}/payments/${paymentId}`, {
    headers: {
      Authorization: `Bearer ${process.env.GOCARDLESS_ACCESS_TOKEN}`,
      "GoCardless-Version": GC_VERSION,
      Accept: "application/json",
    },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.payments;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("Webhook-Signature");

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 498 });
  }

  const body = JSON.parse(rawBody);
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
        (PAID_ACTIONS.has(event.action) || FAILED_ACTIONS.has(event.action))
      ) {
        gcPaymentId = event.links?.payment || null;

        if (gcPaymentId) {
          const gcPayment = await fetchGoCardlessPayment(gcPaymentId);

          if (gcPayment) {
            gcMandateId = gcPayment.links?.mandate || null;
            const chargeDate: string | null = gcPayment.charge_date || null;

            if (gcMandateId && chargeDate) {
              const { data: agreement } = await supabase
                .from("agreements")
                .select("id")
                .eq("gocardless_mandate_id", gcMandateId)
                .single();

              if (agreement) {
                const chargeDateObj = new Date(chargeDate);
                const windowStart = new Date(chargeDateObj);
                windowStart.setDate(windowStart.getDate() - 10);
                const windowEnd = new Date(chargeDateObj);
                windowEnd.setDate(windowEnd.getDate() + 10);

                const { data: candidates } = await supabase
                  .from("payments")
                  .select("id, due_date, status")
                  .eq("agreement_id", agreement.id)
                  .gte("due_date", windowStart.toISOString().slice(0, 10))
                  .lte("due_date", windowEnd.toISOString().slice(0, 10))
                  .neq("status", "paid")
                  .order("due_date", { ascending: true })
                  .limit(1);

                const candidate = candidates?.[0];

                if (candidate) {
                  const newStatus = PAID_ACTIONS.has(event.action)
                    ? "paid"
                    : "failed";

                  await supabase
                    .from("payments")
