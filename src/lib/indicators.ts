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

// ── Volume Ratio: current volume vs 20-period average ──────────
export function calcVolumeRatio(klines: Kline[], period: number = 20): number {
  if (klines.length < period + 1) return 1;
  const volumes = klines.map(k => k.volume);
  const avgVol = volumes.slice(-period - 1, -1).reduce((s, v) => s + v, 0) / period;
  if (avgVol === 0) return 1;
  return volumes[volumes.length - 1] / avgVol;
}

// ── Full-series indicators (for chart rendering) ───────────────
// These return (number | null)[] arrays aligned to the input closes length.
// null = not enough data yet (warmup period).

export function computeSMASeries(closes: number[], period: number): (number | null)[] {
  return closes.map((_, i) => {
    if (i < period - 1) return null;
    return closes.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
  });
}

export function computeEMASeries(closes: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null);
  const emas = calcEMASeries(closes, period);
  // calcEMASeries returns values from index period onward, seed = SMA
  for (let i = 0; i < emas.length; i++) {
    result[period + i] = emas[i];
  }
  return result;
}

export function computeRSISeries(closes: number[], period: number = 14): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return result;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  let ag = gains / period, al = losses / period;
  result[period] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (period - 1) + Math.max(d, 0)) / period;
    al = (al * (period - 1) + Math.max(-d, 0)) / period;
    result[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  return result;
}

export function computeMACDSeries(closes: number[]): {
  macd: (number | null)[];
  signal: (number | null)[];
  histogram: (number | null)[];
} {
  if (closes.length < 26) return { macd: [], signal: [], histogram: [] };
  const ema12 = calcEMASeries(closes, 12);
  const ema26 = calcEMASeries(closes, 26);

  // Align: ema12 starts at index 12, ema26 starts at index 26
  // MACD line values exist from index 26 onward
  const offset = 26 - 12; // = 14
  const macd: (number | null)[] = closes.map((_, i) => {
    if (i < 25) return null;
    const ema12Val = ema12[i - offset];
    const ema26Val = ema26[i - 26];
    if (ema12Val === undefined || ema26Val === undefined) return null;
    return ema12Val - ema26Val;
  });

  // Compute signal EMA only from valid MACD values
  const validMacd = macd.filter((v): v is number => v !== null);
  const signalEMA = calcEMASeries(validMacd, 9);
  const signal: (number | null)[] = new Array(closes.length).fill(null);
  let vi = 0;
  macd.forEach((v, i) => {
    if (v !== null) {
      if (vi >= 8) signal[i] = signalEMA[vi];
      vi++;
    }
  });

  const histogram: (number | null)[] = macd.map((v, i) =>
    v !== null && signal[i] !== null ? v - (signal[i] as number) : null
  );
  return { macd, signal, histogram };
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
  const prevMacd = closes.length > 1 ? calcMACD(closes.slice(0, -1)) : macd;
  const volumeRatio = calcVolumeRatio(klines);

  return {
    rsi14,
    sma20,
    sma50,
    ema12,
    ema26,
    macdLine: macd.line,
    macdSignal: macd.signal,
    macdHistogram: macd.histogram,
    macdPrevHistogram: prevMacd.histogram,
    currentPrice,
    volumeRatio,
  };
}
