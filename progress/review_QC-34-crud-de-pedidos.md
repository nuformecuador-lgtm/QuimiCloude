# QC-34 — crud-de-pedidos · review

> Zona: `backend` · Complejidad: `high` · Rama: `feature/QC-34-crud-de-pedidos`
> Worktree: `.worktrees/QC-34-crud-de-pedidos`, base propia `QuimiCloude_QC34`.
> Revisado el 2026-09-04 contra `git diff origin/dev...HEAD` (commits `418409d`, `4f2a071`),
> `specs/QC-34-crud-de-pedidos/{requirements,design,tasks}.md`, `docs/architecture.md`,
> `docs/conventions.md`, `docs/verification.md`, `docs/dependencias.md` y `CHECKPOINTS.md`.
>
> **Veredicto: RECHAZADO** — 1 hallazgo BLOQUEANTE, 5 menores.

---

## Lo que se corrió aquí (no se confió en la bitácora)

| Comando | Resultado |
| --- | --- |
| `vitest run tests/unit/pedidos tests/unit/recetas tests/unit/recetas-ui tests/integration/pedidos tests/guards` (con el `.env` del worktree cargado) | **49 archivos, 592 tests, 0 fallos** |
| `pnpm run db:rollback` + inspección del catálogo | **R49 verificado a mano**: enum de tres valores, sin `cancellation_reason`, `orders_delivered_not_deleted` en su forma **literal** de QC-33, sin `next_order_sequence`, sin `orders_sequence_%`, sin `OrderStatus_old`, las cuatro FK y `relrowsecurity`/`relforcerowsecurity` intactos |
| `pnpm run db:migrate` + inspección | UP reaplicado: enum de cuatro valores, los **seis** `CHECK` con el `::text` en los dos que nombran `CANCELADO`, la función presente. Sin `55P04` |
| Guardia de datos del `down.sql` ejecutada contra un pedido `CANCELADO` real (fixtures dentro de una transacción revertida) | **R50 verificado a mano**: `ROLLBACK ABORTADO: hay 1 pedido(s) en estado CANCELADO…`. Base sin residuos (`orders=0`, `orders_sequence_%=0`) |

El gate completo lo corrió el leader (152 archivos / 1709 tests / 0 fallos) y no se repite.

---

## Checklist

### Especificación
- [x] `requirements.md` con EARS numerados R1–R58 y las 25 decisiones cerradas intactas.
- [x] `design.md` con alternativas descartadas y su porqué (§ 11, siete alternativas).
- [x] `tasks.md`: T1–T18 **todas** marcadas `[x]`.

### Trazabilidad
- [x] `progress/impl_…md` contiene el mapa `R<n> → test` (T18), 58 filas.
- [ ] **Cada `R<n>` mapea a un test que lo verifica de verdad** → **falla en R35** (y con él la
      capa de adaptador de R8, R13, R34, R40, R41). Ver **B1**.

### Calidad de código
- [x] `typecheck` y `lint` limpios (2 warnings preexistentes y ajenos a la ficha).
- [x] Tests unit/integración verdes (corridos aquí).
- [x] E2E: **diferido con motivo declarado en el spec** (decisión 24, R57). No hay flujo navegable.
- [x] UI: **no aplica**. La feature no toca `app/`, `components/` ni `middleware.ts` (verificado
      sobre el diff), así que la regla multiplataforma no tiene superficie donde aplicarse.
- [x] Dependencias: `package.json`, `pnpm-lock.yaml` y `docs/dependencias.md` **sin un solo cambio**
      en el diff (R58, regla 7 de `CLAUDE.md`). `scope.test.ts` lo vigila con mutaciones
      (`decimal.js`, `date-fns/addDays`) y afirma en positivo que `zod` sí se usa, para que la
      lista vacía no lo sea por vacío. `guard-dependencias-aprobadas` verde.

### Datos y seguridad
- [x] **Permiso validado en el service, primera línea, con su test.** `requireAdmin` es la primera
      sentencia de los seis casos de uso; `authorization.test.ts` lo demuestra en **ejecución**
      (siete actores × seis casos de uso, con dobles de los ocho métodos que **lanzan** si se les
      llama y `not.toHaveBeenCalled()` sobre todos) **y** estructuralmente (`requireAdmin` antes de
      `safeParse` y antes del primer `deps.*`, sobre el cuerpo de la función devuelta y no el de la
      factory). Consultar y listar pasan por el mismo sitio (decisión cerrada 1).
