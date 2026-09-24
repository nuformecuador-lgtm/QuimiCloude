# QC-158 — catalogo-desde-pdf · tasks.md

> Orden de arriba abajo salvo `[P]` (paralelizable con las indicadas). Cada task dice qué archivos
> toca y su criterio de **hecho**. Cada tanda cierra con `./init.sh --rapido`; la feature y el PR,
> con `./init.sh` completo. Comentarios de producción sin citas a fichas, requisitos ni `design.md`;
> `R<n>` va en el nombre de los tests.
>
> **Sin bloqueos por F1.4.** El 2026-09-23 el humano aprobó el spec y cerró las siete preguntas con
> las propuestas de `design.md > 10` (`[F1]`…`[F7]` en `requirements.md`). T3, T4, T5, T6, T10, T11,
> T12 y T14 quedan desbloqueadas; cada una cita la decisión que implementa.
>
> **Base de datos.** Toda migración, rollback y E2E de esta rama corre contra **`QuimiCloude_QC158`**,
> a la que apunta el `.env` del worktree. Nunca contra la compartida `QuimiCloude`.

---

## [x] T0 — Medir antes de escribir

Archivos: `progress/impl_QC-158-catalogo-desde-pdf.md` (bitácora, nueva), `.env` del worktree (no
versionado).

- Crear `QuimiCloude_QC158`, apuntar `DATABASE_URL`/`DIRECT_URL` del worktree a ella, `db:migrate` y
  `db:seed`.
- Correr `pnpm run e2e -- documentos` en Chromium y anotar si termina en `done` o en `error`
  (`design.md > 0`, hipótesis: el recorte recibe el texto de guion y falla con `invalid_input`).
- Anotar la última migración de `dev` para fijar el prefijo de T2.

**Hecho cuando:** la bitácora tiene la base creada, el resultado del E2E con el motivo que imprime el
servidor y el prefijo elegido.

## [x] T1 — Extraer el JSON de un texto, compartido `[P con T2, T7]`

Archivos: `lib/modules/documentos/domain/json-in-text.ts` (nuevo),
`lib/modules/documentos/domain/crop-coordinates.ts`, `tests/unit/documentos/json-in-text.test.ts`.

- Mover «quitar cercas + primer `{` a último `}`» a `extractJsonObject(text): string | null`;
  `crop-coordinates.ts` la usa sin cambiar comportamiento.

**Hecho cuando:** `json-in-text.test.ts` verde (cercas, prosa alrededor, sin llaves, llaves
invertidas) y `crop-coordinates.test.ts` **sin cambios** y verde.

## [x] T2 — Migración `material` y `measurements` `[P con T1, T7]`

Archivos: `db/migrations/<ts>_supplier_catalog_line_material_and_measurements/{migration.sql,down.sql}`,
`db/schema.prisma` (`SupplierCatalogLine`), `tests/guards/guard-identificador-de-request.test.ts`
(`MIGRACIONES_ESPERADAS`), `tests/unit/proveedores/schema/material-measurements-migration.test.ts`,
`tests/integration/proveedores/material-measurements-migration.int.test.ts`.

- SQL de `design.md > 2.1`, escrito a mano. `pnpm exec prisma generate`.

**Hecho cuando:** `db:migrate` y `db:rollback` sobre `QuimiCloude_QC158` funcionan y reaplican
limpio (salida en la bitácora); test estático de que `down.sql` revierte exactamente las 2 columnas y
2 CHECK (**R30**); integración: `material = '  '` y `measurements = '[]'` rechazados, `NULL` y
objeto aceptados (**R27**); `guard-empresa-en-esquema` y `guard-rls-force` verdes.

## [x] T3 — Esquema de los campos nuevos en `proveedores` `[depende de T2]` `[F2]`

Archivos: `lib/modules/proveedores/domain/{catalog-line-input,catalog-line-view,create-catalog-line,update-catalog-line}.ts`,
`lib/modules/proveedores/index.ts`,
`lib/modules/proveedores/adapters/driven/persistence/{supplier-catalog-line-prisma,list-query-sql}.ts`,
`tests/unit/proveedores/catalog-line-input.test.ts`, tests del adaptador.

- `materialSchema` y `measurementsSchema` (`design.md > 2.2`), `catalogLineFieldsShape` a nueve
  campos, normalización «en blanco/todo vacío ⇒ `null`», lectura y escritura en el adaptador.

