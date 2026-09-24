# QC-160 — boton-de-subida-de-pdf · tasks.md

> Worktree `.worktrees/QC-160-boton-de-subida-de-pdf`, rama `feature/QC-160-boton-de-subida-de-pdf`.
> Un commit por task (`feat(QC-160): …` / `test(QC-160): …` / `chore(QC-160): …`).

## Reglas de ejecución (valen para todas las tasks)

- **Base propia.** Los tests que tocan Postgres y el E2E corren contra una base propia
  **`QuimiCloude_QC160`**, montada para este worktree (`docs/worktrees.md`), con las migraciones de
  `dev` aplicadas (incluida la de QC-142) y `pnpm run db:seed` ejecutado. **Nunca** contra la base del
  `.env` de la raíz. Antes de correr nada que toque Postgres, comprueba que `DATABASE_URL` y
  `DIRECT_URL` del entorno del proceso nombran `QuimiCloude_QC160`.
- **Un solo E2E a la vez en la máquina.** Antes de `pnpm run e2e`, comprueba que ningún otro worktree
  tiene Playwright o el `next dev` de E2E (puerto 3117) en marcha. Si lo hay, espera. Nunca dos a la vez.
- **Comentarios.** En producción (`app/`, `lib/`, `components/`) ningún comentario cita ficha,
  `R<n>`, `D<n>`, `design.md` ni «decisión cerrada». Los bloques no pasan de unas 5 líneas y solo se
  limpian las líneas que toca la rama. En tests, `R<n>` va en el nombre del caso.
- **Inputs.** Todo input de texto nuevo lleva `text-base md:text-base`. No se espera ninguno.
- **Sin dependencias nuevas.** No se ejecuta `pnpm add` ni `npx shadcn add`.
- **El componente de QC-107 no se toca:** `document-upload.tsx`, `document-upload-row.tsx`,
  `upload-file.ts` y `use-batch-status.ts` quedan con diff vacío (R9).
- Cierre de tanda: `./init.sh --rapido`. Cierre de feature y antes del PR: `./init.sh` completo.

## Tasks

### T0 — Precondiciones: QC-142 en `dev` y choque con QC-158 revisado

- [x] **QC-142 está en `dev`**: `git log origin/dev` contiene su merge, y en `origin/dev`
  `lib/modules/documentos/domain/actor.ts` declara
  `DOCUMENT_UPLOAD_PERMISSION: PermissionCode = 'documentos.modificar'` y `PERMISSIONS` contiene
  `documentos.modificar`. **Si no está, no se empieza**: se para y se avisa al leader.
- [x] Traer `dev` a esta rama (`git merge origin/dev`) y confirmar que los cuatro puntos de
  `design.md > 2` se cumplen tal cual. Si alguno cambió, se para y se vuelve al spec.
- [x] Comprobar si `tests/unit/documentos-ui/document-upload-convenciones.test.ts` está verde en `dev`.
  Lo normal es que sí: el arreglo de la línea del catálogo con `/documento/i` es del implementer de
  QC-142. **Solo si sigue en rojo** se anota para T6 (riesgo 13.2).
- [x] **Choque con QC-158 (D9)** — coincidía: QC-158 cambió el montaje de `page.tsx` (`CatalogPdfUpload`). Resuelto el 2026-09-24 por el leader con la opción A (notas en `design.md > 3.1` y `6.1`).: al sincronizar con `dev`, comparar los archivos que QC-158 ha
  cambiado (en `dev` o en su rama) con los de esta ficha: `app/(private)/proveedores/[id]/page.tsx`,
  `tests/unit/documentos-ui/supplier-detail-upload.test.tsx`, `lib/modules/documentos/domain/actor.ts`,
  `lib/modules/documentos/index.ts` y `tests/unit/documentos/module-contract.test.ts`. Si alguno
  coincide, **se para antes de implementar** y se avisa al leader.
