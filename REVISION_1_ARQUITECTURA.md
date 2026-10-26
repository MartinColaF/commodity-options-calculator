# Revisión de arquitectura #1 — Commodity Options Calculator

**Fecha:** 25 de octubre de 2026 · **Revisado:** `main` @ `4f9315e` · **Modo:** solo lectura,
ningún archivo del repo fue modificado.

---

## Resumen ejecutivo

Calculadora de opciones sobre futuros de commodities: sitio estático sin dependencias ni
paso de build, más una función serverless que hace de proxy a Yahoo. ~4.800 líneas, de
las cuales 2.118 están en un solo archivo (`app.js`).

**La arquitectura es adecuada para su tamaño.** Un único objeto de estado mutable y un
render completo en cada cambio es un diseño simple, fácil de seguir, y correcto para una
herramienta de una sola pantalla. El motor matemático está bien aislado y bien probado
(incluye un árbol binomial independiente como referencia). **No hay dependencias
innecesarias:** cero paquetes npm; Chart.js es la única dependencia de runtime y se usa.

Los problemas se concentran en **tres fronteras**:

1. **La frontera de confianza.** Lo que llega por un link compartido entra al estado sin
   validar y se interpola en HTML sin escapar → **XSS activo en producción** (H1).
2. **La frontera dominio/DOM.** Las acciones de datos y el render leen y escriben el DOM
   directamente, lo que deja ~19 funciones fuera del alcance de los tests. **Los dos bugs
   activos que encontré viven exactamente en esa zona sin tests** (H1, H2, H3).
3. **Los datos de referencia.** La lista de commodities existe en **cuatro** copias que
   nadie verifica entre sí (H4), y los parámetros de valuación se arman en cuatro lugares
   distintos — uno ya divergió y produce un número equivocado (H2).

| Gravedad | Cantidad | De ellos, bugs activos verificados |
|---|---|---|
| **Alta** | 3 | 2 (H1 XSS, H2 IV incorrecta) |
| **Media** | 8 | 1 (H7 selector inconsistente) |
| **Baja** | 9 | — |

**Acción inmediata recomendada: H1.** Es explotable hoy con un link, y en el mismo origen
vive la API key de Alpha Vantage del usuario.

---

## 1. Qué hace

- **Valúa** opciones con un único pricer Black-Scholes-Merton generalizado por cost of
  carry (`b = 0` → Black-76 sobre futuros; `b = r − q` → BSM sobre spot), y ejercicio
  americano por Barone-Adesi-Whaley.
- **Arma estrategias** de varias patas (16 presets), con volatilidad, vencimiento y precio
  de subyacente propios por pata, y skew paramétrico (Malz, 25Δ RR/BF).
- **Analiza**: costo neto, máximos, breakevens, probabilidad de ganancia, griegas, gráfico
  de payoff/griegas y una grilla de escenarios precio × volatilidad × tiempo.
- **Trae datos de mercado**: tasa del Tesoro de EE.UU. (directo), precio/historial/curva
  de futuros (Yahoo, vía `/api/market`), y volatilidad por ETF (Alpha Vantage, opcional).
- **Persiste y comparte** el escenario en `localStorage`, en un link `#s=…` y en JSON.

## 2. Estructura

| Archivo | Líneas | Rol |
|---|---|---|
| `index.html` | 278 | Markup estático; ~50 `id` que `app.js` enlaza a mano |
| `app.js` | 2.118 | Todo el cliente, en 10 secciones numeradas (ver abajo) |
| `api/market.js` | 200 | Función serverless de Vercel: `quote`, `history`, `curve`, `months` |
| `styles.css` | 229 | Tema claro/oscuro con variables CSS |
| `privacy.html` | 135 | Política de privacidad; un `<script>` inline para revelar el contacto |
| `scripts/serve.js` | 48 | Servidor estático de desarrollo, sin dependencias |
| `test/` | 1.399 | 6 archivos, 89 tests con `node --test`; `app.js` corre en un `vm` |
| `.github/workflows/test.yml` | 35 | CI en Node 20 y 22 |

