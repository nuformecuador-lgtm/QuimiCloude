# QC-161 rol-maestro — bitacora de implementacion

## T0

Fecha: 2026-10-01. Rama `feature/QC-161-rol-maestro` en `89f5bf52` (merge de `origin/dev`,
cuya punta es `0dbcd68f`).

### Entorno

- `pnpm install --frozen-lockfile`: el worktree no tenia `node_modules`. Solo el lock, ninguna
  dependencia nueva. Tambien `prisma generate` (el seed fallaba sin el cliente).
- Base `QuimiCloude_QC161` creada en el mismo servidor que `QuimiCloude` (localhost:5432, mismas
  credenciales). `QuimiCloude` no se toco.
- `.env` del worktree (git-ignorado, `git check-ignore .env` lo confirma): `DATABASE_URL` y
  `DIRECT_URL` nombran `QuimiCloude_QC161`; se comprobo con un `grep -c` = 2 antes de cada
  `db:migrate` y `db:seed`.
- `pnpm run db:migrate`: 56 migraciones aplicadas, la ultima `20260925120100_packing_permission`.
- `pnpm run db:seed`: ok. Empresa inicial `QuimiCloud`, usuario inicial creado. En base: 21
  permisos, roles `Administrador`, `Empacador`, `Operador`, 1 usuario vivo.
- Anadidas al `.env` del worktree: `SEED_MAESTRO_USERNAME=plataforma.inicial`,
  `SEED_MAESTRO_PASSWORD` (cumple `credential-policy.ts`: >= 8, mayuscula, minuscula, digito,
  simbolo; valor no anotado) y `SEED_MAESTRO_EMAIL=plataforma.inicial@quimicloude.local`. El
  nombre no coincide con `SEED_ADMIN_USERNAME` (`admin`) ni con los fixtures.

### Re-medicion de `design.md > 0` contra `origin/dev`

**Hallazgo 1 (catalogo y ordinal).** El catalogo tiene ahora **21** codigos: entro
`empaque.modificar` (`permissions.ts:176-181`). El JSDoc de `PERMISSIONS` tiene dos parrafos sin
ordinal: `documentos` (`:45-46`, sin cambio de linea) y **`empaque`** (`:48-50`, nuevo). Contando
ambos (sexta y septima), el ordinal de la enmienda de esta ficha pasa de «Septima» a **«Octava»**.
La frase del recuento sigue sin numero (`:8`). La guardia `catalogo-sin-total-fijo` sigue vigente.

**Nuevo en `dev`: `ADMIN_EXCLUDED_PERMISSIONS`** (`permissions.ts:229-234`, reexportado en
`lib/modules/identity/index.ts`), hoy `['empaque.modificar']`. Su JSDoc dice que existe para que
quien compare «lo que tiene el Administrador» contra «el catalogo entero» reste esta lista. Ya no
es cierto que el Administrador tenga el catalogo entero en `dev`.

**Hallazgo 2 (tests que igualan Administrador = catalogo).** Ya no hay ninguno; los reescribio
la ficha de empaque:

| Design | Ahora |
|---|---|
| `permissions.test.ts:381-382, 459-461, 464-467, 496-507` `toEqual(CODIGOS_DEL_REQUISITO)` | `CODIGOS_DEL_ADMINISTRADOR` en `:47-49` (= `CODIGOS_DEL_REQUISITO` menos `ADMIN_EXCLUDED_PERMISSIONS`), usado en `:448, :540, :546, :587` |
| `seed-initial-access.test.ts:752-756` Administrador = `PERMISSIONS` | `:755-758` ya compara con `SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]` |
| `identity-seed.int.test.ts:795-798, 835, 872, 1038` = `CODIGOS_DEL_CATALOGO` | `:797, :834, :871, :1038` ya usan `codigosSembradosDe(ROLE_ADMINISTRADOR)`. `CODIGOS_DEL_CATALOGO` (`:286`) queda solo en `:786, :793, :979`, que comparan permisos **creados**, no los del Administrador |

Otras lineas de `design.md > 2.4` que se movieron:

- `permissions.test.ts`: `CODIGOS_DEL_REQUISITO` `:21-43` (termina en `empaque.modificar`, `:42`);
  `MODULOS` `:168-182` (incluye `empaque`), `MODULOS_CON_ESCRITURA` `:184-193`,
  `MODULOS_SIN_ESCRITURA` `:195`, **`MODULOS_SOLO_ESCRITURA` `:198` (nuevo)**.
- El caso «previo mas `clientes.*` mas `documentos.*`» ya no esta en `:296-312`: es `R21`
  `:324-341` y ahora termina en `empaque.modificar`.
- **Tests de orden nuevos que asumen que `empaque.modificar` es el ultimo codigo** y que se pondran
  rojos al anadir `empresas.*` al final de `PERMISSIONS`/`CODIGOS_DEL_REQUISITO` (el design no los
  lista): `QC-142 R2` `:237-254`, `R21` `:324-341`, `R35` `:361-365`
  (`toEqual([...catalogoPrevio, 'empaque.modificar'])`). `QC-144 R5` `:343-349` usa `slice` y no
  se rompe. Arreglo del mismo tipo que el de `:296-312` del design: filtrar `empresas.*` del previo
  y anadirlos en su posicion.
