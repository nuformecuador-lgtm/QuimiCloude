# QC-19 — politica-de-contrasenas · requirements.md

> **Zona** `backend` · **Complejidad** `medium` · **depends_on** `QC-6`, `QC-7` ·
> **Rama** `feature/QC-19-politica-de-contrasenas` · **Épica** `QC-17 Identidad y acceso`
>
> **Alcance.** Definir qué hace aceptable una contraseña y hacerlo cumplir en todos los sitios
> donde alguien la fija o la cambia. Una contraseña vale si tiene **al menos 8 caracteres** e
> incluye **mayúscula, minúscula, número y símbolo**, y si no está en una lista de contraseñas
> filtradas conocidas. Cuando se rechaza, la regla devuelve **qué requisito falló**, no un
> «contraseña inválida» genérico.
>
> **Lo que NO entra.** La ayuda visual mientras se escribe —los requisitos marcándose a medida
> que se cumplen— es **QC-21**, creada el 2026-09-01 y bloqueada por esta. La caducidad de
> contraseñas y el historial de anteriores: se **descartaron** aquí, no se difirieron. Validar la
> contraseña que un usuario ya tiene guardada: quien no cumpla sigue entrando con normalidad. Y
> la marca de «debe cambiar la contraseña» en `users`, que ya la crea **QC-6**.
>
> Sembrado por `/afinar-feature` el 2026-09-01. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Vocabulario de estos requisitos:
>
> - **candidata**: la contraseña en claro que alguien pretende fijar o cambiar. No es la que ya
>   está guardada (ver **R17**).
> - **regla incumplida**: uno de los códigos estables del catálogo (`min_length`, `max_length`,
>   `no_uppercase`, `no_lowercase`, `no_digit`, `no_symbol`, `breached`). Ver **R23**.
> - **letra mayúscula / minúscula / dígito / símbolo**: definidos en **R3**–**R6** por categoría
>   Unicode, no por una lista cerrada de caracteres (`design.md > 3`; cierra la pregunta 1).

### La regla en sí

**R1.** El sistema DEBE poder evaluar una contraseña candidata contra la política y devolver un
resultado que diga si es aceptable y, si no lo es, **qué reglas incumple**. El resultado NUNCA es
un «inválida» sin detalle.

**R2.** SI la candidata tiene menos de **8 caracteres**, ENTONCES el resultado DEBE incluir la
regla incumplida `min_length` y NO DEBE ser aceptable.

**R3.** SI la candidata no contiene al menos una **letra mayúscula** (categoría Unicode `Lu`),
ENTONCES el resultado DEBE incluir `no_uppercase` y NO DEBE ser aceptable.

**R4.** SI la candidata no contiene al menos una **letra minúscula** (categoría Unicode `Ll`),
ENTONCES el resultado DEBE incluir `no_lowercase` y NO DEBE ser aceptable.

**R5.** SI la candidata no contiene al menos un **dígito** (categoría Unicode `Nd`), ENTONCES el
resultado DEBE incluir `no_digit` y NO DEBE ser aceptable.

**R6.** SI la candidata no contiene al menos un **símbolo** —cualquier carácter que no sea letra
(`L`) ni número (`N`), incluidos el espacio y la puntuación—, ENTONCES el resultado DEBE incluir
`no_symbol` y NO DEBE ser aceptable.

**R7.** SI la candidata figura en la lista de contraseñas filtradas conocidas —comparada **sin
distinguir mayúsculas de minúsculas**—, ENTONCES el resultado DEBE incluir `breached` y NO DEBE
ser aceptable, aunque cumpla longitud y composición.

**R8.** CUANDO la candidata incumple **varias** reglas a la vez, el sistema DEBE devolverlas
**todas**, no solo la primera, y siempre en el mismo orden para la misma entrada.

**R9.** CUANDO la candidata cumple todas las reglas, el sistema DEBE devolver un resultado
aceptable con la lista de reglas incumplidas **vacía**.

**R10.** El sistema NO DEBE recortar ni normalizar la candidata antes de evaluarla: un espacio
inicial o final cuenta como carácter para **R2** y como símbolo para **R6**.

