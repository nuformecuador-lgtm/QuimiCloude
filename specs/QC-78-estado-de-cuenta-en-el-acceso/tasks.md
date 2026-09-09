# QC-78 — estado-de-cuenta-en-el-acceso · tasks.md

> Cubre `requirements.md` R1–R28 con el diseño de `design.md`. Zona `backend`, módulo `identity`.
> `[P]` = paralelizable con las tareas marcadas igual **de la misma tanda**.

## Archivos que declara esta ficha (lista completa)

Esta lista es contra la que se resuelve el conflicto de paralelismo. **Nada fuera de ella se
toca**; si al implementar aparece un archivo no listado, se para y se actualiza el spec antes de
editarlo.

**Producción (8 archivos, todos dentro de `lib/modules/identity/`):**

1. `lib/modules/identity/domain/effective-account-status.ts` — **NUEVO**
2. `lib/modules/identity/domain/verify-credentials.ts`
3. `lib/modules/identity/domain/resolve-session.ts`
4. `lib/modules/identity/ports/user-credentials-reader.ts`
5. `lib/modules/identity/ports/login-attempt-recorder.ts`
6. `lib/modules/identity/ports/session-user-reader.ts`
7. `lib/modules/identity/adapters/driven/persistence/user-credentials-prisma.ts`
8. `lib/modules/identity/adapters/driven/persistence/session-user-prisma.ts`

**Tests y E2E (9 archivos):**

9. `tests/unit/identity/effective-account-status.test.ts` — **NUEVO**
10. `tests/unit/identity/verify-credentials.test.ts`
11. `tests/unit/identity/resolve-session.test.ts`
12. `tests/unit/identity/resolve-session-user.test.ts` — solo el ajuste de fixtures
13. `tests/unit/composition/identity-facade.test.ts` — solo el ajuste de fixtures
14. `tests/integration/identity/login.int.test.ts`
15. `tests/integration/identity/session-user.int.test.ts`
16. `tests/unit/identity/qc78-alcance.test.ts` — **NUEVO** (guardia de alcance: R23, R26, R27)
17. `tests/unit/identity/account-status-scope.test.ts` — **solo si** la guardia de alcance que
    dejó QC-65 rechaza los lectores nuevos **dentro** de `identity` (T9). Puede acabar sin diff.
18. `e2e/login.spec.ts`
19. `e2e/session.spec.ts`

**Bitácora:** `progress/impl_QC-78-estado-de-cuenta-en-el-acceso.md`, `progress/current.md`
(los escribe el implementer / el leader, no son código).

**Archivos que esta ficha NO toca, y es intencional:**

- `db/schema.prisma` y `db/migrations/**` — R26: ni columna, ni enum, ni migración.
- `lib/composition/index.ts` — el cableado es por nombre de función y las firmas cambian a la vez
  en puerto y adaptador (`design.md > 4`).
- `lib/modules/identity/index.ts` — el dominio nuevo no lo consume nadie fuera del módulo; quien
  lo saque al contrato es QC-66 (`design.md > 6`).
- `lib/modules/identity/domain/account-lock.ts` — la política de escalada no se toca (R14).
- `lib/modules/identity/domain/account-status.ts` — el catálogo de QC-65 se lee, no se modifica.
- `lib/modules/identity/adapters/driving/**`, `app/**`, `components/**`, `middleware.ts` — el caso
  de uso conserva nombre y firma.
- `package.json` y `docs/dependencias.md` — R27.
- `tests/unit/identity/schema/identity-schema.test.ts` — no hay cambio de esquema que afirmar.

> **Paralelismo con QC-83 (`modelo-de-grupos-de-trabajo`, `backend`, `in_progress`).** QC-83
> declara `db/schema.prisma`, `db/migrations/`, `lib/composition/`,
> `lib/modules/identity/index.ts` y `tests/unit/identity/schema/identity-schema.test.ts`. **La
> intersección con la lista de arriba es vacía**, así que QC-78 puede arrancar sin esperarla
> (`AGENTS.md > Paralelismo`). Si durante la implementación apareciera la necesidad de tocar
> cualquiera de esos cinco, **se para y lo decide el leader**: no se toca por iniciativa propia.

