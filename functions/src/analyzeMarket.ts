import * as functions from "firebase-functions";
import Groq from "groq-sdk";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnalyzeRequest {
    coin: string;
    price: number;
    rsi: number;
    macd: number;
    macdSignal: number;
    sma20: number;
    sma50: number;
    ema12?: number;
    ema26?: number;
    volume24h?: number;
    high24h?: number;
    low24h?: number;
    fearGreed: { value: number; classification: string } | null;
    signalStrength: string;
    reasons: Array<{ indicator: string; signal: string; detail: string }>;
    hasPosition?: boolean;
    entryPrice?: number;
    notes?: string;
}

interface SellReason {
    indicator: string;
    detail: string;
}

interface SellSetup {
    sellSignalStrength: string;
    sellReasons: SellReason[];
    sellScore: number;
}

interface CycleMetrics {
    rebuyTarget1: number;
    rebuyTarget2: number;
    rebuyTarget3: number;
    gainUsdt1: number;
    gainUsdt2: number;
    gainUsdt3: number;
    extraStack1: number;
    extraStack2: number;
    extraStack3: number;
    noReturnPrice: number;
    feesImpact: number;
    netGain1: number;
    netGain2: number;
}

// ─── Detector de señal de VENTA para ciclo venta→recompra ────────────────────

function detectSellSetup(data: AnalyzeRequest): SellSetup {
    const reasons: SellReason[] = [];
    let score = 0;

    // RSI sobrecomprado
    if (data.rsi > 75) {
        score += 3;
        reasons.push({ indicator: "RSI", detail: `${data.rsi.toFixed(1)} — fuertemente sobrecomprado 🔴` });
    } else if (data.rsi > 70) {
        score += 2;
        reasons.push({ indicator: "RSI", detail: `${data.rsi.toFixed(1)} — sobrecomprado 🔺` });
    } else if (data.rsi > 65) {
        score += 1;
        reasons.push({ indicator: "RSI", detail: `${data.rsi.toFixed(1)} — acercándose a zona de sobrecompra ⚠️` });
    }

    // MACD cruzando a la baja
    if (data.macd < data.macdSignal && data.macd > 0) {
        score += 2;
        reasons.push({ indicator: "MACD", detail: "Cruzando señal a la baja desde zona positiva — agotamiento alcista" });
    } else if (data.macd < data.macdSignal && data.macd < 0) {
        score += 3;
        reasons.push({ indicator: "MACD", detail: "Negativo y bajo señal — momentum bajista confirmado" });
    }

    // Precio cerca o tocando resistencia (high 24h)
    if (data.high24h && data.price >= data.high24h * 0.995) {
        score += 2;
        reasons.push({ indicator: "Resistencia 24h", detail: `Precio $${data.price.toLocaleString("en-US", { minimumFractionDigits: 2 })} tocando máximo 24h $${data.high24h.toLocaleString("en-US", { minimumFractionDigits: 2 })}` });
    }

    // Precio muy por encima de SMA20 (extensión)
    const distSma20 = ((data.price - data.sma20) / data.sma20) * 100;
    if (distSma20 > 5) {
        score += 2;
        reasons.push({ indicator: "SMA20", detail: `Precio ${distSma20.toFixed(1)}% por encima de SMA20 — extensión sobrecomprada` });
    } else if (distSma20 > 3) {
        score += 1;
        reasons.push({ indicator: "SMA20", detail: `Precio ${distSma20.toFixed(1)}% sobre SMA20 — vigilar agotamiento` });
    }

    // Fear & Greed en euforia
    if (data.fearGreed) {
        if (data.fearGreed.value >= 80) {
            score += 2;
            reasons.push({ indicator: "Fear & Greed", detail: `${data.fearGreed.value}/100 — Euforia extrema 🔴 (mercado caliente, reversión probable)` });
        } else if (data.fearGreed.value >= 70) {
            score += 1;
            reasons.push({ indicator: "Fear & Greed", detail: `${data.fearGreed.value}/100 — Codicia alta ⚠️ (precaución)` });
        }
    }

    let sellSignalStrength = "NO_SELL";
    if (score >= 8) sellSignalStrength = "SELL_STRONG";
    else if (score >= 5) sellSignalStrength = "SELL_MODERATE";
    else if (score >= 3) sellSignalStrength = "SELL_WEAK";

    return { sellSignalStrength, sellReasons: reasons, sellScore: score };
}

