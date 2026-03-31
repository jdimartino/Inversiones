import React from 'react';
import { SIGNAL_LABELS, SIGNAL_COLORS, SignalStrength } from '../lib/types/signals';

interface SignalBadgeProps {
  signal: SignalStrength;
  size?: 'sm' | 'md';
}

const SignalBadge: React.FC<SignalBadgeProps> = ({ signal, size = 'md' }) => {
  const sizeClass = size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2.5 py-1';
  return (
    <span className={`${SIGNAL_COLORS[signal]} border rounded-full font-bold ${sizeClass}`}>
      {SIGNAL_LABELS[signal]}
    </span>
  );
};

export default SignalBadge;