- [x] RLS activada **y forzada** en `orders` tras la migración: comprobado en el catálogo después
      del ciclo UP/DOWN/UP. La migración no toca RLS y `guard-rls-force` sigue verde. No se creó
      ninguna policy que pretenda sustituir a R2.
- [x] El acceso a datos de negocio pasa solo por el repositorio; ni una lectura con el cliente de
      Supabase.
- [x] Migración versionada y reversible con su `down.sql`; `db:rollback` revierte y deja
      `_prisma_migrations` coherente (verificado aquí).
- [x] Ningún secreto ni URL hardcodeada. Sin webhooks.

### Módulos hexagonales
- [x] `domain/` y `ports/` no importan framework, base de datos, `shared` ni adaptadores.
- [x] De otro módulo solo el barrel (`@/lib/modules/recetas`, `/unidades`, `/identity`); ninguna
      ruta profunda (`scope.test.ts`, con mutación).
- [x] El driving pide a `lib/composition`, no instancia su driven; y **nadie más** importa
      `order-prisma` (`module-contract.test.ts` lo afirma sobre todo el código del repo).
- [x] `lib/shared/**` sigue siendo hoja del grafo.
- [x] Ningún `'use server'` sale del barrel; el barrel solo reexporta `./domain`.
- [x] `/// @module` intacto; `pedidos` no consulta `prisma.recipe`/`unit`/`user`, y **nadie fuera de
      `order-prisma.ts` consulta `prisma.order`**.
- [x] No reaparecen `lib/services|repositories|interfaces`; nada nuevo cuelga de la raíz de `lib/`.
- [x] **La lógica está en `domain/`, no en la Server Action**: las seis actions solo resuelven el
      actor, traducen `FormData` y mapean el error por `code`. Los casos de uso hacen trabajo real
      (transiciones, R25, R28, R32, deduplicación de ids).

### Permisos
- [x] Mutaciones como Server Actions, sin route handlers ni `fetch` a rutas propias (R54,
      verificado en `scope.test.ts` y sobre el árbol).
- [x] Sin páginas ni componentes `private/` en esta ficha (son QC-35).

### Verificación final
- [x] `./init.sh` completo en verde (leader).
- [x] `progress/review_…md` existe → este archivo. **Veredicto RECHAZADO.**
- [ ] Entrada en `progress/history.md` — pendiente (cierre).
- [ ] Worktree desmontado — pendiente (cierre).

---

## Los cinco puntos que quedaban a juicio del reviewer

**1. Los siete retensados de tests existentes — ACEPTADOS los siete.** Se miraron uno a uno y
ninguno afloja más de lo que su requisito necesita: los siete pasan de «lista congelada vacía» a
**allowlist nombrada archivo a archivo, comentada y fechada**, nunca a «cualquiera», y todos
conservan una aserción de mutación que demuestra que el criterio todavía puede caer.

- `tests/unit/recetas/module-contract.test.ts` (el que se pidió mirar en particular): la lista pasa
  de vacía a **tres rutas nombradas** — `index.ts`, `domain/recipe-catalog.ts` y el adaptador
  `recipe-catalog-prisma.ts` nuevo. La causa es correcta y no es de conveniencia: **R44 obliga a
  que `recetas` publique** una consulta por ids que incluya las dadas de baja, y **QC-33 R32 lo
  prevé expresamente** («que DEBEN publicarlo»); ampliar el contrato del módulo dueño es la única
  salida compatible con la prohibición de que `pedidos` toque `prisma.recipe`. El repositorio, los
  casos de uso, la Server Action y el almacenamiento de QC-25 **siguen congelados**, y que la
  ampliación sea puramente aditiva lo demuestra `tests/unit/recetas/recipe-catalog.test.ts` (13
  casos). La premisa vieja era el alcance de QC-26 («es una feature de presentación»), no una
  invariante permanente.
