import { useState } from "react";
import { Trash2, Edit2, Repeat, Clock, History, CheckCircle, AlertTriangle, TrendingUp, TrendingDown, Loader2, Eye, Plus } from "lucide-react";
import { AlertConfig, GlobalAlert, InvestmentAlert, WatchlistAlert } from "../hooks/useAlerts";
import { usePortfolio } from "../hooks/usePortfolio";
import { usePrices } from "../hooks/usePrices";
import { useNotificationLogs } from "../hooks/useNotificationLogs";
import { fmtUSD, fmtPrice } from "../lib/format";

interface AlertSettingsProps {
    config: AlertConfig;
    saveConfig: (newConfig: AlertConfig) => Promise<boolean>;
    onEditGlobal?: (index: number) => void;
    onEditInvestment?: (investmentId: string, index: number) => void;
    onOpenWatchlist?: () => void;
}

export default function AlertSettings({ config, saveConfig, onEditGlobal, onEditInvestment, onOpenWatchlist }: AlertSettingsProps) {
    const { portfolio } = usePortfolio();
    const { prices } = usePrices();
    const { logs, loading: logsLoading } = useNotificationLogs(15);
    const [savingId, setSavingId] = useState<string | null>(null);

    const globalCount = config.globalAlerts?.length ?? 0;
    const individualCount = config.investmentAlerts
        ? Object.values(config.investmentAlerts).reduce((sum, a) => sum + (Array.isArray(a) ? a.length : 0), 0)
        : 0;

    return (
        <div className="space-y-3 md:space-y-4">

            {/* ── Watchlist Alerts ──────────────────── */}
            <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-3 md:p-4">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wider flex items-center gap-1.5">
                        <Eye className="w-3.5 h-3.5 text-blue-400" /> Watchlist
                    </h3>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-500 bg-slate-900/80 px-2 py-0.5 rounded-full border border-slate-700/50 font-bold">
                            {Object.values(config.watchlistAlerts || {}).reduce((sum, a) => sum + a.length, 0)}
                        </span>
                        {onOpenWatchlist && (
                            <button
                                onClick={onOpenWatchlist}
                                className="flex items-center gap-1 text-[10px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-1 rounded-lg hover:bg-blue-500/20 transition-colors"
                            >
                                <Plus className="w-3 h-3" /> Nueva
                            </button>
                        )}
                    </div>
                </div>
                {config.watchlistAlerts && Object.keys(config.watchlistAlerts).length > 0 ? (
                    <div className="space-y-2">
                        {Object.entries(config.watchlistAlerts).map(([coin, alerts]) => {
                            if (!Array.isArray(alerts) || alerts.length === 0) return null;
                            return (
                                <div key={coin} className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-2.5">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-blue-400 text-sm">{coin}</span>
                                            {prices[coin] > 0 && (
                                                <span className="text-base font-bold text-white font-mono">
                                                    {fmtPrice(prices[coin])}
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-[9px] text-slate-500 font-bold">{alerts.length} alerta{alerts.length !== 1 ? "s" : ""}</span>
                                    </div>
                                    <div className="space-y-1">
                                        {(alerts as WatchlistAlert[]).map((alert, index) => (
                                            <div key={index} className="flex items-center justify-between bg-slate-800/60 px-2.5 py-1.5 rounded-md">
                                                <div className="flex items-center gap-1.5">
                                                    <span className={`text-[11px] font-bold flex items-center gap-1 ${alert.direction === 'up' ? 'text-green-400' : 'text-red-400'}`}>
                                                        {alert.direction === 'up' ? <TrendingUp className="w-3 h-3 shrink-0" /> : <TrendingDown className="w-3 h-3 shrink-0" />}
                                                        {fmtPrice(alert.targetValue)}
                                                    </span>
                                                    {alert.isPersistent ? (
                                                        <span className="flex items-center gap-0.5 text-[8px] bg-yellow-500/10 text-yellow-400 px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap">
                                                            <Repeat className="w-2 h-2" /> Perm.
                                                        </span>
                                                    ) : (
                                                        <span className="flex items-center gap-0.5 text-[8px] bg-slate-700/50 text-slate-500 px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap">
                                                            <Clock className="w-2 h-2" /> 1 vez
                                                        </span>
                                                    )}
                                                </div>
                                                <button
                                                    onClick={async () => {
                                                        if (savingId) return;
                                                        setSavingId(`watch-${coin}-${index}`);
                                                        const newWatchlist = { ...(config.watchlistAlerts || {}) };
                                                        const updated = (newWatchlist[coin] || []).filter((_, i) => i !== index);
                                                        if (updated.length === 0) delete newWatchlist[coin];
                                                        else newWatchlist[coin] = updated;
                                                        await saveConfig({ ...config, watchlistAlerts: newWatchlist });
                                                        setSavingId(null);
                                                    }}
                                                    disabled={savingId === `watch-${coin}-${index}`}
                                                    className="text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-colors p-1 rounded-md disabled:opacity-50"
                                                >
                                                    {savingId === `watch-${coin}-${index}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <p className="text-[11px] text-slate-600 italic text-center py-3 bg-slate-900/40 rounded-lg border border-slate-700/30">
                        Sin alertas watchlist. Usa "+ Nueva" para monitorear precios.
                    </p>
                )}
            </div>

            {/* ── Individual Alerts ─────────────────── */}
            <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-3 md:p-4">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wider flex items-center gap-1.5">
                        🔔 Alertas Individuales
                    </h3>
                    <span className="text-[10px] text-slate-500 bg-slate-900/80 px-2 py-0.5 rounded-full border border-slate-700/50 font-bold">
                        {individualCount}
                    </span>
                </div>
                {config.investmentAlerts && Object.keys(config.investmentAlerts).length > 0 ? (
                    <div className="space-y-2">
                        {Object.entries(config.investmentAlerts).map(([id, alerts]) => {
                            const inv = portfolio.find((i) => i.id === id);
                            const coinName = inv ? inv.coin : "Desconocido";
                            const currentPrice = inv ? (prices[inv.coin] || inv.buyPrice) : 0;
                            if (!Array.isArray(alerts) || alerts.length === 0) return null;

                            return (
                                <div key={id} className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-2.5">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-yellow-400 text-sm">{coinName}</span>
                                            {currentPrice > 0 && (
                                                <span className="text-base font-bold text-white font-mono">
                                                    {fmtPrice(currentPrice)}
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-[9px] text-slate-500 font-bold">
                                            {alerts.length} alerta{alerts.length !== 1 ? "s" : ""}
                                        </span>
                                    </div>
                                    <div className="space-y-1">
                                        {alerts.map((alert: InvestmentAlert, index: number) => (
                                            <div key={index} className="flex items-center justify-between bg-slate-800/60 px-2.5 py-1.5 rounded-md">
                                                <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                                                    <span className={`text-[11px] font-bold flex items-center gap-1 whitespace-nowrap ${alert.type === 'price' ? 'text-yellow-400' : (alert.targetPercent >= 0 ? "text-green-400" : "text-red-400")}`}>
                                                        {alert.direction === 'up' ? <TrendingUp className="w-3 h-3 shrink-0" /> : <TrendingDown className="w-3 h-3 shrink-0" />}
                                                        {alert.type === 'price' ? fmtPrice(alert.targetValue || 0) : `${alert.targetPercent >= 0 ? "+" : ""}${alert.targetPercent}%`}
                                                    </span>
                                                    <span className="text-[8px] text-slate-500 uppercase font-bold tracking-wide bg-slate-900/60 px-1 py-0.5 rounded border border-slate-700/50">
                                                        {alert.type === 'price' ? 'Precio' : 'ROI'}
                                                    </span>
                                                    {alert.isPersistent ? (
                                                        <span className="flex items-center gap-0.5 text-[8px] bg-yellow-500/10 text-yellow-400 px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap">
                                                            <Repeat className="w-2 h-2" /> Perm.
                                                        </span>
                                                    ) : (
                                                        <span className="flex items-center gap-0.5 text-[8px] bg-slate-700/50 text-slate-500 px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap">
                                                            <Clock className="w-2 h-2" /> 1 vez
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center shrink-0">
                                                    <button
                                                        onClick={() => onEditInvestment && onEditInvestment(id, index)}
                                                        className="text-slate-500 hover:bg-blue-500/10 hover:text-blue-400 transition-colors p-1 rounded-md"
                                                        title="Editar alerta"
                                                    >
                                                        <Edit2 className="w-3 h-3" />
                                                    </button>
                                                    <button
                                                        onClick={async () => {
                                                            if (savingId) return;
                                                            setSavingId(`inv-${id}-${index}`);
                                                            const newAlerts = { ...config.investmentAlerts };
                                                            const updated = (newAlerts[id] || []).filter((_, i) => i !== index);
                                                            if (updated.length === 0) delete newAlerts[id];
                                                            else newAlerts[id] = updated;
                                                            await saveConfig({ ...config, investmentAlerts: newAlerts });
                                                            setSavingId(null);
                                                        }}
                                                        disabled={savingId === `inv-${id}-${index}`}
                                                        className="text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-colors p-1 rounded-md disabled:opacity-50"
                                                        title="Eliminar esta alerta"
                                                    >
                                                        {savingId === `inv-${id}-${index}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
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
                    <p className="text-[11px] text-slate-600 italic text-center py-3 bg-slate-900/40 rounded-lg border border-slate-700/30">
                        Sin alertas individuales. Usa 🔔 en la tabla de activos.
                    </p>
                )}
            </div>

            {/* ── Global Alerts ─────────────────────── */}
            <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-3 md:p-4">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wider flex items-center gap-1.5">
                        🌎 Alertas Globales
                    </h3>
                    <span className="text-[10px] text-slate-500 bg-slate-900/80 px-2 py-0.5 rounded-full border border-slate-700/50 font-bold">
                        {globalCount}
                    </span>
                </div>
                {config.globalAlerts && config.globalAlerts.length > 0 ? (
                    <div className="space-y-1.5">
                        {config.globalAlerts.map((alertData: GlobalAlert, index: number) => (
                            <div key={`global-${index}`} className="flex items-center justify-between bg-slate-900/60 border border-slate-700/40 rounded-lg px-3 py-2">
                                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                    <span className={`flex items-center gap-1 text-sm font-bold whitespace-nowrap ${alertData.targetAmount >= 0 ? "text-green-400" : "text-red-400"}`}>
                                        {alertData.direction === 'up' ? '🔼' : '🔽'}
                                        {alertData.targetAmount >= 0 ? "+" : "-"}{fmtUSD(Math.abs(alertData.targetAmount))}
                                    </span>
                                    {alertData.isPersistent ? (
                                        <span className="flex items-center gap-1 text-[9px] bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap">
                                            <Repeat className="w-2.5 h-2.5" /> Permanente
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1 text-[9px] bg-slate-700/50 text-slate-400 border border-slate-600 px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap">
                                            <Clock className="w-2.5 h-2.5" /> Una Vez
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center shrink-0">
                                    <button
                                        onClick={() => onEditGlobal && onEditGlobal(index)}
                                        className="text-slate-500 hover:bg-blue-500/10 hover:text-blue-400 transition-colors p-1.5 rounded-lg"
                                        title="Editar alerta global"
                                    >
                                        <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        onClick={async () => {
                                            if (savingId) return;
                                            setSavingId(`global-${index}`);
                                            const newAlerts = [...(config.globalAlerts || [])];
                                            newAlerts.splice(index, 1);
                                            await saveConfig({ ...config, globalAlerts: newAlerts });
                                            setSavingId(null);
                                        }}
                                        disabled={savingId === `global-${index}`}
                                        className="text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-colors p-1.5 rounded-lg disabled:opacity-50"
                                        title="Eliminar alerta global"
                                    >
                                        {savingId === `global-${index}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-[11px] text-slate-600 italic text-center py-3 bg-slate-900/40 rounded-lg border border-slate-700/30">
                        Sin alertas globales. Usa 🔔 en el Dashboard.
                    </p>
                )}
            </div>

            {/* ── Notification History ──────────────── */}
            <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-3 md:p-4">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wider flex items-center gap-1.5">
                        <History className="w-3.5 h-3.5 text-blue-400" /> Historial
                    </h3>
                    {!logsLoading && logs.length > 0 && (
                        <span className="text-[10px] text-slate-500 bg-slate-900/80 px-2 py-0.5 rounded-full border border-slate-700/50 font-bold">
                            {logs.length}
                        </span>
                    )}
                </div>

                {logsLoading ? (
                    <p className="text-[11px] text-slate-500 italic text-center py-3">Cargando...</p>
                ) : logs.length === 0 ? (
                    <p className="text-[11px] text-slate-600 italic text-center py-3 bg-slate-900/40 rounded-lg border border-slate-700/30">
                        Sin notificaciones enviadas aún.
                    </p>
                ) : (
                    <div className="space-y-1.5 max-h-60 md:max-h-72 overflow-y-auto pr-0.5">
                        {logs.map((log) => {
                            const dateStr = log.sentAt
                                ? log.sentAt.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })
                                : "—";
                            const timeStr = log.sentAt
                                ? log.sentAt.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
                                : "";
                            return (
                                <div key={log.id} className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-2.5">
                                    {/* Date/time + badge */}
                                    <div className="flex justify-between items-center gap-2 mb-2">
                                        <div className="flex items-center gap-1.5">
                                            <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                                            <span className="text-sm font-bold text-white">{dateStr} · {timeStr}</span>
                                        </div>
                                        {log.globalAlertTriggered && (
                                            <span className="flex items-center gap-0.5 text-[9px] bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded-full font-bold">
                                                <AlertTriangle className="w-2.5 h-2.5" /> Global
                                            </span>
                                        )}
                                    </div>
                                    {/* Triggered alerts — prominent */}
                                    {log.triggeredAssets.length > 0 && (
                                        <div className="space-y-1">
                                            {log.triggeredAssets.map((msg, i) => (
                                                <p key={i} className="text-[11px] font-bold text-slate-200 bg-slate-800 px-2.5 py-1.5 rounded-lg">{msg}</p>
                                            ))}
                                        </div>
                                    )}
                                    {log.triggeredWatchlistAlerts?.length > 0 && (
                                        <div className="space-y-1 mt-1">
                                            {log.triggeredWatchlistAlerts.map((msg, i) => (
                                                <p key={i} className="text-[11px] font-bold text-blue-300 bg-blue-900/30 px-2.5 py-1.5 rounded-lg">{msg}</p>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
