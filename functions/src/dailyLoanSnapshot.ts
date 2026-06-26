import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import axios from "axios";
import { defineSecret } from "firebase-functions/params";
import { binanceRequest, bybitRequest } from "./apiClients";

const configRaw = defineSecret("FUNCTIONS_CONFIG_EXPORT");

function db() {
  return admin.firestore();
}

// ─── Snapshot interfaces ──────────────────────────────────────────

interface SnapshotDebt {
  id: string;
  amount: number;
  hourlyRate: number;
  rate: number;
  accruedInterest: number;
}

interface SnapshotCollateral {
  id: string;
  amount: number;
  price: number;
  valueUSD: number;
}

interface ExchangeSnapshot {
  debts: SnapshotDebt[];
  collateral: SnapshotCollateral[];
  totalDebt: number;
  totalCollateral: number;
  ltvFromExchange: number;
}

interface LoanSnapshotDoc {
  date: string;
  timestamp: number;
  bybit: ExchangeSnapshot;
  binance: ExchangeSnapshot;
}

// ─── Binance data fetcher ─────────────────────────────────────────

async function fetchBinanceLoanData(
  apiKey: string,
  apiSecret: string,
  prices: Record<string, number>
): Promise<ExchangeSnapshot> {
  const [ongoing, loanable] = await Promise.all([
    binanceRequest("/sapi/v2/loan/flexible/ongoing/orders", "GET", {}, apiKey, apiSecret)
      .catch(() => ({ rows: [] })),
    binanceRequest("/sapi/v2/loan/flexible/loanable/data", "GET", {}, apiKey, apiSecret)
      .catch(() => ({ rows: [] })),
  ]);

  const ongoingRows = ongoing.rows || [];
  const loanableRows = loanable.rows || [];

  // Agrupar deudas por loanCoin
  const debtMap: Record<string, number> = {};
  const collateralMap: Record<string, number> = {};

  for (const row of ongoingRows) {
    const loanCoin = row.loanCoin;
    const amount = parseFloat(row.totalDebt) || 0;
    if (amount > 0) {
      debtMap[loanCoin] = (debtMap[loanCoin] || 0) + amount;
    }

    const collCoin = row.collateralCoin;
    const collAmount = parseFloat(row.collateralAmount) || 0;
    if (collAmount > 0) {
      collateralMap[collCoin] = (collateralMap[collCoin] || 0) + collAmount;
    }
  }

  const debts: SnapshotDebt[] = Object.entries(debtMap).map(([coin, amount]) => {
    const loanData = loanableRows.find((l: any) => l.loanCoin === coin);
    const yearlyRate = parseFloat(loanData?.flexibleYearlyInterestRate || "0") * 100;
    const dailyRate = parseFloat(loanData?.flexibleDailyInterestRate || "0");
    const hourlyRate = dailyRate / 24;
    return {
      id: coin,
      amount,
      hourlyRate,
      rate: parseFloat(yearlyRate.toFixed(2)),
      accruedInterest: 0,
    };
  });

  const collateral: SnapshotCollateral[] = Object.entries(collateralMap).map(([coin, amount]) => {
    const price = prices[coin] || 0;
    return {
      id: coin,
      amount,
      price,
      valueUSD: amount * price,
    };
  });

  const totalDebt = debts.reduce((sum, d) => sum + d.amount, 0);
  const totalCollateral = collateral.reduce((sum, c) => sum + c.valueUSD, 0);

  let ltvFromExchange = 0;
  if (ongoingRows.length > 0) {
    const weightedSum = ongoingRows.reduce((sum: number, row: any) => {
      const ltv = parseFloat(row.currentLTV) || 0;
      const debt = parseFloat(row.totalDebt) || 0;
      return sum + ltv * debt;
    }, 0);
    const totalDebtRaw = ongoingRows.reduce((sum: number, row: any) => sum + (parseFloat(row.totalDebt) || 0), 0);
    ltvFromExchange = totalDebtRaw > 0 ? (weightedSum / totalDebtRaw) * 100 : 0;
  }

  return { debts, collateral, totalDebt, totalCollateral, ltvFromExchange };
}

// ─── Bybit data fetcher ───────────────────────────────────────────

async function fetchBybitLoanData(
  apiKey: string,
  apiSecret: string,
  prices: Record<string, number>
): Promise<ExchangeSnapshot> {
  const [position, flexibleLoans] = await Promise.all([
    bybitRequest<any>("/v5/crypto-loan-common/position", {}, apiKey, apiSecret).catch(() => null),
    bybitRequest<{ list: any[] }>("/v5/crypto-loan-flexible/ongoing-coin", {}, apiKey, apiSecret).catch(() => ({ list: [] })),
  ]);

  if (!position) {
    return { debts: [], collateral: [], totalDebt: 0, totalCollateral: 0, ltvFromExchange: 0 };
  }

  const debts: SnapshotDebt[] = (position.borrowList || []).map((item: any) => {
    const hourlyRate = parseFloat(item.flexibleHourlyInterestRate) || 0;
    const apy = hourlyRate * 24 * 365 * 100;
    const flexLoan = (flexibleLoans?.list || []).find((f: any) => f.loanCurrency === item.loanCurrency);
    return {
      id: item.loanCurrency,
      amount: parseFloat(item.flexibleTotalDebt) || 0,
      hourlyRate,
      rate: parseFloat(apy.toFixed(2)),
      accruedInterest: flexLoan ? parseFloat(flexLoan.unpaidInterest) || 0 : 0,
    };
  });

  const collateral: SnapshotCollateral[] = (position.collateralList || []).map((item: any) => {
    const amount = parseFloat(item.amount) || 0;
    const amountUSD = parseFloat(item.amountUSD) || 0;
    const price = amount > 0 ? amountUSD / amount : (prices[item.currency] || 0);
    return {
      id: item.currency,
      amount,
      price,
      valueUSD: amountUSD,
    };
  });

  const totalDebt = parseFloat(position.totalDebt) || 0;
  const totalCollateral = parseFloat(position.totalCollateral) || 0;
  const ltvFromExchange = parseFloat(position.ltv) * 100;

  return { debts, collateral, totalDebt, totalCollateral, ltvFromExchange };
}

