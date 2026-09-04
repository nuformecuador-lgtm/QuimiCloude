# QC-44 — pantalla-de-proveedores · review

> Revisor: `reviewer`. Fecha 2026-09-04. Rama `feature/QC-44-pantalla-de-proveedores`
> (sincronizada con `origin/dev`, F2.3 hecha). **No se editó código**: este archivo es un veredicto.
> Fuentes leídas: `specs/QC-44-pantalla-de-proveedores/{requirements,design,tasks}.md`,
> `progress/impl_QC-44-pantalla-de-proveedores.md`, `CHECKPOINTS.md`, `docs/` y el diff
> `origin/dev...HEAD` (13 commits QC-44).

## Veredicto

**OK.** 52/52 requisitos con test que los ejerce de verdad, 0 hallazgos mayores, 6 menores.
Ninguno de los menores bloquea ni pide tocar código para cerrar la feature.

## Lo que corrí yo (no la bitácora)

| Comando | Resultado |
| --- | --- |
| `pnpm run typecheck` | verde, sin salida |
| `pnpm run lint` | verde, sin salida |
| `vitest run tests/unit/proveedores-ui/ tests/unit/proveedores/supplier-route-contract.test.ts --maxWorkers=2 --testTimeout=30000` | **13 archivos / 155 tests verdes** (39 s) |
| `vitest run tests/guards tests/unit/inventario tests/unit/app-sidebar.test.tsx tests/unit/identity --maxWorkers=2` | **56 archivos / 678 tests verdes** (46 s) — cubre la regresión que más me preocupaba: QC-22 tras la promoción de `PresentationSelect` |
| `playwright test e2e/proveedores.spec.ts --workers=2` (con `.env` exportado en el shell) | **4 verdes**: R51 y R52 en Chromium y WebKit (1.5 min) |

`./init.sh` completo **no** lo corrí: el leader lo pidió expresamente y es su paso antes del PR
(regla 5 de `CLAUDE.md`). Todo lo que el gate corre sobre esta feature —typecheck, lint, guardias,
suites de la feature y las tocadas por la promoción, más el E2E— queda verificado arriba.

Un rojo aparente que **no** es rojo: `pnpm run lint` falló una vez con `ELIFECYCLE 2` en el glob de
eslint por correr a la vez que el `next dev` del E2E escribiendo en `.next/`. Aislado, pasa limpio.
No es hallazgo.

## Checklist de `CHECKPOINTS.md`

### Especificación
- [x] `requirements.md` con 52 requisitos EARS numerados R1–R52, más Alcance, «Lo que NO entra»,
      4 preguntas abiertas y 26 decisiones cerradas.
- [x] `design.md` con **13** alternativas descartadas (A–M) y su porqué.
- [x] `tasks.md` con T0–T19 y **todas** marcadas `[x]` (verificado línea a línea).

### Trazabilidad
- [x] Cada requisito mapea a al menos un test concreto **que lo ejerce** (tabla abajo).
- [x] La bitácora contiene el mapa R -> test, y coincide con lo que los tests hacen de verdad: lo
      comprobé abriendo los archivos, no fiándome de la tabla.

### Calidad de código
- [x] `pnpm run typecheck` (TypeScript strict) verde.
- [x] `pnpm run lint` verde.
- [x] Tests unit/integración verdes en todo lo que la feature toca.
- [x] Flujo crítico (**permisos**) con E2E: `e2e/proveedores.spec.ts` cubre el camino del
      Administrador y el rechazo del Operador, en Chromium **y WebKit**. Corrido por mí.
- [x] Multiplataforma: sin `100vh` ni `h-screen` en las dos rutas (guardias de fuente y asserts de
      clase), sin `:hover` como única vía —las acciones de fila van en columna siempre visible—,
      área táctil `min-h-11 min-w-11` en enlaces, botones y selectores, y `text-base md:text-base`
      (16 px) en todos los campos, comprobado en `NARROW_VIEWPORT` y `WIDE_VIEWPORT` con
      `tests/helpers/viewport.ts`. Sin excepción de escritorio declarada, y no hace falta.
