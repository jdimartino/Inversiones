import React, { useState, useMemo } from "react";
import { History, ChevronDown, ChevronRight, Brain } from "lucide-react";
import type { ClosedTrade } from "../lib/constants";
import { getCoinStyle, getCoinTextColor } from "../lib/constants";
import { fmtUSD, fmtPrice } from "../lib/format";

interface ClosedTradesTableProps {
    trades: ClosedTrade[];
    loading: boolean;
    onMarcoAnalysis?: (trade: ClosedTrade) => void;
}

function fmtDate(ts: number): string {
    if (!ts) return "—";
    return new Date(ts).toLocaleDateString("es", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

function durationDays(buyDate: number, sellDate: number): string {
    const days = Math.round((sellDate - buyDate) / (1000 * 60 * 60 * 24));
    return `${days} día${days !== 1 ? "s" : ""}`;
}

const ClosedTradesTable: React.FC<ClosedTradesTableProps> = React.memo(
    ({ trades, loading, onMarcoAnalysis }) => {
        const [open, setOpen] = useState(false);

        const sorted = useMemo(
            () => [...trades].sort((a, b) => b.pnlPercent - a.pnlPercent),
            [trades]
        );

        const totals = useMemo(() => {
            let invested = 0;
            let soldValue = 0;
            let pnl = 0;
            for (const t of sorted) {
                invested += t.invested;
                soldValue += t.soldValue;
                pnl += t.pnl;
            }
            return { invested, soldValue, pnl };
        }, [sorted]);

        return (
            <div className="mb-6 sm:mb-10">
                <button
                    onClick={() => setOpen((v) => !v)}
                    className="w-full text-left text-xs font-bold text-slate-500 mb-4 uppercase tracking-widest flex items-center gap-2 border-b border-slate-800 pb-2 hover:text-slate-300 transition-colors"
                >
                    {open ? (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                    ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                    )}
                    <History className="w-4 h-4 text-violet-400" />
                    Historial de Operaciones Cerradas ({loading ? "…" : trades.length})
                </button>

                {open && (
                    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-xl">
                        {sorted.length === 0 ? (
                            <p className="text-slate-500 text-xs text-center py-8 uppercase tracking-widest">
                                Sin operaciones cerradas
                            </p>
                        ) : (
                            <>
                                {/* Mobile */}
                                <div className="md:hidden divide-y-2 divide-slate-600">
                                    {sorted.map((trade) => (
                                        <div key={trade.id} className="p-3 hover:bg-slate-700/10 transition-colors">
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className={`w-8 h-8 border rounded-full flex items-center justify-center font-bold text-[10px] shadow-sm flex-shrink-0 ${getCoinStyle(trade.coin)}`}>
                                                    {trade.coin}
                                                </div>
                                                <div className="flex-1">
                                                    <span className={`font-bold text-sm ${getCoinTextColor(trade.coin)}`}>{trade.coin}</span>
                                                    <span className="text-[10px] text-slate-500 ml-2">{fmtDate(trade.sellDate)}</span>
                                                </div>
                                                <span className={`font-bold text-sm ${trade.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                                                    {trade.pnl >= 0 ? "+" : ""}{fmtUSD(trade.pnl)}
                                                </span>
                                                {onMarcoAnalysis && (
                                                    <button
                                                        onClick={() => onMarcoAnalysis(trade)}
                                                        title="Analizar con Marco"
                                                        className="p-1.5 rounded-lg text-slate-400 hover:text-violet-400 hover:bg-slate-700 transition-colors"
                                                    >
                                                        <Brain className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                            <div className="grid grid-cols-2 gap-1.5 text-xs">
                                                <div className="bg-slate-900/40 p-1.5 rounded-lg border border-slate-700/50 text-center">
                                                    <p className="text-[9px] text-slate-500 uppercase font-bold mb-0.5">Compra</p>
                                                    <p className="text-sky-400 font-mono">{fmtPrice(trade.buyPrice)}</p>
                                                </div>
                                                <div className="bg-slate-900/40 p-1.5 rounded-lg border border-slate-700/50 text-center">
                                                    <p className="text-[9px] text-slate-500 uppercase font-bold mb-0.5">Venta</p>
                                                    <p className="text-emerald-300 font-mono">{fmtPrice(trade.sellPrice)}</p>
                                                </div>
                                                <div className="bg-slate-900/40 p-1.5 rounded-lg border border-slate-700/50 text-center">
                                                    <p className="text-[9px] text-slate-500 uppercase font-bold mb-0.5">Rendimiento</p>
                                                    <p className={`font-mono font-bold ${trade.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                                                        {trade.pnlPercent >= 0 ? "+" : ""}{trade.pnlPercent.toFixed(2)}%
                                                    </p>
                                                </div>
                                                <div className="bg-slate-900/40 p-1.5 rounded-lg border border-slate-700/50 text-center">
                                                    <p className="text-[9px] text-slate-500 uppercase font-bold mb-0.5">Duración</p>
                                                    <p className="text-slate-400 font-mono">{durationDays(trade.buyDate, trade.sellDate)}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Desktop */}
                                <table className="hidden md:table w-full text-left text-sm">
                                    <thead className="bg-slate-950 text-slate-500 uppercase text-[10px] tracking-widest">
                                        <tr>
                                            <th className="p-5">Activo</th>
                                            <th className="p-5 text-right">Compra</th>
                                            <th className="p-5 text-right">Venta</th>
                                            <th className="p-5 text-right">Invertido</th>
                                            <th className="p-5 text-right">P&L</th>
                                            <th className="p-5 text-right">%</th>
                                            <th className="p-5 text-center">Duración</th>
                                            <th className="p-5 text-center">Fecha Cierre</th>
                                            {onMarcoAnalysis && <th className="p-5 text-center">IA</th>}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-700">
                                        {sorted.map((trade) => (
                                            <tr key={trade.id} className="hover:bg-slate-700/20 transition-colors font-sans">
                                                <td className="p-5 font-bold">
                                                    <span className={`border px-3 py-1.5 rounded-xl text-xs font-black tracking-tighter ${getCoinStyle(trade.coin)}`}>
                                                        {trade.coin}
                                                    </span>
                                                </td>
                                                <td className="p-5 text-right text-sky-400 font-mono">{fmtPrice(trade.buyPrice)}</td>
                                                <td className="p-5 text-right text-emerald-300 font-mono">{fmtPrice(trade.sellPrice)}</td>
                                                <td className="p-5 text-right text-slate-400 font-mono">{fmtUSD(trade.invested)}</td>
                                                <td className="p-5 text-right">
                                                    <span className={`font-bold ${trade.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                                                        {trade.pnl >= 0 ? "+" : ""}{fmtUSD(trade.pnl)}
                                                    </span>
                                                </td>
                                                <td className="p-5 text-right">
                                                    <span className={`font-bold text-xs ${trade.pnl >= 0 ? "text-green-600" : "text-red-600"}`}>
                                                        {trade.pnlPercent >= 0 ? "+" : ""}{trade.pnlPercent.toFixed(2)}%
                                                    </span>
                                                </td>
                                                <td className="p-5 text-center text-slate-400 text-xs">{durationDays(trade.buyDate, trade.sellDate)}</td>
                                                <td className="p-5 text-center text-slate-400 text-xs">{fmtDate(trade.sellDate)}</td>
                                                {onMarcoAnalysis && (
                                                    <td className="p-5 text-center">
                                                        <button
                                                            onClick={() => onMarcoAnalysis(trade)}
                                                            title="Analizar con Marco"
                                                            className="p-1.5 rounded-lg text-slate-400 hover:text-violet-400 hover:bg-slate-700 transition-colors"
                                                        >
                                                            <Brain className="w-4 h-4" />
                                                        </button>
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr className="bg-slate-900/60 border-t-2 border-slate-600">
                                            <td className="p-5 text-[10px] uppercase text-slate-500 font-black tracking-widest" colSpan={3}>
                                                Total ({sorted.length} op.)
                                            </td>
                                            <td className="p-5 text-right text-slate-400 font-mono font-bold">{fmtUSD(totals.invested)}</td>
                                            <td className="p-5 text-right">
                                                <span className={`font-bold ${totals.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                                                    {totals.pnl >= 0 ? "+" : ""}{fmtUSD(totals.pnl)}
                                                </span>
                                            </td>
                                            <td colSpan={onMarcoAnalysis ? 4 : 3} />
                                        </tr>
                                    </tfoot>
                                </table>
                            </>
                        )}
                    </div>
                )}
            </div>
        );
    }
);

ClosedTradesTable.displayName = "ClosedTradesTable";

export default ClosedTradesTable;
