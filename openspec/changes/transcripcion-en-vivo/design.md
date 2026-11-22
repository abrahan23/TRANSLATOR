# Design

## Context

El repositorio solo tiene el andamiaje de OpenSpec y el backlog; no hay código. La motivación está en
`proposal.md` (apartado «Why») y las decisiones de producto ya cerradas (B1 a B13), en la tabla de
`BACKLOG.md`. Este documento explica cómo se construye lo que piden las tres specs del change.

**Entorno comprobado el 2026-11-19.** MacBook Air M1 (8 núcleos, 16 GB de memoria), Node v22.23.1, npm
10.9.8 y Chrome 157. Versiones publicadas en npm ese día: `wxt` 0.21.5, `@wxt-dev/module-react` 1.2.2,
`vitest` 5.1.1 y `@moonshine-ai/moonshine-wasm` 0.1.6.

**Lo que impone Chrome** (documentación oficial de `tabCapture`, `sidePanel` y `activeTab` y guía de captura,
en developer.chrome.com):

- Una extensión solo puede capturar una pestaña en la que el usuario la ha invocado. El clic en el icono
  concede ese permiso (`activeTab`), que dura mientras la pestaña siga en el mismo sitio y se pierde al navegar
  a otro sitio o cerrarla.
- El identificador con el que se abre la captura es de un solo uso y caduca en segundos. Desde Chrome 116
  puede usarlo cualquier página de la extensión que esté en el mismo proceso que la que lo pidió. La
  documentación no menciona el panel lateral.
- Mientras una pestaña se captura, Chrome deja de reproducir su audio al usuario. La extensión tiene que
  volver a reproducirlo.
- La captura se mantiene cuando la pestaña navega y termina cuando la pestaña se cierra.
- El panel lateral es una página de la extensión con acceso a todas las API de extensiones. Abrirlo por código
  (`sidePanel.open`, Chrome 116 o posterior) exige un gesto del usuario. La documentación no dice qué pasa con
  su página cuando el usuario lo cierra.
- Una página de extensión puede descargar ficheros de otro dominio sin declarar permiso sobre él si el
  servidor lo admite. El de Moonshine lo admite (cabecera `access-control-allow-origin: *`, comprobada el
  2026-11-19).

**Lo que impone Moonshine** (paquete 0.1.6: código leído y pruebas hechas en este ordenador el 2026-11-19):

- Funciona con WebAssembly y varios hilos. La página que lo carga tiene que estar aislada de otros orígenes,
  lo que en una extensión se consigue con dos claves del manifest.
- El paquete publicado no arranca en una extensión: en dos puntos crea funciones a partir de texto, y Chrome
  lo prohíbe en las extensiones. Con esos dos puntos sustituidos por funciones normales sí arranca (probado).
- Trae un worker propio (`SttWorkerHost`) que saca el reconocimiento del hilo de la página. Todas las medidas
  se hicieron con él.
- Cada modelo en inglés son 7 ficheros en `download.moonshine.ai`. El paquete los guarda en el navegador
  (Cache Storage), en una caché llamada `moonshine-models-v1`, con la dirección de cada fichero como clave. Al
  cargar un modelo busca ahí primero y solo descarga lo que falta.
- La descarga del paquete no se puede cancelar, y para saber qué hay guardado hay que arrancar el motor.
- Solo publica modelos de transcripción en vivo para el inglés.
- Entrega el texto por líneas (una línea es un tramo de habla entre pausas): avisa cuando una línea empieza,
  cada vez que cambia y cuando se cierra. No da el instante de cada palabra, salvo que se cargue un fichero
  más por modelo (D11).
- Si no se le hace trabajar antes, la primera frase tras cargar el modelo llega tarde (≈ 1,6 s).
- Si le llega audio después de detenerlo, da un error.

**Lo ya medido** en este ordenador, con audio sintético de 8 frases entregado directamente al motor. Ese
audio no pasó por la captura de una pestaña ni era de una llamada real:

| Tamaño | Descarga | Palabra en pantalla (mediana) | Palabras en ≤ 1 s | Procesador | Carga ya guardado | Primera carga |
|---|---|---|---|---|---|---|
| Tiny | 51 MB | 154 a 185 ms | 100 % | 55 % de un núcleo | 0,2 s | 8 a 9 s |
| Small | 165 MB | 367 ms | 93 % | 136 % | 0,4 s | 18 s |
| Medium | 305 MB | 373 ms | 87 % | 177 % | 0,8 s | 32 s |

Con Tiny el motor ocupó entre 0,5 y 0,9 GB de memoria.

## Goals / Non-Goals

**Goals:**

- El menor número de piezas entre el audio de la pestaña y el texto en pantalla, porque cada salto añade
  retardo y puntos de fallo.
- Durante una captura no hay ninguna petición de red. La extensión solo sale a internet para descargar el
  modelo.