- [x] Dependencias: **ninguna nueva**. `package.json` y `pnpm-lock.yaml` con diff vacío contra
      `origin/dev`, y `guard-convenciones-proveedores.test.ts` lo comprueba por dos vías (que la
      feature no toque el archivo y que las dependencias sean idénticas a las de `dev`). Nada que
      añadir a `docs/dependencias.md`.

### Datos y seguridad (Supabase)
- [x] Permisos en el **service**: la pantalla no aporta ni repite autorización; los nueve casos de
      uso de `proveedores` llaman a `requireAdmin` (QC-43/QC-52, mergeado y con sus tests). R7 se
      verifica en negativo: con `unauthorized` no se pinta ni un dato.
- [x] RLS y migraciones: **no aplica y está declarado** (`design.md > 10`). Cero cambios en `db/`,
      verificado sobre el diff de los commits QC-44, no solo por lectura.
- [x] Sin cliente de Supabase ni acceso a datos fuera de las Server Actions.
- [x] Sin secretos: la feature no añade variables de entorno ni literales de configuración.
- [x] Webhooks: no aplica.

### Módulos hexagonales
- [x] `lib/modules/`, `db/` y `lib/composition/index.ts` **intactos** (R49), comprobado sobre el diff
      filtrado por la marca QC-44 y por los importes (solo contrato público o adaptador driving).
- [x] `lib/composition/route-role-rules.ts` sí se edita, y lo autoriza R6; el archivo sigue cargando
      en el borde (`guard-middleware-edge` verde) porque solo suma una constante de `lib/shared/routes`.
- [x] `lib/shared/routes.ts` sigue siendo hoja del grafo: no importa módulos.

### Permisos
- [x] Rutas protegidas: `SUPPLIERS_ROUTE` entra en `PRIVATE_ROUTE_PREFIXES` **una sola vez** (cubre
      lista y detalle por segmentos) y gana su regla ruta->rol restringida a Administrador. El test
      decide con las constantes **reales**, incluida la trampa `/proveedoresX`, que no debe quedar
      cubierta.
- [x] Componentes privados por props: sesión y datos de negocio bajan desde el Server Component, con
      guardias de que ningún cliente importa `@/lib/composition`, `@/lib/shared/db`, `@prisma/client`
      ni `@/db`.
- [x] Mutaciones por Server Actions; guardia de que no hay `fetch` a ruta propia, absoluta ni relativa.

### Configuración
- [x] Nada hardcodeado que cambie entre entornos. La URL vive en **una** constante y el literal de la
      ruta no aparece en ningún archivo de producto fuera de `lib/shared/routes.ts` (barrido de
      `app`, `components`, `lib` y `hooks`, en las tres formas de comilla).

### Verificación final (pasos del leader, no del implementer)
- [ ] `./init.sh` completo — lo corre el leader antes del PR.
- [x] `progress/review_QC-44-pantalla-de-proveedores.md` existe con veredicto OK (este archivo).
- [ ] Entrada en `progress/history.md`.
- [ ] Desmontar el worktree.

## Trazabilidad R -> test -> verificado

Los tests sin ruta viven en `tests/unit/proveedores-ui/`. «Verificado» = abrí el test y el test
**ejerce** el requisito; ninguno es un test vacío ni un assert de «aparece algo».

