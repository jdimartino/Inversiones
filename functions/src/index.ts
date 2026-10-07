import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import axios from "axios";
import * as crypto from "crypto";
import { defineSecret } from "firebase-functions/params";
import { binanceRequest, bybitRequest } from "./apiClients";
import { analyzeMarket } from "./analyzeMarket";
import { signBinanceRequest } from "./signBinanceRequest";
import { futuresSync } from "./futuresSync";
import { sendTelegramMessage } from "./telegram";
import { evaluateGlobalCrossings, LevelState } from "./futuresGlobalCrossings";
import { getOpenRouterUsage, getOpenRouterActivity, getDeepSeekBalance } from "./monitorUsage";
import {
    evaluateCandleRules,
    candleMapKey,
    CandleAlertRuleInput,
    CandleMap,
    CandleNotification,
    CandleState,
} from "./candleAlerts";

admin.initializeApp();
const db = admin.firestore();

const DIVIDER = "────────────────────";
/** Histéresis para los cruces de PNL Global de SPOT (rejilla real de $5.000). */
const SPOT_CROSSING_MARGIN = 500;

// ─── Types ────────────────────────────────────────────────────────────────────
interface AlertRule {
    type?: 'pnl' | 'price';
    targetPercent?: number;
    targetValue?: number;
    isPersistent?: boolean;
    direction?: 'up' | 'down';
    note?: string;
    _lastSide?: 'above' | 'below';
}

interface GlobalAlertRule {
    targetAmount: number;
    isPersistent?: boolean;
    direction?: 'up' | 'down';
    note?: string;
    _lastSide?: 'above' | 'below';
}

interface WatchlistAlertRule {
    targetValue: number;
    direction: 'up' | 'down';
    isPersistent?: boolean;
    note?: string;
    _lastSide?: 'above' | 'below';
}

interface CandleAlertRule {
    type: 'candle_change';
    interval: '4h' | '1d';
    targetPercent: number;
    direction: 'up' | 'down';
    isPersistent?: boolean;
    note?: string;
    _lastSide?: 'above' | 'below';
}

// ─── Utils ────────────────────────────────────────────────────────────────────
const fmt = (n: number): string => new Intl.NumberFormat('en-US').format(Math.round(n));
const pnlSign = (n: number): string => n >= 0 ? "+" : "";
const pnlEmoji = (pnl: number): string => pnl >= 0 ? "🟢" : "🔴";
const fmtPrice = (price: number): string => {
    const dec = Math.abs(price) < 1 ? 4 : 2;
    return `$${price.toLocaleString("en-US", {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
    })}`;
};

async function sendTelegram(text: string): Promise<boolean> {
    return sendTelegramMessage(text);
}

// ─── Helpers: Normalización ──────────────────────────────────────────────────
function normalizeAlerts(raw: Record<string, unknown>): Record<string, AlertRule[]> {
    const normalized: Record<string, AlertRule[]> = {};
    for (const [id, value] of Object.entries(raw)) {
        let alertsArray: AlertRule[] = Array.isArray(value) ? value : (value ? [value as AlertRule] : []);
        normalized[id] = alertsArray.map(alert => ({
            ...alert,
            type: alert.type || (typeof alert.targetValue === 'number' ? 'price' : 'pnl'),
            direction: alert.direction || (alert.type === 'pnl' ? ((alert.targetPercent || 0) >= 0 ? 'up' : 'down') : 'up')
        }));
    }
    return normalized;
}

function normalizeGlobalAlerts(rawArray: any[]): GlobalAlertRule[] {
    if (!Array.isArray(rawArray)) return [];
    return rawArray.map(alert => ({
        ...alert,
        direction: alert.direction || (alert.targetAmount >= 0 ? 'up' : 'down')
    }));
}

// ─── Precios Spot ─────────────────────────────────────────────────────────────
/**
 * Monedas que deben seguir teniendo precio aunque YA NO estén en `inversiones`,
 * porque otras alertas de esta función las referencian:
 *   • alertas de venta  → `prices[`${meta.coin}USDT`]`
 *   • alertas watchlist → `prices[`${coin}USDT`]`
 * NO es el universo de precios del PNL Global: `runCheckAlerts` añade encima TODAS
 * las monedas de `inversiones` (antes había una lista fija de 13 y el PNL Global
 * quedaba subestimado para cualquier otra moneda).
 */
const EXTRA_PRICE_COINS: string[] = [
    "BTC", "ETH", "ADA", "DOGE", "LTC", "BNB", "SOL",
    "XRP", "DOT", "MATIC", "SHIB", "AVAX", "LINK",
];

/**
 * Sufijo de las monedas que esta función NO puede valorar (pares cotizados en EUR).
 * El frontend las pide a Bybit (`fetchBybitTickers`, endpoint público sin firmar) y
 * aquí no se puede replicar: `bybitRequest` (apiClients.ts) exige API keys de Bybit
 * que `checkIntervalTasks` no tiene enlazadas (`runWith({ secrets: [...] })`).
 * Se valoran a 0 en AMBOS lados; el frontend lo refleja con
 * `CF_UNPRICED_COIN_SUFFIX` en src/components/AlertSettings.tsx. KEEP IN SYNC.
 */
const UNPRICEABLE_COIN_SUFFIX = "EUR";

/**
 * Precios de Binance (`${coin}USDT`) para las monedas indicadas.
 *
 * Una sola petición `symbols=[...]` no sobrevive a un símbolo inválido: Binance
 * responde HTTP 400 `{"code":-1121,"msg":"Invalid symbol."}` para TODA la lista
 * (verificado contra api.binance.com), lo que pondría a 0 todos los precios y con
 * ellos el PNL Global completo. Por eso, si la petición por lotes falla, se cae al
 * mapa completo de tickers (sin parámetro `symbols`, ningún símbolo puede romperlo)
 * y se registran las monedas que no se pudieron valorar.
 *
 * Si también falla el fallback, el error se propaga: la corrida se aborta sin
 * calcular PNL (mejor eso que valorar todo a 0 y disparar cruces falsos a la baja).
 */
async function fetchSpotPrices(coins: string[]): Promise<Record<string, number>> {
    const pairs = Array.from(new Set(
        coins
            .filter((coin) => !!coin && !coin.endsWith(UNPRICEABLE_COIN_SUFFIX))
            .map((coin) => `${coin}USDT`)
    ));
    const prices: Record<string, number> = {};
    if (pairs.length === 0) return prices;

    const requested = new Set(pairs);
    const fill = (rows: any[]): void => {
        for (const item of rows) {
            if (!requested.has(item.symbol)) continue;
            const value = parseFloat(item.price);
            if (Number.isFinite(value)) prices[item.symbol] = value;
        }
    };

    try {
        const { data } = await axios.get(
            `https://api.binance.com/api/v3/ticker/price?symbols=${encodeURIComponent(JSON.stringify(pairs))}`
        );
        fill(data);
    } catch (e: any) {
        console.warn(`[PRECIOS] Falló la petición por lotes (${e?.message || e}); reintentando con el mapa completo de Binance.`);
        const { data } = await axios.get("https://api.binance.com/api/v3/ticker/price");
        fill(data);
    }

    const missing = pairs.filter((pair) => prices[pair] === undefined);
    if (missing.length > 0) {
        console.warn(`[PRECIOS] Sin precio para ${missing.join(", ")} — se valoran a 0 (PNL Global subestimado).`);
    }
    return prices;
}

