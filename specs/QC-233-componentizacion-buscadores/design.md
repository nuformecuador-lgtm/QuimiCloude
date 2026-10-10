# QC-233 — componentizacion-buscadores · design

## Lo que ya existe

**Términos buscados:** `autocomplete`, `AsyncAutocomplete`, `picker`, `buscador`, `selector`,
`useAsyncPaginatedOptions`, `excludedIds`, `initialPage`. Busqué en el board (`feature_list.json`), en
`specs/` y en el código.

**Grafo.** El worktree no está indexado; consulté el proyecto del árbol principal (`dev`, la misma
base, con QC-231 ya mergeada) y verifiqué con Grep y Read sobre el worktree.

| Qué apareció | Dónde | Qué se hace |
|---|---|---|
| QC-231 y QC-232 | board | Se reparten el resto de la auditoría (D1). QC-231 ya dejó `Spinner`, `touchTarget` y `ErrorAlert`, que los buscadores ya usan. Las piezas de campo son de QC-232 (D4) |
| `AsyncAutocomplete` (QC-26bis; `defaultInputValue` en QC-156) | `components/shared/async-autocomplete.tsx` | **Se amplía.** Es el núcleo de la ficha. Su API actual no cambia (R16) |
| `useAsyncPaginatedOptions` | `hooks/use-async-paginated-options.ts` | **Se reutiliza tal cual**, con `reset()` incluido. Su contrato público no cambia |
| Primitivos `Autocomplete*` (Base UI) | `components/ui/autocomplete.tsx` | No se tocan |
| Los cinco buscadores que reimplementan la composición | ver `requirements.md > Alcance` | **Pasan a delegar** (R6) |
| `OrderCustomerPicker`, el único consumidor de hoy | `app/(private)/pedidos/components/order-customer-picker.tsx` | **No se toca** (R21) |
| QC-35 `design.md > 9.1`: «No se promueve `ProductPicker`… Se comparte el patrón, no el archivo» | `specs/QC-35-pantalla-de-pedidos/design.md:398-400` | Lo deja sin efecto esta ficha. Enmienda pendiente de P3 (R23) |
| QC-71 R17 (Opción B): el canal `error` de los buscadores aplana a `string`, y llevar el `ErrorState` entero es «candidato a ficha propia» | `specs/QC-71-identificador-de-request/requirements.md:143-156` y `guard-identificador-de-request.test.ts:677-725` | **Se respeta**: el `throw new Error(...)` sigue en cada buscador (R11, R18, P4) |
| Paridad del árbol accesible de QC-231 | `tests/unit/paridad/arbol-accesible.ts` | **Se reutiliza**. Ya incluye los portales (`document.body`) |
| QC-26 R28 / QC-35 R31: nada de recortar por texto en cliente | `recipe-route-contract.test.ts:874-886` y comentarios de los buscadores | Se mantiene (R19) |

**Choques con features en vuelo.** Ver §5 y la P1.

## 1. Principio

Igual que QC-231: **cero cambio** (D2).

- `AsyncAutocomplete` reproduce **el marcado exacto** de cada buscador. Las diferencias entre sitios
  entran por props.
- Lo que sale de los cinco archivos es lo que es **igual** en todos: el estado `open`, la llamada al
  hook, el manejador de scroll, el cálculo de «cargando» y el bloque del desplegable (lista, vacío,
  error, carga y «hay más»).
- Lo que es **de cada uno** se queda donde está (R18).

El «antes» se congela en la tanda 0, antes de tocar producción, y no se regenera.

**Modelo de datos, RLS y migraciones:** ninguno. **Rutas, Server Actions e integraciones:** ninguna
nueva ni cambiada. **Dependencias:** ninguna nueva (R22).

## 2. Inventario de los seis buscadores