**Hecho cuando:** unit verdes para **R27** y **R35** (valor numérico rechazado, `0` rechazado, `mm|cm`
únicos, boca ≤ 40, material ≤ 120); alta y edición existentes siguen verdes; el listado devuelve los
dos campos.

## [x] T4 — Importación por identidad en `proveedores` `[depende de T3]` `[F7]`

Archivos: `lib/modules/proveedores/ports/supplier-catalog-import-repository.ts` (nuevo),
`lib/modules/proveedores/adapters/driven/persistence/supplier-catalog-import-prisma.ts` (nuevo),
`lib/modules/proveedores/domain/{find-catalog-lines-by-identity,import-catalog-lines}.ts` (nuevos),
`lib/modules/proveedores/index.ts`, `tests/unit/proveedores/import-catalog-lines.test.ts`,
`tests/integration/proveedores/catalog-import-upsert.int.test.ts`.

- `INSERT … ON CONFLICT … WHERE deleted_at IS NULL DO UPDATE SET cost … WHERE cost IS DISTINCT FROM`
  en una transacción con `FOR SHARE` del proveedor (`design.md > 8`).
- Permiso `proveedores.modificar` como primera línea de los dos casos de uso.

**Hecho cuando:** integración verde para **R15** (solo `cost`, `updated_by`, `updated_at` cambian;
nombre, unidad, mínimo, plazo, imagen, material y medidas intactos), **R15** «mismo costo no
escribe» (`updated_at` igual), **R16**, **R21** (fallo forzado en la fila 3 de 5 no deja ninguna),
**R22** (dos confirmaciones simultáneas por dos conexiones: sin duplicados) y **R4/R34** (proveedor de
otra empresa o dado de baja ⇒ `supplier_not_found`, nada escrito); `proveedores/scope.test.ts` verde
(el módulo sigue sin nombrar `inventario`).

## [x] T5 — Interpretar el texto de la IA `[depende de T1]` `[F4]`

Archivos: `lib/modules/documentos/domain/catalog-extraction.ts` (nuevo),
`tests/unit/documentos/catalog-extraction.test.ts`.

- `design.md > 3.1`, pasos 1-7.

**Hecho cuando:** unit verdes para **R5** (cercas, prosa, `lines: null`, `lines` ausente, clave
desconocida, tipo erróneo en un campo deja la línea con ese campo nulo, elemento no objeto
descartado), **R6** (sin objeto, JSON roto, `lines` string ⇒ `ValidationError`), **R35** (`cost:
1250.5` numérico ⇒ `null`) y **R7** (la función no escribe: es pura, sin dependencias).

## [x] T6 — Clasificar, sugerir unidad y emparejar imagen `[depende de T3, T5]` `[F1]` `[F3]`

Archivos: `lib/modules/documentos/domain/{classify-catalog-import,suggest-unit,crop-pairing}.ts`
(nuevos), `lib/modules/documentos/domain/document-path.ts` (`isCropPathOf`),
`tests/unit/documentos/{classify-catalog-import,suggest-unit,crop-pairing,crop-path}.test.ts`.

- Funciones puras de `design.md > 4`, `> 5.5` y `> 10.3`; reutilizan los esquemas por campo de
  `proveedores` y `inventario` desde sus barrels.

**Hecho cuando:** unit verdes para **R9** (las cinco clases, incluido «cambia» con `12.5` frente a
`12.5000` = «sin cambios»), **R19** (cero, una y dos coincidencias por nombre/símbolo), **R25**
(página con 2 filas y 2 recortes empareja; 2 y 3 no; huecos `1-1`,`1-3` en orden de `n`) y **R26**
(`isCropPathOf` rechaza otra empresa, otro archivo, `..` y extensión distinta).

## [x] T7 — Presentaciones por nombre en `inventario` `[P con T1, T2]`

Archivos: `lib/modules/inventario/domain/presentation-catalog.ts`,
`lib/modules/inventario/adapters/driven/persistence/presentation-catalog-prisma.ts`,
`lib/composition/index.ts` (`presentationCatalog`),
`tests/integration/inventario/presentation-catalog-by-name.int.test.ts`.

**Hecho cuando:** integración verde: devuelve las de la empresa por `name_normalized`, ignora las de
otra empresa (**R34**), con lista vacía no consulta; los consumidores actuales de `findRefs` siguen
verdes.

## [x] T8 — Lectura del archivo y de sus recortes en `documentos` `[depende de T6]`

