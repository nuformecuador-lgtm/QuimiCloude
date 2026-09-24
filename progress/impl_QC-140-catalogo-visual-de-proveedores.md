# QC-140 — catalogo-visual-de-proveedores · bitácora de implementación (F2.1)

> Implementer, 2026-09-23. Rama `feature/QC-140-catalogo-visual-de-proveedores`, worktree
> `.worktrees/QC-140-catalogo-visual-de-proveedores`. Sin push ni PR. No me autoapruebo: decide
> el reviewer.

## Base de datos

- **Base propia: `QuimiCloude_QC140`**, creada con
  `CREATE DATABASE "QuimiCloude_QC140" TEMPLATE "qct_tpl_664cc76c19c8"`. La plantilla la dio
  `pnpm run db:test template` (reutilizada, 45 migraciones). Esta ficha no añade migraciones.
- Solo el `.env` del worktree (ignorado por git, `.gitignore:38`) apunta a ella, en `DATABASE_URL`
  y `DIRECT_URL`. La base compartida `QuimiCloude` y el árbol principal no se tocaron.
- `prisma migrate status` → `Datasource "db": PostgreSQL database "QuimiCloude_QC140"`,
  `45 migrations found`, `Database schema is up to date!`. Se comprobó antes de la integración y
  antes de cada corrida E2E.
- La integración corre, como siempre, sobre una base efímera copiada de la plantilla en el mismo
  servidor. La última corrida fue `qct_qc140_15a5fe0f_muer8q5y_pw4`, borrada al terminar.
- **Al cerrar la ficha**, `QuimiCloude_QC140` sobra y se puede borrar (`pnpm run db:test clean`).

## Tasks

- **Cerradas `[x]`: T0-T13.**
  - **T13 se cierra con una salvedad, por decisión del humano del 2026-09-23.** El caso R51 de
    `e2e/proveedores.spec.ts` queda como **rojo heredado de `dev`**: espera `12.3456` y la pantalla
    pinta `12.35` desde `682d3e3b fix(decimales)`. La aserción **no** se cambia en esta rama. El
    resto de los dos specs pasa.
- **Abiertas `[ ]`:**
  - **T14**: la revisión emulada está hecha y el hallazgo A arreglado en la rama (ver *Hallazgos*).
    **Sigue pendiente la revisión en dispositivos reales**, Safari iOS y Chrome Android, que hace
    el humano.
  - **T15**: el mapa está abajo; `./init.sh` completo lo corre el leader.

## Commits (sobre el merge-base con `origin/dev`, sin los del spec)

- `6cdb5491` feat: instala react-intersection-observer 11.0.1 (T0)
- `b3f56d93` feat: tipos, constantes y esquemas de la vista (T1). Arrastra además los renames de T7 (ver *Hallazgos*, punto 3)
- `3a1acca3` feat: puerto listShowcaseAlive (T2)
- `e75798ac` feat: promueve el panel de proveedor a components/shared/supplier (T7)
- `4008f9fb` feat: casos de uso listSupplierShowcase y listShowcaseLines (T3)
- `79a5097b` feat: adaptador listShowcaseAliveSuppliers y cableado (T4)
- `bc5a26ee` feat: Server Actions (T6)
- `3e0bde34` feat: edita y da de baja proveedor desde la cabecera del detalle (T8)
- `e40feac9` test: ajusta el censo de métodos del puerto y limpia comentarios
- `2eee3c19` test: integración contra Postgres real (T5)
- `19dd3644` chore: marca T0-T8
- `8074036b` test: admite el panel compartido en el centinela de alcance (enmienda de `scope.test.ts`)
- `75b80ae9` feat: parámetros y filtros (T9)
- `d0d7f6db` feat: tarjeta, fila y disparador (T10)
- `4c7e17a3` chore: marca T9 y T10
- `22f54d21` feat: lista con carga perezosa, sección, esqueleto y página (T11)
- `11feaca9` test: guardia de convenciones del catálogo visual (T12)
- `d2c68cdd` chore: marca T11 y T12
- `232304df` test: los tests del catálogo importan por el barrel de la ruta
- `c99d8e0d` test: sube a 37 el conteo esperado de dependencies
- `78044fd5` test: adapta los E2E de proveedores al catálogo visual (T13; retira el caso de orden descendente)
- `c0ea39a5` fix: trata el rechazo de la Server Action de carga incremental como fallo (R35)
- `d0c76395` chore: limpia citas en comentarios

