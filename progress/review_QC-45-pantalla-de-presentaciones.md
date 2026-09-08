# QC-45 — pantalla-de-presentaciones · review

> Revisor: agente `reviewer`, 2026-09-08, dentro del worktree
> `.worktrees/QC-45-pantalla-de-presentaciones/`, rama `feature/QC-45-pantalla-de-presentaciones`.
> No se edito ni una linea de codigo. Todo lo que aqui se afirma se comprobo ejecutando o leyendo,
> no leyendo la bitacora.

## Veredicto

**OK (aprobado)** — 0 hallazgos mayores, 7 menores.

**Condiciones de cierre, no bloqueantes y no atribuibles al implementer:** la feature **no puede
pasar a `done` todavia**, porque el recorte de T2 (decision humana del 2026-09-08) deja **R3 y R4
sin cubrir** —los hereda QC-75—, **T10 tiene pendiente la comprobacion manual en WebKit real** y
**T12 (gate completo + cierre) sigue abierta**. El recorte esta correctamente registrado en
`tasks.md`, en `progress/impl_*.md` y en el codigo, y **no se colo a medias** (comprobado abajo).

## Checklist

### Especificacion
- [x] `requirements.md` con 36 requisitos EARS numerados y 25 decisiones cerradas.
- [x] `design.md` con seccion 11 de alternativas descartadas (A, B, G, I y mas) y su porque.
- [ ] `tasks.md` con todas las tasks `[x]` — **NO**: T2 (4 casillas, recorte deliberado), la
      casilla manual de T10 y T12 (2 casillas) siguen sin marcar. Coherente con la decision humana.

### Trazabilidad
- [x] `progress/impl_*.md` contiene el mapa `R<n> -> test` completo.
- [~] Cada `R<n>` mapea a un test que verifica de verdad: **34 de 36 verificados por el revisor**.
      R3 y R4 no tienen test (T2 recortada, los hereda QC-75). Ver mapa abajo.

### Verificacion ejecutable (corrida por el revisor, no copiada de la bitacora)
- [x] `pnpm run typecheck` — verde.
- [x] `pnpm run lint` — verde.
- [x] Los 10 archivos de test propios mas `tests/guards` mas las cuatro guardias heredadas
      ampliadas: 31 archivos, 348 tests, 1 rojo. El unico rojo es el caso estructural de
      `recipe-route-contract.test.ts` que ya esta en `tests/baseline-rojos.json` (el rango
      `origin/dev...HEAD` esta vacio). Los 10 archivos propios: **121 tests verdes**.
- [x] `pnpm vitest run tests/unit` (suite unitaria ENTERA) -> 197 archivos, 2422 tests, 2 rojos.
      Los dos son los baselineados `recetas-ui/recipe-route-contract.test.ts` y
      `recetas/module-contract.test.ts`, ambos por el mismo motivo estructural. **Cero regresiones
      atribuibles a QC-45.** Ni un flake de los de QC-58 aparecio en esta corrida.
- [x] `tests/unit/private-layout.test.tsx` — verde (importa para R26, ver menor 2).
- [ ] `./init.sh` completo — no lo corre el reviewer, por instruccion del leader: ya se sabe rojo
      por la colision ajena de la migracion `20260907190000_units_equivalence_and_scope` de QC-76
      sobre la base de desarrollo compartida (14 archivos de `tests/integration/`). No es de esta
      feature y no se investiga aqui.

### Lo que el leader pidio comprobar expresamente
- [x] **T2 no se colo a medias.** `git status` y `git diff dev` confirman que
      `lib/shared/navigation/private-nav.ts` y `app/(private)/layout.tsx` no aparecen: cero lineas
      escritas en los dos. `page.tsx` los lee (`BRAND_LABEL`) pero no los toca.
- [x] **El diff de `lib/composition/route-role-rules.ts` es solo aditivo**: +6 lineas, 0 borradas,
      0 reordenadas (1 import + 1 fila + comentario). Merge limpio con QC-75.
