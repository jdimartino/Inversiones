import React from "react";
import { ProcessedInvestment } from "../../lib/constants";
import { fmtUSD, fmtPrice } from "../../lib/format";
import { getCoinTextColor } from "../../lib/constants";
import { PriceDirection } from "../../hooks/usePrices";

interface SpotSummaryCardProps {
    sortedPortfolio: ProcessedInvestment[];
    onNavigate: () => void;
    priceDirections: Record<string, PriceDirection>;
}

const SpotSummaryCard: React.FC<SpotSummaryCardProps> = ({
    sortedPortfolio,
    onNavigate,
    priceDirections,
}) => {
    const sortedPositions = [...sortedPortfolio].sort((a, b) => b.profit - a.profit);
    const totalPositions = sortedPortfolio.length;

    return (
        <button
            onClick={onNavigate}
            className="w-full h-full text-left bg-[#181A20] rounded-xl border border-slate-700/50 shadow-sm shadow-black/10 p-3 hover:border-yellow-500/30 hover:shadow-yellow-500/5 transition-all group flex flex-col justify-start"
        >
            <div className="flex items-center justify-center mb-2">
                <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                    <span className="text-yellow-400">Spot</span>
                    <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded-full">
                        {totalPositions} posiciones
                    </span>
                </h3>
            </div>

            {sortedPositions.length === 0 ? (
                <p className="text-gray-600 text-xs text-center">Sin posiciones abiertas</p>
            ) : (
                <div className="mt-2">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <colgroup>
                                <col className="w-[15%] md:w-[12%]" />
                                <col className="w-[35%] md:w-[20%]" />
                                <col className="w-0 md:w-[22%]" />
                                <col className="w-0 md:w-[22%]" />
                                <col className="w-[50%] md:w-[24%]" />
                            </colgroup>
                            <thead>
                                <tr className="text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-800">
                                    <th className="text-center md:text-left pb-2 font-medium">Activo</th>
                                    <th className="text-center md:text-right pb-2 font-medium">Valor</th>
                                    <th className="text-right pb-2 font-medium hidden md:table-cell">P. Compra</th>
                                    <th className="text-right pb-2 font-medium hidden md:table-cell">P. Actual</th>
                                    <th className="text-center md:text-right pb-2 font-medium">PNL</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedPositions.map((item) => (
                                    <tr key={item.id} className="border-b border-gray-800/50">
                                        <td className={`py-1.5 text-xs font-bold text-center md:text-left ${getCoinTextColor(item.coin)}`}>
                                            {item.coin}
                                        </td>
                                        <td className="py-1.5 text-center md:text-right font-mono text-[11px] tabular-nums">
                                            {fmtUSD(item.currentValue)}
                                        </td>
                                        <td className="py-1.5 text-right font-mono text-[11px] tabular-nums text-blue-400 hidden md:table-cell">
                                            {fmtPrice(item.buyPrice)}
                                        </td>
                                        <td className={`py-1.5 text-right font-mono text-[11px] tabular-nums hidden md:table-cell ${priceDirections[item.coin] === 'up' ? 'text-green-400' : priceDirections[item.coin] === 'down' ? 'text-red-400' : 'text-white'}`}>
                                            {fmtPrice(item.currentPrice)}
                                        </td>
                                        <td className={`py-1.5 text-center md:text-right font-mono text-[11px] tabular-nums font-bold ${item.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                            <div>{item.profit >= 0 ? '+' : ''}{fmtUSD(item.profit)}</div>
                                            <div className="text-[10px] font-normal">({item.roi >= 0 ? '+' : ''}{item.roi.toFixed(2)}%)</div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </button>
    );
};

export default SpotSummaryCard;
