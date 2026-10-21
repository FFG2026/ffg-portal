import { htmlToText } from "./parse-proposal";

export type ReadEmail = {
  subject: string | null;
  messageId: string | null;
  from: string | null;
  date: string | null;
  text: string;
};

function decodeQuotedPrintable(input: string, charset = "utf-8") {
  const joined = input.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < joined.length; i++) {
    if (joined[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(joined.slice(i + 1, i + 3))) {
      bytes.push(parseInt(joined.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(joined.charCodeAt(i) & 0xff);
    }
  }
  try {
    return new TextDecoder(charset).decode(Uint8Array.from(bytes));
  } catch {
    return Buffer.from(bytes).toString("utf8");
  }
}

function decodeWords(value: string) {
  // RFC 2047: whitespace between two adjacent encoded words is not content.
  const joined = value.replace(/(\?=)\s+(=\?)/g, "$1$2");
  return joined.replace(/=\?([^?]+)\?([QqBb])\?([^?]*)\?=/g, (_, cs, enc, data) => {
    try {
      if (/b/i.test(enc)) return Buffer.from(data, "base64").toString("utf8");
      return decodeQuotedPrintable(data.replace(/_/g, " "), cs);
    } catch {
      return data;
    }
  });
}

function splitHeaders(raw: string) {
  const idx = raw.search(/\r?\n\r?\n/);
  const head = idx === -1 ? raw : raw.slice(0, idx);
  const body = idx === -1 ? "" : raw.slice(idx).replace(/^\r?\n\r?\n/, "");
  const headers: Record<string, string> = {};
  const unfolded = head.replace(/\r?\n[ \t]+/g, " ");
  for (const line of unfolded.split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return { headers, body };
}

function partText(raw: string): string {
  const { headers, body } = splitHeaders(raw);
  const type = headers["content-type"] || "text/plain";
  const enc = (headers["content-transfer-encoding"] || "").toLowerCase();
  const boundary = type.match(/boundary="?([^";]+)"?/i)?.[1];
  if (/multipart\//i.test(type) && boundary) {
    const parts = body.split(`--${boundary}`).slice(1).filter((p) => !p.startsWith("--"));
    const texts = parts.map((p) => ({
      raw: p.replace(/^\r?\n/, ""),
      html: /content-type:\s*text\/html/i.test(p.slice(0, 400)),
      plain: /content-type:\s*text\/plain/i.test(p.slice(0, 400)),
      multi: /content-type:\s*multipart\//i.test(p.slice(0, 400)),
    }));
    const pick =
      texts.find((t) => t.multi) || texts.find((t) => t.html) || texts.find((t) => t.plain);
    return pick ? partText(pick.raw) : "";
  }
  const charset = type.match(/charset="?([^";]+)"?/i)?.[1] || "utf-8";
  let decoded = body;
  if (enc === "quoted-printable") decoded = decodeQuotedPrintable(body, charset);
  else if (enc === "base64") decoded = Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8");
  return /text\/html/i.test(type) ? htmlToText(decoded) : decoded;
}

export function readEml(source: string): ReadEmail {
  const { headers } = splitHeaders(source);
  return {
    subject: headers["subject"] ? decodeWords(headers["subject"]) : null,
    messageId: headers["message-id"] || null,
    from: headers["from"] ? decodeWords(headers["from"]) : null,
    date: headers["date"] || null,
    text: partText(source),
  };
}

export async function readMsg(buffer: Buffer): Promise<ReadEmail> {
  const mod: any = await import("@kenjiuno/msgreader");
  const MsgReader = mod.default?.default || mod.default || mod;
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const data = new MsgReader(ab).getFileData() as any;
  const headers = String(data.headers || "");
  const dateHeader = headers.match(/^Date:\s*(.+)$/im)?.[1] || null;
  const html = data.bodyHtml || (data.html ? Buffer.from(data.html).toString("utf8") : "");
  const text = data.body || (html ? htmlToText(html) : "");
  return {
    subject: data.subject || null,
    messageId: data.messageId || headers.match(/^Message-ID:\s*(.+)$/im)?.[1]?.trim() || null,
    from: data.senderEmail || data.senderName || null,
    date: dateHeader || data.messageDeliveryTime || data.clientSubmitTime || null,
    text,
  };
}

export async function readEmailFile(filename: string, buffer: Buffer): Promise<ReadEmail> {
  const name = filename.toLowerCase();
  if (name.endsWith(".msg")) return readMsg(buffer);
  if (name.endsWith(".eml")) return readEml(buffer.toString("utf8"));
  // .txt / .html / anything else: treat as the text of the email itself
  const raw = buffer.toString("utf8");
  return {
    subject: null,
    messageId: null,
    from: null,
    date: null,
    text: /<\s*(html|table|body)/i.test(raw) ? htmlToText(raw) : raw,
  };
}
