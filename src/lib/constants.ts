// ------------------------------------------------------------------
//  TYPES
// ------------------------------------------------------------------
export interface Investment {
    id: string;
    coin: string;
    buyPrice: number;
    quantity: number;
    invested: number;
    date: number;
}

export interface ProcessedInvestment extends Investment {
    currentPrice: number;
    currentValue: number;
    profit: number;
    roi: number;
}

export interface Loan {
    id: string;
    exchange: string;
    collateralCoin: string;
    collateralQty: number;
    borrowedUSDT: number;
    apy: number;
    date: number;
}

export interface ProcessedLoan extends Loan {
    collateralValue: number;
    ltv: number;
    liquidationPrice: number;
}

// ------------------------------------------------------------------
//  RISK PARAMETERS (verified against exchange docs)
// ------------------------------------------------------------------
export const RISK_PARAMS: Record<
    string,
    { initial: number; marginCall: number; liquidation: number; apy: number }
> = {
    Binance: { initial: 75, marginCall: 85, liquidation: 91, apy: 4.39 },
    Bybit: { initial: 80, marginCall: 85, liquidation: 92, apy: 3.98 },
};

// ------------------------------------------------------------------
//  SYMBOL MAP  (coin → Binance trading pair)
// ------------------------------------------------------------------
export const SYMBOL_MAP: Record<string, string> = {
    BTC: "BTCUSDT",
    ETH: "ETHUSDT",
    ADA: "ADAUSDT",
    DOGE: "DOGEUSDT",
    LTC: "LTCUSDT",
    BNB: "BNBUSDT",
    SOL: "SOLUSDT",
    XRP: "XRPUSDT",
    DOT: "DOTUSDT",
    MATIC: "MATICUSDT",
    SHIB: "SHIBUSDT",
    AVAX: "AVAXUSDT",
    LINK: "LINKUSDT",
};

/** Reverse lookup: "BTCUSDT" → "BTC"  (O(1) instead of Array.find) */
export const REVERSE_SYMBOL_MAP: Record<string, string> = Object.fromEntries(
    Object.entries(SYMBOL_MAP).map(([coin, pair]) => [pair, coin])
);

export const AVAILABLE_COINS = Object.keys(SYMBOL_MAP);

// ------------------------------------------------------------------
//  COIN BADGE COLORS
// ------------------------------------------------------------------
export const COIN_COLORS: Record<string, string> = {
    BTC: "bg-orange-500/20 text-orange-400 border-orange-500/40",
    ETH: "bg-indigo-500/20 text-indigo-400 border-indigo-500/40",
    SOL: "bg-purple-500/20 text-purple-400 border-purple-500/40",
    BNB: "bg-yellow-500/20 text-yellow-500 border-yellow-500/40",
    ADA: "bg-blue-600/20 text-blue-400 border-blue-600/40",
    DOGE: "bg-amber-400/20 text-amber-500 border-amber-400/40",
    LTC: "bg-slate-400/20 text-slate-300 border-slate-400/40",
    XRP: "bg-sky-500/20 text-sky-400 border-sky-500/40",
    DOT: "bg-pink-500/20 text-pink-400 border-pink-500/40",
    MATIC: "bg-violet-600/20 text-violet-400 border-violet-600/40",
    SHIB: "bg-red-500/20 text-red-400 border-red-500/40",
    AVAX: "bg-red-600/20 text-red-500 border-red-600/40",
    LINK: "bg-blue-700/20 text-blue-400 border-blue-700/40",
    DEFAULT: "bg-slate-700/20 text-slate-400 border-slate-700/40",
};

export const getCoinStyle = (coin: string): string =>
    COIN_COLORS[coin] || COIN_COLORS.DEFAULT;
