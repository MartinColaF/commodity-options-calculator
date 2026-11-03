# Revisión de producto #3B — Commodity Options Calculator

**Fecha:** 3 de noviembre de 2026 · **Revisado:** `main` @ `565cd46`, que es lo que está en producción
· **Modo:** solo lectura. No se modificó código.

**Alcance.** El documento cubre tres temas:
- funcionalidades nuevas y diferenciadores frente a otras calculadoras de opciones, para quien
  trabaja con commodities: traders, compradores, exportadores, productores y gestores de riesgo;
- cómo captar contactos y medir el uso;
- qué tan compatible es la página con AdSense.

**Para qué.** La página se va a compartir en LinkedIn como punto de contacto profesional, y
eventualmente como fuente de ingresos con anuncios.

**Formato de los números.** Punto decimal, como en las revisiones #2 y #3A. Los textos de la
interfaz se citan tal como aparecen.

---

## Cómo leer este documento

- **V, verificado:** lo medí en esta revisión. Puede ser una medición en Chromium o con `curl`
  contra producción, una cuenta hecha con el propio motor de la calculadora (`priceOption()`)
  o algo leído en el código. El método está en el apéndice A.
- **E, estimado:** es criterio, o información de un tercero que no pude comprobar. Las fuentes
  están en el apéndice B.
- **Impacto:** cuánto mueve alguno de los cuatro objetivos. Son: credibilidad profesional,
  uso recurrente, contactos e ingresos.
- **Esfuerzo,** medido contra la estructura de este proyecto:
  - **S:** un PR chico de un día o menos. Toca `commodities.js`, las dos páginas, `styles.css`
    o una función de `app.js` con sus tests.
  - **M:** varios días. Suma estado nuevo (con `snapshot()` y `restore()`), toca `app.js`,
    tests y `es/words.js`, y llega a las dos páginas.
  - **L:** más de una semana, o necesita un servidor, un tercero, cambiar la CSP o la política
    de privacidad, o una traducción revisada por un hablante nativo.
- **Prioridad:**
  - **P1:** antes o durante la difusión en LinkedIn.
  - **P2:** el mes o los dos meses siguientes.
  - **P3:** cuando haya datos de uso que la justifiquen.
- **⚡ Arranque rápido:** esfuerzo S, sin servidor nuevo y sin scripts de terceros. Si además
  necesita un párrafo en la política de privacidad, lo dice.

---

## Resumen ejecutivo

**El motor ya está por encima de una calculadora gratuita típica. Lo que le falta es hablar
como habla quien cubre.**

La calculadora valúa con:
- Black-76, y Barone-Adesi-Whaley para el ejercicio americano;
- sesgo de volatilidad (skew) y financiación de la prima;
- 16 estrategias sobre 14 mercados, cada dato con su fuente y su fecha.

Pero habla como una herramienta de trading. Un productor, un exportador o un comprador
industrial piensan en otros términos:
- toneladas, no bushels;
- precio piso y precio techo, no P&L;
- base local;
- cuántos contratos necesitan;
- qué papel le llevan al comité de riesgos.

Ese hueco no lo cubre ninguna de las alternativas gratuitas revisadas (§1.2).

**Lo que más conviene hacer:**

1. **Medir antes de monetizar** (E1, E3, C5 ⚡).
   - **Vercel Web Analytics en el plan Hobby** es gratis hasta 50,000 eventos por mes, no usa
     cookies y se sirve desde el propio sitio, así que no cambia la CSP.
   - **Search Console y el panel de la función `/api/market`** se suman sin escribir código.
   - **Hay que cambiar la política primero,** porque hoy dice que no usa analytics (V).
2. **Hablar el idioma del que cubre** (A1 a A6).
   - Toneladas y contratos.
   - Precio neto con base y comisiones.
   - El collar costo cero: en soja a 1050 ¢/bu, el put 1000 a 60 días lo paga un call en
     1104.89 ¢ (V).
   - Presets por rol.
3. **Calcular el vencimiento real de cada opción** (B1).
   - **El ejemplo:** la opción de maíz diciembre 2026 vence el 20 de noviembre, no a mediados
     de diciembre.
   - **El costo del error:** con 17 días en lugar de 42, el call at-the-money vale 9.24 ¢ y no
     14.49 ¢. Es un 57% menos, 262.38 USD por contrato (V).
4. **Dar salidas que viajen** (C1, C2 ⚡).
   - **Una imagen para el post de LinkedIn.** Un link compartido siempre muestra la imagen
     genérica, porque el escenario va en el `#` de la URL (V).
   - **Un informe imprimible** para un comité o un banco.
5. **AdSense sí, pero no en la página de la calculadora** (§7). Hay cinco razones:
   - **CSP:** AdSense solo soporta una CSP estricta con nonce por request, y esta página es
     estática (V, fuente oficial).
   - **Almacenamiento:** el `localStorage` del sitio guarda la clave de Alpha Vantage y las
     posiciones, y cualquier script del mismo origen puede leerlas (V).
   - **Ubicación:** la página está llena de controles, justo lo que la política pide alejar de
     los anuncios (V, fuente oficial).
   - **Recarga:** AdSense prohíbe recargar anuncios sin que el usuario lo pida, así que cada
     visita cuenta como una sola página vista (V, fuente oficial).
   - **Peso:** el cargador de AdSense transfiere 205,894 bytes, 1.6 veces todo lo que hoy
     transfiere la página (V).

   **El camino propuesto:** primero medir; después escribir guías con escenarios precargados
   (C3), en páginas propias, que son lo que AdSense puede monetizar; y comparar con un
   patrocinio directo (D4), que no tiene ninguno de estos problemas.

### Tabla de propuestas

Ordenada por prioridad. **⚡** marca las de arranque rápido.

