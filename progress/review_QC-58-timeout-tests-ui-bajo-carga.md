# Review — QC-58 timeout-tests-ui-bajo-carga

> Rama `feature/QC-58-timeout-tests-ui-bajo-carga`, HEAD `d1e966d`, árbol limpio al empezar y al
> terminar. Rango revisado `origin/dev...HEAD` (merge-base `d85b824`), 4 commits, 42 archivos.
> Revisado el 2026-09-08. **No se editó ningún archivo de código**: las mutaciones se hicieron sobre
> copias con `cp` y se restauraron; `git status --porcelain` vacío al cerrar.

## Veredicto

**RECHAZADO** — 1 hallazgo mayor (bloqueante), 7 menores.

El grueso de la ficha está bien hecho y verificado: el plazo rige y está vigilado, la migración es
mecánica y no toca lo que se prueba, la guardia muerde con mis propias mutaciones y el alcance se
respetó al milímetro. Lo que bloquea es un hueco literal de **R6** que la propia bitácora declara
como deuda pero que ninguna excepción aprobada cubre, y que la guardia de R7 no ve.

## Checklist

| Punto | Estado |
| --- | --- |
| `requirements.md`, `design.md` (con alternativas descartadas), `tasks.md` existen | OK |
| Las 17 tasks marcadas `[x]` | OK |
| Mapa `R<n>` a test en `progress/impl_...md` | OK (los 18) |
| Cada `R<n>` mapea a un test que **de verdad** lo verifica | PARCIAL: R6 sólo a medias (mayor 1) |
| `pnpm run typecheck` | OK exit 0 |
| `pnpm run lint` | OK exit 0 |
| `pnpm run test:guardias` | OK 21 archivos, 204 casos, exit 0 |
| Gate completo `./init.sh` | No repetido: el leader lo corrió 5 veces en verde (T11); verifiqué en su lugar typecheck, lint, guardias, mutaciones y los archivos afectados |
| E2E de flujo crítico | N/A — R18 lo descarta con motivo escrito y no cambia comportamiento de aplicación |
| Multiplataforma (UI) | N/A — cero archivos de UI tocados (R17 verificado) |
| Dependencias / `package.json` | N/A — `package.json` no aparece en el diff; `design.md > 7` lo declara |
| Aislamiento por empresa / `db/schema.prisma` / RLS / migraciones | N/A — no se toca `db/` ni ninguna consulta |
| Secretos hardcodeados | OK ninguno |
| Capas / módulos hexagonales | N/A — nada bajo `lib/`, `app/`, `components/` |

## Trazabilidad R1–R18 (verificada abriendo los archivos, no la bitácora)

