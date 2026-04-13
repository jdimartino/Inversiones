"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeMarket = void 0;
const functions = require("firebase-functions");
const generative_ai_1 = require("@google/generative-ai");
// ─── Cloud Function ───────────────────────────────────────────────────────────
exports.analyzeMarket = functions
    .region("europe-west1")
    .runWith({ timeoutSeconds: 60, memory: "256MB", secrets: ["GEMINI_API_KEY"] })
    .https.onCall(async (data) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new functions.https.HttpsError("failed-precondition", "GEMINI_API_KEY no configurada en el entorno de Cloud Functions.");
    }
    if (!data.coin || !data.price) {
        throw new functions.https.HttpsError("invalid-argument", "Datos de mercado incompletos.");
    }
    // ─── Contexto legible de indicadores ────────────────────────────────────
    const rsiCtx = data.rsi < 25 ? "fuertemente sobrevendido 🟢 (zona de posible rebote)" :
        data.rsi < 30 ? "sobrevendido 🔻 (posible oportunidad de entrada)" :
            data.rsi > 75 ? "fuertemente sobrecomprado 🔴 (considerar salida)" :
                data.rsi > 70 ? "sobrecomprado 🔺 (precaución)" :
                    data.rsi >= 45 && data.rsi <= 55 ? "zona neutra ➡️ (sin presión direccional clara)" :
                        data.rsi > 55 ? "momentum positivo ▲ (fuerza compradora presente)" :
                            "momentum debilitándose ▼ (fuerza vendedora creciente)";
    const trendCtx = data.price > data.sma20 && data.price > data.sma50
        ? "alcista ▲ (precio sobre SMA20 y SMA50)"
        : data.price < data.sma20 && data.price < data.sma50
            ? "bajista ▼ (precio bajo SMA20 y SMA50)"
            : data.price > data.sma20 && data.price < data.sma50
                ? "recuperación temprana ↗ (sobre SMA20 pero bajo SMA50)"
                : "debilitamiento ↘ (bajo SMA20 pero sobre SMA50)";
    const macdCtx = data.macd > data.macdSignal && data.macd > 0
        ? "MACD positivo y sobre señal → momentum alcista fuerte"
        : data.macd > data.macdSignal && data.macd <= 0
            ? "MACD cruzando señal al alza → posible inicio de movimiento alcista"
            : data.macd < data.macdSignal && data.macd < 0
                ? "MACD negativo y bajo señal → momentum bajista fuerte"
                : "MACD cruzando señal a la baja → posible agotamiento alcista";
    const fgLine = data.fearGreed
        ? `😱 Fear & Greed Index: ${data.fearGreed.value}/100 — ${data.fearGreed.classification}`
        : "";
    // ─── Cálculos de soporte/resistencia estimados ──────────────────────────
    const range24h = data.high24h && data.low24h
        ? `📏 Rango 24h: $${data.low24h.toLocaleString("en-US", { minimumFractionDigits: 2 })} — $${data.high24h.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
        : "";
    const volumeLine = data.volume24h
        ? `📊 Volumen 24h: $${data.volume24h.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
        : "";
    // Niveles de target basados en el precio actual
    const target5 = data.price * 1.05;
    const target7 = data.price * 1.07;
    const target10 = data.price * 1.10;
    const stopLoss3 = data.price * 0.97;
    const stopLoss5 = data.price * 0.95;
    const reasonLines = data.reasons
        .map((r) => `  • ${r.indicator}: ${r.detail}`)
        .join("\n");
    // ─── System Prompt — Marco, Swing Trader ────────────────────────────────
    const systemPrompt = `Sos Marco, un swing trader profesional con 15 años de experiencia en mercados cripto y tradicionales.
Empezaste en 2010 operando forex, migraste a cripto en 2016 y desde entonces te especializás en operaciones de corto y mediano plazo buscando márgenes del 5% al 10%.

Tu metodología:
- Te enfocás en swing trades con horizonte de 1 a 14 días
- Tu objetivo de ganancia por trade: entre 5% y 10% máximo
- Siempre definís punto de entrada, take-profit y stop-loss ANTES de operar
- Usás confluencia de indicadores: nunca tomás decisiones con un solo dato
- Priorizás el ratio riesgo/recompensa: mínimo 1:2 (arriesgás 1 para ganar 2)
- Nunca perseguís velas: si el tren ya salió, esperás el próximo

Tu estilo de comunicación:
- Directo, práctico, sin hype ni FOMO
- Hablás en español latinoamericano, como colega trader
- Das niveles de precio concretos, no generalidades
- Siempre aclarás que son perspectivas técnicas, no consejos financieros
- Si no ves setup claro, lo decís sin problema: "no hay trade aquí, hay que esperar"

Reglas inquebrantables:
- NUNCA recomendás entrar sin stop-loss definido
- NUNCA sugerís márgenes superiores al 10% en un solo trade
- Siempre considerás el contexto macro (Fear & Greed) junto con los técnicos
- Si los indicadores se contradicen, priorizás la cautela

Respondé SOLO con las secciones solicitadas. Sin introducciones, sin despedidas, sin disclaimers genéricos.`;
    // ─── User Message ───────────────────────────────────────────────────────
    const userMessage = `Analizá ${data.coin}/USDT para encontrar oportunidad de swing trade (objetivo 5-10% de ganancia).

💰 Precio actual: $${data.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}

📊 Indicadores técnicos:
  • RSI(14): ${data.rsi.toFixed(1)} → ${rsiCtx}
  • SMA20: $${data.sma20.toLocaleString("en-US", { minimumFractionDigits: 2 })} | SMA50: $${data.sma50.toLocaleString("en-US", { minimumFractionDigits: 2 })} → Tendencia ${trendCtx}
  • MACD: ${data.macd.toFixed(6)} / Señal: ${data.macdSignal.toFixed(6)} → ${macdCtx}
${fgLine ? `  ${fgLine}` : ""}
${range24h ? `  ${range24h}` : ""}
${volumeLine ? `  ${volumeLine}` : ""}

🎯 Señal técnica del sistema: ${(data.signalStrength || "NEUTRAL").replace(/_/g, " ").toUpperCase()}
Factores:
${reasonLines}

📐 Niveles de referencia precalculados:
  • Target +5%: $${target5.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
  • Target +7%: $${target7.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
  • Target +10%: $${target10.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
  • Stop-Loss -3%: $${stopLoss3.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
  • Stop-Loss -5%: $${stopLoss5.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}

---

Respondé con este formato exacto:

📡 **LECTURA DEL MERCADO**
[Resumen rápido: qué dicen los indicadores en conjunto. ¿Hay confluencia alcista, bajista o mixta? ¿El volumen acompaña? ¿El sentimiento macro ayuda o perjudica?]

🎯 **PLAN DE TRADE**
[Si hay setup viable:]
  • 🟢 Entrada sugerida: $XX.XX (justificá por qué ese nivel)
  • 🎯 Take-Profit: $XX.XX (+X%) (explicá qué resistencia o nivel técnico respalda ese target)
  • 🛑 Stop-Loss: $XX.XX (-X%) (explicá el nivel de invalidación)
  • ⚖️ Ratio R/R: X:X
  • ⏱️ Horizonte estimado: X días
[Si NO hay setup viable:]
  • ⛔ No hay trade claro — explicá qué condiciones necesitarías ver para que se active una oportunidad

⚡ **SEÑALES DE ALERTA**
[Qué debería monitorear: niveles clave que si se rompen cambian todo el panorama, divergencias a vigilar, eventos macro próximos que podrían impactar]`;
    try {
        const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            systemInstruction: systemPrompt,
        });
        const result = await model.generateContent(userMessage);
        const text = result.response.text();
        return { analysis: text };
    }
    catch (error) {
        console.error("Error al llamar a Gemini:", error);
        throw new functions.https.HttpsError("unknown", `Error en el servicio de IA: ${error.message || "Desconocido"}`);
    }
});
//# sourceMappingURL=analyzeMarket.js.map