| ID | Propuesta | Para quién | Impacto | Esfuerzo | Prioridad | ⚡ |
|---|---|---|---|---|---|---|
| E1 | Vercel Web Analytics: visitas, origen, país, dispositivo | dueño | Alto | S | P1 | ⚡ (política) |
| E3 | Salud de datos y búsquedas sin código: panel de `/api/market` y Search Console | dueño | Medio | S | P1 | ⚡ |
| C5 | Saber qué visitas llegan desde LinkedIn y desde links compartidos | dueño | Medio | S | P1 | ⚡ |
| A1 | Equivalencias físicas y precios por tonelada (1 contrato = 136.08 t; USD/t) | exportadores, compradores, productores | Alto | S | P1 | ⚡ |
| A5 | Presets por rol: «Piso de venta», «Techo de compra», «Collar costo cero», «Fence» | todo el que cubre | Medio | S | P1 | ⚡ |
| A6 | Delta en contratos de futuro equivalentes | gestores de riesgo, traders | Medio | S | P1 | ⚡ |
| C1 | Imagen del escenario para publicar en LinkedIn | difusión | Alto | S | P1 | ⚡ |
| C2 | Informe imprimible de la cobertura, en PDF desde el navegador | comités, bancos, auditoría | Alto | S | P1 | ⚡ |
| D1 | Contacto sin cuenta de GitHub: formulario externo | contactos | Medio | S | P1 | ⚡ (política) |
| D2 | Lista de espera por función, con rol y mercado | contactos, validar demanda | Alto | S | P1 | ⚡ (política) |
| D3 | Página «Sobre» con LinkedIn, cuando decidas mostrar tu identidad | credibilidad | Alto | S | P1* | ⚡ |
| A3 | Precio neto con base y comisiones: piso y techo en USD/t | productores, exportadores, compradores | Alto | M | P1 | |
| A4 | Collar costo cero y fence: busca el strike que paga la cobertura | productores, compradores, exportadores | Alto | M | P1 | |
| B1 | Vencimiento real de la opción al elegir un mes listado | todos | Alto | M | P1 | |
| A2 | Dimensionar desde la cantidad física: 5,000 t son 36.74 contratos | exportadores, compradores | Alto | M | P1 | |
| C3 | Guías por caso, con el escenario precargado | SEO, AdSense, LinkedIn | Alto | M | P1/P2 | |
| B2 | Eventos hasta el vencimiento (WASDE, EIA) | granos, energía | Medio | S | P2 | ⚡ |
| B3 | Mercados de LATAM con precio manual (MATba-ROFEX en USD/t, B3) | LATAM | Alto | S–M | P2 | |
| D4 | Patrocinio directo, en lugar de AdSense o antes que AdSense | ingresos | Alto | S + venta | P2 | |
| E2 | Eventos de uso: estrategia, mercado, Auto-fill por servicio, compartir | dueño | Alto | M | P2 | |
| E4 | Pregunta de rol al primer uso | dueño, patrocinadores | Medio | S–M | P2 | |
| B4 | Calibrar el skew con cotizaciones que pega el usuario | traders, mesas | Alto | M | P2 | |
| A7 | Comparar coberturas lado a lado: futuro, put o collar | comités, gestores de riesgo | Alto | L | P2 | |
| C4 | Página en portugués (/pt/) | Brasil | Alto | L | P2 | |
| B5 | Percentil de la volatilidad realizada (cono de volatilidad) | traders, gestores | Medio | M | P3 | |
| A8 | Fecha de operación y seguimiento desde la entrada | gestores de riesgo | Medio | M | P3 | |
| A9 | Opciones sobre promedio (APO) para compradores de energía | industria, transporte | Medio | L | P3 | |
| C6 | Versión embebible, sin anuncios, para brokers y consultoras | alcance | Medio | M | P3 | |
| D5 | «Enviarme este informe por email» | contactos | Medio | L | P3 | |

\* D3 depende de tu decisión de mostrar tu identidad (§5).

---

## 1. Punto de partida

### 1.1 Qué tiene hoy la calculadora (V, leído en el código)

- **Mercados:** 14 más uno personalizado, en `commodities.js`:
  - metales: oro, plata y cobre;
  - energía: WTI, Brent y gas natural;
  - granos: maíz, trigo y soja;
  - softs: azúcar, café, cacao y algodón;
  - ganadería: live cattle.
- **Estrategias:** 16 en `STRATEGIES`. Están pensadas para trading: «Covered call», «Iron
  condor», «Call ratio 1x2». Solo «Protective put» y «Collar» sirven tal cual para cubrir.
- **Modelos:**
  - Black-76 sobre futuros y Black-Scholes-Merton con carry;
  - ejercicio americano (BAW) o europeo;
  - skew de Malz;
  - financiación de la prima.
- **Datos:**
  - Auto-fill desde la función `/api/market`, que lee Yahoo, más la curva del Tesoro y Alpha
    Vantage como respaldo;
  - meses listados y precios por pata;
  - rendimiento de conveniencia implícito;
  - volatilidad implícita por pata;
  - volatilidad realizada con tres estimadores: close-to-close, EWMA y Parkinson.
- **Resultados:**
  - P&L y perfiles de delta, gamma, vega y theta;
  - grilla de escenarios;
  - probabilidad de ganancia.
- **Guardar y compartir:**
  - link compartible, con el escenario en el `#` de la URL (`shareLink()`, `#s=…`);
  - exportar e importar JSON;
  - una sola posición guardada en el navegador.
- **Lo que no tiene:**
  - cantidades físicas;
  - base local;
  - precio neto;
  - vencimientos reales: el usuario tipea los días, y elegir un mes listado cambia el precio
    pero no los días (`useContractMonth()`);
  - medición de uso;
  - contacto sin GitHub.

### 1.2 Qué ofrecen las alternativas y qué hueco dejan (E, fuentes en el apéndice B)

| Alternativa | Qué hace bien | Qué no cubre para este público |
|---|---|---|
| **CME QuikStrike** | Datos de CME: volatilidad por strike, interés abierto, valuación, spreads, simulador de estrategias con posiciones de opciones, futuros o físicas | Hay que registrarse en CME. Con datos, solo cubre productos de CME Group: café, cacao, azúcar y algodón cotizan en ICE. Está en inglés y apunta a mesas de trading. |
| **Barchart, Options Price Calculator** | Precio teórico, volatilidad implícita y griegas de una opción sobre cualquier futuro, con valores de mercado importados | Una opción a la vez. No habla de cobertura ni de precio neto. |
| **OptionStrat** | Calculadora de estrategias de referencia en acciones. Agregó opciones sobre futuros. | Su lenguaje y sus ejemplos son de acciones. |
| **Planillas de extensión agrícola** (NDSU, U. de Minnesota, Texas A&M, Michigan State) | El cálculo que hace un productor: precio mínimo = strike + base esperada − prima − comisiones | Son PDFs o planillas, no herramientas interactivas, y la prima se toma como dato. No encontré una versión interactiva. |
| **MATba-ROFEX, «Calculadora de Opciones»** | Existe en su sitio, para su mercado | No revisé qué hace. Conviene mirarla antes de B3. |

**El hueco:** una herramienta interactiva que cumpla todo esto a la vez. Ninguna de las cinco
lo hace.
- funciona en el celular, en español y sin registrarse;
- valúa bien, con opciones americanas, skew y financiación;
- cubre CME e ICE;
- habla de piso, techo, toneladas, base y contratos;
- produce algo para llevar a un comité o publicar.

---

## 2. Diferenciadores para quien cubre

### A1 — Equivalencias físicas y precios por tonelada · Alto · S · P1 · ⚡

