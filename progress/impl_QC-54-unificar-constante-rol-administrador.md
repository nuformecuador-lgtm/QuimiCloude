# QC-54 — unificar-constante-rol-administrador · bitacora de implementacion

> Zona `backend` · rama `feature/QC-54-unificar-constante-rol-administrador` · worktree
> `.worktrees/QC-54-unificar-constante-rol-administrador` · base `155b2c7` (merge de `dev`).
>
> Spec aprobado por el humano el 2026-09-07.
>
> **ESTADO: INCOMPLETA — 10 de 12 tasks cerradas. T6 y T11 PARADAS y reportadas.**
> No me autoapruebo: las dos paradas necesitan una decision que no me corresponde tomar,
> porque resolverlas por mi cuenta contradiria texto escrito del `design.md` y de las
> decisiones cerradas. Detalle en «Lo que esta parado».

## Que se construyo

`identity` publica **una sola implementacion** de «el actor es Administrador»
(`assertAdminRole(actor, onDenied)`, dominio puro, parametrizada por la fabrica del error), y
**cuatro de los cinco** `requireAdmin` de modulo delegan en ella conservando su firma
`asserts actor is Actor` y su propio `UnauthorizedError`. El literal `'Administrador'` deja de
declararse en `inventario`, `recetas` y `unidades`; los tres barriles dejan de exportar
`ADMIN_ROLE_NAME`, que **ya no existe como simbolo en el repositorio**, y sus ~20 consumidores
(produccion, tests y el E2E) pasan a `ROLE_ADMINISTRADOR` del barrel de `identity`.

El valor de la cadena **no cambia**: sigue siendo `'Administrador'`, caracter por caracter, asi
que ninguna sesion viva se invalida y el seed sigue alineado con la base.

**Cero dependencias nuevas. Cero cambios en `db/`, `app/`, `components/` y `hooks/`** (medido con
`git diff --stat`).

## Tasks

| Task | Estado |
| --- | --- |
| T1 `identity` publica la regla unica | `[x]` |
| T2 `inventario` delega | `[x]` |
| T3 `recetas` delega | `[x]` |
| T4 `unidades` delega | `[x]` |
| T5 `pedidos` delega | `[x]` |
| T6 `proveedores` delega | **`[ ]` PARADA — ver B1** |
| T7 los tres barriles retiran `ADMIN_ROLE_NAME` | `[x]` |
| T8 el cableado de rutas lee el rol de `identity` | `[x]` |
| T9 migrar los consumidores restantes | `[x]` |
| T10 comentarios que describian el estado viejo | `[x]` |
| T11 guardia contra la reincidencia | **`[ ]` PARADA — ver B3** |
| T12 gate completo y trazabilidad | parcial — ver «Verificacion» |

## Archivos

**Produccion nueva (1).** `lib/modules/identity/domain/require-admin.ts` — `RoleBearer` y
`assertAdminRole`. Dominio puro: su unico import es `./roles`.

**Produccion modificada (9).** `lib/modules/identity/index.ts` (publica la regla; comentario final
corregido) · `lib/modules/identity/domain/route-role-rules.ts` (comentario) ·
`lib/composition/route-role-rules.ts` (lee `ROLE_ADMINISTRADOR` de `identity`; cabecera y JSDoc
reescritos) · `lib/modules/{inventario,recetas,unidades}/domain/actor.ts` (borran
`ADMIN_ROLE_NAME`, delegan) · `lib/modules/pedidos/domain/actor.ts` (delega) ·
`lib/modules/{inventario,recetas,unidades}/index.ts` (retiran el export).

**Tests nuevos (1).** `tests/unit/identity/require-admin.test.ts` (8 casos).

**Tests/E2E migrados (14).** Solo cambia **como obtienen el nombre del rol** (import +
identificador): `e2e/session.spec.ts` · `tests/unit/identity/{route-access,route-role-rules}` ·
`tests/unit/inventario/{authorization,list-use-cases,product-service}` ·
`tests/unit/proveedores/supplier-route-contract` ·
`tests/unit/recetas/{authorization,list-recipes,recipe-image-lifecycle,recipe-image-url,recipe-lines-catalog,recipe-service}`
· `tests/unit/recetas/recipe-catalog` (unico caso con un cambio de otra clase, abajo).

