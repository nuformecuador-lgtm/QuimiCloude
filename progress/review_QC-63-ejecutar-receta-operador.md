# QC-63 — ejecutar-receta-operador · informe de revision

> Revisado sobre el worktree `.worktrees/QC-63-ejecutar-receta-operador`, rama
> `feature/QC-63-ejecutar-receta-operador`, HEAD `5672024`, arbol limpio y con `origin/dev`
> como ancestro (verificado con `git merge-base --is-ancestor`). **Todo el diff de la ficha se
> midio contra `origin/dev`, no contra la base de la rama**: el merge de QC-50 metia 16 commits
> ajenos que habrian ensuciado cualquier conteo.
>
> El reviewer **no edita codigo**. Lo que corrio aqui esta acotado a los modulos del punto
> caliente, con `--maxWorkers=2`. **No** se repitio el gate completo, ni Playwright, ni la
> mutacion del E2E de R28: los corrio el leader y constan en `progress/impl_*.md`.

## Veredicto

**RECHAZADO.** Dos hallazgos bloqueantes. Uno es de una linea; el otro es medio requisito
(R15) que hoy **no puede ocurrir en produccion** y cuyo test verde se apoya en un valor que la
Server Action real nunca devuelve.

Todo lo demas que se pidio verificar —la autorizacion, el ambito de empresa, la matriz de
transiciones, los siete censos, la guardia retirada, la enmienda a QC-88, el factor degradado y
la trazabilidad estructural— **se sostiene contra el fuente**, y buena parte se comprobo por
mutacion propia.

---

## Checklist

### Especificacion
- [x] `specs/QC-63-ejecutar-receta-operador/requirements.md` con EARS numerados R1-R31.
- [x] `design.md` con `## 8. Alternativas descartadas`.
- [x] `tasks.md`: **24 de 24 en `[x]`**, ninguna sin marcar.
- [~] `requirements.md` esta **duplicado a medias** (ver hallazgo menor 1).

### Trazabilidad
- [x] Los 31 requisitos tienen fila en la tabla T24 de `progress/impl_*.md`.
- [x] Las filas declaradas **estructurales** se verificaron una a una (abajo).
- [ ] **R15 no se sostiene**: su test verde no puede fallar por la conducta real (BLOQ-2).

### Calidad de codigo
- [x] Gate completo verde segun el leader (517 archivos, 7488 tests) — dado por hecho, no repetido.
- [x] Focalizado propio: `asignaciones`, `asignaciones-ui`, `composition/asignaciones-facade`,
      `recetas/scope`, `shared/data-table-alcance` y tres guardias -> **31 archivos, 503 tests, verde**.
- [x] E2E: la ficha toca permisos y tiene `e2e/ejecucion-receta.spec.ts` (3 casos, ejecutados por
      el leader contra Chromium).
- [x] Multiplataforma: `min-h-dvh` (no `100vh`), `min-h-11 min-w-11` (44 px) en el disparador y en
      el selector de unidad, `text-base` (16 px) en el campo, y el aviso de R27 es un parrafo visible
      asociado por `aria-describedby`, **nunca un `title`**. Sin nada detras de `:hover`.
- [x] Dependencias: `package.json` **no aparece en el diff**. Ninguna utilidad a mano que duplique
      libreria del stack (la conversion es `convertQuantity` de `unidades`, no aritmetica propia).

### Datos y seguridad
- [x] `db/` y `db/schema.prisma` **no aparecen en el diff**: ningun modelo nuevo, ninguna columna,
      ninguna migracion. R10 confirmado.
- [x] Aislamiento por empresa: la lectura de receta **si** filtra por empresa, probado por mutacion.
- [x] Permisos validados en el service, con test sobre los dobles del puerto.
- [x] Sin secretos ni literales de entorno nuevos. Sin webhooks.

### Modulos hexagonales
- [x] `asignaciones` no toca `prisma.order`: la escritura va por `OrderCatalog.transitionAliveById`,
      implementado en `pedidos` (R13).
- [x] Ningun `'use server'` reexportado: `order-execution-actions.ts` se importa por ruta exacta.
- [x] Import entre modulos por contrato publico, nunca ruta profunda.

