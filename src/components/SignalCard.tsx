import React, { useState } from 'react';
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { getCoinStyle } from '../lib/constants';
import { fmtPrice } from '../lib/format';
import type { CoinSignal } from '../lib/types/signals';
import SignalBadge from './SignalBadge';

interface SignalCardProps {
  signal: CoinSignal;
}

function getRSIColor(rsi: number): string {
  if (rsi < 30) return 'text-green-400';
  if (rsi > 70) return 'text-red-400';
  return 'text-slate-300';
}

function getRSIBarWidth(rsi: number): string {
  return `${Math.min(Math.max(rsi, 0), 100)}%`;
}

function getRSIBarColor(rsi: number): string {
  if (rsi < 30) return 'bg-green-500';
  if (rsi > 70) return 'bg-red-500';
  return 'bg-slate-400';
}

const ReasonIcon: React.FC<{ signal: 'bullish' | 'bearish' | 'neutral' }> = ({ signal }) => {
  if (signal === 'bullish') return <TrendingUp className="w-3 h-3 text-green-400 flex-shrink-0" />;
  if (signal === 'bearish') return <TrendingDown className="w-3 h-3 text-red-400 flex-shrink-0" />;
  return <Minus className="w-3 h-3 text-slate-500 flex-shrink-0" />;
};

const SignalCard: React.FC<SignalCardProps> = ({ signal }) => {
  const [expanded, setExpanded] = useState(false);
  const { coin, indicators, confidence, reasons } = signal;

  return (
    <div className={`rounded-xl p-3 md:p-4 hover:border-slate-600 transition-colors border ${
      signal.inPortfolio
        ? 'border-yellow-500/40 bg-slate-800/90'
        : 'border-slate-700/60 bg-slate-800/80'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`border px-2 py-1 rounded-lg text-[10px] font-black ${getCoinStyle(coin)}`}>
            {coin}
          </span>
          <span className="text-sm text-yellow-300 font-mono font-bold">
            {fmtPrice(indicators.currentPrice)}
          </span>
          {signal.inPortfolio && (
            <span className="text-[8px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-full font-bold">
              MI PORTAFOLIO
            </span>
          )}
        </div>
        <SignalBadge signal={signal.signal} />
      </div>

      {/* Indicators */}
      <div className="space-y-2.5 mb-3">
        {/* RSI */}
        <div>
          <div className="flex justify-between text-[10px] mb-1">
            <span className="text-slate-500 font-bold uppercase">RSI (14)</span>
            <span className={`font-bold ${getRSIColor(indicators.rsi14)}`}>
              {indicators.rsi14.toFixed(1)}
            </span>
          </div>
          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden relative">
            <div
              className={`h-full rounded-full transition-all duration-500 ${getRSIBarColor(indicators.rsi14)}`}
              style={{ width: getRSIBarWidth(indicators.rsi14) }}
            />
            {/* Overbought/oversold markers */}
            <div className="absolute top-0 bottom-0 w-px bg-green-800" style={{ left: '30%' }} />
            <div className="absolute top-0 bottom-0 w-px bg-red-800" style={{ left: '70%' }} />
          </div>
          <div className="flex justify-between text-[8px] text-slate-600 mt-0.5">
            <span>Sobreventa</span>
            <span>Sobrecompra</span>
          </div>
        </div>

        {/* SMA */}
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-slate-500 font-bold uppercase">SMA 20/50</span>
          <div className="flex items-center gap-1.5 text-[10px]">
            {indicators.currentPrice > indicators.sma20 ? (
              <span className="text-green-400 flex items-center gap-0.5">
                <TrendingUp className="w-3 h-3" /> Sobre SMA20
              </span>
            ) : (
              <span className="text-red-400 flex items-center gap-0.5">
                <TrendingDown className="w-3 h-3" /> Bajo SMA20
              </span>
            )}
            <span className="text-slate-600">·</span>
            {indicators.sma20 > indicators.sma50 ? (
              <span className="text-green-500">Alcista</span>
            ) : (
              <span className="text-red-500">Bajista</span>
            )}
          </div>
        </div>

        {/* MACD */}
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-slate-500 font-bold uppercase">MACD</span>
          <span className={`text-[10px] font-bold ${indicators.macdHistogram >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {indicators.macdHistogram >= 0 ? '+' : ''}{indicators.macdHistogram.toFixed(4)}
            <span className="text-slate-600 ml-1">
              ({indicators.macdHistogram >= 0 ? 'Alcista' : 'Bajista'})
            </span>
          </span>
        </div>
      </div>

      {/* Confidence bar */}
      <div className="mb-3">
        <div className="flex justify-between text-[10px] mb-1">
          <span className="text-slate-500">Confianza</span>
          <span className="text-slate-300 font-bold">{confidence}%</span>
        </div>
        <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-500"
            style={{ width: `${confidence}%` }}
          />
        </div>
      </div>

      {/* Expandable reasons */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-[10px] text-slate-500 hover:text-slate-300 transition-colors py-1"
      >
        <span className="uppercase font-bold tracking-wider">Razones ({reasons.length})</span>
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {expanded && (
        <div className="mt-2 space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
          {reasons.map((reason, i) => (
            <div key={i} className="flex items-start gap-2 text-[11px] bg-slate-900/50 rounded-lg p-2 border border-slate-800">
              <ReasonIcon signal={reason.signal} />
              <div>
                <span className="text-slate-400 font-bold">{reason.indicator}:</span>{' '}
                <span className="text-slate-300">{reason.detail}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SignalCard;
