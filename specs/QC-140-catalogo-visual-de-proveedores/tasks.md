# QC-140 — catalogo-visual-de-proveedores · tasks.md

> Orden de arriba abajo, salvo las marcadas `[P]`, que pueden ir en paralelo con las hermanas que
> se indican. Cada task es un commit (`feat(QC-140): …` / `test(QC-140): …`).
>
> **Antes de empezar (reglas de la ficha):**
> - Spec aprobado en F1.4 el 2026-09-23. Sus decisiones son D14-D20 de `requirements.md` y no
>   queda ninguna pregunta abierta.
> - **Base de datos propia: `QuimiCloude_QC140`.** Los tests de integración, la migración si la
>   hubiera (hoy no se prevé ninguna) y los E2E de esta ficha corren contra esa base, **nunca** contra
>   la de `.env`. `DATABASE_URL` y `DIRECT_URL` se sobrescriben en el entorno del comando.
> - **Una sola E2E a la vez en la máquina.** No se lanza Playwright si hay otra corrida E2E viva, sea
>   de esta rama o de otro worktree.
> - **Ningún mensaje de commit de esta rama menciona «QC-44».**
>   `tests/unit/proveedores-ui/guard-convenciones-proveedores.test.ts` atribuye a QC-44 todo commit
>   cuyo mensaje contenga esa marca, y esta ficha toca `lib/modules/`, `lib/composition/index.ts` y
>   `package.json`, que esa guardia le veta a QC-44.
> - Los comentarios de producción no citan fichas ni requisitos (`docs/conventions.md >
>   Comentarios`). `R<n>` solo aparece en los nombres de los tests.
> - Tanda cerrada = `./init.sh --rapido` en verde. Feature cerrada, y siempre antes del PR =
>   `./init.sh` completo.

## Fase 0 — Dependencia

- [x] **T0 — Instalar `react-intersection-observer` (D18).** Añadir la fila a `docs/dependencias.md`
  con los cuatro checks que verificó el leader el 2026-09-23 (v11.0.1 del 2026-08-26, 3.538.265
  descargas/semana entre el 2026-09-15 y el 2026-09-21, MIT, sin `deprecated`), la aprobación
  humana de F1.4 y la nota «aislada en `showcase-load-trigger.tsx`». Instalar con `pnpm add`.
  Confirmar en el paquete instalado lo que `design.md > 7.2` deja pendiente: las
  `peerDependencies` frente a `react@19.2.8`, `useInView` y `test-utils`. Si algo no cuadra, parar y
  subirlo al leader.
  - Archivos: `package.json`, `pnpm-lock.yaml`, `docs/dependencias.md`.
  - Hecho: `tests/guards/guard-dependencias-aprobadas.test.ts` en verde; la fila cita la aprobación
    y lo confirmado en el paquete.
  - Depende de: nada.

## Fase 1 — Dominio y backend

- [x] **T1 [P con T0] — Tipos, constantes y esquemas de la vista.** `supplier-showcase.ts` con
  `SHOWCASE_SUPPLIER_BATCH`, `SHOWCASE_LINE_BATCH`, `SHOWCASE_SUPPLIER_SORT` y `SHOWCASE_LINE_SORT`
  (nombre ascendente, D17), los cinco tipos y los dos esquemas zod (`design.md > 2.1, 2.2`).
  - Archivos: `lib/modules/proveedores/domain/supplier-showcase.ts`,
    `tests/unit/proveedores/supplier-showcase-schema.test.ts`.
  - Hecho: el test cubre los valores por defecto, el tope de 120, el rechazo de `page` < 1 (y < 2 en
    líneas) y que un término de solo espacios cuenta como vacío (R24).
  - Depende de: nada.

- [x] **T2 — Puerto: `listShowcaseAlive`.** Añadir el método a `SupplierRepository`, con `scope:
  SupplierScope` al final. Subir de 5 a 6 el `metodosEsperados` de `SupplierRepository` en la guardia
  de ámbito.
  - Archivos: `lib/modules/proveedores/ports/supplier-repository.ts`,
    `tests/guards/guard-ambito-empresa-proveedores.test.ts`.
  - Hecho: `pnpm run typecheck` da rojo solo en el adaptador y en la composición, que aún no lo
    implementan; se cierra en T4.
  - Depende de: T1.

