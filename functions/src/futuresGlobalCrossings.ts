// ─── Global PNL crossings (pure, no Firestore / Telegram) ─────────────────────
//
// Detects when the futures global PNL crosses a $ level in EITHER direction.
// Hysteresis: after a crossing, the opposite crossing of the same level only
// fires once the PNL moves at least `margin` dollars beyond that level, so an
// oscillation around a level does not spam notifications.

export type CrossDirection = "up" | "down";

export interface LevelState {
    side: "above" | "below";
    notified: boolean;
}

export interface LevelCrossing {
    level: number;
    dir: CrossDirection;
}

export interface GlobalCrossingsResult {
    crossings: LevelCrossing[];
    newState: Record<string, LevelState>;
}

export const DEFAULT_CROSSING_MARGIN = 200;

export function evaluateGlobalCrossings(
    levels: number[],
    state: Record<string, LevelState>,
    pnl: number,
    margin: number = DEFAULT_CROSSING_MARGIN
): GlobalCrossingsResult {
    const previous: Record<string, LevelState> = state || {};
    const newState: Record<string, LevelState> = {};
    const crossings: LevelCrossing[] = [];
    const seen = new Set<string>();

    for (const level of levels) {
        if (!Number.isFinite(level)) continue;
        const key = String(level);
        if (seen.has(key)) continue;
        seen.add(key);

        const prev = previous[key];

        // No usable state yet → initialize from the current PNL, never notify.
        if (!prev || (prev.side !== "above" && prev.side !== "below")) {
            newState[key] = { side: pnl >= level ? "above" : "below", notified: false };
            continue;
        }

        const m = prev.notified ? margin : 0;

        if (prev.side === "below" && pnl >= level + m) {
            crossings.push({ level, dir: "up" });
            newState[key] = { side: "above", notified: true };
        } else if (prev.side === "above" && pnl <= level - m) {
            crossings.push({ level, dir: "down" });
            newState[key] = { side: "below", notified: true };
        } else {
            newState[key] = { side: prev.side, notified: prev.notified };
        }
    }

    // Keys for levels that no longer exist are dropped (newState only has current levels).
    return { crossings, newState };
}
