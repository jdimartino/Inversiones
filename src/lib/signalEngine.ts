import type {
  IndicatorSet,
  FearGreedData,
  CoinSignal,
  SignalStrength,
  SignalReason,
} from './types/signals';

// ── RSI scoring ─────────────────────────────────────────────────
function scoreRSI(rsi: number): SignalReason {
  if (rsi < 20) {
    return {
      indicator: 'RSI',
      signal: 'bullish',
      detail: `RSI en ${rsi.toFixed(0)} — sobreventa extrema (< 20)`,
      weight: 2,
    };
  }
  if (rsi < 30) {
    return {
      indicator: 'RSI',
      signal: 'bullish',
      detail: `RSI en ${rsi.toFixed(0)} — zona de sobreventa (< 30)`,
      weight: 1,
    };
  }
  if (rsi > 80) {
    return {
      indicator: 'RSI',
      signal: 'bearish',
      detail: `RSI en ${rsi.toFixed(0)} — sobrecompra extrema (> 80)`,
      weight: -2,
    };
  }
  if (rsi > 70) {
    return {
      indicator: 'RSI',
      signal: 'bearish',
      detail: `RSI en ${rsi.toFixed(0)} — zona de sobrecompra (> 70)`,
      weight: -1,
    };
  }
  return {
    indicator: 'RSI',
    signal: 'neutral',
    detail: `RSI en ${rsi.toFixed(0)} — rango neutral (30-70)`,
    weight: 0,
  };
}

// ── SMA Cross scoring ───────────────────────────────────────────
function scoreSMACross(price: number, sma20: number, sma50: number): SignalReason {
  if (sma20 === 0 || sma50 === 0) {
    return {
      indicator: 'SMA Cross',
      signal: 'neutral',
      detail: 'Datos insuficientes para medias móviles',
      weight: 0,
    };
  }

  if (price > sma20 && sma20 > sma50) {
    return {
      indicator: 'SMA Cross',
      signal: 'bullish',
      detail: 'Precio > SMA20 > SMA50 — tendencia alcista fuerte',
      weight: 2,
    };
  }
  if (price > sma20 && sma20 <= sma50) {
    return {
      indicator: 'SMA Cross',
      signal: 'bullish',
      detail: 'Precio > SMA20 pero SMA20 < SMA50 — posible reversa alcista',
      weight: 1,
    };
  }
  if (price < sma20 && sma20 < sma50) {
    return {
      indicator: 'SMA Cross',
      signal: 'bearish',
      detail: 'Precio < SMA20 < SMA50 — tendencia bajista fuerte',
      weight: -2,
    };
  }
  return {
    indicator: 'SMA Cross',
    signal: 'bearish',
    detail: 'Precio < SMA20 pero SMA20 > SMA50 — posible reversa bajista',
    weight: -1,
  };
}

// ── MACD scoring — crossover by sign change ─────────────────────
function scoreMACD(histogram: number, prevHistogram: number): SignalReason {
  const crossedBullish = prevHistogram < 0 && histogram > 0;
  const crossedBearish = prevHistogram > 0 && histogram < 0;

  if (crossedBullish) {
    return {
      indicator: 'MACD',
      signal: 'bullish',
      detail: 'MACD cruce alcista confirmado — momentum cambia a positivo',
      weight: 2,
    };
  }
  if (crossedBearish) {
    return {
      indicator: 'MACD',
      signal: 'bearish',
      detail: 'MACD cruce bajista confirmado — momentum cambia a negativo',
      weight: -2,
    };
  }
  if (histogram > 0) {
    return {
      indicator: 'MACD',
      signal: 'bullish',
      detail: `MACD positivo (${histogram.toFixed(4)}) — momentum alcista`,
      weight: 1,
    };
  }
  if (histogram < 0) {
    return {
      indicator: 'MACD',
      signal: 'bearish',
      detail: `MACD negativo (${histogram.toFixed(4)}) — momentum bajista`,
      weight: -1,
    };
  }
  return {
    indicator: 'MACD',
    signal: 'neutral',
    detail: 'MACD neutral',
    weight: 0,
  };
}

