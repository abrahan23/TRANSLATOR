# Backlog de TRANSLATOR

Opciones valoradas al definir el producto que **no entran en la primera versión**. Cada una queda aquí con sus
pros y contras y con la condición para retomarla. Cuando una se retome, se abre como change de OpenSpec
(`/openspec-propose`) y se actualiza su estado aquí.

Estados: `Pendiente` → `En curso` → `Hecho` (o `Descartada`, con el motivo).

## Decisiones tomadas (contexto)

Decididas el 2026-11-19. Son el punto de partida contra el que se leen las opciones de este backlog. B3 se
replanteó ese mismo día, de la nube a todo en local; de ese replanteo salen B8 a B13.

| Decisión | Elegido para la primera versión |
|---|---|
| B1 — Plataforma y captura de audio | **Extensión de navegador.** Cubre las llamadas que ocurren en una pestaña (Meet, Teams web, Zoom web). Se usa para validar el producto. |
| B2 — Contexto sobre preguntas técnicas | **Respuesta en vivo.** Detecta una pregunta técnica en la transcripción y muestra una explicación breve con puntos para responder, con el conocimiento general del modelo. Con todo en local (B3), qué modelo la genera queda por decidir en el change `contexto-tecnico`. |
| B3 — Dónde se procesa | **Todo en local, dentro de la extensión.** La transcripción y la traducción se hacen en el ordenador: el audio no sale del equipo y no hay proveedores de pago ni claves. Solo hace falta internet para descargar los modelos la primera vez. Sustituye a la nube directa, descartada al replantear. Cada motor queda detrás de una interfaz propia para poder cambiarlo. |
| B4 — Idiomas | **Origen y destino elegibles.** El usuario elige los dos idiomas en el panel y se recuerdan para la siguiente llamada. Primer par: del inglés al español. En la primera versión la llamada solo puede ser en inglés, sin selector: la versión publicada de Moonshine (0.1.6) solo transcribe en vivo ese idioma. El selector del idioma de la llamada llega después (BL-44). |
| B5 — Stack de la extensión | **WXT + React + TypeScript**, con la versión de WXT fijada en `package.json`. Primera versión solo para Chrome. |
| B6 — Objetivo de retardo | **Equilibrado.** Transcripción original en ≤ 1,5 s, traducción en ≤ 2 s y el contexto empieza a aparecer en ≤ 4 s. El de la transcripción era ≤ 1 s hasta el 2026-11-20: con el audio de una reunión real, Moonshine Tiny deja dentro de 1 s entre el 85,2 y el 88,2 % de las palabras, y dentro de 1,5 s entre el 93,5 y el 95,3 % (`docs/medicion.md`). Falta confirmarlo en una llamada real. El de la traducción solo está medido con audio sintético (traductor de Chrome: 22 ms por frase). El del contexto está sin medir. |
| B7 — Troceado del trabajo | **Tres changes de OpenSpec, uno por capacidad:** `transcripcion-en-vivo`, `traduccion-en-vivo` y `contexto-tecnico`, en ese orden. El primero se replanifica tras el replanteo de B3: ya no empieza midiendo proveedores. |
| B8 — Motor de transcripción | **Moonshine dentro de la extensión** (`@moonshine-ai/moonshine-wasm`, versión fijada en 0.1.6). El paquete publicado no arranca tal cual en una extensión de Chrome; se corrige con un parche en el build. |
| B9 — Tamaño del modelo de voz | **Elegible en ajustes desde la primera versión:** Tiny, Small o Medium, con Tiny por defecto y recordado entre llamadas. El cambio se aplica con la transcripción parada. |
| B10 — Motor de traducción | **Traductor integrado de Chrome**, detrás de una interfaz propia. Es un modelo local de 99 MB. La app de escritorio (BL-01) necesitará otro motor; Opus-MT está medido como recambio. |
| B11 — Quién habla | **Se distingue por la fuente de audio:** lo que suena en la pestaña son los demás y el micrófono es el usuario. La primera versión solo transcribe la pestaña; el micrófono llega en un paso propio justo después (BL-19). |
| B12 — Voz sintetizada | **No de momento.** La app solo muestra texto. |
| B13 — De dónde sale el modelo de voz | **Se descarga del servidor de Moonshine la primera vez** y queda guardado en el navegador. La descarga empieza al pulsar «Iniciar» si el modelo falta, y se puede adelantar con el botón «Descargar ahora» de los ajustes. |

## Plataforma y captura de audio (B1)

### BL-01 — App de escritorio con captura del audio del sistema

- **Estado:** Pendiente. **Comprometida:** es el paso siguiente a la validación con la extensión.
- **Qué es:** aplicación de escritorio que captura el audio del sistema y el micrófono, y muestra subtítulos y
  contexto en una ventana propia.
- **A favor:** cubre cualquier app de llamadas del ordenador (Zoom, Teams, Meet, WhatsApp, softphone); no
  depende de la plataforma de la llamada.
