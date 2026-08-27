import { useEffect, useRef, useCallback, useState } from "react";
import type { Kline } from "../lib/types/signals";
import type { Interval } from "../lib/types/chart";

const INTERVAL_MAP: Record<Interval, string> = {
    "15m": "15m",
    "1h": "1h",
    "4h": "4h",
    "1d": "1d",
    "1M": "1M",
};

function bncUrl(symbol: string, interval: Interval): string {
    return `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_${INTERVAL_MAP[interval]}`;
}

interface UseKlineWebSocketParams {
    coin: string;
    interval: Interval;
    enabled: boolean;
    onKline: (kline: Kline) => void;
}

export function useKlineWebSocket({ coin, interval, enabled, onKline }: UseKlineWebSocketParams) {
    const [connected, setConnected] = useState(false);
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const connectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const onKlineRef = useRef(onKline);
    onKlineRef.current = onKline;

    const connect = useCallback(() => {
        if (connectTimer.current) {
            clearTimeout(connectTimer.current);
            connectTimer.current = null;
        }
        if (!enabled || !coin) { setConnected(false); return; }

        // Nullify handlers BEFORE closing to prevent stale onclose reconnection
        if (wsRef.current) {
            wsRef.current.onclose = null;
            wsRef.current.onerror = null;
            if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
                wsRef.current.close();
            }
            wsRef.current = null;
        }
        if (reconnectTimer.current) {
            clearTimeout(reconnectTimer.current);
            reconnectTimer.current = null;
        }

        setConnected(false);

        const url = bncUrl(coin, interval);
        connectTimer.current = setTimeout(() => {
            connectTimer.current = null;
            const ws = new WebSocket(url);
            wsRef.current = ws;

            ws.onopen = () => {
                if (wsRef.current !== ws) return;
                setConnected(true);
            };

            ws.onmessage = (event) => {
                if (wsRef.current !== ws) return;
                try {
                    const data = JSON.parse(event.data);
                    const k = data.k;
                    if (!k) return;
                    onKlineRef.current({
                        openTime: k.t,
                        open: parseFloat(k.o),
                        high: parseFloat(k.h),
                        low: parseFloat(k.l),
                        close: parseFloat(k.c),
                        volume: parseFloat(k.v),
                        closeTime: k.T,
                    });
                } catch { /* ignore parse errors */ }
            };

            ws.onerror = () => {};

            ws.onclose = () => {
                if (wsRef.current !== ws) return;
                wsRef.current = null;
                setConnected(false);
                if (enabled) {
                    reconnectTimer.current = setTimeout(connect, 3000);
                }
            };
        }, 0);
    }, [coin, interval, enabled]);

    useEffect(() => {
        connect();
        return () => {
            if (connectTimer.current) {
                clearTimeout(connectTimer.current);
                connectTimer.current = null;
            }
            if (reconnectTimer.current) {
                clearTimeout(reconnectTimer.current);
                reconnectTimer.current = null;
            }
            if (wsRef.current) {
                wsRef.current.onclose = null;
                wsRef.current.onerror = null;
                wsRef.current.close();
                wsRef.current = null;
            }
            setConnected(false);
        };
    }, [connect]);

    return { connected };
}
