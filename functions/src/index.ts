import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import axios from "axios";

admin.initializeApp();
const db = admin.firestore();

// ─── Telegram config (Ahora gestionados por Secret Manager) ──────────────────
const DIVIDER = "────────────────────";

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

// ─── Utils ────────────────────────────────────────────────────────────────────

/** Pausa async (para reintentos). */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Formatea un número como moneda de forma determinista. */
const fmt = (n: number): string => new Intl.NumberFormat('en-US').format(Math.round(n));

/** Devuelve "+" si el número es positivo, "" si es negativo. */
const pnlSign = (n: number): string => n >= 0 ? "+" : "";

/** Devuelve el emoji correspondiente al PNL. */
const pnlEmoji = (pnl: number): string => pnl >= 0 ? "🟢" : "🔴";

/** Formatea precios con precisión condicional: 4 decimales si < $1, 2 si >= $1. */
const fmtPrice = (price: number): string => {
    const dec = Math.abs(price) < 1 ? 4 : 2;
    return `$${price.toLocaleString("en-US", {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
    })}`;
};

/** Envío a Telegram con reintentos básicos. */
async function sendTelegram(text: string): Promise<boolean> {
    const token = process.env.TELEGRAM_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
        console.error("[Telegram] Faltan credenciales (TELEGRAM_TOKEN/TELEGRAM_CHAT_ID en Secret Manager).");
        return false;
    }

    const payload = {
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
    };

    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, payload);
            return true;
        } catch (e: any) {
            console.error(`[Telegram] Intento ${attempt} fallido:`, e.response?.data || e.message);
            if (attempt < 3) {
                await sleep(2000 * attempt);
            }
        }
    }

    console.error("[Telegram] Fallo definitivo tras 3 intentos.");
    return false;
}

