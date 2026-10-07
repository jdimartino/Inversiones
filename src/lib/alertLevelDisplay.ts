// ─── PNL Global alert level display (pure, no React / Firebase) ───────────────
//
// The Cloud Functions now own the global PNL crossing state, with hysteresis and
// notifications in BOTH directions:
//   • Futures: functions/src/futuresSync.ts  + functions/src/futuresGlobalCrossings.ts
//   • Spot:    functions/src/index.ts
//
// State document shape (futuresAlertState/global, spotAlertState/global):
//   { levels: { "<targetAmount>": { side: "above" | "below", notified: boolean } }, lastPnl }
//
// This module only turns that stored state into what the panel renders: the arrow
// of the next possible crossing and the Armada/Pausa badge. It never computes the
// crossing itself.

/** Hysteresis margin for Futures levels — mirrors DEFAULT_CROSSING_MARGIN in functions/src/futuresGlobalCrossings.ts. */
export const FUTURES_HYSTERESIS = 200;

/** Hysteresis margin for Spot levels — mirrors SPOT_CROSSING_MARGIN in functions/src/index.ts. */
export const SPOT_HYSTERESIS = 500;

export interface AlertLevelState {
    side: "above" | "below";
    notified: boolean;
}

export type AlertLevelStatus = "armed" | "paused";

export interface AlertLevelDisplay {
    /** Arrow of the next possible crossing: ▼ when the PNL is above the level, ▲ when it is below. */
    arrow: "▲" | "▼";
    status: AlertLevelStatus;
}

export interface GetLevelDisplayParams {
    targetAmount: number;
    /** Live PNL, in the SAME units and from the SAME source the Cloud Function uses. */
    pnl: number;
    /** Stored entry for this level, or undefined when the backend has not processed it yet. */
    levelState?: AlertLevelState | null;
    /** Hysteresis margin of this alert family (see FUTURES_HYSTERESIS / SPOT_HYSTERESIS). */
    margin: number;
}

/**
 * Key used inside `levels` by the Cloud Functions: `String(targetAmount)`
 * (e.g. 1000 → "1000", -2500 → "-2500", 1000.5 → "1000.5").
 * Kept here so the frontend lookup can never drift from the backend writer.
 */
export function levelStateKey(targetAmount: number): string {
    return String(targetAmount);
}

/**
 * Resolves the arrow and the Armada/Pausa badge for one PNL level from the state
 * stored by the backend.
 *
 * Arrow: `side === "above"` means the PNL is above the level, so the only pending
 * crossing is downwards (▼); `side === "below"` means the next crossing is upwards (▲).
 *
 * Badge: "Pausa" only while the level has already notified and the PNL is still
 * inside the hysteresis band (`|pnl - targetAmount| < margin`), because the opposite
 * crossing is not armed yet. Outside the band the level is "Armada" again.
 *
 * Missing entry (new level the backend has not processed yet): treated as
 * `notified: false` and the side is inferred from the current PNL, mirroring how the
 * Cloud Function initializes a level.
 */
export function getLevelDisplay({
    targetAmount,
    pnl,
    levelState,
    margin,
}: GetLevelDisplayParams): AlertLevelDisplay {
    // Non-finite PNL cannot drive any comparison: degrade to a neutral "below"
    // side (▲, armed) instead of propagating NaN into the hysteresis check.
    const safePnl = Number.isFinite(pnl) ? pnl : 0;
    const safeMargin = Number.isFinite(margin) ? Math.abs(margin) : 0;

    const storedSide = levelState?.side;
    const hasStoredSide = storedSide === "above" || storedSide === "below";
    const side: "above" | "below" = hasStoredSide
        ? (storedSide as "above" | "below")
        : safePnl >= targetAmount
          ? "above"
          : "below";
    const notified = levelState?.notified === true;

    const arrow: "▲" | "▼" = side === "above" ? "▼" : "▲";
    const paused = notified && Math.abs(safePnl - targetAmount) < safeMargin;

    return { arrow, status: paused ? "paused" : "armed" };
}