- [x] **Las cuatro guardias heredadas se AMPLIARON, no se debilitaron.** Verificado diff a diff:
      - `identity/route-role-rules.test.ts`: la lista sigue siendo EXACTA y COMPLETA (`toEqual` de
        cinco filas, en orden); ademas anade un `not.toContain` mas sobre el literal de la ruta
        nueva. Muerde mas que antes.
      - `inventario/scope.test.ts`: la exclusion nueva es **la mas estrecha de las tres** — exige que
        la carpeta EXISTA (`toBeGreaterThan(0)`) y, dentro de ella, sigue poniendo rojo cualquier
        `page.tsx` de productos o fuente que case por product, inventario, ProductListSection o
        product-table. Lo de fuera de las tres exclusiones sigue teniendo que estar vacio.
      - `shared/data-table-alcance.test.ts`: lista cerrada de consumidores 3->4 y de specs E2E 3->4,
        con los centinelas anti-falso-verde subidos en consecuencia (`toBeGreaterThan(2)` pasa a
        `toBeGreaterThan(3)`); la pantalla de recetas sigue explicitamente fuera.
      - `recetas-ui/recipe-route-contract.test.ts`: una entrada mas en la lista cerrada de constantes
        exportadas por `lib/shared/routes.ts`; el `toEqual` sigue siendo exacto.
- [x] **R20 se respeta: `components/shared/data-table/` intacto.** Comprobado por dos vias
      independientes: `git status` no lista ningun archivo bajo `components/` (ni `shared/data-table`
      ni `ui/`), y `configuracion-ui/data-table-intacta.test.ts` lo comprueba sobre el diff
      `dev...HEAD` mas el arbol de trabajo (funciona sin commitear) y falla ruidosamente si el rango
      no resuelve. Ademas verifica en negativo que el contrato compartido no gano `renderRowActions`
      ni equivalente.
- [x] **Ninguna de las 25 decisiones cerradas se contradice.** Ruta `configuracion/presentaciones`,
      tabla compartida de QC-55 por su barrel, busqueda y orden por nombre contra
      `PRESENTATION_QUERYABLE`, panel lateral sheet, toast al exito y error en linea, borrado con
      dialogo que nombra la presentacion, `presentation_in_use` dentro del dialogo, selector 10/25
      con defecto 10, vacio/cargando/error, regla ruta-rol y prefijo privado, constante unica de
      ruta, `components/` con barrel, Server Actions (cero fetch propio), shadcn/ui sin tocar
      `components/ui/`, sesion por props (la pantalla ni la lee), asserts por rol/testid/constante,
      multiplataforma sin excepcion de escritorio, cero dependencias nuevas.

### Calidad, seguridad y plataforma
- [x] **Cero dependencias nuevas**: `package.json` no aparece en `git status`;
      `configuracion-convenciones.test.ts` lo ata al contenido de `dev` sobre el diff. No aplica
      `docs/dependencias.md`.
- [x] **Sin secretos, sin hardcode de contexto.** La URL sale siempre de `PRESENTATIONS_ROUTE`;
      guardia propia que prohibe el literal en toda la carpeta de la ruta y en `lib/`, `app/` y
      `components/`, con su caso negativo.
- [x] **Aislamiento por empresa y datos:** la feature no toca `db/schema.prisma`, ni
      `db/migrations/`, ni `lib/modules/`. No hay tabla nueva ni consulta nueva: toda lectura y
      escritura entra por las cuatro Server Actions de QC-20, que ya llevan su autorizacion y su
      test. Los checkpoints de RLS, columna de empresa, `down.sql` y webhooks no aplican.
- [x] **Capas separadas**: `PresentationListSection` es Server Component y no lee sesion ni
      `lib/composition` (guardia de fuente); los componentes de cliente reciben todo por props;
      ningun route handler nuevo; ninguna directiva de servidor reexportada por el barrel.
- [x] **Multiplataforma** (`docs/architecture.md > Componentes > Regla: multiplataforma`): sin
      `100vh` ni `h-screen` (grep limpio sobre la carpeta entera, y caso propio en
      `configuracion-viewport.test.tsx`); ningun `hover:` en la ruta y los dos botones de fila
      pintados desde el primer render; `min-h-11 min-w-11` en los controles tactiles; `text-base`
      (16 px) en el campo del formulario; desbordamiento contenido en la tabla — el test recorre la
      cadena de ancestros hasta `body` y exige que el contenedor del primitivo sea el UNICO
      desplazador horizontal. Sin excepcion declarada.
