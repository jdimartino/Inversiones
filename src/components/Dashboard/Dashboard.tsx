import React from "react";
import { ProcessedInvestment, AggregatedAsset, ProcessedLoan } from "../../lib/constants";
import { PriceDirection } from "../../hooks/usePrices";
import { FuturesData } from "../../lib/futures";
import { MultiExchangeLiqData } from "../../hooks/useLiquidationData";
import PortfolioHeader from "./PortfolioHeader";
import SpotSummaryCard from "./SpotSummaryCard";
import FuturesSummaryCard from "./FuturesSummaryCard";
import LoansSummaryCard from "./LoansSummaryCard";
import MarketWatchCard from "./MarketWatchCard";

interface DashboardProps {
    totalInvested: number;
    totalValue: number;
    totalPnl: number;
    totalRoi: number;
    sortedPortfolio: ProcessedInvestment[];
    futuresData: FuturesData | null;
    exchangeData: MultiExchangeLiqData;
    prices: Record<string, number>;
    priceDirections: Record<string, PriceDirection>;
    selectedCoins: string[];
    onNavigateSpot: () => void;
    onNavigateFutures: () => void;
    onNavigateLoans: () => void;
    onCoinClick: (coin: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({
    totalInvested,
    totalValue,
    totalPnl,
    totalRoi,
    sortedPortfolio,
    futuresData,
    exchangeData,
    prices,
    priceDirections,
    selectedCoins,
    onNavigateSpot,
    onNavigateFutures,
    onNavigateLoans,
    onCoinClick,
}) => {
    return (
        <div className="space-y-4">
            <PortfolioHeader
                totalInvested={totalInvested}
                totalValue={totalValue}
                totalPnl={totalPnl}
                totalRoi={totalRoi}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SpotSummaryCard
                    sortedPortfolio={sortedPortfolio}
                    onNavigate={onNavigateSpot}
                />
                <FuturesSummaryCard
                    futuresData={futuresData}
                    onNavigate={onNavigateFutures}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <LoansSummaryCard
                    exchangeData={exchangeData}
                    onNavigate={onNavigateLoans}
                />
                <MarketWatchCard
                    prices={prices}
                    priceDirections={priceDirections}
                    selectedCoins={selectedCoins}
                    onCoinClick={onCoinClick}
                />
            </div>
        </div>
    );
};

export default Dashboard;
