import React, { useState, useEffect } from 'react';
import { ShieldAlert, TrendingDown, AlertTriangle, RefreshCw, CheckCircle, XCircle, FlaskConical } from 'lucide-react';
import { useLiquidationData, CollateralItem } from '../hooks/useLiquidationData';
import { useBybitSync } from '../hooks/useBybitSync';
import { useBinanceSync } from '../hooks/useBinanceSync';
import InterestHistoryModal from './InterestHistoryModal';

const THEMES = {
  bybit: {
    themeKey: 'bybit',
    title: 'text-yellow-500',
    bgBtn: 'bg-yellow-500',
    textBtn: 'text-black',
    borderLeft: 'border-l-yellow-500',
    borderHover: 'hover:border-l-yellow-500',
    accent: 'accent-yellow-500',
    progress: 'bg-yellow-500'
  },
  binance: {
    themeKey: 'binance',
    title: 'text-yellow-400',
    bgBtn: 'bg-[#FCD535]',
    textBtn: 'text-black',
    borderLeft: 'border-l-yellow-400',
    borderHover: 'hover:border-l-yellow-400',
    accent: 'accent-yellow-400',
    progress: 'bg-yellow-400'
  }
} as const;

export default function LiquidationDashboard() {
  const [activeTab, setActiveTab] = useState<'bybit' | 'binance'>('bybit');
  const [toast, setToast] = useState<{message: string; type: 'success' | 'error'} | null>(null);
  const [showSimulator, setShowSimulator] = useState(false);
  const [simulationDrop, setSimulationDrop] = useState(20);
  const [showInterestHistory, setShowInterestHistory] = useState(false);

  // Estado persistido en Firebase (cantidades y config, NO precios live)
  const { exchangeData, saveExchangeData, loading: dataLoading } = useLiquidationData();

  // Bybit sync
  const { syncLoansFromBybit, isSyncing: isSyncingBybit, lastSyncedAt: lastSyncedBybit, syncError: syncErrorBybit } = useBybitSync();

  // Binance sync
  const { syncLoansFromBinance, isSyncing: isSyncingBinance, lastSyncedAt: lastSyncedBinance, syncError: syncErrorBinance } = useBinanceSync();

  // Usar precios del exchange (Bybit/Binance) directamente del sync
  const liveExchangeData = exchangeData;

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Auto-sync Bybit al montar y cada 5 minutos (sin toast)
  useEffect(() => {
    const sync = async () => {
      try {
        const mapped = await syncLoansFromBybit();
        if (mapped) {
          await saveExchangeData(prev => ({
            ...prev,
            bybit: { ...prev.bybit, ...mapped }
          }));
        }
      } catch {}
    };
    sync();
    const interval = setInterval(sync, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [saveExchangeData, syncLoansFromBybit]);

  // Auto-sync Binance al montar y cada 5 minutos (sin toast)
  useEffect(() => {
    const sync = async () => {
      try {
        const mapped = await syncLoansFromBinance();
        if (mapped) {
          await saveExchangeData(prev => ({
            ...prev,
            binance: { ...prev.binance, ...mapped }
          }));
        }
      } catch {}
    };
    sync();
    const interval = setInterval(sync, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [saveExchangeData, syncLoansFromBinance]);

  // Sync handler manual Bybit: con toast
  const handleSyncBybit = async () => {
    try {
      const mapped = await syncLoansFromBybit();
      if (mapped) {
        await saveExchangeData(prev => ({
          ...prev,
          bybit: { ...prev.bybit, ...mapped }
        }));
        setToast({ message: 'Sincronizado con Bybit correctamente', type: 'success' });
      }
    } catch (err) {
      setToast({ message: syncErrorBybit || 'Error al sincronizar con Bybit', type: 'error' });
    }
  };

  // Sync handler manual Binance: con toast
  const handleSyncBinance = async () => {
    try {
      const mapped = await syncLoansFromBinance();
      if (mapped) {
        await saveExchangeData(prev => ({
          ...prev,
          binance: { ...prev.binance, ...mapped }
        }));
        setToast({ message: 'Sincronizado con Binance correctamente', type: 'success' });
      }
    } catch (err) {
      setToast({ message: syncErrorBinance || 'Error al sincronizar con Binance', type: 'error' });
    }
  };

  // Handler unificado del botón Sync
  const handleSync = () => {
    if (activeTab === 'bybit') {
      handleSyncBybit();
    } else {
      handleSyncBinance();
    }
  };

  const isSyncing = isSyncingBybit || isSyncingBinance;
  const activeLastSynced = activeTab === 'bybit' ? lastSyncedBybit : lastSyncedBinance;

  if (dataLoading) {
    return <div className="text-center py-10 text-gray-500 animate-pulse">Cargando simulador...</div>;
  }

  const currentData = liveExchangeData[activeTab];
  const theme = THEMES[currentData.themeKey];

  // Usar agregados del exchange si están (datos oficiales del API)
  const totalDebt = currentData.totalDebt ?? currentData.debts.reduce((sum, item) => sum + (item.amountUSD ?? item.amount * item.price), 0);
  // Para Bybit, totalCollateral del API es el valor ajustado (denominador de LTV)
  // Para Binance, es el valor de mercado
  const totalCollateralValue = currentData.totalCollateral ?? currentData.collateral.reduce((sum, item) => sum + (item.adjustedValueUSD ?? item.marketValueUSD ?? item.amount * item.price), 0);
  const currentLTV = currentData.ltvFromExchange ?? (totalCollateralValue > 0 ? (totalDebt / totalCollateralValue) * 100 : 0);

  // Valor de mercado del colateral (sin ajuste de haircut)
  const totalCollateralMarketValue = currentData.collateral.reduce((sum, item) => sum + (item.marketValueUSD ?? item.amount * (item.marketPrice ?? item.price)), 0);

  // Usar blendedLiqLTV (estimación ponderada) en lugar del valor hardcodeado
  const effectiveLiqLTV = currentData.blendedLiqLTV ?? currentData.liquidationLTV ?? 92;
  const effectiveMCLTV = currentData.blendedMarginCallLTV ?? currentData.marginCallLTV ?? 87;

  // Intereses del mes actual
  // NOTA: Estos son ESTIMADOS basados en la tasa actual y el balance actual.
  // No son intereses reales cobrados (esos vienen de snapshots que aún no existen).
  const now = new Date();
  const monthLabel = now.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const hoursIntoMonth = (now.getTime() - startOfMonth.getTime()) / (1000 * 60 * 60);
  const hoursInMonth = (endOfMonth.getTime() - startOfMonth.getTime()) / (1000 * 60 * 60);

  // Interés diario estimado (cálculo propio, ESTIMADO)
  const estimatedDailyInterest = currentData.debts.reduce((sum, item) => {
    const hourlyRate = item.hourlyRate || (item.rate ? item.rate / 100 / 365 / 24 : 0);
    if (!hourlyRate) return sum;
    const principal = item.amountUSD ?? item.amount;
    return sum + principal * hourlyRate * 24;
  }, 0);

  // Interés estimado del mes (MTD): proyección basada en balance actual y tasa vigente
  const estimatedInterestMTD = currentData.debts.reduce((sum, item) => {
    const hourlyRate = item.hourlyRate || (item.rate ? item.rate / 100 / 365 / 24 : 0);
    if (!hourlyRate) return sum;
    const principal = item.amountUSD ?? item.amount;
    return sum + principal * (Math.pow(1 + hourlyRate, hoursIntoMonth) - 1);
  }, 0);

  // Interés estimado fin de mes: MTD + proyección de días restantes
  const remainingDays = Math.max(0, (hoursInMonth - hoursIntoMonth) / 24);
  const estimatedEndOfMonthInterest = estimatedInterestMTD + estimatedDailyInterest * remainingDays;

  const liquidationThresholdValue = totalDebt / (effectiveLiqLTV / 100);
  const globalDropNeeded = totalCollateralValue > 0 ? ((totalCollateralValue - liquidationThresholdValue) / totalCollateralValue) * 100 : 0;
  const isLiquidated = currentLTV >= effectiveLiqLTV;

  const calculateIndividualLiqPrice = (asset: CollateralItem) => {
    if (!asset.amount || asset.amount <= 0) return 0;
    const otherAssetsValue = totalCollateralValue - (asset.amount * asset.price);
    if (otherAssetsValue >= liquidationThresholdValue) return 0;
    const valueNeededFromThisAsset = liquidationThresholdValue - otherAssetsValue;
    return valueNeededFromThisAsset / asset.amount;
  };

  // --- Simulador de caída (estado local, sin Firebase) ---
  // ESCENARIO SIMULADO: caída uniforme proporcional de todos los activos
  const simFactor = 1 - simulationDrop / 100;
  const simCollateralValue = currentData.collateral.reduce((sum, item) => sum + item.amount * (item.marketPrice ?? item.price) * simFactor, 0);
  const simLTV = simCollateralValue > 0 ? (totalDebt / simCollateralValue) * 100 : 0;
  const simIsLiquidated = simLTV >= effectiveLiqLTV;
  const simBuffer = simIsLiquidated ? 0 : effectiveLiqLTV - simLTV;
  const simThresholdValue = totalDebt / (effectiveLiqLTV / 100);

  const fmtNum = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 });
  const fmtNumShort = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="bg-[#0E1014] text-gray-100 p-3 sm:p-4 font-sans relative rounded-2xl border border-gray-800/80 shadow-2xl">
      {toast && (
        <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-[100] flex items-center gap-2 px-4 py-3 rounded-lg shadow-xl border transition-all duration-300 ${toast.type === 'success' ? 'bg-green-900/90 border-green-500 text-green-100' : 'bg-red-900/90 border-red-500 text-red-100'} backdrop-blur-md`}>
          {toast.type === 'success' ? <CheckCircle size={20} /> : <XCircle size={20} />}
          <span className="font-medium text-sm">{toast.message}</span>
        </div>
      )}

      <div className="max-w-5xl mx-auto space-y-3">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-2 border-b border-gray-800 pb-3">
          <div>
            <h1 className="text-xl font-bold text-white hidden sm:flex items-center gap-2">
              <ShieldAlert className={theme.title} />
              Centro de Riesgo — {currentData.name}
            </h1>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="px-2.5 py-1.5 rounded-md bg-[#181A20] border border-green-900/50 hover:border-green-700 hover:bg-gray-800 text-green-400 flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
              title={`Sincronizar préstamos y colateral desde ${activeTab === 'bybit' ? 'Bybit' : 'Binance'}`}
            >
              <RefreshCw size={16} className={isSyncing ? "animate-spin" : ""} />
              <span className="hidden sm:inline text-sm font-medium">
                {isSyncing ? 'Sincronizando...' : `Sync ${activeTab === 'bybit' ? 'Bybit' : 'Binance'}`}
              </span>
            </button>
            {activeLastSynced && (
              <span className="text-[10px] text-slate-500 self-center hidden md:inline">
                ● Sincronizado · {new Date(activeLastSynced).toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={() => setShowSimulator(s => !s)}
              className={`px-2.5 py-1.5 rounded-md border flex items-center gap-2 transition-colors text-sm font-medium ${showSimulator ? 'bg-purple-700 border-purple-500 text-white' : 'bg-[#181A20] border-purple-900/50 hover:border-purple-700 hover:bg-gray-800 text-purple-400'}`}
            >
              <FlaskConical size={16} />
              <span className="hidden sm:inline">{showSimulator ? 'Cerrar Simulación' : 'Simular Caída'}</span>
            </button>
            <div className="flex bg-[#181A20] p-1 rounded-lg border border-gray-800">
              <button 
                onClick={() => setActiveTab('bybit')}
                className={`px-4 py-1.5 rounded-md font-semibold text-sm transition-all duration-200 ${
                  activeTab === 'bybit' ? `bg-yellow-500 text-black shadow-lg` : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                Bybit
              </button>
              <button 
                onClick={() => setActiveTab('binance')}
                className={`px-4 py-1.5 rounded-md font-semibold text-sm transition-all duration-200 ${
                  activeTab === 'binance' ? `bg-[#FCD535] text-black shadow-lg` : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                Binance
              </button>
            </div>
          </div>
        </div>

        {showSimulator && (
          <div className="bg-purple-950/30 border border-purple-800/50 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-purple-300 font-semibold flex items-center gap-2 text-sm uppercase tracking-widest">
                <FlaskConical size={16} className="text-purple-400" />
                ESCENARIO SIMULADO — {currentData.name}
              </h2>
              <span className="text-xs text-gray-500">Solo lectura · no afecta datos reales</span>
            </div>

            <div>
              <label className="flex items-center justify-between text-sm text-gray-400 mb-2">
                <span>Caída uniforme del colateral (todos los activos)</span>
                <span className="text-purple-300 font-bold text-lg">-{simulationDrop}%</span>
              </label>
              <input
                type="range"
                min="0" max="80" step="5"
                value={simulationDrop}
                onChange={(e) => setSimulationDrop(Number(e.target.value))}
                className="w-full cursor-pointer accent-purple-500"
              />
              <div className="flex justify-between text-xs text-gray-600 mt-1">
                <span>0%</span><span>-40%</span><span>-80%</span>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1">
              <div className="bg-[#0E1014] rounded-xl p-3 border border-gray-800">
                <div className="text-xs text-gray-500 mb-1">Colateral Proyectado</div>
                <div className="text-white font-bold">${simCollateralValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                <div className="text-xs text-gray-600 mt-0.5">-${(totalCollateralValue - simCollateralValue).toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
              </div>
              <div className="bg-[#0E1014] rounded-xl p-3 border border-gray-800">
                <div className="text-xs text-gray-500 mb-1">LTV Proyectado</div>
                <div className={`font-bold text-lg ${simIsLiquidated ? 'text-red-400' : simLTV > effectiveLiqLTV - 10 ? 'text-yellow-400' : 'text-green-400'}`}>
                  {simLTV.toFixed(2)}%
                </div>
                <div className="text-xs text-gray-600 mt-0.5">Límite estimado: {effectiveLiqLTV.toFixed(1)}%</div>
              </div>
              <div className="bg-[#0E1014] rounded-xl p-3 border border-gray-800">
                <div className="text-xs text-gray-500 mb-1">Buffer restante</div>
                {simIsLiquidated ? (
                  <div className="text-red-400 font-bold">LIQUIDACIÓN ESTIMADA</div>
                ) : (
                  <div className="text-green-400 font-bold">{simBuffer.toFixed(2)}%</div>
                )}
                <div className="text-xs text-gray-600 mt-0.5">margen hasta liq.</div>
              </div>
              <div className={`rounded-xl p-3 border flex flex-col justify-center items-center text-center ${simIsLiquidated ? 'bg-red-950/40 border-red-800/60' : 'bg-green-950/30 border-green-800/40'}`}>
                {simIsLiquidated ? (
                  <>
                    <AlertTriangle size={20} className="text-red-400 mb-1" />
                    <span className="text-red-300 font-bold text-sm">LIQUIDACIÓN</span>
                    <span className="text-xs text-red-500">con -{simulationDrop}% de caída</span>
                  </>
                ) : (
                  <>
                    <CheckCircle size={20} className="text-green-400 mb-1" />
                    <span className="text-green-300 font-bold text-sm">SEGURO</span>
                    <span className="text-xs text-green-600">con -{simulationDrop}% de caída</span>
                  </>
                )}
              </div>
            </div>

            {!simIsLiquidated && (
              <div className="text-xs text-gray-500 border-t border-gray-800 pt-3">
                Umbral de liquidación estimado: colateral debe bajar a <strong className="text-gray-300">${simThresholdValue.toLocaleString(undefined, {maximumFractionDigits: 0})}</strong> · actualmente proyectado en <strong className="text-gray-300">${simCollateralValue.toLocaleString(undefined, {maximumFractionDigits: 0})}</strong>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-[#181A20] p-3 rounded-xl border border-gray-800 text-center flex flex-col items-center justify-center min-h-[110px]">
            <div className="text-gray-400 text-sm mb-1">Deuda Total</div>
            <div className="text-xl font-bold text-white">${totalDebt.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
          </div>
          <div className="bg-[#181A20] p-3 rounded-xl border border-gray-800 text-center flex flex-col items-center justify-center min-h-[110px]">
            <div className="text-gray-400 text-sm mb-1">Colateral Total</div>
            <div className="text-xl font-bold text-white">${totalCollateralValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            {totalCollateralMarketValue > 0 && totalCollateralMarketValue !== totalCollateralValue && (
              <div className="text-[10px] text-gray-500 mt-0.5">Mercado: ${totalCollateralMarketValue.toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
            )}
          </div>
          <div className="bg-[#181A20] p-3 rounded-xl border border-gray-800 text-center flex flex-col items-center justify-center min-h-[110px] col-span-2 md:col-span-1 cursor-pointer hover:border-orange-500/50 transition-colors" onClick={() => setShowInterestHistory(true)}>
            <div className="text-gray-400 text-sm mb-1 capitalize">Intereses {monthLabel}</div>
            <div className="text-xs text-orange-400/60 mb-0.5">Estimado MTD</div>
            <div className="text-sm font-bold text-orange-300">~${estimatedInterestMTD.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            <div className="text-xs text-orange-300/60 mt-0.5">Est. fin de mes: ~${estimatedEndOfMonthInterest.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
          </div>
          <div className="bg-[#181A20] p-3 rounded-xl border border-gray-800 relative overflow-hidden flex flex-col justify-center min-h-[110px] col-span-2 md:col-span-1">
            <div className="text-gray-400 text-sm mb-1 text-center">LTV Actual</div>
            <div className={`text-xl font-bold ${isLiquidated ? 'text-red-500' : currentLTV > (effectiveLiqLTV - 10) ? 'text-yellow-500' : 'text-green-500'}`}>
              {currentLTV.toFixed(2)}%
            </div>
            <div className="w-full bg-gray-700 h-1.5 mt-2 rounded-full overflow-hidden relative">
              <div 
                className={`h-full transition-all duration-500 ${isLiquidated ? 'bg-red-500' : currentLTV > (effectiveLiqLTV - 10) ? 'bg-yellow-500' : 'bg-green-500'}`} 
                style={{ width: `${Math.min(currentLTV, 100)}%` }}
              ></div>
              <div 
                className="absolute top-0 bottom-0 w-1 bg-red-600 z-10 shadow-[0_0_5px_rgba(220,38,38,0.8)]" 
                style={{ left: `${effectiveLiqLTV}%`, transform: 'translateX(-50%)' }}
                title={`Límite de liquidación estimado: ${effectiveLiqLTV.toFixed(1)}%`}
              ></div>
            </div>
            <div className="text-xs text-gray-500 mt-1 flex justify-between">
              <span>0%</span>
              <span>Liq est.: {effectiveLiqLTV.toFixed(1)}%</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="space-y-4">
            <div className="bg-[#181A20] p-4 rounded-xl border border-gray-800 space-y-3 shadow-lg">
              <div className="flex justify-between items-center mb-2 border-b border-gray-700 pb-2">
                <h2 className="text-base font-semibold text-white">Préstamos ({currentData.name})</h2>
                <span className="text-[9px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded">API · SOLO LECTURA</span>
              </div>
              
              <div className="overflow-x-auto">
                <div className="min-w-[320px]">
                  <div className="grid grid-cols-4 gap-1 text-[10px] font-medium text-gray-400 px-1 uppercase tracking-wider">
                    <div className="col-span-1">Activo</div>
                    <div className="col-span-1 text-right">Deuda</div>
                    <div className="col-span-1 text-right" title="Tasa de interés Anual">Tasa</div>
                    <div className="col-span-1 text-right">USD</div>
                  </div>

                  {currentData.debts.map((item) => (
                    <div key={item._id} className="grid grid-cols-4 gap-1 items-center bg-[#0E1014] p-1.5 rounded-lg border border-gray-800">
                      <div className="col-span-1 flex items-center gap-1 min-w-0">
                        <span className="bg-transparent text-white font-bold uppercase text-xs truncate">{item.id || '---'}</span>
                        {item.synced && (
                          <span className="text-[8px] bg-green-500/20 text-green-400 px-1 rounded whitespace-nowrap flex-shrink-0">{activeTab.toUpperCase()}</span>
                        )}
                      </div>
                      <div className="col-span-1 text-right text-white text-xs tabular-nums truncate" title={fmtNum(item.amount)}>
                        {fmtNum(item.amount)}
                      </div>
                      <div className="col-span-1 text-right text-white text-xs tabular-nums">
                        {fmtNum(item.rate || 0)}%
                      </div>
                      <div className="col-span-1 text-right text-white text-xs tabular-nums truncate" title={`$${fmtNum(item.amountUSD ?? item.amount)}`}>
                        ${fmtNum(item.amountUSD ?? item.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-[#181A20] p-4 rounded-xl border border-gray-800 space-y-3 shadow-lg">
              <div className="flex justify-between items-center mb-2 border-b border-gray-700 pb-2">
                <h2 className="text-base font-semibold text-white">Colateral ({currentData.name})</h2>
                <span className="text-[9px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded">API · SOLO LECTURA</span>
              </div>

              <div className="overflow-x-auto">
                <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-400 px-1 uppercase tracking-wider">
                  <div className="col-span-3">Activo</div>
                  <div className="col-span-2 text-right">Cantidad</div>
                  <div className="col-span-2 text-right">P. Mercado</div>
                  <div className="col-span-2 text-right">Valor USD</div>
                  <div className="col-span-1 text-right hidden sm:block">Peso</div>
                  <div className="col-span-2 text-right hidden sm:block">MC / Liq</div>
                </div>
                
                {currentData.collateral.map((asset) => {
                  const marketVal = asset.marketValueUSD ?? asset.amount * (asset.marketPrice ?? asset.price);
                  const adjustedVal = asset.adjustedValueUSD ?? asset.amount * asset.price;
                  const weight = totalCollateralValue > 0 ? (adjustedVal / totalCollateralValue) * 100 : 0;
                  const mcLTV = currentData.perCoinMarginCallLTV?.[asset.id] ?? effectiveMCLTV;
                  const liqLTV = currentData.perCoinLiqLTV?.[asset.id] ?? effectiveLiqLTV;

                  return (
                    <div key={asset._id} className={`grid grid-cols-12 gap-2 items-center bg-[#0E1014] p-2 rounded-lg border border-gray-800 ${theme.borderHover} transition-colors`}>
                    <div className="col-span-3 flex items-center gap-1">
                      <span className="font-bold text-white uppercase px-1.5 py-1.5">{asset.id || '---'}</span>
                      {asset.synced && (
                        <span className="text-[8px] sm:text-[9px] bg-green-500/20 text-green-400 px-1 rounded whitespace-nowrap flex-shrink-0">{activeTab.toUpperCase()}</span>
                      )}
                    </div>
                    <div className="col-span-2 text-right text-white text-[11px] sm:text-xs px-1.5 py-1.5">
                      {fmtNumShort(asset.amount)}
                    </div>
                    <div className="col-span-2 text-right text-white text-[11px] sm:text-xs px-1.5 py-1.5">
                      ${fmtNumShort(asset.marketPrice ?? asset.price)}
                    </div>
                    <div className="col-span-2 text-right text-white text-[11px] sm:text-xs px-1.5 py-1.5">
                      ${fmtNumShort(marketVal)}
                    </div>
                    <div className="col-span-1 text-right text-gray-400 text-[11px] hidden sm:block px-1.5 py-1.5">
                      {weight.toFixed(1)}%
                    </div>
                    <div className="col-span-2 text-right hidden sm:block px-1.5 py-1.5">
                      <span className="text-yellow-400 text-[10px]">{mcLTV.toFixed(0)}%</span>
                      <span className="text-gray-600 mx-0.5">/</span>
                      <span className="text-red-400 text-[10px]">{liqLTV.toFixed(0)}%</span>
                    </div>
                  </div>
                  );
                })}
              </div>

              <div className="pt-3 mt-1 border-t border-gray-800">
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-[#0E1014] p-2 rounded-lg border border-gray-800 text-center">
                    <div className="text-[10px] text-yellow-400/70 mb-0.5">Margin Call (estimado)</div>
                    <div className="text-yellow-400 font-bold">{effectiveMCLTV.toFixed(1)}%</div>
                  </div>
                  <div className="bg-[#0E1014] p-2 rounded-lg border border-gray-800 text-center">
                    <div className="text-[10px] text-red-400/70 mb-0.5">Liquidación (estimado)</div>
                    <div className="text-red-400 font-bold">{effectiveLiqLTV.toFixed(1)}%</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-[#181A20] p-4 rounded-xl border border-gray-800 shadow-lg">
              <h2 className="text-base font-semibold text-white mb-2 flex items-center gap-2">
                <TrendingDown className="text-red-400" size={18} />
                ESCENARIO: Caída Global — {currentData.name}
              </h2>

              {isLiquidated ? (
                <div className="bg-red-900/40 border border-red-500/50 p-3 rounded-lg flex items-start gap-3 mt-2">
                  <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={20} />
                  <div>
                    <strong className="text-red-400 block mb-1">⚠️ En Zona de Liquidación</strong>
                    <p className="text-sm text-gray-300">
                      Tu LTV actual ({currentLTV.toFixed(2)}%) supera el límite estimado de {effectiveLiqLTV.toFixed(1)}%. Tienes un déficit de colateral crítico.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-400 mb-2">
                    Si todos tus activos cayeran simultáneamente, serías liquidado cuando el valor total del colateral llegue a <strong className="text-white">${liquidationThresholdValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong>.
                  </p>
                  <div className="bg-[#2A1C1C] border border-red-900/50 text-red-300 p-3 rounded-lg flex items-center justify-between">
                    <span>Caída requerida para liquidación:</span>
                    <span className="text-2xl font-bold">-{globalDropNeeded.toFixed(2)}%</span>
                  </div>
                  {effectiveMCLTV && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-yellow-400">
                      <AlertTriangle size={14} />
                      <span>Alerta {currentData.name} a LTV {effectiveMCLTV.toFixed(1)}% (estimado)</span>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="bg-[#181A20] p-4 rounded-xl border border-gray-800 shadow-lg">
              <h2 className="text-base font-semibold text-white mb-2 flex items-center gap-2">
                <AlertTriangle className="text-orange-400" size={18} />
                Liquidación Individual — {currentData.name}
              </h2>
              <p className="text-sm text-gray-400 mb-2">
                Precio hipotético de estrés: si <strong>solo este activo cae</strong> y el resto permanece constante. NO es necesariamente el precio oficial de liquidación del exchange.
              </p>

              <div className="space-y-2">
                {currentData.collateral.map((asset) => {
                  const liqPrice = calculateIndividualLiqPrice(asset);
                  const isSafe = liqPrice <= 0 || !asset.amount || !(asset.marketPrice ?? asset.price);
                  const currentPrice = asset.marketPrice ?? asset.price;
                  const priceDrop = isSafe ? 100 : ((currentPrice - liqPrice) / currentPrice) * 100;
                  const coinLiqLTV = currentData.perCoinLiqLTV?.[asset.id] ?? effectiveLiqLTV;

                  return (
                    <div key={`liq-${asset._id}`} className={`bg-[#0E1014] p-2 rounded-lg border border-gray-800 flex justify-between items-center border-l-2 border-l-transparent ${theme.borderHover} transition-all`}>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white uppercase">{asset.id || '---'}</span>
                        <span className="text-[9px] bg-gray-800 text-gray-400 px-1 rounded">
                          Liq: {coinLiqLTV.toFixed(0)}%
                        </span>
                      </div>
                      <div className="text-right">
                        {isSafe ? (
                          <span className="text-green-500 font-medium text-sm bg-green-500/10 px-2 py-1 rounded">
                            Seguro incluso a $0
                          </span>
                        ) : (
                          <div className="flex flex-col items-end">
                            <span className="text-white font-bold">
                              ${liqPrice.toLocaleString(undefined, {minimumFractionDigits: 4, maximumFractionDigits: 4})}
                            </span>
                            <span className="text-red-400 text-xs text-right">-{priceDrop.toFixed(2)}% de caída</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        </div>

        {/* ── Riesgo por Activo ─────────────────────────────────── */}
        <div className="bg-[#181A20] p-4 rounded-xl border border-gray-800 shadow-lg">
          <h2 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
            <ShieldAlert className="text-blue-400" size={18} />
            Riesgo por Activo — {currentData.name}
          </h2>
          <p className="text-xs text-gray-500 mb-3">Peso de cada activo en el colateral total y su impacto potencial sobre el riesgo de liquidación.</p>

          <div className="space-y-2">
            {currentData.collateral.map((asset) => {
              const adjustedVal = asset.adjustedValueUSD ?? asset.amount * asset.price;
              const weight = totalCollateralValue > 0 ? (adjustedVal / totalCollateralValue) * 100 : 0;
              const impact = weight >= 50 ? 'ALTO' : weight >= 20 ? 'MEDIO' : weight >= 5 ? 'BAJO' : 'MÍNIMO';
              const impactColor = weight >= 50 ? 'text-red-400 bg-red-500/10' : weight >= 20 ? 'text-yellow-400 bg-yellow-500/10' : weight >= 5 ? 'text-blue-400 bg-blue-500/10' : 'text-gray-500 bg-gray-500/10';

              return (
                <div key={`risk-${asset._id}`} className="bg-[#0E1014] p-2 rounded-lg border border-gray-800 flex items-center gap-3">
                  <div className="w-16">
                    <span className="font-bold text-white uppercase text-sm">{asset.id}</span>
                  </div>
                  <div className="flex-1">
                    <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${weight >= 50 ? 'bg-red-500' : weight >= 20 ? 'bg-yellow-500' : weight >= 5 ? 'bg-blue-500' : 'bg-gray-500'}`}
                        style={{ width: `${Math.min(weight, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right w-20">
                    <span className="text-white font-bold text-sm">{weight.toFixed(1)}%</span>
                  </div>
                  <div className="w-20 text-right">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${impactColor}`}>{impact}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {showInterestHistory && (
        <InterestHistoryModal
          isOpen={showInterestHistory}
          onClose={() => setShowInterestHistory(false)}
          exchange={activeTab}
          exchangeName={currentData.name}
          currentMonthInterest={estimatedInterestMTD}
          currentMonthEstimate={estimatedEndOfMonthInterest}
        />
      )}
    </div>
  );
}
