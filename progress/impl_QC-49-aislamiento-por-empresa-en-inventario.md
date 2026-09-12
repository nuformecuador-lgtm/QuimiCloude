# QC-49 — aislamiento-por-empresa-en-inventario · bitácora del implementer

> Spec aprobado por el humano el 2026-09-11 (F1.4). Worktree
> `.worktrees/QC-49-aislamiento-por-empresa-en-inventario`, rama
> `feature/QC-49-aislamiento-por-empresa-en-inventario`, nacida de `origin/dev` en `f783e06`.
> Base propia `QuimiCloude_QC49`. La base compartida `QuimiCloude` no se tocó en ningún momento.
> **T17 (gate completo `./init.sh`) no lo corre el implementer**: queda para el leader, y el
> reviewer decide. Esta bitácora no se autoaprueba.

## Estado: 17 de 18 tasks cerradas (T0–T16). Queda T17, que es del leader.

## Qué se construyó, por bloques

**Bloque 0 — base de datos (T0–T3).** Una migración nueva escrita a mano,
`db/migrations/20260911130000_inventory_company_scope/`, con su `down.sql`. Las tres tablas
—`products`, `presentations`, `product_batches`— ganan `company_id` **NOT NULL** con FK a
`companies` (`ON DELETE RESTRICT ON UPDATE CASCADE`); el lote lleva **columna propia**, no heredada
de su producto (decisión cerrada 2, la que desbloquea QC-81). Backfill a «QuimiCloud» resuelto por
`name_normalized`, nunca por identificador, con un único fallback («hay exactamente una empresa») y
`RAISE EXCEPTION` en cualquier otro caso; comprobación de `ROW_COUNT` por tabla; **cero `INSERT` y
cero `DELETE`**. Índice único global de presentación sustituido por el compuesto
`presentations_company_name_unique (company_id, name_normalized)`, no parcial. Dos disparadores de
coherencia con mensajes distinguibles por caso. `ENABLE` + `FORCE ROW LEVEL SECURITY` en las tres,
sin policies.

**Bloque 1 — dominio y puertos (T4–T6).** Nace `InventoryScope`; el `Actor` de `inventario` gana
`companyId` (patrón literal de QC-76) y el dominio lo traduce a ámbito. **Ningún import nuevo hacia
`identity`.** Los **doce** métodos de los dos puertos exigen `scope: InventoryScope` al final de la
firma. Los nueve casos de uso solo hacen de correa: `requirePermission` sigue siendo la primera
línea, y ninguno menciona `company` en un `where`.

**Bloque 2 — persistencia y driving (T7–T9).** `adapters/driven/persistence/company-scope.ts` es el
punto único: una función privada `companyScope` y las envolturas tipadas que **todas** delegan en
ella. Los dos adaptadores componen el ámbito con `AND` —nunca al mismo nivel que el `OR` de
búsqueda—, lo llevan en el `where` de toda escritura sobre fila existente (no en un `if` posterior),
y el `count` del listado usa **el mismo** `where` que el `findMany`. Las dos Server Actions
construyen el actor con las dos caras de la sesión en paralelo y fallan cerrado.

**Bloque 3 — pruebas (T10–T15).** Ver el mapa de trazabilidad abajo.

## Archivos

**Producción (22).** `db/schema.prisma`; `db/migrations/20260911130000_inventory_company_scope/`
(`migration.sql`, `down.sql`, nuevos); y dentro de `lib/modules/inventario/`:
`domain/inventory-scope.ts` (nuevo), `domain/actor.ts`, `domain/presentation-input.ts`, los nueve
casos de uso, `ports/product-repository.ts`, `ports/presentation-repository.ts`,
`adapters/driven/persistence/company-scope.ts` (nuevo), `product-prisma.ts`,
`presentation-prisma.ts`, `product-catalog-prisma.ts` (solo docblock de R29),
`adapters/driving/product-actions.ts`, `presentation-actions.ts`, `index.ts`.
**Ningún archivo de producción de otro módulo cambió** (R28).

