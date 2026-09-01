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
    bybitDebt: number;
    bybitCollateral: number;
    bybitLtv: number;
    binanceDebt: number;
    binanceCollateral: number;
    binanceLtv: number;
    futuresBalance?: number;
    futuresPnl?: number;
    futuresMarginBalance?: number;
    futuresTransferable?: number;
}

interface LoanRowProps {
    name: string;
    debt: number;
    collateral: number;
    ltv: number;
    total?: boolean;
}

const LoanRow: React.FC<LoanRowProps> = ({ name, debt, collateral, ltv, total = false }) => (
    <div className={`grid grid-cols-[minmax(4rem,0.7fr)_1.1fr_1.1fr_0.6fr] items-center gap-x-2 ${total ? "pb-1" : "border-t border-slate-700/50 pt-1.5"}`}>
        <span className={`truncate text-xs font-semibold ${total ? "text-gray-300" : "text-yellow-400"}`}>
            {name}
        </span>
        <div className="min-w-0">
            <div className={`truncate text-xs font-semibold ${total ? "text-white" : "text-gray-300"}`}>
                {fmtUSD(debt)}
            </div>
        </div>
        <div className="min-w-0">
            <div className={`truncate text-xs font-semibold ${total ? "text-white" : "text-gray-300"}`}>
                {fmtUSD(collateral)}
            </div>
        </div>
        <div className="min-w-0">
            <div className={`text-xs font-semibold ${getLtvColor(ltv)}`}>{ltv.toFixed(total ? 2 : 1)}%</div>
        </div>
    </div>
);