- Se entrega lo que se probó: Moonshine se usa con los mismos ficheros y el mismo worker con los que se midió.
- Cambiar de motor supone escribir un adaptador, no tocar la captura ni el panel. El motor no depende de las
  API de extensiones, para que sirva también a la app de escritorio (BL-01).
- La vida de la captura va ligada al panel visible: si no se ve el aviso, no se captura.
- La lógica que se puede equivocar (texto provisional y definitivo, estado del panel, cálculo del retardo,
  descarga del modelo, ajustes) vive en módulos sin interfaz, que se prueban de forma automática.
- La extensión pide solo los permisos que usa.

**Non-Goals:**

- Elegir motor en tiempo de ejecución. La extensión sale solo con Moonshine.
- Que la extensión elija sola el tamaño del modelo (BL-35).
- Reanudar una descarga por donde iba. Al reintentar se conservan los ficheros completos y se vuelve a bajar
  entero el que quedó a medias.
- Borrar un modelo descargado desde los ajustes para liberar espacio.
- Mantener el modelo cargado en memoria entre una captura y la siguiente.
- Pruebas automáticas de extremo a extremo de la captura. Requieren un clic real en el icono de la barra de
  Chrome; se cubren con una lista de comprobación manual.
- Librerías de componentes, de estado o de traducción de la interfaz. El panel es pequeño y solo está en
  español.
- Estructura de monorepo pensando en la app de escritorio (BL-01).
- TechDocs de Backstage. TRANSLATOR no lo lleva (decidido por el usuario el 2026-11-19).

## Decisions

### D1 — Moonshine se copia a la extensión tal como se publicó, con el parche, y no pasa por el empaquetador

- `@moonshine-ai/moonshine-wasm` se instala con la versión exacta 0.1.6. Del paquete instalado salen los tipos
  de TypeScript y los ficheros que se copian.
- Un paso del build (`scripts/prepare-moonshine.mjs`), que se ejecuta antes de `wxt dev` y de `wxt build`,
  copia la carpeta `dist/` del paquete a `public/moonshine/` y escribe ahí la copia parcheada de
  `moonshine.mjs`. Esa carpeta es generada y queda fuera de git.
- El parche sustituye exactamente dos fragmentos. El build falla si alguno no aparece una sola vez o si,
  después de aplicarlo, queda en el fichero alguna función creada a partir de texto. Así un cambio de versión
  del paquete no pasa desapercibido.
- La extensión carga Moonshine en tiempo de ejecución, desde su propia dirección
  (`chrome-extension://…/moonshine/`). El empaquetador no lo toca.
- El manifest lleva las dos claves de aislamiento (`cross_origin_embedder_policy` con `require-corp` y
  `cross_origin_opener_policy` con `same-origin`) y permite WebAssembly en la política de contenido
  (`'wasm-unsafe-eval'`).

Es la disposición con la que se hicieron las pruebas. El paquete localiza su worker y su fichero `.wasm` a
partir de la dirección de sus propios ficheros, y un empaquetador puede romper esa relación.

**Alternativas consideradas:**

- *Dejar que el empaquetador procese el paquete.* Sin probar, y con el riesgo anterior.
- *Compilar Moonshine desde el código fuente con la opción que evita el problema* (BL-32). Queda como prueba
  acotada, fuera de este change.
- *Ejecutarlo en una página `sandbox`* (BL-33) o *pedir a Moonshine un paquete compatible* (BL-34).

### D2 — El motor queda detrás de una interfaz propia con el texto ya normalizado

```ts
type ModelSize = 'tiny' | 'small' | 'medium';

interface TranscriptionEngine {
  /** Carga el modelo ya descargado y lo deja listo para la primera frase. No usa la red. */
  load(size: ModelSize): Promise<void>;
  /** Empieza una transcripción. Los eventos llegan por `onEvent`. */
  start(onEvent: (event: EngineEvent) => void): Promise<void>;
  /** Audio mono a 16 kHz. No espera al motor. */
  pushAudio(samples: Float32Array): void;
  /** Segundos de audio entregados que el motor todavía no ha procesado. */
  pendingSeconds(): number;
  /** Cierra lo que quede abierto, avisa con `closed` y libera el modelo. */
  stop(): Promise<void>;
}

type EngineEvent =
  | { type: 'text'; final: Fragment[]; provisional: Fragment[] }
  | { type: 'closed'; reason: 'requested' | 'failed' };

interface Fragment {
  id: string;           // el mismo mientras el fragmento sigue abierto
  text: string;
  audioEndSec: number;  // hasta qué segundo del audio entregado llega
}
```

En cada evento de texto, `final` trae fragmentos nuevos que se añaden y ya no cambian, y `provisional` trae
todos los que siguen abiertos, que sustituyen a los anteriores. Con esa regla el panel no puede duplicar un
fragmento ni modificar texto definitivo, que es lo que exige la spec.