// ─── Core: Alertas ────────────────────────────────────────────────────────────
async function runCheckAlerts() {
    console.log("[v2.4] Iniciando comprobación de alertas...");

    const configSnap = await db.collection("config").doc("alerts").get();
    let investmentAlerts: Record<string, AlertRule[]> = {};
    let globalAlerts: GlobalAlertRule[] = [];
    let watchlistAlerts: Record<string, WatchlistAlertRule[]> = {};
    let candleAlerts: Record<string, CandleAlertRule[]> = {};
    let saleMeta: Record<string, any> = {};

    if (configSnap.exists) {
        const conf = configSnap.data()!;
        if (conf.globalAlerts) globalAlerts = normalizeGlobalAlerts(conf.globalAlerts);
        if (conf.investmentAlerts) investmentAlerts = normalizeAlerts(conf.investmentAlerts);
        if (conf.watchlistAlerts) {
            for (const [c, a] of Object.entries(conf.watchlistAlerts)) if (Array.isArray(a)) watchlistAlerts[c] = a as WatchlistAlertRule[];
        }
        if (conf.candleAlerts) {
            for (const [c, a] of Object.entries(conf.candleAlerts)) if (Array.isArray(a)) candleAlerts[c] = a as CandleAlertRule[];
        }
        if (conf.saleMeta) saleMeta = conf.saleMeta;
    }

    // Los snapshots se leen ANTES de pedir precios: la lista de símbolos ya no es fija,
    // se deriva de las monedas realmente en cartera.
    const snap = await db.collection("inversiones").get();
    const ventasSnap = await db.collection("ventas").get();

    // Universo de precios = TODAS las monedas de `inversiones` (dinámico) + las que
    // siguen necesitando las alertas de venta (`saleMeta`) y de watchlist, que pueden
    // ya no estar en cartera. Convención de claves intacta: `prices["BTCUSDT"]`, que es
    // lo que leen los consumidores con `prices[`${coin}USDT`]`.
    const priceCoins = Array.from(new Set([
        ...EXTRA_PRICE_COINS,
        ...snap.docs.map((d) => String(d.data().coin ?? "")),
    ]));
    const prices = await fetchSpotPrices(priceCoins);

    const dbUpdates: any = {};
    const triggeredIndividualMessages: string[] = [];
    const activeSaleIds = new Set(ventasSnap.docs.map(d => `sale_${d.id}`));

    let totalInvested = 0, totalCurrentValue = 0;
    const individualAssets: any[] = [];

    snap.forEach((docSnap) => {
        const inv = docSnap.data();
        const symbol = `${inv.coin}USDT`;
        const currentPrice = prices[symbol] || 0;
        const qty = parseFloat(inv.quantity) || 0;
        const invested = parseFloat(inv.invested) || 0;
        const currentValue = currentPrice * qty;
        totalInvested += invested;
        totalCurrentValue += currentValue;
        const pnl = currentValue - invested;
        const roiPercent = (invested > 0) ? (pnl / invested) * 100 : 0;

        const alertRules = investmentAlerts[docSnap.id];
        if (Array.isArray(alertRules) && alertRules.length > 0) {
            const remaining: AlertRule[] = [];
            let hasInvChanged = false;
            for (const rule of alertRules) {
                const type = rule.type || 'pnl';
                const target = type === 'pnl' ? (rule.targetPercent || 0) : (rule.targetValue || 0);
                const currentVal = type === 'pnl' ? roiPercent : currentPrice;
                const currentSide: 'above' | 'below' = currentVal >= target ? 'above' : 'below';
                const direction = rule.direction || (type === 'pnl' ? (target >= 0 ? 'up' : 'down') : 'up');

                let conditionMet = direction === 'up' ? currentVal >= target : currentVal <= target;
                const isTriggered = conditionMet && (!rule.isPersistent || rule._lastSide === undefined || rule._lastSide !== currentSide);

                if (isTriggered) {
                    triggeredIndividualMessages.push(
                        `🚀 *${inv.coin}* ${direction === 'up' ? 'subió' : 'cayó'} a *${type === 'pnl' ? pnlSign(roiPercent) + roiPercent.toFixed(1) + '%' : fmtPrice(currentPrice)}* (Meta: ${direction === 'up' ? '🔼' : '🔽'} ${type === 'pnl' ? target + '%' : fmtPrice(target)})` +
                        `\n${pnlEmoji(pnl)} PNL: ${pnlSign(pnl)}$${fmt(pnl)}` + (rule.note ? `\n_📝 ${rule.note}_` : "")
                    );
                    if (rule.isPersistent) { remaining.push({ ...rule, _lastSide: currentSide }); hasInvChanged = true; }
                    else hasInvChanged = true;
                } else {
                    if (rule.isPersistent && rule._lastSide !== currentSide) hasInvChanged = true;
                    remaining.push(rule.isPersistent ? { ...rule, _lastSide: currentSide } : rule);
                }
            }
            if (remaining.length === 0) { dbUpdates[`investmentAlerts.${docSnap.id}`] = admin.firestore.FieldValue.delete(); }
            else if (hasInvChanged) { dbUpdates[`investmentAlerts.${docSnap.id}`] = remaining; }
        }
        individualAssets.push({ id: docSnap.id, coin: inv.coin, pnl, roi: roiPercent });
    });

    // Cleanup & Sales Alerts
    for (const [saleKey, rules] of Object.entries(investmentAlerts)) {
        if (!saleKey.startsWith('sale_')) continue;
        const meta = saleMeta[saleKey];
        if (!meta || !activeSaleIds.has(saleKey)) {
            dbUpdates[`investmentAlerts.${saleKey}`] = admin.firestore.FieldValue.delete();
            if (saleMeta[saleKey]) dbUpdates[`saleMeta.${saleKey}`] = admin.firestore.FieldValue.delete();
            continue;
        }
        const currentPrice = prices[`${meta.coin}USDT`] || 0;
        if (currentPrice === 0) continue;
        const roi = ((meta.usdtReceived - meta.quantity * currentPrice) / meta.usdtReceived) * 100;
        const recompraPnl = meta.usdtReceived - meta.quantity * currentPrice;
        const remaining: AlertRule[] = [];
        let hasChanged = false;
        for (const rule of rules) {
            const type = rule.type || 'price';
            const target = type === 'pnl' ? (rule.targetPercent || 0) : (rule.targetValue || 0);
            const currentVal = type === 'pnl' ? roi : currentPrice;
            const currentSide: 'above' | 'below' = currentVal >= target ? 'above' : 'below';
            let conditionMet = rule.direction === 'up' ? currentVal >= target : currentVal <= target;
            if (conditionMet && (!rule.isPersistent || rule._lastSide !== currentSide)) {
                triggeredIndividualMessages.push(`💰 *${meta.coin}* (venta) ${rule.direction === 'up' ? 'alcanzó' : 'bajó'} *${type === 'pnl' ? roi.toFixed(1) + '%' : fmtPrice(currentPrice)}*\n${pnlEmoji(recompraPnl)} Si recompras: ${pnlSign(recompraPnl)}$${fmt(recompraPnl)}` + (rule.note ? `\n_📝 ${rule.note}_` : ""));
                if (rule.isPersistent) { remaining.push({ ...rule, _lastSide: currentSide }); hasChanged = true; }
                else hasChanged = true;
            } else {
                if (rule.isPersistent && rule._lastSide !== currentSide) hasChanged = true;
                remaining.push(rule.isPersistent ? { ...rule, _lastSide: currentSide } : rule);
            }
        }
        if (hasChanged) {
            if (remaining.length === 0) {
                delete investmentAlerts[saleKey];
                dbUpdates[`investmentAlerts.${saleKey}`] = admin.firestore.FieldValue.delete();
            } else {
                investmentAlerts[saleKey] = remaining;
                dbUpdates[`investmentAlerts.${saleKey}`] = remaining;
            }
        }
    }

    // ── Global Alerts ──────────────────────────────────────────────────────────
    // Cruces en AMBOS sentidos con histéresis (mismo motor puro que Futuros).
    // El estado vive en su propio doc (spotAlertState/global): el frontend no lo toca.
    const globalPNL = totalCurrentValue - totalInvested;
    const triggeredGlobalMessages: string[] = [];
    const crossedTargets = new Set<number>();

    const spotLevels = Array.from(
        new Set(globalAlerts.map((r) => r.targetAmount).filter((v) => Number.isFinite(v)))
    );
    const spotStateRef = db.collection("spotAlertState").doc("global");
    const spotStateSnap = await spotStateRef.get();
    const spotStateData: any = spotStateSnap.exists ? spotStateSnap.data() || {} : {};
    const spotLevelsState: Record<string, LevelState> = spotStateData.levels || {};
    const lastPnl: number | undefined = typeof spotStateData.lastPnl === "number" ? spotStateData.lastPnl : undefined;

    const { crossings, newState } = evaluateGlobalCrossings(spotLevels, spotLevelsState, globalPNL, SPOT_CROSSING_MARGIN);

    const persistSpotState = async (): Promise<void> => {
        try {
            await spotStateRef.set({ levels: newState, lastPnl: globalPNL });
        } catch (e: any) {
            // Se acepta: si el envío ya ocurrió podría repetirse el aviso en la próxima corrida.
            console.error("[ALERTA GLOBAL v4] No se pudo guardar spotAlertState/global:", e?.message || e);
        }
    };

    if (crossings.length === 0) {
        // Sin cruces: el estado se guarda igual en cada corrida.
        await persistSpotState();
    } else {
        const sense: 'up' | 'down' = globalPNL >= (lastPnl ?? globalPNL) ? 'up' : 'down';
        const orderedCrossings = [...crossings].sort((a, b) =>
            sense === 'up' ? a.level - b.level : b.level - a.level
        );

        const notesByLevel = new Map<number, string>();
        for (const rule of globalAlerts) {
            const note = (rule.note || "").trim();
            if (!note) continue;
            const previousNote = notesByLevel.get(rule.targetAmount);
            notesByLevel.set(rule.targetAmount, previousNote ? `${previousNote} / ${note}` : note);
        }

        // Formato VIEJO: un cruce ⇒ mensaje idéntico al antiguo (una sola línea).
        // Varios ⇒ cabecera única (sentido del movimiento) + una línea de detalle por nivel.
        const spotHeader = sense === 'up'
            ? `🚨 *PNL Global* alcanzó *${pnlSign(globalPNL)}$${fmt(globalPNL)}*`
            : `📉 *PNL Global* cayó a *${pnlSign(globalPNL)}$${fmt(globalPNL)}*`;
        const spotDetails = orderedCrossings.map((c) => {
            const note = notesByLevel.get(c.level);
            const detail = c.dir === 'up'
                ? `(Meta: 🔼 >= ${pnlSign(c.level)}$${fmt(c.level)})`
                : `(Límite: 🔽 <= ${pnlSign(c.level)}$${fmt(c.level)})`;
            return detail + (note ? `\n_📝 ${note}_` : "");
        });
        triggeredGlobalMessages.push(
            spotDetails.length === 1 ? `${spotHeader} ${spotDetails[0]}` : `${spotHeader}\n${spotDetails.join("\n")}`
        );

        for (const c of orderedCrossings) crossedTargets.add(c.level);

        console.log(
            `[ALERTA GLOBAL v4] PNL: $${globalPNL.toFixed(2)} — cruces: ` +
            `${orderedCrossings.map((c) => `${c.dir} ${c.level}`).join(", ")} (margen $${SPOT_CROSSING_MARGIN})`
        );
        // La persistencia se hace tras el envío OK (ver más abajo) para poder reintentar.
    }

    // ── Watchlist Alerts ───────────────────────────────────────────────────────
    const triggeredWatchlistMessages: string[] = [];
    const watchlistDbUpdates: any = {};
    for (const [coin, rules] of Object.entries(watchlistAlerts)) {
        const currentPrice = prices[`${coin}USDT`] || 0;
        if (currentPrice === 0) continue;
        const remaining: WatchlistAlertRule[] = [];
        let hasCoinChanged = false;

        for (const rule of rules) {
            const currentSide: 'above' | 'below' = currentPrice >= rule.targetValue ? 'above' : 'below';
            const prevSide = rule._lastSide;
            let conditionMet = rule.direction === 'up' ? currentPrice >= rule.targetValue : currentPrice <= rule.targetValue;
            const isTriggered = conditionMet && (!rule.isPersistent || prevSide === undefined || prevSide !== currentSide);

            if (isTriggered) {
                triggeredWatchlistMessages.push(
                    rule.direction === 'up'
                        ? `👁 *${coin}* alcanzó *${fmtPrice(currentPrice)}* (Watchlist: 🔼 >= ${fmtPrice(rule.targetValue)})` + (rule.note ? `\n_📝 ${rule.note}_` : "")
                        : `👁 *${coin}* bajó a *${fmtPrice(currentPrice)}* (Watchlist: 🔽 <= ${fmtPrice(rule.targetValue)})` + (rule.note ? `\n_📝 ${rule.note}_` : "")
                );
                console.log(`[WATCHLIST v3] ${coin}: ${currentPrice} — Target: ${rule.direction === 'up' ? '>=' : '<='} ${rule.targetValue}`);
                if (rule.isPersistent) { remaining.push({ ...rule, _lastSide: currentSide }); hasCoinChanged = true; }
            } else {
                if (rule.isPersistent) {
                    if (prevSide !== currentSide) hasCoinChanged = true;
                    remaining.push({ ...rule, _lastSide: currentSide });
                } else {
                    remaining.push(rule);
                }
            }
        }
        if (remaining.length === 0) { watchlistDbUpdates[`watchlistAlerts.${coin}`] = admin.firestore.FieldValue.delete(); }
        else if (remaining.length !== rules.length || hasCoinChanged) { watchlistDbUpdates[`watchlistAlerts.${coin}`] = remaining; }
    }

    // ── Candle Alerts ──────────────────────────────────────────────────────────
    // El estado se lleva por ruleKey (`coin|interval|direction|targetPercent`) en
    // candleAlertState/global, para no reescribir config/alerts en cada corrida.
    const triggeredCandleMessages: string[] = [];
    const triggeredCandleNotifications: CandleNotification[] = [];
    const candleStateRef = db.collection("candleAlertState").doc("global");
    const candleStateSnap = await candleStateRef.get();
    const candleSeedOnly = !candleStateSnap.exists;
    const candleState: CandleState = candleSeedOnly ? {} : (candleStateSnap.data()?.rules || {});

    const candleRules: CandleAlertRuleInput[] = [];
    const candlePairs = new Map<string, { coin: string; interval: string }>();
    for (const [coin, rules] of Object.entries(candleAlerts)) {
        if (!Array.isArray(rules)) continue;
        for (const rule of rules) {
            if (!rule || rule.type !== 'candle_change') continue;
            candleRules.push({
                coin,
                interval: rule.interval,
                direction: rule.direction,
                targetPercent: rule.targetPercent,
                isPersistent: rule.isPersistent,
                note: rule.note,
            });
            candlePairs.set(candleMapKey(coin, rule.interval), { coin, interval: rule.interval });
        }
    }

    // Klines: UNA petición por par (coin, interval) único, no una por regla.
    const candles: CandleMap = {};
    for (const { coin, interval } of candlePairs.values()) {
        const symbol = `${coin}USDT`;
        try {
            const { data } = await axios.get(`https://api.binance.com/api/v3/klines`, {
                params: { symbol, interval, limit: 2 },
            });
            const kline = data[data.length - 1];
            const open = parseFloat(kline[1]);
            const close = parseFloat(kline[4]);
            candles[candleMapKey(coin, interval)] = {
                openTime: Number(kline[0]),
                changePct: ((close - open) / open) * 100,
                open,
                close,
            };
        } catch (e: any) {
            console.error(`[CandleAlert] Error fetching klines for ${coin} ${interval}:`, e.message);
        }
    }

    const { notifications: candleNotifications, newState: newCandleState } =
        evaluateCandleRules(candleRules, candles, candleState, candleSeedOnly);

    for (const n of candleNotifications) {
        const emoji = n.changePct >= 0 ? '📈' : '📉';
        const meta = n.direction === 'up'
            ? `Variación >= ${n.targetPercent}%`
            : `Variación <= -${n.targetPercent}%`;
        const priceLine = (n.open !== undefined && n.close !== undefined)
            ? `\n   Apertura: ${fmtPrice(n.open)} · Cierre: ${fmtPrice(n.close)}`
            : '';
        triggeredCandleMessages.push(
            `${emoji} *${n.coin}* — Vela ${n.interval.toUpperCase()}: *${pnlSign(n.changePct)}${n.changePct.toFixed(2)}%*\n` +
            `   Meta: ${n.direction === 'up' ? '🔼' : '🔽'} ${meta}` +
            priceLine +
            (n.notes.length > 0 ? `\n   _📝 ${n.notes.join(' · ')}_` : '')
        );
        console.log(`[CANDLE ALERT] ${n.coin} ${n.interval}: ${n.changePct.toFixed(2)}% — Target: ${n.direction} ${n.targetPercent}%`);
    }
    triggeredCandleNotifications.push(...candleNotifications);

    const hasCandleStateChanged =
        JSON.stringify(candleState) !== JSON.stringify(newCandleState);

    const persistCandleState = async (): Promise<void> => {
        try {
            await candleStateRef.set({ rules: newCandleState });
        } catch (e: any) {
            // Se acepta: peor caso, la misma vela se reintenta en la próxima corrida.
            console.error("[CANDLE ALERT] No se pudo guardar candleAlertState/global:", e?.message || e);
        }
    };

    if (candleSeedOnly && candleRules.length > 0) {
        // Primer run tras el deploy: se siembra el estado SIN notificar.
        console.log(`[CANDLE ALERT] Estado inicial sembrado (${Object.keys(newCandleState).length} reglas), sin avisos.`);
        await persistCandleState();
    } else if (candleNotifications.length === 0 && hasCandleStateChanged) {
        // Sin avisos: sólo se persiste la limpieza de reglas que ya no existen.
        await persistCandleState();
    }

    // Alertas one-shot de vela: se borran con transacción para no pisar cambios de la UI.
    const deleteFiredOneShotCandleRules = async (): Promise<void> => {
        const fired = triggeredCandleNotifications
            .map((n) => {
                const rule = candleRules.find((r) =>
                    r.coin === n.coin && r.interval === n.interval &&
                    r.direction === n.direction && r.targetPercent === n.targetPercent);
                return { n, rule };
            })
            .filter(({ rule }) => !!rule && !rule.isPersistent)
            .map(({ n }) => n);
        if (fired.length === 0) return;

        const configRef = db.collection("config").doc("alerts");
        try {
            await db.runTransaction(async (tx) => {
                const snap = await tx.get(configRef);
                if (!snap.exists) return;
                const current: Record<string, CandleAlertRule[]> = snap.data()?.candleAlerts || {};
                const next: Record<string, CandleAlertRule[]> = {};
                let removed = 0;
                for (const [coin, rules] of Object.entries(current)) {
                    if (!Array.isArray(rules)) { next[coin] = rules; continue; }
                    const remaining = rules.filter((r) => !fired.some((f) =>
                        f.coin === coin && f.interval === r.interval &&
                        f.direction === r.direction && f.targetPercent === r.targetPercent));
                    removed += rules.length - remaining.length;
                    if (remaining.length > 0) next[coin] = remaining;
                }
                if (removed === 0) return;
                tx.update(configRef, { candleAlerts: next });
                console.log(`[CANDLE ALERT] Eliminadas ${removed} alerta(s) de vela 1x`);
            });
        } catch (e: any) {
            console.error("[CANDLE ALERT] Error eliminando alertas de vela 1x:", e?.message || e);
        }
    };


    // ── Decisión final ─────────────────────────────────────────────────────────
    const shouldAlert = crossings.length > 0 || triggeredGlobalMessages.length > 0 || triggeredIndividualMessages.length > 0 || triggeredWatchlistMessages.length > 0 || triggeredCandleMessages.length > 0;

    if (shouldAlert) {
        let message = ``;
        if (triggeredGlobalMessages.length > 0) message += `*🚨 Alertas Globales:*\n${triggeredGlobalMessages.join("\n")}\n\n`;
        if (triggeredCandleMessages.length > 0) message += `*📊 Alertas de Vela:*\n${triggeredCandleMessages.join("\n")}\n\n`;
        if (triggeredIndividualMessages.length > 0) message += `${triggeredIndividualMessages.join("\n")}\n`;
        if (triggeredWatchlistMessages.length > 0) message += `${triggeredWatchlistMessages.join("\n")}\n`;

        const sent = await sendTelegram(message);
        if (sent) {
            console.log("✅ Alerta enviada.");
            const allUpdates = { ...dbUpdates, ...watchlistDbUpdates };
            if (Object.keys(allUpdates).length > 0) {
                await db.collection("config").doc("alerts").update(allUpdates);
            }
            await db.collection("notificationLogs").add({
                sentAt: new Date(),
                globalAlertTriggered: triggeredGlobalMessages.length > 0,
                globalPNL: Math.round(globalPNL),
                triggeredAssets: triggeredIndividualMessages,
                triggeredGlobalAlerts: triggeredGlobalMessages,
                triggeredWatchlistAlerts: triggeredWatchlistMessages,
                triggeredCandleAlerts: triggeredCandleMessages,
                totalInvested: Math.round(totalInvested),
                totalCurrentValue: Math.round(totalCurrentValue),
                positionSnapshot: Object.fromEntries(
                    individualAssets.map(a => [a.id, { coin: a.coin, pnl: a.pnl, roi: a.roi }])
                ),
            });

            // Cruces de PNL Global: el estado se guarda SÓLO tras un envío OK, para que un fallo
            // de Telegram reintente el mismo cruce en la próxima corrida (10 min).
            if (crossings.length > 0) {
                await persistSpotState();
            }

            // Alertas de vela: el estado se guarda SÓLO tras un envío OK, para que un fallo de
            // Telegram reintente el mismo aviso en la próxima corrida (10 min). Las one-shot
            // disparadas se borran después de ese envío exitoso.
            if (triggeredCandleNotifications.length > 0) {
                await deleteFiredOneShotCandleRules();
                await persistCandleState();
            }

            // Alertas 1x cruzadas: se borran con transacción para no pisar cambios de la UI.
            if (crossedTargets.size > 0) {
                const configRef = db.collection("config").doc("alerts");
                try {
                    await db.runTransaction(async (tx) => {
                        const snap = await tx.get(configRef);
                        if (!snap.exists) return;
                        const current: GlobalAlertRule[] = (snap.data()?.globalAlerts as GlobalAlertRule[]) || [];
                        const remaining = current.filter((r) => !(!r.isPersistent && crossedTargets.has(r.targetAmount)));
                        if (remaining.length === current.length) return;
                        tx.update(configRef, { globalAlerts: remaining });
                        console.log(`[ALERTA GLOBAL v4] Eliminadas ${current.length - remaining.length} alerta(s) 1x por cruce`);
                    });
                } catch (e: any) {
                    console.error("[ALERTA GLOBAL v4] Error eliminando alertas 1x:", e?.message || e);
                }
            }
            return { sent: true, summary: "Alerta enviada" };
        } else {
            console.error("[ERROR] Telegram falló. Cruces NO persistidos (se reintentan la próxima corrida) y alertas ONE-SHOT no eliminadas.");
            return { sent: false, summary: "Fallo envío Telegram" };
        }
    } else {
        const allUpdatesNoAlert = { ...dbUpdates, ...watchlistDbUpdates };
        if (Object.keys(allUpdatesNoAlert).length > 0) {
            await db.collection("config").doc("alerts").update(allUpdatesNoAlert);
        }
        console.log("Todo dentro de los límites.");
        return { sent: false, summary: "Sin alertas" };
    }
}

