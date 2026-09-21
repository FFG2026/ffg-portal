import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { authorizeAdminRequest } from "../../../../../lib/admin";
import { deleteSetting } from "../../../../../lib/google/settings";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function POST(request: Request) {
  const auth = await authorizeAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = createAdminClient();
  await deleteSetting(supabase, "google_refresh_token");
  await deleteSetting(supabase, "google_connected_email");
  return NextResponse.json({ ok: true });
}