**Tests nuevos (6).** `tests/unit/inventario/schema/inventory-company-scope-migration.test.ts`,
`tests/unit/inventario/company-isolation-service.test.ts`,
`tests/unit/inventario/company-scope.test.ts`,
`tests/integration/inventario/company-scope.int.test.ts`,
`tests/integration/inventario/company-scope-queries.int.test.ts`, y el E2E
`e2e/aislamiento-inventario.spec.ts`.

**Tests ampliados o con fixture reparado (35).** `authorization`, `scope`, `product-catalog`,
`list-use-cases`, `product-actions`, `presentation-actions`, `create-product`, `product-service`,
`presentation-service`, `product-input`, `schema/inventario-schema` en `tests/unit/inventario/`;
los ocho de `tests/integration/inventario/`; los de `recetas`, `unidades`, `proveedores` y `pedidos`
que **siembran** inventario; `e2e/recetas.spec.ts` y `e2e/recetas-pasos.spec.ts`; y dos listas
cerradas de guardias en `guard-identificador-de-request.test.ts` (`MIGRACIONES_ESPERADAS` y
`E2E_ESPERADOS`). En los fixtures solo se tocó la siembra, no lo que cada test afirma.

**Documentación.** `docs/architecture.md > Dominio`: `inventario (QC-49)` sale de la lista de deuda
registrada de la épica QC-46; el resto de la viñeta queda intacto (T16).

## Verificación — salida real

Corrida por el implementer en el worktree, con `DATABASE_URL` cargada del `.env` propio:

```
pnpm run typecheck   ->  tsc --noEmit, sin salida. Exit 0.
pnpm run lint        ->  eslint, sin salida. Exit 0.

npx vitest run tests/unit/inventario/ tests/integration/ tests/guards/
  Test Files  92 passed (92)
       Tests  1284 passed (1284)
    Duration  73.83s

npx playwright test e2e/aislamiento-inventario.spec.ts --project=chromium  ->  1 passed (34.6s)
npx playwright test e2e/aislamiento-inventario.spec.ts --project=webkit    ->  1 passed (27.4s)
```

Migración, verificada contra `QuimiCloude_QC49` y **no** contra la compartida: `pnpm run db:migrate`
aplica; `pnpm run db:rollback` deja el esquema **idéntico** (comparación de `information_schema`,
`pg_constraint`, `pg_indexes`, `pg_trigger`, `pg_proc`, `pg_class`: igual en las siete secciones),
sin perder ninguna fila y con `_prisma_migrations` coherente; y con una fila de otra empresa
presente, la reversión **aborta entera** con su mensaje (R7). La base queda como se encontró.

### Que los tests muerden, medido y no supuesto

No basta con que pasen (`docs/verification.md`): se comprobó que caen cuando deben.

- Quitando el ámbito de `buildProductWhere`/`buildPresentationWhere` y de los `where` de escritura,
  `company-scope-queries.int.test.ts` pasó de **28 verdes a 20 rojos**. Adaptadores restaurados.
- Moviendo las filas de la empresa B a la A en el `beforeAll` del E2E —el mundo sin aislamiento—, el
  test cayó en la aserción sobre el HTML servido. Mutación revertida.
- El E2E lleva **control positivo permanente**: el producto propio de A sí se ve y el mismo diálogo
  sí lo borra, así que un aislamiento roto *por exceso* tampoco daría verde.

## Trazabilidad `R<n> -> test`

