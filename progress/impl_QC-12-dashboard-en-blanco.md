# QC-12 — dashboard-en-blanco · bitácora de implementación

> Rama: `feature/QC-12-dashboard-en-blanco` · worktree `.worktrees/QC-12-dashboard-en-blanco/`
> Zona: `frontend` · Implementada por `implementer` delegando en `frontend_dev` · 2026-09-02
> Spec congelado y aprobado por el humano el 2026-09-02.

## Veredicto

Las tasks T0–T8 están hechas. Los **12 requisitos (R1–R12)** tienen test nombrado y en verde:
**2 archivos de test, 14 tests, 14 pasando**. La feature es **puramente aditiva**: 8 archivos
nuevos (3 de producción, 2 de test, 3 del spec), **cero archivos existentes modificados o
borrados**. `package.json` intacto: ninguna dependencia nueva.

**T9 (gate completo `./init.sh` + PR) queda para el leader**, como manda `AGENTS.md > Regla del
gate`. Ni el `implementer` ni el `frontend_dev` corrieron la suite completa ni `./init.sh`.

---

## T0 — Precondiciones heredadas de QC-11 y QC-15 (verificadas, no supuestas)

Comprobadas en este worktree tras `git merge origin/dev` (merge `d4c6c8f`, sólo documentación de
la spec de QC-8; sin conflicto y sin código):

| # | Precondición | Evidencia real |
| --- | --- | --- |
| 1 | `app/(private)/layout.tsx` existe (Server Component con `SidebarProvider` + `SidebarInset`) | archivo presente; la lectura confirma `SidebarProvider` → `AppSidebar` + `SidebarInset` |
| 2 | `app/(private)/components/index.ts` (barrel de ruta ya en uso) | archivo presente; exporta `SidebarToggle`, `SIDEBAR_TOGGLE_LABEL` |
| 3 | `SidebarInset` **renderiza `<main>`** | `components/ui/sidebar.tsx:305` — la función devuelve `<main data-slot="sidebar-inset" …>` |
| 4 | `lib/shared/routes.ts` exporta `DASHBOARD_ROUTE` | `DASHBOARD_ROUTE = '/dashboard'` (línea 1) |
| 5 | `lib/shared/navigation/private-nav.ts` exporta `PRIVATE_NAV_ITEMS` y `BRAND_LABEL`, con el ítem «Dashboard» apuntando a `DASHBOARD_ROUTE` | `BRAND_LABEL = 'QuimiCloude'` (:31), `PRIVATE_NAV_ITEMS` (:53) con `href: DASHBOARD_ROUTE` (:56) |
| 6 | `tests/helpers/viewport.ts` con los cinco símbolos | exporta `WIDE_VIEWPORT`, `NARROW_VIEWPORT`, `DEFAULT_VIEWPORT`, `setViewportWidth`, `resetViewport`, `clearSidebarStateCookie`, `readSidebarStateCookie` |
| 7 | **NO existe** `app/(private)/dashboard/` ni ninguna `page.tsx` en `app/(private)/` | listado del directorio: sólo `components/` y `layout.tsx`; búsqueda de `page.tsx` bajo `app/(private)`: vacía |

Los siete puntos en verde. No hubo que parar ni avisar al leader por precondición ausente.

---

## Archivos tocados

### Creados (producción)

- `app/(private)/dashboard/page.tsx` — Server Component. `metadata` con `BRAND_LABEL`
  **importado**, un único `<h1 data-testid="dashboard-title">`, `<DashboardContent />` importado
  desde `./components`, contenedor exterior `<div>` (**no** `<main>`). Comentario de cabecera con
  las tres cosas que T2 exige por escrito: ruta derivada de `DASHBOARD_ROUTE`, ausencia de
  protección hasta QC-13 como hecho conocido y aceptado, y no intervención sobre el ítem
  «Dashboard» del sidebar (decisión humana del 2026-09-02).
- `app/(private)/dashboard/components/dashboard-content.tsx` — la **costura explícita y vacía**:
  contenedor plano con `data-testid="dashboard-content"`, sin hijos, sin props, sin landmark.
