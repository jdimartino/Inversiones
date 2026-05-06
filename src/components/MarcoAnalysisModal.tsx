import React, { useEffect, useState, useCallback, useRef } from "react";
import { Brain, Loader2, X, AlertTriangle, RefreshCw } from "lucide-react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { SYMBOL_MAP } from "../lib/constants";
import { parseKlines, computeIndicators } from "../lib/indicators";
import { computeSignal } from "../lib/signalEngine";
import type { FearGreedData } from "../lib/types/signals";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MarcoAnalysisModalProps {
    coin: string;
    operationType: "buy" | "sell" | "closed";
    currentPrice: number;
    fearGreed: FearGreedData | null | undefined;
    onClose: () => void;
    // buy
    entryPrice?: number;
    quantity?: number;
    pnl?: number;
    pnlPct?: number;
    // sell
    sellPrice?: number;
    usdtReceived?: number;
    // closed
    buyPrice?: number;
    closedPnl?: number;
    closedPnlPct?: number;
}

type Status = "loading" | "done" | "error";

const COOLDOWN_MS = 60_000;

// ─── Markdown simple ──────────────────────────────────────────────────────────

function renderMarkdown(text: string): React.ReactNode[] {
    return text.split("\n").map((line, i) => {
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        const rendered = parts.map((part, j) =>
            part.startsWith("**") && part.endsWith("**")
                ? <strong key={j} className="text-white">{part.slice(2, -2)}</strong>
                : <span key={j}>{part}</span>
        );
        return <span key={i}>{rendered}<br /></span>;
    });
}

// ─── Build context note ───────────────────────────────────────────────────────

function buildContextNote(props: MarcoAnalysisModalProps): string {
    const { coin, operationType, currentPrice, entryPrice, quantity, pnl, pnlPct,
        sellPrice, usdtReceived, buyPrice, closedPnl, closedPnlPct } = props;

    if (operationType === "buy") {
        return `Tengo posición abierta: compré ${quantity ?? "?"} ${coin} a $${entryPrice ?? "?"}. Precio actual $${currentPrice}. PnL: ${pnl != null ? pnl.toFixed(2) : "?"} USDT (${pnlPct != null ? pnlPct.toFixed(2) : "?"}%). Dime si debo mantener, promediar a la baja o cortar pérdidas.`;
    }
    if (operationType === "sell") {
        return `Vendí ${quantity ?? "?"} ${coin} a $${sellPrice ?? "?"}, recibí ${usdtReceived != null ? usdtReceived.toFixed(2) : "?"} USDT. Precio actual $${currentPrice}. ¿Cuándo y a qué precio recomprar para generar ganancia?`;
    }
    return `Operación cerrada: compré ${quantity ?? "?"} ${coin} a $${buyPrice ?? "?"} y vendí a $${sellPrice ?? "?"}. PnL: ${closedPnl != null ? closedPnl.toFixed(2) : "?"} USDT (${closedPnlPct != null ? closedPnlPct.toFixed(2) : "?"}%). Análisis post-mortem: ¿qué salió bien, qué salió mal y qué haría diferente?`;
}

// ─── Fetch indicators for a coin ─────────────────────────────────────────────

async function fetchIndicators(coin: string) {
    const symbol = SYMBOL_MAP[coin] ?? `${coin}USDT`;
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=100`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Binance ${res.status}`);
    const raw = await res.json();
    const klines = parseKlines(raw);
    if (klines.length < 50) throw new Error("Datos insuficientes");
    const indicators = computeIndicators(klines);
    return { indicators, klines };
}

// ─── Component ────────────────────────────────────────────────────────────────

