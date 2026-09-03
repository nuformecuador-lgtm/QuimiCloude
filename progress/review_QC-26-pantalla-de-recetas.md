# QC-26 — pantalla-de-recetas · review (F2.2)

Worktree: `.worktrees/QC-26-pantalla-de-recetas/` · rama `feature/QC-26-pantalla-de-recetas`.
Base propia `QuimiCloude_QC26`; todo lo ejecutado aqui lleva `set -a && . ./.env && set +a`.

**Veredicto: RECHAZADO** — 3 mayores, 6 menores. 10 mutaciones ejecutadas.

Lo que sigue no es una lectura de la bitacora: cada punto se comprobo sobre el disco y, donde
tocaba, rompiendo produccion a proposito y mirando que test se ponia rojo.

---

## Checklist de `CHECKPOINTS.md`

### Especificacion
- [x] `requirements.md` con **R1-R54** EARS numerados, tabla de cobertura de las 21 decisiones
      cerradas y las dos preguntas de F1.2 cerradas por el humano.
- [x] `design.md` con alternativas descartadas y su porque (seccion 5 alternativa B
      `useActionState`, seccion 10 `@atlaskit/pragmatic-drag-and-drop`, seccion 6 filtrado en
      cliente).
- [~] `tasks.md`: 30 tasks. **28 en `[x]`**, `T25` en `[~]` (declarada incompleta a proposito:
      verificacion manual en movil real) y `T28` en `[ ]` (gate completo + PR, la cierra el leader).
      No se contabiliza como hallazgo: las dos estan dichas, no silenciadas.

### Trazabilidad
- [x] Los **54** requisitos tienen al menos un test **nombrado y real**; se verificaron los nombres
      contra los archivos, no solo contra la tabla. Ninguno huerfano, ninguno vacio.
- [x] `progress/impl_QC-26-pantalla-de-recetas.md` contiene el mapa `R<n> -> test` (T26, 761 lineas).

### Calidad de codigo
- [x] `pnpm run typecheck` — limpio.
- [x] `pnpm run lint` — limpio, 0 errores 0 warnings.
- [ ] `pnpm test` — **ROJO de forma reproducible en la suite completa**. Ver MAYOR 1.
- [x] `pnpm run test:guardias` — 12 archivos, 123/123.
- [x] E2E de flujo critico (permisos): `e2e/recetas.spec.ts`, camino completo del Administrador y
      rechazo del no-Administrador, en Chromium y WebKit, sin subida de imagen.
- [x] Multiplataforma: `design.md` **no declara ninguna excepcion de escritorio**, y la guardia de
      R50 mide **control a control**. Ver «Los tres puntos declarados», punto 3.
- [x] Dependencias: tres paquetes, tres filas, aprobacion citada en `design.md` seccion 10.

### Datos y seguridad
- [x] Permiso de la operacion nueva validado **en el service** (`domain/list-units.ts`), no en la
      ruta, con test. Los cinco permisos de receta los aporta QC-25 y esta ficha no los repite (R7).
- [x] RLS / migraciones / `down.sql` — **NO APLICA**: cero cambios en `db/`, verificado sobre el
      diff real de la rama.
- [~] Acceso a datos solo por repositorio (Prisma): se cumple, pero el unico adaptador driven nuevo
      **no tiene ni un test**. Ver MAYOR 3.
- [x] Sin secretos hardcodeados; sin webhooks.

### Modulos hexagonales
- [x] `domain/` y `ports/` de `unidades` no importan framework, Prisma, `lib/shared/` ni
      `lib/composition`.
- [x] El adaptador driving **no instancia** su driven: lo pide a `@/lib/composition`.
- [x] El barrel `lib/modules/unidades/index.ts` **no reexporta** nada con `'use server'`.
- [x] Import por ruta profunda al adaptador **driving** de otro modulo: es el **precedente de QC-22
      ya mergeado** (`app/(private)/inventario/components/product-list-section.tsx` y tres mas) y la
      unica via posible, porque un archivo `'use server'` no puede salir por el barrel. No es
      hallazgo.