| | `AsyncAutocomplete` (de `OrderCustomerPicker`) | `ProductPicker` | `RecipePicker` | `PackagingSelect` | `ProductNamePicker` | `PresentationSelect` |
|---|---|---|---|---|---|---|
| Server Action | `searchOrderCustomersAction` | `listProductsAction` | `listRecipesAction` | `listProductsAction` | `listProductsAction` | `listPresentationsAction` |
| `pageSize` | 10 (defecto) | `MAX_PAGE_SIZE` | `MAX_PAGE_SIZE` | `MAX_PAGE_SIZE` | `MAX_PAGE_SIZE` | `MAX_PAGE_SIZE` |
| Primera página precargada | no | `initialPage` | `initialPage` | no | no | no |
| Exclusión | no | `excludedIds`, salvo `value` | no | no | no | no; antepone las creadas en línea sin repetir (`seleccionables`) |
| Reinicio | no | no (cambia `productType` sin reset) | no | no | sí, al cambiar `productType` | no (se remonta con `key`) |
| Texto del campo | no controlado (`query` = lo escrito) | `draft ?? label` | `draft ?? selectedName` | `draft ?? optionLabel(selected)` | `draft ?? name` | `draft ?? selectedName` |
| Término buscado | lo escrito | `draft ?? ''` | `draft ?? ''` | `draft ?? ''` | `draft ?? ''` | `draft ?? ''` |
| Error de carga | texto fijo dentro de la región de estado | `<p role=alert>` con el mensaje del servidor | ídem | `ErrorAlert as="p"` con su `failure` | ídem `ProductPicker` | ídem `ProductPicker` |
| Opción no elegible | no | no | no | `presentationContent == null` | no | `requireContent && content === null` |
| Borrar | siempre | no | con `aria-label` y testid | con `aria-label` y `touchTarget` | no | con `aria-label` y testid |
| Consulta desactivada | `disabled` | — | — | sin permiso | — | — |
| «Hay más» | no | `sr-only` | no | no | no | no |
| Alto máximo | 288 | 256 | 256 | 256 | 256 | 256 |

Las clases, testids y textos exactos de cada celda los fija la paridad de T0. Esta tabla es el mapa,
no la fuente de verdad.

## 3. Contrato ampliado de `AsyncAutocomplete`

Todo es **aditivo y opcional**. Sin ninguna prop nueva, el componente pinta y hace lo de hoy (R16, R17).

```ts
type AsyncAutocompleteProps<T> = {
  // --- lo de hoy, sin cambios ---
  readonly fetchPage: FetchOptionsPage<T>;
  readonly getOptionLabel: (option: T) => string;
  readonly getOptionKey?: (option: T) => string;
  readonly onSelect?: (option: T | null) => void;
  readonly renderOption?: (option: T) => ReactNode;
  readonly pageSize?: number;
  readonly debounceMs?: number;
  readonly maxHeight?: number;            // defecto 288
  readonly scrollThreshold?: number;      // defecto 48
  readonly placeholder?: string;
  readonly emptyMessage?: string;
  readonly disabled?: boolean;
  readonly id?: string;
  readonly name?: string;
  readonly defaultInputValue?: string;
  readonly className?: string;
  readonly 'aria-label'?: string;
  readonly 'aria-invalid'?: boolean;
  readonly 'aria-describedby'?: string;

  // --- nuevo ---
  /** Presentación (R17). 'combined' = la de hoy (defecto). 'split' = la de los cinco buscadores. */
  readonly layout?: 'combined' | 'split';
  /** Texto controlado (R12). Si viene, el campo muestra `inputValue` y busca con `searchQuery`. */
  readonly inputValue?: string;
  readonly searchQuery?: string;
  readonly onInputValueChange?: (next: string) => void;
  /** R8. Página 1 sin búsqueda: se devuelve sin llamar a `fetchPage`. */
  readonly initialPage?: { readonly items: readonly T[]; readonly totalPages: number };
  /** R9. Claves que no se ofrecen; `keepKey` es la elección vigente, que nunca se aparta. */
  readonly excludedKeys?: readonly string[];
  readonly keepKey?: string;
  /** Opciones que van delante, sin repetir las que trae la consulta (las creadas en línea). */
  readonly leadingOptions?: readonly T[];
  /** R10. Al cambiar, `reset()` del hook. */
  readonly resetKey?: string;
  /** R15. `false` no consulta (p. ej. sin permiso). Se combina con `open && !disabled`. */
  readonly queryEnabled?: boolean;
  /** R13. Opción pintada deshabilitada y que no se elige. */
  readonly isOptionDisabled?: (option: T) => boolean;
  /** R11. Defecto 'combined': el texto fijo de hoy. Defecto 'split': el mensaje del servidor (`cause`). */
  readonly renderLoadError?: (error: Error) => ReactNode;
  /** Oculta el vacío (PackagingSelect sin permiso). */
  readonly showEmpty?: boolean;
  /** Marcado por sitio (R16): testids, clases y textos. */
  readonly slots?: AsyncAutocompleteSlots;
};
```

