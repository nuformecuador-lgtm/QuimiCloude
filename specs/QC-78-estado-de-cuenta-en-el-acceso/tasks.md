# QC-78 — estado-de-cuenta-en-el-acceso · tasks.md

> Cubre `requirements.md` R1–R30 con el diseño de `design.md`. Zona `backend`, módulo `identity`
> (R29 y R30, del 2026-09-10, alcanzan además `lib/shared/routes.ts` y el layout privado).
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

### Ampliación del 2026-09-10 — los ocho E2E que R1 rompe (aprobada por el humano)

> **Decisión humana explícita del 2026-09-10**, subida por el leader. El implementer paró al
> encontrarlos, como manda la regla de más abajo, y el humano aprobó ampliar el alcance en vez de
> aplazarlo a otra ficha. **No es un requisito nuevo:** los requisitos aprobados siguen siendo
> R1..R28 y esta ampliación **no añade ningún R29**. Es una **reparación colateral** de la que R1
> es causa directa, documentada aquí y solo aquí.
>
> ⚠️ **CADUCADO EN PARTE, ese mismo día. Manda el bloque de más abajo** («Ampliación del
> 2026-09-10 — la marca de sesión cortada»): **R29 y R30 SÍ existen**. Se aprobaron *después* de
> escribir este párrafo, cuando el E2E de R28 (b) destapó el bucle de redirecciones. Lo que sigue
> siendo cierto aquí es lo demás: los ocho E2E son una reparación colateral de R1 y no traen
> requisito propio. (Nota añadida tras el review de F2.2, menor 7.)

Se añaden a la lista declarada estos ocho archivos:

20. `e2e/inventario.spec.ts`
21. `e2e/pedidos.spec.ts`
22. `e2e/permisos.spec.ts`
23. `e2e/presentaciones.spec.ts`
24. `e2e/proveedores.spec.ts`
25. `e2e/recetas.spec.ts`
26. `e2e/recetas-pasos.spec.ts`
27. `e2e/unidades.spec.ts`

**Por qué entran.** Los ocho crean su usuario efímero con `prisma.user.create` **sin**
`accountStatus`, o sea `pending` por el `@default(pending)` de la columna que dejó QC-65, y
después **entran por el formulario real de login**. Desde **R1**, `pending` no entra: los ocho
dejan de pasar por causa directa de esta ficha, no por deuda propia.

**Qué se toca, y nada más.** **Una línea por archivo**: `accountStatus: 'active'` en su sitio de
creación. Se comprobó que **no hay helper compartido** —cada spec tiene el suyo, local, con un
único `prisma.user.create`—, así que son ocho cambios de una línea y no uno en un sitio común.
Prohibido aprovechar el paso para refactorizar, limpiar o tocar una sola aserción.

**Por qué se repara AQUÍ y no en una ficha posterior.** `./init.sh` **no corre Playwright** (no
hay ninguna invocación de `playwright` ni de `pnpm e2e` en el script). O sea que **el gate no
cazaría esta rotura**: la feature podría cerrarse en verde, mergearse, y los ocho specs quedarían
rotos en `dev` sin que nada lo señalara hasta que alguien corriera los E2E a mano. Dejarlo para
después sería fiar a la memoria una rotura que el arnés no puede ver.

**Verificación acordada con el leader** (evidencia real, no razonamiento): se corren con Playwright
`e2e/login.spec.ts` y `e2e/session.spec.ts` (los de R28) **más `e2e/permisos.spec.ts` y
`e2e/pedidos.spec.ts`**, que son los dos de los ocho que más dependen de entrar de verdad. La
salida va a la bitácora. De los **seis restantes** se deja escrito en la bitácora que llevan el
**mismo** cambio de una línea y que **no** se ejecutaron, para que el reviewer sepa exactamente
qué está verificado y qué no. No se corre la suite E2E entera ni `./init.sh`.

### Ampliación del 2026-09-10 (2) — el corte del bucle de redirecciones (R29, R30)