### Verificacion final
- [x] `./init.sh` verde (leader).
- [ ] Este informe: **RECHAZADO**.

---

## Hallazgos

### BLOQ-1 · `BLOQUEANTE` — cita de ficha en un comentario de produccion que el diff anade

`lib/modules/asignaciones/index.ts:125`:

    // QC-63 T8 — La pantalla de ejecucion. Bloque NUEVO al final: no reordena ni reformatea nada

Linea **anadida por esta rama** en un archivo de **produccion**. `docs/conventions.md > Comentarios`
lo prohibe y el criterio del reviewer lo declara bloqueante sin matices.

La bitacora documenta **tres reincidencias ya corregidas** y da la produccion por limpia; un `grep`
de los cuatro patrones sobre el diff contra `origin/dev` deja **esta cuarta** en pie. Es la **unica**:
los seis archivos que la bitacora nombra estan efectivamente limpios.

**Que falta:** borrar la cita. El resto del comentario —«bloque nuevo al final, no reordena nada»—
describe el archivo y puede quedarse. Una linea.

> Refuerza el caso de **QC-115**: cuatro reincidencias en cuatro tandas, de subagentes distintos, y
> la ultima sobrevivio a la limpieza manual precisamente porque la hizo un humano con un `grep` y no
> un test.

### BLOQ-2 · `BLOQUEANTE` — R15: la confirmacion visible no puede verse en produccion, y su test no puede fallar

R15 exige **dos** cosas: «mostrar una **confirmacion visible en pantalla** Y devolver a quien la usa
a la lista». `design.md` (lineas 317-318) es aun mas explicito: «La confirmacion visible se muestra
**antes** de volver, en la propia pantalla».

Lo que hay en el fuente:

- `lib/modules/asignaciones/adapters/driving/order-execution-actions.ts:75-77` — en el camino feliz la
  accion **siempre** termina en `redirect(ASSIGNED_ORDERS_ROUTE)`, fuera del `try`. `redirect()`
  lanza, asi que la accion **nunca devuelve el estado de exito**. El tipo lo declara; el codigo no
  tiene ninguna ruta que lo produzca.
- `app/(private)/asignacion/[id]/components/order-execution-screen.tsx:104-112` — el parrafo de
  confirmacion se pinta solo si el estado es de exito, **inalcanzable** con la accion real. Es codigo
  muerto en produccion.
- `tests/unit/asignaciones-ui/order-execution-screen.test.tsx:121-131` — el test de R15 pasa porque
  **dobla la accion** con un `mockResolvedValue` de exito que la accion real no emite. Verde siempre,
  rompa lo que rompa la produccion.
- `e2e/ejecucion-receta.spec.ts` — el unico test que recorre el camino real **no menciona**
  `ORDER_EXECUTION_CONFIRMATION_TESTID`: afirma el cambio de URL y el estado en base (lineas 373-375),
  nada mas. El E2E verde del leader **no cubre este hueco**, lo esquiva.

Es justo lo que la bitacora se compromete a no hacer: media conducta cubierta por un test **positivo**
que no puede ponerse rojo. La mitad «vuelve a la lista» si esta probada y verificada en navegador
real; la mitad «confirmacion visible» **no esta implementada de forma observable**, y su fila de T24
la presenta como *Ejecutable*.

**Que falta (una de las dos, no las dos):**

1. Hacer la confirmacion alcanzable —p. ej. que la accion devuelva el estado de exito y la navegacion
   la haga el `useEffect` que ya existe, o llevar la confirmacion a la lista de destino— **y** que el
   E2E de R29 la afirme; o
2. si se decide que el redirect basta, es **cambio de requisito**: lo cierra el humano, se corrigen
   R15 y `design.md` con fecha, se retiran el parrafo muerto y su test doblado, y la fila de T24 pasa
   a declarar lo que de verdad hay.

No lo arregla el reviewer: vuelve al implementer, y la opcion 2 pasa antes por el humano.

### menor 1 — `requirements.md` esta duplicado y deja una «Pregunta abierta» que ya no existe

