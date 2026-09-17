# QC-63 — ejecutar-receta-operador · tasks.md

> **Antes de T1**: el spec está en `spec_ready` y espera aprobación humana. Hay además **una
> pregunta abierta que bloquea la mitad de R21** (`design.md > 3.2`): de dónde sale la cantidad para
> la que está escrita la receta. **No se implementa T12 sin respuesta.**
>
> `[P]` = paralelizable con las tareas de su mismo bloque. **Ninguna dependencia nueva** en ninguna
> task: si al hacerla parece hacer falta una, se **para** y se sube la propuesta con los cuatro
> checks (`docs/architecture.md > Dependencias de terceros`).
>
> `docs/conventions.md > Comentarios`: en producción (`app/`, `lib/`, `components/`, `db/`) **no se
> cita ficha ni requisito** en ningún comentario. En `tests/` y `e2e/`, `R<n>` **sí** va en el
> **nombre del caso**. Al tocar un archivo se limpian los comentarios **de las líneas que toca la
> rama**, no del archivo entero.

---

## Bloque A — Servicios que los otros módulos tienen que ofrecer

### T1 [x] [P] — `pedidos` aprende a mover el estado por encargo
**Toca:** `lib/modules/pedidos/domain/order-catalog.ts`,
`lib/modules/pedidos/adapters/driven/persistence/order-catalog-prisma.ts`,
`tests/unit/pedidos/order-catalog.test.ts`
**Hacer:** añadir `transitionAliveById(id, companyId, from, to, actorId, now)` a `OrderCatalog`
(`design.md > 3.1`). El método llama a `assertTransition(from, to)` **dentro** de `pedidos`; el
`UPDATE` filtra por `id`, `companyId`, `deletedAt: null` **y `status === from`**, y devuelve
`'ok' | 'not_found' | 'stale'`. Deja `updatedBy = actorId`.
**Hecho cuando:** hay test que (a) mueve `PENDIENTE→EN_CURSO` y `EN_CURSO→ENTREGADO`; (b) rechaza
`ENTREGADO→EN_CURSO` con `InvalidTransitionError` **sin escribir**; (c) devuelve `'not_found'` con
otra empresa; (d) devuelve `'stale'` si `from` no coincide. `pnpm exec tsc --noEmit` verde.
**Depende de:** nada.

### T2 [x] [P] — `recetas` publica el contenido que se ejecuta
**Toca:** `lib/modules/recetas/domain/recipe-catalog.ts`,
`lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma.ts`,
`lib/modules/recetas/index.ts`, `tests/unit/recetas/recipe-catalog.test.ts`
**Hacer:** `findExecutionContentById(id)` → `RecipeExecutionContent | null` con pasos y líneas, y
`isDeleted` en vez de ocultar la receta retirada (`design.md > 3.3`). **Sin `companyId` en la
firma**, y el porqué —`recipes` no tiene la columna, deuda de QC-50— va escrito **en `design.md`**,
no en un comentario del código.
**Hecho cuando:** test que devuelve pasos y líneas de una receta viva, otro que devuelve la receta de
baja con `isDeleted: true`, y otro que devuelve `null` para un id inexistente.
**Depende de:** nada.

### T3 [x] [P] — `unidades` sabe listar las hermanas de una unidad
**Toca:** `lib/modules/unidades/domain/unit-catalog.ts`,
`lib/modules/unidades/adapters/driven/persistence/unit-prisma.ts`,
`tests/unit/unidades/unit-catalog.test.ts`
**Hacer:** `findRefsSharingBaseInCompany(companyId, unitIds)` → `UnitRef[]` de las unidades visibles
para esa empresa (**reutilizando `companyScopeWhere`**, sin escribir un segundo `OR`) cuya base
efectiva (`baseUnitId ?? id`) coincida con la de alguna pedida.
**Hecho cuando:** test que devuelve litro y mililitro pidiendo litro; test que **no** devuelve un
kilogramo; test que **no** devuelve una unidad de otra empresa pero **sí** una de sistema.
**Depende de:** nada.

---

## Bloque B — El caso de uso, que es donde vive la seguridad

### T4 [x] — Proyección de salida
**Toca:** `lib/modules/asignaciones/domain/assigned-order-execution-view.ts`
**Hacer:** `AssignedOrderExecutionView` y `ExecutionLineView` tal como los fija `design.md > 3.2`.
Cerrados: sin autoría, sin marcas de tiempo, sin existencia de producto. Decimales como **texto**.
**Hecho cuando:** `tsc --noEmit` verde y el tipo no incluye ninguna clave de más.
**Depende de:** T1, T2, T3 (nombra sus tipos).