- **En contra:** la captura se implementa distinta en cada sistema operativo y exige permisos; hay que
  empaquetar y firmar la app. Empezar solo por macOS y dejar Windows para después.
- **Cuándo retomarla:** cuando la extensión haya validado el producto.
- **A verificar al retomarla:** viabilidad exacta de la captura en cada sistema, con documentación oficial. El
  motor de traducción habrá que cambiarlo (ver BL-37).

### BL-02 — Bot que entra en la reunión

- **Estado:** Pendiente.
- **Qué es:** un participante automático que se une a la llamada con el enlace de invitación y transcribe desde
  dentro.
- **A favor:** no hay nada que instalar en el equipo; sirve a todo un grupo a la vez.
- **En contra:** aparece como participante ante todos; solo vale para Zoom, Meet y Teams con enlace, no para
  llamadas telefónicas; depende de un servicio tercero o de mucha infraestructura propia.
- **Cuándo retomarla:** si aparece la necesidad de dar servicio a equipos enteros sin instalar nada.

### BL-03 — App móvil para llamadas telefónicas

- **Estado:** Pendiente.
- **Qué es:** app de móvil que transcribe y traduce llamadas de teléfono.
- **A favor:** es el único camino para telefonía pura.
- **En contra:** iOS no da a apps de terceros el audio de la llamada y Android lo restringe mucho; en la
  práctica queda altavoz más micrófono, con mala calidad.
- **Cuándo retomarla:** si las llamadas telefónicas resultan ser un caso de uso principal.
- **A verificar al retomarla:** restricciones vigentes de iOS y Android, con documentación oficial.

## Contexto sobre preguntas técnicas (B2)

### BL-04 — Glosario en vivo

- **Estado:** Pendiente.
- **Qué es:** detecta términos técnicos y siglas en la transcripción y muestra su definición.
- **A favor:** más rápido y barato que generar respuestas; menos riesgo de respuestas inventadas.
- **En contra:** no responde preguntas, solo aclara vocabulario.
- **Cuándo retomarla:** como complemento de la respuesta en vivo, o si esta resulta demasiado lenta o cara.

### BL-05 — Preparación previa de la llamada

- **Estado:** Pendiente.
- **Qué es:** antes de la llamada se le da el tema o documentos y prepara posibles preguntas con su respuesta;
  durante la llamada las resalta si aparecen.
- **A favor:** las respuestas están revisadas de antemano por el usuario.
- **En contra:** no cubre lo imprevisto; exige trabajo antes de cada llamada.
- **Cuándo retomarla:** si los usuarios piden llegar a la llamada con material preparado.

### BL-06 — Respuesta en vivo sobre documentos propios

- **Estado:** Pendiente. Evolución natural de la respuesta en vivo elegida en B2.
- **Qué es:** igual que la respuesta en vivo, pero buscando en una base de conocimiento del usuario.
- **A favor:** respuestas ajustadas al producto o a la empresa del usuario.
- **En contra:** hay que construir la carga y el indexado de documentos; demasiado para una validación.
- **Cuándo retomarla:** cuando la validación confirme que la respuesta en vivo se usa.

## Dónde se procesa (B3)

### BL-07 — Backend propio delante de los proveedores

- **Estado:** Descartada con el replanteo de B3 (2026-11-19): con todo en local no hay proveedores delante de
  los que ponerse.
- **Qué es:** la extensión envía el audio a un servicio propio, que llama a los proveedores de transcripción,
  traducción y contexto.
- **A favor:** las claves no salen del servidor; se cambia de proveedor sin republicar la extensión; la app de
  escritorio (BL-01) lo reutiliza tal cual.
- **En contra:** hay que desplegarlo, protegerlo con autenticación y mantenerlo; el audio de terceros sale del
  equipo.
- **Cuándo retomarla:** solo si se vuelve a un diseño con proveedores en la nube.

### BL-08 — Todo en local

- **Estado:** En curso. Es la opción elegida en B3 desde el replanteo del 2026-11-19: Moonshine transcribe (B8)
  y el traductor integrado de Chrome traduce (B10).
- **Qué es:** el modelo de voz se ejecuta en el propio navegador; nada sale del equipo.
- **A favor:** el audio no sale del equipo; sin coste por minuto.
- **En contra:** la calidad y el retardo en tiempo real dependen de la máquina (a medir); la respuesta en vivo
  no es realista con un modelo local, así que no cubre el producto entero.
- **Cuándo retomarla:** ya retomada. Queda abierto cómo generar la respuesta en vivo en local (ver B2).

### BL-09 — Híbrido: transcripción en local, texto a la nube

- **Estado:** Pendiente.
- **Qué es:** la transcripción se hace en local y solo el texto va a la nube. Con B3 y B10 la traducción ya es
  local, así que hoy esto solo afectaría a la respuesta en vivo (B2).
