import { useState, useCallback } from "react";
import { FIREBASE_FUNCTIONS_URL } from "../lib/firebase";
import { fetchDynamicPrices } from "../lib/binance";
import type { ExchangeLiqData } from "./useLiquidationData";

// ─── Tipos de la respuesta cruda de Binance ────────────────────────
interface BinanceOngoingRow {
  loanCoin: string;
  collateralCoin: string;
  totalDebt: string;
  accruedInterest: string;
  collateralAmount: string;
  currentLTV: string;
}

interface BinanceCollateralRow {
  collateralCoin: string;
  initialLTV: string;
  marginCallLTV: string;
  liquidationLTV: string;
}

interface BinanceLoanableRow {
  loanCoin: string;
  flexibleDailyInterestRate: string;
  flexibleYearlyInterestRate: string;
}

interface BinanceSyncResponse {
  ongoing: BinanceOngoingRow[];
  collateral: BinanceCollateralRow[];
  loanable: BinanceLoanableRow[];
}

// ─── Generador de IDs ─────────────────────────────────────────────
const generateId = (): string => {
  if (typeof window !== "undefined" && window.crypto && "randomUUID" in window.crypto) {
    return (window.crypto as any).randomUUID();
  }
  return Math.random().toString(36).substring(2, 15);
};

