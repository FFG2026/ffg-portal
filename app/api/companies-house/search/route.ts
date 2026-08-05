import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");

  if (!q || q.trim().length < 2) {
    return NextResponse.json({ items: [] });
  }

  const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Companies House API key not configured" },
      { status: 500 }
    );
  }

  // Companies House uses HTTP Basic auth with the API key as the
  // username and an empty password.
  const authHeader = "Basic " + Buffer.from(`${apiKey}:`).toString("base64");

  const url = `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(
    q.trim()
  )}&items_per_page=6`;

  const res = await fetch(url, {
    headers: { Authorization: authHeader },
    cache: "no-store",
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: `Companies House lookup failed (${res.status})` },
      { status: 502 }
    );
  }

  const data = await res.json();

  const items = (data.items || []).map((item: any) => ({
    name: item.title,
    number: item.company_number,
    status: item.company_status,
    address: item.address_snippet || null,
  }));

  return NextResponse.json({ items });
}