El adaptador de Moonshine (`src/engine/moonshine/`) traduce las líneas a esa forma: una línea abierta es un
fragmento provisional y una línea cerrada es uno definitivo. Al detener, lo que siga abierto sale como
definitivo. Antes de detener el motor corta la entrada de audio.

El adaptador usa el worker que trae el paquete (`SttWorkerHost`), porque es con el que se midió. Da el motor
por caído, con el motivo `failed`, en tres casos: Moonshine avisa de un error, una llamada al worker falla, o
pasan 15 segundos sin que el worker complete ningún trabajo mientras se le entrega audio. El valor de 15
segundos es inicial y se ajusta al probar.

El identificador de cada fragmento es lo que usará `traduccion-en-vivo` para colocar cada traducción junto a
su original.

**Alternativas consideradas:**

- *Usar la API de Moonshine directamente desde el panel.* Ata el panel a Moonshine; el motor de la app de
  escritorio será otro.
- *Un worker propio que cargue el modelo desde memoria.* Quita la dependencia del nombre de la caché (D3),
  pero obliga a reescribir el bucle del worker, que es justo lo que se midió.

### D3 — La descarga del modelo la hace un módulo propio, que guarda los ficheros donde Moonshine los busca

Un módulo propio (`src/model/`) se encarga de todo lo que las specs piden del modelo antes de transcribir:

- **Tabla fija de los tres tamaños:** los 7 ficheros de cada uno, con su dirección y su tamaño en bytes.
  Las direcciones salen del catálogo del paquete 0.1.6 y los tamaños se comprobaron contra el servidor el
  2026-11-19: suman 51.441.771, 165.489.086 y 304.690.919 bytes, lo mismo que se midió en las pruebas.
- **Descarga:** baja los ficheros uno a uno. Como conoce el total, enseña cuánto lleva descargado. Se puede
  cancelar en cualquier momento.
- **Guardado:** cada fichero se guarda solo cuando ha llegado entero y con el tamaño esperado, en la caché
  que usa Moonshine (`moonshine-models-v1`) y con su dirección como clave.
- **Estado:** un tamaño está «descargado» cuando sus 7 ficheros están en esa caché. Es lo que consultan los
  ajustes y el panel, así que siempre refleja lo que hay guardado de verdad.
- **«Volver a descargar»:** borra los ficheros de ese tamaño y los baja otra vez.

Para transcribir, el adaptador pide a Moonshine que cargue el modelo por las direcciones de sus ficheros.
Moonshine los encuentra todos en su caché y no hace ninguna petición de red.

Motivos: la descarga de Moonshine no se puede cancelar; los ajustes tendrían que arrancar el motor entero
(13 MB de WebAssembly y de 0,5 a 0,9 GB de memoria) solo para descargar o para saber qué hay guardado; y un
modelo a medias no puede darse por bueno, cosa que con una descarga propia se cumple por construcción.

El coste es depender de un detalle interno de Moonshine: el nombre de su caché. Lo cubren la versión fijada
y una prueba automática que comprueba que el paquete instalado sigue usando ese nombre y esas direcciones.

Solo dos módulos conocen Moonshine: este y el adaptador del motor.

**Alternativa considerada:** usar la descarga de Moonshine dentro del worker y cancelar terminando el worker.
Menos código nuestro, pero con los tres inconvenientes anteriores. Es la salida si la carga desde la caché no
se comporta como se espera.

### D4 — Una sola descarga por tamaño, compartida entre el panel y los ajustes

La descarga puede pedirse desde el panel («Iniciar») o desde los ajustes («Descargar ahora»), que son dos
páginas distintas. Se coordinan con dos mecanismos del navegador que comparten todas las páginas de la
extensión:

- **Un bloqueo por tamaño** (Web Locks). La página que lo consigue descarga; la otra espera.
- **Un canal de avisos** (BroadcastChannel). La página que descarga publica el progreso, y la otra lo muestra
  como si la descarga fuera suya. «Cancelar» en cualquiera de las dos la detiene para ambas.

Cuando la página que espera consigue el bloqueo, mira otra vez qué hay guardado. Si el modelo está completo,
sigue adelante; si no, continúa ella la descarga. Así, cerrar la página que descargaba no deja a la otra
esperando para siempre: el navegador libera el bloqueo solo.

**Alternativas consideradas:**

- *Descargar en el service worker.* Chrome puede detenerlo en mitad de una descarga larga.
- *Descargar en un documento en segundo plano («offscreen»).* Una pieza y un permiso más.

### D5 — Al pulsar «Iniciar»: primero el modelo, después el motor y al final la captura

1. El panel comprueba que hay pestaña objetivo, que no es una página protegida (D7) y que no hay otra
   captura en marcha (D13).
