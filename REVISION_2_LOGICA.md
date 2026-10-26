# Revisión de lógica #2 — Commodity Options Calculator

**Fecha:** 26 de octubre de 2026 · **Revisado:** `main` @ `dec7390` · **Modo:** solo lectura,
no se modificó código.

Los números usan punto decimal, para poder copiarlos a una calculadora o a una planilla.

---

## Cómo leer este documento

- **V, verificado:** medido en esta revisión contra una referencia independiente, o leído y
  comprobado con números.
- **E, estimado:** criterio o conocimiento general que no medí acá.
- **Veredicto de cada fórmula:**
  - **correcta:** coincide con la referencia a precisión de máquina o de la medición;
  - **aproximada:** tiene un error conocido, y está medido;
  - **errónea:** da un número equivocado en algún caso alcanzable desde la interfaz.

**La referencia independiente** está escrita desde cero en Python 3.11 estándar, sin
paquetes externos, y no comparte código con la app. Está completa en el apéndice A.
- **Precios europeos:** fórmula cerrada, con la normal acumulada de `math.erfc`, la de la
  biblioteca de C.
- **Griegas:** diferencias finitas sobre ese precio, así que no dependen de las fórmulas de
  griegas de la app.
- **Americanas:** árbol binomial CRR con el último paso valuado en forma cerrada y
  extrapolación de Richardson entre 1600 y 800 pasos. Sus valores europeos coinciden con la
  fórmula cerrada en 2e-6 relativo o mejor.

**Las cifras de la app** salen de cargar el `app.js` real en Node, con el mismo cargador que
usan los tests, y valuar cada pata por el camino completo: estado → `legPricingInputs()` →
pricer.

---

## Resumen ejecutivo

**El núcleo matemático está bien.**
- **Normal acumulada:** tiene precisión de máquina (2.2e-16).
- **Precio europeo:** coincide con la referencia en 1.2e-11 relativo en 5000 casos al azar.
- **Las cinco griegas:** coinciden con las diferencias finitas, con las unidades que declaran
  (vega por punto de vol, theta por día calendario, rho por punto de tasa).
- **BAW:** sigue el algoritmo publicado, y contra el árbol tiene un error mediano de
  0.0002% del subyacente.
- **Tasa:** la conversión de la curva del Tesoro es la que el propio Tesoro indica.
- **Volatilidad implícita:** se recupera con un error de 0.00004 puntos de vol siempre que
  la opción tenga valor temporal.
- **Breakevens y máximos:** son exactos en las estrategias con pago lineal.

**Los errores están en la periferia: lo que se calcula alrededor del pricer.**

| Veredicto | Gravedad | Hallazgos |
|---|---|---|
| **Erróneo** | Media | L1 probabilidad de ganancia con la vol equivocada · L2 griegas netas entre meses · L3 inputs inválidos sin aviso |
| **Erróneo** | Baja | L4 rho europea BSM con tasa = yield · L5 prima americana espuria con tasa negativa |
| **Aproximado** | Media | L8 precios en pantalla con 2 decimales |
| **Aproximado** | Baja o informativo | L6, L7, L9 a L17 |

**Primero conviene L1 y L3.** Son los que más pueden engañar a quien valúe una posición
real. L1 aparece justo en el flujo habitual: después de usar el botón IV, la probabilidad de
ganancia queda calculada con otra volatilidad que la de los precios en pantalla.

---

## 1. Fórmula por fórmula

| # | Fórmula | Dónde | Veredicto | Evidencia |
|---|---|---|---|---|
| 1 | Densidad normal `normPdf` | `app.js:12` | Correcta | V, es la definición |
| 2 | Normal acumulada `normCdf` | `app.js:18` | Correcta | V, error absoluto ≤ 2.2e-16 en [−40, 40] |
| 3 | d1, d2 y precio europeo call/put (`gbs`) | `app.js:60` | Correcta | V, ≤ 1.2e-11 relativo en 5000 casos |
| 4 | Delta | `app.js:87` | Correcta | V, ≤ 1.4e-6 contra diferencias finitas |
| 5 | Gamma | `app.js:88` | Correcta | V, ≤ 2.3e-7 en 3582 casos |
| 6 | Vega, por punto de vol | `app.js:89` | Correcta | V, ≤ 3.5e-7 |
| 7 | Theta, por día calendario | `app.js:91` | Correcta | V, ≤ 8.9e-6 |
| 8 | Rho, por punto de tasa | `app.js:103` | Correcta salvo un caso (L4) | V |
| 9 | Caso degenerado: T ≤ 0, σ ≤ 0, S ≤ 0 o K ≤ 0 | `app.js:62` | Precio correcto; θ y ρ en 0 (L14); S ≤ 0 sin sentido (L3) | V |
| 10 | BAW: raíces q1 y q2, con el límite r → 0 | `app.js:141` | Correcta | V, lectura y 72 casos con r = 0 |
| 11 | BAW: semilla, Newton y coeficiente A | `app.js:164` | Correcta, según el algoritmo publicado | V, lectura y árbol |
| 12 | BAW: precio y guardas | `app.js:239` | Aproximada por diseño (L6); falta la guarda del put con r < 0 (L5) | V |
| 13 | Griegas americanas por diferencias centrales | `app.js:260` | Aproximada (L6) | V, contra el árbol |
| 14 | Volatilidad implícita (Newton más bisección) | `app.js:303` | Correcta si hay valor temporal; si no, L9 | V, 4000 casos |
| 15 | Carry: Black-76 b = 0, BSM b = r − q | `app.js:465` | Correcta | V |
| 16 | Skew de Malz | `app.js:527` | Correcta, reproduce las cotizaciones; puede no converger (L10) | V |
| 17 | Tiempo T = días/365 y ensamblado por pata | `app.js:571` | Correcta, convención ACT/365 | V |
| 18 | Multiplicador en dólares | `app.js:345` | Correcta | V el código, E las especificaciones |
| 19 | P&L por pata (`pnlEvaluator`) | `app.js:639` | Correcta como valor de mercado; no financia la prima (L11) | V |
| 20 | Costo neto | `app.js:668` | Correcta | V |
| 21 | Griegas netas | `app.js:678` | Errónea con patas en otro mes (L2) | V |
| 22 | Máximos, mínimos y "ilimitado" | `app.js:807` | Correcta; un caso engañoso (L12) | V |
| 23 | Breakevens | `app.js:821` | Correcta | V, exactos contra la fórmula cerrada |
| 24 | Probabilidad de ganancia | `app.js:836` | Aproximada (L7) y errónea con vol por pata (L1) | V |
| 25 | Tabla de escenarios | `app.js:767` | Correcta | V por lectura; usa el mismo evaluador medido en 19 a 24 |
| 26 | Tasa: interpolación y conversión | `app.js:970` | Correcta | V, con la respuesta real del Tesoro y su FAQ |
| 27 | Volatilidad realizada: 3 estimadores | `app.js:1016` | Correcta | V, a 10 decimales |
| 28 | Yield implícita y pendiente entre dos contratos | `app.js:1101` | Correcta | V por lectura y tests existentes; no la volví a medir |
| 29 | Precio por pata interpolado en la curva | `app.js:1986` | Correcta, log-lineal | V por lectura y tests existentes |

### 1.1 Normal acumulada

Es una aproximación racional de Hart (1968), como dice el comentario del código. La comparé
contra `math.erfc` en 8010 puntos, de −40 a 40 cada 0.01, más los puntos de corte.

- **Error absoluto máximo:** 2.2e-16.
- **Error relativo en la cola:** ≤ 8.9e-9 para x ≥ −36.9. El peor punto es x = −7.78, donde
  el código cambia de fórmula.
