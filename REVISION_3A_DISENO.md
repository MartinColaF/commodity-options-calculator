# Revisión de diseño #3A — Commodity Options Calculator

**Fecha:** 28 de octubre de 2026 · **Revisado:** `main` @ `9249ff4` (lo mismo que está en producción)
· **Modo:** solo lectura, no se modificó código.

**Alcance.** Diseño visual y experiencia de uso:
- jerarquía, tipografía, color y contraste, espaciado y consistencia;
- formularios, resultados, y estados de error, carga y vacío;
- uso en el celular, accesibilidad básica y percepción profesional;
- las dos preguntas agregadas: si conviene publicar en inglés y español (§4), y si las
  explicaciones deberían ir detrás de íconos «?» (§3).

**Para quién.** La página se va a compartir en LinkedIn y otros canales, y la mayoría de esos
clics llegan desde el celular. Por eso la gravedad pesa más lo que pasa en un teléfono.

**Formato de los números.** Usan punto decimal, como en la revisión #2. Los píxeles van sin
separador de miles (6332 px). Los textos de la interfaz se citan tal como aparecen
(«$1,125.89»).

---

## Cómo leer este documento

- **V, verificado:** medido en esta revisión, en Chromium a tamaño de celular, tablet y
  escritorio, o con `curl` contra producción. El método está en el apéndice A.
- **E, estimado:** criterio, o un comportamiento conocido de una plataforma que no pude
  medir acá; por ejemplo, el zoom de iOS Safari, porque no había un iPhone real.
- **Gravedad:**
  - **Alta:** frena el uso o la difusión desde el celular, o falla en accesibilidad básica.
  - **Media:** perjudica la claridad o cómo se percibe la herramienta.
  - **Baja:** pulido.
- **Cada hallazgo** dice dónde ocurre, qué se ve (con la medida) y una corrección concreta:
  CSS, markup o texto propuestos, sin aplicar.
- **Esfuerzo (E):**
  - **chico:** solo `styles.css` o `index.html`;
  - **medio:** toca `app.js` y sus tests;
  - **grande:** cambia la estructura o se reparte en varios PRs.

**Viewports usados:**
- iPhone: 390×844;
- Android: 360×800;
- tablet: 768×1024;
- escritorio: 1280×900, y anchos de 1024 a 1920 para la tabla de patas.

En todos se miró modo claro y oscuro. La estrategia por defecto es la que ve quien llega:
oro, futuro a 4000, un call comprado con strike 4200 a 30 días.

---

## Resumen ejecutivo

**La herramienta se ve seria y honesta, pero quien llegue desde LinkedIn en el celular no la
va a ver así.**

Lo que ya está bien (§2): cada dato de mercado dice su fuente, los valores precargados dicen
«not market data» y el disclaimer es claro. El texto cumple contraste AA en modo claro y en
oscuro, y los rechazos de un campo tienen `role="alert"`.

El problema es el recorrido desde el celular:
1. **El link compartido no muestra vista previa.** No hay imagen ni etiquetas Open Graph, y
   el favicon da 404 (D1).
2. **La primera pantalla es un formulario.** El primer resultado aparece a 4 pantallas de
   scroll y el gráfico a 5.1 (D3).
3. **iOS hace zoom al tocar cualquier campo** (D4).
4. **55 de los 59 controles** miden menos de 44 px (D5).
5. **La tabla de patas se corta.** En el celular se ve el 40%, y en escritorio, a cualquier
   ancho, deja fuera los botones IV y borrar (D6).
6. **Los botones de datos de mercado no dan ninguna señal en pantalla.** El aviso aparece
   948 px más abajo (D21).

| Gravedad | Cant. | Hallazgos |
|---|---|---|
| **Alta** | 7 | D1 sin vista previa al compartir · D3 resultados a 4 pantallas · D4 zoom de iOS · D5 blancos táctiles · D6 tabla de patas cortada · D21 carga invisible · D25 controles sin nombre accesible |
| **Media** | 17 | D2, D7, D8, D9, D10, D12, D13, D14, D15, D16, D19, D20, D22, D26, D27, D28, D29 |
| **Baja** | 6 | D11, D17, D18, D23, D24, D30 |

**Qué hacer primero, en tres lotes.**

1. **Antes de compartir el link,** cuatro PRs chicos o medios:
   - **`<head>`:** Open Graph, imagen e íconos (D1), y compartir con la hoja nativa del
     celular (D2).
   - **CSS para el celular:**
     - el orden de las tarjetas (D3);
     - letra de 16 px en los campos (D4);
     - blancos de 44 px (D5);
     - la tipografía del sistema (D9);
     - los bordes con contraste (D12).
   - **La tabla de patas:** tarjetas en el celular, columnas que entran en escritorio y
     etiquetas accesibles (D6, D25).
   - **Los estados:** el aviso junto al botón y el botón deshabilitado mientras carga, y un
     estado vacío que no muestre «$0.00» en verde (D21, D22).
2. **Después,** lo que mejora la lectura de los resultados:
   - el gráfico (D7, D13, D19) y la grilla de escenarios (D14);
   - el botón «Clear» (D15) y el panel Contract (D16);
   - el formato de los números (D20).
3. **Por último,** las dos preguntas agregadas, juntas: las explicaciones detrás de «?» (D27 y
   §3) y la versión en español (§4). Comparten el mismo trabajo: sacar los textos a una tabla.

**Simulado en el navegador (V, apéndice D).** Apliqué el orden propuesto para el celular y
las notas plegadas sin tocar el repo:
- el primer resultado sube de 3343 px a 548 px, dentro de la primera pantalla;
- el gráfico sube de 4271 px a 1494 px;
- la página baja de 6332 px a 5516 px.

---

## 1. Hallazgos

### Compartir en redes

### D1 — El link compartido no tiene vista previa: sin Open Graph, sin imagen, sin favicon · **ALTA** · *verificado*

**Dónde:** el `<head>` de `index.html`, y la raíz del sitio en producción.

**Qué se ve (V, `curl` contra producción el 28/10):**
- La página tiene **0** etiquetas `og:`, `twitter:`, `rel="icon"`, `canonical` o
  `hreflang`. El `<head>` solo tiene charset, viewport, CSP, la verificación de AdSense,
  `description` y `<title>`.
- `/favicon.ico`, `/apple-touch-icon.png`, `/robots.txt` y `/sitemap.xml` responden 404.
- **Efecto (E):** en LinkedIn el post muestra el link sin imagen, así que no se distingue de
  cualquier URL. Es el canal principal previsto. En la pestaña del navegador y al agregar la
  página a la pantalla de inicio de un iPhone, aparece un ícono genérico.
- **La descripción actual promete «live risk-free rates».** El disclaimer dice que los datos
  son «historical or reference values, not live quotes», y la tasa es la curva **diaria** del
  Tesoro. La tarjeta no debe prometer más que la página.

**Corrección (esfuerzo chico):**

1. **Agregar al `<head>`:**
   ```html
   <link rel="canonical" href="https://commodity-options-calculator.vercel.app/">
   <meta property="og:type" content="website">
   <meta property="og:site_name" content="Commodity Options Calculator">
   <meta property="og:url" content="https://commodity-options-calculator.vercel.app/">
   <meta property="og:title" content="Commodity Options Calculator: price, greeks and payoff for options on futures">
   <meta property="og:description" content="Free Black-76 and Barone-Adesi-Whaley pricing, greeks, multi-leg payoff charts and scenario grids for 14 futures markets: metals, energy, grains, softs and cattle. Futures prices and the daily US Treasury curve filled in for you.">
   <meta property="og:image" content="https://commodity-options-calculator.vercel.app/og.png">
   <meta property="og:image:width" content="1200">
   <meta property="og:image:height" content="627">
   <meta property="og:image:alt" content="Payoff chart and greeks of an options strategy on gold futures">
   <meta property="og:locale" content="en_US">
   <meta name="twitter:card" content="summary_large_image">
   <link rel="icon" href="/favicon.svg" type="image/svg+xml">
   <link rel="icon" href="/favicon.ico" sizes="32x32">
   <link rel="apple-touch-icon" href="/apple-touch-icon.png">
   ```
   - Cambiar «live risk-free rates» por «daily US Treasury rates» en `description`.
   - Las URL de `og:image` y `og:url` tienen que ser absolutas: LinkedIn no resuelve
     relativas (E).
2. **`og.png`:** 1200×627, PNG o JPG, menos de 5 MB. LinkedIn no acepta SVG como `og:image`
   (E).
   - **Contenido:** una captura real del gráfico de una estrategia conocida, por ejemplo un
     bull call spread en oro, con el nombre de la herramienta.
   - **Tamaño del texto:** al menos 60 px de alto en la imagen, para que se lea en el feed
     del celular, donde la tarjeta mide unos 350 px de ancho.
   - **Sin datos que parezcan cotizaciones vigentes.**
3. **Íconos:** `favicon.svg`, un `favicon.ico` de 32 px y un `apple-touch-icon.png` de
   180×180. Por ejemplo, una curva de payoff simple sobre el azul `--accent`.
4. **Al publicar:** pasar la URL por el LinkedIn Post Inspector
   (`linkedin.com/post-inspector`), que vuelve a leer la página y renueva la vista previa
   guardada.

La CSP no necesita cambios: los íconos y la imagen son del mismo origen. `test/deploy.test.js`
revisa que `.vercelignore` no deje afuera nada que cargue `index.html`. Conviene sumar
`og.png` a lo que ese test verifica, porque ninguna etiqueta de la página lo «carga».

### D2 — «Copy shareable link» no usa la hoja de compartir del celular, y su confirmación aparece 3400 px más arriba · **MEDIA** · *verificado*

**Dónde:**
- la tarjeta Save & share;
- el manejador de `#share` (`app.js:2872`), que llama a `setStatus()`.

**Qué se ve:**
- **El botón solo copia al portapapeles.** En el celular, lo natural para compartir un
  escenario es la hoja nativa, con LinkedIn, WhatsApp y Mail a un toque.
- **La confirmación se escribe en `#dataStatus`, que está en la tarjeta Market data.** En el
  iPhone, el botón está en y = 5936 y la línea de estado en y = 2539, 3397 px más arriba.
  Quien toca el botón no ve ninguna respuesta.

