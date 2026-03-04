import * as admin from "firebase-admin";
import axios from "axios";

const serviceAccount = require("/Users/jdimartino/Desktop/Antigravity/inversiones/functions/micriptoapp-firebase-adminsdk-rth8s-8b4e7235db.json");

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

// Telegram Bot details
const TELEGRAM_BOT_TOKEN = "8434186533:AAG0mEwfF_tklVkxelS7D_D41nVSbB8r5sw";
const CHAT_ID = "442730401";

async function run() {
    console.log("Starting alert check...");
    try {
        const configSnap = await db.collection("config").doc("alerts").get();
        if (!configSnap.exists) {
            console.log("No alert configuration found in 'config/alerts'. Exiting.");
            return;
        }

        const config = configSnap.data() || {};
        const minGlobalPNL = config.minPNL !== undefined ? config.minPNL : -5000;
        const maxGlobalPNL = config.maxPNL !== undefined ? config.maxPNL : 10000;
        const assetAlerts = config.assetAlerts || {};

        console.log(`Global thresholds: MIN=${minGlobalPNL}, MAX=${maxGlobalPNL}`);
        console.log(`Asset alerts: ${JSON.stringify(assetAlerts, null, 2)}`);

        // Get prices
        const priceRes = await axios.get("https://api.binance.com/api/v3/ticker/price");
        const prices: Record<string, number> = {};
        for (const item of priceRes.data) {
            prices[item.symbol] = Number(item.price);
        }

        // Calculate PNL
        let globalInvested = 0;
        let globalCurrentValue = 0;
        const triggeredAssets: string[] = [];

        const snap = await db.collection("inversiones").get();
        snap.forEach((doc) => {
            const inv = doc.data();
            const symbol = `${inv.coin}USDT`;

            const currentPrice = prices[symbol];
            if (!currentPrice) return;

            const currentValue = inv.quantity * currentPrice;
            const pnl = currentValue - inv.invested;
            const roiPercent = (pnl / inv.invested) * 100;

            globalInvested += inv.invested;
            globalCurrentValue += currentValue;

            // Check specific asset rule
            const rules = assetAlerts[inv.coin];
            if (rules) {
                if (
                    (rules.minPercent !== undefined && roiPercent <= rules.minPercent) ||
                    (rules.maxPercent !== undefined && roiPercent >= rules.maxPercent)
                ) {
                    triggeredAssets.push(
                        `• 🟢 *${inv.coin}* (Inv. $${inv.invested.toFixed(2)}): ROI ${roiPercent >= 0 ? '🟢' : '🔴'} ${roiPercent.toFixed(2)}% (PNL: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)})`
                    );
                    console.log(`Triggered asset: ${inv.coin} at ${roiPercent.toFixed(2)}% (Inv: $${inv.invested})`);
                }
            }
        });

        const globalPnl = globalCurrentValue - globalInvested;
        console.log(`Global PNL calculated: $${globalPnl.toFixed(2)}`);

        // Global check
        let globalTriggered = false;
        if (globalPnl <= minGlobalPNL || globalPnl >= maxGlobalPNL) {
            globalTriggered = true;
            console.log(`Global trigger! PNL: ${globalPnl}`);
        }

        // Send alert
        if (globalTriggered || triggeredAssets.length > 0) {
            let message = `📊 *Prueba de Alerta INDIVIDUAL*\n\n`;
            message += `*PNL Global:* ${globalPnl >= 0 ? '🟢' : '🔴'} $${globalPnl.toFixed(2)}\n`;

            if (triggeredAssets.length > 0) {
                message += `\n🚨 *Alertas por Activo (Individual):*\n`;
                message += triggeredAssets.join('\n');
            } else {
                message += `\n🚨 *Alerta:* El PNL Global ha superado tu límite de $${globalPnl <= minGlobalPNL ? minGlobalPNL : maxGlobalPNL}.`;
            }

            console.log("Sending Telegram message:\n", message);
            const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
            await axios.post(url, {
                chat_id: CHAT_ID,
                text: message,
                parse_mode: "Markdown"
            });
            console.log("Message sent via Telegram.");
        } else {
            console.log("No thresholds met. No alert sent.");
        }
    } catch (e) {
        console.error("Error running script", e);
    }
}

run();
