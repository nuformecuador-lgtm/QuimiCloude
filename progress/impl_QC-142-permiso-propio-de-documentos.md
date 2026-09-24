# QC-142 — permiso-propio-de-documentos · bitácora de implementación (F2.1)

> Implementer, 2026-09-24. Rama `feature/QC-142-permiso-propio-de-documentos`, worktree
> `.worktrees/QC-142-permiso-propio-de-documentos`. Sin push ni PR. No me autoapruebo.
> **Estado: T1-T9 cerradas. T10: R20 verde en E2E, R19 ROJO en el procesado (tras autorizar). Ver «Corrida E2E».**

## Base de datos

- **Base propia `QuimiCloude_QC142`**, creada con
  `CREATE DATABASE "QuimiCloude_QC142" TEMPLATE "qct_tpl_f65845353b96"` (plantilla de
  `pnpm run db:test template`, 49 migraciones, reutilizada).
- Solo el `.env` del worktree (ignorado por git) apunta a ella, en `DATABASE_URL` y `DIRECT_URL`. La base
  compartida `QuimiCloude` no se tocó.
- `prisma migrate status` → `PostgreSQL database "QuimiCloude_QC142"`, comprobado antes de migrar, antes de
  la integración y antes del E2E. Tras T3: 50 migraciones, `Database schema is up to date!`.
- Ciclo de T3 sobre ella: `db:migrate` aplica → `db:rollback` revierte
  (`20260924130000_documents_permissions revertida`, `_prisma_migrations` coherente) → `db:migrate`
  reaplica. Queda APLICADA. `db:seed` → «nada que crear»; Administrador con los dos `documentos.*`,
  Operador y Empacador sin cambios.
- La integración usa la base efímera de plantilla del repo (`qct_tpl_a02ba482de20`, que ya
  incluye la migración nueva).
- Al cerrar la ficha, `QuimiCloude_QC142` sobra (`pnpm run db:test clean`).

## Datos de dev verificados

- Última migración de `origin/dev`: `20260924120000_customers`. La nueva,
  `20260924130000_documents_permissions`, va detrás y no repite nombre.
- Antes de la rama el catálogo tenía 18 entradas (`clientes.*` incluidas). Los sitios que afirman el total a mano
  se volvieron a medir: coinciden con design §1.3, más uno que no estaba listado (abajo).

## Tasks

- **Cerradas `[x]`:** T1, T2, T3, T4, T5, T6, T7, T8, T9.
- **Abiertas `[ ]`:** T10 (R19 rojo en E2E, abajo) y T11 (esta bitácora es parcial;
  el `./init.sh` completo lo corre el leader).

## Commits

| Task | Commit | Archivos |
|---|---|---|
| T1 | `f683037f` | `lib/modules/identity/domain/permissions.ts` |
| T2 | `316fa436` | `lib/modules/documentos/domain/actor.ts` (solo la constante y su JSDoc) |
| T3 | `28ede08f` | `db/migrations/20260924130000_documents_permissions/{migration.sql,down.sql}`, `tests/guards/guard-identificador-de-request.test.ts` |
| T4 | `d06073c5` | `tests/unit/identity/schema/documents-permissions-migration.test.ts` (nuevo) |
| T5 | `a13ebe33` | `tests/integration/identity/documents-permissions-migration.int.test.ts` (nuevo) |
| T9 | `661cfa43` | `tests/unit/documentos/{authorization,issue-upload-links,enqueue-batch,get-batch-status,read-document}.test.ts` |
| T6 | `b3512da9` | `tests/unit/identity/permissions.test.ts`, `tests/unit/navegacion/qc75-convenciones.test.ts`, `tests/unit/identity/seed/seed-initial-access.test.ts`, `tests/integration/identity/identity-seed.int.test.ts` |
| T7 | `30464857` | `tests/guards/guard-permisos-sembrados.test.ts`, `tests/guards/guard-nav-permisos-declarados.test.ts`, `tests/unit/identity/roles/scope.test.ts`, `tests/unit/identity/grupos/scope.test.ts`, `tests/unit/asignaciones/schema/order-assignments-migration.test.ts`, `tests/unit/pedidos/qc145-estado-solo-planta.test.ts`, `tests/unit/documentos-ui/document-upload-convenciones.test.ts` |
| T8 | `aee8ec43` | `tests/unit/identity/catalogo-sin-total-fijo.test.ts` (nuevo) |
| T10 | `d7627bcf` | `e2e/documentos.spec.ts` (E2E sin correr) |

