import React from "react";

interface ChartCardProps {
    children: React.ReactNode;
    title?: string;
    subtitle?: string;
    hideTitleOnMobile?: boolean;
}

const ChartCard: React.FC<ChartCardProps> = ({ children, title, subtitle, hideTitleOnMobile }) => (
    <div className="bg-slate-800 rounded-xl border border-slate-700/50 shadow-xl p-2 flex flex-col gap-1 overflow-x-hidden">
        {title && (
            <div className={hideTitleOnMobile ? "hidden sm:block" : ""}>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">{title}</h3>
                {subtitle && <p className="text-[10px] text-slate-600 mt-0.5">{subtitle}</p>}
            </div>
        )}
        {children}
    </div>
);

export default ChartCard;
