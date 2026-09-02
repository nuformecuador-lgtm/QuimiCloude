# QC-21 — ayuda-visual-de-contrasena · requirements.md

> Zona: `frontend` · Complejidad: `medium` · `depends_on`: `QC-19` · Rama: `feature/QC-21-ayuda-visual-de-contrasena`
>
> **Alcance:** el **componente reutilizable** que enseña, mientras alguien escribe una contraseña
> nueva, los requisitos que debe cumplir y cuáles va cumpliendo. Pinta a partir del catálogo
> `CREDENTIAL_RULES` que ya exporta QC-19 y **no vuelve a declarar ninguna regla**. Las seis
> reglas comprobables sin red se marcan en vivo; la séptima —contraseñas filtradas— se muestra en
> la lista pero no se resuelve hasta que responde el servidor. Mientras falte alguna de las seis,
> el formulario que lo use no se puede enviar.
>
> **Lo que NO entra:**
> - **Las reglas en sí** — las decide QC-19, que está `done`. Aquí solo se muestran.
> - **La pantalla que fija o cambia una contraseña** — va a **QC-36 (cambiar-mi-contrasena)**,
>   creada en el board el 2026-09-02 al acotar esta ficha. Hoy **no existe ninguna pantalla que
>   fije una contraseña**: el login solo verifica. Esta ficha entrega el componente y sus tests;
>   QC-36 es su primer consumidor.
> - **Puntuar la fuerza** de la contraseña (barra de "débil/fuerte"). QC-19 lo descartó
>   explícitamente y esta ficha no lo reabre.
> - **Recuperar la contraseña olvidada** — es de QC-10 y de quien no puede entrar.
>
> **Precondición heredada (no se re-crea aquí):** shadcn/ui inicializado, Tailwind, Vitest +
> Testing Library, y `components/ui/{input,label,button}.tsx`, todo montado por QC-10 y QC-11.
> De QC-19 se heredan `CREDENTIAL_RULES` (siete códigos estables, independientes del idioma) y
> `evaluateCredentialRules` — **pura, síncrona y usable en el navegador**.
>
> Sembrado por `/afinar-feature` el 2026-09-02. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Escritos por `spec_author` el 2026-09-02 sobre el archivo sembrado. **Vocabulario fijo**, para
> que ningún requisito dependa de una interpretación:
>
> - **«las seis»** = las seis reglas de `CREDENTIAL_RULES` que `evaluateCredentialRules`
>   resuelve sin red: `min_length`, `max_length`, `no_uppercase`, `no_lowercase`, `no_digit`,
>   `no_symbol`.
> - **«la séptima»** = `breached`, la de credenciales filtradas, que solo resuelve el servidor.
> - **«la candidata»** = el texto escrito en el campo. Nunca sale del componente.
> - **«el formulario consumidor»** = el `<form>` que monta el componente. Hoy no existe ninguno
>   en producción (QC-36 será el primero); en los tests es un formulario de prueba montado por
>   el propio test (R18).
>
> Cada fila de `## Decisiones cerradas` queda citada entre corchetes en el requisito que la
> cubre: `[D1]`…`[D6]`, en el orden de la tabla.

### Catálogo y evaluación — no se re-declara nada

**R1.** El sistema DEBE renderizar exactamente una entrada por cada código de `CREDENTIAL_RULES`,
en el orden declarado por ese catálogo, obteniéndolo por importación del contrato del módulo
`identity` y no de una lista propia. `[D5]`

**R2.** El sistema NO DEBE declarar umbral, expresión regular ni comprobación propia de ninguna
regla: el estado de las seis DEBE derivarse siempre del resultado de `evaluateCredentialRules`
aplicado a la candidata. `[D5]`

**R3.** SI se añade, quita o reordena un código en `CREDENTIAL_RULES`, ENTONCES el sistema DEBE
reflejar ese cambio sin modificar el componente. `[D5]`

### Marcado en vivo de las seis

**R4.** CUANDO cambia la candidata, el sistema DEBE actualizar el estado mostrado de cada una de
las seis: **cumplida** si `evaluateCredentialRules` no la devuelve en `unmet`, **incumplida** si
la devuelve. `[D2]`

