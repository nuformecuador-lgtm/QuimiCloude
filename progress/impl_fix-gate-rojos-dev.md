# Arreglo del gate en rojo — rama `feature/fix-gate-rojos-dev`

No es una feature SDD: son dos arreglos independientes del gate sobre `dev`.

## Encargo 1 — `tests/integration/identity/identity-seed.int.test.ts` (8 casos rojos)

### Qué tablas tenían las filas culpables

Consultado contra la base real (catálogo `pg_constraint` + conteos). FK hacia `users`,
todas `ON DELETE RESTRICT` (`confdeltype = 'r'`):

| tabla | columnas | filas totales | filas que referencian a `users` |
|---|---|---|---|
| `orders` | `created_by`, `updated_by` | 0 | 0 |
| `products` | `created_by`, `updated_by` | 6 | **1** |
| `recipes` | `created_by`, `updated_by` | 1 | **1** |
| `supplier_catalog_lines` | `created_by`, `updated_by` | 0 | 0 |
| `suppliers` | `created_by`, `updated_by` | 0 | 0 |

Culpables reales hoy: **`products` (1 fila) y `recipes` (1 fila)**. `users` tiene 1 fila.

Nota sobre el diagnóstico de partida: la tabla de QC-43 se llama en la base
`supplier_catalog_lines` (no `proveedor_catalogo`) y está **vacía**, así que no es la que
lo destapó; lo destaparon el producto y la receta sembrados. El resto del diagnóstico
—FK `RESTRICT` escritas a mano bloqueando `tx.user.deleteMany({})`— se confirma.

### Qué cambié y por qué

Solo el test. Ninguna FK ni migración tocada. `resetIdentityToEmptyState` ahora vacía,
DENTRO de la misma transacción que termina en `ROLLBACK`, las tablas que dependen de
`users` antes de borrar usuarios y roles.

El orden de borrado **no es una lista escrita a mano**: se deriva en tiempo de ejecución
del catálogo de Postgres (`tablesDependingOnUsers`), que calcula el cierre transitivo de
tablas que apuntan a `users` y las ordena hojas-primero (peeling topológico; si el grafo
dejara de ser acíclico, lanza un error que lo dice). Elegí esto sobre la lista fija porque
el fallo de hoy es exactamente el de una lista que nadie actualizó: cada módulo nuevo con
auditoría `created_by`/`updated_by` volvería a poner el archivo en rojo. Descarté
`TRUNCATE ... CASCADE` (transaccional y más corto) porque toma `ACCESS EXCLUSIVE` hasta el
final de la transacción y esta base local está compartida por varios worktrees: bloquearía
a otros archivos de integración corriendo en paralelo.

Con el esquema de hoy el orden resuelto es `orders`, `recipe_lines`,
`supplier_catalog_lines`, `recipes`, `suppliers`, `products` → `users` → roles del seed.
Los nombres vienen del catálogo y aun así se validan contra `^[a-z_][a-z0-9_]*$` antes de
interpolarse en el `DELETE FROM`.

Invariantes respetados: el aislamiento por transacción revertida no se toca (comprobado
tras la corrida: `users` 1, `roles` 2, `products` 6, `recipes` 1, `recipe_lines` 2,
`document_types` 1, `presentations` 6, `units` 4 — idénticos a antes); ninguna migración
ni FK relajada; los 8 casos comprueban exactamente lo mismo que antes. También se
actualizó la cabecera del archivo, que hasta ahora sólo explicaba el borrado de usuarios.

## Encargo 2 — baseline de los dos guardias de rama de recetas

Decisión ya tomada por el humano. Entradas tal cual quedaron en
`tests/baseline-rojos.json`:

