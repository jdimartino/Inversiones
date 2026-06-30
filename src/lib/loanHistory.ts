// ─── Loan History Types ───────────────────────────────────────────

export interface LoanSnapshotDebt {
  id: string;
  amount: number;
  hourlyRate: number;
  rate: number;
  accruedInterest: number;
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

/**
 * Calculate real accumulated interest for an exchange over a month of snapshots.
 * Uses the difference in accruedInterest between first and last snapshot.
 */
export function calculateRealInterest(
  snapshots: LoanSnapshot[],
  exchange: 'bybit' | 'binance'
): number {
  if (snapshots.length < 2) {
    if (snapshots.length === 1) {
      return snapshots[0][exchange].debts.reduce((sum, d) => sum + d.accruedInterest, 0);
    }
    return 0;
  }

  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];

  const firstInterest = first[exchange].debts.reduce((sum, d) => sum + d.accruedInterest, 0);
  const lastInterest = last[exchange].debts.reduce((sum, d) => sum + d.accruedInterest, 0);

  return lastInterest - firstInterest;
}

/**
 * Estimate end-of-month interest using current hourly rates and remaining hours.
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

  const lastSnapshot = snapshots[snapshots.length - 1];
  const remainingHours = hoursInMonth - hoursIntoMonth;

  return lastSnapshot[exchange].debts.reduce((sum, debt) => {
    if (!debt.hourlyRate) return sum;
    const principal = debt.amount - debt.accruedInterest;
    return sum + principal * (Math.pow(1 + debt.hourlyRate, remainingHours) - 1);
  }, 0);
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
 */
export function snapshotsToChartData(
  snapshots: LoanSnapshot[],
  exchange: 'bybit' | 'binance'
): DaySnapshot[] {
  return snapshots.map((snap, index) => {
    const data = snap[exchange];
    const totalAccrued = data.debts.reduce((sum, d) => sum + d.accruedInterest, 0);

    // Interés del día = hoy - ayer (si es el primer día, es el interés mismo)
    const prevSnapshot = index > 0 ? snapshots[index - 1] : null;
    const prevAccrued = prevSnapshot 
      ? prevSnapshot[exchange].debts.reduce((sum, d) => sum + d.accruedInterest, 0)
      : 0;

    const date = new Date(snap.date + "T12:00:00");
    const dia = date.getDate();

    // Sin snapshot previo no podemos calcular el interés del día
    const interesesDiarios = prevSnapshot 
      ? Math.max(0, totalAccrued - prevAccrued)
      : 0;

    return {
      date: snap.date,
      dia,
      deuda: data.totalDebt,
      colateral: data.totalCollateral,
      ltv: data.ltvFromExchange,
      interesesDiarios,
      interesesAcumulados: totalAccrued,
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
