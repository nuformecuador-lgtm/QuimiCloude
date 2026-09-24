# QC-151 — cotizacion-del-coste-en-el-pedido · design.md

> Ficha **fullstack**: un caso de uso nuevo de solo lectura en `pedidos` con su Server Action, y el
> bloque de coste en el formulario de pedido. **Sin tablas, sin migraciones, sin RLS nueva, sin
> permiso nuevo y sin dependencias nuevas.** No toca `resolve-ingredients-cost.ts`, `order-cost.ts`,
> `create-order.ts`, `update-order.ts`, `order-columns.tsx` ni `lib/shared/ui/decimal-display.ts`.

## 0. Lo que ya existe y se usa tal cual (verificado en disco el 2026-09-23)

| Pieza | Dónde | Qué aporta |
|---|---|---|
| Cálculo del coste | `lib/modules/pedidos/domain/resolve-ingredients-cost.ts:14` | `resolveIngredientsCost(recipes, products, units, recipeId, orderQuantity, companyId) -> string \| null`. Solo lee: `findExecutionContentById`, `findCostingBatches`, `findRefs` (productos) y `findRefs` (unidades), todo con `companyId`. Devuelve `Decimal(14,4)` en texto (`'40.0000'`) o `null`. |
| Coste al guardar | `create-order.ts:113`, `update-order.ts:98` | Las dos llaman a `resolveIngredientsCost` con `data.recipeId`, `data.quantity` ya validados y `actor.companyId`. La cotización llama a **la misma función con los mismos argumentos**: eso es R1 por construcción. |
| Receta de otra empresa | `recipe-catalog.ts:40-46` | `findExecutionContentById` devuelve `null` para un id ajeno; `resolveIngredientsCost` lo convierte en `lines = []` y `calculateIngredientsCost` en `null`. R6 sale gratis y sin rama propia. Una receta dada de baja **sí** vuelve (`isDeleted: true`) y se cotiza: es lo que hace también la edición cuando la receta no cambia. |
| Permiso y actor | `domain/actor.ts:46` | `requirePermission(actor, 'pedidos.modificar')`, fallo cerrado; `Actor.companyId` sale de la sesión. |
| Regla de cantidad | `domain/order-input.ts:42` (`quantitySchema`, privada) | Accesible por `createOrderSchema.shape.quantity`; se reutiliza con `pick`, no se copia. |
| Importe guardado en el cliente | `OrderSummary.ingredientsCost` (`order-view.ts:102,119`) | La fila del listado ya lo trae, y el panel de edición recibe esa fila (`order-sheet.tsx:147`). Abrir la edición no necesita consultar nada (R11). |
| Descartar respuestas viejas | `order-form.tsx:402-433` (`ingredientsRequestRef`) | Contador en `useRef`; cada petición toma el siguiente número y su respuesta solo se aplica si sigue siendo el vigente. Se copia el patrón. |
| Cantidad tecleada | `order-field.tsx:134-147` (`onValueChange`) | Avisa en cada tecla y otra vez tras el redondeo del `blur`. El formulario ya la refleja en su estado `quantity`. |
| Redondeo de pantalla | `lib/shared/ui/decimal-display.ts:119,137` | `formatDecimalDisplay` (dos decimales, empate lejos del cero, BigInt) y `exactDecimalTitle` (patrón de QC-132). **No se toca**. |
| Guion | `order-columns.tsx` exporta `MISSING_VALUE_MARK` (`—`) | Se reutiliza; no se declara un segundo marcador. |
| Traductor de errores | `order-actions.ts:112` (`toErrorState`) | La acción nueva devuelve `ErrorState` igual que las otras seis. |

**Antecedente leído:** la versión de QC-122 anterior al 2026-09-23 diseñaba un `order-amount.ts` y
unas guardias de `Intl`/`toLocaleString` para la columna del listado. Se retiraron de QC-122 al
sacar el importe (su `design.md`, nota de cabecera) y **no están en disco**. Aquí se retoma la idea
del archivo `order-amount.ts`, reescrita para el formulario y con el formato cerrado en la tabla de
decisiones de esta ficha.

## 1. Flujo

