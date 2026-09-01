import React, { useState, useEffect, useRef, useCallback } from "react";
import { Settings, X, GripVertical } from "lucide-react";
import { PriceDirection } from "../../hooks/usePrices";
import { fmtUSD } from "../../lib/format";
import MarketWatchSettingsModal from "./MarketWatchSettingsModal";

interface MarketWatchCardProps {
    prices: Record<string, number>;
    priceDirections: Record<string, PriceDirection>;
    prevDailyCloses: Record<string, number>;
    selectedCoins: string[];
    onCoinClick: (coin: string) => void;
    onWatchlistChange: (coins: string[]) => void;
}

const COIN_LOGO_URL = (symbol: string) =>
    `https://assets.coincap.io/assets/icons/${symbol.toLowerCase()}@2x.png`;

function adaptiveDecimals(price: number): number {
    if (price >= 1000) return 2;
    if (price >= 1) return 4;
    return 6;
}

function fmtChange(value: number, referencePrice: number): string {
    const dec = adaptiveDecimals(referencePrice);
    const sign = value >= 0 ? "+" : "";
    return `${sign}${value.toFixed(dec)}`;
}

function fmtChangePct(value: number): string {
    const sign = value >= 0 ? "+" : "";
    return `${sign}${value.toFixed(2)}%`;
}

const MarketWatchRow: React.FC<{
    coin: string;
    price: number;
    prevClose: number | undefined;
    direction: PriceDirection;
    onClick: () => void;
    onRemove: () => void;
    index: number;
    isDragging: boolean;
    onDragStart: (idx: number) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (idx: number) => void;
    onDragEnd: () => void;
}> = ({ coin, price, prevClose, direction, onClick, onRemove, index, isDragging, onDragStart, onDragOver, onDrop, onDragEnd }) => {
    const [flashClass, setFlashClass] = useState("");
    const prevDirRef = useRef<PriceDirection>(direction);

    useEffect(() => {
        if (direction !== prevDirRef.current && direction !== "neutral") {
            setFlashClass(direction === "up" ? "flash-green" : "flash-red");
            const timer = setTimeout(() => setFlashClass(""), 600);
            prevDirRef.current = direction;
            return () => clearTimeout(timer);
        }
    }, [direction]);

    const change = prevClose != null ? price - prevClose : 0;
    const changePct = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
    const changeColor = direction === "up" ? "text-green-400" : direction === "down" ? "text-red-400" : "text-yellow-400";

    return (
        <div
            role="button"
            tabIndex={0}
            draggable
            onDragStart={() => onDragStart(index)}
            onDragOver={onDragOver}
            onDrop={() => onDrop(index)}
            onDragEnd={onDragEnd}
            onClick={onClick}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onClick();
                }
            }}
            className={`w-auto mx-auto md:w-full md:mx-0 flex items-center justify-center md:justify-start gap-0.5 px-1 py-1 rounded hover:bg-gray-800/40 transition-colors text-left group cursor-grab active:cursor-grabbing ${isDragging ? "opacity-30" : ""} ${flashClass}`}
        >
            <span className="text-gray-700 group-hover:text-gray-500 transition-colors flex-shrink-0 hidden md:block">
                <GripVertical size={10} />
            </span>
            <img
                src={COIN_LOGO_URL(coin)}
                alt={coin}
                className="w-5 h-5 rounded-full flex-shrink-0 hidden md:block"
                onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                }}
            />
            <span className="text-[11px] md:text-xs text-gray-300 font-semibold w-[48px] md:w-[56px] flex-shrink-0 truncate text-center md:text-left">{coin}</span>
            <div className="grid grid-cols-[1fr_60px_44px] md:grid-cols-[1fr_72px_56px] items-center gap-x-1">
                <span className={`text-[11px] md:text-xs font-mono tabular-nums text-right whitespace-nowrap ${changeColor}`}>
                    {fmtUSD(price, coin.endsWith("EUR"))}
                </span>
                <span className={`text-[11px] md:text-xs font-mono tabular-nums text-right whitespace-nowrap ${changeColor}`}>
                    {fmtChange(change, price)}
                </span>
                <span className={`text-[11px] md:text-xs font-mono tabular-nums text-right whitespace-nowrap ${changeColor}`}>
                    {fmtChangePct(changePct)}
                </span>
            </div>
            <button
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                className="hidden md:block opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400 transition-all flex-shrink-0 ml-auto pr-1"
                title="Eliminar de la lista"
            >
                <X size={12} />
            </button>
        </div>
    );
};