---

## Tanda 1 — el dominio nuevo, aislado

- [ ] **T1. Sincronizar con `dev` y leer lo que dejó QC-65.**
      Archivos: ninguno (solo lectura).
      Abrir `lib/modules/identity/domain/account-status.ts` en la rama y anotar en la bitácora los
      **nombres reales** de sus constantes y de su tipo. `design.md > 0` los referencia por su
      papel a propósito: aquí se fijan los identificadores de verdad.
      *Hecho cuando:* la bitácora lista los símbolos exportados y confirma que las tres columnas
      de QC-65 existen en `db/schema.prisma` (solo lectura del esquema).

- [ ] **T2. `effective-account-status.ts` — el estado efectivo y sus dos compañeras.** (dep: T1)
      Archivos: `lib/modules/identity/domain/effective-account-status.ts` (nuevo).
      `effectiveAccountStatus`, `accountStatusAfterAttempt` y `clearedLockState` según
      `design.md > 1`. Dominio puro: `now` por parámetro, sin `next/*`, sin Prisma, sin
      `lib/shared/**`, sin rutas profundas a otro módulo. Reutiliza `isLocked` de
      `account-lock.ts`; no reimplementa la comparación de plazos.
      *Hecho cuando:* `pnpm run typecheck` limpio y el archivo no importa nada prohibido.

- [ ] **T3. Tests del dominio nuevo.** (dep: T2)
      Archivos: `tests/unit/identity/effective-account-status.test.ts` (nuevo).
      Un caso por fila de la tabla de `design.md > 1` (R7–R12), los tres desenlaces de
      `accountStatusAfterAttempt` (R13, R15, R17), la derivación desde `nextLockState` sin
      duplicar política (R14) y `clearedLockState` (R24). Instante fijo, objetos planos, sin
      esperas reales.
      *Hecho cuando:* R7–R15, R17 y R24 tienen cada uno al menos un test con nombre que describe
      el comportamiento, y todos pasan.

## Tanda 2 — el corte en el login

- [ ] **T4. Ampliar los puertos del login.** (dep: T2)
      Archivos: `lib/modules/identity/ports/user-credentials-reader.ts`,
      `lib/modules/identity/ports/login-attempt-recorder.ts`.
      `AuthenticatableUser` gana `accountStatus` (valor crudo, no cocinado); `compareAndSet` y
      `set` ganan el parámetro `estadoCuenta: AccountStatus | null` con `null` = no tocar la
      columna. Comentarios que expliquen el porqué, al estilo del resto del módulo.
      *Hecho cuando:* typecheck señala exactamente los puntos que faltan por actualizar (adaptador
      y tests) y ninguno fuera de la lista declarada.

- [ ] **T5. El corte por estado en `verify-credentials.ts`.** (dep: T4)
      Archivos: `lib/modules/identity/domain/verify-credentials.ts`.
      Paso 6 de `design.md > 2`: sustituir el `if (isLocked(...))` por el corte de estado
      efectivo, **después** del hash y **antes** del `!correcta`, devolviendo la misma instancia
      `REJECTED`. `registrarFallo` pasa el estado esperado y el que corresponde escribir, y corta
      al releer si el fresco ya no es efectivamente `active`. Éxito: `set` con el estado
      derivado. Comentario que deje escrita la asimetría con el corte de empresa de QC-48 y su
      motivo.
      *Hecho cuando:* typecheck limpio y el archivo sigue sin importar Prisma ni framework.