- [x] **T3 — Casos de uso `listSupplierShowcase` y `listShowcaseLines`.** Permiso primero, luego zod,
  luego puerto (`design.md > 2.3`). `listShowcaseLines` reutiliza
  `SupplierCatalogRepository.listBySupplierAlive` con `search: productSearch` (D14), traduce
  `'supplier_not_found'` y proyecta a `ShowcaseLine`. Reexportar en `index.ts` las dos factories,
  los tipos y las constantes.
  - Archivos: `lib/modules/proveedores/domain/list-supplier-showcase.ts`,
    `lib/modules/proveedores/domain/list-showcase-lines.ts`, `lib/modules/proveedores/index.ts`,
    `tests/unit/proveedores/showcase-service.test.ts`.
  - Hecho: tests con puertos dobles que cubren:
    - **R4**: con actor nulo o sin permiso lanza, y el puerto no se llama, en los dos casos de uso;
    - R28: `supplier_not_found`;
    - la consulta que llega al puerto: `pageSize` 10, orden `name asc` y el término de producto;
    - la proyección sin `createdBy`/`updatedBy` (R8);
    - `hasMore` en la última página.
  - Depende de: T1, T2.

- [x] **T4 — Adaptador `listShowcaseAliveSuppliers` y cableado.** En `supplier-prisma.ts`, según
  `design.md > 3`:
  - `take: 6`, con orden `name asc, id asc`;
  - `some` de líneas **solo** si hay filtro de producto (D15);
  - cinco `findMany` de líneas en paralelo, con `buildCatalogLineWhere` y `catalogLineOrderBy`
    importados de `supplier-catalog-line-prisma.ts`, y `take: 11`;
  - `select` mínimo.

  Cablear el método y los dos casos de uso en `lib/composition/index.ts`.
  - Archivos: `lib/modules/proveedores/adapters/driven/persistence/supplier-prisma.ts`,
    `lib/composition/index.ts`, `tests/unit/proveedores/showcase-prisma.test.ts` (forma del
    `where`/`orderBy` con un Prisma doble).
  - Hecho: `typecheck` en verde; `guard-ambito-empresa-proveedores` y `guard-arquitectura-modulos`
    en verde.
  - Depende de: T3.

- [x] **T5 — Integración contra `QuimiCloude_QC140`.** Datos del caso:
  - dos empresas;
  - proveedores vivos, dados de baja y sin líneas;
  - líneas con imagen, con `null` y con `''`, con acentos y mayúsculas;
  - un proveedor con más de 11 líneas, y más de 6 proveedores en total.

  Encadenar tanda 1 → tanda 2 → «cargar más» página 2 y página 3, y comprobar que el prefijo es exacto,
  sin huecos ni repetidos, y que el orden es alfabético. Si el `EXPLAIN` del `some` sale
  secuencial, parar y proponer el índice (R29) en vez de añadirlo sin más.
  - Archivos: `tests/integration/proveedores/supplier-showcase.int.test.ts` y
    `tests/integration/aislamiento.json`. La entrada va en `commit`, con motivo y fecha, como la de
    `list-query-suppliers.int.test.ts`, porque el adaptador usa el cliente Prisma global.
  - Hecho: en verde contra `QuimiCloude_QC140`, cubriendo **R17, R19, R20, R21, R22, R23, R24, R27,
    R28, R30 y R31**; `guard-aislamiento-integracion` en verde.
  - Depende de: T4.

- [x] **T6 [P con T5] — Server Actions.** `listSupplierShowcaseAction` y `listShowcaseLinesAction`
  en `supplier-actions.ts` (`design.md > 4`). Si el test de conteo de sesión lo exige, se añaden a
  su lista.
  - Archivos: `lib/modules/proveedores/adapters/driving/supplier-actions.ts`,
    `tests/unit/proveedores/supplier-actions.test.ts`,
    `tests/unit/identity/session-once-per-request-actions.test.ts`.
  - Hecho: tests de éxito, de `unauthorized`, de `supplier_not_found` y de un fallo ajeno traducido
    a `unexpected` sin detalle (R34, R35); una sola lectura de sesión por invocación.
  - Depende de: T4.

## Fase 2 — Pantallas

- [x] **T7 [P con T5, T6] — Promover el panel de proveedor a `components/shared/supplier/`
  (D19).** Mover `supplier-sheet.tsx`, `supplier-form.tsx` y `supplier-field.tsx` de
  `app/(private)/proveedores/components/` a `components/shared/supplier/`, con su `index.ts`, y
  actualizar sus importadores y sus tests. Es un movimiento sin cambio de comportamiento
  (`design.md > 5.3`).
  - Archivos: `components/shared/supplier/{index.ts,supplier-sheet.tsx,supplier-form.tsx,supplier-field.tsx}`,
    los tres originales (borrados), `app/(private)/proveedores/components/index.ts`,
    `app/(private)/proveedores/components/supplier-list-empty.tsx` si los importa, y los tests que
    los importan por su ruta antigua.
  - Hecho: `typecheck` y todos los tests de `proveedores-ui` en verde sin cambiar ninguna aserción
    de comportamiento; mismos `data-testid`.
  - Depende de: nada de backend.