// ─── Trading Signals ─────────────────────────────────────────────────────────
async function runTradingSignals() {
    console.log("[Trading Signals] Analizando mercados...");
}

// ─── Daily Portfolio Report ───────────────────────────────────────────────────
async function runDailyReport() {
    const configSnap = await db.collection("config").doc("alerts").get();
    const conf = configSnap.exists ? configSnap.data()! : {};
    if (!conf.dailyReportEnabled) {
        console.log("[DailyReport] Desactivado, omitiendo.");
        return;
    }

    const SYMBOL_MAP: Record<string, string> = {
        BTC: "BTCUSDT", ETH: "ETHUSDT", ADA: "ADAUSDT", DOGE: "DOGEUSDT",
        LTC: "LTCUSDT", BNB: "BNBUSDT", SOL: "SOLUSDT", XRP: "XRPUSDT",
        DOT: "DOTUSDT", MATIC: "MATICUSDT", SHIB: "SHIBUSDT", AVAX: "AVAXUSDT",
        LINK: "LINKUSDT",
    };
    const symbols = Object.values(SYMBOL_MAP);
    const { data: tickerData } = await axios.get(
        `https://api.binance.com/api/v3/ticker/price?symbols=${encodeURIComponent(JSON.stringify(symbols))}`
    );
    const prices: Record<string, number> = {};
    for (const item of tickerData) {
        prices[item.symbol] = parseFloat(item.price);
    }

    const snap = await db.collection("inversiones").get();

    interface CoinData { invested: number; currentValue: number; currentPrice: number; totalQty: number; positions: number; }
    const coinMap: Record<string, CoinData> = {};
    const individualPositions: { coin: string; pnl: number; roi: number; line: string }[] = [];

    snap.forEach((docSnap) => {
        const inv = docSnap.data();
        const symbol = SYMBOL_MAP[inv.coin] || `${inv.coin}USDT`;
        const currentPrice = prices[symbol] || 0;
        const qty = parseFloat(inv.quantity) || 0;
        const invested = parseFloat(inv.invested) || 0;
        const currentValue = currentPrice * qty;
        const pnl = currentValue - invested;
        const roi = invested > 0 ? (pnl / invested) * 100 : 0;

        individualPositions.push({
            coin: inv.coin, pnl, roi,
            line: `${pnlEmoji(pnl)} *${inv.coin}:* ${pnlSign(pnl)}$${fmt(pnl)} (${pnlSign(roi)}${roi.toFixed(1)}%) · ${fmtPrice(currentPrice)}`,
        });

        if (!coinMap[inv.coin]) coinMap[inv.coin] = { invested: 0, currentValue: 0, currentPrice, totalQty: 0, positions: 0 };
        coinMap[inv.coin].invested += invested;
        coinMap[inv.coin].currentValue += currentValue;
        coinMap[inv.coin].currentPrice = currentPrice;
        coinMap[inv.coin].totalQty += qty;
        coinMap[inv.coin].positions += 1;
    });

    if (Object.keys(coinMap).length === 0) {
        console.log("[DailyReport] Sin posiciones en portafolio.");
        return;
    }

    individualPositions.sort((a, b) => b.pnl - a.pnl);

    let totalInvested = 0;
    let totalCurrentValue = 0;
    const consolidatedLines: { pnl: number; line: string }[] = [];

    for (const [coin, data] of Object.entries(coinMap)) {
        const pnl = data.currentValue - data.invested;
        const roi = data.invested > 0 ? (pnl / data.invested) * 100 : 0;
        const avgBuyPrice = data.totalQty > 0 ? data.invested / data.totalQty : 0;
        totalInvested += data.invested;
        totalCurrentValue += data.currentValue;
        const posLabel = data.positions > 1 ? ` (${data.positions} pos)` : "";
        consolidatedLines.push({
            pnl,
            line: `${pnlEmoji(pnl)} *${coin}*${posLabel}: ${pnlSign(pnl)}$${fmt(pnl)} (${pnlSign(roi)}${roi.toFixed(1)}%)\n` +
                  `    Prom: ${fmtPrice(avgBuyPrice)} · Actual: ${fmtPrice(data.currentPrice)}`,
        });
    }
    consolidatedLines.sort((a, b) => b.pnl - a.pnl);

    const globalPNL = totalCurrentValue - totalInvested;
    const now = new Date();
    const dateStr = now.toLocaleDateString("es-ES", { weekday: "long", day: "2-digit", month: "short", year: "numeric" });
    const timeStr = now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

    let message = `🌅 *Resumen Diario del Portafolio*\n_${dateStr} — ${timeStr}_\n${DIVIDER}\n`;

    // Section 1: Consolidated per coin
    message += `📊 *PNL Consolidado por Moneda:*\n`;
    for (const { line } of consolidatedLines) {
        if (message.length + line.length + 1 > 3200) break;
        message += line + "\n";
    }

    // Section 2: Individual positions
    message += `${DIVIDER}\n📋 *Detalle por Posición:*\n`;
    for (const { line } of individualPositions) {
        if (message.length + line.length + 1 > 3700) { message += `_(y más...)_`; break; }
        message += line + "\n";
    }

    // Section 3: Ventas realizadas
    const ventasSnap = await db.collection("ventas").get();
    if (!ventasSnap.empty) {
        const ventas = ventasSnap.docs.map(d => d.data());
        let totalRecibido = 0;
        let totalRecompraPnl = 0;
        const ventaLines: { date: number; line: string }[] = [];

        for (const v of ventas) {
            const symbol = SYMBOL_MAP[v.coin] || `${v.coin}USDT`;
            const cp = prices[symbol] || 0;
            const recompraPnl = cp > 0 ? v.usdtReceived - v.quantity * cp : null;
            totalRecibido += v.usdtReceived;
            if (recompraPnl !== null) totalRecompraPnl += recompraPnl;

            const pnlStr = recompraPnl !== null
                ? `${pnlSign(recompraPnl)}$${fmt(recompraPnl)} (${pnlSign(recompraPnl / v.usdtReceived * 100)}${Math.abs(recompraPnl / v.usdtReceived * 100).toFixed(1)}%)`
                : "—";
            const emoji = recompraPnl === null ? "⚪" : recompraPnl >= 0 ? "🟢" : "🔴";
            const dateStr = v.date ? new Date(v.date).toLocaleDateString("es-ES", { day: "2-digit", month: "short" }) : "—";
            ventaLines.push({
                date: v.date || 0,
                line: `${emoji} *${v.coin}* ${dateStr}: ${fmtPrice(v.sellPrice)} → ${cp > 0 ? fmtPrice(cp) : "—"} · ${pnlStr}`,
            });
        }
        ventaLines.sort((a, b) => b.date - a.date);

        message += `${DIVIDER}\n💼 *Ventas Realizadas (${ventas.length}):*\n`;
        for (const { line } of ventaLines) {
            if (message.length + line.length + 1 > 4000) { message += `_(y más...)_\n`; break; }
            message += line + "\n";
        }
        message += `💵 Recibido: $${fmt(totalRecibido)}`;
        if (totalRecibido > 0) {
            message += ` | Recompra: ${pnlSign(totalRecompraPnl)}$${fmt(totalRecompraPnl)}`;
        }
        message += "\n";
    }

    message += `${DIVIDER}\n💰 *PNL Total:* ${pnlSign(globalPNL)}${fmt(globalPNL)}\n📥 *Invertido:* ${fmt(totalInvested)}\n📈 *Valor Actual:* ${fmt(totalCurrentValue)}`;

    await sendTelegram(message);
    console.log("[DailyReport] Enviado correctamente.");
}

