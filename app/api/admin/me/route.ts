import { NextResponse } from "next/server";
import { authorizeAdminRequest } from "../../../../lib/admin";
import { isOwenBrunning } from "../../../../lib/owen";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(request: Request) {
  const auth = await authorizeAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    email: auth.email,
    name: "name" in auth ? auth.name : null,
    owner_dashboard: isOwenBrunning({
      email: auth.email,
      name: "name" in auth ? auth.name : null,
    }),
  });
}
