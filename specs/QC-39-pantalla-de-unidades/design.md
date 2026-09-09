# QC-39 — pantalla-de-unidades · design.md

La capa visual del catálogo de unidades sobre un backend que ya está construido (QC-32, QC-57,
QC-76, QC-38) y sobre la pantalla hermana que ya está mergeada (QC-45). Este documento fija **qué
se hereda**, **qué se añade**, **los archivos ajenos que se tocan y por qué**, y las alternativas
descartadas. Las decisiones de producto las cerró el humano el 2026-09-08
(`requirements.md > Decisiones cerradas`); aquí solo va su detalle técnico.

**Resumen de una línea:** es QC-45 con dos columnas más y dos campos más… **salvo por una cosa que
QC-45 no tuvo que hacer**: la pantalla necesita datos que el módulo hoy no devuelve, así que esta
ficha entra —con bisturí— en `lib/modules/unidades/` para ampliar la **proyección** y el **tipo de
lectura**, y para **abrir el parámetro** de la Server Action de consulta. Todo lo demás se copia de
la hermana.

## 0. Estado real del repo (verificado en el worktree, no supuesto)

Comprobado en `.worktrees/QC-39-pantalla-de-unidades/` el 2026-09-08, **antes** de escribir este
diseño:

| Hecho | Evidencia |
| --- | --- |
| La pantalla hermana existe entera y mergeada: página, sección, tabla, panel, diálogo, params | `app/(private)/configuracion/presentaciones/**` |
| La sección **Configuración** ya existe, con **un** ítem | `lib/shared/navigation/private-nav.ts:104-108`, `:272-280` |
| `PRESENTATIONS_ROUTE` vive en `lib/shared/routes.ts` y está en `PRIVATE_ROUTE_PREFIXES`; el comentario deja escrito que **QC-39 declara su hermana `/configuracion/unidades`** | `lib/shared/routes.ts:79-86`, `:112-115` |
| `NavLink.permission` es **obligatorio** y es **una sola cadena** (no un array) | `private-nav.ts:133-176` |
| `filterNavItemsByPermissions` compara **pertenencia exacta** del único código del ítem | `private-nav.ts:334-355` |
| `requirePagePermission(code)` toma **un** código; una página puede llamarlo **varias veces** y la guardia recorre **todos** los códigos que encuentra | `require-page-permission.ts:48-52`, `guard-pantallas-exigen-permiso.test.ts:155-180` |
| `SEED_ROLE_PERMISSIONS`: el Administrador tiene `unidades.consultar` **y** `unidades.modificar`; el Operador tiene **solo** `inventario.consultar` | `lib/modules/identity/domain/permissions.ts:104-119` |
| **`UnitRef` = `{ id, name, symbol }`** y nada más | `lib/modules/unidades/domain/unit-catalog.ts:8-12` |
| **`UNIT_SELECT = { id, name, symbol }`**: ni `baseUnitId`, ni `factor`, ni `companyId` | `adapters/driven/persistence/unit-prisma.ts:26` |
| `UnitRepository.listAll` / `listPage` devuelven `UnitRef` / `Page<UnitRef>` | `ports/unit-repository.ts:28-35` |
| `listUnits(input, actor)` **ya acepta la consulta** y discrimina por la forma de la entrada; `ListUnits` está **sobrecargada** | `domain/list-units.ts:61-64`, `:104-130` |
| `listUnitsAction()` **no acepta parámetros** y pide `listUnits(undefined, actor)`; deja escrito «**quien abre la puerta al contrato aquí es QC-39**» | `adapters/driving/unit-actions.ts:58-78` |
| Las **tres** Server Actions de escritura existen y devuelven estado serializable | `unit-actions.ts:90-172` |
| `UNIT_QUERYABLE = { sortable: ['name','symbol','createdAt'], filterable: {}, searchable: true }` | `domain/unit-queryable.ts:15-19` |
| La búsqueda va contra `nameNormalized` **y solo contra eso**; el ámbito (`companyId = X OR NULL`) y el desempate por `id` viven en el adaptador | `unit-prisma.ts:116-124`, `:40` |
| Los ocho códigos de error estables del módulo: `unauthorized`, `invalid_input`, `not_found`, `system_unit`, `duplicate_name`, `duplicate_symbol`, `invalid_derivation`, `unit_in_use` | `domain/errors.ts` |
| El modelo Prisma `Unit` **no declara ninguna relación**: `baseUnitId` es un escalar `@db.Uuid`, sin `@relation` ni back-relation | `db/schema.prisma:612-626` |
| `factor` es `Decimal? @db.Decimal(14,4)`; el dominio trata los decimales **como texto** en todo el módulo | `schema.prisma:619`, `domain/convert-quantity.ts:39-43`, `domain/unit-input.ts:57-64` |
| El barrel de `unidades` es **client-safe** y ya publica `isUnitPage`, `UnitListResult`, `Page`, `UNIT_QUERYABLE`, `sanitizeListQuery` «que es lo que **QC-39** necesita» | `lib/modules/unidades/index.ts:59-78` |
| Los esquemas de entrada (`createUnitSchema` / `updateUnitSchema`) **NO** salen del barrel | `index.ts` completo: no aparecen |
| Consumidores actuales de `listUnitsAction()` (sin argumentos): formulario de recetas y detalle de proveedor | `app/(private)/produccion/formulas/**`, `app/(private)/proveedores/[id]/**` |
| Primitivas presentes: `table`, `sheet`, `alert-dialog`, `select`, `input`, `label`, `button`, `sonner`, `skeleton`… | `components/ui/` |
| Playwright montado; helper de viewport para tests | `e2e/`, `tests/helpers/viewport.ts` |

