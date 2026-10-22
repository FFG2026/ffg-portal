import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "../supabase/fetch-all";
import { getSetting, setSetting } from "./settings";
import { parseDealFolderTitle, pickFolderForAgreement } from "./folder-match";
import { DRIVE_WRITE_SCOPE, googleOAuthConfigured, refreshAccessToken } from "./oauth";
import {
  accessTokenFromServiceAccount,
  parseServiceAccountJson,
  serviceAccountFromEnv,
} from "./service-account";
import { GLACIER_GEM_FOLDER_ID, type AdminBook } from "../admin-book";

export const DEFAULT_AGREEMENTS_FOLDER_ID =
  "13pGew1ioaAll792h3sCXfWbAl62rSczv";

const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  createdTime?: string;
  size?: string;
  webViewLink?: string;
};

export async function getRefreshToken(supabase: SupabaseClient) {
  return (
    (await getSetting(supabase, "google_refresh_token")) ||
    process.env.GOOGLE_REFRESH_TOKEN ||
    ""
  );
}

export function driveServiceAccount() {
  return serviceAccountFromEnv();
}

export async function resolveServiceAccount(supabase: SupabaseClient) {
  const fromEnv = serviceAccountFromEnv();
  if (fromEnv) return fromEnv;
  return parseServiceAccountJson(
    await getSetting(supabase, "google_service_account_json")
  );
}

export async function isDriveConnected(supabase: SupabaseClient) {
  if (await resolveServiceAccount(supabase)) return true;
  return Boolean(await getRefreshToken(supabase));
}

export async function getAgreementsFolderId(
  supabase: SupabaseClient,
  book: AdminBook = "ffg"
) {
  if (book === "gg") {
    return (
      (await getSetting(supabase, "google_glacier_gem_folder_id")) ||
      process.env.GOOGLE_GLACIER_GEM_FOLDER_ID ||
      GLACIER_GEM_FOLDER_ID
    );
  }
  return (
    (await getSetting(supabase, "google_agreements_folder_id")) ||
    process.env.GOOGLE_AGREEMENTS_FOLDER_ID ||
    DEFAULT_AGREEMENTS_FOLDER_ID
  );
}

export async function driveAccessToken(
  supabase: SupabaseClient,
  opts: { write?: boolean } = {}
) {
  const service = await resolveServiceAccount(supabase);
  if (service) {
    return accessTokenFromServiceAccount(
      service,
      opts.write ? DRIVE_WRITE_SCOPE : undefined,
      opts.write
        ? (process.env.GOOGLE_DRIVE_IMPERSONATE_EMAIL || "sales@dcfgroup.co.uk").trim()
        : undefined
    );
  }
  if (opts.write) {
    throw new Error(
      "Saving to Drive needs the Google service account (the connected Google login is read-only)."
    );
  }
  const refresh = await getRefreshToken(supabase);
  if (!refresh) {
    throw new Error("Google Drive is not connected.");
  }
  if (!googleOAuthConfigured() && !process.env.GOOGLE_CLIENT_ID) {
    throw new Error(
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET need to be set on the site."
    );
  }
  const tokens = await refreshAccessToken(refresh);
  return tokens.access_token;
}

async function driveGet(accessToken: string, url: URL) {
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error?.message || `Drive request failed (${res.status})`);
  }
  return json;
}

export async function listDriveChildren(
  accessToken: string,
  folderId: string,
  foldersOnly = false
) {
  const files: DriveFile[] = [];
  let pageToken = "";
  while (true) {
    const url = new URL(DRIVE_FILES);
    const clauses = [`'${folderId}' in parents`, "trashed = false"];
    if (foldersOnly) {
      clauses.push("mimeType = 'application/vnd.google-apps.folder'");
    }
    url.searchParams.set("q", clauses.join(" and "));
    url.searchParams.set("pageSize", "1000");
    url.searchParams.set(
      "fields",
      "nextPageToken, files(id,name,mimeType,modifiedTime,createdTime,size,webViewLink)"
    );
    url.searchParams.set("supportsAllDrives", "true");
    url.searchParams.set("includeItemsFromAllDrives", "true");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const json = await driveGet(accessToken, url);
    files.push(...(json.files || []));
    if (!json.nextPageToken) break;
    pageToken = json.nextPageToken;
  }
  return files;
}

