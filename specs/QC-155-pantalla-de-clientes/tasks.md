# QC-155 — pantalla-de-clientes · tasks.md

> Orden y dependencias según `design.md`. `[P]` = paralelizable con las demás `[P]` de la misma tanda
> (archivos disjuntos). Cada task cierra con `./init.sh --rapido` en verde, y la feature con `./init.sh`
> completo. El mapa `R<n> → test` se lleva en `progress/impl_QC-155-pantalla-de-clientes.md`.
>
> **Límite de toda la ficha (R35):** si una task pide abrir `lib/modules/**`, `lib/composition/**`,
> `db/**` o `components/shared/**`, **se para y se avisa al leader**. Ninguna migración esperada.

---

## Tanda 0 — Base

- [ ] **T0 — Verificar la base heredada y preparar la base propia.**
  Comprobar en el worktree lo que `design.md > 0` da por hecho: las cinco acciones y sus tipos en
  `customer-actions.ts`, `CUSTOMER_QUERYABLE` y `createCustomerSchema` en el barrel, las primitivas
  `sheet`/`alert-dialog`/`sonner` en `components/ui/`, y `loginAndLand` en `e2e/helpers/landing.ts`.
  Crear `QuimiCloude_QC155` y aplicar `db:migrate` + `db:seed` con `DATABASE_URL`/`DIRECT_URL`
  sobrescritas en el entorno del comando.
  **Hecho:** bitácora con la evidencia de cada punto y la salida de migrate/seed. Cualquier
  discrepancia se reporta al leader antes de seguir.

## Tanda 1 — Ruta, menú y alcance (va antes que cualquier archivo en `app/`)

- [ ] **T1 — Constante, prefijo, ítem de menú, icono y alcance de `scope.test.ts`.** Depende de T0.
  `CUSTOMERS_ROUTE` + fila en `PRIVATE_ROUTE_PREFIXES` (`lib/shared/routes.ts`); `CUSTOMERS_LABEL`,
  `'contact'` en `NavIconName` y el ítem **al final** de `PRIVATE_NAV_ITEMS` en «Cadena» con
  `clientes.consultar` (`private-nav.ts`); fila `contact: Contact` (`nav-icons.ts`). Sustituir por su
  versión acotada los casos R26, R28 y R38 de `tests/unit/clientes/scope.test.ts` (`design.md > 10`),
  con sus casos de sensibilidad. Tensar `private-layout-menu.test.tsx` (ancla exacta con
  `nav-clientes` último; Admin sí y Operador no). Nuevo `tests/unit/clientes-ui/private-nav-clientes.test.ts`
  (salvo el caso que lee `page.tsx`, que se activa en T6).
  Como la página aún no existe, **en esta misma task** se crea `app/(private)/clientes/page.tsx`
  mínima, con solo `requirePagePermission('clientes.consultar')` y el título, para que
  `guard-rutas-privadas-cubiertas` y `guard-pantallas-exigen-permiso` sigan verdes.
  **Hecho:** R1, R2, R4 y R6 (parte menú) en verde. `firstVisibleNavHref` no cambia para los tres roles
  del seed. `guard-rutas-privadas-cubiertas`, `guard-pantallas-exigen-permiso` y
  `guard-nav-permisos-declarados` en verde. `customers-route-contract.test.ts` creado y en verde.

## Tanda 2 — Piezas puras y estados (paralelas entre sí)

- [ ] **T2 [P] — `customer-list-params.ts`.** Depende de T1.
  Parser/serializador (`design.md > 4`), `customerListHref`, `hasActiveSearchOrFilter`,
  `clearSearchAndFilters` y `withSearchResetsPage` (término **o** filtros reinician la página).
  **Hecho:** `customer-list-params.test.ts` cubre R13 (reinicio), R14, R16 y R17, y `parse(build(p)) = p`.
  Sin React ni `next/*`.

- [ ] **T3 [P] — `customer-labels.ts` y `customer-columns.tsx`.** Depende de T1.
  Columnas de `design.md > 5.4`, con `sortable`/`filter` derivados de `CUSTOMER_QUERYABLE`, fecha en
  UTC y marcador de ausencia.
  **Hecho:** `customer-columns.test.tsx` cubre R10, R11 y R14 (ordenables = lista blanca, filtros =
  lista blanca, ninguna columna prohibida).

