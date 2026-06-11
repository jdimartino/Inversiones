import * as functions from "firebase-functions/v1";
import * as crypto from "crypto";
import axios from "axios";
import { defineSecret } from "firebase-functions/params";

const configRaw = defineSecret("FUNCTIONS_CONFIG_EXPORT");

const BYBIT_BASE = "https://api.bybit.com";

function sign(timestamp: string, apiKey: string, recvWindow: string, queryString: string, secret: string): string {
  const signStr = timestamp + apiKey + recvWindow + queryString;
  return crypto.createHmac("sha256", secret).update(signStr).digest("hex");
}

async function bybitRequest<T>(
  path: string,
  params: Record<string, string>,
  apiKey: string,
  apiSecret: string
): Promise<T> {
  const timestamp = Date.now().toString();
  const recvWindow = "5000";
  const queryString = new URLSearchParams(params).toString();
  const signature = sign(timestamp, apiKey, recvWindow, queryString, apiSecret);

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
