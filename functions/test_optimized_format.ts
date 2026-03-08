import * as axios from "axios";

// Configuración manual para la prueba (basada en los secretos de Firebase)
const TELEGRAM_TOKEN = "7884814271:AAH8e_iQkY1Bv9k3U0zGf3_B6zKvzF1X7rA";
const CHAT_ID = "-4770289658";
const DIVIDER = "────────────────────";

const fmt = (n: number): string => new Intl.NumberFormat('en-US').format(Math.round(n));
const pnlSign = (n: number): string => n >= 0 ? "+" : "";

async function sendTest() {
    console.log("Enviando formato de prueba...");

    const globalPNL = -34242;
    const totalInvested = 109985;
    const totalCurrentValue = 75743;

    const triggeredGlobalMessages = [
        "📉 *PNL Global* cayó a *-$34,242* (Límite: 🔽 <= -$30,000)"
    ];

    const triggeredIndividualMessages = [
        "📉 *ADA* cayó a *-1.7%* (Límite: 🔽 <= -1%)"
    ];

    const assetDetails = [
        "🟢 *BTC:* +$501 (+1.2%)",
        "🔴 *ADA:* -$83 (-1.7%)",
        "🔴 *LTC:* -$112 (-2.2%)",
        "🔴 *ADA:* -$1,285 (-25.7%)",
        "🔴 *DOGE:* -$2,482 (-49.6%)",
        "🔴 *ADA:* -$2,523 (-50.5%)"
    ];

    let message = `⚠️ *ALERTA PNL — Crypto Command* (Prueba)\n${DIVIDER}\n`;

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

    try {
        await (axios as any).default.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text: message,
            parse_mode: "Markdown",
        });
        console.log("✅ Mensaje enviado con éxito.");
    } catch (e: any) {
        console.error("❌ Error enviando mensaje:", e.response?.data || e.message);
    }
}

sendTest();
