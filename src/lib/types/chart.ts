import { AggregatedAsset, ProcessedInvestment, SaleRecord } from "../constants";
import type { Kline, CoinSignal } from "./signals";
import { FuturesPosition } from "../futures";

// ── Types ───────────────────────────────────────────────────────────

export interface CandlestickChartProps {
    aggregated: AggregatedAsset[];
    klinesMap?: Record<string, Kline[]>;
    items: ProcessedInvestment[];
    initialCoin?: string;
    signals?: CoinSignal[];
    onCoinChange?: (coin: string) => void;
    priceDirections?: Record<string, "up" | "down" | "neutral">;
    sales?: SaleRecord[];
    futuresPositions?: FuturesPosition[];
}

export type Interval = "15m" | "1h" | "4h" | "1d" | "1M";

export const INTERVAL_LABELS: Record<Interval, string> = {
    "15m": "15M",
    "1h": "1H",
    "4h": "4H",
    "1d": "1D",
    "1M": "MES",
};

export interface OhlcvLegend {
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    isUp: boolean;
}

export interface MeasureAnchor { x: number; y: number; }

export interface MeasureStats {
    priceChange: number;
    pctChange: number;
    barCount: number;
    totalVolume: number;
    startPrice: number;
    endPrice: number;
    startTimeSec: number | null;
    endTimeSec: number | null;
}