- `recipe-route-contract.test.ts`: las mismas tres rutas más `db/schema.prisma` y los dos `.sql` de
  la migración, **nombrados uno a uno**. Todo lo demás de `recetas` y de `db/` sigue congelado.
- `pedidos/module-contract.test.ts` (cuatro retensados): exclusión mutua `.gitkeep` ↔ código;
  `ports/` alcanzable desde el barrel pero `adapters/` **sigue prohibido**, y las siete aserciones
  de «nada de servidor» ahora se aplican también al puerto; `prisma.order` y `@prisma/client` con
  **dueño único nombrado**; `'use server'` en **un solo** archivo y exclusividad de
  `lib/composition`. El caso de las transiciones pasa de «nadie nombra `assertTransition`» a «la
  **tabla** se declara en un solo archivo y el conjunto de **consumidores** se afirma
  explícitamente» — el criterio viejo hacía imposible que `updateOrder` llamara a la guardia, que es
  la capa 3 de `design.md > 8`. Se añadió además que **ningún `TRIGGER`** vive en el SQL de `orders`
  (R23), que es un diente nuevo, no uno menos.
- `pedidos-constraints.int.test.ts`: `'CANCELADO'` como ejemplo de valor inexistente pasa a
  `'DEVUELTO'`. Mismo SQLSTATE, misma fuerza; el comentario original ya anticipaba la migración.
- `pedidos-schema.test.ts` y `order-view.test.ts`: ampliaciones mecánicas, con un caso **nuevo** (la
  columna anulable, sin `@db.VarChar(n)` y sin `@default`).
- Única pérdida detectada, y es nula: se borró la aserción `not.toMatch(PROHIBIDO)` sobre el
  contrato. Es redundante — el barrel sigue pasando por el bucle por archivo, que solo descuenta
  importar y llamar al dueño de la tabla.

**2. La corrección de `design.md` § 6.4 / § 7.4 — CORRECTA, con su nota fechada, y el código la
respeta.** La nota del 2026-09-04 está al final de § 7.4 y § 6.4 la referencia; explica la
contradicción, por qué gana § 10 y cita el precedente literal (`supplier-repository.ts`). El código
la cumple: el puerto declara `listAlive(filters, query: PageQuery): Promise<Page<OrderRow>>` (con su
nota), `order-prisma.ts` es el único archivo que importa `lib/shared/pagination`, y
`list-orders.test.ts` afirma que la `query` que llega al puerto **no** trae `offset` ni `limit`.
`domain/` no importa `lib/shared/**` (R37: guardia de arquitectura y `scope.test.ts` con cinco
mutaciones).

**3. La desviación del `INSERT` (literal `PENDIENTE` → parámetro `data.status`) — CORRECTA.** El
argumento se sostiene: `NewOrder.status` es `EditableOrderStatus`, que no puede expresar la
cancelación (capa 1 de `design.md > 8`), así que parametrizar **no abre** ningún camino hacia
`CANCELADO`; y dejar el literal haría que el adaptador ignorara en silencio lo que R9 pone en el
caso de uso. Está declarada en la bitácora y comentada en el archivo. *(Ver M4: le falta la nota
fechada en `design.md > 4.2`, a diferencia de lo que sí se hizo con la paginación.)*

**4. R49 y R50 — verificados por el reviewer, no solo leídos.** En la suite viven como test
**estático** (`schema/pedidos-migration.test.ts`, con las seis mutaciones de sensibilidad: `::text`,
bicondicional, `NOT IN`, `DROP DEFAULT`, guardia del paso 0 y `DROP VALUE`), y ese test es ejecutable
y tiene dientes. El **ciclo real** solo estaba en la bitácora, así que se repitió aquí: `migrate →
rollback → migrate` deja el esquema idéntico al de QC-33 y vuelve, y la guardia de datos **aborta de
verdad** con un pedido `CANCELADO` en la tabla sin tocar ninguna fila. Se acepta.
`docs/verification.md` pide exactamente esto («verifica migraciones aplicando y revirtiendo en un
entorno de prueba»). Queda anotado como **M5**: es evidencia manual, no reproducible en CI.

**5. Las cuatro capas contra `updateOrder` → `CANCELADO` — LAS CUATRO ESTÁN, LAS CUATRO CON TEST.**

