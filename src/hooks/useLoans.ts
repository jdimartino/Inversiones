import { useState, useEffect } from "react";
import { db, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query } from "../lib/firebase";
import { Loan } from "../lib/constants";

export function useLoans() {
    const [loans, setLoans] = useState<Loan[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const unsubscribe = onSnapshot(
            query(collection(db, "prestamos")),
            (snap) => {
                setLoans(
                    snap.docs.map((d) => {
                        const data = d.data();
                        return {
                            id: d.id,
                            exchange: data.exchange ?? "Binance",
                            collateralCoin: data.collateralCoin ?? "BTC",
                            collateralQty: data.collateralQty ?? 0,
                            borrowedUSDT: data.borrowedUSDT ?? 0,
                            apy: data.apy ?? 0,
                            date: data.date ?? 0,
                        } as Loan;
                    })
                );
                setError(null);
            },
            (err) => {
                console.error("Error listening to prestamos:", err);
                setError("Error cargando préstamos");
            }
        );

        return () => unsubscribe();
    }, []);

    const addLoan = async (
        exchange: string,
        collateralCoin: string,
        collateralQty: number,
        borrowedUSDT: number,
        apy: number
    ) => {
        await addDoc(collection(db, "prestamos"), {
            exchange,
            collateralCoin,
            collateralQty,
            borrowedUSDT,
            apy,
            date: Date.now(),
        });
    };

    const updateLoan = async (
        id: string,
        updates: { collateralQty: number; borrowedUSDT: number; apy: number }
    ) => {
        await updateDoc(doc(db, "prestamos", id), updates);
    };

    const removeLoan = async (id: string) => {
        try {
            await deleteDoc(doc(db, "prestamos", id));
        } catch (e) {
            console.error("Error deleting loan:", e);
        }
    };

    return { loans, error, addLoan, updateLoan, removeLoan };
}
