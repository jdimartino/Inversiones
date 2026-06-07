import React from "react";
import { fmtUSD, fmtPercent, fmtCompact } from "../../lib/format";

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
    futuresBalance?: number;
    futuresPnl?: number;
    futuresMarginBalance?: number;
    futuresTransferable?: number;
}

const PortfolioHeader: React.FC<PortfolioHeaderProps> = ({
    totalInvested,
    totalValue,
    totalPnl,
    totalRoi,
    totalDebt,
    totalCollateral,
    totalLtv,
    futuresBalance = 0,
    futuresPnl = 0,
    futuresMarginBalance = 0,
    futuresTransferable = 0,
}) => {
    const isPositive = totalPnl >= 0;
    const isFuturesPnlPositive = futuresPnl >= 0;

    return (
        <div className="bg-[#181A20] rounded-lg border border-slate-700/50 px-3 py-2.5">
            {/* Mobile: each section on its own line */}
            <div className="sm:hidden flex flex-col gap-1 text-[10px]">
                <div className="flex flex-nowrap items-center justify-between overflow-hidden whitespace-nowrap">
                    <span className="text-yellow-400 font-bold shrink-0">Spot</span>
                    <div className="flex items-center gap-0.5">
                        <span className="text-gray-500">Inv</span>
                        <span className="text-white font-semibold">{fmtUSD(totalInvested)}</span>
                    </div>
                    <div className="flex items-center gap-0.5">
                        <span className="text-gray-500">Val</span>
                        <span className="text-white font-semibold">{fmtUSD(totalValue)}</span>
                    </div>
                    <div className="flex items-center gap-0.5">
                        <span className="text-gray-500">PnL</span>
                        <span className={`font-semibold ${isPositive ? "text-green-400" : "text-red-400"}`}>
                            {fmtUSD(totalPnl)}
                        </span>
                    </div>
                </div>
                <div className="border-t border-slate-700/50" />
                <div className="flex flex-nowrap items-center justify-between overflow-hidden whitespace-nowrap">
                    <span className="text-yellow-400 font-bold shrink-0">Préstamos</span>
                    <div className="flex items-center gap-0.5">
                        <span className="text-gray-500">Deud</span>
                        <span className="text-white font-semibold">{fmtUSD(totalDebt)}</span>
                    </div>
                    <div className="flex items-center gap-0.5">
                        <span className="text-gray-500">Col</span>
                        <span className="text-white font-semibold">{fmtUSD(totalCollateral)}</span>
                    </div>
                    <div className="flex items-center gap-0.5">
                        <span className="text-gray-500">LTV</span>
                        <span className={`font-semibold ${getLtvColor(totalLtv)}`}>
                            {totalLtv.toFixed(2)}%
                        </span>
                    </div>
                </div>
                <div className="border-t border-slate-700/50" />
                <div className="flex flex-nowrap items-center justify-between overflow-hidden whitespace-nowrap">
                    <span className="text-yellow-400 font-bold shrink-0">Futuros</span>
                    <div className="flex items-center gap-0.5">
                        <span className="text-gray-500">Bal</span>
                        <span className="text-white font-semibold">{fmtUSD(futuresBalance)}</span>
                    </div>
                    <div className="flex items-center gap-0.5">
                        <span className="text-gray-500">Marg</span>
                        <span className="text-white font-semibold">{fmtUSD(futuresMarginBalance)}</span>
                    </div>
                    <div className="flex items-center gap-0.5">
                        <span className="text-gray-500">Trans</span>
                        <span className="text-white font-semibold">{fmtUSD(futuresTransferable)}</span>
                    </div>
                    <div className="flex items-center gap-0.5">
                        <span className="text-gray-500">PnL</span>
                        <span className={`font-semibold ${isFuturesPnlPositive ? "text-green-400" : "text-red-400"}`}>
                            {fmtUSD(futuresPnl)}
                        </span>
                    </div>
                </div>
            </div>

            {/* Desktop: full layout */}
            <div className="hidden sm:flex sm:flex-row sm:items-center gap-3">
                <div className="flex flex-row sm:items-center gap-3">
                    <span className="text-yellow-400 text-[13px] font-bold shrink-0">Resumen Spot</span>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
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
                </div>

                <span className="text-gray-700">|</span>

                <div className="flex flex-row sm:items-center gap-3">
                    <span className="text-yellow-400 text-[13px] font-bold shrink-0">Préstamos</span>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
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

                <span className="text-gray-700">|</span>

                <div className="flex flex-row sm:items-center gap-3">
                    <span className="text-yellow-400 text-[13px] font-bold shrink-0">Futuros</span>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <div>
                            <span className="text-gray-500">Balance </span>
                            <span className="text-white font-semibold">{fmtUSD(futuresBalance)}</span>
                        </div>
                        <span className="text-gray-700">|</span>
                        <div>
                            <span className="text-gray-500">Saldo Margen </span>
                            <span className="text-white font-semibold">{fmtUSD(futuresMarginBalance)}</span>
                        </div>
                        <span className="text-gray-700">|</span>
                        <div>
                            <span className="text-gray-500">Transferible </span>
                            <span className="text-white font-semibold">{fmtUSD(futuresTransferable)}</span>
                        </div>
                        <span className="text-gray-700">|</span>
                        <div>
                            <span className="text-gray-500">PnL </span>
                            <span
                                className={`font-semibold ${
                                    isFuturesPnlPositive ? "text-green-400" : "text-red-400"
                                }`}
                            >
                                {fmtUSD(futuresPnl)}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PortfolioHeader;
