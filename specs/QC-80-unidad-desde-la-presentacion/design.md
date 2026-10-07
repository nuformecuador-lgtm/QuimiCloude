# QC-80 — unidad-desde-la-presentacion · design.md

> Cómo se hace lo que `requirements.md` pide. La tabla de «Decisiones cerradas» de ese archivo
> manda sobre este; aquí solo se decide el **cómo**.

## 1. Lo que ya existe y no se toca

| Pieza | Estado verificado el 2026-09-11 |
|---|---|
| `units` | Catálogo con `company_id`, `unit_id` (deriva de), `factor`, cuatro CHECK/FK y un disparador, todo escrito **a mano** en `20260907190000_units_equivalence_and_scope`. RLS `ENABLE` + `FORCE` **sin policies** desde QC-32 |
| `presentations` | `id`, `name`, `name_normalized` (único), `created_at`, `updated_at`. **Sin `deleted_at`** (D6 de QC-20), borrado físico. RLS `ENABLE` + `FORCE` sin policies desde QC-14 |
| `product_batches` | La presentación vive aquí desde QC-90 (`presentation_id` NOT NULL, FK RESTRICT). **0 filas** |
| Formulario de presentación | `presentation-form.tsx`: `<form action>` + `useActionState`, validación previa con **el mismo esquema** del servidor, error por `code` estable y no por texto |
| `unit-group.ts` | `unitsOfGroup` / `smallestUnit` / `resolveLineUnitId`, puro y probado sin DOM. **No se toca su lógica**: con `unitId === null` ya devuelve el catálogo entero, que es exactamente lo que la decisión del 2026-09-11 pide para un producto sin lotes (R23) |
| `UnitSelect` de proveedores | `app/(private)/proveedores/[id]/components/unit-select.tsx`. **No se toca** (ver alternativa C) |

## 2. La migración: `db/migrations/20260911120000_presentation_unit/`

**Escrita a mano, no generada por `prisma migrate dev`** — mismo motivo que QC-76: `units` y
`presentations` llevan encima objetos que Prisma no modela (índices parciales, disparador, RLS), y
`migrate dev` los lee como drift y propone resetear una base con datos reales. Se aplica con
`pnpm run db:migrate` (`prisma migrate deploy`), que no mira drift.

Orden de `migration.sql`, todo dentro de la única transacción que Prisma abre por archivo:

1. `ALTER TABLE "presentations" ADD COLUMN "unit_id" UUID;` — **anulable de momento**: no hay
   valor por defecto que poner y `NOT NULL` sobre 114 filas sin rellenar fallaría (R1).
2. **Paréntesis de RLS (R6).** `ALTER TABLE "presentations" NO FORCE ROW LEVEL SECURITY;` y
   `ALTER TABLE "units" NO FORCE ROW LEVEL SECURITY;`. Las **dos**, y aquí está la mina: `FORCE`
   aplica las policies también al dueño de la tabla —que es con quien se conecta Prisma— y, **sin
   ninguna policy, eso deniega todo, incluido el `SELECT`**. Sin soltar `units` el `SELECT` que
   busca `kilogramo` devolvería cero filas y el relleno fallaría por el sitio equivocado. QC-76
   soltó `units` porque escribía en ella; aquí se suelta además porque se **lee**.
3. **Relleno guardado**, en un bloque `DO $$`:
   - `UPDATE "presentations" SET "unit_id" = (SELECT "id" FROM "units" WHERE "name_normalized" = 'kilogramo' AND "company_id" IS NULL);`
   - `GET DIAGNOSTICS` + `RAISE EXCEPTION` si la unidad no se encontró (`unit_id` quedó nulo) o si
     `SELECT count(*) FROM "presentations" WHERE "unit_id" IS NULL` no es cero (R4). El mensaje
     nombra QC-80 y el motivo, igual que los de QC-76.
   - La fila se busca **por `name_normalized`, nunca por id**: los uuid los generó
     `gen_random_uuid()` y son distintos en cada base.
   - **Ni un `INSERT` ni un `DELETE`** (R5). El borrado del residuo es QC-77.