**Conclusión operativa.** No falta nada por construir salvo la pantalla **y los seis retoques de
lectura** de `§2`. Layout, sidebar, `<Toaster />`, tabla compartida, sección Configuración,
filtrado del menú y primitivas **se heredan y no se re-crean** (R47): por eso `tasks.md` abre con
**T0**. **No hace falta correr `shadcn add`**: todas las primitivas ya están.

## 1. Archivos: qué se crea y qué se toca

```
lib/shared/routes.ts                              # EDITA: UNITS_ROUTE + su prefijo privado (R8, R13)
lib/shared/navigation/private-nav.ts              # EDITA: etiqueta e ítem de Unidades (R9, R10)

lib/modules/unidades/domain/unit-view.ts          # NUEVO: el tipo de lectura ampliado (R1, R2)
lib/modules/unidades/domain/list-units.ts         # EDITA: SOLO tipos de retorno UnitRef -> UnitView
lib/modules/unidades/ports/unit-repository.ts     # EDITA: SOLO tipos de retorno UnitRef -> UnitView
lib/modules/unidades/adapters/driven/persistence/unit-prisma.ts
                                                  # EDITA: UNIT_SELECT + toUnitView (R1, R2)
lib/modules/unidades/index.ts                     # EDITA: publica `type UnitView` (R1)
lib/modules/unidades/adapters/driving/unit-actions.ts
                                                  # EDITA: listUnitsAction acepta la consulta (R5)

app/(private)/configuracion/unidades/
  page.tsx                                        # NUEVO. Server Component: los DOS requirePagePermission + metadata + searchParams + Suspense
  components/
    index.ts                                      # NUEVO. Barrel de la ruta (R43)
    unit-list-params.ts                           # NUEVO. Parser/serializador puros de la URL (R23)
    unit-equivalence.ts                           # NUEVO. Funciones PURAS: frase de equivalencia y formato del factor (R17)
    unit-list-section.tsx                         # NUEVO. Server Component async: las DOS lecturas (§5.3)
    unit-table.tsx                                # NUEVO. Cliente: monta <DataTable/> (R15)
    unit-columns.tsx                              # NUEVO. Cliente: las CUATRO columnas (R16, R31)
    unit-row-actions.tsx                          # NUEVO. Cliente: editar + borrar, o nada (R28, R29)
    unit-list-skeleton.tsx                        # NUEVO. Estado cargando (R25)
    unit-list-empty.tsx                           # NUEVO. Estado vacío de búsqueda (R24)
    unit-list-error.tsx                           # NUEVO. Estado error + reintento (R26)
    unit-sheet.tsx                                # NUEVO. Cliente: panel lateral de alta/edición (R32)
    unit-form.tsx                                 # NUEVO. Cliente: los CUATRO campos (R33, R34, R37)
    delete-unit-dialog.tsx                        # NUEVO. Cliente: confirmación + errores (R40-R42)
```

**Los archivos ajenos que se editan son exactamente los que R47 autoriza y no uno más.** Cualquier
otro que una task pida abrir es señal de **parar y avisar al leader**. En particular: **no se
tocan** `components/shared/data-table/**` (R31), `components/ui/**` (R45),
`app/(private)/layout.tsx` (ya filtra el menú desde QC-75), `AppSidebar`, `db/schema.prisma`, ni
`unit-catalog-prisma.ts` (`findRefs`, R3), ni ninguno de los ocho archivos de `domain/` que
implementan alta, edición, borrado, conversión, errores, permisos o esquemas de entrada.

**Conflicto de archivos con otras features en curso:** `lib/shared/routes.ts`,
`lib/shared/navigation/private-nav.ts` y **todo `lib/modules/unidades/`** son los puntos calientes.
Se declaran aquí para que el leader vigile el paralelismo (`AGENTS.md > Paralelismo`). El tercero es
nuevo respecto a QC-45 y es el que hay que mirar antes de arrancar otra ficha de unidades.

