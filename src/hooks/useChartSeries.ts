import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import {
    createChart,
    ColorType,
    CrosshairMode,
    LineStyle,
    IChartApi,
    ISeriesApi,
} from "lightweight-charts";
import type { Kline } from "../lib/types/signals";
import type { Interval } from "../lib/types/chart";
import { computeEMASeries, computeSMASeries, computeRSISeries, computeMACDSeries } from "../lib/indicators";

interface UseChartSeriesParams {
    containerRef: RefObject<HTMLDivElement>;
    klines: Kline[];
    selectedCoin: string;
    selectedInterval: Interval;
    expanded: boolean;
}

export function useChartSeries({ containerRef, klines, selectedCoin, selectedInterval, expanded }: UseChartSeriesParams) {
    // Chart instances
    const mainChartRef = useRef<IChartApi | null>(null);

    // Series refs
    const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    const ema20Ref = useRef<ISeriesApi<"Line"> | null>(null);
    const sma50Ref = useRef<ISeriesApi<"Line"> | null>(null);
    const sma200Ref = useRef<ISeriesApi<"Line"> | null>(null);
    const rsiSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
    const macdLineRef = useRef<ISeriesApi<"Line"> | null>(null);
    const macdSignalRef = useRef<ISeriesApi<"Line"> | null>(null);
    const macdHistRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    const prevCoinRef = useRef<string>("");
    const prevIntervalRef = useRef<Interval | "">("");

    // Create chart once on mount
    useEffect(() => {
        if (!containerRef.current) return;

        const priceScaleWidth = 70;

        const mainChart = createChart(containerRef.current, {
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
            rightPriceScale: { visible: true, autoScale: true, borderColor: "#1e293b", textColor: "#94a3b8", minimumWidth: priceScaleWidth },
            leftPriceScale: { visible: false },
            timeScale: { visible: true, borderColor: "#1e293b", timeVisible: true, secondsVisible: false, minBarSpacing: 4 },
            width: containerRef.current.clientWidth,
            height: 560,
        });

        // Candle price scale ocupa el 58% superior
        mainChart.priceScale("right").applyOptions({ scaleMargins: { top: 0, bottom: 0.45 } });

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
        volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.50, bottom: 0.42 } });

        const ema20Series = (mainChart as any).addLineSeries({
            priceScaleId: "right",
            color: "#38bdf8", lineWidth: 1,
            priceLineVisible: false, lastValueVisible: false,
            title: "", crosshairMarkerVisible: false,
        });
        const sma50Series = (mainChart as any).addLineSeries({
            priceScaleId: "right",
            color: "#fb923c", lineWidth: 1,
            priceLineVisible: false, lastValueVisible: false,
            title: "", crosshairMarkerVisible: false,
        });
        const sma200Series = (mainChart as any).addLineSeries({
            priceScaleId: "right",
            color: "#eab308", lineWidth: 2,
            priceLineVisible: false, lastValueVisible: false,
            title: "", crosshairMarkerVisible: false,
        });

        // ── RSI series + reference lines (panel 60-78%) ─────────────
        const rsiSeries = (mainChart as any).addLineSeries({
            color: "#a78bfa", lineWidth: 1,
            priceScaleId: "rsi",
            priceLineVisible: true, lastValueVisible: true,
        });
        mainChart.priceScale("rsi").applyOptions({ scaleMargins: { top: 0.62, bottom: 0.20 } });
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
        mainChart.priceScale("macd").applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
        macdLineSeries.createPriceLine({ price: 0, color: "#334155", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "" });

        // Store refs
        mainChartRef.current = mainChart;
        candleSeriesRef.current = candleSeries;
        volumeSeriesRef.current = volumeSeries;
        ema20Ref.current = ema20Series;
        sma50Ref.current = sma50Series;
        sma200Ref.current = sma200Series;
        rsiSeriesRef.current = rsiSeries;
        macdLineRef.current = macdLineSeries;
        macdSignalRef.current = macdSignalSeries;
        macdHistRef.current = macdHistSeries;

        // ResizeObserver
        const ro = new ResizeObserver(() => {
            const w = containerRef.current?.clientWidth;
            if (!w) return;
            mainChart.applyOptions({ width: w });
        });
        ro.observe(containerRef.current);

        // Mitigación: LW 4.x no recorta por escala de precio; el arrastre del eje de precio
        // desactiva el autoScale de la escala "right". Reafirmarlo ante cambios de rango
        // visible de tiempo evita que velas/EMA/SMA se dibujen fuera de su banda sobre RSI/MACD.
        const rightPriceScale = mainChart.priceScale("right");
        const onVisibleRangeChange = () => rightPriceScale.applyOptions({ autoScale: true });
        mainChart.timeScale().subscribeVisibleLogicalRangeChange(onVisibleRangeChange);

        return () => {
            ro.disconnect();
            mainChart.timeScale().unsubscribeVisibleLogicalRangeChange(onVisibleRangeChange);
            mainChart.remove();
        };
    }, []);

    // Handle expand toggle
    useEffect(() => {
        mainChartRef.current?.applyOptions({ height: expanded ? 760 : 560 });
    }, [expanded]);

    // Update series data when coin / interval / klines change
    useEffect(() => {
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

        // EMA20 (seed = SMA, more accurate than old seed = data[0])
        const ema20 = computeEMASeries(closes, 20);
        ema20Ref.current?.setData(
            ema20.flatMap((v, i) => (v !== null ? [{ time: times[i], value: v }] : []))
        );

        // SMA50
        const sma50 = computeSMASeries(closes, 50);
        sma50Ref.current?.setData(
            sma50.flatMap((v, i) => (v !== null ? [{ time: times[i], value: v }] : []))
        );

        // SMA200
        const sma200 = computeSMASeries(closes, 200);
        sma200Ref.current?.setData(
            sma200.flatMap((v, i) => (v !== null ? [{ time: times[i], value: v }] : []))
        );

        // RSI
        const rsi = computeRSISeries(closes);
        rsiSeriesRef.current?.setData(
            rsi.flatMap((v, i) => (v !== null ? [{ time: times[i], value: v }] : []))
        );

        // MACD
        const { macd, signal, histogram } = computeMACDSeries(closes);
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
        }
    }, [klines, selectedCoin, selectedInterval]);

    return {
        mainChartRef,
        candleSeriesRef,
        volumeSeriesRef,
    };
}