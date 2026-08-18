import React from "react";
import type { Dispatch, SetStateAction } from "react";
import { Maximize2, Minimize2, Bell, Ruler } from "lucide-react";
import type { Interval } from "../../../lib/types/chart";
import { INTERVAL_LABELS } from "../../../lib/types/chart";

interface ChartToolbarProps {
    selectedInterval: Interval;
    setSelectedInterval: Dispatch<SetStateAction<Interval>>;
    showAlertForm: boolean;
    setShowAlertForm: Dispatch<SetStateAction<boolean>>;
    measureMode: boolean;
    setMeasureMode: Dispatch<SetStateAction<boolean>>;
    expanded: boolean;
    setExpanded: Dispatch<SetStateAction<boolean>>;
    currentPrice: number;
    setAlertTarget: Dispatch<SetStateAction<number>>;
    setAlertDirection: Dispatch<SetStateAction<'up' | 'down'>>;
    setAlertNote: Dispatch<SetStateAction<string>>;
    setAlertPersistent: Dispatch<SetStateAction<boolean>>;
}

const ChartToolbar: React.FC<ChartToolbarProps> = ({
    selectedInterval,
    setSelectedInterval,
    showAlertForm,
    setShowAlertForm,
    measureMode,
    setMeasureMode,
    expanded,
    setExpanded,
    currentPrice,
    setAlertTarget,
    setAlertDirection,
    setAlertNote,
    setAlertPersistent,
}) => {
    return (
        <div className="flex items-center gap-1">
            <div className="flex gap-0.5">
                {(["15m", "1h", "4h", "1d", "1M"] as Interval[]).map((iv) => (
                    <button
                        key={iv}
                        onClick={() => setSelectedInterval(iv)}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all duration-150 ${
                            selectedInterval === iv
                                ? "bg-yellow-600 text-white shadow-sm"
                                : "bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-slate-300"
                        }`}
                    >
                        {INTERVAL_LABELS[iv]}
                    </button>
                ))}
            </div>
            <button
                onClick={() => {
                    if (!showAlertForm) {
                        setAlertTarget(currentPrice);
                        setAlertDirection('up');
                        setAlertNote("");
                        setAlertPersistent(false);
                    }
                    setShowAlertForm(v => !v);
                }}
                className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold border transition-all duration-150 ${
                    showAlertForm
                        ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40'
                        : 'bg-slate-700 text-slate-400 border-slate-700 hover:text-yellow-300 hover:border-yellow-500/30'
                }`}
                title="Nueva alerta de precio"
            >
                <Bell className="w-3 h-3" />
                <span>Alerta</span>
            </button>
            <button
                onClick={() => setMeasureMode(v => !v)}
                className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold border transition-all duration-150 ${
                    measureMode
                        ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                        : 'bg-slate-700 text-slate-400 border-slate-700 hover:text-sky-300 hover:border-sky-500/30'
                }`}
                title={measureMode ? "Salir de medición (Esc)" : "Medir rango de precio"}
            >
                <Ruler className="w-3 h-3" />
                <span>Medir</span>
            </button>
            <button
                onClick={() => setExpanded((e) => !e)}
                className="p-0.5 rounded bg-slate-700 text-slate-400 hover:bg-slate-600 transition-colors"
                title={expanded ? "Contraer" : "Expandir"}
            >
                {expanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
            </button>
        </div>
    );
};

export default ChartToolbar;