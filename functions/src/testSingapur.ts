import * as functions from "firebase-functions/v1";
import axios from "axios";

// Prueba simple para una región específica
export const testSingapur = functions
    .region("asia-southeast1")  // Singapur
    .https.onCall(async (data: any, context: any) => {
        try {
            console.log("[TestSingapur] Conectando a Binance desde Singapur...");
            
            const response = await axios.get("https://fapi.binance.com/fapi/v1/health", {
                timeout: 10000
            });
            
            console.log("[TestSingapur] Respuesta:", response.data);
            
            return {
                success: true,
                region: "asia-southeast1 (Singapur)",
                data: response.data
            };
        } catch (error: any) {
            console.error("[TestSingapur] Error:", error.message);
            return {
                success: false,
                region: "asia-southeast1 (Singapur)",
                error: error.message
            };
        }
    });