- **A favor:** el audio nunca sale del equipo; solo sale texto.
- **En contra:** el texto de la conversación sale del equipo y vuelve a hacer falta una cuenta con un
  proveedor, justo lo que se descartó al replantear B3.
- **Cuándo retomarla:** si en el change `contexto-tecnico` ningún modelo local genera la respuesta en vivo a
  tiempo.

## Idiomas (B4)

### BL-10 — Detección automática del idioma de origen

- **Estado:** Pendiente.
- **Qué es:** la app detecta el idioma que se está hablando y traduce al idioma de destino configurado, sin
  que el usuario elija el origen.
- **A favor:** cero clics por llamada; aguanta llamadas en las que se habla más de un idioma.
- **En contra:** depende de que el motor de voz detecte el idioma en tiempo real. A Moonshine el idioma se le
  indica al cargar el modelo, y su README no menciona detección automática.
- **Cuándo retomarla:** si elegir el idioma de origen a mano resulta molesto durante la validación.
- **A verificar al retomarla:** si Moonshine u otro modelo local detecta el idioma hablado, y con qué retardo.

### BL-11 — Par de idiomas fijo

- **Estado:** Descartada. La opción elegida en B4 ya lo cubre: elegir un par y que se recuerde equivale a un par
  fijo, sin perder la posibilidad de cambiarlo.
- **Qué es:** un único par de idiomas, sin selector (por ejemplo inglés → español).
- **A favor:** lo más simple; nada que configurar.
- **En contra:** deja de servir en cuanto cambia el idioma de una llamada.

### BL-44 — Elegir el idioma de la llamada

- **Estado:** Pendiente. **Comprometida:** el usuario la pidió para la primera versión (2026-11-19); se aplaza
  porque la versión publicada de Moonshine no puede con los otros idiomas.
- **Qué es:** un selector en el panel con el idioma que se habla en la llamada, recordado entre llamadas. La
  primera versión solo transcribe inglés y no muestra selector.
- **A favor:** sirve para llamadas en otros idiomas. Moonshine ya tiene modelos en vivo para español, alemán y
  japonés (Tiny y Small) y para árabe, mandarín, vietnamita y tagalo (solo Tiny; el de tagalo sale de un
  entrenamiento sin terminar). Pesan unos 32 MB (Tiny) y 122 MB (Small) por idioma.
- **En contra:** el paquete publicado (0.1.6) no los carga: están en un formato más nuevo. Hace falta una
  versión nueva del paquete o compilarlo nosotros (BL-32). Fuera del inglés no hay modelo Medium, y solo los
  modelos ingleses dan la marca de tiempo de cada palabra, lo que afecta a cómo se calcula el retardo.
- **Cuándo retomarla:** cuando Moonshine publique una versión que cargue esos modelos, o antes si la prueba de
  BL-32 sale bien.
- **Probado (2026-11-19):** el modelo Tiny de español, cargado a mano en la 0.1.6 de tres formas: dos las
  rechaza al cargar y la tercera carga pero falla al transcribir. El Tiny inglés, cargado por el mismo camino,
  transcribe bien.
- **No elegido:** compilar Moonshine ya y sacar la primera versión con el selector (la retrasa y no está
  probado); mostrar ya un selector con el inglés como única opción.
- **A verificar al retomarla:** retardo y calidad de cada idioma con audio real; cómo medir el retardo sin
  marcas de tiempo por palabra; que el traductor (B10) cubre el par elegido.

### BL-45 — Modelos antiguos de Moonshine para los otros idiomas

- **Estado:** Descartada sin probar (2026-11-19).
- **Qué es:** ofrecer ya otros idiomas con los modelos que sí trae la 0.1.6 (árabe, chino, coreano, español,
  japonés, ucraniano y vietnamita), que no son en vivo.
- **A favor:** vienen en el catálogo del paquete publicado; no hay que compilar nada.
- **En contra:** Moonshine los da por obsoletos donde ya hay modelo en vivo; su licencia no permite uso
  comercial; no se han probado ni medido, tampoco si dan texto palabra a palabra.

## Stack de la extensión (B5)

### BL-12 — Vite + CRXJS en lugar de WXT

- **Estado:** Pendiente. Alternativa de reserva.
- **Qué es:** construir la extensión con Vite y el plugin CRXJS, con el manifest escrito a mano, manteniendo
  React y TypeScript.
- **A favor:** menos abstracción: Vite casi puro.
- **En contra:** el proyecto estuvo años parado antes de reactivarse (`@crxjs/vite-plugin` 3.0.0, publicado el
  2026-09-24); futuro menos claro que el de WXT.
- **Cuándo retomarla:** si un cambio incompatible de WXT, que sigue en pre-1.0, bloquea el proyecto.

### BL-13 — Plasmo

- **Estado:** Descartada. `plasmo` 0.90.5 se publicó el 2025-05-17: llevaba 18 meses sin publicar cuando se
  tomó la decisión (2026-11-19).
