import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Calculator, AlertCircle, ShieldCheck, Settings,
  ArrowLeft, TrendingUp, TrendingDown, AlertTriangle,
  Monitor, CheckCircle2,
  Save, FolderOpen, X, ShoppingCart
} from 'lucide-react';
import { usePrices } from '../hooks/usePrices';
import { useSellStrategies, SellStrategy, SellStrategyData } from '../hooks/useSellStrategies';
import { AVAILABLE_COINS, ProcessedInvestment } from '../lib/constants';
import DeleteButton from './DeleteButton';

export interface BuyPreload {
  coin: string;
  usdtAmount: number;
  sellPrice: number;
}

// --- UTILIDADES ---
const formatDec = (num: number): string => {
  if (num === 0) return '0.00000';
  if (num >= 1000) return num.toFixed(2);
  if (num >= 1) return num.toFixed(4);
  if (num >= 0.01) return num.toFixed(5);
  return num.toFixed(6);
};

type AnalysisStatus = 'idle' | 'danger' | 'warning' | 'success';

const STATUS_ICONS: Record<AnalysisStatus, React.ReactElement> = {
  idle:    <Monitor    className="w-5 h-5 text-slate-500" />,
  danger:  <AlertTriangle className="w-5 h-5 text-red-500" />,
  warning: <ShieldCheck className="w-5 h-5 text-yellow-500" />,
  success: <TrendingUp  className="w-5 h-5 text-green-500" />,
};

// --- COMPONENTES UI REUTILIZABLES ---
const SaveModal = ({ isOpen, onClose, onSave, defaultName }: { isOpen: boolean; onClose: () => void; onSave: (name: string) => void; defaultName: string }) => {
  const [name, setName] = useState(defaultName || '');

  useEffect(() => {
    if (isOpen) setName(defaultName);
  }, [isOpen, defaultName]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Save className="w-5 h-5 text-blue-400" /> Guardar Estrategia
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Nombre de la Plantilla</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: ADA Rebote Fuerte"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500"
              autoFocus
            />
          </div>
          <button
            onClick={() => { onSave(name); onClose(); }}
            disabled={!name.trim()}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 text-white font-bold py-3 rounded-lg transition-colors"
          >
            Guardar en la Nube
          </button>
        </div>
      </div>
    </div>
  );
};

const Toast = ({ message, type = 'success' }: { message: string; type?: 'success' | 'error' }) => {
  if (!message) return null;
  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-slate-800 border border-slate-700 text-white px-4 py-3 rounded-lg shadow-2xl flex items-center gap-3 animate-in slide-in-from-top-5">
      {type === 'success' ? <CheckCircle2 className="w-5 h-5 text-green-400" /> : <AlertCircle className="w-5 h-5 text-red-400" />}
      <span className="text-sm font-medium">{message}</span>
    </div>
  );
};

// --- RÉPLICAS DE ÓRDENES (definidas fuera de SellCalculator para evitar remounts) ---
interface OCOProps {
  tpLimit: number;
  slTrig: number;
  slLim: number;
  quantity: number;
  coin: string;
}

const SellReplicaOCO = ({ tpLimit, slTrig, slLim, quantity, coin }: OCOProps) => (
  <div className="bg-[#111217] p-5 rounded-xl border border-slate-800 shadow-xl font-sans max-w-sm mx-auto w-full">
    <div className="flex justify-between items-center mb-6 text-slate-300 text-sm">
      <span className="font-semibold text-white">Límite &nbsp; Mercado &nbsp; <span className="text-yellow-500">OCO ▼</span></span>
    </div>
    <div className="text-right text-xs text-slate-400 mb-2">
      Disponible <span className="text-white font-mono ml-2">{quantity} {coin} ⊕</span>
    </div>
    <div className="space-y-4">
      <div className="relative">
        <label className="absolute left-3 top-2 text-[10px] text-slate-500">Take Profit (Precio Activación)</label>
        <span className="absolute right-3 top-4 text-xs text-white">USDT</span>
        <input readOnly value={formatDec(tpLimit)} className="w-full bg-[#1e2025] border-none rounded-lg pt-6 pb-2 px-3 text-green-400 font-mono focus:outline-none" />
      </div>
      <div className="relative flex gap-2">
        <div className="relative flex-grow">
          <label className="absolute left-3 top-2 text-[10px] text-slate-500">Precio (Límite)</label>
          <input readOnly value={formatDec(tpLimit)} className="w-full bg-[#1e2025] border-none rounded-lg pt-6 pb-2 px-3 text-green-400 font-mono focus:outline-none" />
        </div>
        <div className="bg-[#1e2025] rounded-lg px-4 flex items-center justify-center min-w-[80px]"><span className="text-sm text-slate-300">Límite ▼</span></div>
      </div>
      <div className="h-px w-full bg-slate-800/50 my-2"></div>
      <div className="relative">
        <label className="absolute left-3 top-2 text-[10px] text-slate-500">Stop Loss (Precio Activación)</label>
        <span className="absolute right-3 top-4 text-xs text-white">USDT</span>
        <input readOnly value={formatDec(slTrig)} className="w-full bg-[#1e2025] border-none rounded-lg pt-6 pb-2 px-3 text-yellow-400 font-mono focus:outline-none" />
      </div>
      <div className="relative flex gap-2">
        <div className="relative flex-grow">
          <label className="absolute left-3 top-2 text-[10px] text-slate-500">Precio (Límite)</label>
          <input readOnly value={formatDec(slLim)} className="w-full bg-[#1e2025] border-none rounded-lg pt-6 pb-2 px-3 text-red-400 font-mono focus:outline-none" />
        </div>
        <div className="bg-[#1e2025] rounded-lg px-4 flex items-center justify-center min-w-[80px]"><span className="text-sm text-slate-300">Límite ▼</span></div>
      </div>
      <div className="relative mt-4">
        <label className="absolute left-3 top-2 text-[10px] text-slate-500">Cant.</label>
        <span className="absolute right-3 top-4 text-xs text-white">{coin}</span>
        <input readOnly value={quantity} className="w-full bg-[#1e2025] border-none rounded-lg pt-6 pb-2 px-3 text-white font-mono focus:outline-none" />
      </div>
      <button
        disabled
        title="Solo referencia visual — coloca la orden manualmente en el exchange"
        className="w-full bg-[#f1435f]/40 cursor-not-allowed text-white/50 font-bold py-3 rounded-lg mt-4 shadow-lg"
      >
        Vender {coin} (referencia)
      </button>
    </div>
  </div>
);

