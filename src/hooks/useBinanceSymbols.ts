import { useState, useEffect } from "react";

const CACHE_KEY = "binance_usdt_symbols";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

interface BinanceSymbol {
    symbol: string;
    baseAsset: string;
    quoteAsset: string;
    status: string;
}

interface CacheEntry {
    symbols: string[];
    timestamp: number;
}

function getCachedSymbols(): string[] | null {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const entry: CacheEntry = JSON.parse(raw);
        if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
            localStorage.removeItem(CACHE_KEY);
            return null;
        }
        return entry.symbols;
    } catch {
        localStorage.removeItem(CACHE_KEY);
        return null;
    }
}

function setCachedSymbols(symbols: string[]) {
    const entry: CacheEntry = { symbols, timestamp: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
}

export function useBinanceSymbols() {
    const [symbols, setSymbols] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const cached = getCachedSymbols();
        if (cached && cached.length > 0) {
            setSymbols(cached);
            setLoading(false);
            return;
        }

        let cancelled = false;

        (async () => {
            try {
                const res = await fetch(
                    "https://api.binance.com/api/v3/exchangeInfo"
                );
                if (!res.ok)
                    throw new Error(`Binance API ${res.status}`);
                const data: { symbols: BinanceSymbol[] } = await res.json();

                const usdtPairs = data.symbols
                    .filter(
                        (s) =>
                            s.status === "TRADING" &&
                            s.quoteAsset === "USDT"
                    )
                    .map((s) => s.baseAsset)
                    .sort();

                // Quitar duplicados
                const unique = Array.from(new Set(usdtPairs));

                if (!cancelled) {
                    setSymbols(unique);
                    setCachedSymbols(unique);
                    setLoading(false);
                }
            } catch (e: unknown) {
                if (!cancelled) {
                    setError(
                        e instanceof Error ? e.message : "Error desconocido"
                    );
                    setLoading(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    return { symbols, loading, error };
}