- `R34` `:416-433` busca el parrafo del JSDoc que contiene `empaque.modificar`: el parrafo nuevo
  de `empresas` no debe nombrar `empaque.modificar`.
- `qc75-convenciones.test.ts`: `CODIGOS_QC74` `:53-75` (ultimo `empaque.modificar` en `:74`);
  modulos esperados `:147-150`, ahora `[..., 'usuarios', 'terminados', 'empaque']`.
- `order-assignments-migration.test.ts`: `CODIGOS_DE_FICHAS_POSTERIORES` `:869-876` (incluye
  `empaque.modificar`).
- `permissions.ts`: JSDoc de `SEED_ROLE_PERMISSIONS` `:191-201` (anade la frase del Empacador),
  mapa `:202-227`, Empacador `:226` = `['asignaciones.consultar', 'terminados.consultar',
  'empaque.modificar']`.

**Hallazgo 17.** Sin cambios: `identity-constraints.int.test.ts:1433-1481` (comentario del `admin`
de la instalacion en `:1472-1473`; `SEED_ADMIN_USERNAME` de este worktree es `admin`, asi que ese
caso chocara con el Administrador sembrado una vez el indice sea global), `user-crud.int.test.ts`
`:509` y `:525`.

**Hallazgo 20.** La ultima migracion de `dev` es **`20260925120100_packing_permission`** (antes
`20260924190100_finished_products_and_content_copies`; entre medias `20260924200000_customers_search_normalized`
y `20260925120000_order_packing_states`). El `<ts>` de esta ficha va despues de `20260925120100`.

### Para T2/T3 (sin aplicar; decide el implementer o el leader)

- Ordinal de R7: **Octava**.
- Con `ADMIN_EXCLUDED_PERMISSIONS` en `dev`, la forma natural de D4 es anadir
  `empresas.consultar` y `empresas.modificar` a esa lista: `CODIGOS_DEL_ADMINISTRADOR` y las cuatro
  comparaciones de `permissions.test.ts` siguen en verde sin reescribirse, y la frase del
  JSDoc de la constante ya describe ese uso. El design (§2.3, §2.4) no conoce la constante: si se
  usa, es una desviacion menor que hay que anotar; si no se usa, la constante queda mintiendo
  («los codigos que el Administrador NO recibe») y `CODIGOS_DEL_ADMINISTRADOR` incluiria
  `empresas.*`, con lo que `:448` se pondria rojo.
- T3 para `seed-initial-access.test.ts` e `identity-seed.int.test.ts` se reduce a anadir el caso
  «el Administrador no tiene ningun `empresas.*`»: las igualdades ya estan derivadas del dominio.
- T2 suma tres tests de orden (`:237-254`, `:324-341`, `:361-365`) a los que hay que reescribir.

### Bloqueos

Ninguno del spec: lo que se movio se acomoda con el mismo tipo de arreglo que ya preve el design.

**`./init.sh --rapido` en rojo por `dev`, no por esta ficha** (arbol sin cambios propios,
`git status` limpio):

- Entorno, fichas, cupo, specs y `QuimiCloude_QC161` al dia (56 migraciones): ok.
- `pnpm run typecheck`: **falla** y el gate se para ahi.
  - `lib/shared/observability/logger.ts(19,18)`: `Cannot find module 'pino'`. `pino` no esta en
    `package.json` ni en `docs/dependencias.md`.
  - `tests/unit/documentos/run-document-job-log.test.ts` (`:121, 150, 171, 191, 216, 241, 272`):
    `'log' does not exist in type 'RunDocumentJobDeps'`.
  - Los dos vienen de `1d85d170 chore(logger): logger general pino y puerto DocumentJobLog con
    tests`, que ya esta en `origin/dev`. `tests/baseline-rojos.json` esta vacio y, ademas, es un
    rojo de `typecheck`, no de un archivo de test.
- Medido aparte, porque el gate no llega: `pnpm exec vitest run guard` 51 archivos / 649 tests en
  verde (11 skipped); `pnpm run lint` 0 errores, 7 warnings.

El «Hecho» de T0 pide `--rapido` verde antes de tocar nada: **no se cumple por deuda de `dev`**. Lo
tiene que resolver `dev` (o el leader decidir); no se arregla en esta rama.

## T1 — El rol Maestro

