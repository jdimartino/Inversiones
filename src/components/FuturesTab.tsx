import React, { useMemo, useState, useEffect } from "react";
import {
    Activity,
    TrendingUp,
    TrendingDown,
    Shield,
    AlertTriangle,
    Clock,
    Zap,
    Bell,
    FlaskConical,
    ArrowUp,
    ArrowDown,
    ArrowUpRight,
    CheckCircle,
    Info,
    Wallet,
    Gauge,
    Layers,
    Settings,
    ChevronDown,
    ChevronRight,
    Repeat,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useFutures, useFuturesAlerts } from "../hooks/useFutures";
import { useAlertLevelState } from "../hooks/useAlertLevelState";
import { FUTURES_HYSTERESIS, getLevelDisplay, levelStateKey } from "../lib/alertLevelDisplay";
import { useFuturesSync } from "../hooks/useFuturesSync";
import { useBinanceFuturesMarkPrices, FuturesWSStatus } from "../hooks/useBinanceFuturesWS";
import {
    FuturesPosition,
    FuturesPositionAlert,
    FuturesAccount,
    FuturesAlertConfig,
    formatPnl,
    formatRoe,
    safeNum,
    getMarginColor,
    getMarginLabel,
    getMarginLabelColor,
    getDistToLiqColor,
    getDistToLiqBarColor,
    getDistToLiqDirection,
    getDistToLiqDirectionColor,
    simulateMarketMove,
    findLiquidationThreshold,
    applyLivePrices,
    sumUnrealizedPnl,
} from "../lib/futures";
import { fmtPrice, fmtUSD, fmtPercent } from "../lib/format";
import { PriceDirection } from "../hooks/usePrices";
import FuturesPositionAlertModal from "./FuturesPositionAlertModal";
import FuturesGlobalAlertModal from "./FuturesGlobalAlertModal";
import PositionTradesDetail from "./PositionTradesDetail";

type IconType = LucideIcon;

// ─── Live Badge ───────────────────────────────────────────────────────────────

function LiveBadge({ status }: { status: FuturesWSStatus }) {
    if (status === "live") {
        return (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 rounded-full px-1.5 py-0.5 whitespace-nowrap">
                <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                </span>
                Live
            </span>
        );
    }
    if (status === "reconnecting" || status === "connecting") {
        return (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/25 rounded-full px-1.5 py-0.5 whitespace-nowrap">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                Reconectando
            </span>
        );
    }
    return null;
}

// ─── Primary Stat Card (centered) ─────────────────────────────────────────────

function StatCard({
    icon: Icon,
    label,
    value,
    valueClass = "text-white",
    accent,
}: {
    icon: IconType;
    label: string;
    value: string;
    valueClass?: string;
    accent?: "green" | "red";
}) {
    return (
        <div
            className={`relative rounded-xl border bg-white/[0.03] p-3 sm:p-4 overflow-hidden transition-colors hover:border-white/[0.14] ${
                accent === "green"
                    ? "border-emerald-500/25"
                    : accent === "red"
                      ? "border-rose-500/25"
                      : "border-white/[0.07]"
            }`}
        >
            {accent && (
                <div
                    className={`absolute top-0 left-0 right-0 h-px ${
                        accent === "green" ? "bg-emerald-500/50" : "bg-rose-500/50"
                    }`}
                />
            )}
            <div className="flex flex-col items-center text-center">
                <div className="flex items-center gap-1.5 mb-1.5">
                    <Icon size={13} className="text-slate-400 flex-shrink-0" />
                    <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
                        {label}
                    </span>
                </div>
                <div className={`text-base sm:text-xl font-bold font-mono tabular-nums leading-tight ${valueClass}`}>
                    {value}
                </div>
            </div>
        </div>
    );
}

// ─── Mini Stat (centered) ─────────────────────────────────────────────────────

function MiniStat({
    icon: Icon,
    label,
    value,
    valueClass = "text-white",
}: {
    icon: IconType;
    label: string;
    value: string;
    valueClass?: string;
}) {
    return (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-2 py-2 flex flex-col items-center text-center gap-0.5 transition-colors hover:border-white/[0.12] min-w-0">
            <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-slate-500 font-medium leading-none">
                <Icon size={9} className="opacity-60 flex-shrink-0" />
                <span className="truncate">{label}</span>
            </div>
            <div className={`text-xs sm:text-sm font-bold font-mono tabular-nums leading-tight ${valueClass} truncate`}>
                {value}
            </div>
        </div>
    );
}

// ─── Distance-to-liquidation explanation panel ────────────────────────────────

function LiqExplanation({ pos }: { pos: FuturesPosition }) {
    const isLong = pos.side === "LONG";
    const liqDir = getDistToLiqDirection(pos.side);
    const liqDirColor = getDistToLiqDirectionColor(pos.side);
    const hasLiq = pos.liquidationPrice > 0;
    return (
        <div className="px-4 py-3 text-[11px] text-slate-400 space-y-1.5 bg-black/20">
            <div>La barra indica qué tan lejos está el Mark Price del precio de liquidación.</div>
            <div className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                <span><span className="text-emerald-400 font-medium">Verde</span> = mayor distancia / menor riesgo.</span>
            </div>
            <div className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                <span><span className="text-amber-400 font-medium">Amarillo</span> = el precio se acerca / riesgo creciente.</span>
            </div>
            <div className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-rose-500 flex-shrink-0" />
                <span><span className="text-rose-400 font-medium">Rojo</span> = proximidad crítica a liquidación.</span>
            </div>
            <div>
                {isLong ? (
                    <><span className="text-emerald-400 font-medium">LONG</span>: para acercarse a liquidación, el precio debe <span className="text-rose-400 font-medium">BAJAR</span>.</>
                ) : (
                    <><span className="text-rose-400 font-medium">SHORT</span>: para acercarse a liquidación, el precio debe <span className="text-emerald-400 font-medium">SUBIR</span>.</>
                )}
            </div>
            {hasLiq && (
                <div>Dirección: <span className={`font-medium ${liqDirColor}`}>{liqDir}</span></div>
            )}
        </div>
    );
}

// ─── Mobile Position Card (compact) ───────────────────────────────────────────

