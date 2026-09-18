# Fix: arranque de `prisma migrate deploy` sobre una base vacia (QC-49 / QC-60 / QC-50)

## Archivos modificados

- `db/migrations/20260911130000_inventory_company_scope/migration.sql`
- `db/migrations/20260911130000_inventory_company_scope/down.sql`
- `db/migrations/20260915120000_orders_company_scope/migration.sql`
- `db/migrations/20260915120000_orders_company_scope/down.sql`
- `db/migrations/20260916120000_recipes_company_scope/migration.sql`
- `db/migrations/20260916120000_recipes_company_scope/down.sql`

No se toco ningun otro archivo. No hay `INSERT INTO "companies"` en ninguno de los seis.

## Por que (dos lineas)

Las tres migraciones resolvian la empresa destino del backfill ANTES de comprobar si habia
algo que rellenar, asi que sobre una base vacia (cero filas en las tablas de destino)
abortaban defendiendo un reparto que no existia. Se añadio, al principio de cada bloque
`DO $$` (UP y, donde aplicaba, DOWN), un `RETURN` temprano cuando el conteo de filas de la(s)
tabla(s) propias es cero, con el mismo idioma que ya usa
`20260904180600_companies_and_user_company` (`IF usuarios = 0 THEN RETURN; END IF;`). Ninguna
rama de resolucion, ningun mensaje de `RAISE EXCEPTION` ni ningun DDL fuera del bloque se toco.

## UP: condicion de salida temprana por migracion

- QC-49 (`inventory_company_scope`): `RETURN` si `count(products) + count(presentations) +
  count(product_batches) = 0` (variable nueva `existing_rows BIGINT`).
- QC-60 (`orders_company_scope`): `RETURN` si `count(orders) = 0`.
- QC-50 (`recipes_company_scope`): `RETURN` si `count(recipes) = 0`.

En los tres casos el `RETURN` esta dentro del `DO $$` del backfill; el resto del archivo (el
`SET NOT NULL`, las FK, los indices, los disparadores, el `ENABLE`/`FORCE ROW LEVEL SECURITY`)
sigue fuera del bloque y se ejecuta igual, sin condicion: sobre tablas vacias todo ese DDL es
trivialmente valido.

## DOWN: revision y veredicto

Comprobe las tres guardias de datos de cada `down.sql` (que existen para no perder filas de
otra empresa al revertir) y encontre el MISMO patron: primero resuelven la empresa "del UP" por
`name_normalized = 'quimicloud'` (con el mismo fallback de una-sola-empresa) y solo despues
miran si hay algo que proteger. Sobre las tablas de destino vacias, esa resolucion puede abortar
sin que exista ningun dato en riesgo.

Aplique el mismo `RETURN` temprano en los tres, justo antes de la primera sentencia de cada
guardia (antes de la resolucion de empresa en `recipes` y `orders`; antes de resolver en
`inventario`, que es tambien donde empezaba el bloque):

- QC-49 down: `RETURN` si `count(products) + count(presentations) + count(product_batches) = 0`.
- QC-60 down: `RETURN` si `count(orders) = 0`.
- QC-50 down: `RETURN` si `count(recipes) = 0`.

Razonamiento de por que es seguro: las tres guardias del DOWN protegen exactamente contra (a)
inventario/pedidos/recetas de OTRA empresa y (b) colisiones de unicidad que dos empresas
volverian a compartir al restaurar el indice GLOBAL. Ambas condiciones son imposibles con cero
filas en la tabla protegida — no hay fila que pertenezca a otra empresa ni fila que colisione
con otra. El `RETURN` solo sale del `DO $$`; el resto del archivo (dropear disparadores,
funciones, indices, FK y columnas, restaurar el indice global, re-forzar RLS) esta FUERA del
bloque y sigue ejecutandose sin condicion, que es la reversion de esquema completa que exige R6
en cada ficha. Con datos reales en la tabla, el `RETURN` no se dispara y las guardias abortan
exactamente igual que antes (verificado: ver seccion de resultados, el test de ambiguedad de
`company-scope.int.test.ts` sigue en verde).

**Veredicto del `down.sql`: se aplico el mismo arreglo, no se dejo pendiente.** No encontre
ningun riesgo de debilitar la guardia del DOWN: la condicion de salida es la que ya usa el UP y
un test de integracion con datos reales (pedidos) sigue disparando la guardia correctamente
tras el cambio.

## Que corri y con que resultado

- `pnpm run typecheck` -> limpio, sin salida (`tsc --noEmit` termina en 0 sin errores).
- `pnpm run lint` -> limpio, sin salida (`eslint` termina en 0 sin errores).
- `pnpm exec vitest run tests/unit/inventario/schema/inventory-company-scope-migration.test.ts
  tests/unit/pedidos/schema/orders-company-scope-migration.test.ts
  tests/unit/recetas/schema/recipes-company-scope-migration.test.ts` -> `33 failed | 18 passed`
  (51 tests). Comprobe con `git stash` que este es el resultado EXACTO —mismo conjunto de casos,
  no solo el mismo numero— en la copia limpia de `dev`, ANTES de tocar nada (`diff` linea a
  linea de los nombres de test con `git stash` / `git stash pop`, sin diferencias salvo el
  tiempo en ms). Es decir: estas 33 fallas son preexistentes en `dev`, no las causa este fix, y
  mi cambio no arregla ni rompe ninguna. No investigue su causa por estar fuera del alcance de
  esta ficha (un fix puntual, sin tocar nada mas alla de lo pedido); queda anotado por si el
  humano quiere abrir una ficha aparte.
- `pnpm exec vitest run tests/integration/pedidos/company-scope.int.test.ts` (el entorno SI
  tiene Postgres local levantado en `localhost:5432` y el harness de test-db funciono) ->
  `12 passed (12)`, incluido el caso puntual que pide el enunciado: "si la empresa no se puede
  resolver de forma univoca, el UP aborta ENTERO y el esquema queda como antes" (la ambiguedad
  se prueba con un pedido ya creado en el fixture, tabla no vacia, y la guardia sigue disparando
  tras el fix). Tambien pasaron las tres reversiones (`R6`) que fuerzan las tres guardias del
  DOWN.
- Adicional, no exigido por el encargo pero de bajo costo dado que el entorno tenia DB: corri
  tambien `tests/integration/inventario/company-scope.int.test.ts` (`13 passed`) y
  `tests/integration/recetas/company-scope.int.test.ts` (`14 passed | 1 failed`). La unica falla
  ("el retrato de despues es el de antes sin la columna...", en la restauracion del DOWN de
  recetas) la reproduje identica con `git stash` sobre `dev` limpio: es preexistente y no la
  causa este cambio.

## Veredicto de una linea

Las tres migraciones (`migration.sql` y `down.sql`) arrancan y revierten sobre una base vacia
sin backfill, sin `INSERT INTO companies`, sin debilitar ninguna guardia (verificado con datos
reales via integracion) y sin introducir ninguna regresion nueva en los tests existentes.
