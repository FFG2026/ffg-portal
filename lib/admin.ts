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
