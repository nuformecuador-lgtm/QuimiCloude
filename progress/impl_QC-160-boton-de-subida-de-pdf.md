# QC-160 — boton-de-subida-de-pdf · bitácora del implementer

> Estado: **PARADA en T0** (2026-09-24). No se ha tocado código de producción ni tests, y no se ha
> lanzado ningún subagente.

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
| Choque con QC-158 (D9) | **Coincide. Bloquea.** Ver abajo. |

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

Mientras no haya respuesta, T1 a T8 quedan abiertas. T1 (el predicado) y T2 (`keepMounted`) no
dependen de esta decisión y se pueden hacer en cuanto se desbloquee.

## Archivos tocados

- `specs/QC-160-boton-de-subida-de-pdf/tasks.md`: casillas de T0.
- `progress/impl_QC-160-boton-de-subida-de-pdf.md`: esta bitácora.
- `.env` del worktree (ignorado por git): apunta a `QuimiCloude_QC160`.

## Mapa R1-R22 → test

Pendiente: no hay tests nuevos todavía. El previsto es el de `design.md > 12`.

## Salidas

- `pnpm exec vitest run tests/unit/documentos-ui/document-upload-convenciones.test.ts`:
  `Test Files 1 passed (1) · Tests 6 passed (6)`.
- `pnpm run typecheck` (después de `next typegen`): sin errores.
- `pnpm exec prisma migrate status`: `Database schema is up to date!`.