const PortfolioHeader: React.FC<PortfolioHeaderProps> = ({
    totalInvested,
    totalValue,
    totalPnl,
    totalRoi,
    totalDebt,
    totalCollateral,
    totalLtv,
    bybitDebt,
    bybitCollateral,
    bybitLtv,
    binanceDebt,
    binanceCollateral,
    binanceLtv,
    futuresBalance = 0,
    futuresPnl = 0,
    futuresMarginBalance = 0,
    futuresTransferable = 0,
}) => {
    const isPositive = totalPnl >= 0;
    const isFuturesPnlPositive = futuresPnl >= 0;

    return (
        <div className="rounded-lg border border-slate-700/50 bg-[#181A20] p-3">
            <div className="grid grid-cols-1 divide-y divide-slate-700/50 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                <section className="pb-3 sm:pr-4 sm:pb-0" aria-labelledby="spot-summary-title">
                    <h2 id="spot-summary-title" className="mb-2 text-sm font-bold text-yellow-400">
                        Resumen Spot
                    </h2>
                    {/* Mobile: compact inline */}
                    <div className="flex flex-wrap items-center justify-between text-[10px] sm:hidden">
                        <div className="flex items-center gap-0.5">
                            <span className="text-gray-500">Inv</span>
                            <span className="text-white font-semibold">{fmtUSD(totalInvested)}</span>
                        </div>
                        <div className="flex items-center gap-0.5">
                            <span className="text-gray-500">Val</span>
                            <span className="text-white font-semibold">{fmtUSD(totalValue)}</span>
                        </div>
                    </div>
                    {/* Mobile: big PNL */}
                    <div className="sm:hidden mt-1.5 text-center">
                        <div className="text-[9px] uppercase tracking-wider text-gray-500">PNL Global</div>
                        <div className={`text-2xl font-bold tabular-nums leading-tight ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                            {totalPnl >= 0 ? '+' : ''}{fmtUSD(totalPnl)}
                        </div>
                        <div className={`text-xs font-semibold ${isPositive ? 'text-green-400/70' : 'text-red-400/70'}`}>
                            ({totalPnl >= 0 ? '+' : ''}{fmtPercent(totalRoi)})
                        </div>
                    </div>
                    {/* PC: compact single row */}
                    <div className="hidden sm:flex sm:items-center sm:gap-4 text-xs">
                        <div className="flex items-center gap-1">
                            <span className="text-gray-500">Total invertido</span>
                            <span className="text-white font-semibold">{fmtUSD(totalInvested)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <span className="text-gray-500">Valor actual</span>
                            <span className="text-white font-semibold">{fmtUSD(totalValue)}</span>
                        </div>
                    </div>
                    {/* PC: big PNL */}
                    <div className="hidden sm:block mt-2 text-center">
                        <div className="text-[9px] uppercase tracking-wider text-gray-500">PNL Global</div>
                        <div className={`text-2xl lg:text-3xl font-bold tabular-nums leading-tight ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                            {totalPnl >= 0 ? '+' : ''}{fmtUSD(totalPnl)}
                        </div>
                        <div className={`text-xs font-semibold ${isPositive ? 'text-green-400/70' : 'text-red-400/70'}`}>
                            ({totalPnl >= 0 ? '+' : ''}{fmtPercent(totalRoi)})
                        </div>
                    </div>
                </section>

                <section className="py-3 sm:px-4 sm:py-0" aria-labelledby="loans-summary-title">
                    <h2 id="loans-summary-title" className="mb-2 text-sm font-bold text-yellow-400">
                        Préstamos
                    </h2>
                    <div className="rounded-md border border-slate-700/50 bg-slate-900/30 px-2 py-2">
                        <div className="grid grid-cols-[minmax(4rem,0.7fr)_1.1fr_1.1fr_0.6fr] items-center gap-x-2 pb-1 border-b border-slate-700/50">
                            <span className="text-[9px] text-gray-500 font-medium"></span>
                            <span className="text-[9px] text-gray-500 font-medium">Deuda</span>
                            <span className="text-[9px] text-gray-500 font-medium">Colateral</span>
                            <span className="text-[9px] text-gray-500 font-medium">LTV</span>
                        </div>
                        <LoanRow
                            name="Total"
                            debt={totalDebt}
                            collateral={totalCollateral}
                            ltv={totalLtv}
                            total
                        />
                        <LoanRow
                            name="Bybit"
                            debt={bybitDebt}
                            collateral={bybitCollateral}
                            ltv={bybitLtv}
                        />
                        <LoanRow
                            name="Binance"
                            debt={binanceDebt}
                            collateral={binanceCollateral}
                            ltv={binanceLtv}
                        />
                    </div>
                </section>

                <section className="pt-3 sm:pl-4 sm:pt-0" aria-labelledby="futures-summary-title">
                    <h2 id="futures-summary-title" className="mb-2 text-sm font-bold text-yellow-400">
                        Futuros
                    </h2>
                    {/* Mobile: compact inline */}
                    <div className="flex flex-wrap items-center justify-between text-[10px] sm:hidden">
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
                    </div>
                    {/* Mobile: big PNL */}
                    <div className="sm:hidden mt-1.5 text-center">
                        <div className="text-[9px] uppercase tracking-wider text-gray-500">PNL</div>
                        <div className={`text-2xl font-bold tabular-nums leading-tight ${isFuturesPnlPositive ? 'text-green-400' : 'text-red-400'}`}>
                            {futuresPnl >= 0 ? '+' : ''}{fmtUSD(futuresPnl)}
                        </div>
                    </div>
                    {/* PC: compact info */}
                    <div className="hidden sm:flex sm:flex-col sm:gap-1.5 text-xs">
                        <div className="flex items-center gap-1">
                            <span className="text-gray-500">Balance</span>
                            <span className="text-white font-semibold">{fmtUSD(futuresBalance)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1">
                                <span className="text-gray-500">Saldo margen</span>
                                <span className="text-white font-semibold">{fmtUSD(futuresMarginBalance)}</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <span className="text-gray-500">Transferible</span>
                                <span className="text-white font-semibold">{fmtUSD(futuresTransferable)}</span>
                            </div>
                        </div>
                    </div>
                    {/* PC: big PNL */}
                    <div className="hidden sm:block mt-2 text-center">
                        <div className="text-[9px] uppercase tracking-wider text-gray-500">PNL</div>
                        <div className={`text-2xl lg:text-3xl font-bold tabular-nums leading-tight ${isFuturesPnlPositive ? 'text-green-400' : 'text-red-400'}`}>
                            {futuresPnl >= 0 ? '+' : ''}{fmtUSD(futuresPnl)}
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
};

export default PortfolioHeader;
