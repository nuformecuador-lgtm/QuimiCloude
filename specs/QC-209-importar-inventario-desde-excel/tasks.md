# QC-209 — importar-inventario-desde-excel · tasks.md

> Orden: **T0** (contrato, secuencial) → **pista B** (backend) y **pista F** (frontend) **en
> paralelo** → **TI** (integración) → **TZ** (cierre). Cada task lleva su pista, sus archivos y su
> criterio de «hecho». `[P]` = puede correr en paralelo con las demás `[P]` de su pista una vez
> cumplidas sus dependencias.
>
> **Las pistas B y F no comparten ningún archivo.** Todo archivo que las dos necesitarían tocar lo
> toca T0 (contrato, barrel, rutas) o TI (acciones reales, E2E). F solo importa lo que T0 publicó y
> nunca abre un archivo de B; B nunca abre `app/` ni `tests/unit/inventario/importar/`. Si una task
> descubre que necesita un archivo de la otra pista, para y vuelve al leader: es un cambio de
> contrato (`design.md > 1`).
>
> Gate por tanda: `./init.sh --rapido`. Gate de feature y antes del PR: `./init.sh` completo.
>
> **B1 y todo lo que depende del lector .xlsx esperan a la aprobación de la dependencia**
> (`design.md > DS-3`, regla 7). El resto de B no.

## [x] T0 — Publicar el contrato en código (secuencial, bloquea todo lo demás)

**Pista:** contrato · **Agente:** `backend_dev` · **R:** R32

Archivos (nuevos salvo indicación):

- `lib/modules/inventario/domain/inventory-import-contract.ts` — **todo** lo de `design.md > 1.1-1.4`
  y `1.8`, tipos y constantes reales (no stub).
- `lib/modules/inventario/domain/inventory-import-downloads.ts` — firmas de `1.5` e
  `IMPORT_EXAMPLE_ROW` real; `buildInventoryImportTemplate` real (solo depende de la tabla de
  columnas); `buildInventoryImportErrorFile` **stub** que devuelve la cabecera y una línea por fila
  `error` sin escapar comillas (B9 lo completa).
- `lib/modules/inventario/domain/preview-inventory-import.ts` y
  `.../domain/confirm-inventory-import.ts` — factorías `createPreviewInventoryImport(deps)` /
  `createConfirmInventoryImport(deps)` con la firma de `1.8` y cuerpo que lanza «sin implementar»
  (B8 los rellena; así B no toca el barrel).
- `lib/modules/inventario/index.ts` (modifica) — reexporta los cuatro archivos anteriores. Es la
  única vez que esta feature toca el barrel.
- `lib/modules/inventario/adapters/driving/inventory-import-actions.ts` — `'use server'`; las dos
  acciones con la firma de `1.6`, cuerpo stub de `1.9` (borde zod real de `file` / `importKey`).
- `lib/modules/inventario/adapters/driving/inventory-import-fixtures.ts` — datos fijos de `1.9`.
- `lib/shared/routes.ts` (modifica) — `INVENTORY_IMPORT_ROUTE = '/inventario/importar'` y su
  entrada en el listado de rutas si el archivo lo exige.
- `tests/unit/inventario/inventory-import-contract.test-d.ts` — fija la forma: uniones
  discriminadas por `kind` y `status`, `issues` no vacío, claves de `ImportCells` = claves de
  `INVENTORY_IMPORT_COLUMNS`, `IMPORT_TYPE_LABELS` cubre `ImportRowType`, firmas de las dos
  acciones, y las de `createUnitAction` / `createPresentationAction` / `listUnitsAction` que la
  pantalla reutiliza (`expectTypeOf`).
- `tests/unit/inventario/inventory-import-actions.test.ts` — los stubs: `invalid_input` sin
  `file`; `file_rejected` con `rechazado*`; vista previa con los cuatro estados y los dos
  faltantes; `already_imported` con la clave fija; totales coherentes con las filas.

Hecho cuando: los dos tests pasan; `pnpm typecheck` y `pnpm lint` en verde;
`guard-arquitectura-modulos` en verde (el barrel sigue sin `'use server'` ni Prisma en su cierre);
`./init.sh --rapido` verde. **Commit propio** (`feat(QC-209): T0 contrato de la importacion`).

---

## Pista B — backend (`backend_dev`)

Ningún archivo de esta pista está en `app/`, `components/` ni `tests/unit/inventario/importar/`.

### [x] B1 — Instalar las dependencias aprobadas · depende de: T0 (DS-3 aprobada el 2026-10-06)