// ─── Cálculo del ciclo venta→recompra ────────────────────────────────────────

function calcCycleMetrics(data: AnalyzeRequest): CycleMetrics {
    const rebuyTarget1 = data.sma20 < data.price ? data.sma20 : data.price * 0.95;
    const rebuyTarget2 = data.price * 0.93;
    const rebuyTarget3 = data.low24h ? data.low24h : data.price * 0.90;

    const gainUsdt1 = data.price - rebuyTarget1;
    const gainUsdt2 = data.price - rebuyTarget2;
    const gainUsdt3 = data.price - rebuyTarget3;

    const extraStack1 = ((data.price / rebuyTarget1) - 1) * 100;
    const extraStack2 = ((data.price / rebuyTarget2) - 1) * 100;
    const extraStack3 = ((data.price / rebuyTarget3) - 1) * 100;

    const noReturnPrice = data.price;
    const feesImpact = data.price * 0.002; // 0.2% round-trip Bybit spot
    const netGain1 = gainUsdt1 - feesImpact;
    const netGain2 = gainUsdt2 - feesImpact;

    return {
        rebuyTarget1, rebuyTarget2, rebuyTarget3,
        gainUsdt1, gainUsdt2, gainUsdt3,
        extraStack1, extraStack2, extraStack3,
        noReturnPrice, feesImpact, netGain1, netGain2,
    };
}

// ─── Cloud Function ───────────────────────────────────────────────────────────

