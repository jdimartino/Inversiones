import React, { useState, useEffect } from "react";
import { Wallet, Bitcoin, CheckCircle, AlertCircle, Loader2, RefreshCw, Calendar } from "lucide-react";
import { useLiquidez, useBinanceFundingBalance } from "../hooks/useLiquidez";
import { useFutures } from "../hooks/useFutures";

function formatNumber(n: number, decimals = 2): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatBtc(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 8,
    maximumFractionDigits: 8,
  });
}

function TimeSince({ timestamp }: { timestamp: number | null }) {
  const [elapsed, setElapsed] = useState<string>("");

  useEffect(() => {
    if (!timestamp) {
      setElapsed("");
      return;
    }

    const update = () => {
      const diff = Math.floor((Date.now() - timestamp) / 1000);
      if (diff < 5) setElapsed("ahora");
      else if (diff < 60) setElapsed(`hace ${diff}s`);
      else if (diff < 3600) setElapsed(`hace ${Math.floor(diff / 60)}min`);
      else setElapsed(`hace ${Math.floor(diff / 3600)}h`);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [timestamp]);

  if (!timestamp) return null;
  return <span className="text-slate-500 text-xs">{elapsed}</span>;
}

function SaveStatusIndicator({
  status,
  lastSavedAt,
}: {
  status: string;
  lastSavedAt: number | null;
}) {
  if (status === "guardando") {
    return (
      <span className="flex items-center gap-1 text-yellow-500 text-xs">
        <Loader2 className="w-3 h-3 animate-spin" />
        Guardando...
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="flex items-center gap-1 text-red-400 text-xs">
        <AlertCircle className="w-3 h-3" />
        Error al guardar — reintentando
      </span>
    );
  }
  if (status === "guardado" && lastSavedAt) {
    return (
      <span className="flex items-center gap-1 text-green-400 text-xs">
        <CheckCircle className="w-3 h-3" />
        Guardado <TimeSince timestamp={lastSavedAt} />
      </span>
    );
  }
  return null;
}

function evalExpr(expr: string, currentValue = 0): number {
  const cleaned = expr.replace(/\s/g, "").replace(/,/g, "");
  if (!cleaned || cleaned === "-" || cleaned === "+") return currentValue;
  let toEval = cleaned;
  if ((cleaned.startsWith("+") || cleaned.startsWith("-")) && currentValue !== 0) {
    toEval = String(currentValue) + cleaned;
  }
  const match = toEval.match(/^(-?\d*\.?\d+)([+-]\d*\.?\d+)*$/);
  if (!match) return currentValue;
  let result = 0;
  let sign = 1;
  let numStr = "";
  for (let i = 0; i < toEval.length; i++) {
    const c = toEval[i];
    if (c === "+" || c === "-") {
      if (numStr) {
        result += sign * parseFloat(numStr);
        numStr = "";
      }
      sign = c === "+" ? 1 : -1;
    } else {
      numStr += c;
    }
  }
  if (numStr) result += sign * parseFloat(numStr);
  return result;
}

function NumericInput({
  value,
  onChange,
  placeholder = "0.00",
  className = "",
  autoFocus = false,
}: {
  value: number;
  onChange: (val: number) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const [display, setDisplay] = useState(value ? String(value) : "");

  const inputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value === 0 && document.activeElement !== inputRef.current) {
      setDisplay("");
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDisplay(e.target.value);
  };

  const handleBlur = () => {
    const result = evalExpr(display, value);
    onChange(result);
    setDisplay(result ? String(result) : "");
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      value={display}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      placeholder={placeholder}
      autoFocus={autoFocus}
      className={`bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-right text-slate-100
        focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500
        placeholder:text-slate-600 transition-colors w-full ${className}`}
    />
  );
}

export default function LiquidezTab({ prices }: { prices: Record<string, number> }) {
  const { liquidez, updateLiquidez, saveStatus, lastSavedAt, loading } = useLiquidez();
  const { usdtFunding, usdtSpot, loading: walletLoading, error: walletError, refresh: refreshWallet } = useBinanceFundingBalance();
  const { futuresData } = useFutures();
  
  const futuresBalance = futuresData?.account?.totalWalletBalance ?? 0;
  const futuresTransferible = futuresData?.account?.maxWithdrawAmount ?? 0;
  const btcPrice = prices["BTC"] || 0;
  const totalFlujo = liquidez.saldoBancos + liquidez.efectivo + liquidez.inversionesSpot + usdtFunding + futuresBalance;
  const totalBtc = liquidez.btcDisponible * btcPrice;

  const btcMensual = liquidez.btcDisponible / 240;
  const usdtMensual = btcMensual * btcPrice;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500 text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Cargando datos...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto animate-fadeIn">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── FLUJO DE CAJA ──────────────────────────────────── */}
        <div className="bg-[#181A20] rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700/50 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-yellow-500" />
            <h2 className="text-base font-semibold text-slate-100">Flujo de Caja</h2>
          </div>

          <div className="p-4 space-y-3">
            {/* Saldos Bancos */}
            <div className="flex items-center gap-3">
              <label className="text-slate-400 text-sm w-28 flex-shrink-0">Saldos Bancos</label>
              <NumericInput
                value={liquidez.saldoBancos}
                onChange={(v) => updateLiquidez("saldoBancos", v)}
                placeholder="0.00"
              />
              <span className="text-slate-500 text-xs w-10 text-right">USDT</span>
            </div>

            {/* Efectivo */}
            <div className="flex items-center gap-3">
              <label className="text-slate-400 text-sm w-28 flex-shrink-0">Efectivo</label>
              <NumericInput
                value={liquidez.efectivo}
                onChange={(v) => updateLiquidez("efectivo", v)}
                placeholder="0.00"
              />
              <span className="text-slate-500 text-xs w-10 text-right">USDT</span>
            </div>

            {/* Inversiones en Spot */}
            <div className="flex items-center gap-3">
              <label className="text-slate-400 text-sm w-28 flex-shrink-0">Inversiones en Spot</label>
              <NumericInput
                value={liquidez.inversionesSpot}
                onChange={(v) => updateLiquidez("inversionesSpot", v)}
                placeholder="0.00"
              />
              <span className="text-slate-500 text-xs w-10 text-right">USDT</span>
            </div>

            {/* USDT Binance Fondos (auto) - usado en cálculo */}
            <div className="flex items-center gap-3">
              <label className="text-slate-400 text-sm w-28 flex-shrink-0 flex items-center gap-1">
                USDT Fondos
                {!walletLoading && !walletError && (
                  <button
                    onClick={refreshWallet}
                    className="text-slate-600 hover:text-yellow-500 transition-colors"
                    title="Actualizar saldo"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                )}
              </label>
              <div className="flex-1 max-w-[180px] bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-right">
                {walletLoading ? (
                  <span className="text-slate-500 text-sm">Cargando...</span>
                ) : walletError ? (
                  <span className="text-red-400 text-sm">Error</span>
                ) : (
                  <span className="text-green-400 font-medium">
                    {formatNumber(usdtFunding)}
                  </span>
                )}
              </div>
              <span className="text-slate-500 text-xs w-10 text-right">USDT</span>
            </div>

            {/* USDT Binance Spot (auto) - solo informativo */}
            <div className="flex items-center gap-3">
              <label className="text-slate-500 text-sm w-28 flex-shrink-0 flex items-center gap-1">
                USDT Spot
              </label>
              <div className="flex-1 max-w-[180px] bg-slate-800/30 border border-slate-700/30 rounded-lg px-3 py-2 text-right">
                {walletLoading ? (
                  <span className="text-slate-600 text-sm">Cargando...</span>
                ) : walletError ? (
                  <span className="text-red-400/60 text-sm">Error</span>
                ) : (
                  <span className="text-slate-400 font-medium">
                    {formatNumber(usdtSpot)}
                  </span>
                )}
              </div>
              <span className="text-slate-600 text-xs w-10 text-right">USDT</span>
            </div>

            {/* Futuros (Automático) */}
            <div className="flex items-center gap-3">
              <label className="text-slate-500 text-sm w-28 flex-shrink-0 flex items-center gap-1">
                Futuros
              </label>
              <div className="flex-1 max-w-[180px] bg-slate-800/30 border border-slate-700/30 rounded-lg px-3 py-2 text-right">
                <span className="text-slate-400 font-medium">
                  {formatNumber(futuresBalance)}
                </span>
              </div>
              <span className="text-slate-600 text-xs w-10 text-right">USDT</span>
             </div>
 
             {/* Transferible (Referencia) */}
             <div className="flex items-center gap-3">
               <label className="text-slate-500 text-sm w-28 flex-shrink-0 flex items-center gap-1">
                 Transferible
               </label>
               <div className="flex-1 max-w-[180px] bg-slate-800/30 border border-slate-700/30 rounded-lg px-3 py-2 text-right">
                 <span className="text-slate-400 font-medium">
                   {formatNumber(futuresTransferible)}
                 </span>
               </div>
               <span className="text-slate-600 text-xs w-10 text-right">USDT</span>
             </div>
 
             {/* Total Flujo */}
            <div className="border-t border-slate-700/50 pt-3 mt-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-300 font-medium">Total Flujo de Caja</span>
                <span className="text-yellow-500 font-bold text-lg">
                  ${formatNumber(totalFlujo)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── LIQUIDEZ EN BTC ─────────────────────────────────── */}
        <div className="bg-[#181A20] rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700/50 flex items-center gap-2">
            <Bitcoin className="w-5 h-5 text-orange-400" />
            <h2 className="text-base font-semibold text-slate-100">Liquidez en BTC</h2>
          </div>

          <div className="p-4 space-y-3">
            {/* BTC Disponible */}
            <div className="flex items-center gap-3">
              <label className="text-slate-400 text-sm w-28 flex-shrink-0">BTC Disponible</label>
              <NumericInput
                value={liquidez.btcDisponible}
                onChange={(v) => updateLiquidez("btcDisponible", v)}
                placeholder="0.00000000"
                className="font-mono"
              />
              <span className="text-orange-400 text-xs w-10 text-right font-semibold">BTC</span>
            </div>

            {/* Precio BTC (auto) */}
            <div className="flex items-center gap-3">
              <label className="text-slate-400 text-sm w-28 flex-shrink-0">Precio BTC</label>
              <div className="flex-1 max-w-[180px] bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-right">
                {btcPrice > 0 ? (
                  <span className="text-green-400 font-medium">
                    ${formatNumber(btcPrice)}
                  </span>
                ) : (
                  <span className="text-slate-500 text-sm">Cargando...</span>
                )}
              </div>
              <span className="text-slate-500 text-xs w-10 text-right">USDT</span>
            </div>

            {/* Mostrar detalle del cálculo si hay BTC */}
            {liquidez.btcDisponible > 0 && btcPrice > 0 && (
              <div className="text-xs text-slate-500 pl-9">
                {formatBtc(liquidez.btcDisponible)} BTC × ${formatNumber(btcPrice)}
              </div>
            )}

            {/* Total BTC */}
            <div className="border-t border-slate-700/50 pt-3 mt-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-300 font-medium">Total Liquidez BTC</span>
                <span className="text-orange-400 font-bold text-lg">
                  ${formatNumber(totalBtc)}
                </span>
              </div>
            </div>

            {/* Plan 20 años */}
            {liquidez.btcDisponible > 0 && (
              <div className="border-t border-slate-700/50 pt-3 mt-3">
                <div className="bg-slate-800/30 border border-slate-700/30 rounded-lg p-4">
                  <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Calendar className="w-3 h-3" /> Plan 20 años
                  </div>

                  {/* Valores primarios */}
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <div className="text-lg font-bold font-mono text-orange-400">
                        {formatBtc(btcMensual)}
                      </div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">
                        BTC/mes
                      </div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-green-400">
                        ${formatNumber(usdtMensual)}
                      </div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">
                        USDT/mes
                      </div>
                    </div>
                  </div>

                  {/* Métricas secundarias */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase">Precio ref.</div>
                      <div className="text-xs text-slate-400 font-mono mt-0.5">
                        ${formatNumber(btcPrice)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase">Meses restantes</div>
                      <div className="text-xs text-slate-400 font-mono mt-0.5">240</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── INDICADOR DE GUARDADO ───────────────────────────── */}
      <div className="flex items-center justify-center py-3">
        <SaveStatusIndicator status={saveStatus} lastSavedAt={lastSavedAt} />
      </div>
    </div>
  );
}