4. Se cierra el paréntesis: `ENABLE` + `FORCE` en las dos tablas, sin policies (R6).
5. `ALTER TABLE "presentations" ALTER COLUMN "unit_id" SET NOT NULL;` (R1).
6. `ALTER TABLE "presentations" ADD CONSTRAINT "presentations_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;` (R2) y
   `CREATE INDEX "presentations_unit_id_idx" ON "presentations"("unit_id");` (R3) — Postgres no
   indexa el lado hijo de una FK y por ahí pasa la verificación del `RESTRICT`.
7. Mudanza inversa en `products` (R7): `DROP INDEX IF EXISTS "products_unit_id_idx";`,
   `ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_unit_id_fkey";`,
   `ALTER TABLE "products" DROP COLUMN IF EXISTS "unit_id";`. Aviso de pérdida de datos
   **aceptado y comprobado**: la columna está vacía en las 7 filas vivas.

`down.sql` (R8), en orden inverso: `products` recupera `unit_id` **anulable** con su FK
(`ON DELETE RESTRICT ON UPDATE CASCADE`) y su índice —vacía, porque no había nada que restaurar—, y
`presentations` pierde índice, FK y columna. El relleno **no se restaura** y no puede: la columna
desaparece. Es reconstruible al céntimo (todas eran `kilogramo`), así que el down es honesto y
barato.

**Una sola migración y no dos.** Las dos mitades —dar unidad a la presentación y quitársela al
producto— son el mismo movimiento: el día que exista una base a medio migrar, el producto no
declara unidad y la presentación tampoco. Van en la misma transacción.

## 3. `db/schema.prisma`

```prisma
model Presentation {
  …
  unitId String @map("unit_id") @db.Uuid   // NOT NULL, sin @default
  @@index([unitId], map: "presentations_unit_id_idx")
}

model Product {
  …                                        // sin `unitId` y sin @@index([unitId])
}
```

`unitId` es **escalar SIN `@relation`**, a propósito y por precedente directo: `Unit` es del módulo
`unidades` y `Presentation` de `inventario`, así que con `@relation` el cliente Prisma dejaría a
`inventario` atravesar a `units` con un `include` —un cruce de módulos que ninguna guardia detecta,
porque no es un import—. Es exactamente lo que `products.unit_id` hacía (QC-32 R18) y lo que hace
`units.company_id` (QC-76). **Consecuencia que hay que escribir donde se lea**: la FK vive en el
`migration.sql` y es **drift** para Prisma; toda migración futura de `presentations` hay que
revisarla a mano. El comentario `///` del modelo lo dice.

## 4. Camino de escritura de la presentación

```
presentation-form.tsx ('use client')
  └─ create/updatePresentationAction (adapters/driving/presentation-actions.ts, 'use server')
       └─ inventario.create/updatePresentation  (lib/composition)
            └─ createCreatePresentation / createUpdatePresentation (domain/)
                 1. requirePermission(actor, 'inventario.modificar')   ← R14, PRIMERA línea
                 2. create/updatePresentationSchema.safeParse(input)   ← R10
                 3. normalizePresentationName(name)
                 4. presentations.create/replace({ name, nameNormalized, unitId })  ← R11, R12
```

Ninguna ruta de API propia (`docs/architecture.md > Server Actions vs Route Handlers`): la mutación
sale de un componente propio, luego Server Action, que sigue sin decidir nada —lee el `FormData` y
traduce el error de dominio a estado serializable—.

### 4.1 Esquema de entrada

`lib/modules/inventario/domain/presentation-input.ts`:

```ts
export const createPresentationSchema = z.object({
  name: presentationNameSchema,          // sin cambios
  unitId: z.string().uuid(),             // R10: obligatorio, sin default y sin `nullish`
});
export const updatePresentationSchema = createPresentationSchema;  // reemplazo completo (R12)
```

