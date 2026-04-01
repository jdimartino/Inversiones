import React from "react";
import { Activity, Pencil, Bell, TrendingUp } from "lucide-react";
import { getCoinStyle, getCoinTextColor, ProcessedInvestment } from "../lib/constants";
import { fmt, fmtUSD, fmtPrice } from "../lib/format";
import DeleteButton from "./DeleteButton";

interface AssetTableProps {
    items: ProcessedInvestment[];
    activeAlertIds: string[];
    onDelete: (id: string) => void;
    onEdit: (item: ProcessedInvestment) => void;
    onAlert: (item: ProcessedInvestment) => void;
    onSellEvaluate: (item: ProcessedInvestment) => void;
}

function fmtDate(ts: number): string {
    if (!ts) return "—";
    return new Date(ts).toLocaleDateString("es", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

const AssetTable: React.FC<AssetTableProps> = React.memo(
    ({ items, activeAlertIds, onDelete, onEdit, onAlert, onSellEvaluate }) => {
        if (items.length === 0) return null;

        return (
            <div className="mb-6 sm:mb-10">
                <h2 className="text-xs font-bold text-slate-500 mb-4 uppercase tracking-widest flex items-center gap-2 border-b border-slate-800 pb-2">
                    <Activity className="w-4 h-4 text-emerald-500" /> Detalle de Activos
                </h2>
                <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-xl">
                    {/* Mobile */}
                    <div className="md:hidden divide-y divide-slate-700">
                        {items.map((item) => (
                            <div key={item.id} className="p-3 relative hover:bg-slate-700/10 transition-colors">
                                {/* Action buttons top-right */}
                                <div className="absolute top-3 right-3 flex items-center gap-0.5">
                                    <button
                                        onClick={() => onSellEvaluate(item)}
                                        className="text-slate-500 hover:text-red-400 p-1 transition-colors"
                                        title="Evaluar Venta"
                                    >
                                        <TrendingUp className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        onClick={() => onAlert(item)}
                                        className={`p-1 transition-colors ${activeAlertIds.includes(item.id) ? "text-yellow-400 hover:text-yellow-300" : "text-slate-500 hover:text-yellow-400"}`}
                                        title="Configurar Alerta"
                                    >
                                        <Bell className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        onClick={() => onEdit(item)}
                                        className="text-slate-500 hover:text-yellow-400 p-1 transition-colors"
                                        title="Modificar"
                                    >
                                        <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <DeleteButton onDelete={() => onDelete(item.id)} />
                                </div>

                                <div className="flex items-center gap-2 mb-2">
                                    <div
                                        className={`w-8 h-8 border rounded-full flex items-center justify-center font-bold text-[10px] shadow-sm flex-shrink-0 ${getCoinStyle(
                                            item.coin
                                        )}`}
                                    >
                                        {item.coin}
                                    </div>
                                    <div className="flex-1 flex items-center gap-1.5 flex-wrap">
                                        <span className={`font-bold text-sm ${getCoinTextColor(item.coin)}`}>{item.coin}</span>
                                        <span className={`text-[13px] font-mono font-bold tracking-tight ${getCoinTextColor(item.coin)}`}>
                                            {fmt(item.quantity)} u.
                                        </span>
                                        <span className="text-[10px] text-slate-500">
                                            · {fmtDate(item.date)}
                                        </span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-sm">
                                    <div className="bg-slate-900/40 p-2 rounded-lg border border-slate-700/50 text-center">
                                        <p className="text-[10px] uppercase text-slate-500 font-bold mb-0.5 tracking-wider">Precio Compra</p>
                                        <p className="text-slate-400 font-mono text-[13px] italic">{fmtPrice(item.buyPrice)}</p>
                                    </div>
                                    <div className="bg-slate-900/40 p-2 rounded-lg border border-slate-700/50 text-center">
                                        <p className="text-[10px] uppercase text-slate-500 font-bold mb-0.5 tracking-wider">Precio Actual</p>
                                        <p className="text-yellow-300 font-mono text-[13px] font-bold">{fmtPrice(item.currentPrice)}</p>
                                    </div>
                                    <div className="bg-slate-900/40 p-2 rounded-lg border border-slate-700/50 text-center">
                                        <p className="text-[10px] uppercase text-slate-500 font-bold mb-0.5 tracking-wider">Valor Total</p>
                                        <p className="text-emerald-300 font-mono text-[13px] font-bold">{fmtUSD(item.currentValue)}</p>
                                    </div>
                                    <div className="bg-slate-900/40 p-2 rounded-lg border border-slate-700/50 text-center">
                                        <p className="text-[10px] uppercase text-slate-500 font-bold mb-0.5 tracking-wider">PNL Neto</p>
                                        <div className="flex items-baseline justify-center gap-1.5">
                                            <span className={`font-bold text-sm ${item.profit >= 0 ? "text-green-400" : "text-red-400"}`}>
                                                {item.profit >= 0 ? "+" : ""}{fmtUSD(item.profit)}
                                            </span>
                                            <span className={`text-[13px] font-bold ${item.profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                                                {item.profit >= 0 ? "+" : ""}{item.roi.toFixed(2)}%
                                            </span>
                                        </div>
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
                                <th className="p-5 text-right">Cantidad</th>
                                <th className="p-5 text-right">Precio Compra</th>
                                <th className="p-5 text-right">Precio Actual</th>
                                <th className="p-5 text-right">Valor</th>
                                <th className="p-5 text-right">PNL Neto</th>
                                <th className="p-5 text-center">Fecha</th>
                                <th className="p-5 text-center">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700">
                            {items.map((item) => (
                                <tr
                                    key={item.id}
                                    className="hover:bg-slate-700/20 transition-colors font-sans"
                                >
                                    <td className="p-5 font-bold flex gap-3 items-center">
                                        <span
                                            className={`border px-3 py-1.5 rounded-xl text-xs font-black shadow-sm tracking-tighter ${getCoinStyle(
                                                item.coin
                                            )}`}
                                        >
                                            {item.coin}
                                        </span>
                                    </td>
                                    <td className="p-5 text-right text-slate-400 font-mono text-xs font-bold">
                                        {fmt(item.quantity)}
                                    </td>
                                    <td className="p-5 text-right text-slate-500 font-mono italic">
                                        {fmtPrice(item.buyPrice)}
                                    </td>
                                    <td className="p-5 text-right text-yellow-300 font-mono font-bold">
                                        {fmtPrice(item.currentPrice)}
                                    </td>
                                    <td className="p-5 text-right text-emerald-300 font-mono font-bold">
                                        {fmtUSD(item.currentValue)}
                                    </td>
                                    <td className="p-5 text-right">
                                        <div
                                            className={`font-bold ${item.profit >= 0 ? "text-green-400" : "text-red-400"
                                                }`}
                                        >
                                            {item.profit >= 0 ? "+" : ""}
                                            {fmtUSD(item.profit)}
                                        </div>
                                        <div
                                            className={`text-xs font-bold ${item.profit >= 0 ? "text-green-600" : "text-red-600"
                                                }`}
                                        >
                                            {item.profit >= 0 ? "+" : ""}
                                            {item.roi.toFixed(2)}%
                                        </div>
                                    </td>
                                    <td className="p-5 text-center text-slate-400 text-xs">
                                        {fmtDate(item.date)}
                                    </td>
                                    <td className="p-5 text-center">
                                        <div className="flex items-center justify-center gap-1">
                                            <button
                                                onClick={() => onSellEvaluate(item)}
                                                className="text-slate-500 hover:text-red-400 p-1 transition-colors"
                                                title="Evaluar Venta"
                                            >
                                                <TrendingUp className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => onAlert(item)}
                                                className={`p-1 transition-colors ${activeAlertIds.includes(item.id) ? "text-yellow-400 hover:text-yellow-300" : "text-slate-500 hover:text-yellow-400"}`}
                                                title="Configurar Alerta"
                                            >
                                                <Bell className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => onEdit(item)}
                                                className="text-slate-500 hover:text-yellow-400 p-1 transition-colors"
                                                title="Modificar"
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <DeleteButton onDelete={() => onDelete(item.id)} />
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }
);

AssetTable.displayName = "AssetTable";

export default AssetTable;
