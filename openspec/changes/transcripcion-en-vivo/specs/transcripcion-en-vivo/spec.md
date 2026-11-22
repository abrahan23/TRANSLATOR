# Spec Delta

## Purpose

Muestra por escrito en el panel, mientras se habla y en su idioma original, lo que se dice en la llamada
capturada, transcrito en el propio ordenador y con el menor retardo posible. Es el texto sobre el que después
trabajan la traducción y el contexto técnico.

## ADDED Requirements

### Requirement: Texto en vivo mientras se habla
Durante una captura activa, el panel SHALL mostrar el texto de lo que se dice en la pestaña a medida que se
reconoce, sin esperar al final de la frase ni al final de la intervención.

#### Scenario: Alguien habla en la llamada
- **WHEN** un participante empieza a hablar durante una captura activa
- **THEN** sus palabras van apareciendo en el panel mientras sigue hablando

#### Scenario: Silencio en la llamada
- **WHEN** nadie habla durante una captura activa
- **THEN** no se añade texto y el panel sigue en estado «Transcribiendo»

### Requirement: Texto provisional y texto definitivo
El texto que todavía puede corregirse SHALL mostrarse como provisional, con un aspecto distinto del
definitivo. Cuando el reconocimiento de un fragmento queda cerrado, ese fragmento SHALL pasar a definitivo, y
el texto definitivo MUST NOT cambiar después.

#### Scenario: Corrección del texto provisional
- **WHEN** el reconocimiento corrige una palabra de un fragmento que sigue abierto
- **THEN** el panel sustituye la palabra en su sitio, sin duplicar el fragmento

#### Scenario: Un fragmento pasa a definitivo
- **WHEN** el reconocimiento de un fragmento queda cerrado
- **THEN** el fragmento se muestra con el aspecto de texto definitivo y ya no se modifica

#### Scenario: La captura termina con un fragmento abierto
- **WHEN** la captura termina mientras hay texto provisional en el panel
- **THEN** ese texto se conserva y pasa a mostrarse como definitivo

### Requirement: Objetivo de retardo del texto original
Lo dicho SHALL aparecer en el panel, al menos como texto provisional, 1,5 segundos después de pronunciarse como
máximo. El objetivo se exige con el tamaño por defecto (Tiny) y se da por cumplido cuando, con el audio de
referencia del proyecto y en el ordenador de referencia, al menos el 90 % de las palabras aparece dentro de ese
plazo.

#### Scenario: Medición con el audio de referencia
- **WHEN** se reproduce el audio de referencia en una pestaña y se transcribe con la extensión, con el tamaño Tiny y en el ordenador de referencia
- **THEN** al menos el 90 % de las palabras aparece en el panel como máximo 1,5 segundos después de pronunciarse

### Requirement: Retardo medido a la vista del usuario
El panel SHALL permitir consultar el retardo medido en la sesión en curso: el valor habitual y el peor valor
registrado, en segundos.

#### Scenario: Consulta del retardo durante una captura
- **WHEN** el usuario abre el detalle de diagnóstico del panel durante una captura activa
- **THEN** ve el retardo habitual y el peor retardo de la sesión, actualizados mientras dura la captura

### Requirement: Solo se transcriben llamadas en inglés
La extensión SHALL transcribir el audio capturado como inglés. El panel SHALL indicar, antes de iniciar y
durante la captura, que esta versión solo transcribe llamadas en inglés.

#### Scenario: Aviso del idioma antes de iniciar
- **WHEN** el usuario abre el panel
- **THEN** el panel indica que solo se transcriben llamadas en inglés y no ofrece elegir otro idioma

#### Scenario: Aviso del idioma durante la captura
- **WHEN** hay una captura activa
- **THEN** el panel sigue indicando que se transcribe en inglés

### Requirement: La vista sigue al texto más reciente
El panel SHALL mantener a la vista el texto más reciente mientras el usuario no se haya desplazado hacia
atrás. Si el usuario se desplaza para releer, el panel MUST NOT mover la vista y SHALL ofrecer una forma de
volver al texto más reciente.