## 2. La ampliación del contrato de lectura (R1-R6) — la parte de riesgo

Es el motivo por el que esta ficha existe: la lista tiene que pintar **equivalencia** y saber si una
unidad es **de sistema**, y hoy la consulta devuelve tres campos. Se amplía en **seis** archivos, y
ni uno más.

### 2.1 Un tipo NUEVO, no un `UnitRef` más gordo

```ts
// lib/modules/unidades/domain/unit-view.ts  (NUEVO)
export type UnitView = UnitRef & {
  readonly baseUnitId: UnitId | null;
  readonly factor: string | null;   // texto decimal, NUNCA number
  readonly isSystem: boolean;
};
```

Tres decisiones dentro de esas cinco líneas:

1. **No se toca `UnitRef`.** `UnitRef` es «lo que otro módulo puede saber de una unidad sin tocar su
   tabla», y lo devuelve también `UnitCatalog.findRefs`, que implementa `unit-catalog-prisma.ts`
   para `recetas`. Ensancharlo obligaría a ampliar **esa otra** proyección y a arrastrar la ficha
   hasta `recetas` (R3). `UnitView` **extiende** `UnitRef`, así que todo lo tipado como `UnitRef`
   sigue compilando y sigue recibiendo lo que espera (R4).
2. **`factor` viaja como texto** (`string | null`), como ya hacen `UnitConversion` y el esquema de
   entrada. El adaptador convierte el `Decimal` de Prisma con `.toString()`; la **canonicalización
   visible** —quitar los ceros de relleno de `1000.0000`— se hace igualmente en la función pura de
   `§4`, para no depender del comportamiento de `decimal.js` (R17).
3. **`isSystem: boolean`, no `companyId`.** La pantalla necesita saber si la fila lleva acciones
   (R29), no de quién es la unidad. Derivarlo en el adaptador (`row.companyId === null`) mantiene
   una sola definición de «de sistema» —la misma que usa `findOwnership` en las escrituras— y evita
   que un identificador de empresa cruce la frontera hacia el cliente (R2).

### 2.2 La proyección

`UNIT_SELECT` gana `baseUnitId`, `factor` y `companyId`, y `toUnitRef` pasa a ser `toUnitView`.
`companyId` **entra en el `select` pero no en la salida**: se consume para derivar `isSystem`.
Nada más cambia en `unit-prisma.ts`: el `where` del ámbito, la búsqueda por `nameNormalized`, el
`orderBy` con su desempate y el `count` compartido se quedan **literalmente iguales** (R6).

`listAll` y `listPage` pasan a devolver `UnitView` / `Page<UnitView>`, y con ellos el puerto
(`ports/unit-repository.ts`) y los tipos de `list-units.ts` (`UnitListResult`, las dos firmas de
`ListUnits`). **El cuerpo de `createListUnits` no se toca**: mismos cinco pasos, mismo permiso en la
primera línea, mismo saneado, mismo ámbito (R3, R5).

### 2.3 Por qué NO se resuelve el nombre de la unidad base en SQL

Sería lo cómodo: un `select` anidado `baseUnit: { select: { id, name, symbol } }` dejaría cada fila
autosuficiente. **No se puede sin cambiar el esquema**: el modelo `Unit` de `db/schema.prisma`
declara `baseUnitId` como escalar y **no tiene relación Prisma** (`§0`). Añadirla obliga a editar el
esquema y regenerar el cliente, que es exactamente lo que una ficha `frontend` no debe hacer y lo
que convertiría la discusión «¿esto es fullstack?» en un sí. Se resuelve **en la pantalla**, con el
catálogo que ya hace falta pedir para el selector (`§5.3`), y con un caso degradado explícito
(marcador neutro) cuando la base no aparece en él (R17).

## 3. La apertura del parámetro de `listUnitsAction` (R5)

El caso de uso ya está: `listUnits(input, actor)`, sobrecargado, discriminando por la forma de la
entrada. La action solo tiene que **dejar pasar** lo que recibe:

```ts
export async function listUnitsAction(): Promise<UnitCatalogResult>;
export async function listUnitsAction(query: unknown): Promise<UnitPageResult>;
export async function listUnitsAction(query?: unknown): Promise<UnitCatalogResult | UnitPageResult> {
  const actor = await currentActor();
  try {
    const data = await unidades.listUnits(query, actor);
    return { status: 'success', data };
  } catch (error) { return toErrorState(error); }
}
```

