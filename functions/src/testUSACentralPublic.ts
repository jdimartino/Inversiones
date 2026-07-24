import * as functions from "firebase-functions/v1";
import axios from "axios";

// Prueba pública para región USA Central
export const testUSACentralPublic = functions
    .region("us-central1")  // Iowa, USA
    .https.onRequest(async (req, res) => {
        try {
            console.log("[TestUSACentral] Conectando a Binance desde us-central1...");
            
            const response = await axios.get("https://fapi.binance.com/fapi/v1/health", {
                timeout: 10000
            });
            
            console.log("[TestUSACentral] Respuesta:", response.data);
            
            res.json({
                success: true,
                region: "us-central1 (Iowa, USA)",
                data: response.data
            });
        } catch (error: any) {
            console.error("[TestUSACentral] Error:", error.message);
            res.status(500).json({
                success: false,
                region: "us-central1 (Iowa, USA)",
                error: error.message
            });
        }
    });
