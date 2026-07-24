import * as functions from "firebase-functions/v1";
import axios from "axios";

const priceCache: Record<string, { ts: number; data: any }> = {};
const lastGoodCache: Record<string, { ts: number; data: any }> = {};
const CACHE_TTL_MS = 10_000;
const STALE_TTL_MS = 120_000;

const COINGECKO_IDS: Record<string, string> = {
    BTC: "bitcoin",
    ETH: "ethereum",
    ADA: "cardano",
    DOGE: "dogecoin",
    LTC: "litecoin",
    BNB: "binancecoin",
    SOL: "solana",
    XRP: "ripple",
    DOT: "polkadot",
    MATIC: "matic-network",
    SHIB: "shiba-inu",
    AVAX: "avalanche-2",
    LINK: "chainlink",
    UNI: "uniswap",
    ATOM: "cosmos",
    NEAR: "near",
    ARB: "arbitrum",
    OP: "optimism",
    FIL: "filecoin",
    APT: "aptos",
    SUI: "sui",
};

function getCoingeckoId(coin: string): string | null {
    return COINGECKO_IDS[coin] || null;
}

export const getBinancePrices = functions
    .region("europe-west1")
    .https.onRequest(async (req, res) => {
        res.set("Access-Control-Allow-Origin", "*");
        res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
        res.set("Access-Control-Allow-Headers", "Content-Type");

        if (req.method === "OPTIONS") {
            res.status(204).send("");
            return;
        }

        try {
            const coinsParam = req.query.coins as string;
            if (!coinsParam) {
                res.status(400).json({ error: "Missing ?coins= param" });
                return;
            }

            const coins = coinsParam.split(",").map((c) => c.trim().toUpperCase());
            const type = (req.query.type as string) || "price";

            const cacheKey = `${type}:${coinsParam}`;
            const now = Date.now();
            if (priceCache[cacheKey] && now - priceCache[cacheKey].ts < CACHE_TTL_MS) {
                res.json(priceCache[cacheKey].data);
                return;
            }

            const ids = coins
                .map((c) => ({ coin: c, id: getCoingeckoId(c) }))
                .filter((entry): entry is { coin: string; id: string } => entry.id !== null);

            if (type === "prevClose") {
                const prevCloses: Record<string, number> = { USDT: 1 };

                for (const { coin, id } of ids) {
                    try {
                        const { data: cgData } = await axios.get(
                            `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=2`,
                            { timeout: 10000 }
                        );
                        if (cgData.prices?.length >= 2) {
                            prevCloses[coin] = cgData.prices[0][1];
                        }
                    } catch (e) {
                        console.warn(`[getBinancePrices] Skipping ${coin} (prevClose):`, (e as any).message);
                    }
                }

                priceCache[cacheKey] = { ts: now, data: prevCloses };
                res.json(prevCloses);
            } else if (type === "24hr") {
                const data: Record<string, { price: number; priceChange: number; priceChangePercent: number }> = {
                    USDT: { price: 1, priceChange: 0, priceChangePercent: 0 },
                };

                if (ids.length > 0) {
                    const idStr = ids.map((e) => e.id).join(",");
                    try {
                        const { data: cgData } = await axios.get(
                            `https://api.coingecko.com/api/v3/simple/price?ids=${idStr}&vs_currencies=usd&include_24hr_change=true`,
                            { timeout: 10000 }
                        );
                        for (const { coin, id } of ids) {
                            if (cgData[id]?.usd !== undefined) {
                                const price = cgData[id].usd;
                                const changePercent = cgData[id].usd_24h_change || 0;
                                const change = price * (changePercent / (100 + changePercent));
                                data[coin] = {
                                    price,
                                    priceChange: change,
                                    priceChangePercent: changePercent,
                                };
                            }
                        }
                    } catch (e) {
                        console.error("[getBinancePrices] CoinGecko 24hr error:", (e as any).message);
                    }
                }

                priceCache[cacheKey] = { ts: now, data };
                res.json(data);
            } else {
                const prices: Record<string, number> = { USDT: 1 };

                if (ids.length > 0) {
                    const idStr = ids.map((e) => e.id).join(",");
                    try {
                        const { data: cgData } = await axios.get(
                            `https://api.coingecko.com/api/v3/simple/price?ids=${idStr}&vs_currencies=usd`,
                            { timeout: 10000 }
                        );
                        for (const { coin, id } of ids) {
                            if (cgData[id]?.usd !== undefined) {
                                prices[coin] = cgData[id].usd;
                            }
                        }
                    } catch (e) {
                        console.error("[getBinancePrices] CoinGecko price error:", (e as any).message);
                        const stale = lastGoodCache[cacheKey];
                        if (stale && now - stale.ts < STALE_TTL_MS) {
                            console.warn("[getBinancePrices] Serving stale cache");
                            res.json(stale.data);
                            return;
                        }
                    }
                }

                const gotRealPrices = Object.keys(prices).length > 1;
                if (gotRealPrices) {
                    priceCache[cacheKey] = { ts: now, data: prices };
                    lastGoodCache[cacheKey] = { ts: now, data: prices };
                } else {
                    const stale = lastGoodCache[cacheKey];
                    if (stale && now - stale.ts < STALE_TTL_MS) {
                        console.warn("[getBinancePrices] Only USDT, serving stale cache");
                        res.json(stale.data);
                        return;
                    }
                }

                for (const coin of coins) {
                    if (!(coin in prices) && coin !== "USDT") {
                        console.warn(`[getBinancePrices] No price found for ${coin}`);
                    }
                }

                res.json(prices);
            }
        } catch (error) {
            console.error("Error fetching Binance prices:", error);
            res.status(500).json({ error: "Failed to fetch prices" });
        }
    });
