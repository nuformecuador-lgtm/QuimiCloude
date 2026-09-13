# QC-102 — responsables-en-la-pantalla-de-pedidos · tasks.md

18 tasks. `[P]` = paralelizable con las de su misma tanda. Cada una cierra con un criterio de
«hecho» comprobable; ninguna se da por hecha sin `./init.sh --rapido` en verde, y la feature no
cierra sin `./init.sh` completo (`docs/verification.md`).

**Regla que atraviesa todas**: los cuatro casos de uso de QC-87 **no se tocan**. Si una task pide
cambiarlos, está mal escrita.

## Tanda A — el backend en lote (T1 → T6, en orden)

- [ ] **T1. El puerto gana `listByOrdersInCompany`.**
      `lib/modules/asignaciones/ports/order-assignment-repository.ts`: método nuevo y tipo
      `OrderAssignmentRowWithOrder`, `companyId` como **primer** parámetro. No se toca ninguno de
      los tres métodos existentes.
      **Hecho**: `pnpm run typecheck` en verde y el test de contrato del puerto
      (`tests/unit/asignaciones/order-assignment-repository.test.ts`) afirma que una llamada sin
      `companyId` no compila.

- [ ] **T2. El adaptador driven lo implementa.** (depende de T1)
      Un solo `findMany` con `orderId: { in }`, `select` con `orderId`, `orderBy`
      `[orderId, userId]`. **Sin `include` y sin `join`.**
      **Hecho**: test de integración contra Postgres real con dos pedidos de una empresa y uno de
      otra; el de la otra empresa **no vuelve**. Archivo declarado en
      `tests/integration/aislamiento.json`.

- [ ] **T3. Se extrae el comparador y `toOrigin` a `domain/responsible-order.ts`.** (depende de T1)
      `list-order-responsibles.ts` pasa a importarlos; **su comportamiento no cambia**.
      **Hecho**: los tests ya existentes de `list-order-responsibles` pasan **sin tocar su guion**.

- [ ] **T4. El caso de uso `createListResponsiblesForOrders`.** (depende de T2, T3)
      Permiso primero, zod después, corte por lista vacía, dos consultas, agrupado y orden.
      **Hecho**: unit tests de R1, R2, R4, R6, R7, R8, R9, R10, R11, R12 con puertos falsos que
      **cuentan invocaciones**.

- [ ] **T5. Cableado en `lib/composition/index.ts`.** (depende de T4)
      Una factory más en el bloque `asignaciones`; ningún adaptador nuevo.
      **Hecho**: el test de la fachada de composición lista la quinta operación y `typecheck` verde.

- [ ] **T6. Server Action `listResponsiblesForOrdersAction` + barrel del módulo.** (depende de T5)
      Al final de `order-assignment-actions.ts`, argumentos tipados; bloque nuevo al final de
      `index.ts` del módulo.
      **Hecho**: `tests/unit/asignaciones/module-contract.test.ts` sigue verde (el contrato no
      arrastra servidor) y un unit test comprueba la traducción de error **por `code`**.

## Tanda B — piezas de pantalla sin dependencias entre sí (T7 → T10, `[P]`)

- [ ] **T7. `[P]` `responsible-avatars.tsx`.**
      Tres iniciales + `+N`, ancho constante, `button` de 44x44 con `aria-label`, tooltip con los
      nombres que faltan, marcador de ausencia cuando no hay nadie.
      **Hecho**: unit tests de R17, R18, R19, R21 y del `aria-label`.

- [ ] **T8. `[P]` `order-responsibles.tsx` — modo LECTURA.**
      Todos los responsables, agrupados por origen, con el nombre de grupo congelado. Sin límite.
      **Hecho**: unit tests de R25 y R12 (renombrar el grupo después no cambia lo que se pinta:
      el nombre llega en el dato).

- [ ] **T9. `[P]` `order-responsibles.tsx` — modo ESCRITURA.** (mismo archivo que T8; si T8 y T9 las
      toman dos personas, T9 espera)
      Buscador de personas, selector de grupos, quitar persona, quitar grupo; toast con `added`,
      `router.refresh()`, error por `code` dentro del panel.
      **Hecho**: unit tests de R30, R31, R32, R33, R34 con las acciones mockeadas, comprobando que
      quitar un grupo emite **una** llamada y no N.