- **Debajo de −37 devuelve 0.** El valor real es menor que 1e-300; no afecta ningún precio.

### 1.2 Precio europeo

Es Black-Scholes-Merton generalizado por costo de carry:
- `d1 = (ln(S/K) + (b + σ²/2)·T) / (σ·√T)` y `d2 = d1 − σ·√T`
- `call = S·e^((b−r)T)·N(d1) − K·e^(−rT)·N(d2)`
- `put = K·e^(−rT)·N(−d2) − S·e^((b−r)T)·N(−d1)`

Con b = 0 es Black-76 sobre el precio del futuro, descontado a la tasa r. Las fórmulas son
las estándar.

**Medición:** 5000 casos al azar.
- **Rangos:** S de 1 a 5000; K/S de 0.5 a 2; T de 1 día a 3 años; r de 0 a 10%; σ de 5% a
  150%; mitad Black-76 y mitad BSM con q entre −5% y 10%; calls y puts.
- **Resultado:** error relativo máximo 1.2e-11, contando solo los precios mayores que
  1e-6·S.

**Paridad put-call:** se cumple en todos los casos de la tabla. T01 y T02 dan el mismo
precio, como corresponde a un forward ATM.

### 1.3 Griegas europeas y sus unidades

Las comparé contra diferencias finitas del precio de referencia, en los mismos 5000 casos.

| Griega | Unidad en la app | Error relativo máximo |
|---|---|---|
| Delta | por unidad del subyacente | 1.4e-6 |
| Gamma | por unidad² | 2.3e-7, en los 3582 casos con gamma no despreciable |
| Vega | por 1 punto de vol, es decir 1% | 3.5e-7 |
| Theta | por día calendario (anual / 365) | 8.9e-6 |
| Rho | por 1 punto de tasa | 4.5e-7 (en BSM, b se mueve con r) |

- **Gamma:** con un paso grande, mi primera referencia dio 12.5%. Fue ruido numérico de la
  diferencia segunda sobre gammas de 1e-8; con extrapolación de Richardson, el error queda en
  2.3e-7.
- **Rho:** Black-76 usa `−T·precio`, porque la tasa solo entra por el descuento. BSM usa
  `K·T·e^(−rT)·N(d2)`. Las dos son correctas, salvo el caso de L4.

### 1.4 Ejercicio americano: Barone-Adesi y Whaley

**Lectura del código:**
- Las raíces `q1`, `q2`, la semilla del punto crítico, la iteración de Newton y el
  coeficiente del término de prima siguen el algoritmo generalizado por costo de carry.
- El límite r → 0 se maneja analíticamente, `4M/K → 8/(σ²T)`.
- El call con b ≥ r devuelve la europea; en ese caso no conviene ejercer antes.
- El precio tiene como piso el máximo entre la europea y el valor intrínseco.

**Medición:** contra el árbol independiente, opciones sobre futuros (b = 0).

| Conjunto | Casos | Mediana | p90 | Máximo (% del subyacente) |
|---|---|---|---|---|
| r > 0 (2, 5, 10%); σ 10, 30, 80%; T 1 día a 2 años; K/S 0.7, 1, 1.3 | 216 | 0.0002% | 0.14% | 0.96% |
| solo T = 1 día | 54 | 0% | 0% | 0.000% |
| solo T = 30 días | 54 | 0% | 0.005% | 0.019% |
| solo T = 2 años | 54 | 0.11% | 0.64% | 0.96% |
| r = 0, calls y puts | 72 | idéntico a la europea | | 0.000% |
| r < 0 (−1%, −0.5%) | 48 | 0% | 0.0001% | 0.024% (L5) |
| BSM con yield: (r, q) en (4, −2), (4, 3), (4, 8), (8, 12) | 96 | 0.012% | 0.10% | 0.23% |

- **El peor caso:** put sobre futuro, K = 130 con subyacente 100, 2 años, r = 10%, σ = 80%.
  La app da 58.9319; el árbol, 57.9702; la europea, 53.5783. BAW sobrevalúa en los plazos
  largos con volatilidad alta, y eso es conocido.
- **`CLAUDE.md` documenta 0.58% como peor caso,** con tasas de 2 a 8% y vol de 15 a 60%.
  Mi grilla se extiende más allá de ese rango, a r = 10% y σ = 80%.

### 1.5 Griegas americanas

La app las calcula por diferencias centrales sobre el precio BAW:
- delta y gamma con un salto de 0.01% de S;
- vega con 0.05 puntos de vol;
- theta con 1 día;
- rho con 0.001 puntos de tasa.

Las comparé contra las mismas diferencias finitas hechas sobre el árbol.

| Caso | Precio | Delta | Gamma | Vega | Theta/día | Rho |
|---|---|---|---|---|---|---|
| Put sobre futuro F=100, K=110, 1 año, r=5%, σ=30%: app | 17.542610 | −0.551268 | 0.013125 | 0.379464 | −0.014198 | −0.101955 |
| ídem: árbol | 17.503730 | −0.552848 | 0.013256 | 0.377692 | −0.013954 | −0.114436 |
| Put oro F=4000, K=4100, 30 días, r=4%, σ=15%: app | 130.264813 | −0.708009 | 0.001989 | 3.914909 | −0.967554 | −0.084198 |
| ídem: árbol | 130.283667 | −0.707905 | 0.001991 | 3.913508 | −0.967741 | −0.081283 |

- **Signo y unidades:** son correctos.
- **Error a 1 año:** precio 0.2%, delta 0.3%, gamma 1%, vega 0.5%, theta 1.7% y **rho 11%**.
  La rho es la griega que BAW captura peor.
- **Error a 30 días:** 0.1% o menos, salvo la rho, con 3.6%.
- **Simetría put-call de las americanas sobre futuros:** se cumple. El call F=110, K=100 vale
  exactamente lo mismo que el put F=100, K=110 (17.542610), igual que en el árbol.

### 1.6 Volatilidad implícita

La medí con 4000 idas y vueltas: precio → IV → comparar con la vol original.
- **Rangos:** 3000 europeas y 1000 americanas; K de 55% a 182% del subyacente; T de 1 hora a
  3 años; σ de 1% a 300%.

| Valor temporal de la opción | Europea | Americana |
|---|---|---|
| Mayor que 0.001·S | 772 casos, error ≤ 0.000001 puntos de vol | 245 casos, ≈ 0 |
| Entre 1e-6·S y 0.001·S | 290 casos, ≤ 0.00004 puntos | 76 casos, ≈ 0 |
| Menor que 1e-6·S: el precio no depende de la vol | 1938 casos; 419 `NaN` por precio 0; el resto, valor arbitrario (L9) | 679 casos; 24 `NaN`; el resto, 0.01% (L9) |

### 1.7 Carry, skew y tiempo

- **Carry:** Black-76 fija b = 0; BSM usa b = r − q, con q igual al campo "yield".
  `carryTracksRate()` le avisa a la rho americana si b se mueve con r. La europea no lo usa,
  y de ahí sale L4. V.
- **Skew de Malz:** `σ(Δ) = ATM − 2·RR·(Δ − 0.5) + 16·BF·(Δ − 0.5)²`, con Δ la delta forward
  del call. Con ATM 30, RR −5 y BF 1 reproduce exactamente las cotizaciones: call 25Δ en
  28.500000 y put 25Δ en 33.500000. V. La convergencia está en L10.
- **Tiempo:** `T = días/365`, en días calendario (ACT/365). Theta es por día calendario. Los
  días pueden ser fraccionarios: 0.0416667 es 1 hora. V.

### 1.8 Tasa libre de riesgo

`rateForTenor()` interpola linealmente la curva par del Tesoro y convierte a tasa continua
con `r = 2·ln(1 + y/2)`. Con la respuesta real del 23 de octubre de 2026, que está en los
fixtures de los tests:

| Plazo | Par interpolada | Continua (app) | Continua (referencia) |
|---|---|---|---|
| 30 días | 4.1100% | 4.0683% | 4.0683% |
| 91 días | 4.2195% | 4.1756% | 4.1756% |
| 365 días | 4.4400% | 4.3914% | 4.3914% |
| 730 días | 4.6900% | 4.6359% | 4.6359% |

**La convención la verifiqué contra el FAQ del Tesoro de EE. UU.**
- Dice: "All yields on the par yield curve are on a bond-equivalent basis". Cada punto de la
  curva equivale a un título con cupones semestrales.
- Da la fórmula `APY = (1 + I/2)² − 1`. De ahí sale `e^r = (1 + y/2)²`, que es exactamente
  lo que hace la app, en todos los plazos.
- Yo sospechaba que los plazos menores a 6 meses estaban en interés simple. Eso habría
  movido la tasa hasta 4 pb, pero el FAQ lo descarta.

**Usar la tasa par como tasa cero** también es una aproximación. A 2 años, la tasa cero
reconstruida desde la misma curva es 4.6432%, contra 4.6359%: 0.7 pb, despreciable. V.

### 1.9 Volatilidad realizada

Recalculé los tres estimadores sobre una serie sintética de 60 días y coinciden a 10
decimales:

| Estimador | Definición | App = referencia |
|---|---|---|
| Close-to-close | desvío muestral (n − 1) de los log-retornos × √252 | 25.9918811025 |
| EWMA | λ = 0.94, sembrado con la varianza muestral | 25.2869464909 |
| Parkinson | `√(Σ ln(H/L)² / (4·ln2·n) × 252)` | 13.3744374929 |

Hay dos detalles: L17, y el desfase entre 252 días hábiles y T/365 de la sección 3.

### 1.10 Analítica de la estrategia

Medí sobre oro: F = 4000, 30 días, r = 4%, σ = 20%, europea, 100 onzas por contrato.

| Estrategia | Medida | App | Exacto |
|---|---|---|---|
| Call largo K=4100 | breakeven | 4150.9182 | 4150.9182, que es K + prima |
| | pérdida máxima | −5091.8195 | −5091.8195, la prima × 100 |
| | probabilidad de ganancia | 25.10% | 25.00% (L7) |
| Bull call 4000/4200 | ganancia máxima | 13452.5751 | 13452.5751 |
| | pérdida máxima | −6547.4249 | −6547.4249 |
| | breakeven | 4065.4742 | 4065.4742 |
| | probabilidad de ganancia | 37.01% | 37.76% (L7) |
| Put largo K=4000 | ganancia máxima | 390881.0257 | 390881.4257; la grilla empieza en S·1e-6, no en 0 |
| Covered call 4200 | ganancia máxima | finita, 22571.15 | finita |
| Calendario de calls (corto 30 días, largo 60 días) | pérdida máxima | europea: "ilimitada"; americana: −3743.10 | ver L12 |

---

## 2. Hallazgos

### L1 — La probabilidad de ganancia usa la vol del panel, no la de las patas · **MEDIA** · *erróneo, verificado*

**Dónde:** `analyse()`, `app.js:837`: `const sigma = state.vol / 100`.

**Qué pasa:** cada pata se valúa con `legVolPct()`: su vol propia, la del skew o la global.
La probabilidad de ganancia, en cambio, integra una lognormal con la vol del panel. Cuando
difieren, la probabilidad no corresponde a los precios de la misma pantalla. Y difieren en el
flujo habitual: el botón IV escribe la vol implícita en la pata.

**Evidencia:** call oro K=4100, 30 días, F=4000; la pata a 40% y el panel a 20%.

| | Probabilidad |
|---|---|
| Lo que muestra la app | 14.5% |
| Exacta con la vol de la pata (40%) | **28.7%** |
| Exacta con la vol del panel (20%) | 14.9% |

**Corrección sugerida:**
- Integrar con la vol a la que se valúa la posición. Con una sola pata es su `legVolPct()`;
  con varias, la del vencimiento más cercano.
- Decir en la etiqueta qué vol se usó.

### L2 — Con patas en otro mes, la delta y la gamma netas no coinciden con el gráfico · **MEDIA** · *erróneo, verificado*

**Dónde:** `netGreeks()`, `app.js:678`.

**Qué pasa:** el gráfico mueve cada mes en proporción al precio de referencia
(`legScenario()`: P × ratio). Por eso la sensibilidad de la posición sobre ese eje es
`Σ lado·cantidad·ratio·Δ`. `netGreeks()` suma las Δ sin el ratio, y las Γ sin ratio², lo
que equivale a suponer que todos los meses se mueven los mismos dólares. Las dos
convenciones se pueden defender, pero la pantalla usa una en el gráfico y otra en las
griegas.

**Evidencia:**
- **Posición:** calendario de calls. La pata corta es a 30 días, K=4000, sobre el panel en
  4000. La larga es a 90 días, K=4100, sobre su propio mes en 4100 (ratio 1.025).
- **Resultado:** la pendiente del P&L en el gráfico, hoy, es **$1.78 por $1**; la delta neta
  que se muestra es **$0.49 por $1**.
- **Por qué:** la diferencia es exactamente 0.025 × Δ de la pata lejana. En un spread casi
  neutral en delta, ese 2.5% se convierte en un factor de 3.6.

**Corrección sugerida:** al sumar, multiplicar cada delta por `legRatio(leg)` y cada gamma
por `ratio²`, que es lo que asume el gráfico. La otra opción es mostrar las griegas por mes
sin sumarlas.

### L3 — Los inputs inválidos se aceptan sin aviso · **MEDIA** · *erróneo, verificado*

**Dónde:**
- Los campos del panel pasan por `num()` (`app.js:2224`), que conserva el valor anterior si
  el texto no es un número, pero no controla el rango. Solo los días y la cantidad se limitan
  a ≥ 0.
- `restore()` (`app.js:1695`) valida el tipo, pero no el rango.

**Evidencia:** put oro K=4000, 30 días, vol 20%, r 4%, 100 onzas, europea.

| Input | Lo que muestra la app |
|---|---|
| Válido | put 91.19; probabilidad 35.6%; breakeven 3908.81 |
| Precio 0 | put 3986.87, que es K·e^(−rT), correcto como límite; probabilidad `NaN`, que se ve como "NaN%" |
| Precio −100 | put **4086.54, mayor que el strike**; "ganancia máxima" −8654.26 |
| Tamaño −100 | ganancia y pérdida máximas intercambiadas; probabilidad 64.4% en vez de 35.6% |
| Strike 0 o −50 | put 0, sin aviso |
| Vol de la pata −10 | se valúa con vol 0, y la probabilidad sigue usando 20% (L1) |
| Tasa −2% | se acepta, y es válida; ver L5 |

**Impacto:** un dato mal tipeado o un link adulterado producen números verosímiles pero
falsos. Además, el modelo lognormal no admite precios ≤ 0, como los del WTI en abril de 2020,
y la app no lo dice.

**Corrección sugerida:**
- Marcar como inválidos el precio ≤ 0, el tamaño ≤ 0, el strike ≤ 0 y la vol < 0.
- Para precios ≤ 0, explicar que el modelo no los cubre.

### L4 — Rho europea con el modelo BSM cuando la tasa es igual a la yield · **BAJA** · *erróneo, verificado*

**Dónde:** `gbs()`, `app.js:104`, elige la rho de Black-76 cuando `abs(b) < 1e-12`. Con el
modelo BSM, `b = r − q` da cero cuando la tasa iguala la yield. Ahí la rho correcta es la de
BSM, porque b sigue moviéndose con r.

