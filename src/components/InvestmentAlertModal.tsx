import React, { useState } from "react";
import { X, Bell, Trash2, Plus, Repeat, Clock } from "lucide-react";
import { ProcessedInvestment } from "../lib/constants";
import { InvestmentAlert } from "../hooks/useAlerts";

interface InvestmentAlertModalProps {
    investment: ProcessedInvestment;
    currentAlerts: InvestmentAlert[];
    onAddAlert: (id: string, targetPercent: number, isPersistent: boolean) => Promise<void>;
    onRemoveAlert: (id: string, index: number) => Promise<void>;
    onClose: () => void;
}

export default function InvestmentAlertModal({
    investment,
    currentAlerts,
    onAddAlert,
    onRemoveAlert,
    onClose,
}: InvestmentAlertModalProps) {
    const [targetPercent, setTargetPercent] = useState<number>(10);
    const [isPersistent, setIsPersistent] = useState(false);
    const [saving, setSaving] = useState(false);
    const [removing, setRemoving] = useState<number | null>(null);

    const handleAdd = async () => {
        if (isNaN(targetPercent)) return;
        setSaving(true);
        await onAddAlert(investment.id, targetPercent, isPersistent);
        setSaving(false);
        // Reset form
        setTargetPercent(10);
        setIsPersistent(false);
    };

    const handleRemove = async (index: number) => {
        setRemoving(index);
        await onRemoveAlert(investment.id, index);
        setRemoving(null);
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">

                {/* Header */}
                <div className="flex justify-between items-center p-5 border-b border-slate-800">
                    <div className="flex items-center gap-3">
                        <Bell className="w-5 h-5 text-yellow-400" />
                        <div>
                            <h2 className="text-lg font-bold text-white">{investment.coin}</h2>
                            <p className="text-xs text-slate-400">Alertas de PNL</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Active alerts list */}
                <div className="p-5">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                        Alertas Activas ({currentAlerts.length})
                    </h3>

                    {currentAlerts.length === 0 ? (
                        <p className="text-xs text-slate-600 italic text-center py-4 bg-slate-800/50 rounded-xl border border-slate-800">
                            No hay alertas configuradas aún
                        </p>
                    ) : (
                        <div className="space-y-2 mb-4">
                            {currentAlerts.map((alert, index) => (
                                <div key={index} className="flex items-center justify-between bg-slate-800 border border-slate-700 rounded-xl px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <span className={`text-base font-bold ${alert.targetPercent >= 0 ? "text-green-400" : "text-red-400"}`}>
                                            {alert.targetPercent >= 0 ? "+" : ""}{alert.targetPercent}%
                                        </span>
                                        {alert.isPersistent ? (
                                            <span className="flex items-center gap-1 text-[10px] bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-2 py-0.5 rounded-full font-bold">
                                                <Repeat className="w-3 h-3" /> Permanente
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-1 text-[10px] bg-slate-700 text-slate-400 border border-slate-600 px-2 py-0.5 rounded-full font-bold">
                                                <Clock className="w-3 h-3" /> Una Vez
                                            </span>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => handleRemove(index)}
                                        disabled={removing === index}
                                        className="text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors p-1.5 rounded-lg disabled:opacity-40"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Add new alert form */}
                    <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 mt-4">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <Plus className="w-3.5 h-3.5" /> Nueva Alerta
                        </h3>

                        {/* Target % input */}
                        <div className="mb-4">
                            <label className="block text-xs text-slate-400 mb-2 uppercase tracking-wider">
                                % de ROI Objetivo
                            </label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="range"
                                    min={-80}
                                    max={200}
                                    step={1}
                                    value={targetPercent}
                                    onChange={(e) => setTargetPercent(Number(e.target.value))}
                                    className="flex-1 accent-yellow-400"
                                />
                                <div className="relative w-24">
                                    <input
                                        type="number"
                                        value={targetPercent}
                                        onChange={(e) => setTargetPercent(Number(e.target.value))}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-xl py-2 px-3 pr-6 text-sm font-bold text-center text-white outline-none focus:ring-2 focus:ring-yellow-400"
                                    />
                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold">%</span>
                                </div>
                            </div>
                            <p className={`text-center text-sm font-bold mt-2 ${targetPercent >= 0 ? "text-green-400" : "text-red-400"}`}>
                                Notificar cuando ROI {targetPercent >= 0 ? "alcance" : "caiga a"} {targetPercent >= 0 ? "+" : ""}{targetPercent}%
                            </p>
                        </div>

                        {/* Persistence selection */}
                        <div className="grid grid-cols-2 gap-3 mb-4">
                            <button
                                onClick={() => setIsPersistent(false)}
                                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold border transition-all ${!isPersistent
                                        ? "bg-yellow-500 text-slate-900 border-yellow-500 shadow-lg shadow-yellow-500/20"
                                        : "bg-slate-900 text-slate-400 border-slate-700 hover:border-slate-600"
                                    }`}
                            >
                                <Clock className="w-3.5 h-3.5" /> Notificar Una Vez
                            </button>
                            <button
                                onClick={() => setIsPersistent(true)}
                                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold border transition-all ${isPersistent
                                        ? "bg-yellow-500 text-slate-900 border-yellow-500 shadow-lg shadow-yellow-500/20"
                                        : "bg-slate-900 text-slate-400 border-slate-700 hover:border-slate-600"
                                    }`}
                            >
                                <Repeat className="w-3.5 h-3.5" /> Permanente
                            </button>
                        </div>

                        <button
                            onClick={handleAdd}
                            disabled={saving}
                            className="w-full flex items-center justify-center gap-2 bg-yellow-500 text-slate-900 font-bold py-2.5 rounded-xl hover:bg-yellow-400 transition-all shadow-lg shadow-yellow-500/20 active:scale-95 disabled:opacity-50 text-sm"
                        >
                            <Plus className="w-4 h-4" />
                            {saving ? "Guardando..." : "Agregar Alerta"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
