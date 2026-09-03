# QC-22 — pantalla-de-productos · tasks.md

Convenciones: `[P]` = paralelizable con las otras `[P]` del mismo bloque. Cada task indica sus
dependencias, **los archivos que toca** y su **criterio de hecho** (verificable, no «parece bien»).
Un commit por task, formato `docs/conventions.md > Commits`.

**Recordatorio de gate** (`docs/verification.md`, `AGENTS.md > Regla del gate`): el `frontend_dev`
corre **sólo** `pnpm run typecheck`, `pnpm run lint` y `pnpm exec vitest related --run <sus
archivos>`. **No corre la suite completa.** `./init.sh --rapido` lo corre el **leader** al cerrar
cada tanda; `./init.sh` **completo**, al cerrar la feature y **antes del PR, sin excepción**.

**Esta feature es casi aditiva.** Crea todo bajo `app/(private)/inventario/` y **sólo** edita
cuatro archivos heredados, los que R32 autoriza (`design.md > 1`):

- `lib/shared/routes.ts` · `lib/shared/navigation/private-nav.ts` ·
  `lib/modules/identity/domain/route-role-rules.ts` · `app/(private)/layout.tsx`

Si una task te pide abrir **cualquier otro** archivo ajeno —y en particular
`lib/modules/inventario/**`, que es de QC-20 y está `done`—: **para y avisa al leader**.

---

## Bloque 0 — Precondiciones

### [x] T0 — Verificar la base heredada (BLOQUEA TODO)
- **Depende de**: que QC-11, QC-12, QC-9 y QC-20 estén `done` y mergeadas en `dev` (lo están).
- **Qué se HEREDA ya montado y NO se re-crea** (comprobar uno por uno tras `git merge origin/dev`;
  ésta es la T0 que existe porque el choque entre las features 4 y 10 ya ocurrió una vez en este
  repo — `specs/11-*/tasks.md > T0`):
  1. `app/(private)/layout.tsx` con `SidebarProvider` + `SidebarInset`, y `SidebarInset`
     renderizando **`<main>`** (`components/ui/sidebar.tsx`). **No se crea otro layout ni otro
     `<main>`.**
  2. `components/private/app-sidebar.tsx` y `lib/shared/navigation/private-nav.ts` con
     `PRIVATE_NAV_ITEMS`, `BRAND_LABEL` e `INVENTORY_ROUTE`. **El sidebar no se re-crea.**
  3. Base de shadcn/ui: `components.json`, `lib/utils.ts` con `cn`, y las primitivas ya presentes
     `sheet`, `sonner`, `button`, `input`, `label`, `card`, `skeleton`, `separator`, `tooltip`,
     `dropdown-menu`. **`sheet` y `sonner` YA EXISTEN: no se vuelven a añadir.**
  4. Vitest configurado (`vitest.config.mts`, proyectos `ui`/`node`) y `tests/helpers/viewport.ts`
     con `WIDE_VIEWPORT`, `NARROW_VIEWPORT`, `setViewportWidth`, `resetViewport`,
     `clearSidebarStateCookie`. **No se monta Vitest.**
  5. Playwright montado (`playwright.config.*`, `e2e/` con 4 specs) y el patrón de fixtures de
     `e2e/session.spec.ts`. **No se monta Playwright.**
  6. Contrato público de `inventario` (`lib/modules/inventario/index.ts`) y las Server Actions de
     `adapters/driving/product-actions.ts` y `presentation-actions.ts`, con los tipos
     `CreateProductFormState`, `ProductMutationFormState`, `ProductListResult`. **El backend no se
     toca ni se amplía.**
  7. `lib/shared/pagination.ts` (`DEFAULT_PAGE_SIZE`, `MAX_PAGE_SIZE`), `lib/shared/routes.ts`
     (`PRIVATE_ROUTE_PREFIXES`) y `lib/modules/identity/domain/route-role-rules.ts`
     (`ROUTE_ROLE_RULES` vacío).
  8. **Que NO existe `app/(private)/inventario/`.**
- **Si falta cualquiera, o si el punto 8 falla: PARAR y avisar al leader.** No se «arregla»
  creando layout, sidebar, Vitest o Playwright: eso duplicaría trabajo mergeado y garantizaría
  conflicto.
