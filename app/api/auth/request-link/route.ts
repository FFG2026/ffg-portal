import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { safeOrigin, sendResendEmail } from "../../../../lib/email";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const rawEmail = String(body?.email || "").trim();
  const origin = safeOrigin(body?.origin);

  if (!rawEmail || !rawEmail.includes("@")) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Only ever send a link to an email we already hold on a customer
  // record. Unknown addresses still get a success response so this
  // endpoint can't be used to probe who is on file.
  const escapedEmail = rawEmail.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
  const { data: customer } = await admin
    .from("customers")
    .select("id, email")
    .ilike("email", escapedEmail)
    .limit(1)
    .maybeSingle();

  if (!customer?.email) {
    return NextResponse.json({ success: true });
  }

  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email: customer.email,
      options: { redirectTo: `${origin}/auth/callback` },
    });

  if (linkError || !linkData?.properties?.hashed_token) {
    return NextResponse.json(
      { error: "Couldn't create a login link — please try again." },
      { status: 500 }
    );
  }

  const tokenHash = linkData.properties.hashed_token;
  const type = linkData.properties.verification_type || "magiclink";
  const loginUrl = `${origin}/auth/callback?token_hash=${encodeURIComponent(
    tokenHash
  )}&type=${encodeURIComponent(type)}`;

  const sent = await sendResendEmail({
    to: customer.email,
    subject: "Your Future FG portal login link",
    text: [
      "Use this link to log in to the Future FG customer portal.",
      "",
      loginUrl,
      "",
      "It expires in a few minutes. If you didn't request this, you can ignore the email.",
    ].join("\n"),
    html: `
      <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;color:#101B2D;">
        <p style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#0E8CF5;font-weight:600;">Future FG</p>
        <h1 style="font-size:22px;margin:8px 0 16px;">Your portal login link</h1>
        <p style="font-size:15px;line-height:1.5;color:#48566B;">
          Click the button below to log in to your customer portal. No password needed.
        </p>
        <p style="margin:28px 0;">
          <a href="${loginUrl}" style="display:inline-block;background:#0E8CF5;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;">
            Log in to your account
          </a>
        </p>
        <p style="font-size:13px;line-height:1.5;color:#7C8AA0;">
          This link expires in a few minutes. If you didn't request it, you can ignore this email.
        </p>
      </div>
    `,
  });

  if (!sent.ok) {
    console.error("Login link email failed:", sent.error);
    return NextResponse.json(
      { error: "Couldn't send the login email — please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
