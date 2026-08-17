import { useEffect, useRef } from "react";
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
import { computeEMASeries, computeSMASeries, computeRSISeries, computeMACDSeries } from "../lib/indicators";

interface UseChartSeriesParams {
    mainContainerRef: RefObject<HTMLDivElement>;
    rsiContainerRef: RefObject<HTMLDivElement>;
    macdContainerRef: RefObject<HTMLDivElement>;
    klines: Kline[];
    selectedCoin: string;
    selectedInterval: Interval;
    expanded: boolean;
}

export function useChartSeries({ mainContainerRef, rsiContainerRef, macdContainerRef, klines, selectedCoin, selectedInterval, expanded }: UseChartSeriesParams) {
    // Chart instances
    const mainChartRef = useRef<IChartApi | null>(null);
    const rsiChartRef = useRef<IChartApi | null>(null);
    const macdChartRef = useRef<IChartApi | null>(null);

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
    const mainHasDataRef = useRef(false);
    const rsiHasDataRef = useRef(false);
    const macdHasDataRef = useRef(false);
    const rsiPointsRef = useRef<{ time: number; value: number }[]>([]);
    const macdLinePointsRef = useRef<{ time: number; value: number }[]>([]);

    // Create charts once on mount
    useEffect(() => {
        if (!mainContainerRef.current || !rsiContainerRef.current || !macdContainerRef.current) return;

        const priceScaleWidth = 70;
        const mainHeight = Math.round(560 * 0.62);
        const rsiHeight = Math.round(560 * 0.22);
        const macdHeight = 560 - mainHeight - rsiHeight;

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
            // LW 4.2.3 PaneWidget._private__pressedMouseTouchMoveEvent crashes on null priceRange.
            // Disable built-in pressedMouseMove; custom time-pan is implemented below.
            handleScroll: { mouseWheel: true, pressedMouseMove: false, horzTouchDrag: true, vertTouchDrag: false },
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
            // Línea vertical activa para el crosshair sync (sin labels extra).
            crosshair: { mode: CrosshairMode.Normal, vertLine: { visible: true, labelVisible: false }, horzLine: { visible: false } },
            timeScale: { ...timeScaleOptions, visible: false },
            handleScroll: false,
            handleScale: false,
            height: rsiHeight,
        });

        const macdChart = createChart(macdContainerRef.current, {
            ...baseChartOptions,
            // Línea vertical activa para el crosshair sync (sin labels extra).
            crosshair: { mode: CrosshairMode.Normal, vertLine: { visible: true, labelVisible: false }, horzLine: { visible: false } },
            timeScale: { ...timeScaleOptions, visible: true },
            handleScroll: false,
            handleScale: false,
            height: macdHeight,
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

        // ── RSI series + reference lines (chart propio) ──────────────
        const rsiSeries = (rsiChart as any).addLineSeries({
            color: "#a78bfa", lineWidth: 1,
            priceLineVisible: true, lastValueVisible: true,
        });
        rsiSeries.createPriceLine({ price: 70, color: "#f87171", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "" });
        rsiSeries.createPriceLine({ price: 50, color: "#475569", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "" });
        rsiSeries.createPriceLine({ price: 30, color: "#4ade80", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "" });

        // ── MACD series + zero line (chart propio) ───────────────────
        const macdLineSeries = (macdChart as any).addLineSeries({
            color: "#38bdf8", lineWidth: 1,
            priceLineVisible: false, lastValueVisible: true,
        });
        const macdSignalSeries = (macdChart as any).addLineSeries({
            color: "#f97316", lineWidth: 1,
            priceLineVisible: false, lastValueVisible: true,
        });
        const macdHistSeries = (macdChart as any).addHistogramSeries({
            priceFormat: { type: "price" }, priceLineVisible: false,
        });
        macdLineSeries.createPriceLine({ price: 0, color: "#334155", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "" });

        // Store refs
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

        // ResizeObserver
        const ro = new ResizeObserver(() => {
            const w = mainContainerRef.current?.clientWidth;
            if (!w) return;
            mainChart.applyOptions({ width: w });
            rsiChart.applyOptions({ width: w });
            macdChart.applyOptions({ width: w });
        });
        ro.observe(mainContainerRef.current);

        // Sync del rango visible de tiempo entre los 3 charts
        let syncing = false;
        const syncTimeScale = (target1: IChartApi, target2: IChartApi, hasData1: () => boolean, hasData2: () => boolean) => (range: LogicalRange | null) => {
            if (syncing || range === null) return;
            syncing = true;
            if (hasData1()) target1.timeScale().setVisibleLogicalRange(range);
            if (hasData2()) target2.timeScale().setVisibleLogicalRange(range);
            syncing = false;
        };
        const onMainRangeChange = syncTimeScale(rsiChart, macdChart, () => rsiHasDataRef.current, () => macdHasDataRef.current);
        const onRsiRangeChange = syncTimeScale(mainChart, macdChart, () => mainHasDataRef.current, () => macdHasDataRef.current);
        const onMacdRangeChange = syncTimeScale(mainChart, rsiChart, () => mainHasDataRef.current, () => rsiHasDataRef.current);
        mainChart.timeScale().subscribeVisibleLogicalRangeChange(onMainRangeChange);
        rsiChart.timeScale().subscribeVisibleLogicalRangeChange(onRsiRangeChange);
        macdChart.timeScale().subscribeVisibleLogicalRangeChange(onMacdRangeChange);

        // ── Crosshair sync: RSI/MACD siguen el crosshair del main chart ──
        const findValueAtTime = (points: { time: number; value: number }[], time: number) => {
            let lo = 0;
            let hi = points.length - 1;
            while (lo <= hi) {
                const mid = (lo + hi) >> 1;
                const t = points[mid].time;
                if (t === time) return points[mid].value;
                if (t < time) lo = mid + 1;
                else hi = mid - 1;
            }
            return undefined;
        };
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

        // ── Custom pan (bypasses LW 4.2.3 pressedMouseMove crash) ──
        // Horizontal: uses public setVisibleLogicalRange API.
        // Vertical: uses internal Model scroll methods with autoScale disabled.
        const psApi = (mainChart as any).priceScale("right");
        const model = psApi._private__chartWidget._internal_model();
        const paneInfo = model._internal_findPriceScale("right");
        const internalPriceScale = paneInfo._internal_priceScale;
        const internalPane = paneInfo._internal_pane;

        let panStartX = 0;
        let panStartY = 0;
        let panStartLogical: LogicalRange | null = null;
        let isPanning = false;
        let isVerticalPan = false;
        let priceScrollStarted = false;

        const onPanMouseDown = (e: MouseEvent) => {
            if (e.button !== 0) return;
            const range = mainChart.timeScale().getVisibleLogicalRange();
            isPanning = true;
            isVerticalPan = false;
            priceScrollStarted = false;
            panStartX = e.clientX;
            panStartY = e.clientY;
            panStartLogical = range;
        };
        const onPanMouseMove = (e: MouseEvent) => {
            if (!isPanning) return;
            e.preventDefault();

            const dx = Math.abs(e.clientX - panStartX);
            const dy = Math.abs(e.clientY - panStartY);

            if (!isVerticalPan && dy > dx && dy > 3) {
                isVerticalPan = true;
            }

            if (isVerticalPan) {
                if (!priceScrollStarted) {
                    internalPriceScale._internal_setMode({ _internal_autoScale: false });
                    model._internal_startScrollPrice(internalPane, internalPriceScale, panStartY);
                    priceScrollStarted = true;
                }
                model._internal_scrollPriceTo(internalPane, internalPriceScale, e.clientY);
            } else if (panStartLogical) {
                const pixelDelta = e.clientX - panStartX;
                const chartWidth = mainContainerRef.current?.clientWidth || 1;
                const totalLogical = panStartLogical.to - panStartLogical.from;
                const logicalDelta = (pixelDelta / chartWidth) * totalLogical;
                mainChart.timeScale().setVisibleLogicalRange({
                    from: panStartLogical.from - logicalDelta,
                    to: panStartLogical.to - logicalDelta,
                });
            }
        };
        const onPanMouseUp = () => {
            if (priceScrollStarted) {
                model._internal_endScrollPrice(internalPane, internalPriceScale);
            }
            isPanning = false;
            isVerticalPan = false;
            priceScrollStarted = false;
            panStartLogical = null;
        };

        mainContainerRef.current?.addEventListener("mousedown", onPanMouseDown);
        window.addEventListener("mousemove", onPanMouseMove);
        window.addEventListener("mouseup", onPanMouseUp);

        return () => {
            mainContainerRef.current?.removeEventListener("mousedown", onPanMouseDown);
            window.removeEventListener("mousemove", onPanMouseMove);
            window.removeEventListener("mouseup", onPanMouseUp);
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

    // Handle expand toggle
    useEffect(() => {
        const totalHeight = expanded ? 760 : 560;
        const mainHeight = Math.round(totalHeight * 0.62);
        const rsiHeight = Math.round(totalHeight * 0.22);
        const macdHeight = totalHeight - mainHeight - rsiHeight;
        mainChartRef.current?.applyOptions({ height: mainHeight });
        rsiChartRef.current?.applyOptions({ height: rsiHeight });
        macdChartRef.current?.applyOptions({ height: macdHeight });
        mainChartRef.current?.priceScale("right").applyOptions({ autoScale: true });
    }, [expanded]);

    // Update series data when coin / interval / klines change
    useEffect(() => {
        if (!candleSeriesRef.current || !volumeSeriesRef.current || klines.length === 0) return;
        mainHasDataRef.current = true;

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
        const rsiPoints = rsi.flatMap((v, i) => (v !== null ? [{ time: times[i], value: v }] : []));
        rsiSeriesRef.current?.setData(rsiPoints);
        rsiHasDataRef.current = rsiPoints.length > 0;
        rsiPointsRef.current = rsiPoints;

        // MACD
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

        if (coinOrIntervalChanged) {
            candleSeriesRef.current?.priceScale().applyOptions({ autoScale: true });
            mainChartRef.current?.timeScale().fitContent();
            if (rsiHasDataRef.current) rsiChartRef.current?.timeScale().fitContent();
            if (macdHasDataRef.current) macdChartRef.current?.timeScale().fitContent();
        }
    }, [klines, selectedCoin, selectedInterval]);

    return {
        mainChartRef,
        candleSeriesRef,
        volumeSeriesRef,
    };
}
