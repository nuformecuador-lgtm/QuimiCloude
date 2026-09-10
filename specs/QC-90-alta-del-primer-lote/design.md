# QC-90 — alta-del-primer-lote · design.md

> Cómo se hace lo que `requirements.md` pide. La tabla de «Decisiones cerradas» de ese archivo
> manda sobre este; aquí solo se decide el **cómo**.

## 1. Lo que ya existe y no se toca

| Pieza | Estado verificado el 2026-09-10 |
|---|---|
| Tabla `product_batches` | Creada por `db/migrations/20260909120000_product_batches`. `presentation_id` NOT NULL (FK RESTRICT), `stock` INT NOT NULL `CHECK >= 0`, `unit_cost` `DECIMAL(14,4)` NOT NULL `CHECK > 0`, `lot` TEXT y `expiry_date` DATE anulables, `created_by`/`updated_by` FK escalares a `users` **sin `@relation`**, RLS `ENABLE` + `FORCE` **sin policies** |
| Formulario | `app/(private)/inventario/components/product-form.tsx` ya pinta los cinco campos del lote **solo en el alta**, con su ayuda, valida la regla de los dos costos y conserva lo escrito tras un rechazo (30/30 en `tests/unit/inventario/product-page.test.tsx`) |
| `normalizeProductName` | Publicada en el contrato público de `inventario` (`lib/modules/inventario/index.ts`) |
| Patrón de importe | `lib/modules/proveedores/domain/catalog-line-input.ts`: cadena decimal + `DECIMAL_PATTERN` + `ZERO_PATTERN`, conversión a `Prisma.Decimal` **solo** en el adaptador driven |

**No hay migración en esta ficha (R29).** Ni columna nueva, ni índice, ni policy. La única
migración que existiría —el correlativo del lote y su unicidad por empresa— es QC-81.

## 2. Modelo de datos: qué fila queda escrita

Alta de producto **nuevo** (R16):

```
products        INSERT  name, name_normalized, stock, qty_alert, unit_id(NULL), created_at, updated_at
product_batches INSERT  product_id, presentation_id, stock, unit_cost, lot, expiry_date,
                        created_by = actor.id, updated_by = actor.id, created_at, updated_at
```

Alta sobre un producto que **ya existe** (R17, R18):

```
products        —  ninguna escritura, ni de updated_at
product_batches INSERT  igual que arriba, con el product_id encontrado
```

Que `products` no se toque ni en `updated_at` es deliberado: agregar un lote **no es** editar el
producto, y con QC-91 esa escritura desaparecería igual.

## 3. Camino completo

```
product-form.tsx ('use client')
  └─ createProductAction (adapters/driving/product-actions.ts, 'use server')
       └─ inventario.createProduct  (lib/composition)
            └─ createCreateProduct  (domain/create-product.ts)
                 1. requirePermission(actor, 'inventario.modificar')      ← R23, PRIMERA línea
                 2. createProductWithFirstBatchSchema.safeParse(input)    ← R24
                 3. deriveUnitCost(...)                                   ← R7, R9
                 4. products.findAliveIdByName(name)                      ← R15, R19, R20
                 5a. products.addBatchToAlive(id, batch, now)             ← R17
                 5b. products.createWithFirstBatch(product, batch, now)   ← R16, R21
```

**Ninguna ruta de API propia** (`docs/architecture.md > Server Actions vs Route Handlers`): la
mutación sale de un componente propio, luego Server Action. La action **no decide nada** (sigue el
criterio de QC-20): solo traduce `FormData` → candidato y error de dominio → estado serializable.

## 4. Contrato de entrada (esquema compartido)

Archivo nuevo `lib/modules/inventario/domain/product-batch-input.ts`, reexportado por el barrel
(que es client-safe: no arrastra `next/*` ni Prisma), para que el formulario y el servidor validen
con **el mismo objeto** (R24, R27).

