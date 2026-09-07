# QC-54 — unificar-constante-rol-administrador · bitacora de implementacion

> Zona `backend` · rama `feature/QC-54-unificar-constante-rol-administrador` · worktree
> `.worktrees/QC-54-unificar-constante-rol-administrador` · base `155b2c7` (merge de `dev`).
>
> Spec aprobado por el humano el 2026-09-07. **Las 12 tasks en `[x]`.**
>
> Durante F2.1 aparecieron **dos choques medidos** entre el `design.md` y los requisitos. Se
> pararon y se reportaron en vez de resolverlos por mi cuenta; **el humano los cerro el
> 2026-09-07** y las dos decisiones estan registradas en la tabla «Decisiones cerradas» de
> `requirements.md` y aplicadas como correcciones fechadas en `design.md > 5`.

## Que se construyo

`identity` publica **una sola implementacion** de «el actor es Administrador»
(`assertAdminRole(actor, onDenied)`, dominio puro, parametrizada por la fabrica del error), y **los
cinco** `requireAdmin` de modulo delegan en ella conservando su firma `asserts actor is Actor` y su
propio `UnauthorizedError` — por eso los siete adaptadores driving siguen serializando el 403
exactamente igual. El literal `'Administrador'` deja de declararse en `inventario`, `recetas` y
`unidades`; los tres barriles dejan de exportar `ADMIN_ROLE_NAME`, que **ya no existe como simbolo
en el repositorio**, y sus ~20 consumidores (produccion, tests y el E2E) pasan a
`ROLE_ADMINISTRADOR` del barrel de `identity`.

Y entra la red que impide la reincidencia: `tests/guards/guard-rol-administrador-unico.test.ts`
da rojo si un archivo de produccion vuelve a declarar el literal.

El valor de la cadena **no cambia**: sigue siendo `'Administrador'`, caracter por caracter, asi
que ninguna sesion viva se invalida y el seed sigue alineado con la base.

**Cero dependencias nuevas. Cero cambios en `db/`, `app/`, `components/` y `hooks/`.**

## Tasks — 12 de 12 en `[x]`

| Bloque | Tasks |
| --- | --- |
| 1 · la pieza compartida | T1 |
| 2 · los cinco modulos delegan | T2 `inventario` · T3 `recetas` · T4 `unidades` · T5 `pedidos` · T6 `proveedores` |
| 3 · se retira el simbolo viejo | T7 barriles · T8 cableado de rutas · T9 consumidores · T10 comentarios |
| 4 · la guardia | T11 |
| 5 · cierre | T12 |

## Las dos decisiones del humano (2026-09-07) y como se aplicaron

### D-A · `proveedores` delega, y el centinela se actualiza al nuevo medio

`tests/unit/proveedores/authorization.test.ts` exigia por regex el import exacto de
`ROLE_ADMINISTRADOR` en `domain/actor.ts`. Al delegar, ese simbolo deja de usarse ahi, asi que el
centinela se ponia rojo y `proveedores` no podia cumplir R6 — mientras `design.md > 5` decia que ese
centinela no se tocaba. **Gana el requisito.**

