# QC-142 — permiso-propio-de-documentos · design.md

> Zona `backend` · complejidad `low` · depende de QC-107 · desbloquea QC-157, QC-159 y QC-160.
> Medido sobre el árbol del worktree el 2026-09-24 (rama recién sacada de `dev`, HEAD `a2bcb0ed`).

## 0. Qué cambia, en una frase

`documentos` deja de pedir prestado `proveedores.modificar`: el catálogo gana `documentos.consultar`
y `documentos.modificar`, el Administrador los recibe por seed y por migración, la migración hereda
`documentos.modificar` a todo rol con `proveedores.modificar`, y la única constante del módulo que
nombra el permiso pasa a apuntar a `documentos.modificar`. No hay tabla, pantalla ni dependencia
nueva.

## 1. Estado medido (lo que hay hoy)

### 1.1 El permiso de `documentos`

- `lib/modules/documentos/domain/actor.ts:42` —
  `export const DOCUMENT_UPLOAD_PERMISSION: PermissionCode = 'proveedores.modificar';`. Es el ÚNICO
  sitio del módulo donde aparece el literal (lo vigila
  `tests/unit/documentos/authorization.test.ts:197-223`, «se escribe UNA sola vez»).
- Consumidores de la constante, todos en `domain/` y todos como primera línea del caso de uso:
  - `domain/issue-upload-links.ts:72` (emitir enlaces de subida),
  - `domain/enqueue-batch.ts:31` (encolar una tanda),
  - `domain/get-batch-status.ts:30` (consultar el estado de una tanda).
- `domain/read-document.ts` (firmar lectura y descargar bytes) **no exige permiso**, solo empresa, y
  lo dice su cabecera como decisión deliberada. Se queda así (R18).
- Server Actions `adapters/driving/document-upload-actions.ts` y `document-batch-actions.ts`: no
  comprueban permiso ni conocen el código; resuelven el actor con los permisos de la sesión. **No
  cambian.**
- Route handler `adapters/driving/document-job-route.ts`: es el trabajo de la cola, firmado; no usa
  el permiso. **No cambia.**
- Pantalla que monta la subida: `app/(private)/proveedores/[id]/page.tsx:126` monta
  `<DocumentUpload strategy="catalogo" />` sin condición, detrás de
  `requirePagePermission('proveedores.consultar')`. **No cambia**: ocultar o mostrar el botón por
  permiso es QC-160 (fuera de alcance). Con esta feature, quien vea la pantalla sin
  `documentos.modificar` recibe `unauthorized` del service al subir, que es justo el caso de R20.
- Los permisos de la sesión se **releen de la base en cada petición**
  (`identity/adapters/driven/persistence/session-user-prisma.ts:85`, `role.permissions`), así que
  una sesión abierta antes del despliegue ve el permiso heredado en su siguiente petición.
- `package.json > build` es `prisma migrate deploy && tsx scripts/seed.ts && next build`: la
  migración y el seed corren **antes** de que el código nuevo sirva. No hay ventana en la que el
  código exija `documentos.modificar` sobre una base que aún no lo tiene.

### 1.2 El catálogo y el seed

- `lib/modules/identity/domain/permissions.ts`: `PERMISSIONS` (as const) y
  `SEED_ROLE_PERMISSIONS` (Administrador escrito uno a uno; Operador `inventario.consultar`,
  `asignaciones.consultar`; Empacador `asignaciones.consultar`, `terminados.consultar`).
- El seed (`lib/modules/identity/domain/seed-initial-access.ts`) es aditivo: crea los permisos y
  asignaciones que falten y no borra nada. Sumar a las dos constantes basta para el seed.
- Precedentes de migración de datos del catálogo: `20260911120000_order_assignments` (paso 5),
  `20260922120000_packer_role` (solo datos, con su `down.sql`) y `20260924120000_customers` (paso 5,
  el más reciente, con el `down.sql` que borra por código a cualquier rol).

### 1.3 Sitios que afirman el total del catálogo a mano (R3)

Medidos con `rg "toHaveLength\(18\)|toBe\(18\)|PERMISOS_ESPERADOS|dieciocho|veintidos|22\)"` sobre
`tests/` y `e2e/`:

| # | Archivo | Qué afirma hoy |
|---|---|---|
| 1 | `tests/guards/guard-permisos-sembrados.test.ts:124-137` | `PERMISSIONS.length` `toBe(18)` |
| 2 | `tests/guards/guard-nav-permisos-declarados.test.ts:119-132` | `CODIGOS_VALIDOS` `toHaveLength(18)` |
| 3 | `tests/unit/navegacion/qc75-convenciones.test.ts:48-77, 129-132` | lista a mano de 18 + `toHaveLength(18)` |
| 4 | `tests/unit/identity/permissions.test.ts` (18-44, 46-83, 102-105, 159-165, 234-236, 313-316, 318-322, 350-357) | lista a mano, `Set.size` 18, «clientes van al final», Administrador `toEqual` la lista |
| 5 | `tests/unit/documentos/authorization.test.ts:153-172` | `toHaveLength(18)` y «ninguna entrada `documentos.*`» |
| 6 | `tests/unit/identity/roles/scope.test.ts:196, 310-321` | `PERMISOS_ESPERADOS = 18` |
| 7 | `tests/unit/identity/grupos/scope.test.ts:380-387` (y su `PERMISOS_ESPERADOS`) | ídem |
| 8 | `tests/unit/asignaciones/schema/order-assignments-migration.test.ts:864-879` | `toBe(18)` y lista de «fichas posteriores» |
| 9 | `tests/unit/pedidos/qc145-estado-solo-planta.test.ts:316-322` | `toHaveLength(18)` |
| 10 | `tests/unit/identity/seed/seed-initial-access.test.ts:701-756` | `TOTAL_DE_ASIGNACIONES_DEL_SEED` `toBe(22)`, Administrador `toHaveLength(18)` |
| 11 | `tests/integration/identity/identity-seed.int.test.ts:285-300, 770-800, 916-968` | `toBe(18)`, `toHaveLength(18)`, `toHaveLength(22)` |

Otros sitios tocados que no afirman el total pero se rompen o mienten con el cambio:

| Archivo | Por qué se toca |
|---|---|
| `tests/guards/guard-identificador-de-request.test.ts:212-310` | `MIGRACIONES_ESPERADAS` es lista cerrada: la migración nueva entra con su línea |
| `e2e/documentos.spec.ts:133-135` | el comentario dice que el Administrador sube por `proveedores.modificar` |
| `lib/modules/documentos/domain/actor.ts:32-41` | el JSDoc dice que el catálogo «no se amplía» y justifica `proveedores.modificar` |
| `lib/modules/identity/domain/permissions.ts:8` | «dieciocho permisos, ni uno más ni uno menos» |

`tests/unit/documentos-ui/document-upload-convenciones.test.ts:195` y los unit de los casos de uso
(`issue-upload-links`, `enqueue-batch`, `get-batch-status`, `read-document`,
`document-upload-actions`) usan la constante importada, no el literal: siguen verdes sin tocarlos,
salvo `issue-upload-links.test.ts:97`, que es el caso «sin permiso» y ya usa `proveedores.consultar`.

## 2. Dominio

### 2.1 `lib/modules/identity/domain/permissions.ts`

Dos entradas al **final** de `PERMISSIONS`, detrás de `clientes.modificar`:

```ts
{ code: 'documentos.consultar', module: 'documentos', action: 'consultar',
  description: 'Consultar los documentos de la empresa y el estado de su procesamiento.' },
{ code: 'documentos.modificar', module: 'documentos', action: 'modificar',
  description: 'Subir documentos PDF y encolar su procesamiento.' },
```

Las dos descripciones son **propuesta de este spec** (no hay decisión que las fije); se aprueban con
el spec. `documentos` es una carpeta real de `lib/modules/`, así que cumple la forma
`<modulo>.<accion>` sin enmienda de nombres.

`SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]` gana `'documentos.consultar'` y
`'documentos.modificar'` al final, escritos uno a uno. Operador y Empacador no se tocan.

Comentarios (según `docs/conventions.md > Comentarios`): se reescribe la línea 8 para que no afirme
un número, y se añade un párrafo de enmienda de ≤ 5 líneas, sin citar ficha ni requisito, que diga
que el catálogo gana los dos de `documentos` y que solo los recibe el Administrador. Los párrafos
de enmiendas anteriores no se arrastran a la limpieza.

### 2.2 `lib/modules/documentos/domain/actor.ts`

```ts
export const DOCUMENT_UPLOAD_PERMISSION: PermissionCode = 'documentos.modificar';
```

El nombre de la constante se conserva (D6 la nombra; renombrarla toca siete tests sin ganar nada).
El JSDoc de la constante se reescribe corto: es el permiso de escritura propio del módulo. Nada más
en el módulo cambia: los tres casos de uso ya la usan como primera línea (R14) y el tipo
`PermissionCode` hace que un código mal escrito no compile.