- [ ] **T4 [P] — Estados: `customer-list-skeleton.tsx`, `customer-list-empty.tsx`, `customer-list-error.tsx`.**
  Depende de T1. `data-testid` propios y distintos. El vacío recibe `canModify` y solo entonces monta el
  disparador. El error lleva mensaje, código y reintento con `customerListHref`.
  **Hecho:** tests unitarios de los tres, incluido que el vacío **no** tiene disparador con
  `canModify=false` (R19, R21, R22).

## Tanda 3 — Formulario y baja (paralelas entre sí)

- [ ] **T5 [P] — `customer-form.tsx` y `customer-sheet.tsx`.** Depende de T3.
  `design.md > 6`: seis campos, validación previa con `createCustomerSchema`, `maxLength` desde las
  constantes, correo y teléfono `type="text"` sin `pattern`, precarga desde la fila, `bind` del `id` en
  la edición, errores por `code`, éxito con toast + `router.refresh()`.
  **Hecho:** `customer-form.test.tsx` y `customer-sheet.test.tsx` cubren R24–R30. El caso del máximo
  exacto se acepta y el de máximo+1 no llama a la acción. Un solo `Toaster`.

- [ ] **T6a [P] — `delete-customer-dialog.tsx` y `customer-row-actions.tsx`.** Depende de T3.
  `design.md > 7`.
  **Hecho:** `delete-customer-dialog.test.tsx` cubre R31–R33 (nombra al cliente, no invoca sin
  confirmar, error dentro y abierto, sin restaurar).

## Tanda 4 — La lista montada

- [ ] **T6 — `customer-table.tsx`, `customer-list-section.tsx`, barrel y `page.tsx` completa.** Depende
  de T2, T3, T4, T5 y T6a.
  Tabla compartida con transición sin desmontar y la sincronización de la caja copiada de
  `order-table.tsx` (`design.md > 5.2`, `5.3`). Sección con el despacho de `design.md > 5.1`. Página con
  el corte, `canModifyCustomers()` y `<Suspense>` **sin** `key`. Barrel `components/index.ts`.
  **En la misma task:** dar de alta la pantalla en la lista cerrada de consumidores de
  `tests/unit/shared/data-table-alcance.test.ts`, y activar en `private-nav-clientes.test.ts` el caso
  que lee el permiso de `page.tsx`.
  **Hecho:** `customer-table.test.tsx` (R9, R12, R13, R18, R21, R23; el eco de la propia caja no
  remonta y el cambio externo sí), `customer-list-section.test.tsx` (R7, R19, R20, R22) y
  `clientes-page.test.tsx` (R3, R5, R6, R8) en verde. `data-table-alcance` en verde.

## Tanda 5 — Convenciones

- [ ] **T7 [P] — Guardias de fuente de la ruta.** Depende de T6.
  `clientes-convenciones.test.ts` (R34–R40), `data-table-intacta-clientes.test.ts` (R9) y
  `clientes-viewport.test.tsx` (R39), cada una con su caso de sensibilidad sobre un fabricado en un
  tmpdir.
  **Hecho:** los tres en verde. Cada regla dispara con su fabricado.

## Tanda 6 — E2E

- [ ] **T8 — `e2e/clientes.spec.ts`.** Depende de T6 (y de T0 para la base).
  Los dos recorridos de `design.md > 11`, con fixtures `qc155_e2e_` y `loginAndLand`. **En la misma
  task:** `'clientes.spec.ts'` en `E2E_ESPERADOS` y `e2e/clientes.spec.ts` en la lista de E2E de
  `data-table-alcance.test.ts`. Comprobar que el caso R28 acotado de `scope.test.ts` (T1) lo admite.
  **Hecho:** `pnpm exec playwright test e2e/clientes.spec.ts` en verde en Chromium y WebKit contra
  `QuimiCloude_QC155`, con la salida en la bitácora (R41, R42). `guard-e2e-landing` e
  `guard-identificador-de-request` en verde. Tras la corrida no queda ninguna fila `qc155_e2e_`.

## Cierre

- [ ] **T9 — Gate completo y trazabilidad.** Depende de todas.
  `./init.sh` completo en verde. El mapa `R1…R42 → test` en `progress/impl_QC-155-pantalla-de-clientes.md`,
  sin ningún requisito sin test. Comprobar que el diff no toca `lib/modules/**`, `lib/composition/**`,
  `db/**`, `components/shared/**`, `components/ui/**` ni `package.json` (R35).
  **Hecho:** gate verde, mapa completo y diff dentro de los archivos de `design.md > 1` y `> 10`.

---

### Grafo

```
T0 → T1 → { T2, T3, T4 } ;  T3 → { T5, T6a }
{ T2, T3, T4, T5, T6a } → T6 → { T7, T8 } → T9
```