## Archivos

**Producción, nuevos:**
- `lib/modules/proveedores/domain/{supplier-showcase,list-supplier-showcase,list-showcase-lines}.ts`
- `app/(private)/proveedores/components/{showcase-line-card,showcase-load-trigger,supplier-showcase-row,supplier-showcase-list,supplier-showcase-section,supplier-showcase-skeleton,supplier-showcase-filters}.tsx`
- `app/(private)/proveedores/components/supplier-showcase-params.ts`
- `components/shared/supplier/index.ts`

**Producción, movidos:**
- `supplier-{sheet,form,field}.tsx` → `components/shared/supplier/`: renombrados al 100 %, sin
  cambios.
- `delete-supplier-dialog.tsx` → `app/(private)/proveedores/[id]/components/`. Al moverlo, la baja
  pasa a hacer `router.replace(SUPPLIERS_ROUTE)`.

**Producción, modificados:**
- `lib/modules/proveedores/{index.ts,ports/supplier-repository.ts,adapters/driven/persistence/supplier-prisma.ts,adapters/driving/supplier-actions.ts}`
- `lib/composition/index.ts`
- `app/(private)/proveedores/page.tsx`
- `app/(private)/proveedores/components/index.ts`
- `app/(private)/proveedores/[id]/components/{index.ts,supplier-detail-header.tsx}`
- `package.json`, `pnpm-lock.yaml`
- `docs/dependencias.md`: a la fila ya aprobada se le añadió lo confirmado al instalar, sin
  duplicarla.

**Producción, borrados:** `supplier-{table,columns,table-skeleton,list-section}.tsx`,
`supplier-columns-skeleton.ts` y `supplier-list-params.ts`.

**Tests nuevos:**
- `tests/unit/proveedores/{supplier-showcase-schema,showcase-service,showcase-prisma}.test.ts`
- `tests/integration/proveedores/supplier-showcase.int.test.ts`
- `tests/unit/proveedores-ui/{showcase-line-card,showcase-load-trigger,supplier-showcase-row,supplier-showcase-list,supplier-showcase-page,supplier-showcase-filters}.test.tsx`
- `supplier-showcase-params.test.ts` y `guard-convenciones-showcase.test.ts`

**Tests borrados:** `supplier-page.test.tsx` y `supplier-list-params.test.ts`.

**Tests modificados:**
- `tests/guards/guard-ambito-empresa-proveedores.test.ts` (5 → 6 métodos).
- `tests/unit/proveedores/{authorization,supplier-service,list-use-cases,module-contract,supplier-actions}.test.ts`
- `tests/unit/proveedores-ui/{supplier-detail-page,catalog-line-sheet,delete-catalog-line-dialog}.test.tsx`
- `tests/unit/proveedores-ui/supplier-route-contract.test.ts`
- `tests/unit/documentos-ui/supplier-detail-upload.test.tsx`
- `tests/integration/aislamiento.json` (entrada en `commit`, con motivo y fecha).
- `e2e/proveedores.spec.ts` y `e2e/aislamiento-proveedores.spec.ts`.

**Enmiendas a tests de otras fichas, cada una con su motivo y fecha escritos en el propio test.
Ninguna va al baseline:**
- `tests/unit/proveedores/scope.test.ts`: admite solo `components/shared/supplier/` como excepción
  nombrada.
- `tests/guards/guard-identificador-de-request.test.ts`: `DEPENDENCIAS_ESPERADAS` pasa de 36 a 37
  por la librería aprobada.
- `tests/unit/shared/migracion-listas-alcance.test.ts`: sale la fila de proveedores, cuyos tests se
  borran con la lista paginada, y `e2e/proveedores.spec.ts` deja de figurar entre los E2E con
  búsqueda.
- `tests/unit/shared/data-table-alcance.test.ts`: la lista cerrada de E2E pasa de 18 a 17, porque
  `aislamiento-proveedores` ya no monta la tabla compartida.

## Mapa R<n> -> test (R1-R41)

Rutas cortas: `pui/` = `tests/unit/proveedores-ui/`, `pu/` = `tests/unit/proveedores/`,
`int` = `tests/integration/proveedores/supplier-showcase.int.test.ts`.

