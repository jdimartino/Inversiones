import React from "react";
import { Waves } from "lucide-react";
import MonitorCard, { MonitorStatus } from "./MonitorCard";
import { useApiUsageMonitor } from "../../hooks/useApiUsageMonitor";
import { fmtUSD } from "../../lib/format";

interface DeepSeekData {
  configured: boolean;
  isAvailable: boolean | null;
  currency: string;
  totalBalance: number | null;
  grantedBalance: number | null;
  toppedUpBalance: number | null;
  error?: string;
}

const DeepSeekCard: React.FC = () => {
  const { data, loading, error, lastUpdated, refresh } = useApiUsageMonitor<DeepSeekData>("getDeepSeekBalance");

  const notConfigured = data && !data.configured;
  const balance = data?.totalBalance ?? null;

  let status: MonitorStatus = "neutral";
  if (notConfigured || error) status = "warning";
  else if (data?.isAvailable === false) status = "danger";
  else if (balance !== null) status = balance < 2 ? "warning" : "success";

  const summaryValue = notConfigured ? "N/A" : balance !== null ? fmtUSD(balance) : "…";
  const summaryLabel = notConfigured ? "sin configurar" : "saldo disponible";

  return (
    <MonitorCard
      icon={<Waves className="w-4 h-4 text-cyan-400" />}
      title="DeepSeek API"
      subtitle="Balance de cuenta"
      status={status}
      summaryValue={summaryValue}
      summaryLabel={summaryLabel}
      loading={loading}
      error={notConfigured ? "Configura el secret DEEPSEEK_API_KEY en Cloud Functions" : error}
      lastUpdated={lastUpdated}
      onRefresh={refresh}
    >
      {data && data.configured && !error && (
        <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
          <div className="bg-slate-800/60 rounded-lg px-3 py-2">
            <div className="text-slate-500">Saldo total</div>
            <div className="font-semibold text-slate-100">{data.totalBalance !== null ? fmtUSD(data.totalBalance) : "—"}</div>
          </div>
          <div className="bg-slate-800/60 rounded-lg px-3 py-2">
            <div className="text-slate-500">Disponible p/ llamadas</div>
            <div className={`font-semibold ${data.isAvailable ? "text-emerald-400" : "text-red-400"}`}>
              {data.isAvailable === null ? "—" : data.isAvailable ? "Sí" : "No"}
            </div>
          </div>
          <div className="bg-slate-800/60 rounded-lg px-3 py-2">
            <div className="text-slate-500">Crédito otorgado</div>
            <div className="font-semibold text-slate-100">{data.grantedBalance !== null ? fmtUSD(data.grantedBalance) : "—"}</div>
          </div>
          <div className="bg-slate-800/60 rounded-lg px-3 py-2">
            <div className="text-slate-500">Recargado</div>
            <div className="font-semibold text-slate-100">{data.toppedUpBalance !== null ? fmtUSD(data.toppedUpBalance) : "—"}</div>
          </div>
        </div>
      )}
    </MonitorCard>
  );
};

export default DeepSeekCard;
