import React, { useMemo } from "react";
import { BarChart2 } from "lucide-react";
import {
    PieChart,
    Pie,
    Cell,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    LineChart,
    Line,
    Legend,
    RadialBarChart,
    RadialBar,
    ReferenceLine,
} from "recharts";
import { AggregatedAsset, ProcessedInvestment, ProcessedLoan } from "../lib/constants";
import { fmtUSD } from "../lib/format";

// ── Colors per coin ──────────────────────────────────────────────────
const COIN_HEX: Record<string, string> = {
    BTC: "#f97316",
    ETH: "#818cf8",
    SOL: "#a855f7",
    BNB: "#eab308",
    ADA: "#60a5fa",
    DOGE: "#fbbf24",
    LTC: "#94a3b8",
    XRP: "#38bdf8",
    DOT: "#f472b6",
    MATIC: "#8b5cf6",
    SHIB: "#f87171",
    AVAX: "#ef4444",
    LINK: "#3b82f6",
    DEFAULT: "#64748b",
};
const coinColor = (coin: string) => COIN_HEX[coin] ?? COIN_HEX.DEFAULT;

// ── Tooltip custom reutilizable ──────────────────────────────────────
const DarkTooltip = ({
    active,
    payload,
    label,
}: {
    active?: boolean;
    payload?: { name: string; value: number; payload?: { pnl?: number; coin?: string } }[];
    label?: string;
}) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs shadow-xl">
            {label && <p className="text-slate-400 font-bold mb-1">{label}</p>}
            {payload.map((p) => (
                <p key={p.name} style={{ color: "#fff" }}>
                    <span className="text-slate-400">{p.name}: </span>
                    {typeof p.value === "number" && Math.abs(p.value) > 1
                        ? fmtUSD(p.value)
                        : p.value}
                </p>
            ))}
        </div>
    );
};

// ────────────────────────────────────────────────────────────────────
//  CARD wrapper
// ────────────────────────────────────────────────────────────────────
const ChartCard: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({
    title,
    subtitle,
    children,
}) => (
    <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-xl p-4 flex flex-col gap-3">
        <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">{title}</h3>
            {subtitle && <p className="text-[10px] text-slate-600 mt-0.5">{subtitle}</p>}
        </div>
        {children}
    </div>
);

// ────────────────────────────────────────────────────────────────────
//  1. DONUT – Distribución del portafolio
// ────────────────────────────────────────────────────────────────────
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
            title="Distribución del Portafolio"
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

