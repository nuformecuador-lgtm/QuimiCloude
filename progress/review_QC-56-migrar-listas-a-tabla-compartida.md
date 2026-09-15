# QC-56 — migrar-listas-a-tabla-compartida · review F2.2

> Reviewer · 2026-09-15 · worktree `.worktrees/QC-56-migrar-listas-a-tabla-compartida`, rama
> `feature/QC-56-migrar-listas-a-tabla-compartida`, HEAD `d90c0cb`, diff `origin/dev...HEAD`
> (37 archivos). No se ha editado codigo. La rama NO esta sincronizada (F2.3 va despues).

## Veredicto: **RECHAZADO** — 3 mayores, 10 menores

Los tres mayores son pequenos de arreglar y ninguno pide tocar la logica de las pantallas:

- **M1**: comentarios con citas en `lib/modules/proveedores/index.ts`.
- **M2**: el test de R28 se pondra rojo en el cierre.
- **M3**: R25 no tiene test.

La migracion en si —D12, D16, R10, R11, D13 y D14— esta bien hecha y bien probada.

---

## 1. Lo que corri yo (no copiado de la bitacora)

| Que | Resultado |
|---|---|
| `pnpm exec vitest run` de los 7 archivos de test del diff (RP, SP, RC, SC, RLP, SLP, DTA) | **7 archivos, 216/216 verdes, exit 0**. R20 y R28 de DTA **ejecutados, no `skipped`** |
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | exit 0 |
| `node ../../scripts/check-trazabilidad.mjs` (script del arbol principal, cwd = worktree) | exit 0 |
| `playwright test e2e/proveedores.spec.ts --project=webkit -g R26 --reporter=list` en HEAD `d90c0cb`, arbol limpio, puerto 3117 libre | **1 passed (7.9 s)**, exit 0 |
| `git merge-tree --write-tree HEAD feature/QC-93-aterrizaje-sin-permiso-de-modulo` | **CONFLICT** en 3 archivos (ver m1) |
| `git merge-base --is-ancestor`: QC-93 y `af96771` (QC-80) | los dos **estan en `origin/dev`** (QC-93 por el merge `63f1e15`) |

**Lo que no corri, y por que:**

- `./init.sh` completo y la suite entera: los corre el leader, segun la regla del gate de `AGENTS.md`.
- El R26 de recetas en los dos motores y el de proveedores en Chromium: la evidencia esta en `scratchpad/pw-recetas.txt`, de las 15:14, anterior al commit `b0052b4` de las 15:19 y con las mismas lineas, y en `pw-prov-chromium.txt`, de las 15:49, anterior al commit `d90c0cb` de las 15:50.

## 2. Trazabilidad R1–R33, una fila por requisito

Abreviaturas:

- `RP`: `tests/unit/recetas-ui/recipe-page.test.tsx`
- `SP`: `tests/unit/proveedores-ui/supplier-page.test.tsx`
- `RC`: `tests/unit/recetas-ui/recipe-route-contract.test.ts`
- `SC`: `tests/unit/proveedores-ui/supplier-route-contract.test.ts`
- `RLP`: `tests/unit/recetas-ui/recipe-list-params.test.ts`
- `SLP`: `tests/unit/proveedores-ui/supplier-list-params.test.ts`
- `DTA`: `tests/unit/shared/data-table-alcance.test.ts`
- `E2E-R`: `e2e/recetas.spec.ts`
- `E2E-P`: `e2e/proveedores.spec.ts`

