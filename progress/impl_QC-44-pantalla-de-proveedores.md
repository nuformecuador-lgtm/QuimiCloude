# QC-44 — pantalla-de-proveedores · bitácora de implementación

> Zona `frontend` · complejidad `high` · rama `feature/QC-44-pantalla-de-proveedores`
> Spec aprobado por el humano el 2026-09-04. 52 requisitos EARS (R1–R52), 19 tasks (T0–T19).
> Implementada delegando en `frontend_dev`. **Cero trabajo de backend**: R49 lo prohíbe y no se
> abrió `lib/modules/**`, `db/**` ni `lib/composition/index.ts`.

## Estado de las tasks

T0–T18 cerradas y marcadas `[x]` en `specs/QC-44-pantalla-de-proveedores/tasks.md`. T19 es esta
bitácora. El gate completo (`./init.sh`) lo corre el leader: **el implementer no se autoaprueba**.

## Commits

| Commit | Tasks |
| --- | --- |
| `1bb0440` | T1, T2, T3 — constante de ruta, helper de detalle, prefijo privado, ítem de nav, regla ruta→rol |
| `ff96c0d` | T7 — promoción de `PresentationSelect` a `components/shared/` |
| `1f12317` | T7-residual — el barrido de alcance de QC-20 deja de marcar el selector promovido |
| `d6c72d6`, `41cbb98` | T4, T5, T6 — página de lista, parser, tres estados, tabla y toolbar |
| `e2d153d` | T10–T14 — ruta de detalle y lectura del catálogo |
| `0db29a6` | T8, T9 — alta, edición y baja de proveedor en panel lateral |
| `a882cf2` | T15 — panel lateral de alta y edición de la línea |
| `db8ec6d` | T16 — baja de línea con confirmación |
| `5a9c87b` | T18 — E2E |
| `a11e7f4` | T17 — guardias de convención |

## Archivos creados y modificados

**Heredados que se editan (exactamente los que R49 autoriza, más la promoción de §8.1):**
`lib/shared/routes.ts` (`SUPPLIERS_ROUTE`, `supplierDetailRoute`, prefijo privado) ·
`lib/shared/navigation/private-nav.ts` (`SUPPLIERS_LABEL` + `NavLink` de nivel superior en
«Cadena», `icon: 'truck'` ya existente) · `lib/composition/route-role-rules.ts` (tercera fila,
reutilizando el `ADMIN_ROLE_NAME` que el archivo ya importaba) ·
`app/(private)/inventario/components/index.ts` y `product-form.tsx` (reexport y un import tras la
promoción) · `tests/unit/inventario/{scope,product-route-contract}.test.ts`,
`tests/unit/identity/route-role-rules.test.ts`, `tests/unit/app-sidebar.test.tsx` (centinelas
ampliados).

**Nuevos, producto:** `components/shared/presentation-select.tsx` (movido) ·
`app/(private)/proveedores/{page.tsx, components/*}` (10 archivos) ·
`app/(private)/proveedores/[id]/{page.tsx, components/*}` (16 archivos).

**Nuevos, tests:** los de `tests/unit/proveedores-ui/` ·
`tests/unit/proveedores/supplier-route-contract.test.ts` · `e2e/proveedores.spec.ts`.

**Sin cambios, comprobado:** `package.json` y `pnpm-lock.yaml` (diff vacío contra `origin/dev`),
`components/ui/`, `lib/modules/**`, `db/**`, `lib/composition/index.ts`.

> **Aviso para el reviewer sobre el diff.** `git diff origin/dev...HEAD` muestra además
> `components/ui/textarea.tsx`, `components/shared/{compress-image,file-field,file-types}.ts` y
> `app/(private)/produccion/formulas/**`. **No son de QC-44**: vienen del commit
> `1b88d69 fix(ui)`, que entró al mergear `dev` en la rama. Verificado con
> `git log origin/dev..HEAD -- <archivo>`. La guardia de T17 filtra los commits del rango por la
> marca `QC-44` justamente para no dar ese falso positivo.

## Mapa `R<n>` → test

Los tests de UI viven en `tests/unit/proveedores-ui/` salvo donde se indica otra ruta.