// ─── Helper: normalizar formato legacy de alertas ────────────────────────────
function normalizeAlerts(raw: Record<string, unknown>): Record<string, AlertRule[]> {
    const normalized: Record<string, AlertRule[]> = {};
    for (const [id, value] of Object.entries(raw)) {
        let alertsArray: AlertRule[] = [];
        if (Array.isArray(value)) {
            alertsArray = value as AlertRule[];
        } else if (value && typeof value === "object") {
            alertsArray = [value as AlertRule];
        }
        normalized[id] = alertsArray.map(alert => {
            let type = alert.type;
            if (!type) {
                if (typeof alert.targetValue === 'number') type = 'price';
                else type = 'pnl';
            }

            return {
                ...alert,
                type,
                direction: alert.direction || (
                    type === 'pnl' 
                    ? ((alert.targetPercent || 0) >= 0 ? 'up' : 'down')
                    : 'up'
                )
            };
        });
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

// ─── Core Logic ───────────────────────────────────────────────────────────────
async function runCheckAlerts() {
    console.log("[v2.2] Iniciando comprobación de alertas...");
    // Use the same Binance API as the frontend to ensure price consistency
    const SYMBOL_MAP: Record<string, string> = {
        BTC: "BTCUSDT", ETH: "ETHUSDT", ADA: "ADAUSDT", DOGE: "DOGEUSDT",
        LTC: "LTCUSDT", BNB: "BNBUSDT", SOL: "SOLUSDT", XRP: "XRPUSDT",
        DOT: "DOTUSDT", MATIC: "MATICUSDT", SHIB: "SHIBUSDT", AVAX: "AVAXUSDT",
        LINK: "LINKUSDT",
    };
    const symbols = Object.values(SYMBOL_MAP);
    const param = JSON.stringify(symbols);
    const { data: tickerData } = await axios.get(
        `https://api.binance.com/api/v3/ticker/price?symbols=${encodeURIComponent(param)}`
    );
    const prices: Record<string, number> = {};
    const reverseMap = Object.fromEntries(Object.entries(SYMBOL_MAP).map(([k, v]) => [v, k]));
    for (const item of tickerData) {
        // Store both formats: "BTC" and "BTCUSDT" for compatibility
        prices[item.symbol] = parseFloat(item.price);
        const coin = reverseMap[item.symbol];
        if (coin) prices[`${coin}USDT`] = parseFloat(item.price);
    }

    const configSnap = await db.collection("config").doc("alerts").get();
    let investmentAlerts: Record<string, AlertRule[]> = {};
    let globalAlerts: GlobalAlertRule[] = [];
    let watchlistAlerts: Record<string, WatchlistAlertRule[]> = {};

    let saleMeta: Record<string, { coin: string; usdtReceived: number; quantity: number }> = {};

    if (configSnap.exists) {
        const conf = configSnap.data()!;
        if (conf.globalAlerts !== undefined) {
            globalAlerts = normalizeGlobalAlerts(conf.globalAlerts);
        }
        if (conf.investmentAlerts) {
            investmentAlerts = normalizeAlerts(conf.investmentAlerts);
        }
        if (conf.watchlistAlerts) {
            for (const [coin, arr] of Object.entries(conf.watchlistAlerts)) {
                if (Array.isArray(arr)) watchlistAlerts[coin] = arr as WatchlistAlertRule[];
            }
        }
        if (conf.saleMeta) {
            saleMeta = conf.saleMeta as typeof saleMeta;
        }
    }

    const dbUpdates: any = {};

    // Get active sales from the "ventas" collection for fallback and cleanup
    const ventasSnap = await db.collection("ventas").get();
    const activeSaleIds = new Set(ventasSnap.docs.map(d => `sale_${d.id}`));

    // Fill in any saleMeta entries missing from the config by reading the active sales.
    // This is a fallback for sales whose metadata was lost due to the overwrite bug.
    const hasMissingSaleMeta = Object.keys(investmentAlerts).some(
        k => k.startsWith('sale_') && activeSaleIds.has(k) && !saleMeta[k]
    );
    if (hasMissingSaleMeta) {
        ventasSnap.forEach(d => {
            const saleKey = `sale_${d.id}`;
            if (investmentAlerts[saleKey] && !saleMeta[saleKey]) {
                const v = d.data();
                saleMeta[saleKey] = { coin: v.coin, usdtReceived: v.usdtReceived, quantity: v.quantity };
                // Persist the recovered entry so the fallback doesn't run every check
                dbUpdates[`saleMeta.${saleKey}`] = saleMeta[saleKey];
                console.log(`[FALLBACK] saleMeta recuperado y persistido para ${saleKey} (${v.coin})`);
            }
        });
    }

    const snap = await db.collection("inversiones").get();

    let totalInvested = 0;
    let totalCurrentValue = 0;
    const triggeredIndividualMessages: string[] = [];
    let hasGlobalAlertsToRemove = false;
    const individualAssets: { id: string, coin: string, pnl: number, roi: number }[] = [];

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
            const remaining: AlertRule[] = [];
            let hasInvChanged = false;

            for (const rule of alertRules) {
                const type = rule.type || 'pnl';
                const direction = rule.direction || (type === 'pnl' ? ((rule.targetPercent || 0) >= 0 ? 'up' : 'down') : 'up');

                // Which side of the threshold is the current value on?
                const currentSide: 'above' | 'below' = (type === 'pnl')
                    ? (roiPercent >= (rule.targetPercent || 0) ? 'above' : 'below')
                    : (currentPrice >= (rule.targetValue || 0) ? 'above' : 'below');
                const prevSide = rule._lastSide;

                // Base condition check
                let conditionMet = false;
                if (type === 'pnl' && inv.invested > 0) {
                    const target = rule.targetPercent || 0;
                    if (direction === 'up' && roiPercent >= target) conditionMet = true;
                    else if (direction === 'down' && roiPercent <= target) conditionMet = true;
                } else if (type === 'pnl' && !(inv.invested > 0)) {
                    console.warn(`[SKIP] Alerta PNL ignorada — invested=0 para ${inv.coin} (${docSnap.id})`);
                } else if (type === 'price') {
                    const target = rule.targetValue || 0;
                    if (direction === 'up' && currentPrice >= target) conditionMet = true;
                    else if (direction === 'down' && currentPrice <= target) conditionMet = true;
                }

                // Persistent alerts fire on crossing OR on first evaluation (prevSide undefined) if condition is already met
                const isTriggered = conditionMet && (
                    !rule.isPersistent || prevSide === undefined || prevSide !== currentSide
                );

                if (isTriggered) {
                    if (type === 'pnl' && inv.invested > 0) {
                        const target = rule.targetPercent || 0;
                        if (direction === 'up') {
                            triggeredIndividualMessages.push(
                                `🚀 *${inv.coin}* subió a *${pnlSign(roiPercent)}${roiPercent.toFixed(1)}%* (Meta: 🔼 >= ${target}%)`
                                + `\n${pnlEmoji(pnl)} PNL neto: ${pnlSign(pnl)}$${fmt(pnl)}`
                                + (rule.note ? `\n_📝 ${rule.note}_` : "")
                            );
                        } else {
                            triggeredIndividualMessages.push(
                                `📉 *${inv.coin}* cayó a *${roiPercent.toFixed(1)}%* (Límite: 🔽 <= ${target}%)`
                                + `\n${pnlEmoji(pnl)} PNL neto: ${pnlSign(pnl)}$${fmt(pnl)}`
                                + (rule.note ? `\n_📝 ${rule.note}_` : "")
                            );
                        }
                    } else if (type === 'price') {
                        const target = rule.targetValue || 0;
                        if (direction === 'up') {
                            triggeredIndividualMessages.push(
                                `💰 *${inv.coin}* alcanzó *${fmtPrice(currentPrice)}* (Meta: 🔼 >= ${fmtPrice(target)})`
                                + `\n${pnlEmoji(pnl)} PNL neto: ${pnlSign(pnl)}$${fmt(pnl)} (${pnlSign(roiPercent)}${roiPercent.toFixed(1)}%)`
                                + (rule.note ? `\n_📝 ${rule.note}_` : "")
                            );
                        } else {
                            triggeredIndividualMessages.push(
                                `📉 *${inv.coin}* bajó a *${fmtPrice(currentPrice)}* (Límite: 🔽 <= ${fmtPrice(target)})`
                                + `\n${pnlEmoji(pnl)} PNL neto: ${pnlSign(pnl)}$${fmt(pnl)} (${pnlSign(roiPercent)}${roiPercent.toFixed(1)}%)`
                                + (rule.note ? `\n_📝 ${rule.note}_` : "")
                            );
                        }
                    }

                    const tipo = rule.isPersistent ? "PERMANENTE" : "UNA VEZ";
                    const targetVal = type === 'pnl' ? `${rule.targetPercent}%` : `${rule.targetValue}`;
                    console.log(`[ALERTA v3] ${inv.coin} (${docSnap.id}) — ${type.toUpperCase()}: ${type === 'pnl' ? roiPercent.toFixed(2) + '%' : currentPrice} — Target: ${direction === 'up' ? '>=' : '<='} ${targetVal} — Tipo: ${tipo}`);

                    if (rule.isPersistent) {
                        remaining.push({ ...rule, _lastSide: currentSide });
                        hasInvChanged = true;
                    } else {
                        console.log(`[ONE-SHOT] Alerta ${inv.coin} (${targetVal}) eliminada.`);
                        hasInvChanged = true;
                    }
                } else {
                    if (rule.isPersistent) {
                        // Update _lastSide even when not triggered (tracks position for next crossing)
                        if (prevSide !== currentSide) hasInvChanged = true;
                        remaining.push({ ...rule, _lastSide: currentSide });
                    } else {
                        remaining.push(rule);
                    }
                }
            }

            if (remaining.length === 0) {
                delete investmentAlerts[docSnap.id];
                dbUpdates[`investmentAlerts.${docSnap.id}`] = admin.firestore.FieldValue.delete();
            } else if (hasInvChanged) {
                investmentAlerts[docSnap.id] = remaining;
                dbUpdates[`investmentAlerts.${docSnap.id}`] = remaining;
            }
        }

        individualAssets.push({ id: docSnap.id, coin: inv.coin, pnl, roi: roiPercent || 0 });
    });

    // Cleanup orphaned alerts (IDs that no longer exist in 'inversiones' or 'ventas')
    const activeInvIds = new Set(snap.docs.map(d => d.id));
    for (const alertKey of Object.keys(investmentAlerts)) {
        if (alertKey.startsWith('sale_')) {
            if (!activeSaleIds.has(alertKey)) {
                console.log(`[CLEANUP] Alerta de venta huérfana detectada para ${alertKey}. Eliminando...`);
                delete investmentAlerts[alertKey];
                dbUpdates[`investmentAlerts.${alertKey}`] = admin.firestore.FieldValue.delete();
                if (saleMeta[alertKey]) {
                    delete saleMeta[alertKey];
                    dbUpdates[`saleMeta.${alertKey}`] = admin.firestore.FieldValue.delete();
                }
            }
        } else {
            if (!activeInvIds.has(alertKey)) {
                console.log(`[CLEANUP] Alerta huérfana detectada para inversion ID: ${alertKey}. Eliminando...`);
                delete investmentAlerts[alertKey];
                dbUpdates[`investmentAlerts.${alertKey}`] = admin.firestore.FieldValue.delete();
            }
        }
    }

    // Also clean up any orphaned saleMeta entries that don't have corresponding active sale IDs
    for (const metaKey of Object.keys(saleMeta)) {
        if (!activeSaleIds.has(metaKey)) {
            console.log(`[CLEANUP] saleMeta huérfano detectado para ${metaKey}. Eliminando...`);
            delete saleMeta[metaKey];
            dbUpdates[`saleMeta.${metaKey}`] = admin.firestore.FieldValue.delete();
        }
    }

    // Process sale-based alerts (sale_ prefix) using saleMeta for context
    for (const [saleKey, alertRules] of Object.entries(investmentAlerts)) {
        if (!saleKey.startsWith('sale_')) continue;
        const meta = saleMeta[saleKey];
        if (!meta) {
            console.warn(`[SKIP] Alerta de venta ignorada — saleMeta faltante para ${saleKey}. Verificar colección ventas.`);
            continue;
        }

        const symbol = `${meta.coin}USDT`;
        const currentPrice = prices[symbol] || 0;
        if (currentPrice === 0) continue;

        const roi = meta.usdtReceived > 0
            ? ((meta.usdtReceived - meta.quantity * currentPrice) / meta.usdtReceived) * 100
            : 0;
        const recompraPnl = meta.usdtReceived - meta.quantity * currentPrice;

        const remaining: AlertRule[] = [];
        let hasChanged = false;

        for (const rule of alertRules) {
            const type = rule.type || 'price';
            const direction = rule.direction || 'down';
            let conditionMet = false;
            const currentSide: 'above' | 'below' = type === 'pnl'
                ? (roi >= (rule.targetPercent || 0) ? 'above' : 'below')
                : (currentPrice >= (rule.targetValue || 0) ? 'above' : 'below');
            const prevSide = rule._lastSide;

            if (type === 'pnl') {
                const target = rule.targetPercent || 0;
                if (direction === 'up' && roi >= target) conditionMet = true;
                else if (direction === 'down' && roi <= target) conditionMet = true;
            } else {
                const target = rule.targetValue || 0;
                if (direction === 'up' && currentPrice >= target) conditionMet = true;
                else if (direction === 'down' && currentPrice <= target) conditionMet = true;
            }

            const isTriggered = conditionMet && (!rule.isPersistent || prevSide === undefined || prevSide !== currentSide);

            if (isTriggered) {
                if (type === 'pnl') {
                    const target = rule.targetPercent || 0;
                    triggeredIndividualMessages.push(
                        direction === 'up'
                            ? `🚀 *${meta.coin}* (venta) subió a *${pnlSign(roi)}${roi.toFixed(1)}%* (Meta: 🔼 >= ${target}%)\n${pnlEmoji(recompraPnl)} Si recompras: ${pnlSign(recompraPnl)}$${fmt(recompraPnl)}` + (rule.note ? `\n_📝 ${rule.note}_` : "")
                            : `📉 *${meta.coin}* (venta) bajó a *${roi.toFixed(1)}%* (Límite: 🔽 <= ${target}%)\n${pnlEmoji(recompraPnl)} Si recompras: ${pnlSign(recompraPnl)}$${fmt(recompraPnl)}` + (rule.note ? `\n_📝 ${rule.note}_` : "")
                    );
                } else {
                    const target = rule.targetValue || 0;
                    triggeredIndividualMessages.push(
                        direction === 'up'
                            ? `💰 *${meta.coin}* (venta) alcanzó *${fmtPrice(currentPrice)}* (Meta: 🔼 >= ${fmtPrice(target)})\n${pnlEmoji(recompraPnl)} Si recompras: ${pnlSign(recompraPnl)}$${fmt(recompraPnl)} (${pnlSign(roi)}${roi.toFixed(1)}%)` + (rule.note ? `\n_📝 ${rule.note}_` : "")
                            : `📉 *${meta.coin}* (venta) bajó a *${fmtPrice(currentPrice)}* (Límite: 🔽 <= ${fmtPrice(target)})\n${pnlEmoji(recompraPnl)} Si recompras: ${pnlSign(recompraPnl)}$${fmt(recompraPnl)} (${pnlSign(roi)}${roi.toFixed(1)}%)` + (rule.note ? `\n_📝 ${rule.note}_` : "")
                    );
                }
                console.log(`[SALE ALERT v3] ${meta.coin} (${saleKey}) — ${type.toUpperCase()}: ${type === 'pnl' ? roi.toFixed(2) + '%' : currentPrice} — Target: ${direction === 'up' ? '>=' : '<='} ${type === 'pnl' ? rule.targetPercent + '%' : rule.targetValue} — Tipo: ${rule.isPersistent ? 'PERMANENTE' : 'UNA VEZ'}`);
                if (rule.isPersistent) {
                    remaining.push({ ...rule, _lastSide: currentSide });
                    hasChanged = true;
                } else {
                    hasChanged = true;
                }
            } else {
                if (rule.isPersistent && prevSide !== currentSide) hasChanged = true;
                remaining.push({ ...rule, _lastSide: currentSide });
            }
        }

        if (hasChanged) {
            if (remaining.length === 0) {
                delete investmentAlerts[saleKey];
                dbUpdates[`investmentAlerts.${saleKey}`] = admin.firestore.FieldValue.delete();
            } else {
                investmentAlerts[saleKey] = remaining;
                dbUpdates[`investmentAlerts.${saleKey}`] = remaining;
            }
        }
    }

    individualAssets.sort((a, b) => b.pnl - a.pnl);

    const globalPNL = totalCurrentValue - totalInvested;
    const triggeredGlobalMessages: string[] = [];
    let remainingGlobalAlerts: GlobalAlertRule[] = [];

    let hasGlobalChanged = false;
    for (const rule of globalAlerts) {
        const target = rule.targetAmount;
        const direction = rule.direction || (target >= 0 ? 'up' : 'down');

        const currentSide: 'above' | 'below' = globalPNL >= target ? 'above' : 'below';
        const prevSide = rule._lastSide;

        let conditionMet = false;
        if (direction === 'up' && globalPNL >= target) conditionMet = true;
        else if (direction === 'down' && globalPNL <= target) conditionMet = true;

        const isTriggered = conditionMet && (
            !rule.isPersistent || prevSide === undefined || prevSide !== currentSide
        );

        if (isTriggered) {
            if (direction === 'up') {
                triggeredGlobalMessages.push(
                    `🚀 *PNL Global* alcanzó *${pnlSign(globalPNL)}$${fmt(globalPNL)}* (Meta: 🔼 >= ${pnlSign(target)}$${fmt(target)})`
                    + (rule.note ? `\n_📝 ${rule.note}_` : "")
                );
            } else {
                triggeredGlobalMessages.push(
                    `📉 *PNL Global* cayó a *${pnlSign(globalPNL)}$${fmt(globalPNL)}* (Límite: 🔽 <= ${pnlSign(target)}$${fmt(target)})`
                    + (rule.note ? `\n_📝 ${rule.note}_` : "")
                );
            }
            const tipo = rule.isPersistent ? "PERMANENTE" : "UNA VEZ";
            console.log(`[ALERTA GLOBAL v3] PNL: $${globalPNL.toFixed(2)} — Target: ${direction === 'up' ? '>=' : '<='} $${target} — Tipo: ${tipo}`);
            if (rule.isPersistent) {
                remainingGlobalAlerts.push({ ...rule, _lastSide: currentSide });
                hasGlobalChanged = true;
            } else {
                hasGlobalAlertsToRemove = true;
                hasGlobalChanged = true;
                console.log(`[ONE-SHOT GLOBAL] Alerta Global ($${target}) eliminada.`);
            }
        } else {
            if (rule.isPersistent) {
                if (prevSide !== currentSide) hasGlobalChanged = true;
                remainingGlobalAlerts.push({ ...rule, _lastSide: currentSide });
            } else {
                remainingGlobalAlerts.push(rule);
            }
        }
    }

    // ── Watchlist alerts ──────────────────────────────────────────────────────
    const triggeredWatchlistMessages: string[] = [];
    const watchlistDbUpdates: any = {};
    for (const [coin, rules] of Object.entries(watchlistAlerts)) {
        const symbol = `${coin}USDT`;
        const currentPrice = prices[symbol] || 0;
        if (currentPrice === 0) continue;

        const remaining: WatchlistAlertRule[] = [];
        let hasWatchlistCoinChanged = false;

        for (const rule of rules) {
            const currentSide: 'above' | 'below' = currentPrice >= rule.targetValue ? 'above' : 'below';
            const prevSide = rule._lastSide;

            let conditionMet = false;
            if (rule.direction === 'up' && currentPrice >= rule.targetValue) conditionMet = true;
            else if (rule.direction === 'down' && currentPrice <= rule.targetValue) conditionMet = true;

            // Persistent: fire on crossing or first evaluation; one-shot: fire whenever condition is met
            const isTriggered = conditionMet && (
                !rule.isPersistent || prevSide === undefined || prevSide !== currentSide
            );

            if (isTriggered) {
                triggeredWatchlistMessages.push(
                    rule.direction === 'up'
                        ? `👁 *${coin}* alcanzó *${fmtPrice(currentPrice)}* (Watchlist: 🔼 >= ${fmtPrice(rule.targetValue)})` + (rule.note ? `\n_📝 ${rule.note}_` : "")
                        : `👁 *${coin}* bajó a *${fmtPrice(currentPrice)}* (Watchlist: 🔽 <= ${fmtPrice(rule.targetValue)})` + (rule.note ? `\n_📝 ${rule.note}_` : "")
                );
                console.log(`[WATCHLIST v3] ${coin}: ${currentPrice} — Target: ${rule.direction === 'up' ? '>=' : '<='} ${rule.targetValue} — Tipo: ${rule.isPersistent ? 'PERMANENTE' : 'UNA VEZ'}`);
                if (rule.isPersistent) {
                    remaining.push({ ...rule, _lastSide: currentSide });
                    hasWatchlistCoinChanged = true;
                }
                // one-shot: removed (not pushed to remaining)
            } else {
                if (rule.isPersistent) {
                    if (prevSide !== currentSide) hasWatchlistCoinChanged = true;
                    remaining.push({ ...rule, _lastSide: currentSide });
                } else {
                    remaining.push(rule);
                }
            }
        }

        if (remaining.length === 0) {
            watchlistDbUpdates[`watchlistAlerts.${coin}`] = admin.firestore.FieldValue.delete();
        } else if (remaining.length !== rules.length || hasWatchlistCoinChanged) {
            watchlistDbUpdates[`watchlistAlerts.${coin}`] = remaining;
        }
    }

    const shouldAlert = triggeredGlobalMessages.length > 0 || triggeredIndividualMessages.length > 0 || triggeredWatchlistMessages.length > 0;

    // ── Always clean legacy assetAlerts field if present (no Telegram needed) ──
    const legacyCleanup: any = {};
    if (configSnap.exists && configSnap.data()?.assetAlerts !== undefined) {
        legacyCleanup.assetAlerts = admin.firestore.FieldValue.delete();
        await db.collection("config").doc("alerts").update(legacyCleanup);
        console.log("[CLEANUP] Campo legacy assetAlerts eliminado.");
    }

    if (shouldAlert) {
        let message = ``;
        if (triggeredGlobalMessages.length > 0) message += `*🚨 Alertas Globales:*\n${triggeredGlobalMessages.join("\n")}\n\n`;
        if (triggeredIndividualMessages.length > 0) message += `${triggeredIndividualMessages.join("\n")}\n`;
        if (triggeredWatchlistMessages.length > 0) message += `${triggeredWatchlistMessages.join("\n")}\n`;
        message += `${DIVIDER}\n*PNL Total:* ${pnlSign(globalPNL)}$${fmt(globalPNL)} | *Invertido:* $${fmt(totalInvested)} | *Valor:* $${fmt(totalCurrentValue)}`;

        const sent = await sendTelegram(message);
        if (sent) {
            console.log(`✅ Alerta enviada.`);

            // CRITICAL FIX: Only remove ONE-SHOT alerts from Firestore AFTER
            // Telegram confirms delivery. If we delete first and Telegram fails,
            // the alert is permanently lost with no notification sent.
            if (hasGlobalAlertsToRemove || hasGlobalChanged) dbUpdates.globalAlerts = remainingGlobalAlerts;
            const allUpdates = { ...dbUpdates, ...watchlistDbUpdates };
            if (Object.keys(allUpdates).length > 0) {
                await db.collection("config").doc("alerts").update(allUpdates);
                console.log("[CLEANUP] Alertas UNA VEZ eliminadas de Firestore post-envío.");
            }

            await db.collection("notificationLogs").add({
                sentAt: new Date(),
                globalAlertTriggered: triggeredGlobalMessages.length > 0,
                globalPNL: Math.round(globalPNL),
                triggeredAssets: triggeredIndividualMessages,
                triggeredGlobalAlerts: triggeredGlobalMessages,
                triggeredWatchlistAlerts: triggeredWatchlistMessages,
                totalInvested: Math.round(totalInvested),
                totalCurrentValue: Math.round(totalCurrentValue),
                positionSnapshot: Object.fromEntries(
                    individualAssets.map(a => [a.id, { coin: a.coin, pnl: a.pnl, roi: a.roi }])
                ),
            });
            return { sent: true, summary: "Alerta enviada" };
        } else {
            console.error("[ERROR] Telegram falló. Las alertas UNA VEZ NO se eliminan para reintentarlo en la próxima ejecución.");
            return { sent: false, summary: "Fallo envío Telegram" };
        }
    } else {
        // No alerts triggered — still update _lastSide for position tracking and remove orphans.
        if (hasGlobalAlertsToRemove || hasGlobalChanged) dbUpdates.globalAlerts = remainingGlobalAlerts;
        const allUpdatesNoAlert = { ...dbUpdates, ...watchlistDbUpdates };
        if (Object.keys(allUpdatesNoAlert).length > 0) {
            await db.collection("config").doc("alerts").update(allUpdatesNoAlert);
        }
        console.log("Todo dentro de los límites.");
        return { sent: false, summary: "Sin alertas" };
    }
}

