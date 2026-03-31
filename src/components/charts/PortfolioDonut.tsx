import React from "react";
import {
    PieChart,
    Pie,
    Cell,
    Tooltip,
    ResponsiveContainer,
} from "recharts";
import { AggregatedAsset } from "../../lib/constants";
import { fmtUSD } from "../../lib/format";
import ChartCard from "./ChartCard";
import { coinColor } from "./chartColors";

const PortfolioDonut: React.FC<{ aggregated: AggregatedAsset[]; totalValue: number }> = ({
    aggregated,
    totalValue,
}) => {
    const data = aggregated
        .filter((a) => a.currentValue > 0)
        .map((a) => ({
            coin: a.coin,
            value: a.currentValue,
            pct: totalValue > 0 ? ((a.currentValue / totalValue) * 100).toFixed(1) : "0",
        }));

    const renderLabel = ({
        cx,
        cy,
        midAngle,
        innerRadius,
        outerRadius,
        index,
    }: {
        cx: number;
        cy: number;
        midAngle: number;
        innerRadius: number;
        outerRadius: number;
        index: number;
    }) => {
        const RADIAN = Math.PI / 180;
        const r = innerRadius + (outerRadius - innerRadius) * 0.55;
        const x = cx + r * Math.cos(-midAngle * RADIAN);
        const y = cy + r * Math.sin(-midAngle * RADIAN);
        const d = data[index];
        if (Number(d.pct) < 3) return null;
        return (
            <text
                x={x}
                y={y}
                fill="#fff"
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={9}
                fontWeight="bold"
            >
                {d.coin}
            </text>
        );
    };

    return (
        <ChartCard
            title="Distribución de Portafolio"
            subtitle="% del valor actual por moneda"
        >
            <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                    <Pie
                        data={data}
                        dataKey="value"
                        nameKey="coin"
                        cx="50%"
                        cy="50%"
                        innerRadius="40%"
                        outerRadius="70%"
                        labelLine={false}
                        label={renderLabel as any}
                    >
                        {data.map((d) => (
                            <Cell key={d.coin} fill={coinColor(d.coin)} opacity={0.85} />
                        ))}
                    </Pie>
                    {/* Center total */}
                    <text
                        x="50%"
                        y="47%"
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill="#fff"
                        fontSize={16}
                        fontWeight="bold"
                    >
                        {fmtUSD(totalValue)}
                    </text>
                    <text
                        x="50%"
                        y="56%"
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill="#64748b"
                        fontSize={9}
                    >
                        Valor Total
                    </text>
                    <Tooltip
                        content={({ active, payload }: any) => {
                            if (!active || !payload?.length) return null;
                            const d = payload[0].payload;
                            return (
                                <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs shadow-xl">
                                    <p className="font-bold text-white">{d.coin}</p>
                                    <p className="text-slate-400">{fmtUSD(d.value)}</p>
                                    <p className="text-slate-400">{d.pct}%</p>
                                </div>
                            );
                        }}
                    />
                </PieChart>
            </ResponsiveContainer>
            {/* Legend */}
            <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center">
                {data.map((d) => (
                    <span key={d.coin} className="flex items-center gap-1 text-[10px] text-slate-400">
                        <span
                            className="w-2 h-2 rounded-full inline-block"
                            style={{ background: coinColor(d.coin) }}
                        />
                        {d.coin} {d.pct}%
                    </span>
                ))}
            </div>
        </ChartCard>
    );
};

export default PortfolioDonut;