| Capa | Dónde | Test que la ejercita |
| --- | --- | --- |
| Tipos | `NewOrder.status: EditableOrderStatus`; `cancelAlive`, único método con `reason` | `order-view.test.ts` (`@ts-expect-error` sobre `CANCELADO` y sobre `cancellationReason`; el doble del puerto demuestra que solo `cancelAlive` recibe `reason`) |
| `zod` | `updateOrderSchema` con `EDITABLE_STATUS_VALUES` **derivado** por `filter`, y sin campo `reason` | `order-input.test.ts` (se deriva, no se escribe a mano; `CANCELADO` rechazado; `reason` descartado) + `order-service.test.ts` (la edición no puede cancelar: muere en el borde, con doble que falla si lo llaman) |
| Transiciones | `ALLOWED` sin `CANCELADO` como destino y finales con lista vacía | `order-transitions.test.ts` (matriz 4×4 completa, cinco pares permitidos, «`CANCELADO` no es destino de ningún par») |
| Base | `orders_cancellation_reason_matches_status` | `order-crud.int.test.ts` (los cuatro casos, afirmando sobre SQLSTATE) + `pedidos-migration.test.ts` (bicondicional exacto) |

Y `cancelOrder` es el único camino: `CANCELABLES` cubre solo `PENDIENTE`/`EN_CURSO`, con test desde
los cuatro estados, y `create-order.ts` estrecha `DEFAULT_ORDER_STATUS` con una **comprobación real
en carga de módulo**, no con un `as`.

### Lo caro de la ficha, revisado punto por punto

- **`ALTER TYPE … ADD VALUE` y el `55P04`**: el `::text` está en los dos `CHECK`, tiene su mutación
  en el test estático, y el UP se aplicó aquí en una sola transacción sin `55P04`.
- **`CHECK` de borrado ampliado**: `deleted_at IS NULL OR status::text NOT IN ('ENTREGADO',
  'CANCELADO')`, con el nombre conservado a propósito, leído en los **dos** sentidos y con sus
  **seis** casos de integración (incluidos los dos de «poner estado final a un pedido ya borrado»).
- **Secuencia por año**: `nextval` sin lock en el camino normal y `pg_advisory_xact_lock` solo en la
  rama de creación. El test de concurrencia usa **dos clientes `pg` reales**, comprueba el bloqueo
  mirando `pg_locks` (`NOT granted AND pid = <B>`) y que la promesa de B **no ha resuelto** —no un
  `setTimeout` a ojo—, y las dos acaban con posiciones distintas. El hueco se demuestra en positivo,
  y el año nuevo vuelve a arrancar en 1 sin mover el anterior.
- **Frontera con `recetas`, `unidades` e `identity`**: solo por barrel, con mutaciones que lo
  demuestran; `unidades` no se amplía y se reutiliza el `unitCatalog` ya cableado.

---

## Hallazgos

### `BLOQUEANTE` — B1. El adaptador driven no lo ejecuta ningún test, y R35 se queda sin test propio

`lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts` (382 líneas, único dueño de Prisma
del módulo) **no lo importa ni lo llama ningún test de la suite**. Los tests de integración de la
ficha lo dicen en su cabecera y ejecutan **una copia a mano** de sus sentencias por
`tx.$queryRaw` / `tx.order.*` dentro de una transacción revertida; los de unidad usan dobles del
puerto. Consecuencia: lo que el adaptador hace no lo verifica nada, y una copia no vigila a su
original.

Lo que eso deja abierto, requisito a requisito:

- **R35 — sin ningún test que lo verifique.** «Si no se indica tamaño de página, 10; si se pide
  mayor que 25, devolver como máximo 25 y **no ejecutar una consulta sin límite superior**». Los dos
  tests citados en el mapa de T18 no lo comprueban: `list-orders.test.ts` **no tiene ni un caso** de
  defecto ni de tope —su caso de paginación afirma que el dominio devuelve *tal cual* lo que le da
  el doble— y `tests/unit/pagination.test.ts` prueba `DEFAULT_PAGE_SIZE`/`MAX_PAGE_SIZE` **de la
  librería de QC-20**, no el camino de `pedidos`. Nada comprueba que `listAliveOrders` llame a
  `toOffsetLimit`, que pase el `limit` acotado a `take`, ni que le entregue a `buildPage` ese
  `limit` y no el `pageSize` pedido — que es exactamente el error contra el que avisa el comentario
  del propio adaptador (dejaría un `totalPages` mentiroso). Es un requisito citado, no verificado.
