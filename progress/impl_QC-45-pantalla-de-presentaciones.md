# QC-45 — pantalla-de-presentaciones · bitacora de implementacion

> Fase 2. Spec aprobado por el humano el 2026-09-07.
>
> **RECORTE DE ALCANCE (decision humana del 2026-09-08):** la **T2** («Seccion Configuracion y
> ocultado por rol») **NO se implementa** en esta ficha. QC-75 (`menu-y-rutas-por-permiso`) esta
> `in_progress` y reescribe `lib/shared/navigation/private-nav.ts`, `app/(private)/layout.tsx` y
> las reglas de ruta; T2 iria en direccion contraria (ocultado por ROL que QC-75 sustituye por
> ocultado por PERMISO). Consecuencia: **la pantalla existe, esta protegida y funciona, pero NO
> esta enlazada desde el menu.** T12 (cierre) queda sin marcar por lo mismo.

## T0 — Inventario de lo heredado (verificado en el worktree, no supuesto)

Comando: inspeccion directa del worktree `.worktrees/QC-45-pantalla-de-presentaciones/`, rama
`feature/QC-45-pantalla-de-presentaciones`, arbol limpio salvo `specs/QC-45-*` sin trackear.

| Heredado | Evidencia comprobada |
| --- | --- |
| Layout privado con su `<main>` (via `SidebarInset`) y su `<Toaster />` | `app/(private)/layout.tsx:65` (`SidebarInset data-testid="private-content"`), `:102` (`<Toaster richColors />`) |
| `AppSidebar` y `PRIVATE_NAV_ITEMS`, repartidos por props desde el layout | `app/(private)/layout.tsx:5,59` |
| Tabla compartida con barrel cerrado | `components/shared/data-table/index.ts` (10 archivos en la carpeta) |
| `DataTableColumn.cell` devuelve `ReactNode`; `pinnable?: boolean`; `emptyAction?: ReactNode` | `data-table-types.ts:68`, `:74`, `:147` |
| Primitivas presentes: `table`, `sheet`, `alert-dialog`, `select`, `input`, `label`, `button`, `sonner`, `skeleton` | `components/ui/` (23 archivos) |
| Las cuatro Server Actions de presentacion | `lib/modules/inventario/adapters/driving/presentation-actions.ts:63,81,100,128` |
| `PRESENTATION_QUERYABLE` con `sortable: ['name','createdAt','updatedAt']`, `searchable: true` | `lib/modules/inventario/domain/presentation-queryable.ts:12-16` |
| `tests/helpers/viewport.ts` | presente |
| Playwright montado con 9 specs | `e2e/` |
| `PRIVATE_ROUTE_PREFIXES` con 5 filas y su guardia | `lib/shared/routes.ts` |
| `ROUTE_ROLE_RULES` con 4 filas | `lib/composition/route-role-rules.ts` |

**Ninguno de esos archivos se creo ni se modifico en T0.** Cumple R33 y el riesgo 1 de `design.md > 12`.

## Tasks: que se hizo y que no

| Task | Estado | Nota |
| --- | --- | --- |
| T0 Inventario de lo heredado | **hecha** | tabla de arriba; no se creo ni modifico nada |
| T1 Ruta + prefijo privado + regla ruta->rol | **hecha** | diff minimo en `route-role-rules.ts`: 1 linea de import + 1 fila |
| **T2 Seccion Configuracion y ocultado por rol** | **NO SE HACE** | recorte de alcance (arriba). R3 y R4 sin cubrir |
| T3 `presentation-list-params.ts` | **hecha** | |
| T4 Columnas + acciones de fila | **hecha** | |
| T5 Pagina + seccion + tres estados | **hecha** | |
| T6 `presentation-table.tsx` | **hecha** | |
| T7 Panel lateral + formulario | **hecha** | |
| T8 Dialogo de borrado | **hecha** | |
| T9 Barrel de la ruta + convenciones | **hecha** | |
| T10 Multiplataforma | **hecha salvo la comprobacion manual en WebKit** | `tasks.md` la marca como casilla que no se marca sola |
| T11 E2E | **hecha y verde** | Chromium y WebKit |
| **T12 Cierre** | **NO se marca completa** | el gate completo no esta en verde por deuda ajena (abajo) y la pantalla no esta enlazada desde el menu |

## Archivos creados

