import { useState, useEffect, useCallback } from "react";
import { db, collection, query, where, orderBy, getDocs } from "../lib/firebase";
import type { LoanSnapshot } from "../lib/loanHistory";
import { getCurrentMonth } from "../lib/loanHistory";

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

      const snap = await getDocs(q);
      const data = snap.docs.map((d) => d.data() as LoanSnapshot);
      setSnapshots(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [activeMonth]);

  useEffect(() => {
    fetchSnapshots();
  }, [fetchSnapshots]);

  return { snapshots, loading, error, refresh: fetchSnapshots };
}