**Secciones de `app.js`:**

| § | Líneas | Contenido | ¿Toca el DOM? | ¿Tiene tests? |
|---|---|---|---|---|
| 1 | 8–336 | Matemática: `normCdf`, `gbs`, BAW, IV | No | **Sí** |
| 2 | 337–376 | Tabla `COMMODITIES` | No | Sí |
| 3 | 377–419 | `state` global, `newLeg` | No | Sí |
| 4 | 420–475 | Presets de estrategias | No | Sí |
| 5 | 476–824 | Motor: patas, P&L, griegas, grillas, escenarios | No (lee `state`) | **Sí** |
| 6 | 825–1002 | Proveedores de datos y caché | Parcial (`DOMParser`) | Parcial |
| 7 | 1003–1420 | Render | **Sí** | **No** |
| 8 | 1421–1485 | Persistencia y links | No | Parcial |
| 9 | 1486–1882 | Acciones de datos | **Sí** | **No** |
| 10 | 1883–2118 | Wiring de eventos e `init` | **Sí** | **No** |

La línea entre "probado" y "no probado" coincide exactamente con la línea entre "no toca
el DOM" y "toca el DOM". Eso es el hallazgo H3.

## 3. Flujo de datos

```
                     ┌──────────── fuentes de estado ─────────────┐
   link #s=…  ──┐    │                                            │
   localStorage ├──► restore() ──► state (objeto global mutable) ◄┤
   JSON import ─┘    app.js:1444     app.js:386                    │
                                         ▲                         │
   input del usuario ──► handler (§10) ──┤                         │
                                         │                         │
   botón de datos ──► runAction(apply*) ─┤                         │
                       │                 │                         │
                       ├─► Tesoro (directo, XML)                   │
                       ├─► /api/market ──► Yahoo (4 endpoints)     │
                       └─► Alpha Vantage (directo, con API key)    │
                            └─► caché en localStorage              │
                                         │                         │
                                         ▼                         │
                                     renderAll()  app.js:1411      │
          ┌──────────────┬───────────────┼──────────────┬──────────┤
          ▼              ▼               ▼              ▼          ▼
    renderInputs   renderLegs   renderResults   renderChart   persist()
                       │          (analyse)      Safely         │
                       │             │              │           └─► localStorage
                       └── todos piden precios al motor (§5), que lee `state` ──┘
```

1. **Arranque** (`init`, app.js:2089): link `#s=` o `localStorage` → `restore()` → `state`.
2. **Cada interacción** muta `state` y llama a `renderAll()` de forma síncrona — en los
   campos del panel izquierdo, **en cada tecla** (app.js:1933–1938).
3. **`renderAll`** reconstruye todo: inputs, tabla de patas, resultados, gráfico, grilla de
   escenarios, fuentes, y escribe `localStorage`.
4. **Los datos de mercado** pasan por `runAction`, que llama a una función `apply*`, que
   hace `fetch`, muta `state` y `state.sources`, y deja que `runAction` re-renderice.
5. **Compartir** serializa `snapshot()` a base64url en el fragmento `#`.

---

## 4. Hallazgos

