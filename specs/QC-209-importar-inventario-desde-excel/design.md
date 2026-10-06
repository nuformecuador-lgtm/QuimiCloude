# QC-209 — importar-inventario-desde-excel · design.md

> Requisitos: `requirements.md` (R1-R33, D1-D11). Este documento fija primero el contrato (D10) y
> después el cómo. Las decisiones `DS-n` de la sección 9 salen para aprobación humana junto con el
> spec (F1.4); ninguna reabre D1-D11.
>
> Verificado contra el código de `origin/dev` en el worktree (2026-10-05): `create-product.ts`,
> `product-input.ts`, `product-batch-input.ts`, `finished-goods.ts`, `product-prisma.ts >
> receiveFinishedGoods`, `finished-stock-prisma.ts`, `create-presentation.ts`, `presentation-actions.ts`,
> `unidades/create-unit.ts`, `unit-actions.ts`, `unit-catalog.ts`, `recetas/recipe-catalog.ts`,
> `errores/error-codes.ts`, `error-state.ts`, `documentos/formula-import-actions.ts`,
> `identity/permissions.ts`, `db/schema.prisma`. El grafo (`codebase-memory-mcp`) no se usó: esta
> sesión no tenía las herramientas del MCP cargadas; todo se leyó con Grep/Read.

---

## 1. Contrato de servicios

Esto es lo que la pantalla consume y lo único que `frontend_dev` necesita saber. T0 lo publica en
código tal cual (tipos reales + acciones con stub). Ningún track lo cambia sin volver a este
documento.

Vive en el módulo **`inventario`**:

| Pieza | Archivo | Quién lo importa |
| --- | --- | --- |
| Tipos, constantes y funciones puras | `lib/modules/inventario/domain/inventory-import-contract.ts` y `.../domain/inventory-import-downloads.ts`, reexportados por `lib/modules/inventario/index.ts` | UI (cliente) y dominio |
| Server Actions nuevas | `lib/modules/inventario/adapters/driving/inventory-import-actions.ts` (`'use server'`, fuera del barrel) | UI por su ruta exacta |
| Server Actions reutilizadas, sin cambios | `lib/modules/unidades/adapters/driving/unit-actions.ts`, `lib/modules/inventario/adapters/driving/presentation-actions.ts` | UI por su ruta exacta |
| Ruta | `INVENTORY_IMPORT_ROUTE = '/inventario/importar'` en `lib/shared/routes.ts` | UI |

### 1.1 Constantes y columnas de la plantilla

```ts
// lib/modules/inventario/domain/inventory-import-contract.ts — puro, importable desde cliente

export const INVENTORY_IMPORT_MAX_ROWS = 2000;            // D6
export const INVENTORY_IMPORT_MAX_FILE_BYTES = 1_000_000;  // DS-5
export const INVENTORY_IMPORT_ACCEPT = '.xlsx,.csv';       // para <input accept>
export type InventoryImportFormat = 'xlsx' | 'csv';

/** El tipo de producto tal como viaja en el contrato. Mismos literales que `ProductType`. */
export type ImportRowType = 'PRODUCT' | 'PACKAGING' | 'MACHINE' | 'FINISHED_PRODUCT';

/** Lo que se escribe en la columna «Tipo». Se compara sin mayúsculas, tildes ni espacios de los extremos. */
export const IMPORT_TYPE_LABELS = {
  PRODUCT: 'Insumo',
  PACKAGING: 'Envase',
  MACHINE: 'Instrumento',
  FINISHED_PRODUCT: 'Producto terminado',
} as const satisfies Record<ImportRowType, string>;

/** 'required' = la fila de ese tipo la exige; 'optional' = puede ir vacía; 'forbidden' = DEBE ir vacía (R11). */
export type ImportColumnRule = 'required' | 'optional' | 'forbidden';

export const INVENTORY_IMPORT_COLUMNS = [
  //  key             header                   cabecera obligatoria  PRODUCT     PACKAGING   MACHINE     FINISHED_PRODUCT
  { key: 'type',         header: 'Tipo',                 headerRequired: true,  rules: { PRODUCT: 'required',  PACKAGING: 'required',  MACHINE: 'required',  FINISHED_PRODUCT: 'required'  } },
  { key: 'name',         header: 'Nombre',               headerRequired: true,  rules: { PRODUCT: 'required',  PACKAGING: 'required',  MACHINE: 'required',  FINISHED_PRODUCT: 'forbidden' } },
  { key: 'unit',         header: 'Unidad',               headerRequired: false, rules: { PRODUCT: 'required',  PACKAGING: 'forbidden', MACHINE: 'forbidden', FINISHED_PRODUCT: 'forbidden' } },
  { key: 'presentation', header: 'Presentación',         headerRequired: false, rules: { PRODUCT: 'forbidden', PACKAGING: 'required',  MACHINE: 'forbidden', FINISHED_PRODUCT: 'required'  } },
  { key: 'formula',      header: 'Fórmula',              headerRequired: false, rules: { PRODUCT: 'forbidden', PACKAGING: 'forbidden', MACHINE: 'forbidden', FINISHED_PRODUCT: 'required'  } },
  { key: 'stock',        header: 'Existencia',           headerRequired: true,  rules: { PRODUCT: 'required',  PACKAGING: 'required',  MACHINE: 'required',  FINISHED_PRODUCT: 'required'  } },
  { key: 'unitCost',     header: 'Costo unitario',       headerRequired: false, rules: { PRODUCT: 'optional',  PACKAGING: 'optional',  MACHINE: 'optional',  FINISHED_PRODUCT: 'optional'  } },
  { key: 'totalCost',    header: 'Costo total',          headerRequired: false, rules: { PRODUCT: 'optional',  PACKAGING: 'optional',  MACHINE: 'optional',  FINISHED_PRODUCT: 'optional'  } },
  { key: 'lot',          header: 'Lote',                 headerRequired: false, rules: { PRODUCT: 'optional',  PACKAGING: 'optional',  MACHINE: 'optional',  FINISHED_PRODUCT: 'optional'  } },
  { key: 'purchaseDate', header: 'Fecha de compra',      headerRequired: false, rules: { PRODUCT: 'optional',  PACKAGING: 'optional',  MACHINE: 'optional',  FINISHED_PRODUCT: 'optional'  } },
  { key: 'expiryDate',   header: 'Fecha de vencimiento', headerRequired: false, rules: { PRODUCT: 'optional',  PACKAGING: 'forbidden', MACHINE: 'optional',  FINISHED_PRODUCT: 'optional'  } },
  { key: 'qtyAlert',     header: 'Alerta de cantidad',   headerRequired: false, rules: { PRODUCT: 'required',  PACKAGING: 'required',  MACHINE: 'forbidden', FINISHED_PRODUCT: 'forbidden' } },
] as const;

export type ImportColumnKey = (typeof INVENTORY_IMPORT_COLUMNS)[number]['key'];

/** Valores originales de la fila, como texto, tal como se leyeron (sin normalizar). Columna ausente = ''. */
export type ImportCells = Readonly<Record<ImportColumnKey, string>>;
```

Notas que fijan la tabla (todas trazan a una regla existente, no son nuevas):

