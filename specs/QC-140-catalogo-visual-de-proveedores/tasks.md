# QC-140 — catalogo-visual-de-proveedores · tasks.md

> Orden de arriba abajo salvo `[P]`, que puede ir en paralelo con las tasks hermanas que se
> indican. Cada task es un commit (`feat(QC-140): …` / `test(QC-140): …`).
>
> **Antes de empezar (reglas de la ficha):**
> - **Nada arranca antes de F1.4.** Las preguntas P1-P7 de `requirements.md` se cierran en la
>   aprobación. Las tasks marcadas **(Pn)** se implementan con la opción que el humano elija, según
>   `design.md > 8`.
> - **Base de datos propia: `QuimiCloude_QC140`.** Los tests de integración, la migración si
>   la hubiera (hoy no se prevé ninguna) y los E2E de esta ficha corren contra esa base, **nunca**
>   contra la de `.env`. `DATABASE_URL`/`DIRECT_URL` se sobrescriben en el entorno del comando.
> - **Una sola E2E a la vez en la máquina.** No se lanza Playwright si hay otra corrida E2E viva,
>   sea de esta rama o de otro worktree.
> - **Ningún mensaje de commit de esta rama menciona «QC-44».**
>   `tests/unit/proveedores-ui/guard-convenciones-proveedores.test.ts` atribuye a QC-44 todo commit
>   cuyo mensaje contenga esa marca, y esta ficha toca `lib/modules/`, `lib/composition/index.ts` y
>   `package.json`, que esa guardia le veta a QC-44.
> - Comentarios de producción sin fichas ni requisitos (`docs/conventions.md > Comentarios`). `R<n>`
>   solo en los nombres de los tests.
> - Tanda cerrada = `./init.sh --rapido` en verde. Feature cerrada y antes del PR = `./init.sh`.

## Fase 0 — Dependencia

- [ ] **T0 — Instalar la librería aprobada (P5).** Solo si en F1.4 quedó aprobada, con los cuatro
  checks **verificados con red** y anotados. Se añade la fila a `docs/dependencias.md` (checks,
  fecha, aprobación humana, «aislada en `showcase-load-trigger.tsx`») y se instala con `pnpm add`.
  - Archivos: `package.json`, `pnpm-lock.yaml`, `docs/dependencias.md`.
  - Hecho: `tests/guards/guard-dependencias-aprobadas.test.ts` en verde; la fila cita la aprobación.
  - Depende de: aprobación F1.4.

## Fase 1 — Dominio y backend

- [ ] **T1 — Tipos, constantes y esquemas de la vista.** `supplier-showcase.ts` con
  `SHOWCASE_SUPPLIER_BATCH`, `SHOWCASE_LINE_BATCH`, `SHOWCASE_SUPPLIER_SORT`,
  `SHOWCASE_LINE_SORT` (P4), los cinco tipos y los dos esquemas zod (`design.md > 2.1, 2.2`).
  - Archivos: `lib/modules/proveedores/domain/supplier-showcase.ts`,
    `tests/unit/proveedores/supplier-showcase-schema.test.ts`.
  - Hecho: el test cubre valores por defecto, tope de 120, `page` < 1 (y < 2 en líneas) rechazado,
    término de solo espacios = vacío (R24).
  - Depende de: F1.4.

- [ ] **T2 — Puerto: `listShowcaseAlive`.** Añadir el método a `SupplierRepository` con `scope:
  SupplierScope` al final. Subir `metodosEsperados` de `SupplierRepository` de 5 a 6 en la guardia
  de ámbito.
  - Archivos: `lib/modules/proveedores/ports/supplier-repository.ts`,
    `tests/guards/guard-ambito-empresa-proveedores.test.ts`.
  - Hecho: `pnpm run typecheck` rojo solo en el adaptador y la composición, que aún no lo
    implementan (se cierra en T4).
  - Depende de: T1.

- [ ] **T3 — Casos de uso `listSupplierShowcase` y `listShowcaseLines`.** Permiso primero, zod, puerto
  (`design.md > 2.3`). `listShowcaseLines` reutiliza `SupplierCatalogRepository.listBySupplierAlive`,
  traduce `'supplier_not_found'` y proyecta a `ShowcaseLine`. P1 decide si pasa `productSearch`.
  Reexportar las dos factories, los tipos y las constantes en `index.ts`.
  - Archivos: `lib/modules/proveedores/domain/list-supplier-showcase.ts`,
    `lib/modules/proveedores/domain/list-showcase-lines.ts`, `lib/modules/proveedores/index.ts`,
    `tests/unit/proveedores/showcase-service.test.ts`.
  - Hecho: tests con puertos dobles de **R4** (nulo y sin permiso: lanza y el puerto no se llama,
    en los dos), R28 (`supplier_not_found`), consulta enviada al puerto con `pageSize` 10 y el
    orden de P4, proyección sin `createdBy`/`updatedBy` (R8), `hasMore` en la última página.
  - Depende de: T1, T2.

