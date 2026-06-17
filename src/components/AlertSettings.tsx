import { useState, memo, useMemo } from "react";
import { Trash2, Edit2, Repeat, Clock, History, CheckCircle, AlertTriangle, TrendingUp, TrendingDown, Loader2, Eye, Plus, Sun, Send, BarChart2, Settings, Check, Search, RefreshCw } from "lucide-react";
import { AlertConfig, GlobalAlert, InvestmentAlert, WatchlistAlert, CandleAlert } from "../hooks/useAlerts";
import type { SaleRecord } from "../lib/constants";
import { usePortfolio } from "../hooks/usePortfolio";
import { useNotificationLogs } from "../hooks/useNotificationLogs";
import { useBinanceSymbols } from "../hooks/useBinanceSymbols";
import { fmtUSD, fmtPrice } from "../lib/format";
import { FIREBASE_FUNCTIONS_URL } from "../lib/firebase";

interface AlertSettingsProps {
    config: AlertConfig;
    saveConfig: (newConfig: AlertConfig) => Promise<boolean>;
    onRefresh?: () => void;
    refreshing?: boolean;
    onEditGlobal?: (index: number) => void;
    onEditInvestment?: (investmentId: string, index: number) => void;
    onOpenWatchlist?: () => void;
    onEditWatchlistAlert?: (coin: string, index: number) => void;
    onOpenCandleAlert?: () => void;
    onEditCandleAlert?: (coin: string, index: number) => void;
    sales?: SaleRecord[];
    totalPnl?: number;
    selectedCoins?: string[];
    onSelectedCoinsChange?: (coins: string[]) => void;
    prices: Record<string, number>;
}