- [x] **E2E** (flujo con permisos, lo exige `CHECKPOINTS.md`): `e2e/presentaciones.spec.ts` con los
      dos recorridos, fixtures `qc45_e2e_` y `RUN_ID`, limpieza que tolera `presentation_in_use`.
      El revisor no lo re-ejecuto (el puerto 3117 de Playwright es fijo y compartido entre los tres
      worktrees vivos: lanzarlo habria tumbado a QC-75 y QC-76). Se leyo entero y es correcto:
      navega por `PRESENTATIONS_ROUTE`, comprueba que abrir y cerrar el panel no cambia la URL, que
      el toast sale, que la fila aparece filtrada por nombre y que existe en la base; y en el
      segundo, que el Operador acaba en el dashboard sin ver titulo, tabla ni vacio.
- [x] **Calidad de los tests**: los diez archivos propios prueban sus propias guardias en negativo
      (fuente sintetica con la violacion dentro), identifican por rol ARIA, `data-testid` exportado
      o constante importada, y los dobles de las Server Actions que no deben invocarse lanzan si
      alguien las llama. No hay ni un test vacio ni un `expect` decorativo.

## Mapa `R<n> -> test` VERIFICADO

`CU` = `tests/unit/configuracion-ui/`. Verificado = el revisor abrio el test, comprobo que el
aserto existe y muerde, y lo corrio.

