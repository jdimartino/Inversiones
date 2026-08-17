export function fmtVol(v: number): string {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
    return v.toFixed(0);
}

export function fmtMeasureTime(sec: number | null, interval: string): string {
    if (sec === null) return "—";
    const d = new Date(sec * 1000);
    const day = d.getDate().toString().padStart(2, "0");
    const months = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    const mon = months[d.getMonth()];
    const yr = d.getFullYear();
    if (interval === "1d" || interval === "1M") return `${day} ${mon} ${yr}`;
    const hh = d.getHours().toString().padStart(2, "0");
    const mm = d.getMinutes().toString().padStart(2, "0");
    return `${day} ${mon}  ${hh}:${mm}`;
}

export function signalDotColor(sig?: string): string | null {
    if (sig === "strong_buy") return "#16a34a";
    if (sig === "buy") return "#4ade80";
    if (sig === "hold") return "#94a3b8";
    if (sig === "sell") return "#f97316";
    if (sig === "strong_sell") return "#ef4444";
    return null;
}
