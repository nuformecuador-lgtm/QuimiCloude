# QC-12 — dashboard-en-blanco · tasks.md

Convenciones: `[P]` = paralelizable con las otras `[P]` del mismo bloque. Cada task indica sus
dependencias y su **criterio de hecho** (verificable, no «parece bien»). Un commit por task,
formato `docs/conventions.md > Commits`.

**Recordatorio de gate** (`docs/verification.md`, `AGENTS.md > Regla del gate`): el
`frontend_dev` corre **sólo** `pnpm run typecheck`, `pnpm run lint` y
`pnpm exec vitest related --run <sus archivos>`. **No corre la suite completa.**
`./init.sh --rapido` lo corre el **leader** al cerrar cada tanda; `./init.sh` **completo**, al
cerrar la feature y **antes del PR, sin excepción**.

**Esta feature es aditiva.** Crea tres archivos nuevos bajo `app/(private)/dashboard/` y dos de
test. **No edita ningún archivo existente de QC-11 ni de QC-15.** Si una task te pide abrir
`app/(private)/layout.tsx`, `components/private/*` o `lib/shared/navigation/private-nav.ts`,
algo va mal: **para y avisa al leader**.

---

## Bloque 0 — Precondiciones

### T0 — Verificar la base heredada de QC-11 y QC-15 (BLOQUEA TODO)
- **Depende de**: que QC-11 y QC-15 estén `done` y mergeadas en `dev` (lo están).
- **Qué**: comprobar, uno por uno, que existen en el worktree (tras `git merge origin/dev`):
  1. `app/(private)/layout.tsx` (Server Component, con `SidebarProvider` + `SidebarInset`).
  2. `app/(private)/components/index.ts` (el barrel de ruta ya en uso).
  3. `components/ui/sidebar.tsx` con `SidebarInset` renderizando **`<main>`** (`:305`).
  4. `lib/shared/routes.ts` exportando `DASHBOARD_ROUTE`.
  5. `lib/shared/navigation/private-nav.ts` exportando `PRIVATE_NAV_ITEMS` y `BRAND_LABEL`, con
     el ítem «Dashboard» apuntando a `DASHBOARD_ROUTE`.
  6. `tests/helpers/viewport.ts` con `WIDE_VIEWPORT`, `NARROW_VIEWPORT`, `setViewportWidth`,
     `resetViewport`, `clearSidebarStateCookie`.
  7. **Que NO existe `app/(private)/dashboard/`** ni ninguna `page.tsx` dentro de
     `app/(private)/`.
- **Si falta cualquiera, o si el punto 7 falla: PARAR y avisar al leader.** No se «arregla»
  creando el layout ni el sidebar: eso duplicaría trabajo mergeado y garantizaría conflicto
  (es el choque features 4↔10 que este T0 hereda de `specs/11-*/tasks.md > T0`).
- **Hecho cuando**: los siete puntos están verificados y anotados con su evidencia en
  `progress/impl_QC-12-dashboard-en-blanco.md`.

---

## Bloque 1 — La pantalla

### T1 — `app/(private)/dashboard/components/dashboard-content.tsx` + `index.ts`
- **Depende de**: T0.
- **Qué**: el área de contenido vacía (`design.md > 4`):
  - componente de servidor (**sin `'use client'`**, sin estado, sin efectos, sin handlers — R7);
  - **sin props**;
  - renderiza un contenedor plano con `data-testid="dashboard-content"` y el espaciado
    mobile-first, **sin hijos** (R3);
  - **no** es `role="region"` ni ningún otro landmark (R4, y protege el test negativo de
    notificaciones de QC-11 — `design.md > 9.3`);
  - comentario de cabecera diciendo que es la **costura explícita y vacía** donde entrará el
    contenido futuro, y que vaciarla no es un olvido;
  - `index.ts` reexporta `DashboardContent`. **Sin `'use client'` en el barrel.**
- **Hecho cuando**: `pnpm run typecheck` y `pnpm run lint` pasan, y `grep` sobre el archivo no
  encuentra `use client`, `useState`, `useEffect`, `fetch(`, `cookies` ni `prisma`.