const MarcoAnalysisModal: React.FC<MarcoAnalysisModalProps> = (props) => {
    const { coin, operationType, fearGreed, onClose } = props;

    const [status, setStatus] = useState<Status>("loading");
    const [analysis, setAnalysis] = useState("");
    const [error, setError] = useState("");
    const [cooldownLeft, setCooldownLeft] = useState(0);
    const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

    const startCooldown = useCallback(() => {
        setCooldownLeft(COOLDOWN_MS / 1000);
        cooldownTimer.current = setInterval(() => {
            setCooldownLeft((prev) => {
                if (prev <= 1) { clearInterval(cooldownTimer.current!); return 0; }
                return prev - 1;
            });
        }, 1000);
    }, []);

    const runAnalysis = useCallback(async () => {
        setStatus("loading");
        setAnalysis("");
        setError("");

        try {
            let indicators = null;
            let signal = null;
            let rsi = 0, macd = 0, macdSignal = 0, sma20 = 0, sma50 = 0;

            try {
                const result = await fetchIndicators(coin);
                indicators = result.indicators;
                signal = computeSignal(coin, indicators, fearGreed ?? undefined);
                rsi = indicators.rsi14;
                macd = indicators.macdLine;
                macdSignal = indicators.macdSignal;
                sma20 = indicators.sma20;
                sma50 = indicators.sma50;
            } catch {
                // Fallback: analyze without technical indicators
            }

            const functions = getFunctions(undefined, "europe-west1");
            const analyzeMarket = httpsCallable<any, { analysis: string }>(functions, "analyzeMarket");

            const contextNote = buildContextNote(props);

            const response = await analyzeMarket({
                coin,
                price: props.currentPrice,
                rsi,
                macd,
                macdSignal,
                sma20,
                sma50,
                fearGreed: fearGreed ?? null,
                signalStrength: signal?.signal ?? "hold",
                reasons: signal?.reasons ?? [],
                notes: contextNote,
            });

            const text = response.data.analysis;
            if (!text) throw new Error("Respuesta vacía del modelo.");
            setAnalysis(text);
            setStatus("done");
            startCooldown();
        } catch (e: any) {
            setError(e?.message ?? "Error al contactar a Marco.");
            setStatus("error");
        }
    }, [coin, fearGreed, props, startCooldown]);

    useEffect(() => {
        runAnalysis();
        return () => { if (cooldownTimer.current) clearInterval(cooldownTimer.current); };
    }, []); // eslint-disable-line

    // Close on overlay click
    const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) onClose();
    };

    const typeLabel = operationType === "buy" ? "Posición Activa"
        : operationType === "sell" ? "Venta Realizada"
        : "Operación Cerrada";

    return (
        <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={handleOverlayClick}
        >
            <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-slate-700 flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <Brain className="w-5 h-5 text-violet-400" />
                        <div>
                            <h2 className="text-sm font-bold text-white">Marco — {coin}</h2>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider">{typeLabel}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-700 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="overflow-y-auto flex-1 p-5">
                    {/* Operation summary */}
                    <OperationSummary {...props} />

                    {/* Loading */}
                    {status === "loading" && (
                        <div className="flex flex-col items-center justify-center py-10 gap-3">
                            <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
                            <p className="text-xs text-slate-400">Consultando a Marco...</p>
                            <p className="text-[10px] text-slate-600">Cargando indicadores de mercado</p>
                        </div>
                    )}

                    {/* Error */}
                    {status === "error" && (
                        <div className="mt-4">
                            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-3">
                                <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                                <p className="text-xs text-red-300">{error}</p>
                            </div>
                            <button
                                onClick={runAnalysis}
                                className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-semibold bg-slate-700 hover:bg-slate-600 text-white transition-all"
                            >
                                <RefreshCw className="w-4 h-4" />
                                Reintentar
                            </button>
                        </div>
                    )}

                    {/* Analysis */}
                    {status === "done" && analysis && (
                        <div className="mt-4">
                            <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-4">
                                <div className="text-xs text-slate-300 leading-relaxed font-mono whitespace-pre-wrap">
                                    {renderMarkdown(analysis)}
                                </div>
                                <p className="mt-3 text-right text-[10px] text-slate-600 italic">
                                    Generado a las {new Date().toLocaleTimeString("es-VE")} · No es consejo financiero
                                </p>
                            </div>
                            {cooldownLeft > 0 && (
                                <p className="text-center text-[10px] text-slate-600 mt-2">
                                    Nuevo análisis disponible en {cooldownLeft}s
                                </p>
                            )}
                            {cooldownLeft === 0 && (
                                <button
                                    onClick={runAnalysis}
                                    className="mt-3 w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-xs font-semibold bg-violet-700 hover:bg-violet-600 text-white transition-all"
                                >
                                    <RefreshCw className="w-3 h-3" />
                                    Nuevo análisis
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <div className="p-3 border-t border-slate-700/50 flex-shrink-0">
                    <p className="text-center text-[10px] text-slate-600 italic">Powered by Groq / Llama 3.3 · Marco, swing trader</p>
                </div>
            </div>
        </div>
    );
};

// ─── Operation summary chips ──────────────────────────────────────────────────

const OperationSummary: React.FC<MarcoAnalysisModalProps> = (props) => {
    const { operationType, coin, entryPrice, quantity, pnl, pnlPct,
        sellPrice, usdtReceived, buyPrice, closedPnl, closedPnlPct, currentPrice, sellPrice: sp } = props;

    if (operationType === "buy") {
        return (
            <div className="grid grid-cols-2 gap-2 mb-4">
                <SummaryChip label="Compré a" value={`$${entryPrice?.toLocaleString("en-US", { maximumFractionDigits: 5 }) ?? "?"}`} color="text-sky-400" />
                <SummaryChip label="Precio actual" value={`$${currentPrice?.toLocaleString("en-US", { maximumFractionDigits: 5 }) ?? "?"}`} color="text-yellow-300" />
                <SummaryChip label="Cantidad" value={`${quantity?.toLocaleString("en-US", { maximumFractionDigits: 4 }) ?? "?"} ${coin}`} color="text-slate-300" />
                <SummaryChip
                    label="PnL neto"
                    value={`${pnl != null && pnl >= 0 ? "+" : ""}${pnl?.toFixed(2) ?? "?"} USDT (${pnlPct?.toFixed(2) ?? "?"}%)`}
                    color={pnl != null && pnl >= 0 ? "text-green-400" : "text-red-400"}
                />
            </div>
        );
    }

    if (operationType === "sell") {
        return (
            <div className="grid grid-cols-2 gap-2 mb-4">
                <SummaryChip label="Vendí a" value={`$${sellPrice?.toLocaleString("en-US", { maximumFractionDigits: 5 }) ?? "?"}`} color="text-emerald-300" />
                <SummaryChip label="Precio actual" value={`$${currentPrice?.toLocaleString("en-US", { maximumFractionDigits: 5 }) ?? "?"}`} color="text-yellow-300" />
                <SummaryChip label="Cantidad" value={`${quantity?.toLocaleString("en-US", { maximumFractionDigits: 4 }) ?? "?"} ${coin}`} color="text-slate-300" />
                <SummaryChip label="USDT recibidos" value={`$${usdtReceived?.toFixed(2) ?? "?"}`} color="text-emerald-400" />
            </div>
        );
    }

    return (
        <div className="grid grid-cols-2 gap-2 mb-4">
            <SummaryChip label="Compré a" value={`$${buyPrice?.toLocaleString("en-US", { maximumFractionDigits: 5 }) ?? "?"}`} color="text-sky-400" />
            <SummaryChip label="Vendí a" value={`$${sp?.toLocaleString("en-US", { maximumFractionDigits: 5 }) ?? "?"}`} color="text-emerald-300" />
            <SummaryChip label="Cantidad" value={`${quantity?.toLocaleString("en-US", { maximumFractionDigits: 4 }) ?? "?"} ${coin}`} color="text-slate-300" />
            <SummaryChip
                label="PnL final"
                value={`${closedPnl != null && closedPnl >= 0 ? "+" : ""}${closedPnl?.toFixed(2) ?? "?"} USDT (${closedPnlPct?.toFixed(2) ?? "?"}%)`}
                color={closedPnl != null && closedPnl >= 0 ? "text-green-400" : "text-red-400"}
            />
        </div>
    );
};

const SummaryChip: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
    <div className="bg-slate-900/50 border border-slate-700/50 rounded-lg p-2 text-center">
        <p className="text-[9px] text-slate-500 uppercase font-bold mb-0.5 tracking-wider">{label}</p>
        <p className={`text-xs font-mono font-bold ${color}`}>{value}</p>
    </div>
);

export default MarcoAnalysisModal;
