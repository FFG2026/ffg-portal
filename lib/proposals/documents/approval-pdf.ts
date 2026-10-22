import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";
import { winAnsi } from "./pdf-util";

export type ApprovalData = {
  agreementNumber: string;
  company: string;
  companyNumber: string | null;
  product: string;
  asset: string | null;
  supplier: string | null;
  proposal: Array<[string, string]>;
  agreed: Array<[string, string]>;
  decision: string;
  decidedBy: string | null;
  decidedAt: string | null;
  notes: string | null;
  checks: Array<{ label: string; level: string; detail: string }>;
  raisedBy: string;
};

const LEVEL = { ok: "OK", info: "Info", review: "Review", issue: "Issue" } as Record<string, string>;
const COLOUR = {
  ok: rgb(0.1, 0.55, 0.25),
  info: rgb(0.45, 0.5, 0.55),
  review: rgb(0.8, 0.55, 0.05),
  issue: rgb(0.7, 0.13, 0.17),
} as Record<string, ReturnType<typeof rgb>>;

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of winAnsi(text).split(/\r?\n/)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

/** One-or-two page A4 record of what was approved, by whom, on what figures and checks. */
export async function buildApprovalPdf(d: ApprovalData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28;
  const H = 841.89;
  const M = 48;
  let page = doc.addPage([W, H]);
  let y = H - M;
  const ink = rgb(0.06, 0.1, 0.2);

  const ensure = (need: number) => {
    if (y - need < M) {
      page = doc.addPage([W, H]);
      y = H - M;
    }
  };
  const text = (t: string, x: number, size = 10, f = font, color = ink) => {
    page.drawText(winAnsi(t), { x, y, size, font: f, color });
  };
  const heading = (t: string) => {
    ensure(34);
    y -= 12;
    text(t.toUpperCase(), M, 9, bold, rgb(0.07, 0.45, 0.8));
    y -= 5;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: rgb(0.8, 0.84, 0.9) });
    y -= 13;
  };
  const kv = (rows: Array<[string, string]>) => {
    for (const [k, v] of rows) {
      const lines = wrap(v || "-", font, 10, W - M - 190);
      ensure(14 * lines.length);
      text(k, M, 10, font, rgb(0.35, 0.42, 0.5));
      lines.forEach((ln, i) => {
        page.drawText(ln, { x: 190, y: y - i * 13, size: 10, font, color: ink });
      });
      y -= 14 * Math.max(1, lines.length);
    }
  };

  text("Future Finance Group Limited", M, 10, bold, rgb(0.07, 0.45, 0.8));
  y -= 24;
  text("Approval record", M, 20, bold);
  y -= 22;
  text(`${d.company}${d.companyNumber ? `  -  company number ${d.companyNumber}` : ""}`, M, 11, bold);
  y -= 15;
  text(`${d.product} ${d.agreementNumber}${d.asset ? `  -  ${d.asset}` : ""}`, M, 10);
  y -= 13;
  text(`Raised ${new Date().toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })} by ${d.raisedBy}`, M, 9, font, rgb(0.45, 0.5, 0.55));
  y -= 6;

  heading("Decision");
  kv([
    ["Decision", d.decision],
    ["Recorded by", d.decidedBy || "-"],
    ["Date", d.decidedAt ? new Date(d.decidedAt).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" }) : "-"],
    ["Underwriter's note", d.notes || "-"],
  ]);

  heading("Proposal as received");
  kv([...(d.supplier ? ([["Supplier", d.supplier]] as Array<[string, string]>) : []), ...d.proposal]);

  if (d.agreed.length) {
    heading("Agreed terms");
    kv(d.agreed);
  }

  heading("Checks at the time");
  for (const c of d.checks) {
    const lines = wrap(c.detail, font, 9.5, W - M - 190);
    ensure(14 * Math.max(1, lines.length));
    text(c.label, M, 9.5, bold);
    page.drawText(LEVEL[c.level] || c.level, { x: 150, y, size: 9, font: bold, color: COLOUR[c.level] || ink });
    lines.forEach((ln, i) => page.drawText(ln, { x: 190, y: y - i * 12.5, size: 9.5, font, color: ink }));
    y -= 13 * Math.max(1, lines.length) + 2;
  }

  return doc.save();
}
