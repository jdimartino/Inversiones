import * as functions from "firebase-functions/v1";
import axios from "axios";

// ─── Helper: CORS (mismo patrón que getBinanceWallet en index.ts) ──────────
function setCorsHeaders(res: functions.Response) {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

// ─── OpenRouter ──────────────────────────────────────────────────────────
export const getOpenRouterUsage = functions
    .region("europe-west1")
    .runWith({ secrets: ["OPENROUTER_API_KEY"], memory: "128MB", timeoutSeconds: 15 })
    .https.onRequest(async (req, res) => {
        setCorsHeaders(res);
        if (req.method === "OPTIONS") { res.status(204).send(""); return; }

        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
            res.status(200).json({ configured: false, error: "OPENROUTER_API_KEY no configurada" });
            return;
        }

        try {
            const { data } = await axios.get("https://openrouter.ai/api/v1/key", {
                headers: { Authorization: `Bearer ${apiKey}` },
                timeout: 10000,
            });
            const d = data?.data ?? {};

            // /key solo da el límite de ESA key puntual (casi siempre null si no
            // le pusiste tope de gasto). El saldo real de la cuenta está en
            // /credits: total_credits - total_usage. Si esa key no tiene permiso
            // (algunas cuentas piden "management key"), seguimos sin el saldo
            // pero sin romper el resto de los datos.
            let creditRemaining: number | null = null;
            let totalCredits: number | null = null;
            let totalUsage: number | null = null;
            try {
                const creditsRes = await axios.get("https://openrouter.ai/api/v1/credits", {
                    headers: { Authorization: `Bearer ${apiKey}` },
                    timeout: 10000,
                });
                const c = creditsRes.data?.data ?? {};
                totalCredits = typeof c.total_credits === "number" ? c.total_credits : null;
                totalUsage = typeof c.total_usage === "number" ? c.total_usage : null;
                if (totalCredits !== null && totalUsage !== null) {
                    creditRemaining = totalCredits - totalUsage;
                }
            } catch (creditsError: any) {
                console.warn("[getOpenRouterUsage] /credits no disponible:", creditsError.message);
            }

            res.status(200).json({
                configured: true,
                limit: d.limit ?? null,
                limitRemaining: d.limit_remaining ?? null,
                usage: d.usage ?? 0,
                usageDaily: d.usage_daily ?? 0,
                usageWeekly: d.usage_weekly ?? 0,
                usageMonthly: d.usage_monthly ?? 0,
                isFreeTier: d.is_free_tier ?? null,
                freeModelDaily: d.free_model_daily_requests ?? null,
                totalCredits,
                totalUsage,
                creditRemaining,
            });
        } catch (error: any) {
            console.error("[getOpenRouterUsage] Error:", error.message);
            res.status(200).json({ configured: true, error: error.message });
        }
    });

// ─── DeepSeek ────────────────────────────────────────────────────────────
export const getDeepSeekBalance = functions
    .region("europe-west1")
    .runWith({ secrets: ["DEEPSEEK_API_KEY"], memory: "128MB", timeoutSeconds: 15 })
    .https.onRequest(async (req, res) => {
        setCorsHeaders(res);
        if (req.method === "OPTIONS") { res.status(204).send(""); return; }

        const apiKey = process.env.DEEPSEEK_API_KEY;
        if (!apiKey) {
            res.status(200).json({ configured: false, error: "DEEPSEEK_API_KEY no configurada" });
            return;
        }

        try {
            const { data } = await axios.get("https://api.deepseek.com/user/balance", {
                headers: { Authorization: `Bearer ${apiKey}` },
                timeout: 10000,
            });
            const info = Array.isArray(data?.balance_infos) ? data.balance_infos[0] : null;
            res.status(200).json({
                configured: true,
                isAvailable: data?.is_available ?? null,
                currency: info?.currency ?? "USD",
                totalBalance: info ? parseFloat(info.total_balance) : null,
                grantedBalance: info ? parseFloat(info.granted_balance) : null,
                toppedUpBalance: info ? parseFloat(info.topped_up_balance) : null,
            });
        } catch (error: any) {
            console.error("[getDeepSeekBalance] Error:", error.message);
            res.status(200).json({ configured: true, error: error.message });
        }
    });
