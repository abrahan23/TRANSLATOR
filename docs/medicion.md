# Comprobaciones y mediciones

Resultados de las comprobaciones del grupo 1 de `transcripcion-en-vivo` y de las tareas 2.2 y 3.1. Cada
cifra sale de una ejecución real. Lo que no se ha podido comprobar está dicho.

## Cómo se ha comprobado

- **Equipo:** MacBook Air M1 (16 GB), macOS 26.6.2, Chrome 157.0.8103.79. Fecha: 2026-11-20.
- **Chrome sin ventana, con un perfil temporal** y la extensión compilada (`npm run build`) cargada como
  en desarrollo. El clic en el icono se simula con el protocolo de depuración de Chrome y abre el panel
  lateral de verdad. «Iniciar» y «Detener» se pulsan en ese panel.
- **Audio de prueba:** ocho frases en inglés con voz sintética, en bucle, en una página local. Para el
  estéreo, un tono de 440 Hz en el canal izquierdo y otro de 1000 Hz en el derecho.
- **Límite:** sin ventana nadie escucha el audio ni pulsa los botones propios de Chrome. Lo que queda por
  mirar en un Chrome normal está al final.
- **En un Chrome normal** (prueba del usuario, 2026-11-20): el modelo se descargó, un vídeo de YouTube en
  inglés se transcribió bien y se siguió oyendo mientras tanto. Con esto queda cerrada la tarea 1.3.
- **Para medir el retardo** (1.7 y 1.8): la versión de desarrollo (`npm run build:dev`) y el audio de
  referencia de 1.6 sonando en una pestaña.
- Los scripts que manejan el Chrome sin ventana son temporales y todavía no están en el repositorio.
  Los de la medición sí están, en `tools/`.

## 1.4 — El panel y la captura

| Punto | Resultado | Detalle |
|---|---|---|
| El panel está aislado de otros orígenes | Sí | En la página del panel lateral, `crossOriginIsolated` es `true` y `SharedArrayBuffer` existe. |
| El worker de Moonshine arranca | Sí | Arranca con sus 8 hilos y transcribe. |
| «Iniciar» segundos después del clic en el icono | Funciona | 1 s después del clic: «Transcribiendo» a los 0,3 s (modelo ya guardado) y primera frase cerrada a los 1,5 s. |
| «Iniciar» tras cambiar de pestaña | Funciona | Con otra pestaña activa en la misma ventana: «Transcribiendo» a los 0,3 s. Se captura la pestaña de la llamada, no la activa. |
| «Iniciar» más de 5 minutos después del clic | Funciona | 339 s después del clic, con el service worker ya parado (lo estaba a los 39 s): «Transcribiendo» a los 0,4 s y primera frase a los 2,7 s. |
| Cerrar el panel descarga su página y termina la captura | Sí | Probado de dos formas: la página se cierra a sí misma, y Chrome cierra el panel lateral (`chrome.sidePanel.close`). En las dos la página desaparece y la captura termina en 0,4 s. La pestaña sigue reproduciendo. Al volver a abrir el panel, la página es nueva, está vacía y captura otra vez. No se ha pulsado la X del panel en una ventana real. |
| Qué queda guardado al cerrar | Solo la pestaña objetivo | `storage.session` contiene la pestaña objetivo (número y título) y `storage.local` está vacío. Nada de texto. |
| Error de una pestaña sin permiso | Ver abajo | Mensajes exactos de Chrome. |
| Error de una página protegida | **No hay error** | La captura empieza. Ver «Decisión: páginas protegidas». |
| El segundo contexto de audio entrega 16 kHz | Sí | La pista capturada llega con 2 canales a 48 000 Hz. El contexto del motor trabaja a 16 000 Hz y entrega 16 004 muestras por segundo, en bloques de 800 muestras (162 de 162). |
| Mezcla bien una pestaña en estéreo | Sí | En la señal mono aparecen los dos tonos con la misma fuerza (0,25 cada uno, la mitad de la original) y nada en otras frecuencias. Es la media de los dos canales. |

**Mensajes exactos de Chrome al pulsar «Iniciar»:**

- Pestaña en la que nunca se hizo clic en el icono, o que después del clic pasó a otro sitio web:
  `Extension has not been invoked for the current page (see activeTab permission). Chrome pages cannot be captured.`
