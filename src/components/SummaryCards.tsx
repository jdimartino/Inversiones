import React from "react";
import { Wallet, DollarSign, PieChart, TrendingUp } from "lucide-react";
import { fmtUSD } from "../lib/format";

interface SummaryCardsProps {
    totalInvested: number;
    totalValue: number;
    totalPnl: number;
    totalRoi: number;
}

const SummaryCards: React.FC<SummaryCardsProps> = React.memo(
    ({ totalInvested, totalValue, totalPnl, totalRoi }) => (
        <div className="mb-8">
            <h2 className="text-xs font-bold text-slate-500 mb-4 uppercase tracking-widest flex items-center gap-2 border-b border-slate-800 pb-2">
                <Wallet className="w-4 h-4 text-blue-400" /> Resumen Spot
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 relative shadow-lg">
                    <p className="text-[10px] text-slate-500 uppercase font-bold">
                        Total Invertido
                    </p>
                    <p className="text-2xl font-bold text-white">
                        {fmtUSD(totalInvested)}
                    </p>
                    <DollarSign className="absolute right-4 top-4 text-slate-700 w-10 h-10 opacity-20" />
                </div>
                <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 relative shadow-lg">
                    <p className="text-[10px] text-slate-500 uppercase font-bold">
                        Valor Actual
                    </p>
                    <p className="text-2xl font-bold text-blue-300">
                        {fmtUSD(totalValue)}
                    </p>
                    <PieChart className="absolute right-4 top-4 text-slate-700 w-10 h-10 opacity-20" />
                </div>
                <div
                    className={`p-5 rounded-xl border shadow-lg relative overflow-hidden ${totalPnl >= 0
                            ? "bg-green-900/10 border-green-900/50"
                            : "bg-red-900/10 border-red-900/50"
                        }`}
                >
                    <p className="text-[10px] text-slate-500 uppercase font-bold">
                        PNL Global
                    </p>
                    <p
                        className={`text-2xl font-bold ${totalPnl >= 0 ? "text-green-400" : "text-red-400"
                            }`}
                    >
                        {totalPnl >= 0 ? "+" : ""}
                        {fmtUSD(totalPnl)}
                    </p>
                    <p
                        className={`text-sm font-bold mt-1 ${totalPnl >= 0 ? "text-green-500" : "text-red-500"
                            }`}
                    >
                        {totalRoi.toFixed(2)}%
                    </p>
                    <TrendingUp
                        className={`absolute right-4 top-4 w-10 h-10 opacity-20 ${totalPnl >= 0 ? "text-green-500" : "text-red-500"
                            }`}
                    />
                </div>
            </div>
        </div>
    )
);

SummaryCards.displayName = "SummaryCards";

export default SummaryCards;