- [x] **T8 — Editar y dar de baja en la cabecera del detalle (D19).** Mudar
  `delete-supplier-dialog.tsx` a `app/(private)/proveedores/[id]/components/` y exportarlo en su
  barrel. Tras una baja con éxito, el diálogo navega con `router.replace(SUPPLIERS_ROUTE)` en lugar
  de `router.refresh()`. La cabecera del detalle monta `SupplierSheet supplier={…}` (desde
  `@/components/shared/supplier`) y `DeleteSupplierDialog supplier={…}`. El resto del detalle no
  cambia.
  - Archivos: `app/(private)/proveedores/[id]/page.tsx` y/o
    `[id]/components/supplier-detail-header.tsx`, `[id]/components/delete-supplier-dialog.tsx`
    (mudado), `[id]/components/index.ts`, `app/(private)/proveedores/components/index.ts`,
    `tests/unit/proveedores-ui/supplier-detail-page.test.tsx` y el test del diálogo, si existe.
  - Hecho: **R37** (ninguna fila de la vista monta esos controles, comprobado en T11) y **R38**:
    editar refresca el detalle con los datos nuevos, y la baja con éxito navega a la vista con su
    aviso. `catalog-route-contract.test.ts` sigue en verde: el detalle no importa de `../components`.
  - Depende de: T7.

- [x] **T9 [P con T8] — Parámetros y filtros.** `supplier-showcase-params.ts` (nombres de los dos
  parámetros, parseo y `showcaseHref` derivado de `SUPPLIERS_ROUTE`) y
  `supplier-showcase-filters.tsx`.
  - Archivos: `app/(private)/proveedores/components/supplier-showcase-params.ts`,
    `app/(private)/proveedores/components/supplier-showcase-filters.tsx`,
    `tests/unit/proveedores-ui/supplier-showcase-params.test.ts`,
    `tests/unit/proveedores-ui/supplier-showcase-filters.test.tsx`.
  - Hecho: cubre R24, R25 (cambiar un filtro navega a la URL sin página), campos con `text-base` y
    controles con `min-h-11` (R39), y «limpiar» vacía los dos filtros.
  - Depende de: T6.

- [x] **T10 [P con T8, T9] — Tarjeta, fila y disparador.** `showcase-line-card.tsx` (reutiliza
  `EntityImage` a 60 px); `supplier-showcase-row.tsx` (enlace con `supplierDetailRoute`, «Sin
  productos todavía» con enlace a la ficha, carrusel accesible, «cargar más», aviso con
  «Reintentar» en la fila); y `showcase-load-trigger.tsx`, que es el **único** importador de
  `react-intersection-observer`.
  - Archivos: esos tres en `app/(private)/proveedores/components/`, más
    `tests/unit/proveedores-ui/showcase-line-card.test.tsx`,
    `tests/unit/proveedores-ui/supplier-showcase-row.test.tsx` y
    `tests/unit/proveedores-ui/showcase-load-trigger.test.tsx`.
  - Hecho:
    - R6, R7, R8;
    - **R9**: `data-missing` con `null`, `''` y `error`; el componente viene de
      `@/components/shared/entity-image` y el tamaño sigue en 60;
    - R10, R15, R16, R30;
    - R35 en la fila: el fallo pinta el aviso, «Reintentar» repite la carga y, si sale bien, el
      aviso se retira;
    - R39, R40;
    - el disparador, probado con el centinela simulado.
  - Depende de: T0, T6.