- **«Costo unitario» / «Costo total»**: el par de `exigirCostoDelLote` (`product-input.ts`). Insumo y
  envase exigen uno de los dos; instrumento ninguno; producto terminado, uno de los dos (DS-1, por el
  CHECK `product_batches_package_content_requires_unit_cost`).
- **«Alerta de cantidad»**: obligatoria en insumo y envase porque `productFieldsShape.qtyAlert` lo
  es en el alta manual; el instrumento no la declara (`createMachineSchema`); el terminado no nace
  del alta manual y no la lleva.
- **«Fecha de vencimiento»** prohibida en envase: `createPackaging` escribe `expiryDate: null`.
- **«Fecha de vencimiento»** opcional en terminado: la columna existe en el lote; DS-1.

### 1.2 Motivos de fila

```ts
export const IMPORT_ROW_ISSUE_CODES = [
  'type_invalid',                 // «Tipo» vacío o no es uno de IMPORT_TYPE_LABELS
  'value_required',               // columna 'required' vacía para ese tipo
  'column_not_applicable',        // columna 'forbidden' con valor (R11)
  'name_too_long',                // > PRODUCT_NAME_MAX_LENGTH (200)
  'unit_not_found',               // la unidad no existe en la empresa ni en sistema -> faltante (R20)
  'unit_ambiguous',               // el texto casa con más de una unidad visible (DS-10)
  'presentation_not_found',       // -> faltante (R20)
  'presentation_without_content', // terminado con presentación sin contenido (R16)
  'presentation_mismatch',        // envase homónimo vivo con otra presentación (R14)
  'formula_not_found',            // no es una fórmula original viva de la empresa (R16)
  'finished_product_homonym',     // insumo/envase/instrumento cuyo homónimo vivo es terminado (R17)
  'stock_invalid',                // no es decimal >= 0 con hasta 10 enteros y 4 decimales
  'stock_not_whole',              // envase o terminado con existencia no entera; terminado con 0 (DS-1)
  'cost_required',                // ni unitario ni total donde hace falta uno
  'cost_invalid',                 // importe mal formado o cero
  'total_cost_too_low',           // el unitario derivado del total redondea a 0
  'qty_alert_invalid',
  'number_format_invalid',        // separador de miles o más de un separador decimal (R12)
  'lot_invalid',                  // lotSchema: vacío tras recortar, > 60, numérico de 60
  'lot_used_by_other_product',    // R19
  'purchase_date_invalid',
  'purchase_date_future',         // R13
  'expiry_date_invalid',
  'write_failed',                 // solo en el resultado: la escritura de la fila falló (R27)
] as const;
export type ImportRowIssueCode = (typeof IMPORT_ROW_ISSUE_CODES)[number];

export type ImportRowIssue = {
  readonly code: ImportRowIssueCode;
  /** La columna a la que apunta el motivo; `null` solo en `write_failed`. */
  readonly column: ImportColumnKey | null;
  /** Texto en español, listo para pintar y para el archivo de errores. Nombra la columna. */
  readonly message: string;
};
```

### 1.3 Vista previa (DTO de salida)

```ts
type ImportRowBase = {
  /** Número de fila en la hoja, 1 = cabecera. Es el que ve el usuario en Excel. */
  readonly rowNumber: number;
  readonly cells: ImportCells;
  /** `null` cuando «Tipo» no se pudo leer. */
  readonly type: ImportRowType | null;
  /** Nombre con el que queda el producto (en terminado, el derivado de DS-1). `null` si no se pudo resolver. */
  readonly productName: string | null;
};

/** A qué producto se suma el lote: uno que ya existe, o el que crea una fila anterior del mismo archivo (R15). */
export type ImportBatchTarget =
  | { readonly kind: 'existing'; readonly productId: string }
  | { readonly kind: 'file_row'; readonly rowNumber: number };

export type ImportPreviewRow =
  | (ImportRowBase & { readonly status: 'create' })
  | (ImportRowBase & { readonly status: 'add_batch'; readonly target: ImportBatchTarget })
  | (ImportRowBase & { readonly status: 'duplicate'; readonly lot: string; readonly target: ImportBatchTarget })
  | (ImportRowBase & { readonly status: 'error'; readonly issues: readonly [ImportRowIssue, ...ImportRowIssue[]] });

export type ImportPreviewStatus = ImportPreviewRow['status'];

/** Un faltante, una sola vez, con las filas que lo nombran (R20). `name` es el texto tal cual de la primera fila. */
export type ImportMissingEntry = { readonly name: string; readonly rowNumbers: readonly number[] };

export type ImportPreviewTotals = {
  readonly rows: number;
  readonly create: number;
  readonly addBatch: number;
  readonly duplicate: number;
  readonly error: number;
};

export type InventoryImportPreview = {
  readonly kind: 'preview';
  readonly fileName: string;
  readonly format: InventoryImportFormat;
  /** R8: la fila de ejemplo de la plantilla vino y se ignoró. */
  readonly exampleRowIgnored: boolean;
  readonly totals: ImportPreviewTotals;
  /** En el orden del archivo. */
  readonly rows: readonly ImportPreviewRow[];
  readonly missingUnits: readonly ImportMissingEntry[];
  readonly missingPresentations: readonly ImportMissingEntry[];
  /** Si quien mira tiene el permiso del alta normal (R21). Solo decide si se ofrece el botón; el service vuelve a mirar. */
  readonly canCreateUnits: boolean;
  readonly canCreatePresentations: boolean;
};

/** Rechazo del archivo entero (R4, R5, R6). Va como dato y no como `ErrorState` porque lleva valores
 *  variables (columnas, cuentas) y `ErrorState` es cerrado (`errores/error-state.ts`). */
export type ImportFileRejection =
  | { readonly code: 'unsupported_format' }
  | { readonly code: 'unreadable' }
  | { readonly code: 'empty' }
  | { readonly code: 'file_too_large'; readonly bytes: number; readonly maxBytes: number }
  | { readonly code: 'too_many_rows'; readonly rows: number; readonly maxRows: number }
  | { readonly code: 'missing_columns'; readonly columns: readonly string[] }
  | { readonly code: 'unknown_columns'; readonly columns: readonly string[] }
  | { readonly code: 'duplicate_columns'; readonly columns: readonly string[] };

export type ImportFileRejected = { readonly kind: 'file_rejected'; readonly rejection: ImportFileRejection };

export type InventoryImportPreviewOutcome = InventoryImportPreview | ImportFileRejected;
```

### 1.4 Confirmación (DTO de salida)

```ts
export type ImportResultRow =
  | (ImportRowBase & { readonly status: 'created'; readonly productId: string; readonly lot: string })
  | (ImportRowBase & { readonly status: 'batch_added'; readonly productId: string; readonly lot: string })
  | (ImportRowBase & { readonly status: 'duplicate'; readonly lot: string })
  | (ImportRowBase & { readonly status: 'error'; readonly issues: readonly [ImportRowIssue, ...ImportRowIssue[]] });

export type ImportResultTotals = {
  readonly rows: number;
  readonly created: number;
  readonly batchAdded: number;
  readonly duplicate: number;
  readonly error: number;
};

export type InventoryImportResult = {
  readonly kind: 'imported';
  readonly importId: string;
  /** ISO 8601, instante de la confirmación. */
  readonly importedAt: string;
  readonly fileName: string;
  readonly exampleRowIgnored: boolean;
  readonly totals: ImportResultTotals;
  readonly rows: readonly ImportResultRow[];
};

/** R29: la misma `importKey` ya se confirmó en esta empresa. No se escribe nada. */
export type ImportAlreadyDone = {
  readonly kind: 'already_imported';
  readonly importId: string;
  readonly importedAt: string;
};

export type InventoryImportConfirmOutcome = InventoryImportResult | ImportAlreadyDone | ImportFileRejected;
```

