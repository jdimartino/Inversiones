// NOTE: `@types/jest` is not installed in this project, so the Jest globals are
// imported explicitly to keep `npm run build` type-checking clean.
import { describe, expect, it } from "@jest/globals";
import {
    FUTURES_HYSTERESIS,
    SPOT_HYSTERESIS,
    getLevelDisplay,
    levelStateKey,
} from "./alertLevelDisplay";

describe("alertLevelDisplay constants", () => {
    it("mirrors the backend hysteresis margins", () => {
        // functions/src/futuresGlobalCrossings.ts — DEFAULT_CROSSING_MARGIN
        expect(FUTURES_HYSTERESIS).toBe(200);
        // functions/src/index.ts — SPOT_CROSSING_MARGIN
        expect(SPOT_HYSTERESIS).toBe(500);
    });
});

describe("levelStateKey", () => {
    it("uses the same key format as the Cloud Functions (String(targetAmount))", () => {
        expect(levelStateKey(1000)).toBe("1000");
        expect(levelStateKey(-2500)).toBe("-2500");
        expect(levelStateKey(1000.5)).toBe("1000.5");
        expect(levelStateKey(0)).toBe("0");
    });
});

describe("getLevelDisplay — arrow from the stored side", () => {
    it("shows ▼ when the PNL is above the level", () => {
        const display = getLevelDisplay({
            targetAmount: 1000,
            pnl: 1500,
            levelState: { side: "above", notified: false },
            margin: FUTURES_HYSTERESIS,
        });
        expect(display.arrow).toBe("▼");
    });

    it("shows ▲ when the PNL is below the level", () => {
        const display = getLevelDisplay({
            targetAmount: 1000,
            pnl: 500,
            levelState: { side: "below", notified: false },
            margin: FUTURES_HYSTERESIS,
        });
        expect(display.arrow).toBe("▲");
    });

    it("ignores the live PNL for the arrow once the side is stored", () => {
        // Stored side wins even if the live PNL would suggest the opposite crossing.
        const display = getLevelDisplay({
            targetAmount: 1000,
            pnl: 5000,
            levelState: { side: "below", notified: false },
            margin: FUTURES_HYSTERESIS,
        });
        expect(display.arrow).toBe("▲");
    });
});

describe("getLevelDisplay — Armada / Pausa badge", () => {
    it("is Pausa when the level already notified and the PNL is inside the margin", () => {
        const display = getLevelDisplay({
            targetAmount: 1000,
            pnl: 1100,
            levelState: { side: "above", notified: true },
            margin: FUTURES_HYSTERESIS,
        });
        expect(display.status).toBe("paused");
    });

    it("is Pausa just inside the margin boundary", () => {
        const display = getLevelDisplay({
            targetAmount: 1000,
            pnl: 1199.99,
            levelState: { side: "above", notified: true },
            margin: FUTURES_HYSTERESIS,
        });
        expect(display.status).toBe("paused");
    });

    it("is Armada exactly at the margin boundary", () => {
        const display = getLevelDisplay({
            targetAmount: 1000,
            pnl: 1200,
            levelState: { side: "above", notified: true },
            margin: FUTURES_HYSTERESIS,
        });
        expect(display.status).toBe("armed");
    });

    it("is Armada outside the margin", () => {
        const display = getLevelDisplay({
            targetAmount: 1000,
            pnl: 1000 + FUTURES_HYSTERESIS + 1,
            levelState: { side: "above", notified: true },
            margin: FUTURES_HYSTERESIS,
        });
        expect(display.status).toBe("armed");
    });

    it("is Pausa below a level that notified downwards", () => {
        const display = getLevelDisplay({
            targetAmount: -2000,
            pnl: -2400,
            levelState: { side: "below", notified: true },
            margin: SPOT_HYSTERESIS,
        });
        expect(display.status).toBe("paused");
        expect(display.arrow).toBe("▲");
    });

    it("is Armada when notified is false even inside the margin", () => {
        const display = getLevelDisplay({
            targetAmount: 1000,
            pnl: 1000,
            levelState: { side: "above", notified: false },
            margin: FUTURES_HYSTERESIS,
        });
        expect(display.status).toBe("armed");
        expect(display.arrow).toBe("▼");
    });
});

describe("getLevelDisplay — missing entry fallback", () => {
    it("infers side 'above' (▼) and assumes notified=false when PNL is at/over the level", () => {
        const display = getLevelDisplay({
            targetAmount: 1000,
            pnl: 1000,
            levelState: undefined,
            margin: FUTURES_HYSTERESIS,
        });
        expect(display.arrow).toBe("▼");
        expect(display.status).toBe("armed");
    });

    it("infers side 'below' (▲) when PNL is under the level", () => {
        const display = getLevelDisplay({
            targetAmount: 1000,
            pnl: 999.99,
            levelState: null,
            margin: FUTURES_HYSTERESIS,
        });
        expect(display.arrow).toBe("▲");
        expect(display.status).toBe("armed");
    });

    it("handles negative target amounts", () => {
        // PNL above a negative target → next crossing is downwards.
        const above = getLevelDisplay({
            targetAmount: -1000,
            pnl: -500,
            levelState: undefined,
            margin: FUTURES_HYSTERESIS,
        });
        expect(above.arrow).toBe("▼");

        // PNL below a negative target → next crossing is upwards.
        const below = getLevelDisplay({
            targetAmount: -1000,
            pnl: -1500,
            levelState: undefined,
            margin: FUTURES_HYSTERESIS,
        });
        expect(below.arrow).toBe("▲");

        // Notified inside the band around a negative target → Pausa.
        const paused = getLevelDisplay({
            targetAmount: -1000,
            pnl: -1100,
            levelState: { side: "below", notified: true },
            margin: FUTURES_HYSTERESIS,
        });
        expect(paused.status).toBe("paused");
    });

    it("ignores a corrupted stored side and falls back to the PNL", () => {
        const display = getLevelDisplay({
            targetAmount: 1000,
            pnl: 1100,
            levelState: { side: "sideways" as unknown as "above", notified: true },
            margin: FUTURES_HYSTERESIS,
        });
        expect(display.arrow).toBe("▼");
        // notified is still honoured when inside the band
        expect(display.status).toBe("paused");
    });

    it("degrades safely with a non-finite PNL", () => {
        const display = getLevelDisplay({
            targetAmount: 1000,
            pnl: NaN,
            levelState: undefined,
            margin: FUTURES_HYSTERESIS,
        });
        expect(display.arrow).toBe("▲");
        expect(display.status).toBe("armed");
    });
});