| # | Hallazgo | Gravedad | Ubicación principal |
|---|---|---|---|
| H1 | XSS por link compartido | **Alta** | `app.js:1465`, `app.js:1106–1127` |
| H2 | Parámetros de valuación armados en 4 lugares; uno ya diverge | **Alta** | `app.js:2062–2063` |
| H3 | Acciones y render acoplados al DOM → la mitad del código sin tests | **Alta** | `app.js` §7, §9, §10 |
| H4 | La lista de commodities existe 4 veces | Media | `app.js:347`, `app.js:966`, `api/market.js:25`, `test/api.test.js:200` |
| H5 | El motor de valuación lee el `state` global | Media | `app.js:480–823` |
| H6 | Fórmulas financieras duplicadas | Media | `app.js:997` vs `1599`; `1594` vs `1784` |
| H7 | Estado repartido fuera de `state`; fuentes de verdad en conflicto | Media | `app.js:1617`, `1676`, `1512–1533` |
| H8 | Render sin memoización; el gráfico viola la regla de "hoist" | Media | `app.js:1268–1292`, `1341` |
| H9 | Capas mezcladas: el render muta estado y el dominio re-renderiza | Media | `app.js:1189`, `1637`, `462` |
| H10 | Chart.js desde CDN sin Subresource Integrity | Media | `index.html:10` |
| H11 | La política de privacidad promete cosas que el código no hace | Media | `privacy.html:38`, `55` |
| H12 | El epílogo de tests mantiene 49 nombres a mano, casi todos innecesarios | Baja | `test/helpers/load-app.js:16–31` |
| H13 | Cambiar el tema del SO saltea el aislamiento de Chart.js | Baja | `app.js:2039` |
| H14 | Caché de `localStorage` sin desalojo | Baja | `app.js:829–843` |
| H15 | Comentarios desactualizados o huérfanos | Baja | `app.js:3–4`, `1667–1672` |
| H16 | Colores del tema duplicados entre JS y CSS | Baja | `app.js:1227–1239` |
| H17 | `curve` y `months` repiten trabajo contra Yahoo | Baja | `api/market.js:179–183` |
| H18 | Errores del proxy sin diagnóstico | Baja | `api/market.js:197–199` |
| H19 | Producción sirve archivos internos | Baja | despliegue de Vercel |
| H20 | Tooling: sin linter, `engines` sin probar, acciones de CI sin pin | Baja | `package.json:11–13`, workflow |

---

### H1 — XSS por link compartido · **ALTA** · *bug activo, verificado*

**Dónde**
- `app.js:1465` — `state.legs = o.legs.map(l => newLeg(l))`: cada pata del link entra sin
  validar tipos.
- `app.js:405–418` — `newLeg` hace `Object.assign` de **todo** lo recibido, incluido `id`.
- `app.js:1106–1127` — `renderLegs` interpola `leg.id`, `qty`, `strike`, `days`, `vol`,
  `under` y `entry` **sin escapar** dentro de atributos HTML.
- `app.js:1446–1447` y `1452` — los campos de primer nivel (`S`, `vol`, `rate`, `model`,
  `chart`…) tampoco se validan.
- Entradas: link `#s=` (`readHash`, `app.js:1476`), `localStorage` (`app.js:2097`) e
  importación de JSON (`app.js:2021`).

**Qué pasa.** Un `strike` con valor `"><img src=x onerror="…">` cierra el atributo `value`
e inyecta HTML que ejecuta JavaScript. Basta con mandarle el link a alguien.

**Impacto.** El script corre en el origen del sitio, donde `localStorage['coc.avkey']`
guarda **en texto plano la API key de Alpha Vantage** del usuario (`app.js:1567`,
leída en `app.js:2108`). También puede leer y alterar todo lo que la página muestra.

**Evidencia.** Cargué `index.html` desde `file://` (sin servidor, sin red) con un link
cuyo `strike` contenía un `<img onerror>` que cambia `document.title`. Resultado:
`document.title === "XSS-EJECUTADO"`, un `<img>` inyectado en la tabla, y el atributo
`value` del strike vacío porque el payload lo cerró. El código de producción es idéntico.

**Corrección**
1. **Validar en la frontera.** Una función `sanitizeLeg(raw)` que construya la pata con
   lista blanca de campos: números con `Number()` + `isFinite`, `kind ∈ {call, put,
   underlying}`, `side ∈ {1, -1}`, y **`id` siempre nuevo**, nunca del link. Lo mismo para
   los campos de primer nivel en `restore`. Así un link malicioso deja de ser estado válido.
2. **Escapar en la salida** (defensa en profundidad): pasar cada valor interpolado por
   `escapeHtml` (ya existe, `app.js:1094`), o construir las filas con la API del DOM y
   asignar `.value` como propiedad.
3. **CSP** con `<meta http-equiv="Content-Security-Policy">` en `index.html`, con
   `script-src 'self' https://cdn.jsdelivr.net`: bloquea manejadores inline como `onerror`
   aunque algo se escape. No necesita `vercel.json` ni paso de build. (El `<script>` inline
   de `privacy.html` necesitaría un hash o moverse a un archivo.)
