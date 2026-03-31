import React from "react";
import type { CoinSignal } from "../../lib/types/signals";
import { SIGNAL_LABELS, SIGNAL_COLORS } from "../../lib/types/signals";
import ChartCard from "./ChartCard";
import { coinColor } from "./chartColors";

interface TechnicalSummaryProps {
    signals: CoinSignal[];
}

const RsiBar: React.FC<{ value: number }> = ({ value }) => {
    const color = value >= 70 ? "#ef4444" : value <= 30 ? "#4ade80" : "#eab308";
    const label = value >= 70 ? "Sobrecompra" : value <= 30 ? "Sobreventa" : "";

    return (
        <div className="flex items-center gap-2 flex-1">
            <span className="text-[9px] text-slate-500 w-7 text-right">RSI</span>
            <div className="relative flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                {/* Zones */}
                <div className="absolute inset-y-0 left-0 w-[30%] bg-green-900/30 rounded-l-full" />
                <div className="absolute inset-y-0 right-0 w-[30%] bg-red-900/30 rounded-r-full" />
                {/* Needle */}
                <div
                    className="absolute top-0 h-full w-1 rounded-full"
                    style={{
                        left: `${Math.min(Math.max(value, 0), 100)}%`,
                        backgroundColor: color,
                        boxShadow: `0 0 6px ${color}`,
                        transform: "translateX(-50%)",
                    }}
                />
            </div>
            <span className="text-[9px] font-bold w-7" style={{ color }}>{value.toFixed(0)}</span>
        </div>
    );
};

const MacdIndicator: React.FC<{ histogram: number }> = ({ histogram }) => {
    const color = histogram >= 0 ? "#4ade80" : "#f87171";
    return (
        <div className="flex items-center gap-2 flex-1">
            <span className="text-[9px] text-slate-500 w-7 text-right">MACD</span>
            <div className="flex items-center gap-0.5 flex-1">
                <div
                    className="h-3 rounded-sm min-w-[2px]"
                    style={{
                        width: `${Math.min(Math.abs(histogram) * 3, 100)}%`,
                        backgroundColor: color,
                        opacity: 0.8,
                    }}
                />
            </div>
            <span className="text-[9px]" style={{ color }}>
                {histogram >= 0 ? "+" : ""}{histogram.toFixed(2)}
            </span>
        </div>
    );
};

const SmaTrend: React.FC<{ price: number; sma20: number; sma50: number }> = ({ price, sma20, sma50 }) => {
    const bullish = price > sma20 && sma20 > sma50;
    const bearish = price < sma20 && sma20 < sma50;

    return (
        <div className="flex items-center gap-2 flex-1">
            <span className="text-[9px] text-slate-500 w-7 text-right">SMA</span>
            <span className={`text-xs font-bold ${bullish ? "text-green-400" : bearish ? "text-red-400" : "text-slate-400"}`}>
                {bullish ? "\u2191 Alcista" : bearish ? "\u2193 Bajista" : "\u2194 Lateral"}
            </span>
        </div>
    );
};

const TechnicalSummary: React.FC<TechnicalSummaryProps> = ({ signals }) => {
    const portfolioSignals = signals.filter((s) => s.inPortfolio);

    if (portfolioSignals.length === 0) return null;

    return (
        <ChartCard
            title="Indicadores Técnicos"
            subtitle="RSI · MACD · SMA — monedas de tu portafolio"
        >
            <div className="flex flex-col gap-3">
                {portfolioSignals.map((s) => {
                    const signalStyle = SIGNAL_COLORS[s.signal] || "";
                    return (
                        <div key={s.coin} className="bg-slate-800/60 border border-slate-700/40 rounded-lg p-2.5">
                            {/* Header */}
                            <div className="flex justify-between items-center mb-2">
                                <div className="flex items-center gap-1.5">
                                    <span
                                        className="w-2 h-2 rounded-full"
                                        style={{ background: coinColor(s.coin) }}
                                    />
                                    <span className="text-xs font-bold text-white">{s.coin}</span>
                                </div>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${signalStyle}`}>
                                    {SIGNAL_LABELS[s.signal]}
                                </span>
                            </div>

                            {/* Indicators */}
                            <div className="flex flex-col gap-1.5">
                                <RsiBar value={s.indicators.rsi14} />
                                <MacdIndicator histogram={s.indicators.macdHistogram} />
                                <SmaTrend
                                    price={s.indicators.currentPrice}
                                    sma20={s.indicators.sma20}
                                    sma50={s.indicators.sma50}
                                />
                            </div>

                            {/* Confidence */}
                            <div className="mt-2 flex items-center gap-2">
                                <span className="text-[9px] text-slate-500">Confianza</span>
                                <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full bg-yellow-500"
                                        style={{ width: `${s.confidence}%` }}
                                    />
                                </div>
                                <span className="text-[9px] text-slate-400">{s.confidence}%</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </ChartCard>
    );
};

export default TechnicalSummary;