- [x] La autorizacion vive en `domain/`, no en la Server Action: `unit-actions.ts` resuelve el
      actor, invoca y traduce; **no repite `requireAdmin`**. Comprobado por mutacion (M1).

### Permisos
- [x] La regla ruta-rol es **adicional**: borrarla deja ver la pantalla pero no un solo dato,
      porque la autorizacion vive en el caso de uso. Coherente con QC-9 R29.
- [x] Componentes de cliente reciben unidades y la primera pagina de productos **por props**.
- [x] Mutaciones por Server Action; cero `fetch` a rutas API propias.

### Verificacion final
- [ ] `./init.sh` completo en verde — **no**, ver MAYOR 1.
- [x] `progress/review_QC-26-pantalla-de-recetas.md` existe (este archivo). Veredicto RECHAZADO.
- [ ] Entrada en `progress/history.md` — pendiente (F2.5, del leader).

---

## Los tres puntos que el implementer declaro, verificados por mi cuenta

### 1. Los cuatro tests heredados que dice haber «retensado, no relajado» — CIERTO, los cuatro

Comparados uno a uno contra su version en `origin/dev`.

| Archivo | Veredicto |
| --- | --- |
| `tests/unit/unidades/module-contract.test.ts` | **Igual o mas estricto.** Cada «esta vacia» se sustituyo por una **lista exacta** (`toEqual`), no por «al menos algo»: `ports/` -> exactamente `unit-repository.ts`; `adapters/driving/` -> exactamente `unit-actions.ts`; el barrido de `prisma.unit` pasa de un adaptador permitido a **dos por nombre exacto**, conservando **las dos pasadas sinteticas** que impiden el verde por vacuidad. La relajacion de `'use server'` esta acotada a **un archivo nominal**: en cualquier otro sigue prohibido. |
| `tests/unit/recetas/scope.test.ts` | **Mas estricto.** Se invierte de «no existe pantalla» a «la pantalla existe **exactamente** donde la ubica `FORMULAS_ROUTE` importada, y en ningun otro sitio de `app/` ni de `components/`», con un `existsSync` de la `page.tsx` que impide que el caso quede verde sobre un repo sin pantalla. La lista de specs E2E de recetas es **cerrada**. |
| `tests/unit/recetas/module-contract.test.ts` | **Distinto, no mas debil.** Conserva la prohibicion de route handlers y **anade** un censo cerrado de `lib/modules/recetas/**`. La mitad que se retira («ningun archivo de `app/` menciona receta») se **muda** a `scope.test.ts`, no se pierde. Ver menor 2 sobre el censo. |
| `tests/unit/inventario/scope.test.ts` | **Mas estricto.** La exclusion de la carpeta de recetas es legitima —`product-picker.tsx` casaba con el barrido **por su nombre**, no por ser una segunda pantalla de catalogo— y no queda como puerta trasera: se **anade** una defensa que exige que dentro de esa carpeta no aparezca ninguna **senal real** de pantalla de catalogo (`page.tsx`, `ProductListSection`, `product-table`). |

Sobre el de `driving/`, que es el que el brief marcaba: es **cierto** que hoy afirma «contiene
exactamente `unit-actions.ts`, que exporta exactamente `listUnitsAction`, y ningun archivo del
modulo nombra `createUnit|updateUnit|deleteUnit|renameUnit` ni escribe
`*.unit.<create|update|upsert|delete|...>`». **Es la frontera literal de R44** y muerde: ver
mutacion **M9**.

### 2. Las tres filas de `dnd-kit` en `docs/dependencias.md` — CONFORMES, las tres

Partir la fila en tres es **necesario**: `guard-dependencias-aprobadas.test.ts` solo acepta un
nombre entre backticks por primera celda. Cada una de las tres conserva **integro** lo que
`docs/dependencias.md > Estados` exige de una `excepcion`:

- **que check fallo**: el **2** (release en 12 meses), nombrado como tal;
- **desde cuando**: `2024-12-05` para `core` y `sortable`, `2023-11-06` para `utilities` — la fecha
  **propia de cada paquete**, no copiada de la primera fila;
