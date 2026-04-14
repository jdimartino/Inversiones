import React, { useState, useCallback, useRef } from "react";
import { Brain, Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import type { CoinSignal, FearGreedData } from "../lib/types/signals";
import { getFunctions, httpsCallable } from "firebase/functions";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AITraderAnalysisProps {
    coin: string;
    signal: CoinSignal | undefined;
    fearGreed: FearGreedData | null | undefined;
}

type Status = "idle" | "loading" | "done" | "error";

const COOLDOWN_MS = 60_000;

// ─── Markdown simple: bold y saltos de línea ─────────────────────────────────

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

// ─── Component ────────────────────────────────────────────────────────────────

const AITraderAnalysis: React.FC<AITraderAnalysisProps> = ({ coin, signal, fearGreed }) => {
    const [status, setStatus] = useState<Status>("idle");
    const [analysis, setAnalysis] = useState<string>("");
    const [error, setError] = useState<string>("");
    const [cooldownLeft, setCooldownLeft] = useState(0);
    const [notes, setNotes] = useState("");
    const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

    const startCooldown = useCallback(() => {
        setCooldownLeft(COOLDOWN_MS / 1000);
        cooldownTimer.current = setInterval(() => {
            setCooldownLeft((prev) => {
                if (prev <= 1) {
                    clearInterval(cooldownTimer.current!);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    }, []);

    const handleAnalyze = useCallback(async () => {
        if (!signal || status === "loading" || cooldownLeft > 0) return;

        setStatus("loading");
        setAnalysis("");
        setError("");

        try {
            const functions = getFunctions(undefined, "europe-west1");
            const analyzeMarket = httpsCallable<any, { analysis: string }>(functions, "analyzeMarket");

            const response = await analyzeMarket({
                coin: coin,
                price: signal.indicators.currentPrice,
                rsi: signal.indicators.rsi14,
                macd: signal.indicators.macdLine,
                macdSignal: signal.indicators.macdSignal,
                sma20: signal.indicators.sma20,
                sma50: signal.indicators.sma50,
                fearGreed: fearGreed,
                signalStrength: signal.signal,
                reasons: signal.reasons,
                notes: notes.trim() || undefined,
            });

            const text = response.data.analysis;

            if (!text) throw new Error("Respuesta vacía del modelo.");

            setAnalysis(text);
            setStatus("done");
            startCooldown();
        } catch (e: any) {
            setError(e?.message ?? "Error desconocido al contactar al analista.");
            setStatus("error");
        }
    }, [coin, signal, fearGreed, status, cooldownLeft, startCooldown, notes]);

    const canAnalyze = !!signal && status !== "loading" && cooldownLeft === 0;

    return (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 mt-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Brain className="w-4 h-4 text-violet-400" />
                    <span className="text-sm font-bold text-slate-200">Análisis con IA</span>
                    <span className="text-xs text-slate-500">— Marco, swing trader</span>
                </div>
                <span className="text-xs text-slate-600 italic">Powered by Groq / Llama 3.3</span>
            </div>

            {/* Chips de datos utilizados */}
            {signal && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                    <DataChip label={`RSI ${signal.indicators.rsi14.toFixed(0)}`} />
                    <DataChip label={`MACD ${signal.indicators.macdLine > 0 ? "+" : ""}${signal.indicators.macdLine.toFixed(4)}`} />
                    <DataChip label={`SMA20/50`} />
                    {fearGreed && <DataChip label={`F&G ${fearGreed.value}`} />}
                </div>
            )}

            {/* Notas opcionales */}
            <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Contexto para Marco (opcional): monto a invertir, niveles ya puestos, objetivo del trade..."
                rows={2}
                className="w-full text-xs bg-slate-900/40 border border-slate-700/50 rounded-lg px-3 py-2 text-slate-300 placeholder-slate-600 resize-none mb-3 focus:outline-none focus:border-violet-500/50"
            />

            {/* Botón */}
            <button
                onClick={handleAnalyze}
                disabled={!canAnalyze}
                className={`w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-semibold transition-all ${
                    canAnalyze
                        ? "bg-violet-600 hover:bg-violet-500 text-white cursor-pointer"
                        : "bg-slate-700 text-slate-500 cursor-not-allowed"
                }`}
            >
                {status === "loading" ? (
                    <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Analizando con Marco...
                    </>
                ) : cooldownLeft > 0 ? (
                    <>
                        <RefreshCw className="w-3.5 h-3.5" />
                        Disponible en {cooldownLeft}s
                    </>
                ) : !signal ? (
                    "Cargá las señales primero (tab Señales)"
                ) : (
                    <>
                        <Brain className="w-4 h-4" />
                        Analizar {coin} con IA
                    </>
                )}
            </button>

            {/* Error */}
            {status === "error" && (
                <div className="mt-3 flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-red-300">{error}</p>
                </div>
            )}

            {/* Análisis */}
            {status === "done" && analysis && (
                <div className="mt-3 bg-slate-900/60 border border-slate-700/50 rounded-lg p-4">
                    <div className="text-xs text-slate-300 leading-relaxed font-mono whitespace-pre-wrap">
                        {renderMarkdown(analysis)}
                    </div>
                    <p className="mt-3 text-right text-xs text-slate-600 italic">
                        Generado a las {new Date().toLocaleTimeString("es-VE")} · No es consejo financiero
                    </p>
                </div>
            )}
        </div>
    );
};

// ─── Chip pequeño de dato ────────────────────────────────────────────────────

const DataChip: React.FC<{ label: string }> = ({ label }) => (
    <span className="text-xs bg-slate-700/60 text-slate-400 border border-slate-600/50 rounded px-2 py-0.5">
        {label}
    </span>
);

export default AITraderAnalysis;