interface TrailingProps {
  secureTrigger: number;
  quantity: number;
  coin: string;
  trailingDrop: number;
  setTrailingDrop: (v: number) => void;
}

const SellReplicaLimit = ({ limitPrice, quantity, coin }: { limitPrice: number; quantity: number; coin: string }) => (
  <div className="bg-[#111217] p-5 rounded-xl border border-slate-800 shadow-xl font-sans max-w-sm mx-auto w-full">
    <div className="flex justify-between items-center mb-6 text-slate-300 text-sm">
      <span className="font-semibold text-white">Límite <span className="text-yellow-500">▼</span> &nbsp; Mercado &nbsp; OCO &nbsp; Trailing</span>
    </div>
    <div className="text-right text-xs text-slate-400 mb-2">
      Disponible <span className="text-white font-mono ml-2">{quantity} {coin} ⊕</span>
    </div>
    <div className="space-y-4">
      <div className="relative">
        <label className="absolute left-3 top-2 text-[10px] text-slate-500">Precio Límite</label>
        <span className="absolute right-3 top-4 text-xs text-white">USDT</span>
        <input readOnly value={formatDec(limitPrice)} className="w-full bg-[#1e2025] border-none rounded-lg pt-6 pb-2 px-3 text-yellow-400 font-mono focus:outline-none" />
      </div>
      <div className="relative">
        <label className="absolute left-3 top-2 text-[10px] text-slate-500">Cant.</label>
        <span className="absolute right-3 top-4 text-xs text-white">{coin}</span>
        <input readOnly value={quantity} className="w-full bg-[#1e2025] border-none rounded-lg pt-6 pb-2 px-3 text-white font-mono focus:outline-none" />
      </div>
      <button
        disabled
        title="Solo referencia visual — coloca la orden manualmente en el exchange"
        className="w-full bg-[#f1435f]/40 cursor-not-allowed text-white/50 font-bold py-3 rounded-lg mt-4 shadow-lg"
      >
        Vender {coin} (referencia)
      </button>
    </div>
  </div>
);

const SellReplicaTrailing = ({ secureTrigger, quantity, coin, trailingDrop, setTrailingDrop }: TrailingProps) => (
  <div className="bg-[#111217] p-5 rounded-xl border border-slate-800 shadow-xl font-sans max-w-sm mx-auto w-full">
    <div className="flex justify-between items-center mb-6 text-slate-300 text-sm">
      <span className="font-semibold text-white">Límite &nbsp; Mercado &nbsp; <span className="text-yellow-500">Trailing Stop ▼</span></span>
    </div>
    <div className="text-right text-xs text-slate-400 mb-2">
      Disponible <span className="text-white font-mono ml-2">{quantity} {coin} ⊕</span>
    </div>
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-grow">
          <label className="absolute left-3 top-2 text-[10px] text-slate-500">Porcentaje ▼</label>
          <span className="absolute right-3 top-4 text-xs text-slate-400">%</span>
          <input type="number" value={trailingDrop} onChange={e => setTrailingDrop(Number(e.target.value))} className="w-full bg-[#1e2025] border-none rounded-lg pt-6 pb-2 px-3 text-white font-mono focus:outline-none" />
        </div>
      </div>
      <div className="relative">
        <label className="absolute left-3 top-2 text-[10px] text-slate-500">Cant.</label>
        <span className="absolute right-3 top-4 text-xs text-slate-300">{coin} ▼</span>
        <input readOnly value={quantity} className="w-full bg-[#1e2025] border-none rounded-lg pt-6 pb-2 px-3 text-white font-mono focus:outline-none" />
      </div>
      <div className="flex items-center gap-2 mb-2 mt-4">
        <div className="w-4 h-4 bg-yellow-500 rounded flex items-center justify-center"><CheckCircle2 className="w-3 h-3 text-[#111217]" /></div>
        <span className="text-xs text-slate-300">Precio de accionamiento (Optional)</span>
      </div>
      <div className="relative mb-2">
        <span className="absolute right-3 top-3 text-xs text-slate-400">USDT</span>
        <input readOnly value={formatDec(secureTrigger)} className="w-full bg-[#1e2025] border-none rounded-lg p-3 text-blue-400 font-mono focus:outline-none" />
      </div>
      <button
        disabled
        title="Solo referencia visual — coloca la orden manualmente en el exchange"
        className="w-full bg-[#f1435f]/40 cursor-not-allowed text-white/50 font-bold py-3 rounded-lg mt-2 shadow-lg"
      >
        Vender {coin} (referencia)
      </button>
    </div>
  </div>
);

// --- RÉPLICAS DE ÓRDENES DE COMPRA (RECOMPRA) ---
interface BuyLimitProps {
  targetRebuy: number;
  usdtAmount: number;
  rebuyQty: number;
  coin: string;
  sellPrice: number;
  extraQty: number;
  maniobra_pnl: number;
  discountPct: number;
}

