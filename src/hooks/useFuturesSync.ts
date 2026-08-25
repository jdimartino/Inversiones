import { useCallback, useEffect, useRef } from "react";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import { fetchBinanceFutures } from "../lib/binanceFutures";
import { safeNum } from "../lib/futures";

interface SyncFuturesResult {
    success: boolean;
    data?: any;
    message?: string;
}

export function useFuturesSync() {
    const syncRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const isMountedRef = useRef(false);
    const isSyncingRef = useRef(false);

    const syncFutures = useCallback(async (): Promise<SyncFuturesResult> => {
        // Prevent concurrent syncs
        if (isSyncingRef.current) {
            return { success: false, message: "Sync already in progress" };
        }
        isSyncingRef.current = true;

        try {
            const [accountRes, positionRes] = await Promise.all([
                fetchBinanceFutures("/fapi/v3/account", {}),
                fetchBinanceFutures("/fapi/v2/positionRisk", { current: "true" }),
            ]);

            // Build position risk map keyed by symbol+positionSide (handles hedge mode)
            const positionMap = new Map<string, any>();
            for (const p of positionRes) {
                if (safeNum(p.positionAmt) !== 0) {
                    const posSide = p.positionSide || "BOTH";
                    positionMap.set(`${p.symbol}-${posSide}`, p);
                }
            }

            const positions: any[] = (accountRes.positions || [])
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

            const futuresData = {
                account,
                positions,
                lastSync: Date.now(),
                syncSource: "browser",
            };

            const db = getFirestore();
            await setDoc(doc(db, "settings", "futuresData"), futuresData);

            return {
                success: true,
                data: futuresData,
                message: `Sincronizados ${positions.length} posiciones`
            };
        } catch (error: any) {
            console.error("[useFuturesSync] Error:", error?.message, error?.code);
            throw error;
        } finally {
            isSyncingRef.current = false;
        }
    }, []);

    // Clean up intervals on unmount
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

    // Auto-refresh every 5 minutes
    useEffect(() => {
        if (!isMountedRef.current) return;

        syncRef.current = setInterval(async () => {
            if (isSyncingRef.current) return; // skip if already syncing
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