- Pestaña que se cerró después del clic: `Invalid tab specified.`
- Si la pestaña navega dentro del mismo sitio, el permiso se conserva y la captura empieza.
- Un nuevo clic en el icono devuelve el permiso.

**Riesgos del diseño que quedan despejados:** ninguna de las salidas de reserva hace falta. No hay que
capturar en el propio clic del icono, ni usar el aviso de cierre del panel (existe en Chrome 157:
`chrome.sidePanel.onClosed`), ni cambiar la forma de pasar el audio a 16 kHz.

## 1.5 — El modelo y la red

| Punto | Resultado | Detalle |
|---|---|---|
| Moonshine acepta los ficheros guardados por una descarga propia | Sí | Se borró su caché (`moonshine-models-v1`) y la página del panel volvió a guardar los 7 ficheros (51 441 771 bytes) con código propio, con la dirección de cada fichero como clave. «Transcribiendo» a los 0,3 s y ninguna petición fuera de la extensión: Moonshine usó esos ficheros. |
| Durante una captura no hay peticiones de red | Ninguna | Captura de 25 s (5 frases) con el registro de red activo en la página del panel, el service worker, el worker de Moonshine, sus 8 hilos y el procesador de audio: 0 peticiones. |
| Con el modelo guardado arranca sin conexión | Sí | Sin conexión y con el panel recargado: «Transcribiendo» a los 0,4 s y 3 frases en 15 s. Una petición de prueba al servidor del modelo falla desde la página y desde el worker, como debe. |
| Un bloqueo se ve entre el panel y otra página de la extensión | Sí | El panel toma el bloqueo; la otra página lo ve ocupado y se queda esperando. Lo recibe cuando el panel lo suelta. Si la página que lo tiene se cierra, la que esperaba lo recibe. |
| Un canal de avisos se ve entre las dos | Sí | Los mensajes llegan en los dos sentidos. |

Matices:

- La descarga propia de prueba recibió los ficheros de la caché de red de Chrome (0,2 s), no de internet.
  Comprueba que Moonshine acepta lo que guarda nuestro código, no la descarga en sí (eso es la tarea 2.1).
- «Sin conexión» es el modo sin conexión de las herramientas de Chrome, no el Wi-Fi apagado.
- La página de ajustes aún no existe. Como segunda página se usó una página de la extensión abierta en
  una pestaña de otra ventana, que tiene el mismo origen que tendrán los ajustes.
- La extensión compilada solo puede hacer peticiones con `fetch` y `XMLHttpRequest`, que el registro de
  red recoge. No contiene WebSocket, WebRTC ni envíos en segundo plano.

**Riesgos del diseño que quedan despejados:** la descarga propia que guarda en la caché de Moonshine (D3)
y la descarga única compartida con un bloqueo y un canal (D4) funcionan como se diseñaron.

## 1.6 — Audio de referencia

| Punto | Resultado | Detalle |
|---|---|---|
| Audio y lista generados fuera de git | Sí | `npm run prepare:reference` deja en `tools/reference-audio/` el audio (`referencia.wav`, 303,4 s, un canal a 16 kHz) y la lista de palabras (`referencia.json`). La carpeta está en `.gitignore`. |
| Origen | Corpus AMI, reunión ES2002a | Cuatro personas, mezcla de sus micrófonos de diadema. Tramo del segundo 706,0 al 1009,4. El script comprueba la huella (sha256) del audio y de las anotaciones antes de usarlos. |
| Palabras con su instante | 898 | Por persona: 41, 350, 44 y 463. Quedan fuera 21 palabras cortadas a medias. 216 se dicen mientras habla otra persona. |
| El audio y la lista van a la par | Sí, comprobado por script | Se compara, en pasos de 10 ms, dónde dice la lista que se habla con dónde hay sonido: el mejor encaje es sin desfase (correlación 0,48). El script falla si el desfase pasa de 0,3 s. |
| 20 palabras revisadas a oído | No se hace | El usuario lo da por bueno (2026-11-20). Quedan la comprobación automática de la fila anterior y un indicio de la medición: las palabras bien reconocidas casi nunca aparecen en el panel antes del instante en que la lista dice que empiezan (de 0 a 3 por pasada). La página del audio (`npm run serve:reference`) sigue trayendo las 20 palabras por si alguien quiere revisarlas. |

Matiz: los instantes de la lista salen de un alineado automático del corpus, que alarga el final de la
última palabra antes de una pausa. 113 palabras duran más de 0,6 s y 37 más de 1 s. Como el retardo se
cuenta desde el final de la palabra, esas salen favorecidas.