- `package.json`, `pnpm-lock.yaml`: `read-excel-file` y `papaparse` (dependencias) y
  `@types/papaparse` (`devDependency`).
- `docs/dependencias.md`: las dos filas de `design.md > 9.1` (checks ya medidos por el leader).
- `tests/guards/guard-arquitectura-modulos.test.ts`: `PURE_PACKAGES` pasa a `['zod', 'papaparse']`.
- `docs/architecture.md > Dominio`: «paquetes puros (hoy: `zod`)» pasa a «(hoy: `zod`, `papaparse`)».

Hecho cuando: `guard-dependencias-aprobadas` y `guard-arquitectura-modulos` en verde. Si al instalar
la versión resuelta no es la medida (`9.3.x` / `5.7.x`), se para y se vuelve al leader.

### [x] B2 [P] — Celdas a forma canónica · depende de: T0 · R12, R13

- `lib/modules/inventario/domain/import-cell-parsing.ts` — decimal con coma o punto sin miles,
  fechas `AAAA-MM-DD` / `DD/MM/AAAA` con `esDiaDeCalendario`, etiqueta de tipo sin tildes ni
  mayúsculas, `normalizeHeader`.
- `tests/unit/inventario/import-cell-parsing.test.ts`

Hecho cuando: casos `R12 …` y `R13 …` (incluidos `1.234,5`, `2026-02-30`, `31/12/2026`) en verde.

### [x] B3 [P] — Lector de hoja: puerto + .csv · depende de: B1 · R4

- `lib/modules/inventario/ports/spreadsheet-reader.ts`
- `lib/modules/inventario/domain/import-file-format.ts` — extensión + firma ZIP / UTF-8 →
  formato o `unsupported_format`.
- `lib/modules/inventario/adapters/driven/spreadsheet/csv-reader.ts` — `Papa.parse` con separador
  `;`/`,` fijado por DS-2 (`design.md > 4.1`), sin lector propio.
- `tests/unit/inventario/spreadsheet-format.test.ts`, `tests/unit/inventario/csv-reader.test.ts`

Hecho cuando: comillas, comillas escapadas, salto de línea entre comillas, CRLF, BOM y detección
de separador cubiertos; un .xlsx renombrado a .csv y un .csv renombrado a .xlsx → `unsupported_format`.

### [x] B4 — Lector .xlsx · depende de: B1, B3 · R4

- `lib/modules/inventario/adapters/driven/spreadsheet/xlsx-reader.ts`
- `tests/fixtures/inventario-importar/mixto.xlsx` (DS-13; si no se puede producir, se anota en
  `progress/impl_QC-209-importar-inventario-desde-excel.md` y el test usa la librería simulada)
- `tests/integration/inventario/xlsx-reader.test.ts`

Hecho cuando: números nativos sin redondeo silencioso (> 4 decimales → `number_format_invalid`),
fechas nativas a `AAAA-MM-DD`, solo la primera hoja, ZIP corrupto → `unreadable`.

### [x] B5 [P] — Hoja: cabecera, límites y fila de ejemplo · depende de: B2 · R5, R6, R8

- `lib/modules/inventario/domain/import-sheet.ts` — de `SpreadsheetReadResult` a
  `ParsedImportSheet | ImportFileRejection`.
- `tests/unit/inventario/import-header.test.ts`, `tests/unit/inventario/import-sheet-limits.test.ts`

Hecho cuando: falta / sobra / repetida con los nombres; «Fila» y «Motivo» aceptadas; 2.000 sí y
2.001 no; filas en blanco no cuentan; ejemplo idéntico ignorado y señalado.

### [x] B6 [P] — Migración `inventory_imports` · depende de: T0 · R29, R30

- `db/schema.prisma` (modifica: modelo `InventoryImport`, `/// @module inventario`)
- `db/migrations/<timestamp>_inventory_imports/migration.sql` y `down.sql`

Hecho cuando: `pnpm run db:migrate` y `pnpm run db:rollback` limpios (y `_prisma_migrations`
coherente); RLS + `FORCE`; `guard-empresa-en-esquema` y la guardia de RLS en verde.

### [x] B7 — Puerto y adaptador de persistencia · depende de: B6 · R16, R18, R19, R29, R30, R31

