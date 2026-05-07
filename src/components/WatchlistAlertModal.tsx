import { useState, useEffect, useRef } from "react";
import { X, Eye, Trash2, Edit2, Plus, Repeat, Clock, Check, Search, Loader2 } from "lucide-react";
import { WatchlistAlert } from "../hooks/useAlerts";
import { fmtPrice } from "../lib/format";

interface BinanceCoin {
    symbol: string; // "BTC"
    price: number;
}

interface WatchlistAlertModalProps {
    currentAlerts: Record<string, WatchlistAlert[]>;
    onSaveAlerts: (alerts: Record<string, WatchlistAlert[]>) => Promise<void>;
    onClose: () => void;
    initialEditCoin?: string;
    initialEditIndex?: number;
}

export default function WatchlistAlertModal({ currentAlerts, onSaveAlerts, onClose, initialEditCoin, initialEditIndex }: WatchlistAlertModalProps) {
    const [draftAlerts, setDraftAlerts] = useState<Record<string, WatchlistAlert[]>>(
        JSON.parse(JSON.stringify(currentAlerts))
    );
    const [selectedCoin, setSelectedCoin] = useState<string>("");
    const [selectedPrice, setSelectedPrice] = useState<number>(0);
    const [targetValue, setTargetValue] = useState<number>(0);
    const [direction, setDirection] = useState<'up' | 'down'>('up');
    const [isPersistent, setIsPersistent] = useState(false);
    const [note, setNote] = useState<string>("");
    const [saving, setSaving] = useState(false);

    // Binance search state
    const [binanceCoins, setBinanceCoins] = useState<BinanceCoin[]>([]);
    const [coinsLoading, setCoinsLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [showDropdown, setShowDropdown] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);

    // Load all USDT pairs from Binance on mount
    useEffect(() => {
        const load = async () => {
            try {
                const res = await fetch("https://api.binance.com/api/v3/ticker/price");
                const data: { symbol: string; price: string }[] = await res.json();
                const usdtCoins = data
                    .filter((d) => d.symbol.endsWith("USDT"))
                    .map((d) => ({
                        symbol: d.symbol.replace("USDT", ""),
                        price: parseFloat(d.price),
                    }))
                    .sort((a, b) => a.symbol.localeCompare(b.symbol));
                setBinanceCoins(usdtCoins);

                if (initialEditCoin !== undefined && initialEditIndex !== undefined) {
                    // Pre-load form for editing a specific alert
                    const alertData = currentAlerts[initialEditCoin]?.[initialEditIndex];
                    if (alertData) {
                        const coinData = usdtCoins.find((c) => c.symbol === initialEditCoin);
                        setSelectedCoin(initialEditCoin);
                        setSelectedPrice(coinData?.price ?? 0);
                        setTargetValue(alertData.targetValue);
                        setDirection(alertData.direction);
                        setIsPersistent(alertData.isPersistent ?? false);
                        setNote(alertData.note ?? "");
                        setSearch(initialEditCoin);
                        setDraftAlerts((prev) => {
                            const updated = { ...prev };
                            const filtered = (updated[initialEditCoin] || []).filter((_, i) => i !== initialEditIndex);
                            if (filtered.length === 0) delete updated[initialEditCoin];
                            else updated[initialEditCoin] = filtered;
                            return updated;
                        });
                        return;
                    }
                }

                // Default to BTC
                const btc = usdtCoins.find((c) => c.symbol === "BTC");
                if (btc) {
                    setSelectedCoin(btc.symbol);
                    setSelectedPrice(btc.price);
                    setTargetValue(btc.price);
                    setSearch(btc.symbol);
                }
            } catch (e) {
                console.error("Error loading Binance coins", e);
            } finally {
                setCoinsLoading(false);
            }
        };
        load();
    }, []);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    const filteredCoins = binanceCoins
        .filter((c) => c.symbol.toUpperCase().includes(search.toUpperCase()))
        .slice(0, 10);

    const handleSelectCoin = (coin: BinanceCoin) => {
        setSelectedCoin(coin.symbol);
        setSelectedPrice(coin.price);
        setTargetValue(coin.price);
        setSearch(coin.symbol);
        setDirection('up');
        setShowDropdown(false);
    };

    const handleTargetChange = (val: number) => {
        setTargetValue(val);
        if (selectedPrice > 0) setDirection(val >= selectedPrice ? 'up' : 'down');
    };

    const handleAdd = () => {
        if (!selectedCoin || isNaN(targetValue) || targetValue <= 0) return;
        const existing = draftAlerts[selectedCoin] || [];
        setDraftAlerts({
            ...draftAlerts,
            [selectedCoin]: [...existing, {
                targetValue,
                direction,
                isPersistent,
                ...(note.trim() ? { note: note.trim() } : {}),
            }],
        });
        setTargetValue(selectedPrice);
        setIsPersistent(false);
        setNote("");
    };

    const handleRemove = (coin: string, index: number) => {
        const updated = (draftAlerts[coin] || []).filter((_, i) => i !== index);
        const newDraft = { ...draftAlerts };
        if (updated.length === 0) delete newDraft[coin];
        else newDraft[coin] = updated;
        setDraftAlerts(newDraft);
    };

    const handleEdit = (coin: string, index: number) => {
        const alert = draftAlerts[coin][index];
        const coinData = binanceCoins.find((c) => c.symbol === coin);
        setSelectedCoin(coin);
        setSelectedPrice(coinData?.price ?? 0);
        setTargetValue(alert.targetValue);
        setDirection(alert.direction);
        setIsPersistent(alert.isPersistent ?? false);
        setNote(alert.note ?? "");
        setSearch(coin);
        handleRemove(coin, index);
    };

    const handleSave = async () => {
        setSaving(true);
        await onSaveAlerts(draftAlerts);
        setSaving(false);
        onClose();
    };

    const totalAlerts = Object.values(draftAlerts).reduce((sum, arr) => sum + arr.length, 0);

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto">

                {/* Header */}
                <div className="flex justify-between items-center px-4 py-3 border-b border-slate-800 sticky top-0 bg-slate-900/95 backdrop-blur-sm z-10">
                    <div className="flex items-center gap-2.5">
                        <Eye className="w-4 h-4 text-blue-400 shrink-0" />
                        <div>
                            <h2 className="text-base font-bold text-white">Alertas Watchlist</h2>
                            <p className="text-[11px] text-slate-400">Cualquier par USDT de Binance</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-slate-800 shrink-0 -mr-1">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="px-4 py-3 space-y-3">
                    {/* Active watchlist alerts */}
                    <div>
                        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                            Alertas Activas ({totalAlerts})
                        </h3>
                        {totalAlerts === 0 ? (
                            <p className="text-[11px] text-slate-600 italic text-center py-3 bg-slate-800/50 rounded-lg border border-slate-800">
                                No hay alertas watchlist aún
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {Object.entries(draftAlerts).map(([coin, alerts]) => (
                                    <div key={coin} className="bg-slate-800 border border-slate-700 rounded-lg p-2">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-blue-400 text-xs">{coin}</span>
                                                {(() => { const c = binanceCoins.find(b => b.symbol === coin); return c ? <span className="text-[11px] text-slate-400 font-mono">{fmtPrice(c.price)}</span> : null; })()}
                                            </div>
                                            <span className="text-[9px] text-slate-500 font-bold">{alerts.length} alerta{alerts.length !== 1 ? "s" : ""}</span>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {alerts.map((alert, index) => {
                                                const cp = binanceCoins.find(b => b.symbol === coin)?.price ?? 0;
                                                const isOnHold = alert.isPersistent && (
                                                    alert.direction === 'up' ? cp >= alert.targetValue : cp <= alert.targetValue
                                                );
                                                return (
                                                <div key={index} className="flex flex-col bg-slate-900/80 px-2 py-1.5 rounded-md">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className={`text-[11px] font-bold ${(isOnHold ? alert.direction !== 'up' : alert.direction === 'up') ? 'text-green-400' : 'text-red-400'}`}>
                                                            {(isOnHold ? alert.direction !== 'up' : alert.direction === 'up') ? '🔼' : '🔽'} {fmtPrice(alert.targetValue)}
                                                        </span>
                                                        {alert.isPersistent ? (
                                                            <span className={`text-[8px] px-1 py-0.5 rounded-full font-bold ${isOnHold ? 'bg-orange-500/20 text-orange-400' : (alert.direction === 'up' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400')}`}>
                                                                {isOnHold ? '⏸P' : '▶P'}
                                                            </span>
                                                        ) : (
                                                            <span className="text-[8px] bg-slate-700 text-slate-500 px-1 py-0.5 rounded-full font-bold">1×</span>
                                                        )}
                                                        <button onClick={() => handleEdit(coin, index)} className="p-1 rounded text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 transition-colors">
                                                            <Edit2 className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button onClick={() => handleRemove(coin, index)} className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                    {alert.note && <span className="text-[9px] text-slate-400 italic mt-0.5">📝 {alert.note}</span>}
                                                </div>
                                                );
                                            })}
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

                        {/* Coin search */}
                        <label className="block text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-bold">Buscar Moneda</label>
                        <div ref={searchRef} className="relative mb-2">
                            <div className="relative">
                                {coinsLoading ? (
                                    <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 animate-spin" />
                                ) : (
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                                )}
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(e) => {
                                        setSearch(e.target.value);
                                        setShowDropdown(true);
                                    }}
                                    onFocus={() => setShowDropdown(true)}
                                    disabled={coinsLoading}
                                    placeholder={coinsLoading ? "Cargando monedas..." : "BTC, ETH, SOL, PEPE..."}
                                    className="w-full h-9 bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 text-sm font-bold text-white outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400/50 disabled:opacity-50 placeholder:text-slate-600 placeholder:font-normal"
                                />
                            </div>
                            {showDropdown && filteredCoins.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-20 overflow-hidden">
                                    {filteredCoins.map((coin) => (
                                        <button
                                            key={coin.symbol}
                                            onMouseDown={() => handleSelectCoin(coin)}
                                            className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-700 transition-colors text-left"
                                        >
                                            <span className="font-bold text-sm text-white">{coin.symbol}</span>
                                            <span className="text-[11px] text-slate-400 font-mono">{fmtPrice(coin.price)}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Price target */}
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">
                                Precio Objetivo {selectedCoin ? `(${selectedCoin})` : ""}
                            </label>
                            {selectedPrice > 0 && (
                                <span className="text-[10px] text-slate-400 font-mono">
                                    Actual: <span className="text-white font-bold">{fmtPrice(selectedPrice)}</span>
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                            <button
                                onClick={() => handleTargetChange(targetValue * 0.99)}
                                className="flex items-center justify-center w-9 h-9 bg-slate-900 border border-slate-700 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors active:scale-95 shrink-0"
                            >
                                <span className="text-lg font-bold leading-none">−</span>
                            </button>
                            <div className="relative flex-1">
                                <input
                                    type="number"
                                    step="0.0001"
                                    value={targetValue}
                                    onChange={(e) => handleTargetChange(Number(e.target.value))}
                                    className="w-full h-9 bg-slate-900 border border-slate-700 rounded-lg px-2 pr-7 text-base font-bold text-center text-white outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400/50"
                                />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">$</span>
                            </div>
                            <button
                                onClick={() => handleTargetChange(targetValue * 1.01)}
                                className="flex items-center justify-center w-9 h-9 bg-slate-900 border border-slate-700 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors active:scale-95 shrink-0"
                            >
                                <span className="text-lg font-bold leading-none">+</span>
                            </button>
                        </div>

                        {/* Direction + Persistence — single row */}
                        <div className="grid grid-cols-4 gap-1.5 mb-1.5">
                            <button
                                onClick={() => setDirection('up')}
                                className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${direction === 'up' ? "bg-green-500/20 text-green-400 border-green-500/50" : "bg-slate-900 text-slate-500 border-slate-700 hover:border-slate-600"}`}
                            >
                                🔼 Sube
                            </button>
                            <button
                                onClick={() => setDirection('down')}
                                className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${direction === 'down' ? "bg-red-500/20 text-red-400 border-red-500/50" : "bg-slate-900 text-slate-500 border-slate-700 hover:border-slate-600"}`}
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

                        {selectedPrice > 0 && ((direction === 'up' && selectedPrice >= targetValue) || (direction === 'down' && selectedPrice <= targetValue)) ? (
                            <p className="text-center text-[10px] font-bold mb-1.5 text-yellow-400">
                                ⚠️ El precio actual ya {direction === 'up' ? 'supera' : 'está por debajo de'} {fmtPrice(targetValue)} — se disparará en el próximo ciclo
                            </p>
                        ) : (
                            <p className={`text-center text-[10px] font-bold mb-1.5 ${direction === 'up' ? "text-green-400" : "text-red-400"}`}>
                                {selectedCoin
                                    ? `Notificar cuando ${selectedCoin} ${direction === 'up' ? "suba a" : "baje a"} ${fmtPrice(targetValue)}`
                                    : "Seleccioná una moneda para continuar"}
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
                            disabled={!selectedCoin || targetValue <= 0}
                            className={`w-full flex items-center justify-center gap-1.5 font-bold py-2 rounded-lg transition-all active:scale-[0.98] disabled:opacity-50 text-xs ${
                                selectedPrice > 0 && ((direction === 'up' && selectedPrice >= targetValue) || (direction === 'down' && selectedPrice <= targetValue))
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
