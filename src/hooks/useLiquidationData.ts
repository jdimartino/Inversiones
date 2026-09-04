import { useState, useEffect, useCallback, useRef } from "react";
import { db, doc, onSnapshot, setDoc } from "../lib/firebase";

export interface DebtItem {
  _id: string;
  id: string;
  /** Deuda total (principal + intereses capitalizados). Para Bybit: flexibleTotalDebt en moneda. Para Binance: totalDebt. */
  amount: number;
  /** Precio USD de la moneda de deuda. Stablecoins = 1.0. */
  price: number;
  /** Tasa de interés anual (APR%) */
  rate: number;
  synced?: boolean;
  lastSyncAt?: number;
  /** Interés acumulado NO pagado (unpaidInterest / accruedInterest) */
  accruedInterest?: number;
  /** Tasa de interés por hora (decimal) */
  hourlyRate?: number;
  /** Valor USD de la deuda (flexibleTotalDebtUSD / totalDebt × price) */
  amountUSD?: number;
}

export interface CollateralItem {
  _id: string;
  id: string;
  /** Cantidad del activo */
  amount: number;
  /** Precio USD para cálculos de LTV. Bybit: ajustado (haircut). Binance: mercado. */
  price: number;
  synced?: boolean;
  lastSyncAt?: number;
  /** Precio de mercado real (sin ajuste). Bybit lo obtiene del feed de precios. */
  marketPrice?: number;
  /** Valor USD de mercado (amount × marketPrice) */
  marketValueUSD?: number;
  /** Valor USD ajustado para LTV (amount × price). Bybit: amountUSD del API. */
  adjustedValueUSD?: number;
}

export interface CoinLTVThreshold {
  initialLTV: number;
  marginCallLTV: number;
  liquidationLTV: number;
}

export interface ExchangeLiqData {
  name: string;
  themeKey: 'bybit' | 'binance';
  debts: DebtItem[];
  collateral: CollateralItem[];
  // Valores agregados del exchange
  totalDebt?: number;
  totalCollateral?: number;
  /** LTV actual provisto por el exchange (Bybit: position.ltv, Binance: calculado) */
  ltvFromExchange?: number;
  // Umbrales por moneda (datos reales del API)
  perCoinMarginCallLTV?: Record<string, number>;
  perCoinLiqLTV?: Record<string, number>;
  // Umbrales blended (estimaciones calculadas por la app, NO datos oficiales)
  blendedMarginCallLTV?: number;
  blendedLiqLTV?: number;
  /** @deprecated Usar blendedLiqLTV */
  liquidationLTV?: number;
  /** @deprecated Usar perCoinMarginCallLTV o blendedMarginCallLTV */
  marginCallLTV?: number;
  /** @deprecated Usar blendedLiqLTV */
  weightedAvgLiqLTV?: number;
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
    debts: [
      { _id: generateId(), id: 'USDT', amount: 55037.0553, price: 1.0, rate: 3.08 },
      { _id: generateId(), id: 'USDC', amount: 35031.523928, price: 1.0, rate: 2.94 }
    ],
    collateral: [
      { _id: generateId(), id: 'BTC', amount: 2.00000000, price: 65402.835, marketPrice: 65402.835 },
      { _id: generateId(), id: 'ADA', amount: 31623.980482, price: 0.22368, marketPrice: 0.22368 },
      { _id: generateId(), id: 'DOGE', amount: 84260.01000000, price: 0.08249, marketPrice: 0.08249 },
      { _id: generateId(), id: 'LTC', amount: 131.44488237, price: 48.604, marketPrice: 48.604 },
      { _id: generateId(), id: 'BNB', amount: 7.03637369, price: 554.014, marketPrice: 554.014 }
    ]
  },
  binance: {
    name: 'Binance',
    themeKey: 'binance',
    debts: [
      { _id: generateId(), id: 'USDT', amount: 20057.81820966, price: 1.0, rate: 2.95 }
    ],
    collateral: [
      { _id: generateId(), id: 'BTC', amount: 0.54341972, price: 66421.37, marketPrice: 66421.37 }
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
