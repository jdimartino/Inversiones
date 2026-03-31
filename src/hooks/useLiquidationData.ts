import { useState, useEffect, useCallback, useRef } from "react";
import { db, doc, onSnapshot, setDoc } from "../lib/firebase";

export interface DebtItem {
  _id: string;
  id: string;
  amount: number;
  price: number;
  rate: number;
}

export interface CollateralItem {
  _id: string;
  id: string;
  amount: number;
  price: number;
}

export interface ExchangeLiqData {
  name: string;
  themeKey: 'bybit' | 'binance';
  liquidationLTV: number;
  debts: DebtItem[];
  collateral: CollateralItem[];
}

export interface MultiExchangeLiqData {
  bybit: ExchangeLiqData;
  binance: ExchangeLiqData;
}

// Generador de UUID simple si no existe
const generateId = () => {
  const _crypto = typeof window !== 'undefined' ? (window.crypto as any) : null;
  return _crypto && _crypto.randomUUID 
    ? _crypto.randomUUID() 
    : Math.random().toString(36).substring(2, 15);
};

const DEFAULT_LIQ_DATA: MultiExchangeLiqData = {
  bybit: {
    name: 'Bybit',
    themeKey: 'bybit',
    liquidationLTV: 92,
    debts: [
      { _id: generateId(), id: 'USDT', amount: 55037.0553, price: 1.0, rate: 3.08 },
      { _id: generateId(), id: 'USDC', amount: 35031.523928, price: 1.0, rate: 2.94 }
    ],
    collateral: [
      { _id: generateId(), id: 'BTC', amount: 2.00000000, price: 65402.835 },
      { _id: generateId(), id: 'ADA', amount: 31623.980482, price: 0.22368 },
      { _id: generateId(), id: 'DOGE', amount: 84260.01000000, price: 0.08249 },
      { _id: generateId(), id: 'LTC', amount: 131.44488237, price: 48.604 },
      { _id: generateId(), id: 'BNB', amount: 7.03637369, price: 554.014 }
    ]
  },
  binance: {
    name: 'Binance',
    themeKey: 'binance',
    liquidationLTV: 91,
    debts: [
      { _id: generateId(), id: 'USDT', amount: 20057.81820966, price: 1.0, rate: 2.95 }
    ],
    collateral: [
      { _id: generateId(), id: 'BTC', amount: 0.54341972, price: 66421.37 } 
    ]
  }
};

export function useLiquidationData() {
  const [exchangeData, setExchangeDataState] = useState<MultiExchangeLiqData>(DEFAULT_LIQ_DATA);
  const exchangeDataRef = useRef<MultiExchangeLiqData>(DEFAULT_LIQ_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const docRef = doc(db, "settings", "liquidationData");

    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as MultiExchangeLiqData;
          exchangeDataRef.current = data;
          setExchangeDataState(data);
        } else {
          // Si no existe, usamos los datos por defecto (no escribimos aún para ahorrar writes hasta que el user guarde explícitamente)
          exchangeDataRef.current = DEFAULT_LIQ_DATA;
          setExchangeDataState(DEFAULT_LIQ_DATA);
        }
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching liquidation data", err);
        setError("Error de conexión");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const saveExchangeData = useCallback(async (newData: MultiExchangeLiqData | ((prev: MultiExchangeLiqData) => MultiExchangeLiqData)) => {
    const nextState = typeof newData === 'function' ? newData(exchangeDataRef.current) : newData;
    exchangeDataRef.current = nextState;
    setExchangeDataState(nextState);
    try {
      await setDoc(doc(db, "settings", "liquidationData"), nextState);
    } catch (err) {
      console.error("Error saving liquidation data", err);
      setError("Error al guardar en Firebase");
    }
  }, []);

  return { exchangeData, saveExchangeData, loading, error };
}
