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
