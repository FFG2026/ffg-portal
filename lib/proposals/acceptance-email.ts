const gbp = (v: number | null | undefined) =>
  v === null || v === undefined
    ? "–"
    : `£${Number(v).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export type AcceptanceInput = {
  repName: string | null;
  companyName: string | null;
  productLabel: string;
  assetDescription: string | null;
  supplierName: string | null;
  cashPrice: number | null;
  deposit: number | null;
  financed: number | null;
  termMonths: number | null;
  ratePct: number | null;
  monthly: number | null;
  senderName: string;
};

export const PRODUCT_LABELS: Record<string, string> = {
  hp: "Hire Purchase",
  fl: "Finance Lease",
  loan: "Loan",
};

export function buildAcceptanceEmail(i: AcceptanceInput) {
  const first = (i.repName || "").trim().split(/\s+/)[0] || "there";
  const subject = `Proposal accepted – ${i.companyName || "your customer"}${i.assetDescription ? ` – ${i.assetDescription}` : ""}`;
  const lines = [
    `Hi ${first},`,
    ``,
    `Thank you for the proposal for ${i.companyName || "your customer"}. Future FG is pleased to accept it on the following terms:`,
    ``,
    `Product:            ${i.productLabel}`,
    i.assetDescription ? `Asset:              ${i.assetDescription}` : null,
    i.supplierName ? `Supplier:           ${i.supplierName}` : null,
    `Cash price:         ${gbp(i.cashPrice)}`,
    `Deposit:            ${gbp(i.deposit)}`,
    `Amount financed:    ${gbp(i.financed)}`,
    `Term:               ${i.termMonths} months`,
    `Rate:               ${i.ratePct}%`,
    `Monthly payment:    ${gbp(i.monthly)}`,
    ``,
    `This acceptance is subject to signed documentation and a direct debit mandate being in place before the agreement starts. Please let me know when you're ready for the paperwork and I'll get it moving.`,
    ``,
    `Kind regards,`,
    i.senderName,
    `Future FG`,
  ];
  return { subject, body: lines.filter((l) => l !== null).join("\n") };
}