```
OrderForm ── cambia receta / cantidad ──> useOrderCostQuote
                                           ├─ sin receta o cantidad no válida -> guion (R9), invalida lo pendiente (R15)
                                           ├─ receta elegida -> pide YA (R14)
                                           └─ cantidad -> espera 500 ms desde la última tecla (R13)
                                                  │
                                    quoteOrderCostAction({ recipeId, quantity })   ('use server')
                                                  │  currentActor() de la sesión (R7)
                                    pedidos.quoteOrderCost(input, actor)          (lib/composition)
                                                  │  requirePermission -> safeParse -> resolveIngredientsCost
                                    { ingredientsCost: '12752.5512' | null }
                                                  │
                          respuesta vigente -> formatOrderAmount -> «$ 12,752.55», title «12752.5512»
                          respuesta superada -> se descarta (R15)
```

## 2. Dominio: `lib/modules/pedidos/domain/quote-order-cost.ts` (nuevo)

```ts
export type QuoteOrderCostDeps = {
  readonly recipes: RecipeCatalog;   // @/lib/modules/recetas
  readonly products: ProductCatalog; // @/lib/modules/inventario
  readonly units: UnitCatalog;       // @/lib/modules/unidades
};

export type OrderCostQuote = { readonly ingredientsCost: string | null };

export function createQuoteOrderCost(
  deps: QuoteOrderCostDeps,
): (input: unknown, actor: Actor | null | undefined) => Promise<OrderCostQuote>;
```

Cuerpo, en este orden (lo vigila `tests/unit/pedidos/authorization.test.ts`, que busca
`return async function` y exige `requirePermission` antes de `safeParse` y de `deps.recipes`):

1. `requirePermission(actor, 'pedidos.modificar')` (R3).
2. `quoteOrderCostSchema.safeParse(input)`; si falla, `throw new ValidationError()` (R5).
3. `resolveIngredientsCost(deps.recipes, deps.products, deps.units, data.recipeId, data.quantity, actor.companyId)` (R1, R6, R7).
4. `return { ingredientsCost }`.

**Las dependencias no incluyen `orders` (el repositorio) ni `presentations`.** El caso de uso no
puede escribir porque no recibe nada que escriba: R2 queda garantizado por el tipo, y el test lo
comprueba además con dobles de los tres catálogos que registran que solo se llamó a métodos de lectura.

**No se comprueba que la receta esté viva ni que exista** (a diferencia del alta): una receta
inexistente o ajena da «sin importe» (R6) y una dada de baja se cotiza, como en la edición sin cambio
de receta. Quien intente guardar con una receta muerta recibe el error del guardado, no de la
cotización.

**Esquema** en `domain/order-input.ts`:

```ts
export const quoteOrderCostSchema = createOrderSchema.pick({ recipeId: true, quantity: true });
export type QuoteOrderCostInput = z.infer<typeof quoteOrderCostSchema>;
```

`pick` hereda la regla de cantidad y la forma UUID sin copiarlas. `z.object` descarta claves de más,
así que un `companyId` en la entrada no llega a ninguna parte (R7).

**Contrato** (`lib/modules/pedidos/index.ts`): se exportan `createQuoteOrderCost`,
`QuoteOrderCostDeps`, `OrderCostQuote`, `quoteOrderCostSchema` y `QuoteOrderCostInput`. El esquema es
client-safe y el formulario lo usa para decidir si pide (R9), igual que ya usa `createOrderSchema`.

## 3. Server Action: `quoteOrderCostAction` en `order-actions.ts`

```ts
export type OrderCostQuoteResult =
  | { status: 'success'; data: OrderCostQuote }
  | ErrorState;

export async function quoteOrderCostAction(input: unknown): Promise<OrderCostQuoteResult>;
```

- Forma de **consulta**, como `getOrderAction`/`listOrdersAction`: argumento tipado, no `FormData`
  (no hay formulario que enviar; es un efecto del teclado).
- `currentActor()` —el mismo del archivo, una lectura de sesión dentro de `runInRequestScope`— y
  `pedidos.quoteOrderCost(input, actor)`; el error se traduce con `toErrorState`. No repite
  `requirePermission`, no valida y no calcula: el adaptador no decide nada.
- Va en `order-actions.ts` y no en un archivo nuevo: `tests/unit/pedidos/module-contract.test.ts:697`
  exige que `adapters/driving/` tenga ese único archivo. El censo de QC-104
  (`session-once-per-request-actions.test.ts`) es por archivo y `order-actions.ts` ya está: no cambia.
- Sin `revalidatePath`: no escribe nada.

## 4. Composición: `lib/composition/index.ts`

Una entrada más en la fachada `pedidos` (bloque de la línea ~972), reutilizando las constantes que ya
existen:

```ts
quoteOrderCost: createQuoteOrderCost({
  recipes: recipeCatalog,
  products: productCatalog,
  units: unitCatalog,
}),
```

## 5. Pantalla

### 5.1 `app/(private)/pedidos/components/order-amount.ts` (nuevo, puro)

```ts
export const ORDER_AMOUNT_SYMBOL = '$';
export function formatOrderAmount(value: string): string;        // '12752.5512' -> '$ 12,752.55'
export function orderAmountTitle(value: string): string | undefined; // exactDecimalTitle(value)
```

- `formatOrderAmount`: `formatDecimalDisplay(value, 2)` da la cifra redondeada sin ceros de relleno
  (`'12752.55'`, `'40'`, `'0.01'`); se parte por el punto con `split`, la parte decimal se rellena a
  dos cifras con `padEnd`, y la entera se agrupa de tres en tres **con un bucle sobre `slice`** —sin
  `.replace` ni expresión regular sobre la cifra, porque la guardia `conversionesDeImporte` de
  `pedidos-convenciones.test.ts` prohíbe `.replace(` en una línea que nombre `amount`/`importe`/`total`—.
  Resultado: `` `${ORDER_AMOUNT_SYMBOL} ${grouped}.${fraction}` ``.
- El redondeo es el de toda la app (dos decimales, empate lejos del cero, `BigInt`): no hay una
  segunda regla de redondeo.
- `orderAmountTitle` es `exactDecimalTitle(value)` y nada más: el patrón de QC-132 (valor exacto sin
  ceros de relleno y sin formato, solo cuando difiere de lo pintado). R19.
- Sin `Intl`, `toLocaleString`, `Number(`, `parseFloat` ni `toFixed` (R18). Lo afirma un caso del test
  del formateador leyendo la fuente del archivo, y la guardia de convenciones de la ruta ya barre
  `parseFloat`/`toFixed`/`Number(` en toda la ruta.

### 5.2 `app/(private)/pedidos/components/use-order-cost-quote.ts` (nuevo, `'use client'`)

```ts
export const ORDER_COST_QUOTE_DEBOUNCE_MS = 500;

export type OrderCostQuoteState = {
  readonly amount: string | null;   // lo que se pinta; null = guion
  readonly quoting: boolean;        // hay una cotización en vuelo
};

export function useOrderCostQuote(initialAmount: string | null): {
  readonly state: OrderCostQuoteState;
  readonly onRecipeChange: (recipeId: string | null, quantity: string) => void;
  readonly onQuantityChange: (recipeId: string | null, quantity: string) => void;
};
```

- **Arranca con `initialAmount`** (el importe guardado en la edición, `null` en el alta) y no pide nada
  al montar (R11). Nada de `useEffect` que dispare la cotización: la disparan los dos manejadores, que
  el formulario llama desde `chooseRecipe` y desde `onValueChange` de la cantidad. Así la edición
  recién abierta no cotiza y no hay `setState` síncrono en un efecto (`react-hooks/set-state-in-effect`).
- `canQuote(recipeId, quantity)` = receta no nula y `quoteOrderCostSchema.safeParse({ recipeId, quantity }).success`.
- `onRecipeChange`: cancela el temporizador; si no `canQuote` -> invalida lo pendiente
  (`++requestRef.current`), `amount = null`, `quoting = false` (R9, R15); si sí -> pide ya (R14).
- `onQuantityChange`: cancela el temporizador; si no `canQuote` -> igual que arriba (R9); si sí ->
  `setTimeout(pedir, ORDER_COST_QUOTE_DEBOUNCE_MS)` (R13). Cada tecla reinicia la ventana.
- `pedir`: `const id = ++requestRef.current; quoting = true;` y
  `quoteOrderCostAction({ recipeId, quantity }).then(r => { if (id !== requestRef.current) return; ... })`
  (R15). Éxito -> `amount = r.data.ingredientsCost`, `error = null` (R10 si es `null`); error ->
  `amount = null`, `error = r` (el `ErrorState` entero, R21). En los dos, `quoting = false`. Cualquier
  paso al guion de R9 y cualquier petición nueva limpian `error`.
- El estado gana `readonly error: ErrorState | null`: con él el bloque distingue «sin importe» (guion)
  de «falló» (mensaje), que la decisión de F1.4 exige no confundir.
