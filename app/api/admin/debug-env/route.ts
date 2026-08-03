import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");

  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = process.env.GOCARDLESS_ACCESS_TOKEN || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const webhookSecret = process.env.GOCARDLESS_WEBHOOK_SECRET || "";

  function inspect(name: string, value: string) {
    return {
      name,
      length: value.length,
      first_10_chars: value.slice(0, 10),
      last_10_chars: value.slice(-10),
      contains_newline: value.includes("\n"),
      chunk_count_if_split_on_newline: value.split("\n").length,
    };
  }

  return NextResponse.json({
    gocardless_access_token: inspect("GOCARDLESS_ACCESS_TOKEN", token),
    supabase_service_role_key: inspect("SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey),
    gocardless_webhook_secret: inspect("GOCARDLESS_WEBHOOK_SECRET", webhookSecret),
  });
}