- [x] La base `QuimiCloude_QC160` existe, con migraciones aplicadas y sembrada.
- **Archivos:** ninguno.
- **Depende de:** aprobación del spec y merge de QC-142 en `dev`.
- **Hecho cuando:** todas las casillas marcadas y `./init.sh --rapido` verde sobre la rama con `dev`
  mergeado, antes de cambiar una sola línea.

### T1 — Predicado `canUploadDocuments` en el módulo `documentos`

- [x] `canUploadDocuments(actor: PermissionBearer | null | undefined): boolean` en
  `domain/actor.ts`, delegando en `assertPermission` con `DOCUMENT_UPLOAD_PERMISSION`. No lanza.
- [x] Publicarlo por el barrel del módulo.
- [x] `EXPORTACIONES_DE_EJECUCION` gana `canUploadDocuments`.
- [x] Test nuevo (R12): `true` solo con `documentos.modificar`. `false` con `proveedores.modificar`,
  `documentos.consultar`, `recetas.modificar`, `[]`, `null` y `undefined`. No lanza en ningún caso. El
  literal `'documentos.modificar'` aparece una sola vez bajo `lib/modules/documentos`.
- **Archivos:** `lib/modules/documentos/domain/actor.ts`, `lib/modules/documentos/index.ts`,
  `tests/unit/documentos/module-contract.test.ts`,
  `tests/unit/documentos/can-upload-documents.test.ts` (nuevo).
- **Depende de:** T0.
- **Hecho cuando:** los dos tests verdes, typecheck verde, y cambiar en local la constante a otro
  código pone rojo el caso `true` (sin commitear).

### T2 [P] — `keepMounted` en `DialogContent` (D8)

- [x] `DialogContent` acepta `keepMounted?: boolean` y lo reenvía a `DialogPortal`. Sin valor por
  defecto propio.
- [x] Verificar en jsdom que, con `keepMounted`, el popup cerrado no es visible para
  `not.toBeVisible()`. Si no lo es, anotar en el design cómo se afirma el estado cerrado (riesgo 13.4).
- **Archivos:** `components/ui/dialog.tsx`.
- **Depende de:** T0.
- **Hecho cuando:** los tests existentes de `adjust-batch-dialog` y `recipe-form` siguen verdes sin
  tocarlos, y typecheck verde.

### T3 — `DocumentUploadDialog` y sus textos

- [x] Componente según `design.md > 3.1`: `DialogTrigger` con `document-upload-open`, `DialogContent`
  con `document-upload-dialog`, `showCloseButton={false}`, `sm:max-w-lg max-h-[85dvh] overflow-y-auto`,
  `DialogClose` propio `document-upload-close` con `min-h-11 min-w-11`, y `DocumentUpload` dentro con la
  `strategy` recibida, y `keepMounted` (R21).
- [x] Textos en `labels.ts` (`OPEN_LABEL`, `DIALOG_TITLE`, `CLOSE_LABEL`, `dialogDescription(max)`),
  con el tope importado del contrato. Exportar el componente, su tipo de props y los test ids nuevos por
  el barrel.
- [x] Ningún archivo de la carpeta nombra `permission`, `permiso` ni `roleName`, ni escribe
  `'catalogo'` o `'formula'`.
- [x] Test nuevo con los casos de `design.md > 9.1` para R1, R2, R3, R4, R8, R13, R15, R21 y el texto
  «Subir PDFs» de R22.
- **Archivos:** `components/shared/document-upload/document-upload-dialog.tsx` (nuevo),
  `components/shared/document-upload/labels.ts`, `components/shared/document-upload/index.ts`,
  `tests/unit/documentos-ui/document-upload-dialog.test.tsx` (nuevo).
- **Depende de:** T0 y T2.
- **Hecho cuando:** test nuevo verde, los siete tests de componente de QC-107 verdes y **sin editar**, y
  `git diff origin/dev -- components/shared/document-upload/document-upload.tsx
  components/shared/document-upload/document-upload-row.tsx
  components/shared/document-upload/upload-file.ts
  components/shared/document-upload/use-batch-status.ts` vacío (R9).

### T4 [P] — Montaje en `/proveedores/[id]`