2. Si el modelo del tamaño elegido no está guardado, lo descarga (D3 y D4). El panel muestra el progreso y
   «Cancelar».
3. Carga el motor y le pasa una frase corta de calentamiento, cuyo texto se descarta. El panel muestra
   «Preparando».
4. Pide la captura de la pestaña y conecta el audio (D8).
5. El panel pasa a «Transcribiendo».

La spec prohíbe capturar audio mientras dura la descarga. Cargar el motor antes de capturar evita que los
primeros segundos de la llamada se pierdan o se acumulen sin procesar. Con el modelo ya guardado, la carga
tarda entre 0,2 y 0,8 segundos según el tamaño; el calentamiento no se ha medido por separado.

Si en el paso 4 Chrome rechaza la captura, el motor se libera y el panel lo explica, como pide la spec de
captura. Eso incluye el caso de que la pestaña haya perdido el permiso durante una descarga larga.

**Alternativa considerada:** capturar primero y cargar el motor después. El panel pasaría antes a
«Transcribiendo», pero el texto empezaría con retraso, y durante una descarga no está permitido.

### D6 — La captura, el motor y el texto viven en la página del panel lateral

La página del panel hace todo: pide la captura, reproduce el audio, lo entrega al motor y pinta el texto. El
service worker solo abre el panel y anota la pestaña objetivo.

```
Icono ── clic ──▶ service worker ── abre el panel y anota la pestaña objetivo
                                        │
Panel lateral (página de la extensión) ◀┘
  ├─ interfaz ◀── estado del panel ◀── eventos del motor
  ├─ modelo: ¿está guardado? ── si falta ──▶ descarga (única salida a internet)
  ├─ captura: pestaña ──▶ altavoces del usuario
  │                  └──▶ bloques de audio a 16 kHz ──▶ motor
  └─ motor (interfaz propia) ──▶ worker de Moonshine ──▶ texto

Ajustes (página de la extensión): tamaño elegido, qué hay descargado y «Descargar ahora»
  └─ comparte con el panel el almacenamiento, la caché de modelos, los bloqueos y el canal de avisos
```

Motivos:

- Es lo que menos piezas tiene: el texto va del worker a la pantalla sin pasar por mensajes entre partes de
  la extensión.
- Cerrar el panel termina la captura y para el modelo sin código adicional que pueda fallar: al descargarse
  la página desaparecen la captura y el worker. Es lo que piden las specs.
- La documentación lo respalda: una página de extensión puede obtener la captura directamente, y el panel es
  una página de extensión.

La captura, el audio, el motor y la descarga son módulos de TypeScript sin React. Si más adelante se quiere
seguir transcribiendo con el panel cerrado (BL-22), se trasladan a otro documento sin reescribirlos.

**Alternativas consideradas:**

- *Documento en segundo plano («offscreen»).* Es el patrón que documenta Chrome para grabar. Sobrevive al
  cierre del panel, pero ese documento solo tiene la API de mensajes: cada fragmento de texto tendría que
  viajar por mensajes hasta el panel, y habría captura sin aviso a la vista (BL-22). Es el plan B si el panel
  lateral no admite el aislamiento que necesita Moonshine (ver riesgos).
- *Script inyectado en la página de la llamada.* Depende de cómo esté hecha cada aplicación de llamadas y
  exige permiso sobre esos sitios.

### D7 — El clic en el icono abre el panel y fija la pestaña objetivo; «Iniciar» empieza la captura

- El service worker escucha el clic en el icono. En la misma respuesta al gesto abre el panel para esa ventana
  y guarda en el almacenamiento de sesión de la extensión el identificador y el título de la pestaña.
- El panel es global: sigue abierto al cambiar de pestaña.
- El panel lee la pestaña objetivo y la muestra. Mientras hay una captura activa ignora los cambios de
  objetivo; al terminar muestra el último.
- «Iniciar» pide la captura de esa pestaña desde la página del panel.
- Si el panel se abrió desde el menú de Chrome y no desde el icono, no hay pestaña objetivo: el panel pide
  hacer clic en el icono desde la pestaña de la llamada. Es el mismo mensaje que cuando Chrome rechaza la
  captura porque la pestaña cambió de sitio y perdió el permiso.
- Página protegida (una página interna de Chrome). Chrome no rechaza su captura: la empieza sin dar error
  (tarea 1.4). Lo que la distingue es que, en el clic en el icono, la extensión no recibe ni su dirección ni
  su título. El service worker anota entonces la pestaña objetivo como protegida, y «Iniciar» muestra el
  mensaje de la spec sin pedir la captura. No hace falta ningún permiso nuevo. Decidido con el usuario el
  2026-11-20.

**Alternativas consideradas:**

- *Pedir el permiso `tabs` para conocer siempre la dirección de la pestaña, o quitar de la spec el escenario
  de la página protegida.* No elegidas (BL-48).
