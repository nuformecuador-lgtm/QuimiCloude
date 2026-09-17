# QC-103 — lote-y-fecha-de-compra-en-el-alta · bitácora de implementación

> Spec aprobado por el humano el 2026-09-16 (F1.4). Rama
> `feature/QC-103-lote-y-fecha-de-compra-en-el-alta`, worktree propio.
> **T1-T10 cerradas.** T11 (esta bitácora) y T12 (gate completo `./init.sh`) los cierra el leader.

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
| R3 | Obligatorio, rechaza envío sin fecha | `el alta rechaza el envío sin fecha de compra (R3)` — `product-page.test.tsx`. Nota de diseño encontrada en implementación: el esquema compartido (`purchaseDateSchema`, `.nullish()`) nunca rechaza una fecha ausente, la sustituye por "hoy" en el servidor (heredado de QC-81, `design.md` lo marca "no se reabre"). R3 se cumple por construcción del widget: el disparador es un botón sin vía de "vaciar", así que la UI nunca permite enviar sin fecha; el test prueba esa garantía estructural, no un rechazo de `safeParse` |
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
| R14 | Aviso de éxito nombra el lote | `el aviso de alta nombra el lote asignado por el sistema (R14)` — `product-page.test.tsx`; E2E `el alta de producto muestra el lote asignado en el aviso de éxito (R14, R17)` — `e2e/inventario.spec.ts` (escrito, no corrido en verde: ver §4) |
| R15 | Lote tecleado a mano: el aviso no dice que lo asignó el sistema | `el aviso de alta nombra el lote tecleado a mano sin decir que lo asignó el sistema (R15)` — `product-page.test.tsx` |
| R16 | Ninguna superficie nueva, solo el aviso existente | Verificado por lectura de diff (no test, según `tasks.md > T9`): el diff de `product-sheet.tsx` confirma que el único cambio es el string del `toast.success` ya existente, sin JSX/elemento nuevo |
| R17 | E2E: alta con fecha por defecto, aviso nombra el lote | `el alta de producto muestra el lote asignado en el aviso de éxito (R14, R17)` — `e2e/inventario.spec.ts` (escrito, no corrido en verde: ver §4) |

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

### E2E (R17) — escrito, NO corrido en verde
`pnpm exec playwright test e2e/inventario.spec.ts -g "R14, R17" --project=chromium` se ejecutó
contra el entorno local (DB sembrada, navegadores instalados, `next dev` levantado por
`playwright.config.ts`) y falla, pero no por esta ficha: el helper compartido
`crearPresentacionEnLinea` (preexistente, no tocado por QC-103) no selecciona ninguna unidad de
presentación antes de enviar el alta rápida, y el selector la exige desde QC-80
(mensaje `presentation-error-unit`). Confirmado que es un bug previo y no una regresión: un test
que ya existía antes de esta ficha (asociado a QC-90) falla en aislamiento, en la misma línea del
mismo helper, con el mismo síntoma. El caso de QC-103 (typecheck y lint en verde) queda escrito y
a la espera de que el helper compartido se arregle —fuera del alcance de esta ficha— o de que el
leader decida cómo tratarlo antes del PR.

## 5. Decisiones tomadas durante la implementación (no reabren las 9 cerradas del spec)

- R3 se interpretó "por construcción" en vez de como un rechazo de `safeParse`, porque el esquema
  compartido nunca rechaza una fecha de compra ausente (la sustituye por "hoy", comportamiento
  heredado de QC-81 y explícitamente "no se reabre" en `design.md`). No se tocó el esquema.
  Documentado en el propio test y en el mapa de arriba (R3).
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