**`documentos.consultar` no lo exige nadie todavía.** Nace en el catálogo y en el Administrador
para que QC-157/159/160 lo consuman sin otra migración. Ponerlo en `get-batch-status` o en las
lecturas sería una regla que ninguna decisión ha tomado (ver alternativas).

## 3. Datos: la migración

**Carpeta:** `db/migrations/20260924130000_documents_permissions/` con `migration.sql` y
`down.sql`, escritos a mano (como `packer_role` y `customers`): es migración de datos y
`migrate dev` propondría reset por el drift conocido. El timestamp va detrás de
`20260924120000_customers`, la última de `dev`; si al mergear QC-161 o QC-168 han entrado con uno
posterior, el orden entre ellas da igual (ninguna lee lo que escribe la otra), pero **el nombre no
puede repetirse**: se comprueba al sincronizar con `dev`.

### 3.1 `migration.sql` (UP)

Tres sentencias, todas `INSERT ... ON CONFLICT ... DO NOTHING` (R9). Sin DDL (R11).

```sql
INSERT INTO "permissions" ("code", "module", "action", "description", "updated_at") VALUES
  ('documentos.consultar', 'documentos', 'consultar', '<descripcion de 2.1>', CURRENT_TIMESTAMP),
  ('documentos.modificar', 'documentos', 'modificar', '<descripcion de 2.1>', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "r"."id", "p"."code" FROM "roles" AS "r"
CROSS JOIN (VALUES ('documentos.consultar'), ('documentos.modificar')) AS "p"("code")
WHERE "r"."name" = 'Administrador'
ON CONFLICT ("role_id", "permission_code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT DISTINCT "rp"."role_id", 'documentos.modificar' FROM "role_permissions" AS "rp"
WHERE "rp"."permission_code" = 'proveedores.modificar'
ON CONFLICT ("role_id", "permission_code") DO NOTHING;
```

- La herencia (R6) se resuelve por **permiso**, no por nombre de rol: hoy solo el Administrador
  tiene `proveedores.modificar`, pero un rol que lo tenga en una instalación concreta también lo
  hereda. Solo hereda `modificar`: `consultar` es del Administrador y de nadie más (R7, D4, D5).
- El Administrador se resuelve por nombre con subselect, nunca por uuid (precedente literal).
- Sobre una base sin roles (antes del primer seed) los dos últimos `INSERT` escriben cero filas y
  no fallan; el seed los completa después.
- No se tocan `roles` ni ninguna asignación existente (R8).

### 3.2 `down.sql`

```sql
DELETE FROM "role_permissions" WHERE "permission_code" IN ('documentos.consultar', 'documentos.modificar');
DELETE FROM "permissions" WHERE "code" IN ('documentos.consultar', 'documentos.modificar');
```

Las asignaciones caen antes (`role_permissions_permission_code_fkey` es RESTRICT). Se borran de
**cualquier** rol, incluidas las heredadas: antes del UP nadie las tenía, así que es el estado
anterior exacto (R10). Sin `CASCADE`, sin `UPDATE`, sin DDL.

### 3.3 RLS

No aplica: no hay tabla nueva. `permissions` y `role_permissions` conservan su RLS; la migración no
la toca.

## 4. Contratos I/O

Ninguno cambia. Las Server Actions `issueUploadLinksAction`, `enqueueBatchAction` y
`getBatchStatusAction` devuelven lo mismo; lo único distinto es **quién** recibe
`{ status: 'error', code: 'unauthorized' }`: ahora todo actor sin `documentos.modificar`, tenga o
no permisos de `proveedores`. El componente de subida ya pinta ese estado con
`data-testid="document-upload-error"` y `data-code` (`components/shared/document-upload/document-upload.tsx:203-207`).

## 5. Quitar el total fijo de los tests (R3)

Regla para los once sitios de 1.3, la misma en todos:

1. **Un número escrito contra `PERMISSIONS.length`, `CODIGOS_VALIDOS.length`, el tamaño del
   conjunto del Administrador o el total de asignaciones del seed se borra.** El ancla anti-vacuidad
   pasa a ser `toBeGreaterThan(0)` más «sin duplicados» (`new Set(codigos).size === codigos.length`)
   o una derivación de las constantes (`Object.values(SEED_ROLE_PERMISSIONS).flat().length`).
