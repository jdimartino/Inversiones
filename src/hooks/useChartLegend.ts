import { useEffect, useState } from "react";
import type { RefObject } from "react";
import type { IChartApi, ISeriesApi, MouseEventParams } from "lightweight-charts";
import type { OhlcvLegend } from "../lib/types/chart";

interface UseChartLegendParams {
    mainChartRef: RefObject<IChartApi | null>;
    candleSeriesRef: RefObject<ISeriesApi<"Candlestick"> | null>;
    volumeSeriesRef: RefObject<ISeriesApi<"Histogram"> | null>;
}

export function useChartLegend({ mainChartRef, candleSeriesRef, volumeSeriesRef }: UseChartLegendParams) {
    const [legend, setLegend] = useState<OhlcvLegend | null>(null);

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
    }, [candleSeriesRef, mainChartRef, volumeSeriesRef]);

    return { legend };
}