**R11.** SI la candidata supera el máximo de credencial ya vigente en el repo
(`CREDENTIAL_MAX_LENGTH`, 64 caracteres; feature 5 R9/R10), ENTONCES el resultado DEBE incluir
`max_length` y NO DEBE ser aceptable.

**R12.** CUANDO la misma candidata se evalúa dos veces, el sistema DEBE devolver el mismo
resultado: la evaluación DEBE depender **solo** de la candidata y de la lista de filtradas, sin
reloj, sin azar y sin estado acumulado.

### Dónde vive y cómo se compone

**R13.** Las reglas de **longitud y composición** (R2–R6, R10, R11) DEBEN evaluarse con código
propio del dominio, de forma **pura y síncrona**, sin llamadas a red, a base de datos ni a
ninguna dependencia externa.

**R14.** La lista de contraseñas filtradas DEBE consultarse **a través de un puerto** del módulo
`identity`; el dominio NO DEBE conocer qué librería o qué fichero la implementa.

**R15.** SI la consulta de la lista de filtradas falla, ENTONCES el sistema DEBE propagar el
error con contexto y NO DEBE devolver un resultado aceptable ni un `breached` inventado.

**R16.** La política DEBE vivir en el **dominio del módulo `identity`** y exponerse por el
contrato del módulo (`lib/modules/identity/index.ts`), y ese contrato DEBE poder importarse desde
un componente de cliente sin arrastrar servidor. Ningún otro punto del repositorio DEBE declarar
su propia copia de las reglas.

**R17.** La **verificación de credenciales** (login) NO DEBE evaluar la política: MIENTRAS un
usuario tenga guardada una contraseña que no cumple, ese usuario DEBE seguir autenticando con
normalidad.

**R18.** CUANDO cualquier punto del sistema fija o cambia una contraseña —el seed inicial, un
reseteo o un alta futura—, DEBE evaluar la política **antes** de producir el hash; y SI el
resultado no es aceptable, ENTONCES NO DEBE producir hash ni escribir nada.

**R19.** El sistema DEBE hacer fallar el gate cuando un archivo de `lib/`, `app/` o `scripts/`
produzca un hash de contraseña sin referenciar la evaluación de la política (**R18** en forma
ejecutable).

### Lo que la política NO hace

**R20.** El sistema NO DEBE rechazar una candidata por ser **igual a una anterior** del mismo
usuario, y NO DEBE existir almacenamiento de contraseñas anteriores: la evaluación no recibe
historial y no lo consulta.

**R21.** Esta feature NO DEBE añadir tablas, columnas, índices ni migraciones: no hay
persistencia nueva, y el esquema queda exactamente como estaba.

**R22.** Esta feature NO DEBE exponer ruta, route handler, Server Action ni pantalla: la política
se entrega como **dato** (el resultado de **R1**) a quien la llame.

### Forma del resultado

**R23.** Cada regla incumplida DEBE identificarse con un **código estable e independiente del
idioma**, y el módulo DEBE exportar el catálogo completo de códigos, para que QC-21 pueda pintar
la lista de requisitos sin duplicar las reglas.

**R24.** El resultado NO DEBE contener la candidata ni ningún fragmento de ella, y el módulo de
la política NO DEBE escribirla en ningún canal de salida (`console.*`, `process.stdout/stderr`).

## Preguntas abiertas

1. **Qué cuenta como «símbolo».** Cualquier carácter que no sea letra ni dígito, o una lista
   cerrada. Afecta al texto del mensaje de error, no al diseño: se decide al escribir el
   requisito.
   **Resuelta al escribir el spec (2026-09-02), como preveía la propia pregunta:** símbolo es
   **cualquier carácter que no sea letra (`\p{L}`) ni número (`\p{N}`)** en Unicode — puntuación,
   signos, y también el espacio. No hay lista cerrada de caracteres permitidos. Así `ñ` cuenta
   como minúscula y no como símbolo, que es lo que una lista ASCII cerrada habría hecho mal.
   Queda en **R6** (`design.md > 3`).

