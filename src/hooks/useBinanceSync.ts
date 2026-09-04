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
  flexibleInterestRate: string;
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

  // ── Debts: agrupar por loanCoin ────────────────────────────────
  const debtMap: Record<string, { amount: number; accrued: number; loanCoin: string }> = {};
  const collateralMap: Record<string, { amount: number; collateralCoin: string }> = {};

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
      collateralMap[collCoin] = { amount: 0, collateralCoin: collCoin };
    }
    collateralMap[collCoin].amount += collAmount;
  }

  // ── Debts: mapear a formato app ────────────────────────────────
  const debts = Object.values(debtMap).map((item) => {
    const loanData = loanableData.find((l) => l.loanCoin === item.loanCoin);
    const interestRate = parseFloat(loanData?.flexibleInterestRate || "0");
    const yearlyRate = interestRate * 100;
    const hourlyRate = interestRate / 365 / 24;
    const price = item.loanCoin === "USDT" || item.loanCoin === "USDC" ? 1.0 : (prices[item.loanCoin] || 0);
    return {
      _id: generateId(),
      id: item.loanCoin,
      amount: item.amount,
      price,
      rate: parseFloat(yearlyRate.toFixed(2)),
      hourlyRate,
      synced: true,
      lastSyncAt: now,
      accruedInterest: item.accrued,
      amountUSD: item.amount * price,
    };
  });

  // ── Collateral: mapear a formato app ───────────────────────────
  const collateral = Object.values(collateralMap).map((item) => {
    const marketPrice = prices[item.collateralCoin] || 0;
    const marketValueUSD = item.amount * marketPrice;
    return {
      _id: generateId(),
      id: item.collateralCoin,
      amount: item.amount,
      price: marketPrice,
      synced: true,
      lastSyncAt: now,
      marketPrice,
      marketValueUSD,
      adjustedValueUSD: marketValueUSD, // Binance no aplica haircut
    };
  });

  // ── Agregados ──────────────────────────────────────────────────
  // LTV agregado = deuda total / valor total del colateral
  const totalDebt = debts.reduce((sum, d) => sum + (d.amountUSD ?? d.amount * d.price), 0);
  const totalCollateral = collateral.reduce((sum, c) => sum + (c.marketValueUSD ?? c.amount * c.price), 0);

  // LTV agregado correcto (Σdebt/Σcollateral)
  const ltvFromExchange = totalCollateral > 0 ? (totalDebt / totalCollateral) * 100 : 0;

  // ── Per-coin thresholds (del endpoint collateral/data) ─────────
  const perCoinLiqLTV: Record<string, number> = {};
  const perCoinMarginCallLTV: Record<string, number> = {};

  for (const coinData of collateralData) {
    const liq = (parseFloat(coinData.liquidationLTV) || 0) * 100;
    const mc = (parseFloat(coinData.marginCallLTV) || 0) * 100;
    if (liq > 0) perCoinLiqLTV[coinData.collateralCoin] = liq;
    if (mc > 0) perCoinMarginCallLTV[coinData.collateralCoin] = mc;
  }

  // ── Blended liquidation LTV (estimación ponderada) ─────────────
  // IMPORTANTE: esto NO es un dato oficial del exchange
  const DEFAULT_LIQ = 91;
  let weightedSumLiq = 0;
  let weightedSumMC = 0;
  let totalWeight = 0;

  for (const item of collateral) {
    const liqLTV = perCoinLiqLTV[item.id] ?? DEFAULT_LIQ;
    const mcLTV = perCoinMarginCallLTV[item.id] ?? 85;
    const weight = item.marketValueUSD ?? (item.amount * item.price);
    weightedSumLiq += weight * liqLTV;
    weightedSumMC += weight * mcLTV;
    totalWeight += weight;
  }

  const blendedLiqLTV = totalWeight > 0 ? Math.round((weightedSumLiq / totalWeight) * 100) / 100 : DEFAULT_LIQ;
  const blendedMarginCallLTV = totalWeight > 0 ? Math.round((weightedSumMC / totalWeight) * 100) / 100 : 85;

  return {
    debts,
    collateral,
    totalDebt,
    totalCollateral,
    ltvFromExchange,
    perCoinLiqLTV,
    perCoinMarginCallLTV,
    blendedLiqLTV,
    blendedMarginCallLTV,
    // Legacy fields for backwards compatibility
    liquidationLTV: blendedLiqLTV,
    marginCallLTV: blendedMarginCallLTV,
    weightedAvgLiqLTV: blendedLiqLTV,
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
