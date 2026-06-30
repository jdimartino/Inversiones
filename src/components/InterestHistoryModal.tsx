import React, { useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { X, ChevronLeft, ChevronRight, TrendingDown, Clock, Percent } from "lucide-react";
import { useLoanHistory } from "../hooks/useLoanHistory";
import {
  calculateRealInterest,
  estimateEndOfMonthInterest,
  calculateAvgDailyRate,
  snapshotsToChartData,
  getMonthLabel,
  getCurrentMonth,
  getPreviousMonth,
  getNextMonth,
  isFutureMonth,
} from "../lib/loanHistory";
import { fmtUSD, fmtPrice } from "../lib/format";

interface InterestHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  exchange: "bybit" | "binance";
  exchangeName: string;
  currentMonthInterest: number;
  currentMonthEstimate: number;
}

const InterestHistoryModal: React.FC<InterestHistoryModalProps> = ({
  isOpen,
  onClose,
  exchange,
  exchangeName,
  currentMonthInterest,
  currentMonthEstimate,
}) => {
  const currentMonth = getCurrentMonth();
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const { snapshots, loading, error } = useLoanHistory(exchange, selectedMonth);

  const isCurrentMonth = selectedMonth === currentMonth;
  const canGoNext = !isFutureMonth(getNextMonth(selectedMonth));

  const summary = useMemo(() => {
    if (snapshots.length === 0) {
      return {
        realAccumulated: isCurrentMonth ? currentMonthInterest : 0,
        estimatedEndOfMonth: isCurrentMonth ? currentMonthEstimate : 0,
        avgDailyRate: 0,
        daysRecorded: 0,
      };
    }
    return {
      realAccumulated: calculateRealInterest(snapshots, exchange),
      estimatedEndOfMonth: isCurrentMonth
        ? estimateEndOfMonthInterest(snapshots, exchange)
        : calculateRealInterest(snapshots, exchange),
      avgDailyRate: calculateAvgDailyRate(snapshots, exchange),
      daysRecorded: snapshots.length,
    };
  }, [snapshots, exchange, isCurrentMonth, currentMonthInterest, currentMonthEstimate]);

  const chartData = useMemo(() => {
    return snapshotsToChartData(snapshots, exchange);
  }, [snapshots, exchange]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-2 sm:p-4 overflow-y-auto">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-[#0E1014] border border-gray-800 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl mt-4 sm:mt-0">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <TrendingDown className="text-orange-400" size={20} />
            <div>
              <h2 className="text-white font-bold text-base">
                Historial de Intereses - {exchangeName}
              </h2>
              <p className="text-gray-500 text-xs">
                Datos reales desde snapshots diarios
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors p-1"
          >
            <X size={20} />
          </button>
        </div>

        {/* Month Selector */}
        <div className="flex items-center justify-center gap-4 py-3 border-b border-gray-800">
          <button
            onClick={() => setSelectedMonth(getPreviousMonth(selectedMonth))}
            className="text-gray-400 hover:text-white transition-colors p-1"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="text-white font-bold text-sm min-w-[140px] text-center">
            {getMonthLabel(selectedMonth)}
          </span>
          <button
            onClick={() => {
              if (canGoNext) setSelectedMonth(getNextMonth(selectedMonth));
            }}
            disabled={!canGoNext}
            className="text-gray-400 hover:text-white transition-colors p-1 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {loading ? (
            <div className="text-center py-10 text-gray-500 animate-pulse">
              Cargando historial...
            </div>
          ) : error ? (
            <div className="text-center py-10 text-red-400 text-sm">
              {error}
            </div>
          ) : snapshots.length === 0 ? (
            <div className="text-center py-10">
              <Clock className="mx-auto text-gray-600 mb-2" size={32} />
              <p className="text-gray-500 text-sm">
                Sin datos para este mes.
              </p>
              <p className="text-gray-600 text-xs mt-1">
                Los snapshots diarios comienzan el 1 de julio de {new Date().getFullYear()}.
              </p>
            </div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#181A20] p-3 rounded-xl border border-gray-800 text-center">
                  <div className="text-gray-400 text-xs mb-1">Acumulado Real</div>
                  <div className="text-orange-400 font-bold text-sm">
                    +{fmtUSD(summary.realAccumulated)}
                  </div>
                  <div className="text-gray-600 text-[10px]">
                    {summary.daysRecorded} días registrados
                  </div>
                </div>
                <div className="bg-[#181A20] p-3 rounded-xl border border-gray-800 text-center">
                  <div className="text-gray-400 text-xs mb-1">
                    {isCurrentMonth ? "Estimado Fin de Mes" : "Total del Mes"}
                  </div>
                  <div className="text-orange-300 font-bold text-sm">
                    ~{fmtUSD(summary.estimatedEndOfMonth)}
                  </div>
                  <div className="text-gray-600 text-[10px]">
                    {isCurrentMonth ? "proyección" : "acumulado total"}
                  </div>
                </div>
                <div className="bg-[#181A20] p-3 rounded-xl border border-gray-800 text-center">
                  <div className="text-gray-400 text-xs mb-1">Tasa Diaria Avg</div>
                  <div className="text-green-400 font-bold text-sm flex items-center justify-center gap-1">
                    <Percent size={12} />
                    {(summary.avgDailyRate * 100).toFixed(4)}%
                  </div>
                  <div className="text-gray-600 text-[10px]">promedio mensual</div>
                </div>
              </div>

              {/* Chart */}
              {chartData.length >= 2 && (
                <div className="bg-[#181A20] p-4 rounded-xl border border-gray-800">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
                    Evolución Diaria
                  </h3>
                  <div className="h-[140px] sm:h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                      <defs>
                        <linearGradient id="interestGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#4ade80" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#4ade80" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis
                        dataKey="dia"
                        tick={{ fill: "#475569", fontSize: 9 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        tick={{ fill: "#475569", fontSize: 9 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: any) => `$${(v / 1000).toFixed(0)}k`}
                        width={38}
                      />
                      <Tooltip
                        content={({ active, payload, label }: any) => {
                          if (!active || !payload?.length) return null;
                          const intereses = payload[0]?.value;
                          return (
                            <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs shadow-xl">
                              <p className="text-slate-400 font-bold mb-1">Día {label}</p>
                              {intereses != null && (
                                <p className="text-green-400">Interés: {fmtUSD(intereses)}</p>
                              )}
                            </div>
                          );
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: "10px", color: "#64748b" }} />
                      <Area
                        type="monotone"
                        dataKey="interesesDiarios"
                        name="Interés Diario"
                        stroke="#4ade80"
                        strokeWidth={2}
                        fill="url(#interestGradient)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Day-by-day Table */}
              <div className="bg-[#181A20] rounded-xl border border-gray-800 overflow-hidden">
                <div className="p-3 border-b border-gray-800">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                    Detalle por Día
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-500 uppercase tracking-wider border-b border-gray-800">
                        <th className="px-3 py-2 text-left">Fecha</th>
                        <th className="px-3 py-2 text-right">Deuda</th>
                        <th className="px-3 py-2 text-right">Interés (Día)</th>
                        <th className="px-3 py-2 text-right">Acumulado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chartData.map((row) => (
                        <tr
                          key={row.date}
                          className="border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors"
                        >
                          <td className="px-3 py-2 text-gray-300">
                            {new Date(row.date + "T12:00:00").toLocaleDateString("es", {
                              day: "numeric",
                              month: "short",
                            })}
                          </td>
                          <td className="px-3 py-2 text-right text-orange-400">
                            {fmtUSD(row.deuda)}
                          </td>
                          <td className="px-3 py-2 text-right text-green-400">
                            {fmtUSD(row.interesesDiarios)}
                          </td>
                          <td className="px-3 py-2 text-right text-white">
                            {fmtUSD(row.interesesAcumulados)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default InterestHistoryModal;