// ─── Scheduled Tasks ─────────────────────────────────────────────────────────
export const checkIntervalTasks = functions
    .region('europe-west1')
    .runWith({ memory: "128MB", secrets: ["TELEGRAM_TOKEN", "TELEGRAM_CHAT_ID"] })
    .pubsub.schedule("every 10 minutes").onRun(async () => {
        try {
            await runCheckAlerts();
        } catch (e) {
            console.error("Error en checkIntervalTasks:", e);
        }
        try {
            await runTradingSignals();
        } catch (e) {
            console.error("Error en runTradingSignals:", e);
        }
    });

export const dailyPortfolioReport = functions
    .region('europe-west1')
    .runWith({ memory: "128MB", secrets: ["TELEGRAM_TOKEN", "TELEGRAM_CHAT_ID"] })
    .pubsub.schedule("0 8 * * *")
    .timeZone("America/Caracas")
    .onRun(async (_context) => {
        try {
            await runDailyReport();
        } catch (e) {
            console.error("Error en dailyPortfolioReport:", e);
        }
    });

export const testDailyReport = functions
    .region('europe-west1')
    .runWith({ secrets: ["TELEGRAM_TOKEN", "TELEGRAM_CHAT_ID"] })
    .https.onRequest(async (_req, res) => {
        try {
            await runDailyReport();
            res.json({ ok: true });
        } catch (e: any) {
            res.status(500).send(e.message);
        }
    });