**R5.** MIENTRAS la candidata esté vacía, el sistema DEBE mostrar las seis como incumplidas y la
lista completa de requisitos DEBE ser visible desde el primer render, sin que haga falta escribir,
enfocar ni apuntar con el ratón. `[D2]`

**R6.** MIENTRAS se escribe, el sistema NO DEBE realizar ninguna petición de red, invocar ninguna
Server Action ni arrastrar a su cierre de imports el adaptador de la lista de filtradas, el punto
de composición ni ningún módulo de servidor. `[D2]`

### La séptima: neutra hasta que responde el servidor

**R7.** MIENTRAS el servidor no se haya pronunciado sobre la candidata, el sistema DEBE mostrar
la séptima en un tercer estado **neutro**, distinto de cumplida y distinto de incumplida. `[D2]`

**R8.** El estado neutro DEBE ser el valor por defecto de la séptima: el sistema NO DEBE mostrarla
como cumplida ni como incumplida salvo que el formulario consumidor le pase por props el veredicto
del servidor. `[D2]`

**R9.** CUANDO el formulario consumidor comunica que el servidor rechazó la candidata por figurar
en la lista de filtradas, el sistema DEBE mostrar la séptima como incumplida, sin alterar el
estado de las seis. `[D2]`

### Bloqueo parcial del envío

**R10.** El sistema DEBE comunicar al formulario consumidor si las seis se cumplen, al montarse y
cada vez que ese resultado cambie. `[D3]`

**R11.** MIENTRAS alguna de las seis esté incumplida, el formulario consumidor DEBE mantener su
control de envío deshabilitado. `[D3]`

**R12.** MIENTRAS las seis se cumplan, el control de envío del formulario consumidor DEBE quedar
habilitado **aunque la séptima siga en estado neutro**. Es un estado legítimo del sistema: el
rechazo por credencial filtrada llega del servidor al enviar, no antes. `[D3]`

**R13.** CUANDO el servidor rechaza la candidata por filtrada y el usuario no la ha modificado, el
sistema DEBE mantener las seis como cumplidas, la séptima como incumplida y el control de envío
habilitado, de modo que reintentar sea posible tras cambiar la candidata. `[D3]`

### Cómo recibe y cómo presenta

**R14.** El sistema DEBE recibir por props todo lo que no puede derivar de la candidata —el
veredicto del servidor sobre la séptima y el texto visible de las reglas— y NO DEBE leer datos del
servidor por sí mismo. `[D1]`

**R15.** El sistema DEBE obtener el texto visible de cada regla de una **única fuente exportada**,
indexada por el código de la regla y sustituible por props, y NO DEBE contener literales de copy
repartidos por el marcado.

**R16.** El sistema DEBE distinguir los tres estados (cumplida, incumplida, neutra) por un medio
consultable programáticamente y no exclusivamente cromático, para cada una de las siete entradas.

**R17.** El sistema DEBE ocultar la candidata en el campo, y NO DEBE ofrecer ningún control de
mostrar/ocultar mientras la pregunta abierta 2 siga abierta.

### Alcance, verificación y seguridad

**R18.** El sistema DEBE poder ejercitarse por completo —las siete entradas, el bloqueo del envío
y el rechazo del servidor— montado en un formulario de prueba en jsdom, sin navegador real, sin
red y sin base de datos. `[D4]`

**R19.** El sistema NO DEBE crear ninguna ruta, página, layout, Server Action, tabla ni migración:
entrega únicamente componentes reutilizables y sus tests. `[D1]`

**R20.** El sistema NO DEBE mostrar ninguna puntuación, barra, calificación ni etiqueta de fuerza
de la candidata. `[D6]`

**R21.** El sistema NO DEBE emitir la candidata ni un fragmento suyo fuera del campo que la
contiene: ni por `console.*`, ni en un atributo del marcado, ni en el texto de ninguna entrada de
la lista.

**R22.** Ningún archivo que esta feature añada DEBE declarar un identificador que nombre la
contraseña sin terminar en `hash`, según el mismo criterio que aplica
`guard-password-never-plaintext`. `[D5]`

## Preguntas abiertas

