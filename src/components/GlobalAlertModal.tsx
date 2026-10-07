import React, { useState, useEffect, useMemo } from "react";
import { X, Bell, Trash2, Edit2, Plus, Repeat, Clock, Check } from "lucide-react";
import { GlobalAlert } from "../hooks/useAlerts";
import { fmtUSD } from "../lib/format";
import { useAlertLevelState } from "../hooks/useAlertLevelState";
import { SPOT_HYSTERESIS, getLevelDisplay, levelStateKey } from "../lib/alertLevelDisplay";
import { computeSpotGlobalPnl, SpotPnlInvestment } from "../lib/spotGlobalPnl";

interface GlobalAlertModalProps {
    totalPnl: number;
    /** Every open investment (`inversiones`) — only used for the exact Spot PNL. */
    portfolio: readonly SpotPnlInvestment[];
    /** Live prices (the same object AlertSettings receives from App). */
    prices: Record<string, number>;
    currentAlerts: GlobalAlert[];
    onSaveAlerts: (alerts: GlobalAlert[]) => Promise<void>;
    onClose: () => void;
    initialEditIndex?: number | null;
}

export default function GlobalAlertModal({
    totalPnl,
    portfolio,
    prices,
    currentAlerts,
    onSaveAlerts,
    onClose,
    initialEditIndex,
}: GlobalAlertModalProps) {
    // Real crossing state owned by the Cloud Function (spotAlertState/global), the same
    // one the AlertSettings list uses.
    const { levels: spotLevels, loading: spotLevelsLoading } = useAlertLevelState("spot");

    // Exact Spot PNL of the Cloud Function (see src/lib/spotGlobalPnl.ts). App's
    // `totalPnl` is NOT used for the arrows/badges because it also adds open sales.
    const spotGlobalPnl = useMemo(
        () => computeSpotGlobalPnl(portfolio, prices),
        [portfolio, prices],
    );

    const [draftAlerts, setDraftAlerts] = useState<GlobalAlert[]>(currentAlerts);
    // Determine a reasonable default target amount based on current PNL, or 0 if PNL is 0
    const defaultTarget = totalPnl !== 0 ? Math.round(totalPnl * 1.05 / 100) * 100 : 1000;
    const [targetAmount, setTargetAmount] = useState<number>(defaultTarget);
    const [isPersistent, setIsPersistent] = useState(true);
    const [direction, setDirection] = useState<'up' | 'down'>('up');
    const [note, setNote] = useState<string>("");
    const [saving, setSaving] = useState(false);

    // If an initial index is provided, immediately load it into the form for editing
    useEffect(() => {
        if (initialEditIndex !== undefined && initialEditIndex !== null && currentAlerts[initialEditIndex]) {
            const alertToEdit = currentAlerts[initialEditIndex];
            setTargetAmount(alertToEdit.targetAmount);
            setIsPersistent(alertToEdit.isPersistent ?? true);
            setDirection(alertToEdit.direction ?? 'up');
            setNote(alertToEdit.note ?? "");
            // Remove it from draft alerts immediately
            setDraftAlerts(currentAlerts.filter((_, i) => i !== initialEditIndex));
        }
    }, [initialEditIndex, currentAlerts]);

    // ESC key closes the modal without saving (Cancel)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    const handleTargetChange = (val: number) => {
        setTargetAmount(val);
        // Auto-suggest direction based on comparison with current PNL
        if (val >= totalPnl) setDirection('up');
        else setDirection('down');
    };

    const handleAdd = () => {
        if (isNaN(targetAmount)) return;
        setDraftAlerts([...draftAlerts, {
            targetAmount,
            isPersistent,
            direction,
            ...(note.trim() ? { note: note.trim() } : {}),
        }]);
        // Reset form to defaults
        setTargetAmount(defaultTarget);
        setIsPersistent(true);
        setDirection('up');
        setNote("");
    };

    const handleEdit = (index: number) => {
        const alertToEdit = draftAlerts[index];
        setTargetAmount(alertToEdit.targetAmount);
        setIsPersistent(alertToEdit.isPersistent ?? true);
        setDirection(alertToEdit.direction ?? 'up');
        setNote(alertToEdit.note ?? "");
        handleRemove(index);
    };

    const handleRemove = (index: number) => {
        setDraftAlerts(draftAlerts.filter((_, i) => i !== index));
    };

    const handleSave = async () => {
        setSaving(true);
        await onSaveAlerts(draftAlerts);
        setSaving(false);
        onClose();
    };

    // PNL Calculations for Header
    const isPositive = totalPnl >= 0;
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
                                <h2 className="text-lg font-bold text-white">PNL Global</h2>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-md border ${pnlBgClass} ${pnlColorClass}`}>
                                    {isPositive ? "+" : ""}{fmtUSD(totalPnl)}
                                </span>
                            </div>
                            <p className="text-xs text-slate-400 flex items-center gap-2">
                                <span>Alertas de Cuenta</span>
                                <span className="text-slate-600">•</span>
                                <span className="font-medium text-slate-300">
                                    Monto total
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
                            No hay alertas globales configuradas aún
                        </p>
                    ) : (
                        <div className="space-y-2 mb-4">
                            {draftAlerts.map((alert, index) => {
                                // Arrow and badge come from the state stored by the Cloud
                                // Function for this exact level, never from a local
                                // comparison (same rule as the AlertSettings list). Draft
                                // levels have no stored entry yet, so getLevelDisplay falls
                                // back to an armed level with the side inferred from the PNL.
                                const display = getLevelDisplay({
                                    targetAmount: alert.targetAmount,
                                    pnl: spotGlobalPnl,
                                    levelState: spotLevels[levelStateKey(alert.targetAmount)],
                                    margin: SPOT_HYSTERESIS,
                                });
                                // While the state document is loading, keep a neutral badge
                                // instead of flashing a wrong one. One-shot alerts ("Una Vez")
                                // are not affected by the crossing state.
                                const isPending = spotLevelsLoading;
                                const isPaused = !isPending && display.status === 'paused';
                                const showUp = !isPending && display.arrow === '▲';
                                return (
                                <div key={index} className="flex items-center justify-between bg-slate-800 border border-slate-700 rounded-xl px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <div className="flex flex-col">
                                            <span className={`flex items-center gap-1 text-base font-bold ${isPending ? "text-slate-500" : showUp ? "text-green-400" : "text-red-400"}`}>
                                                {isPending ? '•' : showUp ? '🔼' : '🔽'}
                                                {alert.targetAmount >= 0 ? "+" : "-"}{fmtUSD(Math.abs(alert.targetAmount))}
                                            </span>
                                            {alert.note && (
                                                <span className="text-[10px] text-slate-400 italic mt-0.5">📝 {alert.note}</span>
                                            )}
                                        </div>
                                        {alert.isPersistent ? (
                                            <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold border ${isPending ? 'bg-slate-700/50 text-slate-400 border-slate-600' : isPaused ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' : 'bg-green-500/20 text-green-400 border-green-500/30'}`}>
                                                <Repeat className="w-3 h-3" /> {isPending ? '…' : isPaused ? 'En Pausa' : 'Armada'}
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
                                );
                            })}
                        </div>
                    )}

                    {/* Add new alert form */}
                    <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 mt-4">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <Plus className="w-3.5 h-3.5" /> Nueva Alerta
                        </h3>

                        {/* Target Amount input */}
                        <div className="mb-4">
                            <label className="block text-xs text-slate-400 mb-2 uppercase tracking-wider">
                                Monto Objetivo (USD)
                            </label>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => handleTargetChange(targetAmount - 100)}
                                    className="flex items-center justify-center w-12 h-12 bg-slate-900 border border-slate-700 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors active:scale-95"
                                >
                                    <span className="text-2xl font-bold">-</span>
                                </button>
                                <div className="relative flex-1">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-bold">$</span>
                                    <input
                                        type="number"
                                        value={targetAmount}
                                        onChange={(e) => handleTargetChange(Number(e.target.value))}
                                        className="w-full h-12 bg-slate-900 border border-slate-700 rounded-xl px-3 pl-8 pr-3 text-lg font-bold text-center text-white outline-none focus:ring-2 focus:ring-yellow-400"
                                    />
                                </div>
                                <button
                                    onClick={() => handleTargetChange(targetAmount + 100)}
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

                            <p className="text-center text-sm font-bold mt-3 text-slate-300">
                                Notificar cuando el PNL Global {direction === 'up' ? "llegue/suba a" : "caiga/baje a"} <span className={targetAmount >= 0 ? "text-green-400" : "text-red-400"}>{targetAmount >= 0 ? "+" : "-"}{fmtUSD(Math.abs(targetAmount))}</span>
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

                        <input
                            type="text"
                            placeholder="Nota opcional (ej: revisar posición)"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            maxLength={200}
                            className="w-full h-9 bg-slate-900 border border-slate-700 rounded-lg px-3 text-xs text-white placeholder-slate-600 outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400/50 mb-4"
                        />

                        <button
                            onClick={handleAdd}
                            className="w-full flex items-center justify-center gap-2 bg-yellow-500 text-slate-900 font-bold py-2.5 rounded-xl hover:bg-yellow-400 transition-all shadow-lg shadow-yellow-500/20 active:scale-95 disabled:opacity-50 text-sm"
                        >
                            <Plus className="w-4 h-4" />
                            Agregar Alerta Global
                        </button>
                    </div>

                    {/* Botones de acción principales */}
                    <div className="flex items-center gap-3 mt-6 pt-5 border-t border-slate-800">
                        <button
                            onClick={onClose}
                            className="flex-1 py-3 rounded-xl font-bold bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 hover:text-white transition-all text-sm uppercase tracking-widest"
                        >
                            Cancelar
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
