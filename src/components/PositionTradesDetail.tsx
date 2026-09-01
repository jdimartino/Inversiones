import React, { useState, useMemo } from "react";
import { Calculator } from "lucide-react";
import type { FuturesPosition } from "../lib/futures";
import { fmtPrice } from "../lib/format";

interface PositionTradesDetailProps {
    position: FuturesPosition;
}

const PositionTradesDetail: React.FC<PositionTradesDetailProps> = ({ position }) => {
    const [simPrice, setSimPrice] = useState(() => position.markPrice.toString());

    const simulation = useMemo(() => {
        const price = parseFloat(simPrice);
        if (!Number.isFinite(price) || price <= 0) return null;

        const signedAmt = position.side === "LONG" ? price - position.entryPrice : position.entryPrice - price;
        const pnl = signedAmt * position.size;
        const roe = position.initialMargin > 0 ? (pnl / position.initialMargin) * 100 : 0;

        return { price, pnl, roe };
    }, [simPrice, position]);

    const pnlColor = simulation
        ? simulation.pnl >= 0 ? "text-emerald-400" : "text-red-400"
        : "text-gray-500";

    return (
        <div className="bg-[#0E1014] border-x border-b border-gray-800 rounded-b-xl">
            <div className="p-4">
                <div className="flex items-center gap-2 mb-3">
                    <Calculator size={16} className="text-gray-500" />
                    <span className="text-gray-400 text-sm font-medium">Simulador de Precios</span>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1">
                        <label className="text-gray-500 text-xs mb-1 block">Precio de cierre</label>
                        <input
                            type="number"
                            value={simPrice}
                            onChange={(e) => setSimPrice(e.target.value)}
                            placeholder="0.00"
                            min="0"
                            step="any"
                            className="w-full bg-[#181A20] border border-gray-800 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-gray-600 placeholder-gray-600"
                        />
                    </div>

                    <div className="flex-1 grid grid-cols-2 gap-2">
                        <div className="bg-[#181A20] rounded-lg p-2 border border-gray-800">
                            <div className="text-gray-500 text-xs mb-0.5">PNL</div>
                            <div className={`font-mono font-bold text-sm ${pnlColor}`}>
                                {simulation ? `${simulation.pnl >= 0 ? "+" : ""}$${Math.abs(simulation.pnl).toFixed(2)}` : "—"}
                            </div>
                        </div>
                        <div className="bg-[#181A20] rounded-lg p-2 border border-gray-800">
                            <div className="text-gray-500 text-xs mb-0.5">ROE</div>
                            <div className={`font-mono font-bold text-sm ${pnlColor}`}>
                                {simulation ? `${simulation.roe >= 0 ? "+" : ""}${simulation.roe.toFixed(1)}%` : "—"}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="bg-[#181A20] rounded-lg p-2 border border-gray-800">
                        <div className="text-gray-500 mb-0.5">Posición</div>
                        <div className={`font-bold ${position.side === "LONG" ? "text-emerald-400" : "text-red-400"}`}>
                            {position.side} {position.size} {position.symbol.replace("USDT", "")}
                        </div>
                    </div>
                    <div className="bg-[#181A20] rounded-lg p-2 border border-gray-800">
                        <div className="text-gray-500 mb-0.5">Entrada</div>
                        <div className="text-white font-mono font-bold">{fmtPrice(position.entryPrice)}</div>
                    </div>
                    <div className="bg-[#181A20] rounded-lg p-2 border border-gray-800">
                        <div className="text-gray-500 mb-0.5">Actual</div>
                        <div className="text-white font-mono font-bold">{fmtPrice(position.markPrice)}</div>
                    </div>
                    <div className="bg-[#181A20] rounded-lg p-2 border border-gray-800">
                        <div className="text-gray-500 mb-0.5">Margen</div>
                        <div className="text-white font-mono font-bold">{fmtPrice(position.initialMargin)}</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PositionTradesDetail;