| R | Test | Verificado |
| --- | --- | --- |
| R1 | `CU/presentation-page.test.tsx` — ruta derivada de la constante; `main`, `navigation` y `banner` nulos | si |
| R2 | `CU/presentations-route-contract.test.ts` + `CU/configuracion-convenciones.test.ts` (literal prohibido en toda la ruta, con caso negativo) | si |
| **R3** | — | **NO CUBIERTO (T2 recortada, lo hereda QC-75)** |
| **R4** | — | **NO CUBIERTO (T2 recortada, lo hereda QC-75)** |
| R5 | `tests/guards/guard-rutas-privadas-cubiertas` + `CU/presentations-route-contract.test.ts` (una sola entrada; las anteriores intactas) | si |
| R6 | `CU/presentations-route-contract.test.ts` (`findRouteRule`, subcaminos, y que un prefijo sin limite de segmento NO queda cubierto) + E2E recorrido 2 | si |
| R7 | `CU/presentation-page.test.tsx` — `unauthorized` pinta error y ni un dato; la seccion no toca `next/headers`, cookies, `lib/composition` ni `requirePermission` | si |
| R8 | `CU/presentation-table.test.tsx` + `CU/configuracion-convenciones.test.ts` | si |
| R9 | `CU/presentation-columns.test.tsx` — dos columnas exactas; en negativo ni id, ni marcas de tiempo, ni `nameNormalized`, ni autoria | si |
| R10 | `CU/presentation-table.test.tsx` — buscar navega (con el debounce real); las filas se pintan tal cual llegan aunque el termino no case | si |
| R11 | `CU/presentation-table.test.tsx` + `CU/presentation-columns.test.tsx` — la cabecera de acciones no tiene ni un boton | si |
| R12 | `CU/presentation-table.test.tsx` (opciones = `PAGE_SIZE_OPTIONS` = 10 y 25; defecto 10) + `CU/presentation-list-params.test.ts` | si |
| R13 | `CU/presentation-table.test.tsx` — anterior, siguiente e indicador con `role="status"` | si |
| R14 | `CU/presentation-list-params.test.ts` — basura variada (`abc`, `0`, `-3`, `1.5`, `1e3`, arrays, `pageSize=1000`, sort invalido) nunca lanza | si |
| R15 | `CU/presentation-page.test.tsx` — vacio con crear la primera; con page mayor que el total, enlace a la primera derivado de la constante | si |
| R16 | `CU/presentation-page.test.tsx` — arbol sin resolver pinta el fallback del Suspense, con `aria-busy` y tantas filas como `pageSize` | si |
| R17 | `CU/presentation-page.test.tsx` — mensaje, codigo y reintento; ninguna tabla | si |
| R18 | `CU/configuracion-viewport.test.tsx` — `overflow-x-auto` en el contenedor del primitivo y en ningun ancestro; acciones dentro del desplazador | si |
| R19 | `CU/presentation-columns.test.tsx` — dos botones, nombre accesible que incluye el de la presentacion, sin desplegable | si |
| R20 | `CU/data-table-intacta.test.ts` (diff mas arbol de trabajo; contrato sin `renderRowActions`), reconfirmado por el revisor con `git status` | si |
| R21 | `CU/presentation-sheet.test.tsx` — `sheet-content`, sin `alertdialog`, y `push`/`replace` nunca llamados ni al abrir ni al cerrar | si |
| R22 | `CU/presentation-sheet.test.tsx` — los `name` del formulario son exactamente uno | si |
| R23 | `CU/presentation-sheet.test.tsx` — precargado con el nombre actual; id por `bind` y `FormData` completo | si |
| R24 | `CU/presentation-sheet.test.tsx` — `duplicate_name` junto al campo con `aria-invalid` y `aria-describedby`; `invalid_input` a la region; panel abierto y valor conservado; los codigos se toman de las clases de error del dominio | si |
| R25 | `CU/presentation-sheet.test.tsx` + `CU/delete-presentation-dialog.test.tsx` — cierra, un solo `toast.success`, un solo `router.refresh()`, sin `push` ni `replace` | si |
| R26 | `tests/unit/private-layout.test.tsx` (positivo heredado, corrido y verde: exactamente una region con `aria-live`) + los negativos propios de `CU/presentation-page.test.tsx` y `CU/presentation-sheet.test.tsx` | si — ver menor 2 |
| R27 | `CU/delete-presentation-dialog.test.tsx` — nombra la presentacion; abrir y cancelar no invocan la action | si |
| R28 | `CU/delete-presentation-dialog.test.tsx` — `presentation_in_use` DENTRO del dialogo, que sigue abierto, sin refresco ni navegacion que retire la fila | si |
| R29 | `CU/configuracion-convenciones.test.ts` — raiz solo con archivos del App Router; barrel completo; sin imports profundos en todo el repo, con caso negativo | si |
| R30 | `CU/configuracion-convenciones.test.ts` — actions por su ruta exacta y nunca por el barrel del modulo; sin fetch propio; sin route handlers | si |
| R31 | `tests/guards/guard-dependencias-aprobadas` + `CU/configuracion-convenciones.test.ts` (`package.json` y `components/ui/` intactos sobre el diff) | si |
| R32 | `CU/configuracion-convenciones.test.ts` — ningun cliente importa composicion, Prisma ni el cliente de base de datos; caso negativo por cada uno | si |
| R33 | `CU/data-table-intacta.test.ts` + la nota de T0 | si (con el matiz del menor 4) |
| R34 | `CU/configuracion-viewport.test.tsx` — angosto y ancho, 44x44, 16 px, sin `100vh`, sin hover | si |
| R35 | `CU/configuracion-convenciones.test.ts` — ninguna consulta de la carpeta identifica por copy, con caso negativo | si |
| R36 | `e2e/presentaciones.spec.ts` — dos recorridos | leido y correcto; no re-ejecutado por el revisor (puerto 3117 compartido) |

**Total: 34 de 36 requisitos con test verificado.** Los dos que faltan, R3 y R4, son consecuencia
directa del recorte de T2 y estan escritos como tal en `tasks.md`, en la bitacora y en el codigo.

## Hallazgos

### Mayores

**Ninguno.**

### Menores

1. **menor — el estado vacio se come el resultado vacio de una BUSQUEDA, y con el la caja de
   busqueda.** `presentation-list-section.tsx` despacha al vacio con `items.length === 0` sin mirar
   `params.search`. Con un termino que no case, la pantalla dice «Todavia no hay presentaciones
   registradas» —que es falso, el catalogo no esta vacio— y deja de montar la tabla compartida, o
   sea que **desaparece la propia caja de busqueda** y no queda ningun control en pantalla para
   limpiar el termino: solo se sale editando la URL o yendose por el sidebar (que ademas hoy no
   tiene item a esta pantalla, por el recorte de T2). Roza R15, que habla del vacio «MIENTRAS el
   catalogo no tenga ninguna presentacion».
   **No es bloqueante porque no lo estrena esta ficha**: es el mismo codigo, linea por linea, de
   `app/(private)/inventario/components/product-list-section.tsx` (QC-22, mergeada y revisada,
   tambien con busqueda activa) y de pedidos (QC-35). Arreglarlo solo aqui dejaria tres pantallas
   incoherentes. Ficha propia, y candidato natural a **QC-56**, que es la que unifica el esqueleto
   de lista.