- **Qué es:** framework de extensiones que fue el más popular.

### BL-14 — Sin framework

- **Estado:** Descartada. Obliga a llevar a mano el manifest, el empaquetado y la recarga; incómodo para un
  panel con texto en vivo.
- **Qué es:** TypeScript y manifest escritos a mano, sin herramienta de construcción específica.
- **A favor:** ninguna dependencia de empaquetado.

## Objetivo de retardo (B6)

### BL-15 — Objetivo estricto

- **Estado:** Pendiente.
- **Qué es:** transcripción original en ≤ 0,5 s, traducción en ≤ 1 s y contexto empezando en ≤ 2 s.
- **A favor:** sensación de inmediatez.
- **En contra:** obliga a traducir frases a medias: el texto se reescribe mientras se lee y la traducción
  pierde calidad.
- **Cuándo retomarla:** si la medición con audio real muestra que Moonshine y el traductor lo alcanzan sin
  degradar la traducción.

### BL-16 — Objetivo relajado

- **Estado:** Pendiente. Plan de reserva.
- **Qué es:** transcripción original en ≤ 2 s, traducción en ≤ 4 s y contexto empezando en ≤ 6 s.
- **A favor:** frases más completas; deja margen para un modelo de voz más grande.
- **En contra:** el usuario va claramente por detrás de la conversación.
- **Cuándo retomarla:** si con audio real de llamada no se cumple el objetivo equilibrado.
- **Nota (2026-11-20):** con el audio de referencia, Tiny no llegó al 90 % de las palabras en 1 s. El usuario
  relajó solo el objetivo de la transcripción original, y a un punto intermedio: 1,5 s (B6). Los 2 s de esta
  opción los cumple entre el 95,9 y el 97,3 % de las palabras.
- **No elegido tampoco:** seguir en 1 s y bajar el porcentaje exigido del 90 al 80 %. Se cumple (85,2 a
  88,2 %), pero acepta que 1 de cada 5 palabras llegue tarde.

### BL-47 — Actualizar el texto cada 0,25 s

- **Estado:** Pendiente. Recambio ya medido si el texto se nota lento.
- **Qué es:** que el motor vuelva a pasar por el audio cada 0,25 s, en lugar de los 0,5 s que trae Moonshine.
- **A favor:** con el audio de referencia, entre el 91,9 y el 92,3 % de las palabras aparece dentro de 1 s
  (con 0,5 s, entre el 85,2 y el 88,2 %). Cumpliría el objetivo anterior, de 1 s.
- **En contra:** 1,6 veces más procesador (de 0,70 a 1,13–1,15 núcleos en este Mac) y el texto cambia el doble
  de veces mientras se lee.
- **Cuándo retomarla:** si la medición con la extensión terminada (tarea 5.2) o la llamada real (5.4) no
  cumplen los 1,5 s, o si el usuario nota el texto lento.
- **No elegido tampoco:** cada 0,1 s (90,4 % en una sola pasada: no mejora a 0,25 s, y el procesador que gasta
  está sin medir); y 0,25 s con paso automático a 0,5 s cuando el ordenador no dé abasto (hay que detectarlo y
  probarlo).

## Troceado del trabajo (B7)

### BL-17 — Change previo solo para medir proveedores

- **Estado:** Descartada. La medición cabe como primer bloque de tareas de `transcripcion-en-vivo`; un change
  aparte añadía ceremonia sin aportar nada.
- **Qué es:** cuatro changes en lugar de tres, con uno inicial dedicado solo a medir y elegir proveedor.
- **A favor:** la elección de proveedor queda como entregable propio.

### BL-18 — Un único change con todo el producto

- **Estado:** Descartada. Sería enorme y difícil de revisar, y el riesgo de latencia se descubriría tarde.
- **Qué es:** captura, transcripción, traducción, contexto y ajustes en una sola propuesta.
- **A favor:** una sola propuesta que revisar.

## Fuera de alcance del change `transcripcion-en-vivo`

Lo que el primer change deja fuera de forma expresa (ver su `proposal.md`, apartado «Fuera de alcance»).

### BL-19 — Transcribir también la voz del usuario

- **Estado:** Pendiente. **Comprometida:** es el paso siguiente a la primera versión (B11).
- **Qué es:** capturar además el micrófono del usuario, para que la transcripción recoja las dos partes de la
  conversación. La primera versión solo transcribe lo que suena en la pestaña, es decir, a los demás
  participantes.
- **A favor:** transcripción completa de la llamada; el contexto técnico podría tener en cuenta lo que el
  usuario ya ha respondido.
- **En contra:** pide permiso de micrófono; hay que mezclar o etiquetar dos fuentes de audio; el usuario no
  necesita leer ni traducir lo que él mismo dice.
