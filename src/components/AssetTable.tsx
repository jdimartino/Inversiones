import React from "react";
import { Activity } from "lucide-react";
import { getCoinStyle, ProcessedInvestment } from "../lib/constants";
import { fmt, fmtUSD } from "../lib/format";
import DeleteButton from "./DeleteButton";

interface AssetTableProps {
    items: ProcessedInvestment[];
    onDelete: (id: string) => void;
}

const AssetTable: React.FC<AssetTableProps> = React.memo(
    ({ items, onDelete }) => {
        if (items.length === 0) return null;

        return (
            <div className="mb-10">
                <h2 className="text-xs font-bold text-slate-500 mb-4 uppercase tracking-widest flex items-center gap-2 border-b border-slate-800 pb-2">
                    <Activity className="w-4 h-4 text-emerald-500" /> Detalle de Activos
                </h2>
                <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-xl">
                    {/* Mobile */}
                    <div className="md:hidden divide-y divide-slate-700">
                        {items.map((item) => (
                            <div
                                key={item.id}
                                className="p-4 flex justify-between items-center"
                            >
                                <div className="flex items-center gap-3">
                                    <div
                                        className={`w-10 h-10 border rounded-full flex items-center justify-center font-bold text-[11px] shadow-sm ${getCoinStyle(
                                            item.coin
                                        )}`}
                                    >
                                        {item.coin}
                                    </div>
                                    <div>
                                        <p className="font-bold text-white text-sm">{item.coin}</p>
                                        <p className="text-[10px] text-slate-500">
                                            {fmt(item.quantity)} u.
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-bold text-white">
                                        {fmtUSD(item.currentValue)}
                                    </p>
                                    <p
                                        className={`text-xs font-bold ${item.profit >= 0 ? "text-green-400" : "text-red-400"
                                            }`}
                                    >
                                        {item.profit >= 0 ? "+" : ""}
                                        {fmtUSD(item.profit)}
                                    </p>
                                </div>
                                <DeleteButton onDelete={() => onDelete(item.id)} />
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
                                        {fmtUSD(item.buyPrice)}
                                    </td>
                                    <td className="p-5 text-right text-yellow-300 font-mono font-bold">
                                        {fmtUSD(item.currentPrice)}
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
                                            {item.roi.toFixed(2)}%
                                        </div>
                                    </td>
                                    <td className="p-5 text-center">
                                        <DeleteButton onDelete={() => onDelete(item.id)} />
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
