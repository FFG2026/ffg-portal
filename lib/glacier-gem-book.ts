import { addMonths } from "./schedule";
import type { SheetDeal, SheetPayment } from "./spreadsheet";

const YELLOW = /^(ffff00|ffffff00)$/i;

function asNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v * 100) / 100;
  const n = Number(String(v).replace(/[,£]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function asIsoDate(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return new Date(
      Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate())
    )
      .toISOString()
      .slice(0, 10);
  }
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const ms = excelEpoch + Math.round(v) * 86400000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const uk = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (uk) {
    const d = Number(uk[1]);
    const mo = Number(uk[2]);
    let y = Number(uk[3]);
    if (y < 100) y += 2000;
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return null;
}

export function glacierAgreementNumber(n: number) {
  return `GG${String(n).padStart(2, "0")}`;
}

export function isYellowFill(style: { fgColor?: { rgb?: string } } | null | undefined) {
  const rgb = String(style?.fgColor?.rgb || "");
  return YELLOW.test(rgb);
}

function firstDueFromDealSheet(rows: unknown[][]): string | null {
  const dates: string[] = [];
  for (const row of rows.slice(7, 40)) {
    const due = asIsoDate(row?.[0]);
    const amount = asNumber(row?.[2]);
    if (!due || amount == null || amount === 0) continue;
    dates.push(due);
  }
  if (!dates.length) return null;
  return dates.sort()[0];
}

function purchaseFromDealSheet(rows: unknown[][]) {
  let purchase_price: number | null = null;
  let customer_deposit: number | null = null;
  for (const row of rows) {
    const label = String(row?.[1] ?? "");
    const n = asNumber(row?.[2]);
    if (/purchase price/i.test(label)) purchase_price = n;
    if (/customer deposit/i.test(label)) customer_deposit = n;
  }
  return { purchase_price, customer_deposit };
}

export type GlacierExtras = {
  company_name?: string;
  asset_description?: string | null;
  first_due?: string | null;
  monthly_instalment?: number;
  term_months?: number;
  total_lend?: number;
  purchase_price?: number | null;
  customer_deposit?: number | null;
  google_folder_id?: string | null;
  google_folder_name?: string | null;
};

/** Totals tab: yellow cells on instalment columns are collections received. */
export function parseGlacierGemTotals(
  totals: { v?: unknown; s?: { fgColor?: { rgb?: string } } }[][],
  dealSheets: Record<string, unknown[][]>,
  extras: Record<string, GlacierExtras> = {}
): SheetDeal[] {
  const deals: SheetDeal[] = [];
  const header = totals[0] || [];
  let firstInstalmentCol = -1;
  for (let c = 0; c < header.length; c++) {
    if (/^1st$/i.test(String(header[c]?.v ?? header[c] ?? ""))) {
      firstInstalmentCol = c;
      break;
    }
  }
  if (firstInstalmentCol < 0) firstInstalmentCol = 10;

  for (let r = 1; r < totals.length; r++) {
    const row = totals[r] || [];
    const raw = String(row[0]?.v ?? row[0] ?? "").trim().toUpperCase();
    const match = raw.match(/^GG\s*0*(\d+)$/);
    if (!match) continue;
    const agreement_number = glacierAgreementNumber(Number(match[1]));
    const extra = extras[agreement_number] || {};
    const term =
      Math.round(Number(row[2]?.v ?? row[2] ?? extra.term_months ?? 0)) ||
      extra.term_months ||
      0;
    const total_lend = asNumber(row[3]?.v ?? row[3]) ?? extra.total_lend ?? null;
    const monthly =
      asNumber(row[9]?.v ?? row[9]) ?? extra.monthly_instalment ?? null;
    const sheet = dealSheets[agreement_number] || dealSheets[raw] || [];
    const fromSheet = purchaseFromDealSheet(sheet);

    const amounts: { amount: number; paid: boolean }[] = [];
    const lastCol = firstInstalmentCol + Math.max(term || 0, 48);
    for (let c = firstInstalmentCol; c < lastCol; c++) {
      const cell = row[c];
      const amount = asNumber(cell?.v ?? cell);
      if (amount == null || amount === 0) {
        if (amounts.length >= (term || 0) && term) break;
        if (!cell && amounts.length) break;
        continue;
      }
      amounts.push({
        amount,
        paid: isYellowFill(cell?.s),
      });
      if (term && amounts.length >= term) break;
    }

    if (!amounts.length && extra.monthly_instalment && extra.term_months) {
      for (let i = 0; i < extra.term_months; i++) {
        amounts.push({ amount: extra.monthly_instalment, paid: false });
      }
    }
    if (!amounts.length) continue;

    const firstDue =
      extra.first_due ||
      firstDueFromDealSheet(sheet) ||
      "2025-05-15";
    const payments: SheetPayment[] = amounts.map((p, i) => ({
      instalment_number: i + 1,
      due_date: addMonths(firstDue, i),
      amount: p.amount,
      paid: p.paid,
    }));

    deals.push({
      agreement_number,
      agreement_type: "GG",
    company_name: extra.company_name || agreement_number,
      purchase_price: extra.purchase_price ?? fromSheet.purchase_price,
      customer_deposit: extra.customer_deposit ?? fromSheet.customer_deposit,
      total_lend,
      commission: null,
      documentation_fee: null,
      monthly_instalment: monthly ?? payments[0].amount,
      term_months: payments.length,
      start_date: addMonths(payments[0].due_date, -1),
      payments,
      book: "gg",
      asset_description: extra.asset_description || null,
      google_folder_id: extra.google_folder_id || null,
      google_folder_name: extra.google_folder_name || null,
    } as SheetDeal);
  }
  return deals;
}

export const GLACIER_DRIVE_FOLDERS: Record<
  string,
  { id: string; name: string; company: string }
> = {
  GG01: {
    id: "1Rew61eLkJ3K_3aVS2aJA9iUSWbuPn29o",
    name: "GG01",
    company: "Rocket Hire Limited",
  },
  GG02: {
    id: "1tRFQ0CGjXldRRdMcx2KcM7CMTWAbFxcA",
    name: "GG02",
    company: "Rocket Hire Limited",
  },
  GG03: {
    id: "1d-yL5rFq93f5H0vtcdGgJ30D_xMk7TD_",
    name: "GG03",
    company: "Rocket Hire Limited",
  },
  GG04: {
    id: "1y1X9ETWph4BEHgkTGPqT7kSIf5s-Qw6s",
    name: "GG04",
    company: "Rocket Hire Limited",
  },
  GG05: {
    id: "1KhbkLYzdajvko-DxYItlHqeTsiuiwpBK",
    name: "GG05",
    company: "Rocket Hire Limited",
  },
  GG06: {
    id: "1nMSiMT26-IjDB58-VZZEK_h_opR4LRed",
    name: "GG06",
    company: "Rocket Hire Limited",
  },
  GG07: {
    id: "12Srenu81GnrVTFhPDoOaoIOwaNHZJ4Wg",
    name: "GG07",
    company: "Rocket Hire Limited",
  },
  GG08: {
    id: "1c1R0Jhqi9SIwT9_aoe6QK4kUj4RUeZ4S",
    name: "GG08",
    company: "Rocket Hire Limited",
  },
  GG09: {
    id: "1d8af5f0ry8LQKGmzR4NIjra_-R4V88rv",
    name: "GG09",
    company: "Rocket Hire Limited",
  },
  GG10: {
    id: "1l7P3z6RwUiaaKPY9pQcerpV4hmMabY8U",
    name: "GG10",
    company: "Rocket Hire Limited",
  },
  GG11: {
    id: "1pd7ie80viJxxTIorGJPTDtMzlKgbqkeM",
    name: "GG11 - Prior Construction Limited",
    company: "Prior Construction Limited",
  },
  GG12: {
    id: "1iwrwC9vle82OCbC3BuqgTfGvELKd7wE-",
    name: "GG12 - Prior Construction Limited",
    company: "Prior Construction Limited",
  },
  GG13: {
    id: "1U5fn8CAS97N3uriyN5SCT-MOESexMx0A",
    name: "GG13 - Rocket Hire",
    company: "Rocket Hire Limited",
  },
  GG14: {
    id: "1LIXChfdK0ogGBzeMrou1lWqvFHvtXBdL",
    name: "GG14 - Prior Construction Limited",
    company: "Prior Construction Limited",
  },
};

export const GLACIER_KNOWN_DEALS: Record<string, GlacierExtras> = {
  GG01: {
    company_name: "Rocket Hire Limited",
    asset_description:
      "Ford Transit L3H3 DV72XEA, CK72YPG, CK72YPL, WR22SYX",
    first_due: "2025-05-15",
  },
  GG02: {
    company_name: "Rocket Hire Limited",
    asset_description:
      "Ford Transit L3H3 WN72YXZ, Transit Custom EO21TKU, EK71YNW, EK71YUG",
  },
  GG03: {
    company_name: "Rocket Hire Limited",
    asset_description:
      "Transit Custom FL21ANV, Ford Transit 350 DN72MVP, WR21FYB, Transit Custom ML71VZZ",
  },
  GG04: {
    company_name: "Rocket Hire Limited",
    asset_description:
      "Ford Transit 350 WR71GYH, DV72FKN, DV72SFE, WR72PXO, Transit Custom Auto LD22NNX",
  },
  GG05: {
    company_name: "Rocket Hire Limited",
    asset_description: "Ford Transit 350 DY72JUF, CK72AYT",
  },
  GG06: {
    company_name: "Rocket Hire Limited",
    asset_description:
      "Ford Transit 350 L3H3 DY72JVR, Citroen Relay 35 CE71OGF, Ford Transit 350 L3H3 LD73DAO, CF22UZL",
  },
  GG07: {
    company_name: "Rocket Hire Limited",
    asset_description:
      "Transit Custom HV71VML, Ford Transit 350 L3H3 DV72YDZ, WM71FXU, DL22PLZ, WR23RKY, DL22ONK, Ford Transit L4H3 SD22AXB",
  },
  GG08: {
    company_name: "Rocket Hire Limited",
    asset_description:
      "Ford Transit 350 L3H3 DV72GKX, WR22SXO, Transit 350 L3H2 Auto WM72CCK, Transit 350 L4H3 HS71BJE, Transit 350 L3H3 DL22PLO",
  },
  GG09: {
    company_name: "Rocket Hire Limited",
    asset_description:
      "Ford Transit L3H3 MM72BPZ, Transit Custom 300 FV74GWZ, FV74GWX",
  },
  GG10: {
    company_name: "Rocket Hire Limited",
    asset_description: "Ford Transit Custom 300 YE74EOR, YE74ESO",
  },
  GG11: {
    company_name: "Prior Construction Limited",
    asset_description: "Mercedes Sprinter Holeshot Race Van KU72XVM",
  },
  GG12: {
    company_name: "Prior Construction Limited",
    asset_description: "DAF CF440 Euro 6 32T tipper BV15AAO",
  },
  GG13: {
    company_name: "Rocket Hire Limited",
    asset_description:
      "Renault Trafic FH23HSX, Vauxhall Vivaro DY73OKM, Renault Trafic HS23BVB, HN73RXO",
    monthly_instalment: 1669.02,
    term_months: 36,
    total_lend: 50250,
    purchase_price: 60300,
    customer_deposit: 10050,
    first_due: "2026-09-24",
  },
  GG14: {
    company_name: "Prior Construction Limited",
    asset_description: "Isuzu Forward N75:150 4x2 Day Cab YX19NWM",
    monthly_instalment: 397.24,
    term_months: 36,
    total_lend: 11500,
    purchase_price: 13800,
    customer_deposit: 2300,
    first_due: "2026-09-29",
  },
};

export function glacierExtrasFor(agreementNumber: string): GlacierExtras {
  const folder = GLACIER_DRIVE_FOLDERS[agreementNumber];
  const known = GLACIER_KNOWN_DEALS[agreementNumber] || {};
  return {
    ...known,
    company_name: known.company_name || folder?.company,
    google_folder_id: folder?.id || null,
    google_folder_name: folder?.name || null,
  };
}
