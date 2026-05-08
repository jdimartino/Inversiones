import React, { useState } from 'react';
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus, CheckCircle2 } from 'lucide-react';
import { getCoinStyle } from '../lib/constants';
import { fmtPrice } from '../lib/format';
import type { CoinSignal } from '../lib/types/signals';
import { SIGNAL_LABELS, SIGNAL_COLORS } from '../lib/types/signals';
import SignalBadge from './SignalBadge';

interface SignalCardProps {
  signal: CoinSignal;
}

function getRSIColor(rsi: number): string {
  if (rsi < 30) return 'text-green-400';
  if (rsi > 70) return 'text-red-400';
  return 'text-slate-300';
}

function getRSIBarColor(rsi: number): string {
  if (rsi < 30) return 'bg-green-500';
  if (rsi > 70) return 'bg-red-500';
  return 'bg-slate-400';
}

function getVolumeColor(ratio: number, price: number, sma20: number): string {
  if (ratio < 0.5) return 'text-slate-500';
  if (ratio < 1.5) return 'text-slate-400';
  return price >= sma20 ? 'text-green-400' : 'text-red-400';
}

function getVolumeBadge(ratio: number): { label: string; cls: string } {
  if (ratio >= 2.0) return { label: 'Muy alto', cls: 'bg-yellow-500/20 text-yellow-400' };
  if (ratio >= 1.5) return { label: 'Elevado', cls: 'bg-blue-500/20 text-blue-400' };
  if (ratio < 0.5) return { label: 'Bajo', cls: 'bg-slate-700/50 text-slate-500' };
  return { label: 'Normal', cls: 'bg-slate-700/30 text-slate-500' };
}

function getConfidenceBarColor(pct: number): string {
  if (pct >= 75) return '#22c55e';
  if (pct >= 50) return '#3b82f6';
  return '#f59e0b';
}

const ReasonIcon: React.FC<{ signal: 'bullish' | 'bearish' | 'neutral' }> = ({ signal }) => {
  if (signal === 'bullish') return <TrendingUp className="w-3 h-3 text-green-400 flex-shrink-0" />;
  if (signal === 'bearish') return <TrendingDown className="w-3 h-3 text-red-400 flex-shrink-0" />;
  return <Minus className="w-3 h-3 text-slate-500 flex-shrink-0" />;
};

const SignalCard: React.FC<SignalCardProps> = ({ signal }) => {
  const [expanded, setExpanded] = useState(false);
  const { coin, indicators, confidence, reasons } = signal;
  const volBadge = getVolumeBadge(indicators.volumeRatio);

  return (
    <div className={`rounded-xl p-3 md:p-4 transition-colors border ${
      signal.inPortfolio
        ? 'border-yellow-500/40 bg-slate-800/90'
        : 'border-slate-700/60 bg-slate-800/80'
    }`}>

      {/* Doble confirmación banner */}
      {signal.timeframeAgree && (
        <div className="mb-3 bg-blue-500/10 border border-blue-500/30 rounded-lg px-2.5 py-1.5 flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
          <span className="text-[10px] font-bold text-blue-400">DOBLE CONFIRMACIÓN 1H + DIARIO</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-3 gap-2">
        <div className="flex items-center gap-2 flex-wrap">
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
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <div className="flex items-center gap-1">
            <span className="text-[8px] text-slate-600 font-bold">1H</span>
            <SignalBadge signal={signal.signal} />
          </div>
          {signal.dailySignal && (
            <div className="flex items-center gap-1">
              <span className="text-[8px] text-slate-600 font-bold">1D</span>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${SIGNAL_COLORS[signal.dailySignal]}`}>
                {SIGNAL_LABELS[signal.dailySignal]}
              </span>
            </div>
          )}
        </div>
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
              style={{ width: `${Math.min(Math.max(indicators.rsi14, 0), 100)}%` }}
            />
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
            {indicators.macdHistogram !== indicators.macdPrevHistogram &&
              ((indicators.macdPrevHistogram < 0 && indicators.macdHistogram > 0) ||
               (indicators.macdPrevHistogram > 0 && indicators.macdHistogram < 0)) && (
              <span className="ml-1 text-yellow-400 text-[8px] font-bold">CRUCE</span>
            )}
            <span className="text-slate-600 ml-1">
              ({indicators.macdHistogram >= 0 ? 'Alcista' : 'Bajista'})
            </span>
          </span>
        </div>

        {/* Volume */}
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-slate-500 font-bold uppercase">Volumen</span>
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] font-bold ${getVolumeColor(indicators.volumeRatio, indicators.currentPrice, indicators.sma20)}`}>
              {indicators.volumeRatio.toFixed(1)}x
            </span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${volBadge.cls}`}>
              {volBadge.label}
            </span>
          </div>
        </div>

      </div>

      {/* Agreement bar */}
      <div className="mb-3">
        <div className="flex justify-between text-[10px] mb-1">
          <span className="text-slate-500">Indicadores</span>
          <span className="text-slate-300 font-bold">
            {signal.agreementCount}/{signal.totalIndicators} de acuerdo ({confidence}%)
          </span>
        </div>
        <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${confidence}%`, background: getConfidenceBarColor(confidence) }}
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