**Evidencia:** S = K = 100, 182.5 días, vol 30%, r = q = 4%.
- La app da **−0.0414**; la diferencia finita, moviendo b con r, da **+0.2244**.
- Con q = 3.999%, la app ya da 0.2244.
- La americana, que sí recibe `carryTracksRate()`, da 0.2032, y Black-76 no se ve afectado.

**Corrección sugerida:** pasarle a `gbs()` el mismo indicador que ya recibe
`americanGreeks()`, en vez de deducirlo de b.

### L5 — Con tasa negativa, BAW agrega a los puts una prima que no existe · **BAJA** · *erróneo, verificado*

**Dónde:** `americanPrice()`, `app.js:247`, tiene la guarda del call (b ≥ r → europea) pero
no la del put. Con r ≤ 0 nunca conviene ejercer un put antes del vencimiento.

**Evidencia:** 48 casos con r = −1% y −0.5%.
- **Árbol:** prima de ejercicio nula, ≤ 0.00005.
- **App:** hasta **0.024** sobre un subyacente de 100. Ejemplo: put K=120, 3 meses, vol 20%;
  la app da 20.2217, y el árbol y la europea dan 20.1978.
- **Con r = 0:** la app ya devuelve la europea exacta, V en 72 casos.

**Corrección sugerida:** para un put con r ≤ 0, devolver el precio europeo.

### L6 — BAW es una aproximación: su precisión, medida · **BAJA** · *aproximado, verificado*

Los números están en las secciones 1.4 y 1.5:
- error mediano de 0.0002% del subyacente;
- 0.019% a 30 días o menos;
- 0.96% en el peor caso, a 2 años, σ = 80% y r = 10%;
- la rho americana con ~11% de error a 1 año.

Para plazos y volatilidades habituales es suficiente. Para contratos largos y muy volátiles,
el árbol de `test/american.test.js` es la referencia. Pasar a europeo no es una alternativa:
ignora la prima de ejercicio, que en esta tabla llega a 6.56 por unidad (T18).

### L7 — La probabilidad de ganancia tiene error de grilla · **BAJA** · *aproximado, verificado*

**Dónde:** `analyse()` integra por celdas de la grilla de 1200 puntos. La celda que contiene
el breakeven entra entera o no entra, según el signo del P&L en su punto medio.

**Evidencia:**
- call largo: 25.10% contra 25.00% exacto;
- bull call: 37.01% contra 37.76% (−0.75 pp).

**Corrección sugerida:** integrar entre los breakevens exactos, que `analyse()` ya calcula.
Se puede hacer en el mismo cambio que L1.

### L8 — Los precios se muestran con 2 decimales · **MEDIA** · *aproximado, solo en pantalla, verificado*

**Dónde:** `legRowHtml()`, `app.js:1246`: precio teórico, entry por defecto y breakevens con
`fmt(x, 2)`.

**Evidencia:** opciones a 30 días, r = 4%.

| Contrato | Prima real | Se muestra | Error por contrato |
|---|---|---|---|
| Cobre F=4.50, K=4.70, σ 22% | 0.04204 | 0.04 | **−$50.98 (−4.9%)** |
| Gas natural F=3.000, K=3.100, σ 60% | 0.16229 | 0.16 | −$22.88 (−1.4%) |
| Plata F=53, K=56, σ 28% | 0.63751 | 0.64 | +$12.44 (+0.4%) |
| Oro F=4000, K=4100, σ 15% | 30.52211 | 30.52 | −$0.21 |

**Impacto:** el cálculo usa precisión completa; lo que se ve, no. Si alguien copia el precio
teórico a "Entry", el error pasa al P&L.

**Corrección sugerida:** decimales según el tick de cada contrato. Por ejemplo, 3 para gas y
plata, y 4 para cobre (los ticks son E).

### L9 — Cuando la IV no se puede determinar, devuelve un número arbitrario · **BAJA** · *aproximado, verificado*

**Dónde:** `impliedVol()` (`app.js:303`) y el botón IV, que escribe el resultado en la pata
(`app.js:2413`).

**Qué pasa:** si la prima no tiene valor temporal, cualquier vol reproduce el mismo precio.
El precio es 0, o igual al intrínseco descontado. Aun así, la función devuelve:
- en la europea, 0.30, que es el punto de partida de Newton. Ejemplo: put K=126.77, 1.6 horas
  al vencimiento, vol real 297.7%; devuelve 30%;
- en la americana, 0.0001, el piso de la bisección.

El botón escribe ese número en la pata como si fuera la volatilidad implícita.

**Corrección sugerida:** si la prima es igual al intrínseco, dentro de una tolerancia, avisar
que la IV no se puede determinar y no escribir nada.

### L10 — El skew de Malz puede no converger, y no avisa · **BAJA** · *aproximado, verificado*

**Dónde:** `skewVol()`, `app.js:527`. Es una iteración de punto fijo de 40 pasos sin
amortiguar; si no converge, devuelve el último valor.

**Evidencia:** 40000 combinaciones al azar, con ATM de 5 a 100%, RR de −20 a +20 puntos, BF
de 0 a 10 puntos, K/S de 0.5 a 2 y T de 1 día a 2 años.

| Pendiente del ala | Casos | No convergen | Error > 0.1 punto de vol |
|---|---|---|---|
| abs(RR) y 2·BF ≤ 25% de la ATM | 19688 | 0 | 0 |
| 25 a 50% | 11168 | 17 | 0 |
| 50 a 100% | 5537 | 194 | 13 |
| mayor que la ATM | 3607 | 441 | 185 |

**Corrección sugerida:** amortiguar la iteración o resolverla con bisección sobre la delta,
y avisar si no converge. En superficies realistas no ocurre.

### L11 — El P&L no financia la prima · **BAJA** · *aproximado, verificado por cálculo*

**Dónde:** `pnlEvaluator()`. El P&L a vencimiento es `valor − prima`, sin el interés de la
prima pagada por adelantado.

**Evidencia, con r = 4%:**
- oro ATM a 30 días: prima 91.19, interés 0.30, es decir 0.33% de la prima;
- ATM a 2 años con σ = 35%: prima 18.04, interés 1.50, es decir 8.3%.

El breakeven real está corrido en ese monto.

**Corrección sugerida:** sumar el costo financiero al P&L a vencimiento, o decirlo en la
interfaz. Es una simplificación habitual, pero a 2 años ya no es despreciable.

### L12 — Un calendario europeo muestra "pérdida ilimitada" · **BAJA** · *aproximado (correcto en el modelo, engañoso), verificado*

**Qué pasa:** en el vencimiento cercano, la pata lejana europea muy en el dinero vale
`e^(−rT')·(F − K)`, y la corta paga `F − K`. El P&L cae entonces con pendiente
`(e^(−rT') − 1) × multiplicador`, unos −$0.33 por $1 en el ejemplo. Por eso la app muestra
"ilimitada". En modo americano la pata lejana se ejerce, y la pérdida máxima es −$3743.10.

**Corrección sugerida:** usar un umbral relativo al tamaño de la posición, o mostrar la
pendiente en lugar de "Unlimited".

### L13 — Una sola tasa para todas las patas · **BAJA** · *aproximado, verificado*

`applyRate()` interpola la curva al plazo del panel, `state.days`, y esa tasa se aplica a
todas las patas. En un calendario de 30 y 91 días, las tasas continuas son 4.0683% y 4.1756%:
10.7 pb de diferencia, y su efecto en el precio es despreciable.

### L14 — Con σ = 0 o T = 0, theta y rho valen 0 · **BAJA** · *aproximado, verificado*