Pantalla (`app/(private)/configuracion/presentaciones/`): `page.tsx` y, en `components/`,
`index.ts` (barrel), `presentation-list-params.ts`, `presentation-list-section.tsx`,
`presentation-list-skeleton.tsx`, `presentation-list-empty.tsx`, `presentation-list-error.tsx`,
`presentation-table.tsx`, `presentation-columns.tsx`, `presentation-row-actions.tsx`,
`presentation-sheet.tsx`, `presentation-form.tsx`, `delete-presentation-dialog.tsx`.

Tests: `tests/unit/configuracion-ui/` (10 archivos) y `e2e/presentaciones.spec.ts`.

## Archivos heredados modificados

**De produccion, solo dos**, los que R33 autoriza (los otros dos que R33 permitia —`private-nav.ts`
y `layout.tsx`— NO se tocan, por el recorte de T2):

- `lib/shared/routes.ts` — `PRESENTATIONS_ROUTE` + su fila en `PRIVATE_ROUTE_PREFIXES`.
- `lib/composition/route-role-rules.ts` — **+6 lineas, 0 borradas, 0 reordenadas** (1 import + 1 fila
  + comentario), a proposito, para que el merge con QC-75 sea limpio.

**De test: cuatro guardias heredadas con LISTA CERRADA**, cuyo punto de extension por diseno es
justamente que cada consumidor nuevo las amplie. No estaban previstas en `tasks.md`; se documentan
aqui porque son una decision que hubo que tomar:

- `tests/unit/identity/route-role-rules.test.ts` — «cuatro reglas» -> cinco.
- `tests/unit/inventario/scope.test.ts` — excepcion declarada y comentada para la ruta de
  presentaciones, derivada de la constante; la guardia sigue mordiendo si la pantalla de **productos**
  se dispersa, y dentro de la excepcion solo se perdona lo que casa por «presentation».
- `tests/unit/shared/data-table-alcance.test.ts` — las dos listas cerradas (consumidores de la tabla
  compartida y specs E2E que la referencian) ganan la ruta/el spec de presentaciones; los centinelas
  anti-falso-verde se suben en consecuencia.
- `tests/unit/recetas-ui/recipe-route-contract.test.ts` — la lista cerrada de constantes exportadas
  por `lib/shared/routes.ts` (QC-64 R12) gana `PRESENTATIONS_ROUTE`.

## Mapa `R<n> -> test`

`CU` = `tests/unit/configuracion-ui/`.

