"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.testDailyReport = exports.dailyPortfolioReport = exports.checkTradingSignals = exports.testTradingSignals = exports.checkPNLAlerts = exports.testAlerts = exports.setupTestAlerts = exports.debugLogs = exports.debugInversiones = exports.debugAlerts = exports.analyzeMarket = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios_1 = require("axios");
admin.initializeApp();
const db = admin.firestore();
// ─── Telegram config ──────────────────────────────────────────────────────────
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const DIVIDER = "────────────────────";
// ─── Utils ────────────────────────────────────────────────────────────────────
/** Pausa async (para reintentos). */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
/** Formatea un número como moneda de forma determinista. */
const fmt = (n) => new Intl.NumberFormat('en-US').format(Math.round(n));
/** Devuelve "+" si el número es positivo, "" si es negativo. */
const pnlSign = (n) => n >= 0 ? "+" : "";
/** Devuelve el emoji correspondiente al PNL. */
const pnlEmoji = (pnl) => pnl >= 0 ? "🟢" : "🔴";
/** Formatea precios con precisión condicional: 4 decimales si < $1, 2 si >= $1. */
const fmtPrice = (price) => {
    const dec = Math.abs(price) < 1 ? 4 : 2;
    return `$${price.toLocaleString("en-US", {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
    })}`;
};
/** Envío a Telegram con reintentos básicos. */
async function sendTelegram(text) {
    var _a;
    if (!TELEGRAM_TOKEN || !CHAT_ID) {
        console.error("[Telegram] Faltan credenciales (TOKEN/CHAT_ID).");
        return false;
    }
    const payload = {
        chat_id: CHAT_ID,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
    };
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            await axios_1.default.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, payload);
            return true;
        }
        catch (e) {
            console.error(`[Telegram] Intento ${attempt} fallido:`, ((_a = e.response) === null || _a === void 0 ? void 0 : _a.data) || e.message);
            if (attempt < 3) {
                await sleep(2000 * attempt);
            }
        }
    }
    console.error("[Telegram] Fallo definitivo tras 3 intentos.");
    return false;
}
// ─── Helper: normalizar formato legacy de alertas ────────────────────────────
function normalizeAlerts(raw) {
    const normalized = {};
    for (const [id, value] of Object.entries(raw)) {
        let alertsArray = [];
        if (Array.isArray(value)) {
            alertsArray = value;
        }
        else if (value && typeof value === "object") {
            alertsArray = [value];
        }
        normalized[id] = alertsArray.map(alert => {
            let type = alert.type;
            if (!type) {
                if (typeof alert.targetValue === 'number')
                    type = 'price';
                else
                    type = 'pnl';
            }
            return Object.assign(Object.assign({}, alert), { type, direction: alert.direction || (type === 'pnl'
                    ? ((alert.targetPercent || 0) >= 0 ? 'up' : 'down')
                    : 'up') });
        });
    }
    return normalized;
}
function normalizeGlobalAlerts(rawArray) {
    if (!Array.isArray(rawArray))
        return [];
    return rawArray.map(alert => (Object.assign(Object.assign({}, alert), { direction: alert.direction || (alert.targetAmount >= 0 ? 'up' : 'down') })));
}
// ─── Core Logic ───────────────────────────────────────────────────────────────
async function runCheckAlerts() {
    var _a;
    console.log("[v2.2] Iniciando comprobación de alertas...");
    // Use the same Binance API as the frontend to ensure price consistency
    const SYMBOL_MAP = {
        BTC: "BTCUSDT", ETH: "ETHUSDT", ADA: "ADAUSDT", DOGE: "DOGEUSDT",
        LTC: "LTCUSDT", BNB: "BNBUSDT", SOL: "SOLUSDT", XRP: "XRPUSDT",
        DOT: "DOTUSDT", MATIC: "MATICUSDT", SHIB: "SHIBUSDT", AVAX: "AVAXUSDT",
        LINK: "LINKUSDT",
    };
    const symbols = Object.values(SYMBOL_MAP);
    const param = JSON.stringify(symbols);
    const { data: tickerData } = await axios_1.default.get(`https://api.binance.com/api/v3/ticker/price?symbols=${encodeURIComponent(param)}`);
    const prices = {};
    const reverseMap = Object.fromEntries(Object.entries(SYMBOL_MAP).map(([k, v]) => [v, k]));
    for (const item of tickerData) {
        // Store both formats: "BTC" and "BTCUSDT" for compatibility
        prices[item.symbol] = parseFloat(item.price);
        const coin = reverseMap[item.symbol];
        if (coin)
            prices[`${coin}USDT`] = parseFloat(item.price);
    }
    const configSnap = await db.collection("config").doc("alerts").get();
    let minAlert = -40000;
    let maxAlert = 10000;
    let investmentAlerts = {};
    let globalAlerts = [];
    let watchlistAlerts = {};
    let hasMigratedToGlobalAlertsArray = false;
    if (configSnap.exists) {
        const conf = configSnap.data();
        if (conf.minPNL !== undefined)
            minAlert = conf.minPNL;
        if (conf.maxPNL !== undefined)
            maxAlert = conf.maxPNL;
        if (conf.globalAlerts !== undefined) {
            hasMigratedToGlobalAlertsArray = true;
            globalAlerts = normalizeGlobalAlerts(conf.globalAlerts);
        }
        if (conf.investmentAlerts) {
            investmentAlerts = normalizeAlerts(conf.investmentAlerts);
        }
        if (conf.watchlistAlerts) {
            for (const [coin, arr] of Object.entries(conf.watchlistAlerts)) {
                if (Array.isArray(arr))
                    watchlistAlerts[coin] = arr;
            }
        }
    }
    const snap = await db.collection("inversiones").get();
    // Fetch previous notification snapshot to compute P&L delta per position
    const prevLogSnap = await db.collection("notificationLogs")
        .orderBy("sentAt", "desc")
        .limit(1)
        .get();
    const prevSnapshot = prevLogSnap.empty ? {} : (prevLogSnap.docs[0].data().positionSnapshot || {});
    let totalInvested = 0;
    let totalCurrentValue = 0;
    const triggeredIndividualMessages = [];
    let hasGlobalAlertsToRemove = false;
    const dbUpdates = {};
    const individualAssets = [];
    const debugData = [];
    snap.forEach((docSnap) => {
        const inv = docSnap.data();
        const symbol = `${inv.coin}USDT`;
        const currentPrice = prices[symbol] || 0;
        const currentValue = currentPrice * inv.quantity;
        totalInvested += inv.invested || 0;
        totalCurrentValue += currentValue;
        const pnl = currentValue - (inv.invested || 0);
        const alertRules = investmentAlerts[docSnap.id];
        const roiPercent = (inv.invested && inv.invested > 0) ? (pnl / inv.invested) * 100 : 0;
        if (Array.isArray(alertRules) && alertRules.length > 0) {
            const remaining = [];
            for (const rule of alertRules) {
                const type = rule.type || 'pnl';
                const direction = rule.direction || (type === 'pnl' ? ((rule.targetPercent || 0) >= 0 ? 'up' : 'down') : 'up');
                let isTriggered = false;
                const debugRule = {
                    coin: inv.coin,
                    type,
                    direction,
                    current: type === 'pnl' ? roiPercent : currentPrice,
                    target: type === 'pnl' ? rule.targetPercent : rule.targetValue,
                    triggered: false
                };
                if (type === 'pnl' && inv.invested > 0) {
                    const target = rule.targetPercent || 0;
                    if (direction === 'up' && roiPercent >= target) {
                        isTriggered = true;
                        triggeredIndividualMessages.push(`🚀 *${inv.coin}* subió a *${pnlSign(roiPercent)}${roiPercent.toFixed(1)}%* (Meta: 🔼 >= ${target}%)`
                            + (rule.note ? `\n_📝 ${rule.note}_` : ""));
                    }
                    else if (direction === 'down' && roiPercent <= target) {
                        isTriggered = true;
                        triggeredIndividualMessages.push(`📉 *${inv.coin}* cayó a *${roiPercent.toFixed(1)}%* (Límite: 🔽 <= ${target}%)`
                            + (rule.note ? `\n_📝 ${rule.note}_` : ""));
                    }
                }
                else if (type === 'price') {
                    const target = rule.targetValue || 0;
                    if (direction === 'up' && currentPrice >= target) {
                        isTriggered = true;
                        triggeredIndividualMessages.push(`💰 *${inv.coin}* alcanzó *${fmtPrice(currentPrice)}* (Meta: 🔼 >= ${fmtPrice(target)})`
                            + (rule.note ? `\n_📝 ${rule.note}_` : ""));
                    }
                    else if (direction === 'down' && currentPrice <= target) {
                        isTriggered = true;
                        triggeredIndividualMessages.push(`📉 *${inv.coin}* bajó a *${fmtPrice(currentPrice)}* (Límite: 🔽 <= ${fmtPrice(target)})`
                            + (rule.note ? `\n_📝 ${rule.note}_` : ""));
                    }
                }
                if (isTriggered) {
                    debugRule.triggered = true;
                    const tipo = rule.isPersistent ? "PERMANENTE" : "UNA VEZ";
                    const targetVal = type === 'pnl' ? `${rule.targetPercent}%` : `${rule.targetValue}`;
                    console.log(`[ALERTA v2.1] ${inv.coin} (${docSnap.id}) — ${type.toUpperCase()}: ${type === 'pnl' ? roiPercent.toFixed(2) + '%' : currentPrice} — Target: ${direction === 'up' ? '>=' : '<='} ${targetVal} — Tipo: ${tipo}`);
                    if (rule.isPersistent) {
                        remaining.push(rule);
                    }
                    else {
                        console.log(`[ONE-SHOT] Alerta ${inv.coin} (${targetVal}) eliminada.`);
                    }
                }
                else {
                    remaining.push(rule);
                }
                debugData.push(Object.assign(Object.assign({}, debugRule), { invId: docSnap.id }));
            }
            if (remaining.length === 0) {
                delete investmentAlerts[docSnap.id];
                dbUpdates[`investmentAlerts.${docSnap.id}`] = admin.firestore.FieldValue.delete();
            }
            else if (remaining.length !== alertRules.length) {
                investmentAlerts[docSnap.id] = remaining;
                dbUpdates[`investmentAlerts.${docSnap.id}`] = remaining;
            }
        }
        else {
            // Fix 5: Ensure debugData has entries for assets without alerts
            debugData.push({
                coin: inv.coin,
                invId: docSnap.id,
                type: 'none',
                current: currentPrice,
                target: 0,
                triggered: false
            });
        }
        individualAssets.push({ id: docSnap.id, coin: inv.coin, pnl, roi: roiPercent || 0 });
    });
    // Cleanup orphaned alerts (IDs that no longer exist in 'inversiones')
    const activeInvIds = new Set(snap.docs.map(d => d.id));
    for (const invId of Object.keys(investmentAlerts)) {
        if (!activeInvIds.has(invId)) {
            console.log(`[CLEANUP] Alerta huérfana detectada para inversion ID: ${invId}. Eliminando...`);
            delete investmentAlerts[invId];
            dbUpdates[`investmentAlerts.${invId}`] = admin.firestore.FieldValue.delete();
        }
    }
    individualAssets.sort((a, b) => b.pnl - a.pnl);
    const assetDetails = individualAssets.map(({ id, coin, pnl, roi }) => {
        const prev = prevSnapshot[id];
        let deltaStr = "";
        if (prev !== undefined) {
            const delta = pnl - prev.pnl;
            if (Math.abs(delta) >= 1) {
                const arrow = delta > 0 ? "▲" : "▼";
                deltaStr = ` ${arrow} ${pnlSign(delta)}$${fmt(Math.abs(delta))}`;
            }
            else {
                deltaStr = " ═";
            }
        }
        return `${pnlEmoji(pnl)} *${coin}:* ${pnlSign(pnl)}$${fmt(pnl)} (${pnlSign(roi)}${roi.toFixed(1)}%)${deltaStr}`;
    });
    const globalPNL = totalCurrentValue - totalInvested;
    const triggeredGlobalMessages = [];
    let remainingGlobalAlerts = [];
    const isLegacyGlobalAlertTriggered = (!hasMigratedToGlobalAlertsArray) && (globalPNL <= minAlert || globalPNL >= maxAlert);
    if (isLegacyGlobalAlertTriggered) {
        const reason = globalPNL <= minAlert ? "⬇️ Límite inferior alcanzado" : "⬆️ Meta superior alcanzada";
        triggeredGlobalMessages.push(`🚨 *Alerta Global Legacy:* ${reason} (${pnlSign(globalPNL)}$${fmt(globalPNL)})`);
    }
    for (const rule of globalAlerts) {
        const target = rule.targetAmount;
        const direction = rule.direction || (target >= 0 ? 'up' : 'down');
        let isTriggered = false;
        if (direction === 'up' && globalPNL >= target) {
            isTriggered = true;
            triggeredGlobalMessages.push(`🚀 *PNL Global* alcanzó *${pnlSign(globalPNL)}$${fmt(globalPNL)}* (Meta: 🔼 >= ${pnlSign(target)}$${fmt(target)})`
                + (rule.note ? `\n_📝 ${rule.note}_` : ""));
        }
        else if (direction === 'down' && globalPNL <= target) {
            isTriggered = true;
            triggeredGlobalMessages.push(`📉 *PNL Global* cayó a *${pnlSign(globalPNL)}$${fmt(globalPNL)}* (Límite: 🔽 <= ${pnlSign(target)}$${fmt(target)})`
                + (rule.note ? `\n_📝 ${rule.note}_` : ""));
        }
        if (isTriggered) {
            const tipo = rule.isPersistent ? "PERMANENTE" : "UNA VEZ";
            console.log(`[ALERTA GLOBAL v2.1] PNL: $${globalPNL.toFixed(2)} — Target: ${direction === 'up' ? '>=' : '<='} $${target} — Tipo: ${tipo}`);
            if (rule.isPersistent) {
                remainingGlobalAlerts.push(rule);
            }
            else {
                hasGlobalAlertsToRemove = true;
                console.log(`[ONE-SHOT GLOBAL] Alerta Global ($${target}) eliminada.`);
            }
        }
        else {
            remainingGlobalAlerts.push(rule);
        }
    }
    // ── Watchlist alerts ──────────────────────────────────────────────────────
    const triggeredWatchlistMessages = [];
    const watchlistDbUpdates = {};
    for (const [coin, rules] of Object.entries(watchlistAlerts)) {
        const symbol = `${coin}USDT`;
        const currentPrice = prices[symbol] || 0;
        if (currentPrice === 0)
            continue;
        const remaining = [];
        for (const rule of rules) {
            let isTriggered = false;
            if (rule.direction === 'up' && currentPrice >= rule.targetValue) {
                isTriggered = true;
                triggeredWatchlistMessages.push(`👁 *${coin}* alcanzó *${fmtPrice(currentPrice)}* (Watchlist: 🔼 >= ${fmtPrice(rule.targetValue)})`
                    + (rule.note ? `\n_📝 ${rule.note}_` : ""));
            }
            else if (rule.direction === 'down' && currentPrice <= rule.targetValue) {
                isTriggered = true;
                triggeredWatchlistMessages.push(`👁 *${coin}* bajó a *${fmtPrice(currentPrice)}* (Watchlist: 🔽 <= ${fmtPrice(rule.targetValue)})`
                    + (rule.note ? `\n_📝 ${rule.note}_` : ""));
            }
            if (isTriggered) {
                console.log(`[WATCHLIST] ${coin}: ${currentPrice} — Target: ${rule.direction === 'up' ? '>=' : '<='} ${rule.targetValue} — Tipo: ${rule.isPersistent ? 'PERMANENTE' : 'UNA VEZ'}`);
                if (rule.isPersistent)
                    remaining.push(rule);
            }
            else {
                remaining.push(rule);
            }
        }
        if (remaining.length === 0) {
            watchlistDbUpdates[`watchlistAlerts.${coin}`] = admin.firestore.FieldValue.delete();
        }
        else if (remaining.length !== rules.length) {
            watchlistDbUpdates[`watchlistAlerts.${coin}`] = remaining;
        }
    }
    const shouldAlert = isLegacyGlobalAlertTriggered || triggeredGlobalMessages.length > 0 || triggeredIndividualMessages.length > 0 || triggeredWatchlistMessages.length > 0;
    // ── Always clean legacy assetAlerts field if present (no Telegram needed) ──
    const legacyCleanup = {};
    if (configSnap.exists && ((_a = configSnap.data()) === null || _a === void 0 ? void 0 : _a.assetAlerts) !== undefined) {
        legacyCleanup.assetAlerts = admin.firestore.FieldValue.delete();
        await db.collection("config").doc("alerts").update(legacyCleanup);
        console.log("[CLEANUP] Campo legacy assetAlerts eliminado.");
    }
    if (shouldAlert) {
        let message = ``;
        if (triggeredGlobalMessages.length > 0)
            message += `*🚨 Alertas Globales:*\n${triggeredGlobalMessages.join("\n")}\n\n`;
        if (triggeredIndividualMessages.length > 0)
            message += `${triggeredIndividualMessages.join("\n")}\n`;
        if (triggeredWatchlistMessages.length > 0)
            message += `${triggeredWatchlistMessages.join("\n")}\n`;
        message += `${DIVIDER}\n*📊 Detalle del Portafolio:*\n`;
        // Fix 1: Message truncation to prevent Telegram 4096 char limit errors
        for (let i = 0; i < assetDetails.length; i++) {
            const line = assetDetails[i] + "\n";
            if (message.length + line.length > 3900) {
                message += `... y ${assetDetails.length - i} activos más.`;
                break;
            }
            message += line;
        }
        message += `${DIVIDER}\n*PNL Total:* ${pnlSign(globalPNL)}$${fmt(globalPNL)}\n*Invertido:* $${fmt(totalInvested)}\n*Valor Actual:* $${fmt(totalCurrentValue)}`;
        const sent = await sendTelegram(message);
        if (sent) {
            console.log(`✅ Alerta enviada.`);
            // CRITICAL FIX: Only remove ONE-SHOT alerts from Firestore AFTER
            // Telegram confirms delivery. If we delete first and Telegram fails,
            // the alert is permanently lost with no notification sent.
            if (hasGlobalAlertsToRemove)
                dbUpdates.globalAlerts = remainingGlobalAlerts;
            const allUpdates = Object.assign(Object.assign({}, dbUpdates), watchlistDbUpdates);
            if (Object.keys(allUpdates).length > 0) {
                await db.collection("config").doc("alerts").update(allUpdates);
                console.log("[CLEANUP] Alertas UNA VEZ eliminadas de Firestore post-envío.");
            }
            await db.collection("notificationLogs").add({
                sentAt: new Date(),
                globalAlertTriggered: triggeredGlobalMessages.length > 0 || isLegacyGlobalAlertTriggered,
                globalPNL: Math.round(globalPNL),
                triggeredAssets: triggeredIndividualMessages,
                triggeredGlobalAlerts: triggeredGlobalMessages,
                triggeredWatchlistAlerts: triggeredWatchlistMessages,
                totalInvested: Math.round(totalInvested),
                totalCurrentValue: Math.round(totalCurrentValue),
                positionSnapshot: Object.fromEntries(individualAssets.map(a => [a.id, { coin: a.coin, pnl: a.pnl, roi: a.roi }])),
            });
            return { sent: true, summary: "Alerta enviada", debug: debugData };
        }
        else {
            console.error("[ERROR] Telegram falló. Las alertas UNA VEZ NO se eliminan para reintentarlo en la próxima ejecución.");
            return { sent: false, summary: "Fallo envío Telegram", debug: debugData };
        }
    }
    else {
        // No alerts triggered — still need to remove PERSISTENT alerts that were
        // cleaned up (orphans) even though no notification was sent.
        if (hasGlobalAlertsToRemove)
            dbUpdates.globalAlerts = remainingGlobalAlerts;
        const allUpdatesNoAlert = Object.assign(Object.assign({}, dbUpdates), watchlistDbUpdates);
        if (Object.keys(allUpdatesNoAlert).length > 0) {
            await db.collection("config").doc("alerts").update(allUpdatesNoAlert);
        }
        console.log("Todo dentro de los límites.");
        return { sent: false, summary: "Sin alertas", debug: debugData };
    }
}
// ─── Cloud Functions ───────────────────────────────────────────────────────────
var analyzeMarket_1 = require("./analyzeMarket");
Object.defineProperty(exports, "analyzeMarket", { enumerable: true, get: function () { return analyzeMarket_1.analyzeMarket; } });
exports.debugAlerts = functions.region('europe-west1').https.onRequest(async (req, res) => {
    try {
        const doc = await db.collection("config").doc("alerts").get();
        res.json(doc.data());
    }
    catch (e) {
        res.status(500).send(e.message);
    }
});
exports.debugInversiones = functions.region('europe-west1').https.onRequest(async (req, res) => {
    try {
        const snap = await db.collection("inversiones").get();
        const data = [];
        snap.forEach(doc => data.push(Object.assign({ id: doc.id }, doc.data())));
        res.json(data);
    }
    catch (e) {
        res.status(500).send(e.message);
    }
});
exports.debugLogs = functions.region('europe-west1').https.onRequest(async (req, res) => {
    try {
        const snap = await db.collection("notificationLogs").orderBy("sentAt", "desc").limit(10).get();
        const data = [];
        snap.forEach(doc => data.push(Object.assign({ id: doc.id }, doc.data())));
        res.json(data);
    }
    catch (e) {
        res.status(500).send(e.message);
    }
});
exports.setupTestAlerts = functions.region('europe-west1').https.onRequest(async (req, res) => {
    try {
        const docRef = db.collection("config").doc("alerts");
        const doc = await docRef.get();
        const data = doc.data() || {};
        const investmentAlerts = data.investmentAlerts || {};
        investmentAlerts["6swnUV9ynXBDJCtzK5Sa"] = [
            {
                type: 'pnl',
                targetPercent: -2,
                direction: 'down',
                isPersistent: true
            },
            {
                type: 'price',
                targetValue: 0.27,
                direction: 'down',
                isPersistent: true
            }
        ];
        await docRef.update({ investmentAlerts });
        res.json({ status: "ok", message: "ADA test alerts configured" });
    }
    catch (e) {
        res.status(500).send(e.message);
    }
});
exports.testAlerts = functions.region('europe-west1').https.onRequest(async (req, res) => {
    try {
        const result = await runCheckAlerts();
        res.json(result);
    }
    catch (e) {
        res.status(500).send(e.message);
    }
});
exports.checkPNLAlerts = functions.region('europe-west1').pubsub.schedule("every 15 minutes").onRun(async (_context) => {
    try {
        await runCheckAlerts();
    }
    catch (e) {
        console.error("Error en checkPNLAlerts:", e);
    }
});
// ─── Trading Signals ──────────────────────────────────────────────────────────
// Indicator math (duplicated from frontend — pure functions, no browser deps)
function _calcEMASeries(closes, period) {
    if (closes.length < period)
        return [];
    const m = 2 / (period + 1);
    const sma = closes.slice(0, period).reduce((s, v) => s + v, 0) / period;
    const emas = [sma];
    for (let i = period; i < closes.length; i++) {
        emas.push((closes[i] - emas[emas.length - 1]) * m + emas[emas.length - 1]);
    }
    return emas;
}
function _calcRSI(closes, period = 14) {
    if (closes.length < period + 1)
        return 50;
    const changes = [];
    for (let i = 1; i < closes.length; i++)
        changes.push(closes[i] - closes[i - 1]);
    let avgGain = 0, avgLoss = 0;
    for (let i = 0; i < period; i++) {
        if (changes[i] >= 0)
            avgGain += changes[i];
        else
            avgLoss += Math.abs(changes[i]);
    }
    avgGain /= period;
    avgLoss /= period;
    for (let i = period; i < changes.length; i++) {
        const c = changes[i];
        avgGain = (avgGain * (period - 1) + (c >= 0 ? c : 0)) / period;
        avgLoss = (avgLoss * (period - 1) + (c < 0 ? Math.abs(c) : 0)) / period;
    }
    if (avgLoss === 0)
        return 100;
    return 100 - 100 / (1 + avgGain / avgLoss);
}
function _calcMACD(closes) {
    if (closes.length < 26)
        return { line: 0, signal: 0, histogram: 0 };
    const e12 = _calcEMASeries(closes, 12);
    const e26 = _calcEMASeries(closes, 26);
    const offset = 14;
    const macdVals = [];
    for (let i = 0; i < e26.length; i++) {
        if (e12[i + offset] !== undefined)
            macdVals.push(e12[i + offset] - e26[i]);
    }
    if (!macdVals.length)
        return { line: 0, signal: 0, histogram: 0 };
    const line = macdVals[macdVals.length - 1];
    const sigSeries = _calcEMASeries(macdVals, 9);
    const sig = sigSeries.length ? sigSeries[sigSeries.length - 1] : 0;
    return { line, signal: sig, histogram: line - sig };
}
const SIGNAL_EMOJI = {
    strong_buy: '🟢', buy: '🔵', hold: '⚪', sell: '🟠', strong_sell: '🔴',
};
const SIGNAL_LABEL_ES = {
    strong_buy: 'COMPRA FUERTE', buy: 'COMPRA', hold: 'MANTENER', sell: 'VENTA', strong_sell: 'VENTA FUERTE',
};
function _analyzeCoin(coin, closes, fgValue) {
    const price = closes[closes.length - 1];
    const rsi = _calcRSI(closes);
    const sma20 = closes.length >= 20 ? closes.slice(-20).reduce((s, v) => s + v, 0) / 20 : 0;
    const sma50 = closes.length >= 50 ? closes.slice(-50).reduce((s, v) => s + v, 0) / 50 : 0;
    const macd = _calcMACD(closes);
    // Scoring
    let rsiScore = 0;
    if (rsi < 20)
        rsiScore = 2;
    else if (rsi < 30)
        rsiScore = 1;
    else if (rsi > 80)
        rsiScore = -2;
    else if (rsi > 70)
        rsiScore = -1;
    let smaScore = 0;
    let smaLabel = 'Neutral';
    if (sma20 > 0 && sma50 > 0) {
        if (price > sma20 && sma20 > sma50) {
            smaScore = 2;
            smaLabel = 'Alcista fuerte';
        }
        else if (price > sma20) {
            smaScore = 1;
            smaLabel = 'Alcista';
        }
        else if (price < sma20 && sma20 < sma50) {
            smaScore = -2;
            smaLabel = 'Bajista fuerte';
        }
        else if (price < sma20) {
            smaScore = -1;
            smaLabel = 'Bajista';
        }
    }
    let macdScore = macd.histogram > 0 ? 1 : macd.histogram < 0 ? -1 : 0;
    let fgScore = 0;
    let totalWeight = 0.80;
    if (fgValue !== undefined) {
        if (fgValue <= 20)
            fgScore = 1;
        else if (fgValue <= 40)
            fgScore = 0.5;
        else if (fgValue >= 80)
            fgScore = -1;
        else if (fgValue >= 60)
            fgScore = -0.5;
        totalWeight = 1.0;
    }
    const score = (rsiScore * 0.25 + smaScore * 0.25 + macdScore * 0.30 + fgScore * 0.20) / totalWeight;
    let signal;
    if (score >= 1.2)
        signal = 'strong_buy';
    else if (score >= 0.4)
        signal = 'buy';
    else if (score > -0.4)
        signal = 'hold';
    else if (score > -1.2)
        signal = 'sell';
    else
        signal = 'strong_sell';
    const confidence = Math.min(Math.round(Math.abs(score) / 2 * 100), 100);
    return { coin, signal, confidence, rsi, macdHist: macd.histogram, smaLabel };
}
async function runTradingSignals() {
    var _a, _b;
    console.log("[Trading Signals] Analyzing markets...");
    const COINS = {
        BTC: "BTCUSDT", ETH: "ETHUSDT", ADA: "ADAUSDT", DOGE: "DOGEUSDT",
        LTC: "LTCUSDT", BNB: "BNBUSDT", SOL: "SOLUSDT", XRP: "XRPUSDT",
        DOT: "DOTUSDT", MATIC: "MATICUSDT", SHIB: "SHIBUSDT", AVAX: "AVAXUSDT",
        LINK: "LINKUSDT",
    };
    // Fetch Fear & Greed
    let fgValue;
    try {
        const fgRes = await axios_1.default.get("https://api.alternative.me/fng/?limit=1");
        fgValue = parseInt((_b = (_a = fgRes.data.data) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.value, 10);
        if (isNaN(fgValue))
            fgValue = undefined;
    }
    catch (_c) {
        fgValue = undefined;
    }
    // Fetch klines for all coins
    const analyses = [];
    for (const [coin, symbol] of Object.entries(COINS)) {
        try {
            const { data } = await axios_1.default.get(`https://api.binance.com/api/v3/klines`, {
                params: { symbol, interval: "1h", limit: 100 },
            });
            const closes = data.map((k) => parseFloat(k[4]));
            if (closes.length >= 50) {
                analyses.push(_analyzeCoin(coin, closes, fgValue));
            }
        }
        catch (e) {
            console.error(`[Trading Signals] Error fetching ${coin}:`, e.message);
        }
    }
    // Filter strong signals only
    const strongSignals = analyses.filter((a) => a.signal === "strong_buy" || a.signal === "strong_sell");
    if (strongSignals.length === 0) {
        console.log("[Trading Signals] No strong signals detected.");
        return { sent: false, summary: "No strong signals", analyses };
    }
    // Build Telegram message
    let message = `🤖 *SEÑALES DE TRADING — Crypto Command*\n${DIVIDER}\n`;
    for (const a of strongSignals) {
        message += `${SIGNAL_EMOJI[a.signal]} *${a.coin}:* ${SIGNAL_LABEL_ES[a.signal]} (Confianza: ${a.confidence}%)\n`;
        message += `  RSI: ${a.rsi.toFixed(0)} | SMA: ${a.smaLabel} | MACD: ${a.macdHist >= 0 ? '+' : ''}${a.macdHist.toFixed(4)}\n`;
    }
    message += DIVIDER + "\n";
    if (fgValue !== undefined) {
        const fgLabel = fgValue <= 20 ? "Miedo Extremo" : fgValue <= 40 ? "Miedo" : fgValue <= 60 ? "Neutral" : fgValue <= 80 ? "Codicia" : "Codicia Extrema";
        message += `📊 Miedo y Codicia: *${fgValue}* (${fgLabel})\n`;
    }
    message += `\n_Señales automáticas basadas en RSI, SMA, MACD_`;
    const sent = await sendTelegram(message);
    if (sent)
        console.log("[Trading Signals] Alert sent.");
    return { sent, summary: `${strongSignals.length} strong signal(s)`, analyses };
}
exports.testTradingSignals = functions.region('europe-west1').https.onRequest(async (req, res) => {
    try {
        const result = await runTradingSignals();
        res.json(result);
    }
    catch (e) {
        res.status(500).send(e.message);
    }
});
exports.checkTradingSignals = functions.region('europe-west1').pubsub.schedule("every 15 minutes").onRun(async (_context) => {
    try {
        await runTradingSignals();
    }
    catch (e) {
        console.error("Error en checkTradingSignals:", e);
    }
});
// ─── Daily Portfolio Report ───────────────────────────────────────────────────
async function runDailyReport() {
    const configSnap = await db.collection("config").doc("alerts").get();
    const conf = configSnap.exists ? configSnap.data() : {};
    if (!conf.dailyReportEnabled) {
        console.log("[DailyReport] Desactivado, omitiendo.");
        return;
    }
    const SYMBOL_MAP = {
        BTC: "BTCUSDT", ETH: "ETHUSDT", ADA: "ADAUSDT", DOGE: "DOGEUSDT",
        LTC: "LTCUSDT", BNB: "BNBUSDT", SOL: "SOLUSDT", XRP: "XRPUSDT",
        DOT: "DOTUSDT", MATIC: "MATICUSDT", SHIB: "SHIBUSDT", AVAX: "AVAXUSDT",
        LINK: "LINKUSDT",
    };
    const symbols = Object.values(SYMBOL_MAP);
    const { data: tickerData } = await axios_1.default.get(`https://api.binance.com/api/v3/ticker/price?symbols=${encodeURIComponent(JSON.stringify(symbols))}`);
    const prices = {};
    for (const item of tickerData) {
        prices[item.symbol] = parseFloat(item.price);
    }
    const snap = await db.collection("inversiones").get();
    // Aggregate per coin
    const coinMap = {};
    snap.forEach((docSnap) => {
        const inv = docSnap.data();
        const symbol = SYMBOL_MAP[inv.coin] || `${inv.coin}USDT`;
        const currentPrice = prices[symbol] || 0;
        const currentValue = currentPrice * (inv.quantity || 0);
        if (!coinMap[inv.coin])
            coinMap[inv.coin] = { invested: 0, currentValue: 0, currentPrice };
        coinMap[inv.coin].invested += inv.invested || 0;
        coinMap[inv.coin].currentValue += currentValue;
        coinMap[inv.coin].currentPrice = currentPrice;
    });
    if (Object.keys(coinMap).length === 0) {
        console.log("[DailyReport] Sin posiciones en portafolio.");
        return;
    }
    let totalInvested = 0;
    let totalCurrentValue = 0;
    const assetLines = [];
    for (const [coin, data] of Object.entries(coinMap)) {
        const pnl = data.currentValue - data.invested;
        const roi = data.invested > 0 ? (pnl / data.invested) * 100 : 0;
        totalInvested += data.invested;
        totalCurrentValue += data.currentValue;
        assetLines.push({
            pnl,
            line: `${pnlEmoji(pnl)} *${coin}:* ${pnlSign(pnl)}$${fmt(pnl)} (${pnlSign(roi)}${roi.toFixed(1)}%) · ${fmtPrice(data.currentPrice)}`,
        });
    }
    assetLines.sort((a, b) => b.pnl - a.pnl);
    const globalPNL = totalCurrentValue - totalInvested;
    const now = new Date();
    const dateStr = now.toLocaleDateString("es-ES", { weekday: "long", day: "2-digit", month: "short", year: "numeric" });
    const timeStr = now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    let message = `🌅 *Resumen Diario del Portafolio*\n_${dateStr} — ${timeStr}_\n${DIVIDER}\n📊 *Detalle del Portafolio:*\n`;
    for (const { line } of assetLines) {
        if (message.length + line.length + 1 > 3900)
            break;
        message += line + "\n";
    }
    message += `${DIVIDER}\n💰 *PNL Total:* ${pnlSign(globalPNL)}$${fmt(globalPNL)}\n📥 *Invertido:* $${fmt(totalInvested)}\n📈 *Valor Actual:* $${fmt(totalCurrentValue)}`;
    await sendTelegram(message);
    console.log("[DailyReport] Enviado correctamente.");
}
exports.dailyPortfolioReport = functions
    .region('europe-west1')
    .pubsub.schedule("0 8 * * *")
    .timeZone("America/Caracas")
    .onRun(async (_context) => {
    try {
        await runDailyReport();
    }
    catch (e) {
        console.error("Error en dailyPortfolioReport:", e);
    }
});
exports.testDailyReport = functions.region('europe-west1').https.onRequest(async (_req, res) => {
    try {
        await runDailyReport();
        res.json({ ok: true });
    }
    catch (e) {
        res.status(500).send(e.message);
    }
});
//# sourceMappingURL=index.js.map