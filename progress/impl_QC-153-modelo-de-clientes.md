# QC-153 — modelo-de-clientes · bitácora de implementación

## T0 — Preparación

- Base propia: `QuimiCloude_QC153`, creada con `CREATE DATABASE "QuimiCloude_QC153" TEMPLATE
  "qct_tpl_664cc76c19c8"` (plantilla ya migrada+sembrada de esta rama, 45 migraciones,
  reutilizada por `pnpm run db:test template`).
- `.env` del worktree apunta `DATABASE_URL`/`DIRECT_URL` a `QuimiCloude_QC153` (no se commitea).
- `pnpm run db:test status` con `DATABASE_URL`/`DIRECT_URL` exportadas a `QuimiCloude_QC153`:
  `✓ base de desarrollo «QuimiCloude_QC153» al dia: 45 migracion(es) aplicada(s)`.
- Última migración de `dev` (y de esta rama, que parte de `dev`):
  `20260923140000_product_batch_nullable_machine`, confirmado contra `origin/dev` (`git ls-tree`).
  Ramas en origin con migración posterior no mergeada: `feature/QC-141-...` termina en
  `20260923150200_reserve_existing_orders`; `feature/QC-158-...` termina en
  `20260923180000_supplier_catalog_line_material_and_measurements`. Ninguna aplicada a `dev`
  todavía. `<ts>` elegido para esta ficha: **`20260924120000`** (posterior a las tres).
- Catálogo de `PERMISSIONS` en `dev`/esta rama antes de la ficha (`lib/modules/identity/domain/permissions.ts`):
  **16 códigos**: `dashboard.consultar`, `inventario.consultar`, `inventario.modificar`,
  `recetas.consultar`, `recetas.modificar`, `unidades.consultar`, `unidades.modificar`,
  `proveedores.consultar`, `proveedores.modificar`, `pedidos.consultar`, `pedidos.modificar`,
  `usuarios.consultar`, `usuarios.modificar`, `asignaciones.consultar`, `asignaciones.modificar`,
  `terminados.consultar`.
  Administrador: los 16. Operador: 2 (`inventario.consultar`, `asignaciones.consultar`).
  Empacador: 2 (`asignaciones.consultar`, `terminados.consultar`). Total de asignaciones del
  seed: 20.
  Tras esta ficha (T4): **18** códigos (suma `clientes.consultar`, `clientes.modificar`),
  Administrador **18**, Operador y Empacador sin cambio, total de asignaciones **22**.
- `pnpm install` fue necesario (worktree recién montado, `node_modules` ausente). `pnpm approve-builds`
  en modo no interactivo escribió de más en `pnpm-workspace.yaml` (`ignoredBuiltDependencies`
  ampliado): se revirtió con `git checkout -- pnpm-workspace.yaml` y se corrió
  `pnpm exec prisma generate` directo, que generó el cliente sin problema.

## T1 — `db/schema.prisma`

Modelo `Customer` añadido al final del archivo, tras `DocumentFile`, tal cual `design.md > 2.1`.
`pnpm prisma validate` y `pnpm exec prisma generate` en verde. `pnpm exec next typegen` fue
necesario para que `typecheck` no fallara por `LayoutProps` sin generar (deuda del worktree
recién montado, no de esta ficha). `typecheck` en verde tras eso.
`guard-empresa-en-esquema.test.ts` y `guard-arquitectura-modulos.test.ts`: 77 tests verdes.

## T2 — Migración `20260924120000_customers`

`migration.sql` y `down.sql` escritos a mano según `design.md > 2.2`/`2.3`. Aplicados sobre
`QuimiCloude_QC153` con `pnpm run db:migrate`; probado migrar → `pnpm run db:rollback` →
migrar de nuevo, los tres pasos sin error. `db:test status` confirma 46 migraciones al día tras
la reaplicación.

Alta de `20260924120000_customers` al final de `MIGRACIONES_ESPERADAS`
(`tests/guards/guard-identificador-de-request.test.ts`). `guard-identificador-de-request.test.ts`
y `guard-rls-force.test.ts`: 27 tests verdes.

## T3 — Armazón `lib/modules/clientes/`

