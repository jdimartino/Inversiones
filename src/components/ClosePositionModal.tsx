import React, { useState, useCallback } from "react";
import { X, Archive } from "lucide-react";
import type { ProcessedInvestment } from "../lib/constants";
import { fmtPrice, fmtUSD } from "../lib/format";

interface ClosePositionModalProps {
    investment: ProcessedInvestment;
    onConfirm: (sellPrice: number) => Promise<void>;
    onClose: () => void;
}

const ClosePositionModal: React.FC<ClosePositionModalProps> = ({
    investment,
    onConfirm,
    onClose,
}) => {
    const [sellPrice, setSellPrice] = useState(String(investment.currentPrice));
    const [saving, setSaving] = useState(false);

    const parsedSell = parseFloat(sellPrice) || 0;
    const soldValue = parsedSell * investment.quantity;
    const pnl = soldValue - investment.invested;
    const pnlPercent = investment.invested > 0 ? (pnl / investment.invested) * 100 : 0;
    const pnlPositive = pnl >= 0;

    const handleConfirm = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            if (parsedSell <= 0 || saving) return;
            setSaving(true);
            try {
                await onConfirm(parsedSell);
            } finally {
                setSaving(false);
            }
        },
        [parsedSell, saving, onConfirm]
    );

    return (
        <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm">
                {/* Header */}
                <div className="flex justify-between items-center p-5 border-b border-slate-700">
                    <h2 className="font-bold text-yellow-400 text-sm uppercase tracking-widest flex items-center gap-2">
                        <Archive className="w-4 h-4" /> Cerrar Posición
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-slate-500 hover:text-white transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleConfirm} className="p-5 space-y-4">
                    {/* Position summary */}
                    <div className="bg-slate-900/50 rounded-xl p-3 space-y-1.5 border border-slate-700/50">
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500 uppercase tracking-wider font-bold">Activo</span>
                            <span className="text-white font-bold">{investment.coin}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500 uppercase tracking-wider font-bold">Cantidad</span>
                            <span className="text-slate-300 font-mono">{investment.quantity}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500 uppercase tracking-wider font-bold">Precio Compra</span>
                            <span className="text-sky-400 font-mono">{fmtPrice(investment.buyPrice)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500 uppercase tracking-wider font-bold">Capital Invertido</span>
                            <span className="text-slate-300 font-mono">{fmtUSD(investment.invested)}</span>
                        </div>
                    </div>

                    {/* Sell price input */}
                    <div>
                        <label className="text-[10px] uppercase text-slate-500 font-bold tracking-wider block mb-1.5">
                            Precio de Venta (USD)
                        </label>
                        <input
                            type="number"
                            step="any"
                            min="0"
                            value={sellPrice}
                            onChange={(e) => setSellPrice(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white outline-none focus:ring-2 focus:ring-yellow-500 transition-all text-sm font-mono"
                            autoFocus
                        />
                    </div>

                    {/* Live P&L preview */}
                    {parsedSell > 0 && (
                        <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-700/50 space-y-1.5">
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-500 uppercase tracking-wider font-bold">Valor Venta</span>
                                <span className="text-emerald-300 font-mono font-bold">{fmtUSD(soldValue)}</span>
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

                    {/* Buttons */}
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
                            disabled={saving || parsedSell <= 0}
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

export default ClosePositionModal;
