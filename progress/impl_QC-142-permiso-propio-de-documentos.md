# QC-142 — permiso-propio-de-documentos · bitácora de implementación (F2.1)

> Implementer, 2026-09-24. Rama `feature/QC-142-permiso-propio-de-documentos`, worktree
> `.worktrees/QC-142-permiso-propio-de-documentos`. Sin push ni PR. No me autoapruebo.
> **Estado (vuelta 2, 2026-09-24):** T1-T10 cerradas; T10 con salvedad (el leader la cerró en `7d62679b`:
> R19 es un rojo heredado de `dev`). T11 abierta, es del leader. Hechos los arreglos de la review de F2.2
> (M1, m1-m9) y los dos rojos del gate; ver «Vuelta 2».

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

- **Cerradas `[x]`:** T1 a T9, y T10 con salvedad: el caso R20 pasa y R19 es un rojo heredado de `dev`
  (lo cerró el leader en `7d62679b`, según `progress/current.md > Deudas`).
- **Abierta `[ ]`:** T11 (`./init.sh` completo, lo corre el leader).

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
| R19 | `e2e/documentos.spec.ts`, caso existente «sube tres PDFs y ve cambiar el estado … (R20)»: **ROJO en Chromium**: el archivo acaba en `error` en el procesado, después de autorizar. Es rojo heredado de `dev`, medido sobre `origin/dev` limpio al cerrar QC-146; decisión del leader en `7d62679b`. Tiene que constar en el PR |
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

## T10: cómo se llegó al E2E (historia, ya resuelta)

- **Pregunta nueva que salió, resuelta por el leader con la opción (a).** La página de detalle de proveedor
  también pide las unidades (`app/(private)/proveedores/[id]/page.tsx:85, 98-107`; `list-units.ts:108`
  exige `unidades.consultar`). El rol efímero de R20 lleva `proveedores.consultar`, `proveedores.modificar` y
  `unidades.consultar`, y sigue sin `documentos.modificar`. Design §6 recoge la enmienda (`2680b3d4`) y el
  spec va en `d7627bcf`. Antes de comprobar el rechazo, el caso exige ver `document-upload-trigger`.
- **Corridas que NO valen como evidencia.** La primera fue `pnpm run e2e -- documentos --project=chromium`,
  que no filtró: lanzó la suite entera en Chromium y WebKit (13,2 min, 118 passed / 28 failed) y chocó con
  un `next dev` de QC-158 en el puerto 3117, que `playwright.config.ts:13` fija igual para todos los
  worktrees. La segunda murió en el arranque con `EADDRINUSE` (el puerto lo había cogido QC-158) y no
  ejecutó ningún caso. No se mató ningún proceso ajeno.
- La única corrida válida es la de «Corrida E2E», abajo.

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

**Resolución:** el leader midió el mismo rojo sobre `origin/dev` limpio al cerrar QC-146. Es deuda heredada y está anotada en `progress/current.md > Deudas`. T10 se cerró con esa salvedad en `7d62679b`. No va al baseline.

## Vuelta 2 (review F2.2 rechazada: 1 mayor, 9 menores; y dos rojos del gate)

La review está en `progress/review_QC-142-permiso-propio-de-documentos.md` (commit `ace494d6`).

