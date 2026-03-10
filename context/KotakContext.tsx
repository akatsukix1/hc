import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import * as SecureStore from "expo-secure-store";
import type { KotakCredentials, KotakSession } from "@/lib/kotak-api";
import {
  kotakLoginTotp,
  kotakValidateMpin,
  getSpotPrice,
  placeOrder,
  cancelOrder,
  getOrderBook,
  getPositions,
  getLimits,
  fetchLtps,
  closeAllPositions,
} from "@/lib/kotak-api";
import {
  downloadAndBuildOptionsDb,
  getExpiries,
  queryChain,
  type OptionsDb,
  type ExpiryInfo,
  type ChainResult,
} from "@/lib/options-engine";

const CREDS_KEY = "kotak_credentials_v2";

interface KotakContextValue {
  credentials: KotakCredentials | null;
  session: KotakSession | null;
  isSetup: boolean;
  isConnected: boolean;
  isLoading: boolean;
  loadingMessage: string;

  saveCredentials: (creds: KotakCredentials) => Promise<void>;
  clearCredentials: () => Promise<void>;
  connectWithTotp: (totp: string) => Promise<{ status: "success" | "error"; message?: string }>;
  disconnect: () => void;

  currentIndex: string;
  setCurrentIndex: (idx: string) => void;
  spotPrices: Record<string, number>;
  expiries: ExpiryInfo[];
  selectedExpiry: string;
  setSelectedExpiry: (e: string) => void;
  numStrikes: number;
  setNumStrikes: (n: number) => void;
  chain: ChainResult | null;
  chainLoading: boolean;
  refreshChain: () => Promise<void>;

  positions: any[];
  posLoading: boolean;
  liveLtps: Record<string, number>;
  refreshPositions: () => Promise<void>;

  orders: any[];
  ordersLoading: boolean;
  refreshOrders: () => Promise<void>;

  funds: { available: string; used: string; collateral: string };
  fundsLoading: boolean;
  refreshFunds: () => Promise<void>;

  placeTradeOrder: (params: {
    es: string; ts: string; tt: "B" | "S"; qty: number;
  }) => Promise<{ success: boolean; message: string; orderId?: string }>;
  cancelTradeOrder: (orderId: string) => Promise<{ success: boolean; message: string }>;
  closeAll: () => Promise<{ closed: number }>;
}

const KotakCtx = createContext<KotakContextValue | null>(null);

export function useKotak(): KotakContextValue {
  const ctx = useContext(KotakCtx);
  if (!ctx) throw new Error("useKotak must be used inside KotakProvider");
  return ctx;
}

