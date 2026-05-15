import React, { useMemo } from "react";
import { TrendingDown, TrendingUp, Archive, Pencil, Trash2, Brain, Bell, LineChart } from "lucide-react";
import type { SaleRecord } from "../lib/constants";
import { getCoinStyle, getCoinTextColor } from "../lib/constants";
import { fmtUSD, fmtPrice, fmt } from "../lib/format";
import type { PriceDirection } from "../hooks/usePrices";

interface SalesHistoryTableProps {
    sales: SaleRecord[];
    loading: boolean;
    prices: Record<string, number>;
    onEdit: (sale: SaleRecord) => void;
    onDelete: (id: string) => void;
    onBuyEvaluate?: (sale: SaleRecord) => void;
    onCloseVenta?: (sale: SaleRecord) => void;
    onMarcoAnalysis?: (sale: SaleRecord) => void;
    onAlert?: (sale: SaleRecord) => void;
    activeAlertIds?: string[];
    priceDirections?: Record<string, PriceDirection>;
    onViewChart?: (sale: SaleRecord) => void;
}

function fmtDate(ts: number): string {
    if (!ts) return "—";
    return new Date(ts).toLocaleDateString("es", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

function priceColor(dir?: PriceDirection): string {
    if (dir === "up") return "text-green-400";
    if (dir === "down") return "text-red-400";
    return "text-yellow-300";
}

const SalesHistoryTable: React.FC<SalesHistoryTableProps> = React.memo(
    ({ sales, loading, prices, onEdit, onDelete, onBuyEvaluate, onCloseVenta, onMarcoAnalysis, onAlert, activeAlertIds, priceDirections, onViewChart }) => {
        const sorted = useMemo(() => {
            return [...sales].sort((a, b) => {
                const cpA = prices[a.coin] || 0;
                const cpB = prices[b.coin] || 0;
                const roiA = cpA > 0 && a.usdtReceived > 0 ? (a.usdtReceived - a.quantity * cpA) / a.usdtReceived * 100 : -Infinity;
                const roiB = cpB > 0 && b.usdtReceived > 0 ? (b.usdtReceived - b.quantity * cpB) / b.usdtReceived * 100 : -Infinity;
                return roiB - roiA;
            });
        }, [sales, prices]);

        const { totalUsdtReceived, totalRecompraPnl } = useMemo(() => {
            let usdt = 0;
            let pnl = 0;
            for (const s of sorted) {
                usdt += s.usdtReceived;
                const cp = prices[s.coin] || 0;
                if (cp > 0) pnl += s.usdtReceived - s.quantity * cp;
            }
            return { totalUsdtReceived: usdt, totalRecompraPnl: pnl };
        }, [sorted, prices]);

        return (
            <div className="mb-6 sm:mb-10">
                <div className="text-xs font-bold text-slate-500 mb-4 uppercase tracking-widest flex items-center gap-2 border-b border-slate-800 pb-2">
                    <TrendingDown className="w-4 h-4 text-emerald-400" />
                    Ventas Realizadas ({loading ? "…" : sales.length})
                </div>

                <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-xl">
                    {loading || sorted.length === 0 ? (
                        <p className="text-slate-500 text-xs text-center py-8 uppercase tracking-widest">
                            {loading ? "Cargando…" : "Sin ventas registradas"}
                        </p>
                    ) : (
                        <>
                            {/* Mobile */}
                            <div className="md:hidden divide-y-2 divide-slate-600">
                                {sorted.map((sale) => {
                                    const cp = prices[sale.coin] || 0;
                                    const recompraPnl = cp > 0 ? sale.usdtReceived - sale.quantity * cp : null;
                                    return (
                                        <div key={sale.id} className="p-3 hover:bg-slate-700/10 transition-colors">
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className={`w-8 h-8 border rounded-full flex items-center justify-center font-bold text-[10px] shadow-sm flex-shrink-0 ${getCoinStyle(sale.coin)}`}>
                                                    {sale.coin}
                                                </div>
                                                <div className="flex-1">
                                                    <span className={`font-bold text-sm ${getCoinTextColor(sale.coin)}`}>{sale.coin}</span>
                                                    <span className="text-[10px] text-slate-500 ml-2">{fmtDate(sale.date)}</span>
                                                </div>
                                                <span className="font-bold text-sm text-white mr-2">
                                                    {fmtUSD(sale.usdtReceived)}
                                                </span>
                                                {onMarcoAnalysis && (
                                                    <button
                                                        onClick={() => onMarcoAnalysis(sale)}
                                                        title="Analizar con Marco"
                                                        className="p-1.5 rounded-lg text-slate-400 hover:text-violet-400 hover:bg-slate-700 transition-colors"
                                                    >
                                                        <Brain className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                                {onBuyEvaluate && (
                                                    <button
                                                        onClick={() => onBuyEvaluate(sale)}
                                                        title="Evaluar Compra"
                                                        className="p-1.5 rounded-lg text-slate-400 hover:text-green-400 hover:bg-slate-700 transition-colors"
                                                    >
                                                        <TrendingUp className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                                {onCloseVenta && (
                                                    <button
                                                        onClick={() => onCloseVenta(sale)}
                                                        title="Cerrar Posición"
                                                        className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-slate-700 transition-colors"
                                                    >
                                                        <Archive className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                                {onAlert && (
                                                    <button
                                                        onClick={() => onAlert(sale)}
                                                        title="Configurar Alerta"
                                                        className={`p-1.5 rounded-lg hover:bg-slate-700 transition-colors ${activeAlertIds?.includes(`sale_${sale.id}`) ? "text-yellow-400 hover:text-yellow-300" : "text-slate-400 hover:text-yellow-400"}`}
                                                    >
                                                        <Bell className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                                {onViewChart && (
                                                    <button
                                                        onClick={() => onViewChart(sale)}
                                                        title="Ver Gráfico"
                                                        className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-slate-700 transition-colors"
                                                    >
                                                        <LineChart className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => onEdit(sale)}
                                                    className="p-1.5 rounded-lg text-slate-400 hover:text-yellow-400 hover:bg-slate-700 transition-colors"
                                                >
                                                    <Pencil className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => onDelete(sale.id)}
                                                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-700 transition-colors"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                            <div className="grid grid-cols-2 gap-1.5 text-xs">
                                                <div className="bg-slate-900/40 p-1.5 rounded-lg border border-slate-700/50 text-center">
                                                    <p className="text-[9px] text-slate-500 uppercase font-bold mb-0.5">Cantidad</p>
                                                    <p className="text-white font-mono">{fmt(sale.quantity)}</p>
                                                </div>
                                                <div className="bg-slate-900/40 p-1.5 rounded-lg border border-slate-700/50 text-center">
                                                    <p className="text-[9px] text-slate-500 uppercase font-bold mb-0.5">USDT Recibido</p>
                                                    <p className="text-slate-300 font-mono font-bold">{fmtUSD(sale.usdtReceived)}</p>
                                                </div>
                                                <div
                                                    className={`bg-slate-900/40 p-1.5 rounded-lg border border-slate-700/50 text-center ${onViewChart && cp > 0 ? 'cursor-pointer hover:border-slate-500' : ''}`}
                                                    onClick={() => onViewChart && cp > 0 && onViewChart(sale)}
                                                    title={onViewChart && cp > 0 ? "Ver gráfico" : undefined}
                                                >
                                                    <p className="text-[9px] text-slate-500 uppercase font-bold mb-0.5">Precio Actual</p>
                                                    <p className={`font-mono ${cp > 0 ? priceColor(priceDirections?.[sale.coin]) : "text-slate-500"}`}>{cp > 0 ? fmtPrice(cp) : "—"}</p>
                                                </div>
                                                <div className="bg-slate-900/40 p-1.5 rounded-lg border border-slate-700/50 text-center">
                                                    <p className="text-[9px] text-slate-500 uppercase font-bold mb-0.5">Si Recompras</p>
                                                    {recompraPnl !== null ? (
                                                        <>
                                                            <p className={`font-mono font-bold ${recompraPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                                                                {recompraPnl >= 0 ? "+" : ""}{fmtUSD(recompraPnl)}
                                                            </p>
                                                            <p className={`text-[9px] font-mono ${recompraPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                                                                {recompraPnl >= 0 ? "+" : ""}{((recompraPnl / sale.usdtReceived) * 100).toFixed(2)}%
                                                            </p>
                                                        </>
                                                    ) : (
                                                        <p className="text-slate-500 font-mono">—</p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Desktop */}
                            <table className="hidden md:table w-full text-left text-sm">
                                <thead className="bg-slate-950 text-slate-500 uppercase text-[10px] tracking-widest">
                                    <tr>
                                        <th className="p-5">Activo</th>
                                        <th className="p-5 text-right">Cantidad</th>
                                        <th className="p-5 text-right">USDT Recibido</th>
                                        <th className="p-5 text-right">Precio Venta</th>
                                        <th className="p-5 text-right">Precio Actual</th>
                                        <th className="p-5 text-right">Si Recompras Ahora</th>
                                        <th className="p-5 text-center">Fecha</th>
                                        <th className="p-5" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-700">
                                    {sorted.map((sale) => {
                                        const cp = prices[sale.coin] || 0;
                                        const recompraPnl = cp > 0 ? sale.usdtReceived - sale.quantity * cp : null;
                                        return (
                                            <tr key={sale.id} className="hover:bg-slate-700/20 transition-colors font-sans">
                                                <td className="p-5 font-bold">
                                                    <span className={`border px-3 py-1.5 rounded-xl text-xs font-black tracking-tighter ${getCoinStyle(sale.coin)}`}>
                                                        {sale.coin}
                                                    </span>
                                                </td>
                                                <td className="p-5 text-right text-slate-300 font-mono">{fmt(sale.quantity)}</td>
                                                <td className="p-5 text-right text-slate-300 font-mono font-bold">{fmtUSD(sale.usdtReceived)}</td>
                                                <td className="p-5 text-right text-sky-400 font-mono">{fmtPrice(sale.sellPrice)}</td>
                                                <td
                                                    className={`p-5 text-right font-mono ${cp > 0 ? priceColor(priceDirections?.[sale.coin]) : "text-slate-500"} ${onViewChart && cp > 0 ? 'cursor-pointer hover:underline' : ''}`}
                                                    onClick={() => onViewChart && cp > 0 && onViewChart(sale)}
                                                    title={onViewChart && cp > 0 ? "Ver gráfico" : undefined}
                                                >
                                                    {cp > 0 ? fmtPrice(cp) : "—"}
                                                </td>
                                                <td className="p-5 text-right">
                                                    {recompraPnl !== null ? (
                                                        <div className="flex flex-col items-end">
                                                            <span className={`font-bold ${recompraPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                                                                {recompraPnl >= 0 ? "+" : ""}{fmtUSD(recompraPnl)}
                                                            </span>
                                                            <span className={`text-[11px] font-mono ${recompraPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                                                                {recompraPnl >= 0 ? "+" : ""}{((recompraPnl / sale.usdtReceived) * 100).toFixed(2)}%
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-slate-500">—</span>
                                                    )}
                                                </td>
                                                <td className="p-5 text-center text-slate-400 text-xs">{fmtDate(sale.date)}</td>
                                                <td className="p-5">
                                                    <div className="flex items-center gap-2 justify-end">
                                                        {onMarcoAnalysis && (
                                                            <button
                                                                onClick={() => onMarcoAnalysis(sale)}
                                                                title="Analizar con Marco"
                                                                className="p-1.5 rounded-lg text-slate-400 hover:text-violet-400 hover:bg-slate-700 transition-colors"
                                                            >
                                                                <Brain className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                        {onBuyEvaluate && (
                                                            <button
                                                                onClick={() => onBuyEvaluate(sale)}
                                                                title="Evaluar Compra"
                                                                className="p-1.5 rounded-lg text-slate-400 hover:text-green-400 hover:bg-slate-700 transition-colors"
                                                            >
                                                                <TrendingUp className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                        {onCloseVenta && (
                                                            <button
                                                                onClick={() => onCloseVenta(sale)}
                                                                title="Cerrar Posición"
                                                                className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-slate-700 transition-colors"
                                                            >
                                                                <Archive className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                        {onAlert && (
                                                            <button
                                                                onClick={() => onAlert(sale)}
                                                                title="Configurar Alerta"
                                                                className={`p-1.5 rounded-lg hover:bg-slate-700 transition-colors ${activeAlertIds?.includes(`sale_${sale.id}`) ? "text-yellow-400 hover:text-yellow-300" : "text-slate-400 hover:text-yellow-400"}`}
                                                            >
                                                                <Bell className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                        {onViewChart && (
                                                            <button
                                                                onClick={() => onViewChart(sale)}
                                                                title="Ver Gráfico"
                                                                className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-slate-700 transition-colors"
                                                            >
                                                                <LineChart className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => onEdit(sale)}
                                                            className="p-1.5 rounded-lg text-slate-400 hover:text-yellow-400 hover:bg-slate-700 transition-colors"
                                                        >
                                                            <Pencil className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            onClick={() => onDelete(sale.id)}
                                                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-700 transition-colors"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-slate-900/60 border-t-2 border-slate-600">
                                        <td className="p-5 text-[10px] uppercase text-slate-500 font-black tracking-widest" colSpan={3}>
                                            Total ({sorted.length} venta{sorted.length !== 1 ? "s" : ""})
                                        </td>
                                        <td className="p-5 text-right text-emerald-400 font-mono font-bold">
                                            {fmtUSD(totalUsdtReceived)}
                                        </td>
                                        <td />
                                        <td className="p-5 text-right">
                                            <div className="flex flex-col items-end">
                                                <span className={`font-bold text-xs ${totalRecompraPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                                                    {totalRecompraPnl >= 0 ? "+" : ""}{fmtUSD(totalRecompraPnl)}
                                                </span>
                                                {totalUsdtReceived > 0 && (
                                                    <span className={`text-[11px] font-mono ${totalRecompraPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                                                        {totalRecompraPnl >= 0 ? "+" : ""}{((totalRecompraPnl / totalUsdtReceived) * 100).toFixed(2)}%
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td colSpan={2} />
                                    </tr>
                                </tfoot>
                            </table>
                        </>
                    )}
                </div>
            </div>
        );
    }
);

SalesHistoryTable.displayName = "SalesHistoryTable";

export default SalesHistoryTable;
