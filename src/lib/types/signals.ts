// ── Raw kline data from Binance API ──────────────────────────────
export interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

// ── Computed technical indicators for a single coin ──────────────
export interface IndicatorSet {
  rsi14: number;          // 0-100
  sma20: number;          // 20-period Simple Moving Average
  sma50: number;          // 50-period Simple Moving Average
  ema12: number;          // 12-period EMA
  ema26: number;          // 26-period EMA
  macdLine: number;       // ema12 - ema26
  macdSignal: number;     // 9-period EMA of MACD line
  macdHistogram: number;  // macdLine - macdSignal
  currentPrice: number;
}

// ── Signal strength levels ──────────────────────────────────────
export type SignalStrength = 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';

// ── Individual reason contributing to the signal ────────────────
export interface SignalReason {
  indicator: string;      // "RSI", "SMA Cross", "MACD", "Fear & Greed"
  signal: 'bullish' | 'bearish' | 'neutral';
  detail: string;         // Human-readable explanation in Spanish
  weight: number;         // Contribution to final score (-2 to +2)
}

// ── Complete signal for a single coin ───────────────────────────
export interface CoinSignal {
  coin: string;
  indicators: IndicatorSet;
  signal: SignalStrength;
  confidence: number;     // 0-100
  reasons: SignalReason[];
  timestamp: number;
  inPortfolio: boolean;   // true if coin is in user's portfolio
}

// ── Fear & Greed Index data ─────────────────────────────────────
export interface FearGreedData {
  value: number;              // 0-100
  classification: string;    // "Extreme Fear", "Fear", etc.
  timestamp: number;
}

// ── Crypto news item ────────────────────────────────────────────
export interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: number;
  categories: string;
  imageUrl?: string;
}

// ── Signal display labels (Spanish) ─────────────────────────────
export const SIGNAL_LABELS: Record<SignalStrength, string> = {
  strong_buy: 'Compra Fuerte',
  buy: 'Compra',
  hold: 'Mantener',
  sell: 'Venta',
  strong_sell: 'Venta Fuerte',
};

export const SIGNAL_COLORS: Record<SignalStrength, string> = {
  strong_buy: 'bg-green-500/20 text-green-400 border-green-500/40',
  buy: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
  hold: 'bg-slate-500/20 text-slate-400 border-slate-500/40',
  sell: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
  strong_sell: 'bg-red-500/20 text-red-400 border-red-500/40',
};