En la rama degenerada de `gbs()`, el precio es correcto: el intrínseco del forward,
descontado. Pero θ y ρ quedan en 0. En T16 (F=100, K=95, 30 días, σ = 0, r = 4%):

| Griega | Debería ser | La app muestra |
|---|---|---|
| θ (por día) | +0.000546 = r·V/365 | 0 |
| ρ (por punto) | −0.004096 = −T·V/100 | 0 |

Las cifras son muy chicas.

### L15 — La IV se guarda con 2 decimales · **BAJA** · *aproximado, verificado*

El botón IV redondea a 0.01 puntos: `+(iv * 100).toFixed(2)`. En un call de oro americano
ATM a 30 días, con prima 91.37, la IV es 20.031317% y se guarda 20.03%. La pata se revalúa
en 91.3640: **−$0.60 por contrato**, y el P&L de hoy ya no da cero.

Lo mismo pasa con la vol realizada, guardada con 2 decimales: hasta ±0.005 puntos, unos
±$2.3 por contrato en oro ATM a 30 días.

### L16 — Theta por día es una tasa instantánea · *informativo, verificado*

En T04, a 1 hora del vencimiento, θ da −40.92 por día con un precio de 3.41. Es la derivada
expresada por día, no la pérdida de un día; esa no puede superar el valor de la opción.
Conviene tenerlo en cuenta al compararla con otra herramienta.

### L17 — Parkinson usa 21 rangos y 20 retornos · *informativo, verificado*

`realisedVol()` toma `window + 1` barras: usa 21 rangos máximo/mínimo, mientras el
close-to-close usa 20 retornos. La diferencia es mínima.

---

## 3. Supuestos del modelo e idoneidad para futuros de commodities

| Supuesto | Qué hace la app | Evaluación |
|---|---|---|
| Modelo | Black-76: lognormal, el futuro sin tendencia bajo la medida neutral al riesgo | E: es el estándar de mercado para opciones sobre futuros; la interfaz lo dice |
| Ejercicio | Americano por defecto, con BAW | E: la mayoría de las opciones sobre futuros de commodities de CME e ICE US son americanas; hay variantes europeas, semanales y de precio promedio, así que conviene confirmarlo en cada contrato. V: la precisión de BAW está en L6 |
| Prima | Se descuenta a la tasa r | E: en CME la prima se paga al contado, así que descontar es correcto. Con margen estilo futuros, que usan algunas bolsas europeas, hay que usar r = 0. V: con r = 0 la app devuelve la europea exacta |
| Precios ≤ 0 | No se pueden valuar | E: con precios negativos el estándar es el modelo normal (Bachelier). V: la app no avisa (L3) |
| Volatilidad | Una por pata, con skew paramétrico opcional "sticky strike" | E: las sonrisas de commodities son asimétricas y cambian con la estación; no hay estructura temporal salvo la vol por pata |
| Tiempo | ACT/365, días calendario | E: el vencimiento de la opción no es el del futuro, y quien usa la app tiene que cargar los días de la opción. Los vencimientos de la curva se aproximan a mitad de mes (documentado) |
| Tasa | Curva par del Tesoro, continua, al plazo del panel | V: la conversión es correcta (1.8); par contra cero 0.7 pb; una tasa para todas las patas (L13) |
| Vol de mercado | Realizada (histórica), no implícita | V: la interfaz lo dice. E: el roll del contrato continuo puede inflarla (documentado) |
| Anualización | Vol con 252 días hábiles; T con 365 calendario | E: es la convención habitual. Con poco plazo y un fin de semana en el medio, la varianza del período queda algo sobrestimada |
| Modelo BSM | Spot con b = r − q | V: la interfaz avisa que es solo para precio spot. E: la "yield" es la convenience yield neta del costo de almacenamiento |
| Probabilidad de ganancia | Neutral al riesgo | E: no es una probabilidad real; ignora la tendencia del mercado. La etiqueta lo dice. V: L1 y L7 |
| Contratos | Tamaños y unidades de `commodities.js` | Ver 5.2 |
| Brent | La etiqueta dice "ICE B", pero los datos vienen de NYMEX `BZ` | V en el código. E: son contratos distintos con precios muy cercanos |

---

## 4. Inputs inválidos y casos borde

Todo esto está medido, V.

| Caso | Resultado | Veredicto |
|---|---|---|
| Vencimiento en 1 día y en 1 hora (T03, T04) | Precio y griegas exactos | Correcto |
| Vencimiento 0 (T17) | Intrínseco exacto; delta 1 | Correcto |
| σ = 0 (T16) | Precio exacto, el intrínseco del forward descontado | Correcto, salvo θ y ρ (L14) |
| σ = 1% (T06, T07) | Exacto | Correcto |
| σ = 150% (T08, T09) | Exacto | Correcto |
| σ = 300% en la IV | Se recupera si hay valor temporal | Correcto |
| Strike 50% fuera del dinero (T11) | 4.5274e-20, exacto, sin desbordes | Correcto |
| Strike 3 veces el precio con σ = 150% (T09) | Exacto | Correcto |
| Put muy en el dinero, europeo (T12) | Exacto, con theta positiva | Correcto |
| Put muy en el dinero, americano (T18) | Ejercicio inmediato, exactamente 2000 | Correcto |
| r = 0, americana | Europea exacta | Correcto |
| r < 0, put americano | Prima espuria | Erróneo (L5) |
| Precio ≤ 0, tamaño < 0, strike ≤ 0, vol < 0 | Se acepta sin aviso | Erróneo (L3) |
| Campo vacío o a medio escribir | Conserva el valor anterior | Correcto |
| Días o cantidad negativos | Se limitan a 0 | Correcto |
| IV de una prima sin valor temporal | Número arbitrario | Aproximado (L9) |
| Skew muy empinado | Puede no converger | Aproximado (L10) |

---

## 5. Redondeos y unidades

### 5.1 Unidades (V)

| Magnitud | Convención |
|---|---|
| Tiempo | días / 365, calendario |
| Tasa | % en pantalla; decimal y continua en el cálculo |
| Volatilidad | % anual en pantalla; decimal en el cálculo |
| Precio de la opción | por unidad de cotización: USD/oz, centavos/bushel, USD/lb… |
| Delta | por unidad del subyacente; en dólares, × multiplicador |
| Gamma | por unidad²; en dólares, × multiplicador |
| Vega | por 1 punto de vol |
| Theta | por día calendario |
| Rho | por 1 punto de tasa |
| Multiplicador | tamaño × 0.01 si cotiza en centavos; si no, tamaño |
| Griegas y P&L en dólares | unidad × multiplicador × cantidad × lado |

### 5.2 Contratos

El multiplicador que aplica la app es V. Que los tamaños coincidan con las bolsas es E:
coinciden con las especificaciones públicas que conozco, pero no las leí de los reglamentos.

| Mercado | Tamaño | Cotización | Multiplicador | Ejemplo |
|---|---|---|---|---|
| Oro (GC) | 100 oz | USD/oz | 100 | — |
| Plata (SI) | 5000 oz | USD/oz | 5000 | — |
| Cobre (HG) | 25000 lb | USD/lb | 25000 | T14: 0.194853 × 25000 = $4871.33 |
| WTI (CL) | 1000 bbl | USD/bbl | 1000 | — |
| Brent | 1000 bbl | USD/bbl | 1000 | — |
| Gas natural (NG) | 10000 MMBtu | USD/MMBtu | 10000 | — |
| Maíz, trigo, soja | 5000 bu | ¢/bu | 50 | T13: 9.479745 × 50 = $473.99 |
| Azúcar (SB) | 112000 lb | ¢/lb | 1120 | — |
| Café (KC) | 37500 lb | ¢/lb | 375 | — |
| Cacao (CC) | 10 t | USD/t | 10 | — |
| Algodón (CT) | 50000 lb | ¢/lb | 500 | — |
| Ganado (LE) | 40000 lb | ¢/lb | 400 | — |

