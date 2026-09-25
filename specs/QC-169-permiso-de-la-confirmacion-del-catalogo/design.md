# QC-169 — permiso-de-la-confirmacion-del-catalogo · design.md

## 1. Estado medido (punto de partida en `dev`)

| Dónde | Qué hay hoy |
|---|---|
| `lib/modules/documentos/domain/actor.ts:38` | `DOCUMENT_UPLOAD_PERMISSION: PermissionCode = 'documentos.modificar'`. QC-142 la cambió; antes valía `proveedores.modificar`. |
| `lib/modules/documentos/domain/confirm-catalog-import.ts:107` | `requirePermission(actor, DOCUMENT_UPLOAD_PERMISSION)` es la primera línea de la confirmación. |
| `lib/modules/documentos/domain/confirm-catalog-import.ts:177` | `assertPermission(actor, 'inventario.modificar', ...)` solo si hay presentaciones nuevas (F6/R33 de QC-158). **No se toca.** |
| `lib/modules/documentos/domain/preview-catalog-import.ts:246` | `requirePermission(actor, DOCUMENT_UPLOAD_PERMISSION)` es la primera línea de la **vista previa**. Tiene el mismo desvío. |
| `issue-upload-links.ts:72`, `enqueue-batch.ts:31`, `get-batch-status.ts:30`, `canUploadDocuments` | Usan `DOCUMENT_UPLOAD_PERMISSION`. Es la subida (D2). **No se tocan.** |
| `lib/modules/proveedores/domain/find-catalog-lines-by-identity.ts:48`, `import-catalog-lines.ts:37` | Ya exigen `proveedores.modificar` más abajo, al llamarse desde la vista previa y la confirmación. |
| `app/(private)/proveedores/[id]/importar/[documentoId]/page.tsx:68-69` | La pantalla corta con `proveedores.consultar` y `proveedores.modificar` (R32 de QC-158). |
| `tests/integration/documentos/catalog-import-isolation.int.test.ts` | Seis casos (R21, R22 y cuatro de R34). Sus actores llevan `proveedores.modificar` (con o sin `inventario.modificar`) y **no** llevan `documentos.modificar`. Hoy los seis caen con `UnauthorizedError`. |
| `tests/baseline-rojos.json` | **La entrada existe** en `dev`: la clave `tests/integration/documentos/catalog-import-isolation.int.test.ts`, `desde: 2026-09-24`, y su motivo ya nombra a QC-169 como salida. Es la única entrada. |

Diagnóstico: R31 de QC-158 fijó `proveedores.modificar` para las dos operaciones. El código lo
expresó con la constante de la subida porque entonces coincidían. Al separarlas QC-142, la
importación heredó el permiso de la subida sin que nadie lo decidiera.

## 2. Cambio

Sin modelo de datos. Sin migración ni RLS. Sin rutas, endpoints ni Server Actions nuevas. Sin UI. El
contrato público del módulo (`lib/modules/documentos/index.ts`) no cambia, y no hay dependencias
nuevas.

### 2.1 `domain/actor.ts`: una constante nueva, privada al dominio

```ts
/**
 * El permiso de la importacion de catalogo desde PDF (vista previa y confirmacion). Escribe en el
 * catalogo de un PROVEEDOR, asi que es el permiso de proveedores, el mismo que editar lineas a
 * mano. NO es el de subida: QC-142 los separo y esta constante impide que vuelvan a acoplarse.
 */
export const CATALOG_IMPORT_PERMISSION: PermissionCode = 'proveedores.modificar';
```

- Va en el dominio de `documentos`, junto a la de subida. Así se cumple la misma regla que ya sigue
  el módulo: el código de un permiso se escribe una sola vez y dentro del dominio (R11).
- No se reexporta desde el barrel, igual que `DOCUMENT_UPLOAD_PERMISSION`
  (`module-contract.test.ts:276`).
- `PermissionCode` sale del barrel de `identity`: un código mal escrito no compila.

### 2.2 `confirm-catalog-import.ts` y `preview-catalog-import.ts`

- En los dos archivos, la primera línea pasa de `requirePermission(actor, DOCUMENT_UPLOAD_PERMISSION)`
  a `requirePermission(actor, CATALOG_IMPORT_PERMISSION)`, y se ajusta el import.
- El orden fijo de `design.md` de QC-158 (sección «Orden fijo en los dos») no cambia: permiso →
  esquema → `readFileForReview` → resto.
- `'inventario.modificar'` en la línea 177 queda **igual** (D1, R5 y R6).
- El comentario de cabecera de la confirmación puede citar el permiso nuevo, sin citar la ficha
  (`docs/conventions.md`).

### 2.3 `tests/baseline-rojos.json`