- [ ] **T4 — Adaptador `listShowcaseAliveSuppliers` + cableado.** En `supplier-prisma.ts`, según
  `design.md > 3`: `take: 6`, cinco `findMany` de líneas en paralelo con `buildCatalogLineWhere` y
  `catalogLineOrderBy` importados de `supplier-catalog-line-prisma.ts`, `take: 11`, `select`
  mínimo. P2 decide el `some` sin filtro. Cablear el método y los dos casos de uso en
  `lib/composition/index.ts`.
  - Archivos: `lib/modules/proveedores/adapters/driven/persistence/supplier-prisma.ts`,
    `lib/composition/index.ts`, `tests/unit/proveedores/showcase-prisma.test.ts` (forma del
    `where`/`orderBy` con Prisma doble).
  - Hecho: `typecheck` verde; `guard-ambito-empresa-proveedores` y
    `guard-arquitectura-modulos` verdes.
  - Depende de: T3.

- [ ] **T5 — Integración contra `QuimiCloude_QC140`.** Dos empresas; proveedores vivos, dados de baja
  y sin líneas; líneas con imagen, con `null`, con `''`, con acentos y mayúsculas; más de 11 líneas
  en un proveedor y más de 6 proveedores. Encadenar tanda 1 → tanda 2 → «cargar más» página 2 y 3,
  y comprobar prefijo exacto sin huecos ni repetidos. Si el `EXPLAIN` del `some` sale secuencial,
  parar y proponer el índice (R29) en lugar de añadirlo sin más.
  - Archivos: `tests/integration/proveedores/supplier-showcase.int.test.ts`,
    `tests/integration/aislamiento.json` (entrada en `commit` con motivo y fecha, como
    `list-query-suppliers.int.test.ts`, porque el adaptador usa el cliente Prisma global).
  - Hecho: verde contra `QuimiCloude_QC140`, cubriendo **R17, R19, R20, R21 (P1), R22, R23, R24,
    R27, R28, R30 (P2), R31 (P4)**; `guard-aislamiento-integracion` verde.
  - Depende de: T4.

- [ ] **T6 [P con T5] — Server Actions.** `listSupplierShowcaseAction` y `listShowcaseLinesAction` en
  `supplier-actions.ts` (`design.md > 4`). Si el test de conteo de sesión lo exige, se añaden a su
  lista.
  - Archivos: `lib/modules/proveedores/adapters/driving/supplier-actions.ts`,
    `tests/unit/proveedores/supplier-actions.test.ts`,
    `tests/unit/identity/session-once-per-request-actions.test.ts`.
  - Hecho: tests de éxito, `unauthorized`, `supplier_not_found` y fallo ajeno traducido a
    `unexpected` sin detalle (R34, R35); una sola lectura de sesión por invocación.
  - Depende de: T4.

## Fase 2 — Pantalla

- [ ] **T7 — Parámetros y filtros.** `supplier-showcase-params.ts` (nombres de los dos parámetros,
  parseo, `showcaseHref` derivado de `SUPPLIERS_ROUTE`) y `supplier-showcase-filters.tsx`.
  - Archivos: `app/(private)/proveedores/components/supplier-showcase-params.ts`,
    `app/(private)/proveedores/components/supplier-showcase-filters.tsx`,
    `tests/unit/proveedores-ui/supplier-showcase-params.test.ts`,
    `tests/unit/proveedores-ui/supplier-showcase-filters.test.tsx`.
  - Hecho: R24, R25 (cambiar filtro navega a la URL sin página), campo con `text-base` y controles
    `min-h-11` (R38), limpiar vacía los dos.
  - Depende de: T6.

- [ ] **T8 [P con T7] — Tarjeta, fila y disparador.** `showcase-line-card.tsx` (reutiliza
  `EntityImage`), `supplier-showcase-row.tsx` (enlace con `supplierDetailRoute`, carrusel
  accesible, «cargar más», error de fila según P3) y `showcase-load-trigger.tsx`, que es el
  **único** importador de la librería.
  - Archivos: esos tres en `app/(private)/proveedores/components/`, más
    `tests/unit/proveedores-ui/showcase-line-card.test.tsx`,
    `tests/unit/proveedores-ui/supplier-showcase-row.test.tsx`,
    `tests/unit/proveedores-ui/showcase-load-trigger.test.tsx`.
  - Hecho: R6, R7, R8, **R9** (`data-missing` con `null`, `''` y `error`, el componente viene de
    `@/components/shared/entity-image`), R10, R15, R16, R35 en la fila (P3), R38, R39;
    disparador probado con `mockAllIsIntersecting`.
  - Depende de: T0, T6.

- [ ] **T9 — Lista con carga perezosa.** `supplier-showcase-list.tsx`: acumula, descarta `id`
  repetidos, un solo vuelo, para en `hasMore: false`, error de tanda según P3.
  - Archivos: `app/(private)/proveedores/components/supplier-showcase-list.tsx`,
    `tests/unit/proveedores-ui/supplier-showcase-list.test.tsx`.
  - Hecho: R12, R13, R14, R17 (con una tanda que repite un id), R35 (lista, P3).
  - Depende de: T8.