| R | Test | Estado |
| --- | --- | --- |
| R1 | `CU/presentation-page.test.tsx` — pagina en la ruta derivada de la constante, sin `main` propio | verde |
| R2 | `CU/presentations-route-contract.test.ts` + `CU/configuracion-convenciones.test.ts` | verde |
| **R3** | `CU/private-nav-configuracion.test.ts` | **NO CUBIERTO — T2 recortada** |
| **R4** | `CU/private-nav-configuracion.test.ts` + `tests/unit/private-layout.test.tsx` | **NO CUBIERTO — T2 recortada** |
| R5 | `tests/guards/guard-rutas-privadas-cubiertas.test.ts` + `CU/presentations-route-contract.test.ts` | verde |
| R6 | `CU/presentations-route-contract.test.ts` (`findRouteRule`) + `e2e/presentaciones.spec.ts` recorrido 2 | verde |
| R7 | `CU/presentation-page.test.tsx` — `unauthorized` pinta error y ninguna fila | verde |
| R8 | `CU/presentation-table.test.tsx` + `CU/configuracion-convenciones.test.ts` | verde |
| R9 | `CU/presentation-columns.test.tsx` — recorre la declaracion; ninguna columna prohibida | verde |
| R10 | `CU/presentation-table.test.tsx` — buscar navega; filas tal cual llegan | verde |
| R11 | `CU/presentation-table.test.tsx` — ordenar navega; acciones ni ordenan ni filtran | verde |
| R12 | `CU/presentation-table.test.tsx` + `CU/presentation-list-params.test.ts` | verde |
| R13 | `CU/presentation-table.test.tsx` — anterior/siguiente e indicador de pagina | verde |
| R14 | `CU/presentation-list-params.test.ts` — entradas basura producen lista, nunca error | verde |
| R15 | `CU/presentation-page.test.tsx` — vacio con «crear la primera» y enlace a la primera pagina | verde |
| R16 | `CU/presentation-page.test.tsx` — el esqueleto ocupa el lugar de la tabla | verde |
| R17 | `CU/presentation-page.test.tsx` — error con mensaje y reintento, nunca tabla vacia | verde |
| R18 | `CU/configuracion-viewport.test.tsx` — `overflow-x-auto` en el envoltorio de la tabla | verde |
| R19 | `CU/presentation-columns.test.tsx` — los dos botones, con nombre accesible por presentacion | verde |
| R20 | `CU/data-table-intacta.test.ts` | verde |
| R21 | `CU/presentation-sheet.test.tsx` — panel, sin navegar y sin modal centrado | verde |
| R22 | `CU/presentation-sheet.test.tsx` — solo el campo `name` | verde |
| R23 | `CU/presentation-sheet.test.tsx` — edicion precargada y reemplazo completo | verde |
| R24 | `CU/presentation-sheet.test.tsx` — error por codigo, en linea, panel abierto | verde |
| R25 | `CU/presentation-sheet.test.tsx` + `CU/delete-presentation-dialog.test.tsx` | verde |
| R26 | `CU/presentation-sheet.test.tsx` (en negativo: la pantalla no monta region propia) | **parcial** — el aserto «exactamente una en la zona privada» vivia en `private-layout.test.tsx`, que la T2 recortada no toca |
| R27 | `CU/delete-presentation-dialog.test.tsx` — nombra la presentacion; sin confirmar no invoca | verde |
| R28 | `CU/delete-presentation-dialog.test.tsx` — `presentation_in_use` dentro del dialogo | verde |
| R29 | `CU/configuracion-convenciones.test.ts` — carpeta y barrel, sin imports profundos | verde |
| R30 | `CU/configuracion-convenciones.test.ts` — sin `fetch` propio | verde |
| R31 | `tests/guards/guard-dependencias-aprobadas.test.ts` + `CU/configuracion-convenciones.test.ts` | verde |
| R32 | `CU/configuracion-convenciones.test.ts` | verde |
| R33 | `CU/data-table-intacta.test.ts` + la nota de T0 de arriba | verde |
| R34 | `CU/configuracion-viewport.test.tsx` (angosto y ancho, 44x44, 16 px, sin `100vh`) | verde |
| R35 | `CU/configuracion-convenciones.test.ts` | verde |
| R36 | `e2e/presentaciones.spec.ts` — recorridos 1 y 2 | verde |

**Sin cubrir: R3 y R4** (los hereda QC-75) y **R26 parcialmente**. Ninguno por descuido: los tres
son consecuencia directa del recorte de T2.

## Comandos y su salida real

**Suite de la feature + guardias + las cuatro guardias heredadas ampliadas**

```
$ set -a && . ./.env && set +a && pnpm vitest run tests/unit/configuracion-ui tests/guards \
    tests/unit/identity/route-role-rules.test.ts tests/unit/inventario/scope.test.ts \
    tests/unit/shared/data-table-alcance.test.ts

 Test Files  30 passed (30)
      Tests  324 passed (324)
```

**Solo la pantalla** (10 archivos de test propios)

```
$ pnpm vitest run tests/unit/configuracion-ui
 Test Files  10 passed (10)
      Tests  121 passed (121)
```

**E2E, Chromium y WebKit** (R36, R6)

```
$ set -a && . ./.env && set +a && pnpm exec playwright test e2e/presentaciones.spec.ts

  OK 1 [chromium] un usuario que no es Administrador acaba fuera y no ve la tabla (R6) (46.7s)
  OK 2 [webkit]   un usuario que no es Administrador acaba fuera y no ve la tabla (R6) (51.1s)
  OK 4 [chromium] el Administrador entra por la URL, da de alta una presentacion y la ve en la
                  lista filtrando por su nombre (R36) (1.0m)
  OK 3 [webkit]   el Administrador entra por la URL, da de alta una presentacion y la ve en la
                  lista filtrando por su nombre (R36) (1.1m)

  4 passed (1.9m)
```

**Gate completo — NO esta en verde, y el rojo NO es de esta feature**

```
$ set -a && . ./.env && set +a && ./init.sh

 Test Files  16 failed | 227 passed (243)
      Tests  74 failed | 2825 passed | 64 skipped (2963)

hay 14 archivo(s) de test en rojo que NO estan en el baseline:
  tests/integration/{inventario,pedidos,proveedores,recetas,unidades}/**  (14 archivos)
x hay rojos NUEVOS respecto del baseline
```

`typecheck` y `lint` en verde; **los 14 rojos son todos de `tests/integration/`**, ninguno de
`tests/unit/` ni de `tests/guards/`.

### Causa raiz de los 14 rojos: la migracion de QC-76 sobre la base compartida

