import React, { useMemo } from 'react';
import { Briefcase, Compass } from 'lucide-react';
import { Zap, RefreshCw, AlertTriangle } from 'lucide-react';
import { useCryptoNews } from '../hooks/useCryptoNews';
import MarketSentiment from './MarketSentiment';
import SignalCard from './SignalCard';
import CryptoNews from './CryptoNews';
import type { CoinSignal, FearGreedData } from '../lib/types/signals';

interface SignalsTabProps {
  portfolioCoins: string[];
  signals: CoinSignal[];
  signalsLoading: boolean;
  signalsError: string | null;
  signalsLastUpdated: number | null;
  fearGreed: FearGreedData | null;
  fgLoading: boolean;
  onRefresh: () => void;
}

export default function SignalsTab({
  portfolioCoins,
  signals,
  signalsLoading,
  signalsError: error,
  signalsLastUpdated: lastUpdated,
  fearGreed,
  fgLoading,
  onRefresh,
}: SignalsTabProps) {
  const { news, loading: newsLoading } = useCryptoNews(8);

  // Summary counts
  const summary = useMemo(() => {
    let buys = 0, sells = 0, holds = 0;
    for (const s of signals) {
      if (s.signal === 'strong_buy' || s.signal === 'buy') buys++;
      else if (s.signal === 'strong_sell' || s.signal === 'sell') sells++;
      else holds++;
    }
    return { buys, sells, holds };
  }, [signals]);

  const handleRefresh = onRefresh;

  // Split signals into portfolio and exploration sections
  const portfolioSignals = useMemo(() => signals.filter(s => s.inPortfolio), [signals]);
  const explorationSignals = useMemo(() => signals.filter(s => !s.inPortfolio), [signals]);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
            <Zap className="w-6 h-6 text-yellow-400" />
            Señales de Trading
          </h1>
          <p className="text-slate-500 text-xs md:text-sm mt-1">
            Análisis técnico automatizado · RSI · SMA · MACD
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-[10px] text-slate-600">
              Actualizado: {new Date(lastUpdated).toLocaleTimeString('es')}
            </span>
          )}
          <button
            onClick={handleRefresh}
            disabled={signalsLoading}
            className="flex items-center gap-2 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors shadow-md active:scale-95"
          >
            <RefreshCw className={`w-4 h-4 ${signalsLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{signalsLoading ? 'Analizando...' : 'Actualizar'}</span>
          </button>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="bg-yellow-900/10 border border-yellow-800/30 rounded-lg px-3 py-2 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
        <p className="text-[10px] text-yellow-700 leading-relaxed">
          Las señales son indicadores técnicos automatizados, NO constituyen consejo financiero.
          Siempre haz tu propia investigación (DYOR) antes de operar.
        </p>
      </div>

      {/* Market Sentiment */}
      <MarketSentiment data={fearGreed} loading={fgLoading} />

      {/* Summary bar */}
      {signals.length > 0 && (
        <div className="flex items-center gap-3 bg-slate-800/50 rounded-lg px-4 py-2.5 border border-slate-700/50">
          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Resumen:</span>
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-green-400 font-bold">{summary.buys}</span>
              <span className="text-slate-500 text-xs">Compra</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-slate-500" />
              <span className="text-slate-300 font-bold">{summary.holds}</span>
              <span className="text-slate-500 text-xs">Mantener</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-red-400 font-bold">{summary.sells}</span>
              <span className="text-slate-500 text-xs">Venta</span>
            </span>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="bg-red-900/20 border border-red-800/50 rounded-lg px-4 py-3 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {signalsLoading && signals.length === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-4 animate-pulse">
              <div className="flex justify-between mb-3">
                <div className="h-6 w-16 bg-slate-700 rounded" />
                <div className="h-6 w-20 bg-slate-700 rounded-full" />
              </div>
              <div className="space-y-3">
                <div className="h-3 bg-slate-700 rounded w-full" />
                <div className="h-3 bg-slate-700 rounded w-3/4" />
                <div className="h-3 bg-slate-700 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Portfolio signals */}
      {portfolioSignals.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-yellow-400 uppercase tracking-widest flex items-center gap-2">
            <Briefcase className="w-3.5 h-3.5" /> Tu Portafolio ({portfolioSignals.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {portfolioSignals.map((s) => (
              <SignalCard key={s.coin} signal={s} />
            ))}
          </div>
        </div>
      )}

      {/* Exploration signals */}
      {explorationSignals.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <Compass className="w-3.5 h-3.5" /> Exploración ({explorationSignals.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {explorationSignals.map((s) => (
              <SignalCard key={s.coin} signal={s} />
            ))}
          </div>
        </div>
      )}

      {/* News */}
      <CryptoNews news={news} loading={newsLoading} />
    </div>
  );
}
