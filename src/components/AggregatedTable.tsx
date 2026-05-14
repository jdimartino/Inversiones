import React, { useState } from "react";
import { Calculator, ChevronDown, ChevronRight, TrendingUp, TrendingDown } from "lucide-react";
import { getCoinStyle, getCoinTextColor, AggregatedAsset, ProcessedInvestment, SaleRecord, ClosedTrade } from "../lib/constants";
import { fmtUSD, fmtPrice } from "../lib/format";
import type { PriceDirection } from "../hooks/usePrices";

interface AggregatedTableProps {
    items: AggregatedAsset[];
    priceDirections?: Record<string, PriceDirection>;
    openPositions?: ProcessedInvestment[];
    openSales?: SaleRecord[];
    closedTrades?: ClosedTrade[];
}

function priceColor(dir?: PriceDirection): string {
    if (dir === "up") return "text-green-400";
    if (dir === "down") return "text-red-400";
    return "text-yellow-300";
}

function fmtDate(ts: number): string {
    if (!ts) return "—";
    return new Date(ts).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
}

function StatBox({ label, value, sub, valueClass = "text-slate-200" }: { label: string; value: string; sub?: string; valueClass?: string }) {
    return (
        <div className="bg-slate-900/60 rounded-xl p-2.5 border border-slate-700/50 text-center">
            <p className="text-[9px] uppercase text-slate-500 font-bold tracking-wider mb-1">{label}</p>
            <p className={`font-mono font-bold text-xs ${valueClass}`}>{value}</p>
            {sub && <p className="text-[10px] text-slate-500 font-mono mt-0.5">{sub}</p>}
        </div>
    );
}

