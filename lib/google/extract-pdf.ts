import { parseAgreementPdfText } from "./parse-agreement-pdf";

export async function extractPdfText(buffer: Buffer) {
  const loaded = await import("pdf-parse/lib/pdf-parse.js");
  const pdfParse = (loaded as { default?: (buf: Buffer) => Promise<{ text: string }> }).default ||
    (loaded as unknown as (buf: Buffer) => Promise<{ text: string }>);
  const result = await pdfParse(buffer);
  return result.text || "";
}

export async function parseAgreementPdfBuffer(buffer: Buffer) {
  return parseAgreementPdfText(await extractPdfText(buffer));
}
