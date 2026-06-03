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

export function getDistToLiqDirection(side: "LONG" | "SHORT"): string {
    return side === "LONG" ? "Debe caer" : "Debe subir";
}

export function getDistToLiqDirectionColor(side: "LONG" | "SHORT"): string {
    return side === "LONG" ? "text-red-400" : "text-yellow-400";
}

// ─── Cross-Margin Simulation ───────────────────────────────────────────────────

export interface FuturesMarketSimulation {
    marketMovePercent: number;
    newMarginBalance: number;
    newMarginRatio: number;
    newUnrealizedPnl: number;
    isLiquidated: boolean;
    bufferToLiq: number;
}

/** Recalculate account state after a uniform market move of `movePercent`%.
 *  Positive = prices rise, negative = prices drop. */
export function simulateMarketMove(
    positions: FuturesPosition[],
    account: FuturesAccount,
    movePercent: number,
): FuturesMarketSimulation {
    const newPnlSum = positions.reduce((sum, pos) => {
        const newPrice = pos.markPrice * (1 + movePercent / 100);
        const pnl = pos.side === "LONG"
            ? (newPrice - pos.entryPrice) * pos.size
            : (pos.entryPrice - newPrice) * pos.size;
        return sum + pnl;
    }, 0);

    const newMarginBalance = account.totalWalletBalance + newPnlSum;
    const newMarginRatio = newMarginBalance > 0
        ? (account.totalMaintMargin / newMarginBalance) * 100
        : 100;
    const isLiquidated = newMarginRatio >= 100 || newMarginBalance <= 0;

    return {
        marketMovePercent: movePercent,
        newMarginBalance,
        newMarginRatio: Math.min(newMarginRatio, 100),
        newUnrealizedPnl: newPnlSum,
        isLiquidated,
        bufferToLiq: isLiquidated ? 0 : 100 - newMarginRatio,
    };
}

/** Binary search for the exact market move % that triggers liquidation.
 *  Returns null if liquidation is not reached within reasonable bounds. */
export function findLiquidationThreshold(
    positions: FuturesPosition[],
    account: FuturesAccount,
    direction: "up" | "down",
): number | null {
    const base = simulateMarketMove(positions, account, 0);
    if (base.isLiquidated) return 0;

    const bound = direction === "down" ? -100 : 1000;
    const extreme = simulateMarketMove(positions, account, bound);
    if (!extreme.isLiquidated) return null;

    let lo = 0;
    let hi = bound;

    for (let i = 0; i < 50; i++) {
        const mid = (lo + hi) / 2;
        const sim = simulateMarketMove(positions, account, mid);
        if (sim.isLiquidated) {
            hi = mid;
        } else {
            lo = mid;
        }
    }

    return Math.round(((lo + hi) / 2) * 100) / 100;
}
