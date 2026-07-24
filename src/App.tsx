import React, { useState, useMemo, useCallback, useRef, Suspense } from "react";
import { RefreshCw } from "lucide-react";
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
import { useFutures } from "./hooks/useFutures";
import { useLiquidationData } from "./hooks/useLiquidationData";
import { usePrices } from "./hooks/usePrices";
import { useAlerts, InvestmentAlert, GlobalAlert, WatchlistAlert, cleanupInvestmentAlerts, cleanupSaleAlerts } from "./hooks/useAlerts";
import { useFearGreed } from "./hooks/useFearGreed";
import { useBcvRate } from "./hooks/useBcvRate";
import { useYadioRate } from "./hooks/useYadioRate";
import NavBar, { TabId } from "./components/NavBar";
import { getSelectedCoins } from "./components/CoinSelector";
import { useWatchlistCoins } from "./hooks/useWatchlistCoins";
import SummaryCards from "./components/SummaryCards";
import AssetTable from "./components/AssetTable";
import AggregatedTable from "./components/AggregatedTable";
import AnalyticsSection from "./components/AnalyticsSection";
import InvestmentForm from "./components/InvestmentForm";
import SaleForm from "./components/SaleForm";
import SalesHistoryTable from "./components/SalesHistoryTable";
import EditLoanModal from "./components/EditLoanModal";
import ClosePositionModal from "./components/ClosePositionModal";
import CloseVentaModal from "./components/CloseVentaModal";
import ClosedTradesTable from "./components/ClosedTradesTable";
import EditSaleModal from "./components/EditSaleModal";
import EditInvestmentModal from "./components/EditInvestmentModal";
import InvestmentAlertModal from "./components/InvestmentAlertModal";
import GlobalAlertModal from "./components/GlobalAlertModal";
import WatchlistAlertModal from "./components/WatchlistAlertModal";
import CandleAlertModal from "./components/CandleAlertModal";
import MarcoAnalysisModal, { MarcoAnalysisModalProps } from "./components/MarcoAnalysisModal";
import Dashboard from "./components/Dashboard/Dashboard";

const LiquidationDashboard = React.lazy(() => import("./components/LiquidationDashboard"));
const SellSuite = React.lazy(() => import("./components/SellSuite"));
const AlertSettings = React.lazy(() => import("./components/AlertSettings"));
const FuturesTab = React.lazy(() => import("./components/FuturesTab"));
const OpenCodeMonitor = React.lazy(() => import("./components/OpenCodeMonitor"));
const LiquidezTab = React.lazy(() => import("./components/LiquidezTab"));