4. Agregar un test que restaure un link hostil y verifique que el estado queda limpio.

---

### H2 — Los parámetros de valuación se arman en 4 lugares; uno ya diverge · **ALTA** · *bug activo, verificado*

**Dónde.** Cuatro sitios ensamblan por su cuenta `(S, K, T, r, b, sigma, style)`:
- `app.js:572–578` — `legValueAt`
- `app.js:590–597` — `legGreeks` (usa `legUnder(leg)`, correcto)
- `app.js:1285–1288` — perfil de griegas del gráfico
- `app.js:2062–2063` — **botón IV: usa `state.S` en vez de `legUnder(leg)`**

**Qué pasa.** Cuando una pata tiene su propio mes de entrega (`leg.under`), el botón IV
resuelve la volatilidad contra el precio del panel, no contra el de la pata. Y la escribe
en `leg.vol` (`app.js:2068`), con lo que todo el pricing posterior de esa pata queda mal.

**Evidencia.** Pata call, strike 100, 180 días, a 30% de vol; su mes cotiza 110 y el
panel 100. Con el precio teórico como entrada, el botón devuelve **52,74%**; la respuesta
correcta es **30,00%**.

**Corrección.** Una única función, por ejemplo
`legPricingInputs(leg, { P, tDays, volShift })` → `{ kind, S, K, T, r, b, sigma, style,
bTracksRate }`, usada por los cuatro sitios. Arreglar el botón IV pasa a ser automático.
Agregar un test de ida y vuelta de IV sobre una pata con `under ≠ S`.

---

### H3 — Acciones y render acoplados al DOM: la mitad del código sin tests · **ALTA**

**Dónde.** Las funciones de dominio leen y escriben el DOM directamente:
- `app.js:1538–1539` (`applyVol` lee `volWindow`, `volEstimator`), `1557` (`avKey`),
  `1565` (`volSymbol`), `1608–1610` (`applyCurveYield` escribe las cajas de carry),
  `1848–1850` (`actionImplyYield`), `1878–1879` (`actionApplyPreset`).
- Todo §7 (render) y §10 (wiring).

**Qué pasa.** El `vm` de tests no tiene DOM real (`getElementById` devuelve `null`), así
que estas funciones no se pueden probar. Hoy **no tienen ningún test**: `readHash`,
`shareLink`, `fetchYieldCurve`, `applyRate`, `applyFuturesPrice`, `applyVol`,
`applyVolFromAlphaVantage`, `applyCurveYield`, `applyLegPrices`, `fillLegsFromStrip`,
`loadContractMonths`, `useContractMonth`, `actionImplyYield`, `actionApplyPreset`,
`renderLegs`, `renderResults`, `renderScenarios`, `onLegEvent`, entre otras.

**Por qué es alta.** No es una deuda teórica: **H1 vive en `renderLegs` y H2 en
`onLegEvent`**, ambos en esta zona sin cobertura. El motor matemático, que sí está
aislado del DOM, no tiene ningún bug conocido.

**Corrección**, por etapas:
1. Que cada `apply*` reciba sus entradas como parámetros (`applyVol({ window, estimator,
   avKey, symbol })`) y **devuelva** un resultado (`{ patch, source, message }`) en vez de
   mutar `state` y el DOM. Solo el wiring (§10) lee y escribe el DOM. Con eso, las
   acciones se prueban en el `vm` stubeando `proxyGet`/`fetch`.
2. Separar los generadores de HTML en funciones puras (`legsRowsHtml(legs, priced)`) y
   probarlas — incluido el escapado que pide H1.

---

### H4 — La lista de commodities existe 4 veces · **MEDIA**

**Dónde**
- `app.js:347–363` — `COMMODITIES` (14 + `custom`; tamaño, cotización, vol, yield, ETF)
- `app.js:966–967` — `PROXY_COMMODITIES` (lista literal de 14 claves)
- `api/market.js:25–38` — `CONTRACTS` (14; raíz, sufijo, meses listados)
- `test/api.test.js:200–201` — una cuarta copia literal dentro del test

