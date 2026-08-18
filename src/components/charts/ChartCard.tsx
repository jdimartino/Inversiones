import React from "react";

const ChartCard: React.FC<{ title: string; subtitle?: string; children: React.ReactNode; hideTitleOnMobile?: boolean }> = ({
    title,
    subtitle,
    children,
    hideTitleOnMobile,
}) => (
    <div className="bg-slate-800 rounded-xl border border-slate-700/50 shadow-xl p-4 flex flex-col gap-3 overflow-x-hidden">
        <div className={hideTitleOnMobile ? "hidden sm:block" : ""}>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">{title}</h3>
            {subtitle && <p className="text-[10px] text-slate-600 mt-0.5">{subtitle}</p>}
        </div>
        {children}
    </div>
);

export default ChartCard;
