import React, { useState, useCallback } from "react";
import { X, Save } from "lucide-react";
import { AVAILABLE_COINS } from "../lib/constants";
import type { ProcessedInvestment } from "../lib/constants";

interface EditInvestmentModalProps {
    investment: ProcessedInvestment;
    onSave: (id: string, coin: string, buyPrice: number, quantity: number) => Promise<void>;
    onClose: () => void;
}

const EditInvestmentModal: React.FC<EditInvestmentModalProps> = ({
    investment,
    onSave,
    onClose,
}) => {
    const [coin, setCoin] = useState(investment.coin);
    const [price, setPrice] = useState(String(investment.buyPrice));
    const [qty, setQty] = useState(String(investment.quantity));
    const [saving, setSaving] = useState(false);

    const handleSave = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            if (!price || !qty || saving) return;
            setSaving(true);
            try {
                await onSave(investment.id, coin, parseFloat(price), parseFloat(qty));
                onClose();
            } finally {
                setSaving(false);
            }
        },
        [investment.id, coin, price, qty, saving, onSave, onClose]
    );

    return (
        <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm">
                {/* Header */}
                <div className="flex justify-between items-center p-5 border-b border-slate-700">
                    <h2 className="font-bold text-yellow-400 text-sm uppercase tracking-widest">
                        ✏️ Modificar Inversión
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-slate-500 hover:text-white transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSave} className="p-5 space-y-4">
                    <div>
                        <label className="text-[10px] uppercase text-slate-500 font-bold tracking-wider block mb-1.5">
                            Moneda
                        </label>
                        <select
                            value={coin}
                            onChange={(e) => setCoin(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white outline-none focus:ring-2 focus:ring-yellow-500 transition-all text-sm"
                        >
                            {AVAILABLE_COINS.map((c) => (
                                <option key={c} value={c}>
                                    {c}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="text-[10px] uppercase text-slate-500 font-bold tracking-wider block mb-1.5">
                            Precio de Compra (USD)
                        </label>
                        <input
                            type="number"
                            step="any"
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white outline-none focus:ring-2 focus:ring-yellow-500 transition-all text-sm font-mono"
                        />
                    </div>

                    <div>
                        <label className="text-[10px] uppercase text-slate-500 font-bold tracking-wider block mb-1.5">
                            Cantidad
                        </label>
                        <input
                            type="number"
                            step="any"
                            value={qty}
                            onChange={(e) => setQty(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white outline-none focus:ring-2 focus:ring-yellow-500 transition-all text-sm font-mono"
                        />
                    </div>

                    {/* Preview invested */}
                    {price && qty && (
                        <p className="text-xs text-slate-500 text-right">
                            Capital:{" "}
                            <span className="text-yellow-400 font-bold font-mono">
                                ${(parseFloat(price) * parseFloat(qty)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </p>
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
                            disabled={saving}
                            className="flex-1 bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-widest disabled:opacity-50"
                        >
                            <Save className="w-3.5 h-3.5" />
                            {saving ? "Guardando..." : "Guardar"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default EditInvestmentModal;
