import React, { useState, useEffect, useMemo, memo } from "react";
import { BarChart2, TrendingUp } from "lucide-react";
import { AggregatedAsset, ProcessedInvestment, ProcessedLoan, SaleRecord } from "../lib/constants";
import type { FearGreedData } from "../lib/types/signals";
import type { FuturesData } from "../lib/futures";

// Chart components
import PortfolioDonut from "./charts/PortfolioDonut";
import PnlBarChart from "./charts/PnlBarChart";
import PerformanceTreemap from "./charts/PerformanceTreemap";
import IndividualTreemap from "./charts/IndividualTreemap";
import InvestmentTimeline from "./charts/InvestmentTimeline";
import CandlestickChart from "./charts/CandlestickChart";
import FearGreedGauge from "./charts/FearGreedGauge";
import PositionBubble from "./charts/PositionBubble";
import LtvGauges from "./charts/LtvGauges";
import AITraderAnalysis from "./AITraderAnalysis";


// ── Sub-tab types ────────────────────────────────────────────────────
type SubTab = "portafolio" | "mercado";

const SUB_TABS: { id: SubTab; label: string; icon: React.ReactNode }[] = [
    { id: "mercado", label: "Mercado", icon: <TrendingUp className="w-3.5 h-3.5" /> },
    { id: "portafolio", label: "Portafolio", icon: <BarChart2 className="w-3.5 h-3.5" /> },
];

// ── Props ────────────────────────────────────────────────────────────
interface AnalyticsSectionProps {
    aggregated: AggregatedAsset[];
    items: ProcessedInvestment[];
    loans: ProcessedLoan[];
    totalValue: number;
    totalInvested: number;
    fearGreed?: FearGreedData | null;
    fearGreedLoading?: boolean;
    initialCoin?: string;
    priceDirections?: Record<string, "up" | "down" | "neutral">;
    sales?: SaleRecord[];
    futuresData?: FuturesData | null;
}

