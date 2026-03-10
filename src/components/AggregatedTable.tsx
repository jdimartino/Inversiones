import React from "react";
import { Calculator } from "lucide-react";
import { getCoinStyle, AggregatedAsset } from "../lib/constants";
import { fmtUSD, fmtPrice } from "../lib/format";

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
                            <div key={asset.coin} className="p-4 relative hover:bg-slate-700/10 transition-colors">
                                <div className="flex items-center gap-3 mb-4">
                                    <div
                                        className={`w-10 h-10 border rounded-full flex items-center justify-center font-bold text-[11px] shadow-sm ${getCoinStyle(
                                            asset.coin
                                        )}`}
                                    >
                                        {asset.coin}
                                    </div>
                                    <div>
                                        <p className="font-bold text-white text-base">{asset.coin}</p>
                                        <p className="text-xs text-slate-400 font-mono font-bold tracking-tight">
                                            {asset.totalQty.toFixed(4)} u.
                                        </p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-x-2 gap-y-3 text-sm">
                                    <div className="bg-slate-900/40 p-2 rounded-lg border border-slate-700/50">
                                        <p className="text-[9px] uppercase text-slate-500 font-bold mb-0.5 tracking-wider">Precio Promedio</p>
                                        <p className="text-blue-400 font-mono text-xs font-bold">{fmtPrice(asset.avgBuyPrice)}</p>
                                    </div>
                                    <div className="bg-slate-900/40 p-2 rounded-lg border border-slate-700/50 text-right">
                                        <p className="text-[9px] uppercase text-slate-500 font-bold mb-0.5 tracking-wider">Precio Actual</p>
                                        <p className="text-yellow-300 font-mono text-xs font-bold">{fmtPrice(asset.currentPrice)}</p>
                                    </div>
                                    <div className="col-span-2 bg-slate-900/40 p-3 rounded-lg border border-slate-700/50 flex justify-between items-center">
                                        <p className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">PNL Neto Promedio</p>
                                        <div className="text-right">
                                            <div
                                                className={`font-bold text-sm ${asset.pnl >= 0 ? "text-green-400" : "text-red-400"
                                                    }`}
                                            >
                                                {asset.pnl >= 0 ? "+" : ""}
                                                {fmtUSD(asset.pnl)}
                                            </div>
                                            <div
                                                className={`text-[10px] font-bold tracking-tight ${asset.pnl >= 0 ? "text-green-600" : "text-red-600"
                                                    }`}
                                            >
                                                {asset.priceDiffPercent >= 0 ? "+" : ""}
                                                {asset.priceDiffPercent.toFixed(2)}% vs Prom.
                                            </div>
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
                                        {fmtPrice(asset.avgBuyPrice)}
                                    </td>
                                    <td className="p-5 text-right text-yellow-300 font-mono font-bold">
                                        {fmtPrice(asset.currentPrice)}
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
