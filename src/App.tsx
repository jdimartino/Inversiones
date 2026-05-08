import React, { useState, useMemo, useCallback, useEffect } from "react";
import { Activity, RefreshCw } from "lucide-react";
import {
  RISK_PARAMS,
  ProcessedInvestment,
  ProcessedLoan,
  Loan,
  AggregatedAsset,
  SaleRecord,
  ClosedTrade,
} from "./lib/constants";
import { usePortfolio } from "./hooks/usePortfolio";
import { useClosedTrades } from "./hooks/useClosedTrades";
import { useSales } from "./hooks/useSales";
import { useLoans } from "./hooks/useLoans";
import { usePrices } from "./hooks/usePrices";
import { useAlerts, InvestmentAlert, GlobalAlert, WatchlistAlert } from "./hooks/useAlerts";
import { useSignals } from "./hooks/useSignals";
import { useFearGreed } from "./hooks/useFearGreed";
import NavBar, { TabId } from "./components/NavBar";
import SummaryCards from "./components/SummaryCards";
import AssetTable from "./components/AssetTable";
import AggregatedTable from "./components/AggregatedTable";
import AnalyticsSection from "./components/AnalyticsSection";
import InvestmentForm from "./components/InvestmentForm";
import SaleForm from "./components/SaleForm";
import SalesHistoryTable from "./components/SalesHistoryTable";
import LiquidationDashboard from "./components/LiquidationDashboard";
import SellSuite from "./components/SellSuite";
import SignalsTab from "./components/SignalsTab";
import EditLoanModal from "./components/EditLoanModal";
import ClosePositionModal from "./components/ClosePositionModal";
import CloseVentaModal from "./components/CloseVentaModal";
import ClosedTradesTable from "./components/ClosedTradesTable";
import EditSaleModal from "./components/EditSaleModal";
import AlertSettings from "./components/AlertSettings";
import EditInvestmentModal from "./components/EditInvestmentModal";
import InvestmentAlertModal from "./components/InvestmentAlertModal";
import GlobalAlertModal from "./components/GlobalAlertModal";
import WatchlistAlertModal from "./components/WatchlistAlertModal";
import MarcoAnalysisModal, { MarcoAnalysisModalProps } from "./components/MarcoAnalysisModal";

