import { useState, useEffect, useCallback, useRef } from "react";

const CACHE_KEY = "yadio_ves_rate_cache";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface YadioRateCache {
    p2pRate: number;
    fetchedAt: number;
}

export interface YadioRate {
    p2pRate: number;
    loading: boolean;
    error: string | null;
}

function getCachedRate(): YadioRateCache | null {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const cached: YadioRateCache = JSON.parse(raw);
        if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) return null;
        return cached;
    } catch {
        return null;
    }
}

function setCachedRate(data: YadioRateCache) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch { /* ignore */ }
}

export function useYadioRate(): YadioRate {
    const [rate, setRate] = useState<YadioRate>(() => {
        const cached = getCachedRate();
        return {
            p2pRate: cached?.p2pRate ?? 0,
            loading: !cached,
            error: null,
        };
    });
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

            const cache: YadioRateCache = { p2pRate, fetchedAt: Date.now() };
            setCachedRate(cache);

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
        const interval = setInterval(fetchRate, CACHE_TTL_MS);
        return () => {
            clearInterval(interval);
            abortRef.current?.abort();
        };
    }, [fetchRate]);

    return rate;
}