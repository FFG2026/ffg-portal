import { createSign } from "crypto";
import { DRIVE_READONLY_SCOPE, GOOGLE_TOKEN_URL } from "./oauth";

export type ServiceAccount = {
  client_email: string;
  private_key: string;
};

export function parseServiceAccountJson(raw: string): ServiceAccount | null {
  let text = String(raw || "").trim().replace(/^\uFEFF/, "");
  if (!text) return null;
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    text = text.slice(1, -1).trim();
  }
  const parsed = parseJsonObject(text);
  if (!parsed) return null;
  const email = String(parsed.client_email || "").trim();
  let key = String(parsed.private_key || "");
  key = key.replace(/\\n/g, "\n");
  if (!email || !key.includes("BEGIN")) return null;
  return { client_email: email, private_key: key };
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(text);
    if (value && typeof value === "object") return value as Record<string, unknown>;
  } catch {
    // Vercel sometimes stores the key with real line breaks inside private_key.
  }
  try {
    const repaired = text.replace(
      /"private_key"\s*:\s*"([\s\S]*?)"\s*(,|\})/,
      (_all, key: string, tail: string) => {
        const escaped = String(key).replace(/\r?\n/g, "\\n").replace(/"/g, '\\"');
        return `"private_key":"${escaped}"${tail}`;
      }
    );
    const value = JSON.parse(repaired);
    if (value && typeof value === "object") return value as Record<string, unknown>;
  } catch {
    return null;
  }
  return null;
}

export function inspectServiceAccountEnv() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "";
  const parsed = parseServiceAccountJson(raw);
  return {
    present: raw.trim().length > 0,
    valid: Boolean(parsed),
    email: parsed?.client_email || null,
    length: raw.trim().length,
  };
}

export function serviceAccountFromEnv() {
  return parseServiceAccountJson(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "");
}

export async function accessTokenFromServiceAccount(account: ServiceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" })
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: account.client_email,
      scope: DRIVE_READONLY_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat: now,
      exp: now + 3600,
    })
  ).toString("base64url");
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  const jwt = `${header}.${payload}.${signer.sign(account.private_key, "base64url")}`;

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(
      json.error_description || json.error || "Google service account token failed"
    );
  }
  return String(json.access_token);
}