| R | Test |
| --- | --- |
| R1 | `supplier-route-contract` (ruta derivada de la constante) · `supplier-page` (dentro del armazón privado, un solo `main`) |
| R2 | `supplier-route-contract` + `catalog-route-contract` (ningún archivo incrusta la URL) · `guard-convenciones-proveedores` (forma en plantilla) |
| R3 | `supplier-route-contract` (helper derivado) · `supplier-page` (el enlace sale del helper) |
| R4 | `tests/unit/app-sidebar.test.tsx` (itera `PRIVATE_NAV_ITEMS`; afirma sobre `SUPPLIERS_ROUTE`, `SUPPLIERS_LABEL`, `nav-proveedores`) |
| R5 | `supplier-route-contract` (prefijo único; sin sesión redirige al login; `/proveedoresX` no cubierto) |
| R6 | `tests/unit/identity/route-role-rules.test.ts` (no-Administrador fuera, Administrador pasa; lista y detalle) |
| R7 | `supplier-page` (`unauthorized` sin datos) · `supplier-detail-page` (ídem; el catálogo ni se pide) · `catalog-directories` (directorio que falla) |
| R8 | `supplier-list-params` · `catalog-list-params` · `supplier-page` y `supplier-detail-page` (selector 10/25, defecto 10) |
| R9 | `supplier-page` · `supplier-detail-page` (avanzar/retroceder, página actual y total, extremos) |
| R10 | `supplier-list-params` · `catalog-list-params` (inválido, fuera de rango, sobre el tope → acotado, nunca error) |
| R11 | `supplier-page` · `supplier-detail-page` (en negativo: sin búsqueda ni ordenación) |
| R12 | `supplier-page` · `supplier-detail-page` (en negativo: ninguna columna es `createdBy`/`updatedBy`) |
| R13 | `supplier-page` · `supplier-detail-page` (scroll contenido en la tabla, no en el documento) |
| R14 | `supplier-page` (las cinco columnas de negocio) |
| R15 | `supplier-page` (enlace al detalle por fila, construido con el helper) |
| R16 | `supplier-page` (vacío propio, con la acción de crear el primero) |
| R17 | `supplier-page` (esqueleto con `rows = pageSize` en lugar de la tabla) |
| R18 | `supplier-page` (error con mensaje y reintento, **sin** tabla vacía) |
| R19 | `supplier-detail-page` (nombre, teléfono, correo, y el catálogo debajo) |
| R20 | `supplier-detail-page` (`not_found` con vuelta a `SUPPLIERS_ROUTE` y sin catálogo) |
| R21 | `supplier-detail-page` (las ocho columnas declaradas y pintadas) |
| R22 | `catalog-directories` (id presente → nombre; ausente → «no resuelto»; llamadas acotadas; el diccionario de unidades **no cuesta ninguna consulta**) · `supplier-detail-page` (marcador y el uuid no aparece; *«una línea SIN unidad se lee distinto de una unidad que no se pudo resolver»*, marca de «sin dato» ≠ marcador de «no resuelto») |
| R23 | `supplier-detail-page` (`data-testid` distinto del vacío de la lista) · `catalog-line-sheet` (el vacío abre el panel) |
| R24 | `supplier-detail-page` (esqueleto del catálogo) |
| R25 | `supplier-detail-page` (error con mensaje y reintento, sin tabla vacía) |
| R26 | `supplier-page` · `catalog-line-sheet` (panel lateral sobre la pantalla, sin navegar) · `supplier-list-params` (ida y vuelta conserva página y tamaño) |
| R27 | `supplier-page` (captura nombre, teléfono y correo y los envía por la operación de alta) |
| R28 | `supplier-page` (edición precargada, reemplazo completo) |
| R29 | `catalog-line-sheet` (los seis campos capturados, con la ruta de imagen declarada como ausencia decidida sobre los siete del contrato; **en negativo**, sin selector de artículo del inventario) |
| R30 | `catalog-line-sheet` (no pide imagen ni la emite) · `supplier-detail-page` (la tabla no la muestra) · `catalog-route-contract` (sin `<img`/`<Image`) |
| R31 | `catalog-line-sheet` (edición precargada con reemplazo completo de los siete; **en negativo**, no ofrece cambiar de proveedor) |
| R32 | `supplier-page` (`duplicate_name` junto al campo) · `catalog-line-sheet` (`duplicate_catalog_line`, `unauthorized`, `not_found`; el panel no se cierra ni pierde lo escrito) |
| R33 | `supplier-page` · `catalog-line-sheet` · `delete-catalog-line-dialog` (cierra, toast y refresco de la lista) |
| R34 | `supplier-page` (renderiza layout + pantalla y cuenta **una sola** región de avisos) · `catalog-line-sheet` (no monta otra) |
| R35 | `supplier-page` (sin confirmar no invoca la baja —doble que falla si se le llama—; el aviso de arrastre por `data-testid`) |
| R36 | `delete-catalog-line-dialog` (abrir, cancelar y Escape no invocan nada; al confirmar sí, con `id` oculto) |
| R37 | `catalog-line-sheet` (presentación obligatoria y alcanzable) · `tests/unit/inventario/product-page.test.tsx` (más allá de la primera página) |
| R38 | `catalog-line-sheet` · `tests/unit/inventario/product-page.test.tsx` (alta en línea que deja la presentación seleccionada sin perder lo escrito) |
| R39 | `tests/unit/inventario/product-route-contract.test.ts > la pantalla no ofrece listar, editar ni borrar presentaciones` — **tras T7 lee el archivo promovido** (`SELECTOR_PRESENTACION_PATH = components/shared/presentation-select.tsx`), que es exactamente el que usa el formulario de la línea; refuerzo en `tests/unit/inventario/scope.test.ts` |
| R40 | `unit-select` (solo existentes; «sin unidad» envía vacío; sin alta ni texto libre) · `catalog-route-contract` (no importa ningún adaptador de creación de unidad) · `supplier-detail-page` (una línea sin unidad se pinta como «sin dato», no como fallo) |
| R41 | `catalog-line-sheet` (`0.1005` llega como esa misma cadena; `type=text` + `inputMode=decimal`) · `supplier-detail-page` (la celda pinta la cadena tal cual) · `catalog-route-contract` (guardia de fuente: sin `parseFloat(`, `Number(`, `toFixed(`, `Intl.NumberFormat` ni `type="number"` sobre costo/mínimo) |
| R42 | `supplier-route-contract` · `catalog-route-contract` (componentes en `components/` con barrel) · `guard-convenciones-proveedores` (nadie importa por ruta profunda desde fuera) |
| R43 | `supplier-route-contract` · `catalog-route-contract` · `guard-convenciones-proveedores` (ningún `fetch` a ruta propia) |
| R44 | `guard-convenciones-proveedores` (la feature no crea ni edita nada en `components/ui/`) |
| R45 | `guard-convenciones-proveedores` (`package.json` sin cambios y dependencias idénticas a `dev`) · `supplier-page` y `catalog-line-sheet` (validación previa con los esquemas del contrato público) |
| R46 | `supplier-detail-page` (`listUnitsAction` **una** vez, por props, sea cual sea el número de filas) · `catalog-directories` (`listUnitsAction` no se llama: las unidades llegan por parámetro) · `unit-select` · `catalog-route-contract` y `guard-convenciones-proveedores` (cliente sin `lib/composition` ni base de datos) |
| R47 | `supplier-page` · `delete-catalog-line-dialog` · `tests/unit/app-sidebar.test.tsx` (roles y `data-testid`, nunca copy) |
| R48 | `supplier-page` · `supplier-detail-page` · `unit-select` · `catalog-line-sheet` · `delete-catalog-line-dialog` (angosto y ancho con `tests/helpers/viewport.ts`, 44×44 px, ≥16 px, sin `100vh`, sin `:hover` como única vía) |
| R49 | `guard-convenciones-proveedores` (la feature no modifica módulos, `db/**` ni el barrel de composición) · `catalog-route-contract` (solo contrato público y adaptadores driving) |
| R50 | `guard-r50-base-heredada` (las dos rutas no declaran layout propio; ninguna barra lateral, navegación ni región de avisos nueva; `components/ui/` intacto; `tests/helpers/viewport.ts` se importa, no se duplica) |
| R51 | `e2e/proveedores.spec.ts` — camino completo del Administrador |
| R52 | `e2e/proveedores.spec.ts` — rechazo del no-Administrador |