- `lib/modules/inventario/ports/inventory-import-repository.ts`
- `lib/modules/inventario/ports/import-formula-lookup.ts` (interfaz del hueco hacia `recetas`)
- `lib/modules/inventario/adapters/driven/persistence/inventory-import-prisma.ts`
- `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts` (modifica: **solo**
  exportar `resolveLot`, `toBatchCreateData`, `writeMovement`, `recalculateProductStock` sin cambiar
  su cuerpo)
- `tests/guards/guard-ambito-empresa-inventario.test.ts` (modifica si la guardia enumera puertos:
  añadir `InventoryImportRepository`)
- `tests/integration/inventario/inventory-import-repository.test.ts`,
  `tests/integration/inventario/inventory-import-isolation.test.ts`
- `tests/integration/aislamiento.json` (modifica: censo de los archivos de integración nuevos de B)

Hecho cuando: cada método filtra por empresa y su rechazo cruzado está probado contra la base;
el desempate de `findAliveProductsByNormalizedNames` coincide con
`findAliveIdByNameInPresentationUnit` en el mismo caso; `claimImport` doble → `already`;
`receiveImportedFinishedGoods` crea una vez y suma después, con `package_content` y asiento `opening`.

### [x] B8 — Planificación y casos de uso · depende de: B2, B5, B7 · R1, R7, R9-R11, R14-R20, R22, R24-R27

- `lib/modules/inventario/domain/plan-inventory-import.ts` (`design.md > 3.1`)
- `lib/modules/inventario/domain/import-finished-goods.ts` (esquema de fila de terminado + caso de
  uso `createImportFinishedGoods`, DS-1)
- `lib/modules/inventario/domain/preview-inventory-import.ts`
- `lib/modules/inventario/domain/confirm-inventory-import.ts`
- `lib/modules/inventario/index.ts` **no se toca en B**: T0 ya reexporta
  `createPreviewInventoryImport` / `createConfirmInventoryImport` desde los dos archivos de caso de
  uso, que T0 crea con la firma de `design.md > 1.8` y un cuerpo que lanza «sin implementar». B8
  rellena esos dos archivos.
- `tests/unit/inventario/plan-inventory-import.test.ts`,
  `tests/unit/inventario/preview-inventory-import.test.ts`,
  `tests/unit/inventario/confirm-inventory-import.test.ts`,
  `tests/integration/inventario/inventory-import-confirm.test.ts`,
  `tests/integration/inventario/inventory-import-finished-goods.test.ts`,
  `tests/integration/inventario/inventory-import-idempotency.test.ts`

Hecho cuando: un caso nombrado `R<n> …` por cada R de la lista; el permiso va antes de leer bytes
(espías a cero); la confirmación usa `createProduct` (espía) para insumo/envase/instrumento; una
fila que falla no deshace las demás; **medida** la confirmación de 2.000 filas contra la base de
integración y anotada en `progress/impl_…md` (si > 120 s, parar y preguntar, `design.md > 7`).

### [x] B9 [P] — Archivo de errores real · depende de: B1 · R3, R28

- `lib/modules/inventario/domain/inventory-import-downloads.ts` (completa
  `buildInventoryImportErrorFile` y pasa la plantilla de T0 a `Papa.unparse`, con `delimiter: ';'`
  y BOM delante; mismo contrato de `design.md > 1.5`)
- `tests/unit/inventario/inventory-import-downloads.test.ts`

Hecho cuando: cabecera de plantilla exacta; archivo de errores con «Fila», valores originales y
«Motivo», solo filas `error`; el archivo generado pasa por `import-sheet.ts` sin rechazo de cabecera
(si B5 aún no está, ese caso se añade en B5).

### [x] B10 — Cableado · depende de: B3, B4, B7, B8 · R1, R31

- `lib/composition/index.ts` (modifica) — `inventario.previewInventoryImport` /
  `inventario.confirmInventoryImport` con: lector por formato, `InventoryImportRepository`,
  `UnitCatalog`, `PresentationCatalog`, `ImportFormulaLookup` atado a
  `RecipeCatalog.findAliveByNormalizedName`, el `createProduct` ya cableado y el
  `stockIncreaseListener` existente.

Hecho cuando: `pnpm typecheck` verde; un test de integración de B8 corre contra la composición real;
`./init.sh --rapido` verde.

---

## Pista F — frontend (`frontend_dev`)

Solo contra el contrato de T0. Las acciones se simulan en los tests (`vi.mock` de la ruta exacta
de cada acción); en el navegador local responden los stubs de T0. Ningún archivo de esta pista está
en `lib/`, `db/`, `tests/integration/` ni `tests/unit/inventario/*.test.ts` de B.

