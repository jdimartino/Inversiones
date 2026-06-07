const fmtNumber = new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 });
const fmtCurrency = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
});

const fmtCurrency4 = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
});

/** Format a number with up to 6 decimal places */
export const fmt = (n: number): string => fmtNumber.format(n);

/** Format a number as USD currency */
export const fmtUSD = (n: number): string => fmtCurrency.format(n);

/** Format a price: 4 decimals if < $1, 2 decimals otherwise (USD) */
export const fmtPrice = (n: number): string => {
    return Math.abs(n) < 1 ? fmtCurrency4.format(n) : fmtCurrency.format(n);
};

/** Format a signed percentage (e.g. "+15.2%" / "-23.1%") */
export const fmtPercent = (n: number, decimals: number = 1): string => {
    const sign = n >= 0 ? "+" : "";
    return `${sign}${n.toFixed(decimals)}%`;
};

/** Compact USD format: "$1.2K" / "$3.4M" / "$500" */
export const fmtCompact = (n: number): string => {
    if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
    return fmtCurrency.format(n);
};
