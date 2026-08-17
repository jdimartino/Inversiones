import React from "react";
import { ProcessedInvestment, SaleRecord } from "../../../lib/constants";
import { FuturesPosition } from "../../../lib/futures";
import type { OhlcvLegend } from "../../../lib/types/chart";
import { fmtPrice, fmtUSD } from "../../../lib/format";
import { fmtVol } from "./chartUtils";

interface ChartLegendProps {
    legend: OhlcvLegend | null;
    coinSales: SaleRecord[];
    coinItems: ProcessedInvestment[];
    coinFutures: FuturesPosition[];
    currentPrice: number;
}

const ChartLegend: React.FC<ChartLegendProps> = ({
    legend,
    coinSales,
    coinItems,
    coinFutures,
    currentPrice,
}) => {
    return (
        <>
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
        </>
    );
};

export default ChartLegend;