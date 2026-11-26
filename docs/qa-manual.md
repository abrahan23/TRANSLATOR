# Escenarios recorridos en Chrome

Escenarios de las specs comprobados en un Chrome de verdad, con su resultado y su fecha. De momento están
los de `modelo-de-voz` que se ven en la página de ajustes (tareas 2.4 y 2.5), los de `captura-audio-pestana`
sobre el fin de la captura y la pestaña que no se puede capturar (tarea 3.4) y los de `transcripcion-en-vivo`
sobre el texto del panel (tarea 4.1). Los demás se añaden en la tarea 4.7. Lo que no se ha podido recorrer
está dicho.

## Cómo se ha recorrido

- **Equipo:** MacBook Air M1 (16 GB), macOS 26.6.2, Chrome 157.0.8103.79 y 157.0.8103.80. Fechas: 2026-11-22
  y, para lo que necesita que la descarga avance o una captura de verdad, 2026-11-23. Los escenarios de las
  tareas 3.4 y 4.1, el 2026-11-25 con Chrome 158.0.8127.37.
- **El clic en el icono** es el del protocolo de depuración (`Extensions.triggerAction`), no el del ratón:
  sin ventana no hay icono que pulsar.
- **La extensión que corre es la compilada.** Un perfil que ya tenía la extensión puede seguir con el
  service worker anterior aunque la carpeta haya cambiado. Desde la tarea 3.4, antes de empezar se carga
  dos veces y se compara el service worker que corre con el fichero compilado.
- **Chrome sin ventana, con un perfil temporal** y la extensión compilada (`npm run build`). Un script abre
  el panel y los ajustes, pulsa los botones y lee lo que hay en pantalla. Los scripts son temporales y no
  están en el repositorio.
- **La captura es de verdad** desde el 2026-11-23 (tarea 3.3): el panel captura una pestaña que reproduce
  audio y toma el bloqueo `translator-capture` al pulsar «Iniciar». El 2026-11-22 se simulaba: el script
  tomaba ese mismo bloqueo a mano desde la página del panel.
- **El panel todavía transcribe siempre con Tiny.** El tamaño elegido lo usará en la tarea 4.2. De los
  escenarios que terminan en una captura solo está recorrida la parte que se ve en los ajustes.
- **«Sin conexión»** es el modo sin conexión de las herramientas de Chrome, no el Wi-Fi apagado. Ese modo no
  corta un fichero que ya se está bajando: lo deja terminar y falla en la petición siguiente.
- **Modelo descargado:** el 2026-11-22 se parte de una copia del perfil de la tarea 2.2, que tiene el Tiny
  descargado de verdad (7 ficheros, 51 441 771 bytes).
- **El servidor del modelo.** El 2026-11-22, `download.moonshine.ai` no aceptó conexiones desde la red de la
  prueba entre las 14:41 y las 17:46, como mínimo; otros sitios sí respondían. No se sabe si era el servidor
  o esa red. Ese día se midió qué ocurre cuando el servidor no contesta. El 2026-11-23 volvió a contestar y,
  entre las 10:08 y las 10:21, se recorrieron los escenarios en los que la descarga avanza: con el servidor
  real y partiendo de un perfil vacío.
- **Descarga frenada.** Para que dé tiempo a verla, la velocidad se limita con las herramientas de Chrome
  (entre 0,5 y 6 MB/s, según el caso).
- **Parada a mitad de un fichero.** Ni el modo sin conexión ni el límite de velocidad de Chrome dejan una
  descarga parada a mitad de un fichero. Se consigue pausando medio minuto el proceso de red del Chrome de
  la prueba: la página sigue viva y deja de recibir datos.

## Cómo se abren los ajustes

| Punto | Resultado | Detalle |
|---|---|---|
| Enlace «Ajustes» del panel | Funciona | Abre la página de ajustes en una pestaña. Un segundo clic no abre otra. |
| Clic derecho en el icono → «Opciones» | Sin pulsar | Sin ventana no se puede usar ese menú. Sí está comprobado, con una prueba automática, que la extensión declara su página de opciones y que se abre en una pestaña. |

## Tamaño del modelo elegible en los ajustes

