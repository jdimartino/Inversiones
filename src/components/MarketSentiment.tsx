import React from 'react';
import type { FearGreedData } from '../lib/types/signals';

interface MarketSentimentProps {
  data: FearGreedData | null;
  loading: boolean;
}

const CLASSIFICATIONS: Record<string, string> = {
  'Extreme Fear': 'Miedo Extremo',
  'Fear': 'Miedo',
  'Neutral': 'Neutral',
  'Greed': 'Codicia',
  'Extreme Greed': 'Codicia Extrema',
};

function getColor(value: number): string {
  if (value <= 20) return '#ef4444';    // red
  if (value <= 40) return '#f97316';    // orange
  if (value <= 60) return '#eab308';    // yellow
  if (value <= 80) return '#84cc16';    // lime
  return '#22c55e';                     // green
}

const MarketSentiment: React.FC<MarketSentimentProps> = ({ data, loading }) => {
  if (loading || !data) {
    return (
      <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-4 animate-pulse">
        <div className="h-4 bg-slate-700 rounded w-40 mb-3" />
        <div className="h-20 bg-slate-700 rounded" />
      </div>
    );
  }

  const color = getColor(data.value);
  const label = CLASSIFICATIONS[data.classification] || data.classification;

  // Semicircle gauge via SVG
  const angle = (data.value / 100) * 180;
  const rad = (angle * Math.PI) / 180;
  const x = 100 + 70 * Math.cos(Math.PI - rad);
  const y = 90 - 70 * Math.sin(Math.PI - rad);

  return (
    <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-4">
      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
        Sentimiento del Mercado
      </h3>
      <div className="flex items-center gap-6">
        {/* Gauge */}
        <div className="relative w-[200px] h-[110px] flex-shrink-0">
          <svg viewBox="0 0 200 110" className="w-full h-full">
            {/* Background arc */}
            <path
              d="M 20 90 A 80 80 0 0 1 180 90"
              fill="none"
              stroke="#334155"
              strokeWidth="12"
              strokeLinecap="round"
            />
            {/* Gradient stops */}
            <defs>
              <linearGradient id="fgGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#ef4444" />
                <stop offset="25%" stopColor="#f97316" />
                <stop offset="50%" stopColor="#eab308" />
                <stop offset="75%" stopColor="#84cc16" />
                <stop offset="100%" stopColor="#22c55e" />
              </linearGradient>
            </defs>
            <path
              d="M 20 90 A 80 80 0 0 1 180 90"
              fill="none"
              stroke="url(#fgGradient)"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={`${(data.value / 100) * 251}, 251`}
            />
            {/* Needle */}
            <circle cx={x} cy={y} r="6" fill={color} />
            <circle cx={x} cy={y} r="3" fill="white" />
            {/* Value */}
            <text x="100" y="85" textAnchor="middle" fill="white" fontSize="28" fontWeight="bold">
              {data.value}
            </text>
          </svg>
        </div>
        {/* Label */}
        <div>
          <p className="text-lg font-bold" style={{ color }}>{label}</p>
          <p className="text-xs text-slate-500 mt-1">
            0 = Miedo Extremo · 100 = Codicia Extrema
          </p>
          <p className="text-[10px] text-slate-600 mt-2">
            Usa como filtro contrarian: compra en miedo, cautela en codicia.
          </p>
        </div>
      </div>
    </div>
  );
};

export default MarketSentiment;
