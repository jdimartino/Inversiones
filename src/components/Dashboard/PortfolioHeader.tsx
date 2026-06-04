import React from "react";
import { fmtUSD, fmtPercent } from "../../lib/format";

function getLtvColor(ltv: number): string {
    if (ltv < 50) return "text-green-400";
    if (ltv < 75) return "text-yellow-400";
    return "text-red-400";
}

interface PortfolioHeaderProps {
    totalInvested: number;
    totalValue: number;
    totalPnl: number;
    totalRoi: number;
    totalDebt: number;
    totalCollateral: number;
    totalLtv: number;
}

const PortfolioHeader: React.FC<PortfolioHeaderProps> = ({
    totalInvested,
    totalValue,
    totalPnl,
    totalRoi,
    totalDebt,
    totalCollateral,
    totalLtv,
}) => {
    const isPositive = totalPnl >= 0;

    return (
        <div className="overflow-x-auto whitespace-nowrap bg-[#181A20] rounded-lg border border-slate-700/50 px-3 py-2.5">
            <div className="flex items-center justify-start gap-2 min-w-max">
                <span className="text-yellow-400 text-[13px] font-bold">Resumen Spot</span>
                <div className="flex items-center gap-3 text-xs">
                    <div>
                        <span className="text-gray-500">Total Invertido </span>
                        <span className="text-white font-semibold">{fmtUSD(totalInvested)}</span>
                    </div>
                    <span className="text-gray-700">|</span>
                    <div>
                        <span className="text-gray-500">Valor Actual </span>
                        <span className="text-white font-semibold">{fmtUSD(totalValue)}</span>
                    </div>
                    <span className="text-gray-700">|</span>
                    <div>
                        <span className="text-gray-500">PNL Global </span>
                        <span
                            className={`font-semibold ${
                                isPositive ? "text-green-400" : "text-red-400"
                            }`}
                        >
                            {fmtUSD(totalPnl)} ({fmtPercent(totalRoi)})
                        </span>
                    </div>
                </div>

                <span className="text-gray-700">|</span>

                <span className="text-yellow-400 text-[13px] font-bold">Préstamos</span>
                <div className="flex items-center gap-3 text-xs">
                    <div>
                        <span className="text-gray-500">Deuda </span>
                        <span className="text-white font-semibold">{fmtUSD(totalDebt)}</span>
                    </div>
                    <span className="text-gray-700">|</span>
                    <div>
                        <span className="text-gray-500">Colateral </span>
                        <span className="text-white font-semibold">{fmtUSD(totalCollateral)}</span>
                    </div>
                    <span className="text-gray-700">|</span>
                    <div>
                        <span className="text-gray-500">LTV </span>
                        <span className={`font-semibold ${getLtvColor(totalLtv)}`}>
                            {totalLtv.toFixed(2)}%
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PortfolioHeader;
