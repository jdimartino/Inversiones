"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.futuresSync = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");
const axios_1 = require("axios");
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
        await axios_1.default.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: chatId,
            text,
            parse_mode: "Markdown",
            disable_web_page_preview: true,
        });
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
    const config = functions.config().binance;
    if (!(config === null || config === void 0 ? void 0 : config.api_key) || !(config === null || config === void 0 ? void 0 : config.api_secret)) {
        console.error("[FuturesSync] Binance API keys not configured.");
        return null;
    }
    const { api_key: apiKey, api_secret: apiSecret } = config;
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
            // Distance to liquidation %
            let distToLiqPercent = 0;
            if (liqPrice > 0 && markPrice > 0) {
                distToLiqPercent = ((markPrice - liqPrice) / markPrice) * 100;
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
// ─── Alert Logic ──────────────────────────────────────────────────────────────
async function checkFuturesAlerts(data) {
    // Read alert config from Firestore
    const configSnap = await admin.firestore().collection("config").doc("alerts").get();
    const conf = configSnap.exists ? configSnap.data() : {};
    const futuresAlerts = conf.futuresAlerts || {
        enabled: true,
        marginThresholds: [70, 80, 90],
        positionLiqThreshold: 10,
        positionAlerts: {},
        _lastAlertedMargin: null,
        _lastAlertedPositions: {},
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
    // Check individual position liquidation proximity
    const liqThreshold = futuresAlerts.positionLiqThreshold || 10;
    for (const pos of data.positions) {
        if (pos.distToLiqPercent > 0 && pos.distToLiqPercent < liqThreshold) {
            const lastAlerted = futuresAlerts._lastAlertedPositions[pos.symbol] || 0;
            const now = Date.now();
            // Don't re-alert within 30 minutes for the same position
            if (now - lastAlerted > 30 * 60 * 1000) {
                messages.push(`🔴 *POSICIÓN CERCA DE LIQUIDACIÓN*\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `*${pos.symbol}* ${pos.side} ${pos.leverage}x\n` +
                    `Entrada: $${pos.entryPrice} → Actual: $${pos.markPrice.toFixed(2)}\n` +
                    `Liquidación: $${pos.liquidationPrice.toFixed(2)}\n` +
                    `Distancia: *${pos.distToLiqPercent.toFixed(1)}%*\n` +
                    `PnL: ${pos.unrealizedPnl >= 0 ? "+" : ""}$${pos.unrealizedPnl.toFixed(2)}`);
                futuresAlerts._lastAlertedPositions[pos.symbol] = now;
            }
        }
    }
    // Check per-position ROE/ROE USD alerts
    const positionAlerts = futuresAlerts.positionAlerts || {};
    for (const pos of data.positions) {
        const alertsForSymbol = positionAlerts[pos.symbol];
        if (!alertsForSymbol || alertsForSymbol.length === 0)
            continue;
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
                messages.push(`${emoji} *${pos.symbol}* — Alerta de ${alert.type === "roe" ? "ROE %" : "ROE USD"}\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `Valor actual: *${valueStr}*\n` +
                    `Meta: ${alertLabel}\n` +
                    `${pos.side} ${pos.leverage}x\n` +
                    `PnL: ${pos.unrealizedPnl >= 0 ? "+" : ""}$${pos.unrealizedPnl.toFixed(2)}` +
                    (alert.note ? `\n_${alert.note}_` : ""));
            }
            // Update last side
            alert._lastSide = currentSide;
        }
    }
    // Send messages
    for (const msg of messages) {
        await sendTelegram(msg);
    }
    // Save updated alert state
    await admin.firestore().collection("config").doc("alerts").update({ futuresAlerts });
}
// ─── Cloud Function (scheduled every 3 minutes) ──────────────────────────────
exports.futuresSync = functions
    .region("europe-west1")
    .runWith({ secrets: ["TELEGRAM_TOKEN", "TELEGRAM_CHAT_ID"] })
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