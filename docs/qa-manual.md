# Escenarios recorridos en Chrome

Escenarios de las specs comprobados en un Chrome de verdad, con su resultado y su fecha. De momento están
los de `modelo-de-voz` que se ven en la página de ajustes (tareas 2.4 y 2.5). Los demás se añaden en las tareas
3.4 y 4.7. Lo que no se ha podido recorrer está dicho.

## Cómo se ha recorrido

- **Equipo:** MacBook Air M1 (16 GB), macOS 26.6.2, Chrome 157.0.8103.79. Fecha: 2026-11-22.
- **Chrome sin ventana, con un perfil temporal** y la extensión compilada (`npm run build`). Un script abre
  el panel y los ajustes, pulsa los botones y lee lo que hay en pantalla. Los scripts son temporales y no
  están en el repositorio.
- **La captura se simula.** El panel todavía no avisa de que está capturando (llega con la tarea 3.3). El
  script toma a mano, desde la página del panel, el mismo bloqueo que tomará el panel (`translator-capture`).
- **El panel todavía transcribe siempre con Tiny.** El tamaño elegido lo usará en la tarea 4.2. De los
  escenarios que terminan en una captura solo está recorrida la parte que se ve en los ajustes.
- **«Sin conexión»** es el modo sin conexión de las herramientas de Chrome, no el Wi-Fi apagado.
- **Modelo descargado:** se parte de una copia del perfil de la tarea 2.2, que tiene el Tiny descargado de
  verdad (7 ficheros, 51 441 771 bytes).
- **El servidor del modelo no contestó.** El 2026-11-22, `download.moonshine.ai` no aceptó conexiones desde
  la red de la prueba entre las 14:41 y las 17:46, como mínimo; otros sitios sí respondían. No se sabe si
  era el servidor o esa red. Por eso **no se ha recorrido ningún escenario en el que la descarga avanza**:
  están marcados como pendientes. A cambio, se ha medido qué ocurre cuando el servidor no contesta.

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

Con la captura simulada (ver arriba).

| Escenario | Resultado | Detalle |
|---|---|---|
| Ajustes abiertos con una captura activa | Cumple | Los tres tamaños salen desactivados y se lee «Hay una transcripción en marcha. Para cambiar el tamaño del modelo, detenla primero.» Abriendo los ajustes durante la captura, desde el primer momento (0,05 s); si ya estaban abiertos, en 0,16 s. Pulsar un tamaño desactivado no cambia nada. |
| La captura termina | Cumple | Sin recargar, el selector vuelve a estar disponible y el texto desaparece: entre 0,2 y 0,5 s en dos páginas de ajustes abiertas a la vez. |
| Fuera de la spec: clic en un tamaño justo al empezar la captura | Correcto | Los ajustes miran si hay captura una vez por segundo. Con un clic hecho antes de que lo hayan visto, el tamaño **no** se guarda y el aviso aparece (0,05 s). Al terminar la captura, el aviso se retira. |

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
| Descargar antes de la llamada | **Pendiente** | Necesita el servidor del modelo. Falta ver el progreso («Descargando: N de 51 MB»), que al terminar figure «Descargado» sin «Descargar ahora», y que una segunda página de ajustes se sume a la misma descarga. |

## La descarga se puede cancelar

| Escenario | Resultado | Detalle |
|---|---|---|
| Cancelar en los ajustes | **A medias** | Con el servidor sin contestar («Descargando: 0 de 51 MB»): «Cancelar» devuelve la fila a «Pendiente de descarga» con «Descargar ahora» al instante, la petición se corta, no queda nada guardado y ningún bloqueo tomado. Con la descarga ya avanzada: **pendiente**. |

## Descarga que no se completa

Los escenarios de la spec hablan del panel (tarea 4.2). Aquí está lo que se ve en los ajustes, que muestran
el fallo en la misma fila donde iba el progreso.

| Caso | Resultado | Detalle |
|---|---|---|
| Sin conexión | Cumple | «Descargar ahora» sin conexión: en 0,05 s la fila pasa a «Descarga no completada», con «Reintentar» y el texto «No se ha podido descargar el modelo de voz: no hay conexión con el servidor de descarga. La primera vez hace falta conexión a internet.» «Reintentar», todavía sin conexión, termina igual. No queda nada guardado y el tamaño sigue sin figurar como descargado. |
| La conexión se corta a mitad | **Pendiente** | Necesita el servidor del modelo. |
| Reintento con la conexión recuperada | **Pendiente** | Necesita el servidor del modelo. |
| Falta de espacio para guardar | Sin recorrer en Chrome | Solo con pruebas automáticas: el texto es «No se ha podido guardar el modelo de voz en este ordenador. Puede que falte espacio en el disco.» |

## La descarga no espera indefinidamente al servidor

Caso real: el servidor del modelo sin contestar (ver arriba). Recorrido el 2026-11-22 a las 17:47, con
Chrome 157.0.8103.80, después de añadir el límite de 30 segundos (tarea 2.5).

| Escenario | Resultado | Detalle |
|---|---|---|
| El servidor de descarga no contesta, en los ajustes | Cumple | La fila está **30 s** en «Descargando: 0 de 51 MB», con «Cancelar». A los 30 s pasa a «Descarga no completada», con «Reintentar» y el texto de falta de conexión con el servidor. «Reintentar» termina igual, otros 30 s después. Antes del límite eran 150 s, lo que espera Chrome antes de rendirse. |
| «Cancelar» durante esa espera | Correcto | La fila vuelve a «Pendiente de descarga» al instante, y sigue así pasado el límite: no aparece ningún fallo después. No queda nada guardado ni ningún bloqueo tomado. |
| El servidor de descarga no contesta, en el panel | **Pendiente (4.2)** | El panel todavía descarga por su cuenta, sin este límite: «Iniciar» se queda 76 s en «Preparando…» y termina con «No se ha podido empezar: Failed to fetch». |
| Los datos dejan de llegar a mitad de un fichero | Sin recorrer en Chrome | Necesita el servidor del modelo. Solo con pruebas automáticas. |
| Una descarga lenta que sigue avanzando no falla | Sin recorrer en Chrome | Necesita el servidor del modelo. Solo con pruebas automáticas. |

## Pendiente

1. Con el servidor del modelo disponible: «Descargar antes de la llamada», «Cancelar en los ajustes» a mitad
   de descarga, «La conexión se corta a mitad» y «Reintento con la conexión recuperada».
2. Con la tarea 3.3: repetir los dos escenarios de captura con una captura de verdad.
3. Con la tarea 4.2: la parte de captura de «Elegir otro tamaño» y de «Reinicio del navegador», y «El
   servidor de descarga no contesta» en el panel.
4. En un Chrome con ventana: abrir los ajustes con el clic derecho en el icono → «Opciones».