| R | Verificación mía | Estado |
| --- | --- | --- |
| R1 | `vitest.config.mts`: `testTimeout: 15_000` dentro del bloque `test` de `ui` (l. 46), `node` (l. 62) e `integration` (l. 75). Ninguno en la raíz | OK |
| R2 | `tests/guards/guard-teclear-y-plazo.test.ts` lee la config **resuelta** (importa el módulo), no el texto. Vive en `tests/guards/`, luego entra siempre por `pnpm run test:guardias`. **Muerde**: mutaciones 1 a 3 de abajo | OK |
| R3 | Sondas de T8 con salida en la bitácora (7009/7018/7010 ms en verde con 15000; las tres con `Test timed out in 5000ms` al bajarlo). `find tests -name '_sonda*'` da 0 archivos: no quedó nada | OK |
| R4 | El diff de `vitest.config.mts` sólo añade 3 `testTimeout` y sus comentarios. `maxWorkers` no aparece; el `fileParallelism: false` de `integration` es preexistente y no se toca | OK |
| R5 | `tests/helpers/user-event.ts`: `setupUser(): UserEvent` sobre `userEvent.setup({ delay: null })`, sin parámetros, con el comentario mudado de `recipe-form.test.tsx` (qué quita `delay: null`, que la secuencia de eventos es idéntica, que no se relaja `pointer-events`) | OK |
| R6 | Cero `userEvent.setup(` fuera del helper y de la excepción (guardia y `grep`). **Pero** dos archivos siguen tecleando con la API directa de `userEvent` sin sesión compartida: ver mayor 1 | PARCIAL |
| R7 | Mutaciones 4 y 5 de abajo: la guardia falla nombrando el archivo y diciendo qué importar | OK |
| R8 | `async-autocomplete.test.tsx` conserva `userEvent.setup({ delay: 20 })` con 14 líneas de comentario nuevo que lo declaran excepción y remiten a la guardia; está en `EXCEPCIONES_DECLARADAS` y el caso «el recorrido de tests/ no se ha quedado vacio» comprueba que las tres excepciones existen | OK |
| R9 | **Recontado por mí** contra el merge-base, los 33 archivos: mismo número de declaraciones `it`/`test` en todos, cero `it.skip`/`it.todo`/`only` en el árbol nuevo, y **cero líneas con `expect(` eliminadas** en todo el diff de `tests/`. Los 21 sitios de `esperarInteractiva` son envoltorios del elemento que se pincha: se añaden, no sustituyen | OK |
| R10 | `tests/baseline-rojos.json`: las tres entradas de esta causa retiradas | OK |
| R11 | Quedan las dos estructurales con `motivo` y `desde`; el `desde` de `recipe-route-contract` intacto (2026-09-04) y su `motivo` reescrito | OK (con la salvedad del menor 3) |
| R12 | Las dos entradas tienen `motivo` y `desde`; `scripts/comparar-baseline-rojos.mjs` no se tocó (no aparece en el diff), luego la comparación sigue siendo por archivo | OK |
| R13 | Las cinco corridas las corrió el leader (bitácora, tabla con horas y exit 0). Verifiqué el **razonamiento** del aviso «2 por limpiar»: corrí los dos archivos del baseline en esta rama y pasan (2 archivos, 29 casos). En rama el aviso es inevitable y borrarlos dejaría `dev` en rojo. La reformulación no relaja la parte sustantiva | OK |
| R14 | La bitácora da comando, fecha, horas, exit y conteos de las cinco; la salida literal del comparador aparece en la corrida 1 y «ídem» en las otras cuatro | OK (menor 6) |
| R15 | No apareció la colisión de correlativo; nada añadido al baseline por esa causa | OK (vacuo y dicho) |
| R16 | `docs/verification.md`: «Estado en QuimiCloude» pasa a **dos** entradas con fecha 2026-09-08; el cierre de «Los flakes de saturación» dice que entró en QC-58 y en qué consistió; **la tabla de `--maxWorkers` sigue entera** (en el diff no hay ninguna línea borrada en ese bloque) | OK |
| R17 | `git diff --name-only origin/dev...HEAD`: 42 archivos, **ninguno** bajo `app/`, `lib/`, `components/`, `db/` ni el middleware. Sólo `vitest.config.mts`, `tests/**`, `docs/verification.md`, `specs/` y `progress/` | OK |
| R18 | No se añadió ningún `.spec.ts` de Playwright; el motivo está escrito en R18 y repetido en la bitácora | OK |

### R9 — el recuento hecho a mano (merge-base `d85b824` contra HEAD)

Los 33 archivos migrados dan el **mismo** número de declaraciones de caso antes y después. Muestra
completa, no una selección: `login-form` 25/25, `nav-user` 8/8, `order-form` 14/14,
`product-page` 29/29, `catalog-line-sheet` 20/20, `supplier-page` 30/30, `unit-select` 9/9,
`recipe-form` 27/27, `step-reader` 23/23, `data-table-pagination` 8/8, `data-table-header-menu`
10/10, `data-table-filters` 15/15, `data-table-filter-date` 7/7, `app-sidebar` 16/16,
`async-autocomplete` 10/10, y así los 33. Cero `skip`/`todo`/`only` en el árbol nuevo.