### Sitio que no estaba en el design

`tests/unit/documentos-ui/document-upload-convenciones.test.ts:~188-192` afirmaba que ningún código
del catálogo casaba con `/documento|subir|carga/i`. Lo avisó el coordinador (lo midió el spec de
QC-160) y el backend_dev lo vio rojo tras T1. Se enmendó en el commit de T7, con el motivo escrito
en el test (el catálogo ya tiene permiso propio de documentos). Ahora afirma que los únicos códigos que
casan son exactamente `documentos.consultar` y `documentos.modificar`. **No entró en el baseline.**

## Mapa R<n> -> test

| R | Test |
|---|---|
| R1, R2 | `tests/unit/identity/permissions.test.ts` (casos R1 y R2: `toContainEqual` de las dos entradas; «previo + dos», ningún otro `documentos.*`) |
| R3 | `tests/unit/identity/catalogo-sin-total-fijo.test.ts` (predicado `totalesFijosDelCatalogoEn`, casos sintéticos y barrido de `tests/` y `e2e/`) |
| R4, R9, R10, R11 | `tests/unit/identity/schema/documents-permissions-migration.test.ts` (predicados puros y mutaciones) |
| R4, R5, R6, R7, R8, R9, R10 | `tests/integration/identity/documents-permissions-migration.int.test.ts` |
| R12 | `tests/unit/identity/permissions.test.ts` |
| R13 | `tests/unit/identity/seed/seed-initial-access.test.ts`, `tests/integration/identity/identity-seed.int.test.ts` |
| R14, R15, R16 | `tests/unit/documentos/{issue-upload-links,enqueue-batch,get-batch-status}.test.ts` (describe «documentos.modificar decide, nunca proveedores.*»), `tests/unit/documentos/authorization.test.ts` |
| R17 | `tests/unit/documentos/authorization.test.ts` (el literal se escribe una sola vez; ningún fuente compara nombres de rol) |
| R18 | `tests/unit/documentos/read-document.test.ts` (un actor sin permisos lee y descarga su propia ruta) |
| R19 | `e2e/documentos.spec.ts`, caso existente «sube tres PDFs y ve cambiar el estado … (R20)»: **ROJO en Chromium**, el archivo acaba en `error` en el procesado (ver «Corrida E2E») |
| R20 | `e2e/documentos.spec.ts`, caso nuevo «un rol con proveedores.consultar y proveedores.modificar pero sin documentos.modificar no puede subir (R20 permiso propio)»: **verde en Chromium** (8.7s) |
| R21 | `tests/unit/identity/schema/documents-permissions-migration.test.ts` (sin DDL) y `git diff --stat` de la rama, que no lista `package.json`, `pnpm-lock.yaml`, `db/schema.prisma` ni `docs/dependencias.md` |

## Salida de los tests (corridas de los subagentes, archivo a archivo)

- `pnpm run typecheck`: verde tras `pnpm exec next typegen` (sin él fallaba `LayoutProps`; el worktree
  estaba recién montado).
- `pnpm run lint`: 0 errores; 2 warnings preexistentes en `tests/unit/pedidos/order-service.test.ts`.
- T4, `documents-permissions-migration.test.ts`: 11 passed. Cada mutación en memoria puso rojo su predicado.
- T5, `documents-permissions-migration.int.test.ts`: 8 passed.
- T9, los cinco archivos de `tests/unit/documentos/`: 81 passed. Con T2 revertido en local: 6 failed
  (un R15 y un R16 por caso de uso). Después se restauró.