// ─── Cloud Functions ───────────────────────────────────────────────────────────

export { analyzeMarket } from "./analyzeMarket";


export const debugAlerts = functions.region('europe-west1').https.onRequest(async (req, res) => {
    try {
        const doc = await db.collection("config").doc("alerts").get();
        res.json(doc.data());
    } catch (e: any) {
        res.status(500).send(e.message);
    }
});

export const debugInversiones = functions.region('europe-west1').https.onRequest(async (req, res) => {
    try {
        const snap = await db.collection("inversiones").get();
        const data: any[] = [];
        snap.forEach(doc => data.push({ id: doc.id, ...doc.data() }));
        res.json(data);
    } catch (e: any) {
        res.status(500).send(e.message);
    }
});

export const debugLogs = functions.region('europe-west1').https.onRequest(async (req, res) => {
    try {
        const snap = await db.collection("notificationLogs").orderBy("sentAt", "desc").limit(10).get();
        const data: any[] = [];
        snap.forEach(doc => data.push({ id: doc.id, ...doc.data() }));
        res.json(data);
    } catch (e: any) {
        res.status(500).send(e.message);
    }
});

export const setupTestAlerts = functions.region('europe-west1').https.onRequest(async (req, res) => {
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
    } catch (e: any) {
        res.status(500).send(e.message);
    }
});