> **Aviso de método, por si alguien repite la comprobación:** comparar contra `origin/dev` (la
> punta) da falsos positivos, porque `origin/dev` avanzó por encima del merge-base y trae cambios
> de otras fichas. Hay que comparar contra `git merge-base origin/dev HEAD`.

## Mis mutaciones (no las de la bitácora)

Las cinco sobre el archivo real, restaurando desde copia con `cp`. Árbol limpio al terminar.

| # | Mutación | Salida | Veredicto |
| --- | --- | --- | --- |
| 1 | `testTimeout` de `ui` bajado a `5_000` | exit **1**: `Proyectos de Vitest sin el plazo de QC-58: ui (declara 5000)` | muerde y nombra |
| 2 | Línea `testTimeout` de `node` borrada | exit **1**: `Proyectos de Vitest sin el plazo de QC-58: node (declara nada)` | muerde y nombra |
| 3 | Proyecto `integration` renombrado a `integracion` | exit **1**: `Proyectos que QC-58 dejo cubiertos y ya no aparecen en vitest.config.mts: integration. Declarados ahora: ui, node, integracion` | muerde y nombra |
| 4 | `userEvent.setup()` colado en `tests/unit/sidebar-mobile.test.tsx`, archivo ya migrado | exit **1**: `Archivos de test que abren su propia sesion de user-event: ..., tests/unit/sidebar-mobile.test.tsx` | muerde y nombra |
| 5 | **Archivo de test nuevo** `tests/unit/_mut-nuevo.test.tsx` que llama a `userEvent.setup()` | exit **1**, sale nombrado junto al anterior en el mismo mensaje | muerde y nombra |

`EXCEPCIONES_DECLARADAS` son **tres** y cada una tiene motivo real: el helper (es la definición),
`async-autocomplete` (los 20 ms son el sujeto de la prueba, verificado leyendo el caso: teclea
contra un rebote de 250 ms y afirma sobre el término completo que llegó al servidor) y el propio
archivo de la guardia (escribe el literal para poder compararlo). Ninguna sobra.

## `esperarInteractiva`: los 21 sitios, uno a uno

- **Ninguno sustituye ni debilita nada.** Comprobado de dos formas: leyendo los 21 hunks del diff
  (todos son `await user.click(X)` que pasa a `await user.click(await esperarInteractiva(X))`, o el
  mismo patrón partido en dos líneas) y con el conteo global: **cero líneas `expect(` eliminadas**
  en todo el diff de `tests/`. El único cambio colateral es `getAllByTestId` que pasa a
  `findAllByTestId` en `unit-select`: espera en vez de exigir presencia inmediata, y sigue lanzando
  si el elemento no aparece. No relaja nada.
- **La espera puede fallar de verdad.** Comprobado con un test desechable (creado, ejecutado y
  borrado): `esperarInteractiva()` sobre un `div` con `pointer-events: none` **rechaza** por
  agotamiento de `waitFor`, y resuelve devolviendo el elemento si es interactivo. No es vacua por
  construcción.
- **Y no es la única razón por la que pasa ningún caso.** Comprobado con la mutación inversa:
  dejando el cuerpo del helper en `return elemento`, sin `waitFor`, los cinco archivos más cargados
  de popups (`unit-select`, `data-table-pagination`, `data-table-header-menu`,
  `data-table-filters`, `data-table-filter-date`) siguen pasando **61/61**. La versión *previa* al
  arreglo, en cambio, falla de verdad: recuperé `tests/unit/proveedores-ui/unit-select.test.tsx` de
  `f6b1e72` y da `1 failed | 8 passed` con `Unable to perform pointer interaction as the element
  has pointer-events: none`. O sea: el fallo era real, el arreglo es real, y ningún caso depende de
  la aserción de la espera para dar verde (ver menor 5).

## Hallazgos

### MAYOR 1 — R6 se cumple sólo en la mitad que la guardia mira: dos archivos siguen tecleando con la API directa de `userEvent`

