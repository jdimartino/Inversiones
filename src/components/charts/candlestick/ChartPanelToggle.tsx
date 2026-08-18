import React from "react";
import { ChevronRight, ChevronDown } from "lucide-react";

interface ChartPanelToggleProps {
    label: string;
    color: string;
    open: boolean;
    onToggle: () => void;
}

const ChartPanelToggle: React.FC<ChartPanelToggleProps> = ({ label, color, open, onToggle }) => (
    <button
        onClick={onToggle}
        className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold transition-all duration-150 bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-slate-300"
        title={open ? `Ocultar ${label}` : `Mostrar ${label}`}
    >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <span style={{ color }}>{label}</span>
    </button>
);

export default ChartPanelToggle;