El archivo repite **los 31 requisitos enteros** (lineas 193-347) bajo un encabezado roto
(`## Decisiones cerradas (no` seguido de `> reabrir)...`) y arrastra **dos** secciones
`## Preguntas abiertas` contradictorias: la primera dice «Ninguna» y la segunda reabre la del factor
que `[D17]` ya cerro. El contenido normativo se salva porque la tabla de decisiones esta completa y
al final, pero un spec leido de arriba abajo dice dos cosas distintas sobre la misma pregunta. Se
limpia sin tocar codigo.

### menor 2 — la primera consulta de `findUnitRefsSharingBaseInCompany` no pasa por el ambito

`lib/modules/unidades/adapters/driven/persistence/unit-prisma.ts`: la segunda consulta si compone
`companyScopeWhere({ companyId })` —y su test lo afirma—, pero la **primera**
(`prisma.unit.findMany` por `id: { in: unitIds }`, que lee `baseUnitId`) va **sin ambito**. Hoy no hay
fuga: los `unitIds` salen de las lineas de una receta ya acotada a la empresa del actor, y lo que
devuelve esa consulta solo alimenta el `where` de la segunda, que si filtra. Y `unidades` no tiene
guardia de ambito como la que QC-50 dio a `recetas`, asi que nada lo destapa. Es defensa en
profundidad, no agujero: se anota, no bloquea.

### menor 3 — el censo de sesion-por-peticion solo da de alta una de las dos acciones

`tests/unit/identity/session-once-per-request-actions.test.ts` anade `order-execution-actions.ts`
con `startAssignedOrderAction`. `finishAssignedOrderAction` resuelve el actor por la misma via y
**no se invoca** en el censo. El censo es por **archivo** —y por archivo el crecimiento es correcto
y muerde, lo comprobe—, pero la segunda accion no se ejercita.

### menor 4 — `(R44)` sobrevive en una linea que el diff reescribe

`lib/composition/index.ts`: el comentario de `recipeCatalog` gana una frase nueva y, al reflowarse,
la linea con la cita **preexistente** `(R44)` entra en el diff. La cita no la escribe esta ficha, y
los comentarios preexistentes que el diff no introduce no son hallazgo. Se anota para que la limpieza
por modulo de `composition` la recoja.

---

## Lo que verifique A FONDO (con mutacion propia o lectura del fuente linea a linea)

1. **Autorizacion (R5, R6).** `requirePermission(actor, 'asignaciones.consultar')` es la **primera
   sentencia del cuerpo** en los **tres** casos de uso —`get-assigned-order-execution.ts:40`,
   `start-assigned-order.ts:35`, `finish-assigned-order.ts:33`—, **antes** del `safeParse` y antes de
   cualquier `deps.`. El test de R5 monta **catorce dobles** de los cinco puertos y, tras el rechazo,
   afirma `not.toHaveBeenCalled()` sobre **todos**: es sobre los dobles del puerto, no en aislado ni
   como corte de ruta. R6 esta probado como indistinguible: con el pedido no asignado, el error es
   `order_not_found` **y** `findAliveById` no llega a llamarse.
2. **Ambito de empresa (R7).** `findRecipeExecutionContentById(id, companyId)` construye un
   `RecipeScope` local y lo mete en `findFirst` con `AND: [recipeCompanyScope(scope), { id }]`.
   **Mutado**: sustitui ese `where` por `{ id }` y se pusieron rojos **cuatro** casos —dos de
   `guard-ambito-empresa-recetas.test.ts` («declara el ambito pero no lo lleva hasta el punto unico»)
   y dos de comportamiento en `recipe-catalog.test.ts`, incluido «una receta de otra empresa devuelve
   null»—. Restaurado, arbol limpio. Ademas lei el bloque «NO hay lista de excepciones» de la
   guardia: barre `readdirSync` sobre persistencia y **no exime** al metodo nuevo.
3. **Matriz de transiciones.** `asignaciones` **no** decide legalidad: llama a
   `orders.transitionAliveById(...)`, y `assertTransition(from, to)` corre **dentro de `pedidos`**,
   primera linea de `transitionAliveOrder` y antes de tocar `prisma.order`. Lo unico que
   `asignaciones` compara por su cuenta es `ENTREGADO`/`CANCELADO` para delegar en
   `assertOrderAcceptsWrites` de `order-state.ts` (QC-87), que es literalmente lo que R14 exige y sale
   de la tabla unica de ese archivo, no de una segunda copia. `pedidos/module-contract.test.ts`
   mantiene la lista **exacta** de consumidores de `assertTransition` y crecio a tres, por ruta exacta.
