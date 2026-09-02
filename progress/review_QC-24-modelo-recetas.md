# QC-24 — modelo-recetas · review

> Reviewer. Rama `feature/QC-24-modelo-recetas`, worktree `.worktrees/QC-24-modelo-recetas/`,
> ya sincronizada con `origin/dev` (incluye QC-8). Revisado contra
> `specs/QC-24-modelo-recetas/{requirements,design,tasks}.md`,
> `progress/impl_QC-24-modelo-recetas.md`, `CHECKPOINTS.md`, `docs/architecture.md` y
> `docs/conventions.md`.
>
> **No corrí `./init.sh`** (lo corre el leader en paralelo). Corrí a mano `pnpm run typecheck`,
> `pnpm run lint` y **la suite completa** `pnpm exec vitest run`.

## Veredicto

**RECHAZADO** — un hallazgo bloqueante: **la suite completa está en rojo**. Todo lo demás
—las cinco trampas del modelo, la trazabilidad R1–R33 y las dos decisiones declaradas por el
implementer— está correcto.

---

## Lo que corrí, y qué salió

```
pnpm run typecheck   -> exit 0
pnpm run lint        -> exit 0

pnpm exec vitest run (SUITE COMPLETA)
  Test Files  1 failed | 46 passed (47)
       Tests  2 failed | 507 passed (509)

pnpm exec vitest run tests/unit/recetas/ tests/integration/recetas/
  Test Files  5 passed (5)      Tests  73 passed (73)   (48 unit + 25 integracion)
```

Los 25 casos de integración corren de verdad contra Postgres: el `beforeAll` consulta
`pg_tables` y lanza si faltan `recipes` o `recipe_lines`, así que no hay forma de que pasen
en verde sin base migrada. Verificado.

---

## Hallazgos

### BLOQUEANTE 1 — La suite completa está roja: QC-24 rompe dos tests de QC-14

`tests/unit/inventario/schema/inventario-schema.test.ts` falla en dos casos. `./init.sh` va a
terminar en rojo (regla 5 de `CLAUDE.md`; `CHECKPOINTS.md > Calidad de codigo`: «`pnpm test`
pasa»).

1. `el esquema declara exactamente dos modelos nuevos: Presentation y Product` (línea 156)

```
AssertionError: expected [ Array(7) ] to deeply equal [ Array(5) ]
+   "Recipe",
+   "RecipeLine",
```

El test enumera **todos** los modelos del esquema, así que cualquier feature que añada uno lo
rompe. Lo rompe QC-24.

2. `la feature no anade adaptadores driving, rutas ni contrato de dominio en el modulo inventario`
   (línea 464)

```
AssertionError: expected [ 'product-catalog.ts' ] to deeply equal []
```

El test exige que `lib/modules/inventario/domain/` esté **vacía** y que el barrel siga siendo
literalmente `export {};` (línea 468). QC-24 hace justo lo contrario **por diseño** (T5,
`design.md > 5.2`): publica `ProductCatalog` desde ese dominio.

**Por qué vuelve al implementer.** `design.md > 1` lista los archivos que la feature toca y **no
incluye** este test; T5 avisaba del conflicto con QC-20 sobre `lib/modules/inventario/index.ts`,
pero no de este. El implementer solo corrió sus propios archivos (lo dice en la bitácora), y este
es exactamente el agujero que la regla del gate existe para tapar.

**Qué falta para cumplirlo** (no vale borrar los dos casos):

- El caso 1 sirve a **QC-14 R3** («ninguna entidad separada de *elemento de inventario*»). Esa
  intención la conservan las aserciones que el propio test ya tiene (`InventoryItem`,
  `Inventory`, `StockItem`, `Item` ausentes; ningún `@@map("inventory"|...)`; `inventarioModels`
  de longitud 2). Lo que hay que reemplazar es la enumeración cerrada del esquema entero, que no
  es lo que R3 pide y convierte cada feature futura en un rojo.
