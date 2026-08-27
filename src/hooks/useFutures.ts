import { useState, useEffect, useCallback } from "react";
import { db, doc, onSnapshot, setDoc } from "../lib/firebase";
import {
    FuturesData,
    FuturesAlertConfig,
    FuturesGlobalAlert,
    DEFAULT_FUTURES_DATA,
    DEFAULT_FUTURES_ALERTS,
} from "../lib/futures";

export function useFutures() {
    const [futuresData, setFuturesData] = useState<FuturesData>(DEFAULT_FUTURES_DATA);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Listen to futures data in real-time
    useEffect(() => {
        const docRef = doc(db, "settings", "futuresData");

        const unsubscribe = onSnapshot(
            docRef,
            (snapshot) => {
                if (snapshot.exists()) {
                    const data = snapshot.data() as FuturesData;
                    setFuturesData(data);
                } else {
                    setFuturesData(DEFAULT_FUTURES_DATA);
                }
                setLoading(false);
            },
            (err) => {
                console.error("Error fetching futures data", err);
                setError("Error de conexión");
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, []);

    return { futuresData, loading, error };
}

export function useFuturesAlerts() {
    const [alerts, setAlerts] = useState<FuturesAlertConfig>(DEFAULT_FUTURES_ALERTS);
    const [loading, setLoading] = useState(true);

    // Listen to alert config in real-time
    useEffect(() => {
        const docRef = doc(db, "config", "alerts");

        const unsubscribe = onSnapshot(
            docRef,
            (snapshot) => {
                if (snapshot.exists()) {
                    const data = snapshot.data();
                    if (data?.futuresAlerts) {
                        const raw = data.futuresAlerts as FuturesAlertConfig;
                        const globalAlerts: FuturesGlobalAlert[] = Array.isArray(raw.globalAlerts)
                            ? raw.globalAlerts.map((alert) => ({
                                  ...alert,
                                  direction: alert.direction || (alert.targetAmount >= 0 ? "up" : "down"),
                              }))
                            : [];
                        setAlerts({ ...DEFAULT_FUTURES_ALERTS, ...raw, globalAlerts });
                    } else {
                        setAlerts((prev) => ({ ...prev, globalAlerts: prev.globalAlerts ?? [] }));
                    }
                }
                setLoading(false);
            },
            () => {
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, []);

    const saveAlerts = useCallback(async (newAlerts: FuturesAlertConfig) => {
        setAlerts(newAlerts);
        try {
            const docRef = doc(db, "config", "alerts");
            const toSave: FuturesAlertConfig = {
                ...newAlerts,
                _lastAlertedMargin: newAlerts._lastAlertedMargin ?? null,
            };
            // Firestore no acepta `undefined` (ej. note vacío). Sanitizamos como en useAlerts.
            const cleanToSave = JSON.parse(JSON.stringify(toSave));
            await setDoc(docRef, { futuresAlerts: cleanToSave }, { merge: true });
        } catch (err) {
            console.error("Error saving futures alerts", err);
        }
    }, []);

    return { alerts, loading, saveAlerts };
}
