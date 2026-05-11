import { useState, useEffect, useCallback } from "react";
import { db, collection, doc, setDoc, onSnapshot, query } from "../lib/firebase";
import type { PnlSnapshot } from "../lib/constants";

export function usePortfolioSnapshots() {
    const [snapshots, setSnapshots] = useState<PnlSnapshot[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onSnapshot(
            query(collection(db, "pnlSnapshots")),
            (snap) => {
                const docs = snap.docs.map((d) => {
                    const data = d.data();
                    return {
                        date: d.id,
                        timestamp: Number(data.timestamp) || 0,
                        portfolioInvested: Number(data.portfolioInvested) || 0,
                        portfolioValue: Number(data.portfolioValue) || 0,
                        portfolioPnl: Number(data.portfolioPnl) || 0,
                        portfolioRoi: Number(data.portfolioRoi) || 0,
                        salesReceived: Number(data.salesReceived) || 0,
                        salesCost: Number(data.salesCost) || 0,
                        salesPnl: Number(data.salesPnl) || 0,
                        salesRoi: Number(data.salesRoi) || 0,
                    } as PnlSnapshot;
                });
                setSnapshots(docs.sort((a, b) => a.date.localeCompare(b.date)));
                setLoading(false);
            },
            (err) => {
                console.error("Error listening to pnlSnapshots:", err);
                setLoading(false);
            }
        );
        return () => unsubscribe();
    }, []);

    const saveSnapshot = useCallback(async (snap: PnlSnapshot) => {
        await setDoc(doc(db, "pnlSnapshots", snap.date), snap);
    }, []);

    return { snapshots, saveSnapshot, loading } as const;
}
