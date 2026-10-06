// ─── Candle Alerts (pure evaluation) ─────────────────────────────────────────
//
// Funciones puras: sin Firestore, sin Telegram, sin fetch.
// La regla de negocio es "una notificación por vela y regla":
//   - up   → changePct >=  targetPercent
//   - down → changePct <= -targetPercent
// y sólo se avisa si esa vela (openTime) todavía no fue notificada para esa regla.
// El estado persistido es la última openTime notificada por ruleKey.

export interface CandleAlertRuleInput {
    coin: string;
    interval: string;
    direction: 'up' | 'down';
    /** Número positivo: el signo lo aporta `direction`. */
    targetPercent: number;
    isPersistent?: boolean;
    note?: string;
}

export interface CandleSnapshot {
    openTime: number;
    /** (close - open) / open * 100 de la vela en curso. */
    changePct: number;
    /** Sólo para el texto del mensaje. */
    open?: number;
    close?: number;
}

/** Clave: `${coin}|${interval}` */
export type CandleMap = Record<string, CandleSnapshot>;

export interface CandleRuleState {
    lastNotifiedOpenTime: number;
}

/** Clave: `${coin}|${interval}|${direction}|${targetPercent}` */
export type CandleState = Record<string, CandleRuleState>;

export interface CandleNotification {
    ruleKey: string;
    coin: string;
    interval: string;
    direction: 'up' | 'down';
    targetPercent: number;
    changePct: number;
    notes: string[];
    /** Precio de apertura de la vela (undefined si el llamador no lo aportó). */
    open?: number;
    /** Precio de cierre de la vela (undefined si el llamador no lo aportó). */
    close?: number;
}

export function candleRuleKey(
    coin: string,
    interval: string,
    direction: 'up' | 'down',
    targetPercent: number
): string {
    return `${coin}|${interval}|${direction}|${targetPercent}`;
}

export function candleMapKey(coin: string, interval: string): string {
    return `${coin}|${interval}`;
}

function isConditionMet(direction: 'up' | 'down', changePct: number, targetPercent: number): boolean {
    return direction === 'up' ? changePct >= targetPercent : changePct <= -targetPercent;
}

export function evaluateCandleRules(
    rules: CandleAlertRuleInput[],
    candles: CandleMap,
    state: CandleState,
    seedOnly: boolean
): { notifications: CandleNotification[]; newState: CandleState } {
    const prev: CandleState = state || {};
    const newState: CandleState = {};
    const notifications: CandleNotification[] = [];

    for (const rule of rules) {
        const ruleKey = candleRuleKey(rule.coin, rule.interval, rule.direction, rule.targetPercent);

        // Reglas duplicadas (misma clave) colapsan a una sola: un único aviso y notas fusionadas.
        const already = newState[ruleKey];
        const notes = already
            ? notifications.find((n) => n.ruleKey === ruleKey)?.notes ?? []
            : [];
        if (!already) {
            // Primera vez que vemos esta clave en la corrida: heredamos la última vela notificada.
            newState[ruleKey] = { lastNotifiedOpenTime: prev[ruleKey]?.lastNotifiedOpenTime ?? 0 };
        }
        if (rule.note && notes.indexOf(rule.note) === -1) notes.push(rule.note);

        const candle = candles[candleMapKey(rule.coin, rule.interval)];
        // Sin vela (fetch falló): se salta la regla y se conserva su estado anterior.
        if (!candle) continue;

        const met = isConditionMet(rule.direction, candle.changePct, rule.targetPercent);

        // Semilla (primer run tras el deploy, doc de estado inexistente):
        // se absorbe la vela en curso sin notificar, para no inundar de avisos retroactivos.
        if (seedOnly) {
            if (met && candle.openTime > newState[ruleKey].lastNotifiedOpenTime) {
                newState[ruleKey] = { lastNotifiedOpenTime: candle.openTime };
            }
            continue;
        }

        const alreadyNotified = newState[ruleKey].lastNotifiedOpenTime === candle.openTime;
        if (!met || alreadyNotified) continue;

        newState[ruleKey] = { lastNotifiedOpenTime: candle.openTime };
        notifications.push({
            ruleKey,
            coin: rule.coin,
            interval: rule.interval,
            direction: rule.direction,
            targetPercent: rule.targetPercent,
            changePct: candle.changePct,
            notes,
            open: candle.open,
            close: candle.close,
        });
    }

    return { notifications, newState };
}