No es deuda de `dev` ni de esta feature, asi que **no se ha anadido a `tests/baseline-rojos.json`**:
es una colision entre worktrees que corren contra **la misma base real**.

Los 14 archivos fallan todos con lo mismo, al sembrar unidades:

```
PrismaClientKnownRequestError: Unique constraint failed on the fields: (`symbol`)
  -> tests/integration/unidades/unit-repository.int.test.ts:66  prisma.unit.create(
     data: { name, nameNormalized: marker+suffix, symbol: 'x' }
```

Los fixtures aleatorizan `nameNormalized` pero fijan `symbol: 'x'`, porque cuando se escribieron
`symbol` **no era unico**. Consultada la base real:

```
units_system_symbol_unique  CREATE UNIQUE INDEX ... ON public.units (symbol)
                            WHERE ((company_id IS NULL) AND (symbol IS NOT NULL))
units_company_symbol_unique CREATE UNIQUE INDEX ... ON public.units (company_id, symbol) ...

_prisma_migrations (ultima aplicada): 20260907190000_units_equivalence_and_scope
```

Esa migracion **no existe en esta rama** (`db/migrations/` de este worktree termina en
`20260907183034_permissions_and_role_permissions`) y **si existe en
`.worktrees/QC-76-equivalencia-y-ambito-de-unidades/db/migrations/`**. El `schema.prisma` de esta
rama sigue diciendo, literalmente, que «`symbol` NO tiene indice unico y es deliberado (R7)».

O sea: **QC-76 aplico su migracion a la base compartida y eso rompe los tests de integracion de
todos los worktrees**, incluidos los de modulos que no tienen nada que ver (pedidos, proveedores,
recetas), porque todos siembran unidades. Esta feature es de frontend puro y no toca `db/`,
`lib/modules/` ni ningun fixture de integracion.

**No se ha tocado nada para «arreglarlo»**: limpiar filas o revertir el indice en una base que otras
dos sesiones estan usando seria romperles el trabajo. Queda escalado al leader.

### Nota de entorno

Este worktree **se monto sin `.env`** (los de QC-75 y QC-76 si lo tienen). Sin el, `next dev` y el
proceso de Playwright no ven `DATABASE_URL` y el E2E no arranca. Se copio el `.env` del repo
principal al worktree; esta en `.gitignore`, asi que **no entra en el commit**. Ademas, el proceso de
Playwright no carga `.env` por su cuenta (el repo no usa `dotenv`), asi que el E2E hay que lanzarlo
con las variables exportadas: `set -a && . ./.env && set +a && pnpm exec playwright test`.
El puerto 3117 de Playwright es **fijo y compartido entre worktrees**: dos E2E simultaneos se
excluyen (`reuseExistingServer: false`).

## Decisiones que hubo que tomar y no estaban en el spec

1. **T1 y T5 se cerraron como UNA tanda.** El diseno (§12.2) justifica que T1 vaya antes que T5
   porque «con `page.tsx` y sin prefijo la guardia se pone roja». Cierto, pero
   `guard-rutas-privadas-cubiertas` es **bidireccional**: tambien se pone roja con **prefijo y sin
   `page.tsx`**, y no tiene valvula de escape. El criterio de hecho de T1 («`tests/guards` en
   verde») es por tanto inalcanzable en aislamiento: `PRIVATE_ROUTE_PREFIXES` y el arbol de
   `app/(private)/` tienen que cambiar en la misma tanda. No se toco la guardia.
2. **Ampliar cuatro guardias heredadas de lista cerrada** (arriba). Se ampliaron en vez de
   silenciarlas, y en el caso de `scope.test.ts` la excepcion se dejo **mas estrecha** que las dos que
   ya existian (QC-26 y QC-44).
3. **El titulo de la pantalla es una constante local en `page.tsx`**, no `PRESENTATIONS_LABEL` de
   `private-nav.ts` como queria el diseno: ese archivo esta congelado por el recorte de T2. Ningun
   test afirma sobre ese literal. **Cuando QC-75 cree el item de menu, es el sitio natural para
   unificarlo.**
4. **La fuente >= 16 px se afirma sobre el campo propio de la pantalla**, no sobre el buscador de la
   tabla compartida: ese input vive en `components/shared/data-table/`, que R20 prohibe tocar.
   Anotado por si el reviewer quiere abrirlo en QC-56.
