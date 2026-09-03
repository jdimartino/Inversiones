import React, { useState } from "react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Cell,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine,
} from "recharts";
import { AggregatedAsset } from "../../lib/constants";
import ChartCard from "./ChartCard";
import DarkTooltip from "./DarkTooltip";

type ViewMode = "usd" | "pct";

const PnlBarChart: React.FC<{ aggregated: AggregatedAsset[] }> = ({ aggregated }) => {
    const [mode, setMode] = useState<ViewMode>("usd");

    const dataUsd = [...aggregated]
        .sort((a, b) => b.pnl - a.pnl)
        .map((a) => ({ coin: a.coin, PNL: Math.round(a.pnl * 100) / 100 }));

    const dataPct = [...aggregated]
        .sort((a, b) => b.priceDiffPercent - a.priceDiffPercent)
        .map((a) => ({
            coin: a.coin,
            "ROI %": Math.round(a.priceDiffPercent * 100) / 100,
        }));

    const data = mode === "usd" ? dataUsd : dataPct;
    const dataKey = mode === "usd" ? "PNL" : "ROI %";

    return (
        <ChartCard
            title="PNL por Moneda"
            subtitle={mode === "usd" ? "Ganancia / Pérdida en USD" : "Retorno sobre inversión (%)"}
        >
            {/* Toggle */}
            <div className="flex gap-1 self-end">
                <button
                    onClick={() => setMode("usd")}
                    className={`px-2.5 py-1 rounded text-[10px] font-bold transition-colors ${
                        mode === "usd"
                            ? "bg-yellow-600 text-white"
                            : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                    }`}
                >
                    USD
                </button>
                <button
                    onClick={() => setMode("pct")}
                    className={`px-2.5 py-1 rounded text-[10px] font-bold transition-colors ${
                        mode === "pct"
                            ? "bg-yellow-600 text-white"
                            : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                    }`}
                >
                    %
                </button>
            </div>

            <ResponsiveContainer width="100%" height={Math.max(200, data.length * 38)}>
                <BarChart
                    data={data}
                    layout="vertical"
                    margin={{ top: 0, right: mode === "pct" ? 40 : 16, left: 24, bottom: 0 }}
                >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                    <XAxis
                        type="number"
                        tick={{ fill: "#475569", fontSize: 9 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: any) =>
                            mode === "usd"
                                ? `$${(v / 1000).toFixed(0)}k`
                                : `${v > 0 ? "+" : ""}${v.toFixed(0)}%`
                        }
                    />
                    <YAxis
                        type="category"
                        dataKey="coin"
                        tick={{ fill: "#94a3b8", fontSize: 11, fontWeight: "bold" }}
                        tickLine={false}
                        axisLine={false}
                        width={36}
                    />
                    {mode === "usd" ? (
                        <Tooltip content={<DarkTooltip />} cursor={{ fill: "#1e293b" }} />
                    ) : (
                        <Tooltip
                            cursor={{ fill: "#1e293b" }}
                            content={({ active, payload, label }: any) => {
                                if (!active || !payload?.length) return null;
                                const val = payload[0].value as number;
                                return (
                                    <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs shadow-xl">
                                        <p className="text-slate-400 font-bold mb-1">{label}</p>
                                        <p style={{ color: val >= 0 ? "#4ade80" : "#f87171" }}>
                                            {val >= 0 ? "+" : ""}{val.toFixed(2)}% ROI
                                        </p>
                                    </div>
                                );
                            }}
                        />
                    )}
                    {mode === "pct" && <ReferenceLine x={0} stroke="#475569" strokeDasharray="3 3" />}
                    <Bar dataKey={dataKey} radius={[0, 4, 4, 0]} maxBarSize={22}>
                        {data.map((d: any) => (
                            <Cell
                                key={d.coin}
                                fill={(d[dataKey] ?? 0) >= 0 ? "#4ade80" : "#f87171"}
                            />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </ChartCard>
    );
};

export default PnlBarChart;