Ese centinela vigilaba un **medio** —que `actor.ts` importara `ROLE_ADMINISTRADOR`— para garantizar
un **fin**: que el rol salga de `identity`, sin literal local y sin pasar por `inventario`. Delegar
en `assertAdminRole` cumple el fin **mejor** que el medio, asi que se cambio **una sola asercion**
al nuevo medio. **No se afloja:** las otras cuatro del bloque quedan byte por byte —el barrido
`not.toMatch(/['"`]Administrador/)` sobre TODOS los fuentes del modulo, la prohibicion de ruta
profunda, la de `@/lib/modules/inventario` y la ausencia de un `domain/roles.ts` propio—. La
mutacion que lo pone rojo sigue siendo declarar un `const ADMIN_ROLE_NAME = 'Administrador'` propio.
El razonamiento quedo escrito en el comentario del propio `it`.

El centinela de `pedidos` **no se toco**: solo mira el literal y ya pasaba verde tras delegar.

### D-B · la guardia exime dos archivos, y solo dos

`roles.ts` sigue siendo la unica declaracion legitima **del rol**. Se anade
`lib/modules/identity/domain/seed-initial-access.ts`, **con el motivo escrito dentro de la propia
guardia**: ahi `'Administrador'` es el **nombre de pila** del usuario inicial
(`INITIAL_ADMIN_FIRST_NAMES`, hermano de `INITIAL_ADMIN_LAST_NAMES = 'Inicial'`), no el nombre del
rol, y una guardia por texto no puede distinguir un nombre de persona de uno de rol. Renombrarlo
esta descartado: rompe `tests/unit/identity/seed/seed-initial-access.test.ts:220` y cambiaria un
dato ya sembrado en la base.

**No se exime `lib/modules/identity/domain/` entera**, a proposito: dejaria entrar un segundo
literal DEL ROL dentro de `identity` sin que nada avise. Tambien queda escrito en la guardia.

## Archivos

**Produccion nueva (1).** `lib/modules/identity/domain/require-admin.ts` — `RoleBearer` y
`assertAdminRole`. Dominio puro: su unico import es `./roles`.

**Produccion modificada (10).** `lib/modules/identity/index.ts` (publica la regla; comentario final
corregido) · `lib/modules/identity/domain/route-role-rules.ts` (comentario) ·
`lib/composition/route-role-rules.ts` (lee `ROLE_ADMINISTRADOR` de `identity`; cabecera y JSDoc
reescritos) · los **cinco** `lib/modules/{inventario,recetas,unidades,pedidos,proveedores}/domain/actor.ts`
· `lib/modules/{inventario,recetas,unidades}/index.ts` (retiran el export).

**Tests nuevos (2).** `tests/unit/identity/require-admin.test.ts` (8 casos) ·
`tests/guards/guard-rol-administrador-unico.test.ts` (5 casos).

**Tests/E2E migrados (14).** Solo cambia **como obtienen el nombre del rol** (import +
identificador): `e2e/session.spec.ts` · `tests/unit/identity/{route-access,route-role-rules}` ·
`tests/unit/inventario/{authorization,list-use-cases,product-service}` ·
`tests/unit/proveedores/supplier-route-contract` ·
`tests/unit/recetas/{authorization,list-recipes,recipe-image-lifecycle,recipe-image-url,recipe-lines-catalog,recipe-service}`
· `tests/unit/recetas/recipe-catalog`.

**Tests con un cambio de otra clase (2), los dos declarados y justificados:**
- `tests/unit/proveedores/authorization.test.ts` — una asercion, por la decision D-A.
- `tests/unit/recetas/recipe-catalog.test.ts` — la lista `anteriores` afirmaba que el barrel
  conserva todo lo que ya exportaba, e incluia `'ADMIN_ROLE_NAME'`. Retirar esa entrada es la unica
  forma de cumplir R2 y la decision cerrada 1. No es un test de autorizacion, asi que R15 no lo
  alcanza.

**Intactos y comprobados como tales:** todo `db/`, `app/`, `components/`, `hooks/`,
`package.json`, `pnpm-lock.yaml`, `docs/dependencias.md`, `middleware.ts`,
`tests/unit/inventario/schema/inventario-schema.test.ts` (R16), los seis `*-actions.test.ts` de
adaptadores driving (R10) y `tests/unit/pedidos/authorization.test.ts`. **Ningun `.spec.ts` nuevo en
`e2e/`** (R15).

## Verificacion — salida real

```
pnpm run typecheck   -> sin errores
pnpm run lint        -> sin errores
pnpm run test:json   -> Test Files  2 failed | 210 passed (212)
                        Tests  2 failed | 2512 passed | 4 skipped (2518)
node scripts/comparar-baseline-rojos.mjs .vitest-rojos.json
                     -> sin rojos nuevos (2 rojos, todos en el baseline de 5); 3 por limpiar
                        EXIT=0
pnpm run test:guardias -> 17 archivos, 169 passed | 4 skipped
migraciones          -> todas tienen down.sql
```

**Los 2 rojos son los dos del baseline heredado, y conviene mirarlos de cerca porque NO fallan
por el motivo que el baseline documenta:**

```
tests/unit/recetas/module-contract.test.ts
  - «la feature no anade ningun route handler bajo app/, y lib/modules/recetas no cambio de forma»
tests/unit/recetas-ui/recipe-route-contract.test.ts
  - «la feature no toca lib/modules/recetas ni db/»