#### Scenario: Lectura en directo
- **WHEN** llega texto nuevo y el usuario está al final de la transcripción
- **THEN** la vista se desplaza para mostrar el texto nuevo

#### Scenario: El usuario relee texto anterior
- **WHEN** llega texto nuevo y el usuario se ha desplazado hacia atrás
- **THEN** la vista no se mueve y aparece un control para volver al texto más reciente

### Requirement: Fallo del motor de transcripción
Si el motor de transcripción deja de funcionar durante una captura, la extensión SHALL conservar el texto ya
mostrado, terminar la captura y explicar en el panel que la transcripción se ha detenido por un fallo. El panel
SHALL volver a ofrecer «Iniciar».

#### Scenario: El motor falla durante una captura
- **WHEN** el motor de transcripción deja de funcionar con una captura activa
- **THEN** la captura termina, el texto ya mostrado se conserva, el panel explica que la transcripción se ha detenido por un fallo y ofrece «Iniciar»

#### Scenario: Volver a iniciar tras un fallo
- **WHEN** el usuario pulsa «Iniciar» después de un fallo del motor
- **THEN** la transcripción vuelve a empezar y el texto nuevo continúa debajo del anterior, con una separación visible

### Requirement: Aviso cuando el ordenador no da abasto
Si durante una captura el retardo se mantiene por encima de 3 segundos durante 10 segundos seguidos, el panel
SHALL avisar de que el ordenador no puede transcribir al ritmo de la llamada y SHALL sugerir un tamaño de
modelo más pequeño cuando lo haya. MUST NOT terminar la captura ni cambiar el tamaño del modelo por ello. El
aviso SHALL desaparecer cuando el retardo vuelve a estar por debajo de 3 segundos.

#### Scenario: La transcripción se queda atrás con un tamaño grande
- **WHEN** el retardo supera los 3 segundos durante 10 segundos seguidos con el tamaño Medium
- **THEN** el panel avisa de que el ordenador no da abasto y sugiere elegir un tamaño más pequeño en los ajustes, y la captura continúa

#### Scenario: La transcripción se queda atrás con Tiny
- **WHEN** el retardo supera los 3 segundos durante 10 segundos seguidos con el tamaño Tiny
- **THEN** el panel avisa de que el ordenador no da abasto, sin sugerir otro tamaño, y la captura continúa

#### Scenario: El retardo vuelve a la normalidad
- **WHEN** el aviso está a la vista y el retardo baja de 3 segundos
- **THEN** el aviso deja de mostrarse

### Requirement: El audio y el texto no salen del ordenador
La extensión MUST NOT enviar a ningún destino el audio capturado ni el texto transcrito. Durante una captura,
la extensión MUST NOT hacer ninguna petición de red, y la transcripción SHALL seguir funcionando aunque se
pierda la conexión a internet.

#### Scenario: Tráfico de red durante una captura
- **WHEN** se inspecciona el tráfico de red de la extensión durante una captura
- **THEN** no hay ninguna petición de red

#### Scenario: Se pierde la conexión durante una captura
- **WHEN** el ordenador se queda sin conexión a internet con una captura activa
- **THEN** la transcripción continúa sin cambios

### Requirement: La transcripción no se conserva fuera del panel
El texto transcrito SHALL existir solo en el panel mientras este siga abierto. La extensión MUST NOT guardarlo
en disco, enviarlo a ningún destino ni escribirlo en registros de diagnóstico.

#### Scenario: Nueva captura sin cerrar el panel
- **WHEN** el usuario detiene una captura e inicia otra sin cerrar el panel
- **THEN** el texto anterior sigue a la vista y el nuevo continúa debajo, con una separación visible

#### Scenario: El usuario limpia la transcripción
- **WHEN** el usuario pulsa «Limpiar» sin ninguna captura activa
- **THEN** el panel queda sin texto

#### Scenario: Se cierra y se reabre el panel
- **WHEN** el usuario cierra el panel y lo vuelve a abrir
- **THEN** el panel no muestra texto de la sesión anterior
