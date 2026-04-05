import React from "react";
import { Treemap, ResponsiveContainer, Tooltip } from "recharts";
import { ProcessedInvestment } from "../../lib/constants";
import { fmtUSD, fmtPrice } from "../../lib/format";
import ChartCard from "./ChartCard";

function roiColor(pct: number): string {
    if (pct >= 50) return "#16a34a";
    if (pct >= 20) return "#22c55e";
    if (pct >= 5) return "#4ade80";
    if (pct >= 0) return "#86efac";
    if (pct >= -10) return "#fca5a5";
    if (pct >= -25) return "#f87171";
    return "#ef4444";
}

interface ContentProps {
    x: number;
    y: number;
    width: number;
    height: number;
    coin: string;
    roi: number;
    pnl: number;
}

function fmtPnlCompact(n: number): string {
    const abs = Math.abs(n);
    const sign = n >= 0 ? "+" : "-";
    if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
    return `${sign}$${abs.toFixed(0)}`;
}

const CustomContent: React.FC<ContentProps> = ({ x, y, width, height, coin, roi, pnl }) => {
    if (width < 30 || height < 25) return null;

    const fill = roiColor(roi);
    const fsRoi = width > 80 ? 14 : 11;
    const fsPnl = width > 80 ? 10 : 8;

    return (
        <g>
            <rect x={x} y={y} width={width} height={height} rx={6} fill={fill} fillOpacity={0.85} stroke="#1e293b" strokeWidth={2} />
            {width > 45 && height > 50 && (
                <>
                    <text x={x + width / 2} y={y + height / 2 - 13} textAnchor="middle" fill="#fff" fontSize={width > 80 ? 14 : 11} fontWeight="bold">{coin}</text>
                    <text x={x + width / 2} y={y + height / 2 + 1} textAnchor="middle" fill="#ffffffcc" fontSize={fsRoi}>{roi >= 0 ? "+" : ""}{roi.toFixed(1)}%</text>
                    <text x={x + width / 2} y={y + height / 2 + 16} textAnchor="middle" fill="#ffffffaa" fontSize={fsPnl}>{fmtPnlCompact(pnl)}</text>
                </>
            )}
            {width > 45 && height > 35 && height <= 50 && (
                <>
                    <text x={x + width / 2} y={y + height / 2 - 8} textAnchor="middle" fill="#fff" fontSize={width > 80 ? 14 : 11} fontWeight="bold">{coin}</text>
                    <text x={x + width / 2} y={y + height / 2 + 8} textAnchor="middle" fill="#ffffffcc" fontSize={fsRoi}>{roi >= 0 ? "+" : ""}{roi.toFixed(1)}%</text>
                </>
            )}
            {width > 45 && height <= 35 && (
                <text x={x + width / 2} y={y + height / 2 + 1} textAnchor="middle" fill="#fff" fontSize={10} fontWeight="bold">
                    {coin} {roi >= 0 ? "+" : ""}{roi.toFixed(0)}%
                </text>
            )}
        </g>
    );
};

const IndividualTreemap: React.FC<{ items: ProcessedInvestment[] }> = ({ items }) => {
    const data = items
        .filter((i) => i.currentValue > 0)
        .map((i) => ({
            name: `${i.coin}-${i.id}`,
            coin: i.coin,
            buyPrice: i.buyPrice,
            currentPrice: i.currentPrice,
            value: i.currentValue,
            invested: i.invested,
            pnl: i.profit,
            roi: i.roi,
            date: i.date,
        }));

    if (data.length === 0) return null;

    return (
        <ChartCard
            title="Posiciones Individuales"
            subtitle="Tamaño = valor · Color = ROI% por entrada"
        >
            <ResponsiveContainer width="100%" height={220}>
                <Treemap
                    data={data}
                    dataKey="value"
                    nameKey="name"
                    content={<CustomContent x={0} y={0} width={0} height={0} coin="" roi={0} pnl={0} />}
                >
                    <Tooltip
                        content={({ active, payload }: any) => {
                            if (!active || !payload?.length) return null;
                            const d = payload[0].payload;
                            const date = d.date
                                ? new Date(d.date).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" })
                                : "—";
                            return (
                                <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs shadow-xl">
                                    <p className="font-bold text-white mb-1">{d.coin}</p>
                                    <p className="text-slate-400">Compra: {fmtPrice(d.buyPrice)}</p>
                                    <p className="text-slate-400">Actual: {fmtPrice(d.currentPrice)}</p>
                                    <p className="text-slate-400">Valor: {fmtUSD(d.value)}</p>
                                    <p className="text-slate-400">Invertido: {fmtUSD(d.invested)}</p>
                                    <p style={{ color: d.pnl >= 0 ? "#4ade80" : "#f87171" }}>
                                        PNL: {d.pnl >= 0 ? "+" : ""}{fmtUSD(d.pnl)}
                                    </p>
                                    <p style={{ color: d.roi >= 0 ? "#4ade80" : "#f87171" }}>
                                        ROI: {d.roi >= 0 ? "+" : ""}{d.roi.toFixed(2)}%
                                    </p>
                                    <p className="text-slate-500 mt-1">{date}</p>
                                </div>
                            );
                        }}
                    />
                </Treemap>
            </ResponsiveContainer>
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

export default IndividualTreemap;
