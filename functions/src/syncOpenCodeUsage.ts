import * as functions from "firebase-functions/v1";
import axios from "axios";

export const syncOpenCodeUsage = functions
  .region("europe-west1")
  .runWith({ secrets: ["OPENCODE_API_KEY"] })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    const apiKey = process.env.OPENCODE_API_KEY;
    if (!apiKey) {
      res.status(200).json({ error: "OPENCODE_API_KEY no configurada. Ejecuta: firebase functions:secrets:set OPENCODE_API_KEY" });
      return;
    }

    try {
      const response = await axios.get("https://opencode.ai/zen/go/v1/usage", {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
        timeout: 15000,
      });

      const data = response.data;
      res.status(200).json({
        usagePercent: data.usagePercent ?? data.usage_percent ?? data.usagePct,
        resetInSec: data.resetInSec ?? data.reset_in_sec,
        raw: data,
      });
    } catch (err: any) {
      const status = err.response?.status || 500;
      const msg = err.response?.data?.error || err.message || "Error desconocido";

      if (status === 401 || status === 403) {
        res.status(200).json({ error: "API key inválida o sin acceso a OpenCode Go. Verifica en https://opencode.ai/auth" });
      } else {
        res.status(200).json({ error: `Error al consultar API: ${msg}` });
      }
    }
  });
