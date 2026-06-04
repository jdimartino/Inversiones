import React, { useMemo } from "react";
import { ArrowRight, AlertTriangle, CreditCard } from "lucide-react";
import { MultiExchangeLiqData } from "../../hooks/useLiquidationData";
import { RISK_PARAMS } from "../../lib/constants";
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
            className="w-full text-left bg-[#181A20] rounded-xl border border-gray-800 p-4 hover:border-yellow-500/40 hover:shadow-lg hover:shadow-yellow-500/5 transition-all group"
        >
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold flex items-center gap-2">
                    <span className="text-yellow-400">Préstamos</span>
                </h3>
                <ArrowRight
                    size={16}
                    className="text-gray-600 group-hover:text-yellow-400 transition-colors"
                />
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                    <div className="text-xs text-gray-500 mb-1">Deuda Total</div>
                    <div className="text-white text-lg font-bold">
                        {fmtUSD(stats.totalDebt)}
                    </div>
                </div>
                <div>
                    <div className="text-xs text-gray-500 mb-1">Colateral</div>
                    <div className="text-white text-lg font-bold">
                        {fmtUSD(stats.totalCollateral)}
                    </div>
                </div>
            </div>

            <div>
                <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                        <CreditCard size={10} /> LTV
                    </span>
                    <span className={`text-xs font-bold ${getLtvColor(stats.totalLtv)}`}>
                        {stats.totalLtv.toFixed(2)}%
                    </span>
                </div>
                <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all ${getLtvBarColor(stats.totalLtv)}`}
                        style={{ width: `${Math.min(stats.totalLtv, 100)}%` }}
                    />
                </div>
            </div>

            {stats.totalLtv > 70 && (
                <div className="mt-2 flex items-center gap-1 text-yellow-400 text-xs">
                    <AlertTriangle size={12} />
                    <span>¡LTV alto — riesgo de liquidación!</span>
                </div>
            )}
        </button>
    );
};

export default LoansSummaryCard;