| Escenario | Resultado | Detalle |
|---|---|---|
| Primer uso | Cumple | Sin nada guardado: Tiny (51 MB), Small (165 MB) y Medium (305 MB), con Tiny elegido. Los tres figuran como «Pendiente de descarga» y solo Tiny ofrece «Descargar ahora». |
| Elegir otro tamaño | Cumple en los ajustes; la captura, pendiente (4.2) | Al elegir Small queda guardado como tamaño elegido, y la página del panel lee ese mismo valor. Falta que el panel transcriba con él. |

## Aviso en los tamaños más lentos

| Escenario | Resultado | Detalle |
|---|---|---|
| Elegir un tamaño más lento | Cumple | Con Small: «Small es más preciso que Tiny, pero más lento: el texto puede llegar con más retardo.» Con Medium, el mismo texto con su nombre. Aparece en 0,05 s. |
| Volver a Tiny | Cumple | El aviso desaparece. |

## El tamaño elegido se recuerda

| Escenario | Resultado | Detalle |
|---|---|---|
| Reinicio del navegador | Cumple en los ajustes; la captura, pendiente (4.2) | Con Small elegido se cierra Chrome y se abre de nuevo con el mismo perfil: los ajustes muestran Small como elegido, con su aviso. |

## El tamaño no se cambia durante una captura

Con una captura de verdad (2026-11-23, dos pasadas). El 2026-11-22, con la captura simulada, el resultado
fue el mismo.

| Escenario | Resultado | Detalle |
|---|---|---|
| Ajustes abiertos con una captura activa | Cumple | Los tres tamaños salen desactivados y se lee «Hay una transcripción en marcha. Para cambiar el tamaño del modelo, detenla primero.» Abriendo los ajustes durante la captura, desde el primer momento (0,06 y 0,10 s). Si ya estaban abiertos, 0,14 y 0,75 s después de pulsar «Iniciar»: miran una vez por segundo. Pulsar un tamaño desactivado no cambia nada. |
| La captura termina | Cumple | Sin recargar, el selector vuelve a estar disponible y el texto desaparece: entre 0,04 y 0,63 s después de «Detener», en dos páginas de ajustes abiertas a la vez. |
| Fuera de la spec: clic en un tamaño justo al empezar la captura | Correcto | Con un clic hecho antes de que los ajustes hayan visto la captura, el tamaño **no** se guarda y el aviso aparece (0,03 s). Al terminar la captura, el aviso se retira. |
| Fuera de la spec: el panel todavía está en «Preparando…» | Correcto | Los ajustes ya no dejan cambiar el tamaño: el panel toma el bloqueo al pulsar «Iniciar» (a los 0,01 s del clic), antes de cargar el modelo. Visto en la primera pasada: los ajustes se desactivaron con el panel todavía preparando. |

## Los ajustes indican qué tamaños están descargados

| Escenario | Resultado | Detalle |
|---|---|---|
| Un tamaño descargado y otro no | Cumple | Con el Tiny guardado: Tiny «Descargado», Small y Medium «Pendiente de descarga» (0,06 s, sin ninguna petición al servidor). Con Tiny elegido no se ofrece «Descargar ahora»; al elegir Small se ofrece en Small. |
| Los datos guardados se han borrado | Cumple | Chrome borra lo guardado por la extensión. Unos ajustes abiertos después muestran los tres tamaños como «Pendiente de descarga» y ofrecen «Descargar ahora» en el elegido. |
| Fuera de la spec: falta un fichero del modelo | Correcto | Con 6 de los 7 ficheros de Tiny, los ajustes lo dan por «Pendiente de descarga». |
| Fuera de la spec: se borra con los ajustes ya abiertos | Correcto, con un matiz | Mientras esa pestaña sigue a la vista, sigue diciendo «Descargado»: nadie le avisa. Se pone al día al volver a ella desde otra pestaña (visto: al instante). También está previsto que lo haga al recibir el foco; eso no se ha podido probar sin ventana. |

## Descarga anticipada desde los ajustes