5. **El E2E navega SIEMPRE por URL** (`page.goto` derivado de `PRESENTATIONS_ROUTE`), nunca por el
   menu, porque el item de menu no existe. Queda escrito en la cabecera del spec con su motivo.

## Lo que falta

1. **La pantalla no esta enlazada desde el menu** (T2 recortada): hoy solo se llega por URL. R3 y R4
   sin cubrir, R26 parcial. **Lo hereda QC-75.**
2. **La comprobacion manual en un WebKit real** del scroll contenido en la tabla (T10). El E2E si
   corrio en WebKit y paso, pero eso no es la comprobacion manual que `tasks.md` pide.
3. **El gate completo en verde** (T12), bloqueado por la migracion de QC-76 sobre la base compartida.

## Ronda 2 — adaptación a QC-75 (2026-09-08)

> La ronda 1 de arriba **no se toca**: queda como está, con su recorte de alcance y sus deudas. Lo
> que sigue es lo que cambió al mergear `origin/dev`, que trae **QC-75
> (`menu-y-rutas-por-permiso`)**, y que **levanta** el recorte de T2.

### Qué cambió QC-75 debajo de esta feature

1. **Borró `lib/composition/route-role-rules.ts`** y con él el mecanismo ruta→rol entero (QC-75
   R16). El middleware ya sólo comprueba firma, caducidad y empresa: **no corta por rol**.
2. **El corte pasa a cada `page.tsx`**: `await requirePagePermission('<codigo>')`
   (`@/lib/modules/identity/adapters/driving/require-page-permission`), que redirige al login sin
   sesión y hace `notFound()` —404 dentro del layout privado— si falta el permiso.
3. **El menú se filtra en el servidor**:
   `filterNavItemsByPermissions(PRIVATE_NAV_ITEMS, user.permissions)` en `app/(private)/layout.tsx`,
   con `NavLink.permission` **obligatorio**. No existe `adminOnly` ni `visibleNavItems`.
4. **El login ya no lleva a todo el mundo al dashboard** (R11): aterriza en el primer ítem visible
   del menú. El Operador del seed aterriza en `/inventario`.

### Cómo se resolvió el conflicto del merge

El merge de `origin/dev` lo resolvió el humano antes de esta ronda, **aceptando el borrado** de
`lib/composition/route-role-rules.ts` y de `tests/unit/identity/route-role-rules.test.ts` — la
ronda 1 había añadido a ese archivo la fila
`{ prefix: PRESENTATIONS_ROUTE, roles: [ROLE_ADMINISTRADOR] }`, y conservarla habría sido resucitar
un mecanismo que ya no lee nadie. Esta ronda **no commitea**: el árbol de trabajo queda con los
cambios y el commit lo hace el humano.

### Decisión de permiso (cerrada por el leader, no reabierta aquí)

La pantalla y su ítem de menú exigen **`inventario.modificar`**, no `inventario.consultar`.
Administrar el catálogo de presentaciones —alta, edición y borrado viven todos en esta pantalla
(R21, R27)— **es modificar inventario**. El Operador del seed lleva `inventario.consultar` y sólo
ese: con `consultar` entraría a una pantalla cuyo propósito entero es escribir. **No se creó ningún
permiso nuevo ni se tocó `lib/modules/identity/domain/permissions.ts`.** Es además el par del menú
que comparte módulo y difiere en la acción, así que es donde un filtrado que comparase por prefijo
de módulo se colaría: por eso hay un caso dedicado a ello en `private-layout-menu.test.tsx`.

### Archivos creados

| Archivo | Qué es |
| --- | --- |
| `tests/unit/configuracion-ui/private-nav-configuracion.test.ts` | **T2.** Una sola sección «Configuración» con un solo ítem, que apunta a `PRESENTATIONS_ROUTE` y declara `inventario.modificar`; ningún ítem de la sección lleva a una ruta sin `page.tsx` (comprobado en disco); con `SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]` están el ítem y la sección, con los del Operador desaparecen los dos y no queda encabezado huérfano |

### Archivos modificados