// ─── Helper: CORS ──────────────────────────────────────────────────────────
function setCorsHeaders(res: functions.Response) {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

// ─── Helper: Binance Signed Request ─────────────────────────────────────────
const BINANCE_SECRET = defineSecret("FUNCTIONS_CONFIG_EXPORT");

async function binanceSignedRequest(
    path: string,
    params: Record<string, string> = {},
    method: "GET" | "POST" = "GET"
): Promise<any> {
    const bConfig = JSON.parse(BINANCE_SECRET.value() as string).binance;
    if (!bConfig?.api_key || !bConfig?.api_secret) {
        throw new Error("Binance API keys not configured");
    }
    const { api_key: apiKey, api_secret: apiSecret } = bConfig;
    const timestamp = Date.now();
    const baseParams = { ...params, timestamp: String(timestamp), recvWindow: "5000" };
    const qs = new URLSearchParams(baseParams).toString();
    const signature = crypto.createHmac("sha256", apiSecret).update(qs).digest("hex");
    const isFapi = path.startsWith("/fapi");
    const baseUrl = isFapi ? "https://fapi.binance.com" : "https://api.binance.com";
    const url = `${baseUrl}${path}?${qs}&signature=${signature}`;
    const config: any = {
        headers: { "X-MBX-APIKEY": apiKey },
        timeout: 10000,
    };
    if (method === "POST") {
        config.headers["Content-Type"] = "application/json";
    }
    const { data } = method === "POST"
        ? await axios.post(url, null, config)
        : await axios.get(url, config);
    return data;
}

// ─── HTTP Functions ─────────────────────────────────────────────────────────
export { analyzeMarket };
export { signBinanceRequest };
export { futuresSync };
export { getOpenRouterUsage, getOpenRouterActivity, getDeepSeekBalance };

export const getBinanceWallet = functions
    .region("europe-west1")
    .runWith({ secrets: ["FUNCTIONS_CONFIG_EXPORT"], memory: "128MB" })
    .https.onRequest(async (req, res) => {
        setCorsHeaders(res);
        if (req.method === "OPTIONS") { res.status(204).send(""); return; }
        try {
            const [spotData, futuresData, fundingWalletData] = await Promise.all([
                binanceSignedRequest("/api/v3/account", { omitZeroBalances: "true" }),
                binanceSignedRequest("/fapi/v2/balance"),
                binanceSignedRequest("/sapi/v1/asset/get-funding-asset", {}, "POST"),
            ]);

            const spot: Record<string, number> = {};
            if (spotData?.balances && Array.isArray(spotData.balances)) {
                for (const asset of spotData.balances) {
                    const total = parseFloat(asset.free || "0") + parseFloat(asset.locked || "0");
                    if (total > 0) spot[asset.asset] = total;
                }
            }

            const futures: Record<string, number> = {};
            if (Array.isArray(futuresData)) {
                for (const b of futuresData) {
                    const bal = parseFloat(b.balance || "0");
                    if (bal > 0) futures[b.asset] = bal;
                }
            }

            const fundingWallet: Record<string, number> = {};
            if (Array.isArray(fundingWalletData)) {
                for (const a of fundingWalletData) {
                    const total = parseFloat(a.free || "0") + parseFloat(a.locked || "0");
                    if (total > 0) fundingWallet[a.asset] = total;
                }
            }

            res.status(200).json({ fundingWallet, spot, futures });
        } catch (error: any) {
            console.error("[getBinanceWallet] Error:", error.message);
            res.status(200).json({ fundingWallet: { USDT: 0 }, spot: { USDT: 0 }, error: error.message });
        }
    });

export const corsTest = functions
    .region("europe-west1")
    .runWith({ memory: "128MB" })
    .https.onRequest((req, res) => {
        setCorsHeaders(res);
        if (req.method === "OPTIONS") { res.status(204).send(""); return; }
        res.status(200).json({ ok: true, message: "CORS configurado correctamente" });
    });

export const syncBinanceLoans = functions
    .region("europe-west1")
    .runWith({ secrets: ["FUNCTIONS_CONFIG_EXPORT"], memory: "128MB" })
    .https.onRequest(async (req, res) => {
        setCorsHeaders(res);
        if (req.method === "OPTIONS") { res.status(204).send(""); return; }
        try {
            const bConfig = JSON.parse(BINANCE_SECRET.value() as string).binance;
            if (!bConfig?.api_key || !bConfig?.api_secret) {
                res.status(200).json({ ongoing: [], collateral: [], loanable: [], error: "Binance API keys not configured" });
                return;
            }
            const { api_key: apiKey, api_secret: apiSecret } = bConfig;
    const [ongoingRes, collateralRes, loanableRes] = await Promise.all([
                binanceRequest("/sapi/v2/loan/flexible/ongoing/orders", "GET", { limit: "100" }, apiKey, apiSecret),
                binanceRequest("/sapi/v2/loan/flexible/collateral/data", "GET", {}, apiKey, apiSecret),
                binanceRequest("/sapi/v2/loan/flexible/loanable/data", "GET", {}, apiKey, apiSecret),
            ]);
    const ongoing: any[] = ongoingRes?.rows || ongoingRes || [];
            const collateral = collateralRes?.rows || collateralRes || [];
            const loanable = loanableRes?.rows || loanableRes || [];
            res.status(200).json({ ongoing, collateral, loanable });
        } catch (error: any) {
            console.error("[syncBinanceLoans] Error:", error.message);
            res.status(200).json({ ongoing: [], collateral: [], loanable: [], error: error.message });
        }
    });

export const syncBybitLoans = functions
    .region("europe-west1")
    .runWith({ secrets: [BINANCE_SECRET], memory: "128MB" })
    .https.onRequest(async (req, res) => {
        setCorsHeaders(res);
        if (req.method === "OPTIONS") { res.status(204).send(""); return; }
        try {
            const config = JSON.parse(BINANCE_SECRET.value() as string);
            const bybitConfig = config.bybit;
            if (!bybitConfig?.api_key || !bybitConfig?.api_secret) {
                res.status(401).json({ position: null, flexibleLoans: [], collateralData: {}, error: "Bybit API keys not configured" });
                return;
            }
            const { api_key: apiKey, api_secret: apiSecret } = bybitConfig;
            const [positionRes, ongoingRes] = await Promise.all([
                bybitRequest<any>("/v5/crypto-loan-common/position", {}, apiKey, apiSecret),
                bybitRequest<any>("/v5/crypto-loan-flexible/ongoing-coin", {}, apiKey, apiSecret),
            ]);
            const posResult = positionRes || {};
            const ongoingResult = ongoingRes || {};
            const borrowList = (posResult.borrowList || []).map((b: any) => ({
                flexibleHourlyInterestRate: b.flexibleHourlyInterestRate || "0",
                flexibleTotalDebt: b.flexibleTotalDebt || "0",
                flexibleTotalDebtUSD: b.flexibleTotalDebtUSD || "0",
                loanCurrency: b.loanCurrency || "",
            }));
            const collateralList = (posResult.collateralList || []).map((c: any) => ({
                amount: c.amount || "0",
                amountUSD: c.amountUSD || "0",
                currency: c.currency || "",
            }));
            const totalDebt = parseFloat(posResult.totalDebt || "0");
            const totalCollateral = parseFloat(posResult.totalCollateral || "0");
            const ltv = posResult.ltv || "0";
            const position = {
                borrowList, collateralList,
                ltv, totalCollateral: String(totalCollateral), totalDebt: String(totalDebt),
            };
            const ongoingList = ongoingResult.list || [];
            const flexibleLoans = borrowList.map((b: any) => {
                const ongoing = ongoingList.find((o: any) => o.loanCurrency === b.loanCurrency);
                return {
                    hourlyInterestRate: b.flexibleHourlyInterestRate,
                    loanCurrency: b.loanCurrency,
                    totalDebt: b.flexibleTotalDebt,
                    unpaidInterest: ongoing?.unpaidInterest || "0",
                };
            });
            // Fetch real per-coin LTV thresholds from legacy endpoint
            const collateralData: Record<string, any[]> = {};
            const currencySet = new Map<string, boolean>();
            for (const c of collateralList) {
                currencySet.set(String((c as any).currency), true);
            }
            for (const currency of currencySet.keys()) {
                try {
                    const coinData = await bybitRequest<any>(
                        "/v5/crypto-loan/collateral-data",
                        { currency: String(currency) },
                        apiKey,
                        apiSecret
                    );
                    const list = coinData?.collateralInfo || coinData?.list || [];
                    collateralData[currency] = list.map((item: any) => ({
                        currency: item.currency || currency,
                        initialLTV: item.initialLTV || "0.80",
                        marginCallLTV: item.marginCallLTV || "0.87",
                        liquidationLTV: item.liquidationLTV || "0.92",
                    }));
                    if (collateralData[currency].length === 0) {
                        collateralData[currency] = [{
                            currency, initialLTV: "0.80", marginCallLTV: "0.87", liquidationLTV: "0.92",
                        }];
                    }
                } catch {
                    // Fallback if legacy endpoint unavailable
                    collateralData[currency] = [{
                        currency, initialLTV: "0.80", marginCallLTV: "0.87", liquidationLTV: "0.92",
                    }];
                }
            }
            res.status(200).json({ position, flexibleLoans, collateralData });
        } catch (error: any) {
            console.error("[syncBybitLoans] Error:", error.message);
            res.status(500).json({ position: null, flexibleLoans: [], collateralData: {}, error: error.message });
        }
    });

// ─── Loan Snapshots (daily cron) ────────────────────────────────────────────
async function fetchBybitLoanData(apiKey: string, apiSecret: string) {
    const [positionRes, ongoingRes] = await Promise.all([
        bybitRequest<any>("/v5/crypto-loan-common/position", {}, apiKey, apiSecret),
        bybitRequest<any>("/v5/crypto-loan-flexible/ongoing-coin", {}, apiKey, apiSecret),
    ]);
    const posResult = positionRes || {};
    const ongoingResult = ongoingRes || {};
    const borrowList = posResult.borrowList || [];
    const collateralList = posResult.collateralList || [];
    const ongoingList = ongoingResult.list || [];

    const debts = borrowList.map((b: any) => {
        const ongoing = ongoingList.find((o: any) => o.loanCurrency === b.loanCurrency);
        return {
            id: b.loanCurrency || "",
            amount: parseFloat(b.flexibleTotalDebt) || 0,
            hourlyRate: parseFloat(b.flexibleHourlyInterestRate) || 0,
            rate: (parseFloat(b.flexibleHourlyInterestRate) || 0) * 24 * 365 * 100,
            accruedInterest: parseFloat(ongoing?.unpaidInterest || "0"),
        };
    });

    const collateral = collateralList.map((c: any) => {
        const amount = parseFloat(c.amount) || 0;
        const amountUSD = parseFloat(c.amountUSD) || 0;
        return {
            id: c.currency || "",
            amount,
            price: amount > 0 ? amountUSD / amount : 0,
            valueUSD: amountUSD,
        };
    });

    return {
        debts,
        collateral,
        totalDebt: parseFloat(posResult.totalDebt || "0"),
        totalCollateral: parseFloat(posResult.totalCollateral || "0"),
        ltvFromExchange: parseFloat(posResult.ltv || "0") * 100,
    };
}

async function fetchBinanceLoanData(apiKey: string, apiSecret: string) {
    const [ongoingRes, _collateralRes, loanableRes] = await Promise.all([
        binanceRequest("/sapi/v2/loan/flexible/ongoing/orders", "GET", {}, apiKey, apiSecret),
        binanceRequest("/sapi/v2/loan/flexible/collateral/data", "GET", {}, apiKey, apiSecret),
        binanceRequest("/sapi/v2/loan/flexible/loanable/data", "GET", {}, apiKey, apiSecret),
    ]);
    const ongoing = ongoingRes?.rows || ongoingRes || [];
    const loanableData: any[] = loanableRes?.rows || loanableRes || [];

    // Group debts by loanCoin
    const debtMap: Record<string, { amount: number; accrued: number; loanCoin: string }> = {};
    const collateralMap: Record<string, { amount: number; collateralCoin: string }> = {};

    for (const row of ongoing) {
        const loanCoin = row.loanCoin;
        const amount = parseFloat(row.totalDebt) || 0;
        const accrued = parseFloat(row.accruedInterest) || 0;
        if (amount > 0) {
            if (!debtMap[loanCoin]) debtMap[loanCoin] = { amount: 0, accrued: 0, loanCoin };
            debtMap[loanCoin].amount += amount;
            debtMap[loanCoin].accrued += accrued;
        }
        const collCoin = row.collateralCoin;
        const collAmount = parseFloat(row.collateralAmount) || 0;
        if (collAmount > 0) {
            if (!collateralMap[collCoin]) collateralMap[collCoin] = { amount: 0, collateralCoin: collCoin };
            collateralMap[collCoin].amount += collAmount;
        }
    }

    const debts = Object.values(debtMap).map((item) => {
        const loanData = loanableData.find((l: any) => l.loanCoin === item.loanCoin);
        const interestRate = parseFloat(loanData?.flexibleInterestRate || "0");
        return {
            id: item.loanCoin,
            amount: item.amount,
            hourlyRate: interestRate / 365 / 24,
            rate: interestRate * 100,
            accruedInterest: item.accrued,
        };
    });

    // Fetch prices for collateral valuation
    const collateralCoins = Object.keys(collateralMap);
    let prices: Record<string, number> = { USDT: 1.0, USDC: 1.0 };
    if (collateralCoins.length > 0) {
        try {
            const symbols = collateralCoins.map(c => `${c}USDT`);
            const { data: tickerData } = await axios.get(
                `https://api.binance.com/api/v3/ticker/price?symbols=${encodeURIComponent(JSON.stringify(symbols))}`
            );
            for (const t of tickerData) {
                const coin = t.symbol.replace(/USDT$/, "");
                prices[coin] = parseFloat(t.price);
            }
        } catch {}
    }

    const collateral = Object.values(collateralMap).map((item) => {
        const price = prices[item.collateralCoin] || 0;
        return {
            id: item.collateralCoin,
            amount: item.amount,
            price,
            valueUSD: item.amount * price,
        };
    });

    const totalDebt = debts.reduce((sum, d) => sum + d.amount, 0);
    const totalCollateral = collateral.reduce((sum, c) => sum + c.valueUSD, 0);

    return {
        debts,
        collateral,
        totalDebt,
        totalCollateral,
        ltvFromExchange: totalCollateral > 0 ? (totalDebt / totalCollateral) * 100 : 0,
    };
}

async function writeLoanSnapshot() {
    const config = JSON.parse(BINANCE_SECRET.value() as string);
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    let bybitData: any = { debts: [], collateral: [], totalDebt: 0, totalCollateral: 0, ltvFromExchange: 0 };
    let binanceData: any = { debts: [], collateral: [], totalDebt: 0, totalCollateral: 0, ltvFromExchange: 0 };

    // Fetch Bybit data
    const bybitConfig = config.bybit;
    if (bybitConfig?.api_key && bybitConfig?.api_secret) {
        try {
            bybitData = await fetchBybitLoanData(bybitConfig.api_key, bybitConfig.api_secret);
        } catch (e: any) {
            console.error("[Snapshot] Bybit fetch failed:", e.message);
        }
    }

    // Fetch Binance data
    const binanceConfig = config.binance;
    if (binanceConfig?.api_key && binanceConfig?.api_secret) {
        try {
            binanceData = await fetchBinanceLoanData(binanceConfig.api_key, binanceConfig.api_secret);
        } catch (e: any) {
            console.error("[Snapshot] Binance fetch failed:", e.message);
        }
    }

    const snapshot = {
        date: today,
        timestamp: Date.now(),
        bybit: bybitData,
        binance: binanceData,
    };

    await db.collection("loanSnapshots").doc(today).set(snapshot);
    console.log(`[Snapshot] Written for ${today}`);
}

export const dailyLoanSnapshot = functions
    .region('europe-west1')
    .runWith({ secrets: [BINANCE_SECRET], memory: "256MB" })
    .pubsub.schedule("0 2 * * *") // 2:00 AM UTC daily
    .timeZone("UTC")
    .onRun(async () => {
        try {
            await writeLoanSnapshot();
        } catch (e) {
            console.error("[dailyLoanSnapshot] Error:", e);
        }
    });

export const testLoanSnapshot = functions
    .region('europe-west1')
    .runWith({ secrets: [BINANCE_SECRET], memory: "256MB" })
    .https.onRequest(async (_req, res) => {
        try {
            await writeLoanSnapshot();
            res.json({ ok: true, message: "Snapshot written" });
        } catch (e: any) {
            res.status(500).send(e.message);
        }
    });

export const debugAlerts = functions.region('europe-west1').runWith({ memory: "128MB" }).https.onRequest(async (req, res) => {
    const doc = await db.collection("config").doc("alerts").get();
    res.json(doc.data());
});

export const debugInversiones = functions.region('europe-west1').runWith({ memory: "128MB" }).https.onRequest(async (req, res) => {
    const snap = await db.collection("inversiones").get();
    res.json(snap.docs.map(d => d.data()));
});

export const debugLogs = functions.region('europe-west1').runWith({ memory: "128MB" }).https.onRequest(async (req, res) => {
    const snap = await db.collection("notificationLogs").orderBy("sentAt", "desc").limit(10).get();
    res.json(snap.docs.map(d => d.data()));
});