**Qué dice R6:** «Todo archivo de test que teclee con `userEvent` DEBE obtener su sesión de esa
definición compartida, y NO DEBE llamar a `userEvent.setup()` por su cuenta salvo que figure en una
lista de excepciones declaradas con motivo».

**Qué pasa:**

- `tests/unit/pedidos-ui/order-row-actions.test.tsx` (l. 112 y 137, la segunda dentro de un bucle
  sobre tres controles por un `it.each` de dos estados) usa `await userEvent.click(...)`: la API
  directa, sin `setup()`. El archivo **no** aparece en ninguna task del bloque B.
- `tests/unit/pedidos-ui/order-table.test.tsx` (l. 175, 239 y 247) hace lo mismo **y a la vez** usa
  `setupUser()` en la l. 218: un archivo que la ficha da por migrado convive con las dos formas de
  teclear e importa `userEvent` en la l. 10 junto al helper en la l. 11.

**Por qué no es cosmético.** La API directa **no** hereda `delay: null`: en
`@testing-library/user-event/dist/cjs/setup/setup.js`, `defaultOptionsDirect` declara `delay: 0`,
así que esas llamadas siguen intercalando entre eventos el `setTimeout(0)` que esta ficha define
como «media cura» del flake. Y la guardia busca el literal `userEvent.setup(`, luego no las ve:
queda abierta exactamente la puerta por la que R7 existe, que la llamada 207 nazca mal sin que
nadie lo decida, sólo que con otro nombre.

**Qué falta para cumplirlo.** Una de las dos, y hay que elegirla con el humano porque cambia el
alcance escrito:

1. Migrar las cinco llamadas de los dos archivos a `setupUser()` y **ampliar la guardia** para que
   también persiga el uso de la API directa. Más simple y más difícil de esquivar: prohibir el
   import por defecto de `@testing-library/user-event` fuera del helper y de las excepciones,
   dejando pasar el `import type`.
2. O declarar la API directa como excepción en `requirements.md` —no en la bitácora— con su motivo,
   y dejarlo dicho en los dos archivos.

Lo que no vale es el estado actual: la bitácora lo señala como «deuda visible» (apartado «Tres
cosas que conviene que el reviewer sepa», punto 2), pero una deuda anotada por el implementer no es
una excepción aprobada, y R6 no la contempla.

### menor 1 — la cuenta de sitios de `esperarInteractiva` está mal: son 21, no 20

La bitácora dice «20 sitios en 13 archivos» en cinco lugares (líneas 26, 114, 508, 603 y 674) y en
`tasks.md > T4e`. Su propia tabla de la línea 98 suma **21** (2+1+2+3+2+3+1+1+1+1+2+1+1), y el
`grep` sobre el árbol da 21. Los archivos sí son 13. Es un error de suma, no un sitio sin arreglar.

### menor 2 — el número de llamadas migradas no cuadra entre documentos

`requirements.md > El terreno medido` y `design.md` hablan de **224** llamadas a `userEvent.setup()`
en 33 archivos; el comentario de `tests/helpers/user-event.ts` y el mensaje de error de la guardia
dicen **206**. Como el helper es «el sitio donde está escrito cómo se teclea aquí», conviene que su
número sea el bueno o que no lleve número.

### menor 3 — la justificación de R13 repite la explicación que R11 obligó a corregir por falsa

El `motivo` nuevo de `recipe-route-contract` en `tests/baseline-rojos.json` dice, correctamente:
«decía que falla porque, estando EN dev, el rango está vacío. **La causa real es la contraria**: el
rango SÍ trae archivos». Pero `requirements.md > R13 — la versión anterior y por qué cambia` y la
bitácora (apartado «El aviso de 2 por limpiar») justifican la reformulación diciendo justo lo
viejo: que las dos entradas fallan en `dev` porque el rango viene vacío. Los dos textos conviven
contradiciéndose en la misma rama.

**No invalida la reformulación de R13**: por cualquiera de las dos explicaciones las dos entradas
están rojas en `dev` y borrarlas dejaría `dev` en rojo, que es la conclusión que sostiene el
cambio, y yo mismo confirmé que en esta rama los dos archivos pasan (29 casos verdes). Pero deja
escrita una causa que el propio repo declara falsa dos archivos más allá.