- El caso 2 sirve a **QC-14 R23** («ninguna operación, ni adaptador driving, ni ruta, ni Server
  Action»). Un contrato de **solo tipos** en `domain/` no es ninguna de esas cosas. Hay que
  acotar la aserción a lo que R23 dice —`adapters/driving` vacío, ninguna ruta— y dejar de exigir
  `domain/` vacía y `export {};` en el barrel: eso era un retrato del repo de aquel día, no un
  requisito.
- El cambio toca archivos fuera de la lista de `tasks.md`, así que hay que anotarlo (lo pide la
  cabecera de `tasks.md`) y dejarlo en la bitácora con su porqué.

### menor 1 — T13 sin marcar en `tasks.md`

`CHECKPOINTS.md > Especificacion` pide todas las tasks `[x]`. T13 (merge con `dev` + `./init.sh`
completo) sigue `[ ]`. Es correcto que el implementer no la corriera —regla del gate—, pero la
feature no puede pasar a `done` con ella abierta, y hoy además **no pasaría**: ver bloqueante 1.

### menor 2 — el hallazgo del SQLSTATE no queda donde QC-25 lo lea

Que por el camino tipado Prisma entregue `P2002` / `P2003` y **no** el SQLSTATE solo vive en la
bitácora y en la cabecera del test de integración. Quien escriba el repositorio de QC-25 va a
mapear errores por el camino tipado. Convendría dejarlo anotado donde lo vaya a leer (una línea
en el `design.md` de QC-25 o en `docs/conventions.md`). No bloquea nada de QC-24.

---

## Los cinco puntos frágiles, verificados a mano

1. **FK que cruzan de módulo sin `@relation`.** Verificado leyendo `db/schema.prisma`, no la
   bitácora. `RecipeLine.productId`, `Recipe.createdBy` y `Recipe.updatedBy` son `String` /
   `String?` con `@db.Uuid` y `@map(...)`, **sin `@relation`**. El único `@relation` de los dos
   modelos es `recipe` (intra-módulo, `onDelete: Cascade`). Ni `User` ni `Product` ganan
   colección del otro lado. Las tres FK están escritas a mano en `migration.sql`. Vigilado
   además por `recetas-schema.test.ts` («el unico `@relation` ... es `['recipe']`»). **CORRECTO.**
2. **FK de auditoría en `RESTRICT`, nunca `SET NULL`.** Verificado en el SQL:
   `recipes_created_by_fkey` y `recipes_updated_by_fkey` van `ON DELETE RESTRICT ON UPDATE
   CASCADE`, y `SET NULL` no aparece en ninguna parte del archivo. El test estático lo vigila en
   las dos formas (no-`SET NULL` **y** `isRestrictOnDelete`), y T11 lo confirmó en
   `pg_constraint` con `confdeltype = r`. **CORRECTO** (decisión 22).
3. **`lib/composition/index.ts` intacto.** `git diff origin/dev...HEAD -- lib/composition/` sale
   **vacío**: comprobado, no creído. Además `module-contract.test.ts` afirma que ningún fuente de
   `lib/composition/**` menciona `recetas`. **CORRECTO.**
4. **Contrato de `inventario`.** `lib/modules/inventario/index.ts` deja de ser `export {}` y hace
   `export type { ProductCatalog, ProductId, ProductRef } from './domain/product-catalog'` —los
   tres **como tipos**, sin runtime, sin Prisma—. `recetas` no importa nada de `inventario`
   todavía y no menciona `prisma.product` ni `@prisma/client` en ningún archivo. El `include`
   hacia `Product` es imposible por el punto 1. **CORRECTO.**
5. **Borrado lógico y constraints.** `recipes` tiene `deleted_at`; `recipe_lines` **no** (ni
   columna ni mención). El índice del nombre es
   `CREATE UNIQUE INDEX "recipes_name_unique" ON "recipes"("name_normalized") WHERE "deleted_at" IS NULL`
   —parcial, decisión 20—. Está el `CHECK ("quantity" > 0)` (`> 0`, no `>= 0`). Y los **cuatro**
   `ALTER` de RLS: `ENABLE` + `FORCE` en las dos tablas. Confirmado en el texto del SQL y, en
   T11, en `pg_indexes` / `pg_class`. **CORRECTO.**