## Salida real de los tests

```
pnpm typecheck  -> tsc --noEmit, sin salida (verde)
pnpm lint       -> eslint, sin salida (verde)

pnpm exec vitest run tests/unit/proveedores-ui/
  -> Test Files 12 passed (12) · Tests 140 passed (140)

pnpm exec vitest run guard
  -> Test Files 14 passed (14) · Tests 137 passed (137)

pnpm exec playwright test e2e/proveedores.spec.ts    (Chromium + WebKit)
  Running 4 tests using 4 workers
    ok  4 [chromium] > un usuario que no es Administrador acaba fuera ... (R52) (15.2s)
    ok  3 [webkit]   > un usuario que no es Administrador acaba fuera ... (R52) (19.2s)
    ok  1 [chromium] > el Administrador entra, da de alta un proveedor, abre su detalle,
                       anade una linea de catalogo y la ve en la lista (R51) (29.3s)
    ok  2 [webkit]   > el Administrador ... (R51) (34.1s)
  4 passed (41.5s)

Base tras la corrida: suppliers 0 · catalog_lines 0 · presentations 0 · users *_e2e_ 0
```

El gate completo (`./init.sh`) **no** lo corrió el implementer: es del leader, y va antes del PR
(regla 5 de `CLAUDE.md`).

