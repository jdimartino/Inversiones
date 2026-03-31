import React from "react";
import { Treemap, ResponsiveContainer, Tooltip } from "recharts";
import { AggregatedAsset } from "../../lib/constants";
import { fmtUSD } from "../../lib/format";
import ChartCard from "./ChartCard";
import { coinColor } from "./chartColors";

function roiColor(pct: number): string {
    if (pct >= 50) return "#16a34a";
    if (pct >= 20) return "#22c55e";
    if (pct >= 5) return "#4ade80";
    if (pct >= 0) return "#86efac";
    if (pct >= -10) return "#fca5a5";
    if (pct >= -25) return "#f87171";
    return "#ef4444";
}

interface TreemapContentProps {
    x: number;
    y: number;
    width: number;
    height: number;
    coin: string;
    roi: number;
    value: number;
}

const CustomContent: React.FC<TreemapContentProps> = ({ x, y, width, height, coin, roi, value }) => {
    if (width < 30 || height < 25) return null;

    const fill = roiColor(roi);

    return (
        <g>
            <rect
                x={x}
                y={y}
                width={width}
                height={height}
                rx={6}
                fill={fill}
                fillOpacity={0.85}
                stroke="#1e293b"
                strokeWidth={2}
            />
            {width > 45 && height > 35 && (
                <>
                    <text
                        x={x + width / 2}
                        y={y + height / 2 - 8}
                        textAnchor="middle"
                        fill="#fff"
                        fontSize={width > 80 ? 14 : 11}
                        fontWeight="bold"
                    >
                        {coin}
                    </text>
                    <text
                        x={x + width / 2}
                        y={y + height / 2 + 8}
                        textAnchor="middle"
                        fill="#ffffffcc"
                        fontSize={width > 80 ? 11 : 9}
                    >
                        {roi >= 0 ? "+" : ""}{roi.toFixed(1)}%
                    </text>
                </>
            )}
            {width > 45 && height <= 35 && (
                <text
                    x={x + width / 2}
                    y={y + height / 2 + 1}
                    textAnchor="middle"
                    fill="#fff"
                    fontSize={10}
                    fontWeight="bold"
                >
                    {coin} {roi >= 0 ? "+" : ""}{roi.toFixed(0)}%
                </text>
            )}
        </g>
    );
};

const PerformanceTreemap: React.FC<{ aggregated: AggregatedAsset[] }> = ({ aggregated }) => {
    const data = aggregated
        .filter((a) => a.currentValue > 0)
        .map((a) => ({
            name: a.coin,
            coin: a.coin,
            value: a.currentValue,
            roi: a.totalInvested > 0 ? ((a.currentValue - a.totalInvested) / a.totalInvested) * 100 : 0,
            invested: a.totalInvested,
            pnl: a.pnl,
        }));

    if (data.length === 0) return null;

    return (
        <ChartCard
            title="Mapa de Rendimiento"
            subtitle="Tamaño = valor de posición · Color = ROI% (verde ↑ rojo ↓)"
        >
            <ResponsiveContainer width="100%" height={220}>
                <Treemap
                    data={data}
                    dataKey="value"
                    nameKey="coin"
                    content={<CustomContent x={0} y={0} width={0} height={0} coin="" roi={0} value={0} />}
                >
                    <Tooltip
                        content={({ active, payload }: any) => {
                            if (!active || !payload?.length) return null;
                            const d = payload[0].payload;
                            return (
                                <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs shadow-xl">
                                    <p className="font-bold text-white mb-1">{d.coin}</p>
                                    <p className="text-slate-400">Valor: {fmtUSD(d.value)}</p>
                                    <p className="text-slate-400">Invertido: {fmtUSD(d.invested)}</p>
                                    <p style={{ color: d.pnl >= 0 ? "#4ade80" : "#f87171" }}>
                                        PNL: {d.pnl >= 0 ? "+" : ""}{fmtUSD(d.pnl)}
                                    </p>
                                    <p style={{ color: d.roi >= 0 ? "#4ade80" : "#f87171" }}>
                                        ROI: {d.roi >= 0 ? "+" : ""}{d.roi.toFixed(2)}%
                                    </p>
                                </div>
                            );
                        }}
                    />
                </Treemap>
            </ResponsiveContainer>
            {/* Color legend */}
            <div className="flex items-center justify-center gap-1 text-[9px] text-slate-500">
                <span className="w-3 h-2 rounded-sm" style={{ background: "#ef4444" }} />
                <span>-25%</span>
                <span className="w-3 h-2 rounded-sm" style={{ background: "#fca5a5" }} />
                <span>-10%</span>
                <span className="w-3 h-2 rounded-sm" style={{ background: "#86efac" }} />
                <span>0%</span>
                <span className="w-3 h-2 rounded-sm" style={{ background: "#4ade80" }} />
                <span>+20%</span>
                <span className="w-3 h-2 rounded-sm" style={{ background: "#16a34a" }} />
                <span>+50%</span>
            </div>
        </ChartCard>
    );
};

export default PerformanceTreemap;