**Qué.** En la tarjeta Contract, junto al multiplicador que ya se muestra, se agrega una
equivalencia física («1 contrato = 136.08 t»). El precio y los resultados se muestran también
en la unidad comercial del mercado: USD/t para granos, azúcar y algodón, y USD por saca de
60 kg para el café.

**Por qué acá.** El exportador argentino o brasileño cotiza en USD/t, y la soja de CBOT cotiza
en ¢/bu. Hoy esa conversión la hace la persona, de memoria o en una planilla.

Las equivalencias por contrato (V, calculadas):

| Mercado | Contrato | Equivale a | Conversión |
|---|---|---|---|
| Soja | 5,000 bu | 136.08 t | 36.7437 bu/t: 1 ¢/bu = 0.3674 USD/t |
| Trigo | 5,000 bu | 136.08 t | 36.7437 bu/t |
| Maíz | 5,000 bu | 127.01 t | 39.3683 bu/t: 1 ¢/bu = 0.3937 USD/t |
| Azúcar #11 | 112,000 lb | 50.80 t | |
| Café C | 37,500 lb | 17.01 t | 283.5 sacas de 60 kg |
| Algodón | 50,000 lb | 22.68 t | |
| Live cattle | 40,000 lb | 18.14 t | |

**Cómo.**
- **Datos:** un campo nuevo por mercado en `commodities.js`, la única tabla de mercados. Por
  ejemplo, `physical: { unit: 't', perQuote: 36.7437 }`. Los mercados de energía y metales
  pueden quedarse sin él.
- **Formato:** la conversión pasa por `fmtPrice()` y respeta `NUMBER_LOCALE`.
- **Tests:** `test/commodities.test.js` fija cada factor.

**Límites.** Es solo presentación: no toca el valuador. En «Custom» no aplica.

### A2 — Dimensionar la cobertura desde la cantidad física · Alto · M · P1

**Qué.** Un campo «Cantidad a cubrir», por ejemplo 5,000 t de soja, que calcula:
- contratos exactos: 36.74;
- el redondeo y su efecto: 37 contratos cubren 5,034.9 t, 34.9 t de más; 36 cubren 4,898.8 t,
  101.2 t de menos;
- un botón que pone esa cantidad en las patas.

**Por qué acá.** Es la primera pregunta de un comprador o exportador, y ninguna alternativa de
§1.2 la responde.

**Cómo.**
- **Estado:** un campo nuevo, que pasa por `snapshot()` y `restore()` como pide CLAUDE.md. Un
  escenario viejo, sin el campo, se abre sin cantidad física.
- **Unidades:** usa el factor de A1.
- **Resultados:** muestran el P&L por tonelada además del total.

**Límites.** Supone una cobertura 1 a 1 del físico. Una cobertura cruzada, como aceite de soja
contra soja, queda afuera.

### A3 — Precio neto con base y comisiones · Alto · M · P1

**Qué.** Un modo «Precio neto» del gráfico y de los KPIs.
- **El eje:** en lugar del P&L muestra el precio que efectivamente se obtiene o se paga:
  - para quien vende físico: futuro al vencimiento + base + resultado de las opciones − prima
    financiada − comisiones;
  - para quien compra, lo mismo con el signo cambiado.
- **Los KPIs:** «Precio mínimo garantizado» y «Precio máximo», en ¢/bu y en USD/t.

**Ejemplo (V, con el motor de la calculadora).** Soja a 1050 ¢/bu, put 1000 a 60 días, 18% de
volatilidad, tasa 4%, ejercicio americano:
- el put cuesta 11.20 ¢/bu;
- con base −40 ¢ y comisión de 1 ¢, el piso es 947.80 ¢/bu, o sea **348.26 USD/t**.

Es la misma fórmula que las planillas de extensión (§1.2), pero con la prima bien valuada y
financiada (`premiumRate()`), y con el gráfico de todo el rango de precios.

**Cómo.**
- **El físico** entra como una pata «underlying». Ya existe: es la que usan «Covered call» y
  «Protective put».
- **La base y las comisiones** son estado nuevo, con su paso por `snapshot()` y `restore()`.
- **La curva** sale de `pnlEvaluator()`. Las líneas de piso y techo usan el mismo mecanismo
  que las marcas de strike (`labelRows()`).
- **El rechazo de valores** pasa por `inputProblem()`. La base puede ser negativa; las
  comisiones, no.

**Límites.**
- La base se toma fija; en la realidad también se mueve.
- Se puede ofrecer un rango de base (por ejemplo −50 a −30) como banda en el gráfico.

### A4 — Collar costo cero y fence · Alto · M · P1

**Qué.** Se elige el put que se quiere comprar, y la calculadora busca:
- **Collar costo cero:** el call cuya venta paga el put, o el que deja un costo neto objetivo.
- **Fence:** el put más bajo que conviene vender para abaratar la cobertura. Es la estrategia
  de tres patas que se usa mucho en LATAM.

**Ejemplo (V).** Mismo caso que A3:
- el put 1000 cuesta 11.20 ¢;
- el call exacto que lo paga es 1104.89 ¢;
- con strikes de 5 ¢, el 1100 se vende a 12.37 ¢, un crédito neto de 1.17 ¢/bu, unos 0.43 USD/t.

**Por qué acá.** El motor ya tiene lo necesario:
- una bisección robusta, la misma de `skewVol()`;
- el valuador americano;
- la volatilidad de cada strike con skew (`legVolPct()`).

Con el skew activado, el strike que paga el put no es el mismo que sin skew. Ese detalle es el
que separa esta herramienta de una cuenta en planilla.

**Cómo.**
- **El cálculo:** una función de §5 que busca el strike, redondea al paso del mercado
  (`strikeStep()`) y muestra el exacto y el listado.
- **La interfaz:** un botón en la tabla de patas, «Buscar el strike que paga la cobertura».

**Límites.** Si ningún strike llega, por ejemplo con un put muy caro, debe decirlo con una
razón, como lo hacen `skewProblem()` y el botón IV.

### A5 — Presets por rol · Medio · S · P1 · ⚡

**Qué.** Separar el selector de estrategias en dos grupos, con `<optgroup>`:
- **Coberturas:**
  - «Piso de venta (productor/exportador): físico + put»;
  - «Techo de compra (industria): compra con call»;
  - «Collar costo cero»;
  - «Fence»;
  - «Piso para ganado».
- **Trading:** las 16 de hoy.

**Por qué acá.** Quien llega desde LinkedIn y cubre lee «Covered call» y no se reconoce. Las
estrategias de cobertura ya se pueden armar con lo que hay (patas «underlying», puts y calls):
falta nombrarlas.

**Cómo.**
- **Datos:** entradas nuevas en `STRATEGIES`.
- **Textos:** pasan por `t()`. `STRATEGIES[k].label` ya está aceptado como clave de datos en
  `test/i18n.test.js`, y cada nombre lleva su traducción en `es/words.js`.

