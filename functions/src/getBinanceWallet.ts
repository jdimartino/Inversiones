import * as functions from "firebase-functions/v1";
import { defineSecret } from "firebase-functions/params";
import { binanceRequest } from "./apiClients";

const binanceConfigRaw = defineSecret("FUNCTIONS_CONFIG_EXPORT");

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

      const [fundingAssets, accountInfo] = await Promise.all([
        binanceRequest("/sapi/v1/asset/get-funding-asset", "POST", {}, apiKey, apiSecret)
          .catch((e: any) => {
            console.error("[getBinanceWallet] Funding asset error:", e.response?.data || e.message);
            return [];
          }),
        binanceRequest("/api/v3/account", "GET", {}, apiKey, apiSecret)
          .catch((e: any) => {
            console.error("[getBinanceWallet] Spot account error:", e.response?.data || e.message);
            throw new Error("Spot fetch failed: " + (e.response?.data?.msg || e.message));
          }),
      ]);

      const spotBalances = (accountInfo.balances || []).filter(
        (b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0
      );

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

export const syncBinanceLoans = functions
  .region("europe-west1")
  .runWith({ secrets: ["FUNCTIONS_CONFIG_EXPORT"] })
  .https.onRequest(async (req, res) => {
    // Enable CORS
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

      const apiKey = bConfig.api_key;
      const apiSecret = bConfig.api_secret;

      const [ongoing, collateral, loanable] = await Promise.all([
        binanceRequest("/sapi/v2/loan/flexible/ongoing/orders", "GET", {}, apiKey, apiSecret).catch(e => ({ rows: [] })),
        binanceRequest("/sapi/v2/loan/flexible/collateral/data", "GET", {}, apiKey, apiSecret).catch(e => ({ rows: [] })),
        binanceRequest("/sapi/v2/loan/flexible/loanable/data", "GET", {}, apiKey, apiSecret).catch(e => ({ rows: [] }))
      ]);

      res.json({
        ongoing: ongoing.rows || [],
        collateral: collateral.rows || [],
        loanable: loanable.rows || []
      });
    } catch (error: any) {
      console.error("[syncBinanceLoans] Error:", error.message);
      res.status(500).json({ error: error.message || "Failed to sync Binance loans" });
    }
  });