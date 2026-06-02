import * as functions from "firebase-functions";
import * as crypto from "crypto";
import axios from "axios";

// ─── Helpers (copiados de futuresSync para independencia) ─────────────────────

function sign(queryString: string, secret: string): string {
    return crypto.createHmac("sha256", secret).update(queryString).digest("hex");
}

async function binanceGet(
    path: string,
    params: Record<string, string>,
    apiKey: string,
    apiSecret: string
): Promise<any> {
    const timestamp = Date.now();
    const qs = new URLSearchParams({
        ...params,
        timestamp: String(timestamp),
        recvWindow: "5000",
    }).toString();
    const signature = sign(qs, apiSecret);
    const url = `https://fapi.binance.com${path}?${qs}&signature=${signature}`;
    const { data } = await axios.get(url, {
        headers: { "X-MBX-APIKEY": apiKey },
        timeout: 10000,
    });
    return data;
}

async function sendTelegram(text: string): Promise<boolean> {
    const token = process.env.TELEGRAM_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) {
        console.error("[testFuturesAlerts] Telegram credentials missing.");
        return false;
    }

    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
                chat_id: chatId,
                text,
                parse_mode: "Markdown",
                disable_web_page_preview: true,
            });
            return true;
        } catch (e: any) {
            console.error(`[testFuturesAlerts] Telegram attempt ${attempt} failed:`, e.response?.data || e.message);
            if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * attempt));
        }
    }
    return false;
}

// ─── Test Function ────────────────────────────────────────────────────────────

