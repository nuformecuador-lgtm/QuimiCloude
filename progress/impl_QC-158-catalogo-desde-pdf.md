# impl — QC-158 catalogo-desde-pdf

Rama `feature/QC-158-catalogo-desde-pdf`, worktree `.worktrees/QC-158-catalogo-desde-pdf`.
Implementer: coordina `backend_dev` y `frontend_dev`. Spec aprobado el 2026-09-23 (R1–R38, T0–T17).

## T0 — Medir antes de escribir (2026-09-23)

### Base propia
- `pnpm run db:test template` → plantilla reutilizada `qct_tpl_664cc76c19c8` (45 migraciones, ya
  sembrada).
- `CREATE DATABASE "QuimiCloude_QC158" TEMPLATE "qct_tpl_664cc76c19c8"` → creada.
- `.env` del worktree (no versionado): `DATABASE_URL` y `DIRECT_URL` → `…/QuimiCloude_QC158`.
- `pnpm run db:migrate` → `No pending migrations to apply.`; `pnpm run db:seed` → `nada que crear`.
- El worktree no traía `node_modules`: `pnpm install --frozen-lockfile --prefer-offline` (lockfile
  intacto, sin dependencias nuevas; `git status` limpio después) y `pnpm exec prisma generate`.

### E2E de QC-107 en `dev`
`pnpm exec playwright test e2e/documentos.spec.ts --project=chromium` → **ROJO** (1 failed, 2.2 min):

```
✘ [chromium] › e2e\documentos.spec.ts:216:7 › documentos › sube tres PDFs y ve cambiar el estado de cada uno hasta terminar (R20)
Locator:  getByTestId('document-upload-row-status-0')
Expected: "done"
Received: "error"
```

El servidor solo imprime `[process-pdf-by-strategy] estrategia=catalogo modo=images … longitud=53`
(53 = largo de `CANNED_AI_TEXT`) y no el motivo; las filas ya estaban limpias por el `afterAll` al
consultarlas. **Motivo, leído en el código**: el doble `ai-reader-canned.ts` devuelve siempre
`'texto de guion para el recorrido de extremo a extremo'`, sin `{`; el recorte
(`crop-coordinates.ts > extractCropCoordinates`) lanza `ValidationError` («no se encontro un objeto
JSON en el texto») → `invalid_input` → archivo en `error`. Confirma la hipótesis de `design.md > 0`.
Se arregla en T14 (el doble devuelve coordenadas con el prompt de recorte).

### Prefijo de la migración
Última migración de `dev` (`origin/dev`): `20260923140000_product_batch_nullable_machine`. QC-141 ocupa
`20260923150000`–`…150200` en su rama. Prefijo elegido: **`20260923180000`** (por detrás de ambas).

## T8 — Tope de 1 MB del cuerpo de la Server Action

Medido con `JSON.stringify` + `Buffer.byteLength` (UTF-8) sobre la entrada completa de la
confirmación (`supplierId`, `documentFileId`, `lines`, `newPresentationUnits: []`):

| Fila | Bytes/fila | Filas que caben en 1.048.576 B |
|---|---|---|
| Realista: nombre largo, presentación, costo, mínimo, material, medidas completas, `imagePath` | 405 | 2.582 |
| Mínima: sin imagen, medidas ni material | 161 | 6.471 |

El repo **no** tiene el catálogo de muestra de QC-129 (su spec dice que el PDF no entra al
repositorio). Estimación para 50 páginas a 15–30 filas/página: 750–1.500 filas, por debajo de 2.582
en el peor caso. **Cabe sin tocar `next.config.ts`**; no hace falta decisión humana. Queda como riesgo
declarado para catálogos de más de ~2.500 líneas.
