import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import axios from "axios";
import { defineSecret } from "firebase-functions/params";
import { evaluateGlobalCrossings, LevelState } from "./futuresGlobalCrossings";
import { sendTelegramMessage } from "./telegram";

const binanceConfigRaw = defineSecret("FUNCTIONS_CONFIG_EXPORT");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sign(queryString: string, secret: string): string {
    return crypto.createHmac("sha256", secret).update(queryString).digest("hex");
}

async function binanceGet(
    path: string,
    params: Record<string, string>,
    apiKey: string,
    apiSecret: string
): Promise<any> {
    const timestamp = Date.now();
    const qs = new URLSearchParams({
        ...params,
        timestamp: String(timestamp),
        recvWindow: "5000",
    }).toString();
    const signature = sign(qs, apiSecret);
    const url = `https://fapi.binance.com${path}?${qs}&signature=${signature}`;
    const { data } = await axios.get(url, {
        headers: { "X-MBX-APIKEY": apiKey },
        timeout: 10000,
    });
    return data;
}

async function sendTelegram(text: string): Promise<boolean> {
    return sendTelegramMessage(text);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface FuturesPosition {
    symbol: string;
    side: "LONG" | "SHORT";
    size: number;
    notional: number;
    entryPrice: number;
    markPrice: number;
    liquidationPrice: number;
    leverage: number;
    unrealizedPnl: number;
    initialMargin: number;
    maintMargin: number;
    marginType: string;
    breakEvenPrice: number;
    distToLiqPercent: number;
    roe: number;
    updateTime: number;
    fundingRate: number;
}

interface FuturesAccount {
    totalWalletBalance: number;
    totalUnrealizedProfit: number;
    totalMarginBalance: number;
    totalInitialMargin: number;
    totalMaintMargin: number;
    availableBalance: number;
    maxWithdrawAmount: number;
    marginRatio: number;
}

interface FuturesData {
    account: FuturesAccount;
    positions: FuturesPosition[];
    lastSync: number;
}

interface FuturesPositionAlert {
    type: "roe" | "price";
    targetValue: number;
    direction: "up" | "down";
    isPersistent: boolean;
    note?: string;
    _lastSide?: "above" | "below";
}

interface FuturesGlobalAlertRule {
    targetAmount: number;
    direction?: "up" | "down";
    isPersistent?: boolean;
    note?: string;
    _lastSide?: "above" | "below";
}

interface FuturesAlertConfig {
    enabled: boolean;
    marginThresholds: number[];
    positionAlerts: Record<string, FuturesPositionAlert[]>;
    globalAlerts?: FuturesGlobalAlertRule[];
    _lastAlertedMargin: number | null;
    _globalAlertsDirectionsMigrated?: boolean;
}

// ─── Core Logic ───────────────────────────────────────────────────────────────

async function runFuturesSync(): Promise<FuturesData | null> {
    const bConfig = JSON.parse(binanceConfigRaw.value()).binance;
    if (!bConfig?.api_key || !bConfig?.api_secret) {
        console.error("[FuturesSync] Binance API keys not configured.");
        return null;
    }

    const { api_key: apiKey, api_secret: apiSecret } = bConfig;

    try {
        // Call both endpoints in parallel
        const [accountRes, positionRes] = await Promise.all([
            binanceGet("/fapi/v3/account", {}, apiKey, apiSecret),
            binanceGet("/fapi/v2/positionRisk", {}, apiKey, apiSecret),
        ]);

        // Build position risk map
        const positionMap = new Map<string, any>();
        for (const p of positionRes) {
            if (parseFloat(p.positionAmt) !== 0) {
                positionMap.set(p.symbol, p);
            }
        }

        // Enrich positions with risk data
        const positions: FuturesPosition[] = accountRes.positions
            .filter((p: any) => parseFloat(p.positionAmt) !== 0)
            .map((p: any) => {
                const risk = positionMap.get(p.symbol) || {};
                const entryPrice = parseFloat(risk.entryPrice || "0");
                const markPrice = parseFloat(risk.markPrice || "0");
                const liqPrice = parseFloat(risk.liquidationPrice || "0");
                const unrealizedPnl = parseFloat(p.unrealizedProfit);

                // Distance to liquidation % (absolute distance per side)
                let distToLiqPercent = 0;
                if (liqPrice > 0 && markPrice > 0) {
                    if (parseFloat(p.positionAmt) > 0) {
                        // LONG: price must drop to hit liquidation
                        distToLiqPercent = ((markPrice - liqPrice) / markPrice) * 100;
                    } else {
                        // SHORT: price must rise to hit liquidation
                        distToLiqPercent = ((liqPrice - markPrice) / markPrice) * 100;
                    }
                }

                // ROE = PnL / initialMargin * 100
                const initialMargin = parseFloat(p.initialMargin);
                const roe = initialMargin > 0 ? (unrealizedPnl / initialMargin) * 100 : 0;

                return {
                    symbol: p.symbol,
                    side: parseFloat(p.positionAmt) > 0 ? "LONG" : "SHORT",
                    size: Math.abs(parseFloat(p.positionAmt)),
                    notional: Math.abs(parseFloat(p.notional)),
                    entryPrice,
                    markPrice,
                    liquidationPrice: liqPrice,
                    leverage: parseInt(risk.leverage || "1"),
                    unrealizedPnl,
                    initialMargin,
                    maintMargin: parseFloat(p.maintMargin),
                    marginType: risk.marginType || "cross",
                    breakEvenPrice: parseFloat(risk.breakEvenPrice || "0"),
                    distToLiqPercent,
                    roe,
                    updateTime: p.updateTime,
                    fundingRate: parseFloat(risk.lastFundingRate || "0"),
                };
            });

        // Account summary
        const totalWalletBalance = parseFloat(accountRes.totalWalletBalance);
        const totalUnrealizedProfit = parseFloat(accountRes.totalUnrealizedProfit);
        const totalMarginBalance = parseFloat(accountRes.totalMarginBalance);
        const totalInitialMargin = parseFloat(accountRes.totalInitialMargin);
        const totalMaintMargin = parseFloat(accountRes.totalMaintMargin);
        const availableBalance = parseFloat(accountRes.availableBalance);

        const marginRatio = totalMarginBalance > 0
            ? (totalMaintMargin / totalMarginBalance) * 100
            : 0;

        const account: FuturesAccount = {
            totalWalletBalance,
            totalUnrealizedProfit,
            totalMarginBalance,
            totalInitialMargin,
            totalMaintMargin,
            availableBalance,
            maxWithdrawAmount: parseFloat(accountRes.maxWithdrawAmount),
            marginRatio,
        };

        const futuresData: FuturesData = {
            account,
            positions,
            lastSync: Date.now(),
        };

        // Save to Firestore
        await admin.firestore().collection("settings").doc("futuresData").set(futuresData);

        // Check alerts
        await checkFuturesAlerts(futuresData);

        return futuresData;
    } catch (e: any) {
        const errData = e.response?.data || { message: e.message };
        console.error("[FuturesSync] Binance API error:", errData);
        return null;
    }
}

function formatSignedUsd(value: number): string {
    return `${value >= 0 ? "+" : "-"}$${Math.abs(value).toFixed(2)}`;
}

// ─── Alert Logic ──────────────────────────────────────────────────────────────

async function checkFuturesAlerts(data: FuturesData): Promise<void> {
    // Read alert config from Firestore
    const configSnap = await admin.firestore().collection("config").doc("alerts").get();
    const conf = configSnap.exists ? configSnap.data()! : {};

    const futuresAlerts: FuturesAlertConfig = conf.futuresAlerts || {
        enabled: true,
        marginThresholds: [70, 80, 90],
        positionAlerts: {},
        _lastAlertedMargin: null,
    };

    if (!futuresAlerts.enabled) return;

    const marginPercent = data.account.marginRatio;
    const messages: string[] = [];

    // Check margin thresholds
    const thresholds = futuresAlerts.marginThresholds.sort((a, b) => b - a);
    let highestTriggered: number | null = null;

    for (const threshold of thresholds) {
        if (marginPercent >= threshold) {
            highestTriggered = threshold;
            break;
        }
    }

    // Only alert if we crossed a new threshold (or first time)
    if (highestTriggered !== null && highestTriggered !== futuresAlerts._lastAlertedMargin) {
        const emoji = highestTriggered >= 90 ? "🔴" : highestTriggered >= 80 ? "🟠" : "🟡";
        messages.push(
            `${emoji} *ALERTA MARGEN — Binance Futures*\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `Margen utilizado: *${marginPercent.toFixed(1)}%*\n` +
            `Disponible: *$${data.account.availableBalance.toFixed(2)}*\n` +
            `PnL total: *${data.account.totalUnrealizedProfit >= 0 ? "+" : ""}$${data.account.totalUnrealizedProfit.toFixed(2)}*\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `Buffer a liquidación: *${(100 - marginPercent).toFixed(1)}%*`
        );
        futuresAlerts._lastAlertedMargin = highestTriggered;
    } else if (highestTriggered === null) {
        futuresAlerts._lastAlertedMargin = null;
    }

    // Check per-position ROE/ROE USD alerts
    const positionAlerts = futuresAlerts.positionAlerts || {};
    futuresAlerts.positionAlerts = positionAlerts;

    for (const pos of data.positions) {
        const alertsForSymbol = positionAlerts[pos.symbol];
        if (!alertsForSymbol || alertsForSymbol.length === 0) continue;

        const remaining: FuturesPositionAlert[] = [];

        for (const alert of alertsForSymbol) {
            let currentValue: number;
            let alertLabel: string;

            if (alert.type === "roe") {
                currentValue = pos.roe;
                alertLabel = `ROE % ${alert.direction === "up" ? ">=" : "<="} ${alert.targetValue}%`;
            } else {
                currentValue = pos.unrealizedPnl;
                alertLabel = `ROE USD ${alert.direction === "up" ? ">=" : "<="} $${alert.targetValue}`;
            }

            // Determine which side of threshold we're on
            const currentSide: "above" | "below" =
                alert.direction === "up"
                    ? (currentValue >= alert.targetValue ? "above" : "below")
                    : (currentValue <= alert.targetValue ? "above" : "below");

            const prevSide = alert._lastSide;

            // Trigger: condition met AND (not persistent OR crossing for first time OR crossed to other side)
            const isTriggered =
                currentSide === "above" &&
                (!alert.isPersistent || prevSide === undefined || prevSide !== currentSide);

            if (isTriggered) {
                const emoji = alert.direction === "up" ? "🟢" : "🔴";
                const valueStr =
                    alert.type === "roe"
                        ? `${currentValue >= 0 ? "+" : ""}${currentValue.toFixed(1)}%`
                        : `${currentValue >= 0 ? "+" : ""}$${currentValue.toFixed(2)}`;

                const pnlStr = alert.type === "roe"
                    ? `${pos.unrealizedPnl >= 0 ? "+" : ""}$${pos.unrealizedPnl.toFixed(2)}`
                    : `${pos.roe >= 0 ? "+" : ""}${pos.roe.toFixed(2)}%`;

                messages.push(
                    `${emoji} *${pos.symbol}* — Alerta de ${alert.type === "roe" ? "ROE %" : "ROE USD"}\n` +
                    `Valor actual: *${valueStr}*\n` +
                    `Meta: ${alertLabel}\n` +
                    `PnL: ${pnlStr}` +
                    (alert.note ? `\n_${alert.note}_` : "")
                );

                // One-shot: delete after firing. Persistent: keep with updated _lastSide.
                if (alert.isPersistent) {
                    remaining.push({ ...alert, _lastSide: currentSide });
                } else {
                    console.log(`[FuturesSync] One-shot alert for ${pos.symbol} (${alertLabel}) fired and removed.`);
                }
            } else if (alert.isPersistent) {
                // Track _lastSide even when not triggered for future crossing detection
                remaining.push({ ...alert, _lastSide: currentSide });
            } else {
                // One-shot alert not yet triggered: keep waiting
                remaining.push(alert);
            }
        }

        if (remaining.length === 0) {
            delete positionAlerts[pos.symbol];
        } else {
            positionAlerts[pos.symbol] = remaining;
        }
    }

    // ── Global futures PNL crossings (either direction, with hysteresis) ───────
    // State lives in its own document (futuresAlertState/global) — the frontend never
    // touches it, so a UI save of config/alerts cannot wipe the crossing state.
    const futuresGlobalPnl = data.account.totalUnrealizedProfit;
    const globalRules: FuturesGlobalAlertRule[] = futuresAlerts.globalAlerts || [];
    const levels = Array.from(
        new Set(globalRules.map((r) => r.targetAmount).filter((v) => Number.isFinite(v)))
    );

    const stateRef = admin.firestore().collection("futuresAlertState").doc("global");
    const stateSnap = await stateRef.get();
    const stateData: any = stateSnap.exists ? stateSnap.data() || {} : {};
    const levelsState: Record<string, LevelState> = stateData.levels || {};
    const lastPnl: number | undefined = typeof stateData.lastPnl === "number" ? stateData.lastPnl : undefined;

    const { crossings, newState } = evaluateGlobalCrossings(levels, levelsState, futuresGlobalPnl);

    // Persist the crossing state BEFORE notifying, so a retry/crash can never
    // re-send the same crossing on the next cycle.
    await stateRef.set({ levels: newState, lastPnl: futuresGlobalPnl });

    if (crossings.length > 0) {
        const sense: "up" | "down" = futuresGlobalPnl >= (lastPnl ?? futuresGlobalPnl) ? "up" : "down";
        const ordered = [...crossings].sort((a, b) =>
            sense === "up" ? a.level - b.level : b.level - a.level
        );

        const notesByLevel = new Map<number, string>();
        for (const rule of globalRules) {
            const note = (rule.note || "").trim();
            if (!note) continue;
            const existing = notesByLevel.get(rule.targetAmount);
            notesByLevel.set(rule.targetAmount, existing ? `${existing} / ${note}` : note);
        }

        // Formato VIEJO del mensaje (una línea por nivel, sin separadores ni contador).
        const header = sense === "up"
            ? `🚨 *PNL Futuros* alcanzó *${formatSignedUsd(futuresGlobalPnl)}*`
            : `📉 *PNL Futuros* cayó a *${formatSignedUsd(futuresGlobalPnl)}*`;
        const details = ordered.map((c) => {
            const note = notesByLevel.get(c.level);
            const detail = c.dir === "up"
                ? `(Meta: 🔼 >= ${formatSignedUsd(c.level)})`
                : `(Límite: 🔽 <= ${formatSignedUsd(c.level)})`;
            return detail + (note ? `\n_📝 ${note}_` : "");
        });

        // Un cruce ⇒ texto IDÉNTICO al viejo (una sola línea). Varios ⇒ cabecera + una línea por nivel.
        messages.push(
            details.length === 1 ? `${header} ${details[0]}` : `${header}\n${details.join("\n")}`
        );

        console.log(
            `[FuturesSync] Global crossings: ${ordered.map((c) => `${c.dir} ${c.level}`).join(", ")} ` +
            `(PNL ${futuresGlobalPnl.toFixed(2)})`
        );

        // One-shot alerts (isPersistent === false): remove them with a transaction so a
        // concurrent UI save is never clobbered by a blind overwrite of globalAlerts.
        const crossedTargets = new Set(ordered.map((c) => c.level));
        const configRef = admin.firestore().collection("config").doc("alerts");
        await admin.firestore().runTransaction(async (tx) => {
            const snap = await tx.get(configRef);
            if (!snap.exists) return;
            const current: FuturesGlobalAlertRule[] =
                (snap.data()?.futuresAlerts?.globalAlerts as FuturesGlobalAlertRule[]) || [];
            const remaining = current.filter(
                (r) => !(!r.isPersistent && crossedTargets.has(r.targetAmount))
            );
            if (remaining.length === current.length) return;
            tx.update(configRef, { "futuresAlerts.globalAlerts": remaining });
            console.log(`[FuturesSync] Removed ${current.length - remaining.length} one-shot global alert(s)`);
        });
    }

    // Send messages
    for (const msg of messages) {
        await sendTelegram(msg);
    }

    // Save updated alert state. globalAlerts is owned by the UI + futuresAlertState/global,
    // so it is never rewritten here (avoids the old read-modify-write race).
    delete futuresAlerts.globalAlerts;
    await admin.firestore().collection("config").doc("alerts").set({ futuresAlerts }, { merge: true });
}

// ─── Cloud Function (scheduled every 3 minutes) ──────────────────────────────

export const futuresSync = functions
    .region("europe-west1")
    .runWith({ secrets: ["TELEGRAM_TOKEN", "TELEGRAM_CHAT_ID", "FUNCTIONS_CONFIG_EXPORT"] })
    .pubsub.schedule("every 3 minutes")
    .onRun(async () => {
        try {
            console.log("[FuturesSync] Starting...");
            const data = await runFuturesSync();
            if (data) {
                console.log(
                    `[FuturesSync] Done. Positions: ${data.positions.length}, ` +
                    `Margin ratio: ${data.account.marginRatio.toFixed(1)}%, ` +
                    `PnL: ${data.account.totalUnrealizedProfit.toFixed(2)}`
                );
            }
        } catch (e) {
            console.error("[FuturesSync] Error:", e);
        }
    });