> **Requisitos nuevos aprobados por el humano el 2026-09-10**: R29 y R30. A diferencia de la
> ampliación anterior —que era reparación colateral sin requisito—, esta **sí** añade requisitos, y
> por eso cambia la lista declarada **y** la lista de «archivos que esta ficha NO toca». El porqué
> del defecto y el descarte de las otras tres salidas están en
> `requirements.md > Ampliación del 2026-09-10`; el cómo, en `design.md > 10`.

Se añaden a la lista declarada estos **trece** archivos (28–40): cinco de producción y ocho de
test.

**Producción, dentro de `lib/` (4):**

28. `lib/shared/routes.ts` — las dos constantes de la marca (`design.md > 10.1`)
29. `lib/modules/identity/domain/route-access.ts` — la regla 3 no dispara con la marca (R29, R30)
30. `lib/modules/identity/adapters/driving/route-guard-middleware.ts` — **una línea**: pasa el
    nombre del parámetro al dominio
31. `lib/modules/identity/adapters/driving/require-page-permission.ts` — su `redirect` al login
    también lleva la marca (`design.md > 10.3`)

**Producción, fuera de `lib/` (1):**

32. `app/(private)/layout.tsx` — su `redirect` al login lleva la marca

**Tests (8):**

33. `tests/unit/identity/route-access.test.ts`
34. `tests/unit/identity/route-guard-middleware.test.ts`
35. `tests/unit/identity/require-page-permission.test.ts`
36. `tests/unit/private-layout.test.tsx`
37. `tests/unit/sidebar-desktop.test.tsx` — **una línea**: afirma el destino exacto del `redirect`
    del layout sin sesión (`toHaveBeenCalledWith(LOGIN_ROUTE)`), que cambia
38. `tests/unit/sidebar-mobile.test.tsx` — ídem
39. `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx` — ídem, para `requirePagePermission`
40. `tests/unit/configuracion-ui/unit-page.test.tsx` — ídem
41. `tests/unit/identity/login-page-marca.test.tsx` — **NUEVO**, añadido el 2026-09-10 tras el
    review de F2.2 (menor 3): la segunda mitad de R30 (a), que la pantalla de login se renderiza
    **igual** con la marca y sin ella. No cabía en ninguno de los 40 anteriores —es el único que
    renderiza la pantalla pública— y por eso se declara aquí en vez de colarse en un archivo
    ajeno. **No toca `app/(public)/login/page.tsx`**, que sigue fuera del alcance: solo lo lee.
42. `tests/unit/recetas-ui/recipe-route-contract.test.ts` — añadido el 2026-09-10 tras el gate de
    F2.4. Ver el bloque de ampliación de abajo.

### Ampliación del 2026-09-10 (F2.4) — la guardia de rutas que T20 invalida

> **Lo que la obliga.** El centinela de **QC-64 R12** (`el asistente de lectura no tiene ruta
> propia`) afirma, con **igualdad exacta**, la lista de constantes que exporta
> `lib/shared/routes.ts`. **T20 le añadió dos** —`SESSION_ENDED_PARAM` y
> `LOGIN_ROUTE_SESSION_ENDED`, R29 y R30—, así que la lista dejó de coincidir y el caso cae:
> `1 failed | 24 passed` al correrlo aislado. Es una **regresión real de esta ficha**, no una
> incompatibilidad de terceros.

**Por qué no se vio antes.** `tests/unit/recetas-ui/recipe-route-contract.test.ts` está en
`tests/baseline-rojos.json` desde el 2026-09-04 por un motivo **estructural distinto** (el del
rango `git diff`), y estar listado **apaga el archivo entero** para el comparador del gate. Por eso
`./init.sh` terminó en `== init OK ==`: un **falso verde**. La entrada del baseline **no se toca**
—es deuda de arnés anterior a esta ficha y la levanta el leader aparte—.

