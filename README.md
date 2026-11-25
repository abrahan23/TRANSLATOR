# TRANSLATOR

Extensión de Chrome que transcribe en vivo, **en tu propio ordenador**, lo que se dice en una llamada
o videollamada abierta en una pestaña. El audio y el texto no salen del equipo.

Es el primer paso de un producto más amplio: transcribir, traducir (primero de inglés a español) y
dar contexto sobre las preguntas técnicas que surjan en la llamada. La extensión llega primero; la
aplicación de escritorio, después.

## Estado

Versión mínima, para comprobar que la pieza principal funciona de punta a punta:

- Transcribe el audio de **una pestaña** (lo que dicen los demás), **solo en inglés**.
- Usa el modelo de voz más pequeño de Moonshine (Tiny).
- Hay una página de ajustes para elegir el tamaño del modelo y descargarlo antes de la llamada. El
  panel todavía no usa el tamaño elegido: transcribe siempre con Tiny.
- Todavía no hay traducción, ni contexto técnico, ni captura del micrófono.
- Los mensajes de error son los que da Chrome, sin pulir.

Qué viene después y en qué orden: [openspec/changes/transcripcion-en-vivo/tasks.md](openspec/changes/transcripcion-en-vivo/tasks.md).

## Requisitos

- Google Chrome 116 o posterior (probado con Chrome 157 en macOS, Apple M1).
- Node.js 22 o posterior, con npm.
- Conexión a internet la primera vez que se pulsa «Iniciar»: se descarga el modelo de voz (51 MB)
  desde `download.moonshine.ai` y queda guardado en el navegador. Después funciona sin conexión.

## Compilar

```sh
npm install
npm run build
```

La extensión compilada queda en `.output/chrome-mv3/`.

## Cargarla en Chrome

1. Abre `chrome://extensions`.
2. Activa «Modo de desarrollador» (arriba a la derecha).
3. Pulsa «Cargar descomprimida» y elige la carpeta `.output/chrome-mv3`.
4. Fija el icono de TRANSLATOR en la barra (icono del puzle → chincheta) para tenerlo a mano.

Después de volver a compilar, pulsa el botón de recargar de la extensión en `chrome://extensions`.

## Usarla

1. Abre la pestaña de la llamada (para probar vale cualquier vídeo en inglés).
2. Haz clic en el icono de TRANSLATOR **estando en esa pestaña**. Se abre el panel lateral con el
   título de la pestaña.
3. Pulsa «Iniciar». La primera vez se descarga el modelo; después empieza en menos de un segundo.
4. El texto aparece en el panel mientras se habla: en cursiva y gris mientras la frase sigue abierta,
   en normal cuando queda cerrada. La pestaña se sigue oyendo.
5. Pulsa «Detener» para terminar. Si vuelves a pulsar «Iniciar», el texto nuevo va debajo del anterior.

El clic en el icono es lo que da permiso a la extensión sobre esa pestaña: si quieres transcribir
otra, haz clic en el icono estando en ella.

Solo puede haber una transcripción en marcha a la vez. Si ya hay una en otra ventana, el panel lo
dice y no ofrece «Iniciar» hasta que se detenga.

## Ajustes

Se abren en una pestaña propia, de dos formas: con el enlace «Ajustes» del panel o con el clic derecho
en el icono de TRANSLATOR → «Opciones».

- **Tamaño del modelo de voz:** Tiny (51 MB), Small (165 MB) o Medium (305 MB). Los dos mayores son
  más precisos, pero más lentos. Lo elegido se guarda en este ordenador y es Tiny mientras no se
  elija otro.
- **«Descargar ahora»** baja el modelo del tamaño elegido sin esperar a la llamada. Muestra cuánto
  lleva, se puede cancelar y, si no se completa, lo explica y ofrece «Reintentar». Si pasan 30
  segundos sin que llegue nada del servidor, la da por no completada.
- Mientras hay una transcripción en marcha no se puede cambiar el tamaño: hay que detenerla primero.

## Privacidad

