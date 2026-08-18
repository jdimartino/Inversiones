import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { ISeriesApi } from "lightweight-charts";
import type { Kline } from "../lib/types/signals";
import { computeSignals } from "../lib/indicators";

interface UseChartSignalsParams {
    candleSeriesRef: RefObject<ISeriesApi<"Candlestick"> | null>;
    klines: Kline[];
    ema20Points: { time: number; value: number }[];
    sma50Points: { time: number; value: number }[];
    rsiPoints: { time: number; value: number }[];
    macdLinePoints: { time: number; value: number }[];
    macdSignalPoints: { time: number; value: number }[];
    volumeRatio: number;
    enabled: boolean;
}

export function useChartSignals({
    candleSeriesRef,
    klines,
    ema20Points,
    sma50Points,
    rsiPoints,
    macdLinePoints,
    macdSignalPoints,
    volumeRatio,
    enabled,
}: UseChartSignalsParams) {
    const lastSigRef = useRef("");

    useEffect(() => {
        if (!candleSeriesRef.current) return;

        if (!enabled) {
            candleSeriesRef.current.setMarkers([]);
            lastSigRef.current = "";
            return;
        }

        const signals = computeSignals({
            ema20: ema20Points,
            sma50: sma50Points,
            rsi: rsiPoints,
            macdLine: macdLinePoints,
            macdSignal: macdSignalPoints,
            volumeRatio,
        });

        // Deduplicate by time+type to avoid duplicate markers
        const seen = new Set<string>();
        const unique = signals.filter(s => {
            const key = `${s.time}_${s.type}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        const sig = JSON.stringify(unique);
        if (sig === lastSigRef.current) return;
        lastSigRef.current = sig;

        // Map neutral signals to LW SeriesMarker format
        const markers = unique.map(s => ({
            time: s.time as any,
            position: s.type === "rsi_overbought" || s.type === "rsi_oversold"
                ? ("inBar" as const)
                : s.dir === "bullish"
                    ? ("belowBar" as const)
                    : ("aboveBar" as const),
            color: s.type === "ema_cross"
                ? s.dir === "bullish" ? "#22c55e" : "#ef4444"
                : s.type === "macd_cross"
                    ? s.dir === "bullish" ? "#38bdf8" : "#f97316"
                    : s.type === "rsi_overbought" ? "#ef4444"
                    : s.type === "rsi_oversold" ? "#22c55e"
                    : "#22d3ee", // volume spike
            shape: s.type === "rsi_overbought" || s.type === "rsi_oversold" || s.type === "volume_spike"
                ? ("circle" as const)
                : s.dir === "bullish"
                    ? ("arrowUp" as const)
                    : ("arrowDown" as const),
            text: s.type === "ema_cross"
                ? s.dir === "bullish" ? "G" : "D"
                : s.type === "macd_cross"
                    ? s.dir === "bullish" ? "M+" : "M-"
                    : s.type === "rsi_overbought" ? "OB"
                    : s.type === "rsi_oversold" ? "OS"
                    : "V",
            size: s.type === "volume_spike" ? 2 : 1,
        }));

        candleSeriesRef.current.setMarkers(markers);
    }, [klines, ema20Points, sma50Points, rsiPoints, macdLinePoints, macdSignalPoints, volumeRatio, enabled]);

    // Clear markers when no data
    useEffect(() => {
        if (klines.length === 0 && candleSeriesRef.current) {
            candleSeriesRef.current.setMarkers([]);
            lastSigRef.current = "";
        }
    }, [klines]);
}