**Qué pasa.** Agregar un commodity exige editar tres archivos con formas distintas. Si se
olvida `PROXY_COMMODITIES`, los botones de datos fallan con *"no futures contract mapped"*
y **ningún test lo detecta**: el test de `api.test.js` verifica su propia copia, no que las
listas coincidan entre sí.

**Corrección.** Un único `commodities.js` en la raíz, escrito como script plano que se
expone como global en el navegador y como `module.exports` en Node
(`(typeof module !== 'undefined' ? module.exports : globalThis).COMMODITIES = {…}`), con
todos los campos de cada contrato. `index.html` lo carga antes de `app.js`;
`api/market.js` lo requiere. `PROXY_COMMODITIES` se deriva. No introduce un sistema de
módulos en `app.js` ni paso de build. **Paso intermedio barato:** un test que verifique que
las tres listas tienen las mismas claves.

---

### H5 — El motor de valuación lee el `state` global · **MEDIA**

**Dónde.** `carry` (`app.js:480`), `legUnder` (`495`), `legRatio` (`504`), `legVolPct`
(`564`), `legValueAt` (`572`), `legGreeks` (`590`), `horizonDays` (`676`),
`displayGrid`/`statsGrid` (`706`, `715`), `scenarioTable` (`733`), `analyse` (`773`).

**Qué pasa.** El motor no es una función de sus entradas: depende del objeto global. Para
valuar un escenario alternativo (otro precio, otra tasa) hay que mutar `state` y
restaurarlo; los tests necesitan `resetState` antes de cada caso; y el motor no se puede
mover a un Web Worker si algún día hace falta.

**Corrección.** Un objeto `market` construido una vez por render
(`marketFromState(state)` → `{ S, rate, b, vol, style, skew, bTracksRate }`), que el motor
recibe como parámetro. Se puede hacer gradualmente, empezando por `legPricingInputs` (H2).

---

### H6 — Fórmulas financieras duplicadas · **MEDIA**

**Dónde**
- Convenience yield: `impliedConvenienceYield` (`app.js:997–1001`) **y** la misma fórmula
  inline en `applyCurveYield` (`app.js:1599`).
- Días entre dos contratos: expresión idéntica en `app.js:1594` y `app.js:1784`.
- Pendiente logarítmica entre contratos: `app.js:1599` y `app.js:1788`.

**Qué pasa.** Si se corrige una (por ejemplo, para usar fechas de vencimiento reales en vez
de mitad de mes), la otra queda vieja sin que nada falle.

**Corrección.** `applyCurveYield` llama a `impliedConvenienceYield`; dos helpers
`contractGapDays(near, far)` y `logSlope(F1, F2, days)` reemplazan las copias.

---

### H7 — Estado repartido fuera de `state`; fuentes de verdad en conflicto · **MEDIA** · *bug activo*

**Dónde.** Variables de módulo además de `state`: `nextLegId` (`app.js:384`), `chart`
(`1198`), `chartBroken` (`1394`), `contractMonths` (`1617`), `priceSourceBeforeFill` y
`legPricesFilled` (`1676–1677`). (Las cachés `critCache`/`critLast`, `133–139`, son
legítimas como estado de módulo.)

**Qué pasa.** "A qué contrato se refiere el precio" vive en dos lugares que se desincronizan:
`state.contractMonth` y `state.S`. `applyFuturesPrice` (`1512–1533`) y el input de precio
(`1914`) cambian `S` **sin resetear `contractMonth`**, y el selector no se vuelve a dibujar.
Resultado: el selector sigue mostrando *"Cocoa Mar 27"* mientras el precio y la línea de
fuente corresponden al front month continuo. *(Verificado por lectura del código.)*

**Corrección**
- Un único setter `setReferencePrice(S, source, contractMonth = '')` que usen **todos**
  los sitios que escriben `S`.
