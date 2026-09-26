# QC-155 — pantalla-de-clientes · review

> Reviewer, 2026-09-25. Rama `feature/QC-155-pantalla-de-clientes` (HEAD `3eee8f98`), contra
> `specs/QC-155-pantalla-de-clientes/` (R1–R42), `docs/` y `CHECKPOINTS.md`.
> No se corrieron ni la suite completa ni el E2E, por orden del leader: el puerto 3117 lo comparten
> los worktrees y el gate completo lo corre el leader después.

## Veredicto: **RECHAZADO**

Dos bloqueantes y siete menores. Los dos bloqueantes se arreglan sin tocar el diseño: uno es limpiar
comentarios y el otro es cambiar el orden de un despacho y añadir su test.

---

## Verificación ejecutada por el reviewer

| Qué | Resultado |
| --- | --- |
| `pnpm exec vitest run tests/unit/clientes-ui tests/unit/clientes/scope.test.ts` + los 10 tests ajenos tocados o relacionados (app-sidebar, recipe-route-contract, private-layout-menu, data-table-alcance, guard-identificador-de-request, guard-nav-permisos-declarados, guard-pantallas-exigen-permiso, guard-rutas-privadas-cubiertas, guard-e2e-landing, guard-nav-serializable) | **27 archivos, 384 passed, 2 skipped**. Los 2 skipped son los casos de rama de QC-56 en `data-table-alcance.test.ts`, que se saltan por diseño fuera de su rama. Los casos de R35 de `clientes-convenciones` **sí** corrieron y no se saltaron |
| `./init.sh --rapido` | **Verde**: typecheck OK, lint 0 errores (7 warnings de siempre, ajenos), `vitest related` 256 archivos / 3656 passed / 41 skipped, las guardias 51 archivos / 646 passed, `down.sql` OK |
| `./init.sh` completo | **No corrido** (lo corre el leader) |
| E2E `e2e/clientes.spec.ts` | **No corrido**. Leí la fuente y la bitácora dice que pasó dos veces, 4/4 en Chromium y WebKit |

## Checklist

### 1. Trazabilidad R1–R42
- [x] El mapa `R<n> → test` está en la bitácora, repartido por tanda, y no le falta ningún R.
- [x] Leí los tests de R3, R4, R5, R6, R7, R12, R15, R18, R20, R22, R24–R33, R41 y R42. Afirman comportamiento y no están vacíos: el corte se ejecuta de verdad con `assertPermission` y solo se dobla la sesión, y las acciones de escritura son dobles que fallan si alguien las llama.
- [ ] **R20, segunda cláusula, con búsqueda o filtro activos: no se cumple y ningún test la cubre** → BLOQUEANTE B2.
- [~] R26 «solo con espacios»: el código lo cumple, porque el esquema hace `trim().min(1)`, pero ningún test lo ejerce → menor m3.
- [~] R6, parte de pantalla con los conjuntos del seed: está cubierta por composición, no con los conjuntos mismos → menor m4.

### 2. Tasks
- [x] T0–T8 están marcadas `[x]`.
- [ ] T9 (gate completo + cierre) está sin marcar. Es lo esperado: el gate lo corre el leader. No es un hallazgo del implementer, pero la feature no puede pasar a `done` hasta que T9 quede en `[x]`.

### 3. CHECKPOINTS.md
- [x] **Especificación**: están los tres archivos, requirements en EARS numerado y design con alternativas descartadas (A–H).
- [x] **Trazabilidad**: el mapa está en la bitácora.
- [x] **Calidad**: typecheck y lint verdes. `pnpm test` completo queda pendiente para el gate del leader.
- [x] **E2E**: la feature toca permisos y hay E2E. Usa `loginAndLand`, corre en Chromium y WebKit, sin red externa (solo Postgres local), con fixtures `qc155_e2e_` y limpieza por empresa. El Operador no ve el menú y recibe 404 dentro del layout, sin título, tabla, vacío ni disparador.
- [x] **Multiplataforma**: sin `100vh`, sin `hover:`, controles `min-h-11 min-w-11`, campos `text-base`, `pb-[env(safe-area-inset-bottom)]` en el panel. Lo cubre `clientes-viewport.test.tsx` a 375 px y a 1280 px.
- [x] **Dependencias**: `package.json` no se toca y `Contact` sale de `lucide-react`, que ya estaba instalado.
- [x] **Datos y seguridad**: no hay tablas, migraciones ni RLS nuevas (design §9, NO APLICA). La autorización real queda en los casos de uso de QC-154. No hay secretos, `process.env`, `fetch` propio ni `console.*`.
- [x] **Módulos**: no se toca `lib/modules/**`, `lib/composition/**`, `db/**`, `components/shared/**`, `components/ui/**` ni `package.json` (comprobado sobre `git diff --stat dev...HEAD`). `lib/shared/**` sigue siendo hoja: solo añade una constante, un ítem y un icono.
- [x] **Permisos**: la página corta en el servidor con `requirePagePermission('clientes.consultar')` en su primera sentencia. `canModify` sale de `assertPermission` y baja por props. Las mutaciones van por Server Actions, importadas por su ruta exacta.
- [ ] **Verificación final**: `./init.sh` completo, `history.md` y el desmontaje del worktree están pendientes (leader). Esta review no es OK.