// ── Volume scoring ──────────────────────────────────────────────
function scoreVolume(volumeRatio: number, price: number, sma20: number): SignalReason {
  const trend = price >= sma20 ? 'bullish' : 'bearish';
  const trendLabel = trend === 'bullish' ? 'alcista' : 'bajista';

  if (volumeRatio >= 2.0) {
    return {
      indicator: 'Volumen',
      signal: trend,
      detail: `Volumen ${volumeRatio.toFixed(1)}x promedio — movimiento de alta convicción (${trendLabel})`,
      weight: trend === 'bullish' ? 1.5 : -1.5,
    };
  }
  if (volumeRatio >= 1.5) {
    return {
      indicator: 'Volumen',
      signal: trend,
      detail: `Volumen elevado (${volumeRatio.toFixed(1)}x) — confirma dirección del precio`,
      weight: trend === 'bullish' ? 1 : -1,
    };
  }
  if (volumeRatio < 0.5) {
    return {
      indicator: 'Volumen',
      signal: 'neutral',
      detail: `Volumen bajo (${volumeRatio.toFixed(1)}x) — movimiento sin respaldo`,
      weight: 0,
    };
  }
  return {
    indicator: 'Volumen',
    signal: 'neutral',
    detail: `Volumen normal (${volumeRatio.toFixed(1)}x promedio)`,
    weight: 0,
  };
}

// ── Fear & Greed scoring (contrarian) ───────────────────────────
function scoreFearGreed(fg: FearGreedData): SignalReason {
  if (fg.value <= 20) {
    return {
      indicator: 'Miedo y Codicia',
      signal: 'bullish',
      detail: `Índice en ${fg.value} (Miedo Extremo) — oportunidad contrarian de compra`,
      weight: 1,
    };
  }
  if (fg.value <= 40) {
    return {
      indicator: 'Miedo y Codicia',
      signal: 'bullish',
      detail: `Índice en ${fg.value} (Miedo) — sentimiento negativo, posible oportunidad`,
      weight: 0.5,
    };
  }
  if (fg.value >= 80) {
    return {
      indicator: 'Miedo y Codicia',
      signal: 'bearish',
      detail: `Índice en ${fg.value} (Codicia Extrema) — precaución, mercado eufórico`,
      weight: -1,
    };
  }
  if (fg.value >= 60) {
    return {
      indicator: 'Miedo y Codicia',
      signal: 'bearish',
      detail: `Índice en ${fg.value} (Codicia) — mercado optimista, cuidado con sobreexposición`,
      weight: -0.5,
    };
  }
  return {
    indicator: 'Miedo y Codicia',
    signal: 'neutral',
    detail: `Índice en ${fg.value} (Neutral) — sin sesgo claro del mercado`,
    weight: 0,
  };
}

// ── Main signal computation ─────────────────────────────────────
export function computeSignal(
  coin: string,
  indicators: IndicatorSet,
  fearGreed?: FearGreedData
): CoinSignal {
  const reasons: SignalReason[] = [
    scoreRSI(indicators.rsi14),
    scoreSMACross(indicators.currentPrice, indicators.sma20, indicators.sma50),
    scoreMACD(indicators.macdHistogram, indicators.macdPrevHistogram),
    scoreVolume(indicators.volumeRatio, indicators.currentPrice, indicators.sma20),
  ];

  // Weights: RSI 22%, SMA 22%, MACD 26%, Volume 16% (= 86%) | + F&G 14% = 100%
  const weights = [0.22, 0.22, 0.26, 0.16];
  let totalWeight = 0.86;

  if (fearGreed) {
    const fgReason = scoreFearGreed(fearGreed);
    reasons.push(fgReason);
    weights.push(0.14);
    totalWeight = 1.0;
  }

  let weightedSum = 0;
  for (let i = 0; i < reasons.length; i++) {
    weightedSum += reasons[i].weight * weights[i];
  }
  const score = weightedSum / totalWeight;

  let signal: SignalStrength;
  if (score >= 1.2) signal = 'strong_buy';
  else if (score >= 0.4) signal = 'buy';
  else if (score > -0.4) signal = 'hold';
  else if (score > -1.2) signal = 'sell';
  else signal = 'strong_sell';

  // Confidence: % of indicators agreeing with signal direction
  const isBullish = signal === 'strong_buy' || signal === 'buy';
  const isBearish = signal === 'strong_sell' || signal === 'sell';
  let agreementCount = 0;
  for (const r of reasons) {
    if (isBullish && r.signal === 'bullish') agreementCount++;
    else if (isBearish && r.signal === 'bearish') agreementCount++;
    else if (!isBullish && !isBearish && r.signal === 'neutral') agreementCount++;
  }
  const confidence = Math.round((agreementCount / reasons.length) * 100);

  return {
    coin,
    indicators,
    signal,
    confidence,
    reasons,
    timestamp: Date.now(),
    inPortfolio: false,
    agreementCount,
    totalIndicators: reasons.length,
  };
}