## 1.7 y 1.8 — Retardo con el audio de referencia

**Cómo se mide.** La versión de desarrollo anota la hora a la que aparece cada palabra en el panel, y la
página del audio anota la hora a la que empieza a sonar. `npm run compare:delay` empareja lo escrito con
la lista de referencia. La versión normal no lleva esa lista de palabras: una prueba lo comprueba.

- **Retardo de una palabra:** desde que termina de decirse hasta que aparece en el panel, aunque el motor
  la corrija después (D11).
- **Palabra perdida:** está en la lista y el motor no escribe nada en su lugar.
- **Condiciones:** Chrome sin ventana, captura de pestaña real, modelo Tiny ya guardado y nada más en
  marcha en el ordenador. El arnés apaga el sonido que el panel devuelve a los altavoces; lo que recibe
  el motor no cambia.
- **Reloj comprobado:** lo que captura la extensión es el fichero de referencia (correlación 0,995 a
  0,998, sin deriva) y llega 52 ms después de la hora que anota la página. Las cifras incluyen esos 52 ms.
- **Fallo corregido en la lista de palabras** (`src/dev/word-log.ts`): si llegaban palabras nuevas junto
  a una corrección, una palabra nueva heredaba la hora de la corregida. Corregido, con dos pruebas. La
  pasada hecha antes de corregirlo (77,8 %) no cuenta.

**Resultados con Tiny.** «Intervalo» es cada cuánto vuelve el motor a pasar por el audio; el paquete de
Moonshine trae 0,5 s. Cuando se midió, el objetivo de la spec era el 90 % de las palabras dentro de
1 segundo, y por eso la tabla da ese plazo. Desde el 2026-11-20 el plazo es de 1,5 segundos (ver la
decisión, más abajo).

| Intervalo | Pasada | Dentro de 1 s | Mediana | Percentil 90 | Máximo | Perdidas | Cambios de texto | Procesador |
|---|---|---|---|---|---|---|---|---|
| 0,5 s (el del paquete) | 1 | 88,1 % | 0,62 s | 1,04 s | 18,80 s | 10,8 % | 443 | sin medir |
| 0,5 s | 2 | 88,1 % | 0,59 s | 1,06 s | 18,77 s | 10,9 % | 442 | sin medir |
| 0,5 s | 3 | 85,2 % | 0,62 s | 1,16 s | 18,77 s | 9,7 % | 444 | sin medir |
| 0,5 s | 4 | 88,2 % | 0,60 s | 1,05 s | 7,18 s | 10,6 % | 448 | 0,70 núcleos |
| 0,5 s | 5 (anota también los cierres de línea) | 85,4 % | 0,60 s | 1,14 s | 19,80 s | 10,5 % | 441 | 0,71 núcleos |
| **0,25 s** | 1 | **92,1 %** | 0,49 s | 0,88 s | 18,73 s | 10,2 % | 822 | sin medir |
| **0,25 s** | 2 | **91,9 %** | 0,47 s | 0,89 s | 18,76 s | 10,5 % | 819 | 1,13 núcleos |
| **0,25 s** | 3 | **92,3 %** | 0,49 s | 0,86 s | 20,00 s | 10,6 % | 835 | 1,15 núcleos |
| 0,1 s | 1 | 90,4 % | 0,43 s | 0,95 s | 18,73 s | 9,6 % | 1452 | sin medir |
| 1 s | 1 | 63,5 % | 0,82 s | 1,44 s | 4,74 s | 10,7 % | 264 | sin medir |

- **Procesador:** tiempo de procesador de todos los procesos del Chrome de la prueba (cuenta también la
  página que reproduce el audio), dividido entre lo que dura el audio. El ordenador tiene 8 núcleos.
- **El máximo no es fiable.** Entre el segundo 30 y el 48 la lista no tiene palabras, y el emparejado une
  a veces dos que no tienen que ver (un «Mm-hmm» del segundo 29 con un «The» del 48). Contando solo las
  palabras bien reconocidas, el máximo va de 3,8 a 7,3 s.

**Lo que se ve:**

- Con el intervalo del paquete (0,5 s), Tiny **no llega** al 90 % dentro de 1 s: entre 85,2 y 88,2 % en
  cinco pasadas.
- Con 0,25 s **sí llega** en las tres pasadas (91,9 a 92,3 %). Cuesta 1,6 veces más procesador y el
  texto cambia el doble de veces.
