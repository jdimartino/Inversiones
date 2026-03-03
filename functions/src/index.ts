import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import axios from "axios";

admin.initializeApp();
const db = admin.firestore();

const TELEGRAM_TOKEN = "8434186533:AAG0mEwfF_tklVkxelS7D_D41nVSbB8r5sw";
const CHAT_ID = "442730401";

export const checkPNLAlerts = functions.pubsub.schedule("every 1 hours").onRun(async (context) => {
    try {
        // 1. Obtener precios de Binance
        const { data } = await axios.get("https://api.binance.com/api/v3/ticker/price");
        const prices: Record<string, number> = {};
        for (const item of data) {
            prices[item.symbol] = parseFloat(item.price);
        }

        // 2. Leer configuración de alertas
        const configSnap = await db.collection("config").doc("alerts").get();

        let minAlert = -40000;
        let maxAlert = 10000;
        let assetAlerts: Record<string, { minPercent: number, maxPercent: number }> = {};

        if (configSnap.exists) {
            const conf = configSnap.data();
            if (conf?.minPNL !== undefined) minAlert = conf.minPNL;
            if (conf?.maxPNL !== undefined) maxAlert = conf.maxPNL;
            if (conf?.assetAlerts) assetAlerts = conf.assetAlerts;
        }

        // 3. Obtener inversiones de Firestore
        const snap = await db.collection("inversiones").get();
        let totalInvested = 0;
        let totalCurrentValue = 0;

        const assetDetails: string[] = [];
        const triggeredAssets: string[] = [];

        snap.forEach((doc) => {
            const inv = doc.data();
            const symbol = `${inv.coin}USDT`;
            const currentPrice = prices[symbol] || 0;
            const currentValue = currentPrice * inv.quantity;

            totalInvested += inv.invested;
            totalCurrentValue += currentValue;

            const pnl = currentValue - inv.invested;
            const roiPercent = (pnl / inv.invested) * 100;

            // Check if this coin has specific alerts tailored
            const rules = assetAlerts[inv.coin];
            if (rules) {
                if (roiPercent <= rules.minPercent) {
                    triggeredAssets.push(`📉 *${inv.coin}* cayó a ${roiPercent.toFixed(1)}% (Límite: ${rules.minPercent}%)`);
                } else if (roiPercent >= rules.maxPercent) {
                    triggeredAssets.push(`🚀 *${inv.coin}* subió a ${roiPercent.toFixed(1)}% (Meta: ${rules.maxPercent}%)`);
                }
            }

            // Format details nicely
            const sign = pnl >= 0 ? "+" : "";
            assetDetails.push(`${inv.coin}: ${sign}$${Math.round(pnl).toLocaleString()} (${sign}${roiPercent.toFixed(1)}%)`);
        });

        const globalPNL = totalCurrentValue - totalInvested;
        const globalAlertTriggered = globalPNL <= minAlert || globalPNL >= maxAlert;

        const shouldAlert = globalAlertTriggered || triggeredAssets.length > 0;

        if (shouldAlert) {
            const pnlSign = globalPNL >= 0 ? "+" : "";

            let message = `⚠️ *ALERTA PNL - Crypto Command*\n\n`;

            if (triggeredAssets.length > 0) {
                message += `*Alertas Individuales:*\n${triggeredAssets.join("\n")}\n\n`;
            }

            if (globalAlertTriggered) {
                message += `🚨 *Alerta Global Activada*\n`;
            }

            message +=
                `*PNL Total:* ${pnlSign}$${Math.round(globalPNL).toLocaleString()}\n` +
                `*Invertido:* $${Math.round(totalInvested).toLocaleString()}\n` +
                `*Actual:* $${Math.round(totalCurrentValue).toLocaleString()}\n\n` +
                `*Detalle:*\n${assetDetails.join(" | ")}`; // removed escaping to use basic Markdown

            await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
                chat_id: CHAT_ID,
                text: message,
                parse_mode: "Markdown" // Using generic Markdown to avoid V2 escape character parsing crashes
            });
            console.log("Alerta enviada a Telegram. Global PNL:", globalPNL);
        } else {
            console.log(`Todo dentro de los límites. No se envió alerta.`);
        }

    } catch (e) {
        console.error("Error validando alertas:", e);
    }
});
