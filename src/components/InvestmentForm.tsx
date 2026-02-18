import React, { useState, useCallback } from "react";
import { Plus } from "lucide-react";
import { AVAILABLE_COINS } from "../lib/constants";

interface InvestmentFormProps {
    onSubmit: (coin: string, buyPrice: number, quantity: number) => Promise<void>;
}

const InvestmentForm: React.FC<InvestmentFormProps> = React.memo(
    ({ onSubmit }) => {
        const [coin, setCoin] = useState("BTC");
        const [price, setPrice] = useState("");
        const [qty, setQty] = useState("");
        const [submitting, setSubmitting] = useState(false);

        const handleSubmit = useCallback(
            async (e: React.FormEvent) => {
                e.preventDefault();
                if (!price || !qty || submitting) return;
                setSubmitting(true);
                try {
                    await onSubmit(coin, parseFloat(price), parseFloat(qty));
                    setPrice("");
                    setQty("");
                } finally {
                    setSubmitting(false);
                }
            },
            [coin, price, qty, submitting, onSubmit]
        );

        return (
            <div className="bg-slate-800 p-8 rounded-3xl border border-slate-700 shadow-xl">
                <h3 className="text-yellow-500 font-bold mb-6 flex gap-2 uppercase text-xs tracking-widest">
                    <Plus className="w-5 h-5" /> Registrar Inversión Spot
                </h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <select
                        value={coin}
                        onChange={(e) => setCoin(e.target.value)}
                        className="w-full bg-slate-900 border-slate-700 rounded-xl p-4 text-white outline-none focus:ring-2 focus:ring-yellow-500 transition-all"
                    >
                        {AVAILABLE_COINS.map((c) => (
                            <option key={c} value={c}>
                                {c}
                            </option>
                        ))}
                    </select>
                    <div className="grid grid-cols-2 gap-4">
                        <input
                            type="number"
                            step="any"
                            placeholder="Precio Compra"
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            className="bg-slate-900 border-slate-700 rounded-xl p-4 text-white outline-none focus:ring-2 focus:ring-yellow-500"
                        />
                        <input
                            type="number"
                            step="any"
                            placeholder="Cantidad"
                            value={qty}
                            onChange={(e) => setQty(e.target.value)}
                            className="bg-slate-900 border-slate-700 rounded-xl p-4 text-white outline-none focus:ring-2 focus:ring-yellow-500"
                        />
                    </div>
                    <button
                        disabled={submitting}
                        className="w-full bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-4 rounded-2xl shadow-lg active:scale-95 transition-all uppercase text-xs tracking-widest disabled:opacity-50"
                    >
                        {submitting ? "Guardando..." : "Añadir al Portafolio"}
                    </button>
                </form>
            </div>
        );
    }
);

InvestmentForm.displayName = "InvestmentForm";

export default InvestmentForm;