`AsyncAutocompleteSlots` reúne, todos opcionales:
- `inputTestId`, `inputClassName`, `aria-labelledby`;
- `clear`: `false`, o `{ label, testId, className }`;
- `contentClassName`, `popupTestId`;
- `optionTestId`, `optionClassName`, `optionDataAttrs(option)`;
- `emptyTestId`, `loadErrorTestId`, `loadingTestId`, `loadingLabel`;
- `hasMore`: `{ testId, label }`.

El implementer puede reorganizarlos, siempre que la paridad pase sin regenerarse.

**Cómo se resuelve por dentro.**

- **Hooks antes de cualquier `return`.** El componente llama a `useAsyncPaginatedOptions` con:
  - `query`: `searchQuery ?? query`;
  - `enabled`: `open && !disabled && queryEnabled !== false`.

  El `fetchPage` que le pasa envuelve el del consumidor con el atajo de `initialPage`, con la misma
  condición de hoy: `page === 1 && query.trim() === ''` (R8).
- **Reinicio** con el patrón de `ProductNamePicker`, que es comparar en el render y no un efecto:
  si `resetKey` difiere del último visto, se guarda y se llama a `reset()` (R10).
- **Opciones visibles:** `leadingOptions` sin repetir, más `items`, menos `excludedKeys` salvo
  `keepKey`. Se escribe con `flatMap`, nunca con `.filter(`, por el mismo veto de fuente que ya tiene
  `ProductPicker` (R19).
- **Elegir:**
  - si `isOptionDisabled(option)`, no se hace nada (R13);
  - si no, en el **mismo `onClick`** del item, en este orden: en modo controlado `onSelect(option)`
    y después `setOpen(false)`; en modo no controlado, el orden de hoy (R14).

  `RecipePicker` actualiza su `selectedNameRef` dentro de su `onSelect`, antes de que el primitivo
  dispare `onValueChange`. Ese es el motivo de R14.
- **Texto del campo:**
  - **en modo controlado**, `value={inputValue}` y `onValueChange={onInputValueChange}`. La regla de
    cuándo se retira una elección la aplica el consumidor en su manejador (R18);
  - **en modo no controlado**, lo de hoy: `setQuery`, `onSelect(null)` al vaciar y el input oculto
    con `name`.
- **`layout`:**
  - `'combined'` pinta exactamente el JSX de hoy (`async-autocomplete.tsx:148-220`);
  - `'split'` pinta exactamente el bloque común de los cinco (`product-picker.tsx:262-344` como
    referencia), con sus variaciones por `slots`.

## 4. Cómo queda cada buscador

Cada uno conserva su archivo, sus exports y sus props (R5). Por dentro, el `<Autocomplete …>`, el
`useAsyncPaginatedOptions`, el `handleScroll`, el `cargando` y el `mensajeDeFallo` se sustituyen por
`<AsyncAutocomplete layout="split" …/>`.