### 1.5 Descargas (funciones puras del barrel)

La plantilla y el archivo de errores se construyen **en el cliente** a partir del contrato: no hay
Server Action de descarga. La vista previa y el resultado ya traen los valores originales de cada
fila (`cells`), así que el servidor no tiene nada que añadir y no hay que guardar nada entre
peticiones.

```ts
// lib/modules/inventario/domain/inventory-import-downloads.ts — puro, reexportado por el barrel

export type ImportDownload = {
  readonly fileName: string;                       // 'plantilla-inventario.csv' | '<origen>-errores.csv'
  readonly mimeType: 'text/csv;charset=utf-8';
  readonly content: string;                        // con BOM UTF-8 al principio, separador ';' (DS-4)
};

/** R3: cabecera de INVENTORY_IMPORT_COLUMNS en orden + una fila de ejemplo (IMPORT_EXAMPLE_ROW). */
export function buildInventoryImportTemplate(): ImportDownload;

/** La fila de ejemplo de la plantilla. R8 la compara celda a celda (recortada). */
export const IMPORT_EXAMPLE_ROW: ImportCells;

/** R28: «Fila» + las columnas de la plantilla con los valores originales + «Motivo» (motivos unidos por ' | ').
 *  Solo las filas en `error`. Se puede volver a subir: «Fila» y «Motivo» se aceptan como columnas
 *  conocidas y se ignoran al leer (ver 4.2). */
export function buildInventoryImportErrorFile(
  rows: readonly (ImportPreviewRow | ImportResultRow)[],
  sourceFileName: string,
): ImportDownload;
```

### 1.6 Server Actions nuevas

```ts
// lib/modules/inventario/adapters/driving/inventory-import-actions.ts
'use server';
import type { ErrorState } from '@/lib/modules/errores';
import type { InventoryImportPreviewOutcome, InventoryImportConfirmOutcome } from '@/lib/modules/inventario';

export type PreviewInventoryImportResult =
  | { status: 'success'; data: InventoryImportPreviewOutcome }
  | ErrorState;

export type ConfirmInventoryImportResult =
  | { status: 'success'; data: InventoryImportConfirmOutcome }
  | ErrorState;

/**
 * FormData de entrada:
 *   file: File   — el .xlsx o .csv (obligatorio)
 * No escribe nada (R9). Se vuelve a llamar con el mismo File tras crear un faltante (R23).
 */
export async function previewInventoryImportAction(formData: FormData): Promise<PreviewInventoryImportResult>;

/**
 * FormData de entrada:
 *   file: File        — el MISMO archivo de la vista previa (el servidor lo vuelve a validar, R25)
 *   importKey: string — uuid que la pantalla genera (crypto.randomUUID) al recibir la vista previa
 *                       y reutiliza en cada reintento de esa confirmación (R29)
 * Revalida la ruta INVENTORY_ROUTE al terminar con `kind: 'imported'`.
 */
export async function confirmInventoryImportAction(formData: FormData): Promise<ConfirmInventoryImportResult>;
```

**Códigos de error** (`ErrorState`, catálogo de `lib/modules/errores`; **no se añade ninguno**):

| Código | Cuándo | Acción |
| --- | --- | --- |
| `unauthorized` | sin sesión, sin empresa en la sesión, o sin `inventario.modificar` (R1) | las dos |
| `invalid_input` | `file` ausente o no es `File`; `importKey` ausente o no es uuid | las dos (borde zod, antes de resolver el actor, mismo criterio que `formula-import-actions.ts`) |
| `unexpected` | cualquier otro fallo; lleva `reference` | las dos |

Todo lo demás —archivo rechazado, motivos de fila, ya importado— es `status: 'success'` con su
`data`. La pantalla decide por `data.kind` y por `row.status`, nunca por texto.

### 1.7 Server Actions reutilizadas (sin cambios; R21, R22)

Crear un faltante desde la vista previa **es** el alta normal: mismas acciones, mismo esquema, mismo
permiso, mismos errores. No hay acción nueva para eso.

```ts
// lib/modules/unidades/adapters/driving/unit-actions.ts (existente)
export type CreateUnitFormState = { status: 'idle' } | { status: 'success'; id: string } | ErrorState;
export async function createUnitAction(prev: CreateUnitFormState, formData: FormData): Promise<CreateUnitFormState>;
//   FormData: name (obligatorio), symbol?, baseUnitId?, factor?   (ausente ≠ vacío: `formData.has`)
//   Errores: unauthorized (sin `unidades.modificar`), invalid_input, unit_duplicate_name,
//            duplicate_symbol, invalid_derivation, unexpected
export async function listUnitsAction(): Promise<UnitListResult>; // unidades para los selectores de los dos diálogos

// lib/modules/inventario/adapters/driving/presentation-actions.ts (existente)
export type CreatePresentationFormState = { status: 'idle' } | { status: 'success'; id: string } | ErrorState;
export async function createPresentationAction(prev: CreatePresentationFormState, formData: FormData): Promise<CreatePresentationFormState>;
//   FormData: name (obligatorio), unitId (obligatorio), content?
//   Errores: unauthorized (sin `inventario.modificar`), invalid_input, presentation_duplicate_name, unexpected
```

Flujo de la pantalla con el faltante: el diálogo se abre con `name` prellenado con
`ImportMissingEntry.name`; al recibir `status: 'success'` la pantalla vuelve a llamar a
`previewInventoryImportAction` con el mismo `File` y pinta la vista previa nueva (R23). Si la
presentación se crea con otro nombre, la fila sigue en `presentation_not_found`: la vista previa
manda.

### 1.8 Casos de uso que cablea la composición (para `backend_dev`; la UI no los ve)

```ts
// lib/modules/inventario/domain/inventory-import-contract.ts (mismo archivo, sección de casos de uso)
export type InventoryImportFile = { readonly fileName: string; readonly bytes: Uint8Array };

export type PreviewInventoryImport = (
  input: InventoryImportFile,
  actor: Actor | null | undefined,
) => Promise<InventoryImportPreviewOutcome>;

export type ConfirmInventoryImport = (
  input: InventoryImportFile & { readonly importKey: string },
  actor: Actor | null | undefined,
) => Promise<InventoryImportConfirmOutcome>;

// lib/composition/index.ts -> inventario.previewInventoryImport / inventario.confirmInventoryImport
```

### 1.9 Lo que el stub de T0 devuelve

Las dos acciones de T0 tienen **la firma de 1.6** y devuelven datos fijos de
`.../adapters/driving/inventory-import-fixtures.ts`, sin sesión ni base:

- `previewInventoryImportAction`: sin `file` → `invalid_input`; con un `File` cuyo nombre empieza
  por `rechazado` → `file_rejected / missing_columns ['Existencia']`; con cualquier otro → una
  `InventoryImportPreview` de 6 filas que cubre los cuatro estados, un faltante de unidad
  (`Galón`) y uno de presentación (`Bidón 20 L`), `exampleRowIgnored: true`,
  `canCreateUnits: true`, `canCreatePresentations: true`.
- `confirmInventoryImportAction`: sin `file` o `importKey` → `invalid_input`; con `importKey` =
  `00000000-0000-4000-8000-000000000000` → `already_imported`; con cualquier otro → un
  `InventoryImportResult` coherente con la vista previa fija.

Los fixtures se borran en TI. Hasta TI la rama no se integra en `dev`.

---

## 2. Dónde vive y por qué

**Módulo `inventario`.** La importación da de alta productos y lotes de inventario; sus reglas son
las del alta manual (D8), que viven en `inventario/domain/create-product.ts`. Ponerla en otro módulo
obligaría a ese módulo a reimplementar o a pedir por interfaz lo que `inventario` ya tiene dentro.

**El ciclo con `recetas`.** El terminado necesita resolver la fórmula por nombre
(`RecipeCatalog.findAliveByNormalizedName`, que ya existe). Pero `recetas` importa el barrel de
`inventario` (`create-recipe.ts`, `get-recipe.ts`…), así que el dominio de `inventario` no puede
importar el de `recetas`. Se resuelve como `StockIncreaseListener` resuelve el ciclo con `pedidos`:
`inventario` declara el hueco y `lib/composition` lo ata.

```ts
// lib/modules/inventario/ports/import-formula-lookup.ts  (en ports/: la composición puede importar
// `*/ports/**` pero no `domain/` por ruta profunda)
export interface ImportFormulaLookup {
  /** Fórmula ORIGINAL VIVA de la empresa con ese nombre normalizado, o null. */
  findAliveOriginalByName(name: string, companyId: string): Promise<{ id: string; name: string } | null>;
}
// composition: { findAliveOriginalByName: (n, c) => recipeCatalog.findAliveByNormalizedName(n, c) }
```

`unidades` no tiene ciclo: `inventario` ya importa su barrel (`UnitCatalog`, `normalizeUnitName`).

## 3. Flujo

```
UI (File) ──previewInventoryImportAction(FormData)──► zod(borde) ► actor ► inventario.previewInventoryImport
                                                             │
                     requirePermission('inventario.modificar')   (R1, antes de leer bytes)
                     ► tope de bytes (R6) ► SpreadsheetReader.read(bytes, format)  (R4)
                     ► cabecera (R5) ► filas, vacías fuera, ejemplo fuera (R6, R8)
                     ► lecturas en lote (5 consultas, no una por fila) ► planificar filas (R9-R20)
                     ◄── InventoryImportPreview
UI crea faltante ──createUnitAction / createPresentationAction──► alta normal (R21)
UI ──previewInventoryImportAction(mismo File)──► vista previa nueva (R23)
UI ──confirmInventoryImportAction(File, importKey)──► permiso ► claim de importKey (R29)
                     ► misma planificación contra la base de ahora (R25)
                     ► por fila válida, en orden: escritura propia (R26, R27)
                     ► cierre del registro (R30) ◄── InventoryImportResult
```

### 3.1 Planificación (pura) — `domain/plan-inventory-import.ts`

Una sola función, usada por la vista previa y por la confirmación, para que las dos digan lo mismo:

```ts
export function planInventoryImport(
  sheet: ParsedImportSheet,          // filas ya leídas: rowNumber + cells
  catalog: ImportCatalogSnapshot,    // lo que se leyó de la base en lote (abajo)
  today: string,                     // 'YYYY-MM-DD' UTC, mismo reloj que create-product.ts
): { rows: ImportPreviewRow[]; missingUnits: ImportMissingEntry[]; missingPresentations: ImportMissingEntry[] };
```

Por fila, en este orden: tipo (`type_invalid` corta ahí) → columnas prohibidas (R11) → números y
fechas a forma canónica (R12, R13; `import-cell-parsing.ts`) → **el esquema del alta manual**:
se construye el candidato y se valida con `createProductSchema` (insumo, envase, instrumento) —el
mismo objeto zod que usa el formulario— y cada `issue.path[0]` se traduce a su columna (R10) →
referencias (unidad, presentación, fórmula; R16, R20) → identidad y lote (R14, R15, R17, R18, R19).
El terminado no tiene esquema manual: se valida con `importFinishedGoodsRowSchema`
(`domain/import-finished-goods.ts`), que reutiliza los mismos subesquemas de lote, fecha e importe.

El estado del archivo (productos que crean filas anteriores, lotes ya vistos) se lleva en un mapa
mientras se recorre: así funcionan R15 y la mitad «del mismo archivo» de R18 y R19.

### 3.2 Lecturas en lote — `ImportCatalogSnapshot`

Cinco lecturas por vista previa, sin importar el número de filas:

| Lectura | Fuente | Para |
| --- | --- | --- |
| Unidades visibles (sistema + empresa) | `UnitCatalog.listVisibleRefs(companyId)` (existe) | R14, R20, DS-10 |
| Presentaciones por nombre normalizado | `PresentationCatalog.findByNormalizedNames` + `findRefs` para el contenido (existen) | R14, R16, R20 |
| Fórmulas por nombre | `ImportFormulaLookup` (nuevo puerto, una llamada por nombre distinto) | R16 |
| Productos vivos por nombre normalizado | `InventoryImportRepository.findAliveProductsByNormalizedNames` (nuevo) | R14, R15, R17 |
| Terminados vivos por (fórmula, presentación) | `InventoryImportRepository.findAliveFinishedProducts` (nuevo) | R16 |
| Lotes por código | `InventoryImportRepository.findBatchesByLots` (nuevo) | R18, R19 |

`findAliveProductsByNormalizedNames` devuelve las filas ordenadas por `created_at, id` y el dominio
toma la primera de cada identidad: es el mismo desempate que documenta
`ProductRepository.findAliveIdByNameInPresentationUnit` («el más antiguo, desempatando por
identificador ascendente»). Un test de integración compara las dos respuestas para el mismo caso.

### 3.3 Escritura (confirmación) — `domain/confirm-inventory-import.ts`

1. `requirePermission(actor, 'inventario.modificar')` (R1).
2. Leer y planificar igual que la vista previa (R25).
3. `repo.claimImport({ importKey, fileName, fileSha256, createdBy }, scope)` →
   `'claimed' | { already: { importId, importedAt } }` (R29). El claim va **antes** de la primera
   escritura; si ya existía, se devuelve `already_imported` sin tocar nada más.
4. Por cada fila `create` / `add_batch`, en orden de archivo, **una transacción por fila** (R27):
   - insumo, envase, instrumento → **el caso de uso existente** `createProduct(candidate, actor)`
     (`create-product.ts`), con el candidato que validó la planificación y el `unitId` /
     `presentationId` ya resueltos. Es literalmente el alta manual: identidad, homónimo,
     correlativo de lote, asiento `opening`, recálculo de existencia y `stockIncreases`
     (revisión de pedidos bloqueados) por lote (R26, D8).
   - terminado → `createImportFinishedGoods(input, actor)` (`domain/import-finished-goods.ts`, nuevo),
     que llama a `repo.receiveImportedFinishedGoods` (una transacción: producto terminado por
     `ON CONFLICT (company_id, recipe_id, presentation_id)` igual que `receiveFinishedGoods`, lote con
     `package_content`, asiento `opening`, recálculo) y después a `stockIncreases.onStockIncreased`.
   - cualquier error de dominio de la fila → `status: 'error'` con su motivo traducido
     (`batch_duplicate_lot` → `lot_used_by_other_product` o `duplicate` según de quién sea el lote;
     `ActionNotAllowedError` → `finished_product_homonym` / `presentation_mismatch`;
     resto → `write_failed`). La fila siguiente sigue (R27).
5. `repo.finishImport(importId, totals, now, scope)` (R30).

**Por qué `createProduct` por fila y no un insert masivo.** D8 dice «mismas reglas que el alta
manual». Llamar al mismo caso de uso es la única forma de que esa frase sea cierta por construcción
y no por disciplina: si mañana el alta manual cambia, la importación cambia con ella. El coste es
latencia (sección 7).

## 4. Lectura del archivo

### 4.1 Puerto

```ts
// lib/modules/inventario/ports/spreadsheet-reader.ts
export type SpreadsheetReadResult =
  | { readonly kind: 'ok'; readonly rows: readonly (readonly SpreadsheetCell[])[] } // fila 0 = cabecera
  | { readonly kind: 'unreadable' };
