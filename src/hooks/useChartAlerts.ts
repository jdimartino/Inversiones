import { useState } from "react";
import type { AlertConfig, WatchlistAlert } from "./useAlerts";

interface UseChartAlertsParams {
    config: AlertConfig;
    saveConfig: (newConfig: AlertConfig) => Promise<boolean>;
    selectedCoin: string;
    currentPrice: number;
}

export function useChartAlerts({ config, saveConfig, selectedCoin, currentPrice }: UseChartAlertsParams) {
    const [showAlertForm, setShowAlertForm] = useState(false);
    const [alertTarget, setAlertTarget] = useState(0);
    const [alertDirection, setAlertDirection] = useState<'up' | 'down'>('up');
    const [alertPersistent, setAlertPersistent] = useState(false);
    const [alertNote, setAlertNote] = useState("");
    const [alertSaved, setAlertSaved] = useState(false);

    const handleSaveChartAlert = async () => {
        const existing = config.watchlistAlerts?.[selectedCoin] ?? [];
        const newAlert: WatchlistAlert = {
            targetValue: alertTarget,
            direction: alertDirection,
            isPersistent: alertPersistent,
            ...(alertNote.trim() ? { note: alertNote.trim() } : {}),
        };
        await saveConfig({
            ...config,
            watchlistAlerts: {
                ...(config.watchlistAlerts ?? {}),
                [selectedCoin]: [...existing, newAlert],
            },
        });
        setAlertSaved(true);
        setTimeout(() => { setAlertSaved(false); setShowAlertForm(false); setAlertNote(""); }, 1500);
    };

    return {
        showAlertForm,
        setShowAlertForm,
        alertTarget,
        setAlertTarget,
        alertDirection,
        setAlertDirection,
        alertPersistent,
        setAlertPersistent,
        alertNote,
        setAlertNote,
        alertSaved,
        handleSaveChartAlert,
    };
}