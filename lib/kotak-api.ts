import { fetch } from "expo/fetch";

const LOGIN_BASE = "https://mis.kotaksecurities.com";
const FALLBACK_BASE = "https://gw-napi.kotaksecurities.com";

const HARDCODED_CSV_URLS: Record<string, string> = {
  nse_fo: "https://gw-napi.kotaksecurities.com/Files/1.0/masterscrip/nse_fo.csv",
  bse_fo: "https://gw-napi.kotaksecurities.com/Files/1.0/masterscrip/bse_fo.csv",
};

export interface KotakCredentials {
  accessToken: string;
  mobileNumber: string;
  ucc: string;
  mpin: string;
}

export interface KotakSession {
  sessionToken: string;
  sessionSid: string;
  baseUrl: string;
  greetingName: string;
  loginTime: string;
}

export async function kotakLoginTotp(
  creds: KotakCredentials,
  totp: string
): Promise<{ status: "success"; viewToken: string; viewSid: string } | { status: "error"; message: string }> {
  try {
    const res = await fetch(`${LOGIN_BASE}/login/1.0/tradeApiLogin`, {
      method: "POST",
      headers: {
        Authorization: creds.accessToken,
        "neo-fin-key": "neotradeapi",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mobileNumber: creds.mobileNumber,
        ucc: creds.ucc,
        totp,
      }),
    });
    const data = await res.json();
    if (data?.data?.status === "success") {
      return { status: "success", viewToken: data.data.token, viewSid: data.data.sid };
    }
    return { status: "error", message: data?.message || data?.data?.message || "Login failed" };
  } catch (e: any) {
    return { status: "error", message: e?.message || "Network error" };
  }
}

export async function kotakValidateMpin(
  creds: KotakCredentials,
  viewToken: string,
  viewSid: string
): Promise<{ status: "success"; session: KotakSession } | { status: "error"; message: string }> {
  try {
    const res = await fetch(`${LOGIN_BASE}/login/1.0/tradeApiValidate`, {
      method: "POST",
      headers: {
        Authorization: creds.accessToken,
        "neo-fin-key": "neotradeapi",
        "Content-Type": "application/json",
        sid: viewSid,
        Auth: viewToken,
      },
      body: JSON.stringify({ mpin: creds.mpin }),
    });
    const data = await res.json();
    if (data?.data?.status === "success") {
      const d = data.data;
      return {
        status: "success",
        session: {
          sessionToken: d.token,
          sessionSid: d.sid,
          baseUrl: (d.baseUrl || FALLBACK_BASE).replace(/\/$/, ""),
          greetingName: d.greetingName || "",
          loginTime: new Date().toISOString(),
        },
      };
    }
    return { status: "error", message: data?.message || data?.data?.message || "MPIN validation failed" };
  } catch (e: any) {
    return { status: "error", message: e?.message || "Network error" };
  }
}

function postHeaders(creds: KotakCredentials, session: KotakSession) {
  return {
    accept: "application/json",
    Auth: session.sessionToken,
    Sid: session.sessionSid,
    "neo-fin-key": "neotradeapi",
    "Content-Type": "application/x-www-form-urlencoded",
  };
}

function quoteHeaders(creds: KotakCredentials) {
  return {
    Authorization: creds.accessToken,
    "Content-Type": "application/json",
  };
}

function getHeaders(session: KotakSession) {
  return {
    accept: "application/json",
    Auth: session.sessionToken,
    Sid: session.sessionSid,
    "neo-fin-key": "neotradeapi",
  };
}

export async function fetchScripPaths(creds: KotakCredentials, session: KotakSession): Promise<string[]> {
  try {
    const res = await fetch(`${session.baseUrl}/script-details/1.0/masterscrip/file-paths`, {
      headers: quoteHeaders(creds),
    });
    const data = await res.json();
    const paths =
      data?.data?.filesPaths ||
      data?.data?.filePaths ||
      data?.data?.files ||
      (Array.isArray(data?.data) ? data.data : null) ||
      data?.filesPaths ||
      data?.filePaths ||
      [];
    if (Array.isArray(paths) && paths.length > 0) return paths;
  } catch {}
  return Object.values(HARDCODED_CSV_URLS);
}

export async function fetchQuote(
  creds: KotakCredentials,
  session: KotakSession,
  seg: string,
  sym: string
): Promise<any> {
  try {
    const url = `${session.baseUrl}/script-details/1.0/quotes/neosymbol/${seg}|${sym}/ltp`;
    const res = await fetch(url, { headers: quoteHeaders(creds) });
    const data = await res.json();
    return Array.isArray(data) ? data[0] : data;
  } catch {
    return {};
  }
}

export async function getSpotPrice(
  creds: KotakCredentials,
  session: KotakSession,
  index: string
): Promise<number> {
  const map: Record<string, [string, string]> = {
    NIFTY: ["nse_cm", "Nifty 50"],
    BANKNIFTY: ["nse_cm", "Nifty Bank"],
    SENSEX: ["bse_cm", "SENSEX"],
  };
  const [seg, sym] = map[index.toUpperCase()] || ["nse_cm", "Nifty 50"];
  const q = await fetchQuote(creds, session, seg, sym);
  return parseFloat(q?.ltp || "0") || 0;
}

