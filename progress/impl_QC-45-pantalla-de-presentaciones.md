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
