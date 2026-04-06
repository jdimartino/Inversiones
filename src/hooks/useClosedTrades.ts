import { useState, useEffect, useCallback } from "react";
import { db, collection, addDoc, onSnapshot, query } from "../lib/firebase";
import type { ClosedTrade } from "../lib/constants";

export function useClosedTrades() {
    const [closedTrades, setClosedTrades] = useState<ClosedTrade[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onSnapshot(
            query(collection(db, "operacionesCerradas")),
            (snap) => {
                setClosedTrades(
                    snap.docs.map((d) => {
                        const data = d.data();
                        return {
                            id: d.id,
                            coin: data.coin ?? "",
                            quantity: Number(data.quantity) || 0,
                            buyPrice: Number(data.buyPrice) || 0,
                            sellPrice: Number(data.sellPrice) || 0,
                            invested: Number(data.invested) || 0,
                            soldValue: Number(data.soldValue) || 0,
                            pnl: Number(data.pnl) || 0,
                            pnlPercent: Number(data.pnlPercent) || 0,
                            buyDate: Number(data.buyDate) || 0,
                            sellDate: Number(data.sellDate) || 0,
                        };
                    })
                );
                setLoading(false);
            },
            (err) => {
                console.error("Error listening to operacionesCerradas:", err);
                setLoading(false);
            }
        );
        return () => unsubscribe();
    }, []);

    const addClosedTrade = useCallback(async (trade: Omit<ClosedTrade, "id">) => {
        await addDoc(collection(db, "operacionesCerradas"), trade);
    }, []);

    return { closedTrades, addClosedTrade, loading } as const;
}
