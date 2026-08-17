import React, { useEffect, useRef, useState } from "react";
import type { MouseEventParams } from "lightweight-charts";
import { AggregatedAsset, ProcessedInvestment, SaleRecord } from "../../lib/constants";
import type { CandlestickChartProps, Interval, OhlcvLegend } from "../../lib/types/chart";
import { INTERVAL_LABELS } from "../../lib/types/chart";
import { FuturesPosition } from "../../lib/futures"; // Need to import FuturesPosition
import ChartCard from "./ChartCard";
import { coinColor } from "./chartColors";
import { fmtPrice, fmtUSD } from "../../lib/format";
import { Maximize2, Minimize2, Bell, Ruler, Plus, X } from "lucide-react";
import { useAlerts, WatchlistAlert } from "../../hooks/useAlerts";
import { fmtVol, signalDotColor } from "./candlestick/chartUtils";
import { useChartKlines } from "../../hooks/useChartKlines";
import { useChartSeries } from "../../hooks/useChartSeries";
import { useChartPriceLines } from "../../hooks/useChartPriceLines";
import { useMeasureTool } from "../../hooks/useMeasureTool";
import MeasureTool from "./candlestick/MeasureTool";

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
                {/* Coin selector with signal dots */}
                <div className="flex flex-wrap items-center gap-1">

                    {/* Portfolio coin tabs */}
                    {coins.map((coin) => {
                        const sig = signals.find((s) => s.coin === coin);
                        const dot = signalDotColor(sig?.signal);
                        return (
                            <button
                                key={coin}
                                onClick={() => setSelectedCoin(coin)}
                                className={`relative px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                                    selectedCoin === coin
                                        ? "text-white"
                                        : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                                }`}
                                style={selectedCoin === coin ? { backgroundColor: coinColor(coin) } : {}}
                            >
                                {coin}
                                {dot && (
                                    <span
                                        className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full border border-slate-800"
                                        style={{ backgroundColor: dot }}
                                    />
                                )}
                            </button>
                        );
                    })}

                    {/* Active non-portfolio coin badge */}
                    {!portfolioCoins.includes(selectedCoin) && selectedCoin && (
                        <>
                            <span className="text-slate-600 text-[10px] select-none">|</span>
                            <span
                                className="relative flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold text-white"
                                style={{ backgroundColor: coinColor(selectedCoin) }}
                            >
                                {selectedCoin}
                                <button
                                    onClick={() => setSelectedCoin(portfolioCoins[0] || "")}
                                    className="ml-0.5 hover:opacity-70 transition-opacity"
                                    title="Volver al portafolio"
                                >
                                    <X className="w-2.5 h-2.5" />
                                </button>
                            </span>
                        </>
                    )}

                    {/* Explorer button + popover */}
                    <div className="relative" ref={explorerRef}>
                        <button
                            onClick={() => { setShowExplorer(v => !v); setExplorerError(""); }}
                            className={`flex items-center gap-0.5 px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                                showExplorer
                                    ? "bg-violet-600 text-white"
                                    : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                            }`}
                            title="Explorar monedas"
                        >
                            <Plus className="w-3 h-3" />
                            Explorar
                        </button>

                        {showExplorer && (
                            <div className="absolute top-full left-0 mt-1.5 z-50 bg-slate-800 border border-slate-600/60 rounded-xl p-3 shadow-2xl w-64">
                                {/* Pre-loaded coins grid */}
                                {extraCoins.length > 0 && (
                                    <>
                                        <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide mb-2">Disponibles</p>
                                        <div className="flex flex-wrap gap-1 mb-3">
                                            {extraCoins.map((coin) => {
                                                const sig = signals.find((s) => s.coin === coin);
                                                const dot = signalDotColor(sig?.signal);
                                                return (
                                                    <button
                                                        key={coin}
                                                        onClick={() => handleSelectExplorerCoin(coin)}
                                                        className="relative px-2 py-0.5 rounded text-[10px] font-bold bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
                                                    >
                                                        {coin}
                                                        {dot && (
                                                            <span
                                                                className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full border border-slate-800"
                                                                style={{ backgroundColor: dot }}
                                                            />
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </>
                                )}

                                {/* Custom ticker input */}
                                <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide mb-1.5">Cualquier par /USDT</p>
                                <div className="flex gap-1">
                                    <input
                                        type="text"
                                        value={explorerInput}
                                        onChange={(e) => { setExplorerInput(e.target.value.toUpperCase()); setExplorerError(""); }}
                                        onKeyDown={(e) => e.key === "Enter" && handleSelectExplorerCoin(explorerInput)}
                                        placeholder="PEPE, WIF, BONK..."
                                        className="flex-1 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600 focus:outline-none focus:border-violet-500 placeholder-slate-500"
                                        autoFocus
                                    />
                                    <button
                                        onClick={() => handleSelectExplorerCoin(explorerInput)}
                                        disabled={explorerLoading || !explorerInput.trim()}
                                        className="px-2 py-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-xs rounded font-bold transition-colors"
                                    >
                                        {explorerLoading ? "..." : "IR"}
                                    </button>
                                </div>
                                {explorerError && (
                                    <p className="text-[10px] text-red-400 mt-1.5">{explorerError}</p>
                                )}
                            </div>
                        )}
                    </div>
                </div>

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
                <div className="flex items-center gap-1.5">
                    <div className="flex gap-1">
                        {(["15m", "1h", "4h", "1d", "1M"] as Interval[]).map((iv) => (
                            <button
                                key={iv}
                                onClick={() => setSelectedInterval(iv)}
                                className={`px-2.5 py-1 rounded text-[10px] font-bold transition-colors ${
                                    selectedInterval === iv
                                        ? "bg-yellow-600 text-white"
                                        : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                                }`}
                            >
                                {INTERVAL_LABELS[iv]}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={() => {
                            if (!showAlertForm) {
                                setAlertTarget(currentPrice);
                                setAlertDirection('up');
                                setAlertNote("");
                                setAlertPersistent(false);
                            }
                            setShowAlertForm(v => !v);
                        }}
                        className={`flex items-center gap-1 px-2 py-1.5 rounded text-[10px] font-bold border transition-colors ${
                            showAlertForm
                                ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40'
                                : 'bg-slate-700 text-slate-400 border-slate-700 hover:text-yellow-300'
                        }`}
                        title="Nueva alerta de precio"
                    >
                        <Bell className="w-3 h-3" />
                        <span>Alerta</span>
                    </button>
                    <button
                        onClick={() => setMeasureMode(v => !v)}
                        className={`flex items-center gap-1 px-2 py-1.5 rounded text-[10px] font-bold border transition-colors ${
                            measureMode
                                ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                                : 'bg-slate-700 text-slate-400 border-slate-700 hover:text-sky-300'
                        }`}
                        title={measureMode ? "Salir de medición (Esc)" : "Medir rango de precio"}
                    >
                        <Ruler className="w-3 h-3" />
                        <span>Medir</span>
                    </button>
                    <button
                        onClick={() => setExpanded((e) => !e)}
                        className="p-1.5 rounded bg-slate-700 text-slate-400 hover:bg-slate-600 transition-colors"
                        title={expanded ? "Contraer" : "Expandir"}
                    >
                        {expanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                    </button>
                </div>
            </div>

            {/* OHLCV Legend */}
            {legend && (
                <div className="flex items-center gap-3 text-[10px] font-mono text-slate-500 flex-wrap">
                    <span className="text-slate-500">{legend.time}</span>
                    <span>O <span className={legend.isUp ? "text-green-400" : "text-red-400"}>{fmtPrice(legend.open)}</span></span>
                    <span>H <span className={legend.isUp ? "text-green-400" : "text-red-400"}>{fmtPrice(legend.high)}</span></span>
                    <span>L <span className={legend.isUp ? "text-green-400" : "text-red-400"}>{fmtPrice(legend.low)}</span></span>
                    <span>C <span className={legend.isUp ? "text-green-400" : "text-red-400"}>{fmtPrice(legend.close)}</span></span>
                    <span>V <span className="text-slate-400">{fmtVol(legend.volume)}</span></span>
                </div>
            )}

            {/* Lines legend */}
            <div className="flex items-center gap-3 text-[9px] text-slate-500 flex-wrap">
                <span className="flex items-center gap-1">
                    <span className="w-5 h-px inline-block" style={{ background: "#38bdf8" }} />
                    EMA20
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-5 h-px inline-block" style={{ background: "#fb923c" }} />
                    SMA50
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-5 h-0.5 inline-block" style={{ background: "#eab308" }} />
                    SMA200
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-5 border-t border-dashed border-[#60a5fa] inline-block" />
                    Compra
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-5 border-t-2 border-dashed border-[#f59e0b] inline-block" />
                    Promedio
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-5 h-px inline-block" style={{ background: "#22d3ee" }} />
                    Actual
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-5 border-t-2 border-dashed border-[#ef4444] inline-block" />
                    Venta
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-5 border-t border-dashed border-[#a855f7] inline-block" />
                    Futuro
                </span>
            </div>

            {/* Precios de referencia para la moneda seleccionada */}
            {(coinSales.length > 0 || coinItems.length > 0 || coinFutures.length > 0) && (
                <div className="flex flex-col gap-1 mt-2 text-[9px]">
                    {coinSales.length > 0 && (
                        <div className="flex items-center gap-x-4 gap-y-0.5 flex-wrap">
                            <span className="text-slate-500 font-bold uppercase">Ventas:</span>
                            {coinSales.map((s, i) => (
                                <span key={s.id} className="text-red-400 font-mono">
                                    Venta{coinSales.length > 1 ? ` ${i + 1}` : ""}: {fmtPrice(s.sellPrice)}
                                </span>
                            ))}
                        </div>
                    )}
                    {coinItems.length > 0 && (
                        <div className="flex items-center gap-x-4 gap-y-0.5 flex-wrap">
                            <span className="text-slate-500 font-bold uppercase">Spot:</span>
                            {coinItems.map((inv, i) => {
                                const pnl = (currentPrice - inv.buyPrice) * inv.quantity;
                                return (
                                    <span key={inv.id} className="text-sky-400 font-mono">
                                        Compra{coinItems.length > 1 ? ` ${i + 1}` : ""}: {fmtPrice(inv.buyPrice)}
                                        <span className={pnl >= 0 ? "text-green-400" : "text-red-400"}> ({pnl >= 0 ? "+" : ""}{fmtUSD(pnl)})</span>
                                    </span>
                                )
                            })}
                        </div>
                    )}
                    {coinFutures.length > 0 && (
                        <div className="flex items-center gap-x-4 gap-y-0.5 flex-wrap">
                            <span className="text-slate-500 font-bold uppercase">Futuros:</span>
                            {coinFutures.map((p, i) => {
                                const pnl = p.unrealizedPnl;
                                return (
                                    <span key={i} className="text-purple-400 font-mono">
                                        {p.side}: {fmtPrice(p.entryPrice)}
                                        <span className={pnl >= 0 ? "text-green-400" : "text-red-400"}> ({pnl >= 0 ? "+" : ""}{fmtUSD(pnl)})</span>
                                    </span>
                                )
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Inline alert form */}
            {showAlertForm && (
                <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 flex flex-wrap items-center gap-2">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">🔔 {selectedCoin}</span>
                    {currentPrice > 0 && (
                        (alertDirection === 'up' && currentPrice >= alertTarget) ||
                        (alertDirection === 'down' && currentPrice <= alertTarget)
                    ) && (
                        <span className="w-full text-[10px] font-bold text-yellow-400">
                            ⚠️ El precio actual ya {alertDirection === 'up' ? 'supera' : 'está por debajo de'} {fmtPrice(alertTarget)} — se disparará en el próximo ciclo
                        </span>
                    )}
                    <input
                        type="number"
                        value={alertTarget}
                        onChange={e => {
                            const v = parseFloat(e.target.value) || 0;
                            setAlertTarget(v);
                            setAlertDirection(v >= currentPrice ? 'up' : 'down');
                        }}
                        className="w-28 h-7 bg-slate-800 border border-slate-700 rounded px-2 text-xs font-bold text-white text-center focus:outline-none focus:border-yellow-500"
                    />
                    <button
                        onClick={() => setAlertDirection('up')}
                        className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors ${alertDirection === 'up' ? 'bg-green-500/20 text-green-400 border-green-500/40' : 'bg-slate-800 text-slate-500 border-slate-700 hover:text-green-400'}`}
                    >▲ Sube a</button>
                    <button
                        onClick={() => setAlertDirection('down')}
                        className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors ${alertDirection === 'down' ? 'bg-red-500/20 text-red-400 border-red-500/40' : 'bg-slate-800 text-slate-500 border-slate-700 hover:text-red-400'}`}
                    >▼ Baja a</button>
                    <button
                        onClick={() => setAlertPersistent(v => !v)}
                        className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors ${alertPersistent ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40' : 'bg-slate-800 text-slate-500 border-slate-700 hover:text-yellow-400'}`}
                    >{alertPersistent ? '∞ Perm.' : '1x Vez'}</button>
                    <input
                        type="text"
                        placeholder="Nota..."
                        value={alertNote}
                        onChange={e => setAlertNote(e.target.value)}
                        maxLength={100}
                        className="flex-1 min-w-[80px] h-7 bg-slate-800 border border-slate-700 rounded px-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-slate-500"
                    />
                    <button
                        onClick={handleSaveChartAlert}
                        disabled={alertSaved}
                        className={`px-3 py-1 rounded text-[10px] font-bold transition-colors disabled:opacity-70 ${
                            currentPrice > 0 && (
                                (alertDirection === 'up' && currentPrice >= alertTarget) ||
                                (alertDirection === 'down' && currentPrice <= alertTarget)
                            )
                                ? 'bg-orange-500 text-white hover:bg-orange-400'
                                : 'bg-yellow-500 text-slate-900 hover:bg-yellow-400'
                        }`}
                    >{alertSaved ? '✅' : '+ Agregar'}</button>
                    <button onClick={() => setShowAlertForm(false)} className="text-slate-500 hover:text-white text-xs leading-none">✕</button>
                </div>
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
