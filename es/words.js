/* The Spanish page's words, by the English text app.js writes. Loaded by
 * es/index.html after i18n.js and before app.js; the English page never loads
 * it.
 *
 * Impersonal: an instruction is an infinitive or a "se" sentence, never tú, vos
 * or usted. Numbers keep the decimal point, as the fields take it. Market terms
 * stay in English, as a desk says them: call, put, strike, spread, the greeks,
 * P&L, risk reversal, butterfly, at-the-money, the strategies' own names. A
 * leg is a "pata", long and short are "compra" and "venta", the underlying the
 * "subyacente".
 *
 * Every key app.js asks t() for has an entry, the same text included where
 * Spanish says it the same way, and a translation keeps the key's {names} and
 * markup: test/words.test.js checks all three. */

const SPANISH = {
  /* ---- market data, errors ---- */
  'Treasury yield curve unavailable': 'curva de rendimientos del Tesoro no disponible',
  'Alpha Vantage HTTP {status}': 'Alpha Vantage HTTP {status}',
  'Symbol not found: {symbol}': 'Símbolo no encontrado: {symbol}',
  'no futures contract mapped for this commodity': 'no hay un contrato de futuros asignado a este mercado',
  'the futures proxy only runs on the deployed site': 'el proxy de futuros solo funciona en el sitio publicado',
  'the futures proxy is not deployed here': 'el proxy de futuros no está disponible en este sitio',
  'proxy returned HTTP {status}': 'el proxy respondió HTTP {status}',
  'fewer than two listed contracts quote for this commodity': 'cotizan menos de dos contratos listados para este mercado',

  /* ---- the market function's own messages (api/market.js) ---- */
  'Only GET is supported': 'Solo se admite GET',
  'Upstream quote unavailable': 'La cotización de origen no está disponible',
  'Could not read two contracts for this commodity': 'No se pudieron leer dos contratos de este mercado',
  'Could not read any listed contract for this commodity': 'No se pudo leer ningún contrato listado de este mercado',
  'Unknown fn. Use quote, history, curve or months.': 'fn desconocida. Usar quote, history, curve o months.',
  'Market data request failed': 'Falló la consulta de datos de mercado',

  /* ---- markets (commodities.js): labels, units, ETF proxies ---- */
  'Gold (COMEX GC)': 'Oro (COMEX GC)',
  'Silver (COMEX SI)': 'Plata (COMEX SI)',
  'Copper (COMEX HG)': 'Cobre (COMEX HG)',
  'Crude Oil WTI (NYMEX CL)': 'Petróleo WTI (NYMEX CL)',
  'Crude Oil Brent (ICE B)': 'Petróleo Brent (ICE B)',
  'Natural Gas (NYMEX NG)': 'Gas natural (NYMEX NG)',
  'Corn (CBOT ZC)': 'Maíz (CBOT ZC)',
  'Wheat (CBOT ZW)': 'Trigo (CBOT ZW)',
  'Soybeans (CBOT ZS)': 'Soja (CBOT ZS)',
  'Sugar #11 (ICE SB)': 'Azúcar #11 (ICE SB)',
  'Coffee C (ICE KC)': 'Café C (ICE KC)',
  'Cocoa (ICE CC)': 'Cacao (ICE CC)',
  'Cotton #2 (ICE CT)': 'Algodón #2 (ICE CT)',
  'Live Cattle (CME LE)': 'Ganado en pie (CME LE)',
  'Custom / other': 'Personalizado / otro',
  'troy oz': 'onzas troy',
  'lb': 'lb',
  'barrels': 'barriles',
  'MMBtu': 'MMBtu',
  'bushels': 'bushels',
  'metric tons': 'toneladas métricas',
  'units': 'unidades',
  'SPDR Gold Shares - tracks spot gold closely': 'SPDR Gold Shares - sigue de cerca al oro spot',
  'iShares Silver Trust': 'iShares Silver Trust',
  'US Copper Index Fund': 'US Copper Index Fund',
  'US Oil Fund - rolls front-month WTI': 'US Oil Fund - rola el primer vencimiento del WTI',
  'US Brent Oil Fund': 'US Brent Oil Fund',
  'US Natural Gas Fund': 'US Natural Gas Fund',
  'Teucrium Corn Fund': 'Teucrium Corn Fund',
  'Teucrium Wheat Fund': 'Teucrium Wheat Fund',
  'Teucrium Soybean Fund': 'Teucrium Soybean Fund',
  'Teucrium Sugar Fund': 'Teucrium Sugar Fund',
  'iPath Coffee ETN - thin, treat vol with care': 'iPath Coffee ETN - poco líquido, tomar su vol con cuidado',
  'No ETF proxy - use the futures buttons above': 'Sin ETF como proxy: usar los botones de futuros de arriba',
  'iPath Cotton ETN - thin': 'iPath Cotton ETN - poco líquido',
  'Set the contract size and symbol yourself': 'El tamaño del contrato y el símbolo se completan a mano',

  /* ---- strategies ---- */
  'Long call': 'Compra de call',
  'Long put': 'Compra de put',
  'Short call (naked)': 'Venta de call (descubierta)',
  'Short put (naked)': 'Venta de put (descubierta)',
  'Covered call': 'Covered call (call cubierto)',
  'Protective put': 'Protective put (put protector)',
  'Bull call spread': 'Bull call spread (alcista)',
  'Bear put spread': 'Bear put spread (bajista)',
  'Long straddle': 'Compra de straddle',
  'Long strangle': 'Compra de strangle',
  'Short strangle': 'Venta de strangle',
  'Call butterfly': 'Butterfly con calls',
  'Iron condor': 'Iron condor',
  'Collar': 'Collar',
  'Call calendar spread': 'Calendar spread con calls',
  'Call ratio 1x2': 'Ratio 1x2 con calls',
  'Choose a strategy…': 'Elegir una estrategia…',

  /* ---- money ---- */
  'Unlimited': 'Ilimitada',

  /* ---- the Contract and Market data panels ---- */
  'Malz interpolation: legs with a blank Vol take the curve for their own strike, read at today\'s price and held as the scenario moves (sticky strike). Risk reversal is the 25-delta call\'s volatility minus the put\'s; butterfly is how far both wings sit above the at-the-money level, which is the Volatility field.':
    'Interpolación de Malz: las patas con Vol vacía toman la curva en su propio strike, leída al precio de hoy y fija mientras el escenario se mueve (sticky strike). El risk reversal es la volatilidad del call de 25 delta menos la del put; el butterfly es cuánto quedan ambas alas por encima del nivel at-the-money, que es el campo Volatilidad.',
  'Off: every leg with a blank Vol uses the single Volatility number above. Turn it on to quote a surface as three points instead of typing a volatility per leg.':
    'Desactivado: cada pata con Vol vacía usa la Volatilidad única de arriba. Activado, la superficie se cotiza con tres puntos en lugar de escribir una volatilidad por pata.',
  'Not used in Black-76: the futures price already embeds carry and convenience yield.':
    'No se usa en Black-76: el precio del futuro ya incorpora el carry y el rendimiento de conveniencia.',
  'Net convenience yield (benefit of holding the physical, minus storage).':
    'Rendimiento de conveniencia neto (el beneficio de tener el físico, menos el almacenamiento).',
  'Nominal P&L: measured from the entry price alone, with no interest on the premium.':
    'P&L nominal: medido solo desde el precio de entrada, sin interés sobre la prima.',
  'The premium paid today carries interest from today to the date the P&L is read, at your own rate, continuously compounded like the risk-free rate. A debit pays the interest and a credit earns it; a futures leg has no premium to carry.':
    'La prima pagada hoy devenga interés desde hoy hasta la fecha en que se lee el P&L, a la tasa propia, con capitalización continua como la tasa libre de riesgo. Un débito paga el interés y un crédito lo cobra; una pata de futuros no tiene prima que financiar.',
  'The premium paid today carries interest from today to the date the P&L is read, at the risk-free rate above - the one that discounts the price - so a fairly priced option breaks even on average. A debit pays the interest and a credit earns it; a futures leg has no premium to carry.':
    'La prima pagada hoy devenga interés desde hoy hasta la fecha en que se lee el P&L, a la tasa libre de riesgo de arriba - la misma que descuenta el precio -, así que una opción a precio justo no gana ni pierde en promedio. Un débito paga el interés y un crédito lo cobra; una pata de futuros no tiene prima que financiar.',
  'Barone-Adesi-Whaley approximation. Most listed commodity futures options are American, and on futures the early-exercise premium shows up on calls and puts alike.':
    'Aproximación de Barone-Adesi-Whaley. La mayoría de las opciones listadas sobre futuros de commodities son americanas, y sobre futuros la prima por ejercicio anticipado aparece tanto en calls como en puts.',
  'Closed-form Black-76 / Black-Scholes-Merton. Exact for European exercise, but it prices the right to exercise early at zero - worth up to ~2.6% of the underlying on a deep in-the-money contract.':
    'Black-76 / Black-Scholes-Merton en forma cerrada. Exacto para el ejercicio europeo, pero valúa en cero el derecho a ejercer antes, que vale hasta ~2.6% del subyacente en un contrato muy in-the-money.',
  'Futures price': 'Precio del futuro',
  'Spot price': 'Precio spot',
  '1 contract = {size} {unit} (quoted in cents) - P&L multiplier ${mult} per point':
    '1 contrato = {size} {unit} (cotiza en centavos) - multiplicador del P&L ${mult} por punto',
  '1 contract = {size} {unit} - P&L multiplier ${mult} per point':
    '1 contrato = {size} {unit} - multiplicador del P&L ${mult} por punto',
  'American': 'Americana',
  'European': 'Europea',
  'front month': 'primer vencimiento',
  'rate {rate}%': 'tasa {rate}%',
  'nominal P&L': 'P&L nominal',
  'premium financed at {rate}%': 'prima financiada al {rate}%',
  'premium financed at the risk-free rate': 'prima financiada a la tasa libre de riesgo',
  '{size} {unit}, quoted in cents': '{size} {unit}, en centavos',
  '{size} {unit}': '{size} {unit}',
  'Realised-volatility window and estimator, skew on, the carry check and the Alpha Vantage fallback':
    'Ventana y estimador de la volatilidad realizada, skew activado, control del carry, respaldo de Alpha Vantage',
  'Realised-volatility window and estimator, skew off, the carry check and the Alpha Vantage fallback':
    'Ventana y estimador de la volatilidad realizada, skew desactivado, control del carry, respaldo de Alpha Vantage',
  'futures {price}': 'futuro {price}',
  'spot {price}': 'spot {price}',
  'vol {vol}%': 'vol {vol}%',
  'At the {strikes} and {last} strikes': 'En los strikes {strikes} y {last}',
  'At the {strike} strike': 'En el strike {strike}',
  'This curve is steeper than its at-the-money level allows.':
    'Esta curva es más empinada de lo que permite su nivel at-the-money.',
  '{where} it goes below zero, so the leg prices at the 0.01% floor.':
    '{where} queda por debajo de cero, así que la pata se valúa con el piso de 0.01%.',
  '{where} more than one volatility fits it.': '{where} más de una volatilidad satisface la curva.',
  'Narrow the risk reversal or the butterfly, or type a Vol for those legs.':
    'Conviene achicar el risk reversal o el butterfly, o escribir una Vol para esas patas.',
  'Front month (continuous)': 'Primer vencimiento (continuo)',
  'cents': 'centavos',

  /* ---- sources ---- */
  'Underlying price': 'Precio del subyacente',
  'Risk-free rate': 'Tasa libre de riesgo',
  'Volatility': 'Volatilidad',
  'Convenience yield': 'Rendimiento de conveniencia',
  'Leg prices': 'Precios de las patas',
  'manual / preset (not market data)': 'manual / predeterminado (no es dato de mercado)',

  /* ---- the legs table ---- */
  'call': 'call',
  'put': 'put',
  'underlying': 'subyacente',
  '{what}, leg {n}': '{what}, pata {n}',
  'Include': 'Incluir',
  'Include in the strategy': 'Incluir en la estrategia',
  'Side': 'Operación',
  'Long': 'Compra',
  'Short': 'Venta',
  'Type': 'Tipo',
  'Call': 'Call',
  'Put': 'Put',
  'Underlying': 'Subyacente',
  'Qty': 'Cant.',
  'Quantity': 'Cantidad',
  'Strike': 'Strike',
  'Days': 'Días',
  'Days to expiry': 'Días al vencimiento',
  'Vol %': 'Vol %',
  'Volatility %': 'Volatilidad %',
  'Under': 'Subyac.',
  'This leg\'s own contract price today. Blank uses the contract in the left panel.':
    'Precio de hoy del contrato propio de esta pata. Vacío, usa el contrato del panel izquierdo.',
  'Entry': 'Entrada',
  'Entry price': 'Precio de entrada',
  'Theo.': 'Teór.',
  'Delta': 'Delta',
  'Cost $': 'Costo $',
  'Solve implied volatility from the entry price': 'Calcular la volatilidad implícita desde el precio de entrada',
  'Implied volatility from the entry price': 'Volatilidad implícita desde el precio de entrada',
  'Remove leg': 'Quitar la pata',
  'Remove': 'Quitar',
  'No legs. Add one or pick a strategy.': 'Sin patas. Agregar una o elegir una estrategia.',
  'Pricing against one listed contract. "Fill leg prices" now interpolates between these {n} real quotes instead of extrapolating a single slope.':
    'Se valúa contra un contrato listado. "Precios de las patas desde la curva" ahora interpola entre estas {n} cotizaciones reales en lugar de extrapolar una sola pendiente.',
  'Listed months loaded. Pick one to price against that specific contract, which is what an option quote on a broker\'s screen refers to.':
    'Meses listados cargados. Al elegir uno se valúa contra ese contrato específico, que es al que se refiere la cotización de una opción en la pantalla de un broker.',
  'The continuous front-month series by default. Load the listed months to price against one specific delivery month - which is what an option quote on a broker\'s screen refers to.':
    'Por defecto, la serie continua del primer vencimiento. Cargar los meses listados permite valuar contra un mes de entrega específico, que es al que se refiere la cotización de una opción en la pantalla de un broker.',

  /* ---- results ---- */
  'to the horizon, at {rate}%, your rate': 'hasta el horizonte, al {rate}%, la tasa propia',
  'to the horizon, at {rate}%, the risk-free rate': 'hasta el horizonte, al {rate}%, la tasa libre de riesgo',
  'Not charged': 'No se aplica',
  '{amount} per point as the price rises': '{amount} por punto a medida que sube el precio',
  'Every leg is switched off. Tick <strong>Include</strong> on one in the table above to see its results.':
    'Todas las patas están desactivadas. Al marcar <strong>Incluir</strong> en alguna de la tabla de arriba se ven sus resultados.',
  'No legs yet. <a href="#strategy">Choose a strategy</a> or add a leg above to see its results.':
    'Todavía no hay patas. <a href="#strategy">Elegir una estrategia</a> o agregar una pata arriba para ver los resultados.',
  'Net debit (paid)': 'Débito neto (pagado)',
  'Net credit (received)': 'Crédito neto (cobrado)',
  'Max profit': 'Ganancia máxima',
  'Max loss': 'Pérdida máxima',
  'Breakeven': 'Punto de equilibrio',
  'Breakevens': 'Puntos de equilibrio',
  'None': 'Ninguno',
  'Prob. of profit': 'Prob. de ganancia',
  'risk-neutral, at {vol}% vol': 'neutral al riesgo, con vol de {vol}%',
  'Horizon': 'Horizonte',
  '{n} day': '{n} día',
  '{n} days': '{n} días',
  'Premium interest': 'Interés de la prima',
  'Greek': 'Griega',
  'Per unit': 'Por unidad',
  'Position ($)': 'Posición ($)',
  'Meaning': 'Significado',
  '$ P&L per 1 point move': 'P&L en $ por cada punto',
  'delta change per 1 point move': 'cambio de delta por cada punto',
  '$ per +1 vol point': '$ por +1 punto de vol',
  '$ per calendar day': '$ por día calendario',
  '$ per +1 rate point': '$ por +1 punto de tasa',
  'Position column = per-unit greek × quantity × ${mult} multiplier.':
    'Columna Posición = griega por unidad × cantidad × multiplicador de ${mult}.',
  'Delta and gamma are per point of the contract in the left panel, with each leg\'s own month moving in proportion, as on the chart; the Delta column in the legs table is against each leg\'s own month.':
    'Delta y gamma son por punto del contrato del panel izquierdo, con el mes de cada pata moviéndose en proporción, como en el gráfico; la columna Delta de la tabla de patas es respecto del mes de cada pata.',
  'Theta is the options\' own decay. The P&amp;L also carries the premium\'s interest: {amount} a day at {rate}%.':
    'Theta es el decaimiento propio de las opciones. El P&amp;L también lleva el interés de la prima: {amount} por día al {rate}%.',

  /* ---- the chart ---- */
  'today': 'hoy',
  'in {n} day': 'en {n} día',
  'in {n} days': 'en {n} días',
  'Profit / loss ($)': 'Ganancia / pérdida ($)',
  'At horizon ({n}d)': 'Al horizonte ({n}d)',
  'Today (mark to market)': 'Hoy (valuación a mercado)',
  'In {n}d': 'En {n}d',
  'Long {qty} {kind}': 'Compra {qty} {kind}',
  'Short {qty} {kind}': 'Venta {qty} {kind}',
  '{greek} (position, $ terms)': '{greek} (posición, en $)',
  'K {strike}': 'K {strike}',
  'Now': 'Hoy',
  'Underlying price at horizon': 'Precio del subyacente al horizonte',
  'Price {price}': 'Precio {price}',
  'Payoff chart: no legs yet.': 'Gráfico de payoff: todavía no hay patas.',
  '{greek} profile of the position, for an underlying price from {lo} to {hi}.':
    'Perfil de {greek} de la posición, para un precio del subyacente de {lo} a {hi}.',
  'no breakeven': 'sin punto de equilibrio',
  'breakeven at {price}': 'punto de equilibrio en {price}',
  'breakevens at {prices}': 'puntos de equilibrio en {prices}',
  'Payoff chart: profit and loss at the {n}-day horizon, for an underlying price from {lo} to {hi}: maximum profit {max}, maximum loss {min}, {breakevens}.':
    'Gráfico de payoff: ganancia y pérdida al horizonte de {n} días, para un precio del subyacente de {lo} a {hi}: ganancia máxima {max}, pérdida máxima {min}, {breakevens}.',
  'The scenario grid below gives the profit and loss as a table.':
    'La tabla de escenarios de abajo da la ganancia y la pérdida en forma de tabla.',
  'The chart library could not be loaded, so the payoff graph is unavailable. Everything else on this page still works - the numbers below and the scenario grid are computed locally.':
    'No se pudo cargar la biblioteca de gráficos, así que el gráfico de resultados no está disponible. Todo lo demás funciona: los números de abajo y la tabla de escenarios se calculan en este navegador.',

  /* ---- the scenario grid ---- */
  'Add a leg to see the scenario grid.': 'Agregar una pata para ver la tabla de escenarios.',
  'Scenario grid, {title}': 'Tabla de escenarios, {title}',
  'Today': 'Hoy',
  '{n}d': '{n}d',
  'Volatility unchanged': 'Volatilidad sin cambios',
  'Volatility {shift} points': 'Volatilidad {shift} puntos',
  'P&L at each date assumes the volatility shift happens immediately and holds.':
    'El P&L de cada fecha supone que el cambio de volatilidad ocurre de inmediato y se mantiene.',
  'The last column is the nearest expiry among your legs ({n} days).':
    'La última columna es el vencimiento más cercano entre las patas ({n} días).',
  'The P&L is nominal: the premium carries no interest.': 'El P&L es nominal: la prima no devenga interés.',
  'Each date includes the premium\'s interest up to it, at {rate}%.':
    'Cada fecha incluye el interés de la prima hasta ese día, al {rate}%.',
  'Only the underlying is in the position, so volatility and time do nothing.':
    'La posición tiene solo el subyacente, así que la volatilidad y el tiempo no la afectan.',

  /* ---- refused numbers ---- */
  'Enter a number.': 'Se necesita un número.',
  'A price must be above zero: these models are lognormal and cannot price a contract at or below zero.':
    'El precio debe ser mayor que cero: estos modelos son lognormales y no pueden valuar un contrato en cero o por debajo.',
  'A strike must be above zero.': 'El strike debe ser mayor que cero.',
  'Units per contract must be above zero.': 'Las unidades por contrato deben ser mayores que cero.',
  'Volatility cannot be negative.': 'La volatilidad no puede ser negativa.',
  'Still using {value}.': 'Se sigue usando {value}.',
  'The leg keeps its previous value.': 'La pata conserva su valor anterior.',

  /* ---- the market-data actions ---- */
  'US Treasury par curve {date}, interpolated at {days}d = {par}% par (semi-annual) -> {rate}% continuous':
    'Curva par del Tesoro de EE. UU. del {date}, interpolada a {days}d = {par}% par (semestral) -> {rate}% continua',
  'risk-free rate {rate}% (Treasury {date})': 'tasa libre de riesgo {rate}% (Tesoro, {date})',
  'no price returned': 'no se recibió ningún precio',
  '{name} last {price}, below zero, which these lognormal models cannot price':
    '{name}: último {price}, por debajo de cero, que estos modelos lognormales no pueden valuar',
  'the contract': 'el contrato',
  'quoting switched to {quote} to match the contract': 'la cotización pasa a {quote} para coincidir con el contrato',
  '{name} last {price}': '{name}: último {price}',
  '{name} at {price}': '{name} a {price}',
  'not enough history': 'historial insuficiente',
  'estimator unavailable for this series': 'estimador no disponible para esta serie',
  '{estimator} realised vol, {days}d window on {symbol} (front-month futures; roll gaps can inflate it slightly), last close {last}. close-to-close {close}% / EWMA {ewma}%':
    'vol realizada {estimator}, ventana de {days}d sobre {symbol} (futuros del primer vencimiento; los saltos del roll pueden inflarla un poco), último cierre {last}. close-to-close {close}% / EWMA {ewma}%',
  'volatility {vol}% from {symbol}': 'volatilidad {vol}% de {symbol}',
  'no ticker to read prices from': 'no hay un ticker del cual leer precios',
  'symbol entered by you': 'símbolo ingresado a mano',
  '{estimator} realised vol, {days}d window on {symbol} ({proxy}), last close {last}. close-to-close {close}% / EWMA {ewma}%':
    'vol realizada {estimator}, ventana de {days}d sobre {symbol} ({proxy}), último cierre {last}. close-to-close {close}% / EWMA {ewma}%',
  'volatility {vol}% from {symbol} (ETF proxy)': 'volatilidad {vol}% de {symbol} (ETF como proxy)',
  'the two contracts did not give a usable spread': 'los dos contratos no dieron un spread utilizable',
  'implied by the futures curve: {near} {nearPrice} vs {far} {farPrice}, {days}d apart (expiries approximated to mid-month), r={rate}% -> y={yield}%':
    'implícito en la curva de futuros: {near} {nearPrice} vs {far} {farPrice}, a {days}d de distancia (vencimientos aproximados a mitad de mes), r={rate}% -> y={yield}%',
  'convenience yield {yield}% from the curve': 'rendimiento de conveniencia {yield}% de la curva',
  'no listed contract quoted': 'no cotizó ningún contrato listado',
  '{n} listed months loaded': '{n} meses listados cargados',
  'one listed contract, not the continuous series': 'un contrato listado, no la serie continua',
  'edited by hand since': 'editado a mano desde entonces',
  'extrapolated past the last listed month for the {days}d leg':
    'extrapolado más allá del último mes listado para la pata de {days}d',
  'legs interpolated across {n} listed contracts, {first} {firstPrice} to {last} {lastPrice}':
    'patas interpoladas entre {n} contratos listados, de {first} {firstPrice} a {last} {lastPrice}',
  'add an option leg first': 'primero hay que agregar una pata de opción',
  'leg prices from {n} listed contracts': 'precios de las patas a partir de {n} contratos listados',
  'extrapolated past the {span}d observed span for the {days}d leg':
    'extrapolado más allá del tramo observado de {span}d para la pata de {days}d',
  'from {price} in the panel, priced along the curve at {pct}%/yr from {near} {nearPrice} vs {far} {farPrice}':
    'desde {price} del panel, valuadas sobre la curva a {pct}%/año según {near} {nearPrice} vs {far} {farPrice}',
  'leg prices from a {pct}%/yr curve': 'precios de las patas con una curva de {pct}%/año',
  'risk-free rate': 'tasa libre de riesgo',
  'futures price': 'precio del futuro',
  'volatility': 'volatilidad',
  'convenience yield': 'rendimiento de conveniencia',
  'Enter a spot price, a futures price and the days to the futures expiry.':
    'Se necesitan un precio spot, un precio de futuro y los días al vencimiento del futuro.',
  'implied by carry: F={F}, S={S}, {days}d, r={rate}% -> y={yield}%':
    'implícito en el carry: F={F}, S={S}, {days}d, r={rate}% -> y={yield}%',
  'Convenience yield implied from the spot/futures basis: {yield}%.':
    'Rendimiento de conveniencia implícito en la base spot/futuro: {yield}%.',
  'preset long-run average ({vol}%) - not market data':
    'promedio de largo plazo predeterminado ({vol}%) - no es dato de mercado',
  'preset ({yield}%) - not market data': 'predeterminado ({yield}%) - no es dato de mercado',

  /* ---- status lines ---- */
  'Fetching…': 'Consultando…',
  'Updated {what}.': 'Actualizado: {what}.',
  '{label}: could not reach {service}.': '{label}: no se pudo consultar {service}.',
  '{label}: {reason}.': '{label}: {reason}.',
  'Nothing was changed.': 'No se cambió nada.',
  'the US Treasury curve': 'la curva del Tesoro de EE. UU.',
  'Alpha Vantage': 'Alpha Vantage',
  'the futures data service': 'el servicio de datos de futuros',
  '{list} and {last}': '{list} y {last}',
  'The {field} is unchanged: {reason}.': 'Sin cambios en {field}: {reason}.',
  'Could not reach {service}, so these are unchanged: {fields}.':
    'No se pudo consultar {service}, así que no cambiaron: {fields}.',
  'You can type any of them in.': 'Cualquiera se puede escribir a mano.',
  'The list of months is unchanged.': 'La lista de meses no cambió.',
  'The legs keep their prices.': 'Las patas conservan sus precios.',
  'Fetching market data…': 'Consultando datos de mercado…',
  'Contract months': 'Meses del contrato',
  'The leg was removed.': 'Se quitó la pata.',
  'All {n} legs were removed.': 'Se quitaron las {n} patas.',
  'Every leg is back on the contract in the left panel.': 'Todas las patas vuelven al contrato del panel izquierdo.',
  'Share link': 'Compartir enlace',
  'Shareable link copied to the clipboard.': 'Enlace copiado al portapapeles.',
  'Link is in the address bar - copy it from there.': 'El enlace está en la barra de direcciones: se puede copiar desde ahí.',
  'Strategy loaded.': 'Estrategia cargada.',
  'That file is not a valid strategy export.': 'Ese archivo no es una estrategia exportada válida.',
  'Enter the market premium in the Entry column first, then press IV.':
    'Primero hay que ingresar la prima de mercado en la columna Entrada y después tocar IV.',
  'That premium has no time value - it is what the option is worth at zero volatility - so every volatility up to some level prices it alike and none can be implied. The leg keeps its volatility.':
    'Esa prima no tiene valor tiempo - es lo que vale la opción con volatilidad cero -, así que cualquier volatilidad hasta cierto nivel da el mismo precio y no se puede implicar ninguna. La pata conserva su volatilidad.',
  'No implied volatility solves that premium (check the price and the strike).':
    'Ninguna volatilidad implícita reproduce esa prima (conviene revisar el precio y el strike).',
  'Implied volatility for that leg: {vol}%. The table shows it to two decimals; the leg is priced at the exact figure, so it is worth its premium.':
    'Volatilidad implícita de esa pata: {vol}%. La tabla la muestra con dos decimales; la pata se valúa con la cifra exacta, así que vale su prima.'
};

if (typeof TRANSLATIONS !== 'undefined') TRANSLATIONS.es = SPANISH;
if (typeof module !== 'undefined' && module.exports) module.exports = SPANISH;
