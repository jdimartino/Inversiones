import { useState, useEffect } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
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
        async function load() {
            try {
                const snap = await getDoc(doc(db, "config", "alerts"));
                if (snap.exists()) {
                    const data = snap.data();

                    // ── Normalize legacy format ─────────────────────────────
                    // Old format: { [id]: { targetPercent, isPersistent } }
                    // New format: { [id]: [{ targetPercent, isPersistent }] }
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
                }
            } catch (e) {
                console.error("Error loading alerts", e);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []);

    const saveConfig = async (newConfig: AlertConfig) => {
        try {
            await setDoc(doc(db, "config", "alerts"), newConfig, { merge: true });
            setConfig(newConfig);
            return true;
        } catch (e) {
            console.error("Error saving alerts", e);
            return false;
        }
    };

    return { config, loading, saveConfig };
}