## Desviaciones respecto de `design.md` (anotadas, no silenciadas)

1. **`product-form.tsx` sí cambia una línea (T7).** `design.md > 8.1` da por hecho que consume el
   selector por el barrel, pero el código real lo importaba por ruta profunda dentro de su propia
   carpeta (`from './presentation-select'`), que al mudar el archivo queda apuntando a nada. Las
   salidas eran un fichero puente (que la task prohíbe), importar desde el propio barrel (ciclo) o
   cambiar esa línea a `@/components/shared/presentation-select`. Se eligió la tercera: mecánica,
   sin tocar API ni comportamiento. **Si se quiere cero diff en ese archivo, la única vía es el
   fichero puente, y eso lo decide el humano.**
2. **`tests/unit/inventario/scope.test.ts` se ajustó (T7-residual).** Su barrido **por nombre**
   marcaba el selector promovido como «segunda pantalla del catálogo». Es el mismo falso positivo
   que ya documentan en su cabecera los ajustes de QC-22 y QC-26; se excluyó por nombre y motivo,
   con dos cierres para que la exclusión no sea puerta trasera (el archivo tiene que existir y no
   puede llevar señal real de pantalla de catálogo). No se aflojó el patrón.
3. **Unidades en error ⇒ error de la página entera (T10).** El spec no fija qué hacer si
   `listUnitsAction` falla; se siguió el precedente literal de
   `app/(private)/produccion/formulas/[id]/page.tsx` y R7. La alternativa —degradar y seguir
   mostrando el catálogo sin selector de unidad— queda anotada por si el humano la prefiere.
4. **Teléfono y correo con `type="text"` + `inputMode`, no `type="tel"`/`type="email"` (T8).** El
   esquema del contrato público declara expresamente que **no** valida formato en ninguno de los
   dos; un `type="email"` añadiría una regla del navegador que el dominio no tiene.
5. **`Number.parseInt` en vez de la función global (T15).** La guardia de R41 prohíbe el literal
   `Number(` en todo archivo que mencione `cost`/`minPurchase`. La conversión solo toca
   `deliveryTime`, que es entero por contrato; los importes no se convierten nunca.
6. **jsdom aplica la validación de restricciones del navegador (T15).** Con `required` en la
   presentación y `step="1"` en el tiempo de entrega, el navegador corta antes de que corra el
   esquema de cliente. Los dos tests afectados afirman **lo que de verdad ocurre** (la operación no
   se invoca y el panel sigue abierto) en vez de un mensaje que en un navegador real tampoco
   aparecería. El mapeo `invalid_input` → campo sigue cubierto por lo que sí llega (costo `0.0000`).
7. **`tests/unit/proveedores-ui/`, no `tests/unit/proveedores/`.** `tasks.md > T17` dice
   `tests/unit/proveedores/**`, pero ahí viven los tests del módulo de backend (QC-43/QC-52). Se
   siguió el precedente de `tests/unit/recetas-ui/`. **Excepción heredada:**
   `tests/unit/proveedores/supplier-route-contract.test.ts` (T1–T3) quedó en la carpeta del módulo;
   funciona, pero es la única incoherencia de ubicación de la feature.

## Preguntas abiertas que la feature NO cierra

- **P1** (la línea tiene columna de imagen y nadie la llena) y **P2** (en qué se mide el mínimo de
  compra) siguen abiertas tal como las dejó el spec.
