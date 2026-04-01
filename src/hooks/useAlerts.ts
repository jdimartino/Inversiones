import { useState, useEffect } from "react";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

// NOTE: setDoc with { merge: true } is used instead of plain setDoc to avoid
// overwriting fields managed by the Cloud Function (e.g. triggered one-shot alerts
// that were already removed). This prevents race conditions where a stale frontend
// state could restore a deleted alert.

export interface InvestmentAlert {
    type?: 'pnl' | 'price';
    targetPercent: number; // for pnl type
    targetValue?: number;   // for price type
    isPersistent?: boolean;
    direction?: 'up' | 'down';
}

export interface GlobalAlert {
    targetAmount: number;
    isPersistent?: boolean;
    direction?: 'up' | 'down';
}

export interface WatchlistAlert {
    targetValue: number;
    direction: 'up' | 'down';
    isPersistent?: boolean;
}

export interface AlertConfig {
    minPNL?: number; // Legacy
    maxPNL?: number; // Legacy
    globalAlerts?: GlobalAlert[];
    investmentAlerts?: Record<string, InvestmentAlert[]>;
    watchlistAlerts?: Record<string, WatchlistAlert[]>;
}

export function useAlerts() {
    const [config, setConfig] = useState<AlertConfig>({ minPNL: -40000, maxPNL: 10000, investmentAlerts: {}, globalAlerts: [] });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onSnapshot(
            doc(db, "config", "alerts"),
            (snap) => {
                if (snap.exists()) {
                    const data = snap.data();

                    // ── Normalize legacy format ─────────────────────────────
                    const rawAlerts = data.investmentAlerts ?? {};
                    const normalizedAlerts: Record<string, InvestmentAlert[]> = {};
                    for (const [id, value] of Object.entries(rawAlerts)) {
                        if (Array.isArray(value)) {
                            // Inject direction and type for older array-based alerts that lack it
                            normalizedAlerts[id] = value.map(alert => ({
                                ...alert,
                                type: alert.type || 'pnl',
                                direction: alert.direction || 
                                    (alert.type === 'price' 
                                        ? 'up' // price alerts usually need explicit direction, but default to up
                                        : (alert.targetPercent >= 0 ? 'up' : 'down'))
                            }));
                        } else if (value && typeof value === "object") {
                            // Legacy single-object → wrap in array and inject direction
                            const legacyAlert = value as InvestmentAlert;
                            normalizedAlerts[id] = [{
                                ...legacyAlert,
                                type: legacyAlert.type || 'pnl',
                                direction: legacyAlert.direction || (legacyAlert.targetPercent >= 0 ? 'up' : 'down')
                            }];
                        }
                    }

                    // ── Normalize global alerts ────────────────────────────
                    const rawGlobalAlerts = data.globalAlerts ?? [];
                    let normalizedGlobalAlerts: GlobalAlert[] = [];
                    if (Array.isArray(rawGlobalAlerts)) {
                        normalizedGlobalAlerts = rawGlobalAlerts.map((alert: any) => ({
                            ...alert,
                            direction: alert.direction || (alert.targetAmount >= 0 ? 'up' : 'down')
                        }));
                    }

                    // ── Normalize watchlist alerts ─────────────────────────
                    const rawWatchlist = data.watchlistAlerts ?? {};
                    const normalizedWatchlist: Record<string, WatchlistAlert[]> = {};
                    for (const [coin, value] of Object.entries(rawWatchlist)) {
                        if (Array.isArray(value)) {
                            normalizedWatchlist[coin] = value as WatchlistAlert[];
                        }
                    }

                    setConfig({
                        minPNL: data.minPNL ?? -40000,
                        maxPNL: data.maxPNL ?? 10000,
                        investmentAlerts: normalizedAlerts,
                        globalAlerts: normalizedGlobalAlerts,
                        watchlistAlerts: normalizedWatchlist,
                    });
                } else {
                    // Si no existe, inicializamos con defecto o limpiamos
                    setConfig({ minPNL: -40000, maxPNL: 10000, investmentAlerts: {}, globalAlerts: [], watchlistAlerts: {} });
                }
                setLoading(false);
            },
            (err) => {
                console.error("Error loading alerts snapshot", err);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, []);

    const saveConfig = async (newConfig: AlertConfig) => {
        try {
            // Update local state immediately for snappy UI
            setConfig(newConfig);

            // Firestore rejects any write containing `undefined`. Some nested fields like
            // `targetValue` in 'pnl' alerts are literally undefined in the frontend state.
            // JSON stringification is the most robust way to strip all undefined properties.
            const cleanConfig = JSON.parse(JSON.stringify(newConfig));

            // We use updateDoc (acting on specific fields) instead of setDoc to prevent
            // overwriting the entire document and recreating any legacy nested fields that
            // might be floating around, while also respecting Cloud Function deletions.
            // But since newConfig has all fields (globalAlerts, investmentAlerts, minPNL, maxPNL),
            // updateDoc will effectively merge these top-level fields safely.
            const docRef = doc(db, "config", "alerts");
            await updateDoc(docRef, cleanConfig);
            
            return true;
        } catch (e) {
            console.error("Error saving alerts", e);
            return false;
        }
    };

    return { config, loading, saveConfig };
}
