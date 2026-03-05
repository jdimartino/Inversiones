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

// ─── Cloud Function ───────────────────────────────────────────────────────────
export const checkPNLAlerts = functions.pubsub.schedule("every 1 hours").onRun(async (_context) => {
    try {
        // 1. Obtener precios actuales de Binance
        const { data: tickerData } = await axios.get("https://api.binance.com/api/v3/ticker/price");
        const prices: Record<string, number> = {};
        for (const item of tickerData) {
            prices[item.symbol] = parseFloat(item.price);
        }

        // 2. Leer configuración de alertas desde Firestore
        const configSnap = await db.collection("config").doc("alerts").get();

        let minAlert = -40000;
        let maxAlert = 10000;
        let investmentAlerts: Record<string, { targetPercent: number; isPersistent?: boolean }[]> = {};

        if (configSnap.exists) {
            const conf = configSnap.data()!;
            if (conf.minPNL !== undefined) minAlert = conf.minPNL;
            if (conf.maxPNL !== undefined) maxAlert = conf.maxPNL;
            if (conf.investmentAlerts) investmentAlerts = conf.investmentAlerts;
        }

        // 3. Calcular PNL por activo
        const snap = await db.collection("inversiones").get();
        let totalInvested = 0;
        let totalCurrentValue = 0;

        const assetDetails: string[] = [];
        const triggeredMessages: string[] = [];
        let hasAlertsToRemove = false;

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

            // 4. Evaluar alertas individuales para este activo (pueden ser múltiples)
            const alertRules = investmentAlerts[docSnap.id];
            if (Array.isArray(alertRules) && alertRules.length > 0) {
                const remaining: typeof alertRules = [];

                for (const rule of alertRules) {
                    const target = rule.targetPercent;
                    let isTriggered = false;

                    if (target >= 0 && roiPercent >= target) {
                        isTriggered = true;
                        triggeredMessages.push(
                            `🚀 *${inv.coin}* alcanzó *+${roiPercent.toFixed(1)}%* ` +
                            `(Meta: +${target}%)`
                        );
                    } else if (target < 0 && roiPercent <= target) {
                        isTriggered = true;
                        triggeredMessages.push(
                            `📉 *${inv.coin}* cayó a *${roiPercent.toFixed(1)}%* ` +
                            `(Límite: ${target}%)`
                        );
                    }

                    if (isTriggered) {
                        console.log(`[ALERTA] ${inv.coin} (ID: ${docSnap.id}) — ROI: ${roiPercent.toFixed(2)}% — Target: ${target}% — Persistente: ${!!rule.isPersistent}`);
                        if (rule.isPersistent) {
                            // Permanente: mantener en el array
                            remaining.push(rule);
                        } else {
                            // One-shot: eliminar (no se añade a remaining)
                            hasAlertsToRemove = true;
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

            // Línea de detalle para el resumen del mensaje
            const sign = pnl >= 0 ? "+" : "";
            assetDetails.push(`${inv.coin}: ${sign}$${Math.round(pnl).toLocaleString()} (${sign}${roiPercent.toFixed(1)}%)`);
        });

        const globalPNL = totalCurrentValue - totalInvested;
        const globalAlertTriggered = globalPNL <= minAlert || globalPNL >= maxAlert;
        const shouldAlert = globalAlertTriggered || triggeredMessages.length > 0;

        // 5. Eliminar alertas one-shot que ya fueron disparadas
        if (hasAlertsToRemove) {
            await db.collection("config").doc("alerts").update({ investmentAlerts });
            console.log("Alertas one-shot eliminadas de Firestore tras ser disparadas.");
        }

        // 6. Enviar notificación si hay algo que reportar
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
                `*Detalle por activo:*\n${assetDetails.join(" | ")}`;

            await sendTelegram(message);
            console.log(`Alerta enviada a Telegram. PNL Global: ${pnlSign}$${Math.round(globalPNL).toLocaleString()}. Activos disparados: ${triggeredMessages.length}`);

            // ── Guardar log de notificación en Firestore ──────────────
            await db.collection("notificationLogs").add({
                sentAt: admin.firestore.FieldValue.serverTimestamp(),
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