- Agrupar el estado de sesión no persistido bajo `state.session` (strip cargado,
  bookkeeping del fill), para que todo el estado esté en un solo lugar y los tests no
  necesiten hacks como `__setContractMonths`.

---

### H8 — Render sin memoización; el gráfico viola la regla de "hoist" · **MEDIA** · *medido*

**Dónde**
- Cada `renderAll` vuelve a valuar cada pata unas **8 veces**: `renderLegs` (`1103–1104`,
  dos veces vía `legEntry`), `netGreeks` (`657`), `netCost` (`648`), `analyse` (`775`),
  `scenarioTable` (tres evaluadores, `752`), `renderChart` (`1255`, `1264`). En americano,
  cada valuación son 11 evaluaciones de BAW.
- El overlay de patas (`app.js:1268–1270`) y el perfil de griegas (`1280–1292`) llaman a
  `legValue`/`legVolPct` **por cada punto** de la grilla: exactamente lo que `CLAUDE.md`
  prohíbe en "Hoist per-leg work out of grid sweeps".
- El gráfico se destruye y se recrea en cada render (`1341–1342`); no hay debounce sobre
  los inputs (`1933–1938`); `persist()` escribe `localStorage` en cada tecla (`1418`).

**Evidencia.** Overlay de 4 patas, americano + skew, 253 puntos: **9,1 ms** como está
contra **1,0 ms** con el evaluador preparado — **9× más lento**.

**Corrección.** Valuar las patas una vez por render (`priced = priceLegs(market, legs)`) y
pasárselo a todos los renderers; el overlay usa un `pnlEvaluator` por pata; el gráfico se
crea una vez y se actualiza con `chart.update('none')`; agrupar renders con
`requestAnimationFrame`.

---

### H9 — Capas mezcladas: el render muta estado y el dominio re-renderiza · **MEDIA**

**Dónde**
- El render muta estado: `renderResults` recorta `state.chart.tDays` (`app.js:1189`);
  `renderMonths` resetea `state.contractMonth` (`1637`).
- El dominio llama al render: `applyStrategy` (`462`), `actionImplyYield` (`1862`),
  `actionApplyPreset` (`1880`), además de `actionAutoFill` (`1825`) y `runAction` (`1839`).

**Qué pasa.** No hay una dirección clara del flujo. Llamar a una función de render puede
cambiar el estado, y llamar a una función de dominio puede disparar un render completo —
a veces dos veces seguidas.

**Corrección.** El render como proyección pura del estado; los recortes y
normalizaciones en un paso `normalizeState()` previo; las acciones devuelven y solo el
wiring decide cuándo renderizar.

---

### H10 — Chart.js desde CDN sin Subresource Integrity · **MEDIA**

**Dónde.** `index.html:10` — `<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/…">`
sin `integrity` ni `crossorigin`.

**Qué pasa.** Es la única dependencia de runtime y se carga sin verificar su contenido. Si
el CDN sirviera un archivo alterado, ese código tendría el mismo alcance que H1, incluida
la API key en `localStorage`.

**Corrección.** Agregar `integrity="sha384-…" crossorigin="anonymous"`, o copiar el
archivo al repo y servirlo desde el mismo origen (no requiere build). La CSP de H1 lo
complementa.

---

### H11 — La política de privacidad promete cosas que el código no hace · **MEDIA**

**Dónde**
- `privacy.html:55` — *"You can manage your cookie preferences at any time through the
  cookie banner."* **No existe ningún banner**: cero coincidencias de `cookie`, `consent`
  o `banner` en `index.html`, `app.js` y `styles.css`.
- `privacy.html:38` — *"we run no server of our own"* contradice `privacy.html:67`, que
  describe *"Our own market data function (`/api/market`, hosted on Vercel)"*.
- `privacy.html:52` y `60` describen cookies de AdSense, pero `index.html:4` solo tiene la
  meta de verificación de la cuenta: **no se carga ningún script de anuncios**.

**Por qué importa.** `CLAUDE.md` declara la política "load-bearing, not decoration". Un
documento legal que promete un control inexistente es un riesgo en sí mismo, y si AdSense
se activa para usuarios del EEE hará falta una plataforma de consentimiento certificada.

