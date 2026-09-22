import React from "react";
import { Router } from "lucide-react";
import MonitorCard, { MonitorStatus } from "./MonitorCard";
import { useApiUsageMonitor } from "../../hooks/useApiUsageMonitor";
import { fmtUSD, fmt } from "../../lib/format";

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

interface ActivityRow {
  date: string | null;
  model: string | null;
  modelPermaslug: string | null;
  provider: string | null;
  endpointId: string | null;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  usage: number;
  byokUsage: number;
}

interface OpenRouterActivityData {
  configured: boolean;
  rows: ActivityRow[];
  error?: string;
}

const OpenRouterCard: React.FC = () => {
  const { data, loading, error, lastUpdated, refresh } = useApiUsageMonitor<OpenRouterData>("getOpenRouterUsage");
  const activity = useApiUsageMonitor<OpenRouterActivityData>("getOpenRouterActivity");

  // /activity devuelve los últimos 30 días (fechas en UTC); el hook no puede
  // mandar query params, así que filtramos "hoy" acá para que el título del
  // detalle corresponda con lo que se muestra.
  const todayUtc = new Date().toISOString().slice(0, 10);
  const activityRows = activity.data?.rows ?? [];
  const activityNotConfigured = activity.data !== null && !activity.data.configured;

  const todaysByModel = (() => {
    const map = new Map<string, { model: string; requests: number; tokens: number; usage: number }>();
    for (const row of activityRows) {
      if (row.date !== todayUtc) continue;
      const key = row.model ?? "desconocido";
      const acc = map.get(key) ?? { model: key, requests: 0, tokens: 0, usage: 0 };
      acc.requests += row.requests;
      acc.tokens += row.promptTokens + row.completionTokens;
      acc.usage += row.usage;
      map.set(key, acc);
    }
    return Array.from(map.values()).sort((a, b) => b.usage - a.usage);
  })();

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
        <>
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

        <div className="mt-3">
          <div className="text-xs font-semibold text-slate-200 mb-1">Detalle por modelo (hoy)</div>

          {activityNotConfigured ? (
            <p className="text-xs text-slate-500">
              Configura el secret OPENROUTER_PROVISIONING_KEY en Cloud Functions para ver el detalle por modelo
            </p>
          ) : activity.loading ? (
            <p className="text-xs text-slate-500">…</p>
          ) : activity.error ? (
            <p className="text-xs text-slate-500">{activity.error}</p>
          ) : todaysByModel.length === 0 ? (
            <p className="text-xs text-slate-500">Sin actividad registrada hoy.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-800 text-left">
                  <th className="py-1 pr-2 font-normal">Modelo</th>
                  <th className="py-1 pr-2 font-normal text-right">Solicitudes</th>
                  <th className="py-1 pr-2 font-normal text-right">Tokens</th>
                  <th className="py-1 font-normal text-right">Costo</th>
                </tr>
              </thead>
              <tbody>
                {todaysByModel.map((row) => (
                  <tr key={row.model} className="border-b border-slate-800 last:border-b-0">
                    <td className="py-1 pr-2 text-slate-100 truncate max-w-[10rem]" title={row.model}>
                      {row.model}
                    </td>
                    <td className="py-1 pr-2 text-slate-300 text-right">{fmt(row.requests)}</td>
                    <td className="py-1 pr-2 text-slate-300 text-right">{fmt(row.tokens)}</td>
                    <td className="py-1 text-slate-300 text-right">{fmtUSD(row.usage)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        </>
      )}
    </MonitorCard>
  );
};

export default OpenRouterCard;