- El temporizador se limpia al desmontar (el panel monta un `OrderForm` nuevo por apertura).
- La espera de 500 ms **no** atenúa: la cifra se atenúa desde que sale la petición hasta que vuelve
  («mientras cotiza» = petición en vuelo). Durante la ventana se ve la cifra de antes, sin marca.

### 5.3 `app/(private)/pedidos/components/order-cost-quote.tsx` (nuevo, presentacional)

```ts
export const ORDER_COST_QUOTE_TESTID = 'order-cost-quote';
export const ORDER_COST_QUOTE_VALUE_TESTID = 'order-cost-quote-value';
export const ORDER_COST_QUOTE_QUOTING_TESTID = 'order-cost-quote-quoting';
export const ORDER_COST_QUOTE_ERROR_TESTID = 'order-cost-quote-error';
export function OrderCostQuote(props: OrderCostQuoteState): JSX.Element;
```

| `amount` | `quoting` | `error` | Se pinta |
|---|---|---|---|
| cifra | `false` | `null` | `$ 12,752.55`, `title` según R19, `data-state="idle"` |
| cifra | `true` | `null` | la misma cifra con `opacity-60`, `data-state="quoting"`, y «cotizando…» (R16) |
| `null` | `false` | `null` | `—` (R9, R10) |
| `null` | `true` | — | solo «cotizando…», sin guion ni cifra (R17) |
| `null` | `false` | `ErrorState` | **ni guion ni cifra**; bajo el bloque, `data-state="error"` y «No se pudo cotizar: <`error.message`>» (R21). Si `error.code` es `unexpected`, el mensaje lo pinta `UnexpectedErrorNotice` (con su identificador de petición), igual que la región de error del formulario (`order-form.tsx:562`) |

- El mensaje del error sale del `message` que ya trae el `ErrorState` (catálogo de errores); el
  prefijo «No se pudo cotizar:» es el único texto propio y ningún test depende de él (van por
  `ORDER_COST_QUOTE_ERROR_TESTID` y por el `code`). No usa `role="alert"`: no interrumpe; va dentro
  de la misma región `role="status"`.

- Rótulo del bloque: «Coste estimado de ingredientes» (copy no afirmado por ningún test; los tests van
  por `data-testid`).
- «cotizando…» dentro de un `role="status" aria-live="polite"`, con `aria-busy` en el bloque mientras
  `quoting`; mismo patrón que `ORDER_INGREDIENTS_LOADING_TESTID`.
- Solo texto: no hay control interactivo nuevo.

### 5.4 Cambios en `order-form.tsx`

- `const quote = useOrderCostQuote(order?.ingredientsCost ?? null);`
- `chooseRecipe(option)`: además de lo que ya hace, `quote.onRecipeChange(option?.id ?? null, quantity)`.
- La cantidad: `onValueChange={(value) => { setQuantity(value); quote.onQuantityChange(recipe?.id ?? null, value); }}`.
- `<OrderCostQuote {...quote.state} />` **fuera** de la condición `recipeId === ''` (tiene que verse
  con guion sin receta, R9), justo **debajo del campo de cantidad**, en la columna de campos: lo que la
  mueve está al lado.
- Ningún campo nuevo en el `<form>` ni en `ORDER_BUSINESS_FIELDS`, y `canSave` no cambia (R20). El
  guardado sigue recalculando en el servidor.

### 5.5 Barrel de la ruta

`components/index.ts` gana un bloque nuevo con `OrderCostQuote`, sus cuatro testids,
`useOrderCostQuote`, `ORDER_COST_QUOTE_DEBOUNCE_MS`, `formatOrderAmount`, `orderAmountTitle` y
`ORDER_AMOUNT_SYMBOL`. Hace falta: `pedidos-convenciones.test.ts` (R40 de QC-35) prohíbe que `tests/`
importe la ruta por ruta profunda, así que los tests de estas piezas entran por el barrel. Ningún
export existente se toca (`guard-pantalla-pedidos-se-amplia.test.ts`).

## 6. Contratos de entrada y salida

| Operación | Entrada | Salida | Errores (`code`) |
|---|---|---|---|
| `pedidos.quoteOrderCost(input, actor)` | `unknown` -> `{ recipeId: uuid, quantity: decimal(14,4) > 0 }` | `{ ingredientsCost: string \| null }` | `unauthorized`, `invalid_input` |
| `quoteOrderCostAction(input)` | `unknown` | `{ status: 'success', data: { ingredientsCost } }` \| `ErrorState` | los de arriba y `unexpected` |

