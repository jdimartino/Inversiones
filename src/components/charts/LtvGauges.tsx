import React from "react";
import { ProcessedLoan } from "../../lib/constants";
import { fmtUSD } from "../../lib/format";
import ChartCard from "./ChartCard";

const LtvGauges: React.FC<{ loans: ProcessedLoan[] }> = ({ loans }) => {
    if (loans.length === 0) return null;

    return (
        <ChartCard
            title="LTV de Préstamos"
            subtitle="Liquidación Binance 91% · Bybit 92%"
        >
            <div className="flex flex-col gap-4">
                {loans.map((loan) => {
                    const ltv = Math.min(loan.ltv, 100);
                    const color =
                        ltv >= 85 ? "#ef4444" : ltv >= 75 ? "#f59e0b" : "#4ade80";

                    return (
                        <div key={loan.id}>
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-xs font-bold text-slate-300">
                                    {loan.exchange} — {loan.collateralCoin}
                                </span>
                                <span className="text-xs font-bold" style={{ color }}>
                                    LTV {ltv.toFixed(1)}%
                                </span>
                            </div>
                            <div className="h-3 rounded-full bg-slate-700 overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{
                                        width: `${ltv}%`,
                                        backgroundColor: color,
                                        boxShadow: `0 0 8px ${color}80`,
                                    }}
                                />
                            </div>
                            <div className="flex justify-between text-[9px] mt-0.5 text-slate-600">
                                <span>0%</span>
                                <span className="text-amber-700">75%</span>
                                <span className="text-amber-600">85%</span>
                                <span className="text-red-700">Liq.</span>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-0.5">
                                Precio de liquidación: <span className="text-red-400 font-bold">{fmtUSD(loan.liquidationPrice)}</span>
                                &nbsp;\u00b7&nbsp;
                                Deuda: <span className="text-slate-300 font-bold">{fmtUSD(loan.borrowedUSDT)}</span>
                            </p>
                        </div>
                    );
                })}
            </div>
        </ChartCard>
    );
};

export default LtvGauges;
