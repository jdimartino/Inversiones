import React, { useState, useEffect } from "react";
import { X, Bell, Trash2, Edit2, Plus, Repeat, Clock, Check } from "lucide-react";
import { ProcessedInvestment } from "../lib/constants";
import { InvestmentAlert } from "../hooks/useAlerts";
import { fmtPrice } from "../lib/format";

interface InvestmentAlertModalProps {
    investment: ProcessedInvestment;
    currentAlerts: InvestmentAlert[];
    onSaveAlerts: (id: string, alerts: InvestmentAlert[]) => Promise<void>;
    onClose: () => void;
    initialEditIndex?: number | null;
}

export default function InvestmentAlertModal({
    investment,
    currentAlerts,
    onSaveAlerts,
    onClose,
    initialEditIndex,
}: InvestmentAlertModalProps) {
    const [draftAlerts, setDraftAlerts] = useState<InvestmentAlert[]>(currentAlerts);
    const [alertType, setAlertType] = useState<'pnl' | 'price'>('pnl');
    const [targetPercent, setTargetPercent] = useState<number>(0);
    const [targetValue, setTargetValue] = useState<number>(investment.currentPrice);
    const [isPersistent, setIsPersistent] = useState(false);
    const [direction, setDirection] = useState<'up' | 'down'>('up');
    const [saving, setSaving] = useState(false);

    // If an initial index is provided, immediately load it into the form for editing
    useEffect(() => {
        if (initialEditIndex !== undefined && initialEditIndex !== null && currentAlerts[initialEditIndex]) {
            const alertToEdit = currentAlerts[initialEditIndex];
            setAlertType(alertToEdit.type || 'pnl');
            setTargetPercent(alertToEdit.targetPercent || 0);
            setTargetValue(alertToEdit.targetValue || investment.currentPrice);
            setIsPersistent(alertToEdit.isPersistent ?? false);
            setDirection(alertToEdit.direction ?? 'up');
            // Remove it from draft alerts immediately
            setDraftAlerts(currentAlerts.filter((_, i) => i !== initialEditIndex));
        }
    }, [initialEditIndex, currentAlerts, investment.currentPrice]);

    // ESC key closes the modal without saving (Cancel)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    const handleTargetChange = (val: number) => {
        if (alertType === 'pnl') {
            setTargetPercent(val);
            if (val >= 0) setDirection('up');
            else setDirection('down');
        } else {
            setTargetValue(val);
            if (val >= investment.currentPrice) setDirection('up');
            else setDirection('down');
        }
    };

    const handleAdd = () => {
        if (alertType === 'pnl' && isNaN(targetPercent)) return;
        if (alertType === 'price' && (isNaN(targetValue) || targetValue <= 0)) return;

        setDraftAlerts([...draftAlerts, { 
            type: alertType, 
            targetPercent: alertType === 'pnl' ? targetPercent : 0, 
            targetValue: alertType === 'price' ? targetValue : undefined,
            isPersistent, 
            direction 
        }]);
        // Reset form to defaults
        setTargetPercent(0);
        setTargetValue(investment.currentPrice);
        setIsPersistent(false);
        setDirection('up');
    };

    const handleEdit = (index: number) => {
        const alertToEdit = draftAlerts[index];
        setAlertType(alertToEdit.type || 'pnl');
        setTargetPercent(alertToEdit.targetPercent || 0);
        setTargetValue(alertToEdit.targetValue || investment.currentPrice);
        setIsPersistent(alertToEdit.isPersistent ?? false);
        setDirection(alertToEdit.direction ?? 'up');
        handleRemove(index);
    };

    const handleRemove = (index: number) => {
        setDraftAlerts(draftAlerts.filter((_, i) => i !== index));
    };

    const handleSave = async () => {
        setSaving(true);
        await onSaveAlerts(investment.id, draftAlerts);
        setSaving(false);
        onClose();
    };

    // PNL Calculations for Header
    const pnlAmount = investment.currentValue - investment.invested;
    const isPositive = investment.roi >= 0;
    const pnlColorClass = isPositive ? "text-green-400" : "text-red-400";
    const pnlBgClass = isPositive ? "bg-green-500/10 border-green-500/20" : "bg-red-500/10 border-red-500/20";

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">

                {/* Header */}
                <div className="flex justify-between items-center p-5 border-b border-slate-800">
                    <div className="flex items-center gap-3">
                        <Bell className="w-5 h-5 text-yellow-400 mt-1 self-start" />
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <h2 className="text-lg font-bold text-white">{investment.coin}</h2>
                                <span className="text-yellow-300 font-mono text-xs font-bold bg-yellow-500/10 px-2 py-0.5 rounded border border-yellow-500/20">
                                    {fmtPrice(investment.currentPrice)}
                                </span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${pnlBgClass} ${pnlColorClass}`}>
                                    {isPositive ? "+" : ""}{investment.roi.toFixed(2)}%
                                </span>
                            </div>
                            <p className="text-xs text-slate-400 flex items-center gap-2">
                                <span>Alertas de {alertType === 'pnl' ? 'PNL' : 'Precio'}</span>
                                <span className="text-slate-600">•</span>
                                <span className={`font-medium ${pnlColorClass}`}>
                                    PNL: {isPositive ? "+" : "-"}${Math.abs(pnlAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Active alerts list */}
                <div className="p-5">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                        Alertas Activas ({draftAlerts.length})
                    </h3>

                    {draftAlerts.length === 0 ? (
                        <p className="text-xs text-slate-600 italic text-center py-4 bg-slate-800/50 rounded-xl border border-slate-800">
                            No hay alertas configuradas aún
                        </p>
                    ) : (
                        <div className="space-y-2 mb-4">
                            {draftAlerts.map((alert, index) => (
                                <div key={index} className="flex items-center justify-between bg-slate-800 border border-slate-700 rounded-xl px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <div className="flex flex-col">
                                            <span className={`flex items-center gap-1 text-base font-bold ${alert.type === 'price' ? 'text-yellow-400' : (alert.targetPercent >= 0 ? "text-green-400" : "text-red-400")}`}>
                                                {alert.direction === 'up' ? '🔼' : '🔽'}
                                                {alert.type === 'price' ? fmtPrice(alert.targetValue || 0) : `${alert.targetPercent >= 0 ? "+" : ""}${alert.targetPercent}%`}
                                            </span>
                                            <span className="text-[9px] text-slate-500 uppercase font-black tracking-tighter">
                                                {alert.type === 'price' ? 'Alerta de Precio' : 'Alerta de ROI'}
                                            </span>
                                        </div>
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
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => handleEdit(index)}
                                            className="text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 transition-colors p-1.5 rounded-lg"
                                            title="Editar alerta"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleRemove(index)}
                                            className="text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors p-1.5 rounded-lg"
                                            title="Eliminar alerta"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Add new alert form */}
                    <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 mt-4">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <Plus className="w-3.5 h-3.5" /> Nueva Alerta
                        </h3>

                        {/* Alert Type Toggle */}
                        <div className="flex p-1 bg-slate-900 rounded-xl mb-4 border border-slate-700/50">
                            <button
                                onClick={() => setAlertType('pnl')}
                                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${alertType === 'pnl' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                ROI (%)
                            </button>
                            <button
                                onClick={() => setAlertType('price')}
                                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${alertType === 'price' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                Precio ($)
                            </button>
                        </div>

                        {/* Target input */}
                        <div className="mb-4">
                            <label className="block text-xs text-slate-400 mb-2 uppercase tracking-wider">
                                {alertType === 'pnl' ? '% de ROI Objetivo' : `Precio Objetivo (${investment.coin})`}
                            </label>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => handleTargetChange(alertType === 'pnl' ? targetPercent - 1 : targetValue * 0.99)}
                                    className="flex items-center justify-center w-12 h-12 bg-slate-900 border border-slate-700 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors active:scale-95"
                                >
                                    <span className="text-2xl font-bold">-</span>
                                </button>
                                <div className="relative flex-1">
                                    <input
                                        type="number"
                                        step={alertType === 'price' ? "0.0001" : "1"}
                                        value={alertType === 'pnl' ? targetPercent : targetValue}
                                        onChange={(e) => handleTargetChange(Number(e.target.value))}
                                        className="w-full h-12 bg-slate-900 border border-slate-700 rounded-xl px-3 pr-8 text-lg font-bold text-center text-white outline-none focus:ring-2 focus:ring-yellow-400"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-bold">
                                        {alertType === 'pnl' ? '%' : '$'}
                                    </span>
                                </div>
                                <button
                                    onClick={() => handleTargetChange(alertType === 'pnl' ? targetPercent + 1 : targetValue * 1.01)}
                                    className="flex items-center justify-center w-12 h-12 bg-slate-900 border border-slate-700 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors active:scale-95"
                                >
                                    <span className="text-2xl font-bold">+</span>
                                </button>
                            </div>

                            {/* Direction selection */}
                            <div className="grid grid-cols-2 gap-3 mt-4">
                                <button
                                    onClick={() => setDirection('up')}
                                    className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold border transition-all ${direction === 'up'
                                        ? "bg-green-500/20 text-green-400 border-green-500/50"
                                        : "bg-slate-900 text-slate-400 border-slate-700 hover:border-slate-600"
                                        }`}
                                >
                                    🔼 Subida a...
                                </button>
                                <button
                                    onClick={() => setDirection('down')}
                                    className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold border transition-all ${direction === 'down'
                                        ? "bg-red-500/20 text-red-400 border-red-500/50"
                                        : "bg-slate-900 text-slate-400 border-slate-700 hover:border-slate-600"
                                        }`}
                                >
                                    🔽 Bajada a...
                                </button>
                            </div>

                            <p className={`text-center text-sm font-bold mt-3 ${alertType === 'price' ? 'text-yellow-400' : (targetPercent >= 0 ? "text-green-400" : "text-red-400")}`}>
                                Notificar cuando {alertType === 'price' ? 'el precio' : 'ROI'} {direction === 'up' ? "suba a" : "caiga a"} {alertType === 'price' ? fmtPrice(targetValue) : `${targetPercent >= 0 ? "+" : ""}${targetPercent}%`}
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
                            className="w-full flex items-center justify-center gap-2 bg-yellow-500 text-slate-900 font-bold py-2.5 rounded-xl hover:bg-yellow-400 transition-all shadow-lg shadow-yellow-500/20 active:scale-95 disabled:opacity-50 text-sm"
                        >
                            <Plus className="w-4 h-4" />
                            Agregar Alerta
                        </button>
                    </div>

                    {/* Botones de acción principales */}
                    <div className="flex items-center gap-3 mt-6 pt-5 border-t border-slate-800">
                        <button
                            onClick={onClose}
                            className="flex-1 py-3 rounded-xl font-bold bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 hover:text-white transition-all text-sm uppercase tracking-widest"
                        >
                            Cancelar (ESC)
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold bg-green-500 text-slate-900 hover:bg-green-400 transition-all shadow-lg shadow-green-500/20 active:scale-95 disabled:opacity-50 text-sm uppercase tracking-widest"
                        >
                            <Check className="w-4 h-4 shrink-0" />
                            {saving ? "Guardando..." : "Aceptar"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