| Punto | Commit | Qué se hizo |
|---|---|---|
| M1 + m1 | `e4417e4c` | `catalogo-sin-total-fijo.test.ts`: `sinComentarios` tokeniza con `ts.createScanner` (typescript ya era devDependency), así que un `/**` dentro de un string deja de contar como comentario. Los patrones se prueban sobre la fuente con los espacios colapsados, con una ventana `.{0,300}?`: `[^;]` no sirve porque el mensaje real lleva un `;`. Hay dos casos sintéticos con el texto EXACTO de `origin/dev` (la aserción multilínea de `guard-permisos-sembrados` y el `it('… lib/** …')` + `toHaveLength(18)` de `qc145-estado-solo-planta`), y los dos disparan. Pasado sobre los dos archivos completos de `origin/dev`, el predicado dispara; el código viejo no lo hacía. Se añade un ancla del barrido: más de 0 archivos y entre ellos `guard-permisos-sembrados.test.ts`. `readdirSync` ya no se traga los errores. m1 amplía el predicado a `codigosDelAdministrador)`, `antes.permisos)` y `antes.asignaciones)` + `toHaveLength(`, cada uno con su caso. **No se amplió** a `codigos)`, `new Set(codigos).size)` ni `catalogo)`: esos identificadores se reutilizan con totales propios de otros catálogos (`grupos/errors` 7, `usuarios/errors` 12, `unidades/errors` 9, `list-query-units.int` 3) y darían falsos positivos. 13 passed; el barrido real no encuentra nada |
| Gate: aislamiento | `cab8caf6` | `identity/documents-permissions-migration.int.test.ts` entra en `tests/integration/aislamiento.json > transaccion` (usa transacción revertida con `RollbackSignal`, como `packer-role-migration`). El modo `transaccion` no pide motivo ni fecha. `guard-aislamiento-integracion.test.ts`: 6 passed |
| Gate: showcase R29 | `e476cfd1` | `guard-convenciones-showcase.test.ts`: R29 y su pareja comparan el merge de QC-140 (`a738d81f`, PR #118) contra `a738d81f~1`, igual que los precedentes `bb01139e` y `7cd534e8`. Si falta el commit, error explícito. Anti-placebo: el commit real `ffabc3af`, que añade archivos en `db/`, hace que el mismo diff no salga vacío. Revisados `guard-convenciones-proveedores` y `guard-herencia-armazon-privado`: son de QC-44, filtran por marca y hacen skip explícito, así que no fallan aquí y no se tocan. Ningún otro test de alcance de QC-140 mira `origin/dev..HEAD`. 17 passed, 4 skipped |
| m2 + m3 | `2baf5a30` | Comentarios que habían quedado falsos (el «veintidos…» del seed; el «codigo QUE YA EXISTIA» de convenciones; el «un rol efimero no probaria…» del E2E) y citas de ficha o de R en comentarios añadidos por la rama (E2E, cabecera del int, JSDoc de los predicados). Los R<n> se quedan en los nombres de caso |
| m4 | `e2b74a44` | Cabecera de `migration.sql` de 9 a 4 líneas. En `permissions.ts`, el párrafo con ordinal pasa a una frase corta, y se recomponen las líneas partidas del JSDoc. `prisma migrate status` sobre `QuimiCloude_QC142` antes y después: al día, sin aviso. Solo cambia un comentario, pero el checksum del archivo cambia: la base propia ya la tenía aplicada, y ninguna otra base la ha aplicado todavía |
| m5 | `704ba223` | R17 importa `ROLE_EMPACADOR` y afirma que la lista de fuentes del módulo tiene elementos |
| m6 | `abdc3e45` | R10 compara `permissions`, `role_permissions` y `roles` completas antes del UP y después del DOWN. «R9 UP tras seed» afirma que el Administrador ya tenía los dos `documentos.*` antes de aplicar |
| m7 | `b5d451dd` | R2: `PERMISOS_PREVIOS`, las entradas de `origin/dev` con módulo, acción y descripción copiadas a mano; cada una tiene que seguir igual en `PERMISSIONS`. Sin total |
| m8 | `1f05998c`, `be5413c7` | R13 «base sembrada antes de esta feature»: el unit parte de un repo sin `documentos.*` y el seed crea exactamente esos permisos y las asignaciones del Administrador; Operador y Empacador quedan sin ellos y la segunda corrida no escribe nada. Hay caso equivalente en `identity-seed.int.test.ts`. El segundo commit arregla un typecheck |
| m9 | este commit | Bitácora coherente con `tasks.md` y con el cierre de T10 del leader |

**Salidas de la vuelta 2** (archivos concretos, corridos por los subagentes):
- `catalogo-sin-total-fijo.test.ts` 13 passed.
- `guard-aislamiento-integracion.test.ts` 6 passed.
- Los tres guards de `proveedores-ui`: 17 passed, 4 skipped.
- Tanda unit de m2-m8 (6 archivos, `catalogo-sin-total-fijo` incluido): 110 passed, 0 failed.
- Integración (`documents-permissions-migration.int` + `identity-seed.int`, base efímera de plantilla): 24 passed, 0 failed.
- `pnpm run typecheck`: limpio. `pnpm run lint`: 0 errores (los 2 warnings preexistentes de `order-service.test.ts`).
- No se corrieron ni `./init.sh` ni la suite completa ni el E2E. El baseline no cambia.