Archivos: `lib/modules/documentos/ports/{document-batch-repository,crop-catalog}.ts`,
`lib/modules/documentos/adapters/driven/persistence/document-batch-repository-prisma.ts`
(`readFileForReview`), `lib/modules/documentos/adapters/driven/storage/crop-catalog-supabase.ts`
(nuevo), `tests/unit/documentos/{crop-catalog-supabase,document-batch-repository-prisma}.test.ts`,
`tests/unit/documentos/ports-shape.test.ts` si fija los puertos.

- `CropStorage` **no se toca**.
- Medir el tope de 1 MB de la Server Action con el catálogo de muestra de QC-129 (`design.md > 8`) y
  anotarlo.

**Hecho cuando:** unit verdes (listado por prefijo `<empresa>/<archivo>/`, firma con
`READ_LINK_TTL_SECONDS`, error envuelto sin secretos); `readFileForReview` devuelve `null` para otra
empresa (**R3**); la medida del tamaño está en la bitácora y, si no cabe, se ha parado a preguntar.

## [x] T9 — Caso de uso de vista previa `[depende de T4, T6, T7, T8]`

Archivos: `lib/modules/documentos/domain/preview-catalog-import.ts` (nuevo),
`lib/modules/documentos/domain/catalog-import-input.ts` (esquema zod del borde),
`lib/modules/documentos/index.ts`, `tests/unit/documentos/preview-catalog-import.test.ts`,
`tests/unit/documentos/module-contract.test.ts`.

**Hecho cuando:** unit con dobles verdes para **R3** (cuatro casos, mismo error), **R4**, **R8**
(ningún puerto de escritura invocado: los dobles de escritura fallan si se les llama), **R10** (con
`lines` editadas reclasifica) y **R31** (sin permiso: ningún puerto tocado; el orden de llamadas se
registra).

## [x] T10 — Caso de uso de confirmación `[depende de T9]` `[F1]` `[F6]`

Archivos: `lib/modules/documentos/domain/confirm-catalog-import.ts` (nuevo),
`lib/modules/documentos/index.ts`, `tests/unit/documentos/{confirm-catalog-import,catalog-import-authorization}.test.ts`,
`tests/integration/documentos/catalog-import-isolation.int.test.ts`.

**Hecho cuando:** unit verdes para **R13**, **R14** (clasificación enviada por el cliente ignorada),
**R17** (una presentación creada aunque la usen tres filas; `presentation_duplicate_name` concurrente
⇒ se reutiliza), **R18**, **R20**, **R26**, **R31** y **R33** (sin `inventario.modificar` y con
presentación nueva ⇒ `unauthorized` antes de escribir nada); integración para **R21** (presentación
creada queda, segunda confirmación la reutiliza), **R22** y **R34** (archivo, recortes, proveedor y
unidad de otra empresa).

## [x] T11 — Material y medidas en la pantalla del catálogo `[depende de T3]` `[P con T8-T10]` `[F2]`

Archivos: `app/(private)/proveedores/[id]/components/{catalog-line-form,catalog-columns,catalog-columns-skeleton}.tsx|ts`,
`lib/modules/proveedores/adapters/driving/supplier-catalog-actions.ts`,
`tests/unit/proveedores-ui/{catalog-line-form,catalog-line-sheet}.test.tsx`,
`tests/unit/proveedores/supplier-actions.test.ts` (o el de las acciones del catálogo).

- `imagePath` como campo oculto precargado (`design.md > 6.4`).

**Hecho cuando:** tests verdes para **R28** (se ven y se escriben en alta y edición) y **R29** (editar
solo el costo de una línea con imagen, material y medidas los conserva); inputs ≥ 16 px.

## T12 — Pantalla de revisión y sus acciones `[depende de T9, T10]` `[F1]` `[F3]` `[F5]`

Archivos: `lib/shared/routes.ts` (`supplierCatalogImportRoute`),
`lib/modules/documentos/adapters/driving/catalog-import-actions.ts` (nuevo),
`app/(private)/proveedores/[id]/importar/[documentoId]/page.tsx` y `components/{index,catalog-import-review,catalog-import-row,crop-picker,new-presentation-units,catalog-import-summary}.tsx|ts`,
`tests/guards/guard-pantallas-exigen-permiso.test.ts` (de trece a catorce),
`tests/unit/identity/session-once-per-request-actions.test.ts` (alta),
`tests/unit/proveedores-ui/{catalog-import-review,catalog-import-page}.test.tsx`.

