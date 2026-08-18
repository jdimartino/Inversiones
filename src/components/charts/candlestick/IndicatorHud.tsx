import React from "react";
import type { IndicatorValues } from "../../../hooks/useChartIndicatorValues";

interface IndicatorHudProps {
    values: IndicatorValues;
    isUp?: boolean;
}

const fmt = (v: number | null, decimals = 2): string =>
    v != null ? v.toFixed(decimals) : "—";

const fmtPct = (v: number | null): string =>
    v != null ? `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%` : "—";

const IndicatorHud: React.FC<IndicatorHudProps> = ({ values, isUp }) => {
    const { ema20, sma50, sma200, rsi, macdLine, macdSignal, macdHistogram } = values;

    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-mono leading-none select-none">
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
        </div>
    );
};

export default IndicatorHud;
