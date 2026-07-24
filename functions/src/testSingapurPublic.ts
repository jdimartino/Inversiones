import * as functions from "firebase-functions/v1";
import axios from "axios";

// Prueba pública para región Singapur
export const testSingapurPublic = functions
    .region("asia-southeast1")  // Singapur
    .https.onRequest(async (req, res) => {
        try {
            console.log("[TestSingapur] Conectando a Binance desde Singapur...");
            
            const response = await axios.get("https://fapi.binance.com/fapi/v1/health", {
                timeout: 10000
            });
            
            console.log("[TestSingapur] Respuesta:", response.data);
            
            res.json({
                success: true,
                region: "asia-southeast1 (Singapur)",
                data: response.data
            });
        } catch (error: any) {
            console.error("[TestSingapur] Error:", error.message);
            res.status(500).json({
                success: false,
                region: "asia-southeast1 (Singapur)",
                error: error.message
            });
        }
    });
