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
    const [note, setNote] = useState<string>("");
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
            setNote(alertToEdit.note ?? "");
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
            direction,
            ...(note.trim() ? { note: note.trim() } : {}),
        }]);
        // Reset form to defaults
        setTargetPercent(0);
        setTargetValue(investment.currentPrice);
        setIsPersistent(false);
        setDirection('up');
        setNote("");
    };

    const handleEdit = (index: number) => {
        const alertToEdit = draftAlerts[index];
        setAlertType(alertToEdit.type || 'pnl');
        setTargetPercent(alertToEdit.targetPercent || 0);
        setTargetValue(alertToEdit.targetValue || investment.currentPrice);
        setIsPersistent(alertToEdit.isPersistent ?? false);
        setDirection(alertToEdit.direction ?? 'up');
        setNote(alertToEdit.note ?? "");
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
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto">

                {/* Header - compact */}
                <div className="flex justify-between items-center px-4 py-3 border-b border-slate-800 sticky top-0 bg-slate-900/95 backdrop-blur-sm z-10">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <Bell className="w-4 h-4 text-yellow-400 shrink-0" />
                        <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <h2 className="text-base font-bold text-white">{investment.coin}</h2>
                                <span className="text-yellow-300 font-mono text-[11px] font-bold bg-yellow-500/10 px-1.5 py-0.5 rounded border border-yellow-500/20">
                                    {fmtPrice(investment.currentPrice)}
                                </span>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${pnlBgClass} ${pnlColorClass}`}>
                                    {isPositive ? "+" : ""}{investment.roi.toFixed(2)}%
                                </span>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                                Alertas de PNL{" "}
                                <span className="text-slate-600">·</span>{" "}
                                <span className={`font-medium ${pnlColorClass}`}>
                                    PNL: {isPositive ? "+" : "-"}${Math.abs(pnlAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-slate-800 shrink-0 -mr-1">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="px-4 py-3 space-y-3">
                    {/* Active alerts list */}
                    <div>
                        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                            Alertas Activas ({draftAlerts.length})
                        </h3>

                        {draftAlerts.length === 0 ? (
                            <p className="text-[11px] text-slate-600 italic text-center py-3 bg-slate-800/50 rounded-lg border border-slate-800">
                                No hay alertas configuradas aún
                            </p>
                        ) : (
                            <div className="space-y-1.5">
                                {draftAlerts.map((alert, index) => (
                                    <div key={index} className="flex items-center justify-between bg-slate-800 border border-slate-700 rounded-lg px-3 py-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <div className="flex flex-col min-w-0">
                                                <span className={`flex items-center gap-1 text-sm font-bold ${alert.type === 'price' ? 'text-yellow-400' : (alert.targetPercent >= 0 ? "text-green-400" : "text-red-400")}`}>
                                                    {alert.direction === 'up' ? '🔼' : '🔽'}
                                                    {alert.type === 'price' ? fmtPrice(alert.targetValue || 0) : `${alert.targetPercent >= 0 ? "+" : ""}${alert.targetPercent}%`}
                                                </span>
                                                <span className="text-[9px] text-slate-500 uppercase font-bold tracking-tight">
                                                    {alert.type === 'price' ? 'Precio' : 'ROI'}
                                                </span>
                                                {alert.note && (
                                                    <span className="text-[10px] text-slate-400 italic mt-0.5">📝 {alert.note}</span>
                                                )}
                                            </div>
                                            {alert.isPersistent ? (
                                                <span className="flex items-center gap-1 text-[9px] bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap">
                                                    <Repeat className="w-2.5 h-2.5" /> Permanente
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-1 text-[9px] bg-slate-700 text-slate-400 border border-slate-600 px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap">
                                                    <Clock className="w-2.5 h-2.5" /> Una Vez
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center shrink-0">
                                            <button
                                                onClick={() => handleEdit(index)}
                                                className="text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 transition-colors p-1.5 rounded-lg"
                                                title="Editar alerta"
                                            >
                                                <Edit2 className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={() => handleRemove(index)}
                                                className="text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors p-1.5 rounded-lg"
                                                title="Eliminar alerta"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Add new alert form */}
                    <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3">
                        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                            <Plus className="w-3 h-3" /> Nueva Alerta
                        </h3>

                        {/* Alert Type Toggle */}
                        <div className="flex p-0.5 bg-slate-900 rounded-lg mb-3 border border-slate-700/50">
                            <button
                                onClick={() => setAlertType('pnl')}
                                className={`flex-1 py-1.5 text-[11px] font-bold rounded-md transition-all ${alertType === 'pnl' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                ROI (%)
                            </button>
                            <button
                                onClick={() => setAlertType('price')}
                                className={`flex-1 py-1.5 text-[11px] font-bold rounded-md transition-all ${alertType === 'price' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                Precio ($)
                            </button>
                        </div>

                        {/* Target input */}
                        <label className="block text-[10px] text-slate-500 mb-1.5 uppercase tracking-wider font-bold">
                            {alertType === 'pnl' ? '% de ROI Objetivo' : `Precio Objetivo (${investment.coin})`}
                        </label>
                        <div className="flex items-center gap-2 mb-3">
                            <button
                                onClick={() => handleTargetChange(alertType === 'pnl' ? targetPercent - 1 : targetValue * 0.99)}
                                className="flex items-center justify-center w-10 h-10 bg-slate-900 border border-slate-700 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors active:scale-95 shrink-0"
                            >
                                <span className="text-xl font-bold leading-none">−</span>
                            </button>
                            <div className="relative flex-1 min-w-0">
                                <input
                                    type="number"
                                    step={alertType === 'price' ? "0.0001" : "1"}
                                    value={alertType === 'pnl' ? targetPercent : targetValue}
                                    onChange={(e) => handleTargetChange(Number(e.target.value))}
                                    className="w-full h-10 bg-slate-900 border border-slate-700 rounded-lg px-2 pr-7 text-base font-bold text-center text-white outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400/50"
                                />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">
                                    {alertType === 'pnl' ? '%' : '$'}
                                </span>
                            </div>
                            <button
                                onClick={() => handleTargetChange(alertType === 'pnl' ? targetPercent + 1 : targetValue * 1.01)}
                                className="flex items-center justify-center w-10 h-10 bg-slate-900 border border-slate-700 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors active:scale-95 shrink-0"
                            >
                                <span className="text-xl font-bold leading-none">+</span>
                            </button>
                        </div>

                        {/* Direction + Persistence in a compact 2x2 grid */}
                        <div className="grid grid-cols-2 gap-2 mb-2">
                            <button
                                onClick={() => setDirection('up')}
                                className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-bold border transition-all ${direction === 'up'
                                    ? "bg-green-500/20 text-green-400 border-green-500/50"
                                    : "bg-slate-900 text-slate-500 border-slate-700 hover:border-slate-600"
                                    }`}
                            >
                                <span>🔼</span> Sube a
                            </button>
                            <button
                                onClick={() => setDirection('down')}
                                className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-bold border transition-all ${direction === 'down'
                                    ? "bg-red-500/20 text-red-400 border-red-500/50"
                                    : "bg-slate-900 text-slate-500 border-slate-700 hover:border-slate-600"
                                    }`}
                            >
                                <span>🔽</span> Baja a
                            </button>
                        </div>

                        {(() => {
                            const isAlreadyTriggered = alertType === 'pnl'
                                ? (direction === 'up' && investment.roi >= targetPercent) || (direction === 'down' && investment.roi <= targetPercent)
                                : (direction === 'up' && investment.currentPrice >= targetValue) || (direction === 'down' && investment.currentPrice <= targetValue);
                            return isAlreadyTriggered ? (
                                <p className="text-center text-[11px] font-bold mb-3 text-yellow-400">
                                    ⚠️ El {alertType === 'price' ? 'precio' : 'ROI'} actual ya {direction === 'up' ? 'supera' : 'está por debajo de'} {alertType === 'price' ? fmtPrice(targetValue) : `${targetPercent >= 0 ? "+" : ""}${targetPercent}%`} — se disparará en el próximo ciclo
                                </p>
                            ) : (
                                <p className={`text-center text-[11px] font-bold mb-3 ${alertType === 'price' ? 'text-yellow-400' : (targetPercent >= 0 ? "text-green-400" : "text-red-400")}`}>
                                    Notificar cuando {alertType === 'price' ? 'precio' : 'ROI'} {direction === 'up' ? "suba a" : "caiga a"} {alertType === 'price' ? fmtPrice(targetValue) : `${targetPercent >= 0 ? "+" : ""}${targetPercent}%`}
                                </p>
                            );
                        })()}

                        {/* Persistence selection */}
                        <div className="grid grid-cols-2 gap-2 mb-3">
                            <button
                                onClick={() => setIsPersistent(false)}
                                className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-bold border transition-all ${!isPersistent
                                    ? "bg-yellow-500 text-slate-900 border-yellow-500 shadow-md shadow-yellow-500/20"
                                    : "bg-slate-900 text-slate-500 border-slate-700 hover:border-slate-600"
                                    }`}
                            >
                                <Clock className="w-3 h-3 shrink-0" /> Una Vez
                            </button>
                            <button
                                onClick={() => setIsPersistent(true)}
                                className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-bold border transition-all ${isPersistent
                                    ? "bg-yellow-500 text-slate-900 border-yellow-500 shadow-md shadow-yellow-500/20"
                                    : "bg-slate-900 text-slate-500 border-slate-700 hover:border-slate-600"
                                    }`}
                            >
                                <Repeat className="w-3 h-3 shrink-0" /> Permanente
                            </button>
                        </div>

                        <input
                            type="text"
                            placeholder="Nota opcional (ej: comprar más si baja)"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            maxLength={200}
                            className="w-full h-9 bg-slate-900 border border-slate-700 rounded-lg px-3 text-xs text-white placeholder-slate-600 outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400/50 mb-3"
                        />

                        <button
                            onClick={handleAdd}
                            className={`w-full flex items-center justify-center gap-1.5 font-bold py-2.5 rounded-lg transition-all active:scale-[0.98] disabled:opacity-50 text-xs ${
                                (alertType === 'pnl'
                                    ? (direction === 'up' && investment.roi >= targetPercent) || (direction === 'down' && investment.roi <= targetPercent)
                                    : (direction === 'up' && investment.currentPrice >= targetValue) || (direction === 'down' && investment.currentPrice <= targetValue))
                                    ? "bg-orange-500 text-white hover:bg-orange-400 shadow-md shadow-orange-500/20"
                                    : "bg-yellow-500 text-slate-900 hover:bg-yellow-400 shadow-md shadow-yellow-500/20"
                            }`}
                        >
                            <Plus className="w-3.5 h-3.5" />
                            Agregar Alerta
                        </button>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 pt-2 pb-1 border-t border-slate-800">
                        <button
                            onClick={onClose}
                            className="flex-1 py-2.5 rounded-lg font-bold bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700 hover:text-white transition-all text-xs uppercase tracking-wider"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg font-bold bg-green-500 text-slate-900 hover:bg-green-400 transition-all shadow-md shadow-green-500/20 active:scale-[0.98] disabled:opacity-50 text-xs uppercase tracking-wider"
                        >
                            <Check className="w-3.5 h-3.5 shrink-0" />
                            {saving ? "Guardando..." : "Guardar"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