```json
"tests/unit/recetas-ui/recipe-route-contract.test.ts": {
  "motivo": "Contiene un caso de guardia de rama que se apoya en `git diff --name-only origin/dev...HEAD` (el de R44 de QC-26). Estando EN dev ese rango esta vacio por definicion, y el caso se declara rojo a proposito ('el rango git origin/dev...HEAD no estaba disponible: este caso no ha comprobado nada') en vez de pasar en silencio sin comprobar nada. Es estructural: en dev no puede estar verde. COSTE ACEPTADO, y no es pequeno: al estar listado aqui, el archivo ENTERO queda ignorado por el comparador tambien en las ramas de feature, que es justo donde su guardia de diff SI tendria sentido y donde ademas viven los otros casos del archivo (los que no dependen del rango). O sea que este archivo deja de proteger nada via gate; si se toca la pantalla de recetas hay que correrlo a mano en la rama. La salida limpia seria que el caso se auto-salte cuando el rango esta vacio (skip explicito y ruidoso) y sacar el archivo de esta lista.",
  "desde": "2026-09-04"
},
"tests/unit/recetas/module-contract.test.ts": {
  "motivo": "Mismo motivo estructural que el anterior: uno de sus casos comprueba, sobre `git diff --name-only origin/dev...HEAD`, que QC-26 (feature de presentacion) no toca `lib/modules/recetas/**`. En dev el rango esta vacio y el caso falla adrede con 'el rango git origin/dev...HEAD no estaba disponible: este caso no ha comprobado nada'. COSTE ACEPTADO: listarlo aqui apaga el archivo COMPLETO para el comparador, incluidas sus comprobaciones de contrato del modulo `recetas` (barrel, ausencia de rutas HTTP bajo app/api) que si podrian correr en cualquier rama, y lo apaga tambien en las ramas de feature donde deberia morder. Correccion pendiente: que el caso del diff se salte explicitamente cuando el rango no existe, y borrar esta entrada.",
  "desde": "2026-09-04"
}
```

Se actualizó también el `_nota` del archivo (ya no está vacío) y el bloque de estado de
`docs/verification.md > Rojos heredados`, que seguía afirmando que el baseline estaba
vacío.

Comprobado que el comparador acepta el formato, con un reporte de corrida simulado (los
dos archivos en `failed`, uno más en `passed`):

```
$ node scripts/comparar-baseline-rojos.mjs .tmp-rep.json
sin rojos nuevos (2 rojos, todos en el baseline de 2)
exit=0
```

## Archivos modificados

- `tests/integration/identity/identity-seed.int.test.ts`
- `tests/baseline-rojos.json`
- `docs/verification.md`
- `progress/impl_fix-gate-rojos-dev.md` (este informe)

## Verificación (modo acotado, según lo pedido; el `./init.sh` completo lo corre el humano)

```
$ pnpm typecheck
app/layout.tsx(43,56): error TS2304: Cannot find name 'LayoutProps'.
 ELIFECYCLE  Command failed with exit code 2.
```

**Este rojo no es de este cambio y es ambiental.** `LayoutProps<"/">` es un tipo global que
genera Next en `.next/types/**`, incluido desde `tsconfig.json`; este worktree nunca ha
corrido `next dev` ni `next build`, así que no existe `.next/`. Los tres archivos que toqué
son un test, un JSON y un `.md`: ninguno puede producir ese error. Se resuelve generando
los tipos (`pnpm build`, o un arranque de `next dev`) en el worktree.

```
$ pnpm lint
✖ 2 problems (0 errors, 2 warnings)
  app/(private)/inventario/components/product-columns.ts  66:10  'formatDate' is defined but never used
  tests/unit/inventario/product-page.test.tsx              9:3   'EMPTY_CELL' is defined but never used
```

0 errores. Las 2 advertencias son preexistentes en `dev`, en archivos que no toqué.

```
$ pnpm exec vitest run tests/integration/identity/identity-seed.int.test.ts
 Test Files  1 passed (1)
      Tests  10 passed (10)
   Duration  7.96s
```

Los 8 casos del seed en verde, más los 2 de `withInitialAccessTransaction` que viven en el
mismo archivo (10 en total).

```
$ pnpm exec vitest related --run tests/integration/identity/identity-seed.int.test.ts tests/baseline-rojos.json
 Test Files  1 passed (1)
      Tests  10 passed (10)

$ pnpm exec vitest run guard
 Test Files  12 passed (12)
      Tests  123 passed (123)
```

## Veredicto

Los 8 casos del seed quedan en verde de forma determinista —ya no dependen de con qué datos
arranque la base local— y los dos guardias de rama de recetas quedan en el baseline con
motivo y coste declarados; el único rojo restante, `LayoutProps` en `pnpm typecheck`, es
ambiental por falta de `.next/types` en este worktree.
