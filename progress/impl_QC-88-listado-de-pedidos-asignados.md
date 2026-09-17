# QC-88 — listado-de-pedidos-asignados · bitacora de implementacion

> Fase F2.1, worktree `.worktrees/QC-88-listado-de-pedidos-asignados`, rama
> `feature/QC-88-listado-de-pedidos-asignados`. Spec aprobado por el humano el 2026-09-16.
>
> **Esta bitacora esta INCOMPLETA a proposito y NO cierra la feature.** T18 exige el mapa
> `R1`…`R40` -> test **sin ningun hueco** (`CHECKPOINTS.md > Trazabilidad`), y eso es imposible hoy:
> 12 de las 18 tasks estan bloqueadas (ver `> Bloqueadas`). Lo que hay aqui es lo ejecutado, con su
> evidencia real; lo que falta esta nombrado como falta, no omitido.

## Estado: 10 de 18 tasks cerradas

| Tanda | Tasks | Commit |
|---|---|---|
| 1 | T1, T2, T7 | `1b0b16d` |
| 2 | T3 | `95afb58` |
| 3 | T17 | `4a08623` |
| — | sincronizacion con `dev` (QC-60/104/81/56) | `b875197` |
| — | F1.4: el humano cierra `[PA1]` y `[PA2]` | `ecf929c` |
| 4 | T4+T5 | `3668d10` |
| 4 | T6 | `8f4b8bf` |
| 4 | T8 | `e61fbee` |
| 4 | T9 | `46bb213` |
| — | correccion post-gate del leader (guardia QC-87 + design.md) | `a09be8d` |

**Quedan 8 tasks abiertas: T10-T16, T18** (la tanda de UI, ruta, menu y E2E — fuera del
alcance de esta tanda de backend).

### Tanda 2 — T3 (2 archivos)

| Archivo | Task |
|---|---|
| `tests/integration/asignaciones/assigned-orders.int.test.ts` (**nuevo**, 6 casos) | T3 |
| `tests/integration/aislamiento.json` (fila nueva en `transaccion`, en orden alfabetico) | T3 |

Ejercita **el adaptador directamente** —`createOrderAssignmentRepository(fixture.tx)` ->
`listOrderIdsByUserInCompany`—, no un caso de uso: T6 no existe todavia.

### Tanda 3 — T17 (5 archivos: 2 movidos, 3 modificados)

| Archivo | Que le pasa |
|---|---|
| `components/shared/responsible-avatars.tsx` | **movido** desde `app/(private)/pedidos/components/` con `git mv`. Git lo registra como **`R` puro (rename 100%)**: ni una linea de API tocada |
| `tests/unit/shared-ui/responsible-avatars.test.tsx` | **movido** desde `tests/unit/pedidos-ui/` (`RM`: rename + imports). Ningun caso de prueba alterado. Precedente de ubicacion: `unexpected-error-notice.test.tsx`, el otro componente de presentacion de `components/shared/` |
| `app/(private)/pedidos/components/index.ts` | reexporta los **mismos 10 simbolos** desde la ubicacion compartida |
| `app/(private)/pedidos/components/order-sheet.tsx` | el **unico** import de producto (`:23`) |
| `tests/unit/pedidos-ui/order-route-contract.test.ts` | la enmienda (ver `> T17` abajo) |

**El import del test quedo mixto y comentado**: el componente y su `data-testid` vienen de
`@/components/shared/responsible-avatars`, pero `MISSING_RESPONSIBLES_MARK` y `MISSING_VALUE_MARK`
**siguen viniendo del barrel de la ruta**, porque lo que ata el marcador a `order-columns.tsx` es esa
comparacion y `MISSING_VALUE_MARK` solo existe alli.

## Preparacion del worktree

`node_modules` no existia. Receta del repo, exit 0: `pnpm install --frozen-lockfile`,
`pnpm exec prisma generate`, `pnpm exec next typegen`.

**Desviacion sobre el encargo: NO se monto base propia `QuimiCloude_QC88`.** Se creo y se borro.
Motivo, medido en disco: el proyecto `integration` de `vitest.config.mts` ya declara su
`globalSetup` sobre `tests/integration/_global-setup.ts`, que **crea una base efimera POR CORRIDA**
desde la plantilla (`createRunDatabase`), publica su URL en el entorno y la borra al terminar; y
`_setup.ts` **aborta la corrida** si la conexion no apunta exactamente a esa base
(`QC77_RUN_DATABASE`, QC-77 R12). O sea: el aislamiento que el encargo pedia montar a mano ya lo da
el arnes, y una base `QuimiCloude_QC88` suelta solo habria sido basura que el barrido de
`db:test clean` tendria que juzgar despues. La plantilla si se aseguro:
`pnpm run db:test template` -> `qct_tpl_5a5346ed8f4d` (28 migraciones), reutilizada.

## Archivos tocados

### Tanda 1 — commit `1b0b16d` (6 archivos, +295/-11)