| Buscador | Qué se queda en su archivo | Props nuevas que usa |
|---|---|---|
| `ProductPicker` | `pedirPagina` (sin el atajo de la página 1, que pasa a `initialPage`), `draft`, el `div` envoltorio, el error del campo | `initialPage`, `excludedKeys` + `keepKey={value}`, `hasMore`, `inputValue`/`searchQuery` |
| `RecipePicker` | `pedirPagina`, `selectedId`/`selectedName`/`selectedNameRef`, la regla «escribir otra cosa retira», el input oculto `recipeId`, la etiqueta y el error | `initialPage`, `clear` |
| `PackagingSelect` | `fetchPage` con su `failure`, `forbidden` y `unexpectedFromRejection`, `selected`, la etiqueta y el aviso de permiso | `queryEnabled={!forbidden}`, `showEmpty={!forbidden}`, `isOptionDisabled`, `renderLoadError` → `ErrorAlert`, `renderOption`, `clear` |
| `ProductNamePicker` | `pedirPagina`, `name`/`draft`, el input espejo `sr-only` con `required`, la etiqueta y el error | `resetKey={productType}` |
| `PresentationSelect` | `pedirPagina`, la resolución de `defaultLabel` (efecto), la selección, `created`, la ayuda, el input espejo, el error y **todo** el alta en línea | `leadingOptions` (las creadas que pasan `unitIds`), `isOptionDisabled`, `renderOption`, `clear` |

**Qué pasa con algunos detalles:**

- **Los ids y `aria-*`.** El `id` del input, `aria-labelledby` y `aria-describedby` se pasan tal cual.
  El `inputId` de `ProductNamePicker` y `PresentationSelect` lo sigue generando cada uno, porque el
  input espejo le reenvía el foco.
- **Los `throw new Error(...)`** de cada `fetchPage` se quedan en su archivo. Así
  `SUPERFICIES_QUE_APLANAN`, de `guard-identificador-de-request`, sigue contando una ocurrencia por
  archivo (R4, P4).
- **`PackagingSelect` conserva `UNEXPECTED_ERROR_CODE`** en `unexpectedFromRejection`. Sigue en
  `USOS_SOLO_LOGICA` de `guard-piezas-base`, sin tocar la guardia.
- **Los comentarios de cabecera** que describen el mecanismo, y que dejan de ser ciertos en el archivo,
  se recortan a lo que el archivo sigue haciendo (`docs/conventions.md > Comentarios`). Va en un
  commit `chore(QC-233): limpia comentarios de <archivo>` aparte cuando abulte.

## 5. Lo que no se toca y choques con otras features

**QC-223 (Christian, en curso).** QC-231 identificó sus archivos (`specs/QC-231-…/requirements.md >
Archivos D11`):
- `inventario/components/batch-history.tsx`;
- de `pedidos/components/`: `index.ts`, `order-columns.tsx`, `order-list-section.tsx`,
  `order-sheet.tsx` y `order-table.tsx`.

Ninguno está en `tasks.md > Archivos esperados`. Cuatro de ellos importan `type RecipePickerPage` de
`./recipe-picker`. R5 lo conserva, así que no tienen que cambiar.

**Riesgo sin verificar (P1).** No pude leer la rama remota de QC-223 (sin shell en este agente).

- Su ficha elige cliente en el panel de entrega, así que es probable que consuma `OrderCustomerPicker`
  o `AsyncAutocomplete`. Consumirlo no choca: R16 y R21 lo dejan igual. Lo que chocaría es que lo
  **edite**.
- El leader lo comprueba antes de aprobar el spec (P1).
- Si QC-223 crea un buscador nuevo sobre los primitivos y se mergea antes, la guardia de R20 se
  pondrá roja tras sincronizar con `dev`. Qué hacer entonces lo decide P2.

**QC-96 (Christian, en revisión).** Su `tasks.md:36-40` declara que **no** toca `app/(private)/**` ni
`components/**`. No hay choque. R21 prohíbe además `app/(public)/**`.

