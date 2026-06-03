import React, { useMemo, useState, useEffect } from "react";
import {
    Activity,
    TrendingUp,
    TrendingDown,
    Shield,
    AlertTriangle,
    Clock,
    Zap,
    DollarSign,
    Target,
    Bell,
    FlaskConical,
    ArrowUp,
    ArrowDown,
    ArrowUpRight,
} from "lucide-react";
import { useFutures, useFuturesAlerts } from "../hooks/useFutures";
import {
    FuturesPosition,
    FuturesPositionAlert,
    FuturesAccount,
    FuturesAlertConfig,
    formatPnl,
    formatRoe,
    getMarginColor,
    getMarginBarColor,
    getMarginLabel,
    getMarginLabelColor,
    getDistToLiqColor,
    getDistToLiqBarColor,
    getDistToLiqDirection,
    getDistToLiqDirectionColor,
    simulateMarketMove,
    findLiquidationThreshold,
} from "../lib/futures";
import { fmtPercent } from "../lib/format";
import FuturesPositionAlertModal from "./FuturesPositionAlertModal";

// ─── Position Card ────────────────────────────────────────────────────────────

function PositionCard({ pos }: { pos: FuturesPosition }) {
    const isLong = pos.side === "LONG";
    const pnlPositive = pos.unrealizedPnl >= 0;
    const distColor = getDistToLiqColor(pos.distToLiqPercent);
    const distBarColor = getDistToLiqBarColor(pos.distToLiqPercent);
    const liqDir = getDistToLiqDirection(pos.side);
    const liqDirColor = getDistToLiqDirectionColor(pos.side);

    return (
        <div className="bg-[#0E1014] rounded-xl border border-gray-800 p-4 hover:border-gray-700 transition-colors">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 flex-1">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${isLong ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                        {isLong ? "LONG" : "SHORT"}
                    </span>
                    <span className="text-white font-bold text-base">{pos.symbol}</span>
                    <span className="text-gray-500 text-xs">{pos.leverage}x</span>
                </div>
                <div className={`flex-1 text-center font-bold ${pnlPositive ? "text-green-400" : "text-red-400"}`}>
                    {formatPnl(pos.unrealizedPnl)}
                    <div className="text-xs font-normal text-gray-500">{formatRoe(pos.roe)}</div>
                </div>
                <div className="flex-1"></div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-7 gap-2 sm:gap-3 mb-3">
                <div>
                    <div className="text-xs text-gray-500">Entrada</div>
                    <div className="text-white text-sm font-mono">${pos.entryPrice.toLocaleString()}</div>
                </div>
                <div className="text-right sm:text-left">
                    <div className="text-xs text-gray-500">Break Even</div>
                    <div className="text-white text-sm font-mono">${pos.breakEvenPrice.toLocaleString()}</div>
                </div>
                <div>
                    <div className="text-xs text-gray-500">Actual</div>
                    <div className="text-white text-sm font-mono">${pos.markPrice.toLocaleString()}</div>
                </div>
                <div className="text-right sm:text-left">
                    <div className="text-xs text-gray-500">Liquidación</div>
                    <div className={`text-sm font-mono ${distColor}`}>${pos.liquidationPrice.toLocaleString()}</div>
                </div>
                <div>
                    <div className="text-xs text-gray-500">Tamaño</div>
                    <div className="text-white text-sm">{pos.size} {pos.symbol.replace("USDT", "")}</div>
                </div>
                <div className="text-right sm:text-left">
                    <div className="text-xs text-gray-500">Valor</div>
                    <div className="text-white text-sm">${pos.notional.toFixed(2)}</div>
                </div>
                <div>
                    <div className="text-xs text-gray-500">Margen</div>
                    <div className="text-white text-sm">${pos.initialMargin.toFixed(2)}</div>
                </div>
            </div>

            {/* Distance to liquidation bar with direction */}
            <div>
                <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                        Distancia a liquidación
                        <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${liqDirColor}`}>
                            {isLong ? <ArrowDown size={10} /> : <ArrowUp size={10} />}
                            {liqDir}
                        </span>
                    </span>
                    <span className={`text-xs font-bold ${distColor}`}>{pos.distToLiqPercent.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all duration-500 ${distBarColor}`}
                        style={{ width: `${Math.min(pos.distToLiqPercent, 100)}%` }}
                    />
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
        if (val >= 90) return "bg-red-500/20 text-red-400 border-red-500/40";
        if (val >= 80) return "bg-orange-500/20 text-orange-400 border-orange-500/40";
        if (val >= 70) return "bg-yellow-500/20 text-yellow-400 border-yellow-500/40";
        return "bg-green-500/20 text-green-400 border-green-500/40";
    };

    return (
        <div className="bg-[#181A20] rounded-xl border border-gray-800 p-4">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-semibold flex items-center gap-2">
                    <Zap className="text-yellow-400" size={18} />
                    Alertas de Futuros
                </h3>
                <button
                    onClick={toggleEnabled}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                        alerts.enabled
                            ? "bg-green-500/20 text-green-400 border border-green-500/40"
                            : "bg-gray-700 text-gray-400 border border-gray-600"
                    }`}
                >
                    {alerts.enabled ? "Activo" : "Desactivado"}
                </button>
            </div>

            <div className="space-y-4">
                {/* Margin thresholds */}
                <div>
                    <div className="text-sm text-gray-400 mb-2">
                        Notificarme cuando el margen supere:
                    </div>
                    <div className="flex flex-wrap gap-2 mb-2">
                        {alerts.marginThresholds.map((threshold) => (
                            <span
                                key={threshold}
                                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium border ${getThresholdColor(threshold)}`}
                            >
                                {threshold}%
                                <button
                                    onClick={() => removeThreshold(threshold)}
                                    className="ml-1 hover:text-white transition-colors"
                                >
                                    ✕
                                </button>
                            </span>
                        ))}
                        {alerts.marginThresholds.length === 0 && (
                            <span className="text-gray-600 text-sm">Sin umbrales configurados</span>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <input
                            type="number"
                            min="1"
                            max="99"
                            value={newThreshold}
                            onChange={(e) => setNewThreshold(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && addThreshold()}
                            placeholder="%"
                            className="w-20 bg-[#0E1014] border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm outline-none focus:border-yellow-500 transition-colors"
                        />
                        <button
                            onClick={addThreshold}
                            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-yellow-500 text-black hover:bg-yellow-400 transition-colors"
                        >
                            + Agregar
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}

// ─── Cross-Margin Simulator ────────────────────────────────────────────────────

function CrossMarginSimulator({
    positions,
    account,
}: {
    positions: FuturesPosition[];
    account: FuturesAccount;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [movePercent, setMovePercent] = useState(0);

    // Effective leverage and net exposure
    const { totalLongNotional, totalShortNotional } = useMemo(() => {
        let longs = 0;
        let shorts = 0;
        for (const p of positions) {
            if (p.side === "LONG") longs += p.notional;
            else shorts += p.notional;
        }
        return { totalLongNotional: longs, totalShortNotional: shorts };
    }, [positions]);

    const totalNotional = totalLongNotional + totalShortNotional;
    const netExposure = totalLongNotional - totalShortNotional;
    const effectiveLeverage = account.totalMarginBalance > 0
        ? totalNotional / account.totalMarginBalance
        : 0;

    const simulation = useMemo(
        () => simulateMarketMove(positions, account, movePercent),
        [positions, account, movePercent],
    );

    const currentPnlSum = useMemo(
        () => positions.reduce((s, p) => s + p.unrealizedPnl, 0),
        [positions],
    );

    const balanceChangePercent = account.totalMarginBalance > 0
        ? (simulation.newUnrealizedPnl - currentPnlSum) / account.totalMarginBalance * 100
        : 0;

    const liqThresholdDown = useMemo(
        () => findLiquidationThreshold(positions, account, "down"),
        [positions, account],
    );
    const liqThresholdUp = useMemo(
        () => findLiquidationThreshold(positions, account, "up"),
        [positions, account],
    );

    const simMarginColor = getMarginColor(simulation.newMarginRatio);
    const simMarginBarColor = getMarginBarColor(simulation.newMarginRatio);
    const simPnlPositive = simulation.newUnrealizedPnl >= 0;

    const netExposureLabel = netExposure >= 0 ? "LONG" : "SHORT";
    const netExposureColor = netExposure >= 0 ? "text-green-400" : "text-red-400";

    const moveLabel =
        movePercent === 0
            ? "Actual"
            : movePercent < 0
              ? `${fmtPercent(movePercent)} caída`
              : `${fmtPercent(movePercent)} subida`;

    return (
        <div className="bg-[#181A20] rounded-xl border border-gray-800 overflow-hidden">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-4 hover:bg-[#1E2028] transition-colors"
            >
                <h3 className="text-white font-semibold flex items-center gap-2">
                    <FlaskConical className="text-purple-400" size={18} />
                    Simulador de Liquidación
                </h3>
                <span className="text-gray-500 text-xs">
                    {isOpen ? "▲" : "▼"}
                </span>
            </button>

            {isOpen && (
                <div className="px-4 pb-4 space-y-4">
                    {/* Effective leverage & exposure */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-[#0E1014] rounded-lg p-3 border border-gray-800">
                            <div className="text-xs text-gray-500 mb-1">Apalancamiento Efectivo</div>
                            <div className="text-white text-lg font-bold">
                                {effectiveLeverage.toFixed(1)}x
                            </div>
                            <div className="text-xs text-gray-600">
                                {totalNotional.toFixed(2)} USDT en posiciones
                            </div>
                        </div>
                        <div className="bg-[#0E1014] rounded-lg p-3 border border-gray-800">
                            <div className="text-xs text-gray-500 mb-1">Exposición Neta</div>
                            <div className={`text-lg font-bold ${netExposureColor}`}>
                                {netExposure >= 0 ? "+" : ""}${netExposure.toFixed(2)}
                            </div>
                            <div className="text-xs text-gray-600">
                                {netExposureLabel}
                            </div>
                        </div>
                    </div>

                    {/* Disclaimer */}
                    <div className="text-xs text-gray-600 bg-[#0E1014] rounded-lg px-3 py-2 border border-gray-800">
                        ⚙ La simulación asume movimiento uniforme del mercado para todas las posiciones. Resultados aproximados.
                    </div>

                    {/* Slider */}
                    <div>
                        <div className="flex items-center justify-between text-sm text-gray-400 mb-2">
                            <span className="text-red-400 flex items-center gap-1">
                                <ArrowDown size={14} /> Caída
                            </span>
                            <div className="flex flex-col items-center">
                                <span className="text-white font-bold text-lg">{moveLabel}</span>
                                {movePercent !== 0 && (
                                    <span className={`text-xs font-medium ${balanceChangePercent >= 0 ? "text-green-400" : "text-red-400"}`}>
                        Balance: {fmtPercent(balanceChangePercent)}
                                    </span>
                                )}
                            </div>
                            <span className="text-green-400 flex items-center gap-1">
                                <ArrowUp size={14} /> Subida
                            </span>
                        </div>
                        <div className="relative">
                            <input
                                type="range"
                                min="-100"
                                max="100"
                                step="1"
                                value={movePercent}
                                onChange={(e) => setMovePercent(Number(e.target.value))}
                                className="w-full cursor-pointer accent-purple-500"
                            />
                            <div className="flex justify-between text-xs text-gray-600 mt-1">
                                <span>-100%</span>
                                <span className="text-gray-400 font-bold">0%</span>
                                <span>+100%</span>
                            </div>
                        </div>
                        {/* Markers for liquidation points */}
                        {liqThresholdDown !== null && (
                            <div className="text-xs mt-1 flex items-center gap-1 text-red-400">
                                <ArrowDown size={10} /> Liq. con caída de{" "}
                                <strong>{Math.abs(liqThresholdDown).toFixed(1)}%</strong>
                            </div>
                        )}
                        {liqThresholdUp !== null && (
                            <div className="text-xs flex items-center gap-1 text-yellow-400">
                                <ArrowUp size={10} /> Liq. con subida de{" "}
                                <strong>{liqThresholdUp.toFixed(1)}%</strong>
                            </div>
                        )}
                    </div>

                    {/* Projected margin gauge */}
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-xs text-gray-500">Margen proyectado</span>
                            <div className="flex items-center gap-2">
                                <span className={`text-xs font-bold ${simMarginColor}`}>
                                    {simulation.newMarginRatio.toFixed(2)}%
                                </span>
                                {simulation.isLiquidated && (
                                    <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded font-bold">
                                        LIQUIDADO
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="w-full bg-gray-800 rounded-full h-2.5 overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-300 ${simMarginBarColor}`}
                                style={{ width: `${Math.min(simulation.newMarginRatio, 100)}%` }}
                            />
                        </div>
                        {/* Threshold markers */}
                        <div className="relative h-0">
                            {[50, 80, 95].map((t) => (
                                <div
                                    key={t}
                                    className="absolute top-1 w-px h-2 bg-gray-600"
                                    style={{ left: `${t}%` }}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Projected values grid */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-[#0E1014] rounded-lg p-3 border border-gray-800">
                            <div className="text-xs text-gray-500 mb-1">Balance de Margen</div>
                            <div className="text-white text-lg font-bold font-mono">
                                ${simulation.newMarginBalance.toFixed(2)}
                            </div>
                        </div>
                        <div className="bg-[#0E1014] rounded-lg p-3 border border-gray-800">
                            <div className="text-xs text-gray-500 mb-1">PnL Proyectado</div>
                            <div className={`text-lg font-bold font-mono ${simPnlPositive ? "text-green-400" : "text-red-400"}`}>
                                {formatPnl(simulation.newUnrealizedPnl)}
                            </div>
                        </div>
                    </div>

                    {/* Status + buffer */}
                    {!simulation.isLiquidated && (
                        <div className={`rounded-lg p-3 border text-center ${
                            simulation.newMarginRatio >= 80
                                ? "bg-orange-950/30 border-orange-800/50 text-orange-300"
                                : simulation.newMarginRatio >= 50
                                  ? "bg-yellow-950/30 border-yellow-800/50 text-yellow-300"
                                  : "bg-green-950/30 border-green-800/50 text-green-300"
                        }`}>
                            <span className="font-bold text-sm">Buffer hasta liquidación: </span>
                            <span className="font-bold text-lg">
                                {simulation.bufferToLiq.toFixed(1)}%
                            </span>
                        </div>
                    )}
                    {simulation.isLiquidated && (
                        <div className="bg-red-950/40 border border-red-800/60 rounded-lg p-3 text-center">
                            <AlertTriangle size={20} className="text-red-400 mx-auto mb-1" />
                            <span className="text-red-300 font-bold text-sm">
                                LIQUIDACIÓN ALCANZADA con {moveLabel}
                            </span>
                        </div>
                    )}

                    {/* Liq thresholds summary */}
                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 pt-1 border-t border-gray-800">
                        <div className="flex items-center gap-1">
                            <ArrowDown size={12} className="text-red-400" />
                            Caída máx. segura:
                            <strong className={liqThresholdDown !== null ? "text-red-400" : "text-green-400"}>
                                {liqThresholdDown !== null
                                    ? `${Math.abs(liqThresholdDown).toFixed(1)}%`
                                    : "Ilimitada"}
                            </strong>
                        </div>
                        <div className="flex items-center gap-1 justify-end">
                            Subida máx. segura:
                            <strong className={liqThresholdUp !== null ? "text-yellow-400" : "text-green-400"}>
                                {liqThresholdUp !== null
                                    ? `${liqThresholdUp.toFixed(1)}%`
                                    : "Ilimitada"}
                            </strong>
                            <ArrowUp size={12} className="text-yellow-400" />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface FuturesTabProps {
    prices: Record<string, number>;
}

export default function FuturesTab({ prices }: FuturesTabProps) {
    const { futuresData, loading: dataLoading } = useFutures();
    const { alerts, saveAlerts } = useFuturesAlerts();

    const { account, positions, lastSync } = futuresData;

    // Modal state
    const [selectedPosition, setSelectedPosition] = useState<FuturesPosition | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Re-render every 60s to update stale data indicator
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 60_000);
        return () => clearInterval(id);
    }, []);

    const handleOpenAlertModal = (pos: FuturesPosition) => {
        setSelectedPosition(pos);
        setIsModalOpen(true);
    };

    const handleSavePositionAlerts = (symbol: string, newAlerts: FuturesPositionAlert[]) => {
        const updatedPositionAlerts = { ...alerts.positionAlerts };
        if (newAlerts.length === 0) {
            delete updatedPositionAlerts[symbol];
        } else {
            // Preserve _lastSide from existing alerts to avoid losing cooldown state
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

    // Enrich positions with live prices from Binance spot
    const enrichedPositions = useMemo(() => {
        if (Object.keys(prices).length === 0) return positions;
        return positions.map((pos) => {
            const coin = pos.symbol.replace("USDT", "");
            const livePrice = prices[coin] || pos.markPrice;
            return { ...pos, markPrice: livePrice };
        });
    }, [positions, prices]);

    // Recalculate PnL with live prices
    const livePositions = useMemo(() => {
        return enrichedPositions.map((pos) => {
            const priceDiff = pos.markPrice - pos.entryPrice;
            const livePnl =
                pos.side === "LONG"
                    ? priceDiff * pos.size
                    : -priceDiff * pos.size;
            const liveRoe =
                pos.initialMargin > 0 ? (livePnl / pos.initialMargin) * 100 : 0;
            const liveDistToLiq =
                pos.liquidationPrice > 0
                    ? pos.side === "LONG"
                        ? ((pos.markPrice - pos.liquidationPrice) / pos.markPrice) * 100
                        : ((pos.liquidationPrice - pos.markPrice) / pos.markPrice) * 100
                    : 999;
            return { ...pos, unrealizedPnl: livePnl, roe: liveRoe, distToLiqPercent: liveDistToLiq };
        });
    }, [enrichedPositions]);

    const totalPnl = account.totalUnrealizedProfit;
    const marginRatio = account.marginRatio ?? (account as any).marginUsedPercent ?? 0;
    const marginColor = getMarginColor(marginRatio);
    const marginBarColor = getMarginBarColor(marginRatio);
    const marginLabel = getMarginLabel(marginRatio);
    const marginLabelColor = getMarginLabelColor(marginRatio);

    // Effective leverage & net exposure for cross-margin context
    const effLeverageMetrics = useMemo(() => {
        let totalLong = 0;
        let totalShort = 0;
        for (const p of livePositions) {
            if (p.side === "LONG") totalLong += p.notional;
            else totalShort += p.notional;
        }
        const totalN = totalLong + totalShort;
        const netExp = totalLong - totalShort;
        const effLev = account.totalMarginBalance > 0 ? totalN / account.totalMarginBalance : 0;
        return { totalNotional: totalN, netExposure: netExp, effectiveLeverage: effLev };
    }, [livePositions, account.totalMarginBalance]);

    if (dataLoading) {
        return (
            <div className="text-center py-10 text-gray-500 animate-pulse">
                Cargando datos de futuros...
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* ── Account Summary Cards ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-[#181A20] rounded-xl border border-gray-800 p-3 flex flex-col items-center text-center">
                    <div className="text-xs text-gray-500 mb-1 flex items-center justify-center gap-1">
                        <DollarSign size={12} /> Balance
                    </div>
                    <div className="text-white text-lg font-bold">
                        ${account.totalWalletBalance.toFixed(2)}
                    </div>
                </div>
                <div className="bg-[#181A20] rounded-xl border border-gray-800 p-3 flex flex-col items-center text-center">
                    <div className="text-xs text-gray-500 mb-1 flex items-center justify-center gap-1">
                        {totalPnl >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />} PnL
                    </div>
                    <div
                        className={`text-lg font-bold ${
                            totalPnl >= 0 ? "text-green-400" : "text-red-400"
                        }`}
                    >
                        {formatPnl(totalPnl)}
                    </div>
                </div>
                {/* Disponible para Transferir */}
                <div className="bg-[#181A20] rounded-xl border border-gray-800 p-3 flex flex-col items-center text-center">
                    <div className="text-xs text-gray-500 mb-1 flex items-center justify-center gap-1">
                        <ArrowUpRight size={12} /> Transferible
                    </div>
                    <div className="text-white text-lg font-bold">
                        ${account.maxWithdrawAmount.toFixed(2)}
                    </div>
                </div>
                <div className="bg-[#181A20] rounded-xl border border-gray-800 p-3 flex flex-col items-center text-center">
                    <div className="text-xs text-gray-500 mb-1 flex items-center justify-center gap-1">
                        <Shield size={12} /> Posiciones
                    </div>
                    <div className="text-white text-lg font-bold">
                        {livePositions.length}
                    </div>
                </div>
            </div>

            {/* ── Margin Gauge — Binance Style ── */}
            <div className="bg-[#181A20] rounded-xl border border-gray-800 p-5">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-white font-semibold flex items-center gap-2">
                        <Shield className="text-blue-400" size={18} />
                        Margen Cross
                    </h3>
                    <span className="text-xs text-gray-500">USDT</span>
                </div>

                {/* Big ratio number */}
                <div className="text-center mb-4">
                    <div className={`text-4xl sm:text-5xl font-bold ${marginColor}`}>
                        {marginRatio.toFixed(2)}%
                    </div>
                    <div className={`text-sm font-medium mt-1 ${marginLabelColor}`}>
                        {marginLabel}
                    </div>
                </div>

                {/* Progress bar — 0% (safe) to 100% (liquidation) */}
                <div className="relative mb-2">
                    <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-700 ${marginBarColor}`}
                            style={{ width: `${Math.min(marginRatio, 100)}%` }}
                        />
                    </div>
                    {/* Threshold markers */}
                    {[50, 80, 95].map((t) => (
                        <div
                            key={t}
                            className="absolute top-0 bottom-0 w-px bg-gray-600"
                            style={{ left: `${t}%` }}
                        />
                    ))}
                </div>
                <div className="flex justify-between text-xs text-gray-600 mb-4">
                    <span>0% Seguro</span>
                    <span>50%</span>
                    <span>80%</span>
                    <span>95%</span>
                    <span>100% Liq</span>
                </div>

                {/* Key values grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
                    <div className="bg-[#0E1014] rounded-lg p-2 sm:p-3 border border-gray-800 flex flex-col items-center text-center">
                        <div className="text-xs text-gray-500 mb-1">Balance de Margen</div>
                        <div className="text-white text-lg font-bold font-mono">
                            ${account.totalMarginBalance.toFixed(2)}
                        </div>
                        <div className="text-xs text-gray-600">USDT</div>
                    </div>
                    <div className="bg-[#0E1014] rounded-lg p-2 sm:p-3 border border-gray-800 flex flex-col items-center text-center">
                        <div className="text-xs text-gray-500 mb-1">Margen de Mantenimiento</div>
                        <div className="text-white text-lg font-bold font-mono">
                            ${account.totalMaintMargin.toFixed(2)}
                        </div>
                        <div className="text-xs text-gray-600">USDT</div>
                    </div>
                    <div className="bg-[#0E1014] rounded-lg p-2 sm:p-3 border border-gray-800 flex flex-col items-center text-center">
                        <div className="text-xs text-gray-500 mb-1">Margen Inicial</div>
                        <div className="text-white text-lg font-bold font-mono">
                            ${account.totalInitialMargin.toFixed(2)}
                        </div>
                        <div className="text-xs text-gray-600">USDT</div>
                    </div>
                    <div className="bg-[#0E1014] rounded-lg p-2 sm:p-3 border border-gray-800 flex flex-col items-center text-center">
                        <div className="text-xs text-gray-500 mb-1">Disponible</div>
                        <div className="text-green-400 text-lg font-bold font-mono">
                            ${account.availableBalance.toFixed(2)}
                        </div>
                        <div className="text-xs text-gray-600">USDT</div>
                    </div>
                    {livePositions.length > 0 && (
                        <>
                            <div className="bg-[#0E1014] rounded-lg p-2 sm:p-3 border border-gray-800 flex flex-col items-center text-center">
                                <div className="text-xs text-gray-500 mb-1">Apalancamiento Efectivo</div>
                                <div className="text-white text-lg font-bold">{effLeverageMetrics.effectiveLeverage.toFixed(1)}x</div>
                                <div className="text-xs text-gray-600">{effLeverageMetrics.totalNotional.toFixed(2)} USDT</div>
                            </div>
                            <div className="bg-[#0E1014] rounded-lg p-2 sm:p-3 border border-gray-800 flex flex-col items-center text-center">
                                <div className="text-xs text-gray-500 mb-1">Exposición Neta</div>
                                <div className={`text-lg font-bold ${effLeverageMetrics.netExposure >= 0 ? "text-green-400" : "text-red-400"}`}>
                                    {effLeverageMetrics.netExposure >= 0 ? "+" : ""}${effLeverageMetrics.netExposure.toFixed(2)}
                                </div>
                                <div className="text-xs text-gray-600">{effLeverageMetrics.netExposure >= 0 ? "LONG" : "SHORT"}</div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* ── Cross-Margin Simulator ── */}
            <CrossMarginSimulator positions={livePositions} account={account} />

            {/* ── Positions ── */}
            <div>
                <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                    <Activity className="text-purple-400" size={18} />
                    Posiciones Abiertas
                </h3>
                <div className="space-y-3">
                    {livePositions.length === 0 ? (
                        <div className="bg-[#181A20] rounded-xl border border-gray-800 p-8 text-center">
                            <div className="text-gray-500">No hay posiciones abiertas</div>
                        </div>
                    ) : (
                        livePositions.map((pos) => {
                            const posAlerts = alerts.positionAlerts?.[pos.symbol] || [];
                            return (
                                <div key={`${pos.symbol}-${pos.side}`}>
                                    <PositionCard pos={pos} />
                                    {/* Alert button and existing alerts */}
                                    <div className="bg-[#181A20] rounded-b-xl border border-t-0 border-gray-800 px-4 py-2 flex items-center justify-between">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {posAlerts.length === 0 ? (
                                                <span className="text-xs text-gray-600">Sin alertas</span>
                                            ) : (
                                                posAlerts.map((alert, i) => (
                                                    <span
                                                        key={i}
                                                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                                                            alert.direction === "up"
                                                                ? "bg-green-500/10 text-green-400 border border-green-500/20"
                                                                : "bg-red-500/10 text-red-400 border border-red-500/20"
                                                        }`}
                                                    >
                                                        <Bell size={10} />
                                                        {alert.type === "roe" ? "ROE %" : "ROE USD"}{" "}
                                                        {alert.direction === "up" ? ">=" : "<="}{" "}
                                                        {alert.type === "roe" ? `${alert.targetValue}%` : `$${alert.targetValue}`}
                                                        <span className="text-gray-600 ml-0.5">{alert.isPersistent ? "∞" : "1×"}</span>
                                                    </span>
                                                ))
                                            )}
                                        </div>
                                        <button
                                            onClick={() => handleOpenAlertModal(pos)}
                                            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30 transition-colors"
                                        >
                                            <Bell size={12} />
                                            Alerta
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* ── Alert Settings ── */}
            <AlertSettings alerts={alerts} onSave={saveAlerts} />

            {/* ── Last Sync ── */}
            {lastSync > 0 && (() => {
                const ageMin = (now - lastSync) / 60_000;
                const isStale5 = ageMin > 5;
                const isStale15 = ageMin > 15;
                return (
                    <div className="flex items-center justify-center gap-2 text-xs">
                        <span className="text-gray-600 flex items-center gap-1">
                            <Clock size={12} />
                            Sync: {new Date(lastSync).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        {isStale15 && (
                            <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 font-medium">
                                ⚠ Datos muy antiguos ({Math.round(ageMin)}min)
                            </span>
                        )}
                        {isStale5 && !isStale15 && (
                            <span className="px-2 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30 font-medium">
                                ⚠ Datos desactualizados ({Math.round(ageMin)}min)
                            </span>
                        )}
                    </div>
                );
            })()}

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