| Archivo | Task |
|---|---|
| `lib/modules/asignaciones/ports/order-assignment-repository.ts` | T1 |
| `lib/modules/asignaciones/adapters/driven/persistence/order-assignment-prisma.ts` | T2 |
| `tests/unit/asignaciones/order-assignment-repository.test.ts` | T1 + T2 |
| `tests/unit/asignaciones/module-contract.test.ts` | T7 |
| `tests/unit/asignaciones/assign-responsibles.test.ts` | desviacion 1 |
| `tests/unit/asignaciones/order-state.test.ts` | desviacion 1 |

## Mapa `R<n>` -> test (PARCIAL: solo lo ejecutado)

| R | Que exige | Test |
|---|---|---|
| **R9** | lectura «los pedidos de esta persona en esta empresa», `companyId` primero, y que olvidarlo **no compile** | `tests/unit/asignaciones/order-assignment-repository.test.ts` — caso negativo con `@ts-expect-error` (patron ya vigilado en ese archivo) + ancla del orden de los seis metodos |
| **R10** | una sola sentencia, sin `include`, sin navegar relacion | mismo archivo — «es UNA sola consulta…» y «el orderBy es orderId ascendente…» |
| **R36** | el codigo de consulta legitimo **solo** en el caso de uso nuevo; sigue dando hallazgo en `app/**`, `components/**`, `lib/shared/**`, adaptador driving y otro modulo | `tests/unit/asignaciones/module-contract.test.ts` — regla (e), caso `:764` (tres portazos de QC-87) + caso nuevo de QC-88 con sus tres portazos |
| **R37** | nadie fuera de `adapters/driven/**` consulta `prisma.orderAssignment`; ninguna consulta nueva usa `include` | mismo archivo («el select trae SOLO orderId, y no hay ningun include») + `tests/guards/guard-lote-sin-join.test.ts` |
| **R8** | una asignacion de otra empresa no vuelve **ni se distingue de una inexistente** | `tests/integration/asignaciones/assigned-orders.int.test.ts` — «R8: la asignacion de OTRA empresa no vuelve, y no se distingue de una que no existe». La asignacion ajena se siembra **de verdad** (pedido real + persona real de `companyB`, dada de alta por el caso de uso real de QC-87) y el caso **lee `order_assignments` al margen del adaptador** antes de afirmar que no vuelve: lo demostrado es que el `where` la filtra, no que no hubiera datos |
| **R7** | toda lectura acotada a la empresa del actor | mismo archivo — «el mismo `user_id` preguntado por la OTRA empresa devuelve vacio, teniendo filas» (es el caso que mata la mutacion: quitar `companyId` del `where` lo pone rojo), «solo los pedidos de ESA persona, no los de su companera de empresa», y «la BASE impide que un mismo `user_id` tenga filas en dos empresas (FK compuesta)» |
| R15 (parcial) | ids desnudos y orden estable entre dos lecturas | mismo archivo — «devuelve identificadores DESNUDOS, ordenados, y dos lecturas seguidas dan lo mismo». El orden **de la lista que ve el usuario** lo pone `pedidos` y queda sin cubrir (T5/T6, bloqueadas) |
| R1-R6, R11-R35, R38-R40 | — | **SIN CUBRIR**: sus tasks estan bloqueadas |

**T17 no cierra ningun `R<n>` de QC-88, y conviene no confundirlo.** Promover `ResponsibleAvatars`
**habilita** R18 y R19 —hace que el componente se pueda consumir desde la pantalla nueva sin
importar por ruta profunda ni duplicarlo—, pero R18 y R19 hablan de **lo que muestra cada fila de
esta pantalla**, y esa pantalla es T12/T14, bloqueadas. Apuntar R18/R19 como cubiertos por T17 seria
un verde falso: lo que hoy esta probado es el componente **en su sitio nuevo** y el contrato de ruta
de QC-102, no la fila de QC-88. R26 («no se toca `components/shared/data-table/`») si se sostiene, y
T17 lo respeto.

## Salida real de lo que se corrio

```
pnpm typecheck   -> VERDE (tsc --noEmit, sin salida)
pnpm lint        -> VERDE (eslint, sin salida)

pnpm exec vitest run tests/unit/asignaciones/order-assignment-repository.test.ts
                     tests/unit/asignaciones/module-contract.test.ts
                     tests/guards/guard-lote-sin-join.test.ts
 Test Files  3 passed (3)
      Tests  45 passed (45)
   Duration  1.01s
```

Corridas de los subagentes, mas amplias (`vitest related` arrastro integracion, que levanto y borro
su base efimera `qct_qc88_…`):

```
T2: Test Files 141 passed (141) · Tests 2154 passed | 1 skipped (2155) · 191.77s
T7: mutacion deliberada de la regla (e) -> 3 failed (caen los tres casos a la vez)
    restaurada -> 24 passed (24)
```

Tanda 2 (T3), verificada por el implementer despues de la entrega del subagente:

```
pnpm typecheck -> VERDE (sin salida)
pnpm lint      -> VERDE (sin salida)

pnpm exec vitest run tests/integration/asignaciones/assigned-orders.int.test.ts
                     tests/guards/guard-aislamiento-integracion.test.ts
test-db: plantilla reutilizada: qct_tpl_5a5346ed8f4d (las migraciones no han cambiado)
test-db: la corrida de integracion va contra qct_qc88_6c532eac_mu49iqnn_cbw (copia de qct_tpl_5a5346ed8f4d).
 Test Files  2 passed (2)
      Tests  12 passed (12)
   Duration  4.30s
test-db: borrada la base de la corrida: qct_qc88_6c532eac_mu49iqnn_cbw.
```

La corrida **creo y borro su propia base efimera**, que es la confirmacion en ejecucion de por que
no hacia falta montar `QuimiCloude_QC88` a mano.

Tanda 3 (T17), verificada por el implementer despues de la entrega del subagente:

```
pnpm typecheck -> VERDE (sin salida)
pnpm lint      -> VERDE (sin salida)

pnpm exec vitest run tests/unit/pedidos-ui/order-route-contract.test.ts
                     tests/unit/shared-ui/responsible-avatars.test.tsx
                     tests/unit/pedidos-ui/a11y-tactil.test.tsx
                     tests/unit/pedidos-ui/order-sheet-responsibles.test.tsx
 Test Files  4 passed (4)
      Tests  54 passed (54)
   Duration  10.72s
```

`a11y-tactil.test.tsx` y `order-sheet-responsibles.test.tsx` **no cambiaron ni un import** y siguen
verdes: entran por el barrel de la ruta, que sigue reexportando. Es la comprobacion de que la
promocion no rompio a los consumidores existentes.

La mutacion de T7 es la evidencia de que la guardia **muerde**: ensanchar la puerta de igualdad
exacta a prefijo de carpeta pone en rojo el caso `:764` de QC-87, el caso nuevo de QC-88 y la
mutacion (e2) sobre el fuente real. No se puede aflojar en silencio.

## Desviaciones declaradas

1. **Alcance ampliado en la tanda 1, a dos archivos que no nombra ninguna task.** Anadir un metodo
   **requerido** a `OrderAssignmentRepository` rompe a todos sus implementadores. Cuatro sitios
   rompieron: el adaptador real (era T2) y **tres dobles** —dos en
   `tests/unit/asignaciones/assign-responsibles.test.ts`, uno en
   `tests/unit/asignaciones/order-state.test.ts`— que `tasks.md` no lista en T1 ni en T2. El sistema
   de tipos obliga a cerrarlos en el mismo commit. Es un **hueco de la descomposicion T1/T2**, no una
   decision de diseno reabierta: la firma y el orden de parametros son literales de `design.md > 4`.
   El resto de dobles del repo no rompio porque castean via `as unknown as OrderAssignmentRepository`.
2. **T4 se escribio y se revirtio.** Ver `> Bloqueadas`.
3. **Base propia no montada.** Ver `> Preparacion del worktree`.
4. **R7 no se pudo demostrar con «un `user_id` con filas en dos empresas»: el esquema lo impide.**
   `db/migrations/20260911120000_order_assignments/migration.sql:168` declara
   `order_assignments_user_id_fkey` como FK **compuesta** `(user_id, company_id) -> users(id, company_id)`,
   y `users.company_id` es una sola: la base rechaza la fila. R7 se cubrio por el lado que si existe
   —el mismo `user_id` preguntado por la otra empresa devuelve vacio **teniendo filas**, que ademas es
   el caso que mata la mutacion— y se anadio un caso que **demuestra la imposibilidad** con
   `withSavepoint` en vez de darla por sabida. Ese caso vale por si solo: el OJO 2 de
   `db/schema.prisma` deja escrito que si alguien simplifica esa FK a `(user_id) -> users(id)` todo
   sigue verde y la coherencia de empresa **desaparece en silencio**; ahora no.
5. **Prisma no sabe el nombre de esa FK.** La primera version del test afirmaba sobre
   `order_assignments_user_id_fkey` y salio roja: Prisma reporta
   `Foreign key constraint violated on the (not available)`, **sin nombre**, porque la FK compuesta va
   escrita a mano en el `migration.sql` y Prisma no la modela. La asercion se corrigio a la **clase**
   de error, con el motivo escrito en el test: pedir el nombre seria afirmar sobre una limitacion del
   cliente, no sobre la base. El comportamiento nunca fallo, solo la asercion.
6. **El riesgo 4 de `design.md > 14` (dos definiciones del avatar) NO aplica y no hay deuda que
   anotar**: QC-102 esta mergeado en `dev` —`app/(private)/pedidos/components/responsible-avatars.tsx`
   y su test estan en `dev` y en el HEAD de esta rama—, asi que T17 iba por **promocion**, no por el
   plan B. Pero T17 quedo bloqueada por otro motivo (ver abajo).

## Bloqueadas

### Por QC-60 — 12 tasks

QC-60 reescribe `db/schema.prisma` y
`lib/modules/pedidos/adapters/driven/persistence/order-catalog-prisma.ts`.
**T5 es el adaptador de `listAliveSummariesByIds`, en el segundo de esos archivos.**