| R | Test | Nivel |
| --- | --- | --- |
| R1 | `tests/integration/inventario/company-scope.int.test.ts` | integración |
| R2 | `tests/integration/inventario/company-scope.int.test.ts` | integración |
| R3 | `company-scope.int.test.ts` (ejecuta el bloque real del backfill) | integración |
| R4 | `tests/unit/inventario/schema/inventory-company-scope-migration.test.ts` | unit |
| R5 | `tests/guards/guard-rls-force.test.ts` + `inventory-company-scope-migration.test.ts` | guardia + unit |
| R6 | `inventory-company-scope-migration.test.ts` | unit |
| R7 | `company-scope.int.test.ts` (guardia del `down.sql`, reversión abortada) | integración |
| R8 | `inventory-company-scope-migration.test.ts` | unit |
| R9 | `inventory-company-scope-migration.test.ts` | unit |
| R10 | `inventory-company-scope-migration.test.ts` + `list-query-indexes.int.test.ts` | unit + integración |
| R11 | `tests/unit/inventario/company-isolation-service.test.ts` | unit |
| R12 | `product-actions.test.ts`, `presentation-actions.test.ts` | unit |
| R13 | `company-scope.test.ts` + `tests/guards/guard-ambito-empresa-inventario.test.ts` (por función) + `company-scope-queries.int.test.ts` | unit + guardia + integración |
| R14 | `company-scope-queries.int.test.ts` (listado y `total`, búsqueda y filtros) | integración |
| R15 | `company-isolation-service.test.ts` | unit |
| R16 | `company-isolation-service.test.ts` + `company-scope-queries.int.test.ts` | unit + integración |
| R17 | `company-isolation-service.test.ts` + `company-scope-queries.int.test.ts` | unit + integración |
| R18 | `company-isolation-service.test.ts` | unit |
| R19 | `company-scope.test.ts` + `company-scope-queries.int.test.ts` | unit + integración |
| R20 | `company-scope.int.test.ts` + `presentation-uniqueness.int.test.ts` | integración |
| R21 | `company-scope.int.test.ts` | integración |
| R22 | `company-scope.int.test.ts` (disparador, afirmado por su etiqueta) | integración |
| R23 | `company-scope.int.test.ts` (disparador, afirmado por su etiqueta) | integración |
| R24 | `authorization.test.ts` + `company-isolation-service.test.ts` | unit |
| R25 | `company-scope-queries.int.test.ts` (empresa de baja) | integración |
| R26 | `company-scope-queries.int.test.ts` (sin `FORCE`, mismo resultado) | integración |
| **R27** | **`e2e/aislamiento-inventario.spec.ts`** (Chromium y WebKit) | **E2E** |
| R28 | `scope.test.ts` + `inventory-company-scope-migration.test.ts` | unit |
| R29 | `product-catalog.test.ts` (`findRefs` sin ámbito, con el motivo citado) | unit |
| R30 | `inventory-company-scope-migration.test.ts` | unit |
| R31 | `list-use-cases.test.ts` + `product-actions.test.ts` | unit |
| R32 | `tests/guards/guard-dependencias-aprobadas.test.ts` | guardia |

**Los 32 requisitos tienen test. Ninguno quedó sin cubrir.** Dependencias nuevas: **cero**
(`package.json` no se tocó). Códigos de error nuevos: **cero** (`ERROR_CODES` no crece).

## Decisiones tomadas fuera de la letra del spec

Las anoto porque el reviewer las tiene que juzgar; ninguna reabre una decisión cerrada.

1. **Una cuarta envoltura en `company-scope.ts`: `companyScopeColumns`.** El diseño (§5) publica tres
   envolturas tipadas como `…WhereInput`, donde Prisma declara `companyId` **opcional y como unión**
   (`UuidFilter | string`); los `…CreateInput` lo exigen `string` obligatorio, así que esparcir una
   envoltura de `where` dentro del `data` de un `create` **no compila**. La alternativa era escribir
   `companyId: scope.companyId` a mano en las cuatro creaciones, que es justo lo que §5 prohíbe. La
   cuarta envoltura **delega en la misma función privada**, así que la garantía que importa —una sola
   definición de «de la empresa»— queda intacta. **Corregido en la segunda vuelta:** las envolturas
   quedan en **tres**, porque `batchCompanyScope` era export muerto y se borró.
2. **`presentation-input.ts` pasa de `z.object` a `z.strictObject`.** No es un extra: R17 exige
   literalmente rechazar la entrada **por campo desconocido**, y con `z.object` una `companyId` en el
   alta de presentación se podaba **en silencio**. `product-input.ts` y `product-batch-input.ts` ya
   usaban `strictObject` citando esa misma regla (QC-52 R1); presentaciones era el único hueco. Se
   verificaron los llamantes antes de cambiarlo y ninguno mandaba campos de más.
