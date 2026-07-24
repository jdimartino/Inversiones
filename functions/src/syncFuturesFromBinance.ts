import * as functions from "firebase-functions/v1";
import * as crypto from "crypto";
import axios from "axios";
import * as admin from "firebase-admin";
import { defineSecret } from "firebase-functions/params";

admin.initializeApp();

const binanceConfigRaw = defineSecret("FUNCTIONS_CONFIG_EXPORT");

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Main Sync Function ─────────────────────────────────────────────────────────

export const syncFuturesFromBinance = functions
    .region("us-central1")
    .https.onCall(async (data: any, context: any) => {
        // Verificar autenticación
        if (!context.auth) {
            throw new functions.https.HttpsError(
                'permission-denied',
                'Debe estar autenticado para sincronizar futuros'
            );
        }

        const userId = context.auth.uid;
        
        // Rate limiting: máximo 1 sincronización cada 30 segundos
        const lastSync = await admin.firestore()
            .collection('settings')
            .doc('futuresData')
            .get();
        
        if (lastSync.exists) {
            const lastSyncTime = lastSync.data()?.lastSync || 0;
            const timeSinceLastSync = Date.now() - lastSyncTime;
            
            if (timeSinceLastSync < 30000) { // 30 segundos
                throw new functions.https.HttpsError(
                    'resource-exhausted',
                    `Espere ${Math.ceil((30000 - timeSinceLastSync) / 1000)} segundos para sincronizar nuevamente`
                );
            }
        }

        try {
            const bConfig = JSON.parse(binanceConfigRaw.value() as string).binance;
            
            if (!bConfig?.api_key || !bConfig?.api_secret) {
                throw new Error("Binance API keys not configured");
            }

            const { api_key: apiKey, api_secret: apiSecret } = bConfig;

            console.log(`[SyncFutures] Iniciando sincronización para usuario ${userId}`);

            // Obtener datos de Binance en paralelo
            const [accountRes, positionRes] = await Promise.all([
                binanceGet("/fapi/v3/account", {}, apiKey, apiSecret),
                binanceGet("/fapi/v2/positionRisk", {}, apiKey, apiSecret),
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

                    // Distancia a liquidación %
                    let distToLiqPercent = 0;
                    if (liqPrice > 0 && markPrice > 0) {
                        if (parseFloat(p.positionAmt) > 0) {
                            distToLiqPercent = ((markPrice - liqPrice) / markPrice) * 100;
                        } else {
                            distToLiqPercent = ((liqPrice - markPrice) / markPrice) * 100;
                        }
                    }

                    // ROE
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
                syncSource: "manual",
            };

            await admin.firestore()
                .collection('settings')
                .doc('futuresData')
                .set(futuresData);

            console.log(`[SyncFutures] Sincronización completada. Posiciones: ${positions.length}`);

            return {
                success: true,
                data: futuresData,
                message: `Sincronizados ${positions.length} posiciones`
            };
        } catch (error: any) {
            console.error("[SyncFutures] Error:", error.message);
            throw new functions.https.HttpsError(
                'internal',
                error.message || 'Error al sincronizar con Binance'
            );
        }
    });
