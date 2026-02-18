import React, { useState, useCallback } from "react";
import { Edit, X, Save } from "lucide-react";
import type { Loan } from "../lib/constants";

interface EditLoanModalProps {
    loan: Loan;
    onSave: (
        id: string,
        updates: { collateralQty: number; borrowedUSDT: number; apy: number }
    ) => Promise<void>;
    onClose: () => void;
}

const EditLoanModal: React.FC<EditLoanModalProps> = React.memo(
    ({ loan, onSave, onClose }) => {
        const [borrowedUSDT, setBorrowedUSDT] = useState(loan.borrowedUSDT);
        const [collateralQty, setCollateralQty] = useState(loan.collateralQty);
        const [apy, setApy] = useState(loan.apy);
        const [saving, setSaving] = useState(false);

        const handleSubmit = useCallback(
            async (e: React.FormEvent) => {
                e.preventDefault();
                if (saving) return;
                setSaving(true);
                try {
                    await onSave(loan.id, { collateralQty, borrowedUSDT, apy });
                    onClose();
                } catch (err) {
                    console.error("Error updating loan:", err);
                } finally {
                    setSaving(false);
                }
            },
            [loan.id, collateralQty, borrowedUSDT, apy, saving, onSave, onClose]
        );

        return (
            <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[200] p-4">
                <div className="bg-slate-800 w-full max-w-md rounded-3xl border border-slate-600 p-8 shadow-2xl">
                    <div className="flex justify-between items-center mb-8">
                        <h3 className="text-xl font-bold text-white flex items-center gap-2 tracking-tight">
                            <Edit className="w-5 h-5 text-blue-500" /> Modificar Datos
                        </h3>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-slate-700 rounded-full transition-colors"
                        >
                            <X className="text-slate-500 hover:text-white" />
                        </button>
                    </div>
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="text-[10px] text-slate-500 font-bold uppercase mb-1 block">
                                Deuda (USDT)
                            </label>
                            <input
                                type="number"
                                step="any"
                                value={borrowedUSDT}
                                onChange={(e) =>
                                    setBorrowedUSDT(parseFloat(e.target.value) || 0)
                                }
                                className="w-full bg-slate-900 border-slate-700 rounded-xl p-4 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-slate-500 font-bold uppercase mb-1 block">
                                Colateral ({loan.collateralCoin})
                            </label>
                            <input
                                type="number"
                                step="any"
                                value={collateralQty}
                                onChange={(e) =>
                                    setCollateralQty(parseFloat(e.target.value) || 0)
                                }
                                className="w-full bg-slate-900 border-slate-700 rounded-xl p-4 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-slate-500 font-bold uppercase mb-1 block">
                                APY %
                            </label>
                            <input
                                type="number"
                                step="any"
                                value={apy}
                                onChange={(e) => setApy(parseFloat(e.target.value) || 0)}
                                className="w-full bg-slate-900 border-slate-700 rounded-xl p-4 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            />
                        </div>
                        <button
                            disabled={saving}
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl flex justify-center gap-2 shadow-lg transition-all active:scale-95 uppercase text-xs tracking-widest mt-4 disabled:opacity-50"
                        >
                            <Save className="w-4 h-4" />
                            {saving ? "Guardando..." : "Guardar Cambios"}
                        </button>
                    </form>
                </div>
            </div>
        );
    }
);

EditLoanModal.displayName = "EditLoanModal";

export default EditLoanModal;
