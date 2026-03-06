import React from "react";
import { Wallet, DollarSign, PieChart, TrendingUp } from "lucide-react";
import { fmtUSD } from "../lib/format";

interface SummaryCardsProps {
    totalInvested: number;
    totalValue: number;
    totalPnl: number;
    totalRoi: number;
    hasActiveGlobalAlerts?: boolean;
    onOpenGlobalAlerts?: () => void;
}

const SummaryCards: React.FC<SummaryCardsProps> = React.memo(
    ({ totalInvested, totalValue, totalPnl, totalRoi, hasActiveGlobalAlerts, onOpenGlobalAlerts }) => (
        <div className="mb-8">
            <h2 className="text-xs font-bold text-slate-500 mb-4 uppercase tracking-widest flex items-center gap-2 border-b border-slate-800 pb-2">
                <Wallet className="w-4 h-4 text-blue-400" /> Resumen Spot
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 relative shadow-lg">
                    <p className="text-[10px] text-slate-500 uppercase font-bold relative z-10">
                        Total Invertido
                    </p>
                    <p className="text-2xl font-bold text-white relative z-10">
                        {fmtUSD(totalInvested)}
                    </p>
                    <DollarSign className="absolute right-4 top-4 text-slate-700 w-10 h-10 opacity-20 pointer-events-none" />
                </div>
                <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 relative shadow-lg">
                    <p className="text-[10px] text-slate-500 uppercase font-bold relative z-10">
                        Valor Actual
                    </p>
                    <p className="text-2xl font-bold text-blue-300 relative z-10">
                        {fmtUSD(totalValue)}
                    </p>
                    <PieChart className="absolute right-4 top-4 text-slate-700 w-10 h-10 opacity-20 pointer-events-none" />
                </div>
                <div
                    className={`p-5 rounded-xl border shadow-lg relative overflow-hidden ${totalPnl >= 0
                        ? "bg-green-900/10 border-green-900/50"
                        : "bg-red-900/10 border-red-900/50"
                        }`}
                >
                    <div className="flex items-center justify-between relative z-10">
                        <p className="text-[10px] text-slate-500 uppercase font-bold">
                            PNL Global
                        </p>
                        {onOpenGlobalAlerts && (
                            <button
                                onClick={onOpenGlobalAlerts}
                                className={`p-1.5 rounded-lg transition-colors border cursor-pointer ${hasActiveGlobalAlerts
                                    ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/20 hover:bg-yellow-500/20"
                                    : "text-slate-500 bg-slate-800 border-slate-700 hover:text-yellow-400 hover:bg-slate-700"
                                    }`}
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                                    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                                </svg>
                            </button>
                        )}
                    </div>
                    <p
                        className={`text-2xl font-bold relative z-10 ${totalPnl >= 0 ? "text-green-400" : "text-red-400"
                            }`}
                    >
                        {totalPnl >= 0 ? "+" : ""}
                        {fmtUSD(totalPnl)}
                    </p>
                    <p
                        className={`text-sm font-bold mt-1 relative z-10 ${totalPnl >= 0 ? "text-green-500" : "text-red-500"
                            }`}
                    >
                        {totalRoi.toFixed(2)}%
                    </p>
                    <TrendingUp
                        className={`absolute right-4 top-4 w-10 h-10 opacity-20 pointer-events-none ${totalPnl >= 0 ? "text-green-500" : "text-red-500"
                            }`}
                    />
                </div>
            </div>
        </div>
    )
);

SummaryCards.displayName = "SummaryCards";

export default SummaryCards;
