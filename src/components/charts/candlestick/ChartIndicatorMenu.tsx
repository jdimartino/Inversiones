import React, { useState, useRef, useEffect } from "react";
import { BarChart3, ChevronDown } from "lucide-react";

interface ChartIndicatorMenuProps {
    ema20Visible: boolean;
    sma50Visible: boolean;
    sma200Visible: boolean;
    volumeVisible: boolean;
    signalsVisible: boolean;
    onToggle: (key: string) => void;
}

const ChartIndicatorMenu: React.FC<ChartIndicatorMenuProps> = ({
    ema20Visible, sma50Visible, sma200Visible, volumeVisible, signalsVisible, onToggle,
}) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    const items = [
        { key: "ema20", label: "EMA 20", visible: ema20Visible },
        { key: "sma50", label: "SMA 50", visible: sma50Visible },
        { key: "sma200", label: "SMA 200", visible: sma200Visible },
        { key: "volume", label: "Volumen", visible: volumeVisible },
        { key: "signals", label: "Señales", visible: signalsVisible },
    ];

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen(v => !v)}
                className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold border transition-all duration-150 ${
                    open
                        ? "bg-violet-500/20 text-violet-300 border-violet-500/40"
                        : "bg-slate-700 text-slate-400 border-slate-700 hover:text-violet-300 hover:border-violet-500/30"
                }`}
            >
                <BarChart3 className="w-3 h-3" />
                <span>Indicadores</span>
                <ChevronDown className={`w-2.5 h-2.5 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>

            {open && (
                <div className="absolute top-full left-0 mt-1 z-50 bg-slate-800 border border-slate-600/60 rounded-lg p-2 shadow-2xl min-w-[160px]">
                    {items.map(item => (
                        <label
                            key={item.key}
                            className="flex items-center gap-2 px-2 py-1 rounded text-[11px] font-mono cursor-pointer hover:bg-slate-700 transition-colors"
                        >
                            <input
                                type="checkbox"
                                checked={item.visible}
                                onChange={() => onToggle(item.key)}
                                className="accent-violet-500 w-3 h-3"
                            />
                            <span className={item.visible ? "text-slate-200" : "text-slate-500"}>
                                {item.label}
                            </span>
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ChartIndicatorMenu;