### T5 [x] — Lectura: `getAssignedOrderExecution`
**Toca:** `lib/modules/asignaciones/domain/get-assigned-order-execution.ts`,
`tests/unit/asignaciones/get-assigned-order-execution.test.ts`
**Hacer:** el orden exacto de `design.md > 3`: `requirePermission(actor, 'asignaciones.consultar')`
en **primera línea**, luego `zod`, luego pertenencia (`listOrderIdsByUserInCompany`), luego
`findAliveById(id, actor.companyId)`, luego contenido. Compone `alternativeUnits` descartando la
propia.
**Hecho cuando:**
- `R5`: test **sobre dobles del puerto** que afirma que con actor sin permiso **ninguna** dependencia
  fue llamada (`expect(deps.assignments.listOrderIdsByUserInCompany).not.toHaveBeenCalled()`, ídem
  para `orders`, `recipes`, `units`). Mismo patrón que los tests de `list-assigned-orders`.
- `R6`: pedido existente pero **no asignado** ⇒ mismo error que uno inexistente, aserción **sobre el
  `code`**, no sobre el texto.
- `R7`: pedido de otra empresa ⇒ `order_not_found`.
- `R22`: solo vuelven unidades de la misma base efectiva.
**Depende de:** T4.

### T6 [x] — Transición de apertura: `startAssignedOrder`
**Toca:** `lib/modules/asignaciones/domain/start-assigned-order.ts`,
`tests/unit/asignaciones/start-assigned-order.test.ts`
**Hacer:** mismo preámbulo que T5; después: `PENDIENTE` ⇒ `transitionAliveById(..., 'EN_CURSO')`;
`EN_CURSO` ⇒ **no escribe** y sigue (R9); `ENTREGADO`/`CANCELADO` ⇒ `assertOrderAcceptsWrites`
(R14). `'stale'` ⇒ releer y seguir, **nunca** error visible.
**Hecho cuando:** un test por rama, **más** el de `R9` que afirma que con `EN_CURSO` el doble de
`orders.transitionAliveById` **no se llamó ni una vez**, **más** el de `R12` que afirma que este
archivo **no contiene ninguna lista de estados propia** (la decisión la toma `pedidos`).
**Depende de:** T5.

### T7 [x] — Transición de cierre: `finishAssignedOrder`
**Toca:** `lib/modules/asignaciones/domain/finish-assigned-order.ts`,
`tests/unit/asignaciones/finish-assigned-order.test.ts`
**Hacer:** `EN_CURSO → ENTREGADO` vía `transitionAliveById`; `ENTREGADO`/`CANCELADO` ⇒ error de
`order-state.ts` (R14).
**Hecho cuando:** test de R11; test de R14 con `order_delivered_frozen`; test de **R16** que afirma
que la operación **no recibe ni acepta** ningún dato de marcado (la firma no lo admite: no compila).
**Depende de:** T5.

### T8 [x] — Contrato público del módulo
**Toca:** `lib/modules/asignaciones/index.ts`, `tests/unit/asignaciones/module-contract.test.ts`
**Hacer:** **bloque nuevo al final**, sin reordenar ni reformatear nada de lo de arriba: las tres
factories, sus `*Deps` y la vista. **No** las Server Actions.
**Hecho cuando:** el test de contrato sigue verde, incluida la regla de que el cierre de imports del
barril no trae `'use server'`, `@prisma/client` ni `next/*`.
**Depende de:** T6, T7.

### T9 [x] — Cableado
**Toca:** `lib/composition/index.ts`
**Hacer:** instanciar las tres factories con los adaptadores driven de T1, T2, T3.
**Hecho cuando:** `guard-arquitectura-modulos` verde y `tsc --noEmit` verde.
**Aviso:** archivo caliente; commit pequeño y solo esto, para que un conflicto se resuelva a ojo.
**Depende de:** T8.

### T10 [x] — Server Actions
**Toca:** `lib/modules/asignaciones/adapters/driving/order-execution-actions.ts`
**Hacer:** `startAssignedOrderAction` y `finishAssignedOrderAction` copiando la estructura de
`order-assignment-actions.ts`: actor de las **dos caras** de la sesión dentro de `runInRequestScope`,
traducción por `code` con `createErrorStateTranslator`, **cero decisiones**. `finish` termina con
`revalidatePath(ASSIGNED_ORDERS_ROUTE)` + `redirect` (R15).
**Hecho cuando:** los **dos tests del gate de QC-104** que cuentan lecturas de sesión siguen verdes
—leen el disco y descubrirán este archivo solos—, y `guard-arquitectura-modulos` verde.
**Depende de:** T9.

---

## Bloque C — La pantalla