function AssetDetail({ asset, positions, sales, closed }: {
    asset: AggregatedAsset;
    positions: ProcessedInvestment[];
    sales: SaleRecord[];
    closed: ClosedTrade[];
}) {
    const roiPct = asset.totalInvested > 0 ? (asset.pnl / asset.totalInvested) * 100 : 0;
    const isProfit = asset.pnl >= 0;

    return (
        <div className="p-4 space-y-5 bg-slate-900/40">
            {/* Resumen */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                <StatBox label="Total Invertido" value={fmtUSD(asset.totalInvested)} />
                <StatBox label="Valor Actual" value={fmtUSD(asset.currentValue)} />
                <StatBox label="Cantidad" value={asset.totalQty.toFixed(6)} valueClass="text-slate-300" />
                <StatBox label="P. Promedio" value={fmtPrice(asset.avgBuyPrice)} valueClass="text-blue-400" />
                <StatBox label="P. Actual" value={fmtPrice(asset.currentPrice)} valueClass={isProfit ? "text-green-400" : "text-red-400"} />
                <StatBox
                    label="PNL / ROI"
                    value={`${isProfit ? "+" : ""}${fmtUSD(asset.pnl)}`}
                    sub={`${roiPct >= 0 ? "+" : ""}${roiPct.toFixed(2)}%`}
                    valueClass={isProfit ? "text-green-400" : "text-red-400"}
                />
            </div>

            {/* Posiciones abiertas */}
            {positions.length > 0 && (
                <div>
                    <p className="text-[9px] uppercase font-bold text-slate-500 tracking-widest mb-2 flex items-center gap-1.5">
                        <TrendingUp className="w-3 h-3 text-sky-400" />
                        Posiciones Abiertas ({positions.length})
                    </p>
                    <div className="overflow-x-auto rounded-lg border border-slate-700/40">
                        <table className="w-full text-xs">
                            <thead className="bg-slate-950/50">
                                <tr className="text-slate-500 uppercase text-[9px] tracking-widest">
                                    <th className="px-3 py-2 text-left font-bold">Fecha</th>
                                    <th className="px-3 py-2 text-right font-bold text-sky-400">P. Compra</th>
                                    <th className="px-3 py-2 text-right font-bold">Cantidad</th>
                                    <th className="px-3 py-2 text-right font-bold">Invertido</th>
                                    <th className="px-3 py-2 text-right font-bold">PNL</th>
                                    <th className="px-3 py-2 text-right font-bold">ROI</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/30">
                                {positions.sort((a, b) => b.date - a.date).map((pos) => (
                                    <tr key={pos.id} className="hover:bg-slate-700/20 transition-colors">
                                        <td className="px-3 py-2 text-slate-500">{fmtDate(pos.date)}</td>
                                        <td className="px-3 py-2 text-right text-sky-400 font-mono font-bold">{fmtPrice(pos.buyPrice)}</td>
                                        <td className="px-3 py-2 text-right text-slate-400 font-mono">{pos.quantity.toFixed(6)}</td>
                                        <td className="px-3 py-2 text-right text-slate-400 font-mono">{fmtUSD(pos.invested)}</td>
                                        <td className={`px-3 py-2 text-right font-mono font-bold ${pos.profit >= 0 ? "text-green-400" : "text-red-400"}`}>
                                            {pos.profit >= 0 ? "+" : ""}{fmtUSD(pos.profit)}
                                        </td>
                                        <td className={`px-3 py-2 text-right font-mono font-bold ${pos.roi >= 0 ? "text-green-600" : "text-red-600"}`}>
                                            {pos.roi >= 0 ? "+" : ""}{pos.roi.toFixed(2)}%
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Ventas abiertas */}
            {sales.length > 0 && (
                <div>
                    <p className="text-[9px] uppercase font-bold text-slate-500 tracking-widest mb-2 flex items-center gap-1.5">
                        <TrendingDown className="w-3 h-3 text-emerald-400" />
                        Ventas Abiertas ({sales.length})
                    </p>
                    <div className="overflow-x-auto rounded-lg border border-slate-700/40">
                        <table className="w-full text-xs">
                            <thead className="bg-slate-950/50">
                                <tr className="text-slate-500 uppercase text-[9px] tracking-widest">
                                    <th className="px-3 py-2 text-left font-bold">Fecha</th>
                                    <th className="px-3 py-2 text-right font-bold text-emerald-400">P. Venta</th>
                                    <th className="px-3 py-2 text-right font-bold">Cantidad</th>
                                    <th className="px-3 py-2 text-right font-bold">Recibido</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/30">
                                {sales.map((sale) => (
                                    <tr key={sale.id} className="hover:bg-slate-700/20 transition-colors">
                                        <td className="px-3 py-2 text-slate-500">{fmtDate(sale.date)}</td>
                                        <td className="px-3 py-2 text-right text-emerald-400 font-mono font-bold">{fmtPrice(sale.sellPrice)}</td>
                                        <td className="px-3 py-2 text-right text-slate-400 font-mono">{sale.quantity.toFixed(6)}</td>
                                        <td className="px-3 py-2 text-right text-slate-400 font-mono">{fmtUSD(sale.usdtReceived)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Operaciones cerradas */}
            {closed.length > 0 && (
                <div>
                    <p className="text-[9px] uppercase font-bold text-slate-500 tracking-widest mb-2 flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-violet-500/40 border border-violet-500 inline-block flex-shrink-0" />
                        Operaciones Cerradas ({closed.length})
                    </p>
                    <div className="overflow-x-auto rounded-lg border border-slate-700/40">
                        <table className="w-full text-xs">
                            <thead className="bg-slate-950/50">
                                <tr className="text-slate-500 uppercase text-[9px] tracking-widest">
                                    <th className="px-3 py-2 text-left font-bold">Cierre</th>
                                    <th className="px-3 py-2 text-right font-bold text-sky-400">P. Compra</th>
                                    <th className="px-3 py-2 text-right font-bold text-emerald-400">P. Venta</th>
                                    <th className="px-3 py-2 text-right font-bold">Invertido</th>
                                    <th className="px-3 py-2 text-right font-bold">PNL</th>
                                    <th className="px-3 py-2 text-right font-bold">%</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/30">
                                {[...closed].sort((a, b) => b.sellDate - a.sellDate).map((trade) => (
                                    <tr key={trade.id} className="hover:bg-slate-700/20 transition-colors">
                                        <td className="px-3 py-2 text-slate-500">{fmtDate(trade.sellDate)}</td>
                                        <td className="px-3 py-2 text-right text-sky-400 font-mono">{fmtPrice(trade.buyPrice)}</td>
                                        <td className="px-3 py-2 text-right text-emerald-400 font-mono">{fmtPrice(trade.sellPrice)}</td>
                                        <td className="px-3 py-2 text-right text-slate-400 font-mono">{fmtUSD(trade.invested)}</td>
                                        <td className={`px-3 py-2 text-right font-mono font-bold ${trade.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                                            {trade.pnl >= 0 ? "+" : ""}{fmtUSD(trade.pnl)}
                                        </td>
                                        <td className={`px-3 py-2 text-right font-mono font-bold text-[10px] ${trade.pnl >= 0 ? "text-green-600" : "text-red-600"}`}>
                                            {trade.pnlPercent >= 0 ? "+" : ""}{trade.pnlPercent.toFixed(2)}%
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

const AggregatedTable: React.FC<AggregatedTableProps> = React.memo(
    ({ items, priceDirections = {}, openPositions = [], openSales = [], closedTrades = [] }) => {
        const [expandedCoin, setExpandedCoin] = useState<string | null>(null);

        if (items.length === 0) return null;

        const toggle = (coin: string) => setExpandedCoin((prev) => (prev === coin ? null : coin));

        return (
            <div className="mb-6 sm:mb-10">
                <h2 className="text-xs font-bold text-slate-500 mb-4 uppercase tracking-widest flex items-center gap-2 border-b border-slate-800 pb-2">
                    <Calculator className="w-4 h-4 text-blue-400" /> Promedios y PNL Consolidado
                </h2>
                <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-xl">

                    {/* Mobile */}
                    <div className="md:hidden divide-y-2 divide-slate-600">
                        {items.map((asset) => {
                            const isExpanded = expandedCoin === asset.coin;
                            const positions = openPositions.filter((p) => p.coin === asset.coin);
                            const sales = openSales.filter((s) => s.coin === asset.coin);
                            const closed = closedTrades.filter((t) => t.coin === asset.coin);
                            return (
                                <div key={asset.coin}>
                                    <div
                                        onClick={() => toggle(asset.coin)}
                                        className="p-3 cursor-pointer hover:bg-slate-700/30 active:bg-slate-700/50 transition-colors"
                                    >
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className={`w-8 h-8 border rounded-full flex items-center justify-center font-bold text-[10px] shadow-sm flex-shrink-0 ${getCoinStyle(asset.coin)}`}>
                                                {asset.coin}
                                            </div>
                                            <div className="flex-1 text-center">
                                                <p className={`font-bold text-sm ${getCoinTextColor(asset.coin)}`}>{asset.coin}</p>
                                                <p className={`text-[13px] font-mono font-bold tracking-tight ${getCoinTextColor(asset.coin)}`}>
                                                    {asset.totalQty.toFixed(4)} u.
                                                </p>
                                            </div>
                                            {isExpanded
                                                ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                                                : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                                            }
                                        </div>
                                        <div className="grid grid-cols-2 gap-1.5 text-sm">
                                            <div className="bg-slate-900/40 p-1.5 rounded-lg border border-slate-700/50 text-center">
                                                <p className="text-[9px] uppercase text-slate-500 font-bold mb-0.5 tracking-wider">Precio Promedio</p>
                                                <p className="text-blue-400 font-mono text-[11px] font-bold">{fmtPrice(asset.avgBuyPrice)}</p>
                                            </div>
                                            <div className="bg-slate-900/40 p-1.5 rounded-lg border border-slate-700/50 text-center">
                                                <p className="text-[9px] uppercase text-slate-500 font-bold mb-0.5 tracking-wider">Precio Actual</p>
                                                <p className={`font-mono text-[11px] font-bold ${priceColor(priceDirections[asset.coin])}`}>{fmtPrice(asset.currentPrice)}</p>
                                            </div>
                                            <div className="col-span-2 bg-slate-900/40 p-2 rounded-lg border border-slate-700/50 flex flex-col items-center text-center">
                                                <p className="text-[9px] uppercase text-slate-500 font-bold tracking-wider mb-0.5">PNL Neto Promedio</p>
                                                <div className={`font-bold text-sm ${asset.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                                                    {asset.pnl >= 0 ? "+" : ""}{fmtUSD(asset.pnl)}
                                                </div>
                                                <div className={`text-[11px] font-bold tracking-tight ${asset.pnl >= 0 ? "text-green-600" : "text-red-600"}`}>
                                                    {asset.priceDiffPercent >= 0 ? "+" : ""}{asset.priceDiffPercent.toFixed(2)}% vs Prom.
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    {isExpanded && (
                                        <div className="border-t border-slate-700/60">
                                            <AssetDetail asset={asset} positions={positions} sales={sales} closed={closed} />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Desktop */}
                    <table className="hidden md:table w-full text-left text-sm">
                        <thead className="bg-slate-950 text-slate-500 uppercase text-[10px] tracking-widest">
                            <tr>
                                <th className="p-5 w-6"></th>
                                <th className="p-5">Moneda</th>
                                <th className="p-5 text-right">Cantidad Total</th>
                                <th className="p-5 text-right text-blue-400 font-black">Precio Promedio</th>
                                <th className="p-5 text-right">Precio Actual</th>
                                <th className="p-5 text-right">PNL Neto Promedio</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700">
                            {items.map((asset) => {
                                const isExpanded = expandedCoin === asset.coin;
                                const positions = openPositions.filter((p) => p.coin === asset.coin);
                                const sales = openSales.filter((s) => s.coin === asset.coin);
                                const closed = closedTrades.filter((t) => t.coin === asset.coin);
                                return (
                                    <React.Fragment key={asset.coin}>
                                        <tr
                                            onClick={() => toggle(asset.coin)}
                                            className="cursor-pointer hover:bg-slate-700/30 active:bg-slate-700/50 transition-colors"
                                        >
                                            <td className="pl-4 pr-0 py-5 text-slate-500">
                                                {isExpanded
                                                    ? <ChevronDown className="w-3.5 h-3.5" />
                                                    : <ChevronRight className="w-3.5 h-3.5" />
                                                }
                                            </td>
                                            <td className="p-5 font-bold">
                                                <span className={`border px-3 py-1.5 rounded-xl text-xs font-black tracking-tighter ${getCoinStyle(asset.coin)}`}>
                                                    {asset.coin}
                                                </span>
                                            </td>
                                            <td className="p-5 text-right text-slate-400 font-mono text-xs font-bold">
                                                {asset.totalQty.toFixed(4)}
                                            </td>
                                            <td className="p-5 text-right text-blue-400 font-mono font-bold">
                                                {fmtPrice(asset.avgBuyPrice)}
                                            </td>
                                            <td className={`p-5 text-right font-mono font-bold ${priceColor(priceDirections[asset.coin])}`}>
                                                {fmtPrice(asset.currentPrice)}
                                            </td>
                                            <td className="p-5 text-right">
                                                <div className={`font-bold ${asset.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                                                    {asset.pnl >= 0 ? "+" : ""}{fmtUSD(asset.pnl)}
                                                </div>
                                                <div className={`text-[10px] font-bold ${asset.pnl >= 0 ? "text-green-600" : "text-red-600"}`}>
                                                    {asset.priceDiffPercent >= 0 ? "+" : ""}{asset.priceDiffPercent.toFixed(2)}% vs Prom.
                                                </div>
                                            </td>
                                        </tr>
                                        {isExpanded && (
                                            <tr>
                                                <td colSpan={6} className="p-0 border-t border-slate-700/60">
                                                    <AssetDetail asset={asset} positions={positions} sales={sales} closed={closed} />
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }
);

AggregatedTable.displayName = "AggregatedTable";

export default AggregatedTable;
