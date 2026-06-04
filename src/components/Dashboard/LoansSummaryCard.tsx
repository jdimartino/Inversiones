import React, { useMemo } from "react";
import { ArrowRight, AlertTriangle, CreditCard } from "lucide-react";
import { MultiExchangeLiqData } from "../../hooks/useLiquidationData";
import { fmtUSD } from "../../lib/format";

interface LoansSummaryCardProps {
    exchangeData: MultiExchangeLiqData;
    onNavigate: () => void;
}

function getLtvColor(ltv: number): string {
    if (ltv < 50) return "text-green-400";
    if (ltv < 75) return "text-yellow-400";
    return "text-red-400";
}

function getLtvBarColor(ltv: number): string {
    if (ltv < 50) return "bg-green-500";
    if (ltv < 75) return "bg-yellow-500";
    return "bg-red-500";
}

const LoansSummaryCard: React.FC<LoansSummaryCardProps> = ({
    exchangeData,
    onNavigate,
}) => {
    const stats = useMemo(() => {
        let totalDebt = 0;
        let totalCollateral = 0;
        let totalLtv = 0;

        for (const exchange of [exchangeData.bybit, exchangeData.binance]) {
            const debt = exchange.debts.reduce((sum, d) => sum + d.amount * d.price, 0);
            const collateral = exchange.collateral.reduce(
                (sum, c) => sum + c.amount * c.price,
                0
            );
            totalDebt += debt;
            totalCollateral += collateral;
        }

        totalLtv = totalCollateral > 0 ? (totalDebt / totalCollateral) * 100 : 0;

        return { totalDebt, totalCollateral, totalLtv };
    }, [exchangeData]);

    return (
        <button
            onClick={onNavigate}
            className="w-full text-left bg-[#181A20] rounded-xl border border-slate-700/50 shadow-sm shadow-black/10 p-3 hover:border-yellow-500/30 hover:shadow-yellow-500/5 transition-all group"
        >
            <div className="relative flex items-center justify-center mb-2">
                <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                    <span className="text-yellow-400">Préstamos</span>
                </h3>
                <ArrowRight
                    size={14}
                    className="absolute right-0 text-gray-600 group-hover:text-yellow-400 transition-colors"
                />
            </div>

            <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                    <div className="text-[10px] text-gray-500 mb-0.5">Deuda Total</div>
                    <div className="text-white text-sm font-bold">
                        {fmtUSD(stats.totalDebt)}
                    </div>
                </div>
                <div>
                    <div className="text-[10px] text-gray-500 mb-0.5">Colateral</div>
                    <div className="text-white text-sm font-bold">
                        {fmtUSD(stats.totalCollateral)}
                    </div>
                </div>
            </div>

            <div>
                <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] text-gray-500 flex items-center gap-1">
                        <CreditCard size={9} /> LTV
                    </span>
                    <span className={`text-[10px] font-bold ${getLtvColor(stats.totalLtv)}`}>
                        {stats.totalLtv.toFixed(2)}%
                    </span>
                </div>
                <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all ${getLtvBarColor(stats.totalLtv)}`}
                        style={{ width: `${Math.min(stats.totalLtv, 100)}%` }}
                    />
                </div>
            </div>

            {stats.totalLtv > 70 && (
                <div className="mt-1 flex items-center gap-1 text-yellow-400 text-[10px]">
                    <AlertTriangle size={10} />
                    <span>¡LTV alto — riesgo de liquidación!</span>
                </div>
            )}
        </button>
    );
};

export default LoansSummaryCard;