/** Una celda ya convertida a texto canónico por el adaptador: los números de .xlsx como decimal
 *  sin exponente, las fechas de .xlsx como 'YYYY-MM-DD'. */
export type SpreadsheetCell = { readonly text: string; readonly origin: 'text' | 'number' | 'date' };
export interface SpreadsheetReader {
  read(bytes: Uint8Array, format: InventoryImportFormat): Promise<SpreadsheetReadResult>;
}
```

Formato: por extensión del nombre (`.xlsx` / `.csv`, sin mayúsculas) **y** contenido: un .xlsx tiene
que empezar por la firma ZIP `50 4B 03 04`; un .csv tiene que ser UTF-8 válido (con o sin BOM).
Si no, `unsupported_format` (R4). Solo se lee la **primera hoja** del .xlsx.

Adaptadores driven (`lib/modules/inventario/adapters/driven/spreadsheet/`):

- `xlsx-reader.ts` — `read-excel-file/node` (DS-3) sobre un `Buffer`. Los números llegan como
  `number` de JS: se pasan a texto con `toFixed(4)` y se rechaza (`number_format_invalid`) si el
  número tiene más de 4 decimales significativos (`Math.abs(n * 1e4 - Math.round(n * 1e4)) > 1e-6`),
  para no redondear en silencio. Las fechas llegan como `Date` UTC: `toISOString().slice(0, 10)`.
- `csv-reader.ts` — `Papa.parse` (DS-3) sobre el texto UTF-8 ya decodificado y sin BOM, con
  `header: false`, `skipEmptyLines: 'greedy'` y `delimiter` fijado por la regla de DS-2 (se mira
  la cabecera fuera de comillas; no se usa la autodetección de la librería, que podría elegir otro).
  Comillas, comillas escapadas, saltos de línea entre comillas y CRLF/LF los resuelve la librería.
  Un error de `Papa.parse` de tipo `Quotes` → `unreadable`.

### 4.2 Cabecera

`normalizeHeader(h) = quitar tildes(NFD) + minúsculas + trim + espacios internos colapsados`. Se
compara contra `INVENTORY_IMPORT_COLUMNS[].header` normalizados. «Fila» y «Motivo» (las que añade el
archivo de errores) se aceptan y se ignoran, para que R28 sea cierto. Falta una `headerRequired` →
`missing_columns`; sobra otra → `unknown_columns`; repetida → `duplicate_columns` (R5).

## 5. Modelo de datos

### 5.1 Tabla nueva `inventory_imports` (R29, R30)

```prisma
/// Una confirmación de importación de inventario. `importKey` es la clave de idempotencia que manda
/// la pantalla. `companyId` y `createdBy` no llevan `@relation`: `Company` y `User` son de otro
/// modulo; sus FK estan escritas a mano y son drift.
/// @module inventario
model InventoryImport {
  id              String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  companyId       String    @map("company_id") @db.Uuid
  importKey       String    @map("import_key") @db.Uuid
  fileName        String    @map("file_name")
  fileSha256      String    @map("file_sha256")
  rowsTotal       Int?      @map("rows_total")
  createdCount    Int?      @map("created_count")
  batchAddedCount Int?      @map("batch_added_count")
  duplicateCount  Int?      @map("duplicate_count")
  errorCount      Int?      @map("error_count")
  createdBy       String    @map("created_by") @db.Uuid
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  finishedAt      DateTime? @map("finished_at") @db.Timestamptz(6)

  @@unique([companyId, importKey], map: "inventory_imports_company_key_unique")
  @@index([companyId, createdAt], map: "inventory_imports_company_created_idx")
  @@map("inventory_imports")
}
```

Migración `db/migrations/<ts>_inventory_imports/`:

- `migration.sql`: `CREATE TABLE` + FK a mano `company_id → companies(id) ON DELETE RESTRICT`,
  `created_by → users(id) ON DELETE RESTRICT`; `CHECK` de cuentas `>= 0` y de
  `finished_at IS NULL OR rows_total IS NOT NULL`; `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` +
  `FORCE ROW LEVEL SECURITY` + la policy por empresa con el mismo patrón que las demás tablas de
  `inventario` (defensa en profundidad; la frontera es el service).
- `down.sql`: `DROP TABLE "inventory_imports";` (nada más la referencia).

Tiene `company_id`: no entra en la lista de exentas de `guard-empresa-en-esquema`. No se borra nunca
(es auditoría): sin `deleted_at` y sin operación de borrado.

**No cambia ninguna tabla existente.** El terminado importado usa columnas que ya están:
`products.recipe_id`, `products.presentation_id`, `product_batches.package_content`, asiento
`opening` (el CHECK `kind = production ⇔ order_presentation_line_id IS NOT NULL` lo permite, y
`finished-stock-prisma.ts` ya lista los lotes de terminado sin pedido como grupo propio).

### 5.2 Puerto nuevo `InventoryImportRepository`

```ts
// lib/modules/inventario/ports/inventory-import-repository.ts — todas con `scope` al final (QC-49)
export interface InventoryImportRepository {
  findAliveProductsByNormalizedNames(names: readonly string[], scope: InventoryScope): Promise<readonly ImportProductRef[]>;
  findAliveFinishedProducts(pairs: readonly { recipeId: string; presentationId: string }[], scope: InventoryScope): Promise<readonly ImportProductRef[]>;
  findBatchesByLots(lots: readonly string[], scope: InventoryScope): Promise<readonly { lot: string; productId: string }[]>;
  claimImport(input: { importKey: string; fileName: string; fileSha256: string; createdBy: string; now: Date }, scope: InventoryScope):
    Promise<{ kind: 'claimed'; importId: string } | { kind: 'already'; importId: string; importedAt: Date }>;
  finishImport(importId: string, totals: ImportResultTotals, now: Date, scope: InventoryScope): Promise<void>;
  receiveImportedFinishedGoods(input: ImportedFinishedGoods, now: Date, scope: InventoryScope):
    Promise<{ kind: 'received'; productId: string; lot: string; created: boolean } | { kind: 'presentation_without_content' } | { kind: 'duplicate_lot' }>;
}
export type ImportProductRef = {
  readonly id: string; readonly nameNormalized: string; readonly type: ProductType;
  readonly unitId: string | null; readonly presentationId: string | null; readonly recipeId: string | null;
};
```

Adaptador: `adapters/driven/persistence/inventory-import-prisma.ts`. `receiveImportedFinishedGoods`
reutiliza los ayudantes de `product-prisma.ts` que ya usa `receiveFinishedGoods` (`resolveLot`,
`toBatchCreateData`, `writeMovement`, `recalculateProductStock`, `normalizeProductName`): se exportan
desde allí sin cambiar su cuerpo (driven → driven del mismo módulo, permitido por la nota QC-9).

## 6. Pantalla

`app/(private)/inventario/importar/page.tsx` — Server Component:
`await requirePagePermission('inventario.modificar')` en la primera línea (R2; 404 si falta),
`export const maxDuration = 300` (sección 7), pide `listUnitsAction()` para los diálogos y pinta
`<InventoryImportScreen units=… />`. Enlace «Importar» en la cabecera de `/inventario`, solo si la
sesión trae `inventario.modificar` (el corte real sigue en la página y en el service).

Componentes de ruta en `app/(private)/inventario/importar/components/` con barrel `index.ts`:

| Componente | Hace |
| --- | --- |
| `inventory-import-screen.tsx` (`'use client'`) | Máquina de estados `idle → previewing → preview → confirming → result`; guarda el `File` y la `importKey` en estado |
| `import-upload-field.tsx` | Reutiliza `components/shared/file-field.tsx`; `accept=INVENTORY_IMPORT_ACCEPT`; avisa antes de enviar si pasa de `INVENTORY_IMPORT_MAX_FILE_BYTES` (el servidor manda igual) |
| `import-template-button.tsx` | `buildInventoryImportTemplate()` → `Blob` → descarga |
| `import-file-rejection.tsx` | Texto por `ImportFileRejection.code`, nombrando columnas y cuentas |
| `import-preview-summary.tsx` | Totales por estado, aviso de fila de ejemplo ignorada |
| `import-preview-table.tsx` | Filas con estado, nombre resultante y motivos; filtro por estado; usa la tabla compartida |
| `import-missing-catalog.tsx` | Faltantes de unidad y de presentación con sus filas y botón «Crear» (oculto sin permiso) |
| `import-create-unit-dialog.tsx` | Campos del alta de unidad (nombre, símbolo, unidad base + factor) → `createUnitAction` |
| `import-create-presentation-dialog.tsx` | Nombre, unidad (`components/shared/presentation-unit-select.tsx`), contenido → `createPresentationAction` |
| `import-result-summary.tsx` | Resultado por fila y totales; `already_imported`; botón de archivo de errores |
| `download-file.ts` | `ImportDownload` → `Blob` + `<a download>` |

Multiplataforma (`docs/architecture.md > Regla: multiplataforma`): `<input type="file">` abre el
selector de Archivos en iOS y Android; la tabla va con desplazamiento horizontal propio y columnas
mínimas en móvil (fila, estado, nombre, motivo); botones de 44×44; nada por `:hover`. **Riesgo
declarado**: la descarga por `Blob` + `download` funciona en Safari iOS ≥ 13 y Chrome Android, pero
en un WebView embebido depende de la app anfitriona; no se puede verificar desde el repo. No se
declara excepción de escritorio.

## 7. Rendimiento y límites

- **Vista previa**: 5 lecturas en lote + planificación en memoria. 2.000 filas son unos pocos
  cientos de KB: holgado.
- **Confirmación**: `createProduct` por fila son ~4-6 consultas y una transacción; más la revisión de
  pedidos bloqueados por lote (D8). 2.000 filas ≈ 10.000-12.000 consultas en serie. A 3-5 ms por
  consulta contra el pooler son 30-60 s: cabe en `maxDuration = 300` (precedente:
  `app/api/documentos/trabajos/route.ts`). **No medido**: T-B8 lo mide con 2.000 filas en la base de
  integración y lo anota en `progress/impl_*.md`. Si pasa de 120 s, se para y se pregunta.
- **Revisión de pedidos bloqueados por lote**: D8 la pide por cada lote. Con pedidos bloqueados en la
  empresa, son 2.000 revisiones. Se respeta D8; la alternativa (una sola al final) está descartada
  abajo.
- **Cuerpo de la Server Action**: Next limita el cuerpo de una Server Action a 1 MB por defecto
  (`next.config.ts` no lo cambia). De ahí DS-5.

## 8. Concurrencia (riesgo con QC-205)

- **Nombre + unidad entre dos importaciones simultáneas** (o importación + alta manual): las dos
  pueden planificar `crear` para la misma identidad y crear dos productos homónimos. Es la misma
  carrera que ya tiene el alta manual: `createProduct` busca el homónimo y crea sin índice único que
  lo impida. **Está fuera de alcance (QC-205)**; la importación la hace más probable por volumen,
  no la crea. Si QC-205 entra con un índice único, la fila perdedora caerá en `write_failed` hasta
  que esta feature traduzca el nuevo error: anotarlo en QC-205.
- **Lote**: la unicidad `(company_id, lot)` sí está en la base (`product_batches_company_lot_unique`).
  Una carrera acaba en `batch_duplicate_lot` y la fila en `duplicate` / `lot_used_by_other_product`
  (R18, R19, R27). Cerrada.
- **Doble confirmación**: `inventory_imports_company_key_unique` (R29). Cerrada.
- **Terminado**: `ON CONFLICT (company_id, recipe_id, presentation_id)` igual que `receiveFinishedGoods`.
  Cerrada.

## 9. Decisiones que salen para aprobación humana

| # | Propuesta | Por qué |
| --- | --- | --- |
| **DS-1** | **Producto terminado.** (a) La fila **declara su presentación** en «Presentación», obligatoria: el terminado es uno por fórmula + presentación (índice parcial y `receiveFinishedGoods`), así que si la fórmula se envasa en varias presentaciones cada una es una fila; no se elige ninguna por defecto. (b) Solo **fórmulas originales vivas** (`findAliveByNormalizedName`); una versión no se importa. (c) «Nombre» va vacío: el nombre es el derivado `«Fórmula · Presentación»`, el mismo que pone el empaque. (d) «Existencia» = **número de envases**, entero > 0; la cantidad del lote es envases × contenido de la presentación (`planFinishedGoodsLine`), y `package_content` = ese contenido. Presentación sin contenido → `presentation_without_content`. (e) **Costo**: «Costo unitario» en la unidad de la presentación (lo que guarda `unit_cost` en los lotes de terminado, `order-packing.ts > unitCostByPresentationUnit`), o «Costo total» del lote, del que se deriva el unitario con `deriveUnitCost(total, cantidad)`. Uno de los dos obligatorio (CHECK `package_content_requires_unit_cost`). Vencimiento opcional. | Es la regla nueva de D4 y la pregunta abierta 1. (d) y (e) mantienen el lote importado indistinguible de uno de empaque. El coste por unidad pequeña redondea (riesgo QC-178): con «Costo total» el redondeo es a 4 decimales del unitario, el mismo que ya acepta QC-170. |
| **DS-2** | **Números y fechas del .csv.** Separador de campo: `;` o `,`, el que aparezca en la cabecera fuera de comillas (si aparecen los dos, `;`). Decimal: **coma o punto**, uno solo, **sin separador de miles** (`1234,5` y `1234.5` valen; `1.234,5` y `1,234.5` → `number_format_invalid`). Con separador `,`, un decimal con coma va entre comillas (lo hace Excel solo). Fechas: `AAAA-MM-DD` o `DD/MM/AAAA` (día primero, nunca mes primero). En .xlsx, números y fechas nativos (sección 4.1); una fecha escrita como texto sigue las mismas formas. | Pregunta abierta 2. Excel en español exporta con `;` y coma decimal; otras configuraciones con `,` y punto. Rechazar los miles evita que `1.234` se lea como mil doscientos o como uno coma dos según quién lo escribió. |
| **DS-3** | **Librerías: `read-excel-file` para .xlsx y `papaparse` para .csv** (leer y escribir). `read-excel-file/node` solo en el adaptador `xlsx-reader.ts`. `papaparse` lee en `csv-reader.ts` (`Papa.parse` sobre el texto ya decodificado, sin `worker` ni descarga) y escribe en `inventory-import-downloads.ts` (`Papa.unparse`). Ver 9.1. **Enmienda F1.4 (2026-10-06, humano):** se descarta el lector CSV propio; «más adelante se agregará la opción de descargar también en csv o excel directamente», así que el CSV va por librería desde ya. | `papaparse` es JS puro, sin dependencias y sin APIs de Node ni de DOM en `parse`/`unparse` sobre `string`, así que entra en `PURE_PACKAGES` (`tests/guards/guard-arquitectura-modulos.test.ts`) y en la lista de `docs/architecture.md > Dominio` junto a `zod`: el dominio la usa para escribir la plantilla y el archivo de errores sin cambiar el contrato de 1.5. La futura descarga en .xlsx (`write-excel-file`, fuera de esta ficha) **no** es pura y no entra al dominio. |
| **DS-4** | **Plantilla y archivo de errores en .csv** (UTF-8 con BOM, separador `;`), generados en el cliente con `Papa.unparse`. | La descarga en .xlsx queda para una ficha posterior (pedido del humano en F1.4) con `write-excel-file`; aquí no se instala. El .csv con BOM y `;` lo abre Excel en español en columnas. |
| **DS-5** | **Tope de 1.000.000 bytes por archivo**, sin tocar `next.config.ts`. | 2.000 filas × 12 columnas caben con mucha holgura (~300 KB en .csv, menos en .xlsx), y así no se cambia el límite global de las Server Actions de toda la app. |
| **DS-6** | **Idempotencia con `inventory_imports` + `importKey`** (R29, R30). | `docs/architecture.md > Dominio` n.º 3: toda operación que mueve existencias es idempotente y auditable. Sin esto, un doble clic o un reintento de red crea lotes repetidos (los de lote vacío reciben correlativos nuevos y no se ven como duplicado). Coste: una tabla y su migración. Límite aceptado: si la primera confirmación muere a mitad, la clave queda gastada y lo escrito se queda (D1); el usuario reintenta con un archivo nuevo y las filas con lote salen `duplicado`. |
| **DS-7** | **Columnas desconocidas o repetidas rechazan el archivo** (R5). Columnas opcionales ausentes = vacías. Una columna que no aplica al tipo y trae valor → `error` de fila (R11), no se ignora. | Una errata en una cabecera opcional («Costo unitarios») se ignoraría en silencio y el usuario creería haber cargado costos. Mismo criterio que `strictObject` en todo el módulo. |
| **DS-8** | **La fila de ejemplo se ignora si es idéntica** a `IMPORT_EXAMPLE_ROW` (R8). | D5 pide la fila de ejemplo; sin esta regla, quien no la borra importa un producto «ejemplo». |
| **DS-9** | **Revisión de pedidos bloqueados por cada lote** (D8 tal cual, vía `createProduct`). | D8 está cerrada. Se anota el coste (sección 7). |
| **DS-10** | **Unidad del insumo**: casa por nombre normalizado (`normalizeUnitName`) o, si no, por símbolo exacto (recortado), entre las unidades visibles de la empresa (propias + sistema). Más de una coincidencia → `unit_ambiguous`. | El usuario escribe «kg» o «Kilogramo»; las dos cosas existen en el catálogo. |
| **DS-11** | **El archivo de errores lleva solo las filas en `error`**, no las `duplicado`. | D1 habla de «filas con error». Una duplicada volvería a salir duplicada al resubirla. La vista previa y el resultado sí las listan. |
| **DS-12** | **`maxDuration = 300`** en la página de importación. | Sección 7. |
| **DS-13** | **Fixture .xlsx**: `tests/fixtures/inventario-importar/mixto.xlsx`, producido una vez a partir del .csv del E2E con Excel o LibreOffice (`soffice --headless --convert-to xlsx`), por el humano o por el implementer si tiene la herramienta. | La librería propuesta no escribe. Sin el fixture, `xlsx-reader.ts` solo se prueba con la librería simulada y el E2E usa .csv. |

### 9.1 Dependencias (D3, regla 7) — **aprobadas por el humano en F1.4 el 2026-10-06, sin instalar**

Checks medidos por el leader el 2026-10-06 contra `registry.npmjs.org` y `api.npmjs.org`.

| | `read-excel-file` | `papaparse` |
| --- | --- | --- |
| Qué hace | Lee la primera hoja de un .xlsx a celdas tipadas (`string`, `number`, `boolean`, `Date`). En Node: `read-excel-file/node` sobre `Buffer`. | Lee y escribe CSV (`Papa.parse` / `Papa.unparse`): comillas, comillas escapadas, saltos de línea entre comillas, CRLF/LF, detección de separador. |
| Qué código nos ahorra | Descomprimir el ZIP del .xlsx, `sharedStrings.xml`, `styles.xml` (qué número es fecha), `sheet1.xml` y los números de serie de fecha. Varios cientos de líneas más un lector ZIP. | El lector RFC 4180 propio (~60 líneas) y el escapado de la escritura; y la base de la futura descarga en .csv. |
| Dónde se usa | Solo `lib/modules/inventario/adapters/driven/spreadsheet/xlsx-reader.ts` (servidor). | `.../adapters/driven/spreadsheet/csv-reader.ts` (servidor) y `lib/modules/inventario/domain/inventory-import-downloads.ts` (puro, llega al cliente por el barrel). Entra en `PURE_PACKAGES`. |
| Check 1 — no `deprecated` | Sin `deprecated`. | Sin `deprecated`. |
| Check 2 — release < 12 meses | `9.3.10`, 2026-08-10. | `5.7.0`, 2026-08-24. |
| Check 3 — ≥ 10.000 descargas/semana | 3.246.357. | 19.874.585. |
| Check 4 — licencia | MIT. | MIT. |
| Descartadas | `xlsx` (SheetJS): npm parado en `0.18.5` (2022-03) → falla el check 2. `exceljs`: `4.4.0` de 2023-10 → falla el check 2. | Lector propio (DS-3 original), descartado por el humano en F1.4. |

Para la futura descarga en .xlsx (fuera de esta ficha) la candidata medida el mismo día es
`write-excel-file` `4.1.1` (2026-06-08, MIT, 1.425.721/semana, sin `deprecated`); necesita su propia
aprobación cuando llegue esa ficha.

Filas para `docs/dependencias.md` (las añade quien instale, en B1/B3):

```
| `read-excel-file` | Leer la primera hoja de un .xlsx en la importación de inventario (QC-209), solo en el adaptador `inventario/adapters/driven/spreadsheet/xlsx-reader.ts` | aprobada | 2026-10-06 | Los cuatro checks verificados por el leader el 2026-10-06 contra npm: sin `deprecated`; última release `9.3.10` del 2026-08-10; 3.246.357 descargas semanales; licencia MIT. Aprobada por el humano en la puerta F1.4 de QC-209. |
| `papaparse` | Leer y escribir CSV en la importación de inventario (QC-209): `inventario/adapters/driven/spreadsheet/csv-reader.ts` y `inventario/domain/inventory-import-downloads.ts`; paquete puro admitido en el dominio | aprobada | 2026-10-06 | Los cuatro checks verificados por el leader el 2026-10-06 contra npm: sin `deprecated`; última release `5.7.0` del 2026-08-24; 19.874.585 descargas semanales; licencia MIT. Aprobada por el humano en la puerta F1.4 de QC-209. |
```

`@types/papaparse` entra como `devDependency` junto a `papaparse` (tipos de la misma librería, no
es código que se ejecute).

## 10. Alternativas descartadas

1. **Guardar el archivo leído entre vista previa y confirmación** (tabla de borrador o Storage,
   con un id que la confirmación cita). Descartada: obliga a limpiar borradores, a decidir su
   caducidad y a una segunda tabla con datos de usuario. Volver a mandar el archivo cuesta un segundo
   parseo de unos cientos de KB y además hace cierto R25 sin esfuerzo: la confirmación siempre
   valida contra la base de ahora.
2. **Una sola transacción para toda la importación.** Descartada: contradice D1 (un fallo deshace
   todo) y mantendría bloqueos de fila durante decenas de segundos sobre productos que el resto de
   la empresa está usando.
3. **Insert masivo propio en vez de `createProduct` por fila.** Descartada: sería una segunda
   implementación de las reglas del alta manual (identidad, homónimo terminado, correlativo,
   asiento, aviso) que habría que mantener de acuerdo con la primera. D8 pide las mismas reglas; la
   única forma robusta es el mismo código. Se paga en latencia (sección 7).
4. **Acciones nuevas para crear unidad y presentación desde la vista previa.** Descartada: D2 pide
   «los mismos datos y reglas que su alta normal»; las acciones normales ya lo son. Una acción nueva
   sería una tercera puerta al mismo caso de uso.
5. **Módulo propio (`importaciones`) o dentro de `documentos`.** Descartada: tendría que pedir a
   `inventario` por interfaz un alta masiva que hoy no existe, y `documentos` es el módulo de PDF e
   IA (su revisión de fórmula es el precedente de forma —vista previa → confirmación, borde zod
   antes del actor— que sí se copia).
6. **Leer el .xlsx en el navegador.** Descartada: mete la librería en el bundle de cliente y la
   validación tiene que ser del servidor igual.
7. **Una sola revisión de pedidos bloqueados al final de la importación.** Más barata y daría
   prioridad limpia a los pedidos, pero D8 está cerrada en «por cada lote». Si el coste medido
   (sección 7) no cabe, se lleva al humano como cambio de D8, no se decide aquí.
8. **Rechazo de archivo como `ErrorState` con códigos nuevos** (`import_missing_columns`…).
   Descartada: `ErrorState` es cerrado y su mensaje sale del catálogo, así que no puede nombrar la
   columna que falta (D5). El rechazo viaja como dato (`ImportFileRejection`) y el catálogo de
   errores no se toca.

## 11. Plan de pruebas (R → test)

| R | Test | Tipo |
| --- | --- | --- |
| R1 | `tests/unit/inventario/preview-inventory-import.test.ts` («R1 rechaza sin permiso antes de leer el archivo»: espía del lector y del repo sin llamadas); ídem en `confirm-inventory-import.test.ts` | unit |
| R2 | `tests/unit/inventario/importar/importar-page.test.tsx` (404 sin `inventario.modificar`) | ui |
| R3 | `tests/unit/inventario/inventory-import-downloads.test.ts` (cabecera exacta y orden, una fila de ejemplo) | unit |
| R4 | `tests/unit/inventario/spreadsheet-format.test.ts`; `tests/unit/inventario/csv-reader.test.ts`; `tests/integration/inventario/xlsx-reader.test.ts` (fixture DS-13) | unit/integration |
| R5 | `tests/unit/inventario/import-header.test.ts` | unit |
| R6 | `tests/unit/inventario/import-sheet-limits.test.ts` (2.000 sí, 2.001 no; bytes; vacío; filas en blanco no cuentan) | unit |
| R7 | `tests/integration/inventario/inventory-import-confirm.test.ts` (al volver la acción, todo escrito; ninguna cola ni job) | integration |
| R8 | `tests/unit/inventario/import-sheet-limits.test.ts` (fila de ejemplo) | unit |
| R9-R11, R14-R20 | `tests/unit/inventario/plan-inventory-import.test.ts` (un caso por requisito, nombrado `R<n> …`) | unit |
| R12, R13 | `tests/unit/inventario/import-cell-parsing.test.ts` | unit |
| R16 (escritura) | `tests/integration/inventario/inventory-import-finished-goods.test.ts` | integration |
| R21, R22 | `tests/unit/inventario/importar/import-missing-catalog.test.tsx` (llama a las acciones normales; sin permiso no ofrece botón); los tests existentes de `createUnit`/`createPresentation` cubren el permiso del service; `plan-inventory-import.test.ts` («R22 la planificación nunca pide crear») | ui/unit |
| R23 | `tests/unit/inventario/importar/inventory-import-screen.test.tsx` (tras `success` vuelve a llamar a la vista previa con el mismo `File`) | ui |
| R24-R27 | `tests/unit/inventario/confirm-inventory-import.test.ts`; `tests/integration/inventario/inventory-import-confirm.test.ts` (lotes, asiento `opening`, existencia, aviso de pedidos bloqueados, fila que falla no deshace las otras) | unit/integration |
| R28 | `tests/unit/inventario/inventory-import-downloads.test.ts` (columnas, motivo, solo `error`, se vuelve a leer sin rechazo de cabecera) | unit |
| R29, R30 | `tests/integration/inventario/inventory-import-idempotency.test.ts` | integration |
| R31 | `tests/integration/inventario/inventory-import-isolation.test.ts` (homónimos, lotes, presentaciones y fórmulas de otra empresa no casan; escritura solo en la propia) | integration |
| R32 | `tests/unit/inventario/inventory-import-contract.test-d.ts` + `tests/unit/inventario/inventory-import-actions.test.ts` | type/unit |
| R33 | `e2e/inventario-importar.spec.ts` | e2e |
