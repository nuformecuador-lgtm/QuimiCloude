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
| QC-59 | aislamiento-por-empresa-en-proveedores | Proveedores | backend | spec_ready | feature/QC-59-aislamiento-por-empresa-en-proveedores | **F1.2 y F1.3 hechos el 2026-09-17; PARADA EN F1.4 esperando aprobacion humana.** `spec_author` entrego **R1-R39** y **38 tasks** (`41226f8`), con la **semilla verificada intacta por diff** —la unica linea borrada es el marcador— y las **19 decisiones citadas `[D1]`-`[D19]`**, ninguna huerfana. **El leader escribio «18» por un error de conteo propio**, que detecto `spec_author` al citarlas: la tabla sembrada tiene 19 filas. Corregido en disco; **ninguna decision cambia**. Es el mismo fallo que en QC-106, donde el leader conto 17 y eran 18. Sin dependencias nuevas. **DOS COSAS QUE MIRAR AL APROBAR**: (1) `tests/unit/proveedores/scope.test.ts` **prohibe la marca `findRefs` en todo el modulo**, asi que la costura nueva hacia `unidades` la pondria roja **por un vinculo que no existe** —la guardia se **RETENSA**, con la marca exacta hacia inventario mas una marca POSITIVA de que el unico receptor admitido es `units`, y falsabilidad exigida; no se relaja ni nace lista de excepciones—; (2) **coste declarado**: por el hallazgo de QC-52, el conector no dice que restriccion disparo un `P2003`, asi que una presentacion ajena **se rechaza** pero el usuario lee `unexpected` en vez de `invalid_input` —estrictamente mejor que hoy, donde la escritura pasa—. **Hallazgos del `spec_author` que el leader no habia visto**: el spec anticipa **catorce** listas cerradas (no seis), incluida la **gemela de `PRE_EXISTING_INDEXES`** que QC-50 no nombro, con las del diff en una task aparte a correr **despues** del primer commit; y la viñeta de deuda de `docs/architecture.md` **queda vacia y se borra entera** (T28), no se conserva. Ademas fijo una **regla de higiene de commits**: ningun mensaje de esta rama puede contener la cadena `QC-44`, porque dos guardias filtran por esa marca y se atribuirian el arbol entero. Historial: **F1.0 y F1.1 hechos el 2026-09-17** (eleccion del humano: «59»). **Es el ULTIMO modulo sin acotar del arco multiempresa** —inventario QC-49, unidades QC-76, pedidos QC-60 y recetas QC-50 ya estan— y **desbloquea QC-61**, la guardia de esquema que exige empresa en toda tabla de negocio, que hoy caeria por proveedores. Worktree desde `origin/dev` en `63befce`, que **ya trae QC-50**, con `.env` copiado. Board y disco **coinciden**: `zone:backend` y `complexity:medium` ya venian como labels, tarjeta en *Por hacer*. `depends_on: QC-48`, **`done`**. **Cupo `backend`: 0 de 2**, asi que no hay validacion de interseccion que hacer —no hay ninguna backend en curso con la que cruzar archivos—. **Siguiente paso: F1.2 con `/afinar-feature`, y no por rutina**: las tres fichas hermanas la necesitaron y la ficha repite dos frases que ya resultaron ambiguas —«la base se siembra limpia», que en QC-49 y QC-60 **NO significo vaciar**, y «una linea de catalogo no puede apuntar a un producto de otra empresa», que es el mismo enunciado que en QC-50 obligo a decidir si la linea lleva columna propia (**no la lleva**: la hereda de su cabecera)—. **Lo que el arco ya enseño y hay que mirar en la acotacion**: (1) **los indices unicos pueden ser PARCIALES** —el de recetas lo era y el molde de QC-49 no, y copiarlo habria hecho que borrar no liberara el nombre, sin un solo test en rojo—; (2) **las listas cerradas que el spec anticipa se quedan cortas** —QC-50 preveia seis y eran trece, y tres solo muerden DESPUES del commit porque comparan el diff—; (3) **una excepcion que queda vacia se BORRA entera**, no se conserva; y (4) **un llamante nuevo de otra ficha puede colarse sin acotar**: en QC-50 lo atrapo el compilador al cambiar la firma del puerto, no un test. |
| QC-81 | lote-y-fecha-de-compra | Inventario | backend | done | feature/QC-81-lote-y-fecha-de-compra | **CERRADA el 2026-09-16** (PR #75, merge `6175700`): resumen en `progress/history.md`. Lo que sigue es historial y se borra en la proxima limpieza de este archivo. **REESCRITA EN EL WORKTREE el 2026-09-15**: las notas del leader vivian sin commitear en `progress/current.md` del **arbol principal**, y **se perdieron** cuando otra sesion hizo `checkout dev` ahi y mergeo. No estan en `stash@{0}` -comprobado: trae una fila vieja, sin gate, sin review y sin E2E- y **ese stash es ajeno, asi que no se toca**. Nada esencial se perdio: la bitacora y el informe estan **commiteados** (`3dc41be`, `6a111db`, `337cd87`) y las decisiones, en los comentarios del issue. **Desde ahora el estado se escribe en la copia del worktree, que viaja con el PR.** **F1.4 APROBADO el 2026-09-15**, con sus dos decisiones: T3 actualiza `inventario-schema.test.ts:1082` y **T0 = `batch_duplicate_lot`** (plan B descartado). **Implementacion**: T0-T14 y T16 hechas; **T15 NO APLICA** (P1 cerrada con D: no hay datos previos, «es nuevo todo»); **T12 sigue `[ ]`** hasta que el gate salga verde. **Dos enmiendas del spec, las dos aprobadas por el humano**: (1) **D13 con R34-R36**, un lote tecleado de solo digitos no llega a 60 caracteres, para que el siguiente generado quepa; (2) **D14 con R37**, la carrera entre el borrado logico de un producto y el alta de un lote sobre el, que se cierra con `FOR NO KEY UPDATE` sobre la fila del producto **antes** del lock del correlativo. **Excepcion acotada a R29** decidida por el humano: solo la siembra de `e2e/aislamiento-inventario.spec.ts`. **Tres vueltas de `reviewer`**: aprobo con 6 menores, rechazo por **B1** -comentarios citando fichas, contra la regla nueva de `docs/conventions.md`- y rechazo por **B2** -R37 fuera del mapa de trazabilidad-. **Los tres cerrados**: los 6 menores arreglados, **34 commits `chore`** que limpian los comentarios de los 32 archivos de la rama -solo quedan **3 citas exceptuadas** por el humano, que sus tests exigen- y el mapa en **37 declarados / 37 mapeados**. **Verificacion**: E2E **verde en Chromium y WebKit**; `--rapido` verde; **base propia `QuimiCloude_QC81`** montada -la receta de QC-77 **no corre hoy**, su seed muere con `The column 'existe' does not exist`, asi que se copio la plantilla ya migrada y sembrada-. **F2.3 hecha** (merge `1813910`, tip `337cd87` pusheado): un solo conflicto trivial en el E2E, **sin migraciones**, y **el rojo heredado de QC-95 MURIO** (`scope.test.ts` verde). **Gate completo corriendo** sobre la rama sincronizada; el anterior salio rojo **solo** por ese rojo ajeno, ya muerto, y por un timeout de maquina que repetido solo pasa 12/12. `origin/dev` avanzo otros 25 commits (QC-56, PR #74) que **no tocan el area de QC-81**: **no se re-sincroniza**. Acotada el 2026-09-13: **12 decisiones cerradas, cero abiertas**. La ficha estaba **derogada en su premisa**; el board se corrigio antes de sembrar y nacio **QC-103** con la pantalla. Cupo libre: cero `in_progress` en toda zona. `spec_author` entrego **R1-R33** y **13 tasks** (commit `be486b5`), **semilla verificada intacta por diff**, y cada decision citada como `[D1]-[D12]` en al menos un requisito. **La concurrencia se resuelve en la base**: `max(lot::bigint)+1` dentro de la misma transaccion que inserta, con `pg_advisory_xact_lock` por empresa **como sentencia anterior al SELECT** -en `READ COMMITTED` un lock pedido dentro del calculo leeria un maximo viejo-, e indice unico `(company_id, lot)` como garantia dura; choque en lote generado reintenta 3 veces, choque en lote tecleado **nunca** reintenta. **DOS COSAS ESPERAN DECISION HUMANA en F1.4**: (1) `tests/unit/inventario/schema/inventario-schema.test.ts:1082` **se pondra rojo por hacer justo lo que la ficha pide** -afirma que `lot` es opcional-, y T3 lo actualiza con el precedente del propio archivo; (2) `batch_duplicate_lot`, **sexta enmienda al catalogo cerrado de errores**, con plan B escrito. **Doce sitios asumen hoy `lot` nulo**, tabulados con `archivo:linea` en `design.md > 0`. Sin dependencias nuevas |
| QC-92 | ajuste-de-inventario | Inventario | fullstack | pending | feature/QC-92-ajuste-de-inventario | **F1.0 y F1.1 hechos el 2026-09-17** (`92` del humano). Worktree montado desde `origin/dev` (`b579707`, que ya trae QC-91) con `.env` copiado. Board y disco **coinciden**: *Por hacer* / `pending`, labels `sdd`, `slug:ajuste-de-inventario` y `zone:fullstack` ya venian del board, **sin comentarios en el issue**. `depends_on: QC-91`, **`done` y mergeada hoy** (PR #83). **Cupo `fullstack`: 0 de 2** —QC-88 y QC-91 cerraron—, asi que no hay conflicto de numero; la interseccion de archivos no se puede evaluar todavia (exige `tasks.md`) y queda de encargo para **F1.4**. **`complexity:high` la asigno el leader** y el motivo importa: el abanico de la ficha es enorme segun como se acote —el minimo es una correccion registrada sobre el lote; el maximo es **una tabla nueva de movimientos de inventario, que hoy NO existe**, con permiso propio y migracion—. Se escribe `high` por honestidad y **se reevalua tras acotar**, como se hizo en QC-103. **SIGUIENTE PASO: F1.2 con `/afinar-feature`, y no por rutina: la ficha trae CINCO preguntas abiertas y dice por escrito «QUEDA ABIERTO Y NO SE RELLENA CON UN SUPUESTO»**. Son: (1) si el ajuste se hace sobre un **lote** concreto o sobre el producto —y de que lote sale la diferencia—; (2) si el motivo es obligatorio y si sale de una lista cerrada o es texto libre; (3) que permiso lo corta, si basta `inventario.modificar` o merece uno propio; (4) si el movimiento es **tabla nueva** o solo una correccion sobre el lote; (5) si el ajuste puede dejar la existencia **en negativo** y que pasa con los lotes ya consumidos. **Lanzar `spec_author` sin cerrar esto es pagar la ronda dos veces**, que es justo lo que F1.2 existe para evitar. **Contexto heredado de QC-91**: la ficha nace del hueco que QC-91 dejo declarado —«corregir una existencia es QC-92, no la edicion del producto»— y llega justo cuando la existencia **ya** es la suma de los lotes, que es lo que la vuelve necesaria. **Sera movimiento de inventario, asi que `CHECKPOINTS.md` exigira E2E** —y ojo: **el gate no corre Playwright** (ver *Deudas*), asi que ese E2E hay que correrlo a mano. |
| QC-82 | registro-de-ejecucion-de-receta | Recetas | backend | pending | feature/QC-82-registro-de-ejecucion-de-receta | **Nacida del chat el 2026-09-08** y creada en el board (QC-27), enlazada «relates to QC-63». `complexity: medium`, sin dependencias. **Pendiente F1.0 y F1.2**: ampliada el 2026-09-08 con `canceled` en el enum y un `reason` anulable; cerrado que cancelar sin motivo no se puede; quedan SEIS preguntas abiertas -entre ellas si el motivo vale fuera de la cancelacion, que se guarda en el paso y que significa «el tiempo»-, asi que toca `/afinar-feature` antes del `spec_author` |
| QC-68 | busqueda-y-total-en-el-listado-de-pedidos | Pedidos | backend | in_progress | feature/QC-68-busqueda-y-total-en-el-listado-de-pedidos | **SPEC APROBADO por el humano el 2026-09-17; F1.4 y F2.0 hechos, tarjeta en *En curso*. F2.1 lanzada.** **EL CRUCE DE ARCHIVOS CON QC-59 NO SALIO LIMPIO, y se hizo ANTES de aprobar**: chocan **dos archivos**, y uno es serio. `tests/integration/inventario/list-query-indexes.int.test.ts` ya lo tiene tocado QC-59 (+47/-1) —saca del censo el unico global de nombre de proveedor y mete su sustituto por empresa— y QC-68 necesita ESE MISMO archivo para dar de alta su indice y subir los contadores (6→7 y 34→35): las dos editarian las mismas listas y los mismos numeros, y **un merge mal resuelto ahi afloja un censo sin que nadie lo note**. El segundo es `lib/composition/index.ts` (+2/-2 en QC-59), cableado trivial. **Decision: el `implementer` NO toca esos dos archivos**; hace todo lo demas y **para antes de llegar a ellos**, nombrando las tasks bloqueadas. Cuando QC-59 mergee, el leader sincroniza y devuelve el trabajo. Mismo criterio que QC-88 con QC-60. **`backend` queda en 2 de 2** —con QC-59—: al tope y con conflicto conocido, por eso el limite va escrito en el encargo. Historial: **F1.2 y F1.3 hechos el 2026-09-17; PARADA EN F1.4 esperando aprobacion humana.** **LA FICHA SE PARTIO AL ESCRIBIR EL SPEC, y ese es el hallazgo del dia**: la `description` afirmaba que la consulta «devuelve cantidad y precio unitario por separado», y el `spec_author` verifico en el esquema que **`orders` tiene UN SOLO decimal, `quantity`** —el precio y la unidad los borro **QC-35bis el 2026-09-07** por decision del humano, «un pedido es receta + cantidad»—. **El total no tiene con que multiplicarse**, y ningun modelo guarda un precio de venta: los que hay son costes de COMPRA. **No lo relleno con un supuesto**: lo dejo como pregunta abierta bloqueante. **DECISION HUMANA: partir.** QC-68 se queda con la busqueda y **nace `QC-123`** —de donde vive el precio— con las cinco preguntas que arrastra, entre ellas la que mas pesa: **que pasa con los pedidos ya hechos cuando el precio cambia**. `QC-122` dejo de llevar la columna del total. Entregado **R1-R16 y 21 tasks** (`eb53ce6`), **numeracion corrida sin fantasmas** y con la **semilla verificada intacta por diff**. `[D1]` y `[D7]` quedan escritas **sin citar**: son herencia de QC-123, y una decision cerrada no se borra. **El `spec_author` corrio SIN Bash otra vez** —tercera ficha seguida—, asi que el leader verifico el diff y commiteo por el. **Cazo una contradiccion de mi encargo**: pedi 17 requisitos y a la vez que `[D1]` no quedara citada, y las dos cosas no caben; quito tambien ese requisito y lo dijo en vez de elegir en silencio. **Diseno**: la busqueda pide primero los ids a `recetas` (metodo nuevo del catalogo), **sin JOIN** y con **consultas constantes** —3 por pagina sin busqueda, 4 con ella—; descartada la denormalizacion del nombre en `orders`. La migracion trae un **indice GIN de trigramas SIN `WHERE`**, porque el de QC-57 es **parcial** y no serviria a las recetas de baja que `[D2]` incluye. **DIECISEIS censos y comentarios afirman hoy que pedidos no busca**, localizados archivo por archivo en el `tasks.md` —la lista que en QC-63 nadie vio venir—. **Interseccion**: el unico archivo con riesgo frente a QC-59 y QC-91 es `lib/composition/index.ts`. **Encargo para F1.4**: cruzar esa lista con lo que toque QC-59, que corre en la misma zona. Historial: **APARCADA el 2026-09-17 tras F1.0 y F1.1**: el humano prefirio seguir por **QC-63** (Recetas). El worktree queda montado y la ficha evaluada, **sin una linea de codigo**; se retoma cuando se decida. **F1.0 y F1.1 hechos el 2026-09-17.** Elegida por el humano con la prioridad **Inventario -> Pedidos -> Recetas**: en Inventario **no hay nada arrancable** —la unica abierta es QC-92 y la bloquea QC-91, que esta en vuelo en la otra sesion—, asi que la primera de Pedidos es esta. Worktree montado desde `origin/dev` (`b342375`, que ya trae QC-88). `zone:backend` ya venia del board; **`complexity:medium` la asigno el leader** —esquema, migracion con indices, adaptador, contrato de consulta y tests; varias capas y condiciones, pero ninguna integracion externa—. Sin `depends_on`. **Cupo `backend`: 1 de 2** (QC-50), asi que cabe por numero. **PERO el cruce de archivos con QC-50 es CASI SEGURO y esta medido**: el `tasks.md` de QC-50 nombra `db/schema.prisma`, `db/migrations/`, `lib/composition/index.ts`, `lib/modules/pedidos/domain/` y `tests/unit/pedidos/`, y esta ficha trae migracion propia y toca el modulo de pedidos. Mismo criterio que QC-88 con QC-60 y QC-50 con QC-106: **solo Fase 1**, que no escribe una linea de produccion, y **F2.0 espera al merge de QC-50**. Se revalida contra el `tasks.md` cuando exista. **Siguiente paso: F1.2 con `/afinar-feature`**, y la propia ficha lo pide por escrito: deja **una pregunta abierta declarada** —si el total se puede ordenar y filtrar, que obligaria a que exista como expresion en la base y no solo en la salida—. |
| QC-121 | unidad-como-identidad-del-item | Inventario | fullstack | pending | feature/QC-121-unidad-como-identidad-del-item | **F0, F1.0 y F1.1 hechos el 2026-09-18** (`121` del humano). **F0**: la ficha **no estaba en disco** —se creo en el board despues de la ultima importacion— y se importo; de paso el board trajo QC-59 `done`, **QC-92 `in_progress`**, QC-119 `cancelled` (nueva en disco) y QC-96 sigue `spec_ready` (columna *En revision*). Worktree montado desde `origin/dev` (`b8e3d5e`, que ya trae QC-59) con `.env` copiado. `zone:fullstack` venia del board; **`complexity:high` la asigno el leader y se escribio en Jira**: migracion (vuelve `products.stock`), rechazo nuevo en el alta de lote que **deroga D7 de QC-91**, datos existentes con lotes en dos unidades, y posible aviso en pantalla. Se reevalua tras acotar. No se parte en dos, como ninguna `fullstack` reciente. `depends_on: QC-91`, **`done`**. **Cupo `fullstack`: 1 de 2** (QC-92), asi que cabe por numero. **PERO el cruce de archivos con QC-92 es CASI SEGURO**: las dos tocan lotes y existencia de inventario, y **QC-92 no tiene rama ni worktree en esta maquina**, asi que su `tasks.md` no se puede leer. Mismo criterio que QC-68 con QC-50: **solo Fase 1**, y **F2.0 espera** a poder cruzar con QC-92 o a que cierre. **Siguiente paso: F1.2 con `/afinar-feature`**: la ficha declara por escrito **cuatro cosas por acotar** —si `products.stock` se guarda o se deriva; que pasa con los productos que ya tienen lotes en dos unidades; si el rechazo va en el alta del lote, del producto o ambos; y si el nombre duplicado necesita aviso en pantalla—. |

## Evaluaciones

### QC-121 - acotada con `/afinar-feature` (2026-09-18)

Alcance, **15 decisiones cerradas** y **1 pregunta abierta** (la unidad de la linea de receta) en
`.worktrees/QC-121-unidad-como-identidad-del-item/specs/QC-121-unidad-como-identidad-del-item/requirements.md`
(sembrado DENTRO del worktree). No se copian aqui. **El board se corrigio ANTES de sembrar**: la `description` pedia **rechazar** el lote en otra unidad y el humano decidio **crear otro producto**. Ninguna ficha nueva ni cancelada. **Deroga tres decisiones de QC-91** (D6 «se calcula, no se guarda», D2 «orden y filtro se pierden», D7 «sin rechazar ni crear en el alta»). Sigue `pending`: la mueve el leader en F1.3.

### QC-68 - acotada con `/afinar-feature` (2026-09-17)

Alcance, **8 decisiones cerradas** y **cero preguntas abiertas** en
`.worktrees/QC-68-busqueda-y-total-en-el-listado-de-pedidos/specs/QC-68-busqueda-y-total-en-el-listado-de-pedidos/requirements.md`
(sembrado DENTRO del worktree). No se copian aqui.

**El worktree se sincronizo ANTES de acotar**, y no por rutina: se monto cuando `dev` iba 66 commits
por detras, y la leccion de QC-63 es que acotar contra un mundo viejo produce premisas falsas. Tambien
se le copio el `.env`, que `wt.sh` no puso —el mismo fallo que en QC-63 mato la integracion con un
error que no nombra su causa—.

**La pregunta que la ficha traia abierta se cerro**: el total **solo se muestra**, no entra en
`ORDER_QUERYABLE`. **Una segunda la destapo el disco y no estaba en la ficha**: como `list-orders.ts`
resuelve los nombres con `findRefsIncludingDeleted`, la lista **ya muestra el nombre de una receta dada
de baja**, asi que la busqueda tambien la encuentra —si no, un pedido visible en pantalla no aparecerian
al buscarlo por el nombre que el mismo muestra—.

**El E2E se difiere A QC-122, con motivo escrito**: `CHECKPOINTS.md` lo exige para importes, pero esta
ficha no tiene pantalla que ejercitar. **QC-122 nacio el mismo dia justamente para que esa exigencia no
quedara sin dueno**: enchufar la busqueda y el total en la pantalla de pedidos, `zone:frontend`, epica
Pedidos, «is blocked by» QC-68, y con el E2E de importes escrito dentro como suyo.

**El board se corrigio ANTES de sembrar**: la `description` declaraba abierto lo del total y no decia
nada de las recetas de baja ni del E2E. `zone`, `complexity` y `depends_on` siguen igual. Sigue
`pending` en Backlog: la mueve el leader en F1.3.

### QC-59 - acotada con `/afinar-feature` (2026-09-17)

Alcance, **18 decisiones cerradas** y **cero preguntas abiertas** en
`.worktrees/QC-59-aislamiento-por-empresa-en-proveedores/specs/QC-59-aislamiento-por-empresa-en-proveedores/requirements.md`
(sembrado DENTRO del worktree). No se copian aqui.

**El board se corrigio ANTES de sembrar**: la `description` decia que una linea no puede apuntar a
``un producto`` de otra empresa, y **desde QC-52 las lineas no conocen productos** —apuntan a una
presentacion y, opcionalmente, a una unidad—. Se anadio **QC-49** a `depends_on` (`done`): la clave
foranea compuesta contra `presentations(company_id, id)` no existiria sin ella. `zone` y
`complexity` siguen igual. Ninguna ficha nueva y ninguna cancelada.

**La decision de fondo, y se aparta de QC-50**: la linea de catalogo **SI gana columna de empresa**
—la de receta no la tiene—, porque es lo que permite acotar la presentacion **en la base** con una
clave foranea compuesta en vez de con una consulta. Asi **la decision 3 de QC-52 queda intacta**:
no nace ningun puerto de `proveedores` hacia `inventario`. La **unidad** no se puede cerrar por ahi
—una FK compuesta no sabe decir ``la de sistema o la mia``—, asi que esa si se valida en el service
y **anade una consulta hacia `unidades`**, dicho explicitamente en el archivo.

**Cuesta dos indices unicos nuevos** `(company_id, id)`, en `presentations` y en `suppliers`,
redundantes por definicion y cuyo unico fin es ser destino de esas claves. **Uno toca una tabla de
`inventario`**; verificado el 2026-09-17 que hoy no existe ninguno de los dos.

**Trampa heredada, ya localizada**: `suppliers_name_unique` es **PARCIAL**, como el de recetas.
Medido en la base: 51 proveedores vivos, 1 linea viva, 0 imagenes, ningun nombre repetido.

Sigue `pending` en Backlog: la mueve el leader en F1.3.

### QC-63 - REACOTADA con `/afinar-feature` (2026-09-17)

La semilla del 2026-09-08 **ya existia**, asi que no se sobrescribio: se le **anadieron cinco filas**
a la tabla de decisiones, en
`.worktrees/QC-63-ejecutar-receta-operador/specs/QC-63-ejecutar-receta-operador/requirements.md`.
No se copian aqui.

**Dos decisiones viejas NO se sostenian contra el disco, y por eso valia la pena reacotar**: (1) la
semilla cortaba la pantalla con `asignaciones.consultar` **y** `asignaciones.modificar`, pero el
Operador nace **sin** el segundo, asi que se habria quedado fuera de su propia pantalla; y el unico
camino que mueve un pedido, `updateOrder`, exige **`pedidos.modificar`**, que tampoco tiene. Se cierra
con un **caso de uso nuevo en `asignaciones`** que pregunta al contrato de `pedidos` si la transicion
es legal. (2) **QC-88 R23 dejo aqui el rechazo real del «pedido ya tomado»** y su R21 deshabilita el
disparador de todo `EN_CURSO`: como abrir la pantalla pone el pedido `EN_CURSO`, **el Operador que
recargase se encontraba su propio trabajo bloqueado**. El humano decidio **permitir la reentrada a
cualquier responsable asignado**, asi que esta ficha **enmienda la guardia de QC-88 tensandola**.

**El board se corrigio ANTES de sembrar**: la `description` afirmaba que la transicion iba por el caso
de uso de pedidos, y **`complexity` subio de `medium` a `high`** —caso de uso nuevo con autorizacion
propia, contrato de dos modulos, estreno de la conversion de unidades de QC-76, enmienda de tests ya
mergeados y E2E de permisos—. Ninguna ficha nueva y ninguna cancelada. Sigue `pending` en Backlog: la
mueve el leader en F1.3.

### QC-68 - seleccionada en F1.0 con la prioridad del humano (2026-09-17)

El humano fijo el orden **Inventario -> Pedidos -> Recetas**. En **Inventario no hay nada que
arrancar**: la unica ficha abierta de la epica es **QC-92**, y la bloquea **QC-91**, que la otra
sesion tiene en vuelo (T1-T6 cerradas hoy). Asi que la eleccion cae en la primera de **Pedidos**.

**No se salto ninguna ficha por numero**: QC-68 es la unica `pending` de Pedidos.

**`complexity: medium`**, asignada por el leader: toca esquema, migracion con sus indices, el
adaptador de persistencia, el contrato de consulta de QC-57 y sus tests. Son varias capas con
condiciones, pero **ninguna integracion externa** —y explicitamente **ninguna dependencia nueva**:
la descripcion ya cierra que el total se calcula en el servidor con los decimales de Prisma, para
que no entre `decimal.js`—.

**El cruce con QC-50 esta medido, no supuesto.** El `tasks.md` de QC-50 nombra `db/schema.prisma`,
`db/migrations/`, `lib/composition/index.ts`, `lib/modules/pedidos/domain/` y `tests/unit/pedidos/`.
Esta ficha trae migracion propia y entra en el modulo de pedidos, asi que la interseccion es casi
segura. **Solo Fase 1**, y F2.0 espera al merge de QC-50: es el criterio que ya se aplico en QC-88
con QC-60 y en QC-50 con QC-106.

**Lo que la acotacion tiene que cerrar**: la pregunta que la ficha deja abierta por escrito —si el
total se puede ordenar y filtrar, que obliga a que exista como **expresion en la base** y no solo en
la salida— y como se resuelve la busqueda por nombre de receta, que hoy **no vive en `orders`**: la
resuelve el caso de uso pidiendosela al modulo de recetas. Cruzar tablas o denormalizar el nombre es
decision de diseno, y **QC-50 esta tocando justo esa frontera**.

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

### QC-88 - CERRADA el 2026-09-17 (PR #79, merge `b342375`)

Resumen completo en `progress/history.md`. Lo que sigue abierto va en *Deudas*.

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

### Segundo worktree desregistrado con los archivos en disco: QC-91 (2026-09-17)

`./scripts/wt.sh done QC-91-existencia-por-lote` falló **igual que el de QC-103**: git ya no lo
registra, pero el directorio sigue en disco («archivo en uso en Windows»). **Sin trabajo en riesgo**
—PR #83 mergeado—, pero **`wt.sh` ya no puede limpiarlo**, porque para el script eso no es un
worktree. **Van dos en un día.** Ya no es un incidente: es el mecanismo que `AGENTS.md > Worktrees`
describe, funcionando. El arreglo es enseñar a `wt.sh` a barrer huérfanos bajo `.worktrees/`, y va
por `/afinar-regla`.

### El gate completo NO corre el E2E (2026-09-17)

**VERIFICADO el 2026-09-17, y NO es un hallazgo nuevo**: `init.sh` no ejecuta Playwright, y ya
estaba anotado como deuda en `docs/verification.md`; el propio `init.sh:45-47` lo dice, con el caso
que lo destapó —**una suite E2E entera caída en `dev`** por un `Cannot find module 'resend'` que
nadie vio, porque el gate no la corre—.

Lo que sí conviene tener presente al leer cualquier bitácora: **«gate completo verde» no incluye los
recorridos críticos**. Los E2E se corren a mano, y `CHECKPOINTS.md` los exige para movimientos de
inventario. En QC-91 se corrieron (14 passed, chromium y webkit) y el reviewer los reejecutó, pero
eso fue disciplina, no el gate. La deuda tiene dueño en `docs/verification.md` y no es de esta
ficha.

### RESUELTO: QC-121 no estaba en `feature_list.json` (2026-09-17)

Importada en la F0 del 2026-09-18.


### El worktree de QC-50 quedo a medio borrar — SEXTA vez, y ya no es un worktree (2026-09-17)

`./scripts/wt.sh done QC-50-aislamiento-por-empresa-en-recetas` fallo con
`fatal: ... is not a working tree`. **No se forzo nada**, como manda la regla.

**El diagnostico es distinto a las veces anteriores y conviene escribirlo**: el directorio sigue en
disco pero **`.worktrees/QC-50-.../.git` NO EXISTE**, asi que git ya no lo registra —`git worktree
list` no lo menciona— y `wt.sh done` no tiene nada que desmontar. No es «archivo en uso en Windows»,
que es lo que el script supone y lo que dice su aviso: es que el registro se perdio antes.

**El trabajo esta a salvo**: la rama esta en `origin` y mergeada en `dev` (PR #81, `63befce`).
Lo que queda es un directorio suelto con su `node_modules`.

**Y no esta solo**: quedan igual `QC-88`, `QC-103` y `QC-106`, las tres cerradas y mergeadas. Son
cuatro arboles muertos ocupando disco que ningun paso del flujo va a recoger, porque el paso que
lo haria es justo el que falla.

**Esto ya no es una anecdota por ficha: es el mismo fallo seis veces seguidas** y el aviso del
script apunta a una causa equivocada. Para `/afinar-regla`: `wt.sh done` deberia distinguir «no
esta registrado» de «esta en uso» y, en el primer caso, ofrecer borrar el directorio cuando la
rama ya esta integrada.

### La fila de QC-106 resucito en un merge, y el cupo se cuenta de aqui (2026-09-17)

La quito al sincronizar QC-50 con `dev`. **QC-106 esta `done`** (PR #78 mergeado) y su F2.6 ya la
habia limpiado de este archivo en `e85f77a`; volvio porque la rama de QC-88 salio de un `dev`
anterior a esa limpieza y el merge la trajo de vuelta **diciendo `in_progress` y «esperando el
merge del humano»**.

**No es ruido de bitacora: el leader cuenta el cupo por zona leyendo esta tabla.** Un `in_progress`
fantasma en `backend` habria bloqueado una ficha real en el proximo F1.0, y el validador no lo ve
—`feature_list.json` dice `done`, que es lo correcto—.

**Lo que esto senala y no arreglo aqui**: las filas de este archivo se refunden a mano en cada
merge, ya paso en QC-88 (`6a96733`, «refunde la fila de estado que el merge se llevo por delante»)
y ahora al reves, resucitando una muerta. Candidato a `/afinar-regla`: hoy nada impide que un merge
contradiga a `feature_list.json`, que es la fuente que el gate si valida.

### Worktree de QC-103: desregistrado pero con los archivos aun en disco (2026-09-17)

`./scripts/wt.sh done QC-103-lote-y-fecha-de-compra-en-el-alta` hizo **la mitad**: git ya no lo
registra —no sale en `git worktree list`, no tiene `.git` y su carpeta de metadatos en
`.git/worktrees/` desapareció— pero **el directorio sigue en disco**, porque el borrado falló con
«archivo en uso en Windows». **No hay trabajo en riesgo**: la rama está integrada en `dev`
(`git branch --merged dev` la lista) y el PR #80 está mergeado.

Lo que importa es que **`wt.sh` ya no puede limpiarlo**: para el script ese directorio no es un
worktree, así que no volverá a intentarlo nunca. Es exactamente el mecanismo por el que
`AGENTS.md > Worktrees` cuenta que se acumularon 80 worktrees en un proyecto anterior. Se borra a
mano cuando el proceso que retiene el archivo lo suelte, o **se le enseña a `wt.sh` a barrer
directorios huérfanos bajo `.worktrees/`**, que sería el arreglo de verdad y va por `/afinar-regla`.

### Baseline de rojos: 8 archivos que ya pasan (2026-09-17)

`./init.sh` avisa en cada corrida de que **8 archivos del baseline ya pasan** y toca sacarlos de la
lista: `tests/integration/inventario/product-crud.int.test.ts`,
`tests/unit/configuracion-ui/configuracion-convenciones.test.ts`,
`tests/unit/configuracion-ui/unidades-convenciones.test.ts`,
`tests/unit/navegacion/qc75-convenciones.test.ts`,
`tests/unit/recetas-ui/recipe-route-contract.test.ts`, `tests/unit/recetas/module-contract.test.ts`,
`tests/unit/unidades/modulo-intacto.test.ts`, `tests/unit/unidades/unidades-convenciones.test.ts`.
**No se metió en la rama de QC-103 a propósito**, para no mezclar limpieza de baseline con una
feature. Un baseline que miente se vuelve ruido que se ignora, que es como se cuela un rojo de
verdad.

### Worktrees huerfanos BARRIDOS por decision humana (2026-09-17)

El humano ordeno borrarlos. Se borraron los **cinco** —QC-50, QC-63, QC-88, QC-103 y QC-106—,
todos de fichas cerradas y mergeadas. **Verificado antes de borrar, no supuesto**: las cinco ramas
son ancestro de `origin/dev`, ninguna estaba registrada en `git worktree list`, y el unico archivo
mas nuevo que su ultimo commit era `progress/current.md`, **identico al commiteado**.

`git worktree list` y `.worktrees/` vuelven a **coincidir exactamente**: el principal mas QC-36,
QC-59, QC-68, QC-91, QC-96 y `tmp-dev-product-page`.

Sigue sin existir **quien barre por defecto**, y van seis repeticiones del mismo fallo de `wt.sh`
en Windows: el candidato mas maduro para `/afinar-regla`.

### Worktrees a medio borrar — SEXTA vez, ahora QC-63 (2026-09-17)

Mismo cuadro exacto al cerrar QC-63: `wt.sh done` responde `is not a working tree`, git ya lo tiene
**desregistrado** y el **directorio se queda en disco**. No se forzo. La rama esta mergeada
(PR #82, `6754a46`), asi que no guarda nada unico.

**Recuento del 2026-09-17 al cerrar QC-63: CINCO directorios huerfanos**, los cinco de fichas ya
cerradas y mergeadas y ninguno registrado en `git worktree list`:

- `QC-50-aislamiento-por-empresa-en-recetas`
- `QC-63-ejecutar-receta-operador`
- `QC-88-listado-de-pedidos-asignados`
- `QC-103-lote-y-fecha-de-compra-en-el-alta`
- `QC-106-endpoint-de-carga-de-pdf`

Barrerlos es seguro y lo decide el humano, como la vez anterior. Lo que sigue sin existir es
**quien barre por defecto**, y ya son seis repeticiones: es el candidato mas maduro para
`/afinar-regla`.

### Worktrees a medio borrar — QUINTA vez, ahora QC-88 (2026-09-17)

Al cerrar QC-88 (F2.5), `./scripts/wt.sh done QC-88-listado-de-pedidos-asignados` respondio
`is not a working tree` y aviso de posible archivo en uso en Windows. Mismo cuadro exacto que las
cuatro anteriores: git ya lo tiene **desregistrado** —no sale en `git worktree list`— y el
**directorio se queda en disco**. No se forzo, como manda `AGENTS.md`. La rama esta mergeada en
`origin/dev` (PR #79, `b342375`), asi que **ese directorio no guarda nada unico**.

**Hoy quedan tres directorios huerfanos**: `QC-88`, `QC-103` y `QC-106`, los tres de fichas ya
cerradas y mergeadas. Barrerlos es seguro y lo decide el humano, como la vez anterior. Lo que
sigue sin existir es **quien barre por defecto**: candidato a `/afinar-regla`.

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

### `progress/current.md` se pierde en cada merge, y van dos (2026-09-17)

**El archivo de estado vivo es el UNICO que todas las ramas tocan a la vez**, asi que conflicta en
cada sincronizacion con `dev` — y las dos veces que ha conflictado se ha resuelto **tomando un lado
entero**, que es justo lo que no se puede hacer con el: cada lado trae estado que el otro no tiene.

- **2026-09-16**: las ediciones del leader «desaparecieron» del arbol principal porque otra sesion
  hizo `checkout dev`; estaban a salvo dentro de un commit de la rama del arnes.
- **2026-09-17 (QC-88)**: el `implementer`, al mergear los 35 commits de QC-106, resolvio el
  conflicto con `git checkout --theirs` —**siguiendo al pie de la letra que «ese archivo lo mantiene
  el leader»**, asi que el error es del encargo, no suyo—. Se perdio del arbol la fila con F1.4, la
  ruta `/asignacion` y la tanda de backend; **el commit `943f233` seguia en la historia** y el leader
  la refundio a mano con un script, porque la version de `dev` tenia a su vez el bloque de T17 que la
  del leader no tenia. Ningun lado era descartable.

**Lo que hay que decidir** (material de `/afinar-regla`): o el estado vivo deja de ser un archivo
unico que todos tocan —una fila por feature en archivos separados, que no conflictan—, o el encargo
de sincronizar dice explicitamente **«en `current.md` se fusionan los dos lados, nunca se toma
uno»**. Lo barato es lo segundo; lo que resuelve el problema de verdad es lo primero.

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
