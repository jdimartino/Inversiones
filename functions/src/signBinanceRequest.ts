import * as functions from "firebase-functions/v1";
import * as crypto from "crypto";
import { defineSecret } from "firebase-functions/params";

const binanceConfigRaw = defineSecret("FUNCTIONS_CONFIG_EXPORT");

// ─── Helper para firmar solicitudes ──────────────────────────────────────────

function sign(queryString: string, secret: string): string {
    return crypto.createHmac("sha256", secret).update(queryString).digest("hex");
}

// ─── Endpoint para firmar solicitudes de Binance ───────────────────────────────

export const signBinanceRequest = functions
    .region("us-central1")
    .https.onCall(async (data: any, context) => {
        const { path, params } = data;
        
        if (!path) {
            throw new functions.https.HttpsError(
                'invalid-argument',
                'Path es requerido'
            );
        }

        try {
            const bConfig = JSON.parse(binanceConfigRaw.value() as string).binance;
            
            if (!bConfig?.api_key || !bConfig?.api_secret) {
                throw new Error("Binance API keys not configured");
            }

            const { api_key: apiKey, api_secret: apiSecret } = bConfig;

            // Generar signature
            const timestamp = Date.now();
            const qs = new URLSearchParams({
                ...params,
                timestamp: String(timestamp),
                recvWindow: "5000",
            }).toString();
            
            const signature = sign(qs, apiSecret);

            return {
                success: true,
                apiKey,
                timestamp,
                signature,
                recvWindow: 5000
            };
        } catch (error: any) {
            console.error("[signBinanceRequest] Error:", error.message);
            throw new functions.https.HttpsError(
                'internal',
                error.message || 'Error al firmar solicitud'
            );
        }
    });