- **Hecho cuando**: los ocho puntos están verificados con su evidencia en
  `progress/impl_QC-22-pantalla-de-productos.md`.

### [x] T1 — Leer y anotar el contrato que se consume (BLOQUEA el código de datos)
- **Depende de**: T0.
- **Qué**: anotar en `progress/impl_QC-22-pantalla-de-productos.md`: (a) la firma exacta de las
  seis actions que se usan; (b) que **no exportan `INITIAL_STATE`** y que el estado inicial se
  construye como literal `{ status: 'idle' }` con el tipo exportado; (c) que **ninguna llama a
  `revalidatePath`**, por lo que el refresco es de la pantalla (`design.md > 4.4`); (d) los campos
  de `ProductView` y cuáles quedan fuera de la tabla (`id`, `createdBy`, `updatedBy`).
- **Hecho cuando**: los cuatro puntos están anotados. Si algo difiere de `design.md > 0`, **parar y
  avisar**: cambia el diseño, no el contrato.

### [x] T2 — Añadir las primitivas que faltan por CLI
- **Depende de**: T0. **Archivos**: `components/ui/table.tsx`, `components/ui/select.tsx`,
  `components/ui/alert-dialog.tsx`.
- **Qué**: `pnpm dlx shadcn@latest add table select alert-dialog`. **`sheet` NO** (ya existe).
  **`form` NO**: arrastra `react-hook-form` + `@hookform/resolvers`, que son dependencias nuevas
  (P2 de `requirements.md`, `design.md > 8`); el diseño no las usa.
- **Verificación obligatoria, no asumible**: comparar `package.json` antes/después. **Si el CLI
  añadió cualquier entrada, PARAR y avisar al leader** (regla 7 de `CLAUDE.md`). Ningún archivo de
  `components/ui/` se edita a mano (R29).
- **Hecho cuando**: existen los tres archivos, `pnpm run typecheck` y `pnpm run lint` pasan,
  `package.json` **no cambió** y el diff está anotado.

---

## Bloque 1 — Ruta, prefijo y regla de rol (va ANTES que la página)

### [x] T3 — Constante única, prefijo privado y primera regla ruta→rol
- **Depende de**: T0. **Archivos**: `lib/shared/routes.ts`,
  `lib/shared/navigation/private-nav.ts`, `lib/modules/identity/domain/route-role-rules.ts`.
- **Qué** (`design.md > 2`, `> 3`):
  - mover `INVENTORY_ROUTE` a `lib/shared/routes.ts` y dejar que `private-nav.ts` la **importe**
    (una línea; no se toca nada más de ese archivo);
  - añadir `INVENTORY_ROUTE` a `PRIVATE_ROUTE_PREFIXES`;
  - añadir la primera fila a `ROUTE_ROLE_RULES`:
    `{ prefix: INVENTORY_ROUTE, roles: [ADMIN_ROLE_NAME] }`, con `ADMIN_ROLE_NAME` importado del
    **barrel** `@/lib/modules/inventario` (nunca por ruta profunda, nunca como literal);
  - borrar del comentario de `route-role-rules.ts` la frase que dice que la lista está vacía a
    propósito **sólo en lo que ya no sea cierto**, dejando escrito que la primera regla es ésta.
- **Va antes que la página a propósito** (`design.md > 12.3`): al revés,
  `guard-rutas-privadas-cubiertas.test.ts` pone el gate en rojo.
- **Hecho cuando**: `pnpm exec vitest related --run lib/shared/routes.ts` y las guardias
  (`pnpm run test:guardias`) pasan, y `grep` no encuentra `'/inventario'` como literal fuera de
  `routes.ts`.

### [x] T4 — Montar la región de avisos en el layout privado e **invertir** el test de QC-11
- **Depende de**: T0. **Archivos**: `app/(private)/layout.tsx`,
  `tests/unit/private-layout.test.tsx`.