- [x] **T11 — Lista con carga perezosa, sección, esqueleto, página y retirada de la lista de
  QC-44.**
  - `supplier-showcase-list.tsx`: acumula, descarta `id` repetidos, un solo vuelo a la vez, para
    en `hasMore: false`, y si una tanda falla pinta el aviso al pie con «Reintentar».
  - `supplier-showcase-section.tsx` y `supplier-showcase-skeleton.tsx`.
  - `page.tsx` reescrito, con los filtros fuera del `<Suspense>` y el alta desde
    `@/components/shared/supplier`.
  - Se **borran** `supplier-table.tsx`, `supplier-columns.tsx`, `supplier-columns-skeleton.ts`,
    `supplier-table-skeleton.tsx`, `supplier-list-section.tsx` y `supplier-list-params.ts`, y se
    reescribe `components/index.ts`.
  - Archivos: `app/(private)/proveedores/page.tsx`, `app/(private)/proveedores/components/*` (los
    nuevos, los borrados y el barrel), `tests/unit/proveedores-ui/supplier-showcase-list.test.tsx`,
    `tests/unit/proveedores-ui/supplier-page.test.tsx` (reescrito como
    `supplier-showcase-page.test.tsx`). Además se borra
    `tests/unit/proveedores-ui/supplier-list-params.test.ts` y se actualiza el caso «R30» de
    `tests/unit/proveedores-ui/supplier-route-contract.test.ts`.
  - Hecho: cubre R1, R2, R5, R11, R12, R13, R14, R17 (con una tanda que repite un id), R26, R32,
    R33, R34, R35 (lista), R36 (el alta reinicia la lista y el proveedor nuevo aparece, D15) y R37.
    El test de pantallas que exigen permiso sigue verde (R3).
  - Depende de: T8, T9, T10.

## Fase 3 — Guardias, E2E y cierre

- [x] **T12 — Guardia de convenciones de la ficha.** Comprueba que:
  - `react-intersection-observer` tiene un solo importador;
  - no hay ningún `new IntersectionObserver` ni escucha de `scroll` en `app/(private)/proveedores/`;
  - la URL no aparece como literal, ni entre comillas ni en plantilla;
  - los componentes de cliente de la vista no importan `lib/composition`, `@/lib/shared/db` ni
    `@prisma/client`;
  - el diff de la ficha no añade ningún archivo bajo `db/` (R29);
  - `components/shared/entity-image.tsx` no aparece en el diff de la ficha (D20).
  - Archivos: `tests/unit/proveedores-ui/guard-convenciones-showcase.test.ts`.
  - Hecho: en verde, y en rojo comprobado a mano al introducir cada violación una vez
    (anti-placebo).
  - Depende de: T11.

- [x] **T13 — Adaptar los dos E2E afectados (R41, D19).** No se añade ningún E2E nuevo (D9).
  - **`e2e/proveedores.spec.ts`**:
    - el alta busca la fila del proveedor nuevo en la vista, no en la tabla; sale aunque aún no
      tenga líneas (D15);
    - se llega al detalle por el enlace del nombre;
    - la búsqueda por nombre usa el filtro de proveedor;
    - **el caso de orden descendente se retira**, porque la vista no ordena por columnas (D2), y el
      commit lo dice;
    - el 404 sin permiso comprueba que no se pinta ninguna fila de la vista.
  - **`e2e/aislamiento-proveedores.spec.ts`**:
    - que la lista de A no trae proveedores de B se comprueba en la vista;
    - la baja de un proveedor propio **se hace desde la cabecera de su detalle** (D19), no desde
      una fila;
    - el intento de baja con el identificador de un proveedor de B sigue rechazándose y lo deja
      intacto;
    - el alta en A con el nombre de un proveedor de B se comprueba en la vista.
  - Archivos: `e2e/proveedores.spec.ts`, `e2e/aislamiento-proveedores.spec.ts`.
  - Hecho: los dos specs en verde contra `QuimiCloude_QC140`, **uno después del otro y sin otra E2E
    viva en la máquina**.
  - Depende de: T8, T11.

- [ ] **T14 — Revisión manual multiplataforma (R39).** En Safari iOS (o el simulador WebKit) y en
  Chrome Android, comprobar:
  - el desplazamiento horizontal del carrusel dentro del vertical;
  - la carga perezosa al llegar al pie;
  - «cargar más» y «Reintentar»;
  - los filtros, sin zoom al enfocar;
  - editar y dar de baja desde el detalle.
  - Archivos: `progress/impl_QC-140-catalogo-visual-de-proveedores.md` (resultado por plataforma).
  - Hecho: las tres plataformas anotadas; si alguna falla, se para y se sube al leader.
  - Depende de: T8, T11.

- [ ] **T15 — Cierre.** Mapa `R<n> -> test` completo (R1-R41) en
  `progress/impl_QC-140-catalogo-visual-de-proveedores.md`; `./init.sh` completo en verde.
  - Hecho: ningún requisito sin test y el gate completo en verde.
  - Depende de: T5, T12, T13, T14.
