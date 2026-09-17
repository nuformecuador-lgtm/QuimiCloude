# QC-103 — lote-y-fecha-de-compra-en-el-alta · design.md

## 0. Lo medido en disco antes de diseñar

**Frontend (panel de alta):**
- `app/(private)/inventario/components/product-form.tsx`
  - `BATCH_FIELDS = ['presentationId', 'unitCost', 'totalCost', 'lot', 'expiryDate']` (línea 59).
    **`purchaseDate` NO está en esta lista** y hay que añadirla.
  - `FIELD_MESSAGES`, `FIELD_LABELS`, `readOptionalText` y el bloque `superRefine` del lote/costos
    ya existen; solo hace falta el campo nuevo, su copy y su widget.
  - El campo `lot` (línea 567) ya es opcional, con `helper` que dice «Opcional: déjalo vacío si el
    envase no lo trae». Falta que el helper explique que dejarlo vacío significa que el sistema lo
    asigna (R6).
  - El campo `expiryDate` (línea 576) usa `type="date"` nativo del navegador — **no** es el patrón
    a copiar para `purchaseDate`: la decisión 2 cerró `react-day-picker` para la fecha de compra
    específicamente, y `expiryDate` queda fuera del alcance de esta ficha (sigue con su input
    nativo; no se toca).
  - La validación previa usa `createProductWithFirstBatchSchema.safeParse(...)` con un objeto
    literal de campos (líneas 309-318): falta añadir `purchaseDate: readOptionalText(values.purchaseDate)`.
- `app/(private)/inventario/components/product-sheet.tsx`
  - `CREATE_SUCCESS = 'Producto creado.'` (línea 17) y `toast.success(isEdit ? UPDATE_SUCCESS : CREATE_SUCCESS)`
    en `handleSaved` (línea 62). **Es la única superficie que R14-R16 tocan.** `handleSaved` no
    recibe hoy ningún dato de lo guardado; para nombrar el lote necesita el resultado de la action,
    que hoy tira ese dato (`ProductForm` llama a `createProductAction` y solo mira `result.status`).
- `components/ui/calendar.tsx` ya existe (shadcn/ui sobre `react-day-picker`), usado hoy en
  `components/shared/data-table/data-table-filter-date.tsx` en modo `range`. Para esta ficha se usa
  en modo **`single`**, que el mismo componente soporta sin cambios (es una prop de `DayPicker`).
  **No se toca `calendar.tsx`.**

**Backend (el cambio mínimo, motivo de que la ficha sea `fullstack`):**
- `lib/modules/inventario/domain/create-product.ts` — `resolverFechaDeCompra` **ya existe** y ya
  rechaza fecha futura (líneas 53-63); `purchaseDate` **ya viaja** en `createProductWithFirstBatchSchema`
  y ya se persiste en `NewProductBatch.purchaseDate`. Es decir: **QC-81 ya dejó escrita toda la
  fecha de compra**, de cliente (falta) a servidor (ya hecho) — lo único que falta de fecha de
  compra es la UI (R1-R5). Lo que **sí falta enteramente** es el lote de vuelta: la función
  devuelve `Promise<{ id: string }>` (línea 74) y al final devuelve `{ id: existente }` (línea 119)
  o `{ id: creado.id }` (línea 131), sin lote en ninguno de los dos caminos.
- `lib/modules/inventario/ports/product-repository.ts`
  - `createWithFirstBatch(...): Promise<{ id: string; batchId: string }>` (línea 90).
  - `addBatchToAlive(...): Promise<{ batchId: string } | null>` (línea 112).
  - Ninguno de los dos devuelve el **lote** (el texto), solo el `batchId` (UUID interno, inútil
    para mostrar). Los dos hay que ampliarlos con `lot: string`.
- `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts`
  - `writeBatchWithLotRetry` ya expone `resolveBatchLot(): Promise<string>` a la función `write`
    que recibe (línea 453); `createWithFirstBatch` y `addBatchToAlive` ya capturan `const lot = await resolveBatchLot()`
    (líneas 505 y 544) y lo usan para `toBatchCreateData`, pero **no lo devuelven**. El dato ya
    está en la variable local: es literal añadirlo al objeto de retorno.
- `lib/modules/inventario/adapters/driving/product-actions.ts`
  - `CreateProductFormState = { status: 'idle' } | { status: 'success'; id: string } | ErrorState`
    (línea 10-13). Falta `lot: string` en la rama de éxito.
  - `createProductAction` desestructura `const { id } = await inventario.createProduct(...)`
    (línea 137) y devuelve `{ status: 'success', id }` (línea 138). Falta capturar y devolver `lot`.

**No se toca**: `db/schema.prisma` (sin migración, R del alcance), `product-view.ts` (`ProductView`
sigue sin lote: no se necesita, porque el dato viaja por el resultado del alta, no por una
relectura), ni la edición de producto (`updateProductAction`, `updateProductSchema`), ni
`expiryDate`.