| Escenario | Resultado | Detalle |
|---|---|---|
| Descargar antes de la llamada | Cumple (2026-11-23) | Con la red limitada a 6 MB/s. «Descargar ahora»: la fila va contando megabyte a megabyte hasta «Descargando: 51 de 51 MB», con «Cancelar». A los 9,6 s figura «Descargado» y ya no se ofrece «Descargar ahora»; quedan guardados los 7 ficheros. Una segunda página de ajustes que pulsa «Descargar ahora» a mitad se suma a la misma descarga: muestra el mismo progreso con «Cancelar», no pide nada al servidor (7 peticiones en total, todas de la primera página) y termina en «Descargado» sin recargar. |

## La descarga se puede cancelar

| Escenario | Resultado | Detalle |
|---|---|---|
| Cancelar en los ajustes | Cumple | Con la descarga avanzada (2026-11-23, red limitada a 4 MB/s, «Descargando: 10 de 51 MB»): «Cancelar» devuelve la fila a «Pendiente de descarga» con «Descargar ahora» al instante y sin mensaje de fallo; otra página de ajustes abierta muestra lo mismo. No se pide ningún fichero más y el que estaba a medias no se guarda. Quedan guardados los dos ficheros que ya estaban completos: el tamaño no figura como descargado y la siguiente descarga no los vuelve a pedir. Con el servidor sin contestar (2026-11-22, «Descargando: 0 de 51 MB»): igual; la petición se corta, no queda nada guardado y ningún bloqueo tomado. |

## Descarga que no se completa

Los escenarios de la spec hablan del panel (tarea 4.2). Aquí está lo que se ve en los ajustes, que muestran
el fallo en la misma fila donde iba el progreso.

| Caso | Resultado | Detalle |
|---|---|---|
| Sin conexión | Cumple | «Descargar ahora» sin conexión: en 0,05 s la fila pasa a «Descarga no completada», con «Reintentar» y el texto «No se ha podido descargar el modelo de voz: no hay conexión con el servidor de descarga. La primera vez hace falta conexión a internet.» «Reintentar», todavía sin conexión, termina igual. No queda nada guardado y el tamaño sigue sin figurar como descargado. |
| La conexión se corta a mitad | Cumple en los ajustes (2026-11-23) | Dos formas de cortar. **Modo sin conexión** a los 12 de 51 MB: Chrome deja terminar el fichero que se estaba bajando y falla al pedir el siguiente; 3,2 s después del corte la fila pasa a «Descarga no completada», con «Reintentar» y el texto de falta de conexión de la fila anterior. **Datos que dejan de llegar** a los 37 de 51 MB (ver la sección siguiente): a los 30 s, «Descarga no completada», «Reintentar» y «La descarga del modelo de voz no se ha completado: se ha cortado antes de terminar.» En los dos casos el tamaño no figura como descargado y solo quedan guardados los ficheros completos (3 de 7). |
| Reintento con la conexión recuperada | Cumple en los ajustes (2026-11-23); que empiece la transcripción, pendiente (4.2) | Después de cada uno de los dos cortes: «Reintentar» pide solo los 4 ficheros que faltaban y la fila termina en «Descargado», sin botón (a los 5,8 s y a los 1,9 s). Tras el primero, otra página de ajustes abierta pasa a «Descargado» sin recargar. Matiz: al pulsar, la fila dice «Descargando: 0 de 51 MB» durante una décima de segundo como mucho, antes de contar lo ya guardado (35 de 51 MB). Anotado en el BACKLOG (BL-53). |
| Falta de espacio para guardar | Sin recorrer en Chrome | Solo con pruebas automáticas: el texto es «No se ha podido guardar el modelo de voz en este ordenador. Puede que falte espacio en el disco.» |

## La descarga no espera indefinidamente al servidor

Caso real: el servidor del modelo sin contestar (ver arriba). Recorrido el 2026-11-22 a las 17:47, con
Chrome 157.0.8103.80, después de añadir el límite de 30 segundos (tarea 2.5). Las dos últimas filas, el
2026-11-23, ya con el servidor disponible.