2. **Un test de alcance de otra ficha que protegía «esta ficha no toca el catálogo»** (roles/scope,
   grupos/scope, qc145) deja de contar y pasa a afirmar lo que de verdad protegía: que no existe
   ningún código de su módulo (`roles.*`, `grupos.*`, ningún `pedidos.*` nuevo) y que los códigos
   que reutiliza siguen ahí.
3. **Las listas escritas a mano como contrato** (`CODIGOS_DEL_REQUISITO`, `CODIGOS_QC74`) ganan las
   dos entradas de `documentos` al final; dejan de acompañarse de un `toHaveLength(<n>)`. Cuando
   QC-161 o QC-168 mergeen, el conflicto es textual en la lista y se resuelve sumando, sin ningún
   número que retocar.
4. **`order-assignments-migration.test.ts`** conserva su cálculo «el DOWN deja el catálogo como
   estaba en QC-66» pero sin `toBe(18)`: `CODIGOS_DE_FICHAS_POSTERIORES` gana los dos de
   `documentos` y la aritmética compara contra la lista de trece de QC-66 derivada, no escrita.
5. En `permissions.test.ts`, el caso «clientes van al final» pasa a «el catálogo es el previo más
   `clientes.*` más `documentos.*`, en orden relativo», y `MODULOS` / `MODULOS_CON_ESCRITURA` ganan
   `documentos`.

Un test nuevo, `tests/unit/identity/catalogo-sin-total-fijo.test.ts`, hace cumplir R3 barriendo
`tests/` y `e2e/` con un predicado puro exportado que detecta, fuera de comentarios, un literal
numérico comparado contra `PERMISSIONS.length`, `PERMISSIONS)` + `toHaveLength(`, `CODIGOS_VALIDOS`,
`PERMISOS_ESPERADOS =` o `TOTAL_DE_ASIGNACIONES_DEL_SEED`, con casos sintéticos que lo disparan y
el simétrico que no. Va en `tests/unit/` (no en `tests/guards/`) porque solo vigila a los tests y
no hace falta que corra en cada tanda de otras zonas; si el reviewer prefiere guardia, se mueve sin
cambiar el predicado.

## 6. E2E (R19, R20)

Se amplía `e2e/documentos.spec.ts`; no nace archivo nuevo (la lista cerrada de E2E de
`guard-identificador-de-request.test.ts` no cambia).

- R19: el caso existente (`sube tres PDFs ... (R20)` de QC-107) no cambia de cuerpo; su comentario
  de las líneas 133-135 pasa a decir que el Administrador sembrado lleva `documentos.modificar`.
- R20, caso nuevo: en `beforeAll` se crea, con el prefijo `qc107_e2e_` y el `RUN_ID` del worker,
  un **rol efímero** con exactamente `proveedores.consultar` y `proveedores.modificar`
  (`prisma.role.create` con `permissions: { create: [...] }`, precedente de rol efímero:
  `e2e/inventario.spec.ts:437`) y un usuario activo de ese rol en la **misma** empresa del worker.
  El test inicia sesión con él, abre el detalle del proveedor, elige un PDF, pulsa subir y afirma:
  `document-upload-error` visible con `data-code="unauthorized"`; el contador de `PUT`
  interceptados en 0; y `prisma.documentBatch.count({ where: { companyId } })` en 0 tras el
  intento. `afterAll` borra, en orden de FK, usuario → asignaciones del rol → rol, dentro de la
  cadena de `try/finally` existente, y la limpieza de huérfanos del `beforeAll` cubre roles con el
  prefijo.
- Los dos casos comparten empresa: el conteo de tandas del caso R19 filtra por la empresa, así que
  el caso R20 debe correr **antes** o afirmar sobre un conteo tomado antes y después del intento.
  Se elige «antes y después» para no depender del orden de los tests.
- `guard-permisos-no-administrables.test.ts` barre solo producción (`lib`, `app`, `components`,
  `hooks`): el `role.create` del E2E no la dispara.

## 7. Mapa de trazabilidad previsto

