import * as functions from "firebase-functions/v1";
import axios from "axios";

// Prueba pública para región USA Este (Virginia)
export const testUSEastPublic = functions
    .region("us-east1")  // Virginia, USA
    .https.onRequest(async (req, res) => {
        try {
            console.log("[TestUSEast] Conectando a Binance desde us-east1...");
            
            const response = await axios.get("https://fapi.binance.com/fapi/v1/health", {
                timeout: 10000
            });
            
            console.log("[TestUSEast] Respuesta:", response.data);
            
            res.json({
                success: true,
                region: "us-east1 (Virginia, USA)",
                data: response.data
            });
        } catch (error: any) {
            console.error("[TestUSEast] Error:", error.message);
            res.status(500).json({
                success: false,
                region: "us-east1 (Virginia, USA)",
                error: error.message
            });
        }
    });