- `app/(private)/dashboard/components/index.ts` — barrel de la ruta; reexporta
  `DashboardContent`. Sin frontera cliente declarada en el barrel.

### Creados (test)

- `tests/unit/dashboard-page.test.tsx` — 6 tests de render dentro del layout privado.
- `tests/unit/dashboard-route-contract.test.ts` — 8 guardias de código sobre las fuentes.

### Modificados

**Ninguno de producción ni de test.** El diff de la rama contra su merge-base devuelve **sólo
añadidos**: los 3 de producción, los 2 de test y los 3 del spec. No se abrió
`app/(private)/layout.tsx`, ni `components/ui/*`, ni `components/private/*`, ni
`lib/shared/navigation/private-nav.ts`, ni `app/page.tsx`. `package.json` y
`docs/dependencias.md` sin cambios.

### Commits

| Task | Commit | Mensaje |
| --- | --- | --- |
| T1 | `dbcacca` | `feat(QC-12): area de contenido vacia del dashboard y su barrel de ruta` |
| T2 | `5718e59` | `feat(QC-12): pantalla de dashboard vacia en la zona privada` |
| T3 | `e12921a` | `test(QC-12): la pantalla se monta en el armazon privado y su costura queda vacia` |
| T4 | `0035763` | `test(QC-12): guardias de codigo para lo que la ruta promete NO hacer` |

Antes de T1, el merge `d4c6c8f` de `origin/dev`: sólo documentación.

---

## T6 — Mapa de trazabilidad `R<n> → test` (los 12, sin huecos)

| Req | Test (nombre real del `it`) | Archivo |
| --- | --- | --- |
| R1 | `la pantalla del dashboard se renderiza dentro del armazon privado` + `la pagina vive en la ruta que declara DASHBOARD_ROUTE` | `tests/unit/dashboard-page.test.tsx` + `tests/unit/dashboard-route-contract.test.ts` |
| R2 | `presenta exactamente un encabezado de primer nivel` | `tests/unit/dashboard-page.test.tsx` |
| R3 | `el area de contenido se renderiza vacia: sin tarjetas, tablas, listas ni texto` | `tests/unit/dashboard-page.test.tsx` |
| R4 | `no anade landmarks: el main sigue siendo unico y no aparece ninguna region nueva` | `tests/unit/dashboard-page.test.tsx` |
| R5 | `declara un titulo de documento propio que incluye la marca` | `tests/unit/dashboard-page.test.tsx` |
| R6 | `la pantalla no consulta datos, red ni cookies` | `tests/unit/dashboard-route-contract.test.ts` |
| R7 | `la pantalla y su componente de ruta se renderizan en servidor` | `tests/unit/dashboard-route-contract.test.ts` |
| R8 | `la pantalla no valida sesion ni protege la ruta` | `tests/unit/dashboard-route-contract.test.ts` |
| R9 | `el componente de ruta se expone por el barrel y la pagina no importa por ruta profunda` | `tests/unit/dashboard-route-contract.test.ts` |
| R10 | `la ubicacion de la ruta se deriva de DASHBOARD_ROUTE y la pagina no incrusta literales de ruta` | `tests/unit/dashboard-route-contract.test.ts` |
| R11 | `el item Dashboard de la navegacion apunta a la misma constante que ubica la pantalla` | `tests/unit/dashboard-route-contract.test.ts` |
| R12 | `renderiza titulo y area de contenido en viewport angosto y en ancho` + `no usa 100vh ni hover como unica via` | `tests/unit/dashboard-page.test.tsx` + `tests/unit/dashboard-route-contract.test.ts` |

Los nombres coinciden con el «Mapa de trazabilidad previsto» de `tasks.md`. **R3 y R4 son tests
en negativo a propósito**: «estar vacío» y «no añadir landmarks» es lo que una feature posterior
puede romper sin que nada más se ponga rojo.

### Tres matices de los asserts (declarados, no escondidos)

1. **R4 se mide contra una línea base, no contra números fijos.** El test renderiza primero
   `PrivateLayout` con un hijo neutro, cuenta `main`/`region`/`banner`/`contentinfo`, limpia, y
   vuelve a renderizar con `DashboardPage` comparando ambos recuentos. Es literalmente lo que
   pide T3 («respecto al layout solo»): así el rojo aparece en el archivo correcto si mañana
   QC-11 añadiese legítimamente un landmark propio.