- El audio se procesa dentro de la extensión. No se envía a ningún servidor.
- La única petición de red es la descarga del modelo de voz, la primera vez.
- La extensión no pide permiso sobre ningún sitio web: solo `activeTab`, `tabCapture`, `sidePanel`
  y `storage`. Una prueba automática comprueba que esa lista no crece.
- El texto transcrito vive en la página del panel: no se guarda ni se escribe en ningún registro.

## Cómo funciona

1. **Clic en el icono.** El service worker ([entrypoints/background.ts](entrypoints/background.ts))
   abre el panel lateral y anota qué pestaña es.
2. **«Iniciar».** La página del panel ([entrypoints/sidepanel/](entrypoints/sidepanel/)) carga el
   motor y captura el audio de la pestaña.
3. **Dos caminos de audio** ([src/audio/tab-capture.ts](src/audio/tab-capture.ts)). Chrome silencia
   una pestaña mientras se captura, así que la extensión la vuelve a reproducir tal cual; aparte, un
   segundo contexto de audio la convierte a un canal a 16 kHz y la entrega en bloques de 50 ms.
4. **Motor** ([src/engine/](src/engine/)). El panel habla con una interfaz propia
   ([src/engine/types.ts](src/engine/types.ts)); detrás está [Moonshine](https://github.com/moonshine-ai/moonshine),
   que corre en WebAssembly dentro de un worker. Cambiar de motor es escribir otro adaptador.

### Por qué se parchea Moonshine

Las páginas de una extensión no pueden crear funciones a partir de texto, y el código de Moonshine
lo hace en dos sitios. [scripts/prepare-moonshine.mjs](scripts/prepare-moonshine.mjs) copia el
paquete a `public/moonshine/` y sustituye esos dos fragmentos por funciones equivalentes. Se ejecuta
solo antes de compilar y **falla** si el paquete cambia y los fragmentos ya no están exactamente una
vez, o si queda alguna función creada a partir de texto. Por eso la versión de
`@moonshine-ai/moonshine-wasm` está fijada.

## Medir el retardo

El objetivo es que el texto aparezca como mucho 1,5 segundos después de que se diga cada palabra. Se
comprueba con un audio del que se conoce el instante de cada palabra: unos 5 minutos de una reunión
grabada en inglés (ver [Créditos](#créditos)). Resultados: [docs/medicion.md](docs/medicion.md).

1. `npm run prepare:reference` baja la reunión y sus anotaciones (unos 64 MB, una sola vez) y genera
   el tramo de audio y la lista de palabras en `tools/reference-audio/`, que no está en git.
2. `npm run build:dev` compila la versión de desarrollo en `.output/chrome-mv3-dev/`. Cárgala en
   Chrome como la normal. Es la única que anota a qué hora aparece cada palabra.
3. `npm run serve:reference` abre la página del audio en `http://127.0.0.1:4173/`. La propia página
   dice qué pulsar; al acabar se copian la medición (en el panel) y la hora de inicio (en la página).
4. Guarda la medición en un fichero y compárala:
   `npm run compare:delay -- medicion.json --inicio <hora de inicio>`.

La versión normal no contiene esa lista de palabras, y una prueba automática lo comprueba.

## Estructura

| Ruta | Qué hay |
|---|---|
| `entrypoints/background.ts` | Service worker: clic en el icono → abre el panel y anota la pestaña. |
| `entrypoints/sidepanel/` | Página del panel (React). |
| `entrypoints/options/` | Página de ajustes (React). Se abre en su propia pestaña. |
| `src/engine/` | Interfaz del motor de transcripción, adaptador de Moonshine y lectura de la frase de calentamiento. Las pruebas del adaptador usan eventos reales de Moonshine guardados en `recorded-run.json`. |
| `src/audio/` | Captura del audio de la pestaña y captura única: el bloqueo que el panel toma al pulsar «Iniciar», y cómo saben los ajustes y los demás paneles si hay una captura en marcha. |
| `src/model/` | Modelo de voz: tabla de los tres tamaños, descarga cancelable, qué hay guardado, descarga única compartida entre el panel y los ajustes, y textos de una descarga que no se completa. Lo usan los ajustes; el panel, todavía no. |
| `src/panel/` | Pestaña objetivo y texto del panel. |
| `src/settings/` | Tamaño de modelo elegido (se guarda en este ordenador y es Tiny mientras no se elija otro) y lo que muestra la página de ajustes en cada momento. El panel todavía no usa el tamaño elegido. |
| `src/dev/` | Lista de palabras con su hora de aparición. Solo entra en la versión de desarrollo. |
| `tools/` | Medición del retardo: audio de referencia, página que lo reproduce y comparación. También el recorte de la frase de calentamiento. |
| `docs/` | Resultados de las comprobaciones y mediciones ([medicion.md](docs/medicion.md)) y lista de escenarios recorridos a mano en Chrome ([qa-manual.md](docs/qa-manual.md)). |
| `public/capture-worklet.js` | Procesador de audio que agrupa la captura en bloques. |
| `public/warm-up.wav` | Frase de calentamiento: 2 segundos de voz que el motor transcribe al cargarse, antes de la captura. Su texto se descarta. `public/warm-up.txt` dice de dónde sale y con qué licencia. |
| `public/moonshine/` | Copia parcheada de Moonshine. Se genera al compilar; no está en git. |
| `scripts/` | Preparación de Moonshine y sus pruebas. |
| `tests/build/` | Pruebas sobre la extensión compilada (manifest, parche y frase de calentamiento). |
| `openspec/` | Specs, diseño y tareas (el proyecto se desarrolla con OpenSpec). |
| `BACKLOG.md` | Opciones descartadas o aplazadas, con su motivo. |

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run build` | Prepara Moonshine y compila la extensión en `.output/chrome-mv3/`. |
| `npm run build:dev` | Compila la versión de desarrollo en `.output/chrome-mv3-dev/` (para medir el retardo). |
| `npm run compile` | Comprueba los tipos de TypeScript. |
| `npm test` | Compila las dos versiones y ejecuta todas las pruebas. |
| `npm run test:unit` | Ejecuta las pruebas que no necesitan compilar. |
| `npm run dev` | Modo de desarrollo de WXT con recarga en caliente. Todavía sin comprobar con esta extensión. |
| `npm run prepare:reference` | Baja y prepara el audio de referencia de la medición. |
| `npm run prepare:warm-up` | Vuelve a recortar la frase de calentamiento del audio de referencia. Solo hace falta si se quiere cambiar: el recorte ya está en el repositorio. |
| `npm run serve:reference` | Sirve en este ordenador la página que reproduce ese audio. |
| `npm run compare:delay` | Compara una medición con el audio de referencia y da el retardo. |

## Créditos

- Reconocimiento de voz: [Moonshine](https://github.com/moonshine-ai/moonshine), paquete
  `@moonshine-ai/moonshine-wasm` (licencia MIT).
- Estructura de la extensión: [WXT](https://wxt.dev/) con React y TypeScript.
- Audio de referencia de la medición: [AMI Meeting Corpus](https://groups.inf.ed.ac.uk/ami/corpus/)
  (Universidad de Edimburgo), licencia [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
  Se usa la reunión ES2002a (mezcla de los micrófonos de diadema) y sus anotaciones de palabras
  (`ami_public_manual_1.6.2.zip`). Cambios: se recorta un tramo de 5 minutos y se reúnen en una lista
  las palabras de los cuatro hablantes. Ese tramo y las anotaciones no están en este repositorio.
- Del mismo corpus y con la misma licencia sí están en el repositorio dos cosas: un recorte de 2
  segundos de esa reunión (`public/warm-up.wav`, del segundo 757,1 al 759,1, sin más cambios), que va
  dentro de la extensión, y el texto que Moonshine transcribió de ese recorte y de los primeros 24,5
  segundos del tramo (`src/engine/moonshine/recorded-run.json`), que solo usan las pruebas.
