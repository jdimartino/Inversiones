import React, { useEffect, useRef, useState, useCallback } from "react";
import {
    createChart,
    ColorType,
    LineStyle,
    CrosshairMode,
    IChartApi,
    ISeriesApi,
} from "lightweight-charts";
import { AggregatedAsset, ProcessedInvestment } from "../../lib/constants";
import type { Kline, CoinSignal } from "../../lib/types/signals";
import ChartCard from "./ChartCard";
import { coinColor } from "./chartColors";
import { fmtPrice } from "../../lib/format";
import { Maximize2, Minimize2 } from "lucide-react";

// ── Indicator utilities ─────────────────────────────────────────────

function computeEMA(data: number[], period: number): number[] {
    if (data.length === 0) return [];
    const k = 2 / (period + 1);
    const result: number[] = [data[0]];
    for (let i = 1; i < data.length; i++) {
        result.push(data[i] * k + result[i - 1] * (1 - k));
    }
    return result;
}

function computeSMA(data: number[], period: number): (number | null)[] {
    return data.map((_, i) => {
        if (i < period - 1) return null;
        return data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
    });
}

function computeRSI(closes: number[], period = 14): (number | null)[] {
    const result: (number | null)[] = new Array(closes.length).fill(null);
    if (closes.length < period + 1) return result;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const d = closes[i] - closes[i - 1];
        if (d > 0) gains += d; else losses -= d;
    }
    let ag = gains / period, al = losses / period;
    result[period] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
    for (let i = period + 1; i < closes.length; i++) {
        const d = closes[i] - closes[i - 1];
        ag = (ag * (period - 1) + Math.max(d, 0)) / period;
        al = (al * (period - 1) + Math.max(-d, 0)) / period;
        result[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
    }
    return result;
}

function computeMACD(closes: number[]): {
    macd: (number | null)[];
    signal: (number | null)[];
    histogram: (number | null)[];
} {
    if (closes.length < 35) return { macd: [], signal: [], histogram: [] };
    const ema12 = computeEMA(closes, 12);
    const ema26 = computeEMA(closes, 26);
    const macd: (number | null)[] = ema12.map((v, i) => (i >= 25 ? v - ema26[i] : null));

    // Compute signal EMA only from valid MACD values
    const validMacd = macd.filter((v): v is number => v !== null);
    const signalEMA = computeEMA(validMacd, 9);
    const signal: (number | null)[] = new Array(closes.length).fill(null);
    let vi = 0;
    macd.forEach((v, i) => {
        if (v !== null) {
            if (vi >= 8) signal[i] = signalEMA[vi];
            vi++;
        }
    });

    const histogram: (number | null)[] = macd.map((v, i) =>
        v !== null && signal[i] !== null ? v - (signal[i] as number) : null
    );
    return { macd, signal, histogram };
}

function fmtVol(v: number): string {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
    return v.toFixed(0);
}

function signalDotColor(sig?: string): string | null {
    if (sig === "strong_buy") return "#16a34a";
    if (sig === "buy") return "#4ade80";
    if (sig === "hold") return "#94a3b8";
    if (sig === "sell") return "#f97316";
    if (sig === "strong_sell") return "#ef4444";
    return null;
}

// ── Types ───────────────────────────────────────────────────────────

interface CandlestickChartProps {
    aggregated: AggregatedAsset[];
    klinesMap: Record<string, Kline[]>;
    items: ProcessedInvestment[];
    initialCoin?: string;
    signals?: CoinSignal[];
}

type Interval = "15m" | "1h" | "4h" | "1d" | "1M";

const INTERVAL_LABELS: Record<Interval, string> = {
    "15m": "15M",
    "1h": "1H",
    "4h": "4H",
    "1d": "1D",
    "1M": "MES",
};

interface OhlcvLegend {
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    isUp: boolean;
}

// ── Fetch helper ────────────────────────────────────────────────────