export const testAlerts = functions
    .region('europe-west1')
    .runWith({ secrets: ["TELEGRAM_TOKEN", "TELEGRAM_CHAT_ID"] })
    .https.onRequest(async (req, res) => {
    try {
        const result = await runCheckAlerts();
        res.json(result);
    } catch (e: any) {
        res.status(500).send(e.message);
    }
});

export const checkPNLAlerts = functions
    .region('europe-west1')
    .runWith({ secrets: ["TELEGRAM_TOKEN", "TELEGRAM_CHAT_ID"] })
    .pubsub.schedule("every 10 minutes").onRun(async (_context) => {
    try {
        await runCheckAlerts();
    } catch (e) {
        console.error("Error en checkPNLAlerts:", e);
    }
});

// ─── Trading Signals ──────────────────────────────────────────────────────────

// Indicator math (duplicated from frontend — pure functions, no browser deps)
function _calcEMASeries(closes: number[], period: number): number[] {
    if (closes.length < period) return [];
    const m = 2 / (period + 1);
    const sma = closes.slice(0, period).reduce((s, v) => s + v, 0) / period;
    const emas = [sma];
    for (let i = period; i < closes.length; i++) {
        emas.push((closes[i] - emas[emas.length - 1]) * m + emas[emas.length - 1]);
    }
    return emas;
}