**Corrección (esfuerzo medio):**
```js
$('share').addEventListener('click', async () => {
  const url = shareLink();
  location.hash = url.split('#')[1];
  if (navigator.share) {
    try { await navigator.share({ title: document.title, url }); return; } catch (e) { /* cancelled: fall through */ }
  }
  ...clipboard as today, with the message shown next to the button
});
```
- **Etiqueta:** «Share link» donde exista `navigator.share`.
- **Confirmación:** en un `<p class="note" role="status">` propio, debajo de los botones de la
  misma tarjeta. Es el mismo criterio que D21: un aviso aparece junto a lo que lo causó.

### Celular y layout

### D3 — En el celular, el primer resultado aparece después de 4 pantallas de formulario · **ALTA** · *verificado*

**Dónde:** `styles.css`, en la regla `@media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }`,
y el orden de las tarjetas en `index.html`.

**Qué se ve.** Debajo de 900 px las dos columnas se apilan: primero todas las entradas y
después todos los resultados. Posición de cada tarjeta en el iPhone de 390×844:

| Tarjeta | Empieza en | Pantallas | Alto |
|---|---|---|---|
| Contract | 171 px | 0.2 | 1349 px |
| Market data | 1537 px | 1.8 | 1150 px |
| Strategy | 2723 px | 3.2 | 550 px |
| Results (KPIs) | 3343 px | 4.0 | 768 px |
| Payoff (el gráfico) | 4271 px | 5.1 | 744 px |
| Scenario grid | 4839 px | 5.7 | 1026 px |
| Save & share | 5883 px | 7.0 | 171 px |
| Disclaimer | 6072 px | 7.2 | 149 px |

La página mide 6332 px, 7.5 pantallas. En Android de 360 px mide 6695 px.

**La primera pantalla del celular** muestra:
- el título en dos líneas;
- el subtítulo;
- Commodity;
- Model con su nota;
- Exercise con su nota.

No hay ningún número. Quien llega desde un post ve un formulario de opciones y no lo que la
herramienta calcula. En escritorio, a 1280×900, los KPIs están a la vista (567 px), pero el
gráfico empieza en 1197 px, debajo del pliegue.

**Corrección (esfuerzo chico):** en el celular, poner primero lo que la página produce:
1. Strategy;
2. Results;
3. Payoff;
4. Contract;
5. Market data;
6. Scenario grid;
7. Save & share;
8. el disclaimer.

Las dos columnas son dos `<div>`, así que alcanza con disolverlas debajo de 900 px:
```css
@media (max-width: 900px) {
  .grid > div { display: contents; }          /* the cards become items of .grid */
  .grid .card, .grid .disclaimer { min-width: 0; }
  #legs { order: 1; } #cardResults { order: 2; } #cardPayoff { order: 3; }
  #cardContract { order: 4; } #cardMarket { order: 5; } #cardScenarios { order: 6; }
  #cardSave { order: 7; } .disclaimer { order: 8; }
}
```
- **Ids nuevos:** las tarjetas necesitan los ids `cardResults`, `cardContract` y demás. Hoy
  solo `#legs` tiene uno.
- **`min-width: 0` es imprescindible.** La regla `.grid > * { min-width: 0 }` deja de alcanzar
  a las tarjetas cuando dejan de ser hijas directas. Sin ella, la tabla de patas ensancha
  toda la página a 858 px. Lo medí: es el caso que describe el comentario de `styles.css`.
- **Resultado (V, simulado):**
  - los KPIs pasan de 3343 px a 809 px (1.0 pantalla);
  - el gráfico, de 4271 px a 1755 px;
  - sumado a D27 (notas plegadas): 548 px y 1494 px.
- **Línea de contexto en Strategy:** «Gold (COMEX GC) · futures 4,000.0 · 30 days ·
  vol 15% — Edit ↓», con un enlace a `#cardContract`. Quien ve el resultado primero sabe
  sobre qué contrato está calculado y dónde cambiarlo.
- **Limitación (E):** `order` cambia lo que se ve, no el orden de tabulación ni el de lectura
  de un lector de pantalla. Las tarjetas son independientes y el orden del DOM sigue siendo
  coherente, así que es aceptable. La solución definitiva es reordenar el DOM y ubicar las
  columnas con `grid-column` en escritorio.

### D4 — iOS hace zoom al tocar cualquiera de los 40 campos · **ALTA** · *letra verificada, zoom estimado*

**Dónde:** `styles.css`:
- `input, select, button, textarea { font-size: .92rem }`, que da 14.72 px;
- `#legs input, #legs select { font-size: .82rem }`, que da 13.12 px.

**Qué se ve (V):** de los campos de la página, 30 tienen letra de 14.72 px y 10 de 13.12 px;
ninguno llega a 16 px.

**Por qué importa (E):** iOS Safari agranda la página al enfocar un campo con letra menor a
16 px y no la devuelve a su tamaño al salir. Cada vez que alguien escribe un strike o un
precio en el iPhone, la página queda ampliada y desplazada, y hay que pellizcar para volver.

**Corrección (esfuerzo chico):**
```css
@media (max-width: 900px) {
  input, select, textarea { font-size: 16px; }
}
```
No usar `maximum-scale=1` ni `user-scalable=no` en el viewport. Evitarían el zoom, pero
también impiden ampliar a quien lo necesita, y eso falla WCAG 1.4.4.

Simulado (V): con 16 px la página crece 24 px en total.

### D5 — 55 de los 59 controles miden menos de 44 px; 6 miden menos de 24 px · **ALTA** · *verificado*

**Dónde:** todos los controles. La lista completa está en el apéndice C.

**Qué se ve, en el iPhone:**
- **Campos del panel:** selects de 34 px de alto e inputs de 37 px.
- **Botones:** de 35 a 37 px.
- **Tabla de patas:** selects de 27 px e inputs de 29 px.
- **Debajo de 24×24,** el mínimo de WCAG 2.2 (2.5.8, nivel AA):
  - el checkbox de cada pata, de 13×13, que no tiene etiqueta;
  - `#skewOn` y `#showLegs`, de 13×13, aunque se pueden tocar también por su etiqueta;
  - el botón borrar pata, de 21×24, pegado al botón `IV`, así que un toque errado borra la
    pata;
  - los enlaces «Get a free key» (78×14) y «Privacy Policy» (80×15).
- **Referencia:** Apple recomienda 44 pt y Material 48 dp.

**Corrección (esfuerzo chico):**
```css
@media (pointer: coarse) {
  input, select, button { min-height: 44px; }
  #legs input, #legs select { min-height: 40px; }
  input[type=checkbox] { width: 22px; height: 22px; }
  label.inline, .chart-controls label { min-height: 44px; display: flex; align-items: center; }
  button.icon { min-width: 44px; min-height: 44px; }
  #legs td:last-child { white-space: nowrap; }
  #legs button.icon + button.icon { margin-left: 8px; }   /* IV and remove apart */
  footer a, .note a { display: inline-block; padding: 12px 4px; }
}
```
**Pegado a esto, el checkbox de cada pata** necesita etiqueta (D25), y con el diseño de
tarjetas de D6 la etiqueta visible amplía el blanco.

### D6 — La tabla de patas no entra: en el celular se ve el 40%, y en escritorio deja afuera IV y borrar · **ALTA** · *verificado*

**Dónde:** `#legs .table-scroll`, la tabla de 13 columnas que arma `legRowHtml()`.

**Qué se ve:**
- **La tabla necesita 808 px.**
- **En el iPhone muestra 324 px:** el checkbox, Side, Type, Qty y Strike.
  - **Quedan fuera, sin ningún indicio:** Days, Vol %, Under, Entry, Theo., Delta, Cost $
    y los botones IV y borrar. iOS no muestra la barra de desplazamiento hasta que se
    desliza.
  - **Theo. y Cost $,** el valor de la pata, son justo lo que alguien quiere ver al armar una
    estrategia.
- **En escritorio:**

  | Ancho de ventana | Visible | ¿IV y borrar a la vista? |
  |---|---|---|
  | 1024 | 560 de 808 px | no |
  | 1280 | 748 de 808 px | no |
  | 1440 | 748 de 808 px | no |
  | 1920 | 748 de 808 px | no |

  - **Por qué 748 a partir de 1280:** `.wrap` limita la página a 1180 px y la columna
    izquierda toma 380 px.
  - **«Cost $» aparece cortado.**
  - **En macOS,** que esconde las barras de desplazamiento, no hay forma de saber que hay
    más columnas.

**Corrección (esfuerzo medio, porque toca `legRowHtml()` y su test de escape):**
1. **Escritorio:** dar lugar a la columna derecha.
   ```css
   .wrap { max-width: 1280px; }
   .grid { grid-template-columns: minmax(300px, 340px) 1fr; }
   ```
   - **A 1280 px de ventana** la tabla dispone de unos 856 px y entra entera.
   - **A 1024 px** sigue necesitando scroll. Para esos anchos, agregar una sombra en el borde
     derecho que indique que hay más:
     `background: linear-gradient(to left, var(--card), transparent) right / 24px 100% no-repeat local`.
2. **Celular (menos de 600 px):** cada pata como una tarjeta con etiquetas visibles, en una
   grilla de dos columnas:
   ```css
   @media (max-width: 600px) {
     #legs thead { display: none; }
     #legs tbody tr { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 10px; padding: 12px 0; border-bottom: 1px solid var(--line); }
     #legs tbody td { display: flex; flex-direction: column; gap: 2px; border: 0; padding: 0; }
     #legs tbody td::before { content: attr(data-label); font-size: .75rem; color: var(--muted); }
     #legs tbody td.num { text-align: left; }
   }
   ```
   - **`legRowHtml()` agrega `data-label="Strike"` y demás a cada `<td>`.** Son textos fijos,
     así que no comprometen el escape.
   - **Una pata ocupa** unas 6 filas de dos campos. Theo., Delta y Cost $ se ven sin
     desplazar nada.

### D7 — El gráfico en el celular: la leyenda se come el área y las etiquetas de strike se enciman · **MEDIA** · *verificado*