| Escenario | Resultado | Detalle |
|---|---|---|
| El servidor de descarga no contesta, en los ajustes | Cumple | La fila está **30 s** en «Descargando: 0 de 51 MB», con «Cancelar». A los 30 s pasa a «Descarga no completada», con «Reintentar» y el texto de falta de conexión con el servidor. «Reintentar» termina igual, otros 30 s después. Antes del límite eran 150 s, lo que espera Chrome antes de rendirse. Repetido el 2026-11-23 con el servidor disponible y la red limitada a 1 byte por segundo, que deja una petición sin respuesta: igual, a los 30 s. |
| «Cancelar» durante esa espera | Correcto | La fila vuelve a «Pendiente de descarga» al instante, y sigue así pasado el límite: no aparece ningún fallo después. No queda nada guardado ni ningún bloqueo tomado. |
| El servidor de descarga no contesta, en el panel | **Pendiente (4.2)** | El panel todavía descarga por su cuenta, sin este límite: «Iniciar» se queda 76 s en «Preparando…» y termina con «No se ha podido empezar: Failed to fetch». |
| Los datos dejan de llegar a mitad de un fichero | Cumple (2026-11-23) | Con la red limitada a 0,5 MB/s, a los 37 de 51 MB (a mitad del cuarto fichero) se pausa el proceso de red del Chrome de la prueba. La fila sigue en «Descargando: 37 de 51 MB», con «Cancelar», durante **30,0 s**; después pasa a «Descarga no completada», con «Reintentar» y «La descarga del modelo de voz no se ha completado: se ha cortado antes de terminar.» La petición queda cancelada, el fichero a medias no se guarda y no queda ningún bloqueo tomado. |
| Una descarga lenta que sigue avanzando no falla | Cumple (2026-11-23) | Con la red limitada a 60 kB/s durante 80 s: la fila avanza un megabyte cada 17 s (de 35 a 40 de 51 MB) y no falla; «Cancelar» responde al instante. Con 300 bytes por segundo durante 100 s (llegan 1 500 bytes cada 5 s): tampoco falla. |

## Fin de la captura

Recorrido el 2026-11-25 con Chrome 158.0.8127.37 y el Tiny ya guardado: no se descarga nada. La pestaña
capturada reproduce voz en inglés. Después de cada caso se mira que no queda nada en marcha: Chrome no da
ninguna pestaña por capturada, la pista de audio está terminada, los dos contextos de audio cerrados y el
bloqueo `translator-capture` libre. Las medidas están en `docs/medicion.md` (3.4).

| Escenario | Resultado | Detalle |
|---|---|---|
| El usuario detiene la captura | Cumple | Con texto ya en pantalla, «Detener»: el panel vuelve a ofrecer «Iniciar» 4 ms después del clic, sin ningún mensaje y con el texto conservado. No queda nada en marcha. |
| Se cierra el panel | Cumple, cerrándolo desde el script | Con una captura en marcha y texto llegando se cierra la página del panel. A los 0,48 s ya no existe, y con ella se van el motor y su modelo; en ese mismo momento el bloqueo queda libre y la pestaña deja de estar capturada. La pestaña sigue abierta. Un panel abierto después empieza vacío y vuelve a capturar. Falta cerrarlo con su X en un Chrome con ventana. |
| Se cierra la pestaña capturada | Cumple | Ocho veces: cuatro cerrándola desde fuera y cuatro desde la extensión, la mitad con voz sonando y la mitad en silencio. El panel vuelve a «Iniciar» con «La pestaña que se estaba transcribiendo se ha cerrado. El texto se conserva.» entre 36 y 90 ms después del cierre. En ninguna queda nada en marcha. |
| La pestaña capturada navega a otra página | Cumple | A otra página del mismo sitio y a una de otro sitio. La captura sigue con la misma pestaña, el panel sigue en «Transcribiendo» sin ningún mensaje y al motor le siguen llegando 20 bloques de audio por segundo. Con voz en la página nueva llega texto nuevo. «Detener» la termina después. Matiz: el panel sigue mostrando el título de la primera página (BL-54). |
| Fuera de la spec: clic en el icono desde otra pestaña durante la captura, y la capturada se cierra | Correcto | El panel dice que la pestaña se cerró y pasa a mostrar la otra, lista para «Iniciar». |
| Fuera de la spec: Chrome deja de capturar con la pestaña abierta | Correcto | Forzado desde el script: no se conoce ninguna forma real de que ocurra. El panel vuelve a «Iniciar» en 23 ms y dice que Chrome ha dejado de capturar la pestaña, que el texto se conserva y que se pulse «Iniciar» para seguir. No dice que la pestaña se cerró. |
| Fuera de la spec: la página capturada se rompe | **La captura no termina** | Con la página rota a propósito y la pestaña todavía abierta, 8 s después el panel sigue en «Transcribiendo»: Chrome no avisa de nada y sigue entregando bloques de audio, sin que llegue texto nuevo. «Detener» la termina. Anotado en el BACKLOG (BL-59). |

