import React, { useState, useEffect } from "react";
import {
  Plus,
  Trash2,
  RefreshCw,
  Wallet,
  PieChart,
  DollarSign,
  Activity,
  ShieldAlert,
  XCircle,
  Edit,
  X,
  Save,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
} from "firebase/firestore";

// ------------------------------------------------------------------
//  ZONA DE CONFIGURACIÓN
// ------------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyABbxfNUY3Zr5d4RmKsP59pd6iKFruBZBY",
  authDomain: "micriptoapp.firebaseapp.com",
  projectId: "micriptoapp",
  storageBucket: "micriptoapp.firebasestorage.app",
  messagingSenderId: "1094343839118",
  appId: "1:1094343839118:web:4cf161de183507889ba8df",
  measurementId: "G-CWEKWBNZLG",
};

let db;
try {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
} catch (error) {
  console.error("Error inicializando Firebase:", error);
}

// ------------------------------------------------------------------
//  MAPA DE COLORES POR ACTIVO
// ------------------------------------------------------------------
const COIN_COLORS = {
  BTC: "bg-orange-500/20 text-orange-400 border-orange-500/40",
  ETH: "bg-indigo-500/20 text-indigo-400 border-indigo-500/40",
  SOL: "bg-purple-500/20 text-purple-400 border-purple-500/40",
  BNB: "bg-yellow-500/20 text-yellow-500 border-yellow-500/40",
  ADA: "bg-blue-600/20 text-blue-400 border-blue-600/40",
  DOGE: "bg-amber-400/20 text-amber-500 border-amber-400/40",
  LTC: "bg-slate-400/20 text-slate-300 border-slate-400/40",
  XRP: "bg-sky-500/20 text-sky-400 border-sky-500/40",
  DOT: "bg-pink-500/20 text-pink-400 border-pink-500/40",
  MATIC: "bg-violet-600/20 text-violet-400 border-violet-600/40",
  SHIB: "bg-red-500/20 text-red-400 border-red-500/40",
  AVAX: "bg-red-600/20 text-red-500 border-red-600/40",
  LINK: "bg-blue-700/20 text-blue-400 border-blue-700/40",
  DEFAULT: "bg-slate-700/20 text-slate-400 border-slate-700/40",
};

const getCoinStyle = (coin) => COIN_COLORS[coin] || COIN_COLORS.DEFAULT;

// ------------------------------------------------------------------
//  CONSTANTES DE RIESGO VERIFICADAS
// ------------------------------------------------------------------
const RISK_PARAMS = {
  Binance: { initial: 75, marginCall: 85, liquidation: 91, apy: 4.39 },
  Bybit: { initial: 80, marginCall: 85, liquidation: 92, apy: 3.98 },
};

const SYMBOL_MAP = {
  BTC: "BTCUSDT",
  ETH: "ETHUSDT",
  ADA: "ADAUSDT",
  DOGE: "DOGEUSDT",
  LTC: "LTCUSDT",
  BNB: "BNBUSDT",
  SOL: "SOLUSDT",
  XRP: "XRPUSDT",
  DOT: "DOTUSDT",
  MATIC: "MATICUSDT",
  SHIB: "SHIBUSDT",
  AVAX: "AVAXUSDT",
  LINK: "LINKUSDT",
};

const AVAILABLE_COINS = Object.keys(SYMBOL_MAP);

const DeleteButton = ({ onDelete }) => {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (confirming) {
      const timer = setTimeout(() => setConfirming(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [confirming]);

  if (confirming) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="bg-red-600 text-white px-2 py-1 rounded text-xs font-bold animate-pulse flex items-center gap-1"
      >
        <XCircle className="w-3 h-3" />
      </button>
    );
  }
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        setConfirming(true);
      }}
      className="text-slate-500 hover:text-red-400 p-1 transition-colors"
    >
      <Trash2 className="w-4 h-4" />
    </button>
  );
};

