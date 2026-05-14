import React, { useState, useEffect, useMemo } from 'react';
import { ShieldAlert, TrendingDown, AlertTriangle, Trash2, Plus, Clock, RefreshCw, CheckCircle, XCircle, FlaskConical } from 'lucide-react';
import { useLiquidationData, DebtItem, CollateralItem } from '../hooks/useLiquidationData';

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

interface LiquidationDashboardProps {
  prices: Record<string, number>;
  pricesLoading: boolean;
  refreshPrices: () => void;
}

export default function LiquidationDashboard({ prices, pricesLoading, refreshPrices }: LiquidationDashboardProps) {
  const [activeTab, setActiveTab] = useState<'bybit' | 'binance'>('bybit');
  const [toast, setToast] = useState<{message: string; type: 'success' | 'error'} | null>(null);
  const [showSimulator, setShowSimulator] = useState(false);
  const [simulationDrop, setSimulationDrop] = useState(20);

  // Estado persistido en Firebase (cantidades y config, NO precios live)
  const { exchangeData, saveExchangeData, loading: dataLoading } = useLiquidationData();

  // Apply live prices to collateral at render-time (no Firebase writes)
  const liveExchangeData = useMemo(() => {
    if (Object.keys(prices).length === 0) return exchangeData;
    const updatePrices = (items: CollateralItem[]) => items.map(item => {
      const coinToken = item.id.toUpperCase();
      const currentMarketPrice = prices[coinToken];
      return currentMarketPrice ? { ...item, price: currentMarketPrice } : item;
    });
    return {
      ...exchangeData,
      bybit: { ...exchangeData.bybit, collateral: updatePrices(exchangeData.bybit.collateral) },
      binance: { ...exchangeData.binance, collateral: updatePrices(exchangeData.binance.collateral) }
    };
  }, [exchangeData, prices]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

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
          i === index ? { ...item, [field]: field === 'id' ? value : parseFloat(value) || 0 } : item
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
          i === index ? { ...item, [field]: field === 'id' ? value : parseFloat(value) || 0 } : item
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

  const totalDebt = currentData.debts.reduce((sum, item) => sum + (item.amount * item.price), 0);
  const totalCollateralValue = currentData.collateral.reduce((sum, item) => sum + (item.amount * item.price), 0);
  const currentLTV = totalCollateralValue > 0 ? (totalDebt / totalCollateralValue) * 100 : 0;
  
  const projectedDebt30d = currentData.debts.reduce((sum, item) => {
    const rateDecimal = item.rate / 100;
    const projectedAmount = item.amount * Math.pow(1 + rateDecimal / 365, 30);
    return sum + (projectedAmount * item.price);
  }, 0);
  const interest30d = projectedDebt30d - totalDebt;

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

  const getInputClass = (val: number) => `w-full bg-transparent text-white outline-none rounded px-1 transition-all ${val <= 0 ? 'ring-1 ring-red-500 bg-red-500/10' : ''}`;

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
              onClick={() => { refreshPrices(); setToast({message: 'Sincronizando con mercado...', type: 'success'}); }}
              disabled={pricesLoading}
              className="px-2.5 py-1.5 rounded-md bg-[#181A20] border border-blue-900/50 hover:border-blue-700 hover:bg-gray-800 text-blue-400 flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            >
              <RefreshCw size={16} className={pricesLoading ? "animate-spin" : ""} /> 
              <span className="hidden sm:inline text-sm font-medium">
                {pricesLoading ? 'Obteniendo...' : 'Actualizar Mercado'}
              </span>
            </button>
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className={`bg-[#181A20] p-3 rounded-xl border-y border-r border-gray-800 ${theme.borderLeft} border-l-4`}>
            <div className="text-gray-400 text-sm mb-1">Deuda Total</div>
            <div className="text-xl font-bold text-white">${totalDebt.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            {totalDebt > 0 && (
              <div className="text-xs text-orange-400/80 mt-2 flex items-center gap-1" title="Interés compuesto estimado">
                <Clock size={12}/> +${interest30d.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} est. en 30 días
              </div>
            )}
          </div>
          <div className="bg-[#181A20] p-3 rounded-xl border border-gray-800">
            <div className="text-gray-400 text-sm mb-1">Valor del Colateral</div>
            <div className="text-xl font-bold text-white">${totalCollateralValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
          </div>
          <div className="bg-[#181A20] p-3 rounded-xl border border-gray-800 relative overflow-hidden">
            <div className="text-gray-400 text-sm mb-1">LTV Actual</div>
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
              
              <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-400 px-1 uppercase tracking-wider">
                <div className="col-span-3">Activo</div>
                <div className="col-span-3">Cantidad</div>
                <div className="col-span-3">Precio ($)</div>
                <div className="col-span-2" title="Tasa de interés Anual">Tasa (%)</div>
                <div className="col-span-1"></div>
              </div>

              {currentData.debts.map((item, index) => (
                <div key={item._id} className="grid grid-cols-12 gap-2 items-center bg-[#0E1014] p-2 rounded-lg border border-gray-800 focus-within:border-blue-500 transition-colors">
                  <div className="col-span-3">
                    <input type="text" value={item.id} onChange={(e) => handleDebtChange(index, 'id', e.target.value)} className="w-full bg-transparent text-white font-bold outline-none uppercase px-1" placeholder="USDT" />
                  </div>
                  <div className="col-span-3">
                    <input type="number" value={item.amount} onChange={(e) => handleDebtChange(index, 'amount', e.target.value)} className={getInputClass(item.amount)} step="any" />
                  </div>
                  <div className="col-span-3 flex items-center">
                    <span className="text-gray-500 mr-1">$</span>
                    <input type="number" value={item.price} onChange={(e) => handleDebtChange(index, 'price', e.target.value)} className={getInputClass(item.price)} step="any" />
                  </div>
                  <div className="col-span-2 flex items-center">
                    <input type="number" value={item.rate || 0} onChange={(e) => handleDebtChange(index, 'rate', e.target.value)} className="w-full bg-transparent text-white outline-none px-1" step="any" />
                    <span className="text-gray-500">%</span>
                  </div>
                  <div className="col-span-1 text-right flex justify-end">
                    <button onClick={() => removeDebt(index)} className="text-gray-500 hover:text-red-400 transition-colors p-1"><Trash2 size={16}/></button>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-[#181A20] p-4 rounded-xl border border-gray-800 space-y-3 shadow-lg">
              <div className="flex justify-between items-center mb-2 border-b border-gray-700 pb-2">
                <h2 className="text-base font-semibold text-white">Colateral ({currentData.name})</h2>
                <button onClick={addCollateral} className={`text-sm ${theme.bgBtn} ${theme.textBtn} hover:opacity-80 transition-opacity font-medium px-3 py-1.5 rounded flex items-center gap-1`}>
                  <Plus size={16}/> Agregar
                </button>
              </div>

              <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-400 px-1 uppercase tracking-wider">
                <div className="col-span-3">Activo</div>
                <div className="col-span-4">Cantidad</div>
                <div className="col-span-4">Precio ($)</div>
                <div className="col-span-1"></div>
              </div>
              
              {currentData.collateral.map((asset, index) => (
                <div key={asset._id} className={`grid grid-cols-12 gap-2 items-center bg-[#0E1014] p-2 rounded-lg border border-gray-800 ${theme.borderHover} transition-colors focus-within:border-gray-600`}>
                  <div className="col-span-3">
                    <input type="text" value={asset.id} onChange={(e) => handleCollateralChange(index, 'id', e.target.value)} className="w-full bg-transparent text-white font-bold outline-none uppercase px-1" placeholder="BTC" />
                  </div>
                  <div className="col-span-4">
                    <input type="number" value={asset.amount} onChange={(e) => handleCollateralChange(index, 'amount', e.target.value)} className={getInputClass(asset.amount)} step="any" />
                  </div>
                  <div className="col-span-4 flex items-center">
                    <span className="text-gray-500 mr-1">$</span>
                    <input type="number" readOnly value={asset.price} className="w-full bg-transparent text-gray-400 outline-none rounded px-1" title="Precio automático desde el mercado global" />
                  </div>
                  <div className="col-span-1 text-right flex justify-end">
                    <button onClick={() => removeCollateral(index)} className="text-gray-500 hover:text-red-400 transition-colors p-1"><Trash2 size={16}/></button>
                  </div>
                </div>
              ))}

              <div className="pt-3 mt-1 border-t border-gray-800">
                <label className="text-sm text-gray-400 flex items-center justify-between mb-1">
                  <span>LTV de Liquidación ({currentData.name})</span>
                  <span className="text-white font-bold bg-gray-800 px-2 py-1 rounded">{currentData.liquidationLTV}%</span>
                </label>
                <input 
                  type="range" 
                  min="70" max="95" step="1" 
                  value={currentData.liquidationLTV} 
                  onChange={(e) => handleLTVChange(e.target.value)}
                  className={`w-full mt-2 cursor-pointer ${theme.accent}`}
                />
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
                </>
              )}
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
    </div>
  );
}
