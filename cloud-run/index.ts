import * as admin from "firebase-admin";
import * as crypto from "crypto";
import axios from "axios";

admin.initializeApp();

const binanceApiKey = process.env.BINANCE_API_KEY || "";
const binanceApiSecret = process.env.BINANCE_API_SECRET || "";

function sign(queryString: string, secret: string): string {
    return crypto.createHmac("sha256", secret).update(queryString).digest("hex");
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
            binanceGet("/fapi/v2/positionRisk", {}),
        ]);

        // Construir mapa de posiciones
        const positionMap = new Map<string, any>();
        for (const p of positionRes) {
            if (parseFloat(p.positionAmt) !== 0) {
                positionMap.set(p.symbol, p);
            }
        }

        // Procesar posiciones
        const positions: any[] = accountRes.positions
            .filter((p: any) => parseFloat(p.positionAmt) !== 0)
            .map((p: any) => {
                const risk = positionMap.get(p.symbol) || {};
                const entryPrice = parseFloat(risk.entryPrice || "0");
                const markPrice = parseFloat(risk.markPrice || "0");
                const liqPrice = parseFloat(risk.liquidationPrice || "0");
                const unrealizedPnl = parseFloat(p.unrealizedProfit);

                let distToLiqPercent = 0;
                if (liqPrice > 0 && markPrice > 0) {
                    if (parseFloat(p.positionAmt) > 0) {
                        distToLiqPercent = ((markPrice - liqPrice) / markPrice) * 100;
                    } else {
                        distToLiqPercent = ((liqPrice - markPrice) / markPrice) * 100;
                    }
                }

                const initialMargin = parseFloat(p.initialMargin);
                const roe = initialMargin > 0 ? (unrealizedPnl / initialMargin) * 100 : 0;

                return {
                    symbol: p.symbol,
                    side: parseFloat(p.positionAmt) > 0 ? "LONG" : "SHORT",
                    size: Math.abs(parseFloat(p.positionAmt)),
                    notional: Math.abs(parseFloat(p.notional)),
                    entryPrice,
                    markPrice,
                    liquidationPrice: liqPrice,
                    leverage: parseInt(risk.leverage || "1"),
                    unrealizedPnl,
                    initialMargin,
                    maintMargin: parseFloat(p.maintMargin),
                    marginType: risk.marginType || "cross",
                    breakEvenPrice: parseFloat(risk.breakEvenPrice || "0"),
                    distToLiqPercent,
                    roe,
                    updateTime: p.updateTime,
                    fundingRate: parseFloat(risk.lastFundingRate || "0"),
                };
            });

        // Datos de cuenta
        const account = {
            totalWalletBalance: parseFloat(accountRes.totalWalletBalance),
            totalUnrealizedProfit: parseFloat(accountRes.totalUnrealizedProfit),
            totalMarginBalance: parseFloat(accountRes.totalMarginBalance),
            totalInitialMargin: parseFloat(accountRes.totalInitialMargin),
            totalMaintMargin: parseFloat(accountRes.totalMaintMargin),
            availableBalance: parseFloat(accountRes.availableBalance),
            maxWithdrawAmount: parseFloat(accountRes.maxWithdrawAmount),
            marginRatio: parseFloat(accountRes.marginRatio) || 0,
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
