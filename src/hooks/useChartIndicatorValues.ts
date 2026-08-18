import { useEffect, useState, useCallback } from "react";
import type { RefObject } from "react";
import type { IChartApi, MouseEventParams } from "lightweight-charts";

export interface IndicatorValues {
    ema20: number | null;
    sma50: number | null;
    sma200: number | null;
    rsi: number | null;
    macdLine: number | null;
    macdSignal: number | null;
    macdHistogram: number | null;
}

interface UseChartIndicatorValuesParams {
    mainChartRef: RefObject<IChartApi | null>;
    getIndicatorValuesAtTime: (time: number) => IndicatorValues | null;
    getLatestIndicatorValues: () => IndicatorValues;
}

export function useChartIndicatorValues({
    mainChartRef,
    getIndicatorValuesAtTime,
    getLatestIndicatorValues,
}: UseChartIndicatorValuesParams) {
    const [values, setValues] = useState<IndicatorValues>(getLatestIndicatorValues);

    useEffect(() => {
        const chart = mainChartRef.current;
        if (!chart) return;

        const handler = (param: MouseEventParams) => {
            const time = param.time as number | undefined;
            if (time === undefined) {
                setValues(getLatestIndicatorValues());
                return;
            }
            const v = getIndicatorValuesAtTime(time);
            if (v) setValues(v);
            else setValues(getLatestIndicatorValues());
        };

        chart.subscribeCrosshairMove(handler);
        // Initialize with latest values
        setValues(getLatestIndicatorValues());

        return () => { chart.unsubscribeCrosshairMove(handler); };
    }, []);

    return values;
}