export async function downloadDriveFile(accessToken: string, fileId: string) {
  const res = await fetch(
    `${DRIVE_FILES}/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Could not download Drive file (${res.status}) ${body.slice(0, 180)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export async function scanDealFolders(
  supabase: SupabaseClient,
  opts?: { book?: AdminBook; folderId?: string }
) {
  const accessToken = await driveAccessToken(supabase);
  const book = opts?.book || "ffg";
  const folderId = opts?.folderId || (await getAgreementsFolderId(supabase, book));
  const folders = await listDriveChildren(accessToken, folderId, true);

  const agreements = await fetchAllRows(() => {
    let q = supabase
      .from("agreements")
      .select("id, agreement_number, google_folder_id, book");
    if (book) q = q.eq("book", book);
    return q;
  });

  let linked = 0;
  const unmatchedFolders: {
    name: string;
    id: string;
    company: string | null;
    createdTime?: string;
    modifiedTime?: string;
  }[] = [];
  const usedIds = new Set<string>();

  for (const agreement of agreements) {
    const folder = pickFolderForAgreement(agreement.agreement_number, folders);
    if (!folder) continue;
    usedIds.add(folder.id);
    if (agreement.google_folder_id === folder.id) {
      linked += 1;
      continue;
    }
    const { error } = await supabase
      .from("agreements")
      .update({
        google_folder_id: folder.id,
        google_folder_name: folder.name,
      })
      .eq("id", agreement.id);
    if (error) throw error;
    linked += 1;
  }

  for (const folder of folders) {
    if (usedIds.has(folder.id)) continue;
    const parsed = parseDealFolderTitle(folder.name);
    unmatchedFolders.push({
      name: folder.name,
      id: folder.id,
      company: parsed?.company || null,
      createdTime: folder.createdTime,
      modifiedTime: folder.modifiedTime,
    });
  }

  const missingInDrive = agreements
    .filter((a) => {
      const folder = pickFolderForAgreement(a.agreement_number, folders);
      return !folder;
    })
    .map((a) => a.agreement_number);

  await setSetting(supabase, "google_last_scan", new Date().toISOString());

  return {
    folder_count: folders.length,
    linked,
    unmatched_folders: unmatchedFolders.slice(0, 80),
    missing_in_drive: missingInDrive.slice(0, 80),
  };
}

export async function filesForAgreement(
  supabase: SupabaseClient,
  agreement: {
    agreement_number: string;
    google_folder_id?: string | null;
    google_folder_name?: string | null;
  }
) {
  const accessToken = await driveAccessToken(supabase);
  let folderId = agreement.google_folder_id || "";
  let folderName = agreement.google_folder_name || "";
  const book: AdminBook = /^GG/i.test(agreement.agreement_number) ? "gg" : "ffg";

  if (!folderId) {
    const parentId = await getAgreementsFolderId(supabase, book);
    const folders = await listDriveChildren(accessToken, parentId, true);
    const match = pickFolderForAgreement(agreement.agreement_number, folders);
    if (match) {
      folderId = match.id;
      folderName = match.name;
      await supabase
        .from("agreements")
        .update({
          google_folder_id: match.id,
          google_folder_name: match.name,
        })
        .eq("agreement_number", agreement.agreement_number);
    }
  }

  if (!folderId) {
    return {
      connected: true,
      folder: null as null,
      files: [] as DriveFile[],
    };
  }

  const files = await listDriveChildren(accessToken, folderId, false);
  const parsed = parseDealFolderTitle(folderName);
  return {
    connected: true,
    folder: {
      id: folderId,
      name: folderName || "Deal folder",
      company: parsed?.company || null,
      url: `https://drive.google.com/drive/folders/${folderId}`,
    },
    files: files
      .filter((f) => f.mimeType !== "application/vnd.google-apps.folder")
      .sort((a, b) =>
        String(b.modifiedTime || "").localeCompare(String(a.modifiedTime || ""))
      ),
  };
}

export function fileKind(mimeType: string) {
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.startsWith("image/")) return "Image";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) {
    return "Spreadsheet";
  }
  if (mimeType.includes("document") || mimeType.includes("msword")) return "Document";
  if (mimeType.includes("presentation")) return "Presentation";
  return "File";
}

const FOLDER_MIME = "application/vnd.google-apps.folder";

function driveWriteError(status: number, json: any, action: string) {
  const message = json?.error?.message || `Drive request failed (${status})`;
  if (/storage quota|do not have storage/i.test(message)) {
    return new Error(`${action}: ${message} (files must be created as a Workspace user, not the bare service account).`);
  }
  if (status === 403 || status === 404) {
    return new Error(
      `${action}: Google refused (${message}). Share the Future FG agreements folder with the portal's Google service account as an Editor, and check the folder is in a Shared Drive.`
    );
  }
  return new Error(`${action}: ${message}`);
}

/** Makes a folder under `parentId`, or returns the one already there with that name. */
export async function findOrCreateDriveFolder(
  accessToken: string,
  parentId: string,
  name: string
): Promise<{ id: string; link: string }> {
  const find = new URL(DRIVE_FILES);
  find.searchParams.set(
    "q",
    `'${parentId}' in parents and trashed = false and mimeType = '${FOLDER_MIME}' and name = '${name.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`
  );
  find.searchParams.set("fields", "files(id,webViewLink)");
  find.searchParams.set("supportsAllDrives", "true");
  find.searchParams.set("includeItemsFromAllDrives", "true");
  const found = await driveGet(accessToken, find).catch(() => null);
  const hit = found?.files?.[0];
  if (hit) return { id: hit.id, link: hit.webViewLink };

  const res = await fetch(`${DRIVE_FILES}?supportsAllDrives=true&fields=id,webViewLink`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw driveWriteError(res.status, json, "Could not create the Drive folder");
  return { id: json.id, link: json.webViewLink };
}

export async function uploadDriveFile(
  accessToken: string,
  parentId: string,
  name: string,
  mimeType: string,
  bytes: Uint8Array
): Promise<{ id: string; link: string }> {
  const boundary = `ffg_${Date.now().toString(36)}`;
  const meta = JSON.stringify({ name, parents: [parentId] });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    Buffer.from(bytes),
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
      cache: "no-store",
    }
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw driveWriteError(res.status, json, `Could not save ${name} to Drive`);
  return { id: json.id, link: json.webViewLink };
}
