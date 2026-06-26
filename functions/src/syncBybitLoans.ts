import * as functions from "firebase-functions/v1";
import { defineSecret } from "firebase-functions/params";
import { bybitRequest } from "./apiClients";

const configRaw = defineSecret("FUNCTIONS_CONFIG_EXPORT");

export const syncBybitLoans = functions
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
      const raw = configRaw.value();
      const bConfig = JSON.parse(raw).bybit;
      if (!bConfig?.api_key || !bConfig?.api_secret) {
        res.status(500).json({ error: "Bybit API keys not configured" });
        return;
      }

      const apiKey = bConfig.api_key;
      const apiSecret = bConfig.api_secret;

      // 1. Position + Flexible Loans en paralelo
      const [position, flexibleLoans] = await Promise.all([
        bybitRequest<any>("/v5/crypto-loan-common/position", {}, apiKey, apiSecret).catch(() => null),
        bybitRequest<{ list: any[] }>("/v5/crypto-loan-flexible/ongoing-coin", {}, apiKey, apiSecret).catch(() => ({ list: [] })),
      ]);

      // 2. Extraer coins del colateral y fetchear thresholds
      const collateralCoins: string[] = position?.collateralList?.map((c: any) => c.currency) || [];
      const collateralResults = await Promise.all(
        collateralCoins.map((coin: string) =>
          bybitRequest<{ vipCoinList: { list: any[] }[] }>(
            "/v5/crypto-loan/collateral-data",
            { currency: coin },
            apiKey,
            apiSecret
          ).catch(() => null)
        )
      );

      // Mapear: por cada coin, la lista de collateral data
      const collateralData: Record<string, any[]> = {};
      collateralCoins.forEach((coin: string, i: number) => {
        const result = collateralResults[i];
        collateralData[coin] = result?.vipCoinList?.[0]?.list || [];
      });

      res.json({
        position: position || null,
        flexibleLoans: flexibleLoans?.list || [],
        collateralData,
      });
    } catch (error: any) {
      console.error("[syncBybitLoans] Error:", error.message);
      res.status(500).json({ error: error.message || "Failed to sync Bybit loans" });
    }
  });
