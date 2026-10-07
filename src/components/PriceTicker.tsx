import React from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { PriceDirection } from "../hooks/usePrices";
import { BcvRate } from "../hooks/useBcvRate";
import { YadioRate } from "../hooks/useYadioRate";

interface PriceTickerProps {
    prices: Record<string, number>;
    priceDirections: Record<string, PriceDirection>;
    bcvRate: BcvRate;
    yadioRate: YadioRate;
    selectedCoins: string[];
    tickerSpeed?: number;
}

function formatPrice(price: number): string {
    if (price >= 1000) return `$${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
    if (price >= 1) return `$${price.toFixed(2)}`;
    if (price >= 0.01) return `$${price.toFixed(4)}`;
    return `$${price.toFixed(6)}`;
}

function DirectionIcon({ direction }: { direction: PriceDirection }) {
    if (direction === "up") return <TrendingUp size={10} className="text-green-400" />;
    if (direction === "down") return <TrendingDown size={10} className="text-red-400" />;
    return <Minus size={10} className="text-gray-500" />;
}

function BcvItem({ icon, label, rate }: { icon: string; label: string; rate: number }) {
    if (!rate) return null;
    return (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-xs">{icon}</span>
            <span className="text-yellow-400 font-semibold text-xs">{label}</span>
            <span className="text-white font-bold text-xs">{rate.toFixed(2)} Bs</span>
        </span>
    );
}

function VesItem({ rate }: { rate: number }) {
    if (!rate) return null;
    return (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-xs">₿</span>
            <span className="text-yellow-400 font-semibold text-xs">VES</span>
            <span className="text-white font-bold text-xs">{rate.toFixed(2)} Bs/$</span>
        </span>
    );
}

function CryptoItem({ coin, price, direction }: { coin: string; price: number; direction: PriceDirection }) {
    const colorClass = direction === "up" ? "text-green-400" : direction === "down" ? "text-red-400" : "text-yellow-400";
    const isFiat = coin === "EUR";
    const displayPrice = isFiat ? `€${price.toFixed(3)}` : formatPrice(price);
    return (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-yellow-400 font-semibold text-xs">{coin}</span>
            <span className={`${colorClass} font-bold text-xs`}>{displayPrice}</span>
            <DirectionIcon direction={direction} />
        </span>
    );
}

function Separator() {
    return <span className="text-gray-700 mx-1">│</span>;
}

const PriceTicker: React.FC<PriceTickerProps> = ({
    prices,
    priceDirections,
    bcvRate,
    yadioRate,
    selectedCoins,
    tickerSpeed = 35,
}) => {
    const items: React.ReactNode[] = [];

    // BCV rates first
    if (bcvRate.usd > 0) {
        items.push(<BcvItem key="bcv-usd" icon="🇻🇪" label="BCV" rate={bcvRate.usd} />);
        items.push(<Separator key="sep-usd-eur" />);
        items.push(<BcvItem key="bcv-eur" icon="€" label="EUR" rate={bcvRate.eur} />);
    }

    // VES P2P rate
    if (yadioRate.p2pRate > 0) {
        if (items.length > 0) items.push(<Separator key="sep-ves" />);
        items.push(<VesItem key="ves-p2p" rate={yadioRate.p2pRate} />);
    }

    // Crypto coins
    for (const coin of selectedCoins) {
        const price = prices[coin];
        if (!price) continue;
        const direction = priceDirections[coin] || "neutral";

        if (items.length > 0) items.push(<Separator key={`sep-${coin}`} />);
        items.push(
            <CryptoItem key={coin} coin={coin} price={price} direction={direction} />
        );
    }

    if (items.length === 0) {
        return (
            <div className="text-center text-xs text-gray-600 py-1">
                {bcvRate.loading || yadioRate.loading ? "Cargando precios..." : "Sin datos de precios"}
            </div>
        );
    }

    // Desktop (lg+): the enclosing <header> (App.tsx) and <nav> (NavBar.tsx) are already `sm:sticky`,
    // so this strip rides that pinned block. The lg: classes below make the desktop behaviour
    // explicit: strip is pinned (top-0, z-30), the marquee is stopped (animate-none) and centred
    // (w-full/justify-center) with wrapping (flex-wrap), and the band is opaque (bg-slate-900).
    // Below lg none of them apply, so the scrolling marquee is preserved byte for byte.
    return (
        <div className="relative overflow-hidden border-t border-slate-800 bg-slate-900/50 lg:sticky lg:top-0 lg:z-30 lg:bg-slate-900">
            <div className="animate-ticker w-max flex items-center gap-0 py-1.5 px-2 lg:animate-none lg:w-full lg:justify-center" style={{ animationDuration: `${tickerSpeed}s` }}>
                <div className="flex items-center gap-0 pr-8 lg:flex-wrap">
                    {items}
                </div>
            </div>
        </div>
    );
};

export default PriceTicker;