### [x] F1 — Página y enlace · depende de: T0 · R2

- `app/(private)/inventario/importar/page.tsx` — `requirePagePermission('inventario.modificar')`,
  `export const maxDuration = 300`, `listUnitsAction()`, metadata.
- `app/(private)/inventario/importar/components/index.ts`
- `app/(private)/inventario/page.tsx` (modifica: enlace «Importar» a `INVENTORY_IMPORT_ROUTE`,
  visible solo con `inventario.modificar`)
- `tests/unit/inventario/importar/importar-page.test.tsx`

Hecho cuando: 404 sin permiso; con permiso pinta la pantalla; el enlace no aparece sin permiso.

### [x] F2 [P] — Subida y plantilla · depende de: F1 · R3, R4, R6

- `.../importar/components/import-upload-field.tsx`, `import-template-button.tsx`,
  `download-file.ts`, `import-file-rejection.tsx`
- `tests/unit/inventario/importar/import-upload.test.tsx`

Hecho cuando: `accept` del contrato; aviso local por tamaño; cada `ImportFileRejection.code` tiene
su texto con columnas y cuentas; la plantilla se descarga desde `buildInventoryImportTemplate`.

### [x] F3 [P] — Vista previa · depende de: F1 · R9, R10, R18, R20, R24

- `.../importar/components/import-preview-summary.tsx`, `import-preview-table.tsx`
- `tests/unit/inventario/importar/import-preview.test.tsx`

Hecho cuando: totales; los cuatro estados distinguibles sin color (texto/icono); motivos con su
columna; filtro por estado; `add_batch` dice si es sobre existente o sobre la fila N; aviso de fila
de ejemplo ignorada; «Confirmar» deshabilitado con 0 válidas y disponible con errores o faltantes.

### [x] F4 [P] — Faltantes y sus altas · depende de: F1 · R20, R21, R22, R23

- `.../importar/components/import-missing-catalog.tsx`, `import-create-unit-dialog.tsx`,
  `import-create-presentation-dialog.tsx`
- `tests/unit/inventario/importar/import-missing-catalog.test.tsx`

Hecho cuando: cada faltante una vez con sus filas; botón oculto con `canCreate* = false`; los
diálogos llaman a `createUnitAction` / `createPresentationAction` con los campos de su alta normal
y el nombre prellenado; muestran sus `ErrorState` (`unit_duplicate_name`, `duplicate_symbol`,
`invalid_derivation`, `presentation_duplicate_name`, `unauthorized`); al éxito avisan al padre.

### [x] F5 — Pantalla, confirmación y resultado · depende de: F2, F3, F4 · R23, R24, R25, R28, R29

- `.../importar/components/inventory-import-screen.tsx`, `import-result-summary.tsx`
- `tests/unit/inventario/importar/inventory-import-screen.test.tsx`

Hecho cuando: tras crear un faltante se vuelve a pedir la vista previa con el **mismo** `File`;
`importKey` se genera al recibir la vista previa y se reutiliza en reintentos; `already_imported`
tiene su texto; el archivo de errores se descarga desde `buildInventoryImportErrorFile` en vista
previa y en resultado; estados de carga y `unexpected` con su `reference`.

### [x] F6 [P] — Pasada multiplataforma · depende de: F5

- Solo archivos de `app/(private)/inventario/importar/components/`.

Hecho cuando: revisado contra `docs/architecture.md > Regla: multiplataforma` (44×44, inputs
≥ 16 px, sin `:hover` único, sin `100vh`, tabla con desplazamiento propio en 375 px); anotado en
`progress/impl_…md`.

---

## TI — Integración · depende de: toda la pista B y toda la pista F · R7, R32, R33

**Agente:** `backend_dev` (acciones) y `frontend_dev` (E2E), en ese orden.

- `lib/modules/inventario/adapters/driving/inventory-import-actions.ts` (modifica: cuerpo real —
  borde zod, `currentActor()` con `runInRequestScope`, `File` → `Uint8Array`,
  `inventario.previewInventoryImport` / `confirmInventoryImport`, `revalidatePath(INVENTORY_ROUTE)`,
  traductor `createErrorStateTranslator(InventarioError, …)`)
- `lib/modules/inventario/adapters/driving/inventory-import-fixtures.ts` (**se borra**)
- `tests/unit/inventario/scope.test.ts` (modifica: quitar la exención de `'use server'` que T0 dio a
  `inventory-import-fixtures.ts`, al borrar los fixtures)