```ts
const DECIMAL_PATTERN = /^\d{1,10}(\.\d{1,4})?$/;   // forma exacta de decimal(14,4), sin signo
const ZERO_PATTERN    = /^0+(\.0*)?$/;              // '0', '0.0', '00.0000'

const amountSchema = z.string().trim().regex(DECIMAL_PATTERN).refine((v) => !ZERO_PATTERN.test(v));

export const createProductWithFirstBatchSchema = z
  .strictObject({
    // producto: exactamente los de hoy (createProductSchema), sin cambios
    name, stock, qtyAlert, unitId,
    // lote
    presentationId: z.string().uuid(),
    unitCost:  amountSchema.nullish(),
    totalCost: amountSchema.nullish(),
    lot: z.string().trim().min(1).max(60).nullish(),
    expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  })
  .superRefine((v, ctx) => {
    // R11: ninguno de los dos → issue en LOS DOS campos
    // R8 : solo total y stock < 1 → issue con path ['stock']
    // R9 : solo total y el derivado redondea a 0 → issue con path ['totalCost']
  });
```

**Por qué `superRefine` con `path` explícito y no un error nuevo del dominio.** R8 exige que el
rechazo se pinte *en el campo de la existencia*. Los errores de `InventarioError` son
`{ code, message }` sin campo, así que un `ValidationError` nuevo no sabría dónde pintarse. Con el
issue de zod colgando de `['stock']`, el formulario —que ya mapea `issue.path[0]` a su campo— lo
pinta donde toca **sin ningún código nuevo de reparto de errores**. Es la razón práctica de que el
esquema tenga que ser el mismo en los dos lados y no dos copias parecidas.

`strictObject` (R24): un campo desconocido se **rechaza**, no se ignora — mismo criterio y mismo
motivo que QC-52 y QC-43 (quien manda un campo de más cree haber guardado algo que no se guardó).

`createProductSchema` **no se toca**: lo sigue usando la edición (`updateProductSchema`), que no
conoce el lote (R26).

## 5. La derivación del costo, sin coma flotante

Archivo nuevo `lib/modules/inventario/domain/unit-cost.ts`, puro:

```ts
export function deriveUnitCost(totalCost: string, stock: number): string | null;
// null = la división no da un costo válido (redondea a 0.0000) → R9
```

Aritmética con **`BigInt` nativo**, no con `number`:

1. `totalCost` se escala a entero de 4 decimales (`'12.5'` → `125000n`, sin `parseFloat`).
2. `unitCostEscalado = redondeoMitadArriba(total4 / BigInt(stock))`.
3. Se vuelve a formatear como cadena `'d.dddd'`.

`stock` sí es `number`, y puede serlo sin riesgo: es un entero de `z.number().int()`, no un importe.
Los que nunca se convierten son los importes (R4).

**Sobre la regla de dependencias** (`docs/architecture.md > Dependencias de terceros`, que prohíbe
reimplementar a mano lo que resuelve una librería): esto se evaluó y **no se propone ninguna
dependencia nueva**. Una librería de decimales (del tipo `decimal.js` / `big.js`) resolvería una
división con redondeo — unas 25 líneas de las que aquí se escriben—, pero: (a) el repo ya mueve
todos sus importes como **cadena decimal** y delega la aritmética exacta en Postgres, así que esta
es la **primera y única** operación aritmética sobre un importe en todo el código; (b) `BigInt` es
del lenguaje, no una utilidad casera de decimales; y (c) los cuatro checks de salud **no se pueden
verificar sin red** desde este entorno, y un check no verificable no es un sí, es un desconocido
(regla 6 de `CLAUDE.md`). Si el humano prefiere la librería, la propuesta se sube por la puerta que
`docs/architecture.md` fija —cuatro checks, fila en `docs/dependencias.md`, aprobación— y esta
ficha cambia una función por una llamada. `package.json` **no cambia** en QC-90.

## 6. Puerto y adaptador driven

`ProductRepository` (`ports/product-repository.ts`) gana **tres** métodos; los cinco de hoy no se
tocan:

```ts
findAliveIdByName(name: string): Promise<string | null>;         // R15, R19, R20
createWithFirstBatch(
  product: NewProduct, batch: NewProductBatch, now: Date,
): Promise<{ id: string; batchId: string }>;                     // R16, R21
addBatchToAlive(
  productId: string, batch: NewProductBatch, now: Date,
): Promise<{ batchId: string } | null>;                          // R17; null = no está vivo
```

`NewProductBatch` (`domain/product-batch.ts`) lleva `presentationId`, `stock`, `unitCost` **cadena
decimal**, `lot: string | null`, `expiryDate: string | null` (`YYYY-MM-DD`) y `createdBy: string`.
El dominio no ve `Prisma.Decimal` ni `Date` de expiración: convertir es del adaptador.

En `adapters/driven/persistence/product-prisma.ts`:

- `findAliveIdByName` normaliza con `normalizeProductName` —la misma función que escribió
  `name_normalized`— y consulta `where: { nameNormalized, deletedAt: null }`, `orderBy:
  [{ createdAt: 'asc' }, { id: 'asc' }]`, `take: 1` (R20). El índice de `name_normalized` ya existe
  desde QC-57.
- `createWithFirstBatch` envuelve los dos `create` en **`prisma.$transaction`** (R21).
- `unitCost` → `new Prisma.Decimal(cadena)`; `expiryDate` → `new Date(`${v}T00:00:00Z`)`, que es
  como se guarda una `@db.Date` sin corrimiento (R13). La vuelta, si algún día se lee, es
  `.toFixed(4)` y `toISOString().slice(0, 10)`.
- Este archivo sigue siendo el **único** del módulo que importa `@prisma/client` (regla de
  dependencias de `docs/architecture.md`), y sigue **sin tocar `users`**: `createdBy` se escribe
  como escalar, sin `include` ni `connect` (la FK es de la migración, no del cliente Prisma).

`RESTRICT` de `presentation_id`: una presentación que no existe muere en la FK, no en zod. El
adaptador traduce ese fallo a `ValidationError` (`invalid_input`), igual que ya hace el resto del
módulo con las FK.

## 7. Composición y Server Action

- `lib/composition/index.ts`: el objeto `productRepository` gana las tres funciones nuevas. Nada
  más cambia; `createProduct: createCreateProduct({ products: productRepository })` sigue igual.
- `product-actions.ts`: `buildProductCandidate` lee además `presentationId`, `unitCost`,
  `totalCost`, `lot` y `expiryDate` con `readOptionalFormString` —**cadenas, sin convertir**: los
  importes no pasan por `Number` en ningún punto (R4)—. `stock` y `qtyAlert` siguen con
  `readOptionalFormInt`. `CreateProductFormState` **no cambia de forma**: sigue devolviendo el `id`
  del producto, que en el caso de R17 es el del producto que ya existía.

## 8. Formulario

Cambios acotados en `product-form.tsx` (R25, R27, R28):

- La validación previa pasa a usar `createProductWithFirstBatchSchema` en el alta y
  `createProductSchema` en la edición; **desaparece** la rama manual que hoy valida los campos del
  lote a mano, porque el esquema ya la contiene.
- Los campos del lote se **añaden al candidato** que se valida y viajan en el `FormData` (ya están
  en el DOM: no hay campo nuevo que pintar).
- `FIELD_MESSAGES.unitCost` / `.totalCost` pasan de «0 o más» a «mayor que 0» (R27), que es lo que
  la tabla exige alinear.
- Lo demás —`defaultValue` tras el rechazo, `key` de remontaje, ayuda de cada campo, orden— no se
  toca: ya está verificado y R28 solo pide que siga siendo cierto con los campos viajando.

**Multiplataforma** (`docs/architecture.md > Componentes > Regla: multiplataforma`): no entra
ningún control nuevo. Los dos costos siguen siendo `type="text"` con `inputMode="decimal"` —lo que
además evita el `type="number"` sobre un importe—, los objetivos táctiles siguen en `min-h-11` y el
texto de campo en `text-base`. **No hay excepción de escritorio que declarar.**

## 9. Autorización y aislamiento

