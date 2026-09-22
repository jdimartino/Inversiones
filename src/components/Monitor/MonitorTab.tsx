import React from "react";
import OpenCodeZenCard from "./OpenCodeZenCard";
import DeepSeekCard from "./DeepSeekCard";
import OpenRouterCard from "./OpenRouterCard";

const MonitorTab: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto space-y-3">
      <div>
        <h2 className="text-sm font-bold text-slate-200">Monitor de consumo</h2>
        <p className="text-xs text-slate-500">Cuotas y saldos de los servicios de IA que usás • #JDMRules</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <OpenCodeZenCard />
        <DeepSeekCard />
        <OpenRouterCard />
      </div>
    </div>
  );
};

export default MonitorTab;
