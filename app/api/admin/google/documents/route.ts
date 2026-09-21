import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { authorizeAdminRequest } from "../../../../../lib/admin";
import { fileKind, filesForAgreement, isDriveConnected } from "../../../../../lib/google/drive";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(request: Request) {
  const auth = await authorizeAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const agreementNumber = new URL(request.url).searchParams.get("agreement");
  if (!agreementNumber) {
    return NextResponse.json({ error: "Provide ?agreement=" }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!(await isDriveConnected(supabase))) {
    return NextResponse.json({
      connected: false,
      folder: null,
      files: [],
    });
  }

  const { data: agreement, error } = await supabase
    .from("agreements")
    .select("agreement_number, google_folder_id, google_folder_name")
    .ilike("agreement_number", agreementNumber.trim())
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!agreement) {
    return NextResponse.json({ error: "Agreement not found" }, { status: 404 });
  }

  try {
    const result = await filesForAgreement(supabase, agreement);
    return NextResponse.json({
      ...result,
      files: result.files.map((file) => ({
        id: file.id,
        name: file.name,
        kind: fileKind(file.mimeType),
        modified: file.modifiedTime || null,
        url:
          file.webViewLink ||
          `https://drive.google.com/file/d/${file.id}/view`,
      })),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Could not read Google Drive" },
      { status: 500 }
    );
  }
}