El barrel del módulo ya lo reexporta y es client-safe, así que el formulario valida con **el mismo
objeto** (R17) y el error cae con `issue.path[0] === 'unitId'`, que es lo que el formulario ya sabe
mapear a un campo.

### 4.2 Puerto y adaptador driven

`PresentationRepository` pasa de cuatro argumentos posicionales a un dato con nombre, y `rename`
pasa a llamarse `replace`:

```ts
export type PresentationData = {
  readonly name: string;
  readonly nameNormalized: string;
  readonly unitId: string;
};

create(data: PresentationData): Promise<{ id: string } | 'duplicate' | 'invalid_unit'>;
replace(id: string, data: PresentationData): Promise<'ok' | 'not_found' | 'duplicate' | 'invalid_unit'>;
deleteById(id: string): Promise<'deleted' | 'not_found' | 'in_use'>;   // sin cambios
list(query: ListQuery): Promise<Page<PresentationView>>;               // sin cambios
```

**Por qué `replace` y no `rename`.** Un método llamado `rename` que además escribe la unidad es un
nombre que miente, y el único sitio donde se nota que miente es dentro del adaptador. La edición ya
era reemplazo completo desde QC-20; el nombre se pone al día con lo que hace.

**`'invalid_unit'` es un resultado nuevo del puerto** (R13) y no una excepción que se escape. En
`presentation-prisma.ts`, `P2003` (violación de FK) puede llegar ahora desde **dos** sitios
distintos: al borrar, sigue significando `'in_use'` —lo dispara `product_batches_presentation_id_fkey`,
no la vieja `products_presentation_id_fkey` que el comentario del archivo todavía nombra y que hay
que corregir—; al crear o reemplazar, solo puede venir de `presentations_unit_id_fkey`, o sea «esa
unidad no existe». Se traducen por separado, cada uno en su función, nunca con un `catch` común.
El caso de uso convierte `'invalid_unit'` en `ValidationError` (`invalid_input`), que es como el
resto del módulo trata una FK rota (mismo criterio que QC-90 § 6).

**Por qué la existencia de la unidad no se comprueba con un `SELECT` previo.** Entre el `SELECT` y
el `INSERT` cabe otra transacción, así que no cerraría nada; es la misma razón por la que este
puerto no tiene ningún `findBy` para la unicidad del nombre (QC-20 `design.md > 11.4`). La FK es la
garantía; el adaptador traduce su fallo.

`PresentationView` gana `unitId: string`, y `presentationSelect` gana la columna. `PRESENTATION_QUERYABLE`
**no** gana `unitId`: no se ordena ni se filtra por un uuid que nadie pinta (R27 no pide más).

## 5. Pantalla de presentaciones

```
page.tsx  →  PresentationListSection (Server Component, async)
                 const [presentations, units] = await Promise.all([
                   listPresentationsAction(params), listUnitsAction(),
                 ]);
                 → PresentationTable / PresentationListEmpty → PresentationSheet → PresentationForm
```

- Las unidades se piden **una sola vez por pantalla** y bajan por props hasta el formulario, que no
  consulta nada: es el patrón exacto de la pantalla de detalle de proveedor (QC-44 R46).
- **R19**: si `listUnitsAction()` responde error, la sección pinta `PresentationListError` y **no
  monta ningún `PresentationSheet`** —ni el de la cabecera, ni el de «crear la primera», ni el de la
  fila—. Un formulario con el selector vacío sería peor que el error: dejaría al usuario delante de
  un campo obligatorio imposible de rellenar.
- `PresentationSheetTarget` pasa a ser `Pick<PresentationView, 'id' | 'name' | 'unitId'>`, así que
  la edición precarga la unidad **derivada del contrato** y no de un campo escrito a mano (R15).