### 4. Verificación ejecutable
- [x] `--rapido` en verde y los tests puntuales en verde (ver arriba).

### 5. Calidad y seguridad
- [x] No hay webhooks, ni tablas nuevas, ni contexto ni secretos escritos a mano.
- [x] Capas separadas. La página resuelve la sesión y la sección llama a `listCustomersAction` una sola vez. Los componentes de cliente no importan `lib/composition` ni Prisma (lo vigila `clientes-convenciones`).

### 6. Multiplataforma
- [x] Sin excepción de escritorio, y ninguna hace falta.

### 7. Dependencias
- [x] Ninguna añadida.

### 8. Aislamiento por empresa
- [x] No aplica: no hay modelo nuevo ni consulta nueva, porque la pantalla consume las acciones de QC-154, que ya filtran por la empresa del actor. El E2E comprueba además que `companyId` sale del actor.

### 9. Comentarios
- [ ] **51 líneas añadidas en producción citan `R<n>`, `QC-<n>` o `design.md`** → BLOQUEANTE B1.

### Puntos pedidos por el leader
- [x] **La página corta por `clientes.consultar` y oculta las acciones sin `clientes.modificar`.** Un solo `requirePagePermission`, anterior a `await searchParams`. Sin `modificar` no se emiten ni el disparador, ni las acciones de fila, ni el panel, ni el diálogo: `CustomerRowActions` devuelve `null`, `toolbarActions` es `undefined` y el vacío no monta `children`. Lo prueban `clientes-page`, `customer-table`, `customer-list-section` y `customer-list-empty`.
- [x] **Consume `lib/modules/clientes` sin rehacer su lógica.** Usa las acciones por ruta exacta y el esquema, `CUSTOMER_QUERYABLE` y las constantes de largo por el barrel. No hay normalización en el cliente, y ordenables y filtros se derivan de la lista blanca.
- [x] **Estados vacío, sin coincidencias, cargando y error**, cada uno con su `data-testid` y distintos entre sí. Queda la excepción de B2.
- [x] **La búsqueda `?q=` y la caja sincronizada con Atrás.** Es copia fiel de `order-table.tsx` (`boxEpoch`, `pendingSearches`, `lastSearch`, `clearing`) y la deuda está nombrada en design §5.3, §12 riesgo 3 y la alternativa F. Hay tests del eco propio (no remonta, conserva el foco), del cambio externo (remonta con el término nuevo) y de Limpiar seguido de un cambio externo.
- [x] **Formulario.** Tres obligatorios con `required`/`aria-required`, `maxLength` desde las constantes del contrato, validación previa con `createCustomerSchema`, correo y teléfono `type="text"` sin `pattern`, precarga desde la fila y reemplazo completo con `bind`.
- [x] **El menú** está en «Cadena», último del array, con icono `contact` y `clientes.consultar`. Ningún rol del seed cambia de aterrizaje (hay test comparando con y sin el ítem). El permiso del ítem se lee de la fuente de `page.tsx`.
- [x] **Las altas en listas cerradas tensan y no relajan.** `data-table-alcance` pasa de 8 a 9 pantallas (ancla `>8`) y de 22 a 23 E2E con la lista exacta. `E2E_ESPERADOS` añade el archivo por nombre. `private-layout-menu` amplía el ancla exacta con casos Admin sí y Operador no. `scope.test.ts` sustituye R26, R28 y R38 por versiones acotadas a archivos o carpeta exactos, con casos de sensibilidad nuevos (el literal en `components/` dispara, y también un `e2e/otro-clientes.spec.ts`).
- [x] **Los dos tests ajenos no relajan nada.** `app-sidebar.test.tsx` sube el ancla de longitud de 9 a 10 con la lista exacta ordenada y añade `nav-clientes` al orden de sección. `recipe-route-contract.test.ts` añade `CUSTOMERS_ROUTE` a un censo cerrado y exacto de exports. Los dos siguen siendo listas exactas.
- [x] **Ningún test escribe dentro de `lib/` o `app/`.** Todo fabricado va a `mkdtempSync(join(tmpdir(), …))` y se borra en `finally`.
- [ ] **Hay citas de fichas en comentarios de producción** → B1.
- [x] **El reintento es un `<Link>` y no `router.refresh()`: se acepta, no es hallazgo.** Es lo que pide design §5.1, que está aprobado. Así que no es una desviación del spec, solo del patrón mayoritario del repo, y la bitácora lo llama «desviación de design.md», que no es exacto. Funciona: la página es dinámica (lee la sesión) y en Next 16.3 `staleTimes.dynamic` vale `0` por defecto (`node_modules/next/dist/server/config-shared.js`), así que navegar a la misma URL vuelve a pedir el RSC y reejecuta `CustomerListSection`. Además no obliga a `CustomerListError` a ser componente de cliente. Solo cambia una cosa: puede apilar una entrada de historial con la misma URL. Es un matiz de UX, no un requisito. El test solo afirma el `href`, no que el reintento reejecute el Server Component, y por eso lo anoto como parte de m1.