**QC-232 (pendiente, sin spec).** Las piezas de campo, los selects no asíncronos, los formularios, los
borrados y las acciones por fila son suyos (D4). QC-233 no crea ninguna pieza de campo. Los `<p>` de
error del campo de los buscadores se quedan idénticos, y QC-232 los adoptará cuando cree su pieza.

**`OrderCustomerPicker`.** No se toca (R21). Su comportamiento lo garantiza que la API actual de
`AsyncAutocomplete` no cambia, y lo prueban sus tests y su paridad.

## 6. Guardias y contratos que ya leen estos archivos

Ninguno se edita (R4). Siguen en verde por lo que dice la última columna.

| Guardia o test | Qué mira | Por qué sigue verde |
|---|---|---|
| `guard-identificador-de-request` | Un `throw new Error` por buscador, y `set-estado-string` en `presentation-select` | La consulta y su rechazo se quedan en cada archivo (§4) |
| `recipe-route-contract.test.ts:874-886` | `product-picker.tsx` sin `.filter(` y con `MAX_PAGE_SIZE` importado | `pageSize={MAX_PAGE_SIZE}` sigue en el archivo; ni él ni `AsyncAutocomplete` usan `.filter(` |
| `inventario/module-contract.test.ts:266-288` | El mapeo de `listProductsAction` a opciones en `product-name-picker.tsx` | El mapeo se queda (R18) |
| `guard-pantalla-pedidos-se-amplia` | Los exports anclados de `recipe-picker.tsx` | R5 |
| `guard-piezas-base` | `packaging-select` en `USOS_SOLO_LOGICA` y `OPTION_TOUCH_CLASSES` de `order-customer-picker` | Ninguno de los dos se mueve. `AsyncAutocomplete` usa `touchTarget`, no el par literal |
| `guard-catalogo-de-errores` | Muestras con la ruta de `presentation-select.tsx` | Son textos sintéticos y no leen el archivo |
| `inventario/scope.test.ts`, `recetas/scope.test.ts`, `guard-herencia-armazon-privado` | Barridos por nombre y exclusiones por ruta | Ningún archivo cambia de ruta |
| `guard-teclear-y-plazo` | `async-autocomplete.test.tsx` como excepción declarada | Ese test no se edita |

Si alguna se pusiera roja, eso es una señal de que algo cambió, no de que haya que editarla: se para
y se pregunta al leader.

## 7. Guardia nueva (R7, R20)

`tests/guards/guard-buscadores.test.ts`, estática y con el compilador de TypeScript, como
`guard-piezas-base`. Recorre los archivos de producción de `app/`, `components/` y `hooks/` y tiene
dos reglas:

1. **`primitivo-fuera`:** un `import` desde `@/components/ui/autocomplete`.
2. **`hook-fuera`:** una llamada a `useAsyncPaginatedOptions`.

**Excepciones con nombre**, cerradas y cada una con su motivo:

| Archivo | Reglas | Motivo |
|---|---|---|
| `components/shared/async-autocomplete.tsx` | las dos | Es el único compositor |
| `components/ui/autocomplete.tsx` | `primitivo-fuera` | Es la definición de los primitivos, no un consumidor |
| `hooks/use-async-paginated-options.ts` | `hook-fuera` | Es la definición del hook |

**Más casos de la guardia:**
- Una excepción que apunta a un archivo que ya no existe es un hallazgo.
- Hay una muestra que muerde por regla, con código sintético que importa el primitivo y llama al
  hook.
- **Por diff contra el merge-base con `origin/dev`, y solo en la rama de QC-233** (fuera hace `skip`
  ruidoso, como `guard-piezas-base`), comprueba R21 y R22:
  - el diff no toca los archivos de QC-223, `order-customer-picker.tsx`, los barrels de ruta ni
    `app/(public)/**`;
  - el diff no edita los tests ni las guardias que R4 enumera, ni los snapshots de paridad de
    QC-231;
  - `package.json` no gana dependencias.

