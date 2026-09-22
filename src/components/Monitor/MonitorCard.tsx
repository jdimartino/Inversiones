import React, { useState } from "react";
import { ChevronDown, RefreshCw, AlertTriangle } from "lucide-react";

export type MonitorStatus = "success" | "warning" | "danger" | "neutral";

const STATUS_DOT: Record<MonitorStatus, string> = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  neutral: "bg-slate-500",
};

const STATUS_RING: Record<MonitorStatus, string> = {
  success: "border-emerald-700/40",
  warning: "border-amber-700/40",
  danger: "border-red-700/40",
  neutral: "border-slate-700/50",
};

interface MonitorCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  status: MonitorStatus;
  summaryValue: string;
  summaryLabel: string;
  loading?: boolean;
  error?: string | null;
  lastUpdated?: number | null;
  onRefresh?: () => void;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

const MonitorCard: React.FC<MonitorCardProps> = ({
  icon,
  title,
  subtitle,
  status,
  summaryValue,
  summaryLabel,
  loading,
  error,
  lastUpdated,
  onRefresh,
  children,
  defaultExpanded = false,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className={`bg-slate-900 border rounded-xl overflow-hidden transition-colors ${STATUS_RING[status]}`}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-slate-800/40 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
            {icon}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[status]}`} />
              <h3 className="text-sm font-semibold text-slate-100 truncate">{title}</h3>
            </div>
            {subtitle && <p className="text-xs text-slate-500 truncate">{subtitle}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="text-right">
            <div className="text-sm font-bold text-slate-100 leading-tight">
              {loading ? "…" : summaryValue}
            </div>
            <div className="text-[10px] text-slate-500 leading-tight">{summaryLabel}</div>
          </div>
          <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-800">
          {error && (
            <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-950/30 border border-amber-800/40 rounded-lg px-3 py-2 my-3">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{error}</span>
            </div>
          )}
          {children}
          <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-800/60">
            <span className="text-[10px] text-slate-600">
              {lastUpdated ? `Actualizado ${new Date(lastUpdated).toLocaleTimeString()}` : ""}
            </span>
            {onRefresh && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRefresh(); }}
                className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-200 transition-colors"
              >
                <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Actualizar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MonitorCard;