| R | Test |
|---|---|
| R1, R2 | `tests/unit/identity/permissions.test.ts` (casos nuevos con `toContainEqual` y «previo + dos») |
| R3 | `tests/unit/identity/catalogo-sin-total-fijo.test.ts` (nuevo) |
| R4, R5, R6, R7, R8, R9, R10 | `tests/integration/identity/documents-permissions-migration.int.test.ts` (nuevo, SQL leído del archivo, patrón de `packer-role-migration.int.test.ts`) |
| R4, R9, R10, R11 | `tests/unit/identity/schema/documents-permissions-migration.test.ts` (nuevo, estático, predicados puros con mutación en memoria, patrón de `packer-role-migration.test.ts`) |
| R12 | `tests/unit/identity/permissions.test.ts` |
| R13 | `tests/unit/identity/seed/seed-initial-access.test.ts` y `tests/integration/identity/identity-seed.int.test.ts` |
| R14, R15, R16, R17 | `tests/unit/documentos/authorization.test.ts` (reescrito el bloque R4 de QC-106) y los tres unit de caso de uso con un actor `proveedores.*` sin `documentos.modificar` |
| R18 | `tests/unit/documentos/read-document.test.ts` (caso nuevo: actor sin ningún permiso lee su propia ruta) |
| R19 | `e2e/documentos.spec.ts` caso existente |
| R20 | `e2e/documentos.spec.ts` caso nuevo |
| R21 | `tests/unit/identity/schema/documents-permissions-migration.test.ts` (sin DDL) y la guardia de dependencias existente (`guard-identificador-de-request.test.ts`, total del manifiesto sin cambiar) |

Nombres de caso con `R<n>` (convención de tests). Casos de R6/R7 en integración: se crea dentro de
la transacción un rol efímero con `proveedores.modificar` y otro sin él, se aplica el UP y se
afirma que el primero gana solo `documentos.modificar` y el segundo nada.

## 8. Alternativas descartadas

1. **Dejar `proveedores.modificar` y hacer que implique `documentos.modificar`.** Descartada: la
   pertenencia de permisos es exacta y sin implicación (lo dice `requirePermission` y lo prueba
   `authorization.test.ts`); una implicación abriría una segunda regla de autorización en un
   solo módulo y dejaría a documentos atado a proveedores, que es lo que la ficha viene a romper.
2. **Heredar solo en el seed, sin migración.** Descartada: D3 y D5 lo ponen en la migración, y el
   seed del build solo **añade** lo que declara `SEED_ROLE_PERMISSIONS`; no sabe «todo rol con
   `proveedores.modificar`», solo nombres de rol del seed. Un rol creado a mano en una instalación
   perdería la subida.
3. **Heredar también `documentos.consultar`.** Descartada: D4 dice que `consultar` es solo del
   Administrador y D5 solo protege a quien «sube PDFs», que es `modificar`.
4. **Hacer que `get-batch-status` o las lecturas exijan `documentos.consultar`.** Descartada: sería
   una regla nueva que ninguna decisión tomó, cambiaría quién puede seguir su propia tanda y
   endurecería las lecturas que QC-106 dejó sin permiso a propósito. D6 solo mueve la constante.
5. **Probar R20 con el Operador sembrado.** Descartada: el Operador no tiene
   `proveedores.consultar` y recibe 404 en la pantalla antes de llegar a la subida; el test pasaría
   sin haber tocado `documentos`. El rol efímero con `proveedores.*` es el único que demuestra que
   `proveedores.modificar` ya no basta.
6. **Sustituir los `18` por una constante compartida `EXPECTED_PERMISSION_COUNT`.** Descartada: es
   el mismo número con otro nombre, y cada ficha que amplía el catálogo seguiría peleándose por él
   al mergear. D2 prohíbe el número, no su escritura literal.
7. **Renombrar `DOCUMENT_UPLOAD_PERMISSION` a `DOCUMENTS_WRITE_PERMISSION`.** Descartada: D6 la cita
   por su nombre, lo consumen siete tests y el nombre sigue siendo verdad.

## 9. Dependencias de terceros

Ninguna (D8, R21). No se toca `package.json` ni `docs/dependencias.md`.

## 10. UI y multiplataforma

La feature no toca UI. El único cambio visible es que el error de autorización que el componente ya
sabía pintar aparece para más usuarios; no hay excepción que declarar.

## 11. Riesgos

- **QC-158 está `in_progress` (fullstack) sobre `documentos`.** Si toca `domain/actor.ts` o
  `authorization.test.ts`, hay conflicto; esta feature solo toca la constante y su JSDoc.
- **QC-161 y QC-168 amplían el catálogo.** Conflictos textuales esperados en `permissions.ts` y en
  las dos listas a mano; ninguno numérico tras la sección 5.
- **Base de datos.** La migración, la integración y el E2E corren contra una base propia
  `QuimiCloude_QC142`, nunca contra la de `.env` (detalle en `tasks.md`).