**Qué se toca, y qué no.** Solo la lista esperada de ese caso, más el comentario que justifica las
dos entradas nuevas. **La aserción sigue siendo `toEqual` sobre la lista exacta**: ni `toContain`,
ni subconjunto, ni ordenación laxa. Su valor es justamente que cualquier constante nueva la
despierte, y ese valor se conserva íntegro. Es la misma puerta por la que ya pasaron `ORDERS_ROUTE`
(QC-35), `PRESENTATIONS_ROUTE` (QC-45) y `UNITS_ROUTE` (QC-39), cada una con su comentario.

**Por qué se repara aquí.** Dejarla fuera significa dejar **una guardia ajena rota** por un cambio
propio, escondida detrás de una entrada de baseline que existe por otra cosa. Y R12 no se
debilita: ninguna de las dos constantes encaja en el patrón `alude`, que se sigue aplicando a
todas las declaraciones del archivo, y ninguna apunta a una URL del asistente.

Los cuatro últimos (37–40) entran **solo** porque comparan el destino del `redirect` con
`LOGIN_ROUTE`: es un cambio de una línea por archivo, a la constante nueva. Prohibido aprovechar
para tocar nada más de esos archivos.

**Los cinco archivos que construyen un `RouteAccessInput` literal NO entran** —los contratos de
ruta de proveedores, pedidos, recetas, inventario y el de identity— porque el campo nuevo del
input es **opcional** justamente para eso (`design.md > 10.2`). `route-access.test.ts` sí entra,
pero para **añadir** casos, no para arreglar los que ya hay.

**Archivos que esta ficha NO toca, y es intencional:**

- `db/schema.prisma` y `db/migrations/**` — R26: ni columna, ni enum, ni migración.
- `lib/composition/index.ts` — el cableado es por nombre de función y las firmas cambian a la vez
  en puerto y adaptador (`design.md > 4`). **Sigue sin tocarse el 2026-09-10**: la marca vive en
  `lib/shared/routes.ts` y no pasa por el cableado.
- `lib/modules/identity/index.ts` — el dominio nuevo no lo consume nadie fuera del módulo; quien
  lo saque al contrato es QC-66 (`design.md > 6`). **Sigue sin tocarse el 2026-09-10**: la
  constante de la marca es de rutas, no de dominio, y publicar en este contrato chocaría con
  QC-66, que lo declara (`design.md > 10.1`).
- `lib/modules/identity/domain/account-lock.ts` — la política de escalada no se toca (R14).
- `lib/modules/identity/domain/account-status.ts` — el catálogo de QC-65 se lee, no se modifica.
- ~~`lib/modules/identity/adapters/driving/**`, `app/**`~~ — **corregido el 2026-09-10.** Esta
  exclusión se escribió el 2026-09-08 cuando la ficha terminaba en R28: el caso de uso del login
  conserva nombre y firma, así que nada de fuera del dominio tenía que cambiar. R29 la deroga en
  parte, porque el bucle **solo** se puede cortar donde se emite la redirección y donde se decide
  el acceso: entran `require-page-permission.ts`, `route-guard-middleware.ts` y
  `app/(private)/layout.tsx`, y **nada más** de esos dos árboles. Siguen fuera
  `logout-action.ts` (cierra la sesión de verdad: no hay bucle, `design.md > 10.3`),
  `login-action.ts`, `app/(public)/login/page.tsx` (ignora los parámetros que no conoce, así que
  la pantalla ya cumple R30 (a) sin cambios) y el resto de `app/**`.
- `middleware.ts` (raíz) — sigue sin decisiones: solo reexporta el handler y declara el `matcher`.
- `components/**` — nada de UI cambia.
- `package.json` y `docs/dependencias.md` — R27.
- `tests/unit/identity/schema/identity-schema.test.ts` — no hay cambio de esquema que afirmar.

> **Paralelismo con QC-83 (`modelo-de-grupos-de-trabajo`, `backend`, `in_progress`).** QC-83
> declara `db/schema.prisma`, `db/migrations/`, `lib/composition/`,
> `lib/modules/identity/index.ts` y `tests/unit/identity/schema/identity-schema.test.ts`. **La
> intersección con la lista de arriba es vacía**, así que QC-78 puede arrancar sin esperarla
> (`AGENTS.md > Paralelismo`). Si durante la implementación apareciera la necesidad de tocar
> cualquiera de esos cinco, **se para y lo decide el leader**: no se toca por iniciativa propia.

