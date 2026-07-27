import { useState, useEffect, useCallback } from "react";
import { db, collection, query, where, orderBy, getDocs } from "../lib/firebase";
import type { LoanSnapshot } from "../lib/loanHistory";
import { getCurrentMonth } from "../lib/loanHistory";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function useLoanHistory(exchange: 'bybit' | 'binance', month?: string) {
  const [snapshots, setSnapshots] = useState<LoanSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeMonth = month || getCurrentMonth();

  const fetchSnapshots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const startDate = `${activeMonth}-01`;
      const endDate = `${activeMonth}-31`;

      const q = query(
        collection(db, "loanSnapshots"),
        where("date", ">=", startDate),
        where("date", "<=", endDate),
        orderBy("date", "asc")
      );

      let lastErr: unknown = null;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const snap = await getDocs(q);
          const data = snap.docs.map((d) => d.data() as LoanSnapshot);
          setSnapshots(data);
          setError(null);
          return;
        } catch (err) {
          lastErr = err;
          console.warn(`[useLoanHistory] Intento ${attempt}/${MAX_RETRIES} falló:`, err);
          if (attempt < MAX_RETRIES) await delay(RETRY_DELAY_MS * attempt);
        }
      }

      const msg = lastErr instanceof Error ? lastErr.message : "Error de conexión con Firestore";
      setError(msg);
      setSnapshots([]);
    } finally {
      setLoading(false);
    }
  }, [activeMonth]);

  useEffect(() => {
    fetchSnapshots();
  }, [fetchSnapshots]);

  return { snapshots, loading, error, refresh: fetchSnapshots };
}