`index.ts` (reexporta solo `Customer` de `./domain/customer`), `domain/customer.ts` (el tipo
puro), `ports/.gitkeep`, `adapters/.gitkeep`. `typecheck` en verde;
`guard-arquitectura-modulos.test.ts`: 62 tests verdes.

## T5 — `tests/unit/identity/permissions.test.ts`

`CODIGOS_DEL_REQUISITO`, `MODULOS` y `MODULOS_CON_ESCRITURA` ampliados con `clientes`/los dos
codigos; recuentos subidos a 18; caso «QC-144 R5» reescrito con slicing por indice de
`terminados.consultar` para que no rompa por el orden con los dos codigos nuevos detras (sigue
afirmando exactamente lo mismo: previo + terminados.consultar + lo que venga despues); casos
nuevos R21 (catalogo con los dos codigos exactos y catalogo = previo + los dos), R22
(Administrador con los dos; Operador y Empacador intactos, sin `clientes.*`) y R25 (parrafo de
la enmienda: ≤5 lineas, contiene "enmienda", nombra los dos codigos, sin citas). El detector de
citas sintetico ya existente (linea ~168) sigue mordiendo un JSDoc con `QC-144`.

Verificado con T4 revertido en local (sin commitear, restaurado byte a byte despues): 10 de 31
casos caen, incluidos los tres de R21/R22 nuevos y los que ya afirmaban el recuento/lista del
Administrador. Con T4 en su sitio: 31/31 verdes.

## T6 — Recuentos en guardias y tests unitarios (`design.md > 6.1`)

Archivos tocados: `tests/unit/navegacion/qc75-convenciones.test.ts` (`CODIGOS_QC74` +2,
`MODULOS_DE_NEGOCIO` +`clientes`, recuento 16→18, ancla de 9 enlaces intacta),
`tests/guards/guard-permisos-sembrados.test.ts` (16→18, mensaje sin la lista de fichas previas
—se limpio la cita en la linea tocada, siguiendo `docs/conventions.md > Comentarios`—),
`tests/guards/guard-nav-permisos-declarados.test.ts` (`CODIGOS_VALIDOS` 16→18, ancla de 9
enlaces de menu intacta), `tests/unit/documentos/authorization.test.ts` (16→18),
`tests/unit/pedidos/qc145-estado-solo-planta.test.ts` (16→18, solo el bloque R16 de permisos
que design.md nombra explicitamente), `tests/unit/asignaciones/schema/order-assignments-migration.test.ts`
(`CODIGOS_DE_FICHAS_POSTERIORES` +2 codigos, 16→18, resta a 13 sigue saliendo),
`tests/unit/identity/grupos/scope.test.ts` y `tests/unit/identity/roles/scope.test.ts`
(`PERMISOS_ESPERADOS` 16→18), `tests/unit/identity/seed/seed-initial-access.test.ts` (titulo,
comentario derivado y aserciones: 16→18 permisos, 20→22 asignaciones).

Verificado: los 8 archivos de arriba, 145 tests pasan (12 skip, no relacionados).

**Hallazgo fuera del alcance de esta ficha (no arreglado, reportado):**
`tests/unit/pedidos/qc145-estado-solo-planta.test.ts`, describe `R29 — el esquema no gana
modelos ni tablas: el unico cambio es la columna de R1`, caso `los modelos de db/schema.prisma
son los mismos que en la base de fusion con origin/dev`. Ese caso compara los modelos de
`db/schema.prisma` en HEAD contra los de `git merge-base origin/dev HEAD`, sin acotarse al
diff propio de esa ficha (QC-145): cualquier ficha posterior que añada un modelo Prisma —que es
justo lo que R1 de esta ficha exige (`Customer`)— lo pone en rojo, igual que la deuda ya anotada
de `guard-arquitectura-modulos.test.ts` en `tests/baseline-rojos.json`. No está en el alcance de
`design.md > 6.1` ni en los archivos que `tasks.md` declara tocar, así que no lo he modificado:
lo dejo señalado para que el leader/reviewer decida si entra en `baseline-rojos.json` o se
corrige la guardia (acotarla al propio diff de QC-145 en vez de al merge-base actual).

## T7 — `tests/integration/identity/identity-seed.int.test.ts`