// ─── Conversión: API Binance → Formato de la app ─────────────────
function mapBinanceToExchangeData(
  data: BinanceSyncResponse,
  prices: Record<string, number>
): Partial<ExchangeLiqData> {
  const now = Date.now();
  const ongoing = data.ongoing || [];
  const collateralData = data.collateral || [];
  const loanableData = data.loanable || [];

  // ── Debts: agrupar por loanCoin (puede haber varios préstamos con misma moneda) ──
  const debtMap: Record<string, { amount: number; accrued: number; loanCoin: string }> = {};
  const collateralMap: Record<string, { amount: number; valueUSD: number; collateralCoin: string }> = {};

  for (const row of ongoing) {
    const loanCoin = row.loanCoin;
    const amount = parseFloat(row.totalDebt) || 0;
    const accrued = parseFloat(row.accruedInterest) || 0;
    if (amount <= 0) continue;

    if (!debtMap[loanCoin]) {
      debtMap[loanCoin] = { amount: 0, accrued: 0, loanCoin };
    }
    debtMap[loanCoin].amount += amount;
    debtMap[loanCoin].accrued += accrued;

    // Collateral por moneda
    const collCoin = row.collateralCoin;
    const collAmount = parseFloat(row.collateralAmount) || 0;
    if (collAmount <= 0) continue;

    if (!collateralMap[collCoin]) {
      collateralMap[collCoin] = { amount: 0, valueUSD: 0, collateralCoin: collCoin };
    }
    collateralMap[collCoin].amount += collAmount;
  }

  // Calcular valor USD del colateral usando precios actuales
  for (const coin of Object.keys(collateralMap)) {
    const price = prices[coin] || 0;
    collateralMap[coin].valueUSD = collateralMap[coin].amount * price;
  }

  // ── Debts: mapear a formato app ──
  const debts = Object.values(debtMap).map((item) => {
    const loanData = loanableData.find((l) => l.loanCoin === item.loanCoin);
    const yearlyRate = parseFloat(loanData?.flexibleYearlyInterestRate || "0") * 100;
    const dailyRate = parseFloat(loanData?.flexibleDailyInterestRate || "0");
    const hourlyRate = dailyRate / 24;
    return {
      _id: generateId(),
      id: item.loanCoin,
      amount: item.amount,
      price: item.loanCoin === "USDT" || item.loanCoin === "USDC" ? 1.0 : (prices[item.loanCoin] || 0),
      rate: parseFloat(yearlyRate.toFixed(2)),
      hourlyRate,
      synced: true,
      lastSyncAt: now,
      accruedInterest: item.accrued,
    };
  });

  // ── Collateral: mapear a formato app ──
  const collateral = Object.values(collateralMap).map((item) => {
    const price = item.amount > 0 ? item.valueUSD / item.amount : 0;
    return {
      _id: generateId(),
      id: item.collateralCoin,
      amount: item.amount,
      price,
      synced: true,
      lastSyncAt: now,
    };
  });

  // ── Agregados ──
  const totalDebt = debts.reduce((sum, d) => sum + d.amount * d.price, 0);
  const totalCollateral = collateral.reduce((sum, c) => sum + c.amount * c.price, 0);

  // LTV del exchange: promedio ponderado de los préstamos activos
  let ltvFromExchange = 0;
  if (ongoing.length > 0) {
    const weightedSum = ongoing.reduce((sum, row) => {
      const ltv = parseFloat(row.currentLTV) || 0;
      const debt = parseFloat(row.totalDebt) || 0;
      return sum + ltv * debt;
    }, 0);
    const totalDebtRaw = ongoing.reduce((sum, row) => sum + (parseFloat(row.totalDebt) || 0), 0);
    ltvFromExchange = totalDebtRaw > 0 ? (weightedSum / totalDebtRaw) * 100 : 0;
  }

  // ── LTV thresholds por moneda (del endpoint collateral/data) ──
  const perCoinLiqLTV: Record<string, number> = {};
  const DEFAULT_LIQ = 91;
  let weightedSumLiq = 0;

  for (const item of collateral) {
    const coinData = collateralData.find((c) => c.collateralCoin === item.id);
    const liqLTV = coinData ? (parseFloat(coinData.liquidationLTV) || 0) * 100 : DEFAULT_LIQ;
    perCoinLiqLTV[item.id] = liqLTV;
    weightedSumLiq += item.amount * item.price * liqLTV;
  }

  // Weighted average liquidation LTV
  const effectiveLiqLTV = totalCollateral > 0 ? weightedSumLiq / totalCollateral : DEFAULT_LIQ;
  const weightedAvgLiqLTV = Math.round(effectiveLiqLTV * 100) / 100;

  // Default slider value
  const liquidationLTV = DEFAULT_LIQ;

  // Margin call: usar el valor más bajo entre todas las monedas de colateral
  let marginCallLTV = 100;
  for (const coinData of collateralData) {
    const mc = parseFloat(coinData.marginCallLTV) * 100;
    if (mc > 0 && mc < marginCallLTV) marginCallLTV = mc;
  }
  if (marginCallLTV === 100) marginCallLTV = 85;

  return {
    debts,
    collateral,
    liquidationLTV,
    totalDebt,
    totalCollateral,
    ltvFromExchange,
    marginCallLTV,
    perCoinLiqLTV,
    weightedAvgLiqLTV,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────
export function useBinanceSync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const syncLoansFromBinance = useCallback(async () => {
    setIsSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch(`${FIREBASE_FUNCTIONS_URL}/syncBinanceLoans`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data: BinanceSyncResponse = await res.json();
      if ((data as any).error) throw new Error((data as any).error);

      // Obtener precios para calcular valor USD del colateral
      const ongoing = data.ongoing || [];
      const collateralCoins = Array.from(new Set(ongoing.map((row) => row.collateralCoin)));
      let prices: Record<string, number> = { USDT: 1.0, USDC: 1.0 };
      if (collateralCoins.length > 0) {
        try {
          prices = { ...prices, ...(await fetchDynamicPrices(collateralCoins)) };
        } catch {
          // si fallan los precios, seguimos con lo que tengamos
        }
      }

      const mapped = mapBinanceToExchangeData(data, prices);
      setLastSyncedAt(Date.now());
      return mapped;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      setSyncError(msg);
      throw err;
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const clearError = useCallback(() => setSyncError(null), []);

  return {
    syncLoansFromBinance,
    isSyncing,
    lastSyncedAt,
    syncError,
    clearError,
  } as const;
}
