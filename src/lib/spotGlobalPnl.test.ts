// NOTE: `@types/jest` is not installed in this project, so the Jest globals are
// imported explicitly to keep `npm run build` type-checking clean.
import { describe, expect, it } from "@jest/globals";
import {
    CF_UNPRICED_COIN_SUFFIX,
    computeSpotGlobalPnl,
    isPricedByCloudFunction,
} from "./spotGlobalPnl";

describe("isPricedByCloudFunction", () => {
    it("mirrors UNPRICEABLE_COIN_SUFFIX in functions/src/index.ts", () => {
        expect(CF_UNPRICED_COIN_SUFFIX).toBe("EUR");
    });

    it("prices usdt-quoted coins and not EUR-quoted ones", () => {
        expect(isPricedByCloudFunction("BTC")).toBe(true);
        expect(isPricedByCloudFunction("SUI")).toBe(true);
        expect(isPricedByCloudFunction("ADAEUR")).toBe(false);
        expect(isPricedByCloudFunction("DOGEEUR")).toBe(false);
    });
});

describe("computeSpotGlobalPnl", () => {
    it("adds price × quantity − invested over every position", () => {
        const pnl = computeSpotGlobalPnl(
            [
                { coin: "BTC", quantity: 0.5, invested: 10000 },
                { coin: "SUI", quantity: 100, invested: 1000 },
            ],
            { BTC: 40000, SUI: 1.5 },
        );
        expect(pnl).toBe(0.5 * 40000 - 10000 + 100 * 1.5 - 1000);
    });

    it("values a coin at 0 when it has no price (same as the Cloud Function)", () => {
        const pnl = computeSpotGlobalPnl(
            [{ coin: "OP", quantity: 10, invested: 500 }],
            {},
        );
        expect(pnl).toBe(-500);
    });

    it("ignores the frontend price of EUR-quoted coins (Cloud Function cannot price them)", () => {
        const withEur = computeSpotGlobalPnl(
            [{ coin: "ADAEUR", quantity: 1000, invested: 200 }],
            { ADAEUR: 0.2265 },
        );
        expect(withEur).toBe(-200);
    });

    it("aggregates several positions of the same coin", () => {
        const pnl = computeSpotGlobalPnl(
            [
                { coin: "ADA", quantity: 100, invested: 30 },
                { coin: "ADA", quantity: 50, invested: 20 },
            ],
            { ADA: 0.25 },
        );
        expect(pnl).toBe(150 * 0.25 - 50);
    });

    it("returns 0 for an empty portfolio", () => {
        expect(computeSpotGlobalPnl([], { BTC: 40000 })).toBe(0);
    });

    it("handles negative targets/PNL (downward crossings)", () => {
        const pnl = computeSpotGlobalPnl(
            [{ coin: "BTC", quantity: 0.1, invested: 10000 }],
            { BTC: 30000 },
        );
        expect(pnl).toBe(-7000);
    });
});