2. **De dónde sale la lista de contraseñas filtradas y cuánto pesa.** Depende de qué librería
   pase los cuatro checks de salud. Si ninguna convence, la decisión de «librería para la lista»
   se reabre — es el único punto de esta ficha que puede volver al humano.

   **CERRADA el 2026-09-02.** Es **`@zxcvbn-ts/language-common`**, y solo el diccionario: **no**
   se instala `@zxcvbn-ts/core`. El leader verificó los cuatro checks contra el registro de npm y
   **pasan los cuatro** (sin `deprecated`; `4.1.3` del 2026-07-16; 1.260.688 descargas semanales;
   MIT), y **el humano la aprobó al aprobar este spec** (F1.4). Pesa ~1,9 MB desempaquetado —es
   un diccionario, no código, y solo lo consume el adaptador en servidor—. Su fila ya está en
   `docs/dependencias.md`. Detalle y comandos de reverificación en `design.md > 5.2`.

3. **Qué pasa con R7 si no se aprueba ninguna librería.** Nace de la pregunta 2 y también vuelve
   al humano. Las salidas posibles son tres y ninguna es del agente: (a) aprobar la librería
   propuesta, (b) aprobar otra, o (c) mantener una lista propia corta en el repo —lo que
   contradiría la fila «¿Librería o reglas propias?» de la tabla de decisiones y por eso solo lo
   puede decidir quien la fijó. El diseño deja `R7` detrás de un puerto justamente para que esta
   respuesta cambie una sola clase y ningún requisito (`design.md > 5.3`).

   **CERRADA el 2026-09-02 por la salida (a):** el humano aprobó la librería propuesta, así que
   la fila «¿Librería o reglas propias?» de la tabla **no se toca** y R7 se implementa contra su
   adaptador. La pregunta queda escrita porque el puerto sigue siendo el punto donde cambiar de
   lista costaría una sola clase.

**No queda ninguna pregunta abierta en esta ficha** (2026-09-02).

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-01 | ¿Qué hace aceptable una contraseña? | **Mínimo 8 caracteres, con mayúscula, minúscula, número y símbolo**, y que no esté entre las contraseñas filtradas conocidas. |
| 2026-09-01 | ¿Caduca con el tiempo? | **No.** Solo se fuerza el cambio cuando hay un motivo concreto: el primer ingreso del usuario sembrado (**QC-6**) o un reseteo. |
| 2026-09-01 | ¿Se puede repetir una contraseña anterior? | **Sí; no se guarda historial.** No hay tabla ni columna de contraseñas viejas. Descartado, no diferido. |
| 2026-09-01 | ¿Librería o reglas propias? | **Las dos cosas.** Largo y composición son comprobaciones propias: son tres líneas y no justifican una dependencia. La **lista de contraseñas filtradas sí viene de una librería**, que no tiene sentido mantener a mano. Esa dependencia entra por la regla 7 de `CLAUDE.md`: cuatro checks de salud, fila en `docs/dependencias.md` y **aprobación humana antes de instalarla**. |
| 2026-09-01 | ¿Y quien ya tiene una contraseña que no cumple? | **Sigue entrando.** La regla solo se aplica al fijar una nueva. Nadie queda fuera por una regla inventada después, y hoy no hay ningún usuario con contraseña elegida por él. |
| 2026-09-01 | ¿Entra la ayuda visual mientras se escribe? | **No**, va en **QC-21**. Por eso QC-19 es `backend` puro y **no se parte**. |
| 2026-09-01 | ¿La regla vive en el dominio o en el borde? | En el **dominio de `identity`**, no en un esquema `zod` de una pantalla: es la única forma de que el seed, el cambio de contraseña y cualquier alta futura compartan la misma regla en vez de tres copias que se desincronizan. |
| 2026-09-01 | Idioma y convenciones del esquema | Heredado de **QC-4**. Esta ficha **no añade columnas**: es regla, no persistencia. |
| 2026-09-01 | ¿Hace falta E2E (Playwright)? | **No, y se difiere con motivo.** La regla no tiene interfaz propia; el E2E que la ejercite nace con **QC-21**, que sí es pantalla. Aquí la verificación son tests unitarios del dominio: cada requisito rechazado por separado, y el mensaje que devuelve en cada caso. |
