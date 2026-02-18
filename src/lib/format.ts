const fmtNumber = new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 });
const fmtCurrency = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
});

/** Format a number with up to 6 decimal places */
export const fmt = (n: number): string => fmtNumber.format(n);

/** Format a number as USD currency */
export const fmtUSD = (n: number): string => fmtCurrency.format(n);
