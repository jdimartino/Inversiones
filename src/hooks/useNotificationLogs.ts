import { useState, useEffect } from "react";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";

export interface NotificationLog {
    id: string;
    sentAt: Date | null;
    globalAlertTriggered: boolean;
    globalPNL: number;
    triggeredAssets: string[];
    triggeredWatchlistAlerts: string[];
    totalInvested: number;
    totalCurrentValue: number;
}

export function useNotificationLogs(maxEntries = 20) {
    const [logs, setLogs] = useState<NotificationLog[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const q = query(
            collection(db, "notificationLogs"),
            orderBy("sentAt", "desc"),
            limit(maxEntries)
        );

        const unsub = onSnapshot(q, (snap) => {
            const entries: NotificationLog[] = snap.docs.map((doc) => {
                const d = doc.data();
                return {
                    id: doc.id,
                    sentAt: d.sentAt?.toDate() ?? null,
                    globalAlertTriggered: d.globalAlertTriggered ?? false,
                    globalPNL: d.globalPNL ?? 0,
                    triggeredAssets: d.triggeredAssets ?? [],
                    triggeredWatchlistAlerts: d.triggeredWatchlistAlerts ?? [],
                    totalInvested: d.totalInvested ?? 0,
                    totalCurrentValue: d.totalCurrentValue ?? 0,
                };
            });
            setLogs(entries);
            setLoading(false);
        });

        return () => unsub();
    }, [maxEntries]);

    return { logs, loading };
}