- **Cuándo retomarla:** en cuanto funcione la primera versión con el audio de la pestaña.
- **Medido (2026-11-19, audio sintético):** con Moonshine Tiny y dos fuentes a la vez, el 98 % de las palabras
  llega en ≤ 1 s; con Small baja al 72 %.
- **No elegido:** incluir el micrófono ya en la primera versión, ni siquiera apagado por defecto con un
  interruptor en ajustes.
- **A verificar al retomarla:** el permiso de micrófono dentro de la extensión y el eco cuando no se usan
  auriculares.

### BL-20 — Indicar quién habla

- **Estado:** Pendiente. Decidido cómo (B11): por la fuente de audio, pestaña = los demás y micrófono = el
  usuario; llega con BL-19. Distinguir entre sí a los demás participantes sigue sin plan.
- **Qué es:** separar la transcripción por hablante.
- **A favor:** una llamada con varias personas se sigue mejor.
- **En contra:** separar por fuente no distingue a los demás entre sí. La identificación de hablantes de
  Moonshine sí lo hace, pero se midió y hunde el retardo (mediana de 1,1 s, solo el 42 % de las palabras en
  ≤ 1 s).
- **Cuándo retomarla:** si en llamadas con varios participantes el texto resulta confuso.
- **A verificar al retomarla:** si una versión posterior de Moonshine identifica hablantes sin ese coste.

### BL-21 — Guardar o exportar la transcripción

- **Estado:** Pendiente.
- **Qué es:** conservar el texto de la llamada al terminar, o exportarlo a un fichero.
- **A favor:** permite revisar la llamada después y sirve de base para un acta.
- **En contra:** la extensión pasa a almacenar lo que han dicho terceros; hay que decidir dónde se guarda,
  cuánto tiempo y con qué aviso.
- **Cuándo retomarla:** si se pide durante la validación.

### BL-22 — Seguir transcribiendo con el panel cerrado

- **Estado:** Pendiente.
- **Qué es:** mover la captura y el modelo de voz a un documento en segundo plano de la extensión,
  de modo que cerrar el panel no corte la sesión y al reabrirlo se recupere el texto.
- **A favor:** un cierre accidental del panel no pierde la sesión.
- **En contra:** más piezas y mensajes entre ellas; habría captura sin el aviso del panel a la vista, así que
  haría falta otro aviso; una captura olvidada sigue gastando procesador y batería.
- **Cuándo retomarla:** si los cierres accidentales del panel resultan un problema real.

### BL-23 — Publicación en la Chrome Web Store y avisos legales

- **Estado:** Pendiente.
- **Qué es:** distribuir la extensión por la tienda, con política de privacidad, aviso de primer uso de que se
  transcribe la llamada y recordatorio de informar a los demás participantes.
- **A favor:** instalación sin modo desarrollador y actualizaciones automáticas.
- **En contra:** revisión de la tienda y trabajo legal.
- **Cuándo retomarla:** cuando la vaya a usar alguien más que el propio usuario.
- **A verificar al retomarla:** qué pide la tienda a una extensión que descarga su modelo de voz de un servidor
  externo (B13).

## Alternativas descartadas en el diseño de `transcripcion-en-vivo`

Opciones valoradas en su `design.md` que no se construyen en ese change. Los datos de proveedores son de su
documentación oficial, consultada el 2026-11-19.

### BL-24 — Transcribir con un proveedor y traducir con otro

- **Estado:** Descartada con el replanteo de B3 (2026-11-19): ya no hay proveedores.
- **Qué es:** usar para el texto original el proveedor más rápido aunque no traduzca (Deepgram es el que mejor
  retardo publica) y un segundo servicio para traducir.
- **A favor:** cada parte se elige por separado; puede dar el menor retardo en el texto original.
- **En contra:** dos proveedores, dos claves y un salto más para traducir, que añade retardo a la traducción.
- **Cuándo retomarla:** si ningún proveedor con traducción en la misma conexión cumple los objetivos en la
  medición.

### BL-25 — AssemblyAI como proveedor

- **Estado:** Descartada para la primera medición. Publica texto provisional cada 1 a 1,5 segundos y solo
  traduce turnos terminados, mediante un modelo de lenguaje aparte, así que parte por encima de los objetivos
  de 1 y 2 segundos.
- **Qué es:** incluir AssemblyAI entre los candidatos.
- **A favor:** credencial temporal documentada para el navegador y punto de conexión europeo.
- **Cuándo retomarla:** si cambia su forma de traducir o la frecuencia de su texto provisional.

### BL-26 — Elegir proveedor en los ajustes

- **Estado:** Descartada con el replanteo de B3 (2026-11-19): ya no hay proveedores. Lo que se elige en
  ajustes es el tamaño del modelo de voz (B9).
- **Qué es:** que la extensión incluya varios proveedores y el usuario elija cuál usar. La primera versión sale
  con uno solo, el que gane la medición.
