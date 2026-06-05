import * as functions from "firebase-functions/v1";
import * as crypto from "crypto";
import axios from "axios";
import { defineSecret } from "firebase-functions/params";

const binanceConfigRaw = defineSecret("FUNCTIONS_CONFIG_EXPORT");

function sign(queryString: string, secret: string): string {
    return crypto.createHmac("sha256", secret).update(queryString).digest("hex");
}

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

export interface PositionOrder {
    orderId: number;
    symbol: string;
    side: "BUY" | "SELL";
    type: string;
    time: number;
    updateTime: number;
    executedQty: number;
    cumQuote: number;
    avgPrice: number;
    status: string;
    price: number;
    origQty: number;
    commission?: number;
}

/**
 * On-demand: fetch all orders for a specific symbol.
 * Binance allOrders endpoint allows up to 30 days history.
 * Called from the frontend only when user clicks a position.
 */
export const getFuturesTrades = functions
    .region("europe-west1")
    .runWith({ secrets: ["FUNCTIONS_CONFIG_EXPORT"] })
    .https.onRequest(async (req, res) => {
        res.set("Access-Control-Allow-Origin", "*");

        if (req.method === "OPTIONS") {
            res.set("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
            res.set("Access-Control-Allow-Headers", "Content-Type");
            res.status(204).send("");
            return;
        }

        const symbol = req.query.symbol as string | undefined;
        if (!symbol) {
            res.status(400).json({ error: "Missing 'symbol' query parameter" });
            return;
        }

        // Binance allOrders max time interval is 30 days
        const endTime = Date.now();
        const startTime = endTime - 30 * 24 * 60 * 60 * 1000;

        const bConfig = JSON.parse(binanceConfigRaw.value()).binance;
        if (!bConfig?.api_key || !bConfig?.api_secret) {
            res.status(500).json({ error: "Binance API keys not configured." });
            return;
        }

        const { api_key: apiKey, api_secret: apiSecret } = bConfig;

        try {
            const params: Record<string, string> = {
                symbol,
                startTime: String(startTime),
                endTime: String(endTime),
                limit: "1000",
            };

            let allOrders: any[] = await binanceGet("/fapi/v1/allOrders", params, apiKey, apiSecret);

            // Filter to only filled orders with executed quantity
            const filledOrders = allOrders.filter((o: any) =>
                o.status === "FILLED" && parseFloat(o.executedQty) > 0
            );

            const formatted: PositionOrder[] = filledOrders.map((o: any) => ({
                orderId: o.orderId,
                symbol: o.symbol,
                side: o.side,
                type: o.type,
                time: o.time,
                updateTime: o.updateTime,
                executedQty: parseFloat(o.executedQty),
                cumQuote: parseFloat(o.cumQuote || "0"),
                avgPrice: parseFloat(o.avgPrice || "0"),
                status: o.status,
                price: parseFloat(o.price || "0"),
                origQty: parseFloat(o.origQty || "0"),
            }));

            // Sort newest first
            formatted.sort((a, b) => b.time - a.time);

            res.json({ symbol, orders: formatted, count: formatted.length });
        } catch (e: any) {
            const errData = e.response?.data || { message: e.message };
            console.error("[getFuturesTrades] Binance API error:", JSON.stringify(errData, null, 2));
            res.status(e.response?.status || 500).json({
                error: "Binance API error",
                details: errData,
            });
        }
    });