- [ ] **T10. `[P]` Esqueleto y barrel.**
      `ORDER_SKELETON_COLUMN_COUNT` +1 y exports nuevos en `components/index.ts`.
      **Hecho**: test de R22 (esqueleto y tabla declaran el mismo número de columnas) y de R36 (la
      página no importa por ruta profunda).

## Tanda C — enganches en la pantalla (T11 → T14, en orden)

- [ ] **T11. `order-list-section.tsx` compone el lote.** (depende de T6)
      Segunda llamada con los ids de la página, reparto por fila, degradación si falla.
      **Hecho**: tests de R16 y R20; y un test que cuenta llamadas y comprueba **una sola** por
      render, no una por fila.

- [ ] **T12. Columna nueva en `order-columns.tsx`.** (depende de T7, T11)
      `sortable: false`, sin `filter`, `pinnable` por defecto.
      **Hecho**: test de R16 sobre la declaración de columnas, y el de QC-35 que cuenta columnas
      actualizado **solo en su número**, no en su guion.

- [ ] **T13. Cuarto botón de fila «Responsables».** (depende de T12)
      `onResponsibles?` en `order-row-actions.tsx`; **no** se deshabilita en estado final.
      **Hecho**: tests de R24 y del caso `ENTREGADO` (el botón sigue activo, los de editar/cancelar/
      eliminar siguen deshabilitados y `FINAL_ORDER_REASON` sigue visible).

- [ ] **T14. El panel abre en la sección de responsables.** (depende de T8, T9, T13)
      `OrderSheet`/`OrderRowSheetActions` aceptan en qué sección abrir; la sección se monta dentro
      del panel existente.
      **Hecho**: tests de R23 (no hay panel nuevo ni ruta nueva), R26 (abrir **no** dispara ninguna
      consulta: contador de llamadas a cero) y R29.

## Tanda D — permisos, E2E y cierre (T15 → T18)

- [ ] **T15. `puedeEscribir` por props desde el servidor.** (depende de T14)
      El Server Component lee la sesión y baja el booleano; el cliente no lee cookies.
      **Hecho**: test de R28 en los dos sentidos — sin el permiso no se monta ningún control de
      escritura, **y** la Server Action rechaza igual (el test de autorización de QC-87 se invoca,
      no se reescribe).

- [ ] **T16. E2E del recorrido completo.** (depende de T15)
      `e2e/pedidos-responsables.spec.ts`: abrir un pedido, marcar una persona, aplicar un grupo,
      sacar a alguien, cerrar y comprobar **en el listado** los avatares y el nombre del grupo.
      **Hecho**: R37 verde y `e2e/pedidos.spec.ts` pasando **sin cambios en su guion** (R38).

- [ ] **T17. Guardias de los límites.** (`[P]` con T16)
      Tests de R5 (ninguna `@relation` nueva ni `include` entre pedidos y asignaciones), R14 (nadie
      de `pedidos` importa `asignaciones`), R15 (`git diff db/**` vacío y el catálogo con quince
      permisos), R39 (`package.json` sin dependencias nuevas), R40/R41 (los cuatro casos de uso y la
      pantalla de QC-35 intactos), y H4 (el tope del dominio coincide con `MAX_PAGE_SIZE`).
      **Hecho**: las guardias mueren al mutar el archivo real, no solo pasan en verde.

- [ ] **T18. Cierre.** (depende de todas)
      `./init.sh` completo, mapa `R<n> -> test` en `progress/impl_QC-102-...md`, revisión.
      **Hecho**: gate verde contra `tests/baseline-rojos.json` y los 41 requisitos mapeados.

## Mapa `R<n> -> test` previsto

