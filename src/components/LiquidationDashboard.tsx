import React, { useState, useEffect } from 'react';
import { ShieldAlert, TrendingDown, AlertTriangle, Trash2, Plus, RefreshCw, CheckCircle, XCircle, FlaskConical } from 'lucide-react';
import { useLiquidationData, DebtItem, CollateralItem } from '../hooks/useLiquidationData';
import { useBybitSync } from '../hooks/useBybitSync';
import { useBinanceSync } from '../hooks/useBinanceSync';
import InterestHistoryModal from './InterestHistoryModal';

const generateId = () => {
  const _crypto = typeof window !== 'undefined' ? (window.crypto as any) : null;
  return _crypto && _crypto.randomUUID 
    ? _crypto.randomUUID() 
    : Math.random().toString(36).substring(2, 15);
};

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

  const handleLTVChange = (value: string) => {
    saveExchangeData(prev => ({
      ...prev,
      [activeTab]: { ...prev[activeTab], liquidationLTV: Number(value) }
    }));
  };

  const handleDebtChange = (index: number, field: keyof DebtItem, value: string) => {
    saveExchangeData(prev => ({
      ...prev,
      [activeTab]: {
        ...prev[activeTab],
        debts: prev[activeTab].debts.map((item, i) => 
          i === index ? { ...item, [field]: field === 'id' ? value : parseFloat(value.replace(/,/g, '')) || 0 } : item
        )
      }
    }));
  };

  const addDebt = () => {
    saveExchangeData(prev => ({
      ...prev,
      [activeTab]: {
        ...prev[activeTab],
        debts: [...prev[activeTab].debts, { _id: generateId(), id: 'NUEVA', amount: 0, price: 1.0, rate: 0 }]
      }
    }));
  };

  const removeDebt = (index: number) => {
    saveExchangeData(prev => ({
      ...prev,
      [activeTab]: {
        ...prev[activeTab],
        debts: prev[activeTab].debts.filter((_, i) => i !== index)
      }
    }));
  };

  const handleCollateralChange = (index: number, field: keyof CollateralItem, value: string) => {
    saveExchangeData(prev => ({
      ...prev,
      [activeTab]: {
        ...prev[activeTab],
        collateral: prev[activeTab].collateral.map((item, i) => 
          i === index ? { ...item, [field]: field === 'id' ? value : parseFloat(value.replace(/,/g, '')) || 0 } : item
        )
      }
    }));
  };

  const addCollateral = () => {
    saveExchangeData(prev => ({
      ...prev,
      [activeTab]: {
        ...prev[activeTab],
        collateral: [...prev[activeTab].collateral, { _id: generateId(), id: 'NUEVO', amount: 0, price: 0 }]
      }
    }));
  };

  const removeCollateral = (index: number) => {
    saveExchangeData(prev => ({
      ...prev,
      [activeTab]: {
        ...prev[activeTab],
        collateral: prev[activeTab].collateral.filter((_, i) => i !== index)
      }
    }));
  };

  // Usar agregados del exchange si están (Bybit los calcula exacto), si no, calcular localmente
  const totalDebt = currentData.totalDebt ?? currentData.debts.reduce((sum, item) => sum + (item.amount * item.price), 0);
  const totalCollateralValue = currentData.totalCollateral ?? currentData.collateral.reduce((sum, item) => sum + (item.amount * item.price), 0);
  const currentLTV = currentData.ltvFromExchange ?? (totalCollateralValue > 0 ? (totalDebt / totalCollateralValue) * 100 : 0);

  // Intereses del mes actual (MTD + estimado fin de mes)
  const now = new Date();
  const monthLabel = now.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const hoursIntoMonth = (now.getTime() - startOfMonth.getTime()) / (1000 * 60 * 60);
  const hoursInMonth = (endOfMonth.getTime() - startOfMonth.getTime()) / (1000 * 60 * 60);

  const interestMTD = currentData.debts.reduce((sum, item) => {
    const hourlyRate = item.hourlyRate || (item.rate ? item.rate / 100 / 365 / 24 : 0);
    if (!hourlyRate) return sum;
    const principal = item.amount - (item.accruedInterest || 0);
    return sum + principal * (Math.pow(1 + hourlyRate, hoursIntoMonth) - 1);
  }, 0);

  const interestFullMonth = currentData.debts.reduce((sum, item) => {
    const hourlyRate = item.hourlyRate || (item.rate ? item.rate / 100 / 365 / 24 : 0);
    if (!hourlyRate) return sum;
    const principal = item.amount - (item.accruedInterest || 0);
    return sum + principal * (Math.pow(1 + hourlyRate, hoursInMonth) - 1);
  }, 0);

  const liquidationThresholdValue = totalDebt / (currentData.liquidationLTV / 100);
  const globalDropNeeded = totalCollateralValue > 0 ? ((totalCollateralValue - liquidationThresholdValue) / totalCollateralValue) * 100 : 0;
  const isLiquidated = currentLTV >= currentData.liquidationLTV;

  const calculateIndividualLiqPrice = (asset: CollateralItem) => {
    if (!asset.amount || asset.amount <= 0) return 0;
    const otherAssetsValue = totalCollateralValue - (asset.amount * asset.price);
    if (otherAssetsValue >= liquidationThresholdValue) return 0;
    const valueNeededFromThisAsset = liquidationThresholdValue - otherAssetsValue;
    return valueNeededFromThisAsset / asset.amount;
  };

  // --- Simulador de caída (estado local, sin Firebase) ---
  const simFactor = 1 - simulationDrop / 100;
  const simCollateralValue = currentData.collateral.reduce((sum, item) => sum + item.amount * item.price * simFactor, 0);
  const simLTV = simCollateralValue > 0 ? (totalDebt / simCollateralValue) * 100 : 0;
  const simIsLiquidated = simLTV >= currentData.liquidationLTV;
  const simBuffer = simIsLiquidated ? 0 : currentData.liquidationLTV - simLTV;
  const simThresholdValue = totalDebt / (currentData.liquidationLTV / 100);

  const getInputClass = (val: number) => `w-full bg-transparent text-white outline-none rounded px-1.5 py-1.5 transition-all ${val <= 0 ? 'ring-1 ring-red-500 bg-red-500/10' : ''}`;

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
              Simulador LTV Multiexchange
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
                Último sync: {new Date(activeLastSynced).toLocaleTimeString()}
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
                Simulador de Caída — {currentData.name}
              </h2>
              <span className="text-xs text-gray-500">Solo lectura · no afecta datos reales</span>
            </div>

            <div>
              <label className="flex items-center justify-between text-sm text-gray-400 mb-2">
                <span>Caída del mercado (todos los activos)</span>
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
                <div className={`font-bold text-lg ${simIsLiquidated ? 'text-red-400' : simLTV > currentData.liquidationLTV - 10 ? 'text-yellow-400' : 'text-green-400'}`}>
                  {simLTV.toFixed(2)}%
                </div>
                <div className="text-xs text-gray-600 mt-0.5">Límite: {currentData.liquidationLTV}%</div>
              </div>
              <div className="bg-[#0E1014] rounded-xl p-3 border border-gray-800">
                <div className="text-xs text-gray-500 mb-1">Buffer restante</div>
                {simIsLiquidated ? (
                  <div className="text-red-400 font-bold">Liquidado</div>
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
                Umbral de liquidación: colateral debe bajar a <strong className="text-gray-300">${simThresholdValue.toLocaleString(undefined, {maximumFractionDigits: 0})}</strong> · actualmente proyectado en <strong className="text-gray-300">${simCollateralValue.toLocaleString(undefined, {maximumFractionDigits: 0})}</strong>
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
            <div className="text-gray-400 text-sm mb-1">Valor del Colateral</div>
            <div className="text-xl font-bold text-white">${totalCollateralValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
          </div>
          <div className="bg-[#181A20] p-3 rounded-xl border border-gray-800 text-center flex flex-col items-center justify-center min-h-[110px] col-span-2 md:col-span-1 cursor-pointer hover:border-orange-500/50 transition-colors" onClick={() => setShowInterestHistory(true)}>
            <div className="text-gray-400 text-sm mb-1 capitalize">Intereses {monthLabel}</div>
            <div className="text-sm font-bold text-orange-400">+${interestMTD.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            <div className="text-[10px] text-orange-400/60">acumulado</div>
            <div className="text-sm font-bold text-orange-300 mt-1">~${interestFullMonth.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            <div className="text-[10px] text-orange-300/60">estimado fin de mes</div>
          </div>
          <div className="bg-[#181A20] p-3 rounded-xl border border-gray-800 relative overflow-hidden flex flex-col justify-center min-h-[110px] col-span-2 md:col-span-1">
            <div className="text-gray-400 text-sm mb-1 text-center">LTV Actual</div>
            <div className={`text-xl font-bold ${isLiquidated ? 'text-red-500' : currentLTV > (currentData.liquidationLTV - 10) ? 'text-yellow-500' : 'text-green-500'}`}>
              {currentLTV.toFixed(2)}%
            </div>
            <div className="w-full bg-gray-700 h-1.5 mt-2 rounded-full overflow-hidden relative">
              <div 
                className={`h-full transition-all duration-500 ${isLiquidated ? 'bg-red-500' : currentLTV > (currentData.liquidationLTV - 10) ? 'bg-yellow-500' : 'bg-green-500'}`} 
                style={{ width: `${Math.min(currentLTV, 100)}%` }}
              ></div>
              <div 
                className="absolute top-0 bottom-0 w-1 bg-red-600 z-10 shadow-[0_0_5px_rgba(220,38,38,0.8)]" 
                style={{ left: `${currentData.liquidationLTV}%`, transform: 'translateX(-50%)' }}
                title={`Límite de liquidación: ${currentData.liquidationLTV}%`}
              ></div>
            </div>
            <div className="text-xs text-gray-500 mt-1 flex justify-between">
              <span>0%</span>
              <span>Liq: {currentData.liquidationLTV}%</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="space-y-4">
            <div className="bg-[#181A20] p-4 rounded-xl border border-gray-800 space-y-3 shadow-lg">
              <div className="flex justify-between items-center mb-2 border-b border-gray-700 pb-2">
                <h2 className="text-base font-semibold text-white">Préstamos ({currentData.name})</h2>
                <button onClick={addDebt} className="text-sm bg-blue-600 hover:bg-blue-500 transition-colors text-white px-3 py-1.5 rounded flex items-center gap-1">
                  <Plus size={16}/> Agregar
                </button>
              </div>
              
              <div className="overflow-x-auto">
                <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-400 px-1 uppercase tracking-wider">
                  <div className="col-span-4 sm:col-span-3">Activo</div>
                  <div className="col-span-4 sm:col-span-2 text-right">Cantidad</div>
                  <div className="col-span-4 sm:col-span-3 text-right" title="Tasa de interés Anual">Tasa (%)</div>
                  <div className="col-span-3 text-right hidden sm:block">Precio ($)</div>
                  <div className="col-span-1 hidden sm:block"></div>
                </div>

                {currentData.debts.map((item, index) => (
                  <div key={item._id} className="grid grid-cols-12 gap-2 items-center bg-[#0E1014] p-2 rounded-lg border border-gray-800 focus-within:border-blue-500 transition-colors">
                  <div className="col-span-4 sm:col-span-3 flex items-center gap-1">
                    <input type="text" value={item.id} onChange={(e) => handleDebtChange(index, 'id', e.target.value)} className="w-full bg-transparent text-white font-bold outline-none uppercase px-1.5 py-1.5" placeholder="USDT" />
                    {item.synced && (
                      <span className="text-[9px] bg-green-500/20 text-green-400 px-1 rounded whitespace-nowrap flex-shrink-0">{activeTab.toUpperCase()}</span>
                    )}
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <input type="text" value={fmtNum(item.amount)} onChange={(e) => handleDebtChange(index, 'amount', e.target.value)} className={`${getInputClass(item.amount)} text-right`} />
                  </div>
                  <div className="col-span-4 sm:col-span-3 flex items-center justify-end">
                    <input type="text" value={fmtNum(item.rate || 0)} onChange={(e) => handleDebtChange(index, 'rate', e.target.value)} className="w-full bg-transparent text-white outline-none px-1.5 py-1.5 text-right" />
                    <span className="text-gray-500 ml-0.5">%</span>
                  </div>
                  <div className="col-span-3 flex items-center justify-end hidden sm:flex">
                    <span className="text-gray-500 mr-1">$</span>
                    <input type="text" value={fmtNum(item.price)} onChange={(e) => handleDebtChange(index, 'price', e.target.value)} className={`${getInputClass(item.price)} text-right w-20`} />
                  </div>
                  <div className="col-span-1 text-right flex justify-end hidden sm:flex">
                    <button onClick={() => removeDebt(index)} className="text-gray-500 hover:text-red-400 transition-colors p-1"><Trash2 size={16}/></button>
                  </div>
                </div>
              ))}
              </div>
            </div>

            <div className="bg-[#181A20] p-4 rounded-xl border border-gray-800 space-y-3 shadow-lg">
              <div className="flex justify-between items-center mb-2 border-b border-gray-700 pb-2">
                <h2 className="text-base font-semibold text-white">Colateral ({currentData.name})</h2>
                <button onClick={addCollateral} className={`text-sm ${theme.bgBtn} ${theme.textBtn} hover:opacity-80 transition-opacity font-medium px-3 py-1.5 rounded flex items-center gap-1`}>
                  <Plus size={16}/> Agregar
                </button>
              </div>

              <div className="overflow-x-auto">
                <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-400 px-1 uppercase tracking-wider">
                  <div className="col-span-4 sm:col-span-3">Activo</div>
                  <div className="col-span-4 text-right">Cantidad</div>
                  <div className="col-span-4 text-right">Precio ($)</div>
                  <div className="col-span-1 hidden sm:block"></div>
                </div>
                
                {currentData.collateral.map((asset, index) => (
                  <div key={asset._id} className={`grid grid-cols-12 gap-2 items-center bg-[#0E1014] p-2 rounded-lg border border-gray-800 ${theme.borderHover} transition-colors focus-within:border-gray-600`}>
                  <div className="col-span-4 sm:col-span-3 flex items-center gap-1">
                    <input type="text" value={asset.id} onChange={(e) => handleCollateralChange(index, 'id', e.target.value)} className="w-full bg-transparent text-white font-bold outline-none uppercase px-1.5 py-1.5" placeholder="BTC" />
                    {asset.synced && (
                      <span className="text-[8px] sm:text-[9px] bg-green-500/20 text-green-400 px-1 rounded whitespace-nowrap flex-shrink-0">{activeTab.toUpperCase()}</span>
                    )}
                  </div>
                  <div className="col-span-4">
                    <input type="text" value={fmtNumShort(asset.amount)} onChange={(e) => handleCollateralChange(index, 'amount', e.target.value)} className={`${getInputClass(asset.amount)} text-right text-[11px] sm:text-xs`} />
                  </div>
                  <div className="col-span-4 flex items-center justify-end">
                    <span className="text-gray-500 mr-1 text-[11px] sm:text-xs">$</span>
                    <span className="text-white px-1 sm:px-1.5 py-1.5 text-right text-[11px] sm:text-xs" title="Precio automático desde el mercado global">{fmtNumShort(asset.price)}</span>
                  </div>
                  <div className="col-span-1 text-right flex justify-end hidden sm:flex">
                    <button onClick={() => removeCollateral(index)} className="text-gray-500 hover:text-red-400 transition-colors p-1"><Trash2 size={16}/></button>
                  </div>
                </div>
              ))}
              </div>

              <div className="pt-3 mt-1 border-t border-gray-800">
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-[#0E1014] p-2 rounded-lg border border-gray-800 text-center">
                    <div className="text-[10px] text-yellow-400/70 mb-0.5">Margin Call</div>
                    <div className="text-yellow-400 font-bold">{currentData.marginCallLTV ?? '—'}%</div>
                  </div>
                  <div className="bg-[#0E1014] p-2 rounded-lg border border-gray-800 text-center">
                    <div className="text-[10px] text-red-400/70 mb-0.5">Liquidación (API)</div>
                    <div className="text-red-400 font-bold">{currentData.liquidationLTV}%</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-[#181A20] p-4 rounded-xl border border-gray-800 shadow-lg">
              <h2 className="text-base font-semibold text-white mb-2 flex items-center gap-2">
                <TrendingDown className="text-red-400" size={18} />
                Caída Global - {currentData.name}
              </h2>

              {isLiquidated ? (
                <div className="bg-red-900/40 border border-red-500/50 p-3 rounded-lg flex items-start gap-3 mt-2">
                  <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={20} />
                  <div>
                    <strong className="text-red-400 block mb-1">⚠️ En Zona de Liquidación</strong>
                    <p className="text-sm text-gray-300">
                      Tu LTV actual ({currentLTV.toFixed(2)}%) supera el límite de {currentData.liquidationLTV}%. Tienes un déficit de colateral crítico.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-400 mb-2">
                    Si todos tus activos cayeran simultáneamente, serías liquidado cuando el valor total del colateral llegue a <strong className="text-white">${liquidationThresholdValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong>.
                  </p>
                  <div className="bg-[#2A1C1C] border border-red-900/50 text-red-300 p-3 rounded-lg flex items-center justify-between">
                    <span>Caída requerida:</span>
                    <span className="text-2xl font-bold">-{globalDropNeeded.toFixed(2)}%</span>
                  </div>
                  {currentData.marginCallLTV && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-yellow-400">
                      <AlertTriangle size={14} />
                      <span>Alerta {currentData.name} a LTV {currentData.marginCallLTV}%</span>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="bg-[#181A20] p-4 rounded-xl border border-gray-800 shadow-lg">
              <div className="flex justify-between items-center mb-3 border-b border-gray-700 pb-2">
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  <AlertTriangle className="text-orange-400" size={18} />
                  Ajuste LTV de Liquidación
                </h2>
                <span className="text-white font-bold bg-gray-800 px-2 py-1 rounded text-sm">{currentData.liquidationLTV}%</span>
              </div>
              <p className="text-xs text-gray-400 mb-3">
                Weighted average API: {currentData.weightedAvgLiqLTV ?? '—'}% · 
                Margin call: {currentData.marginCallLTV ?? '—'}%
              </p>
              <input 
                type="range" 
                min="70" max="98" step="1" 
                value={currentData.liquidationLTV} 
                onChange={(e) => handleLTVChange(e.target.value)}
                className={`w-full cursor-pointer ${theme.accent}`}
              />
              <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                <span>70%</span><span>85%</span><span>98%</span>
              </div>
            </div>

            <div className="bg-[#181A20] p-4 rounded-xl border border-gray-800 shadow-lg">
              <h2 className="text-base font-semibold text-white mb-2 flex items-center gap-2">
                <AlertTriangle className="text-orange-400" size={18} />
                Liquidación Individual - {currentData.name}
              </h2>
              <p className="text-sm text-gray-400 mb-2">
                Precio exacto al que debe caer <strong>una sola moneda</strong> para liquidarte, asumiendo que el resto mantienen su valor.
              </p>

              <div className="space-y-2">
                {currentData.collateral.map((asset) => {
                  const liqPrice = calculateIndividualLiqPrice(asset);
                  const isSafe = liqPrice <= 0 || !asset.amount || !asset.price;
                  const priceDrop = isSafe ? 100 : ((asset.price - liqPrice) / asset.price) * 100;

                  return (
                    <div key={`liq-${asset._id}`} className={`bg-[#0E1014] p-2 rounded-lg border border-gray-800 flex justify-between items-center border-l-2 border-l-transparent ${theme.borderHover} transition-all`}>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white uppercase">{asset.id || '---'}</span>
                        <span className="text-[9px] bg-gray-800 text-gray-400 px-1 rounded">
                          LiqLTV: {currentData.perCoinLiqLTV?.[asset.id] ?? '92'}%
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
      </div>

      {showInterestHistory && (
        <InterestHistoryModal
          isOpen={showInterestHistory}
          onClose={() => setShowInterestHistory(false)}
          exchange={activeTab}
          exchangeName={currentData.name}
          currentMonthInterest={interestMTD}
          currentMonthEstimate={interestFullMonth}
        />
      )}
    </div>
  );
}