Sin rutas nuevas, sin route handler, sin `fetch`.

## 7. Modelo de datos, RLS, migraciones

Ninguno. `orders.ingredients_cost` ya existe (QC-123) y esta ficha no lo escribe.

## 8. Alternativas descartadas

- **A. Calcular la cotización en el cliente** con los datos que ya trae `getRecipeAction` (líneas,
  porcentaje, existencia). Descartada: el coste necesita los **lotes con su coste unitario**, su orden
  y las conversiones de unidad, que el detalle de receta no trae. Habría que bajar al navegador el
  coste de cada lote de la empresa y **duplicar** `calculateIngredientsCost` en la pantalla: dos
  implementaciones que pueden separarse, que es justo lo que R1 prohíbe, y datos de coste expuestos sin
  que nadie los haya pedido.
- **B. Un modo «simulación» en `createOrder`/`updateOrder`** (un flag que calcula y no guarda).
  Descartada: mete una rama de lectura en dos casos de uso de escritura, obliga a pasar el resto de la
  entrada (presentación, prioridad, estado) solo para cotizar, y cualquier fallo en el flag convierte
  una cotización en un pedido guardado. Además esos dos archivos los está reescribiendo QC-141 (unidad
  de trabajo, T9).
- **C. Route handler `GET` + SWR.** Descartada: es un dato privado de empresa, no público (la regla de
  SWR es para datos públicos), y `pedidos-convenciones.test.ts` prohíbe `route.ts` bajo la ruta y
  `fetch` a una ruta propia. El precedente de consulta desde el formulario es una Server Action
  (`getRecipeAction`, `order-form.tsx:430`).
- **D. `Intl.NumberFormat('en-US', { style: 'currency' })`.** Descartada por decisión cerrada y porque
  convierte a `number`: el importe dejaría de ser exacto justo donde se pinta.
- **E. Un «cotizando…» también durante la ventana de 500 ms.** Descartada: atenuaría con cada tecla;
  la decisión habla de «mientras cotiza».

## 9. Solapes con fichas en curso (archivos concretos)

| Ficha | Archivo común | Naturaleza | Riesgo |
|---|---|---|---|
| **QC-141** (fullstack, `in_progress`) | `lib/composition/index.ts` | QC-141 (T8-T10, T12, T14) cambia las dependencias de `createOrder`/`updateOrder` y añade cableado en el mismo bloque `pedidos`. Esta ficha añade **una entrada** a ese objeto. | Conflicto textual casi seguro, trivial de resolver. **Por `AGENTS.md > Paralelismo` (misma zona fullstack), la intersección bloquea QC-151 hasta que QC-141 pase a `done`**, salvo que el humano acepte el solape. |
| QC-141 | `lib/modules/pedidos/index.ts` | QC-141 exporta errores y casos de uso nuevos (`transition-order`, cobertura). Aquí, un bloque nuevo al final. | Textual, adyacencia posible. |
| QC-141 | `lib/modules/pedidos/domain/order-input.ts` | No consta en sus tareas; se cita por si su T14 (cobertura) lo toca. | Bajo. |
| QC-141 | `app/(private)/pedidos/**` (su T14, pendiente: «fila y hoja») y `tests/unit/pedidos-ui/order-form.test.tsx` (sus fixtures) | Esta ficha modifica `order-form.tsx` (cuatro puntos, §5.4) y añade **una línea** al doble de `order-actions` de `order-form.test.tsx`. | Medio en `order-form.tsx` si T14 pinta la cobertura en la hoja. |
| QC-141 | `tests/unit/pedidos/authorization.test.ts` | No consta que QC-141 lo toque; lo cito porque su T10 añade `transition-order.ts` al dominio y podría ampliar la misma tabla. | Bajo. |
| **QC-122** (frontend, `in_progress`) | `app/(private)/pedidos/components/index.ts` | QC-122 añade exports en los bloques de `order-list-params` y `order-table`; esta ficha, un bloque nuevo tras el de `order-ingredients-table`. | Zonas distintas: no bloquea. Sin conflicto textual previsible (no adyacente). |
| QC-122 | `tests/unit/pedidos-ui/order-table.test.tsx`, `order-list-section.test.tsx` | Solo si al correr la suite esos archivos rompen por el doble de `order-actions` sin `quoteOrderCostAction` (§10). No deberían: no teclean en el formulario. | Bajo; no se tocan salvo rojo. |

