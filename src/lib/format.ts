const fmtNumber = new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 });
const fmtCurrency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const fmtCurrency4 = new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 4,
});

const fmtEur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const fmtEur4 = new Intl.NumberFormat("es-ES", {
    style: "currency", currency: "EUR", minimumFractionDigits: 4, maximumFractionDigits: 4,
});

/** Format a number with up to 6 decimal places */
export const fmt = (n: number): string => fmtNumber.format(n);

/** Format a number as currency (USD default, EUR if specified) */
export const fmtUSD = (n: number, isEur?: boolean): string => (isEur ? fmtEur : fmtCurrency).format(n);

/** Format a price: 4 decimals if < 1, 2 decimals otherwise */
export const fmtPrice = (n: number, isEur?: boolean): string => {
    if (isEur) return Math.abs(n) < 1 ? fmtEur4.format(n) : fmtEur.format(n);
    return Math.abs(n) < 1 ? fmtCurrency4.format(n) : fmtCurrency.format(n);
};

/** Format a signed percentage (e.g. "+15.2%" / "-23.1%") */
export const fmtPercent = (n: number, decimals: number = 1): string => {
    const sign = n >= 0 ? "+" : "";
    return `${sign}${n.toFixed(decimals)}%`;
};

/** Compact currency format: "$1.2K" / "€3.4M" */
export const fmtCompact = (n: number, isEur?: boolean): string => {
    const symbol = isEur ? "€" : "$";
    if (Math.abs(n) >= 1_000_000) return `${symbol}${(n / 1_000_000).toFixed(1)}M`;
    if (Math.abs(n) >= 1_000) return `${symbol}${(n / 1_000).toFixed(1)}K`;
    return fmtUSD(n, isEur);
};