- **Las sobrecargas son lo que protege a los llamantes de hoy** (R4): el formulario de recetas y el
  detalle de proveedor invocan `listUnitsAction()` sin argumentos y siguen recibiendo
  `readonly UnitView[]` —un array, no una unión— sin tocar una línea. Es el mismo mecanismo que
  `ListUnits` ya usa en el dominio, y por eso no se inventa nada: se copia el patrón del vecino.
- **`toErrorState`, `currentActor` y las tres actions de escritura NO se tocan.**
- **Contingencia declarada.** Si el compilador de Server Actions rechazara las **declaraciones** de
  sobrecarga en un módulo `'use server'` —son `TSDeclareFunction` sin cuerpo, y el emitido es una
  única función `async`, pero no está verificado en este repo—, el plan B **no cambia ningún
  requisito**: se conserva `listUnitsAction()` para el catálogo completo y se añade
  `listUnitsPageAction(query)` para la página, en el mismo archivo. R4 y R5 se cumplen igual; el
  implementer lo anota en `progress/impl_*.md` en vez de abrir una decisión nueva.

## 4. La equivalencia: una función pura, no una plantilla suelta (R17)

`unit-equivalence.ts` no monta DOM y se testea sin él:

```
formatFactor(factor: string): string          // '1000.0000' -> '1000'; '0.5000' -> '0.5'
unitLabel(unit: { name; symbol }): string     // símbolo, o nombre si el símbolo es null
formatUnitEquivalence(unit: UnitView, base: UnitRef | undefined): string
```

- Unidad base (`baseUnitId === null`) → **guion** (constante exportada, no un literal suelto).
- Unidad derivada con base resuelta → `1 kg = 1000 gr`, que es el ejemplo literal del board.
- Unidad derivada **sin base resuelta** —la base cayó fuera del catálogo acotado a `MAX_UNITS`— →
  marcador neutro, misma constante que el guion. **No se lanza y no se rompe la fila.** Es el caso
  degradado que R17 exige escribir en vez de suponer que no pasa.
- El factor **nunca** se convierte a `number` en ningún punto de este camino (R1).

## 5. Datos: contratos, parámetros y estados

### 5.1 Contratos de entrada/salida

| Contrato | Valor |
| --- | --- |
| Props de `page.tsx` | `searchParams: Promise<Record<string, string \| string[] \| undefined>>` |
| Consulta paginada | `listUnitsAction(params)` → `{ status:'success'; data: Page<UnitView> } \| { status:'error'; code; message }` |
| Consulta del catálogo (selector + índice de bases) | `listUnitsAction()` → `{ status:'success'; data: readonly UnitView[] } \| { status:'error'; … }` |
| Alta | `createUnitAction(prevState, FormData)` → `CreateUnitFormState` |
| Edición | `updateUnitAction.bind(null, id)` → `UnitMutationFormState` |
| Borrado | `deleteUnitAction(prevState, FormData)` con `id` en campo oculto → `UnitMutationFormState` |
| Estado inicial de cada formulario | **literal `{ status: 'idle' }`** tipado con el tipo exportado (un archivo `'use server'` solo exporta funciones async) |
| Datos de sesión | La pantalla **no los pide ni los pasa por props** (R14, R46): `requirePagePermission` los lee para el corte y devuelve `void` |
| **Modelo de datos, tablas, RLS, migraciones** | **NO APLICA: cero cambios en `db/`.** Ver `§7` |
| Integraciones externas / variables de entorno | **Ninguna** |

### 5.2 Los parámetros de lista viven en la URL

`unit-list-params.ts`, calcado de `presentation-list-params.ts`:

```
parseUnitListParams(searchParams) -> DataTableParams
buildUnitListQuery(params) -> string
unitListHref(params) -> string        // SIEMPRE derivado de UNITS_ROUTE (R8)
```

- Parámetros: `page`, `pageSize`, `sort`, `q`. `filters` **siempre `{}`**, porque
  `UNIT_QUERYABLE.filterable` está vacío a propósito (R20).
- `sort`: el campo se valida contra **`UNIT_QUERYABLE.sortable` importado**, no contra una lista
  escrita aquí; un campo desconocido es «sin orden», no un error (R19, R23).
- `pageSize`: solo `PAGE_SIZE_OPTIONS` de la tabla compartida; cualquier otra cosa →
  `DEFAULT_PAGE_SIZE` **importado** (R21).
- El resultado se pasa **entero y sin traducir** a la action: `DataTableParams` es campo a campo la
  misma forma que `ListQuery`, y `createListQuerySchema()` es un `z.strictObject`.

Acotar es de esta capa; **validar sigue siendo del dominio**. Esto cumple R23 antes de llamar a la
action.

### 5.3 La sección hace DOS lecturas, y por qué