- 0,1 s no mejora a 0,25 s (una sola pasada). 1 s es claramente peor.
- Solo con las palabras bien reconocidas: 87,5 a 91,0 % con 0,5 s y 94,7 a 95,1 % con 0,25 s.
- Contando hasta que la palabra queda escrita como al final, con sus correcciones: 72 a 76 % con 0,5 s y
  83 a 84 % con 0,25 s. No es lo que pide la spec, pero es lo que se nota cuando una palabra cambia.
- **Palabras perdidas: alrededor del 10 %, con cualquier intervalo.** Casi todas se dicen mientras habla
  otra persona: de esas se pierde un tercio (70 a 80 de 216); del resto, entre el 2,2 y el 4,1 %. Es un
  límite de transcribir cuatro voces mezcladas en un solo canal, no del retardo.

**Límites de esta medición:**

- Un ordenador, un tramo de 5 minutos y nada más en marcha. En una llamada real el ordenador carga
  también con la videollamada. Las tareas 5.2 y 5.4 vuelven a medir.
- Los finales alargados de la lista (ver 1.6) favorecen a esas palabras. Contando solo las palabras de
  hasta 0,6 s: 83,5 a 86,9 % con 0,5 s y 90,7 a 91,4 % con 0,25 s.
- Las pasadas se hicieron seguidas en un portátil sin ventilador. Las pasadas 3 y 5 de 0,5 s salieron
  algo peor, sin causa conocida.

## Decisión: cada cuánto actualiza el motor y objetivo de retardo

Con el intervalo que trae Moonshine no se cumplía el objetivo que tenía la spec (1 segundo). El diseño ya
preveía el caso: primero ajustar el intervalo y, si no basta, decidir con el usuario. Opciones:

| Opción | Dentro de 1 s | Coste |
|---|---|---|
| A. Fijar el intervalo en 0,25 s | 91,9 a 92,3 % | 1,6 veces más procesador (de 0,70 a 1,13–1,15 núcleos) y el texto cambia el doble de veces. |
| B. Dejar 0,5 s y bajar el objetivo | 85,2 a 88,2 % | No se cumple el objetivo de 1 segundo: habría que cambiarlo en la spec (BL-16). |
| C. Fijar el intervalo en 0,1 s | 90,4 % (una pasada) | No mejora a 0,25 s, y el procesador que gasta está sin medir. |
| D. 0,25 s, y pasar a 0,5 s cuando el ordenador no dé abasto | Como A | Más trabajo: hay que detectarlo y probarlo. |

**Decidido por el usuario (2026-11-20): la B, con el objetivo en 1,5 segundos.** El código no cambia:
0,5 s es lo que ya lleva la extensión. El objetivo de la spec pasa a ser el 90 % de las palabras dentro
de 1,5 segundos. Con 0,5 s, en las cinco pasadas:

| Plazo | Palabras dentro del plazo |
|---|---|
| 1 s (el objetivo anterior) | 85,2 a 88,2 % |
| 1,25 s | 91,1 a 93,9 % |
| **1,5 s (el objetivo nuevo)** | **93,5 a 95,3 %** |
| 2 s (BL-16) | 95,9 a 97,3 % |

- Se vuelve a medir con la extensión terminada (tarea 5.2) y en una llamada real (5.4).
- El intervalo de 0,25 s queda como recambio (BL-47). Los otros objetivos que no se eligieron están en
  BL-16.
- `npm run compare:delay` da ya el porcentaje dentro de 1,5 s.

## Decisión: páginas protegidas

La spec dice que en una página interna de Chrome o de su tienda el panel avisa de que no se puede
transcribir y no se inicia ninguna captura. Lo observado es distinto:

- Tras el clic en el icono en `chrome://version`, `chrome://extensions`, `chrome://newtab` y `about:blank`,
  «Iniciar» **sí empieza la captura** y Chrome no da ningún error.
- La extensión no recibe ni el título ni la dirección de esas pestañas, y el panel muestra «sin título».
- La tienda de extensiones no se pudo probar: el perfil temporal acaba en la página de consentimiento de
  Google.
- Está visto con el clic simulado. Falta repetirlo una vez con un clic real.

