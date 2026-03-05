import React, { useState, useCallback } from "react";
import { X, Bell, Save, Trash2 } from "lucide-react";
import type { ProcessedInvestment } from "../lib/constants";
import type { InvestmentAlert } from "../hooks/useAlerts";
import { fmtUSD } from "../lib/format";

interface InvestmentAlertModalProps {
    investment: ProcessedInvestment;
    currentAlert?: InvestmentAlert;
    onSave: (id: string, targetPercent: number, isPersistent: boolean) => void;
    onRemove: (id: string) => void;
    onClose: () => void;
}

const InvestmentAlertModal: React.FC<InvestmentAlertModalProps> = ({
    investment,
    currentAlert,
    onSave,
    onRemove,
    onClose,
}) => {
    // If there is an existing alert, pre-fill it. Otherwise start empty.
    const [target, setTarget] = useState(
        currentAlert ? String(currentAlert.targetPercent) : ""
    );
    const [isPersistent, setIsPersistent] = useState(
        currentAlert?.isPersistent ?? false
    );

    const handleSave = useCallback(
        (e: React.FormEvent) => {
            e.preventDefault();
            if (!target) return;
            onSave(investment.id, parseFloat(target), isPersistent);
            onClose();
        },
        [investment.id, target, isPersistent, onSave, onClose]
    );

    return (
        <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm">
                {/* Header */}
                <div className="flex justify-between items-center p-5 border-b border-slate-700 bg-slate-800/80 rounded-t-2xl">
                    <h2 className="font-bold text-yellow-400 text-sm uppercase tracking-widest flex items-center gap-2">
                        <Bell className="w-4 h-4" /> Alerta Individual
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-slate-500 hover:text-white transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Info summary */}
                <div className="bg-slate-900/50 p-4 border-b border-slate-700/50">
                    <p className="text-slate-400 text-xs mb-1">Activo asociado:</p>
                    <p className="font-bold text-white mb-0.5">
                        {investment.coin} <span className="text-slate-500 font-mono italic font-normal ml-1">({investment.quantity} u.)</span>
                    </p>
                    <p className="text-xs text-slate-500">
                        Comprado a <span className="font-mono text-slate-300">{fmtUSD(investment.buyPrice)}</span>
                    </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSave} className="p-5 space-y-5">
                    <div>
                        <label className="text-xs text-slate-400 font-bold block mb-2">
                            Avisarme cuando el PNL Neto alcance:
                        </label>
                        <div className="relative">
                            <input
                                type="number"
                                step="any"
                                placeholder="Ej: 15 o -10"
                                value={target}
                                onChange={(e) => setTarget(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 pr-10 text-white outline-none focus:ring-2 focus:ring-yellow-500 transition-all font-mono"
                                autoFocus
                            />
                            <span className="absolute right-4 top-3.5 text-slate-500 font-bold">%</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
                            Si ingresas un valor positivo (Ej. <span className="text-emerald-400/80">15</span>), el bot te notificará si el ROI sube a <span className="text-emerald-400/80">15% o más</span>.<br />
                            Si ingresas un valor negativo (Ej. <span className="text-red-400/80">-10</span>), el bot te notificará si el ROI baja a <span className="text-red-400/80">-10% o menos</span>.
                        </p>
                    </div>

                    <div className="bg-slate-900 border border-slate-700 rounded-xl p-3">
                        <label className="text-xs text-slate-400 font-bold block mb-3">Comportamiento:</label>
                        <div className="space-y-2">
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${!isPersistent ? 'border-yellow-500 bg-yellow-500/20' : 'border-slate-600 bg-slate-800'}`}>
                                    {!isPersistent && <div className="w-2 h-2 rounded-full bg-yellow-400" />}
                                </div>
                                <input
                                    type="radio"
                                    name="persistence"
                                    className="hidden"
                                    checked={!isPersistent}
                                    onChange={() => setIsPersistent(false)}
                                />
                                <div>
                                    <p className="text-sm font-bold text-slate-200 group-hover:text-yellow-400 transition-colors">Notificar Una Vez</p>
                                    <p className="text-[10px] text-slate-500">La alerta se borra sola tras dispararse.</p>
                                </div>
                            </label>

                            <label className="flex items-center gap-3 cursor-pointer group mt-3">
                                <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${isPersistent ? 'border-yellow-500 bg-yellow-500/20' : 'border-slate-600 bg-slate-800'}`}>
                                    {isPersistent && <div className="w-2 h-2 rounded-full bg-yellow-400" />}
                                </div>
                                <input
                                    type="radio"
                                    name="persistence"
                                    className="hidden"
                                    checked={isPersistent}
                                    onChange={() => setIsPersistent(true)}
                                />
                                <div>
                                    <p className="text-sm font-bold text-slate-200 group-hover:text-yellow-400 transition-colors">Permanente</p>
                                    <p className="text-[10px] text-slate-500">Notificará cada vez que se cumpla la meta.</p>
                                </div>
                            </label>
                        </div>
                    </div>

                    <div className="flex gap-2 pt-2">
                        {currentAlert && (
                            <button
                                type="button"
                                onClick={() => {
                                    onRemove(investment.id);
                                    onClose();
                                }}
                                className="bg-slate-700/50 hover:bg-red-500/20 text-slate-400 hover:text-red-400 p-3 rounded-xl transition-colors border border-transparent hover:border-red-500/30"
                                title="Borrar Alerta"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold py-3 rounded-xl transition-colors text-xs uppercase tracking-widest"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={!target}
                            className="flex-1 bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-widest disabled:opacity-50"
                        >
                            <Save className="w-4 h-4" />
                            Guardar
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default InvestmentAlertModal;