> **Paralelismo con QC-66 (`crud-de-usuarios`, `backend`, en curso), revisado el 2026-09-10.**
> QC-66 declara `lib/composition/index.ts` y `lib/modules/identity/index.ts`. La ampliación de R29
> y R30 **no toca ninguno de los dos** —es lo que decidió dónde vive la constante de la marca,
> `design.md > 10.1`—, así que la intersección sigue siendo **vacía**. Si al implementar apareciera
> la necesidad de exportar algo por cualquiera de esos dos archivos, **se para y lo decide el
> leader**.

---

## Tanda 1 — el dominio nuevo, aislado

- [x] **T1. Sincronizar con `dev` y leer lo que dejó QC-65.**
      Archivos: ninguno (solo lectura).
      Abrir `lib/modules/identity/domain/account-status.ts` en la rama y anotar en la bitácora los
      **nombres reales** de sus constantes y de su tipo. `design.md > 0` los referencia por su
      papel a propósito: aquí se fijan los identificadores de verdad.
      *Hecho cuando:* la bitácora lista los símbolos exportados y confirma que las tres columnas
      de QC-65 existen en `db/schema.prisma` (solo lectura del esquema).

- [x] **T2. `effective-account-status.ts` — el estado efectivo y sus dos compañeras.** (dep: T1)
      Archivos: `lib/modules/identity/domain/effective-account-status.ts` (nuevo).
      `effectiveAccountStatus`, `accountStatusAfterAttempt` y `clearedLockState` según
      `design.md > 1`. Dominio puro: `now` por parámetro, sin `next/*`, sin Prisma, sin
      `lib/shared/**`, sin rutas profundas a otro módulo. Reutiliza `isLocked` de
      `account-lock.ts`; no reimplementa la comparación de plazos.
      *Hecho cuando:* `pnpm run typecheck` limpio y el archivo no importa nada prohibido.

- [x] **T3. Tests del dominio nuevo.** (dep: T2)
      Archivos: `tests/unit/identity/effective-account-status.test.ts` (nuevo).
      Un caso por fila de la tabla de `design.md > 1` (R7–R12), los tres desenlaces de
      `accountStatusAfterAttempt` (R13, R15, R17), la derivación desde `nextLockState` sin
      duplicar política (R14) y `clearedLockState` (R24). Instante fijo, objetos planos, sin
      esperas reales.
      *Hecho cuando:* R7–R15, R17 y R24 tienen cada uno al menos un test con nombre que describe
      el comportamiento, y todos pasan.

## Tanda 2 — el corte en el login

- [x] **T4. Ampliar los puertos del login.** (dep: T2)
      Archivos: `lib/modules/identity/ports/user-credentials-reader.ts`,
      `lib/modules/identity/ports/login-attempt-recorder.ts`.
      `AuthenticatableUser` gana `accountStatus` (valor crudo, no cocinado); `compareAndSet` y
      `set` ganan el parámetro `estadoCuenta: AccountStatus | null` con `null` = no tocar la
      columna. Comentarios que expliquen el porqué, al estilo del resto del módulo.
      *Hecho cuando:* typecheck señala exactamente los puntos que faltan por actualizar (adaptador
      y tests) y ninguno fuera de la lista declarada.

- [x] **T5. El corte por estado en `verify-credentials.ts`.** (dep: T4)
      Archivos: `lib/modules/identity/domain/verify-credentials.ts`.
      Paso 6 de `design.md > 2`: sustituir el `if (isLocked(...))` por el corte de estado
      efectivo, **después** del hash y **antes** del `!correcta`, devolviendo la misma instancia
      `REJECTED`. `registrarFallo` pasa el estado esperado y el que corresponde escribir, y corta
      al releer si el fresco ya no es efectivamente `active`. Éxito: `set` con el estado
      derivado. Comentario que deje escrita la asimetría con el corte de empresa de QC-48 y su
      motivo.
      *Hecho cuando:* typecheck limpio y el archivo sigue sin importar Prisma ni framework.

