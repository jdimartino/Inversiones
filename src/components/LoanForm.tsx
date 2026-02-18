import React, { useState, useEffect, useCallback } from "react";
import { ShieldAlert } from "lucide-react";
import { AVAILABLE_COINS, RISK_PARAMS } from "../lib/constants";

interface LoanFormProps {
    onSubmit: (
        exchange: string,
        collateralCoin: string,
        collateralQty: number,
        borrowedUSDT: number,
        apy: number
    ) => Promise<void>;
}

const LoanForm: React.FC<LoanFormProps> = React.memo(({ onSubmit }) => {
    const [exchange, setExchange] = useState("Bybit");
    const [collateralCoin, setCollateralCoin] = useState("BTC");
    const [collateralQty, setCollateralQty] = useState("");
    const [borrowedUSDT, setBorrowedUSDT] = useState("");
    const [apy, setApy] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        const params = RISK_PARAMS[exchange];
        if (params) setApy(params.apy.toString());
    }, [exchange]);

    const handleSubmit = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            if (!collateralQty || !borrowedUSDT || submitting) return;
            setSubmitting(true);
            try {
                await onSubmit(
                    exchange,
                    collateralCoin,
                    parseFloat(collateralQty),
                    parseFloat(borrowedUSDT),
                    parseFloat(apy) || 0
                );
                setCollateralQty("");
                setBorrowedUSDT("");
            } finally {
                setSubmitting(false);
            }
        },
        [exchange, collateralCoin, collateralQty, borrowedUSDT, apy, submitting, onSubmit]
    );

    return (
        <div className="bg-slate-800/40 p-8 rounded-3xl border border-slate-700 border-dashed">
            <h3 className="text-orange-400 font-bold mb-6 flex gap-2 uppercase text-xs tracking-widest">
                <ShieldAlert className="w-5 h-5" /> Gestión de Deuda (LTV)
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <select
                        value={exchange}
                        onChange={(e) => setExchange(e.target.value)}
                        className="bg-slate-900 border-slate-700 rounded-xl p-4 text-white outline-none"
                    >
                        <option value="Binance">Binance</option>
                        <option value="Bybit">Bybit</option>
                    </select>
                    <input
                        type="number"
                        placeholder="APY % (Anual)"
                        value={apy}
                        onChange={(e) => setApy(e.target.value)}
                        className="bg-slate-900 border-slate-700 rounded-xl p-4 text-white outline-none focus:ring-2 focus:ring-orange-500"
                    />
                </div>
                <select
                    value={collateralCoin}
                    onChange={(e) => setCollateralCoin(e.target.value)}
                    className="w-full bg-slate-900 border-slate-700 rounded-xl p-4 text-white outline-none focus:ring-2 focus:ring-orange-500"
                >
                    {AVAILABLE_COINS.map((c) => (
                        <option key={c} value={c}>
                            {c}
                        </option>
                    ))}
                </select>
                <input
                    type="number"
                    step="any"
                    placeholder="Monto Deuda (USDT)"
                    value={borrowedUSDT}
                    onChange={(e) => setBorrowedUSDT(e.target.value)}
                    className="w-full bg-slate-900 border-slate-700 rounded-xl p-4 text-white outline-none"
                />
                <input
                    type="number"
                    step="any"
                    placeholder="Colateral Cantidad"
                    value={collateralQty}
                    onChange={(e) => setCollateralQty(e.target.value)}
                    className="w-full bg-slate-900 border-slate-700 rounded-xl p-4 text-white outline-none"
                />
                <button
                    disabled={submitting}
                    className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-4 rounded-2xl shadow-lg transition-all active:scale-95 uppercase text-xs tracking-widest disabled:opacity-50"
                >
                    {submitting ? "Guardando..." : "Monitorizar Préstamo"}
                </button>
            </form>
        </div>
    );
});

LoanForm.displayName = "LoanForm";

export default LoanForm;
