import React, { useState, useEffect, useMemo } from "react";
import { X, Settings, Check, Search, Loader2 } from "lucide-react";
import { useBinanceSymbols } from "../../hooks/useBinanceSymbols";

const MAX_COINS = 15;

interface MarketWatchSettingsModalProps {
    selectedCoins: string[];
    onChange: (coins: string[]) => void;
    onClose: () => void;
}

const MarketWatchSettingsModal: React.FC<MarketWatchSettingsModalProps> = ({
    selectedCoins,
    onChange,
    onClose,
}) => {
    const [draft, setDraft] = useState<string[]>(selectedCoins);
    const [search, setSearch] = useState("");
    const { symbols, loading, error } = useBinanceSymbols();

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    const filteredSymbols = useMemo(() => {
        if (!symbols) return [];
        if (!search.trim()) return symbols;
        const q = search.trim().toUpperCase();
        return symbols.filter((s) => s.includes(q));
    }, [symbols, search]);

    const toggle = (coin: string) => {
        setDraft((prev) => {
            if (prev.includes(coin)) return prev.filter((c) => c !== coin);
            if (prev.length >= MAX_COINS) return prev;
            return [...prev, coin];
        });
    };

    const handleSave = () => {
        if (draft.length === 0) return;
        onChange(draft);
        onClose();
    };

    return (
        <div
            className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="bg-[#181A20] rounded-t-2xl border border-gray-700 w-full max-w-md mx-4 overflow-hidden max-h-[70vh] sm:max-h-[60vh] flex flex-col mb-0"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-4 border-b border-gray-800 flex-shrink-0">
                    <h3 className="text-white font-semibold flex items-center gap-2">
                        <Settings className="text-yellow-400" size={18} />
                        Configurar Market Watch
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-white transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="px-4 pt-3 pb-2 flex-shrink-0">
                    <div className="relative">
                        <Search
                            size={16}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                        />
                        <input
                            type="text"
                            placeholder="Buscar moneda..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full bg-[#0E1014] border border-gray-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500/50"
                            autoFocus
                        />
                    </div>
                </div>

                <div className="px-4 pb-2 flex-shrink-0">
                    <span className="text-xs text-gray-500">
                        {draft.length}/{MAX_COINS} seleccionada{draft.length !== 1 ? "s" : ""}
                        {draft.length >= MAX_COINS && (
                            <span className="text-yellow-400 ml-1">(máximo alcanzado)</span>
                        )}
                    </span>
                </div>

                <div className="px-4 pb-4 space-y-1 overflow-y-auto flex-1 min-h-0">
                    {loading && (
                        <div className="flex items-center justify-center py-8 text-gray-500">
                            <Loader2 size={20} className="animate-spin mr-2" />
                            Cargando monedas...
                        </div>
                    )}

                    {error && (
                        <div className="text-center py-8 text-red-400 text-sm">
                            Error: {error}
                        </div>
                    )}

                    {!loading && !error && filteredSymbols.length === 0 && (
                        <div className="text-center py-8 text-gray-500 text-sm">
                            No se encontraron monedas
                        </div>
                    )}

                    {!loading &&
                        !error &&
                        filteredSymbols.map((coin) => {
                            const isSelected = draft.includes(coin);
                            const isDisabled = !isSelected && draft.length >= MAX_COINS;
                            return (
                                <button
                                    key={coin}
                                    onClick={() => !isDisabled && toggle(coin)}
                                    disabled={isDisabled}
                                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                                        isSelected
                                            ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                                            : isDisabled
                                              ? "bg-[#0E1014] text-gray-600 border border-gray-800 cursor-not-allowed opacity-50"
                                              : "bg-[#0E1014] text-gray-400 border border-gray-800 hover:border-gray-700"
                                    }`}
                                >
                                    <span>{coin}</span>
                                    {isSelected && (
                                        <Check
                                            size={14}
                                            className="text-yellow-400"
                                        />
                                    )}
                                </button>
                            );
                        })}
                </div>

                <div className="flex gap-2 p-4 border-t border-gray-800 flex-shrink-0">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2 rounded-lg bg-gray-800 text-gray-400 font-medium text-sm hover:bg-gray-700 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={draft.length === 0}
                        className="flex-1 px-4 py-2 rounded-lg bg-yellow-500 text-black font-medium text-sm hover:bg-yellow-400 transition-colors disabled:opacity-50"
                    >
                        Guardar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MarketWatchSettingsModal;