**Intactos y comprobados como tales:** todo `db/`, `app/`, `components/`, `hooks/`,
`package.json`, `pnpm-lock.yaml`, `docs/dependencias.md`, `middleware.ts`,
`lib/modules/proveedores/**`, `tests/unit/inventario/schema/inventario-schema.test.ts` (R16),
los seis `*-actions.test.ts` de adaptadores driving (R10) y
`tests/unit/{pedidos,proveedores}/authorization.test.ts`. **Ningun `.spec.ts` nuevo en `e2e/`** (R15).

### El unico cambio de test que no es «como obtiene el rol»

`tests/unit/recetas/recipe-catalog.test.ts` tenia una lista `anteriores` que afirma que el barrel
de `recetas` conserva todo lo que ya exportaba, y esa lista incluia `'ADMIN_ROLE_NAME'`. Retirar
esa entrada es la **unica** forma de cumplir R2 y la decision cerrada 1 (el export desaparece). Se
quito solo esa entrada, con un comentario que cita la decision. No es un test de autorizacion, asi
que R15 —que habla de «los tests de autorizacion»— no lo alcanza. Queda anotado por transparencia.

## Verificacion — salida real

```
pnpm run typecheck   -> sin errores (tsc --noEmit, salida vacia)
pnpm run lint        -> sin errores (eslint, salida vacia)
pnpm test            -> Test Files  211 passed (211)
                        Tests  2509 passed | 4 skipped (2513)
                        Duration  104.67s
```

**`./init.sh` completo NO llega a correr, y no por esta ficha:**

```
== Arnes SDD :: init (modo: completo) ==
* node v22.13.1
* dependencias presentes
X feature_list.json invalido:
faltan specs para features sdd en vuelo: QC-35
```

`feature_list.json` esta **sin tocar** por esta ficha (`git diff HEAD -- feature_list.json` vacio):
es el snapshot que venia de `dev`, donde QC-35 figura `in_progress` mientras su `specs/QC-35-*`
vive en otra rama. Es del leader y de otra ficha; no lo toco. Por eso el gate se verifico por sus
tres partes sustantivas —typecheck, lint y la **suite entera**, guardias incluidas—, que es lo que
la regla 5 mide sobre el codigo.

### Tres huecos de entorno del worktree, resueltos (no son cambios de codigo)

Un worktree recien montado no trae nada de esto y el gate sale rojo por motivos ajenos al cambio:

1. `pnpm install` + `pnpm exec prisma generate` — sin el segundo, `@prisma/client` no exporta
   `Prisma` y ~15 `.int.test.ts` no compilan.
2. `pnpm exec next typegen` — sin `.next/types`, `app/layout.tsx` falla con
   `TS2304: Cannot find name 'LayoutProps'`. **Ese error no era real.**
3. `.env` esta en `.gitignore`, asi que el worktree nace sin el y los 27 archivos de
   `tests/integration/**` fallan con `Environment variable not found: DATABASE_URL`. Vitest no
   carga `.env` por su cuenta (solo lo hace `prisma.config.ts`, y para el CLI). Copiado el `.env`
   del arbol principal, la suite pasa de 184/211 a 211/211.

**Merece una nota en `docs/worktrees.md`:** hoy nada lo dice y los tres sintomas parecen rojos de
la feature que se este implementando.

## Mapa de trazabilidad `R1`-`R17` -> test

