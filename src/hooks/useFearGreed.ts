import { useState, useCallback, useRef, useEffect } from 'react';
import type { FearGreedData } from '../lib/types/signals';

const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

export function useFearGreed() {
  const [data, setData] = useState<FearGreedData | null>(null);
  const [loading, setLoading] = useState(false);
  const cacheRef = useRef<{ data: FearGreedData; timestamp: number } | null>(null);

  const refresh = useCallback(async () => {
    // Check cache
    if (cacheRef.current && Date.now() - cacheRef.current.timestamp < CACHE_TTL) {
      setData(cacheRef.current.data);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('https://api.alternative.me/fng/?limit=1');
      const json = await res.json();

      if (json.data && json.data.length > 0) {
        const item = json.data[0];
        const result: FearGreedData = {
          value: parseInt(item.value, 10),
          classification: item.value_classification,
          timestamp: parseInt(item.timestamp, 10) * 1000,
        };
        cacheRef.current = { data: result, timestamp: Date.now() };
        setData(result);
      }
    } catch (e) {
      console.error('Error fetching Fear & Greed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, loading, refresh };
}