---

## Las dos decisiones que el implementer declaró

### 1. Todas las operaciones que deben fallar por `$executeRaw` — **ACEPTABLE CON NOTA**

No esconde nada, por tres razones concretas:

- **Lo que los requisitos exigen es la base, no el ORM.** R7, R11, R14, R16, R21 y R27 dicen
  literalmente «rechazar la operación **en la propia base de datos**». Un `INSERT` crudo es el
  instrumento *más* fiel a ese enunciado, no menos: comprueba la restricción sin que el cliente
  se interponga. Afirmar sobre `P2002` habría sido afirmar sobre Prisma.
- **Los caminos felices y todas las lecturas siguen tipados.** Revisado caso por caso: los 25
  tests crean, releen y actualizan con `tx.recipe.*` / `tx.recipeLine.*`; lo único que va en raw
  es la operación que debe explotar. El mapeo `@map` queda por tanto ejercitado por el camino
  real, y encima hay aserciones contra `information_schema` (tipo y precisión reales de la
  columna). El agujero teórico —«el raw escribe columnas que el cliente tipado no usaría»— está
  cerrado por partida doble.
- **`rawInsert` no hace trampa.** Escribe siempre `updated_at = CURRENT_TIMESTAMP`, que es lo que
  el cliente rellena vía `@updatedAt`, y castea los uuid: emula el alta real, no una versión
  degradada.

La nota es el **menor 2**: el hallazgo hay que dejarlo donde QC-25 lo lea.

### 2. El test de contrato descomenta antes de barrer — **ACEPTABLE**

No debilita la guardia. `read()` quita `/* */` y `//`, y todo lo que el test busca después **no
puede vivir en un comentario y seguir siendo efectivo**: una directiva `'use server'` es una
expresión de string en el cuerpo del módulo, un `import '@prisma/client'` es código, un
especificador de import es código. Comentar cualquiera de ellos los desactiva, así que ignorarlos
es exacto, no permisivo. Es además el mismo criterio de `stripComments` / `stripSqlComments` que
ya usan `inventario-schema.test.ts` e `inventario-migration.test.ts`. La alternativa —barrer
texto crudo— obligaba a borrar la advertencia en prosa de la cabecera, que es justo la que impide
que el próximo «arregle» el barrel.

---

## Checklist de `CHECKPOINTS.md`

**Especificación**
- [x] `requirements.md` con EARS numerados R1–R33.
- [x] `design.md` con alternativas descartadas y su porqué (§ 8.1–8.7, siete).
- [ ] `tasks.md` con **todas** las tasks `[x]` — **T13 sigue abierta** (menor 1).

**Trazabilidad**
- [x] Cada R1–R33 mapea a un test que **existe y pasa**. Verificado uno a uno contra los títulos
      reales de los 73 casos: ninguna fila del mapa apunta a un test inexistente y ninguno está
      vacío. R8, R17, R18, R20, R28, R29, R31 y R32 se cierran con estáticos/guardias, y R29 sin
      test con Prisma **con motivo escrito** (saldría verde pase lo que pase:
      `docs/architecture.md > Acceso a datos y autorizacion`). R30 se cierra con el ciclo real
      apply → rollback → apply de T11, con la salida pegada. R12 y R26 solo contra base real.
      Todo justificado, nada colado.
- [x] `progress/impl_QC-24-modelo-recetas.md` contiene el mapa `R<n> -> test`.

**Calidad de código**
- [x] `pnpm run typecheck` pasa (exit 0, verificado por mí).
- [x] `pnpm run lint` pasa (exit 0, verificado por mí).
- [ ] `pnpm test` pasa — **NO**: 2 de 509 en rojo (bloqueante 1).
- [x] E2E: no aplica, diferido **con motivo** (decisión 17, R31). La feature no toca
      autenticación, permisos, movimientos de inventario, importes ni webhooks: persiste una
      fórmula, no mueve existencias. No hay flujo navegable que visitar.