- **R41** — el `ORDER BY` que se ejercita contra Postgres es la constante `LIST_ORDER_BY` **copiada**
  en el test (`order-crud.int.test.ts:319`). Cambiar el orden en el adaptador no pone nada rojo.
- **R40** — los `where` con `deletedAt: null` de las cinco operaciones `…Alive` del adaptador no se
  ejecutan; el caso de integración hace sus propias consultas.
- **R8 / R34** — el `INSERT` con `RETURNING`, el mapeo `toOrderRow`, `fromDecimal` con su
  `.toFixed(4)` y el `take: limit` viven sin ejecución.
- **R13** — la traducción del `23505` del índice del correlativo a `duplicate_number`
  (`isDuplicateOrderNumber`, con su lectura de `meta.code` y del nombre del índice) **no la prueba
  nadie**, ni en unidad ni en integración: `order-service.test.ts` prueba el lado del dominio con un
  doble que ya devuelve el discriminante.

**Y el repo hace lo contrario en las dos fichas precedentes** que este diseño dice copiar:
`tests/integration/proveedores/supplier-crud.int.test.ts` y
`tests/integration/recetas/recipe-crud.int.test.ts` **importan y llaman su adaptador driven real**
(el de `recetas` importa además `toOffsetLimit` y `MAX_PAGE_SIZE` para comprobar el tope contra la
base). El motivo que da la cabecera de los tests de QC-34 —que el adaptador habla con el cliente
Prisma global y no entra en `prisma.$transaction`— es cierto, pero la salida que usan los dos
precedentes es la contraria: llamar al adaptador y **limpiar** al final, no envolver en una
transacción y duplicar el SQL.

**Qué falta para cumplirlo** (no lo arregla el reviewer):

1. Un archivo de integración que **llame a las funciones reales** de `order-prisma.ts` con el
   cliente global y limpieza explícita, al modo de `supplier-crud.int.test.ts`, cubriendo como
   mínimo: alta y relectura (R8); `pageSize` omitido con 10 elementos, y `pageSize` de 100
   devolviendo **25** elementos con `pageSize` 25 en la `Page` (**R35**, el caso que hoy no existe
   en ningún sitio); el orden real del adaptador con filas sembradas en desorden (R41); un borrado
   que desaparece de ficha y listado mientras el cancelado vuelve con su motivo (R40); y
   `updateAlive`/`cancelAlive`/`softDeleteAlive` devolviendo sus dos discriminantes.
2. Cobertura de `isDuplicateOrderNumber` (R13): basta un unitario que le pase un
   `PrismaClientKnownRequestError` con `meta.code` `23505` y el nombre del índice, y otro sin el
   nombre, para demostrar que **relanza** en vez de traducir mal.
3. Si el leader prefiere conservar el patrón de transacción revertida, entonces el test tiene que
   dejar de depender de una copia: leer el `ORDER BY` y el `INSERT` **del fuente del adaptador** y
   afirmar que son los que ejecuta. Es más débil, pero al menos no puede divergir en silencio. La
   opción 1 es la que hace el resto del repo.

### `menor` — M1. R4 se comprueba sobre 7 de los ~15 archivos del módulo

R4 dice «ningún archivo de `lib/modules/pedidos/**`». `authorization.test.ts` barre los seis casos de
uso más `actor.ts`, y `order-actions.test.ts` barre el driving. Quedan fuera `order-input.ts`,
`order-view.ts`, `page.ts`, `errors.ts`, `order-transitions.ts`, `ports/order-repository.ts`,
`index.ts` y `order-prisma.ts`. Hoy el literal no está en ninguno (verificado con `grep`), así que el
requisito se cumple; lo que no cubre el criterio es el futuro. Un barrido sobre `pedidosSources`
—que ya existe en `module-contract.test.ts`— lo cierra en una línea.

