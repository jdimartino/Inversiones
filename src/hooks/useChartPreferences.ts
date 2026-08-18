import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "inversiones.chart.preferences";

export interface ChartPreferences {
    selectedCoin: string;
    selectedInterval: string;
    ema20Visible: boolean;
    sma50Visible: boolean;
    sma200Visible: boolean;
    volumeVisible: boolean;
    rsiOpen: boolean;
    macdOpen: boolean;
    signalsVisible: boolean;
    expanded: boolean;
}

const DEFAULTS: ChartPreferences = {
    selectedCoin: "",
    selectedInterval: "1d",
    ema20Visible: true,
    sma50Visible: true,
    sma200Visible: true,
    volumeVisible: true,
    rsiOpen: false,
    macdOpen: false,
    signalsVisible: true,
    expanded: false,
};

function loadPreferences(): ChartPreferences {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...DEFAULTS };
        const parsed = JSON.parse(raw);
        return { ...DEFAULTS, ...parsed };
    } catch {
        return { ...DEFAULTS };
    }
}

function savePreferences(prefs: ChartPreferences): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch { /* ignore */ }
}

export function useChartPreferences() {
    const [prefs, setPrefs] = useState<ChartPreferences>(loadPreferences);

    useEffect(() => {
        savePreferences(prefs);
    }, [prefs]);

    const updatePref = useCallback(<K extends keyof ChartPreferences>(key: K, value: ChartPreferences[K]) => {
        setPrefs(prev => ({ ...prev, [key]: value }));
    }, []);

    return { prefs, updatePref };
}
