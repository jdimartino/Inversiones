import React from "react";
import { TrendingUp, TrendingDown, Wallet, BarChart3 } from "lucide-react";
import { fmtUSD, fmtPercent } from "../../lib/format";

interface PortfolioHeaderProps {
    totalInvested: number;
    totalValue: number;
    totalPnl: number;
    totalRoi: number;
}

const PortfolioHeader: React.FC<PortfolioHeaderProps> = ({
    totalInvested,
    totalValue,
    totalPnl,
    totalRoi,
}) => {
    const isPositive = totalPnl >= 0;

    return (
        <div className="bg-[#181A20] rounded-xl border border-gray-800 p-5">
            <div className="flex items-center gap-2 mb-4">
                <Wallet className="text-yellow-400" size={20} />
                <h2 className="text-white text-lg font-bold">Resumen de Portafolio</h2>
            </div>
            <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                    <div className="text-xs text-gray-500 mb-1">Total Invertido</div>
                    <div className="text-white text-lg font-bold">
                        {fmtUSD(totalInvested)}
                    </div>
                </div>
                <div className="text-center">
                    <div className="text-xs text-gray-500 mb-1 flex items-center justify-center gap-1">
                        <BarChart3 size={12} /> Valor Actual
                    </div>
                    <div className="text-white text-lg font-bold">
                        {fmtUSD(totalValue)}
                    </div>
                </div>
                <div className="text-center">
                    <div className="text-xs text-gray-500 mb-1 flex items-center justify-center gap-1">
                        {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        PNL Global
                    </div>
                    <div
                        className={`text-lg font-bold ${
                            isPositive ? "text-green-400" : "text-red-400"
                        }`}
                    >
                        {fmtUSD(totalPnl)}
                    </div>
                    <div
                        className={`text-xs ${
                            isPositive ? "text-green-400" : "text-red-400"
                        }`}
                    >
                        {fmtPercent(totalRoi)}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PortfolioHeader;
