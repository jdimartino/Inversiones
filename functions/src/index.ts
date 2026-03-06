import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import axios from "axios";

admin.initializeApp();
const db = admin.firestore();

// ─── Telegram config: leído de variables de entorno ─────────────────────────
// En local: definidas en functions/.env (no sube a Git)
// En producción: configura con `npx firebase-tools functions:secrets:set TELEGRAM_TOKEN`
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

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

// ─── Helper: send Telegram message ───────────────────────────────────────────
async function sendTelegram(message: string): Promise<void> {
    if (!TELEGRAM_TOKEN || !CHAT_ID) {
        console.error("Telegram config not set. Skipping notification.");
        return;
    }
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        chat_id: CHAT_ID,
        text: message,
        parse_mode: "Markdown",
    });
}

// ─── Helper: normalizar formato legacy de alertas ────────────────────────────
// Antiguo formato en Firestore: { [id]: { targetPercent, isPersistent } }
// Nuevo formato:                { [id]: [{ targetPercent, isPersistent, direction }] }
function normalizeAlerts(raw: Record<string, unknown>): Record<string, AlertRule[]> {
    const normalized: Record<string, AlertRule[]> = {};
    for (const [id, value] of Object.entries(raw)) {
        let alertsArray: AlertRule[] = [];
        if (Array.isArray(value)) {
            alertsArray = value as AlertRule[];
        } else if (value && typeof value === "object") {
            // Legacy: objeto único → envolver en array
            alertsArray = [value as AlertRule];
        }

        // Inject direction for older alerts without it
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
        // 1. Obtener precios actuales (usando MEXC para notificaciones, evitando bloqueos de EE.UU. en Google Cloud)
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

        if (configSnap.exists) {
            const conf = configSnap.data()!;
            if (conf.minPNL !== undefined) minAlert = conf.minPNL;
            if (conf.maxPNL !== undefined) maxAlert = conf.maxPNL;

            // ── Normalizar formato legacy antes de evaluar ────────────────
            if (conf.investmentAlerts) {
                investmentAlerts = normalizeAlerts(conf.investmentAlerts);
            }
            if (conf.globalAlerts) {
                globalAlerts = normalizeGlobalAlerts(conf.globalAlerts);
            }
        }

        // 3. Calcular PNL por activo y recolectar alertas
        const snap = await db.collection("inversiones").get();
        let totalInvested = 0;
        let totalCurrentValue = 0;

        const triggeredIndividualMessages: string[] = [];
        let hasAlertsToRemove = false;
        let hasGlobalAlertsToRemove = false;

        // Array para recolectar las inversiones de manera individual, pero procesadas para ordenar
        const individualAssets: { coin: string, pnl: number, roi: number }[] = [];

        snap.forEach((docSnap) => {
            const inv = docSnap.data();
            const symbol = `${inv.coin}USDT`;
            const currentPrice = prices[symbol] || 0;
            const currentValue = currentPrice * inv.quantity;

            totalInvested += inv.invested;
            totalCurrentValue += currentValue;

            const pnl = currentValue - inv.invested;

            // Protección ante división por cero o datos incorrectos
            if (!inv.invested || inv.invested <= 0) {
                console.warn(`Inversión ${docSnap.id} (${inv.coin}) tiene 'invested' inválido: ${inv.invested}. Omitiendo.`);
                return;
            }
            const roiPercent = (pnl / inv.invested) * 100;

            // Recolectar para el bloque "Detalle por activo"
            individualAssets.push({
                coin: inv.coin,
                pnl: pnl,
                roi: roiPercent
            });

            // 4. Evaluar alertas individuales para este activo (pueden ser múltiples)
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
                            `🚀 *${inv.coin}* subió a/pasó de *${roiPercent.toFixed(1)}%* ` +
                            `(Meta: 🔼 >= ${target}%)`
                        );
                    } else if (direction === 'down' && roiPercent <= target) {
                        isTriggered = true;
                        triggeredIndividualMessages.push(
                            `📉 *${inv.coin}* cayó a/bajó de *${roiPercent.toFixed(1)}%* ` +
                            `(Límite: 🔽 <= ${target}%)`
                        );
                    }

                    if (isTriggered) {
                        const tipo = rule.isPersistent ? "PERMANENTE (seguirá notificando)" : "UNA VEZ (se eliminará)";
                        console.log(`[ALERTA] ${inv.coin} (ID: ${docSnap.id}) — ROI: ${roiPercent.toFixed(2)}% — Target: ${direction === 'up' ? '>=' : '<='} ${target}% — Tipo: ${tipo}`);
                        if (rule.isPersistent) {
                            // Permanente: mantener en el array, seguirá notificando cada hora
                            remaining.push(rule);
                        } else {
                            // One-shot: eliminar (no se añade a remaining)
                            hasAlertsToRemove = true;
                            console.log(`[ONE-SHOT] Alerta de ${inv.coin} (${target}%) eliminada tras dispararse.`);
                        }
                    } else {
                        // No disparada: conservar siempre
                        remaining.push(rule);
                    }
                }

                // Actualizar el array (puede quedar vacío si todas eran one-shot)
                if (remaining.length === 0) {
                    delete investmentAlerts[docSnap.id];
                } else if (remaining.length !== alertRules.length) {
                    investmentAlerts[docSnap.id] = remaining;
                    hasAlertsToRemove = true;
                }
            }
        });

        // 5. Ordenar el registro individual (de ganancias a pérdidas descendente)
        individualAssets.sort((a, b) => b.pnl - a.pnl);

        const assetDetails = individualAssets.map(({ coin, pnl, roi }) => {
            const isGain = pnl >= 0;
            const sign = isGain ? "+" : "";
            const emoji = isGain ? "🟢" : "🔴";
            return `${emoji} *${coin}:* ${sign}$${Math.round(pnl).toLocaleString()} (${sign}${roi.toFixed(1)}%)`;
        });

        const globalPNL = totalCurrentValue - totalInvested;

        // ── Evaluar Alertas Globales ──────────────────────────────────────────
        const triggeredGlobalMessages: string[] = [];
        const originalGlobalAlertsLength = globalAlerts.length;
        let remainingGlobalAlerts: GlobalAlertRule[] = [];

        // Legacy check (en caso de que no existan globalAlerts y sí los límites viejos)
        const isLegacyGlobalAlertTriggered = (globalAlerts.length === 0) && (globalPNL <= minAlert || globalPNL >= maxAlert);
        if (isLegacyGlobalAlertTriggered) {
            const reason = globalPNL <= minAlert ? "⬇️ Límite inferior alcanzado" : "⬆️ Meta superior alcanzada";
            triggeredGlobalMessages.push(`🚨 *Alerta Global Legacy:* ${reason} (${globalPNL >= 0 ? "+" : ""}$${Math.round(globalPNL).toLocaleString()})`);
        }

        // New array check
        for (const rule of globalAlerts) {
            const target = rule.targetAmount;
            const direction = rule.direction || (target >= 0 ? 'up' : 'down');
            let isTriggered = false;

            if (direction === 'up' && globalPNL >= target) {
                isTriggered = true;
                triggeredGlobalMessages.push(
                    `🚀 *PNL Global* alcanzó/superó *${globalPNL >= 0 ? "+" : ""}$${Math.round(globalPNL).toLocaleString()}* (Meta: 🔼 >= ${target >= 0 ? "+" : ""}$${Math.round(target).toLocaleString()})`
                );
            } else if (direction === 'down' && globalPNL <= target) {
                isTriggered = true;
                triggeredGlobalMessages.push(
                    `📉 *PNL Global* cayó/bajó a *${globalPNL >= 0 ? "+" : ""}$${Math.round(globalPNL).toLocaleString()}* (Límite: 🔽 <= ${target >= 0 ? "+" : ""}$${Math.round(target).toLocaleString()})`
                );
            }

            if (isTriggered) {
                const tipo = rule.isPersistent ? "PERMANENTE" : "UNA VEZ";
                console.log(`[ALERTA GLOBAL] PNL: $${globalPNL.toFixed(2)} — Target: ${direction === 'up' ? '>=' : '<='} $${target} — Tipo: ${tipo}`);
                if (rule.isPersistent) {
                    remainingGlobalAlerts.push(rule);
                } else {
                    hasGlobalAlertsToRemove = true;
                    console.log(`[ONE-SHOT GLOBAL] Alerta Global ($${target}) eliminada tras dispararse.`);
                }
            } else {
                remainingGlobalAlerts.push(rule);
            }
        }

        const shouldAlert = isLegacyGlobalAlertTriggered || triggeredGlobalMessages.length > 0 || triggeredIndividualMessages.length > 0;

        // 6. Eliminar alertas one-shot que ya fueron disparadas
        const updates: any = {};
        if (hasAlertsToRemove) {
            updates.investmentAlerts = investmentAlerts;
            console.log("Alertas individuales one-shot en cola para eliminación.");
        }
        if (hasGlobalAlertsToRemove || originalGlobalAlertsLength !== remainingGlobalAlerts.length) {
            updates.globalAlerts = remainingGlobalAlerts;
            console.log("Alertas globales one-shot en cola para eliminación.");
        }

        if (Object.keys(updates).length > 0) {
            await db.collection("config").doc("alerts").update(updates);
            console.log("Actualizadas alertas en Firestore tras dispararse las configuradas para Una Vez.");
        }

        // 7. Enviar notificación si hay algo que reportar
        if (shouldAlert) {
            const pnlSign = globalPNL >= 0 ? "+" : "";
            let message = `⚠️ *ALERTA PNL — Crypto Command*\n\n`;

            if (triggeredGlobalMessages.length > 0) {
                message += `*🚨 Alertas Globales:*\n${triggeredGlobalMessages.join("\n")}\n\n`;
            }

            if (triggeredIndividualMessages.length > 0) {
                message += `*🎯 Alertas Individuales:*\n${triggeredIndividualMessages.join("\n")}\n\n`;
            }

            message +=
                `*PNL Total:* ${pnlSign}$${Math.round(globalPNL).toLocaleString()}\n` +
                `*Invertido:* $${Math.round(totalInvested).toLocaleString()}\n` +
                `*Valor Actual:* $${Math.round(totalCurrentValue).toLocaleString()}\n\n` +
                `*📊 Detalle del Portafolio:*\n${assetDetails.join("\n")}`;

            await sendTelegram(message);
            console.log(`Alerta enviada a Telegram. PNL Global: ${pnlSign}$${Math.round(globalPNL).toLocaleString()}. Activos disparados: ${triggeredIndividualMessages.length}, Globales disparadas: ${triggeredGlobalMessages.length}`);

            // ── Guardar log de notificación en Firestore ──────────────
            await db.collection("notificationLogs").add({
                sentAt: new Date(), // Usando Date() simple que Firestore acepta y convierte a Timestamp
                globalAlertTriggered: triggeredGlobalMessages.length > 0 || isLegacyGlobalAlertTriggered,
                globalPNL: Math.round(globalPNL),
                triggeredAssets: triggeredIndividualMessages,
                triggeredGlobalAlerts: triggeredGlobalMessages,
                totalInvested: Math.round(totalInvested),
                totalCurrentValue: Math.round(totalCurrentValue),
            });

        } else {
            console.log("Todo dentro de los límites. Sin alertas que enviar.");
        }

    } catch (e) {
        console.error("Error en checkPNLAlerts:", e);
    }
});