3. **El paréntesis `NO FORCE`/`FORCE` del backfill incluye también `companies`**, que el diseño no
   nombra. Se **lee** para resolver «QuimiCloud», y con `FORCE` ese `SELECT` devolvería cero filas
   fuera de superusuario, abortando la migración con el mensaje equivocado. `companies` no se
   modifica y vuelve a `ENABLE`+`FORCE` en el mismo bloque. Precedente: QC-80 con `units`.
4. **Listas cerradas de guardias que tuvieron que crecer** (eran **cuatro**, no tres: la cuarta la
   encontró el reviewer y es el bloqueante 1 de la segunda vuelta), cada una con su justificación escrita y
   sin debilitar la guardia: `MIGRACIONES_ESPERADAS` (la migración nueva) y `E2E_ESPERADOS` más la
   lista de `scope.test.ts:309` (el spec E2E nuevo). En la de `scope.test.ts` se eligió **enumerar**
   en vez de afinar el matcher por nombre: enumerar es más estrecho, porque un tercer spec vuelve a
   poner la guardia en rojo, y además se le añadió la defensa de que el archivo siga llevando la
   señal de lo que dice ser.
5. **Censos de esquema actualizados, y reforzados en vez de debilitados**
   (`inventario-schema.test.ts`, `inventario-constraints`, `list-query-indexes`): ahora exigen el
   compuesto y **vetan** el único global y la unicidad `(empresa, lote)` que es de QC-81.
6. **`presentation-uniqueness.int.test.ts` cambia de significado a propósito**: su sujeto pasa de la
   unicidad global a la de empresa, que es lo que R20 ordena.

## Cosas que dejo señaladas al reviewer (no son bloqueos)

- **La garantía de R13 es asimétrica en TypeScript.** *(Segunda vuelta: confirmado por el reviewer y
  CERRADO — guardia por función + textos corregidos. Se deja el párrafo por trazabilidad.)* Una **llamada** que olvide el ámbito no
  compila —eso es cierto y está comprobado—, pero una **implementación** que lo ignore sí compila:
  TS admite asignar una función con menos parámetros. Hoy los adaptadores no compilarían igualmente
  por el `companyId` obligatorio de Prisma en las escrituras, pero en los métodos de **lectura** ese
  hueco existe. Lo que lo cierra es el test de integración de T13 (medido: 28 → 20 rojos al quitar el
  ámbito), no el compilador. Conviene decirlo en vez de dar por buena una garantía más fuerte de la
  que el lenguaje da.
- **Lectura anidada `PRODUCT_SELECT.batches` (`LATEST_BATCH_UNIT`, QC-80)**: se alcanza solo a través
  de una fila de producto ya acotada, y la coherencia lote↔producto la garantiza el disparador de
  R22, así que no se le añadió filtro propio para no tocar QC-80. Queda explícito por si el reviewer
  lo quiere de otro modo.
- **Los recuentos de `tasks.md` T1 (23 productos / 114 presentaciones / 1 lote / 37 empresas) son de
  la base compartida**, no de `QuimiCloude_QC49`, que está recién sembrada. El criterio de «hecho»
  de T1 se verificó sembrando a mano esas filas antes del UP y comprobando el backfill sobre ellas.
  Era eso o tocar la base compartida, que estaba prohibido — y que hoy mismo dejó tres sesiones en
  rojo.
- **Deuda que esta ficha deja escrita y con destino, no como olvido**: `ProductCatalog.findRefs`
  sigue sin ámbito (R29 → QC-50, con la consecuencia aceptada de que una receta de A que guarde el
  id de un producto de B lo siga resolviendo hasta entonces);
  `supplier_catalog_lines.presentation_id` sin coherencia de empresa (→ QC-59); los índices de
  listado no recompuestos (decisión de volumen, no de corrección); y la cuarta copia de
  `currentActor`, que §4.1 decide **no** extraer aquí.

---

# Segunda vuelta — respuesta al rechazo del reviewer (F2.2)

