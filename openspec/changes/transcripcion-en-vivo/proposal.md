# Proposal

## Why

TRANSLATOR quiere que una persona pueda seguir una llamada o videollamada en un idioma que no domina: ver por
escrito lo que se dice, verlo traducido y recibir ayuda cuando le hacen una pregunta técnica. Nada de eso
existe todavía: el repositorio solo tiene el andamiaje de OpenSpec.

Este es el primero de tres changes (`transcripcion-en-vivo`, `traduccion-en-vivo` y `contexto-tecnico`). Va
primero porque los otros dos se apoyan en él: sin texto en vivo no hay nada que traducir ni preguntas que
detectar. También es donde se resuelve lo que más preocupa del producto, el retardo. Todo se hace en el propio
ordenador (decisión B3): el audio no sale del equipo y no hay cuentas ni claves. El modelo de voz ya está
elegido y medido con audio sintético (Moonshine, decisión B8); aquí falta confirmarlo con audio real de
llamada.

## What Changes

- **Extensión de Chrome nueva**, con un panel lateral y una página de ajustes. Se instala en modo
  desarrollador; no se publica en la Chrome Web Store.
- **Captura del audio de la pestaña de la llamada**, que siempre inicia el usuario. El usuario sigue oyendo la
  llamada con normalidad. Solo hay una captura a la vez, y termina cuando el usuario la detiene, cierra el
  panel o cierra la pestaña.
- **Transcripción original en vivo en el panel, hecha en el propio ordenador.** El texto aparece mientras se
  habla, primero como provisional y después como definitivo. Objetivo: que lo dicho esté en pantalla en
  1,5 segundos como máximo.
- **Solo llamadas en inglés en esta versión**, sin selector de idioma. La versión publicada del modelo de voz
  solo transcribe en vivo ese idioma; elegir el idioma de la llamada queda comprometido para después (BL-44).
- **Modelo de voz dentro de la extensión, con el tamaño elegible en los ajustes:** Tiny, Small o Medium. Tiny
  es el valor por defecto; Small y Medium avisan de que son más precisos y más lentos. La elección se recuerda
  y solo se puede cambiar con la transcripción parada (decisión B9).
- **Descarga del modelo la primera vez que se usa cada tamaño**, con una barra de progreso. Después queda
  guardado en el navegador y ya no hace falta conexión (decisión B13).
- **Aviso visible en el panel** durante todo el tiempo en que se captura audio. Dice también que el audio se
  transcribe en el ordenador y no se envía a ningún sitio.
- **Retardo medido a la vista.** El panel permite consultar el retardo real de la sesión, y el objetivo de
  1,5 segundos se comprueba con audio real de llamada antes de dar el change por terminado.
- **Motor de transcripción detrás de una interfaz propia**, para poder cambiarlo sin rehacer la extensión.

**Fuera de alcance:**

- La traducción del texto y el selector del idioma de destino. Van en el change `traduccion-en-vivo`.
- La detección de preguntas técnicas y la respuesta en vivo. Van en el change `contexto-tecnico`.
- Las llamadas en otros idiomas y el selector del idioma de la llamada (BL-44).
- La voz del propio usuario. Solo se transcribe lo que suena en la pestaña, es decir, a los demás
  participantes; el micrófono es el paso siguiente a esta versión (BL-19).
- Indicar quién habla en cada momento (BL-20).
- Guardar o exportar la transcripción. El texto vive solo en el panel mientras dura la sesión (BL-21).
- Seguir transcribiendo con el panel cerrado (BL-22).
- Publicar la extensión en la tienda y los avisos legales que eso exige (BL-23).
- Que la extensión elija sola el tamaño del modelo (BL-35) o lo lleve dentro en lugar de descargarlo (BL-42).
- Otros navegadores, la interfaz en idiomas distintos del español, la voz sintetizada (BL-41) y la app de
  escritorio (BL-01).

## Capabilities

### New Capabilities

- `captura-audio-pestana`: captura del audio de la pestaña de la llamada por acción expresa del usuario, sin
  dejar de oír la llamada, con una sola captura activa, condiciones claras de finalización y un aviso visible
  mientras dura.
- `transcripcion-en-vivo`: transcripción del audio capturado, hecha en el ordenador y mostrada en el panel
  mientras se habla, con texto provisional y definitivo, objetivo de retardo y retardo medido a la vista.
- `modelo-de-voz`: el modelo con el que se transcribe: elección del tamaño en los ajustes, descarga la primera
  vez con progreso, guardado en el navegador y qué ve el usuario cuando el modelo no está listo o no se puede
  descargar.

### Modified Capabilities

Ninguna. El proyecto todavía no tiene specs.

## Impact

- **Código.** Todo es nuevo: proyecto de extensión con WXT, React y TypeScript (decisión B5), con pruebas
  unitarias y un README. No hay código previo que se vea afectado.
- **Dependencias.** WXT con la versión fijada, React, TypeScript, una herramienta de pruebas y el paquete de
  Moonshine (`@moonshine-ai/moonshine-wasm`, fijado en la 0.1.6). El paquete publicado no arranca tal cual en
  una extensión de Chrome: el build le aplica un parche, que hay que revisar en cada cambio de versión.
- **Servicios externos.** Ninguno durante la llamada. Solo el servidor de Moonshine, del que se descarga el
  modelo la primera vez: 51 MB (Tiny), 166 MB (Small) o 305 MB (Medium). No hay backend propio ni despliegue.
- **Permisos del navegador.** Capturar el audio de la pestaña, mostrar el panel lateral y guardar ajustes en el
  navegador. Ninguno más.
- **Privacidad.** El audio y el texto no salen del equipo. Aun así se transcribe la voz de personas que no han
  instalado nada: la extensión avisa al usuario, no a los demás participantes, e informarles es responsabilidad
  de quien la usa. La transcripción no se guarda en disco.
- **Consumo del ordenador.** No hay coste por uso, pero el modelo trabaja mientras dura la captura. Medido en
  este Mac con audio sintético: Tiny ocupa de media el 55 % de un núcleo; Small, el 136 %; Medium, el 177 %.
  Una captura olvidada sigue gastando procesador y batería, y es uno de los motivos para detenerla al cerrar el
  panel.
- **Primera vez.** La primera transcripción con cada tamaño espera a la descarga: 8 o 9 segundos con Tiny, 18
  con Small y 32 con Medium en la conexión de la prueba. Sin conexión no se puede empezar hasta haberlo
  descargado una vez.
- **Sin probar todavía.** La captura del audio de la pestaña desde el panel y el comportamiento con audio real
  de llamada. Son lo primero que se comprueba en este change.
- **Qué hace falta del usuario.** Una llamada real en inglés, o su grabación sin datos sensibles, para
  confirmar el retardo y la calidad. Ni cuentas ni claves.