- *Dejar que Chrome abra el panel con el clic (`openPanelOnActionClick`).* Según la documentación el clic
  alterna el panel: un segundo clic lo cerraría y con él la captura.
- *Empezar a capturar con el propio clic en el icono.* Es lo más seguro frente al permiso, pero la captura
  empezaría sin que el usuario haya visto el aviso, y antes de tener el modelo. Es el plan B si el primer
  experimento de captura demuestra que «Iniciar» no puede abrir la captura; obligaría a cambiar los
  escenarios de inicio de la spec (BL-27).

### D8 — El audio se reproduce tal cual y el motor recibe una copia a 16 kHz, mono, en bloques de 50 ms

De la captura salen dos caminos independientes:

- **Lo que oye el usuario:** el audio capturado se conecta a la salida a su frecuencia original, sin tocar.
- **Lo que va al motor:** un segundo contexto de audio a 16 kHz lo recibe ya remuestreado y mezclado a un
  canal. Un procesador de audio (worklet) lo agrupa en bloques de 50 ms, que la página entrega al motor.

Separar los dos caminos evita que la conversión para el motor degrade lo que oye el usuario. Los 16 kHz y los
bloques de 50 ms son los valores con los que se midió. Un bloque de 50 ms añade como mucho 50 ms de retardo.

El worklet es un fichero de JavaScript plano en `public/`, como el de las pruebas. La mezcla a un canal la
hace el navegador; en las pruebas el audio ya era de un canal, así que con una pestaña en estéreo está sin
comprobar.

**Alternativa considerada:** un solo contexto de audio y remuestreo propio en el worklet. Más código nuestro
en el punto más delicado. Es la salida si el primer experimento muestra que el remuestreo del navegador no
sirve.

### D9 — Fin de la captura

| Qué ocurre | Cómo se detecta | Resultado |
|---|---|---|
| El usuario pulsa «Detener» | Acción del panel | Se corta el audio, el motor cierra lo abierto y se libera, y se cierran la captura y los contextos de audio |
| Se cierra el panel | La página se descarga | Lo mismo: la captura y el worker desaparecen con la página, y además se cierran de forma explícita |
| Se cierra la pestaña capturada | La captura termina sola y Chrome avisa del cierre de la pestaña | Fin, con el motivo «la pestaña se cerró» |
| La pestaña navega | No se detecta: la captura sigue | Ninguno |
| El motor falla | Motivo de cierre `failed` (D2) | Fin, con el texto conservado y «Iniciar» disponible. No se reintenta solo |
| El ordenador no da abasto | Regla de retardo (D11) | Solo un aviso. La captura sigue |

Al terminar por cualquier motivo, el texto provisional que quede pasa a definitivo y el worker de Moonshine se
termina, de modo que el modelo deja de ocupar memoria y procesador. La siguiente captura vuelve a cargarlo
(menos de 1 segundo, más el calentamiento).

**Alternativa considerada:** dejar el modelo cargado entre capturas. El reinicio sería inmediato, a cambio de
tener ocupados entre 0,5 y 0,9 GB de memoria (con Tiny) sin estar transcribiendo.

### D10 — Un único estado del panel, calculado por una función pura

El panel pasa por estos estados: listo, descargando el modelo, preparando, transcribiendo y, de vuelta, listo
con el motivo del fin (detenido, pestaña cerrada, fallo del motor, descarga cancelada o fallida, modelo que no
arranca, pestaña que no se puede capturar). Las transiciones y el texto (definitivo, provisional, separadores
entre capturas, «Limpiar») los calcula una función pura a partir de los eventos. React solo pinta ese estado.

El texto vive en la memoria de la página y en ningún otro sitio: no se guarda, no se envía y no se escribe en
registros. Al cerrar el panel desaparece, como pide la spec.

**Alternativa considerada:** una librería de estado. No aporta nada con una sola pantalla.

### D11 — El retardo: una estimación siempre activa y una medición de comprobación

Moonshine no da el instante de cada palabra, así que hay dos medidas distintas.

**Estimación en vivo.** Es la que enseña el detalle de diagnóstico y la que dispara el aviso de que el
ordenador no da abasto. Sale del reloj del audio: la página anota cuándo recibe cada bloque.

- En cada actualización de texto: el instante en que se pinta, menos el instante en que llegó el final del
  audio que esa actualización cubre (`audioEndSec`).
- Entre actualizaciones: los segundos de audio que el motor tiene pendientes (`pendingSeconds`). Así hay
  cifra aunque el motor se atasque y no entregue texto.
- El detalle muestra la mediana de la sesión (el valor habitual) y el máximo (el peor). Se reinicia en cada
  captura y solo existe en memoria.
- El aviso aparece cuando el mayor de los dos valores anteriores pasa de 3 segundos durante 10 segundos
  seguidos, y se retira al bajar de 3. La regla es una función pura.