### A6 — Delta en contratos de futuro · Medio · S · P1 · ⚡

**Qué.** Agregar una línea a la tabla de griegas: «Delta neta: −3.4 contratos de futuro.
Comprar 3 la deja en −0.4».

**Por qué acá.** La delta ya se suma en el eje del precio (`legAxisGreeks()`). Expresarla en
contratos es como un gestor de riesgo decide cuántos futuros operar.

**Cómo.** Es la delta neta por contrato, con una línea de texto y su test. No toca el valuador.

### A7 — Comparar coberturas lado a lado · Alto · L · P2

**Qué.** Hasta tres alternativas sobre la misma exposición física: futuro, put o collar. Se
muestran en un gráfico superpuesto y en una tabla:

| | Futuro | Put | Collar |
|---|---|---|---|
| Precio neto a −20 / 0 / +20% | | | |
| Costo inicial | | | |
| Peor caso | | | |
| Mejor caso | | | |

**Por qué acá.** Es la decisión que se lleva a un comité, y la imagen más fácil de explicar en
un post.

**Cómo.**
- **Estado:** varias posiciones a la vez. Cambia el estado, `snapshot()`, `restore()` y el
  formato del link.
- **Gráfico:** suma series a `chartConfig()`.

**Límites.** Es el cambio de estado más grande de la lista. Conviene hacerlo después de A3 y A4.

### A8 — Fecha de operación y seguimiento · Medio · M · P3

**Qué.** Registrar la fecha y el precio de entrada, y mostrar:
- el P&L desde la entrada;
- el interés de la prima desde esa fecha.

**Por qué acá.** CLAUDE.md lo lista como limitación: «there is no trade date». Para un gestor de
riesgo es lo que convierte una simulación en un seguimiento, y le da un motivo para volver
cada semana. Eso, además, es uso recurrente medible.

### A9 — Opciones sobre promedio (APO) para compradores de energía · Medio · L · P3

**Qué.** Opciones sobre el precio promedio del mes, que son las que cubren los compradores de
combustible.

**Cómo.** Un valuador nuevo, por ejemplo la aproximación de Turnbull-Wakeman.
- **Unidades:** debe mantener las de las griegas (vega por punto, theta por día).
- **Validación:** se fija contra una simulación Monte Carlo, como BAW se fija contra el árbol
  CRR en `test/american.test.js`.

**Límites.** Es un nicho: industria y transporte. Va después de tener datos de quién usa la
herramienta (E4).

---

## 3. Mercado y precisión

### B1 — Vencimiento real de la opción · Alto · M · P1

**Qué.** Al elegir un mes listado, la calculadora propone los días hasta el último día de
negociación de la opción, y lo muestra: «vence el vie 20 nov 2026».

**El problema hoy (V).**
- **Los días:** el usuario los tipea; `useContractMonth()` cambia el precio, no los días.
- **La fecha del contrato:** la función de mercado la aproxima a mediados de mes
  (`expiryIsApproximate`).
- **La diferencia:** la opción vence antes que el futuro. Para el maíz diciembre 2026, la regla
  de CBOT dice «el último viernes que precede por al menos dos días hábiles al último día
  hábil del mes anterior». Eso da el 20 de noviembre de 2026; el futuro vence el 14 de
  diciembre.

**Lo que cuesta el error (V).** Visto desde el 3 de noviembre, con maíz a 430 ¢, 25% de
volatilidad y call at-the-money americano:

| Días usados | Valor del call |
|---|---|
| 17, al vencimiento real | 9.24 ¢/bu |
| 42, a mediados de diciembre | 14.49 ¢/bu |

Es un 57% más caro, 262.38 USD por contrato.

**Cómo.**
- **Las reglas:** una regla de vencimiento por mercado en `commodities.js`, más una tabla de
  feriados de cada bolsa por año, estática.
- **Los mercados:** granos (regla verificada), softs de ICE y energía, cada uno según su
  reglamento.
- **El carry:** la aproximación de la función para el carry se queda como está. Ahí no importa,
  porque usa la misma convención en los dos contratos.

**Límites.** Las opciones semanales y las de corto plazo sobre cosecha nueva tienen su propio
calendario y quedan para después.

### B2 — Eventos hasta el vencimiento · Medio · S · P2 · ⚡

**Qué.** Una línea en Resultados: «Hasta el vencimiento (20 nov) hay 1 informe WASDE: 10 nov».
Para granos usa los WASDE; para energía, el informe semanal de inventarios de la EIA.

**Por qué acá.** Las opciones de granos se mueven por esos informes. Saber cuántos caen antes
del vencimiento es contexto profesional que ninguna calculadora genérica da.

**Cómo.**
- **El archivo:** `events.js`, estático, cargado como `commodities.js`. Los 12 WASDE de 2026
  están verificados: 12 ene, 10 feb, 10 mar, 9 abr, 12 may, 11 jun, 10 jul, 12 ago, 11 sep,
  9 oct, 10 nov y 10 dic, a las 12:00 ET.
- **Si se vence:** cuando la tabla se termina, la página lo dice («calendario hasta dic 2026»).
  No conviene un test que falle solo por la fecha.

### B3 — Mercados de LATAM con precio manual · Alto · S–M · P2

**Qué.** Entradas nuevas en `commodities.js` sin `futures`, es decir sin Auto-fill. El precio se
escribe a mano y su línea de fuente lo dice.
- **MATba-ROFEX:** soja, maíz y trigo, en USD/t.
- **B3:** milho, boi gordo y café arábica.

**Por qué acá.** El diseño ya prevé que agregar un mercado sea una sola entrada. El público de
la página en español opera ahí.

**Cómo.** Tamaño de contrato, unidad y tick, tomados de cada reglamento; no los verifiqué en
esta revisión.

**Límites.**
- **Moneda:** los contratos de B3 en reales necesitan una moneda por mercado. Hoy `money()`
  siempre escribe «$». Por eso los de B3 son M, y los de MATba-ROFEX en USD son S.
- **Antes de B3:** conviene revisar la calculadora de opciones de MATba-ROFEX (§1.2).

### B4 — Calibrar el skew con cotizaciones del usuario · Alto · M · P2

**Qué.** El usuario pega de 3 a 5 cotizaciones de opciones de la pantalla de su broker (strike,
tipo y prima). La calculadora:
1. resuelve la volatilidad implícita de cada una con `impliedVol()`, que ya rechaza las que no
   tienen valor tiempo;
2. ajusta los tres parámetros del skew (at-the-money, risk reversal 25Δ y butterfly 25Δ);
3. muestra el error de cada punto en puntos de volatilidad.

