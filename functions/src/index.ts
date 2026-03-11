import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import axios from "axios";

admin.initializeApp();
const db = admin.firestore();

// ─── Telegram config ──────────────────────────────────────────────────────────
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const DIVIDER = "────────────────────";

// ─── Types ────────────────────────────────────────────────────────────────────
interface AlertRule {
    type?: 'pnl' | 'price';
    targetPercent?: number;
    targetValue?: number;
    isPersistent?: boolean;
    direction?: 'up' | 'down';
}

interface GlobalAlertRule {
    targetAmount: number;
    isPersistent?: boolean;
    direction?: 'up' | 'down';
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
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, payload);
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
    console.log("[v2.1] Iniciando comprobación de alertas...");
    const { data: tickerData } = await axios.get("https://api.mexc.com/api/v3/ticker/price");
    const prices: Record<string, number> = {};
    for (const item of tickerData) {
        prices[item.symbol] = parseFloat(item.price);
    }

    const configSnap = await db.collection("config").doc("alerts").get();
    let minAlert = -40000;
    let maxAlert = 10000;
    let investmentAlerts: Record<string, AlertRule[]> = {};
    let globalAlerts: GlobalAlertRule[] = [];
    let hasMigratedToGlobalAlertsArray = false;

    if (configSnap.exists) {
        const conf = configSnap.data()!;
        if (conf.minPNL !== undefined) minAlert = conf.minPNL;
        if (conf.maxPNL !== undefined) maxAlert = conf.maxPNL;
        if (conf.globalAlerts !== undefined) {
            hasMigratedToGlobalAlertsArray = true;
            globalAlerts = normalizeGlobalAlerts(conf.globalAlerts);
        }
        if (conf.investmentAlerts) {
            investmentAlerts = normalizeAlerts(conf.investmentAlerts);
        }
    }

    const snap = await db.collection("inversiones").get();
    let totalInvested = 0;
    let totalCurrentValue = 0;
    const triggeredIndividualMessages: string[] = [];
    let hasAlertsToRemove = false;
    let hasGlobalAlertsToRemove = false;
    const individualAssets: { coin: string, pnl: number, roi: number }[] = [];

    const debugData: any[] = [];

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
                        triggeredIndividualMessages.push(
                            `🚀 *${inv.coin}* subió a *${pnlSign(roiPercent)}${roiPercent.toFixed(1)}%* (Meta: 🔼 >= ${target}%)`
                        );
                    } else if (direction === 'down' && roiPercent <= target) {
                        isTriggered = true;
                        triggeredIndividualMessages.push(
                            `📉 *${inv.coin}* cayó a *${roiPercent.toFixed(1)}%* (Límite: 🔽 <= ${target}%)`
                        );
                    }
                } else if (type === 'price') {
                    const target = rule.targetValue || 0;
                    if (direction === 'up' && currentPrice >= target) {
                        isTriggered = true;
                        triggeredIndividualMessages.push(
                            `💰 *${inv.coin}* alcanzó *${fmtPrice(currentPrice)}* (Meta: 🔼 >= ${fmtPrice(target)})`
                        );
                    } else if (direction === 'down' && currentPrice <= target) {
                        isTriggered = true;
                        triggeredIndividualMessages.push(
                            `📉 *${inv.coin}* bajó a *${fmtPrice(currentPrice)}* (Límite: 🔽 <= ${fmtPrice(target)})`
                        );
                    }
                }

                if (isTriggered) {
                    debugRule.triggered = true;
                    const tipo = rule.isPersistent ? "PERMANENTE" : "UNA VEZ";
                    const targetVal = type === 'pnl' ? `${rule.targetPercent}%` : `${rule.targetValue}`;
                    console.log(`[ALERTA v2.1] ${inv.coin} (${docSnap.id}) — ${type.toUpperCase()}: ${type === 'pnl' ? roiPercent.toFixed(2) + '%' : currentPrice} — Target: ${direction === 'up' ? '>=' : '<='} ${targetVal} — Tipo: ${tipo}`);
                    
                    if (rule.isPersistent) {
                        remaining.push(rule);
                    } else {
                        hasAlertsToRemove = true;
                        console.log(`[ONE-SHOT] Alerta ${inv.coin} (${targetVal}) eliminada.`);
                    }
                } else {
                    remaining.push(rule);
                }
                debugData.push({ ...debugRule, invId: docSnap.id });
            }

            if (remaining.length === 0) {
                delete investmentAlerts[docSnap.id];
            } else if (remaining.length !== alertRules.length) {
                investmentAlerts[docSnap.id] = remaining;
                hasAlertsToRemove = true;
            }
        } else {
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

        // Fix 3: Remove duplicate ROI calculation and reuse existing variable
        individualAssets.push({ coin: inv.coin, pnl, roi: roiPercent || 0 });
    });

    individualAssets.sort((a, b) => b.pnl - a.pnl);
    const assetDetails = individualAssets.map(({ coin, pnl, roi }) =>
        `${pnlEmoji(pnl)} *${coin}:* ${pnlSign(pnl)}$${fmt(pnl)} (${pnlSign(roi)}${roi.toFixed(1)}%)`
    );

    const globalPNL = totalCurrentValue - totalInvested;
    const triggeredGlobalMessages: string[] = [];
    let remainingGlobalAlerts: GlobalAlertRule[] = [];
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
            triggeredGlobalMessages.push(`🚀 *PNL Global* alcanzó *${pnlSign(globalPNL)}$${fmt(globalPNL)}* (Meta: 🔼 >= ${pnlSign(target)}$${fmt(target)})`);
        } else if (direction === 'down' && globalPNL <= target) {
            isTriggered = true;
            triggeredGlobalMessages.push(`📉 *PNL Global* cayó a *${pnlSign(globalPNL)}$${fmt(globalPNL)}* (Límite: 🔽 <= ${pnlSign(target)}$${fmt(target)})`);
        }

        if (isTriggered) {
            const tipo = rule.isPersistent ? "PERMANENTE" : "UNA VEZ";
            console.log(`[ALERTA GLOBAL v2.1] PNL: $${globalPNL.toFixed(2)} — Target: ${direction === 'up' ? '>=' : '<='} $${target} — Tipo: ${tipo}`);
            if (rule.isPersistent) {
                remainingGlobalAlerts.push(rule);
            } else {
                hasGlobalAlertsToRemove = true;
                console.log(`[ONE-SHOT GLOBAL] Alerta Global ($${target}) eliminada.`);
            }
        } else {
            remainingGlobalAlerts.push(rule);
        }
    }

    const shouldAlert = isLegacyGlobalAlertTriggered || triggeredGlobalMessages.length > 0 || triggeredIndividualMessages.length > 0;

    const updates: any = {};
    if (hasAlertsToRemove) updates.investmentAlerts = investmentAlerts;
    if (hasGlobalAlertsToRemove) updates.globalAlerts = remainingGlobalAlerts;
    
    // Fix 4: Clean legacy assetAlerts from Firestore if present
    if (configSnap.exists && configSnap.data()?.assetAlerts !== undefined) {
        updates.assetAlerts = admin.firestore.FieldValue.delete();
    }

    if (Object.keys(updates).length > 0) {
        await db.collection("config").doc("alerts").update(updates);
    }

    if (shouldAlert) {
        let message = `⚠️ *ALERTA PNL v2.1 — Crypto Command*\n${DIVIDER}\n`;
        if (triggeredGlobalMessages.length > 0) message += `*🚨 Alertas Globales:*\n${triggeredGlobalMessages.join("\n")}\n\n`;
        if (triggeredIndividualMessages.length > 0) message += `*🎯 Alertas Individuales:*\n${triggeredIndividualMessages.join("\n")}\n`;
        message += `${DIVIDER}\n*PNL Total:* ${pnlSign(globalPNL)}$${fmt(globalPNL)}\n*Invertido:* $${fmt(totalInvested)}\n*Valor Actual:* $${fmt(totalCurrentValue)}\n${DIVIDER}\n*📊 Detalle del Portafolio:*\n`;

        // Fix 1: Message truncation to prevent Telegram 4096 char limit errors
        for (let i = 0; i < assetDetails.length; i++) {
            const line = assetDetails[i] + "\n";
            if (message.length + line.length > 3900) {
                message += `... y ${assetDetails.length - i} activos más.`;
                break;
            }
            message += line;
        }

        const sent = await sendTelegram(message);
        if (sent) {
            console.log(`✅ Alerta enviada.`);
            await db.collection("notificationLogs").add({
                sentAt: new Date(),
                globalAlertTriggered: triggeredGlobalMessages.length > 0 || isLegacyGlobalAlertTriggered,
                globalPNL: Math.round(globalPNL),
                triggeredAssets: triggeredIndividualMessages,
                triggeredGlobalAlerts: triggeredGlobalMessages,
                totalInvested: Math.round(totalInvested),
                totalCurrentValue: Math.round(totalCurrentValue),
            });
            return { sent: true, summary: "Alerta enviada", debug: debugData };
        } else {
            return { sent: false, summary: "Fallo envío Telegram", debug: debugData };
        }
    } else {
        console.log("Todo dentro de los límites.");
        return { sent: false, summary: "Sin alertas", debug: debugData };
    }
}

