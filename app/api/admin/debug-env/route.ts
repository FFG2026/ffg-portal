import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");

  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = process.env.GOCARDLESS_ACCESS_TOKEN || "";

  return NextResponse.json({
    length: token.length,
    first_10_chars: token.slice(0, 10),
    last_10_chars: token.slice(-10),
    contains_newline: token.includes("\n"),
    contains_carriage_return: token.includes("\r"),
    starts_with_live: token.startsWith("live_"),
    chunk_count_if_split_on_newline: token.split("\n").length,
  });
}