**Dónde:**
- `.chart-box { height: 420px }`;
- la leyenda de Chart.js en `chartConfig()`;
- el plugin que dibuja las marcas verticales, `ctx.fillText(m.label, x, chartArea.top + 10)`
  con `10px sans-serif` (`app.js:1816`).

**Qué se ve, con un iron condor en el iPhone (3500 / 3750 / 4250 / 4500):**
- **La leyenda ocupa tres filas.** Son dos series netas y cuatro patas; el área del gráfico
  queda en unos 300 px de alto.
- **Las cinco etiquetas de arriba quedan a unos 14 px entre sí:** «K 3,500», «K 3,750»,
  «Now», «K 4,250» y «K 4,500». Cada una mide más que eso, así que se leen como una mancha
  gris.
- **Las marcas del eje Y dicen «150,000» y «-150,000»:** siete caracteres que le quitan ancho
  al área del gráfico.

**Corrección (esfuerzo medio; `chartConfig()` es pura y `test/chart.test.js` la puede
cubrir):**
- **Leyenda debajo del gráfico:** con ancho menor a 600 px, `position: 'bottom'`, y las
  entradas de cada pata fuera de la leyenda
  (`labels.filter: item => item.datasetIndex < 2`). El toggle «Legs» ya dice si se dibujan.
- **Etiquetas de strike:**
  - alternar dos alturas, `chartArea.top + 10 + (i % 2) * 12`;
  - omitir una etiqueta cuando `ctx.measureText()` dice que pisa a la anterior;
  - usar 11 px y la tipografía de la página.
- **Ticks compactos en pantallas angostas:** `ticks.callback: v => '$' + (v / 1000) + 'k'`.
- **Alto:** `.chart-box { height: clamp(300px, 52vh, 420px); }`. En el iPhone sigue dando
  420 px, pero en un teléfono apaisado (unos 390 px de alto de ventana) el gráfico entra
  entero en pantalla.

### D8 — Textos cortados: «Front month (conti», «-- pick a str», «Choose Fil» · **MEDIA** · *verificado*