## 1. Cómo viaja el lote asignado, de punta a punta (R12-R16)

```
product-prisma.ts                    create-product.ts               product-actions.ts        product-form.tsx        product-sheet.tsx
resolveBatchLot() -> lot ----> { id, batchId, lot } (createWithFirstBatch)
                                { batchId, lot } | null (addBatchToAlive)
                          |
                          v
                createProduct(): Promise<{ id: string; lot: string }>
                  - camino "ya existía": { id: existente, lot: agregado.lot }
                  - camino "nuevo":      { id: creado.id,  lot: creado.lot }
                                                  |
                                                  v
                                    createProductAction devuelve
                                    { status: 'success', id, lot }
                                                  |
                                                  v
                                          ProductForm.save():
                                          en success, guarda `result.lot`
                                          y se lo pasa a onSaved(lot)
                                                                              |
                                                                              v
                                                                    ProductSheet.handleSaved(lot):
                                                                    toast.success(`Producto creado. Lote ${lot}.`)
```

Contrato de `onSaved` cambia de `() => void` a `(lot?: string) => void`: en la EDICIÓN se sigue
llamando sin argumento (no hay lote que nombrar, R9), así que el parámetro es opcional y
`ProductSheet` distingue por `isEdit`, igual que ya distingue `CREATE_SUCCESS`/`UPDATE_SUCCESS`.

**R15 (lote tecleado a mano) se resuelve solo**: `resolveBatchLot()` en `product-prisma.ts` ya
devuelve el lote que terminó escrito, sea el que tecleó la persona (`batch.lot !== null`) o el que
generó el correlativo (`batch.lot === null`, QC-81). El dominio y el aviso no necesitan distinguir
los dos casos: siempre citan el string que la fila terminó llevando, así que el aviso nunca dice
«asignado» cuando en realidad la persona lo escribió — R15 pide precisión en el copy, no en la
lógica, y por eso el texto elegido es neutro: `Producto creado. Lote ${lot}.` (no «Producto creado.
Se asignó el lote ${lot}.», que mentiría cuando el lote vino tecleado).

## 2. Campo fecha de compra (R1-R5)

Nuevo componente `product-batch-date-field.tsx` en `app/(private)/inventario/components/`,
exportado por el barrel de la ruta (`docs/architecture.md > Componentes de ruta`). Usa
`Popover` + `Calendar` (mismas primitivas que `data-table-filter-date.tsx`), en `mode="single"`:

- `selected`: se deriva de un estado local `string` (formato `YYYY-MM-DD`) inicializado con
  `initialValue('purchaseDate', hoyLocalISO())` — la MISMA función `formatDateLocalISO` que ya
  exporta `data-table-filter-date.tsx` calcula "hoy" en hora local (R2). Como es un campo NO
  controlado en el resto del formulario (patrón `defaultValue` de R20), aquí se mantiene un
  `useState` local solo para pintar el calendario y sincronizar un `<input type="hidden" name="purchaseDate">`
  que es lo que de verdad viaja en el `FormData` — mismo mecanismo que usan los selects de
  autocompletado (`PresentationSelect`, `ProductNamePicker`) para convivir con un formulario no
  controlado.
- `disabled={{ after: hoyLocal() }}` — prop nativa de `react-day-picker` para deshabilitar fechas
  futuras (R5): el `Calendar` de shadcn/ui reexporta `DayPicker` completo vía `...props`, así que
  `disabled` llega sin tocar `calendar.tsx`.
- Al abrir el panel de alta, el valor por defecto es "hoy" (R2); un intento fallido anterior
  recupera lo que la persona había seleccionado, igual que los demás campos (mismo patrón
  `initialValue`).
- Multiplataforma: `Popover`/`Calendar` ya se usan en `data-table-filter-date.tsx`, que es táctil
  (usa `PopoverTrigger` con `min-h-11 min-w-11`, sin depender de `hover`) — se reutiliza el mismo
  patrón de trigger. El día seleccionable de `CalendarDayButton` es un `<Button size="icon">`, que
  cumple 44×44px. No hay ningún input de texto libre para la fecha, así que el requisito de
  `font-size >= 16px` no aplica (no hay teclado que dispare zoom en iOS): el trigger es un botón,
  no un `<input>`.

## 3. Ayuda del campo lote (R6, R7)

Solo cambia el `helper` de `ProductField name="lot"` en `product-form.tsx`:

```
"El identificador del lote que trae el proveedor, tal cual viene en el envase.
Déjalo vacío para que el sistema lo asigne."
```

Nada más cambia: sigue siendo `type="text"`, sigue siendo opcional, sigue validando con
`lotSchema` del esquema compartido (R8).

## 4. Contrato de tipos que cambia

