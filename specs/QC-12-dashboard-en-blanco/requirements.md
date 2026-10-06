# QC-12 — dashboard-en-blanco · requirements.md

> Zona: `frontend` · Complejidad: `low` · `depends_on`: `QC-11`, `QC-15` (ambas `done`) ·
> Rama: `feature/QC-12-dashboard-en-blanco`
>
> **Alcance:** **maquetación** de la primera pantalla de la zona privada: la ruta del
> dashboard dentro del route group `app/(private)/`, con **un título y un área de contenido
> deliberadamente vacía**, lista para que features posteriores la llenen. Es el destino al que
> ya apunta la redirección post-login de QC-10 y el `href` del ítem «Dashboard» del sidebar de
> QC-11. **Capa visual y nada más**: sin datos, sin backend, sin sesión.
>
> **Lo que NO entra:**
> - **Contenido.** Ni tarjetas, ni KPIs, ni tablas, ni gráficas, ni textos de relleno, ni
>   «empty state» ilustrado. «Vacía» es el requisito, no una etapa intermedia
>   (`docs/architecture.md > Componentes > Regla: sin sobre-ingenieria`).
> - **Datos y backend.** Ninguna consulta a base de datos, ninguna petición de red, ningún
>   modelo Prisma, ninguna migración, ninguna Server Action, ninguna variable de entorno.
> - **Sesión y protección de ruta.** Esta pantalla no valida sesión ni protege el acceso: eso
>   es el alcance de **QC-13**. Hasta que aterrice, `/dashboard` es alcanzable sin
>   autenticación — hecho conocido y aceptado, no hallazgo del reviewer.
> - **El layout privado, el sidebar y su navegación.** `app/(private)/layout.tsx`,
>   `app/(private)/components/`, `components/private/*` y
>   `lib/shared/navigation/private-nav.ts` **se heredan montados de QC-11 y no se re-crean ni
>   se editan** (ver **T0** de `tasks.md`).
> - **El ítem «Dashboard» del sidebar.** Decisión humana del 2026-09-02: lo reconecta QC-13
>   (ver `## Decisiones cerradas`, fila 1).
> - **`app/page.tsx` (raíz).** Sigue siendo la plantilla de `create-next-app`. Fuera de
>   alcance; queda en `## Preguntas abiertas`.
>
> **Precondición heredada (no se re-crea aquí):** esta feature se implementa sobre `dev` con
> QC-11 y QC-15 ya mergeadas. Da por hechos: el route group `app/(private)/` con su
> `layout.tsx`, el `SidebarProvider`/`SidebarInset` (que **ya es el `<main>`**), `AppSidebar`,
> `lib/shared/routes.ts` con `DASHBOARD_ROUTE`, `lib/shared/navigation/private-nav.ts`,
> Vitest + Testing Library y el helper `tests/helpers/viewport.ts`. Ver `design.md > 0` y **T0**
> de `tasks.md`.

## Glosario

- **Pantalla de dashboard**: la página que esta feature crea, servida en la URL que declara la
  constante `DASHBOARD_ROUTE`.
- **Layout privado**: el armazón de QC-11 (barra lateral + cabecera + área de contenido) que
  envuelve a toda pantalla del route group `app/(private)/`. **No se toca en esta feature.**
- **Área de contenido de la pantalla**: el contenedor vacío que la pantalla renderiza bajo su
  título. Es la **costura explícita y vacía** donde las features siguientes insertarán
  contenido, igual que QC-11 dejó el disparador de logout como costura vacía.
- **Componentes de ruta**: los componentes propios de esta pantalla, que viven en
  `components/` dentro de la carpeta de la ruta y se exponen por su barrel `index.ts`
  (`docs/architecture.md > Componentes > Regla: componentes de ruta en components/ con barrel
  index.ts`).
- **Vacía**: sin datos ni sustitutos de datos. Un contenedor con estilos de espaciado sí; una
  tarjeta, un texto explicativo o un esqueleto de carga, no.

## Requisitos (EARS)

### Ubicación y armazón

**R1** — El sistema DEBE exponer la pantalla de dashboard en la URL que declara la constante de
ruta del dashboard, dentro del grupo de rutas privadas, de modo que se renderice **envuelta por
el layout privado existente** sin declarar ningún armazón propio.

**R2** — La pantalla DEBE presentar **exactamente un** encabezado de primer nivel (`h1`) con el
título de la pantalla.

