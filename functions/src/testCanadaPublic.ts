import * as functions from "firebase-functions/v1";
import axios from "axios";

// Prueba pública para región Canadá
export const testCanadaPublic = functions
    .region("northamerica-northeast1")  // Canadá
    .https.onRequest(async (req, res) => {
        try {
            console.log("[TestCanada] Conectando a Binance desde Canadá...");
            
            const response = await axios.get("https://fapi.binance.com/fapi/v1/health", {
                timeout: 10000
            });
            
            console.log("[TestCanada] Respuesta:", response.data);
            
            res.json({
                success: true,
                region: "northamerica-northeast1 (Canadá)",
                data: response.data
            });
        } catch (error: any) {
            console.error("[TestCanada] Error:", error.message);
            res.status(500).json({
                success: false,
                region: "northamerica-northeast1 (Canadá)",
                error: error.message
            });
        }
    });
