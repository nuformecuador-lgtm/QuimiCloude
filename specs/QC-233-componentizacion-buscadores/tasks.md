# QC-233 — componentizacion-buscadores · tasks

**Verificación de cada tanda.** Al cerrar cada tanda se corre `pnpm run typecheck`,
`pnpm run lint`, `pnpm exec vitest related --run <archivos>` y `pnpm exec vitest run guard`.
**Nunca `pnpm test`.**

**Commits.** Uno por task, y uno por buscador en la tanda 2.

**Comentarios.** No se cita `QC-<n>` ni `R<n>` en producción. Al tocar una línea se limpian sus
comentarios (`docs/conventions.md > Comentarios`). Si la limpieza abulta, va en un commit
`chore(QC-233): limpia comentarios de <archivo>` aparte.

**Archivos que no se tocan** (R21): los de QC-223, `order-customer-picker.tsx`, los barrels de ruta,
`app/(public)/**` y los tests y guardias de R4. Si una task parece necesitar uno, se para y se
pregunta al leader.

## Antes de empezar (leader)

- [ ] **TA. Comprobar el choque con QC-223** (P1).
  - **Qué se hace:** correr `node scripts/archivos-en-vuelo.mjs` y
    `git diff --name-only origin/dev...origin/feature/QC-223-entregar-producto-terminado`.
  - **Hecho cuando:** el resultado queda anotado en `progress/features/QC-233.md`, y P1 y P2 tienen
    respuesta del humano. Si hay choque, se aplica lo que decida antes de la tanda 1.

## Tanda 0 — Congelar el «antes» (bloquea todo lo demás; depende de TA)

- [ ] **T0. Paridad de los buscadores** (R1, R2, R8, D6; `design.md > 8.1`).
  - **Qué se escribe:** `tests/unit/paridad/buscadores-paridad.test.tsx`, con un `describe` por
    buscador.
    - **Cubre** cada estado del desplegable que le aplica (`requirements.md > Glosario`).
    - **Abre** el desplegable con `userEvent`.
    - **Serializa** `document.body` con `arbolAccesible()`.
    - **Guarda por estado** las llamadas a la Server Action simulada: cuántas y con qué argumentos.
  - **Hecho cuando:**
    - los snapshots se generan contra el código **sin tocar** y se commitean solos, en
      `test(QC-233): congela la paridad de los buscadores`;
    - la suite pasa en verde;
    - no ha cambiado ni un archivo de producción.
- [ ] **T0b [P]. Capturas «antes»** (R3; `design.md > 8.4`). **La hace el leader**, como la T16 de
  QC-231.
  - **Cómo:** desde `dev` y con el seed demo de QC-230.
  - **Dónde:** `_trabajo/marca/capturas-antes-buscadores/`, sin versionar.
  - **Qué estados:** cada buscador cerrado con elección, abierto con filas, vacío y, donde aplique,
    con la opción no elegible. En claro, oscuro y móvil.
  - **Hecho cuando:** hay una captura por buscador y estado, y un índice de nombres en
    `progress/features/QC-233.md`.

## Tanda 1 — `AsyncAutocomplete` ampliado (depende de T0)

- [ ] **T1. Contrato ampliado** (R8-R17, R19; `design.md > 3`).
  - **Qué se toca:** `components/shared/async-autocomplete.tsx`. El `layout="split"` pinta exactamente
    el bloque común de los cinco buscadores.
  - **Test:** `tests/unit/shared-ui/async-autocomplete-ampliado.test.tsx`, con un caso por R de R8 a
    R17. Entre ellos:
    - `initialPage` no llama a `fetchPage` y la búsqueda sí;
    - `excludedKeys` respeta `keepKey`;
    - `resetKey` vuelve a pedir la página 1, y sin él no se reinicia;
    - las tres formas de `renderLoadError`;
    - la opción no elegible no se elige ni cierra;
    - el orden `onSelect` → `onValueChange`;
    - `queryEnabled={false}` no consulta.
  - **Hecho cuando:**
    - ese test está en verde;
    - `tests/unit/async-autocomplete.test.tsx` y los tests de `OrderCustomerPicker` pasan **sin
      tocarlos**;
    - la paridad de `OrderCustomerPicker` de T0 pasa sin regenerar.

## Tanda 2 — Los cinco buscadores delegan (depende de T1; cada uno [P] respecto de los demás)

