import { useState, useCallback } from "react";

const STORAGE_KEY = "watchlist_coins";
const DEFAULT_COINS = [
    "BTC", "ETH", "SOL", "BNB", "XRP",
    "ADA", "DOGE", "AVAX", "DOT", "MATIC",
    "LINK", "UNI", "ATOM", "LTC", "NEAR",
    "ARB", "OP", "FIL", "APT", "SUI",
];

export function getWatchlistCoins(): string[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
    } catch {
        /* ignore */
    }
    return DEFAULT_COINS;
}

function saveWatchlistCoins(coins: string[]) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(coins));
    } catch {
        /* ignore */
    }
}

export function useWatchlistCoins() {
    const [watchlistCoins, setWatchlistCoinsState] = useState<string[]>(getWatchlistCoins);

    const setWatchlistCoins = useCallback((coins: string[]) => {
        saveWatchlistCoins(coins);
        setWatchlistCoinsState(coins);
    }, []);

    return { watchlistCoins, setWatchlistCoins };
}
