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
import { useChartPreferences } from "../../hooks/useChartPreferences";
import { calcVolumeRatio } from "../../lib/indicators";
import { fmtVol } from "./candlestick/chartUtils";
import MeasureTool from "./candlestick/MeasureTool";
import ChartToolbar from "./candlestick/ChartToolbar";
import CoinExplorer from "./candlestick/CoinExplorer";
import IndicatorHud from "./candlestick/IndicatorHud";
import AlertForm from "./candlestick/AlertForm";
import ChartPanelToggle from "./candlestick/ChartPanelToggle";
import ChartIndicatorMenu from "./candlestick/ChartIndicatorMenu";

const CandlestickChart: React.FC<CandlestickChartProps> = ({
    aggregated, klinesMap = {}, items, initialCoin, signals = [], onCoinChange, priceDirections = {}, sales = [], futuresPositions = [],
}) => {
    const portfolioCoins = aggregated.filter((a) => a.currentValue > 0).map((a) => a.coin);
    const futuresCoins = futuresPositions.map((p) => p.symbol.replace("USDT", ""));
    const coins = Array.from(new Set([...portfolioCoins, ...futuresCoins]));
    const extraCoins = Object.keys(klinesMap).filter(c => !coins.includes(c));
    const { config, saveConfig } = useAlerts();

    // ── Preferences ──────────────────────────────────────────────
    const { prefs, updatePref } = useChartPreferences();

    const {
        selectedCoin, setSelectedCoin: setCoinRaw,
        selectedInterval, setSelectedInterval: setIntervalRaw,
        currentKlines, loading, fetchError,
        getCurrentKlines,
        handleSelectExplorerCoin,
        showExplorer, setShowExplorer,
        explorerInput, setExplorerInput,
        explorerLoading, explorerError,
        setExplorerError,
        explorerRef,
    } = useChartKlines({ coins, initialCoin: prefs.selectedCoin || initialCoin, klinesMap });

    // Wrap setters to persist
    const setSelectedCoin = (c: string | ((prev: string) => string)) => {
        const next = typeof c === "function" ? c(selectedCoin) : c;
        setCoinRaw(next);
        updatePref("selectedCoin", next);
    };
    const setSelectedInterval = (iv: typeof selectedInterval | ((prev: typeof selectedInterval) => typeof selectedInterval)) => {
        const next = typeof iv === "function" ? iv(selectedInterval) : iv;
        setIntervalRaw(next);
        updatePref("selectedInterval", next);
    };

    // Sync initial interval from prefs
    useEffect(() => {
        if (prefs.selectedInterval && prefs.selectedInterval !== selectedInterval) {
            setIntervalRaw(prefs.selectedInterval as typeof selectedInterval);
        }
    }, []);

    const [expanded, setExpandedRaw] = useState(prefs.expanded);
    const setExpanded = (v: boolean | ((prev: boolean) => boolean)) => {
        const next = typeof v === "function" ? v(expanded) : v;
        setExpandedRaw(next);
        updatePref("expanded", next);
    };

    // ── Panel toggles (RSI / MACD) ───────────────────────────────
    const [rsiOpen, setRsiOpenRaw] = useState(prefs.rsiOpen);
    const [macdOpen, setMacdOpenRaw] = useState(prefs.macdOpen);
    const setRsiOpen = (v: boolean | ((prev: boolean) => boolean)) => {
        const next = typeof v === "function" ? v(rsiOpen) : v;
        setRsiOpenRaw(next);
        updatePref("rsiOpen", next);
    };
    const setMacdOpen = (v: boolean | ((prev: boolean) => boolean)) => {
        const next = typeof v === "function" ? v(macdOpen) : v;
        setMacdOpenRaw(next);
        updatePref("macdOpen", next);
    };

    // ── Indicator visibility ──────────────────────────────────────
    const [ema20Visible, setEma20Visible] = useState(prefs.ema20Visible);
    const [sma50Visible, setSma50Visible] = useState(prefs.sma50Visible);
    const [sma200Visible, setSma200Visible] = useState(prefs.sma200Visible);
    const [volumeVisible, setVolumeVisible] = useState(prefs.volumeVisible);
    const [signalsVisible, setSignalsVisible] = useState(prefs.signalsVisible);

    const handleIndicatorToggle = (key: string) => {
        switch (key) {
            case "ema20": setEma20Visible(v => { updatePref("ema20Visible", !v); return !v; }); break;
            case "sma50": setSma50Visible(v => { updatePref("sma50Visible", !v); return !v; }); break;
            case "sma200": setSma200Visible(v => { updatePref("sma200Visible", !v); return !v; }); break;
            case "volume": setVolumeVisible(v => { updatePref("volumeVisible", !v); return !v; }); break;
            case "signals": setSignalsVisible(v => { updatePref("signalsVisible", !v); return !v; }); break;
        }
    };

    // ── Dynamic chart heights ─────────────────────────────────────
    const totalH = expanded ? 760 : 560;
    const panelCount = (rsiOpen ? 1 : 0) + (macdOpen ? 1 : 0);
    let mainH: number, rsiH: number, macdH: number;
    if (panelCount === 0) {
        mainH = totalH; rsiH = 0; macdH = 0;
    } else if (panelCount === 1) {
        mainH = Math.round(totalH * 0.75);
        rsiH = rsiOpen ? totalH - mainH : 0;
        macdH = macdOpen ? totalH - mainH : 0;
    } else {
        mainH = Math.round(totalH * 0.62);
        rsiH = Math.round(totalH * 0.22);
        macdH = totalH - mainH - rsiH;
    }

    // ── Chart containers ──────────────────────────────────────────
    const mainContainerRef = useRef<HTMLDivElement>(null);
    const mainChartContainerRef = useRef<HTMLDivElement>(null);
    const rsiContainerRef = useRef<HTMLDivElement>(null);
    const macdContainerRef = useRef<HTMLDivElement>(null);

    // ── Chart series ──────────────────────────────────────────────
    const {
        mainChartRef, candleSeriesRef, volumeSeriesRef,
        getIndicatorValuesAtTime, getLatestIndicatorValues, getIndicatorPoints,
    } = useChartSeries({
        mainContainerRef: mainChartContainerRef,
        rsiContainerRef,
        macdContainerRef,
        klines: currentKlines,
        selectedCoin,
        selectedInterval,
        expanded,
        rsiOpen,
        macdOpen,
        ema20Visible,
        sma50Visible,
        sma200Visible,
        volumeVisible,
    });

    const { legend } = useChartLegend({ mainChartRef, candleSeriesRef, volumeSeriesRef });
    const indicatorValues = useChartIndicatorValues({ mainChartRef, getIndicatorValuesAtTime, getLatestIndicatorValues });

    // ── Signals ───────────────────────────────────────────────────
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
        enabled: signalsVisible,
    });

    // ── Price lines ───────────────────────────────────────────────
    useChartPriceLines({
        candleSeriesRef, selectedCoin, selectedInterval,
        items, sales, futuresPositions, aggregated, currentKlines,
        watchlistAlerts: config.watchlistAlerts,
    });

    // ── Measure tool ──────────────────────────────────────────────
    const {
        measureMode, setMeasureMode, measureRect, measureStats, tooltipPos,
        overlayRef: measureOverlayRef, overlayHandlers,
    } = useMeasureTool({ mainChartRef, candleSeriesRef, getCurrentKlines, selectedCoin, selectedInterval, mainContainerRef });

    useEffect(() => { onCoinChange?.(selectedCoin); }, [selectedCoin, onCoinChange]);

    const currentPrice = aggregated.find(a => a.coin === selectedCoin)?.currentPrice ?? 0;
    const coinItems = items.filter((inv) => inv.coin === selectedCoin);
    const coinFutures = futuresPositions.filter((p) => p.symbol.replace("USDT", "") === selectedCoin);

    const {
        showAlertForm, setShowAlertForm, alertTarget, setAlertTarget,
        alertDirection, setAlertDirection, alertPersistent, setAlertPersistent,
        alertNote, setAlertNote, alertSaved, handleSaveChartAlert,
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

    const priceDir = priceDirections[selectedCoin];
    const priceColor = priceDir === "up" ? "text-green-400" : priceDir === "down" ? "text-red-400" : "text-yellow-300";

    return (
        <ChartCard>
            {/* ── Header: [Activo] [Timeframe] [Indicadores] [Alerta] [Medir] [Expand] ── */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-thin">
                <CoinExplorer
                    coins={coins} portfolioCoins={portfolioCoins} selectedCoin={selectedCoin}
                    setSelectedCoin={setSelectedCoin} signals={signals}
                    showExplorer={showExplorer} setShowExplorer={setShowExplorer}
                    explorerInput={explorerInput} setExplorerInput={setExplorerInput}
                    explorerLoading={explorerLoading} explorerError={explorerError}
                    setExplorerError={setExplorerError} extraCoins={extraCoins}
                    handleSelectExplorerCoin={handleSelectExplorerCoin} explorerRef={explorerRef}
                />

                <span className="text-slate-600">|</span>

                <ChartIndicatorMenu
                    ema20Visible={ema20Visible} sma50Visible={sma50Visible}
                    sma200Visible={sma200Visible} volumeVisible={volumeVisible}
                    signalsVisible={signalsVisible} onToggle={handleIndicatorToggle}
                />

                <span className="text-slate-600">|</span>

                <ChartPanelToggle label="RSI" color="#a78bfa" open={rsiOpen} onToggle={() => setRsiOpen(v => !v)} />
                <ChartPanelToggle label="MACD" color="#38bdf8" open={macdOpen} onToggle={() => setMacdOpen(v => !v)} />

                <div className="flex-1" />

                <ChartToolbar
                    selectedInterval={selectedInterval} setSelectedInterval={setSelectedInterval}
                    showAlertForm={showAlertForm} setShowAlertForm={setShowAlertForm}
                    measureMode={measureMode} setMeasureMode={setMeasureMode}
                    expanded={expanded} setExpanded={setExpanded}
                    currentPrice={currentPrice} setAlertTarget={setAlertTarget}
                    setAlertDirection={setAlertDirection} setAlertNote={setAlertNote}
                    setAlertPersistent={setAlertPersistent}
                />
            </div>

            {/* ── Info bar (OHLCV + indicators + positions) ── */}
            <div className="flex items-center gap-2 text-[10px] font-mono leading-none overflow-x-auto scrollbar-thin">
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
                <div className="whitespace-nowrap">
                    <IndicatorHud values={indicatorValues} volumeRatio={volumeRatio} />
                </div>
                {(() => {
                    const pnl = coinItems.reduce((s, i) => s + (currentPrice - i.buyPrice) * i.quantity, 0);
                    const fPnl = coinFutures.reduce((s, p) => s + p.unrealizedPnl, 0);
                    const hasSpot = coinItems.length > 0;
                    const hasFutures = coinFutures.length > 0;
                    if (!hasSpot && !hasFutures) return null;
                    return (
                        <>
                            <span className="text-slate-600">·</span>
                            {hasSpot && <span className="text-sky-400 whitespace-nowrap">Spot <span className={pnl >= 0 ? "text-green-400" : "text-red-400"}>{pnl >= 0 ? "+" : ""}{fmtUSD(pnl)}</span></span>}
                            {hasFutures && <span className="text-purple-400 whitespace-nowrap">Fut <span className={fPnl >= 0 ? "text-green-400" : "text-red-400"}>{fPnl >= 0 ? "+" : ""}{fmtUSD(fPnl)}</span></span>}
                        </>
                    );
                })()}
            </div>

            {/* ── Alert form ──────────────────────────────────────── */}
            {showAlertForm && (
                <AlertForm
                    selectedCoin={selectedCoin} currentPrice={currentPrice}
                    alertTarget={alertTarget} setAlertTarget={setAlertTarget}
                    alertDirection={alertDirection} setAlertDirection={setAlertDirection}
                    alertPersistent={alertPersistent} setAlertPersistent={setAlertPersistent}
                    alertNote={alertNote} setAlertNote={setAlertNote}
                    alertSaved={alertSaved} handleSaveChartAlert={handleSaveChartAlert}
                    onClose={() => setShowAlertForm(false)}
                />
            )}

            {/* ── Chart area ──────────────────────────────────────── */}
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

                {/* Big price — top right */}
                {currentPrice > 0 && (
                    <div className="absolute top-2 right-2 z-20 pointer-events-none text-right">
                        <span className={`font-mono font-bold text-2xl leading-none tracking-tight ${priceColor}`}>
                            {fmtPrice(currentPrice)}
                        </span>
                        {priceDir && (
                            <span className={`block text-[10px] font-mono mt-0.5 ${priceColor}`}>
                                {priceDir === "up" ? "▲" : "▼"} {selectedCoin}
                            </span>
                        )}
                    </div>
                )}

                {/* Chart containers — all always in DOM for refs to exist at mount */}
                <div ref={mainContainerRef} className="cursor-crosshair" style={{ height: `${mainH}px` }}>
                    <div ref={mainChartContainerRef} />
                </div>

                <div ref={rsiContainerRef} style={{ height: rsiOpen && rsiH > 0 ? `${rsiH}px` : '0px', overflow: 'hidden' }}>
                    {rsiOpen && rsiH > 0 && (
                        <div className="absolute left-0 right-0 pointer-events-none z-10" style={{ top: `${mainH}px`, borderTop: '1px solid #334155' }} />
                    )}
                </div>

                <div ref={macdContainerRef} style={{ height: macdOpen && macdH > 0 ? `${macdH}px` : '0px', overflow: 'hidden' }}>
                    {macdOpen && macdH > 0 && (
                        <div className="absolute left-0 right-0 pointer-events-none z-10" style={{ top: `${mainH + rsiH}px`, borderTop: '1px solid #334155' }} />
                    )}
                </div>

                {/* RSI/MACD labels (only when panels open) */}
                {rsiOpen && rsiH > 0 && (
                    <div className="absolute left-2 pointer-events-none z-10 flex items-center gap-1.5" style={{ top: `${mainH + 5}px` }}>
                        <span className="text-[9px] text-violet-400 font-mono font-bold uppercase tracking-widest">RSI(14)</span>
                        <span className="w-3 h-px inline-block" style={{ background: "#a78bfa" }} />
                        <span className="text-[9px] text-slate-600">30</span>
                        <span className="text-[9px] text-slate-700">–</span>
                        <span className="text-[9px] text-slate-600">70</span>
                    </div>
                )}
                {macdOpen && macdH > 0 && (
                    <div className="absolute left-2 pointer-events-none z-10 flex items-center gap-1.5" style={{ top: `${mainH + rsiH + 5}px` }}>
                        <span className="text-[9px] text-sky-400 font-mono font-bold uppercase tracking-widest">MACD(12,26,9)</span>
                        <span className="w-3 h-px inline-block" style={{ background: "#38bdf8" }} />
                        <span className="text-[9px] text-slate-600">línea</span>
                        <span className="w-3 h-px inline-block" style={{ background: "#f97316" }} />
                        <span className="text-[9px] text-slate-600">señal</span>
                    </div>
                )}

                {/* Panel toggle buttons when closed — shown at bottom of chart */}
                {(!rsiOpen || !macdOpen) && (
                    <div className="absolute bottom-1 left-2 z-20 flex items-center gap-1 pointer-events-auto">
                        {!rsiOpen && (
                            <button onClick={() => setRsiOpen(true)} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-700/80 text-violet-400 hover:bg-slate-600 transition-colors">
                                <span>RSI</span><span className="text-slate-500">▸</span>
                            </button>
                        )}
                        {!macdOpen && (
                            <button onClick={() => setMacdOpen(true)} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-700/80 text-sky-400 hover:bg-slate-600 transition-colors">
                                <span>MACD</span><span className="text-slate-500">▸</span>
                            </button>
                        )}
                    </div>
                )}

                {/* Measure overlay */}
                {measureMode && (
                    <MeasureTool
                        overlayRef={measureOverlayRef}
                        overlayHandlers={overlayHandlers}
                        measureRect={measureRect}
                        measureStats={measureStats}
                        tooltipPos={tooltipPos}
                        selectedInterval={selectedInterval}
                        height={mainH}
                    />
                )}
            </div>
        </ChartCard>
    );
};

export default CandlestickChart;
