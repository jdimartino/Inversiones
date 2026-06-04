import React from "react";
import { TrendingUp, TrendingDown, Minus, LineChart } from "lucide-react";
import { PriceDirection } from "../../hooks/usePrices";
import { getCoinTextColor } from "../../lib/constants";
import { fmtUSD, fmtPercent } from "../../lib/format";

interface MarketWatchCardProps {
    prices: Record<string, number>;
    priceDirections: Record<string, PriceDirection>;
    selectedCoins: string[];
    onCoinClick: (coin: string) => void;
}

const DirectionIcon: React.FC<{ direction: PriceDirection; size?: number }> = ({
    direction,
    size = 10,
}) => {
    if (direction === "up")
        return <TrendingUp size={size} className="text-green-400" />;
    if (direction === "down")
        return <TrendingDown size={size} className="text-red-400" />;
    return <Minus size={size} className="text-gray-500" />;
};

const MarketWatchCard: React.FC<MarketWatchCardProps> = ({
    prices,
    priceDirections,
    selectedCoins,
    onCoinClick,
}) => {
    const coinList = selectedCoins.filter((c) => c !== "USDT" && prices[c] != null);

    return (
        <div className="bg-[#181A20] rounded-xl border border-gray-800 p-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold flex items-center gap-2">
                    <LineChart size={16} className="text-yellow-400" />
                    <span>Market Watch</span>
                </h3>
                <span className="text-xs text-gray-500">
                    {coinList.length} activos
                </span>
            </div>

            {coinList.length === 0 ? (
                <p className="text-gray-600 text-sm">Sin monedas seleccionadas</p>
            ) : (
                <div className="space-y-1">
                    {coinList.map((coin) => {
                        const price = prices[coin] ?? 0;
                        const dir = priceDirections[coin] ?? "neutral";
                        return (
                            <button
                                key={coin}
                                onClick={() => onCoinClick(coin)}
                                className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-800/50 transition-colors group"
                            >
                                <div className="flex items-center gap-2">
                                    <span
                                        className={`text-sm font-bold ${getCoinTextColor(
                                            coin
                                        )}`}
                                    >
                                        {coin}
                                    </span>
                                    <DirectionIcon direction={dir} />
                                </div>
                                <div className="text-right">
                                    <div className="text-white text-sm font-medium">
                                        {fmtUSD(price)}
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default MarketWatchCard;
