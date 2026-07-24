import { useCallback, useEffect, useRef } from "react";
import { getAuth } from "firebase/auth";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import { fetchBinanceFutures } from "../lib/binanceFutures";

interface SyncFuturesResult {
    success: boolean;
    data?: any;
    message?: string;
}

export function useFuturesSync() {
    const syncRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const isMountedRef = useRef(false);

    const syncFutures = useCallback(async (): Promise<SyncFuturesResult> => {
        console.log("[useFuturesSync] syncFutures called");
        const auth = getAuth();
        const user = auth.currentUser;

        if (!user) {
            console.error("[useFuturesSync] No user authenticated");
            throw new Error("Usuario no autenticado");
        }
        console.log("[useFuturesSync] User authenticated:", user.uid);

        try {
            console.log("[useFuturesSync] Step 1: Fetching account + positions from Binance...");
            const [accountRes, positionRes] = await Promise.all([
                fetchBinanceFutures("/fapi/v3/account", {}),
                fetchBinanceFutures("/fapi/v2/positionRisk", {}),
            ]);

            console.log("[useFuturesSync] Step 2: Raw data received", {
                accountKeys: accountRes ? Object.keys(accountRes).slice(0, 10) : null,
                positionsCount: Array.isArray(positionRes) ? positionRes.length : "not array",
                allPositionsCount: accountRes?.positions?.length,
            });

            const positionMap = new Map<string, any>();
            for (const p of positionRes) {
                if (parseFloat(p.positionAmt) !== 0) {
                    positionMap.set(p.symbol, p);
                }
            }
            console.log("[useFuturesSync] Step 3: Active positions from positionRisk:", positionMap.size);

            const positions: any[] = (accountRes.positions || [])
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

            console.log("[useFuturesSync] Step 4: Processed positions:", positions.length);

            const account = {
                totalWalletBalance: parseFloat(accountRes.totalWalletBalance),
                totalUnrealizedProfit: parseFloat(accountRes.totalUnrealizedProfit),
                totalMarginBalance: parseFloat(accountRes.totalMarginBalance),
                totalInitialMargin: parseFloat(accountRes.totalInitialMargin),
                totalMaintMargin: parseFloat(accountRes.totalMaintMargin),
                availableBalance: parseFloat(accountRes.availableBalance),
                maxWithdrawAmount: parseFloat(accountRes.maxWithdrawAmount),
                marginRatio: parseFloat(accountRes.totalMaintMargin) > 0 && parseFloat(accountRes.totalMarginBalance) > 0
                    ? (parseFloat(accountRes.totalMaintMargin) / parseFloat(accountRes.totalMarginBalance)) * 100
                    : 0,
            };
            console.log("[useFuturesSync] Step 5: Account processed. Balance:", account.totalWalletBalance);

            const futuresData = {
                account,
                positions,
                lastSync: Date.now(),
                syncSource: "browser",
            };

            console.log("[useFuturesSync] Step 6: Saving to Firestore...");
            const db = getFirestore();
            await setDoc(doc(db, "settings", "futuresData"), futuresData);

            console.log("[useFuturesSync] Step 7: DONE! Positions saved:", positions.length);

            return {
                success: true,
                data: futuresData,
                message: `Sincronizados ${positions.length} posiciones`
            };
        } catch (error: any) {
            console.error("[useFuturesSync] Error at step:", error?.message, error?.code, error);
            throw error;
        }
    }, []);

    // Limpiar intervalos cuando el componente se desmonta
    useEffect(() => {
        isMountedRef.current = true;

        return () => {
            isMountedRef.current = false;
            if (syncRef.current) {
                clearInterval(syncRef.current);
                syncRef.current = null;
            }
        };
    }, []);

    // Iniciar refresco automático cada 5 minutos
    useEffect(() => {
        if (!isMountedRef.current) return;

        syncRef.current = setInterval(async () => {
            try {
                await syncFutures();
            } catch (error) {
                console.error("[useFuturesSync] Error en refresco automático:", error);
            }
        }, 5 * 60 * 1000);

        return () => {
            if (syncRef.current) {
                clearInterval(syncRef.current);
            }
        };
    }, [syncFutures]);

    return { syncFutures };
}
