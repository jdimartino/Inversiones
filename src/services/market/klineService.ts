import type { Interval } from "../../lib/types/chart";
import type { Kline } from "../../lib/types/signals";

export async function fetchKlines(coin: string, interval: Interval): Promise<Kline[]> {
    if (coin.endsWith('EUR')) {
        const intervalMap: Record<Interval, string> = { "15m": "15", "1h": "60", "4h": "240", "1d": "D", "1M": "M" };
        const res = await fetch(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${coin}&interval=${intervalMap[interval]}&limit=500`);
        const data = await res.json();
        const raw = data.result?.list || [];
        return raw.reverse().map((k: any[]) => ({
            openTime: parseInt(k[0]),
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5]),
            closeTime: parseInt(k[0]) + 1,
        }));
    }

    const symbol = `${coin}USDT`;
    const res = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=500`
    );
    const raw: any[][] = await res.json();
    return raw.map((k) => ({
        openTime: k[0] as number,
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
        closeTime: k[6] as number,
    }));
}