El corte es **mas profundo que «parar antes de T5»**, y es el hallazgo principal de la fase:

- **T4 tampoco puede entrar**, aunque no toque ninguno de los dos archivos. T4 anade un metodo
  **requerido** a la interfaz `OrderCatalog`, y sus implementadores son tres:
  `lib/composition/index.ts:919`, `tests/integration/asignaciones/use-case-fixture.ts:68` y
  `tests/unit/asignaciones/assign-responsibles.test.ts:651`. El unico que puede volver a ponerlos
  verdes es **la funcion del adaptador que escribe T5**. Se escribio T4, se comprobo que deja el
  typecheck en **3 errores TS2741** irresolubles desde esta rama, y **se revirtio** para poder
  cerrar la tanda en verde. Su contenido esta integramente especificado en `design.md > 6`, asi que
  rehacerla cuando QC-60 mergee es barato.
- De T5 cuelgan en cascada **T8 -> T9 -> T12 -> T13/T14/T15/T16**.
- **T10 y T11** (ruta y menu) caen con ellas: T10 **no puede entrar sola** porque
  `guard-rutas-privadas-cubiertas` se pone roja en los dos sentidos —prefijo sin pantalla y pantalla
  sin prefijo—, asi que exige entrar en el **mismo commit que T12**, que depende de T9.

Bloqueadas por QC-60: **T4, T5, T6, T8, T9, T10, T11, T12, T13, T14, T15, T16**.

### T17 — estuvo bloqueada por un contrato de QC-102; **RESUELTA** por decision humana del 2026-09-16

`tests/unit/pedidos-ui/order-route-contract.test.ts:157-192` (R36 de QC-102, **verde hoy: 17/17**)
afirma sobre **rutas de disco** que `responsible-avatars.tsx` vive **dentro** de
`app/(private)/pedidos/components/`: comprueba el `existsSync` del archivo, que el barrel lo
reexporte por su ruta relativa, y que el archivo empiece por la directiva de cliente. Promover el
componente a `components/shared/` pone esos tres casos en **rojo**, y **ese archivo no esta en la
lista «Toca» de T17** (que solo nombra los `tests/unit/pedidos-ui/*` que **importen** esos simbolos;
este no importa ningun simbolo, afirma sobre disco).

En su momento **no se toco nada** y se devolvio al leader: enmendar el contrato de otra feature
aprobada es decision de spec, y hacerlo por cuenta propia seria exactamente el «aflojar una guardia
ajena» que T7 prohibe como principio.

**Resolucion (decision humana del 2026-09-16): se PROMUEVE y se enmienda el test.** El motivo es la
regla de los dos consumidores de `docs/architecture.md > Componentes`: QC-88 es el **segundo**
consumidor con la misma API, y la alternativa era duplicar el avatar o importar por ruta profunda
las tripas de `/pedidos` —que es justo lo que ese `describe` prohibe—. Mismo patron con el que QC-56
invirtio R14 de QC-26 y R11 de QC-44.

**La enmienda TENSA, no afloja.** Lo unico que cambia es **la ubicacion declarada de este
componente**: la lista del `describe` pasa de `NUEVOS = ['responsible-avatars.tsx',
'order-responsibles.tsx']` a `DE_LA_RUTA = ['order-responsibles.tsx']`, y sus tres exigencias
—dentro de `components/`, reexportado por el barrel, directiva de cliente propia— **siguen corriendo
intactas** sobre lo que sigue siendo de la ruta. El caso del barrel se generalizo para **derivar** el
`from './<nombre>'` de la lista en vez de escribir literales. Nota fechada en bloque destacado sobre
el `describe`, citando `design.md > 8.3`/H6, la regla de arquitectura, la decision humana y el
precedente QC-56, y dejando escrito: **«cambia su ubicacion declarada, no la exigencia»**.

**Y ademas se anadio vigilancia** (por eso tensa): un caso nuevo que exige que **la ruta no conserve
una copia propia** del avatar promovido —impide que la promocion quede a medias con dos definiciones
divergiendo— y un `describe` nuevo de 4 casos para la nueva casa: el archivo existe en
`components/shared/`, **sigue empezando por la directiva de cliente** (promoverlo no lo convierte en
Server Component), el barrel lo reexporta **desde la ubicacion compartida** y **en negativo** no por
ruta relativa, y el barrel sigue nombrando el simbolo. El componente promovido **no quedo sin
vigilancia**.

**Prueba por mutacion — 4 mutaciones, todas restauradas byte-exacto:**

| Mutacion | Resultado |
|---|---|
| A) `order-responsibles.tsx` pierde su directiva de cliente | **ROJO** — 1 failed \| 21 passed |
| B) el barrel vuelve a exportar por ruta relativa (promocion deshecha a medias) | **ROJO** — 1 failed \| 21 passed |
| C) la ruta se queda una copia propia del avatar | **ROJO** — 1 failed \| 21 passed |
| D) `order-responsibles.tsx` sale de `components/` y queda suelto junto a `page.tsx` | **ROJO** — 3 failed \| 19 passed |
| (restaurado) | **VERDE** — 22 passed (22) |

