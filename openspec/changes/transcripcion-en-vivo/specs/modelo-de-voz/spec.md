# Spec Delta

## Purpose

Define cómo llega al ordenador el modelo de voz con el que se transcribe: qué tamaño se usa y quién lo elige,
cuándo se descarga, dónde queda guardado y qué ve el usuario mientras el modelo no está listo o cuando no se
puede descargar.

## ADDED Requirements

### Requirement: Tamaño del modelo elegible en los ajustes
La página de ajustes SHALL permitir elegir el tamaño del modelo de voz entre Tiny, Small y Medium, e indicar
junto a cada uno cuánto ocupa su descarga. Si el usuario no ha elegido ninguno, el tamaño SHALL ser Tiny. El
tamaño elegido SHALL ser el que se use en la siguiente captura.

#### Scenario: Primer uso
- **WHEN** el usuario abre los ajustes sin haber elegido nunca un tamaño
- **THEN** ve los tres tamaños con lo que ocupa cada uno, y Tiny aparece como el elegido

#### Scenario: Elegir otro tamaño
- **WHEN** el usuario elige Small en los ajustes y después inicia una captura
- **THEN** la transcripción de esa captura se hace con el modelo Small

### Requirement: Aviso en los tamaños más lentos
Al elegir Small o Medium, los ajustes SHALL avisar de que ese tamaño es más preciso pero más lento y de que el
texto puede llegar con más retardo. Con Tiny MUST NOT mostrarse ese aviso.

#### Scenario: Elegir un tamaño más lento
- **WHEN** el usuario elige Small o Medium
- **THEN** los ajustes muestran el aviso de que es más preciso y más lento

#### Scenario: Volver a Tiny
- **WHEN** el usuario vuelve a elegir Tiny
- **THEN** el aviso deja de mostrarse

### Requirement: El tamaño elegido se recuerda
El tamaño elegido SHALL seguir siendo el mismo tras cerrar y volver a abrir el navegador.

#### Scenario: Reinicio del navegador
- **WHEN** el usuario eligió Small y reinicia el navegador
- **THEN** los ajustes siguen mostrando Small como el elegido y la siguiente captura lo usa

### Requirement: El tamaño no se cambia durante una captura
Mientras haya una captura activa, los ajustes MUST NOT permitir cambiar el tamaño del modelo y SHALL explicar
que antes hay que detener la transcripción.

#### Scenario: Ajustes abiertos con una captura activa
- **WHEN** el usuario abre los ajustes mientras hay una captura activa
- **THEN** el selector de tamaño está desactivado y un texto explica que hay que detener la transcripción para cambiarlo

#### Scenario: La captura termina
- **WHEN** la captura termina con los ajustes abiertos
- **THEN** el selector de tamaño vuelve a estar disponible sin necesidad de recargar los ajustes

### Requirement: Los ajustes indican qué tamaños están descargados
Los ajustes SHALL indicar, para cada tamaño, si su modelo ya está guardado en el navegador o si todavía hay que
descargarlo. Esa indicación SHALL reflejar lo que hay guardado de verdad en ese momento.

#### Scenario: Un tamaño descargado y otro no
- **WHEN** el usuario abre los ajustes con el modelo Tiny ya guardado y el Small sin descargar
- **THEN** Tiny aparece como descargado y Small como pendiente de descarga

#### Scenario: Los datos guardados se han borrado
- **WHEN** los datos que la extensión guarda en el navegador se han borrado y el usuario abre los ajustes
- **THEN** ningún tamaño aparece como descargado

### Requirement: Descarga del modelo al iniciar
Si al pulsar «Iniciar» el modelo del tamaño elegido no está guardado, la extensión SHALL descargarlo, mostrar
en el panel el progreso de la descarga y, al terminar, empezar la captura sin que el usuario tenga que volver a
pulsar. Mientras dura la descarga MUST NOT capturarse audio.

#### Scenario: Primera transcripción con un tamaño
- **WHEN** el usuario pulsa «Iniciar» y el modelo del tamaño elegido no está guardado
- **THEN** el panel indica que se está descargando el modelo de voz, muestra cuánto lleva descargado del total y, al terminar, la transcripción empieza sola

#### Scenario: Modelo ya guardado
- **WHEN** el usuario pulsa «Iniciar» y el modelo del tamaño elegido ya está guardado
- **THEN** no se descarga nada y la transcripción empieza

#### Scenario: Descarga ya en marcha desde los ajustes
- **WHEN** el usuario pulsa «Iniciar» mientras ese mismo modelo se está descargando desde los ajustes
- **THEN** el panel muestra el progreso de esa descarga, no empieza otra, y la transcripción empieza al terminar

