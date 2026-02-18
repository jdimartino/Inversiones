import { useState, useEffect, useCallback, useRef } from "react";
import { fetchBinancePrices } from "../lib/binance";

const POLL_INTERVAL_MS = 30_000;

export function usePrices() {
    const [prices, setPrices] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const refresh = useCallback(async () => {
        // Cancel any in-flight request
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        setError(null);

        try {
            const data = await fetchBinancePrices(controller.signal);
            setPrices(data);
        } catch (e: unknown) {
            if (e instanceof DOMException && e.name === "AbortError") return;
            console.error("Error fetching prices:", e);
            setError("Error obteniendo precios");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
        const interval = setInterval(refresh, POLL_INTERVAL_MS);
        return () => {
            clearInterval(interval);
            abortRef.current?.abort();
        };
    }, [refresh]);

    return { prices, loading, error, refresh };
}