### T11 — Página y corte por permiso
**Toca:** `app/(private)/asignacion/[id]/page.tsx`,
`app/(private)/asignacion/[id]/components/index.ts`
**Hacer:** `await requirePagePermission('asignaciones.consultar')` **antes** de resolver `params`;
llamar a la acción de apertura; bajar **todo por props**.
**Hecho cuando:** `tests/guards/guard-pantallas-exigen-permiso.test.ts` verde con la ruta nueva; test
de R3 que afirma 404 sin el permiso; **no** hay literal `/asignacion/...` en el archivo (sale de
`assignedOrderRoute` / `ASSIGNED_ORDERS_ROUTE`) — R1.
**Depende de:** T10.

### T12 — El factor, visible y fijo
**Toca:** `app/(private)/asignacion/[id]/components/order-scale-banner.tsx`
**Hacer:** «Pedido 250 L · receta para 100 L · ×2,5». **Ninguna cifra de línea ni de paso se toca.**
**BLOQUEADA** por la pregunta abierta de `design.md > 3.2`: sin la cantidad base de la receta, el
factor no se puede calcular. Con la respuesta pendiente, se implementa la rama `null` (solo la
cantidad del pedido) y se **para**.
**Hecho cuando:** test de R21 que afirma que el factor está en el DOM **y** que la cantidad de cada
línea coincide **carácter a carácter** con la de la receta.
**Depende de:** T11.

### T13 [P] — Líneas y selector de unidad
**Toca:** `app/(private)/asignacion/[id]/components/order-execution-lines.tsx`,
`tests/unit/asignaciones-ui/order-execution-lines.test.tsx`
**Hacer:** `Select` de shadcn/ui con `min-h-11 min-w-11`, poblado **solo** con
`alternativeUnits`; conversión con `convertQuantity` **en el cliente**; estado en memoria.
**Hecho cuando:** test de R22 (solo hermanas en el selector); test de R24 (remontar vuelve a la
unidad original, y nada se escribió); test de R25 que afirma que el archivo **no** contiene
aritmética de conversión propia; test de R23 que afirma que `IncompatibleUnitsError` **no se captura
ni se sustituye por un guion**.
**Depende de:** T11.

### T14 [P] — Recorrido y Finalizar
**Toca:** `app/(private)/asignacion/[id]/components/order-execution-screen.tsx`,
`tests/unit/asignaciones-ui/order-execution-screen.test.tsx`
**Hacer:** montar `StepReader` con `steps`, `title` y un `onFinish` propio. **Cero cambios en
`components/shared/step-reader/**`.** Confirmación **visible** antes de volver a `/asignacion`.
**Hecho cuando:** test de R18 que afirma que `components/shared/step-reader/**` **no aparece en el
diff de la rama**; test de R19 (bloqueo sin escape, motivo visible); test de R15 (confirmación en el
DOM y navegación a `ASSIGNED_ORDERS_ROUTE`); test de R20 (no hay ningún control de edición).
**Depende de:** T11.

### T15 [P] — Estados de error
**Toca:** `app/(private)/asignacion/[id]/components/order-execution-error.tsx`
**Hacer:** una frase por `code`, tomada del catálogo de `lib/modules/errores`. Nunca texto propio.
**Hecho cuando:** test que afirma que «no existe» y «no es tuyo» pintan **lo mismo** (R6).
**Depende de:** T11.

### T16 — Barrido multiplataforma
**Toca:** los cinco archivos de `app/(private)/asignacion/[id]/components/`
**Hacer:** 44×44 en todo control, nada tras `:hover`, `min-h-dvh` y nunca `100vh`, operable por
teclado.
**Hecho cuando:** test de R26 con el mismo helper `esObjetivoTactil` que ya usa
`tests/unit/asignaciones-ui/a11y-tactil.test.tsx`, sobre **todos** los controles nuevos.
**Depende de:** T12, T13, T14, T15.

---

## Bloque D — La enmienda a QC-88 (R27, R28)

> **Regla del bloque, sin excepción: ninguna guardia se afloja y ninguna aserción se borra.** Cada
> archivo gana aserciones o se queda igual. Nota **fechada** `2026-09-17` en cada uno.

### T17 — El disparador pasa de bloqueo a aviso
**Toca:** `app/(private)/asignacion/components/assigned-order-enter-trigger.tsx`,
`app/(private)/asignacion/components/index.ts`,
`app/(private)/asignacion/components/assigned-orders-columns.tsx` (solo si arrastra el nombre)
**Hacer:** eliminar la rama `disabled`; **siempre** `<Link href={assignedOrderRoute(order.id)}>`.
Conservar el párrafo como **aviso**, visible y asociado por `aria-describedby`. Renombrar
`assignedOrderEnterDisabledReason()` → `assignedOrderEnterNoticeText()`, **sigue siendo función y no
literal**. Limpiar los comentarios de las líneas tocadas (`docs/conventions.md`), **sin citar la
ficha**.
**Hecho cuando:** `tsc --noEmit` verde y ningún consumidor quedó con el nombre viejo.
**Depende de:** T14.