---

## Hallazgos

### B1 — BLOQUEANTE — Citas de fichas y requisitos en comentarios de producción (`docs/conventions.md > Comentarios`)

51 líneas **añadidas por esta rama** en 12 archivos de producción citan `R<n>`, `QC-<n>` o
`design.md`. La regla no tiene excepciones y el reviewer la trata como bloqueante mientras no exista
la guardia QC-115. Todos los archivos de la ruta son nuevos, así que cada línea es del diff:

| Archivo | Líneas |
| --- | --- |
| `app/(private)/clientes/page.tsx` | 28, 33 (`QC-74 R12`), 48, 58, 60, 62, 63, 66, 71 |
| `app/(private)/clientes/components/customer-table.tsx` | 19, 21 (`QC-55`), 23, 33, 35, 36, 39, 65, 83, 118 |
| `app/(private)/clientes/components/customer-list-section.tsx` | 16, 17, 21, 23, 28, 32, 39, 54, 71 |
| `app/(private)/clientes/components/customer-list-empty.tsx` | 13, 14, 20, 24, 29, 35 |
| `app/(private)/clientes/components/customer-list-error.tsx` | 19, 24, 27, 31 |
| `app/(private)/clientes/components/customer-list-skeleton.tsx` | 5, 10 |
| `app/(private)/clientes/components/customer-list-params.ts` | 82, 143 |
| `app/(private)/clientes/components/customer-labels.ts` | 4, 18 (también `(T6)`, que es otra cita de proceso) |
| `app/(private)/clientes/components/customer-columns.tsx` | 11 |
| `lib/shared/routes.ts` | 225, 276 |
| `lib/shared/navigation/private-nav.ts` | 110, 181, 402 |
| `lib/shared/navigation/nav-icons.ts` | 49 |

Cómo reproducirlo: `grep -nE 'QC-[0-9]+|\bR[0-9]+\b|design\.md' "app/(private)/clientes/page.tsx" "app/(private)/clientes/components/"*`.
`customer-form.tsx`, `customer-sheet.tsx`, `customer-row-actions.tsx` y `delete-customer-dialog.tsx`
están limpios y sirven de modelo.

**Qué falta.** Quitar las citas y dejar solo el porqué. De paso, recortar los bloques de más de ~5
líneas (`page.tsx` 48–72, `customer-list-section.tsx` 15–30, `customer-table.tsx` 18–40,
`private-nav.ts` 402–410): lo que explican ya está en `design.md`. Va en su propio commit
`chore(QC-155): limpia comentarios de …`, solo comentarios y sin cambiar código. Los comentarios
**preexistentes** de esos archivos (por ejemplo `QC-67 R2` en `nav-icons.ts`) no entran.

