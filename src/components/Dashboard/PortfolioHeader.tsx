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
        <div className="bg-[#181A20] rounded-lg border border-slate-700/50 px-3 py-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                    <span className="text-yellow-400 text-[13px] font-bold shrink-0">Resumen Spot</span>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] sm:text-xs">
                        <div>
                            <span className="text-gray-500">Total Invertido </span>
                            <span className="text-white font-semibold">{fmtUSD(totalInvested)}</span>
                        </div>
                        <span className="text-gray-700 hidden sm:inline">|</span>
                        <div>
                            <span className="text-gray-500">Valor Actual </span>
                            <span className="text-white font-semibold">{fmtUSD(totalValue)}</span>
                        </div>
                        <span className="text-gray-700 hidden sm:inline">|</span>
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
                </div>

                <span className="text-gray-700 hidden sm:inline">|</span>
                <div className="w-full sm:w-auto h-px sm:hidden bg-slate-700/50" />

                <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                    <span className="text-yellow-400 text-[13px] font-bold shrink-0">Préstamos</span>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] sm:text-xs">
                        <div>
                            <span className="text-gray-500">Deuda </span>
                            <span className="text-white font-semibold">{fmtUSD(totalDebt)}</span>
                        </div>
                        <span className="text-gray-700 hidden sm:inline">|</span>
                        <div>
                            <span className="text-gray-500">Colateral </span>
                            <span className="text-white font-semibold">{fmtUSD(totalCollateral)}</span>
                        </div>
                        <span className="text-gray-700 hidden sm:inline">|</span>
                        <div>
                            <span className="text-gray-500">LTV </span>
                            <span className={`font-semibold ${getLtvColor(totalLtv)}`}>
                                {totalLtv.toFixed(2)}%
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PortfolioHeader;
