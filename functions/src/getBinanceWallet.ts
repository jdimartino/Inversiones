import * as functions from "firebase-functions/v1";
import * as crypto from "crypto";
import axios from "axios";
import { defineSecret } from "firebase-functions/params";

const binanceConfigRaw = defineSecret("FUNCTIONS_CONFIG_EXPORT");

function sign(queryString: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(queryString).digest("hex");
}

async function binanceRequest(
  path: string,
  method: "GET" | "POST",
  params: Record<string, string>,
  apiKey: string,
  apiSecret: string
): Promise<any> {
  const timestamp = Date.now();
  const baseParams = { ...params, timestamp: String(timestamp), recvWindow: "5000" };
  const qs = new URLSearchParams(baseParams).toString();
  const signature = sign(qs, apiSecret);
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

export const getBinanceWallet = functions
  .region("europe-west1")
  .runWith({ secrets: ["FUNCTIONS_CONFIG_EXPORT"] })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    try {
      const raw = binanceConfigRaw.value();
      const bConfig = JSON.parse(raw).binance;
      if (!bConfig?.api_key || !bConfig?.api_secret) {
        res.status(500).json({ error: "Binance API keys not configured" });
        return;
      }

      const { api_key: apiKey, api_secret: apiSecret } = bConfig;

      let fundingAssets: any[];
      try {
        fundingAssets = await binanceRequest(
          "/sapi/v1/asset/get-funding-asset",
          "POST",
          {},
          apiKey,
          apiSecret
        );
      } catch (e: any) {
        console.error("[getBinanceWallet] Funding asset error:", e.response?.data || e.message);
        fundingAssets = [];
      }

      let spotBalances: any[] = [];
      try {
        const accountInfo = await binanceRequest(
          "/api/v3/account",
          "GET",
          {},
          apiKey,
          apiSecret
        );
        spotBalances = (accountInfo.balances || []).filter(
          (b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0
        );
      } catch (e: any) {
        console.error("[getBinanceWallet] Spot account error:", e.response?.data || e.message);
        res.status(500).json({ error: "Spot fetch failed: " + (e.response?.data?.msg || e.message) });
        return;
      }

      const result: Record<string, { funding: number; spot: number }> = {};

      for (const asset of fundingAssets) {
        const coin = asset.asset || asset.coin;
        const amount = parseFloat(asset.free || asset.amount || "0");
        if (!result[coin]) result[coin] = { funding: 0, spot: 0 };
        result[coin].funding += amount;
      }

      for (const b of spotBalances) {
        const coin = b.asset;
        const free = parseFloat(b.free);
        const locked = parseFloat(b.locked);
        const total = free + locked;
        if (total <= 0) continue;
        if (!result[coin]) result[coin] = { funding: 0, spot: 0 };
        result[coin].spot += total;
      }

      const funding: Record<string, number> = {};
      const spot: Record<string, number> = {};
      for (const [coin, balances] of Object.entries(result)) {
        if (balances.funding > 0) funding[coin] = balances.funding;
        if (balances.spot > 0) spot[coin] = balances.spot;
      }

      if (!funding["USDT"]) funding["USDT"] = 0;
      if (!spot["USDT"]) spot["USDT"] = 0;

      res.json({ funding, spot });
    } catch (error: any) {
      console.error("[getBinanceWallet] Error:", error.message);
      res.status(500).json({ error: error.message || "Failed to fetch wallet balances" });
    }
  });