### B2 — BLOQUEANTE — R20: con búsqueda o filtro activos, una página mayor que el total se presenta como «sin coincidencias» y no ofrece volver a la primera página

`customer-list-section.tsx` despacha así: (1) error, (2) cero filas **sin** término ni filtro →
`CustomerListEmpty` (y solo ahí `firstPageHref` si `page > 1`), (3) cero filas **con** término o
filtro → tabla con `noMatches`. Con `?q=ana&page=3` y dos páginas de coincidencias, la pantalla
dice que no hay coincidencias cuando sí las hay, y la única salida es «Limpiar la búsqueda», que
**borra el término** y los filtros. Pasa de verdad en uso normal: se busca, se va a la última
página, se da de baja su único cliente, `router.refresh()` y la página queda vacía.

- **R20**: «SI la página pedida es mayor que el total, ENTONCES DEBE ofrecer volver a la primera
  página». No condiciona a que no haya término.
- **design.md §5.1** trata «0 filas, `page > totalPages`» como un caso propio, antes de «0 filas
  con término o filtro».
- **Test**: `customer-list-section.test.tsx > 'la pagina que se quedo atras vuelve a la primera (R20)'`
  solo prueba sin término, así que el test no verifica la cláusula entera que dice cubrir
  (`docs/verification.md > Regla del reviewer`).

**Qué falta.** Que el caso `page > totalPages` (o `page > FIRST_PAGE` con cero filas) gane al de
«sin coincidencias» cuando hay término o filtro. Tiene que ofrecer ir a la primera página
**conservando** término, filtros, tamaño y orden (`customerListHref({ ...params, page: FIRST_PAGE })`),
sin afirmar que no hay coincidencias y con la caja montada si se pinta dentro de la tabla. Y un
test con `search` activo y `page > totalPages` que afirme ese enlace y la ausencia de
`customer-list-no-matches`.

### m1 — menor — El reintento del error solo se prueba por su `href`
Se acepta el diseño (ver arriba). Aun así, ningún test demuestra que pulsarlo vuelva a ejecutar la
sección, y el comentario lo afirma. En el sistema actual es cierto (`staleTimes.dynamic: 0`), pero
depende de configuración: si alguien sube `staleTimes.dynamic` en `next.config`, el reintento se
queda muerto en silencio. Sugerencia opcional: una línea en design §5.1 que nombre esa dependencia.

### m2 — menor — Dos guardias tocadas que design §10 declaraba «No se tocan», sin anotarlo en la bitácora
En `b153b968` se tocaron `tests/guards/guard-nav-permisos-declarados.test.ts` (ancla de 9 a 10
enlaces, lista exacta) y `tests/guards/guard-pantallas-exigen-permiso.test.ts` (de 14 a 15 rutas,
lista exacta). Los dos cambios **tensan** (siguen siendo listas exactas) y eran inevitables. Pero la
bitácora de T1 solo declara como colaterales `app-sidebar` y `recipe-route-contract`, y design §10
dice que esas dos guardias no se tocan. Hay que añadirlo a la bitácora.

### m3 — menor — R26 «solo con espacios» sin test
El caso vacío está probado (lo bloquea la validación nativa) y el de largo+1 también. Un obligatorio
con solo espacios pasa el `required` nativo y lo rechaza `createCustomerSchema` (`trim().min(1)`),
así que el código cumple, pero ningún test lo ejerce. Falta un caso que escriba `'   '` en un
obligatorio y afirme `customer-error-<campo>` y que no se llamó a la acción.

### m4 — menor — R6 a nivel de pantalla, por composición y no con los conjuntos del seed
El menú se prueba con los tres conjuntos de `SEED_ROLE_PERMISSIONS`, y la página con conjuntos
fabricados a partir de `PERMISSIONS`. El 404 del Empacador y «las tres escrituras con el conjunto
del Administrador» solo se deducen combinando tests, y el del Operador lo da el E2E. Design §10.1
prometía en `clientes-page.test.tsx` «ninguna escritura con los permisos del Operador». Falta un
`it.each` sobre los tres roles del seed en `clientes-page.test.tsx`.

