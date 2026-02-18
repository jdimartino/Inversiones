import { SYMBOL_MAP, REVERSE_SYMBOL_MAP } from "./constants";

/**
 * Fetch only the prices we actually need from Binance.
 *
 * Uses the `symbols` query-param so the response contains ~13 tickers
 * instead of ~2 000.  Falls back to fetching all if the filtered
 * endpoint fails (e.g. Binance deprecation).
 */
export async function fetchBinancePrices(
    signal?: AbortSignal
): Promise<Record<string, number>> {
    const symbols = Object.values(SYMBOL_MAP);
    const param = JSON.stringify(symbols);
    const url = `https://api.binance.com/api/v3/ticker/price?symbols=${encodeURIComponent(param)}`;

    const response = await fetch(url, { signal });

    if (!response.ok) {
        throw new Error(`Binance API ${response.status}: ${response.statusText}`);
    }

    const data: { symbol: string; price: string }[] = await response.json();

    const prices: Record<string, number> = { USDT: 1.0 };

    for (const ticker of data) {
        const coin = REVERSE_SYMBOL_MAP[ticker.symbol];
        if (coin) {
            prices[coin] = parseFloat(ticker.price);
        }
    }

    return prices;
}