- [x] **T6. Tests del login.** (dep: T5)
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

- [x] **T7. El adaptador de credenciales.** (dep: T4)
      Archivos:
      `lib/modules/identity/adapters/driven/persistence/user-credentials-prisma.ts`.
      `SELECT` con `u.account_status` (sin tocar el `WHERE` ni el `JOIN`); `compareAndSet` con el
      estado esperado en el predicado y el trío de columnas de rastro en el `data` **solo** si
      hay estado que escribir; `set`, igual. El predicado por **rango** de `locked_until` que
      evita el ABA queda intacto.
      *Hecho cuando:* typecheck limpio y el diff no altera ninguna línea del predicado de rango.

- [x] **T8. Integración del login contra la base.** (dep: T7)
      Archivos: `tests/integration/identity/login.int.test.ts`.
      Que el CAS **no** aplica cuando el estado de cuenta cambió entre lectura y escritura (R18) y
      que el quinto fallo deja la fila en `blocked` con plazo y sin autor (R13).
      *Hecho cuando:* pasan con `DATABASE_URL` cargada por el gate; si el entorno no lo permite,
      se anota como límite conocido en la bitácora, no se borra el caso.

- [x] **T9. Guardia de alcance de QC-65: comprobar si muerde.** (dep: T5, T7)
      Archivos: `tests/unit/identity/account-status-scope.test.ts` (posible diff).
      Correr la guardia con los lectores nuevos ya escritos. Si los rechaza, **ampliar su lista
      con los archivos que este spec autoriza**, uno por uno y con el requisito que lo justifica
      en el comentario. Prohibido relajar el criterio de la guardia.
      *Hecho cuando:* la guardia vuelve a verde y sigue **mordiendo** ante un lector no
      autorizado (se demuestra con un archivo temporal que se borra).

## Tanda 3 — el corte en la sesión

- [x] **T10. `SessionUserRecord` y su adaptador.** [P con T5–T9] (dep: T2)
      Archivos: `lib/modules/identity/ports/session-user-reader.ts`,
      `lib/modules/identity/adapters/driven/persistence/session-user-prisma.ts`.
      El record gana `accountStatus` y `lockedUntil`; el `select` los añade en el **mismo**
      `findFirst`. Comentario con el coste declarado (el `select` deja de ser tan estrecho; ni
      uno ni otro es PII).
      *Hecho cuando:* typecheck limpio y sigue habiendo exactamente una consulta.

- [x] **T11. El sexto corte en `resolve-session.ts`.** (dep: T10)
      Archivos: `lib/modules/identity/domain/resolve-session.ts`.
      `if` propio detrás del corte de empresa no viva, con la misma salida `null` y sin borrar
      cookie. Nada de escrituras, nada de sellos de QC-23.
      *Hecho cuando:* typecheck limpio y ningún puerto de escritura entra en este archivo.

- [x] **T12. Tests de la sesión.** (dep: T11)
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

- [x] **T13. Guardia de alcance de la ficha.** [P con T14] (dep: T5, T11)
      Archivos: `tests/unit/identity/qc78-alcance.test.ts` (nuevo).
      Afirma sobre el diff de la rama: cero cambios en `db/schema.prisma` y `db/migrations/`
      (R26), cero cambios en `package.json` (R27) y ningún cron, `setInterval` o route handler
      nuevo en `app/api/` (R23). **Se salta explícitamente** —con mensaje que diga que no ha
      comprobado nada— cuando el rango de diff no existe, para no repetir la bomba de relojería
      que `progress/history.md` registra en las guardias de QC-45 y QC-65.
      *Hecho cuando:* se demuestra que **muerde**, con una mutación temporal por cada uno de sus
      tres motivos de fallo, las tres revertidas.