**Qué se hace en cada uno** (`design.md > 4`):
- se sustituyen el `<Autocomplete …>`, el hook, el `handleScroll`, el `cargando` y el `mensajeDeFallo`
  por `<AsyncAutocomplete layout="split" …/>`;
- se conservan en el archivo la consulta, la regla de elección, las piezas de campo, los exports y
  las props (R5, R18).

**Hecho cuando, en cada uno:**
- su paridad de T0 pasa **sin regenerar** el snapshot;
- sus tests y los de sus pantallas están en verde sin editarlos;
- `vitest related` y `pnpm exec vitest run guard` están en verde, con
  `guard-identificador-de-request`, `guard-piezas-base`, `recipe-route-contract` y
  `inventario/module-contract` **sin tocar**.

- [ ] **T2a [P]. `ProductPicker`:** `initialPage`, `excludedKeys` + `keepKey` y «hay más».
- [ ] **T2b [P]. `RecipePicker`:** `initialPage` y borrar. **Además**, el test de `RecipePicker`
  sobre «escribir otra cosa retira» pasa sin editar (R14).
- [ ] **T2c [P]. `PackagingSelect`:** `queryEnabled`, `showEmpty`, `isOptionDisabled`,
  `renderLoadError` → `ErrorAlert`, `renderOption` y borrar. `unexpectedFromRejection` se queda.
- [ ] **T2d [P]. `ProductNamePicker`:** `resetKey={productType}`. El input espejo `sr-only` se queda.
- [ ] **T2e [P]. `PresentationSelect`:** `leadingOptions`, `isOptionDisabled` y `renderOption`. La
  resolución de `defaultLabel`, la ayuda y **todo** el alta en línea se quedan.

## Tanda 3 — Guardia y enmienda (depende de la tanda 2)

- [ ] **T3. `tests/guards/guard-buscadores.test.ts`** (R7, R19, R20, R21, R22; `design.md > 7`).
  - **Qué comprueba:**
    - las reglas `primitivo-fuera` y `hook-fuera`;
    - que no hay `.filter(` en `async-autocomplete.tsx`;
    - las tres excepciones con nombre, que no apuntan a archivos muertos;
    - por diff, y solo en esta rama (con `skip` ruidoso fuera), los archivos de R21 y R4 y
      `package.json`.
  - **Hecho cuando:** está en verde y tiene una muestra que muerde por regla.
- [ ] **T4 [P]. Enmienda de QC-35** (R23). **Solo si P3 es sí:** una línea fechada bajo §9.1 de
  `specs/QC-35-pantalla-de-pedidos/design.md`.
  - **Hecho cuando:** la línea existe y cita QC-233. Si P3 es no, la task se tacha con el motivo.

## Tanda 4 — Cierre (depende de todo lo anterior)

- [ ] **T5. `./init.sh` en verde**, y `progress/impl_QC-233-componentizacion-buscadores.md` con:
  - el mapa R → test (`design.md > 13`);
  - el resultado de TA;
  - los repuntes de import de R4, si hubo alguno.
- [ ] **T6. Capturas «después»** (R3). **La hace el leader**, en
  `_trabajo/marca/capturas-despues-buscadores/`, con los mismos buscadores, estados, modos y datos
  que T0b.
  - **Hecho cuando:** cada captura «antes» tiene su pareja, y la tabla de parejas queda lista para el
    reviewer.

## Archivos esperados

### Producción
- `components/shared/async-autocomplete.tsx`
- `hooks/use-async-paginated-options.ts` (solo si hace falta; su contrato público no cambia)
- `app/(private)/produccion/formulas/components/product-picker.tsx`
- `app/(private)/pedidos/components/recipe-picker.tsx`
- `app/(private)/pedidos/components/packaging-select.tsx`
- `app/(private)/inventario/components/product-name-picker.tsx`
- `components/shared/presentation-select.tsx`

### Tests nuevos
- `tests/unit/paridad/buscadores-paridad.test.tsx`
- `tests/unit/shared-ui/async-autocomplete-ampliado.test.tsx`
- `tests/guards/guard-buscadores.test.ts`

### Specs enmendados (solo si P3 es sí)
- `specs/QC-35-pantalla-de-pedidos/design.md`

Lo que esta rama **no** toca está en R21 de requirements.md y en el apartado 5 de design.md. No se
lista aquí para que archivos-en-vuelo no lo lea como ruta de esta feature.
