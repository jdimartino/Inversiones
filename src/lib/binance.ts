import { SYMBOL_MAP } from "./constants";
import { FIREBASE_FUNCTIONS_URL } from "./firebase";

const CLOUD_FUNCTION_URL = `${FIREBASE_FUNCTIONS_URL}/getBinancePrices`;

/**
 * Fetch prices for the default 13 coins via the Cloud Function.
 */
export async function fetchBinancePrices(
    signal?: AbortSignal
): Promise<Record<string, number>> {
    const coins = Object.keys(SYMBOL_MAP);
    return fetchDynamicPrices(coins, signal);
}

/**
 * Fetch prices for arbitrary coins via the Cloud Function.
 * coins: array of base assets like ["BTC", "ETH", "SOL"]
 * Returns: { BTC: 67000, ETH: 3500, USDT: 1, ... }
 */
export async function fetchDynamicPrices(
    coins: string[],
    signal?: AbortSignal
): Promise<Record<string, number>> {
    if (coins.length === 0) return { USDT: 1.0 };

    const coinsParam = coins.join(",");
    const url = `${CLOUD_FUNCTION_URL}?coins=${encodeURIComponent(coinsParam)}`;

    const response = await fetch(url, { signal });

    if (!response.ok) {
        throw new Error(
            `Binance prices API ${response.status}: ${response.statusText}`
        );
    }

    const data: Record<string, number> = await response.json();

    if (!data.USDT) data.USDT = 1.0;

    return data;
}

/**
 * Fetch previous daily close prices for arbitrary coins.
 * Returns: { BTC: 66500, ETH: 3400, USDT: 1, ... }
 */
export async function fetchPrevClosePrices(
    coins: string[],
    signal?: AbortSignal
): Promise<Record<string, number>> {
    if (coins.length === 0) return { USDT: 1.0 };

    const coinsParam = coins.join(",");
    const url = `${CLOUD_FUNCTION_URL}?coins=${encodeURIComponent(coinsParam)}&type=prevClose`;

    const response = await fetch(url, { signal });

    if (!response.ok) {
        throw new Error(
            `Binance prevClose API ${response.status}: ${response.statusText}`
        );
    }

    const data: Record<string, number> = await response.json();

    if (!data.USDT) data.USDT = 1.0;

    return data;
}
