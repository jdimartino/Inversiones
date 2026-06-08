# Plan: Tab LIQUIDEZ

## Resumen

Crear un tab "Liquidez" con persistencia automática en Firestore, incluyendo:
- Sección 1: Flujo de Caja (Saldos Bancos + Efectivo + USDT Binance Fondos)
- Sección 2: Liquidez en BTC (BTC manual × Precio BTC/USDT en tiempo real)
- Resumen total
- Debounce 500ms, LocalStorage cache, indicador "Guardado hace Xs"

## Archivos nuevos (3)

### 1. `functions/src/getBinanceWallet.ts`
Cloud Function HTTP que obtiene balances de Binance (Funding + Spot):

```
- Usa FUNCTIONS_CONFIG_EXPORT (mismo patrón que futuresSync.ts)
- POST /sapi/v1/asset/get-funding-asset para Funding Wallet
- GET /sapi/v1/account para Spot balances
- Retorna { USDT: 123.45, BTC: 0.5, ... } (total por asset)
- CORS headers, timeout 10s, error handling
- Siguiendo el patrón exacto de getBinancePrices.ts y futuresSync.ts
```

### 2. `src/hooks/useLiquidez.ts`
Hook React con persistencia Firestore + debounce + LocalStorage cache:

```
Firestore doc: settings/liquidezData
Campos: { saldoBancos: number, efectivo: number, btcDisponible: number, updatedAt: number }

LocalStorage key: "liquidez_cache"

Estado expuesto:
  - liquidez: { saldoBancos, efectivo, btcDisponible }
  - updateLiquidez(field, value): actualiza campo con debounce 500ms
  - saveStatus: "idle" | "guardando" | "guardado" | "error"
  - lastSavedAt: number | null
  - loading, error

Flujo:
  1. onSnapshot(settings/liquidezData) → BD es fuente de verdad
  2. Si doc no existe → lee LocalStorage("liquidez_cache") → defaults(0)
  3. Input change → setState local → debounced 500ms → setDoc Firestore + localStorage
  4. On setDoc success: saveStatus="guardado", lastSavedAt=now
  5. On setDoc error: saveStatus="error" → auto-retry 2s
  6. Timer cada 1s actualiza "Guardado hace Xs" en UI

También: useBinanceFundingBalance() hook
  - Llama Cloud Function getBinanceWallet cada 60s
  - Retorna { wallet: Record<string, number>, usdtFunding: number, loading, error }
  - Usado para mostrar USDT en billetera Fondos
```

### 3. `src/components/LiquidezTab.tsx`
Componente UI principal:

```
Layout:
┌─ Card FLUJO DE CAJA ──────────────────────────┐
│  💰 Flujo de Caja                               │
│  ┌ Saldos Bancos  [________] USDT               │
│  ┌ Efectivo        [________] USDT               │
│  ┌ USDT Binance    1,234.56 USDT  (auto, verde) │
│  ════════════════════════════                    │
│  TOTAL FLUJO DE CAJA     $5,000.00              │
└──────────────────────────────────────────────────┘

┌─ Card LIQUIDEZ EN BTC ─────────────────────────┐
│  ₿ Liquidez en BTC                              │
│  ┌ BTC Disponible  [0.xxxxxxxx]                 │
│  ┌ Precio BTC      $67,432.00  (auto, tiempo   │
│  │                            real desde API)   │
│  ════════════════════════════                    │
│  TOTAL LIQUIDEZ BTC     $13,486.40              │
└──────────────────────────────────────────────────┘

┌─ Card RESUMEN ──────────────────────────────────┐
│  💎 LIQUIDEZ TOTAL          $18,486.40          │
│                                           ● Guardado hace 5s│
└──────────────────────────────────────────────────┘

Estilos:
- Dark theme consistente: bg-slate-900, border-slate-700/50, rounded-xl
- Números grandes con formato $XX,XXX.XX
- Inputs con bg-slate-800 border-slate-700
- Valores auto en verde (text-green-400)
- Indicador estado: "Guardando..." amarillo, "Guardado hace Xs" verde, "Error" rojo
- Animación animate-fadeIn en mount
```

## Archivos modificados (3)

### 4. `src/components/NavBar.tsx`
```diff
+ import { Droplets } from "lucide-react";

- export type TabId = "inicio" | "dashboard" | "futuros" | "prestamos" | "graficos" | "configuracion" | "venta" | "operaciones" | "monitor";
+ export type TabId = "inicio" | "dashboard" | "futuros" | "prestamos" | "graficos" | "configuracion" | "venta" | "operaciones" | "monitor" | "liquidez";

En TABS array, agregar:
+ { id: "liquidez", label: "Liquidez", icon: <Droplets className="w-4 h-4" /> },
```

### 5. `src/App.tsx`
```diff
+ const LiquidezTab = React.lazy(() => import("./components/LiquidezTab"));

+ {activeTab === "liquidez" && (
+   <div key="liquidez" className={tabClass}>
+     <Suspense fallback={<div className="py-20 text-center text-slate-500 text-sm">Cargando...</div>}>
+       <LiquidezTab />
+     </Suspense>
+   </div>
+ )}
```

### 6. `functions/src/index.ts`
```diff
+ import { getBinanceWallet } from "./getBinanceWallet";

- export { testFutures, futuresSync, testFuturesAlerts, getBinancePrices, getFuturesTrades, proxyFetch };
+ export { testFutures, futuresSync, testFuturesAlerts, getBinancePrices, getFuturesTrades, proxyFetch, getBinanceWallet };
```

## Notas de implementación

- **Sin dependencias nuevas**: debounce con useRef + setTimeout, no lodash
- **Firestore doc auto-creado**: settings/liquidezData se crea en primer setDoc
- **Cloud Function**: reutiliza FUNCTIONS_CONFIG_EXPORT (same API keys)
- **Precio BTC**: ya disponible via usePrices hook existente
- **Guardado**: LocalStorage como cache rápido, Firestore como fuente de verdad