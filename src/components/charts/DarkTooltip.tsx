import React from "react";
import { fmtPrice } from "../../lib/format";

const DarkTooltip = ({
    active,
    payload,
    label,
}: {
    active?: boolean;
    payload?: { name: string; value: number; payload?: { pnl?: number; coin?: string } }[];
    label?: string;
}) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs shadow-xl">
            {label && <p className="text-slate-400 font-bold mb-1">{label}</p>}
            {payload.map((p) => (
                <p key={p.name} style={{ color: "#fff" }}>
                    <span className="text-slate-400">{p.name}: </span>
                    {typeof p.value === "number" ? fmtPrice(p.value) : p.value}
                </p>
            ))}
        </div>
    );
};

export default DarkTooltip;
