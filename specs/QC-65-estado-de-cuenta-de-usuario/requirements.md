# QC-65 — estado-de-cuenta-de-usuario · requirements.md

> Zona: `backend` · Complejidad: `low` · depends_on: `QC-47` ·
> Rama: `feature/QC-65-estado-de-cuenta-de-usuario`
>
> **Alcance.** El usuario gana un estado de cuenta con cuatro valores en inglés —`active`,
> `pending`, `inactive`, `blocked`— más el rastro de su último cambio: cuándo fue y quién lo
> hizo. Esta ficha SOLO agrega esas columnas, su migración y su persistencia sobre el modelo de
> usuarios que ya existe. Nadie lee todavía el estado para decidir nada.
>
> **Lo que NO entra.** Que el estado mande en el acceso —solo `active` entra al login, el bloqueo
> por intentos fallidos de QC-19 pasa a escribir `blocked`, el desbloqueo manual limpia el contador
> de intentos, y qué ocurre con una sesión ya abierta— → **QC-78**, bloqueada por esta. Los casos
> de uso que cambian el estado → **QC-66**. La pantalla → **QC-67**. Crear un usuario sin
> contraseña y activarlo por enlace → **QC-79**, bloqueada por QC-66.
>
> Sembrado por `/afinar-feature` el 2026-09-08. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Notación EARS (`docs/specs.md`). Cada `R<n>` tiene que poder caer con un test; el mapa
> `R<n> -> test` lo escribe el implementer en `progress/impl_QC-65-...md`
> (`CHECKPOINTS.md > Trazabilidad`).
>
> Cómo leer los requisitos que dicen «no»: R18–R21 son de ALCANCE, y son requisitos de pleno
> derecho, no comentarios. Son la mitad de la ficha —lo que QC-65 escribe es poco; lo que NO
> puede tocar es lo que la hace segura— y se testean como los demás, con guardias que caen si
> alguien cruza la frontera.

### El dato

**R1.** El sistema DEBE persistir, para cada usuario, un **estado de cuenta** cuyo valor
pertenece al conjunto cerrado `active`, `pending`, `inactive`, `blocked`, y que nunca está
ausente.

**R2.** SI se intenta escribir un usuario con un estado de cuenta fuera de ese conjunto,
ENTONCES el sistema DEBE rechazar la escritura y no dejar la fila guardada. La garantía es de
la base de datos, no de una comprobación previa en código.

**R3.** El sistema DEBE declarar el conjunto de los cuatro valores —y el significado de cada
uno, tal cual lo fija la tabla de decisiones cerradas— en **un solo lugar** del dominio del
módulo `identity`, y toda otra representación del conjunto (el esquema Prisma y el tipo de
Postgres) DEBE coincidir con esa declaración exactamente: mismos cuatro valores, misma grafía.

**R4.** El sistema DEBE nombrar en **inglés** y `snake_case` las columnas nuevas de `users`, y
en inglés los valores del conjunto cerrado.

### Cómo nace y qué pasa con lo que ya existe

**R5.** CUANDO se crea un usuario sin indicar su estado de cuenta, el sistema DEBE dejarlo en
`pending`.

**R6.** CUANDO se aplica la migración de esta feature sobre una base que ya tiene usuarios, el
sistema DEBE dejar en `active` **todas** las filas existentes, incluidas las que están dadas
de baja lógicamente (`deleted_at` no nulo).

**R7.** CUANDO el seed de acceso inicial crea el usuario administrador inicial, el sistema DEBE
dejarlo en `active` **de forma explícita**, sin depender del valor por defecto de la columna.

### El rastro del último cambio

**R8.** El sistema DEBE persistir, junto al estado, el **instante del último cambio** de ese
estado. Ese instante nunca está ausente.

**R9.** CUANDO se crea un usuario sin indicar ese instante, el sistema DEBE fijarlo en el
momento de la creación; y CUANDO se aplica la migración, el sistema DEBE fijarlo, para cada
fila existente, en el momento en que la migración se aplica.

**R10.** El sistema DEBE persistir, junto al estado, una referencia **opcional** al usuario que
hizo el último cambio. SI esa referencia está vacía, ENTONCES significa que el cambio lo hizo
el sistema y no una persona; nunca significa «el dato se perdió».

**R11.** SI la referencia al autor del último cambio apunta a un usuario que no existe, ENTONCES
el sistema DEBE rechazar la escritura.

**R12.** MIENTRAS exista una fila que referencie a un usuario como autor del último cambio de
estado, el sistema DEBE impedir el borrado **físico** de ese usuario.

**R13.** El sistema DEBE guardar **solo el último** cambio: no existe tabla, columna ni registro
adicional con cambios anteriores de estado, y escribir un estado nuevo sustituye el rastro
anterior en vez de acumularlo.

### Lo que el modelo NO decide

**R14.** El sistema DEBE admitir cualquiera de los cuatro valores como valor siguiente de
cualquier otro: el modelo NO restringe transiciones. No hay máquina de estados, ni `CHECK` de
transición, ni disparador que compare el valor viejo con el nuevo. En particular, pasar de
`blocked` a `active` es una escritura como cualquier otra.