Esta estimación se queda corta. No incluye lo que tarda Chrome en entregar el audio de la pestaña, ni lo que
el modelo tarda en escribir una palabra cuyo audio ya tiene.

**Medición de comprobación.** El objetivo de la spec (el 90 % de las palabras en 1,5 segundos) se comprueba
palabra a palabra con el audio de referencia (D12), del que se conoce el instante de cada palabra:

- Una página local reproduce el audio de referencia y anota la hora a la que empieza.
- La extensión, solo en su versión de desarrollo, anota la hora a la que aparece por primera vez cada palabra
  y permite copiar esa lista.
- Un script empareja esas palabras con las de referencia y calcula la mediana, el percentil 90, el máximo y
  el porcentaje dentro de 1,5 segundos.
- Cuentan las palabras que el motor escribe, acierte o no al reconocerlas. Las que se salta no tienen
  retardo: se dan aparte, como porcentaje de palabras perdidas, que es un dato de calidad y no de retardo.

**Cada cuánto actualiza el motor el texto: 0,5 s, lo que trae Moonshine.** Con ese intervalo, en la primera
medición (tarea 1.8, `docs/medicion.md`) aparece dentro de 1 segundo entre el 85,2 y el 88,2 % de las
palabras, y dentro de 1,5 segundos entre el 93,5 y el 95,3 %. El objetivo era de 1 segundo. El usuario decide
el 2026-11-20 dejar el intervalo como está y pasar el objetivo a 1,5 segundos. Actualizar cada 0,25 s llega
al 92 % dentro de 1 segundo, con 1,6 veces más procesador: queda como recambio (BL-47).

Las dos horas salen del reloj del mismo ordenador, así que esta medida sí incluye la captura y el modelo. La
lista contiene texto, y por eso solo existe en la versión de desarrollo, que se usa con el audio de
referencia. La versión normal de la extensión no la incluye, y una prueba automática lo comprueba.

La misma medición dice cuánto se queda corta la estimación en vivo. La diferencia se anota en
`docs/medicion.md`.

**Alternativas consideradas:**

- *Pedir a Moonshine el instante de cada palabra.* Daría el retardo real palabra a palabra en cualquier
  llamada. Exige un fichero más por modelo: 32,5 MB con Tiny (la descarga pasaría de 51 a 84 MB), 81,8 MB con
  Small y 146,8 MB con Medium (tamaños comprobados en el servidor el 2026-11-19). No está comprobado que la
  versión 0.1.6 lo active así ni cuánto trabajo añade al modelo.
- *Repartir las palabras a lo largo de cada frase*, como en las pruebas con audio sintético. Solo sirve si se
  sabe dónde empieza y acaba cada frase.

### D12 — Audio de referencia: un tramo de una reunión grabada, con licencia libre

- **Audio de referencia:** unos 5 minutos de una reunión del AMI Meeting Corpus (Universidad de Edimburgo):
  reuniones grabadas en inglés, con varias personas que hablan de forma espontánea; en buena parte de ellas
  cada participante representa un papel. El audio y la transcripción están publicados con licencia CC BY 4.0.
- **Comprobado el 2026-11-20** en las anotaciones oficiales (versión 1.6.2) y en una reunión (ES2002a): el
  audio es la mezcla de los micrófonos de diadema, en un canal a 16 kHz, y cada palabra trae su instante de
  inicio y de fin. Esos instantes salen de un alineado automático, no de una anotación a mano, y unas pocas
  palabras no lo tienen: esas quedan fuera de la medición.
- **Cómo se obtiene:** un script de desarrollo baja la reunión elegida, recorta el tramo y genera la lista de
  palabras con sus instantes. La reunión y el tramo quedan fijados en el script. El audio no se versiona en
  git; el README cita el corpus, como pide la licencia.
- **Ordenador de referencia:** el MacBook Air M1 del entorno.
- **Llamada real:** antes de dar el change por terminado se repasa la lista manual en una llamada real en
  inglés, que aporta el usuario, con auriculares y con altavoces. Ahí no hay cifra palabra a palabra: se mira
  la estimación en vivo y si el texto se puede seguir.
- **Frase de calentamiento (D5):** un recorte de 2 segundos del mismo audio, incluido en la extensión con la
  cita del corpus.

**Alternativas consideradas:**

- *La grabación de una llamada del usuario como audio de referencia.* Es lo más fiel, pero contiene voces de
  otras personas, no puede estar en el repositorio y habría que anotar a mano el instante de cada palabra.
- *Voces sintéticas*, como en las pruebas ya hechas. Repetible y sin problemas de privacidad, pero es lo que
  menos se parece a una llamada.

### D13 — Ajustes, captura única y datos guardados