- [x] Quitar el `<DocumentUpload strategy="catalogo" />` montado a la vista.
- [x] Después de `requirePagePermission('proveedores.consultar')` y de las lecturas de siempre,
  `canUploadDocuments(await identity.getSessionUser())`. Solo en la rama de éxito, y solo si es `true`,
  `DocumentUploadDialog strategy="catalogo"` entre la cabecera y el catálogo (`design.md > 6.1`).
  `SupplierDetailHeader` no se toca.
- [x] Limpiar los comentarios de las líneas que se tocan en `page.tsx` (sin arrastrar el resto).
- [x] Reescribir los dos casos de `supplier-detail-upload.test.tsx` según `design.md > 9.2`: botón con
  permiso y encolado `catalogo` (R1, R5, R10); sin `documentos.modificar` no hay botón ni subida (R11);
  proveedor inexistente sin botón (R7); el botón va después de la cabecera y antes del catálogo (R22).
- **Archivos:** `app/(private)/proveedores/[id]/page.tsx`,
  `tests/unit/documentos-ui/supplier-detail-upload.test.tsx`.
- **Nota 2026-09-24 (D9, decisión del leader).** El montaje pasa por `CatalogPdfUpload`. T4 toca
  además `app/(private)/proveedores/[id]/components/catalog-pdf-upload.tsx`, que renderiza
  `DocumentUploadDialog strategy="catalogo" reviewHrefFor={…}`, y la página monta
  `{canUpload ? <CatalogPdfUpload … /> : null}` entre la cabecera y el catálogo. Se enmienda
  `tests/unit/proveedores-ui/catalog-pdf-upload.test.tsx` (de QC-158), con el motivo escrito en el
  test y sin baseline, para abrir la ventana antes de buscar «Revisar». Se añade un caso `R22`: «Revisar»
  sigue disponible dentro de la ventana. T3 añade `reviewHrefFor?` a `DocumentUploadDialogProps`.
- **Depende de:** T1, T3.
- **Hecho cuando:** los dos tests verdes, `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx`
  verde sin cambios (R14) y `tests/unit/identity/session-once-per-request-render.test.tsx` verde.

### T5 [P] — Montaje en el listado `/produccion/formulas`

- [x] Después de `requirePagePermission('recetas.consultar')`,
  `canUploadDocuments(await identity.getSessionUser())`. Si es `true`, `DocumentUploadDialog
  strategy="formula"` en la fila del título, junto a «Nueva fórmula» (`design.md > 6.2`). `nueva/` y
  `[id]/` no se tocan.
- [x] Test nuevo de la página (R6, R10, R11, y R22: el botón comparte fila con «Nueva fórmula») según
  `design.md > 9.1` y `9.2`.
- [x] Si `recipe-page.test.tsx` o `pantallas-exigen-permiso.test.tsx` no resuelven el import en jsdom,
  añadirles **solo** el `vi.mock` de las dos acciones de `documentos`, sin tocar ningún caso (riesgo
  13.3).
- **Archivos:** `app/(private)/produccion/formulas/page.tsx`,
  `tests/unit/documentos-ui/formulas-upload.test.tsx` (nuevo); si hiciera falta,
  `tests/unit/recetas-ui/recipe-page.test.tsx` y `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx`
  (solo mocks).
- **Depende de:** T1, T3.
- **Hecho cuando:** test nuevo verde, y `recipe-page.test.tsx` y `pantallas-exigen-permiso.test.tsx`
  verdes con sus casos intactos (R14).

### T6 — Guardias de montaje y de convenciones

- [x] En `document-upload-convenciones.test.ts`, según `design.md > 9.2`: la lista de páginas que
  montan la pieza pasa a ser exactamente la de fórmulas y la de detalle de proveedor (R7); el caso
  «ninguna pantalla de fórmulas la monta» se sustituye por «solo el listado la monta, y ninguna fuente
  de fórmulas nombra `proveedores.*`»; casos nuevos para R12 (ninguna página escribe
  `documentos.modificar`, las dos llaman a `canUploadDocuments`, la carpeta no nombra permisos) y R20
  (el manifiesto no gana dependencias, y la carpeta importa el diálogo solo de `@/components/ui/dialog`).
  Cada regla nueva, con su caso sintético que la hace fallar.
