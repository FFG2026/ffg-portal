import { createAdminClient } from "./supabase/admin";
import { readAdminSession } from "./admin-session";

export function getAdminSecret(request: Request, body?: { secret?: string }) {
  const url = new URL(request.url);
  return (
    url.searchParams.get("secret") ||
    request.headers.get("x-admin-secret") ||
    body?.secret ||
    ""
  );
}

export function isAuthorizedAdmin(secret: string) {
  const expected = process.env.ADMIN_SECRET || "";
  return expected.length > 0 && secret === expected;
}

export async function authorizeAdminRequest(
  request: Request,
  body?: { secret?: string }
) {
  const token = getAdminSecret(request, body);
  if (isAuthorizedAdmin(token)) {
    return { ok: true as const, email: "staff" };
  }
  const session = readAdminSession(token);
  if (!session) return { ok: false as const };
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("admin_users")
    .select("id, email, name")
    .eq("email", session.email)
    .maybeSingle();
  if (!data) return { ok: false as const };
  return { ok: true as const, email: data.email, name: data.name };
}