| R | Test(s) abiertos | Que afirman de verdad | Resultado |
|---|---|---|---|
| R1 | RP:340; SP:406; RC:841; SC:114 | La tabla compartida vive dentro del contenedor de la pantalla; los testIds viejos (recipe-row, recipe-page-*) no existen; hay 1 table y 1 paginacion, las dos dentro de data-table; ningun archivo de la ruta salvo el esqueleto importa components/ui/table | **Verifica** |
| R2 | RP:377; SP:425; RC:736 | Ids de columna exactos y en orden; cabecera y celda por columna; ni data-table-head-description ni data-table-cell-description, ni el texto de la descripcion; @ts-expect-error sobre el id description; en SP, columnheader = 6 | **Verifica** |
| R3 | RP:413; SP:448; RC:736 | Cadenas centinela de id, autoria y nombre normalizado ausentes del documento; ninguna columna con esos ids; @ts-expect-error sobre el id createdBy | **Verifica** |
| R4 | SP:474; E2E-P:507 | El href de supplier-detail-link en cada fila es supplierDetailRoute(id); en navegador el enlace es visible en la fila | **Verifica** |
| R5 | RP:434 | src igual a imageUrl tal cual; sin imagen se pinta el marcador; no hay ningun img con src vacio | **Verifica** |
| R6 | RP:520, RP:557; SP:489, SP:523; E2E-R:391; E2E-P:482 | Pulsar el boton de orden navega con SORT_PARAM; el menu de cabecera navega en desc; aria-sort refleja la URL; en navegador aria-sort descending y el orden relativo b antes que a | **Verifica** |
| R7 | RP:520, RP:572, RP:457; SP:549, SP:577 | Las columnas no ordenables no tienen aria-sort ni boton; los menus de imagen, pasos, telefono y correo no tienen sort-asc ni sort-desc; los flags coinciden con *_QUERYABLE en los dos sentidos | **Verifica** |
| R8 | RP:591; SP:600; E2E-R:391; E2E-P:482 | Escribir navega una sola vez tras el rebote (SP lo mide con timers falsos en SEARCH_DEBOUNCE_MS-1 y +1); vaciar navega sin q | **Verifica** |
| R9 | RP:610; SP:622 | El atajo «ultima semana» navega con createdFrom/createdTo; limpiar los quita; solo createdAt filtra (1 control de fecha) | **Verifica en parte**: la seleccion «a mano» en el calendario no se ejercita en ninguna de las dos pantallas (m8) |
| R10 | RP:640, RP:520; SP:663; RC:785 | Las filas salen en el orden del simulador aunque la URL pida otro, tambien despues de pulsar ordenar; RC prohibe .sort/.filter/.slice en tabla y columnas y comprueba rows={recipes} (hay mordida anotada) | **Verifica** |
| R11 | RLP:161, RLP:166; SLP:163, SLP:172; RC:808; RP:457; SP:577 | Los parsers importan *_QUERYABLE del barrel del modulo, sin ruta profunda ni «sortable: [» a mano; RC admite como unico literal CREATED_AT_COLUMN_ID; los flags de las columnas quedan atados a la lista blanca (design.md > 4.1) | **Verifica** |
| R12 | RLP:120/125/134/149/157; SLP igual; RP:650; SP:523, SP:622 | Ida y vuelta parse(build(p)); claves vacias no se escriben; la URL con los cinco parametros llega entera a la accion y se refleja en la busqueda y en aria-sort | **Verifica** |
| R13 | RLP:125 y SLP:125 (it.each, 26 casos); RP:675 | Pagina 0, negativa, decimal, con espacios o fuera de entero seguro; tamano fuera de opciones; orden no ordenable o sin direccion; 2026-02-30; solo espacios; repetidos. La pagina se pinta sin error | **Verifica** |
| R14 | RP:695, RP:955; SP:681 | Con la transicion retenida, aria-busy true en recipe-table/supplier-table, y el mismo nodo de busqueda conserva foco y valor. RP libera la transicion y comprueba aria-busy false | **Verifica** |
| R15 | RP:731; RC:762; SP:808, SP:489, SP:600 | 1 sola llamada al listado al pintar; en RC, 1 invocacion en toda la ruta; en SP el contador sigue en 1 tras ordenar o buscar, asi que el cliente no invoca | **Verifica** |
| R16 | RP:741; SP:907, SP:1135 | Solo con orden y cero filas: recipe-list-empty fuera, sin data-table, con crear hacia /nueva; en proveedores, crear abre el panel | **Verifica** |
| R17 | RP:758; SP:921 | page=4 con cero filas y sin busqueda: el enlace a la primera conserva tamano y orden (parseado) | **Verifica** |
| R18 | RP:781, RP:453; SP:944, SP:425 | Esqueleto con aria-busy, filas = MAX_PAGE_SIZE, celdas = *_SKELETON_COLUMN_COUNT = longitud real de columnas; sin tabla ni lista | **Verifica** |
| R19 | RP:797, RP:819, RP:1161; SP:959, SP:983, SP:1492 | role alert; reintentar llama a router.refresh; ni tabla, ni vacio, ni filas; el error inesperado muestra REFERENCIA_DEL_CASO con su etiqueta | **Verifica** |
| R20 | RP:848-880 (it.each de 5 estados); SP:873; DTA:501 | Cada estado aparece solo; testIds distintos; el diff no toca components/shared/data-table/ (ejecutado, no skipped) | **Verifica** |
| R21 | RP:480, RP:504; SP:706, SP:768; RC:1166 | pinnable false, sin menu ni pin en acciones; editar y borrar visibles con min-h-11 min-w-11 y sin hidden; editar es un enlace hacia recipeEditRoute; en RC, hover nunca como unica via | **Verifica** (44x44 por clase; jsdom no mide pixeles) |
| R22 | RLP:129; SLP:129; RP:979; SP:808 | Opciones = [10, 25] = selector compartido; 10 por defecto; cambiar a 25 navega con page=1 | **Verifica** |
| R23 | RP:1010, RP:1029; SP:841, SP:860 | Indicador con pagina y total; siguiente y anterior navegan; en los extremos, deshabilitados | **Verifica** |
| R24 | RP:1040, RP:1062; SP:746, SP:768; RC:1166 | overflow-x-auto solo en table-container, ningun ancestro con overflow-x ni 100vh; en viewport angosto y ancho los controles son visibles, tactiles y la busqueda lleva text-base | **Verifica** (limite de jsdom; el iPhone real es QC-114) |
| R25 | **ninguno** | La bitacora dice «Sin test automatico» y design.md > 8 lo deja a revision | **No verificado por test → MAYOR M3**. A mano: las aserciones nuevas no afirman copy; los literales que aparecen son datos del simulador (RP:808, SP:970) o de casos anteriores |
| R26 | E2E-R:391; E2E-P:482 | Busca por RUN_ID y ve las dos filas propias; ordena desc desde el menu; SORT_PARAM + q en la URL; aria-sort descendente; orden relativo invertido | **Verifica**. Proveedores/WebKit corrido por mi en d90c0cb: verde. Los otros tres con evidencia de disco anterior al commit (ver §1) |
| R27 | tests/guards/guard-dependencias-aprobadas.test.ts (sin cambios) + diff | package.json y pnpm-lock.yaml no estan en git diff --name-status origin/dev...HEAD | **Verifica** |
| R28 | DTA:509; RC:978; diff | Fuera de las rutas, solo lib/modules/proveedores/index.ts, +1 linea de reexport; sin db/ | **Verifica hoy**, pero el test es fragil → **MAYOR M2** |
| R29 | DTA:214, DTA:233, DTA:400 | Una octava pantalla sigue en rojo; recetas SI consume; lista cerrada de E2E en toEqual con los dos de recetas | **Verifica** |
| R30 | RC:841; SC:114 | Sin *-list-toolbar.tsx ni *-columns.ts; nada toolbar/pagination; solo el esqueleto importa ui/table; se conservan vacio, error y esqueleto; la tabla importa el barrel compartido | **Verifica** (RC esta en el baseline, ver m2) |
| R31 | SLP:168, SLP:172 | SUPPLIER_QUERYABLE del barrel es (toBe) el del dominio; el parser lo importa del barrel | **Verifica** |
| R32 | RLP/SLP:176/187/191; RP:884, RP:929; SP:999, SP:1037 | hasActiveSearchOrFilter (orden y tamano no cuentan); con q + rango y cero filas, *-no-results dentro de data-table-empty, sin crear ni vacio; en pagina 3, el enlace a la primera conserva busqueda, filtro, tamano y orden | **Verifica** |
| R33 | RLP:200; SLP:206; RP:884, RP:955; SP:1066, SP:999 | Limpiar = pagina 1 sin q ni fechas, con tamano y orden; RP pulsa y router.push(destino); re-render de filas a «sin resultados» con el mismo nodo de busqueda, foco, valor y control de fecha | **Verifica**. En proveedores el clic en limpiar solo se comprueba por href (m3) |

**Recuento: 32 de 33 verificados con test, con R9 parcial. R25 sin test.**

## 3. Puntos de riesgo pedidos por el leader

1. **Trazabilidad**: tabla de §2. Falta R25 (M3).
2. **D12 + D16**: correcto.
   - La seccion sale por ramas distintas, en recipe-list-section.tsx:21-49 y supplier-list-section.tsx:22-53:
     - error: fuera de la tabla;
     - cero filas sin busqueda ni filtro activos: vacio fuera, con crear;
     - cualquier otro caso: el mismo arbol, el div data-testid «*-list» con la tabla dentro.
   - Suspense sin key (formulas/page.tsx:46, proveedores/page.tsx:39).
   - En el componente, con status idle y cero filas, DataTableFilters y la paginacion siguen montados (components/shared/data-table/data-table.tsx:240-262 y 324-332).
   - RP:955 y SP:1066 prueban el mismo nodo, con su foco y su texto. El vacio con crear solo sale sin busqueda ni filtro (RP:741 con orden → vacio; RP:884 y SP:999 con busqueda → sin crear).
3. **R10 / R11 / D13**: correcto.
   - rows={recipes} y rows={suppliers} pasan tal cual (recipe-table.tsx:157, supplier-table.tsx:136).
   - Los parsers importan del barrel (recipe-list-params.ts:7, supplier-list-params.ts:7).
   - D13: exactamente una linea de reexport de SUPPLIER_QUERYABLE en lib/modules/proveedores/index.ts:30, sin mas cambios en lib/.
   - Los flags sortable/filter de las columnas estan escritos a mano, pero atados a la lista blanca por RP:457 y SP:577, como preve design.md > 4.1. Nada que objetar.
4. **D14 y enmiendas (T14)**: hechas.
   - La descripcion esta en HiddenRecipeField (recipe-columns.tsx:26).
   - Enmiendas fechadas debajo de QC-26 R8 y de QC-26 R14, y a continuacion de la enmienda de QC-44, reabriendo su l.106. No se borra ni se renumera nada.
5. **Test de R28**: fragil, ver **M2**.
6. **Rojos E2E que el implementer declara heredados**: la clasificacion es correcta, con un matiz.
   - **R6 de recetas y R52 de proveedores**: heredados de la base de la rama. La traza es «navigated to /inventario»; login-action.ts:125 aterriza en firstVisibleNavHref. impl_QC-93…md:79 (fila A) lista exactamente recetas.spec.ts:376 (R6) y proveedores.spec.ts:467 (R52) antes de QC-93. **Matiz:** QC-93 ya esta en origin/dev (63f1e15), asi que no son deuda abierta, son falta de sincronizacion. En F2.3 se curan, pero chocan (m1) y hay que volver a correrlos en los dos motores.
   - **R51 de proveedores**: heredado de QC-80.
     - af96771 esta en origin/dev.
     - components/shared/presentation-select.tsx:301-309 exige la unidad.
     - choosePresentation (e2e/proveedores.spec.ts:195-203) no cambia en el diff.
     - impl_QC-93…md:346 (causa B) lo lista como proveedores.spec.ts:360, con destino «ficha nueva», asi que sigue rojo tambien en dev.
     - La traza de pw-r51.txt coincide: presentation-create sigue con cuenta 1.
   - **R26**: verde. Proveedores/WebKit lo corri yo; el resto se apoya en la evidencia de §1.
7. **Imports de las desviaciones aceptadas**: e2e/recetas.spec.ts:62 y e2e/proveedores.spec.ts:67 se mezclan **sin conflicto** con QC-93, segun merge-tree. Nada que objetar. Donde si hay choque es en otra zona (m1).
8. **Pendientes declarados por el implementer**:
   - Clic en «limpiar» de proveedores solo por href: **menor** (m3).
   - Barrels con exportaciones de mas: **menor**, cosmetico (m4).
   - Comentarios con citas en tests y E2E: **menor** (m5), porque la regla bloqueante de docs/conventions.md > Comentarios se aplica a produccion.
   - Donde si hay cita en produccion es lib/modules/proveedores/index.ts: **mayor** (M1).
9. **Multiplataforma, 44x44 y copy**:
   - En el diff de produccion no hay 100vh.
   - Los hover: son decorativos sobre controles siempre visibles (recipe-table.tsx:87, supplier-columns.tsx:64).
   - Las acciones, el enlace de detalle y los enlaces de «sin resultados» llevan min-h-11 min-w-11.
   - La busqueda lleva text-base, lo comprueba RP:1085 y SP:783.
   - text-xs solo en el rotulo de «cargando», no en inputs.
   - La copy (R25) no tiene test (M3).

## 4. Hallazgos

### M1 — MAYOR (bloqueante): comentarios que citan fichas en un archivo de produccion del diff

lib/modules/proveedores/index.ts entra en el diff por D13. Revisado entero, como pide docs/conventions.md > Comentarios, cita fichas, requisitos y design.md:

- l.4 «T14»;
- l.6-9 «T13 (tasks.md, design.md > 4)… QC-42»;
- l.11 «QC-70 (R17, R18)»;
- l.50-54 «QC-52… (R24, P6)… (R32)»;
- l.61 «(design.md > 4)».

La bitacora lo reconoce (l.226) y no lo limpia por la frase de T1 «No cambia nada mas en lib/».

**Arreglo:** commit aparte «chore(QC-56): limpia comentarios de lib/modules/proveedores/index.ts», solo comentarios y sin tocar ningun export. No cambia logica, validacion ni contenido de ninguna lista blanca, asi que no contradice R28 ni D13. El test de R28 no se ve afectado: la ruta ya esta en su lista.

**Nota para el leader:**

- La seccion «Comentarios» de docs/conventions.md y la casilla de CHECKPOINTS.md estan **sin commitear en el arbol principal**. No existen en origin/dev ni en la base del worktree.
- Si el humano entiende que D13 («una linea») prohibe tambien limpiar comentarios en lib/, eso es una excepcion que tiene que quedar escrita; yo no puedo concederla.
- Las 16 rutas y componentes tocados en app/ estan limpios de citas.

### M2 — MAYOR (bloqueante): el test de R28 se pondra rojo en el cierre, por motivos ajenos a R28

tests/unit/shared/data-table-alcance.test.ts:509-530.

**Por que falla:** construye «tocados» con git diff --name-only origin/dev...HEAD **mas** git status --porcelain (l.463-488). Despues exige que todo lo que caiga fuera de las dos carpetas de ruta, tests/, e2e/, specs/ y progress/ sea exactamente lib/modules/proveedores/index.ts. Se pone rojo con:

- **el commit de feature_list.json en la rama**, que es practica del ciclo: a15e6ed «chore(QC-93): F2.0 en la copia del board de la rama», dd66d40 «chore(QC-95): la copia del board de la rama…». El ./init.sh completo del cierre, obligatorio antes del PR, saldria rojo;
- cualquier cambio legitimo en docs/, CHECKPOINTS.md o AGENTS.md (el aviso de next dev en AGENTS.md dice que lo reescribe), y cualquier archivo sin commitear o sin trackear fuera de esas carpetas en el worktree;
- ademas, tras el merge a dev el caso queda skipped para siempre, y en un clon sin origin/dev lanza error para todos.

**Precedente:** es exactamente la especie de deuda de cuatro entradas de tests/baseline-rojos.json («censo del diff de rama contra dev»), y QC-95 acaba de rehacer una guardia asi anclandola a un rango inmutable.

**Lo que R28 protege** es la logica, la validacion, las listas blancas y el esquema, no la contabilidad del arnes.

**Arreglo propuesto, sin tocar R20:**

- **(a)** Para R28, tomar solo el rango commiteado. Si se quiere morder antes de commitear, filtrar el arbol de trabajo a las raices de producto.
- **(b)** Invertir la lista: filtrar «tocados» a raices de producto —app/, lib/, components/, hooks/, db/, middleware.ts, package.json, pnpm-lock.yaml—, quitar las dos carpetas de ruta y exigir exactamente lib/modules/proveedores/index.ts. Asi feature_list.json, docs/ y CHECKPOINTS.md dejan de contar, y cualquier cambio de producto fuera de alcance sigue mordiendo.
- **(c)** Conservar la precondicion de rama y el throw si el rango no resuelve.
- Mordidas: un archivo en lib/ fuera del barrel → rojo; un feature_list.json modificado → verde.

### M3 — MAYOR (bloqueante): R25 no tiene test concreto

Regla 4 de AGENTS.md: «El reviewer rechaza si falta alguno». La bitacora (T18, fila R25) dice «Sin test automatico», y design.md > 8 lo delega en la revision.

Hay precedente directo de que se puede automatizar: tests/unit/configuracion-ui/grupos/alcance.test.ts:797-815 (QC-85 R41) prohibe las consultas getBy/findBy/queryBy por Text, Title, AltText o DisplayValue, y los ByRole con un name literal, en los tests de su carpeta.

A mano, las aserciones nuevas cumplen: los literales que hay son datos del simulador, como el message de RP:808, que es lo que devuelve el doble.

**Arreglo:** un caso equivalente, «R25: …», sobre los cinco tests de pantalla, parser y contrato de QC-56 y sobre los bloques nuevos de E2E-R/E2E-P, con una mordida anotada. Por ejemplo en RC, SC o un alcance propio.

- Opcion: dejar en su lista de admitidos los casos heredados de QC-26 y QC-44 que tocan datos del simulador, nombrados uno a uno.
- Si el leader o el humano prefieren sostener design.md > 8, tiene que quedar escrito como excepcion a la regla 4, porque yo no la puedo conceder.

### Menores

- **m1 — conflictos seguros en F2.3 con QC-93, que ya esta en origin/dev.** git merge-tree da CONFLICT en tres archivos:
  1. e2e/recetas.spec.ts: el test R26 nuevo, insertado justo antes del R6 que QC-93 reescribe (conflicto en l.384-450 del arbol resultante).
  2. e2e/proveedores.spec.ts: lo mismo con R52 (l.470-534).
  3. DTA (l.398-428): «once» frente a «diez».

  Al resolver:
  - **(i)** los dos R26 llaman a login(), que QC-93 borra, y su guardia tests/guards/guard-e2e-landing.test.ts prohibe un login local y la espera de URL a DASHBOARD_ROUTE: pasan a loginAndLand(page, adminUser);
  - **(ii)** en R6 y R52 se toma la version de QC-93, pero se conserva el selector de filas data-table-row- en lugar de supplier-row, que ya no existe y dejaria la negativa vacua;
  - **(iii)** la lista cerrada de E2E pasa a **doce**, con e2e/login.spec.ts, e2e/recetas-pasos.spec.ts y e2e/recetas.spec.ts;
  - **(iv)** volver a correr en los dos motores R6, R52 y los dos R26.

  El import de las desviaciones aceptadas (l.62 y l.67) no choca.
- **m2 — RC esta en tests/baseline-rojos.json.** El comparador del gate ignora el archivo entero. R30 de recetas solo tiene RC:841, y los casos estaticos de R10, R11 y R2/R3 viven ahi: hoy pasan (los corri), pero un rojo futuro no pararia el gate. Conviene mover R30 de recetas a un archivo que el gate si mire, como DTA o uno propio.
- **m3 — clic en «limpiar» de proveedores.** Solo se comprueba el href (SP:1023-1034). Ademas hay dos implementaciones de lo mismo: onClick + preventDefault en recipe-table.tsx:109-113, 126 y 136, y onNavigate en supplier-table.tsx:88-91, 102 y 112. onNavigate existe en Next 16.3.0 (node_modules/next/dist/client/app-dir/link.d.ts:170). El destino esta probado, pero la navegacion dentro de la transicion no. Igualar las dos al patron de recetas lo haria verificable en vitest.
- **m4 — barrels.** Exportan simbolos que nadie consume fuera de su archivo: RecipeColumnsDeps, SupplierColumnsDeps, SupplierColumnId y SupplierColumn. IMAGE_COLUMN_LABEL, EMPTY_CELL y ACTIONS_COLUMN_LABEL solo aparecen como constantes homonimas de otras pantallas. Superficie publica de mas, cosmetico.
- **m5 — comentarios con citas en tests y E2E del diff.** docs/conventions.md > Comentarios dice que en tests rige la misma regla, salvo R<n> en el nombre del caso. Recuento de lineas de comentario con cita:

  | Archivo | Lineas |
  |---|---|
  | DTA | 51 |
  | RC | 119 |
  | SP | 22 |
  | SC | 9 |
  | E2E-R | 32 |
  | E2E-P | 36 |
  | e2e/recetas-pasos.spec.ts | 20 |

  La feature añade dos nuevas: DTA:179 «(QC-56)» y DTA:446 «QC-56». El resto es heredado; por ejemplo e2e/recetas.spec.ts:5 y 20 («design.md > 12»), :106 («QC-47 R9»), RC:11-12, RC:343 y SP:1090 («R26 —»). Se limpian en un commit chore aparte.
- **m6 — limpieza de comentarios mezclada con cambios de codigo** en los commits de tanda (5d9116e, 4405db7; bitacora «Tandas 2 y 3», punto 4, y T10 nota 3). La regla pide commit aparte.
- **m7 — bloques largos de comentario en produccion.** recipe-columns-skeleton.ts:1-7 y supplier-columns-skeleton.ts:1-7 (siete lineas cada uno). Ademas, recipe-columns.tsx:12-16 y supplier-columns.tsx:13 repiten lo que ya dice el nombre de la constante.
- **m8 — R9 «a mano».** El rango elegido en el calendario no se ejercita en ninguna de las dos pantallas; solo el atajo y limpiar. Pasa por el mismo onParamsChange que cubren los tests de QC-55, pero el requisito lo nombra.
- **m9 — T0 sin casilla.** En tasks.md, T0 va como «HECHA» sin casilla. Es solo formato: T1-T18 si estan marcadas.
- **m10 — evidencia E2E anterior al commit final.** Salvo el R26 de proveedores en WebKit, que corri yo, las corridas de disco son de minutos antes del commit que las contiene. Como F2.3 obliga a repetir los E2E de los dos specs (m1), queda cubierto si se corren en los dos motores tras sincronizar.

## 5. Checklist

**Especificacion**
- [x] requirements.md con R1-R33 EARS y D1-D16.
- [x] design.md con alternativas descartadas y su porque (§10).
- [x] tasks.md T1-T18 marcadas. T0 sin casilla (m9).

**Trazabilidad**
- [x] Mapa R -> test en la bitacora. check-trazabilidad.mjs exit 0.
- [ ] Cada R con test concreto: **falta R25 (M3)**.

**Calidad**
- [x] typecheck, exit 0, lo corri yo.
- [x] lint, exit 0, lo corri yo.
- [x] Tests de la feature 216/216 (yo) + --rapido del leader. Suite completa pendiente del leader.
- [x] E2E: R26 en los dos specs.
- [x] Multiplataforma sin excepcion.
- [x] Sin dependencias nuevas.
- [ ] Comentarios de produccion sin citas: **M1**.

**Datos y seguridad**
- [x] N/A: sin tablas, migraciones, RLS, permisos nuevos ni webhooks.
- [x] requirePagePermission sigue en la primera linea de las dos paginas.
- [x] Sin cliente Supabase ni secretos.

**Modulos**
- [x] El unico cambio en lib/ reexporta dominio por el barrel.
- [x] Las pantallas importan los modulos por su contrato.
- [x] Guardias de arquitectura verdes en --rapido.

**Permisos y configuracion**
- [x] Datos por props desde la seccion de servidor.
- [x] Rutas por constantes y helpers.
- [x] Nada que cambie por entorno.

**Aislamiento por empresa**
- [x] N/A: ningun modelo nuevo. Las operaciones de listado no cambian.

**Verificacion final**
- [ ] ./init.sh completo: lo corre el leader. Hoy lo pondria rojo M2 en cuanto se commitee feature_list.json.
- [ ] Review OK: **RECHAZADO**.
- [ ] history.md y worktree: fases posteriores.

## 6. Que falta para aprobar

1. M1: commit chore que limpia los comentarios de lib/modules/proveedores/index.ts, o una excepcion escrita del humano.
2. M2: el test de R28 acotado a raices de producto y sin depender del arbol de trabajo fuera de ellas. Con mordida anotada.
3. M3: un caso automatico para R25, con mordida anotada, o una excepcion escrita a la regla 4.
4. Recomendado, no bloqueante: m2, m3 y m7. m1 es trabajo de F2.3.