**Por qué acá.** La volatilidad implícita de mercado no está disponible: Yahoo devuelve 401, y
los datos de CME son pagos. Con este camino los datos son del usuario, sin problemas de
licencia, y el skew de Malz que ya está queda calibrado a mercado. No vi esto en ninguna
calculadora gratuita de opciones sobre commodities.

### B5 — Percentil de la volatilidad realizada · Medio · M · P3

**Qué.** Un indicador como «Volatilidad realizada de 20 días: 24.1%, percentil 70 de los
últimos 5 años», para responder si la volatilidad que se está usando es alta o baja.

**Límites.**
- **Historia:** la función pide hoy un año (`range '1y'`). Un cono útil necesita varios años,
  así que hay que ampliar el rango y su cache.
- **Saltos de roll:** inflan la volatilidad realizada (CLAUDE.md). Hay que aplicar el control
  que ya se usa, sacar el salto más grande, o ajustar los rolls.

---

## 4. Difusión y contenido

### C1 — Imagen del escenario para LinkedIn · Alto · S · P1 · ⚡

**Qué.** Un botón «Descargar imagen» que genera un PNG del gráfico con los números clave:
- máximos, puntos de equilibrio y piso o techo;
- el mercado y la fecha;
- «no es recomendación de inversión»;
- la URL.

En el celular se comparte directo con la hoja nativa.

**Por qué acá (V).**
- **El link no sirve de vista previa:** `shareLink()` arma `origin + pathname + '#s=…'`, y
  ningún crawler lee el `#`. Todo link compartido muestra el `og.png` genérico.
- **La imagen es lo que hace el post:** cada uso es difusión.

**Cómo.**
- **El gráfico:** sale del canvas de Chart.js (`toBase64Image()`) compuesto en otro canvas con
  el texto.
