import React, { useState, useMemo, useCallback, useEffect } from "react";
import { Activity, RefreshCw } from "lucide-react";
import {
  RISK_PARAMS,
  ProcessedInvestment,
  ProcessedLoan,
  Loan,
  AggregatedAsset,
} from "./lib/constants";
import { usePortfolio } from "./hooks/usePortfolio";
import { useLoans } from "./hooks/useLoans";
import { usePrices } from "./hooks/usePrices";
import { useAlerts, InvestmentAlert, GlobalAlert } from "./hooks/useAlerts";
import { useSignals } from "./hooks/useSignals";
import { useFearGreed } from "./hooks/useFearGreed";
import NavBar, { TabId } from "./components/NavBar";
import SummaryCards from "./components/SummaryCards";
import AssetTable from "./components/AssetTable";
import AggregatedTable from "./components/AggregatedTable";
import AnalyticsSection from "./components/AnalyticsSection";
import InvestmentForm from "./components/InvestmentForm";
import LiquidationDashboard from "./components/LiquidationDashboard";
import SellSuite from "./components/SellSuite";
import SignalsTab from "./components/SignalsTab";
import EditLoanModal from "./components/EditLoanModal";
import AlertSettings from "./components/AlertSettings";
import EditInvestmentModal from "./components/EditInvestmentModal";
import InvestmentAlertModal from "./components/InvestmentAlertModal";
import GlobalAlertModal from "./components/GlobalAlertModal";

