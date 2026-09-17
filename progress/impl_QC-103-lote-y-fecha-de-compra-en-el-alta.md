# QC-103 — lote-y-fecha-de-compra-en-el-alta · bitácora de implementación

> Spec aprobado por el humano el 2026-09-16 (F1.4). Rama
> `feature/QC-103-lote-y-fecha-de-compra-en-el-alta`, worktree propio.
> **T1-T11 cerradas, con el E2E de R17 en verde** tras dos arreglos autorizados por el humano
> sobre helpers preexistentes (`566d122`, `ebdb21a`, detalle en §4). **Primera review RECHAZADA**
> (2 bloqueantes, 2 menores) el 2026-09-17; los 4 hallazgos ya están cerrados, ver §8. T12 (gate
> completo `./init.sh`) encontró 2 rojos propios de esta rama tras la review, ambos cerrados
> (§9). **Consolidación final de `formatDateLocalISO`/`parseDateLocalISO` en
> `lib/shared/ui/date-civil.ts`** (§10), decisión del humano. T12 lo cierra el leader.

## 1. Lo que se construyó

El panel de alta de producto gana el campo **fecha de compra** (calendario `react-day-picker`
en modo `single`, hoy por defecto, futuras no seleccionables) y el campo **lote** explica que
dejarlo vacío significa que el sistema lo asigna. El **cambio mínimo de backend**: el contrato
de `createWithFirstBatch`/`addBatchToAlive`/`createProduct`/`createProductAction` se amplía con
`lot: string` (el valor del lote, no el `batchId`), dato que la transacción de escritura ya
calculaba y que antes se descartaba. El aviso de éxito que el panel ya muestra (`toast`) pasa a
nombrar ese lote. Sin migración, sin tabla nueva, sin dependencia nueva.

## 2. Archivos tocados

### Producción — nuevos
```
app/(private)/inventario/components/product-batch-date-field.tsx   (campo fecha de compra, T5)
```

### Producción — modificados
```
lib/modules/inventario/ports/product-repository.ts                 (+lot en dos firmas, T1)
lib/modules/inventario/adapters/driven/persistence/product-prisma.ts (+lot en el retorno, T2)
lib/modules/inventario/domain/create-product.ts                    (createCreateProduct -> id/lot, T3)
lib/modules/inventario/adapters/driving/product-actions.ts         (+lot en success, T4)
app/(private)/inventario/components/index.ts                       (barrel: ProductBatchDateField, T5)
app/(private)/inventario/components/product-form.tsx               (campo fecha, helper lote, onSaved lot, T6-T8)
app/(private)/inventario/components/product-sheet.tsx              (toast nombra el lote, T9)
e2e/inventario.spec.ts                                              (caso nuevo, T10)
```

### Tests — nuevos/ampliados
```
tests/unit/inventario/product-batch-lot-retry.test.ts   (T2: R12, R13 en el adaptador)
tests/unit/inventario/create-product.test.ts             (T3: R10, R12, R13 en el dominio)
tests/unit/inventario/product-actions.test.ts            (T4: R12 en la Server Action)
tests/unit/inventario/product-batch-date-field.test.tsx  (T5: R2, R5 del componente nuevo)
tests/unit/inventario/product-page.test.tsx              (T6-T9: R3, R4, R6, R7, R9, R12, R14, R15)
tests/unit/inventario/product-service.test.ts            (mocks del puerto ampliados con lot)
tests/unit/inventario/authorization.test.ts              (mocks del puerto ampliados con lot)
tests/unit/inventario/company-isolation-service.test.ts  (mocks del puerto ampliados con lot)
e2e/inventario.spec.ts                                    (T10: R14, R17)
```

### No tocado (confirmado, por diseño)
`db/schema.prisma`, `ProductView`/`product-view.ts`, `updateProductAction`, `updateProductSchema`,
`expiryDate` y su input nativo, `components/ui/calendar.tsx`, `docs/dependencias.md`.

