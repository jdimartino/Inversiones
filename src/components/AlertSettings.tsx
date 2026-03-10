import { Bell, Save, Trash2, Edit2, Repeat, Clock, History, CheckCircle, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import { AlertConfig, GlobalAlert, InvestmentAlert } from "../hooks/useAlerts";
import { usePortfolio } from "../hooks/usePortfolio";
import { usePrices } from "../hooks/usePrices";
import { useNotificationLogs } from "../hooks/useNotificationLogs";
import { fmtUSD, fmtPrice } from "../lib/format";

interface AlertSettingsProps {
    config: AlertConfig;
    saveConfig: (newConfig: AlertConfig) => Promise<boolean>;
    onEditGlobal?: (index: number) => void;
    onEditInvestment?: (investmentId: string, index: number) => void;
}

export default function AlertSettings({ config, saveConfig, onEditGlobal, onEditInvestment }: AlertSettingsProps) {
    const { portfolio } = usePortfolio();
    const { prices } = usePrices();
    const { logs, loading: logsLoading } = useNotificationLogs(15);

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
                <h3 className="font-bold text-slate-200 mb-4 text-sm uppercase tracking-wider flex items-center gap-2">
                    🌎 Alertas Globales (PNL Total en USD)
                </h3>
                {config.globalAlerts && config.globalAlerts.length > 0 ? (
                    <div className="space-y-3">
                        {config.globalAlerts.map((alertData: GlobalAlert, index: number) => (
                            <div key={`global-${index}`} className="flex items-center justify-between bg-slate-800 border border-slate-700 rounded-xl px-4 py-3">
                                <div className="flex items-center gap-3">
                                    <span className={`flex items-center gap-1 text-sm font-bold ${alertData.targetAmount >= 0 ? "text-green-400" : "text-red-400"}`}>
                                        {alertData.direction === 'up' ? '🔼' : '🔽'}
                                        {alertData.targetAmount >= 0 ? "+" : "-"}{fmtUSD(Math.abs(alertData.targetAmount))}
                                    </span>
                                    {alertData.isPersistent ? (
                                        <span className="flex items-center gap-1 text-[10px] bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                                            <Repeat className="w-3 h-3" /> Permanente
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1 text-[10px] bg-slate-700/50 text-slate-400 border border-slate-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                                            <Clock className="w-3 h-3" /> Una Vez
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => onEditGlobal && onEditGlobal(index)}
                                        className="text-slate-500 hover:bg-blue-500/10 hover:text-blue-400 transition-colors p-1.5 rounded-lg"
                                        title="Editar alerta global"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={async () => {
                                            const newAlerts = [...(config.globalAlerts || [])];
                                            newAlerts.splice(index, 1);
                                            await saveConfig({ ...config, globalAlerts: newAlerts });
                                        }}
                                        className="text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-colors p-1.5 rounded-lg"
                                        title="Eliminar alerta global"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-xs text-slate-500 italic text-center py-6 bg-slate-800 border border-slate-700 rounded-xl">
                        No hay alertas globales configuradas. Usa el icono 🔔 en el Dashboard (PNL Global).
                    </div>
                )}
            </div>

            {/* List of Active Individual Alerts */}
            <div className="bg-slate-900/50 p-4 rounded-lg mb-6 border border-slate-700/50">
                <h3 className="font-bold text-slate-200 mb-4 text-sm uppercase tracking-wider">🔔 Notificaciones Individuales Activas</h3>
                {config.investmentAlerts && Object.keys(config.investmentAlerts).length > 0 ? (
                    <div className="space-y-4">
                        {Object.entries(config.investmentAlerts).map(([id, alerts]) => {
                            const inv = portfolio.find((i) => i.id === id);
                            const coinName = inv ? inv.coin : "Activo Desconocido";
                            const currentPrice = inv ? (prices[inv.coin] || inv.buyPrice) : 0;
                            if (!Array.isArray(alerts) || alerts.length === 0) return null;
                            
                            return (
                                <div key={id} className="bg-slate-800 border border-slate-700 rounded-xl p-3">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-yellow-400 text-sm">{coinName}</span>
                                            {currentPrice > 0 && (
                                                <span className="text-[10px] text-slate-500 bg-slate-900 px-2 py-0.5 rounded-full border border-slate-700/50">
                                                    {fmtPrice(currentPrice)}
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-[10px] text-slate-500 bg-slate-900 px-2 py-0.5 rounded-full">
                                            {alerts.length} alerta{alerts.length !== 1 ? "s" : ""}
                                        </span>
                                    </div>
                                    <div className="space-y-1.5">
                                        {alerts.map((alert: InvestmentAlert, index: number) => (
                                            <div key={index} className="flex items-center justify-between bg-slate-900/60 px-3 py-2 rounded-lg">
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-xs font-bold flex items-center gap-1 ${alert.type === 'price' ? 'text-yellow-400' : (alert.targetPercent >= 0 ? "text-green-400" : "text-red-400")}`}>
                                                        {alert.direction === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                                        {alert.type === 'price' ? fmtPrice(alert.targetValue || 0) : `${alert.targetPercent >= 0 ? "+" : ""}${alert.targetPercent}%`}
                                                    </span>
                                                    <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest leading-none bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
                                                        {alert.type === 'price' ? 'Precio' : 'ROI'}
                                                    </span>
                                                    {alert.isPersistent ? (
                                                        <span className="flex items-center gap-1 text-[9px] bg-yellow-500/10 text-yellow-400 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                                                            <Repeat className="w-2.5 h-2.5" /> Perman.
                                                        </span>
                                                    ) : (
                                                        <span className="flex items-center gap-1 text-[9px] bg-slate-700/50 text-slate-500 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                                                            <Clock className="w-2.5 h-2.5" /> Una Vez
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={() => onEditInvestment && onEditInvestment(id, index)}
                                                        className="text-slate-500 hover:bg-blue-500/10 hover:text-blue-400 transition-colors p-1.5 rounded-lg"
                                                        title="Editar alerta"
                                                    >
                                                        <Edit2 className="w-3.5 h-3.5" />
                                                    </button>
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
                    <div className="text-xs text-slate-500 italic text-center py-6 bg-slate-900 border border-slate-700 rounded-xl">
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
                <p className="text-[10px] text-slate-500 leading-relaxed text-center w-full">
                    Recuerda que las alertas globales e individuales se configuran usando el icono 🔔 en el Dashboard.
                </p>
            </div>
        </div>
    );
}