| R | Test |
|---|---|
| R1 | `pui/guard-convenciones-showcase.test.ts` «R1: la URL de proveedores no aparece como literal…»; `pui/supplier-showcase-page.test.tsx` «R1: se renderiza dentro del armazon privado, con una unica region principal» |
| R2 | `pui/supplier-showcase-page.test.tsx` «R2: no monta ninguna tabla ni paginacion…»; `pui/supplier-route-contract.test.ts` caso «R30 (…)», reescrito |
| R3 | `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx` (sin tocar, verde); E2E `proveedores.spec.ts`, caso 404 sin permiso (verde en los dos motores) |
| R4 | `pu/showcase-service.test.ts` «R4 — sin permiso o sin actor, los dos casos de uso rechazan antes de tocar el puerto»; `pu/authorization.test.ts` (once casos de uso) |
| R5 | `pui/supplier-showcase-page.test.tsx` «R5: una fila por proveedor, con su nombre y su carrusel» |
| R6 | `pui/supplier-showcase-row.test.tsx` «SupplierShowcaseRow — nombre del proveedor (R6)» |
| R7 | `pui/showcase-line-card.test.tsx` «R7 — pinta la imagen…»; `pui/supplier-showcase-row.test.tsx` «carrusel (R7, R40)» |
| R8 | `pui/showcase-line-card.test.tsx` «R8 — …»; `pui/supplier-showcase-row.test.tsx` «sin autores (R8)»; `pu/showcase-service.test.ts` «R8 — la proyeccion de linea no lleva createdBy ni updatedBy» |
| R9 | `pui/showcase-line-card.test.tsx`, tres casos R9: `null`, cadena vacía y `error`, todos con `data-missing`, vía `@/components/shared/entity-image` y a 60 px |
| R10 | `pui/showcase-line-card.test.tsx` «R10 — una línea sin imagen se lista igual…» |
| R11 | `pui/supplier-showcase-page.test.tsx` «tanda inicial (R11)»; `pu/showcase-prisma.test.ts` «orden, paginacion y el truco del +1… (R11)» |
| R12 | `pui/showcase-load-trigger.test.tsx` «R12, R18 — llama a onVisible…»; `pui/supplier-showcase-list.test.tsx` «acumulacion (R12, R17)»; `pui/supplier-showcase-page.test.tsx` «R12: al llegar al centinela…» |
| R13 | `pui/supplier-showcase-list.test.tsx` «se detiene (R13)»; `pui/supplier-showcase-page.test.tsx` «R13: …» |
| R14 | `pui/supplier-showcase-list.test.tsx` «un solo vuelo a la vez (R14)»; `pui/showcase-load-trigger.test.tsx` «R14 — deshabilitado…»; `pui/supplier-showcase-page.test.tsx` «R14: …» |
| R15 | `pui/supplier-showcase-row.test.tsx`: los dos casos R15 (añade sin afectar a otra fila; `aria-busy` y sin doble vuelo) |
| R16 | `pui/supplier-showcase-row.test.tsx` «R16 — si la fila ya muestra todas sus líneas, no ofrece «cargar más»» |
| R17 | `int` «proveedores ordenados alfabeticamente, sin huecos ni repetidos… (R17, R31)» y ««cargar mas» encadenado… (R17, R31)»; `pui/supplier-showcase-list.test.tsx` «descarta un id repetido»; `pui/supplier-showcase-page.test.tsx` «R17: una tanda que repite un id…»; `pu/showcase-prisma.test.ts` (R17) |
| R18 | `pui/guard-convenciones-showcase.test.ts` «R18: react-intersection-observer solo la importa showcase-load-trigger.tsx», más los casos de `new IntersectionObserver` y de escucha de `scroll`; `pui/showcase-load-trigger.test.tsx` |
| R19, R20, R21 | `int` «filtro de producto: solo los proveedores con una linea viva que coincide, y solo esas lineas (R19, R20, R21)» |
| R22, R23 | `int` «filtro de proveedor y de los dos filtros a la vez (R22, R23)» |
| R24 | `int` «un filtro de solo espacios cuenta como ausente (R24)»; `pu/supplier-showcase-schema.test.ts` (tres casos R24); `pui/supplier-showcase-params.test.ts` (cinco casos R24); `pui/supplier-showcase-filters.test.tsx` «limpiar vacia los dos filtros (R24)» |
| R25 | `pui/supplier-showcase-filters.test.tsx` «cambiar un filtro navega a la URL sin pagina (R25)»; `pui/supplier-showcase-params.test.ts` (dos casos R25) |
| R26 | `pui/supplier-showcase-page.test.tsx` «R26: con un filtro activo y cero coincidencias…» |
| R27 | `int` «el borrado logico se excluye en las dos capas (R27)» |
| R28 | `int` «el aislamiento por empresa: cargar mas sobre un proveedor ajeno responde igual que inexistente (R28)»; `pu/showcase-service.test.ts` «R28 — …» |
| R29 | `pui/guard-convenciones-showcase.test.ts` «R29: el diff de la rama contra origin/dev no añade ningun archivo bajo db/». Sin índice nuevo: el EXPLAIN del `some`, con 100 proveedores y 5000 líneas, dio `Nested Loop Semi Join` con `Index Scan` y `Bitmap Heap Scan` sobre `supplier_catalog_lines_company_id_supplier_id_idx`, sin `Seq Scan` |
| R30 | `int` «un proveedor vivo sin lineas aparece con el carrusel vacio y cuenta en su tanda (R30)»; `pui/supplier-showcase-row.test.tsx` «sin líneas (R30)» |
| R31 | `int`: los dos casos (R17, R31); `pu/showcase-prisma.test.ts` |
| R32 | `pui/supplier-showcase-page.test.tsx` «R32: mientras se resuelve la tanda inicial, pinta el esqueleto…» y «R32: los filtros viven fuera del Suspense…» |
| R33 | `pui/supplier-showcase-page.test.tsx` «R33: sin proveedores y sin filtro, muestra el vacio con el boton de alta» |
| R34 | `pui/supplier-showcase-page.test.tsx` «R34: si falla la tanda inicial…»; `pu/supplier-actions.test.ts`, bloque «las dos Server Actions de la vista…» (fallo ajeno → `unexpected` sin detalle) |
| R35 | En la lista: `pui/supplier-showcase-list.test.tsx` «fallo y Reintentar (R35)» y dos casos «R35: … cuando la accion rechaza (fallo de red)». En la fila: `pui/supplier-showcase-row.test.tsx`, cuatro casos R35, dos de ellos por fallo de red. Además `pui/supplier-showcase-page.test.tsx` «fallo de una tanda incremental (R35)» y `pu/supplier-actions.test.ts` |
| R36 | `pui/supplier-showcase-page.test.tsx` «alta reinicia la lista (R36)» |
| R37 | `pui/supplier-showcase-page.test.tsx` «sin edicion ni baja en la fila (R37)» |
| R38 | `pui/supplier-detail-page.test.tsx`, bloque «pagina de detalle — editar y dar de baja en la cabecera (R38)», con cuatro casos. E2E `aislamiento-proveedores.spec.ts`: la baja desde la cabecera del detalle, en verde |
| R39 | `pui/supplier-showcase-filters.test.tsx` «los dos campos y sus clases (R39)»; `pui/supplier-showcase-row.test.tsx` «R39 — la lista del carrusel usa scroll horizontal con snap y es enfocable por teclado»; `pui/supplier-showcase-page.test.tsx` «multiplataforma (R39)». Revisión emulada de T14 más abajo |
| R40 | `pui/supplier-showcase-row.test.tsx` «R40 — el carrusel expone un nombre accesible…» y los bloques «cargar más (R15, R16, R40)» y «fallo de «cargar más» (R35, R40)» |
| R41 | `e2e/aislamiento-proveedores.spec.ts` (verde, 2/2) y `e2e/proveedores.spec.ts` (404 en verde; R51 en rojo por la causa ajena de abajo). No se añadió ningún E2E |

