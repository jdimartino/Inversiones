import React, { useState, useCallback } from "react";
import { X, Archive } from "lucide-react";
import type { SaleRecord } from "../lib/constants";
import { fmtPrice, fmtUSD, fmt } from "../lib/format";

interface CloseVentaModalProps {
    sale: SaleRecord;
    onConfirm: (buyPrice: number) => Promise<void>;
    onClose: () => void;
}

const CloseVentaModal: React.FC<CloseVentaModalProps> = ({ sale, onConfirm, onClose }) => {
    const [buyPrice, setBuyPrice] = useState("");
    const [saving, setSaving] = useState(false);

    const parsedBuy = parseFloat(buyPrice) || 0;
    const invested = parsedBuy * sale.quantity;
    const pnl = sale.usdtReceived - invested;
    const pnlPercent = invested > 0 ? (pnl / invested) * 100 : 0;
    const pnlPositive = pnl >= 0;

    const handleConfirm = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            if (parsedBuy <= 0 || saving) return;
            setSaving(true);
            try {
                await onConfirm(parsedBuy);
            } finally {
                setSaving(false);
            }
        },
        [parsedBuy, saving, onConfirm]
    );

    return (
        <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm">
                <div className="flex justify-between items-center p-5 border-b border-slate-700">
                    <h2 className="font-bold text-yellow-400 text-sm uppercase tracking-widest flex items-center gap-2">
                        <Archive className="w-4 h-4" /> Cerrar Posición de Venta
                    </h2>
                    <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleConfirm} className="p-5 space-y-4">
                    <div className="bg-slate-900/50 rounded-xl p-3 space-y-1.5 border border-slate-700/50">
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500 uppercase tracking-wider font-bold">Activo</span>
                            <span className="text-white font-bold">{sale.coin}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500 uppercase tracking-wider font-bold">Cantidad</span>
                            <span className="text-slate-300 font-mono">{fmt(sale.quantity)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500 uppercase tracking-wider font-bold">Precio Venta</span>
                            <span className="text-emerald-300 font-mono">{fmtPrice(sale.sellPrice)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500 uppercase tracking-wider font-bold">USDT Recibido</span>
                            <span className="text-emerald-400 font-mono font-bold">{fmtUSD(sale.usdtReceived)}</span>
                        </div>
                    </div>

                    <div>
                        <label className="text-[10px] uppercase text-slate-500 font-bold tracking-wider block mb-1.5">
                            Precio de Compra Original (USD)
                        </label>
                        <input
                            type="number"
                            step="any"
                            min="0"
                            value={buyPrice}
                            onChange={(e) => setBuyPrice(e.target.value)}
                            placeholder="Ej: 45000"
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white outline-none focus:ring-2 focus:ring-yellow-500 transition-all text-sm font-mono"
                            autoFocus
                        />
                    </div>

                    {parsedBuy > 0 && (
                        <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-700/50 space-y-1.5">
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-500 uppercase tracking-wider font-bold">Capital Invertido</span>
                                <span className="text-slate-300 font-mono">{fmtUSD(invested)}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-500 uppercase tracking-wider font-bold">P&L</span>
                                <span className={`font-mono font-bold ${pnlPositive ? "text-green-400" : "text-red-400"}`}>
                                    {pnlPositive ? "+" : ""}{fmtUSD(pnl)}
                                </span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-500 uppercase tracking-wider font-bold">Rendimiento</span>
                                <span className={`font-mono font-bold ${pnlPositive ? "text-green-400" : "text-red-400"}`}>
                                    {pnlPositive ? "+" : ""}{pnlPercent.toFixed(2)}%
                                </span>
                            </div>
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 font-bold py-3 rounded-xl transition-all text-xs uppercase tracking-widest"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving || parsedBuy <= 0}
                            className="flex-1 bg-emerald-700 hover:bg-emerald-600 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-widest disabled:opacity-50"
                        >
                            <Archive className="w-3.5 h-3.5" />
                            {saving ? "Cerrando..." : "Cerrar Posición"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CloseVentaModal;