**Decidido por el usuario (2026-11-20):** si en el clic en el icono la extensión no recibe la dirección de
la pestaña, el panel avisa de que esa página no se puede transcribir y no captura. No se pide ningún
permiso nuevo. La spec no cambia (el escenario «Página protegida del navegador» ya dice eso); el diseño lo
recoge en D7 y se construye en la tarea 3.4. Las opciones que no se eligieron están en BL-48.

## Dato para `traduccion-en-vivo`: cuándo se cierra cada línea

El usuario propone traducir cuando una línea pasa de provisional a definitiva (el salto de línea). La
pasada 5 anotó la hora de cada cierre:

| Dato | Valor |
|---|---|
| Líneas cerradas en los 5 minutos | 89 |
| Palabras por línea | mediana 6, percentil 90 22, máximo 33 |
| Del fin de la última palabra dicha al cierre | mediana 0,43 s, percentil 90 0,9 s, máximo 1,76 s |
| Tiempo que una línea está abierta | mediana 1,67 s, percentil 90 5,5 s, máximo 9,5 s |
| Líneas abiertas más de 2 s | 39 de 89, con el 80 % de las palabras |
| Palabras corregidas después de aparecer | 260 de 844 (31 %) |
| Líneas en las que el cierre cambia algo del texto | 61 de 89 |
| Traduciendo solo al cerrar: de la palabra dicha al cierre de su línea | mediana 2,4 s, percentil 90 5,3 s; el 42 % dentro de 2 s y el 93 % dentro de 6 s |

- Una línea es un tramo entre pausas, no una frase: hay frases partidas en dos o tres líneas y líneas con
  varias frases.
- Es una sola pasada, con una reunión de cuatro personas. En una llamada entre dos, o con una sola voz,
  las líneas pueden ser distintas: está sin medir.
- No se ha medido cómo traduce Chrome un trozo de frase.
- Sin decisión: se toma en el change `traduccion-en-vivo`.

## 2.2 — Descarga compartida entre dos páginas

Fecha: 2026-11-22. El mismo Chrome sin ventana, con un perfil temporal vacío y la extensión compilada. Las
dos páginas son el panel lateral y una página de la extensión abierta en una pestaña de otra ventana (la
de ajustes aún no existe; tendrá el mismo origen). Cada una pide Tiny al módulo `src/model/shared.ts`. Las
peticiones al servidor del modelo se cuentan con el registro de red de cada página. En los tres últimos
casos la descarga va frenada a 4 MB/s, para poder actuar a mitad.

| Caso | Resultado | Detalle |
|---|---|---|
| Las dos piden Tiny a la vez | Una sola descarga | La primera hace las 7 peticiones y termina en 8,5 s. La segunda espera con el bloqueo pendiente, no hace ninguna petición, muestra los 1 246 avisos de progreso de la primera (nunca hacia atrás) y termina en 8,7 s. Quedan los 7 ficheros (51 441 771 bytes) y ningún bloqueo. |
| Cancela la que espera | Se detienen las dos | Las dos terminan como canceladas 8 ms después. La que descargaba había pedido 3 ficheros: quedan guardados los 2 completos (2 607 208 bytes) y el modelo no cuenta como descargado. |
| Cancela la que descarga | Se detienen las dos | En 1 ms. La que esperaba no toma el relevo: ninguna petición. |
| Se cierra la que descarga | La otra continúa | La que esperaba recibe el bloqueo, pide solo los 5 ficheros que faltan y termina. Quedan los 7 ficheros y ningún bloqueo. |

Matices:

- Se ha probado llamando al módulo desde las dos páginas, con milisegundos de diferencia. Los botones
  «Descargar ahora» e «Iniciar» todavía no lo usan (tareas 2.4 y 4.2): con ellos se repite en la 4.2.
- Al cerrarse la página que descarga, el progreso de la otra retrocede una vez, hasta el último fichero
  completo. El fichero que iba a medias se pierde y se baja de nuevo.
- **Para las tareas 2.4 y 4.2:** llega un aviso de progreso por cada trozo recibido. Sin freno fueron unos
  146 por segundo. Con la red frenada los trozos son más pequeños y llegaron entre 1 750 y 2 000 por
  segundo. La interfaz no debe repintar con cada aviso.
- Tras una descarga compartida, cada página recibe dos avisos de que lo guardado ha cambiado, uno por cada
  página que termina. El segundo solo provoca una lectura de más.
- Cada caso se ha ejecutado una vez. Las 23 pruebas automáticas de `src/model/shared.test.ts` cubren estos
  casos y sus variantes con bloqueo, canal, red y caché simulados.

