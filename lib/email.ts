const ALLOWED_HOSTS = new Set([
  "ffg.finance",
  "www.ffg.finance",
  "localhost",
  "127.0.0.1",
]);

export function safeOrigin(origin: string | null | undefined): string {
  if (origin) {
    try {
      const url = new URL(origin);
      const httpLocal =
        url.protocol === "http:" &&
        (url.hostname === "localhost" || url.hostname === "127.0.0.1");
      const httpsAllowed =
        url.protocol === "https:" && ALLOWED_HOSTS.has(url.hostname);
      if (httpLocal || httpsAllowed) {
        return url.origin;
      }
    } catch {
      // fall through to the public site
    }
  }
  return "https://www.ffg.finance";
}

export async function sendResendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<{ ok: boolean; error?: string }> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return { ok: false, error: "RESEND_API_KEY is not set" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Future FG <noreply@ffg.finance>",
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    return {
      ok: false,
      error: `Resend ${res.status}: ${body.slice(0, 300)}`,
    };
  }

  return { ok: true };
}
