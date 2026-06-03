import { useState, useEffect, useCallback, useRef } from "react";
import { fetchBinancePrices, fetchDynamicPrices } from "../lib/binance";

const POLL_INTERVAL_MS = 15_000;

export type PriceDirection = "up" | "down" | "neutral";

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

            if (selectedCoins && selectedCoins.length > 0) {
                // Modo dinámico: fetch precios para monedas seleccionadas
                data = await fetchDynamicPrices(selectedCoins, controller.signal);
            } else {
                // Modo legacy: fetch solo las 13 monedas hardcodeadas
                data = await fetchBinancePrices(controller.signal);
            }

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

    useEffect(() => {
        refresh();
        const interval = setInterval(refresh, POLL_INTERVAL_MS);
        return () => {
            clearInterval(interval);
            abortRef.current?.abort();
        };
    }, [refresh]);

    return { prices, priceDirections, loading, error, refresh };
}