function _calcRSI(closes: number[], period = 14): number {
    if (closes.length < period + 1) return 50;
    const changes = [];
    for (let i = 1; i < closes.length; i++) changes.push(closes[i] - closes[i - 1]);
    let avgGain = 0, avgLoss = 0;
    for (let i = 0; i < period; i++) {
        if (changes[i] >= 0) avgGain += changes[i]; else avgLoss += Math.abs(changes[i]);
    }
    avgGain /= period; avgLoss /= period;
    for (let i = period; i < changes.length; i++) {
        const c = changes[i];
        avgGain = (avgGain * (period - 1) + (c >= 0 ? c : 0)) / period;
        avgLoss = (avgLoss * (period - 1) + (c < 0 ? Math.abs(c) : 0)) / period;
    }
    if (avgLoss === 0) return 100;
    return 100 - 100 / (1 + avgGain / avgLoss);
}

function _calcMACD(closes: number[]) {
    if (closes.length < 26) return { line: 0, signal: 0, histogram: 0 };
    const e12 = _calcEMASeries(closes, 12);
    const e26 = _calcEMASeries(closes, 26);
    const offset = 14;
    const macdVals: number[] = [];
    for (let i = 0; i < e26.length; i++) {
        if (e12[i + offset] !== undefined) macdVals.push(e12[i + offset] - e26[i]);
    }
    if (!macdVals.length) return { line: 0, signal: 0, histogram: 0 };
    const line = macdVals[macdVals.length - 1];
    const sigSeries = _calcEMASeries(macdVals, 9);
    const sig = sigSeries.length ? sigSeries[sigSeries.length - 1] : 0;
    return { line, signal: sig, histogram: line - sig };
}

