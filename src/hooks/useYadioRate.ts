import { useState, useEffect, useCallback, useRef } from "react";

const POLL_INTERVAL_MS = 60_000;

export interface YadioRate {
    p2pRate: number;
    loading: boolean;
    error: string | null;
}

export function useYadioRate(): YadioRate {
    const [rate, setRate] = useState<YadioRate>(() => ({
        p2pRate: 0,
        loading: true,
        error: null,
    }));
    const abortRef = useRef<AbortController | null>(null);

    const fetchRate = useCallback(async () => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setRate((prev) => ({ ...prev, loading: true, error: null }));

        try {
            const res = await fetch("https://api.yadio.io/json", {
                signal: controller.signal,
            });
            if (!res.ok) throw new Error(`Yadio API ${res.status}`);
            const data = await res.json();

            const p2pRate = data?.VES?.rate_p2p ?? 0;

            setRate({ p2pRate, loading: false, error: null });
        } catch (e: unknown) {
            if (e instanceof DOMException && e.name === "AbortError") return;
            console.error("Error fetching yadio rate:", e);
            setRate((prev) => ({
                ...prev,
                loading: false,
                error: "Error obteniendo tasa VES P2P",
            }));
        }
    }, []);

    useEffect(() => {
        fetchRate();
        const interval = setInterval(fetchRate, POLL_INTERVAL_MS);
        return () => {
            clearInterval(interval);
            abortRef.current?.abort();
        };
    }, [fetchRate]);

    return rate;
}