- [x] **T14. E2E.** [P con T13] (dep: T5, T11)
      Archivos: `e2e/login.spec.ts`, `e2e/session.spec.ts`.
      `login.spec.ts`: una cuenta que no está `active` no entra y ve **el mismo** mensaje que una
      contraseña mala. `session.spec.ts`: una sesión abierta cuya cuenta deja de estar `active` no
      llega a la siguiente pantalla privada y acaba en el login (R28).
      *Hecho cuando:* los dos flujos pasan de extremo a extremo, y el de login compara el texto
      con el del caso de contraseña incorrecta en vez de con un literal copiado.

- [x] **T15. Mapa `R<n> → test` y bitácora.** (dep: T3, T6, T8, T12, T13, T14)
      Archivos: `progress/impl_QC-78-estado-de-cuenta-en-el-acceso.md`.
      Las 28 filas, cada una con el archivo y el nombre del caso, **verificadas abriendo el caso**
      (la lección de QC-45 y QC-65), más la salida real de los tests.
      *Hecho cuando:* no queda ningún `R<n>` sin test y ningún test citado que no verifique lo que
      dice.

- [x] **T19. Reparar los ocho E2E que R1 rompe.** (dep: T5, T14) — *añadida el 2026-09-10 por la
      ampliación de alcance aprobada por el humano; ver el bloque de ampliación de arriba.*
      Archivos: `e2e/inventario.spec.ts`, `e2e/pedidos.spec.ts`, `e2e/permisos.spec.ts`,
      `e2e/presentaciones.spec.ts`, `e2e/proveedores.spec.ts`, `e2e/recetas.spec.ts`,
      `e2e/recetas-pasos.spec.ts`, `e2e/unidades.spec.ts`.
      `accountStatus: 'active'` en el único `prisma.user.create` de cada uno. **Una línea por
      archivo y nada más**: ni refactor, ni limpieza de paso, ni tocar aserciones.
      *Hecho cuando:* los ocho llevan el cambio, y `login`, `session`, `permisos` y `pedidos`
      pasan con Playwright con la salida pegada en la bitácora; de los seis restantes queda
      escrito en la bitácora que NO se ejecutaron.

## Tanda 5 — el corte del bucle de redirecciones (R29, R30) — añadida el 2026-09-10

> Toda esta tanda sale de `design.md > 10`. **No se toca nada del código de R1–R28**: ya está
> implementado y en verde.

- [x] **T20. Las dos constantes de la marca.** (dep: ninguna)
      Archivos: `lib/shared/routes.ts`.
      `SESSION_ENDED_PARAM` y `LOGIN_ROUTE_SESSION_ENDED`, derivada de `LOGIN_ROUTE`, con el
      comentario que deje escrito **por qué el texto es el mismo para los tres cortes** (R30 a) y
      que la URL no dice el motivo.
      *Hecho cuando:* `pnpm run typecheck` limpio y el literal de la marca aparece **una sola vez**
      en todo el repo (se comprueba buscándolo).

- [x] **T21. La regla 3 deja de disparar con la marca.** (dep: T20)
      Archivos: `lib/modules/identity/domain/route-access.ts`.
      Campo **opcional** `sessionEndedParam` en `RouteAccessInput` y la condición previa del paso
      3, con el comentario de por qué existe (servidor y borde se contradicen; sin esto, bucle).
      Dominio puro: sigue sin importar `next/*`, ni `lib/shared`, ni base.
      *Hecho cuando:* typecheck limpio, los cinco archivos que construyen un `RouteAccessInput`
      literal **no** necesitan cambio, y el guardia de arquitectura sigue en verde.

- [x] **T22. El adaptador declara la marca.** [P con T23] (dep: T21)
      Archivos: `lib/modules/identity/adapters/driving/route-guard-middleware.ts`,
      `tests/unit/identity/route-guard-middleware.test.ts`.
      Una línea: `sessionEndedParam: SESSION_ENDED_PARAM` en la llamada a `decideRouteAccess`. El
      test afirma que el adaptador **la pasa** —esa es la red que compensa que el campo sea
      opcional— y que una petición a `/login` con marca y cookie válida se resuelve en `next()`.
      *Hecho cuando:* el test falla si se borra esa línea (se demuestra borrándola y revirtiendo),
      y `tests/guards/guard-middleware-edge.test.ts` sigue verde.