El `reviewer` **rechazó** la feature con tres bloqueantes
(`progress/review_QC-49-aislamiento-por-empresa-en-inventario.md`). Los tres están cerrados, más los
cuatro menores. Sigue sin haber commit ni PR, y el `./init.sh` completo lo corre el leader.

## Primero, el error de método que hizo falta que me señalaran

La corrida que presenté arriba como verificación —`vitest run tests/unit/inventario/
tests/integration/ tests/guards/`, «92 archivos / 1284 tests»— **es un subconjunto de la suite**
(339 archivos) y **excluye `tests/unit/shared/`**, que es justo donde estaba el rojo. La presenté sin
decir qué abarcaba, y eso es exactamente el agujero contra el que avisa la regla 5. El rojo no se me
escapó por mala suerte: se me escapó porque elegí el alcance de la corrida y luego la reporté como si
fuera la suite. **De aquí en adelante, en esta bitácora, toda corrida declara su alcance.**

## BLOQUEANTE 1 — la cuarta lista cerrada · CERRADO

Había **cuatro** listas cerradas de guardias, no tres: faltaba
`tests/unit/shared/data-table-alcance.test.ts:340`. `e2e/aislamiento-inventario.spec.ts` entra en
orden alfabético con su párrafo de motivo al nivel de las entradas de QC-45 y QC-39, y el `it(...)`
pasa de «cinco» a «seis». **La lista sigue CERRADA**: un séptimo spec la vuelve a poner en rojo. No
se aflojó nada.

## BLOQUEANTE 2 — R13 vendía una garantía que el compilador no da · CERRADO, por las dos mitades

El reviewer lo verificó con `tsc`: una implementación de **menor aridad** satisface la firma del
puerto y **compila**, y así se cablea en `lib/composition/index.ts:330` y `:344`. Las escrituras se
salvaban de rebote por el `companyId` obligatorio de Prisma; **las lecturas no tenían seguro**. Y las
guardias existentes eran **por archivo**, así que un método de lectura nuevo pasaba.

Se hicieron **las dos** cosas que el informe ofrecía como alternativas, porque ninguna sola basta:

- **(a) El hueco se cierra.** Nueva guardia `tests/guards/guard-ambito-empresa-inventario.test.ts`
  (20 casos): deriva los métodos de los dos puertos, los cruza con el cableado real de
  `lib/composition/index.ts` y exige, **método a método**, que la implementación declare el ámbito y
  que ese ámbito **llegue** hasta una envoltura de `company-scope.ts` (cierre transitivo por los
  ayudantes del propio archivo, que es lo que salva a `listAliveProducts` → `buildProductWhere`). Un
  segundo bloque barre toda función de `adapters/driven/persistence/**` que ejecute `prisma.`/`tx.`,
  con `findProductRefs` como **única** excepción escrita (R29 → QC-50), a la que además se le exige
  seguir sin ámbito y con el motivo citado.
- **(b) Los textos se corrigen, porque «no compila» seguiría siendo falso incluso con la guardia.**
  `R13`, `design.md > 4.2` y `> 9 B` reescritos para decir lo que el lenguaje de verdad garantiza: la
  **llamada** no compila; la **implementación** sí compila y por eso no puede llegar a `dev`, y se
  rechaza de forma mecánica y automática. **No se relaja la exigencia**, cambia **quién** la detecta.
  Lleva nota fechada 2026-09-11 marcada como *corrección de una afirmación falsa*, para que el humano
  que aprobó el spec vea qué cambió y por qué.
- **El descarte de `$extends` (`design.md > 9 C`) se sostiene sin la premisa caída**, y queda escrito
  por qué: sus otros dos motivos son independientes del compilador y cada uno basta —es **implícito**
  (la consulta filtraría por algo que no está en el archivo que la escribe) y es **global**
  (alcanzaría a `identity`, `recetas`, `proveedores` y `pedidos`, que R28 deja fuera)—, y además el
  enfoque elegido gana ahora un chequeo mecánico por función que sobre un `$extends` no existiría.

