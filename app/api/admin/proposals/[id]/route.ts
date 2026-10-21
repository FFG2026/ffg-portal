import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { authorizeAdminRequest } from "../../../../../lib/admin";
import { applyAction, getProposal, ProposalError } from "../../../../../lib/proposals/service";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const NO_CACHE = { "Cache-Control": "no-store, max-age=0" };

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authorizeAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_CACHE });
  }
  try {
    const supabase = createAdminClient();
    const proposal = await getProposal(supabase, params.id);
    const { data: events } = await supabase
      .from("ffg_proposal_events")
      .select("id, created_at, actor, kind, detail")
      .eq("proposal_id", params.id)
      .order("created_at", { ascending: true });
    // raw_text is long and only useful on request
    const { raw_text, ...rest } = proposal;
    return NextResponse.json(
      { proposal: rest, has_raw_text: !!raw_text, events: events || [] },
      { headers: NO_CACHE }
    );
  } catch (err: any) {
    const status = err instanceof ProposalError ? err.status : 500;
    return NextResponse.json({ error: err.message }, { status, headers: NO_CACHE });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = await request.json().catch(() => ({}));
  const auth = await authorizeAdminRequest(request, body);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_CACHE });
  }
  try {
    const result = await applyAction(
      createAdminClient(),
      params.id,
      { name: auth.name || "", email: auth.email },
      body
    );
    return NextResponse.json({ success: true, ...result }, { headers: NO_CACHE });
  } catch (err: any) {
    const status = err instanceof ProposalError ? err.status : 500;
    return NextResponse.json({ error: err.message || "Something went wrong." }, { status, headers: NO_CACHE });
  }
}