```ts
// product-repository.ts (puerto)
createWithFirstBatch(...): Promise<{ id: string; batchId: string; lot: string }>;
addBatchToAlive(...): Promise<{ batchId: string; lot: string } | null>;

// create-product.ts (dominio)
export function createCreateProduct(
  deps: CreateProductDeps,
): (input: unknown, actor: Actor | null | undefined) => Promise<{ id: string; lot: string }>;

// product-actions.ts (driving)
export type CreateProductFormState =
  | { status: 'idle' }
  | { status: 'success'; id: string; lot: string }
  | ErrorState;
```

Ningún tipo de otro módulo se toca. `ProductView` no cambia (sigue sin lote, decisión ya cerrada:
el dato no se relee, viaja por el resultado del alta).

## 5. Alternativas descartadas

1. **Releer el producto tras crearlo (`getProduct`) para obtener el lote, en vez de tocar el
   backend del alta.** Descartado y medido en la tabla de decisiones del `requirements.md`:
   `ProductView` no lleva el lote —solo `latestBatchUnitId`—, así que releer no resuelve nada sin
   ampliar TAMBIÉN `ProductView` y su consulta, que es más superficie que devolver un dato que la
   transacción de escritura ya calculó. Además introduciría una segunda consulta después del alta,
   con una ventana entre "creado" y "leído" que no existe hoy.
2. **Mostrar el lote asignado en una región fija del panel, en vez del `toast` existente.**
   Descartada en la propia tabla de decisiones (fila 4): obligaría a reabrir el comportamiento de
   QC-22 R21 (el panel se cierra al crear) y decidir cuándo se limpia esa región. Se acepta el
   coste explícito: el aviso se va solo.
3. **Formatear la fecha de compra con un input `type="date"` nativo, igual que `expiryDate`.**
   Descartada por decisión humana (tabla, fila 2): aspecto dispar entre navegadores/plataformas y
   el bloqueo de fechas futuras dependería de que el navegador respete `max`, que Safari en iOS no
   siempre hace de forma consistente con el resto. `react-day-picker` ya resuelve navegación por
   teclado, ARIA y el bloqueo declarativo de fechas futuras con `disabled`.
4. **Pedir el lote asignado con un `useEffect` + fetch adicional tras el éxito del formulario, en
   vez de devolverlo en el mismo resultado de la Server Action.** Descartada: añadiría una
   petición de red extra, un estado de carga que pintar entre "guardado" y "lote conocido", y una
   ventana de inconsistencia si esa segunda petición falla — contradice la nota de
   `requirements.md` de que "entre pedir y tener no existe ningún estado intermedio que pintar".
   Devolver el dato en la misma respuesta de la action es la extensión mínima del contrato
   existente.

## 6. Dependencias de terceros

**Ninguna dependencia nueva entra con esta ficha.** `react-day-picker` ya está instalado y
aprobado desde QC-55 (fila en `docs/dependencias.md`), y el componente `components/ui/calendar.tsx`
ya existe. Se reutiliza en modo `single` en vez de `range`; no hace falta instalar, actualizar ni
aprobar nada. No se comprobó ninguna librería adicional porque no hizo falta ninguna: la fecha de
compra ya tenía su vía de escritura en el servidor (QC-81) y el único componente de calendario
que faltaba ya estaba montado por QC-55.

## 7. E2E (R17)

Se **amplía** `e2e/inventario.spec.ts` en vez de crear un archivo propio: ya trae las utilidades
`abrirPanelDeAlta`, `guardarAlta`, `crearPresentacionEnLinea` y el patrón de esperar
`[data-sonner-toast]` (línea 481) que QC-22 dejó listo. Crear un spec nuevo duplicaría el
`beforeAll` de limpieza de huérfanos (líneas 299-318) y el fixture de presentación, sin ganar
aislamiento real: el flujo de alta con lote es el MISMO flujo que el resto del archivo ya recorre,
solo que ahora el aserto final lee el texto del toast (`Producto creado. Lote ...`) en vez de solo
comprobar que aparece. El caso nuevo:

1. Abre el panel de alta (`abrirPanelDeAlta`).
2. Rellena nombre, presentación (existente o creada en línea), existencia, alerta y costo.
3. **No toca la fecha de compra** (queda "hoy" por defecto, R2) ni el lote (queda vacío, para
   probar el correlativo generado — el caso de lote tecleado a mano ya lo cubre, indirectamente,
   la validación de forma existente y no necesita su propio E2E porque no cambia camino de
   servidor).
4. Guarda (`guardarAlta`).
5. Espera el toast y comprueba que su texto **contiene la palabra "Lote"** seguida de un valor no
   vacío — sin fijar el correlativo exacto, porque corre en paralelo con otros proyectos que
   escriben en la misma serie (mismo criterio que `elegirPresentacionExistente`, que filtra por
   `RUN_ID` en vez de "la primera opción").