## 3.1 — El adaptador del motor

Fecha: 2026-11-22. Chrome 157.0.8103.80 sin ventana, con una copia de un perfil que ya tiene Tiny guardado.
No se descarga nada. Dos montajes:

- **Laboratorio:** una página de la extensión habla directamente con el worker de Moonshine y le entrega
  el audio de referencia (1.6) en bloques de 50 ms, a ritmo real. De aquí salen los eventos que usan las
  pruebas (`src/engine/moonshine/recorded-run.json`).
- **Panel:** la extensión compilada, con «Iniciar» y «Detener» pulsados en el panel lateral y las ocho
  frases sintéticas sonando en la pestaña.

**Cómo se comporta Moonshine (laboratorio):**

| Punto | Resultado | Detalle |
|---|---|---|
| Identificador de cada línea | No se repite dentro de un worker | Cada worker parte de un número aleatorio de 64 bits y suma uno por línea (31 líneas en 5 workers). La primera línea de la captura lleva el número siguiente al de la línea del calentamiento. |
| Eventos de 24,5 s de audio | 71 | 10 líneas. El adaptador los convierte en 37 avisos de texto: no escucha `onLineUpdated`, que llega también cuando solo cambia la duración. |
| Worker terminado a los 8 s | No da ningún error | La entrega de audio no falla, el audio sin recoger crece (18 s al acabar) y la orden de detener no recibe respuesta (se esperaron 20 s). Con esa traza, el adaptador avisa del fallo entre 15,0 y 15,1 s después. |
| Cuánto tarda el calentamiento | 71 a 132 ms | 12 pasadas. La primera de un Chrome recién abierto tardó 251 ms. La carga del modelo, 193 a 303 ms. |
| Retraso del primer texto sin calentamiento | 0,08 a 0,13 s | 6 pasadas con tres tramos del audio. Es el tiempo entre que se entrega el audio de la primera línea y llega su texto. |
| Retraso del primer texto con calentamiento | 0,04 a 0,09 s | 10 pasadas con los mismos tramos. |
| Reconocimiento de los primeros segundos | Cambia | Con calentamiento, el audio de referencia empieza con una línea «And?» donde la reunión dice «Um»; sin él no hay texto hasta el segundo 4,5. La siguiente línea es «You can't.» con calentamiento y «Here we go.» sin él (la reunión dice «right okay»). Ninguna de las dos es mejor. |

**Con el panel de la extensión compilada:**

| Caso | Resultado | Detalle |
|---|---|---|
| Captura normal | Bien | «Transcribiendo» entre 0,4 y 0,7 s después de «Iniciar» (3,2 s en el primer arranque de ese Chrome). El panel lee `warm-up.wav` de la propia extensión. El worker recibe, en este orden: la carga, la transcripción de calentamiento entera y la de la pestaña. El texto del calentamiento no aparece en el panel. «Detener» tarda 0,1 s, la línea abierta sale como definitiva y el worker desaparece. |
| El worker muere a mitad de la captura | Detectado a los 15,1 s | 15 063 y 15 148 ms en dos pasadas, con la llamada en silencio desde ese momento. El panel muestra «El motor de transcripción ha fallado. El texto se conserva; pulsa «Iniciar» para seguir.», el texto sigue ahí e «Iniciar» queda disponible. |
| «Iniciar» después del fallo | Bien | Worker nuevo y calentamiento de nuevo. El texto anterior queda encima y el mensaje se borra. |
| El worker se queda colgado y se pulsa «Detener» | Se libera a los 15,0 s | El panel está en «Deteniendo…», con el botón deshabilitado, 15 022 y 15 027 ms en dos pasadas. Después vuelve a «Iniciar» con el texto intacto y **sin ningún mensaje**. El worker colgado gastaba un núcleo entero (3,03 s de procesador en 3 s); después, 0,04 s en 3 s, y desaparece a los 4,1 s. |

Matices:

- **El retraso de ≈ 1,6 s en la primera frase que recogía el diseño no aparece.** Con Tiny, el
  calentamiento adelanta el primer texto 0,1 s como mucho, a cambio de 0,07 a 0,25 s más en «Preparando» y
  de un reconocimiento distinto de los primeros segundos. Con Small y Medium está sin medir: ese día el
  servidor del modelo no contestaba. Se vuelve a mirar en la tarea 5.2 (BL-51).