4. **Cuatro de los siete censos, por mutacion propia.** Borre la entrada nueva de cada uno y corri los
   cuatro archivos: **6 casos rojos en 4 archivos**, cada uno con su mensaje propio.
   - `guard-pantallas-exigen-permiso.test.ts` -> «expected [...(12)] to deeply equal [...(11)]».
     Crece por **nombre exacto** `/asignacion/[id]`, con `toEqual`.
   - `guard-identificador-de-request.test.ts` (QC-71) -> «expected [Array(1)] to deeply equal []».
     Lista **cerrada**, alta por nombre de archivo. Comprobe ademas que el E2E nuevo **no** menciona
     `request-id` ni `reference`: el diferimiento de QC-71 R21 sigue intacto.
   - `recipe-route-contract.test.ts` (QC-64 R12) -> «el asistente solo se importa desde
     recipe-form.tsx». Crece a **dos montadores nombrados**, con `toEqual`, no `toContain`.
   - `asignaciones/module-contract.test.ts` -> rompe el caso principal **y sus dos mutaciones
     internas**. Los tres casos de uso entran por **archivo exacto**; la carpeta sigue prohibida y
     `list-order-responsibles.ts` sigue sin poder exigir el codigo.
5. **La guardia retirada.** Commit **propio** `8951b48`: **un solo archivo, 122 borrados, nada mas**;
   ningun otro archivo de `tests/guards/` en ese commit. Lei la guardia borrada entera desde
   `8951b48^`: su cabecera prescribe literalmente «retirar esta guardia EN ESA FICHA», y `[D8]` nombra
   a QC-63 como primer consumidor, asi que **la retirada estuvo justificada** — no la levanto como
   hallazgo. Tenia **dos** casos, y ninguno se pierde:
   - el negativo «nadie la usa» es hoy falso por decision de negocio;
   - el **anti-vacuidad** («sigue publicada desde el dominio») lo cubre
     `tests/unit/unidades/module-contract.test.ts:548`, que afirma que el barrel exporta
     `convertQuantity` desde `./domain/`;
   - el comportamiento sigue en `tests/unit/unidades/domain/convert-quantity.test.ts`.
6. **La enmienda a QC-88, contada por mi.** `expect(` antes (`git show origin/dev:<archivo>`) y
   despues: `assigned-order-enter-trigger.test.tsx` **11 -> 15**, `a11y-tactil.test.tsx` **7 -> 8**,
   `e2e/pedidos-asignados.spec.ts` **10 -> 11**. Cuadra con la bitacora. Lei el diff entero: la unica
   asercion retirada es `toBeDisabled()` —la conducta que la ficha cambia— y se sustituye por
   **cuatro** (`tagName === 'A'`, `href`, `not.toBeDisabled`, `not aria-disabled`). El spec de QC-88:
   `--numstat` da **6 lineas anadidas, 0 borradas**; **R21 y R23 no cambian ni una letra**.
7. **El factor degradado (R21).** Implementado de verdad, no simulado: `order-scale-banner.tsx`
   decide con `recipeBaseQuantity !== null && scaleFactorText !== null` y, siendo hoy los dos `null`
   por construccion en `get-assigned-order-execution.ts:118-119`, pinta **solo** la cantidad del
   pedido. **No se invento ninguna columna**: `db/` no aparece en el diff, y la ficha **QC-120**
   existe en el historial (`7756501`). Un test afirma que «sin cantidad base de receta no pinta ningun
   factor inventado».
8. **Las ausencias estructurales de T24.** Las cuatro son ausencias **reales**, no camufladas:
   R10 -> `db/` vacio en el diff; R31 -> de la lista de QC-88 solo se tocan los **dos** archivos que
   R27/R28 exigen, y `asignacion/page.tsx` y `lib/shared/routes.ts` **no estan en el diff**;
   R4 -> `lib/modules/identity/domain/permissions.ts` **no esta en el diff**, ni ningun archivo de
   permisos o de seed; R17 -> el barrel de `asignaciones` publica **solo** `get`, `start` y `finish`,
   sin ninguna operacion de reabrir. **La unica fila que si camufla una ausencia como test positivo
   es R15, y es BLOQ-2.**

