import { useState, useEffect, useCallback } from "react";
import { db, collection, addDoc, deleteDoc, updateDoc, doc, onSnapshot, query } from "../lib/firebase";
import type { SaleRecord } from "../lib/constants";

export function useSales() {
    const [sales, setSales] = useState<SaleRecord[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onSnapshot(
            query(collection(db, "ventas")),
            (snap) => {
                setSales(
                    snap.docs.map((d) => {
                        const data = d.data();
                        return {
                            id: d.id,
                            coin: data.coin ?? "",
                            quantity: Number(data.quantity) || 0,
                            sellPrice: Number(data.sellPrice) || 0,
                            usdtReceived: Number(data.usdtReceived) || 0,
                            date: Number(data.date) || 0,
                        };
                    })
                );
                setLoading(false);
            },
            (err) => {
                console.error("Error listening to ventas:", err);
                setLoading(false);
            }
        );
        return () => unsubscribe();
    }, []);

    const addSale = useCallback(
        async (coin: string, quantity: number, sellPrice: number, usdtReceived: number) => {
            await addDoc(collection(db, "ventas"), {
                coin,
                quantity,
                sellPrice,
                usdtReceived,
                date: Date.now(),
            });
        },
        []
    );

    const deleteSale = useCallback(async (id: string) => {
        await deleteDoc(doc(db, "ventas", id));
    }, []);

    const updateSale = useCallback(
        async (id: string, coin: string, quantity: number, sellPrice: number, usdtReceived: number) => {
            await updateDoc(doc(db, "ventas", id), { coin, quantity, sellPrice, usdtReceived });
        },
        []
    );

    return { sales, addSale, deleteSale, updateSale, loading } as const;
}
