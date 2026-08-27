import React from "react";
import { Info } from "lucide-react";
import type { FuturesPosition } from "../lib/futures";
import { fmtPrice } from "../lib/format";

interface PositionTradesDetailProps {
    position: FuturesPosition;
}

const PositionTradesDetail: React.FC<PositionTradesDetailProps> = ({ position }) => {
    return (
        <div className="bg-[#0E1014] border-x border-b border-gray-800 rounded-b-xl">
            <div className="p-4 text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                    <Info size={16} className="text-gray-500" />
                    <span className="text-gray-400 text-sm font-medium">Detalle de órdenes</span>
                </div>
                <p className="text-gray-600 text-xs leading-relaxed max-w-md mx-auto">
                    El historial de órdenes por posición no está disponible actualmente.
                    Los datos de posición (entrada, actual, PnL, ROE) se muestran correctamente
                    desde la sincronización de Binance Futures.
                </p>
                <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
                    <div className="bg-[#181A20] rounded-lg p-2 border border-gray-800">
                        <div className="text-gray-500 mb-0.5">Entrada</div>
                        <div className="text-white font-mono font-bold">{fmtPrice(position.entryPrice)}</div>
                    </div>
                    <div className="bg-[#181A20] rounded-lg p-2 border border-gray-800">
                        <div className="text-gray-500 mb-0.5">Break Even</div>
                        <div className="text-white font-mono font-bold">{fmtPrice(position.breakEvenPrice)}</div>
                    </div>
                    <div className="bg-[#181A20] rounded-lg p-2 border border-gray-800">
                        <div className="text-gray-500 mb-0.5">Tamaño</div>
                        <div className="text-white font-mono font-bold">{position.size} {position.symbol.replace("USDT", "")}</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PositionTradesDetail;
