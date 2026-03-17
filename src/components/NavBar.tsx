import React from "react";
import {
    LayoutDashboard,
    BarChart3,
    CreditCard,
    PlusCircle,
    Send,
} from "lucide-react";

export type TabId = "dashboard" | "graficos" | "prestamos" | "operaciones" | "configuracion";

interface Tab {
    id: TabId;
    label: string;
    icon: React.ReactNode;
}

const TABS: Tab[] = [
    { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: "configuracion", label: "Telegram", icon: <Send className="w-4 h-4" /> },
    { id: "graficos", label: "Gráficos", icon: <BarChart3 className="w-4 h-4" /> },
    { id: "prestamos", label: "Préstamos", icon: <CreditCard className="w-4 h-4" /> },
    { id: "operaciones", label: "Operaciones", icon: <PlusCircle className="w-4 h-4" /> },
];

interface NavBarProps {
    active: TabId;
    onChange: (tab: TabId) => void;
}

const NavBar: React.FC<NavBarProps> = ({ active, onChange }) => {
    return (
        <nav className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800 mb-4 sm:mb-8">
            <div className="max-w-6xl mx-auto px-3 md:px-8">
                <div className="flex overflow-x-auto no-scrollbar gap-0.5 sm:gap-1 py-1.5 sm:py-2">
                    {TABS.map((tab) => {
                        const isActive = tab.id === active;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => onChange(tab.id)}
                                className={`
                  flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap
                  transition-all duration-200 flex-shrink-0
                  ${isActive
                                        ? "bg-yellow-500 text-slate-900 shadow-lg shadow-yellow-500/20 scale-105"
                                        : "text-slate-400 hover:text-white hover:bg-slate-800 active:scale-95"
                                    }
                `}
                            >
                                {tab.icon}
                                <span className="hidden sm:block">{tab.label}</span>
                                <span className="sm:hidden">{tab.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </nav>
    );
};

export default NavBar;
