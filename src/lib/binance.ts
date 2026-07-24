import { SYMBOL_MAP, REVERSE_SYMBOL_MAP } from "./constants";

const BINANCE_API = "https://api.binance.com/api/v3";

function coinToSymbol(coin: string): string {
    return SYMBOL_MAP[coin] || `${coin}USDT`;
}

/**
 * Fetch live prices from Binance directly (browser → api.binance.com).
 * Uses batch ticker endpoint: 1 request for all coins.
 */
export async function fetchDynamicPrices(
    coins: string[],
    signal?: AbortSignal
): Promise<Record<string, number>> {
    if (coins.length === 0) return { USDT: 1.0 };

    const symbols = coins.map(coinToSymbol);
    const param = JSON.stringify(symbols);
    const url = `${BINANCE_API}/ticker/price?symbols=${encodeURIComponent(param)}`;

    const response = await fetch(url, { signal });

    if (!response.ok) {
        throw new Error(
            `Binance API ${response.status}: ${response.statusText}`
        );
    }

    const data: { symbol: string; price: string }[] = await response.json();

    const prices: Record<string, number> = { USDT: 1.0 };

    for (const ticker of data) {
        const coin = REVERSE_SYMBOL_MAP[ticker.symbol];
        if (coin) {
            prices[coin] = parseFloat(ticker.price);
        } else {
            const base = ticker.symbol.replace(/USDT$/, "");
            if (base !== "USDT") {
                prices[base] = parseFloat(ticker.price);
            }
        }
    }

    return prices;
}

/**
 * Fetch previous daily close prices from Binance klines.
 * 1 request per coin (only called on mount, not polled).
 */
export async function fetchPrevClosePrices(
    coins: string[],
    signal?: AbortSignal
): Promise<Record<string, number>> {
    if (coins.length === 0) return { USDT: 1.0 };

    const results = await Promise.all(
        coins.map(async (coin) => {
            const symbol = coinToSymbol(coin);
            const url = `${BINANCE_API}/klines?symbol=${symbol}&interval=1d&limit=2`;
            try {
                const res = await fetch(url, { signal });
                if (!res.ok) return [coin, undefined] as const;
                const data: any[][] = await res.json();
                if (data.length >= 2) {
                    return [coin, parseFloat(data[data.length - 2][4])] as const;
                }
                return [coin, undefined] as const;
            } catch {
                return [coin, undefined] as const;
            }
        })
    );

    const prevCloses: Record<string, number> = { USDT: 1 };
    for (const [coin, price] of results) {
        if (price !== undefined) {
            prevCloses[coin] = price;
        }
    }

    return prevCloses;
}
