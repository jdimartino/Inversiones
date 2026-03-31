import React, { useMemo } from "react";
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    ReferenceLine,
} from "recharts";
import { ProcessedInvestment } from "../../lib/constants";
import { fmtUSD } from "../../lib/format";
import ChartCard from "./ChartCard";
import { coinColor } from "./chartColors";

const InvestmentTimeline: React.FC<{ items: ProcessedInvestment[] }> = ({ items }) => {
    const data = useMemo(() => {
        const sorted = [...items].sort((a, b) => a.date - b.date);
        let cumInvested = 0;
        let cumValue = 0;

        return sorted.map((item) => {
            cumInvested += item.invested;
            cumValue += item.currentValue;
            return {
                fecha: new Date(item.date).toLocaleDateString("es", {
                    month: "short",
                    day: "numeric",
                }),
                coin: item.coin,
                Invertido: Math.round(cumInvested),
                "Valor Actual": Math.round(cumValue),
            };
        });
    }, [items]);

    if (data.length < 2) {
        return (
            <ChartCard title="Línea de Tiempo" subtitle="Historial de capital invertido vs valor acumulado">
                <p className="text-slate-600 text-xs text-center py-8">
                    Agrega más operaciones para ver la evolución temporal.
                </p>
            </ChartCard>
        );
    }

    return (
        <ChartCard
            title="Línea de Tiempo"
            subtitle="Capital invertido (azul) vs valor de mercado (amarillo) — el área entre ambos es tu PNL"
        >
            <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                    <defs>
                        <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#4ade80" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#4ade80" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="investedGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#60a5fa" stopOpacity={0.02} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                        dataKey="fecha"
                        tick={{ fill: "#475569", fontSize: 9 }}
                        tickLine={false}
                        axisLine={false}
                    />
                    <YAxis
                        tick={{ fill: "#475569", fontSize: 9 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: any) => `$${(v / 1000).toFixed(0)}k`}
                        width={38}
                    />
                    <Tooltip
                        content={({ active, payload, label }: any) => {
                            if (!active || !payload?.length) return null;
                            const inv = payload.find((p: any) => p.dataKey === "Invertido")?.value as number;
                            const val = payload.find((p: any) => p.dataKey === "Valor Actual")?.value as number;
                            const entry = payload[0]?.payload;
                            const pnl = val - inv;
                            return (
                                <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs shadow-xl">
                                    <p className="font-bold mb-1" style={{ color: coinColor(entry?.coin) }}>
                                        {entry?.coin} \u00b7 {label}
                                    </p>
                                    <p className="text-blue-400">Invertido: {fmtUSD(inv)}</p>
                                    <p className="text-yellow-400">Valor: {fmtUSD(val)}</p>
                                    <p className={pnl >= 0 ? "text-green-400" : "text-red-400"}>
                                        PNL: {pnl >= 0 ? "+" : ""}{fmtUSD(pnl)}
                                    </p>
                                </div>
                            );
                        }}
                    />
                    <Legend wrapperStyle={{ fontSize: "10px", color: "#64748b" }} />
                    <Area
                        type="monotone"
                        dataKey="Valor Actual"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        fill="url(#pnlGradient)"
                        strokeDasharray="4 2"
                    />
                    <Area
                        type="monotone"
                        dataKey="Invertido"
                        stroke="#60a5fa"
                        strokeWidth={2}
                        fill="url(#investedGradient)"
                    />
                </AreaChart>
            </ResponsiveContainer>
        </ChartCard>
    );
};

export default InvestmentTimeline;
