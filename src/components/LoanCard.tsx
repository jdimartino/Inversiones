import React from "react";
import { ShieldAlert, Edit, AlertTriangle } from "lucide-react";
import { RISK_PARAMS, ProcessedLoan } from "../lib/constants";
import { fmt, fmtUSD } from "../lib/format";
import LtvProgressBar from "./LtvProgressBar";
import DeleteButton from "./DeleteButton";

interface LoanCardProps {
    loan: ProcessedLoan;
    onEdit: (loan: ProcessedLoan) => void;
    onDelete: (id: string) => void;
}

const LoanCard: React.FC<LoanCardProps> = React.memo(
    ({ loan, onEdit, onDelete }) => (
        <div className="bg-slate-800 p-5 rounded-2xl border border-slate-700 shadow-xl relative overflow-hidden group">
            <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-3">
                    <span
                        className={`text-[10px] font-bold px-2 py-1 rounded ${loan.exchange === "Bybit"
                            ? "bg-black text-white border border-slate-600"
                            : "bg-yellow-500 text-black"
                            }`}
                    >
                        {loan.exchange}
                    </span>
                    <div>
                        <p className="font-bold text-white text-base leading-tight">
                            {fmtUSD(loan.borrowedUSDT)}{" "}
                            <span className="text-[10px] text-slate-500 font-normal">
                                DEUDA
                            </span>
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5 font-bold">
                            APY:{" "}
                            <span className="text-yellow-500 font-bold">{loan.apy}%</span>
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={() => onEdit(loan)}
                        className="bg-slate-700 p-1.5 rounded hover:bg-blue-600 transition-colors"
                    >
                        <Edit className="w-3 h-3 text-white" />
                    </button>
                    <DeleteButton onDelete={() => onDelete(loan.id)} />
                </div>
            </div>

            <LtvProgressBar ltv={loan.ltv} exchange={loan.exchange} />

            <div className="grid grid-cols-2 gap-4 bg-slate-900/50 p-3 rounded-xl border border-slate-700/50">
                <div>
                    <p className="text-[10px] uppercase text-slate-500 font-bold mb-1">
                        Colateral
                    </p>
                    <p className="font-mono text-slate-200 font-bold text-sm">
                        {fmt(loan.collateralQty)} {loan.collateralCoin}
                    </p>
                    <p className="text-[10px] text-blue-400 font-bold mt-0.5">
                        {fmtUSD(loan.collateralValue)}
                    </p>
                </div>
                <div className="text-right">
                    <p className="text-[10px] uppercase text-slate-500 font-bold mb-1 flex items-center justify-end gap-1">
                        <AlertTriangle className="w-3 h-3 text-red-500" /> Precio
                        Liquidación
                    </p>
                    <p className="font-mono font-bold text-red-400 text-lg tracking-tighter">
                        {fmtUSD(loan.liquidationPrice)}
                    </p>
                    <p className="text-[9px] text-slate-600 font-bold">
                        Calculado al {RISK_PARAMS[loan.exchange]?.liquidation}% LTV
                    </p>
                </div>
            </div>
        </div>
    )
);

LoanCard.displayName = "LoanCard";

interface LoanSectionProps {
    loans: ProcessedLoan[];
    onEdit: (loan: ProcessedLoan) => void;
    onDelete: (id: string) => void;
}

export const LoanSection: React.FC<LoanSectionProps> = React.memo(
    ({ loans, onEdit, onDelete }) => {
        if (loans.length === 0) return null;

        return (
            <div className="mb-12">
                <h2 className="text-xs font-bold text-slate-500 mb-4 uppercase tracking-widest flex items-center gap-2 border-b border-slate-800 pb-2">
                    <ShieldAlert className="w-4 h-4 text-orange-400" /> Monitor de Riesgo
                    (LTV)
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {loans.map((loan) => (
                        <LoanCard
                            key={loan.id}
                            loan={loan}
                            onEdit={onEdit}
                            onDelete={onDelete}
                        />
                    ))}
                </div>
            </div>
        );
    }
);

LoanSection.displayName = "LoanSection";

export default LoanCard;