const App: React.FC = () => {
  const { portfolio, addInvestment, removeInvestment, updateInvestment } = usePortfolio();
  const { closedTrades, addClosedTrade, loading: closedTradesLoading } = useClosedTrades();
  const { sales, addSale, deleteSale, updateSale, loading: salesLoading } = useSales();
  const { loans, addLoan, updateLoan, removeLoan } = useLoans();
  const { config, saveConfig } = useAlerts();
  const { prices, priceDirections, loading, refresh } = usePrices();
  const { signals, klinesMap, loading: signalsLoading, error: signalsError, lastUpdated: signalsLastUpdated, fetchSignals, forceRefresh: forceRefreshSignals } = useSignals();
  const { data: fearGreed, loading: fgLoading } = useFearGreed();
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [graficoCoin, setGraficoCoin] = useState<string | undefined>(undefined);
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [editingInvestment, setEditingInvestment] = useState<ProcessedInvestment | null>(null);
  const [alertingInvestment, setAlertingInvestment] = useState<ProcessedInvestment | null>(null);
  const [alertingSale, setAlertingSale] = useState<SaleRecord | null>(null);
  const [sellPreload, setSellPreload] = useState<ProcessedInvestment | null>(null);
  const [buyPreload, setBuyPreload] = useState<import("./components/SellSuite").BuyPreload | null>(null);
  const [closingInvestment, setClosingInvestment] = useState<ProcessedInvestment | null>(null);
  const [editingSale, setEditingSale] = useState<SaleRecord | null>(null);
  const [closingVenta, setClosingVenta] = useState<SaleRecord | null>(null);
  const [isGlobalAlertModalOpen, setIsGlobalAlertModalOpen] = useState(false);
  const [isWatchlistModalOpen, setIsWatchlistModalOpen] = useState(false);
  const [watchlistEditTarget, setWatchlistEditTarget] = useState<{ coin: string; index: number } | null>(null);
  const [globalEditIndex, setGlobalEditIndex] = useState<number | null>(null);
  const [investmentEditIndex, setInvestmentEditIndex] = useState<number | null>(null);
  const [marcoItem, setMarcoItem] = useState<Omit<MarcoAnalysisModalProps, "fearGreed" | "onClose"> | null>(null);

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

  const handleClosePosition = useCallback((item: ProcessedInvestment) => setClosingInvestment(item), []);

  const handleBuyEvaluate = useCallback((sale: SaleRecord) => {
    setBuyPreload({ coin: sale.coin, usdtAmount: sale.usdtReceived, sellPrice: sale.sellPrice });
    setActiveTab("venta");
  }, []);

  const handleCloseVenta = useCallback((sale: SaleRecord) => setClosingVenta(sale), []);

  const handleViewChart = useCallback((item: ProcessedInvestment) => {
    setGraficoCoin(item.coin);
    setActiveTab("graficos");
  }, []);

  const handleViewChartSale = useCallback((sale: SaleRecord) => {
    setGraficoCoin(sale.coin);
    setActiveTab("graficos");
  }, []);

  const handleMarcoAsset = useCallback((item: ProcessedInvestment) => {
    setMarcoItem({
      coin: item.coin, operationType: "buy",
      entryPrice: item.buyPrice, quantity: item.quantity,
      pnl: item.profit, pnlPct: item.roi,
      currentPrice: item.currentPrice,
    });
  }, []);

  const handleAlertSale = useCallback((sale: SaleRecord) => {
    const cp = prices[sale.coin] || 0;
    // profit/roi desde la perspectiva del vendedor: positivo = precio bajó (puedes recomprar más barato)
    const profit = sale.usdtReceived - sale.quantity * cp;
    const roi = sale.usdtReceived > 0 ? (profit / sale.usdtReceived) * 100 : 0;
    setAlertingSale(sale);
    setAlertingInvestment({
      id: `sale_${sale.id}`,
      coin: sale.coin,
      buyPrice: sale.sellPrice,
      quantity: sale.quantity,
      invested: sale.usdtReceived,
      date: sale.date,
      currentPrice: cp,
      currentValue: sale.quantity * cp,
      profit,
      roi,
    });
  }, [prices]);

  const handleMarcoSale = useCallback((sale: SaleRecord) => {
    setMarcoItem({
      coin: sale.coin, operationType: "sell",
      sellPrice: sale.sellPrice, quantity: sale.quantity,
      usdtReceived: sale.usdtReceived,
      currentPrice: prices[sale.coin] || 0,
    });
  }, [prices]);

  const handleMarcoClosed = useCallback((trade: ClosedTrade) => {
    setMarcoItem({
      coin: trade.coin, operationType: "closed",
      buyPrice: trade.buyPrice, sellPrice: trade.sellPrice,
      quantity: trade.quantity,
      closedPnl: trade.pnl, closedPnlPct: trade.pnlPercent,
      currentPrice: prices[trade.coin] || 0,
    });
  }, [prices]);
  const handleCloseAlertModal = useCallback(() => {
    setAlertingInvestment(null);
    setAlertingSale(null);
    setInvestmentEditIndex(null);
  }, []);

  const handleEditGlobalAlert = useCallback((index: number) => {
    setGlobalEditIndex(index);
    setIsGlobalAlertModalOpen(true);
  }, []);

  const handleEditInvestmentAlert = useCallback((investmentId: string, index: number) => {
    if (investmentId.startsWith('sale_')) {
      const saleId = investmentId.slice(5);
      const sale = sales.find(s => s.id === saleId);
      if (!sale) return;
      const cp = prices[sale.coin] || 0;
      const profit = sale.usdtReceived - sale.quantity * cp;
      const roi = sale.usdtReceived > 0 ? (profit / sale.usdtReceived) * 100 : 0;
      setAlertingSale(sale);
      setAlertingInvestment({
        id: `sale_${sale.id}`,
        coin: sale.coin,
        buyPrice: sale.sellPrice,
        quantity: sale.quantity,
        invested: sale.usdtReceived,
        date: sale.date,
        currentPrice: cp,
        currentValue: sale.quantity * cp,
        profit,
        roi,
      });
      setInvestmentEditIndex(index);
      return;
    }

    const inv = portfolio.find(i => i.id === investmentId);
    if (!inv) return;

    const currentPrice = prices[inv.coin] || inv.buyPrice;
    const currentValue = inv.quantity * currentPrice;
    const profit = currentValue - inv.invested;
    const roi = inv.invested > 0 ? (profit / inv.invested) * 100 : 0;

    const processedInv: ProcessedInvestment = { ...inv, currentPrice, currentValue, profit, roi };

    setInvestmentEditIndex(index);
    setAlertingInvestment(processedInv);
  }, [portfolio, prices, sales]);

  const handleSaveGlobalAlerts = useCallback(async (alerts: GlobalAlert[]) => {
    await saveConfig({ ...config, globalAlerts: alerts });
  }, [config, saveConfig]);

  const handleSaveWatchlistAlerts = useCallback(async (alerts: Record<string, WatchlistAlert[]>) => {
    await saveConfig({ ...config, watchlistAlerts: alerts });
  }, [config, saveConfig]);

  // Save ALL alerts for a single asset at once (from the modal)
  const handleSaveAllAlertsForAsset = useCallback(async (id: string, alerts: InvestmentAlert[]) => {
    const newAlerts = { ...(config.investmentAlerts || {}) };
    if (alerts.length === 0) {
      delete newAlerts[id];
    } else {
      newAlerts[id] = alerts;
    }
    if (id.startsWith('sale_') && alertingSale) {
      const newSaleMeta = { ...(config.saleMeta || {}) };
      newSaleMeta[id] = { coin: alertingSale.coin, usdtReceived: alertingSale.usdtReceived, quantity: alertingSale.quantity };
      await saveConfig({ ...config, investmentAlerts: newAlerts, saleMeta: newSaleMeta });
    } else {
      await saveConfig({ ...config, investmentAlerts: newAlerts });
    }
  }, [config, saveConfig, alertingSale]);

  // Remove ALL alerts for an asset (used from AlertSettings panel)
  const handleRemoveInvestmentAlert = useCallback(async (id: string) => {
    const newAlerts = { ...(config.investmentAlerts || {}) };
    delete newAlerts[id];
    if (id.startsWith('sale_')) {
      const newSaleMeta = { ...(config.saleMeta || {}) };
      delete newSaleMeta[id];
      await saveConfig({ ...config, investmentAlerts: newAlerts, saleMeta: newSaleMeta });
    } else {
      await saveConfig({ ...config, investmentAlerts: newAlerts });
    }
  }, [config, saveConfig]);

  const activeAlertIds = useMemo(() => Object.keys(config.investmentAlerts || {}), [config.investmentAlerts]);

  // ── Tab fade animation helper ────────────────────────────────────
  const tabClass = "animate-fadeIn";

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans">

      {/* ── Sticky Header ─────────────────────────────────────── */}
      <header className="sm:sticky sm:top-0 sm:z-50 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800">
        <NavBar active={activeTab} onChange={setActiveTab} onRefresh={refresh} refreshing={loading} />
      </header>

      {/* ── Tab Content ───────────────────────────────────────── */}
      <main className="max-w-6xl mx-auto px-3 md:px-8 py-3 sm:py-6">

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
            {sales.length > 0 ? (
              <>
                <SalesHistoryTable
                  sales={sales}
                  loading={salesLoading}
                  prices={prices}
                  onEdit={setEditingSale}
                  onDelete={deleteSale}
                  onBuyEvaluate={handleBuyEvaluate}
                  onCloseVenta={handleCloseVenta}
                  onMarcoAnalysis={handleMarcoSale}
                  onAlert={handleAlertSale}
                  activeAlertIds={activeAlertIds}
                  priceDirections={priceDirections}
                  onViewChart={handleViewChartSale}
                />
                <AssetTable
                  items={sortedPortfolio}
                  activeAlertIds={activeAlertIds}
                  onDelete={removeInvestment}
                  onEdit={handleEditInvestment}
                  onAlert={handleAlertInvestment}
                  onSellEvaluate={handleSellEvaluate}
                  onViewChart={handleViewChart}
                  onClosePosition={handleClosePosition}
                  onMarcoAnalysis={handleMarcoAsset}
                  priceDirections={priceDirections}
                />
              </>
            ) : (
              <>
                <AssetTable
                  items={sortedPortfolio}
                  activeAlertIds={activeAlertIds}
                  onDelete={removeInvestment}
                  onEdit={handleEditInvestment}
                  onAlert={handleAlertInvestment}
                  onSellEvaluate={handleSellEvaluate}
                  onViewChart={handleViewChart}
                  onClosePosition={handleClosePosition}
                  onMarcoAnalysis={handleMarcoAsset}
                  priceDirections={priceDirections}
                />
                <SalesHistoryTable
                  sales={sales}
                  loading={salesLoading}
                  prices={prices}
                  onEdit={setEditingSale}
                  onDelete={deleteSale}
                  onBuyEvaluate={handleBuyEvaluate}
                  onCloseVenta={handleCloseVenta}
                  onMarcoAnalysis={handleMarcoSale}
                  onAlert={handleAlertSale}
                  activeAlertIds={activeAlertIds}
                  priceDirections={priceDirections}
                  onViewChart={handleViewChartSale}
                />
              </>
            )}
            <AggregatedTable items={aggregatedList} priceDirections={priceDirections} />
            <ClosedTradesTable trades={closedTrades} loading={closedTradesLoading} onMarcoAnalysis={handleMarcoClosed} />
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
              initialCoin={graficoCoin}
              priceDirections={priceDirections}
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
            <SellSuite preload={sellPreload} buyPreload={buyPreload} />
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
              <InvestmentForm onSubmit={addInvestment} />
              <SaleForm onSubmit={addSale} />
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
              onOpenWatchlist={() => setIsWatchlistModalOpen(true)}
              onEditWatchlistAlert={(coin, index) => { setWatchlistEditTarget({ coin, index }); setIsWatchlistModalOpen(true); }}
              sales={sales}
              totalPnl={totalPnl}
            />
          </div>
        )}
        {/* ── Footer ────────────────────────────────────────────── */}
        <footer className="mt-8 border-t border-slate-800 py-3 flex justify-between items-center">
          <div>
            <h1 className="text-base font-bold flex items-center gap-2 text-yellow-400">
              <Activity className="w-4 h-4" /> Crypto Command
            </h1>
            <p className="text-[10px] text-yellow-500/70 font-semibold mt-[-2px] ml-6">By #JDMRules</p>
            <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold hidden sm:block ml-6">
              LTV Flex: Binance 91% · Bybit 92%
            </p>
          </div>
        </footer>
      </main>

      {/* ── Modals (always mounted regardless of active tab) ───────── */}
      {editingSale && (
        <EditSaleModal
          sale={editingSale}
          onSave={async (id, coin, quantity, sellPrice, usdtReceived) => {
            await updateSale(id, coin, quantity, sellPrice, usdtReceived);
            setEditingSale(null);
          }}
          onClose={() => setEditingSale(null)}
        />
      )}
      {closingVenta && (
        <CloseVentaModal
          sale={closingVenta}
          onConfirm={async (buyPrice: number) => {
            const sale = closingVenta;
            const invested = buyPrice * sale.quantity;
            const pnl = sale.usdtReceived - invested;
            await addClosedTrade({
              coin: sale.coin,
              quantity: sale.quantity,
              buyPrice,
              sellPrice: sale.sellPrice,
              invested,
              soldValue: sale.usdtReceived,
              pnl,
              pnlPercent: invested > 0 ? (pnl / invested) * 100 : 0,
              buyDate: 0,
              sellDate: sale.date,
            });
            await deleteSale(sale.id);
            setClosingVenta(null);
          }}
          onClose={() => setClosingVenta(null)}
        />
      )}
      {closingInvestment && (
        <ClosePositionModal
          investment={closingInvestment}
          onConfirm={async (sellPrice: number) => {
            const inv = closingInvestment;
            const soldValue = sellPrice * inv.quantity;
            const pnl = soldValue - inv.invested;
            await addClosedTrade({
              coin: inv.coin,
              quantity: inv.quantity,
              buyPrice: inv.buyPrice,
              sellPrice,
              invested: inv.invested,
              soldValue,
              pnl,
              pnlPercent: inv.invested > 0 ? (pnl / inv.invested) * 100 : 0,
              buyDate: inv.date,
              sellDate: Date.now(),
            });
            await removeInvestment(inv.id);
            setClosingInvestment(null);
          }}
          onClose={() => setClosingInvestment(null)}
        />
      )}
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
      {isWatchlistModalOpen && (
        <WatchlistAlertModal
          currentAlerts={config.watchlistAlerts || {}}
          onSaveAlerts={handleSaveWatchlistAlerts}
          onClose={() => { setIsWatchlistModalOpen(false); setWatchlistEditTarget(null); }}
          initialEditCoin={watchlistEditTarget?.coin}
          initialEditIndex={watchlistEditTarget?.index}
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
      {marcoItem && (
        <MarcoAnalysisModal
          {...marcoItem}
          fearGreed={fearGreed}
          onClose={() => setMarcoItem(null)}
        />
      )}
    </div>
  );
};

export default App;