## Lo que verifique POR LECTURA (sin mutar)

- Los **tres censos restantes**: `composition/asignaciones-facade.test.ts` (de seis a **nueve**
  operaciones, `toEqual` exacto, y **gana tres casos** de rechazo por permiso),
  `identity/session-once-per-request-actions.test.ts` (alta por **ruta exacta**, comparado contra el
  arbol) y `shared/data-table-alcance.test.ts` (de quince a **dieciseis**, `toEqual`). Ninguno usa
  patron, prefijo de carpeta ni `toContain`; los tres los corri **verdes** en el focalizado, pero su
  mutacion la doy por la del leader.
- `recetas/scope.test.ts` y `recetas/module-contract.test.ts`: crecen por **literal exacto**. Anoto el
  matiz de que `scope.test.ts` **exime** el archivo del barrido mientras `module-contract.test.ts` le
  **anade** una exigencia («consume `recetas` solo por su contrato publico»); como la cobertura queda
  en el segundo, no es hallazgo.
- El E2E nuevo, leido y no ejecutado (lo corrio el leader): estados leidos **de la base**, rutas desde
  `assignedOrderRoute`/`ASSIGNED_ORDERS_ROUTE` sin un solo literal, y rol efimero sin filas en
  `role_permissions` para R30.
- `page.tsx`: `requirePagePermission('asignaciones.consultar')` es la **primera linea**, antes de
  resolver `params`; sin literales de ruta.
- `docs/conventions.md > Comentarios` sobre **todo** el diff de produccion: un solo incumplimiento
  (BLOQ-1) y el arrastre de `(R44)` (menor 4).

---

## Para cerrar en verde

1. Borrar la cita `QC-63 T8` de `lib/modules/asignaciones/index.ts:125`.
2. Resolver R15: o la confirmacion se vuelve alcanzable y el E2E de R29 la afirma, o el humano cambia
   el requisito y se retiran el parrafo muerto y su test doblado.

Nada mas. Con esas dos, esta ficha pasa.

---

# Segunda revision — 2026-09-17

> Sobre el mismo worktree, rama `feature/QC-63-ejecutar-receta-operador`, HEAD `08f5612`, arbol
> limpio y al dia con `origin/dev`. **Acotada a lo que cambio desde `955ff28`** (3 commits:
> `3f75b9b`, `abc7873`, `08f5612`; 20 archivos). Lo que la primera vuelta dio por bueno y el diff
> nuevo no toca **sigue dado por bueno**.
>
> **No** se repitio el gate completo ni Playwright: los corrio el leader (519 archivos, 7495 tests,
> los cuatro E2E contra Chromium). Lo de aqui es focalizado con `--maxWorkers=2` y **cinco
> mutaciones propias**, cada una restaurada y con el arbol limpio al terminar.

## Veredicto

**OK.** Los dos bloqueantes estan cerrados y verificados contra el fuente, no contra la bitacora.
Quedan cuatro hallazgos `menor` nuevos, ninguno impide el merge.

## Cierre de los bloqueantes

### BLOQ-1 — CERRADO

`lib/modules/asignaciones/index.ts:125` ya dice «La pantalla de ejecucion. Bloque NUEVO al final:
...»: la cita `QC-63 T8` se fue y el resto del comentario, que describe el archivo, se quedo.

**Y no entro ninguna otra.** Barrido de los cuatro patrones (QC-n, R-n, design.md, «decision
cerrada») sobre **todo** el diff de produccion contra `origin/dev` (`app/`, `lib/`, `components/`):
**una sola linea**, la `(R44)` de `lib/composition/index.ts`, que entra solo por el reflow del
comentario. Es **preexistente**: `docs/conventions.md` dice que los comentarios que el diff no
introduce no se arrastran, y asi la clasifique en la primera vuelta (menor 4). **No es hallazgo
nuevo ni bloquea.**