### menor 4 — las dos redacciones reformuladas: veredicto explícito

Las miré buscando exactamente lo que pedía el encargo, si tapaban un incumplimiento:

- **R9 no es una excusa retroactiva.** Lo que hoy dice es lo que el código hace: conteo idéntico,
  cero `skip`/`todo`, cero `expect` borrados, y la espera se **añade** al clic. Y lo que la
  redacción vieja habría obligado a conservar era una dependencia oculta del `setTimeout(0)`, que
  demostré recuperando el archivo previo: falla de verdad. La reformulación describe mejor lo mismo
  y no borra ninguna exigencia: las tres del original (mismo número de casos, ningún `skip`/`todo`,
  ninguna aserción relajada) siguen ahí, y la nueva **añade** «ni borrada» y «no sustituye a
  ninguna comprobación existente».
- **R13 no se relajó más de lo que el motivo justifica.** Lo único que cayó es la condición «sin
  aviso de por limpiar», que medía cosa distinta según la rama desde la que se corriera; las cinco
  corridas y el «cero rojos fuera del baseline» siguen intactos, y la parte suprimida se sustituyó
  por la obligación de anotar el aviso y por qué es esperado, que se cumplió.

Lo dejo como menor porque reescribir un requisito durante la implementación es una práctica
delicada aunque aquí esté bien hecha: las dos conservan la redacción anterior y el motivo, que es
lo que la hace revisable.

### menor 5 — la aserción de `esperarInteractiva` hoy no muerde: lo que cierra la ventana es el `await`

Con el cuerpo del helper reducido a `return elemento`, o sea dejando sólo la frontera `async`, los
cinco archivos de popups pasan 61/61. La aserción de `pointer-events` es real y puede fallar, lo
probé, pero en la práctica se satisface en la primera comprobación y quien cierra la ventana es el
tick que introduce el `await`. Vale la pena que quede escrito en el helper: si alguien «optimiza»
la espera quitando el `waitFor` y dejando el `await`, los tests seguirán verdes y nadie se enterará
de que la precondición dejó de comprobarse.

### menor 6 — R14 pide la salida del comparador de **cada** corrida y hay una literal y cuatro «ídem»

La tabla de T11 da comando, fecha, horas, exit y conteos de las cinco, y la salida literal del
comparador de la primera. Es suficiente para creerlo, pero la letra de R14 pedía las cinco.

### menor 7 — restos de estilo de la migración

- Tres archivos migrados siguen importando `userEvent` sólo para tipar
  (`ReturnType<typeof userEvent.setup>`): `inventario/product-page.test.tsx` (l. 362 y 375),
  `recetas-ui/recipe-step-editor.test.tsx` (l. 146) y `recetas-ui/step-reader.test.tsx` (l. 81 y
  91), mientras que otros diez sí pasaron a `ReturnType<typeof setupUser>`. No rompe nada, la
  guardia no los caza porque no hay paréntesis, pero deja la migración a dos estilos.
- La guardia compara un literal, así que un espacio antes del punto o un alias la esquivan. Es el
  mismo límite que tienen las 17 guardias que ya existen y no lo cuento como defecto propio de esta
  ficha.
- `docs/verification.md` quedó con una línea muy larga que junta dos frases, en el párrafo de la
  firma del flake; cosmético.

## Lo que **no** revisé, y por qué

- **No repetí el gate completo.** El leader lo corrió cinco veces en verde sobre `63bea8e` y el
  único commit posterior (`d1e966d`) toca sólo `progress/` y `specs/`. Verifiqué en su lugar
  `typecheck` (exit 0), `lint` (exit 0), `test:guardias` (204 casos, exit 0), las cinco mutaciones
  y los archivos concretos que necesitaba.
- **No corrí la batería de integración**: ninguna task la toca y R15 quedó vacuo.