**Corrección.** Reescribir esas tres afirmaciones para que describan lo que el código hace
hoy; agregar el banner solo si se activan los anuncios.

---

### H12 — El epílogo de tests mantiene 49 nombres a mano · **BAJA**

**Dónde.** `test/helpers/load-app.js:16–31`, y `CLAUDE.md`, que indica agregar ahí "any
top-level binding the tests need".

**Qué pasa.** En un `vm`, las declaraciones `function` de nivel superior **sí** quedan como
globales; solo `const` y `let` no. Lo verifiqué: `function f` es visible desde el sandbox,
`const C` y `let L` no. De los 49 nombres del epílogo, solo los `const`/`let` (`state`,
`COMMODITIES`, `STRATEGIES`, `PROXY_COMMODITIES` y el setter de `contractMonths`) lo
necesitan; el resto es mantenimiento manual innecesario, y `CLAUDE.md` propaga la premisa.

**Corrección.** Que el helper devuelva las funciones directamente desde el sandbox y deje
el epílogo solo para las cinco ligaduras `const`/`let`. Corregir el párrafo de `CLAUDE.md`.

---

### H13 — Cambiar el tema del SO saltea el aislamiento de Chart.js · **BAJA**

**Dónde.** `app.js:2039` — `const onScheme = () => renderChart(analyse());`

**Qué pasa.** Llama a `renderChart` directamente, no a `renderChartSafely`. Si Chart.js no
cargó (bloqueador, caída del CDN), cambiar entre modo claro y oscuro lanza un error.
Además recalcula todo `analyse()` solo para cambiar colores.

**Corrección.** `renderChartSafely(analyse())`, o mejor, reaplicar colores sobre el
gráfico existente.

---

### H14 — Caché de `localStorage` sin desalojo · **BAJA**

**Dónde.** `app.js:829–843`.

**Qué pasa.** Las entradas vencidas se ignoran pero nunca se borran, y hay una clave por
cada símbolo de Alpha Vantage que el usuario tipea: crecimiento sin cota. Si algún día
agota la cuota, `persist()` (`app.js:1426`) falla **en silencio** y el usuario deja de
guardar su escenario sin enterarse.

**Corrección.** Borrar la entrada al detectarla vencida en `cacheGet`, y podar las claves
`coc.cache.*` vencidas en `init`.

---

### H15 — Comentarios desactualizados o huérfanos · **BAJA**

**Dónde**
- `app.js:1667–1672` — un bloque que describe la versión anterior de `applyLegPrices`
  ("extrapolation of a single observed slope") quedó encima de declaraciones que no tienen
  que ver, y ya no describe el camino principal (ahora interpola el strip).
- `app.js:3–4` — dice que funciona en "GitHub Pages"; el despliegue es Vercel.

**Corrección.** Mover el bloque sobre `applyLegPrices` y actualizarlo; corregir la cabecera.

---

### H16 — Colores del tema duplicados entre JS y CSS · **BAJA**

**Dónde.** `app.js:1227–1239` (`themeColors`) repite colores de `styles.css`
(`#0b6ea8` y `#6b7280` están en ambos).

**Corrección.** Leer las variables CSS con
`getComputedStyle(document.documentElement).getPropertyValue('--accent')`.

---

### H17 — `curve` y `months` repiten trabajo contra Yahoo · **BAJA**

**Dónde.** `api/market.js:179–183`: `curve` consulta 5 contratos y `months` 14, que los
incluyen. Pedir ambos son hasta 19 requests superpuestos a un endpoint no documentado, con
claves de caché distintas.

**Corrección.** Derivar `curve` de los dos primeros contratos de `months`: una consulta y
una entrada de caché.

---

### H18 — Errores del proxy sin diagnóstico · **BAJA**

**Dónde.** `api/market.js:197–199` — el `catch` devuelve un 502 genérico y descarta el error.

**Corrección.** `console.error(e)` (queda en los logs de Vercel) manteniendo el mensaje
genérico hacia el cliente.