- **A favor:** permite cambiar si un proveedor falla, sube precios o va mal en un idioma concreto.
- **En contra:** más permisos en el manifest (los dominios de todos), más ajustes y más combinaciones que
  probar.
- **Cuándo retomarla:** si el proveedor elegido no cubre bien algún idioma. Los adaptadores ya quedan detrás de
  una interfaz común.

### BL-27 — Empezar a capturar con el propio clic en el icono

- **Estado:** Pendiente. Es el plan B si Chrome no deja abrir la captura desde el botón «Iniciar» del panel.
- **Qué es:** que el clic en el icono abra el panel y empiece la captura a la vez, sin botón «Iniciar».
- **A favor:** un paso menos; es lo más seguro frente al permiso que Chrome concede con el clic.
- **En contra:** la captura empieza antes de que el usuario haya visto el idioma elegido y el aviso; un clic
  por error ya empieza a transcribir. Obliga a cambiar los escenarios de inicio de la spec.
- **Cuándo retomarla:** si el primer experimento de captura falla, o si en el uso real el botón «Iniciar»
  resulta un estorbo.

### BL-28 — Recuperar lo dicho durante un corte de conexión

- **Estado:** Descartada con el replanteo de B3 (2026-11-19): el modelo va dentro de la extensión y no hay
  conexión que se pueda cortar durante la llamada.
- **Qué es:** guardar el audio mientras se reconecta con el proveedor y enviarlo al recuperar la conexión, en
  lugar de dejar una marca de tramo sin transcribir.
- **A favor:** no se pierde texto en un corte breve.
- **En contra:** justo después del corte el texto va por detrás de la conversación, en contra del objetivo de
  retardo; hay que decidir cuánto audio se guarda.
- **Cuándo retomarla:** si los cortes breves resultan frecuentes en el uso real.

### BL-48 — Permiso `tabs` para reconocer las páginas protegidas

- **Estado:** Pendiente. Salida de reserva.
- **Qué es:** pedir el permiso `tabs` para conocer siempre la dirección de la pestaña y saber si es una página
  interna de Chrome. Hoy se reconoce de otra forma: en el clic en el icono, la extensión no recibe la
  dirección de esas páginas (decisión del 2026-11-20, D7 del diseño).
- **A favor:** no depende de un comportamiento de Chrome que solo está visto con un clic simulado.
- **En contra:** es más permiso del necesario. Al instalar, Chrome avisa de que la extensión puede leer el
  historial de navegación.
- **Cuándo retomarla:** si con un clic real una página protegida llega con dirección, o una página normal
  llega sin ella.
- **No elegido tampoco:** quitar de la spec el escenario de la página protegida y dejar que se capture.

## Motor de transcripción (B8)

Opciones valoradas el 2026-11-19 al replantear B3. Las cifras son de pruebas en este Mac (MacBook Air M1, 16 GB,
Chrome 157) con audio sintético.

### BL-29 — Proveedores de transcripción en la nube

- **Estado:** Descartada. El usuario no quiere abrir cuentas ni depender de proveedores de pago; de ahí salió el
  replanteo de B3.
- **Qué es:** enviar el audio a un servicio de transcripción en streaming. Los candidatos eran Soniox, Gladia y
  Speechmatics; no se llegó a medir ninguno.
- **A favor:** no cargan el ordenador y transcriben y traducen en una misma conexión.
- **En contra:** cuenta y pago por uso; el audio de los demás participantes sale del equipo.
- **Cuándo retomarla:** solo si con audio real de llamada ningún modelo local da la calidad necesaria.

### BL-30 — Reconocimiento de voz integrado de Chrome

- **Estado:** Pendiente. Alternativa de reserva a Moonshine.
- **Qué es:** usar la Web Speech API de Chrome en modo local (`processLocally`) en lugar de un modelo propio.
- **A favor:** no hay nada que empaquetar ni parchear. Medido: palabra visible a 0,13 s de mediana y frase
  definitiva a 0,8 s del final de la voz.
- **En contra:** Chrome solo ofrece ahí el nivel de calidad `command`; los niveles `dictation` y `conversation`
  salen como no disponibles.
- **Cuándo retomarla:** si mantener el parche de Moonshine se complica o su calidad no basta con audio real.
- **A verificar al retomarla:** que funciona dentro de una extensión con el audio de la pestaña; eso no se probó.

### BL-31 — Programa local junto a la extensión

- **Estado:** Pendiente. Sin medir.
- **Qué es:** un programa instalado en el ordenador (whisper.cpp para la voz, Ollama para texto) al que la
  extensión le pasa el audio o el texto.
- **A favor:** admite modelos que no caben en el navegador.
- **En contra:** hay que instalar y arrancar algo además de la extensión. En este Mac los dos modelos de Ollama
  ya instalados pesan 9,6 y 13,8 GB y la memoria iba justa (18,5 GB en swap el día de la prueba).
