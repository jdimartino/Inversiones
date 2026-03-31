// ── Colors per coin ──────────────────────────────────────────────────
export const COIN_HEX: Record<string, string> = {
    BTC: "#f97316",
    ETH: "#818cf8",
    SOL: "#a855f7",
    BNB: "#eab308",
    ADA: "#60a5fa",
    DOGE: "#fbbf24",
    LTC: "#94a3b8",
    XRP: "#38bdf8",
    DOT: "#f472b6",
    MATIC: "#8b5cf6",
    SHIB: "#f87171",
    AVAX: "#ef4444",
    LINK: "#3b82f6",
    DEFAULT: "#64748b",
};

export const coinColor = (coin: string) => COIN_HEX[coin] ?? COIN_HEX.DEFAULT;
