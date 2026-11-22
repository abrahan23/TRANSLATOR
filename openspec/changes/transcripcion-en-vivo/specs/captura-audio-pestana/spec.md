# Spec Delta

## Purpose

Permite al usuario capturar el audio de la pestaña en la que tiene una llamada, siempre por decisión suya, sin
dejar de oírla y con un aviso visible mientras dura. Es la fuente de audio de la que parten la transcripción,
la traducción y el contexto técnico.

## ADDED Requirements

### Requirement: La captura empieza solo por acción expresa del usuario
La extensión SHALL empezar a capturar el audio de una pestaña solo cuando el usuario pulsa «Iniciar» en el
panel. MUST NOT capturar audio al instalarse, al arrancar el navegador, al cargar una página ni al abrir el
panel.

#### Scenario: Inicio en la pestaña de la llamada
- **WHEN** el usuario hace clic en el icono de la extensión desde la pestaña de la llamada y pulsa «Iniciar» en el panel, con el modelo de voz ya descargado
- **THEN** la extensión captura el audio de esa pestaña y el panel pasa al estado «Transcribiendo»

#### Scenario: Abrir el panel no captura nada
- **WHEN** el usuario abre el panel y no pulsa «Iniciar»
- **THEN** no se captura audio ni empieza ninguna descarga

### Requirement: La pestaña que se captura está identificada
La pestaña objetivo SHALL ser aquella desde la que el usuario hizo clic por última vez en el icono de la
extensión. El panel SHALL mostrar el título de esa pestaña antes de iniciar y durante toda la captura.

#### Scenario: Pestaña objetivo antes de iniciar
- **WHEN** el usuario hace clic en el icono de la extensión desde una pestaña y no hay ninguna captura activa
- **THEN** el panel muestra el título de esa pestaña como la que se va a capturar

#### Scenario: El usuario cambia de pestaña durante la captura
- **WHEN** hay una captura activa y el usuario pasa a otra pestaña de la misma ventana
- **THEN** la captura sigue sobre la pestaña original y el panel sigue mostrando su título y su transcripción

### Requirement: La llamada sigue oyéndose durante la captura
Mientras se captura, el usuario SHALL seguir oyendo el audio de la pestaña sin cortes y sin pérdida apreciable
de calidad. Al terminar la captura, el audio de la pestaña MUST seguir sonando con normalidad.

#### Scenario: Audio durante la captura
- **WHEN** se inicia la captura de una pestaña en la que está sonando una llamada
- **THEN** el usuario sigue oyendo la llamada por la misma salida de audio, sin silencios ni eco

#### Scenario: Audio al terminar la captura
- **WHEN** el usuario detiene la captura mientras la llamada continúa
- **THEN** la llamada sigue oyéndose sin interrupción

### Requirement: Una sola captura activa
SHALL haber como máximo una captura activa. Mientras exista, el panel MUST NOT ofrecer iniciar otra: para
capturar una pestaña distinta, el usuario detiene antes la captura en curso.

#### Scenario: Clic en el icono desde otra pestaña con una captura activa
- **WHEN** hay una captura activa sobre la pestaña A y el usuario hace clic en el icono de la extensión desde la pestaña B
- **THEN** la captura de A continúa, no empieza ninguna captura de B y el panel sigue indicando que transcribe A

### Requirement: Fin de la captura
La captura SHALL terminar cuando el usuario pulsa «Detener», cuando se cierra el panel o cuando se cierra la
pestaña capturada. Tras terminar, MUST NOT quedar audio capturándose ni el modelo de voz trabajando.

#### Scenario: El usuario detiene la captura
- **WHEN** el usuario pulsa «Detener»
- **THEN** la captura termina y el panel vuelve a ofrecer «Iniciar»

#### Scenario: Se cierra el panel
- **WHEN** el usuario cierra el panel con una captura activa
- **THEN** la captura termina y el modelo de voz deja de trabajar

#### Scenario: Se cierra la pestaña capturada
- **WHEN** el usuario cierra la pestaña que se está capturando
- **THEN** la captura termina y el panel informa de que la pestaña se cerró

#### Scenario: La pestaña capturada navega a otra página
- **WHEN** la pestaña que se está capturando carga otra página sin cerrarse
- **THEN** la captura continúa hasta que se cumpla una de las condiciones de fin

### Requirement: Aviso visible mientras se captura
Mientras haya una captura activa, el panel SHALL mostrar de forma permanente un aviso de que el audio de la
pestaña se está capturando, y de que se transcribe en este ordenador y no se envía a ningún sitio. El aviso
MUST desaparecer en cuanto termina la captura.

#### Scenario: Aviso durante la captura
- **WHEN** hay una captura activa y el usuario se desplaza por la transcripción
- **THEN** el aviso sigue a la vista en el panel

#### Scenario: Aviso al terminar
- **WHEN** la captura termina por cualquiera de las condiciones de fin
- **THEN** el aviso deja de mostrarse

### Requirement: Pestaña que no se puede capturar
Si la pestaña objetivo no puede capturarse, la extensión SHALL explicar en el panel qué ocurre y qué puede
hacer el usuario, y MUST NOT quedar en estado «Transcribiendo».

#### Scenario: Página protegida del navegador
- **WHEN** el usuario pulsa «Iniciar» y la pestaña objetivo es una página interna del navegador o de su tienda de extensiones
- **THEN** el panel indica que esa página no se puede transcribir y no se inicia ninguna captura

#### Scenario: La extensión no se ha activado en esa pestaña
- **WHEN** el usuario pulsa «Iniciar» y el navegador no permite capturar la pestaña porque la extensión no se activó desde ella
- **THEN** el panel pide hacer clic en el icono de la extensión desde la pestaña de la llamada y no se inicia ninguna captura