**R3** — La pantalla DEBE renderizar un área de contenido identificable de forma estable y
**vacía**: NO DEBE contener tarjetas, métricas, tablas, listas, gráficas, esqueletos de carga
ni textos de relleno.

**R4** — La pantalla NO DEBE introducir ningún landmark adicional: NO DEBE declarar un `main`
propio —el layout privado ya aporta el único de la página— ni un landmark `region`,
`navigation`, `banner` o `contentinfo`.

**R5** — La pantalla DEBE declarar metadata de título de documento propia, y ese título DEBE
incluir la marca del producto tal como la exporta su constante.

### Alcance de maquetación

**R6** — La pantalla y sus componentes de ruta NO DEBEN obtener ni escribir datos: NO DEBEN
consultar base de datos, NO DEBEN hacer peticiones de red, NO DEBEN leer ni emitir cookies, NO
DEBEN importar el punto de composición ni ningún módulo de negocio, y NO DEBEN recibir datos de
sesión por props.

**R7** — La pantalla y sus componentes de ruta DEBEN renderizarse en el servidor: NO DEBEN
declarar `'use client'` ni usar estado, efectos ni manejadores de eventos de React.

**R8** — La pantalla NO DEBE validar la sesión ni proteger el acceso a la ruta: NO DEBE
redirigir, NO DEBE leer cookie de sesión y NO DEBE consultar al proveedor de sesión.

### Estructura y contratos internos

**R9** — DONDE la pantalla necesite componentes propios, estos DEBEN vivir en la carpeta
`components/` de la ruta y exponerse a través de su barrel `index.ts`; la página NO DEBE
importarlos por ruta profunda ni dejarlos sueltos junto a `page.tsx`.

**R10** — La ubicación de la ruta y todo destino de navegación que use la pantalla DEBEN
derivarse de constantes de ruta exportadas, no de literales incrustados.

**R11** — El sistema NO DEBE modificar la colección de navegación privada ni sus constantes de
ruta, y el destino del ítem «Dashboard» DEBE seguir siendo **la misma constante** que ubica a
esta pantalla.

### Multiplataforma

