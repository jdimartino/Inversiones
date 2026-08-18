"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.debugLogs = exports.debugInversiones = exports.debugAlerts = exports.syncBybitLoans = exports.syncBinanceLoans = exports.corsTest = exports.getBinanceWallet = exports.futuresSync = exports.signBinanceRequest = exports.analyzeMarket = exports.testDailyReport = exports.dailyPortfolioReport = exports.checkIntervalTasks = void 0;
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const axios_1 = require("axios");
const crypto = require("crypto");
const params_1 = require("firebase-functions/params");
const apiClients_1 = require("./apiClients");
const analyzeMarket_1 = require("./analyzeMarket");
Object.defineProperty(exports, "analyzeMarket", { enumerable: true, get: function () { return analyzeMarket_1.analyzeMarket; } });
const signBinanceRequest_1 = require("./signBinanceRequest");
Object.defineProperty(exports, "signBinanceRequest", { enumerable: true, get: function () { return signBinanceRequest_1.signBinanceRequest; } });
const futuresSync_1 = require("./futuresSync");
Object.defineProperty(exports, "futuresSync", { enumerable: true, get: function () { return futuresSync_1.futuresSync; } });
admin.initializeApp();
const db = admin.firestore();
const DIVIDER = "────────────────────";
// ─── Utils ────────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const fmt = (n) => new Intl.NumberFormat('en-US').format(Math.round(n));
const pnlSign = (n) => n >= 0 ? "+" : "";
const pnlEmoji = (pnl) => pnl >= 0 ? "🟢" : "🔴";
const fmtPrice = (price) => {
    const dec = Math.abs(price) < 1 ? 4 : 2;
    return `$${price.toLocaleString("en-US", {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
    })}`;
};
async function sendTelegram(text) {
    var _a;
    const token = process.env.TELEGRAM_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) {
        console.error("[Telegram] Faltan credenciales.");
        return false;
    }
    const payload = { chat_id: chatId, text, parse_mode: "Markdown", disable_web_page_preview: true };
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const resp = await axios_1.default.post(`https://api.telegram.org/bot${token}/sendMessage`, payload);
            console.log(`[Telegram] Mensaje enviado OK (status ${resp.status}, attempt ${attempt})`);
            return true;
        }
        catch (e) {
            console.error(`[Telegram] Intento ${attempt} fallido:`, ((_a = e.response) === null || _a === void 0 ? void 0 : _a.data) || e.message);
            if (attempt < 3)
                await sleep(2000 * attempt);
        }
    }
    console.error("[Telegram] Fallo definitivo tras 3 intentos.");
    return false;
}
// ─── Helpers: Normalización ──────────────────────────────────────────────────
function normalizeAlerts(raw) {
    const normalized = {};
    for (const [id, value] of Object.entries(raw)) {
        let alertsArray = Array.isArray(value) ? value : (value ? [value] : []);
        normalized[id] = alertsArray.map(alert => (Object.assign(Object.assign({}, alert), { type: alert.type || (typeof alert.targetValue === 'number' ? 'price' : 'pnl'), direction: alert.direction || (alert.type === 'pnl' ? ((alert.targetPercent || 0) >= 0 ? 'up' : 'down') : 'up') })));
    }
    return normalized;
}
function normalizeGlobalAlerts(rawArray) {
    if (!Array.isArray(rawArray))
        return [];
    return rawArray.map(alert => (Object.assign(Object.assign({}, alert), { direction: alert.direction || (alert.targetAmount >= 0 ? 'up' : 'down') })));
}
// ─── Core: Alertas ────────────────────────────────────────────────────────────
async function runCheckAlerts() {
    console.log("[v2.4] Iniciando comprobación de alertas...");
    const SYMBOL_MAP = {
        BTC: "BTCUSDT", ETH: "ETHUSDT", ADA: "ADAUSDT", DOGE: "DOGEUSDT",
        LTC: "LTCUSDT", BNB: "BNBUSDT", SOL: "SOLUSDT", XRP: "XRPUSDT",
        DOT: "DOTUSDT", MATIC: "MATICUSDT", SHIB: "SHIBUSDT", AVAX: "AVAXUSDT",
        LINK: "LINKUSDT",
    };
    const symbols = Object.values(SYMBOL_MAP);
    const { data: tickerData } = await axios_1.default.get(`https://api.binance.com/api/v3/ticker/price?symbols=${encodeURIComponent(JSON.stringify(symbols))}`);
    const prices = {};
    const reverseMap = Object.fromEntries(Object.entries(SYMBOL_MAP).map(([k, v]) => [v, k]));
    for (const item of tickerData) {
        prices[item.symbol] = parseFloat(item.price);
        const coin = reverseMap[item.symbol];
        if (coin)
            prices[`${coin}USDT`] = parseFloat(item.price);
    }
    const configSnap = await db.collection("config").doc("alerts").get();
    let investmentAlerts = {};
    let globalAlerts = [];
    let watchlistAlerts = {};
    let candleAlerts = {};
    let saleMeta = {};
    if (configSnap.exists) {
        const conf = configSnap.data();
        if (conf.globalAlerts)
            globalAlerts = normalizeGlobalAlerts(conf.globalAlerts);
        if (conf.investmentAlerts)
            investmentAlerts = normalizeAlerts(conf.investmentAlerts);
        if (conf.watchlistAlerts) {
            for (const [c, a] of Object.entries(conf.watchlistAlerts))
                if (Array.isArray(a))
                    watchlistAlerts[c] = a;
        }
        if (conf.candleAlerts) {
            for (const [c, a] of Object.entries(conf.candleAlerts))
                if (Array.isArray(a))
                    candleAlerts[c] = a;
        }
        if (conf.saleMeta)
            saleMeta = conf.saleMeta;
    }
    const dbUpdates = {};
    const triggeredIndividualMessages = [];
    const snap = await db.collection("inversiones").get();
    const ventasSnap = await db.collection("ventas").get();
    const activeSaleIds = new Set(ventasSnap.docs.map(d => `sale_${d.id}`));
    let totalInvested = 0, totalCurrentValue = 0;
    const individualAssets = [];
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
            const remaining = [];
            let hasInvChanged = false;
            for (const rule of alertRules) {
                const type = rule.type || 'pnl';
                const target = type === 'pnl' ? (rule.targetPercent || 0) : (rule.targetValue || 0);
                const currentVal = type === 'pnl' ? roiPercent : currentPrice;
                const currentSide = currentVal >= target ? 'above' : 'below';
                const direction = rule.direction || (type === 'pnl' ? (target >= 0 ? 'up' : 'down') : 'up');
                let conditionMet = direction === 'up' ? currentVal >= target : currentVal <= target;
                const isTriggered = conditionMet && (!rule.isPersistent || rule._lastSide === undefined || rule._lastSide !== currentSide);
                if (isTriggered) {
                    triggeredIndividualMessages.push(`🚀 *${inv.coin}* ${direction === 'up' ? 'subió' : 'cayó'} a *${type === 'pnl' ? pnlSign(roiPercent) + roiPercent.toFixed(1) + '%' : fmtPrice(currentPrice)}* (Meta: ${direction === 'up' ? '🔼' : '🔽'} ${type === 'pnl' ? target + '%' : fmtPrice(target)})` +
                        `\n${pnlEmoji(pnl)} PNL: ${pnlSign(pnl)}$${fmt(pnl)}` + (rule.note ? `\n_📝 ${rule.note}_` : ""));
                    if (rule.isPersistent) {
                        remaining.push(Object.assign(Object.assign({}, rule), { _lastSide: currentSide }));
                        hasInvChanged = true;
                    }
                    else
                        hasInvChanged = true;
                }
                else {
                    if (rule.isPersistent && rule._lastSide !== currentSide)
                        hasInvChanged = true;
                    remaining.push(rule.isPersistent ? Object.assign(Object.assign({}, rule), { _lastSide: currentSide }) : rule);
                }
            }
            if (remaining.length === 0) {
                dbUpdates[`investmentAlerts.${docSnap.id}`] = admin.firestore.FieldValue.delete();
            }
            else if (hasInvChanged) {
                dbUpdates[`investmentAlerts.${docSnap.id}`] = remaining;
            }
        }
        individualAssets.push({ id: docSnap.id, coin: inv.coin, pnl, roi: roiPercent });
    });
    // Cleanup & Sales Alerts
    for (const [saleKey, rules] of Object.entries(investmentAlerts)) {
        if (!saleKey.startsWith('sale_'))
            continue;
        const meta = saleMeta[saleKey];
        if (!meta || !activeSaleIds.has(saleKey)) {
            dbUpdates[`investmentAlerts.${saleKey}`] = admin.firestore.FieldValue.delete();
            if (saleMeta[saleKey])
                dbUpdates[`saleMeta.${saleKey}`] = admin.firestore.FieldValue.delete();
            continue;
        }
        const currentPrice = prices[`${meta.coin}USDT`] || 0;
        if (currentPrice === 0)
            continue;
        const roi = ((meta.usdtReceived - meta.quantity * currentPrice) / meta.usdtReceived) * 100;
        const recompraPnl = meta.usdtReceived - meta.quantity * currentPrice;
        const remaining = [];
        let hasChanged = false;
        for (const rule of rules) {
            const type = rule.type || 'price';
            const target = type === 'pnl' ? (rule.targetPercent || 0) : (rule.targetValue || 0);
            const currentVal = type === 'pnl' ? roi : currentPrice;
            const currentSide = currentVal >= target ? 'above' : 'below';
            let conditionMet = rule.direction === 'up' ? currentVal >= target : currentVal <= target;
            if (conditionMet && (!rule.isPersistent || rule._lastSide !== currentSide)) {
                triggeredIndividualMessages.push(`💰 *${meta.coin}* (venta) ${rule.direction === 'up' ? 'alcanzó' : 'bajó'} *${type === 'pnl' ? roi.toFixed(1) + '%' : fmtPrice(currentPrice)}*\n${pnlEmoji(recompraPnl)} Si recompras: ${pnlSign(recompraPnl)}$${fmt(recompraPnl)}` + (rule.note ? `\n_📝 ${rule.note}_` : ""));
                if (rule.isPersistent) {
                    remaining.push(Object.assign(Object.assign({}, rule), { _lastSide: currentSide }));
                    hasChanged = true;
                }
                else
                    hasChanged = true;
            }
            else {
                if (rule.isPersistent && rule._lastSide !== currentSide)
                    hasChanged = true;
                remaining.push(rule.isPersistent ? Object.assign(Object.assign({}, rule), { _lastSide: currentSide }) : rule);
            }
        }
        if (hasChanged) {
            if (remaining.length === 0) {
                delete investmentAlerts[saleKey];
                dbUpdates[`investmentAlerts.${saleKey}`] = admin.firestore.FieldValue.delete();
            }
            else {
                investmentAlerts[saleKey] = remaining;
                dbUpdates[`investmentAlerts.${saleKey}`] = remaining;
            }
        }
    }
    // ── Global Alerts ──────────────────────────────────────────────────────────
    const globalPNL = totalCurrentValue - totalInvested;
    const triggeredGlobalMessages = [];
    let remainingGlobalAlerts = [];
    let hasGlobalChanged = false;
    for (const rule of globalAlerts) {
        const target = rule.targetAmount;
        const direction = rule.direction || (target >= 0 ? 'up' : 'down');
        const currentSide = globalPNL >= target ? 'above' : 'below';
        const prevSide = rule._lastSide;
        let conditionMet = direction === 'up' ? globalPNL >= target : globalPNL <= target;
        const isTriggered = conditionMet && (!rule.isPersistent || prevSide === undefined || prevSide !== currentSide);
        if (isTriggered) {
            if (direction === 'up') {
                triggeredGlobalMessages.push(`🚨 *PNL Global* alcanzó *${pnlSign(globalPNL)}$${fmt(globalPNL)}* (Meta: 🔼 >= ${pnlSign(target)}$${fmt(target)})` + (rule.note ? `\n_📝 ${rule.note}_` : ""));
            }
            else {
                triggeredGlobalMessages.push(`📉 *PNL Global* cayó a *${pnlSign(globalPNL)}$${fmt(globalPNL)}* (Límite: 🔽 <= ${pnlSign(target)}$${fmt(target)})` + (rule.note ? `\n_📝 ${rule.note}_` : ""));
            }
            console.log(`[ALERTA GLOBAL v3] PNL: $${globalPNL.toFixed(2)} — Target: ${direction === 'up' ? '>=' : '<='} $${target} — Tipo: ${rule.isPersistent ? 'PERMANENTE' : 'UNA VEZ'}`);
            if (rule.isPersistent) {
                remainingGlobalAlerts.push(Object.assign(Object.assign({}, rule), { _lastSide: currentSide }));
                hasGlobalChanged = true;
            }
            else {
                hasGlobalChanged = true;
            }
        }
        else {
            if (rule.isPersistent) {
                if (prevSide !== currentSide)
                    hasGlobalChanged = true;
                remainingGlobalAlerts.push(Object.assign(Object.assign({}, rule), { _lastSide: currentSide }));
            }
            else {
                remainingGlobalAlerts.push(rule);
            }
        }
    }
    if (hasGlobalChanged)
        dbUpdates.globalAlerts = remainingGlobalAlerts;
    // ── Watchlist Alerts ───────────────────────────────────────────────────────
    const triggeredWatchlistMessages = [];
    const watchlistDbUpdates = {};
    for (const [coin, rules] of Object.entries(watchlistAlerts)) {
        const currentPrice = prices[`${coin}USDT`] || 0;
        if (currentPrice === 0)
            continue;
        const remaining = [];
        let hasCoinChanged = false;
        for (const rule of rules) {
            const currentSide = currentPrice >= rule.targetValue ? 'above' : 'below';
            const prevSide = rule._lastSide;
            let conditionMet = rule.direction === 'up' ? currentPrice >= rule.targetValue : currentPrice <= rule.targetValue;
            const isTriggered = conditionMet && (!rule.isPersistent || prevSide === undefined || prevSide !== currentSide);
            if (isTriggered) {
                triggeredWatchlistMessages.push(rule.direction === 'up'
                    ? `👁 *${coin}* alcanzó *${fmtPrice(currentPrice)}* (Watchlist: 🔼 >= ${fmtPrice(rule.targetValue)})` + (rule.note ? `\n_📝 ${rule.note}_` : "")
                    : `👁 *${coin}* bajó a *${fmtPrice(currentPrice)}* (Watchlist: 🔽 <= ${fmtPrice(rule.targetValue)})` + (rule.note ? `\n_📝 ${rule.note}_` : ""));
                console.log(`[WATCHLIST v3] ${coin}: ${currentPrice} — Target: ${rule.direction === 'up' ? '>=' : '<='} ${rule.targetValue}`);
                if (rule.isPersistent) {
                    remaining.push(Object.assign(Object.assign({}, rule), { _lastSide: currentSide }));
                    hasCoinChanged = true;
                }
            }
            else {
                if (rule.isPersistent) {
                    if (prevSide !== currentSide)
                        hasCoinChanged = true;
                    remaining.push(Object.assign(Object.assign({}, rule), { _lastSide: currentSide }));
                }
                else {
                    remaining.push(rule);
                }
            }
        }
        if (remaining.length === 0) {
            watchlistDbUpdates[`watchlistAlerts.${coin}`] = admin.firestore.FieldValue.delete();
        }
        else if (remaining.length !== rules.length || hasCoinChanged) {
            watchlistDbUpdates[`watchlistAlerts.${coin}`] = remaining;
        }
    }
    // ── Candle Alerts ──────────────────────────────────────────────────────────
    const triggeredCandleMessages = [];
    const candleDbUpdates = {};
    for (const [coin, rules] of Object.entries(candleAlerts)) {
        const symbol = `${coin}USDT`;
        const currentPrice = prices[symbol] || 0;
        if (currentPrice === 0)
            continue;
        const updatedRules = [];
        for (const rule of rules) {
            if (rule.type !== 'candle_change') {
                updatedRules.push(rule);
                continue;
            }
            let klineData;
            try {
                const { data } = await axios_1.default.get(`https://api.binance.com/api/v3/klines`, {
                    params: { symbol, interval: rule.interval, limit: 2 },
                });
                klineData = data;
            }
            catch (e) {
                console.error(`[CandleAlert] Error fetching klines for ${coin}:`, e.message);
                updatedRules.push(rule);
                continue;
            }
            const currentKline = klineData[klineData.length - 1];
            const open = parseFloat(currentKline[1]);
            const close = parseFloat(currentKline[4]);
            const changePct = ((close - open) / open) * 100;
            const threshold = rule.targetPercent;
            const currentSide = changePct >= threshold ? 'above' : 'below';
            const prevSide = rule._lastSide;
            const conditionMet = rule.direction === 'up' ? changePct >= threshold : changePct <= -threshold;
            const isTriggered = conditionMet && (!rule.isPersistent || prevSide === undefined || prevSide !== currentSide);
            if (isTriggered) {
                const emoji = changePct >= 0 ? '📈' : '📉';
                triggeredCandleMessages.push(`${emoji} *${coin}* — Vela ${rule.interval.toUpperCase()}: *${pnlSign(changePct)}${changePct.toFixed(2)}%*\n` +
                    `   Meta: ${rule.direction === 'up' ? '🔼' : '🔽'} Variación ${rule.direction === 'up' ? '>=' : '<='} ${threshold}%\n` +
                    `   Apertura: ${fmtPrice(open)} · Cierre: ${fmtPrice(close)}` +
                    (rule.note ? `\n   _📝 ${rule.note}_` : ''));
                console.log(`[CANDLE ALERT] ${coin} ${rule.interval}: ${changePct.toFixed(2)}% — Target: ${rule.direction === 'up' ? '>=' : '<='} ${threshold}%`);
                if (rule.isPersistent) {
                    updatedRules.push(Object.assign(Object.assign({}, rule), { _lastSide: currentSide }));
                }
            }
            else {
                if (rule.isPersistent) {
                    updatedRules.push(Object.assign(Object.assign({}, rule), { _lastSide: currentSide }));
                }
                else {
                    updatedRules.push(rule);
                }
            }
        }
        if (updatedRules.length === 0) {
            candleDbUpdates[`candleAlerts.${coin}`] = admin.firestore.FieldValue.delete();
        }
        else {
            candleDbUpdates[`candleAlerts.${coin}`] = updatedRules;
        }
    }
    // ── Decisión final ─────────────────────────────────────────────────────────
    const shouldAlert = triggeredGlobalMessages.length > 0 || triggeredIndividualMessages.length > 0 || triggeredWatchlistMessages.length > 0 || triggeredCandleMessages.length > 0;
    if (shouldAlert) {
        let message = ``;
        if (triggeredGlobalMessages.length > 0)
            message += `*🚨 Alertas Globales:*\n${triggeredGlobalMessages.join("\n")}\n\n`;
        if (triggeredCandleMessages.length > 0)
            message += `*📊 Alertas de Vela:*\n${triggeredCandleMessages.join("\n")}\n\n`;
        if (triggeredIndividualMessages.length > 0)
            message += `${triggeredIndividualMessages.join("\n")}\n`;
        if (triggeredWatchlistMessages.length > 0)
            message += `${triggeredWatchlistMessages.join("\n")}\n`;
        const sent = await sendTelegram(message);
        if (sent) {
            console.log("✅ Alerta enviada.");
            const allUpdates = Object.assign(Object.assign(Object.assign({}, dbUpdates), watchlistDbUpdates), candleDbUpdates);
            if (Object.keys(allUpdates).length > 0) {
                await db.collection("config").doc("alerts").update(allUpdates);
            }
            await db.collection("notificationLogs").add({
                sentAt: new Date(),
                globalAlertTriggered: triggeredGlobalMessages.length > 0,
                globalPNL: Math.round(globalPNL),
                triggeredAssets: triggeredIndividualMessages,
                triggeredGlobalAlerts: triggeredGlobalMessages,
                triggeredWatchlistAlerts: triggeredWatchlistMessages,
                triggeredCandleAlerts: triggeredCandleMessages,
                totalInvested: Math.round(totalInvested),
                totalCurrentValue: Math.round(totalCurrentValue),
                positionSnapshot: Object.fromEntries(individualAssets.map(a => [a.id, { coin: a.coin, pnl: a.pnl, roi: a.roi }])),
            });
            return { sent: true, summary: "Alerta enviada" };
        }
        else {
            console.error("[ERROR] Telegram falló. Alertas ONE-SHOT no eliminadas para reintentar.");
            return { sent: false, summary: "Fallo envío Telegram" };
        }
    }
    else {
        const allUpdatesNoAlert = Object.assign(Object.assign(Object.assign({}, dbUpdates), watchlistDbUpdates), candleDbUpdates);
        if (Object.keys(allUpdatesNoAlert).length > 0) {
            await db.collection("config").doc("alerts").update(allUpdatesNoAlert);
        }
        console.log("Todo dentro de los límites.");
        return { sent: false, summary: "Sin alertas" };
    }
}
// ─── Trading Signals ─────────────────────────────────────────────────────────
async function runTradingSignals() {
    console.log("[Trading Signals] Analizando mercados...");
}
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
    const coinMap = {};
    const individualPositions = [];
    snap.forEach((docSnap) => {
        const inv = docSnap.data();
        const symbol = SYMBOL_MAP[inv.coin] || `${inv.coin}USDT`;
        const currentPrice = prices[symbol] || 0;
        const qty = parseFloat(inv.quantity) || 0;
        const invested = parseFloat(inv.invested) || 0;
        const currentValue = currentPrice * qty;
        const pnl = currentValue - invested;
        const roi = invested > 0 ? (pnl / invested) * 100 : 0;
        individualPositions.push({
            coin: inv.coin, pnl, roi,
            line: `${pnlEmoji(pnl)} *${inv.coin}:* ${pnlSign(pnl)}$${fmt(pnl)} (${pnlSign(roi)}${roi.toFixed(1)}%) · ${fmtPrice(currentPrice)}`,
        });
        if (!coinMap[inv.coin])
            coinMap[inv.coin] = { invested: 0, currentValue: 0, currentPrice, totalQty: 0, positions: 0 };
        coinMap[inv.coin].invested += invested;
        coinMap[inv.coin].currentValue += currentValue;
        coinMap[inv.coin].currentPrice = currentPrice;
        coinMap[inv.coin].totalQty += qty;
        coinMap[inv.coin].positions += 1;
    });
    if (Object.keys(coinMap).length === 0) {
        console.log("[DailyReport] Sin posiciones en portafolio.");
        return;
    }
    individualPositions.sort((a, b) => b.pnl - a.pnl);
    let totalInvested = 0;
    let totalCurrentValue = 0;
    const consolidatedLines = [];
    for (const [coin, data] of Object.entries(coinMap)) {
        const pnl = data.currentValue - data.invested;
        const roi = data.invested > 0 ? (pnl / data.invested) * 100 : 0;
        const avgBuyPrice = data.totalQty > 0 ? data.invested / data.totalQty : 0;
        totalInvested += data.invested;
        totalCurrentValue += data.currentValue;
        const posLabel = data.positions > 1 ? ` (${data.positions} pos)` : "";
        consolidatedLines.push({
            pnl,
            line: `${pnlEmoji(pnl)} *${coin}*${posLabel}: ${pnlSign(pnl)}$${fmt(pnl)} (${pnlSign(roi)}${roi.toFixed(1)}%)\n` +
                `    Prom: ${fmtPrice(avgBuyPrice)} · Actual: ${fmtPrice(data.currentPrice)}`,
        });
    }
    consolidatedLines.sort((a, b) => b.pnl - a.pnl);
    const globalPNL = totalCurrentValue - totalInvested;
    const now = new Date();
    const dateStr = now.toLocaleDateString("es-ES", { weekday: "long", day: "2-digit", month: "short", year: "numeric" });
    const timeStr = now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    let message = `🌅 *Resumen Diario del Portafolio*\n_${dateStr} — ${timeStr}_\n${DIVIDER}\n`;
    // Section 1: Consolidated per coin
    message += `📊 *PNL Consolidado por Moneda:*\n`;
    for (const { line } of consolidatedLines) {
        if (message.length + line.length + 1 > 3200)
            break;
        message += line + "\n";
    }
    // Section 2: Individual positions
    message += `${DIVIDER}\n📋 *Detalle por Posición:*\n`;
    for (const { line } of individualPositions) {
        if (message.length + line.length + 1 > 3700) {
            message += `_(y más...)_`;
            break;
        }
        message += line + "\n";
    }
    // Section 3: Ventas realizadas
    const ventasSnap = await db.collection("ventas").get();
    if (!ventasSnap.empty) {
        const ventas = ventasSnap.docs.map(d => d.data());
        let totalRecibido = 0;
        let totalRecompraPnl = 0;
        const ventaLines = [];
        for (const v of ventas) {
            const symbol = SYMBOL_MAP[v.coin] || `${v.coin}USDT`;
            const cp = prices[symbol] || 0;
            const recompraPnl = cp > 0 ? v.usdtReceived - v.quantity * cp : null;
            totalRecibido += v.usdtReceived;
            if (recompraPnl !== null)
                totalRecompraPnl += recompraPnl;
            const pnlStr = recompraPnl !== null
                ? `${pnlSign(recompraPnl)}$${fmt(recompraPnl)} (${pnlSign(recompraPnl / v.usdtReceived * 100)}${Math.abs(recompraPnl / v.usdtReceived * 100).toFixed(1)}%)`
                : "—";
            const emoji = recompraPnl === null ? "⚪" : recompraPnl >= 0 ? "🟢" : "🔴";
            const dateStr = v.date ? new Date(v.date).toLocaleDateString("es-ES", { day: "2-digit", month: "short" }) : "—";
            ventaLines.push({
                date: v.date || 0,
                line: `${emoji} *${v.coin}* ${dateStr}: ${fmtPrice(v.sellPrice)} → ${cp > 0 ? fmtPrice(cp) : "—"} · ${pnlStr}`,
            });
        }
        ventaLines.sort((a, b) => b.date - a.date);
        message += `${DIVIDER}\n💼 *Ventas Realizadas (${ventas.length}):*\n`;
        for (const { line } of ventaLines) {
            if (message.length + line.length + 1 > 4000) {
                message += `_(y más...)_\n`;
                break;
            }
            message += line + "\n";
        }
        message += `💵 Recibido: $${fmt(totalRecibido)}`;
        if (totalRecibido > 0) {
            message += ` | Recompra: ${pnlSign(totalRecompraPnl)}$${fmt(totalRecompraPnl)}`;
        }
        message += "\n";
    }
    message += `${DIVIDER}\n💰 *PNL Total:* ${pnlSign(globalPNL)}${fmt(globalPNL)}\n📥 *Invertido:* ${fmt(totalInvested)}\n📈 *Valor Actual:* ${fmt(totalCurrentValue)}`;
    await sendTelegram(message);
    console.log("[DailyReport] Enviado correctamente.");
}
// ─── Scheduled Tasks ─────────────────────────────────────────────────────────
exports.checkIntervalTasks = functions
    .region('europe-west1')
    .runWith({ memory: "128MB", secrets: ["TELEGRAM_TOKEN", "TELEGRAM_CHAT_ID"] })
    .pubsub.schedule("every 10 minutes").onRun(async () => {
    try {
        await runCheckAlerts();
    }
    catch (e) {
        console.error("Error en checkIntervalTasks:", e);
    }
    try {
        await runTradingSignals();
    }
    catch (e) {
        console.error("Error en runTradingSignals:", e);
    }
});
exports.dailyPortfolioReport = functions
    .region('europe-west1')
    .runWith({ memory: "128MB", secrets: ["TELEGRAM_TOKEN", "TELEGRAM_CHAT_ID"] })
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
exports.testDailyReport = functions
    .region('europe-west1')
    .runWith({ secrets: ["TELEGRAM_TOKEN", "TELEGRAM_CHAT_ID"] })
    .https.onRequest(async (_req, res) => {
    try {
        await runDailyReport();
        res.json({ ok: true });
    }
    catch (e) {
        res.status(500).send(e.message);
    }
});
// ─── Helper: CORS ──────────────────────────────────────────────────────────
function setCorsHeaders(res) {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
}
// ─── Helper: Binance Signed Request ─────────────────────────────────────────
const BINANCE_SECRET = (0, params_1.defineSecret)("FUNCTIONS_CONFIG_EXPORT");
async function binanceSignedRequest(path, params = {}) {
    const bConfig = JSON.parse(BINANCE_SECRET.value()).binance;
    if (!(bConfig === null || bConfig === void 0 ? void 0 : bConfig.api_key) || !(bConfig === null || bConfig === void 0 ? void 0 : bConfig.api_secret)) {
        throw new Error("Binance API keys not configured");
    }
    const { api_key: apiKey, api_secret: apiSecret } = bConfig;
    const timestamp = Date.now();
    const baseParams = Object.assign(Object.assign({}, params), { timestamp: String(timestamp), recvWindow: "5000" });
    const qs = new URLSearchParams(baseParams).toString();
    const signature = crypto.createHmac("sha256", apiSecret).update(qs).digest("hex");
    const isFapi = path.startsWith("/fapi");
    const baseUrl = isFapi ? "https://fapi.binance.com" : "https://api.binance.com";
    const url = `${baseUrl}${path}?${qs}&signature=${signature}`;
    const { data } = await axios_1.default.get(url, {
        headers: { "X-MBX-APIKEY": apiKey },
        timeout: 10000,
    });
    return data;
}
exports.getBinanceWallet = functions
    .region("europe-west1")
    .runWith({ secrets: ["FUNCTIONS_CONFIG_EXPORT"], memory: "128MB" })
    .https.onRequest(async (req, res) => {
    setCorsHeaders(res);
    if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
    }
    try {
        const spotData = await binanceSignedRequest("/api/v3/account", { omitZeroBalances: "true" });
        const spot = {};
        if ((spotData === null || spotData === void 0 ? void 0 : spotData.balances) && Array.isArray(spotData.balances)) {
            for (const asset of spotData.balances) {
                const total = parseFloat(asset.free || "0") + parseFloat(asset.locked || "0");
                if (total > 0)
                    spot[asset.asset] = total;
            }
        }
        const futuresData = await binanceSignedRequest("/fapi/v2/balance");
        const funding = {};
        if (Array.isArray(futuresData)) {
            for (const b of futuresData) {
                const bal = parseFloat(b.balance || "0");
                if (bal > 0)
                    funding[b.asset] = bal;
            }
        }
        res.status(200).json({ funding, spot });
    }
    catch (error) {
        console.error("[getBinanceWallet] Error:", error.message);
        res.status(200).json({ funding: { USDT: 0 }, spot: { USDT: 0 }, error: error.message });
    }
});
exports.corsTest = functions
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
exports.syncBinanceLoans = functions
    .region("europe-west1")
    .runWith({ secrets: ["FUNCTIONS_CONFIG_EXPORT"], memory: "128MB" })
    .https.onRequest(async (req, res) => {
    setCorsHeaders(res);
    if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
    }
    try {
        const bConfig = JSON.parse(BINANCE_SECRET.value()).binance;
        if (!(bConfig === null || bConfig === void 0 ? void 0 : bConfig.api_key) || !(bConfig === null || bConfig === void 0 ? void 0 : bConfig.api_secret)) {
            res.status(200).json({ ongoing: [], collateral: [], loanable: [], error: "Binance API keys not configured" });
            return;
        }
        const { api_key: apiKey, api_secret: apiSecret } = bConfig;
        const [ongoingRes, collateralRes, loanableRes] = await Promise.all([
            (0, apiClients_1.binanceRequest)("/sapi/v2/loan/flexible/ongoing/orders", "GET", {}, apiKey, apiSecret),
            (0, apiClients_1.binanceRequest)("/sapi/v2/loan/flexible/collateral/data", "GET", {}, apiKey, apiSecret),
            (0, apiClients_1.binanceRequest)("/sapi/v2/loan/flexible/loanable/data", "GET", {}, apiKey, apiSecret),
        ]);
        const ongoing = (ongoingRes === null || ongoingRes === void 0 ? void 0 : ongoingRes.rows) || ongoingRes || [];
        const collateral = (collateralRes === null || collateralRes === void 0 ? void 0 : collateralRes.rows) || collateralRes || [];
        const loanable = (loanableRes === null || loanableRes === void 0 ? void 0 : loanableRes.rows) || loanableRes || [];
        res.status(200).json({ ongoing, collateral, loanable });
    }
    catch (error) {
        console.error("[syncBinanceLoans] Error:", error.message);
        res.status(200).json({ ongoing: [], collateral: [], loanable: [], error: error.message });
    }
});
exports.syncBybitLoans = functions
    .region("europe-west1")
    .runWith({ secrets: ["FUNCTIONS_CONFIG_EXPORT"], memory: "128MB" })
    .https.onRequest(async (req, res) => {
    setCorsHeaders(res);
    if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
    }
    try {
        const config = JSON.parse(BINANCE_SECRET.value());
        const bybitConfig = config.bybit;
        if (!(bybitConfig === null || bybitConfig === void 0 ? void 0 : bybitConfig.api_key) || !(bybitConfig === null || bybitConfig === void 0 ? void 0 : bybitConfig.api_secret)) {
            res.status(401).json({ position: null, flexibleLoans: [], collateralData: {}, error: "Bybit API keys not configured" });
            return;
        }
        const { api_key: apiKey, api_secret: apiSecret } = bybitConfig;
        const [positionRes, ongoingRes] = await Promise.all([
            (0, apiClients_1.bybitRequest)("/v5/crypto-loan-common/position", {}, apiKey, apiSecret),
            (0, apiClients_1.bybitRequest)("/v5/crypto-loan-flexible/ongoing-coin", {}, apiKey, apiSecret),
        ]);
        const posResult = positionRes || {};
        const ongoingResult = ongoingRes || {};
        const borrowList = (posResult.borrowList || []).map((b) => ({
            flexibleHourlyInterestRate: b.flexibleHourlyInterestRate || "0",
            flexibleTotalDebt: b.flexibleTotalDebt || "0",
            loanCurrency: b.loanCurrency || "",
        }));
        const collateralList = (posResult.collateralList || []).map((c) => ({
            amount: c.amount || "0",
            amountUSD: c.amountUSD || "0",
            currency: c.currency || "",
        }));
        const totalDebt = parseFloat(posResult.totalDebt || "0");
        const totalCollateral = parseFloat(posResult.totalCollateral || "0");
        const ltv = posResult.ltv || "0";
        const position = {
            borrowList, collateralList,
            loans: posResult.borrowList || [],
            ltv, totalCollateral: String(totalCollateral), totalDebt: String(totalDebt),
        };
        const ongoingList = ongoingResult.list || [];
        const flexibleLoans = borrowList.map((b) => {
            const ongoing = ongoingList.find((o) => o.loanCurrency === b.loanCurrency);
            return {
                hourlyInterestRate: b.flexibleHourlyInterestRate,
                loanCurrency: b.loanCurrency,
                totalDebt: b.flexibleTotalDebt,
                unpaidInterest: (ongoing === null || ongoing === void 0 ? void 0 : ongoing.unpaidInterest) || "0",
            };
        });
        const collateralData = {};
        for (const c of collateralList) {
            collateralData[c.currency] = [{
                    currency: c.currency, initialLTV: "0.80", marginCallLTV: "0.87", liquidationLTV: "0.92",
                }];
        }
        res.status(200).json({ position, flexibleLoans, collateralData });
    }
    catch (error) {
        console.error("[syncBybitLoans] Error:", error.message);
        res.status(500).json({ position: null, flexibleLoans: [], collateralData: {}, error: error.message });
    }
});
exports.debugAlerts = functions.region('europe-west1').runWith({ memory: "128MB" }).https.onRequest(async (req, res) => {
    const doc = await db.collection("config").doc("alerts").get();
    res.json(doc.data());
});
exports.debugInversiones = functions.region('europe-west1').runWith({ memory: "128MB" }).https.onRequest(async (req, res) => {
    const snap = await db.collection("inversiones").get();
    res.json(snap.docs.map(d => d.data()));
});
exports.debugLogs = functions.region('europe-west1').runWith({ memory: "128MB" }).https.onRequest(async (req, res) => {
    const snap = await db.collection("notificationLogs").orderBy("sentAt", "desc").limit(10).get();
    res.json(snap.docs.map(d => d.data()));
});
//# sourceMappingURL=index.js.map