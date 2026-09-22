import React, { useCallback } from "react";
import { Zap } from "lucide-react";
import MonitorCard, { MonitorStatus } from "./MonitorCard";
import { useOpenCodeZenBudget } from "../../hooks/useOpenCodeZenBudget";
import { fmtUSD } from "../../lib/format";

const OpenCodeZenCard: React.FC = () => {
  const { state, update, loading, usedPct, remaining } = useOpenCodeZenBudget();

  const handleNum = useCallback((key: keyof typeof state, raw: string) => {
    const value = raw === "" ? 0 : parseFloat(raw);
    if (Number.isNaN(value)) return;
    update({ [key]: value } as any);
  }, [state, update]);

  const hasLimit = state.monthlyLimit > 0;
  let status: MonitorStatus = "neutral";
  if (hasLimit) status = usedPct >= 90 ? "danger" : usedPct >= 70 ? "warning" : "success";

  return (
    <MonitorCard
      icon={<Zap className="w-4 h-4 text-yellow-400" />}
      title="OpenCode Zen"
      subtitle="Presupuesto manual (pay-as-you-go)"
      status={status}
      summaryValue={hasLimit ? fmtUSD(remaining) : "N/A"}
      summaryLabel={hasLimit ? `disponible (${(100 - usedPct).toFixed(0)}%)` : "sin límite configurado"}
      loading={loading}
      lastUpdated={state.updatedAt ?? null}
      defaultExpanded
    >
      <p className="text-xs text-slate-500 mb-3">
        Zen no tiene API de saldo pública — carga aquí tu límite mensual y lo gastado según el dashboard de opencode.ai/zen.
      </p>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label className="block text-[11px] text-slate-500 mb-1">Límite mensual (USD)</label>
          <input
            type="number"
            min={0}
            step={1}
            className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
            value={state.monthlyLimit}
            onChange={(e) => handleNum("monthlyLimit", e.target.value)}
          />
        </div>
        <div>
          <label className="block text-[11px] text-slate-500 mb-1">Gastado (USD)</label>
          <input
            type="number"
            min={0}
            step={0.5}
            className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
            value={state.spent}
            onChange={(e) => handleNum("spent", e.target.value)}
          />
        </div>
      </div>

      {hasLimit && (
        <div className="mb-1">
          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${usedPct}%`,
                background: usedPct >= 90 ? "#ef4444" : usedPct >= 70 ? "#f59e0b" : "#10b981",
              }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-slate-500 mt-1">
            <span>Gastado: {fmtUSD(state.spent)}</span>
            <span>Límite: {fmtUSD(state.monthlyLimit)}</span>
          </div>
        </div>
      )}
    </MonitorCard>
  );
};

export default OpenCodeZenCard;