**Prueba de que la guardia muerde** (dos mutaciones, ambas revertidas): quitando `scope` de
`findAliveProductById` → `2 failed | 18 passed`, con el mensaje nombrando el método; y declarándolo
sin usarlo → `2 failed | 18 passed`. En la primera mutación, `tests/unit/inventario/company-scope.test.ts`
seguía en **9 passed**, lo que confirma que las guardias por archivo no la habrían cazado, y `tsc`
solo se quejó en archivos de **test**: el cableado de producción compiló. Es exactamente el agujero
del informe, ahora con algo que lo mira.

## BLOQUEANTE 3 — el `down.sql` se contradecía con su UP · CERRADO

**Decisión: el razonamiento del UP es el correcto** —`FORCE ROW LEVEL SECURITY` somete también al
dueño de la tabla y, sin ninguna policy, eso deniega igualmente el `SELECT`—, así que **el DOWN
necesitaba el mismo paréntesis**. El `down.sql` abre ahora `NO FORCE` sobre las cuatro tablas antes
de su guardia, cierra `companies` justo después del bloque y las tres de inventario al final; el
comentario que afirmaba que el DOWN «no necesita abrirlo» queda corregido.

Y queda escrito en los **dos** archivos lo que antes solo decía a media voz esta bitácora: **en local
esto no se puede distinguir**, porque el `.env` conecta como `postgres`, superusuario, que se salta
la RLS. Con ese rol ni el paréntesis del UP ni el nuevo del DOWN son observables, y **el test de R7
no prueba ese escenario**. Se prefiere decirlo a aparentar una verificación que no existe. El test de
esquema gana un caso que exige el paréntesis del DOWN, con dos mutaciones de sensibilidad.

## Menores · todos cerrados

- `docs/architecture.md`: lo había reescrito entero en LF con un `sed -i` sobre un archivo CRLF.
  Restaurado desde `HEAD` y reaplicada la línea byte a byte: el diff vuelve a ser **1/1** con CRLF
  intacto. Comprobado además que **ningún otro archivo** del diff tiene esa churn.
- `batchCompanyScope`: **borrado**. Era export muerto —el lote no tiene lectura propia: su única
  lectura llega por una fila de producto ya acotada y sus escrituras usan `companyScopeColumns`—.
  Queda escrito que QC-81 lo reintroduce **con su consumidor**. Reflejado en el test y en `design.md > 5`.
- `presentation-prisma.ts`: los dos docblocks obsoletos (el índice único ya no es global) y la frase
  truncada, corregidos.

## Verificación de la segunda vuelta — con el alcance declarado

Corrida por el implementer en el worktree, con `DATABASE_URL` cargada del `.env` propio:

```
pnpm run typecheck   ->  exit 0, sin salida.
pnpm run lint        ->  exit 0, sin salida.

pnpm test   <- SUITE DE VITEST COMPLETA (los tres proyectos, 339 archivos), no un subconjunto
  Test Files  2 failed | 337 passed (339)
       Tests  2 failed | 4624 passed | 31 skipped (4657)
    Duration  168.48s

npx vitest run tests/guards/guard-ambito-empresa-inventario.test.ts  ->  20 passed (guardia nueva)
```

Los **2 rojos son los dos conocidos y ajenos**: `tests/unit/recetas/module-contract.test.ts` y
`tests/unit/recetas-ui/recipe-route-contract.test.ts`, ambos en `tests/baseline-rojos.json`
—comprobado leyendo el archivo, no de memoria—, que fallan porque su
`git diff origin/dev...HEAD` está vacío al no tener commits la rama. **El rojo propio de la ficha
desapareció.** Los 339 archivos frente a los 338 del informe son la guardia nueva.

`git diff --numstat | awk '$1>200 || $2>200'` sale **vacío**: sin churn de finales de línea.
**Playwright no se corrió en esta vuelta** (lo corre el gate del leader); el E2E pasó en Chromium y
WebKit en la primera, y su archivo no se ha tocado desde entonces salvo por la lista cerrada, que no
es suya.

**T17 sigue sin marcar**, y es lo correcto: el implementer no se autoaprueba el gate.