| R | Que exige | Test / evidencia |
| --- | --- | --- |
| R1 | Una sola declaracion del literal en produccion | **SIN CUBRIR POR TEST** — depende de T11 (parada, B3). Medido a mano: el unico literal en produccion fuera de `roles.ts` es `INITIAL_ADMIN_FIRST_NAMES` de `seed-initial-access.ts`, que es un NOMBRE DE PILA, no el rol (ver B3) |
| R2 | Los tres barriles no exportan la constante | `pnpm run typecheck` verde con `ADMIN_ROLE_NAME` inexistente + `tests/unit/recetas/recipe-catalog.test.ts` · `el barrel conserva todo lo que ya exportaba` + `grep -rn ADMIN_ROLE_NAME lib/ app/ components/ hooks/` -> 0 resultados |
| R3 | El rol se obtiene del barrel de `identity` | `tests/unit/identity/route-role-rules.test.ts` · `las filas se derivan de INVENTORY_ROUTE, FORMULAS_ROUTE, SUPPLIERS_ROUTE y ROLE_ADMINISTRADOR, no de literales propios` (afirma `from '@/lib/modules/identity'` y `not.toContain` del literal) |
| R4 | El valor sigue siendo `'Administrador'` | `tests/unit/pedidos/authorization.test.ts:294` · `expect(ROLE_ADMINISTRADOR).toBe('Administrador')` (ancla preexistente, **sin tocar**) |
| R5 | Nada cambia bajo `db/`; `SEED_ROLES` sigue derivando | `git diff --stat -- db/` vacio + `tests/unit/identity/seed/seed-initial-access.test.ts` y `tests/integration/identity/identity-seed.int.test.ts` verdes **sin tocar** |
| R6 | Una sola implementacion; los CINCO modulos delegan | `tests/unit/identity/require-admin.test.ts` + `authorization.test.ts` de `inventario`, `recetas` y `pedidos` y los dos de `unidades`. **PARCIAL: `proveedores` todavia no delega (T6 parada, B1)** |
| R7 | La fabrica del error la pone quien llama | `tests/unit/identity/require-admin.test.ts` · los 7 casos `lanza EXACTAMENTE el error que devuelve onDenied` (con una `ErrorDePrueba` propia del test) |
| R8 | Rechazo cerrado, antes de tocar puerto | `tests/unit/inventario/authorization.test.ts` (9 casos de uso) · `tests/unit/recetas/authorization.test.ts` (5) · `tests/unit/pedidos/authorization.test.ts` (6) · `tests/unit/proveedores/authorization.test.ts` (9) · `tests/unit/unidades/list-units.test.ts`. Los dobles de puerto EXPLOTAN si los llaman |
| R9 | El Administrador exacto continua | los mismos, caso `ADMIN` + `require-admin.test.ts` · `el rol Administrador exacto no lanza, y onDenied no se invoca` |
| R10 | Los siete adaptadores driving serializan igual | `tests/unit/{inventario/presentation-actions,inventario/product-actions,pedidos/order-actions,proveedores/supplier-actions,recetas/recipe-actions,unidades/unit-actions}.test.ts` verdes **con `git diff` vacio** |
| R11 | La verificacion falla ante una reincidencia | **SIN CUBRIR** — T11 parada (B3) |
| R12 | La guardia deriva el patron y lo demuestra | **SIN CUBRIR** — T11 parada (B3) |
| R13 | `ROUTE_ROLE_RULES` conserva sus tres filas | `tests/unit/identity/route-role-rules.test.ts` · `declara exactamente tres reglas, en orden: inventario, recetas y proveedores, las tres solo Administrador (R4, R6)` |
| R14 | El borde no alcanza lo prohibido | `tests/guards/guard-middleware-edge.test.ts` verde, **sin tocar**; sus `expect(files).toContain(...)` siguen citando archivos que existen |
| R15 | Cero cambio de comportamiento observable | la suite entera 211/211 + `git diff` de `tests/`/`e2e/` sin una linea que no sea import o identificador del rol (unica excepcion declarada arriba) + `e2e/` sin `.spec.ts` nuevo |
| R16 | El centinela de `inventario` intacto y verde | `git diff --stat -- tests/unit/inventario/schema/inventario-schema.test.ts` **vacio**, y verde en la suite |
| R17 | Ningun comentario afirma el estado viejo | `grep -rn ADMIN_ROLE_NAME lib/ app/ components/ hooks/` -> 0. Reescritos: cabecera y JSDoc de `lib/composition/route-role-rules.ts`, comentario final de `lib/modules/identity/index.ts` y el de `lib/modules/identity/domain/route-role-rules.ts` |

