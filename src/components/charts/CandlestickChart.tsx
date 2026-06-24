import React, { useEffect, useRef, useState, useCallback } from "react";
import {
    createChart,
    ColorType,
    LineStyle,
    CrosshairMode,
    IChartApi,
    ISeriesApi,
} from "lightweight-charts";
import { AggregatedAsset, ProcessedInvestment, SaleRecord } from "../../lib/constants";
import type { Kline, CoinSignal } from "../../lib/types/signals";
import ChartCard from "./ChartCard";
import { coinColor } from "./chartColors";
import { fmtPrice, fmt } from "../../lib/format";
import { Maximize2, Minimize2, Bell, Ruler, Plus, X } from "lucide-react";
import { useAlerts, WatchlistAlert } from "../../hooks/useAlerts";

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

function fmtMeasureTime(sec: number | null, interval: string): string {
    if (sec === null) return "—";
    const d = new Date(sec * 1000);
    const day = d.getDate().toString().padStart(2, "0");
    const months = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    const mon = months[d.getMonth()];
    const yr = d.getFullYear();
    if (interval === "1d" || interval === "1M") return `${day} ${mon} ${yr}`;
    const hh = d.getHours().toString().padStart(2, "0");
    const mm = d.getMinutes().toString().padStart(2, "0");
    return `${day} ${mon}  ${hh}:${mm}`;
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
    klinesMap?: Record<string, Kline[]>;
    items: ProcessedInvestment[];
    initialCoin?: string;
    signals?: CoinSignal[];
    onCoinChange?: (coin: string) => void;
    priceDirections?: Record<string, "up" | "down" | "neutral">;
    sales?: SaleRecord[];
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

interface MeasureAnchor { x: number; y: number; }

interface MeasureStats {
    priceChange: number;
    pctChange: number;
    barCount: number;
    totalVolume: number;
    startPrice: number;
    endPrice: number;
    startTimeSec: number | null;
    endTimeSec: number | null;
}

// ── Fetch helper ────────────────────────────────────────────────────

async function fetchKlines(coin: string, interval: Interval): Promise<Kline[]> {
    if (coin.endsWith('EUR')) {
        const intervalMap: Record<Interval, string> = { "15m": "15", "1h": "60", "4h": "240", "1d": "D", "1M": "M" };
        const res = await fetch(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${coin}&interval=${intervalMap[interval]}&limit=100`);
        const data = await res.json();
        const raw = data.result?.list || [];
        return raw.reverse().map((k: any[]) => ({
            openTime: parseInt(k[0]),
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5]),
            closeTime: parseInt(k[0]) + 1,
        }));
    }

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
    aggregated, klinesMap = {}, items, initialCoin, signals = [], onCoinChange, priceDirections = {}, sales = [],
}) => {
    const portfolioCoins = aggregated.filter((a) => a.currentValue > 0).map((a) => a.coin);
    const extraCoins = Object.keys(klinesMap).filter(c => !portfolioCoins.includes(c));
    const coins = portfolioCoins;
    const { config, saveConfig } = useAlerts();

    const [selectedCoin, setSelectedCoin] = useState<string>(
        initialCoin && coins.includes(initialCoin) ? initialCoin : coins[0] || ""
    );
    const [selectedInterval, setSelectedInterval] = useState<Interval>("4h");
    const [extraKlines, setExtraKlines] = useState<Record<string, Partial<Record<Interval, Kline[]>>>>({});
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [legend, setLegend] = useState<OhlcvLegend | null>(null);
    const [klinesRange, setKlinesRange] = useState<{ min: number; max: number } | null>(null);

    // Measure tool state
    const [measureMode, setMeasureMode] = useState(false);
    const [measureDragging, setMeasureDragging] = useState(false);
    const [measureStart, setMeasureStart] = useState<MeasureAnchor | null>(null);
    const [measureEnd, setMeasureEnd] = useState<MeasureAnchor | null>(null);
    const [measureStats, setMeasureStats] = useState<MeasureStats | null>(null);
    const measureWasTouchRef = useRef(false);

    // Explorer popover state
    const [showExplorer, setShowExplorer] = useState(false);
    const [explorerInput, setExplorerInput] = useState("");
    const [explorerLoading, setExplorerLoading] = useState(false);
    const [explorerError, setExplorerError] = useState("");
    const explorerRef = useRef<HTMLDivElement>(null);

    // Alert form state
    const [showAlertForm, setShowAlertForm] = useState(false);
    const [alertTarget, setAlertTarget] = useState(0);
    const [alertDirection, setAlertDirection] = useState<'up' | 'down'>('up');
    const [alertPersistent, setAlertPersistent] = useState(false);
    const [alertNote, setAlertNote] = useState("");
    const [alertSaved, setAlertSaved] = useState(false);

    // Chart containers
    const mainContainerRef = useRef<HTMLDivElement>(null);

    // Chart instances
    const mainChartRef = useRef<IChartApi | null>(null);

    // Series refs
    const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    const sma20Ref = useRef<ISeriesApi<"Line"> | null>(null);
    const sma50Ref = useRef<ISeriesApi<"Line"> | null>(null);
    const priceLinesRef = useRef<ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]>[]>([]);
    const alertPriceLinesRef = useRef<ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]>[]>([]);
    const rsiSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
    const macdLineRef = useRef<ISeriesApi<"Line"> | null>(null);
    const macdSignalRef = useRef<ISeriesApi<"Line"> | null>(null);
    const macdHistRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    const prevCoinRef = useRef<string>("");
    const prevIntervalRef = useRef<Interval | "">("");
    const measureOverlayRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (initialCoin && coins.includes(initialCoin)) setSelectedCoin(initialCoin);
    }, [initialCoin]);

    useEffect(() => {
        onCoinChange?.(selectedCoin);
    }, [selectedCoin, onCoinChange]);

    const getCurrentKlines = useCallback((): Kline[] => {
        if (selectedInterval === "1h") return klinesMap[selectedCoin] || extraKlines[selectedCoin]?.["1h"] || [];
        return extraKlines[selectedCoin]?.[selectedInterval] || [];
    }, [selectedCoin, selectedInterval, klinesMap, extraKlines]);

    // Reset medición al cambiar moneda/intervalo
    useEffect(() => {
        setMeasureStats(null); setMeasureStart(null); setMeasureEnd(null);
    }, [selectedCoin, selectedInterval]);

    // Reset al desactivar modo medición
    useEffect(() => {
        if (!measureMode) {
            setMeasureDragging(false); setMeasureStart(null);
            setMeasureEnd(null); setMeasureStats(null);
        }
    }, [measureMode]);

    // Escape para salir
    useEffect(() => {
        if (!measureMode) return;
        const fn = (e: KeyboardEvent) => { if (e.key === "Escape") setMeasureMode(false); };
        window.addEventListener("keydown", fn);
        return () => window.removeEventListener("keydown", fn);
    }, [measureMode]);

    // Auto-fetch 1h klines when klinesMap doesn't have data for the selected coin
    useEffect(() => {
        if (!selectedCoin) return;
        if (klinesMap[selectedCoin] || extraKlines[selectedCoin]?.["1h"]) return;
        setLoading(true);
        fetchKlines(selectedCoin, "1h")
            .then((klines) => {
                setExtraKlines((prev) => ({
                    ...prev,
                    [selectedCoin]: { ...prev[selectedCoin], "1h": klines },
                }));
            })
            .finally(() => setLoading(false));
    }, [selectedCoin, klinesMap]);

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

    // Create chart once on mount
    useEffect(() => {
        if (!mainContainerRef.current) return;

        const priceScaleWidth = 70;

        const mainChart = createChart(mainContainerRef.current, {
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
            rightPriceScale: { visible: true, autoScale: false, borderColor: "#1e293b", textColor: "#94a3b8", minimumWidth: priceScaleWidth },
            leftPriceScale: { visible: false },
            timeScale: { visible: true, borderColor: "#1e293b", timeVisible: true, secondsVisible: false, minBarSpacing: 4 },
            width: mainContainerRef.current.clientWidth,
            height: 560,
        });

        // Candle price scale ocupa el 58% superior
        mainChart.priceScale("right").applyOptions({ scaleMargins: { top: 0, bottom: 0.42 } });

        // ── Main chart series ────────────────────────────────────────
        const candleSeries = (mainChart as any).addCandlestickSeries({
            upColor: "#4ade80", downColor: "#f87171",
            borderUpColor: "#4ade80", borderDownColor: "#f87171",
            wickUpColor: "#4ade80", wickDownColor: "#f87171",
            priceLineVisible: false,
        });
        const volumeSeries = (mainChart as any).addHistogramSeries({
            color: "#26a69a", priceFormat: { type: "volume" }, priceScaleId: "vol",
        });
        volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.48, bottom: 0.42 } });

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

        // ── RSI series + reference lines (panel 60-78%) ─────────────
        const rsiSeries = (mainChart as any).addLineSeries({
            color: "#a78bfa", lineWidth: 1,
            priceScaleId: "rsi",
            priceLineVisible: true, lastValueVisible: true,
        });
        mainChart.priceScale("rsi").applyOptions({ scaleMargins: { top: 0.60, bottom: 0.22 } });
        rsiSeries.createPriceLine({ price: 70, color: "#f87171", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "" });
        rsiSeries.createPriceLine({ price: 50, color: "#475569", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "" });
        rsiSeries.createPriceLine({ price: 30, color: "#4ade80", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "" });

        // ── MACD series + zero line (panel 80-100%) ──────────────────
        const macdLineSeries = (mainChart as any).addLineSeries({
            color: "#38bdf8", lineWidth: 1, priceScaleId: "macd",
            priceLineVisible: false, lastValueVisible: true,
        });
        const macdSignalSeries = (mainChart as any).addLineSeries({
            color: "#f97316", lineWidth: 1, priceScaleId: "macd",
            priceLineVisible: false, lastValueVisible: true,
        });
        const macdHistSeries = (mainChart as any).addHistogramSeries({
            priceFormat: { type: "price" }, priceScaleId: "macd", priceLineVisible: false,
        });
        mainChart.priceScale("macd").applyOptions({ scaleMargins: { top: 0.80, bottom: 0 } });
        macdLineSeries.createPriceLine({ price: 0, color: "#334155", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "" });

        // ── OHLCV legend on crosshair ────────────────────────────────
        mainChart.subscribeCrosshairMove((param) => {
            if (!param.time || !(param.seriesData?.size)) return;
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
        });
        ro.observe(mainContainerRef.current);

        return () => { ro.disconnect(); mainChart.remove(); };
    }, []);

    // Handle expand toggle
    useEffect(() => {
        mainChartRef.current?.applyOptions({ height: expanded ? 760 : 560 });
    }, [expanded]);

    // Draw alert price lines on chart when alerts or selected coin changes
    useEffect(() => {
        if (!candleSeriesRef.current) return;
        alertPriceLinesRef.current.forEach(line => {
            try { candleSeriesRef.current!.removePriceLine(line); } catch {}
        });
        alertPriceLinesRef.current = [];
        const activeAlerts = config.watchlistAlerts?.[selectedCoin] ?? [];
        activeAlerts.forEach(alert => {
            const line = candleSeriesRef.current!.createPriceLine({
                price: alert.targetValue,
                color: alert.direction === 'up' ? '#22c55e' : '#ef4444',
                lineWidth: 1,
                lineStyle: LineStyle.Dashed,
                axisLabelVisible: false,
                title: `🔔 ${alert.isPersistent ? '∞' : '1x'}`,
            });
            alertPriceLinesRef.current.push(line);
        });
    }, [config.watchlistAlerts, selectedCoin]);

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
        if (closes.length > 0) {
            setKlinesRange({ min: Math.min(...closes), max: Math.max(...closes) });
        }

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
            priceLineVisible: false,
        });

        const coinItems = items.filter((inv) => inv.coin === selectedCoin);
        coinItems.forEach((inv) => {
            priceLinesRef.current.push(
                candleSeriesRef.current!.createPriceLine({
                    price: inv.buyPrice, color: "#60a5fa", lineWidth: 1,
                    lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: "Compra",
                })
            );
        });
        const allSellPrices = [
            ...sales.filter((s) => s.coin === selectedCoin).map((s) => s.sellPrice),
        ];
        allSellPrices.forEach((price) => {
            priceLinesRef.current.push(
                candleSeriesRef.current!.createPriceLine({
                    price,
                    color: "#ef4444",
                    lineWidth: 2,
                    lineStyle: LineStyle.Dashed,
                    axisLabelVisible: true,
                    title: "Venta",
                })
            );
        });

        if (asset?.avgBuyPrice && coinItems.length > 1) {
            priceLinesRef.current.push(
                candleSeriesRef.current!.createPriceLine({
                    price: asset.avgBuyPrice, color: "#f59e0b", lineWidth: 2,
                    lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "Promedio",
                })
            );
        }
        if (asset?.currentPrice) {
            priceLinesRef.current.push(
                candleSeriesRef.current!.createPriceLine({
                    price: asset.currentPrice, color: "#22d3ee", lineWidth: 1,
                    lineStyle: LineStyle.Solid, axisLabelVisible: false, title: "Actual",
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
            // Solo fitContent en el chart principal — el sync de tiempo propaga el rango a RSI y MACD
            candleSeriesRef.current?.priceScale().applyOptions({ autoScale: true });
            mainChartRef.current?.timeScale().fitContent();
            requestAnimationFrame(() => {
                candleSeriesRef.current?.priceScale().applyOptions({ autoScale: false });
            });
        }
    }, [selectedCoin, selectedInterval, extraKlines, klinesMap, aggregated, items, sales]);

    const currentPrice = aggregated.find(a => a.coin === selectedCoin)?.currentPrice ?? 0;
    const coinItems = items.filter((inv) => inv.coin === selectedCoin);
    const coinSales = sales.filter((s) => s.coin === selectedCoin);

    const handleSelectExplorerCoin = useCallback(async (coin: string) => {
        const upper = coin.toUpperCase().trim();
        if (!upper) return;
        setExplorerError("");

        // Already have klines for this coin
        if (klinesMap[upper] || extraKlines[upper]?.["1h"]) {
            setSelectedCoin(upper);
            setShowExplorer(false);
            setExplorerInput("");
            return;
        }

        // Fetch from Binance
        setExplorerLoading(true);
        try {
            const klines = await fetchKlines(upper, "1h");
            if (klines.length === 0) throw new Error("Sin datos");
            setExtraKlines(prev => ({ ...prev, [upper]: { ...prev[upper], "1h": klines } }));
            setSelectedCoin(upper);
            setShowExplorer(false);
            setExplorerInput("");
        } catch {
            setExplorerError(`"${upper}" no encontrada en Binance`);
        } finally {
            setExplorerLoading(false);
        }
    }, [klinesMap, extraKlines]);

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

    // ── Measure tool handlers ───────────────────────────────────────
    const handleMeasureMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!measureOverlayRef.current) return;
        e.preventDefault();
        measureWasTouchRef.current = false;
        const rect = measureOverlayRef.current.getBoundingClientRect();
        const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        setMeasureStart(anchor); setMeasureEnd(anchor);
        setMeasureDragging(true); setMeasureStats(null);
    }, []);

    const handleMeasureMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!measureDragging || !measureOverlayRef.current || !measureStart) return;
        const rect = measureOverlayRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        setMeasureEnd({ x, y });

        // Actualizar stats en tiempo real mientras se arrastra
        if (!candleSeriesRef.current || !mainChartRef.current) return;
        const startPrice = candleSeriesRef.current.coordinateToPrice(measureStart.y);
        const endPrice = candleSeriesRef.current.coordinateToPrice(y);
        if (startPrice === null || endPrice === null) return;
        const priceChange = endPrice - startPrice;
        const pctChange = startPrice !== 0 ? (priceChange / startPrice) * 100 : 0;

        const startSec = mainChartRef.current.timeScale().coordinateToTime(measureStart.x);
        const endSec = mainChartRef.current.timeScale().coordinateToTime(x);
        let barCount = 0, totalVolume = 0;
        if (startSec !== null && endSec !== null) {
            const klines = getCurrentKlines();
            const t0 = Math.min((startSec as number) * 1000, (endSec as number) * 1000);
            const t1 = Math.max((startSec as number) * 1000, (endSec as number) * 1000);
            const inRange = klines.filter((k) => k.openTime >= t0 && k.openTime <= t1);
            barCount = inRange.length;
            totalVolume = inRange.reduce((s, k) => s + k.volume, 0);
        }
        setMeasureStats({ priceChange, pctChange, barCount, totalVolume, startPrice, endPrice,
            startTimeSec: startSec !== null ? (startSec as number) : null,
            endTimeSec: endSec !== null ? (endSec as number) : null });
    }, [measureDragging, measureStart, getCurrentKlines]);

    const finalizeMeasure = useCallback((x: number, y: number) => {
        if (!mainChartRef.current || !candleSeriesRef.current || !measureStart) return;

        const startPrice = candleSeriesRef.current.coordinateToPrice(measureStart.y);
        const endPrice = candleSeriesRef.current.coordinateToPrice(y);
        if (startPrice === null || endPrice === null) return;

        const priceChange = endPrice - startPrice;
        const pctChange = startPrice !== 0 ? (priceChange / startPrice) * 100 : 0;

        const startSec = mainChartRef.current.timeScale().coordinateToTime(measureStart.x);
        const endSec = mainChartRef.current.timeScale().coordinateToTime(x);
        let barCount = 0, totalVolume = 0;
        if (startSec !== null && endSec !== null) {
            const klines = getCurrentKlines();
            const t0 = Math.min((startSec as number) * 1000, (endSec as number) * 1000);
            const t1 = Math.max((startSec as number) * 1000, (endSec as number) * 1000);
            const inRange = klines.filter((k) => k.openTime >= t0 && k.openTime <= t1);
            barCount = inRange.length;
            totalVolume = inRange.reduce((s, k) => s + k.volume, 0);
        }

        setMeasureStats({ priceChange, pctChange, barCount, totalVolume, startPrice, endPrice,
            startTimeSec: startSec !== null ? (startSec as number) : null,
            endTimeSec: endSec !== null ? (endSec as number) : null });
        setMeasureDragging(false);
    }, [measureStart, getCurrentKlines]);

    const handleMeasureMouseUp = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!measureDragging || !measureOverlayRef.current) return;
        const rect = measureOverlayRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        setMeasureEnd({ x, y });
        finalizeMeasure(x, y);
    }, [measureDragging, finalizeMeasure]);

    const handleMeasureMouseLeave = useCallback(() => {
        if (measureDragging && measureEnd) finalizeMeasure(measureEnd.x, measureEnd.y);
    }, [measureDragging, measureEnd, finalizeMeasure]);

    const handleMeasureTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
        if (!measureOverlayRef.current) return;
        e.preventDefault();
        measureWasTouchRef.current = true;
        const touch = e.touches[0];
        const rect = measureOverlayRef.current.getBoundingClientRect();
        const anchor = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
        setMeasureStart(anchor); setMeasureEnd(anchor);
        setMeasureDragging(true); setMeasureStats(null);
    }, []);

    const handleMeasureTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
        if (!measureDragging || !measureOverlayRef.current || !measureStart) return;
        e.preventDefault();
        const touch = e.touches[0];
        const rect = measureOverlayRef.current.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        setMeasureEnd({ x, y });
        if (!candleSeriesRef.current || !mainChartRef.current) return;
        const startPrice = candleSeriesRef.current.coordinateToPrice(measureStart.y);
        const endPrice = candleSeriesRef.current.coordinateToPrice(y);
        if (startPrice === null || endPrice === null) return;
        const priceChange = endPrice - startPrice;
        const pctChange = startPrice !== 0 ? (priceChange / startPrice) * 100 : 0;
        const startSec = mainChartRef.current.timeScale().coordinateToTime(measureStart.x);
        const endSec = mainChartRef.current.timeScale().coordinateToTime(x);
        let barCount = 0, totalVolume = 0;
        if (startSec !== null && endSec !== null) {
            const klines = getCurrentKlines();
            const t0 = Math.min((startSec as number) * 1000, (endSec as number) * 1000);
            const t1 = Math.max((startSec as number) * 1000, (endSec as number) * 1000);
            const inRange = klines.filter((k) => k.openTime >= t0 && k.openTime <= t1);
            barCount = inRange.length;
            totalVolume = inRange.reduce((s, k) => s + k.volume, 0);
        }
        setMeasureStats({ priceChange, pctChange, barCount, totalVolume, startPrice, endPrice,
            startTimeSec: startSec !== null ? (startSec as number) : null,
            endTimeSec: endSec !== null ? (endSec as number) : null });
    }, [measureDragging, measureStart, getCurrentKlines]);

    const handleMeasureTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
        if (!measureDragging || !measureOverlayRef.current) return;
        e.preventDefault();
        const touch = e.changedTouches[0];
        const rect = measureOverlayRef.current.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        setMeasureEnd({ x, y });
        finalizeMeasure(x, y);
    }, [measureDragging, finalizeMeasure]);

    // ── Measure geometry (derived) ──────────────────────────────────
    const measureRect = (() => {
        if (!measureStart || !measureEnd) return null;
        const left = Math.min(measureStart.x, measureEnd.x);
        const top = Math.min(measureStart.y, measureEnd.y);
        const width = Math.abs(measureEnd.x - measureStart.x);
        const height = Math.abs(measureEnd.y - measureStart.y);
        return width < 4 ? null : { left, top, width, height };
    })();

    const tooltipPos = (() => {
        if (!measureRect || !measureStats) return null;
        const containerH = mainContainerRef.current?.clientHeight ?? 420;
        const containerW = mainContainerRef.current?.clientWidth ?? 600;
        const ttH = 88, ttW = 160;
        let top: number;
        if (measureWasTouchRef.current) {
            // On touch devices the finger covers the bottom — always prefer above
            top = measureRect.top - ttH - 8;
            if (top < 4) top = measureRect.top + measureRect.height + 8;
        } else {
            top = measureRect.top + measureRect.height + 8;
            if (top + ttH > containerH) top = measureRect.top - ttH - 8;
        }
        top = Math.max(4, top);
        let left = measureRect.left + measureRect.width / 2 - ttW / 2;
        left = Math.max(4, Math.min(left, containerW - ttW - 4));
        return { top, left };
    })();

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
                    const klines = getCurrentKlines();
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
                <span className="flex items-center gap-1">
                    <span className="w-5 border-t-2 border-dashed border-[#ef4444] inline-block" />
                    Venta
                </span>
            </div>

            {/* Precios de referencia para la moneda seleccionada */}
            {(coinSales.length > 0 || coinItems.length > 0) && (
                <div className="flex items-center gap-x-4 gap-y-0.5 text-[9px] flex-wrap">
                    {coinSales.map((s, i) => {
                        const aboveRange = klinesRange && s.sellPrice > klinesRange.max * 1.05;
                        const belowRange = klinesRange && s.sellPrice < klinesRange.min * 0.95;
                        const outOfRange = aboveRange || belowRange;
                        return (
                            <span key={s.id} className="flex items-center gap-1 text-red-400 font-mono font-bold">
                                Venta{coinSales.length > 1 ? ` ${i + 1}` : ""}: {fmtPrice(s.sellPrice)} · {fmt(s.quantity)} {s.coin}
                                {outOfRange && (
                                    <span className="text-yellow-400 font-normal text-[8px]">
                                        {aboveRange ? "↑" : "↓"} fuera del gráfico
                                    </span>
                                )}
                            </span>
                        );
                    })}
                    {coinItems.map((inv, i) => (
                        <span key={inv.id} className="text-sky-400 font-mono">
                            Compra{coinItems.length > 1 ? ` ${i + 1}` : ""}: {fmtPrice(inv.buyPrice)}
                        </span>
                    ))}
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
                    <div
                        ref={measureOverlayRef}
                        className="absolute inset-0 z-20 select-none"
                        style={{ cursor: 'crosshair', touchAction: 'none' }}
                        onMouseDown={handleMeasureMouseDown}
                        onMouseMove={handleMeasureMouseMove}
                        onMouseUp={handleMeasureMouseUp}
                        onMouseLeave={handleMeasureMouseLeave}
                        onTouchStart={handleMeasureTouchStart}
                        onTouchMove={handleMeasureTouchMove}
                        onTouchEnd={handleMeasureTouchEnd}
                    >
                        {/* Rectangle */}
                        {measureRect && (
                            <div
                                className="absolute pointer-events-none border"
                                style={{
                                    left: measureRect.left, top: measureRect.top,
                                    width: measureRect.width, height: measureRect.height,
                                    backgroundColor: measureStats
                                        ? (measureStats.pctChange >= 0 ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)')
                                        : 'rgba(148,163,184,0.10)',
                                    borderColor: measureStats
                                        ? (measureStats.pctChange >= 0 ? 'rgba(74,222,128,0.5)' : 'rgba(248,113,113,0.5)')
                                        : 'rgba(148,163,184,0.4)',
                                }}
                            />
                        )}

                        {/* Tooltip */}
                        {measureRect && measureStats && tooltipPos && (() => {
                            const dec = Math.abs(measureStats.startPrice) < 1 ? 4 : 2;
                            const color = measureStats.pctChange >= 0 ? 'text-green-400' : 'text-red-400';
                            const sign = measureStats.pctChange >= 0 ? '+' : '';
                            return (
                                <div
                                    className="absolute pointer-events-none z-30 rounded-lg border border-slate-600 bg-slate-900/95 px-3 py-2 shadow-xl"
                                    style={{ top: tooltipPos.top, left: tooltipPos.left, minWidth: 172 }}
                                >
                                    {/* Precios inicio → fin */}
                                    <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-300 mb-1">
                                        <span>{fmtPrice(measureStats.startPrice)}</span>
                                        <span className="text-slate-500">→</span>
                                        <span>{fmtPrice(measureStats.endPrice)}</span>
                                    </div>
                                    {/* Cambio y porcentaje */}
                                    <div className={`text-sm font-bold font-mono leading-tight ${color}`}>
                                        {sign}{measureStats.priceChange.toFixed(dec)}
                                        <span className="ml-2">{sign}{measureStats.pctChange.toFixed(2)}%</span>
                                    </div>
                                    {/* Fechas */}
                                    <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400 mt-1.5">
                                        <span>{fmtMeasureTime(measureStats.startTimeSec, selectedInterval)}</span>
                                        <span className="text-slate-600">→</span>
                                        <span>{fmtMeasureTime(measureStats.endTimeSec, selectedInterval)}</span>
                                    </div>
                                    {/* Barras y volumen */}
                                    <div className="text-[10px] text-slate-500 mt-0.5">
                                        {measureStats.barCount > 0 && <>{measureStats.barCount} barras · Vol. {fmtVol(measureStats.totalVolume)}</>}
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                )}
            </div>

        </ChartCard>
    );
};

export default CandlestickChart;
