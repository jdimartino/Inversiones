import React, { useEffect, useRef, useState, useCallback } from "react";
import {
    createChart,
    ColorType,
    LineStyle,
    CrosshairMode,
    IChartApi,
    ISeriesApi,
} from "lightweight-charts";
import { AggregatedAsset, ProcessedInvestment } from "../../lib/constants";
import type { Kline } from "../../lib/types/signals";
import ChartCard from "./ChartCard";
import { coinColor } from "./chartColors";

interface CandlestickChartProps {
    aggregated: AggregatedAsset[];
    klinesMap: Record<string, Kline[]>;
    items: ProcessedInvestment[];
}

type Interval = "1h" | "4h" | "1d" | "1M";

const INTERVAL_LABELS: Record<Interval, string> = {
    "1h": "1H",
    "4h": "4H",
    "1d": "1D",
    "1M": "MES",
};

async function fetchKlines(coin: string, interval: Interval): Promise<Kline[]> {
    const symbol = `${coin}USDT`;
    const res = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=100`
    );
    const raw: any[][] = await res.json();
    return raw.map((k) => ({
        openTime: k[0] as number,
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
        closeTime: k[6] as number,
    }));
}

const CandlestickChart: React.FC<CandlestickChartProps> = ({ aggregated, klinesMap, items }) => {
    const coins = aggregated.filter((a) => a.currentValue > 0).map((a) => a.coin);

    const [selectedCoin, setSelectedCoin] = useState<string>(coins[0] || "");
    const [selectedInterval, setSelectedInterval] = useState<Interval>("4h");
    const [extraKlines, setExtraKlines] = useState<
        Record<string, Partial<Record<Interval, Kline[]>>>
    >({});
    const [loading, setLoading] = useState(false);

    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const priceLinesRef = useRef<ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]>[]>([]);
    const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

    const getCurrentKlines = useCallback((): Kline[] => {
        if (selectedInterval === "1h") return klinesMap[selectedCoin] || [];
        return extraKlines[selectedCoin]?.[selectedInterval] || [];
    }, [selectedCoin, selectedInterval, klinesMap, extraKlines]);

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
    }, [selectedCoin, selectedInterval]);

    // Create chart once
    useEffect(() => {
        if (!chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: "#0f172a" },
                textColor: "#94a3b8",
            },
            grid: {
                vertLines: { color: "#1e293b" },
                horzLines: { color: "#1e293b" },
            },
            crosshair: {
                mode: CrosshairMode.Normal,
                vertLine: { color: "#475569", labelBackgroundColor: "#334155" },
                horzLine: { color: "#475569", labelBackgroundColor: "#334155" },
            },
            rightPriceScale: {
                visible: true,
                autoScale: true,
                borderColor: "#1e293b",
                textColor: "#94a3b8",
            },
            leftPriceScale: { visible: false },
            timeScale: { borderColor: "#1e293b", timeVisible: true, secondsVisible: false },
            width: chartContainerRef.current.clientWidth,
            height: 320,
        });

        const candleSeries = (chart as any).addCandlestickSeries({
            upColor: "#4ade80",
            downColor: "#f87171",
            borderUpColor: "#4ade80",
            borderDownColor: "#f87171",
            wickUpColor: "#4ade80",
            wickDownColor: "#f87171",
        });

        const volumeSeries = (chart as any).addHistogramSeries({
            color: "#26a69a",
            priceFormat: { type: "volume" },
            priceScaleId: "vol",
        });

        volumeSeries.priceScale().applyOptions({
            scaleMargins: { top: 0.85, bottom: 0 },
        });

        chartRef.current = chart;
        candleSeriesRef.current = candleSeries;
        volumeSeriesRef.current = volumeSeries;

        const ro = new ResizeObserver(() => {
            if (chartContainerRef.current) {
                chart.applyOptions({ width: chartContainerRef.current.clientWidth });
            }
        });
        ro.observe(chartContainerRef.current);

        return () => {
            ro.disconnect();
            chart.remove();
        };
    }, []);

    // Update data when selection or klines change
    useEffect(() => {
        const klines = getCurrentKlines();
        if (!candleSeriesRef.current || !volumeSeriesRef.current || klines.length === 0) return;

        const candleData = klines.map((k) => ({
            time: Math.floor(k.openTime / 1000) as any,
            open: k.open,
            high: k.high,
            low: k.low,
            close: k.close,
        }));

        const volumeData = klines.map((k) => ({
            time: Math.floor(k.openTime / 1000) as any,
            value: k.volume,
            color: k.close >= k.open ? "#4ade8033" : "#f8717133",
        }));

        candleSeriesRef.current.setData(candleData);
        volumeSeriesRef.current.setData(volumeData);

        // Remove all existing price lines
        priceLinesRef.current.forEach((pl) => candleSeriesRef.current!.removePriceLine(pl));
        priceLinesRef.current = [];

        // Individual buy price lines (blue dotted)
        const coinItems = items.filter((inv) => inv.coin === selectedCoin);
        coinItems.forEach((inv) => {
            const dateLabel = new Date(inv.date).toLocaleDateString("es", {
                day: "numeric",
                month: "short",
            });
            const pl = candleSeriesRef.current!.createPriceLine({
                price: inv.buyPrice,
                color: "#60a5fa",
                lineWidth: 1,
                lineStyle: LineStyle.Dotted,
                axisLabelVisible: true,
                title: dateLabel,
            });
            priceLinesRef.current.push(pl);
        });

        // Average price line (amber dashed) — only when there are multiple entries
        const asset = aggregated.find((a) => a.coin === selectedCoin);
        const isSubDollar = (asset?.currentPrice ?? 1) < 1;
        candleSeriesRef.current.applyOptions({
            priceFormat: {
                type: "price",
                precision: isSubDollar ? 4 : 2,
                minMove: isSubDollar ? 0.0001 : 0.01,
            },
        });
        if (asset?.avgBuyPrice && coinItems.length > 1) {
            const pl = candleSeriesRef.current!.createPriceLine({
                price: asset.avgBuyPrice,
                color: "#f59e0b",
                lineWidth: 2,
                lineStyle: LineStyle.Dashed,
                axisLabelVisible: true,
                title: "Promedio",
            });
            priceLinesRef.current.push(pl);
        }

        // Current real-time price line (cyan) — matches Dashboard ticker price
        if (asset?.currentPrice) {
            const pl = candleSeriesRef.current!.createPriceLine({
                price: asset.currentPrice,
                color: "#22d3ee",
                lineWidth: 1,
                lineStyle: LineStyle.Solid,
                axisLabelVisible: true,
                title: "Actual",
            });
            priceLinesRef.current.push(pl);
        }

        chartRef.current?.timeScale().fitContent();
        candleSeriesRef.current?.priceScale().applyOptions({ autoScale: true });
    }, [selectedCoin, selectedInterval, extraKlines, klinesMap, aggregated, items]);

    if (coins.length === 0) return null;

    return (
        <ChartCard
            title="Precio de Monedas"
            subtitle="Velas OHLCV · Azul = compras individuales · Amarillo = promedio"
        >
            <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
                {/* Coin selector */}
                <div className="flex flex-wrap gap-1">
                    {coins.map((coin) => (
                        <button
                            key={coin}
                            onClick={() => setSelectedCoin(coin)}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                                selectedCoin === coin
                                    ? "text-white"
                                    : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                            }`}
                            style={selectedCoin === coin ? { backgroundColor: coinColor(coin) } : {}}
                        >
                            {coin}
                        </button>
                    ))}
                </div>

                {/* Interval selector */}
                <div className="flex gap-1">
                    {(["1h", "4h", "1d", "1M"] as Interval[]).map((iv) => (
                        <button
                            key={iv}
                            onClick={() => setSelectedInterval(iv)}
                            className={`px-2.5 py-1 rounded text-[10px] font-bold transition-colors ${
                                selectedInterval === iv
                                    ? "bg-yellow-600 text-white"
                                    : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                            }`}
                        >
                            {INTERVAL_LABELS[iv]}
                        </button>
                    ))}
                </div>
            </div>

            <div className="relative">
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-900/70 rounded z-10">
                        <span className="text-xs text-slate-400">Cargando...</span>
                    </div>
                )}
                <div ref={chartContainerRef} />
            </div>
        </ChartCard>
    );
};

export default CandlestickChart;