type TSignalStrength = 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';
const SIGNAL_EMOJI: Record<TSignalStrength, string> = {
    strong_buy: '🟢', buy: '🔵', hold: '⚪', sell: '🟠', strong_sell: '🔴',
};
const SIGNAL_LABEL_ES: Record<TSignalStrength, string> = {
    strong_buy: 'COMPRA FUERTE', buy: 'COMPRA', hold: 'MANTENER', sell: 'VENTA', strong_sell: 'VENTA FUERTE',
};

interface CoinAnalysis {
    coin: string;
    signal: TSignalStrength;
    confidence: number;
    rsi: number;
    macdHist: number;
    smaLabel: string;
}

function _analyzeCoin(coin: string, closes: number[], fgValue?: number): CoinAnalysis {
    const price = closes[closes.length - 1];
    const rsi = _calcRSI(closes);
    const sma20 = closes.length >= 20 ? closes.slice(-20).reduce((s, v) => s + v, 0) / 20 : 0;
    const sma50 = closes.length >= 50 ? closes.slice(-50).reduce((s, v) => s + v, 0) / 50 : 0;
    const macd = _calcMACD(closes);

    // Scoring
    let rsiScore = 0;
    if (rsi < 20) rsiScore = 2; else if (rsi < 30) rsiScore = 1;
    else if (rsi > 80) rsiScore = -2; else if (rsi > 70) rsiScore = -1;

    let smaScore = 0;
    let smaLabel = 'Neutral';
    if (sma20 > 0 && sma50 > 0) {
        if (price > sma20 && sma20 > sma50) { smaScore = 2; smaLabel = 'Alcista fuerte'; }
        else if (price > sma20) { smaScore = 1; smaLabel = 'Alcista'; }
        else if (price < sma20 && sma20 < sma50) { smaScore = -2; smaLabel = 'Bajista fuerte'; }
        else if (price < sma20) { smaScore = -1; smaLabel = 'Bajista'; }
    }

    let macdScore = macd.histogram > 0 ? 1 : macd.histogram < 0 ? -1 : 0;

    let fgScore = 0;
    let totalWeight = 0.80;
    if (fgValue !== undefined) {
        if (fgValue <= 20) fgScore = 1; else if (fgValue <= 40) fgScore = 0.5;
        else if (fgValue >= 80) fgScore = -1; else if (fgValue >= 60) fgScore = -0.5;
        totalWeight = 1.0;
    }

    const score = (rsiScore * 0.25 + smaScore * 0.25 + macdScore * 0.30 + fgScore * 0.20) / totalWeight;

    let signal: TSignalStrength;
    if (score >= 1.2) signal = 'strong_buy';
    else if (score >= 0.4) signal = 'buy';
    else if (score > -0.4) signal = 'hold';
    else if (score > -1.2) signal = 'sell';
    else signal = 'strong_sell';

    const confidence = Math.min(Math.round(Math.abs(score) / 2 * 100), 100);

    return { coin, signal, confidence, rsi, macdHist: macd.histogram, smaLabel };
}

