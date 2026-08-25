import * as admin from "firebase-admin";
import * as crypto from "crypto";
import axios from "axios";

admin.initializeApp();

const binanceApiKey = process.env.BINANCE_API_KEY || "";
const binanceApiSecret = process.env.BINANCE_API_SECRET || "";

function sign(queryString: string, secret: string): string {
    return crypto.createHmac("sha256", secret).update(queryString).digest("hex");
}

function safeNum(value: unknown, fallback: number = 0): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

async function binanceGet(path: string, params: Record<string, string>): Promise<any> {
    const timestamp = Date.now();
    const qs = new URLSearchParams({
        ...params,
        timestamp: String(timestamp),
        recvWindow: "5000",
    }).toString();
    const signature = sign(qs, binanceApiSecret);
    const url = `https://fapi.binance.com${path}?${qs}&signature=${signature}`;
    
    const { data } = await axios.get(url, {
        headers: { "X-MBX-APIKEY": binanceApiKey },
        timeout: 10000,
    });
    
    return data;
}

async function handleSync(req: any, res: any) {
    try {
        console.log("[CloudRun] Iniciando sincronización...");
        
        // Obtener datos de Binance en paralelo
        const [accountRes, positionRes] = await Promise.all([
            binanceGet("/fapi/v3/account", {}),
            binanceGet("/fapi/v2/positionRisk", { current: "true" }),
        ]);

        // Construir mapa de posiciones por symbol+positionSide (hedge mode)
        const positionMap = new Map<string, any>();
        for (const p of positionRes) {
            if (safeNum(p.positionAmt) !== 0) {
                const posSide = p.positionSide || "BOTH";
                positionMap.set(`${p.symbol}-${posSide}`, p);
            }
        }

        // Procesar posiciones
        const positions: any[] = accountRes.positions
            .filter((p: any) => safeNum(p.positionAmt) !== 0)
            .map((p: any) => {
                const posSide = p.positionSide || "BOTH";
                const risk = positionMap.get(`${p.symbol}-${posSide}`) || {};
                const entryPrice = safeNum(risk.entryPrice);
                const markPrice = safeNum(risk.markPrice);
                const liqPrice = safeNum(risk.liquidationPrice);
                const unrealizedPnl = safeNum(p.unrealizedProfit);

                let distToLiqPercent = 0;
                if (liqPrice > 0 && markPrice > 0) {
                    if (safeNum(p.positionAmt) > 0) {
                        distToLiqPercent = ((markPrice - liqPrice) / markPrice) * 100;
                    } else {
                        distToLiqPercent = ((liqPrice - markPrice) / markPrice) * 100;
                    }
                }

                const initialMargin = safeNum(p.initialMargin);
                const roe = initialMargin > 0 ? (unrealizedPnl / initialMargin) * 100 : 0;

                // Derive side: use positionSide if hedge mode, else positionAmt sign
                let side: "LONG" | "SHORT";
                if (posSide === "LONG") side = "LONG";
                else if (posSide === "SHORT") side = "SHORT";
                else side = safeNum(p.positionAmt) > 0 ? "LONG" : "SHORT";

                return {
                    symbol: p.symbol,
                    side,
                    size: Math.abs(safeNum(p.positionAmt)),
                    notional: Math.abs(safeNum(p.notional)),
                    entryPrice,
                    markPrice,
                    liquidationPrice: liqPrice,
                    leverage: Math.max(1, Math.round(safeNum(risk.leverage, 1))),
                    unrealizedPnl,
                    initialMargin,
                    maintMargin: safeNum(p.maintMargin),
                    marginType: risk.marginType || "cross",
                    breakEvenPrice: safeNum(risk.breakEvenPrice),
                    distToLiqPercent: Math.max(0, distToLiqPercent),
                    roe,
                    updateTime: safeNum(p.updateTime),
                    fundingRate: safeNum(risk.lastFundingRate),
                };
            });

        // Datos de cuenta — usa la misma fórmula que CF/browser
        const totalMaintMargin = safeNum(accountRes.totalMaintMargin);
        const totalMarginBalance = safeNum(accountRes.totalMarginBalance);

        const account = {
            totalWalletBalance: safeNum(accountRes.totalWalletBalance),
            totalUnrealizedProfit: safeNum(accountRes.totalUnrealizedProfit),
            totalMarginBalance,
            totalInitialMargin: safeNum(accountRes.totalInitialMargin),
            totalMaintMargin,
            availableBalance: safeNum(accountRes.availableBalance),
            maxWithdrawAmount: safeNum(accountRes.maxWithdrawAmount),
            marginRatio: totalMarginBalance > 0
                ? (totalMaintMargin / totalMarginBalance) * 100
                : 0,
        };

        // Guardar en Firestore
        const futuresData = {
            account,
            positions,
            lastSync: Date.now(),
            syncSource: "cloud-run",
        };

        await admin.firestore()
            .collection('settings')
            .doc('futuresData')
            .set(futuresData);

        console.log("[CloudRun] Sincronización completada. Posiciones:", positions.length);

        res.json({
            success: true,
            data: futuresData,
            message: `Sincronizados ${positions.length} posiciones`
        });
    } catch (error: any) {
        console.error("[CloudRun] Error:", error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

export const syncFutures = async (req: any, res: any) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    await handleSync(req, res);
};
