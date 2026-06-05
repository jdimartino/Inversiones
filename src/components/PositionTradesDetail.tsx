import React, { useState, useEffect } from "react";
import { Clock, DollarSign, Hash, Activity, Loader2, Receipt, ArrowUpRight, ArrowDownRight } from "lucide-react";
import type { FuturesPosition, PositionOrder } from "../lib/futures";
import { fmtPrice, fmtUSD } from "../lib/format";
import { FIREBASE_FUNCTIONS_URL } from "../lib/firebase";

interface PositionTradesDetailProps {
    position: FuturesPosition;
}

const PositionTradesDetail: React.FC<PositionTradesDetailProps> = ({ position }) => {
    const [orders, setOrders] = useState<PositionOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const abortController = new AbortController();

        const fetchOrders = async () => {
            try {
                setLoading(true);
                const url = `${FIREBASE_FUNCTIONS_URL}/getFuturesTrades?symbol=${position.symbol}`;

                const response = await fetch(url, { signal: abortController.signal });

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({ error: "Unknown error" }));
                    throw new Error(errData.error || `HTTP ${response.status}`);
                }

                const data = await response.json();
                if (!abortController.signal.aborted) {
                    setOrders(data.orders || []);
                }
            } catch (err: any) {
                if (err.name !== "AbortError") {
                    setError(err.message || "Error al cargar órdenes");
                }
            } finally {
                if (!abortController.signal.aborted) {
                    setLoading(false);
                }
            }
        };

        fetchOrders();
        return () => abortController.abort();
    }, [position.symbol]);

    const buyOrders = orders.filter((o) => o.side === "BUY");
    const sellOrders = orders.filter((o) => o.side === "SELL");

    const totalBuyQty = buyOrders.reduce((sum, o) => sum + o.executedQty, 0);
    const totalSellQty = sellOrders.reduce((sum, o) => sum + o.executedQty, 0);
    const totalBuyCost = buyOrders.reduce((sum, o) => sum + o.avgPrice * o.executedQty, 0);
    const totalSellRevenue = sellOrders.reduce((sum, o) => sum + o.avgPrice * o.executedQty, 0);
    const avgBuyPrice = totalBuyQty > 0 ? totalBuyCost / totalBuyQty : 0;
    const avgSellPrice = totalSellQty > 0 ? totalSellRevenue / totalSellQty : 0;

    const formatTime = (ts: number) => {
        const d = new Date(ts);
        return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" }) + " " +
            d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
    };

    const formatType = (type: string) => {
        // MARKET, LIMIT, STOP_MARKET, etc.
        return type.replace("_", " ");
    };

    return (
        <div className="bg-[#0E1014] border-x border-b border-gray-800 rounded-b-xl">
            {/* Summary Stats */}
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-px bg-gray-800">
                <div className="bg-[#0E1014] p-2">
                    <div className="text-[10px] text-gray-500 flex items-center gap-1">
                        <DollarSign size={9} /> P. Compra Prom.
                    </div>
                    <div className="text-green-400 text-xs font-bold font-mono">{fmtPrice(avgBuyPrice)}</div>
                </div>
                <div className="bg-[#0E1014] p-2">
                    <div className="text-[10px] text-gray-500 flex items-center gap-1">
                        <ArrowUpRight size={9} className="text-green-400" /> BUY
                    </div>
                    <div className="text-white text-xs font-bold font-mono">{totalBuyQty.toFixed(4)}</div>
                    <div className="text-gray-600 text-[10px]">{fmtUSD(totalBuyCost)}</div>
                </div>
                <div className="bg-[#0E1014] p-2">
                    <div className="text-[10px] text-gray-500 flex items-center gap-1">
                        <ArrowDownRight size={9} className="text-red-400" /> SELL
                    </div>
                    <div className="text-white text-xs font-bold font-mono">{totalSellQty.toFixed(4)}</div>
                    <div className="text-gray-600 text-[10px]">{fmtUSD(totalSellRevenue)}</div>
                </div>
                <div className="bg-[#0E1014] p-2">
                    <div className="text-[10px] text-gray-500 flex items-center gap-1">
                        <DollarSign size={9} /> P. Venta Prom.
                    </div>
                    <div className="text-red-400 text-xs font-bold font-mono">{fmtPrice(avgSellPrice)}</div>
                </div>
                <div className="bg-[#0E1014] p-2">
                    <div className="text-[10px] text-gray-500 flex items-center gap-1">
                        <Receipt size={9} /> Órdenes
                    </div>
                    <div className="text-white text-xs font-bold">{orders.length}</div>
                    <div className="text-gray-600 text-[10px]">BUY: {buyOrders.length} · SELL: {sellOrders.length}</div>
                </div>
            </div>

            {/* Orders List */}
            <div className="p-2 border-t border-gray-800">
                {loading ? (
                    <div className="text-center py-4 text-gray-500 flex items-center justify-center gap-2">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span className="text-xs">Cargando órdenes...</span>
                    </div>
                ) : error ? (
                    <div className="text-center py-3 text-red-400 text-xs">{error}</div>
                ) : orders.length === 0 ? (
                    <div className="text-center py-3 text-gray-500 text-xs">No hay órdenes registradas en los últimos 30 días</div>
                ) : (
                    <div className="space-y-1">
                        {orders.map((order) => (
                            <div
                                key={order.orderId}
                                className="flex items-center justify-between px-2 py-2 rounded bg-[#181A20]/50 hover:bg-[#181A20] transition-colors"
                            >
                                <div className="flex items-center gap-2">
                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold w-10 text-center ${
                                        order.side === "BUY"
                                            ? "bg-green-500/20 text-green-400"
                                            : "bg-red-500/20 text-red-400"
                                    }`}>
                                        {order.side}
                                    </span>
                                    <span className="text-gray-400 text-[10px] flex-shrink-0">{formatTime(order.time)}</span>
                                    <span className="text-[9px] text-blue-400">{formatType(order.type)}</span>
                                </div>
                                <div className="text-right">
                                    <div className="text-white text-xs font-mono font-bold">
                                        {fmtPrice(order.avgPrice)}
                                    </div>
                                    <div className="text-gray-500 text-[10px]">
                                        {order.executedQty.toFixed(4)} · Ord: #{order.orderId}
                                    </div>
                                </div>
                                <div className="text-right ml-2">
                                    <div className="text-gray-400 text-[10px]">
                                        {fmtUSD(order.avgPrice * order.executedQty)}
                                    </div>
                                    <div className="text-[10px] text-green-400">
                                        {order.status}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default PositionTradesDetail;