- `requirePermission(actor, 'inventario.modificar')` es la **primera línea** del caso de uso, antes
  de zod y antes del puerto (R23). Su test llama al caso de uso con un actor sin permiso y
  comprueba que lanza **sin que el repositorio reciba una sola llamada**.
- **Aislamiento por empresa: no entra aquí, y es deuda registrada.** `products` y
  `product_batches` no tienen `company_id`; saldarlo es **QC-49**, que la epica QC-46 tiene
  declarado como deuda en `docs/architecture.md > Dominio` n.º 1. Esta ficha no añade tabla nueva
  —la exigencia de «toda tabla nueva nace con su columna de empresa» no se dispara— y no puede
  filtrar por una columna que no existe.
- RLS: la tabla ya está `ENABLE` + `FORCE` sin policies desde el 2026-09-09, que es lo que
  `CHECKPOINTS.md` pide. Ninguna policy sustituye al punto anterior.

## 10. Alternativas descartadas

**A. Que el navegador mande el `id` del producto elegido en el autocomplete.** Es la vía más
directa: el `ProductNamePicker` ya conoce el `id`, bastaba un campo oculto y el servidor no tendría
que resolver nada por nombre. **Descartada.** (1) El autocomplete es texto libre: quien teclea el
nombre exacto sin desplegar la lista no manda ningún `id`, así que el servidor necesitaría el
camino por nombre **de todas formas** y habría dos reglas de «ya existe» conviviendo — que es
exactamente cómo se acaba con dos definiciones que discrepan. (2) Un `id` que viene del navegador
es entrada externa y hay que revalidarla contra la base igual, así que no ahorra la consulta.
(3) `normalizeProductName` ya es **la única** definición de «mismo nombre» del módulo (QC-57 R19) y
usarla aquí la reutiliza en vez de abrir una segunda. El coste aceptado es R20: con homónimos, el
servidor elige y el usuario no manda.

**B. Servir la presentación del último lote en el listado de productos** —el hueco que
`ProductNameOption` dejó abierto con `presentationId`/`presentationName` opcionales—. **Descartada
y declarada fuera de alcance en R31.** Obligaría a devolver presentación en `ProductView`, que es
el tipo que consumen el listado, la ficha y `getProduct`, y a meter un `join`/subconsulta «último
lote» en `listAliveProducts`, que es la consulta más caliente de la pantalla y sirve además al
autocomplete con `pageSize` máximo. Es un cambio de lectura, no de escritura, y esta ficha es de
escritura; además pisa el terreno de QC-91, que reabre esa misma consulta para sumar existencias.
El coste aceptado: al elegir un producto existente, el selector de presentación queda en blanco y
hay que elegirla a mano. El hilo del componente ya está puesto y no se borra.

**C. Un caso de uso nuevo (`createProductWithFirstBatch`) al lado del actual.** **Descartada**:
dejaría dos altas de producto, una capaz de crear un producto sin lote — justo lo que R1 prohíbe.
Se modifica `createCreateProduct`, que es el único alta que existe.

**D. Guardar también el costo total en una columna.** **Descartada**: la tabla no la tiene a
propósito (el comentario del modelo lo dice: `totalCost` es `stock * unitCost` y se calcula al
leer, como el total del pedido en QC-33), y guardarlo permitiría que contradijera a sus factores.

## 11. Riesgos y costes aceptados

- **Carrera en el alta de un nombre nuevo.** Entre `findAliveIdByName` y el `INSERT` no hay
  candado: dos altas simultáneas del mismo nombre nuevo crean dos productos. Es el comportamiento
  de **hoy** —`products.name` no es único— y cerrarlo pide un índice único, o sea migración, o sea
  QC-81. Se acepta y se anota.
- **Redondeo.** Con costo total, `stock * unit_cost` puede no devolver el total escrito (`10 / 3`).
  Es consecuencia directa de guardar solo el unitario (D) y de los 4 decimales de la columna.
- **El costo no lleva moneda.** Pregunta abierta 5 del dominio, y esta ficha **no la cierra**: se
  guarda el importe sin moneda, igual que el resto del ERP hoy.
