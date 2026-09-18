# QC-91 — existencia-por-lote · review

> Reviewer, 2026-09-17. Rama `feature/QC-91-existencia-por-lote`, diff `origin/dev...HEAD`
> (65 archivos, +2354/-463). El gate completo lo corrio el leader: 497 archivos,
> 7249 passed, 95 skipped, 0 rojos. Aqui solo se reejecuto lo necesario para confirmar
> o descartar hallazgos concretos.

## Veredicto

**RECHAZADO.** Un bloqueante: comentarios de produccion que citan ficha y requisito en
lineas que la rama escribe (`docs/conventions.md > Comentarios`, vigente y sin excepciones).
Todo lo demas -trazabilidad, migracion, guardias, E2E, aislamiento, dependencias- pasa.

## Checklist

### Especificacion
- [x] `requirements.md` con R1-R23 en EARS y tabla de 18 decisiones cerradas.
- [x] `design.md` con alternativas descartadas y su porque.
- [ ] `tasks.md` con **todas** las tasks `[x]`: T13 (gate completo y cierre) sigue en `[ ]`.
      Es la task del leader y el gate ya corrio verde; falta el trazo. **menor**.

### Trazabilidad - 23/23 verificados uno a uno

Se abrio cada `archivo:linea` del mapa de `progress/impl_QC-91-existencia-por-lote.md` y se
leyo el caso: ninguno esta vacio, ninguno es un `it.skip`, y el nombre coincide con lo que
el requisito exige.

| R | Verificado en |
|---|---|
| R1 | `tests/unit/inventario/qc91-alcance.test.ts:201`, `:208`, `:214`, `:223` |
| R2 | `tests/unit/inventario/schema/inventario-migration.test.ts:381`, `:394`; `schema/inventario-schema.test.ts:259` |
| R3 | `tests/unit/inventario/product-prisma.test.ts:114`; `product-stock.test.ts:4` |
| R4 | `tests/integration/inventario/list-query-products.int.test.ts:440` |
| R5 | `tests/unit/inventario/product-stock.test.ts:4`, `:13`, `:29` |
| R6 | `tests/unit/inventario/product-page.test.tsx:723` |
| R7 | `tests/unit/inventario/product-stock.test.ts:25`; `product-page.test.tsx:743` |
| R8 | `tests/unit/inventario/list-query.test.ts:178`; `list-use-cases.test.ts:172`; `product-list-params.test.ts:176` |
| R9 | `tests/unit/inventario/product-input.test.ts:243`; `product-actions.test.ts:462`; `product-field.test.tsx:77`; `product-page.test.tsx:1057` |
| R10 | `tests/unit/inventario/product-batch-input.test.ts:335`; `product-field.test.tsx:77` |
| R11 | `tests/unit/inventario/qc91-alcance.test.ts:261`-`:315`; `product-prisma.test.ts:73`; `product-catalog.test.ts:39` |
| R12 | `tests/unit/recetas/recipe-service.test.ts:392`; `tests/unit/pedidos-ui/order-form.test.tsx:728` |
| R13 | `recipe-service.test.ts:403`; `order-form.test.tsx:743` |
| R14 | `recipe-service.test.ts:414`; `order-form.test.tsx:758`; `product-prisma.test.ts:109` |
| R15 | `recipe-service.test.ts:425` (con `:392`, `:403`, `:414`) |
| R16 | `product-page.test.tsx:629`, `:703` |
| R17 | `product-page.test.tsx:670` |
| R18 | `product-page.test.tsx:682` |
| R19 | `tests/unit/inventario/authorization.test.ts:485`; `recipe-service.test.ts:433` |
| R20 | `e2e/inventario.spec.ts:636` |
| R21 | `qc91-alcance.test.ts:355`, `:361`, `:365`, `:369` |
| R22 | `e2e/inventario.spec.ts:636` |
| R23 | `tests/guards/guard-dependencias-aprobadas.test.ts:63` + `git diff origin/dev...HEAD -- package.json pnpm-lock.yaml` vacio (comprobado) |