### T18 — Tensar el test unitario del disparador
**Toca:** `tests/unit/asignaciones-ui/assigned-order-enter-trigger.test.tsx`
**Hacer:** el `describe('R21 - EN_CURSO: el disparador esta deshabilitado y con su motivo')` pasa a
`describe('R27 (QC-63, 2026-09-17; enmienda QC-88 R21) - EN_CURSO: el disparador ENTRA y avisa')`, y
**gana** aserciones: `href === assignedOrderRoute(id)`, **no** `disabled`, **no**
`aria-disabled="true"`, aviso **visible**, `aria-describedby` correcto, **sin** `title`.
**Hecho cuando:** el archivo tiene **más** `expect` que antes de la rama, y **cero** eliminados que
no sean la afirmación del bloqueo.
**Depende de:** T17.

### T19 [P] — Conservar el barrido táctil de QC-88
**Toca:** `tests/unit/asignaciones-ui/a11y-tactil.test.tsx`
**Hacer:** renombrar el caso «el disparador «entrar» deshabilitado (EN_CURSO)» a «…en curso
(EN_CURSO)». **El bloque «el motivo del disparador … se alcanza SIN el puntero» se conserva
entero**: el aviso sigue siendo texto en el DOM y nunca un `title`.
**Hecho cuando:** mismo número de `expect` o más; ninguno borrado.
**Depende de:** T17.

### T20 [P] — Tensar el E2E de QC-88
**Toca:** `e2e/pedidos-asignados.spec.ts` (bloque de líneas ~349-354)
**Hacer:** `toBeDisabled()` → `toBeEnabled()`, **y además** `toHaveAttribute('href', ...)`, **y** el
aviso sigue `toBeVisible()`.
**Hecho cuando:** el bloque tiene una aserción **más** que antes.
**Depende de:** T17.

### T21 — Prueba por mutación (BLOQUEANTE)
**Toca:** nada permanente — es un procedimiento, y su resultado se anota en
`progress/impl_QC-63-ejecutar-receta-operador.md`
**Hacer:** revertir a mano la rama `disabled` en `assigned-order-enter-trigger.tsx` y correr T18,
T19 y T20. Restaurar después.
**Hecho cuando:** los **tres** archivos se ponen **rojos**. Si alguno queda verde, ese test no
afirmaba nada: se arregla **antes** de seguir. El resultado queda escrito con la fecha.
**Depende de:** T18, T19, T20.

### T22 — Nota fechada en el spec de QC-88
**Toca:** `specs/QC-88-*/requirements.md`
**Hacer:** nota al pie: «**2026-09-17 — enmendado por QC-63 R27/R28** (decisión cerrada 16 de
QC-63): R21 pasa de bloqueo a aviso y R23 queda **cerrada sin rechazo**, porque la reentrada a un
pedido `EN_CURSO` se permite». **R21 y R23 no se reescriben**: el spec es historia.
**Hecho cuando:** la nota está, y ni R21 ni R23 cambiaron una letra.
**Depende de:** T21.

---

## Bloque E — Cierre

### T23 — E2E de la feature
**Toca:** `e2e/ejecucion-receta.spec.ts`
**Hacer:** (a) camino feliz de R29: el Operador entra, ve su pedido asignado, lo abre, **el pedido
queda `EN_CURSO` en base**, recorre los pasos hasta Finalizar y **queda `ENTREGADO` en base**;
(b) R30: quien no tiene `asignaciones.consultar` pide la dirección y recibe **404**; (c) R9:
recargar la pantalla de un pedido ya `EN_CURSO` la vuelve a mostrar **sin error**.
**Hecho cuando:** los tres pasan, y los asertos de estado se leen **de la base**, no de la pantalla.
**Depende de:** T16, T22.

### T24 — Trazabilidad `R<n> → test`
**Toca:** `progress/impl_QC-63-ejecutar-receta-operador.md`
**Hacer:** la tabla de los **31** requisitos, cada uno con **archivo y nombre del caso**.
**Hecho cuando:** ni un `R<n>` sin fila. `CHECKPOINTS.md > Trazabilidad` lo exige y el reviewer lo
trata como bloqueante.
**Depende de:** T23.

### T25 — Gate completo
**Toca:** nada
**Hacer:** `./init.sh` **completo** (no `--rapido`) antes del PR, sin excepción.
**Hecho cuando:** verde de punta a punta, incluidas las guardias de dependencias, de arquitectura, de
ámbito por empresa y de pantallas que exigen permiso.
**Depende de:** T24.