async function fetchKlines(coin: string, interval: Interval): Promise<Kline[]> {
    const symbol = `${coin}USDT`;
    const res = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=100`
    );
    const raw: any[][] = await res.json();
    return raw.map((k) => ({
        openTime: k[0] as number,
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
        closeTime: k[6] as number,
    }));
}

// ── Component ───────────────────────────────────────────────────────

const CandlestickChart: React.FC<CandlestickChartProps> = ({
    aggregated, klinesMap, items, initialCoin, signals = [],
}) => {
    const coins = aggregated.filter((a) => a.currentValue > 0).map((a) => a.coin);

    const [selectedCoin, setSelectedCoin] = useState<string>(
        initialCoin && coins.includes(initialCoin) ? initialCoin : coins[0] || ""
    );
    const [selectedInterval, setSelectedInterval] = useState<Interval>("4h");
    const [extraKlines, setExtraKlines] = useState<Record<string, Partial<Record<Interval, Kline[]>>>>({});
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [legend, setLegend] = useState<OhlcvLegend | null>(null);

    // Chart containers
    const mainContainerRef = useRef<HTMLDivElement>(null);
    const rsiContainerRef = useRef<HTMLDivElement>(null);
    const macdContainerRef = useRef<HTMLDivElement>(null);

    // Chart instances
    const mainChartRef = useRef<IChartApi | null>(null);
    const rsiChartRef = useRef<IChartApi | null>(null);
    const macdChartRef = useRef<IChartApi | null>(null);

    // Series refs
    const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    const sma20Ref = useRef<ISeriesApi<"Line"> | null>(null);
    const sma50Ref = useRef<ISeriesApi<"Line"> | null>(null);
    const priceLinesRef = useRef<ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]>[]>([]);
    const rsiSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
    const macdLineRef = useRef<ISeriesApi<"Line"> | null>(null);
    const macdSignalRef = useRef<ISeriesApi<"Line"> | null>(null);
    const macdHistRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    const prevCoinRef = useRef<string>("");
    const prevIntervalRef = useRef<Interval | "">("");

    useEffect(() => {
        if (initialCoin && coins.includes(initialCoin)) setSelectedCoin(initialCoin);
    }, [initialCoin]);

    const getCurrentKlines = useCallback((): Kline[] => {
        if (selectedInterval === "1h") return klinesMap[selectedCoin] || [];
        return extraKlines[selectedCoin]?.[selectedInterval] || [];
    }, [selectedCoin, selectedInterval, klinesMap, extraKlines]);

    // Fetch non-1h klines on demand
    useEffect(() => {
        if (selectedInterval === "1h" || !selectedCoin) return;
        if (extraKlines[selectedCoin]?.[selectedInterval]) return;
        setLoading(true);
        fetchKlines(selectedCoin, selectedInterval)
            .then((klines) => {
                setExtraKlines((prev) => ({
                    ...prev,
                    [selectedCoin]: { ...prev[selectedCoin], [selectedInterval]: klines },
                }));
            })
            .finally(() => setLoading(false));
    }, [selectedCoin, selectedInterval]);

    // Create all charts once on mount
    useEffect(() => {
        if (!mainContainerRef.current || !rsiContainerRef.current || !macdContainerRef.current) return;

        const sharedLayout = {
            layout: {
                background: { type: ColorType.Solid, color: "#0f172a" },
                textColor: "#94a3b8",
            },
            grid: { vertLines: { color: "#1e293b" }, horzLines: { color: "#1e293b" } },
            crosshair: {
                mode: CrosshairMode.Normal,
                vertLine: { color: "#475569", labelBackgroundColor: "#334155" },
                horzLine: { color: "#475569", labelBackgroundColor: "#334155" },
            },
            rightPriceScale: { visible: true, autoScale: true, borderColor: "#1e293b", textColor: "#94a3b8" },
            leftPriceScale: { visible: false },
        };

        const priceScaleWidth = 70;

        const mainChart = createChart(mainContainerRef.current, {
            ...sharedLayout,
            rightPriceScale: { visible: true, autoScale: true, borderColor: "#1e293b", textColor: "#94a3b8", minimumWidth: priceScaleWidth },
            timeScale: { visible: true, borderColor: "#1e293b", timeVisible: true, secondsVisible: false },
            width: mainContainerRef.current.clientWidth,
            height: 420,
        });

        const rsiChart = createChart(rsiContainerRef.current, {
            ...sharedLayout,
            rightPriceScale: { visible: true, borderColor: "#1e293b", textColor: "#64748b", minimumWidth: priceScaleWidth },
            timeScale: { visible: true, borderColor: "#1e293b", timeVisible: true, secondsVisible: false },
            width: rsiContainerRef.current.clientWidth,
            height: 90,
        });

        const macdChart = createChart(macdContainerRef.current, {
            ...sharedLayout,
            rightPriceScale: { visible: true, autoScale: true, borderColor: "#1e293b", textColor: "#94a3b8", minimumWidth: priceScaleWidth },
            timeScale: { visible: true, borderColor: "#1e293b", timeVisible: true, secondsVisible: false },
            width: macdContainerRef.current.clientWidth,
            height: 90,
        });

        // Time scale sync
        let syncing = false;
        const syncRange = (src: IChartApi, targets: IChartApi[]) => {
            src.timeScale().subscribeVisibleLogicalRangeChange((range) => {
                if (syncing || !range) return;
                syncing = true;
                targets.forEach((t) => t.timeScale().setVisibleLogicalRange(range));
                syncing = false;
            });
        };
        syncRange(mainChart, [rsiChart, macdChart]);
        syncRange(rsiChart, [mainChart, macdChart]);
        syncRange(macdChart, [mainChart, rsiChart]);

        // ── Main chart series ────────────────────────────────────────
        const candleSeries = (mainChart as any).addCandlestickSeries({
            upColor: "#4ade80", downColor: "#f87171",
            borderUpColor: "#4ade80", borderDownColor: "#f87171",
            wickUpColor: "#4ade80", wickDownColor: "#f87171",
        });
        const volumeSeries = (mainChart as any).addHistogramSeries({
            color: "#26a69a", priceFormat: { type: "volume" }, priceScaleId: "vol",
        });
        volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });

        const sma20Series = (mainChart as any).addLineSeries({
            color: "#38bdf8", lineWidth: 1,
            priceLineVisible: false, lastValueVisible: false,
            title: "", crosshairMarkerVisible: false,
        });
        const sma50Series = (mainChart as any).addLineSeries({
            color: "#fb923c", lineWidth: 1,
            priceLineVisible: false, lastValueVisible: false,
            title: "", crosshairMarkerVisible: false,
        });

        // ── RSI series + reference lines ────────────────────────────
        const rsiSeries = (rsiChart as any).addLineSeries({
            color: "#a78bfa", lineWidth: 1,
            priceLineVisible: false, lastValueVisible: true,
        });
        rsiSeries.createPriceLine({ price: 70, color: "#f87171", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "" });
        rsiSeries.createPriceLine({ price: 50, color: "#475569", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "" });
        rsiSeries.createPriceLine({ price: 30, color: "#4ade80", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "" });

        // ── MACD series + zero line ──────────────────────────────────
        const macdLineSeries = (macdChart as any).addLineSeries({
            color: "#38bdf8", lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
        });
        const macdSignalSeries = (macdChart as any).addLineSeries({
            color: "#f97316", lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
        });
        const macdHistSeries = (macdChart as any).addHistogramSeries({
            priceFormat: { type: "price" }, priceScaleId: "right", priceLineVisible: false,
        });
        macdLineSeries.createPriceLine({ price: 0, color: "#334155", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "" });

        // ── OHLCV legend on crosshair ────────────────────────────────
        mainChart.subscribeCrosshairMove((param) => {
            if (!param.time || !(param.seriesData?.size)) {
                setLegend(null);
                return;
            }
            const c = param.seriesData.get(candleSeries) as any;
            const v = param.seriesData.get(volumeSeries) as any;
            if (c) {
                const d = new Date((param.time as number) * 1000);
                setLegend({
                    time: d.toLocaleString("es", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
                    open: c.open, high: c.high, low: c.low, close: c.close,
                    volume: v?.value ?? 0,
                    isUp: c.close >= c.open,
                });
            }
        });

        // Store refs
        mainChartRef.current = mainChart;
        rsiChartRef.current = rsiChart;
        macdChartRef.current = macdChart;
        candleSeriesRef.current = candleSeries;
        volumeSeriesRef.current = volumeSeries;
        sma20Ref.current = sma20Series;
        sma50Ref.current = sma50Series;
        rsiSeriesRef.current = rsiSeries;
        macdLineRef.current = macdLineSeries;
        macdSignalRef.current = macdSignalSeries;
        macdHistRef.current = macdHistSeries;

        // ResizeObserver
        const ro = new ResizeObserver(() => {
            const w = mainContainerRef.current?.clientWidth;
            if (!w) return;
            mainChart.applyOptions({ width: w });
            rsiChart.applyOptions({ width: w });
            macdChart.applyOptions({ width: w });
        });
        ro.observe(mainContainerRef.current);

        return () => {
            ro.disconnect();
            mainChart.remove();
            rsiChart.remove();
            macdChart.remove();
        };
    }, []);

    // Handle expand toggle
    useEffect(() => {
        mainChartRef.current?.applyOptions({ height: expanded ? 600 : 420 });
    }, [expanded]);

    // Update data when coin / interval / klines change
    useEffect(() => {
        const klines = getCurrentKlines();
        if (!candleSeriesRef.current || !volumeSeriesRef.current || klines.length === 0) return;

        const coinOrIntervalChanged =
            selectedCoin !== prevCoinRef.current ||
            selectedInterval !== prevIntervalRef.current;
        prevCoinRef.current = selectedCoin;
        prevIntervalRef.current = selectedInterval;

        const times = klines.map((k) => Math.floor(k.openTime / 1000) as any);
        const closes = klines.map((k) => k.close);

        // Candles
        candleSeriesRef.current.setData(
            klines.map((k, i) => ({ time: times[i], open: k.open, high: k.high, low: k.low, close: k.close }))
        );

        // Volume
        volumeSeriesRef.current.setData(
            klines.map((k, i) => ({
                time: times[i], value: k.volume,
                color: k.close >= k.open ? "#4ade8033" : "#f8717133",
            }))
        );

        // SMA20
        const sma20 = computeSMA(closes, 20);
        sma20Ref.current?.setData(
            sma20.flatMap((v, i) => (v !== null ? [{ time: times[i], value: v }] : []))
        );

        // SMA50
        const sma50 = computeSMA(closes, 50);
        sma50Ref.current?.setData(
            sma50.flatMap((v, i) => (v !== null ? [{ time: times[i], value: v }] : []))
        );

        // Price lines: remove old, add new
        priceLinesRef.current.forEach((pl) => candleSeriesRef.current!.removePriceLine(pl));
        priceLinesRef.current = [];

        const asset = aggregated.find((a) => a.coin === selectedCoin);
        const isSubDollar = (asset?.currentPrice ?? 1) < 1;
        candleSeriesRef.current.applyOptions({
            priceFormat: { type: "price", precision: isSubDollar ? 4 : 2, minMove: isSubDollar ? 0.0001 : 0.01 },
        });

        const coinItems = items.filter((inv) => inv.coin === selectedCoin);
        coinItems.forEach((inv) => {
            priceLinesRef.current.push(
                candleSeriesRef.current!.createPriceLine({
                    price: inv.buyPrice, color: "#60a5fa", lineWidth: 1,
                    lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: "",
                })
            );
        });
        if (asset?.avgBuyPrice && coinItems.length > 1) {
            priceLinesRef.current.push(
                candleSeriesRef.current!.createPriceLine({
                    price: asset.avgBuyPrice, color: "#f59e0b", lineWidth: 2,
                    lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "",
                })
            );
        }
        if (asset?.currentPrice) {
            priceLinesRef.current.push(
                candleSeriesRef.current!.createPriceLine({
                    price: asset.currentPrice, color: "#22d3ee", lineWidth: 1,
                    lineStyle: LineStyle.Solid, axisLabelVisible: true, title: "",
                })
            );
        }

        // RSI
        const rsi = computeRSI(closes);
        rsiSeriesRef.current?.setData(
            rsi.flatMap((v, i) => (v !== null ? [{ time: times[i], value: v }] : []))
        );

        // MACD
        const { macd, signal, histogram } = computeMACD(closes);
        macdLineRef.current?.setData(
            macd.flatMap((v, i) => (v !== null ? [{ time: times[i], value: v }] : []))
        );
        macdSignalRef.current?.setData(
            signal.flatMap((v, i) => (v !== null ? [{ time: times[i], value: v }] : []))
        );
        macdHistRef.current?.setData(
            histogram.flatMap((v, i) =>
                v !== null ? [{ time: times[i], value: v, color: v >= 0 ? "#4ade8066" : "#f8717166" }] : []
            )
        );

        if (coinOrIntervalChanged) {
            mainChartRef.current?.timeScale().fitContent();
            rsiChartRef.current?.timeScale().fitContent();
            macdChartRef.current?.timeScale().fitContent();
            candleSeriesRef.current?.priceScale().applyOptions({ autoScale: true });
        }
    }, [selectedCoin, selectedInterval, extraKlines, klinesMap, aggregated, items]);

    if (coins.length === 0) return null;

    return (
        <ChartCard
            title="Precio de Monedas"
            subtitle="Velas OHLCV · pasa el cursor sobre una vela para ver detalle"
        >
            {/* Controls */}
            <div className="flex flex-wrap justify-between items-center gap-2">
                {/* Coin selector with signal dots */}
                <div className="flex flex-wrap gap-1">
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
                </div>

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
                    SMA20
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-5 h-px inline-block" style={{ background: "#fb923c" }} />
                    SMA50
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
            </div>

            {/* Main chart */}
            <div className="relative">
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-900/70 rounded z-10">
                        <span className="text-xs text-slate-400">Cargando...</span>
                    </div>
                )}
                <div ref={mainContainerRef} />
            </div>

            {/* RSI sub-panel */}
            <div>
                <div className="flex items-center gap-2 py-0.5 border-t border-slate-700/50">
                    <span className="text-[9px] text-slate-500 font-mono font-bold uppercase tracking-widest">RSI(14)</span>
                    <span className="w-4 h-px inline-block" style={{ background: "#a78bfa" }} />
                    <span className="text-[9px] text-slate-700">30 ━ 70</span>
                </div>
                <div ref={rsiContainerRef} />
            </div>

            {/* MACD sub-panel */}
            <div>
                <div className="flex items-center gap-2 py-0.5 border-t border-slate-700/50">
                    <span className="text-[9px] text-slate-500 font-mono font-bold uppercase tracking-widest">MACD(12,26,9)</span>
                    <span className="w-4 h-px inline-block" style={{ background: "#38bdf8" }} />
                    <span className="text-[9px] text-slate-600">línea</span>
                    <span className="w-4 h-px inline-block" style={{ background: "#f97316" }} />
                    <span className="text-[9px] text-slate-600">señal</span>
                </div>
                <div ref={macdContainerRef} />
            </div>
        </ChartCard>
    );
};

export default CandlestickChart;