**Nota metodologica que merece quedar escrita:** el primer intento de mutacion fue un **no-op
silencioso** —el `perl` no matcheo porque los archivos tienen **CRLF**, el test siguio verde y eso
**no era evidencia de nada**—. Se detecto y se repitio con `\r?\n`. Una mutacion que no muta es
exactamente el falso verde que esta tecnica existe para evitar.

**Dato util para quien lo retome:** los tres tests de componente
(`responsible-avatars.test.tsx`, `a11y-tactil.test.tsx`, `order-sheet-responsibles.test.tsx`) ya
importan **por el barrel de la ruta**, no por ruta profunda, asi que la promocion no les cambia ni
un import. El unico import de producto que habria que reescribir es `order-sheet.tsx:23`;
`order-columns.tsx` y `order-responsibles.tsx` **no importan el componente**, al contrario de lo que
suponia el desglose.

## Sincronizacion con `dev`, 2026-09-16 (FASE 1, antes de retomar T4+)

Retomado desde arbol limpio en HEAD `4a08623` (T1, T2, T3, T7, T17 ya cerradas). Se fusiono
`origin/dev` -137 commits: QC-60 `aislamiento-por-empresa-en-pedidos`, QC-104 `sesion-una-sola-vez-
por-peticion`, QC-81 `lote-y-fecha-de-compra`, QC-56- para poder retomar T4 en adelante contra la
base real.

**Merge:** `git fetch origin dev && git merge origin/dev`. **Un solo conflicto de texto**, `add/add`
en `specs/QC-88-listado-de-pedidos-asignados/requirements.md`: `dev` traia el placeholder sembrado
`_Pendiente: los escribe spec_author (F1.2)._` (de antes de que el spec se escribiera) y esta rama
trae los 40 requisitos ya aprobados por el humano. **Resuelto quedandome con los de esta rama**: no
es ambiguo, el placeholder es literalmente anterior al trabajo ya aprobado.

**`db/schema.prisma` y `order-catalog-prisma.ts` NO dieron conflicto de texto**, al reves de lo que
`design.md > 13` anticipaba. Motivo medido: la superficie de choque prevista era el metodo nuevo que
T5 iba a escribir (`listAliveSummariesByIds`), y T5 **todavia no existe** en este HEAD (esta
bloqueada por QC-60 desde la tanda anterior). Git fusiono limpio porque no habia nada mio que
tocara esos archivos todavia.

**Lo que SI cambio, medido tras el merge:**
- `orders` **ya tiene `company_id`** (migracion `20260915120000_orders_company_scope`).
- `findAliveOrderTargetById` -el UNICO metodo de `OrderCatalog` que existe hoy- **ya filtra por
  empresa**: `orderCompanyScope({ companyId })` en `AND` (`order-catalog-prisma.ts:44`,
  `./company-scope.ts`, nuevo). Su firma crecio a `(id, companyId)` y `OrderCatalog.findAliveById`
  en el dominio la sigue.
- **Filtro de empresa en la lectura de catalogo en lote (punto 4 del encargo):** `T4/T5
  (listAliveSummariesByIds`, seccion `design.md > 6`) **siguen sin escribirse**, asi que no hay nada
  que migrar todavia -no hubo "reescribir el metodo con el filtro que faltaba", porque el metodo no
  existia-. Lo que se anoto, en `design.md > 6` y `> 13` y en `tasks.md > T4/T5`, con fecha: cuando
  T4/T5 se escriban, **nacen ya acotadas por empresa** (`companyId` como primer parametro de
  `listAliveSummariesByIds`, igual que `listOrderIdsByUserInCompany`, y `orderCompanyScope({
  companyId })` en el `where` del adaptador junto a `id: { in }`, `status: { in }` y `deletedAt:
  null`). El caso de uso (T6) ya tenia `actor.companyId` disponible en el paso 3 de `design.md >
  5.1`; el paso 5 se actualizo para pasarlo tambien al catalogo.

**Regresion de merge encontrada y corregida (no era un conflicto de texto, era semantica):**
`tests/integration/asignaciones/assigned-orders.int.test.ts` (T3, ya cerrada) tenia un caso, «R8: la
asignacion de OTRA empresa no vuelve…», que sembraba el pedido «ajeno» con `createOrder(fixture)`
-companyId por defecto = `companyA`- y lo asignaba con un actor de `companyB`. Antes del merge
`orders` no tenia `company_id` y esto daba igual; con QC-60 fusionado, `assignResponsibles` llama
`orders.findAliveById(orderId, companyId)`, que ahora filtra por empresa, y el pedido "ajeno" no
aparecia para la empresa B: `OrderNotFoundError` en vez del comportamiento esperado. **Fix**: el
pedido ajeno nace con `{ companyId: fixture.companyB }` (la fixture ya tenia ese parametro,
`OrderOptions.companyId`, para exactamente este caso). Se actualizo tambien la cabecera del archivo,
que documentaba -correcto en su momento- que `orders` no tenia empresa. No se toco ningun otro
`createOrder` del archivo: los demas ya usaban `companyA` para pedido y asignacion por igual.