| R | Test previsto | Task |
| --- | --- | --- |
| R1 | `unit/asignaciones/list-responsibles-for-orders.test.ts` — una entrada por id pedido | T4 |
| R2 | idem — sin `pedidos.consultar` lanza `unauthorized` sin tocar puertos | T4 |
| R3 | `integration/asignaciones/batch-company-scope.int.test.ts` | T2 |
| R4 | `unit/.../list-responsibles-for-orders.test.ts` — **cuenta invocaciones** (2, con 20 pedidos) | T4 |
| R5 | `guards/guard-lote-sin-join.test.ts` + unit del adaptador | T2, T17 |
| R6 | unit — el lote ordena igual que el singular (mismo comparador) | T3, T4 |
| R7 | unit — id inexistente / de otra empresa → entrada vacía, sin error | T4 |
| R8 | unit — lista vacía → `[]` con puertos a cero invocaciones | T4 |
| R9 | unit — uuid inválido y 26 ids → `invalid_input`; repetidos se consultan una vez | T4 |
| R10 | `integration/.../batch-states.int.test.ts` — cuatro estados, mismo resultado | T2 |
| R11 | unit — tres claves exactas; persona de baja sigue saliendo | T4 |
| R12 | unit del caso de uso + `unit/pedidos-ui/order-responsibles.test.tsx` | T4, T8 |
| R13 | `unit/asignaciones/order-assignment-actions.test.ts` — argumentos tipados, error por `code` | T6 |
| R14 | `guards/guard-arquitectura-modulos.test.ts` (ya existe) + caso nuevo de ciclo | T17 |
| R15 | `guard` de diff de `db/**` + test del catálogo de quince permisos (ya existe) | T17 |
| R16 | `unit/pedidos-ui/order-columns.test.tsx` + `order-list-section.test.tsx` | T11, T12 |
| R17 | `unit/pedidos-ui/responsible-avatars.test.tsx` — 5 responsables → 3 + `+2` con nombres | T7 |
| R18 | idem — ancho idéntico con 1 y con 9 responsables | T7 |
| R19 | idem — sin responsables, marcador de ausencia y ningún uuid | T7 |
| R20 | `unit/pedidos-ui/order-list-section.test.tsx` — lote en error, lista intacta | T11 |
| R21 | `unit/pedidos-ui/responsible-avatars.test.tsx` — iniciales, nombre accesible, sin `img` | T7 |
| R22 | `unit/pedidos-ui/order-list-skeleton.test.tsx` — mismo número de columnas | T10 |
| R23 | `unit/pedidos-ui/order-sheet-responsibles.test.tsx` — una sola instancia de panel | T14 |
| R24 | `unit/pedidos-ui/order-row-actions.test.tsx` — entrada «Responsables» abre el panel | T13 |
| R25 | `unit/pedidos-ui/order-responsibles.test.tsx` — 12 responsables, todos, agrupados | T8 |
| R26 | idem — abrir el panel deja el contador de la acción a cero | T14 |
| R27 | `unit/pedidos-ui/order-responsibles.test.tsx` — catálogos por props; sin `lib/composition` | T9 |
| R28 | `unit/.../read-only.test.tsx` + test de autorización del service de QC-87 | T15 |
| R29 | `unit/pedidos-ui/order-responsibles.test.tsx` — `ENTREGADO`/`CANCELADO`: sin controles, sin frase | T14 |
| R30 | `unit/.../remove-work-group.test.tsx` — **una** llamada con el `workGroupId` | T9 |
| R31 | `unit/.../unassign.test.tsx` — una persona exacta | T9 |
| R32 | `unit/.../assign.test.tsx` — un `FormData`, campos en inglés, personas + grupos | T9 |
| R33 | idem — toast con `added` y `router.refresh()`; ningún `revalidatePath` | T9 |
| R34 | idem — error por `code`, panel abierto, selección conservada | T9 |
| R35 | `unit/.../a11y-tactil.test.tsx` — 44x44, 16 px, `+N` también abre el panel | T7, T9 |
| R36 | `unit/pedidos-ui/order-route-contract.test.ts` — barrel, sin rutas profundas | T10 |
| R37 | `e2e/pedidos-responsables.spec.ts` | T16 |
| R38 | `e2e/pedidos.spec.ts` sin cambios de guion | T16 |
| R39 | `guards/guard-dependencias-aprobadas.test.ts` (ya existe) | T17 |
| R40 | `guard` — la pantalla no reimplementa reglas de QC-87; imports por ruta exacta | T17 |
| R41 | `guard` — `data-table`, orden/filtro y `order-sheet` sin reescritura | T17 |