- **Qué** (`design.md > 9`): montar `<Toaster richColors />` de `@/components/ui/sonner` en el
  layout privado. **Está previsto que el test `el layout privado no monta ninguna region de
  notificaciones` (líneas 260-279) se ponga rojo**: se **invierte, no se borra** — pasa a afirmar
  que hay **exactamente una** región de avisos, que sigue habiendo **un solo** `<main>` y que no
  aparece ningún otro landmark nuevo. En el test y en el layout queda escrito que **R36/D9 de
  QC-11 está superada por R22 de QC-22** (decisión humana del 2026-09-03), con la fecha.
- **Hecho cuando**: `pnpm exec vitest related --run app/\(private\)/layout.tsx` pasa en verde con
  el test invertido, y el motivo está anotado en `progress/impl_QC-22-pantalla-de-productos.md`.

---

## Bloque 2 — La pantalla

### [x] T5 — Parser de parámetros de lista
- **Depende de**: T3. **Archivos**: `app/(private)/inventario/components/product-list-params.ts`,
  `.../components/index.ts`.
- **Qué**: `parseProductListParams` puro (`design.md > 4.2`): `page` entero ≥ 1 con defecto 1;
  `pageSize` sólo 10 o 25 con defecto `DEFAULT_PAGE_SIZE` **importado**. Sin DOM, sin React.
- **Hecho cuando**: typecheck y lint limpios y el archivo no importa `react` ni `next/*`.

### [ ] T6 — Columnas, tabla, esqueleto, vacío y error
- **Depende de**: T2, T5. **Archivos**: `product-columns.ts`, `product-table.tsx`,
  `product-table-skeleton.tsx`, `product-list-empty.tsx`, `product-list-error.tsx`, barrel.
- **Qué** (`design.md > 4.3`, `> 7`): columnas como datos (`key`, `label`, `testId`), **sin**
  `createdBy`/`updatedBy` (R7); `cost` se pinta tal cual, sin `Number(...)` (R8); envoltorio con
  `overflow-x-auto` **en la tabla** (R9); esqueleto con tantas filas como `pageSize` (R15); vacío
  con acción de crear (R14); error con mensaje, `code` y reintento (R16).
- **Hecho cuando**: typecheck y lint limpios y `grep` no encuentra `100vh`, `parseFloat(`,
  `Number(` sobre `cost` ni `hover:` como única vía en estos archivos.

### [ ] T7 — Barra de herramientas: tamaño de página y paginación
- **Depende de**: T5, T6. **Archivos**: `product-list-toolbar.tsx`, barrel.
- **Qué**: `select` con **10 y 25** (R10) y controles de página anterior/siguiente con indicador
  «página X de Y» (R11). Cambiar cualquiera de los dos **navega** cambiando la cadena de consulta
  (`useRouter`/`useSearchParams`), nunca estado local. Controles ≥ 44×44 px (R31).
- **Hecho cuando**: typecheck y lint limpios; el componente no construye la URL con el literal de
  la ruta (usa `usePathname()` o la constante).

### [ ] T8 — Selector de presentación con alta en línea
- **Depende de**: T2. **Archivos**: `presentation-select.tsx`, barrel.
- **Qué** (`design.md > 5`): carga la primera página con `pageSize: MAX_PAGE_SIZE` **importado**,
  con «Cargar más» mientras `page < totalPages` (R24); alta en línea con
  `createPresentationAction` que, al tener éxito, **selecciona** la nueva presentación sin tocar el
  resto de los campos; `duplicate_name` se pinta junto al campo del nombre. **No** ofrece listar,
  editar ni borrar presentaciones (R25). Sin `sheet` anidado.
- **Hecho cuando**: typecheck y lint limpios; `grep` confirma que el archivo **no** importa
  `updatePresentationAction` ni `deletePresentationAction`.

### [ ] T9 — Formulario y panel lateral de alta/edición
- **Depende de**: T8. **Archivos**: `product-form.tsx`, `product-sheet.tsx`, barrel.
- **Qué** (`design.md > 5`): `<form action>` no controlado + `useActionState` con literal
  `{ status: 'idle' }`; validación previa con `createProductSchema` importado del **barrel**
  `@/lib/modules/inventario`; errores por campo con `aria-invalid`/`aria-describedby` y región
  `role="alert"` para los que no identifican campo (R20); el panel **no se cierra** con error;
  con éxito cierra, `toast.success` y `router.refresh()` (R21). Edición precargada y por
  reemplazo completo (R19). `unit` como `Input` de texto libre con el comentario de que QC-32 lo
  convertirá en selector (R23). `cost` como `type="text"`, nunca `type="number"`. Inputs a 16 px.