2. **R11 — el assert negativo NO es «no importar `private-nav`»**, porque `page.tsx` **sí**
   importa `BRAND_LABEL` de ese módulo para la metadata (R5) y una prohibición ciega sería
   falsa. La guardia va sobre **escribir** la navegación: ninguna fuente de la feature contiene
   `PRIVATE_NAV_ITEMS` ni declara un `export const *_ROUTE` (redeclarar la constante es la otra
   forma real de romper R11). La parte positiva sí es exacta: hay **exactamente un** ítem
   `kind: 'link'` con `href === DASHBOARD_ROUTE`.
3. **R10 usa la constante también en el lado negativo**: se afirma que la fuente no contiene el
   valor de `DASHBOARD_ROUTE`, en vez de un literal entrecomillado — cubre comilla simple, doble
   y template.

---

## Salida real de los tests

`pnpm run typecheck` -> limpio, sin salida (`tsc --noEmit`).
`pnpm run lint` -> limpio, sin hallazgos.
`pnpm run build` -> `Compiled successfully in 6.7s`, 6/6 paginas; la tabla de rutas incluye la
entrada dinamica de `/dashboard`.

Corrida de los dos archivos de test de la feature:

```

 RUN  v4.1.10 C:/Users/Cristian/Documents/trabajo/arc/labs/.worktrees/QC-12-dashboard-en-blanco

 ✓ |node| tests/unit/dashboard-route-contract.test.ts > contrato de la ruta del dashboard > la pagina vive en la ruta que declara DASHBOARD_ROUTE 2ms
 ✓ |node| tests/unit/dashboard-route-contract.test.ts > contrato de la ruta del dashboard > la ubicacion de la ruta se deriva de DASHBOARD_ROUTE y la pagina no incrusta literales de ruta 1ms
 ✓ |node| tests/unit/dashboard-route-contract.test.ts > contrato de la ruta del dashboard > la pantalla no consulta datos, red ni cookies 1ms
 ✓ |node| tests/unit/dashboard-route-contract.test.ts > contrato de la ruta del dashboard > la pantalla y su componente de ruta se renderizan en servidor 1ms
 ✓ |node| tests/unit/dashboard-route-contract.test.ts > contrato de la ruta del dashboard > la pantalla no valida sesion ni protege la ruta 0ms
 ✓ |node| tests/unit/dashboard-route-contract.test.ts > contrato de la ruta del dashboard > el componente de ruta se expone por el barrel y la pagina no importa por ruta profunda 1ms
 ✓ |node| tests/unit/dashboard-route-contract.test.ts > contrato de la ruta del dashboard > el item Dashboard de la navegacion apunta a la misma constante que ubica la pantalla 2ms
 ✓ |node| tests/unit/dashboard-route-contract.test.ts > contrato de la ruta del dashboard > no usa 100vh ni hover como unica via 1ms
 ✓ |ui| tests/unit/dashboard-page.test.tsx > pantalla de dashboard > la pantalla del dashboard se renderiza dentro del armazon privado 103ms
 ✓ |ui| tests/unit/dashboard-page.test.tsx > pantalla de dashboard > presenta exactamente un encabezado de primer nivel 108ms
 ✓ |ui| tests/unit/dashboard-page.test.tsx > pantalla de dashboard > el area de contenido se renderiza vacia: sin tarjetas, tablas, listas ni texto 25ms
 ✓ |ui| tests/unit/dashboard-page.test.tsx > pantalla de dashboard > no anade landmarks: el main sigue siendo unico y no aparece ninguna region nueva 59ms
 ✓ |ui| tests/unit/dashboard-page.test.tsx > pantalla de dashboard > declara un titulo de documento propio que incluye la marca 2ms
 ✓ |ui| tests/unit/dashboard-page.test.tsx > pantalla de dashboard > renderiza titulo y area de contenido en viewport angosto y en ancho 57ms

 Test Files  2 passed (2)
      Tests  14 passed (14)
   Start at  09:41:33
   Duration  3.39s (transform 297ms, setup 244ms, import 1.28s, tests 368ms, environment 1.24s)

```