- [x] **T23. Las dos salidas del servidor emiten la marca.** [P con T22] (dep: T20)
      Archivos: `app/(private)/layout.tsx`,
      `lib/modules/identity/adapters/driving/require-page-permission.ts`.
      `redirect(LOGIN_ROUTE_SESSION_ENDED)` en los dos, con el comentario de por qué **no basta**
      con el layout. `logout-action.ts` **no se toca**.
      *Hecho cuando:* typecheck limpio y ninguno de los dos archivos gana lógica nueva más allá
      del destino del `redirect`.

- [x] **T24. Tests unitarios de R29 y R30.** (dep: T21, T23)
      Archivos: `tests/unit/identity/route-access.test.ts`,
      `tests/unit/identity/require-page-permission.test.ts`, `tests/unit/private-layout.test.tsx`,
      `tests/unit/sidebar-desktop.test.tsx`, `tests/unit/sidebar-mobile.test.tsx`,
      `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx`,
      `tests/unit/configuracion-ui/unit-page.test.tsx`.
      Casos nuevos en `route-access.test.ts`: login + sesión válida + marca → `allow` (R29); login
      + sesión válida **sin** marca → sigue redirigiendo como siempre (regla 3 intacta); **ruta
      privada** con la marca en la query → decisión **idéntica** a la misma sin marca, tanto con
      sesión como sin ella (R30 b); la marca no convierte una sesión ausente en válida (R30 b); la
      marca no viaja en el destino de vuelta. En los cinco archivos de UI/permisos: **una línea**
      cada uno, la constante nueva en la aserción del destino.
      *Hecho cuando:* R29 y R30 tienen cada uno al menos un test nombrado por comportamiento, los
      cinco de una línea pasan sin ningún otro cambio, y ningún test existente cambia de
      significado.

- [x] **T25. E2E: el bucle, de punta a punta y para los tres cortes.** (dep: T22, T23, T24)
      Archivos: `e2e/session.spec.ts`.
      El caso de R28 (b) —el que descubrió el defecto— vuelve a correr y **pasa** en los dos
      navegadores: acaba en la pantalla de login, sin `Load cannot follow more than 20
      redirections`. Se añade la comprobación de que la navegación termina **en una sola**
      redirección, y se cubre además **al menos uno** de los dos cortes preexistentes (baja lógica
      de QC-8 R11 o empresa no viva de QC-48 R15), que es lo que demuestra que R29 los cubre a los
      tres y no solo al de estado.
      *Hecho cuando:* pasan en los dos navegadores con la salida real pegada en la bitácora, y se
      deja escrito qué corte preexistente se ejercitó.

- [x] **T26. Ampliar el mapa `R<n> → test` y la bitácora.** (dep: T24, T25)
      Archivos: `progress/impl_QC-78-estado-de-cuenta-en-el-acceso.md`.
      Dos filas nuevas (R29, R30) con archivo y nombre del caso, **verificadas abriendo el caso**,
      más una nota de por qué la lista de archivos declarados cambió el 2026-09-10.
      *Hecho cuando:* las 30 filas están y ninguna cita un test que no verifique lo que dice.

## Tanda 6 — los tres menores del review de F2.2 — añadida el 2026-09-10

> Del `reviewer` (0 mayores, 7 menores). Aquí solo entran **tres**: el menor 2 espera decisión
> humana y **no se toca**, el 4 queda documentado a propósito, y el 5 y el 6 son del leader.

- [x] **T27. Atar el ORDEN de R5, que ningún test sujetaba.** (menor 1)
      Archivos: `tests/unit/identity/verify-credentials.test.ts`,
      `specs/QC-78-estado-de-cuenta-en-el-acceso/design.md`.
      La mutación M3 del reviewer —mover el corte por estado debajo de `registrarFallo`— dejaba
      los 56 casos en verde, porque `registrarFallo` lleva su propio corte y R6 se conserva: R5
      es una propiedad del **orden del código**, no del comportamiento. Se ata sobre el fuente,
      con el idioma que ya usa ese archivo para QC-19 R17, fijando la secuencia entera. Y se
      corrige la frase falsa de `design.md > 11`, riesgo 1.
      *Hecho cuando:* el caso **cae** con la mutación M3 aplicada y pasa al revertirla, demostrado
      con las dos salidas en la bitácora.