| R | Test | Verificado |
| --- | --- | --- |
| R1 | `supplier-page.test.tsx:317` (un solo `main`, la pantalla dentro de `private-content`) · `supplier-route-contract.test.ts:100` (ningún landmark propio) | sí |
| R2 | `tests/unit/proveedores/supplier-route-contract.test.ts:111` (barrido repo-wide del literal) · `catalog-route-contract.test.ts:108` (tres comillas) · `guard-convenciones-proveedores.test.ts:173` (plantilla) | sí |
| R3 | `tests/unit/proveedores/supplier-route-contract.test.ts:99` (helper derivado) · `supplier-page.test.tsx:375` (el destino de la fila ES `supplierDetailRoute(id)`) | sí |
| R4 | `tests/unit/proveedores/supplier-route-contract.test.ts:159-193` (nivel superior, sección «Cadena», no hijo de Producción, testId único) · `tests/unit/app-sidebar.test.tsx` | sí |
| R5 | `tests/unit/proveedores/supplier-route-contract.test.ts:140,236,246` (prefijo único; sin sesión al login con destino de vuelta; `/proveedoresX` fuera) | sí |
| R6 | `tests/unit/proveedores/supplier-route-contract.test.ts:226-286` (Admin pasa en lista y detalle; Operador sale con `forbidden`; las otras dos reglas siguen) · `tests/unit/identity/route-role-rules.test.ts` | sí |
| R7 | `supplier-page.test.tsx:624` · `supplier-detail-page.test.tsx:379,401` (con `unauthorized` no se pinta ni un dato y el catálogo ni se pide) · `catalog-directories.test.ts:94` | sí |
| R8 | `supplier-list-params.test.ts:30,51` · `catalog-list-params.test.ts:27,39` · `supplier-page.test.tsx:436` · `supplier-detail-page.test.tsx:595` (10/25, defecto 10, cambiar recarga) | sí |
| R9 | `supplier-page.test.tsx:464,488` · `supplier-detail-page.test.tsx:620,648` (avanzar y retroceder, página y total, extremos deshabilitados) | sí |
| R10 | `supplier-list-params.test.ts:57,68,83,98` · `catalog-list-params.test.ts:57,68,79` (inválido, fuera de rango, sobre el tope, repetido: acotado, nunca error) | sí |
| R11 | `supplier-page.test.tsx:500` · `supplier-detail-page.test.tsx:660` (en negativo: sin searchbox, sin textbox, un solo combobox, encabezados sin controles) | sí |
| R12 | `supplier-page.test.tsx:358` · `supplier-detail-page.test.tsx:347,570` (ids de autoría inconfundibles ausentes del documento Y de la declaración de columnas) | sí |
| R13 | `supplier-page.test.tsx:390` (el scroll vive en `table-container` y ningún ancestro lo declara) · `supplier-detail-page.test.tsx:677` (ídem, en los dos anchos) | sí |
| R14 | `supplier-page.test.tsx:330` (itera `SUPPLIER_COLUMNS`, compara celda a celda y fija el orden de las cinco claves) | sí |
| R15 | `supplier-page.test.tsx:375` (enlace real, destino igual al helper) | sí |
| R16 | `supplier-page.test.tsx:522,552,678` (vacío propio, sin tabla, con la acción de crear el primero) | sí |
| R17 | `supplier-page.test.tsx:584` (árbol sin resolver, el fallback real de Suspense, `aria-busy`, filas iguales a `pageSize`) | sí |
| R18 | `supplier-page.test.tsx:599` (mensaje y código devueltos, reintento que refresca, y cero filas, tabla o vacío) | sí |
| R19 | `supplier-detail-page.test.tsx:306,327` (nombre, teléfono, correo; catálogo debajo; opcionales con marca de «sin dato») | sí |
| R20 | `supplier-detail-page.test.tsx:358` (`not_found` con vuelta a `SUPPLIERS_ROUTE` y `listCatalogLinesAction` no llamada) | sí |
| R21 | `supplier-detail-page.test.tsx:482,558` (las ocho claves en orden, encabezados presentes, opcionales) | sí |
| R22 | `catalog-directories.test.ts:75,84,94,108,122,130,145` (nombre, «no resuelto», fallo parcial, cota) · `supplier-detail-page.test.tsx:506,517,531` (nombre en celda; marcador y el uuid ausente; diccionarios una vez por render) | sí |
| R23 | `supplier-detail-page.test.tsx:418,433` (el testid del vacío del catálogo no es el de la lista) · `catalog-line-sheet.test.tsx:375` (el vacío abre el panel) | sí |
| R24 | `supplier-detail-page.test.tsx:446` (esqueleto con filas iguales a `pageSize`, y el detalle sí se ve) | sí |
| R25 | `supplier-detail-page.test.tsx:457` (error con mensaje, código y reintento, sin tabla ni vacío) | sí |
| R26 | `supplier-page.test.tsx:648` · `catalog-line-sheet.test.tsx:352` (panel lateral con `role=dialog`, la tabla sigue detrás, sin `push` ni `replace`, sin consulta extra) | sí |
| R27 | `supplier-page.test.tsx:691` (los tres campos llegan al FormData de la operación de alta) | sí |
| R28 | `supplier-page.test.tsx:712` (precarga; se cambia uno y viajan los tres; id aplicado con `bind`) | sí |
| R29 | `catalog-line-sheet.test.tsx:390,438,818` (nombres de campo iguales al contrato; nada de `productId`, `product` ni `articleId`; dos únicos selectores; los siete declarados) | sí |
| R30 | `catalog-line-sheet.test.tsx:415` (sin input de archivo, sin `imagePath` en el envío) · `supplier-detail-page.test.tsx:570` (tabla sin imágenes) · `catalog-route-contract.test.ts:227` | sí |
| R31 | `catalog-line-sheet.test.tsx:540,579,595` (precarga de los siete, reemplazo completo, sin campo de proveedor, opcionales sin inventar valores) | sí |
| R32 | `supplier-page.test.tsx:755,792,825,1000` · `catalog-line-sheet.test.tsx:612,649,680` (por código estable —el mensaje del fixture no se parece al copy—, junto al campo o en la región `role=alert`, panel abierto y lo escrito intacto) | sí |
| R33 | `supplier-page.test.tsx:873,980` · `catalog-line-sheet.test.tsx:753` · `delete-catalog-line-dialog.test.tsx:310` (cierra, toast una vez, refresco una vez) | sí |
| R34 | `supplier-page.test.tsx:894` (layout más pantalla: una sola región `aria-live`, también con el panel abierto) · `catalog-line-sheet.test.tsx:774` | sí |
| R35 | `supplier-page.test.tsx:954,980` (doble que revienta si se le llama; el diálogo nombra al proveedor y el aviso de arrastre se afirma por testid; al confirmar, id oculto) | sí |
| R36 | `delete-catalog-line-dialog.test.tsx:255,274,292,310,356` (abrir, cancelar y Escape no invocan nada; nombra solo la línea) | sí |
| R37 | `catalog-line-sheet.test.tsx:466` (obligatoria: sin ella no se llama a la operación, el campo es `required`) · `tests/unit/inventario/product-page.test.tsx:991` (alcanza más allá de la primera página, sobre el MISMO archivo promovido) | sí |
| R38 | `catalog-line-sheet.test.tsx:466` (alta en línea, queda seleccionada, no se pierde lo escrito y se envía el id nuevo) · `product-page.test.tsx:1028` | sí |
| R39 | `tests/unit/inventario/product-route-contract.test.ts:401` sobre `components/shared/presentation-select.tsx` (ni update ni delete; solo listar y crear) · `tests/unit/inventario/scope.test.ts` | sí |
| R40 | `unit-select.test.tsx:47-134` (solo existentes, «sin unidad» envía vacío, sin alta ni texto libre) · `catalog-route-contract.test.ts:215` (no importa adaptadores de unidades) | sí |
| R41 | `catalog-line-sheet.test.tsx:513,727` (la cadena 0.1005 llega igual; text más inputmode decimal; el tiempo de entrega sí es entero) · `supplier-detail-page.test.tsx:546` (celda idéntica a la cadena) · `catalog-route-contract.test.ts:175,194` (guardia de fuente de conversiones y de control numérico) | sí |
| R42 | `supplier-route-contract.test.ts:81` · `catalog-route-contract.test.ts:119` (nada suelto junto a `page.tsx`, import por barrel, barrel sin frontera de cliente) · `guard-convenciones-proveedores.test.ts:188` (nadie entra por ruta profunda desde fuera) | sí |
| R43 | `catalog-route-contract.test.ts:152` · `guard-convenciones-proveedores.test.ts:215` (ningún fetch a ruta propia, absoluta o relativa) | sí |
| R44 | `guard-convenciones-proveedores.test.ts:249` (sobre el diff de los commits QC-44 más el árbol de trabajo) | sí |
| R45 | `guard-convenciones-proveedores.test.ts:265` (manifiesto intacto y dependencias iguales a las de dev) · `supplier-page.test.tsx:847` y `catalog-line-sheet.test.tsx:701` (validación previa con el esquema del contrato, comparada contra su propio safeParse) | sí |
| R46 | `supplier-detail-page.test.tsx:340` · `catalog-line-sheet.test.tsx:540` (abrir el panel no dispara lecturas) · `catalog-route-contract.test.ts:162` y `guard-convenciones-proveedores.test.ts:231` (cliente sin composición ni base de datos) | sí |
| R47 | `supplier-page.test.tsx:522` · `delete-catalog-line-dialog.test.tsx:374` · `tests/unit/proveedores/supplier-route-contract.test.ts:159` (roles ARIA y testids, nunca copy) | sí |
| R48 | `supplier-page.test.tsx:415,915` · `supplier-detail-page.test.tsx:677` · `catalog-line-sheet.test.tsx:785` · `unit-select.test.tsx:134` · `delete-catalog-line-dialog.test.tsx:375` (44x44, 16 px, sin alto de pantalla, nada oculto, en los dos anchos) | sí |
| R49 | `guard-convenciones-proveedores.test.ts:296` (sobre el diff) · `catalog-route-contract.test.ts:237` (sobre los importes) | sí |
| R50 | `guard-herencia-armazon-privado.test.ts:173-299` (sin layout propio, sin sidebar, navegación ni avisos nuevos, primitivas intactas, helper de viewport importado y no duplicado) | sí |
| R51 | `e2e/proveedores.spec.ts:317` — corrido por mí, verde en Chromium y WebKit; además comprueba en Postgres que la línea existe | sí |
| R52 | `e2e/proveedores.spec.ts:406` — corrido por mí, verde en los dos motores; acaba en el dashboard (no en el login) y con cinco comprobaciones de ausencia | sí |