- **que pasa los otros tres**: sin `deprecated`, MIT, 24.862.894 descargas/semana;
- **por que se acepto igual**: decision humana del 2026-09-03, con la alternativa que si pasa los
  cuatro (`@atlaskit/pragmatic-drag-and-drop`) **ofrecida y descartada**, y el riesgo escrito;
- **condicion de la aprobacion**: «cada paso debe poder reordenarse tambien con el **TECLADO**».

La condicion no es decorativa: la mutacion **M6** demuestra que quitarla pone el gate en rojo.
`package.json` incorpora **exactamente esas tres** lineas y nada mas. `design.md` seccion 10 cita la
aprobacion humana, como pide `CHECKPOINTS.md`.

### 3. Los dos defectos de area tactil que dice que cazo la guardia — CIERTO

La guardia de R50 (`recipe-route-contract.test.ts:617-678`) mide **control a control**: extrae cada
etiqueta de apertura de los controles vigilados, lee **su** `className` y exige `min-h-11` (y
`text-base` en cada `Input`), resolviendo constantes locales. Incluye autocomprobacion: si el
archivo escribe `<Input` y el lector no ve ninguna etiqueta, cae. Con ese criterio, un `Input` sin
area tactil **no puede** pasar aunque otros controles del mismo archivo la lleven — que es
exactamente como se escaparon los dos. Hoy `recipe-image-field.tsx` lleva `min-h-11 text-base` en el
input de archivo y `recipe-steps-field.tsx:196` lleva `TOUCH_TARGET text-base` en el input del paso.
**Se arreglo el codigo, no la guardia.**

---

## Los seis puntos donde el brief pedia morder fuerte

**1. R41 y la operacion de unidades — CORRECTO.** `requireAdmin(actor)` es la **primera linea** de
`createListUnits` (`lib/modules/unidades/domain/list-units.ts:27`), antes de tocar el repositorio.
Los cuatro tests de rechazo usan un doble **cuyo `listAll` lanza si se le llama**, asi que «no lee
del repositorio» se prueba de verdad y no por ausencia de asercion. La action **no repite ni
decide**: resuelve el actor con `identity.getSessionUser()` y traduce el error de dominio. Frontera
hexagonal respetada: el barrel no reexporta la Server Action; `lib/composition` cablea el puerto y
nunca instancia el driving. Ninguna escritura de unidades colada (M9).

**2. R3/R4/R5 — CORRECTO.** `FORMULAS_ROUTE` vive **solo** en `lib/shared/routes.ts:23`;
`lib/shared/navigation/private-nav.ts:40` la **reexporta** (`export { FORMULAS_ROUTE }`) y ya no la
declara. `PRIVATE_ROUTE_PREFIXES` la incluye (`routes.ts:46`). El item del sidebar usa
`RECIPES_LABEL = 'Recetas'` y su `testId` es `nav-produccion-recetas`; «Formulas» ya no aparece.
`grep` confirma que el literal `/produccion/formulas` solo existe en `routes.ts`. Mutaciones M3 y
M4: rojo inmediato.

**3. R35/R36, los tres estados de la imagen — CORRECTO, y no se colapsan.** Union discriminada
(`untouched | replaced | cleared`), y `buildRecipePayload` distingue por **presencia de clave**: el
caso `untouched` devuelve `base` **sin la propiedad `image`**, no `image: undefined`. `create` +
`cleared` **lanza** en vez de enviar el nulo, y el control de quitar no se ofrece en el alta.
Mutacion M5 confirma que se detecta.

**4. R53/R54/R10 — CORRECTO, incluido el negativo.** Marcador por `data-testid` en la celda de la
linea afectada **y solo esa**; aviso al pie con `role="status"` y `data-count`, **derivado en cada
render** de `lines.filter(l => l.productName === null).length`, que **desmonta** el aviso cuando el
numero llega a cero (no lo oculta con CSS). Ningun assert depende del copy. El discriminante se
protege del falso positivo de la linea nueva en blanco (`productName: ''` no es `null`). El negativo
de R10 esta cubierto con lista blanca de los archivos de la lista en el contract test. Mutaciones M7
y M8: rojo.

