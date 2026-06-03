import React from "react";
import {
    ScatterChart,
    Scatter,
    XAxis,
    YAxis,
    ZAxis,
    CartesianGrid,
    Tooltip,
    ReferenceLine,
    ResponsiveContainer,
} from "recharts";
import { AggregatedAsset } from "../../lib/constants";
import type { CoinSignal } from "../../lib/types/signals";
import { fmtUSD } from "../../lib/format";
import ChartCard from "./ChartCard";
import { coinColor } from "./chartColors";

interface PositionBubbleProps {
    aggregated: AggregatedAsset[];
    signals?: CoinSignal[];
}

const PositionBubble: React.FC<PositionBubbleProps> = ({ aggregated, signals = [] }) => {
    const signalMap = new Map(signals.filter((s) => s.inPortfolio).map((s) => [s.coin, s]));

    const data = aggregated
        .filter((a) => a.currentValue > 0 && signalMap.has(a.coin))
        .map((a) => {
            const sig = signalMap.get(a.coin)!;
            const roi = a.totalInvested > 0 ? ((a.currentValue - a.totalInvested) / a.totalInvested) * 100 : 0;
            return {
                coin: a.coin,
                roi: Math.round(roi * 100) / 100,
                rsi: Math.round(sig.indicators.rsi14 * 100) / 100,
                value: a.currentValue,
                fill: coinColor(a.coin),
            };
        });

    if (data.length < 2) return null;

    const maxValue = Math.max(...data.map((d) => d.value));

    return (
        <ChartCard
            title="Posición vs Riesgo"
            subtitle="X = ROI% · Y = RSI (sobrecompra/sobreventa) · Tamaño = valor"
        >
            <ResponsiveContainer width="100%" height={260}>
                <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                        type="number"
                        dataKey="roi"
                        name="ROI"
                        tick={{ fill: "#475569", fontSize: 9 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`}
                        label={{ value: "ROI %", position: "insideBottom", offset: -5, fill: "#475569", fontSize: 9 }}
                    />
                    <YAxis
                        type="number"
                        dataKey="rsi"
                        name="RSI"
                        domain={[0, 100]}
                        tick={{ fill: "#475569", fontSize: 9 }}
                        tickLine={false}
                        axisLine={false}
                        width={30}
                        label={{ value: "RSI", angle: -90, position: "insideLeft", fill: "#475569", fontSize: 9 }}
                    />
                    <ZAxis
                        type="number"
                        dataKey="value"
                        range={[100, 800]}
                        name="Valor"
                    />
                    <Tooltip
                        content={({ active, payload }: any) => {
                            if (!active || !payload?.length) return null;
                            const d = payload[0].payload;
                            return (
                                <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs shadow-xl">
                                    <p className="font-bold text-white mb-1">{d.coin}</p>
                                    <p className="text-slate-400">
                                        ROI: <span style={{ color: d.roi >= 0 ? "#4ade80" : "#f87171" }}>
                                            {d.roi >= 0 ? "+" : ""}{d.roi.toFixed(2)}%
                                        </span>
                                    </p>
                                    <p className="text-slate-400">
                                        RSI: <span style={{ color: d.rsi >= 70 ? "#ef4444" : d.rsi <= 30 ? "#4ade80" : "#eab308" }}>
                                            {d.rsi.toFixed(1)}
                                        </span>
                                    </p>
                                    <p className="text-slate-400">Valor: {fmtUSD(d.value)}</p>
                                </div>
                            );
                        }}
                        cursor={{ strokeDasharray: "3 3" }}
                    />
                    {/* Quadrant references */}
                    <ReferenceLine y={70} stroke="#ef444480" strokeDasharray="4 4" label={{ value: "Sobrecompra", fill: "#ef444480", fontSize: 8, position: "right" }} />
                    <ReferenceLine y={30} stroke="#4ade8080" strokeDasharray="4 4" label={{ value: "Sobreventa", fill: "#4ade8080", fontSize: 8, position: "right" }} />
                    <ReferenceLine x={0} stroke="#47556980" strokeDasharray="4 4" />

                    <Scatter data={data} isAnimationActive={false}>
                        {data.map((d) => (
                            <circle key={d.coin} fill={d.fill} fillOpacity={0.8} />
                        ))}
                    </Scatter>
                </ScatterChart>
            </ResponsiveContainer>
            {/* Quadrant legend */}
            <div className="grid grid-cols-2 gap-1 text-[9px] text-slate-500">
                <span>↖ Alto ROI + RSI bajo = <span className="text-green-400 font-bold">Posición fuerte</span></span>
                <span>\u2197 Alto ROI + RSI alto = <span className="text-yellow-400 font-bold">Tomar ganancias</span></span>
                <span>\u2199 Bajo ROI + RSI bajo = <span className="text-blue-400 font-bold">Oportunidad</span></span>
                <span>\u2198 Bajo ROI + RSI alto = <span className="text-red-400 font-bold">Peligro</span></span>
            </div>
        </ChartCard>
    );
};

export default PositionBubble;