- **P4** (cómo se resuelve el nombre de la presentación) se implementó **como manda
  `design.md > 6.2`**: diccionario construido recorriendo páginas hasta
  `MAX_PRESENTATION_PAGES = 20` y marcador identificable cuando un nombre no se resuelve. **La
  solución de fondo sigue siendo una lectura nueva en `inventario` (por ids o sin paginar), que es
  ficha de backend y no entra aquí** (alternativa G, descartada). Si el catálogo de presentaciones
  crece por encima de la cota, la celda pinta el marcador —nunca el uuid—, pero el usuario deja de
  ver el nombre.

## Para el leader — lo que necesita decisión humana

1. **Playwright no carga `.env` en este worktree, y no es de QC-44.** Ningún spec E2E puede
   alcanzar Prisma con `pnpm exec playwright test` a secas: el proceso del runner no carga `.env`
   (Next sí, pero eso es el `webServer`) y con `prisma.config.ts` presente el cliente tampoco, así
   que todo `prisma.*` del spec revienta con
   `PrismaClientInitializationError: Environment variable not found: DATABASE_URL`.
   **`e2e/inventario.spec.ts` falla exactamente igual** en su `beforeAll`. El arreglo está fuera del
   alcance de esta ficha (`playwright.config.ts` con `globalSetup`/`process.loadEnvFile()`, o el
   script `e2e` de `package.json`). La verificación de T18 se hizo exportando las variables de
   `.env` en el shell, **sin tocar `.env` ni ningún archivo del repo**.
2. **Desviación 1** (el import de `product-form.tsx`) y **desviación 3** (unidades en error), por si
   se prefiere la otra salida en cualquiera de las dos.

## Ronda de correcciones del review (2026-09-04)

Tres de los seis hallazgos menores del `reviewer`, elegidos por el humano. Los otros tres quedan
como deuda anotada y **no se tocaron**.

- **Menor 1 — las unidades se pedían dos veces por render del detalle.** `buildCatalogDirectories`
  ya no llama a `listUnitsAction`: recibe por parámetro el catálogo que la página resolvió una sola
  vez y baja por props (R46). `buildUnitDirectory` pasa a ser una función pura sobre ese arreglo.
  El test que lo vigila ahora afirma **1** llamada y su título dice lo que afirma; en
  `catalog-directories.test.ts` el mock de `listUnitsAction` se conserva a propósito para afirmar
  que **no** se llama. Archivos: `catalog-directories.ts`, `catalog-list-section.tsx`,
  `catalog-directories.test.ts`, `supplier-detail-page.test.tsx`, `catalog-line-sheet.test.tsx`.
- **Menor 5 — `EMPTY_CELL` y `UNRESOLVED_CELL` eran el mismo glifo.** `UNRESOLVED_CELL` pasa a
  `(?)` y la columna de unidad distingue las dos ausencias: una línea **sin unidad** (R40, caso
  válido) pinta la marca de «sin dato» y **no** el marcador de R22, que queda para el `unitId` que
  el diccionario no resuelve. La distinción se localiza por `data-testid`
  (`catalog-unresolved-unitId` presente o ausente) y por constante importada, nunca por copy (R47).
  Archivos: `catalog-columns.ts`, `catalog-directories.ts` (comentario), `supplier-detail-page.test.tsx`.
- **Menor 6 — R29 contradecía a R30.** Corregido el texto de R29 en `requirements.md`: captura los
  **seis** campos de negocio y la ruta de imagen queda fuera por decisión, gobernada por R30. Sin
  tocar numeración, decisiones cerradas ni código.

Verificación de la ronda: `pnpm run typecheck` y `pnpm run lint` verdes; `vitest run
tests/unit/proveedores-ui/ --maxWorkers=2 --testTimeout=30000` verde (12 archivos, 141 tests). La trazabilidad sigue en
52/52: los tests de R22, R40 y R46 se ampliaron, ninguno se eliminó ni se movió de archivo.

## Segunda ronda: los tres centinelas de alcance de QC-43 (2026-09-04)

Los tres rojos que quedaron reportados sin tocar. **Ninguno era un defecto del código de QC-44**:
dos vigilaban una premisa que caducó **por diseño** y el tercero era un falso positivo de su propia
regex. Solo se tocaron tests; **cero cambios en producción**.

