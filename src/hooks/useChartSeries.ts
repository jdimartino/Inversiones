import { useEffect, useRef, useCallback } from "react";
import type { RefObject } from "react";
import {
    createChart,
    ColorType,
    CrosshairMode,
    LineStyle,
    IChartApi,
    ISeriesApi,
    LogicalRange,
    MouseEventParams,
} from "lightweight-charts";
import type { Kline } from "../lib/types/signals";
import type { Interval } from "../lib/types/chart";
import { computeEMASeries, computeSMASeries, computeRSISeries, computeMACDSeries, findValueAtTime } from "../lib/indicators";

interface UseChartSeriesParams {
    mainContainerRef: RefObject<HTMLDivElement>;
    rsiContainerRef: RefObject<HTMLDivElement>;
    macdContainerRef: RefObject<HTMLDivElement>;
    klines: Kline[];
    selectedCoin: string;
    selectedInterval: Interval;
    expanded: boolean;
    rsiOpen: boolean;
    macdOpen: boolean;
    ema20Visible: boolean;
    sma50Visible: boolean;
    sma200Visible: boolean;
    volumeVisible: boolean;
}

export function useChartSeries({
    mainContainerRef, rsiContainerRef, macdContainerRef,
    klines, selectedCoin, selectedInterval, expanded,
    rsiOpen, macdOpen, ema20Visible, sma50Visible, sma200Visible, volumeVisible,
}: UseChartSeriesParams) {
    const mainChartRef = useRef<IChartApi | null>(null);
    const rsiChartRef = useRef<IChartApi | null>(null);
    const macdChartRef = useRef<IChartApi | null>(null);

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
    const mainHasDataRef = useRef(false);
    const rsiHasDataRef = useRef(false);
    const macdHasDataRef = useRef(false);
    const rsiPointsRef = useRef<{ time: number; value: number }[]>([]);
    const macdLinePointsRef = useRef<{ time: number; value: number }[]>([]);
    const macdSignalPointsRef = useRef<{ time: number; value: number }[]>([]);
    const ema20PointsRef = useRef<{ time: number; value: number }[]>([]);
    const sma50PointsRef = useRef<{ time: number; value: number }[]>([]);
    const sma200PointsRef = useRef<{ time: number; value: number }[]>([]);

    // Create charts once on mount
    useEffect(() => {
        if (!mainContainerRef.current || !rsiContainerRef.current || !macdContainerRef.current) return;

        const priceScaleWidth = 78;
        const totalH = expanded ? 760 : 560;
        const mainHeight = Math.round(totalH * 0.62);
        const rsiHeight = Math.round(totalH * 0.22);
        const macdHeight = totalH - mainHeight - rsiHeight;

        const baseChartOptions = {
            layout: {
                background: { type: ColorType.Solid, color: "#0f172a" },
                textColor: "#94a3b8",
            },
            grid: { vertLines: { color: "#1e293b" }, horzLines: { color: "#1e293b" } },
            rightPriceScale: { visible: true, autoScale: true, borderColor: "#1e293b", textColor: "#94a3b8", minimumWidth: priceScaleWidth },
            leftPriceScale: { visible: false },
            width: mainContainerRef.current.clientWidth,
        };
        const timeScaleOptions = { borderColor: "#1e293b", timeVisible: true, secondsVisible: false, minBarSpacing: 4 };

        const mainChart = createChart(mainContainerRef.current, {
            ...baseChartOptions,
            crosshair: {
                mode: CrosshairMode.Normal,
                vertLine: { color: "#475569", labelBackgroundColor: "#334155" },
                horzLine: { color: "#475569", labelBackgroundColor: "#334155" },
            },
            timeScale: { ...timeScaleOptions, visible: false },
            handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
            handleScale: {
                mouseWheel: true,
                pinch: true,
                axisPressedMouseMove: { time: true, price: true },
                axisDoubleClickReset: true,
            },
            height: mainHeight,
        });

        const rsiChart = createChart(rsiContainerRef.current, {
            ...baseChartOptions,
            crosshair: { mode: CrosshairMode.Normal, vertLine: { visible: true, labelVisible: false }, horzLine: { visible: false } },
            timeScale: { ...timeScaleOptions, visible: false },
            handleScroll: false,
            handleScale: false,
            height: rsiHeight,
        });

        const macdChart = createChart(macdContainerRef.current, {
            ...baseChartOptions,
            crosshair: { mode: CrosshairMode.Normal, vertLine: { visible: true, labelVisible: false }, horzLine: { visible: false } },
            timeScale: { ...timeScaleOptions, visible: true },
            handleScroll: false,
            handleScale: false,
            height: macdHeight,
        });

        // Price scale: candles occupy top, volume bottom 28% (only when visible)
        mainChart.priceScale("right").applyOptions({ scaleMargins: { top: 0.05, bottom: volumeVisible ? 0.32 : 0 } });

        const candleSeries = (mainChart as any).addCandlestickSeries({
            upColor: "#4ade80", downColor: "#f87171",
            borderUpColor: "#4ade80", borderDownColor: "#f87171",
            wickUpColor: "#4ade80", wickDownColor: "#f87171",
            priceLineVisible: false,
        });
        const volumeSeries = (mainChart as any).addHistogramSeries({
            color: "#26a69a", priceFormat: { type: "volume" }, priceScaleId: "vol",
        });
        volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.72, bottom: 0 } });

        const ema20Series = (mainChart as any).addLineSeries({
            priceScaleId: "right", color: "#38bdf8", lineWidth: 1,
            priceLineVisible: false, lastValueVisible: false, title: "", crosshairMarkerVisible: false,
        });
        const sma50Series = (mainChart as any).addLineSeries({
            priceScaleId: "right", color: "#fb923c", lineWidth: 1,
            priceLineVisible: false, lastValueVisible: false, title: "", crosshairMarkerVisible: false,
        });
        const sma200Series = (mainChart as any).addLineSeries({
            priceScaleId: "right", color: "#eab308", lineWidth: 2,
            priceLineVisible: false, lastValueVisible: false, title: "", crosshairMarkerVisible: false,
        });

        const rsiSeries = (rsiChart as any).addLineSeries({
            color: "#a78bfa", lineWidth: 1, priceLineVisible: true, lastValueVisible: true,
        });
        rsiSeries.createPriceLine({ price: 70, color: "#f87171", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "" });
        rsiSeries.createPriceLine({ price: 50, color: "#475569", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "" });
        rsiSeries.createPriceLine({ price: 30, color: "#4ade80", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "" });

        const macdLineSeries = (macdChart as any).addLineSeries({
            color: "#38bdf8", lineWidth: 1, priceLineVisible: false, lastValueVisible: true,
        });
        const macdSignalSeries = (macdChart as any).addLineSeries({
            color: "#f97316", lineWidth: 1, priceLineVisible: false, lastValueVisible: true,
        });
        const macdHistSeries = (macdChart as any).addHistogramSeries({
            priceFormat: { type: "price" }, priceLineVisible: false,
        });
        macdLineSeries.createPriceLine({ price: 0, color: "#334155", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "" });

        mainChartRef.current = mainChart;
        rsiChartRef.current = rsiChart;
        macdChartRef.current = macdChart;
        candleSeriesRef.current = candleSeries;
        volumeSeriesRef.current = volumeSeries;
        ema20Ref.current = ema20Series;
        sma50Ref.current = sma50Series;
        sma200Ref.current = sma200Series;
        rsiSeriesRef.current = rsiSeries;
        macdLineRef.current = macdLineSeries;
        macdSignalRef.current = macdSignalSeries;
        macdHistRef.current = macdHistSeries;

        const ro = new ResizeObserver(() => {
            const w = mainContainerRef.current?.clientWidth;
            if (!w) return;
            mainChart.applyOptions({ width: w });
            rsiChart.applyOptions({ width: w });
            macdChart.applyOptions({ width: w });
        });
        ro.observe(mainContainerRef.current);

        let syncing = false;
        const syncTimeScale = (t1: IChartApi, t2: IChartApi, h1: () => boolean, h2: () => boolean) => (range: LogicalRange | null) => {
            if (syncing || range === null) return;
            syncing = true;
            if (h1()) t1.timeScale().setVisibleLogicalRange(range);
            if (h2()) t2.timeScale().setVisibleLogicalRange(range);
            syncing = false;
        };
        const onMainRangeChange = syncTimeScale(rsiChart, macdChart, () => rsiHasDataRef.current, () => macdHasDataRef.current);
        const onRsiRangeChange = syncTimeScale(mainChart, macdChart, () => mainHasDataRef.current, () => macdHasDataRef.current);
        const onMacdRangeChange = syncTimeScale(mainChart, rsiChart, () => mainHasDataRef.current, () => rsiHasDataRef.current);
        mainChart.timeScale().subscribeVisibleLogicalRangeChange(onMainRangeChange);
        rsiChart.timeScale().subscribeVisibleLogicalRangeChange(onRsiRangeChange);
        macdChart.timeScale().subscribeVisibleLogicalRangeChange(onMacdRangeChange);

        const onMainCrosshairMove = (param: MouseEventParams) => {
            const time = param.time;
            if (time === undefined) {
                rsiChart.clearCrosshairPosition();
                macdChart.clearCrosshairPosition();
                return;
            }
            const rsiPoints = rsiPointsRef.current;
            if (rsiPoints.length > 0) {
                const rsiValue = findValueAtTime(rsiPoints, time as any);
                if (rsiValue !== undefined) rsiChart.setCrosshairPosition(rsiValue, time, rsiSeries);
                else rsiChart.clearCrosshairPosition();
            }
            const macdPoints = macdLinePointsRef.current;
            if (macdPoints.length > 0) {
                const macdValue = findValueAtTime(macdPoints, time as any);
                if (macdValue !== undefined) macdChart.setCrosshairPosition(macdValue, time, macdLineSeries);
                else macdChart.clearCrosshairPosition();
            }
        };
        mainChart.subscribeCrosshairMove(onMainCrosshairMove);

        return () => {
            ro.disconnect();
            mainChart.unsubscribeCrosshairMove(onMainCrosshairMove);
            mainChart.timeScale().unsubscribeVisibleLogicalRangeChange(onMainRangeChange);
            rsiChart.timeScale().unsubscribeVisibleLogicalRangeChange(onRsiRangeChange);
            macdChart.timeScale().unsubscribeVisibleLogicalRangeChange(onMacdRangeChange);
            mainChart.remove();
            rsiChart.remove();
            macdChart.remove();
        };
    }, []);

    // Handle dynamic heights when panels open/close or expand toggles
    useEffect(() => {
        const totalH = expanded ? 760 : 560;
        const panelCount = (rsiOpen ? 1 : 0) + (macdOpen ? 1 : 0);
        let mainH: number, rsiH: number, macdH: number;

        if (panelCount === 0) {
            mainH = totalH;
            rsiH = 0;
            macdH = 0;
        } else if (panelCount === 1) {
            mainH = Math.round(totalH * 0.75);
            rsiH = rsiOpen ? totalH - mainH : 0;
            macdH = macdOpen ? totalH - mainH : 0;
        } else {
            mainH = Math.round(totalH * 0.62);
            rsiH = Math.round(totalH * 0.22);
            macdH = totalH - mainH - rsiH;
        }

        mainChartRef.current?.applyOptions({ height: mainH });
        rsiChartRef.current?.applyOptions({ height: rsiH });
        macdChartRef.current?.applyOptions({ height: macdH });
        // Adjust main chart price scale: volume takes bottom 28% only when visible
        mainChartRef.current?.priceScale("right").applyOptions({
            scaleMargins: { top: 0.05, bottom: volumeVisible ? 0.32 : 0 },
        });
    }, [expanded, rsiOpen, macdOpen, volumeVisible]);

    // Update series data when coin / interval / klines change
    useEffect(() => {
        if (!candleSeriesRef.current || !volumeSeriesRef.current) return;

        if (klines.length === 0) {
            candleSeriesRef.current.setData([]);
            volumeSeriesRef.current.setData([]);
            ema20Ref.current?.setData([]);
            sma50Ref.current?.setData([]);
            sma200Ref.current?.setData([]);
            rsiSeriesRef.current?.setData([]);
            macdLineRef.current?.setData([]);
            macdSignalRef.current?.setData([]);
            macdHistRef.current?.setData([]);
            mainHasDataRef.current = false;
            rsiHasDataRef.current = false;
            macdHasDataRef.current = false;
            rsiPointsRef.current = [];
            macdLinePointsRef.current = [];
            macdSignalPointsRef.current = [];
            ema20PointsRef.current = [];
            sma50PointsRef.current = [];
            sma200PointsRef.current = [];
            return;
        }
        mainHasDataRef.current = true;

        const coinOrIntervalChanged =
            selectedCoin !== prevCoinRef.current ||
            selectedInterval !== prevIntervalRef.current;
        prevCoinRef.current = selectedCoin;
        prevIntervalRef.current = selectedInterval;

        const times = klines.map((k) => Math.floor(k.openTime / 1000) as any);
        const closes = klines.map((k) => k.close);

        candleSeriesRef.current.setData(
            klines.map((k, i) => ({ time: times[i], open: k.open, high: k.high, low: k.low, close: k.close }))
        );

        // Volume — conditional on volumeVisible
        if (volumeVisible) {
            volumeSeriesRef.current.setData(
                klines.map((k, i) => ({
                    time: times[i], value: k.volume,
                    color: k.close >= k.open ? "#4ade8055" : "#f8717155",
                }))
            );
        } else {
            volumeSeriesRef.current.setData([]);
        }

        // EMA20
        if (ema20Visible) {
            const ema20 = computeEMASeries(closes, 20);
            const ema20Points = ema20.flatMap((v, i) => (v !== null ? [{ time: times[i], value: v }] : []));
            ema20Ref.current?.setData(ema20Points);
            ema20PointsRef.current = ema20Points;
        } else {
            ema20Ref.current?.setData([]);
            ema20PointsRef.current = [];
        }

        // SMA50
        if (sma50Visible) {
            const sma50 = computeSMASeries(closes, 50);
            const sma50Points = sma50.flatMap((v, i) => (v !== null ? [{ time: times[i], value: v }] : []));
            sma50Ref.current?.setData(sma50Points);
            sma50PointsRef.current = sma50Points;
        } else {
            sma50Ref.current?.setData([]);
            sma50PointsRef.current = [];
        }

        // SMA200
        if (sma200Visible) {
            const sma200 = computeSMASeries(closes, 200);
            const sma200Points = sma200.flatMap((v, i) => (v !== null ? [{ time: times[i], value: v }] : []));
            sma200Ref.current?.setData(sma200Points);
            sma200PointsRef.current = sma200Points;
        } else {
            sma200Ref.current?.setData([]);
            sma200PointsRef.current = [];
        }

        // RSI (always computed for crosshair sync, even when panel closed)
        const rsi = computeRSISeries(closes);
        const rsiPoints = rsi.flatMap((v, i) => (v !== null ? [{ time: times[i], value: v }] : []));
        rsiSeriesRef.current?.setData(rsiPoints);
        rsiHasDataRef.current = rsiPoints.length > 0;
        rsiPointsRef.current = rsiPoints;

        // MACD (always computed for crosshair sync)
        const { macd, signal, histogram } = computeMACDSeries(closes);
        const macdLinePoints = macd.flatMap((v, i) => (v !== null ? [{ time: times[i], value: v }] : []));
        const macdSignalPoints = signal.flatMap((v, i) => (v !== null ? [{ time: times[i], value: v }] : []));
        const macdHistPoints = histogram.flatMap((v, i) =>
            v !== null ? [{ time: times[i], value: v, color: v >= 0 ? "#4ade8066" : "#f8717166" }] : []
        );
        macdLineRef.current?.setData(macdLinePoints);
        macdSignalRef.current?.setData(macdSignalPoints);
        macdHistRef.current?.setData(macdHistPoints);
        macdHasDataRef.current = macdLinePoints.length > 0;
        macdLinePointsRef.current = macdLinePoints;
        macdSignalPointsRef.current = macdSignalPoints;

        if (coinOrIntervalChanged) {
            candleSeriesRef.current?.priceScale().applyOptions({ autoScale: true });
            mainChartRef.current?.timeScale().fitContent();
            if (rsiHasDataRef.current) rsiChartRef.current?.timeScale().fitContent();
            if (macdHasDataRef.current) macdChartRef.current?.timeScale().fitContent();
        }
    }, [klines, selectedCoin, selectedInterval, ema20Visible, sma50Visible, sma200Visible, volumeVisible]);

    const getIndicatorValuesAtTime = useCallback((time: number) => {
        const ema20 = findValueAtTime(ema20PointsRef.current, time);
        const sma50 = findValueAtTime(sma50PointsRef.current, time);
        const sma200 = findValueAtTime(sma200PointsRef.current, time);
        const rsi = findValueAtTime(rsiPointsRef.current, time);
        const macdLine = findValueAtTime(macdLinePointsRef.current, time);
        const macdSignal = findValueAtTime(macdSignalPointsRef.current, time);
        if (ema20 === undefined && sma50 === undefined && rsi === undefined && macdLine === undefined) return null;
        return {
            ema20: ema20 ?? null, sma50: sma50 ?? null, sma200: sma200 ?? null,
            rsi: rsi ?? null, macdLine: macdLine ?? null, macdSignal: macdSignal ?? null,
            macdHistogram: (macdLine != null && macdSignal != null) ? macdLine - macdSignal : null,
        };
    }, []);

    const getLatestIndicatorValues = useCallback(() => {
        const last = (pts: { time: number; value: number }[]) => pts.length > 0 ? pts[pts.length - 1].value : null;
        return {
            ema20: last(ema20PointsRef.current), sma50: last(sma50PointsRef.current), sma200: last(sma200PointsRef.current),
            rsi: last(rsiPointsRef.current), macdLine: last(macdLinePointsRef.current), macdSignal: last(macdSignalPointsRef.current),
            macdHistogram: (() => {
                const ml = last(macdLinePointsRef.current); const ms = last(macdSignalPointsRef.current);
                return (ml != null && ms != null) ? ml - ms : null;
            })(),
        };
    }, []);

    const getIndicatorPoints = useCallback(() => ({
        ema20: ema20PointsRef.current, sma50: sma50PointsRef.current, sma200: sma200PointsRef.current,
        rsi: rsiPointsRef.current, macdLine: macdLinePointsRef.current, macdSignal: macdSignalPointsRef.current,
    }), []);

    return {
        mainChartRef, candleSeriesRef, volumeSeriesRef,
        getIndicatorValuesAtTime, getLatestIndicatorValues, getIndicatorPoints,
    };
}