### m5 — menor — Citas de fichas en comentarios de tests
`docs/conventions.md` aplica a `tests/` y `e2e/` la misma regla para comentarios (el `R<n>` solo
vale en el nombre del caso). Los tests nuevos abren con cabeceras `// QC-155 T6 — …` y citan
`QC-74`, `QC-71`, `QC-154 R41` y `design.md > 11` en comentarios, por ejemplo en `clientes-page.test.tsx`
y en la cabecera de `e2e/clientes.spec.ts`. No bloquea porque el punto 9 se ciñe a producción, pero
conviene limpiarlo en el mismo commit de B1.

### m6 — menor — Comentario obsoleto en `tests/unit/clientes/scope.test.ts`
En el caso R28 dice «El spec propio todavia no existe», y ya existe (`e2e/clientes.spec.ts`).

### m7 — menor — Etiqueta equivocada en la bitácora sobre el reintento
T4 lo llama «desviación deliberada de `design.md > 5.1`», pero el enlace es justo lo que pide
§5.1. La desviación es respecto de unidades, pedidos y grupos, no del spec.

---

## Qué hace falta para OK

1. **B1**: un commit `chore(QC-155): limpia comentarios de …`, solo comentarios, que deje los 12
   archivos sin `R<n>`, `QC-<n>`, `design.md` ni `T<n>` en las líneas de la rama.
2. **B2**: cambiar el despacho de `customer-list-section.tsx` para que `page > totalPages` ofrezca
   ir a la primera página conservando término y filtros, más su test con búsqueda activa.
3. Opcional, en la misma vuelta: m3 y m4 (dos tests), m2, m6 y m7 (bitácora y un comentario de test), y m5.
4. Luego el leader corre `./init.sh` completo (T9) y vuelve a pedir review.

---

# Vuelta 2 (2026-09-25, HEAD `08391504`)

## Veredicto vuelta 2: **RECHAZADO**

Hay un bloqueante nuevo (B3), que entró con el cierre de m1, y quedan cuatro menores abiertos.
B1 y B2 están cerrados.

## Verificación ejecutada

| Qué | Resultado |
| --- | --- |
| `vitest run tests/unit/clientes-ui` | 16 archivos, 234 passed |
| `scope`, `data-table-alcance`, `app-sidebar`, `recipe-route-contract`, `private-layout-menu` + **todas** las guardias (`guard`) | 56 archivos, 739 passed, 13 skipped (casos de rama ajenos) |
| `pnpm run typecheck` / `pnpm run lint` | verde / 0 errores (los 7 warnings ajenos de siempre) |
| Mutación de B2: restauré temporalmente `customer-list-section.tsx` de `b3fd3601^` y corrí su test, luego `git checkout` (worktree limpio) | **Los 2 casos nuevos se ponen en rojo** y los 13 restantes quedan verdes: el test muerde |
| Suite completa, `./init.sh` completo, E2E | No se corrieron (los corre el leader) |

## Cierre de hallazgos de la vuelta 1

- **B1 — CERRADO.** Barrido repetido sobre las líneas que añade `origin/dev...HEAD` en `app/`, `lib/` y `components/`: **0** coincidencias de `QC-<n>`, `R<n>`, `design.md`, «decisión cerrada» o `T<n>`. Comprobé que `5c548fe9` solo toca comentarios: todas las líneas `+`/`-` del commit son de comentario. Los bloques largos (el «de paso») siguen algo por encima de 5 líneas en `page.tsx` y `customer-table.tsx`. No lo reabro: era opcional.
- **B2 — CERRADO.**
  - `outOfRange` (cero filas y `page > 1`) se despacha **antes** que el caso «sin coincidencias» cuando hay término o filtro. Ofrece `customerListHref({ ...params, page: FIRST_PAGE })`, que conserva término, filtros, tamaño y orden, y lo hace dentro de la tabla con la caja montada.
  - El caso sin término no cambia. La rama sigue siendo `CustomerListEmpty`, con `firstPageHref` si `page > 1`, igual que antes (la condición es equivalente). Su test previo sigue verde.
  - «Sin coincidencias» dentro de rango (página 1) no cambia.
  - Los dos tests nuevos muerden (mutación arriba).