- La **lista no gana columna de unidad**. No lo pide ninguna decisión y pintarla abre una pregunta
  que nadie hizo (¿el nombre?, ¿el símbolo?, ¿resuelto contra qué catálogo?). Coste aceptado: para
  ver la unidad de una presentación hay que abrir su panel.

### 5.1 El selector: componente nuevo y local

`app/(private)/configuracion/presentaciones/components/presentation-unit-select.tsx`, cliente, **no
controlado** (el panel entero es un `<form action>`, así que el valor viaja en el `FormData` con el
nombre `unitId`), sobre el primitivo `Select` de `components/ui/`. Etiqueta de cada opción:
`unit.symbol ?? unit.name`, el mismo criterio que QC-26 y QC-44.

- **Sin opción «sin unidad»** (R17): la columna es `NOT NULL` y ofrecerla sería ofrecer un estado
  que la base rechaza. Sin nada elegido, el disparador muestra un texto de marcador y el esquema
  rechaza el envío.
- **Multiplataforma (R20)**: `min-h-11 min-w-11` en el disparador y `text-base md:text-base` en el
  texto del campo, las dos constantes que el formulario ya define. No se declara ninguna excepción
  a `docs/architecture.md > Componentes > Regla: multiplataforma`; **se cumple la regla**, con caso
  de test del tamaño, que es la lección que QC-90 se llevó por dejar un disparador en `size-6`.

## 6. El producto deja de declarar unidad (R21)

Desaparece `unitId` de: `domain/product-input.ts` (y su `unitIdSchema`), `domain/product-view.ts`
(`NewProduct`), `domain/product-catalog.ts` (`ProductRef`), `domain/product-queryable.ts` (era
filtrable como `select`), `adapters/driven/persistence/product-prisma.ts` (`PRODUCT_SELECT`,
`createProduct`, `updateAliveProduct`, el `where` del filtro), `product-catalog-prisma.ts`,
`adapters/driving/product-actions.ts` (`buildProductCandidate`) y la lista de columnas ocultas de
`app/(private)/inventario/components/product-columns.tsx`.

`ProductRef.unitId` se retira sin sustituto: **nadie lo consume**. `recetas` pide `findRefs` para
saber si el producto está vivo y para su nombre y existencia; la unidad de la línea es
`recipe_lines.unit_id`, que es suya y no se toca.

**`PRODUCT_QUERYABLE` pierde una entrada**, que es un cambio de contrato de listado: hay que pasar
por `tests/guards/guard-contrato-listados.test.ts` y por el test de `product-queryable`. Filtrar
productos por unidad dejaría de tener columna que mirar; hacerlo contra la unidad **derivada**
obligaría a un `where` anidado sobre el lote más reciente, que es una consulta distinta y nadie
pidió.

## 7. La unidad derivada del lote más reciente (R22, R23)

`ProductView.unitId` **se elimina** y nace `ProductView.latestBatchUnitId: UnitId | null`.

**Se renombra a propósito, en vez de dejar el mismo nombre cambiando de significado en silencio.**
El typecheck obliga entonces a visitar cada consumidor —el listado, la ficha, el autocomplete— en
vez de dejar que un campo siga llamándose igual y quiera decir otra cosa; y el nombre dice de dónde
sale el dato, que es justo lo que esta ficha cambia.

En `product-prisma.ts`, un solo fragmento de `select` para las tres lecturas:

```ts
const LATEST_BATCH_UNIT = {
  select: { presentation: { select: { unitId: true } } },
  orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],   // R22: «más reciente», determinista
  take: 1,
} as const;

const PRODUCT_SELECT = { …, batches: LATEST_BATCH_UNIT } satisfies Prisma.ProductSelect;

// toProductView:
latestBatchUnitId: row.batches[0]?.presentation.unitId ?? null,   // R23: sin lotes → null
```

- «Más reciente» es **`created_at DESC`, desempatando por `id DESC`**. No hay fecha de compra
  todavía —es QC-81—, y sin desempate dos lotes creados en el mismo instante darían resultados
  distintos entre consultas.