| Archivo | Cambio |
| --- | --- |
| `lib/shared/navigation/private-nav.ts` | **T2.** `NAV_SECTION_CONFIGURATION`, `PRESENTATIONS_LABEL` y el ítem `nav-presentaciones` como **última** entrada de nivel superior: `href: PRESENTATIONS_ROUTE` (importada de `../routes`, nunca el literal), `icon: 'boxes'` (ya existía en `NavIconName` y en `NAV_ICONS`), `permission: 'inventario.modificar'`. Comentario que deja escrito que la sección nace con un solo ítem a propósito («Unidades» llega con QC-39) y que el ocultado lo hace el filtrado por permiso de QC-75, no un `adminOnly`. **`AppSidebar` no se tocó** |
| `app/(private)/configuracion/presentaciones/page.tsx` | `await requirePagePermission('inventario.modificar')` como **primera** línea del componente, antes de resolver `searchParams` y de pintar nada. `PAGE_TITLE` local sustituida por `PRESENTATIONS_LABEL` importada (cierra la deuda nº 3 de la ronda 1). JSDoc reescrito: ya no dice que el corte lo hace el middleware con la regla ruta→rol ni que T2 no se ejecuta |
| `tests/guards/guard-pantallas-exigen-permiso.test.ts` | Ancla anti-vacuidad: `RUTAS_ESPERADAS_HOY` gana `/configuracion/presentaciones` (8 → 9 pantallas); «ocho» → «nueve» en el `it` y en los dos JSDoc |
| `tests/guards/guard-nav-permisos-declarados.test.ts` | Ancla: `toHaveLength(5)` → `6` y la lista ordenada gana `nav-presentaciones` |
| `tests/unit/app-sidebar.test.tsx` | Ancla: `PRIVATE_NAV_ITEMS` `toHaveLength(5)` → `6` y `nav-presentaciones` al final del orden exacto, con el comentario de ampliación en el estilo que ya usaban QC-44 y QC-35 |
| `tests/unit/navegacion/private-layout-menu.test.tsx` | El mapa de `testId` gana `presentaciones`; el caso «con solo `inventario.consultar`» afirma además que `nav-presentaciones` es `null`; «sin ningún permiso» y «con los diez permisos» lo incluyen; el ancla pasa a seis ítems; **dos casos nuevos** con `SEED_ROLE_PERMISSIONS` importados: el layout pinta el ítem con los permisos del Administrador y no lo pinta con los del Operador |
| `tests/unit/configuracion-ui/presentations-route-contract.test.ts` | Fuera `ROUTE_ROLE_RULES`, `findRouteRule` y el archivo borrado. Sigue afirmando la constante, su presencia única en `PRIVATE_ROUTE_PREFIXES` y la no duplicación; el consumidor que la importa pasa a ser `private-nav.ts`. Cuatro casos nuevos de fuente sobre `page.tsx` (comentarios quitados antes de juzgar, como la guardia): exige el código derivado del catálogo, la llamada va **antes** de `await searchParams`, **no** es `inventario.consultar`, y el ítem de menú declara el mismo código |
| `tests/unit/configuracion-ui/configuracion-convenciones.test.ts` | En la lista de archivos legítimos del caso de R31, `lib/composition/route-role-rules.ts` → `lib/shared/navigation/private-nav.ts`, que es el archivo heredado que esta feature ahora modifica (R33) |
| `tests/unit/configuracion-ui/presentation-page.test.tsx` | La página es `async` y llama a `requirePagePermission`: se mockea **el proveedor de sesión** (`@/lib/composition`), no `requirePagePermission`, así el corte se ejecuta de verdad y el archivo sigue afirmando exactamente lo mismo sobre los tres estados |
| `tests/unit/configuracion-ui/configuracion-viewport.test.tsx` | El mismo mock, por el mismo motivo: sin él `cookies()` revienta fuera de una petición real |
| `e2e/presentaciones.spec.ts` | Recorrido 2 adaptado: `response.status() === 404` y `private-not-found` visible, en vez del `waitForURL` al dashboard de la regla ruta→rol; cabecera reescrita. Además `login()` recibe el aterrizaje esperado, porque desde QC-75 R11 el Operador aterriza en `/inventario` y no en el dashboard —dar por hecho el dashboard dejaba el `waitForURL` colgado— |
| `specs/QC-45-pantalla-de-presentaciones/tasks.md` | T1 y T2 reescritas al mecanismo nuevo, aviso de recorte levantado, mapa `R<n> → test` actualizado para R3–R6, T12 con su primera viñeta cerrada. **`requirements.md` NO se toca** |

### Mapa `R<n> -> test` actualizado (sólo los que cambiaron)

