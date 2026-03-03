import React, { useState, useEffect } from "react";
import { Bell, Save, Plus, Trash2 } from "lucide-react";
import { useAlerts, AssetAlert } from "../hooks/useAlerts";
import { usePortfolio } from "../hooks/usePortfolio";

export default function AlertSettings() {
    const { config, loading, saveConfig } = useAlerts();
    const { portfolio } = usePortfolio();

    const [minPNL, setMin] = useState(config.minPNL);
    const [maxPNL, setMax] = useState(config.maxPNL);
    const [assetAlerts, setAssetAlerts] = useState<Record<string, AssetAlert>>(config.assetAlerts || {});

    const [selectedCoin, setSelectedCoin] = useState("");
    const [assetMin, setAssetMin] = useState(-10);
    const [assetMax, setAssetMax] = useState(20);

    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setMin(config.minPNL);
        setMax(config.maxPNL);
        setAssetAlerts(config.assetAlerts || {});
    }, [config]);

    useEffect(() => {
        if (!selectedCoin && portfolio.length > 0) {
            setSelectedCoin(portfolio[0].coin);
        }
    }, [portfolio, selectedCoin]);

    const handleSave = async () => {
        setSaving(true);
        await saveConfig({ minPNL, maxPNL, assetAlerts });
        setSaving(false);
        alert("¡Configuración de alertas guardada exitosamente!");
    };

    const handleAddAssetAlert = () => {
        if (!selectedCoin) return;
        setAssetAlerts((prev) => ({
            ...prev,
            [selectedCoin]: { minPercent: assetMin, maxPercent: assetMax }
        }));
    };

    const handleRemoveAssetAlert = (coin: string) => {
        setAssetAlerts((prev) => {
            const next = { ...prev };
            delete next[coin];
            return next;
        });
    };

    if (loading) return null;

    const uniqueCoins = Array.from(new Set(portfolio.map((i) => i.coin)));

    return (
        <div className="bg-slate-800 rounded-xl p-6 shadow-xl border border-slate-700 mt-8 mb-8">
            <div className="flex items-center gap-3 mb-6">
                <Bell className="w-6 h-6 text-yellow-400" />
                <h2 className="text-xl font-bold font-heading">Alertas de Telegram 🔔</h2>
            </div>

            <p className="text-sm text-slate-400 mb-6">
                Configura los límites para recibir un mensaje automático si tu PNL (Global o por Moneda) se sale del rango. El robot revisa estos valores cada hora.
            </p>

            {/* Global Alerts */}
            <div className="bg-slate-900/50 p-4 rounded-lg mb-6 border border-slate-700/50">
                <h3 className="font-bold text-slate-200 mb-4">🌎 Alertas Globales (PNL Total en USD)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-xs font-medium text-slate-400 mb-2">
                            Límite Inferior (Alerta Pérdida)
                        </label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                            <input
                                type="number"
                                value={minPNL}
                                onChange={(e) => setMin(Number(e.target.value))}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 pl-8 pr-4 focus:ring-2 focus:ring-yellow-400 text-sm"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-400 mb-2">
                            Límite Superior (Ganancia Meta)
                        </label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                            <input
                                type="number"
                                value={maxPNL}
                                onChange={(e) => setMax(Number(e.target.value))}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 pl-8 pr-4 focus:ring-2 focus:ring-yellow-400 text-sm"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Asset Specific Alerts */}
            <div className="bg-slate-900/50 p-4 rounded-lg mb-6 border border-slate-700/50">
                <h3 className="font-bold text-slate-200 mb-4">🪙 Alertas por Activo (% ROI Neto)</h3>

                <div className="flex flex-col md:flex-row gap-3 items-end mb-4">
                    <div className="flex-1">
                        <label className="block text-xs font-medium text-slate-400 mb-2">Moneda</label>
                        <select
                            value={selectedCoin}
                            onChange={(e) => setSelectedCoin(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-yellow-400"
                        >
                            <option value="">Selecciona...</option>
                            {uniqueCoins.map((c) => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex-1">
                        <label className="block text-xs font-medium text-slate-400 mb-2">Min % (Pérdida)</label>
                        <div className="relative">
                            <input
                                type="number"
                                value={assetMin}
                                onChange={(e) => setAssetMin(Number(e.target.value))}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 pr-8 text-sm focus:ring-2 focus:ring-red-400"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">%</span>
                        </div>
                    </div>
                    <div className="flex-1">
                        <label className="block text-xs font-medium text-slate-400 mb-2">Max % (Ganancia)</label>
                        <div className="relative">
                            <input
                                type="number"
                                value={assetMax}
                                onChange={(e) => setAssetMax(Number(e.target.value))}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 pr-8 text-sm focus:ring-2 focus:ring-green-400"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">%</span>
                        </div>
                    </div>
                    <button
                        onClick={handleAddAssetAlert}
                        className="bg-slate-700 hover:bg-slate-600 text-white p-2 text-sm rounded-lg flex items-center justify-center transition-colors h-[38px] w-full md:w-auto px-4"
                    >
                        <Plus className="w-4 h-4 mr-1" /> Añadir
                    </button>
                </div>

                {/* List of active rules */}
                {Object.keys(assetAlerts).length > 0 ? (
                    <div className="space-y-2 mt-4">
                        <div className="text-xs text-slate-400 font-bold uppercase mb-2">Reglas Activas</div>
                        {Object.entries(assetAlerts).map(([coin, rules]) => (
                            <div key={coin} className="flex justify-between items-center bg-slate-800 p-3 rounded border border-slate-700">
                                <div>
                                    <span className="font-bold text-yellow-400 mr-2">{coin}</span>
                                    <span className="text-xs text-slate-300">
                                        Avisar si cae de <span className="text-red-400 font-bold">{rules.minPercent}%</span> o supera <span className="text-green-400 font-bold">+{rules.maxPercent}%</span>
                                    </span>
                                </div>
                                <button
                                    onClick={() => handleRemoveAssetAlert(coin)}
                                    className="text-slate-500 hover:text-red-400 transition-colors p-1"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-xs text-slate-500 italic mt-4 text-center py-2">
                        No hay alertas individuales configuradas.
                    </div>
                )}
            </div>

            <div className="mt-6 flex justify-end">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 bg-yellow-500 text-slate-900 font-bold px-6 py-2 rounded-lg hover:bg-yellow-400 transition-colors shadow-lg shadow-yellow-500/20 active:scale-95 disabled:opacity-50"
                >
                    <Save className="w-4 h-4" />
                    {saving ? "Guardando..." : "Guardar Todo"}
                </button>
            </div>
        </div>
    );
}