**52/52 verificados. Ningún requisito sin test, y ningún test que no ejerza lo que dice cubrir.**

## Hallazgos

### Mayores (bloqueantes)

Ninguno.

### Menores

1. **menor — el catálogo de unidades se pide dos veces por render del detalle, y el test que lo
   vigila dice lo contrario que su assert.** `app/(private)/proveedores/[id]/page.tsx:64` llama a
   `listUnitsAction()` para bajar las unidades por props, y
   `app/(private)/proveedores/[id]/components/catalog-directories.ts:84` vuelve a llamarla para el
   diccionario de la tabla. El test que cubre esa parte de R46 se titula «las unidades se piden UNA
   sola vez en el servidor y bajan por props» y afirma `toHaveBeenCalledTimes(2)`
   (`tests/unit/proveedores-ui/supplier-detail-page.test.tsx:340-345`; misma cuenta en
   `supplier-detail-page.test.tsx:542` y `catalog-line-sheet.test.tsx:559`). El comportamiento es
   correcto y R46 se cumple —ningún componente de cliente pide nada—, pero la segunda lectura es
   evitable pasando a `buildCatalogDirectories` las unidades ya cargadas, y el título del test dice
   algo distinto de lo que mide. No bloquea: es una consulta de más en el servidor, no un dato mal
   mostrado.