Los comentarios que el diff nuevo **si** anade —el del componente del aviso, el del helper de
`page.tsx`, el de `DELIVERED_ORDER_PARAM` en `routes.ts` y la cabecera de
`finish-assigned-order.ts`— explican **por que**, sin una sola cita de ficha.

### BLOQ-2 (R15) — CERRADO

Verificado **contra el fuente**, punto por punto de lo pedido:

1. **Alcanzable en produccion.** La cadena completa existe y encaja:
   - `lib/modules/asignaciones/domain/finish-assigned-order.ts` devuelve el numero
     (tipo `FinishAssignedOrderResult`, campo `numberText`) en lugar de `void`;
   - `order-execution-actions.ts` desestructura ese `numberText` y redirige a la lista anadiendo
     `DELIVERED_ORDER_PARAM` con el numero pasado por `encodeURIComponent`;
   - `app/(private)/asignacion/page.tsx` lee el parametro y monta `AssignedOrderDeliveredNotice`,
     un parrafo con `role="status"` y `ASSIGNED_ORDER_DELIVERED_TESTID`.

   El aviso vive **en la lista al volver**, que es literalmente la decision del humano del
   2026-09-17. Ya no depende de ningun estado que la accion no pueda resolver.

2. **El numero se lee ANTES de transicionar.** La llamada a `listAliveSummariesByIds` esta **fuera y
   antes** del bucle de `transitionAliveById`, con el estado aun vivo, y va **con `actor.companyId`**:
   el aislamiento por empresa no se afloja. **R5 y R16 intactos**: `requirePermission` sigue siendo
   la primera sentencia del cuerpo, antes del `safeParse` y de cualquier `deps.`; no se persiste
   nada nuevo, la lectura es un SELECT. **R14 y el reintento por `stale` intactos**:
   `assertOrderAcceptsWrites` y el bucle no se tocan, y su test sigue afirmando dos vueltas.

3. **El test puede fallar, y el doble mentiroso desaparecio.**
   - En `tests/unit/asignaciones-ui/order-execution-screen.test.tsx` **ya no queda ningun
     `mockResolvedValue` de exito para `finish`**: el unico que queda emite un estado de error con
     `order_delivered_frozen` y se afirma el testid de error. El `describe` de R15, el `routerMock`
     y el `ORDER_EXECUTION_CONFIRMATION_TESTID` se fueron del archivo.
   - Los estados de exito que quedan en `tests/unit/asignaciones/order-execution-actions.test.ts`
     son el **argumento `prevState` ignorado** de la Server Action, no un valor devuelto por un
     doble. `order-execution-page.test.tsx:77` es de **`startAssignedOrderAction`**, otra accion,
     que si resuelve. `order-assignment-actions.test.ts` es de QC-86. Ninguno es `finish`.
   - El nuevo `order-execution-actions.test.ts` prueba **la accion REAL** con `redirect` doblado
     —que lanza, como el de Next—, no un doble de la accion.

   **Mutaciones propias, 3 de 3 rojas:**
   - quite el bloque del aviso de `page.tsx` -> `assigned-orders-delivered-notice.test.tsx`,
     **1 rojo** de 2;
   - quite el parametro del `redirect` de la accion -> `order-execution-actions.test.ts`,
     **2 rojos** de 3;
   - move la lectura del numero a **despues** de `transitionAliveById` ->
     `finish-assigned-order.test.ts`, **1 rojo**: el caso «lee el numero ANTES de transicionar»,
     que compara `invocationCallOrder`. El hueco de la primera vuelta esta tapado.

4. **Codigo muerto retirado de verdad.** En `order-execution-screen.tsx` se fueron el `useEffect`,
   el `useRouter`, el import de `ASSIGNED_ORDERS_ROUTE`, el texto de confirmacion, la constante
   `ORDER_EXECUTION_CONFIRMATION_TESTID` y el parrafo condicionado. El barrel de
   `[id]/components` deja de exportar el testid. `grep` sobre el arbol: **cero** ocurrencias de
   `ORDER_EXECUTION_CONFIRMATION_TESTID`.