Numeros y comentarios de `design.md > 6.1` actualizados: 16→18 permisos, 20→22 asignaciones,
en los comentarios derivados, el titulo del caso 10 y las aserciones de los casos 10 y 12.

Verificado contra `QuimiCloude_QC153` (`DATABASE_URL`/`DIRECT_URL` exportadas): la corrida de
integracion construyo su plantilla propia (`qct_tpl_1e52306aa6a0`, 46 migraciones incluida
`20260924120000_customers`) y una base efimera (`qct_qc153_a65926a5_mufj77v3_j44`), borrada al
terminar. **15/15 tests verdes.**

## Verificación final (T0–T7)

- `pnpm run typecheck`: sin salida, exit 0.
- `pnpm run lint`: sin salida, exit 0.
- `pnpm prisma validate`: `The schema at db\schema.prisma is valid 🚀`.
- `pnpm exec vitest related --run db/schema.prisma lib/modules/clientes/domain/customer.ts
  lib/modules/clientes/index.ts lib/modules/identity/domain/permissions.ts`: `permissions.ts`
  se importa desde casi todo el dominio de negocio, así que el grafo relacionó **374 archivos /
  5576 tests**. Resultado: **1 fallo, 5555 pasan, 20 skip**. El único fallo es el hallazgo
  fuera de alcance ya descrito (`qc145-estado-solo-planta.test.ts`, R29 modelos vs
  merge-base). Ninguna otra regresión.
- Los archivos de guardia y tests concretos que las tasks nombran, corridos uno a uno
  (`guard-identificador-de-request`, `guard-rls-force`, `guard-empresa-en-esquema`,
  `guard-arquitectura-modulos`, `guard-permisos-sembrados`, `guard-nav-permisos-declarados`,
  y los ocho de T6), todos verdes salvo el hallazgo ya anotado.
- `identity-seed.int.test.ts` contra `QuimiCloude_QC153`: **15/15 verdes**.
- `git diff --name-only origin/dev...HEAD` coincide exactamente con la lista de archivos que
  `tasks.md` declara tocar (más `specs/` y `progress/`); ningún archivo de `e2e/`.

## T8 — `tests/unit/clientes/schema/customers-schema.test.ts`

Lee `db/schema.prisma` como texto (patron de `proveedores-schema.test.ts`). Cubre R1, R3, R4, R5,
R7, R11, R15, R16, R19 y ata el tipo `Customer` del armazon a los campos del modelo con
`satisfies Record<keyof Customer, true>` mas un `toEqual` contra el censo real. Cada detector
lleva su mutacion en memoria (`@relation` en `companyId`, `@unique` en `email`, un campo de mas/
de menos en el tipo, `VARCHAR` en vez de `TEXT`). **9 tests, verdes.**

## T9 — `tests/unit/clientes/schema/customers-migration.test.ts`

Lee el SQL de `migration.sql`/`down.sql` como sentencias (patron de `proveedores-migration.test.ts`).
Cubre R1-R7, R10, R12, R13, R17, R18, R22-R24, R27 y la cabecera sin citas a fichas/requisitos/
`design.md`/«decision cerrada». Los literales de permiso se comparan contra `PERMISSIONS`
importado de `@/lib/modules/identity`. Cada predicado obligatorio tiene su mutacion en memoria
(VARCHAR en vez de TEXT, un segundo indice unico, RESTRICT->SET NULL, FORCE quitado,
Administrador->Operador, un ALTER ajeno a `orders`, CASCADE en el DROP). **9 tests, verdes.**

## T10 — `tests/unit/clientes/scope.test.ts`

Cubre R20 (forma hexagonal: `index.ts` solo reexporta de `./domain`, unicas carpetas
`domain/ports/adapters`, `ports/`/`adapters/` vacias salvo `.gitkeep`, nada declara
`'use server'`), R26 (barrido de `lib/`, `app/`, `components/`, `hooks/`, `middleware.ts`: el
literal `clientes.consultar`/`clientes.modificar` solo en `permissions.ts`, `adapters/driving/`
vacio), R28 (ningun `e2e/*` nombra clientes) y R29 (`package.json` sin claves nuevas contra el
merge-base con `origin/dev`, saltando explicitamente si el rango no existe). **9 tests, verdes.**

## T11 — `tests/integration/clientes/customers-constraints.int.test.ts`