### Requirement: Descarga anticipada desde los ajustes
Los ajustes SHALL ofrecer «Descargar ahora» para el tamaño elegido cuando su modelo no está guardado, y SHALL
mostrar el progreso de la descarga. Al terminar, ese tamaño SHALL aparecer como descargado.

#### Scenario: Descargar antes de la llamada
- **WHEN** el usuario pulsa «Descargar ahora» con el modelo del tamaño elegido sin descargar
- **THEN** los ajustes muestran cuánto lleva descargado del total y, al terminar, el tamaño aparece como descargado y deja de ofrecerse «Descargar ahora»

#### Scenario: Iniciar después de la descarga anticipada
- **WHEN** el usuario pulsa «Iniciar» tras haber completado la descarga desde los ajustes
- **THEN** la transcripción empieza sin ninguna descarga

### Requirement: La descarga se puede cancelar
El usuario SHALL poder cancelar una descarga en curso, tanto en el panel como en los ajustes. Tras cancelarla,
MUST NOT quedar ninguna captura activa y el modelo MUST NOT darse por descargado.

#### Scenario: Cancelar en el panel
- **WHEN** el usuario pulsa «Cancelar» mientras el panel muestra la descarga
- **THEN** la descarga se detiene, no empieza ninguna captura y el panel vuelve a ofrecer «Iniciar»

#### Scenario: Cancelar en los ajustes
- **WHEN** el usuario pulsa «Cancelar» durante una descarga iniciada con «Descargar ahora»
- **THEN** la descarga se detiene y el tamaño sigue apareciendo como pendiente de descarga

### Requirement: Descarga que no se completa
Si la descarga no puede completarse (sin conexión, servidor no disponible, descarga interrumpida o falta de
espacio para guardarla), la extensión SHALL explicarlo en lenguaje llano allí donde se mostraba el progreso, no
dejar ninguna captura activa y ofrecer «Reintentar». Un modelo descargado a medias MUST NOT darse por
descargado ni usarse para transcribir.

#### Scenario: Primer uso sin conexión
- **WHEN** el usuario pulsa «Iniciar» sin conexión y el modelo del tamaño elegido no está guardado
- **THEN** el panel explica que no se ha podido descargar el modelo de voz y que la primera vez hace falta conexión, no queda ninguna captura activa y se ofrece «Reintentar»

#### Scenario: La conexión se corta a mitad de la descarga
- **WHEN** la conexión se pierde durante la descarga
- **THEN** el panel indica que la descarga no se ha completado y ofrece «Reintentar», y el modelo no aparece como descargado

#### Scenario: Reintento con la conexión recuperada
- **WHEN** el usuario pulsa «Reintentar» en el panel con la conexión recuperada
- **THEN** la descarga se completa y la transcripción empieza

### Requirement: La descarga no espera indefinidamente al servidor
Si durante una descarga pasan 30 segundos sin que llegue nada del servidor, la extensión SHALL darla por no
completada, igual que cualquier otra descarga que no se completa. Mientras sigan llegando datos, aunque sea
despacio, la descarga MUST NOT darse por fallida por ese motivo.

#### Scenario: El servidor de descarga no contesta
- **WHEN** durante una descarga pasan 30 segundos sin que llegue nada del servidor
- **THEN** la descarga se da por no completada: se explica allí donde se mostraba el progreso y se ofrece «Reintentar»

### Requirement: Con el modelo guardado no hace falta conexión
Una vez descargado, el modelo de un tamaño SHALL quedar guardado en el navegador. Las transcripciones
siguientes con ese tamaño SHALL poder empezar sin conexión a internet, y el modelo MUST NOT volver a
descargarse mientras siga guardado.

#### Scenario: Transcribir sin conexión
- **WHEN** el usuario pulsa «Iniciar» sin conexión a internet y el modelo del tamaño elegido ya está guardado
- **THEN** la transcripción empieza con normalidad

#### Scenario: Tras reiniciar el navegador
- **WHEN** el usuario reinicia el navegador y pulsa «Iniciar» con un tamaño ya descargado
- **THEN** la transcripción empieza sin ninguna descarga

### Requirement: Modelo guardado que no se puede usar
Si un modelo que figura como descargado no se puede poner en marcha, la extensión SHALL explicarlo en el panel,
no dejar ninguna captura activa y ofrecer volver a descargarlo.

#### Scenario: Modelo guardado dañado
- **WHEN** el usuario pulsa «Iniciar» y el modelo guardado no se puede poner en marcha
- **THEN** el panel explica que el modelo de voz no se ha podido preparar, no queda ninguna captura activa y se ofrece «Volver a descargar»

#### Scenario: Volver a descargar
- **WHEN** el usuario pulsa «Volver a descargar» y la descarga se completa
- **THEN** la transcripción empieza con el modelo recién descargado