// ─── Price fetcher ────────────────────────────────────────────────

async function fetchPrices(coins: string[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = { USDT: 1, USDC: 1 };
  if (coins.length === 0) return prices;

  const symbols = coins.map((c) => `${c}USDT`);
  const param = JSON.stringify(symbols);
  const url = `https://api.binance.com/api/v3/ticker/price?symbols=${encodeURIComponent(param)}`;

  try {
    const { data } = await axios.get(url, { timeout: 10000 });
    for (const ticker of data) {
      const coin = ticker.symbol.replace("USDT", "");
      prices[coin] = parseFloat(ticker.price);
    }
  } catch (e) {
    console.error("[dailyLoanSnapshot] Price fetch error:", e);
  }

  return prices;
}

// ─── Main snapshot function ───────────────────────────────────────

async function runDailyLoanSnapshot(): Promise<void> {
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Caracas",
  });

  const existing = await db().collection("loanSnapshots").doc(today).get();
  if (existing.exists) {
    console.log(`[loanSnapshot] Ya existe para ${today}, salteando.`);
    return;
  }

  const raw = configRaw.value();
  const config = JSON.parse(raw);

  const bybitConfig = config.bybit || {};
  const binanceConfig = config.binance || {};

  const bybitApiKey = bybitConfig.api_key;
  const bybitApiSecret = bybitConfig.api_secret;
  const binanceApiKey = binanceConfig.api_key;
  const binanceApiSecret = binanceConfig.api_secret;

  // Fetch Bybit data first to get collateral coins for price fetching
  let bybitData: ExchangeSnapshot = { debts: [], collateral: [], totalDebt: 0, totalCollateral: 0, ltvFromExchange: 0 };
  let binanceData: ExchangeSnapshot = { debts: [], collateral: [], totalDebt: 0, totalCollateral: 0, ltvFromExchange: 0 };

  try {
    if (bybitApiKey && bybitApiSecret) {
      // Get collateral coins from Bybit position to know which prices to fetch
      const position = await bybitRequest<any>("/v5/crypto-loan-common/position", {}, bybitApiKey, bybitApiSecret).catch(() => null);
      const bybitCollateralCoins = position?.collateralList?.map((c: any) => c.currency) || [];

      // Get Binance collateral coins
      const binanceOngoing = binanceApiKey && binanceApiSecret
        ? await binanceRequest("/sapi/v2/loan/flexible/ongoing/orders", "GET", {}, binanceApiKey, binanceApiSecret).catch(() => ({ rows: [] }))
        : { rows: [] };
      const binanceCollateralCoins = (binanceOngoing.rows || []).map((r: any) => r.collateralCoin);

      const allCoins = [...new Set([...bybitCollateralCoins, ...binanceCollateralCoins])];
      const prices = await fetchPrices(allCoins);

      if (bybitApiKey && bybitApiSecret) {
        bybitData = await fetchBybitLoanData(bybitApiKey, bybitApiSecret, prices);
      }
      if (binanceApiKey && binanceApiSecret) {
        binanceData = await fetchBinanceLoanData(binanceApiKey, binanceApiSecret, prices);
      }
    }
  } catch (e) {
    console.error("[loanSnapshot] Error fetching data:", e);
  }

  const snapshot: LoanSnapshotDoc = {
    date: today,
    timestamp: Date.now(),
    bybit: bybitData,
    binance: binanceData,
  };

  await db().collection("loanSnapshots").doc(today).set(snapshot);
  console.log(`[loanSnapshot] Guardado para ${today}`);
}

// ─── Exported functions ───────────────────────────────────────────

export const dailyLoanSnapshot = functions
  .region("europe-west1")
  .runWith({ secrets: ["FUNCTIONS_CONFIG_EXPORT"] })
  .pubsub.schedule("0 0 * * *")
  .timeZone("America/Caracas")
  .onRun(async () => {
    try {
      await runDailyLoanSnapshot();
    } catch (e) {
      console.error("[loanSnapshot] Error:", e);
    }
  });

export const testDailyLoanSnapshot = functions
  .region("europe-west1")
  .runWith({ secrets: ["FUNCTIONS_CONFIG_EXPORT"] })
  .https.onRequest(async (_req, res) => {
    try {
      await runDailyLoanSnapshot();
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