const App: React.FC = () => {
  const { portfolio, addInvestment, removeInvestment, updateInvestment } = usePortfolio();
  const { loans, addLoan, updateLoan, removeLoan } = useLoans();
  const { config, saveConfig } = useAlerts();
  const { prices, loading, refresh } = usePrices();
  const { signals, klinesMap, loading: signalsLoading, error: signalsError, lastUpdated: signalsLastUpdated, fetchSignals, forceRefresh: forceRefreshSignals } = useSignals();
  const { data: fearGreed, loading: fgLoading } = useFearGreed();
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [editingInvestment, setEditingInvestment] = useState<ProcessedInvestment | null>(null);
  const [alertingInvestment, setAlertingInvestment] = useState<ProcessedInvestment | null>(null);
  const [sellPreload, setSellPreload] = useState<ProcessedInvestment | null>(null);
  const [isGlobalAlertModalOpen, setIsGlobalAlertModalOpen] = useState(false);
  const [globalEditIndex, setGlobalEditIndex] = useState<number | null>(null);
  const [investmentEditIndex, setInvestmentEditIndex] = useState<number | null>(null);

  // ── Computed: unique coins in portfolio ──────────────────────────
  const portfolioCoins = useMemo(() => {
    return Array.from(new Set(portfolio.map(item => item.coin)));
  }, [portfolio]);

  // ── Fetch signals when Fear & Greed data and portfolio coins are ready ──
  const portfolioSet = useMemo(() => new Set(portfolioCoins), [portfolioCoins]);
  useEffect(() => {
    fetchSignals(fearGreed ?? undefined, portfolioSet);
  }, [fearGreed, fetchSignals, portfolioSet]);

  // ── Computed: portfolio with live prices ──────────────────────────
  const hasPrices = Object.keys(prices).length > 0;

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

  // ── Computed: totals (single-pass reduce) ────────────────────────
  const { totalInvested, totalValue, totalPnl, totalRoi } = useMemo(() => {
    let inv = 0;
    let val = 0;
    for (const item of sortedPortfolio) {
      inv += item.invested;
      val += item.currentValue;
    }
    const pnl = val - inv;
    return {
      totalInvested: inv,
      totalValue: val,
      totalPnl: pnl,
      totalRoi: inv > 0 ? (pnl / inv) * 100 : 0,
    };
  }, [sortedPortfolio]);

  // ── Computed: aggregated averages per coin ────────────────────────
  const aggregatedList = useMemo<AggregatedAsset[]>(() => {
    const map = new Map<string, { totalQty: number; totalInvested: number }>();

    for (const item of portfolio) {
      const qty = Number.isFinite(item.quantity) ? item.quantity : 0;
      const inv = Number.isFinite(item.invested) ? item.invested : 0;
      const entry = map.get(item.coin) || { totalQty: 0, totalInvested: 0 };
      entry.totalQty += qty;
      entry.totalInvested += inv;
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
        return { coin, totalQty, totalInvested, avgBuyPrice, currentPrice, currentValue, pnl, priceDiffPercent };
      })
      .sort((a, b) => b.pnl - a.pnl);
  }, [portfolio, prices]);

  // ── Computed: loans with live LTV ────────────────────────────────
  const processedLoans = useMemo<ProcessedLoan[]>(() => {
    return loans.map((loan) => {
      const colVal = loan.collateralQty * (prices[loan.collateralCoin] || 0);
      const ltv = colVal > 0 ? (loan.borrowedUSDT / colVal) * 100 : 0;
      const params = RISK_PARAMS[loan.exchange] || RISK_PARAMS["Binance"];
      const liquidationPrice =
        loan.collateralQty > 0
          ? (loan.borrowedUSDT * 100) / (params.liquidation * loan.collateralQty)
          : 0;
      return { ...loan, collateralValue: colVal, ltv, liquidationPrice };
    });
  }, [loans, prices]);

  // ── Callbacks ────────────────────────────────────────────────────
  const handleEditLoan = useCallback((loan: ProcessedLoan) => setEditingLoan(loan), []);
  const handleCloseModal = useCallback(() => setEditingLoan(null), []);
  const handleEditInvestment = useCallback((item: ProcessedInvestment) => setEditingInvestment(item), []);
  const handleCloseInvestmentModal = useCallback(() => setEditingInvestment(null), []);
  const handleAlertInvestment = useCallback((item: ProcessedInvestment) => setAlertingInvestment(item), []);
  const handleSellEvaluate = useCallback((item: ProcessedInvestment) => {
    setSellPreload(item);
    setActiveTab("venta");
  }, []);
  const handleCloseAlertModal = useCallback(() => {
    setAlertingInvestment(null);
    setInvestmentEditIndex(null);
  }, []);

  const handleEditGlobalAlert = useCallback((index: number) => {
    setGlobalEditIndex(index);
    setIsGlobalAlertModalOpen(true);
  }, []);

  const handleEditInvestmentAlert = useCallback((investmentId: string, index: number) => {
    const inv = portfolio.find(i => i.id === investmentId);
    if (!inv) return;

    // We compute the current ProcessedInvestment properties to pass to the modal
    const currentPrice = prices[inv.coin] || inv.buyPrice;
    const currentValue = inv.quantity * currentPrice;
    const profit = currentValue - inv.invested;
    const roi = inv.invested > 0 ? (profit / inv.invested) * 100 : 0;

    const processedInv: ProcessedInvestment = { ...inv, currentPrice, currentValue, profit, roi };

    setInvestmentEditIndex(index);
    setAlertingInvestment(processedInv);
  }, [portfolio, prices]);

  const handleSaveGlobalAlerts = useCallback(async (alerts: GlobalAlert[]) => {
    await saveConfig({ ...config, globalAlerts: alerts });
  }, [config, saveConfig]);

  // Save ALL alerts for a single asset at once (from the modal)
  const handleSaveAllAlertsForAsset = useCallback(async (id: string, alerts: InvestmentAlert[]) => {
    const newAlerts = { ...(config.investmentAlerts || {}) };
    if (alerts.length === 0) {
      delete newAlerts[id];
    } else {
      newAlerts[id] = alerts;
    }
    await saveConfig({ ...config, investmentAlerts: newAlerts });
  }, [config, saveConfig]);

  // Remove ALL alerts for an asset (used from AlertSettings panel)
  const handleRemoveInvestmentAlert = useCallback(async (id: string) => {
    const newAlerts = { ...(config.investmentAlerts || {}) };
    delete newAlerts[id];
    await saveConfig({ ...config, investmentAlerts: newAlerts });
  }, [config, saveConfig]);

  const activeAlertIds = useMemo(() => Object.keys(config.investmentAlerts || {}), [config.investmentAlerts]);

  // ── Tab fade animation helper ────────────────────────────────────
  const tabClass = "animate-fadeIn";

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans">

      {/* ── Sticky Header ─────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-3 md:px-8 py-3 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2 text-yellow-400">
              <Activity className="w-6 h-6" /> Crypto Command
            </h1>
            <p className="text-[10px] text-yellow-500/70 font-semibold mt-[-2px] ml-8 mb-1">
              By #JDMRules
            </p>
            <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold hidden sm:block">
              LTV Flex: Binance 91% · Bybit 92%
            </p>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="bg-yellow-600 p-2 rounded-lg hover:bg-yellow-500 transition-colors shadow-lg active:scale-95"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* ── Tab Bar ───────────────────────── */}
        <NavBar active={activeTab} onChange={setActiveTab} />
      </header>

      {/* ── Tab Content ───────────────────────────────────────── */}
      <main className="max-w-6xl mx-auto px-3 md:px-8 py-3 sm:py-6 pb-28 sm:pb-40">

        {!hasPrices && !loading && (
          <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg px-4 py-3 mb-4 flex items-center gap-2 text-yellow-300 text-sm">
            <RefreshCw className="w-4 h-4" />
            <span>Precios no disponibles — los valores mostrados pueden no ser actuales.</span>
          </div>
        )}

        {/* ── DASHBOARD ─────────────────────────────────────────────── */}
        {activeTab === "dashboard" && (
          <div key="dashboard" className={tabClass}>
            <SummaryCards
              totalInvested={totalInvested}
              totalValue={totalValue}
              totalPnl={totalPnl}
              totalRoi={totalRoi}
              hasActiveGlobalAlerts={(config.globalAlerts || []).length > 0}
              onOpenGlobalAlerts={() => setIsGlobalAlertModalOpen(true)}
            />
            <AssetTable
              items={sortedPortfolio}
              activeAlertIds={activeAlertIds}
              onDelete={removeInvestment}
              onEdit={handleEditInvestment}
              onAlert={handleAlertInvestment}
              onSellEvaluate={handleSellEvaluate}
            />
            <AggregatedTable items={aggregatedList} />
          </div>
        )}

        {/* ── GRÁFICOS ──────────────────────────────────────────────── */}
        {activeTab === "graficos" && (
          <div key="graficos" className={tabClass}>
            <AnalyticsSection
              aggregated={aggregatedList}
              items={sortedPortfolio}
              loans={processedLoans}
              totalValue={totalValue}
              totalInvested={totalInvested}
              signals={signals}
              klinesMap={klinesMap}
              fearGreed={fearGreed}
              fearGreedLoading={fgLoading}
            />
          </div>
        )}

        {/* ── PRÉSTAMOS ─────────────────────────────────────────────── */}
        {activeTab === "prestamos" && (
          <div key="prestamos" className={tabClass}>
            <LiquidationDashboard prices={prices} pricesLoading={loading} refreshPrices={refresh} />
          </div>
        )}

        {/* ── VENTA ─────────────────────────────────────────────────── */}
        {activeTab === "venta" && (
          <div key="venta" className={tabClass}>
            <SellSuite preload={sellPreload} />
          </div>
        )}

        {/* ── SEÑALES DE TRADING ────────────────────────────────────── */}
        {activeTab === "senales" && (
          <div key="senales" className={tabClass}>
            <SignalsTab
              portfolioCoins={portfolioCoins}
              signals={signals}
              signalsLoading={signalsLoading}
              signalsError={signalsError}
              signalsLastUpdated={signalsLastUpdated}
              fearGreed={fearGreed}
              fgLoading={fgLoading}
              onRefresh={() => forceRefreshSignals(fearGreed ?? undefined, portfolioSet)}
            />
          </div>
        )}

        {/* ── OPERACIONES ───────────────────────────────────────────── */}
        {activeTab === "operaciones" && (
          <div key="operaciones" className={tabClass}>
            <div className="max-w-xl mx-auto">
              <InvestmentForm onSubmit={addInvestment} />
            </div>
          </div>
        )}

        {/* ── CONFIGURACIÓN (TELEGRAM) ─────────────────────────────────────────── */}
        {activeTab === "configuracion" && (
          <div key="configuracion" className={tabClass}>
            <AlertSettings
              config={config}
              saveConfig={saveConfig}
              onEditGlobal={handleEditGlobalAlert}
              onEditInvestment={handleEditInvestmentAlert}
            />
          </div>
        )}
      </main>

      {/* ── Modals (always mounted regardless of active tab) ───────── */}
      {editingLoan && (
        <EditLoanModal loan={editingLoan} onSave={updateLoan} onClose={handleCloseModal} />
      )}
      {editingInvestment && (
        <EditInvestmentModal investment={editingInvestment} onSave={updateInvestment} onClose={handleCloseInvestmentModal} />
      )}
      {alertingInvestment && (
        <InvestmentAlertModal
          investment={alertingInvestment}
          currentAlerts={config.investmentAlerts?.[alertingInvestment.id] ?? []}
          onSaveAlerts={handleSaveAllAlertsForAsset}
          onClose={handleCloseAlertModal}
          initialEditIndex={investmentEditIndex}
        />
      )}
      {isGlobalAlertModalOpen && (
        <GlobalAlertModal
          totalPnl={totalPnl}
          currentAlerts={config.globalAlerts || []}
          onSaveAlerts={handleSaveGlobalAlerts}
          onClose={() => {
            setIsGlobalAlertModalOpen(false);
            setGlobalEditIndex(null);
          }}
          initialEditIndex={globalEditIndex}
        />
      )}
    </div>
  );
};

export default App;