### 5.3 Redondeos (V)

| Dónde | Redondeo | Efecto medido o calculado |
|---|---|---|
| Precio, entry y breakevens en pantalla | 2 decimales | hasta −4.9% de la prima del cobre (L8) |
| IV escrita en la pata | 2 decimales de vol | −$0.60 por contrato en el ejemplo (L15) |
| Vol realizada en el panel | 2 decimales | hasta ±$2.3 por contrato en oro ATM a 30 días |
| Tasa del Tesoro | 3 decimales de % | ±0.0005 puntos, despreciable |
| Yield de la curva | 3 decimales de % | despreciable |
| Precio por pata desde la curva | 4 decimales | despreciable |
| Cálculo interno | doble precisión | sin efecto |

---

## 6. Tabla de casos de prueba

Calculé los valores esperados de forma independiente, con el script del apéndice A. Están
pensados para que los compares con otra herramienta.

### 6.1 Convenciones

Para que tu referencia dé los mismos números, tiene que usar estas convenciones:
- **T = días / 365.** Una hora son 1/24 de día.
- **La tasa r es continua.** Si tu herramienta pide tasa anual simple o efectiva, conviértela:
  la continua es `ln(1 + anual)`.
- **Black-76 sobre el precio del futuro F,** descontado con `e^(−rT)`, sin yield.
- **Vega por 1 punto de vol, theta por día calendario y rho por 1 punto de tasa.** Muchas
  herramientas dan theta por día hábil (÷ 252) o por año, y vega o rho por unidad; ajustá
  eso antes de comparar.
- **Americanas:** el valor esperado sale de un árbol binomial, cuyo error estimo en ≤ 1e-4
  en estos casos (E). Si tu referencia usa BAW, debería coincidir con la columna "app"; si
  usa un árbol o diferencias finitas, con la columna "árbol".
- **$ por contrato:** es el precio esperado × multiplicador del mercado indicado (5.2). En
  los casos genéricos, sin mercado asignado, va "—".

### 6.2 Precios: europeas (fórmula cerrada)

| ID | Caso | Modelo | Tipo | F (o S) | K | Días | r % | q % | Vol % | Esperado | App | App − esperado | $ por contrato |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| T01 | Oro ATM, 30 días | B76 | call | 4000 | 4000 | 30 | 4 | — | 20 | 91.185743 | 91.185743 | 7e-13 | 9118.57 (oro) |
| T02 | Ídem, put (paridad con T01) | B76 | put | 4000 | 4000 | 30 | 4 | — | 20 | 91.185743 | 91.185743 | 7e-13 | 9118.57 |
| T03 | 1 día al vencimiento, ATM | B76 | call | 4000 | 4000 | 1 | 4 | — | 20 | 16.703368 | 16.703368 | 0 | 1670.34 |
| T04 | 1 hora al vencimiento, ATM | B76 | call | 4000 | 4000 | 0.0416667 | 4 | — | 20 | 3.409934 | 3.409934 | 0 | 340.99 |
| T05 | 1 día, strike 2.5% arriba | B76 | call | 4000 | 4100 | 1 | 4 | — | 20 | 0.130482 | 0.130482 | 2e-14 | 13.05 |
| T06 | Vol muy baja (1%), fuera del dinero | B76 | call | 100 | 101 | 90 | 4 | — | 1 | 0.004153 | 0.004153 | −4e-16 | — |
| T07 | Vol muy baja (1%), put en el dinero | B76 | put | 100 | 101 | 90 | 4 | — | 1 | 0.994338 | 0.994338 | 0 | — |
| T08 | Vol muy alta (150%), ATM | B76 | call | 3.000 | 3.000 | 180 | 4 | — | 150 | 1.181231 | 1.181231 | −4e-16 | 11812.31 (gas) |
| T09 | Vol 150%, strike 3 veces el precio | B76 | call | 3.000 | 9.000 | 180 | 4 | — | 150 | 0.376749 | 0.376749 | 1e-16 | 3767.49 (gas) |
| T10 | Strike 15% arriba, 30 días | B76 | call | 4000 | 4600 | 30 | 4 | — | 15 | 0.028256 | 0.028256 | 2e-14 | 2.83 (oro) |
| T11 | Strike 50% arriba, 30 días | B76 | call | 4000 | 6000 | 30 | 4 | — | 15 | 4.5274e-20 | 4.5274e-20 | −1e-27 | 0.00 (oro) |
| T12 | Strike 50% arriba, put muy en el dinero | B76 | put | 4000 | 6000 | 30 | 4 | — | 15 | 1993.435454 | 1993.435454 | 0 | 199343.55 (oro) |
| T13 | Maíz, en centavos por bushel | B76 | call | 430 | 450 | 60 | 4 | — | 25 | 9.479745 | 9.479745 | 0 | 473.99 (maíz) |
| T14 | Cobre, en dólares por libra | B76 | put | 4.50 | 4.60 | 45 | 4 | — | 22 | 0.194853 | 0.194853 | −4e-16 | 4871.33 (cobre) |
| T15 | 2 años, ATM | B76 | call | 100 | 100 | 730 | 4.6359 | — | 35 | 17.816026 | 17.816026 | −2e-14 | — |
| T16 | Volatilidad cero, en el dinero | B76 | call | 100 | 95 | 30 | 4 | — | 0 | 4.983589 | 4.983589 | 0 | — |
| T17 | Al vencimiento (0 días), en el dinero | B76 | call | 100 | 95 | 0 | 4 | — | 20 | 5.000000 | 5.000000 | 0 | — |
| T23 | BSM spot, yield 6% mayor que la tasa 4% | BSM | call | 100 | 100 | 182 | 4 | 6 | 25 | 6.385025 | 6.385025 | 1e-14 | — |

### 6.3 Precios: americanas (árbol binomial)

| ID | Caso | Modelo | Tipo | F (o S) | K | Días | r % | q % | Vol % | Europea | Árbol | App (BAW) | App − árbol | Prima de ejercicio |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| T18 | Put muy en el dinero: se ejerce ya | B76 | put | 4000 | 6000 | 30 | 4 | — | 15 | 1993.435454 | 2000.000000 | 2000.000000 | 0 | 6.564546 |
| T19 | Put a 1 año | B76 | put | 100 | 110 | 365 | 5 | — | 30 | 17.256264 | 17.503730 | 17.542610 | +0.038880 | 0.247466 |
| T20 | Call a 1 año, espejo de T19 | B76 | call | 110 | 100 | 365 | 5 | — | 30 | 17.256264 | 17.503730 | 17.542610 | +0.038880 | 0.247466 |
| T21 | Call a 2 años, ATM | B76 | call | 100 | 100 | 730 | 4.6359 | — | 35 | 17.816026 | 18.251495 | 18.417108 | +0.165613 | 0.435469 |
| T22 | Put de oro, 30 días | B76 | put | 4000 | 4100 | 30 | 4 | — | 15 | 130.193886 | 130.283667 | 130.264813 | −0.018854 | 0.089781 |
| T24 | BSM spot, ídem T23, americana | BSM | call | 100 | 100 | 182 | 4 | 6 | 25 | 6.385025 | 6.497464 | 6.499855 | +0.002391 | 0.112439 |

En dólares por contrato de oro: T18 = $200000.00 y T22 = $13028.37 según el árbol, o
$13026.48 según la app.

### 6.4 Griegas de las europeas

Estos son los valores esperados. La app coincide con cada uno en todas las cifras mostradas,
salvo las notas al pie.