Los 8 tests de contrato corren en el proyecto `node` y los 6 de render en `ui`: reparto
automático por extensión, **sin tocar `vitest.config.mts`**.

**No se corrió la suite completa ni `./init.sh`** (`AGENTS.md > Regla del gate`): eso es T9 y lo
corre el leader.

---

## T5 — Verificación sobre la app servida (y el límite honesto de esta comprobación)

Servidor de desarrollo levantado en un puerto libre, y sobre `/dashboard`:

| Comprobación | Resultado |
| --- | --- |
| Código HTTP de `/dashboard` | **200** |
| Título del documento servido | `Dashboard · QuimiCloude` — la marca sale de `BRAND_LABEL` |
| Encabezados `h1` en el HTML servido | **1** |
| Elementos `main` en el HTML servido | **1** — el de `SidebarInset`; la página no añade otro (R4 confirmado también fuera de jsdom) |
| `data-testid="dashboard-title"` / `data-testid="dashboard-content"` | 1 y 1 |
| Clases del contenedor de la pantalla | `flex flex-1 flex-col gap-4 p-4 md:p-6` — mobile-first, ancho fluido, sin ancho fijo |
| Alto de viewport fijo procedente de la feature | **ninguno**. La única aparición de esa unidad en el HTML servido está en los estilos inline del overlay de desarrollo de Next, ajeno a esta feature; las dos fuentes de QC-12 no la contienen (guardia R12) |

Servidor detenido al terminar (comprobación posterior: sin respuesta).

**Límite que declaro en vez de disimular:** no hay navegador con emulación de dispositivo en este
entorno de agente, así que **la inspección visual a ≥1280 px y ≤375 px que describe T5 no la hice
con los ojos**. Lo que sí está verificado es (a) el HTML servido a 200, con las clases responsive
correctas y un solo `main`, y (b) el comportamiento a **375 px y 1280 px en jsdom** con
`setViewportWidth(NARROW_VIEWPORT)` / `WIDE_VIEWPORT`, que es donde el sidebar de QC-11 cambia de
mecanismo (768 px) — test `renderiza titulo y area de contenido en viewport angosto y en ancho`,
en verde. La comprobación visual en navegador real queda como verificación humana pendiente. **No
se declara ninguna excepción de escritorio** (`design.md > 5`).

---

## T7 — Puntos de `CHECKPOINTS.md` que **NO APLICAN** (declarados, no omitidos)

- **Datos y seguridad (Supabase)** — tablas, RLS y `FORCE ROW LEVEL SECURITY`, migraciones con
  `down.sql`, acceso por repositorio Prisma, secretos, webhooks: **NO APLICA**. La feature no crea
  ni consulta ninguna tabla y no añade ninguna variable de entorno (R6).
- **Módulos hexagonales**: **NO APLICA**. No se crea ni se toca ningún módulo de `lib/modules/`,
  ni `lib/composition`, ni ningún adaptador (R6). La guardia de fuente lo comprueba.
- **«Páginas protegidas validan permisos en el servidor vía `cookies()`»**: **NO APLICA en esta
  feature**, y no por olvido: es literalmente el alcance de **QC-13**. Hasta que aterrice,
  `/dashboard` **no está protegida** — hecho conocido y aceptado (R8, decisión cerrada del
  2026-09-02).
- **«Componentes `private/` reciben datos por props; no fetchean datos sensibles»**: **NO APLICA**:
  esta pantalla no maneja datos de ningún tipo (R6). Los componentes de `components/private/` son
  de QC-11 y no se tocan.
- **«Mutaciones internas usan Server Actions»**: **NO APLICA**: no hay mutaciones.
- **Autorización validada en el service con su test**: **NO APLICA**: no hay service ni permiso.
- **E2E de flujo crítico**: **NO APLICA en esta feature**, diferido con motivo escrito (T8).
- **Multiplataforma**: **SÍ APLICA**, sin excepción declarada (R12, T5, `design.md > 5`).
- **Dependencias**: **ninguna añadida**. `package.json` y `docs/dependencias.md` no cambian
  (`design.md > 6`). No se ejecutó ningún `shadcn add`.

