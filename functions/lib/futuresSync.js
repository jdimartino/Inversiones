"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.futuresSync = void 0;
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const crypto = require("crypto");
const axios_1 = require("axios");
const params_1 = require("firebase-functions/params");
const binanceConfigRaw = (0, params_1.defineSecret)("FUNCTIONS_CONFIG_EXPORT");
// ─── Helpers ──────────────────────────────────────────────────────────────────
function sign(queryString, secret) {
    return crypto.createHmac("sha256", secret).update(queryString).digest("hex");
}
async function binanceGet(path, params, apiKey, apiSecret) {
    const timestamp = Date.now();
    const qs = new URLSearchParams(Object.assign(Object.assign({}, params), { timestamp: String(timestamp), recvWindow: "5000" })).toString();
    const signature = sign(qs, apiSecret);
    const url = `https://fapi.binance.com${path}?${qs}&signature=${signature}`;
    const { data } = await axios_1.default.get(url, {
        headers: { "X-MBX-APIKEY": apiKey },
        timeout: 10000,
    });
    return data;
}
async function sendTelegram(text) {
    var _a;
    const token = process.env.TELEGRAM_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId)
        return false;
    try {
        const resp = await axios_1.default.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: chatId,
            text,
            parse_mode: "Markdown",
            disable_web_page_preview: true,
        });
        console.log(`[FuturesSync] Telegram enviado OK (status ${resp.status})`);
        return true;
    }
    catch (e) {
        console.error("[FuturesSync] Telegram error:", ((_a = e.response) === null || _a === void 0 ? void 0 : _a.data) || e.message);
        return false;
    }
}
// ─── Core Logic ───────────────────────────────────────────────────────────────
async function runFuturesSync() {
    var _a;
    const bConfig = JSON.parse(binanceConfigRaw.value()).binance;
    if (!(bConfig === null || bConfig === void 0 ? void 0 : bConfig.api_key) || !(bConfig === null || bConfig === void 0 ? void 0 : bConfig.api_secret)) {
        console.error("[FuturesSync] Binance API keys not configured.");
        return null;
    }
    const { api_key: apiKey, api_secret: apiSecret } = bConfig;
    try {
        // Call both endpoints in parallel
        const [accountRes, positionRes] = await Promise.all([
            binanceGet("/fapi/v3/account", {}, apiKey, apiSecret),
            binanceGet("/fapi/v2/positionRisk", {}, apiKey, apiSecret),
        ]);
        // Build position risk map
        const positionMap = new Map();
        for (const p of positionRes) {
            if (parseFloat(p.positionAmt) !== 0) {
                positionMap.set(p.symbol, p);
            }
        }
        // Enrich positions with risk data
        const positions = accountRes.positions
            .filter((p) => parseFloat(p.positionAmt) !== 0)
            .map((p) => {
            const risk = positionMap.get(p.symbol) || {};
            const entryPrice = parseFloat(risk.entryPrice || "0");
            const markPrice = parseFloat(risk.markPrice || "0");
            const liqPrice = parseFloat(risk.liquidationPrice || "0");
            const unrealizedPnl = parseFloat(p.unrealizedProfit);
            // Distance to liquidation % (absolute distance per side)
            let distToLiqPercent = 0;
            if (liqPrice > 0 && markPrice > 0) {
                if (parseFloat(p.positionAmt) > 0) {
                    // LONG: price must drop to hit liquidation
                    distToLiqPercent = ((markPrice - liqPrice) / markPrice) * 100;
                }
                else {
                    // SHORT: price must rise to hit liquidation
                    distToLiqPercent = ((liqPrice - markPrice) / markPrice) * 100;
                }
            }
            // ROE = PnL / initialMargin * 100
            const initialMargin = parseFloat(p.initialMargin);
            const roe = initialMargin > 0 ? (unrealizedPnl / initialMargin) * 100 : 0;
            return {
                symbol: p.symbol,
                side: parseFloat(p.positionAmt) > 0 ? "LONG" : "SHORT",
                size: Math.abs(parseFloat(p.positionAmt)),
                notional: Math.abs(parseFloat(p.notional)),
                entryPrice,
                markPrice,
                liquidationPrice: liqPrice,
                leverage: parseInt(risk.leverage || "1"),
                unrealizedPnl,
                initialMargin,
                maintMargin: parseFloat(p.maintMargin),
                marginType: risk.marginType || "cross",
                breakEvenPrice: parseFloat(risk.breakEvenPrice || "0"),
                distToLiqPercent,
                roe,
                updateTime: p.updateTime,
                fundingRate: parseFloat(risk.lastFundingRate || "0"),
            };
        });
        // Account summary
        const totalWalletBalance = parseFloat(accountRes.totalWalletBalance);
        const totalUnrealizedProfit = parseFloat(accountRes.totalUnrealizedProfit);
        const totalMarginBalance = parseFloat(accountRes.totalMarginBalance);
        const totalInitialMargin = parseFloat(accountRes.totalInitialMargin);
        const totalMaintMargin = parseFloat(accountRes.totalMaintMargin);
        const availableBalance = parseFloat(accountRes.availableBalance);
        const marginRatio = totalMarginBalance > 0
            ? (totalMaintMargin / totalMarginBalance) * 100
            : 0;
        const account = {
            totalWalletBalance,
            totalUnrealizedProfit,
            totalMarginBalance,
            totalInitialMargin,
            totalMaintMargin,
            availableBalance,
            maxWithdrawAmount: parseFloat(accountRes.maxWithdrawAmount),
            marginRatio,
        };
        const futuresData = {
            account,
            positions,
            lastSync: Date.now(),
        };
        // Save to Firestore
        await admin.firestore().collection("settings").doc("futuresData").set(futuresData);
        // Check alerts
        await checkFuturesAlerts(futuresData);
        return futuresData;
    }
    catch (e) {
        const errData = ((_a = e.response) === null || _a === void 0 ? void 0 : _a.data) || { message: e.message };
        console.error("[FuturesSync] Binance API error:", errData);
        return null;
    }
}
function normalizeFuturesGlobalAlerts(rawArray) {
    if (!Array.isArray(rawArray))
        return [];
    return rawArray.map((alert) => (Object.assign(Object.assign({}, alert), { direction: alert.direction || (alert.targetAmount >= 0 ? "up" : "down") })));
}
function migrateGlobalAlertDirections(alerts, currentPnl) {
    let changed = false;
    const migrated = alerts.map((alert) => {
        const correctDirection = alert.targetAmount >= currentPnl ? "up" : "down";
        if (alert.direction !== correctDirection) {
            changed = true;
            return Object.assign(Object.assign({}, alert), { direction: correctDirection });
        }
        return alert;
    });
    return { migrated, changed };
}
function formatSignedUsd(value) {
    return `${value >= 0 ? "+" : "-"}$${Math.abs(value).toFixed(2)}`;
}
// ─── Alert Logic ──────────────────────────────────────────────────────────────
async function checkFuturesAlerts(data) {
    // Read alert config from Firestore
    const configSnap = await admin.firestore().collection("config").doc("alerts").get();
    const conf = configSnap.exists ? configSnap.data() : {};
    const futuresAlerts = conf.futuresAlerts || {
        enabled: true,
        marginThresholds: [70, 80, 90],
        positionAlerts: {},
        _lastAlertedMargin: null,
    };
    if (!futuresAlerts.enabled)
        return;
    const marginPercent = data.account.marginRatio;
    const messages = [];
    // Check margin thresholds
    const thresholds = futuresAlerts.marginThresholds.sort((a, b) => b - a);
    let highestTriggered = null;
    for (const threshold of thresholds) {
        if (marginPercent >= threshold) {
            highestTriggered = threshold;
            break;
        }
    }
    // Only alert if we crossed a new threshold (or first time)
    if (highestTriggered !== null && highestTriggered !== futuresAlerts._lastAlertedMargin) {
        const emoji = highestTriggered >= 90 ? "🔴" : highestTriggered >= 80 ? "🟠" : "🟡";
        messages.push(`${emoji} *ALERTA MARGEN — Binance Futures*\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `Margen utilizado: *${marginPercent.toFixed(1)}%*\n` +
            `Disponible: *$${data.account.availableBalance.toFixed(2)}*\n` +
            `PnL total: *${data.account.totalUnrealizedProfit >= 0 ? "+" : ""}$${data.account.totalUnrealizedProfit.toFixed(2)}*\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `Buffer a liquidación: *${(100 - marginPercent).toFixed(1)}%*`);
        futuresAlerts._lastAlertedMargin = highestTriggered;
    }
    else if (highestTriggered === null) {
        futuresAlerts._lastAlertedMargin = null;
    }
    // Check per-position ROE/ROE USD alerts
    const positionAlerts = futuresAlerts.positionAlerts || {};
    futuresAlerts.positionAlerts = positionAlerts;
    for (const pos of data.positions) {
        const alertsForSymbol = positionAlerts[pos.symbol];
        if (!alertsForSymbol || alertsForSymbol.length === 0)
            continue;
        const remaining = [];
        for (const alert of alertsForSymbol) {
            let currentValue;
            let alertLabel;
            if (alert.type === "roe") {
                currentValue = pos.roe;
                alertLabel = `ROE % ${alert.direction === "up" ? ">=" : "<="} ${alert.targetValue}%`;
            }
            else {
                currentValue = pos.unrealizedPnl;
                alertLabel = `ROE USD ${alert.direction === "up" ? ">=" : "<="} $${alert.targetValue}`;
            }
            // Determine which side of threshold we're on
            const currentSide = alert.direction === "up"
                ? (currentValue >= alert.targetValue ? "above" : "below")
                : (currentValue <= alert.targetValue ? "above" : "below");
            const prevSide = alert._lastSide;
            // Trigger: condition met AND (not persistent OR crossing for first time OR crossed to other side)
            const isTriggered = currentSide === "above" &&
                (!alert.isPersistent || prevSide === undefined || prevSide !== currentSide);
            if (isTriggered) {
                const emoji = alert.direction === "up" ? "🟢" : "🔴";
                const valueStr = alert.type === "roe"
                    ? `${currentValue >= 0 ? "+" : ""}${currentValue.toFixed(1)}%`
                    : `${currentValue >= 0 ? "+" : ""}$${currentValue.toFixed(2)}`;
                const pnlStr = alert.type === "roe"
                    ? `${pos.unrealizedPnl >= 0 ? "+" : ""}$${pos.unrealizedPnl.toFixed(2)}`
                    : `${pos.roe >= 0 ? "+" : ""}${pos.roe.toFixed(2)}%`;
                messages.push(`${emoji} *${pos.symbol}* — Alerta de ${alert.type === "roe" ? "ROE %" : "ROE USD"}\n` +
                    `Valor actual: *${valueStr}*\n` +
                    `Meta: ${alertLabel}\n` +
                    `PnL: ${pnlStr}` +
                    (alert.note ? `\n_${alert.note}_` : ""));
                // One-shot: delete after firing. Persistent: keep with updated _lastSide.
                if (alert.isPersistent) {
                    remaining.push(Object.assign(Object.assign({}, alert), { _lastSide: currentSide }));
                }
                else {
                    console.log(`[FuturesSync] One-shot alert for ${pos.symbol} (${alertLabel}) fired and removed.`);
                }
            }
            else if (alert.isPersistent) {
                // Track _lastSide even when not triggered for future crossing detection
                remaining.push(Object.assign(Object.assign({}, alert), { _lastSide: currentSide }));
            }
            else {
                // One-shot alert not yet triggered: keep waiting
                remaining.push(alert);
            }
        }
        if (remaining.length === 0) {
            delete positionAlerts[pos.symbol];
        }
        else {
            positionAlerts[pos.symbol] = remaining;
        }
    }
    // Check global futures PNL alerts — identical logic to Watchlist (index.ts:278-312)
    const globalAlertsRaw = normalizeFuturesGlobalAlerts(futuresAlerts.globalAlerts || []);
    const futuresGlobalPnl = data.account.totalUnrealizedProfit;
    // One-time migration: fix alerts created with inverted direction for negative PNL
    let globalAlerts = globalAlertsRaw;
    if (!futuresAlerts._globalAlertsDirectionsMigrated) {
        const { migrated, changed } = migrateGlobalAlertDirections(globalAlertsRaw, futuresGlobalPnl);
        if (changed) {
            globalAlerts = migrated;
            futuresAlerts._globalAlertsDirectionsMigrated = true;
            console.log(`[FuturesSync] Migrated ${migrated.length} global alert directions`);
        }
        else {
            futuresAlerts._globalAlertsDirectionsMigrated = true;
        }
    }
    let remainingGlobalAlerts = [];
    let hasGlobalChanged = false;
    for (const rule of globalAlerts) {
        const target = rule.targetAmount;
        const direction = rule.direction || (target >= 0 ? "up" : "down");
        const currentSide = futuresGlobalPnl >= target ? "above" : "below";
        const prevSide = rule._lastSide;
        const conditionMet = direction === "up" ? futuresGlobalPnl >= target : futuresGlobalPnl <= target;
        const isTriggered = conditionMet && (!rule.isPersistent || prevSide === undefined || prevSide !== currentSide);
        if (isTriggered) {
            if (direction === "up") {
                messages.push(`🚨 *PNL Futuros* alcanzó *${formatSignedUsd(futuresGlobalPnl)}* (Meta: 🔼 >= ${formatSignedUsd(target)})` +
                    (rule.note ? `\n_📝 ${rule.note}_` : ""));
            }
            else {
                messages.push(`📉 *PNL Futuros* cayó a *${formatSignedUsd(futuresGlobalPnl)}* (Límite: 🔽 <= ${formatSignedUsd(target)})` +
                    (rule.note ? `\n_📝 ${rule.note}_` : ""));
            }
            console.log(`[FuturesSync] Global alert triggered: PNL $${futuresGlobalPnl.toFixed(2)} — Target: ${direction === "up" ? ">=" : "<="} $${target} — ${rule.isPersistent ? "PERSISTENT" : "ONE-SHOT"}`);
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
        futuresAlerts.globalAlerts = remainingGlobalAlerts;
    // Send messages
    for (const msg of messages) {
        await sendTelegram(msg);
    }
    // Save updated alert state
    await admin.firestore().collection("config").doc("alerts").set({ futuresAlerts }, { merge: true });
}
// ─── Cloud Function (scheduled every 3 minutes) ──────────────────────────────
exports.futuresSync = functions
    .region("europe-west1")
    .runWith({ secrets: ["TELEGRAM_TOKEN", "TELEGRAM_CHAT_ID", "FUNCTIONS_CONFIG_EXPORT"] })
    .pubsub.schedule("every 3 minutes")
    .onRun(async () => {
    try {
        console.log("[FuturesSync] Starting...");
        const data = await runFuturesSync();
        if (data) {
            console.log(`[FuturesSync] Done. Positions: ${data.positions.length}, ` +
                `Margin ratio: ${data.account.marginRatio.toFixed(1)}%, ` +
                `PnL: ${data.account.totalUnrealizedProfit.toFixed(2)}`);
        }
    }
    catch (e) {
        console.error("[FuturesSync] Error:", e);
    }
});
//# sourceMappingURL=futuresSync.js.map