```

Las dos afirmaciones se miden sobre `git diff --name-only origin/dev...HEAD` y nacieron en QC-26
para garantizar que **aquella** feature de presentacion no tocara `recetas` por la puerta de atras.
El baseline las lista por el caso «en `dev` el rango esta vacio». Aqui el rango **no** esta vacio:
fallan porque **QC-54 si toca `lib/modules/recetas`**, que es exactamente lo que T3 y T7 mandan
hacer. O sea que esos dos casos, tal y como estan escritos, dan rojo en **cualquier** rama que
modifique `recetas` legitimamente, no solo en la de QC-26.

No lo arreglo aqui —esta fuera del alcance de esta ficha y el propio baseline ya declara la
correccion pendiente («que el caso del diff se salte explicitamente cuando el rango no existe»)—,
pero merece ficha: hoy la unica razon por la que el gate pasa es que el archivo entero esta
silenciado en `tests/baseline-rojos.json`.

### `./init.sh` completo: el unico rojo es el bug conocido del validador

```
== Arnes SDD :: init (modo: completo) ==
* node v22.13.1
* dependencias presentes
X feature_list.json invalido: faltan specs para features sdd en vuelo: QC-35
```

Confirmado que es el bug de arnes ya documentado en `progress/current.md` desde QC-21 (2026-09-02):
`scripts/validate-features.mjs:18` resuelve `const WT_DIR = '.worktrees'` **contra el cwd**, asi que
desde dentro de un worktree no existe esa carpeta, no encuentra los specs de las features hermanas
—QC-35 vive en su propio worktree— y da un falso invalido. Desde la raiz da verde. `feature_list.json`
esta **sin tocar** por esta ficha. Como init.sh corta ahi (`fail`), los pasos 6, 7 y 8 se corrieron
a mano uno por uno, en el mismo orden y con los mismos comandos, y son los que se listan arriba.

### Tres huecos de entorno del worktree, resueltos (no son cambios de codigo)

Un worktree recien montado no trae nada de esto y el gate sale rojo por motivos ajenos al cambio:

1. `pnpm install` + `pnpm exec prisma generate` — sin el segundo, `@prisma/client` no exporta
   `Prisma` y ~15 `.int.test.ts` no compilan.
2. `pnpm exec next typegen` — sin `.next/types`, `app/layout.tsx` falla con
   `TS2304: Cannot find name 'LayoutProps'`. **Ese error no era real.**
3. `.env` esta en `.gitignore`, asi que el worktree nace sin el y los 27 archivos de
   `tests/integration/**` fallan con `Environment variable not found: DATABASE_URL`. Vitest no
   carga `.env` por su cuenta (solo lo hace `prisma.config.ts`, y para el CLI).

**Merece una nota en `docs/worktrees.md`:** hoy nada lo dice y los tres sintomas parecen rojos de la
feature que se este implementando.

## Mapa de trazabilidad `R1`-`R17` -> test

**Sin huecos: los 17 tienen test concreto, con archivo y nombre.**

| R | Que exige | Archivo | `it(...)` / evidencia |
| --- | --- | --- | --- |
| R1 | Una sola declaracion del literal en produccion | `tests/guards/guard-rol-administrador-unico.test.ts` | `el literal del rol solo aparece en identity/domain/roles.ts, salvo la excepcion nombrada del seed` |
| R2 | Los tres barriles no exportan la constante | `tests/unit/recetas/recipe-catalog.test.ts` + `typecheck` | `el barrel conserva todo lo que ya exportaba` (sin `ADMIN_ROLE_NAME`) + `grep -rn ADMIN_ROLE_NAME lib/ app/ components/ hooks/` -> 0 |
| R3 | El rol se obtiene del barrel de `identity` | `tests/unit/identity/route-role-rules.test.ts` | `las filas se derivan de INVENTORY_ROUTE, FORMULAS_ROUTE, SUPPLIERS_ROUTE y ROLE_ADMINISTRADOR, no de literales propios` |
| R4 | El valor sigue siendo `'Administrador'` | `tests/unit/pedidos/authorization.test.ts:294` + la guardia nueva | `expect(ROLE_ADMINISTRADOR).toBe('Administrador')` (ancla preexistente, **sin tocar**) |
| R5 | Nada cambia bajo `db/`; `SEED_ROLES` sigue derivando | `tests/unit/identity/seed/seed-initial-access.test.ts` · `tests/integration/identity/identity-seed.int.test.ts` | verdes **sin tocar** + `git diff --stat -- db/` vacio |
| R6 | Una sola implementacion; los CINCO modulos delegan | `tests/unit/identity/require-admin.test.ts` + los cinco de autorizacion | `inventario` (9 casos de uso), `recetas` (5), `pedidos` (6), `proveedores` (9), `unidades` (`list-units`) |
| R7 | La fabrica del error la pone quien llama | `tests/unit/identity/require-admin.test.ts` | los 7 casos `...: lanza EXACTAMENTE el error que devuelve onDenied` (con una `ErrorDePrueba` propia del test) |
| R8 | Rechazo cerrado, antes de tocar puerto | los cinco de autorizacion | casos rechazados con dobles de puerto que EXPLOTAN si los llaman |
| R9 | El Administrador exacto continua | los cinco + `require-admin.test.ts` | `el rol Administrador exacto no lanza, y onDenied no se invoca` |
| R10 | Los siete adaptadores driving serializan igual | `tests/unit/{inventario/presentation-actions,inventario/product-actions,pedidos/order-actions,proveedores/supplier-actions,recetas/recipe-actions,unidades/unit-actions}.test.ts` | verdes **con `git diff` vacio** |
| R11 | La verificacion falla ante una reincidencia | `tests/guards/guard-rol-administrador-unico.test.ts` | caso real del repo + **comprobacion manual**, abajo |
| R12 | La guardia deriva el patron y lo demuestra | `tests/guards/guard-rol-administrador-unico.test.ts` | `la regla deriva el patron del valor de ROLE_ADMINISTRADOR y reconoce las tres comillas` + `no se ciega: un comentario de linea...` + `el barrido incluye la raiz del repositorio y excluye tests/, e2e/, scripts/ y db/` |
| R13 | `ROUTE_ROLE_RULES` conserva sus tres filas | `tests/unit/identity/route-role-rules.test.ts` | `declara exactamente tres reglas, en orden: inventario, recetas y proveedores, las tres solo Administrador (R4, R6)` |
| R14 | El borde no alcanza lo prohibido | `tests/guards/guard-middleware-edge.test.ts` | verde **sin tocar**; sus `expect(files).toContain(...)` siguen citando archivos que existen |
| R15 | Cero cambio de comportamiento observable | la suite entera + `git diff` acotado | ningun `.spec.ts` nuevo en `e2e/`; los dos cambios de otra clase estan declarados arriba |
| R16 | El centinela de `inventario` intacto y verde | `tests/unit/inventario/schema/inventario-schema.test.ts` | `git diff --stat` **vacio** y verde en la suite |
| R17 | Ningun comentario afirma el estado viejo | `grep -rn ADMIN_ROLE_NAME lib/ app/ components/ hooks/` -> 0 | reescritos: cabecera y JSDoc de `lib/composition/route-role-rules.ts`, comentario final de `lib/modules/identity/index.ts` y el de `lib/modules/identity/domain/route-role-rules.ts` |

### Comprobacion manual de la guardia (R11), pedida por `tasks.md > T11`

Hecha **dos veces, sobre dos carpetas distintas**, para no probar solo el caso que el autor tenia
en mente:

1. `const X = "Administrador";` al final de `lib/modules/recetas/domain/actor.ts` (comilla doble,
   dentro de `lib/modules`) -> **ROJA**.
2. `const ROL_COPIADO = \`Administrador\`;` al final de `lib/composition/route-role-rules.ts`
   (**backtick**, y **fuera** de `lib/modules`) -> **ROJA**:

```
AssertionError: El rol Administrador tiene un unico dueño (R1):
lib/modules/identity/domain/roles.ts. Se encontro el literal declarado tambien en:
lib/composition/route-role-rules.ts. No repitas la cadena ahi: importa ROLE_ADMINISTRADOR
del barrel '@/lib/modules/identity' (nunca por ruta profunda, nunca desde otro barrel).
Un literal con dos dueños se desincroniza en silencio si identity renombrara el rol.
```

Retirada cada linea, **VERDE** las dos veces, y `git diff --stat` de los dos archivos vacio.
