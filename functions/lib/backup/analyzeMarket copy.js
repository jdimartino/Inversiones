"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeMarket = void 0;
const functions = require("firebase-functions");
const groq_sdk_1 = require("groq-sdk");
// ─── Cloud Function ───────────────────────────────────────────────────────────
exports.analyzeMarket = functions
    .region("europe-west1")
    .runWith({ timeoutSeconds: 60, memory: "256MB", secrets: ["GROQ_API_KEY"] })
    .https.onCall(async (data) => {
    var _a;
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        throw new functions.https.HttpsError("failed-precondition", "GROQ_API_KEY no configurada en el entorno de Cloud Functions.");
    }
    if (!data.coin || !data.price) {
        throw new functions.https.HttpsError("invalid-argument", "Datos de mercado incompletos.");
    }
    // ─── Contexto legible de indicadores ────────────────────────────────────
    const rsiCtx = data.rsi < 30 ? "sobrevendido 🔻" :
        data.rsi > 70 ? "sobrecomprado 🔺" :
            "zona neutra ➡️";
    const trendCtx = data.price > data.sma20 && data.price > data.sma50
        ? "alcista ▲ (precio sobre SMA20 y SMA50)"
        : data.price < data.sma20 && data.price < data.sma50
            ? "bajista ▼ (precio bajo SMA20 y SMA50)"
            : "mixta ↔ (precio entre ambas SMAs)";
    const macdCtx = data.macd > data.macdSignal
        ? "MACD por encima de la señal → momentum alcista"
        : "MACD por debajo de la señal → momentum bajista";
    const fgLine = data.fearGreed
        ? `😱 Fear & Greed Index: ${data.fearGreed.value}/100 — ${data.fearGreed.classification}`
        : "";
    const reasonLines = data.reasons
        .map((r) => `  • ${r.indicator}: ${r.detail}`)
        .join("\n");
    const systemPrompt = `Sos Don Ernesto, un trader veterano con 45 años de experiencia en mercados financieros.
Empezaste en Wall Street en los 70s con bonos y materias primas. Viviste el crash del 87, la burbuja puntocom, la crisis del 2008 y el COVID crash. En 2017 migraste al mercado cripto cuando reconociste patrones que ya habías visto antes.

Tu estilo:
- Directo, conciso, sin rodeos ni hype
- Hablás con el peso de quien perdió y ganó fortunas
- Sos escéptico del FOMO pero respetuoso de los datos técnicos
- Comparás siempre con situaciones históricas que viviste
- Nunca das consejos financieros directos — presentás perspectivas y tu opinión fundamentada
- Hablás en español, con el estilo de un hombre mayor experimentado

Respondé SOLO con las 3 secciones solicitadas. Sin introducciones, sin despedidas.`;
    const userMessage = `Analizá ${data.coin}/USDT en este momento con los siguientes datos de mercado reales:

💰 Precio actual: $${data.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}

📊 Indicadores técnicos:
  • RSI(14): ${data.rsi.toFixed(1)} → ${rsiCtx}
  • SMA20: $${data.sma20.toLocaleString("en-US", { minimumFractionDigits: 2 })} | SMA50: $${data.sma50.toLocaleString("en-US", { minimumFractionDigits: 2 })} → Tendencia ${trendCtx}
  • MACD: ${data.macd.toFixed(6)} / Señal: ${data.macdSignal.toFixed(6)} → ${macdCtx}
${fgLine}

🎯 Señal técnica del sistema: ${(data.signalStrength || "NEUTRAL").replace(/_/g, " ").toUpperCase()}
Factores que la generaron:
${reasonLines}

---

Presentá tu análisis en este formato:

🐂 **CASO ALCISTA**
[Argumento alcista concreto basado en los datos anteriores]

🐻 **CASO BAJISTA**
[Argumento bajista concreto basado en los datos anteriores]

🧠 **MI ANÁLISIS — DON ERNESTO**
[Tu perspectiva como trader veterano: qué patrones históricos similares recordás de tus décadas en mercados, cómo se compara esta situación con lo que viviste antes, y qué harías vos ahora con estos datos. Sé directo, sin adornos.]`;
    try {
        const client = new groq_sdk_1.default({ apiKey });
        const completion = await client.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userMessage },
            ],
            max_tokens: 1024,
        });
        const text = (_a = completion.choices[0].message.content) !== null && _a !== void 0 ? _a : "";
        return { analysis: text };
    }
    catch (error) {
        console.error("Error al llamar a Groq:", error);
        throw new functions.https.HttpsError("unknown", `Error en el servicio de IA: ${error.message || "Desconocido"}`);
    }
});
//# sourceMappingURL=analyzeMarket%20copy.js.map