5. **Spec y trazabilidad corregidos con nota fechada y sin borrar lo viejo.** `design.md` **tacha**
   la frase anterior en vez de borrarla y anade el bloque «CORREGIDO el 2026-09-17», que dice **por
   que** no podia funcionar, que la sustituye, las alternativas descartadas y la **consecuencia de
   alcance, declarada**. La fila R15 de la tabla de trazabilidad esta reescrita y nombra los tres
   tests —accion real, pagina real y E2E R29—, marcada *Ejecutable*, y ahora lo es.

6. **El E2E si lo afirma.** `e2e/ejecucion-receta.spec.ts:373-386` espera la URL **con**
   `DELIVERED_ORDER_PARAM` y ademas el aviso visible por `data-testid`, conteniendo el numero del
   pedido. Leido, no ejecutado: lo corrio el leader.

## Lo demas que cambio

### Octavo censo (`recipe-route-contract.test.ts`): no se afloja, y **QC-64 R12 sigue intacta**

La lista de exportadas de `lib/shared/routes.ts` sigue **cerrada** y por **`toEqual` de nombres
exactos**: crece de 19 a 20 con `DELIVERED_ORDER_PARAM` y una nota fechada que explica el alta.
**Mutado**: borre la entrada -> `AssertionError: expected [...(20)] to deeply equal [...(19)]`.
El resto del caso **no se toco**: sigue vivo el barrido por linea que prohibe que cualquier
constante o funcion exportada de ese archivo se llame como el asistente de lectura o apunte a una
URL suya. `DELIVERED_ORDER_PARAM = 'entregado'` **no marca ese patron ni es una URL**: es el nombre
de un parametro de consulta. No se anadio ninguna exencion. **R12 intacta.**

### Alcance ampliado: **acotado**, no me parece que se pasara

Entran `app/(private)/asignacion/page.tsx` y `lib/shared/routes.ts`, y es lo minimo que la decision
del humano obliga a tocar: la Server Action vive en `lib/` y la lista en `app/`, asi que el nombre
del parametro tiene que estar donde las dos puedan importarlo. En `page.tsx` el cambio son **tres
bloques**: el import, el helper de primer valor y el render condicional del aviso. **Ni la lista, ni
sus columnas, ni su paginacion, ni `assigned-orders-list-params.ts` se tocan** —verificado en el
diffstat y leyendo el archivo entero: sigue igual, y el aviso **no pasa por el**, de modo que el
parametro extra no puede alterar la paginacion—. `requirePagePermission('asignaciones.consultar')`
sigue siendo la **primera** sentencia, antes de resolver `searchParams`. La enmienda esta declarada
en `design.md` y las filas de R1, R15 y R31 se reescribieron en consecuencia. **Conforme.**

### MENOR-2: CERRADO, y ademas cubierto

La primera consulta de `findUnitRefsSharingBaseInCompany` ya compone el ambito de empresa junto al
filtro por `id`, y la cabecera del metodo se corrigio para decir «Dos consultas, LAS DOS con
`companyScopeWhere`». **Mutado**: le quite el ambito -> **4 rojos** en `tests/unit/unidades`, el
primero comparando el `where` desnudo contra el que lleva el `AND` con el `OR` de empresa. Ya no es
solo defensa en profundidad: esta probado.

### `requirements.md`: coherente

214 lineas, **una** sola vez cada requisito (R1-R31), **una** sola seccion «Preguntas abiertas»
—que dice «Ninguna» y remite a la fila del factor— y **una** tabla «Decisiones cerradas» con **18**
filas: 12 del 2026-09-08 y 6 del 2026-09-17. La duplicacion y la pregunta contradictoria de menor 1
desaparecieron. **menor 1 CERRADO.**

### Tasks

`tasks.md`: **24 de 24 en `[x]`**, ninguna sin marcar.

### Tests que corri

`tests/unit/asignaciones-ui`, `tests/unit/asignaciones`, `tests/unit/unidades` y
`recipe-route-contract.test.ts` con `--maxWorkers=2`: **50 archivos, 780 pasados, 6 saltados, 0
rojos**. El «connection terminated unexpectedly» que aparece en la salida es la traza que un caso de
`order-assignment-actions.test.ts` **espera** y afirma; el caso pasa.

### El descarte de los dos rojos de `ciclo-de-vida-de-la-base.int.test.ts`