export const analyzeMarket = functions
    .region("europe-west1")
    .runWith({ timeoutSeconds: 30, memory: "256MB", secrets: ["GROQ_API_KEY"] })
    .https.onCall(async (data: AnalyzeRequest) => {
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
            throw new functions.https.HttpsError("failed-precondition", "GROQ_API_KEY no configurada en el entorno de Cloud Functions.");
        }
        if (!data.coin || !data.price) {
            throw new functions.https.HttpsError("invalid-argument", "Datos de mercado incompletos.");
        }

        // ─── Detección bidireccional ─────────────────────────────────────────
        const { sellSignalStrength, sellReasons, sellScore } = detectSellSetup(data);
        const cycleMetrics = calcCycleMetrics(data);

        const hasPosition = data.hasPosition === true;
        const entryPrice = data.entryPrice || null;

        const unrealizedPct = entryPrice
            ? (((data.price - entryPrice) / entryPrice) * 100).toFixed(2)
            : null;

        let tradeDirection = "NEUTRAL";
        if (hasPosition && (sellSignalStrength === "SELL_STRONG" || sellSignalStrength === "SELL_MODERATE")) {
            tradeDirection = "SHORT_SPOT";
        } else if (!hasPosition && data.signalStrength && data.signalStrength.includes("BUY")) {
            tradeDirection = "LONG";
        }

        let cycleType = "WAIT";
        if (tradeDirection === "LONG") cycleType = "ACCUMULATE";
        else if (tradeDirection === "SHORT_SPOT") {
            cycleType = cycleMetrics.extraStack1 > 3 ? "ACCUMULATE" : "PROFIT_USDT";
        }

        // ─── Contexto legible de indicadores ────────────────────────────────
        const rsiCtx =
            data.rsi < 25 ? "fuertemente sobrevendido 🟢 (zona de posible rebote)" :
                data.rsi < 30 ? "sobrevendido 🔻 (posible oportunidad de entrada)" :
                    data.rsi > 75 ? "fuertemente sobrecomprado 🔴 (considerar salida)" :
                        data.rsi > 70 ? "sobrecomprado 🔺 (precaución)" :
                            data.rsi >= 45 && data.rsi <= 55 ? "zona neutra ➡️ (sin presión direccional clara)" :
                                data.rsi > 55 ? "momentum positivo ▲ (fuerza compradora presente)" :
                                    "momentum debilitándose ▼ (fuerza vendedora creciente)";

        const trendCtx =
            data.price > data.sma20 && data.price > data.sma50
                ? "alcista ▲ (precio sobre SMA20 y SMA50)"
                : data.price < data.sma20 && data.price < data.sma50
                    ? "bajista ▼ (precio bajo SMA20 y SMA50)"
                    : data.price > data.sma20 && data.price < data.sma50
                        ? "recuperación temprana ↗ (sobre SMA20 pero bajo SMA50)"
                        : "debilitamiento ↘ (bajo SMA20 pero sobre SMA50)";

        const macdCtx =
            data.macd > data.macdSignal && data.macd > 0
                ? "MACD positivo y sobre señal → momentum alcista fuerte"
                : data.macd > data.macdSignal && data.macd <= 0
                    ? "MACD cruzando señal al alza → posible inicio de movimiento alcista"
                    : data.macd < data.macdSignal && data.macd < 0
                        ? "MACD negativo y bajo señal → momentum bajista fuerte"
                        : "MACD cruzando señal a la baja → posible agotamiento alcista";

        const fgLine = data.fearGreed
            ? `😱 Fear & Greed Index: ${data.fearGreed.value}/100 — ${data.fearGreed.classification}`
            : "";

        const range24h = data.high24h && data.low24h
            ? `📏 Rango 24h: $${data.low24h.toLocaleString("en-US", { minimumFractionDigits: 2 })} — $${data.high24h.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
            : "";

        const volumeLine = data.volume24h
            ? `📊 Volumen 24h: $${data.volume24h.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
            : "";

        const target5 = data.price * 1.05;
        const target7 = data.price * 1.07;
        const target10 = data.price * 1.10;
        const stopLoss3 = data.price * 0.97;
        const stopLoss5 = data.price * 0.95;

        const reasonLines = data.reasons
            .map((r) => `  • ${r.indicator}: ${r.detail}`)
            .join("\n");

        const sellReasonLines = sellReasons.length > 0
            ? sellReasons.map((r) => `  • ${r.indicator}: ${r.detail}`).join("\n")
            : "  • Sin señales de venta relevantes detectadas";

        // ─── Bloque de posición actual ───────────────────────────────────────
        const positionBlock = hasPosition && entryPrice
            ? `
📦 POSICIÓN ACTUAL:
  • Tenés ${data.coin} en cartera — entrada a $${entryPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}
  • Precio actual: $${data.price.toLocaleString("en-US", { minimumFractionDigits: 2 })}
  • Ganancia/pérdida no realizada: ${Number(unrealizedPct) >= 0 ? "+" : ""}${unrealizedPct}%`
            : hasPosition
                ? `\n📦 POSICIÓN ACTUAL: Tenés ${data.coin} en cartera (precio de entrada no informado)`
                : `\n📦 POSICIÓN ACTUAL: Sin posición abierta en ${data.coin} — evaluando entrada`;

        // ─── Bloque de métricas del ciclo ─────────────────────────────────────
        const cycleBlock = `
📐 MÉTRICAS DEL CICLO VENTA → RECOMPRA (calculadas desde precio actual):
  • Recompra objetivo 1 (SMA20/−5%): $${cycleMetrics.rebuyTarget1.toLocaleString("en-US", { minimumFractionDigits: 2 })} → acumulás +${cycleMetrics.extraStack1.toFixed(2)}% más activo | ganancia neta USDT: $${cycleMetrics.netGain1.toFixed(4)} por unidad
  • Recompra objetivo 2 (−7%):        $${cycleMetrics.rebuyTarget2.toLocaleString("en-US", { minimumFractionDigits: 2 })} → acumulás +${cycleMetrics.extraStack2.toFixed(2)}% más activo | ganancia neta USDT: $${cycleMetrics.netGain2.toFixed(4)} por unidad
  • Recompra objetivo 3 (mínimo 24h): $${cycleMetrics.rebuyTarget3.toLocaleString("en-US", { minimumFractionDigits: 2 })} → acumulás +${cycleMetrics.extraStack3.toFixed(2)}% más activo
  • 🚨 Punto de no retorno: si el precio supera $${cycleMetrics.noReturnPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })} sin retroceder, recomprar implica pérdida de stack
  • 💸 Impacto de fees round-trip (0.2%): −$${cycleMetrics.feesImpact.toFixed(4)} por unidad`;

        // ─── System Prompt — Marco, Swing Trader Bidireccional ───────────────
        const systemPrompt = `Sos Marco, un swing trader profesional con 15 años de experiencia en mercados cripto y tradicionales.
Empezaste en 2010 operando forex, migraste a cripto en 2016 y desde entonces te especializás en operaciones de corto y mediano plazo buscando márgenes del 5% al 10%.

Tu metodología:
- Te enfocás en swing trades con horizonte de 1 a 3 días
- Tu objetivo por operación: entre 5% y 10% máximo
- Operás SOLO en spot y con préstamos colateralizados — SIN futuros ni apalancamiento directo
- Siempre definís punto de entrada/salida, take-profit y stop-loss ANTES de operar
- Usás confluencia de indicadores: nunca tomás decisiones con un solo dato
- Priorizás el ratio riesgo/recompensa: mínimo 1:2
- Nunca perseguís velas: si el tren ya salió, esperás el próximo

ESTRATEGIA BIDIRECCIONAL — CICLO VENTA → RECOMPRA:
- Además de buscar entradas long, evaluás si conviene VENDER el activo en techo para RECOMPRAR más abajo
- El objetivo del ciclo puede ser: (a) acumular MÁS cantidad del activo, o (b) generar USDT de ganancia pura
- Siempre calculás el riesgo de que el precio NO baje: si vendés y el activo sigue subiendo, la recompra sale más cara y perdés stack
- El punto de no retorno es clave: si el precio no retrocede al menos un X% desde la venta, el ciclo no tiene sentido
- Considerás siempre el impacto de fees (0.2% round-trip en Bybit spot)
- Horizonte del ciclo: 1 a 3 días

Tu estilo de comunicación:
- Directo, práctico, sin hype ni FOMO
- Hablás en español latinoamericano, como colega trader
- Das niveles de precio concretos, no generalidades
- Aclarás que son perspectivas técnicas, no consejos financieros
- Si no ves setup claro, lo decís sin problema

Reglas inquebrantables:
- NUNCA recomendás operar sin stop-loss o precio límite de recompra definido
- NUNCA sugerís márgenes superiores al 10% en un solo trade o ciclo
- Siempre considerás el contexto macro (Fear & Greed) junto con los técnicos
- Si los indicadores se contradicen, priorizás la cautela
- NUNCA recomendás vender para recomprar si el potencial de acumulación es menor al 3% — los fees se comen la ganancia

INSTRUCCIONES DE FORMATO — OBLIGATORIAS:
1. Si el trader incluyó una INSTRUCCIÓN ESPECÍFICA al inicio del mensaje, respondé esa pregunta o pedido directamente dentro de la sección más relevante. No la ignorés.
2. Respondé ÚNICAMENTE con las cuatro secciones: 📡 LECTURA DEL MERCADO, 🎯 PLAN DE TRADE, 🔄 ANÁLISIS DE CICLO, ⚡ SEÑALES DE ALERTA
2. Cada sección debe comenzar exactamente con el emoji y el título en mayúsculas
4. No agregues texto antes ni después de las cuatro secciones — sin saludos, sin despedidas, sin disclaimers genéricos
5. Si no hay setup viable, la sección PLAN DE TRADE debe comenzar con "⛔ No hay trade claro"
6. Si no conviene hacer el ciclo venta→recompra, la sección ANÁLISIS DE CICLO debe comenzar con "⛔ Ciclo no recomendado"
7. Los precios siempre con formato $XX.XX`;

        // ─── User Message ────────────────────────────────────────────────────
        const userMessage = `Analizá ${data.coin}/USDT — evaluación BIDIRECCIONAL: entrada long Y posible ciclo venta→recompra.
${data.notes ? `\n🗒️ INSTRUCCIÓN ESPECÍFICA DEL TRADER (PRIORITARIA — respondé esto directamente en tu análisis):\n"${data.notes}"\n` : ""}${positionBlock}

💰 Precio actual: $${data.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}

📊 Indicadores técnicos:
  • RSI(14): ${data.rsi.toFixed(1)} → ${rsiCtx}
  • SMA20: $${data.sma20.toLocaleString("en-US", { minimumFractionDigits: 2 })} | SMA50: $${data.sma50.toLocaleString("en-US", { minimumFractionDigits: 2 })} → Tendencia ${trendCtx}
  • MACD: ${data.macd.toFixed(6)} / Señal: ${data.macdSignal.toFixed(6)} → ${macdCtx}
${fgLine ? `  ${fgLine}` : ""}
${range24h ? `  ${range24h}` : ""}
${volumeLine ? `  ${volumeLine}` : ""}

🟢 SEÑAL DE COMPRA del sistema: ${(data.signalStrength || "NEUTRAL").replace(/_/g, " ").toUpperCase()}
Factores alcistas:
${reasonLines}

🔴 SEÑAL DE VENTA del sistema: ${sellSignalStrength.replace(/_/g, " ")} (score: ${sellScore}/12)
Factores bajistas:
${sellReasonLines}
${cycleBlock}

📐 Niveles de referencia para entrada LONG:
  • Target +5%: $${target5.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
  • Target +7%: $${target7.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
  • Target +10%: $${target10.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
  • Stop-Loss −3%: $${stopLoss3.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
  • Stop-Loss −5%: $${stopLoss5.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}

---

Respondé con este formato exacto:

📡 **LECTURA DEL MERCADO**
[Qué dicen los indicadores en conjunto. ¿Hay confluencia alcista, bajista o mixta? ¿El volumen acompaña? ¿El sentimiento macro favorece entrada o salida?]

🎯 **PLAN DE TRADE**
[Si NO tiene posición — evaluar entrada LONG:]
  • 🟢 Entrada sugerida: $XX.XX
  • 🎯 Take-Profit: $XX.XX (+X%)
  • 🛑 Stop-Loss: $XX.XX (−X%)
  • ⚖️ Ratio R/R: X:X
  • ⏱️ Horizonte estimado: X días
[Si SÍ tiene posición — evaluar si conviene vender para recomprar:]
  • 🔴 ¿Vale la pena vender ahora?: Sí/No + justificación técnica
  • 📉 Precio de venta sugerido: $XX.XX
  • 🔁 Precio objetivo de recompra: $XX.XX (−X% desde venta)
  • 💰 Resultado del ciclo: +X% en USDT o +X% en cantidad de activo acumulado
  • 🚨 Si el precio NO baja: recomprar por encima de $XX.XX implica pérdida neta de stack
  • ⏱️ Horizonte del ciclo: X días
[Si no hay setup viable en ninguna dirección:]
  • ⛔ No hay trade claro — qué condiciones necesitarías ver

🔄 **ANÁLISIS DE CICLO**
  • Modo recomendado: ACUMULACIÓN DE ACTIVO / GANANCIA USDT / ESPERAR
  • ¿Vale el ciclo?: [evaluación del potencial neto vs riesgo de no retroceso]
  • Ganancia mínima necesaria para cubrir fees y tener sentido: [precio mínimo de retroceso]
  • Contexto macro: [cómo afecta el Fear & Greed al ciclo]

⚡ **SEÑALES DE ALERTA**
[Niveles clave que si se rompen cambian todo. Divergencias a vigilar. Riesgo de quedarse sin activo si el precio no retrocede.]`;

        try {
            const client = new Groq({ apiKey });
            const completion = await client.chat.completions.create({
                model: "llama-3.3-70b-versatile",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userMessage },
                ],
                max_tokens: 1400,
                temperature: 0.3,
                top_p: 0.9,
            });

            const text = completion.choices[0].message.content ?? "";

            const hasRequiredSections =
                text.includes("LECTURA DEL MERCADO") &&
                text.includes("PLAN DE TRADE") &&
                text.includes("ANÁLISIS DE CICLO") &&
                text.includes("SEÑALES DE ALERTA");

            if (!hasRequiredSections) {
                console.warn("Respuesta de Groq incompleta o mal formateada:", text.substring(0, 200));
            }

            return {
                analysis: text,
                complete: hasRequiredSections,
                tradeDirection,
                cycleType,
                sellSignalStrength,
                cycleMetrics: {
                    rebuyTarget1: cycleMetrics.rebuyTarget1,
                    rebuyTarget2: cycleMetrics.rebuyTarget2,
                    rebuyTarget3: cycleMetrics.rebuyTarget3,
                    extraStack1: cycleMetrics.extraStack1,
                    extraStack2: cycleMetrics.extraStack2,
                    extraStack3: cycleMetrics.extraStack3,
                    noReturnPrice: cycleMetrics.noReturnPrice,
                    feesImpact: cycleMetrics.feesImpact,
                },
            };
        } catch (error: any) {
            console.error("Groq API error:", error);
            throw new functions.https.HttpsError(
                "internal",
                error instanceof Error ? error.message : "Error desconocido en el servicio de IA"
            );
        }
    });