2. **menor — `tests/unit/proveedores-ui/catalog-line-sheet.test.tsx` es frágil con el `testTimeout`
   por defecto.** Sus casos teclean siete campos con `userEvent` (helper en la línea 303) y con la
   máquina cargada agotan los 5000 ms; con `--testTimeout=30000` pasan los 20. Ya está diagnosticado
   y **no es un rojo real**, pero merece anotarse: un test que depende del reloj de la máquina
   acabará poniendo el gate en rojo por algo que no es el código. Salida barata: subir el timeout de
   ese archivo, o usar `paste`/`fireEvent` donde solo importa el valor final.

3. **menor — el contrato de ruta de T1-T3 vive en la carpeta del módulo de backend.**
   `tests/unit/proveedores/supplier-route-contract.test.ts` está junto a los tests de QC-43/QC-52,
   mientras el resto de la feature vive en `tests/unit/proveedores-ui/` —que además tiene su propio
   `supplier-route-contract.test.ts`, con otro contenido—. Dos archivos con el mismo nombre en dos
   carpetas invitan a editar el que no era. La bitácora lo declara (desviación 7), así que no está
   silenciado.

4. **menor — el componente promovido se quedó sin tests propios en su nueva ubicación.**
   `components/shared/presentation-select.tsx` ya es compartido, pero toda su cobertura sigue
   colgando de `tests/unit/inventario/` (`product-page.test.tsx:991,1028` y
   `product-route-contract.test.ts:401`, que lo alcanza por una constante de ruta explícita). Hoy
   funciona y R37, R38 y R39 quedan cubiertos; si mañana la ruta de inventario se reorganiza, la
   cobertura del componente que usa también proveedores se va con ella sin que nada avise.

