import React from "react";
import type { IndicatorValues } from "../../../hooks/useChartIndicatorValues";

interface IndicatorHudProps {
    values: IndicatorValues;
    volumeRatio?: number | null;
}

const fmt = (v: number | null, decimals = 2): string =>
    v != null ? v.toFixed(decimals) : "—";

const IndicatorHud: React.FC<IndicatorHudProps> = ({ values, volumeRatio }) => {
    const { ema20, sma50, sma200, rsi, macdLine, macdSignal, macdHistogram } = values;

    return (
        <div className="flex items-center gap-2 text-[10px] font-mono leading-none select-none">
            {/* RSI */}
            <span className="flex items-center gap-1">
                <span className="text-violet-400 font-bold">RSI</span>
                <span className={
                    rsi != null
                        ? rsi >= 70 ? "text-red-400"
                        : rsi <= 30 ? "text-green-400"
                        : "text-slate-300"
                        : "text-slate-500"
                }>
                    {fmt(rsi, 1)}
                </span>
            </span>

            {/* MACD */}
            <span className="flex items-center gap-1">
                <span className="text-sky-400 font-bold">MACD</span>
                <span className="text-slate-300">{fmt(macdLine)}</span>
                <span className="text-orange-400">{fmt(macdSignal)}</span>
                <span className={
                    macdHistogram != null
                        ? macdHistogram >= 0 ? "text-green-400" : "text-red-400"
                        : "text-slate-500"
                }>
                    {fmt(macdHistogram)}
                </span>
            </span>

            {/* EMAs / SMAs */}
            <span className="flex items-center gap-1">
                <span className="text-sky-300 font-bold">EMA20</span>
                <span className="text-slate-300">{fmt(ema20)}</span>
            </span>
            <span className="flex items-center gap-1">
                <span className="text-orange-300 font-bold">SMA50</span>
                <span className="text-slate-300">{fmt(sma50)}</span>
            </span>
            <span className="flex items-center gap-1">
                <span className="text-yellow-300 font-bold">SMA200</span>
                <span className="text-slate-300">{fmt(sma200)}</span>
            </span>

            {/* Volume ratio */}
            {volumeRatio != null && volumeRatio > 0 && (
                <span className="flex items-center gap-1">
                    <span className="text-cyan-400 font-bold">Vol</span>
                    <span className={
                        volumeRatio >= 2 ? "text-cyan-300 font-bold"
                        : volumeRatio >= 1.5 ? "text-cyan-400"
                        : "text-slate-400"
                    }>
                        {volumeRatio.toFixed(1)}x
                    </span>
                </span>
            )}
        </div>
    );
};

export default IndicatorHud;