## 3. Mapa R(n) -> test

| R | Descripción breve | Test |
| --- | --- | --- |
| R1 | Campo fecha de compra distinto de vencimiento | Cubierto por el conjunto de tests de `ProductBatchDateField` como componente propio, separado de `expiryDate` (no tocado) — `tests/unit/inventario/product-batch-date-field.test.tsx` |
| R2 | Hoy por defecto | `el campo de fecha de compra abre con la fecha de hoy seleccionada (R2)` — `product-batch-date-field.test.tsx` |
| R3 | **Enmendado el 2026-09-17 (D10, aprobado por el humano tras B2 de la review).** El panel de alta nunca permite un envío sin fecha de compra; si la fecha no llega a la Server Action, el servidor la sustituye por hoy — no es un rechazo | `el panel de alta nunca permite enviar sin fecha de compra escrita (R3)` — `product-page.test.tsx` (garantía de la UI: el campo no admite quedar vacío); heredado de QC-81 para la mitad de servidor: `pasa al puerto la fecha civil UTC del now inyectado, y el MISMO instante como now` en `create-product.test.ts` prueba que, sin `purchaseDate`, el dominio sustituye por hoy en vez de rechazar |
| R4 | Escribe/lee con calendario, viaja como YYYY-MM-DD | `el alta de producto envía la fecha de compra elegida como YYYY-MM-DD (R4)` — `product-page.test.tsx` |
| R5 | No permite seleccionar día futuro | `el campo de fecha de compra no permite elegir un día futuro (R5)` — `product-batch-date-field.test.tsx` |
| R6 | Ayuda: vacío = lo asigna el sistema | `el campo lote explica que un valor vacío lo asigna el sistema (R6)` — `product-page.test.tsx` |
| R7 | Sigue siendo texto libre, mismo comportamiento de envío | `el campo lote sigue siendo un input de texto opcional (R7)` — `product-page.test.tsx` |
| R8 | Mensajes del mismo esquema del servidor, sin duplicar reglas | Heredado + mecanismo verificado: `un guardado rechazado por un campo muestra el error en linea y no cierra el panel` (R20) en `product-page.test.tsx` prueba que la validación previa usa el MISMO esquema que el servidor; la regla de forma del lote la sigue rechazando el servicio (`QC-81 R34: con un lote de 60 digitos lanza ValidationError...` en `create-product.test.ts`), no duplicada en el formulario (confirmado por lectura de diff) |
| R9 | Solo en el alta, la edición no lo muestra ni envía | `la edición no muestra el campo de fecha de compra (R9)`, `la edicion no envia ningun campo del lote` (ampliado con purchaseDate), `el aviso de edición no cambia y no nombra ningún lote (R9)` — `product-page.test.tsx` |
| R10 | Autorización `inventario.modificar` en el servicio | `createProduct rechaza sin el permiso inventario.modificar (R10)` — `create-product.test.ts` |
| R11 | Fecha viaja como YYYY-MM-DD, el adaptador la convierte | Heredado de QC-81: `pasa tal cual una fecha de la semana pasada` y `pasa la fecha escrita identica tambien al agregar el lote a un producto existente` en `create-product.test.ts` prueban el string civil intacto hasta el puerto; la conversión a `Date` vive en `toBatchPurchaseDate` (`product-prisma.ts:282`), ejercitada por los fixtures de `product-batch-lot-retry.test.ts` y verificada de punta a punta contra Postgres real por la suite de integración |
| R12 | Backend devuelve el valor del lote al crear | `createWithFirstBatch devuelve el lote escrito cuando R12 lo pide` (`product-batch-lot-retry.test.ts`), `createProduct devuelve el lote asignado al crear un producto nuevo (R12)` (`create-product.test.ts`), `createProductAction devuelve el lote en el estado de exito (R12)` (`product-actions.test.ts`), `tras un alta con éxito, ProductForm llama a onSaved con el lote devuelto por el servidor (R12)` (`product-page.test.tsx`) |
| R13 | Backend devuelve el lote al agregar a producto homónimo | `addBatchToAlive devuelve el lote escrito cuando R13 lo pide` (`product-batch-lot-retry.test.ts`), `createProduct devuelve el lote asignado al agregar batch a un producto existente (R13)` (`create-product.test.ts`) |
| R14 | Aviso de éxito nombra el lote | `el aviso de alta nombra el lote asignado por el sistema (R14)` — `product-page.test.tsx`; E2E `el alta de producto muestra el lote asignado en el aviso de éxito (R14, R17)` — `e2e/inventario.spec.ts`, **verde** (ver §4) |
| R15 | Lote tecleado a mano: el aviso no dice que lo asignó el sistema | `el aviso de alta nombra el lote tecleado a mano sin decir que lo asignó el sistema (R15)` — `product-page.test.tsx` |
| R16 | Ninguna superficie nueva, solo el aviso existente | Verificado por lectura de diff (no test, según `tasks.md > T9`): el diff de `product-sheet.tsx` confirma que el único cambio es el string del `toast.success` ya existente, sin JSX/elemento nuevo |
| R17 | E2E: alta con fecha por defecto, aviso nombra el lote | `el alta de producto muestra el lote asignado en el aviso de éxito (R14, R17)` — `e2e/inventario.spec.ts`, **verde** (ver §4) |

