import * as functions from "firebase-functions/v1";
import axios from "axios";

// Prueba pública para región Tokyo
export const testTokyoPublic = functions
    .region("asia-northeast1")  // Tokyo
    .https.onRequest(async (req, res) => {
        try {
            console.log("[TestTokyo] Conectando a Binance desde Tokyo...");
            
            const response = await axios.get("https://fapi.binance.com/fapi/v1/health", {
                timeout: 10000
            });
            
            console.log("[TestTokyo] Respuesta:", response.data);
            
            res.json({
                success: true,
                region: "asia-northeast1 (Tokyo)",
                data: response.data
            });
        } catch (error: any) {
            console.error("[TestTokyo] Error:", error.message);
            res.status(500).json({
                success: false,
                region: "asia-northeast1 (Tokyo)",
                error: error.message
            });
        }
    });