- El tamaño elegido va a `storage.local`; si no hay ninguno, es Tiny. No se usa `storage.sync`.
- La pestaña objetivo va al almacenamiento de sesión de la extensión.
- **Captura única:** al empezar, el panel toma un bloqueo del navegador (Web Locks) y lo mantiene mientras
  dura la captura. Si otra ventana ya lo tiene, el panel no ofrece «Iniciar» y explica por qué. El navegador
  libera el bloqueo aunque la página se cierre de golpe, así que no puede quedar una captura «fantasma».
- Los ajustes saben si hay una captura por ese mismo bloqueo: lo consultan al abrirse y esperan a que se
  libere. Por eso el selector de tamaño se desactiva y se vuelve a activar sin recargar la página.
- Los ajustes leen qué tamaños están descargados directamente de la caché de modelos (D3), al abrirse y cada
  vez que el canal de avisos (D4) anuncia un cambio.
- Hay un único punto de registro para diagnóstico. Anota tipos de evento, recuentos y duraciones; nunca texto
  transcrito.

### D14 — Permisos mínimos

| Permiso | Para qué |
|---|---|
| `activeTab` | Que el clic en el icono autorice la pestaña de la llamada |
| `tabCapture` | Capturar su audio |
| `sidePanel` | Mostrar el panel |
| `storage` | Guardar el tamaño elegido y la pestaña objetivo |

No hay permiso sobre ningún dominio: ni sobre los sitios de llamadas ni sobre el servidor de Moonshine, que
admite la descarga sin él. Tampoco hay scripts inyectados en páginas ni código cargado de fuera. La versión
mínima de Chrome es la 116. Una prueba automática compara los permisos del manifest generado con esta lista.

### D15 — Stack, versiones y estructura

- WXT, React y TypeScript (decisión B5). `wxt` y `@moonshine-ai/moonshine-wasm` se fijan a una versión
  exacta, sin rango, y el fichero de bloqueo se versiona. Para React y TypeScript se usan las versiones que
  fija la plantilla oficial de WXT con React, no las últimas publicadas.
- npm como gestor de paquetes: viene con Node 22 y no hay motivo para añadir otro.
- Identificadores y carpetas de código en inglés; textos de la interfaz y documentación en español.

```
TRANSLATOR/
├── entrypoints/     background, sidepanel y options
├── public/          worklet de captura y frase de calentamiento; moonshine/ (generado, fuera de git)
├── scripts/         copia y parche de Moonshine
├── src/
│   ├── engine/      interfaz del motor y adaptador de Moonshine (sin React ni API de extensiones)
│   ├── model/       tabla de tamaños, descarga y estado de lo guardado
│   ├── audio/       captura y los dos caminos de audio
│   ├── panel/       estado del panel, texto y cálculo del retardo
│   └── settings/    tamaño elegido
├── tools/           audio de referencia, página que lo reproduce y análisis de la medición
├── docs/            medicion.md y qa-manual.md
├── openspec/  BACKLOG.md  README.md
```

### D16 — Pruebas

- **Automáticas (Vitest):** estado del panel; texto provisional y definitivo; cálculo del retardo y regla del
  aviso, con temporizadores simulados; descarga del modelo con red y caché simuladas (progreso, cancelación,
  fichero de tamaño incorrecto, reintento, modelo a medias que no cuenta); adaptador de Moonshine con eventos
  reales guardados; script del parche (falla si el texto falta o se repite); almacén de ajustes; permisos del
  manifest; que el paquete instalado conserva el nombre de la caché y las direcciones de la tabla; y que la
  versión normal no incluye la lista de palabras de la medición.
- **Manuales:** una lista en `docs/qa-manual.md` con todos los escenarios de las tres specs. Se recorre
  primero con una pestaña que reproduce el audio de referencia, que es repetible, y después en una llamada
  real. Incluye mirar el tráfico de red durante una captura y empezar una captura sin conexión.

**Alternativas consideradas:**

- *Pruebas de componentes de React.* Añaden dependencias para probar una capa que solo pinta un estado ya
  probado.
- *Pruebas de extremo a extremo con un navegador automatizado.* La captura exige un clic real en el icono.

## Risks / Trade-offs

Los seis primeros se comprueban en el primer bloque de tareas, con una extensión mínima hecha ya con WXT,
antes de construir nada encima.

- [No está comprobado que el panel lateral quede aislado de otros orígenes; sin eso Moonshine no arranca. La
  prueba se hizo en una página de extensión abierta en una pestaña] → Si no lo está, el motor pasa a un
  documento en segundo plano (cambia D6 y añade un permiso) y se replantea con el usuario.
- [«Iniciar» pide la captura desde el panel, segundos o minutos después del clic en el icono, y no está
  confirmado que Chrome lo admita] → El plan B es capturar con el propio clic (D7), con cambio en la spec.
