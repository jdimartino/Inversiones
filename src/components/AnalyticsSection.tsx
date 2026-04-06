import React, { useState, useEffect } from "react";
import { BarChart2, TrendingUp } from "lucide-react";
import { AggregatedAsset, ProcessedInvestment, ProcessedLoan } from "../lib/constants";
import type { CoinSignal, FearGreedData, Kline } from "../lib/types/signals";

// Chart components
import PortfolioDonut from "./charts/PortfolioDonut";
import PnlBarChart from "./charts/PnlBarChart";
import PerformanceTreemap from "./charts/PerformanceTreemap";
import IndividualTreemap from "./charts/IndividualTreemap";
import InvestmentTimeline from "./charts/InvestmentTimeline";
import CandlestickChart from "./charts/CandlestickChart";
import TechnicalSummary from "./charts/TechnicalSummary";
import FearGreedGauge from "./charts/FearGreedGauge";
import SignalCard from "./SignalCard";


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
    signals?: CoinSignal[];
    klinesMap?: Record<string, Kline[]>;
    fearGreed?: FearGreedData | null;
    fearGreedLoading?: boolean;
    initialCoin?: string;
}

const AnalyticsSection: React.FC<AnalyticsSectionProps> = ({
    aggregated,
    items,
    totalValue,
    signals = [],
    klinesMap = {},
    fearGreed = null,
    fearGreedLoading = false,
    initialCoin,
}) => {
    const [subTab, setSubTab] = useState<SubTab>("mercado");
    const [activeCoin, setActiveCoin] = useState<string>(initialCoin ?? "");

    useEffect(() => {
        if (initialCoin) setSubTab("mercado");
    }, [initialCoin]);

    if (aggregated.length === 0) return null;

    const hasKlines = Object.keys(klinesMap).length > 0;
    const hasSignals = signals.length > 0;

    return (
        <div className="mb-4">
            {/* Sub-navigation */}
            <div className="flex gap-1 mb-4 bg-slate-800/50 rounded-lg p-1 w-fit">
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

            {/* ── PORTAFOLIO ──────────────────────────────────── */}
            {subTab === "portafolio" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fadeIn">
                    <PortfolioDonut aggregated={aggregated} totalValue={totalValue} />
                    <PnlBarChart aggregated={aggregated} />
                    <PerformanceTreemap aggregated={aggregated} />
                    <IndividualTreemap items={items} />
                    <div className="md:col-span-2">
                        <InvestmentTimeline items={items} />
                    </div>
                </div>
            )}

            {/* ── MERCADO ─────────────────────────────────────── */}
            {subTab === "mercado" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fadeIn">
                    {hasKlines && (
                        <div className="md:col-span-2">
                            <CandlestickChart aggregated={aggregated} klinesMap={klinesMap} items={items} initialCoin={initialCoin} signals={signals} onCoinChange={setActiveCoin} />
                            {signals.find(s => s.coin === activeCoin) && (
                                <div className="mt-3">
                                    <SignalCard signal={signals.find(s => s.coin === activeCoin)!} />
                                </div>
                            )}
                        </div>
                    )}
                    {hasSignals && <TechnicalSummary signals={signals} />}
                    <FearGreedGauge data={fearGreed} loading={fearGreedLoading} />
                    {!hasKlines && !hasSignals && (
                        <div className="md:col-span-2 bg-slate-800 rounded-xl border border-slate-700 p-8 text-center">
                            <p className="text-slate-500 text-xs">
                                Los datos de mercado se cargan desde la pestaña "Señales".
                                Visita esa pestaña primero para activar los gráficos de mercado.
                            </p>
                        </div>
                    )}
                </div>
            )}

        </div>
    );
};

export default AnalyticsSection;
