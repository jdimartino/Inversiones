import React, { useState, useEffect } from "react";
import { Bell, Save, Trash2, Repeat, Clock, History, CheckCircle, AlertTriangle } from "lucide-react";
import { AlertConfig } from "../hooks/useAlerts";
import { usePortfolio } from "../hooks/usePortfolio";
import { useNotificationLogs } from "../hooks/useNotificationLogs";

interface AlertSettingsProps {
    config: AlertConfig;
    saveConfig: (newConfig: AlertConfig) => Promise<boolean>;
}

export default function AlertSettings({ config, saveConfig }: AlertSettingsProps) {
    const { portfolio } = usePortfolio();
    const { logs, loading: logsLoading } = useNotificationLogs(15);

    const [minPNL, setMin] = useState(config.minPNL);
    const [maxPNL, setMax] = useState(config.maxPNL);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setMin(config.minPNL);
        setMax(config.maxPNL);
    }, [config.minPNL, config.maxPNL]);

    const handleSave = async () => {
        setSaving(true);
        // We only save the global USD limits here. 
        // InvestmentAlerts are saved from the individual modal.
        await saveConfig({
            ...config,
            minPNL,
            maxPNL
        });
        setSaving(false);
        alert("¡Configuración de alertas globales guardada exitosamente!");
    };

    return (
        <div className="bg-slate-800 rounded-xl p-6 shadow-xl border border-slate-700 mt-8 mb-8">
            <div className="flex items-center gap-3 mb-6">
                <Bell className="w-6 h-6 text-yellow-400" />
                <h2 className="text-xl font-bold font-heading text-white">Alertas de Telegram 🔔</h2>
            </div>

            <p className="text-sm text-slate-400 mb-6">
                Configura los límites para recibir un mensaje automático si tu PNL (Global) se sale del rango. El robot revisa estos valores cada hora.
            </p>

            {/* Global Alerts */}
            <div className="bg-slate-900/50 p-4 rounded-lg mb-6 border border-slate-700/50">
                <h3 className="font-bold text-slate-200 mb-4 text-sm uppercase tracking-wider">🌎 Alertas Globales (PNL Total en USD)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-xs font-medium text-slate-400 mb-2 uppercase">
                            Límite Inferior (Alerta Pérdida)
                        </label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                            <input
                                type="number"
                                value={minPNL}
                                onChange={(e) => setMin(Number(e.target.value))}
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl py-2 pl-8 pr-4 focus:ring-2 focus:ring-yellow-400 text-sm text-white outline-none transition-all"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-400 mb-2 uppercase">
                            Límite Superior (Ganancia Meta)
                        </label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                            <input
                                type="number"
                                value={maxPNL}
                                onChange={(e) => setMax(Number(e.target.value))}
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl py-2 pl-8 pr-4 focus:ring-2 focus:ring-yellow-400 text-sm text-white outline-none transition-all"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* List of Active Individual Alerts */}
            <div className="bg-slate-900/50 p-4 rounded-lg mb-6 border border-slate-700/50">
                <h3 className="font-bold text-slate-200 mb-4 text-sm uppercase tracking-wider">🔔 Notificaciones Individuales Activas</h3>
                {config.investmentAlerts && Object.keys(config.investmentAlerts).length > 0 ? (
                    <div className="space-y-3">
                        {Object.entries(config.investmentAlerts).map(([id, alerts]) => {
                            const inv = portfolio.find((i) => i.id === id);
                            const coinName = inv ? inv.coin : "Activo Desconocido";
                            if (!Array.isArray(alerts) || alerts.length === 0) return null;
                            return (
                                <div key={id} className="bg-slate-800 border border-slate-700 rounded-xl p-3">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="font-bold text-yellow-400 text-sm">{coinName}</span>
                                        <span className="text-[10px] text-slate-500 bg-slate-900 px-2 py-0.5 rounded-full">
                                            {alerts.length} alerta{alerts.length !== 1 ? "s" : ""}
                                        </span>
                                    </div>
                                    <div className="space-y-1.5">
                                        {alerts.map((alertData, index) => (
                                            <div key={index} className="flex items-center justify-between bg-slate-900/60 px-3 py-2 rounded-lg">
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-xs font-bold ${alertData.targetPercent >= 0 ? "text-green-400" : "text-red-400"}`}>
                                                        {alertData.targetPercent >= 0 ? "+" : ""}{alertData.targetPercent}%
                                                    </span>
                                                    {alertData.isPersistent ? (
                                                        <span className="flex items-center gap-1 text-[10px] bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                                                            <Repeat className="w-3 h-3" /> Permanente
                                                        </span>
                                                    ) : (
                                                        <span className="flex items-center gap-1 text-[10px] bg-slate-700/50 text-slate-400 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border border-slate-600">
                                                            <Clock className="w-3 h-3" /> Una Vez
                                                        </span>
                                                    )}
                                                </div>
                                                <button
                                                    onClick={async () => {
                                                        const newAlerts = { ...config.investmentAlerts };
                                                        const updated = (newAlerts[id] || []).filter((_, i) => i !== index);
                                                        if (updated.length === 0) delete newAlerts[id];
                                                        else newAlerts[id] = updated;
                                                        await saveConfig({ ...config, investmentAlerts: newAlerts });
                                                    }}
                                                    className="text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-colors p-1.5 rounded-lg"
                                                    title="Eliminar esta alerta"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-xs text-slate-500 italic text-center py-6 bg-slate-900 border border-slate-800 rounded-xl">
                        No tienes alertas individuales configuradas. Usa el icono 🔔 en la tabla.
                    </div>
                )}

            </div>

            {/* ── Historial de Notificaciones Enviadas ────────────── */}
            <div className="bg-slate-900/50 p-4 rounded-lg mb-6 border border-slate-700/50">
                <div className="flex items-center gap-2 mb-4">
                    <History className="w-4 h-4 text-blue-400" />
                    <h3 className="font-bold text-slate-200 text-sm uppercase tracking-wider">Historial de Notificaciones Enviadas</h3>
                </div>

                {logsLoading ? (
                    <p className="text-xs text-slate-500 italic text-center py-4">Cargando historial...</p>
                ) : logs.length === 0 ? (
                    <div className="text-xs text-slate-500 italic text-center py-6 bg-slate-900 border border-slate-800 rounded-xl">
                        Aún no se ha enviado ninguna notificación por Telegram.
                    </div>
                ) : (
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                        {logs.map((log) => {
                            const pnlColor = log.globalPNL >= 0 ? "text-green-400" : "text-red-400";
                            const dateStr = log.sentAt
                                ? log.sentAt.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })
                                : "—";
                            const timeStr = log.sentAt
                                ? log.sentAt.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
                                : "";
                            return (
                                <div key={log.id} className="bg-slate-800 border border-slate-700 rounded-xl p-3">
                                    <div className="flex justify-between items-start gap-2 mb-2">
                                        <div className="flex items-center gap-2">
                                            <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                                            <span className="text-[11px] font-bold text-white">{dateStr} · {timeStr}</span>
                                        </div>
                                        {log.globalAlertTriggered && (
                                            <span className="flex items-center gap-1 text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full font-bold">
                                                <AlertTriangle className="w-3 h-3" /> Global
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex gap-4 text-[11px] text-slate-400 mb-2">
                                        <span>PNL: <span className={`font-bold ${pnlColor}`}>{log.globalPNL >= 0 ? "+" : ""}${log.globalPNL.toLocaleString()}</span></span>
                                        <span>Invertido: <span className="text-slate-300">${log.totalInvested.toLocaleString()}</span></span>
                                    </div>
                                    {log.triggeredAssets.length > 0 && (
                                        <div className="mt-1 space-y-1">
                                            {log.triggeredAssets.map((msg, i) => (
                                                <p key={i} className="text-[10px] text-slate-400 bg-slate-900/60 px-2 py-1 rounded-lg">{msg}</p>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="flex justify-between items-center bg-slate-900/30 p-4 rounded-xl border border-slate-700/30">
                <p className="text-[10px] text-slate-500 max-w-[60%] leading-relaxed">
                    Recuerda que las alertas individuales por activo se configuran usando el icono 🔔 en la tabla de activos.
                </p>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 bg-yellow-500 text-slate-900 font-bold px-6 py-2.5 rounded-xl hover:bg-yellow-400 transition-all shadow-lg shadow-yellow-500/20 active:scale-95 disabled:opacity-50 text-xs uppercase tracking-widest"
                >
                    <Save className="w-4 h-4" />
                    {saving ? "Guardando..." : "Guardar Límites"}
                </button>
            </div>
        </div>
    );
}