- [x] **Solo si** T0 vio en rojo en `dev` la aserción del catálogo con `/documento/i` (riesgo 13.2),
  arreglarla aquí y dejarlo escrito en `progress/impl_…`. Si está verde, no se toca: el arreglo le toca
  al implementer de QC-142.
- **Archivos:** `tests/unit/documentos-ui/document-upload-convenciones.test.ts`.
- **Nota 2026-09-24 (D9, decisión del leader).** La lista de puntos de montaje de la pieza pasa a
  ser exactamente `app/(private)/produccion/formulas/page.tsx` y
  `app/(private)/proveedores/[id]/components/catalog-pdf-upload.tsx`. «Llaman a
  `canUploadDocuments`» se afirma sobre las dos páginas (`formulas/page.tsx` y
  `proveedores/[id]/page.tsx`).
- **Depende de:** T4, T5.
- **Hecho cuando:** verde sobre el árbol real, y cada caso sintético nuevo se pone rojo.

### T7 — E2E de documentos (R16-R19)

- [x] Ajustar el caso de QC-107 (R16): comprobar que se ve el botón y la subida está oculta
  (`toBeHidden`), pulsar `document-upload-open` y seguir el recorrido. La afirmación de base de datos
  pasa a «una tanda **nueva** con estrategia `catalogo`», contando antes y después por empresa y
  estrategia.
- [x] Caso nuevo de fórmulas (R17): `goto(FORMULAS_ROUTE)`, abrir, dos PDFs
  `qc107_e2e_formula_<n>_<RUN_ID>.pdf`, esperar `done` en las dos filas, una tanda nueva `formula` con
  dos archivos `done` y dos `PUT` interceptados.
- [x] Ajustar el caso de QC-142 sin `documentos.modificar` (R18, D11):
  `document-upload-open` y `document-upload` con `toHaveCount(0)`, cero `PUT` y el mismo conteo de
  tandas antes y después. El nombre lleva `R18` y conserva la referencia a QC-142 R20.
- [x] Sin cambios en `playwright.config.ts` ni en los dobles (R19). Ningún archivo E2E nuevo.
- **Archivos:** `e2e/documentos.spec.ts`.
- **Depende de:** T4, T5.
- **Hecho cuando:** `pnpm run e2e -- documentos` verde en Chromium y WebKit contra
  `QuimiCloude_QC160` sembrada, **con un solo E2E corriendo en la máquina** y ninguna petición fuera
  del proceso salvo los `PUT` interceptados.

### T8 — Cierre

- [x] `progress/impl_QC-160-boton-de-subida-de-pdf.md` con el mapa `R<n> -> test` de
  `design.md > 12` (R1-R22, ninguno sin test).
- [ ] `./init.sh` completo en verde, con `QuimiCloude_QC160`.
- [x] `git diff --stat origin/dev...HEAD` no lista `package.json`, `pnpm-lock.yaml`,
  `docs/dependencias.md`, `db/` ni ningún archivo de `lib/modules/documentos/adapters/` (R9, R20).
- [x] Ningún comentario de producción tocado casa con
  `/QC-\d+|\bR\d+\b|\bD\d+\b|design\.md|decisi[oó]n cerrada/i`.
- **Archivos:** `progress/impl_QC-160-boton-de-subida-de-pdf.md`.
- **Depende de:** T1-T7.
- **Hecho cuando:** gate completo verde y mapa completo.

## Grafo

```
T0 ──┬── T1 ──────────┬── T4 [P] ──┬── T6
     │                │            │
     └── T2 [P] ── T3 ┴── T5 [P] ──┴── T7
T1..T7 ── T8
```

T1 y T2 van en paralelo tras T0. T4 y T5 van en paralelo tras T1 y T3: tocan archivos distintos.
T6 y T7 esperan a los dos montajes. T7 es el único que toca Postgres: no se corre a la vez que otro
proceso de E2E en la máquina.
