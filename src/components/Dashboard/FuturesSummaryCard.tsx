import React from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { FuturesData } from "../../lib/futures";
import { fmtUSD } from "../../lib/format";
import { getMarginColor } from "../../lib/futures";
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
    const totalPnl = account.totalUnrealizedProfit;
    const isPositive = totalPnl >= 0;
    const marginRatio = account.marginRatio ?? 0;
    const marginColor = getMarginColor(marginRatio);

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

            <div className="flex items-center justify-evenly text-xs">
                <div className="text-center">
                    <div className="text-gray-500">Balance</div>
                    <div className="text-white font-bold">{fmtUSD(account.totalWalletBalance)}</div>
                </div>
                <div className="text-center">
                    <div className="text-gray-500">PnL</div>
                    <div className={`font-bold flex items-center justify-center gap-1 ${isPositive ? "text-green-400" : "text-red-400"}`}>
                        {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        {fmtUSD(totalPnl)}
                    </div>
                </div>
                <div className="text-center">
                    <div className="text-gray-500">Saldo del margen</div>
                    <div className="text-white font-bold">{fmtUSD(account.totalMarginBalance)}</div>
                </div>
                <div className="text-center">
                    <div className="text-gray-500">Transferible</div>
                    <div className="text-white font-bold">{fmtUSD(account.availableBalance)}</div>
                </div>
                <div className="text-center">
                    <div className="text-gray-500">Margen Cross</div>
                    <div className={`font-bold ${marginColor}`}>{marginRatio.toFixed(2)}%</div>
                </div>
            </div>

            {positions.length > 0 && (
                <div className="mt-3 border-t border-gray-800 pt-2">
                    <table className="w-full">
                        <colgroup>
                            <col className="w-[7%]" />
                            <col className="w-[14%]" />
                            <col className="w-[16%]" />
                            <col className="w-[16%]" />
                            <col className="w-[16%]" />
                            <col className="w-[13%]" />
                            <col className="w-[8%]" />
                            <col className="w-[10%]" />
                        </colgroup>
                        <thead>
                            <tr className="text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-800">
                                <th className="text-left pb-2 font-medium">Tipo</th>
                                <th className="text-left pb-2 font-medium">Activo</th>
                                <th className="text-right pb-2 font-medium">Entrada</th>
                                <th className="text-right pb-2 font-medium">Actual</th>
                                <th className="text-right pb-2 font-medium">Liq</th>
                                <th className="text-right pb-2 font-medium">Valor</th>
                                <th className="text-right pb-2 font-medium">Margen</th>
                                <th className="text-right pb-2 font-medium">PnL</th>
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
                                    <td className={`py-1.5 text-xs font-bold ${pos.side === 'LONG' ? 'text-green-400' : 'text-red-400'}`}>
                                        {pos.side}
                                    </td>
                                    <td className="py-1.5 text-xs font-semibold">
                                        {pos.symbol} <span className="text-[9px] text-gray-500">{pos.leverage}x</span>
                                    </td>
                                    <td className="py-1.5 text-right font-mono text-[11px] tabular-nums">
                                        ${pos.entryPrice.toLocaleString()}
                                    </td>
                                    <td className={`py-1.5 text-right font-mono text-[11px] tabular-nums ${actualColor}`}>
                                        ${pos.markPrice.toLocaleString()}
                                    </td>
                                    <td className="py-1.5 text-right font-mono text-[11px] tabular-nums text-red-400/70">
                                        ${pos.liquidationPrice.toLocaleString()}
                                    </td>
                                    <td className="py-1.5 text-right font-mono text-[11px] tabular-nums">${pos.notional.toFixed(2)}</td>
                                    <td className="py-1.5 text-right font-mono text-[11px] tabular-nums">${pos.maintMargin.toFixed(2)}</td>
                                    <td className={`py-1.5 text-right font-mono text-[11px] tabular-nums font-bold ${pos.unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                        <div>{pos.unrealizedPnl >= 0 ? '+' : ''}{pos.unrealizedPnl.toFixed(2)}</div>
                                        <div className="text-[10px] font-normal">({pos.roe >= 0 ? '+' : ''}{pos.roe.toFixed(2)}%)</div>
                                    </td>
                                </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </button>
    );
};

export default FuturesSummaryCard;