## 4. Verificación

### Typecheck y lint (por tanda, cada subagente sobre sus archivos)
- Backend (T1-T4): `pnpm typecheck` limpio salvo `app/layout.tsx(43,56): Cannot find name 'LayoutProps'`,
  preexistente y ajeno a esta rama (confirmado reproduciendo con los cambios revertidos vía stash).
  `pnpm exec eslint` sobre los 10 archivos tocados: limpio.
- Frontend T5-T7: `pnpm typecheck` limpio (mismo preexistente ajeno). `pnpm exec eslint`: limpio.
- Frontend T8-T10: `pnpm typecheck` limpio (mismo preexistente ajeno). `pnpm exec eslint` sobre
  `product-form.tsx`, `product-sheet.tsx`, `product-page.test.tsx`, `e2e/inventario.spec.ts`: limpio.

### Tests unitarios y guard (reportados por los subagentes)
- Backend: `pnpm exec vitest run` sobre archivos afectados + `product-prisma.test.ts` + `guard`:
  50 archivos, 641 tests, 9 skipped, 0 fallos.
- Frontend T5-T7: `pnpm exec vitest run tests/unit/inventario/product-page.test.tsx
  tests/unit/inventario/product-batch-date-field.test.tsx`: 51 passed. `vitest run guard`:
  43 archivos, 480 passed, 9 skipped.
- Frontend T8-T10: `pnpm exec vitest run tests/unit/inventario/product-page.test.tsx`:
  53 passed (incluye los 4 nuevos de T8/T9). `vitest run guard`: 43 archivos, 480 passed,
  9 skipped.

### E2E (R17) — VERDE, arreglado y verificado tras autorización humana

**Estado final: `el alta de producto muestra el lote asignado en el aviso de éxito (R14, R17)`
pasa.** Salida real:
```
Running 1 test using 1 worker

  ✓  1 [chromium] › e2e\inventario.spec.ts:624:7 › catalogo de productos › el alta de producto
     muestra el lote asignado en el aviso de éxito (R14, R17) (11.0s)

  1 passed (39.4s)
```