| ID | d1 | d2 | Delta | Gamma | Vega (por punto) | Theta (por día) | Rho (por punto) |
|---|---|---|---|---|---|---|---|
| T01 | 0.028669 | −0.028669 | 0.509757 | 0.00173300 | 4.558038 | −1.509353 | −0.074947 |
| T02 | 0.028669 | −0.028669 | −0.486961 | 0.00173300 | 4.558038 | −1.509353 | −0.074947 |
| T03 | 0.005234 | −0.005234 | 0.502033 | 0.00952605 | 0.835161 | −8.349777 | −0.000458 |
| T04 | 0.001068 | −0.001068 | 0.500424 | 0.04667345 | 0.170497 | −40.918815 (L16) | −3.8926e-06 |
| T05 | −2.353524 | −2.363993 | 0.009297 | 0.00059721 | 0.052358 | −0.523563 | −3.5748e-06 ¹ |
| T06 | −2.001356 | −2.006321 | 0.022455 ¹ | 0.10737050 | 0.026475 | −0.000147 | −1.0239e-05 |
| T07 | −2.001356 | −2.006321 | −0.967731 | 0.10737050 | 0.026475 | −3.8114e-05 | −0.002452 |
| T08 | 0.526685 | −0.526685 | 0.687105 | 0.10774690 | 0.007173 | −0.002859 | −0.005825 |
| T09 | −0.516265 | −1.569635 | 0.296920 | 0.10833400 | 0.007212 | −0.002964 | −0.001858 |
| T10 | −3.228499 | −3.271503 | 0.000620 | 1.2605e-05 | 0.024865 | −0.006213 | −2.3224e-05 |
| T11 | −9.407116 | −9.450120 | 2.5413e-21 | 1.4052e-22 | 2.7718e-19 | −6.9291e-20 | −3.7211e-23 |
| T12 | −9.407116 | −9.450120 | −0.996718 | 1.4052e-22 ² | 2.7718e-19 ² | +0.218459 | −1.638440 |
| T13 | −0.397841 | −0.499201 | 0.343110 | 0.00840132 | 0.638385 | −0.131958 | −0.015583 |
| T14 | −0.245903 | −0.323151 | −0.594184 | 1.10800762 | 0.006086 | −0.001466 | −0.000240 |
| T15 | 0.247487 | −0.247487 | 0.544805 | 0.00712459 | 0.498721 | −0.009693 | −0.356321 |
| T16 | — | — | 0.996718 | 0 | 0 | +0.000546 ³ | −0.004096 ³ |
| T17 | — | — | 1 | 0 | 0 | 0 | 0 |
| T23 | 0.031776 | −0.144758 | 0.497564 | 0.02192141 | 0.273267 | −0.015342 | +0.216263 ⁴ |

1. La app difiere en la última cifra mostrada: −3.5749e-06 y 0.022454. Es el límite de
   precisión de las diferencias finitas, no un error.
2. En T12, la diferencia finita da ruido (1.3e-14 de gamma y 0 de vega), porque gamma y vega
   son prácticamente cero. El valor analítico es el de la tabla, igual al de T11, porque el
   put y el call comparten gamma y vega. La app da ese valor.
3. Con σ = 0, la app muestra 0 en theta y rho (L14).
4. Es la rho de BSM, con b moviéndose con r. Con tasa igual a la yield, la app falla (L4).

### 6.5 Cómo calcularlos en Excel o Google Sheets

Con F, K, r y σ en decimal y T = días/365:

```
d1   = (LN(F/K) + σ^2*T/2) / (σ*RAIZ(T))
d2   = d1 - σ*RAIZ(T)
Call = EXP(-r*T) * (F*N(d1) - K*N(d2))
Put  = EXP(-r*T) * (K*N(-d2) - F*N(-d1))

Delta call = EXP(-r*T)*N(d1)            Delta put = EXP(-r*T)*(N(d1) - 1)
Gamma      = EXP(-r*T)*n(d1) / (F*σ*RAIZ(T))
Vega       = F*EXP(-r*T)*n(d1)*RAIZ(T) / 100                       (por punto)
Theta call = (-F*EXP(-r*T)*n(d1)*σ/(2*RAIZ(T)) + r*F*EXP(-r*T)*N(d1) - r*K*EXP(-r*T)*N(d2)) / 365
Theta put  = (-F*EXP(-r*T)*n(d1)*σ/(2*RAIZ(T)) - r*F*EXP(-r*T)*N(-d1) + r*K*EXP(-r*T)*N(-d2)) / 365
Rho        = -T*precio / 100                                       (por punto, Black-76)
```

- **N(x):** `DISTR.NORM.ESTAND.N(x; VERDADERO)` en Excel en español, o
  `NORM.S.DIST(x, TRUE)` en inglés.
- **n(x):** la misma función con `FALSO` o `FALSE`.
- **`RAIZ`** es `SQRT` en inglés.
- El separador de argumentos, `;` o `,`, depende de la configuración regional.

**Para BSM sobre spot (T23):**
```
d1   = (LN(S/K) + (r - q + σ^2/2)*T) / (σ*RAIZ(T))
d2   = d1 - σ*RAIZ(T)
Call = S*EXP(-q*T)*N(d1) - K*EXP(-r*T)*N(d2)
Rho  = K*T*EXP(-r*T)*N(d2) / 100
```

Las americanas no tienen fórmula cerrada. Para contrastarlas hace falta una herramienta con
árbol binomial o con BAW (ver 6.1).

---

## 7. Lo que no verifiqué

- **Una calculadora comercial o las liquidaciones de la bolsa.** Ese contraste te queda a
  vos, con la tabla 6.
- **Los reglamentos de las bolsas.** Tamaños de contrato, ticks, estilo de ejercicio y tipo
  de margen salen de conocimiento general (E).
- **La pantalla en el navegador.** Las cifras salen del mismo código cargado en Node. Lo que
  se ve, como el "NaN%" o los 2 decimales, lo deduje del código de render; no lo
  fotografié.
- **La calidad de los datos de mercado** (Yahoo, Alpha Vantage, Tesoro). Solo revisé cómo se
  transforman.
- **La tabla de escenarios, la yield implícita y la interpolación de la curva por pata.** Las
  leí; usan funciones medidas acá o cubiertas por tests existentes, pero no las volví a
  medir por separado.

---

## 8. Orden sugerido de corrección

No implementé nada; esta revisión fue de solo lectura. Si se corrigen, conviene un PR por
hallazgo, como en la revisión 1.

1. **L1 y L7:** la probabilidad de ganancia con la vol de las patas, integrada entre los
   breakevens exactos. Es la misma función.
2. **L3:** validar los inputs y avisar cuando el precio es ≤ 0.
3. **L2:** escalar las griegas netas al eje del gráfico.
4. **L8:** decimales según el tick de cada contrato.
5. **L4 y L5:** una línea cada uno, con su test.
6. **L9 y L10:** avisar cuando la IV no se puede determinar y cuando el skew no converge.
7. **L11, L12, L14 y L15:** documentarlos o ajustarlos; ninguno cambia una decisión en
   plazos cortos.

---

## Apéndice A — Script de referencia (Python 3, sin paquetes externos)

Reproduce todos los valores esperados de la sección 6. Tarda unos 30 segundos, sobre todo
por los árboles.