- **Cuándo retomarla:** con la app de escritorio (BL-01), o si la respuesta en vivo (B2) necesita un modelo que
  no cabe en el navegador.

### BL-32 — Compilar Moonshine desde el código fuente

- **Estado:** Pendiente. Plan de reserva del parche elegido en B8 y vía para adelantar los otros idiomas
  (BL-44). **Acordada una prueba acotada** (2026-11-19), fuera del proyecto y sin retrasar la primera versión.
- **Qué es:** generar nuestro propio paquete de Moonshine a partir de su código actual, con la opción
  `-sDYNAMIC_EXECUTION=0`, que evita el `new Function` que Chrome prohíbe en las extensiones.
- **A favor:** no hay parche que mantener. El código actual ya incluye en su catálogo los modelos en vivo de
  los otros idiomas, que el paquete publicado (0.1.6) rechaza.
- **En contra:** exige montar las herramientas de compilación (emsdk 4.0.8 y cmake no están instalados en este
  Mac), compilar también ONNX Runtime y repetir la compilación con cada versión. El código actual usa modelos
  ingleses más nuevos que los medidos, así que habría que volver a medir.
- **Cuándo retomarla:** la prueba, después de replanificar `transcripcion-en-vivo`. Adoptarla, si la prueba
  sale bien o si una versión nueva del paquete cambia y el parche ya no se puede aplicar.
- **A verificar al retomarla:** que la compilación funciona con esa opción y que el resultado carga un modelo
  de otro idioma dentro de la extensión; no se ha probado nada de esto.

### BL-33 — Ejecutar Moonshine en una página `sandbox`

- **Estado:** Descartada sin probar. El parche del build ya funciona y es más simple.
- **Qué es:** cargar Moonshine en una página aislada de la extensión, donde Chrome sí permite `new Function`.
- **En contra:** una página `sandbox` no tiene acceso a las APIs de la extensión, así que el audio y el texto
  tendrían que ir y venir por mensajes.

### BL-34 — Pedir a Moonshine un paquete compatible con extensiones

- **Estado:** Pendiente. Es una acción pública: se hace solo con el ok del usuario.
- **Qué es:** abrir una incidencia en el repositorio de Moonshine pidiendo que publiquen el paquete sin
  `new Function`.
- **A favor:** si lo aceptan, desaparece el parche.
- **En contra:** depende de terceros y no tiene fecha. El 2026-11-19 no había en su repositorio ninguna
  incidencia sobre el tema.
- **Cuándo retomarla:** cuando la primera versión funcione y haya un caso concreto que enseñarles.

## Tamaño del modelo de voz (B9)

### BL-35 — Ajuste automático del tamaño según el retardo

- **Estado:** Pendiente.
- **Qué es:** que la app mida el retardo real y pase sola a un modelo más pequeño cuando el ordenador no da
  abasto, en lugar de dejar la elección al usuario.
- **A favor:** el usuario no necesita saber qué tamaño le conviene.
- **En contra:** cambiar de modelo obliga a parar la transcripción y cargarlo (0,2 a 0,8 s si ya está guardado;
  de 8 a 32 s si hay que descargarlo), así que en mitad de una llamada se pierde texto.
- **Cuándo retomarla:** si al validar se ve que el tamaño elegido a mano no es el adecuado.

### BL-36 — Tamaño fijo en el código

- **Estado:** Descartada. El usuario pidió poder elegirlo en los ajustes.
- **Qué es:** publicar la extensión con un único tamaño (Tiny), sin selector.
- **A favor:** un ajuste menos y una sola combinación que probar.

## Motor de traducción (B10)

Opciones valoradas el 2026-11-19. Solo Opus-MT se llegó a medir.

### BL-37 — Opus-MT como motor de traducción

- **Estado:** Pendiente. Es el recambio previsto para la app de escritorio (BL-01): si se hace con Electron, el
  traductor de Chrome no está disponible (incidencia `electron/electron#48567`, abierta el 2025-10-15).
- **Qué es:** un modelo abierto de traducción del inglés al español (`Xenova/opus-mt-en-es`) ejecutado dentro de
  la propia app con `@huggingface/transformers`.
- **A favor:** no depende de Chrome y cabe en la app: 115 MB en disco. Medido dentro de una extensión: carga en
  1,6 s y frase completa en 219 ms de mediana, dentro del objetivo de 2 s. Calidad parecida a la de Chrome.
- **En contra:** diez veces más lento que el traductor de Chrome (219 ms frente a 22 ms) y ocupa unos 490 MB de
  memoria. Hace falta un modelo por cada par de idiomas. Traduce la jerga igual de mal ("staging environment" →
  "entorno de puesta en escena").
- **Cuándo retomarla:** al empezar la app de escritorio.
- **A verificar al retomarla:** el retardo con Moonshine funcionando a la vez y el uso sin conexión (no
  medidos); la licencia de los ficheros convertidos; si en escritorio conviene más el traductor del sistema
  operativo.

