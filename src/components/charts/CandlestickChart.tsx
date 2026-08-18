import React, { useEffect, useRef, useState } from "react";
import type { CandlestickChartProps } from "../../lib/types/chart";
import ChartCard from "./ChartCard";
import { fmtPrice, fmtUSD } from "../../lib/format";
import { useAlerts } from "../../hooks/useAlerts";
import { useChartAlerts } from "../../hooks/useChartAlerts";
import { useChartLegend } from "../../hooks/useChartLegend";
import { useChartKlines } from "../../hooks/useChartKlines";
import { useChartSeries } from "../../hooks/useChartSeries";
import { useChartPriceLines } from "../../hooks/useChartPriceLines";
import { useMeasureTool } from "../../hooks/useMeasureTool";
import { useChartIndicatorValues } from "../../hooks/useChartIndicatorValues";
import { useChartSignals } from "../../hooks/useChartSignals";
import { calcVolumeRatio } from "../../lib/indicators";
import { fmtVol } from "./candlestick/chartUtils";
import MeasureTool from "./candlestick/MeasureTool";
import ChartToolbar from "./candlestick/ChartToolbar";
import CoinExplorer from "./candlestick/CoinExplorer";
import IndicatorHud from "./candlestick/IndicatorHud";
import AlertForm from "./candlestick/AlertForm";

// ── Types (imported from lib/types/chart.ts) ────────────────────────

// ── Component ───────────────────────────────────────────────────────

