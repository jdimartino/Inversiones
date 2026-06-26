import * as crypto from "crypto";
import axios from "axios";

// ─── Binance ───────────────────────────────────────────────────────

function signBinance(queryString: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(queryString).digest("hex");
}

export async function binanceRequest(
  path: string,
  method: "GET" | "POST",
  params: Record<string, string>,
  apiKey: string,
  apiSecret: string
): Promise<any> {
  const timestamp = Date.now();
  const baseParams = { ...params, timestamp: String(timestamp), recvWindow: "5000" };
  const qs = new URLSearchParams(baseParams).toString();
  const signature = signBinance(qs, apiSecret);
  const url = `https://api.binance.com${path}?${qs}&signature=${signature}`;
  const config: any = {
    headers: { "X-MBX-APIKEY": apiKey },
    timeout: 10000,
  };
  if (method === "POST") {
    config.headers["Content-Type"] = "application/json";
  }
  const { data } = method === "POST"
    ? await axios.post(url, null, config)
    : await axios.get(url, config);
  return data;
}

// ─── Bybit ─────────────────────────────────────────────────────────

const BYBIT_BASE = "https://api.bybit.com";

function signBybit(timestamp: string, apiKey: string, recvWindow: string, queryString: string, secret: string): string {
  const signStr = timestamp + apiKey + recvWindow + queryString;
  return crypto.createHmac("sha256", secret).update(signStr).digest("hex");
}

export async function bybitRequest<T>(
  path: string,
  params: Record<string, string>,
  apiKey: string,
  apiSecret: string
): Promise<T> {
  const timestamp = Date.now().toString();
  const recvWindow = "5000";
  const queryString = new URLSearchParams(params).toString();
  const signature = signBybit(timestamp, apiKey, recvWindow, queryString, apiSecret);

  const url = `${BYBIT_BASE}${path}${queryString ? "?" + queryString : ""}`;

  const { data } = await axios.get(url, {
    headers: {
      "X-BAPI-API-KEY": apiKey,
      "X-BAPI-TIMESTAMP": timestamp,
      "X-BAPI-SIGN": signature,
      "X-BAPI-RECV-WINDOW": recvWindow,
    },
    timeout: 10000,
  });

  if (data.retCode !== 0) {
    throw new Error(`Bybit error ${data.retCode}: ${data.retMsg}`);
  }

  return data.result as T;
}