- La travesía `ProductBatch → Presentation` es **interna a `inventario`**: los dos modelos son
  suyos. De `Presentation` solo se lee el escalar `unitId`; no se entra en `units`.
- **No se añade ningún índice.** `product_batches_product_id_idx` ya localiza los lotes de un
  producto y el conjunto por producto es pequeño. Si algún día deja de serlo, el índice compuesto
  `(product_id, created_at DESC)` es la respuesta, y es una migración de una línea.
- **Coste aceptado, y es el que QC-90 había esquivado**: `listAlive` es la consulta más caliente de
  la pantalla y sirve además al autocomplete con `pageSize` máximo; con esto emite una consulta
  correlacionada más por página (no por fila). Se acepta porque el contrato **no se ensancha** —el
  campo ya existía, cambia su origen— y porque la alternativa (A) pone una llamada de red en mitad
  de una interacción.

En la línea de receta no cambia **ninguna regla**: `product-picker.tsx` mapea
`item.latestBatchUnitId` a su `option.unitId`, y `recipe-lines-field.tsx` sigue llamando a
`resolveLineUnitId` y `unitsOfGroup` igual que hoy. Lo que cambia es la **fuente** del dato y el
comentario que la explica. Con `null` —producto sin lotes— `unitsOfGroup` ya devuelve el catálogo
entero (R23) y el selector se habilita en cuanto hay ingrediente elegido, así que la línea nunca
queda bloqueada.

## 8. Autorización, aislamiento y RLS

- `requirePermission(actor, 'inventario.modificar')` sigue siendo la primera línea de los dos casos
  de uso (R14), antes de zod y antes del puerto. Su test llama al caso de uso con un actor sin
  permiso y comprueba que lanza **sin que el repositorio reciba una sola llamada**.
- **Aislamiento por empresa: no entra, y está registrado.** `presentations` no tiene `company_id`;
  dárselo —y filtrar con él este selector— es **QC-49**. Esta ficha no crea ninguna tabla nueva, así
  que no dispara la exigencia de `docs/checkpoints-proyecto.md > Datos y seguridad` («toda tabla de operación
  nueva lleva su columna de empresa»), y no puede filtrar por una columna que no existe (R27).
- RLS: `presentations` y `units` terminan la migración `ENABLE` + `FORCE` y **sin policies**, como
  empezaron. Es defensa en profundidad, no la frontera: la frontera es el `requirePermission` del
  service.

## 9. Dependencias

**Ninguna dependencia nueva.** No se instala nada, no se corre ningún CLI y `package.json` no
cambia: todo lo que esta ficha necesita —`zod`, el primitivo `Select` de shadcn ya presente, Prisma—
está en el repo y aprobado. Por tanto no hay cuatro checks que rendir ni fila que añadir a
`docs/dependencias.md` (`docs/architecture.md > Dependencias de terceros`).

## 10. Deuda heredada que esta rama tiene que saldar antes de nada

`tests/unit/inventario/schema/inventario-schema.test.ts` contiene el bloque
`describe('QC-90 R29 — esta ficha no anade ninguna migracion ni ninguna columna')`, con dos casos
que comparan `db/migrations/` contra el merge-base con `origin/dev` y **fallan si la rama agrega
una carpeta de migración**. QC-80 agrega exactamente una, así que ese bloque se pondría **rojo el
primer día** por hacer lo que esta ficha tiene que hacer.

Era una guardia de alcance **de QC-90**, que ya está mergeada: su trabajo terminó. Se retiran sus
**dos** casos de censo de migraciones (T0), y se **conserva** el tercero —«ProductBatch conserva las
columnas que le dio `20260909120000_product_batches`»—, que sigue siendo cierto y que además es la
guardia de R25: `product_batches` no pierde ni gana columnas en esta ficha.

## 11. Alternativas descartadas

