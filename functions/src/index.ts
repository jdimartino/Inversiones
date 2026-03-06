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

        if (configSnap.exists) {
            const conf = configSnap.data()!;
            if (conf.minPNL !== undefined) minAlert = conf.minPNL;
            if (conf.maxPNL !== undefined) maxAlert = conf.maxPNL;

            // ── Normalizar formato legacy antes de evaluar ────────────────
            if (conf.investmentAlerts) {
                investmentAlerts = normalizeAlerts(conf.investmentAlerts);
            }
        }

        // 3. Calcular PNL por activo y recolectar alertas
        const snap = await db.collection("inversiones").get();
        let totalInvested = 0;
        let totalCurrentValue = 0;

        const triggeredMessages: string[] = [];
        let hasAlertsToRemove = false;

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
                        triggeredMessages.push(
                            `🚀 *${inv.coin}* subió a/pasó de *${roiPercent.toFixed(1)}%* ` +
                            `(Meta: 🔼 >= ${target}%)`
                        );
                    } else if (direction === 'down' && roiPercent <= target) {
                        isTriggered = true;
                        triggeredMessages.push(
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
        const globalAlertTriggered = globalPNL <= minAlert || globalPNL >= maxAlert;
        const shouldAlert = globalAlertTriggered || triggeredMessages.length > 0;

        // 6. Eliminar alertas one-shot que ya fueron disparadas
        if (hasAlertsToRemove) {
            await db.collection("config").doc("alerts").update({ investmentAlerts });
            console.log("Alertas one-shot eliminadas de Firestore tras ser disparadas.");
        }

        // 7. Enviar notificación si hay algo que reportar
        if (shouldAlert) {
            const pnlSign = globalPNL >= 0 ? "+" : "";
            let message = `⚠️ *ALERTA PNL — Crypto Command*\n\n`;

            if (triggeredMessages.length > 0) {
                message += `*🎯 Alertas Individuales:*\n${triggeredMessages.join("\n")}\n\n`;
            }

            if (globalAlertTriggered) {
                const reason = globalPNL <= minAlert ? "⬇️ Límite inferior alcanzado" : "⬆️ Meta superior alcanzada";
                message += `🚨 *Alerta Global:* ${reason}\n\n`;
            }

            message +=
                `*PNL Total:* ${pnlSign}$${Math.round(globalPNL).toLocaleString()}\n` +
                `*Invertido:* $${Math.round(totalInvested).toLocaleString()}\n` +
                `*Valor Actual:* $${Math.round(totalCurrentValue).toLocaleString()}\n\n` +
                `*📊 Detalle del Portafolio:*\n${assetDetails.join("\n")}`;

            await sendTelegram(message);
            console.log(`Alerta enviada a Telegram. PNL Global: ${pnlSign}$${Math.round(globalPNL).toLocaleString()}. Activos disparados: ${triggeredMessages.length}`);

            // ── Guardar log de notificación en Firestore ──────────────
            await db.collection("notificationLogs").add({
                sentAt: new Date(), // Usando Date() simple que Firestore acepta y convierte a Timestamp
                globalAlertTriggered,
                globalPNL: Math.round(globalPNL),
                triggeredAssets: triggeredMessages,
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
