# QC-95 — desbloqueo-manual-limpia-el-conteo · requirements.md

> **Zona:** `backend` · **Complejidad:** `low` · **depends_on:** `null` ·
> **Rama:** `feature/QC-95-desbloqueo-manual-limpia-el-conteo`
>
> **Alcance.** Que el desbloqueo administrativo **surtir efecto de verdad**. Hoy, cuando un
> administrador mueve una cuenta de `blocked` a `active`, la operación `setUserAccountStatus` de
> QC-66 cambia solo `account_status` y **no toca** `failed_login_attempts`, `lock_level` ni
> `locked_until` (su R45 se lo prohibía, y QC-78 entregó el mecanismo `clearedLockState()` sin que
> nadie lo invocara). El resultado es el agujero medido: la cuenta queda almacenada como `active`
> mientras su **estado efectivo** —que QC-78 R11 calcula a partir del `locked_until` que quedó
> vivo— sigue siendo `blocked`, y la persona sigue sin poder entrar.
>
> **Esta ficha cambia R45 de QC-66** (spec aprobado): `setUserAccountStatus`, al mover el estado a
> un valor distinto de `blocked`, aplica `clearedLockState()` en la **misma escritura**. Es lo que
> QC-78 esperaba. **Decidido por el humano el 2026-09-11** al acotar QC-67, de las tres salidas que
> dejó el reviewer de QC-66 (MAYOR-2: «ningún código de producción invoca `clearedLockState`»).
>
> **Lo que NO entra.** La pantalla y el botón de cambio de estado → **QC-67** (no lo bloquea: la
> acción se ofrece desde el primer día; hasta que esta ficha esté `done`, salir de `blocked` no
> surte efecto en el acceso). La política de intentos fallidos, el bloqueo automático y su
> escalada → **QC-19 / QC-78**, que **no se tocan**. El cálculo del estado efectivo → **QC-78**,
> intacto. El cambio de rol, el borrado y las demás operaciones de administración de usuarios →
> **QC-66**, intactas. No entra ninguna pantalla, ruta ni componente.
>
> Sembrado para `/afinar-feature`: el alcance lo fijó el humano al acotar QC-67 el 2026-09-11, y
> esta ficha **no reabre** ninguna decisión cerrada de QC-66 ni de QC-78: lo único que cambia es
> la cláusula concreta de R45 que prohíbe tocar los contadores, y solo en el caso de «salir de
> `blocked`».

## Requisitos (EARS)

> Notación EARS (`docs/specs.md`). **«El sistema»** aquí es el módulo **`identity`**: el caso de
> uso `setUserAccountStatus`, el puerto `UserAdminRepository.applyGuardedChange` y su adaptador
> Prisma. Las tres columnas de bloqueo —`failed_login_attempts`, `lock_level`, `locked_until`—
> y el mecanismo `clearedLockState()` **ya existen** y no se re-especifican: los aportaron QC-19
> y QC-78. Esta ficha **no añade ninguna columna ni migración**.
>
> Vocabulario, para que los requisitos no repitan la definición:
> - **contadores de bloqueo**: las tres columnas `failed_login_attempts`, `lock_level` y
>   `locked_until` de `users`.
> - **destino**: el nuevo `account_status` que pide la operación.
> - **salir de `blocked`**: mover el estado a un destino **distinto de `blocked`**. Ver R4: el
>   sistema decide con el destino solo, sin leer el estado actual.

### El desbloqueo administrativo limpia los contadores

**R1.** CUANDO `setUserAccountStatus` mueve el estado de cuenta de un usuario a un destino
distinto de `blocked`, el sistema DEBE limpiar los tres contadores de bloqueo en la misma
operación —`failed_login_attempts` a `0`, `lock_level` a `0` y `locked_until` a `null`— aplicando
el mecanismo `clearedLockState()` de QC-78 (R24).

**R2.** SI el destino ES `blocked`, ENTONCES el sistema NO DEBE escribir ninguno de los tres
contadores: pasar a `blocked` no limpia el estado de bloqueo.

**R3.** La limpieza y el cambio de `account_status` DEBEN escribirse en la **misma transacción y
en la misma escritura** sobre la fila, de modo que SI una no se aplica, la otra tampoco; el
sistema NUNCA DEBE dejar una fila con estado distinto de `blocked` y un `locked_until` futuro que
la rebloquee —la condición de QC-78 R11, que es el agujero que esta ficha cierra—.

**R4.** El sistema DEBE decidir si limpia usando **solo el destino**: limpia si y solo si el
destino no es `blocked`, y NO DEBE necesitar leer el estado de cuenta actual del objetivo para
tomar esa decisión.

**R5.** CUANDO una cuenta sale de `blocked` por esta operación, su siguiente intento de login
fallido DEBE contar como el primero de una serie nueva y NO DEBE volver a bloquear la cuenta de
inmediato (QC-78 R25, ahora efectivo por esta vía).

### El mecanismo sale del dominio

**R6.** El caso de uso `setUserAccountStatus` DEBE obtener el estado limpio llamando a la función
pura `clearedLockState()` de `lib/modules/identity/domain/effective-account-status.ts`, y NO DEBE
escribir `0`, `0`, `null` como literal ni reimplementar la limpieza en ningún otro sitio.

### Sin regresión en lo demás

**R7.** La limpieza NO DEBE alterar la autorización de `setUserAccountStatus`: el caso de uso
sigue exigiendo `usuarios.modificar` como primera línea (QC-66 R1, R2) y las guardas del
administrador —ni sobre uno mismo (R21) ni dejar la empresa sin un administrador en `active`
(R22)— se siguen cumpliendo sin cambios.

**R8.** La limpieza NO DEBE tocar la política de bloqueo por intentos de QC-19 ni el cálculo del
estado efectivo de QC-78: `nextLockState`, `isLocked` y `effectiveAccountStatus` DEBEN quedar sin
cambios, y el login (`verify-credentials`) y la resolución de sesión (`resolve-session`) NO se
modifican.

### Alcance (lo que esta ficha NO hace)

**R9.** Esta feature NO DEBE añadir ninguna columna, tabla, índice, enum ni migración, y NO DEBE
incorporar ninguna dependencia nueva: solo cambia qué escribe `applyGuardedChange` en columnas ya
existentes. `db/schema.prisma` y `db/migrations/` DEBEN quedar sin cambios.

**R10.** Esta feature NO DEBE incluir ninguna pantalla, componente ni ruta bajo `app/` o
`components/`: es backend puro y su verificación es **unitaria y de integración**, sin E2E.

## Cobertura de las decisiones cerradas

Esta ficha no trae tabla de decisiones propia (no fue acotada con `/afinar-feature` como ficha
independiente): el alcance lo fijó el humano el 2026-09-11 dentro de QC-67. La única decisión de
diseño que este spec toma —decidir la limpieza por el **destino** y no por leer el estado actual—
se documenta como alternativa descartada en `design.md`, y queda cubierta por **R4**. Cada `R<n>`
tiene su test; el mapa `R<n> -> test` lo escribe el implementer en
`progress/impl_QC-95-desbloqueo-manual-limpia-el-conteo.md` (`CHECKPOINTS.md > Trazabilidad`).

## Preguntas abiertas

Ninguna. La descripción de la ficha y el alcance fijado el 2026-09-11 son suficientes y no hay
supuesto que rellenar (regla 6 de `CLAUDE.md`).