**Dónde (iPhone):**
- **`#contractMonth`, 159 px:** comparte la fila con «Load» al 50% y muestra «Front month
  (conti».
- **`#strategy`, 99 px:** comparte la fila con «+ Add leg» y «Clear», y muestra «-- pick a
  str».
  - **Es la puerta de entrada a las plantillas** (straddle, spreads, condor), lo más útil para
    quien llega por primera vez, y no se entiende qué es.
- **«Import JSON»:** es el `<input type="file">` nativo, gris, cortado en «Choose Fil», con su
  etiqueta arriba y desalineado de los otros dos botones.
- **El título:** a 25.6 px, «Commodity Options Calculator» ocupa dos líneas.

**Corrección (esfuerzo chico):**
- **Strategy:** el select en su propia fila, a todo el ancho, con una etiqueta visible
  «Strategy template». La opción vacía dice «Choose a strategy…» en lugar de «-- pick a
  strategy --».
- **Contract month:** `#contractMonth { flex: 2 } #loadMonths { flex: 0 0 auto; }` y la
  opción «Front month» a secas; la nota de abajo ya explica «continuous».
- **Import:** esconder el input nativo y darle a su `<label>` el aspecto de botón:
  ```css
  #importJson { position: absolute; width: 1px; height: 1px; opacity: 0; }
  label.button-like { /* the .ghost button look */ }
  label.button-like:focus-within { outline: 2px solid var(--accent); }
  ```
- **El título:** `header h1 { font-size: clamp(1.3rem, 5.2vw, 1.6rem); }`.

### Jerarquía y tipografía

### D9 — Cada plataforma ve otra letra; en el iPhone es Verdana · **MEDIA** · *estimado*

**Dónde:** `body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }`.

**Qué pasa (E, según las fuentes que trae cada sistema):**
- **Windows:** Segoe UI.
- **macOS:** Tahoma, que viene con el sistema.
- **iPhone:** Verdana, porque iOS no trae Segoe UI, Tahoma ni Geneva.
- **Android:** la genérica, Roboto.

**Por qué importa:** Verdana se diseñó ancha para pantallas de baja resolución. En el celular,
que es donde más va a verse, agrega cortes de línea y textos truncados (D8). Además, la página
se ve distinta en cada dispositivo.

**Limitación de la medición:** las capturas de esta revisión son de Chromium en Linux, que no
tiene ninguna de esas fuentes y usa la de reserva. No muestran la letra que ve un usuario
real.

**Corrección (esfuerzo chico):** la tipografía del sistema, sin descargas y sin cambios en la
CSP.
```css
body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
.kpi strong, #greeks td, #legs td.num, table.scenario td { font-variant-numeric: tabular-nums; }
```
Así cada sistema usa su letra de interfaz: SF Pro en Apple, Segoe UI en Windows y Roboto en
Android. Es la que usan las plataformas de trading de cada sistema, y se percibe como
herramienta profesional.

### D10 — Jerarquía plana: los números clave miden casi lo mismo que sus etiquetas, y hay mucho texto de 11.5 a 12.5 px · **MEDIA** · *verificado*

**Dónde:** `.card h2`, `.card h3`, `.kpi`, `.note`, `th` y `#greeks`.

**Qué se ve (tamaños efectivos, V):**
- **Títulos:**
  - las tarjetas (`h2`) miden 16 px;
  - las etiquetas de campo, 13.6 px en negrita;
  - las secciones (`h3`), 14 px en mayúsculas grises con espaciado.
  - En Market data, «VOLATILITY SETTINGS», «SKEW» y «CARRY, CHECKED BY HAND» pesan tanto
    como el título de la tarjeta.
- **KPIs:**
  - el valor (`.kpi strong`) mide **16.8 px**, el mismo tamaño que el texto común;
  - su etiqueta, 11.84 px.
  - Net debit, Max loss y Breakeven son lo primero que alguien quiere leer, y no se
    destacan.
- **Texto chico:**
  - en 12.48 px están las notas, las fuentes y el disclaimer;
  - en 11.52 px, los encabezados de tabla y el subtexto de los KPIs.
- **Siete KPIs en dos columnas:** «Premium interest» queda solo en la última fila.
- **La tabla de griegas en el celular:** la columna «Meaning» corta cada fila en dos líneas,
  y «PER UNIT» y «POSITION ($)» también se parten.

**Corrección (esfuerzo chico):**
```css
.card h2 { font-size: 1.15rem; }
.card h3 { font-size: .78rem; letter-spacing: .06em; }   /* a section label, clearly under h2 */
.kpi strong { font-size: 1.35rem; }
.kpi span { font-size: .72rem; }
@media (max-width: 600px) {
  .note, .small, .src, .disclaimer { font-size: .84rem; }   /* 13.4px */
  .greeks td:last-child { display: none; }                  /* Meaning: moves into "?" (§3) */
}
```
- **Premium interest:** como línea `small` dentro de Net debit, porque es el costo de
  financiar ese débito. Quedan seis KPIs, tres filas completas.
- **Orden de los KPIs:** el riesgo antes que el premio. Net debit, Max loss, Max profit,
  Breakeven, Prob. of profit, Horizon.

### D11 — Signos ASCII donde corresponde tipografía: «-$1,129.60», «+/-40%», «x» · **BAJA** · *verificado*

**Dónde:** los formateadores de dinero de `app.js`, la etiqueta del rango del gráfico, la nota
de las griegas y el botón borrar.

**Qué se ve:**
- **«-$1,129.60» usa el guion (U+002D)** y no el signo menos (U+2212). En números tabulares
  el guion es más corto y liviano, y una pérdida se lee peor.
- **«+/-40%»** en lugar de «±40%».
- **«x»** en lugar de «×», en «per-unit greek x quantity x $100.00 multiplier» y en el botón
  de borrar pata.
- **Breakevens vacío se muestra «-»,** que parece el signo de un número. Mejor «—» o «None».
- **«Fetching market data...»** con tres puntos en lugar de «…».

**Corrección (esfuerzo medio, por los tests):** aplicar el signo menos solo al mostrar, no en
lo que se exporta ni en los campos. Los tests que fijan textos (unos 26, §4) se actualizan en
el mismo PR.

### Color y contraste

### D12 — Los bordes de campos y botones secundarios tienen contraste de 1.29:1; WCAG pide 3:1 · **MEDIA** · *verificado*

**Dónde:** `--line`, que se usa para el borde de `input`, `select` y `button.ghost`.

**Qué se ve (V):**
- **Contraste de `--line`:**

  | Modo | Color | Contra | Contraste |
  |---|---|---|---|
  | claro | `#dfe3e8` | la tarjeta blanca | 1.29:1 |
  | oscuro | `#2c323c` | la tarjeta | 1.27:1 |
  | oscuro | `#2c323c` | el fondo del campo | 1.39:1 |

- **Lo que pide WCAG 1.4.11:** 3:1 para el borde que permite identificar un control.
- **A quién afecta:** los 13 botones ghost se distinguen solo por ese borde y su texto azul,
  y los campos vacíos, como los de «Carry, checked by hand», casi no se ven.
- **El foco:** no tiene estilo propio, así que se ve el del navegador. En Chromium sobre
  Linux es naranja y en macOS azul.

**Corrección (esfuerzo chico):** separar el borde de los controles del de las líneas
divisorias.
```css
:root { --field-border: #868f9c; }   /* 3.27:1 on #fff, 3.05:1 on --bg */
@media (prefers-color-scheme: dark) { :root { --field-border: #626b7a; } }   /* 3.33:1 on --field, 3.03:1 on --card */
input, select, textarea, button.ghost { border-color: var(--field-border); }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
```
`--line` sigue igual para las tablas, las tarjetas y los KPIs, donde el borde es decorativo.

### D13 — En el gráfico, las etiquetas de strike tienen 2.54:1 y las curvas de cada pata 1.84:1 · **MEDIA** · *verificado*

**Dónde:** `--chart-strike` y `--chart-leg` en `styles.css`, en los dos bloques.

**Qué se ve (V):**

| Elemento | Claro | Oscuro | Mínimo |
|---|---|---|---|
| Etiquetas de strike, texto de 10 px | `#9ca3af`: **2.54:1** | `#8f8f8f`: 5.05:1 | 4.5:1 (texto) |
| Curvas de cada pata | `rgba(0,0,0,.25)`: **1.84:1** | `rgba(255,255,255,.30)`: **2.71:1** | 3:1 (gráfico) |
| Curva «Today» | `#d97706`: 3.19:1 | `#ffb45c`: 9.28:1 | 3:1 |
| Curva neta | `#0b6ea8`: 5.51:1 | `#7fd1ff`: 9.69:1 | 3:1 |

**Corrección (esfuerzo chico):**
- **Separar el color de la etiqueta del de la línea:** `--chart-strike-label: #6b7280`, con
  4.83:1. La línea punteada puede seguir clara.
- **Curvas de cada pata:** `--chart-leg: rgba(0,0,0,.45)` en claro (3.36:1) y
  `rgba(255,255,255,.40)` en oscuro (3.75:1).
- **Una variable nueva va en los dos bloques.** Si falta en el oscuro, `test/chart.test.js`
  falla.

### D14 — En la grilla de escenarios, las pérdidas no se colorean · **MEDIA** · *verificado*

**Dónde:** `renderScenarios()`, `app.js:1960`:
```js
const a = (Math.abs(v) / s.worst * 0.5).toFixed(3);
```
`s.worst` es el mayor valor absoluto de toda la grilla (`app.js:1102`).

**Qué se ve, con la estrategia por defecto:**
- **Ganancias:** llegan a $58,874 con +20%.
- **Pérdidas:** como mucho −$1,130.
- **Efecto:** las celdas con pérdida reciben una opacidad de **0.0096**, invisible. La grilla
  muestra verde y blanco, y una pérdida se lee como «nada».
- **En el celular** la tabla muestra 324 de 478 px, y al desplazarla se pierde la columna de
  precios.

**Corrección (esfuerzo medio):**
- **Normalizar ganancias y pérdidas por separado, con un piso visible:**
  ```js
  const shade = v => {
    if (!isFinite(v) || v === 0) return '';
    const ref = v > 0 ? s.bestGain : s.worstLoss;     // both as positive numbers
    const a = (0.12 + 0.38 * Math.sqrt(Math.abs(v) / ref)).toFixed(3);
    return ' style="background:rgba(' + (v > 0 ? '32,140,96' : '190,60,48') + ',' + a + ')"';
  };
  ```
- **Primera columna fija:** `table.scenario th.rowhead { position: sticky; left: 0; background: var(--card); }`.
- **Contraste del texto:** sobre el sombreado más fuerte (50%) es de 7.77:1 en verde y
  6.77:1 en rojo en modo claro, y de 6.86:1 y 8.15:1 en oscuro, así que el piso no lo
  afecta.
- **El color no es la única pista:** cada número lleva su signo, y eso cumple WCAG 1.4.1.

### Formularios

### D15 — «Clear» borra toda la estrategia sin aviso, y la nota de abajo dice que «Clear» hace otra cosa · **MEDIA** · *verificado*

**Dónde:**
- la tarjeta Strategy;
- el manejador de `#clearLegs` (`app.js:2821`);
- la segunda nota de la tarjeta.

**Qué se ve:**
- **«+ Add leg» y «Clear» están juntos,** con el mismo estilo y el mismo tamaño.
- **«Clear» vacía `state.legs`** sin confirmar y sin deshacer. `persist()` guarda enseguida,
  así que la estrategia se pierde también del almacenamiento local.
- **La nota de «Fill leg prices from the futures curve» dice:** «**Clear** puts every leg
  back on the contract in the left panel». Se refiere al botón «Clear leg prices». Pero el
  botón que se llama «Clear» es el que borra todas las patas. Quien siga la nota pierde su
  estrategia.
- **La primera nota menciona «the *Leg prices* button below»,** pero ese botón se llama «Fill
  leg prices from the futures curve».

**Corrección (esfuerzo medio):**
- **Renombrar «Clear» como «Remove all legs»,** con estilo de botón de texto en
  `--neg`, separado de «+ Add leg».
- **Ofrecer «Undo» unos 10 segundos** en la línea de aviso de la tarjeta, guardando el arreglo
  anterior. Es preferible a un `confirm()`, que en el celular corta el flujo.
- **Respetar las capas:** la acción de §9 devuelve las patas quitadas y el cableado de §10
  muestra el «Undo».
- **En las notas:** «**Clear leg prices** puts every leg back…» y «the **Fill leg prices**
  button below».

### D16 — El panel Contract presenta 13 campos con el mismo peso, cuando 4 deciden el resultado · **MEDIA** · *verificado*

**Dónde:** la tarjeta Contract, de 1349 px en el iPhone (1.6 pantallas), y en menor medida
Market data, de 1150 px.

**Qué se ve:**
- **Los 13 campos, en este orden y al mismo nivel:**
  1. Commodity
  2. Model
  3. Exercise
  4. Contract month + Load
  5. Futures price
  6. Days
  7. Volatility
  8. Rate
  9. Premium financing
  10. Your financing rate
  11. Convenience yield
  12. Units per contract
  13. Price quoted in
- **Siete notas** se intercalan entre ellos.
- **Lo que decide el resultado:** quien llega por primera vez cambia el mercado, el precio,
  los días y la volatilidad. Model, Exercise y Contract month están antes que el precio.
- **Lo demás:** el modelo, la financiación, la yield y el tamaño del contrato son ajustes
  finos, con valores por defecto correctos para cada mercado.

**Corrección (esfuerzo medio):**
- **Arriba, a la vista:** Commodity, Futures price, Days y Volatility.
- **Debajo, plegado:** `<details class="advanced"><summary>Model & contract settings</summary>`,
  con el resto.
  - **Resumen en el `summary`:** «Black-76 · American · rate 4.00% · financed at the
    risk-free rate · 100 troy oz». Así no se esconde qué supuestos se usan.
- **En Market data,** a la vista: Auto-fill, los cuatro botones, la línea de estado y las
  fuentes. Plegado bajo «Advanced»: Volatility settings, Skew, Carry checked by hand y
  Alpha Vantage.
- **Condición:** cuando un campo de adentro rechaza un número (`inputProblem()`), su
  `<details>` se abre. El aviso nunca puede quedar escondido.

### D17 — Botones sin jerarquía, el control de importar es el nativo y hay espaciado en `style=` sueltos · **BAJA** · *verificado*

**Dónde:** los botones de toda la página y seis atributos `style=` en `index.html`.

**Qué se ve:**
- **Un solo botón primario,** «Auto-fill from market data». Los otros 13 son ghost, con el
  mismo peso sin importar lo que hagan:
  - agregar: «+ Add leg»;
  - consultar: Price, Rate, Volatility y Yield;
  - sobrescribir: «Reset to commodity presets» y «Clear».
- **«Import JSON»** es el control nativo del navegador (D8).
- **El espaciado** se resuelve con `style="margin-top:8px"`, `12px`, `14px` y `margin:0`,
  repartidos en `#implyYield`, `<details>`, `#usePreset`, `.table-scroll`, `#greeks` y la
  etiqueta de importar.

**Corrección (esfuerzo chico):**
- **Tres niveles de botón:**
  - **primario:** Auto-fill en Market data, y «+ Add leg» en Strategy;
  - **`.ghost`:** las acciones secundarias;
  - **`.btn-text`:** las que borran o sobrescriben, «Remove all legs», «Reset to presets» y
    «Clear leg prices», en `--neg` solo las destructivas.
- **Clases para el espaciado** (`.mt-8`, `.mt-12`) en lugar de `style=`.
- **De paso (E), la CSP:** `style-src 'unsafe-inline'` hoy hace falta por esos atributos y
  por el sombreado de la grilla. Si el sombreado se aplica con `el.style.background` después
  de insertar la tabla (la CSP no bloquea el CSSOM), se puede sacar `'unsafe-inline'`.

### D18 — Placeholders que parecen valores, y campos deshabilitados que parecen vacíos · **BAJA** · *verificado*

**Dónde:** «Carry, checked by hand», los placeholders de la tabla de patas y los campos que se
deshabilitan (`opacity: .5`).

**Qué se ve:**
- **«Carry» muestra «F1», «F2» y «90»** como placeholders. «90» se lee como 90 días cargados,
  pero el campo está vacío.
- **En las patas, Vol, Under y Entry muestran el valor heredado como placeholder:** «15.0»,
  «4,000.00» y «11.26». Es útil, pero se confunde con un valor escrito.
- **Los campos deshabilitados, al 50% de opacidad, parecen campos vacíos:**
  - Convenience yield en Black-76;
  - los dos del skew apagado;
  - la tasa propia cuando no se eligió.

**Corrección (esfuerzo chico):**
- **Placeholders como ejemplo:** «e.g. 3950», «e.g. 90».
- **Estilo para los heredados:** `::placeholder { color: var(--muted); font-style: italic; }`.
- **Deshabilitados:** `input:disabled { background: var(--bg); border-style: dashed; }`, y el
  motivo en la etiqueta: «Convenience yield (not used in Black-76)».

### Resultados

### D19 — Con «Legs» activado, que es el valor por defecto, las patas fijan la escala y aplastan el P&L neto · **MEDIA** · *verificado*

**Dónde:** `state.chart.showLegs` vale `true` por defecto (`app.js:471`), y el eje Y de
`chartConfig()` se ajusta a todas las series.

**Qué se ve:**
- **Con un iron condor,** las curvas de cada pata llegan a ±150,000 dentro del rango ±40%. El
  P&L neto está entre −24,000 y +700.
- **Efecto:** la curva neta, que es la que importa, queda como una línea casi plana sobre el
  cero. La zona de ganancia, de +700, no se ve.
- **Con la estrategia por defecto,** de una sola pata, no pasa. Pasa en cuanto alguien elige
  una plantilla de varias patas, que es justamente lo que se quiere mostrar.

**Corrección (esfuerzo medio, testeable en `chartConfig()`):**
- **`showLegs: false` por defecto.** Un escenario guardado conserva su valor: `restore()` ya
  lo lee.
- **Con las patas visibles, el eje Y sigue a las curvas netas:** `min` y `max` salen de
  «At horizon» y «Today» con un 10% de margen, y las patas se recortan al área.

### D20 — Los números cambian de formato según el idioma del navegador, y quedan mezclados · **MEDIA** · *verificado*

**Dónde:** `fmt()` usa `toLocaleString(undefined, …)` en 2 lugares, y otros 20 usan
`toFixed()`.

**Qué se ve:** la misma página, con el navegador en `es-AR` y en `en-US` (V):

| Lugar | `es-AR` | `en-US` |
|---|---|---|
| KPIs | $1.125,89 · -$1.129,60 · 4.211,30 · **11.2%** | $1,125.89 · -$1,129.60 · 4,211.30 · 11.2% |
| Delta | 0,1325 · $13,25 | 0.1325 · $13.25 |
| Placeholders de la pata | 15,0 · 4.000,00 · 11,26 | 15.0 · 4,000.00 · 11.26 |
| Multiplicador | $100,00 per point | $100.00 per point |
| El campo de precio | 4000 | 4000 |

**Qué pasa con `es-AR`:**
- **La interfaz está en inglés,** pero la mitad de los números usa coma decimal y la otra
  mitad punto. En la misma tarjeta conviven «4.211,30» y «11.2%».
- **El riesgo de leer mal es real (E).** Un precio de cobre de 4.2105 USD/lb y uno de oro de
  4,211 se distinguen solo por el separador.

**Corrección (esfuerzo medio):**
- **Fijar el formato:** `toLocaleString('en-US', …)` en `fmt()`. Coincide con la interfaz, con
  lo que aceptan los campos y con las pantallas de CME e ICE.
- **De paso,** los tests dejan de depender del idioma de la máquina que los corre (E).
- **Para una versión en español,** ver §4.

### Estados de error, carga y vacío

### D21 — Al tocar un botón de datos de mercado no cambia nada en pantalla: el aviso aparece 948 px más abajo · **ALTA** · *verificado*

**Dónde:**
- `#autoFill`, `#fetchPrice`, `#fetchRate`, `#fetchVol` y `#fetchCurve`;
- `#dataStatus`, debajo de toda la tarjeta Market data;
- `runAction()` y `setStatus()` en `app.js`.

**Qué se ve, en el iPhone:**
- **Posiciones:** «Auto-fill» está en y = 1590 y la línea de estado en y = 2538, a 948 px.
  Eso es más que una pantalla, de 844 px.
- **Los campos que se llenan** (precio, tasa, volatilidad y yield) están en la tarjeta
  Contract, más arriba.
- **Al tocar el botón,** no cambia nada visible.
- **Mientras busca:**
  - el botón **no se deshabilita** (medido: `disabled: false`), así que se puede tocar varias
    veces;
  - la única señal es la clase `busy`, que baja la opacidad del aviso a 0.75, fuera de la
    vista.
- **Con el servicio caído** (simulado, 1.5 s por pedido), el resultado llegó a los
  **9.1 segundos**.
- **«Leg prices» e «IV»** también escriben en esa línea. En escritorio queda a 2150 px de la
  tabla de patas (y = 2408 contra 258). En el celular queda 330 px arriba, pero con el orden
  de D3 se alejaría. «Copy shareable link» lo hace a 3400 px (D2).

**Corrección (esfuerzo medio):**
1. **Mover el aviso junto a los botones.** `#dataStatus` va justo debajo de la fila
   Price/Rate/Volatility/Yield; las fuentes (`#sources`) siguen al final.
   - La estrategia tiene su propia línea de aviso debajo de la tabla. `#legProblem` ya existe:
     puede ser `#legStatus`.
2. **Mientras busca:** en `runAction()`, del cableado de §10:
   ```js
   button.disabled = true;
   button.setAttribute('aria-busy', 'true');
   button.textContent = 'Fetching…';
   ```
   y restaurar el botón al terminar. En el aviso, un indicador animado con
   `@media (prefers-reduced-motion: no-preference)`.
3. **Al terminar,** resaltar un instante los campos que cambiaron (`.flash`, 1 s) y decir en
   el aviso qué se llenó: «Filled: price 4,012.3 (GC Dec 26), rate 3.87%, vol 14.2%. Yield
   failed.».

### D22 — El estado vacío muestra «$0.00» en verde, «$0.00» en rojo y una probabilidad de 0.0% · **MEDIA** · *verificado*

**Dónde:** Results, Payoff y Scenario grid sin patas activas, por ejemplo después de
«Clear».

**Qué se ve:**
- **Results calcula como si hubiera una posición:**
  - «Max profit $0.00» en verde;
  - «Max loss $0.00» en rojo;
  - «Breakevens -»;
  - «Prob. of profit 0.0%»;
  - las griegas en 0.0000 y $0.00.
- **El gráfico** dibuja una línea plana con el eje Y de −1.0 a 1.0.
- **Solo la grilla** dice qué hacer: «Add a leg to see the scenario grid.».

**Corrección (esfuerzo medio):**
- **Results:** sin patas, en lugar de los KPIs, «No legs yet. Choose a strategy template or
  add a leg.», con un enlace que lleva el foco a `#strategy`.
- **Payoff:** no dibujar series y mostrar el mismo texto sobre el área del gráfico.
- **Colores:** verde y rojo solo cuando el valor es distinto de cero.

### D23 — Los mensajes de falla son técnicos y repetidos · **BAJA** · *verificado*

**Dónde:** los mensajes que `applyAll()` y cada `apply*` devuelven a la línea de estado.

**Qué se ve (V, con el servicio caído):**
> Left unchanged: risk-free rate (Treasury yield curve unavailable); futures price (Upstream
> market data unavailable); volatility (Upstream market data unavailable); convenience yield
> (Upstream market data unavailable).

- **Es una sola oración con cuatro cláusulas.**
- **«Upstream» es jerga de servidor** y aparece tres veces.
- **Con un solo botón:** «Futures price failed: Upstream market data unavailable. The current
  value is unchanged.».

**Corrección (esfuerzo medio):** agrupar por causa y decir qué puede hacer el usuario.
> Couldn't reach the futures data service: price, volatility and convenience yield are
> unchanged. The US Treasury curve didn't answer either: the rate is unchanged. You can type
> any of them in. **Retry**

Para un botón solo: «Couldn't fetch the gold futures price. Still using 4,000.0.». Los errores
conocidos de `api/market.js` se traducen a ese lenguaje en la página.

### D24 — Un campo rechazado no queda marcado, y el número escrito desaparece · **BAJA** · *verificado*

**Dónde:** `#spot`, `#vol` y `#size` con sus `*Problem`, y `#legProblem`.

**Qué se ve:**
- **El aviso es bueno:** está debajo del campo, en rojo, con `role="alert"`, y dice qué número
  se sigue usando.
- **Pero el campo no cambia de aspecto,** salvo el anillo de foco del navegador.
- **No tiene `aria-invalid`** ni `aria-describedby` que lo vincule con el aviso.
- **El campo vuelve a mostrar 4000,** así que lo que la persona escribió desaparece.
- **El texto es largo y técnico:** «A price must be above zero: these models are lognormal
  and cannot price a contract at or below zero. Still using 4000.».

**Corrección (esfuerzo chico):**
- **Mientras se muestre el aviso:** `aria-invalid="true"` y
  `aria-describedby="spotProblem"`, y `.invalid { border-color: var(--neg); }`.
- **El aviso se borra en la próxima acción,** como hoy; las marcas también.
- **Texto:** «Enter a price above zero. These lognormal models can't price a contract at or
  below zero. Still using 4,000.0.».

### Accesibilidad

### D25 — Ocho controles sin un nombre accesible, casi todos en la tabla de patas · **ALTA** · *verificado*

**Dónde:** la tabla de patas, armada por `legRowHtml()`, y `#strategy`.

**Qué se ve (V, axe-core 4.10.2, mismos resultados en claro y en oscuro):**
- **Crítico, `label`, 3:** los inputs Qty, Strike y Days de cada pata.
- **Crítico, `select-name`, 3:** `#strategy` y los selects Side y Type de cada pata.
- **Serio, `label-title-only`, 2:** el checkbox de incluir y Under. Su único nombre es el
  `title`, un tooltip que en el celular no existe.
- **Vol y Entry** pasan la regla solo porque su placeholder es un número. Un lector de
  pantalla anuncia «15.0, campo de texto», que no dice qué es.
- **Botón borrar:** su nombre es «x».
- **Celdas de encabezado vacías, 3:** la primera y la última columna de la tabla de patas, y
  la primera de las griegas.

**Corrección (esfuerzo medio, toca `legRowHtml()` y su test de escape):**
- **En cada campo de la pata, un `aria-label` fijo con el número de pata:**
  `aria-label="Strike, leg 2"`, `aria-label="Include leg 2"`.
- **Botones:** borrar con `aria-label="Remove leg 2"` y el texto visible «×»; IV con
  `aria-label="Implied volatility from entry, leg 2"`.
- **`#strategy`:** `<label for="strategy">Strategy template</label>`, visible (D8).
- **Encabezados vacíos:** `<th><span class="sr-only">Include</span></th>`, «Actions» y «Greek».
- **La clase `.sr-only`:**
  ```css
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
  ```
- **Con las tarjetas de D6,** cada campo tiene además su etiqueta visible.

### D26 — Sin `<main>` ni regiones; tablas que no se alcanzan con el teclado; un aviso que no se anuncia; un gráfico sin texto · **MEDIA** · *verificado*

**Dónde:** la estructura de `index.html`, la grilla de escenarios, `#dataStatus` y
`#payoffChart`.

**Qué se ve (V, axe-core y DOM):**
- **Moderado:**
  - **`landmark-one-main`:** no hay `<main>`;
  - **`region`:** 72 nodos quedan fuera de toda región. Un lector de pantalla no puede saltar
    a «Results» ni a «Payoff».
- **Serio, `scrollable-region-focusable`, 3:** las tres tablas de la grilla de escenarios
  desplazan horizontalmente y no se pueden enfocar con el teclado.
- **`#dataStatus`** no tiene `role` ni `aria-live`. El resultado de Auto-fill no se anuncia.
  Los avisos de los campos sí, con `role="alert"`.
- **El `<canvas>` del gráfico,** que es el resultado principal, no tiene nombre ni texto
  alternativo.

**Corrección (esfuerzo medio):**
- **`<main>`:** envuelve `.grid`. Cada tarjeta pasa a ser
  `<section aria-labelledby="h-results">` con su `h2` identificado.
- **Las tablas de escenarios:**
  `<div class="table-scroll" tabindex="0" role="region" aria-label="Scenario grid, volatility −5 points">`.
- **El aviso:** `#dataStatus` con `role="status" aria-live="polite"`, y lo mismo para el aviso
  de Save & share (D2).
- **El gráfico:** `<canvas role="img" aria-label="…">`, con una frase que el render actualiza.
  Por ejemplo: «Profit and loss at the 30-day horizon from 2,400 to 5,600: loss of $1,129.60
  below 4,200, breakeven 4,211.30, then rising $100 per point». Agregar «The scenario grid
  below has the same numbers as a table.».

### Explicaciones y ayuda contextual

### D27 — 18 notas, 596 palabras y 1284 px de explicaciones a la vista en el celular · **MEDIA** · *verificado*

**Dónde:** los párrafos `.note` de todas las tarjetas.

**Qué se ve (V):**
- **18 notas visibles,** 596 palabras.
- **En el iPhone ocupan 1284 px:** el 20% de la página y una pantalla y media.
- **Las cinco más largas:**

  | Nota | Palabras | Alto |
  |---|---|---|
  | Tabla de patas | 72 | 131 px |
  | «Fill leg prices» | 65 | 131 px |
  | Fuentes de Market data | 63 | 131 px |
  | Payoff | 55 | 113 px |
  | Premium financing | 55 | 94 px |

- **Una nota de 131 px** ocupa más alto que la fila de la pata que explica.
- **Lo que hay que mantener:** las notas son buenas y precisas, y la honestidad de la página
  depende de varias de ellas.
- **El problema:** la explicación de referencia se presenta con el mismo peso que el estado
  actual y que las advertencias.

**Corrección (esfuerzo medio):** dejar a la vista lo que describe el estado o advierte, y
poner la explicación de referencia detrás de un «?». La clasificación nota por nota, el
mecanismo y un ejemplo están en **§3**.

Simulado (V): plegar las 10 notas de referencia baja la página de 6440 px a 5516 px, con el
orden de D3 aplicado. Son 924 px, 1.1 pantallas.

### Percepción profesional

### D28 — La política de privacidad parece de otro sitio, no tiene vuelta y describe mal la herramienta · **MEDIA** · *verificado*

**Dónde:** `privacy.html`, enlazada desde el pie de la página.

**Qué se ve:**
- **Estilos propios** en un `<style>` interno: `sans-serif` y fondo `#f4f4f4`.
  - **No carga `styles.css`.**
  - **No tiene modo oscuro:** quien usa el modo oscuro pasa de una página oscura a una clara.
- **No tiene ningún enlace de vuelta a la calculadora** (medido: ningún enlace a `/` ni a
  `index.html`).
- **En el celular mide 3810 px.**
- **Dice que el sitio es una herramienta «for agricultural commodities».** La calculadora
  cubre 14 mercados, de los cuales 6 son metales y energía.

**Corrección (esfuerzo chico):**
- **Estilos:** que cargue `styles.css` y use `.wrap` y `.card`, con lo que hereda el modo
  oscuro.
- **Vuelta:** un encabezado con «← Back to the calculator».
- **Texto:** «…for options on commodity futures: metals, energy and agricultural markets».
- **La política sostiene el sitio** (CLAUDE.md, «Before switching on ads»). Este cambio toca
  solo la descripción. `test/privacy.test.js` fija las secciones 1 a 3 y conviene correrlo.

### D29 — No se sabe quién la hizo, con qué método ni de cuándo es · **MEDIA** · *estimado*

**Dónde:** el encabezado y el pie de página. El pie tiene un solo enlace, «Privacy Policy».

**Qué se ve:**
- **No hay autor ni contacto.** Tampoco versión o fecha de actualización, ni enlace al código
  (el repositorio es público).
- **Tampoco hay una página de método.** El rigor que tiene la herramienta no se ve, salvo una
  línea del disclaimer:
  - BAW medido contra un árbol binomial;
  - los decimales de cada tick;
  - la conversión de la curva del Tesoro;
  - la financiación de la prima.
- **Para un profesional de commodities (E),** que decide si confiar en un número, esas
  señales pesan tanto como el diseño. Para quien llega desde LinkedIn, el autor es además el
  vínculo con el post.

**Corrección (esfuerzo chico a medio):**
- **Un pie con:** «Built by [tu nombre] · LinkedIn · Methodology · Source code · Report an
  issue · Privacy · Updated Oct 2026».
- **`methodology.html`:** una página breve con los modelos, las fuentes de datos y las
  limitaciones conocidas. El texto ya existe en `README.md` y en la sección «Known modelling
  limitations»; es cuestión de redactarlo para el público.

### D30 — Ortografía británica en una herramienta de mercados de EE. UU., y nombres que no coinciden · **BAJA** · *verificado*

**Dónde:** las etiquetas y notas de `index.html` y `app.js`.

**Qué se ve:**
- **Ortografía británica:** «annualised» y «realised», en la etiqueta de Volatility y en la
  nota de la volatilidad. Los contratos son de CME, ICE US y NYMEX, donde se escribe
  «annualized» y «realized» (E).
- **Encabezados opacos en la tabla de patas:** «Under» quiere decir el precio del futuro del
  mes de esa pata, y «Theo.» el valor teórico.
- **Nombres que no coinciden:** ver D15, «Clear» y «Leg prices».

**Corrección (esfuerzo chico):**
- **Ortografía:** «annualized» y «realized».
- **Encabezados:** «Fut. price» en lugar de «Under», y «Theo. value» o «Model» en lugar de
  «Theo.», con un «?» de columna (§3).
- **Tests:** revisar los que fijan esos textos.

---

## 2. Lo que conviene mantener

Esto suma a la percepción profesional, y un rediseño no debería perderlo:
- **Honestidad de los datos.**
  - Cada dato muestra su fuente con un punto de color, y los precargados dicen «manual /
    preset (not market data)».
  - La volatilidad dice «Historical (realised) volatility, not implied».
  - El disclaimer dice qué es teórico. Todo eso se queda a la vista (§3).
- **Contraste del texto.** Cumple AA en los dos modos: 14.99:1 en claro y 13.17:1 en oscuro
  para el texto principal, y 4.83:1 y 6.34:1 para el gris de las notas. El modo oscuro está
  cuidado, gráfico incluido.
- **Rechazos.** Cada número rechazado tiene un aviso específico debajo de su campo, que dice
  qué valor sigue en uso, con `role="alert"`.
- **Números alineados.** Las tablas usan `tabular-nums`. Los precios se muestran con los
  decimales del tick de cada mercado (L8 de la revisión #2).
- **Seguridad.** La CSP estricta impide scripts en línea: axe-core solo pudo inyectarse
  saltándola en el navegador de prueba.
- **Grilla de escenarios.** Tres paneles de volatilidad por fechas es una vista que un
  operador reconoce. Solo le falta el color de las pérdidas (D14).

---

## 3. Evaluación: ¿explicaciones dentro de íconos «?»?

**Recomendación: sí, para la explicación de referencia; no, para lo que describe el estado
actual o advierte.**

**El mecanismo:**
- **No usar tooltips por hover.** No existen en pantallas táctiles, y `title` no es accesible.
- **Para notas cortas, junto a un campo:** un botón «?» que despliega la nota debajo del
  campo, dentro del flujo de la página.
- **Para notas largas, de una tarjeta entera:** un `<details>` «How this works» al pie de la
  tarjeta.

**Ahorro (V, simulado):** unos 924 px en el celular, el 14% de la página.

### 3.1 Qué va detrás de «?» y qué queda a la vista

| Tarjeta | Nota | Palabras | Alto (iPhone) | Propuesta |
|---|---|---|---|---|
| Contract | `#proxyNote` (ETF de referencia) | 8 | 22 px | **A la vista**: identifica la fuente |
| Contract | Model | 21 | 58 px | **«?»** junto a Model |
| Contract | `#styleNote` (BAW / europea) | 22 | 76 px | **«?»** junto a Exercise |
| Contract | `#monthNote` | 30 | 76 px | **«?»** junto a Contract month |
| Contract | `#financingNote` | 55 | 94 px | **Acortar + «?»**: a la vista, una línea de estado; la explicación, detrás |
| Contract | `#yieldNote` | 13 | 40 px | **A la vista** en Black-76 («Not used in Black-76…» dice por qué está deshabilitado); la definición, detrás de «?» |
| Contract | `#multInfo` (multiplicador) | 12 | 22 px | **A la vista**: es un número que se usa |
| Market data | Auto-fill | 31 | 76 px | **«?»** junto al botón |
| Market data | Fuentes de los datos | 63 | 131 px | **`<details>` «Where the data comes from»** |
| Market data | Volatilidad realizada | 18 | 40 px | **Acortar**: «Historical (realized) volatility, not implied.» a la vista (lo exige el tono de la página); lo de los rollos, detrás |
| Market data | `#skewNote` | 30 | 58 px | **«?»** junto a la casilla. `#skewWarning` sigue a la vista siempre |
| Market data | Carry | 30 | 60 px | **«?»** junto al título de la sección |
| Market data | Alpha Vantage | 27 | 58 px | Ya está dentro de un `<details>`: sin cambios |
| Strategy | Columnas de la tabla | 72 | 131 px | **`<details>` «How the legs table works»**, o un «?» por columna en el encabezado |
| Strategy | «Fill leg prices» | 65 | 131 px | **«?»** junto al botón |
| Payoff | Lectura del gráfico | 55 | 113 px | **`<details>` «How to read this chart»** |
| Scenario grid | Supuestos | 35 | 76 px | **«?»** junto al título |
| Save & share | Guardado automático | 9 | 22 px | **A la vista**: es corta y tranquiliza |

**Siempre a la vista, aunque no sean `.note`:**
- el disclaimer;
- la lista de fuentes (`#sources`);
- los avisos `.problem`;
- la línea de estado;
- «not market data».

CLAUDE.md lo pide: «Every market-data value shows its source… Keep that honesty».

### 3.2 El mecanismo, en concreto

Un botón junto a la etiqueta, que despliega la nota existente debajo del campo:
```html
<div class="label-row">
  <label for="model">Model</label>
  <button type="button" class="help-btn" aria-expanded="false" aria-controls="modelHelp"
          aria-label="About the model">?</button>
</div>
<select id="model">…</select>
<p class="note" id="modelHelp" hidden>Black-76 is the market standard for options on commodity
futures. Use Black-Scholes only when your underlying is the physical spot price.</p>
```
```css
.label-row { display: flex; align-items: center; justify-content: space-between; margin: 12px 0 4px; }
.label-row label { margin: 0; }
.help-btn {
  width: 24px; height: 24px; padding: 0; border-radius: 50%; position: relative;
  background: transparent; color: var(--accent); border: 1px solid var(--field-border);
  font-size: .8rem; line-height: 1;
}
.help-btn::after { content: ''; position: absolute; inset: -10px; }   /* 44px touch area */
.help-btn[aria-expanded="true"] { background: var(--accent); color: var(--accent-ink); }
```
```js
// §10 wiring: help toggles change only the page, never state.
document.addEventListener('click', e => {
  const b = e.target.closest('.help-btn');
  if (!b) return;
  const open = b.getAttribute('aria-expanded') !== 'true';
  b.setAttribute('aria-expanded', String(open));
  $(b.getAttribute('aria-controls')).hidden = !open;
});
```

**Por qué así y no de otra forma:**
- **El panel empuja el contenido hacia abajo, no lo tapa.** En un teléfono, un globo que
  flota sobre el formulario tapa el campo que explica.
- **`<button popovertarget>`, de la Popover API (E):** funciona sin JavaScript y en los
  navegadores actuales. Pero ubicarlo junto al campo requiere CSS anchor positioning, que no
  todos soportan todavía.
- **`aria-expanded` y `aria-controls`:** el lector de pantalla anuncia «About the model,
  botón, contraído». El botón se alcanza con Tab y se activa con Enter o Espacio, sin código
  extra.
- **Búsqueda en la página (E):** `hidden="until-found"` en lugar de `hidden` hace que Chrome y
  Edge encuentren el texto con Ctrl+F y abran la nota solos. En los demás navegadores se
  comporta como `hidden`, así que es opcional.
- **El texto sigue en el DOM.** Los tests que lo leen no cambian.

**Un detalle que hay que cuidar:**
- **El problema:** el listener de captura que borra los avisos de rechazo
  (`app.js:2790`) se dispara con cualquier botón:
  ```js
  e.target.closest('button')
  ```
  Abrir una ayuda borraría el aviso que la persona está tratando de entender.
- **La corrección:** excluir los «?» de ese listener.
  ```js
  e.target.closest('button:not(.help-btn)')
  ```
- **Un test en `test/inputs.test.js`** lo fija.

### 3.3 Ejemplo sobre tres campos

**Model:**
- **A la vista:** «Model» con su «?».
- **Detrás del «?»:** la nota actual completa.
- **Ahorro:** 58 px.

**Convenience yield:**
- **A la vista, con Black-76 (el valor por defecto):** el campo deshabilitado y su motivo en
  la etiqueta, «Convenience yield (not used in Black-76)» (D18). La línea que hoy dice lo
  mismo, debajo del campo, desaparece.
- **Con Black-Scholes:** «Convenience yield (%)» y su «?».
- **Detrás del «?»:** «Net convenience yield: the benefit of holding the physical, minus
  storage. The Yield button implies it from two listed contracts.».

**Premium financing:**
- **A la vista,** en una línea con los números del estado actual: «Interest on the premium:
  −$3.71 to the horizon at 4.00%.». Los datos ya están en el KPI Premium interest.
- **Detrás del «?»:** las 55 palabras actuales, por qué un débito paga el interés y un
  crédito lo gana.
- **Ahorro:** unos 50 px.

### 3.4 Otras dos mejoras de ayuda, para el mismo PR

- **Un «?» por columna en el encabezado de la tabla de patas,** al menos en Vol, Under y
  Entry: reemplaza la nota de 72 palabras con explicaciones donde se las busca. En el
  celular, con las tarjetas de D6, el «?» va junto a cada etiqueta.
- **La columna «Meaning» de las griegas,** detrás de un «?» por griega en el celular (D10).
  En escritorio puede quedar como está.

---

## 4. Evaluación: ¿publicar en inglés y en español?

**Recomendación: sí, por etapas, y después de los cambios de diseño.**
- **Como dos páginas estáticas,** `/` y `/es/`, que comparten el CSS, el JavaScript y una
  tabla de textos.
- **No como un selector de idioma dentro de la misma página:** el crawler de LinkedIn no
  ejecuta JavaScript, así que la vista previa seguiría en inglés.
- **Lo urgente es otra cosa:** el formato mixto de los números (D20), que hoy ya afecta a
  cualquier visitante con el navegador en español.

### 4.1 Cuánto texto hay (V)

| Fuente | Texto a traducir |
|---|---|
| `index.html` | 691 palabras visibles y 4 atributos de texto |
| `app.js` | 166 literales de cara al usuario, de 617 con palabras: 16 llamadas a `setStatus`, 9 `message:` devueltos por acciones y 26 escrituras de `textContent`/`innerHTML` |
| `commodities.js` | 15 nombres de mercado y sus unidades («troy oz», «bushels», «metric tons») |
| `privacy.html` | 804 palabras, texto legal (CLAUDE.md: «load-bearing») |
| tests | unos 26 asserts fijan textos en inglés |

Unas 1700 palabras en total, más el disclaimer. Las 166 cadenas de `app.js` son lo que más
cuesta, porque muchas llevan valores intercalados (fuentes, fechas, precios) y hay que pasarlas
a plantillas con parámetros.

### 4.2 ¿Vale la pena? (E)

**A favor:**
- **La red de LinkedIn del autor** es en buena parte de habla hispana. Un post en español con
  una tarjeta en inglés convierte peor que una tarjeta en el idioma del post.
- **Hay un público** que se beneficia de verdad de la interfaz en su idioma:
  - estudiantes;
  - productores y acopiadores que cubren con opciones en CBOT o en Matba-Rofex;
  - analistas que no operan opciones a diario.

**En contra:**
- **El campo es angloparlante.** Las especificaciones de CME e ICE, las pantallas de los
  brokers y la jerga (call, put, strike, breakeven, greeks, convenience yield) están en
  inglés, y los operadores hispanohablantes la usan tal cual. Para ese público el inglés no es
  una barrera.
- **El mantenimiento se duplica.** Cada texto nuevo, cada mensaje de error y cada cambio del
  disclaimer o de la política de privacidad se escriben dos veces, y los últimos dos tienen
  peso legal.

**Balance:** vale la pena para la difusión y para el público no especialista, siempre que no
se traduzca dos veces. Muchos de los hallazgos de arriba reescriben textos y markup: D3, D6,
D15, D16, D21, D23 y D27. Traducir antes es hacerlo dos veces.

### 4.3 Opciones

| Opción | Qué es | Vista previa en LinkedIn | Costo | Veredicto |
|---|---|---|---|---|
| **A. Selector en la página** | `?lang=es` y una tabla de textos que el JavaScript aplica al cargar | **Siempre en inglés**: el crawler no ejecuta JavaScript (E) | Medio | No: pierde la razón principal para traducir |
| **B. Dos páginas estáticas** | `/` e `/es/index.html`, que comparten `styles.css`, `commodities.js`, `app.js` y un `i18n.js` nuevo | **En el idioma de cada página**, porque cada una tiene su `<head>` | Grande | **Sí, como destino** |
| **C. Solo una portada en español** | `/es/`: unas 150 palabras sobre qué hace, una captura y «Abrir la calculadora (en inglés)», con su tarjeta en español | En español | Chico, un archivo | **Sí, como paso intermedio** si los posts en español empiezan antes que B |

**Cómo hacer B sin romper lo que ya funciona:**
- **`i18n.js`:** un script plano con `module.exports` protegido, como `commodities.js`. Se
  carga antes que `app.js`, que elige la tabla según `document.documentElement.lang`. Sin
  módulos, para que siga funcionando desde `file://`.
- **El markup duplicado** de `es/index.html`, unas 300 líneas, se protege con un test:
  - las dos páginas declaran los mismos `id`;
  - cargan los mismos scripts, con el mismo hash de integridad de Chart.js;
  - tienen la misma CSP.

  Sin paso de build, ese test es lo que evita que una página se quede atrás.
- **En cada `<head>`:**
  ```html
  <link rel="alternate" hreflang="en" href="https://commodity-options-calculator.vercel.app/">
  <link rel="alternate" hreflang="es" href="https://commodity-options-calculator.vercel.app/es/">
  <link rel="alternate" hreflang="x-default" href="https://commodity-options-calculator.vercel.app/">
  ```
  más `og:locale` (`en_US` o `es_LA`) con `og:locale:alternate`, y un enlace visible «English
  · Español» en el encabezado.
- **Números en `/es/`: punto decimal, como en inglés (E).** Es la convención de las pantallas
  de CME e ICE, la de esta revisión y lo que los campos `type="number"` aceptan en todos los
  navegadores. Conviene decirlo una vez en la página: «Los números usan punto decimal, como en
  las pantallas de CME.».
- **Terminología:** fijar un glosario antes de traducir.
  - **Quedan en inglés,** porque así se usan: call, put, delta, gamma, vega, theta, rho.
  - **Strike:** «strike (precio de ejercicio)» la primera vez.
  - **Breakeven:** «punto de equilibrio».
  - **Convenience yield:** «rendimiento de conveniencia (convenience yield)».
  - **Volatilidad:** «volatilidad histórica, no implícita».
- **El disclaimer y la política de privacidad** se traducen con el mismo cuidado que el
  original. `test/privacy.test.js` necesitaría cubrir las dos versiones.

**Sinergia con §3:** pasar las notas a «?» y traducir requieren el mismo trabajo, sacar los
textos de `app.js` e `index.html` a una tabla con claves. Conviene hacerlo una sola vez, en
ese orden: primero la estructura de ayudas y después la tabla bilingüe.

---

## Apéndice A — Método

**Navegador y servidor:**
- **Navegador:** Chromium 1194, el preinstalado, con `playwright-core`. Celular y tablet con
  `isMobile`, `hasTouch` y escala 2; escritorio con escala 1. Modo claro y oscuro con
  `colorScheme`.
- **Página:** `main` @ `9249ff4`, servida por `scripts/serve.js` en local.
- **Chart.js:** se sirvió desde una copia local del archivo fijado por SRI, byte a byte
  idéntica al del CDN. El hash de integridad de la página siguió validando.

**Accesibilidad y contraste:**
- **axe-core 4.10.2,** instalado fuera del repo. Se inyectó con `bypassCSP` en el contexto de
  prueba, porque la CSP de la página bloquea scripts en línea, como debe. No se cambió nada de
  la página.
- **Contraste:** la fórmula de luminancia relativa de WCAG 2.x. Los colores con transparencia
  se componen sobre su fondo real.

**Estados y producción:**
- **Fallas:** `/api/market` se interceptó para responder 502 después de 1.5 s, y
  `home.treasury.gov` para abortar.
- **Idioma:** se emuló el navegador en `es-AR` y en `en-US`.
- **Producción:** `curl` contra `https://commodity-options-calculator.vercel.app` el 28/10/2026.

**Scripts:** quedaron en el directorio temporal de la sesión, no en el repo:
- `shots.js`: capturas;
- `sections.js`: posición de las tarjetas;
- `measure.js`: blancos táctiles, nombres, letras y axe;
- `states.js` y `failure.js`: estados de carga, falla y vacío;
- `status.js`: dónde aparece la línea de estado;
- `locale.js`: formato de números según el idioma;
- `desk.js`: la tabla de patas en escritorio;
- `notes.js`: las notas;
- `privacy.js`: la política de privacidad;
- `reorder.js`: la simulación de D3 y D27.

**Limitaciones:**
- **Sin dispositivos reales.** El zoom de iOS (D4) y la tipografía de cada plataforma (D9)
  son estimados.
- **Fuentes.** Chromium en Linux no tiene Segoe UI, Verdana ni SF, así que las capturas
  muestran la fuente de reserva.

## Apéndice B — Contrastes (V)

| Modo | Par | Contraste | Requisito | ¿Cumple? |
|---|---|---|---|---|
| claro | texto `#23272e` / tarjeta `#fff` | 14.99:1 | 4.5:1 | sí |
| claro | `--muted #6b7280` / tarjeta (notas, 12.5 px) | 4.83:1 | 4.5:1 | sí |
| claro | `--muted` / fondo `#f6f7f9` (subtítulo, pie) | 4.51:1 | 4.5:1 | justo |
| claro | `--accent #0b6ea8` / `#fff` (botones ghost) | 5.51:1 | 4.5:1 | sí |
| claro | `#fff` / `--accent` (botón primario) | 5.51:1 | 4.5:1 | sí |
| claro | `--pos #197b3f` / `#fff` | 5.32:1 | 4.5:1 | sí |
| claro | `--neg #b3261e` / `#fff` | 6.54:1 | 4.5:1 | sí |
| claro | `--warn #b45309` / `#fff` (punto de fuente) | 5.02:1 | 3:1 | sí |
| claro | `--line #dfe3e8` / `#fff` (borde de campos) | **1.29:1** | 3:1 | **no** (D12) |
| claro | `--chart-strike #9ca3af` / `#fff` (etiquetas) | **2.54:1** | 4.5:1 | **no** (D13) |
| claro | `--chart-leg rgba(0,0,0,.25)` / `#fff` | **1.84:1** | 3:1 | **no** (D13) |
| claro | `--chart-now #d97706` / `#fff` | 3.19:1 | 3:1 | sí |
| claro | `--chart-spot #6b7280` / `#fff` | 4.83:1 | 4.5:1 | sí |
| oscuro | texto `#e4e7ec` / tarjeta `#1c2028` | 13.17:1 | 4.5:1 | sí |
| oscuro | `--muted #98a2b3` / tarjeta | 6.34:1 | 4.5:1 | sí |
| oscuro | `--accent #3fa9e0` / tarjeta | 6.19:1 | 4.5:1 | sí |
| oscuro | `#0b1116` / `--accent` (botón primario) | 7.20:1 | 4.5:1 | sí |
| oscuro | `--pos #4ade80` / tarjeta | 9.37:1 | 4.5:1 | sí |
| oscuro | `--neg #f87171` / tarjeta | 5.90:1 | 4.5:1 | sí |
| oscuro | `--line #2c323c` / tarjeta | **1.27:1** | 3:1 | **no** (D12) |
| oscuro | `--line #2c323c` / `--field #131720` | **1.39:1** | 3:1 | **no** (D12) |
| oscuro | `--chart-strike #8f8f8f` / tarjeta | 5.05:1 | 4.5:1 | sí |
| oscuro | `--chart-leg rgba(255,255,255,.30)` / tarjeta | **2.71:1** | 3:1 | **no** (D13) |
| oscuro | `--chart-net #7fd1ff` / tarjeta | 9.69:1 | 3:1 | sí |
| oscuro | `--chart-now #ffb45c` / tarjeta | 9.28:1 | 3:1 | sí |

**Colores propuestos, medidos:**

| Modo | Uso | Color | Contraste | Contra |
|---|---|---|---|---|
| claro | borde de campos | `#868f9c` | 3.27:1 | tarjeta |
| claro | borde de campos | `#868f9c` | 3.05:1 | fondo |
| oscuro | borde de campos | `#626b7a` | 3.33:1 | campo |
| oscuro | borde de campos | `#626b7a` | 3.03:1 | tarjeta |
| claro | curvas de cada pata | `rgba(0,0,0,.45)` | 3.36:1 | tarjeta |
| oscuro | curvas de cada pata | `rgba(255,255,255,.40)` | 3.75:1 | tarjeta |
| claro | etiquetas de strike | `#6b7280` | 4.83:1 | tarjeta |

**Texto sobre el sombreado más fuerte de la grilla (50%):**
- claro: 7.77:1 en verde y 6.77:1 en rojo;
- oscuro: 6.86:1 y 8.15:1.

## Apéndice C — Blancos táctiles chicos (V, iPhone 390×844)

**Recuento:** 59 controles interactivos, 55 de menos de 44 px en algún lado y 6 de menos de
24 px.

**Debajo de 24×24:**

| Control | Tamaño | Nota |
|---|---|---|
| `#skewOn` | 13×13 | también se toca por su etiqueta |
| checkbox de incluir pata (`[data-f=on]`) | 13×13 | sin etiqueta |
| `#showLegs` | 13×13 | también se toca por su etiqueta |
| borrar pata (`[data-f=del]`) | 21×24 | pegado al botón IV |
| «Get a free key» | 78×14 | |
| «Privacy Policy» | 80×15 | |

**Entre 24 y 44 px de alto, por tipo:**

| Tipo | Ejemplos | Tamaño |
|---|---|---|
| selects del panel | `#commodity`, `#model`, `#style`, `#financing`, `#volWindow`, `#volEstimator` | 34 px de alto |
| inputs del panel | `#spot`, `#days`, `#vol`, `#rate`, `#yield`, `#size` | 37 px de alto |
| botones | «Auto-fill» | 35 px de alto |
| botones | Price, Rate, Volatility, Yield | 75–80×37 |
| botones | «Load», «+ Add leg», «Clear» | 37 px de alto |
| tabla de patas | Side y Type | 62×27 |
| tabla de patas | Qty, Strike y demás inputs | 62×29 |
| control nativo | `summary` de Alpha Vantage | 324×36 |

**Tamaños de letra efectivos:**

| Elemento | Tamaño |
|---|---|
| campos | 14.72 px (30) y 13.12 px (10) |
| `.note`, `.src`, `.disclaimer` | 12.48 px |
| `label` | 13.6 px |
| `th` | 11.52 px |
| `.kpi span` | 11.84 px |
| `.kpi small` | 11.52 px |
| `td` | 13.44 px |
| subtítulo del encabezado | 14.72 px |
| pie | 12.8 px |

## Apéndice D — Posiciones medidas y simulación del orden propuesto (V)

**Alto de la página:**

| Viewport | Alto | Pantallas |
|---|---|---|
| iPhone, 390×844 | 6332 px | 7.5 |
| Android, 360×800 | 6695 px | 8.4 |
| tablet, 768×1024 | 5319 px | 5.2 |
| escritorio, 1280×900 | 3074 px | 3.4 |

**Escritorio a 1280×900:**
- **Strategy:** 112 px.
- **Results:** 514 px; los KPIs en 567 px.
- **Payoff:** 1066 px; el gráfico en 1197 px, debajo del pliegue.
- **Scenario grid:** 1711 px.

**Simulación en el iPhone,** aplicando estilos en el navegador de prueba sin tocar el repo
(`reorder.js`):

| Variante | KPIs | Gráfico | Contract | Página | Ancho |
|---|---|---|---|---|---|
| Hoy | 3343 px (4.0) | 4271 px (5.1) | 171 px | 6332 px (7.5) | 390 |
| Orden de D3 **sin** `min-width: 0` | 643 px | 1226 px | 1758 px | 5365 px | **858**: desborda |
| Orden de D3 | 809 px (1.0) | 1755 px (2.1) | 2340 px | 6440 px (7.6) | 390 |
| + notas de referencia plegadas (D27) | 548 px (0.6) | 1494 px (1.8) | 1967 px | 5516 px (6.5) | 390 |
| + campos a 16 px (D4) | 548 px (0.6) | 1495 px (1.8) | 1968 px | 5540 px (6.6) | 390 |

La segunda fila es la razón del `min-width: 0` de D3. Sin él, el orden nuevo parece acortar la
página porque la ensancha: todo el layout pasa a 858 px y aparece scroll horizontal.