**Me convence.** La rama **no toca** `db/`, ni `prisma/`, ni `scripts/`, ni ese archivo —comprobado
en el diffstat contra `origin/dev`—, y el unico adaptador de persistencia que cambia
(`unit-prisma.ts`) tiene su propia cobertura verde y mutada. Fuera del baseline, correcto.

## Hallazgos nuevos

### menor 5 — la cabecera de `order-execution-screen.test.tsx` remite al archivo equivocado

Dice «La confirmacion visible de R15 vive en la lista de pedidos asignados, no en esta pantalla: ver
`assigned-orders-states.test.tsx`». Ese archivo existe, pero **no** es donde vive ese test: es
`tests/unit/asignaciones-ui/assigned-orders-delivered-notice.test.tsx`. Una referencia cruzada que
manda a quien la siga a un archivo que no prueba lo que promete. Una palabra.

### menor 6 — `firstSearchParamValue` duplica `firstValue`, en la carpeta de al lado

`app/(private)/asignacion/page.tsx` define su propio «primer valor del parametro repetido» cuando
`./components/assigned-orders-list-params.ts` ya tiene `firstValue`, identico linea por linea. No es
dependencia de terceros ni bloquea; es la misma regla de dos copias que divergen en silencio. Se
resuelve exportando la que ya hay.

### menor 7 — el aviso confia en un parametro que cualquiera puede escribir a mano

Pedir la lista con el parametro puesto a mano pinta «Pedido <lo-que-sea> entregado» sin que se haya
entregado nada. **No es un agujero**: React escapa el texto —no hay `dangerouslySetInnerHTML`—, el
parametro no entra en ninguna consulta ni decision de negocio y no revela nada de otra empresa. Es
un aviso cosmetico falsificable por quien ya tiene sesion, y solo se enganaria a si mismo. Se anota
porque el dia que ese aviso quiera decir algo mas que «entregado», el numero tendra que venir
firmado o releerse del pedido.

### menor 8 — el caso de R5 no afirma el puerto nuevo

`finish-assigned-order.test.ts`, caso «R5: exige `asignaciones.consultar` ANTES de tocar ningun
puerto», sigue afirmando `not.toHaveBeenCalled()` sobre `listOrderIdsByUserInCompany`,
`findAliveById` y `transitionAliveById`, pero **no** sobre el `listAliveSummariesByIds` que esta
tanda estrena en el caso de uso. Hoy no puede llamarse —esta detras de las tres anteriores—, asi que
la conducta esta cubierta de hecho; es la red la que quedo un puerto mas corta que el caso de uso.
Una linea.

## Que verifique A FONDO frente a que por lectura

**A fondo, con mutacion propia, cada una restaurada y con el arbol limpio al terminar:**

- el aviso en `page.tsx` (1 rojo);
- el parametro en el `redirect` de la accion real (2 rojos);
- el **orden** lectura-antes-de-transicion en el dominio (1 rojo);
- el octavo censo de `routes.ts` (1 rojo, igualdad exacta, 20 contra 19);
- el ambito de empresa de MENOR-2 (4 rojos).

**A fondo por lectura linea a linea del fuente:** la cadena completa de R15 —dominio, accion,
pagina, componente—; la retirada del codigo muerto y el `grep` de cero ocurrencias del testid; el
barrido de los cuatro patrones de comentario sobre **todo** el diff de produccion contra
`origin/dev`; el caso del censo entero, para confirmar que no se anadio exencion y que el patron de
R12 no marca la constante nueva; `assigned-orders-list-params.ts` intacto; `requirements.md`
completo —secciones, conteo de requisitos y de decisiones—; `design.md`, `tasks.md` y la fila R15 de
la trazabilidad.

**Por lectura, sin ejecutar:** el E2E, que corrio el leader contra Chromium; y el gate completo, que
doy por el suyo.

## Para el merge

Nada bloquea. Los cuatro `menor` nuevos (5, 6, 7 y 8), mas los que quedaron de la primera vuelta
(menor 3 y menor 4), se pueden recoger en una ficha de limpieza o en la siguiente tanda del modulo;
ninguno pide otra vuelta de revision.