- [ ] **T6. Tests del login.** (dep: T5)
      Archivos: `tests/unit/identity/verify-credentials.test.ts`.
      Casos: `pending`, `inactive` y `blocked` vigente rechazan (R1) sin emitir sesión con
      contraseña **correcta** (R4); el rechazo es la **misma instancia** que el de usuario
      inexistente y contraseña mala (R3); el contador de llamadas al hasher es exactamente 1 en
      todos los caminos y el corte ocurre después (R2); ninguna escritura en los caminos
      `pending`/`inactive` (R5, R6) — verificado con puertos falsos que registran invocaciones;
      el quinto fallo escribe `blocked` con el instante y **sin autor** (R13); plazos 1/5/15/60
      intactos (R14); fallo suelto sobre `blocked` vencido deja `active` y **nunca** `blocked`
      con plazo vacío (R15); login correcto reinicia contador y nivel y devuelve a `active`
      (R16); no se escribe el estado cuando no cambia (R17); el CAS que pierde por cambio de
      estado no aplica y se recalcula (R18); al releer un fresco no activo se abandona sin
      escribir (R19); tras `clearedLockState` el siguiente fallo cuenta como el primero (R25).
      *Hecho cuando:* R1–R6, R13–R19 y R25 tienen test nombrado por comportamiento y pasan.

- [ ] **T7. El adaptador de credenciales.** (dep: T4)
      Archivos:
      `lib/modules/identity/adapters/driven/persistence/user-credentials-prisma.ts`.
      `SELECT` con `u.account_status` (sin tocar el `WHERE` ni el `JOIN`); `compareAndSet` con el
      estado esperado en el predicado y el trío de columnas de rastro en el `data` **solo** si
      hay estado que escribir; `set`, igual. El predicado por **rango** de `locked_until` que
      evita el ABA queda intacto.
      *Hecho cuando:* typecheck limpio y el diff no altera ninguna línea del predicado de rango.

- [ ] **T8. Integración del login contra la base.** (dep: T7)
      Archivos: `tests/integration/identity/login.int.test.ts`.
      Que el CAS **no** aplica cuando el estado de cuenta cambió entre lectura y escritura (R18) y
      que el quinto fallo deja la fila en `blocked` con plazo y sin autor (R13).
      *Hecho cuando:* pasan con `DATABASE_URL` cargada por el gate; si el entorno no lo permite,
      se anota como límite conocido en la bitácora, no se borra el caso.

- [ ] **T9. Guardia de alcance de QC-65: comprobar si muerde.** (dep: T5, T7)
      Archivos: `tests/unit/identity/account-status-scope.test.ts` (posible diff).
      Correr la guardia con los lectores nuevos ya escritos. Si los rechaza, **ampliar su lista
      con los archivos que este spec autoriza**, uno por uno y con el requisito que lo justifica
      en el comentario. Prohibido relajar el criterio de la guardia.
      *Hecho cuando:* la guardia vuelve a verde y sigue **mordiendo** ante un lector no
      autorizado (se demuestra con un archivo temporal que se borra).

## Tanda 3 — el corte en la sesión

- [ ] **T10. `SessionUserRecord` y su adaptador.** [P con T5–T9] (dep: T2)
      Archivos: `lib/modules/identity/ports/session-user-reader.ts`,
      `lib/modules/identity/adapters/driven/persistence/session-user-prisma.ts`.
      El record gana `accountStatus` y `lockedUntil`; el `select` los añade en el **mismo**
      `findFirst`. Comentario con el coste declarado (el `select` deja de ser tan estrecho; ni
      uno ni otro es PII).
      *Hecho cuando:* typecheck limpio y sigue habiendo exactamente una consulta.

- [ ] **T11. El sexto corte en `resolve-session.ts`.** (dep: T10)
      Archivos: `lib/modules/identity/domain/resolve-session.ts`.
      `if` propio detrás del corte de empresa no viva, con la misma salida `null` y sin borrar
      cookie. Nada de escrituras, nada de sellos de QC-23.
      *Hecho cuando:* typecheck limpio y ningún puerto de escritura entra en este archivo.