- **Hecho cuando**: typecheck y lint limpios; `grep` no encuentra `fetch(`, `@/lib/composition`,
  `prisma` ni `react-hook-form` en los archivos de la ruta.

### [ ] T10 — Diálogo de borrado
- **Depende de**: T2, T6. **Archivos**: `delete-product-dialog.tsx`, barrel.
- **Qué**: `alert-dialog` que **nombra el producto** y advierte que no se puede deshacer; sólo al
  confirmar envía el `<form>` con el `id` oculto a `deleteProductAction`; luego R21 (R26).
- **Hecho cuando**: typecheck y lint limpios.

### [ ] T11 — `page.tsx` y sección de lista
- **Depende de**: T5, T6, T7, T9, T10. **Archivos**: `app/(private)/inventario/page.tsx`,
  `.../components/product-list-section.tsx`, barrel.
- **Qué** (`design.md > 4.3`): Server Component con `export const metadata` construida con
  `BRAND_LABEL` **importado**; lee `searchParams`, llama a `parseProductListParams` y monta
  `<Suspense key={page-pageSize} fallback={<ProductTableSkeleton/>}>`; `ProductListSection` es
  `async`, llama a `listProductsAction` y despacha a error / vacío / tabla. Contenedor exterior
  `<div>`: **no se declara `<main>`** (R1). Importa **sólo desde `./components`** (R27).
- **Hecho cuando**: `pnpm run build` pasa, y `/inventario` responde 200 con sesión de Administrador
  en `pnpm dev` (evidencia anotada).

---

## Bloque 3 — Tests

### [ ] T12 — [P] Tests de la pantalla (render)
- **Depende de**: T11. **Archivos**: `tests/unit/inventario/product-page.test.tsx`,
  `tests/unit/inventario/product-list-params.test.ts`.
- **Qué**: ver el mapa de trazabilidad de abajo. Render dentro del layout privado reutilizando el
  patrón de mocks de `tests/unit/private-layout.test.tsx` y el helper `tests/helpers/viewport.ts`.
  Interacciones con `@testing-library/user-event`, nunca `fireEvent`. Asserts sobre roles ARIA,
  `data-testid` y constantes exportadas; **nunca** sobre literales de copy.
- **Hecho cuando**: cubre R1, R6-R17, R19-R21, R23, R24, R26, R31 y sale en verde.

### [ ] T13 — [P] Guardias de fuente y contrato de ruta
- **Depende de**: T11. **Archivos**: `tests/unit/inventario/product-route-contract.test.ts`.
- **Qué**: lo que «no hacer» exige, que no se observa renderizando (patrón de
  `tests/unit/dashboard-route-contract.test.ts`): ruta derivada de `INVENTORY_ROUTE`; sin literales
  de ruta; sin `fetch(`; sin `@/lib/composition` ni `prisma` en cliente; imports por barrel; sin
  `100vh`; sin `react-hook-form`; sin acciones de presentación prohibidas; sin `createdBy` en las
  columnas; `package.json` sin dependencias nuevas.
- **Hecho cuando**: cubre R2, R5, R7, R8, R9, R13, R18, R22, R25, R27, R28, R29, R30, R31, R32.

### [ ] T14 — [P] Tests de protección de ruta y rol
- **Depende de**: T3. **Archivos**: `tests/unit/identity/route-role-rules.test.ts` (ampliar),
  `tests/unit/identity/route-access.test.ts` (ampliar).
- **Qué**: la regla existe para `INVENTORY_ROUTE` con `ADMIN_ROLE_NAME`; `decideRouteAccess`
  devuelve `allow` para Administrador y `redirect` con motivo `forbidden` para otro rol; y sin
  sesión redirige al login (R3, R4). La guardia de rutas privadas ya cubre la cobertura del prefijo.
