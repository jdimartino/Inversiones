import React from "react";
import { TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import { ProcessedInvestment } from "../../lib/constants";
import { fmtUSD, fmtPercent } from "../../lib/format";
import { getCoinTextColor } from "../../lib/constants";

interface SpotSummaryCardProps {
    sortedPortfolio: ProcessedInvestment[];
    onNavigate: () => void;
}

const SpotSummaryCard: React.FC<SpotSummaryCardProps> = ({
    sortedPortfolio,
    onNavigate,
}) => {
    const top4 = sortedPortfolio.slice(0, 4);
    const totalPositions = sortedPortfolio.length;

    return (
        <button
            onClick={onNavigate}
            className="w-full text-left bg-[#181A20] rounded-xl border border-gray-800 p-4 hover:border-yellow-500/40 hover:shadow-lg hover:shadow-yellow-500/5 transition-all group"
        >
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold flex items-center gap-2">
                    <span className="text-yellow-400">Spot</span>
                    <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
                        {totalPositions} posiciones
                    </span>
                </h3>
                <ArrowRight
                    size={16}
                    className="text-gray-600 group-hover:text-yellow-400 transition-colors"
                />
            </div>

            {top4.length === 0 ? (
                <p className="text-gray-600 text-sm">Sin posiciones abiertas</p>
            ) : (
                <div className="space-y-2">
                    {top4.map((item) => (
                        <div
                            key={item.id}
                            className="flex items-center justify-between"
                        >
                            <div className="flex items-center gap-2">
                                <span
                                    className={`text-sm font-bold ${getCoinTextColor(
                                        item.coin
                                    )}`}
                                >
                                    {item.coin}
                                </span>
                                <span className="text-xs text-gray-500">
                                    {item.quantity.toFixed(4)}
                                </span>
                            </div>
                            <div className="text-right">
                                <div className="text-white text-sm">
                                    {fmtUSD(item.currentValue)}
                                </div>
                                <div
                                    className={`text-xs flex items-center gap-1 justify-end ${
                                        item.profit >= 0
                                            ? "text-green-400"
                                            : "text-red-400"
                                    }`}
                                >
                                    {item.profit >= 0 ? (
                                        <TrendingUp size={10} />
                                    ) : (
                                        <TrendingDown size={10} />
                                    )}
                                    {fmtPercent(item.roi)}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </button>
    );
};

export default SpotSummaryCard;