## 8. Cómo se demuestra el «cero cambio» (R1-R4, D6)

1. **Paridad del árbol accesible, en la tanda 0** y antes de tocar producción:
   `tests/unit/paridad/buscadores-paridad.test.tsx`, con el helper de QC-231.
   - **Qué cubre:** un `describe` por buscador, y en cada uno los estados del desplegable que le
     aplican (`requirements.md > Glosario`).
   - **Cómo abre el desplegable:** con `userEvent` (`tests/helpers/user-event.ts`), el mismo de
     los tests de los buscadores.
   - **Qué se simula:** las Server Actions, con los mocks de esos tests. Para «cargando» se usa
     `nuncaResuelve()` del helper.
   - **Qué se serializa:** `document.body` entero, para que entre el portal del desplegable.
   - **Qué más se congela, por estado:** las llamadas a la Server Action, es decir, cuántas y con
     qué argumentos. Así R2 y R8 también quedan congelados.
   - **Commits:** los snapshots se commitean solos en `test(QC-233): congela la paridad de los
     buscadores` y **no se regeneran**. El reviewer lo comprueba con `git log --follow`.
2. **Los tests que ya existen** pasan sin editarse (R4). Las paridades de QC-231 (pedidos,
   inventario, recetas, proveedores) también, sin regenerarse.
3. **E2E en CI**, sin editarse: los 16 specs de `e2e/` (más `e2e/helpers/order-distribution.ts`) que
   usan los testids de los buscadores (por
   ejemplo `pedidos.spec.ts`, `inventario.spec.ts`, `envases-del-pedido.spec.ts`,
   `versiones-de-receta.spec.ts`, `proveedores.spec.ts` y `pedido-con-cliente.spec.ts`).
4. **Capturas** (R3).
   - **Por qué hacen falta nuevas:** `_trabajo/marca/capturas-antes/` no tiene ningún buscador con el
     desplegable abierto.
   - **Antes:** en la tanda 0, desde `dev` y con el seed demo de QC-230, en
     `_trabajo/marca/capturas-antes-buscadores/`. Para cada buscador: cerrado con elección, abierto
     con filas, vacío y, donde aplique, la opción no elegible. En claro, oscuro y móvil, como las de
     QC-231.
   - **Después:** las mismas, en `_trabajo/marca/capturas-despues-buscadores/`.
   - Las dos carpetas quedan sin versionar. El reviewer compara las parejas en
     `progress/review_QC-233-….md`.

## 9. Enmiendas a specs cerrados

| Spec | Qué | Dónde |
|---|---|---|
| QC-35 | §9.1 «No se promueve `ProductPicker`»: queda sin efecto, porque desde QC-233 todos los buscadores comparten `AsyncAutocomplete` | Una línea fechada bajo §9.1. **Pendiente de P3** |
| QC-71 | **Sin enmienda.** R17 (Opción B) sigue igual (P4) | — |
| QC-26, QC-44, QC-156 | **Sin enmienda.** Sus contratos de comportamiento no cambian | — |

## 10. Multiplataforma

No hay cambios de estilo: las clases de cada sitio pasan tal cual, y la paridad lo demuestra.
`touchTarget` y los 16 px (`text-base md:text-base`) se conservan donde ya estaban. No hay `100vh`,
`:hover` ni librerías nuevas.

## 11. Riesgos

- **`tailwind-merge` en los primitivos.** Si un primitivo combina con `cn(...)`, el orden en que
  lleguen las clases puede cambiar cuál gana. Se pasan las mismas cadenas, en la misma posición que
  hoy, y la paridad de clases lo detecta.
- **El orden de eventos al elegir (R14).** Si `onSelect` se llamara después del `onValueChange` del
  primitivo, `RecipePicker` retiraría la elección. Lo cubren el test de `RecipePicker`, que no se
  edita, el caso de R14 del test nuevo y los E2E de pedidos.
