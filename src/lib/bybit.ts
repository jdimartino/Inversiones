// ─── Bybit V5 API Client ──────────────────────────────────────────
// Solo endpoints de lectura — no ejecuta trades ni préstamos

const BYBIT_BASE = 'https://api.bybit.com';
const API_KEY = process.env.REACT_APP_BYBIT_API_KEY || '';
const API_SECRET = process.env.REACT_APP_BYBIT_API_SECRET || '';

// ─── HMAC-SHA256 signing (Web Crypto API) ─────────────────────────
async function hmacSign(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─── Signed GET request ───────────────────────────────────────────
async function signedGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  if (!API_KEY || !API_SECRET) {
    throw new Error('Bybit API keys no configuradas (REACT_APP_BYBIT_API_KEY / REACT_APP_BYBIT_API_SECRET)');
  }

  const timestamp = Date.now().toString();
  const recvWindow = '5000';
  const queryString = new URLSearchParams(params).toString();
  const signStr = timestamp + API_KEY + recvWindow + queryString;
  const sign = await hmacSign(API_SECRET, signStr);

  const url = `${BYBIT_BASE}${path}${queryString ? '?' + queryString : ''}`;

  const res = await fetch(url, {
    headers: {
      'X-BAPI-API-KEY': API_KEY,
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-SIGN': sign,
      'X-BAPI-RECV-WINDOW': recvWindow,
    },
  });

  if (!res.ok) {
    throw new Error(`Bybit API ${res.status}: ${res.statusText}`);
  }

  const data = await res.json();

  if (data.retCode !== 0) {
    throw new Error(`Bybit error ${data.retCode}: ${data.retMsg}`);
  }

  return data.result as T;
}

// ─── Types ────────────────────────────────────────────────────────
export interface FlexibleLoanItem {
  hourlyInterestRate: string;
  loanCurrency: string;
  totalDebt: string;
  unpaidAmount: string;
  unpaidInterest: string;
}

export interface BorrowItem {
  fixedTotalDebt: string;
  fixedTotalDebtUSD: string;
  flexibleHourlyInterestRate: string;
  flexibleTotalDebt: string;
  flexibleTotalDebtUSD: string;
  loanCurrency: string;
}

export interface CollateralItem {
  amount: string;
  amountUSD: string;
  colRes: string;
  currency: string;
}

export interface CryptoLoanPosition {
  borrowList: BorrowItem[];
  collateralList: CollateralItem[];
  ltv: string;
  supplyList: unknown[];
  totalCollateral: string;
  totalDebt: string;
  totalSupply: string;
}

export interface WalletCoinBalance {
  coin: string;
  walletBalance: string;
  equity: string;
  usdValue: string;
  borrowAmount: string;
  accruedInterest: string;
  unrealisedPnl: string;
}

export interface WalletBalance {
  totalEquity: string;
  totalWalletBalance: string;
  coin: WalletCoinBalance[];
}

// ─── Collateral Data Types ────────────────────────────────────────
export interface LoanCollateralData {
  currency: string;
  initialLTV: string;
  marginCallLTV: string;
  liquidationLTV: string;
  maxLimit: string;
}

// ─── API Functions ────────────────────────────────────────────────

/**
 * Fetch ongoing flexible loans (new endpoint, not deprecated)
 * GET /v5/crypto-loan-flexible/ongoing-coin
 */
export async function fetchOngoingFlexibleLoans(): Promise<FlexibleLoanItem[]> {
  const result = await signedGet<{ list: FlexibleLoanItem[] }>(
    '/v5/crypto-loan-flexible/ongoing-coin'
  );
  return result.list || [];
}

/**
 * Fetch complete crypto loan position (debts + collateral + LTV)
 * GET /v5/crypto-loan-common/position
 */
export async function fetchCryptoLoanPosition(): Promise<CryptoLoanPosition> {
  return signedGet<CryptoLoanPosition>('/v5/crypto-loan-common/position');
}

/**
 * Fetch wallet balance (UNIFIED account)
 * GET /v5/account/wallet-balance
 */
export async function fetchWalletBalance(): Promise<WalletBalance> {
  const result = await signedGet<{ list: WalletBalance[] }>(
    '/v5/account/wallet-balance',
    { accountType: 'UNIFIED' }
  );
  return result.list?.[0] || { totalEquity: '0', totalWalletBalance: '0', coin: [] };
}

/**
 * Fetch collateral LTV thresholds per coin (legacy endpoint)
 * GET /v5/crypto-loan/collateral-data
 * Returns initialLTV, marginCallLTV, liquidationLTV per collateral coin
 */
export async function fetchCollateralData(currency: string): Promise<LoanCollateralData[]> {
  const result = await signedGet<{ vipCoinList: { list: LoanCollateralData[] }[] }>(
    '/v5/crypto-loan/collateral-data',
    { currency }
  );
  return result.vipCoinList?.[0]?.list || [];
}