## Salida de los tests (real, recortada)

- `pnpm run typecheck`: verde. En un worktree nuevo, antes hace falta `pnpm exec next typegen`,
  porque sin `.next/types` falta `LayoutProps`; `init.sh` ya lo corre.
- `pnpm run lint`: verde.
- `pnpm exec vitest related --run <archivos de app/, lib/ y components/ del diff>`:
  ```
   Test Files  182 passed (182)
        Tests  2653 passed | 1 skipped (2654)
  ```
- `pnpm exec vitest run tests/unit/proveedores-ui tests/unit/proveedores tests/guards tests/unit/shared`:
  `Test Files 1 failed | 102 passed (103)`, `Tests 1 failed | 1264 passed | 11 skipped (1276)`.
  El único rojo es `tests/guards/guard-arquitectura-modulos.test.ts`, que ya está en
  `tests/baseline-rojos.json` y viene de `lib/modules/inventario/adapters/driving/product-actions.ts`.
  No es de esta rama.
- `pnpm exec vitest run tests/guards` más las dos guardias de convenciones de proveedores:
  `Tests 1 failed | 552 passed | 8 skipped (561)`. El rojo es el mismo del baseline.
- Integración:
  ```
  test-db: la corrida de integracion va contra qct_qc140_15a5fe0f_muer8q5y_pw4 (copia de qct_tpl_664cc76c19c8).
   Test Files  1 passed (1)
        Tests  10 passed (10)
  test-db: borrada la base de la corrida: qct_qc140_15a5fe0f_muer8q5y_pw4.
  ```