- T6: `permissions.test.ts` 35/35; `qc75-convenciones.test.ts` 18 passed | 3 skipped;
  `seed-initial-access.test.ts` 21/21; `identity-seed.int.test.ts` 15/15.
- T7, los seis archivos: 104 passed | 9 skipped. Con `PERMISSIONS` vaciado en local: 13 rojos, todos en las
  anclas nuevas. Después se restauró. `document-upload-convenciones.test.ts`: 6/6.
- T8, `catalogo-sin-total-fijo.test.ts`: 7/7. Un `expect(PERMISSIONS.length).toBe(20)` sintético bajo
  `tests/` lo pone rojo (el archivo temporal se borró).
- Comprobaciones extra: `customers-migration.test.ts` + `packer-role-migration.test.ts` 23/23;
  `customers-migration.int.test.ts` 5/5; `packer-role-migration.int.test.ts` 4/4.
- **Aviso de proceso:** el backend_dev de T6-T8 corrió
  `vitest related --run lib/modules/identity/domain/permissions.ts` en segundo plano, y abarcó 397 archivos y
  5797 tests (0 fallos). Es casi la suite entera y va contra la regla. Queda dicho aquí; ese resultado no sustituye al gate.

## T10: bloqueada por una PREGUNTA NUEVA

**Hecho medido.** `app/(private)/proveedores/[id]/page.tsx:85` pide `getSupplierAction(id)` y
`listUnitsAction()` en paralelo. Si las unidades fallan (`:98-107`), la página entera pinta `CatalogListError`
y no monta `<DocumentUpload>`. `lib/modules/unidades/domain/list-units.ts:108` exige
`unidades.consultar`. El rol efímero de design §6 («exactamente `proveedores.consultar` y
`proveedores.modificar`») recibe `unauthorized` **de unidades** y nunca llega a la subida, así que el test
fallaría, o pasaría, por un motivo que no es R20. El caso R19 no lo sufre porque el Administrador tiene todos los permisos.

**Opciones (decide el humano o el leader):**
- (a) el rol efímero suma `unidades.consultar`. Seguiría sin `documentos.modificar`, así que R20 prueba lo
  que tiene que probar, pero cambia el «exactamente» de design §6;
- (b) entrar al componente de subida por otra vía que no dependa de las unidades;
- (c) revisar el design.

**Estado del archivo.** `e2e/documentos.spec.ts` lleva, **sin commitear**, el comentario corregido
de las líneas ~133-135 y el caso nuevo escrito al pie de la letra de §6. typecheck y lint, verdes.

**Incidencia de entorno en la corrida E2E.**
- `pnpm run e2e -- documentos --project=chromium` **no filtró**: corrió la suite E2E entera en
  Chromium y en WebKit (13,2 min, 118 passed / 28 failed). Es lo contrario de lo pedido: una sola corrida, solo Chromium y
  solo documentos. La causa probable es que pnpm pasa el `--` literal a `playwright test`. La forma segura es
  `pnpm exec playwright test e2e/documentos.spec.ts --project=chromium`.
- Los 28 rojos **no se han analizado**. Esa misma tarde QC-158 tenía vivos un `next dev --port 3117` y
  Playwright, y `playwright.config.ts:13` fija `E2E_PORT = 3117` para todos los worktrees
  (con `reuseExistingServer: false`). La colisión puede explicar parte de los rojos. **Esa corrida no vale
  como evidencia**, ni a favor ni en contra.
- No quedan procesos `next` ni Playwright de este worktree.

### Decisión del leader y estado actual (2026-09-24)

- **Opción (a).** El rol efímero lleva `proveedores.consultar`, `proveedores.modificar` y
  `unidades.consultar`, y sigue sin `documentos.modificar`. Design §6 se enmendó con el porqué
  (commit `2680b3d4`).
- `e2e/documentos.spec.ts` está commiteado en `d7627bcf`: el rol lleva el permiso nuevo y, antes de
  comprobar el rechazo, el caso afirma
  `expect(page.getByTestId('document-upload-trigger')).toBeVisible()`, para saber que la página montó la
  subida. El cuerpo de R19 no cambia. typecheck verde; lint con 0 errores.