- **El `useMemo` y la identidad del `fetchPage`.** El envoltorio del atajo de `initialPage` es una
  función nueva por render. El hook la guarda en un ref, así que no reinicia la consulta por
  identidad. No cambia nada.
- **QC-223 (P1, P2).** Ver §5. Si se mergea antes de cerrar, se sincroniza con `dev` y la paridad se
  vuelve a pasar **sin regenerar**. Si sus cambios alteran una pantalla con buscador, se regenera
  solo esa paridad, sobre el `dev` nuevo y antes de la tanda 2, y se anota.
- **Volumen.** Son 6 archivos de producción; la auditoría estima unas 2.000 líneas entre los seis
  buscadores. Es poco archivo y mucho marcado. Por eso la paridad se congela por estado del
  desplegable y no por pantalla.

## 12. Alternativas descartadas

**A1. Unificar el marcado: los cinco adoptan la presentación de `AsyncAutocomplete`, o al revés.**
- **A favor:** un solo `layout` y menos props.
- **Por qué no:** cambia lo que se ve. Por ejemplo, el icono de búsqueda, el `px-8`, el alto de 288 o
  256 y el error dentro de la región de estado o en lugar de la lista. Contradice D2.
- **Qué queda:** es trabajo de QC-227, que parte de una sola pieza con dos `layout`.

**A2. Un componente nuevo (`AsyncPicker`) para los cinco, junto a `AsyncAutocomplete`.**
- **A favor:** no toca el componente que ya usa `OrderCustomerPicker`.
- **Por qué no:** deja dos compositores de los mismos primitivos, que es justo lo que la ficha
  quiere quitar («unificados sobre `AsyncAutocomplete`»). La guardia necesitaría una excepción
  permanente.

**A3. Solo un hook sin marcado (`useAsyncAutocomplete`), y cada buscador conserva su JSX.**
- **A favor:** el riesgo de paridad es mínimo.
- **Por qué no:** el bloque del desplegable, unas 80 líneas por archivo, seguiría copiado cinco
  veces. La auditoría cuenta la duplicación en el marcado, no solo en el estado.

**A4. Mover la consulta (Server Action y mapeo) a `AsyncAutocomplete`, con un «tipo de catálogo».**
- **Por qué no:** `components/shared/` pasaría a conocer cuatro módulos. Además rompería tres
  guardias que leen la consulta en el archivo de cada buscador (§6), y metería lógica de dominio en
  un compuesto de UI.

**A5. Llevar el `ErrorState` entero al canal de error (QC-71, Opción A).**
- **Por qué no:** es un cambio de comportamiento (D2), y QC-71 ya lo dejó como ficha propia (P4).

## 13. Mapa R → test previsto

| R | Test |
|---|---|
| R1, R2 | `tests/unit/paridad/buscadores-paridad.test.tsx`, con el árbol y las llamadas por estado |
| R3 | Revisión: `progress/review_QC-233-….md > Capturas` |
| R4 | Suite en CI (`gate-completo`) y el caso de diff de `guard-buscadores`, que comprueba que no se editaron los tests de R4 |
| R5 | `pnpm run typecheck` sin tocar consumidores ni barrels, y el caso de diff de `guard-buscadores` |
| R6, R7, R20 | `tests/guards/guard-buscadores.test.ts` |
| R8-R17 | `tests/unit/shared-ui/async-autocomplete-ampliado.test.tsx`, un caso por R. R16 también con `tests/unit/async-autocomplete.test.tsx`, sin editar |
| R18 | `guard-identificador-de-request`, `inventario/module-contract` y `recipe-route-contract`, sin editar |
| R19 | `recipe-route-contract.test.ts:874-886`, sin editar, y un caso de `guard-buscadores` que prohíbe `.filter(` en `async-autocomplete.tsx` |
| R21, R22 | El caso de diff de `guard-buscadores` y `guard-dependencias-aprobadas`, sin cambios |
| R23 | Revisión de `specs/QC-35-pantalla-de-pedidos/design.md` (si P3 es sí) |