- **Hecho cuando**: cubre R3 y R4 y `pnpm run test:guardias` sigue en verde.

### [ ] T15 — E2E del camino completo y del rechazo por rol
- **Depende de**: T11, T14. **Archivos**: `e2e/inventario.spec.ts`.
- **Qué** (`design.md > 11`): (1) login → `/inventario` → alta (creando presentación si hace
  falta) → el producto aparece en la lista; (2) sesión con rol distinto de Administrador pide
  `/inventario` y acaba fuera sin ver la tabla. Fixtures propios con prefijo `qc22_e2e_`, limpieza
  de huérfanos por edad y borrado en `afterAll`, copiando `e2e/session.spec.ts`. Asserts filtrando
  por el nombre con `RUN_ID`, **nunca** por «la primera fila» ni por totales.
- **Hecho cuando**: `pnpm run e2e` pasa en Chromium y WebKit y la base queda limpia
  (`prisma.product.count()` con el prefijo = 0 tras la corrida).

---

## Bloque 4 — Verificación, trazabilidad y cierre

### [ ] T16 — Verificación manual en navegador, con iOS incluido
- **Depende de**: T11.
- **Qué**: `pnpm dev` con sesión de Administrador. En ancho ≥ 1280 px y en ancho ≤ 375 px
  (emulación móvil **y**, para el scroll anidado, Safari/WebKit real o simulador si está
  disponible): tabla con todas las columnas, **scroll horizontal dentro de la tabla y no del
  documento** (R9), panel lateral abre y cierra, toast visible, diálogo de borrado alcanzable,
  ningún input hace zoom al enfocar, targets cómodos con el pulgar.
- **Hecho cuando**: la comprobación está anotada (anchos, navegador y resultado) en
  `progress/impl_QC-22-pantalla-de-productos.md`. Si el scroll anidado falla en WebKit, **no se
  declara excepción de escritorio**: se arregla o se para y se reporta.

### [ ] T17 — Mapa de trazabilidad `R<n> → test`
- **Depende de**: T12, T13, T14, T15, T16.
- **Qué**: volcar la tabla de abajo, ya con los nombres reales de los tests, en
  `progress/impl_QC-22-pantalla-de-productos.md`, junto a los archivos tocados y la salida real.
- **Hecho cuando**: **los 32 requisitos (R1-R32)** tienen al menos un test nombrado. Un hueco es
  hallazgo bloqueante del reviewer.

### [ ] T18 — [P] Declarar los «no aplica» de `CHECKPOINTS.md`
- **Depende de**: T11.
- **Hecho cuando**: cada punto de la lista del final de este archivo está copiado con su motivo en
  `progress/impl_QC-22-pantalla-de-productos.md`.

### [ ] T19 — Gate completo y PR (lo cierra el leader)
- **Depende de**: T17, T18.
- **Hecho cuando**: `./init.sh` (completo, sin flags) termina en verde — **lo corre el leader** —,
  `package.json` **no ha cambiado**, `progress/impl_QC-22-pantalla-de-productos.md` tiene el mapa
  `R<n> → test` y la salida real, y el PR está abierto contra `dev` con título
  `feat(QC-22-pantalla-de-productos): …`.

---

## Mapa de trazabilidad previsto (`R<n> → test`)