- Anti-placebo:
  - T12: las seis violaciones se probaron una a una y cada una puso la guardia en rojo. El caso de
    `db/` al principio salía verde y se corrigió para que mire también `git status`.
  - R35 por fallo de red: sin el arreglo, los cuatro casos nuevos fallan con
    `Unhandled Rejection: TypeError: Failed to fetch`.
- No corrí `pnpm test`, la suite completa ni `./init.sh`.

## E2E (contra `QuimiCloude_QC140`, puerto 3117, `--workers=1`, Chromium y WebKit, un spec cada vez)

Salida completa en el scratchpad de la sesión (`e2e-salida.txt` y `e2e-salida-2.txt`). La corrida
final es la que va tras el arreglo de R35 y la limpieza de comentarios:

- `e2e/proveedores.spec.ts`: `2 failed`, `2 passed (3.4m)`.
  - El 404 sin permiso pasa en los dos motores.
  - **R51 falla en los dos**: `Expected: "12.3456"` / `Received: "12.35"` en el coste de la línea
    de catálogo. La causa es `682d3e3b fix(decimales): la pantalla redondea a dos…`, que ya está en
    `origin/dev`. Esta rama no toca esa aserción ni `catalog-columns.tsx`.
  - La parte que adapta T13 pasa en los dos motores antes de llegar a esa aserción: alta, fila en la
    vista, filtro de proveedor, enlace al detalle y alta de la línea.
  - `progress/current.md` ya da R51 como rojo también en `dev`, por la unidad de la presentación.
    Así que este caso no está verde en `dev` por ninguna de las dos causas.
- `e2e/aislamiento-proveedores.spec.ts`: `2 passed (1.2m)`.
- Se retiró el caso de orden descendente, porque la vista no ordena por columnas. El commit
  `78044fd5` lo dice.
- Al terminar, el 3117 no tiene nada en `LISTENING` y no quedan filas de los fixtures.

## T14 — revisión multiplataforma (solo emulada, sin dispositivos reales)

Playwright contra `QuimiCloude_QC140`. Ningún perfil es un dispositivo físico.

| Punto | Chromium escritorio | WebKit, `iPhone 15` emulado | Chromium, `Pixel 7` emulado |
|---|---|---|---|
| Carrusel horizontal | rueda: `scrollLeft` 0→86; teclado: ver nota | teclado: 184→683; táctil sin automatización en WebKit, se comprobó que `touch-action` es `auto` | toque real vía CDP: OK |
| Scroll vertical con el carrusel anidado | `scrollY` 0→400 | 118→518 | OK |
| Carga perezosa | filas 5→7 | 5→7 | OK |
| «Cargar más» | líneas 10→20 | 10→20 | OK |
| «Reintentar» | fallaba ante un fallo de red; **arreglado en `c0ea39a5`** | igual | igual |
| Filtros | 14 px por `md:text-sm` del `Input` compartido (≥768 px, solo escritorio); controles de 44 px de alto | **16 px**; 248×44, 248×44 y 112×44 | no se llegó: se bloqueó antes, en el paso de editar |
| Editar y dar de baja desde el detalle | OK | OK | fallaba (hallazgo A); **arreglado en `b68d8570` y `ce1c8527`**: el clic `trial` en «Guardar» pasa en el alta y en la edición |

**Nota sobre el teclado en Chromium.** La primera pasada dijo que el teclado no desplazaba el
carrusel. El diagnóstico posterior demostró que era un artefacto de la medición: con 10 tarjetas el
carrusel apenas desborda (unos 14-20 px), y la primera flecha ya lo lleva al final. Con 44 tarjetas,
cada flecha avanza exactamente 92 px en Chromium y en WebKit (0→1840 tras 20 flechas). No se cambió
código.

**Pendiente:** la revisión en Safari iOS y Chrome Android reales. Ningún agente puede hacerla.

## Hallazgos y desviaciones para el leader y el reviewer

