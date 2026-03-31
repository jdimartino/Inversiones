import React from "react";
import {
    LineChart,
    Line,
    ReferenceLine,
    ResponsiveContainer,
    YAxis,
} from "recharts";
import type { Kline } from "../../lib/types/signals";
import { AggregatedAsset } from "../../lib/constants";
import { fmtPrice } from "../../lib/format";
import ChartCard from "./ChartCard";
import { coinColor } from "./chartColors";

interface SparklineGridProps {
    aggregated: AggregatedAsset[];
    klinesMap: Record<string, Kline[]>;
}

const MiniSparkline: React.FC<{
    coin: string;
    klines: Kline[];
    avgBuyPrice: number;
    currentPrice: number;
    pnl: number;
}> = ({ coin, klines, avgBuyPrice, currentPrice, pnl }) => {
    const data = klines.map((k) => ({ close: k.close }));
    const isAbove = currentPrice >= avgBuyPrice;
    const strokeColor = isAbove ? "#4ade80" : "#f87171";

    const closes = klines.map((k) => k.close);
    const min = Math.min(...closes, avgBuyPrice) * 0.999;
    const max = Math.max(...closes, avgBuyPrice) * 1.001;

    // 100h change
    const firstPrice = closes[0] ?? currentPrice;
    const change100h = firstPrice > 0 ? ((currentPrice - firstPrice) / firstPrice) * 100 : 0;

    return (
        <div className="bg-slate-800/60 border border-slate-700/40 rounded-lg p-2.5">
            {/* Header */}
            <div className="flex justify-between items-center mb-1">
                <div className="flex items-center gap-1.5">
                    <span
                        className="w-2 h-2 rounded-full"
                        style={{ background: coinColor(coin) }}
                    />
                    <span className="text-xs font-bold text-white">{coin}</span>
                </div>
                <span className={`text-[10px] font-bold ${change100h >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {change100h >= 0 ? "+" : ""}{change100h.toFixed(1)}%
                </span>
            </div>

            {/* Sparkline */}
            <ResponsiveContainer width="100%" height={55}>
                <LineChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                    <YAxis domain={[min, max]} hide />
                    <Line
                        type="monotone"
                        dataKey="close"
                        stroke={strokeColor}
                        strokeWidth={1.5}
                        dot={false}
                        isAnimationActive={false}
                    />
                    <ReferenceLine
                        y={avgBuyPrice}
                        stroke="#f59e0b"
                        strokeDasharray="3 2"
                        strokeWidth={1}
                    />
                </LineChart>
            </ResponsiveContainer>

            {/* Footer */}
            <div className="flex justify-between items-center mt-1">
                <span className="text-[9px] text-slate-500">
                    {fmtPrice(currentPrice)}
                </span>
                <span className="text-[9px] text-amber-600">
                    prom: {fmtPrice(avgBuyPrice)}
                </span>
            </div>
        </div>
    );
};

const SparklineGrid: React.FC<SparklineGridProps> = ({ aggregated, klinesMap }) => {
    const coins = aggregated.filter(
        (a) => a.currentValue > 0 && klinesMap[a.coin]?.length > 10
    );

    if (coins.length === 0) return null;

    return (
        <ChartCard
            title="Precio de Monedas (100h)"
            subtitle="Línea amarilla = tu precio promedio de compra"
        >
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {coins.map((a) => (
                    <MiniSparkline
                        key={a.coin}
                        coin={a.coin}
                        klines={klinesMap[a.coin]}
                        avgBuyPrice={a.avgBuyPrice}
                        currentPrice={a.currentPrice}
                        pnl={a.pnl}
                    />
                ))}
            </div>
        </ChartCard>
    );
};

export default SparklineGrid;
