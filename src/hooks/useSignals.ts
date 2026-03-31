import { useState, useCallback, useRef } from 'react';
import { SYMBOL_MAP } from '../lib/constants';
import { parseKlines, computeIndicators } from '../lib/indicators';
import { computeSignal } from '../lib/signalEngine';
import type { CoinSignal, FearGreedData, Kline } from '../lib/types/signals';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchKlines(symbol: string, signal?: AbortSignal): Promise<any[]> {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=100`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Binance klines ${res.status}`);
  return res.json();
}

export function useSignals() {
  const [signals, setSignals] = useState<CoinSignal[]>([]);
  const [klinesMap, setKlinesMap] = useState<Record<string, Kline[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const cacheRef = useRef<{ data: CoinSignal[]; klines: Record<string, Kline[]>; timestamp: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchSignals = useCallback(async (fearGreed?: FearGreedData, portfolioCoins?: Set<string>) => {
    // Check cache
    if (cacheRef.current && Date.now() - cacheRef.current.timestamp < CACHE_TTL) {
      setSignals(cacheRef.current.data);
      setKlinesMap(cacheRef.current.klines);
      setLastUpdated(cacheRef.current.timestamp);
      return;
    }

    // Cancel previous request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const coins = Object.keys(SYMBOL_MAP);
      const results = await Promise.allSettled(
        coins.map((coin) =>
          fetchKlines(SYMBOL_MAP[coin], controller.signal).then((raw) => ({
            coin,
            klines: parseKlines(raw),
          }))
        )
      );

      const coinSignals: CoinSignal[] = [];
      const newKlinesMap: Record<string, Kline[]> = {};

      for (const result of results) {
        if (result.status === 'fulfilled') {
          const { coin, klines } = result.value;
          newKlinesMap[coin] = klines;
          if (klines.length >= 50) {
            const indicators = computeIndicators(klines);
            const signal = computeSignal(coin, indicators, fearGreed);
            coinSignals.push(signal);
          }
        }
      }

      // Mark portfolio coins
      for (const s of coinSignals) {
        s.inPortfolio = portfolioCoins?.has(s.coin) ?? false;
      }

      // Sort: portfolio first, then by signal strength
      const signalOrder: Record<string, number> = {
        strong_buy: 0, strong_sell: 1, buy: 2, sell: 3, hold: 4,
      };
      coinSignals.sort(
        (a, b) => {
          if (a.inPortfolio !== b.inPortfolio) return a.inPortfolio ? -1 : 1;
          return (signalOrder[a.signal] ?? 5) - (signalOrder[b.signal] ?? 5) ||
            b.confidence - a.confidence;
        }
      );

      const now = Date.now();
      cacheRef.current = { data: coinSignals, klines: newKlinesMap, timestamp: now };
      setSignals(coinSignals);
      setKlinesMap(newKlinesMap);
      setLastUpdated(now);
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      console.error('Error computing signals:', e);
      setError('Error obteniendo señales de trading');
    } finally {
      setLoading(false);
    }
  }, []);

  const forceRefresh = useCallback(async (fearGreed?: FearGreedData, portfolioCoins?: Set<string>) => {
    cacheRef.current = null;
    await fetchSignals(fearGreed, portfolioCoins);
  }, [fetchSignals]);

  return { signals, klinesMap, loading, error, lastUpdated, fetchSignals, forceRefresh };
}