Se borra la única entrada y queda `"archivos": {}` junto con la clave `_nota`.
`scripts/comparar-baseline-rojos.mjs` acepta un baseline vacío: su resumen es «baseline vacio».
Hay que hacerlo en el mismo commit que el arreglo, porque si no el gate completo avisa de «1 por
limpiar».

### 2.4 Tests (mapa de trazabilidad previsto)

| R | Test |
|---|---|
| R1, R2 | `tests/unit/documentos/catalog-import-authorization.test.ts`, bloque «R31»: los denegados (nulo, ausente, vacío, sin el permiso) no tocan ningún puerto. En el positivo, el actor pasa a `proveedores.modificar`. |
| R3 | Mismo archivo, caso nuevo: el actor tiene solo `documentos.modificar` → `UnauthorizedError` y la bitácora queda vacía. |
| R4 | Mismo archivo, caso nuevo: el actor tiene solo `proveedores.modificar` y no hay presentación nueva → resumen devuelto. En integración, además, R22 de `catalog-import-isolation.int.test.ts`. |
| R5, R6 | Bloque «R33» del mismo archivo, con el actor base cambiado a `proveedores.modificar` (sin `documentos.modificar`). |
| R7, R8, R9 | `tests/unit/documentos/preview-catalog-import.test.ts`, bloque de autorización (línea ~255): se añade el denegado «solo `documentos.modificar`» y el actor base pasa a `proveedores.modificar`. |
| R10 | `tests/unit/documentos/authorization.test.ts` o los unitarios de cada caso de subida: un caso con un actor que tiene solo `proveedores.modificar` → `UnauthorizedError` en `issueUploadLinks`, `enqueueBatch` y `getBatchStatus`. El predicado ya lo cubre `can-upload-documents.test.ts:42`. |
| R11 | `tests/unit/documentos/authorization.test.ts`: un caso gemelo del «R4 — el codigo del permiso se escribe UNA sola vez», para `CATALOG_IMPORT_PERMISSION`, que además afirma que es distinto de `DOCUMENT_UPLOAD_PERMISSION`. |
| R12 | `tests/integration/documentos/catalog-import-isolation.int.test.ts`, **sin tocar**. Evidencia: corrida verde (6/6) y `git diff dev -- <archivo>` vacío. |
| R13 | `tests/baseline-rojos.json` sin la clave, y `./init.sh` completo con el resumen «baseline vacio». |

La guardia `tests/guards/guard-autorizacion-por-permiso.test.ts` no cambia. `documentos` no está en
su barrido (`BUSINESS_MODULES`), y el cambio sigue autorizando por permiso, no por rol. Tampoco
vigila qué permiso es el correcto: eso lo cubren los unitarios de arriba (sección 6.2 de la ficha
original).

`confirm-catalog-import.test.ts` (línea 24) y `catalog-import-actions.test.ts` (líneas 58 y 66)
cambian su actor base a `proveedores.modificar` para seguir expresando «actor con permiso» (P2).
En `catalog-import-actions` el cambio es solo coherencia, porque la composición es un doble.

## 3. Alternativas descartadas

1. **Devolver `DOCUMENT_UPLOAD_PERMISSION` a `'proveedores.modificar'`.** Descartada: deshace
   QC-142 y rompe D2. La subida volvería a exigir el permiso de proveedores.
2. **Quitar la comprobación de `documentos` y fiarse de la de `proveedores`**
   (`findAliveByIdentity` e `importLines` ya exigen `proveedores.modificar`). Descartada: esas
   comprobaciones llegan **después** de `readFileForReview` y de las lecturas de presentaciones. Eso
   rompe «primera operación, ningún puerto tocado» (R1, R2 y R8; R31 de QC-158), y el rechazo
   saldría como error de `proveedores` en lugar del `UnauthorizedError` de `documentos` que traduce
   el adaptador.
3. **Exigir los dos permisos (`proveedores.modificar` y `documentos.modificar`).** Descartada:
   contradice D1 («igual que editar líneas a mano») y deja el test de integración en rojo, cuyos
   actores no tienen `documentos.modificar`, así que D3 no se cumpliría.
4. **Escribir el literal `'proveedores.modificar'` en línea en los dos casos de uso**, como ya se
   hace con `'inventario.modificar'`. Descartada: serían dos declaraciones del mismo permiso que
   pueden divergir, que es justo el fallo que causó esta ficha. Una sola constante lo impide (R11).

## 4. Riesgos

- **Acceso efectivo.** Un actor con `proveedores.modificar` y sin `documentos.modificar` puede
  previsualizar y confirmar, pero no subir el PDF. Es lo que deciden D1 y D2 juntas: quien sube y
  quien confirma pueden ser personas distintas. No he medido qué roles del seed quedan en ese caso.
- Ninguna migración. La reversión es un solo commit.