**Verificacion de la fase 1:**
```
pnpm exec prisma migrate deploy   -> "No pending migrations to apply." (las dos entraron con el merge)
pnpm exec prisma migrate status   -> "Database schema is up to date!"
pnpm exec prisma generate         -> OK (Prisma Client v6.19.3)

pnpm typecheck -> VERDE (tsc --noEmit, sin salida)
pnpm lint      -> VERDE (eslint, sin salida)

pnpm exec vitest run tests/unit/pedidos tests/unit/asignaciones
                     tests/guards/guard-ambito-empresa-pedidos.test.ts
                     tests/guards/guard-identificador-de-request.test.ts
 Test Files  58 passed (58)
      Tests  988 passed | 3 skipped (991)

pnpm exec vitest run tests/integration/pedidos tests/integration/asignaciones   (antes del fix)
 Test Files  1 failed | 21 passed (22)
      Tests  1 failed | 185 passed (186)      <- assigned-orders.int.test.ts, caso R8

pnpm exec vitest run tests/integration/pedidos tests/integration/asignaciones   (despues del fix)
 Test Files  22 passed (22)
      Tests  186 passed (186)

pnpm exec vitest run tests/guards
 Test Files  36 passed (36)
      Tests  403 passed | 5 skipped (408)
```

**No quedan tasks de esta feature abiertas por este merge.** T1-T3, T7 y T17 siguen cerradas y
verdes contra la base sincronizada; T4 en adelante sigue bloqueada solo por lo que ya estaba
bloqueada (nada nuevo lo bloquea). El leader corre el gate completo antes de dar paso a la fase 2.

## Nota de coordinacion, para que no se repita

Dos subagentes escribiendo **en el mismo worktree a la vez** se pisaron: el de T4 reaplico sus
cambios y una limpieza dirigida a las rutas de `pedidos` se los volvio a llevar. Ningun trabajo
commiteado se perdio, pero se gastaron dos corridas. **Leccion: en un worktree, una tanda a la vez**,
o tandas cuyos conjuntos de archivos sean disjuntos **y** ninguna de ellas necesite revertir a la
otra para verse en verde.

---

## Tanda 4 (F2.1b) — T4, T5, T6, T8, T9. La tanda de backend, con [PA1]/[PA2] ya cerradas

`[PA2]` cerrada (opcion B, `> Decisiones cerradas` de `requirements.md`): `listAssignedOrders`
nace en `asignaciones`, `pedidos` solo aporta el catalogo en lote. Delegado en `backend_dev`
en un unico encargo secuencial (T4 -> T5 -> T6 -> T8 -> T9), sin tocar nada de T10 en adelante
([PA1] resuelto pero fuera de esta tanda, es la UI).

**Incidente del subagente:** la primera invocacion de `backend_dev` se quedo estancada (sin
progreso 600s, watchdog no recupero) y el harness la marco `failed`. **No se perdio trabajo**:
el arbol quedo con T4, T5, T6 (sin commitear), T8 y T9 completos y consistentes -typecheck en
verde-, solo faltaba el commit. El implementer revisó cada diff contra `design.md` antes de
commitear (no se relanzo un segundo subagente sobre el mismo arbol, precisamente por la leccion
de coordinacion de arriba), corrigio un test roto que el subagente no habia tocado (ver
`> Desviacion` abajo) y cerro los cuatro commits el mismo.

### Archivos por task

| Task | Archivos | Commit |
|---|---|---|
| T4 | `lib/modules/pedidos/domain/order-catalog.ts` (tipo `AssignedOrderSummary` + metodo en `OrderCatalog`), `lib/modules/pedidos/index.ts` (2 exports de tipo) | `3668d10` |
| T5 | `lib/modules/pedidos/adapters/driven/persistence/order-catalog-prisma.ts` (`listAliveOrderSummariesByIds`, funcion nueva al final), `tests/unit/pedidos/order-catalog.test.ts` | `3668d10` |
| — | Cierre de los tres implementadores que el metodo REQUERIDO rompio: `tests/integration/asignaciones/use-case-fixture.ts`, `tests/unit/asignaciones/assign-responsibles.test.ts`, `tests/unit/pedidos/company-isolation-service.test.ts` | `3668d10` |
| T6 | `lib/modules/asignaciones/domain/list-assigned-orders.ts` (nuevo), `lib/modules/asignaciones/domain/assigned-order-view.ts` (nuevo), `lib/modules/asignaciones/index.ts` (bloque nuevo), `tests/unit/asignaciones/list-assigned-orders.test.ts` (nuevo), `tests/unit/asignaciones/authorization.test.ts` (caso R40) | `8f4b8bf` |
| T8 | `lib/composition/index.ts` (`orderCatalog` + fachada `asignaciones.listAssignedOrders`), `tests/unit/composition/asignaciones-facade.test.ts` | `e61fbee` |
| T9 | `lib/modules/asignaciones/adapters/driving/order-assignment-actions.ts` (`listAssignedOrdersAction`), `tests/unit/asignaciones/order-assignment-actions.test.ts` | `46bb213` |

