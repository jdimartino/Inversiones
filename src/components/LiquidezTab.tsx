import React, { useState, useEffect } from "react";
import { Wallet, Bitcoin, CheckCircle, AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { useLiquidez, useBinanceFundingBalance } from "../hooks/useLiquidez";
import { usePrices } from "../hooks/usePrices";

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

function evalExpr(expr: string): number {
  const cleaned = expr.replace(/\s/g, "").replace(/,/g, "");
  if (!cleaned || cleaned === "-") return 0;
  const match = cleaned.match(/^(-?\d*\.?\d+)([+-]\d*\.?\d+)*$/);
  if (!match) return 0;
  let result = 0;
  let sign = 1;
  let numStr = "";
  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned[i];
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
    onChange(0);
  };

  const handleBlur = () => {
    const result = evalExpr(display);
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
      placeholder={placeholder}
      autoFocus={autoFocus}
      className={`bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-right text-slate-100
        focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500
        placeholder:text-slate-600 transition-colors w-full ${className}`}
    />
  );
}

export default function LiquidezTab() {
  const { liquidez, updateLiquidez, saveStatus, lastSavedAt, loading } = useLiquidez();
  const { usdtFunding, usdtSpot, loading: walletLoading, error: walletError, refresh: refreshWallet } = useBinanceFundingBalance();
  const { prices } = usePrices(["BTC"]);

  const btcPrice = prices["BTC"] || 0;
  const totalFlujo = liquidez.saldoBancos + liquidez.efectivo + usdtFunding + liquidez.otros;
  const totalBtc = liquidez.btcDisponible * btcPrice;
  const liquidezTotal = totalFlujo + totalBtc;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500 text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Cargando datos...
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4 animate-fadeIn">
      {/* ── FLUJO DE CAJA ──────────────────────────────────── */}
      <div className="bg-[#181A20] rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700/50 flex items-center gap-2">
          <Wallet className="w-5 h-5 text-yellow-500" />
          <h2 className="text-base font-semibold text-slate-100">Flujo de Caja</h2>
        </div>

        <div className="p-4 space-y-3">
          {/* Saldos Bancos */}
          <div className="flex items-center gap-3">
            <label className="text-slate-400 text-sm w-32 flex-shrink-0">Saldos Bancos</label>
            <NumericInput
              value={liquidez.saldoBancos}
              onChange={(v) => updateLiquidez("saldoBancos", v)}
              placeholder="0.00"
            />
            <span className="text-slate-500 text-xs w-10 text-right">USDT</span>
          </div>

          {/* Efectivo */}
          <div className="flex items-center gap-3">
            <label className="text-slate-400 text-sm w-32 flex-shrink-0">Efectivo</label>
            <NumericInput
              value={liquidez.efectivo}
              onChange={(v) => updateLiquidez("efectivo", v)}
              placeholder="0.00"
            />
            <span className="text-slate-500 text-xs w-10 text-right">USDT</span>
          </div>

          {/* USDT Binance Fondos (auto) - usado en cálculo */}
          <div className="flex items-center gap-3">
            <label className="text-slate-400 text-sm w-32 flex-shrink-0 flex items-center gap-1">
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
            <div className="flex-1 bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-right">
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
            <label className="text-slate-500 text-sm w-32 flex-shrink-0 flex items-center gap-1">
              USDT Spot
            </label>
            <div className="flex-1 bg-slate-800/30 border border-slate-700/30 rounded-lg px-3 py-2 text-right">
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

          {/* Otros */}
          <div className="flex items-center gap-2">
            <label className="text-slate-400 text-sm w-28 flex-shrink-0">Otros</label>
            <NumericInput
              value={liquidez.otros}
              onChange={(v) => updateLiquidez("otros", v)}
              placeholder="0.00"
            />
            <span className="text-slate-500 text-xs w-10 text-right flex-shrink-0">USDT</span>
            <input
              type="text"
              maxLength={60}
              value={liquidez.otrosNota}
              onChange={(e) => updateLiquidez("otrosNota" as any, e.target.value)}
              placeholder="¿De qué es?"
              className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-2 py-2 text-slate-400 text-xs w-40
                focus:outline-none focus:ring-1 focus:ring-yellow-500/30 focus:border-yellow-500/50
                placeholder:text-slate-600 transition-colors"
            />
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
            <label className="text-slate-400 text-sm w-32 flex-shrink-0">BTC Disponible</label>
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
            <label className="text-slate-400 text-sm w-32 flex-shrink-0">Precio BTC</label>
            <div className="flex-1 bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-right">
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
            <div className="text-xs text-slate-500 pl-35">
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
        </div>
      </div>

      {/* ── INDICADOR DE GUARDADO ───────────────────────────── */}
      <div className="flex items-center justify-center py-1">
        <SaveStatusIndicator status={saveStatus} lastSavedAt={lastSavedAt} />
      </div>
    </div>
  );
}