- [ ] **T10 — Sección, esqueleto, página y retirada de la lista de QC-44.**
  `supplier-showcase-section.tsx`, `supplier-showcase-skeleton.tsx`, `page.tsx` reescrito (filtros
  fuera del `<Suspense>`). Se **borran** `supplier-table.tsx`, `supplier-columns.tsx`,
  `supplier-columns-skeleton.ts`, `supplier-table-skeleton.tsx`, `supplier-list-section.tsx` y
  `supplier-list-params.ts`, y se reescribe `components/index.ts`. P6 decide qué pasa con
  `delete-supplier-dialog.tsx`.
  - Archivos: `app/(private)/proveedores/page.tsx`, `app/(private)/proveedores/components/*`
    (los nuevos, los borrados y el barrel), `tests/unit/proveedores-ui/supplier-page.test.tsx`
    (reescrito como `supplier-showcase-page.test.tsx`), borrar
    `tests/unit/proveedores-ui/supplier-list-params.test.ts`, actualizar el caso «R30» de
    `tests/unit/proveedores-ui/supplier-route-contract.test.ts`.
  - Hecho: R1, R2, R5, R11, R26, R32, R33, R34, R36 (el alta reinicia la lista), R37; el test de
    pantallas que exigen permiso sigue verde (R3).
  - Depende de: T7, T9.

- [ ] **T11 (P6) — Edición y baja del proveedor.** Solo si P6 = opción recomendada: montar
  `SupplierSheet supplier=…` y `DeleteSupplierDialog` en la cabecera del detalle y navegar a la
  vista tras la baja. Con la opción (b), en la fila, y R37 cambia antes de empezar. Con la (c), no
  hay task.
  - Archivos (opción recomendada): `app/(private)/proveedores/[id]/page.tsx` o
    `[id]/components/supplier-detail-header.tsx`, el componente movido del barrel que corresponda,
    `tests/unit/proveedores-ui/supplier-detail-page.test.tsx`.
  - Hecho: editar y dar de baja desde el detalle probado en unitario; ningún import por ruta
    profunda entre las dos rutas (guardia de convenciones de QC-44 en verde).
  - Depende de: T10.

- [ ] **T12 (P7) [P con T11] — Tamaño de imagen, si P7 lo pide.** Prop opcional `size` en
  `EntityImage`, 60 por defecto.
  - Archivos: `components/shared/entity-image.tsx` y su test.
  - Hecho: las dos pantallas que ya la usan no cambian (sus tests en verde) y la tarjeta usa el
    tamaño acordado.
  - Depende de: T8.

## Fase 3 — Guardias, E2E y cierre

- [ ] **T13 — Guardia de convenciones de la ficha.** Un solo importador de la librería; ningún
  `new IntersectionObserver` ni escucha de `scroll` en `app/(private)/proveedores/`; ningún literal
  de la URL (comillas ni plantilla); los componentes de cliente de la vista no importan
  `lib/composition`, `@/lib/shared/db` ni `@prisma/client`; ningún archivo nuevo bajo `db/` en el
  diff de la ficha (R29).
  - Archivos: `tests/unit/proveedores-ui/guard-convenciones-showcase.test.ts`.
  - Hecho: verde, y rojo comprobado a mano al introducir cada violación una vez (anti-placebo).
  - Depende de: T10.

- [ ] **T14 — Adaptar los E2E existentes (R40).** Sin E2E nuevo (D9). En `e2e/proveedores.spec.ts`:
  el alta ya no busca la fila en la tabla, sino en la vista; la búsqueda por nombre usa el filtro de
  proveedor; **el caso de orden descendente se retira**, porque la vista no ordena por columnas (D2),
  y se dice en el propio commit; el 404 sin permiso comprueba que no hay ninguna fila de la vista.
  En `e2e/aislamiento-proveedores.spec.ts`: la lista de A no trae proveedores de B, mirado en la
  vista; la baja «conociendo el identificador» sigue el camino que fije P6.
  - Archivos: `e2e/proveedores.spec.ts`, `e2e/aislamiento-proveedores.spec.ts`.
  - Hecho: los dos specs en verde contra `QuimiCloude_QC140`, **uno después del otro y sin otra E2E
    viva en la máquina**.
  - Depende de: T10, T11.

- [ ] **T15 — Revisión manual multiplataforma (R38).** Safari iOS (o simulador WebKit) y Chrome
  Android: desplazamiento horizontal del carrusel dentro del vertical, carga perezosa al llegar al
  pie, «cargar más», filtros sin zoom al enfocar.
  - Archivos: `progress/impl_QC-140-catalogo-visual-de-proveedores.md` (resultado por plataforma).
  - Hecho: las tres plataformas anotadas; si alguna falla, se para y se sube al leader.
  - Depende de: T10.

- [ ] **T16 — Cierre.** Mapa `R<n> -> test` completo (R1-R40) en
  `progress/impl_QC-140-catalogo-visual-de-proveedores.md`; `./init.sh` completo en verde.
  - Hecho: ningún R sin test; gate completo verde.
  - Depende de: T5, T13, T14, T15.