### Desviacion declarada: `tests/unit/pedidos/order-catalog.test.ts` roto por el merge T4/T5, no anotado por el subagente

`vitest related` sobre el conjunto de archivos tocados dio **1 test roto** en
`tests/unit/pedidos/order-catalog.test.ts`: la asercion `import type { OrderStatus } from
'./order-classification'` esperaba que esa fuera la UNICA linea de import de ese archivo, y T4
le sumo `OrderPriority` a la misma linea (para `AssignedOrderSummary`). Ademas, arreglada esa,
aparecia una segunda: el bucle que comprueba que `OrderAssignmentTarget` NO expone
`recipeId`/`quantity`/`priority` buscaba en el **archivo entero**, y `AssignedOrderSummary` -en
el MISMO archivo, a proposito, por `design.md > 6`- SI lleva esos campos.

**Arreglo, hecho por el implementer, no por el subagente:** la primera asercion se relajo a
tolerar cualquier orden dentro del mismo `import type { ... } from` (sigue exigiendo que
`OrderStatus` venga de `order-classification`, no de una lista copiada). La segunda se acoto al
**bloque de texto** de `OrderAssignmentTarget` (`catalogoFuente.slice(...)` entre su declaracion
y `export interface OrderCatalog`), en vez de al archivo completo, para que la comprobacion siga
siendo real -que el tipo VIEJO no gano campos- sin dar un falso rojo por el tipo NUEVO que
comparte archivo a proposito. Commiteado dentro de `3668d10`, junto con T4/T5.

### Salida real de lo que se corrio

```
pnpm typecheck -> VERDE (tsc --noEmit, sin salida)
pnpm lint      -> VERDE (eslint, sin salida)

pnpm exec vitest related --run <14 archivos de produccion y test de T4/T5/T6/T8/T9>
test-db: plantilla reutilizada: qct_tpl_d83b600eb00c (las migraciones no han cambiado)
test-db: la corrida de integracion va contra qct_qc88_6c532eac_mu4ty0kz_cxg (copia).
 Test Files  1 failed | 148 passed (149)
      Tests  1 failed | 2323 passed | 1 skipped (2325)
      <- el 1 failed es tests/unit/pedidos/order-catalog.test.ts, arreglado (ver arriba)
test-db: borrada la base de la corrida.

Tras el arreglo:
pnpm exec vitest run tests/unit/pedidos/order-catalog.test.ts
 Test Files  1 passed (1)
      Tests  10 passed (10)

pnpm typecheck -> VERDE (repetido tras el arreglo)
pnpm lint      -> VERDE (repetido tras el arreglo)
```

### Mapa `R<n>` -> test, incremental (lo que esta tanda ANADE al parcial de arriba)

| R | Que exige | Test |
|---|---|---|
| **R5** | `asignaciones.consultar` en la PRIMERA linea, antes de `zod` y de tocar puerto | `tests/unit/asignaciones/list-assigned-orders.test.ts` — «R5: exige…ANTES de tocar ningun puerto» + `tests/unit/asignaciones/authorization.test.ts` — «R40: un actor sin…» |
| **R6** | los cuatro actores invalidos se rechazan igual, sin tocar puerto | `list-assigned-orders.test.ts` — «R6: los cuatro actores invalidos…» |
| **R7** | empresa y persona SALEN DEL ACTOR, nunca de la entrada | `list-assigned-orders.test.ts` — «R7 la empresa y la persona salen del ACTOR» (dos casos: `listOrderIdsByUserInCompany` y `listAliveSummariesByIds`) |
| **R11** | solo PENDIENTE/EN_CURSO, descartados ANTES de paginar, `total` describe lo mostrado | `order-catalog.test.ts` (adaptador: `deletedAt: null`, `orderCompanyScope`, paginacion con `toOffsetLimit`/`buildPage`) + `list-assigned-orders.test.ts` (caso de uso: llama con `['PENDIENTE','EN_CURSO']`) + tipo `AssignedOrderView.status` acotado a esos dos literales (error de compilacion, no de test) |
| **R12** | el barrel no arrastra `next/*`/`@prisma/client`/`'use server'` | `tests/unit/pedidos/module-contract.test.ts` (ya existente, sigue verde: no se toco) + inspeccion manual del cierre de imports de `lib/modules/pedidos/index.ts` y `lib/modules/asignaciones/index.ts` |
| **R13** | el cableado puerto -> implementacion vive SOLO en `lib/composition` | `tests/unit/composition/asignaciones-facade.test.ts` — «expone las cinco anteriores mas `listAssignedOrders`…» + «rechaza sin `asignaciones.consultar` sin llegar a la base» |
| **R14** | numero de consultas CONSTANTE, no crece con filas ni con tamano de pagina | `list-assigned-orders.test.ts` — «las mismas CUATRO llamadas de puerto con 1 fila que con 25» |
| **R15** | ids desnudos y orden estable (parcial ya cubierto en T3); aqui: dedupe de recetas, responsables por pagina, comparador reutilizado | `list-assigned-orders.test.ts` — «deduplica los ids de receta…», «llama al lote de responsables…con los ids DE LA PAGINA» |
| **R16** | numero visible compuesto por `formatOrderNumber`, nunca a mano | `list-assigned-orders.test.ts` — «compone el numero visible con `formatOrderNumber`…» |
| **R17** | receta sin resolver pinta `null`, nunca el id | `list-assigned-orders.test.ts` — «una receta sin resolver pinta `null`…» |
| **R20** | el actor no aparece entre sus propios responsables | `list-assigned-orders.test.ts` — «descarta al actor de `otherResponsibles`…» |
| **R27** (lado servidor) | los datos se piden en el servidor; ninguna Action comprueba permisos por su cuenta | `tests/unit/asignaciones/order-assignment-actions.test.ts` — describe `QC-88 T9`, 6 casos (aridad, `data` tal cual, error por `code`, NO comprueba permiso, dos caras de sesion, no reexportada del barrel) |
| **R37** | nadie fuera de `adapters/driven/**` consulta `prisma.orderAssignment`; sin `include` | sigue cubierto por T2 (sin cambios); `listAliveOrderSummariesByIds` no toca `prisma.orderAssignment` |
| **R40** | test que llama la OPERACION con actor sin permiso y confirma que NO llega al repositorio | `authorization.test.ts` — «R40: un actor sin…lanza SIN llegar al repositorio» (cuenta invocaciones de los 5 dobles) + `list-assigned-orders.test.ts` — «R40: un actor sin el permiso lanza SIN llegar al repositorio (contando invocaciones)» |

