import React from "react";
import { FuturesData } from "../../lib/futures";
import { PriceDirection } from "../../hooks/usePrices";

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

    const { account, positions } = futuresData;
    const openPositions = positions.length;

    return (
        <button
            onClick={onNavigate}
            className="w-full h-full text-left bg-[#181A20] rounded-xl border border-slate-700/50 shadow-sm shadow-black/10 p-3 hover:border-yellow-500/30 hover:shadow-yellow-500/5 transition-all group flex flex-col justify-start"
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
                <div className="mt-3 border-t border-gray-800 pt-2">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <colgroup>
                                <col className="w-[10%] md:w-[7%]" />
                                <col className="w-[22%] md:w-[14%]" />
                                <col className="w-0 md:w-[16%]" />
                                <col className="w-0 md:w-[16%]" />
                                <col className="w-0 md:w-[16%]" />
                                <col className="w-[30%] md:w-[13%]" />
                                <col className="w-0 md:w-[8%]" />
                                <col className="w-[38%] md:w-[10%]" />
                            </colgroup>
                            <thead>
                                <tr className="text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-800">
                                    <th className="text-center md:text-left pb-2 font-medium">Tipo</th>
                                    <th className="text-center md:text-left pb-2 font-medium">Activo</th>
                                    <th className="text-right pb-2 font-medium hidden md:table-cell">Entrada</th>
                                    <th className="text-right pb-2 font-medium hidden md:table-cell">Actual</th>
                                    <th className="text-right pb-2 font-medium hidden md:table-cell">Liq</th>
                                    <th className="text-center md:text-right pb-2 font-medium">Valor</th>
                                    <th className="text-right pb-2 font-medium hidden md:table-cell">Margen</th>
                                    <th className="text-center md:text-right pb-2 font-medium">PnL</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...positions]
                                    .sort((a, b) => b.unrealizedPnl - a.unrealizedPnl)
                                    .map((pos) => {
                                    const baseAsset = pos.symbol.replace('USDT', '');
                                    const actualColor = priceDirections[baseAsset] === 'up' ? 'text-green-400' : priceDirections[baseAsset] === 'down' ? 'text-red-400' : 'text-white';
                                    return (
                                    <tr key={pos.symbol} className="border-b border-gray-800/50">
                                        <td className={`py-1.5 text-[11px] md:text-xs font-bold text-center md:text-left ${pos.side === 'LONG' ? 'text-green-400' : 'text-red-400'}`}>
                                            {pos.side}
                                        </td>
                                        <td className="py-1.5 text-[11px] md:text-xs font-semibold text-center md:text-left">
                                            {pos.symbol} <span className="text-[9px] text-gray-500">{pos.leverage}x</span>
                                        </td>
                                        <td className="py-1.5 text-right font-mono text-[11px] tabular-nums hidden md:table-cell">
                                            ${pos.entryPrice.toLocaleString()}
                                        </td>
                                        <td className={`py-1.5 text-right font-mono text-[11px] tabular-nums hidden md:table-cell ${actualColor}`}>
                                            ${pos.markPrice.toLocaleString()}
                                        </td>
                                        <td className="py-1.5 text-right font-mono text-[11px] tabular-nums text-red-400/70 hidden md:table-cell">
                                            ${pos.liquidationPrice.toLocaleString()}
                                        </td>
                                        <td className="py-1.5 text-center md:text-right font-mono text-[11px] tabular-nums">${pos.notional.toFixed(2)}</td>
                                        <td className="py-1.5 text-right font-mono text-[11px] tabular-nums hidden md:table-cell">${pos.maintMargin.toFixed(2)}</td>
                                        <td className={`py-1.5 text-center md:text-right font-mono text-[11px] tabular-nums font-bold ${pos.unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                            <div>{pos.unrealizedPnl >= 0 ? '+' : ''}{pos.unrealizedPnl.toFixed(2)}</div>
                                            <div className="text-[10px] font-normal">({pos.roe >= 0 ? '+' : ''}{pos.roe.toFixed(2)}%)</div>
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
