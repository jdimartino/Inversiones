import * as functions from "firebase-functions/v1";
import axios from "axios";

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
            const symbols = coins.map((c) => `${c}USDT`);
            const param = JSON.stringify(symbols);
            const type = (req.query.type as string) || "price";

            if (type === "prevClose") {
                const prevCloses: Record<string, number> = { USDT: 1 };

                const results = await Promise.all(
                    symbols.map(async (symbol) => {
                        const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=1d&limit=2`;
                        const response = await axios.get(url);
                        const prevBar = response.data[0];
                        return { symbol, prevClose: parseFloat(prevBar[4]) };
                    })
                );

                for (const { symbol, prevClose } of results) {
                    const coin = symbol.replace("USDT", "");
                    prevCloses[coin] = prevClose;
                }

                res.json(prevCloses);
            } else if (type === "24hr") {
                const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(param)}`;
                const response = await axios.get(url);

                const data: Record<string, { price: number; priceChange: number; priceChangePercent: number }> = {
                    USDT: { price: 1, priceChange: 0, priceChangePercent: 0 },
                };
                for (const ticker of response.data) {
                    const coin = ticker.symbol.replace("USDT", "");
                    data[coin] = {
                        price: parseFloat(ticker.lastPrice),
                        priceChange: parseFloat(ticker.priceChange),
                        priceChangePercent: parseFloat(ticker.priceChangePercent),
                    };
                }

                res.json(data);
            } else {
                const url = `https://api.binance.com/api/v3/ticker/price?symbols=${encodeURIComponent(param)}`;
                const response = await axios.get(url);

                const prices: Record<string, number> = { USDT: 1 };
                for (const ticker of response.data) {
                    const coin = ticker.symbol.replace("USDT", "");
                    prices[coin] = parseFloat(ticker.price);
                }

                res.json(prices);
            }
        } catch (error) {
            console.error("Error fetching Binance prices:", error);
            res.status(500).json({ error: "Failed to fetch prices" });
        }
    });