---

## T8 — E2E: diferido, con motivo (decisión cerrada, no opción abierta)

**No hay E2E en esta feature y no se implementa nada.** `CHECKPOINTS.md` pide E2E para flujos
críticos; esta pantalla **no es un flujo**: no existe sesión real (R8) ni camino navegable
protegido. Un Playwright que abriese `/dashboard` comprobaría exactamente lo mismo que el test de
componente, más despacio y con más superficie de fallo. **El E2E de login → dashboard lo aporta
QC-13**, que es quien trae la guardia de sesión (`design.md > 8`).

Queda registrado aquí para que la ausencia esté escrita, no silenciada. **El leader debe anotar la
deuda en `progress/current.md > Deudas y cosas abiertas`** (T8 lo pide explícitamente).

---

## Deudas y notas que esta feature deja registradas (no silenciosas)

- **E2E diferido a QC-13** (T8).
- **`/dashboard` sin protección de sesión** hasta QC-13 (R8). Estado esperado del backlog, no un
  agujero introducido aquí.
- **El ítem «Dashboard» del sidebar no se toca** (decisión humana del 2026-09-02): lo reconecta
  QC-13. De hecho ese ítem deja de dar 404 **sin que esta feature edite nada**, porque él y la
  nueva ruta ya salen de la misma constante `DASHBOARD_ROUTE` (R11). Los otros 4 ítems placeholder
  de QC-11 siguen dando 404 y su deuda sigue viva en `progress/current.md`.
- **`app/page.tsx` (raíz) sigue siendo la plantilla de `create-next-app`** y ninguna ficha del
  backlog la cubre. Es la pregunta abierta **P1** de `requirements.md`; esta feature no la toca.
- **Verificación visual en navegador real pendiente** (ver T5 arriba): el entorno del agente no
  tiene navegador con emulación de dispositivo.
- **`dev` avanzó durante la implementación** (otra sesión mergeó el PR #11, de QC-6). Esta rama
  incorporó `origin/dev` hasta `f9ac518` en T0 y **no** contiene ese merge posterior. **El leader
  debe traerse `dev` otra vez antes de correr el gate completo y abrir el PR**; el cruce es a
  priori inocuo (QC-6 es backend: `lib/modules/identity`, `db/`, `scripts/seed.ts`, mientras que
  QC-12 sólo añade archivos bajo `app/(private)/dashboard/` y `tests/unit/dashboard-*`), pero se
  deja dicho para que no aparezca como sorpresa en el PR.

---

## T9 — pendiente del leader

`./init.sh` **completo** (sin flags) en verde, `package.json` sin cambios (ya verificado) y PR
contra `dev` con título `feat(QC-12-dashboard-en-blanco): …`. **No lo corre ni lo abre el
`implementer`** (`AGENTS.md > Regla del gate`; F2.3 y F2.4 van después del reviewer).

---

## Apunte para el leader y el reviewer: `vitest related` no ve el test de contrato

Corrido por el `implementer` al cerrar la tanda, sobre las tres fuentes de producción:

```
pnpm exec vitest related --run app/(private)/dashboard/page.tsx \
  app/(private)/dashboard/components/dashboard-content.tsx \
  app/(private)/dashboard/components/index.ts

 Test Files  1 passed (1)
      Tests  6 passed (6)
```

Relaciona **sólo** `dashboard-page.test.tsx`. `dashboard-route-contract.test.ts` no aparece
porque **lee las fuentes del disco en vez de importarlas**, así que el grafo de módulos no las
enlaza — es intrínseco a las guardias de fuente, no un fallo de configuración (el patrón viene de
`tests/unit/private-layout.test.tsx`). Por eso los dos archivos se corrieron también de forma
explícita (los 14 tests de arriba). **Consecuencia práctica: `./init.sh --rapido` podría no
incluir esta guardia por cambios en `app/(private)/dashboard/`; el gate completo de T9 sí la
corre.** Typecheck y lint, limpios también en esta última pasada.