| Req | Test previsto | Archivo |
| --- | --- | --- |
| R1 | `la pantalla de productos se renderiza dentro del armazon privado y no declara main propio` | product-page.test.tsx |
| R2 | `la ubicacion de la ruta se deriva de INVENTORY_ROUTE y ningun archivo incrusta el literal` + `el item Inventario del sidebar apunta a la misma constante` | product-route-contract.test.ts |
| R3 | `la ruta de inventario esta cubierta por un prefijo privado` (guardia existente) + `sin sesion, pedir inventario redirige al login` | guard-rutas-privadas-cubiertas.test.ts + route-access.test.ts |
| R4 | `existe una regla rutarol que restringe inventario al rol Administrador` + `un rol distinto de Administrador es redirigido con motivo forbidden` + E2E `un no Administrador no ve el catalogo` | route-role-rules.test.ts + route-access.test.ts + inventario.spec.ts |
| R5 | `la pantalla no repite requireAdmin ni decide autorizacion` + `un error unauthorized se presenta como error y no se muestran datos` | product-route-contract.test.ts + product-page.test.tsx |
| R6 | `la tabla presenta todas las columnas de negocio declaradas` | product-page.test.tsx |
| R7 | `la tabla no muestra createdBy ni updatedBy` (**en negativo**) | product-page.test.tsx + product-route-contract.test.ts |
| R8 | `el costo se presenta tal cual y ningun archivo lo convierte a numero` | product-route-contract.test.ts |
| R9 | `el desbordamiento horizontal lo absorbe el envoltorio de la tabla y ningun ancestro` | product-page.test.tsx + T16 (WebKit) |
| R10 | `el selector de tamano de pagina ofrece 10 y 25 y usa 10 por defecto` | product-page.test.tsx + product-list-params.test.ts |
| R11 | `permite avanzar y retroceder de pagina e indica la pagina actual y el total` | product-page.test.tsx |
| R12 | `los parametros invalidos o fuera de rango se acotan a valores validos` | product-list-params.test.ts |
| R13 | `la pantalla no ofrece busqueda ni control de orden` (**en negativo**) | product-page.test.tsx + product-route-contract.test.ts |
| R14 | `sin productos presenta el estado vacio con la accion de crear` | product-page.test.tsx |
| R15 | `mientras carga presenta el esqueleto en lugar de la tabla` | product-page.test.tsx |
| R16 | `un error de la consulta presenta el estado de error con reintento y no una tabla vacia` | product-page.test.tsx |
| R17 | `crear y editar abren un panel lateral y al cerrarlo se conserva pagina y tamano` | product-page.test.tsx + inventario.spec.ts |
| R18 | `el alta envia por la Server Action del catalogo y no por fetch` | product-route-contract.test.ts + inventario.spec.ts |
| R19 | `la edicion precarga los valores actuales y envia el reemplazo completo` | product-page.test.tsx |
| R20 | `un guardado rechazado muestra el error en linea y no cierra el panel ni pierde lo escrito` | product-page.test.tsx |
| R21 | `un guardado con exito cierra el panel, avisa por toast y refresca la lista` | product-page.test.tsx + inventario.spec.ts |
| R22 | `el layout privado monta exactamente una region de avisos y sigue teniendo un solo main` (**test invertido de QC-11**) | private-layout.test.tsx |
| R23 | `la unidad se captura como texto libre` | product-page.test.tsx |
| R24 | `el selector alcanza presentaciones mas alla de la primera pagina y permite crear una que queda seleccionada` | product-page.test.tsx |
| R25 | `la pantalla no ofrece editar ni borrar presentaciones` (**en negativo**) | product-route-contract.test.ts |
| R26 | `el borrado pide confirmacion nombrando el producto y sin confirmar no invoca la operacion` | product-page.test.tsx |
| R27 | `los componentes de ruta se exponen por el barrel y no se importan por ruta profunda` | product-route-contract.test.ts |
| R28 | `ningun archivo de la ruta usa fetch a rutas API propias` | product-route-contract.test.ts |
| R29 | `ninguna primitiva de components/ui fue editada a mano y no entraron dependencias` | product-route-contract.test.ts |
| R30 | `los componentes de cliente no importan composicion ni base de datos y reciben datos por props` | product-route-contract.test.ts + product-page.test.tsx |
| R31 | `la pantalla presenta lista y acciones en viewport angosto y ancho` + `no usa 100vh ni hover como unica via y respeta tamanos tactiles y de fuente` | product-page.test.tsx + product-route-contract.test.ts |
| R32 | `la feature no duplica layout, sidebar ni primitivas: solo edita los cuatro archivos heredados autorizados` | product-route-contract.test.ts |

Ningún requisito queda huérfano: R1-R32, sin saltos. **R7, R13 y R25 son tests en negativo a
propósito**: mostrar el autor, colar un buscador que miente o abrir la gestión de presentaciones
son justo las cosas que una feature posterior puede añadir sin que nada se ponga rojo.

