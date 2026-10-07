// ─── Spot PNL Global (pure, no React / Firebase) ──────────────────────────────
//
// The number the Spot "PNL Global" alert levels are crossed against belongs to the
// Cloud Function: `runCheckAlerts` (functions/src/index.ts) computes
//   globalPNL = totalCurrentValue - totalInvested
// over the `inversiones` snapshot only — open sales (ventas) are NOT counted.
//
// Every frontend surface that shows an arrow or an Armada/Pausa badge for those
// levels MUST use this exact value, never App's `totalPnl` (which adds open sales)
// and never the live websocket PNL. Kept in one place so the modal and the
// AlertSettings list can never drift apart.

/**
 * Suffix of the coins the Cloud Function CANNOT price for the Spot global PNL alert.
 *
 * `runCheckAlerts` in functions/src/index.ts builds its Binance symbol list
 * dynamically from every `inv.coin` in `inversiones` (see `priceCoins` / `fetchSpotPrices`),
 * so ALL USDT-quoted coins are priced — there is no hardcoded 13-coin list any more.
 *
 * EUR-quoted coins are the only remaining exception: the frontend prices them with Bybit's
 * public tickers (src/lib/bybit.ts `fetchBybitTickers`), while the Cloud Function cannot
 * mirror that (its `bybitRequest` needs Bybit API keys that `checkIntervalTasks` does not
 * bind) and values them at 0. The frontend must ignore them too, otherwise the Spot PNL
 * would not match `globalPNL` (and the stored `side`/`notified` state derived from it).
 * Mirrors `UNPRICEABLE_COIN_SUFFIX` in functions/src/index.ts. KEEP IN SYNC.
 */
export const CF_UNPRICED_COIN_SUFFIX = "EUR";

/** True when the Cloud Function prices `coin` (`prices[`${coin}USDT`]` on its side). */
export const isPricedByCloudFunction = (coin: string): boolean =>
    !coin.endsWith(CF_UNPRICED_COIN_SUFFIX);

/** Minimum shape needed from an `inversiones` entry (structurally an `Investment`). */
export interface SpotPnlInvestment {
    coin: string;
    quantity: number;
    invested: number;
}

/**
 * Spot PNL Global: sum over ALL open investments (inversiones) of price × quantity −
 * invested, with the same prices the Cloud Function has — every usdt-quoted coin priced,
 * EUR-quoted coins at 0 (see `isPricedByCloudFunction`).
 *
 * MUST stay identical to the `prices[`${inv.coin}USDT`] || 0` loop that feeds `globalPNL`
 * in functions/src/index.ts.
 */
export function computeSpotGlobalPnl(
    portfolio: readonly SpotPnlInvestment[],
    prices: Record<string, number>,
): number {
    return portfolio.reduce((sum, i) => {
        const price = isPricedByCloudFunction(i.coin) ? prices[i.coin] || 0 : 0;
        return sum + price * i.quantity - i.invested;
    }, 0);
}
