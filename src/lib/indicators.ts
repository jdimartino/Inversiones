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
  // Place emas[0] (SMA) at result[period - 1] so the array stays exactly closes.length long
  for (let i = 0; i < emas.length; i++) {
    result[period - 1 + i] = emas[i];
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

  // Align with calcMACD: ema12[k] <-> barra 11+k, ema26[k] <-> barra 25+k.
  // MACD(i) = EMA12(i) - EMA26(i), valores válidos desde la barra 25.
  const macd: (number | null)[] = closes.map((_, i) => {
    if (i < 25) return null;
    const ema12Val = ema12[i - 11];
    const ema26Val = ema26[i - 25];
    if (ema12Val === undefined || ema26Val === undefined) return null;
    return ema12Val - ema26Val;
  });

  // Compute signal EMA only from valid MACD values
  // signalEMA[j] <-> barra 33+j; signal(i) = signalEMA[i - 33] para i >= 33.
  const validMacd = macd.filter((v): v is number => v !== null);
  const signalEMA = calcEMASeries(validMacd, 9);
  const signal: (number | null)[] = new Array(closes.length).fill(null);
  let vi = 0;
  macd.forEach((v, i) => {
    if (v !== null) {
      const sigIdx = vi - 8;
      if (sigIdx >= 0 && sigIdx < signalEMA.length) signal[i] = signalEMA[sigIdx];
      vi++;
    }
  });

  const histogram: (number | null)[] = macd.map((v, i) =>
    v !== null && signal[i] !== null ? v - (signal[i] as number) : null
  );
  return { macd, signal, histogram };
}

// ── Binary search: value at exact time in a sorted points array ─
export function findValueAtTime(points: { time: number; value: number }[], time: number): number | undefined {
  let lo = 0;
  let hi = points.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const t = points[mid].time;
    if (t === time) return points[mid].value;
    if (t < time) lo = mid + 1;
    else hi = mid - 1;
  }
  return undefined;
}

// ── Signal types (neutral, LW-independent) ──────────────────────
export type SignalType = "ema_cross" | "macd_cross" | "rsi_overbought" | "rsi_oversold" | "volume_spike";
export type SignalDir = "bullish" | "bearish";

export interface DetectedSignal {
  time: number;
  type: SignalType;
  dir: SignalDir;
}

// ── Detect technical signals from existing indicator points ─────
// Pure function: no side effects, no LW dependency.
export function computeSignals(params: {
  ema20: { time: number; value: number }[];
  sma50: { time: number; value: number }[];
  rsi: { time: number; value: number }[];
  macdLine: { time: number; value: number }[];
  macdSignal: { time: number; value: number }[];
  volumeRatio?: number;
}): DetectedSignal[] {
  const { ema20, sma50, rsi, macdLine, macdSignal, volumeRatio } = params;
  const signals: DetectedSignal[] = [];

  // Build time-indexed maps for cross detection
  const emaMap = new Map(ema20.map(p => [p.time, p.value]));
  const smaMap = new Map(sma50.map(p => [p.time, p.value]));
  const rsiMap = new Map(rsi.map(p => [p.time, p.value]));
  const macdLineMap = new Map(macdLine.map(p => [p.time, p.value]));
  const macdSignalMap = new Map(macdSignal.map(p => [p.time, p.value]));

  // Collect all unique times from EMA/SMA (they share the main chart times)
  const allTimes = new Set<number>();
  for (const p of ema20) allTimes.add(p.time);
  for (const p of sma50) allTimes.add(p.time);

  const sortedTimes = Array.from(allTimes).sort((a, b) => a - b);

  let prevEma: number | undefined;
  let prevSma: number | undefined;
  let prevRsi: number | undefined;
  let prevMacdLine: number | undefined;
  let prevMacdSignal: number | undefined;

  for (const time of sortedTimes) {
    const ema = emaMap.get(time);
    const sma = smaMap.get(time);
    const rsiVal = rsiMap.get(time);
    const macdL = macdLineMap.get(time);
    const macdS = macdSignalMap.get(time);

    // EMA20 × SMA50 cross
    if (prevEma !== undefined && prevSma !== undefined && ema !== undefined && sma !== undefined) {
      if (prevEma <= prevSma && ema > sma) {
        signals.push({ time, type: "ema_cross", dir: "bullish" }); // golden
      } else if (prevEma >= prevSma && ema < sma) {
        signals.push({ time, type: "ema_cross", dir: "bearish" }); // death
      }
    }

    // MACD line × signal cross
    if (prevMacdLine !== undefined && prevMacdSignal !== undefined && macdL !== undefined && macdS !== undefined) {
      if (prevMacdLine <= prevMacdSignal && macdL > macdS) {
        signals.push({ time, type: "macd_cross", dir: "bullish" });
      } else if (prevMacdLine >= prevMacdSignal && macdL < macdS) {
        signals.push({ time, type: "macd_cross", dir: "bearish" });
      }
    }

    // RSI crosses
    if (prevRsi !== undefined && rsiVal !== undefined) {
      if (prevRsi <= 70 && rsiVal > 70) {
        signals.push({ time, type: "rsi_overbought", dir: "bearish" });
      } else if (prevRsi >= 30 && rsiVal < 30) {
        signals.push({ time, type: "rsi_oversold", dir: "bullish" });
      }
    }

    if (ema !== undefined) prevEma = ema;
    if (sma !== undefined) prevSma = sma;
    if (rsiVal !== undefined) prevRsi = rsiVal;
    if (macdL !== undefined) prevMacdLine = macdL;
    if (macdS !== undefined) prevMacdSignal = macdS;
  }

  // Volume spike: only on latest bar
  if (volumeRatio != null && volumeRatio >= 2 && sortedTimes.length > 0) {
    signals.push({ time: sortedTimes[sortedTimes.length - 1], type: "volume_spike", dir: "bullish" });
  }

  return signals;
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