En transaccion revertida (`inRolledBackTransaction` + `SAVEPOINT`, patron de
`proveedores-constraints.int.test.ts`) contra `QuimiCloude_QC153`. Cubre R2, R3, R5-R17: los
`23502`/`23503` de los tres obligatorios y de las tres FK, los duplicados de R7, la clave
candidata `(company_id, id)` de R10 probada con una tabla hija creada dentro de la propia
transaccion (no `TEMP TABLE`: Postgres no permite que una temporal referencie una tabla
permanente, `42P16`; una tabla normal se deshace igual con el `ROLLBACK`), la baja logica de
R14, `updated_at` de R15, el censo de columnas de R16 y `pg_class`/`pg_policies` de R17. Alta de
`clientes/customers-constraints.int.test.ts` y `clientes/customers-migration.int.test.ts` en
`tests/integration/aislamiento.json` (`transaccion`). **16 tests, verdes.**

## T12 — `tests/integration/clientes/customers-migration.int.test.ts`

SQL leido de `migration.sql`/`down.sql` (patron de `identity/packer-role-migration.int.test.ts`),
en transaccion revertida. Cubre R18 (DOWN deja sin tabla, sin los dos permisos ni asignaciones,
resto de `permissions`/`role_permissions` intacto), R23 (DOWN y luego UP: tabla recreada, los dos
permisos asignados solo al Administrador, resto identico) y R24 (permisos y asignacion sembrados
a mano antes del UP: no falla, no duplica, `updated_at` sin reescribir). Caso sintetico adicional
que exige `tasks.md`: un `down.sql` con el `DELETE` de `role_permissions` quitado, corrido de
verdad contra la base dentro de su propia transaccion revertida, cae por la FK RESTRICT de
`role_permissions_permission_code_fkey`. **4 tests, verdes.** Ningun bloqueo con otro archivo de
integracion: no hizo falta pasar nada a `commit`.

## Mapa R1–R29 → test

