import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import axios from "axios";
import * as crypto from "crypto";
import { defineSecret } from "firebase-functions/params";
import { binanceRequest, bybitRequest } from "./apiClients";
import { analyzeMarket } from "./analyzeMarket";
import { signBinanceRequest } from "./signBinanceRequest";

admin.initializeApp();
const db = admin.firestore();

// ─── Types ────────────────────────────────────────────────────────────────────
interface AlertRule {
    type?: 'pnl' | 'price';
    targetPercent?: number;
    targetValue?: number;
    isPersistent?: boolean;
    direction?: 'up' | 'down';
    note?: string;
    _lastSide?: 'above' | 'below';
}

interface GlobalAlertRule {
    targetAmount: number;
    isPersistent?: boolean;
    direction?: 'up' | 'down';
    note?: string;
    _lastSide?: 'above' | 'below';
}

interface WatchlistAlertRule {
    targetValue: number;
    direction: 'up' | 'down';
    isPersistent?: boolean;
    note?: string;
    _lastSide?: 'above' | 'below';
}

interface CandleAlertRule {
    type: 'candle_change';
    interval: '4h' | '1d';
    targetPercent: number;
    direction: 'up' | 'down';
    isPersistent?: boolean;
    note?: string;
    _lastSide?: 'above' | 'below';
    _lastCandleOpenTime?: number;
}

// ─── Utils ────────────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const fmt = (n: number): string => new Intl.NumberFormat('en-US').format(Math.round(n));
const pnlSign = (n: number): string => n >= 0 ? "+" : "";
const pnlEmoji = (pnl: number): string => pnl >= 0 ? "🟢" : "🔴";
const fmtPrice = (price: number): string => {
    const dec = Math.abs(price) < 1 ? 4 : 2;
    return `$${price.toLocaleString("en-US", {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
    })}`;
};

async function sendTelegram(text: string): Promise<boolean> {
    const token = process.env.TELEGRAM_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return false;

    const payload = { chat_id: chatId, text, parse_mode: "Markdown", disable_web_page_preview: true };
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const resp = await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, payload);
            console.log(`[Telegram] Mensaje enviado OK (status ${resp.status}, attempt ${attempt})`);
            return true;
        } catch (e: any) {
            if (attempt < 3) await sleep(2000 * attempt);
        }
    }
    return false;
}

// ─── Helper: Normalización ───────────────────────────────────────────────────
function normalizeAlerts(raw: Record<string, unknown>): Record<string, AlertRule[]> {
    const normalized: Record<string, AlertRule[]> = {};
    for (const [id, value] of Object.entries(raw)) {
        let alertsArray: AlertRule[] = Array.isArray(value) ? value : (value ? [value as AlertRule] : []);
        normalized[id] = alertsArray.map(alert => ({
            ...alert,
            type: alert.type || (typeof alert.targetValue === 'number' ? 'price' : 'pnl'),
            direction: alert.direction || (alert.type === 'pnl' ? ((alert.targetPercent || 0) >= 0 ? 'up' : 'down') : 'up')
        }));
    }
    return normalized;
}

function normalizeGlobalAlerts(rawArray: any[]): GlobalAlertRule[] {
    if (!Array.isArray(rawArray)) return [];
    return rawArray.map(alert => ({
        ...alert,
        direction: alert.direction || (alert.targetAmount >= 0 ? 'up' : 'down')
    }));
}