```python
import math

def N(x):  # normal estándar acumulada, vía erfc de la biblioteca de C
    return 0.5 * math.erfc(-x / math.sqrt(2))

def europea(tipo, S, K, T, r, b, v):
    """Black-Scholes-Merton generalizado: b = 0 es Black-76 sobre un futuro."""
    if T <= 0:
        return max(S - K, 0.0) if tipo == 'call' else max(K - S, 0.0)
    if v <= 0:
        F = S * math.exp(b * T)
        return math.exp(-r * T) * (max(F - K, 0.0) if tipo == 'call' else max(K - F, 0.0))
    d1 = (math.log(S / K) + (b + v * v / 2) * T) / (v * math.sqrt(T))
    d2 = d1 - v * math.sqrt(T)
    if tipo == 'call':
        return S * math.exp((b - r) * T) * N(d1) - K * math.exp(-r * T) * N(d2)
    return K * math.exp(-r * T) * N(-d2) - S * math.exp((b - r) * T) * N(-d1)

def arbol(tipo, S, K, T, r, b, v, n):
    """Binomial CRR americano con el último paso valuado en forma cerrada."""
    dt = T / n; u = math.exp(v * math.sqrt(dt)); d = 1 / u
    p = (math.exp(b * dt) - d) / (u - d); desc = math.exp(-r * dt)
    ej = (lambda s: max(s - K, 0.0)) if tipo == 'call' else (lambda s: max(K - s, 0.0))
    i = n - 1
    V = [max(europea(tipo, S * u ** (2 * j - i), K, dt, r, b, v), ej(S * u ** (2 * j - i)))
         for j in range(i + 1)]
    for i in range(n - 2, -1, -1):
        for j in range(i + 1):
            c = desc * (p * V[j + 1] + (1 - p) * V[j])
            e = ej(S * u ** (2 * j - i))
            V[j] = c if c > e else e
        V.pop()
    return V[0]

def americana(tipo, S, K, T, r, b, v):
    """Extrapolación de Richardson entre 1600 y 800 pasos."""
    return 2 * arbol(tipo, S, K, T, r, b, v, 1600) - arbol(tipo, S, K, T, r, b, v, 800)

def griegas(tipo, S, K, T, r, b, v, b_sigue_a_r):
    """Diferencias finitas sobre europea(): no comparte fórmulas con la app."""
    P = lambda S=S, T=T, r=r, b=b, v=v: europea(tipo, S, K, T, r, b, v)
    p0 = P(); h = S * 1e-5
    delta = (P(S=S + h) - P(S=S - h)) / (2 * h)
    g = lambda h: (P(S=S + h) - 2 * p0 + P(S=S - h)) / (h * h)
    hg = S * v * math.sqrt(T) * 0.02
    gamma = (4 * g(hg / 2) - g(hg)) / 3
    vega = (P(v=v + 1e-5) - P(v=v - 1e-5)) / 2e-5 / 100
    ht = T * 1e-5
    theta = -(P(T=T + ht) - P(T=T - ht)) / (2 * ht) / 365
    hr = 1e-6; db = hr if b_sigue_a_r else 0.0
    rho = (P(r=r + hr, b=b + db) - P(r=r - hr, b=b - db)) / (2 * hr) / 100
    return delta, gamma, vega, theta, rho

CASOS = [  # id, modelo, estilo, tipo, F (o S), K, días, r %, q %, vol %
    ('T01', 'b76', 'europea', 'call', 4000, 4000, 30, 4, 0, 20),
    ('T02', 'b76', 'europea', 'put', 4000, 4000, 30, 4, 0, 20),
    ('T03', 'b76', 'europea', 'call', 4000, 4000, 1, 4, 0, 20),
    ('T04', 'b76', 'europea', 'call', 4000, 4000, 1 / 24, 4, 0, 20),
    ('T05', 'b76', 'europea', 'call', 4000, 4100, 1, 4, 0, 20),
    ('T06', 'b76', 'europea', 'call', 100, 101, 90, 4, 0, 1),
    ('T07', 'b76', 'europea', 'put', 100, 101, 90, 4, 0, 1),
    ('T08', 'b76', 'europea', 'call', 3.0, 3.0, 180, 4, 0, 150),
    ('T09', 'b76', 'europea', 'call', 3.0, 9.0, 180, 4, 0, 150),
    ('T10', 'b76', 'europea', 'call', 4000, 4600, 30, 4, 0, 15),
    ('T11', 'b76', 'europea', 'call', 4000, 6000, 30, 4, 0, 15),
    ('T12', 'b76', 'europea', 'put', 4000, 6000, 30, 4, 0, 15),
    ('T13', 'b76', 'europea', 'call', 430, 450, 60, 4, 0, 25),
    ('T14', 'b76', 'europea', 'put', 4.50, 4.60, 45, 4, 0, 22),
    ('T15', 'b76', 'europea', 'call', 100, 100, 730, 4.6359, 0, 35),
    ('T16', 'b76', 'europea', 'call', 100, 95, 30, 4, 0, 0),
    ('T17', 'b76', 'europea', 'call', 100, 95, 0, 4, 0, 20),
    ('T18', 'b76', 'americana', 'put', 4000, 6000, 30, 4, 0, 15),
    ('T19', 'b76', 'americana', 'put', 100, 110, 365, 5, 0, 30),
    ('T20', 'b76', 'americana', 'call', 110, 100, 365, 5, 0, 30),
    ('T21', 'b76', 'americana', 'call', 100, 100, 730, 4.6359, 0, 35),
    ('T22', 'b76', 'americana', 'put', 4000, 4100, 30, 4, 0, 15),
    ('T23', 'bs', 'europea', 'call', 100, 100, 182, 4, 6, 25),
    ('T24', 'bs', 'americana', 'call', 100, 100, 182, 4, 6, 25),
]

for (i, modelo, estilo, tipo, F, K, dias, r, q, vol) in CASOS:
    T = dias / 365; rr = r / 100; vv = vol / 100
    b = 0.0 if modelo == 'b76' else (r - q) / 100
    linea = '%s  europea %.6f' % (i, europea(tipo, F, K, T, rr, b, vv))
    if estilo == 'americana':
        linea += '  americana (árbol) %.6f' % americana(tipo, F, K, T, rr, b, vv)
    elif T > 0 and vv > 0:
        linea += '  delta %.6f  gamma %.8g  vega %.6f  theta %.6f  rho %.6g' % griegas(
            tipo, F, K, T, rr, b, vv, modelo == 'bs')
    print(linea)
```

## Apéndice B — Pruebas masivas

Todas son contra el commit `dec7390`, con la app cargada en Node y la referencia en Python.

| Prueba | Casos | Parámetros | Resultado |
|---|---|---|---|
| `normCdf` contra `erfc` | 8010 | x de −40 a 40, paso 0.01 | abs ≤ 2.2e-16; cola relativa ≤ 8.9e-9 |
| Precio y griegas europeas | 5000 | ver 1.2 | precio ≤ 1.2e-11; griegas ≤ 8.9e-6 |
| BAW contra árbol, futuros | 288 | ver 1.4 | mediana 0.0002% de S, máximo 0.96% |
| BAW con tasa negativa | 48 | r −1% y −0.5% | prima espuria hasta 0.024 (L5) |
| BAW, BSM con yield | 96 | ver 1.4 | mediana 0.012%, máximo 0.23% |
| Griegas americanas | 3 | ver 1.5 | ρ con 11% de error a 1 año; el resto ≤ 1.7% |
| IV, ida y vuelta | 4000 | 1 hora a 3 años, σ de 1 a 300% | ≤ 0.00004 puntos con valor temporal (L9) |
| Skew de Malz | 40000 | ver L10 | converge si abs(RR) y 2·BF ≤ 25% de la ATM |
| Analítica | 7 estrategias | oro, ver 1.10 | máximos y breakevens exactos; probabilidad, L1 y L7 |
| Tasa | 9 plazos | fixture real del Tesoro | exacta; convención confirmada con el FAQ del Tesoro |
| Vol realizada | 1 serie | 60 días sintéticos | los 3 estimadores coinciden a 10 decimales |
