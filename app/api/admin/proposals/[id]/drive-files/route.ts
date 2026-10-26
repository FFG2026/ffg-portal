import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../../../lib/supabase/admin";
import { authorizeAdminRequest } from "../../../../../../lib/admin";
import { getProposal, ProposalError } from "../../../../../../lib/proposals/service";
import { driveAccessToken, listDriveChildren, fileKind } from "../../../../../../lib/google/drive";
import { folderIdFromLink } from "../../../../../../lib/proposals/documents/read-invoice";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const NO_CACHE = { "Cache-Control": "no-store, max-age=0" };
const FOLDER = "application/vnd.google-apps.folder";

// Everything currently in the proposal's Drive folder (and one level of sub-folders).
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const auth = await authorizeAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_CACHE });
  }
  try {
    const supabase = createAdminClient();
    const p = await getProposal(supabase, params.id);
    const folderId = folderIdFromLink(p.extras?.drive_folder_link);
    if (!folderId) {
      return NextResponse.json({ files: [] }, { headers: NO_CACHE });
    }
    const token = await driveAccessToken(supabase);
    const top = await listDriveChildren(token, folderId);
    const rows: { name: string; kind: string; modified: string | null; url: string | null; folder: string | null }[] = [];
    const add = (files: typeof top, folder: string | null) => {
      for (const f of files) {
        if (f.mimeType === FOLDER) continue;
        rows.push({
          name: f.name,
          kind: fileKind(f.mimeType),
          modified: f.modifiedTime || f.createdTime || null,
          url: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
          folder,
        });
      }
    };
    add(top, null);
    for (const sub of top.filter((f) => f.mimeType === FOLDER).slice(0, 10)) {
      add(await listDriveChildren(token, sub.id).catch(() => []), sub.name);
    }
    rows.sort((a, b) => String(b.modified || "").localeCompare(String(a.modified || "")));
    return NextResponse.json({ files: rows }, { headers: NO_CACHE });
  } catch (err: any) {
    const status = err instanceof ProposalError ? err.status : 500;
    return NextResponse.json({ error: err.message }, { status, headers: NO_CACHE });
  }
}
