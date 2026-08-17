import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { LineStyle, LineWidth, ISeriesApi } from "lightweight-charts";
import type { Kline } from "../lib/types/signals";
import type { Interval } from "../lib/types/chart";
import type { AggregatedAsset, ProcessedInvestment, SaleRecord } from "../lib/constants";
import type { FuturesPosition } from "../lib/futures";
import type { WatchlistAlert } from "./useAlerts";

interface UseChartPriceLinesParams {
    candleSeriesRef: RefObject<ISeriesApi<"Candlestick"> | null>;
    selectedCoin: string;
    selectedInterval: Interval;
    items: ProcessedInvestment[];
    sales: SaleRecord[];
    futuresPositions: FuturesPosition[];
    aggregated: AggregatedAsset[];
    currentKlines: Kline[];
    watchlistAlerts?: Record<string, WatchlistAlert[]>;
}

export function useChartPriceLines({
    candleSeriesRef,
    selectedCoin,
    selectedInterval,
    items,
    sales,
    futuresPositions,
    aggregated,
    currentKlines,
    watchlistAlerts,
}: UseChartPriceLinesParams) {
    // Price line refs
    const priceLinesRef = useRef<ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]>[]>([]);
    const alertPriceLinesRef = useRef<ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]>[]>([]);
    const lastLinesSigRef = useRef<string>("");

    // Draw alert price lines on chart when alerts or selected coin changes
    useEffect(() => {
        if (!candleSeriesRef.current) return;
        alertPriceLinesRef.current.forEach(line => {
            try { candleSeriesRef.current!.removePriceLine(line); } catch {}
        });
        alertPriceLinesRef.current = [];
        const activeAlerts = watchlistAlerts?.[selectedCoin] ?? [];
        activeAlerts.forEach(alert => {
            const line = candleSeriesRef.current!.createPriceLine({
                price: alert.targetValue,
                color: alert.direction === 'up' ? '#22c55e' : '#ef4444',
                lineWidth: 1,
                lineStyle: LineStyle.Dashed,
                axisLabelVisible: false,
                title: `🔔 ${alert.isPersistent ? '∞' : '1x'}`,
            });
            alertPriceLinesRef.current.push(line);
        });
    }, [watchlistAlerts, selectedCoin]);

    // Price lines: remove old, add new
    useEffect(() => {
        if (!candleSeriesRef.current || currentKlines.length === 0) return;

        const asset = aggregated.find((a) => a.coin === selectedCoin);
        const isSubDollar = (asset?.currentPrice ?? 1) < 1;
        candleSeriesRef.current.applyOptions({
            priceFormat: { type: "price", precision: isSubDollar ? 4 : 2, minMove: isSubDollar ? 0.0001 : 0.01 },
            priceLineVisible: false,
        });

        // Build line definitions and skip re-creation when nothing changed.
        const defs: { price: number; color: string; lineWidth: LineWidth; lineStyle: LineStyle; axisLabelVisible: boolean; title: string }[] = [];

        const coinItems = items.filter((inv) => inv.coin === selectedCoin);
        coinItems.forEach((inv) => {
            defs.push({ price: inv.buyPrice, color: "#60a5fa", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: "Compra" });
        });
        const allSellPrices = [
            ...sales.filter((s) => s.coin === selectedCoin).map((s) => s.sellPrice),
        ];
        allSellPrices.forEach((price) => {
            defs.push({ price, color: "#ef4444", lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "Venta" });
        });

        // Futures entries
        const coinFutures = futuresPositions.filter((p) => p.symbol.replace("USDT", "") === selectedCoin);
        coinFutures.forEach((p) => {
            defs.push({ price: p.entryPrice, color: "#a855f7", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `Fut: ${p.side}` });
        });

        if (asset?.avgBuyPrice && coinItems.length > 1) {
            defs.push({ price: asset.avgBuyPrice, color: "#f59e0b", lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "Promedio" });
        }
        if (asset?.currentPrice) {
            defs.push({ price: asset.currentPrice, color: "#22d3ee", lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: false, title: "Actual" });
        }

        const sig = JSON.stringify(defs);
        if (sig === lastLinesSigRef.current) return;
        lastLinesSigRef.current = sig;

        priceLinesRef.current.forEach((pl) => candleSeriesRef.current!.removePriceLine(pl));
        priceLinesRef.current = [];
        defs.forEach((d) => {
            priceLinesRef.current.push(candleSeriesRef.current!.createPriceLine(d));
        });
    }, [selectedCoin, selectedInterval, aggregated, items, sales, currentKlines, futuresPositions]);
}