1. **Hallazgo A (2026-09-23/24): «Guardar» tapado en Android. Era de la rama y está arreglado.**
   - **Síntoma.** En Chromium con `Pixel 7` emulado, el clic en «Guardar» (`supplier-form-submit`)
     no llegaba: `div …overflow-y-auto p-4 intercepts pointer events`.
   - **Comparación con `dev`.**
     - `supplier-sheet.tsx`, `supplier-form.tsx` y `supplier-field.tsx` son idénticos byte a byte
       entre `origin/dev` y la rama. Se comprobó con `git show origin/dev:<ruta> | diff -q`.
     - `git diff origin/dev HEAD` no da nada sobre `components/ui/` (incluido `sheet.tsx`),
       `app/globals.css` ni los layouts.
     - En un worktree temporal `--detach` de `origin/dev` (`f1530835`), con el `.env` apuntado a
       `QuimiCloude_QC140` y la misma emulación, el alta desde la lista **es alcanzable**:
       - el clic `trial` pasa;
       - el botón está en `y=779`, con 44 px de alto, dentro de un viewport de 839;
       - `elementFromPoint` devuelve el propio botón.
     - El worktree temporal se desmontó después.
   - **Causa, en la rama.** Un nombre de proveedor largo y sin espacios desbordaba en horizontal, en
     dos sitios:
     - el `<h1>` de `app/(private)/proveedores/[id]/components/supplier-detail-header.tsx`, al que
       le faltaba `min-w-0`/`break-words`;
     - el texto del `Link` en `app/(private)/proveedores/components/supplier-showcase-row.tsx`, que
       era un item flex anónimo y no encogía.

     Al desbordar el documento (`scrollWidth` de 722 frente a `clientWidth` de 412), Chromium móvil
     infla `window.innerWidth/innerHeight` (hasta 722x1471). El `Sheet` fijo con `h-full` se
     dimensiona sobre ese alto y deja el pie con «Guardar» fuera de la pantalla.
   - **Arreglos**, con su test y su anti-placebo:
     - `b68d8570`: la cabecera del detalle, con un caso R38 en `supplier-detail-page.test.tsx`;
     - `ce1c8527`: la fila del catálogo, con un caso R39 en `supplier-showcase-row.test.tsx`.

     No se tocaron `components/ui/` ni `components/shared/supplier/`.
   - **Medido después, en Pixel 7**, tanto en `/proveedores` como en el detalle: `scrollWidth` =
     `clientWidth` = `innerWidth` = 412, `innerHeight` 839, y el clic `trial` de «Guardar» pasa en
     el alta y en la edición.
   - Los E2E `proveedores.spec.ts` y `aislamiento-proveedores.spec.ts` se volvieron a correr tras
     `b68d8570`, en Chromium y WebKit: el único rojo sigue siendo R51 (heredado). Tras `ce1c8527`,
     que solo cambia las clases y envuelve el nombre en un `span` sin tocar los `data-testid`, se
     corrió `vitest related` (108 passed) y la corrida de Pixel 7.
2. **R51 de `e2e/proveedores.spec.ts`: rojo heredado de `dev`.** Lo decidió el humano el
   2026-09-23. La causa es `682d3e3b` (la pantalla redondea a dos decimales), y la aserción no se
   toca en esta rama.
3. **Historia: el commit de T1 (`b3f56d93`) incluye los tres renames de T7.** Un `git commit` sin
   pathspec del carril backend se llevó lo que el carril frontend tenía en el índice. El contenido es
   correcto: son renames puros y `e75798ac` completa T7. Intenté separarlo con un rebase y el sistema
   de permisos lo denegó; la historia queda tal cual.
   - **Lección para las fichas paralelas:** el cerrojo no basta. Cada commit tiene que llevar
     pathspec (`git commit -F <msg> -- <rutas>`) y los `git mv`/`git rm` tienen que ir dentro del
     cerrojo.
4. **Nombres de los parámetros de URL**: `supplier` y `product`. El spec no los fijaba; los eligió
   `frontend_dev`.
5. **`tests/unit/identity/session-once-per-request-actions.test.ts` no se tocó.** Su censo es por
   archivo, y `supplier-actions.ts` ya estaba en él.
6. **Los componentes de cliente que llaman a las dos acciones nuevas usan `try/catch`** para
   convertir un rechazo de transporte en el aviso con «Reintentar».
7. **Comentarios**: `d0c76395` quitó las citas. Sobre el diff de `app lib components hooks
   middleware.ts db tests e2e`, el grep de citas en comentarios da vacío.
