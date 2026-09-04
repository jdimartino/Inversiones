import { useState, useCallback } from "react";
import { FIREBASE_FUNCTIONS_URL } from "../lib/firebase";
import type { ExchangeLiqData } from "./useLiquidationData";

// ─── Tipos de la respuesta de la Cloud Function ───────────────────
interface BybitPosition {
  borrowList: Array<{
    flexibleHourlyInterestRate: string;
    flexibleTotalDebt: string;
    flexibleTotalDebtUSD: string;
    loanCurrency: string;
  }>;
  collateralList: Array<{
    amount: string;
    amountUSD: string;
    currency: string;
  }>;
  ltv: string;
  totalCollateral: string;
  totalDebt: string;
}

interface BybitFlexibleLoan {
  hourlyInterestRate: string;
  loanCurrency: string;
  totalDebt: string;
  unpaidInterest: string;
}

interface BybitCollateralEntry {
  currency: string;
  initialLTV: string;
  marginCallLTV: string;
  liquidationLTV: string;
}

interface BybitSyncResponse {
  position: BybitPosition | null;
  flexibleLoans: BybitFlexibleLoan[];
  collateralData: Record<string, BybitCollateralEntry[]>;
}

// ─── Generador de IDs ─────────────────────────────────────────────
const generateId = (): string => {
  if (typeof window !== "undefined" && window.crypto && "randomUUID" in window.crypto) {
    return (window.crypto as any).randomUUID();
  }
  return Math.random().toString(36).substring(2, 15);
};

// ─── Conversión: API Bybit → Formato de la app ───────────────────
function mapBybitToExchangeData(
  position: BybitPosition,
  flexibleLoans: BybitFlexibleLoan[],
  collateralDataMap: Record<string, { initialLTV: number; marginCallLTV: number; liquidationLTV: number }>
): Partial<ExchangeLiqData> {
  const now = Date.now();

  // ── Debts ──────────────────────────────────────────────────────
  const debts = (position.borrowList || []).map((item) => {
    const hourlyRate = parseFloat(item.flexibleHourlyInterestRate) || 0;
    const apy = hourlyRate * 24 * 365 * 100;
    const flexLoan = flexibleLoans.find(f => f.loanCurrency === item.loanCurrency);

    // Usar flexibleTotalDebtUSD si está disponible, si no calcular
    const amountUSD = parseFloat(item.flexibleTotalDebtUSD) || 0;
    const amountCoin = parseFloat(item.flexibleTotalDebt) || 0;

    // Para Bybit, las monedas de préstamo son USDT/USDC (stablecoins)
    // price = 1.0 es correcto para stablecoins
    const price = 1.0;

    return {
      _id: generateId(),
      id: item.loanCurrency,
      amount: amountCoin,
      price,
      rate: parseFloat(apy.toFixed(2)),
      hourlyRate,
      synced: true,
      lastSyncAt: now,
      accruedInterest: flexLoan ? parseFloat(flexLoan.unpaidInterest) || 0 : 0,
      amountUSD: amountUSD > 0 ? amountUSD : amountCoin * price,
    };
  });

  // ── Collateral ─────────────────────────────────────────────────
  const collateral = (position.collateralList || []).map((item) => {
    const amount = parseFloat(item.amount) || 0;
    const amountUSD = parseFloat(item.amountUSD) || 0;

    // price = amountUSD/amount = precio ajustado (haircut) para cálculos de LTV
    const price = amount > 0 ? amountUSD / amount : 0;

    return {
      _id: generateId(),
      id: item.currency,
      amount,
      price,
      synced: true,
      lastSyncAt: now,
      marketPrice: price, // Se actualizará con precio real cuando se obtenga
      marketValueUSD: amountUSD, // temporal, se ajustará con precio real
      adjustedValueUSD: amountUSD, // valor ajustado para LTV (amountUSD del API)
    };
  });

  // ── Agregados del exchange (datos oficiales del API) ───────────
  const totalDebt = parseFloat(position.totalDebt) || 0;
  const totalCollateral = parseFloat(position.totalCollateral) || 0;
  const ltvFromExchange = parseFloat(position.ltv) * 100;

  // ── Per-coin thresholds (datos reales del API legacy) ──────────
  const perCoinLiqLTV: Record<string, number> = {};
  const perCoinMarginCallLTV: Record<string, number> = {};
  const perCoinInitialLTV: Record<string, number> = {};

  for (const [coin, entries] of Object.entries(collateralDataMap)) {
    perCoinLiqLTV[coin] = entries.liquidationLTV;
    perCoinMarginCallLTV[coin] = entries.marginCallLTV;
    perCoinInitialLTV[coin] = entries.initialLTV;
  }

  // ── Blended liquidation LTV (estimación ponderada) ─────────────
  // IMPORTANTE: esto NO es un dato oficial del exchange
  const DEFAULT_LIQ = 92;
  let weightedSumLiq = 0;
  let weightedSumMC = 0;
  let totalWeight = 0;

  for (const item of collateral) {
    const liqLTV = perCoinLiqLTV[item.id] ?? DEFAULT_LIQ;
    const mcLTV = perCoinMarginCallLTV[item.id] ?? 87;
    // Usar valor ajustado (el que Bybit usa para LTV)
    const weight = item.adjustedValueUSD ?? (item.amount * item.price);
    weightedSumLiq += weight * liqLTV;
    weightedSumMC += weight * mcLTV;
    totalWeight += weight;
  }

  const blendedLiqLTV = totalWeight > 0 ? Math.round((weightedSumLiq / totalWeight) * 100) / 100 : DEFAULT_LIQ;
  const blendedMarginCallLTV = totalWeight > 0 ? Math.round((weightedSumMC / totalWeight) * 100) / 100 : 87;

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
export function useBybitSync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const syncLoansFromBybit = useCallback(async () => {
    setIsSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch(`${FIREBASE_FUNCTIONS_URL}/syncBybitLoans`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data: BybitSyncResponse = await res.json();
      if ((data as any).error) throw new Error((data as any).error);

      if (!data.position) {
        throw new Error("No se pudo obtener la posición de Bybit");
      }

      // Construir collateralDataMap desde la respuesta de la cloud function
      const collateralDataMap: Record<string, { initialLTV: number; marginCallLTV: number; liquidationLTV: number }> = {};
      for (const [coin, entries] of Object.entries(data.collateralData || {})) {
        const match = entries.find((item) => item.currency === coin);
        if (match) {
          collateralDataMap[coin] = {
            initialLTV: (parseFloat(match.initialLTV) || 0.80) * 100,
            marginCallLTV: (parseFloat(match.marginCallLTV) || 0.87) * 100,
            liquidationLTV: (parseFloat(match.liquidationLTV) || 0.92) * 100,
          };
        }
      }

      const mapped = mapBybitToExchangeData(data.position, data.flexibleLoans, collateralDataMap);
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