```tsx
const [pageResult, catalogResult] = await Promise.all([
  listUnitsAction(params),   // la página que se pinta
  listUnitsAction(),         // el catálogo acotado: bases del selector + índice para la equivalencia
]);
```

La segunda no es un lujo: **la unidad de la que deriva una fila puede no estar en la página**, y el
selector de «deriva de» necesita **todas** las unidades base del ámbito, no las diez visibles
(R36). Las dos llamadas pasan por el mismo caso de uso, con el mismo permiso y el mismo ámbito, así
que no abren ningún camino de datos nuevo. Con `MAX_UNITS = 200` el coste es una consulta corta y
sin `count`.

Del catálogo salen dos cosas puras y serializables: `baseUnits` (las de `baseUnitId === null`, menos
la unidad que se esté editando, R36) y un índice `id -> { name, symbol }` para `§4`.

**SI la segunda lectura falla**, la pantalla **no** cae al estado de error: pinta la lista con el
índice vacío —cada equivalencia derivada muestra el marcador neutro (R17)— y el selector sin
opciones. La primera lectura es la que decide el estado de la pantalla (R26); una lista visible vale
más que un error total por no poder pintar una columna.

### 5.4 Los tres estados (R24, R25, R26)

```tsx
<Suspense key={buildUnitListQuery(params)} fallback={<UnitListSkeleton rows={params.pageSize} />}>
  <UnitListSection params={params} />
</Suspense>
```

La `key` hace reaparecer el esqueleto en **cada** cambio de página, tamaño, orden o búsqueda. La
sección despacha:

- `status: 'error'` → `<UnitListError code message />` con reintento a la misma URL (R26, y también
  el camino de R14 cuando el código es `unauthorized`). **No** se pinta tabla vacía.
- `items.length === 0` → `<UnitListEmpty>` **de búsqueda sin resultados** (R24): sin «crea la
  primera» —con las unidades de sistema siempre presentes la lista nunca está vacía de verdad—, con
  acción de limpiar el término si lo había y con enlace a la primera página si la pedida era mayor
  que el total.
- resto → disparador de alta + `<UnitTable />`.

Los tres se pintan **fuera** de `<DataTable>` y la tabla recibe siempre `status="idle"`, igual que
en presentaciones y pedidos.

### 5.5 Refresco tras mutar (R38)

Las actions de QC-38 **no revalidan nada** y esta ficha **no las toca**. Tras un `success` el
componente cliente llama a `router.refresh()`, que reejecuta el Server Component **con la misma
URL** y conserva página, orden y búsqueda. Misma deuda menor ya anotada por QC-22, QC-35 y QC-45.

## 6. Permiso del ítem, permiso de la página y la divergencia que se vigila (R10, R11, R12)

La decisión cerrada dice **los dos permisos**, y «el ítem del menú declara lo mismo que la página».
La página puede: `requirePagePermission` se llama **dos veces**, y la guardia recorre todos los
códigos que encuentra (`§0`). El ítem **no puede**: `NavLink.permission` es **una cadena**, y
convertirlo en lista significaría reescribir el tipo, `filterNavItemsByPermissions` y su guardia —el
mecanismo de QC-75, que R9 y R47 prohíben tocar—.

Se resuelve así, sin reabrir nada:

1. **La página exige los dos**, en este orden y como primeras líneas del componente:
   `unidades.consultar` y luego `unidades.modificar`. Sin sesión → login; sin cualquiera de los dos
   → 404 dentro del layout privado.
2. **El ítem declara `unidades.consultar`**, uno de los dos, y el que sigue la forma normal
   `<módulo>.consultar` de QC-75 R5. **Aquí no aplica la excepción de QC-45**: aquella declaró
   `inventario.modificar` porque el Operador lleva `inventario.consultar` y habría visto un enlace
   que rebota. `unidades.consultar` **no lo tiene nadie salvo el Administrador**
   (`SEED_ROLE_PERMISSIONS`, `§0`), así que la norma se cumple y el enlace no se le enseña a nadie
   que reciba 404.
3. **El hueco se vigila, no se ignora** (R11): si mañana un rol recibiera exactamente uno de los dos
   permisos, vería el enlace y recibiría 404 (o al revés). Un test importa `SEED_ROLE_PERMISSIONS` y
   falla si algún rol tiene uno solo. Es un ancla barata que convierte una suposición de hoy en un
   rojo del gate el día que deje de ser cierta.

**Nota al humano, por si la decisión quiere revisarse algún día (no la reabro).** Exigir
`unidades.modificar` para *ver* la lista deja fuera a un futuro rol de solo lectura, y la fila de
decisiones lo asume a conciencia. Si esa fila cambiara, lo que cambia es **una línea de la página**
más su test: no hay nada en este diseño que dependa de exigir los dos.