export const testFuturesAlerts = functions
    .region("europe-west1")
    .runWith({ secrets: ["TELEGRAM_TOKEN", "TELEGRAM_CHAT_ID"] })
    .https.onRequest(async (req, res) => {
        res.set("Access-Control-Allow-Origin", "*");

        const type = (req.query.type as string) || "margen";

        const config = functions.config().binance;
        if (!config?.api_key || !config?.api_secret) {
            res.status(500).json({ error: "Binance API keys not configured." });
            return;
        }

        try {
            // Fetch real data from Binance
            const [accountRes, positionRes] = await Promise.all([
                binanceGet("/fapi/v3/account", {}, config.api_key, config.api_secret),
                binanceGet("/fapi/v2/positionRisk", {}, config.api_key, config.api_secret),
            ]);

            const positionMap = new Map<string, any>();
            for (const p of positionRes) {
                if (parseFloat(p.positionAmt) !== 0) {
                    positionMap.set(p.symbol, p);
                }
            }

            const positions = accountRes.positions
                .filter((p: any) => parseFloat(p.positionAmt) !== 0)
                .map((p: any) => {
                    const risk = positionMap.get(p.symbol) || {};
                    const entryPrice = parseFloat(risk.entryPrice || "0");
                    const markPrice = parseFloat(risk.markPrice || "0");
                    const liqPrice = parseFloat(risk.liquidationPrice || "0");
                    const unrealizedPnl = parseFloat(p.unrealizedProfit);
                    let distToLiqPercent = 0;
                    if (liqPrice > 0 && markPrice > 0) {
                        distToLiqPercent = ((markPrice - liqPrice) / markPrice) * 100;
                    }
                    return {
                        symbol: p.symbol,
                        side: parseFloat(p.positionAmt) > 0 ? "LONG" : "SHORT",
                        size: Math.abs(parseFloat(p.positionAmt)),
                        entryPrice,
                        markPrice,
                        liquidationPrice: liqPrice,
                        leverage: parseInt(risk.leverage || "1"),
                        unrealizedPnl,
                        initialMargin: parseFloat(p.initialMargin),
                        distToLiqPercent,
                    };
                });

            const totalUnrealizedProfit = parseFloat(accountRes.totalUnrealizedProfit);
            const totalMarginBalance = parseFloat(accountRes.totalMarginBalance);
            const totalMaintMargin = parseFloat(accountRes.totalMaintMargin);
            const availableBalance = parseFloat(accountRes.availableBalance);
            const marginRatio = totalMarginBalance > 0
                ? (totalMaintMargin / totalMarginBalance) * 100
                : 0;

            let message = "";

            if (type === "position" && positions.length > 0) {
                // Position liquidation proximity alert
                const pos = positions.reduce((closest: any, p: any) =>
                    p.distToLiqPercent < closest.distToLiqPercent ? p : closest
                );
                message =
                    `🔴 *POSICIÓN CERCA DE LIQUIDACIÓN*\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `*${pos.symbol}* ${pos.side} ${pos.leverage}x\n` +
                    `Entrada: $${pos.entryPrice} → Actual: $${pos.markPrice.toFixed(2)}\n` +
                    `Liquidación: $${pos.liquidationPrice.toFixed(2)}\n` +
                    `Distancia: *${pos.distToLiqPercent.toFixed(1)}%*\n` +
                    `PnL: ${pos.unrealizedPnl >= 0 ? "+" : ""}$${pos.unrealizedPnl.toFixed(2)}`;
            } else if (type === "position-roe" && positions.length > 0) {
                // Position ROE alert — picks the position with highest absolute ROE
                const pos = positions.reduce((closest: any, p: any) =>
                    Math.abs(p.roe || 0) > Math.abs(closest.roe || 0) ? p : closest
                );
                const roe = pos.roe || 0;
                const emoji = roe >= 0 ? "🟢" : "🔴";
                message =
                    `${emoji} *${pos.symbol}* — Alerta de ROE %\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `ROE actual: *${roe >= 0 ? "+" : ""}${roe.toFixed(1)}%*\n` +
                    `${pos.side} ${pos.leverage}x\n` +
                    `Precio mark: $${pos.markPrice.toFixed(2)}\n` +
                    `PnL: ${pos.unrealizedPnl >= 0 ? "+" : ""}$${pos.unrealizedPnl.toFixed(2)}`;
            } else if (type === "position-roe-usd" && positions.length > 0) {
                // Position ROE USD alert — picks the position with highest absolute PnL
                const pos = positions.reduce((closest: any, p: any) =>
                    Math.abs(p.unrealizedPnl || 0) > Math.abs(closest.unrealizedPnl || 0) ? p : closest
                );
                const pnl = pos.unrealizedPnl || 0;
                const emoji = pnl >= 0 ? "🟢" : "🔴";
                message =
                    `${emoji} *${pos.symbol}* — Alerta de ROE USD\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `PnL actual: *${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}*\n` +
                    `${pos.side} ${pos.leverage}x | ROE: ${pos.roe >= 0 ? "+" : ""}${(pos.roe || 0).toFixed(1)}%\n` +
                    `Precio mark: $${pos.markPrice.toFixed(2)}`;
            } else {
                // Margin ratio alert
                const emoji = marginRatio >= 90 ? "🔴" : marginRatio >= 80 ? "🟠" : "🟡";
                message =
                    `${emoji} *ALERTA MARGEN — Binance Futures*\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `Margen utilizado: *${marginRatio.toFixed(2)}%*\n` +
                    `Disponible: *$${availableBalance.toFixed(2)}*\n` +
                    `PnL total: *${totalUnrealizedProfit >= 0 ? "+" : ""}$${totalUnrealizedProfit.toFixed(2)}*\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `Buffer a liquidación: *${(100 - marginRatio).toFixed(2)}%*`;
            }

            // Send to Telegram
            const sent = await sendTelegram(message);

            res.json({
                sent,
                type,
                message,
                account: {
                    marginRatio: marginRatio.toFixed(2),
                    availableBalance,
                    totalUnrealizedProfit,
                },
                positionsCount: positions.length,
            });
        } catch (e: any) {
            const errData = e.response?.data || { message: e.message };
            console.error("[testFuturesAlerts] Error:", errData);
            res.status(e.response?.status || 500).json({
                error: "Error fetching data or sending alert",
                details: errData,
            });
        }
    });
