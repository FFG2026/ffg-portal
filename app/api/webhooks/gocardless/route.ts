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

  const body =
