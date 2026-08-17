import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Kline } from "../lib/types/signals";
import type { Interval } from "../lib/types/chart";
import { fetchKlines } from "../services/market/klineService";

interface UseChartKlinesParams {
    coins: string[];
    initialCoin?: string;
    klinesMap?: Record<string, Kline[]>;
}

export function useChartKlines({ coins, initialCoin, klinesMap = {} }: UseChartKlinesParams) {
    const [selectedCoin, setSelectedCoin] = useState<string>(
        initialCoin && coins.includes(initialCoin) ? initialCoin : coins[0] || ""
    );
    const [selectedInterval, setSelectedInterval] = useState<Interval>("4h");
    const [extraKlines, setExtraKlines] = useState<Record<string, Partial<Record<Interval, Kline[]>>>>({});
    const [loading, setLoading] = useState(false);

    // Explorer popover state (Coin Explorer selection)
    const [showExplorer, setShowExplorer] = useState(false);
    const [explorerInput, setExplorerInput] = useState("");
    const [explorerLoading, setExplorerLoading] = useState(false);
    const [explorerError, setExplorerError] = useState("");
    const explorerRef = useRef<HTMLDivElement>(null);

    // Sync initialCoin → selectedCoin
    useEffect(() => {
        if (initialCoin && coins.includes(initialCoin)) setSelectedCoin(initialCoin);
    }, [initialCoin, coins]);

    const getCurrentKlines = useCallback((): Kline[] => {
        if (selectedInterval === "1h") return klinesMap[selectedCoin] || extraKlines[selectedCoin]?.["1h"] || [];
        return extraKlines[selectedCoin]?.[selectedInterval] || [];
    }, [selectedCoin, selectedInterval, klinesMap, extraKlines]);

    const currentKlines = useMemo(() => getCurrentKlines(), [getCurrentKlines]);

    // Auto-fetch 1h klines when klinesMap doesn't have data for the selected coin
    useEffect(() => {
        if (!selectedCoin) return;
        if (klinesMap[selectedCoin] || extraKlines[selectedCoin]?.["1h"]) return;
        setLoading(true);
        fetchKlines(selectedCoin, "1h")
            .then((klines) => {
                setExtraKlines((prev) => ({
                    ...prev,
                    [selectedCoin]: { ...prev[selectedCoin], "1h": klines },
                }));
            })
            .finally(() => setLoading(false));
    }, [selectedCoin, klinesMap, extraKlines]);

    // Fetch non-1h klines on demand
    useEffect(() => {
        if (selectedInterval === "1h" || !selectedCoin) return;
        if (extraKlines[selectedCoin]?.[selectedInterval]) return;
        setLoading(true);
        fetchKlines(selectedCoin, selectedInterval)
            .then((klines) => {
                setExtraKlines((prev) => ({
                    ...prev,
                    [selectedCoin]: { ...prev[selectedCoin], [selectedInterval]: klines },
                }));
            })
            .finally(() => setLoading(false));
    }, [selectedCoin, selectedInterval, extraKlines]);

    const handleSelectExplorerCoin = useCallback(async (coin: string) => {
        const upper = coin.toUpperCase().trim();
        if (!upper) return;
        setExplorerError("");

        // Already have klines for this coin
        if (klinesMap[upper] || extraKlines[upper]?.["1h"]) {
            setSelectedCoin(upper);
            setShowExplorer(false);
            setExplorerInput("");
            return;
        }

        // Fetch from Binance
        setExplorerLoading(true);
        try {
            const klines = await fetchKlines(upper, "1h");
            if (klines.length === 0) throw new Error("Sin datos");
            setExtraKlines(prev => ({ ...prev, [upper]: { ...prev[upper], "1h": klines } }));
            setSelectedCoin(upper);
            setShowExplorer(false);
            setExplorerInput("");
        } catch {
            setExplorerError(`"${upper}" no encontrada en Binance`);
        } finally {
            setExplorerLoading(false);
        }
    }, [klinesMap, extraKlines]);

    return {
        selectedCoin,
        setSelectedCoin,
        selectedInterval,
        setSelectedInterval,
        currentKlines,
        loading,
        getCurrentKlines,
        handleSelectExplorerCoin,
        showExplorer,
        setShowExplorer,
        explorerInput,
        setExplorerInput,
        explorerLoading,
        explorerError,
        setExplorerError,
        explorerRef,
    };
}