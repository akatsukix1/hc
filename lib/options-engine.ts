import { fetch } from "expo/fetch";
import type { KotakCredentials, KotakSession } from "./kotak-api";
import { fetchScripPaths } from "./kotak-api";

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

const MONTH_LABELS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

function formatExpiryLabel(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}-${MONTH_LABELS[d.getMonth()]}-${d.getFullYear()}`;
}

// Parses expiry date AND strike price from the trading symbol.
// Monthly format: NIFTY26MAR1024000CE → year=2026, month=3, day=10, strike=24000
// Weekly format:  NIFTY2631224000CE   → year=2026, month=3,  day=12, strike=24000
//                 (month digit: 1-9, A=10, B=11, C=12)
function parseSymbolData(ts: string, prefix: string): { expDate: Date; strike: number } | null {
  const rest = ts.slice(prefix.length);

  // Monthly: YY + [A-Z]{3} + DD + digits + CE/PE
  const monthly = rest.match(/^(\d{2})([A-Z]{3})(\d{2})(\d+)(CE|PE)$/i);
  if (monthly) {
    const year = 2000 + parseInt(monthly[1]);
    const month = MONTHS[monthly[2].toUpperCase()];
    const day = parseInt(monthly[3]);
    const strike = parseInt(monthly[4]);
    if (month && year >= 2025 && year <= 2035 && day >= 1 && day <= 31 && strike > 100) {
      const d = new Date(year, month - 1, day);
      if (d.getDate() === day) return { expDate: d, strike };
    }
  }

  // Weekly: YY + single-char-month + DD + digits + CE/PE
  const weekly = rest.match(/^(\d{2})([1-9ABC])(\d{2})(\d+)(CE|PE)$/i);
  if (weekly) {
    const year = 2000 + parseInt(weekly[1]);
    const mChar = weekly[2].toUpperCase();
    const month = "123456789".includes(mChar)
      ? parseInt(mChar)
      : ({ A: 10, B: 11, C: 12 } as Record<string, number>)[mChar] ?? 0;
    const day = parseInt(weekly[3]);
    const strike = parseInt(weekly[4]);
    if (month >= 1 && month <= 12 && year >= 2025 && year <= 2035 && day >= 1 && day <= 31 && strike > 100) {
      const d = new Date(year, month - 1, day);
      if (d.getDate() === day) return { expDate: d, strike };
    }
  }

  return null;
}

function parseSimpleCsv(text: string, neededCols: string[]): Record<string, string>[] {
  const lines = text.split("\n");
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim().replace(/;/g, ""));
  const colIdx: Record<string, number> = {};
  for (const col of neededCols) {
    const idx = header.findIndex((h) => h === col);
    if (idx >= 0) colIdx[col] = idx;
  }
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const parts = line.split(",");
    const row: Record<string, string> = {};
    for (const col of neededCols) {
      row[col] = (parts[colIdx[col] ?? -1] || "").trim();
    }
    rows.push(row);
  }
  return rows;
}

export interface OptionEntry {
  ts: string;
  symbol: string;
  seg: string;
  lot: number;
}

export interface StrikeData {
  CE?: OptionEntry;
  PE?: OptionEntry;
}

export interface OptionsDb {
  [index: string]: {
    [expiry: string]: {
      [strike: number]: StrikeData;
    };
  };
}

export interface ExpiryInfo {
  label: string;
  date: Date;
  isNearest: boolean;
}

export interface ChainRow {
  strike: number;
  isAtm: boolean;
  ce_ts: string;
  ce_symbol: string;
  ce_seg: string;
  ce_lot: number;
  pe_ts: string;
  pe_symbol: string;
  pe_seg: string;
  pe_lot: number;
}

export interface ChainResult {
  atmStrike: number;
  spotPrice: number;
  chain: ChainRow[];
  index: string;
  expiry: string;
  lotSize: number;
  step: number;
}

export async function downloadAndBuildOptionsDb(
  creds: KotakCredentials,
  session: KotakSession,
  indices: string[],
  onProgress?: (msg: string) => void
): Promise<OptionsDb> {
  const db: OptionsDb = {};
  const paths = await fetchScripPaths(creds, session);
  const needed = new Set<string>();
  for (const idx of indices) {
    const key = ["NIFTY", "BANKNIFTY", "FINNIFTY"].includes(idx.toUpperCase()) ? "nse_fo" : "bse_fo";
    needed.add(key);
  }
  const csvTexts: Record<string, string> = {};
  for (const csvKey of needed) {
    const csvKeyU = csvKey.toUpperCase();
    const url =
      paths.find((p) => p.toLowerCase().includes(csvKey) && !p.toLowerCase().includes("-v1")) ||
      paths.find((p) => p.toUpperCase().includes(csvKeyU));
    if (!url) { onProgress?.(`No URL for ${csvKey}`); continue; }
    onProgress?.(`Downloading ${csvKey}...`);
    try {
      let text = "";
      const isKotakDomain = url.includes("kotaksecurities.com") || url.includes("gw-napi");
      if (isKotakDomain) {
        const r1 = await fetch(url, { headers: { Authorization: creds.accessToken } });
        text = await r1.text();
      }
      if (!text || text.trim().startsWith("<") || !text.includes(",")) {
        const r2 = await fetch(url);
        text = await r2.text();
      }
      if (text && !text.trim().startsWith("<") && text.includes(",")) {
        csvTexts[csvKey] = text;
        onProgress?.(`Parsing ${csvKey}...`);
      } else {
        onProgress?.(`Bad response for ${csvKey}`);
      }
    } catch (e: any) {
      onProgress?.(`Failed ${csvKey}: ${e?.message}`);
    }
  }
  const neededCols = ["pSymbol","pExchSeg","pTrdSymbol","pOptionType","lLotSize","pSymbolName","pInstType"];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const idx of indices) {
    const key = idx.toUpperCase();
    const csvKey = ["NIFTY", "BANKNIFTY", "FINNIFTY"].includes(key) ? "nse_fo" : "bse_fo";
    const csvText = csvTexts[csvKey];
    if (!csvText) continue;
    onProgress?.(`Building ${key} chain...`);
    const rows = parseSimpleCsv(csvText, neededCols);
    db[key] = {};
    const expiries: Record<string, Date> = {};
    for (const row of rows) {
      const symName = (row.pSymbolName || "").toUpperCase().trim();
      const optType = (row.pOptionType || "").toUpperCase().trim();
      const instType = (row.pInstType || "").toUpperCase().trim();
      if (symName !== key) continue;
      if (!["CE", "PE"].includes(optType)) continue;
      // SENSEX uses OPTIDX or IO; NIFTY/BANKNIFTY use OPTIDX
      if (key === "SENSEX") {
        if (!["OPTIDX", "IO", "OPTFUT"].includes(instType)) continue;
      } else {
        if (instType !== "OPTIDX") continue;
      }
      const ts = (row.pTrdSymbol || "").toUpperCase().trim();
      // Extract expiry date AND strike from the trading symbol (avoids any CSV column issues)
      const parsed = parseSymbolData(ts, key);
      if (!parsed || parsed.expDate.getFullYear() > 2030) continue;
      const { expDate, strike } = parsed;
      if (strike <= 0) continue;
      const label = formatExpiryLabel(expDate);
      const lot = parseInt(row.lLotSize || "1") || 1;
      if (!db[key][label]) db[key][label] = {};
      if (!db[key][label][strike]) db[key][label][strike] = {};
      db[key][label][strike][optType as "CE" | "PE"] = {
        ts,
        symbol: row.pSymbol || "",
        seg: (row.pExchSeg || "").toLowerCase(),   // Kotak order API expects lowercase
        lot,
      };
      if (expDate >= today) expiries[label] = expDate;
    }
    onProgress?.(`${key}: ${Object.keys(expiries).length} expiries, ${Object.keys(db[key]).length} total`);
  }
  return db;
}

export function getExpiries(db: OptionsDb, index: string): ExpiryInfo[] {
  const key = index.toUpperCase();
  const indexDb = db[key];
  if (!indexDb) return [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const entries: [string, Date][] = [];
  for (const label of Object.keys(indexDb)) {
    const parts = label.split("-");
    if (parts.length !== 3) continue;
    const d = new Date(parseInt(parts[2]), MONTHS[parts[1]] - 1, parseInt(parts[0]));
    if (d >= today) entries.push([label, d]);
  }
  entries.sort((a, b) => a[1].getTime() - b[1].getTime());
  return entries.map((e, i) => ({ label: e[0], date: e[1], isNearest: i === 0 }));
}

export function queryChain(
  db: OptionsDb,
  index: string,
  spotPrice: number,
  numStrikes: number,
  expiryLabel: string
): ChainResult | null {
  const key = index.toUpperCase();
  const indexDb = db[key];
  if (!indexDb) return null;
  const strikesData = indexDb[expiryLabel];
  if (!strikesData) return null;
  const allStrikes = Object.keys(strikesData).map(Number).sort((a, b) => a - b);
  if (!allStrikes.length) return null;
  const stepMap: Record<string, number> = { NIFTY: 50, BANKNIFTY: 100, SENSEX: 100 };
  const step = stepMap[key] || 50;
  const atm = allStrikes.reduce((prev, curr) =>
    Math.abs(curr - spotPrice) < Math.abs(prev - spotPrice) ? curr : prev
  );
  const atmIdx = allStrikes.indexOf(atm);
  const start = Math.max(0, atmIdx - numStrikes);
  const end = Math.min(allStrikes.length, atmIdx + numStrikes + 1);
  const selected = allStrikes.slice(start, end);
  let lotSize = 1;
  const chain: ChainRow[] = selected.map((strike) => {
    const sdata = strikesData[strike] || {};
    const ce = sdata.CE;
    const pe = sdata.PE;
    if (lotSize === 1 && (ce?.lot || pe?.lot)) lotSize = ce?.lot || pe?.lot || 1;
    return {
      strike,
      isAtm: Math.abs(strike - atm) < step / 2,
      ce_ts: ce?.ts || "",
      ce_symbol: ce?.symbol || "",
      ce_seg: ce?.seg || "",
      ce_lot: ce?.lot || 1,
      pe_ts: pe?.ts || "",
      pe_symbol: pe?.symbol || "",
      pe_seg: pe?.seg || "",
      pe_lot: pe?.lot || 1,
    };
  });
  return { atmStrike: atm, spotPrice, chain, index: key, expiry: expiryLabel, lotSize, step };
}