- [ ] **T12. Tests de la sesión.** (dep: T11)
      Archivos: `tests/unit/identity/resolve-session.test.ts`,
      `tests/unit/identity/resolve-session-user.test.ts` (fixtures),
      `tests/unit/composition/identity-facade.test.ts` (fixtures),
      `tests/integration/identity/session-user.int.test.ts`.
      Casos: cuenta que pasa a `pending`/`inactive`/`blocked` deja de tener sesión en la siguiente
      resolución (R20); `blocked` con plazo vencido **sí** tiene sesión (R7, R8 vistos desde la
      sesión); contador de invocaciones al lector = 1, o sea ninguna consulta nueva, y cero
      escrituras (R21); ningún puerto ni lectura de registro de sesiones (R22).
      *Hecho cuando:* R20–R22 tienen test nombrado por comportamiento y pasan.

## Tanda 4 — guardias, E2E y cierre

- [ ] **T13. Guardia de alcance de la ficha.** [P con T14] (dep: T5, T11)
      Archivos: `tests/unit/identity/qc78-alcance.test.ts` (nuevo).
      Afirma sobre el diff de la rama: cero cambios en `db/schema.prisma` y `db/migrations/`
      (R26), cero cambios en `package.json` (R27) y ningún cron, `setInterval` o route handler
      nuevo en `app/api/` (R23). **Se salta explícitamente** —con mensaje que diga que no ha
      comprobado nada— cuando el rango de diff no existe, para no repetir la bomba de relojería
      que `progress/history.md` registra en las guardias de QC-45 y QC-65.
      *Hecho cuando:* se demuestra que **muerde**, con una mutación temporal por cada uno de sus
      tres motivos de fallo, las tres revertidas.

- [ ] **T14. E2E.** [P con T13] (dep: T5, T11)
      Archivos: `e2e/login.spec.ts`, `e2e/session.spec.ts`.
      `login.spec.ts`: una cuenta que no está `active` no entra y ve **el mismo** mensaje que una
      contraseña mala. `session.spec.ts`: una sesión abierta cuya cuenta deja de estar `active` no
      llega a la siguiente pantalla privada y acaba en el login (R28).
      *Hecho cuando:* los dos flujos pasan de extremo a extremo, y el de login compara el texto
      con el del caso de contraseña incorrecta en vez de con un literal copiado.

- [ ] **T15. Mapa `R<n> → test` y bitácora.** (dep: T3, T6, T8, T12, T13, T14)
      Archivos: `progress/impl_QC-78-estado-de-cuenta-en-el-acceso.md`.
      Las 28 filas, cada una con el archivo y el nombre del caso, **verificadas abriendo el caso**
      (la lección de QC-45 y QC-65), más la salida real de los tests.
      *Hecho cuando:* no queda ningún `R<n>` sin test y ningún test citado que no verifique lo que
      dice.

- [ ] **T16. Gate rápido de cada tanda — *las corre el leader*.**
      `./init.sh --rapido` al cerrar cada una de las tandas 1 a 4.
      *Hecho cuando:* `exit 0` en cada tanda, con la salida anotada en la bitácora.

- [ ] **T17. Gate completo — *las corre el leader*.** (dep: T15, T16)
      `./init.sh` completo para cerrar la feature y **otra vez antes de abrir el PR, sin
      excepción**.
      *Hecho cuando:* `exit 0`, sin ningún archivo de test rojo que no estuviera ya en
      `tests/baseline-rojos.json`.

- [ ] **T18. Revisión y puerta humana — *la gestiona el leader*.** (dep: T17)
      `reviewer` sobre el conjunto; trazabilidad completa como criterio bloqueante. Después,
      tarjeta, `feature_list.json` y `progress/current.md`.
      *Hecho cuando:* el reviewer aprueba con 0 bloqueantes y el estado queda registrado en disco.
