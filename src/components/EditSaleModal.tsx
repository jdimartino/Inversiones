import React, { useState, useCallback } from "react";
import { X, Save } from "lucide-react";
import { AVAILABLE_COINS } from "../lib/constants";
import type { SaleRecord } from "../lib/constants";

interface EditSaleModalProps {
    sale: SaleRecord;
    onSave: (id: string, coin: string, quantity: number, sellPrice: number, usdtReceived: number) => Promise<void>;
    onClose: () => void;
}

const EditSaleModal: React.FC<EditSaleModalProps> = ({ sale, onSave, onClose }) => {
    const [coin, setCoin] = useState(sale.coin);
    const [quantity, setQuantity] = useState(String(sale.quantity));
    const [sellPrice, setSellPrice] = useState(String(sale.sellPrice));
    const [usdtReceived, setUsdtReceived] = useState(String(sale.usdtReceived));
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState("");

    const handleSave = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            if (!quantity || !sellPrice || !usdtReceived || saving) return;
            setSaving(true);
            try {
                setSaveError("");
                await onSave(sale.id, coin, parseFloat(quantity), parseFloat(sellPrice), parseFloat(usdtReceived));
                onClose();
            } catch {
                setSaveError("Error al guardar. Intenta de nuevo.");
            } finally {
                setSaving(false);
            }
        },
        [sale.id, coin, quantity, sellPrice, usdtReceived, saving, onSave, onClose]
    );

    return (
        <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm">
                <div className="flex justify-between items-center p-5 border-b border-slate-700">
                    <h2 className="font-bold text-emerald-400 text-sm uppercase tracking-widest">
                        ✏️ Modificar Venta
                    </h2>
                    <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSave} className="p-5 space-y-4">
                    <div>
                        <label className="text-[10px] uppercase text-slate-500 font-bold tracking-wider block mb-1.5">Moneda</label>
                        <select
                            value={coin}
                            onChange={(e) => setCoin(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
                        >
                            {AVAILABLE_COINS.map((c) => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="text-[10px] uppercase text-slate-500 font-bold tracking-wider block mb-1.5">Cantidad Vendida</label>
                        <input
                            type="number"
                            step="any"
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm font-mono"
                        />
                    </div>

                    <div>
                        <label className="text-[10px] uppercase text-slate-500 font-bold tracking-wider block mb-1.5">Precio de Venta (USD)</label>
                        <input
                            type="number"
                            step="any"
                            value={sellPrice}
                            onChange={(e) => setSellPrice(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm font-mono"
                        />
                    </div>

                    <div>
                        <label className="text-[10px] uppercase text-slate-500 font-bold tracking-wider block mb-1.5">USDT Recibido</label>
                        <input
                            type="number"
                            step="any"
                            value={usdtReceived}
                            onChange={(e) => setUsdtReceived(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm font-mono"
                        />
                    </div>

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
                            disabled={saving}
                            className="flex-1 bg-emerald-700 hover:bg-emerald-600 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-widest disabled:opacity-50"
                        >
                            <Save className="w-3.5 h-3.5" />
                            {saving ? "Guardando..." : "Guardar"}
                        </button>
                    </div>
                    {saveError && (
                        <p className="text-red-400 text-[10px] text-center mt-1">{saveError}</p>
                    )}
                </form>
            </div>
        </div>
    );
};

export default EditSaleModal;
