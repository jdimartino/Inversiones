import type { Kline, IndicatorSet } from './types/signals';

// ── SMA (Simple Moving Average) ─────────────────────────────────
export function calcSMA(closes: number[], period: number): number {
  if (closes.length < period) return 0;
  const slice = closes.slice(-period);
  return slice.reduce((sum, v) => sum + v, 0) / period;
}

// ── EMA (Exponential Moving Average) ────────────────────────────
export function calcEMASeries(closes: number[], period: number): number[] {
  if (closes.length < period) return [];
  const multiplier = 2 / (period + 1);

  // Seed with SMA of first `period` values
  const sma = closes.slice(0, period).reduce((s, v) => s + v, 0) / period;
  const emas: number[] = [sma];

  for (let i = period; i < closes.length; i++) {
    const prev = emas[emas.length - 1];
    emas.push((closes[i] - prev) * multiplier + prev);
  }
  return emas;
}

export function calcEMA(closes: number[], period: number): number {
  const series = calcEMASeries(closes, period);
  return series.length > 0 ? series[series.length - 1] : 0;
}

// ── RSI (Relative Strength Index) — Wilder's smoothing ──────────
export function calcRSI(closes: number[], period: number = 14): number {
  if (closes.length < period + 1) return 50; // neutral fallback

  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }

  // Initial averages from first `period` changes
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] >= 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  // Wilder's smoothing for remaining
  for (let i = period; i < changes.length; i++) {
    const change = changes[i];
    const gain = change >= 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// ── MACD (12, 26, 9) ───────────────────────────────────────────
export function calcMACD(closes: number[]): {
  line: number;
  signal: number;
  histogram: number;
} {
  if (closes.length < 26) {
    return { line: 0, signal: 0, histogram: 0 };
  }

  const ema12Series = calcEMASeries(closes, 12);
  const ema26Series = calcEMASeries(closes, 26);

  // Align: ema12 starts at index 12, ema26 starts at index 26
  // MACD line values exist from index 26 onward
  const offset = 26 - 12; // = 14
  const macdValues: number[] = [];
  for (let i = 0; i < ema26Series.length; i++) {
    const ema12Val = ema12Series[i + offset];
    const ema26Val = ema26Series[i];
    if (ema12Val !== undefined) {
      macdValues.push(ema12Val - ema26Val);
    }
  }

  if (macdValues.length === 0) {
    return { line: 0, signal: 0, histogram: 0 };
  }

  const line = macdValues[macdValues.length - 1];

  // Signal line = 9-period EMA of MACD values
  const signalSeries = calcEMASeries(macdValues, 9);
  const signal = signalSeries.length > 0 ? signalSeries[signalSeries.length - 1] : 0;

  return { line, signal, histogram: line - signal };
}

// ── Parse Binance kline response ────────────────────────────────
export function parseKlines(raw: any[]): Kline[] {
  return raw.map((k) => ({
    openTime: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
    closeTime: k[6],
  }));
}

// ── Compute all indicators from klines ──────────────────────────
export function computeIndicators(klines: Kline[]): IndicatorSet {
  const closes = klines.map((k) => k.close);
  const currentPrice = closes.length > 0 ? closes[closes.length - 1] : 0;

  const rsi14 = calcRSI(closes, 14);
  const sma20 = calcSMA(closes, 20);
  const sma50 = calcSMA(closes, 50);
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  const macd = calcMACD(closes);

  return {
    rsi14,
    sma20,
    sma50,
    ema12,
    ema26,
    macdLine: macd.line,
    macdSignal: macd.signal,
    macdHistogram: macd.histogram,
    currentPrice,
  };
}
