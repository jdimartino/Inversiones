import React from "react";
import { Router } from "lucide-react";
import MonitorCard, { MonitorStatus } from "./MonitorCard";
import { useApiUsageMonitor } from "../../hooks/useApiUsageMonitor";
import { fmtUSD } from "../../lib/format";

interface OpenRouterData {
  configured: boolean;
  limit: number | null;
  limitRemaining: number | null;
  usage: number;
  usageDaily: number;
  usageWeekly: number;
  usageMonthly: number;
  isFreeTier: boolean | null;
  freeModelDaily: { used: number; limit: number; remaining: number } | null;
  totalCredits: number | null;
  totalUsage: number | null;
  creditRemaining: number | null;
  error?: string;
}

const OpenRouterCard: React.FC = () => {
  const { data, loading, error, lastUpdated, refresh } = useApiUsageMonitor<OpenRouterData>("getOpenRouterUsage");

  const notConfigured = data && !data.configured;
  const limit = data?.limit ?? null;
  const creditRemaining = data?.creditRemaining ?? null; // saldo real de la cuenta (/credits)
  const limitRemaining = data?.limitRemaining ?? null; // tope de gasto de ESTA key, no el saldo

  // % usado solo tiene sentido si conocemos un total de referencia (créditos
  // totales de la cuenta, o el límite de la key si es lo único que hay).
  const usedPct = data?.totalCredits && data.totalCredits > 0 && creditRemaining !== null
    ? Math.min(100, ((data.totalCredits - creditRemaining) / data.totalCredits) * 100)
    : limit && limit > 0
      ? Math.min(100, ((limit - (limitRemaining ?? limit)) / limit) * 100)
      : null;

  let status: MonitorStatus = "neutral";
  if (notConfigured || error) status = "warning";
  else if (creditRemaining !== null && creditRemaining < 2) status = "danger";
  else if (usedPct !== null) status = usedPct >= 90 ? "danger" : usedPct >= 70 ? "warning" : "success";

  const summaryValue = notConfigured
    ? "N/A"
    : creditRemaining !== null
      ? fmtUSD(creditRemaining)
      : limitRemaining !== null
        ? fmtUSD(limitRemaining)
        : data
          ? fmtUSD(-(data.usage))
          : "…";
  const summaryLabel = notConfigured
    ? "sin configurar"
    : creditRemaining !== null || limitRemaining !== null
      ? "crédito disponible"
      : "consumido total (sin acceso a /credits)";

  return (
    <MonitorCard
      icon={<Router className="w-4 h-4 text-blue-400" />}
      title="OpenRouter"
      subtitle="Marketplace de modelos"
      status={status}
      summaryValue={summaryValue}
      summaryLabel={summaryLabel}
      loading={loading}
      error={notConfigured ? "Configura el secret OPENROUTER_API_KEY en Cloud Functions" : error}
      lastUpdated={lastUpdated}
      onRefresh={refresh}
    >
      {data && data.configured && !error && (
        <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
          {data.totalCredits !== null && data.totalUsage !== null && (
            <>
              <div className="bg-slate-800/60 rounded-lg px-3 py-2">
                <div className="text-slate-500">Créditos totales</div>
                <div className="font-semibold text-slate-100">{fmtUSD(data.totalCredits)}</div>
              </div>
              <div className="bg-slate-800/60 rounded-lg px-3 py-2">
                <div className="text-slate-500">Consumido (cuenta)</div>
                <div className="font-semibold text-slate-100">{fmtUSD(data.totalUsage)}</div>
              </div>
            </>
          )}
          <div className="bg-slate-800/60 rounded-lg px-3 py-2">
            <div className="text-slate-500">Uso hoy</div>
            <div className="font-semibold text-slate-100">{fmtUSD(data.usageDaily)}</div>
          </div>
          <div className="bg-slate-800/60 rounded-lg px-3 py-2">
            <div className="text-slate-500">Uso semana</div>
            <div className="font-semibold text-slate-100">{fmtUSD(data.usageWeekly)}</div>
          </div>
          <div className="bg-slate-800/60 rounded-lg px-3 py-2">
            <div className="text-slate-500">Uso mes</div>
            <div className="font-semibold text-slate-100">{fmtUSD(data.usageMonthly)}</div>
          </div>
          <div className="bg-slate-800/60 rounded-lg px-3 py-2">
            <div className="text-slate-500">Límite</div>
            <div className="font-semibold text-slate-100">{limit !== null ? fmtUSD(limit) : "Sin límite"}</div>
          </div>
          {data.freeModelDaily && (
            <div className="col-span-2 bg-slate-800/60 rounded-lg px-3 py-2">
              <div className="text-slate-500">Modelos gratis (hoy)</div>
              <div className="font-semibold text-slate-100">
                {data.freeModelDaily.used} / {data.freeModelDaily.limit} solicitudes
              </div>
            </div>
          )}
        </div>
      )}
    </MonitorCard>
  );
};

export default OpenRouterCard;
