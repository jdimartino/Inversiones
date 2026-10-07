// NOTE: `@types/jest` is not installed in this project, so the Jest globals are
// imported explicitly to keep `npm run build` type-checking clean.
import { describe, expect, it } from "@jest/globals";
import { formatPnl, formatPnlSigned } from "./futures";

// Regression: the returned string used to drop the minus sign of negative values
// (`Math.abs()` plus an empty sign), so -29798.50 rendered as "$29798.50".

describe("formatPnl", () => {
    it("keeps the '+' sign for positive values", () => {
        expect(formatPnl(29798.5)).toBe("+$29798.50");
        expect(formatPnl(0.004)).toBe("+$0.00");
        expect(formatPnl(123.456)).toBe("+$123.46");
    });

    it("keeps the minus sign for negative values", () => {
        expect(formatPnl(-29798.5)).toBe("-$29798.50");
        expect(formatPnl(-123.456)).toBe("-$123.46");
    });

    it("formats zero with the '+' sign", () => {
        expect(formatPnl(0)).toBe("+$0.00");
    });

    it("never renders '-$0.00' for a value that rounds to 0.00", () => {
        expect(formatPnl(-0.004)).toBe("+$0.00");
        expect(formatPnl(-0.001)).toBe("+$0.00");
    });

    it("falls back to '+$0.00' for non-finite values", () => {
        expect(formatPnl(NaN)).toBe("+$0.00");
        expect(formatPnl(Infinity)).toBe("+$0.00");
        expect(formatPnl(-Infinity)).toBe("+$0.00");
    });
});

describe("formatPnlSigned", () => {
    it("keeps the '+' sign for positive values", () => {
        expect(formatPnlSigned(29798.5)).toBe("+$29798.50");
        expect(formatPnlSigned(123.456)).toBe("+$123.46");
    });

    it("keeps the minus sign for negative values", () => {
        expect(formatPnlSigned(-29798.5)).toBe("-$29798.50");
        expect(formatPnlSigned(-123.456)).toBe("-$123.46");
    });

    it("formats zero with the '+' sign", () => {
        expect(formatPnlSigned(0)).toBe("+$0.00");
    });

    it("never renders '-$0.00' for a value that rounds to 0.00", () => {
        expect(formatPnlSigned(-0.004)).toBe("+$0.00");
        expect(formatPnlSigned(-0.001)).toBe("+$0.00");
    });

    it("keeps its own non-finite fallback (no '+')", () => {
        expect(formatPnlSigned(NaN)).toBe("$0.00");
        expect(formatPnlSigned(Infinity)).toBe("$0.00");
        expect(formatPnlSigned(-Infinity)).toBe("$0.00");
    });
});
