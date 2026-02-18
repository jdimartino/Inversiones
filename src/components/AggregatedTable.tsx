import React from "react";
import { Calculator } from "lucide-react";
import { getCoinStyle, AggregatedAsset } from "../lib/constants";
import { fmtUSD } from "../lib/format";

interface AggregatedTableProps {
    items: AggregatedAsset[];
}

const AggregatedTable: React.FC<AggregatedTableProps> = React.memo(
    ({ items }) => {
        if (items.length === 0) return null;

        return (
            <div className="mb-10">
                <h2 className="text-xs font-bold text-slate-500 mb-4 uppercase tracking-widest flex items-center gap-2 border-b border-slate-800 pb-2">
                    <Calculator className="w-4 h-4 text-blue-400" /> Promedios y PNL
                    Consolidado
                </h2>
                <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-xl">
                    {/* Mobile */}
                    <div className="md:hidden divide-y divide-slate-700">
                        {items.map((asset) => (
                            <div
                                key={asset.coin}
                                className="p-4 flex justify-between items-center"
                            >
                                <div className="flex items-center gap-3">
                                    <div
                                        className={`w-10 h-10 border rounded-full flex items-center justify-center font-bold text-[11px] shadow-sm ${getCoinStyle(
                                            asset.coin
                                        )}`}
                                    >
                                        {asset.coin}
                                    </div>
                                    <div>
                                        <p className="font-bold text-white text-sm">{asset.coin}</p>
                                        <p className="text-[10px] text-slate-500">
                                            {asset.totalQty.toFixed(4)} u.
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm text-blue-400 font-mono font-bold">
                                        {fmtUSD(asset.avgBuyPrice)}
                                    </p>
                                    <p
                                        className={`text-xs font-bold ${asset.pnl >= 0 ? "text-green-400" : "text-red-400"
                                            }`}
                                    >
                                        {asset.pnl >= 0 ? "+" : ""}
                                        {fmtUSD(asset.pnl)}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Desktop */}
                    <table className="hidden md:table w-full text-left text-sm">
                        <thead className="bg-slate-950 text-slate-500 uppercase text-[10px] tracking-widest">
                            <tr>
                                <th className="p-5">Moneda</th>
                                <th className="p-5 text-right">Cantidad Total</th>
                                <th className="p-5 text-right text-blue-400 font-black">
                                    Precio Promedio
                                </th>
                                <th className="p-5 text-right">Precio Actual</th>
                                <th className="p-5 text-right">PNL Neto Promedio</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700">
                            {items.map((asset) => (
                                <tr
                                    key={asset.coin}
                                    className="hover:bg-slate-700/20 transition-colors"
                                >
                                    <td className="p-5 font-bold">
                                        <span
                                            className={`border px-3 py-1.5 rounded-xl text-xs font-black tracking-tighter ${getCoinStyle(
                                                asset.coin
                                            )}`}
                                        >
                                            {asset.coin}
                                        </span>
                                    </td>
                                    <td className="p-5 text-right text-slate-400 font-mono text-xs font-bold">
                                        {asset.totalQty.toFixed(4)}
                                    </td>
                                    <td className="p-5 text-right text-blue-400 font-mono font-bold">
                                        {fmtUSD(asset.avgBuyPrice)}
                                    </td>
                                    <td className="p-5 text-right text-yellow-300 font-mono font-bold">
                                        {fmtUSD(asset.currentPrice)}
                                    </td>
                                    <td className="p-5 text-right">
                                        <div
                                            className={`font-bold ${asset.pnl >= 0 ? "text-green-400" : "text-red-400"
                                                }`}
                                        >
                                            {asset.pnl >= 0 ? "+" : ""}
                                            {fmtUSD(asset.pnl)}
                                        </div>
                                        <div
                                            className={`text-[10px] font-bold ${asset.pnl >= 0 ? "text-green-600" : "text-red-600"
                                                }`}
                                        >
                                            {asset.priceDiffPercent >= 0 ? "+" : ""}
                                            {asset.priceDiffPercent.toFixed(2)}% vs Prom.
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

AggregatedTable.displayName = "AggregatedTable";

export default AggregatedTable;
