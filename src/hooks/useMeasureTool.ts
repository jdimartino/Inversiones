import React, { useEffect, useRef, useState, useCallback } from "react";
import type { RefObject } from "react";
import { IChartApi, ISeriesApi } from "lightweight-charts";
import type { Kline } from "../lib/types/signals";
import type { Interval, MeasureAnchor, MeasureStats } from "../lib/types/chart";

export interface MeasureRect { left: number; top: number; width: number; height: number; }

export interface MeasureOverlayHandlers {
    onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
    onMouseMove: (e: React.MouseEvent<HTMLDivElement>) => void;
    onMouseUp: (e: React.MouseEvent<HTMLDivElement>) => void;
    onMouseLeave: () => void;
    onTouchStart: (e: React.TouchEvent<HTMLDivElement>) => void;
    onTouchMove: (e: React.TouchEvent<HTMLDivElement>) => void;
    onTouchEnd: (e: React.TouchEvent<HTMLDivElement>) => void;
}

interface UseMeasureToolParams {
    mainChartRef: RefObject<IChartApi | null>;
    candleSeriesRef: RefObject<ISeriesApi<"Candlestick"> | null>;
    getCurrentKlines: () => Kline[];
    selectedCoin: string;
    selectedInterval: Interval;
    mainContainerRef: RefObject<HTMLDivElement | null>;
}

export function useMeasureTool({
    mainChartRef,
    candleSeriesRef,
    getCurrentKlines,
    selectedCoin,
    selectedInterval,
    mainContainerRef,
}: UseMeasureToolParams) {
    // Measure tool state
    const [measureMode, setMeasureMode] = useState(false);
    const [measureDragging, setMeasureDragging] = useState(false);
    const [measureStart, setMeasureStart] = useState<MeasureAnchor | null>(null);
    const [measureEnd, setMeasureEnd] = useState<MeasureAnchor | null>(null);
    const [measureStats, setMeasureStats] = useState<MeasureStats | null>(null);
    const measureWasTouchRef = useRef(false);
    const overlayRef = useRef<HTMLDivElement>(null);

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

    // ── Measure tool handlers ───────────────────────────────────────
    const handleMeasureMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!overlayRef.current) return;
        e.preventDefault();
        measureWasTouchRef.current = false;
        const rect = overlayRef.current.getBoundingClientRect();
        const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        setMeasureStart(anchor); setMeasureEnd(anchor);
        setMeasureDragging(true); setMeasureStats(null);
    }, []);

    const handleMeasureMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!measureDragging || !overlayRef.current || !measureStart) return;
        const rect = overlayRef.current.getBoundingClientRect();
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
        if (!measureDragging || !overlayRef.current) return;
        const rect = overlayRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        setMeasureEnd({ x, y });
        finalizeMeasure(x, y);
    }, [measureDragging, finalizeMeasure]);

    const handleMeasureMouseLeave = useCallback(() => {
        if (measureDragging && measureEnd) finalizeMeasure(measureEnd.x, measureEnd.y);
    }, [measureDragging, measureEnd, finalizeMeasure]);

    const handleMeasureTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
        if (!overlayRef.current) return;
        e.preventDefault();
        measureWasTouchRef.current = true;
        const touch = e.touches[0];
        const rect = overlayRef.current.getBoundingClientRect();
        const anchor = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
        setMeasureStart(anchor); setMeasureEnd(anchor);
        setMeasureDragging(true); setMeasureStats(null);
    }, []);

    const handleMeasureTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
        if (!measureDragging || !overlayRef.current || !measureStart) return;
        e.preventDefault();
        const touch = e.touches[0];
        const rect = overlayRef.current.getBoundingClientRect();
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
        if (!measureDragging || !overlayRef.current) return;
        e.preventDefault();
        const touch = e.changedTouches[0];
        const rect = overlayRef.current.getBoundingClientRect();
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

    const overlayHandlers: MeasureOverlayHandlers = {
        onMouseDown: handleMeasureMouseDown,
        onMouseMove: handleMeasureMouseMove,
        onMouseUp: handleMeasureMouseUp,
        onMouseLeave: handleMeasureMouseLeave,
        onTouchStart: handleMeasureTouchStart,
        onTouchMove: handleMeasureTouchMove,
        onTouchEnd: handleMeasureTouchEnd,
    };

    return {
        measureMode,
        setMeasureMode,
        measureRect,
        measureStats,
        tooltipPos,
        overlayRef,
        overlayHandlers,
    };
}