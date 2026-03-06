import { useState, useEffect } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

export interface InvestmentAlert {
    targetPercent: number;
    isPersistent?: boolean;
}

export interface AlertConfig {
    minPNL: number;
    maxPNL: number;
    investmentAlerts?: Record<string, InvestmentAlert[]>;
}

export function useAlerts() {
    const [config, setConfig] = useState<AlertConfig>({ minPNL: -40000, maxPNL: 10000, investmentAlerts: {} });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onSnapshot(
            doc(db, "config", "alerts"),
            (snap) => {
                if (snap.exists()) {
                    const data = snap.data();

                    // ── Normalize legacy format ─────────────────────────────
                    const rawAlerts = data.investmentAlerts ?? {};
                    const normalizedAlerts: Record<string, { targetPercent: number; isPersistent?: boolean }[]> = {};
                    for (const [id, value] of Object.entries(rawAlerts)) {
                        if (Array.isArray(value)) {
                            normalizedAlerts[id] = value as { targetPercent: number; isPersistent?: boolean }[];
                        } else if (value && typeof value === "object") {
                            // Legacy single-object → wrap in array
                            normalizedAlerts[id] = [value as { targetPercent: number; isPersistent?: boolean }];
                        }
                    }

                    setConfig({
                        minPNL: data.minPNL ?? -40000,
                        maxPNL: data.maxPNL ?? 10000,
                        investmentAlerts: normalizedAlerts,
                    });
                } else {
                    // Si no existe, inicializamos con defecto o limpiamos
                    setConfig({ minPNL: -40000, maxPNL: 10000, investmentAlerts: {} });
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