async function runTradingSignals() {
    console.log("[Trading Signals] Analyzing markets...");

    const COINS: Record<string, string> = {
        BTC: "BTCUSDT", ETH: "ETHUSDT", ADA: "ADAUSDT", DOGE: "DOGEUSDT",
        LTC: "LTCUSDT", BNB: "BNBUSDT", SOL: "SOLUSDT", XRP: "XRPUSDT",
        DOT: "DOTUSDT", MATIC: "MATICUSDT", SHIB: "SHIBUSDT", AVAX: "AVAXUSDT",
        LINK: "LINKUSDT",
    };

    // Fetch Fear & Greed
    let fgValue: number | undefined;
    try {
        const fgRes = await axios.get("https://api.alternative.me/fng/?limit=1");
        fgValue = parseInt(fgRes.data.data?.[0]?.value, 10);
        if (isNaN(fgValue)) fgValue = undefined;
    } catch { fgValue = undefined; }

    // Fetch klines for all coins
    const analyses: CoinAnalysis[] = [];
    for (const [coin, symbol] of Object.entries(COINS)) {
        try {
            const { data } = await axios.get(`https://api.binance.com/api/v3/klines`, {
                params: { symbol, interval: "1h", limit: 100 },
            });
            const closes = data.map((k: any) => parseFloat(k[4]));
            if (closes.length >= 50) {
                analyses.push(_analyzeCoin(coin, closes, fgValue));
            }
        } catch (e: any) {
            console.error(`[Trading Signals] Error fetching ${coin}:`, e.message);
        }
    }

    // Filter strong signals only
    const strongSignals = analyses.filter(
        (a) => a.signal === "strong_buy" || a.signal === "strong_sell"
    );

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
    if (sent) console.log("[Trading Signals] Alert sent.");
    return { sent, summary: `${strongSignals.length} strong signal(s)`, analyses };
}

export const testTradingSignals = functions
    .region('europe-west1')
    .runWith({ secrets: ["TELEGRAM_TOKEN", "TELEGRAM_CHAT_ID"] })
    .https.onRequest(async (req, res) => {
    try {
        const result = await runTradingSignals();
        res.json(result);
    } catch (e: any) {
        res.status(500).send(e.message);
    }
});

export const checkTradingSignals = functions
    .region('europe-west1')
    .runWith({ secrets: ["TELEGRAM_TOKEN", "TELEGRAM_CHAT_ID"] })
    .pubsub.schedule("every 10 minutes").onRun(async (_context) => {
    try {
        await runTradingSignals();
    } catch (e) {
        console.error("Error en checkTradingSignals:", e);
    }
});

// ─── Daily Portfolio Report ───────────────────────────────────────────────────