**Hecho cuando:** tests verdes para **R8**, **R9** (etiquetas y costo viejo/nuevo), **R10**
(Confirmar deshabilitado mientras reclasifica), **R11**, **R12**, **R19** (preselección), **R23**
(resumen y vuelta al detalle), **R24** (quitar y cambiar recorte), **R32** (404 sin cualquiera de los
dos permisos) y **R37** (clases de 44 px y 16 px; ninguna acción solo con `hover:`);
`proveedores/scope.test.ts` verde (todo bajo la carpeta de la pantalla).

## [x] T13 — Acceso «Revisar» desde el componente de carga `[depende de T12]`

Archivos: `components/shared/document-upload/{document-upload,document-upload-row,labels}.tsx|ts`,
`app/(private)/proveedores/[id]/components/{catalog-pdf-upload,index}.tsx|ts`,
`app/(private)/proveedores/[id]/page.tsx`,
`tests/unit/documentos-ui/document-upload-review-link.test.tsx`,
`tests/unit/proveedores-ui/catalog-pdf-upload.test.tsx`.

**Hecho cuando:** tests verdes para **R1** (enlace solo en `done` y solo con la prop) y **R2**
(`formula` sin enlace); los tests existentes de `documentos-ui` siguen verdes sin cambios;
`proveedores/scope.test.ts` verde (`components/` sin archivos que casen `proveedor|supplier`).

## [x] T14 — Cableado y dobles E2E `[depende de T8, T10]` `[F4]`

Archivos: `lib/composition/index.ts` (fachada `documentos`: `previewCatalogImport`,
`confirmCatalogImport`, `CropCatalog`; `cropStorage` con doble; fachada `proveedores`: los dos casos
nuevos), `lib/modules/documentos/adapters/driven/ai/ai-reader-canned.ts`,
`lib/modules/documentos/adapters/driven/storage/{crop-storage-memory,crop-catalog-memory}.ts` (nuevos),
`tests/guards/guard-dobles-e2e.test.ts` (lista `DOBLES`),
`tests/unit/documentos/ai-reader-canned.test.ts`.

**Hecho cuando:** `guard-dobles-e2e`, `guard-arquitectura-modulos` (sin driven fuera de composición,
`documentos` solo importa barrels de otros módulos) verdes; el doble de IA devuelve coordenadas con el
prompt de recorte y JSON de catálogo con cualquier otro, y los dos textos se parsean enteros.

## T15 — E2E `[depende de T11-T14]`

Archivos: `e2e/catalogo-desde-pdf.spec.ts` (nuevo),
`tests/guards/guard-identificador-de-request.test.ts` (lista de E2E),
`tests/unit/shared/data-table-alcance.test.ts` (solo si el spec referencia la tabla).

- Recorrido de **R38** (`design.md > 9`), fixture `qc158_e2e_` + `RUN_ID`, limpieza en `afterAll`
  por nombres exactos, intercepción de subidas y de las URL firmadas de recortes.
- Volver a correr `documentos.spec.ts`.

**Hecho cuando:** `pnpm run e2e -- catalogo-desde-pdf` y `-- documentos` verdes en Chromium y WebKit
sobre `QuimiCloude_QC158`, **una E2E a la vez en la máquina**; `guard-e2e-landing` verde.

## T16 — Alcance y limpieza `[depende de T15]`

Archivos: `tests/unit/documentos/qc158-alcance.test.ts` (nuevo).

**Hecho cuando:** verde para **R36** (`design.md > 15`), sin archivos de `package.json` ni
`pnpm-lock.yaml` en el diff (sin dependencias nuevas), y el barrido del diff no encuentra `QC-`,
`R<n>`, `T<n>` ni `design.md` en comentarios de producción (comandos en la bitácora).

## T17 — Enmiendas documentales, trazabilidad y gate `[depende de T1-T16]`

Archivos: `specs/QC-129-textos-definitivos-de-los-prompts/requirements.md` (**nota fechada** al pie:
R10 pasa de seis a ocho datos más `page`, por QC-158, sin reescribir el original — precedente de la
nota de QC-129 sobre QC-109), `progress/impl_QC-158-catalogo-desde-pdf.md` (mapa R1–R38 → test).

**Hecho cuando:** los 38 requisitos tienen test en el mapa; `./init.sh` completo verde con los rojos
heredados de `dev`, si los hay, declarados; el humano tiene el aviso de ajustar el borrador de
QC-131 a `design.md > 3`.
