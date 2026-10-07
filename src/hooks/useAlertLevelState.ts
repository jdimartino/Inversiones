import { useEffect, useState } from "react";
import { db, doc, onSnapshot } from "../lib/firebase";
import type { AlertLevelState } from "../lib/alertLevelDisplay";

// ─── Backend-owned PNL Global alert state ─────────────────────────────────────
//
// The Cloud Functions write the real crossing state of every global PNL level to:
//   • futuresAlertState/global  (functions/src/futuresSync.ts)
//   • spotAlertState/global     (functions/src/index.ts)
//
// The frontend only reads it. Reads are allowed by the current security rules and
// nothing here ever writes to those documents.

export type AlertLevelKind = "futures" | "spot";

/** Collection holding the state document of each alert family. */
const STATE_COLLECTIONS: Record<AlertLevelKind, string> = {
    futures: "futuresAlertState",
    spot: "spotAlertState",
};

const STATE_DOC_ID = "global";

export interface AlertLevelStateResult {
    /** `{ "<targetAmount>": { side, notified } }` — empty when the document does not exist yet. */
    levels: Record<string, AlertLevelState>;
    /** Last PNL the Cloud Function used, or null when unknown. */
    lastPnl: number | null;
    loading: boolean;
}

function normalizeLevels(raw: unknown): Record<string, AlertLevelState> {
    if (!raw || typeof raw !== "object") return {};
    const levels: Record<string, AlertLevelState> = {};
    for (const [key, value] of Object.entries(raw as Record<string, any>)) {
        const side = value?.side;
        if (side !== "above" && side !== "below") continue;
        levels[key] = { side, notified: value?.notified === true };
    }
    return levels;
}

/**
 * Subscribes to the backend state of one alert family ("futures" | "spot").
 * Returns empty `levels` while the document is missing, and unsubscribes on unmount.
 */
export function useAlertLevelState(kind: AlertLevelKind): AlertLevelStateResult {
    const [state, setState] = useState<AlertLevelStateResult>({
        levels: {},
        lastPnl: null,
        loading: true,
    });

    useEffect(() => {
        setState((prev) => ({ ...prev, loading: true }));

        const ref = doc(db, STATE_COLLECTIONS[kind], STATE_DOC_ID);
        const unsubscribe = onSnapshot(
            ref,
            (snap) => {
                // Missing document (backend has not run yet): no levels to show.
                if (!snap.exists()) {
                    setState({ levels: {}, lastPnl: null, loading: false });
                    return;
                }
                const data = (snap.data() || {}) as { levels?: unknown; lastPnl?: unknown };
                setState({
                    levels: normalizeLevels(data.levels),
                    lastPnl:
                        typeof data.lastPnl === "number" && Number.isFinite(data.lastPnl)
                            ? data.lastPnl
                            : null,
                    loading: false,
                });
            },
            (error) => {
                console.error(
                    `[useAlertLevelState] Error listening to ${STATE_COLLECTIONS[kind]}/${STATE_DOC_ID}:`,
                    error,
                );
                // Keep whatever was already loaded and stop the loading state.
                setState((prev) => ({ ...prev, loading: false }));
            },
        );

        return () => unsubscribe();
    }, [kind]);

    return state;
}