async function runDailyReport() {
    const configSnap = await db.collection("config").doc("alerts").get();
    const conf = configSnap.exists ? configSnap.data()! : {};
    if (!conf.dailyReportEnabled) {
        console.log("[DailyReport] Desactivado, omitiendo.");
        return;
    }

    const SYMBOL_MAP: Record<string, string> = {
        BTC: "BTCUSDT", ETH: "ETHUSDT", ADA: "ADAUSDT", DOGE: "DOGEUSDT",
        LTC: "LTCUSDT", BNB: "BNBUSDT", SOL: "SOLUSDT", XRP: "XRPUSDT",
        DOT: "DOTUSDT", MATIC: "MATICUSDT", SHIB: "SHIBUSDT", AVAX: "AVAXUSDT",
        LINK: "LINKUSDT",
    };
    const symbols = Object.values(SYMBOL_MAP);
    const { data: tickerData } = await axios.get(
        `https://api.binance.com/api/v3/ticker/price?symbols=${encodeURIComponent(JSON.stringify(symbols))}`
    );
    const prices: Record<string, number> = {};
    for (const item of tickerData) {
        prices[item.symbol] = parseFloat(item.price);
    }

    const snap = await db.collection("inversiones").get();

    // Individual positions + aggregate per coin
    interface CoinData { invested: number; currentValue: number; currentPrice: number; totalQty: number; positions: number; }
    const coinMap: Record<string, CoinData> = {};
    const individualPositions: { coin: string; pnl: number; roi: number; line: string }[] = [];

    snap.forEach((docSnap) => {
        const inv = docSnap.data();
        const symbol = SYMBOL_MAP[inv.coin] || `${inv.coin}USDT`;
        const currentPrice = prices[symbol] || 0;
        const qty = inv.quantity || 0;
        const invested = inv.invested || 0;
        const currentValue = currentPrice * qty;
        const pnl = currentValue - invested;
        const roi = invested > 0 ? (pnl / invested) * 100 : 0;

        // individual line
        individualPositions.push({
            coin: inv.coin, pnl, roi,
            line: `${pnlEmoji(pnl)} *${inv.coin}:* ${pnlSign(pnl)}$${fmt(pnl)} (${pnlSign(roi)}${roi.toFixed(1)}%) · ${fmtPrice(currentPrice)}`,
        });

        // aggregate
        if (!coinMap[inv.coin]) coinMap[inv.coin] = { invested: 0, currentValue: 0, currentPrice, totalQty: 0, positions: 0 };
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
    const consolidatedLines: { pnl: number; line: string }[] = [];

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
        if (message.length + line.length + 1 > 3200) break;
        message += line + "\n";
    }

    // Section 2: Individual positions
    message += `${DIVIDER}\n📋 *Detalle por Posición:*\n`;
    for (const { line } of individualPositions) {
        if (message.length + line.length + 1 > 3700) { message += `_(y más...)_`; break; }
        message += line + "\n";
    }

    // Section 3: Ventas realizadas (en el mismo mensaje)
    const ventasSnap = await db.collection("ventas").get();
    if (!ventasSnap.empty) {
        const ventas = ventasSnap.docs.map(d => d.data());
        let totalRecibido = 0;
        let totalRecompraPnl = 0;

        const ventaLines: { date: number; line: string }[] = [];
        for (const v of ventas) {
            const symbol = SYMBOL_MAP[v.coin] || `${v.coin}USDT`;
            const cp = prices[symbol] || 0;
            const recompraPnl = cp > 0 ? v.usdtReceived - v.quantity * cp : null;
            totalRecibido += v.usdtReceived;
            if (recompraPnl !== null) totalRecompraPnl += recompraPnl;

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
            if (message.length + line.length + 1 > 4000) { message += `_(y más...)_\n`; break; }
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

export const dailyPortfolioReport = functions
    .region('europe-west1')
    .runWith({ secrets: ["TELEGRAM_TOKEN", "TELEGRAM_CHAT_ID"] })
    .pubsub.schedule("0 8 * * *")
    .timeZone("America/Caracas")
    .onRun(async (_context) => {
        try {
            await runDailyReport();
        } catch (e) {
            console.error("Error en dailyPortfolioReport:", e);
        }
    });

export const testDailyReport = functions
    .region('europe-west1')
    .runWith({ secrets: ["TELEGRAM_TOKEN", "TELEGRAM_CHAT_ID"] })
    .https.onRequest(async (_req, res) => {
    try {
        await runDailyReport();
        res.json({ ok: true });
    } catch (e: any) {
        res.status(500).send(e.message);
    }
});

// ─── Daily PNL Snapshot ───────────────────────────────────────────────────────

const SNAPSHOT_SYMBOL_MAP: Record<string, string> = {
    BTC: "BTCUSDT", ETH: "ETHUSDT", ADA: "ADAUSDT", DOGE: "DOGEUSDT",
    LTC: "LTCUSDT", BNB: "BNBUSDT", SOL: "SOLUSDT", XRP: "XRPUSDT",
    DOT: "DOTUSDT", MATIC: "MATICUSDT", SHIB: "SHIBUSDT", AVAX: "AVAXUSDT",
    LINK: "LINKUSDT",
};

async function runDailyPnlSnapshot(): Promise<void> {
    const today = new Date().toLocaleDateString("en-CA", {
        timeZone: "America/Argentina/Buenos_Aires",
    }); // YYYY-MM-DD en zona Argentina

    // Idempotente: si ya existe el snapshot de hoy no hace nada
    const existing = await db.collection("pnlSnapshots").doc(today).get();
    if (existing.exists) {
        console.log(`[snapshot] Ya existe para ${today}, salteando.`);
        return;
    }

    // Leer portfolio y ventas en paralelo
    const [portfolioSnap, salesSnap] = await Promise.all([
        db.collection("inversiones").get(),
        db.collection("ventas").get(),
    ]);

    const portfolio = portfolioSnap.docs.map(d => d.data());
    const sales = salesSnap.docs.map(d => d.data());

    if (!portfolio.length && !sales.length) {
        console.log("[snapshot] Sin datos, salteando.");
        return;
    }

    // Obtener precios de Binance
    const symbols = Object.values(SNAPSHOT_SYMBOL_MAP);
    const { data: tickerData } = await axios.get<{ symbol: string; price: string }[]>(
        `https://api.binance.com/api/v3/ticker/price?symbols=${encodeURIComponent(JSON.stringify(symbols))}`
    );
    const reverseMap = Object.fromEntries(
        Object.entries(SNAPSHOT_SYMBOL_MAP).map(([coin, sym]) => [sym, coin])
    );
    const prices: Record<string, number> = { USDT: 1 };
    for (const item of tickerData) {
        const coin = reverseMap[item.symbol];
        if (coin) prices[coin] = parseFloat(item.price);
    }

    // Calcular PNL de compras (portfolio activo)
    let portfolioInvested = 0;
    let portfolioValue = 0;
    for (const item of portfolio) {
        const currentPrice = prices[item.coin as string] || Number(item.buyPrice) || 0;
        portfolioInvested += Number(item.invested) || 0;
        portfolioValue += Number(item.quantity) * currentPrice;
    }
    const portfolioPnl = portfolioValue - portfolioInvested;
    const portfolioRoi = portfolioInvested > 0 ? (portfolioPnl / portfolioInvested) * 100 : 0;

    // Calcular recompra PNL de ventas (cuánto cobré vs cuánto cuesta recomprar hoy)
    let salesReceived = 0;
    let salesCost = 0;
    for (const sale of sales) {
        const currentPrice = prices[sale.coin as string] || 0;
        salesReceived += Number(sale.usdtReceived) || 0;
        salesCost += Number(sale.quantity) * currentPrice;
    }
    const salesPnl = salesReceived - salesCost;
    const salesRoi = salesReceived > 0 ? (salesPnl / salesReceived) * 100 : 0;

    await db.collection("pnlSnapshots").doc(today).set({
        date: today,
        timestamp: Date.now(),
        portfolioInvested,
        portfolioValue,
        portfolioPnl,
        portfolioRoi,
        salesReceived,
        salesCost,
        salesPnl,
        salesRoi,
    });

    console.log(
        `[snapshot] Guardado para ${today}: portfolio PNL=$${portfolioPnl.toFixed(2)} (${portfolioRoi.toFixed(2)}%), ventas PNL=$${salesPnl.toFixed(2)} (${salesRoi.toFixed(2)}%)`
    );
}

/** Corre automáticamente a medianoche hora Argentina */
export const dailyPnlSnapshot = functions
    .region("europe-west1")
    .pubsub.schedule("0 0 * * *")
    .timeZone("America/Argentina/Buenos_Aires")
    .onRun(async () => {
        try {
            await runDailyPnlSnapshot();
        } catch (e) {
            console.error("[snapshot] Error:", e);
        }
    });

/** Endpoint HTTP para disparar manualmente (testing) */
export const testDailyPnlSnapshot = functions
    .region("europe-west1")
    .https.onRequest(async (_req, res) => {
        try {
            await runDailyPnlSnapshot();
            res.json({ ok: true });
        } catch (e: any) {
            res.status(500).send(e.message);
        }
    });