## 7. Modelo de datos, RLS y migraciones

**No aplica, y se dice explícitamente porque `docs/specs.md` lo pide:** esta feature **no crea ni
modifica ninguna tabla**, no añade migraciones, no toca políticas de RLS y **no cambia
`db/schema.prisma`** —ni siquiera para añadir la relación de `baseUnitId`, ver `§2.3`—. La tabla
`units`, sus índices únicos parciales, su `ON DELETE RESTRICT` y su disparador de derivación son de
QC-32/QC-76/QC-38, mergeados. `units` **no tiene borrado lógico** a propósito: es lo que permite que
la FK impida borrar una unidad en uso (R41).

## 8. Formulario, panel y borrado (R32-R42)

Se reutiliza **tal cual** el patrón ya mergeado: `<form action={formAction}>` con campos **no
controlados** + `useActionState(action, { status: 'idle' })`. Ninguna dependencia nueva (`§10`).

- **Cuatro campos** (R33): `name` (`Input`), `symbol` (`Input`), `baseUnitId` (`Select`, solo bases,
  con opción «no deriva de ninguna») y `factor` (`Input` con `inputMode="decimal"`, **texto**, nunca
  `type="number"`: un `number` del navegador reintroduce coma flotante y localización decimal en el
  único módulo del ERP que decidió no tenerla).
- **Ausente ≠ vacío** (R34), y es **el punto donde es más fácil equivocarse**. Las actions leen
  `FormData` con `formData.has(key)`, no con el valor (`unit-actions.ts:113-120`): un símbolo vacío
  enviado como `''` **no** significa «sin símbolo», significa `invalid_input`; y un `baseUnitId`
  vacío rompe la pareja `baseUnitId`+`factor` que el esquema exige junta o ausente. El formulario,
  por tanto, **no renderiza esos campos como controles vacíos que se envían**: cuando el usuario no
  declara símbolo o no declara derivación, las claves correspondientes **no se envían**. La
  implementación limpia el `FormData` en el `onSubmit`/`formAction` antes de invocar la action, y el
  test de R34 espía el `FormData` recibido y afirma `has('symbol') === false`,
  `has('baseUnitId') === false` y `has('factor') === false`.
- **Sin prevalidación en el cliente**, al revés que QC-45. Los esquemas de `unidades` **no salen del
  barrel** (`§0`), y publicarlos sería ampliar el contrato del módulo más allá de lo que R3 permite
  para nada imprescindible. El servidor valida y devuelve `invalid_input`; la pantalla lo pinta. Se
  paga un viaje al servidor en el caso de error de forma, y se anota como coste asumido
  (alternativa D de `§11`).
- **Errores por código estable, nunca por texto** (R37): `duplicate_name` → junto al nombre;
  `duplicate_symbol` → junto al símbolo; `invalid_derivation` → junto al selector;
  `invalid_input`, `not_found`, `system_unit` y `unauthorized` → región de error del formulario
  (`role="alert"`). Con error el panel **no se cierra** y lo escrito no se pierde.
- **Un solo componente de panel** para alta y edición (`unit-sheet.tsx`), con dos disparadores: el
  de la barra y el de la fila, que precarga **los cuatro** valores y liga el id con
  `updateUnitAction.bind(null, id)` (R35). La edición es **reemplazo completo**: no hay envío
  parcial, y por eso «vaciar el símbolo» se expresa como «no enviar la clave».
- **Acciones de fila** (R28, R29): `unit-row-actions.tsx` devuelve `null` —celda vacía, sin nodos—
  cuando `unit.isSystem`. Sin `disabled`, sin `title`, sin insignia, sin nada. El test lo afirma en
  negativo: en una fila de sistema no hay ningún `button` ni ningún `data-testid` de acción.
- **Borrado** (`delete-unit-dialog.tsx`, R40): `alert-dialog` que **nombra la unidad** y advierte
  que no se puede deshacer; la operación sale del `submit` de un `<form>` **dentro** del contenido,
  con el `id` en un `input` oculto, que es la forma que la action espera. Sin confirmar no se invoca
  nada.
- **Unidad en uso** (R41): `unit_in_use` se pinta **en la región de error del propio diálogo**, que
  **sigue abierto**. El borrado es **físico** y el rechazo lo produce la FK real —producto, línea de
  receta **o unidad que deriva de ésta**—, así que es el caso normal, no el raro. Cualquier otro
  código se pinta igual (R42).
- **Éxito** (R38): cerrar, `toast.success(...)` sobre el `<Toaster />` que el layout **ya monta**
  —no se monta otro (R39)— y `router.refresh()` con la misma URL.