**5. La cantidad como cadena decimal — CORRECTO.** `type="text" inputMode="decimal"` en
`recipe-lines-field.tsx:152-153`; `buildRecipePayload` la copia tal cual. `grep` de la ruta: **cero**
`type="number"`, `parseFloat`, `toFixed`. El unico `Number(` de la ruta esta en
`recipe-list-params.ts:65`, sobre los **parametros de paginacion**, no sobre la cantidad — y la
guardia lo acota correctamente a lineas que contengan `quantity`. Los tres valores del test
(`0.1005`, `1.0000`, `10.0001`) delatarian cualquier conversion.

**6. Accesibilidad del reordenamiento — CORRECTO y demostrado.** `KeyboardSensor` con
`sortableKeyboardCoordinates`, asa `<button>` real de al menos 44x44 **siempre visible**, nombre
accesible con la posicion, y `announcements` de `aria-live` para las cuatro fases. El test **afirma
sobre el orden del payload** tras la reordenacion entera con teclado, no sobre la existencia de un
asa enfocable. Mutacion M6 lo confirma. La condicion con la que entro `dnd-kit` se cumple.

---

## Mutaciones ejecutadas (10) — que borre y que se puso rojo

| # | Que rompi | Resultado |
| --- | --- | --- |
| M1 | `requireAdmin(actor)` en `lib/modules/unidades/domain/list-units.ts:27` | **ROJO — 4 tests** de `list-units.test.ts` (los cuatro de R41), con el doble del repositorio lanzando |
| M2 | `take: limit` en `unit-prisma.ts:19` | **VERDE.** Nada se puso rojo. Ver MAYOR 3 |
| M3 | `FORMULAS_ROUTE` fuera de `PRIVATE_ROUTE_PREFIXES` (`routes.ts:46`) | **ROJO — 5 tests**: `guard-rutas-privadas-cubiertas` + 4 de `route-access.test.ts` |
| M4 | la fila `{ prefix: FORMULAS_ROUTE, ... }` de `route-role-rules.ts:52` | **ROJO — 3 tests**: 2 de `route-role-rules.test.ts` + 1 de `route-access.test.ts` |
| M5 | `case 'untouched': return base` -> `return { ...base, image: undefined }` | **ROJO — 4 tests**: los dos de «no key» (R35, R36) y dos de R38 |
| M6 | `useSensor(KeyboardSensor, ...)` en `recipe-steps-field.tsx:88` | **ROJO — 1 test**: el de R34 sobre el orden del payload |
| M7 | el `data-testid` del marcador, hecho **incondicional** (`recipe-lines-field.tsx:131`) | **ROJO — 4 tests**, incluido el negativo «la celda de una linea disponible no lleva testid» |
| M8 | el bloque del aviso de R54, condicion fijada a `false` (`recipe-lines-field.tsx:206`) | **ROJO — 3 tests** de `recipe-lines-unavailable.test.tsx` (casos b, c, d) |
| M9 | anadido un `createUnitAction` a `unit-actions.ts` | **ROJO — 1 test**: `la feature anade UNICAMENTE la Server Action de listado...` de `module-contract.test.ts` |
| M10 | `take: limit` **y** `orderBy: { name: 'asc' }` en `unit-prisma.ts`, contra la **suite completa** | **VERDE** salvo los dos rojos preexistentes de MAYOR 1. 123 de 124 archivos verdes con una consulta sin cota y sin orden. Ver MAYOR 3 |

Tras cada mutacion se restauro el archivo; `git status --short` quedo vacio.

---

## Hallazgos

### MAYOR 1 — La suite completa esta ROJA de forma reproducible: R30 y R31 se caen por timeout

`tests/unit/recetas-ui/recipe-form.test.tsx:509` (R30) y `:533` (R31).

Sobre el arbol **limpio**, sin ninguna mutacion, corri `pnpm exec vitest run` **cuatro veces**, con
el entorno del worktree cargado. Las cuatro dieron lo mismo:

```
Test Files  1 failed | 123 passed (124)
Tests       2 failed | 1364 passed (1366)
Error: Test timed out in 5000ms.   <- R30 y R31
```

En una de las cuatro corridas cayo ademas un **tercer** test de R31 con un fallo de asercion, no de
timeout (`expected "vi.fn()" to not be called at all, but actually been called 4 times`), que es el
arrastre tipico de un test que expiro y dejo el formulario montado.

El mismo archivo **en aislado pasa 19/19**, y `tests/unit/recetas-ui` en aislado pasa **89/89**. El
rojo aparece solo bajo la carga de la suite completa. La causa es el margen: con `--reporter=verbose`
en aislado, R30 tarda **1732 ms**, R31 **1855 ms** y R34 **1957 ms** contra el `testTimeout` por
defecto de **5000 ms** (`vitest.config.mts` no lo sube). Un factor 2,7 no aguanta la paralelizacion.

Por que es bloqueante y no menor:

- `CLAUDE.md` regla 5 y `CHECKPOINTS.md > Verificacion final` exigen `./init.sh` en verde, y
  `./init.sh` corre la suite entera, no los archivos por separado.
- Los dos tests que se caen son **los unicos** que cubren **R30** (la unidad viaja como id, y la que
  no tiene simbolo se presenta por su nombre) y **la mitad de R31**. Un requisito cuyo unico test se
  pone rojo cuando se corre de verdad no esta verificado: la trazabilidad de la regla 4 se rompe ahi.
- `tests/baseline-rojos.json` esta **vacio**, y su propia nota dice que con la lista vacia
  «CUALQUIER archivo rojo es bloqueante».

La bitacora del implementer y el reporte del leader dicen `1366 passed`; en esta maquina son
`1364/1366`, cuatro veces de cuatro. No es una discrepancia que se pueda dejar pasar: o el gate es
reproducible o no es un gate.

**Que falta para cumplirlo:** subir el `testTimeout` de ese archivo (o de esos casos) a un margen que
aguante la suite completa, o adelgazar la interaccion de `userEvent` de R30/R31 — **sin** debilitar
ninguna asercion. Y volver a correr `./init.sh` completo, dos veces seguidas, en verde.

### MAYOR 2 — La rama arrastra seis archivos de trabajo ajeno (rama `fix-ux`), y dos son de `components/ui/`

Introducidos por el commit **`9d3b33f`** («chore(QC-26): spec aprobado (F1.4) y F2.0 — ficha a
in_progress»), que ademas de la fila de dependencias y `feature_list.json` se llevo por delante:

```
components/ui/button.tsx                              (+ variante "outline-dashed", + cursor-pointer)
components/ui/sheet.tsx                               (+ props isForm/formProps, borde en SheetHeader)
components/private/app-sidebar.tsx                    (<button> -> <Button variant="ghost" size="icon-sm">)
components/private/logout-menu-item.tsx               (cursor-default -> cursor-pointer)
app/(private)/inventario/components/product-form.tsx  (+70/-…)
app/(private)/inventario/components/product-sheet.tsx (+36/-…)
```

Verificado que **no estan en `origin/dev`** (`git diff origin/dev HEAD -- components/ui
components/private "app/(private)/inventario"` los lista los seis) y que **si estan en la rama
`fix-ux`** (comprobado por `git branch -a --contains` sobre `9d3b33f` y buscando `isForm` en el
`sheet.tsx` de cada rama). Es trabajo de otra sesion que quedo en el arbol y entro aqui de rebote.

Por que es bloqueante:

- **R48**: «las primitivas de interfaz DEBEN provenir de la libreria de componentes por su CLI; el
  sistema NO DEBE escribir a mano ni editar archivos de `components/ui/`». Aqui hay **dos** editados
  a mano, uno con una variante nueva inventada (`outline-dashed`).
- **R51**: enumera **cinco** archivos heredados que esta feature puede modificar (constante de ruta
  y su reexport, prefijos privados, item de navegacion, reglas ruta-rol y cableado de composicion).
  Estos seis no estan en esa lista, y dos de ellos son de la pantalla de **QC-22**, ficha ajena y ya
  `done`.
