import React, { useEffect, useState, useCallback, useRef } from "react";
import { useOpenCodeMonitor } from "../hooks/useOpenCodeMonitor";
import { FIREBASE_FUNCTIONS_URL } from "../lib/firebase";

interface ModelData {
  name: string;
  reqs5h: number;
  reqsWeek: number;
  reqsMonth: number;
  tier: string;
}

const MODELS: Record<string, ModelData> = {
  "deepseek-v4-flash": { name: "DeepSeek V4 Flash", reqs5h: 31650, reqsWeek: 79050, reqsMonth: 158150, tier: "ultra" },
  "mimo-v2.5": { name: "MiMo-V2.5", reqs5h: 30100, reqsWeek: 75200, reqsMonth: 150400, tier: "ultra" },
  "minimax-m2.5": { name: "MiniMax M2.5", reqs5h: 6300, reqsWeek: 15900, reqsMonth: 31800, tier: "light" },
  "mimo-v2.5-pro": { name: "MiMo-V2.5-Pro", reqs5h: 3250, reqsWeek: 8150, reqsMonth: 16300, tier: "light" },
  "deepseek-v4-pro": { name: "DeepSeek V4 Pro", reqs5h: 3450, reqsWeek: 8550, reqsMonth: 17150, tier: "medium" },
  "minimax-m2.7": { name: "MiniMax M2.7", reqs5h: 3400, reqsWeek: 8500, reqsMonth: 17000, tier: "medium" },
  "qwen3.6-plus": { name: "Qwen3.6 Plus", reqs5h: 3300, reqsWeek: 8200, reqsMonth: 16300, tier: "medium" },
  "kimi-k2.5": { name: "Kimi K2.5", reqs5h: 1850, reqsWeek: 4630, reqsMonth: 9250, tier: "heavy" },
  "glm-5": { name: "GLM-5", reqs5h: 1150, reqsWeek: 2880, reqsMonth: 5750, tier: "heavy" },
  "kimi-k2.6": { name: "Kimi K2.6", reqs5h: 1150, reqsWeek: 2880, reqsMonth: 5750, tier: "heavy" },
  "qwen3.7-max": { name: "Qwen3.7 Max", reqs5h: 950, reqsWeek: 2390, reqsMonth: 4770, tier: "heavy" },
  "glm-5.1": { name: "GLM-5.1", reqs5h: 880, reqsWeek: 2150, reqsMonth: 4300, tier: "heavy" },
  "minimax-m3": { name: "MiniMax M3", reqs5h: 1400, reqsWeek: 3500, reqsMonth: 7000, tier: "heavy" },
  "qwen3.7-plus": { name: "Qwen3.7 Plus", reqs5h: 4300, reqsWeek: 10800, reqsMonth: 21600, tier: "medium" },
};

interface ParsedModel {
  id: string;
  name: string;
  reqs5h: number;
  reqsWeek: number;
  reqsMonth: number;
}

const MEDALS: Record<number, string> = { 0: "🥇", 1: "🥈", 2: "🥉" };
const CYCLE = { WEEK: 7, MONTH: 30 };

const FUNCTIONS_BASE = FIREBASE_FUNCTIONS_URL;

