// ─── Futures Types ────────────────────────────────────────────────────────────

export interface FuturesPosition {
    symbol: string;
    side: "LONG" | "SHORT";
    size: number;
    notional: number;
    entryPrice: number;
    markPrice: number;
    liquidationPrice: number;
    leverage: number;
    unrealizedPnl: number;
    initialMargin: number;
    maintMargin: number;
    marginType: string;
    breakEvenPrice: number;
    distToLiqPercent: number;
    roe: number;
    updateTime: number;
}

export interface FuturesAccount {
    totalWalletBalance: number;
    totalUnrealizedProfit: number;
    totalMarginBalance: number;
    totalInitialMargin: number;
    totalMaintMargin: number;
    availableBalance: number;
    maxWithdrawAmount: number;
    marginRatio: number;
    /** @deprecated Use marginRatio instead — kept for backward compat */
    marginUsedPercent?: number;
}

export interface FuturesData {
    account: FuturesAccount;
    positions: FuturesPosition[];
    lastSync: number;
}

export interface FuturesPositionAlert {
    type: "roe" | "roeUsd";
    targetValue: number;
    direction: "up" | "down";
    isPersistent: boolean;
    note?: string;
    _lastSide?: "above" | "below";
}

export interface FuturesAlertConfig {
    enabled: boolean;
    marginThresholds: number[];
    positionLiqThreshold: number;
    positionAlerts: Record<string, FuturesPositionAlert[]>;
}

// ─── Default values ───────────────────────────────────────────────────────────

export const DEFAULT_FUTURES_DATA: FuturesData = {
    account: {
        totalWalletBalance: 0,
        totalUnrealizedProfit: 0,
        totalMarginBalance: 0,
        totalInitialMargin: 0,
        totalMaintMargin: 0,
        availableBalance: 0,
        maxWithdrawAmount: 0,
        marginRatio: 0,
    },
    positions: [],
    lastSync: 0,
};

export const DEFAULT_FUTURES_ALERTS: FuturesAlertConfig = {
    enabled: true,
    marginThresholds: [70, 80, 90],
    positionLiqThreshold: 10,
    positionAlerts: {},
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function formatPnl(pnl: number): string {
    const sign = pnl >= 0 ? "+" : "";
    return `${sign}$${pnl.toFixed(2)}`;
}

export function formatRoe(roe: number): string {
    const sign = roe >= 0 ? "+" : "";
    return `${sign}${roe.toFixed(1)}%`;
}

// ─── Margin Ratio Helpers (lower = safer, 100% = liquidation) ────────────────

export function getMarginColor(ratio: number): string {
    if (ratio >= 95) return "text-red-400";
    if (ratio >= 80) return "text-orange-400";
    if (ratio >= 50) return "text-yellow-400";
    return "text-green-400";
}

export function getMarginBarColor(ratio: number): string {
    if (ratio >= 95) return "bg-red-500";
    if (ratio >= 80) return "bg-orange-500";
    if (ratio >= 50) return "bg-yellow-500";
    return "bg-green-500";
}

export function getMarginLabel(ratio: number): string {
    if (ratio >= 95) return "¡LIQUIDACIÓN INMINENTE!";
    if (ratio >= 80) return "Peligro alto";
    if (ratio >= 50) return "Precaución";
    return "Seguro";
}

export function getMarginLabelColor(ratio: number): string {
    if (ratio >= 95) return "text-red-400";
    if (ratio >= 80) return "text-orange-400";
    if (ratio >= 50) return "text-yellow-400";
    return "text-green-400";
}

export function getDistToLiqColor(percent: number): string {
    if (percent <= 5) return "text-red-400";
    if (percent <= 15) return "text-orange-400";
    if (percent <= 25) return "text-yellow-400";
    return "text-green-400";
}

export function getDistToLiqBarColor(percent: number): string {
    if (percent <= 5) return "bg-red-500";
    if (percent <= 15) return "bg-orange-500";
    if (percent <= 25) return "bg-yellow-500";
    return "bg-green-500";
}
