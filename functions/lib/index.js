"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkPNLAlerts = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios_1 = require("axios");
admin.initializeApp();
const db = admin.firestore();
const TELEGRAM_TOKEN = "8434186533:AAG0mEwfF_tklVkxelS7D_D41nVSbB8r5sw";
const CHAT_ID = "442730401";
exports.checkPNLAlerts = functions.pubsub.schedule("every 1 hours").onRun(async (context) => {
    try {
        // 1. Obtener precios de Binance
        const { data } = await axios_1.default.get("https://api.binance.com/api/v3/ticker/price");
        const prices = {};
        for (const item of data) {
            prices[item.symbol] = parseFloat(item.price);
        }
        // 2. Obtener inversiones de Firestore
        const snap = await db.collection("inversiones").get();
        let totalInvested = 0;
        let totalCurrentValue = 0;
        const assetDetails = [];
        snap.forEach((doc) => {
            const inv = doc.data();
            const symbol = `${inv.coin}USDT`;
            const currentPrice = prices[symbol] || 0;
            const currentValue = currentPrice * inv.quantity;
            totalInvested += inv.invested;
            totalCurrentValue += currentValue;
            const pnl = currentValue - inv.invested;
            // Format details nicely
            const sign = pnl >= 0 ? "+" : "";
            assetDetails.push(`${inv.coin}: ${sign}$${Math.round(pnl).toLocaleString()}`);
        });
        const globalPNL = totalCurrentValue - totalInvested;
        // 3. Leer configuración de alertas
        const configSnap = await db.collection("config").doc("alerts").get();
        // Defaults: alert if below -40k or above 10k
        let minAlert = -40000;
        let maxAlert = 10000;
        if (configSnap.exists) {
            const conf = configSnap.data();
            if ((conf === null || conf === void 0 ? void 0 : conf.minPNL) !== undefined)
                minAlert = conf.minPNL;
            if ((conf === null || conf === void 0 ? void 0 : conf.maxPNL) !== undefined)
                maxAlert = conf.maxPNL;
        }
        const shouldAlert = globalPNL <= minAlert || globalPNL >= maxAlert;
        if (shouldAlert) {
            const pnlSign = globalPNL >= 0 ? "+" : "";
            const message = `⚠️ *ALERTA PNL - Crypto Command*\n\n` +
                `*PNL Total:* ${pnlSign}$${Math.round(globalPNL).toLocaleString()}\n` +
                `*Invertido:* $${Math.round(totalInvested).toLocaleString()}\n` +
                `*Actual:* $${Math.round(totalCurrentValue).toLocaleString()}\n\n` +
                `*Detalle:*\n${assetDetails.join(" \\| ")}`;
            await axios_1.default.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
                chat_id: CHAT_ID,
                text: message,
                parse_mode: "MarkdownV2" // Usando MarkdownV2 para mejor formato
            });
            console.log("Alerta enviada a Telegram. PNL:", globalPNL);
        }
        else {
            console.log(`PNL (${globalPNL}) dentro de los límites (${minAlert} a ${maxAlert}). No se envió alerta.`);
        }
    }
    catch (e) {
        console.error("Error validando alertas:", e);
    }
});
//# sourceMappingURL=index.js.map