**R15.** El sistema DEBE conservar sin ningún cambio las tres unicidades de `users` —correo,
nombre de usuario y la pareja tipo+número de documento—, que siguen midiéndose dentro de la
empresa y solo sobre las filas vivas (`deleted_at IS NULL`). El estado de cuenta NO participa en
ninguna de las tres: MIENTRAS una cuenta esté en `inactive` (o en `pending`, o en `blocked`),
sigue ocupando su correo, su nombre de usuario y su documento.

**R16.** El estado de cuenta y el borrado lógico DEBEN ser **independientes**: esta feature no
lee ni escribe `deleted_at`, ningún valor del estado implica ni excluye estar dado de baja, y
ninguna consulta de las que ya existen cambia por el estado.

### Migración

**R17.** La migración DEBE ser **aditiva y reversible**: añade el tipo y las tres columnas sin
tocar ninguna otra columna, índice, restricción ni el RLS ya activo y forzado sobre `users`, y
su `down.sql` deja `users` y el catálogo de tipos de Postgres exactamente como estaban antes
—mismas columnas, mismos índices, mismas restricciones, sin el tipo nuevo huérfano—.

### Alcance (lo que esta ficha NO hace)

**R18.** Esta feature NO DEBE modificar el mecanismo de bloqueo por intentos fallidos de QC-19:
`failed_login_attempts`, `lock_level` y `locked_until` conservan sus columnas, sus valores y su
semántica, y `verify-credentials` y sus tests quedan intactos.

**R19.** Ningún código de producción DEBE **leer** el estado de cuenta para decidir nada: no hay
corte de acceso por estado, ni lectura desde el login, la sesión, el middleware o la UI. El
estado se escribe y se guarda; quien lo lea llega en QC-78.

**R20.** Esta feature NO DEBE añadir ningún caso de uso de cambio de estado (QC-66), ningún
adaptador driving, ninguna ruta, ninguna Server Action y ninguna pantalla (QC-67).

**R21.** Esta feature NO DEBE añadir ninguna dependencia a `package.json`.

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-08 | ¿El estado es un sí/no o una lista de valores? | Lista **cerrada** de cuatro valores, con nombres en inglés: `active`, `pending`, `inactive`, `blocked`. Un quinto valor entraría por migración; no se diseña para crecer sin migrar. |
| 2026-09-08 | ¿Qué significa cada valor? | `active`: la cuenta funciona. `pending`: creada, aún no habilitada para entrar. `inactive`: apagada a propósito por un administrador, reversible. `blocked`: bloqueada por seguridad. |
| 2026-09-08 | ¿En qué estado nace una cuenta nueva? | `pending`. **Corrige la descripción anterior del board**, que decía «nace habilitada»; la tarjeta ya está reescrita. Quién la pasa a `active`: el administrador desde QC-66, o la propia persona al establecer su contraseña por enlace (QC-79). |
| 2026-09-08 | ¿Y las filas que ya existen, al migrar? | `active`. Incluye al usuario inicial del seed de QC-6, que tiene que seguir entrando: una migración que dejara `pending` a todo el mundo cerraría el sistema sobre sí mismo. |
| 2026-09-08 | ¿Se guarda rastro del cambio de estado? | Sí: **la fecha del último cambio y quién lo hizo**. Quién es **opcional**: vacío significa que lo cambió el sistema, no una persona (es el caso del bloqueo automático de QC-19 cuando QC-78 lo unifique). No es un historial: solo el último cambio. |
| 2026-09-08 | ¿`blocked` es lo mismo que el bloqueo por intentos fallidos de QC-19? | **Sí, son la misma cosa.** Pero unificarlos **no entra aquí**: QC-65 no toca `lock_level`, `locked_until`, la escalada de tiempo ni sus tests de concurrencia. Lo hace QC-78. |
| 2026-09-08 | ¿Qué estados entran al login? | **Solo `active`.** `pending`, `inactive` y `blocked` reciben el resultado genérico que QC-7 dejó congelado, que no revela si falló el usuario, la contraseña o el estado. **Lo implementa QC-78**, no esta ficha. |
| 2026-09-08 | ¿El administrador saca a una cuenta de `blocked`? | Sí: `blocked` es un estado más y puede moverlo (QC-66). Sacarla de `blocked` tiene que limpiar además el contador de intentos fallidos o la cuenta se bloquearía sola al primer intento; esa limpieza es de **QC-78**, dueña del mecanismo. |
| 2026-09-08 | ¿Deshabilitar libera el correo, el nombre de usuario o el documento? | No. Los índices únicos **no cambian**: la cuenta sigue existiendo y se puede volver a habilitar (de la descripción del board). |
| 2026-09-08 | ¿Qué relación tiene con `deleted_at`? | Ninguna: son cosas distintas. El borrado lógico de QC-4 no se toca, y deshabilitar no borra. |
| 2026-09-08 | Idioma de los identificadores de base | Inglés, con `snake_case` en las columnas. Heredado de QC-4. |
| 2026-09-08 | ¿Quién lee el estado en esta ficha? | Nadie. Es el mismo reparto que `must_change_credential`: QC-19 la escribió, QC-7 la lee. Aquí se escribe; QC-78 lee. |
