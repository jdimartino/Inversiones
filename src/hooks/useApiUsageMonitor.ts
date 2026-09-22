import { useState, useEffect, useCallback, useRef } from "react";
import { FIREBASE_FUNCTIONS_URL } from "../lib/firebase";

const REFRESH_MS = 5 * 60 * 1000; // 5 min

export function useApiUsageMonitor<T>(functionName: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${FIREBASE_FUNCTIONS_URL}/${functionName}`);
      const json = await res.json();
      setData(json);
      setError(json?.error ?? null);
      setLastUpdated(Date.now());
    } catch (err: any) {
      setError(err?.message ?? "Error de red");
    } finally {
      setLoading(false);
    }
  }, [functionName]);

  useEffect(() => {
    fetchData();
    timerRef.current = setInterval(fetchData, REFRESH_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchData]);

  return { data, loading, error, lastUpdated, refresh: fetchData };
}
