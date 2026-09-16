# QC-88 — listado-de-pedidos-asignados · bitacora de implementacion

> Fase F2.1, worktree `.worktrees/QC-88-listado-de-pedidos-asignados`, rama
> `feature/QC-88-listado-de-pedidos-asignados`. Spec aprobado por el humano el 2026-09-16.
>
> **Esta bitacora esta INCOMPLETA a proposito y NO cierra la feature.** T18 exige el mapa
> `R1`…`R40` -> test **sin ningun hueco** (`CHECKPOINTS.md > Trazabilidad`), y eso es imposible hoy:
> 12 de las 18 tasks estan bloqueadas (ver `> Bloqueadas`). Lo que hay aqui es lo ejecutado, con su
> evidencia real; lo que falta esta nombrado como falta, no omitido.

## Estado: 5 de 18 tasks cerradas

| Tanda | Tasks | Commit |
|---|---|---|
| 1 | T1, T2, T7 | `1b0b16d` |
| 2 | T3 | `95afb58` |
| 3 | T17 | la tanda de este commit |

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

## Nota de coordinacion, para que no se repita

Dos subagentes escribiendo **en el mismo worktree a la vez** se pisaron: el de T4 reaplico sus
cambios y una limpieza dirigida a las rutas de `pedidos` se los volvio a llevar. Ningun trabajo
commiteado se perdio, pero se gastaron dos corridas. **Leccion: en un worktree, una tanda a la vez**,
o tandas cuyos conjuntos de archivos sean disjuntos **y** ninguna de ellas necesite revertir a la
otra para verse en verde.