### `menor` — M2. El estado en disco de la ficha está desactualizado (regla 3 de `CLAUDE.md`)

`feature_list.json` mantiene **QC-34 en `pending`** con la feature entera implementada, y
`progress/current.md` la describe todavía como «pending → F1.2 … sin spec: pendiente
`/afinar-feature`». `./init.sh` no lo detecta: `pending` no viola el límite de dos `in_progress` por
zona, y hoy hay **cero** `in_progress` en el archivo. Es trabajo del leader, no del implementer,
pero la ficha no puede cerrarse así.

### `menor` — M3. `progress/history.md` sin entrada y worktree montado

Los dos son pasos de cierre (`CHECKPOINTS.md > Verificación final`) y hoy están pendientes, lo cual
es normal en este punto del ciclo. Se anota para que no se pierdan: si el worktree se queda, tiene
que quedar escrito en `progress/current.md > Deudas y cosas abiertas` con su razón.

### `menor` — M4. La desviación del `INSERT` no dejó nota fechada en `design.md > 4.2`

La corrección de la paginación sí se documentó en el propio `design.md` con nota fechada (§ 7.4,
referenciada desde § 6.4), que es lo que permite auditarla. La parametrización del estado de alta,
que es igual de real, solo vive en la bitácora y en un comentario del código: `design.md > 4.2`
sigue mostrando el literal sin ninguna marca. Dos desviaciones del mismo diseño con dos niveles de
rastro distintos. Basta una nota fechada de tres líneas en § 4.2.

### `menor` — M5. R49/R50 en la suite son estáticos; la parte ejecutada es manual

El test de migración vigila el **texto** del `down.sql` (con seis mutaciones, y es un buen test),
pero nada en `pnpm test` ejecuta un `rollback` real. El ciclo y la guardia de datos se ejercitaron a
mano —por el implementer y también por este reviewer, con resultado correcto—, que es lo que pide
`docs/verification.md`. Queda anotado como límite conocido: una regresión en el `down.sql` que el
predicado estático no mire no la vería nadie hasta el próximo rollback manual.

---

## Veredicto

**RECHAZADO.** 1 bloqueante (**B1**: el adaptador driven sin ninguna ejecución en la suite, y **R35
sin un test que lo verifique**) y 5 menores.

Todo lo demás —la autorización en la primera línea con su test real, las cuatro capas contra la
cancelación por edición, la migración del tipo enumerado con su `55P04` rodeado y su `down.sql` que
recrea el tipo y aborta ante datos, el `CHECK` de borrado ampliado en sus seis casos, la secuencia
por año con concurrencia de verdad, las fronteras entre módulos, cero dependencias nuevas y los
siete retensados— está bien y no hay que rehacerlo. Vuelve al implementer solo por **B1** (y, si se
quiere de paso, M1 y M4, que son una línea y un párrafo).

---

# Segunda ronda — 2026-09-04

> Alcance: **solo el commit `d891bdd`** («test(QC-34): el adaptador driven bajo test real, y R35
> verificado»), contra los hallazgos **B1**, **M1** y **M4** de la primera ronda. Lo aprobado
> arriba no se vuelve a revisar. **M2** (estado en disco) lo asume el leader y ya está hecho en
> `dev`; **M3** son pasos de cierre; **M5** queda aceptado como límite conocido.
>
> **Veredicto: OK** — 0 bloqueantes, 2 menores nuevos (ninguno impide cerrar).

**El código de producción no cambia.** El diff son dos tests nuevos, la ampliación de
`authorization.test.ts`, la nota de `design.md` y bitácora. Lo comprobé sobre el diff:
`order-prisma.ts` y el resto de `lib/**` no aparecen. Era lo correcto — B1 era una carencia de
tests, no un bug.

## Lo que se corrió en esta ronda

| Comando | Resultado |
| --- | --- |
| `vitest run tests/integration tests/unit/pedidos tests/unit/recetas tests/unit/recetas-ui tests/guards` | **66 archivos, 788 tests, 0 fallos** (toda la integración incluida) |
| `vitest run tests/integration/pedidos/order-repository.int.test.ts --reporter=verbose` | 7 casos, contra `QuimiCloude_QC34` real |
| Higiene tras **nueve** corridas, varias de ellas rojas a mitad por las mutaciones | `orders 0`, `users 0`, `roles 0`, `recipes 0`, `units 4`, `document_types 1`, cero `orders_sequence_%` |

