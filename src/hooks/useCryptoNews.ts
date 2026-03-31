import { useState, useCallback, useRef, useEffect } from 'react';
import type { NewsItem } from '../lib/types/signals';

const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export function useCryptoNews(limit: number = 10) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const cacheRef = useRef<{ data: NewsItem[]; timestamp: number } | null>(null);

  const refresh = useCallback(async () => {
    if (cacheRef.current && Date.now() - cacheRef.current.timestamp < CACHE_TTL) {
      setNews(cacheRef.current.data);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `https://min-api.cryptocompare.com/data/v2/news/?lang=EN&sortOrder=popular`
      );
      const json = await res.json();

      if (json.Data && Array.isArray(json.Data)) {
        const items: NewsItem[] = json.Data.slice(0, limit).map((item: any) => ({
          id: String(item.id),
          title: item.title,
          url: item.url,
          source: item.source_info?.name || item.source || 'Unknown',
          publishedAt: item.published_on * 1000,
          categories: item.categories || '',
          imageUrl: item.imageurl || undefined,
        }));
        cacheRef.current = { data: items, timestamp: Date.now() };
        setNews(items);
      }
    } catch (e) {
      console.error('Error fetching crypto news:', e);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { news, loading, refresh };
}
