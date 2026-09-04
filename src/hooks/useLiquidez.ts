import { useState, useEffect, useCallback, useRef } from "react";
import { db, doc, onSnapshot, setDoc } from "../lib/firebase";
import { FIREBASE_FUNCTIONS_URL } from "../lib/firebase";

export interface LiquidezData {
  saldoBancos: number;
  efectivo: number;
  inversionesSpot: number;
  aporteFondoVitalicio: number;
  btcDisponible: number;
  otros: number;
  otrosNota: string;
  btcMensual: number;
  usdtMensual: number;
  precioBtcSnapshot: number;
  updatedAt?: number;
}

const DEFAULT_LIQUIDEZ: LiquidezData = {
  saldoBancos: 0,
  efectivo: 0,
  inversionesSpot: 0,
  aporteFondoVitalicio: 0,
  btcDisponible: 0,
  otros: 0,
  otrosNota: "",
  btcMensual: 0,
  usdtMensual: 0,
  precioBtcSnapshot: 0,
};

const STORAGE_KEY = "liquidez_cache";
const VERSION_KEY = "liquidez_version";
const CURRENT_VERSION = 2;

const DOC_PATH = doc(db, "settings", "liquidezData");

type SaveStatus = "idle" | "guardando" | "guardado" | "error";

function readCache(): LiquidezData | null {
  try {
    const version = localStorage.getItem(VERSION_KEY);
    if (version !== String(CURRENT_VERSION)) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as LiquidezData;
  } catch {}
  return null;
}

function writeCache(data: LiquidezData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    localStorage.setItem(VERSION_KEY, String(CURRENT_VERSION));
  } catch {}
}

export function useLiquidez() {
  const [liquidez, setLiquidez] = useState<LiquidezData>(DEFAULT_LIQUIDEZ);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const dataRef = useRef<LiquidezData>(DEFAULT_LIQUIDEZ);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadingRef = useRef(true);

  useEffect(() => {
    const cached = readCache();
    if (cached) {
      const initial = { ...DEFAULT_LIQUIDEZ, ...cached };
      dataRef.current = initial;
      setLiquidez(initial);
      setLoading(false);
      loadingRef.current = false;
    }

    const unsubscribe = onSnapshot(
      DOC_PATH,
      (snapshot) => {
        const data = snapshot.exists()
          ? { ...DEFAULT_LIQUIDEZ, ...snapshot.data() } as LiquidezData
          : { ...DEFAULT_LIQUIDEZ, ...readCache() };
        dataRef.current = data;
        setLiquidez(data);
        writeCache(data);
        setLoading(false);
        loadingRef.current = false;
      },
      (err) => {
        console.error("Error fetching liquidez data", err);
        setError("Error de conexión");
        setLoading(false);
        loadingRef.current = false;
      }
    );

    const timeout = setTimeout(() => {
      if (loadingRef.current) {
        const cached = readCache();
        const safe = { ...DEFAULT_LIQUIDEZ, ...cached };
        dataRef.current = safe;
        setLiquidez(safe);
        setLoading(false);
        loadingRef.current = false;
      }
    }, 8000);

    return () => {
      unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const saveToFirestore = useCallback(async (data: LiquidezData) => {
    setSaveStatus("guardando");
    try {
      const toSave = { ...data, updatedAt: Date.now() };
      await setDoc(DOC_PATH, toSave);
      dataRef.current = toSave;
      setLiquidez(toSave);
      writeCache(toSave);
      setSaveStatus("guardado");
      setLastSavedAt(Date.now());
      setError(null);
    } catch (err) {
      console.error("Error saving liquidez data", err);
      setSaveStatus("error");
      setError("Error al guardar");

      if (retryRef.current) clearTimeout(retryRef.current);
      retryRef.current = setTimeout(() => {
        saveToFirestore(dataRef.current);
      }, 2000);
    }
  }, []);

  const updateLiquidez = useCallback(
    (field: keyof LiquidezData, value: number | string) => {
      const current = dataRef.current[field];
      if (current === value) return;

      if (typeof current === "number" && typeof value === "number") {
        if (current === 0 && value === 0) return;
        if (current !== 0 && Math.abs((value - current) / current) < 0.0001) return;
      }

      const newData = { ...dataRef.current, [field]: value };
      dataRef.current = newData;
      setLiquidez(newData);
      writeCache(newData);

      if (debounceRef.current) clearTimeout(debounceRef.current);
      setSaveStatus("idle");

      debounceRef.current = setTimeout(() => {
        saveToFirestore(dataRef.current);
      }, 500);
    },
    [saveToFirestore]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (retryRef.current) clearTimeout(retryRef.current);
    };
  }, []);

  return { liquidez, updateLiquidez, saveStatus, lastSavedAt, loading, error };
}

export function useBinanceFundingBalance() {
  const [funding, setFunding] = useState<Record<string, number>>({ USDT: 0 });
  const [spot, setSpot] = useState<Record<string, number>>({ USDT: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWallet = useCallback(async () => {
    try {
      const res = await fetch(`${FIREBASE_FUNCTIONS_URL}/getBinanceWallet`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setFunding(data.fundingWallet ?? { USDT: 0 });
      setSpot(data.spot ?? { USDT: 0 });
      setError(null);
    } catch (err: any) {
      console.error("[useBinanceFundingBalance]", err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWallet();
    const interval = setInterval(fetchWallet, 60000);
    return () => clearInterval(interval);
  }, [fetchWallet]);

  const usdtFunding = funding.USDT ?? 0;
  const usdtSpot = spot.USDT ?? 0;

  return { funding, spot, usdtFunding, usdtSpot, loading, error, refresh: fetchWallet };
}