No se repite `./init.sh`: lo corrió el leader. El rojo de
`tests/unit/inventario/product-page.test.tsx` **no se cuenta** — es de QC-22, ya fallaba en `dev` y
esta rama no toca inventario ni UI.

## B1 — CERRADO

`tests/integration/pedidos/order-repository.int.test.ts` (7 casos) importa y llama las **seis
funciones reales** del adaptador desde `@/lib/modules/pedidos/adapters/driven/persistence/order-prisma`
—`createOrder`, `findAliveOrderById`, `listAliveOrders`, `updateAliveOrder`, `cancelAliveOrder`,
`softDeleteAliveOrder`—, con el cliente global, sin transacción revertida y sin copiar SQL. Es la
opción 1 de la review y el patrón de `recipe-crud`/`supplier-crud`. Verificado además:

- **R35, el caso que no existía en ningún sitio**: siembra `MAX_PAGE_SIZE + 1` pedidos vivos —la
  única forma de distinguir «devuelve el tope» de «devuelve todo lo que hay»—, y comprueba
  `pageSize` omitido → `DEFAULT_PAGE_SIZE` elementos **y** `pageSize` en la `Page`; `pageSize` 100 →
  `MAX_PAGE_SIZE` elementos, `pageSize` acotado en la `Page`, `totalPages` **distinto** de
  `ceil(total/100)`, y `pageSize: 999_999` acotado igual. Los topes se **importan** de
  `lib/shared/pagination` y se cruzan con `toOffsetLimit(1, 100).limit`, así que un cambio del tope
  en un solo sitio no deja el test verde por casualidad.
- **R41** con las ocho filas sembradas **en desorden** y dos `CRITICA` que comparten `created_at`
  **al milisegundo**, para que el desempate por el correlativo sea lo único que los separe.
- **R40** en los dos sentidos (el borrado sale de ficha y listado y la fila **sigue existiendo**, con
  su `deleted_at` y su correlativo; el cancelado vuelve con su motivo).
- **R8** con decimales que **no** son los de la escala (`10.5` → `10.5000`, `0.125` → `0.1250`), el
  `now` inyectado releído idéntico, y `expect(ficha).toEqual(alta)` — que es lo que impide que el
  `RETURNING` y el `select` diverjan.
- **R34/R38** con el `total` **preguntado a la base con el mismo `where`**, nunca escrito a mano, y
  los dos filtros sueltos y combinados (el `and`, no el `or`).
- **R33/R40** en las tres escrituras: `ok` sobre vivo, `not_found` sobre inexistente y sobre ya
  borrado, y la fila borrada **no** se queda con lo que pedía la escritura rechazada.
- **R13**: `tests/unit/pedidos/order-prisma-errors.test.ts` (7 casos) cubre las **dos** ramas de
  `isDuplicateOrderNumber` —el nombre del índice en `meta.message` y en el mensaje crudo, el `23505`
  sin nombre, otro índice, otro SQLSTATE, el `P2002` de la API tipada y lo que no es error de
  Prisma—. La rama negativa es la que importa y está.

**La higiene está bien resuelta**, que era el riesgo real de abandonar la transacción: años de
prueba 288x propios, limpieza por `id` **exacto** en `finally` (nunca un `deleteMany` con filtro
amplio), `beforeAll`/`afterAll` borrando las secuencias, y **ninguna afirmación global** sobre
cuántos pedidos hay. Lo comprobé: tras nueve corridas, varias interrumpidas por mutaciones, la base
quedó en cero.

### Las mutaciones — no me fié: repetí las dos suyas y añadí seis más

Todas sobre el **código real**, revertidas después (`git status lib/` limpio al final de cada una).

