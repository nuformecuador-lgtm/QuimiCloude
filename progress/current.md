# Sesión activa

> Estado vivo de lo que se está trabajando **ahora**. El leader lo mantiene al día.
> Al cerrar una feature se limpia de aquí y se resume en `history.md`.
>
> Este archivo arranca vacío: son solo los encabezados que el leader espera encontrar.
> No lo dejes crecer como bitácora — el historial completo vive en los PRs,
> en `progress/impl_*.md` / `review_*.md` y en `progress/history.md`.

## Features en curso

| key | feature | épica | zone | status | branch | quién la tiene |
|---|---|---|---|---|---|---|
| QC-50 | aislamiento-por-empresa-en-recetas | Multiempresa | backend | in_progress | feature/QC-50-aislamiento-por-empresa-en-recetas | **F1.0 y F1.1 hechos el 2026-09-16; siguiente paso F1.2 con `/afinar-feature`.** Elegida por el humano entre las candidatas: **cierra el hueco que QC-60 dejo declarado** —un pedido puede apuntar a una receta de otra empresa— y sigue el molde de QC-49 y QC-60. Worktree desde `origin/dev` en `db7634a`, que ya trae QC-60, con `.env` copiado. `zone:backend` y `complexity:medium` ya venian del board. `depends_on: QC-48, QC-32`, las dos `done`. **Cupo y conflicto**: `backend` tiene **1 `in_progress`** (QC-106, de la otra sesion, en F2.1), asi que cabe por numero, pero QC-106 escribe `db/schema.prisma`, `lib/composition/index.ts` y `lib/modules/errores/domain/error-codes.ts`, que QC-50 casi seguro tambien toca. **Solo Fase 1; F2.0 espera a que QC-106 mergee**, mismo criterio que QC-60 con QC-81. Se revalida contra el `tasks.md` cuando exista **F1.2 y F1.3 hechos el 2026-09-16; PARADA EN F1.4 esperando aprobacion humana.** Acotada hoy: **16 decisiones cerradas, cero abiertas**; la `description` del board se reescribio ANTES de sembrar. `spec_author` entrego **R1-R33** y **29 tasks** (commit `a839dc9`), con la **semilla verificada intacta por diff**. **El hallazgo que justifica la ronda**: el unico de nombre de recetas es **PARCIAL** (`WHERE deleted_at IS NULL`) y el de presentaciones que QC-49 uso de molde era **TOTAL**; copiarlo habria hecho que borrar una receta **NO liberara su nombre**, sin un solo test en rojo. **Seis listas cerradas con task propia**, dos dentro de `tests/unit/recetas/scope.test.ts` —una es el censo de E2E, el equivalente a lo que en QC-60 solo vio el gate completo—. Sin dependencias nuevas. **F2.0 NO arranca al aprobar**: espera el merge de QC-106. **Spec APROBADO por el humano el 2026-09-16** (F1.4), tarjeta en *En curso* (F2.0). **F2.1 EN ESPERA, y es deliberado**: QC-106 sigue `in_progress` y sin PR, y las dos escriben `db/schema.prisma`, `lib/composition/index.ts` y el catalogo de errores. Mismo criterio que QC-60 con QC-81. La zona `backend` queda con **2 `in_progress`** —el tope—, asi que ninguna otra ficha backend arranca hasta que una de las dos cierre. |
| QC-88 | listado-de-pedidos-asignados | Pedidos | fullstack | in_progress | feature/QC-88-listado-de-pedidos-asignados | **SPEC APROBADO por el humano el 2026-09-16** («continua con 88»), **adoptando las dos propuestas**: ruta **`/mis-pedidos`** con su constante -ningun archivo de producto lleva el literal- y **composicion desde `asignaciones`**, con `pedidos` aportando solo la lectura de catalogo en lote: **4 consultas constantes por pagina**. Si alguna no vale, el coste es una constante y el nombre de una carpeta, escrito en el spec. **F2.0**: tarjeta a *En curso*, cupo `fullstack` **1 de 2**. **5/18 tras T17** (`4a08623`). **T17 la escribio el `implementer` y la commiteo el leader**, porque el agente murio con el trabajo en disco sin commitear: **se agoto la cuota semanal de Opus** (no fue un fallo suyo). Se promovio `responsible-avatars.tsx` a `components/shared/`, con la guardia de QC-102 **enmendada con nota fechada** y **tensada** -sigue exigiendo que el resto de componentes de la ruta vivan en su carpeta-, y la bitacora dice explicitamente que **T17 NO cubre R18/R19**: solo habilita el componente; esas filas son T12/T14. **Gate de la tanda**: un rojo, `product-page.test.tsx` por **timeout de 20 s**, que **pasa solo 44/44** y no lo toca T17 -carga de maquina, como el falso rojo anterior-. **DECISION HUMANA 2026-09-16: seguir hoy con Sonnet.** Se relanza el `implementer` con ese modelo y el encargo **partido en dos**: fase 1 solo el merge de los 132 commits y las dos migraciones, con **parada obligatoria** para que el leader corra el gate; fase 2, las tareas. Historial: **F2.1 primera tanda: 4/18 (T1, T2, T3, T7)**, commits `1b0b16d`, `40f9f87`, `95afb58`; **`./init.sh --rapido` del leader verde** (2177 relacionados + 445 guardias). **El corte por QC-60 es MAS PROFUNDO de lo previsto: hay que parar antes de T4, no antes de T5** — T4 no toca ninguno de los dos archivos en disputa pero anade un metodo **requerido** a `OrderCatalog`, y sus tres implementadores solo vuelven a verde con la funcion que escribe T5; el `implementer` lo **midio** (3 `TS2741`), lo revirtio y cerro la tanda en verde. **12 tasks bloqueadas por QC-60 — BLOQUEO CAIDO el 2026-09-16**: QC-60 se mergeo (PR #77, `c93d916`) y con ella se desbloquean T4 y las 12. **La sincronizacion no es trivial**: **132 commits** por detras y **DOS migraciones nuevas** -`product_batch_lot_and_purchase_date` (QC-81) y `orders_company_scope` (QC-60)-, que hay que aplicar antes de verificar nada; los dos archivos en disputa **ya vienen cambiados desde `dev`**. **`orders` ya tiene `company_id`**, asi que toca revisar si la lectura en lote necesita el filtro de empresa que `design.md > 13` dejaba escrito. **Susto aclarado, y no fue el barrido**: el worktree de QC-60 desaparecio de disco mientras se trabajaba porque **la otra sesion lo cerro y lo desmonto** -su reflog muestra F2.4 y F2.6-, y en su sitio ya monto **QC-50**; el registro del barrido dice «VIVO, no se toca: QC-60» y cero borrados con esa clave, y su trabajo esta a salvo en `origin` y mergeado. **Senal de que la guardia de QC-104 funciona**: uno de los commits de QC-60 es «order-actions lee la sesion una sola vez dentro de runInRequestScope, y entra en la lista de QC-104». **T17 NO la bloquea QC-60**: QC-102 ya esta en `dev`, asi que **no hay deuda de duplicacion**, pero promover `responsible-avatars.tsx` pone rojo `order-route-contract.test.ts:157-192` (R36 de QC-102), que afirma sobre disco donde vive. **DECISION HUMANA 2026-09-16: se PROMUEVE y se enmienda el test con nota fechada**, tensando la guardia y probandolo por mutacion. **Tres desviaciones declaradas**: alcance ampliado a dos dobles que el sistema de tipos obliga a cerrar en el mismo commit; **no se monto base propia** -el proyecto de integracion ya crea una efimera por corrida (QC-77 R12) y una suelta seria basura-; y **R7 no se pudo probar como pedia la task** -«un usuario con filas en dos empresas» es inseedable porque la FK es compuesta-, asi que se cubrio por el lado que mata la mutacion mas un caso que demuestra la imposibilidad. **Trazabilidad parcial y declarada**: cubiertos R7-R10, R36, R37 y R15 parcial; el resto espera. **Error propio del `implementer`, anotado**: lanzo dos subagentes en paralelo sobre el mismo worktree y se pisaron. Se le recordo **H1** -reutilizar el caso de uso de responsables de QC-102 dejaria la columna vacia **en silencio** para el Operador, que no tiene `pedidos.consultar`: se reutiliza el metodo del puerto-, **H2** -la guardia se enmienda **tensandola**- y **H3** -dos tests se ponen rojos a proposito por el cambio de aterrizaje-. Historial: **F1.2-F1.3 hechos el 2026-09-15; PARADA EN F1.4 esperando aprobacion humana.** `spec_author` entrego **R1-R40** y **18 tasks** (`7970406`), **semilla verificada intacta por diff** -solo sale el marcador; 14 decisiones y 2 preguntas en pie-. **Las dos preguntas siguen abiertas, con propuesta**: ruta `/mis-pedidos` («Mis pedidos»), descartada `/pedidos/mios` porque cae dentro del prefijo de `ORDERS_ROUTE`; y **composicion desde `asignaciones`** con `pedidos` aportando solo una lectura de catalogo en lote -**4 consultas constantes por pagina**-, descartada la via de ampliar `pedidos` porque su caso de uso no podria exigir ninguno de los dos permisos sin romper R5. **Tres hallazgos que mirar al aprobar**: **H1** el caso de uso de responsables de QC-102 exige `pedidos.consultar`, que el Operador NO tiene, asi que reutilizarlo dejaria la columna vacia **en silencio** -se reutiliza el metodo del puerto, no el caso de uso-; **H2** la guardia de contrato de `asignaciones` marca hoy como hallazgo lo que la decision 9 exige y su comentario dice «Lo estrena QC-88», asi que se enmienda **tensandola**; **H3** la pantalla **cambia el aterrizaje del Operador** y pone rojos a proposito `e2e/permisos.spec.ts:214` y el ancla de 8 enlaces de `guard-nav-permisos-declarados`. **H7 comprobado por el leader y NO es deuda de esta ficha**: `docs/orquestacion.md` no existe en `dev`, solo en la rama del arnes sin mergear. Choca con **QC-60** en `db/schema.prisma` y `order-catalog-prisma.ts`: F2.0 espera. Sin dependencias nuevas ni migracion. Historial: **Acotada el 2026-09-15** (ver *Evaluaciones*): 14 decisiones cerradas, 2 abiertas -nombre de la ruta y donde se compone la lista-. **F1.0 y F1.1 hechos el 2026-09-15**: worktree desde `origin/dev` con `.env` copiado y la semilla commiteada en la rama (`dev` local la tiene en `4d2cc96`; `origin/dev` no). `zone:fullstack` ya venia del board y `complexity:high` se escribio al acotar. `depends_on: QC-86`, **`done`**. **Cupo `fullstack`: 0 de 2.** **Aviso para F2.0, mismo criterio que QC-60**: esta ficha leera pedidos y **QC-60 va a reescribir `orders` con `company_id`**, asi que se arranca **solo la Fase 1** -que no escribe produccion- y la implementacion espera a que QC-60 y QC-81 mergeen. Se revalida contra el `tasks.md` cuando exista. **F1.2 en curso**: `spec_author` |
| QC-63 | ejecutar-receta-operador | Recetas | fullstack | pending | feature/QC-63-ejecutar-receta-operador | **Acotada con `/afinar-feature` el 2026-09-08 y BLOQUEADA**: la acotación destapó que el Operador entra por **pedidos asignados**, no por recetas, y creó seis fichas (QC-83…QC-88). `depends_on: QC-62, QC-64, QC-88`. No arranca; worktree desmontado |
| QC-81 | lote-y-fecha-de-compra | Inventario | backend | done | feature/QC-81-lote-y-fecha-de-compra | **CERRADA el 2026-09-16** (PR #75, merge `6175700`): resumen en `progress/history.md`. Lo que sigue es historial y se borra en la proxima limpieza de este archivo. **REESCRITA EN EL WORKTREE el 2026-09-15**: las notas del leader vivian sin commitear en `progress/current.md` del **arbol principal**, y **se perdieron** cuando otra sesion hizo `checkout dev` ahi y mergeo. No estan en `stash@{0}` -comprobado: trae una fila vieja, sin gate, sin review y sin E2E- y **ese stash es ajeno, asi que no se toca**. Nada esencial se perdio: la bitacora y el informe estan **commiteados** (`3dc41be`, `6a111db`, `337cd87`) y las decisiones, en los comentarios del issue. **Desde ahora el estado se escribe en la copia del worktree, que viaja con el PR.** **F1.4 APROBADO el 2026-09-15**, con sus dos decisiones: T3 actualiza `inventario-schema.test.ts:1082` y **T0 = `batch_duplicate_lot`** (plan B descartado). **Implementacion**: T0-T14 y T16 hechas; **T15 NO APLICA** (P1 cerrada con D: no hay datos previos, «es nuevo todo»); **T12 sigue `[ ]`** hasta que el gate salga verde. **Dos enmiendas del spec, las dos aprobadas por el humano**: (1) **D13 con R34-R36**, un lote tecleado de solo digitos no llega a 60 caracteres, para que el siguiente generado quepa; (2) **D14 con R37**, la carrera entre el borrado logico de un producto y el alta de un lote sobre el, que se cierra con `FOR NO KEY UPDATE` sobre la fila del producto **antes** del lock del correlativo. **Excepcion acotada a R29** decidida por el humano: solo la siembra de `e2e/aislamiento-inventario.spec.ts`. **Tres vueltas de `reviewer`**: aprobo con 6 menores, rechazo por **B1** -comentarios citando fichas, contra la regla nueva de `docs/conventions.md`- y rechazo por **B2** -R37 fuera del mapa de trazabilidad-. **Los tres cerrados**: los 6 menores arreglados, **34 commits `chore`** que limpian los comentarios de los 32 archivos de la rama -solo quedan **3 citas exceptuadas** por el humano, que sus tests exigen- y el mapa en **37 declarados / 37 mapeados**. **Verificacion**: E2E **verde en Chromium y WebKit**; `--rapido` verde; **base propia `QuimiCloude_QC81`** montada -la receta de QC-77 **no corre hoy**, su seed muere con `The column 'existe' does not exist`, asi que se copio la plantilla ya migrada y sembrada-. **F2.3 hecha** (merge `1813910`, tip `337cd87` pusheado): un solo conflicto trivial en el E2E, **sin migraciones**, y **el rojo heredado de QC-95 MURIO** (`scope.test.ts` verde). **Gate completo corriendo** sobre la rama sincronizada; el anterior salio rojo **solo** por ese rojo ajeno, ya muerto, y por un timeout de maquina que repetido solo pasa 12/12. `origin/dev` avanzo otros 25 commits (QC-56, PR #74) que **no tocan el area de QC-81**: **no se re-sincroniza**. Acotada el 2026-09-13: **12 decisiones cerradas, cero abiertas**. La ficha estaba **derogada en su premisa**; el board se corrigio antes de sembrar y nacio **QC-103** con la pantalla. Cupo libre: cero `in_progress` en toda zona. `spec_author` entrego **R1-R33** y **13 tasks** (commit `be486b5`), **semilla verificada intacta por diff**, y cada decision citada como `[D1]-[D12]` en al menos un requisito. **La concurrencia se resuelve en la base**: `max(lot::bigint)+1` dentro de la misma transaccion que inserta, con `pg_advisory_xact_lock` por empresa **como sentencia anterior al SELECT** -en `READ COMMITTED` un lock pedido dentro del calculo leeria un maximo viejo-, e indice unico `(company_id, lot)` como garantia dura; choque en lote generado reintenta 3 veces, choque en lote tecleado **nunca** reintenta. **DOS COSAS ESPERAN DECISION HUMANA en F1.4**: (1) `tests/unit/inventario/schema/inventario-schema.test.ts:1082` **se pondra rojo por hacer justo lo que la ficha pide** -afirma que `lot` es opcional-, y T3 lo actualiza con el precedente del propio archivo; (2) `batch_duplicate_lot`, **sexta enmienda al catalogo cerrado de errores**, con plan B escrito. **Doce sitios asumen hoy `lot` nulo**, tabulados con `archivo:linea` en `design.md > 0`. Sin dependencias nuevas |
| QC-103 | lote-y-fecha-de-compra-en-el-alta | Inventario | fullstack | in_progress | feature/QC-103-lote-y-fecha-de-compra-en-el-alta | **SPEC APROBADO por el humano el 2026-09-16; F1.4 y F2.0 hechos, tarjeta en *En curso*.** **La validacion de interseccion de archivos con QC-88 SE HIZO y salio LIMPIA: cero archivos en comun** —QC-103 vive entero en `inventario`, QC-88 en `asignaciones`/`pedidos`, y `lib/composition/index.ts`, que es donde suelen chocar, lo toca QC-88 pero **no** QC-103—. Era el encargo que F1.0 no pudo cumplir por falta de `tasks.md`. `fullstack` queda en **2 de 2**: al tope pero **dentro de la regla**, asi que el validador sigue verde. **Sin dependencias que aprobar.** Historial: **F1.2 y F1.3 hechos el 2026-09-16.** `spec_author` —**corrido en SONNET**, con la cuota de Opus agotada— entrego **R1-R17** y **12 tasks** (`8eeb1e0`), con la **semilla verificada intacta por diff** —la unica linea borrada es el marcador— y las **9 decisiones citadas `[D1]`-`[D9]`**, ninguna huerfana. **Sin dependencias nuevas**: `react-day-picker` y `components/ui/calendar.tsx` ya existen y se reutilizan en modo `single`. **UN FALLO ATRAPADO EN VUELO**: el spec decia que el alta devolviera «el IDENTIFICADOR del lote» y lo que hay que mostrar es **el VALOR** —el texto, «51» o «ACME-2026-07»—; devolver el UUID interno de `product_batches` habria dejado la pantalla **sin poder nombrarlo**, que es justo el agujero por el que la ficha crecio a `fullstack`. Se le corrigio **antes de que escribiera el diseno encima**, asi que `design.md` y `tasks.md` no necesitaron cambios. Es la misma clase de fallo que la review de QC-106 cazo como **bloqueante**, esta vez cazado antes de llegar a codigo. **ENCARGO PARA F1.4**: al aprobar, `fullstack` queda en **2 de 2** con QC-88 —dentro de la regla pero al tope—, asi que **hay que cruzar los archivos de su `tasks.md` con los que QC-88 toca** antes de dar luz verde; es la validacion de interseccion que F1.0 no pudo hacer. Historial: **ACOTADA el 2026-09-16 con `/afinar-feature`: 9 decisiones cerradas, CERO preguntas abiertas** (ver *Evaluaciones*). **LA ZONA CAMBIO de `frontend` a `fullstack`** —board y JSON corregidos ANTES de sembrar—: «mostrar el lote que quedo asignado» **no se puede hacer solo desde la pantalla**, porque `createProduct` devuelve solo `{ id }` y `ProductView` no lleva el lote. **`complexity` sigue `medium`**: crece el alcance, no la dificultad. **Aviso de cupo para F2.0**: `fullstack` ya tiene a **QC-88**, asi que al arrancar quedaria en **2 de 2** —dentro de la regla, pero al tope— y hay que validar interseccion de archivos con QC-88 cuando exista `tasks.md`. Historial: **F1.0 y F1.1 hechos el 2026-09-16** (`prioriza inventario` del humano). Worktree montado desde `origin/dev` (`8033f7a`, que **ya incluye el merge de QC-106**) con `.env` copiado. Board y disco **coinciden**: *Por hacer*, `zone:frontend` ya venia del board, **sin comentarios en el issue**. **`complexity:medium` la asigno el leader** —varios archivos con logica condicional y arrastra un E2E; una sola zona y sin migracion ni integracion—, escrita en el JSON y como label. `depends_on: QC-81`, **`done` y mergeada hoy** (PR #75). **Cupo `frontend`: 0 de 2**, asi que no hay conflicto de numero; la validacion de **interseccion de archivos** no se puede hacer todavia —exige `tasks.md`, que no existe— y queda de encargo para **F1.4**, mismo criterio que en QC-106. **Siguiente paso: F1.2 con `/afinar-feature`**, y no por rutina: **la propia ficha lo pide por escrito** —«QUEDA POR ACOTAR: si el lote asignado se muestra en un aviso al terminar o en algun sitio fijo de la pantalla, y que se ve mientras el sistema lo esta generando»—. **Es la pantalla que QC-81 dejo fuera a proposito** para no cruzar de zona, con el mismo reparto que QC-87 -> QC-102, y **hereda el E2E que QC-81 difirio EXPRESAMENTE hasta aqui**, que `CHECKPOINTS.md` exige por ser un movimiento de inventario |
| QC-82 | registro-de-ejecucion-de-receta | Recetas | backend | pending | feature/QC-82-registro-de-ejecucion-de-receta | **Nacida del chat el 2026-09-08** y creada en el board (QC-27), enlazada «relates to QC-63». `complexity: medium`, sin dependencias. **Pendiente F1.0 y F1.2**: ampliada el 2026-09-08 con `canceled` en el enum y un `reason` anulable; cerrado que cancelar sin motivo no se puede; quedan SEIS preguntas abiertas -entre ellas si el motivo vale fuera de la cancelacion, que se guarda en el paso y que significa «el tiempo»-, asi que toca `/afinar-feature` antes del `spec_author` |

## Evaluaciones

### QC-103 - acotada con `/afinar-feature` (2026-09-16)

Alcance, **9 decisiones cerradas** y **cero preguntas abiertas** en
`.worktrees/QC-103-lote-y-fecha-de-compra-en-el-alta/specs/QC-103-lote-y-fecha-de-compra-en-el-alta/requirements.md`
(sembrado DENTRO del worktree, como QC-60 y QC-106). No se copian aqui.

**El board se corrigio ANTES de sembrar, y la acotacion CAMBIO EL TAMANO DE LA FICHA**: nacio
`frontend` y sale **`fullstack`**, porque se verifico en disco que **«mostrar el lote que quedo
asignado» no es alcanzable desde la pantalla** —`createProduct` devuelve solo `{ id }` y
`ProductView` no lleva el lote, solo `latestBatchUnitId`, asi que **ni releyendo el producto** se
obtendria—. La ficha **crece y se lo queda**, con el mismo criterio que **QC-102**; se descarto
sacarlo a ficha nueva como hizo **QC-85**, porque dejaria una pantalla donde el sistema asigna un
numero y no lo dice. **`complexity` se reevaluo y sigue `medium`**: el cambio de backend es devolver
un dato que ya se calcula, sin migracion, tabla ni regla nueva.

**Sin dependencias nuevas**: la fecha se escribe con el calendario de **`react-day-picker`**, ya
aprobado e instalado desde QC-55, asi que la regla 7 **no se activa**.

**De las dos preguntas abiertas que traia la ficha, una se cerro y la otra SE DISOLVIO**, y la
diferencia esta escrita en el archivo: donde se muestra el lote se cerro **en el aviso que el panel
ya da** (QC-22 R21), y «que se ve mientras se genera» **no tiene respuesta porque no hay ventana que
mirar** —el correlativo se genera dentro de la misma transaccion que inserta, en el servidor—.

**El E2E entra aqui**, que es donde QC-81 lo difirio expresamente. Ninguna ficha nueva y ninguna
cancelada. Sigue `pending` en Backlog: la mueve el leader en F1.3.

### QC-50 - seleccionada en F1.0 (2026-09-16)

Elegida por el humano. **QC-28 se salto a proposito aunque es la primera `pending` por numero**:
esta bloqueada por decision humana —la aprobacion de `@upstash/redis` en suspenso y sin la medicion
que la desbloqueaba, que QC-104 quito—, no por el cupo.

A diferencia de QC-60, **la ficha no miente en lo de las lineas**: `recipe_lines` existe. Lo que la
acotacion tiene que cerrar, con el molde de QC-49 y QC-60 a mano: que significa «una receta no puede
referirse a un producto de otra empresa» ahora que los productos tienen empresa (QC-49) y las
unidades la tienen OPCIONAL (QC-76); que pasa con los pedidos que ya apuntan a recetas, que es el
hueco que QC-60 dejo; y que «la base se siembra limpia» no es vaciar, como ya aclararon QC-49 y QC-60.

**ACOTADA con `/afinar-feature` el 2026-09-16**: alcance, **16 decisiones cerradas** y **cero preguntas
abiertas** en `.worktrees/QC-50-aislamiento-por-empresa-en-recetas/specs/QC-50-aislamiento-por-empresa-en-recetas/requirements.md`
(sembrado dentro del worktree). No se copian aqui. La `description` del board se reescribio ANTES de sembrar:
no decia que se cierra el hueco pedido → receta de QC-60. `zone`, `complexity` y `depends_on` siguen igual.

### QC-106 - acotada con `/afinar-feature` (2026-09-16)

Alcance, **18 decisiones cerradas** —el leader escribio «17» por un error de conteo propio, que
detecto `spec_author` al citarlas: la fila 18 es «Capas, borde e identificadores». Corregido en el
board y en disco; no cambia ninguna decision— y **3 preguntas abiertas** —ninguna bloquea— en
`.worktrees/QC-106-endpoint-de-carga-de-pdf/specs/QC-106-endpoint-de-carga-de-pdf/requirements.md`
(sembrado DENTRO del worktree, como QC-60). No se copian aqui. **El board se corrigio ANTES de
sembrar**: la `description` declaraba abiertas las cuatro cosas que esta acotacion cerro y llamaba
«endpoint» a lo que acabo siendo subida firmada directa; `zone`, `complexity` y `depends_on` siguen
igual. **Ninguna ficha nueva y ninguna cancelada.** Sigue `pending` en Backlog: la mueve el leader
en F1.3. **Entra dependencia nueva** —`unpdf` + `@napi-rs/canvas`, cuatro checks verificados ese
dia— que **aprueba el humano en F1.4**, y ademas hay que **actualizar la fila de
`@supabase/storage-js`**, que hoy afirma que la consume un solo archivo.

### QC-106 - seleccionada en F1.0 CON EL CUPO LEVANTADO (2026-09-16)

`arranca 106` del humano. Ficha de la epica **QC-105 *Documentos e IA***, nunca acotada y **sin
comentarios en el issue**. Board y disco **coinciden**: *Por hacer* / `pending`, labels `sdd`,
`slug:endpoint-de-carga-de-pdf` y `zone:backend`, **sin `complexity`**. No hizo falta reimportar F0
para comprobarlo: se leyeron las diez fichas implicadas contra el board y ninguna diverge.

**LA REGLA 1 SE LEVANTO, Y NO POR DESCUIDO.** `backend` tenia **2 de 2** `in_progress` —QC-60 y
QC-104, las dos tambien en *En curso* en el board—, asi que QC-106 **no pasa la condicion (a) del
filtro de seleccion de F1.0** y el flujo normal era saltarla. Se le ofrecio al humano el precedente
de QC-60 y QC-88 —correr **solo la Fase 1**, que no escribe una linea de produccion, y dejar F2.0
esperando— y **eligio ciclo completo levantando el cupo**. Queda escrito lo que eso cuesta:
`backend` pasara a **3 `in_progress`** y `scripts/validate-features.mjs` **marcara la regla en rojo**
en cuanto la ficha entre en F2.0. `frontend` y `fullstack` estan a **0** —QC-88 y QC-96 estan en
`spec_ready`, que no cuenta cupo—, asi que la alternativa de arrancar por zona libre existia y se
descarto a proposito.

**Conflicto de archivos: no evaluado todavia, y no puede estarlo.** La validacion del paso 2 de
`AGENTS.md > Paralelismo` se hace contra `specs/<feature>/tasks.md`, que aqui **no existe**. Queda
como encargo explicito para **F1.4**: antes de aprobar el spec, cruzar los archivos de su `tasks.md`
con los que estan tocando QC-60 y QC-104. A favor juega que el area es **nueva** —no hay modulo de
documentos— y en contra que casi todo lo transversal pasa por `lib/composition/index.ts`, que es
justo donde chocaron QC-60, QC-81 y QC-104.

**Lo que esta ficha NO puede dar por supuesto** y va entero a la acotacion, empezando por lo que la
propia `description` declara abierto —libreria concreta, limites por archivo, quien puede subir y
formato de las imagenes—: que queda del Supabase Storage que monto **QC-25** para la imagen de
receta y si su bucket sirve o hace falta uno **privado** nuevo; si el aislamiento por empresa llega
al almacenamiento o solo a las tablas; y **que significa «temporal»** —quien borra esos PDFs y
cuando—, que la ficha no dice y nadie mas tiene. El **cambio del 2026-09-14** ya esta incorporado en
la `description`: la conversion **no** viaja en la respuesta de la subida, la ejecuta la cola de
QC-111.

**Entra dependencia nueva por la regla 7** (PDF -> imagen y PDF -> texto): cuatro checks de salud
verificados **el dia que se aprueba**, fila en `docs/dependencias.md` y aprobacion humana. El
precedente a no repetir es **QC-28**, cuya aprobacion de `@upstash/redis` quedo en suspenso y caduca.

**Estado del arbol principal, medido hoy**: `origin/dev` va **65 commits por delante** del `dev`
local, y el local tiene **6 sin pushear**. El worktree nace de `origin/dev`, asi que arranca al dia;
el arbol principal **no**.

**PREMISA COMPROBADA EN DISCO ANTES DE ACOTAR** (leccion de QC-23, QC-81 y QC-102, que llegaron las
tres con la premisa derogada). Aqui **no esta derogada, pero SI esta mal apoyada en cuatro puntos**,
y los cuatro van a la acotacion:

1. **El «bucket privado de Supabase Storage» NO existe, y pedirlo REABRE UNA DECISION HUMANA.** QC-25
   monto un bucket **PUBLICO** y descarto **a conciencia** el bucket privado con enlace firmado y
   temporal: `specs/QC-25-crud-de-recetas/design.md:597` («descartada por el humano»), `:599` («**era
   la recomendacion tecnica** y el humano la descarto»), `:474` («sin firma y sin caducidad»). En
   codigo: `recipe-image-supabase.ts:61` usa `getPublicUrl` y **no hay ni una** llamada a
   `createSignedUrl` o `download` en todo el repo. QC-106 **no reutiliza** lo de QC-25: construye
   infraestructura nueva y contradice esa eleccion. Hay que preguntarlo, no asumirlo.
2. **«Endpoint» no tiene precedente en disco**: `app/api/` **no existe** y no hay **ni un** Route
   Handler; todo entra por **Server Actions** con `Uint8Array` tipado, no `FormData`
   (`recipe-actions.ts:34-39`). Y ahi esta el problema medible: el limite por defecto de
   `serverActions.bodySizeLimit` es **1 MB**, `next.config.ts` esta **vacio** y **no hay ningun
   limite de subida configurado en ninguna capa**. Diez PDFs por tanda no caben. Ya estaba anotado
   como riesgo abierto en `specs/QC-62-pasos-de-receta-enriquecidos/design.md:106-107`.
3. **No hay patron reutilizable de subida ni modulo donde vivir.** Lo unico existente es el puerto
   **especifico de recetas** `RecipeImageStorage`, con la ruta cableada a `recetas/<uuid>.<ext>` y la
   extension limitada a `'jpg'|'png'|'webp'` (`recipe-image-storage.ts:11`). No existe modulo
   `documentos`; crear uno es legal (`guard-arquitectura-modulos.test.ts:202-207`: solo `identity` e
   `inventario` son obligatorios) y es lo razonable. Ademas la fila de `@supabase/storage-js` en
   `docs/dependencias.md:32` dice que **la consume un solo archivo**: un segundo consumidor **obliga a
   actualizar esa fila**.
4. **«Quien puede subir» choca con un catalogo CERRADO.** `permissions.ts:8` declara «quince
   permisos, ni uno mas ni uno menos»; no existe `documentos.*` y ampliarlo exige **migracion + seed**
   (`:36`) y toca cinco guardias. **Y el almacenamiento no esta aislado por empresa hoy** —la ruta no
   lleva `company_id` y el bucket es publico—, asi que si los PDFs temporales deben aislarse hay que
   decidirlo **desde cero**, incluido dar `companyId` al `Actor` del modulo nuevo: hoy **solo el
   `Actor` de `identity` lo lleva**.

**Y un dato operativo**: el `.env` de este arbol **no tiene** las tres `SUPABASE_STORAGE_*`. En esta
maquina el Storage no esta configurado **ni siquiera para recetas**, asi que nada de esto se puede
probar contra Supabase real sin pedirlas.

### QC-88 - acotada con `/afinar-feature` (2026-09-15)

Alcance, **14 decisiones cerradas** y **2 preguntas abiertas** -nombre de la ruta y donde se compone la lista- en `specs/QC-88-listado-de-pedidos-asignados/requirements.md`. **El board se actualizo ANTES de sembrar**: `description` reescrita y `complexity:high` (nacio sin ella). **Lo que la acotacion midio en disco y decide el tamano**: la consulta «los pedidos de esta persona» **no existe** -el puerto de `asignaciones` solo va al reves- y el listado de `pedidos` **no filtra por un conjunto de ids**, con el JOIN prohibido por QC-33 R53. **Tres decisiones humanas**: pantalla propia con `asignaciones.consultar` -reutilizar `/pedidos` exigiria darle al Operador un permiso que le abre todo el listado-, la lista **deshabilita** el pedido ya tomado y la regla de servidor queda en QC-63, y **no se guarda quien abrio el pedido**: se muestran los responsables en vez de afirmar algo que el sistema no sabe. Ninguna ficha nueva y ninguna cancelada. Sigue `pending` en Backlog.

### QC-60 - CERRADA el 2026-09-16 (PR #77, merge `c93d916`)

Resumen completo en `progress/history.md`. Lo que sigue abierto va en *Deudas*.

### F0 rehecho y `feature_list.json` reimportado (2026-09-15)

El disco iba por detras del board: faltaban **9 fichas** (QC-106 a QC-111, QC-113 a QC-117) y siete estados estaban viejos. Causa: el arbol principal cambio de la rama del arnes a `dev` y las ediciones sin commitear quedaron dentro del commit `0de0a83` («test: opencode») de esa rama. **F0 reimportado: 105 fichas**, validador en verde. **Aviso, no lo toque el leader**: la tabla de *Features en curso* de arriba sigue mostrando QC-101, QC-93 y QC-102 como en curso, y las tres estan mergeadas; esas filas son de la otra sesion. **Trampa que costo una corrida**: la primera importacion se hizo con una consulta limitada a 100 resultados y **borro las 5 fichas de clave mas alta**; se restauro desde copia y se rehizo pidiendo el board en dos tramos. El board tiene 105 no-epicas, comprobado con un conteo aparte.

### QC-56 - acotada con `/afinar-feature` (2026-09-15) y CERRADA

Alcance, **16 decisiones cerradas** (D12-D16 las anadio F1.4) y **cero preguntas abiertas** en `specs/QC-56-migrar-listas-a-tabla-compartida/requirements.md`. **La premisa estaba medio derogada**: productos ya se habia migrado en `749d850` fuera del flujo de fichas, y dos documentos afirmaban que recetas tambien, lo cual era falso. El board se reescribio antes de sembrar -titulo, `description` y `complexity:medium`- y **nacio QC-114** con la prueba en iPhone real que QC-55 arrastraba desde el 2026-09-04. **Mergeada el 2026-09-16** (PR #74, `dc73f14`); resumen completo en `history.md`.

### QC-104 - acotada con `/afinar-feature` (2026-09-15)

Alcance, **11 decisiones cerradas** y 1 pregunta abierta en `specs/QC-104-sesion-una-sola-vez-por-peticion/requirements.md`, mas la **revision de F1.4**: el humano **quito los tiempos** («la idea es solo evitar llamados innecesarios a la db»), asi que salieron R17-R19, T9 y esa pregunta. Queda el test del gate y una comprobacion una vez en la app real. **Spec APROBADO**, pero **BLOQUEADA antes de F2.0** por conflicto de archivos con QC-81 en `product-actions.ts`. **Efecto en otras fichas**: QC-28 pierde su condicion -ya no habra numero de tiempos, comentado en su issue- y **el punto 2 de QC-97 lo absorbe QC-104**, tambien escrito en el board.

### QC-28 - acotada con `/afinar-feature` (2026-09-13)

Alcance, **9 decisiones cerradas** y **cero preguntas abiertas** en
`specs/QC-28-cache-de-sesion-en-redis/requirements.md`. No se copian aqui.

**La premisa se comprobo ANTES de acotar, y esta vez SI estaba viva**: `resolveSession()` lee los
claims de la cookie y **consulta la base** en cada peticion (`lib/composition/index.ts:296`). Se
comprobo porque **QC-23, QC-81 y QC-102 llegaron las tres con la premisa derogada**; esta no.

**Lo que la acotacion evito**: la ficha es del 2026-09-02 y enumeraba dos motivos de borrado -baja y
cambio de rol-. **QC-23 cerro despues y trajo la revocacion de sesiones**, que la ficha no podia
mencionar. Sin anadirla, **QC-28 habria debilitado una garantia recien construida**: revocar habria
tardado hasta un minuto en surtir efecto, apoyado solo en el TTL que la propia ficha dice que **no
es el mecanismo principal**. La invalidacion pasa a cubrir **seis** caminos. El board suma
`depends_on: QC-23` con su enlace «is blocked by».

**Dependencia APROBADA por el humano**: `@upstash/redis`, con **los cuatro checks verificados contra
el registro de npm ese mismo dia** -sin `deprecated`, `1.38.4` del 2026-09-04, **3.811.925**
descargas semanales, **MIT**-. Es el cliente **REST**: no mantiene conexiones TCP abiertas, que es lo
que rompe a los clientes Redis clasicos en funciones. **Su fila en `docs/dependencias.md` la escribe
el leader en F1.4**, como QC-25 y QC-55.

**Y una decision que existe por el gate**: la cache entra **por un puerto**, con adaptador **en
memoria** en tests y local. `./init.sh` corre **sin red**, asi que sin el puerto ningun test podria
ejercitar caducidad, invalidacion ni respaldo, y el unico sitio donde ese codigo correria seria
produccion.

`zone` sigue **`backend`** -el E2E que entra es un test, no una pantalla- y `complexity` sigue
**`high`**.

**Y DESPUES DE CERRAR LAS NUEVE, el humano pregunto «¿para que el Redis?» y la ficha quedo
CONDICIONADA A UNA MEDICION.** Es el hallazgo mas util del dia y nacio de esa pregunta, no de la
acotacion:

- **La ficha daba por hecha la conclusion.** No hay **ni un numero** que la sostenga, ni en la
  tarjeta ni en el repo, y la app **no tiene carga real**. Ademas el cliente REST de Upstash **es
  tambien una llamada de red**: no se cambia red por memoria, se cambia Postgres-por-red por
  Redis-por-HTTP, y que eso gane depende de las regiones y de que Postgres sea el cuello de botella.
  **Ninguna de las dos cosas esta medida.**
- **El diagnostico se quedaba corto, y eso SI esta medido**: la sesion se resuelve **DOS O TRES
  VECES POR PAGINA** -`layout.tsx:59`, el `requirePagePermission` de cada `page.tsx`, y una tercera
  en `/configuracion/usuarios`- **sin ninguna memoizacion**, y cada una trae `users` + `role` + sus
  permisos + `company` + `revoked_sessions`.
- **Nace QC-104** (`sesion-una-sola-vez-por-peticion`, `backend`, sin `complexity`), enlazada
  «blocks» hacia QC-28: colapsar esas repeticiones dentro de la misma peticion. Sin servicio, sin
  dependencia, sin riesgo en la autenticacion, y **no puede quedarse obsoleto por construccion**.
  **Deja ademas la medicion que QC-28 no tiene.**
- **La aprobacion de `@upstash/redis` queda EN SUSPENSO**: no se instala nada, y sus cuatro checks
  **se vuelven a verificar en F1.4**, porque para entonces estaran caducados.

QC-28 sigue `pending` en Backlog y **no pasa a `spec_author`**; QC-104 nace `pending`. La semilla
lleva el aviso en su cabecera y las tres decisiones nuevas (10 a 12) al final de su tabla.

### QC-102 - acotada con `/afinar-feature` (2026-09-13)

Alcance, **13 decisiones cerradas** y **cero preguntas abiertas** en
`specs/QC-102-responsables-en-la-pantalla-de-pedidos/requirements.md`. No se copian aqui.

**El board se corrigio ANTES de sembrar, y la acotacion CAMBIO EL TAMANO DE LA FICHA.** Nacio como
`frontend`/`medium` y sale como **`fullstack`/`high`**, porque se verifico en disco que **el listado
no tiene de donde sacar los responsables**: `OrderView` tiene catorce campos y ninguno de
asignacion, el modulo `pedidos` no tiene **ni una** referencia a `orderAssignment`, y lo unico que
QC-87 publico recibe **un** `orderId`. La `description` prometia el listado, asi que mentia. Los tres
labels y la `description` entera se reescribieron en el issue antes de escribir el archivo.

**Es el mismo golpe que se llevo QC-85** con el conteo de personas por grupo, y se resolvio al
reves: alli el dato salio del alcance y nacio QC-100; aqui **la ficha crece y se lo queda**, por
decision humana. El camino es **una consulta EN LOTE por pagina**, compuesta como ya se compone
`recipeName` en `list-orders.ts` — **ni un JOIN** (R53 y QC-33 R31/R32 lo prohiben, y QC-33 dejo las
FK como escalares sin `@relation` justamente para eso) **ni una consulta por fila**.

**Dos cosas que la acotacion evito construir de mas**: el nombre del grupo **no necesita ningun
join** porque QC-86 lo congelo dentro de la fila, y **abrir el panel no cuesta consulta** porque la
fila ya trae sus responsables.

**Una decision humana contra el precedente, escrita con su consecuencia**: en un pedido `ENTREGADO`
o `CANCELADO` los controles de asignar **no aparecen y sin frase**, aunque la misma fila **si**
explica por que no se puede editar (`FINAL_ORDER_REASON`). Queda anotado que la pantalla explicara
una cosa y callara la otra.

**Nota heredada al `design.md`**: `asignaciones` **ya depende de `pedidos`**, asi que la consulta en
lote **no puede crear un ciclo** `pedidos -> asignaciones`. Donde se compone lo decide el diseno.

Ninguna ficha nueva y ninguna cancelada. Sigue `pending` en Backlog: la mueve el leader en F1.3.

### QC-101 - acotada con `/afinar-feature` (2026-09-13)

Alcance, **10 decisiones cerradas** y **cero preguntas abiertas** en
`specs/QC-101-cierre-de-sesiones-de-otro-desde-la-pantalla/requirements.md`. No se copian aqui.

**El hallazgo que justifica la acotacion: la ZONA estaba mal.** La ficha nacio `frontend` creyendo
que solo faltaba un boton, y **falta tambien la puerta por la que ese boton llama**: el caso de uso
`end-all-sessions` existe en el dominio y esta probado, pero **nada lo expone** —no hay Server
Action—. Pasa a **`fullstack`** e incluye esa accion, en vez de partir una ficha `backend` de un
solo archivo que no le sirve a nadie sola.

**TRES de las cinco preguntas abiertas las contesto el disco, no el humano**, y esa es la otra
mitad del valor: no hay menu de fila —son tres botones de icono en `user-row-actions.tsx:98,110,122`
y la pregunta daba por hecho un menu inexistente—; no se puede saber si no habia ninguna sesion
abierta, porque `end-all-sessions.ts:64` devuelve `void`; y **no existe ninguna lista de sesiones
vivas**, porque la revocacion es un **sello de tiempo** y QC-23 descarto esa lectura a proposito.
Preguntarlas habria sido pedirle al humano que decidiera sobre cosas que el codigo ya cerro.

**El board se actualizo ANTES de sembrar**: `zone` a `fullstack`, `complexity:medium` —nacio vacia
a proposito— y la `description` reescrita. **Ninguna ficha nueva y ninguna huerfana**: QC-53 sigue
siendo el boton del propio usuario, y ahora ademas es donde vive la autoaplicacion que aqui se
excluye. Sigue `pending` en Backlog.

### QC-81 - acotada con `/afinar-feature` (2026-09-13)

Alcance, **12 decisiones cerradas** y **cero preguntas abiertas** en
`specs/QC-81-lote-y-fecha-de-compra/requirements.md`. No se copian aqui.

**Se acoto porque la ficha estaba DEROGADA en su premisa central**, no por rutina: se escribio el
2026-09-08 diciendo que el lote es un campo de `products` y que habia que esperar a que esa tabla
tuviera `company_id`. **QC-90 ya trajo los lotes** —`product_batches.lot`, anulable y sin
correlativo— y `product_batches` **ya tiene** `company_id` desde QC-49. Es la misma trampa que costo
una ronda entera en QC-23: un spec contra un `dev` que ya no existe.

**El board se actualizo ANTES de sembrar, en dos sitios.** (1) La `description` de QC-81, reescrita
con el alcance cerrado. (2) **Ficha nueva QC-103** (`lote-y-fecha-de-compra-en-el-alta`, `frontend`,
«is blocked by QC-81»), porque la pantalla salio del alcance: mismo reparto que QC-87 → QC-102.
Nace `pending` en Backlog, **sin `complexity`** —la asigna el leader en F1.0— y **sin sembrar**.

**Una decision cambia lo que cerro QC-90**: el lote pasa a **obligatorio** y los vacios se rellenan
al migrar. QC-90 lo habia dejado opcional a proposito, asi que se pregunto en vez de darse por hecho.

**El E2E se difiere a QC-103 con motivo**, no por descuido: aqui no hay recorrido nuevo que mirar.
Lo que se exige es **integracion contra base real**, incluidas **dos altas compitiendo por el mismo
numero**.

### QC-93 - acotada con `/afinar-feature` (2026-09-13)

Alcance, **10 decisiones cerradas** y **cero preguntas abiertas** en
`specs/QC-93-aterrizaje-sin-permiso-de-modulo/requirements.md`. No se copian aqui.
**El board se actualizo ANTES de sembrar, y por dos motivos**: la ficha nacio sin `complexity`
-gana `complexity:medium`- y su `description` **mentia en dos datos**, que se corrigieron: son
**cuatro** los casos de «acaba fuera» y no tres -faltaba `e2e/recetas.spec.ts:376` (R6)-, y el dano
real son **23 fallos** en trece suites sobre base limpia. Ninguna ficha nueva y ninguna cancelada:
QC-93 **absorbe** el hallazgo de los 23 que reporto la sesion de QC-85 y que no tenia ficha. Sigue
`pending` en Backlog.

### QC-23 — re-acotada con `/afinar-feature` (2026-09-12) y F1.0 rehecho

**Por que se re-acoto en vez de aprobarse.** Llego a F1.4 esperando el «aprobado» del humano, y al
revisarlo antes de pedirselo aparecio que el spec era del **2026-09-03**: **cero menciones** a
QC-65, QC-66, QC-67, QC-70, QC-71, QC-78 y QC-79, todas mergeadas despues. Ademas **una de sus dos
preguntas abiertas ya era falsa** —decia que no habia pantalla de administracion de usuarios—.
Aprobarlo habria sido aprobar un spec que contradice lo que ya existe en `dev`.

**De las cuatro decisiones que se tomaron, solo DOS eran preguntas de verdad**: que corta las
sesiones ahora que hay cuatro estados de cuenta y borrado logico, y si cambiar la contrasena corta
sesiones. Las otras dos las contesto la realidad (el boton del administrador ya tiene donde vivir) y
el catalogo de QC-70 mas el identificador de QC-71, que son obligaciones y no opciones.

**`complexity: high`** reevaluada, no heredada: sigue siendo alta aunque el boton salga fuera —sube
la version del token, anade tabla y migracion, y cruza con tres caminos de cambio de contrasena—.

**La rama se REHIZO desde `origin/dev`, no se mergeo** (decision humana). Costaba perder de vista el
spec anterior, asi que sus tres archivos quedan en la etiqueta publicada
**`spec-descartado/QC-23-2026-09-03`**, con el motivo del descarte escrito en el mensaje de la
etiqueta.

**Worktree con base propia `QuimiCloude_QC23`** —la leccion de QC-79, que corrio integracion contra
la compartida hasta que se cambio—. Al montarla, **la migracion de QC-49 se planto a proposito**
sobre la base vacia pidiendo la empresa inicial por su nombre y con el comando exacto: se detiene
ENTERA en vez de dejar el esquema a medias. Seed, `migrate resolve --rolled-back` y las 27 aplicadas.

**Ficha nacida de la re-acotacion: QC-101** (`cierre-de-sesiones-de-otro-desde-la-pantalla`,
`frontend`, bloqueada por esta).


### QC-77 - acotada con `/afinar-feature` (2026-09-12)

Alcance, **11 decisiones cerradas** y **dos preguntas abiertas con respuesta por defecto** en
`specs/QC-77-aislamiento-de-la-base-en-tests-de-integracion/requirements.md`. No se copian aqui.
El board se actualizo ANTES de sembrar: la ficha nacio sin `complexity` a proposito -era una de las
cosas por decidir- y gana ahora el label `complexity:medium` mas el parrafo de alcance cerrado en su
`description`. Ninguna ficha nueva y ninguna cancelada. Sigue `pending` en Backlog: la mueve el
leader en F1.3.

### QC-85 - acotada con `/afinar-feature` (2026-09-12)

Alcance, **13 decisiones cerradas** y **cero preguntas abiertas** en
`specs/QC-85-pantalla-de-grupos-de-trabajo/requirements.md`. No se copian aqui.

**El board se actualizo ANTES de sembrar, y por dos motivos distintos.** (1) La `description`
dejaba abierta la decision de pantalla propia contra seccion dentro de usuarios: se cerro como
**pestana dentro de `/configuracion/usuarios`**, asi que el menu no gana ningun item. (2) Pedia
que cada grupo mostrara **cuantas personas tiene**, y eso **no es alcanzable desde el frontend**:
`WorkGroupRow` tiene exactamente `id` y `name`, con un test que congela esas claves. El conteo
salio del alcance y nacio **QC-100** (`fullstack`, bloqueada por QC-84) para devolver visibles y
totales y pintarlos como «3 de 5». QC-85 gana ademas **QC-67** en `depends_on`: la pestana vive
dentro de esa pantalla.

**Se cierra de paso la pendiente que dejo QC-84**: el nombre de solo signos se ataja en el
formulario -al menos una letra o un numero, dicho mientras se escribe-, **sin tocar el backend**,
porque es validacion de entrada y no una regla nueva de dominio.

**Y el E2E entra aqui**, que es donde QC-84 lo difirio expresamente.


## Deudas y cosas abiertas

### El worktree de QC-106 quedo a medio borrar — CUARTA vez con el mismo fallo (2026-09-16)

Tras QC-23, QC-102 y QC-81. Al cerrar (F2.5), `./scripts/wt.sh done QC-106-endpoint-de-carga-de-pdf`
respondio `is not a working tree` y aviso de un posible archivo en uso en Windows. **No es un HOLD de
las cuatro guardas**: el worktree ya estaba **desregistrado** —no aparece en `git worktree list`— y
el borrado del directorio se quedo a medias.

**No hay trabajo que perder**: la rama esta mergeada (PR #78, `8033f7a`) y todo su contenido esta en
`origin/dev`. Quedan **19 entradas de residuo** en `.worktrees/QC-106-endpoint-de-carga-de-pdf/`
—`node_modules`, configuraciones, sin `.git`— y la **rama local `feature/QC-106-endpoint-de-carga-de-pdf`
sigue viva** pese a estar mergeada. No se borra a mano sin decision humana, que es la regla de
`docs/worktrees.md` para un worktree retenido: `rm -rf` del directorio y `git branch -d` de la rama.

**Lo bueno**: el resto del residuo que arrastraba este archivo **ya no esta**. `.worktrees/` solo
contiene hoy este y los **cuatro worktrees vivos** (QC-36, QC-50, QC-88, QC-96), asi que alguien
barrio QC-23, QC-56, QC-81, QC-93, QC-95, QC-101 y QC-102. Las entradas viejas de esta seccion que
los nombran se pueden borrar en la proxima limpieza.

**Que la cuarta repeticion valga para algo**: el fallo no es del script sino de Windows con archivos
en uso, y `wt.sh` ya hace lo correcto —intenta, avisa y no fuerza—. Lo que falta es **quien barre
despues**: hoy nadie, y por eso se acumula hasta que una sesion lo nota. Candidato a `/afinar-regla`
junto a las cinco de abajo.

### Cuatro cosas que QC-106 destapo del arnes, todas para `/afinar-regla` (2026-09-16)

Ninguna se aplico en caliente. Se anotan con lo que costaron, que es lo que las hace decidibles.

1. **El validador de `feature_list.json` CIEGA el gate entero en vez de avisar.** Corre al principio
   de `./init.sh` y **aborta con exit 1** antes de typecheck, lint y tests. Mientras hubo tres
   `in_progress` en `backend` —por decision humana— el gate **no verificaba nada** de ninguna de las
   tres fichas. Una regla de PROCESO incumplida no deberia apagar la verificacion TECNICA: deberia
   gritar y dejar correr el resto. Coste medido: toda la implementacion de QC-106 se verifico con
   comandos dirigidos, y el gate completo no pudo correr hasta que otras dos fichas cerraron.
2. **TRES guardias distintas se rompen solo por anadir una dependencia aprobada**, porque comparan
   numeros absolutos o el `package.json` entero contra `origin/dev`:
   `guard-identificador-de-request` (`DEPENDENCIAS_ESPERADAS`, un numero a mano),
   `qc75-convenciones` y `unidades-convenciones`. A `resend` ya le paso con cuatro. El arreglo de
   fondo es comparar contra la **merge-base de la propia rama**, no contar absolutos. Hoy el peaje
   se paga en cada ficha que instale algo, y dos de esas tres ya viven en el baseline por esto.
3. **Una guardia puede afirmar algo GLOBAL protegiendo un alcance LOCAL, y muerde a quien no debe.**
   La de `recetas/scope` barria `tests/` **entero** buscando el TEXTO `@supabase/storage-js`, asi que
   se disparaba con tests de otro modulo que **nombran** la libreria para hacer cumplir **esa misma
   regla**. Se acoto con autorizacion humana. Conviene revisar si hay mas guardias con ese patron:
   sin acotarla, **QC-110 habria chocado igual**.
4. **`AGENTS.md > Modelos` dice que todos los subagentes heredan el modelo de la sesion**, y eso
   convirtio esta ficha en **mas de un millon de tokens de Opus** —explorador 127k, `spec_author`
   231k, `implementer` 338k + 291k + 65k, `reviewer` 216k— hasta **agotar la cuota semanal** y matar
   al `implementer` a mitad de escribir su bitacora. La regla nacio por una buena razon (un id de
   modelo a mano envejecio y rompio el arnes en silencio), pero **no distingue juicio de trabajo
   mecanico**. Al relanzarlo **en Sonnet** —que el propio documento permite «en la llamada concreta»—
   cerro el trabajo pendiente sin gastar Opus. Decidir si eso pasa a ser el criterio por defecto.

### Tres sesiones en paralelo saturan la maquina y el gate deja de significar nada (2026-09-17)

**Medido, no intuido.** Al cerrar QC-103, dos corridas seguidas de `./init.sh` completo sobre el
**mismo codigo** dieron rojos **distintos**:

- Corrida 1: `product-page.test.tsx` (timeout 20 s) + una guardia de arquitectura **real**.
- Corrida 2, con la guardia ya arreglada: **tres** archivos, y **dos ajenos a la ficha** —
  `integration/infra/ciclo-de-vida-de-la-base` (timeouts de 15 s en R7, R8 y R9) y
  `unit/identity/session-once-per-request-render`, que es de **QC-104**—.

Cuando los rojos **cambian de sitio entre corridas sobre el mismo codigo**, el veredicto no informa.
Estado de la maquina en ese momento: **41 procesos `node`** vivos y ~15 de `chrome.exe`; un
`tasklist` tardo **mas de tres minutos** en responder. Con QC-50, QC-88 y QC-103 en curso en tres
sesiones, cada una con su gate de ~11 minutos, sus bases de test y sus navegadores de Playwright,
12 nucleos no dan.

**Lo que ya esta escrito y no basta**: `docs/verification.md > Los flakes de saturacion` describe la
firma —`Test timed out`, en un test de UI con `userEvent`—, dice que se distingue corriendo el
archivo **solo**, y que **bajar los workers NO lo cura** (medido: de 12 a 2 workers multiplica por
cinco el tiempo y el fallo sigue). Su remedio es «lanzar la corrida buena cuando no haya procesos de
test ajenos». **Pero nada lo coordina**: no hay turno, ni aviso, ni forma de que una sesion sepa que
otra esta moliendo. El propio doc avisa ademas de que, **desde QC-58, un timeout de 15 s es senal
mas seria que antes** —«15 s no se agotan por contencion de CPU sin mas»—, y aqui se agotaron en un
test de infraestructura de base de datos.

**Dos cosas que NO se hicieron, a proposito**: no se metio ningun rojo al baseline —apagar rojos de
saturacion los vuelve permanentes, y el baseline ya arrastra 8 archivos que hoy pasan— y no se
persiguio ninguno de los dos rojos ajenos. Decision humana del 2026-09-17: mandar la correccion
pendiente y **correr el gate cuando la maquina este tranquila**.

**Candidato claro a `/afinar-regla`**, y probablemente mas rentable que varias fichas del board: hoy
el coste lo pagan las tres sesiones a la vez, en corridas de once minutos que hay que repetir. Sin
decidir: si el arnes debe serializar los gates, avisar de que otro esta corriendo, o algo mas simple.
**Queda tambien por mirar** si esos ~15 `chrome.exe` son navegadores de Playwright sin cerrar: seria
una fuga, no uso legitimo, pero **no se investigo** —el humano eligio no abrir ese frente ahora—.

### `harnessConfig/` y la raiz llevan dias divergiendo, y nada avisa (2026-09-17)

Descubierto al correr `/afinar-regla` sobre la regla de comentarios. **`harnessConfig/` no es una
copia: es una version MAS AVANZADA del arnes**, con su propio `.git`, y la raiz se quedo atras. Lo
que tiene de mas, comprobado:

- **La seccion `## Comentarios` entera** de `docs/conventions.md` —la que rechazo trabajo tres
  veces— y las lineas correspondientes en `reviewer.md`, `frontend_dev.md` y `backend_dev.md`. **Eso
  se porto el 2026-09-17**; el resto NO.
- **`docs/orquestacion.md`**, que en esa version se lleva el flujo F0-F2.6 entero fuera de
  `AGENTS.md` con un motivo medido: `AGENTS.md` se reenvia 8-12 veces por feature y un
  `frontend_dev` no necesita el contrato F0 de Jira —«~5.000 tokens por invocacion en instrucciones
  que no usa»—. Ya estaba anotado como H7 al acotar QC-88.
- **La regla «Si un subagente falla, el leader NO hace su trabajo»**, nacida de un incidente del
  2026-09-14 en opencode donde el leader escribio el informe del `reviewer` cuando la delegacion
  fallo. **Hoy la raiz no la tiene**, y esta sesion ha estado cerca de ese borde dos veces.
- Todo el soporte de **opencode** (`opencode.json`, `.opencode/`, `docs/opencode.md`).

**El patron es el que importa**: una regla escrita, con su medicion y su coste, que **nunca llego a
la copia que leen los agentes**. Se aplica de memoria, rechaza trabajo, y quien escribe el codigo no
puede leerla. No hay nada que avise de la divergencia —ni guardia, ni paso del gate, ni linea en
`AGENTS.md` que diga quien sincroniza—. Decision del humano el 2026-09-17: **portar solo lo de
comentarios** y dejar el resto anotado aqui, porque cambiar el arnes entero de golpe es como se
cuelan reglas que nadie decidio. **Lo siguiente seria inventariar la divergencia completa.**

### La regla de «no citar fichas en comentarios» no existe en `docs/conventions.md` — RESUELTA el 2026-09-17

**Ya no aplica: la regla se porto a la raiz con `/afinar-regla`** y ademas se acoto. Se conserva la
entrada porque explica lo que costo: **34 commits en QC-81**, la review de **QC-60 rechazada** y
**7 lineas en QC-103**, todo por una regla que se aplicaba sin estar donde los agentes la leen. El
diagnostico original de esta entrada era correcto en el sintoma y **equivocado en la causa**: no es
que la regla no existiera, es que **existia solo en la plantilla**. Ver la entrada de arriba.

Texto original de la entrada (2026-09-16):

Verificado con `grep` en los dos arboles: **no esta escrita en ningun sitio**. Y sin embargo se
aplica: a **QC-81** le costo **34 commits** de limpieza, y la review de **QC-60 fue RECHAZADA hoy**
por lo mismo. Una regla que rechaza trabajo real y no vive en ningun documento es la peor de las dos
opciones: o se escribe en `docs/conventions.md`, o se deja de rechazar por ella. Ojo ademas a que el
codigo ya mergeado **si** cita fichas en comentarios —`order-assignment-actions.ts` dice «QC-104 R3»—,
asi que hoy la regla ni siquiera es coherente con `dev`.

### Posible fallo latente en `e2e/aislamiento-inventario.spec.ts` (2026-09-16)

Lo encontro el `implementer` de QC-60 al escribir el E2E hermano de pedidos. Cambiar el
identificador del recurso **solo por DOM** no llegaba al servidor: el dialogo se vuelve a
renderizar y **restaura el identificador original** antes del envio, asi que la peticion viajaba
con el id propio y el test afirmaba un rechazo que nunca se habia intentado. En pedidos hubo que
reponer el id justo antes de enviar. **El de inventario (QC-49) usa la misma tecnica y puede estar
en verde sin probar el acceso cruzado.** No verificado todavia y **no entra en QC-60**: es de QC-49,
ya mergeada, y merece que alguien lo compruebe haciendo que el test falle a proposito.

### El reconocimiento del duplicado por nombre de indice se cayo en QC-60 (2026-09-16)

Medido, no supuesto: con un `INSERT` crudo, Prisma devuelve el `23505` como `P2010` y `meta.message`
trae solo la linea DETAIL (`Ya existe la llave (...)`), **sin el nombre del indice**. QC-60 lo
reconocia por ese nombre, asi que su reintento era codigo muerto y el unit test daba verde porque
fabricaba un error que si lo traia. **Se corrige dentro de QC-60** por el SQLSTATE, como ya exige el
repo en `credential-setup-link-prisma.ts:25`. Lo que queda abierto es **si otro adaptador del repo
hace lo mismo**: QC-81 no (usa el cliente tipado y `P2002` con `meta.target`), pero no se ha
barrido el resto.

**Un sitio ya identificado, fuera del diff de QC-60**: la review de QC-60 (menor m2) encontro que
`lib/modules/inventario/adapters/driven/persistence/presentation-prisma.ts:123` sigue diciendo que el
duplicado se reconoce «con el nombre de su indice». No se verifico si el CODIGO de ese adaptador lo
hace asi o si solo el comentario quedo viejo; es lo primero que hay que mirar al barrer.

### El worktree de QC-81 quedó a medio borrar, y su base sigue viva (2026-09-16)

Tercera vez, tras QC-23 y QC-102. Al cerrar (F2.5), `./scripts/wt.sh done QC-81-lote-y-fecha-de-compra`
respondió `is not a working tree` y avisó de un posible archivo en uso en Windows. **Ya no está
registrado en git** —no aparece en `git worktree list`— y **la rama está mergeada** (PR #75,
`6175700`), así que **no hay trabajo que perder**. Quedan **18 entradas de residuo** en
`.worktrees/QC-81-lote-y-fecha-de-compra/` —`node_modules`, `tests`, `specs`, `progress`…, sin
`.git`—. No se borra a mano sin decisión humana; se barre junto al residuo de QC-23 y QC-102.

**Y esta ficha deja además una base**: `QuimiCloude_QC81`, que se montó para correr su E2E. El
barrido (`pnpm run db:test clean`) la retenía por la guarda 4 mientras el worktree viviera; ahora
que ya no está registrado, **conviene volver a mirar su veredicto antes de barrer**. Se suma a las
24 bases por feature ya anotadas más abajo.

### RESUELTO: los worktrees huerfanos, barridos (2026-09-16)

**Por decision humana**, se borraron los **ocho** directorios que git ya no registraba -QC-23, QC-56, QC-81, QC-93, QC-95, QC-101, QC-102 y QC-104-, **todos mergeados en `origin/dev`**, y se podaron las ramas `feature/*` ya integradas: **de 27 a 6**. Ninguno se resistio, pese a que `wt.sh done` habia fallado en QC-56 y QC-104 con «is not a working tree» por archivos en uso. **Quedan los cinco worktrees vivos** -QC-36, QC-60, QC-88, QC-96, QC-106- y sus ramas, que git retiene por estar en uso. **Lo que NO se ha barrido**: las bases `QuimiCloude_*` por feature, 26 contadas el 2026-09-15; las limpia `pnpm run db:test clean`. **La causa sigue viva**: `wt.sh done` desregistra antes de borrar y en Windows deja el directorio a medias, asi que esto se repetira en cada cierre — material de `/afinar-regla`.

### Historial: OCHO worktrees huerfanos en disco (2026-09-16)

Recuento del 2026-09-16, tras cerrar QC-104: `git worktree list` conoce el principal y cuatro vivos -QC-106, QC-36, QC-60, QC-88, QC-96-, pero en `.worktrees/` quedan ademas **QC-23, QC-56, QC-81, QC-93, QC-95, QC-101, QC-102 y QC-104**, con 17-19 entradas cada uno y su `node_modules`. Todos estan mergeados en `origin/dev`, asi que **no hay trabajo que perder**. `wt.sh done` fallo igual en QC-56 y en QC-104: desregistra y el borrado se queda a medias por archivos en uso en Windows. **La rama local de QC-104 SI se borro** (`git branch -d`, mergeada). **No se borran los directorios sin decision humana**: `rm -rf` de esos ocho y `git branch -d` de las ramas mergeadas -quedan **27** ramas `feature/*` locales-.

### Historial: CINCO worktrees huerfanos en disco (2026-09-15)

`git worktree list` solo conoce cuatro -principal, QC-104, QC-36, QC-81, QC-96- pero en `.worktrees/` quedan ademas **QC-56, QC-101, QC-102, QC-93, QC-95 y QC-23**, con 17-18 entradas cada uno y su `node_modules`. Es el fallo clasico de Windows: `wt.sh done` desregistra y el borrado se queda a medias con archivos en uso. En el caso de QC-56 lo vi en directo: el script respondio `is not a working tree` y no borro nada. **La rama local `feature/QC-56-migrar-listas-a-tabla-compartida` tambien sigue viva** pese a estar mergeada. Ninguno tiene trabajo sin guardar -todos estan mergeados en `dev`-, pero es justo la basura que `docs/worktrees.md` existe para evitar. **No se borra a mano sin decision humana**: `rm -rf` de esos seis directorios y `git branch -d` de las ramas mergeadas.

### La receta de «base vacia» esta rota desde QC-23, y la buena no esta documentada (2026-09-15)

El orden `migrar -> db:seed -> resolve --rolled-back -> migrar` que dice este archivo mas abajo **ya no funciona**: `db:seed` crea usuarios con `users.sessions_valid_from`, columna que anade una migracion POSTERIOR a la de QC-49, y esa migracion no llega a aplicarse porque el despliegue se para en QC-49. Lo encontro el `implementer` de QC-56 al montar `QuimiCloude_QC56`. **La que si funciona es la plantilla de QC-77**: `pnpm run db:test template` hace migrar -> insertar SOLO la empresa inicial -> `resolve --rolled-back` -> migrar -> `migrate status` -> `db:seed` (`tests/helpers/test-database.ts:515-572`), y la base por worktree sale con `CREATE DATABASE "QuimiCloude_QC<n>" TEMPLATE "qct_tpl_<huella>"`. **`docs/worktrees.md` no documenta nada de la preparacion de un worktree** -ni `pnpm install --frozen-lockfile`, ni `prisma generate`, ni `next typegen`, ni la base propia-: candidato a `/afinar-regla`.

### Los E2E crean presentaciones SIN unidad desde QC-80, y nadie tiene la ficha (2026-09-15)

`choosePresentation` de `e2e/proveedores.spec.ts` y el mismo patron en `e2e/inventario.spec.ts` rellenan solo el nombre, pero la unidad es obligatoria desde `af96771`, asi que el panel `presentation-create` no se cierra y el caso R51 de proveedores queda **rojo en los dos motores, tambien en `dev`**. La bitacora de QC-93 ya lo nombro como causa B y propuso ficha; sigue sin crearse. Verificado en la traza de QC-56: `presentation-error-unit`, «Elige la unidad de la presentacion».

### QC-96 perdio su label `complexity` en el board (2026-09-15)

Detectado al reimportar: el issue se quedo sin `complexity:medium` y el disco si lo tenia. Segun `docs/jira.md` (excepcion 2) **no se degrada**: se conservo el valor del JSON y **se reescribio el label en Jira**. Queda anotado porque la ficha la lleva otra sesion.

### `dev` local va DOS commits por delante de `origin/dev` (2026-09-13)

`f5d310a` (la semilla de QC-93) y `0f2c70c` (el cierre en disco de QC-87) **estan solo en el `dev`
local**: nunca se pushearon. El efecto se noto al montar el worktree de QC-93, que nace de
`origin/dev` y por eso **no traia su propia semilla** — `spec_author` tuvo que copiarla desde el
arbol principal, y se verifico por diff que quedo identica.

No se pusheo desde aqui: mover `dev` en el remoto es decision del humano. Dos cosas que esto deja
pendientes: **en F2.3 hay que confirmar que `requirements.md` no entra en conflicto** al sincronizar,
y mientras `dev` local y remoto no coincidan, **cada worktree nuevo nacera igual de desactualizado**.

### La ficha QC-93 cita tres numeros de linea que ya no existen (2026-09-13)

Medido por `spec_author` en F1.2: inventario esta en `:571` y no `:306`, pedidos en `:447` y no
`:443`, proveedores en `:467` y no `:463`. **Los cuatro casos existen** —se localizaron por nombre y
por su `R<n>`—, asi que no cambia el alcance. Corregido **en un comentario del issue**, no en la
`description`: reescribir el cuerpo de la ficha es cosa de `/afinar-feature`, y aqui no hay decision
que reabrir.

### Ocho archivos del baseline de rojos YA PASAN (2026-09-13)

El `./init.sh` completo de QC-87 avisa: `8 archivo(s) del baseline ya pasan; toca limpiarlos`
—`inventario/product-crud.int.test.ts`, los cuatro de convenciones de `configuracion-ui`,
`navegacion/qc75-convenciones.test.ts`, `recetas-ui/recipe-route-contract.test.ts`,
`recetas/module-contract.test.ts` y los dos de `unidades`—. **No es de QC-87 y no se toco ahi**:
sacar archivos del baseline es decision del humano. Probablemente los arreglo el aislamiento por
corrida de QC-77, que ahora crea y borra una base por ejecucion.

### Un pedido de OTRA empresa es distinguible por el codigo del rechazo (2026-09-13)

Hallazgo menor de la review de QC-87, **no bloqueante y declarado por escrito antes de
implementar** (`design.md > 0`, hallazgo 4): `findAliveOrderTargetById` busca el pedido **sin
`companyId`**, asi que un actor puede distinguir un `ENTREGADO` ajeno por el `code` del error. La
causa es que **`orders` no tiene `company_id` todavia**; se cierra en **QC-46**. Anotado para que
no se pierda al cerrar la feature.

### El gate de `dev` queda en rojo por la BASE COMPARTIDA, no por `dev` (2026-09-12)

Al cerrar QC-49 y QC-79 el leader corrió `./init.sh` completo sobre `dev` y salió **rojo con 22
archivos de integración fuera del baseline**. La causa de los 22 era una sola: la base compartida
`QuimiCloude` estaba **cuatro migraciones atrasada** (`order_assignments`, `presentation_unit`,
`inventory_company_scope`, `credential_setup_tokens`). Aplicadas con `pnpm db:migrate`, la segunda
corrida baja a **2 rojos**, y los dos son **estado de datos de esa base**, no código de `dev`:

- `identity-constraints.int.test.ts` — «el catálogo arranca solo con CC» encuentra **38 tipos de
  documento `DOCxxxxxxxx`** que dejaron corridas anteriores sin limpiar.
- `identity-seed.int.test.ts` — 12 casos: su reset hace `company.deleteMany({})` y ahora **QC-49
  lo impide**, porque `products` / `presentations` / `product_batches` apuntan a `companies` con
  `ON DELETE RESTRICT` y esa base tiene inventario creado a mano.

**Verificado, no supuesto**: sobre una base limpia recién migrada y sembrada, esos dos archivos dan
**61/61 verde**. La base de prueba se creó para comprobarlo y **se borró después**.

Dos cosas que esto deja escritas y que no se tocan sin decisión humana:

1. **Es exactamente la ficha QC-77** (`aislamiento-de-la-base-en-tests-de-integracion`). Mientras
   la integración corra contra la base que también usa la app a mano, el gate de `dev` seguirá
   dando rojos que no son de nadie. **No se metió nada al baseline**: apagar dos archivos ajenos
   es decisión del humano, y aquí la causa está identificada.
2. **La migración de QC-49 no corre sobre una base vacía**: exige que la empresa inicial exista y
   se detiene entera con su `RAISE EXCEPTION` (R3, y el mensaje dice qué hacer). El orden en un
   entorno nuevo es migrar → `pnpm run db:seed` → `prisma migrate resolve --rolled-back
   20260911130000_inventory_company_scope` → migrar. Está bien que falle cerrado; lo que no está
   escrito en ningún sitio es la receta.

### El baseline de rojos tiene 8 archivos que hoy pasan TODOS (2026-09-13)

El `./init.sh` completo de QC-23 (F2.4, sobre su base propia `QuimiCloude_QC23`) salio con
**419 archivos, 6028 verdes, 66 saltados y CERO rojos**, y el propio gate reporta los 8 del
baseline como **«8 por limpiar»**. Entre ellos `tests/unit/configuracion-ui/unidades-convenciones.test.ts`,
que entro por `resend` de QC-79.

Un baseline que perdona archivos que ya no fallan es un permiso abierto: el dia que uno de esos 8
se rompa de verdad, el gate no lo dira. **No se limpia desde aqui** —es material de QC-99 y no de
QC-23, que no toca ninguno de los 8—, pero queda medido y con fecha.

### El gate dice «max-2-por-zona respetada» con `in_progress=3` (2026-09-13)

En la misma corrida, `scripts/validate-features.mjs` imprimio
`regla max-2-por-zona respetada (in_progress=3)`. Las tres son **QC-23 y QC-87 en `backend`** mas
la de la sesion paralela; el mensaje suma el total global en vez de decir el conteo **por zona**,
asi que tranquiliza y no informa. No es un falso verde de la regla —el reparto por zona se sigue
cumpliendo—, es el **mensaje** el que no permite comprobarlo de un vistazo. Arreglo de una linea,
pero es el arnes: entra por `/afinar-regla`, no en caliente.

### La E2E de QC-23 queda diferida a QC-53, con destinatario (2026-09-12)

QC-23 (`registro-de-sesiones`) **no anade ninguna pantalla, ninguna ruta y ningun boton**: es
esquema, migracion y dominio, y su spec lo cierra por escrito (R50, R51). No hay recorrido
navegable que visitar, asi que la prueba de extremo a extremo en navegador se difiere a **QC-53**,
que es quien trae el boton de «cerrar todas mis sesiones» y con el el recorrido. El boton del
administrador que invoca la misma operacion es **QC-101**.

Es una **deuda con destinatario, no una exencion** de `CHECKPOINTS.md > Calidad de codigo`: la
operacion queda implementada y probada en el service, y quien construya QC-53 hereda la E2E.

### El worktree de QC-23 quedó a medio borrar en disco (2026-09-13)

Al cerrar QC-23 (F2.5), `./scripts/wt.sh done QC-23-registro-de-sesiones` respondió
`fatal: ... is not a working tree`. **No es un HOLD de la guarda**: el worktree ya estaba
**desregistrado** de git —otra sesión corrió el desmontaje— y el borrado del directorio se quedó a
medias, que es el fallo clásico de Windows con archivos en uso.

Lo que queda en `.worktrees/QC-23-registro-de-sesiones/` son **17 entradas de residuo** y
`node_modules`: ni `.git`, ni `app/`, ni `lib/`, ni `db/`. La rama está mergeada (PR #66,
`5f021c7`) y `git worktree list` ya no lo menciona, así que **no hay trabajo que perder**.

**No se borra a mano sin decisión humana**, que es la regla de `docs/worktrees.md` para un worktree
retenido. Pero es exactamente la basura que esa doctrina existe para evitar —80 worktrees
acumulados en el proyecto anterior—, así que conviene barrerlo pronto: `rm -rf` del directorio, y si
Windows se queja, cerrar antes lo que tenga `node_modules` abierto.

### El catálogo del panel de responsables se queda en 25 personas (2026-09-13)

QC-102 pide el catálogo del panel con `pageSize: MAX_PAGE_SIZE` (25) y **el buscador filtra sobre lo
ya traído**, así que en una empresa con más de 25 personas **no todas son asignables desde esa
pantalla**. Lo señaló el `implementer` sin decidirlo —que es lo correcto— y el `reviewer` lo juzgó
**ficha aparte y no hallazgo mayor**: ningún `R<n>` ni decisión cerrada de QC-102 exige catálogo
completo, el tope lo imponen `listUsers` / `listWorkGroups` y no esta ficha, y exigirlo ahora sería
meter alcance que nadie pidió.

**No se ha creado la ficha todavía: espera decisión humana.** El patrón a copiar está identificado:
el `recipe-picker` de QC-35, que **busca en servidor** en vez de filtrar lo ya traído.