| Requisito | Test | Caso |
|---|---|---|
| R1 | `customers-schema.test.ts` | «declara id uuid propio mas los seis datos de R1, y ninguno mas (R1, R4)» |
| R1 | `customers-migration.test.ts` | «las columnas de texto son TEXT sin longitud…» |
| R1 | `customers-constraints.int.test.ts` | «crea un cliente con los seis datos de R1 y lo relee sin perdida» |
| R2 | `customers-constraints.int.test.ts` | «rechaza con 23502 un cliente sin nombres, sin apellidos o sin ciudad…» |
| R3 | `customers-schema.test.ts` | «nombres, apellidos y ciudad son obligatorios; telefono, correo y direccion son opcionales por separado (R3)» |
| R3 | `customers-migration.test.ts` | «la migracion no declara ningun CHECK» |
| R3 | `customers-constraints.int.test.ts` | «acepta cualquier combinacion de telefono, correo y direccion ausentes, incluidos los tres (R3)» |
| R4 | `customers-schema.test.ts` | «declara id uuid propio mas los seis datos de R1, y ninguno mas (R1, R4)» |
| R5 | `customers-schema.test.ts` | «los seis datos de negocio son String sin @db.VarChar ni ningun otro tipo nativo (R5)» |
| R5 | `customers-migration.test.ts` | «las columnas de texto son TEXT sin longitud…» |
| R5 | `customers-constraints.int.test.ts` | «acepta textos de 10000 caracteres sin rechazo por longitud (R5)» |
| R6 | `customers-migration.test.ts` | «la migracion no declara ningun CHECK» |
| R6 | `customers-constraints.int.test.ts` | «acepta un correo sin forma de correo y un telefono con cualquier texto (R6)» |
| R7 | `customers-schema.test.ts` | «ningun campo lleva @unique y el unico @@unique es la clave candidata (empresa, id) (R7)» |
| R7 | `customers-migration.test.ts` | «el unico indice unico es la clave candidata (company_id, id)» |
| R7 | `customers-constraints.int.test.ts` | «acepta dos clientes vivos de la misma empresa con exactamente los mismos seis datos» |
| R8 | `customers-migration.test.ts` | «las tres FK son RESTRICT y ninguna es SET NULL» |
| R8 | `customers-constraints.int.test.ts` | «rechaza un cliente sin empresa (23502) y con una empresa inexistente (23503)» |
| R9 | `customers-constraints.int.test.ts` | «rechaza el borrado fisico de una empresa que tiene al menos un cliente, incluso dado de baja (R9)» |
| R10 | `customers-migration.test.ts` | «el unico indice unico es la clave candidata (company_id, id)» |
| R10 | `customers-constraints.int.test.ts` | «la clave candidata (company_id, id) rechaza a un hijo que declara otra empresa (R10)» |
| R11 | `customers-schema.test.ts` | «companyId, createdBy y updatedBy son escalares uuid SIN @relation (R11)» |
| R11 | `customers-constraints.int.test.ts` | «las tres FK existen en pg_constraint, y el cliente Prisma no expone relacion navegable» |
| R12 | `customers-migration.test.ts` | «las tres FK son RESTRICT y ninguna es SET NULL» |
| R12 | `customers-constraints.int.test.ts` | «acepta un cliente sin autor, registra autor y editor, y rechaza un autor inexistente (23503)» |
| R13 | `customers-migration.test.ts` | «las tres FK son RESTRICT y ninguna es SET NULL» |
| R13 | `customers-constraints.int.test.ts` | «rechaza el borrado fisico de un usuario que figura como creador o editor de un cliente (R13)» |
| R14 | `customers-constraints.int.test.ts` | «la baja conserva la fila completa y marca deleted_at, sin ninguna otra columna de estado (R14)» |
| R15 | `customers-schema.test.ts` | «declara createdAt y updatedAt, y el segundo se actualiza solo (R15)» |
| R15 | `customers-constraints.int.test.ts` | «updated_at crece tras un update, y created_at no cambia (R15)» |
| R16 | `customers-schema.test.ts` | «mapea a snake_case en ingles, y la tabla se llama customers (R16)» |
| R16 | `customers-constraints.int.test.ts` | «la tabla y sus columnas estan en snake_case ingles (R16)» |
| R17 | `customers-migration.test.ts` | «customers queda con ENABLE y FORCE, y no hay ningun CREATE POLICY» |
| R17 | `customers-constraints.int.test.ts` | «RLS activada y forzada, sin ninguna policy (R17)» |
| R18 | `customers-migration.test.ts` | «dos DELETE acotados a los dos codigos, en ese orden, y un unico DROP TABLE sin CASCADE (R18)» |
| R18 | `customers-migration.int.test.ts` | «R18: el DOWN deja sin tabla, sin los dos permisos ni sus asignaciones, y el resto del catalogo intacto» y «R18 (sensibilidad): un down.sql sintetico sin el DELETE de role_permissions cae por la FK RESTRICT» |
| R19 | `customers-schema.test.ts` | «declara /// @module clientes, y ningun otro modelo lo reclama (R19)» |
| R20 | `scope.test.ts` | los cuatro casos de `describe('R20 — el modulo clientes nace con la forma hexagonal')` |
| R21 | `tests/unit/identity/permissions.test.ts` | casos de R21 (T5) |
| R22 | `customers-migration.test.ts` | «la asignacion es solo al Administrador, con ON CONFLICT DO NOTHING…» |
| R22 | `tests/unit/identity/permissions.test.ts` | casos de R22 (T5) |
| R23 | `customers-migration.test.ts` | «los literales de permiso son iguales a las entradas de PERMISSIONS importadas» |
| R23 | `customers-migration.int.test.ts` | «R23: DOWN y luego UP recrean la tabla y los dos permisos, asignados SOLO al Administrador, y el resto identico» |
| R24 | `customers-migration.test.ts` | «la asignacion es solo al Administrador, con ON CONFLICT DO NOTHING…» |
| R24 | `customers-migration.int.test.ts` | «R24: si el seed ya creo los dos permisos y su asignacion, el UP no falla, no duplica y no reescribe updated_at» |
| R25 | `tests/unit/identity/permissions.test.ts` | caso de R25 (T5) |
| R26 | `scope.test.ts` | los tres casos de `describe('R26 — sin alta, consulta, edicion ni baja de clientes en esta ficha')` |
| R27 | `customers-migration.test.ts` | «no hay ningun ALTER/DROP/CREATE INDEX sobre otra tabla ni mencion de orders (R27)» |
| R28 | `scope.test.ts` | «ningun archivo de e2e/ menciona clientes» |
| R29 | `scope.test.ts` | «package.json no gano ninguna clave de dependencia contra el merge-base con origin/dev» |