**Multiplataforma (R27, R48):** botones de acción con `min-h-11 min-w-11` y **siempre visibles**,
nada detrás de `:hover`; el desbordamiento lo absorbe el envoltorio `overflow-x-auto` del primitivo
`components/ui/table.tsx`, así que el documento no se desplaza; sin `100vh` y sin `position: fixed`;
inputs con `text-base` (16 px). Con **cuatro** columnas y una frase de equivalencia dentro, el
desbordamiento en angosto es probable, no teórico: aquí el test de viewport es una comprobación de
verdad y no un trámite.

## 9. Las columnas (R16, R19, R31)

| id | label | align | sortable | filter | pinnable | celda |
| --- | --- | --- | --- | --- | --- | --- |
| `name` | Nombre | `start` | **sí** (está en `UNIT_QUERYABLE.sortable`) | — | por defecto | `unit.name` |
| `symbol` | Símbolo | `start` | **sí** (está en la lista blanca) | — | por defecto | `unit.symbol ?? '—'` |
| `equivalence` | Equivalencia | `start` | **no** (no está en la lista blanca) | — | por defecto | `formatUnitEquivalence(...)` |
| `actions` | Acciones | `end` | — | — | `false` | `<UnitRowActions />` o nada |

La columna de acciones es una **columna normal**, exactamente como resolvió QC-35 y heredó QC-45:
`DataTableColumn.cell` devuelve `ReactNode`, así que **no se añade ninguna prop nueva** a la tabla
compartida y `components/shared/data-table/` **no se abre** (R31). El test de R16 **recorre la
declaración** en vez de listar literales: añadir una columna de ámbito, de `id` o de marcas de
tiempo obligaría a tocarla, que es justo lo que el test en negativo vigila.

`searchable` se deja **ausente** (= `true`), porque `UNIT_QUERYABLE.searchable` es `true`; y el
texto de la caja de búsqueda dice **por nombre**, porque el adaptador compara contra
`nameNormalized` y nada más (R18): una caja que insinuara «nombre o símbolo» mentiría.

## 10. Dependencias y primitivas (R45)

**Ninguna librería nueva, y ningún `shadcn add`.** Las primitivas que la pantalla necesita —`table`,
`sheet`, `alert-dialog`, `select`, `input`, `label`, `button`, `sonner`, `skeleton`— **ya están
todas** en `components/ui/` (verificado en `§0`). Nada que instalar, nada que aprobar, ninguna fila
nueva en `docs/dependencias.md`. Los cuatro checks de `docs/architecture.md > Dependencias de
terceros` **no se rellenan porque no hay candidata**.

Si al implementar apareciera la necesidad de una librería —el caso plausible sería una de decimales
para `formatFactor`, y **no lo es**: quitar ceros de la derecha de una cadena es una línea de
expresión regular, y el módulo ya calcula con `BigInt` sin dependencias—, el `frontend_dev` **para y
la propone** con los cuatro checks; **no la instala** (regla 7 de `CLAUDE.md`).

## 11. Alternativas descartadas (y por qué)

**A — Ensanchar `UnitRef` en vez de crear `UnitView`.** Es un archivo menos y un nombre menos.
**Descartada** (`§2.1`): `UnitRef` lo devuelve también `UnitCatalog.findRefs`, el servicio que
`recetas` consume; ensancharlo obliga a ampliar esa segunda proyección —o a mentir con campos que
`findRefs` no trae— y arrastra la ficha a otro módulo, contra R3. `UnitView` extiende `UnitRef` y no
rompe a nadie.

**B — Resolver el nombre de la unidad base en SQL, con un `select` anidado.** Deja cada fila
autosuficiente y evita la segunda lectura de `§5.3`. **Descartada**: el modelo `Unit` **no tiene
relación Prisma** para `baseUnitId` (`§0`), así que exigiría editar `db/schema.prisma` y regenerar
el cliente. Eso convierte una ficha de pantalla en una de esquema, que es justo lo que la decisión
cerrada nº 4 rechazó al mantenerla en `frontend`. Coste asumido: una consulta corta más y un caso
degradado que hay que escribir (R17).

**C — Que la pantalla pida el catálogo entero y pagine en el cliente.** Con `MAX_UNITS = 200` casi
cabe. **Descartada**: el soporte de orden, búsqueda y página **ya está hecho** en el servidor
(QC-57) y no usarlo dejaría muerto trabajo pagado; además el orden en cliente diverge del desempate
estable del adaptador y la búsqueda en cliente no normaliza igual que `nameNormalized`. Dos
definiciones de «mismo nombre» es exactamente lo que R19 del módulo prohíbe.

