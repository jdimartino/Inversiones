# Inversiones — Chart Refactor Skill

## 1. Propósito

Este Skill define las reglas para modificar el módulo de gráficos del proyecto **Inversiones**.

Aplicar cuando se trabaje con:

- CandlestickChart
- Lightweight Charts
- indicadores
- price lines
- herramientas de dibujo
- datos de mercado
- componentes relacionados

## 2. Regla principal

Todo cambio debe priorizar:

1. Mantener comportamiento existente.
2. Minimizar riesgo.
3. Separar responsabilidades.
4. Validar antes de continuar.

Nunca mezclar en el mismo paso:

- refactor estructural
- nuevas funcionalidades
- cambios visuales importantes

## 3. Arquitectura actual

```
CandlestickChart.tsx  (componente orquestador)
│
├── Hooks
│   ├── useChartKlines
│   ├── useChartSeries
│   ├── useChartPriceLines
│   └── useMeasureTool
│
├── Services
│   └── klineService
│
├── Lib
│   ├── indicators.ts
│   └── types/chart.ts
│
└── Componentes UI
    ├── ChartToolbar
    ├── ChartLegend
    ├── CoinExplorer
    ├── AlertForm
    └── MeasureTool
```

Responsabilidad de cada módulo:

- **CandlestickChart.tsx**: orquestador. Estados, efectos, hooks, price display, contenedor del chart, separadores y labels RSI/MACD, MeasureTool.
- **useChartKlines**: datos de mercado, selección de moneda, intervalos, explorer (fetch de klines).
- **useChartSeries**: creación del chart (Lightweight Charts), series de velas/volumen e indicadores, actualización de datos.
- **useChartPriceLines**: líneas de compra, venta, futuros, promedio, precio actual y alertas.
- **useMeasureTool**: lógica completa de la herramienta de medición (estados, handlers mouse/touch, stats, tooltip position).
- **klineService**: acceso a datos (fetch Binance/Bybit).
- **indicators.ts**: cálculo de EMA, SMA, RSI, MACD.
- **types/chart.ts**: tipos compartidos (Interval, OhlcvLegend, MeasureAnchor, MeasureStats, CandlestickChartProps).
- **ChartToolbar / ChartLegend / CoinExplorer / AlertForm / MeasureTool**: capa visual (UI presentacional pura).

## 4. Reglas de refactorización

Antes de tocar código:

- leer el archivo completo;
- identificar responsabilidades;
- crear plan;
- validar alcance.

El código actual siempre es la fuente de verdad.

Separación:

- **Datos**: services / hooks
- **Lógica**: hooks / lib
- **UI**: components

## 5. Lightweight Charts

Versión utilizada: **lightweight-charts 4.2.3**

Reglas:

NO:

- actualizar la versión sin aprobación;
- migrar la API;
- usar APIs v5;
- cambiar tipos innecesariamente.

Mantener:

- refs estables;
- cleanup;
- ResizeObserver cleanup;
- removePriceLine;
- remove chart.

### 5.1 Workaround LW 4.2.3 (pan custom)

Existe un workaround usando APIs internas de Lightweight Charts en `src/hooks/useChartSeries.ts`.

Motivos:

- bug `Value is null` con `pressedMouseMove` (crash en el handler interno de arrastre del pane cuando el price range es null);
- limitaciones de pan vertical en LW 4.2.3;
- no se migra a v5.

Implementación:

- `pressedMouseMove: false` en `handleScroll` del main chart.
- Pan horizontal: API pública `timeScale().setVisibleLogicalRange()`.
- Pan vertical: APIs internas del Model — `priceScale("right")._private__chartWidget._internal_model()`, `_internal_findPriceScale("right")` y los métodos `_internal_startScrollPrice` / `_internal_scrollPriceTo` / `_internal_endScrollPrice`.

Reglas:

- NO eliminar esos accesos internos sin probar.
- NO reemplazar por `pressedMouseMove`.
- NO migrar a v5.

## 6. Indicadores

Fuente única: `src/lib/indicators.ts`

Nunca duplicar:

- EMA
- SMA
- RSI
- MACD

El chart consume series. Los motores analíticos consumen cálculos.

## 7. Datos de mercado

Arquitectura:

```
component
    ↓
hook
    ↓
service
    ↓
exchange API
```

Nunca colocar:

- fetch;
- URLs;
- parsing;

dentro de componentes.

## 8. Reglas de commits

Cada cambio:

- objetivo único;
- pocos archivos;
- build exitoso;
- commit independiente.

No hacer:

- squash;
- reset;
- rebase;
- modificar commits anteriores.

## 9. Validación obligatoria

Después de cada cambio:

1. Ejecutar `npm run build`.
2. Confirmar `Compiled successfully`.
3. Revisar `git diff` y `git status`.
4. No incluir `build/` (restaurarlo si el build lo modifica).

## 10. Prohibiciones

No:

- refactor masivo sin pasos;
- cambios de arquitectura grandes sin plan;
- optimizaciones no solicitadas;
- cambios visuales durante extracción;
- agregar dependencias sin aprobación.

## 11. Testing del chart

Siempre verificar:

Chart:

- velas
- volumen
- resize
- expand

Indicadores:

- EMA20
- SMA50
- SMA200
- RSI
- MACD

Price Lines:

- compra
- venta
- promedio
- futuros
- actual
- alertas

Measure:

- desktop
- touch

Datos:

- BTC → ETH → SOL → BTC
- 15M → 1H → 4H → 1D → MES

## 12. Manejo de errores

Si aparece un error:

No hacer workaround inmediato.

Primero:

1. identificar archivo;
2. identificar línea;
3. explicar causa;
4. proponer solución.

## 13. Estado actual del proyecto

Fase 1 completada.

CandlestickChart:

```
1314 líneas
    ↓
315 líneas
```

Reducción: ~999 líneas.

Arquitectura modular creada.