- **Reutilizar el testid es correcto.** Lo que se reutiliza es `CUSTOMER_LIST_FIRST_PAGE_TESTID` (`customer-list-first-page`), el del **enlace**, importado como constante y no copiado como literal. El testid del contenedor `customer-list-empty` no se reutiliza. Es el mismo control con la misma función, «volver a la primera página», en dos estados que se excluyen entre sí. El contenedor los distingue: `customer-list-empty` en uno y `customer-table` en el otro, y el test nuevo localiza el enlace `within(tabla)`. Un testid distinto obligaría a que E2E y tests conocieran dos nombres para la misma acción, sin ganar nada. El mensaje «Esta página ya no tiene clientes.» repite el copy del vacío, que es coherente, y ningún test lo afirma.
- **m1 — ABIERTO, y de su cierre sale B3.** `084adb78` añade dos casos que siguen siendo de `href`: localizar el enlace por rol y comprobar que el destino llega intacto. Ninguno demuestra que el reintento reejecute la sección, ni se añadió a design §5.1 la dependencia de `staleTimes.dynamic`. Sigue siendo menor.
- **m2 — CERRADO.** La bitácora anota las dos guardias tensadas en `b153b968`.
- **m3 — CERRADO.** Hay un caso con `'   '` en un obligatorio. Afirma que `checkValidity()` es `true`, que aparece `customer-error-first-names` y que no se llama a la acción.
- **m4 — PARCIAL, sigue menor.** El `it.each` sobre los tres roles del seed **deduce** qué esperar leyendo el propio seed (`puedeConsultar = permissions.includes(...)`), así que no fija R6 por sí solo. Si el seed diera `clientes.consultar` al Operador, el caso seguiría verde. Hoy lo fija la combinación con el ancla de `private-nav-clientes.test.ts` («solo el Administrador tiene el permiso»). Además, la rama de escritura solo afirma las acciones de fila y no `customer-create-open`. Falta fijar lo esperado por rol: Administrador sirve y ofrece las tres escrituras; Operador y Empacador reciben 404.
- **m5 — CERRADO.** Las líneas de comentario que añaden `tests/` y `e2e/` tienen 0 citas de `QC-<n>`, `R<n>` o `design.md`.
- **m6 — CERRADO.** El comentario obsoleto de `scope.test.ts` ya no está.
- **m7 — CERRADO.** La bitácora corrige la etiqueta del reintento.

## Hallazgos nuevos

### B3 — BLOQUEANTE — El test nuevo de m1 afirma sobre copy, contra R40

`tests/unit/clientes-ui/customer-list-error.test.tsx:76`:

```ts
const enlace = screen.getByRole('link', { name: 'Reintentar' });
```

R40 dice: «Los tests de la pantalla DEBEN localizar controles […] por rol ARIA, `data-testid` o
constantes exportadas, y NO DEBEN afirmar sobre literales de copy». El nombre accesible
`'Reintentar'` es copy escrito como literal. Si alguien cambia el texto del botón, el test se rompe
sin que haya cambiado ningún comportamiento, que es justo lo que R40 prohíbe. Además, la guardia de
R40 (`clientes-convenciones.test.ts > afirmaSobreCopy`) solo busca `getByText`, `queryByText` y
`findByText` con un literal, **no** `{ name: '…' }`. Por eso el test que dice cubrir R40 no lo
detectó.

**Qué falta.** Quitar el literal. Vale localizar por `getByRole('link')` dentro del contenedor
`customer-list-error`, o exportar el rótulo como constante y usarla. Con eso se cierra B3.

### n1 — menor — La guardia de R40 no ve los nombres accesibles literales
Hay que ampliar `afirmaSobreCopy` para que detecte `ByRole(…, { name: '…' })` (y `ByLabelText('…')`
si aparece), con su caso de sensibilidad fabricado. No bloquea una vez retirado el único caso real
(B3), pero sin esto la regresión volverá a pasar en verde.

### n2 — menor — El test de B2 con término no comprueba tamaño ni orden
Pide conservar término, filtros, tamaño y orden. El caso con término afirma `page` y `q`, y el de
filtro afirma `page` y `city`. Ninguno afirma `pageSize` ni `sort`. Hoy se cumple por construcción
(`{ ...params, page }`), pero el test no lo fija.

## Estado abierto

- **Bloqueantes abiertos: 1** (B3).
- **Menores abiertos: 4** (m1, m4 parcial, n1 y n2).

Para OK basta con B3, que es una línea en un test. Luego el leader corre `./init.sh` completo (T9).
