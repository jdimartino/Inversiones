import { useState, useEffect, useCallback } from "react";
import {
  db,
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
} from "../lib/firebase";

export interface SellStrategyData {
  coin: string;
  quantity: number;
  entryPrice: number;
  tpPercent: number;
  securePercent: number;
  slPercent: number;
}

export interface SellStrategy {
  id: string;
  name: string;
  type: "sell";
  data: SellStrategyData;
  createdAt: string;
}

export function useSellStrategies() {
  const [strategies, setStrategies] = useState<SellStrategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, "sellStrategies"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const strats = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as SellStrategy[];

        strats.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setStrategies(strats);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error("Error fetching sell strategies:", err);
        setError("Error cargando estrategias");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const addStrategy = useCallback(async (name: string, data: SellStrategyData) => {
    try {
      await addDoc(collection(db, "sellStrategies"), {
        name,
        type: "sell",
        data,
        createdAt: new Date().toISOString(),
      });
      return true;
    } catch (e) {
      console.error("Error adding strategy:", e);
      return false;
    }
  }, []);

  const removeStrategy = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, "sellStrategies", id));
      return true;
    } catch (e) {
      console.error("Error deleting strategy:", e);
      return false;
    }
  }, []);

  return { strategies, loading, error, addStrategy, removeStrategy };
}