| R | Test |
| --- | --- |
| R3 | `tests/unit/configuracion-ui/private-nav-configuracion.test.ts` — una sección, un ítem, destino y `testId` únicos, ninguna ruta sin `page.tsx` + `tests/unit/app-sidebar.test.tsx` (orden exacto de `PRIVATE_NAV_ITEMS`) |
| R4 | `tests/unit/configuracion-ui/private-nav-configuracion.test.ts` (`filterNavItemsByPermissions` con `SEED_ROLE_PERMISSIONS`: Administrador sí, Operador no, sin encabezado huérfano) + `tests/unit/navegacion/private-layout-menu.test.tsx` (sobre el árbol renderizado) |
| R5 | `tests/guards/guard-rutas-privadas-cubiertas.test.ts` + `presentations-route-contract.test.ts` (la constante está en `PRIVATE_ROUTE_PREFIXES` exactamente una vez) |
| R6 | `presentations-route-contract.test.ts` (la pantalla exige `inventario.modificar` antes de leer `searchParams`; el ítem declara el mismo código) + `tests/guards/guard-pantallas-exigen-permiso.test.ts` + `e2e/presentaciones.spec.ts` (recorrido 2: 404 dentro del layout privado) |

### Verificación

Antes del gate hubo que **regenerar el cliente de Prisma** (`pnpm exec prisma generate --schema
db/schema.prisma`): el merge trae el esquema de QC-76 (`units.company_id`, `unit_id`, `factor`) y el
cliente generado en este worktree era el anterior, así que `typecheck` fallaba en `unidades` por
tipos que ya no existían. Es un artefacto local, no un cambio en el repo.

```
$ ./init.sh --rapido
== Arnes SDD :: init (modo: rapido) ==
✓ node v22.13.1
✓ dependencias presentes
✓ regla max-2-por-zona respetada (in_progress=4)
✓ specs presentes para features sdd en vuelo
✓ ninguna ficha sembrada esperando al board
✓ cada spec sembrado tiene su ficha, con el mismo slug
✓ worktrees bajo control (4 ademas del principal)
✓ typecheck paso
✓ lint paso
[test:rapido] tests relacionados con 28 archivo(s) del diff vs origin/dev
...
 FAIL  |node| tests/unit/pedidos-ui/pedidos-convenciones.test.ts > la feature no toca lo que tiene
 prohibido tocar (R42, R46) > no modifica los modulos, el esquema de datos ni el punto de composicion
AssertionError: la feature toca archivos intocables:
  db/migrations/20260907190000_units_equivalence_and_scope/down.sql,
  db/migrations/20260907190000_units_equivalence_and_scope/migration.sql,
  lib/modules/identity/adapters/driving/login-action.ts,
  lib/modules/identity/adapters/driving/require-page-permission.ts,
  lib/modules/identity/adapters/driving/route-guard-middleware.ts,
  lib/modules/identity/domain/route-access.ts,
  lib/modules/identity/domain/route-role-rules.ts,
  lib/modules/identity/index.ts,
  lib/modules/unidades/**  (13 archivos): expected [ …(17) ] to deeply equal []
 ❯ tests/unit/pedidos-ui/pedidos-convenciones.test.ts:606:89

 Test Files  1 failed | 81 passed (82)
      Tests  1 failed | 986 passed | 4 skipped (991)
   Duration  63.50s
✗ 'pnpm run test:rapido' fallo
```

**El único rojo NO es de esta ficha y desaparece al commitear el merge.**
`tests/unit/pedidos-ui/pedidos-convenciones.test.ts` (guardia de alcance de QC-35) calcula lo tocado
como «los commits marcados `QC-35` en `origin/dev..HEAD` **más todo lo que devuelva
`git status --porcelain`**», y ahora mismo `git status` devuelve el merge de `origin/dev` sin
commitear: los diecisiete archivos que denuncia son **de QC-75 y QC-76**, ninguno lo tocó esta
ronda. En cuanto el humano commitee el merge, el árbol de trabajo queda limpio y la guardia vuelve a
verde sin cambiar una línea.

Antes de commitear, y como comprobación adicional de lo que sí es nuestro:

```
$ pnpm exec vitest run tests/guards tests/unit/configuracion-ui tests/unit/navegacion tests/unit/app-sidebar.test.tsx
 Test Files  38 passed (38)
      Tests  424 passed (424)
```

