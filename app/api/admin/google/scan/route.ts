import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { authorizeAdminRequest } from "../../../../../lib/admin";
import { scanDealFolders } from "../../../../../lib/google/drive";
import { setSetting } from "../../../../../lib/google/settings";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const auth = await authorizeAdminRequest(request, body);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = createAdminClient();
  const folderId = String(body.agreements_folder_id || "").trim();
  if (folderId) {
    await setSetting(supabase, "google_agreements_folder_id", folderId);
  }
  try {
    const result = await scanDealFolders(supabase);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Could not scan Google Drive" },
      { status: 500 }
    );
  }
}