**D — Prevalidar en el cliente con los esquemas del módulo, como hace QC-45.** Da error inmediato
sin viaje al servidor. **Descartada** (`§8`): `createUnitSchema` / `updateUnitSchema` **no salen del
barrel** de `unidades`, y publicarlos para esto ampliaría el contrato del módulo más allá de lo que
R3 acota, en una ficha cuyo riesgo principal es precisamente cuánto entra en `lib/`. Coste asumido:
un viaje al servidor para un nombre vacío. Si algún día pesa, publicar los esquemas es una línea del
barrel y una ficha propia.

**E — Añadir una columna «Ámbito» (o una insignia «de sistema») para explicar por qué esas filas no
tienen acciones.** Es lo que la ficha del board pedía el 2026-09-07. **Descartada por decisión
humana del 2026-09-08**: que una unidad sea de sistema es manejo interno, y la celda de acciones
vacía es la única señal (R29). Coste asumido: el usuario no sabe *por qué* «kg» no se puede borrar.
Mitigación: si lo intenta por otra vía, el error de dominio lo dice con su código (R30).

**F — Ordenar por la columna de equivalencia.** Es la columna más informativa de la lista.
**Descartada**: no está en `UNIT_QUERYABLE.sortable` y no es una columna real —es una frase compuesta
por dos campos y un nombre resuelto en la pantalla—. Ordenarla exigiría inventar un criterio de
orden en el servidor y ampliar la lista blanca, contra R6.

**G — Declarar `/configuracion` como prefijo privado, ahora que ya hay dos pantallas colgando.**
Ahorra una fila. **Descartada**, por el mismo motivo que en QC-45 (alternativa F de su diseño): no
hay pantalla en `/configuracion`, cada ficha declara su prefijo con su test, y el permiso ya no es
heredable por tramo de URL desde QC-75.

**H — Página aparte para el alta y la edición (`…/nueva`, `…/[id]`).** Mejor en móvil estrecho, con
un formulario de cuatro campos que aquí sí llena el panel. **Descartada por decisión humana**: panel
lateral, heredado de QC-45 y QC-22. Se anota para que el reviewer vea que se consideró.

**I — Un `NavLink.permission` en plural, para que el ítem declare los dos permisos.** Sería la
respuesta literal a «el ítem declara lo mismo que la página». **Descartada** (`§6`): obliga a
reescribir el tipo, la función de filtrado y su guardia —el mecanismo de QC-75— desde una ficha que
R9 y R47 obligan a **consumirlo**. Se declara uno de los dos y se ancla la no-divergencia con un
test (R11).

**J — Estado de lista en `useState` + `useEffect`.** **Descartada** por lo mismo que en QC-22,
QC-35 y QC-45: perdería página, orden y búsqueda al recargar o al volver con «atrás», que es justo
lo que R32 exige al cerrar el panel.

## 12. Riesgos y cómo se mitigan

1. **Que la ampliación del módulo se desborde** y acabe tocando casos de uso, escrituras o
   `recetas`. Es **el** riesgo de la ficha. Mitigan: la lista cerrada de `§1`, R3, y un test que
   afirma que `unit-catalog-prisma.ts`, los tres casos de uso de escritura, `unit-input.ts` y
   `errors.ts` **no cambian** respecto a la rama base.
2. **Romper a los llamantes actuales de `listUnitsAction()`** (recetas, proveedores). Mitigan las
   sobrecargas de `§3`, el `typecheck` completo y un test que renderiza esos dos consumidores con
   datos de `UnitView`.
3. **Enviar `''` donde el dominio espera «clave ausente»** y recibir `invalid_input` o romper la
   pareja de la equivalencia (`§8`). Es el error más probable de la implementación. Mitiga el test
   de R34, que espía el `FormData`.
4. **Dos guardias ponen el gate en rojo** en cuanto exista `page.tsx` mal cableada:
   `guard-rutas-privadas-cubiertas` si falta el prefijo, y `guard-pantallas-exigen-permiso` si
   faltan las llamadas de permiso (y su ancla de rutas esperadas, que pasa de nueve a diez). Por eso
   **T1** va antes que la página.
5. **Tocar `components/shared/data-table/`** «para que la columna de equivalencia quepa». Lo prohíbe
   R31 y lo vigila el test de intactitud.
6. **El E2E ensucia una tabla real y el borrado es físico.** Nombres prefijados por `RUN_ID`,
   asserts filtrando por nombre —nunca «la primera fila», que Chromium y WebKit corren a la vez— y
   limpieza que **tolera** `unit_in_use` sin tumbar la suite. Ojo al orden: una unidad derivada
   bloquea el borrado de su base, así que la limpieza borra **primero las derivadas**.
7. **Paralelismo:** `lib/shared/routes.ts`, `private-nav.ts` y **todo `lib/modules/unidades/`**
   están calientes (`§1`). Si otra ficha de unidades entra a la vez, se para y se avisa.
