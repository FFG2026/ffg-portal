import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import {
  signAdminSession,
  verifyPassword,
} from "../../../../lib/admin-session";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!email || !password) {
    return NextResponse.json(
      { error: "Enter your email and password." },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const { data: user, error } = await supabase
    .from("admin_users")
    .select("id, email, name, password_hash")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!user || !verifyPassword(password, user.password_hash)) {
    return NextResponse.json(
      { error: "That email or password didn't match." },
      { status: 401 }
    );
  }

  return NextResponse.json({
    token: signAdminSession(user.email),
    email: user.email,
    name: user.name,
  });
}
