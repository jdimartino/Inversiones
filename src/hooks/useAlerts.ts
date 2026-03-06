import { useState, useEffect } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

export interface InvestmentAlert {
    targetPercent: number;
    isPersistent?: boolean;
    direction?: 'up' | 'down';
}

export interface GlobalAlert {
    targetAmount: number;
    isPersistent?: boolean;
    direction?: 'up' | 'down';
}

export interface AlertConfig {
    minPNL?: number; // Legacy
    maxPNL?: number; // Legacy
    globalAlerts?: GlobalAlert[];
    investmentAlerts?: Record<string, InvestmentAlert[]>;
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
                            // Inject direction for older array-based alerts that lack it
                            normalizedAlerts[id] = value.map(alert => ({
                                ...alert,
                                direction: alert.direction || (alert.targetPercent >= 0 ? 'up' : 'down')
                            }));
                        } else if (value && typeof value === "object") {
                            // Legacy single-object → wrap in array and inject direction
                            const legacyAlert = value as InvestmentAlert;
                            normalizedAlerts[id] = [{
                                ...legacyAlert,
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

                    setConfig({
                        minPNL: data.minPNL ?? -40000,
                        maxPNL: data.maxPNL ?? 10000,
                        investmentAlerts: normalizedAlerts,
                        globalAlerts: normalizedGlobalAlerts,
                    });
                } else {
                    // Si no existe, inicializamos con defecto o limpiamos
                    setConfig({ minPNL: -40000, maxPNL: 10000, investmentAlerts: {}, globalAlerts: [] });
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
            // El onSnapshot actualizará el estado local automáticamente, pero podemos aplicarlo
            // de inmediato en la UI para mayor fluidez.
            setConfig(newConfig);
            await setDoc(doc(db, "config", "alerts"), newConfig, { merge: true });
            return true;
        } catch (e) {
            console.error("Error saving alerts", e);
            return false;
        }
    };

    return { config, loading, saveConfig };
}
