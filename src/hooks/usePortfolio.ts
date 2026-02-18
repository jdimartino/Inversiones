import { useState, useEffect, useCallback } from "react";
import { db, collection, addDoc, deleteDoc, doc, onSnapshot, query } from "../lib/firebase";
import type { Investment } from "../lib/constants";

export function usePortfolio() {
    const [portfolio, setPortfolio] = useState<Investment[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const unsubscribe = onSnapshot(
            query(collection(db, "inversiones")),
            (snap) => {
                setPortfolio(
                    snap.docs.map((d) => {
                        const data = d.data();
                        return {
                            id: d.id,
                            coin: data.coin ?? "",
                            buyPrice: Number(data.buyPrice) || 0,
                            quantity: Number(data.quantity) || 0,
                            invested: Number(data.invested) || 0,
                            date: Number(data.date) || 0,
                        };
                    })
                );
                setError(null);
            },
            (err) => {
                console.error("Error listening to inversiones:", err);
                setError("Error cargando inversiones");
            }
        );

        return () => unsubscribe();
    }, []);

    const addInvestment = useCallback(
        async (coin: string, buyPrice: number, quantity: number) => {
            await addDoc(collection(db, "inversiones"), {
                coin,
                buyPrice,
                quantity,
                invested: buyPrice * quantity,
                date: Date.now(),
            });
        },
        []
    );

    const removeInvestment = useCallback(async (id: string) => {
        try {
            await deleteDoc(doc(db, "inversiones", id));
        } catch (e) {
            console.error("Error deleting investment:", e);
        }
    }, []);

    return { portfolio, error, addInvestment, removeInvestment } as const;
}