### T2 — `app/(private)/dashboard/page.tsx`
- **Depende de**: T1.
- **Qué**: Server Component (`design.md > 4`):
  - `export const metadata` con título propio construido con **`BRAND_LABEL` importado**, no con
    la marca escrita a mano (R5);
  - un **único** `<h1>` con `data-testid="dashboard-title"` (R2);
  - `<DashboardContent />` importado **desde `./components`**, nunca por ruta profunda (R9);
  - contenedor exterior `<div>`: **no se declara `<main>`** (R4);
  - **nada de datos**: sin `await`, sin `cookies()`, sin `@/lib/composition`, sin props de
    sesión, sin `redirect` (R6, R8);
  - comentario de cabecera que deje escrito: (a) que la ruta sale de `DASHBOARD_ROUTE`, (b) que
    la pantalla **no está protegida** hasta QC-13 y eso es conocido y aceptado, y (c) que esta
    feature **no toca el ítem «Dashboard» del sidebar** (decisión humana del 2026-09-02).
- **Hecho cuando**: `pnpm run build` pasa, `pnpm run typecheck` y `pnpm run lint` limpios, y la
  URL `/dashboard` responde 200 en `pnpm dev` (evidencia anotada).

---

## Bloque 2 — Tests

### T3 — [P] `tests/unit/dashboard-page.test.tsx` (render)
- **Depende de**: T2.
- **Qué**: renderizar la pantalla **dentro del layout privado** —
  `render(await PrivateLayout({ children: <DashboardPage /> }))` — reutilizando el patrón de
  mocks de `tests/unit/private-layout.test.tsx` (`next/headers`, `next/navigation`,
  `@/lib/composition`) y el helper `tests/helpers/viewport.ts`. Cubre:
  - R1: el título y el área de contenido quedan dentro del armazón privado;
  - R2: `getAllByRole('heading', { level: 1 })` tiene longitud 1;
  - R3: el área de contenido **está vacía** — sin hijos elementos, sin texto, y **sin** roles
    `table`, `list`, `img`, `article`, `button` ni `link` dentro;
  - R4: `getAllByRole('main')` sigue teniendo longitud 1 y no aparecen landmarks nuevos
    (`region`, `banner`, `contentinfo`) respecto al layout solo;
  - R5: `metadata.title` es una cadena no vacía que **contiene `BRAND_LABEL` importado** (nunca
    se afirma sobre el literal de copy);
  - R12: los dos asserts anteriores de título y contenedor se repiten con
    `setViewportWidth(NARROW_VIEWPORT)` y con `WIDE_VIEWPORT`.
- **Hecho cuando**: cubre R1–R5 y R12 y `pnpm exec vitest related --run app/(private)/dashboard`
  sale en verde. Interacciones (si hicieran falta) con `@testing-library/user-event`, nunca
  `fireEvent`. Asserts sobre roles ARIA, `data-testid` y constantes exportadas.

### T4 — [P] `tests/unit/dashboard-route-contract.test.ts` (guardias de código)
- **Depende de**: T2. No renderiza DOM.
- **Qué**: lo que «no hacer» exige, porque no se observa renderizando (mismo patrón de guardia
  de fuente que `tests/unit/private-layout.test.tsx`):
  - R1 + R10: la ruta esperada se **deriva** de `DASHBOARD_ROUTE`
    (`app/(private)${DASHBOARD_ROUTE}/page.tsx`) y ese archivo existe; y la fuente de la página
    no contiene el literal `'/dashboard'`;
  - R6: la fuente de `page.tsx` y de `dashboard-content.tsx` no contiene `fetch(`, `cookies`,
    `prisma`, `supabase`, `@/lib/composition` ni `@/lib/modules/`;
  - R7: ninguna de las dos fuentes contiene `'use client'`, `useState`, `useEffect` ni
    `onClick`;
  - R8: `page.tsx` no contiene `redirect`, `next/headers` ni `getSessionUser`;
  - R9: `index.ts` del barrel exporta `DashboardContent`, y `page.tsx` importa
    **`./components`** y no `./components/dashboard-content` ni `./dashboard-content`;
  - R11: existe en `PRIVATE_NAV_ITEMS` un ítem `kind: 'link'` cuyo `href === DASHBOARD_ROUTE`,
    es decir el ítem del sidebar y la nueva ruta salen de **la misma constante**; y la fuente de
    la feature no importa `private-nav` para escribirlo;
  - R12: ninguna de las dos fuentes contiene `100vh`, y ninguna usa `hover:` como única vía de
    revelar contenido (no hay controles interactivos en la pantalla; se afirma que no hay
    `hover:` sobre elementos con `hidden`).