const OpenCodeMonitor: React.FC = () => {
  const { state, syncStatus, update, history, setHistory, saveHistoryEntry, resetState } = useOpenCodeMonitor();

  const [showHistory, setShowHistory] = useState(false);
  const [estimatorModel, setEstimatorModel] = useState("");
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [syncUsageResult, setSyncUsageResult] = useState<{ msg: string; type: string } | null>(null);
  const [checkResult, setCheckResult] = useState<string | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);

  const historyTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@400;600;700;800&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, []);

  useEffect(() => {
    historyTimerRef.current = setInterval(() => {
      saveHistoryEntry();
    }, 60000);
    return () => { if (historyTimerRef.current) clearInterval(historyTimerRef.current); };
  }, [state, saveHistoryEntry]);

  const handleRange = useCallback((key: keyof typeof state, value: number) => {
    update({ [key]: value } as Partial<typeof state>);
  }, [update]);

  const handleNum = useCallback((key: keyof typeof state, value: number) => {
    update({ [key]: value } as Partial<typeof state>);
  }, [update]);

  const copyModelId = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopyFeedback(text);
      setTimeout(() => setCopyFeedback(null), 2000);
    });
  }, []);

  const resetAll = useCallback(() => {
    if (window.confirm("¿Resetear valores?")) {
      resetState();
    }
  }, [resetState]);

  const toggleHistory = useCallback(() => {
    setShowHistory(prev => !prev);
  }, []);

  const parseModelTable = (html: string): ParsedModel[] => {
    const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
    const parsed: ParsedModel[] = [];

    for (const row of rows) {
      const cells = row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi);
      if (!cells || cells.length < 4) continue;

      const clean = (s: string) => s.replace(/<[^>]+>/g, "").replace(/[,.]/g, "").trim();
      const rawName = clean(cells[0]);

      const nameMap: Record<string, string> = {
        "DeepSeek V4 Flash": "deepseek-v4-flash",
        "MiMo-V2.5": "mimo-v2.5",
        "MiniMax M2.5": "minimax-m2.5",
        "MiMo-V2.5-Pro": "mimo-v2.5-pro",
        "DeepSeek V4 Pro": "deepseek-v4-pro",
        "MiniMax M2.7": "minimax-m2.7",
        "Qwen3.6 Plus": "qwen3.6-plus",
        "Kimi K2.5": "kimi-k2.5",
        "GLM-5": "glm-5",
        "Kimi K2.6": "kimi-k2.6",
        "Qwen3.7 Max": "qwen3.7-max",
        "GLM-5.1": "glm-5.1",
        "MiniMax M3": "minimax-m3",
        "Qwen3.7 Plus": "qwen3.7-plus",
      };

      const id = nameMap[rawName];
      if (!id) continue;

      const reqs = [cells[1], cells[2], cells[3]].map(c => parseInt(clean(c), 10));
      if (reqs.some(isNaN)) continue;

      parsed.push({ id, name: rawName, reqs5h: reqs[0], reqsWeek: reqs[1], reqsMonth: reqs[2] });
    }

    return parsed;
  };

  const checkUpdates = useCallback(async () => {
    setCheckResult(null);
    try {
      const res = await fetch("https://opencode.ai/docs/es/go/", {
        headers: { Accept: "text/html" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const parsed = parseModelTable(html);

      if (parsed.length === 0) throw new Error("No se pudo encontrar la tabla de modelos");

      const currentIds = new Set(Object.keys(MODELS));
      const newModels = parsed.filter(p => !currentIds.has(p.id));
      const changedModels = parsed.filter(p => {
        const cur = MODELS[p.id];
        if (!cur || cur.reqs5h === p.reqs5h && cur.reqsWeek === p.reqsWeek && cur.reqsMonth === p.reqsMonth) return false;
        return true;
      });
      const missingFromPage = Object.keys(MODELS).filter(id => !parsed.some(p => p.id === id));

      let msg = "";
      if (newModels.length > 0) {
        msg += `🆕 Modelos nuevos: ${newModels.map(m => m.name).join(", ")}\n`;
      }
      if (changedModels.length > 0) {
        msg += `⚠️ Modelos actualizados: ${changedModels.map(m => m.name).join(", ")}\n`;
      }
      if (missingFromPage.length > 0) {
        msg += `❌ Modelos no encontrados en la página: ${missingFromPage.join(", ")}\n`;
      }
      if (!msg) {
        msg = "✅ Todos los modelos están actualizados";
      }

      setCheckResult(msg);
      setTimeout(() => setCheckResult(null), 8000);
    } catch (err: any) {
      setCheckResult(`⚠️ No se pudo verificar: ${err.message}. Visita opencode.ai/docs/go/ manualmente`);
      setTimeout(() => setCheckResult(null), 8000);
    }
  }, []);

  const syncUsage = useCallback(async () => {
    setSyncLoading(true);
    setSyncUsageResult(null);
    try {
      const res = await fetch(`${FUNCTIONS_BASE}/syncOpenCodeUsage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.error) {
        setSyncUsageResult({ msg: `Error: ${data.error}`, type: "error" });
      } else if (data.usagePercent !== undefined) {
        const pct = Math.round(data.usagePercent);
        update({ monthPct: pct });
        setSyncUsageResult({ msg: `✅ Uso sincronizado: ${pct}% mensual`, type: "success" });
      } else {
        setSyncUsageResult({ msg: "⚠️ Respuesta inesperada del servidor", type: "warning" });
      }
    } catch {
      setSyncUsageResult({
        msg: "⚠️ Función no disponible. Ejecuta: firebase functions:secrets:set OPENCODE_API_KEY && firebase deploy --only functions",
        type: "error",
      });
    } finally {
      setSyncLoading(false);
      setTimeout(() => setSyncUsageResult(null), 8000);
    }
  }, [update]);

  const updateEstimator = useCallback((modelId: string) => {
    setEstimatorModel(modelId);
  }, []);

  // ── Calculations ──
  const { contPct, contH, contM, weekPct, weekD, weekH, monthPct, monthD, monthH } = state;
  const contDaysLeft = contH / 24 + contM / 1440;
  const weekDaysLeft = weekD + weekH / 24;
  const monthDaysLeft = monthD + monthH / 24;
  const contAvailPct = 100 - contPct;
  const weekAvailPct = 100 - weekPct;
  const monthAvailPct = 100 - monthPct;

  const contDaily = contDaysLeft > 0 ? contAvailPct / contDaysLeft : 0;
  const weekDaily = weekDaysLeft > 0 ? weekAvailPct / weekDaysLeft : 0;
  const monthDaily = monthDaysLeft > 0 ? monthAvailPct / monthDaysLeft : 0;
  const minDaily = Math.min(contDaily, weekDaily, monthDaily);

  let bottleneck = "Continuo";
  if (minDaily === weekDaily) bottleneck = "Semanal";
  else if (minDaily === monthDaily) bottleneck = "Mensual";

  const monthDaysPassed = Math.max(0, CYCLE.MONTH - monthDaysLeft);
  const expectedMonthPct = Math.min(100, (monthDaysPassed / CYCLE.MONTH) * 100);

  let pacingStatus: string = "success";
  if (monthPct > expectedMonthPct + 10) pacingStatus = "danger";
  else if (monthPct > expectedMonthPct + 2) pacingStatus = "warning";

  const recommendedTier = pacingStatus === "danger" ? "ultra" : pacingStatus === "warning" ? "light" : "heavy";
  const topModels = Object.entries(MODELS)
    .filter(([_, m]) => m.tier === recommendedTier)
    .sort((a, b) => b[1].reqs5h - a[1].reqs5h)
    .slice(0, 3);

  const isAllZero = contPct === 0 && weekPct === 0 && monthPct === 0;

  const advices: { type: string; icon: string; title: string; text: string }[] = [];
  if (contDaysLeft < 1 / 24 && contAvailPct > 10) {
    advices.push({ type: "warning", icon: "⏰", title: "Reinicio Continuo en <1h", text: `${contAvailPct}% libre. Usa Flash (31.6k reqs) AHORA antes de reset.` });
  }
  if (pacingStatus === "danger") {
    advices.push({ type: "danger", icon: "🚨", title: "Consumo Muy Elevado", text: `${monthPct}% vs ideal ${expectedMonthPct.toFixed(0)}%. Máx ${minDaily.toFixed(1)}%/día. USA Flash o MiMo-V2.5 (30k reqs).` });
  } else if (pacingStatus === "warning") {
    advices.push({ type: "warning", icon: "⚠️", title: "Ritmo Acelerado", text: `Ligeramente elevado. Mantén ≤${minDaily.toFixed(1)}%/día. Usa MiniMax M2.5 (6.3k).` });
  } else {
    advices.push({ type: "success", icon: "✅", title: "Buen Ritmo", text: `Perfecto. Puedes usar Premium: GLM-5.1 (880 reqs), Qwen3.7 Max (950), Kimi K2.5 (1.85k).` });
  }
  if (weekDaysLeft < 1 && weekAvailPct > 20) {
    advices.push({ type: "info", icon: "🚀", title: "¡Sprint Semanal Disponible!", text: `${weekAvailPct}% libre, reset <24h. Flash: 79k reqs, MiMo-V2.5: 75k. ¡Programa fuerte!` });
  }

  const estimatorModelData = estimatorModel ? MODELS[estimatorModel] : null;

  const updateStatusIcon = (pct: number): string => {
    if (pct >= 80) return "🔴";
    if (pct >= 50) return "🟡";
    return "🟢";
  };

  const syncIcon = syncStatus === "syncing" ? "⏳" : syncStatus === "synced" ? "☁️" : syncStatus === "offline" ? "📦" : "📦";
  const syncLabel = syncStatus === "syncing" ? "Sincronizando..." : syncStatus === "synced" ? "Sincronizado en la nube" : syncStatus === "offline" ? "Guardado localmente" : "Guardado localmente";

  return (
    <div className="opencode-monitor-root">
      <style>{`
        .opencode-monitor-root {
          --bg: #0d0f14;
          --surface: #161921;
          --border: #252830;
          --border2: #2e323d;
          --text: #e8eaf0;
          --muted: #6b7280;
          --cont: #f59e0b;
          --week: #3b82f6;
          --month: #10b981;
          --danger: #ef4444;
          --warning: #f59e0b;
          --success: #10b981;
          --info: #3b82f6;
          font-family: 'Syne', sans-serif;
          background: var(--bg);
          color: var(--text);
          min-height: 100vh;
          padding: 1.5rem 1rem;
        }
        .opencode-monitor-root * { box-sizing: border-box; margin: 0; padding: 0; }
        .opencode-monitor-root { overflow-x: hidden; }
        .om-wrap { max-width: 1200px; margin: 0 auto; padding: 0 .5rem; }
        .om-header { display: flex; align-items: center; justify-content: space-between; gap: .75rem; background: var(--surface); border: 1px solid var(--border2); border-radius: 16px; padding: 1rem 1.25rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
        .om-logo-section { display: flex; align-items: center; gap: .75rem; }
        .om-logo-icon { width: 40px; height: 40px; background: var(--cont); border-radius: 10px; display: grid; place-items: center; font-size: 1.2rem; }
        .om-header h1 { font-size: 1.1rem; font-weight: 800; }
        .om-header p { font-size: .7rem; color: var(--muted); margin-top: 2px; font-family: 'DM Mono', monospace; }
        .om-header-buttons { display: flex; gap: .4rem; flex-wrap: wrap; }
        .om-btn { background: var(--border2); border: 1px solid var(--border); color: var(--text); padding: .6rem 1rem; border-radius: 8px; cursor: pointer; font-family: 'DM Mono', monospace; font-size: .75rem; transition: all .2s; }
        .om-btn:hover { background: var(--border); }
        .om-btn.primary { background: var(--cont); border-color: var(--cont); color: #000; font-weight: 600; }
        .om-btn.danger { background: var(--danger); border-color: var(--danger); color: #000; font-weight: 600; }
        .om-btn:disabled { opacity: .5; cursor: not-allowed; }
        .om-btn.copy { background: var(--week); border-color: var(--week); color: #000; font-weight: 600; font-size: .7rem; padding: .4rem .6rem; }
        .om-grid { display: grid; grid-template-columns: 300px 1fr; gap: 1.25rem; }
        @media(max-width: 960px){ .om-grid { grid-template-columns: 1fr; } }
        .om-card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 1rem 1.1rem; margin-bottom: 1rem; }
        .om-card-title { display: flex; justify-content: space-between; align-items: center; margin-bottom: .75rem; }
        .om-card-title h3 { font-size: .78rem; font-weight: 700; text-transform: uppercase; }
        .om-badge { font-family: 'DM Mono', monospace; font-size: .72rem; padding: 3px 9px; border-radius: 6px; }
        .om-badge-cont { background:#78350f22; color: var(--cont); border:1px solid #78350f55; }
        .om-badge-week { background:#1e3a5f33; color: var(--week); border:1px solid #3b82f644; }
        .om-badge-month { background:#064e3b33; color: var(--month); border:1px solid #10b98144; }
        .om-field-label { display: flex; justify-content: space-between; font-size: .75rem; color: var(--muted); margin-bottom: .4rem; font-family: 'DM Mono', monospace; }
        .om-range { -webkit-appearance: none; width: 100%; height: 6px; border-radius: 99px; outline: none; margin-bottom: 1rem; }
        .om-range.cont { background: linear-gradient(to right, var(--cont) calc(var(--v)*1%), var(--border2) calc(var(--v)*1%)); }
        .om-range.week { background: linear-gradient(to right, var(--week) calc(var(--v)*1%), var(--border2) calc(var(--v)*1%)); }
        .om-range.month { background: linear-gradient(to right, var(--month) calc(var(--v)*1%), var(--border2) calc(var(--v)*1%)); }
        .om-range::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%; background: var(--text); border: 2px solid var(--bg); box-shadow: 0 0 0 2px currentColor; }
        .om-range.cont::-webkit-slider-thumb { color: var(--cont); }
        .om-range.week::-webkit-slider-thumb { color: var(--week); }
        .om-range.month::-webkit-slider-thumb { color: var(--month); }
        .om-input-num { width: 100%; background: var(--bg); border: 1px solid var(--border2); color: var(--text); border-radius: 8px; padding: .55rem .75rem; font-family: 'DM Mono', monospace; font-size: .85rem; outline: none; }
        .om-input-num:focus { border-color: var(--week); }
        .om-num-grid { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; }
        .om-num-grid label { font-size: .72rem; color: var(--muted); display: block; margin-bottom: .3rem; }
        .om-snapshot { background: linear-gradient(135deg, #0f1117 0%, #161921 100%); border: 2px solid var(--month); border-radius: 16px; padding: 1rem 0.75rem; margin-bottom: 1.5rem; overflow: hidden; }
        .om-snapshot-title { font-size: .7rem; text-transform: uppercase; color: var(--muted); margin-bottom: .6rem; font-family: 'DM Mono', monospace; }
        .om-snapshot-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.5rem; margin-bottom: 0; }
        .om-snapshot-item { text-align: center; overflow: hidden; min-width: 0; }
        .om-snapshot-pct { font-size: 1.5rem; font-weight: 800; line-height: 1.2; }
        .om-snapshot-label { font-size: 0.55rem; color: var(--muted); margin-top: .2rem; font-family: 'DM Mono', monospace; }
        .om-status-icon { font-size: 1.2rem; margin-bottom: .2rem; }
        .om-section { margin-bottom: 2rem; }
        .om-section-title { font-size: .85rem; font-weight: 700; text-transform: uppercase; margin-bottom: 1rem; color: var(--text); }
        .om-metric-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; }
        @media(max-width:500px){ .om-metric-row { grid-template-columns: 1fr; } }
        .om-metric-card { border-radius: 14px; padding: 1.3rem 1.4rem; position: relative; overflow: hidden; text-align: center; }
        .om-metric-card.dark { background: #0f1117; border: 1px solid var(--border2); }
        .om-metric-card.blue { background: #0c1a30; border: 1px solid #1d4ed844; }
        .om-metric-label { font-size: .72rem; color: var(--muted); font-family:'DM Mono',monospace; margin-bottom: .6rem; text-transform:uppercase; text-align: center; }
        .om-metric-value { font-size: 1.75rem; font-weight: 800; line-height: 1.1; margin-bottom: .5rem; word-break: break-all; overflow-wrap: break-word; }
        .om-metric-sub { font-size: .72rem; padding: 6px 12px; border-radius: 6px; display: inline-block; font-family:'DM Mono',monospace; margin: 0 auto; }
        .om-metric-card.dark .om-metric-sub { background:#1a1d26; color: var(--muted); border:1px solid var(--border2); }
        .om-metric-card.blue .om-metric-sub { background:#0f2040; color:#93c5fd; border:1px solid #1d4ed844; }
        .om-metric-card.dark .om-metric-value { color: var(--month); }
        .om-metric-card.blue .om-metric-value { color: var(--cont); }
        .om-deco { position:absolute; bottom:-12px; right:-12px; font-size:5.5rem; opacity:.05; line-height:1; }
        .om-pacing-card { background: var(--surface); border:1px solid var(--border); border-radius:14px; padding:1.3rem 1.4rem; margin-bottom:1rem; }
        .om-pacing-card h3 { font-size:.78rem; text-transform:uppercase; color:var(--muted); margin-bottom:1rem; font-family:'DM Mono',monospace; }
        .om-bar-wrap { background: var(--border); border-radius:99px; height:8px; position:relative; overflow:hidden; margin-bottom:.4rem; }
        .om-bar-fill { height:100%; border-radius:99px; transition: width .5s; }
        .om-bar-legend { display:flex; justify-content:space-between; font-size:.68rem; color:var(--muted); font-family:'DM Mono',monospace; }
        .om-top-models { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
        .om-top-card { background: linear-gradient(135deg, #0c1a30 0%, #0f1117 100%); border: 2px solid var(--week); border-radius: 12px; padding: 1rem .75rem; text-align: center; box-shadow: 0 0 20px rgba(59, 130, 246, 0.2); overflow: hidden; }
        .om-top-medal { font-size: 1.75rem; margin-bottom: .4rem; }
        .om-top-name { font-weight: 600; margin-bottom: .3rem; font-size: .8rem; }
        .om-top-reqs { font-size: 1.1rem; font-weight: 800; color: var(--week); margin-bottom: .6rem; font-family: 'DM Mono', monospace; }
        .om-top-action { display: flex; gap: .4rem; }
        .om-top-action button { flex: 1; font-size: .65rem; padding: .4rem .5rem; }
        .om-table { width: 100%; border-collapse: collapse; font-size: .75rem; margin-top: 1rem; }
        .om-table th { background: var(--border2); padding: .8rem .6rem; text-align: left; font-family: 'DM Mono', monospace; color: var(--muted); border-bottom: 1px solid var(--border); }
        .om-table td { padding: .8rem .6rem; border-bottom: 1px solid var(--border); }
        .om-table tr:hover { background: rgba(59, 130, 246, 0.1); }
        .om-model-name { font-weight: 600; }
        .om-model-reqs { color: var(--week); font-family: 'DM Mono', monospace; font-weight: 600; }
        .om-model-copy { cursor: pointer; color: var(--info); text-decoration: underline; font-size: .65rem; }
        .om-est-card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 1.3rem 1.4rem; margin-bottom: 1rem; }
        .om-select { width: 100%; background: var(--bg); border: 1px solid var(--border2); color: var(--text); border-radius: 8px; padding: .6rem .8rem; font-family: 'DM Mono', monospace; font-size: .8rem; outline: none; }
        .om-select:focus { border-color: var(--week); }
        .om-est-result { background: var(--bg); border-radius: 8px; padding: 1rem; margin-top: 1rem; }
        .om-est-item { display: flex; justify-content: space-between; margin-bottom: .5rem; font-size: .75rem; }
        .om-est-item strong { color: var(--week); font-family: 'DM Mono', monospace; }
        .om-advice { border-radius:12px; padding:1rem 1.1rem; display:flex; gap:.85rem; align-items:flex-start; margin-bottom:.75rem; border:1px solid transparent; }
        .om-advice.danger { background:#1f0a0a; border-color:#ef444433; }
        .om-advice.warning { background:#1a1000; border-color:#f59e0b33; }
        .om-advice.success { background:#091a12; border-color:#10b98133; }
        .om-advice.info { background:#071428; border-color:#3b82f633; }
        .om-advice-icon { font-size:1.2rem; flex-shrink:0; margin-top:1px; }
        .om-advice-body h4 { font-size:.82rem; font-weight:700; margin-bottom:.3rem; }
        .om-advice-body p { font-size:.77rem; line-height:1.6; font-family:'DM Mono',monospace; }
        .om-advice.danger .om-advice-body h4 { color:#fca5a5; }
        .om-advice.warning .om-advice-body h4 { color:#fcd34d; }
        .om-advice.success .om-advice-body h4 { color:#6ee7b7; }
        .om-advice.info .om-advice-body h4 { color:#93c5fd; }
        .om-history-item { display: flex; justify-content: space-between; padding: .7rem 0; font-size: .75rem; border-bottom: 1px solid var(--border2); }
        .om-history-item:last-child { border-bottom: none; }
        .om-history-date { color: var(--muted); font-family: 'DM Mono', monospace; }
        .om-history-bars { display: flex; gap: .5rem; }
        .om-msg { position: fixed; bottom: 2rem; right: 2rem; padding: 1rem 1.5rem; border-radius: 8px; font-family: 'DM Mono', monospace; font-weight: 600; z-index: 200; animation: om-slideIn .3s ease; max-width: 400px; white-space: pre-wrap; }
        .om-msg.success { background: var(--success); color: #000; }
        .om-msg.error { background: var(--danger); color: #fff; }
        .om-msg.warning { background: var(--warning); color: #000; }
        .om-msg.info { background: var(--info); color: #000; }
        .om-copy-feedback { position: fixed; bottom: 5rem; right: 2rem; background: var(--success); color: #000; padding: 1rem 1.5rem; border-radius: 8px; font-family: 'DM Mono', monospace; font-weight: 600; z-index: 100; animation: om-slideIn .3s ease; }
        @keyframes om-slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: none; opacity: 1; } }
      `}</style>

      <div className="om-wrap">
        <header className="om-header">
          <div className="om-logo-section">
            <div className="om-logo-icon">⚡</div>
            <div>
              <h1>OpenCode Go <span style={{fontWeight:400, color:"var(--muted)"}}>Monitor v3</span></h1>
              <p>Optimiza tu uso de cuotas • #JDMRules</p>
            </div>
          </div>
          <div className="om-header-buttons">
            <button className="om-btn" onClick={checkUpdates}>
              {checkResult && checkResult.startsWith("✅") ? "✅ Verificado" : "🔄 Verificar actualizaciones"}
            </button>
            <button className="om-btn" onClick={syncUsage} disabled={syncLoading}>
              {syncLoading ? "⏳ Sincronizando..." : "☁️ Sincronizar uso"}
            </button>
            <button className="om-btn" onClick={toggleHistory}>📈 Histórico</button>
            <button className="om-btn" onClick={resetAll}>🗑 Limpiar</button>
          </div>
        </header>

        <div className="om-grid">
          {/* SIDEBAR */}
          <div>
            {/* SNAPSHOT */}
            <div className="om-snapshot">
              <div className="om-snapshot-title">📊 Estado Actual <span style={{fontSize:".6rem", color:"var(--muted)"}}>({syncLabel})</span></div>
              <div className="om-snapshot-grid">
                <div className="om-snapshot-item">
                  <div className="om-status-icon">{updateStatusIcon(contPct)}</div>
                  <div className="om-snapshot-pct">{contPct}%</div>
                  <div className="om-snapshot-label">Continuo</div>
                </div>
                <div className="om-snapshot-item">
                  <div className="om-status-icon">{updateStatusIcon(weekPct)}</div>
                  <div className="om-snapshot-pct">{weekPct}%</div>
                  <div className="om-snapshot-label">Semanal</div>
                </div>
                <div className="om-snapshot-item">
                  <div className="om-status-icon">{updateStatusIcon(monthPct)}</div>
                  <div className="om-snapshot-pct">{monthPct}%</div>
                  <div className="om-snapshot-label">Mensual</div>
                </div>
              </div>
            </div>

            {/* CONTINUO */}
            <div className="om-card">
              <div className="om-card-title">
                <h3>⚡ Continuo (5h)</h3>
                <span className="om-badge om-badge-cont">{contAvailPct}%</span>
              </div>
              <div className="om-field-label"><span>% usado</span><span>{contPct}%</span></div>
              <input type="range" className="om-range cont" min="0" max="100" value={contPct} style={{"--v": contPct} as React.CSSProperties} onChange={e => handleRange("contPct", +e.target.value)} />
              <div className="om-num-grid">
                <div>
                  <label>Horas restantes</label>
                  <input type="number" className="om-input-num" min="0" max="5" value={contH} onChange={e => handleNum("contH", +e.target.value)} />
                </div>
                <div>
                  <label>Minutos</label>
                  <input type="number" className="om-input-num" min="0" max="59" value={contM} onChange={e => handleNum("contM", +e.target.value)} />
                </div>
              </div>
            </div>

            {/* SEMANAL */}
            <div className="om-card">
              <div className="om-card-title">
                <h3>📅 Semanal (7d)</h3>
                <span className="om-badge om-badge-week">{weekAvailPct}%</span>
              </div>
              <div className="om-field-label"><span>% usado</span><span>{weekPct}%</span></div>
              <input type="range" className="om-range week" min="0" max="100" value={weekPct} style={{"--v": weekPct} as React.CSSProperties} onChange={e => handleRange("weekPct", +e.target.value)} />
              <div className="om-num-grid">
                <div>
                  <label>Días restantes</label>
                  <input type="number" className="om-input-num" min="0" max="7" value={weekD} onChange={e => handleNum("weekD", +e.target.value)} />
                </div>
                <div>
                  <label>Horas</label>
                  <input type="number" className="om-input-num" min="0" max="23" value={weekH} onChange={e => handleNum("weekH", +e.target.value)} />
                </div>
              </div>
            </div>

            {/* MENSUAL */}
            <div className="om-card">
              <div className="om-card-title">
                <h3>🗓 Mensual (30d)</h3>
                <span className="om-badge om-badge-month">{monthAvailPct}%</span>
              </div>
              <div className="om-field-label"><span>% usado</span><span>{monthPct}%</span></div>
              <input type="range" className="om-range month" min="0" max="100" value={monthPct} style={{"--v": monthPct} as React.CSSProperties} onChange={e => handleRange("monthPct", +e.target.value)} />
              <div className="om-num-grid">
                <div>
                  <label>Días restantes</label>
                  <input type="number" className="om-input-num" min="0" max="31" value={monthD} onChange={e => handleNum("monthD", +e.target.value)} />
                </div>
                <div>
                  <label>Horas</label>
                  <input type="number" className="om-input-num" min="0" max="23" value={monthH} onChange={e => handleNum("monthH", +e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          {/* DASHBOARD */}
          <div>
            {/* TOP 3 MODELOS */}
            <div className="om-section">
              <div className="om-section-title">🚀 Top 3 Modelos Hoy</div>
              <div className="om-top-models">
                {topModels.length > 0 ? topModels.map(([id, model], idx) => (
                  <div className="om-top-card" key={id}>
                    <div className="om-top-medal">{MEDALS[idx]}</div>
                    <div className="om-top-name">{model.name}</div>
                    <div className="om-top-reqs">{(model.reqs5h / 1000).toFixed(1)}k reqs</div>
                    <div className="om-top-action">
                      <button className="om-btn copy" onClick={() => copyModelId(`opencode-go/${id}`)}>📋 Copiar</button>
                    </div>
                  </div>
                )) : <div style={{color:"var(--muted)", fontSize:".75rem", gridColumn:"1/-1", textAlign:"center"}}>Sin modelos disponibles para este ritmo</div>}
              </div>
            </div>

            {/* METRICAS */}
            <div className="om-section">
              <div className="om-metric-row">
                <div className="om-metric-card dark">
                  <div className="om-deco">🎯</div>
                  <div className="om-metric-label">Ritmo Seguro Hoy</div>
                  <div className="om-metric-value">{isAllZero ? "—" : minDaily.toFixed(1) + "%"}</div>
                  <div className="om-metric-sub">{isAllZero ? "⚙️ Ingresa tu % actual arriba" : `Máx. recomendado (Límite: ${bottleneck})`}</div>
                </div>
                <div className="om-metric-card blue">
                  <div className="om-deco">⚡</div>
                  <div className="om-metric-label">% Disponible (Continuo)</div>
                  <div className="om-metric-value">{contAvailPct}%</div>
                  <div className="om-metric-sub">En las próximas {contH}h {contM}m</div>
                </div>
              </div>
            </div>

            {/* PACING */}
            <div className="om-section">
              <div className="om-pacing-card">
                <h3>📊 Progreso Mensual</h3>
                <div className="om-bar-wrap">
                  <div className="om-bar-fill" style={{width: Math.min(100, monthPct) + "%", background: pacingStatus === "danger" ? "var(--danger)" : pacingStatus === "warning" ? "var(--warning)" : "var(--month)"}}></div>
                </div>
                <div className="om-bar-legend">
                  <span>Actual: {monthPct}%</span>
                  <span>Ideal: {expectedMonthPct.toFixed(0)}%</span>
                </div>
              </div>
            </div>

            {/* ESTIMADOR */}
            <div className="om-section">
              <div className="om-est-card">
                <div style={{fontSize:".78rem", textTransform:"uppercase", marginBottom:"1rem"}}>🔮 Estimador de Requests</div>
                <label style={{display:"block", fontSize:".75rem", color:"var(--muted)", marginBottom:".5rem", fontFamily:"'DM Mono', monospace"}}>
                  Si uso este modelo:
                </label>
                <select className="om-select" value={estimatorModel} onChange={e => updateEstimator(e.target.value)}>
                  <option value="">-- Selecciona un modelo --</option>
                  {Object.entries(MODELS).map(([id, model]) => (
                    <option key={id} value={id}>{model.name}</option>
                  ))}
                </select>
                {estimatorModelData && (
                  <div className="om-est-result">
                    <div className="om-est-item">
                      <span>Continuo (5h):</span>
                      <strong>{(estimatorModelData.reqs5h / 1000).toFixed(1)}k solicitudes</strong>
                    </div>
                    <div className="om-est-item">
                      <span>Esta semana ({weekDaysLeft.toFixed(1)}d):</span>
                      <strong>{(estimatorModelData.reqsWeek / 1000).toFixed(1)}k solicitudes</strong>
                    </div>
                    <div className="om-est-item">
                      <span>Este mes ({monthDaysLeft.toFixed(1)}d):</span>
                      <strong>{(estimatorModelData.reqsMonth / 1000).toFixed(1)}k solicitudes</strong>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* TABLA DE MODELOS */}
            <div className="om-section">
              <div style={{fontSize:".78rem", textTransform:"uppercase", color:"var(--muted)", marginBottom:"1rem", fontFamily:"'DM Mono', monospace", display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                <span>📋 Todos los Modelos</span>
                <span style={{fontSize:".65rem", color:"var(--muted)"}}>{Object.keys(MODELS).length} modelos</span>
              </div>
              <div style={{overflowX:"auto"}}>
                <table className="om-table">
                  <thead>
                    <tr>
                      <th>Modelo</th>
                      <th>5h</th>
                      <th>Semana</th>
                      <th>Mes</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(MODELS).map(([id, model]) => (
                      <tr key={id}>
                        <td className="om-model-name">{model.name}</td>
                        <td className="om-model-reqs">{(model.reqs5h / 1000).toFixed(1)}k</td>
                        <td className="om-model-reqs">{(model.reqsWeek / 1000).toFixed(1)}k</td>
                        <td className="om-model-reqs">{(model.reqsMonth / 1000).toFixed(1)}k</td>
                        <td><span className="om-model-copy" onClick={() => copyModelId(`opencode-go/${id}`)}>Copiar ID</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* CONSEJOS */}
            <div className="om-section">
              <div style={{fontSize:".78rem", textTransform:"uppercase", color:"var(--muted)", marginBottom:"1rem", fontFamily:"'DM Mono', monospace"}}>💡 Estrategia</div>
              {advices.map((a, i) => (
                <div className={`om-advice ${a.type}`} key={i}>
                  <div className="om-advice-icon">{a.icon}</div>
                  <div className="om-advice-body">
                    <h4>{a.title}</h4>
                    <p>{a.text}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* HISTORICO */}
            {showHistory && (
              <div className="om-section">
                <div style={{fontSize:".78rem", textTransform:"uppercase", color:"var(--muted)", marginBottom:"1rem", fontFamily:"'DM Mono', monospace"}}>📈 Últimos 7 días</div>
                <div style={{background:"var(--surface)", border:"1px solid var(--border)", borderRadius:"14px", padding:"1.3rem 1.4rem"}}>
                  {history.length === 0 ? (
                    <p style={{fontSize:".75rem", color:"var(--muted)"}}>Sin histórico aún</p>
                  ) : (
                    history.slice(-7).reverse().map((h, i) => (
                      <div className="om-history-item" key={i}>
                        <span className="om-history-date">{h.date}</span>
                        <div className="om-history-bars">
                          <span style={{color:"var(--cont)"}}>{h.cont}%</span>
                          <span style={{color:"var(--week)"}}>{h.week}%</span>
                          <span style={{color:"var(--month)"}}>{h.month}%</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {copyFeedback && (
        <div className="om-copy-feedback">✓ Copiado: {copyFeedback}</div>
      )}

      {syncUsageResult && (
        <div className={`om-msg ${syncUsageResult.type}`}>{syncUsageResult.msg}</div>
      )}

      {checkResult && (
        <div className={`om-msg ${checkResult.startsWith("✅") ? "success" : checkResult.startsWith("⚠️") ? "warning" : "info"}`}>{checkResult}</div>
      )}
    </div>
  );
};

export default OpenCodeMonitor;
