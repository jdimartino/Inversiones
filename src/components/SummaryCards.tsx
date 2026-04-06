import React from "react";
import { Wallet } from "lucide-react";
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
        <div className="mb-3">
            <div className="flex items-center gap-4 border-b border-slate-800 pb-2 mb-3">
                <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest hidden sm:flex items-center gap-2 shrink-0">
                    <Wallet className="w-4 h-4 text-blue-400" /> Resumen Spot
                </h2>
                <div className="flex items-center gap-4 text-sm flex-wrap">
                    <span className="text-slate-500 text-xs uppercase font-bold">Invertido:&nbsp;
                        <span className="text-white font-bold normal-case">{fmtUSD(totalInvested)}</span>
                    </span>
                    <span className="text-slate-600">·</span>
                    <span className="text-slate-500 text-xs uppercase font-bold">Valor:&nbsp;
                        <span className="text-blue-300 font-bold normal-case">{fmtUSD(totalValue)}</span>
                    </span>
                    <span className="text-slate-600">·</span>
                    <span className="text-slate-500 text-xs uppercase font-bold">PNL:&nbsp;
                        <span className={`font-bold normal-case ${totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {totalPnl >= 0 ? "+" : ""}{fmtUSD(totalPnl)}
                        </span>
                        <span className={`ml-1 font-bold normal-case ${totalPnl >= 0 ? "text-green-500" : "text-red-500"}`}>
                            ({totalRoi.toFixed(2)}%)
                        </span>
                    </span>
                </div>
                {onOpenGlobalAlerts && (
                    <button
                        onClick={onOpenGlobalAlerts}
                        className={`ml-auto shrink-0 p-1 rounded-lg transition-colors border cursor-pointer ${hasActiveGlobalAlerts
                            ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/20 hover:bg-yellow-500/20"
                            : "text-slate-500 bg-slate-800 border-slate-700 hover:text-yellow-400 hover:bg-slate-700"
                            }`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                        </svg>
                    </button>
                )}
            </div>
        </div>
    )
);

SummaryCards.displayName = "SummaryCards";

export default SummaryCards;
