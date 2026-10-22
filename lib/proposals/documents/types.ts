export const HAVE = {
  funderEmail: "olb@ffg.finance",
  defaultOptionFee: 100,
  defaultDocFee: 195,
};

export type PgData = {
  guarantorName: string;
  /** ISO date (yyyy-mm-dd) or free text. */
  guarantorDob: string;
  guarantorAddress: string;
  companyName: string;
  companyNumber: string;
  companyAddress: string;
  registeredOffice?: string;
  registeredIn?: string;
};

export type HpData = {
  agreementNumber: string;
  hirerName: string;
  companyNumber: string;
  email: string;
  contactName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  postcode: string;
  goods: Array<{ description: string; chassis?: string; reg?: string; condition?: string; regDate?: string; cost?: number | null }>;
  cashPrice: number;
  vat: number | null;
  /** Customer deposit as agreed (VAT is added to it below when it is paid up front). */
  deposit: number;
  documentationFee: number | null;
  termMonths: number;
  monthly: number;
  optionFee: number;
  supplierName: string;
  signatoryName: string;
  signatoryPosition: string;
};