- **Hecho cuando**: cubre R1, R6, R7, R8, R9, R10, R11 y R12, y pasa en verde.

---

## Bloque 3 — Verificación, trazabilidad y cierre

### T5 — Verificación manual en navegador (escritorio y móvil)
- **Depende de**: T2.
- **Qué**: `pnpm dev` y abrir `/dashboard`. A diferencia de QC-11 —que no exponía ninguna URL—
  **aquí sí hay algo que mirar**, y la regla multiplataforma pide validar la decisión de layout
  contra las tres plataformas (`docs/architecture.md > Regla: multiplataforma`). Comprobar en
  ancho ≥ 1280 px y en ancho ≤ 375 px (emulación móvil): título visible, contenedor vacío, sin
  scroll horizontal, sidebar en su mecanismo correspondiente.
- **Hecho cuando**: la comprobación está anotada (anchos usados y resultado) en
  `progress/impl_QC-12-dashboard-en-blanco.md`. Si algo falla en angosto, **no se declara
  excepción de escritorio**: se arregla (`design.md > 5`).

### T6 — Mapa de trazabilidad `R<n> → test`
- **Depende de**: T3, T4, T5.
- **Qué**: volcar la tabla de abajo, ya con los nombres reales de los tests, en
  `progress/impl_QC-12-dashboard-en-blanco.md`, junto con los archivos tocados y la salida real
  de los tests.
- **Hecho cuando**: **los 12 requisitos (R1–R12)** tienen al menos un test nombrado. Un hueco es
  hallazgo bloqueante del reviewer (`docs/verification.md > Regla del reviewer`).

### T7 — [P] Declarar los «no aplica» de `CHECKPOINTS.md`
- **Depende de**: T2.
- **Qué**: dejar por escrito en `progress/impl_QC-12-dashboard-en-blanco.md` los puntos que no
  aplican y **por qué**, para que no se lean como omisiones (lista al final de este archivo).
- **Hecho cuando**: cada punto de la lista está copiado con su motivo.

### T8 — E2E: **diferido** (decisión cerrada, no opción)
- **Depende de**: T2.
- **Qué**: no hay nada que implementar. `CHECKPOINTS.md` pide E2E para flujos críticos; esta
  pantalla no es un flujo: no hay sesión real (R8) ni camino navegable protegido. **El E2E de
  login → dashboard lo aporta QC-13** (`design.md > 8`).
- **Hecho cuando**: la decisión y su motivo están escritos en
  `progress/impl_QC-12-dashboard-en-blanco.md` y el leader anotó la deuda en
  `progress/current.md > Deudas y cosas abiertas`. Existe para que la ausencia quede
  registrada, no silenciada.

### T9 — Gate completo y PR
- **Depende de**: T6, T7, T8.
- **Hecho cuando**: `./init.sh` (completo, sin flags) termina en verde — **lo corre el
  leader**, no el `frontend_dev` —, `package.json` **no ha cambiado** (ninguna dependencia
  nueva, `design.md > 6`), `progress/impl_QC-12-dashboard-en-blanco.md` tiene el mapa
  `R<n> → test` y la salida real de los tests, y el PR está abierto contra `dev` con título
  `feat(QC-12-dashboard-en-blanco): …`.

---

## Mapa de trazabilidad previsto (`R<n> → test`)

