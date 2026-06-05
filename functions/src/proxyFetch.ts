import * as functions from "firebase-functions/v1";
import axios from "axios";

/**
 * Proxy: fetch a page and return its text content.
 * Avoids CORS issues when the frontend needs to scrape public pages.
 */
export const proxyFetch = functions
    .region("europe-west1")
    .runWith({ timeoutSeconds: 30, memory: "256MB" })
    .https.onRequest(async (req, res) => {
        res.set("Access-Control-Allow-Origin", "*");

        if (req.method === "OPTIONS") {
            res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            res.set("Access-Control-Allow-Headers", "Content-Type");
            res.status(204).send("");
            return;
        }

        const url = req.query.url as string || req.body?.url;
        if (!url) {
            res.status(400).json({ error: "Missing 'url' parameter" });
            return;
        }

        try {
            const { data } = await axios.get(url, {
                timeout: 25000,
                headers: {
                    "User-Agent": "Mozilla/5.0 (compatible; InversionesBot/1.0)",
                    Accept: "text/html",
                },
            });
            res.json({ content: typeof data === "string" ? data : JSON.stringify(data) });
        } catch (e: any) {
            const errMsg = e.response?.data || e.message;
            console.error("[proxyFetch] Error fetching", url, errMsg);
            res.status(500).json({ error: String(errMsg) });
        }
    });
