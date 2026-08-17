import React, { useEffect, useRef, useState } from "react";
import type { MouseEventParams } from "lightweight-charts";
import type { CandlestickChartProps, OhlcvLegend } from "../../lib/types/chart";
import ChartCard from "./ChartCard";
import { fmtPrice } from "../../lib/format";
import { useAlerts, WatchlistAlert } from "../../hooks/useAlerts";
import { useChartKlines } from "../../hooks/useChartKlines";
import { useChartSeries } from "../../hooks/useChartSeries";
import { useChartPriceLines } from "../../hooks/useChartPriceLines";
import { useMeasureTool } from "../../hooks/useMeasureTool";
import MeasureTool from "./candlestick/MeasureTool";
import ChartToolbar from "./candlestick/ChartToolbar";
import CoinExplorer from "./candlestick/CoinExplorer";
import ChartLegend from "./candlestick/ChartLegend";
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
        currentKlines, loading,
        getCurrentKlines,
        handleSelectExplorerCoin,
        showExplorer, setShowExplorer,
        explorerInput, setExplorerInput,
        explorerLoading, explorerError,
        setExplorerError,
        explorerRef,
    } = useChartKlines({ coins, initialCoin, klinesMap });

    const [expanded, setExpanded] = useState(false);
    const [legend, setLegend] = useState<OhlcvLegend | null>(null);
    const [klinesRange, setKlinesRange] = useState<{ min: number; max: number } | null>(null);

    // Alert form state
    const [showAlertForm, setShowAlertForm] = useState(false);
    const [alertTarget, setAlertTarget] = useState(0);
    const [alertDirection, setAlertDirection] = useState<'up' | 'down'>('up');
    const [alertPersistent, setAlertPersistent] = useState(false);
    const [alertNote, setAlertNote] = useState("");
    const [alertSaved, setAlertSaved] = useState(false);

    // Chart containers
    const mainContainerRef = useRef<HTMLDivElement>(null);

    // Chart + series (managed by useChartSeries)
    const {
        mainChartRef,
        candleSeriesRef,
        volumeSeriesRef,
    } = useChartSeries({
        containerRef: mainContainerRef,
        klines: currentKlines,
        selectedCoin,
        selectedInterval,
        expanded,
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

    // OHLCV legend on crosshair
    useEffect(() => {
        const chart = mainChartRef.current;
        if (!chart) return;
        const handler = (param: MouseEventParams) => {
            if (!param.time || !(param.seriesData?.size)) return;
            const c = param.seriesData.get(candleSeriesRef.current as any) as any;
            const v = param.seriesData.get(volumeSeriesRef.current as any) as any;
            if (c) {
                const d = new Date((param.time as number) * 1000);
                setLegend({
                    time: d.toLocaleString("es", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
                    open: c.open, high: c.high, low: c.low, close: c.close,
                    volume: v?.value ?? 0,
                    isUp: c.close >= c.open,
                });
            }
        };
        chart.subscribeCrosshairMove(handler);
        return () => { chart.unsubscribeCrosshairMove(handler); };
    }, []);

    // Track klines range
    useEffect(() => {
        const closes = currentKlines.map((k) => k.close);
        if (closes.length > 0) {
            setKlinesRange({ min: Math.min(...closes), max: Math.max(...closes) });
        }
    }, [currentKlines]);

    const currentPrice = aggregated.find(a => a.coin === selectedCoin)?.currentPrice ?? 0;
    const coinItems = items.filter((inv) => inv.coin === selectedCoin);
    const coinSales = sales.filter((s) => s.coin === selectedCoin);
    const coinFutures = futuresPositions.filter((p) => p.symbol.replace("USDT", "") === selectedCoin);

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

    const handleSaveChartAlert = async () => {
        const existing = config.watchlistAlerts?.[selectedCoin] ?? [];
        const newAlert: WatchlistAlert = {
            targetValue: alertTarget,
            direction: alertDirection,
            isPersistent: alertPersistent,
            ...(alertNote.trim() ? { note: alertNote.trim() } : {}),
        };
        await saveConfig({
            ...config,
            watchlistAlerts: {
                ...(config.watchlistAlerts ?? {}),
                [selectedCoin]: [...existing, newAlert],
            },
        });
        setAlertSaved(true);
        setTimeout(() => { setAlertSaved(false); setShowAlertForm(false); setAlertNote(""); }, 1500);
    };

    if (coins.length === 0) return null;

    return (
        <ChartCard
            title="Precio de Monedas"
            subtitle="Velas OHLCV · pasa el cursor sobre una vela para ver detalle"
            hideTitleOnMobile
        >
            {/* Controls */}
            <div className="flex flex-wrap justify-between items-center gap-2">
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

                {/* Price display — center */}
                {(() => {
                    const klines = currentKlines;
                    const last = klines[klines.length - 1];
                    const price = currentPrice || last?.close || 0;
                    const dir = priceDirections[selectedCoin];
                    const priceColor = dir === "up" ? "text-green-400" : dir === "down" ? "text-red-400" : "text-yellow-300";
                    if (!price) return null;
                    return (
                        <div className="flex flex-col items-center">
                            <span className={`font-mono font-bold text-xl leading-none tracking-tight ${priceColor}`}>
                                {fmtPrice(price)}
                            </span>
                        </div>
                    );
                })()}

                {/* Interval + expand */}
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

            {/* OHLCV + Lines + reference prices legend */}
            <ChartLegend
                legend={legend}
                coinSales={coinSales}
                coinItems={coinItems}
                coinFutures={coinFutures}
                currentPrice={currentPrice}
            />

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
            <div className="relative">
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-900/70 rounded z-10">
                        <span className="text-xs text-slate-400">Cargando...</span>
                    </div>
                )}
                <div ref={mainContainerRef} />

                {/* Separador RSI — línea horizontal entre precio/volumen y RSI */}
                <div
                    className="absolute left-0 right-0 pointer-events-none z-10"
                    style={{ top: `${0.60 * (expanded ? 760 : 560)}px`, borderTop: '1px solid #334155' }}
                />
                {/* Separador MACD — línea horizontal entre RSI y MACD */}
                <div
                    className="absolute left-0 right-0 pointer-events-none z-10"
                    style={{ top: `${0.80 * (expanded ? 760 : 560)}px`, borderTop: '1px solid #334155' }}
                />

                {/* Labels flotantes RSI y MACD */}
                <div className="absolute left-2 pointer-events-none z-10 flex items-center gap-1.5" style={{ top: `${0.60 * (expanded ? 760 : 560) + 5}px` }}>
                    <span className="text-[9px] text-violet-400 font-mono font-bold uppercase tracking-widest">RSI(14)</span>
                    <span className="w-3 h-px inline-block" style={{ background: "#a78bfa" }} />
                    <span className="text-[9px] text-slate-600">30</span>
                    <span className="text-[9px] text-slate-700">–</span>
                    <span className="text-[9px] text-slate-600">70</span>
                </div>
                <div className="absolute left-2 pointer-events-none z-10 flex items-center gap-1.5" style={{ top: `${0.80 * (expanded ? 760 : 560) + 5}px` }}>
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
                    />
                )}
            </div>

        </ChartCard>
    );
};

export default CandlestickChart;
