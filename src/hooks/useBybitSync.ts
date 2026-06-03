import { useState, useCallback } from "react";
import { fetchCryptoLoanPosition, fetchOngoingFlexibleLoans, fetchCollateralData, CryptoLoanPosition, FlexibleLoanItem } from "../lib/bybit";
import type { ExchangeLiqData } from "./useLiquidationData";

// ─── Generador de IDs ─────────────────────────────────────────────
const generateId = (): string => {
  if (typeof window !== "undefined" && window.crypto && "randomUUID" in window.crypto) {
    return (window.crypto as any).randomUUID();
  }
  return Math.random().toString(36).substring(2, 15);
};

// ─── Conversión: API Bybit → Formato de la app ───────────────────
function mapBybitToExchangeData(
  position: CryptoLoanPosition,
  flexibleLoans: FlexibleLoanItem[],
  collateralDataMap: Record<string, { initialLTV: number; marginCallLTV: number; liquidationLTV: number }>
): Partial<ExchangeLiqData> {
  const now = Date.now();

  // Debts: borrowList → debts[]
  const debts = (position.borrowList || []).map((item) => {
    const hourlyRate = parseFloat(item.flexibleHourlyInterestRate) || 0;
    const apy = hourlyRate * 24 * 365 * 100; // → percentage annual
    const flexLoan = flexibleLoans.find(f => f.loanCurrency === item.loanCurrency);
    return {
      _id: generateId(),
      id: item.loanCurrency,
      amount: parseFloat(item.flexibleTotalDebt) || 0,
      price: 1.0,
      rate: parseFloat(apy.toFixed(2)),
      hourlyRate,
      synced: true,
      lastSyncAt: now,
      accruedInterest: flexLoan ? parseFloat(flexLoan.unpaidInterest) || 0 : 0,
    };
  });

  // Collateral: collateralList → collateral[]
  const collateral = (position.collateralList || []).map((item) => {
    const amount = parseFloat(item.amount) || 0;
    const amountUSD = parseFloat(item.amountUSD) || 0;
    const price = amount > 0 ? amountUSD / amount : 0;
    return {
      _id: generateId(),
      id: item.currency,
      amount,
      price,
      synced: true,
      lastSyncAt: now,
    };
  });

  // Usar agregados que Bybit ya calculó (coinciden exacto con la página)
  const totalDebt = parseFloat(position.totalDebt) || 0;
  const totalCollateral = parseFloat(position.totalCollateral) || 0;
  const ltvFromExchange = parseFloat(position.ltv) * 100; // 0.6115 → 61.15%

  // LTV reales del API: per-coin liquidationLTV + weighted average
  const perCoinLiqLTV: Record<string, number> = {};
  const DEFAULT_LIQ = 92;
  let weightedSum = 0;

  for (const item of collateral) {
    const coinData = collateralDataMap[item.id];
    const liqLTV = coinData ? coinData.liquidationLTV : DEFAULT_LIQ;
    perCoinLiqLTV[item.id] = liqLTV;
    weightedSum += item.amount * item.price * liqLTV;
  }

  // Weighted average: each coin contributes proportionally to its USD weight
  const effectiveLiqLTV = totalCollateral > 0 ? weightedSum / totalCollateral : DEFAULT_LIQ;
  const weightedAvgLiqLTV = Math.round(effectiveLiqLTV * 100) / 100;

  // Default slider value: 92 (user adjusts manually)
  const liquidationLTV = 92;

  // Margin call: use the lowest per-coin value (earliest warning)
  let marginCallLTV = 100;
  for (const [coin, data] of Object.entries(collateralDataMap)) {
    if (data.marginCallLTV < marginCallLTV) marginCallLTV = data.marginCallLTV;
  }
  if (marginCallLTV === 100) marginCallLTV = 87; // default fallback
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
export function useBybitSync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const syncLoansFromBybit = useCallback(async () => {
    setIsSyncing(true);
    setSyncError(null);
    try {
      const [position, flexibleLoans] = await Promise.all([
        fetchCryptoLoanPosition(),
        fetchOngoingFlexibleLoans(),
      ]);

      // Fetch LTV thresholds per collateral coin from legacy endpoint
      const collateralCoins = (position.collateralList || []).map(c => c.currency);
      const collateralResults = await Promise.all(
        collateralCoins.map(coin => fetchCollateralData(coin).catch(() => []))
      );

      const collateralDataMap: Record<string, { initialLTV: number; marginCallLTV: number; liquidationLTV: number }> = {};
      collateralCoins.forEach((coin, i) => {
        const items = collateralResults[i];
        // Find the entry matching this coin (flexible loan type)
        const match = items.find(item => item.currency === coin);
        if (match) {
          collateralDataMap[coin] = {
            initialLTV: (parseFloat(match.initialLTV) || 0.80) * 100,
            marginCallLTV: (parseFloat(match.marginCallLTV) || 0.87) * 100,
            liquidationLTV: (parseFloat(match.liquidationLTV) || 0.92) * 100,
          };
        }
      });

      const mapped = mapBybitToExchangeData(position, flexibleLoans, collateralDataMap);
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
    syncLoansFromBybit,
    isSyncing,
    lastSyncedAt,
    syncError,
    clearError,
  } as const;
}