---

### H19 — Producción sirve archivos internos · **BAJA**

**Qué pasa.** `CLAUDE.md`, `test/*.js`, `scripts/serve.js` y `.github/workflows/test.yml`
responden 200 en el sitio público. El repo ya es público, así que no se filtra nada nuevo,
pero no es intencional.

**Corrección.** Un `.vercelignore` (no es un paso de build y no cambia cómo despliega Vercel).

---

### H20 — Tooling · **BAJA**

- Sin linter ni formateador para un archivo de 2.100 líneas.
- `package.json:11–13` declara `"node": ">=18"`, pero CI prueba 20 y 22; Node 18 ya no
  tiene soporte.
- `.github/workflows/test.yml:21–22` usa acciones por tag (`@v4`), no por SHA.

**Corrección.** `engines` a `>=20`; acciones fijadas por SHA; un linter que corra con
`npx` sin agregar dependencias al proyecto.

---

## 5. Fuera del alcance de diseño, pero relevantes

No son problemas de arquitectura, pero aparecieron durante la revisión:

- **Conversión de la tasa del Tesoro** (`app.js:889–905`). `rateForTenor` convierte el par
  yield como si fuera de capitalización anual (`ln(1 + y)`); el Tesoro lo publica en base
  bond-equivalent, semestral. Diferencia: **2,2 pb a 3%, 3,8 pb a 4%, 6,0 pb a 5%**.
  Corrección: `2·ln(1 + y/2)`.
- **Probabilidad de ganancia** (`app.js:803`). Usa la volatilidad global `state.vol`,
  ignorando el skew, la vol por pata y el shift de escenarios. Es una elección de modelo
  defendible (es la distribución del subyacente de referencia), pero no es coherente con
  el resto del motor y no lo dice en la interfaz.

## 6. Lo que está bien y conviene no tocar

- **Cero dependencias y sin build**: deploy trivial, nada que auditar en `node_modules`.
- **Motor matemático puro y bien probado**, con un árbol binomial CRR independiente como
  referencia y la precisión de BAW medida y fijada en un test.
- **El proxy nunca acepta símbolos libres** y valida con `hasOwnProperty`
  (`api/market.js:151`).
- **`renderChartSafely`** aísla la única dependencia externa del resto de la página.
- **`setField`** protege el campo que se está tipeando.
- **`CLAUDE.md`** documenta trampas reales, con su porqué.

## 7. Orden sugerido de corrección

1. **H1** — hoy: es explotable en producción con un link.
2. **H2** — bug activo con corrección chica; de paso crea `legPricingInputs`.
3. **H10** + la CSP de H1 — refuerzan la frontera de confianza.
4. **H4** — una sola fuente de verdad para los commodities.
5. **H3 → H5** — por etapas: primero acciones puras y testeables, después el objeto
   `market`. Esto es lo que más reduce el riesgo a futuro.
6. **H7, H8, H9** — consistencia del estado y rendimiento del render.
7. **H11** — alinear la política con lo que el código hace.
8. El resto, oportunistamente.

## Método

Lectura completa de todos los archivos del repo. Verificaciones empíricas, todas sin
escribir en el repo:

| Verificación | Cómo | Resultado |
|---|---|---|
| H1 | `index.html` desde `file://` con un link hostil | JavaScript ejecutado |
| H2 | `impliedVol` en el `vm` de tests, pata con `under ≠ S` | 52,74% vs 30,00% |
| H8 | Cronometraje del barrido del gráfico en el `vm` | 9,1 ms vs 1,0 ms |
| H11 | Búsqueda de `cookie`/`consent`/`banner` en el código | 0 coincidencias |
| H12 | `vm.runInContext` con `function`, `const` y `let` | solo `function` es global |
| H19 | `GET` de archivos internos en producción | 200 |
| §5 | Conversión anual vs semestral | 2–6 pb |

El árbol revisado (`85ef81e`) es idéntico en contenido a `main` (`4f9315e`): la única
diferencia es el commit de merge, sin cambios de archivos.
