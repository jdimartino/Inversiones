import { useState, useEffect, useCallback, useRef } from "react";

const CACHE_KEY = "bcv_rate_cache";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface BcvRateCache {
    usd: number;
    eur: number;
    updatedAt: string;
    fetchedAt: number;
}

export interface BcvRate {
    usd: number;
    eur: number;
    updatedAt: string;
    loading: boolean;
    error: string | null;
}

function getCachedRate(): BcvRateCache | null {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const cached: BcvRateCache = JSON.parse(raw);
        if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) return null;
        return cached;
    } catch {
        return null;
    }
}

function setCachedRate(data: BcvRateCache) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch { /* ignore */ }
}

export function useBcvRate(): BcvRate {
    const [rate, setRate] = useState<BcvRate>(() => {
        const cached = getCachedRate();
        return {
            usd: cached?.usd ?? 0,
            eur: cached?.eur ?? 0,
            updatedAt: cached?.updatedAt ?? "",
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
            const res = await fetch("https://bcv.today/api/v1/rate.json", {
                signal: controller.signal,
                cache: "no-cache",
            });
            if (!res.ok) throw new Error(`BCV API ${res.status}`);
            const data = await res.json();

            const newRate: BcvRateCache = {
                usd: data.USD,
                eur: data.EUR,
                updatedAt: data.updated_at,
                fetchedAt: Date.now(),
            };
            setCachedRate(newRate);

            setRate({
                usd: newRate.usd,
                eur: newRate.eur,
                updatedAt: newRate.updatedAt,
                loading: false,
                error: null,
            });
        } catch (e: unknown) {
            if (e instanceof DOMException && e.name === "AbortError") return;
            console.error("Error fetching BCV rate:", e);
            setRate((prev) => ({
                ...prev,
                loading: false,
                error: "Error obteniendo tasa BCV",
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