- [No está comprobado que Moonshine acepte los ficheros guardados por nuestra descarga ni que, con ellos,
  arranque sin red y no haga peticiones durante la captura. El código leído dice que sí] → Se comprueba
  mirando el tráfico de red y con la conexión cortada. La salida es la descarga de Moonshine (D3).
- [No está comprobado que el paquete, copiado sin empaquetar, se cargue bien dentro de un proyecto de WXT] →
  Si no, se prueba a dejar que el empaquetador lo procese.
- [No está comprobado que los bloqueos y el canal de avisos funcionen entre el panel lateral y los ajustes] →
  La salida es coordinarse con el almacenamiento de sesión y mensajes de la extensión.
- [Con el audio de referencia, Tiny no llegó al 90 % en 1 segundo (85,2 a 88,2 %)] → Decidido con el
  usuario: el objetivo pasa a 1,5 segundos y el intervalo del motor no se toca (D11). Se vuelve a medir con la
  extensión terminada (5.2) y en una llamada real (5.4). Si se nota lento, el recambio es actualizar cada
  0,25 s (BL-47).
- [El motor se salta alrededor del 10 % de las palabras del audio de referencia, casi todas dichas mientras
  habla otra persona] → La spec no fija un objetivo para esto. Se vuelve a mirar en la llamada real (5.4).
- [La página protegida se reconoce porque llega sin dirección (D7). Está visto con un clic simulado y sin
  probar en la tienda de extensiones] → Se repite con un clic real (lista de `docs/medicion.md`). Si una
  página normal llegara sin dirección, vería el aviso en vez de la transcripción; la salida es pedir el
  permiso `tabs` (BL-48), con el usuario.
- [La estimación en vivo se queda corta y el usuario ve una cifra mejor que la real] → La medición de
  comprobación dice cuánto. Si la diferencia es grande, se decide con el usuario: corregir la cifra o pedir a
  Moonshine el instante de cada palabra (D11).
- [Los instantes de las palabras del audio de referencia salen de un alineado automático y pueden tener
  error] → La revisión a oído de una muestra no se hace: el usuario la da por buena (2026-11-20). Queda la
  comprobación automática de que el audio y la lista van a la par (`docs/medicion.md`, 1.6).
- [El umbral del aviso (3 segundos durante 10) está en la spec y no se ha medido] → Se prueba forzando la
  situación con Medium y el procesador ocupado. Si no sirve, se cambia en la spec con el usuario.
- [El parche depende del texto exacto de dos fragmentos del paquete] → Versión fijada, y el build falla si no
  los encuentra (D1). BL-32 y BL-34 son las alternativas.
- [La descarga propia depende del nombre interno de la caché de Moonshine] → Versión fijada y prueba
  automática (D3).
- [No está documentado que cerrar el panel descargue su página] → Se comprueba en el primer bloque. Si no se
  descarga, la captura se corta con el aviso de cierre del panel (Chrome 142 o posterior) o al dejar de ser
  visible.
- [El audio de la llamada pasa a reproducirlo la extensión: podría desfasarse del vídeo o, con altavoces,
  producir eco para los demás] → No hay documentación que lo aclare. Se comprueba en una llamada real con
  auriculares y con altavoces.
- [El remuestreo en un segundo contexto de audio o la mezcla a un canal no funcionan como se espera] → Se
  comprueban en el primer bloque; la salida está en D8.
- [El panel deja de procesar con la ventana minimizada] → Se comprueba con 5 minutos de ventana minimizada.
- [El navegador puede borrar el modelo guardado si falta espacio en disco] → Los ajustes muestran lo que hay
  de verdad y el modelo se vuelve a descargar al iniciar.
- [El servidor de Moonshine deja de estar disponible o cambia las direcciones] → Quien ya tiene el modelo no
  se ve afectado. Quien no, ve el fallo de descarga con «Reintentar». La salida de fondo es llevar el modelo
  dentro de la extensión (BL-42, BL-43).
- [El motor ocupa entre 0,5 y 0,9 GB de memoria con Tiny, y más con Small y Medium] → Se libera al terminar
  cada captura (D9) y se indica en el README.
- [Una captura olvidada gasta procesador y batería] → Termina al cerrar el panel y el aviso está siempre a la
  vista. No hay corte por inactividad en esta versión.
- [WXT está en versión 0.x] → Versión exacta y fichero de bloqueo.
- [Se transcribe la voz de personas que no han instalado nada] → Todo se queda en el ordenador, el aviso está
  siempre a la vista y el texto no se guarda. Informar a los demás participantes es responsabilidad de quien
  usa la extensión (ver `proposal.md`).

**Renuncias asumidas:** cerrar el panel pierde el texto de la sesión; cada captura vuelve a cargar el modelo;
el retardo que ve el usuario es una estimación.

## Open Questions

- Si se añade a `openspec/config.yaml` la indicación de que los artefactos se escriben en español, como en los
  repos de DAAIT.
