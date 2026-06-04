import React from "react";
import { TrendingUp, TrendingDown, ArrowRight, Shield } from "lucide-react";
import { FuturesData } from "../../lib/futures";
import { fmtUSD, fmtPercent } from "../../lib/format";
import { getMarginColor, getMarginBarColor, getMarginLabel } from "../../lib/futures";

interface FuturesSummaryCardProps {
    futuresData: FuturesData | null;
    onNavigate: () => void;
}

const FuturesSummaryCard: React.FC<FuturesSummaryCardProps> = ({
    futuresData,
    onNavigate,
}) => {
    if (!futuresData) {
        return (
            <div className="bg-[#181A20] rounded-xl border border-gray-800 p-4">
                <h3 className="text-white font-semibold flex items-center gap-2 mb-2">
                    <span className="text-yellow-400">Futuros</span>
                </h3>
                <p className="text-gray-600 text-sm">Sin datos de futuros</p>
            </div>
        );
    }

    const { account, positions } = futuresData;
    const openPositions = positions.length;
    const totalPnl = account.totalUnrealizedProfit;
    const isPositive = totalPnl >= 0;
    const marginRatio = account.marginRatio ?? 0;
    const marginColor = getMarginColor(marginRatio);
    const marginBarColor = getMarginBarColor(marginRatio);
    const marginLabel = getMarginLabel(marginRatio);

    return (
        <button
            onClick={onNavigate}
            className="w-full text-left bg-[#181A20] rounded-xl border border-gray-800 p-4 hover:border-yellow-500/40 hover:shadow-lg hover:shadow-yellow-500/5 transition-all group"
        >
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold flex items-center gap-2">
                    <span className="text-yellow-400">Futuros</span>
                    <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
                        {openPositions} posiciones
                    </span>
                </h3>
                <ArrowRight
                    size={16}
                    className="text-gray-600 group-hover:text-yellow-400 transition-colors"
                />
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                    <div className="text-xs text-gray-500 mb-1">PNL No Realizado</div>
                    <div
                        className={`text-lg font-bold flex items-center gap-1 ${
                            isPositive ? "text-green-400" : "text-red-400"
                        }`}
                    >
                        {isPositive ? (
                            <TrendingUp size={14} />
                        ) : (
                            <TrendingDown size={14} />
                        )}
                        {fmtUSD(totalPnl)}
                    </div>
                </div>
                <div>
                    <div className="text-xs text-gray-500 mb-1">Balance</div>
                    <div className="text-white text-lg font-bold">
                        {fmtUSD(account.totalWalletBalance)}
                    </div>
                </div>
            </div>

            <div>
                <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Shield size={10} /> Margen Cross
                    </span>
                    <span className={`text-xs font-bold ${marginColor}`}>
                        {marginRatio.toFixed(2)}% — {marginLabel}
                    </span>
                </div>
                <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all ${marginBarColor}`}
                        style={{ width: `${Math.min(marginRatio, 100)}%` }}
                    />
                </div>
            </div>
        </button>
    );
};

export default FuturesSummaryCard;