// ─── Cloud Functions ───────────────────────────────────────────────────────────

export const debugAlerts = functions.https.onRequest(async (req, res) => {
    try {
        const doc = await db.collection("config").doc("alerts").get();
        res.json(doc.data());
    } catch (e: any) {
        res.status(500).send(e.message);
    }
});

export const debugInversiones = functions.https.onRequest(async (req, res) => {
    try {
        const snap = await db.collection("inversiones").get();
        const data: any[] = [];
        snap.forEach(doc => data.push({ id: doc.id, ...doc.data() }));
        res.json(data);
    } catch (e: any) {
        res.status(500).send(e.message);
    }
});

export const debugLogs = functions.https.onRequest(async (req, res) => {
    try {
        const snap = await db.collection("notificationLogs").orderBy("sentAt", "desc").limit(10).get();
        const data: any[] = [];
        snap.forEach(doc => data.push({ id: doc.id, ...doc.data() }));
        res.json(data);
    } catch (e: any) {
        res.status(500).send(e.message);
    }
});

export const setupTestAlerts = functions.https.onRequest(async (req, res) => {
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

export const testAlerts = functions.https.onRequest(async (req, res) => {
    try {
        const result = await runCheckAlerts();
        res.json(result);
    } catch (e: any) {
        res.status(500).send(e.message);
    }
});

export const checkPNLAlerts = functions.pubsub.schedule("every 15 minutes").onRun(async (_context) => {
    try {
        await runCheckAlerts();
    } catch (e) {
        console.error("Error en checkPNLAlerts:", e);
    }
});