Hicieron falta dos arreglos, ninguno de lógica de negocio de QC-103, los dos autorizados
explícitamente por el humano tras el primer intento (que había quedado "escrito, no corrido en
verde" por el motivo de abajo):

1. **Helper compartido de selección de unidad (preexistente, ajeno a esta ficha, deuda documentada
   en `progress/current.md` desde 2026-09-15).** `crearPresentacionEnLinea` (y su bloque inline
   equivalente) en `e2e/inventario.spec.ts`, y `choosePresentation` en `e2e/proveedores.spec.ts`,
   rellenaban el nombre y enviaban el alta rápida de presentación SIN elegir unidad, que el
   selector exige desde QC-80. Arreglo: click en `presentation-unit-select` + click en la primera
   `presentation-unit-option` antes del submit, mismo patrón que ya usa
   `tests/unit/inventario/product-page.test.tsx`. Commit `566d122`, separado del resto de QC-103.
2. **Bug propio de QC-103, en el test que T10 escribió.** Una vez el helper de unidad dejó de
   bloquear, el test seguía fallando en la aserción final: el regex `/Lote\s+(\S+)/` capturaba
   `"1."` (con el punto final de cierre de frase del toast `Producto creado. Lote 1.`) en vez de
   `"1"`, que es lo que hay en base. Arreglo: `/Lote\s+(\S+?)\.?$/` sobre el texto `.trim()`-eado
   (no codicioso, ancla al final con punto opcional; no corta lotes de texto libre con guiones,
   p. ej. `ACME-2026-07`). Commit `ebdb21a`.

`pnpm typecheck` y `pnpm exec eslint` limpios en ambos arreglos.

**El rojo de `e2e/proveedores.spec.ts` (R51) NO se mató.** Con el mismo arreglo de unidad aplicado,
`pnpm exec playwright test e2e/proveedores.spec.ts -g "R51" --project=chromium` sigue en rojo, pero
por una causa DISTINTA y no tocada: la rama de "presentación reutilizable" de `choosePresentation`
(la que NO pasa por el alta rápida que se arregló) no encuentra la presentación esperada en el
selector —`la presentacion "..." no aparecio en el selector`—, un fallo que no pasa por el código
que se tocó. Queda como deuda preexistente sin resolver, tal como estaba documentada en
`progress/current.md`; no se investigó más allá del diagnóstico porque cae fuera de lo autorizado
("si sigue rojo por otra causa, dilo y no lo toques más").

## 5. Decisiones tomadas durante la implementación (no reabren las 9 cerradas del spec)

- R3 se interpretó "por construcción" en vez de como un rechazo de `safeParse`, porque el esquema
  compartido nunca rechaza una fecha de compra ausente (la sustituye por "hoy", comportamiento
  heredado de QC-81 y explícitamente "no se reabre" en `design.md`). No se tocó el esquema.
  **Superado por la enmienda formal del 2026-09-17 (§8): esta interpretación resultó correcta en
  el diagnóstico pero era una decisión que no le tocaba al implementer; el humano la convirtió en
  enmienda aprobada (D10) tras el rechazo de la review.**
- Los mocks del puerto `ProductRepository` en tres archivos de test que no forman parte de las
  tasks (`product-service.test.ts`, `authorization.test.ts`, `company-isolation-service.test.ts`)
  se ampliaron con `lot` porque implementan el puerto completo con tipado estricto y el cambio de
  firma (T1) rompía su compilación. Cambio mecánico, sin lógica nueva.

## 6. Reglas duras respetadas

Ninguna dependencia nueva (`react-day-picker` ya aprobado desde QC-55, reusado en modo `single`
sin tocar `calendar.tsx`). Sin migración, sin tocar `db/schema.prisma`. No se tocó la edición del
producto (solo se verificó/testeó que no muestra ni envía los campos nuevos). Autorización
verificada en el service con `inventario.modificar`, con test, sin comparar nombre de rol. La
fecha viaja como fecha civil `YYYY-MM-DD` y el adaptador la convierte. UI multiplataforma: trigger
táctil (`min-h-11 min-w-11`), sin depender de `hover`, sin input de texto libre para la fecha (el
disparador es un botón, no dispara zoom de iOS). Sin citas `QC-nn` en comentarios de código, solo
`R<n>` en nombres de test.

## 7. Incidentes operativos (sin pérdida de trabajo, dejados en trazado)

Durante T1-T5 hubo un `git stash` accidental de un agente que se llevó el WIP no commiteado de
otro agente en paralelo sobre el mismo worktree; se recuperó archivo por archivo comparando diffs
antes de soltar el stash, sin pérdida (confirmado byte a byte contra el commit posterior). Después,
un reset a `HEAD` no explicado revirtió brevemente trabajo sin commitear de ambos agentes; se
recreó y se commiteó sin pérdida neta, pero el origen del reset no se identificó — queda señalado
para el leader por si se repite en una tanda más larga.

## 8. Primera review — RECHAZADA (2026-09-17), 4 hallazgos, todos cerrados

`progress/review_QC-103-lote-y-fecha-de-compra-en-el-alta.md` rechazó la ficha con 2 bloqueantes
(B1, B2) y 2 menores (m1, m2). Lo funcional se dio por bien construido y bien probado; el rechazo
fue por dos motivos distintos, ya resueltos:

### B2 — R3 no lo cumplía el sistema, solo la UI (bloqueante)
La review encontró que la interpretación "por construcción del widget" (§5) era un diagnóstico
correcto pero una decisión que no le tocaba al implementer: reinterpretaba un requisito aprobado
sin que el humano lo hubiera decidido así. **El humano enmendó R3 el 2026-09-17** (commit
`0088fb3`): añadida la fila D10 a la tabla de decisiones cerradas de `requirements.md`, con fecha,
y una nota de enmienda bajo el propio R3, dejando explícito que la obligatoriedad se cumple en el
panel de alta (nunca permite un envío vacío) y que la Server Action sigue sustituyendo por hoy si
la fecha no llega — no es un rechazo. No se tocó `purchaseDateSchema` ni `resolverFechaDeCompra`.
El test de R3 se renombró de `el alta rechaza el envío sin fecha de compra (R3)` a
`el panel de alta nunca permite enviar sin fecha de compra escrita (R3)`, con su comentario de
cabecera simplificado para afirmar la enmienda en vez de justificar una desviación (commit
`9a83151`). Mapa actualizado en §3.

### B1 — comentarios nuevos citaban la ficha (QC-nn) en código de producción y E2E (bloqueante)
Cinco líneas nuevas de esta rama citaban `QC-103` o `QC-80`/`QC-81` en comentarios de bloque
(no en nombres de test, donde sí vale `R<n>`): dos docblocks en
`lib/modules/inventario/ports/product-repository.ts` (commit `02b603d`), y tres comentarios en
`e2e/inventario.spec.ts`/`e2e/proveedores.spec.ts` (commit `d332705`). Reescritos para decir QUÉ
exige la regla en vez de QUÉ ficha la trajo, conservando todos los `(R<n>)`.

### m1 — comentario preexistente QC-71 en product-form.tsx, movido sin limpiar (menor)
El archivo se tocó a fondo en esta rama (T6-T8), así que entró en la limpieza: las cinco
apariciones de `QC-71` en `product-form.tsx` se reescribieron sin la cita a la ficha, conservando
sus `(R<n>)` (commit `d332705`, misma tanda que B1).

### m2 — deuda del arnés, no del implementer
`docs/conventions.md` sigue sin una sección de Comentarios que respalde esta regla por escrito.
Queda para el leader, tal como el propio informe de review lo señala.

### Verificación tras los 4 arreglos
- `pnpm typecheck`: limpio en las tres tandas de arreglo.
- `pnpm exec eslint` sobre todos los archivos tocados: limpio.
- `pnpm exec vitest related --run` sobre los archivos de producción y test tocados: verde
  (8 archivos / 173 passed / 3 skipped en la tanda de backend; 5 archivos / 104 passed en la
  tanda de frontend).
- `pnpm exec vitest run guard`: 43 archivos, 480 passed, 9 skipped — verde, sin cambios.
- **E2E vuelto a correr tras tocar los dos archivos de E2E** (no se dio por hecho que "solo son
  comentarios"): `pnpm exec playwright test e2e/inventario.spec.ts -g "R14, R17" --project=chromium`
  → `1 passed`. Sigue verde.

Commits de este round, todos con `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`:
`02b603d` (B1 backend), `d332705` (B1 E2E + m1), `9a83151` (test R3 por la enmienda),
`0088fb3` (enmienda D10 en `requirements.md`).

## 9. `./init.sh` completo del leader — 2 rojos propios, ambos cerrados (2026-09-17)

Tras la primera review, el `./init.sh` completo del leader marcó 2 rojos, ninguno ambiental.

### Rojo 1 — guardia de arquitectura: import por ruta profunda
`product-batch-date-field.tsx` (y, por extensión, `product-form.tsx`, que tomaba la función de
ahí) importaban `formatDateLocalISO` desde
`@/components/shared/data-table/data-table-filter-date` -ruta profunda-, en vez de por el barrel
`@/components/shared/data-table`. Medido en disco: el barrel de `data-table` **excluye
`formatDateLocalISO` a propósito** -su propio docstring dice que es la ÚNICA superficie pública y
que NO reexporta piezas internas-, así que ampliarlo habría sido una decisión sobre un módulo
ajeno, no una corrección local. En vez de tocar ese barrel, se movió una copia de la función a
`product-batch-date-field.tsx` -mismo patrón que el componente ya usaba con su inversa,
`parseDateLocalISO`, copiada ahí desde el principio- y `product-form.tsx` pasó a importarla como
sibling de este mismo módulo. Misma fórmula, mismo resultado, sin tocar el alcance de
`data-table`. Confirmado con `tests/unit/shared/data-table-alcance.test.ts` (el guard de R1) en
verde.

### Rojo 2 — `product-page.test.tsx` colgado a 20s, diagnosticado como flake de saturación preexistente, NO de esta rama
El caso `un guardado rechazado por un campo muestra el error en linea y no cierra el panel`
colgaba con `Test timed out in 20000ms` al correr `./init.sh` completo. Diagnóstico por
bisección real, no supuesto:
- El test, y el archivo completo, pasan siempre en aislamiento -decenas de corridas-, incluso con
  14 procesos de CPU saturando la máquina de fondo a propósito.
- Corriendo el proyecto `ui` completo (111 archivos jsdom) con el componente real: 1 solo fallo
  -este mismo caso- más un `Hook timed out` no relacionado en un archivo de `identity/` que no
  toca fechas ni `Popover`.
- Reemplazando temporalmente `ProductBatchDateField` por un `<div>` vacío (revertido, no quedó en
  ningún commit) y repitiendo la corrida completa: **9 fallos en 6 archivos**, incluidos timeouts
  de calendario en `supplier-page.test.tsx` y `recipe-page.test.tsx` que **no usan
  `ProductBatchDateField`**. Quitar el componente sospechoso no arregló nada -empeoró y movió el
  síntoma a archivos ajenos-, lo que descarta que sea un bug del `Popover` nuevo.

Es la firma de los "flakes de saturación" que `docs/verification.md` ya documenta (y que el
propio comentario de cabecera de `product-page.test.tsx` menciona, de una tanda anterior de
arreglos de gate): al correr los 111 archivos jsdom del proyecto `ui` a la vez, el planificador no
le da tiempo de CPU a `userEvent` dentro del plazo, y el archivo afectado varía de corrida en
corrida. **No se tocó el test ni se subió ningún timeout** -no había nada que adaptar ni ningún
bug de producción que arreglar en el componente-. Queda anotado para el leader: si `./init.sh`
vuelve a marcar timeout en un archivo distinto del proyecto `ui`, es probablemente el mismo
fenómeno de contención, no una regresión de esta ficha.

### Verificación
- `pnpm typecheck`: limpio.
- `pnpm exec eslint` sobre los dos archivos tocados: limpio.
- `pnpm exec vitest run tests/unit/inventario/product-page.test.tsx` (archivo completo, aislado):
  53 archivo / 53 tests passed.
- `pnpm exec vitest run guard`: 43 archivos, 480 passed, 9 skipped.
- `pnpm exec playwright test e2e/inventario.spec.ts -g "R14, R17" --project=chromium`: 1 passed.

Commit: `4285b23`, con `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

## 10. Consolidación final — una sola definición en `lib/shared/ui/` (decisión del humano, 2026-09-17)

El arreglo del Rojo 1 (§9) evitó tocar el barrel de `data-table`, pero dejó **dos copias** de
`formatDateLocalISO`/`parseDateLocalISO` (`data-table-filter-date.tsx` y
`product-batch-date-field.tsx`) — un riesgo real: si la fórmula cambia algún día -zona horaria,
formato-, una copia puede quedarse vieja en silencio. El humano decidió consolidarlas en **una
sola definición**.

**Por qué el destino es `lib/shared/ui/` y no cualquier otro sitio de `lib/shared/`**: no es
estético, es lo único que no rompe la guardia de arquitectura. `docs/architecture.md > La regla de
dependencias` restringe qué puede importar `components/**`, `hooks/**` y los archivos `'use
client'`: solo `lib/shared/ui/**`, `lib/shared/routes` y `@/lib/utils` — NO `lib/shared/**` en
general. Un archivo en cualquier otro sitio de `lib/shared/` habría dejado la guardia en rojo otra
vez. `lib/shared/ui/` ya es el vecindario de utilidades de este tipo: `initials.ts`,
`sidebar-state.ts`, `theme-state.ts`.

**Qué se movió**: `lib/shared/ui/date-civil.ts` (archivo nuevo) exporta ambas funciones con su
JSDoc consolidado. `data-table-filter-date.tsx` y `product-batch-date-field.tsx` pasan a
importarlas de ahí; los dos siguen reexportando `formatDateLocalISO` porque sus propios
consumidores externos ya la importaban así -dos tests de `data-table` por ruta profunda directa, y
`product-form.tsx` desde `product-batch-date-field.tsx`- y no se tocó ese contrato ni el barrel de
`data-table`.

### Verificación
- `pnpm typecheck`: limpio.
- `pnpm exec eslint` sobre los tres archivos (el nuevo y los dos modificados): limpio.
- `pnpm exec vitest related --run` sobre los tres archivos: los archivos relacionados con la
  lógica de fecha en sí (`data-table-filter-date.test.tsx`, `data-table-viewport.test.tsx`,
  `data-table-filters.test.tsx`, `product-field.test.tsx`) pasaron limpios, 99 tests. Aparecieron
  timeouts en `product-page.test.tsx` y en archivos totalmente ajenos a esta rama
  (`identity/session-once-per-request-render.test.tsx`,
  `configuracion-ui/user-status-dialog.test.tsx`, `pedidos-ui/order-sheet.test.tsx`) con
  duraciones muy por encima de lo normal (627s totales, `import: 2945s`) — coherente con el aviso
  del leader de que la máquina estaba saturada en ese momento. No se persiguieron ni se
  reintentaron: son timeouts genéricos (costo, decimales, existencia — ninguno sobre
  `purchaseDate`), no fallos de aserción ni regresiones de esta consolidación.
- `pnpm exec vitest run guard`: **43 archivos, 480 passed, 9 skipped, 0 failed** — verde, es la
  guardia que vigila justo este import.
- No se corrió `./init.sh` (instrucción explícita del leader; la máquina estaba saturada).

Commit: `cab1fa8`, con `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