// ─── Core: Alertas ────────────────────────────────────────────────────────────
async function runCheckAlerts() {
    console.log("[v2.3] Iniciando comprobación de alertas...");
    const SYMBOL_MAP: Record<string, string> = {
        BTC: "BTCUSDT", ETH: "ETHUSDT", ADA: "ADAUSDT", DOGE: "DOGEUSDT",
        LTC: "LTCUSDT", BNB: "BNBUSDT", SOL: "SOLUSDT", XRP: "XRPUSDT",
        DOT: "DOTUSDT", MATIC: "MATICUSDT", SHIB: "SHIBUSDT", AVAX: "AVAXUSDT",
        LINK: "LINKUSDT",
    };
    const symbols = Object.values(SYMBOL_MAP);
    const { data: tickerData } = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbols=${encodeURIComponent(JSON.stringify(symbols))}`);
    const prices: Record<string, number> = {};
    const reverseMap = Object.fromEntries(Object.entries(SYMBOL_MAP).map(([k, v]) => [v, k]));
    for (const item of tickerData) {
        prices[item.symbol] = parseFloat(item.price);
        const coin = reverseMap[item.symbol];
        if (coin) prices[`${coin}USDT`] = parseFloat(item.price);
    }

    const configSnap = await db.collection("config").doc("alerts").get();
    let investmentAlerts: Record<string, AlertRule[]> = {};
    let globalAlerts: GlobalAlertRule[] = [];
    let watchlistAlerts: Record<string, WatchlistAlertRule[]> = {};
    let candleAlerts: Record<string, CandleAlertRule[]> = {};
    let saleMeta: Record<string, any> = {};

    if (configSnap.exists) {
        const conf = configSnap.data()!;
        if (conf.globalAlerts) globalAlerts = normalizeGlobalAlerts(conf.globalAlerts);
        if (conf.investmentAlerts) investmentAlerts = normalizeAlerts(conf.investmentAlerts);
        if (conf.watchlistAlerts) {
            for (const [c, a] of Object.entries(conf.watchlistAlerts)) if (Array.isArray(a)) watchlistAlerts[c] = a as WatchlistAlertRule[];
        }
        if (conf.candleAlerts) {
            for (const [c, a] of Object.entries(conf.candleAlerts)) if (Array.isArray(a)) candleAlerts[c] = a as CandleAlertRule[];
        }
        if (conf.saleMeta) saleMeta = conf.saleMeta;
    }

    const dbUpdates: any = {};
    const triggeredIndividualMessages: string[] = [];
    const snap = await db.collection("inversiones").get();
    const ventasSnap = await db.collection("ventas").get();
    const activeSaleIds = new Set(ventasSnap.docs.map(d => `sale_${d.id}`));

    let totalInvested = 0, totalCurrentValue = 0;
    const individualAssets: any[] = [];

    snap.forEach((docSnap) => {
        const inv = docSnap.data();
        const symbol = `${inv.coin}USDT`;
        const currentPrice = prices[symbol] || 0;
        const qty = parseFloat(inv.quantity) || 0;
        const invested = parseFloat(inv.invested) || 0;
        const currentValue = currentPrice * qty;
        totalInvested += invested;
        totalCurrentValue += currentValue;
        const pnl = currentValue - invested;
        const roiPercent = (invested > 0) ? (pnl / invested) * 100 : 0;

        const alertRules = investmentAlerts[docSnap.id];
        if (Array.isArray(alertRules) && alertRules.length > 0) {
            const remaining: AlertRule[] = [];
            let hasInvChanged = false;
            for (const rule of alertRules) {
                const type = rule.type || 'pnl';
                const target = type === 'pnl' ? (rule.targetPercent || 0) : (rule.targetValue || 0);
                const currentVal = type === 'pnl' ? roiPercent : currentPrice;
                const currentSide: 'above' | 'below' = currentVal >= target ? 'above' : 'below';
                const direction = rule.direction || (type === 'pnl' ? (target >= 0 ? 'up' : 'down') : 'up');

                let conditionMet = direction === 'up' ? currentVal >= target : currentVal <= target;
                const isTriggered = conditionMet && (!rule.isPersistent || rule._lastSide === undefined || rule._lastSide !== currentSide);

                if (isTriggered) {
                    triggeredIndividualMessages.push(
                        `🚀 *${inv.coin}* ${direction === 'up' ? 'subió' : 'cayó'} a *${type === 'pnl' ? pnlSign(roiPercent) + roiPercent.toFixed(1) + '%' : fmtPrice(currentPrice)}* (Meta: ${direction === 'up' ? '🔼' : '🔽'} ${type === 'pnl' ? target + '%' : fmtPrice(target)})` +
                        `\n${pnlEmoji(pnl)} PNL: ${pnlSign(pnl)}$${fmt(pnl)}` + (rule.note ? `\n_📝 ${rule.note}_` : "")
                    );
                    if (rule.isPersistent) { remaining.push({ ...rule, _lastSide: currentSide }); hasInvChanged = true; }
                    else hasInvChanged = true;
                } else {
                    if (rule.isPersistent && rule._lastSide !== currentSide) hasInvChanged = true;
                    remaining.push(rule.isPersistent ? { ...rule, _lastSide: currentSide } : rule);
                }
            }
            if (remaining.length === 0) { dbUpdates[`investmentAlerts.${docSnap.id}`] = admin.firestore.FieldValue.delete(); }
            else if (hasInvChanged) { dbUpdates[`investmentAlerts.${docSnap.id}`] = remaining; }
        }
        individualAssets.push({ id: docSnap.id, coin: inv.coin, pnl, roi: roiPercent });
    });

    // Cleanup & Sales Alerts (Simplificado)
    for (const [saleKey, rules] of Object.entries(investmentAlerts)) {
        if (!saleKey.startsWith('sale_')) continue;
        const meta = saleMeta[saleKey];
        if (!meta || !activeSaleIds.has(saleKey)) {
            dbUpdates[`investmentAlerts.${saleKey}`] = admin.firestore.FieldValue.delete();
            if (saleMeta[saleKey]) dbUpdates[`saleMeta.${saleKey}`] = admin.firestore.FieldValue.delete();
            continue;
        }
        const currentPrice = prices[`${meta.coin}USDT`] || 0;
        if (currentPrice === 0) continue;
        const roi = ((meta.usdtReceived - meta.quantity * currentPrice) / meta.usdtReceived) * 100;
        const remaining: AlertRule[] = [];
        let hasChanged = false;
        for (const rule of rules) {
            const target = rule.type === 'pnl' ? (rule.targetPercent || 0) : (rule.targetValue || 0);
            const currentVal = rule.type === 'pnl' ? roi : currentPrice;
            const currentSide: 'above' | 'below' = currentVal >= target ? 'above' : 'below';
            let conditionMet = rule.direction === 'up' ? currentVal >= target : currentVal <= target;
            if (conditionMet && (!rule.isPersistent || rule._lastSide !== currentSide)) {
                triggeredIndividualMessages.push(`💰 *${meta.coin}* (venta) ${rule.direction === 'up' ? 'alcanzó' : 'bajó'} *${rule.type === 'pnl' ? roi.toFixed(1) + '%' : fmtPrice(currentPrice)}*` + (rule.note ? `\n_📝 ${rule.note}_` : ""));
                if (rule.isPersistent) { remaining.push({ ...rule, _lastSide: currentSide }); hasChanged = true; }
                else hasChanged = true;
            } else {
                if (rule.isPersistent && rule._lastSide !== currentSide) hasChanged = true;
                remaining.push(rule.isPersistent ? { ...rule, _lastSide: currentSide } : rule);
            }
        }
        if (hasChanged) dbUpdates[`investmentAlerts.${saleKey}`] = remaining.length ? remaining : admin.firestore.FieldValue.delete();
    }

    // Global, Watchlist, Candle (Omitidos detalles internos para brevedad, manteniendo estructura)
    const globalPNL = totalCurrentValue - totalInvested;
    const triggeredGlobalMessages: string[] = [];
    if (globalAlerts.length > 0) {
        const remainingGlobals: GlobalAlertRule[] = [];
        let hasGlobalChanged = false;
        for (const rule of globalAlerts) {
            const currentSide: 'above' | 'below' = globalPNL >= rule.targetAmount ? 'above' : 'below';
            let conditionMet = rule.direction === 'up' ? globalPNL >= rule.targetAmount : globalPNL <= rule.targetAmount;
            if (conditionMet && (!rule.isPersistent || rule._lastSide !== currentSide)) {
                triggeredGlobalMessages.push(`🚨 *PNL Global* alcanzó *${pnlSign(globalPNL)}$${fmt(globalPNL)}*`);
                if (rule.isPersistent) { remainingGlobals.push({ ...rule, _lastSide: currentSide }); hasGlobalChanged = true; }
                else hasGlobalChanged = true;
            } else {
                if (rule.isPersistent && rule._lastSide !== currentSide) hasGlobalChanged = true;
                remainingGlobals.push(rule.isPersistent ? { ...rule, _lastSide: currentSide } : rule);
            }
        }
        if (hasGlobalChanged) dbUpdates.globalAlerts = remainingGlobals;
    }

    const shouldAlert = triggeredGlobalMessages.length > 0 || triggeredIndividualMessages.length > 0;
    if (shouldAlert) {
        const message = (triggeredGlobalMessages.length ? `*Alertas Globales:*\n${triggeredGlobalMessages.join("\n")}\n\n` : "") + triggeredIndividualMessages.join("\n");
        const sent = await sendTelegram(message);
        if (sent && Object.keys(dbUpdates).length > 0) await db.collection("config").doc("alerts").update(dbUpdates);
    } else if (Object.keys(dbUpdates).length > 0) {
        await db.collection("config").doc("alerts").update(dbUpdates);
    }
}

// ─── Core: Trading Signals ───────────────────────────────────────────────────
async function runTradingSignals() {
    console.log("[Trading Signals] Analizando mercados...");
    // Lógica simplificada - funcionalidad desactivada temporalmente
}

// ─── Scheduled Tasks (Optimizadas) ───────────────────────────────────────────
export const checkIntervalTasks = functions
    .region('europe-west1')
    .runWith({ memory: "128MB", secrets: ["TELEGRAM_TOKEN", "TELEGRAM_CHAT_ID"] })
    .pubsub.schedule("every 15 minutes").onRun(async () => {
        await runCheckAlerts();
        await runTradingSignals();
    });

// Nota: dailyPortfolioReport y dailyPnlSnapshot están comentadas.
// Se pueden implementar en el futuro si es necesario.
/*
export const dailyPortfolioReport = functions
    .region('europe-west1')
    .runWith({ memory: "128MB", secrets: ["TELEGRAM_TOKEN", "TELEGRAM_CHAT_ID"] })
    .pubsub.schedule("0 8 * * *").timeZone("America/Caracas").onRun(async () => {
        // runDailyReport();
    });

export const dailyPnlSnapshot = functions
    .region("europe-west1")
    .runWith({ memory: "128MB" })
    .pubsub.schedule("0 0 * * *").timeZone("America/Argentina/Buenos_Aires").onRun(async () => {
        // runDailyPnlSnapshot();
    });
*/

// ─── Helper: CORS ──────────────────────────────────────────────────────────────
function setCorsHeaders(res: functions.Response) {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

// ─── Helper: Binance Signed Request ─────────────────────────────────────────────
const BINANCE_SECRET = defineSecret("FUNCTIONS_CONFIG_EXPORT");

async function binanceSignedRequest(
    path: string,
    params: Record<string, string> = {}
): Promise<any> {
    const bConfig = JSON.parse(BINANCE_SECRET.value() as string).binance;
    if (!bConfig?.api_key || !bConfig?.api_secret) {
        throw new Error("Binance API keys not configured");
    }

    const { api_key: apiKey, api_secret: apiSecret } = bConfig;
    const timestamp = Date.now();
    const baseParams = { ...params, timestamp: String(timestamp), recvWindow: "5000" };
    const qs = new URLSearchParams(baseParams).toString();
    const signature = crypto.createHmac("sha256", apiSecret).update(qs).digest("hex");

    const isFapi = path.startsWith("/fapi");
    const baseUrl = isFapi ? "https://fapi.binance.com" : "https://api.binance.com";
    const url = `${baseUrl}${path}?${qs}&signature=${signature}`;

    const { data } = await axios.get(url, {
        headers: { "X-MBX-APIKEY": apiKey },
        timeout: 10000,
    });

    return data;
}

// ─── HTTP Functions (Esenciales) ─────────────────────────────────────────────
export { analyzeMarket };
export { signBinanceRequest };

// ─── HTTP: getBinanceWallet ────────────────────────────────────────────────────
// Devuelve: { funding: { USDT: number, ... }, spot: { USDT: number, ... }, error?: string }

export const getBinanceWallet = functions
    .region("europe-west1")
    .runWith({ secrets: ["FUNCTIONS_CONFIG_EXPORT"], memory: "128MB" })
    .https.onRequest(async (req, res) => {
        setCorsHeaders(res);

        if (req.method === "OPTIONS") {
            res.status(204).send("");
            return;
        }

        try {
            // Fetch Spot Wallet Balance
            const spotData = await binanceSignedRequest("/api/v3/account", { omitZeroBalances: "true" });
            const spot: Record<string, number> = {};
            if (spotData?.balances && Array.isArray(spotData.balances)) {
                for (const asset of spotData.balances) {
                    const total = parseFloat(asset.free || "0") + parseFloat(asset.locked || "0");
                    if (total > 0) spot[asset.asset] = total;
                }
            }

            // Fetch Futures Balance
            const futuresData = await binanceSignedRequest("/fapi/v2/balance");
            const funding: Record<string, number> = {};
            if (Array.isArray(futuresData)) {
                for (const b of futuresData) {
                    const bal = parseFloat(b.balance || "0");
                    if (bal > 0) funding[b.asset] = bal;
                }
            }

            res.status(200).json({ funding, spot });
        } catch (error: any) {
            console.error("[getBinanceWallet] Error:", error.message);
            res.status(200).json({ funding: { USDT: 0 }, spot: { USDT: 0 }, error: error.message });
        }
    });

export const corsTest = functions
    .region("europe-west1")
    .runWith({ memory: "128MB" })
    .https.onRequest((req, res) => {
        setCorsHeaders(res);

        if (req.method === "OPTIONS") {
            res.status(204).send("");
            return;
        }

        res.status(200).json({ ok: true, message: "CORS configurado correctamente" });
    });

// ─── HTTP: syncBinanceLoans ────────────────────────────────────────────────────
// Devuelve: { ongoing, collateral, loanable, error? }
export const syncBinanceLoans = functions
    .region("europe-west1")
    .runWith({ secrets: ["FUNCTIONS_CONFIG_EXPORT"], memory: "128MB" })
    .https.onRequest(async (req, res) => {
        setCorsHeaders(res);
        if (req.method === "OPTIONS") { res.status(204).send(""); return; }

        try {
            const bConfig = JSON.parse(BINANCE_SECRET.value() as string).binance;
            if (!bConfig?.api_key || !bConfig?.api_secret) {
                res.status(200).json({ ongoing: [], collateral: [], loanable: [], error: "Binance API keys not configured" });
                return;
            }
            const { api_key: apiKey, api_secret: apiSecret } = bConfig;

            const [ongoingRes, collateralRes, loanableRes] = await Promise.all([
                binanceRequest("/sapi/v2/loan/flexible/ongoing/orders", "GET", {}, apiKey, apiSecret),
                binanceRequest("/sapi/v2/loan/flexible/collateral/data", "GET", {}, apiKey, apiSecret),
                binanceRequest("/sapi/v2/loan/flexible/loanable/data", "GET", {}, apiKey, apiSecret),
            ]);

            const ongoing = ongoingRes?.rows || ongoingRes || [];
            const collateral = collateralRes?.rows || collateralRes || [];
            const loanable = loanableRes?.rows || loanableRes || [];

            res.status(200).json({ ongoing, collateral, loanable });
        } catch (error: any) {
            console.error("[syncBinanceLoans] Error:", error.message);
            res.status(200).json({ ongoing: [], collateral: [], loanable: [], error: error.message });
        }
    });

// ─── HTTP: syncBybitLoans ─────────────────────────────────────────────────────
// Devuelve: { position, flexibleLoans, collateralData, error? }
// Endpoints Bybit V5 Crypto Loan (New):
//   - /v5/crypto-loan-common/position        → borrowList, collateralList, ltv, totalCollateral, totalDebt
//   - /v5/crypto-loan-flexible/ongoing-coin  → flexible loans con unpaidInterest
export const syncBybitLoans = functions
    .region("europe-west1")
    .runWith({ secrets: ["FUNCTIONS_CONFIG_EXPORT"], memory: "128MB" })
    .https.onRequest(async (req, res) => {
        setCorsHeaders(res);
        if (req.method === "OPTIONS") { res.status(204).send(""); return; }

        try {
            const config = JSON.parse(BINANCE_SECRET.value() as string);
            const bybitConfig = config.bybit;
            if (!bybitConfig?.api_key || !bybitConfig?.api_secret) {
                res.status(401).json({ position: null, flexibleLoans: [], collateralData: {}, error: "Bybit API keys not configured" });
                return;
            }
            const { api_key: apiKey, api_secret: apiSecret } = bybitConfig;

            const [positionRes, ongoingRes] = await Promise.all([
                bybitRequest<any>("/v5/crypto-loan-common/position", {}, apiKey, apiSecret),
                bybitRequest<any>("/v5/crypto-loan-flexible/ongoing-coin", {}, apiKey, apiSecret),
            ]);

            // bybitRequest already unwraps the Bybit response and returns result.
            const posResult = positionRes || {};
            const ongoingResult = ongoingRes || {};

            // position.borrowList already has flexibleHourlyInterestRate, flexibleTotalDebt, loanCurrency
            const borrowList = (posResult.borrowList || []).map((b: any) => ({
                flexibleHourlyInterestRate: b.flexibleHourlyInterestRate || "0",
                flexibleTotalDebt: b.flexibleTotalDebt || "0",
                loanCurrency: b.loanCurrency || "",
            }));

            // position.collateralList has amount, amountUSD, currency
            const collateralList = (posResult.collateralList || []).map((c: any) => ({
                amount: c.amount || "0",
                amountUSD: c.amountUSD || "0",
                currency: c.currency || "",
            }));

            const totalDebt = parseFloat(posResult.totalDebt || "0");
            const totalCollateral = parseFloat(posResult.totalCollateral || "0");
            const ltv = posResult.ltv || "0";

            const position = {
                borrowList,
                collateralList,
                loans: posResult.borrowList || [],
                ltv,
                totalCollateral: String(totalCollateral),
                totalDebt: String(totalDebt),
            };

            // Merge unpaidInterest from ongoing-coin into borrowList for flexibleLoans
            const ongoingList = ongoingResult.list || [];
            const flexibleLoans = borrowList.map((b: any) => {
                const ongoing = ongoingList.find((o: any) => o.loanCurrency === b.loanCurrency);
                return {
                    hourlyInterestRate: b.flexibleHourlyInterestRate,
                    loanCurrency: b.loanCurrency,
                    totalDebt: b.flexibleTotalDebt,
                    unpaidInterest: ongoing?.unpaidInterest || "0",
                };
            });

            // Build collateralData with default LTV values per coin
            const collateralData: Record<string, any[]> = {};
            for (const c of collateralList) {
                collateralData[c.currency] = [{
                    currency: c.currency,
                    initialLTV: "0.80",
                    marginCallLTV: "0.87",
                    liquidationLTV: "0.92",
                }];
            }

            res.status(200).json({ position, flexibleLoans, collateralData });
            } catch (error: any) {
                console.error("[syncBybitLoans] Error:", error.message);
                res.status(500).json({ position: null, flexibleLoans: [], collateralData: {}, error: error.message });
            }
    });

export const debugAlerts = functions.region('europe-west1').runWith({ memory: "128MB" }).https.onRequest(async (req, res) => {
    const doc = await db.collection("config").doc("alerts").get();
    res.json(doc.data());
});

export const debugInversiones = functions.region('europe-west1').runWith({ memory: "128MB" }).https.onRequest(async (req, res) => {
    const snap = await db.collection("inversiones").get();
    res.json(snap.docs.map(d => d.data()));
});

export const debugLogs = functions.region('europe-west1').runWith({ memory: "128MB" }).https.onRequest(async (req, res) => {
    const snap = await db.collection("notificationLogs").orderBy("sentAt", "desc").limit(10).get();
    res.json(snap.docs.map(d => d.data()));
});