**R4, mirado aparte por venir tarde y por integracion.** El caso siembra dos lotes en la
misma unidad, uno con `expiryDate` en `2020-01-01` y otro sin vencimiento, y exige
`stockByUnit === [{ unitId, quantity: 15 }]`. Verificada la firma de `sembrarLote`
(`list-query-products.int.test.ts:122`): el quinto argumento es `expiryDate`, asi que el
lote vencido es de verdad un lote vencido. La eleccion de integracion sobre unitario esta
justificada: `sumStockByUnit` no recibe la fecha, de modo que solo la consulta real prueba
que nadie filtra por vencimiento. **Suficiente.**

### Verificacion ejecutable
- [x] Gate completo verde (leader). No se repitio.
- [x] E2E **reejecutado por el reviewer**: `pnpm exec playwright test e2e/inventario.spec.ts
      e2e/aislamiento-inventario.spec.ts` da **14 passed (1.5m)**, chromium y webkit, con el
      caso `:636` (segundo lote suma la existencia) verde en los dos. Es el E2E que QC-81
      difirio y que `CHECKPOINTS.md` exige para movimiento de inventario.
- [x] Guardias reejecutadas: `qc91-alcance`, `qc81-alcance`, `recipe-route-contract`,
      `inventario-migration` -> 4 archivos, **75 passed | 3 skipped**.
- [x] `init.sh` no corre Playwright (comprobado): el E2E no lo cubre el gate, por eso se
      corrio aqui.

### Datos y seguridad
- [x] La migracion no añade modelo: solo retira `products.stock`. No hay tabla nueva, asi
      que no aplica columna de empresa nueva ni RLS nueva.
- [x] Aislamiento por empresa: las consultas de operacion tocadas siguen con su ambito y sus
      tests (`company-scope.test.ts`, `company-isolation-service.test.ts`,
      `company-scope-queries.int.test.ts`, y el E2E de aislamiento verde).
      `findProductRefs` sin ambito es la excepcion declarada de QC-49 R29 con destino QC-50:
      la ficha cambia el campo devuelto, no el alcance. **No es hallazgo.**
- [x] Permisos en el service (R19), sin permiso nuevo.
- [x] Sin secretos, sin webhooks, sin lecturas por el cliente de Supabase.

### Migracion `20260917120000_drop_product_stock`
- [x] `migration.sql`: `DROP INDEX IF EXISTS products_stock_idx` ->
      `DROP CONSTRAINT IF EXISTS products_stock_non_negative` -> `DROP COLUMN stock`.
- [x] `down.sql` **restaura de verdad la forma original**, cotejado linea a linea contra las
      migraciones que la crearon:
  - `ADD COLUMN "stock" INTEGER` = `20260902005510_products_and_presentations:30`, nullable.
  - `CHECK ("stock" >= 0)` con el mismo nombre = `20260902005510:56`.
  - `CREATE INDEX "products_stock_idx" ON "products" ("stock") WHERE "deleted_at" IS NULL`
    = `20260904160000_list_query_indexes:83`, **identico**, indice parcial incluido.
  No restaura datos, y eso es lo que D11 acepto por escrito.
- [x] Ida-vuelta-ida la ejecuto el implementer con salida citada; no se repitio para no tocar
      una base compartida con otras dos sesiones. La equivalencia textual de arriba y
      `inventario-migration.test.ts:381`/`:394` la respaldan.

### Multiplataforma
- [x] La UI tocada (`product-columns.tsx`, `product-form.tsx`, `product-list-section.tsx`,
      `product-table.tsx`, `order-form.tsx`) no introduce `100vh`, ni `:hover` como unica via
      de activacion, ni targets por debajo de 44x44, ni `font-size` menor de 16px en inputs,
      ni libreria de UI nueva. El cambio de `product-columns.tsx` es texto en una celda.

### Dependencias
- [x] `package.json` y `pnpm-lock.yaml` **sin tocar** (diff vacio). No hay utilidad a mano que
      duplique una libreria del stack: `sumStockByUnit` es agregacion de dominio.

## Hallazgos

### BLOQUEANTE 1 - citas de ficha y requisito en comentarios de produccion que la rama escribe

`docs/conventions.md > Comentarios`: "**Nunca se cita una ficha ni un requisito** en un
comentario de produccion: ni `QC-<n>`, ni `R<n>`, ni `design.md`... **Sin excepciones**" y
"al tocar un archivo se limpian los comentarios **de las lineas que toca la rama**". Los
bloques de abajo **los reescribe esta rama** -no son preexistentes intactos-, y en la
reescritura se conservaron o se introdujeron las citas. Es el mismo motivo de los dos
rechazos de QC-103.