- **El E2E no se ha corrido.** `prisma migrate status` → `QuimiCloude_QC142`. `netstat` mostraba solo
  `TIME_WAIT` en el puerto 3117. Aun así, `pnpm exec playwright test e2e/documentos.spec.ts --project=chromium`
  falló al arrancar el webServer con `listen EADDRINUSE: address already in use :::3117`: el puerto estaba en
  `LISTENING` por el PID 12852, del worktree `QC-158-catalogo-desde-pdf`, que se lo quedó en ese intervalo.
  No se ejecutó ningún caso y no se mató ningún proceso. No queda vivo ningún proceso de QC-142.
- **R19 y R20 siguen sin verificar.** T10 sigue abierta.

## Pendiente

1. ~~Decidir el rol de R20.~~ Decidido: opción (a). Con la decisión, rehacer T10 y correr una sola vez
   `pnpm exec playwright test e2e/documentos.spec.ts --project=chromium` contra `QuimiCloude_QC142`,
   con el puerto 3117 libre.
2. T11: `./init.sh` completo (lo corre el leader) y confirmar R21 con `git diff --stat dev...HEAD`.

## Corrida E2E (única, 2026-09-24)

- Comprobado justo antes: el puerto 3117 sin LISTEN y ningún proceso `next` ni Playwright vivo en la máquina. `prisma migrate status` → `QuimiCloude_QC142`, al día.
- Comando: `pnpm exec playwright test e2e/documentos.spec.ts --project=chromium --reporter=list` (lo corrió el implementer). El intento previo del subagente murió con `EADDRINUSE` antes de ejecutar ningún caso, así que esta es la única corrida con casos.

```
Running 2 tests using 2 workers
  ✓  2 [chromium] › e2e\documentos.spec.ts:404:7 › documentos › un rol con proveedores.consultar y proveedores.modificar pero sin documentos.modificar no puede subir (R20 permiso propio) (8.7s)
  ✘  1 [chromium] › e2e\documentos.spec.ts:305:7 › documentos › sube tres PDFs y ve cambiar el estado de cada uno hasta terminar (R20) (2.1m)

    Error: expect(locator).toHaveAttribute(expected) failed
    Locator:  getByTestId('document-upload-row-status-0')
    Expected: "done"
    Received: "error"
    Timeout:  120000ms
      4 × ... data-status="queued" ... / 231 × ... data-status="error" ...
      at e2e\documentos.spec.ts:373:77

  1 failed
  1 passed (2.5m)
```

**Qué dice el log del servidor sobre R19 (el rojo):**
- La autorización con el Administrador pasó entera: `issueUploadLinksAction` (3 archivos), `enqueueBatchAction` y `getBatchStatusAction` respondieron 200 y la tanda se encoló.
- El trabajo de la cola procesó los tres PDFs (`[process-pdf-by-strategy] estrategia=catalogo modo=images ... paginas=1 longitud=53`), y cada fila pasó de `queued` a `error`, no a `done`.
- El log no tiene ningún error ni traza del motivo. El `afterAll` borró las filas, así que `error_code` y `error_reason` ya no se pueden leer: la consulta posterior sobre `document_files` salió vacía.
- El fallo está **después** del permiso, en el procesado del PDF, que esta rama no toca: en `lib/modules/documentos` solo cambia la constante de `actor.ts`. En la revisión de QC-107 este mismo caso pasaba (2 passed). **No está aislado** si es un rojo que viene de `dev` o del entorno (por ejemplo, variables de IA en el `.env` del worktree): hace falta otra corrida, que ya no es mía.
- `tests/baseline-rojos.json` está vacío: este rojo no figura como deuda conocida.
- No queda vivo ningún proceso de QC-142.

**Para diagnosticar, sin tocar código:** correr el mismo spec sobre `dev` o sobre `origin/dev` limpio, o repetirlo aquí sin el `afterAll` para leer `document_files.error_code` y `error_reason`.
