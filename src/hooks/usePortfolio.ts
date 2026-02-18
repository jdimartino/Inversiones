import { useState, useEffect } from "react";
import { db, collection, addDoc, deleteDoc, doc, onSnapshot, query } from "../lib/firebase";
import { Investment } from "../lib/constants";

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
                            buyPrice: data.buyPrice ?? 0,
                            quantity: data.quantity ?? 0,
                            invested: data.invested ?? 0,
                            date: data.date ?? 0,
                        } as Investment;
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

    const addInvestment = async (coin: string, buyPrice: number, quantity: number) => {
        await addDoc(collection(db, "inversiones"), {
            coin,
            buyPrice,
            quantity,
            invested: buyPrice * quantity,
            date: Date.now(),
        });
    };

    const removeInvestment = async (id: string) => {
        try {
            await deleteDoc(doc(db, "inversiones", id));
        } catch (e) {
            console.error("Error deleting investment:", e);
        }
    };

    return { portfolio, error, addInvestment, removeInvestment };
}
