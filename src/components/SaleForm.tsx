import React, { useState, useCallback } from "react";
import { TrendingDown } from "lucide-react";
import { AVAILABLE_COINS } from "../lib/constants";

interface SaleFormProps {
    onSubmit: (coin: string, quantity: number, sellPrice: number, usdtReceived: number) => Promise<void>;
}

const SaleForm: React.FC<SaleFormProps> = React.memo(({ onSubmit }) => {
    const [coin, setCoin] = useState("BTC");
    const [quantity, setQuantity] = useState("");
    const [sellPrice, setSellPrice] = useState("");
    const [usdtReceived, setUsdtReceived] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            if (!quantity || !sellPrice || !usdtReceived || submitting) return;
            setSubmitting(true);
            try {
                await onSubmit(
                    coin,
                    parseFloat(quantity),
                    parseFloat(sellPrice),
                    parseFloat(usdtReceived)
                );
                setQuantity("");
                setSellPrice("");
                setUsdtReceived("");
            } finally {
                setSubmitting(false);
            }
        },
        [coin, quantity, sellPrice, usdtReceived, submitting, onSubmit]
    );

    return (
        <div className="bg-slate-800 p-8 rounded-3xl border border-slate-700 shadow-xl">
            <h3 className="text-emerald-400 font-bold mb-6 flex gap-2 uppercase text-xs tracking-widest">
                <TrendingDown className="w-5 h-5" /> Registrar Venta
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
                <select
                    value={coin}
                    onChange={(e) => setCoin(e.target.value)}
                    className="w-full bg-slate-900 border-slate-700 rounded-xl p-4 text-white outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
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
                        placeholder="Cantidad Vendida"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        className="bg-slate-900 border-slate-700 rounded-xl p-4 text-white outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <input
                        type="number"
                        step="any"
                        placeholder="Precio de Venta"
                        value={sellPrice}
                        onChange={(e) => setSellPrice(e.target.value)}
                        className="bg-slate-900 border-slate-700 rounded-xl p-4 text-white outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                </div>
                <input
                    type="number"
                    step="any"
                    placeholder="USDT Recibido"
                    value={usdtReceived}
                    onChange={(e) => setUsdtReceived(e.target.value)}
                    className="w-full bg-slate-900 border-slate-700 rounded-xl p-4 text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                    disabled={submitting}
                    className="w-full bg-emerald-700 hover:bg-emerald-600 text-white font-bold py-4 rounded-2xl shadow-lg active:scale-95 transition-all uppercase text-xs tracking-widest disabled:opacity-50"
                >
                    {submitting ? "Guardando..." : "Registrar Venta"}
                </button>
            </form>
        </div>
    );
});

SaleForm.displayName = "SaleForm";

export default SaleForm;
