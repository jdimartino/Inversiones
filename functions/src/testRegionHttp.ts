import * as functions from "firebase-functions/v1";
import * as crypto from "crypto";
import axios from "axios";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import * as express from "express";

const binanceConfigRaw = defineSecret("FUNCTIONS_CONFIG_EXPORT");
admin.initializeApp();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sign(queryString: string, secret: string): string {
    return crypto.createHmac("sha256", secret).update(queryString).digest("hex");
}

async function binanceGet(
    path: string,
    params: Record<string, string>,
    apiKey: string,
    apiSecret: string
): Promise<any> {
    const timestamp = Date.now();
    const qs = new URLSearchParams({
        ...params,
        timestamp: String(timestamp),
        recvWindow: "5000",
    }).toString();
    const signature = sign(qs, apiSecret);
    const url = `https://fapi.binance.com${path}?${qs}&signature=${signature}`;
    
    console.log(`[TestRegion] Trying: ${url}`);
    
    const { data } = await axios.get(url, {
        headers: { "X-MBX-APIKEY": apiKey },
        timeout: 10000,
    });
    
    return data;
}

async function sendTelegram(text: string): Promise<boolean> {
    const token = process.env.TELEGRAM_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) {
        console.log("[TestRegion] Telegram not configured");
        return false;
    }

    try {
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: chatId,
            text,
            parse_mode: "Markdown",
            disable_web_page_preview: true,
        });
        return true;
    } catch (e: any) {
        console.error("[TestRegion] Telegram error:", e.response?.data || e.message);
        return false;
    }
}

// ─── HTTP Test Function ─────────────────────────────────────────────────────────

export const testRegionHttp = functions
    .region("europe-west1")
    .https.onRequest(async (req: express.Request, res: express.Response) => {
        const regionsToTest = [
            "europe-west1",  // Francia (actual - fallando)
            "asia-southeast1",  // Singapur
            "asia-northeast1",  // Tokyo
            "northamerica-northeast1",  // Canadá
            "us-central1",  // Iowa
            "us-east1",  // Virginia
            "us-west1",  // Oregon
        ];

        const results: any[] = [];
        const bConfig = JSON.parse(binanceConfigRaw.value() as string).binance;
        
        if (!bConfig?.api_key || !bConfig?.api_secret) {
            res.status(500).json({ error: "Binance API keys not configured" });
            return;
        }

        const { api_key: apiKey, api_secret: apiSecret } = bConfig;

        res.send("Testing regions...\n");

        for (const region of regionsToTest) {
            try {
                console.log(`[TestRegion] Testing ${region}...`);
                
                // Intentar conectar a Binance
                const result = await binanceGet("/fapi/v3/account", {}, apiKey, apiSecret);
                
                const message = `✅ ${region} - Balance: $${result.totalWalletBalance}`;
                results.push({ region, status: "success", balance: result.totalWalletBalance, message });
                res.send(`${message}\n`);
            } catch (e: any) {
                const errorMsg = e.response?.data?.msg || e.message || "Unknown error";
                const message = `❌ ${region} - ${errorMsg}`;
                results.push({ region, status: "failed", error: errorMsg, message });
                res.send(`${message}\n`);
            }
        }

        // Enviar reporte a Telegram
        const report = results.map(r => r.message).join("\n");
        await sendTelegram(`*Resultados de Prueba de Regiones*\n━━━━━━━━━━━━━━━━━━━━\n${report}`);

        res.send("\n━━━━━━━━━━━━━━━━━━━━\nReport enviado a Telegram");
        res.end();

        console.log("Test completed. Results:", results);
    });
