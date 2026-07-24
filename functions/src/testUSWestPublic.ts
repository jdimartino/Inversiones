import * as functions from "firebase-functions/v1";
import axios from "axios";

// Prueba pública para región USA Oeste (Oregon)
export const testUSWestPublic = functions
    .region("us-west1")  // Oregon, USA
    .https.onRequest(async (req, res) => {
        try {
            console.log("[TestUSWest] Conectando a Binance desde us-west1...");
            
            const response = await axios.get("https://fapi.binance.com/fapi/v1/health", {
                timeout: 10000
            });
            
            console.log("[TestUSWest] Respuesta:", response.data);
            
            res.json({
                success: true,
                region: "us-west1 (Oregon, USA)",
                data: response.data
            });
        } catch (error: any) {
            console.error("[TestUSWest] Error:", error.message);
            res.status(500).json({
                success: false,
                region: "us-west1 (Oregon, USA)",
                error: error.message
            });
        }
    });