Nota: `pnpm run typecheck` ya pasa en la rama (el rojo de `pino` de T0 lo resolvio el merge de
`origin/dev` con el fix #132).

### Archivos

- `lib/modules/identity/domain/roles.ts`: `ROLE_MAESTRO = 'Maestro'`, fila al final de
  `SEED_ROLES` («Dueno de la plataforma: gestiona las empresas.»), cabecera «cuatro literales».
- `lib/modules/identity/index.ts`: reexporta `ROLE_MAESTRO`.
- `tests/unit/identity/roles/maestro-rol.test.ts` (nuevo).
- `tests/unit/identity/roles/empacador-rol.test.ts`: el caso «SEED_ROLES tiene exactamente tres
  filas» se puso rojo con la fila nueva; sigue siendo una igualdad exacta, ahora con el Maestro
  al final (no se relaja a `slice`/`toContain`).

### Mapa R<n> -> test (`tests/unit/identity/roles/maestro-rol.test.ts`)

| R | Casos |
|---|---|
| R2 | «R2: SEED_ROLES tiene una fila Maestro con descripcion no vacia»; «R2: Administrador, Operador y Empacador conservan su nombre y su descripcion exactos» (Administrador = «Acceso total al sistema.»); «R2: el Maestro va al final y los tres roles de antes conservan su orden» |
| R3 | «R3: solo aparece en lib/modules/identity/domain/roles.ts»; anti-cegado «R3: dispara con un fuente sintetico…»; «R3: el caso simetrico: importar la constante o nombrar el literal en un comentario no dispara» |
| R4 | «R4: el modelo Role de db/schema.prisma no declara ninguna columna de empresa»; «R4: SEED_ROLES declara una sola fila Maestro» |
| R17 | «R17: empresas.consultar y empresas.modificar solo aparecen en el catalogo de permisos» (mensaje de fallo que avisa a QC-162); «R17: dispara con un fuente sintetico…»; «R17: el caso simetrico…» |

### Salida

- `pnpm run typecheck`: verde (sin salida de `tsc`).
- `vitest run tests/unit/identity/roles`: 6 archivos, 60 passed, 4 skipped. `maestro-rol.test.ts`:
  11 passed.
- `vitest related` sobre `index.ts` arrastra casi toda la suite (el barrel lo importa todo): se
  corto y se corrio en su lugar todo test unitario o guardia que nombra `SEED_ROLES` o
  `ROLE_EMPACADOR` (15 archivos). Rojos esperados que cierran tasks posteriores:
  `guard-permisos-sembrados` (el Maestro aun sin permisos: T2) y cuatro casos de
  `seed-initial-access.test.ts` con listas de roles escritas a mano o `toHaveLength(3)` (T3).

## T2 — Los dos permisos y quien los recibe

### Archivos

- `lib/modules/identity/domain/permissions.ts`: `empresas.consultar` y `empresas.modificar` al
  final de `PERMISSIONS`; parrafo «**Octava enmienda al catalogo cerrado**» (3 lineas, sin citas,
  sin nombrar `empaque.modificar`); `[ROLE_MAESTRO]: ['empresas.consultar', 'empresas.modificar']`
  y su frase en el JSDoc de `SEED_ROLE_PERMISSIONS`; `ADMIN_EXCLUDED_PERMISSIONS` suma los dos
  (desviacion aprobada, `design.md > 2`) y su JSDoc dice por que excluye cada cosa. La frase del
  recuento no se toca.
- `tests/unit/identity/permissions.test.ts`: `CODIGOS_DEL_REQUISITO` suma los dos;
  `MODULOS`/`MODULOS_CON_ESCRITURA` suman `empresas`; los tres casos de orden que daban por hecho
  que `empaque.modificar` era el ultimo (`QC-142 R2`, `R21`, `R35`) filtran `empresas.*` del
  previo y exigen exactamente `empresas.consultar`, `empresas.modificar` detras de
  `empaque.modificar` (siguen siendo igualdades exactas de la lista entera; ningun total);
  `R6: el seed asigna permisos SOLO a roles` suma `ROLE_MAESTRO` a las claves exactas.
  `CODIGOS_DEL_ADMINISTRADOR` y sus cuatro comparaciones no cambian: siguen verdes gracias a
  `ADMIN_EXCLUDED_PERMISSIONS`. Bloque nuevo `QC-161 — los permisos de empresas y el Maestro`.
- `tests/unit/identity/roles/maestro-rol.test.ts`: el barrido de R17 afirma ademas que ve el
  catalogo (anti-cegado real, ahora que los codigos existen).

### Mapa R<n> -> test (`tests/unit/identity/permissions.test.ts`, bloque «QC-161 — …»)

| R | Casos |
|---|---|
| R5 | «R5: el catalogo contiene empresas.consultar y empresas.modificar y ningun otro empresas.*»; «R5: todo codigo que el catalogo tenia antes sigue en el, en el mismo orden»; ademas «R2: contiene exactamente los codigos del requisito» |
| R6 | «R6: los dos codigos tienen modulo empresas, su accion y descripcion no vacia»; «R6: la descripcion de empresas.modificar nombra el alta, la edicion y la baja»; ademas «R1: cada codigo es `<modulo>.<accion>`…» y «R3: cada modulo con escritura declara consultar Y modificar» con `empresas` |
| R7 | «R7: el JSDoc del catalogo tiene el parrafo de la enmienda de empresas, con ordinal y sin citas»; caso simetrico «R7: el caso simetrico: el detector rechaza parrafos sinteticos que citan, no tienen ordinal o pasan de cinco lineas» |
| R8 | «R8: el Maestro recibe exactamente empresas.consultar y empresas.modificar, escritos uno a uno» |
| R9 | «R9: el Administrador no tiene ningun empresas.* y sigue siendo el catalogo menos los excluidos» (igualdad exacta con el catalogo sin `empresas.*` ni `empaque.modificar`, independiente de `ADMIN_EXCLUDED_PERMISSIONS`); «R9: Operador y Empacador conservan exactamente sus permisos y ninguno tiene empresas.*» |
| R17 | `maestro-rol.test.ts` «R17: empresas.consultar y empresas.modificar solo aparecen en el catalogo de permisos» (ahora con `toEqual([permissions.ts])`) |

### Salida

- `pnpm run typecheck`: verde.
- `vitest run permissions.test.ts roles/ guard-permisos-sembrados catalogo-sin-total-fijo`:
  9 archivos, 133 passed, 4 skipped.
- Barrido de todo test unitario o guardia que nombra el catalogo (`PERMISSIONS`,
  `empaque.modificar`, `PermissionCode`, `ADMIN_EXCLUDED_PERMISSIONS`, `SEED_ROLES`; 91 archivos):
  8 rojos.
  - De T3: `qc75-convenciones.test.ts` (2), `order-assignments-migration.test.ts` (1),
    `seed-initial-access.test.ts` (3; el cuarto que salia en T1 ya esta verde con los permisos del
    Maestro).
  - **Deuda de `dev` no listada en `tests/baseline-rojos.json`**: `tests/unit/inventario/product-page.test.tsx`
    («R18 — el nombre del producto se pinta junto a la unidad guardada»: espera `Hipoclorito · kg`,
    recibe `Hipoclorito`) y `tests/unit/recetas-ui/recipe-page.test.tsx` («R21: las acciones van en
    una columna que no se puede fijar…»). Comprobado: los dos fallan igual en `40d0dea2` (punta de
    la rama antes de T1), en un worktree temporal desprendido. No tocan permisos ni roles.

## T3 — Las demas listas a mano y «Administrador = catalogo menos los excluidos»

Reducida segun T0: las igualdades del Administrador ya se derivan del dominio
(`SEED_ROLE_PERMISSIONS`, `codigosSembradosDe`) y siguen verdes sin tocarse.

### Archivos (solo tests)

- `tests/unit/navegacion/qc75-convenciones.test.ts`: `CODIGOS_QC74` suma los dos codigos; los
  modulos esperados suman `empresas` (con `usuarios`, `terminados`, `empaque`).
- `tests/unit/asignaciones/schema/order-assignments-migration.test.ts`:
  `CODIGOS_DE_FICHAS_POSTERIORES` suma los dos.
- `tests/unit/identity/seed/seed-initial-access.test.ts`: los tres casos que listaban los roles a
  mano o contaban «tres» (rojos desde T1) derivan la lista de `SEED_ROLES` (`design.md > 10.1`;
  el caso del fallo de `createInitialAdmin` pasa de `toHaveLength(3)` a igualdad exacta, en
  orden, con los nombres de `SEED_ROLES`; el de «solo existe el Administrador» exige ademas que
  Operador y Empacador esten entre los faltantes). Caso nuevo de R8/R9 contra el doble.
- `tests/integration/identity/identity-seed.int.test.ts`: caso nuevo de R9 contra Postgres. El
  caso existente «R25 — cada rol de semilla…» ya recorre `SEED_ROLES` y cubre al Maestro sin
  tocarlo.

### Mapa R<n> -> test

| R | Test |
|---|---|
| R5 | `qc75-convenciones.test.ts` «tiene exactamente los codigos de CODIGOS_QC74, sin duplicados»; `order-assignments-migration.test.ts` «revertir devuelve el catalogo persistido al de QC-66 (R34)» |
| R8, R9 | `seed-initial-access.test.ts` «QC-161 R8, R9: sobre una base vacia el Maestro recibe exactamente empresas.consultar y empresas.modificar; el Administrador, el Operador y el Empacador ningun empresas.*» |
| R9 | `identity-seed.int.test.ts` «QC-161 R9 — tras sembrar sobre base vacia, el Administrador, el Operador y el Empacador no tienen ningun empresas.* en `role_permissions`» (con anti-cegado: los dos codigos estan en `permissions`) |
| R8 (y R18 parcial) | `identity-seed.int.test.ts` «R25 — cada rol de semilla tiene en `role_permissions` exactamente los permisos que declara SEED_ROLE_PERMISSIONS» (sin cambios; ahora incluye al Maestro) |

### Salida

- `pnpm run typecheck`: verde.
- `vitest run seed-initial-access qc75-convenciones order-assignments-migration catalogo-sin-total-fijo`:
  4 archivos, 98 passed, 3 skipped.
- `vitest run tests/integration/identity/identity-seed.int.test.ts -t "QC-161 R9|R25 — cada rol"`
  (`.env` con `QuimiCloude_QC161` comprobado; base efimera desde la plantilla
  `qct_tpl_4295644d322f`, borrada al terminar): 2 passed, 15 skipped. El resto del archivo es de
  T8 (necesita las `SEED_MAESTRO_*` y el seed del Maestro) y no se corrio.
- Queda en pie `qct_qc161_95232936_mupntzdx_mx4`, base efimera de una corrida de `vitest related`
  que se corto en T1; `db:test clean` la retiene porque el worktree sigue vivo. Cae al desmontar
  el worktree.

## T4 — La guardia de autorizacion por permiso

### Archivos (solo tests)

- `tests/guards/guard-autorizacion-por-permiso.test.ts`: `buildForbiddenPatterns()` suma el
  literal derivado de `ROLE_MAESTRO` y el identificador `ROLE_MAESTRO` (y su JSDoc dice por que);
  el ancla de patrones se tensa con los dos y con `ROLE_MAESTRO === 'Maestro'`; tres casos
  sinteticos nuevos.

### Mapa R<n> -> test (`tests/guards/guard-autorizacion-por-permiso.test.ts`)

| R | Casos |
|---|---|
| R16 | «QC-161 R16: los patrones se derivan de los roles reales de identity, que siguen siendo Administrador, Operador, Empacador y Maestro» (ancla); «QC-161 R16: dispara con un actor.ts sintetico que compara el literal del rol Maestro» (tres comillas); «QC-161 R16: dispara con un actor.ts sintetico que importa y usa ROLE_MAESTRO»; «QC-161 R16: el caso simetrico — el rol Maestro dentro de un comentario NO dispara»; y el barrido real «ningun archivo de los seis modulos de negocio usa el rol para autorizar», ahora con el Maestro |

### Salida

- `pnpm run typecheck`: verde.
- `vitest run guard-autorizacion-por-permiso`: 16 passed.
- Mordida comprobada a mano (copia de respaldo, mutacion, restaurado): sin el patron del literal
  caen el ancla y «dispara … literal del rol Maestro»; sin el del identificador caen el ancla y
  «dispara … importa y usa ROLE_MAESTRO» (2 failed / 14 passed en cada mutacion).

## Cierre de la tanda T1-T4 — `./init.sh --rapido`

Primera corrida (punta `4bdf15dc`): entorno, fichas, cupo, specs, `QuimiCloude_QC161` al dia (56
migraciones), typecheck y lint en verde. `test:rapido`: el diff toca el barrel
`lib/modules/identity/index.ts`, asi que `vitest related` selecciona 480 archivos (incluida
integracion): 5 archivos / 12 casos rojos, 6848 passed, 26 skipped (846 s).

- Baseline (`tests/baseline-rojos.json`): `unidades-viewport.test.tsx` (2) y
  `usuarios-viewport.test.tsx` (2). `account-status-scope.test.ts` no salio seleccionado.
- **Deuda de `dev` fuera del baseline** (rojos en `40d0dea2`, antes de T1; ver T2):
  `inventario/product-page.test.tsx` (1) y `recetas-ui/recipe-page.test.tsx` (1).
- **De esta rama**: `tests/integration/identity/identity-seed.int.test.ts` (6). Cinco contaban
  los roles con un `3` escrito a mano (`:405, 434, 448, 521, 577, 637, 652, 701`): ahora
  `SEED_ROLE_NAMES.length` (commit aparte de T3). El sexto, «QC-142 R13: sobre la base ya
  sembrada salvo documentos.*…», sigue rojo y **cierra en T5**: la base de la corrida sale de la
  plantilla `qct_tpl_4295644d322f`, cuya huella (migraciones + `seed.ts` +
  `seed-initial-access.ts`) no cambia con `permissions.ts`, asi que se reutiliza sembrada con el
  catalogo de antes, sin `empresas.*` ni rol Maestro; el seed del caso los crea y el recuento
  sale `documentos.*` + 2. La migracion de T5 inserta rol, permisos y asignaciones y cambia la
  huella: la plantilla nueva ya los trae. No se fuerza la reconstruccion: la plantilla es
  compartida con otras ramas de la misma huella.

`vitest run tests/integration/identity/identity-seed.int.test.ts` tras el arreglo: 16 passed, 1
failed (el de T5).

Guardias (`test:rapido` no las llega a correr cuando la seleccion sale roja; corridas aparte con
`vitest run guard` en `2fc68340`): 51 archivos, 652 passed, 11 skipped, ninguna roja.

## T5 — Esquema y migracion

### Archivos

- `db/schema.prisma`: `User.companyId String?` con su `///` (el disparador lo exige), `company
  Company?`; comentario de cabecera del modelo reescrito (nombre de usuario global; correo y
  documento por empresa mas un indice aparte sin empresa).
- `db/migrations/20261001160815_platform_maestro_role/migration.sql` y `down.sql` (nuevos). El
  `<ts>` va despues de `20260925120100_packing_permission`, la ultima de `dev` (comprobado con
  `ls db/migrations`). `db:migrate:create` genero ademas 49 `DROP CONSTRAINT` de FK escritas a
  mano y 10 `DROP INDEX` de indices escritos a mano (drift conocido): borrados y dicho en la
  cabecera; solo queda el `DROP NOT NULL`. La guardia del paso 0 es literal la de `design.md >
  4.1` (decision del humano 2026-10-01: con nombres, sin repetidos en la base de desarrollo).
  Mensajes del disparador: `users_platform_role_without_company: …` (23514) y
  `users_company_required: …` (23502).
- `tests/unit/identity/schema/maestro-migration.test.ts` (nuevo, estatico, predicados con mutacion).
- `tests/unit/identity/schema/identity-schema.test.ts`: `companyId` y `company` pasan a opcionales
  (`isOptional` verdadero, `@db.Uuid`, `@map`, sin `@default`).
- `tests/guards/guard-identificador-de-request.test.ts`: la migracion nueva entra en
  `MIGRACIONES_ESPERADAS` (la guardia lo pide a toda ficha con migracion; no listado en el design).
- Siete teardowns de integracion (`inventario/ledger-cuadre`, `product-batch-write`,
  `product-stock`, `reservation`, `proveedores/catalog-line`, `supplier-crud`, `recetas/recipe-crud`):
  `db.company.delete({ where: { id: user.companyId } })` no compila con `companyId` anulable; una
  linea antes que lanza si el usuario de prueba no tiene empresa. Consecuencia directa del esquema,
  no listada en el design.

### Mapa R<n> -> test

| R | Test (`maestro-migration.test.ts` salvo indicacion) |
|---|---|
| R20 | «R20: es la unica carpeta de la migracion del Maestro y no crea ninguna tabla» |
| R21 | «R21, R26-R28, R36: las sentencias del UP van exactamente en este orden»; «R21: el rol insertado…»; «R21: los permisos insertados…»; «R21: el Maestro recibe exactamente SEED_ROLE_PERMISSIONS[ROLE_MAESTRO]…»; «R21: ninguna sentencia ejecutable nombra a otro rol…» |
| R22 | «R22: las sentencias del DOWN van exactamente en orden inverso»; «R22: users_username_unique del DOWN es el texto leido de la migracion de empresas»; «R22: el SET NOT NULL va antes de cualquier DELETE…»; «R22: sin CASCADE…»; «R22: el DOWN borra solo el rol Maestro y los empresas.*» |
| R26, R27 | «R26, R27: 23514 para el Maestro con empresa y 23502…»; «R26, R27: salta al insertar y al cambiar company_id o role_id…»; `identity-schema.test.ts` «QC-161 R26, R27: companyId es opcional solo en la columna…» |
| R28 | «R28: dos indices parciales sin empresa (correo y documento) y ninguno de nombre de usuario» |
| R36 | «R36: users_username_unique del UP es el texto leido de la migracion de usuarios y roles» |
| R37 | «R37: el UP no toca los indices por empresa de correo y documento» |
| R38, R39 | «R39: la guardia es la PRIMERA sentencia…»; «R39: el mensaje lista cada nombre con su numero…»; «R38, R39: el UP no escribe filas de users…» |

### Ciclo real contra `QuimiCloude_QC161`

`grep -cE '^(DATABASE_URL|DIRECT_URL)=.*QuimiCloude_QC161' .env` = 2 antes de cada paso.

```
--- migrate 1
The following migration(s) have been applied:
migrations/
  └─ 20261001160815_platform_maestro_role/
    └─ migration.sql
All migrations have been successfully applied.
--- rollback
db:rollback: aplicando down.sql de 20261001160815_platform_maestro_role y borrando su fila de _prisma_migrations
db:rollback: 20261001160815_platform_maestro_role revertida.
--- migrate 2
The following migration(s) have been applied:
migrations/
  └─ 20261001160815_platform_maestro_role/
    └─ migration.sql
All migrations have been successfully applied.
```

Estado tras el segundo `migrate` (consulta a `pg_indexes`/`pg_trigger`/`information_schema`):
`users_username_unique` = `(lower(username)) WHERE deleted_at IS NULL`; `users_email_unique` y
`users_document_unique` siguen con `company_id` delante; `users_email_without_company_unique` y
`users_document_without_company_unique` con `WHERE company_id IS NULL AND deleted_at IS NULL`;
disparador `users_check_company_by_role_trigger`; rol `Maestro` con `empresas.consultar` y
`empresas.modificar`; `users.company_id` admite NULL. Despues, `prisma generate`.

### Salida

- `pnpm run typecheck`: **rojo, esperado para T9**, dos errores en
  `lib/modules/identity/adapters/driven/persistence/session-user-prisma.ts` (`:108` TS2322
  `string | null` a `string`; `:110` TS18047 `usuario.company` posiblemente `null`). El seed no
  da error de tipos (T7 lo cambia igualmente).
- `vitest run tests/unit/identity/schema guard`: 64 archivos, 898 passed, 11 skipped.
- Todo test unitario o guardia que lee `db/migrations` (55 archivos): 831 passed.
- `eslint` de los archivos tocados: limpio.
- Plantilla de integracion: la huella cambio. `vitest run identity-seed.int.test.ts -t "QC-142 R13"`
  construyo `qct_tpl_fa76230db33c` (la anterior era `qct_tpl_4295644d322f`, no se borro: es
  compartida) y el caso paso: 1 passed, 16 skipped.
- La base huerfana `qct_qc161_95232936_mupntzdx_mx4` ya no existia al ir a borrarla (ninguna
  `qct_qc161_*` en `pg_database`): la limpio el arnes al arrancar esta corrida.

## T6 — La base garantiza empresa segun rol y la unicidad nueva

### Archivos (solo tests)

- `tests/integration/identity/maestro-migration.int.test.ts` (nuevo). UP y DOWN leidos del archivo
  y troceados respetando los bloques `$tag$`. «Antes de la migracion» se reconstruye en la
  transaccion: borra los usuarios Maestro que haya y aplica el DOWN. Prisma resume todo `23505`
  como «Unique constraint failed» y pierde el texto, asi que el mensaje de la guardia (R39) se lee
  ejecutandola dentro de un `DO` que la relanza como `P0001` con `SQLERRM`; el `23505` y las filas
  intactas se afirman ademas sobre la ejecucion directa.
- `tests/integration/identity/identity-constraints.int.test.ts`: el caso de `:1433` reescrito como
  R36 (mismo nombre en la misma empresa **y** en otra, en otras mayusculas → `23505`; nombre
  `ana.global`, no `admin`). Correo (`:1380`) y documento (`:1483`) intactos (R37). `:1194` sigue
  con su `23502` sin tocarse (R26). **No previsto en el design**: «una cuenta inactive sigue
  ocupando su correo, su nombre de usuario y su documento en su empresa» (`:1884`) creaba en otra
  empresa un usuario con el mismo nombre; ahora afirma que el nombre choca tambien en otra empresa
  (R36) y que correo y documento siguen libres alli (R37). Cabeceras del archivo y del bloque
  «unicidad DENTRO de la empresa» con una frase sobre el cambio.

### Mapa R<n> -> test

| R | Test |
|---|---|
| R21 | `maestro-migration.int` «R21: el UP sobre una base sembrada crea el rol Maestro…»; «R21: el UP sobre una base donde el seed ya creo esas filas no falla…»; «R21: dos ciclos DOWN -> UP seguidos dejan los mismos conteos» |
| R22 | «R22: el DOWN sin ningun Maestro deja la base como antes del UP…»; «R22: el DOWN con un Maestro vivo / dado de baja falla con 23502 y no borra ni reasigna nada» |
| R26 | «R26: un usuario sin empresa con un rol de empresa se rechaza con 23502 al insertar y al pasar su empresa a NULL» (los tres roles de empresa; tambien Maestro→Operador sin empresa); caso simetrico «R26, R27: …se aceptan»; `identity-constraints.int` `:1194` «rechaza un usuario sin empresa o con una empresa inexistente» (sin cambios) |
| R27 | «R27: un Maestro con empresa se rechaza con 23514 al insertar, al darle empresa y al pasar a Maestro a un usuario con empresa» |
| R28 | «R28: dos Maestros vivos con el mismo correo en otras mayusculas o el mismo documento se rechazan, al crear y al cambiar»; «R28: un Maestro dado de baja no ocupa su correo ni su documento» |
| R36 | «R36: el mismo nombre de usuario se rechaza entre dos empresas, entre una empresa y un Maestro, y al renombrar»; «R36: un usuario dado de baja no ocupa su nombre de usuario…»; `identity-constraints.int` «QC-161 R36: rechaza el mismo nombre de usuario en la misma empresa y en otra…» y el caso de `:1884` |
| R37 | «R37: el mismo correo y el mismo documento entre un usuario de empresa y un Maestro se aceptan»; `identity-constraints.int` `:1380`, `:1483` (sin cambios) y el caso de `:1884` |
| R38 | «R38: el UP sobre una base sin nombres de usuario repetidos no cambia ninguna fila de users» |
| R39 | «R39: con dos usuarios vivos de empresas distintas con el mismo nombre en otras mayusculas, la guardia falla, nombra el repetido con su numero y no cambia ninguna fila»; simetrico «R39: … sin repetidos, o con el repetido dado de baja, la guardia pasa» |

### Salida

- `.env` con `QuimiCloude_QC161` comprobado (`grep -c` = 2). Base efimera copiada de
  `qct_tpl_fa76230db33c`, borrada al terminar.
- `vitest run maestro-migration.int.test.ts identity-constraints.int.test.ts`: 2 archivos, 64 passed.
- `pnpm run typecheck`: solo los dos errores de `session-user-prisma.ts` (T9). `eslint` limpio.
- Rojos conocidos que quedan para T12 (design §10.1): `user-crud.int.test.ts:509-542`, que crean
  el mismo nombre de usuario en otra empresa.

Fe de erratas de T6: `guard-aislamiento-integracion` pedia el archivo nuevo en el censo;
`tests/integration/aislamiento.json` lo suma en `transaccion` (commit aparte).

## T13 — Documentacion de arquitectura

### Archivos

- `docs/architecture.md` `## Dominio` n.º 1: `users.company_id` «obligatoria **salvo para el
  Maestro**», con el disparador `users_check_company_by_role` como garantia; el nombre de usuario
  es unico en todo el sistema, correo y documento por empresa (y aparte entre los usuarios sin
  empresa). Sale la frase «dos empresas pueden tener cada una su `admin`», que deja de ser cierta.
- `tests/guards/guard-empresa-en-esquema.test.ts`: solo el motivo de `credential_setup_tokens` y
  `revoked_sessions` («cuelga de un usuario: la empresa es la de su ficha, o ninguna si es el
  Maestro»). La lista de exentas no cambia (mismas ocho tablas, mismo orden).

### Mapa R<n> -> test

R26, R27, R36 son documentacion aqui; sus tests son los de T5/T6. La guardia vigila que la lista
de exentas no cambie.

### Salida

- `vitest run guard`: 51 archivos, 652 passed, 11 skipped (incluye `guard-empresa-en-esquema`).

## Cierre de la tanda T5, T6, T13 — `./init.sh --rapido`

Punta `e1c6d548`. Entorno, fichas, cupo, specs y `QuimiCloude_QC161` al dia (**57** migraciones)
en verde. **`pnpm run typecheck` rojo y el gate se para ahi**: solo los dos errores esperados de
`session-user-prisma.ts` (`:108` TS2322, `:110` TS18047), que cierra T9. El resto se corrio a mano:

- `pnpm run lint`: 0 errores, 8 warnings (ninguno en archivos de esta tanda).
- `vitest run guard`: 51 archivos, 652 passed, 11 skipped.
- `pnpm run test:rapido` (`vitest related` sobre el diff; 484 archivos): 5 archivos / 8 casos
  rojos, 6927 passed, 26 skipped.
  - Baseline: `unidades-viewport.test.tsx` (2), `usuarios-viewport.test.tsx` (2).
  - Deuda de `dev` fuera del baseline (ver T2): `inventario/product-page.test.tsx` (1),
    `recetas-ui/recipe-page.test.tsx` (1).
  - De esta rama, **esperados para T12** (`design.md > 10.1`): `user-crud.int.test.ts` (2), «los
    MISMOS correo, nombre de usuario y documento en OTRA empresa SI se crean» y «tampoco choca por
    mayusculas entre empresas distintas». Los rompe el indice global del nombre de usuario.
  - `identity-seed.int.test.ts` entero en verde (el «QC-142 R13» que esperaba T5 incluido).

## T9 — Del login a la resolucion de la sesion

### Archivos

- Produccion: `domain/session.ts` (`SessionTicket.companyId` y `createSessionTicket` con
  `string | null`), `domain/session-claims.ts` (`cid: z.string().uuid().nullable()`; `null`
  explicito = sin empresa, ausente/vacio/numero/no-UUID siguen invalidando), `domain/resolve-session.ts`
  (`ResolvedSession.context: SessionContext | null`; `null` cuando la ficha no tiene empresa;
  los cortes 4 y 5 sin cambio de texto), `ports/user-credentials-reader.ts`,
  `ports/session-user-reader.ts` (`companyId: string | null`), `ports/session-provider.ts`
  (contrato de `getSessionContext` enmendado), `adapters/driven/session/session-token.ts`
  (`cid: string | null` en el payload; **`SESSION_VALUE_VERSION` sigue en `v4`**),
  `adapters/driven/persistence/user-credentials-prisma.ts` (`LEFT JOIN companies`; JSDoc del
  `INNER JOIN` y del indice global corregidos; el `WHERE` no cambia),
  `adapters/driven/persistence/session-user-prisma.ts` (`company?.deletedAt ?? null`).
  `SessionContext`, `lib/composition` y `verify-credentials.ts` no cambian.
- Tests: `session-claims.test.ts`, `resolve-session.test.ts`, `verify-credentials.test.ts`,
  `route-guard-middleware.test.ts`, `end-session.test.ts`. Ningun test de `session-token` /
  `session-user-prisma` / `user-credentials-prisma` se puso rojo por los tipos (los
  `?.context.` de `resolve-session.test.ts` pasan a `?.context?.`).

### Mapa R<n> -> test

| R | Test |
|---|---|
| R30 | `verify-credentials.test.ts` «QC-161 R30: sin empresa y con credenciales correctas emite un ticket con companyId null», «…contrasena incorrecta se rechaza con el mismo objeto y cuenta el fallo», «…cuenta bloqueada no entra…», «…cuenta que no esta activa no entra…» |
| R31 | `resolve-session.test.ts` «QC-161 R31: ficha sin empresa y firma null exponen el usuario con sus permisos y ningun contexto de empresa», «…la cuenta no activa, el sello y la sesion cerrada siguen cortando», «…sin claims o caducada no consulta la base…»; `route-guard-middleware.test.ts` «QC-161 R31: una cookie firmada por el emisor real con cid null deja pasar una ruta privada» (afirma tambien `v4` y `cid: null` en el payload) |
| R32 | `session-claims.test.ts` «QC-161 R32: un cid null explicito produce claims validos con companyId null», «QC-161 R32: un cid ausente, vacio, que no es texto ni null o sin forma de UUID devuelve null»; `resolve-session.test.ts` «QC-161 R32: firma sin empresa y ficha con empresa…», «…firma con empresa y ficha sin empresa…»; `route-guard-middleware.test.ts` «QC-161 R32: con cid ausente sigue siendo anonima; solo el null explicito vale» |
| R35 | `end-session.test.ts` «QC-161 R35: con companyId null registra el cierre de ese sid, borra la cookie y la sesion deja de valer» |

R44 se prueba contra Postgres en T11.

### Salida

- `pnpm run typecheck`: verde en todo el repo (los dos errores de `session-user-prisma.ts` cerrados).
- `eslint` de los archivos tocados: limpio.
- `vitest run` de los cinco archivos: 157 passed.
- `vitest related --run` sobre los nueve de produccion (480 archivos): 8 rojos, todos conocidos —
  `unidades-viewport` (2), `usuarios-viewport` (2), `inventario/product-page` (1),
  `recetas-ui/recipe-page` (1), `user-crud.int.test.ts` «los MISMOS correo, nombre de usuario y
  documento en OTRA empresa…» y «tampoco choca por mayusculas…» (T12)—; 6966 passed.