### BL-38 — SalamandraTA con un programa local

- **Estado:** Pendiente la versión 2B, sin medir. Descartada la 7B: ocupa 4,85 GB incluso comprimida y su
  licencia es GPL-3.0.
- **Qué es:** los modelos de traducción del BSC que propuso el usuario, ejecutados fuera de la extensión con
  Ollama o similar (BL-31).
- **A favor:** al ser modelos de instrucciones, en principio se les puede pedir que respeten los términos
  técnicos (sin probar). La versión 2B tiene licencia Apache-2.0.
- **En contra:** no caben en la extensión: la 2B ocupa 1,52 GB comprimida. Exigen instalar un programa aparte.
- **Cuándo retomarla:** si la traducción literal de la jerga molesta y el glosario (BL-40) no basta.

### BL-39 — Modelos de traducción de Mozilla

- **Estado:** Descartada sin medir. El repositorio de los modelos está archivado y su motor para navegador
  (`@browsermt/bergamot-translator` 0.4.9) es de 2022.
- **Qué es:** los modelos del proyecto Firefox Translations de Mozilla.
- **A favor:** son los más pequeños: el de inglés a español ocupa unos 15 MB comprimido.

### BL-40 — Glosario de términos técnicos para la traducción

- **Estado:** Pendiente.
- **Qué es:** una lista de términos que no se traducen o que tienen traducción fija, aplicada a lo que devuelve
  el traductor. No es lo mismo que BL-04, que muestra definiciones.
- **A favor:** corrige el punto débil medido sin cambiar de motor: el traductor de Chrome convierte "staging
  environment" en "entorno de puesta en escena" y "circuit breaker" en "disyuntor".
- **En contra:** hay que crear y mantener la lista.
- **Cuándo retomarla:** al planificar el change `traduccion-en-vivo`.
- **A verificar al retomarla:** cómo aplicarlo (proteger el término antes de traducir o corregirlo después) y
  cuánto retardo añade.

## Voz sintetizada (B12)

### BL-41 — Leer la traducción en voz alta

- **Estado:** Pendiente. Aplazada por el usuario: de momento la app solo muestra texto.
- **Qué es:** que la app diga la traducción con voz sintetizada además de mostrarla.
- **A favor:** permite seguir la llamada sin mirar la pantalla.
- **En contra:** la voz se superpone a la llamada y suma carga al ordenador.
- **Cuándo retomarla:** cuando el usuario lo pida.
- **A verificar al retomarla:** el paquete de Moonshine incluye síntesis de voz (`TextToSpeech`); falta
  comprobar si tiene voz en español y cuánto tarda.

## De dónde sale el modelo de voz (B13)

### BL-42 — Tiny dentro de la extensión, Small y Medium descargables

- **Estado:** Pendiente.
- **Qué es:** incluir el modelo Tiny (51 MB) en el propio paquete de la extensión y descargar solo los otros dos
  tamaños cuando se elijan.
- **A favor:** la primera transcripción no espera a ninguna descarga (hoy la primera carga tarda 8 o 9 s) y el
  tamaño por defecto deja de depender del servidor de Moonshine.
- **En contra:** la extensión pesa 51 MB más.
- **Cuándo retomarla:** antes de repartir la extensión a otras personas.
- **A verificar al retomarla:** la carga por direcciones funciona dentro de la extensión (probada el 2026-11-19
  con el Tiny inglés, con los ficheros en el servidor de Moonshine); falta probarla con los ficheros dentro
  del paquete de la extensión.

### BL-43 — Los tres tamaños dentro de la extensión

- **Estado:** Descartada. La extensión pesaría unos 522 MB.
- **Qué es:** incluir Tiny, Small y Medium en el paquete, sin ninguna descarga.
- **A favor:** funciona sin conexión desde el primer momento, con cualquier tamaño.

### BL-46 — Descargar el modelo de voz sin que el usuario lo pida

- **Estado:** Pendiente.
- **Qué es:** que el modelo se descargue solo, al abrir el panel por primera vez y al elegir otro tamaño en los
  ajustes, en lugar de esperar a «Iniciar» o al botón «Descargar ahora».
- **A favor:** la primera transcripción no espera a ninguna descarga y el usuario no tiene que acordarse de
  prepararla.
- **En contra:** descarga entre 51 y 305 MB sin que nadie lo haya pedido, también cuando el usuario solo está
  probando tamaños en los ajustes.
- **Cuándo retomarla:** si al validar se ve que la espera de la primera vez molesta y que el botón «Descargar
  ahora» no se usa.
- **No elegido tampoco:** descargar solo al pulsar «Iniciar», sin el botón de los ajustes. Es lo más simple,
  pero la primera llamada con cada tamaño empieza siempre con una espera (8 o 9 s con Tiny, 18 con Small y 32
  con Medium en la conexión de la prueba).