| Req | Test previsto | Archivo |
| --- | --- | --- |
| R1 | `la pantalla del dashboard se renderiza dentro del armazon privado` + `la pagina vive en la ruta que declara DASHBOARD_ROUTE` | dashboard-page.test.tsx + dashboard-route-contract.test.ts |
| R2 | `presenta exactamente un encabezado de primer nivel` | dashboard-page.test.tsx |
| R3 | `el area de contenido se renderiza vacia: sin tarjetas, tablas, listas ni texto` | dashboard-page.test.tsx |
| R4 | `no anade landmarks: el main sigue siendo unico y no aparece ninguna region nueva` | dashboard-page.test.tsx |
| R5 | `declara un titulo de documento propio que incluye la marca` | dashboard-page.test.tsx |
| R6 | `la pantalla no consulta datos, red ni cookies` | dashboard-route-contract.test.ts |
| R7 | `la pantalla y su componente de ruta se renderizan en servidor` | dashboard-route-contract.test.ts |
| R8 | `la pantalla no valida sesion ni protege la ruta` | dashboard-route-contract.test.ts |
| R9 | `el componente de ruta se expone por el barrel y la pagina no importa por ruta profunda` | dashboard-route-contract.test.ts |
| R10 | `la ubicacion de la ruta se deriva de DASHBOARD_ROUTE y la pagina no incrusta literales de ruta` | dashboard-route-contract.test.ts |
| R11 | `el item Dashboard de la navegacion apunta a la misma constante que ubica la pantalla` | dashboard-route-contract.test.ts |
| R12 | `renderiza titulo y area de contenido en viewport angosto y en ancho` + `no usa 100vh ni hover como unica via` | dashboard-page.test.tsx + dashboard-route-contract.test.ts |

Ningún requisito queda huérfano: R1–R12, sin saltos. **R3 y R4 son tests en negativo a
propósito**: «estar vacío» y «no añadir landmarks» son justo lo que una feature posterior puede
romper sin que nada se ponga rojo.

---

## Checklist de `CHECKPOINTS.md`: qué aplica «no aplica» (declararlo, no omitirlo)

- **Datos y seguridad (Supabase)** — tablas, RLS + `FORCE ROW LEVEL SECURITY`, migraciones con
  `down.sql`, acceso por repositorio Prisma, secretos, webhooks: **NO APLICA**. La feature no
  crea ni consulta ninguna tabla y no añade ninguna variable de entorno (R6).
- **Módulos hexagonales**: **NO APLICA**. No se crea ni se toca ningún módulo de `lib/modules/`,
  ni `lib/composition`, ni ningún adaptador (R6).
- **«Páginas protegidas validan permisos en el servidor vía `cookies()`»**: **NO APLICA en esta
  feature**, y no por olvido — es literalmente el alcance de **QC-13**. Hasta que aterrice,
  `/dashboard` **no está protegida**: hecho conocido y aceptado (R8).
- **«Componentes `private/` reciben datos por props; no fetchean datos sensibles»**: **NO
  APLICA**: esta pantalla no maneja datos de ningún tipo (R6). Los componentes de
  `components/private/` son de QC-11 y no se tocan.
- **«Mutaciones internas usan Server Actions»**: **NO APLICA**: no hay mutaciones.
- **Autorización validada en el service con su test**: **NO APLICA**: no hay service ni permiso.
- **E2E de flujo crítico**: **NO APLICA en esta feature**, diferido con motivo escrito (T8).
- **Multiplataforma**: **SÍ APLICA**, sin excepción declarada (R12, T5, `design.md > 5`).
- **Dependencias**: **ninguna añadida**; `package.json` y `docs/dependencias.md` no cambian
  (`design.md > 6`).

## Deudas y notas que esta feature deja registradas (no silenciosas)

- **E2E diferido a QC-13** (T8).
- **`/dashboard` sin protección de sesión** hasta QC-13 (R8). Es el estado esperado del backlog,
  no un agujero introducido aquí.
- **El ítem «Dashboard» del sidebar no se toca** (decisión humana del 2026-09-02): lo reconecta
  QC-13. Los otros 4 ítems placeholder de QC-11 siguen dando 404 y su deuda sigue viva en
  `progress/current.md`.
- **`app/page.tsx` (raíz) sigue siendo la plantilla de `create-next-app`** y ninguna feature del
  backlog la cubre. Pregunta abierta **P1** de `requirements.md`; esta feature no la toca.
