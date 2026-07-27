// ─── Loan History Types ───────────────────────────────────────────

export interface LoanSnapshotDebt {
  id: string;
  amount: number;
  hourlyRate: number;
  rate: number;
  accruedInterest: number;
  interestMTD?: number;
}

export interface LoanSnapshotCollateral {
  id: string;
  amount: number;
  price: number;
  valueUSD: number;
}

export interface ExchangeSnapshot {
  debts: LoanSnapshotDebt[];
  collateral: LoanSnapshotCollateral[];
  totalDebt: number;
  totalCollateral: number;
  ltvFromExchange: number;
}

export interface LoanSnapshot {
  date: string;
  timestamp: number;
  bybit: ExchangeSnapshot;
  binance: ExchangeSnapshot;
  totalInterestMTD?: { bybit: number; binance: number };
}

export interface MonthlyInterestSummary {
  month: string;
  label: string;
  realAccumulated: number;
  estimatedEndOfMonth: number;
  avgDailyRate: number;
  daysRecorded: number;
}

export interface DaySnapshot {
  date: string;
  dia: number;
  deuda: number;
  colateral: number;
  ltv: number;
  interesesDiarios: number;
  interesesAcumulados: number;
}

// ─── Calculation Functions ────────────────────────────────────────

/** Calculate estimated daily interest from a snapshot's debts */
function calcDailyInterest(debts: LoanSnapshotDebt[]): number {
  return debts.reduce((sum, d) => {
    if (!d.hourlyRate || !d.amount) return sum;
    return sum + d.amount * d.hourlyRate * 24;
  }, 0);
}

/**
 * Calculate real accumulated interest for an exchange over a month of snapshots.
 * Strategy:
 * 1. Use totalInterestMTD from the latest snapshot if > 0 (most reliable)
 * 2. Otherwise, sum daily interest from hourlyRate * amount * 24 for each day
 */
export function calculateRealInterest(
  snapshots: LoanSnapshot[],
  exchange: 'bybit' | 'binance'
): number {
  if (snapshots.length === 0) return 0;

  // Try to use the latest totalInterestMTD if it's a real value
  const lastSnapshot = snapshots[snapshots.length - 1];
  if (lastSnapshot.totalInterestMTD && lastSnapshot.totalInterestMTD[exchange] > 0) {
    return lastSnapshot.totalInterestMTD[exchange];
  }

  // Fallback: find the latest non-zero totalInterestMTD
  for (let i = snapshots.length - 1; i >= 0; i--) {
    const mtd = snapshots[i].totalInterestMTD?.[exchange];
    if (mtd && mtd > 0) return mtd;
  }

  // Last fallback: sum estimated daily interest from hourlyRate * amount * 24
  return snapshots.reduce((sum, snap) => sum + calcDailyInterest(snap[exchange].debts), 0);
}

/**
 * Estimate end-of-month interest.
 * Uses the average daily interest from recorded days, projected over remaining days.
 */
export function estimateEndOfMonthInterest(
  snapshots: LoanSnapshot[],
  exchange: 'bybit' | 'binance'
): number {
  if (snapshots.length === 0) return 0;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const hoursIntoMonth = (now.getTime() - startOfMonth.getTime()) / (1000 * 60 * 60);
  const hoursInMonth = (endOfMonth.getTime() - startOfMonth.getTime()) / (1000 * 60 * 60);

  if (hoursIntoMonth >= hoursInMonth) return 0;

  // Average daily interest from all recorded snapshots
  const avgDaily = snapshots.reduce((sum, snap) => sum + calcDailyInterest(snap[exchange].debts), 0) / snapshots.length;

  // Remaining days in month (fractional)
  const remainingDays = (hoursInMonth - hoursIntoMonth) / 24;

  return calculateRealInterest(snapshots, exchange) + avgDaily * remainingDays;
}

/**
 * Calculate average daily interest rate across snapshots.
 */
export function calculateAvgDailyRate(
  snapshots: LoanSnapshot[],
  exchange: 'bybit' | 'binance'
): number {
  if (snapshots.length === 0) return 0;

  const totalRate = snapshots.reduce((sum, snap) => {
    const dayRate = snap[exchange].debts.reduce((dSum, debt) => dSum + (debt.hourlyRate * 24), 0);
    return sum + dayRate;
  }, 0);

  return totalRate / snapshots.length;
}

/**
 * Convert snapshots to chart-ready day-by-day data.
 * Computes daily interest from hourlyRate * amount * 24 when totalInterestMTD is not available.
 */
export function snapshotsToChartData(
  snapshots: LoanSnapshot[],
  exchange: 'bybit' | 'binance'
): DaySnapshot[] {
  let accumulated = 0;

  return snapshots.map((snap, index) => {
    const data = snap[exchange];

    // Daily interest: use estimated from rates
    const dailyInterest = calcDailyInterest(data.debts);
    accumulated += dailyInterest;

    const date = new Date(snap.date + "T12:00:00");
    const dia = date.getDate();

    return {
      date: snap.date,
      dia,
      deuda: data.totalDebt,
      colateral: data.totalCollateral,
      ltv: data.ltvFromExchange,
      interesesDiarios: dailyInterest,
      interesesAcumulados: accumulated,
    };
  });
}

/**
 * Get month label in Spanish.
 */
export function getMonthLabel(month: string): string {
  const [year, m] = month.split("-");
  const monthNames = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];
  return `${monthNames[parseInt(m) - 1]} ${year}`;
}

/**
 * Get current month as "YYYY-MM".
 */
export function getCurrentMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * Get previous month as "YYYY-MM".
 */
export function getPreviousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  const ny = d.getFullYear();
  const nm = String(d.getMonth() + 1).padStart(2, "0");
  return `${ny}-${nm}`;
}

/**
 * Get next month as "YYYY-MM".
 */
export function getNextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m, 1);
  const ny = d.getFullYear();
  const nm = String(d.getMonth() + 1).padStart(2, "0");
  return `${ny}-${nm}`;
}

/**
 * Check if a month is in the future.
 */
export function isFutureMonth(month: string): boolean {
  return month > getCurrentMonth();
}