| Archivo | Linea añadida |
|---|---|
| `lib/modules/inventario/domain/product-view.ts` | `* se quito (QC-91, R10): se escribe unicamente en el lote que crea el alta...` |
| `lib/modules/inventario/domain/product-input.ts` | `* la edicion es reemplazo completo (R13/R19) y usa el mismo esquema que el alta.` |
| `lib/modules/inventario/domain/product-input.ts` | `* strictObject, no z.object (QC-52, design.md > 4): un campo de mas se RECHAZA...` |
| `lib/modules/inventario/domain/product-input.ts` | `* ya no esta aqui: es del lote, no del producto (R9, R10)...` |
| `lib/modules/inventario/domain/product-input.ts` | `* La edicion es REEMPLAZO COMPLETO, no PATCH por campos sueltos (11.7, D3, R13). No` |
| `lib/modules/inventario/domain/update-product.ts` | `* Edicion de producto (R9, R10, R11, R13, R14). Reemplazo completo de lo que` |
| `lib/modules/inventario/domain/update-product.ts` | `* queda editable, y se guarda TAL CUAL, sin derivarlo ni recalcularlo (D3, R13). La` |
| `lib/modules/inventario/domain/product-queryable.ts` | `*   - stock (R8): dejo de existir como columna de products...` (bullet **nuevo**) |
| `lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma.ts` | `// stockByUnit. Y sin unit_id propio desde QC-80 (R21): la columna desaparecio de` |

**Que falta para cumplirlo.** Reescribir esas lineas sin `QC-<n>`, `R<n>`, `D<n>`, la
referencia a la seccion 11.7 ni `design.md`, dejando solo el porque que el codigo no muestra
-o borrando el comentario si lo unico que aportaba era la cita-. Si abulta, en su propio
commit `chore(QC-91): limpia comentarios de <archivo>`, sin cambiar codigo. **No se tocan**
los comentarios preexistentes que el diff no roza (p. ej. la cabecera de
`product-columns.tsx:11`, que sigue citando R6, R7, R8 y design.md en una linea de contexto):
esos son limpieza por modulo, no de esta ficha.

### La desviacion de T10 - **juzgada correcta, no es hallazgo**

`tasks.md` pedia un censo sobre `lib/` y `app/` que fallara si reaparecia `products.stock`.
El implementer escribio en su lugar `tests/unit/inventario/qc91-alcance.test.ts`, que afirma
el estado nuevo en positivo. **Protege de verdad**, y por tres razones medidas:

1. **Muerde sobre las fuentes reales, no solo sobre fuentes fabricadas.** Los casos `:261`,
   `:268`, `:274`, `:281`, `:290` y `:297` leen los archivos del arbol (`product-view.ts`,
   `product-catalog.ts`, `product-input.ts`, `product-prisma.ts`) y extraen el bloque exacto
   con balance de llaves. Si T8 se revirtiera, `ProductView` volveria a declarar el campo
   plano `stock`, `declaraCampoStockPlano` daria `true` y el caso se pondria rojo. El caso
   `:315` no sustituye a eso: es la autoprueba del detector.
2. **Cada detector trae su propia prueba de mutacion** (`:231`, `:247`, `:306`, `:375`), de
   modo que un detector que dejara de morder se delata solo. Es mas de lo que hacia el censo.
3. **Lo que el censo habria cubierto de mas, ya lo cubre el compilador.** `products.stock` no
   existe como columna desde T9 ni como campo de `ProductView`, `ProductRef` o `NewProduct`
   desde T8: cualquier lectura o escritura que reapareciera en `lib/` o `app/` rompe
   `pnpm run typecheck`, que el gate corre siempre. El censo habria sido, en la practica, una
   segunda capa sobre una barrera que ya es total, y una guardia que QC-121 -ya creada y
   autorizada a devolver la columna- habria tenido que pelear. Es el patron QC-99.

**Lo que queda descubierto, dicho sin adornos:** la guardia solo habla de siete fuentes
nombradas. Un `products.stock` que reapareciera fuera de ellas no lo veria *esta guardia*; lo
veria el typecheck. Y si QC-121 devuelve la columna, esta guardia si habra que ajustarla,
porque afirma en positivo el estado de QC-91; pero sera un ajuste deliberado de una ficha que
cambia el contrato, no una trampa escondida. **Aceptado, y bien declarado en la bitacora como
la desviacion mas grande de la ficha.**