**Sigue sin cubrir** (bloqueado por la tanda de UI, T10-T18): R1-R4, R18-R19, R21-R36, R38-R39.

## Deudas y notas para quien retome T10 en adelante

- El tope de ids del riesgo 1 de `design.md > 14` sigue sin decidirse: no se anadio, como
  manda la regla 6 de no inventar.
- `[PA1]` ya esta cerrada (`/asignacion`, `ASSIGNED_ORDERS_ROUTE`/`ASSIGNED_ORDERS_LABEL`,
  `testId` `nav-asignacion`): T10-T16 pueden entrar directamente con ese valor, sin nueva
  pregunta al humano.

## Correccion post-gate del leader, 2026-09-16 (commit `a09be8d`)

`./init.sh --rapido` corrido por el leader sobre la Tanda 4 dio **un rojo legitimo**, invisible
para el implementer porque `vitest related` no relaciona esa guardia con los archivos de T9
—solo el gate completo la corre—, mas una inexactitud documental que el implementer no habia
detectado al revisar el diff del subagente.

1. **`tests/guards/guard-qc87-no-reimplementado.test.ts` (a), rojo.** La lista `ACCIONES`
   -escrita a mano, comparada conjunto a conjunto contra lo que exporta de verdad
   `order-assignment-actions.ts`- no incluia `listAssignedOrdersAction` (T9). Enmendada por el
   MISMO criterio que T7 uso para la guardia de `asignaciones.consultar`: se anade la accion
   nueva con nota fechada, **sin relajar la comparacion de conjunto a conjunto** -su valor esta
   justo en que sea exacta-. Verificado que el resto de la guardia sigue mordiendo: **12/12
   verdes** despues de la enmienda, incluidos los casos (b)/(b bis) que vigilan que la pantalla
   no reimplemente una regla de QC-87.

2. **`design.md:187` desactualizado, no un hallazgo de codigo.** Decia «Consultas por pagina: 4,
   constantes» y enumeraba cuatro; `list-assigned-orders.ts` (T6) siempre hizo CINCO -se omitio
   del conteo original la lectura de `people.findRefsIncludingDeletedInCompany`, los nombres
   mostrables de los responsables-. **R14 se cumple igual**: exige numero CONSTANTE, no que sean
   cuatro, y la quinta lectura es una sola llamada con ids deduplicados, igual que las otras
   cuatro. Se corrigio el parrafo con nota fechada; **no se toco codigo**, porque el caso de uso
   nunca estuvo mal.

**Autocritica:** en el handback anterior el implementer afirmo «no encontre ningun choque entre
`design.md` y la realidad del codigo». La inexactitud del conteo de consultas SI era ese choque
y no se detecto en la revision del diff -la revision confirmo que el ORDEN de las 8 operaciones
de `design.md > 5.1` se seguia al pie de la letra, pero no conto cuantas lecturas de puerto
hacia el caso de uso contra el parrafo de `> 2.2`-. Queda anotado para que la proxima revision
de un diff contra `design.md` incluya un conteo explicito de llamadas a puerto cuando el diseno
declare un numero.

Verificacion tras la correccion:
```
pnpm typecheck -> VERDE (sin salida)
pnpm lint      -> VERDE (sin salida)
pnpm exec vitest run tests/guards/guard-qc87-no-reimplementado.test.ts
 Test Files  1 passed (1)
      Tests  12 passed (12)
```
