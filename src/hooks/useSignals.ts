import { useState, useCallback, useRef } from 'react';
import { SYMBOL_MAP } from '../lib/constants';
import { parseKlines, computeIndicators } from '../lib/indicators';
import { computeSignal } from '../lib/signalEngine';
import type { CoinSignal, FearGreedData, Kline } from '../lib/types/signals';

const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

async function fetchWithLimit<T>(tasks: (() => Promise<T>)[], limit: number): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  for (let i = 0; i < tasks.length; i += limit) {
    const batch = await Promise.allSettled(tasks.slice(i, i + limit).map(fn => fn()));
    results.push(...batch);
  }
  return results;
}

async function fetchKlines(symbol: string, interval: string = '1h', limit: number = 100, signal?: AbortSignal): Promise<any[]> {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
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
      const allCoins = Object.keys(SYMBOL_MAP);
      const coins = portfolioCoins && portfolioCoins.size > 0
        ? allCoins.filter(c => portfolioCoins.has(c))
        : allCoins;
      const tasks = coins.map(coin => () =>
        Promise.all([
          fetchKlines(SYMBOL_MAP[coin], '1h', 100, controller.signal),
          fetchKlines(SYMBOL_MAP[coin], '1d', 100, controller.signal),
        ]).then(([rawHourly, rawDaily]) => ({
          coin,
          klinesHourly: parseKlines(rawHourly),
          klinesDaily: parseKlines(rawDaily),
        }))
      );
      const results = await fetchWithLimit(tasks, 5);

      const coinSignals: CoinSignal[] = [];
      const newKlinesMap: Record<string, Kline[]> = {};

      const signalDir = (s: string) =>
        s === 'strong_buy' || s === 'buy' ? 'buy' :
        s === 'strong_sell' || s === 'sell' ? 'sell' : 'hold';

      for (const result of results) {
        if (result.status === 'fulfilled') {
          const { coin, klinesHourly, klinesDaily } = result.value;
          newKlinesMap[coin] = klinesHourly;
          if (klinesHourly.length >= 50) {
            const indicators = computeIndicators(klinesHourly);
            const signal = computeSignal(coin, indicators, fearGreed);

            // Compute daily signal for dual-timeframe confirmation
            if (klinesDaily.length >= 50) {
              const dailyIndicators = computeIndicators(klinesDaily);
              const daily = computeSignal(coin, dailyIndicators, fearGreed);
              signal.dailySignal = daily.signal;
              signal.dailyConfidence = daily.confidence;
              const hDir = signalDir(signal.signal);
              const dDir = signalDir(daily.signal);
              signal.timeframeAgree = hDir !== 'hold' && dDir !== 'hold' && hDir === dDir;
            }

            coinSignals.push(signal);
          }
        }
      }

      // Mark portfolio coins
      for (const s of coinSignals) {
        s.inPortfolio = portfolioCoins?.has(s.coin) ?? false;
      }

      // Sort: portfolio first, confirmed first within group, then signal strength
      const signalOrder: Record<string, number> = {
        strong_buy: 0, strong_sell: 1, buy: 2, sell: 3, hold: 4,
      };
      coinSignals.sort((a, b) => {
        if (a.inPortfolio !== b.inPortfolio) return a.inPortfolio ? -1 : 1;
        if ((a.timeframeAgree ?? false) !== (b.timeframeAgree ?? false)) return a.timeframeAgree ? -1 : 1;
        return (signalOrder[a.signal] ?? 5) - (signalOrder[b.signal] ?? 5) ||
          b.confidence - a.confidence;
      });

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