## Cobertura de las decisiones cerradas (cada fila tiene al menos un `R<n>`)

| Decisión del 2026-09-03 | Requisito(s) |
| --- | --- |
| Solo productos, presentaciones a QC-45 | R25 (y R24 para el único resquicio permitido) |
| URL `/inventario` | R1, R2 |
| Constante de ruta en un solo sitio | R2 |
| Protección de la ruta (prefijo + regla ruta→rol) | R3, R4 |
| Autorización sobre los datos: la aporta el service, no la ruta | R5 |
| Alta y edición en panel lateral | R17 |
| Sin búsqueda ni orden configurable | R13 |
| Tamaño de página 10/25 | R10, R12 |
| Todas las columnas + scroll horizontal en la tabla | R6, R9 |
| Crear presentación desde el selector | R24 |
| Unidad como texto libre | R23 |
| Toast de éxito, error en línea, `<Toaster />` en el layout privado | R20, R21, R22 |
| Borrado con confirmación, irreversible para el usuario | R26 |
| E2E del camino completo y del rechazo por rol | R4, R17, R18, R21 (los tests E2E de T15) |
| No se muestra quién creó o modificó | R7 |
| Route group `app/(private)/` | R1 |
| Componentes de ruta con barrel | R27 |
| Mutaciones por Server Actions | R28 |
| shadcn/ui por CLI, nada a mano | R29 |
| Datos de sesión por props | R30 |
| Rutas en constantes, asserts sobre roles/testid/constantes | R2 (+ criterio de T12/T13) |
| Multiplataforma sin excepción | R31 |
| Base heredada: no se re-crea | R32 (+ T0) |

## Checklist de `CHECKPOINTS.md`: qué «no aplica» (declararlo, no omitirlo)

- **Datos y seguridad (Supabase)** — tablas, RLS, migraciones, `down.sql`, secretos, webhooks:
  **NO APLICA**. Cero cambios en `db/`: el esquema y sus policies son de QC-20, ya mergeados.
- **«Cada permiso se valida en el SERVICE y tiene su test»**: **YA CUMPLIDO POR QC-20**
  (`requireAdmin` en los nueve casos de uso, con `tests/unit/inventario/authorization.test.ts`).
  Esta feature **no lo re-implementa**; añade el corte de ruta, que es adicional y **no cuenta como
  autorización** (R5, `docs/architecture.md > Permisos y autenticacion`).
- **Módulos hexagonales**: aplica sólo de refilón — no se crea ni se modifica ningún módulo salvo
  la fila de `ROUTE_ROLE_RULES` en `identity/domain/`, que importa el **barrel** de `inventario`
  (permitido por la tabla de dependencias).
- **Mutaciones internas usan Server Actions**: **SÍ APLICA** (R28).
- **Componentes privados reciben datos por props**: **SÍ APLICA** (R30).
- **E2E de flujo crítico**: **SÍ APLICA**, T15.
- **Multiplataforma**: **SÍ APLICA**, sin excepción declarada (R31, T16).
- **Dependencias**: **ninguna añadida**. Hay **una propuesta pendiente de aprobación humana**
  (`react-hook-form` + `@hookform/resolvers`, `design.md > 8`, P2) que el diseño **no** usa.

## Deudas y notas que esta feature deja registradas (no silenciosas)

- **R36/D9 de QC-11 queda superada** por R22: el layout privado ahora sí monta `<Toaster />`. El
  test se invirtió, no se borró (T4).
- **`revalidatePath` en las actions de `inventario`** sería más barato que `router.refresh()` si
  más pantallas repiten el patrón. Es ficha de backend, no de aquí (`design.md > 10.G`).
- **El campo `unit` es texto libre** y QC-32 lo convertirá en selector: retrabajo aceptado a
  conciencia por el humano.
- **P1 sigue abierta**: qué pasa con `/inventario` cuando llegue QC-45. Por eso la constante de
  ruta queda en un solo sitio.
- **P2 sigue abierta** hasta que el humano apruebe el spec: `form` de shadcn/ui y sus dos
  dependencias.
- **Los 4 ítems placeholder restantes del sidebar** siguen dando 404; «Inventario» deja de darlo.