- Ningun test de esta feature los cubre: la guardia de R48 solo comprueba que las primitivas
  **existan**, no que no se hayan tocado; y la guardia de R44 solo mira `lib/modules/recetas/` y
  `db/`. Se colaron por un hueco real del arnes.

Esto **no es del implementer** —es del commit de F2.0— pero esta en el diff que se mergearia, y el
reviewer valida la rama, no la intencion.

**Que falta para cumplirlo:** sacar esos seis archivos de la rama (revertirlos a `origin/dev` en un
commit propio) y dejar que viajen por su ficha y su PR, donde alguien los revise. Si alguno hiciera
falta para QC-26, tiene que decirlo el `design.md` y traer su test; hoy no lo dice ninguno.

### MAYOR 3 — El adaptador driven nuevo no tiene ni un test: se le puede quitar la cota y el orden con la suite en verde

`lib/modules/unidades/adapters/driven/persistence/unit-prisma.ts:16-21`.

Mutacion **M10**: borre a la vez `orderBy: { name: 'asc' }` y `take: limit`, dejando

```ts
const rows = await prisma.unit.findMany({
  select: { id: true, name: true, symbol: true },
});
```

y corri la **suite completa**: 123 de 124 archivos en verde (el unico rojo es el de MAYOR 1, ajeno a
esta mutacion). **Ni un solo test protesto** por una consulta sin cota y sin orden.

R40 exige literalmente que la operacion «DEBE aplicar un **limite superior declarado** al numero de
filas que pide al repositorio, **sin ejecutar ninguna consulta sin cota**» y que las devuelva
«ordenadas de forma estable». Hoy eso se verifica **solo contra un doble**: `list-units.test.ts`
comprueba que el **caso de uso** pasa `MAX_UNITS` a `listAll` y que respeta el orden que le da el
repositorio. Nadie comprueba que **el repositorio real** honre el limite ni ordene. El archivo entero
no aparece en ningun test salvo por su **nombre**, dentro de guardias de fuente.

Es exactamente el patron que el brief pide cazar —«que linea de produccion podria borrar sin que
ningun test se ponga rojo»— y hay **dos**, en el unico codigo de acceso a datos que esta ficha
anade. El precedente de como se cubre esto ya existe en el repo:
`tests/integration/recetas/recipe-crud.int.test.ts`, `recipe-lines.int.test.ts` y
`tests/integration/unidades/unidades-constraints.int.test.ts`.

**Que falta para cumplirlo:** un test de integracion sobre `listUnits(limit)` que, con mas filas
sembradas que el limite pedido, compruebe (a) que devuelve **como mucho** `limit` filas y (b) que
vienen ordenadas por nombre. Con eso, borrar cualquiera de las dos lineas se pone rojo.

### menor 1 — Censo de layouts de toda la zona privada

`tests/unit/recetas-ui/recipe-route-contract.test.ts:693-695` afirma que bajo `app/(private)/` hay
**exactamente un** `layout.tsx`. No es un censo global del repo —esta acotado a la zona privada—
pero si es una afirmacion sobre terreno de otras features: el dia que una ficha legitima anada un
layout anidado, este test de QC-26 se pone rojo sin que nada de QC-26 este mal. Es la forma en que
cuatro fichas anteriores rompieron a la siguiente. Sugerencia: afirmar que **la ruta de recetas** no
declara layout propio —que es lo que R51 pide de esta feature— en vez de contar los de la zona
entera.

### menor 2 — Censo cerrado del arbol de `lib/modules/recetas/**`

`tests/unit/recetas/module-contract.test.ts`, constante `EXPECTED_RECETAS_MODULE_FILES` (19 rutas
literales). Es un test de QC-25 que QC-26 endurece a lista exacta de archivos de un modulo **ajeno**.
Muerde hoy y cumple su proposito —«QC-26 no toca `recetas` por la puerta de atras»—, pero convierte
cualquier ampliacion legitima futura de `recetas` (por ejemplo, un archivo nuevo para
`revalidatePath`, deuda que la propia bitacora anota en T1) en un rojo de esta feature. Vive mejor
como diff de rama —que ya existe, el caso de R44— que como lista literal a mantener a mano.

