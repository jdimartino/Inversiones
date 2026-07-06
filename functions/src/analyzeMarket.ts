import * as functions from "firebase-functions/v1";
import Groq from "groq-sdk";
import axios from "axios";

// ─── Types ────────────────────────────────────────────────────────────────────

interface NewsItem {
    title: string;
    source: string;
    sentiment: "positive" | "negative" | "neutral";
    url?: string;
}

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
    volumeRatio?: number;
    dailySignal?: string;
    timeframeAgree?: boolean;
    // NUEVOS CAMPOS
    news?: NewsItem[];
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

// ─── Fetch crypto news from CryptoPanic (free tier) ───────────────────────────

async function fetchNews(coin: string): Promise<NewsItem[]> {
    try {
        const symbol = coin.toLowerCase();
        // CryptoPanic free API — pública, sin key
        const res = await axios.get(
            `https://cryptopanic.com/api/free/v1/posts/?currencies=${symbol}&kind=news&filter=hot&regions=en`,
            { timeout: 8000 }
        );
        const items = res.data?.results ?? [];
        return items.slice(0, 8).map((item: any) => ({
            title: item.title || "",
            source: item.source?.title || "Unknown",
            sentiment: item.votes
                ? (item.votes.positive > item.votes.negative ? "positive" : item.votes.negative > item.votes.positive ? "negative" : "neutral")
                : "neutral",
            url: item.url,
        }));
    } catch {
        return [];
    }
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

        // ─── Fetch news if not provided ────────────────────────────────────
        const fetchedNews = (!data.news || data.news.length === 0)
            ? await fetchNews(data.coin)
            : null;
        const newsItems = data.news && data.news.length > 0 ? data.news : (fetchedNews ?? []);

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

        const volumeRatioLine = data.volumeRatio !== undefined
            ? `📊 Ratio volumen vs promedio 20p: ${data.volumeRatio.toFixed(2)}x${data.volumeRatio >= 2 ? " — alta convicción" : data.volumeRatio < 0.5 ? " — volumen bajo (movimiento sin respaldo)" : " — volumen normal"}`
            : "";

        const dailySignalLine = data.dailySignal
            ? `📅 Señal DIARIA (1D): ${data.dailySignal.replace(/_/g, " ").toUpperCase()}`
            : "";

        const timeframeAgreeLine = data.timeframeAgree
            ? `🔁 Doble confirmación 1H + 1D: señales alineadas en ambos timeframes — mayor fiabilidad`
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
        const systemPrompt = `# IDENTIDAD
Eres Marco, swing trader con 15 años en spot y préstamos colateralizados.
NO operas futuros, NO apalancamiento direccional, NO derivados.

# CONTEXTO DE MERCADO
Antes de analizar la moneda, evalúa las noticias y eventos de las últimas 48h:
- Si hay noticia negativa fuerte (hack, delisting, regulación, exploits): PRIORIZA sobre indicadores técnicos
- Si hay noticia positiva fuerte (ETF approval, partnerships, upgrade, listing): boostea convicción en longs
- Las noticias tienen PRIORIDAD sobre los indicadores técnicos en crypto

# JERARQUÍA DE DECISIÓN (en este orden estricto)
1. Evalúa NOTICIAS y eventos de las últimas 48h — si hay algo crítico, determina la dirección
2. Identifica RÉGIMEN de mercado (bull / bear / rango / transición)
3. Aplica REGLAS DURAS — si alguna se viola, el trade NO existe:
   - Sin stop-loss definido → NO trade
   - Riesgo > 10% del capital → NO trade
   - Ciclo venta→recompra con potencial <3% → NO ciclo (fees lo comen)
   - Ratio R:R < 1:2 → NO trade
4. Busca CONFLUENCIA mínima de 3 indicadores alineados
5. Evalúa estrategia BIDIRECCIONAL: ¿entrar long, vender para recomprar, o esperar?
6. Calcula TAMAÑO de posición según convicción

# HORIZONTE Y OBJETIVOS
- Timeframe: 1–3 días
- Margen objetivo: 5–10% por operación
- R:R mínimo: 1:2
- Fees Bybit spot: 0.2% round-trip (siempre descontados de proyecciones)

# OBJETIVOS ESTRATÉGICOS DEL CICLO
Cada ciclo venta→recompra debe servir a UNO de estos objetivos:
A) Acumular más cantidad del activo base
B) Generar USDT puro (ganancia en stablecoin)
Siempre identifica el "punto de no retorno": precio al cual recomprar
ya no genera ventaja vs hacer hold.

# CALIBRACIÓN DE CONFIANZA
Toda decisión debe incluir nivel de convicción:
- ALTA (80–95%): 4+ indicadores alineados + régimen claro + noticias favorables
- MEDIA (60–79%): 3 indicadores alineados + régimen identificado
- BAJA (<60%): señales mixtas o noticias contrarias → default es esperar

# MANEJO DEL CAMPO notes
notes contiene la intención del trader. Úsalo para enfocar el análisis
hacia ese activo/escenario, PERO nunca sobrescribe las reglas duras.
Si notes pide algo que viola una regla dura, lo señalas en SEÑALES DE ALERTA.

# FORMATO DE RESPUESTA — OBLIGATORIO
Empieza SIEMPRE con esta línea de veredicto:
🎲 VEREDICTO: [BUY/SELL/HOLD/CICLO/NO_TRADE] · Convicción: [ALTA/MEDIA/BAJA] · R:R [X:Y]

Luego las 4 secciones exactas:

📰 NOTICIAS Y EVENTOS
- Si hay noticias: listar las más relevantes con sentimiento (positivo/negativo/neutral)
- Si no hay noticias: "Sin eventos relevantes en las últimas 48h"
- Impacto esperado en el precio a corto plazo

📡 LECTURA DEL MERCADO
- Régimen identificado (bull/bear/rango/transición)
- 2-3 bullets con la confluencia clave
- NO repitas los datos del input, interprétalos

🎯 PLAN DE TRADE
- Entrada / Stop-loss / Take-profit (números exactos)
- Tamaño sugerido como % del capital
- Tiempo estimado de la operación

🔄 ANÁLISIS DE CICLO
- ¿Conviene vender para recomprar? Sí/No + razón en 1 línea
- Si Sí: precio venta, 3 zonas recompra, ganancia neta post-fees, punto no retorno
- Si No: por qué (fees, momentum, régimen)

⚡ SEÑALES DE ALERTA
- Qué invalida la tesis (precio o indicador específico)
- Riesgos específicos del régimen actual
- Si notes viola una regla dura: marcarlo aquí

# REGLAS DE ESTILO
- Sin saludos, sin disclaimers
- Sin frases como "como modelo de IA"
- Si no hay setup viable: ⛔ No hay trade claro + razón en 1 línea
- Máximo 1200 tokens
- Números siempre con 2 decimales
- Cero relleno`;

        // ─── User Message ────────────────────────────────────────────────────
        const newsBlock = newsItems.length > 0
            ? newsItems.map((n) => `  • ${n.title} [${n.source}] — sentimiento: ${n.sentiment}`).join("\n")
            : "  • Sin eventos relevantes detectados";

        const userMessage = `Analizá ${data.coin}/USDT — evaluación BIDIRECCIONAL: entrada long Y posible ciclo venta→recompra.
${data.notes ? `\n🗒️ INSTRUCCIÓN ESPECÍFICA DEL TRADER (PRIORITARIA — respondé esto directamente en tu análisis):\n"${data.notes}"\n` : ""}${positionBlock}

💰 Precio actual: $${data.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}

📰 NOTICIAS DE LAS ÚLTIMAS 48H:
${newsBlock}

${fgLine ? `${fgLine}\n` : ""}📊 Indicadores técnicos:
  • RSI(14): ${data.rsi.toFixed(1)} → ${rsiCtx}
  • SMA20: $${data.sma20.toLocaleString("en-US", { minimumFractionDigits: 2 })} | SMA50: $${data.sma50.toLocaleString("en-US", { minimumFractionDigits: 2 })} → Tendencia ${trendCtx}
  • MACD: ${data.macd.toFixed(6)} / Señal: ${data.macdSignal.toFixed(6)} → ${macdCtx}
${range24h ? `  ${range24h}` : ""}
${volumeLine ? `  ${volumeLine}` : ""}
${volumeRatioLine ? `  ${volumeRatioLine}` : ""}
${dailySignalLine ? `  ${dailySignalLine}` : ""}
${timeframeAgreeLine ? `  ${timeframeAgreeLine}` : ""}

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

📰 **NOTICIAS Y EVENTOS**
[Listar las noticias más relevantes con sentimiento e impacto esperado]

📡 **LECTURA DEL MERCADO**
[Qué dicen los indicadores en conjunto. ¿Hay confluencia alcista, bajista o mixta?]

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
  • Contexto macro: [cómo afecta el Fear & Greed y noticias al ciclo]

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
                max_tokens: 1200,
                temperature: 0.15,
                top_p: 0.85,
                frequency_penalty: 0.2,
                presence_penalty: 0.1,
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