**El humano aceptó el 2026-09-23 arrancar en paralelo con QC-141 pese al solape; quien mergee
segundo resuelve el conflicto.**

`order-ingredients-table.tsx`, `order-cost.ts`, `resolve-ingredients-cost.ts`, `create-order.ts` y
`update-order.ts` (los que QC-141 reescribe en el coste) **no se tocan aquí**.

## 10. Tests que cambian (no se relajan)

- `tests/unit/pedidos/authorization.test.ts`: la tabla `SEIS` y `SEIS_ARCHIVOS` ganan la fila
  `quoteOrderCost:pedidos.modificar` / `quote-order-cost.ts`; el caso «la tabla cubre los seis nombres»
  pasa a esperar siete. Se añade, no se quita nada.
- `tests/unit/pedidos-ui/pedidos-convenciones.test.ts`: `ACCIONES` gana `quoteOrderCostAction`, para
  que la regla «actions por ruta exacta, nunca por el barrel» la cubra.
- Dobles de `@/lib/modules/pedidos/adapters/driving/order-actions` en los tests de la ruta que montan
  el formulario **y teclean o eligen receta** (hoy: `order-form.test.tsx`, `order-sheet.test.tsx`,
  `pedidos-viewport.test.tsx`): se añade `quoteOrderCostAction` con una respuesta fija
  `{ status: 'success', data: { ingredientsCost: null } }`. Un doble de `vi.mock` sin esa export
  revienta solo al invocarla, así que los que no teclean no cambian.

## 11. Multiplataforma

Solo texto en `text-sm`/`text-base`, sin `:hover` (el `title` es un añadido, no la única vía: la cifra
pintada ya informa; límite aceptado en QC-127/QC-132), sin controles nuevos, sin alturas fijas. Sin
excepción de escritorio.

## 12. Dependencias

Ninguna nueva. Formato y redondeo con `BigInt` y `decimal-display.ts`, como ya hace la ruta.

## 13. Riesgos

- **Carga**: cada cotización son 4 consultas de lectura (receta, lotes, productos, unidades), a lo sumo
  una por pausa de 500 ms o por cambio de receta. Aceptable para un formulario de uso humano.
- **La cotización puede no coincidir con lo guardado** si los lotes cambian entre cotizar y guardar.
  Es la decisión cerrada («orientativa»), no un defecto.
- **El `title` no se ve en móvil**: límite heredado de QC-127/QC-132, aceptado.

## 14. Ampliación en F2.1: el selector de recetas en la edición (R23)

Aprobada por el humano el 2026-09-23. Commit `395ff106`, aislado para poder revertirlo solo.
Fuentes: bitácora `progress/impl_QC-151-cotizacion-del-coste-en-el-pedido.md` (ronda 2, menor 4) y
`app/(private)/pedidos/components/recipe-picker.tsx` tal como está en la rama.

- **Síntoma.** En la edición, al elegir una receta distinta de la ya elegida, la elección se retiraba
  (`onSelect(null)`): Guardar se deshabilitaba y la cotización volvía al guion. Salió al escribir el
  caso «elegir otra receta» de R12 en `order-form-quote.test.tsx`. En el alta no se veía porque no hay
  receta previa.
- **Causa.** El autocomplete dispara su propio `onValueChange` con el nombre recién elegido justo
  después del `onClick` de la opción. `handleValueChange` comparaba ese texto contra el estado
  `selectedName`, que en ese instante todavía tenía el nombre **anterior** (React no había vuelto a
  pintar). Como no coincidían, aplicaba la regla del 2026-09-09 —«lo escrito ya no es lo elegido»— y
  retiraba la receta que se acababa de elegir.
- **Arreglo.** Un espejo síncrono, `selectedNameRef` (`useRef(defaultLabel)`): `choose` lo actualiza
  antes de tocar el estado, `handleValueChange` compara contra el ref y lo vacía cuando retira. La
  regla de retirar la elección cuando lo escrito deja de coincidir sigue intacta; solo cambia contra
  qué valor se compara.
- **Fuera del diseño original.** `recipe-picker.tsx` no estaba en los archivos de §5; entra por esta
  ampliación. No cambia exports, así que `guard-pantalla-pedidos-se-amplia.test.ts` no se ve afectada.
- **Alternativa descartada.** Leer el nombre elegido de un efecto (`useEffect`) posterior al
  render: seguiría habiendo un evento intermedio con el valor viejo, y el ref lo resuelve en el mismo
  evento sin otro render.
