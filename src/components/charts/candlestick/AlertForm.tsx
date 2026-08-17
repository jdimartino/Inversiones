import React from "react";
import type { Dispatch, SetStateAction } from "react";
import { fmtPrice } from "../../../lib/format";

interface AlertFormProps {
    selectedCoin: string;
    currentPrice: number;
    alertTarget: number;
    setAlertTarget: Dispatch<SetStateAction<number>>;
    alertDirection: 'up' | 'down';
    setAlertDirection: Dispatch<SetStateAction<'up' | 'down'>>;
    alertPersistent: boolean;
    setAlertPersistent: Dispatch<SetStateAction<boolean>>;
    alertNote: string;
    setAlertNote: Dispatch<SetStateAction<string>>;
    alertSaved: boolean;
    handleSaveChartAlert: () => void;
    onClose: () => void;
}

const AlertForm: React.FC<AlertFormProps> = ({
    selectedCoin,
    currentPrice,
    alertTarget,
    setAlertTarget,
    alertDirection,
    setAlertDirection,
    alertPersistent,
    setAlertPersistent,
    alertNote,
    setAlertNote,
    alertSaved,
    handleSaveChartAlert,
    onClose,
}) => {
    return (
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 flex flex-wrap items-center gap-2">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">🔔 {selectedCoin}</span>
            {currentPrice > 0 && (
                (alertDirection === 'up' && currentPrice >= alertTarget) ||
                (alertDirection === 'down' && currentPrice <= alertTarget)
            ) && (
                <span className="w-full text-[10px] font-bold text-yellow-400">
                    ⚠️ El precio actual ya {alertDirection === 'up' ? 'supera' : 'está por debajo de'} {fmtPrice(alertTarget)} — se disparará en el próximo ciclo
                </span>
            )}
            <input
                type="number"
                value={alertTarget}
                onChange={e => {
                    const v = parseFloat(e.target.value) || 0;
                    setAlertTarget(v);
                    setAlertDirection(v >= currentPrice ? 'up' : 'down');
                }}
                className="w-28 h-7 bg-slate-800 border border-slate-700 rounded px-2 text-xs font-bold text-white text-center focus:outline-none focus:border-yellow-500"
            />
            <button
                onClick={() => setAlertDirection('up')}
                className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors ${alertDirection === 'up' ? 'bg-green-500/20 text-green-400 border-green-500/40' : 'bg-slate-800 text-slate-500 border-slate-700 hover:text-green-400'}`}
            >▲ Sube a</button>
            <button
                onClick={() => setAlertDirection('down')}
                className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors ${alertDirection === 'down' ? 'bg-red-500/20 text-red-400 border-red-500/40' : 'bg-slate-800 text-slate-500 border-slate-700 hover:text-red-400'}`}
            >▼ Baja a</button>
            <button
                onClick={() => setAlertPersistent(v => !v)}
                className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors ${alertPersistent ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40' : 'bg-slate-800 text-slate-500 border-slate-700 hover:text-yellow-400'}`}
            >{alertPersistent ? '∞ Perm.' : '1x Vez'}</button>
            <input
                type="text"
                placeholder="Nota..."
                value={alertNote}
                onChange={e => setAlertNote(e.target.value)}
                maxLength={100}
                className="flex-1 min-w-[80px] h-7 bg-slate-800 border border-slate-700 rounded px-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-slate-500"
            />
            <button
                onClick={handleSaveChartAlert}
                disabled={alertSaved}
                className={`px-3 py-1 rounded text-[10px] font-bold transition-colors disabled:opacity-70 ${
                    currentPrice > 0 && (
                        (alertDirection === 'up' && currentPrice >= alertTarget) ||
                        (alertDirection === 'down' && currentPrice <= alertTarget)
                    )
                        ? 'bg-orange-500 text-white hover:bg-orange-400'
                        : 'bg-yellow-500 text-slate-900 hover:bg-yellow-400'
                }`}
            >{alertSaved ? '✅' : '+ Agregar'}</button>
            <button onClick={onClose} className="text-slate-500 hover:text-white text-xs leading-none">✕</button>
        </div>
    );
};

export default AlertForm;