import React from "react";
import type { RefObject } from "react";
import type { Interval, MeasureStats } from "../../../lib/types/chart";
import { fmtPrice } from "../../../lib/format";
import { fmtVol, fmtMeasureTime } from "./chartUtils";
import type { MeasureRect, MeasureOverlayHandlers } from "../../../hooks/useMeasureTool";

interface MeasureToolProps {
    overlayRef: RefObject<HTMLDivElement>;
    overlayHandlers: MeasureOverlayHandlers;
    measureRect: MeasureRect | null;
    measureStats: MeasureStats | null;
    tooltipPos: { top: number; left: number } | null;
    selectedInterval: Interval;
}

const MeasureTool: React.FC<MeasureToolProps> = ({
    overlayRef,
    overlayHandlers,
    measureRect,
    measureStats,
    tooltipPos,
    selectedInterval,
}) => {
    return (
        <div
            ref={overlayRef}
            className="absolute inset-0 z-20 select-none"
            style={{ cursor: 'crosshair', touchAction: 'none' }}
            {...overlayHandlers}
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
    );
};

export default MeasureTool;