5. **menor — `EMPTY_CELL` y `UNRESOLVED_CELL` son el mismo glifo.**
   `app/(private)/proveedores/[id]/components/catalog-columns.ts:51,59` documentan con cuidado que
   «no hay dato» y «no se pudo resolver el nombre» significan cosas distintas, y las pintan las dos
   como una raya. R22 se cumple —el marcador tiene su testid propio y el uuid nunca aparece—, así
   que es cosmético, pero para el usuario la distinción que el código declara no existe.

6. **menor — contradicción textual entre R29 y R30 en el propio `requirements.md`.** R29 pide
   capturar «los siete campos de negocio —nombre, presentación, unidad, ruta de imagen, costo,
   mínimo y tiempo de entrega—» y R30 prohíbe pedir ninguna imagen
   (`specs/QC-44-pantalla-de-proveedores/requirements.md:168-174`). La implementación resuelve por
   R30 y lo deja escrito como ausencia decidida
   (`tests/unit/proveedores-ui/catalog-line-sheet.test.tsx:818-834`), que es la lectura correcta
   dada la decisión humana y P1. Es deuda de redacción del spec, no de código.

## Lo que NO es hallazgo (verificado y descartado)

- La promoción de `PresentationSelect` a `components/shared/` y el cambio de una línea de import en
  `app/(private)/inventario/components/product-form.tsx:6`: decisión humana. Además la comprobé: los
  678 tests de `tests/guards`, `tests/unit/inventario`, `tests/unit/identity` y `app-sidebar` siguen
  verdes tras la mudanza, incluidos los ajustes de `scope.test.ts`, que **no aflojan** el patrón
  (excluyen un nombre y exigen a cambio que el archivo exista y no lleve señal real de pantalla).
- El diccionario acotado de presentaciones con marcador de respaldo: es lo que manda
  `design.md > 6.2`, con P4 abierta a propósito y R49 prohibiendo aquí la solución de fondo.
- `components/ui/textarea.tsx`, `components/shared/{compress-image,file-field,file-types}`,
  `components/shared/data-table/` y `tests/unit/shared/data-table-*`: no salen de ningún commit
  QC-44 (comprobado con `git log --grep=QC-44 origin/dev..HEAD` y `git show --name-only`). Ruido
  heredado de los merges.
- Playwright sin `.env` en los worktrees: limitación de entorno ajena a QC-44 —`e2e/inventario.spec.ts`
  falla igual—. Exportando las variables en el shell, el E2E de esta feature pasa entero.

## Veredicto final

**OK.** Sin bloqueantes. Queda para el leader: `./init.sh` completo antes del PR, la entrada en
`progress/history.md` y el desmontaje del worktree.
