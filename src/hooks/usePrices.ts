import { useState, useEffect, useCallback, useRef } from "react";
import { fetchDynamicPrices, fetchPrevClosePrices } from "../lib/binance";
import { fetchBybitTickers } from "../lib/bybit";
import { AVAILABLE_COINS } from "../lib/constants";

const POLL_INTERVAL_MS = 15_000;
const EUR_COIN = "EUR";

export type PriceDirection = "up" | "down" | "neutral";

async function fetchEuroPrice(): Promise<number | null> {
    try {
        const res = await fetch("https://api.frankfurter.dev/v1/latest?from=EUR&to=USD");
        if (!res.ok) return null;
        const data = await res.json();
        return data.rates?.USD ?? null;
    } catch {
        return null;
    }
}

/**
 * Hook para obtener precios de Binance.
 * - Si selectedCoins es null/undefined, usa fetchBinancePrices (las 13 monedas hardcodeadas)
 * - Si selectedCoins es un array, usa fetchDynamicPrices (monedas dinámicas)
 */
export function usePrices(selectedCoins?: string[]) {
    const [prices, setPrices] = useState<Record<string, number>>({});
    const [priceDirections, setPriceDirections] = useState<
        Record<string, PriceDirection>
    >({});
    const [prevDailyCloses, setPrevDailyCloses] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const prevPricesRef = useRef<Record<string, number>>({});

    const refresh = useCallback(async () => {
        // Cancel any in-flight request
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        setError(null);

        try {
            let data: Record<string, number>;

            const coinsToFetch = selectedCoins && selectedCoins.length > 0 ? selectedCoins : AVAILABLE_COINS;
            const needsEuro = coinsToFetch.includes(EUR_COIN);
            const bybitCoins = coinsToFetch.filter(c => c.endsWith('EUR') && c !== EUR_COIN);
            const binanceCoins = coinsToFetch.filter(c => !c.endsWith('EUR') && c !== EUR_COIN);

            const promises: Promise<Record<string, number>>[] = [
                binanceCoins.length > 0 ? fetchDynamicPrices(binanceCoins, controller.signal) : Promise.resolve({ USDT: 1.0 }),
                bybitCoins.length > 0 ? fetchBybitTickers(bybitCoins) : Promise.resolve({})
            ];

            if (needsEuro) {
                promises.push(
                    fetchEuroPrice().then(price => price ? { [EUR_COIN]: price } as Record<string, number> : {})
                );
            }

            const results = await Promise.all(promises);
            data = Object.assign({}, ...results);
            if (!data.USDT) data.USDT = 1.0;

            const dirs: Record<string, PriceDirection> = {};
            for (const coin of Object.keys(data)) {
                const prev = prevPricesRef.current[coin];
                dirs[coin] =
                    prev === undefined
                        ? "neutral"
                        : data[coin] > prev
                          ? "up"
                          : data[coin] < prev
                            ? "down"
                            : "neutral";
            }
            prevPricesRef.current = data;
            setPriceDirections(dirs);
            setPrices(data);
        } catch (e: unknown) {
            if (e instanceof DOMException && e.name === "AbortError") return;
            console.error("Error fetching prices:", e);
            setError("Error obteniendo precios");
        } finally {
            setLoading(false);
        }
    }, [selectedCoins]);

    // Fetch previous daily close prices once on mount / when coins change
    useEffect(() => {
        const coinsToFetch = selectedCoins && selectedCoins.length > 0 ? selectedCoins : AVAILABLE_COINS;
        const binanceCoins = coinsToFetch.filter(c => !c.endsWith('EUR'));
        
        if (binanceCoins.length === 0) return;

        const controller = new AbortController();
        fetchPrevClosePrices(binanceCoins, controller.signal)
            .then(setPrevDailyCloses)
            .catch((e) => {
                if (e instanceof DOMException && e.name === "AbortError") return;
                console.error("Error fetching prev close prices:", e);
            });

        return () => controller.abort();
    }, [selectedCoins]);

    useEffect(() => {
        refresh();
        const interval = setInterval(refresh, POLL_INTERVAL_MS);
        return () => {
            clearInterval(interval);
            abortRef.current?.abort();
        };
    }, [refresh]);

    return { prices, priceDirections, prevDailyCloses, loading, error, refresh };
}
