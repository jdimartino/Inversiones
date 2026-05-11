import React, { useState } from "react";
import {
    ComposedChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ReferenceLine,
    ResponsiveContainer,
} from "recharts";
import type { PnlSnapshot } from "../../lib/constants";
import { fmtUSD } from "../../lib/format";
import ChartCard from "./ChartCard";

interface DailyPnlChartProps {
    snapshots: PnlSnapshot[];
}

type Mode = "usd" | "pct";

function fmtDate(d: string): string {
    const parts = d.split("-");
    return `${parts[2]}/${parts[1]}`;
}

const CustomTooltip: React.FC<{ active?: boolean; payload?: any[]; label?: string; mode: Mode }> = ({
    active,
    payload,
    label,
    mode,
}) => {
    if (!active || !payload?.length || !label) return null;
    return (
        <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs shadow-xl">
            <p className="text-slate-400 font-bold mb-1">{label}</p>
            {payload.map((p: any) => {
                const val = p.value as number;
                const color = val >= 0 ? "#4ade80" : "#f87171";
                return (
                    <p key={p.dataKey} style={{ color }}>
                        {p.name}: {val >= 0 ? "+" : ""}
                        {mode === "usd" ? fmtUSD(val) : `${val.toFixed(2)}%`}
                    </p>
                );
            })}
        </div>
    );
};

const DailyPnlChart: React.FC<DailyPnlChartProps> = ({ snapshots }) => {
    const [mode, setMode] = useState<Mode>("usd");

    if (snapshots.length === 0) {
        return (
            <ChartCard title="Rendimiento Diario" subtitle="PNL Compras y Ventas">
                <div className="text-center py-12 text-slate-500 text-sm">
                    <p className="font-semibold">Aún no hay datos históricos.</p>
                    <p className="text-xs mt-1">
                        El primer snapshot se guardará automáticamente hoy al cargar el dashboard con posiciones activas.
                    </p>
                </div>
            </ChartCard>
        );
    }

    const chartData = snapshots.map((s) => ({
        date: fmtDate(s.date),
        portfolioPnl: s.portfolioPnl,
        portfolioRoi: s.portfolioRoi,
        salesPnl: s.salesPnl,
        salesRoi: s.salesRoi,
    }));

    const portfolioKey = mode === "usd" ? "portfolioPnl" : "portfolioRoi";
    const salesKey = mode === "usd" ? "salesPnl" : "salesRoi";
    const yAxisId = mode === "usd" ? "left" : "right";

    const tickFmtLeft = (v: number) =>
        v === 0 ? "$0" : `${v >= 0 ? "+" : ""}$${Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)}`;
    const tickFmtRight = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

    return (
        <ChartCard
            title="Rendimiento Diario"
            subtitle={mode === "usd" ? "PNL en USD — Compras (azul) vs Ventas (verde)" : "ROI (%) — Compras (azul) vs Ventas (verde)"}
        >
            {snapshots.length === 1 && (
                <p className="text-[10px] text-slate-500 text-center -mb-1">
                    Los datos se acumularán día a día con el uso de la app.
                </p>
            )}

            {/* Toggles */}
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

            <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={chartData} margin={{ top: 4, right: 48, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                        dataKey="date"
                        tick={{ fill: "#475569", fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                    />
                    <YAxis
                        yAxisId="left"
                        tick={{ fill: "#475569", fontSize: 9 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={tickFmtLeft}
                        width={60}
                    />
                    <YAxis
                        yAxisId="right"
                        orientation="right"
                        tick={{ fill: "#475569", fontSize: 9 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={tickFmtRight}
                        width={48}
                    />
                    <ReferenceLine yAxisId="left" y={0} stroke="#475569" strokeDasharray="3 3" />
                    <ReferenceLine yAxisId="right" y={0} stroke="#475569" strokeDasharray="3 3" />
                    <Line
                        yAxisId={yAxisId}
                        dataKey={portfolioKey}
                        name="Compras"
                        stroke="#38bdf8"
                        dot={snapshots.length <= 10 ? { r: 3, fill: "#38bdf8" } : false}
                        strokeWidth={2}
                        connectNulls
                    />
                    <Line
                        yAxisId={yAxisId}
                        dataKey={salesKey}
                        name="Ventas"
                        stroke="#4ade80"
                        dot={snapshots.length <= 10 ? { r: 3, fill: "#4ade80" } : false}
                        strokeWidth={2}
                        connectNulls
                    />
                    <Tooltip content={<CustomTooltip mode={mode} />} />
                    <Legend
                        wrapperStyle={{ fontSize: "11px", color: "#94a3b8" }}
                    />
                </ComposedChart>
            </ResponsiveContainer>
        </ChartCard>
    );
};

export default DailyPnlChart;