**Sin cubrir: R1, R11 y R12 (dependen de T11); R6 a medias (depende de T6).**

## Lo que esta parado, y por que no lo resuelvo yo

### B1 — T6: `proveedores` no puede delegar sin tocar una asercion de su test de autorizacion

`tests/unit/proveedores/authorization.test.ts:311-316` exige la forma EXACTA del import de
`lib/modules/proveedores/domain/actor.ts`:

```ts
expect(actor).toMatch(
  /import \{ ROLE_ADMINISTRADOR \} from '@\/lib\/modules\/identity'/,
)
```

Tras delegar, `ROLE_ADMINISTRADOR` deja de usarse en ese archivo (entra `assertAdminRole`), asi que
el import desaparece y el centinela se pone rojo. La regex pide literalmente `{ ROLE_ADMINISTRADOR }`
a solas: ni siquiera vale importar los dos nombres en las mismas llaves. Y dejar el import sin usar
lo caza el lint.

El choque es con texto escrito, no con una interpretacion mia:

- `design.md > 5` dice: «Los centinelas locales de `pedidos` y `proveedores` **se dejan como estan**
  (defensa en profundidad barata, y tocarlos violaria R15)».
- R15 dice que en los tests de autorizacion «el unico cambio admisible es como obtienen el nombre
  del rol», y esto es una asercion sobre la forma del fuente de produccion, no sobre eso.
- Pero R6 y la decision cerrada 2 exigen que **los cinco** modulos deleguen.

`pedidos` no tiene este problema (su centinela solo comprueba que el literal no aparece en el
codigo), y por eso T5 cerro limpio con el mismo patron.

**Decision que hace falta:** actualizar esa unica regex para que exija `assertAdminRole` del barrel
de `identity` —no es un cambio de comportamiento: es un centinela que describe la forma vieja que
la ficha deroga—, o aceptar que `proveedores` no delegue y que R6 quede a medias.

### B3 — T11: la guardia, tal y como la especifica el diseño, sale ROJA por un nombre de pila

`design.md > 5` fija **exencion unica**: `lib/modules/identity/domain/roles.ts`. Barriendo el
conjunto de produccion y descontando comentarios, hay **dos** archivos con el literal:

```
lib/modules/identity/domain/roles.ts:7
  export const ROLE_ADMINISTRADOR = 'Administrador'
lib/modules/identity/domain/seed-initial-access.ts:48
  const INITIAL_ADMIN_FIRST_NAMES = 'Administrador';
```

El segundo **no es el nombre del rol**: es el nombre de pila del usuario inicial que siembra el
sistema («Marcadores fijos del usuario inicial (R7)»), hermano de `INITIAL_ADMIN_LAST_NAMES =
'Inicial'`. Tiene su propio test que lo fija:
`tests/unit/identity/seed/seed-initial-access.test.ts:220` · `expect(input.firstNames).toBe('Administrador')`.
Cambiar ese valor seria cambiar datos de seed, que esta ficha prohibe.

Una guardia por texto no puede distinguir un rol de un nombre de pila. Segun R11 al pie de la letra
(«que declare **el nombre del rol** Administrador») no hay infraccion; segun el mecanismo que
`design.md > 5` manda construir, si la hay y el gate se queda rojo.

**Decision que hace falta:** admitir una segunda exencion, documentada y justificada, para
`seed-initial-access.ts` —contradice «exencion unica»—, o la salida que el leader/humano prefiera.
No la elijo yo: la decision cerrada 4 y el `design.md` son explicitos.

## Riesgo que conviene mirar en la revision

El diseño (§4, punto 3) predecia que retirar el import del barrel de `inventario` de
`lib/composition/route-role-rules.ts` **adelgaza el bundle del borde**. No se convirtio en
requisito y no se midio: `guard-middleware-edge` verifica ausencia de imports prohibidos, no tamaño,
y sigue verde.