Los `R<n>` de T5–T7 (R21, R22, R25 en `permissions.test.ts`; recuentos en las ocho guardias/tests
de T6; `identity-seed.int.test.ts` en T7) ya estaban mapeados en sus secciones respectivas de
arriba.

## Verificación T8–T12

- `pnpm run typecheck`: sin salida, exit 0.
- `pnpm run lint`: sin salida, exit 0 (tras corregir un `no-unused-vars` en el caso de
  sensibilidad de tipo de `customers-schema.test.ts`).
- `pnpm exec vitest run tests/unit/clientes/schema/customers-schema.test.ts
  tests/unit/clientes/schema/customers-migration.test.ts tests/unit/clientes/scope.test.ts`:
  **Test Files 3 passed (3) · Tests 30 passed (30)**.
- `pnpm exec vitest run tests/integration/clientes/customers-constraints.int.test.ts
  tests/integration/clientes/customers-migration.int.test.ts` (con `DATABASE_URL`/`DIRECT_URL`
  de `QuimiCloude_QC153` exportadas; corrida sobre la base efimera del `globalSetup`):
  **Test Files 2 passed (2) · Tests 20 passed (20)**.
- `pnpm exec vitest run tests/guards/guard-aislamiento-integracion.test.ts`: **6 tests, verdes.**
- `pnpm exec vitest related --run` sobre los tres archivos unitarios: **3 passed, 30 tests
  passed** (mismo resultado que la corrida directa: el grafo no relaciona nada mas fuera de
  ellos mismos y de sus imports).
- Hallazgo fuera de alcance de `qc145-estado-solo-planta.test.ts` (ya reportado en T0–T7): sigue
  presente y sigue sin tocarse; no esta en la lista de archivos que esta tanda declara tocar.

## Verificación T0

```
pnpm run db:test template
  test-db: plantilla reutilizada: qct_tpl_664cc76c19c8 (las migraciones no han cambiado)
  ✓ plantilla de esta rama: qct_tpl_664cc76c19c8 (45 migraciones)

pnpm run db:test status  (DATABASE_URL/DIRECT_URL -> QuimiCloude_QC153)
  ✓ base de desarrollo «QuimiCloude_QC153» al dia: 45 migracion(es) aplicada(s)
```

## Decision humana 2026-09-24: guardian de modelos de QC-145 fijado a su propio merge

