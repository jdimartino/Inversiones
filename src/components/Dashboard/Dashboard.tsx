import React, { useMemo } from "react";
import { ProcessedInvestment } from "../../lib/constants";
import { PriceDirection } from "../../hooks/usePrices";
import { FuturesData } from "../../lib/futures";
import { MultiExchangeLiqData } from "../../hooks/useLiquidationData";
import PortfolioHeader from "./PortfolioHeader";
import SpotSummaryCard from "./SpotSummaryCard";
import FuturesSummaryCard from "./FuturesSummaryCard";
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
    prevDailyCloses: Record<string, number>;
    selectedCoins: string[];
    onNavigateSpot: () => void;
    onNavigateFutures: () => void;
    onCoinClick: (coin: string) => void;
    onWatchlistChange: (coins: string[]) => void;
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
    prevDailyCloses,
    selectedCoins,
    onNavigateSpot,
    onNavigateFutures,
    onCoinClick,
    onWatchlistChange,
}) => {
    const loanStats = useMemo(() => {
        const calc = (data: typeof exchangeData.bybit) => ({
            debt: data.totalDebt ?? data.debts.reduce((s, d) => s + d.amount * d.price, 0),
            collateral: data.totalCollateral ?? data.collateral.reduce((s, c) => s + c.amount * c.price, 0),
        });
        const bybit = calc(exchangeData.bybit);
        const binance = calc(exchangeData.binance);
        const totalDebt = bybit.debt + binance.debt;
        const totalCollateral = bybit.collateral + binance.collateral;
        const totalLtv = totalCollateral > 0 ? (totalDebt / totalCollateral) * 100 : 0;
        return {
            totalDebt,
            totalCollateral,
            totalLtv,
            bybitDebt: bybit.debt,
            bybitCollateral: bybit.collateral,
            bybitLtv: bybit.collateral > 0 ? (bybit.debt / bybit.collateral) * 100 : 0,
            binanceDebt: binance.debt,
            binanceCollateral: binance.collateral,
            binanceLtv: binance.collateral > 0 ? (binance.debt / binance.collateral) * 100 : 0,
        };
    }, [exchangeData]);

    const futuresBalance = futuresData?.account?.totalWalletBalance ?? 0;
    const futuresPnl = futuresData?.account?.totalUnrealizedProfit ?? 0;
    const futuresMarginBalance = futuresData?.account?.totalMarginBalance ?? 0;
    const futuresTransferable = futuresData?.account?.maxWithdrawAmount ?? 0;

    return (
        <div className="space-y-2">
            <PortfolioHeader
                totalInvested={totalInvested}
                totalValue={totalValue}
                totalPnl={totalPnl}
                totalRoi={totalRoi}
                totalDebt={loanStats.totalDebt}
                totalCollateral={loanStats.totalCollateral}
                totalLtv={loanStats.totalLtv}
                bybitDebt={loanStats.bybitDebt}
                bybitCollateral={loanStats.bybitCollateral}
                bybitLtv={loanStats.bybitLtv}
                binanceDebt={loanStats.binanceDebt}
                binanceCollateral={loanStats.binanceCollateral}
                binanceLtv={loanStats.binanceLtv}
                futuresBalance={futuresBalance}
                futuresPnl={futuresPnl}
                futuresMarginBalance={futuresMarginBalance}
                futuresTransferable={futuresTransferable}
            />

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
                <div className="xl:col-span-3 h-full">
                    <MarketWatchCard
                        prices={prices}
                        priceDirections={priceDirections}
                        prevDailyCloses={prevDailyCloses}
                        selectedCoins={selectedCoins}
                        onCoinClick={onCoinClick}
                        onWatchlistChange={onWatchlistChange}
                    />
                </div>

                <div className="xl:col-span-4 h-full">
                    <SpotSummaryCard
                        sortedPortfolio={sortedPortfolio}
                        onNavigate={onNavigateSpot}
                        priceDirections={priceDirections}
                    />
                </div>

                <div className="xl:col-span-5 h-full">
                    <FuturesSummaryCard
                        futuresData={futuresData}
                        onNavigate={onNavigateFutures}
                        priceDirections={priceDirections}
                    />
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