- [x] **T28. La segunda mitad de R30 (a), con test propio.** (menor 3)
      Archivos: `tests/unit/identity/login-page-marca.test.tsx` (nuevo, nº 41).
      Renderiza la pantalla de login con la marca y sin ella y compara el marcado, con un **caso
      de control** que demuestra que la comparación sabe detectar diferencias (el destino de
      vuelta sí cambia el marcado). Sin ese control, dos cadenas iguales por la razón equivocada
      pasarían en verde.
      *Hecho cuando:* los tres casos pasan y el mapa de trazabilidad deja de apoyarse solo en el
      argumento estructural.

- [x] **T29. Las dos afirmaciones caducas.** (menor 7)
      Archivos: `specs/QC-78-estado-de-cuenta-en-el-acceso/tasks.md`,
      `progress/impl_QC-78-estado-de-cuenta-en-el-acceso.md`.
      Una nota en el primer bloque de ampliación de cada archivo remitiendo al que manda: **R29 y
      R30 sí existen**. Cosmético, pero quien lee de arriba abajo se creía lo contrario.
      *Hecho cuando:* los dos sitios llevan la nota y dicen cuál manda.

- [x] **T30. La guardia de rutas de QC-64 R12, que T20 invalidó.** (F2.4)
      Archivos: `tests/unit/recetas-ui/recipe-route-contract.test.ts` (nº 42).
      Añadir `SESSION_ENDED_PARAM` y `LOGIN_ROUTE_SESSION_ENDED` a la lista esperada, **cada una
      con el comentario que dice por qué es legítima**: no son rutas del asistente de lectura
      —que es lo que R12 existe para impedir— sino el parámetro y el destino del corte de sesión
      de QC-78. **Prohibido relajar la aserción**: sigue siendo `toEqual` sobre la lista exacta.
      *Hecho cuando:* el archivo pasa entero **y** se demuestra que la guardia sigue mordiendo,
      añadiendo una constante ficticia a `lib/shared/routes.ts`, viéndola en rojo y quitándola.

- [~] **T16. Gate rápido de cada tanda — *las corre el leader*.** **NO se cumplió como está escrita, y se deja dicho en vez de marcarla.** El leader no corrió `--rapido` por tanda: corrió el gate **completo** dos veces al cerrar la feature (2026-09-10). Cubre más, pero no es lo que la task pedía, y marcarla `[x]` convertiría este archivo en un documento que afirma verificaciones que nadie hizo.
      `./init.sh --rapido` al cerrar cada una de las tandas 1 a **5** (la 5 se añadió el
      2026-09-10).
      *Hecho cuando:* `exit 0` en cada tanda, con la salida anotada en la bitácora.

- [x] **T17. Gate completo — *las corre el leader*.** (dep: T15, T16, T26)
      `./init.sh` completo para cerrar la feature y **otra vez antes de abrir el PR, sin
      excepción**.
      *Hecho cuando:* `exit 0`, sin ningún archivo de test rojo que no estuviera ya en
      `tests/baseline-rojos.json`.

- [~] **T18. Revisión y puerta humana — *la gestiona el leader*.** (dep: T17) **Mitad hecha:** `reviewer` APROBADO el 2026-09-10 (0 mayores, 7 menores, 9 mutaciones), los siete atendidos o decididos. Queda la otra mitad —tarjeta a *Finalizado*, `feature_list.json` y `progress/current.md`—, que es F2.5 y solo se puede hacer **después** del merge humano del PR.
      `reviewer` sobre el conjunto; trazabilidad completa como criterio bloqueante. Después,
      tarjeta, `feature_list.json` y `progress/current.md`.
      *Hecho cuando:* el reviewer aprueba con 0 bloqueantes y el estado queda registrado en disco.