export function KotakProvider({ children }: { children: React.ReactNode }) {
  const [credentials, setCredentials] = useState<KotakCredentials | null>(null);
  const [session, setSession] = useState<KotakSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("Loading...");

  const [optionsDb, setOptionsDb] = useState<OptionsDb>({});
  const [currentIndex, setCurrentIndex] = useState("NIFTY");
  const [spotPrices, setSpotPrices] = useState<Record<string, number>>({});
  const [expiries, setExpiries] = useState<ExpiryInfo[]>([]);
  const [selectedExpiry, setSelectedExpiry] = useState("");
  const [numStrikes, setNumStrikes] = useState(5);
  const [chain, setChain] = useState<ChainResult | null>(null);
  const [chainLoading, setChainLoading] = useState(false);

  const [positions, setPositions] = useState<any[]>([]);
  const [posLoading, setPosLoading] = useState(false);
  const [liveLtps, setLiveLtps] = useState<Record<string, number>>({});

  const [orders, setOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const [funds, setFunds] = useState({ available: "--", used: "--", collateral: "--" });
  const [fundsLoading, setFundsLoading] = useState(false);

  const spotIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const posIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ltpIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadStoredCredentials();
  }, []);

  async function loadStoredCredentials() {
    try {
      const stored = await SecureStore.getItemAsync(CREDS_KEY);
      if (stored) setCredentials(JSON.parse(stored));
    } catch {}
    setIsLoading(false);
  }

  const saveCredentials = useCallback(async (creds: KotakCredentials) => {
    await SecureStore.setItemAsync(CREDS_KEY, JSON.stringify(creds));
    setCredentials(creds);
  }, []);

  const clearCredentials = useCallback(async () => {
    await SecureStore.deleteItemAsync(CREDS_KEY);
    setCredentials(null);
    setSession(null);
  }, []);

  const connectWithTotp = useCallback(async (totp: string) => {
    if (!credentials) return { status: "error" as const, message: "No credentials saved" };
    setLoadingMessage("Connecting to Kotak...");
    const r1 = await kotakLoginTotp(credentials, totp);
    if (r1.status !== "success") return { status: "error" as const, message: r1.message };
    setLoadingMessage("Validating MPIN...");
    const r2 = await kotakValidateMpin(credentials, r1.viewToken, r1.viewSid);
    if (r2.status !== "success") return { status: "error" as const, message: r2.message };
    const newSession = r2.session;
    setSession(newSession);
    setLoadingMessage("Loading instruments...");
    try {
      const db = await downloadAndBuildOptionsDb(
        credentials, newSession,
        ["NIFTY", "BANKNIFTY", "SENSEX"],
        (msg) => setLoadingMessage(msg)
      );
      setOptionsDb(db);
    } catch {}
    setLoadingMessage("");
    return { status: "success" as const };
  }, [credentials]);

  const disconnect = useCallback(() => {
    setSession(null);
    setOptionsDb({});
    setChain(null);
    setPositions([]);
    setOrders([]);
    setLiveLtps({});
    setSpotPrices({});
    if (spotIntervalRef.current) clearInterval(spotIntervalRef.current);
    if (posIntervalRef.current) clearInterval(posIntervalRef.current);
    if (ltpIntervalRef.current) clearInterval(ltpIntervalRef.current);
  }, []);

  useEffect(() => {
    if (!session || !credentials) return;
    const exp = getExpiries(optionsDb, currentIndex);
    setExpiries(exp);
    const nearest = exp.find((e) => e.isNearest);
    if (nearest) setSelectedExpiry(nearest.label);
    else if (exp.length > 0) setSelectedExpiry(exp[0].label);
  }, [optionsDb, currentIndex, session]);

  const refreshChain = useCallback(async () => {
    if (!session || !credentials) return;
    setChainLoading(true);
    try {
      const spot = await getSpotPrice(credentials, session, currentIndex);
      if (spot > 0) setSpotPrices((p) => ({ ...p, [currentIndex]: spot }));
      const expiry = selectedExpiry || expiries[0]?.label || "";
      if (!expiry) { setChainLoading(false); return; }
      const result = queryChain(optionsDb, currentIndex, spot || spotPrices[currentIndex] || 0, numStrikes, expiry);
      if (result && result.chain.length > 0) {
        const tokens: Array<{ seg: string; sym: string; tok: string }> = [];
        for (const row of result.chain) {
          if (row.ce_ts) tokens.push({ seg: row.ce_seg, sym: row.ce_ts, tok: "" });
          if (row.pe_ts) tokens.push({ seg: row.pe_seg, sym: row.pe_ts, tok: "" });
        }
        const ltps = await fetchLtps(credentials, session, tokens);
        const chainWithLtps = result.chain.map((row) => ({
          ...row,
          ce_ltp: ltps[row.ce_ts] || 0,
          pe_ltp: ltps[row.pe_ts] || 0,
        }));
        setChain({ ...result, chain: chainWithLtps });
      } else {
        setChain(result);
      }
    } catch {}
    setChainLoading(false);
  }, [session, credentials, currentIndex, selectedExpiry, expiries, optionsDb, numStrikes, spotPrices]);

  useEffect(() => {
    if (!session || !credentials) return;
    refreshChain();
  }, [selectedExpiry, currentIndex, numStrikes, session]);

  useEffect(() => {
    if (!session || !credentials) return;
    if (spotIntervalRef.current) clearInterval(spotIntervalRef.current);
    spotIntervalRef.current = setInterval(async () => {
      if (!credentials || !session) return;
      for (const idx of ["NIFTY", "BANKNIFTY", "SENSEX"]) {
        try {
          const p = await getSpotPrice(credentials, session, idx);
          if (p > 0) setSpotPrices((prev) => ({ ...prev, [idx]: p }));
        } catch {}
      }
    }, 3000);
    return () => { if (spotIntervalRef.current) clearInterval(spotIntervalRef.current); };
  }, [session, credentials]);

  useEffect(() => {
    if (!session || !credentials) return;
    const update = async () => {
      const exp = selectedExpiry || expiries[0]?.label || "";
      if (!exp) return;
      const spot = spotPrices[currentIndex];
      if (!spot) return;
      const result = queryChain(optionsDb, currentIndex, spot, numStrikes, exp);
      if (result) {
        setChain((prev) => {
          const ltpMap: Record<string, number> = {};
          if (prev) {
            for (const row of prev.chain) {
              if (row.ce_ts) ltpMap[row.ce_ts] = row.ce_ltp;
              if (row.pe_ts) ltpMap[row.pe_ts] = row.pe_ltp;
            }
          }
          const chainWithLtps = result.chain.map((row) => ({
            ...row,
            ce_ltp: ltpMap[row.ce_ts] || 0,
            pe_ltp: ltpMap[row.pe_ts] || 0,
          }));
          return { ...result, chain: chainWithLtps };
        });
      }
    };
    update();
  }, [spotPrices, currentIndex]);

  const refreshPositions = useCallback(async () => {
    if (!session || !credentials) return;
    setPosLoading(true);
    try {
      const data = await getPositions(credentials, session);
      if ((data?.stat || "").toLowerCase() === "ok" && Array.isArray(data?.data)) {
        const posData = data.data.map((p: any) => {
          const ba = parseFloat(p.buyAmt || p.cfBuyAmt || "0") || 0;
          const sa = parseFloat(p.sellAmt || p.cfSellAmt || "0") || 0;
          return { ...p, _pnl: sa - ba };
        });
        setPositions(posData);
      } else {
        setPositions([]);
      }
    } catch { setPositions([]); }
    setPosLoading(false);
  }, [session, credentials]);

  useEffect(() => {
    if (!session || !credentials) return;
    refreshPositions();
    if (posIntervalRef.current) clearInterval(posIntervalRef.current);
    posIntervalRef.current = setInterval(refreshPositions, 5000);
    return () => { if (posIntervalRef.current) clearInterval(posIntervalRef.current); };
  }, [session, credentials]);

  useEffect(() => {
    if (!session || !credentials) return;
    const updateLtps = async () => {
      const open = positions.filter((p) => {
        const bq = parseInt(p.flBuyQty ?? p.cfBuyQty ?? p.buyQty ?? "0") || 0;
        const sq = parseInt(p.flSellQty ?? p.cfSellQty ?? p.sellQty ?? "0") || 0;
        const net = p.netQty !== undefined ? parseInt(p.netQty) : bq - sq;
        return net !== 0;
      });
      if (!open.length) return;
      const tokens = open.map((p) => {
        const sym = p.trdSym || "";
        const rawSeg = (p.exSeg || p.seg || "").toLowerCase();
        const seg = rawSeg || (sym.startsWith("SENSEX") ? "bse_fo" : "nse_fo");
        return { seg, sym, tok: p.tok || "" };
      });
      const ltps = await fetchLtps(credentials, session, tokens);
      setLiveLtps((prev) => ({ ...prev, ...ltps }));
    };
    if (ltpIntervalRef.current) clearInterval(ltpIntervalRef.current);
    ltpIntervalRef.current = setInterval(updateLtps, 1000);
    return () => { if (ltpIntervalRef.current) clearInterval(ltpIntervalRef.current); };
  }, [session, credentials, positions]);

  const refreshOrders = useCallback(async () => {
    if (!session || !credentials) return;
    setOrdersLoading(true);
    try {
      const data = await getOrderBook(credentials, session);
      if ((data?.stat || "").toLowerCase() === "ok" && Array.isArray(data?.data)) {
        const sorted = [...data.data].sort(
          (a: any, b: any) => parseInt(b.boeSec || "0") - parseInt(a.boeSec || "0")
        );
        setOrders(sorted);
      } else setOrders([]);
    } catch { setOrders([]); }
    setOrdersLoading(false);
  }, [session, credentials]);

  const refreshFunds = useCallback(async () => {
    if (!session || !credentials) return;
    setFundsLoading(true);
    try {
      const data = await getLimits(credentials, session);
      if ((data?.stat || "").toLowerCase() === "ok") {
        const d = Array.isArray(data?.data) ? data.data[0] : data?.data;
        if (d) {
          setFunds({
            available: d.net || d.cashAvailableForTrading || d.cashAvailable || d.availableMargin || d.availCash || "--",
            used: d.utilizedAmount || d.marginUsed || d.usedMargin || d.boUsedMargin || d.utilisedAmount || "--",
            collateral: d.collateral || d.collateralValue || d.collateralAmt || "--",
          });
        }
      }
    } catch {}
    setFundsLoading(false);
  }, [session, credentials]);

  const placeTradeOrder = useCallback(async (params: {
    es: string; ts: string; tt: "B" | "S"; qty: number;
  }) => {
    if (!session || !credentials) return { success: false, message: "Not connected" };
    const result = await placeOrder(credentials, session, params);
    if (result?.nOrdNo || result?.stat === "Ok") {
      refreshOrders();
      refreshPositions();
      return { success: true, message: `Order #${result.nOrdNo || "placed"}`, orderId: result.nOrdNo };
    }
    return { success: false, message: result?.emsg || result?.errMsg || "Order failed" };
  }, [session, credentials]);

  const cancelTradeOrder = useCallback(async (orderId: string) => {
    if (!session || !credentials) return { success: false, message: "Not connected" };
    const result = await cancelOrder(credentials, session, orderId);
    if (result?.nOrdNo || result?.stat === "Ok") {
      refreshOrders();
      return { success: true, message: `Cancelled #${result.nOrdNo || orderId}` };
    }
    return { success: false, message: result?.emsg || "Cancel failed" };
  }, [session, credentials]);

  const closeAll = useCallback(async () => {
    if (!session || !credentials) return { closed: 0 };
    const result = await closeAllPositions(credentials, session);
    refreshPositions();
    refreshOrders();
    return { closed: result.closed };
  }, [session, credentials]);

  return (
    <KotakCtx.Provider value={{
      credentials, session, isSetup: !!credentials, isConnected: !!session,
      isLoading, loadingMessage,
      saveCredentials, clearCredentials, connectWithTotp, disconnect,
      currentIndex, setCurrentIndex, spotPrices, expiries, selectedExpiry,
      setSelectedExpiry, numStrikes, setNumStrikes, chain, chainLoading, refreshChain,
      positions, posLoading, liveLtps, refreshPositions,
      orders, ordersLoading, refreshOrders,
      funds, fundsLoading, refreshFunds,
      placeTradeOrder, cancelTradeOrder, closeAll,
    }}>
      {children}
    </KotakCtx.Provider>
  );
}
