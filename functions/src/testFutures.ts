import * as functions from "firebase-functions";
import * as crypto from "crypto";
import axios from "axios";

/**
 * Helper: sign Binance API request with HMAC-SHA256.
 */
function sign(queryString: string, secret: string): string {
    return crypto.createHmac("sha256", secret).update(queryString).digest("hex");
}

/**
 * Helper: call signed Binance Futures endpoint.
 */
async function binanceGet(
    path: string,
    params: Record<string, string>,
    apiKey: string,
    apiSecret: string
): Promise<any> {
    const timestamp = Date.now();
    const recvWindow = "5000";
    const qs = new URLSearchParams({ ...params, timestamp: String(timestamp), recvWindow }).toString();
    const signature = sign(qs, apiSecret);
    const url = `https://fapi.binance.com${path}?${qs}&signature=${signature}`;
    const { data } = await axios.get(url, {
        headers: { "X-MBX-APIKEY": apiKey },
        timeout: 10000,
    });
    return data;
}

/**
 * Test function: reads Binance Futures positions with full detail.
 * Combines /fapi/v3/account + /fapi/v2/positionRisk for entry/liquidation prices.
 */
export const testFutures = functions
    .region("europe-west1")
    .https.onRequest(async (req, res) => {
        res.set("Access-Control-Allow-Origin", "*");

        if (req.method === "OPTIONS") {
            res.set("Access-Control-Allow-Methods", "GET");
            res.set("Access-Control-Allow-Headers", "Content-Type");
            res.status(204).send("");
            return;
        }

        const config = functions.config().binance;
        if (!config?.api_key || !config?.api_secret) {
            res.status(500).json({
                error: "Binance API keys not configured.",
                hint: "Run: firebase functions:config:set binance.api_key=... binance.api_secret=...",
            });
            return;
        }

        const { api_key: apiKey, api_secret: apiSecret } = config;

        try {
            // Call both endpoints in parallel
            const [accountRes, positionRes] = await Promise.all([
                binanceGet("/fapi/v3/account", {}, apiKey, apiSecret),
                binanceGet("/fapi/v2/positionRisk", {}, apiKey, apiSecret),
            ]);

            // Merge positionRisk data into account positions
            const positionMap = new Map<string, any>();
            for (const p of positionRes) {
                if (parseFloat(p.positionAmt) !== 0) {
                    positionMap.set(p.symbol, p);
                }
            }

            const enrichedPositions = accountRes.positions
                .filter((p: any) => parseFloat(p.positionAmt) !== 0)
                .map((p: any) => {
                    const risk = positionMap.get(p.symbol) || {};
                    return {
                        symbol: p.symbol,
                        side: parseFloat(p.positionAmt) > 0 ? "LONG" : "SHORT",
                        size: Math.abs(parseFloat(p.positionAmt)),
                        notional: Math.abs(parseFloat(p.notional)),
                        entryPrice: parseFloat(risk.entryPrice || "0"),
                        markPrice: parseFloat(risk.markPrice || "0"),
                        liquidationPrice: parseFloat(risk.liquidationPrice || "0"),
                        leverage: parseInt(risk.leverage || "1"),
                        unrealizedPnl: parseFloat(p.unrealizedProfit),
                        initialMargin: parseFloat(p.initialMargin),
                        maintMargin: parseFloat(p.maintMargin),
                        marginType: risk.marginType || "cross",
                        breakEvenPrice: parseFloat(risk.breakEvenPrice || "0"),
                        updateTime: p.updateTime,
                    };
                });

            res.json({
                account: {
                    totalWalletBalance: parseFloat(accountRes.totalWalletBalance),
                    totalUnrealizedProfit: parseFloat(accountRes.totalUnrealizedProfit),
                    totalMarginBalance: parseFloat(accountRes.totalMarginBalance),
                    totalInitialMargin: parseFloat(accountRes.totalInitialMargin),
                    totalMaintMargin: parseFloat(accountRes.totalMaintMargin),
                    availableBalance: parseFloat(accountRes.availableBalance),
                    maxWithdrawAmount: parseFloat(accountRes.maxWithdrawAmount),
                },
                positions: enrichedPositions,
            });
        } catch (e: any) {
            const errData = e.response?.data || { message: e.message };
            console.error("[testFutures] Binance API error:", errData);
            res.status(e.response?.status || 500).json({
                error: "Binance API error",
                details: errData,
            });
        }
    });
