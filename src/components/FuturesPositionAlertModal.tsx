import React, { useState, useEffect } from "react";
import { X, Bell, Trash2, Plus } from "lucide-react";
import { FuturesPosition, FuturesPositionAlert, formatRoe, formatPnl } from "../lib/futures";

interface FuturesPositionAlertModalProps {
    position: FuturesPosition;
    currentAlerts: FuturesPositionAlert[];
    onSave: (alerts: FuturesPositionAlert[]) => void;
    onClose: () => void;
}

export default function FuturesPositionAlertModal({
    position,
    currentAlerts,
    onSave,
    onClose,
}: FuturesPositionAlertModalProps) {
    const [draftAlerts, setDraftAlerts] = useState<FuturesPositionAlert[]>(currentAlerts);
    const [alertType, setAlertType] = useState<"roe" | "roeUsd">("roe");
    const [targetValue, setTargetValue] = useState<number>(0);
    const [direction, setDirection] = useState<"up" | "down">("up");
    const [isPersistent, setIsPersistent] = useState(false);
    const [note, setNote] = useState("");
    const currentAlertValue = alertType === "roe" ? position.roe : position.unrealizedPnl;
    const isAlreadyTriggered = targetValue !== 0 && (
        (direction === "up" && currentAlertValue >= targetValue) ||
        (direction === "down" && currentAlertValue <= targetValue)
    );
    const canAdd = targetValue !== 0 && !isNaN(targetValue);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    const handleTargetChange = (val: number) => {
        setTargetValue(val);
        setDirection(val >= 0 ? "up" : "down");
    };

    const handleAdd = () => {
        if (alertType === "roe" && isNaN(targetValue)) return;
        if (alertType === "roeUsd" && isNaN(targetValue)) return;

        const existing = draftAlerts.find(
            (a) => a.type === alertType && a.targetValue === targetValue && a.direction === direction
        );
        if (existing) return;

        setDraftAlerts([
            ...draftAlerts,
            {
                type: alertType,
                targetValue,
                direction,
                isPersistent,
                ...(note.trim() ? { note: note.trim() } : {}),
            },
        ]);
        setTargetValue(0);
        setNote("");
        setIsPersistent(false);
    };

    const handleRemove = (index: number) => {
        setDraftAlerts(draftAlerts.filter((_, i) => i !== index));
    };

    const handleSave = () => {
        onSave(draftAlerts);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div
                className="bg-[#181A20] rounded-2xl border border-gray-700 w-full max-w-md mx-4 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-800">
                    <div>
                        <h3 className="text-white font-semibold flex items-center gap-2">
                            <Bell className="text-yellow-400" size={18} />
                            Alertas: {position.symbol}
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                            {position.side} {position.leverage}x — {formatPnl(position.unrealizedPnl)} · {formatRoe(position.roe)}
                        </p>
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Form */}
                <div className="p-4 space-y-4">
                    {/* Alert type selector */}
                    <div>
                        <div className="text-sm text-gray-400 mb-2">Tipo de alerta</div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => { setAlertType("roe"); setTargetValue(0); setDirection("up"); }}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                    alertType === "roe"
                                        ? "bg-yellow-500 text-black"
                                        : "bg-gray-800 text-gray-400 border border-gray-700"
                                }`}
                            >
                                ROE (%)
                            </button>
                            <button
                                onClick={() => { setAlertType("roeUsd"); setTargetValue(0); setDirection("up"); }}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                    alertType === "roeUsd"
                                        ? "bg-yellow-500 text-black"
                                        : "bg-gray-800 text-gray-400 border border-gray-700"
                                }`}
                            >
                                ROE (USD)
                            </button>
                        </div>
                    </div>

                    {/* Target value */}
                    <div>
                        <div className="text-sm text-gray-400 mb-2">
                            {alertType === "roe" ? "Umbral de ROE" : "Umbral de PnL"}
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                value={targetValue || ""}
                                onChange={(e) => handleTargetChange(parseFloat(e.target.value) || 0)}
                                className="flex-1 bg-[#0E1014] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-yellow-500 transition-colors"
                                placeholder={alertType === "roe" ? "ej: 15, -10" : "ej: 500, -200"}
                            />
                            <span className="text-gray-500 text-sm">{alertType === "roe" ? "%" : "USDT"}</span>
                        </div>
                    </div>

                    {/* Direction */}
                    <div>
                        <div className="text-sm text-gray-400 mb-2">Dirección</div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setDirection("up")}
                                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                                    direction === "up"
                                        ? "bg-green-500/20 text-green-400 border border-green-500/40"
                                        : "bg-gray-800 text-gray-500 border border-gray-700"
                                }`}
                            >
                                Suba ↑
                            </button>
                            <button
                                onClick={() => setDirection("down")}
                                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                                    direction === "down"
                                        ? "bg-red-500/20 text-red-400 border border-red-500/40"
                                        : "bg-gray-800 text-gray-500 border border-gray-700"
                                }`}
                            >
                                Baja ↓
                            </button>
                        </div>
                    </div>

                    {/* Persistence */}
                    <div>
                        <div className="text-sm text-gray-400 mb-2">Frecuencia</div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setIsPersistent(false)}
                                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                                    !isPersistent
                                        ? "bg-blue-500/20 text-blue-400 border border-blue-500/40"
                                        : "bg-gray-800 text-gray-500 border border-gray-700"
                                }`}
                            >
                                Una vez
                            </button>
                            <button
                                onClick={() => setIsPersistent(true)}
                                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                                    isPersistent
                                        ? "bg-blue-500/20 text-blue-400 border border-blue-500/40"
                                        : "bg-gray-800 text-gray-500 border border-gray-700"
                                }`}
                            >
                                Siempre
                            </button>
                        </div>
                    </div>

                    {/* Current value indicator */}
                    <div className="bg-[#0E1014] rounded-lg p-3 border border-gray-800 flex items-center justify-between">
                        <span className="text-xs text-gray-500">Actual</span>
                        <span className={`text-sm font-mono font-bold ${currentAlertValue >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {alertType === "roe" ? `${currentAlertValue >= 0 ? "+" : ""}${currentAlertValue.toFixed(2)}%` : `${currentAlertValue >= 0 ? "+" : ""}$${Math.abs(currentAlertValue).toFixed(2)}`}
                        </span>
                    </div>

                    {/* Warning: already triggered */}
                    {isAlreadyTriggered && (
                        <p className="text-center text-[10px] font-bold mb-1.5 text-yellow-400">
                            ⚠️ El {alertType === "roe" ? "ROE" : "PnL"} actual ya {direction === "up" ? "supera" : "está por debajo de"} {alertType === "roe" ? `${targetValue}%` : `$${targetValue}`} — se disparará en el próximo ciclo
                        </p>
                    )}

                    {/* Note */}
                    <div>
                        <div className="text-sm text-gray-400 mb-2">Nota (opcional)</div>
                        <input
                            type="text"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            className="w-full bg-[#0E1014] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-yellow-500 transition-colors"
                            placeholder="ej: Cuidar posición"
                        />
                    </div>

                    {/* Add button */}
                    <button
                        onClick={handleAdd}
                        disabled={!canAdd}
                        className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                            canAdd
                                ? "bg-yellow-500 text-black hover:bg-yellow-400"
                                : "bg-gray-800 text-gray-500 cursor-not-allowed"
                        }`}
                    >
                        <Plus size={16} />
                        Agregar alerta
                    </button>
                </div>

                {/* Current alerts list */}
                {draftAlerts.length > 0 && (
                    <div className="px-4 pb-4">
                        <div className="text-sm text-gray-400 mb-2">Alertas configuradas</div>
                        <div className="space-y-2">
                            {draftAlerts.map((alert, index) => {
                                const val = alert.type === "roe" ? position.roe : position.unrealizedPnl;
                                const triggered = alert.direction === "up"
                                    ? val >= alert.targetValue
                                    : val <= alert.targetValue;
                                return (
                                <div
                                    key={index}
                                    className={`flex items-center justify-between rounded-lg px-3 py-2 border transition-colors ${
                                        triggered
                                            ? "bg-yellow-500/10 border-yellow-500/30"
                                            : "bg-[#0E1014] border-gray-800 hover:border-gray-700"
                                    }`}
                                >
                                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                                        <Bell size={14} className="text-yellow-400 flex-shrink-0" />
                                        <span className="text-white text-sm">
                                            {alert.type === "roe" ? "ROE %" : "ROE USD"}{" "}
                                            {alert.direction === "up" ? ">=" : "<="}{" "}
                                            {alert.type === "roe" ? `${alert.targetValue}%` : `$${alert.targetValue}`}
                                        </span>
                                        <span className="text-xs text-gray-500">
                                            ({alert.isPersistent ? "siempre" : "una vez"})
                                        </span>
                                        {triggered && (
                                            <span className="text-[10px] text-yellow-400 font-medium bg-yellow-500/20 px-1.5 py-0.5 rounded">
                                                ✓ activa
                                            </span>
                                        )}
                                        {alert.note && (
                                            <span className="text-xs text-gray-600 truncate">— {alert.note}</span>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => handleRemove(index)}
                                        className="text-gray-500 hover:text-red-400 transition-colors flex-shrink-0 ml-2"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Footer */}
                <div className="flex gap-2 p-4 border-t border-gray-800">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2 rounded-lg bg-gray-800 text-gray-400 font-medium text-sm hover:bg-gray-700 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex-1 px-4 py-2 rounded-lg bg-yellow-500 text-black font-medium text-sm hover:bg-yellow-400 transition-colors"
                    >
                        Guardar
                    </button>
                </div>
            </div>
        </div>
    );
}