const AnalyticsSection: React.FC<AnalyticsSectionProps> = ({
    aggregated,
    items,
    loans,
    totalValue,
    fearGreed = null,
    fearGreedLoading = false,
    initialCoin,
    priceDirections = {},
    sales = [],
    futuresData = null,
}) => {
    const [subTab, setSubTab] = useState<SubTab>("mercado");
    const [viewMode, setViewMode] = useState<"spot" | "futures" | "combined">("spot");
    const [activeCoin, setActiveCoin] = useState<string>(initialCoin ?? "");

    const futuresAggregated = useMemo(() => {
        if (!futuresData?.positions) return [];
        const map = new Map<string, { totalQty: number; totalInvested: number; currentValue: number; pnl: number }>();

        for (const pos of futuresData.positions) {
            const qty = Math.abs(pos.size);
            const invested = pos.initialMargin;
            const currentValue = pos.initialMargin + pos.unrealizedPnl;
            const pnl = pos.unrealizedPnl;
            const coin = pos.symbol.replace("USDT", "");
            
            const entry = map.get(coin) || { totalQty: 0, totalInvested: 0, currentValue: 0, pnl: 0 };
            entry.totalQty += qty;
            entry.totalInvested += invested;
            entry.currentValue += currentValue;
            entry.pnl += pnl;
            map.set(coin, entry);
        }

        return Array.from(map.entries()).map(([coin, data]) => ({
            coin: `${coin} (F)`,
            totalQty: data.totalQty,
            totalInvested: data.totalInvested,
            avgBuyPrice: data.totalQty > 0 ? data.totalInvested / data.totalQty : 0,
            currentPrice: data.totalQty > 0 ? data.currentValue / data.totalQty : 0,
            currentValue: data.currentValue,
            pnl: data.pnl,
            priceDiffPercent: data.totalInvested > 0 ? (data.pnl / data.totalInvested) * 100 : 0,
        }));
    }, [futuresData]);

    const viewData = useMemo(() => {
        let currentAggregated = aggregated;
        let currentTotalValue = totalValue;

        if (viewMode === "futures") {
            currentAggregated = futuresAggregated;
            currentTotalValue = futuresData?.account.totalMarginBalance ?? 0;
        } else if (viewMode === "combined") {
            const map = new Map<string, AggregatedAsset>();
            for (const asset of aggregated) map.set(asset.coin, { ...asset });
            for (const asset of futuresAggregated) {
                const existing = map.get(asset.coin);
                if (existing) {
                    existing.totalQty += asset.totalQty;
                    existing.totalInvested += asset.totalInvested;
                    existing.currentValue += asset.currentValue;
                    existing.pnl += asset.pnl;
                    existing.avgBuyPrice = existing.totalQty > 0 ? existing.totalInvested / existing.totalQty : 0;
                    existing.currentPrice = existing.totalQty > 0 ? existing.currentValue / existing.totalQty : 0;
                    existing.priceDiffPercent = existing.totalInvested > 0 ? (existing.pnl / existing.totalInvested) * 100 : 0;
                } else {
                    map.set(asset.coin, { ...asset });
                }
            }
            currentAggregated = Array.from(map.values()).sort((a,b) => b.pnl - a.pnl);
            currentTotalValue = totalValue + (futuresData?.account.totalMarginBalance ?? 0);
        }
        
        return { aggregated: currentAggregated, totalValue: currentTotalValue };
    }, [viewMode, aggregated, totalValue, futuresAggregated, futuresData]);

    useEffect(() => {
        if (initialCoin) setSubTab("mercado");
    }, [initialCoin]);

    if (aggregated.length === 0 && futuresAggregated.length === 0) return null;

    const activeCoinName = activeCoin || (aggregated[0]?.coin ?? "").replace(/ \(F\)$/, "");
    const activeCoinPrice = viewData.aggregated.find(a => a.coin === activeCoinName || a.coin === activeCoin)?.currentPrice ?? 0;

    return (
        <div className="mb-4">
            {/* Sub-navigation */}
            <div className="flex flex-col sm:flex-row gap-4 mb-4">
                <div className="flex gap-1 bg-slate-800/50 rounded-lg p-1 w-fit">
                    {SUB_TABS.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setSubTab(tab.id)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
                                subTab === tab.id
                                    ? "bg-yellow-600 text-white shadow-md"
                                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
                            }`}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </div>
                
                {subTab === "portafolio" && futuresData && (
                    <div className="flex gap-1 bg-slate-800/50 rounded-lg p-1 w-fit">
                        {(["spot", "futures", "combined"] as const).map((mode) => (
                            <button
                                key={mode}
                                onClick={() => setViewMode(mode)}
                                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors capitalize ${
                                    viewMode === mode
                                        ? "bg-blue-600 text-white"
                                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
                                }`}
                            >
                                {mode}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* ── PORTAFOLIO ──────────────────────────────────── */}
            {subTab === "portafolio" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fadeIn overflow-x-hidden">
                    <PortfolioDonut aggregated={viewData.aggregated} totalValue={viewData.totalValue} />
                    <PnlBarChart aggregated={viewData.aggregated} />
                    <PerformanceTreemap aggregated={viewData.aggregated} />
                    {viewMode !== "futures" && <IndividualTreemap items={items} />}
                    <PositionBubble aggregated={viewData.aggregated} />
                    {viewMode !== "futures" && (
                        <>
                            <div className="md:col-span-2">
                                <InvestmentTimeline items={items} />
                            </div>
                            <div className="md:col-span-2">
                                <LtvGauges loans={loans} />
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ── MERCADO ─────────────────────────────────────── */}
            {subTab === "mercado" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fadeIn overflow-x-hidden">
                    <div className="md:col-span-2">
                        <CandlestickChart aggregated={aggregated} items={items} initialCoin={initialCoin} onCoinChange={setActiveCoin} priceDirections={priceDirections} sales={sales} futuresPositions={futuresData?.positions} />
                        <AITraderAnalysis
                            coin={activeCoin || (aggregated[0]?.coin ?? "").replace(/ \(F\)$/, "")}
                            price={activeCoinPrice}
                            fearGreed={fearGreed}
                        />
                    </div>
                    <FearGreedGauge data={fearGreed} loading={fearGreedLoading} />
                </div>
            )}

        </div>
    );
};

export default memo(AnalyticsSection);