- **El tema:** en tema claro aunque la página esté en oscuro.
- **El formato:** 1200×627, como `og.png`, o vertical de 1080×1350.
- **Compartir:** reusa `navigator.share`, que ya existe (D2 de la revisión #3A).

### C2 — Informe imprimible de la cobertura · Alto · S · P1 · ⚡

**Qué.** «Imprimir / PDF» con una hoja de estilo de impresión. Una página con:
- posición, supuestos (la línea resumen del bloque «advanced»), KPIs, gráfico, griegas y
  grilla de escenarios;
- **las líneas de fuente con sus fechas;**
- el disclaimer y el link al escenario.

**Por qué acá.** La documentación de una cobertura (comité, banco, auditoría) pide justamente
lo que esta herramienta ya registra y otras no: de dónde salió cada número y de cuándo es.

**Cómo.** Un bloque `@media print` en `styles.css`, más el redibujo del canvas en
`beforeprint`.

### C3 — Guías por caso, con el escenario precargado · Alto · M · P1/P2

**Qué.** Páginas estáticas en inglés y español, cada una con explicación, números trabajados y
un botón «Abrir este escenario en la calculadora» (link `#s=…`). Las primeras cinco, atadas a
A1–A5:
1. Piso de precio para soja con puts (productor).
2. Collar costo cero en café (exportador).
3. Techo de costo con calls de WTI (comprador de energía).
4. Piso para ganado con puts de live cattle.
5. Cuántos contratos para 5,000 t (dimensionamiento).

**Por qué acá.** Resuelven tres cosas a la vez:
- **LinkedIn:** cada post apunta a una guía.
- **SEO:** atraen búsquedas.
- **AdSense:** el contenido de la página principal es escaso (F6), y las guías son las páginas
  que pueden llevar anuncios sin los problemas de §7.

**Cómo.**
- **Las páginas:** HTML a mano, porque no hay paso de build.
- **Los tests:**
  - un test abre cada link de guía con `restore()`, así un cambio de formato no rompe una guía
    publicada;
  - el test de paridad se extiende a cada par de guías en inglés y español.

### C4 — Página en portugués · Alto · L · P2

**Qué.** Una página `/pt/` con el mismo mecanismo que `/es/`:
- `t()` con su tabla de palabras;
- paridad de etiquetas en `test/pages.test.js`;
- `hreflang`.

**Por qué acá.** Brasil es central en soja, maíz, café, azúcar y ganado. La infraestructura de
idiomas ya existe; lo que cuesta es traducir unos 27 KB de textos (el tamaño de
`es/words.js`) y que alguien del mercado brasileño revise los términos.

### C5 — Saber qué visitas llegan desde LinkedIn y desde links compartidos · Medio · S · P1 · ⚡

**Qué.**
- **Los posts:** cada link de un post lleva `?ref=linkedin` o `?ref=linkedin-<post>`.
- **El botón de compartir:** agrega `?ref=share` antes del `#`.

**Por qué acá.** El escenario viaja en el `#`, y el `#` no llega al servidor. Sin una marca en
la consulta, una visita desde un link compartido no se distingue de una directa.

**Límites (E).**
- **UTM en Vercel:** en Hobby y Pro, Vercel no desglosa los parámetros UTM; eso viene con Web
  Analytics Plus.
- **El parámetro `ref`:** sí registra parámetros de consulta filtrados (su ejemplo es
  `?ref=hackernews`). Hay que confirmar en el panel cómo lo muestra.

### C6 — Versión embebible, sin anuncios · Medio · M · P3

**Qué.** Un modo `?embed=1` con la interfaz mínima, para que brokers y consultoras lo inserten
en su sitio.

**Límites.**
- **Anuncios:** la política de AdSense prohíbe anuncios dentro de un iframe, así que la versión
  embebible tiene que ir siempre sin anuncios.
- **CSP:** permitir el iframe requiere la cabecera `frame-ancestors`, que una CSP en `<meta>`
  no puede fijar. Eso implica un `vercel.json`, que hoy no existe.

---

## 5. Captar contactos

**El contexto (V).**
- **Contacto:** el único canal hoy son los issues de GitHub. Son públicos y piden una cuenta,
  y casi nadie del mundo de commodities tiene una.
- **Identidad:** la página no nombra a su autor, por tu decisión en D29.
- **LinkedIn:** quien llega desde un post tuyo sabe quién la hizo. Quien llega por un link
  reenviado o por una búsqueda, no.

### D1 — Contacto sin GitHub · Medio · S · P1 · ⚡ (política)

**Qué.** Un link «Contacto profesional / sugerí un mercado» en el pie y en la tarjeta de
guardar, que lleva a un formulario externo (Tally o Google Forms).

**Por qué así.**
- **Seguridad:** al ser un link y no un embebido, no cambia la CSP ni carga scripts.
- **Política:** necesita un párrafo que nombre al proveedor del formulario.

### D2 — Lista de espera por función · Alto · S · P1 · ⚡ (política)

**Qué.** Junto a las funciones que todavía no existen (portugués, MATba-ROFEX, comparar
coberturas, alertas, informes con logo), un «Avisarme cuando esté». Lleva al mismo formulario,
con la función ya elegida en la URL, y pregunta:
- rol: productor, exportador, comprador, trader, riesgo o estudiante;
- mercado y país;
- email, opcional y con consentimiento.

**Por qué acá.** Da contactos calificados y además ordena las prioridades P2 y P3 con datos y
no con criterio.

### D3 — Página «Sobre» · Alto · S · P1 cuando lo decidas · ⚡

**Qué.** Quién la hace, por qué, link a LinkedIn y el contacto de D1.

**Por qué.** Para un punto de contacto profesional, es lo que convierte una visita en una
conexión. Queda sujeta a tu decisión de mostrar tu identidad. Mientras tanto, D1 cubre el
contacto.

### D4 — Patrocinio directo · Alto · S técnico + venta · P2

**Qué.** Una tarjeta «Con el apoyo de …» con una imagen propia y un link con `?ref=`, sin
scripts. El patrocinador puede ser un broker o FCM, una consultora agro o un proveedor de
datos.

**Por qué acá.** Frente a AdSense, en este sitio:
- **Sin cambios técnicos de riesgo:** no toca la CSP, no expone el `localStorage`, no necesita
  CMP ni cookies.
- **Una audiencia que vale:** es chica pero B2B y nichada, que es lo que un patrocinador paga
  y lo que AdSense remunera mal (F4, F10).
- **Datos para vender:** E1 y E4 dan visitas por país, dispositivo y rol.

**Límites.** Hay que rotular «patrocinado». Con un broker como patrocinador, el disclaimer de
«no es recomendación» tiene que seguir bien visible.

### D5 — «Enviarme este informe por email» · Medio · L · P3

**Qué.** Pedir un email a cambio de recibir el informe de C2.

**Por qué después.**
- Necesita un servicio de correo, una función nueva con su clave y límites de uso.
- Necesita guardar el consentimiento.
- Choca con «sin dependencias» y con la política actual.

Conviene hacerlo solo si D2 muestra demanda.

---

## 6. Medir el uso

### E1 — Vercel Web Analytics, plan Hobby · Alto · S · P1 · ⚡ (política)

**Qué da.** Páginas vistas, referentes, país, dispositivo y navegador.

**Datos del plan (E, documentación de Vercel).**
- **Volumen:** 50,000 eventos por mes incluidos, sin costo. Al pasarse, la recolección se
  pausa.
- **Historia:** se ve 1 mes de datos.
- **Eventos propios:** no hay en Hobby.
- **Privacidad:** sin cookies. Identifica visitas con un hash de la request que se descarta a
  las 24 horas.

**Por qué encaja (V/E).**
- **CSP:** el script se sirve desde una ruta del propio sitio (`/<ruta-única>/script.js`) y
  envía a esa misma ruta, así que `'self'` ya lo cubre.
- **Script en línea:** el ejemplo para HTML trae un `<script>` en línea (`window.va = …`) que la
  CSP bloquea. Ese shim solo hace falta para eventos propios, así que se omite, o va en un
  archivo.
- **Política primero (V):** la sección 2 dice «Analytics: we do not use any. If that changes,
  this policy will be updated first.» `test/privacy.test.js` obliga a cambiar las dos versiones
  juntas.

**Un cuidado específico (E).** El escenario viaja en `#s=…`, y puede ser una posición real.
Hay que confirmar que el script no envía el `#` de la URL. Si lo envía, se lo quita antes con
`beforeSend`.

**Qué leer.**
- **Una sola página:** cada visita a la calculadora es una sola página vista, porque todo pasa
  en una página.
- **Lo que importa:**
  - el reparto de visitas entre `/` y `/es/`;
  - las visitas desde LinkedIn (C5);
  - el país;
  - el dispositivo;
  - las visitas a la metodología.

### E2 — Eventos de uso · Alto · M · P2

**Qué medir.** Valores categóricos, nunca números de una posición:
- estrategia elegida (clave de `STRATEGIES`);
- mercado;
- resultado de Auto-fill por servicio: futuros, Tesoro o Alpha Vantage, y si funcionó o falló;
- compartir, exportar e importar;
- botón IV;
- skew activado;
- ejercicio americano;
- idioma;
- «abierto desde un link compartido», es decir que había `#s=` al cargar.

**Por qué acá.** El resultado de Auto-fill por servicio sirve además de alarma: avisa el día
que el endpoint de Yahoo, sin documentación, deje de responder.

**Opciones.**

| | Costo | CSP y política |
|---|---|---|
| **Vercel Pro** | El plan Pro (unos 20 USD por mes por miembro, dato no verificado acá), más 0.03 USD cada mil eventos. Eventos propios con 2 propiedades. | Sin cambios de CSP |
| **Umami Cloud, plan gratis** | Gratis. Los límites no figuran claros en las fuentes revisadas. | Dominio de terceros: cambia la CSP y la política. |

**Recomendación:** decidirlo después de un mes de E1.

### E3 — Salud de datos y búsquedas, sin código · Medio · S · P1 · ⚡

- **El panel de Vercel (Observability).** Muestra las invocaciones y los errores de
  `/api/market`. Las invocaciones miden cuánto se usa Auto-fill y los errores avisan si Yahoo
  se cae, sin tocar el sitio.
- **Google Search Console.** Se verifica por DNS o con un meta tag, sin script. Muestra con qué
  búsquedas llega la gente, y eso ayuda a elegir las guías de C3.

### E4 — Pregunta de rol al primer uso · Medio · S–M · P2

**Qué.** Una fila de chips descartable, una sola vez: «¿Cómo la usás? Productor · Exportador ·
Comprador · Trader · Riesgo · Estudiante». Se guarda en el navegador y se envía como evento de
E2.

**Para qué.** Es el dato que pide un patrocinador (D4) y el que decide entre A9 y B4.

---

## 7. Compatibilidad con AdSense

**Veredicto.** Es compatible con condiciones, pero no en la página de la calculadora tal como
está. Los puntos F1 a F5 son técnicos y de política; F6 a F10, de contenido, datos y negocio.

### F1 — La CSP · V (fuente oficial) · impacto alto

**Qué pide AdSense.** Su ayuda oficial dice: «Because the domains that the AdSense ad code uses
change over time, we only support strict CSP». Es decir:
- un `nonce` aleatorio en cada `<script>` de la página, con `'strict-dynamic'`;
- y advierte: «More restrictive policies may break without notice».

**Por qué choca acá.**
- **Página estática:** la CSP está en un `<meta>` dentro de un HTML estático. Un nonce fijo en
  un archivo público no protege nada.
- **Las dos salidas:**
  - generar el nonce por request, con un paso del lado del servidor (E: Routing Middleware de
    Vercel, cambia el modelo de despliegue);
  - aflojar `script-src`, perdiendo la defensa que CLAUDE.md describe frente a la inyección de
    `onerror=` que ya pasó una vez.

**La salida simple.** Cada página tiene su propia CSP en `<meta>`. Las páginas con anuncios
(guías de C3) pueden llevar la política de AdSense, y la calculadora conserva la suya.

### F2 — El almacenamiento del mismo origen · V · impacto alto

**Qué hay guardado.** El `localStorage` del sitio guarda:
- `coc.avkey`, la clave de Alpha Vantage del usuario;
- `coc.state.v2`, sus posiciones.

**El riesgo.** Cualquier script que corra en cualquier página del mismo origen las puede leer.
Eso incluye el de AdSense y lo que ese script cargue (`'strict-dynamic'`). Es la razón por la
que Chart.js está fijado con SRI, y los scripts de AdSense no se pueden fijar.

**Opciones.**
- **(a)** Guías y anuncios en otro origen: otro proyecto de Vercel o un subdominio. La
  calculadora queda sin anuncios.
- **(b)** Dejar de guardar la clave y escribirla en cada visita. Las posiciones seguirían
  legibles.

Recomiendo (a).

### F3 — Ubicación junto a controles · V (fuente oficial) · impacto alto

**Qué dice la política.** Nombra, entre lo que hay que mantener lejos de los anuncios, los
«drop-down menus» y las «applications». Agrega: «Even if the layout unintentionally leads to
accidental clicks, publishers may still receive a violation notification».

**Por qué afecta acá.** La calculadora es una aplicación densa de campos, selects y botones. En
el celular, además, pone los resultados primero, y los Auto ads de tipo anchor o vignette los
taparían.

**Qué hacer.**
- La página de la calculadora va sin Auto ads.
- En las guías, bloques manuales entre párrafos, lejos del botón «Abrir en la calculadora».

### F4 — Una visita, una página vista · V (fuente oficial) · impacto alto

**La regla.** «Publishers are not permitted to refresh a page or an element of a page without
the user requesting a refresh.»

**El efecto.** Una sesión de 20 minutos con la calculadora es una sola impresión por bloque,
sin importar cuánto se use. Los ingresos de AdSense crecen con las páginas de contenido, no
con el uso de la herramienta.

### F5 — El peso · V · impacto medio

| Recurso | Bytes transferidos |
|---|---|
| `adsbygoogle.js` (solo el cargador, sin anuncios) | 205,894 |
| Toda la página en inglés | unos 128.6 KB |

**Desglose de la página:** `index.html` 6.8 KB, `app.js` 51.7 KB, `styles.css` 7.4 KB,
`commodities.js` 1.8 KB, `i18n.js` 0.8 KB y Chart.js 60.1 KB.

**El efecto.** El cargador solo pesa 1.6 veces la página entera. La calculadora redibuja a cada
cuadro mientras se escribe, así que el trabajo de un tercero en el hilo principal se nota.
Habría que medir el tiempo de un render con y sin el cargador, como indica CLAUDE.md.

### F6 — Contenido para la aprobación · V · impacto medio

**Lo medido.** Palabras visibles en producción (A.1):

| Página | Visibles al cargar | Con todos los «?» abiertos |
|---|---|---|
| Calculadora en inglés (`/`) | 448 | 1,149 |
| Calculadora en español (`/es/`) | 529 | 1,311 |
| Metodología | 908 (en español, 1,005) | igual |
| Privacidad | 725 | igual |

**Lo que dicen las fuentes (E).** Google no publica un umbral. Los relatos de la comunidad, que
son anecdóticos, describen rechazos por «low value content» en sitios que son solo
herramientas. Las guías de C3 son la respuesta.

### F7 — Datos de Yahoo y uso comercial · E · impacto alto

**El dato.** Auto-fill lee Yahoo a través de la función del sitio, y CLAUDE.md registra que
sus términos no dan derecho a redistribuir.

**El riesgo.** Monetizar convierte al sitio en comercial y sube lo que está en juego.

**Antes de activar anuncios:**
- revisar esos términos;
- o pasar los futuros a una fuente con licencia, o a la clave del propio usuario, como ya pasa
  con Alpha Vantage.

Auto-fill ya es opcional: la calculadora funciona sin él. No es asesoramiento legal; es un
punto para revisar.

### F8 — Consentimiento y política · V · impacto alto

**Lo que ya registra CLAUDE.md:**
- un CMP certificado para EEE, Reino Unido y Suiza;
- reescribir las secciones 1 a 3 de la política;
- `test/privacy.test.js` falla si aparece AdSense sin esos cambios.

**Lo que se suma.** Mencionar la medición de E1 y el formulario de D1 y D2.

### F9 — Categorías de anuncios · E · impacto medio

**Qué hacer.** Con los controles de bloqueo de AdSense, excluir las categorías que contradicen
el tono de una herramienta con la que se valúan posiciones reales:
- CFD y forex apalancado;
- cripto;
- apuestas.

Los nombres exactos hay que verlos en el panel.

### F10 — Orden de magnitud de ingresos · E (supuestos, no datos)

**La cuenta.** Ingreso mensual ≈ páginas vistas / 1000 × RPM.

**Un ejemplo con supuestos.** RPM de 5 USD, que hay que reemplazar con el dato real:

| Visitas por mes | Páginas por visita | Páginas vistas | Ingreso |
|---|---|---|---|
| 5,000 | 1.2 (solo la calculadora) | 6,000 | unos 30 USD |
| 5,000 | 2.5 (con guías) | 12,500 | unos 62 USD |

**El punto.** No es el número, que es un supuesto. Es que la calculadora sola rinde poco por
F4, y que un patrocinio mensual (D4) puede superarlo con la misma audiencia.

**Recomendación:**
1. Medir con E1 y E3 durante uno o dos meses.
2. Escribir las guías de C3.
3. Decidir entre D4 y AdSense con esos datos.
4. Si va AdSense: solo en guías, en otro origen (F2), con la CSP por página (F1), el CMP y la
   política (F8), y las categorías bloqueadas (F9).

---

## 8. Descartadas, y por qué

| Idea | Por qué no ahora |
|---|---|
| Volatilidad implícita en vivo y cadenas de opciones | Yahoo devuelve 401; los datos de CME son pagos, y QuikStrike ya lo hace para quien tiene cuenta. B4 da un camino con datos del propio usuario. |
| Márgenes SPAN | Son específicos de cada bolsa y complejos. Una aproximación daría números engañosos en una herramienta que se apoya en decir qué es cada número. |
| Cuentas de usuario y carteras en la nube | Necesitan servidor, autenticación y datos personales. El navegador, el link y el JSON ya cubren guardar y compartir. |
| Integración con brokers o ejecución | Es regulado y está fuera del alcance de una herramienta educativa. |
| Alertas de precio por email | Necesitan servidor y datos con derecho a redistribuir. Primero hay que validar la demanda con D2. |
| Newsletter con datos derivados de Yahoo | Choca con la redistribución (F7). |
| Auto ads en la página de la calculadora | Por F1 a F4. |
| Opciones semanales y de corto plazo | Primero los vencimientos mensuales (B1). |

---

## 9. Orden sugerido

**Ola 1, arranque rápido.** Una a dos semanas de PRs chicos, antes de la difusión fuerte en
LinkedIn:
1. **Medición:** E1 con su párrafo en la política, E3 y C5.
2. **Lenguaje de cobertura:** A1, A5 y A6.
3. **Salidas que viajan:** C1 y C2.
4. **Contacto:** D1 y D2 con la política, y D3 si decidís mostrar tu identidad.
5. **Eventos:** B2.

**Ola 2, diferenciadores.** Tres a cinco semanas:
1. **Cobertura completa:** A3 (precio neto, base y comisiones) y A4 (collar y fence).
2. **Precisión:** B1 (vencimientos reales) y A2 (dimensionar).
3. **LATAM:** B3, empezando por MATba-ROFEX.
4. **Contenido:** C3, las primeras 3 a 5 guías en inglés y español.

**Ola 3, con datos de uso.**
1. **El modelo de ingresos:** decidir entre D4 y AdSense (§7).
2. **Medición fina:** E2 y E4.
3. **Funciones mayores,** según lo que pidan D2 y los datos: B4, A7, C4, B5, A8, A9, C6 y D5.

---

## Apéndice A — Método

### A.1 Mediciones en producción

Producción es https://commodity-options-calculator.vercel.app, en `main` @ `565cd46`.

- **Palabras visibles.** Chromium a 1280×900, contando palabras en `document.body.innerText`
  en dos estados: al cargar, y con todos los `[hidden]` visibles y los `<details>` abiertos.
  Script: `prod3b/words.js` en el scratchpad de la sesión.
- **Pesos.** `curl` con `Accept-Encoding: gzip, br`, contando los bytes transferidos de cada
  recurso de la página y de
  `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js` (respuesta 200).

### A.2 Cuentas con el motor de la calculadora

Script `prod3b/examples.js`. Carga `app.js` con el loader de los tests y usa
`priceOption(…, 'american')` con tasa 4% y carry 0 (Black-76).

- **Collar.** Soja 1050 ¢/bu, 60 días, 18% de volatilidad:
  - put 1000 = 11.200 ¢;
  - call que lo iguala, por bisección = 1104.89 ¢;
  - call 1100 = 12.370 ¢.
- **Piso.** 1000 − 40 − 11.20 − 1 = 947.80 ¢/bu × 36.7437 / 100 = 348.26 USD/t.
- **Vencimiento.** Maíz 430 ¢, 25% de volatilidad, desde el 3 de noviembre de 2026:
  - al 20 de noviembre (17 días): 9.239 ¢;
  - al 15 de diciembre (42 días): 14.487 ¢;
  - diferencia: 5.248 ¢ × 50 USD por centavo = 262.38 USD por contrato.
- **La fecha del 20 de noviembre** sale de la regla de CBOT. El último día hábil de noviembre
  es el lunes 30; el jueves 26 es Thanksgiving. El viernes 27 lo precede por un solo día hábil,
  así que corresponde el viernes anterior. Los calendarios de la JSE y del Micro Corn de CME
  dan la misma fecha.
- **Unidades.** 1 t = 2,204.62262 lb. Bushel de soja y trigo: 60 lb; de maíz: 56 lb.

### A.3 Lectura de código

Funciones y archivos citados: `commodities.js`, `STRATEGIES`, `useContractMonth()`,
`shareLink()`, `STORE_KEY` y `KEY_STORE`, la CSP de `index.html`, `api/market.js` (rangos y
`expiryIsApproximate`) y `privacy.html`, secciones 1 a 3.

---

## Apéndice B — Fuentes

**Competidores:**
- CME QuikStrike: https://www.cmegroup.com/tools-information/quikstrike.html y
  https://www.cmegroup.com/tools-information/quikstrike/pricing-volatility-strategy-tools.html
- Barchart, Options Price Calculator: https://www.barchart.com/trader/help/options/calculator.php
- OptionStrat y futuros: https://optionstrat.com/blog/futures

**Planillas de extensión agrícola:**
- NDSU: https://www.ag.ndsu.edu/bioeconomics/cropeconomics/documents/optionsworksheet.pdf
- U. de Minnesota: https://rvs.umn.edu/Uploads/EducationalMaterials/075801a9-e790-43ff-9fcb-9b1a9b1d1465.pdf
- Texas A&M: https://agecoext.tamu.edu/wp-content/uploads/2013/10/rm2-12oh.pdf
- Michigan State: https://www.canr.msu.edu/uploads/files/firm/Jim/Two_Option__Pricing_Decisions.pdf

**MATba-ROFEX** (menú «Calculadora de Opciones»): https://matbarofex.com.ar/about-us/press

**Reglas y calendarios:**
- Regla de vencimiento de opciones de maíz (CBOT, cap. 10A): https://www.cmegroup.com/rulebook/CBOT/I/10A.pdf
- Calendario JSE de granos (vencimiento de opciones de maíz diciembre 2026): https://clientportal.jse.co.za/Content/JSE%20Trading%20Dates%20and%20Calendars%20Items/Trading%20Calendar%20Cash%20Settled%20Grain%20Contracts.pdf
- Calendario de Micro Corn de CME: https://cmegroup.com/markets/agriculture/grains/micro-corn.calendar.html
- WASDE 2026: https://www.usda.gov/oce/commodity/wasde y
  https://www.cmegroup.com/articles/2026/understanding-major-usda-reports-in-2026.html

**AdSense:**
- CSP: https://support.google.com/adsense/answer/16283098?hl=en
- Ubicación, clics accidentales y recarga: https://support.google.com/adsense/answer/1346295?hl=en
- Iframes: https://support.google.com/adsense/answer/3394713?hl=en
- «Low value content», relatos de la comunidad (anecdóticos): https://support.google.com/adsense/community-guide/241032356/how-can-you-solve-the-low-value-content-adsense-disapproval-challenge?hl=en

**Vercel Web Analytics:**
- Precios y límites: https://vercel.com/docs/analytics/limits-and-pricing
- Privacidad: https://vercel.com/docs/analytics/privacy-policy
- Instalación en HTML: https://vercel.com/docs/analytics/quickstart

**Umami Cloud** (límites del plan gratis sin confirmar): https://umami.is/docs/cloud/faq