## Pestaña que no se puede capturar

Recorrido el 2026-11-25, como la sección anterior. Después de cada «Iniciar» se lee el panel unas 65 veces
durante 1,5 s: en ningún caso llega a decir «Transcribiendo».

| Escenario | Resultado | Detalle |
|---|---|---|
| Página protegida del navegador | Cumple; la tienda de extensiones, sin recorrer | Con `chrome://version`, `chrome://extensions`, `chrome://newtab` y `chrome://settings`. El clic en el icono abre el panel, que muestra «Pestaña: sin título». «Iniciar»: «Esta página es del navegador y no se puede transcribir. Abre la llamada en otra pestaña y haz clic en el icono de TRANSLATOR desde ella.» El panel no pasa por «Preparando…», no se pide la captura a Chrome y no queda nada en marcha. Con un clic en el icono desde la pestaña de la llamada, el mensaje desaparece. La tienda de extensiones no se ha podido abrir con el perfil temporal. |
| La extensión no se ha activado en esa pestaña | Cumple | Después del clic en el icono, la pestaña pasa a una página de otro sitio y se pulsa «Iniciar». A los 0,3 s: «Chrome no permite capturar esta pestaña porque TRANSLATOR no está activado en ella. Haz clic en el icono de TRANSLATOR en la pestaña de la llamada.» No queda nada en marcha. Con un clic en el icono desde esa pestaña el mensaje desaparece, e «Iniciar» la captura. |
| Fuera de la spec: la pestaña objetivo se cerró antes de «Iniciar» | Correcto | A los 0,3 s: «La pestaña se ha cerrado. Haz clic en el icono de TRANSLATOR en la pestaña de la llamada.» Igual si la que se cerró era la que se estaba transcribiendo y se vuelve a pulsar «Iniciar» sin elegir otra. |
| Fuera de la spec: `about:blank`, `data:` y `view-source:` | Correcto, con un matiz | Llegan sin dirección, como las páginas del navegador, y reciben el mismo mensaje. No se capturan. El mensaje las llama «del navegador» (BL-58). |
| Fuera de la spec: una página abierta desde un fichero del ordenador | Se captura | Llega con su dirección y su título, e «Iniciar» la transcribe como a cualquier otra. |
| Fuera de la spec: clic en el icono en una pestaña recién abierta, antes de que cargue nada | **Mensaje equivocado** | El clic llega sin dirección y la pestaña queda anotada como página del navegador. Ya cargada, «Iniciar» dice que es del navegador, y no lo es. Con otro clic en el icono queda bien y se captura. Anotado en el BACKLOG (BL-58). |
| Fuera de la spec: se hace lo que pide el mensaje y la pestaña tiene el mismo título | **El mensaje se queda** | La pestaña cambia a una página de otro sitio con el mismo título; «Iniciar» pide el clic en el icono; se hace, y el mensaje sigue en el panel. «Iniciar» funciona y entonces lo quita. Anotado en el BACKLOG (BL-57). |

En el caso de la extensión sin activar y en el de la pestaña cerrada antes de «Iniciar», el panel dice
durante unas décimas «Descargando el modelo de voz…» antes del mensaje, aunque el modelo ya está guardado
(BL-55). Con una página protegida no: el mensaje sale al instante.

## Texto del panel

Recorrido el 2026-11-25 con Chrome 158.0.8127.37 y el Tiny ya guardado: no se descarga nada. La pestaña
capturada reproduce el audio de referencia (voz en inglés). Son los escenarios de `transcripcion-en-vivo`
que dependen del estado del panel (tarea 4.1). Las medidas están en `docs/medicion.md` (4.1).