2. **menor — R26 esta mejor cubierto de lo que dice la bitacora.** El implementer lo marca
   «parcial». El revisor corrio `tests/unit/private-layout.test.tsx`: esta verde y contiene el
   aserto positivo exacto que R26 pide (una sola region, un solo `[aria-live]`). Sumado a los dos
   negativos propios —`page.tsx` no menciona Toaster, SidebarProvider, AppSidebar ni SidebarInset, y
   con el panel abierto hay cero `[aria-live]`—, **R26 queda cubierto**. Corregir la fila en
   `progress/impl_*.md`. Hueco real y pequeño: el test del dialogo de borrado no repite el negativo
   de `[aria-live]` que si hace el del panel.
3. **menor — se modifico `tests/unit/recetas-ui/recipe-route-contract.test.ts` y no se corrio.** No
   aparece en ninguno de los comandos de la bitacora, pese a ser una de las cuatro guardias
   ampliadas. El revisor lo corrio: 23 de 24 casos verdes, y el unico rojo es el caso estructural ya
   baselineado. No hay dano, pero tocar una guardia sin ejecutarla es como se cuela un rojo.
4. **menor — R33 dice que los unicos archivos heredados que esta feature puede modificar son los de
   R2 a R6, y se modificaron ademas cuatro archivos de test heredados.** La decision es correcta
   —son guardias de lista CERRADA cuyo punto de extension por diseno es que cada consumidor nuevo
   las amplie, y se ampliaron tensandolas— y esta documentada en la bitacora. Lo que falta es que el
   requisito lo contemple: R33 hoy lo prohibe literalmente. Anotarlo para que la proxima ficha no
   tenga que decidirlo desde cero.
5. **menor — nada esta commiteado: `HEAD` es igual a `origin/dev`.** Todo el trabajo vive en el
   arbol de trabajo (4 modificados trackeados y 27 sin trackear). Consecuencia concreta: los dos
   archivos baselineados que se apoyan en `git diff origin/dev...HEAD` tampoco pueden comprobar nada
   en esta rama, que es justo donde su guardia tendria sentido. Commitear antes del PR los despierta.
   Las guardias propias de la ficha no sufren: usan `dev...HEAD` **mas** el arbol de trabajo, a
   proposito y bien.
6. **menor — `feature_list.json` del worktree sigue diciendo `"status": "pending"` para QC-45.**
   Estado en disco desincronizado con la realidad. Es del leader, no del implementer, pero conviene
   arreglarlo antes del cierre para que `./init.sh` valide lo que hay.
7. **menor — T10: la comprobacion manual en un WebKit real sigue PENDIENTE**, y el implementer hizo
   bien en no marcarla. El E2E corrio en WebKit y paso, pero eso no es la comprobacion manual del
   scroll contenido en la tabla que `tasks.md` exige («no es una casilla que se marque sola»). El
   test unitario de viewport cubre la parte estructural —quien declara `overflow-x-auto` y quien
   no—, no el comportamiento real del gesto. Queda como deuda explicita de cierre.

## Lo que el reviewer NO evaluo, y por que

- **`./init.sh` completo**: por instruccion del leader. Los 14 rojos de `tests/integration/` son la
  colision ajena de la migracion de QC-76 sobre la base compartida, ya diagnosticada. Ni se
  investigo ni se toco.
- **`e2e/presentaciones.spec.ts` re-ejecutado**: el puerto 3117 de Playwright es fijo y compartido
  entre los tres worktrees vivos (`reuseExistingServer: false`); lanzarlo habria tumbado el trabajo
  de QC-75 y QC-76. Se reviso el codigo del spec, que es correcto y deriva la URL de la constante.