// COMPONENTE BARRA LTV PRO
const LtvProgressBar = ({ ltv, exchange }) => {
  const params = RISK_PARAMS[exchange] || RISK_PARAMS["Binance"];
  const posInit = params.initial;
  const posMargin = params.marginCall;
  const posLiq = params.liquidation;

  let statusColor = "bg-green-500";
  let statusText = "Riesgo Bajo";

  if (ltv > posInit) {
    statusColor = "bg-yellow-500";
    statusText = "Riesgo Medio";
  }
  if (ltv > posMargin) {
    statusColor = "bg-red-500 animate-pulse";
    statusText = "ALTO RIESGO";
  }

  const visualLtv = Math.min(Math.max(ltv, 0), 100);

  return (
    <div className="mt-4 mb-6 select-none">
      <div className="flex justify-between items-end mb-2">
        <div className="flex flex-col">
          <span className="text-[10px] text-slate-400 uppercase font-bold">
            LTV Actual
          </span>
          <span
            className={`text-lg font-bold ${
              ltv > posMargin ? "text-red-500" : "text-white"
            }`}
          >
            {ltv.toFixed(2)}%
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[10px] text-slate-400 uppercase font-bold">
            Estado
          </span>
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded ${
              ltv > posMargin
                ? "bg-red-500/20 text-red-400"
                : ltv > posInit
                ? "bg-yellow-500/20 text-yellow-400"
                : "bg-green-500/20 text-green-400"
            }`}
          >
            {statusText}
          </span>
        </div>
      </div>

      <div className="relative h-4 w-full bg-slate-900 rounded-full flex items-center px-1 border border-slate-700">
        <div
          className="absolute left-0 top-0 bottom-0 bg-green-900/10 rounded-l-full"
          style={{ width: `${posInit}%` }}
        ></div>
        <div
          className="absolute top-0 bottom-0 bg-yellow-900/10"
          style={{ left: `${posInit}%`, width: `${posMargin - posInit}%` }}
        ></div>
        <div
          className="absolute right-0 top-0 bottom-0 bg-red-900/10 rounded-r-full"
          style={{ left: `${posMargin}%`, width: `${100 - posMargin}%` }}
        ></div>

        <div
          className={`absolute top-1 bottom-1 left-1 rounded-full ${statusColor} transition-all duration-1000 shadow-[0_0_10px_rgba(0,0,0,0.5)]`}
          style={{ width: `calc(${visualLtv}% - 4px)` }}
        ></div>

        <div
          className="absolute top-0 bottom-0 w-0.5 bg-slate-600 z-10"
          style={{ left: `${posMargin}%` }}
        >
          <div className="absolute -top-4 -translate-x-1/2 text-[9px] text-yellow-600 font-mono font-bold">
            {posMargin}%
          </div>
          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 bg-slate-800 border-2 border-yellow-600 rounded-full"></div>
        </div>

        <div
          className="absolute top-0 bottom-0 w-0.5 bg-red-900 z-10"
          style={{ left: `${posLiq}%` }}
        >
          <div className="absolute -top-4 -translate-x-1/2 text-[9px] text-red-500 font-mono font-bold">
            {posLiq}%
          </div>
          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 bg-slate-800 border-2 border-red-500 rounded-full"></div>
        </div>
      </div>

      <div className="flex justify-between text-[9px] text-slate-500 mt-1 px-1 font-mono">
        <span>0%</span>
        <span className="text-red-400 font-bold uppercase underline">
          LIQUIDACIÓN {posLiq}%
        </span>
      </div>
    </div>
  );
};

const App = () => {
  const [portfolio, setPortfolio] = useState([]);
  const [loans, setLoans] = useState([]);
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(false);
  const [editingLoan, setEditingLoan] = useState(null);

  const [newCoin, setNewCoin] = useState("BTC");
  const [newPrice, setNewPrice] = useState("");
  const [newQty, setNewQty] = useState("");

  const [loanExchange, setLoanExchange] = useState("Bybit");
  const [loanCollateralCoin, setLoanCollateralCoin] = useState("BTC");
  const [loanCollateralQty, setLoanCollateralQty] = useState("");
  const [loanBorrowedUSDT, setLoanBorrowedUSDT] = useState("");
  const [loanAPY, setLoanAPY] = useState("");

  useEffect(() => {
    if (RISK_PARAMS[loanExchange]) setLoanAPY(RISK_PARAMS[loanExchange].apy);
  }, [loanExchange]);

  useEffect(() => {
    try {
      onSnapshot(query(collection(db, "inversiones")), (snap) => {
        setPortfolio(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      });
      onSnapshot(query(collection(db, "prestamos")), (snap) => {
        setLoans(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      });
    } catch (e) {
      console.error("Error DB:", e);
    }
  }, []);

  const fetchPrices = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        "https://api.binance.com/api/v3/ticker/price"
      );
      const data = await response.json();
      const p = {};
      data.forEach((t) => {
        const symbol = AVAILABLE_COINS.find((c) => SYMBOL_MAP[c] === t.symbol);
        if (symbol) p[symbol] = parseFloat(t.price);
      });
      p["USDT"] = 1.0;
      setPrices(p);
    } catch (e) {
      console.error("Error API:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrices();
    const i = setInterval(fetchPrices, 30000);
    return () => clearInterval(i);
  }, []);

  const handleAddInvestment = async (e) => {
    e.preventDefault();
    if (!newPrice || !newQty) return;
    await addDoc(collection(db, "inversiones"), {
      coin: newCoin,
      buyPrice: parseFloat(newPrice),
      quantity: parseFloat(newQty),
      invested: parseFloat(newPrice) * parseFloat(newQty),
      date: Date.now(),
    });
    setNewPrice("");
    setNewQty("");
  };

  const handleAddLoan = async (e) => {
    e.preventDefault();
    if (!loanCollateralQty || !loanBorrowedUSDT) return;
    await addDoc(collection(db, "prestamos"), {
      exchange: loanExchange,
      collateralCoin: loanCollateralCoin,
      collateralQty: parseFloat(loanCollateralQty),
      borrowedUSDT: parseFloat(loanBorrowedUSDT),
      apy: parseFloat(loanAPY) || 0,
      date: Date.now(),
    });
    setLoanCollateralQty("");
    setLoanBorrowedUSDT("");
  };

  const handleUpdateLoan = async (e) => {
    e.preventDefault();
    if (!editingLoan) return;
    await updateDoc(doc(db, "prestamos", editingLoan.id), {
      collateralQty: parseFloat(editingLoan.collateralQty),
      borrowedUSDT: parseFloat(editingLoan.borrowedUSDT),
      apy: parseFloat(editingLoan.apy),
    });
    setEditingLoan(null);
  };

  const handleDelete = async (col, id) => {
    try {
      await deleteDoc(doc(db, col, id));
    } catch (e) {
      console.error(e);
    }
  };

  const sortedPortfolio = portfolio
    .map((item) => {
      const currentPrice = prices[item.coin] || item.buyPrice;
      const currentValue = item.quantity * currentPrice;
      const profit = currentValue - item.invested;
      const roi = item.invested > 0 ? (profit / item.invested) * 100 : 0;
      return { ...item, currentPrice, currentValue, profit, roi };
    })
    .sort((a, b) => b.profit - a.profit);

  const totalInv = sortedPortfolio.reduce((a, b) => a + b.invested, 0);
  const totalVal = sortedPortfolio.reduce((a, b) => a + b.currentValue, 0);
  const totalPnl = totalVal - totalInv;
  const totalRoi = totalInv > 0 ? (totalPnl / totalInv) * 100 : 0;

  const processedLoans = loans.map((loan) => {
    const colVal = loan.collateralQty * (prices[loan.collateralCoin] || 0);
    const ltv = colVal > 0 ? (loan.borrowedUSDT / colVal) * 100 : 0;
    const p = RISK_PARAMS[loan.exchange] || RISK_PARAMS["Binance"];
    const liqPrice =
      (loan.borrowedUSDT * 100) / (p.liquidation * loan.collateralQty);
    return {
      ...loan,
      collateralValue: colVal,
      ltv,
      liquidationPrice: liqPrice,
    };
  });

  const fmt = (n) =>
    new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(n);
  const fmtUSD = (n) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(n);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-3 md:p-8 font-sans pb-40">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2 text-yellow-400">
              <Activity className="w-8 h-8" /> Crypto Command
            </h1>
            <p className="text-slate-400 text-xs mt-1 uppercase tracking-widest font-bold">
              LTV Flexible: Binance (91%) / Bybit (92%)
            </p>
          </div>
          <button
            onClick={fetchPrices}
            disabled={loading}
            className="bg-yellow-600 p-2 rounded-lg hover:bg-yellow-500 transition-colors shadow-lg active:scale-95"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="mb-8">
          <h2 className="text-xs font-bold text-slate-500 mb-4 uppercase tracking-widest flex items-center gap-2 border-b border-slate-800 pb-2">
            <Wallet className="w-4 h-4 text-blue-400" /> Resumen Spot
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 relative shadow-lg">
              <p className="text-[10px] text-slate-500 uppercase font-bold">
                Total Invertido
              </p>
              <p className="text-2xl font-bold text-white">
                {fmtUSD(totalInv)}
              </p>
              <DollarSign className="absolute right-4 top-4 text-slate-700 w-10 h-10 opacity-20" />
            </div>
            <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 relative shadow-lg">
              <p className="text-[10px] text-slate-500 uppercase font-bold">
                Valor Actual
              </p>
              <p className="text-2xl font-bold text-blue-300">
                {fmtUSD(totalVal)}
              </p>
              <PieChart className="absolute right-4 top-4 text-slate-700 w-10 h-10 opacity-20" />
            </div>
            <div
              className={`p-5 rounded-xl border shadow-lg relative overflow-hidden ${
                totalPnl >= 0
                  ? "bg-green-900/10 border-green-900/50"
                  : "bg-red-900/10 border-red-900/50"
              }`}
            >
              <p className="text-[10px] text-slate-500 uppercase font-bold">
                PNL Global
              </p>
              <p
                className={`text-2xl font-bold ${
                  totalPnl >= 0 ? "text-green-400" : "text-red-400"
                }`}
              >
                {totalPnl >= 0 ? "+" : ""}
                {fmtUSD(totalPnl)}
              </p>
              <p
                className={`text-sm font-bold mt-1 ${
                  totalPnl >= 0 ? "text-green-500" : "text-red-500"
                }`}
              >
                {totalRoi.toFixed(2)}%
              </p>
              <TrendingUp
                className={`absolute right-4 top-4 w-10 h-10 opacity-20 ${
                  totalPnl >= 0 ? "text-green-500" : "text-red-500"
                }`}
              />
            </div>
          </div>
        </div>

        <div className="mb-10">
          <h2 className="text-xs font-bold text-slate-500 mb-4 uppercase tracking-widest flex items-center gap-2 border-b border-slate-800 pb-2">
            <Activity className="w-4 h-4 text-emerald-500" /> Detalle de Activos
          </h2>
          <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-xl">
            <div className="md:hidden divide-y divide-slate-700">
              {sortedPortfolio.map((item) => (
                <div
                  key={item.id}
                  className="p-4 flex justify-between items-center"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 border rounded-full flex items-center justify-center font-bold text-[11px] shadow-sm ${getCoinStyle(
                        item.coin
                      )}`}
                    >
                      {item.coin}
                    </div>
                    <div>
                      <p className="font-bold text-white text-sm">
                        {item.coin}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {fmt(item.quantity)} u.
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-white">
                      {fmtUSD(item.currentValue)}
                    </p>
                    <p
                      className={`text-xs font-bold ${
                        item.profit >= 0 ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {item.profit >= 0 ? "+" : ""}
                      {fmtUSD(item.profit)}
                    </p>
                  </div>
                  <DeleteButton
                    onDelete={() => handleDelete("inversiones", item.id)}
                  />
                </div>
              ))}
            </div>
            <table className="hidden md:table w-full text-left text-sm">
              <thead className="bg-slate-950 text-slate-500 uppercase text-[10px] tracking-widest">
                <tr>
                  <th className="p-5">Activo</th>
                  <th className="p-5 text-right">Compra Avg</th>
                  <th className="p-5 text-right">Precio Actual</th>
                  <th className="p-5 text-right">PNL Neto</th>
                  <th className="p-5 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {sortedPortfolio.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-700/20 transition-colors font-sans"
                  >
                    <td className="p-5 font-bold flex gap-3 items-center">
                      <span
                        className={`border px-3 py-1.5 rounded-xl text-xs font-black shadow-sm tracking-tighter ${getCoinStyle(
                          item.coin
                        )}`}
                      >
                        {item.coin}
                      </span>
                    </td>
                    <td className="p-5 text-right text-slate-500 font-mono italic">
                      {fmtUSD(item.buyPrice)}
                    </td>
                    <td className="p-5 text-right text-yellow-300 font-mono font-bold">
                      {fmtUSD(item.currentPrice)}
                    </td>
                    <td className="p-5 text-right">
                      <div
                        className={`font-bold ${
                          item.profit >= 0 ? "text-green-400" : "text-red-400"
                        }`}
                      >
                        {item.profit >= 0 ? "+" : ""}
                        {fmtUSD(item.profit)}
                      </div>
                      <div
                        className={`text-[10px] font-bold ${
                          item.profit >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {item.roi.toFixed(2)}%
                      </div>
                    </td>
                    <td className="p-5 text-center">
                      <DeleteButton
                        onDelete={() => handleDelete("inversiones", item.id)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {loans.length > 0 && (
          <div className="mb-12">
            <h2 className="text-xs font-bold text-slate-500 mb-4 uppercase tracking-widest flex items-center gap-2 border-b border-slate-800 pb-2">
              <ShieldAlert className="w-4 h-4 text-orange-400" /> Monitor de
              Riesgo (LTV)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {processedLoans.map((loan) => (
                <div
                  key={loan.id}
                  className="bg-slate-800 p-5 rounded-2xl border border-slate-700 shadow-xl relative overflow-hidden group"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-3">
                      <span
                        className={`text-[10px] font-bold px-2 py-1 rounded ${
                          loan.exchange === "Bybit"
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
                          <span className="text-yellow-500 font-bold">
                            {loan.apy}%
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setEditingLoan(loan)}
                        className="bg-slate-700 p-1.5 rounded hover:bg-blue-600 transition-colors"
                      >
                        <Edit className="w-3 h-3 text-white" />
                      </button>
                      <DeleteButton
                        onDelete={() => handleDelete("prestamos", loan.id)}
                      />
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
                        <AlertTriangle className="w-3 h-3 text-red-500" />{" "}
                        Precio Liquidación
                      </p>
                      <p className="font-mono font-bold text-red-400 text-lg tracking-tighter">
                        {fmtUSD(loan.liquidationPrice)}
                      </p>
                      <p className="text-[9px] text-slate-600 font-bold">
                        Calculado al {RISK_PARAMS[loan.exchange]?.liquidation}%
                        LTV
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="border-t-2 border-slate-800 pt-10 mt-12 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-slate-800 p-8 rounded-3xl border border-slate-700 shadow-xl">
            <h3 className="text-yellow-500 font-bold mb-6 flex gap-2 uppercase text-xs tracking-widest">
              <Plus className="w-5 h-5" /> Registrar Inversión Spot
            </h3>
            <form onSubmit={handleAddInvestment} className="space-y-4">
              <select
                value={newCoin}
                onChange={(e) => setNewCoin(e.target.value)}
                className="w-full bg-slate-900 border-slate-700 rounded-xl p-4 text-white outline-none focus:ring-2 focus:ring-yellow-500 transition-all"
              >
                {AVAILABLE_COINS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-4">
                <input
                  type="number"
                  step="any"
                  placeholder="Precio Compra"
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  className="bg-slate-900 border-slate-700 rounded-xl p-4 text-white outline-none focus:ring-2 focus:ring-yellow-500"
                />
                <input
                  type="number"
                  step="any"
                  placeholder="Cantidad"
                  value={newQty}
                  onChange={(e) => setNewQty(e.target.value)}
                  className="bg-slate-900 border-slate-700 rounded-xl p-4 text-white outline-none focus:ring-2 focus:ring-yellow-500"
                />
              </div>
              <button className="w-full bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-4 rounded-2xl shadow-lg active:scale-95 transition-all uppercase text-xs tracking-widest">
                Añadir al Portafolio
              </button>
            </form>
          </div>
          <div className="bg-slate-800/40 p-8 rounded-3xl border border-slate-700 border-dashed">
            <h3 className="text-orange-400 font-bold mb-6 flex gap-2 uppercase text-xs tracking-widest">
              <ShieldAlert className="w-5 h-5" /> Gestión de Deuda (LTV)
            </h3>
            <form onSubmit={handleAddLoan} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <select
                  value={loanExchange}
                  onChange={(e) => setLoanExchange(e.target.value)}
                  className="bg-slate-900 border-slate-700 rounded-xl p-4 text-white outline-none"
                >
                  <option value="Binance">Binance</option>
                  <option value="Bybit">Bybit</option>
                </select>
                <input
                  type="number"
                  placeholder="APY % (Anual)"
                  value={loanAPY}
                  onChange={(e) => setLoanAPY(e.target.value)}
                  className="bg-slate-900 border-slate-700 rounded-xl p-4 text-white outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <input
                type="number"
                placeholder="Monto Deuda (USDT)"
                value={loanBorrowedUSDT}
                onChange={(e) => setLoanBorrowedUSDT(e.target.value)}
                className="w-full bg-slate-900 border-slate-700 rounded-xl p-4 text-white outline-none"
              />
              <input
                type="number"
                placeholder="Colateral Cant. (BTC)"
                value={loanCollateralQty}
                onChange={(e) => setLoanCollateralQty(e.target.value)}
                className="w-full bg-slate-900 border-slate-700 rounded-xl p-4 text-white outline-none"
              />
              <button className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-4 rounded-2xl shadow-lg transition-all active:scale-95 uppercase text-xs tracking-widest">
                Monitorizar Préstamo
              </button>
            </form>
          </div>
        </div>
      </div>

      {editingLoan && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[200] p-4">
          <div className="bg-slate-800 w-full max-w-md rounded-3xl border border-slate-600 p-8 shadow-2xl scale-100 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-xl font-bold text-white flex items-center gap-2 tracking-tight">
                <Edit className="w-5 h-5 text-blue-500" /> Modificar Datos
              </h3>
              <button
                onClick={() => setEditingLoan(null)}
                className="p-2 hover:bg-slate-700 rounded-full transition-colors"
              >
                <X className="text-slate-500 hover:text-white" />
              </button>
            </div>
            <form onSubmit={handleUpdateLoan} className="space-y-5">
              <div>
                <label className="text-[10px] text-slate-500 font-bold uppercase mb-1 block">
                  Deuda (USDT)
                </label>
                <input
                  type="number"
                  step="any"
                  value={editingLoan.borrowedUSDT}
                  onChange={(e) =>
                    setEditingLoan({
                      ...editingLoan,
                      borrowedUSDT: e.target.value,
                    })
                  }
                  className="w-full bg-slate-900 border-slate-700 rounded-xl p-4 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 font-bold uppercase mb-1 block">
                  Colateral (BTC)
                </label>
                <input
                  type="number"
                  step="any"
                  value={editingLoan.collateralQty}
                  onChange={(e) =>
                    setEditingLoan({
                      ...editingLoan,
                      collateralQty: e.target.value,
                    })
                  }
                  className="w-full bg-slate-900 border-slate-700 rounded-xl p-4 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 font-bold uppercase mb-1 block">
                  APY %
                </label>
                <input
                  type="number"
                  step="any"
                  value={editingLoan.apy}
                  onChange={(e) =>
                    setEditingLoan({ ...editingLoan, apy: e.target.value })
                  }
                  className="w-full bg-slate-900 border-slate-700 rounded-xl p-4 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                />
              </div>
              <button className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl flex justify-center gap-2 shadow-lg transition-all active:scale-95 uppercase text-xs tracking-widest mt-4">
                <Save className="w-4 h-4" /> Guardar Cambios
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
