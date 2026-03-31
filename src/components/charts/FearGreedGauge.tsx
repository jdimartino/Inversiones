import React from "react";
import type { FearGreedData } from "../../lib/types/signals";
import ChartCard from "./ChartCard";

const CLASSIFICATIONS: Record<string, string> = {
    "Extreme Fear": "Miedo Extremo",
    Fear: "Miedo",
    Neutral: "Neutral",
    Greed: "Codicia",
    "Extreme Greed": "Codicia Extrema",
};

function getColor(value: number): string {
    if (value <= 20) return "#ef4444";
    if (value <= 40) return "#f97316";
    if (value <= 60) return "#eab308";
    if (value <= 80) return "#84cc16";
    return "#22c55e";
}

const FearGreedGauge: React.FC<{ data: FearGreedData | null; loading: boolean }> = ({
    data,
    loading,
}) => {
    if (loading || !data) {
        return (
            <ChartCard title="Sentimiento del Mercado" subtitle="Fear & Greed Index">
                <div className="h-24 bg-slate-700/30 rounded animate-pulse" />
            </ChartCard>
        );
    }

    const color = getColor(data.value);
    const label = CLASSIFICATIONS[data.classification] || data.classification;

    // Semicircle gauge
    const angle = (data.value / 100) * 180;
    const rad = (angle * Math.PI) / 180;
    const x = 100 + 70 * Math.cos(Math.PI - rad);
    const y = 90 - 70 * Math.sin(Math.PI - rad);

    return (
        <ChartCard title="Sentimiento del Mercado" subtitle="Compra en miedo, cautela en codicia">
            <div className="flex items-center gap-4">
                <div className="relative w-[160px] h-[90px] flex-shrink-0">
                    <svg viewBox="0 0 200 110" className="w-full h-full">
                        <path
                            d="M 20 90 A 80 80 0 0 1 180 90"
                            fill="none"
                            stroke="#334155"
                            strokeWidth="12"
                            strokeLinecap="round"
                        />
                        <defs>
                            <linearGradient id="fgGaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#ef4444" />
                                <stop offset="25%" stopColor="#f97316" />
                                <stop offset="50%" stopColor="#eab308" />
                                <stop offset="75%" stopColor="#84cc16" />
                                <stop offset="100%" stopColor="#22c55e" />
                            </linearGradient>
                        </defs>
                        <path
                            d="M 20 90 A 80 80 0 0 1 180 90"
                            fill="none"
                            stroke="url(#fgGaugeGrad)"
                            strokeWidth="12"
                            strokeLinecap="round"
                            strokeDasharray={`${(data.value / 100) * 251}, 251`}
                        />
                        <circle cx={x} cy={y} r="6" fill={color} />
                        <circle cx={x} cy={y} r="3" fill="white" />
                        <text x="100" y="85" textAnchor="middle" fill="white" fontSize="28" fontWeight="bold">
                            {data.value}
                        </text>
                    </svg>
                </div>
                <div>
                    <p className="text-base font-bold" style={{ color }}>{label}</p>
                    <p className="text-[10px] text-slate-600 mt-1">
                        0 = Miedo Extremo \u00b7 100 = Codicia Extrema
                    </p>
                </div>
            </div>
        </ChartCard>
    );
};

export default FearGreedGauge;
