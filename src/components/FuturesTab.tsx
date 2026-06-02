import React, { useMemo, useState } from "react";
import {
    Activity,
    TrendingUp,
    TrendingDown,
    Shield,
    AlertTriangle,
    CheckCircle,
    RefreshCw,
    Clock,
    Zap,
    DollarSign,
    Target,
    Bell,
} from "lucide-react";
import { useFutures, useFuturesAlerts } from "../hooks/useFutures";
import {
    FuturesPosition,
    FuturesPositionAlert,
    formatPnl,
    formatRoe,
    getMarginColor,
    getMarginBarColor,
    getMarginLabel,
    getMarginLabelColor,
    getDistToLiqColor,
    getDistToLiqBarColor,
    FuturesAlertConfig,
} from "../lib/futures";
import FuturesPositionAlertModal from "./FuturesPositionAlertModal";

// ─── Position Card ────────────────────────────────────────────────────────────

function PositionCard({ pos }: { pos: FuturesPosition }) {
    const isLong = pos.side === "LONG";
    const pnlPositive = pos.unrealizedPnl >= 0;
    const distColor = getDistToLiqColor(pos.distToLiqPercent);
    const distBarColor = getDistToLiqBarColor(pos.distToLiqPercent);

    return (
        <div className="bg-[#0E1014] rounded-xl border border-gray-800 p-4 hover:border-gray-700 transition-colors">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${isLong ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                        {isLong ? "LONG" : "SHORT"}
                    </span>
                    <span className="text-white font-bold text-base">{pos.symbol}</span>
                    <span className="text-gray-500 text-xs">{pos.leverage}x</span>
                </div>
                <div className={`text-right font-bold ${pnlPositive ? "text-green-400" : "text-red-400"}`}>
                    {formatPnl(pos.unrealizedPnl)}
                    <div className="text-xs font-normal text-gray-500">{formatRoe(pos.roe)}</div>
                </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                <div>
                    <div className="text-xs text-gray-500">Precio de Entrada</div>
                    <div className="text-white text-sm font-mono">${pos.entryPrice.toLocaleString()}</div>
                </div>
                <div>
                    <div className="text-xs text-gray-500">Precio Actual</div>
                    <div className="text-white text-sm font-mono">${pos.markPrice.toLocaleString()}</div>
                </div>
                <div>
                    <div className="text-xs text-gray-500">Liquidación</div>
                    <div className={`text-sm font-mono ${distColor}`}>${pos.liquidationPrice.toLocaleString()}</div>
                </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                <div>
                    <div className="text-xs text-gray-500">Tamaño</div>
                    <div className="text-white text-sm">{pos.size} {pos.symbol.replace("USDT", "")}</div>
                </div>
                <div>
                    <div className="text-xs text-gray-500">Valor de la Posición</div>
                    <div className="text-white text-sm">${pos.notional.toFixed(2)}</div>
                </div>
                <div>
                    <div className="text-xs text-gray-500">Margen (Depósito de Garantía)</div>
                    <div className="text-white text-sm">${pos.initialMargin.toFixed(2)}</div>
                </div>
            </div>

            {/* Distance to liquidation bar */}
            <div>
                <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-gray-500">Distancia a liquidación</span>
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

    const handleLiqChange = (value: string) => {
        const num = parseInt(value);
        if (!isNaN(num) && num >= 1 && num <= 50) {
            onSave({ ...alerts, positionLiqThreshold: num });
        }
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

                {/* Position liquidation threshold */}
                <div>
                    <div className="text-sm text-gray-400 mb-2">
                        Alerta de posición cercana a liquidación:
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="number"
                            min="1"
                            max="50"
                            value={alerts.positionLiqThreshold}
                            onChange={(e) => handleLiqChange(e.target.value)}
                            className="w-20 bg-[#0E1014] border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm outline-none focus:border-red-500 transition-colors"
                        />
                        <span className="text-gray-500 text-sm">% de distancia a liquidación</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface FuturesTabProps {
    prices: Record<string, number>;
}

export default function FuturesTab({ prices }: FuturesTabProps) {
    const { futuresData, loading: dataLoading } = useFutures();
    const { alerts, loading: alertsLoading, saveAlerts } = useFuturesAlerts();

    const { account, positions, lastSync } = futuresData;

    // Modal state
    const [selectedPosition, setSelectedPosition] = useState<FuturesPosition | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const handleOpenAlertModal = (pos: FuturesPosition) => {
        setSelectedPosition(pos);
        setIsModalOpen(true);
    };

    const handleSavePositionAlerts = (symbol: string, newAlerts: FuturesPositionAlert[]) => {
        const updatedPositionAlerts = { ...alerts.positionAlerts };
        if (newAlerts.length === 0) {
            delete updatedPositionAlerts[symbol];
        } else {
            updatedPositionAlerts[symbol] = newAlerts;
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
            return { ...pos, unrealizedPnl: livePnl, roe: liveRoe };
        });
    }, [enrichedPositions]);

    const totalPnl = livePositions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
    const marginRatio = account.marginRatio ?? (account as any).marginUsedPercent ?? 0;
    const marginColor = getMarginColor(marginRatio);
    const marginBarColor = getMarginBarColor(marginRatio);
    const marginLabel = getMarginLabel(marginRatio);
    const marginLabelColor = getMarginLabelColor(marginRatio);

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
                <div className="bg-[#181A20] rounded-xl border border-gray-800 p-3">
                    <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                        <DollarSign size={12} /> Balance
                    </div>
                    <div className="text-white text-lg font-bold">
                        ${account.totalWalletBalance.toFixed(2)}
                    </div>
                </div>
                <div className="bg-[#181A20] rounded-xl border border-gray-800 p-3">
                    <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
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
                <div className="bg-[#181A20] rounded-xl border border-gray-800 p-3">
                    <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                        <Target size={12} /> Disponible
                    </div>
                    <div className="text-white text-lg font-bold">
                        ${account.availableBalance.toFixed(2)}
                    </div>
                </div>
                <div className="bg-[#181A20] rounded-xl border border-gray-800 p-3">
                    <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
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
                    <div className={`text-5xl font-bold ${marginColor}`}>
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
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[#0E1014] rounded-lg p-3 border border-gray-800">
                        <div className="text-xs text-gray-500 mb-1">Balance de Margen</div>
                        <div className="text-white text-lg font-bold font-mono">
                            ${account.totalMarginBalance.toFixed(2)}
                        </div>
                        <div className="text-xs text-gray-600">USDT</div>
                    </div>
                    <div className="bg-[#0E1014] rounded-lg p-3 border border-gray-800">
                        <div className="text-xs text-gray-500 mb-1">Margen de Mantenimiento</div>
                        <div className="text-white text-lg font-bold font-mono">
                            ${account.totalMaintMargin.toFixed(2)}
                        </div>
                        <div className="text-xs text-gray-600">USDT</div>
                    </div>
                    <div className="bg-[#0E1014] rounded-lg p-3 border border-gray-800">
                        <div className="text-xs text-gray-500 mb-1">Margen Inicial (Usado)</div>
                        <div className="text-white text-lg font-bold font-mono">
                            ${account.totalInitialMargin.toFixed(2)}
                        </div>
                        <div className="text-xs text-gray-600">USDT</div>
                    </div>
                    <div className="bg-[#0E1014] rounded-lg p-3 border border-gray-800">
                        <div className="text-xs text-gray-500 mb-1">Disponible</div>
                        <div className="text-green-400 text-lg font-bold font-mono">
                            ${account.availableBalance.toFixed(2)}
                        </div>
                        <div className="text-xs text-gray-600">USDT</div>
                    </div>
                </div>
            </div>

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
                                <div key={pos.symbol}>
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
            {lastSync > 0 && (
                <div className="text-center text-xs text-gray-600 flex items-center justify-center gap-1">
                    <Clock size={12} />
                    Última sincronización:{" "}
                    {new Date(lastSync).toLocaleTimeString("es-AR", {
                        hour: "2-digit",
                        minute: "2-digit",
                    })}
                </div>
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