function AlertSettings({ config, saveConfig, onRefresh, refreshing, onEditGlobal, onEditInvestment, onOpenWatchlist, onEditWatchlistAlert, onOpenCandleAlert, onEditCandleAlert, sales, totalPnl = 0, selectedCoins = [], onSelectedCoinsChange, prices }: AlertSettingsProps) {
    const { portfolio } = usePortfolio();
    const { logs, loading: logsLoading } = useNotificationLogs(15);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [showTickerConfig, setShowTickerConfig] = useState(false);
    const [draftCoins, setDraftCoins] = useState<string[]>(selectedCoins);
    const [coinSearch, setCoinSearch] = useState("");
    const { symbols, loading: symbolsLoading, error: symbolsError } = useBinanceSymbols();

    const globalCount = config.globalAlerts?.length ?? 0;
    const individualCount = config.investmentAlerts
        ? Object.values(config.investmentAlerts).reduce((sum, a) => sum + (Array.isArray(a) ? a.length : 0), 0)
        : 0;

    const filteredSymbols = useMemo(() => {
        if (!symbols) return [];
        if (!coinSearch.trim()) return symbols;
        const q = coinSearch.trim().toUpperCase();
        return symbols.filter((s) => s.includes(q));
    }, [symbols, coinSearch]);

    const toggleDraftCoin = (coin: string) => {
        setDraftCoins((prev) =>
            prev.includes(coin) ? prev.filter((c) => c !== coin) : [...prev, coin]
        );
    };

    const handleSaveTickerCoins = () => {
        if (draftCoins.length === 0) return;
        try {
            localStorage.setItem("ticker_selected_coins", JSON.stringify(draftCoins));
        } catch { /* ignore */ }
        onSelectedCoinsChange?.(draftCoins);
    };

    return (
        <div className="space-y-3 md:space-y-4">

            {/* ── Header with Refresh ────────────────────── */}
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <Send className="w-4 h-4 text-yellow-400" /> Configuración de Alertas
                </h2>
                {onRefresh && (
                    <button
                        onClick={onRefresh}
                        disabled={refreshing}
                        className="flex items-center gap-1.5 bg-yellow-600 hover:bg-yellow-500 text-slate-900 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-lg active:scale-95 disabled:opacity-60"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
                        <span className="hidden sm:inline">Actualizar Precios</span>
                    </button>
                )}
            </div>

            {/* ── Ticker Coin Selector ──────────────────── */}
            <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-3 md:p-4">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wider flex items-center gap-1.5">
                        <Settings className="w-3.5 h-3.5 text-yellow-400" /> Monedas en Ticker
                    </h3>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-500 bg-slate-900/80 px-2 py-0.5 rounded-full border border-slate-700/50 font-bold">
                            {selectedCoins.length}
                        </span>
                        <button
                            onClick={() => {
                                if (showTickerConfig) {
                                    setDraftCoins(selectedCoins);
                                    setCoinSearch("");
                                }
                                setShowTickerConfig(!showTickerConfig);
                            }}
                            className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg transition-colors ${
                                showTickerConfig
                                    ? "text-yellow-400 bg-yellow-500/20 border border-yellow-500/30"
                                    : "text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 hover:bg-yellow-500/20"
                            }`}
                        >
                            {showTickerConfig ? "Cancelar" : "Configurar"}
                        </button>
                    </div>
                </div>

                {/* Current coins display */}
                {!showTickerConfig && (
                    <div className="flex flex-wrap gap-1.5">
                        {selectedCoins.map((coin) => (
                            <span key={coin} className="inline-flex items-center gap-1 text-[11px] font-bold text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 px-2 py-1 rounded-md">
                                {coin}
                                <button
                                    onClick={() => {
                                        const updated = selectedCoins.filter((c) => c !== coin);
                                        if (updated.length === 0) return;
                                        try { localStorage.setItem("ticker_selected_coins", JSON.stringify(updated)); } catch { /* ignore */ }
                                        onSelectedCoinsChange?.(updated);
                                    }}
                                    className="ml-0.5 text-yellow-500/60 hover:text-yellow-300 transition-colors"
                                    title={`Quitar ${coin}`}
                                >
                                    ×
                                </button>
                            </span>
                        ))}
                    </div>
                )}

                {/* Expanded config panel */}
                {showTickerConfig && (
                    <div className="space-y-3">
                        {/* Search */}
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                                type="text"
                                placeholder="Buscar moneda..."
                                value={coinSearch}
                                onChange={(e) => setCoinSearch(e.target.value)}
                                className="w-full bg-slate-900/80 border border-slate-700/50 rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-yellow-500/50"
                                autoFocus
                            />
                        </div>

                        {/* Selected count */}
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] text-slate-500">
                                {draftCoins.length} seleccionada{draftCoins.length !== 1 ? "s" : ""}
                            </span>
                        </div>

                        {/* Coin list */}
                        <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
                            {symbolsLoading && (
                                <div className="flex items-center justify-center py-6 text-slate-500 text-sm">
                                    <Loader2 size={16} className="animate-spin mr-2" />
                                    Cargando monedas...
                                </div>
                            )}
                            {symbolsError && (
                                <div className="text-center py-6 text-red-400 text-sm">
                                    Error: {symbolsError}
                                </div>
                            )}
                            {!symbolsLoading && !symbolsError && filteredSymbols.length === 0 && (
                                <div className="text-center py-6 text-slate-500 text-sm">
                                    No se encontraron monedas
                                </div>
                            )}
                            {!symbolsLoading && !symbolsError && filteredSymbols.map((coin) => {
                                const isSelected = draftCoins.includes(coin);
                                return (
                                    <button
                                        key={coin}
                                        onClick={() => toggleDraftCoin(coin)}
                                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                                            isSelected
                                                ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                                                : "bg-slate-900/60 text-slate-400 border border-slate-700/40 hover:border-slate-600"
                                        }`}
                                    >
                                        <span>{coin}</span>
                                        {isSelected && <Check size={14} className="text-yellow-400" />}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Save button */}
                        <button
                            onClick={handleSaveTickerCoins}
                            disabled={draftCoins.length === 0}
                            className="w-full px-4 py-2 rounded-lg bg-yellow-500 text-black font-medium text-sm hover:bg-yellow-400 transition-colors disabled:opacity-50"
                        >
                            Guardar selección
                        </button>
                    </div>
                )}
            </div>

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
                                    <div className="flex flex-wrap gap-1.5">
                                        {(alerts as WatchlistAlert[]).sort((a, b) => {
                                            const cp = prices[coin] ?? 0;
                                            return Math.abs(a.targetValue - cp) - Math.abs(b.targetValue - cp);
                                        }).map((alert, index) => {
                                            const cp = prices[coin] ?? 0;
                                            const isOnHold = alert.isPersistent && (
                                                alert.direction === 'up' ? cp >= alert.targetValue : cp <= alert.targetValue
                                            );
                                            return (
                                            <div key={index} className="flex flex-col bg-slate-800/60 px-2 py-1.5 rounded-md">
                                                <div className="flex items-center gap-1.5">
                                                    {(() => { const showUp = isOnHold ? alert.direction !== 'up' : alert.direction === 'up'; return (
                                                    <span className={`text-[11px] font-bold flex items-center gap-0.5 ${showUp ? 'text-green-400' : 'text-red-400'}`}>
                                                        {showUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                                        {fmtPrice(alert.targetValue)}
                                                    </span>
                                                    ); })()}
                                                    {alert.isPersistent ? (
                                                        <span className={`text-[8px] px-1 py-0.5 rounded-full font-bold ${isOnHold ? 'bg-orange-500/20 text-orange-400' : (alert.direction === 'up' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400')}`}>
                                                            {isOnHold ? '⏸P' : '▶P'}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[8px] bg-slate-700/50 text-slate-500 px-1 py-0.5 rounded-full font-bold">1×</span>
                                                    )}
                                                    {onEditWatchlistAlert && (
                                                        <button
                                                            onClick={() => onEditWatchlistAlert(coin, index)}
                                                            className="p-1 rounded text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                                                        >
                                                            <Edit2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
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
                                                        className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                                                    >
                                                        {savingId === `watch-${coin}-${index}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                                    </button>
                                                </div>
                                                {alert.note && <span className="text-[9px] text-slate-400 italic mt-0.5">📝 {alert.note}</span>}
                                            </div>
                                            );
                                        })}
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

            {/* ── Candle Alerts ─────────────────────────── */}
            <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-3 md:p-4">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wider flex items-center gap-1.5">
                        <BarChart2 className="w-3.5 h-3.5 text-purple-400" /> Alertas de Vela
                    </h3>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-500 bg-slate-900/80 px-2 py-0.5 rounded-full border border-slate-700/50 font-bold">
                            {Object.values(config.candleAlerts || {}).reduce((sum, a) => sum + a.length, 0)}
                        </span>
                        {onOpenCandleAlert && (
                            <button
                                onClick={onOpenCandleAlert}
                                className="flex items-center gap-1 text-[10px] font-bold text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-1 rounded-lg hover:bg-purple-500/20 transition-colors"
                            >
                                <Plus className="w-3 h-3" /> Nueva
                            </button>
                        )}
                    </div>
                </div>
                {config.candleAlerts && Object.keys(config.candleAlerts).length > 0 ? (
                    <div className="space-y-2">
                        {Object.entries(config.candleAlerts).map(([coin, alerts]) => {
                            if (!Array.isArray(alerts) || alerts.length === 0) return null;
                            return (
                                <div key={coin} className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-2.5">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-purple-400 text-sm">{coin}</span>
                                        </div>
                                        <span className="text-[9px] text-slate-500 font-bold">{alerts.length} alerta{alerts.length !== 1 ? "s" : ""}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {(alerts as CandleAlert[]).map((alert, index) => {
                                            const directionEmoji = alert.direction === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />;
                                            return (
                                            <div key={index} className="flex flex-col bg-slate-800/60 px-2 py-1.5 rounded-md">
                                                <div className="flex items-center gap-1.5">
                                                    <span className={`text-[11px] font-bold flex items-center gap-0.5 ${alert.direction === 'up' ? 'text-green-400' : 'text-red-400'}`}>
                                                        {directionEmoji}
                                                        {alert.targetPercent}% ({alert.interval})
                                                    </span>
                                                    {alert.isPersistent ? (
                                                        <span className="text-[8px] px-1 py-0.5 rounded-full font-bold bg-green-500/20 text-green-400">
                                                            P
                                                        </span>
                                                    ) : (
                                                        <span className="text-[8px] bg-slate-700/50 text-slate-500 px-1 py-0.5 rounded-full font-bold">1×</span>
                                                    )}
                                                    {onEditCandleAlert && (
                                                        <button
                                                            onClick={() => onEditCandleAlert(coin, index)}
                                                            className="p-1 rounded text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                                                        >
                                                            <Edit2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={async () => {
                                                            if (savingId) return;
                                                            setSavingId(`candle-${coin}-${index}`);
                                                            const newCandleAlerts = { ...(config.candleAlerts || {}) };
                                                            const updated = (newCandleAlerts[coin] || []).filter((_, i) => i !== index);
                                                            if (updated.length === 0) delete newCandleAlerts[coin];
                                                            else newCandleAlerts[coin] = updated;
                                                            await saveConfig({ ...config, candleAlerts: newCandleAlerts });
                                                            setSavingId(null);
                                                        }}
                                                        disabled={savingId === `candle-${coin}-${index}`}
                                                        className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                                                    >
                                                        {savingId === `candle-${coin}-${index}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                                    </button>
                                                </div>
                                                {alert.note && <span className="text-[9px] text-slate-400 italic mt-0.5">📝 {alert.note}</span>}
                                            </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <p className="text-[11px] text-slate-600 italic text-center py-3 bg-slate-900/40 rounded-lg border border-slate-700/30">
                        Sin alertas de vela. Usa "+ Nueva" para monitorear variaciones.
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
                        {Object.entries(config.investmentAlerts)
                            .map(([id, alerts]) => {
                                const inv = portfolio.find((i) => i.id === id);
                                const realSaleId = id.startsWith('sale_') ? id.slice(5) : id;
                                const sale = !inv ? sales?.find((s) => s.id === realSaleId) : undefined;
                                const cp = inv ? (prices[inv.coin] || inv.buyPrice) : (sale ? (prices[sale.coin] || sale.sellPrice) : 0);
                                const pnlPct = inv && inv.invested > 0
                                    ? ((cp * inv.quantity - inv.invested) / inv.invested) * 100
                                    : sale && sale.usdtReceived > 0
                                        ? ((sale.usdtReceived - sale.quantity * cp) / sale.usdtReceived) * 100
                                        : null;
                                return { id, alerts, pnlPct };
                            })
                            .filter(({ alerts }) => Array.isArray(alerts) && alerts.length > 0)
                            .sort((a, b) => (b.pnlPct ?? -Infinity) - (a.pnlPct ?? -Infinity))
                            .map(({ id, alerts }) => {
                            const inv = portfolio.find((i) => i.id === id);
                            const realSaleId = id.startsWith('sale_') ? id.slice(5) : id;
                            const sale = !inv ? sales?.find((s) => s.id === realSaleId) : undefined;
                            const coinName = inv?.coin ?? sale?.coin ?? config.saleMeta?.[id]?.coin ?? "Desconocido";
                            const currentPrice = inv ? (prices[inv.coin] || inv.buyPrice) : (sale ? (prices[sale.coin] || sale.sellPrice) : 0);
                            const pnlUsd = inv
                                ? currentPrice * inv.quantity - inv.invested
                                : sale ? sale.usdtReceived - sale.quantity * currentPrice : null;
                            const pnlPct = inv && inv.invested > 0
                                ? ((currentPrice * inv.quantity - inv.invested) / inv.invested) * 100
                                : sale && sale.usdtReceived > 0
                                    ? ((sale.usdtReceived - sale.quantity * currentPrice) / sale.usdtReceived) * 100
                                    : null;
                            if (!Array.isArray(alerts) || alerts.length === 0) return null;

                            return (
                                <div key={id} className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-2.5">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-bold text-yellow-400 text-sm">{coinName}</span>
                                            {currentPrice > 0 && (
                                                <span className="text-base font-bold text-white font-mono">
                                                    {fmtPrice(currentPrice)}
                                                </span>
                                            )}
                                            {pnlUsd !== null && pnlPct !== null && (
                                                <span className={`text-xs font-bold font-mono ${pnlUsd >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                    {pnlUsd >= 0 ? '+' : ''}{fmtUSD(pnlUsd)} ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%)
                                                </span>
                                            )}
                                            {id.startsWith('sale_') && sale && sale.sellPrice > 0 && (
                                                <span className="text-[9px] text-slate-400 bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded font-bold">
                                                    venta @ {fmtPrice(sale.sellPrice)}
                                                </span>
                                            )}
                                            {!id.startsWith('sale_') && inv && inv.buyPrice > 0 && (
                                                <span className="text-[9px] text-slate-400 bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded font-bold">
                                                    compra @ {fmtPrice(inv.buyPrice)}
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-[9px] text-slate-500 font-bold">
                                            {alerts.length} alerta{alerts.length !== 1 ? "s" : ""}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {[...alerts].sort((a, b) => {
                                            const currentPct = pnlPct ?? 0;
                                            const va = a.type === 'price'
                                                ? Math.abs((a.targetValue || 0) - currentPrice)
                                                : Math.abs((a.targetPercent || 0) - currentPct);
                                            const vb = b.type === 'price'
                                                ? Math.abs((b.targetValue || 0) - currentPrice)
                                                : Math.abs((b.targetPercent || 0) - currentPct);
                                            return va - vb;
                                        }).map((alert: InvestmentAlert, index: number) => {
                                            const originalIndex = (alerts as InvestmentAlert[]).indexOf(alert);
                                            const roi = inv
                                                ? (inv.invested > 0 ? ((currentPrice * inv.quantity - inv.invested) / inv.invested) * 100 : 0)
                                                : (sale && sale.usdtReceived > 0 ? ((sale.usdtReceived - sale.quantity * currentPrice) / sale.usdtReceived) * 100 : 0);
                                            const isOnHold = alert.isPersistent && (
                                                alert._lastSide !== undefined
                                                    ? (alert.direction === 'up' ? alert._lastSide === 'above' : alert._lastSide === 'below')
                                                    : (alert.type === 'price'
                                                        ? (alert.direction === 'up' ? currentPrice >= (alert.targetValue || 0) : currentPrice <= (alert.targetValue || 0))
                                                        : (alert.direction === 'up' ? roi >= (alert.targetPercent || 0) : roi <= (alert.targetPercent || 0)))
                                            );
                                            return (
                                            <div key={index} className="flex flex-col bg-slate-800/60 px-2 py-1.5 rounded-md">
                                                <div className="flex items-center gap-1.5">
                                                    {(() => { const showUp = isOnHold ? alert.direction !== 'up' : alert.direction === 'up'; return (
                                                    <span className={`text-[11px] font-bold flex items-center gap-0.5 ${showUp ? 'text-green-400' : 'text-red-400'}`}>
                                                        {showUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                                        {alert.type === 'price' ? fmtPrice(alert.targetValue || 0) : `${alert.targetPercent >= 0 ? "+" : ""}${alert.targetPercent}%`}
                                                    </span>
                                                    ); })()}
                                                    <span className="text-[8px] text-slate-500 uppercase font-bold bg-slate-900/60 px-1 py-0.5 rounded border border-slate-700/50">
                                                        {alert.type === 'price' ? '$' : '%'}
                                                    </span>
                                                    {alert.isPersistent ? (
                                                        <span className={`text-[8px] px-1 py-0.5 rounded-full font-bold ${isOnHold ? 'bg-orange-500/20 text-orange-400' : (alert.direction === 'up' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400')}`}>
                                                            {isOnHold ? '⏸P' : '▶P'}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[8px] bg-slate-700/50 text-slate-500 px-1 py-0.5 rounded-full font-bold">1×</span>
                                                    )}
                                                    <button
                                                        onClick={() => onEditInvestment && onEditInvestment(id, originalIndex)}
                                                        className="p-1 rounded text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                                                        title="Editar"
                                                    >
                                                        <Edit2 className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        onClick={async () => {
                                                            if (savingId) return;
                                                            setSavingId(`inv-${id}-${originalIndex}`);
                                                            const newAlerts = { ...config.investmentAlerts };
                                                            const updated = (newAlerts[id] || []).filter((_, i) => i !== originalIndex);
                                                            if (updated.length === 0) delete newAlerts[id];
                                                            else newAlerts[id] = updated;
                                                            await saveConfig({ ...config, investmentAlerts: newAlerts });
                                                            setSavingId(null);
                                                        }}
                                                        disabled={savingId === `inv-${id}-${originalIndex}`}
                                                        className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                                                        title="Eliminar"
                                                    >
                                                        {savingId === `inv-${id}-${index}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                                    </button>
                                                </div>
                                                {alert.note && <span className="text-[9px] text-slate-400 italic mt-0.5">📝 {alert.note}</span>}
                                                {id.startsWith('sale_') && alert.type === 'pnl' && sale && sale.usdtReceived > 0 && sale.quantity > 0 && (
                                                    (() => {
                                                        const tp = (sale.usdtReceived * (1 - (alert.targetPercent || 0) / 100)) / sale.quantity;
                                                        return (
                                                            <span className="text-[9px] text-slate-500 mt-0.5">
                                                                @ {fmtPrice(tp)}
                                                            </span>
                                                        );
                                                    })()
                                                )}
                                                {!id.startsWith('sale_') && alert.type === 'pnl' && inv && inv.invested > 0 && inv.quantity > 0 && (
                                                    (() => {
                                                        const tp = inv.invested * (1 + (alert.targetPercent || 0) / 100) / inv.quantity;
                                                        return (
                                                            <span className="text-[9px] text-slate-500 mt-0.5">
                                                                @ {fmtPrice(tp)}
                                                            </span>
                                                        );
                                                    })()
                                                )}
                                                {!isOnHold && (() => {
                                                    let gap: number | null = null;
                                                    if (alert.type === 'pnl') {
                                                        gap = alert.direction === 'up'
                                                            ? (alert.targetPercent || 0) - roi
                                                            : roi - (alert.targetPercent || 0);
                                                    } else if (alert.type === 'price' && currentPrice > 0) {
                                                        gap = alert.direction === 'up'
                                                            ? ((alert.targetValue || 0) - currentPrice) / currentPrice * 100
                                                            : (currentPrice - (alert.targetValue || 0)) / currentPrice * 100;
                                                    }
                                                    if (gap === null || gap <= 0) return null;
                                                    return (
                                                        <span className="text-[9px] text-blue-400/70 mt-0.5">
                                                            falta {gap.toFixed(1)}%
                                                        </span>
                                                    );
                                                })()}
                                            </div>
                                            );
                                        })}
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

            {/* ── Global Alerts + Daily Report ─────── */}
            <div className="grid grid-cols-2 gap-3">
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
                        {config.globalAlerts.map((alertData: GlobalAlert, index: number) => {
                            const isOnHold = alertData.isPersistent && (
                                alertData.direction === 'up' ? totalPnl >= alertData.targetAmount : totalPnl <= alertData.targetAmount
                            );
                            return (
                            <div key={`global-${index}`} className="flex items-center justify-between bg-slate-900/60 border border-slate-700/40 rounded-lg px-3 py-2">
                                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                    <div className="flex flex-col">
                                        {(() => { const showUp = isOnHold ? alertData.direction !== 'up' : alertData.direction === 'up'; return (
                                        <span className={`flex items-center gap-1 text-xs font-bold whitespace-nowrap ${showUp ? "text-green-400" : "text-red-400"}`}>
                                            {showUp ? '🔼' : '🔽'}
                                            {alertData.targetAmount >= 0 ? "+" : "-"}{fmtUSD(Math.abs(alertData.targetAmount))}
                                        </span>
                                        ); })()}
                                        {alertData.note && (
                                            <span className="text-[10px] text-slate-400 italic mt-0.5">📝 {alertData.note}</span>
                                        )}
                                    </div>
                                    {alertData.isPersistent ? (
                                        <span className={`flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap border ${isOnHold ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' : (alertData.direction === 'up' ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30')}`}>
                                            <Repeat className="w-2.5 h-2.5" /> {isOnHold ? 'En Pausa' : 'Armada'}
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
                            );
                        })}
                    </div>
                ) : (
                    <p className="text-[11px] text-slate-600 italic text-center py-3 bg-slate-900/40 rounded-lg border border-slate-700/30">
                        Sin alertas globales. Usa 🔔 en Spot.
                    </p>
                )}
            </div>

            {/* ── Daily Report ──────────────────────── */}
            <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-3 md:p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Sun className="w-3.5 h-3.5 text-yellow-400" />
                        <div>
                            <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wider">Resumen Diario</h3>
                            <p className="text-[10px] text-slate-500 mt-0.5">Envía el portafolio completo a las 8:00 am</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {config.dailyReportEnabled && (
                            <button
                                onClick={async () => {
                                    if (savingId) return;
                                    setSavingId("testDailyReport");
                                    try {
                                        await fetch(`${FIREBASE_FUNCTIONS_URL}/testDailyReport`);
                                    } catch {}
                                    setSavingId(null);
                                }}
                                disabled={!!savingId}
                                className="text-[10px] font-bold text-slate-400 hover:text-yellow-300 border border-slate-700 rounded-lg px-2 py-1 transition-colors disabled:opacity-50 flex items-center gap-1"
                                title="Enviar resumen ahora"
                            >
                                {savingId === "testDailyReport"
                                    ? <Loader2 className="w-3 h-3 animate-spin" />
                                    : <Send className="w-3 h-3" />}
                                Probar
                            </button>
                        )}
                        <button
                            onClick={async () => {
                                if (savingId) return;
                                setSavingId("dailyReport");
                                await saveConfig({ ...config, dailyReportEnabled: !config.dailyReportEnabled });
                                setSavingId(null);
                            }}
                            disabled={savingId === "dailyReport"}
                            className={`relative w-10 h-5.5 rounded-full transition-colors flex items-center px-0.5 ${
                                config.dailyReportEnabled ? "bg-yellow-500" : "bg-slate-600"
                            } disabled:opacity-50`}
                            title={config.dailyReportEnabled ? "Desactivar resumen diario" : "Activar resumen diario"}
                        >
                            {savingId === "dailyReport" ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-white mx-auto" />
                            ) : (
                                <span className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${config.dailyReportEnabled ? "translate-x-4" : "translate-x-0"}`} />
                            )}
                        </button>
                    </div>
                </div>
            </div>
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
                                <div key={log.id} className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-2">
                                    {/* Date/time + badge */}
                                    <div className="flex justify-between items-center gap-2 mb-1">
                                        <div className="flex items-center gap-1.5">
                                            <CheckCircle className="w-3 h-3 text-green-500 shrink-0" />
                                            <span className="text-xs font-bold text-white">{dateStr} · {timeStr}</span>
                                        </div>
                                        {log.globalAlertTriggered && (
                                            <span className="flex items-center gap-0.5 text-[9px] bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded-full font-bold">
                                                <AlertTriangle className="w-2.5 h-2.5" /> Global
                                            </span>
                                        )}
                                    </div>
                                    {/* Triggered alerts — prominent */}
                                    {log.triggeredAssets.length > 0 && (
                                        <div className="space-y-0.5">
                                            {log.triggeredAssets.map((msg, i) => (
                                                <p key={i} className="text-[11px] font-bold text-slate-200 bg-slate-800 px-2 py-1 rounded-md">{msg}</p>
                                            ))}
                                        </div>
                                    )}
                                    {log.triggeredWatchlistAlerts?.length > 0 && (
                                        <div className="space-y-0.5 mt-0.5">
                                            {log.triggeredWatchlistAlerts.map((msg, i) => (
                                                <p key={i} className="text-[11px] font-bold text-blue-300 bg-blue-900/30 px-2 py-1 rounded-md">{msg}</p>
                                            ))}
                                        </div>
                                    )}
                                    {(log as any).triggeredCandleAlerts?.length > 0 && (
                                        <div className="space-y-0.5 mt-0.5">
                                            {(log as any).triggeredCandleAlerts.map((msg: string, i: number) => (
                                                <p key={i} className="text-[11px] font-bold text-purple-300 bg-purple-900/30 px-2 py-1 rounded-md">{msg}</p>
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

export default memo(AlertSettings);