- **A — `tests/unit/proveedores/scope.test.ts` > `la pantalla de proveedores vive solo donde la
  declara QC-44, y en ningún otro sitio`** (antes «no existe ninguna pantalla… ni spec E2E nuevo»).
  Afirmaba R47 de QC-43: pantalla y E2E **diferidos** a QC-44 (decisión cerrada 8). QC-44 los
  construye (R1, R3, R51, R52). **Retensado, no borrado ni vaciado**, con el patrón exacto de
  `tests/unit/inventario/scope.test.ts`: nota fechada en la cabecera, la carpeta permitida derivada
  de `SUPPLIERS_ROUTE` (nunca un literal), y la defensa extra de que **lo excluido tiene que
  existir** (`(private)/proveedores/page.tsx` y `[id]/page.tsx`). Lo que sigue prohibido cae igual:
  cualquier pieza de proveedores fuera de esa carpeta, cualquier componente bajo `components/`, y
  un segundo spec E2E (la lista es cerrada: `['proveedores.spec.ts']`).
- **B — `tests/unit/proveedores/module-contract.test.ts` > `la feature no anade adaptadores driving
  ni rutas API, y la unica pantalla es la de QC-44`.** Misma premisa caducada: afirmaba que
  `app/(private)/proveedores` no existe. Sale de la lista de rutas prohibidas **solo esa**;
  `app/(private)/suppliers` y las dos de `app/api/` siguen. Se añade que la pantalla **debe**
  existir, que ningún archivo de `app/` **fuera** de ella puede mencionar el módulo, y —lo que R49
  sigue prohibiendo— que **ningún archivo de la pantalla declara `'use server'`**. Las listas
  exactas de `ports/`, `adapters/driven/` y `adapters/driving/` quedan intactas.
- **C — `module-contract.test.ts` > `el cableado puerto-implementacion de proveedores vive SOLO en
  lib/composition y una sola vez`. FALSO POSITIVO de la regex, no un aflojamiento.** El caso dice
  vigilar que nadie más que la composición instancie los adaptadores **driven**, pero filtraba
  `(adapters|ports)/`, que atrapaba también `adapters/driving/`. Los siete archivos señalados solo
  importaban `adapters/driving/supplier-actions` (4) y `supplier-catalog-actions` (3) —las Server
  Actions, el único camino que R43 autoriza, y lo mismo que hace QC-22 con `product-actions`—.
  La regex se **estrecha** a `(adapters\/driven|ports)\/`. Las otras cuatro afirmaciones del caso
  (nueve claves de la fachada, `productCatalog` único, flecha driving→composición→driven, y que los
  driving piden la fachada) **no se tocaron**.

**Falsabilidad comprobada de verdad**, mutando el repo y revirtiendo (no de palabra):

| Mutación introducida | Cae |
| --- | --- |
| `app/api/proveedores/route.ts` | A (pieza fuera de la carpeta), B (ruta prohibida) y el caso de route handlers |
| `components/supplier-card.tsx` | A (componente bajo `components/`) |
| `e2e/suppliers.spec.ts` | A (lista cerrada de specs) |
| borrar `(private)/proveedores/page.tsx` | A y B (la exclusión sobra si lo excluido no existe) |
| `'use server'` en un archivo de la pantalla | B (R49) |
| `import … from '@/lib/…/proveedores/adapters/driving/…'` en `app/(private)/dashboard/page.tsx` | B (menciona el módulo fuera de la pantalla) |
| `import … adapters/driven/persistence/supplier-prisma` desde `app/` | C |
| `import … ports/supplier-repository` desde `app/` | C |
| `import … ports/supplier-repository` desde `lib/shared/pagination.ts` | C |

**Trazabilidad: sigue 52/52 y ningún mapeo `R<n> -> test` cambia.** Los tres casos son centinelas de
alcance de **QC-43**, no portadores del mapeo de ningún requisito de QC-44; A refuerza R1/R3/R51/R52
y B refuerza R49, que ya tenían su test propio.

Verificación de la ronda (ejecutada por ruta explícita, porque estos archivos **barren el sistema de
archivos y no importan nada**, así que `vitest related` no los relaciona con ningún cambio y no se
llaman `guard*`: solo salen en la suite completa — esa es la razón de que se escaparan):

```
pnpm typecheck   → verde (tsc --noEmit, sin salida)
pnpm lint        → verde (eslint, sin salida)
pnpm exec vitest run tests/unit/proveedores/scope.test.ts \
  tests/unit/proveedores/module-contract.test.ts \
  tests/unit/inventario/scope.test.ts --maxWorkers=2 --testTimeout=30000
  → Test Files  3 passed (3)
    Tests  18 passed (18)
```