const MarketWatchCard: React.FC<MarketWatchCardProps> = ({
    prices,
    priceDirections,
    prevDailyCloses,
    selectedCoins,
    onCoinClick,
    onWatchlistChange,
}) => {
    const [showSettings, setShowSettings] = useState(false);
    const [dragIndex, setDragIndex] = useState<number | null>(null);

    const coinList = selectedCoins.filter((c) => c !== "USDT").slice(0, 10);

    const handleDragStart = useCallback((idx: number) => {
        setDragIndex(idx);
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
    }, []);

    const handleDrop = useCallback((toIdx: number) => {
        if (dragIndex === null || dragIndex === toIdx) return;
        const updated = [...coinList];
        const [moved] = updated.splice(dragIndex, 1);
        updated.splice(toIdx, 0, moved);
        setDragIndex(null);
        onWatchlistChange(updated);
    }, [dragIndex, coinList, onWatchlistChange]);

    const handleDragEnd = useCallback(() => {
        setDragIndex(null);
    }, []);

    const renderColumn = (coins: string[]) => (
        <div className="flex flex-col items-center">
            <div className="w-full flex items-center justify-center md:justify-start gap-0.5 px-1 py-1.5 border-b border-gray-800/60 mb-0.5">
                <span className="text-[11px] text-gray-600 font-medium w-3 hidden md:block" />
                <span className="text-[11px] text-gray-600 font-medium w-5 hidden md:block" />
                <span className="text-[11px] text-gray-600 font-medium w-[48px] md:w-[56px] flex-shrink-0 truncate text-center md:text-left">Símbolo</span>
                <div className="grid grid-cols-[1fr_60px_44px] md:grid-cols-[1fr_72px_56px] items-center gap-x-1">
                    <span className="text-[11px] text-gray-600 text-right">Última</span>
                    <span className="text-[11px] text-gray-600 text-right">Cbo</span>
                    <span className="text-[11px] text-gray-600 text-right">Camb%</span>
                </div>
            </div>
            <div className="flex flex-col items-center space-y-0 w-full">
                {coins.map((coin, idx) => (
                    <MarketWatchRow
                        key={coin}
                        coin={coin}
                        price={prices[coin] ?? 0}
                        prevClose={prevDailyCloses[coin]}
                        direction={priceDirections[coin] ?? "neutral"}
                        onClick={() => onCoinClick(coin)}
                        onRemove={() => {
                            const updated = selectedCoins.filter(c => c !== coin);
                            onWatchlistChange(updated);
                        }}
                        index={idx}
                        isDragging={dragIndex === idx}
                        onDragStart={handleDragStart}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        onDragEnd={handleDragEnd}
                    />
                ))}
            </div>
        </div>
    );

    return (
        <>
            <div className="w-full bg-[#181A20] rounded-xl border border-slate-700/50 shadow-sm shadow-black/10 p-2">
                <div className="relative flex items-center justify-center mb-1.5">
                    <h3 className="text-white font-semibold text-sm">
                        Market Watch
                    </h3>
                    <button
                        onClick={() => setShowSettings(true)}
                        className="absolute right-0 text-gray-600 hover:text-yellow-400 transition-colors"
                    >
                        <Settings size={14} />
                    </button>
                </div>

                {coinList.length === 0 ? (
                    <p className="text-gray-600 text-xs text-center py-4">
                        Sin monedas seleccionadas
                    </p>
                ) : (
                    <div>
                        {renderColumn(coinList)}
                    </div>
                )}
            </div>

            {showSettings && (
                <MarketWatchSettingsModal
                    selectedCoins={selectedCoins}
                    onChange={onWatchlistChange}
                    onClose={() => setShowSettings(false)}
                />
            )}
        </>
    );
};

export default MarketWatchCard;