1. **Quién decide el texto en español de cada código.** Los siete códigos de `CREDENTIAL_RULES`
   (`min_length`, `max_length`, `no_uppercase`, `no_lowercase`, `no_digit`, `no_symbol`,
   `breached`) son deliberadamente independientes del idioma: QC-19 dejó dicho que «el mensaje que
   ve una persona lo compone la UI (QC-21)». Ninguna ficha dice **cuál** es ese texto ni si el
   producto va a ser multi-idioma. El spec lo hereda como abierto.
2. **Si el campo lleva el botón de mostrar/ocultar la contraseña escrita.** No lo cubre ni esta
   ficha ni QC-30 (rediseño del login). Si entra, entra aquí; si no, hay que decir dónde.
3. **Cómo se anuncia el cambio a quien usa lector de pantalla.** Una lista que cambia de estado a
   cada pulsación puede volverse ruidosa. El repo no tiene precedente de decisión de
   accesibilidad, así que no se hereda nada.
   > Nota de `spec_author` (2026-09-02): el `design.md > 6` fija una posición **provisional y
   > declarada** —el campo describe la lista con `aria-describedby` y **no** se añade región
   > `aria-live`, que es justamente el modo de fallar ruidoso que describe la pregunta— para no
   > entregar un componente sin conducta accesible definida. La pregunta **sigue abierta**: lo
   > que falta decidir es si hace falta anuncio y de qué tipo, no si hay `aria-live` hoy.

_Abierta por el diseño (2026-09-02):_

4. **Qué medidas hereda el campo de credencial.** `docs/architecture.md > multiplataforma` exige
   `font-size >= 16px` en inputs y objetivos táctiles de 44x44 px. `components/ui/input.tsx` es
   shadcn sin editar (`h-8`, `text-base md:text-sm`), y **subirlo a 44 px es alcance de QC-29 /
   QC-30**, que no están `done` (`specs/QC-30-rediseno-login/design-input-login.md > 5`). Esta
   ficha **no edita `components/ui/`** y hereda lo que haya. Falta decidir si el componente debe
   forzar sus propias medidas mientras tanto o esperar a esas fichas.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-02 | Hoy no existe ninguna pantalla que fije o cambie una contraseña. ¿Dónde vive la ayuda? | **Solo el componente reutilizable, con sus tests.** Se crea en el board **QC-36 — cambiar-mi-contrasena** como su primer consumidor, con el link *is blocked by* QC-21. Se asume el coste: hasta que QC-36 se haga, el componente no lo ve nadie — la misma deuda que ya arrastran los 5 ítems del sidebar de QC-11. |
| 2026-09-02 | La regla de contraseñas filtradas necesita un diccionario de 1,63 MiB que solo vive en el servidor. ¿Qué hace la ayuda con ella? | **Se muestra en la lista, en estado neutro, y solo se resuelve al enviar.** Las otras seis se marcan en vivo. **Sin red mientras se escribe** y sin arrastrar el diccionario al navegador: no se consulta al servidor por pulsación ni se añade endpoint. |
| 2026-09-02 | ¿La ayuda impide enviar el formulario mientras falten requisitos? | **Sí, bloquea el envío** mientras falte alguna de las **seis comprobables en vivo**. Consecuencia aceptada: como la de filtradas no se resuelve hasta enviar, **el bloqueo es parcial** — con las seis en verde el botón se activa aunque la contraseña esté filtrada, y el rechazo llega del servidor. El spec tiene que describir ese estado, no darlo por imposible. |
| 2026-09-02 | ¿Hace falta E2E en navegador real? | **No, y se difiere aquí con motivo.** `CHECKPOINTS.md` lo pide para flujos críticos (autenticación, permisos, importes): esto es ayuda visual y no decide si se entra ni si se guarda. Lo cubren los tests de componente. Cuando exista QC-36, el E2E del flujo de cambio es de esa ficha. |
| 2026-09-02 | ¿El componente redeclara las reglas para poder evaluarlas en el navegador? | **No.** Consume `CREDENTIAL_RULES` y `evaluateCredentialRules` de QC-19, que son puras y síncronas justo para esto. Heredado de la deuda que dejó escrita QC-19: «una segunda copia es exactamente lo que "la regla vive en el dominio" vino a impedir». |
| 2026-09-02 | ¿Se puntúa la fuerza de la contraseña? | **No.** Heredado de QC-19, que lo descartó al elegir instalar solo el diccionario y no `@zxcvbn-ts/core`. Si algún día hace falta, es ficha nueva. |