### El caso borrado de `qc81-alcance.test.ts` - **correcto**

Verificado sobre el diff: se borro **solo** el caso «R31: products.stock se sigue escribiendo
como lo dejo QC-90», 9 lineas, nada mas. El `describe` que lo contenia sigue vivo con sus
otros casos, y **no quedaron simbolos huerfanos**: `ADAPTADOR_DE_PRODUCTO` se sigue usando en
`:450` y `hallazgosDeStockDeProducto` en `:502`-`:520`. El archivo reejecutado da
**11 passed | 3 skipped**. Borrar en vez de invertir es lo correcto: invertirlo habria fijado
un estado que QC-121 esta autorizada a cambiar.

### La guardia de recetas-ui acotada (`dfe1a9a`) - **comprobada, sigue mordiendo**

Comprobado por el reviewer, sin commits: se importo el modulo de la guardia con los globals de
vitest neutralizados y se evaluo `fueraDelAlcanceDeLaRama` contra el diff **real** de la rama y
contra el mismo diff **mutado** con un archivo bajo `app/(private)/produccion/formulas/`.

- Rama actual: `tocaLaRuta = false`, el caso retorna sin afirmar. Correcto: QC-91 no es la
  dueña de esa ruta.
- Diff mutado, que es lo que seria su propia rama: `tocaLaRuta = true` y
  `fueraDelAlcanceDeLaRama` devuelve `tocaRecetas` con
  `lib/modules/recetas/domain/recipe-view.ts` y `tocaDb` con los dos archivos de la migracion,
  con lo que sus dos aserciones de lista vacia fallan. **La guardia sigue dando rojo sobre su
  propia rama.** No es bloqueante.
- `RECETAS_PERMITIDAS`, `DB_PERMITIDAS` y `fueraDelAlcanceDeLaRama` estan intactas en el diff;
  lo unico que cambio es el disparador y la distincion entre «rango no disponible» (sigue
  rojo) y «rama ajena» (no aplica). Sigue el precedente `8bf3dd5`.

## Menores

1. **T13 sin marcar** en `tasks.md`. El gate completo ya corrio verde; falta el trazo.
   `CHECKPOINTS.md > Especificacion` pide todas `[x]`.
2. **`hallazgosDeStockDeProducto` quedo como detector sin sujeto** en `qc81-alcance.test.ts`:
   tras el borrado solo lo ejercita su propia autoprueba (`:492`), ya no se aplica a ningun
   archivo real. No es huerfano para el linter ni rompe nada, y a QC-121 le puede servir; pero
   conviene que QC-121 lo readopte o lo retire, no que se quede de adorno.
3. **La guardia de recetas-ui se estrecho un punto de mas**: si su propia ficha tocara
   `lib/modules/recetas/` o `db/` **sin** tocar la carpeta de la ruta, el caso retornaria sin
   afirmar. Para una ficha de UI es un supuesto improbable, y el precedente hace lo mismo.
4. **Comentario con un motivo que no se sostiene**:
   `lib/modules/inventario/domain/product-view.ts` documenta `stockByUnit` como "sumando todos
   los lotes **vivos** del producto". `ProductBatch` no tiene `deletedAt` en `db/schema.prisma`:
   no hay lotes muertos de los que distinguirse. Ademas de la cita, la palabra sobra.
5. **La limpieza de comentarios va mezclada con cambios de codigo** en los commits de T7 y T8,
   que es lo que `docs/conventions.md` pide separar cuando abulta. Al corregir el bloqueante,
   hacerlo en su propio commit.

## Que hay que hacer para aprobar

1. Limpiar las nueve lineas de la tabla del bloqueante, en commit propio de comentarios.
2. De paso, el menor 4: la palabra "vivos".
3. Marcar **T13** `[x]` cuando el gate se vuelva a correr tras el arreglo.
4. Volver a correr `./init.sh` completo -el arreglo toca `lib/`- y devolver al reviewer.
   No hace falta repetir el E2E: ya lo verifico el reviewer y el arreglo no toca `app/`.
