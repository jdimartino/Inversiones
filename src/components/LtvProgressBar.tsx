import React from "react";
import { RISK_PARAMS } from "../lib/constants";

interface LtvProgressBarProps {
    ltv: number;
    exchange: string;
}

const LtvProgressBar: React.FC<LtvProgressBarProps> = React.memo(
    ({ ltv, exchange }) => {
        const params = RISK_PARAMS[exchange] || RISK_PARAMS["Binance"];
        const posInit = params.initial;
        const posMargin = params.marginCall;
        const posLiq = params.liquidation;

        let statusColor = "bg-green-500";
        let statusText = "Riesgo Bajo";

        if (ltv > posInit) {
            statusColor = "bg-yellow-500";
            statusText = "Riesgo Medio";
        }
        if (ltv > posMargin) {
            statusColor = "bg-red-500 animate-pulse";
            statusText = "ALTO RIESGO";
        }

        const visualLtv = Math.min(Math.max(ltv, 0), 100);

        return (
            <div className="mt-4 mb-6 select-none">
                <div className="flex justify-between items-end mb-2">
                    <div className="flex flex-col">
                        <span className="text-[10px] text-slate-400 uppercase font-bold">
                            LTV Actual
                        </span>
                        <span
                            className={`text-lg font-bold ${ltv > posMargin ? "text-red-500" : "text-white"
                                }`}
                        >
                            {ltv.toFixed(2)}%
                        </span>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] text-slate-400 uppercase font-bold">
                            Estado
                        </span>
                        <span
                            className={`text-xs font-bold px-2 py-0.5 rounded ${ltv > posMargin
                                    ? "bg-red-500/20 text-red-400"
                                    : ltv > posInit
                                        ? "bg-yellow-500/20 text-yellow-400"
                                        : "bg-green-500/20 text-green-400"
                                }`}
                        >
                            {statusText}
                        </span>
                    </div>
                </div>

                <div className="relative h-4 w-full bg-slate-900 rounded-full flex items-center px-1 border border-slate-700">
                    <div
                        className="absolute left-0 top-0 bottom-0 bg-green-900/10 rounded-l-full"
                        style={{ width: `${posInit}%` }}
                    />
                    <div
                        className="absolute top-0 bottom-0 bg-yellow-900/10"
                        style={{
                            left: `${posInit}%`,
                            width: `${posMargin - posInit}%`,
                        }}
                    />
                    <div
                        className="absolute right-0 top-0 bottom-0 bg-red-900/10 rounded-r-full"
                        style={{
                            left: `${posMargin}%`,
                            width: `${100 - posMargin}%`,
                        }}
                    />

                    <div
                        className={`absolute top-1 bottom-1 left-1 rounded-full ${statusColor} transition-all duration-1000 shadow-[0_0_10px_rgba(0,0,0,0.5)]`}
                        style={{ width: `calc(${visualLtv}% - 4px)` }}
                    />

                    <div
                        className="absolute top-0 bottom-0 w-0.5 bg-slate-600 z-10"
                        style={{ left: `${posMargin}%` }}
                    >
                        <div className="absolute -top-4 -translate-x-1/2 text-[9px] text-yellow-600 font-mono font-bold">
                            {posMargin}%
                        </div>
                        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 bg-slate-800 border-2 border-yellow-600 rounded-full" />
                    </div>

                    <div
                        className="absolute top-0 bottom-0 w-0.5 bg-red-900 z-10"
                        style={{ left: `${posLiq}%` }}
                    >
                        <div className="absolute -top-4 -translate-x-1/2 text-[9px] text-red-500 font-mono font-bold">
                            {posLiq}%
                        </div>
                        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 bg-slate-800 border-2 border-red-500 rounded-full" />
                    </div>
                </div>

                <div className="flex justify-between text-[9px] text-slate-500 mt-1 px-1 font-mono">
                    <span>0%</span>
                    <span className="text-red-400 font-bold uppercase underline">
                        LIQUIDACIÓN {posLiq}%
                    </span>
                </div>
            </div>
        );
    }
);

LtvProgressBar.displayName = "LtvProgressBar";

export default LtvProgressBar;
