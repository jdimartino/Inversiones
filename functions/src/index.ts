import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import axios from "axios";

admin.initializeApp();
const db = admin.firestore();

// ─── Telegram config ──────────────────────────────────────────────────────────
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_MAX_LENGTH = 4096;
const DIVIDER = "────────────────────";

// ─── Types ────────────────────────────────────────────────────────────────────
interface AlertRule {
    targetPercent: number;
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

/** Formatea un número como moneda de forma determinista (sin riesgo de locale del servidor). */
const fmt = (n: number): string => new Intl.NumberFormat('en-US').format(Math.round(n));

/** Devuelve "+" si el número es positivo, "" si es negativo. */
const pnlSign = (n: number): string => n >= 0 ? "+" : "";

/** Devuelve el emoji correspondiente al PNL. */
const pnlEmoji = (n: number): string => n >= 0 ? "🟢" : "🔴";

// ─── Helper: send Telegram message (con reintentos) ───────────────────────────
async function sendTelegram(message: string): Promise<boolean> {
    const token = TELEGRAM_TOKEN || functions.config().telegram?.token;
    const chatid = CHAT_ID || functions.config().telegram?.chat_id;

    if (!token || !chatid) {
        console.error("Telegram config not set. Skipping notification.");
        return false;
    }

    // Truncar si excede el límite de 4096 caracteres de Telegram
    let payload = message;
    if (payload.length > TELEGRAM_MAX_LENGTH) {
        const truncateNotice = "\n\n_... mensaje truncado por límite de Telegram._";
        payload = payload.slice(0, TELEGRAM_MAX_LENGTH - truncateNotice.length) + truncateNotice;
        console.warn(`Mensaje truncado de ${message.length} a ${payload.length} chars para caber en Telegram.`);
    }

    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
                chat_id: chatid,
                text: payload,
                parse_mode: "Markdown",
            });
            return true;
        } catch (err: any) {
            const status = err?.response?.status ?? "unknown";
            console.warn(`[Telegram] Intento ${attempt}/3 fallido (HTTP ${status}): ${err?.message}`);
            if (attempt < 3) {
                await sleep(2000 * attempt); // 2s, 4s
            }
        }
    }

    console.error("[Telegram] Fallo definitivo tras 3 intentos. Notificación no enviada.");
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
        normalized[id] = alertsArray.map(alert => ({
            ...alert,
            direction: alert.direction || (alert.targetPercent >= 0 ? 'up' : 'down')
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

// ─── Cloud Function ───────────────────────────────────────────────────────────
export const checkPNLAlerts = functions.pubsub.schedule("every 15 minutes").onRun(async (_context) => {
    try {
        // 1. Obtener precios actuales (MEXC evita bloqueos de EE.UU. en Google Cloud)
        const { data: tickerData } = await axios.get("https://api.mexc.com/api/v3/ticker/price");
        const prices: Record<string, number> = {};
        for (const item of tickerData) {
            prices[item.symbol] = parseFloat(item.price);
        }

        // 2. Leer configuración de alertas desde Firestore
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

        // 3. Calcular PNL por activo
        const snap = await db.collection("inversiones").get();
        let totalInvested = 0;
        let totalCurrentValue = 0;

        const triggeredIndividualMessages: string[] = [];
        let hasAlertsToRemove = false;
        let hasGlobalAlertsToRemove = false;

        const individualAssets: { coin: string, pnl: number, roi: number }[] = [];

        snap.forEach((docSnap) => {
            const inv = docSnap.data();
            const symbol = `${inv.coin}USDT`;
            const currentPrice = prices[symbol] || 0;
            const currentValue = currentPrice * inv.quantity;

            totalInvested += inv.invested;
            totalCurrentValue += currentValue;

            const pnl = currentValue - inv.invested;

            if (!inv.invested || inv.invested <= 0) {
                console.warn(`Inversión ${docSnap.id} (${inv.coin}) tiene 'invested' inválido: ${inv.invested}. Omitiendo.`);
                return;
            }
            const roiPercent = (pnl / inv.invested) * 100;

            individualAssets.push({ coin: inv.coin, pnl, roi: roiPercent });

            // 4. Evaluar alertas individuales
            const alertRules = investmentAlerts[docSnap.id];
            if (Array.isArray(alertRules) && alertRules.length > 0) {
                const remaining: AlertRule[] = [];

                for (const rule of alertRules) {
                    const target = rule.targetPercent;
                    const direction = rule.direction || (target >= 0 ? 'up' : 'down');
                    let isTriggered = false;

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

                    if (isTriggered) {
                        const tipo = rule.isPersistent ? "PERMANENTE" : "UNA VEZ";
                        console.log(`[ALERTA] ${inv.coin} (${docSnap.id}) — ROI: ${roiPercent.toFixed(2)}% — Target: ${direction === 'up' ? '>=' : '<='} ${target}% — Tipo: ${tipo}`);
                        if (rule.isPersistent) {
                            remaining.push(rule);
                        } else {
                            hasAlertsToRemove = true;
                            console.log(`[ONE-SHOT] Alerta ${inv.coin} (${target}%) eliminada.`);
                        }
                    } else {
                        remaining.push(rule);
                    }
                }

                if (remaining.length === 0) {
                    delete investmentAlerts[docSnap.id];
                } else if (remaining.length !== alertRules.length) {
                    investmentAlerts[docSnap.id] = remaining;
                    hasAlertsToRemove = true;
                }
            }
        });

        // 5. Ordenar inversiones individuales (mayor PNL primero)
        individualAssets.sort((a, b) => b.pnl - a.pnl);

        const assetDetails = individualAssets.map(({ coin, pnl, roi }) =>
            `${pnlEmoji(pnl)} *${coin}:* ${pnlSign(pnl)}$${fmt(pnl)} (${pnlSign(roi)}${roi.toFixed(1)}%)`
        );

        const globalPNL = totalCurrentValue - totalInvested;

        // 6. Evaluar Alertas Globales
        const triggeredGlobalMessages: string[] = [];
        let remainingGlobalAlerts: GlobalAlertRule[] = [];

        // Legacy: solo si el usuario NO ha migrado al nuevo sistema de alertas globales
        const isLegacyGlobalAlertTriggered = (!hasMigratedToGlobalAlertsArray) &&
            (globalPNL <= minAlert || globalPNL >= maxAlert);

        if (isLegacyGlobalAlertTriggered) {
            const reason = globalPNL <= minAlert ? "⬇️ Límite inferior alcanzado" : "⬆️ Meta superior alcanzada";
            triggeredGlobalMessages.push(
                `🚨 *Alerta Global Legacy:* ${reason} (${pnlSign(globalPNL)}$${fmt(globalPNL)})`
            );
        }

        for (const rule of globalAlerts) {
            const target = rule.targetAmount;
            const direction = rule.direction || (target >= 0 ? 'up' : 'down');
            let isTriggered = false;

            if (direction === 'up' && globalPNL >= target) {
                isTriggered = true;
                triggeredGlobalMessages.push(
                    `🚀 *PNL Global* alcanzó *${pnlSign(globalPNL)}$${fmt(globalPNL)}* (Meta: 🔼 >= ${pnlSign(target)}$${fmt(target)})`
                );
            } else if (direction === 'down' && globalPNL <= target) {
                isTriggered = true;
                triggeredGlobalMessages.push(
                    `📉 *PNL Global* cayó a *${pnlSign(globalPNL)}$${fmt(globalPNL)}* (Límite: 🔽 <= ${pnlSign(target)}$${fmt(target)})`
                );
            }

            if (isTriggered) {
                const tipo = rule.isPersistent ? "PERMANENTE" : "UNA VEZ";
                console.log(`[ALERTA GLOBAL] PNL: $${globalPNL.toFixed(2)} — Target: ${direction === 'up' ? '>=' : '<='} $${target} — Tipo: ${tipo}`);
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

        const shouldAlert = isLegacyGlobalAlertTriggered ||
            triggeredGlobalMessages.length > 0 ||
            triggeredIndividualMessages.length > 0;

        // 7. Limpiar alertas one-shot de Firestore
        const updates: any = {};
        if (hasAlertsToRemove) {
            updates.investmentAlerts = investmentAlerts;
            console.log("Alertas individuales one-shot en cola para eliminación.");
        }
        if (hasGlobalAlertsToRemove) {
            updates.globalAlerts = remainingGlobalAlerts;
            console.log("Alertas globales one-shot en cola para eliminación.");
        }
        if (Object.keys(updates).length > 0) {
            await db.collection("config").doc("alerts").update(updates);
            console.log("Actualizadas alertas one-shot en Firestore.");
        }

        // 8. Construir y enviar mensaje Telegram
        if (shouldAlert) {
            let message = `⚠️ *ALERTA PNL — Crypto Command*\n${DIVIDER}\n`;

            if (triggeredGlobalMessages.length > 0) {
                message += `*🚨 Alertas Globales:*\n${triggeredGlobalMessages.join("\n")}\n\n`;
            }

            if (triggeredIndividualMessages.length > 0) {
                message += `*🎯 Alertas Individuales:*\n${triggeredIndividualMessages.join("\n")}\n`;
            }

            message += `${DIVIDER}\n` +
                `*PNL Total:* ${pnlSign(globalPNL)}$${fmt(globalPNL)}\n` +
                `*Invertido:* $${fmt(totalInvested)}\n` +
                `*Valor Actual:* $${fmt(totalCurrentValue)}\n` +
                `${DIVIDER}\n` +
                `*📊 Detalle del Portafolio:*\n${assetDetails.join("\n")}`;

            const sent = await sendTelegram(message);

            if (sent) {
                console.log(`✅ Alerta enviada. PNL: ${pnlSign(globalPNL)}$${fmt(globalPNL)} | Individuales: ${triggeredIndividualMessages.length} | Globales: ${triggeredGlobalMessages.length}`);

                // Log en Firestore solo si se envió con éxito
                await db.collection("notificationLogs").add({
                    sentAt: new Date(),
                    globalAlertTriggered: triggeredGlobalMessages.length > 0 || isLegacyGlobalAlertTriggered,
                    globalPNL: Math.round(globalPNL),
                    triggeredAssets: triggeredIndividualMessages,
                    triggeredGlobalAlerts: triggeredGlobalMessages,
                    totalInvested: Math.round(totalInvested),
                    totalCurrentValue: Math.round(totalCurrentValue),
                });
            } else {
                console.error("❌ Notificación NO guardada en log porque el envío falló.");
            }
        } else {
            console.log("Todo dentro de los límites. Sin alertas que enviar.");
        }

    } catch (e) {
        console.error("Error en checkPNLAlerts:", e);
    }
});