**R12** — La pantalla DEBE presentar su título y su área de contenido tanto en viewport angosto
como en viewport ancho, y NO DEBE usar `100vh` como alto de pantalla ni depender de `:hover`
para mostrar o activar nada (`docs/architecture.md > Componentes > Regla: multiplataforma`).

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión | Cubierta por |
| --- | --- | --- | --- |
| 2026-09-02 | ¿QC-12 reconecta el ítem «Dashboard» del sidebar? | **NO. QC-12 crea la ruta y NADA MÁS.** El sidebar de QC-11 trae 5 ítems placeholder cuyas rutas dan 404 y hay deuda anotada en `progress/current.md` de que cada feature de módulo sustituya el suyo. Preguntado al humano hoy: **el ítem lo reconecta QC-13** (la guardia de sesión), no esta ficha. Esta feature no abre `lib/shared/navigation/private-nav.ts`. Escrito aquí para que el reviewer no lo lea como olvido | R11 |
| 2026-09-02 | Ruta exacta | `app/(private)/dashboard/page.tsx` → URL `/dashboard`, **derivada de `DASHBOARD_ROUTE`** (`lib/shared/routes.ts`), que es a donde ya redirige el login de QC-10 y a donde ya apunta el ítem del sidebar. El route group `(private)` no aporta segmento de URL (`design.md > 2`) | R1, R10 |
| 2026-09-02 | Route group | **`app/(private)/`**, heredado de la decisión humana de QC-11 (**D1**), que se aparta del `(dashboard)` de `docs/architecture.md`. **No es desviación a reportar** | R1 |
| 2026-09-02 | ¿Se re-crea layout o sidebar? | **NO.** Se heredan montados y mergeados. El choque entre las features 4 y 10 ya ocurrió una vez en este repo; **T0** existe para que no se repita | R1 (la pantalla se renderiza dentro del layout existente) |
| 2026-09-02 | ¿La página declara su propio `<main>`? | **NO.** `SidebarInset` **es** el `<main>` (verificado en `components/ui/sidebar.tsx:305`) y R5 de QC-11 exige landmark `main` único. La página aporta contenido, no armazón | R4 |
| 2026-09-02 | Contenido de la pantalla | **Vacía de verdad**: título + contenedor vacío. Sin tarjetas, KPIs, tablas ni «empty state». Es literalmente lo que pide la ficha del board y lo que exige `> Regla: sin sobre-ingenieria` | R3 |
| 2026-09-02 | ¿Server Component? | **Sí**, sin `'use client'`, sin datos y **sin props de sesión**. La sesión real la conecta QC-13. Precedente: la pantalla de login de QC-10 es Server Component puro | R6, R7 |
| 2026-09-02 | Protección de la ruta | **No entra.** `/dashboard` queda alcanzable sin autenticación hasta QC-13. Hecho conocido y aceptado; `docs/checkpoints-proyecto.md > Permisos > «Paginas protegidas validan permisos…»` **NO APLICA** en esta feature | R8 |
| 2026-09-02 | Componentes de ruta | En `app/(private)/dashboard/components/` con barrel `index.ts`, **aunque sea uno solo**: la regla lo dice expresamente («la consistencia vale más que ahorrar una carpeta»). Alternativa descartada y su porqué en `design.md > 7.A` | R9 |
| 2026-09-02 | Metadata de título | **Sí**, `export const metadata` con título propio que incluye la marca, siguiendo el precedente de `app/(public)/login/page.tsx`. El assert va sobre la constante `BRAND_LABEL`, **nunca** sobre el literal de copy | R5 |
| 2026-09-02 | Copy del título visible | **«Dashboard»**, derivado de la etiqueta que ya usa el ítem de navegación en `lib/shared/navigation/private-nav.ts`. No es un invento: es la única forma de nombrarlo que ya existe en el repo. Los tests **no afirman sobre el literal** | R2 |
| 2026-09-02 | Multiplataforma | **Se valida contra angosto y ancho** con el helper `tests/helpers/viewport.ts` de QC-11. **No se declara ninguna excepción de escritorio** | R12 |
| 2026-09-02 | Dependencias nuevas | **Ninguna.** No hace falta ningún primitivo nuevo de shadcn/ui ni ninguna librería. Si al implementar apareciera la necesidad, el `frontend_dev` **para y la propone**; no la instala (regla 7 de `CLAUDE.md`) | R3 (una pantalla vacía no puede necesitar librerías) |

### Notas de proceso (decisiones que no son requisitos de producto)

- **E2E diferido, con motivo escrito.** `CHECKPOINTS.md` pide E2E para flujos críticos. Aquí no
  hay flujo que ejercitar: no existe sesión real (R8) ni navegación privada protegida, así que
  un Playwright sobre `/dashboard` sólo comprobaría que una página estática renderiza — lo
  mismo que el test de componente, más lento y más frágil. **El E2E del camino
  login → dashboard lo aporta QC-13**, que es quien trae la sesión real. Queda como **T8** de
  `tasks.md` y como deuda anotada por el leader, no en silencio.
- **`docs/checkpoints-proyecto.md > Datos y seguridad (Supabase)` NO APLICA**: cero tablas, cero migraciones,
  cero RLS, cero secretos, cero webhooks (R6). Se declara, no se omite.
- **`docs/checkpoints-proyecto.md > Modulos hexagonales` NO APLICA**: esta feature no crea ni toca ningún
  módulo de `lib/modules/` (R6).
- **Conflicto de archivos previsible con QC-13.** Ambas features viven en `app/(private)/`.
  QC-12 sólo **crea** archivos nuevos bajo `app/(private)/dashboard/`; no edita ninguno de
  QC-11. Si QC-13 arranca en paralelo, el leader debe vigilar `AGENTS.md > Paralelismo`.

## Preguntas abiertas

**P1 — `app/page.tsx` (la raíz `/`) sigue siendo la plantilla intacta de `create-next-app`.**
¿Debe `/` redirigir a `DASHBOARD_ROUTE` (o a la pantalla de login), y qué feature lo hace?
Ninguna ficha del backlog lo cubre hoy. **Fuera del alcance de QC-12** y **no se rellena con un
supuesto** (regla 6 de `CLAUDE.md`): esta feature no toca `app/page.tsx`. Si el humano quiere
cerrarlo aquí, es un cambio de alcance explícito.

Si durante la implementación aparece cualquier otra ambigüedad, el `frontend_dev` **para y la
reporta al leader**; no la rellena con supuestos.