function MobilePositionCard({ pos, onClick }: { pos: FuturesPosition; onClick?: () => void }) {
    const isLong = pos.side === "LONG";
    const pnlPositive = pos.unrealizedPnl >= 0;
    const hasLiq = pos.liquidationPrice > 0;
    const distColor = hasLiq ? getDistToLiqColor(pos.distToLiqPercent) : "text-slate-600";
    const distBarColor = hasLiq ? getDistToLiqBarColor(pos.distToLiqPercent) : "bg-slate-700";
    const liqDir = getDistToLiqDirection(pos.side);
    const liqDirColor = getDistToLiqDirectionColor(pos.side);

    return (
        <div
            className={`rounded-xl border border-white/[0.06] bg-white/[0.025] overflow-hidden transition-colors ${
                onClick ? "cursor-pointer hover:border-white/[0.14]" : ""
            }`}
            onClick={onClick}
        >
            <div className={`h-0.5 ${isLong ? "bg-emerald-500" : "bg-rose-500"}`} />
            <div className="p-3">
                <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold flex-shrink-0 ${isLong ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"}`}>
                            {pos.side}
                        </span>
                        <span className="text-white font-bold text-sm truncate">{pos.symbol}</span>
                        <span className="text-slate-500 text-[10px] flex-shrink-0">{pos.leverage}x</span>
                    </div>
                    <div className="text-right flex-shrink-0">
                        <div className={`font-bold font-mono text-sm ${pnlPositive ? "text-emerald-400" : "text-rose-400"}`}>
                            {formatPnl(pos.unrealizedPnl)}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">{formatRoe(pos.roe)}</div>
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-x-2 gap-y-1.5 mb-2.5">
                    <div><div className="text-[9px] text-slate-500">Entrada</div><div className="text-white text-xs font-mono">{fmtPrice(pos.entryPrice)}</div></div>
                    <div><div className="text-[9px] text-slate-500">Actual</div><div className="text-white text-xs font-mono">{fmtPrice(pos.markPrice)}</div></div>
                    <div><div className="text-[9px] text-slate-500">Break Even</div><div className="text-white text-xs font-mono">{fmtPrice(pos.breakEvenPrice)}</div></div>
                    <div><div className="text-[9px] text-slate-500">Liquidación</div><div className={`text-xs font-mono ${hasLiq ? distColor : "text-slate-600"}`}>{hasLiq ? fmtPrice(pos.liquidationPrice) : "Sin dato"}</div></div>
                    <div><div className="text-[9px] text-slate-500">Valor</div><div className="text-white text-xs font-mono">{fmtUSD(pos.notional)}</div></div>
                    <div><div className="text-[9px] text-slate-500">Margen</div><div className="text-white text-xs font-mono">{fmtUSD(pos.initialMargin)}</div></div>
                </div>
                <div>
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-[9px] text-slate-500 flex items-center gap-1">
                            Dist. Liq
                            {hasLiq && (
                                <span className={`inline-flex items-center gap-0.5 text-[9px] font-medium ${liqDirColor}`}>
                                    {isLong ? <ArrowDown size={8} /> : <ArrowUp size={8} />}
                                    {liqDir}
                                </span>
                            )}
                        </span>
                        <span className={`text-[10px] font-bold ${distColor}`}>{hasLiq ? `${pos.distToLiqPercent.toFixed(1)}%` : "Sin dato"}</span>
                    </div>
                    {hasLiq ? (
                        <div className="w-full bg-white/[0.06] rounded-full h-1.5 overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-500 ${distBarColor}`} style={{ width: `${Math.min(pos.distToLiqPercent, 100)}%` }} />
                        </div>
                    ) : (
                        <div className="text-[9px] text-slate-600">Sin dato de liquidación</div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Alert Settings ───────────────────────────────────────────────────────────

function AlertSettings({
    alerts,
    onSave,
}: {
    alerts: FuturesAlertConfig;
    onSave: (a: FuturesAlertConfig) => void;
}) {
    const [newThreshold, setNewThreshold] = React.useState("");

    const addThreshold = () => {
        const val = parseInt(newThreshold);
        if (isNaN(val) || val < 1 || val > 99) return;
        if (alerts.marginThresholds.includes(val)) return;
        const updated = [...alerts.marginThresholds, val].sort((a, b) => a - b);
        onSave({ ...alerts, marginThresholds: updated });
        setNewThreshold("");
    };

    const removeThreshold = (value: number) => {
        const updated = alerts.marginThresholds.filter((v) => v !== value);
        onSave({ ...alerts, marginThresholds: updated });
    };

    const toggleEnabled = () => {
        onSave({ ...alerts, enabled: !alerts.enabled });
    };

    const getThresholdColor = (val: number) => {
        if (val >= 90) return "bg-rose-500/15 text-rose-400 border-rose-500/30";
        if (val >= 80) return "bg-orange-500/15 text-orange-400 border-orange-500/30";
        if (val >= 70) return "bg-amber-500/15 text-amber-400 border-amber-500/30";
        return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    };

    return (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold flex items-center gap-2 text-sm">
                    <Zap className="text-amber-400" size={16} />
                    Alertas de Futuros
                </h3>
                <button
                    onClick={toggleEnabled}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                        alerts.enabled
                            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                            : "bg-white/[0.04] text-slate-400 border border-white/[0.08]"
                    }`}
                >
                    {alerts.enabled ? "Activo" : "Desactivado"}
                </button>
            </div>
            <div className="space-y-3">
                <div>
                    <div className="text-xs text-slate-400 mb-2">Notificarme cuando el margen supere:</div>
                    <div className="flex flex-wrap gap-2 mb-2">
                        {alerts.marginThresholds.map((threshold) => (
                            <span key={threshold} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border ${getThresholdColor(threshold)}`}>
                                {threshold}%
                                <button onClick={() => removeThreshold(threshold)} className="ml-1 hover:text-white transition-colors">✕</button>
                            </span>
                        ))}
                        {alerts.marginThresholds.length === 0 && (
                            <span className="text-slate-600 text-xs">Sin umbrales configurados</span>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <input
                            type="number" min="1" max="99" value={newThreshold}
                            onChange={(e) => setNewThreshold(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && addThreshold()}
                            placeholder="%"
                            className="w-16 bg-black/30 border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-white text-sm outline-none focus:border-amber-500 transition-colors"
                        />
                        <button onClick={addThreshold} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-500 text-black hover:bg-amber-400 transition-colors">
                            + Agregar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function GlobalPnlAlerts({
    alerts,
    account,
    onOpenGlobalAlertModal,
}: {
    alerts: FuturesAlertConfig;
    account: FuturesAccount;
    onOpenGlobalAlertModal: () => void;
}) {
    // Real crossing state owned by the Cloud Function (futuresAlertState/global).
    const { levels, loading } = useAlertLevelState("futures");

    return (
        <section className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold flex items-center gap-2 text-sm">
                    <Zap className="text-amber-400" size={16} />
                    Alertas de PNL Global
                    <span
                        className={`font-mono font-bold ${
                            account.totalUnrealizedProfit >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                    >
                        {formatPnl(account.totalUnrealizedProfit)}
                    </span>
                    {(alerts.globalAlerts || []).length > 0 && (
                        <span className="text-[9px] bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-full px-1.5 py-0.5 font-bold">
                            {(alerts.globalAlerts || []).length}
                        </span>
                    )}
                </h3>
                <button
                    onClick={onOpenGlobalAlertModal}
                    className="text-[10px] font-bold text-amber-400 hover:text-amber-300 transition-colors"
                >
                    {alerts.globalAlerts?.length ? "Editar" : "+ Nueva"}
                </button>
            </div>
            {(!alerts.globalAlerts || alerts.globalAlerts.length === 0) ? (
                <p className="text-[11px] text-slate-600 italic text-center py-2 bg-slate-800/30 rounded-lg border border-slate-800">
                    Sin alertas globales configuradas
                </p>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-1.5">
                    {alerts.globalAlerts.map((alert, index) => {
                        // Same PNL the Cloud Function uses for the global crossings
                        // (functions/src/futuresSync.ts) — never the websocket PNL.
                        const pnl = account.totalUnrealizedProfit;
                        const display = getLevelDisplay({
                            targetAmount: alert.targetAmount,
                            pnl,
                            levelState: levels[levelStateKey(alert.targetAmount)],
                            margin: FUTURES_HYSTERESIS,
                        });
                        // While the state document is loading, show a neutral badge
                        // instead of flashing a wrong one. One-shot alerts keep their
                        // badge ("1x") untouched.
                        const isPending = loading;
                        const isPaused = !isPending && display.status === "paused";
                        const arrowColor = isPending
                            ? "text-slate-500"
                            : display.arrow === "▲"
                              ? "text-emerald-400"
                              : "text-rose-400";
                        return (
                            <div key={`${alert.direction}-${alert.targetAmount}-${index}`} className="group relative flex items-center justify-between rounded-lg border border-white/[0.06] bg-black/20 px-2 py-1.5">
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <span className={`text-[11px] font-bold whitespace-nowrap ${arrowColor}`}>
                                        {isPending ? "•" : display.arrow} {alert.targetAmount >= 0 ? "+" : "-"}${Math.abs(alert.targetAmount).toFixed(2)}
                                    </span>
                                    <span className={`inline-flex items-center gap-0.5 rounded-full border px-1 py-0.5 text-[9px] font-bold whitespace-nowrap ${
                                        isPending && alert.isPersistent
                                            ? "border-white/[0.08] bg-white/[0.04] text-slate-400"
                                            : isPaused
                                              ? "border-orange-500/30 bg-orange-500/15 text-orange-400"
                                              : alert.isPersistent
                                                ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-400"
                                                : "border-white/[0.08] bg-white/[0.04] text-slate-400"
                                    }`}>
                                        {alert.isPersistent ? <Repeat size={8} /> : <Clock size={8} />}
                                        {alert.isPersistent
                                            ? isPending ? "…" : isPaused ? "Pausa" : "Armada"
                                            : "1x"}
                                    </span>
                                    {alert.note && <span className="text-[9px] text-slate-500 italic truncate hidden sm:inline">{alert.note}</span>}
                                </div>
                                <button
                                    onClick={onOpenGlobalAlertModal}
                                    className="p-0.5 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity hover:text-amber-400"
                                    title="Editar alertas"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
}

// ─── Stress Test de Cuenta ────────────────────────────────────────────────────

function StressTestSimulator({ positions, account }: { positions: FuturesPosition[]; account: FuturesAccount; }) {
    const [isOpen, setIsOpen] = useState(false);
    const [movePercent, setMovePercent] = useState(0);

    const simulation = useMemo(() => simulateMarketMove(positions, account, movePercent), [positions, account, movePercent]);
    const baseSimulation = useMemo(() => simulateMarketMove(positions, account, 0), [positions, account]);
    const currentPnlSum = useMemo(() => positions.reduce((s, p) => s + p.unrealizedPnl, 0), [positions]);
    const balanceChangePercent = account.totalMarginBalance > 0 ? (simulation.newUnrealizedPnl - currentPnlSum) / account.totalMarginBalance * 100 : 0;
    const liqThresholdDown = useMemo(() => findLiquidationThreshold(positions, account, "down"), [positions, account]);
    const liqThresholdUp = useMemo(() => findLiquidationThreshold(positions, account, "up"), [positions, account]);

    const simMarginColor = getMarginColor(simulation.newMarginRatio);
    const simMarginBarColor = getMarginBarColor(simulation.newMarginRatio);
    const simPnlPositive = simulation.newUnrealizedPnl >= 0;
    const moveLabel = movePercent === 0 ? "Actual" : movePercent < 0 ? `${fmtPercent(movePercent)} caída` : `${fmtPercent(movePercent)} subida`;

    const baseBuffer = baseSimulation.isLiquidated ? 0 : baseSimulation.bufferToLiq;
    const baseBufferColor = baseSimulation.isLiquidated ? "text-rose-400" : getMarginColor(baseSimulation.newMarginRatio);
    const downReached = liqThresholdDown !== null;
    const upReached = liqThresholdUp !== null;
    const downLabel = downReached ? `${Math.abs(liqThresholdDown).toFixed(1)}%` : "No alcanza";
    const upLabel = upReached ? `${liqThresholdUp.toFixed(1)}%` : "No alcanza";
    const downColor = downReached ? "text-rose-400" : "text-slate-500";
    const upColor = upReached ? "text-amber-400" : "text-slate-500";

    return (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] overflow-hidden">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex items-center justify-between p-3.5 hover:bg-white/[0.02] transition-colors">
                <h3 className="text-white font-semibold flex items-center gap-2 text-sm">
                    <FlaskConical className="text-violet-400" size={16} />
                    Stress Test de Cuenta
                </h3>
                <ChevronDown size={15} className={`text-slate-500 transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>
            {!isOpen && (
                <div className="px-3.5 pb-3.5 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="bg-black/20 rounded-lg px-2.5 py-2 border border-white/[0.06]">
                        <div className="text-[10px] text-slate-500 mb-0.5">Buffer hasta liquidación</div>
                        <div className={`text-base font-bold ${baseBufferColor}`}>{baseBuffer.toFixed(1)}%</div>
                    </div>
                    <div className="bg-black/20 rounded-lg px-2.5 py-2 border border-white/[0.06]">
                        <div className="text-[10px] text-slate-500 mb-0.5 flex items-center gap-1"><ArrowDown size={10} className="text-rose-400" /> Liq. con caída</div>
                        <div className={`text-base font-bold ${downColor}`}>{downLabel}</div>
                    </div>
                    <div className="bg-black/20 rounded-lg px-2.5 py-2 border border-white/[0.06]">
                        <div className="text-[10px] text-slate-500 mb-0.5 flex items-center gap-1"><ArrowUp size={10} className="text-amber-400" /> Liq. con subida</div>
                        <div className={`text-base font-bold ${upColor}`}>{upLabel}</div>
                    </div>
                </div>
            )}
            {isOpen && (
                <div className="px-3.5 pb-4 space-y-3.5">
                    <div className="text-[10px] text-slate-500 bg-black/20 rounded-lg px-2.5 py-1.5 border border-white/[0.06] flex items-start gap-1.5">
                        <Info size={11} className="mt-0.5 flex-shrink-0 text-violet-400" />
                        Estimación basada en movimiento uniforme del mercado. No incluye funding, fees ni cambios dinámicos de tiers de margen.
                    </div>
                    <div>
                        <div className="flex items-center justify-between text-sm text-slate-400 mb-2">
                            <span className="text-rose-400 flex items-center gap-1"><ArrowDown size={13} /> Caída</span>
                            <div className="flex flex-col items-center">
                                <span className="text-white font-bold text-base">{moveLabel}</span>
                                {movePercent !== 0 && <span className={`text-xs font-medium ${balanceChangePercent >= 0 ? "text-emerald-400" : "text-rose-400"}`}>Balance: {fmtPercent(balanceChangePercent)}</span>}
                            </div>
                            <span className="text-emerald-400 flex items-center gap-1"><ArrowUp size={13} /> Subida</span>
                        </div>
                        <div className="relative">
                            <input type="range" min="-100" max="100" step="1" value={movePercent} onChange={(e) => setMovePercent(Number(e.target.value))} className="w-full cursor-pointer accent-violet-500" />
                            <div className="flex justify-between text-[10px] text-slate-600 mt-1"><span>-100%</span><span className="text-slate-400 font-bold">0%</span><span>+100%</span></div>
                        </div>
                        {downReached
                            ? <div className="text-xs mt-1 flex items-center gap-1 text-rose-400"><ArrowDown size={10} /> Liq. con caída de <strong>{Math.abs(liqThresholdDown).toFixed(1)}%</strong></div>
                            : <div className="text-xs mt-1 flex items-center gap-1 text-slate-500"><ArrowDown size={10} /> No alcanza liquidación en el rango del simulador</div>}
                        {upReached
                            ? <div className="text-xs flex items-center gap-1 text-amber-400"><ArrowUp size={10} /> Liq. con subida de <strong>{liqThresholdUp.toFixed(1)}%</strong></div>
                            : <div className="text-xs flex items-center gap-1 text-slate-500"><ArrowUp size={10} /> No alcanza liquidación en el rango del simulador</div>}
                    </div>
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] text-slate-500">Margen proyectado</span>
                            <div className="flex items-center gap-2">
                                <span className={`text-xs font-bold ${simMarginColor}`}>{simulation.newMarginRatio.toFixed(2)}%</span>
                                {simulation.isLiquidated && <span className="text-[10px] bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded font-bold">LIQUIDADO</span>}
                            </div>
                        </div>
                        <div className="w-full bg-white/[0.06] rounded-full h-2 overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-300 ${simMarginBarColor}`} style={{ width: `${Math.min(simulation.newMarginRatio, 100)}%` }} />
                        </div>
                        <div className="relative h-0">{[50, 80, 95].map((t) => <div key={t} className="absolute top-1 w-px h-2 bg-slate-600" style={{ left: `${t}%` }} />)}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                        <div className="bg-black/20 rounded-lg p-2.5 border border-white/[0.06]">
                            <div className="text-[10px] text-slate-500 mb-1">Balance de Margen</div>
                            <div className="text-white text-base font-bold font-mono">{fmtUSD(simulation.newMarginBalance)}</div>
                        </div>
                        <div className="bg-black/20 rounded-lg p-2.5 border border-white/[0.06]">
                            <div className="text-[10px] text-slate-500 mb-1">PnL Proyectado</div>
                            <div className={`text-base font-bold font-mono ${simPnlPositive ? "text-emerald-400" : "text-rose-400"}`}>{formatPnl(simulation.newUnrealizedPnl)}</div>
                        </div>
                    </div>
                    {!simulation.isLiquidated && (
                        <div className={`rounded-lg p-2.5 border text-center ${simulation.newMarginRatio >= 80 ? "bg-orange-950/30 border-orange-800/50 text-orange-300" : simulation.newMarginRatio >= 50 ? "bg-amber-950/30 border-amber-800/50 text-amber-300" : "bg-emerald-950/30 border-emerald-800/50 text-emerald-300"}`}>
                            <span className="font-bold text-sm">Buffer hasta liquidación: </span>
                            <span className="font-bold text-base">{simulation.bufferToLiq.toFixed(1)}%</span>
                        </div>
                    )}
                    {simulation.isLiquidated && (
                        <div className="bg-rose-950/40 border border-rose-800/60 rounded-lg p-2.5 text-center">
                            <AlertTriangle size={18} className="text-rose-400 mx-auto mb-1" />
                            <span className="text-rose-300 font-bold text-sm">LIQUIDACIÓN ALCANZADA con {moveLabel}</span>
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500 pt-1 border-t border-white/[0.06]">
                            <div className="flex items-center gap-1"><ArrowDown size={11} className="text-rose-400" /> Caída máx. segura: <strong className={downColor}>{downLabel}</strong></div>
                            <div className="flex items-center gap-1 justify-end">Subida máx. segura: <strong className={upColor}>{upLabel}</strong><ArrowUp size={11} className="text-amber-400" /></div>
                        </div>
                </div>
            )}
        </div>
    );
}

function getMarginBarColor(ratio: number): string {
    if (ratio >= 95) return "bg-rose-500";
    if (ratio >= 80) return "bg-orange-500";
    if (ratio >= 50) return "bg-amber-500";
    return "bg-emerald-500";
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface FuturesTabProps {
    priceDirections: Record<string, PriceDirection>;
}

export default function FuturesTab({ priceDirections }: FuturesTabProps) {
    const { futuresData, loading: dataLoading } = useFutures();
    const { alerts, saveAlerts } = useFuturesAlerts();
    const { syncFutures } = useFuturesSync();

    const { account, positions, lastSync } = futuresData;

    const [selectedPosition, setSelectedPosition] = useState<FuturesPosition | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [expandedPosition, setExpandedPosition] = useState<string | null>(null);
    const [openAlertsKey, setOpenAlertsKey] = useState<string | null>(null);
    const [openLiqInfoKey, setOpenLiqInfoKey] = useState<string | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [syncError, setSyncError] = useState<string | null>(null);
    const [syncSuccess, setSyncSuccess] = useState(false);
    const [showSettings, setShowSettings] = useState(true);
    const [showGlobalAlertModal, setShowGlobalAlertModal] = useState(false);

    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 60_000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        const performSync = async () => {
            try {
                setSyncing(true);
                setSyncError(null);
                await syncFutures();
            } catch (error: any) {
                console.error("[FuturesTab] Sync FAILED:", error?.code, error?.message, error);
                setSyncError(`Error: ${error?.message || "Error al sincronizar"}`);
            } finally {
                setSyncing(false);
            }
        };
        performSync();
    }, [syncFutures]);

    const handleOpenAlertModal = (pos: FuturesPosition) => {
        setSelectedPosition(pos);
        setIsModalOpen(true);
    };

    const handleSavePositionAlerts = (symbol: string, newAlerts: FuturesPositionAlert[]) => {
        const updatedPositionAlerts = { ...alerts.positionAlerts };
        if (newAlerts.length === 0) {
            delete updatedPositionAlerts[symbol];
        } else {
            const existingAlerts = alerts.positionAlerts?.[symbol] || [];
            const mergedAlerts = newAlerts.map((newAlert) => {
                const match = existingAlerts.find(
                    (a) => a.type === newAlert.type && a.targetValue === newAlert.targetValue && a.direction === newAlert.direction
                );
                if (match?._lastSide) {
                    return { ...newAlert, _lastSide: match._lastSide };
                }
                return newAlert;
            });
            updatedPositionAlerts[symbol] = mergedAlerts;
        }
        saveAlerts({ ...alerts, positionAlerts: updatedPositionAlerts });
    };

    const handleManualSync = async () => {
        if (syncing) return;
        try {
            setSyncing(true);
            setSyncError(null);
            setSyncSuccess(false);
            await syncFutures();
            setSyncSuccess(true);
            setTimeout(() => setSyncSuccess(false), 2000);
        } catch (error: any) {
            console.error("[FuturesTab] Manual sync FAILED:", error?.code, error?.message, error);
            setSyncError(`Error: ${error?.message || "Error al sincronizar"}`);
        } finally {
            setSyncing(false);
        }
    };

    const positionSymbols = useMemo(
        () => Array.from(new Set(positions.map((p) => p.symbol))),
        [positions],
    );
    const { markPrices: liveMarkPrices, status: wsStatus } =
        useBinanceFuturesMarkPrices(positionSymbols);

    const livePositions = useMemo(
        () => applyLivePrices(positions, liveMarkPrices),
        [positions, liveMarkPrices],
    );

    const migratedAlerts = useMemo(() => ({
        ...alerts,
        globalAlerts: alerts.globalAlerts || [],
    }), [alerts]);

    const hasLivePrices = liveMarkPrices && Object.keys(liveMarkPrices).length > 0;
    const totalPnl =
        wsStatus === "live" && hasLivePrices
            ? sumUnrealizedPnl(livePositions)
            : safeNum(account.totalUnrealizedProfit);
    const marginRatio = safeNum(account.marginRatio);
    const marginColor = getMarginColor(marginRatio);
    const marginLabel = getMarginLabel(marginRatio);
    const marginLabelColor = getMarginLabelColor(marginRatio);
    const marginBarColor = getMarginBarColor(marginRatio);

    const effLeverageMetrics = useMemo(() => {
        let totalLong = 0; let totalShort = 0;
        for (const p of livePositions) {
            if (p.side === "LONG") totalLong += p.notional;
            else totalShort += p.notional;
        }
        const totalN = totalLong + totalShort;
        const netExp = totalLong - totalShort;
        const effLev = account.totalMarginBalance > 0 ? totalN / account.totalMarginBalance : 0;
        return { totalNotional: totalN, netExposure: netExp, effectiveLeverage: effLev };
    }, [livePositions, account.totalMarginBalance]);

    const healthDist = useMemo(() => {
        const denom = Math.max(account.totalMarginBalance, 1);
        const initialPct = Math.min(100, Math.max(0, (safeNum(account.totalInitialMargin) / denom) * 100));
        const availPct = Math.min(100 - initialPct, Math.max(0, (safeNum(account.availableBalance) / denom) * 100));
        return { initialPct, availPct };
    }, [account.totalMarginBalance, account.totalInitialMargin, account.availableBalance]);

    const ageMin = lastSync > 0 ? (now - lastSync) / 60_000 : 0;
    const isStale5 = ageMin > 5;
    const isStale15 = ageMin > 15;

    const sortedPositions = useMemo(
        () => [...livePositions].sort((a, b) => b.unrealizedPnl - a.unrealizedPnl),
        [livePositions],
    );

    if (dataLoading) {
        return <div className="text-center py-20 text-slate-500 animate-pulse">Cargando datos de futuros...</div>;
    }

    const TABLE_COLS = 13;

    return (
        <div className="space-y-3 sm:space-y-4">
            {/* ── HEADER (compact, single line) ── */}
            <header className="flex items-center justify-between gap-2 flex-wrap rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
                        <Activity className="text-indigo-300" size={15} />
                    </div>
                    <h2 className="text-sm font-bold tracking-tight text-white">FUTUROS</h2>
                    <LiveBadge status={wsStatus} />
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                    {lastSync > 0 && (
                        <span className="flex items-center gap-1 text-[10px] text-slate-500 bg-white/[0.03] border border-white/[0.06] rounded-md px-2 py-1 whitespace-nowrap">
                            <Clock size={11} />
                            {new Date(lastSync).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                            {isStale15 && <span className="text-rose-400 font-medium">· {Math.round(ageMin)}min</span>}
                            {isStale5 && !isStale15 && <span className="text-amber-400 font-medium">· {Math.round(ageMin)}min</span>}
                        </span>
                    )}
                    <button
                        onClick={handleManualSync}
                        disabled={syncing}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                            syncing
                                ? "bg-white/[0.04] text-slate-500 cursor-not-allowed border border-white/[0.06]"
                                : syncSuccess
                                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                  : "bg-indigo-500/15 text-indigo-300 border border-indigo-500/25 hover:bg-indigo-500/25"
                        }`}
                    >
                        {syncing ? <><Clock size={12} className="animate-spin" />Sync...</> : syncSuccess ? <><CheckCircle size={12} />OK</> : <><Zap size={12} />Sincronizar</>}
                    </button>
                    <button
                        onClick={() => setShowSettings(!showSettings)}
                        className={`flex items-center px-2 py-1 rounded-md transition-all border ${showSettings ? "bg-white/[0.06] text-white border-white/[0.12]" : "bg-white/[0.02] text-slate-400 border-white/[0.06] hover:text-white"}`}
                        title="Configuración de alertas"
                    >
                        <Settings size={13} />
                    </button>
                </div>
            </header>

            {syncError && (
                <div className="bg-rose-500/10 border border-rose-500/25 rounded-lg p-2.5">
                    <div className="flex items-center gap-2 text-rose-400 text-xs"><AlertTriangle size={14} />{syncError}</div>
                </div>
            )}

            {/* ── RESUMEN SUPERIOR ── */}
            <section className="space-y-2.5">
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    <StatCard icon={Wallet} label="Balance Total" value={fmtUSD(account.totalWalletBalance)} />
                    <StatCard
                        icon={totalPnl >= 0 ? TrendingUp : TrendingDown}
                        label="PnL No Realizado"
                        value={formatPnl(totalPnl)}
                        valueClass={totalPnl >= 0 ? "text-emerald-400" : "text-rose-400"}
                        accent={totalPnl >= 0 ? "green" : "red"}
                    />
                    <StatCard icon={ArrowUpRight} label="Transferible" value={fmtUSD(account.maxWithdrawAmount)} />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1.5 sm:gap-2">
                    <MiniStat icon={Gauge} label="Bal. de Margen" value={fmtUSD(account.totalMarginBalance)} />
                    <MiniStat icon={Shield} label="Marg. Manto." value={fmtUSD(account.totalMaintMargin)} />
                    <MiniStat icon={Layers} label="Marg. Inicial" value={fmtUSD(account.totalInitialMargin)} />
                    <MiniStat icon={Shield} label="Seguro / Ratio" value={`${marginRatio.toFixed(2)}%`} valueClass={marginColor} />
                    <MiniStat icon={Activity} label="Posiciones" value={`${livePositions.length}`} />
                    <MiniStat icon={Gauge} label="Apal. Efectivo" value={`${effLeverageMetrics.effectiveLeverage.toFixed(1)}x`} />
                    <MiniStat
                        icon={effLeverageMetrics.netExposure >= 0 ? TrendingUp : TrendingDown}
                        label="Exp. Neta"
                        value={`${effLeverageMetrics.netExposure >= 0 ? "+" : ""}${fmtUSD(effLeverageMetrics.netExposure)}`}
                        valueClass={effLeverageMetrics.netExposure >= 0 ? "text-emerald-400" : "text-rose-400"}
                    />
                </div>
            </section>

            {/* ── POSICIONES ABIERTAS ── */}
            <section>
                <div className="flex items-center justify-between mb-2.5">
                    <h3 className="text-white font-semibold flex items-center gap-2 text-sm">
                        <Activity className="text-violet-400" size={16} />
                        POSICIONES ABIERTAS
                        <span className="text-slate-500 text-xs font-normal">({livePositions.length})</span>
                    </h3>
                </div>

                {livePositions.length === 0 ? (
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
                        <div className="text-slate-500">No hay posiciones abiertas</div>
                    </div>
                ) : (
                    <>
                        {/* Desktop / Tablet: TABLE */}
                        <div className="hidden sm:block rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[900px]">
                                    <thead>
                                        <tr className="border-b border-white/[0.07] text-[9px] uppercase tracking-wider text-slate-500">
                                            <th className="px-3 py-2 text-left font-medium">Símbolo</th>
                                            <th className="px-2 py-2 text-center font-medium">Lado</th>
                                            <th className="px-2 py-2 text-center font-medium">Ap</th>
                                            <th className="px-3 py-2 text-right font-medium">PnL</th>
                                            <th className="px-3 py-2 text-right font-medium">ROE</th>
                                            <th className="px-3 py-2 text-right font-medium">Entrada</th>
                                            <th className="px-3 py-2 text-right font-medium">Actual</th>
                                            <th className="px-3 py-2 text-right font-medium">Break Even</th>
                                            <th className="px-3 py-2 text-right font-medium">Liquidación</th>
                                            <th className="px-3 py-2 text-right font-medium">Tamaño / Valor</th>
                                            <th className="px-3 py-2 text-right font-medium">Margen</th>
                                            <th className="px-3 py-2 text-center font-medium">Dist. Liq</th>
                                            <th className="px-3 py-2 text-center font-medium">Alertas</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sortedPositions.map((pos) => {
                                            const isLong = pos.side === "LONG";
                                            const pnlPositive = pos.unrealizedPnl >= 0;
                                            const hasLiq = pos.liquidationPrice > 0;
                                            const distColor = hasLiq ? getDistToLiqColor(pos.distToLiqPercent) : "text-slate-600";
                                            const distBarColor = hasLiq ? getDistToLiqBarColor(pos.distToLiqPercent) : "bg-slate-700";
                                            const liqDir = getDistToLiqDirection(pos.side);
                                            const liqDirColor = getDistToLiqDirectionColor(pos.side);
                                            const posAlerts = alerts.positionAlerts?.[pos.symbol] || [];
                                            const posKey = `${pos.symbol}-${pos.side}`;
                                            const tradesOpen = expandedPosition === posKey;
                                            const alertsOpen = openAlertsKey === posKey;
                                            const liqInfoOpen = openLiqInfoKey === posKey;
                                            const base = pos.symbol.replace("USDT", "");

                                            return (
                                                <React.Fragment key={posKey}>
                                                    <tr
                                                        className={`border-b border-white/[0.04] hover:bg-white/[0.025] transition-colors cursor-pointer ${tradesOpen ? "bg-white/[0.02]" : ""}`}
                                                        onClick={() => setExpandedPosition(tradesOpen ? null : posKey)}
                                                    >
                                                        <td className="px-3 py-2.5 text-left">
                                                            <div className="flex items-center gap-1.5">
                                                                <ChevronRight size={12} className={`text-slate-600 transition-transform flex-shrink-0 ${tradesOpen ? "rotate-90" : ""}`} />
                                                                <span className="font-semibold text-white text-xs">{pos.symbol}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-2 py-2.5 text-center">
                                                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${isLong ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"}`}>{pos.side}</span>
                                                        </td>
                                                        <td className="px-2 py-2.5 text-center text-[10px] text-slate-400">{pos.leverage}x</td>
                                                        <td className={`px-3 py-2.5 text-right font-mono text-xs tabular-nums font-bold ${pnlPositive ? "text-emerald-400" : "text-rose-400"}`}>{formatPnl(pos.unrealizedPnl)}</td>
                                                        <td className={`px-3 py-2.5 text-right font-mono text-[11px] tabular-nums ${pnlPositive ? "text-emerald-400/80" : "text-rose-400/80"}`}>{formatRoe(pos.roe)}</td>
                                                        <td className="px-3 py-2.5 text-right font-mono text-[11px] text-slate-300 tabular-nums">{fmtPrice(pos.entryPrice)}</td>
                                                        <td className="px-3 py-2.5 text-right font-mono text-[11px] text-white tabular-nums">{fmtPrice(pos.markPrice)}</td>
                                                        <td className="px-3 py-2.5 text-right font-mono text-[11px] text-slate-300 tabular-nums">{fmtPrice(pos.breakEvenPrice)}</td>
                                                        <td className={`px-3 py-2.5 text-right font-mono text-[11px] tabular-nums ${hasLiq ? distColor : "text-slate-600"}`}>{hasLiq ? fmtPrice(pos.liquidationPrice) : "Sin dato"}</td>
                                                        <td className="px-3 py-2.5 text-right">
                                                            <div className="font-mono text-[11px] text-white tabular-nums">{fmtUSD(pos.notional)}</div>
                                                            <div className="text-[9px] text-slate-500">{pos.size} {base}</div>
                                                        </td>
                                                        <td className="px-3 py-2.5 text-right font-mono text-[11px] text-slate-300 tabular-nums">{fmtUSD(pos.initialMargin)}</td>
                                                        <td className="px-3 py-2.5 text-center">
                                                            <div className="flex flex-col items-center gap-1 min-w-[70px]">
                                                                <span className={`text-[10px] font-bold ${distColor}`}>{hasLiq ? `${pos.distToLiqPercent.toFixed(1)}%` : "Sin dato"}</span>
                                                                {hasLiq && (
                                                                    <div className="w-full bg-white/[0.06] rounded-full h-1.5 overflow-hidden">
                                                                        <div className={`h-full rounded-full transition-all duration-500 ${distBarColor}`} style={{ width: `${Math.min(pos.distToLiqPercent, 100)}%` }} />
                                                                    </div>
                                                                )}
                                                                <div className="flex items-center gap-0.5">
                                                                    {hasLiq && (
                                                                        <span className={`inline-flex items-center gap-0.5 text-[9px] font-medium ${liqDirColor}`}>
                                                                            {isLong ? <ArrowDown size={8} /> : <ArrowUp size={8} />}
                                                                            {liqDir}
                                                                        </span>
                                                                    )}
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); setOpenLiqInfoKey(liqInfoOpen ? null : posKey); }}
                                                                        className={`text-slate-600 hover:text-amber-400 transition-colors ${liqInfoOpen ? "text-amber-400" : ""}`}
                                                                        title="¿Cómo funciona?"
                                                    >
                                                                        <Info size={11} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-2.5 text-center">
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); setOpenAlertsKey(alertsOpen ? null : posKey); }}
                                                                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors border ${
                                                                    alertsOpen
                                                                        ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                                                                        : posAlerts.length > 0
                                                                          ? "bg-amber-500/10 text-amber-400 border-amber-500/25 hover:bg-amber-500/20"
                                                                          : "bg-white/[0.03] text-slate-500 border-white/[0.06] hover:text-slate-300"
                                                                }`}
                                                            >
                                                                <Bell size={10} />
                                                                {posAlerts.length}
                                                            </button>
                                                        </td>
                                                    </tr>
                                                    {tradesOpen && (
                                                        <tr className="bg-black/20">
                                                            <td colSpan={TABLE_COLS}><PositionTradesDetail position={pos} /></td>
                                                        </tr>
                                                    )}
                                                    {liqInfoOpen && (
                                                        <tr className="bg-black/20">
                                                            <td colSpan={TABLE_COLS}><LiqExplanation pos={pos} /></td>
                                                        </tr>
                                                    )}
                                                    {alertsOpen && (
                                                        <tr className="bg-black/20">
                                                            <td colSpan={TABLE_COLS}>
                                                                <div className="px-4 py-3 space-y-2">
                                                                    {posAlerts.length === 0 ? (
                                                                        <div className="text-xs text-slate-600">Sin alertas configuradas para esta posición.</div>
                                                                    ) : (
                                                                        <div className="space-y-1.5">
                                                                            {posAlerts.map((alert, i) => (
                                                                                <div key={i} className={`flex items-center gap-2 flex-wrap rounded-lg px-3 py-1.5 text-xs border ${alert.direction === "up" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20"}`}>
                                                                                    <Bell size={10} className="flex-shrink-0" />
                                                                                    <span className="font-medium">{alert.type === "roe" ? "ROE %" : "ROE USD"} {alert.direction === "up" ? ">=" : "<="} {alert.type === "roe" ? `${alert.targetValue}%` : `$${alert.targetValue}`}</span>
                                                                                    <span className="text-slate-500">{alert.isPersistent ? "∞ siempre" : "1× una vez"}</span>
                                                                                    {alert.note && <span className="text-slate-500 truncate">— {alert.note}</span>}
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                    <button
                                                                        onClick={() => handleOpenAlertModal(pos)}
                                                                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500 text-black hover:bg-amber-400 transition-colors"
                                                                    >
                                                                        <Bell size={12} /> Configurar Alerta
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Mobile: compact cards */}
                        <div className="sm:hidden space-y-2.5">
                            {sortedPositions.map((pos) => {
                                const posAlerts = alerts.positionAlerts?.[pos.symbol] || [];
                                const posKey = `${pos.symbol}-${pos.side}`;
                                const tradesOpen = expandedPosition === posKey;
                                const alertsOpen = openAlertsKey === posKey;
                                const liqInfoOpen = openLiqInfoKey === posKey;
                                return (
                                    <div key={posKey} className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                                        <MobilePositionCard
                                            pos={pos}
                                            onClick={() => setExpandedPosition(tradesOpen ? null : posKey)}
                                        />
                                        <div className="flex items-center gap-1.5 px-3 py-2 border-t border-white/[0.04]">
                                            <button
                                                onClick={() => setOpenAlertsKey(alertsOpen ? null : posKey)}
                                                className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors border ${alertsOpen ? "bg-amber-500/15 text-amber-400 border-amber-500/30" : posAlerts.length > 0 ? "bg-amber-500/10 text-amber-400 border-amber-500/25" : "bg-white/[0.03] text-slate-500 border-white/[0.06]"}`}
                                            >
                                                <Bell size={10} />Alertas ({posAlerts.length})
                                            </button>
                                            <button
                                                onClick={() => setOpenLiqInfoKey(liqInfoOpen ? null : posKey)}
                                                className={`flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors border ${liqInfoOpen ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/30" : "bg-white/[0.03] text-slate-500 border-white/[0.06]"}`}
                                            >
                                                <Info size={10} />Liq
                                            </button>
                                        </div>
                                        {tradesOpen && <PositionTradesDetail position={pos} />}
                                        {liqInfoOpen && <LiqExplanation pos={pos} />}
                                        {alertsOpen && (
                                            <div className="px-3 pb-3 space-y-2 border-t border-white/[0.04] pt-2.5">
                                                {posAlerts.length === 0 ? (
                                                    <div className="text-[11px] text-slate-600">Sin alertas configuradas para esta posición.</div>
                                                ) : (
                                                    <div className="space-y-1.5">
                                                        {posAlerts.map((alert, i) => (
                                                            <div key={i} className={`flex items-center gap-2 flex-wrap rounded-lg px-2.5 py-1.5 text-[11px] border ${alert.direction === "up" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20"}`}>
                                                                <Bell size={9} className="flex-shrink-0" />
                                                                <span className="font-medium">{alert.type === "roe" ? "ROE %" : "ROE USD"} {alert.direction === "up" ? ">=" : "<="} {alert.type === "roe" ? `${alert.targetValue}%` : `$${alert.targetValue}`}</span>
                                                                <span className="text-slate-500">{alert.isPersistent ? "∞" : "1×"}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                <button onClick={() => handleOpenAlertModal(pos)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-medium bg-amber-500 text-black hover:bg-amber-400 transition-colors">
                                                    <Bell size={11} /> Configurar Alerta
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </section>

            {/* ── Alertas de PNL Global (debajo de posiciones, siempre visibles) ── */}
            <GlobalPnlAlerts
                alerts={migratedAlerts}
                account={account}
                onOpenGlobalAlertModal={() => setShowGlobalAlertModal(true)}
            />

            {/* ── SALUD DE CUENTA ── */}
            <section className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3.5 sm:p-4">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-white font-semibold flex items-center gap-2 text-sm">
                        <Shield className="text-violet-400" size={16} />
                        SALUD DE CUENTA
                    </h3>
                    <span className={`text-xs font-semibold ${marginLabelColor}`}>{marginLabel}</span>
                </div>
                <div className="space-y-3.5">
                    <div>
                        <div className="flex justify-between items-center mb-1.5">
                            <span className="text-[11px] text-slate-500">Margen utilizado (mant. / balance)</span>
                            <span className={`text-sm font-bold ${marginColor}`}>{marginRatio.toFixed(2)}%</span>
                        </div>
                        <div className="relative w-full bg-white/[0.06] rounded-full h-2.5 overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-500 ${marginBarColor}`} style={{ width: `${Math.min(marginRatio, 100)}%` }} />
                        </div>
                        <div className="relative h-0">{[50, 80, 95].map((t) => <div key={t} className="absolute top-0 w-px h-2.5 bg-slate-600/70" style={{ left: `${t}%` }} />)}</div>
                        <div className="flex justify-between text-[9px] text-slate-600 mt-1.5">
                            <span>Seguro</span><span>Precaución</span><span>Peligro</span><span>Liquidación</span>
                        </div>
                    </div>
                    <div>
                        <div className="flex justify-between items-center mb-1.5">
                            <span className="text-[11px] text-slate-500">Distribución del Balance de Margen</span>
                            <span className="text-[11px] text-slate-500 font-mono">{fmtUSD(account.totalMarginBalance)}</span>
                        </div>
                        <div className="w-full bg-white/[0.06] rounded-full h-3 overflow-hidden flex">
                            <div className="h-full bg-indigo-500/70 transition-all duration-500" style={{ width: `${healthDist.initialPct}%` }} />
                            <div className="h-full bg-emerald-500/60 transition-all duration-500" style={{ width: `${healthDist.availPct}%` }} />
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px]">
                            <span className="flex items-center gap-1">
                                <span className="inline-block w-2 h-2 rounded-sm bg-indigo-500/70" />
                                <span className="text-slate-400">Inicial</span>
                                <span className="text-white font-mono">{fmtUSD(account.totalInitialMargin)}</span>
                                <span className="text-slate-600">({healthDist.initialPct.toFixed(1)}%)</span>
                            </span>
                            <span className="flex items-center gap-1">
                                <span className="inline-block w-2 h-2 rounded-sm bg-emerald-500/60" />
                                <span className="text-slate-400">Disponible</span>
                                <span className="text-white font-mono">{fmtUSD(account.availableBalance)}</span>
                                <span className="text-slate-600">({healthDist.availPct.toFixed(1)}%)</span>
                            </span>
                            <span className="flex items-center gap-1">
                                <span className="inline-block w-2 h-2 rounded-sm bg-amber-500/60" />
                                <span className="text-slate-400">Mantenimiento</span>
                                <span className="text-white font-mono">{fmtUSD(account.totalMaintMargin)}</span>
                            </span>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Stress Test de Cuenta ── */}
            <StressTestSimulator positions={livePositions} account={account} />

            {/* ── Last Sync stale warning ── */}
            {lastSync > 0 && (isStale5 || isStale15) && (
                <div className="flex items-center justify-center">
                    {isStale15 ? (
                        <span className="px-2.5 py-1 rounded-lg bg-rose-500/15 text-rose-400 border border-rose-500/25 font-medium text-[11px]">
                            ⚠ Datos muy antiguos ({Math.round(ageMin)} min)
                        </span>
                    ) : (
                        <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/25 font-medium text-[11px]">
                            ⚠ Datos desactualizados ({Math.round(ageMin)} min)
                        </span>
                    )}
                </div>
            )}

            {/* ── Configuración de alertas de futuros (final de página) ── */}
            {showSettings && (
                <AlertSettings alerts={migratedAlerts} onSave={saveAlerts} />
            )}

            {/* ── Global PNL Alert Modal ── */}
            {showGlobalAlertModal && (
                <FuturesGlobalAlertModal
                    currentAlerts={migratedAlerts.globalAlerts || []}
                    currentPnl={account.totalUnrealizedProfit}
                    onSaveAlerts={(globalAlerts) => saveAlerts({ ...migratedAlerts, globalAlerts })}
                    onClose={() => setShowGlobalAlertModal(false)}
                />
            )}

            {/* ── Position Alert Modal ── */}
            {isModalOpen && selectedPosition && (
                <FuturesPositionAlertModal
                    position={selectedPosition}
                    currentAlerts={alerts.positionAlerts?.[selectedPosition.symbol] || []}
                    onSave={(newAlerts) => handleSavePositionAlerts(selectedPosition.symbol, newAlerts)}
                    onClose={() => { setIsModalOpen(false); setSelectedPosition(null); }}
                />
            )}
        </div>
    );
}
