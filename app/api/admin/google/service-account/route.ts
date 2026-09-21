import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { authorizeAdminRequest } from "../../../../../lib/admin";
import { parseServiceAccountJson } from "../../../../../lib/google/service-account";
import { setSetting } from "../../../../../lib/google/settings";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const auth = await authorizeAdminRequest(request, body);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const json = String(body.json || "");
  const parsed = parseServiceAccountJson(json);
  if (!parsed) {
    return NextResponse.json(
      {
        error:
          json.trim().length < 200
            ? "That is too short. Copy the whole JSON from DCF — it is usually a few thousand characters and starts with { \"type\": \"service_account\"."
            : "That did not look like a Google service account JSON. It must include client_email and private_key.",
      },
      { status: 400 }
    );
  }
  const supabase = createAdminClient();
  await setSetting(supabase, "google_service_account_json", json.trim());
  await setSetting(supabase, "google_connected_email", parsed.client_email);
  return NextResponse.json({ email: parsed.client_email });
}
