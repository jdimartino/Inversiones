import React from "react";
import { FuturesData } from "../../lib/futures";
import { PriceDirection } from "../../hooks/usePrices";
import { fmtPrice, fmtUSD } from "../../lib/format";

interface FuturesSummaryCardProps {
    futuresData: FuturesData | null;
    onNavigate: () => void;
    priceDirections: Record<string, PriceDirection>;
}

const FuturesSummaryCard: React.FC<FuturesSummaryCardProps> = ({
    futuresData,
    onNavigate,
    priceDirections,
}) => {
    if (!futuresData) {
        return (
            <div className="bg-[#181A20] rounded-xl border border-slate-700/50 shadow-sm shadow-black/10 p-3">
                <h3 className="text-white font-semibold text-sm text-center mb-2">
                    <span className="text-yellow-400">Futuros</span>
                </h3>
                <p className="text-gray-600 text-xs text-center">Sin datos de futuros</p>
            </div>
        );
    }

    const { positions } = futuresData;
    const openPositions = positions.length;

    return (
        <button
            onClick={onNavigate}
            className="w-full text-left bg-[#181A20] rounded-xl border border-slate-700/50 shadow-sm shadow-black/10 p-3 hover:border-yellow-500/30 hover:shadow-yellow-500/5 transition-all group flex flex-col justify-start"
        >
            <div className="flex items-center justify-center mb-2">
                <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                    <span className="text-yellow-400">Futuros</span>
                    <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded-full">
                        {openPositions} posiciones
                    </span>
                </h3>
            </div>

            {positions.length > 0 && (
                <div className="mt-2 border-t border-gray-800 pt-2 -mx-0.5">
                    <div className="overflow-x-hidden">
                        <table className="w-full text-[11px] md:text-xs">
                            <colgroup>
                                <col className="w-[10%]" />
                                <col className="w-[22%]" />
                                <col className="w-[18%]" />
                                <col className="w-[18%]" />
                                <col className="hidden md:table-column w-[13%]" />
                                <col className="hidden md:table-column w-[11%]" />
                                <col className="hidden lg:table-column w-[0%]" />
                                <col className="w-[8%]" />
                            </colgroup>
                            <thead>
                                <tr className="text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-800">
                                    <th className="text-center md:text-left pb-2 font-medium whitespace-nowrap">Tipo</th>
                                    <th className="text-center md:text-left pb-2 font-medium whitespace-nowrap">Activo</th>
                                    <th className="text-center md:text-right pb-2 font-medium whitespace-nowrap">Entrada</th>
                                    <th className="text-center md:text-right pb-2 font-medium whitespace-nowrap">Actual</th>
                                    <th className="text-center md:text-right pb-2 font-medium whitespace-nowrap hidden md:table-cell">Liq</th>
                                    <th className="text-center md:text-right pb-2 font-medium whitespace-nowrap hidden md:table-cell">Valor</th>
                                    <th className="text-right pb-2 font-medium whitespace-nowrap hidden lg:table-cell">Margen</th>
                                    <th className="text-center md:text-right pb-2 font-medium whitespace-nowrap pr-2">PnL</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...positions]
                                    .sort((a, b) => b.unrealizedPnl - a.unrealizedPnl)
                                    .map((pos) => {
                                    const baseAsset = pos.symbol.replace('USDT', '');
                                    const actualColor = priceDirections[baseAsset] === 'up' ? 'text-green-400' : priceDirections[baseAsset] === 'down' ? 'text-red-400' : 'text-white';
                                    return (
                                    <tr key={`${pos.symbol}-${pos.side}`} className="border-b border-gray-800/50">
                                        <td className={`py-1.5 font-bold text-center md:text-left whitespace-nowrap ${pos.side === 'LONG' ? 'text-green-400' : 'text-red-400'}`}>
                                            {pos.side}
                                        </td>
                                        <td className="py-1.5 font-semibold text-center md:text-left whitespace-nowrap overflow-hidden truncate">
                                            {pos.symbol} <span className="text-[9px] text-gray-500">{pos.leverage}x</span>
                                        </td>
                                        <td className="py-1.5 text-center md:text-right font-mono tabular-nums whitespace-nowrap">
                                            {fmtPrice(pos.entryPrice)}
                                        </td>
                                        <td className={`py-1.5 text-center md:text-right font-mono tabular-nums whitespace-nowrap ${actualColor}`}>
                                            {fmtPrice(pos.markPrice)}
                                        </td>
                                        <td className="py-1.5 text-center md:text-right font-mono tabular-nums text-red-400/70 whitespace-nowrap hidden md:table-cell overflow-hidden truncate">
                                            {pos.liquidationPrice > 0 ? fmtPrice(pos.liquidationPrice) : "—"}
                                        </td>
                                        <td className="py-1.5 text-center md:text-right font-mono tabular-nums whitespace-nowrap hidden md:table-cell overflow-hidden truncate">{fmtUSD(pos.notional)}</td>
                                        <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap hidden lg:table-cell overflow-hidden truncate">{fmtUSD(pos.initialMargin)}</td>
                                        <td className={`py-1.5 text-center md:text-right font-mono tabular-nums font-bold whitespace-nowrap pr-2 overflow-hidden ${pos.unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                            <div className="truncate">{pos.unrealizedPnl >= 0 ? '+' : ''}{fmtUSD(pos.unrealizedPnl)}</div>
                                            <div className="text-[10px] font-normal truncate">({pos.roe >= 0 ? '+' : ''}{pos.roe.toFixed(2)}%)</div>
                                        </td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </button>
    );
};

export default FuturesSummaryCard;
