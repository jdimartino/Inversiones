import { useEffect, useRef, useState } from "react";

export type FuturesWSStatus = "idle" | "connecting" | "live" | "reconnecting";

const FSTREAM_BASE = "wss://fstream.binance.com/stream";
const MARK_PRICE_STREAM = "@markPrice@1s";
const MAX_RECONNECT_DELAY = 30_000;
const BASE_RECONNECT_DELAY = 1_000;

interface MarkPriceEvent {
    e: string;
    s: string;
    p: string;
    E: number;
}

/**
 * Subscribes to live Binance USDⓈ-M Futures mark prices for the given symbols.
 * Uses a single combined-stream WebSocket (`@markPrice@1s` = ~1s updates).
 *
 * - Subscribes only to symbols with open positions.
 * - Reconnects automatically with exponential backoff.
 * - Cleans up sockets/timers on unmount (no leaks, no duplicate connections).
 * - Returns `markPrices` (symbol -> latest mark price) and a connection status.
 */
export function useBinanceFuturesMarkPrices(symbols: string[]) {
    const [markPrices, setMarkPrices] = useState<Record<string, number>>({});
    const [status, setStatus] = useState<FuturesWSStatus>("idle");

    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const connectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const attemptRef = useRef(0);
    const symbolsRef = useRef<string[]>(symbols);
    const subscribedKeyRef = useRef("");

    // Keep the latest symbol list visible to async callbacks.
    useEffect(() => {
        symbolsRef.current = symbols;
    }, [symbols]);

    // Connect (or reconnect) to the combined stream for the current symbols.
    const connect = () => {
        if (connectTimerRef.current) {
            clearTimeout(connectTimerRef.current);
            connectTimerRef.current = null;
        }
        // Tear down any existing socket before opening a new one.
        if (wsRef.current) {
            wsRef.current.onclose = null;
            wsRef.current.onerror = null;
            wsRef.current.close();
            wsRef.current = null;
        }

        const syms = Array.from(new Set(symbolsRef.current));
        if (syms.length === 0) {
            setMarkPrices({});
            setStatus("idle");
            subscribedKeyRef.current = "";
            return;
        }

        const streams = syms
            .map((s) => `${s.toLowerCase()}${MARK_PRICE_STREAM}`)
            .join("/");
        const url = `${FSTREAM_BASE}?streams=${streams}`;

        setStatus(attemptRef.current === 0 ? "connecting" : "reconnecting");

        connectTimerRef.current = setTimeout(() => {
            connectTimerRef.current = null;
            const ws = new WebSocket(url);
            wsRef.current = ws;

            ws.onopen = () => {
                if (wsRef.current !== ws) return;
                attemptRef.current = 0;
                subscribedKeyRef.current = streams;
                setStatus("live");
            };

            ws.onmessage = (event) => {
                try {
                    const parsed = JSON.parse(event.data as string);
                    const data = parsed?.data ?? parsed;
                    if (
                        data?.e === "markPriceUpdate" &&
                        data?.s &&
                        data?.p !== undefined
                    ) {
                        const price = parseFloat(data.p);
                        if (Number.isFinite(price) && price > 0) {
                            setMarkPrices((prev) => {
                                if (prev[data.s] === price) return prev;
                                return { ...prev, [data.s]: price };
                            });
                        }
                    }
                } catch {
                    // Ignore malformed frames.
                }
            };

            ws.onerror = () => {
                // `onclose` always follows and handles the reconnect.
            };

            ws.onclose = () => {
                if (wsRef.current === ws) wsRef.current = null;

                // No positions anymore → stay idle, no streams kept open.
                if (symbolsRef.current.length === 0) {
                    setStatus("idle");
                    subscribedKeyRef.current = "";
                    return;
                }

                attemptRef.current += 1;
                const delay = Math.min(
                    MAX_RECONNECT_DELAY,
                    BASE_RECONNECT_DELAY * Math.pow(2, attemptRef.current - 1),
                );
                setStatus("reconnecting");

                if (reconnectTimerRef.current) {
                    clearTimeout(reconnectTimerRef.current);
                }
                reconnectTimerRef.current = setTimeout(() => {
                    reconnectTimerRef.current = null;
                    connect();
                }, delay);
            };
        }, 0);
    };

    // Reconnect whenever the set of open-position symbols changes.
    useEffect(() => {
        const syms = Array.from(new Set(symbolsRef.current)).sort().join(",");
        if (syms !== subscribedKeyRef.current) {
            attemptRef.current = 0;
            connect();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [symbols]);

    // Cleanup on unmount: close socket, clear timers.
    useEffect(() => {
        return () => {
            if (connectTimerRef.current) {
                clearTimeout(connectTimerRef.current);
                connectTimerRef.current = null;
            }
            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current);
                reconnectTimerRef.current = null;
            }
            if (wsRef.current) {
                wsRef.current.onclose = null;
                wsRef.current.onerror = null;
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, []);

    return { markPrices, status };
}