import React, { useState } from "react";
import {
    Zap,
    X,
    Plus,
    Clock,
    Repeat,
    Check,
    Trash2,
    Edit2,
} from "lucide-react";
import type { FuturesGlobalAlert } from "../lib/futures";
import { useAlertLevelState } from "../hooks/useAlertLevelState";
import { FUTURES_HYSTERESIS, getLevelDisplay, levelStateKey } from "../lib/alertLevelDisplay";
import { fmtUSD } from "../lib/format";

interface FuturesGlobalAlertModalProps {
    currentAlerts: FuturesGlobalAlert[];
    currentPnl: number;
    onSaveAlerts: (alerts: FuturesGlobalAlert[]) => void;
    onClose: () => void;
    initialEditIndex?: number;
}

export default function FuturesGlobalAlertModal({
    currentAlerts,
    currentPnl,
    onSaveAlerts,
    onClose,
    initialEditIndex,
}: FuturesGlobalAlertModalProps) {
    const [draftAlerts, setDraftAlerts] = useState<FuturesGlobalAlert[]>([...currentAlerts]);
    const [targetAmount, setTargetAmount] = useState<number>(0);
    const [direction, setDirection] = useState<"up" | "down">("up");
    const [isPersistent, setIsPersistent] = useState(true);
    const [note, setNote] = useState("");
    const [editIndex, setEditIndex] = useState<number | null>(initialEditIndex ?? null);
    const [saving, setSaving] = useState(false);
    // Real crossing state owned by the Cloud Function (futuresAlertState/global).
    const { levels, loading } = useAlertLevelState("futures");

    // If editing, pre-fill form from existing alert
    React.useEffect(() => {
        if (editIndex !== null && draftAlerts[editIndex]) {
            const alert = draftAlerts[editIndex];
            setTargetAmount(alert.targetAmount);
            setDirection(alert.direction);
            setIsPersistent(alert.isPersistent);
            setNote(alert.note || "");
            // Remove from draft so save will re-add the modified version
            const updated = draftAlerts.filter((_, i) => i !== editIndex);
            setDraftAlerts(updated);
            setEditIndex(null);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleTargetChange = (val: number) => {
        setTargetAmount(val);
        setDirection(val >= currentPnl ? "up" : "down");
    };

    const handleAdd = () => {
        if (!Number.isFinite(targetAmount)) return;
        const duplicate = draftAlerts.some(
            (a) => a.targetAmount === targetAmount && a.direction === direction
        );
        if (duplicate) return;
        setDraftAlerts([
            ...draftAlerts,
            {
                targetAmount,
                direction,
                isPersistent,
                ...(note.trim() ? { note: note.trim() } : {}),
            },
        ]);
        setTargetAmount(0);
        setIsPersistent(true);
        setNote("");
    };

    const handleRemove = (index: number) => {
        setDraftAlerts(draftAlerts.filter((_, i) => i !== index));
    };

    const handleEdit = (index: number) => {
        setEditIndex(index);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            onSaveAlerts(draftAlerts);
            onClose();
        } finally {
            setSaving(false);
        }
    };

    const totalAlerts = draftAlerts.length;

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto">

                {/* Header */}
                <div className="flex justify-between items-center px-4 py-3 border-b border-slate-800 sticky top-0 bg-slate-900/95 backdrop-blur-sm z-10">
                    <div className="flex items-center gap-2.5">
                        <Zap className="w-4 h-4 text-amber-400 shrink-0" />
                        <div>
                            <h2 className="text-base font-bold text-white">Alertas PNL Global</h2>
                            <p className="text-[11px] text-slate-400">
                                PNL NO REALIZADO:{" "}
                                <span className={`font-bold font-mono ${currentPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                    {currentPnl >= 0 ? "+" : "-"}${Math.abs(currentPnl).toFixed(2)}
                                </span>
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-slate-800 shrink-0 -mr-1">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="px-4 py-3 space-y-3">
                    {/* Active alerts */}
                    <div>
                        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                            Alertas Activas ({totalAlerts})
                        </h3>
                        {totalAlerts === 0 ? (
                            <p className="text-[11px] text-slate-600 italic text-center py-3 bg-slate-800/50 rounded-lg border border-slate-800">
                                No hay alertas de PNL global aún
                            </p>
                        ) : (
                            <div className="bg-slate-800 border border-slate-700 rounded-lg p-2">
                                <div className="flex flex-wrap gap-1.5">
                                    {draftAlerts.map((alert, index) => {
                                        // Arrow and badge come from the state owned by the
                                        // Cloud Function (futuresAlertState/global), not from
                                        // a local comparison against the live PNL.
                                        const display = getLevelDisplay({
                                            targetAmount: alert.targetAmount,
                                            pnl: currentPnl,
                                            levelState: levels[levelStateKey(alert.targetAmount)],
                                            margin: FUTURES_HYSTERESIS,
                                        });
                                        const isPending = loading;
                                        const isPaused = !isPending && display.status === "paused";
                                        const showUp = !isPending && display.arrow === "▲";
                                        return (
                                            <div key={index} className="flex flex-col bg-slate-900/80 px-2 py-1.5 rounded-md">
                                                <div className="flex items-center gap-1.5">
                                                    <span className={`text-[11px] font-bold ${isPending ? "text-slate-500" : showUp ? "text-green-400" : "text-red-400"}`}>
                                                        {isPending ? "•" : showUp ? "🔼" : "🔽"} {alert.targetAmount >= 0 ? "+" : "-"}${Math.abs(alert.targetAmount).toFixed(2)}
                                                    </span>
                                                    {alert.isPersistent ? (
                                                        <span className={`text-[8px] px-1 py-0.5 rounded-full font-bold ${isPending ? "bg-slate-700 text-slate-400" : isPaused ? "bg-orange-500/20 text-orange-400" : "bg-green-500/20 text-green-400"}`}>
                                                            {isPending ? "…" : isPaused ? "⏸P" : "▶P"}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[8px] bg-slate-700 text-slate-500 px-1 py-0.5 rounded-full font-bold">1×</span>
                                                    )}
                                                    <button onClick={() => handleEdit(index)} className="p-1 rounded text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 transition-colors">
                                                        <Edit2 className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button onClick={() => handleRemove(index)} className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                                {alert.note && <span className="text-[9px] text-slate-400 italic mt-0.5">📝 {alert.note}</span>}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Add new alert form */}
                    <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3">
                        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                            <Plus className="w-3 h-3" /> Nueva Alerta
                        </h3>

                        <label className="block text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-bold">Objetivo PNL</label>
                        <div className="flex items-center gap-2 mb-2">
                            <button
                                onClick={() => handleTargetChange(targetAmount * 0.99)}
                                className="flex items-center justify-center w-9 h-9 bg-slate-900 border border-slate-700 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors active:scale-95 shrink-0"
                            >
                                <span className="text-lg font-bold leading-none">−</span>
                            </button>
                            <div className="relative flex-1">
                                <input
                                    type="number"
                                    step="0.01"
                                    value={targetAmount || ""}
                                    onChange={(e) => handleTargetChange(Number(e.target.value))}
                                    className="w-full h-9 bg-slate-900 border border-slate-700 rounded-lg px-2 pr-7 text-base font-bold text-center text-white outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400/50"
                                />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">$</span>
                            </div>
                            <button
                                onClick={() => handleTargetChange(targetAmount * 1.01)}
                                className="flex items-center justify-center w-9 h-9 bg-slate-900 border border-slate-700 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors active:scale-95 shrink-0"
                            >
                                <span className="text-lg font-bold leading-none">+</span>
                            </button>
                        </div>

                        <div className="text-[10px] text-slate-400 mb-2 font-mono">
                            Actual: <span className={`font-bold ${currentPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{fmtUSD(currentPnl)}</span>
                        </div>

                        {/* Direction + Persistence — single row */}
                        <div className="grid grid-cols-4 gap-1.5 mb-1.5">
                            <button
                                onClick={() => setDirection("up")}
                                className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${direction === "up" ? "bg-green-500/20 text-green-400 border-green-500/50" : "bg-slate-900 text-slate-500 border-slate-700 hover:border-slate-600"}`}
                            >
                                🔼 Sube
                            </button>
                            <button
                                onClick={() => setDirection("down")}
                                className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${direction === "down" ? "bg-red-500/20 text-red-400 border-red-500/50" : "bg-slate-900 text-slate-500 border-slate-700 hover:border-slate-600"}`}
                            >
                                🔽 Baja
                            </button>
                            <button
                                onClick={() => setIsPersistent(false)}
                                className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${!isPersistent ? "bg-yellow-500 text-slate-900 border-yellow-500" : "bg-slate-900 text-slate-500 border-slate-700 hover:border-slate-600"}`}
                            >
                                <Clock className="w-2.5 h-2.5 shrink-0" /> 1 Vez
                            </button>
                            <button
                                onClick={() => setIsPersistent(true)}
                                className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${isPersistent ? "bg-yellow-500 text-slate-900 border-yellow-500" : "bg-slate-900 text-slate-500 border-slate-700 hover:border-slate-600"}`}
                            >
                                <Repeat className="w-2.5 h-2.5 shrink-0" /> Perm.
                            </button>
                        </div>

                        {Number.isFinite(targetAmount) && targetAmount !== 0 && (
                            <p className="text-center text-[10px] font-bold mb-1.5 text-yellow-400">
                                🔔 Te avisará cada vez que el PNL cruce este nivel ({targetAmount >= 0 ? "+" : "-"}${Math.abs(targetAmount).toFixed(2)}), ya sea subiendo o bajando.
                            </p>
                        )}

                        <input
                            type="text"
                            placeholder="Nota opcional (ej: esperar confirmación)"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            maxLength={200}
                            className="w-full h-8 bg-slate-900 border border-slate-700 rounded-lg px-3 text-xs text-white placeholder-slate-600 outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400/50 mb-2"
                        />

                        <button
                            onClick={handleAdd}
                            disabled={!Number.isFinite(targetAmount) || targetAmount === 0}
                            className={`w-full flex items-center justify-center gap-1.5 font-bold py-2 rounded-lg transition-all active:scale-[0.98] disabled:opacity-50 text-xs ${
                                Number.isFinite(targetAmount) && targetAmount !== 0 && (
                                    (direction === "up" && currentPnl >= targetAmount) ||
                                    (direction === "down" && currentPnl <= targetAmount)
                                )
                                    ? "bg-yellow-500 text-slate-900 hover:bg-yellow-400 shadow-md shadow-yellow-500/20"
                                    : "bg-blue-500 text-white hover:bg-blue-400 shadow-md shadow-blue-500/20"
                            }`}
                        >
                            <Plus className="w-3.5 h-3.5" />
                            Agregar Alerta
                        </button>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 pt-1.5 pb-1 border-t border-slate-800">
                        <button
                            onClick={onClose}
                            className="flex-1 py-2 rounded-lg font-bold bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700 hover:text-white transition-all text-xs uppercase tracking-wider"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg font-bold bg-green-500 text-slate-900 hover:bg-green-400 transition-all shadow-md shadow-green-500/20 active:scale-[0.98] disabled:opacity-50 text-xs uppercase tracking-wider"
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