| # | Mutación | Resultado |
| --- | --- | --- |
| A | `buildPage(…, query.pageSize ?? limit)` (la suya) | **ROJO** — `expected 100 to be 25` |
| B | `const ROL_MUTADO = 'Administrador'` en `domain/order-input.ts` (la suya) | **ROJO** — `expected … not to contain ''Administrador''` |
| C | quitar `take: limit` del `findMany` | **ROJO** — `to have a length of 10 but got 26` y `length of 2 but got 6` |
| D | `{ priority: 'asc' }` en el `ORDER BY` | **ROJO** — el orden esperado no coincide |
| E | quitar `deletedAt: null` del `where` de `findAliveById` | **ROJO** — `expected { … } to be null` |
| F | `isDuplicateOrderNumber` traduciendo cualquier `23505` | **ROJO** — 5 casos |
| G | `fromDecimal` con `toFixed(2)` | **ROJO** — `expected '10.50' to be '10.5000'` |
| H | quitar `deletedAt: null` del `where` de `updateAlive` | **ROJO** — `expected 'ok' to be 'not_found'` |
| I | ignorar el filtro de prioridad en el `where` | **ROJO** — `expected 6 to be 4` |

Nueve de nueve muertas. Los tests nuevos vigilan de verdad.

## M1 — CERRADO (con la salvedad M7)

El barrido de R4 pasa de una lista de siete escrita a mano a **todo el árbol del módulo**
(`sourcesIn(pedidosDir)`), con **suelo de 19 archivos** y, además, una lista de rutas que **tienen
que aparecer** en el barrido —incluidos el adaptador driven, el driving, el puerto y el barrel, que
eran justo los que faltaban—. Las dos defensas juntas impiden que la lista se vacíe en silencio por
un `pedidosDir` mal calculado. La mutación B lo confirma: el literal en `order-input.ts` —archivo
que antes no se miraba— pone el caso rojo.

## M4 — CERRADO

`design.md > 4.2` gana su nota fechada del 2026-09-04, con la misma forma que la de § 7.4: dice qué
muestra el diseño, qué escribe el adaptador, por qué parametrizar no abre ningún camino hacia
`CANCELADO` y qué pasaría con el literal. Correcto además que **no** invente una aprobación del
leader que no consta en disco y cite en su lugar la calificación del reviewer (regla 6 de
`CLAUDE.md`).

## Hallazgos que deja esta ronda

### `menor` — M6. La tabla `R<n> → test` de T18 sigue citando los tests viejos

La prosa de la segunda tanda explica bien lo que se añadió, pero **las filas de la tabla no se
tocaron**: R35 sigue diciendo «`list-orders.test.ts` + `tests/unit/pagination.test.ts` (QC-20)», que
es exactamente la cita que esta review rechazó por no verificar el requisito; R8, R13, R34, R38, R40
y R41 tampoco mencionan los dos archivos nuevos. La tabla es lo que `CHECKPOINTS.md > Trazabilidad`
manda mantener y lo que leerá QC-35 o el próximo reviewer, y hoy apunta al sitio equivocado. **No
bloquea** —el test existe, lo corrí y lo maté por mutación—, pero hay que actualizar esas siete
filas para que el mapa diga la verdad.

### `menor` — M7. El criterio de R4 solo caza el literal entre comillas simples

`expect(codigo).not.toContain("'Administrador'")` no ve `"Administrador"`. Lo comprobé: añadiendo
`const ROL_MUTADO = "Administrador";` a `domain/order-input.ts`, `authorization.test.ts` sale
**verde** (15/15) y `pnpm run lint` da **0 errors** —no hay regla de comillas que lo impida—, así que
la puerta está abierta de verdad y no solo en teoría. El ensanchamiento a todo el árbol que pedía M1
está bien hecho; lo que se queda corto es el predicado. Se cierra comparando contra el valor y no
contra el literal escrito, o admitiendo las dos comillas.

## Veredicto de la segunda ronda

**OK.** El bloqueante **B1** está cerrado por donde había que cerrarlo —el adaptador driven se
ejecuta de verdad, R35 tiene por fin su test y las nueve mutaciones lo matan—, y **M1** y **M4**
también. Quedan **dos menores nuevos** (M6, la tabla de trazabilidad desactualizada; M7, el
predicado de R4 ciego a las comillas dobles) que **no impiden cerrar la feature**: son una edición
de tabla y una línea de test. **QC-34 queda aprobada.**
