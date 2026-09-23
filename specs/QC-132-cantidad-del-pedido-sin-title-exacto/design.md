# QC-132 — cantidad-del-pedido-sin-title-exacto · design.md

> Requisitos: `requirements.md` (R1–R11). Zona frontend, complejidad low.
> **Sin modelo de datos, sin migraciones, sin RLS, sin rutas ni endpoints nuevos, sin integraciones y
> sin dependencias nuevas.** Es un atributo `title` en tres nodos que ya existen.

## 1. Lo medido en el código (2026-09-23)

| Sitio | Archivo y línea | Hoy |
|---|---|---|
| Columna Cantidad de `/pedidos` | `app/(private)/pedidos/components/order-columns.tsx:203` | `cell: (order) => formatDecimalDisplay(order.quantity)`: devuelve una **cadena**, sin nodo propio y sin `title` |
| Cantidad del pedido en ejecución | `app/(private)/asignacion/[id]/components/order-execution-screen.tsx:67-69` | `<p data-testid={ORDER_EXECUTION_ORDER_QUANTITY_TESTID}>Pedido {formatDecimalDisplay(execution.orderQuantity)}</p>`, sin `title` |
| Cantidad de cada línea | `app/(private)/asignacion/[id]/components/order-execution-lines.tsx:77-82` | `<span data-testid={`${ORDER_EXECUTION_LINE_QUANTITY_TESTID}-${index}`}>{formatDecimalDisplay(displayedQuantity)}</span>`, sin `title`; `displayedQuantity` es `line.quantity` o `convertQuantity(...)` según la unidad elegida |

Censo de `formatDecimalDisplay(` en `app/`, `components/` y `lib/` (confirma la decisión 2 del
humano): además de los tres de arriba solo aparecen `catalog-columns.tsx:198,211` y
`order-ingredients-table.tsx:187,194,211` —que ya llevan `title` con `exactDecimalTitle`— y
`order-field.tsx:68`, fuera de alcance. Es la base de la comprobación de R10.

**La tabla compartida no deja poner atributos en el `<td>`.** `DataTableColumn.cell` devuelve
`ReactNode` (`components/shared/data-table/data-table-types.ts:68`) y `data-table.tsx:315` lo pinta
dentro de su propio `TableCell`, sin ninguna vía para pasarle un `title`. Por eso la celda tiene que
devolver un **nodo propio** con el `title`, que es exactamente lo que ya hace
`proveedores/[id]/components/catalog-columns.tsx:197-199` y `210-212`.

## 2. La pieza que se reutiliza (R8)

`lib/shared/ui/decimal-display.ts` **no se toca**:

- `formatDecimalDisplay(value)` — el texto pintado (redondeo a 2 con `BigInt`, sin ceros de relleno).
- `exactDecimalTitle(value)` — `trimDecimal(value)` si difiere de lo pintado; si no, `undefined`.
  React no pinta el atributo cuando vale `undefined`, así que R2, R4 y R6 salen solos, sin ramas en
  la pantalla.

## 3. Cambios por sitio

### 3.1 Columna Cantidad (R1, R2)

```tsx
cell: (order) => (
  <span title={exactDecimalTitle(order.quantity)}>{formatDecimalDisplay(order.quantity)}</span>
),
```

Mismo patrón que `catalog-columns.tsx`. El `textContent` de la celda no cambia (R7): los cuatro
casos existentes de `order-columns.test.tsx:271-295` comparan `container.textContent` con igualdad
exacta y siguen valiendo tal cual (R11). Sin `data-testid` nuevo: el test pinta la celda aislada con
`pintarCelda` y localiza el `span` como `container.firstElementChild`.

**Comentarios (`docs/conventions.md > Comentarios`).** El comentario pegado a esa celda
(`order-columns.tsx:198-202`) cita `R39` y describe la línea que se cambia; se reescribe corto y sin
citas. El bloque de cabecera del archivo (56-66) no se toca: es preexistente y no se arrastra.

### 3.2 Cantidad del pedido en ejecución (R3, R4)

El `title` va **en el `<p>` que ya tiene `ORDER_EXECUTION_ORDER_QUANTITY_TESTID`**, con el valor de
`exactDecimalTitle(execution.orderQuantity)`: solo la cifra, no «Pedido …». El texto sigue siendo
`Pedido <pintado>` (R7) y los casos de QC-147 R26 (`order-execution-screen.test.tsx:114-130`) no
cambian.

### 3.3 Cantidad de cada línea (R5, R6)

El `title` va **en el `span` que ya tiene `${ORDER_EXECUTION_LINE_QUANTITY_TESTID}-${index}`**. En
la unidad propia de la línea —o sin unidad resoluble, donde `displayedQuantity === line.quantity`—
el valor es `exactDecimalTitle(line.quantity)`. Lo que pasa con la línea convertida está en §4.

## 4. Lo que depende de la pregunta abierta 1 (línea convertida)

**El diseño depende de ella y no se resuelve aquí.** La expresión del `title` de §3.3 tiene que decir
algo también cuando el usuario elige otra unidad en el selector, y cualquier expresión que escriba el
implementer **decide la pregunta por la vía de los hechos**. Las tres respuestas posibles, con lo
que cada una implica en código:

| Respuesta del humano | Expresión del `title` | Nota |
|---|---|---|
| a) El valor convertido vale tal cual | `exactDecimalTitle(displayedQuantity)` | Una sola expresión para todos los estados. `convertQuantity` devuelve hasta 12 decimales truncando (`lib/modules/unidades/domain/convert-quantity.ts:179-209`), así que el `title` puede ser `0.333333333333`. |
| b) Hay que acotarlo | — | `exactDecimalTitle` solo sabe comparar con lo pintado; acotar el valor del `title` a N decimales necesita código que hoy no existe, y `decimal-display.ts` está cerrado (R8). Habría que decidir dónde vive y con qué N. **Probablemente saca de `low` esta parte.** |
| c) Sin `title` mientras está convertida | `displayedQuantity === line.quantity ? exactDecimalTitle(line.quantity) : undefined` | El valor exacto solo se ofrece en la unidad en la que se calculó. |

Hasta la respuesta, `tasks.md` deja la task de ese estado **bloqueada** (T4) y el requisito sin
escribir. La recomendación es responderla **en la misma puerta de aprobación del spec**: sin ella, T3
puede cerrar R5 y R6 pero la línea queda con un comportamiento no especificado en el estado
convertido. Si el humano responde (a) o (c), se añade `R12` en una nota fechada al final de
`requirements.md` sin renumerar nada.

## 5. Tests (R9, R11)

Solo tests de componente con Vitest + Testing Library, **añadidos** a los archivos que ya cubren cada
pantalla; ninguna afirmación existente se toca (R11). Afirmaciones con igualdad exacta sobre
`textContent` y `toHaveAttribute('title', <exacto>)` / `not.toHaveAttribute('title')`, que es la
forma que QC-127 fijó.

| Requisito | Archivo | Caso nuevo |
|---|---|---|
| R1, R7 | `tests/unit/pedidos-ui/order-columns.test.tsx` | `quantity: '0.1255'` -> `textContent` `'0.13'` y el `span` con `title` `'0.1255'` |
| R2 | ídem | `quantity: '12.5000'` -> `'12.5'` y **ningún** elemento de la celda con `title` (`container.querySelector('[title]')` es `null`) |
| R3, R7 | `tests/unit/asignaciones-ui/order-execution-screen.test.tsx` | `orderQuantity: '0.1255'` -> el `p` del testid con `textContent` `'Pedido 0.13'` y `title` `'0.1255'` |
| R4 | ídem | `orderQuantity: '200.0000'` -> sin `title` |
| R5, R7 | `tests/unit/asignaciones-ui/order-execution-lines.test.tsx` | línea `quantity: '0.1255'` en su unidad (`alternativeUnits: []`) -> `textContent` `'0.13'`, `title` `'0.1255'`; y el mismo caso con `unit: null` |
| R6 | ídem | línea `quantity: '20'` -> sin `title` |

Los nombres de los casos llevan `QC-132 R<n>` (enlace de trazabilidad, `docs/conventions.md > Tests`).

**Que muerde.** Para R1, R3 y R5 se hace la comprobación de QC-127: quitar temporalmente el `title`
de producción, ver el rojo del caso nuevo y revertir; se anota en el informe.

R8, R10 y R11 no son comportamiento en pantalla: se verifican sobre el diff y con el censo de §1
repetido al cerrar, y se anotan en `progress/impl_QC-132-cantidad-del-pedido-sin-title-exacto.md`.

## 6. Alternativas descartadas

**A. Añadir a `DataTableColumn` una prop `cellTitle` para que la tabla ponga el `title` en el `<td>`.**
Descartada. Toca el componente compartido de QC-55, del que cuelgan todas las tablas del producto,
para algo que `cell: ReactNode` ya resuelve; sería una segunda manera de hacer lo mismo —el mismo
argumento con que `order-columns.tsx` descartó en su día `renderRowActions`—. Además dejaría
`catalog-columns.tsx` con un patrón y `/pedidos` con otro.

**B. Un componente compartido `<ExactDecimal value={…} />` que encapsule `formatDecimalDisplay` +
`exactDecimalTitle`.** Descartada para esta ficha. Con tres usos nuevos y cinco ya escritos a mano,
introducirlo solo aquí deja dos formas conviviendo, y migrar los cinco existentes
(`catalog-columns.tsx`, `order-ingredients-table.tsx`) es alcance que el humano no ha pedido. Si se
quiere, es una ficha propia.

**C. Poner el `title` de la cantidad del pedido en un `span` interior que envuelva solo la cifra.**
Descartada. Obliga a un nodo y un `data-testid` nuevos (o a un selector sin testid en el test) para
lo mismo que da el `<p>` que ya tiene su testid; el `title` contiene solo la cifra en ambos casos.

**D. Una guardia que prohíba `formatDecimalDisplay` sin `exactDecimalTitle` al lado.** Descartada.
El censo es de tres sitios y cabe en una comprobación de cierre (R10); una guardia por texto tendría
que conocer la excepción de `order-field.tsx` y no la ha pedido nadie.

## 7. Riesgos

- **Guardias existentes sobre estos archivos.** `pedidos-convenciones.test.ts` prohíbe coma flotante
  en la ruta de pedidos; `exactDecimalTitle` no la usa. `guard-pantalla-pedidos-se-amplia.test.ts`
  fija los exports de `order-columns.tsx`; no se añade ningún export. `order-execution-lines.test.tsx`
  lee la fuente de su archivo buscando `Number(`, `parseFloat`, `catch`: no aparecen.
- **Solapamiento con QC-133** (`cantidad-del-listado-sin-title-exacto`, `pending`, sin acotar): su
  descripción es el mismo hallazgo que R1–R2 de esta ficha. No es decisión de este spec; se señala al
  leader.
