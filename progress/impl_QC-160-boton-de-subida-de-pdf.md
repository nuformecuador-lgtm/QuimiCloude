# QC-160 — boton-de-subida-de-pdf · bitácora del implementer

> Estado (2026-09-24): T0-T7 cerradas. De T8 falta solo `./init.sh` completo, que por instrucción
> del leader corre él. Todos los subagentes han terminado. Sin push.
>
> Historia: me paré en T0 por el choque con QC-158 (abajo). El leader decidió la **opción A** y quedó
> escrita como nota fechada 2026-09-24 bajo D9 en `design.md` (3.1 y 6.1), en `requirements.md` (bajo
> R22) y en `tasks.md` (T4 y T6). Commit `77de26ee`.

## Base usada

- `QuimiCloude_QC160`, creada con `CREATE DATABASE … TEMPLATE qct_tpl_a3f9d657e639` (plantilla de
  `pnpm run db:test template`: 51 migraciones y sembrada con roles, permisos, empresa y admin).
- Solo el `.env` del worktree apunta a ella (`DATABASE_URL` y `DIRECT_URL`).
- `prisma migrate status`: «51 migrations found … Database schema is up to date!».

## T0: resultado

| Casilla | Resultado |
|---|---|
| QC-142 en `dev` | Sí. Merge `5d3e90d9` (PR #120). `actor.ts:38` declara `DOCUMENT_UPLOAD_PERMISSION: PermissionCode = 'documentos.modificar'` y `permissions.ts` incluye `documentos.modificar`. |
| `dev` en la rama y los 4 puntos de `design.md > 2` | `origin/dev` ya está contenido en HEAD (`41806bbd`). Lo de QC-142 se cumple: permisos, constante, el E2E con rol efímero (`e2e/documentos.spec.ts:405`) y QC-142 no tocó `page.tsx`. |
| `document-upload-convenciones.test.ts` en `dev` | Verde (6/6). T6 **no** tiene que arreglar la línea del catálogo con `/documento/i`. |
| Base propia | Hecha, ver arriba. |
| Choque con QC-158 (D9) | Coincidía. Resuelto por el leader con la opción A. Ver abajo. |

Además: `pnpm install`, `prisma generate` y `next typegen` hechos; `pnpm run typecheck` verde sobre
la rama sin cambios.

## Bloqueo: QC-158 cambió el montaje de la subida en `/proveedores/[id]`

QC-158 (PR #119, ya en `dev`) tocó cuatro de los cinco archivos que vigila T0:
`app/(private)/proveedores/[id]/page.tsx`, `tests/unit/documentos-ui/supplier-detail-upload.test.tsx`,
`lib/modules/documentos/index.ts` y `tests/unit/documentos/module-contract.test.ts`.

Tres de esos cambios no afectan al plan: las exportaciones nuevas del barrel y del contrato no chocan
con `canUploadDocuments`. El que sí afecta es el commit `090689b3` (T13 de QC-158):

- `page.tsx` **ya no monta** `<DocumentUpload strategy="catalogo" />` (lo que dan por hecho
  `design.md > 1.2` y `6.1`). Ahora monta `<CatalogPdfUpload supplierId={…} />`, un envoltorio
  `'use client'` en `app/(private)/proveedores/[id]/components/catalog-pdf-upload.tsx` que pasa a
  `DocumentUpload` la prop nueva `reviewHrefFor` (el acceso «Revisar» de cada fila en «listo»). El
  envoltorio existe porque una función no puede pasar de un Server Component a uno de cliente.
- La guardia `document-upload-convenciones.test.ts:25` ya reconoce `catalog-pdf-upload.tsx` como el
  punto de montaje (`PANTALLA_CON_MONTAJE`). Hay además un test de QC-158,
  `tests/unit/proveedores-ui/catalog-pdf-upload.test.tsx`.

Si se aplica `design.md > 6.1` tal cual (`DocumentUploadDialog strategy="catalogo"`, que solo recibe
`strategy`), el detalle de proveedor **pierde el acceso «Revisar» de QC-158**. Hay que cambiar el
design, y T0 manda parar y volver al spec en ese caso.

### Pregunta para el leader

¿Cómo encaja el diálogo con el envoltorio de QC-158? Opciones:

- **A (la que recomiendo).** `DocumentUploadDialogProps` gana `reviewHrefFor?` opcional y lo pasa
  tal cual a `DocumentUpload`. `CatalogPdfUpload` renderiza
  `<DocumentUploadDialog strategy="catalogo" reviewHrefFor={…} />`. La página monta
  `{canUpload ? <CatalogPdfUpload supplierId={…} /> : null}` entre la cabecera y el `<Suspense>`.
  Fórmulas monta `DocumentUploadDialog strategy="formula"` directamente, como dice el design.
  Consecuencias:
  - cambia la firma de `design.md > 3.1`;
  - en T6, los puntos de montaje pasan a ser `formulas/page.tsx` y `catalog-pdf-upload.tsx` (no
    `proveedores/[id]/page.tsx`), y la regla «las dos llaman a `canUploadDocuments`» se afirma sobre
    las dos **páginas**;
  - T4 suma `catalog-pdf-upload.tsx` y probablemente una enmienda a
    `tests/unit/proveedores-ui/catalog-pdf-upload.test.tsx`, que es de otra ficha: ahora el enlace
    solo se ve después de abrir la ventana. La enmienda llevaría su motivo en el propio test.
- **B.** `DocumentUploadDialog` recibe `children` (la pieza de subida ya configurada) en lugar de
  `strategy`. Es más genérico, pero el diálogo deja de saber qué monta y cambia más la API y los
  tests de `design.md > 9.1`.

**Decisión del leader (2026-09-24): opción A.** Aplicada tal cual.

## Commits (uno por task)

| Task | Commit | Subagente |
|---|---|---|
| T0 | `b0e9598d`, `77de26ee` | implementer |
| T1 | `673ba59b` | backend_dev (el implementer recortó el docblock a 3 líneas, solo comentario) |
| T2 | `59069a6a` | frontend_dev |
| T3 | `3e976515` | frontend_dev |
| T4 | `b03f4811` | frontend_dev |
| T5 | `976e90b4` | frontend_dev |
| T6 | `a15017d2` | frontend_dev |
| T7 | `357daa96` | frontend_dev |

## Archivos tocados

Producción:
- `components/ui/dialog.tsx`: `DialogContent` reenvía `keepMounted` al portal.
- `components/shared/document-upload/document-upload-dialog.tsx` (nuevo), `labels.ts` e `index.ts`.
- `lib/modules/documentos/domain/actor.ts` (`canUploadDocuments`) y `lib/modules/documentos/index.ts`.
- `app/(private)/proveedores/[id]/page.tsx` y `app/(private)/proveedores/[id]/components/catalog-pdf-upload.tsx`.
- `app/(private)/produccion/formulas/page.tsx`.

Tests:
- Nuevos: `tests/unit/documentos/can-upload-documents.test.ts`,
  `tests/unit/documentos-ui/document-upload-dialog.test.tsx` y
  `tests/unit/documentos-ui/formulas-upload.test.tsx`.
- Reescrito: `tests/unit/documentos-ui/supplier-detail-upload.test.tsx`.
- Enmendados: `tests/unit/documentos-ui/document-upload-convenciones.test.ts` y
  `tests/unit/documentos/module-contract.test.ts`.
- `tests/unit/proveedores-ui/catalog-pdf-upload.test.tsx`, de QC-158: enmienda con el motivo escrito
  en el test (la subida ahora se abre desde un botón en una ventana), más un caso `R22`. Nada va al
  baseline.
- `e2e/documentos.spec.ts`.

Otros:
- Spec: `requirements.md`, `design.md` y `tasks.md` (notas D9 y casillas).
- `.env` del worktree, ignorado por git: apunta a `QuimiCloude_QC160`.

`recipe-page.test.tsx` y `pantallas-exigen-permiso.test.tsx` **no** se tocaron: resolvieron el import
sin mocks nuevos.

## Mapa R1-R22 → test

| R | Test |
|---|---|
| R1 | `document-upload-dialog.test.tsx` › «cerrado, la subida no esta visible y el boton si (R1)»; `supplier-detail-upload.test.tsx` › «con permiso de subida hay boton, la subida esta oculta hasta pulsarlo… (R1, R5, R10)» |
| R2 | `document-upload-dialog.test.tsx` › «pulsar abre un dialogo accesible con la subida dentro (R2)» |
| R3, R4 | `document-upload-dialog.test.tsx` › «cerrar con el boton propio y con Escape oculta la ventana y devuelve el foco (R3, R4)» |
| R5 | `supplier-detail-upload.test.tsx` › «… al subir se encola catalogo (R1, R5, R10)» |
| R6 | `formulas-upload.test.tsx` › «con documentos.modificar pinta el boton … y encola la estrategia formula (R6, R10)» |
| R7 | `supplier-detail-upload.test.tsx` › «proveedor inexistente: sin boton (R7)»; `document-upload-convenciones.test.ts` › «no anade ninguna ruta… (R19)» (montajes exactos: `formulas/page.tsx` y `catalog-pdf-upload.tsx`) y «la unica pantalla de formulas que monta la pieza es el listado… (R18)» |
| R8 | `document-upload-dialog.test.tsx` › «la seleccion dentro de la ventana respeta el tope de la tanda (R8)» |
| R9 | Los tests de componente de QC-107 (`document-upload-flow`, `-rows`, `-selection`, `-errors`, `-strategy`, `-a11y-tactil`, `use-batch-status`, además de `-review-link`) en verde; `git diff origin/dev` vacío sobre ellos y sobre `document-upload.tsx`, `document-upload-row.tsx`, `upload-file.ts` y `use-batch-status.ts` |
| R10 | `supplier-detail-upload.test.tsx` (R1, R5, R10) y `formulas-upload.test.tsx` (R6, R10) |
| R11 | `supplier-detail-upload.test.tsx` › «sin documentos.modificar … no hay boton ni subida (R11)»; `formulas-upload.test.tsx` › «sin documentos.modificar no hay boton ni subida en el DOM (R11)» |
| R12 | `can-upload-documents.test.ts` (8 casos `R12: …`); `document-upload-convenciones.test.ts` › bloque «quien decide el montaje es el servidor, nunca la pieza (R12)» |
| R13 | `document-upload-dialog.test.tsx` › «sin permiso, la accion falla con unauthorized y no encola nada (R13)» |
| R14 | `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx` (sin cambios, verde) |
| R15 | `document-upload-dialog.test.tsx` › «los objetivos tactiles y el tamano de la ventana (R15)»; el E2E en WebKit **no se corrió** (ver Pendiente) |
| R16 | `e2e/documentos.spec.ts` › «abre la ventana desde el detalle de un proveedor, sube tres PDFs … (R16)» |
| R17 | `e2e/documentos.spec.ts` › «abre la ventana desde el listado de formulas y sube dos PDFs hasta terminar (R17)» |
| R18 | `e2e/documentos.spec.ts` › «un rol con proveedores.consultar y proveedores.modificar pero sin documentos.modificar no ve el boton ni la subida (R18 permiso propio)» |
| R19 | `e2e/documentos.spec.ts`: el contador de `PUT` interceptados en los tres casos. `playwright.config.ts` sin cambios. |
| R20 | `document-upload-convenciones.test.ts` › bloque «esta ficha no reescribe ni añade dependencias (R20)»; `tests/guards/guard-dependencias-aprobadas.test.ts` |
| R21 | `document-upload-dialog.test.tsx` › «cerrar y reabrir a mitad de tanda conserva las filas, sus fases y su estado (R21)» |
| R22 | `document-upload-dialog.test.tsx` › «el boton dice «Subir PDFs» (R22)»; `supplier-detail-upload.test.tsx` › «el boton va despues de la cabecera y antes del catalogo (R22)»; `formulas-upload.test.tsx` › «el boton comparte contenedor padre con «Nueva formula» (R22)»; `catalog-pdf-upload.test.tsx` › ««Revisar» sigue disponible dentro de la ventana, en una fila lista (R22)» |

## Salidas

- `pnpm run typecheck`: sin errores. Antes hizo falta `next typegen` en el worktree recién instalado.
- `pnpm run lint`: `✖ 7 problems (0 errors, 7 warnings)`. Los 7 warnings son preexistentes, en
  `tests/unit/documentos/confirm-catalog-import.test.ts` y `tests/unit/pedidos/order-service.test.ts`;
  ninguno está en archivos de esta rama.
- Vitest, solo archivos concretos, incluidos todos los tocados y los que el spec exige verdes sin
  cambios:
  - Archivos: `tests/unit/documentos-ui/` (11), `can-upload-documents`, `module-contract`,
    `catalog-pdf-upload`, `pantallas-exigen-permiso`, `session-once-per-request-render`, `recipe-page`,
    `adjust-batch-dialog`, `recipe-form`, `supplier-detail-page`, `guard-dependencias-aprobadas` y
    `guard-identificador-de-request`.
  - Resultado: `Test Files  23 passed (23)` y `Tests  294 passed (294)`.
- Pruebas de mutación de los subagentes, deshechas después:
  - T1: con la constante cambiada a `documentos.consultar` se ponen rojos 2 de 8 casos: el `false`
    con `documentos.consultar` y el conteo del literal. El caso `true` en sí no se pone rojo, porque usa
    la constante del módulo como pide el design (9.1). La mutación se detecta, pero no por el caso que
    nombra el «Hecho cuando» de T1.
  - T6: las seis reglas nuevas o enmendadas muerden sobre el árbol real: literal en página,
    `canUpload = true`, `roleName` en la carpeta, dependencia nueva, import directo de
    `@base-ui/react` y montaje en `nueva/`.
- Comprobaciones de T8:
  - `git diff --stat origin/dev...HEAD` no lista `package.json`, `pnpm-lock.yaml`,
    `docs/dependencias.md`, `db/` ni `lib/modules/documentos/adapters/`.
  - Ninguna línea de comentario añadida en `app/`, `lib/` o `components/` casa con la expresión de T8.
- E2E: antes de correrlo, el puerto 3117 estaba libre y no había ningún Playwright en marcha. Una
  sola corrida, `pnpm exec playwright test e2e/documentos.spec.ts --project=chromium`, con
  `DATABASE_URL` y `DIRECT_URL` del proceso en `QuimiCloude_QC160`:

  ```
  ✓ 3 … sin documentos.modificar no ve el boton ni la subida (R18 permiso propio) (33.6s)
  ✓ 2 … abre la ventana desde el listado de formulas y sube dos PDFs hasta terminar (R17) (35.1s)
  ✓ 1 … abre la ventana desde el detalle de un proveedor, sube tres PDFs … (R16) (37.0s)
  3 passed (1.3m)
  ```

  El recorrido de tres PDFs, que se daba por rojo heredado de `dev`, llegó a «terminado» en esta
  corrida. Después, en el 3117 solo quedaban conexiones en `TIME_WAIT`.

## Pendiente para el leader

- `./init.sh` completo (T8), con `QuimiCloude_QC160`.
- E2E en **WebKit**: T7 y R15 lo nombran, pero la instrucción era correr solo Chromium y una sola vez.