const CandlestickChart: React.FC<CandlestickChartProps> = ({
    aggregated, klinesMap = {}, items, initialCoin, signals = [], onCoinChange, priceDirections = {}, sales = [], futuresPositions = [],
}) => {
    const portfolioCoins = aggregated.filter((a) => a.currentValue > 0).map((a) => a.coin);
    const futuresCoins = futuresPositions.map((p) => p.symbol.replace("USDT", ""));
    const coins = Array.from(new Set([...portfolioCoins, ...futuresCoins]));
    const extraCoins = Object.keys(klinesMap).filter(c => !coins.includes(c));
    const { config, saveConfig } = useAlerts();

    const {
        selectedCoin, setSelectedCoin,
        selectedInterval, setSelectedInterval,
        currentKlines, loading, fetchError,
        getCurrentKlines,
        handleSelectExplorerCoin,
        showExplorer, setShowExplorer,
        explorerInput, setExplorerInput,
        explorerLoading, explorerError,
        setExplorerError,
        explorerRef,
    } = useChartKlines({ coins, initialCoin, klinesMap });

    const [expanded, setExpanded] = useState(false);
    // Altura del chart principal (62% del wrapper) — MeasureTool se limita a esta zona
    const mainChartHeight = Math.round((expanded ? 760 : 560) * 0.62);

    // Chart containers
    const mainContainerRef = useRef<HTMLDivElement>(null);
    const mainChartContainerRef = useRef<HTMLDivElement>(null);
    const rsiContainerRef = useRef<HTMLDivElement>(null);
    const macdContainerRef = useRef<HTMLDivElement>(null);

    // Chart + series (managed by useChartSeries)
    const {
        mainChartRef,
        candleSeriesRef,
        volumeSeriesRef,
        getIndicatorValuesAtTime,
        getLatestIndicatorValues,
        getIndicatorPoints,
    } = useChartSeries({
        mainContainerRef: mainChartContainerRef,
        rsiContainerRef,
        macdContainerRef,
        klines: currentKlines,
        selectedCoin,
        selectedInterval,
        expanded,
    });

    // OHLCV legend on crosshair (managed by useChartLegend)
    const { legend } = useChartLegend({ mainChartRef, candleSeriesRef, volumeSeriesRef });

    // Indicator values on crosshair (managed by useChartIndicatorValues)
    const indicatorValues = useChartIndicatorValues({ mainChartRef, getIndicatorValuesAtTime, getLatestIndicatorValues });

    // Technical signal markers on main chart (managed by useChartSignals)
    const indicatorPts = getIndicatorPoints();
    const volumeRatio = currentKlines.length > 0 ? calcVolumeRatio(currentKlines) : 1;
    useChartSignals({
        candleSeriesRef,
        klines: currentKlines,
        ema20Points: indicatorPts.ema20,
        sma50Points: indicatorPts.sma50,
        rsiPoints: indicatorPts.rsi,
        macdLinePoints: indicatorPts.macdLine,
        macdSignalPoints: indicatorPts.macdSignal,
        volumeRatio,
    });

    // Price lines (managed by useChartPriceLines)
    useChartPriceLines({
        candleSeriesRef,
        selectedCoin,
        selectedInterval,
        items,
        sales,
        futuresPositions,
        aggregated,
        currentKlines,
        watchlistAlerts: config.watchlistAlerts,
    });

    // Measure tool (managed by useMeasureTool)
    const {
        measureMode,
        setMeasureMode,
        measureRect,
        measureStats,
        tooltipPos,
        overlayRef: measureOverlayRef,
        overlayHandlers,
    } = useMeasureTool({
        mainChartRef,
        candleSeriesRef,
        getCurrentKlines,
        selectedCoin,
        selectedInterval,
        mainContainerRef,
    });

    useEffect(() => {
        onCoinChange?.(selectedCoin);
    }, [selectedCoin, onCoinChange]);

    const currentPrice = aggregated.find(a => a.coin === selectedCoin)?.currentPrice ?? 0;
    const coinItems = items.filter((inv) => inv.coin === selectedCoin);
    const coinSales = sales.filter((s) => s.coin === selectedCoin);
    const coinFutures = futuresPositions.filter((p) => p.symbol.replace("USDT", "") === selectedCoin);

    const {
        showAlertForm,
        setShowAlertForm,
        alertTarget,
        setAlertTarget,
        alertDirection,
        setAlertDirection,
        alertPersistent,
        setAlertPersistent,
        alertNote,
        setAlertNote,
        alertSaved,
        handleSaveChartAlert,
    } = useChartAlerts({ config, saveConfig, selectedCoin, currentPrice });

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (explorerRef.current && !explorerRef.current.contains(e.target as Node)) {
                setShowExplorer(false);
                setExplorerError("");
            }
        };
        if (showExplorer) document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [showExplorer]);

    if (coins.length === 0) return null;

    return (
        <ChartCard
            title="Precio de Monedas"
            subtitle="Velas OHLCV · pasa el cursor sobre una vela para ver detalle"
            hideTitleOnMobile
        >
            {/* ── Row 1: Header (activos + precio + toolbar) ───────── */}
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin">
                <div className="flex items-center gap-1 flex-shrink-0">
                    <CoinExplorer
                        coins={coins}
                        portfolioCoins={portfolioCoins}
                        selectedCoin={selectedCoin}
                        setSelectedCoin={setSelectedCoin}
                        signals={signals}
                        showExplorer={showExplorer}
                        setShowExplorer={setShowExplorer}
                        explorerInput={explorerInput}
                        setExplorerInput={setExplorerInput}
                        explorerLoading={explorerLoading}
                        explorerError={explorerError}
                        setExplorerError={setExplorerError}
                        extraCoins={extraCoins}
                        handleSelectExplorerCoin={handleSelectExplorerCoin}
                        explorerRef={explorerRef}
                    />

                    <span className="text-slate-600">|</span>
                </div>

                {/* Price display */}
                {(() => {
                    const klines = currentKlines;
                    const last = klines[klines.length - 1];
                    const price = currentPrice || last?.close || 0;
                    const dir = priceDirections[selectedCoin];
                    const priceColor = dir === "up" ? "text-green-400" : dir === "down" ? "text-red-400" : "text-yellow-300";
                    if (!price) return null;
                    return (
                        <span className={`font-mono font-bold text-base leading-none tracking-tight ${priceColor} flex-shrink-0`}>
                            {fmtPrice(price)}
                        </span>
                    );
                })()}

                <span className="text-slate-600 flex-shrink-0">|</span>

                <div className="flex-shrink-0">
                    <ChartToolbar
                        selectedInterval={selectedInterval}
                        setSelectedInterval={setSelectedInterval}
                        showAlertForm={showAlertForm}
                        setShowAlertForm={setShowAlertForm}
                        measureMode={measureMode}
                        setMeasureMode={setMeasureMode}
                        expanded={expanded}
                        setExpanded={setExpanded}
                        currentPrice={currentPrice}
                        setAlertTarget={setAlertTarget}
                        setAlertDirection={setAlertDirection}
                        setAlertNote={setAlertNote}
                        setAlertPersistent={setAlertPersistent}
                    />
                </div>
            </div>

            {/* ── Row 2: Info bar (OHLCV + indicators + positions) ── */}
            <div className="flex items-center gap-2 text-[10px] font-mono leading-none overflow-x-auto scrollbar-thin">
                {/* OHLCV */}
                {legend && (
                    <>
                        <span className="text-slate-500 whitespace-nowrap">{legend.time}</span>
                        <span className="whitespace-nowrap">O <span className={legend.isUp ? "text-green-400" : "text-red-400"}>{fmtPrice(legend.open)}</span></span>
                        <span className="whitespace-nowrap">H <span className={legend.isUp ? "text-green-400" : "text-red-400"}>{fmtPrice(legend.high)}</span></span>
                        <span className="whitespace-nowrap">L <span className={legend.isUp ? "text-green-400" : "text-red-400"}>{fmtPrice(legend.low)}</span></span>
                        <span className="whitespace-nowrap">C <span className={legend.isUp ? "text-green-400" : "text-red-400"}>{fmtPrice(legend.close)}</span></span>
                        <span className="text-slate-500 whitespace-nowrap">V <span className="text-slate-400">{fmtVol(legend.volume)}</span></span>
                        <span className="text-slate-600">·</span>
                    </>
                )}

                {/* Indicator values */}
                <div className="whitespace-nowrap">
                    <IndicatorHud values={indicatorValues} volumeRatio={volumeRatio} />
                </div>

                {/* Spot/Futures compact */}
                {(() => {
                    const pnl = coinItems.reduce((s, i) => s + (currentPrice - i.buyPrice) * i.quantity, 0);
                    const fPnl = coinFutures.reduce((s, p) => s + p.unrealizedPnl, 0);
                    const hasSpot = coinItems.length > 0;
                    const hasFutures = coinFutures.length > 0;
                    if (!hasSpot && !hasFutures) return null;
                    return (
                        <>
                            <span className="text-slate-600">·</span>
                            {hasSpot && (
                                <span className="text-sky-400 whitespace-nowrap">
                                    Spot <span className={pnl >= 0 ? "text-green-400" : "text-red-400"}>{pnl >= 0 ? "+" : ""}{fmtUSD(pnl)}</span>
                                </span>
                            )}
                            {hasFutures && (
                                <span className="text-purple-400 whitespace-nowrap">
                                    Fut <span className={fPnl >= 0 ? "text-green-400" : "text-red-400"}>{fPnl >= 0 ? "+" : ""}{fmtUSD(fPnl)}</span>
                                </span>
                            )}
                        </>
                    );
                })()}
            </div>

            {/* Inline alert form */}
            {showAlertForm && (
                <AlertForm
                    selectedCoin={selectedCoin}
                    currentPrice={currentPrice}
                    alertTarget={alertTarget}
                    setAlertTarget={setAlertTarget}
                    alertDirection={alertDirection}
                    setAlertDirection={setAlertDirection}
                    alertPersistent={alertPersistent}
                    setAlertPersistent={setAlertPersistent}
                    alertNote={alertNote}
                    setAlertNote={setAlertNote}
                    alertSaved={alertSaved}
                    handleSaveChartAlert={handleSaveChartAlert}
                    onClose={() => setShowAlertForm(false)}
                />
            )}

            {/* Main chart */}
            <div className="relative rounded overflow-hidden">
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-900/70 rounded z-10">
                        <span className="text-xs text-slate-400">Cargando...</span>
                    </div>
                )}
                {fetchError && !loading && (
                    <div className="absolute inset-x-0 top-0 flex justify-center z-10 pointer-events-none">
                        <span className="mt-1.5 text-[10px] font-bold text-red-400 bg-slate-900/85 border border-red-500/40 px-3 py-1 rounded">
                            {fetchError}
                        </span>
                    </div>
                )}
                <div ref={mainContainerRef} className="cursor-crosshair" style={{ height: `${expanded ? 760 : 560}px` }}>
                    <div ref={mainChartContainerRef} />
                    <div ref={rsiContainerRef} />
                    <div ref={macdContainerRef} />
                </div>

                {/* Separador RSI */}
                <div
                    className="absolute left-0 right-0 pointer-events-none z-10"
                    style={{ top: `${0.62 * (expanded ? 760 : 560)}px`, borderTop: '1px solid #334155' }}
                />
                {/* Separador MACD */}
                <div
                    className="absolute left-0 right-0 pointer-events-none z-10"
                    style={{ top: `${0.84 * (expanded ? 760 : 560)}px`, borderTop: '1px solid #334155' }}
                />

                {/* Labels flotantes RSI y MACD */}
                <div className="absolute left-2 pointer-events-none z-10 flex items-center gap-1.5" style={{ top: `${0.62 * (expanded ? 760 : 560) + 5}px` }}>
                    <span className="text-[9px] text-violet-400 font-mono font-bold uppercase tracking-widest">RSI(14)</span>
                    <span className="w-3 h-px inline-block" style={{ background: "#a78bfa" }} />
                    <span className="text-[9px] text-slate-600">30</span>
                    <span className="text-[9px] text-slate-700">–</span>
                    <span className="text-[9px] text-slate-600">70</span>
                </div>
                <div className="absolute left-2 pointer-events-none z-10 flex items-center gap-1.5" style={{ top: `${0.84 * (expanded ? 760 : 560) + 5}px` }}>
                    <span className="text-[9px] text-sky-400 font-mono font-bold uppercase tracking-widest">MACD(12,26,9)</span>
                    <span className="w-3 h-px inline-block" style={{ background: "#38bdf8" }} />
                    <span className="text-[9px] text-slate-600">línea</span>
                    <span className="w-3 h-px inline-block" style={{ background: "#f97316" }} />
                    <span className="text-[9px] text-slate-600">señal</span>
                </div>

                {/* Measure overlay */}
                {measureMode && (
                    <MeasureTool
                        overlayRef={measureOverlayRef}
                        overlayHandlers={overlayHandlers}
                        measureRect={measureRect}
                        measureStats={measureStats}
                        tooltipPos={tooltipPos}
                        selectedInterval={selectedInterval}
                        height={mainChartHeight}
                    />
                )}
            </div>

        </ChartCard>
    );
};

export default CandlestickChart;