const App: React.FC = () => {
  const { portfolio, addInvestment, removeInvestment, updateInvestment } = usePortfolio();
  const { closedTrades, addClosedTrade, loading: closedTradesLoading } = useClosedTrades();
  const { sales, addSale, deleteSale, updateSale, loading: salesLoading } = useSales();
  const { loans, updateLoan } = useLoans();
  const { config, saveConfig } = useAlerts();
  const [selectedCoins, setSelectedCoins] = useState<string[]>(getSelectedCoins);
  const [tickerSpeed, setTickerSpeed] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("ticker_speed");
      return saved ? parseInt(saved, 10) : 35;
    } catch {
      return 35;
    }
  });
  const { data: fearGreed, loading: fgLoading } = useFearGreed();
  const bcvRate = useBcvRate();
  const yadioRate = useYadioRate();
  const { futuresData } = useFutures();
  const { exchangeData } = useLiquidationData();
  const { watchlistCoins, setWatchlistCoins } = useWatchlistCoins();
  const [activeTab, setActiveTab] = useState<TabId>("inicio");
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
  const [isCandleAlertModalOpen, setIsCandleAlertModalOpen] = useState(false);
  const [watchlistEditTarget, setWatchlistEditTarget] = useState<{ coin: string; index: number } | null>(null);
  const [candleEditTarget, setCandleEditTarget] = useState<{ coin: string; index: number } | null>(null);
  const [globalEditIndex, setGlobalEditIndex] = useState<number | null>(null);
  const [investmentEditIndex, setInvestmentEditIndex] = useState<number | null>(null);
  const [marcoItem, setMarcoItem] = useState<Omit<MarcoAnalysisModalProps, "fearGreed" | "onClose"> | null>(null);

  // ── Computed: unique coins in portfolio (before usePrices) ────────
  const portfolioCoins = useMemo(() => {
    return Array.from(new Set(portfolio.map(item => item.coin)));
  }, [portfolio]);

  const futuresCoins = useMemo(() => {
    return Array.from(new Set(futuresData?.positions.map(p => p.symbol.replace("USDT", "")) ?? []));
  }, [futuresData]);

  // Fetch prices for BOTH ticker coins AND portfolio coins AND watchlist coins AND futures coins
  const allNeededCoins = useMemo(() => {
    const set = new Set([...selectedCoins, ...portfolioCoins, ...watchlistCoins, ...futuresCoins]);
    return Array.from(set);
  }, [selectedCoins, portfolioCoins, watchlistCoins, futuresCoins]);
  const { prices, priceDirections, prevDailyCloses, loading, refresh } = usePrices(allNeededCoins);
  const pricesRef = useRef(prices);
  pricesRef.current = prices;

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

  // ── Computed: processed sales (open ventas) ──────────────────────
  const processedSales = useMemo<ProcessedInvestment[]>(() => {
    return sales.map((sale) => {
      const currentPrice = prices[sale.coin] || 0;
      const currentValue = sale.quantity * currentPrice;
      const profit = sale.usdtReceived - currentValue;
      const roi = sale.usdtReceived > 0 ? (profit / sale.usdtReceived) * 100 : 0;
      return {
        id: `sale_${sale.id}`,
        coin: sale.coin,
        buyPrice: sale.sellPrice,
        quantity: sale.quantity,
        invested: sale.usdtReceived,
        date: sale.date,
        currentPrice,
        currentValue,
        profit,
        roi,
      };
    });
  }, [sales, prices]);

  // ── Computed: totals (single-pass reduce, includes open sales) ──
  const { totalInvested, totalValue, totalPnl, totalRoi } = useMemo(() => {
    let inv = 0;
    let val = 0;
    for (const item of sortedPortfolio) {
      inv += item.invested;
      val += item.currentValue;
    }
    for (const item of processedSales) {
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
  }, [sortedPortfolio, processedSales]);

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
    const cp = pricesRef.current[sale.coin] || 0;
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
  }, []);

  const handleMarcoSale = useCallback((sale: SaleRecord) => {
    setMarcoItem({
      coin: sale.coin, operationType: "sell",
      sellPrice: sale.sellPrice, quantity: sale.quantity,
      usdtReceived: sale.usdtReceived,
      currentPrice: pricesRef.current[sale.coin] || 0,
    });
  }, []);

  const handleMarcoClosed = useCallback((trade: ClosedTrade) => {
    setMarcoItem({
      coin: trade.coin, operationType: "closed",
      buyPrice: trade.buyPrice, sellPrice: trade.sellPrice,
      quantity: trade.quantity,
      closedPnl: trade.pnl, closedPnlPct: trade.pnlPercent,
      currentPrice: pricesRef.current[trade.coin] || 0,
    });
  }, []);
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
      const cp = pricesRef.current[sale.coin] || 0;
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

    const currentPrice = pricesRef.current[inv.coin] || inv.buyPrice;
    const currentValue = inv.quantity * currentPrice;
    const profit = currentValue - inv.invested;
    const roi = inv.invested > 0 ? (profit / inv.invested) * 100 : 0;

    const processedInv: ProcessedInvestment = { ...inv, currentPrice, currentValue, profit, roi };

    setInvestmentEditIndex(index);
    setAlertingInvestment(processedInv);
  }, [portfolio, sales]);

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

  const handleDeleteSale = useCallback(async (id: string) => {
    try {
      await deleteSale(id);
      await cleanupSaleAlerts(id);
    } catch (err) {
      console.error("Error al eliminar la venta o sus alertas:", err);
    }
  }, [deleteSale]);

  const activeAlertIds = useMemo(() => Object.keys(config.investmentAlerts || {}), [config.investmentAlerts]);

  // ── Tab fade animation helper ────────────────────────────────────
  const tabClass = "animate-fadeIn";

  // ── Pre-built table nodes to avoid JSX duplication ───────────────
  const salesTableNode = (
    <SalesHistoryTable
      sales={sales}
      loading={salesLoading}
      prices={prices}
      onEdit={setEditingSale}
      onDelete={handleDeleteSale}
      onBuyEvaluate={handleBuyEvaluate}
      onCloseVenta={handleCloseVenta}
      onMarcoAnalysis={handleMarcoSale}
      onAlert={handleAlertSale}
      activeAlertIds={activeAlertIds}
      priceDirections={priceDirections}
      onViewChart={handleViewChartSale}
    />
  );
  const assetTableNode = (
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
  );

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans">

      {/* ── Sticky Header ─────────────────────────────────────── */}
      <header className="sm:sticky sm:top-0 sm:z-50 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800">
        <NavBar
          active={activeTab}
          onChange={setActiveTab}
          prices={prices}
          priceDirections={priceDirections}
          bcvRate={bcvRate}
          yadioRate={yadioRate}
          selectedCoins={selectedCoins}
          tickerSpeed={tickerSpeed}
        />
      </header>

      {/* ── Tab Content ───────────────────────────────────────── */}
      <main className="w-full px-2 py-3 sm:py-6">

        {!hasPrices && !loading && (
          <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg px-4 py-3 mb-4 flex items-center gap-2 text-yellow-300 text-sm">
            <RefreshCw className="w-4 h-4" />
            <span>Precios no disponibles — los valores mostrados pueden no ser actuales.</span>
          </div>
        )}

        {/* ── INICIO (Dashboard global) ──────────────────────────────── */}
        {activeTab === "inicio" && (
          <div key="inicio" className={tabClass}>
            <Dashboard
              totalInvested={totalInvested}
              totalValue={totalValue}
              totalPnl={totalPnl}
              totalRoi={totalRoi}
              sortedPortfolio={sortedPortfolio}
              futuresData={futuresData}
              exchangeData={exchangeData}
              prices={prices}
              priceDirections={priceDirections}
              prevDailyCloses={prevDailyCloses}
              selectedCoins={watchlistCoins}
              onNavigateSpot={() => setActiveTab("dashboard")}
              onNavigateFutures={() => setActiveTab("futuros")}
              onCoinClick={(coin) => { setGraficoCoin(coin); setActiveTab("graficos"); }}
              onWatchlistChange={setWatchlistCoins}
            />
          </div>
        )}

        {/* ── DASHBOARD ─────────────────────────────────────────────── */}
        {activeTab === "dashboard" && (
          <div key="dashboard" className={tabClass}>
            <div className="max-w-6xl mx-auto space-y-3">
              <SummaryCards
                totalInvested={totalInvested}
                totalValue={totalValue}
                totalPnl={totalPnl}
                totalRoi={totalRoi}
                hasActiveGlobalAlerts={(config.globalAlerts || []).length > 0}
                onOpenGlobalAlerts={() => setIsGlobalAlertModalOpen(true)}
              />
              {sales.length > 0
                ? <>{salesTableNode}{assetTableNode}</>
                : <>{assetTableNode}{salesTableNode}</>
              }
              <AggregatedTable items={aggregatedList} priceDirections={priceDirections} openPositions={sortedPortfolio} openSales={sales} closedTrades={closedTrades} />
              <ClosedTradesTable trades={closedTrades} loading={closedTradesLoading} onMarcoAnalysis={handleMarcoClosed} />
            </div>
          </div>
        )}

        {/* ── GRÁFICOS ──────────────────────────────────────────────── */}
        {activeTab === "graficos" && (
          <div key="graficos" className={tabClass}>
            <div className="max-w-6xl mx-auto space-y-3">
              <AnalyticsSection
                aggregated={aggregatedList}
                items={sortedPortfolio}
                loans={processedLoans}
                totalValue={totalValue}
                totalInvested={totalInvested}
                fearGreed={fearGreed}
                fearGreedLoading={fgLoading}
                initialCoin={graficoCoin}
                priceDirections={priceDirections}
                sales={sales}
                futuresData={futuresData}
              />
            </div>
          </div>
        )}

        {/* ── PRÉSTAMOS ─────────────────────────────────────────────── */}
        {activeTab === "prestamos" && (
          <div key="prestamos" className={tabClass}>
            <Suspense fallback={<div className="py-20 text-center text-slate-500 text-sm">Cargando...</div>}>
              <LiquidationDashboard />
            </Suspense>
          </div>
        )}

        {/* ── VENTA ─────────────────────────────────────────────────── */}
        {activeTab === "venta" && (
          <div key="venta" className={tabClass}>
            <Suspense fallback={<div className="py-20 text-center text-slate-500 text-sm">Cargando...</div>}>
              <SellSuite preload={sellPreload} buyPreload={buyPreload} prices={prices} />
            </Suspense>
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
            <div className="max-w-6xl mx-auto space-y-3">
              <Suspense fallback={<div className="py-20 text-center text-slate-500 text-sm">Cargando...</div>}>
                <AlertSettings
                  config={config}
                  saveConfig={saveConfig}
                  onRefresh={refresh}
                  refreshing={loading}
                  onEditGlobal={handleEditGlobalAlert}
                  onEditInvestment={handleEditInvestmentAlert}
                  onOpenWatchlist={() => setIsWatchlistModalOpen(true)}
                  onEditWatchlistAlert={(coin, index) => { setWatchlistEditTarget({ coin, index }); setIsWatchlistModalOpen(true); }}
                  onOpenCandleAlert={() => setIsCandleAlertModalOpen(true)}
                  onEditCandleAlert={(coin, index) => { setCandleEditTarget({ coin, index }); setIsCandleAlertModalOpen(true); }}
                  sales={sales}
                  totalPnl={totalPnl}
                  selectedCoins={selectedCoins}
                  onSelectedCoinsChange={setSelectedCoins}
                  tickerSpeed={tickerSpeed}
                  onTickerSpeedChange={setTickerSpeed}
                  prices={prices}
                />
              </Suspense>
            </div>
          </div>
        )}

        {/* ── FUTUROS ─────────────────────────────────────────────────────────── */}
        {activeTab === "futuros" && (
          <div key="futuros" className={tabClass}>
            <div className="max-w-6xl mx-auto space-y-3">
              <Suspense fallback={<div className="py-20 text-center text-slate-500 text-sm">Cargando futuros...</div>}>
                <FuturesTab priceDirections={priceDirections} />
              </Suspense>
            </div>
          </div>
        )}

        {/* ── MONITOR OPENCODE ──────────────────────────────────────────────────── */}
        {activeTab === "monitor" && (
          <div key="monitor" className={tabClass}>
            <Suspense fallback={<div className="py-20 text-center text-slate-500 text-sm">Cargando monitor...</div>}>
              <OpenCodeMonitor />
            </Suspense>
          </div>
        )}

        {/* ── LIQUIDEZ ──────────────────────────────────────────────────── */}
        {activeTab === "liquidez" && (
          <div key="liquidez" className={tabClass}>
            <Suspense fallback={<div className="py-20 text-center text-slate-500 text-sm">Cargando liquidez...</div>}>
              <LiquidezTab prices={prices} />
            </Suspense>
          </div>
        )}
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
            await handleDeleteSale(sale.id);
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
            await cleanupInvestmentAlerts(inv.id);
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
      {isCandleAlertModalOpen && (
        <CandleAlertModal
          currentAlerts={config.candleAlerts || {}}
          onSaveAlerts={async (newAlerts) => {
            await saveConfig({ ...config, candleAlerts: newAlerts });
          }}
          onClose={() => { setIsCandleAlertModalOpen(false); setCandleEditTarget(null); }}
          initialEditCoin={candleEditTarget?.coin}
          initialEditIndex={candleEditTarget?.index}
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
