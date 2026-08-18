import React from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { Plus, X } from "lucide-react";
import type { CoinSignal } from "../../../lib/types/signals";
import { coinColor } from "../chartColors";
import { signalDotColor } from "./chartUtils";

interface CoinExplorerProps {
    coins: string[];
    portfolioCoins: string[];
    selectedCoin: string;
    setSelectedCoin: Dispatch<SetStateAction<string>>;
    signals: CoinSignal[];
    showExplorer: boolean;
    setShowExplorer: Dispatch<SetStateAction<boolean>>;
    explorerInput: string;
    setExplorerInput: Dispatch<SetStateAction<string>>;
    explorerLoading: boolean;
    explorerError: string;
    setExplorerError: Dispatch<SetStateAction<string>>;
    extraCoins: string[];
    handleSelectExplorerCoin: (coin: string) => void;
    explorerRef: RefObject<HTMLDivElement>;
}

const CoinExplorer: React.FC<CoinExplorerProps> = ({
    coins,
    portfolioCoins,
    selectedCoin,
    setSelectedCoin,
    signals,
    showExplorer,
    setShowExplorer,
    explorerInput,
    setExplorerInput,
    explorerLoading,
    explorerError,
    setExplorerError,
    extraCoins,
    handleSelectExplorerCoin,
    explorerRef,
}) => {
    return (
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin">
            {/* Portfolio coin tabs */}
            {coins.map((coin) => {
                const sig = signals.find((s) => s.coin === coin);
                const dot = signalDotColor(sig?.signal);
                return (
                    <button
                        key={coin}
                        onClick={() => setSelectedCoin(coin)}
                        className={`relative px-1.5 py-0.5 rounded text-[10px] font-bold transition-all duration-150 ${
                            selectedCoin === coin
                                ? "text-white shadow-sm"
                                : "bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-slate-300"
                        }`}
                        style={selectedCoin === coin ? { backgroundColor: coinColor(coin) } : {}}
                    >
                        {coin}
                        {dot && (
                            <span
                                className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full border border-slate-800"
                                style={{ backgroundColor: dot }}
                            />
                        )}
                    </button>
                );
            })}

            {/* Active non-portfolio coin badge */}
            {!portfolioCoins.includes(selectedCoin) && selectedCoin && (
                <>
                    <span className="text-slate-600 text-[10px] select-none">|</span>
                    <span
                        className="relative flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold text-white shadow-sm"
                        style={{ backgroundColor: coinColor(selectedCoin) }}
                    >
                        {selectedCoin}
                        <button
                            onClick={() => setSelectedCoin(portfolioCoins[0] || "")}
                            className="ml-0.5 hover:opacity-70 transition-opacity"
                            title="Volver al portafolio"
                        >
                            <X className="w-2.5 h-2.5" />
                        </button>
                    </span>
                </>
            )}

            {/* Explorer button + popover */}
            <div className="relative" ref={explorerRef}>
                <button
                    onClick={() => { setShowExplorer(v => !v); setExplorerError(""); }}
                    className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors ${
                        showExplorer
                            ? "bg-violet-600 text-white"
                            : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                    }`}
                    title="Explorar monedas"
                >
                    <Plus className="w-3 h-3" />
                    Explorar
                </button>

                {showExplorer && (
                    <div className="absolute top-full left-0 mt-1.5 z-50 bg-slate-800 border border-slate-600/60 rounded-xl p-3 shadow-2xl w-64">
                        {/* Pre-loaded coins grid */}
                        {extraCoins.length > 0 && (
                            <>
                                <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide mb-2">Disponibles</p>
                                <div className="flex flex-wrap gap-1 mb-3">
                                    {extraCoins.map((coin) => {
                                        const sig = signals.find((s) => s.coin === coin);
                                        const dot = signalDotColor(sig?.signal);
                                        return (
                                            <button
                                                key={coin}
                                                onClick={() => handleSelectExplorerCoin(coin)}
                                                className="relative px-2 py-0.5 rounded text-[10px] font-bold bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
                                            >
                                                {coin}
                                                {dot && (
                                                    <span
                                                        className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full border border-slate-800"
                                                        style={{ backgroundColor: dot }}
                                                    />
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </>
                        )}

                        {/* Custom ticker input */}
                        <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide mb-1.5">Cualquier par /USDT</p>
                        <div className="flex gap-1">
                            <input
                                type="text"
                                value={explorerInput}
                                onChange={(e) => { setExplorerInput(e.target.value.toUpperCase()); setExplorerError(""); }}
                                onKeyDown={(e) => e.key === "Enter" && handleSelectExplorerCoin(explorerInput)}
                                placeholder="PEPE, WIF, BONK..."
                                className="flex-1 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600 focus:outline-none focus:border-violet-500 placeholder-slate-500"
                                autoFocus
                            />
                            <button
                                onClick={() => handleSelectExplorerCoin(explorerInput)}
                                disabled={explorerLoading || !explorerInput.trim()}
                                className="px-2 py-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-xs rounded font-bold transition-colors"
                            >
                                {explorerLoading ? "..." : "IR"}
                            </button>
                        </div>
                        {explorerError && (
                            <p className="text-[10px] text-red-400 mt-1.5">{explorerError}</p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default CoinExplorer;