import * as admin from "firebase-admin";
import axios from "axios";

const serviceAccount = require("/Users/jdimartino/Desktop/Antigravity/inversiones/functions/micriptoapp-firebase-adminsdk-rth8s-8b4e7235db.json");

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

const TELEGRAM_BOT_TOKEN = "8434186533:AAG0mEwfF_tklVkxelS7D_D41nVSbB8r5sw";
const CHAT_ID = "442730401";

async function run() {
    console.log("Starting alert check...");
    try {
        const configSnap = await db.collection("config").doc("alerts").get();
        let minAlert = -40000;
        let maxAlert = 10000;
        let investmentAlerts: Record<string, { targetPercent: number }> = {};

        if (configSnap.exists) {
            const conf = configSnap.data();
            if (conf?.minPNL !== undefined) minAlert = conf.minPNL;
            if (conf?.maxPNL !== undefined) maxAlert = conf.maxPNL;
            if (conf?.investmentAlerts) investmentAlerts = conf.investmentAlerts;
        }

        console.log("Current individual alerts:", investmentAlerts);

        const snap = await db.collection("inversiones").get();
        const priceRes = await axios.get("https://api.binance.com/api/v3/ticker/price");
        const prices: Record<string, number> = {};
        for (const item of priceRes.data) {
            prices[item.symbol] = Number(item.price);
        }

        let totalInvested = 0;
        let totalCurrentValue = 0;
        const triggeredAssets: string[] = [];
        let triggeredAlertsToRemove = false;

        snap.forEach((doc) => {
            const inv = doc.data();
            const symbol = `${inv.coin}USDT`;

            const currentPrice = prices[symbol];
            if (!currentPrice) return;

            const currentValue = inv.quantity * currentPrice;
            totalInvested += inv.invested;
            totalCurrentValue += currentValue;

            const pnl = currentValue - inv.invested;
            const roiPercent = (pnl / inv.invested) * 100;

            const alertRules = investmentAlerts[doc.id];
            if (alertRules) {
                const target = alertRules.targetPercent;
                let isTriggered = false;

                if (target >= 0 && roiPercent >= target) {
                    isTriggered = true;
                    triggeredAssets.push(`🚀 *${inv.coin}* (Compra: $${inv.buyPrice}) alcanzó *+${roiPercent.toFixed(1)}%* (Meta: +${target}%)`);
                } else if (target < 0 && roiPercent <= target) {
                    isTriggered = true;
                    triggeredAssets.push(`📉 *${inv.coin}* (Compra: $${inv.buyPrice}) cayó a *${roiPercent.toFixed(1)}%* (Límite: ${target}%)`);
                }

                if (isTriggered) {
                    console.log(`Deleting alert mask for document ${doc.id}`);
                    delete investmentAlerts[doc.id];
                    triggeredAlertsToRemove = true;
                }
            }
        });

        const globalPNL = totalCurrentValue - totalInvested;
        const globalAlertTriggered = globalPNL <= minAlert || globalPNL >= maxAlert;
        const shouldAlert = globalAlertTriggered || triggeredAssets.length > 0;

        if (triggeredAlertsToRemove) {
            await db.collection("config").doc("alerts").update({
                investmentAlerts: investmentAlerts
            });
            console.log("Se eliminaron alertas individuales que ya fueron disparadas.");
        }

        if (shouldAlert) {
            const pnlSign = globalPNL >= 0 ? "+" : "";
            let message = `📊 *Resumen de PNL* 📊\n\n`;
            message += `💰 *Global:* ${pnlSign}$${globalPNL.toFixed(2)}\n`;

            if (triggeredAssets.length > 0) {
                message += `\n🚨 *Alertas Individuales:*\n`;
                triggeredAssets.forEach(a => message += `• ${a}\n`);
            } else {
                message += `\n🚨 *Alerta Global:* El PNL superó tus límites operativos.`;
            }

            console.log("Enviando mensaje:", message);
            const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
            await axios.post(url, {
                chat_id: CHAT_ID,
                text: message,
                parse_mode: "Markdown"
            });
            console.log("✅ Mensaje enviado a Telegram.");
        } else {
            console.log("✅ Ninguna alerta fue disparada esta vez.");
        }
    } catch (error) {
        console.error("Error en function test:", error);
    }
}
run();