// ────────────────────────────────────────────────────────────────────
//  2. BARRAS HORIZONTALES – PNL por moneda
// ────────────────────────────────────────────────────────────────────
const PnlBarChart: React.FC<{ aggregated: AggregatedAsset[] }> = ({ aggregated }) => {
    const data = [...aggregated]
        .sort((a, b) => b.pnl - a.pnl)
        .map((a) => ({ coin: a.coin, PNL: Math.round(a.pnl * 100) / 100 }));

    return (
        <ChartCard title="PNL Neto por Moneda" subtitle="Ganancia / Pérdida en USD">
            <ResponsiveContainer width="100%" height={Math.max(200, data.length * 38)}>
                <BarChart
                    data={data}
                    layout="vertical"
                    margin={{ top: 0, right: 16, left: 24, bottom: 0 }}
                >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                    <XAxis
                        type="number"
                        tick={{ fill: "#475569", fontSize: 9 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: any) => `$${(v / 1000).toFixed(0)}k`}
                    />
                    <YAxis
                        type="category"
                        dataKey="coin"
                        tick={{ fill: "#94a3b8", fontSize: 11, fontWeight: "bold" }}
                        tickLine={false}
                        axisLine={false}
                        width={36}
                    />
                    <Tooltip content={<DarkTooltip />} cursor={{ fill: "#1e293b" }} />
                    <Bar dataKey="PNL" radius={[0, 4, 4, 0]} maxBarSize={22}>
                        {data.map((d) => (
                            <Cell key={d.coin} fill={d.PNL >= 0 ? "#4ade80" : "#f87171"} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </ChartCard>
    );
};

// ────────────────────────────────────────────────────────────────────
//  3. LTV GAUGE – Un gauge por préstamo
// ────────────────────────────────────────────────────────────────────
const LtvGauges: React.FC<{ loans: ProcessedLoan[] }> = ({ loans }) => {
    if (loans.length === 0) return null;

    return (
        <ChartCard
            title="LTV de Préstamos"
            subtitle="Liquidación Binance 91% · Bybit 92%"
        >
            <div className="flex flex-col gap-4">
                {loans.map((loan) => {
                    const ltv = Math.min(loan.ltv, 100);
                    const color =
                        ltv >= 85 ? "#ef4444" : ltv >= 75 ? "#f59e0b" : "#4ade80";
                    const bgColor =
                        ltv >= 85 ? "#7f1d1d" : ltv >= 75 ? "#78350f" : "#14532d";

                    return (
                        <div key={loan.id}>
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-xs font-bold text-slate-300">
                                    {loan.exchange} — {loan.collateralCoin}
                                </span>
                                <span className="text-xs font-bold" style={{ color }}>
                                    LTV {ltv.toFixed(1)}%
                                </span>
                            </div>
                            <div className="h-3 rounded-full bg-slate-700 overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{
                                        width: `${ltv}%`,
                                        backgroundColor: color,
                                        boxShadow: `0 0 8px ${color}80`,
                                    }}
                                />
                            </div>
                            <div className="flex justify-between text-[9px] mt-0.5 text-slate-600">
                                <span>0%</span>
                                <span className="text-amber-700">75%</span>
                                <span className="text-amber-600">85%</span>
                                <span className="text-red-700">Liq.</span>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-0.5">
                                Precio liquidación: <span className="text-red-400 font-bold">{fmtUSD(loan.liquidationPrice)}</span>
                                &nbsp;·&nbsp;
                                Deuda: <span className="text-slate-300 font-bold">{fmtUSD(loan.borrowedUSDT)}</span>
                            </p>
                        </div>
                    );
                })}
            </div>
        </ChartCard>
    );
};

// ────────────────────────────────────────────────────────────────────
//  4. BARRAS AGRUPADAS – Precio promedio vs precio actual
// ────────────────────────────────────────────────────────────────────
const PriceCompareChart: React.FC<{ aggregated: AggregatedAsset[] }> = ({ aggregated }) => {
    const data = [...aggregated]
        .sort((a, b) => b.priceDiffPercent - a.priceDiffPercent)
        .map((a) => ({
            coin: a.coin,
            "Diferencia %": Math.round(a.priceDiffPercent * 100) / 100,
        }));

    return (
        <ChartCard
            title="Precio Actual vs Promedio de Compra"
            subtitle="% de diferencia entre el precio de mercado y tu precio promedio"
        >
            <ResponsiveContainer width="100%" height={Math.max(200, data.length * 38)}>
                <BarChart
                    data={data}
                    layout="vertical"
                    margin={{ top: 0, right: 40, left: 24, bottom: 0 }}
                >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                    <XAxis
                        type="number"
                        tick={{ fill: "#475569", fontSize: 9 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: any) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`}
                    />
                    <YAxis
                        type="category"
                        dataKey="coin"
                        tick={{ fill: "#94a3b8", fontSize: 11, fontWeight: "bold" }}
                        tickLine={false}
                        axisLine={false}
                        width={36}
                    />
                    <Tooltip
                        cursor={{ fill: "#1e293b" }}
                        content={({ active, payload, label }: any) => {
                            if (!active || !payload?.length) return null;
                            const val = payload[0].value as number;
                            return (
                                <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs shadow-xl">
                                    <p className="text-slate-400 font-bold mb-1">{label}</p>
                                    <p style={{ color: val >= 0 ? "#4ade80" : "#f87171" }}>
                                        {val >= 0 ? "+" : ""}{val.toFixed(2)}% vs promedio
                                    </p>
                                </div>
                            );
                        }}
                    />
                    <ReferenceLine x={0} stroke="#475569" strokeDasharray="3 3" />
                    <Bar dataKey="Diferencia %" radius={[0, 4, 4, 0]} maxBarSize={22}>
                        {data.map((d) => (
                            <Cell
                                key={d.coin}
                                fill={d["Diferencia %"] >= 0 ? "#4ade80" : "#f87171"}
                            />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </ChartCard>
    );
};

// ────────────────────────────────────────────────────────────────────
//  5. LÍNEA DE TIEMPO – Capital invertido acumulado vs valor
// ────────────────────────────────────────────────────────────────────
const InvestmentTimeline: React.FC<{ items: ProcessedInvestment[] }> = ({ items }) => {
    const data = useMemo(() => {
        // Sort by date ascending
        const sorted = [...items].sort((a, b) => a.date - b.date);

        // Accumulate both invested and current value
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
                "Invertido": Math.round(cumInvested),
                "Valor Actual": Math.round(cumValue),
            };
        });
    }, [items]);

    // Custom dot that draws coin label above each point
    const CoinDot = (props: any) => {
        const { cx, cy, payload } = props;
        return (
            <g>
                <circle cx={cx} cy={cy} r={3} fill="#60a5fa" />
                <text
                    x={cx}
                    y={cy - 8}
                    textAnchor="middle"
                    fontSize={7}
                    fontWeight="bold"
                    fill={coinColor(payload.coin)}
                >
                    {payload.coin}
                </text>
            </g>
        );
    };

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
            subtitle="Capital invertido acumulado (azul) vs valor de mercado acumulado (amarillo) — la brecha es tu PNL"
        >
            <ResponsiveContainer width="100%" height={220}>
                <LineChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
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
                                        {entry?.coin} · {label}
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
                    <Line
                        type="monotone"
                        dataKey="Invertido"
                        stroke="#60a5fa"
                        strokeWidth={2}
                        dot={<CoinDot />}
                    />
                    <Line
                        type="monotone"
                        dataKey="Valor Actual"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        dot={{ r: 3, fill: "#f59e0b" }}
                        strokeDasharray="4 2"
                    />
                </LineChart>
            </ResponsiveContainer>
        </ChartCard>
    );
};

// ────────────────────────────────────────────────────────────────────
//  EXPORT: AnalyticsSection
// ────────────────────────────────────────────────────────────────────
interface AnalyticsSectionProps {
    aggregated: AggregatedAsset[];
    items: ProcessedInvestment[];
    loans: ProcessedLoan[];
    totalValue: number;
}

const AnalyticsSection: React.FC<AnalyticsSectionProps> = ({
    aggregated,
    items,
    loans,
    totalValue,
}) => {
    if (aggregated.length === 0) return null;

    return (
        <div className="mb-10">
            <h2 className="text-xs font-bold text-slate-500 mb-4 uppercase tracking-widest flex items-center gap-2 border-b border-slate-800 pb-2">
                <BarChart2 className="w-4 h-4 text-yellow-400" /> Análisis Visual
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <PortfolioDonut aggregated={aggregated} totalValue={totalValue} />
                <PnlBarChart aggregated={aggregated} />
                <PriceCompareChart aggregated={aggregated} />
                <LtvGauges loans={loans} />
                <div className="md:col-span-2">
                    <InvestmentTimeline items={items} />
                </div>
            </div>
        </div>
    );
};

export default AnalyticsSection;