- `tests/unit/inventario/inventory-import-actions.test.ts` (modifica: de stub a acción real con la
  composición simulada; el test de forma de T0 no cambia)
- el test del gate que cuenta lecturas de sesión por Server Action (QC-104, lee `adapters/driving/`
  del disco): añadir las dos acciones a su lista con su ámbito
- `e2e/inventario-importar.spec.ts` + `e2e/fixtures/inventario-importar-mixto.csv`

E2E (D11, R33): Administrador entra en `/inventario/importar`, sube el .csv mixto (insumo nuevo,
insumo homónimo existente → suma lote, envase, instrumento, producto terminado con fórmula, una
fila con lote ya existente → duplicado, una fila con error de campo, dos filas con una unidad
inexistente), ve la vista previa, crea la unidad faltante desde ahí, ve la vista previa revalidada,
confirma, comprueba en `/inventario` los lotes creados (con su existencia) y descarga el archivo de
errores comprobando que trae solo la fila de error con su motivo.

Hecho cuando: el test de forma de T0 sigue verde sin tocarlo; E2E verde en los proyectos de
Playwright del repo; `./init.sh` **completo** verde.

## TZ — Cierre · depende de: TI

- `progress/impl_QC-209-importar-inventario-desde-excel.md` — mapa `R1..R33 -> test` (base:
  `design.md > 11`), medida de B8, decisión sobre el fixture .xlsx.

Hecho cuando: cada R tiene al menos un test que existe y pasa; `./init.sh` completo verde.

---

## Resumen de archivos por pista

| Pista | Archivos |
| --- | --- |
| T0 | `lib/modules/inventario/domain/inventory-import-contract.ts`, `.../domain/inventory-import-downloads.ts` (plantilla real, errores stub), `.../domain/preview-inventory-import.ts` y `.../domain/confirm-inventory-import.ts` (vacíos que lanzan, para que el barrel ya los reexporte), `lib/modules/inventario/index.ts`, `.../adapters/driving/inventory-import-actions.ts`, `.../adapters/driving/inventory-import-fixtures.ts`, `lib/shared/routes.ts`, `tests/unit/inventario/inventory-import-contract.test-d.ts`, `tests/unit/inventario/inventory-import-actions.test.ts` |
| B | `package.json`, `pnpm-lock.yaml`, `docs/dependencias.md`, `docs/architecture.md`, `tests/guards/guard-arquitectura-modulos.test.ts`, `lib/modules/inventario/domain/{import-cell-parsing,import-file-format,import-sheet,plan-inventory-import,import-finished-goods,preview-inventory-import,confirm-inventory-import,inventory-import-downloads}.ts` (los tres últimos los creó T0; B los completa), `lib/modules/inventario/ports/{spreadsheet-reader,inventory-import-repository,import-formula-lookup}.ts`, `lib/modules/inventario/adapters/driven/spreadsheet/{csv-reader,xlsx-reader}.ts`, `lib/modules/inventario/adapters/driven/persistence/{inventory-import-prisma,product-prisma}.ts`, `lib/composition/index.ts`, `db/schema.prisma`, `db/migrations/<ts>_inventory_imports/*`, `tests/unit/inventario/{import-cell-parsing,spreadsheet-format,csv-reader,import-header,import-sheet-limits,plan-inventory-import,preview-inventory-import,confirm-inventory-import,inventory-import-downloads}.test.ts`, `tests/integration/inventario/{xlsx-reader,inventory-import-repository,inventory-import-isolation,inventory-import-confirm,inventory-import-finished-goods,inventory-import-idempotency}.test.ts`, `tests/integration/aislamiento.json`, `tests/guards/guard-ambito-empresa-inventario.test.ts`, `tests/fixtures/inventario-importar/mixto.xlsx` |
| F | `app/(private)/inventario/importar/page.tsx`, `app/(private)/inventario/importar/components/*`, `app/(private)/inventario/page.tsx`, `tests/unit/inventario/importar/*.test.tsx` |
| TI | `lib/modules/inventario/adapters/driving/inventory-import-actions.ts`, `.../inventory-import-fixtures.ts` (borrado), `tests/unit/inventario/inventory-import-actions.test.ts`, test de conteo de sesión de QC-104, `e2e/inventario-importar.spec.ts`, `e2e/fixtures/inventario-importar-mixto.csv` |

Intersección B ∩ F = ∅. `inventory-import-downloads.ts` y los dos casos de uso los crea T0 y solo
los completa B; F solo los importa por el barrel.