Esa corrida ampliada deja **un segundo rojo, tambien ajeno y tambien atado al merge sin
commitear**: `tests/unit/navegacion/qc75-convenciones.test.ts > el rango de la rama trae archivos y
contiene el trabajo de QC-75`. Es el ancla anti-vacuidad de QC-75, que exige que
`git diff --name-only origin/dev...HEAD` traiga `lib/shared/navigation/private-nav.ts`. Ese rango
mira **commits**, no el árbol de trabajo, así que hoy no ve ni el merge ni la modificación de esta
ronda; en cuanto el humano commitee, el archivo entra en el rango y el ancla vuelve a verde. No lo
corre `./init.sh --rapido` (no es una guardia y no está entre los tests relacionados con el diff),
por eso aparece sólo en la corrida ampliada. Ya estaba rojo antes de tocar nada en esta ronda.

**El E2E NO se ejecutó** (el puerto 3117 es compartido con otros worktrees), y
`./init.sh` completo tampoco: `tests/integration/` está rojo por una base de datos compartida, ajeno
a esta ficha. No se tocó `tests/integration/` ni `tests/baseline-rojos.json`.

### Requisitos DESFASADOS — no se reescribe `requirements.md`, lo decide el humano

QC-75 dejó cuatro requisitos de esta ficha describiendo un mecanismo que ya no existe. **El código y
los tests cumplen su INTENCIÓN**, no su letra. Se dejan aquí con una propuesta de reformulación; el
arreglo del texto es decisión humana y no se ha tocado `requirements.md`.

1. **R4 — habla de ocultar por ROL.** Dice que el ítem se oculta a quien no sea Administrador. Hoy
   no hay ocultado por rol en ninguna parte: se oculta por **permiso**, y el filtrado lo hace el
   layout privado con `filterNavItemsByPermissions`.
   *Propuesta:* «Cuando la sesión no incluya el permiso `inventario.modificar`, el sistema no
   emitirá el ítem de menú de presentaciones ni el encabezado de su sección en el HTML servido.»
2. **R5 — enumera la lista de prefijos privados.** Sigue siendo verdad —`PRIVATE_ROUTE_PREFIXES`
   existe y el middleware la usa para exigir sesión—, pero el texto la ata a la regla ruta→rol como
   si fueran una sola cosa.
   *Propuesta:* separar las dos frases: la ruta está cubierta por `PRIVATE_ROUTE_PREFIXES` (exige
   **sesión**, en el borde) y el permiso lo exige la pantalla (exige **autorización**, en el
   servidor). Son dos controles distintos y hoy viven en sitios distintos.
3. **R6 — regla *ruta→rol* restringida al Administrador.** El mecanismo entero desapareció con
   QC-75 R16.
   *Propuesta:* «Cuando una sesión válida sin el permiso `inventario.modificar` solicite
   `PRESENTATIONS_ROUTE`, el sistema responderá 404 sin distinguirlo de una ruta inexistente y sin
   mencionar el módulo ni los permisos; sin sesión, redirigirá al login con el destino de vuelta.»
4. **R33 — enumera los archivos heredados modificables citando «reglas ruta→rol».** Uno de los
   archivos que autoriza a tocar ya no existe.
   *Propuesta:* sustituir «`lib/composition/route-role-rules.ts` (reglas ruta→rol)» por
   «`lib/shared/navigation/private-nav.ts` (ítem y sección del menú)», que es el archivo heredado
   que esta feature amplía de verdad. Ya está reflejado así en el caso de R31 de
   `configuracion-convenciones.test.ts`.

### Deudas de la ronda 1 que esta ronda cierra

- **«La pantalla no está enlazada desde el menú» (T2 recortada, R3 y R4 sin cubrir):** cerrada. El
  ítem existe, está filtrado por permiso y tiene tests.
- **«El título de la pantalla es una constante local en `page.tsx`» (decisión nº 3):** cerrada.
  `page.tsx` importa `PRESENTATIONS_LABEL` de `private-nav.ts`, como pedía el diseño.
- **«El E2E navega siempre por URL porque el ítem de menú no existe» (decisión nº 5):** el ítem ya
  existe, pero el E2E **sigue navegando por URL** a propósito: lo que este spec afirma es el camino
  de la pantalla, y el filtrado del menú ya lo cubre `e2e/permisos.spec.ts` con sus fixtures. El
  motivo actualizado está escrito en la cabecera del spec.

### Lo que sigue faltando

1. **La comprobación manual en un WebKit real** del scroll contenido en la tabla (T10). Sin cambios
   respecto a la ronda 1.
2. **El gate completo en verde** (T12): `tests/integration/` sigue rojo por la base compartida, y
   `pedidos-convenciones` seguirá rojo mientras el merge esté sin commitear.
3. **Reformular R4, R5, R6 y R33** en `requirements.md`, si el humano lo aprueba.