El caso rojo (`R29 — el esquema no gana modelos ni tablas`, «los modelos de db/schema.prisma
son los mismos que en la base de fusion con origin/dev, salvo el libro de reservas de
QC-141») comparaba HEAD contra `git merge-base origin/dev HEAD`, asi que cualquier ficha
posterior que anadiera un modelo (esta ficha, con `Customer`) lo ponia en rojo. Se reescribio
para comparar los modelos del propio merge de QC-145 (PR #112) contra su primer padre, sin
depender de fichas posteriores.

- SHA del merge de QC-145 (PR #112) usado, fijo como constante `MERGE_QC145`:
  `51f2d1013f33a3fde50594ac0dde7ec7b7535938` (confirmado con
  `git log --merges --grep="#112" origin/dev --oneline`).
- Verificado a mano: `git show 51f2d1013f33a3fde50594ac0dde7ec7b7535938~1:db/schema.prisma`
  vs `git show 51f2d1013f33a3fde50594ac0dde7ec7b7535938:db/schema.prisma` difieren solo en la
  columna `finishedAt` de `Order`; la lista de `model X {` es identica en ambos.
- La excepcion de QC-141 (`ReservationMovement` en `ESPERADOS_DE_ESTA_RAMA`) se QUITO: ya no
  hace falta, porque la comparacion ya no llega hasta el punto en que `origin/dev` incluye
  QC-141. `ReservationMovement` no aparece en ninguno de los dos lados de la comparacion
  contra el merge de QC-145.
- Hallazgo tecnico: `execSync` en Windows corre por `cmd.exe`, donde `^` es caracter de escape;
  `${MERGE_QC145}^1` se corrompia a un SHA con un caracter de mas. Se uso `${MERGE_QC145}~1`
  (equivalente para primer padre) en su lugar.
- Caso sintetico «dispara con un esquema sintetico que gana un modelo respecto de su padre»
  reescrito para ejercitar la misma funcion `modelosDe` que usa el caso real (antes tenia su
  propia copia local de la funcion).
- Sin red: si el commit no existe (clon superficial), el caso lanza `throw new Error(...)` con
  el motivo, nunca se salta.

Salida real de los comandos pedidos:

```
pnpm exec vitest run tests/unit/pedidos/qc145-estado-solo-planta.test.ts
  Test Files  1 passed (1)
       Tests  18 passed (18)

pnpm exec vitest related --run tests/unit/pedidos/qc145-estado-solo-planta.test.ts
  Test Files  1 passed (1)
       Tests  18 passed (18)

pnpm run typecheck
  (sin salida, exit 0)

pnpm run lint
  2 warnings preexistentes en tests/unit/pedidos/order-service.test.ts (no relacionadas con
  este cambio), 0 errores.
```

## Sincronizacion con origin/dev (implementer, 2026-09-24)

- Merge de `origin/dev` (`08935782`, incluye QC-141) en `6261e981`. Unico conflicto:
  `MIGRACIONES_ESPERADAS` en `tests/guards/guard-identificador-de-request.test.ts`; se conservan las
  tres migraciones de QC-141 (`20260923150000..150200`) y `20260924120000_customers` al final.
- `package.json` sin cambios en el tramo: no hizo falta `pnpm install`.
- `db:migrate` sobre `QuimiCloude_QC153`: aplicadas las tres de QC-141; `db:test status` -> «al dia: 49 migracion(es)».
- `pnpm run typecheck`: limpio. `pnpm run lint`: 0 errores, 2 warnings en `tests/unit/pedidos/order-service.test.ts` (vienen de dev, no de esta rama).
- Archivos de la ficha + censos tocados (19 archivos, integracion incluida contra base efimera):
  `Test Files 1 failed | 18 passed (19)`, `Tests 1 failed | 264 passed | 12 skipped (277)`.
  El unico rojo: `tests/unit/pedidos/qc145-estado-solo-planta.test.ts` > «los modelos de db/schema.prisma
  son los mismos que en la base de fusion con origin/dev, salvo el libro de reservas de QC-141». No esta
  en `tests/baseline-rojos.json`. Lo pone rojo el modelo `Customer` (R1). QC-141 resolvio el mismo choque
  anadiendo su modelo como excepcion nombrada en ese caso; aqui NO se ha tocado: pendiente de decision.
- Gate completo (`./init.sh`) NO corrido: lo corre el leader.

## Decision humana 2026-09-24: pedidos-schema, derogacion parcial

`tests/unit/pedidos/schema/pedidos-schema.test.ts`, caso «Order no declara cliente, destinatario
ni ninguna columna equivalente», prohibia dos cosas: (a) campos de cliente/destinatario en `Order`,
y (b) un catalogo de clientes (modelos `Customer`/`Client`/`Recipient`/`Buyer` y sus `@@map`).
Decision humana: (b) queda derogada solo para `Customer`/`customers` por el modulo Clientes
(QC-152/QC-153, 2026-09-24); (a) sigue vigente hasta QC-156.

Cambios:
- Se retiro `Customer` de la lista `forbidden` de modelos y `customers` del regex `@@map`
  prohibido en ese caso. `Client`, `Recipient`, `Buyer`, `clients` y `recipients` se mantienen.
- Se reescribio el comentario del caso para reflejar la derogacion parcial y su fecha.
- Se anadio nota fechada 2026-09-24 en `specs/QC-153-modelo-de-clientes/design.md` §6.1.
- La aseveracion (a) sobre los campos de `Order` no se toco.

Salida real:
```
pnpm exec vitest run tests/unit/pedidos/schema/pedidos-schema.test.ts
  Test Files  1 passed (1)
       Tests  28 passed (28)

pnpm run typecheck
  (sin salida, exit 0)

pnpm run lint
  2 warnings preexistentes en tests/unit/pedidos/order-service.test.ts (no relacionadas con
  este cambio), 0 errores.
```
