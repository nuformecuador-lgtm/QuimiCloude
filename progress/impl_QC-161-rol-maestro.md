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