- Que el panel espere 15 s en «Deteniendo…» y no diga nada cuando el motor ya no responde es
  comportamiento del panel, no del adaptador. Está apuntado en BL-52.
- En una primera pasada el worker se colgó con un bucle lanzado desde el depurador, y 10 s después de
  «Detener» seguía figurando. Colgado desde una tarea normal del propio worker, desaparece: era un efecto
  de la forma de colgarlo.
- La carga del modelo no tiene límite de tiempo propio mientras sea el paquete quien lo descarga (BL-50).
- Todo es con Chrome sin ventana y voz sintética; nadie ha escuchado el audio. Cada caso del panel se ha
  ejecutado una o dos veces.
- Pruebas automáticas: 75 en `src/engine/` y `tools/prepare-warm-up.test.mjs`, con un worker y un reloj
  simulados y con los eventos reales guardados, y 3 sobre la extensión compilada. Para comprobar que
  detectan errores se cambió el código de 80 formas distintas, una cada vez: las 80 hicieron fallar alguna
  prueba.

## 3.2 — La pestaña objetivo

Fecha: 2026-11-23. Chrome 157.0.8103.80 sin ventana, la extensión compilada y un perfil que ya tiene Tiny
guardado. No se descarga nada. El clic en el icono es el del protocolo de depuración
(`Extensions.triggerAction`). Dos pasadas, con el mismo resultado.

| Caso | Resultado | Detalle |
|---|---|---|
| Panel abierto sin clic en el icono | Pide el clic | «Haz clic en el icono de TRANSLATOR en la pestaña de la llamada.» e «Iniciar» desactivado. Visto con la página del panel abierta como pestaña: Chrome no deja que la extensión abra el panel lateral sin un gesto. |
| Primer clic en el icono | Muestra el título | «Pestaña: Llamada de prueba 3.2» e «Iniciar» activado. Solo se guardan el número de la pestaña y su título. |
| Más clics en la misma pestaña | El panel no se cierra | Tres clics con esperas de 1 a 2,5 s entre uno y otro y, en la segunda pasada, un doble clic sin espera. Es la misma página del panel, sin recargar, y hay un solo panel lateral. Chrome avisó de una apertura del panel y de ningún cierre en toda la pasada. |
| Clic desde otra pestaña, sin captura | Muestra la otra | Con otro clic en la de la llamada, vuelve a ella. |
| Clic desde otra pestaña con una captura en marcha | El panel no cambia | Dos clics. Sigue «Transcribiendo» con el título de la llamada, Chrome solo tiene capturada la pestaña de la llamada y siguen llegando frases (de 1 a 3 definitivas en 9 s). |
| «Detener» después | Muestra la otra pestaña | La del último clic. El texto se conserva y no queda ninguna captura. |
| «Iniciar» que falla, con un clic desde otra pestaña mientras dice «Preparando…» | Muestra la del último clic | La pestaña objetivo se había cerrado. Mientras prepara, el panel no cambia; al fallar, a los 0,4 s, dice «No se ha podido empezar: Invalid tab specified.» |

Matices:

- Falta el clic con el ratón en un Chrome con ventana y abrir el panel desde el menú de Chrome: están en
  la lista de abajo.
- Si se cierra la pestaña objetivo, el panel sigue mostrando su título hasta el siguiente clic, y el aviso
  es el de Chrome, en inglés. Es de la tarea 3.4.
- El título es el del momento del clic. Si la página lo cambia después, el panel no se entera hasta el
  siguiente clic (visto en la segunda pasada; BL-54).
- Pruebas automáticas: 23 en `src/panel/target-tab.test.ts`, con el navegador simulado y el service worker
  de verdad. Para comprobar que detectan errores se cambió el código de 28 formas distintas, una cada vez:
  las 28 hicieron fallar alguna prueba.

## Pendiente en un Chrome con ventana

1. Cerrar el panel con su X durante una captura: el indicador de captura de la pestaña desaparece y el
   vídeo sigue sonando.
2. Clic en el icono e «Iniciar» en `chrome://extensions` y en la tienda de extensiones: qué ocurre.
3. Arrancar con el Wi-Fi apagado (entra en la tarea 4.2).
4. Dos clics seguidos con el ratón en el icono: el panel sigue abierto (tarea 3.2).
5. Abrir el panel desde el menú de paneles laterales de Chrome, sin clic en el icono: pide hacer clic en
   el icono (tarea 3.2).