const BuyReplicaLimit = ({ targetRebuy, usdtAmount, rebuyQty, coin, sellPrice, extraQty, maniobra_pnl, discountPct }: BuyLimitProps) => (
  <div className="bg-[#111217] p-5 rounded-xl border border-slate-800 shadow-xl font-sans max-w-sm mx-auto w-full">
    <div className="flex justify-between items-center mb-6 text-slate-300 text-sm">
      <span className="font-semibold text-white">Límite <span className="text-green-500">▼</span> &nbsp; OCO &nbsp; Trailing</span>
    </div>
    <div className="text-right text-xs text-slate-400 mb-2">
      Disponible <span className="text-white font-mono ml-2">{formatDec(usdtAmount)} USDT ⊕</span>
    </div>
    <div className="space-y-3">
      <div className="relative">
        <label className="absolute left-3 top-2 text-[10px] text-slate-500">Vendiste a (Referencia)</label>
        <span className="absolute right-3 top-4 text-xs text-white">USDT</span>
        <input readOnly value={sellPrice > 0 ? formatDec(sellPrice) : '—'} className="w-full bg-[#1e2025] border-none rounded-lg pt-6 pb-2 px-3 text-red-400 font-mono focus:outline-none" />
      </div>
      <div className="relative">
        <label className="absolute left-3 top-2 text-[10px] text-slate-500">Precio Recompra (Límite)</label>
        <span className="absolute right-3 top-4 text-xs text-white">USDT</span>
        <input readOnly value={targetRebuy > 0 ? formatDec(targetRebuy) : '—'} className="w-full bg-[#1e2025] border-none rounded-lg pt-6 pb-2 px-3 text-green-400 font-mono focus:outline-none" />
      </div>
      <div className="relative">
        <label className="absolute left-3 top-2 text-[10px] text-slate-500">Cant. a Comprar</label>
        <span className="absolute right-3 top-4 text-xs text-white">{coin}</span>
        <input readOnly value={rebuyQty > 0 ? formatDec(rebuyQty) : '—'} className="w-full bg-[#1e2025] border-none rounded-lg pt-6 pb-2 px-3 text-white font-mono focus:outline-none" />
      </div>
    </div>
    <div className="h-px w-full bg-slate-800/50 my-3"></div>
    <div className="grid grid-cols-2 gap-2 text-xs">
      <div className="bg-slate-800/60 rounded-lg p-2 border border-slate-700/40">
        <p className="text-slate-500 uppercase tracking-wider font-bold text-[9px] mb-1">Descuento</p>
        <p className={`font-mono font-bold ${discountPct > 0 ? 'text-green-400' : 'text-red-400'}`}>
          {discountPct > 0 ? '−' : '+'}{Math.abs(discountPct).toFixed(2)}%
        </p>
      </div>
      <div className={`rounded-lg p-2 border ${extraQty >= 0 ? 'bg-green-900/20 border-green-800/40' : 'bg-red-900/20 border-red-800/40'}`}>
        <p className="text-slate-500 uppercase tracking-wider font-bold text-[9px] mb-1">{extraQty >= 0 ? 'Ganás extra' : 'Perdés'}</p>
        <p className={`font-mono font-bold ${extraQty >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {extraQty >= 0 ? '+' : ''}{formatDec(extraQty)} {coin}
        </p>
      </div>
    </div>
    <div className={`rounded-lg p-2.5 flex justify-between items-center border mt-2 ${maniobra_pnl >= 0 ? 'bg-green-900/20 border-green-800/40' : 'bg-red-900/20 border-red-800/40'}`}>
      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Maniobra</span>
      <span className={`font-mono font-bold text-sm ${maniobra_pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
        {maniobra_pnl >= 0 ? '+' : ''}{formatDec(maniobra_pnl)} USDT
      </span>
    </div>
    <button
      disabled
      title="Solo referencia visual — coloca la orden manualmente en el exchange"
      className="w-full bg-green-600/40 cursor-not-allowed text-white/50 font-bold py-3 rounded-lg mt-4 shadow-lg"
    >
      Comprar {coin} (referencia)
    </button>
  </div>
);

interface BuyOCOProps {
  targetRebuy: number;
  stopPrice: number;
  limitPrice: number;
  usdtAmount: number;
  rebuyQty: number;
  coin: string;
  sellPrice: number;
  extraQty: number;
  currentPrice: number;
}

const BuyReplicaOCO = ({ targetRebuy, stopPrice, limitPrice, usdtAmount, rebuyQty, coin, sellPrice, extraQty, currentPrice }: BuyOCOProps) => (
  <div className="bg-[#111217] p-5 rounded-xl border border-slate-800 shadow-xl font-sans max-w-sm mx-auto w-full">
    <div className="flex justify-between items-center mb-6 text-slate-300 text-sm">
      <span className="font-semibold text-white">Límite &nbsp; Mercado &nbsp; <span className="text-green-500">OCO ▼</span></span>
    </div>
    <div className="text-right text-xs text-slate-400 mb-2">
      Disponible <span className="text-white font-mono ml-2">{formatDec(usdtAmount)} USDT ⊕</span>
    </div>
    <div className="space-y-3">
      <div className="relative">
        <label className="absolute left-3 top-2 text-[10px] text-slate-500">Vendiste a (Referencia)</label>
        <span className="absolute right-3 top-4 text-xs text-white">USDT</span>
        <input readOnly value={sellPrice > 0 ? formatDec(sellPrice) : '—'} className="w-full bg-[#1e2025] border-none rounded-lg pt-6 pb-2 px-3 text-red-400 font-mono focus:outline-none" />
      </div>
      <div className="h-px w-full bg-slate-700/50 my-1"></div>
      <div className="relative">
        <label className="absolute left-3 top-2 text-[10px] text-slate-500">Precio Recompra (Límite Activación)</label>
        <span className="absolute right-3 top-4 text-xs text-white">USDT</span>
        <input readOnly value={targetRebuy > 0 ? formatDec(targetRebuy) : '—'} className="w-full bg-[#1e2025] border-none rounded-lg pt-6 pb-2 px-3 text-green-400 font-mono focus:outline-none" />
      </div>
      <div className="relative flex gap-2">
        <div className="relative flex-grow">
          <label className="absolute left-3 top-2 text-[10px] text-slate-500">Precio (Límite)</label>
          <input readOnly value={limitPrice > 0 ? formatDec(limitPrice) : '—'} className="w-full bg-[#1e2025] border-none rounded-lg pt-6 pb-2 px-3 text-green-400 font-mono focus:outline-none" />
        </div>
        <div className="bg-[#1e2025] rounded-lg px-4 flex items-center justify-center min-w-[80px]"><span className="text-sm text-slate-300">Límite ▼</span></div>
      </div>
      <div className="h-px w-full bg-slate-700/50 my-1"></div>
      <div className="relative">
        <label className="absolute left-3 top-2 text-[10px] text-slate-500">Stop Compra (Activación)</label>
        <span className="absolute right-3 top-4 text-xs text-white">USDT</span>
        <input readOnly value={stopPrice > 0 ? formatDec(stopPrice) : '—'} className="w-full bg-[#1e2025] border-none rounded-lg pt-6 pb-2 px-3 text-yellow-400 font-mono focus:outline-none" />
      </div>
      <div className="relative flex gap-2">
        <div className="relative flex-grow">
          <label className="absolute left-3 top-2 text-[10px] text-slate-500">Precio (Stop)</label>
          <input readOnly value={limitPrice > 0 ? formatDec(limitPrice) : '—'} className="w-full bg-[#1e2025] border-none rounded-lg pt-6 pb-2 px-3 text-yellow-400 font-mono focus:outline-none" />
        </div>
        <div className="bg-[#1e2025] rounded-lg px-4 flex items-center justify-center min-w-[80px]"><span className="text-sm text-slate-300">Stop ▼</span></div>
      </div>
      <div className="relative">
        <label className="absolute left-3 top-2 text-[10px] text-slate-500">Cant.</label>
        <span className="absolute right-3 top-4 text-xs text-white">{coin}</span>
        <input readOnly value={rebuyQty > 0 ? formatDec(rebuyQty) : '—'} className="w-full bg-[#1e2025] border-none rounded-lg pt-6 pb-2 px-3 text-white font-mono focus:outline-none" />
      </div>
    </div>
    <div className="h-px w-full bg-slate-800/50 my-3"></div>
    <div className={`rounded-lg p-2.5 flex justify-between items-center border ${extraQty >= 0 ? 'bg-green-900/20 border-green-800/40' : 'bg-red-900/20 border-red-800/40'}`}>
      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">{extraQty >= 0 ? 'Ganás extra' : 'Perdés'}</span>
      <span className={`font-mono font-bold text-sm ${extraQty >= 0 ? 'text-green-400' : 'text-red-400'}`}>
        {extraQty >= 0 ? '+' : ''}{formatDec(extraQty)} {coin}
      </span>
    </div>
    <button
      disabled
      title="Solo referencia visual — coloca la orden manualmente en el exchange"
      className="w-full bg-green-600/40 cursor-not-allowed text-white/50 font-bold py-3 rounded-lg mt-4 shadow-lg"
    >
      Comprar {coin} (referencia)
    </button>
  </div>
);

// --- MÓDULO PRINCIPAL: CALCULADORA DE VENTA ---
const SellCalculator = ({
  onOpenSaved,
  onSaveStrategy,
  loadedData,
  strategyCount
}: {
  onOpenSaved: () => void;
  onSaveStrategy: (name: string, data: SellStrategyData) => void;
  loadedData: SellStrategy | null;
  strategyCount: number;
}) => {
  const { prices } = usePrices();
  const [coin, setCoin] = useState('DOGE');
  const [quantity, setQuantity] = useState(55167.7);
  const [entryPrice, setEntryPrice] = useState(0.0915);
  const [tpPercent, setTpPercent] = useState(6);
  const [securePercent, setSecurePercent] = useState(1);
  const [slPercent, setSlPercent] = useState(1);
  const [trailingDrop, setTrailingDrop] = useState(1);
  const [activeTab, setActiveTab] = useState<'limit' | 'oco' | 'trailing'>('oco');
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);

  const currentPrice = prices[coin] || 0;

  useEffect(() => {
    if (loadedData && loadedData.type === 'sell') {
      setCoin(loadedData.data.coin || 'DOGE');
      setQuantity(loadedData.data.quantity || 55167.7);
      setEntryPrice(loadedData.data.entryPrice || 0.0915);
      setTpPercent(loadedData.data.tpPercent || 6);
      setSecurePercent(loadedData.data.securePercent || 1);
      setSlPercent(loadedData.data.slPercent || 1);
      setTrailingDrop(1);
    }
  }, [loadedData]);

  const currentStatus = entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0;

  const tpLimit = entryPrice * (1 + tpPercent / 100);
  const secureLimit = entryPrice * (1 + securePercent / 100);
  const secureTrigger = secureLimit * 1.001;
  // Break-even must cover round-trip fees (~0.1% buy + 0.1% sell = 0.2%)
  const breakEvenLimit = entryPrice * 1.002;
  const breakEvenTrigger = breakEvenLimit * 1.001;
  const slTrigger = entryPrice * (1 - slPercent / 100);
  const slLimit = slTrigger * 0.999;

  const analysis = useMemo(() => {
    if (currentPrice === 0) {
      return {
        status: 'idle' as AnalysisStatus, title: 'Esperando Precio...', color: 'text-slate-400', bgColor: 'bg-slate-800/50 border-slate-700',
        bestTool: 'oco' as const, ocoConfig: { slTrig: slTrigger, slLim: slLimit },
        recommendation: 'Cargando datos de mercado para analizar tu posición...'
      };
    }
    if (currentPrice < entryPrice) {
      return {
        status: 'danger' as AnalysisStatus, title: 'Posición en Negativo', color: 'text-red-400', bgColor: 'bg-red-900/20 border-red-800',
        bestTool: 'oco' as const, ocoConfig: { slTrig: slTrigger, slLim: slLimit },
        recommendation: `El precio está cayendo (${currentStatus.toFixed(2)}%). Usa OCO para mantener tu meta arriba, pero con un Stop Loss estricto abajo para cortar pérdidas.`
      };
    } else if (currentPrice >= entryPrice && currentPrice < secureTrigger) {
      return {
        status: 'warning' as AnalysisStatus, title: 'Ganancia Leve (Fase 1)', color: 'text-yellow-400', bgColor: 'bg-yellow-900/20 border-yellow-800',
        bestTool: 'oco' as const, ocoConfig: { slTrig: breakEvenTrigger, slLim: breakEvenLimit },
        recommendation: `Estás en ganancias leves. Usa OCO para buscar el ${tpPercent}% de ganancia y colocar una red de seguridad en tu precio de entrada (Break-even).`
      };
    } else {
      return {
        status: 'success' as AnalysisStatus, title: '¡Ganancia Asegurable! (Fase 2)', color: 'text-green-400', bgColor: 'bg-green-900/20 border-green-800',
        bestTool: 'trailing' as const, ocoConfig: { slTrig: secureTrigger, slLim: secureLimit },
        recommendation: `¡Ya superaste los ${securePercent}%! El precio es ideal para usar Trailing Stop, o actualizar tu OCO asegurando la ganancia mínima.`
      };
    }
  }, [currentPrice, entryPrice, currentStatus, secureTrigger, secureLimit, slTrigger, slLimit, breakEvenTrigger, breakEvenLimit, tpPercent, securePercent]);

  // Only auto-set tab on initial load or when user changes coin/entry, not on every price tick
  const hasAutoSetTab = useRef(false);
  useEffect(() => {
    if (!hasAutoSetTab.current && analysis.status !== 'idle') {
      setActiveTab(analysis.bestTool);
      hasAutoSetTab.current = true;
    }
  }, [analysis.status, analysis.bestTool]);

  // Reset auto-tab when user changes coin or entry price
  useEffect(() => {
    hasAutoSetTab.current = false;
  }, [coin, entryPrice]);

  const handleSave = (name: string) => {
    onSaveStrategy(name, { coin, quantity, entryPrice, tpPercent, securePercent, slPercent });
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6 max-w-6xl mx-auto">
      <SaveModal isOpen={isSaveModalOpen} onClose={() => setIsSaveModalOpen(false)} onSave={handleSave} defaultName={`${coin} Protección Venta`} />

      <div className="flex items-center justify-between border-b border-red-900/50 pb-4">
        <div className="flex items-center gap-4">
          <div className="p-2 md:p-3 bg-red-600/20 rounded-lg hidden sm:block">
            <Calculator className="w-6 h-6 md:w-8 md:h-8 text-red-500" />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-lg md:text-2xl font-bold text-white flex items-center gap-2">
              Suite de VENTA <span className="text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded-full border border-red-500/30 hidden md:block">Mercado Spot</span>
            </h1>
            <p className="text-slate-400 text-xs md:text-sm">Asegurando ganancias y evitando pérdidas</p>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          <button onClick={onOpenSaved} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-blue-400 px-3 py-2 rounded-lg text-sm font-medium transition-colors border border-slate-700 hover:border-blue-500 shadow-md">
            <FolderOpen className="w-4 h-4" />
            <span className="hidden sm:inline">Plantillas</span>
            {strategyCount > 0 && <span className="bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">{strategyCount}</span>}
          </button>
          <button onClick={() => setIsSaveModalOpen(true)} className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors shadow-md active:scale-95">
            <Save className="w-4 h-4" /> <span className="hidden sm:inline">Guardar</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 md:p-5 shadow-lg border-t-4 border-t-red-500 transition-all hover:shadow-red-500/5">
            <h2 className="text-sm md:text-lg font-semibold flex items-center space-x-2 text-white mb-4">
              <Settings className="w-4 h-4 md:w-5 md:h-5 text-red-400" />
              <span>Datos de Venta</span>
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Moneda</label>
                  <select
                    value={coin}
                    onChange={(e) => setCoin(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-md p-2 text-white text-sm font-bold focus:border-red-500 focus:outline-none transition-colors"
                  >
                    {AVAILABLE_COINS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Cant. Comprada</label>
                  <input type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-800 rounded-md p-2 text-white text-sm focus:border-red-500 focus:outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Precio Compra ($)</label>
                  <input type="number" step="0.00001" value={entryPrice} onChange={(e) => setEntryPrice(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-800 rounded-md p-2 text-white text-sm focus:border-red-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-blue-400 font-bold mb-1">Precio Actual ($)</label>
                  <div className={`w-full bg-slate-950 border-2 rounded-md p-2 font-mono text-sm flex items-center justify-between ${currentPrice >= entryPrice ? 'text-green-400 border-green-900/50' : 'text-red-400 border-red-900/50'}`}>
                    <span>{formatDec(currentPrice)}</span>
                    <TrendingUp className={`w-3 h-3 ${currentPrice >= entryPrice ? 'rotate-0' : 'rotate-180'}`} />
                  </div>
                </div>
              </div>
              <div className="pt-4 border-t border-slate-800">
                <h3 className="text-[10px] md:text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Metas (%)</h3>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Take Profit</label>
                    <input type="number" value={tpPercent} onChange={(e) => setTpPercent(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-800 rounded-md p-1.5 text-center text-green-400 text-sm font-bold focus:outline-none border-b-2 border-b-green-900/50" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Asegurar</label>
                    <input type="number" value={securePercent} onChange={(e) => setSecurePercent(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-800 rounded-md p-1.5 text-center text-blue-400 text-sm font-bold focus:outline-none border-b-2 border-b-blue-900/50" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Stop Loss</label>
                    <input type="number" value={slPercent} onChange={(e) => setSlPercent(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-800 rounded-md p-1.5 text-center text-red-400 text-sm font-bold focus:outline-none border-b-2 border-b-red-900/50" />
                  </div>
                </div>
              </div>
              <div className={`mt-4 p-4 rounded-xl border ${analysis.bgColor} transition-all duration-300 shadow-inner`}>
                <div className="flex items-center gap-2 mb-2">
                  {STATUS_ICONS[analysis.status]}
                  <h3 className={`font-bold text-sm ${analysis.color}`}>{analysis.title}</h3>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed italic">{analysis.recommendation}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-4 md:p-5 shadow-lg relative">
          <div className="flex items-center justify-between mb-4 md:mb-6">
            <h2 className="text-sm md:text-lg font-semibold flex items-center space-x-2 text-white">
              <ShieldCheck className="w-4 h-4 md:w-5 md:h-5 text-blue-400" />
              <span>Orden de Venta</span>
            </h2>
          </div>
          <div className="flex border-b border-slate-800 mb-6 overflow-x-auto no-scrollbar">
            <button onClick={() => setActiveTab('limit')} className={`whitespace-nowrap pb-3 px-4 text-xs md:text-sm font-medium transition-all border-b-2 flex items-center gap-2 ${activeTab === 'limit' ? 'border-yellow-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
              Límite
            </button>
            <button onClick={() => setActiveTab('oco')} className={`whitespace-nowrap pb-3 px-4 text-xs md:text-sm font-medium transition-all border-b-2 flex items-center gap-2 ${activeTab === 'oco' ? 'border-blue-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
              OCO {analysis.bestTool === 'oco' && <span className="flex w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>}
            </button>
            <button onClick={() => setActiveTab('trailing')} className={`whitespace-nowrap pb-3 px-4 text-xs md:text-sm font-medium transition-all border-b-2 flex items-center gap-2 ${activeTab === 'trailing' ? 'border-green-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
              Trailing Stop {analysis.bestTool === 'trailing' && <span className="flex w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>}
            </button>
          </div>
          <div className="flex justify-center transition-all duration-500">
            {activeTab === 'limit'
              ? <SellReplicaLimit limitPrice={tpLimit} quantity={quantity} coin={coin} />
              : activeTab === 'oco'
              ? <SellReplicaOCO tpLimit={tpLimit} slTrig={analysis.ocoConfig.slTrig} slLim={analysis.ocoConfig.slLim} quantity={quantity} coin={coin} />
              : <SellReplicaTrailing secureTrigger={secureTrigger} quantity={quantity} coin={coin} trailingDrop={trailingDrop} setTrailingDrop={setTrailingDrop} />
            }
          </div>
        </div>
      </div>
    </div>
  );
};

// --- MÓDULO: GESTOR DE ESTRATEGIAS (CLOUD) ---
const SavedStrategiesView = ({
  strategies,
  onBack,
  onLoad,
  onDelete
}: {
  strategies: SellStrategy[];
  onBack: () => void;
  onLoad: (s: SellStrategy) => void;
  onDelete: (id: string) => void;
}) => {
  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 p-4 md:p-8">
      <div className="flex items-center gap-4 border-b border-slate-800 pb-4">
        <button onClick={onBack} className="p-2 md:p-3 bg-slate-800 rounded-xl text-slate-400 hover:text-white hover:bg-slate-700 transition-colors shadow-md">
          <ArrowLeft className="w-5 h-5 md:w-6 md:h-6" />
        </button>
        <div className="p-2 md:p-3 bg-blue-600/20 rounded-lg">
          <FolderOpen className="w-6 h-6 md:w-8 md:h-8 text-blue-500" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white uppercase tracking-tight">Estrategias <span className="text-blue-500">Cloud</span></h1>
          <p className="text-slate-400 text-xs md:text-sm">Tus plantillas guardadas para acceso rápido.</p>
        </div>
      </div>

      {strategies.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center flex flex-col items-center shadow-inner">
          <FolderOpen className="w-16 h-16 text-slate-600 mb-4 opacity-50" />
          <h3 className="text-lg font-bold text-slate-300 mb-2">Ninguna estrategia guardada</h3>
          <p className="text-sm text-slate-500 max-w-sm mx-auto">Ve a la calculadora y haz clic en el botón "Guardar" para sincronizar aquí tus configuraciones de venta.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {strategies.map((strat) => (
            <div key={strat.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-500 transition-all flex flex-col shadow-lg group">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase bg-red-900/50 text-red-400 border border-red-500/20">
                      Venta
                    </span>
                    <span className="text-white font-bold group-hover:text-blue-400 transition-colors">{strat.name}</span>
                  </div>
                  <span className="text-xs text-slate-500 font-mono">Moneda: {strat.data.coin} | TP: {strat.data.tpPercent}%</span>
                </div>
                <DeleteButton onDelete={() => onDelete(strat.id)} />
              </div>
              <div className="mt-auto pt-4 flex gap-2">
                <button onClick={() => onLoad(strat)} className="flex-1 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/30 py-2 rounded-lg text-sm font-semibold transition-all flex justify-center items-center gap-2 active:scale-95">
                  <FolderOpen className="w-4 h-4" /> Cargar Plantilla
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// --- MÓDULO: CALCULADORA DE RECOMPRA ---
const BuyCalculator = ({
  loadedCoin,
  loadedUsdt,
  loadedSellPrice,
}: {
  loadedCoin?: string;
  loadedUsdt?: number;
  loadedSellPrice?: number;
}) => {
  const { prices } = usePrices();
  const [coin, setCoin] = useState(loadedCoin || 'BTC');
  const [usdtAmount, setUsdtAmount] = useState(loadedUsdt || 1000);
  const [sellPrice, setSellPrice] = useState(loadedSellPrice || 0);
  const [rebuyPrice, setRebuyPrice] = useState(0);
  const [discountPct, setDiscountPct] = useState(0);
  const [rebuyPriceStr, setRebuyPriceStr] = useState('');
  const [discountPctStr, setDiscountPctStr] = useState('');
  const [activeBuyTab, setActiveBuyTab] = useState<'limit' | 'oco'>('limit');
  const [buyStopPct, setBuyStopPct] = useState(5); // % above rebuy target to trigger stop

  useEffect(() => { if (loadedCoin) setCoin(loadedCoin); }, [loadedCoin]);
  useEffect(() => { if (loadedUsdt) setUsdtAmount(loadedUsdt); }, [loadedUsdt]);
  useEffect(() => { if (loadedSellPrice) setSellPrice(loadedSellPrice); }, [loadedSellPrice]);

  const handleRebuyPriceChange = (raw: string) => {
    setRebuyPriceStr(raw);
    const val = parseFloat(raw);
    if (!isNaN(val)) {
      setRebuyPrice(val);
      if (sellPrice > 0 && val > 0) {
        const pct = ((sellPrice - val) / sellPrice) * 100;
        setDiscountPct(pct);
        setDiscountPctStr(pct.toFixed(4));
      } else {
        setDiscountPct(0);
        setDiscountPctStr('');
      }
    } else {
      setRebuyPrice(0);
      setDiscountPct(0);
      setDiscountPctStr('');
    }
  };

  const handleDiscountPctChange = (raw: string) => {
    setDiscountPctStr(raw);
    const val = parseFloat(raw);
    if (!isNaN(val)) {
      setDiscountPct(val);
      if (sellPrice > 0) {
        const price = sellPrice * (1 - val / 100);
        setRebuyPrice(price);
        setRebuyPriceStr(price.toFixed(5));
      }
    } else {
      setDiscountPct(0);
    }
  };

  const currentPrice = prices[coin] || 0;
  // Si no ingresó precio de recompra, usa el precio actual como referencia
  const targetRebuy = rebuyPrice > 0 ? rebuyPrice : currentPrice;

  // Posición original: cuántas unidades tenías antes de vender
  const originalQty = sellPrice > 0 ? usdtAmount / sellPrice : 0;
  // Recompra: cuántas unidades obtenés con el mismo USDT al precio objetivo
  const rebuyQty = targetRebuy > 0 ? usdtAmount / targetRebuy : 0;
  // Unidades extra ganadas por la maniobra (positivo = ganaste unidades)
  const extraQty = rebuyQty - originalQty;
  // Valor en USDT de las unidades extra al precio de recompra
  const maniobra_pnl = extraQty * targetRebuy;
  // % vs precio actual
  const vsCurrent = currentPrice > 0 ? ((currentPrice - targetRebuy) / currentPrice) * 100 : 0;

  const isProfit = discountPct > 0;
  const isBreakeven = Math.abs(discountPct) < 0.01;

  const analysisStatus: AnalysisStatus = currentPrice === 0 ? 'idle'
    : isBreakeven ? 'warning'
    : isProfit ? (discountPct >= 3 ? 'success' : 'warning')
    : 'danger';

  const analysisTitle = {
    idle: 'Esperando precio...',
    success: `¡Maniobra rentable! −${discountPct.toFixed(2)}% vs tu venta`,
    warning: isBreakeven ? 'Break-even — sin ganancia ni pérdida' : `Maniobra leve — ${discountPct.toFixed(2)}% vs tu venta`,
    danger: `Recomprás más caro que tu precio de venta (+${Math.abs(discountPct).toFixed(2)}%)`,
  }[analysisStatus];

  const analysisText = {
    idle: 'Cargando precio de mercado...',
    success: `Si recomprás ${coin} a ${formatDec(targetRebuy)}, obtenés ${formatDec(rebuyQty)} unidades en lugar de ${formatDec(originalQty)}. Ganás ${formatDec(extraQty)} ${coin} extra (≈ +${formatDec(maniobra_pnl)} USDT).`,
    warning: isBreakeven
      ? `Recomprás exactamente al mismo precio que vendiste. Obtenés las mismas unidades (${formatDec(originalQty)} ${coin}), sin ganancia ni pérdida.`
      : `Recomprás a un ${discountPct.toFixed(2)}% por debajo de tu venta. Obtenés ${formatDec(extraQty)} ${coin} extra (≈ +${formatDec(maniobra_pnl)} USDT).`,
    danger: `Recomprás ${Math.abs(discountPct).toFixed(2)}% más caro que tu precio de venta. Obtenés ${formatDec(rebuyQty)} unidades, perdés ${formatDec(Math.abs(extraQty))} ${coin} (≈ ${formatDec(maniobra_pnl)} USDT).`,
  }[analysisStatus];

  const bgColor = { idle: 'bg-slate-800/50 border-slate-700', success: 'bg-green-900/20 border-green-800', warning: 'bg-yellow-900/20 border-yellow-800', danger: 'bg-red-900/20 border-red-800' }[analysisStatus];
  const textColor = { idle: 'text-slate-400', success: 'text-green-400', warning: 'text-yellow-400', danger: 'text-red-400' }[analysisStatus];

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between border-b border-green-900/50 pb-4">
        <div className="flex items-center gap-4">
          <div className="p-2 md:p-3 bg-green-600/20 rounded-lg hidden sm:block">
            <ShoppingCart className="w-6 h-6 md:w-8 md:h-8 text-green-500" />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-lg md:text-2xl font-bold text-white flex items-center gap-2">
              Evaluar Recompra <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded-full border border-green-500/30 hidden md:block">Mercado Spot</span>
            </h1>
            <p className="text-slate-400 text-xs md:text-sm">¿Cuánto ganás si recomprás más barato de lo que vendiste?</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
        {/* Panel izquierdo — inputs */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 md:p-5 shadow-lg border-t-4 border-t-green-500">
            <h2 className="text-sm md:text-lg font-semibold flex items-center space-x-2 text-white mb-4">
              <Settings className="w-4 h-4 md:w-5 md:h-5 text-green-400" />
              <span>Datos de la Operación</span>
            </h2>
            <div className="space-y-4">
              {/* Moneda + USDT */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Moneda</label>
                  <select value={coin} onChange={(e) => setCoin(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-md p-2 text-white text-sm font-bold focus:border-green-500 focus:outline-none transition-colors">
                    {AVAILABLE_COINS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">USDT Disponibles</label>
                  <input type="number" value={usdtAmount} onChange={(e) => setUsdtAmount(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-800 rounded-md p-2 text-white text-sm focus:border-green-500 focus:outline-none" />
                </div>
              </div>
              {/* Precio de venta (referencia) + precio actual */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-red-400 font-bold mb-1">Precio de Venta ($)</label>
                  <input type="number" step="0.00001" value={sellPrice || ''} onChange={(e) => setSellPrice(Number(e.target.value))} placeholder="Tu precio de venta" className="w-full bg-slate-950 border border-red-900/50 rounded-md p-2 text-red-300 text-sm font-mono focus:border-red-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-blue-400 font-bold mb-1">Precio Actual ($)</label>
                  <div className="w-full bg-slate-950 border-2 border-slate-700 rounded-md p-2 font-mono text-sm text-blue-400 flex items-center justify-between">
                    <span>{currentPrice > 0 ? formatDec(currentPrice) : '—'}</span>
                    <TrendingDown className="w-3 h-3" />
                  </div>
                </div>
              </div>
              {/* Precio objetivo de recompra + % descuento */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-green-400 font-bold mb-1">Precio Objetivo ($)</label>
                  <input
                    type="number"
                    step="0.00001"
                    placeholder={currentPrice > 0 ? formatDec(currentPrice) : '0.00'}
                    value={rebuyPriceStr}
                    onChange={(e) => handleRebuyPriceChange(e.target.value)}
                    className="w-full bg-slate-950 border border-green-900/50 rounded-md p-2 text-white text-sm focus:border-green-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-green-400 font-bold mb-1">% Descuento vs Venta</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={discountPctStr}
                    onChange={(e) => handleDiscountPctChange(e.target.value)}
                    className="w-full bg-slate-950 border border-green-900/50 rounded-md p-2 text-white text-sm focus:border-green-500 focus:outline-none"
                  />
                  <span className="absolute right-3 text-xs text-slate-400">%</span>
                </div>
              </div>
              {sellPrice > 0 && (
                <p className="text-[10px] text-slate-500">
                  Break-even: <span className="text-slate-300 font-mono">{formatDec(sellPrice)}</span> — ingresá % positivo para comprar más barato
                </p>
              )}
              {/* Análisis */}
              <div className={`p-4 rounded-xl border ${bgColor} transition-all duration-300 shadow-inner`}>
                <div className="flex items-center gap-2 mb-2">
                  {STATUS_ICONS[analysisStatus]}
                  <h3 className={`font-bold text-sm ${textColor}`}>{analysisTitle}</h3>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed italic">{analysisText}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Panel derecho — orden de recompra con tabs */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-4 md:p-5 shadow-lg">
          <div className="flex items-center justify-between mb-4 md:mb-6">
            <h2 className="text-sm md:text-lg font-semibold flex items-center space-x-2 text-white">
              <ShieldCheck className="w-4 h-4 md:w-5 md:h-5 text-green-400" />
              <span>Orden de Compra</span>
            </h2>
          </div>
          <div className="flex border-b border-slate-800 mb-6 overflow-x-auto no-scrollbar">
            <button onClick={() => setActiveBuyTab('limit')} className={`whitespace-nowrap pb-3 px-4 text-xs md:text-sm font-medium transition-all border-b-2 flex items-center gap-2 ${activeBuyTab === 'limit' ? 'border-green-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
              Límite
            </button>
            <button onClick={() => setActiveBuyTab('oco')} className={`whitespace-nowrap pb-3 px-4 text-xs md:text-sm font-medium transition-all border-b-2 flex items-center gap-2 ${activeBuyTab === 'oco' ? 'border-blue-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
              OCO
            </button>
            <button disabled className="whitespace-nowrap pb-3 px-4 text-xs md:text-sm font-medium border-b-2 border-transparent text-slate-700 cursor-not-allowed flex items-center gap-2" title="No disponible para recompras">
              Trailing Stop
            </button>
          </div>
          <div className="space-y-3">
            {activeBuyTab === 'limit' && (
              <BuyReplicaLimit
                targetRebuy={targetRebuy}
                usdtAmount={usdtAmount}
                rebuyQty={rebuyQty}
                coin={coin}
                sellPrice={sellPrice}
                extraQty={extraQty}
                maniobra_pnl={maniobra_pnl}
                discountPct={discountPct}
              />
            )}
            {activeBuyTab === 'oco' && (
              <>
                <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/40 mb-3">
                  <label className="block text-[10px] text-slate-400 mb-1">Stop de Compra (% por encima del límite)</label>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setBuyStopPct(Math.max(0.5, buyStopPct - 0.5))} className="w-8 h-8 bg-slate-700 rounded flex items-center justify-center text-white font-bold">−</button>
                    <input type="number" value={buyStopPct} onChange={e => setBuyStopPct(Number(e.target.value))} className="w-20 bg-slate-950 border border-slate-700 rounded p-1.5 text-center text-white text-sm font-mono" />
                    <button onClick={() => setBuyStopPct(buyStopPct + 0.5)} className="w-8 h-8 bg-slate-700 rounded flex items-center justify-center text-white font-bold">+</button>
                    <span className="text-xs text-slate-400">%</span>
                  </div>
                </div>
                <BuyReplicaOCO
                  targetRebuy={targetRebuy}
                  stopPrice={targetRebuy > 0 ? targetRebuy * (1 + buyStopPct / 100) : 0}
                  limitPrice={targetRebuy}
                  usdtAmount={usdtAmount}
                  rebuyQty={rebuyQty}
                  coin={coin}
                  sellPrice={sellPrice}
                  extraQty={extraQty}
                  currentPrice={currentPrice}
                />
              </>
            )}
          </div>
          {currentPrice > 0 && targetRebuy > 0 && targetRebuy !== currentPrice && (
            <div className="bg-slate-800/60 rounded-lg p-3 flex justify-between items-center border border-slate-700/40 mt-4">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Objetivo vs precio actual</span>
              <span className={`font-mono font-bold text-sm ${vsCurrent > 0 ? 'text-green-400' : 'text-yellow-400'}`}>
                {vsCurrent > 0 ? '−' : '+'}{Math.abs(vsCurrent).toFixed(2)}% {vsCurrent > 0 ? 'por debajo' : 'por encima'}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// --- EXPORTE GLOBAL ---
export default function SellSuite({ preload, buyPreload }: { preload?: ProcessedInvestment | null; buyPreload?: BuyPreload | null }) {
  const [mode, setMode] = useState<'sell' | 'buy'>('sell');
  const [view, setView] = useState<'sell' | 'saved'>('sell');
  const [loadedData, setLoadedData] = useState<SellStrategy | null>(null);
  const [toastMessage, setToastMessage] = useState('');
  const { strategies, addStrategy, removeStrategy } = useSellStrategies();

  useEffect(() => {
    if (preload) {
      setLoadedData({
        id: '',
        name: `${preload.coin} desde Spot`,
        type: 'sell',
        data: {
          coin: preload.coin,
          quantity: preload.quantity,
          entryPrice: preload.buyPrice,
          tpPercent: 6,
          securePercent: 1,
          slPercent: 1,
        },
        createdAt: '',
      });
      setMode('sell');
      setView('sell');
    }
  }, [preload]);

  useEffect(() => {
    if (buyPreload) {
      setMode('buy');
      setView('sell');
    }
  }, [buyPreload]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const handleSaveStrategy = async (name: string, data: SellStrategyData) => {
    const success = await addStrategy(name, data);
    if (success) showToast('¡Estrategia guardada en la Nube!');
  };

  const handleDeleteStrategy = async (id: string) => {
    const success = await removeStrategy(id);
    if (success) showToast('Estrategia eliminada');
  };

  const handleLoadStrategy = (strat: SellStrategy) => {
    setLoadedData(strat);
    setView('sell');
    showToast(`Plantilla '${strat.name}' cargada`);
  };

  if (view === 'saved') return (
    <div className="animate-fadeIn">
      <SavedStrategiesView strategies={strategies} onBack={() => setView('sell')} onLoad={handleLoadStrategy} onDelete={handleDeleteStrategy} />
      <Toast message={toastMessage} />
    </div>
  );

  return (
    <div className="animate-fadeIn space-y-4">
      {/* Toggle Compra / Venta */}
      <div className="flex justify-center">
        <div className="flex bg-slate-800 border border-slate-700 rounded-xl p-1 gap-1">
          <button
            onClick={() => setMode('buy')}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all ${mode === 'buy' ? 'bg-green-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
          >
            <ShoppingCart className="w-4 h-4" /> Evaluar Compra
          </button>
          <button
            onClick={() => setMode('sell')}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all ${mode === 'sell' ? 'bg-red-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
          >
            <TrendingDown className="w-4 h-4" /> Evaluar Venta
          </button>
        </div>
      </div>

      {mode === 'buy' ? (
        <BuyCalculator
          loadedCoin={buyPreload?.coin}
          loadedUsdt={buyPreload?.usdtAmount}
          loadedSellPrice={buyPreload?.sellPrice}
        />
      ) : (
        <SellCalculator
          onOpenSaved={() => setView('saved')}
          onSaveStrategy={handleSaveStrategy}
          loadedData={loadedData}
          strategyCount={strategies.length}
        />
      )}
      <Toast message={toastMessage} />
    </div>
  );
}
