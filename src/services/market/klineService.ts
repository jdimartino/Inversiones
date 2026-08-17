import type { Interval } from "../../lib/types/chart";
import type { Kline } from "../../lib/types/signals";

export async function fetchKlines(coin: string, interval: Interval): Promise<Kline[]> {
    if (coin.endsWith('EUR')) {
        const intervalMap: Record<Interval, string> = { "15m": "15", "1h": "60", "4h": "240", "1d": "D", "1M": "M" };
        const res = await fetch(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${coin}&interval=${intervalMap[interval]}&limit=500`);
        if (!res.ok) throw new Error(`Bybit respondió ${res.status} al pedir ${coin}`);
        const data = await res.json().catch(() => { throw new Error(`Respuesta inválida de Bybit para ${coin}`); });
        const raw = data?.result?.list;
        if (!Array.isArray(raw)) {
            const msg = data?.retMsg;
            throw new Error(msg ? `Bybit: ${msg}` : `Sin datos de ${coin}`);
        }
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
    if (!res.ok) throw new Error(`Binance respondió ${res.status} para ${symbol}`);
    const raw: unknown = await res.json().catch(() => { throw new Error(`Respuesta inválida de Binance para ${symbol}`); });
    if (!Array.isArray(raw)) throw new Error(`Sin datos de ${symbol} en Binance`);
    return (raw as any[][]).map((k) => ({
        openTime: k[0] as number,
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
        closeTime: k[6] as number,
    }));
}