- [x] UI: **no aplica**. El diff no toca `app/`, `components/` ni ningún `.tsx`, así que la regla
      multiplataforma (`100vh`, `:hover`, targets de 44 px, `font-size` en inputs, librería de UI
      sin soporte iOS) no tiene nada que evaluar.
- [x] Dependencias: `package.json` **no aparece en el diff** (`git diff origin/dev...HEAD --
      package.json` vacío). R32 se cumple por construcción y `guard-dependencias-aprobadas` sigue
      verde. `design.md > 7` documenta tres candidatas descartadas (`unaccent`, `slugify`,
      `decimal.js`) con su porqué: no hay utilidad a mano que reinvente una librería del stack —
      `normalizeRecipeName` son cuatro líneas sobre `String.prototype.normalize`, que es del
      estándar del lenguaje.

**Datos y seguridad (Supabase)**
- [x] Permisos en el service: **no aplica**, no hay service (R31, decisión 18). Los fija QC-25.
- [x] RLS **activada y forzada** en las dos tablas nuevas.
- [x] Todo el acceso a datos por Prisma; ninguna lectura/escritura con el cliente de Supabase.
- [x] Migración versionada y reversible: `down.sql` presente, y el ciclo
      `db:migrate` → `db:rollback` → `db:migrate` corrido de verdad con `_prisma_migrations`
      coherente (T11).
- [x] Ningún secreto hardcodeado: el `.env` no está versionado ni aparece en el diff, y no hay
      cadena de conexión en ningún archivo de la feature.
- [x] Webhooks: no aplica.

**Módulos hexagonales**
- [x] `domain/` no importa framework, base, `shared` ni adaptadores: `recipe-name.ts` no tiene
      **ningún** import, y el cierre transitivo del barrel lo vigila.
- [x] De otro módulo solo su contrato: `recetas` no importa nada de `inventario` todavía, y el
      test prohíbe explícitamente `@/lib/modules/inventario/...` y `@/lib/modules/identity/...`.
- [x] Ningún driving instancia su driven: no hay adaptadores.
- [x] `lib/shared/**` intacto.
- [x] Ningún `'use server'` reexportado desde el barrel.
- [x] `/// @module recetas` en los dos modelos, y ningún módulo consulta un modelo ajeno —
      reforzado por el punto 1: **sin `@relation` no hay `include` posible**, que es el cruce que
      la guardia no ve.
- [x] No reaparecen `lib/services/`, `lib/repositories/` ni `lib/interfaces/`.
- [x] En la raíz de `lib/` siguen estando solo `modules/`, `shared/`, `composition/` y `utils.ts`.
- [x] Lógica de negocio en `domain/`: la única que existe (`normalizeRecipeName`) está ahí.

**Permisos / Configuración**
- [x] No aplica: sin páginas, sin componentes, sin mutaciones. Nada que cambie entre entornos
      quedó hardcodeado.

**Verificación final**
- [ ] `./init.sh` en verde — **no puede estarlo hoy** (bloqueante 1). Lo corre el leader.
- [x] `progress/review_QC-24-modelo-recetas.md` existe (este archivo).
- [ ] Entrada en `progress/history.md` — del leader, al cerrar.
- [ ] Desmontar el worktree — del leader, al cerrar.

---

## Lo que vuelve al implementer

Solo el **bloqueante 1**: dejar la suite completa en verde arreglando los dos casos de
`tests/unit/inventario/schema/inventario-schema.test.ts` **sin perder lo que QC-14 R3 y R23
vigilan** (arriba está qué conservar y qué acotar), anotar los archivos tocados fuera de la lista
de `tasks.md` y dejarlo en la bitácora. El **menor 1** (T13) lo cierra el leader con el gate. El
**menor 2** es una nota para QC-25 y no bloquea el merge.