| Escenario | Resultado | Detalle |
|---|---|---|
| Silencio en la llamada | Cumple | Captura de 10 s con la pestaña en silencio: no aparece ningún texto y el panel sigue en «Transcribiendo». Al detenerla no queda un hueco ni una separación de más. |
| Corrección del texto provisional | Cumple | El mismo párrafo provisional cambia de texto en su sitio: de «But» a «You just go.»; en otra pasada, de «Let me just go.» a «Let me just go on and let it go». En todo el recorrido no hay más de un párrafo provisional a la vez ni dos párrafos seguidos con el mismo texto. Las primeras frases del audio son tan cortas («Um,», «Okay.») que pasan a definitivo sin corrección intermedia: la corrección se ve con unos segundos más de voz. |
| Un fragmento pasa a definitivo | Cumple | El texto provisional va en cursiva y gris; al cerrarse pasa a letra normal. Los fragmentos definitivos no cambian después: ni durante la captura, ni al detenerla, ni al hacer otra. |
| La captura termina con un fragmento abierto | Cumple, con un matiz | «Detener» con «You just go.» en provisional: 82 ms después el panel ofrece «Iniciar», no queda nada provisional y hay un fragmento definitivo más, una sola vez. Matiz: el texto definitivo es la última versión que da el motor al cerrar («You just get on it and then you'»), no letra por letra el que se veía al pulsar. |
| Nueva captura sin cerrar el panel | Cumple | El texto anterior sigue igual y el nuevo va debajo, en su propio bloque, con una línea discontinua encima. La línea aparece con el primer texto nuevo, no al pulsar «Iniciar». |
| El usuario limpia la transcripción | Cumple | Con cinco fragmentos en dos bloques y un aviso a la vista, «Limpiar»: el panel queda sin texto, con la frase «Aquí aparecerá el texto de la llamada.», sin el aviso y con «Limpiar» apagado. No se pone nada en marcha. La captura siguiente empieza arriba, sin separación. |
| Se cierra y se reabre el panel | Cumple | Visto en «Se cierra el panel» de la sección «Fin de la captura», repetida hoy con el panel nuevo: un panel abierto después empieza vacío. Además, un segundo panel abierto durante una captura no muestra el texto del primero. |
| Fuera de la spec: «Limpiar» con una captura en marcha | Correcto | Está apagado en «Preparando…», «Transcribiendo» y «Deteniendo…», y pulsarlo desde el script no quita nada. También está apagado cuando no hay texto. |
| Fuera de la spec: un «Iniciar» que no llega a empezar entre dos capturas | Correcto | En una página del navegador: sale el aviso, el texto sigue igual y no queda ningún bloque vacío ni una separación de más. |
| Fuera de la spec: otro panel abierto durante la captura | Correcto | Dice «Ya hay una transcripción en marcha en otra ventana. Para empezar aquí, detenla primero.», con «Iniciar» y «Limpiar» apagados. Al detener la captura, quita el aviso y ofrece «Iniciar» (0,9 s después). El panel que captura no enseña ese aviso en ningún momento del recorrido. |
| Fuera de la spec: panel estrecho (320 px) | Correcto | La fila de botones no se sale y «Limpiar» queda al final, en el mismo sitio con y sin el texto del estado. |

Con el modelo ya guardado, cada «Iniciar» sigue pasando unas décimas por «Descargando el modelo de voz…»
(BL-55).

## Pendiente

1. Con la tarea 4.2: la parte de captura de «Elegir otro tamaño» y de «Reinicio del navegador»; en el panel,
   que es donde los sitúa la spec, «La conexión se corta a mitad», «Reintento con la conexión recuperada» y
   «El servidor de descarga no contesta».
2. En un Chrome con ventana: abrir los ajustes con el clic derecho en el icono → «Opciones».
3. En un Chrome con ventana: el clic con el ratón en el icono desde una página del navegador, cerrar el
   panel con su X durante una captura y la tienda de extensiones como página protegida.
4. Con la tarea 4.2: «Iniciar» en una pestaña que no se puede capturar cuando el modelo todavía no está
   descargado. Según el diseño (D5), el aviso llega después de la descarga.
5. Con la tarea 4.5: que el motor falle a mitad de una captura. Se vio en la tarea 3.1 (`docs/medicion.md`)
   y el mensaje no ha cambiado, pero el 2026-11-25 no se ha repetido.