export async function placeOrder(
  creds: KotakCredentials,
  session: KotakSession,
  params: {
    es: string;
    ts: string;
    tt: "B" | "S";
    qty: number;
    pc?: string;
    pt?: string;
    pr?: string;
    tp?: string;
  }
): Promise<any> {
  const jData = JSON.stringify({
    am: "NO",
    dq: "0",
    es: params.es,
    mp: "0",
    pc: params.pc || "MIS",
    pf: "N",
    pr: params.pr || "0",
    pt: params.pt || "MKT",
    qt: String(params.qty),
    rt: "DAY",
    tp: params.tp || "0",
    ts: params.ts,
    tt: params.tt,
  });
  try {
    const res = await fetch(`${session.baseUrl}/quick/order/rule/ms/place`, {
      method: "POST",
      headers: postHeaders(creds, session),
      body: `jData=${encodeURIComponent(jData)}`,
    });
    const result = await res.json();
    if (result?.stat === "Not_Ok" && (result?.errMsg || result?.emsg || "").includes("LTP")) {
      const q = await fetchQuote(creds, session, params.es, params.ts);
      const ltp = parseFloat(q?.ltp || "0");
      if (ltp > 0) {
        const pr = (ltp * (params.tt === "B" ? 1.002 : 0.998)).toFixed(2);
        const jData2 = JSON.stringify({ ...JSON.parse(jData), pt: "L", pr });
        const res2 = await fetch(`${session.baseUrl}/quick/order/rule/ms/place`, {
          method: "POST",
          headers: postHeaders(creds, session),
          body: `jData=${encodeURIComponent(jData2)}`,
        });
        return await res2.json();
      }
    }
    return result;
  } catch (e: any) {
    return { stat: "Not_Ok", emsg: e?.message || "Order failed" };
  }
}

export async function cancelOrder(
  creds: KotakCredentials,
  session: KotakSession,
  orderId: string
): Promise<any> {
  try {
    const jData = JSON.stringify({ on: orderId, am: "NO" });
    const res = await fetch(`${session.baseUrl}/quick/order/cancel`, {
      method: "POST",
      headers: postHeaders(creds, session),
      body: `jData=${encodeURIComponent(jData)}`,
    });
    return await res.json();
  } catch (e: any) {
    return { stat: "Not_Ok", emsg: e?.message };
  }
}

export async function getOrderBook(
  creds: KotakCredentials,
  session: KotakSession
): Promise<any> {
  try {
    const res = await fetch(`${session.baseUrl}/quick/user/orders`, {
      headers: getHeaders(session),
    });
    return await res.json();
  } catch (e: any) {
    return { stat: "Not_Ok", emsg: e?.message };
  }
}

export async function getPositions(
  creds: KotakCredentials,
  session: KotakSession
): Promise<any> {
  try {
    const res = await fetch(`${session.baseUrl}/quick/user/positions`, {
      headers: getHeaders(session),
    });
    return await res.json();
  } catch (e: any) {
    return { stat: "Not_Ok", emsg: e?.message };
  }
}

export async function getLimits(
  creds: KotakCredentials,
  session: KotakSession
): Promise<any> {
  try {
    const jData = JSON.stringify({ seg: "ALL", exch: "ALL", prod: "ALL" });
    const res = await fetch(`${session.baseUrl}/quick/user/limits`, {
      method: "POST",
      headers: postHeaders(creds, session),
      body: `jData=${encodeURIComponent(jData)}`,
    });
    return await res.json();
  } catch (e: any) {
    return { stat: "Not_Ok", emsg: e?.message };
  }
}

export async function fetchLtps(
  creds: KotakCredentials,
  session: KotakSession,
  tokens: Array<{ seg: string; sym: string; tok: string }>
): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  await Promise.all(
    tokens.map(async (t) => {
      try {
        const id = t.tok || t.sym;
        const q = await fetchQuote(creds, session, t.seg, id);
        const ltp = parseFloat(q?.ltp || "0");
        if (ltp > 0 && t.sym) result[t.sym] = ltp;
      } catch {}
    })
  );
  return result;
}

export async function closeAllPositions(
  creds: KotakCredentials,
  session: KotakSession
): Promise<{ closed: number; results: any[] }> {
  const posResp = await getPositions(creds, session);
  if ((posResp?.stat || "").toLowerCase() !== "ok" || !posResp?.data?.length) {
    return { closed: 0, results: [] };
  }
  const results: any[] = [];
  for (const pos of posResp.data) {
    const buyQ = parseInt(pos.flBuyQty ?? pos.cfBuyQty ?? pos.buyQty ?? "0") || 0;
    const sellQ = parseInt(pos.flSellQty ?? pos.cfSellQty ?? pos.sellQty ?? "0") || 0;
    const netQty = pos.netQty !== undefined ? parseInt(pos.netQty) : buyQ - sellQ;
    if (netQty === 0) continue;
    const ts = pos.trdSym || "";
    const rawSeg = (pos.seg || pos.exSeg || "").toLowerCase();
    const es = rawSeg || (ts.startsWith("SENSEX") ? "bse_fo" : "nse_fo");
    if (!ts) continue;
    const tt: "B" | "S" = netQty > 0 ? "S" : "B";
    const qty = Math.abs(netQty);
    const r = await placeOrder(creds, session, { es, ts, tt, qty });
    results.push({ symbol: ts, qty, side: tt, result: r });
  }
  return { closed: results.length, results };
}
