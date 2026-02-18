import React, { useState, useMemo, useCallback } from "react";
import { Activity, RefreshCw } from "lucide-react";
import { RISK_PARAMS } from "./lib/constants";
import { ProcessedInvestment, ProcessedLoan, Loan, AggregatedAsset } from "./lib/constants";
import AggregatedTable from "./components/AggregatedTable";
import { usePortfolio } from "./hooks/usePortfolio";
import { useLoans } from "./hooks/useLoans";
import { usePrices } from "./hooks/usePrices";
import SummaryCards from "./components/SummaryCards";
import AssetTable from "./components/AssetTable";
import { LoanSection } from "./components/LoanCard";
import InvestmentForm from "./components/InvestmentForm";
import LoanForm from "./components/LoanForm";
import EditLoanModal from "./components/EditLoanModal";

const App: React.FC = () => {
  const { portfolio, addInvestment, removeInvestment } = usePortfolio();
  const { loans, addLoan, updateLoan, removeLoan } = useLoans();
  const { prices, loading, refresh } = usePrices();
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);

  // ── Computed data (memoized) ──────────────────────────────────────
  const sortedPortfolio = useMemo<ProcessedInvestment[]>(() => {
    return portfolio
      .map((item) => {
        const currentPrice = prices[item.coin] || item.buyPrice;
        const currentValue = item.quantity * currentPrice;
        const profit = currentValue - item.invested;
        const roi = item.invested > 0 ? (profit / item.invested) * 100 : 0;
        return { ...item, currentPrice, currentValue, profit, roi };
      })
      .sort((a, b) => b.profit - a.profit);
  }, [portfolio, prices]);

  const { totalInvested, totalValue, totalPnl, totalRoi } = useMemo(() => {
    const inv = sortedPortfolio.reduce((a, b) => a + b.invested, 0);
    const val = sortedPortfolio.reduce((a, b) => a + b.currentValue, 0);
    const pnl = val - inv;
    return {
      totalInvested: inv,
      totalValue: val,
      totalPnl: pnl,
      totalRoi: inv > 0 ? (pnl / inv) * 100 : 0,
    };
  }, [sortedPortfolio]);

  const aggregatedList = useMemo<AggregatedAsset[]>(() => {
    const map = new Map<string, { totalQty: number; totalInvested: number }>();

    for (const item of portfolio) {
      const entry = map.get(item.coin) || { totalQty: 0, totalInvested: 0 };
      entry.totalQty += item.quantity;
      entry.totalInvested += item.invested;
      map.set(item.coin, entry);
    }

    return Array.from(map.entries())
      .map(([coin, { totalQty, totalInvested }]) => {
        const avgBuyPrice = totalQty > 0 ? totalInvested / totalQty : 0;
        const currentPrice = prices[coin] ?? 0;
        const currentValue = totalQty * currentPrice;
        const pnl = currentValue - totalInvested;
        const priceDiffPercent =
          avgBuyPrice > 0
            ? ((currentPrice - avgBuyPrice) / avgBuyPrice) * 100
            : 0;
        return {
          coin,
          totalQty,
          totalInvested,
          avgBuyPrice,
          currentPrice,
          currentValue,
          pnl,
          priceDiffPercent,
        };
      })
      .sort((a, b) => b.pnl - a.pnl);
  }, [portfolio, prices]);

  const processedLoans = useMemo<ProcessedLoan[]>(() => {
    return loans.map((loan) => {
      const colVal = loan.collateralQty * (prices[loan.collateralCoin] || 0);
      const ltv = colVal > 0 ? (loan.borrowedUSDT / colVal) * 100 : 0;
      const params = RISK_PARAMS[loan.exchange] || RISK_PARAMS["Binance"];
      const liquidationPrice =
        (loan.borrowedUSDT * 100) / (params.liquidation * loan.collateralQty);
      return { ...loan, collateralValue: colVal, ltv, liquidationPrice };
    });
  }, [loans, prices]);

  // ── Callbacks ─────────────────────────────────────────────────────
  const handleEditLoan = useCallback((loan: ProcessedLoan) => {
    setEditingLoan(loan);
  }, []);

  const handleSaveLoan = useCallback(
    async (
      id: string,
      updates: { collateralQty: number; borrowedUSDT: number; apy: number }
    ) => {
      await updateLoan(id, updates);
    },
    [updateLoan]
  );

  const handleCloseModal = useCallback(() => {
    setEditingLoan(null);
  }, []);

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-3 md:p-8 font-sans pb-40">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2 text-yellow-400">
              <Activity className="w-8 h-8" /> Crypto Command
            </h1>
            <p className="text-slate-400 text-xs mt-1 uppercase tracking-widest font-bold">
              LTV Flexible: Binance (91%) / Bybit (92%)
            </p>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="bg-yellow-600 p-2 rounded-lg hover:bg-yellow-500 transition-colors shadow-lg active:scale-95"
          >
            <RefreshCw
              className={`w-5 h-5 ${loading ? "animate-spin" : ""}`}
            />
          </button>
        </div>

        {/* Dashboard */}
        <SummaryCards
          totalInvested={totalInvested}
          totalValue={totalValue}
          totalPnl={totalPnl}
          totalRoi={totalRoi}
        />

        <AssetTable
          items={sortedPortfolio}
          onDelete={removeInvestment}
        />

        <AggregatedTable items={aggregatedList} />

        <LoanSection
          loans={processedLoans}
          onEdit={handleEditLoan}
          onDelete={removeLoan}
        />

        {/* Forms */}
        <div className="border-t-2 border-slate-800 pt-10 mt-12 grid grid-cols-1 md:grid-cols-2 gap-8">
          <InvestmentForm onSubmit={addInvestment} />
          <LoanForm onSubmit={addLoan} />
        </div>
      </div>

      {/* Edit Modal */}
      {editingLoan && (
        <EditLoanModal
          loan={editingLoan}
          onSave={handleSaveLoan}
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
};

export default App;