### menor 3 — La guardia de R44 puede quedar verde sin haber comprobado nada

`tests/unit/recetas-ui/recipe-route-contract.test.ts:473-498`. Si `git diff --name-only
origin/dev...HEAD` falla o devuelve vacio, el `catch` deja `diff = []` y el caso termina en
`expect(diff).toEqual([])` — verde sin haber mirado ni un archivo. El comentario lo declara
honestamente, y en este entorno el rango **si** esta disponible (lo verifique), asi que hoy comprueba
de verdad. Pero en un CI sin `origin/dev` alcanzable pasaria en verde sin comprobar nada.
Sugerencia: `expect(diff.length, 'el rango git no estaba disponible').toBeGreaterThan(0)`, para que
la ausencia se vea como rojo y no como silencio.

### menor 4 — R41: falta el caso explicito de `roleName: null`

`tests/unit/unidades/list-units.test.ts` cubre «sin actor», «rol vacio», «rol desconocido» y «rol
parecido» (`Administradores externos`, que es el buen caso: descarta un `includes`). R41 nombra
tambien el **rol nulo**. `requireAdmin` lo maneja correctamente por la comparacion de igualdad
estricta, asi que no hay defecto — falta el caso escrito, que cuesta tres lineas.

### menor 5 — `T25` en `[~]` y `T28` en `[ ]`

`CHECKPOINTS.md > Especificacion` pide todas las tasks en `[x]`. T25 esta **declarada** incompleta
con lo que falta enumerado (inspeccion a 375 px, arrastre con el dedo, zoom al enfocar en iOS) y no
se cuenta como hallazgo. Lo automatizable de ella **si** quedo cubierto: guardia de fuente de R50
control a control, asserts de viewport angosto y ancho con `tests/helpers/viewport.ts`, y el E2E en
**WebKit** que recorre login, lista, alta con linea y paso. T28 es del leader y se cierra despues de
este review.

### menor 6 — Sin entrada en `progress/history.md`

Es F2.5, del leader, y va despues de este review. Se anota para que no se olvide al cerrar la ficha.

---

## Lo que si esta bien y conviene que no se pierda al arreglar lo anterior

- Los 54 requisitos con test **real**, verificados por nombre contra los archivos, no solo contra la
  tabla de la bitacora.
- **Ningun test que afirme un censo GLOBAL del repo.** Los dos censos que hay estan acotados a un
  modulo y a la zona privada (menores 1 y 2), no al repositorio.
- Solo entraron los **tres** paquetes de `dnd-kit`, aislados en **un solo archivo**
  (`recipe-steps-field.tsx`), con guardia de fuente que lo comprueba y salida identificada.
- La regla ruta-rol es **la segunda** del repo y la primera **se conserva**: se anade, no se
  sustituye, y el test afirma la lista exacta en orden — no se degrado a «al menos una».
- El E2E filtra por nombre con `RUN_ID`, nunca por «la primera fila» ni por totales, y limpia por
  nombre exacto: el bug de borrado cruzado entre workers esta corregido y documentado.
- El formulario no reinventa nada del contrato: valida con los esquemas de QC-25, envia la lista
  final completa en una sola invocacion y reenvia intacta la linea del producto dado de baja.

---

## Veredicto

**RECHAZADO.** Tres mayores. El 1 y el 3 vuelven al implementer; el 2 lo tiene que resolver el
leader, porque lo introdujo un commit de F2.0 y no una task de implementacion.

Ninguno de los tres toca el diseno ni la spec: no hay que reabrir nada. Son (1) un timeout que hace
el gate no reproducible, (2) seis archivos ajenos que hay que sacar de la rama y (3) un test de
integracion de una decena de lineas que falta. El trabajo de fondo —la pantalla, el modulo de
unidades, la trazabilidad y la honestidad de los tests— **aguanto las diez mutaciones**.