**A. Pedir la unidad del ingrediente bajo demanda, con una Server Action al elegirlo.** Era la
forma de no tocar la consulta caliente: el `ProductPicker` ya conoce el `id`, y al elegir se
consulta la unidad de su lote más reciente. **Descartada.** (1) Mete una llamada de red en mitad de
un `onSelect` que hoy es síncrono, con su estado de carga, su parpadeo y su camino de error nuevo,
justo en la interacción más frecuente del formulario de recetas. (2) `ProductView` **ya** traía la
unidad: derivarla no ensancha el contrato ni añade un campo, cambia el origen de uno que existe.
(3) El coste que evita —una consulta correlacionada por página— es menor que el que introduce.

**B. Dejarle a `products` una columna `unit_id` denormalizada, mantenida al día desde el lote.**
Ahorraría la derivación en cada lectura. **Descartada**: sería la misma columna que esta ficha
elimina, con el añadido de que ahora podría **contradecir** a su fuente —dos sitios que dicen la
unidad de un producto es como se acaba con dos que discrepan—, y mantenerla al día pide un
disparador o una escritura extra en cada alta de lote. La decisión del 2026-09-11 es explícita: la
unidad **se deriva**, no se copia.

**C. Promover `UnitSelect` de proveedores a `components/shared/`.** Es el segundo consumidor de un
selector de unidad no controlado, que es justo el umbral que `docs/architecture.md > Componentes`
pone para promover. **Descartada igual**: su API central es la opción «sin unidad»
(`NO_UNIT_VALUE`, `NO_UNIT_LABEL`), que aquí es **exactamente lo prohibido** (R17). Promoverlo
obligaría a añadirle una bandera `allowEmpty` y a tocar la pantalla de proveedores, feature ajena y
cerrada —el mismo motivo por el que QC-44 no promovió el `UnitPicker` de QC-26—. Se escribe uno
local, de unas cuarenta líneas, que dice una sola cosa. Si aparece un tercer consumidor obligatorio,
ese será el momento de promover.

**D. Rellenar las 114 presentaciones a mano y no en la migración**, o borrar el residuo de paso.
**Descartada por decisión cerrada**: un relleno fuera de la migración deja bases distintas según
quién lo corriera, y el borrado es QC-77 (sería QC-77 de contrabando, R5).

**E. `ON DELETE SET NULL` en la FK hacia la unidad.** **Descartada por decisión cerrada 11**:
convertiría «esta unidad se borró» en «esta presentación no declara unidad» y, además, con
`NOT NULL` la base ni siquiera lo permitiría.

**F. Dos migraciones, una por tabla.** **Descartada**: las dos mitades son el mismo movimiento y
partirlas abre un estado intermedio en el que nadie declara la unidad.

## 12. Riesgos y costes aceptados

- **La FK de la unidad es drift para Prisma** (§ 3). Toda migración futura de `presentations` hay
  que revisarla a mano, igual que ya pasa con `product_batches` y con `units`.
- **`listAlive` gana una consulta correlacionada por página** (§ 7). Medido cero veces: no hay
  presupuesto de rendimiento escrito en el repo. Si molesta, el índice compuesto está identificado.
- **La unidad de la presentación no se pinta en ninguna lista** (§ 5): solo se ve abriendo el panel.
- **El selector ofrece el catálogo entero, incluidas las dos unidades de residuo** de los tests.
  Es consecuencia directa de las decisiones 7 y 6 (no filtrar, no limpiar) y se cierra en QC-77.
- **Cambiar la unidad de una presentación no revisa los lotes que la usan**: si «Bolsa 5 KG» pasa de
  kilogramo a litro, los lotes existentes quedan reinterpretados sin avisar. Hoy no hay consumo que
  convierta cantidades (QC-76 R26 mantiene la conversión sin consumidores), así que no rompe nada
  todavía; queda anotado como pregunta que abrirá quien encienda la conversión.
