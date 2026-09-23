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
| QC-81 | lote-y-fecha-de-compra | Inventario | backend | done | feature/QC-81-lote-y-fecha-de-compra | **CERRADA el 2026-09-16** (PR #75, merge `6175700`): resumen en `progress/history.md`. Lo que sigue es historial y se borra en la proxima limpieza de este archivo. **REESCRITA EN EL WORKTREE el 2026-09-15**: las notas del leader vivian sin commitear en `progress/current.md` del **arbol principal**, y **se perdieron** cuando otra sesion hizo `checkout dev` ahi y mergeo. No estan en `stash@{0}` -comprobado: trae una fila vieja, sin gate, sin review y sin E2E- y **ese stash es ajeno, asi que no se toca**. Nada esencial se perdio: la bitacora y el informe estan **commiteados** (`3dc41be`, `6a111db`, `337cd87`) y las decisiones, en los comentarios del issue. **Desde ahora el estado se escribe en la copia del worktree, que viaja con el PR.** **F1.4 APROBADO el 2026-09-15**, con sus dos decisiones: T3 actualiza `inventario-schema.test.ts:1082` y **T0 = `batch_duplicate_lot`** (plan B descartado). **Implementacion**: T0-T14 y T16 hechas; **T15 NO APLICA** (P1 cerrada con D: no hay datos previos, «es nuevo todo»); **T12 sigue `[ ]`** hasta que el gate salga verde. **Dos enmiendas del spec, las dos aprobadas por el humano**: (1) **D13 con R34-R36**, un lote tecleado de solo digitos no llega a 60 caracteres, para que el siguiente generado quepa; (2) **D14 con R37**, la carrera entre el borrado logico de un producto y el alta de un lote sobre el, que se cierra con `FOR NO KEY UPDATE` sobre la fila del producto **antes** del lock del correlativo. **Excepcion acotada a R29** decidida por el humano: solo la siembra de `e2e/aislamiento-inventario.spec.ts`. **Tres vueltas de `reviewer`**: aprobo con 6 menores, rechazo por **B1** -comentarios citando fichas, contra la regla nueva de `docs/conventions.md`- y rechazo por **B2** -R37 fuera del mapa de trazabilidad-. **Los tres cerrados**: los 6 menores arreglados, **34 commits `chore`** que limpian los comentarios de los 32 archivos de la rama -solo quedan **3 citas exceptuadas** por el humano, que sus tests exigen- y el mapa en **37 declarados / 37 mapeados**. **Verificacion**: E2E **verde en Chromium y WebKit**; `--rapido` verde; **base propia `QuimiCloude_QC81`** montada -la receta de QC-77 **no corre hoy**, su seed muere con `The column 'existe' does not exist`, asi que se copio la plantilla ya migrada y sembrada-. **F2.3 hecha** (merge `1813910`, tip `337cd87` pusheado): un solo conflicto trivial en el E2E, **sin migraciones**, y **el rojo heredado de QC-95 MURIO** (`scope.test.ts` verde). **Gate completo corriendo** sobre la rama sincronizada; el anterior salio rojo **solo** por ese rojo ajeno, ya muerto, y por un timeout de maquina que repetido solo pasa 12/12. `origin/dev` avanzo otros 25 commits (QC-56, PR #74) que **no tocan el area de QC-81**: **no se re-sincroniza**. Acotada el 2026-09-13: **12 decisiones cerradas, cero abiertas**. La ficha estaba **derogada en su premisa**; el board se corrigio antes de sembrar y nacio **QC-103** con la pantalla. Cupo libre: cero `in_progress` en toda zona. `spec_author` entrego **R1-R33** y **13 tasks** (commit `be486b5`), **semilla verificada intacta por diff**, y cada decision citada como `[D1]-[D12]` en al menos un requisito. **La concurrencia se resuelve en la base**: `max(lot::bigint)+1` dentro de la misma transaccion que inserta, con `pg_advisory_xact_lock` por empresa **como sentencia anterior al SELECT** -en `READ COMMITTED` un lock pedido dentro del calculo leeria un maximo viejo-, e indice unico `(company_id, lot)` como garantia dura; choque en lote generado reintenta 3 veces, choque en lote tecleado **nunca** reintenta. **DOS COSAS ESPERAN DECISION HUMANA en F1.4**: (1) `tests/unit/inventario/schema/inventario-schema.test.ts:1082` **se pondra rojo por hacer justo lo que la ficha pide** -afirma que `lot` es opcional-, y T3 lo actualiza con el precedente del propio archivo; (2) `batch_duplicate_lot`, **sexta enmienda al catalogo cerrado de errores**, con plan B escrito. **Doce sitios asumen hoy `lot` nulo**, tabulados con `archivo:linea` en `design.md > 0`. Sin dependencias nuevas |
| QC-82 | registro-de-ejecucion-de-receta | Recetas | backend | pending | feature/QC-82-registro-de-ejecucion-de-receta | **Nacida del chat el 2026-09-08** y creada en el board (QC-27), enlazada «relates to QC-63». `complexity: medium`, sin dependencias. **Pendiente F1.0 y F1.2**: ampliada el 2026-09-08 con `canceled` en el enum y un `reason` anulable; cerrado que cancelar sin motivo no se puede; quedan SEIS preguntas abiertas -entre ellas si el motivo vale fuera de la cancelacion, que se guarda en el paso y que significa «el tiempo»-, asi que toca `/afinar-feature` antes del `spec_author` |
| QC-114 | tabla-compartida-en-iphone-real | Plataforma | frontend | in_progress | feature/QC-114-tabla-compartida-en-iphone-real | **F1.0 y F1.1 hechos el 2026-09-18** (`114` del humano, tercera feature de la tanda tras QC-92 y QC-109). Worktree montado desde `origin/dev` (`6333f88`) con `.env` copiado -el worktree nace sin el, ver *Deudas*-. `depends_on: QC-56`, **`done`**, que es la condicion que la ficha pone para hacer **una sola pasada** sobre las nueve pantallas. **Cupo `frontend`: 0 de 2**, asi que no hay conflicto de numero; la interseccion de archivos no se puede evaluar todavia (exige `tasks.md`) y queda de encargo para F1.4 -aunque el riesgo es bajo: las otras dos en curso son `fullstack` (QC-92) y `backend` (QC-109)-. **`complexity: medium` la asigno el leader**, y con una salvedad escrita: la pasada en si es una checklist sobre nueve pantallas, pero **el alcance real depende del resultado** -si algo falla, lo que se toca es el componente compartido de QC-55, que montan las nueve, y eso reevalua a `high`-. **LO QUE HAY QUE DECIR EN VOZ ALTA: NINGUN AGENTE PUEDE EJECUTAR ESTA FEATURE.** La ficha lo dice literal: exige una **persona con un iPhone fisico**. El arnes puede escribir el protocolo de prueba y el registro de evidencia; **la verificacion la hace el humano**. Ni jsdom ni el E2E en WebKit de escritorio la sustituyen -`docs/architecture.md > Regla: multiplataforma` y el hecho de que `position: fixed` + scroll anidado es el punto caliente del componente-. **F1.2 y F1.3 hechos el 2026-09-18; PARADA EN F1.4 esperando aprobacion humana.** `spec_author` entrego **R1-R18** y **9 tasks** (`3c925a8`), semilla intacta y las **nueve** decisiones `[D1]`-`[D9]` citadas, ninguna huerfana. **T5 y T6 son exclusivamente humanas** -la pasada en el iPhone y el registro-: ningun agente puede darlas por hechas. La trazabilidad `R<n>` apunta a una fila de `docs/verificacion-ios/QC-114.md`, no a un test de Vitest, y eso esta declarado en `design.md`. **DOS PREGUNTAS ABIERTAS NUEVAS, las dos bloqueantes**: (3) con que cuenta se entra al preview -la navegacion privada filtra por permiso y no consta una que vea las nueve vistas-, que bloquea **T5**; y (4) quien siembra y contra que base, que bloquea **T3**. Tarjeta movida a *En revision* y comentada. **F1.4 APROBADO el 2026-09-18** por el humano; tarjeta en *En curso* y ficha `in_progress`. **Cupo `frontend`: 1 de 2.** F2.1 arranca sabiendo que **T3 y T5 estan bloqueadas por las preguntas 3 y 4** -credenciales del preview y acceso a su base-: el implementer hace lo que no depende de eso y para ahi. **F2.1 PARCIAL el 2026-09-18** (`de35b88`): **T1 y T2 cerradas** -plantilla de `docs/verificacion-ios/QC-114.md` con las nueve filas y **27 casillas vacias a proposito**, mas el mapa `R1`-`R18`, ninguno huerfano-. `typecheck` y `lint` verdes; `vitest related` no procede porque la tanda solo toca Markdown. **LA FICHA PARA AQUI Y NO PUEDE AVANZAR SIN EL HUMANO**: T5 y T6 son la pasada en el iPhone y su registro; T3 espera la base del preview; T4 es el PR, que exige el gate completo -hoy rojo por QC-82, deuda ajena-. El implementer **no delego** en `frontend_dev` ni `backend_dev`: no habia UI ni backend que escribir, y lo dijo en vez de inventar delegacion. **HALLAZGO QUE PIDE DECISION HUMANA**: **R18 no admite `feature_list.json`** en su lista blanca y el archivo aparece en el diff desde `da78282`, que es un paso del propio arnes -toda feature lo toca por proceso-. O R18 lo admite, o el bookkeeping va por otra via. El implementer **no toco el spec**: lo devolvio. |
| QC-107 | componente-de-carga-de-archivos | Documentos e IA | frontend | pending | feature/QC-107-componente-de-carga-de-archivos | **F1.0 y F1.1 hechos el 2026-09-21** (`107` del humano, elegida sobre QC-110 por desatascar el resto de la epica). Worktree montado desde `origin/dev` (`f97b594a`, el merge del PR #97) con `.env` copiado -el worktree nace sin el, ver *Deudas*-. `depends_on: QC-106, QC-111`, **las dos `done`**, y el board lo confirma: los dos issues en *Finalizado*. **Cupo `frontend`: 1 de 2** -QC-114, parada esperando un iPhone fisico-; la interseccion de archivos no se puede evaluar todavia (exige `tasks.md`) y queda de encargo para F1.4, aunque el riesgo es bajo por area: QC-114 solo escribe Markdown de evidencia. **`complexity: medium` la asigno el leader** y esta escrita como label en el issue: componente con seleccion multiple (hasta 10), una prop que decide el modo, estado por archivo leido de la consulta de QC-111 y su refresco; son varias capas de UI sobre un contrato ya cerrado, no una integracion externa. **PARADA EN F1.2**: la `description` declara **tres cosas abiertas** -estados de la pantalla (vacio, cargando, error), donde se monta y como se refresca el estado- y **no existe `specs/QC-107-componente-de-carga-de-archivos/requirements.md`**, asi que toca `/afinar-feature` antes del `spec_author`. **Lo que esta ficha desatasca**: QC-131 (prompts definitivos en Vercel y su revision firmada) la tiene como bloqueante, y es lo que por fin permite DISPARAR una lectura real de extremo a extremo. **F1.2 y F1.3 hechos el 2026-09-21** (`76fa3d56`): `spec_author` entrego **R1-R22** y **17 tasks**, **semilla intacta verificada por diff** -borra UNA linea, la del marcador- y las 6 decisiones cerradas mas las 7 heredadas citadas, ninguna huerfana. Tarjeta a *En revision* y comentada. **F1.4 APROBADO el 2026-09-21** por el humano; **la aprobacion vino POR CHAT, no arrastrando la tarjeta**, asi que la movio el leader a *En curso* y queda dicho aqui quien la movio. **Cupo `frontend`: 2 de 2** con QC-114; **cruce de archivos comprobado ya con `tasks.md` en la mano** -el encargo que quedo de F1.0-: la unica interseccion es `feature_list.json`, que toca toda feature por proceso, y QC-114 solo escribe `docs/verificacion-ios/QC-114.md`. Cero solape real. **TRES COSAS QUE EL SPEC DEJA DICHAS**: (1) **T12 -el montaje en formulas- nace BLOQUEADA** por la pregunta abierta 1, la del permiso `proveedores.modificar`, y el de proveedores no espera a nada; (2) **el E2E obliga a doblar TRES puertos del servidor**, no solo la cola y la IA -el gate corre sin red y Supabase no esta conectado, asi que ni firmar un enlace de subida funciona ahi-, y eso toca `lib/composition` y `playwright.config.ts`: es lo que mas superficie de produccion mueve; (3) **ninguna dependencia nueva**, asi que no hay fila que anadir a `docs/dependencias.md`. **Decision del `spec_author` que no estaba en la semilla**: la fase de subida del navegador se pinta como fase propia y NO como un quinto estado, y un archivo cuya subida falla se excluye del encolado en vez de tumbar la tanda (R6). |
| QC-121 | unidad-como-identidad-del-item | Inventario | fullstack | in_progress | feature/QC-121-unidad-como-identidad-del-item | **2026-09-19 (2a sesion): DECISION HUMANA** — los 5 rojos `23001` vs `23503` de Postgres 18.6 se **aceptan como ajenos** para cerrar QC-121 (T13 y PR), documentados como diferencia de version; no se exige Postgres 17 local. `--rapido` relanzado sin liberar memoria, por orden del humano. **2026-09-19: F2.1 RETOMADA** (`retoma 121`). T1-T3 commiteadas (`7a5ea4b`); T4 y parte de T14 estaban sin commitear (28 archivos + `product-stock.int.test.ts` sin trackear, `tsc` verde): se relanzo el implementer. **T4+T14 commiteadas (`0cf2545`), bitacora `6f6d18d`, AUN SIN `[x]`**: `--rapido` se corto por falta de memoria de la maquina (typecheck y lint verdes; unit 2486/0, guardias 588/0, `product-stock.int` 9/9). Rojos de integracion ajenos: 3 de `list-query-products` (los arregla T6) y 5 `23001` vs `23503` por Postgres local 18.6 (`docs/verification.md`: el objetivo es 17). **PARADA esperando al humano**: relanzar `--rapido` y la base local en Postgres 17 antes de T13. Sin PR hasta el reviewer. **F2.0 HECHO el 2026-09-18; F2.1 lanzada.** QC-92 mergeo ANTES (PR #91), asi que el spec se **ENMENDO** (`6fc4685`, R29-R34, T14-T15: el ajuste de lote recalcula `products.stock`; cifras re-medidas: errores 49->50, indices 34->35, tres caminos de escritura de lotes) y el humano **APROBO la enmienda** con todas las recomendadas (`updated_at` del producto no cambia en el ajuste; panel de lotes «nombre · unidad»; se sigue ajustando un lote de un producto dado de baja). Cupo `fullstack`: **2 de 2** con QC-92 (mergeada pero aun sin cerrar por su sesion). Cruce con **QC-125** (frontend, otra sesion): comparten **solo** `tests/unit/recetas-ui/recipe-form.test.tsx`; se acepta. **SPEC APROBADO por el humano el 2026-09-18 («aprobado»), incluidas las siete decisiones que no salian de la acotacion. F2.0 BLOQUEADO**: QC-92 esta *En curso* en el board pero su rama no esta en `origin` ni en esta maquina, asi que el cruce de archivos no se puede hacer. La tarjeta sigue en *En revision* hasta F2.0. Acotada con `/afinar-feature` (15 decisiones, 1 pregunta abierta; board corregido antes de sembrar). `spec_author` entrego **R1-R28** y **13 tasks**, **15 de 15 decisiones citadas**, semilla **verificada intacta por diff**; lo commiteo el leader (`4010b1e`) porque su sesion no tenia shell. Tarjeta en *En revision* con comentario. **SIETE COSAS PARA DECIDIR EN F1.4, que no salen de la acotacion**: `products.unit_id` ANULABLE (NULL = sin lotes); codigo nuevo `presentation_unit_locked` (catalogo 46->47) y el choque entre la cabecera de `error-codes.ts` que exige citar la ficha y `docs/conventions.md` que lo prohibe; `ProductView` cambia `stockByUnit` por `stock`+`unitId`; las lineas precargadas del selector de receta muestran solo el nombre; la mezcla previa pasa en silencio (D6); la carrera de dos altas simultaneas con mismo nombre y unidad sigue abierta, sin indice unico; QC-92 hereda recalcular `stock` y el mismo bloqueo. **D2 y D7 van por DISPARADORES** en `product_batches` y `presentations`. Guardias que se pondran rojas: tabla en `design.md > 12.2`. **F2.0 sigue bloqueado** hasta cruzar archivos con QC-92, que no esta en esta maquina. Historial: **F0, F1.0 y F1.1 hechos el 2026-09-18** (`121` del humano). **F0**: la ficha **no estaba en disco** —se creo en el board despues de la ultima importacion— y se importo; de paso el board trajo QC-59 `done`, **QC-92 `in_progress`**, QC-119 `cancelled` (nueva en disco) y QC-96 sigue `spec_ready` (columna *En revision*). Worktree montado desde `origin/dev` (`b8e3d5e`, que ya trae QC-59) con `.env` copiado. `zone:fullstack` venia del board; **`complexity:high` la asigno el leader y se escribio en Jira**: migracion (vuelve `products.stock`), rechazo nuevo en el alta de lote que **deroga D7 de QC-91**, datos existentes con lotes en dos unidades, y posible aviso en pantalla. Se reevalua tras acotar. No se parte en dos, como ninguna `fullstack` reciente. `depends_on: QC-91`, **`done`**. **Cupo `fullstack`: 1 de 2** (QC-92), asi que cabe por numero. **PERO el cruce de archivos con QC-92 es CASI SEGURO**: las dos tocan lotes y existencia de inventario, y **QC-92 no tiene rama ni worktree en esta maquina**, asi que su `tasks.md` no se puede leer. Mismo criterio que QC-68 con QC-50: **solo Fase 1**, y **F2.0 espera** a poder cruzar con QC-92 o a que cierre. **Siguiente paso: F1.2 con `/afinar-feature`**: la ficha declara por escrito **cuatro cosas por acotar** —si `products.stock` se guarda o se deriva; que pasa con los productos que ya tienen lotes en dos unidades; si el rechazo va en el alta del lote, del producto o ambos; y si el nombre duplicado necesita aviso en pantalla—. |

## Evaluaciones

### QC-151 - CREADA al acotar QC-122 y ACOTADA con `/afinar-feature` (2026-09-23)

`fullstack`, **`complexity: medium`** (label en Jira). **9 decisiones cerradas, cero abiertas** en `specs/QC-151-cotizacion-del-coste-en-el-pedido/requirements.md`. Cupo `fullstack` 2 de 3 (QC-121, QC-141). Worktree montado. Siguiente: F1.2.

### QC-122 - F1.0 y ACOTADA con `/afinar-feature` (2026-09-23)

`zone: frontend`, **`complexity: medium`** (leader, label en Jira). Dependencias QC-68 y QC-123 `done`. **Cupo `frontend` 1 de 2** (QC-107). Worktree montado desde `dev`. **8 decisiones cerradas (3 heredadas de QC-68/QC-123, 5 nuevas), cero abiertas** en `specs/QC-122-busqueda-y-total-en-la-pantalla-de-pedidos/requirements.md`; board actualizado antes de sembrar. **F1.2 y F1.3 hechos**: R1-R25, T1-T8 (rama pusheada), semilla intacta; tarjeta en *En revision*. **F1.4 APROBADO el 2026-09-23 por chat, con cambio de alcance**: el IMPORTE SALE (va a QC-151, nueva, fullstack) y QC-122 queda solo en busqueda (R17-R25b retirados sin renumerar, R26 nuevo, T1-T6). **F2.0 hecho**: `in_progress`, tarjeta *En curso*; cupo `frontend` 2 de 2 con QC-107, sin cruce de archivos (documentos vs pedidos).

### QC-150 - CREADA del chat y ACOTADA con `/afinar-feature` (2026-09-23)

Creada en el board (épica Inventario) a pedido del humano; **10 decisiones cerradas y 3 preguntas abiertas** en `specs/QC-150-producto-terminado/requirements.md`. `complexity:high`, **bloqueada por QC-141** (existencia decimal). Absorbe el «contenido de la presentación» de QC-130, que sigue cancelada (comentado en su issue). **F1.0-F1.3 hechos el 2026-09-23**: worktree montado; `spec_author` entrego **R1-R37 y T0-T13** (rama pusheada), semilla intacta por diff; tarjeta en *En revision*. **F1.4 APROBADO el 2026-09-23 por chat**: 9 preguntas cerradas (D11-D21), enmienda al catalogo aprobada (`presentation_without_content`, `no_whole_package`), R1-R44, sin preguntas abiertas. **Queda `spec_ready` y la tarjeta en *En revision* a proposito: F2.0 espera a que QC-141 este `done`** (T0 lo exige). **Solapa fuerte con QC-141 (va detras) y QC-145 (no en paralelo).**

### QC-132 y QC-130 - CERRADAS (2026-09-23)

QC-132 `done` (PR #110, `b7e64eb9`) y QC-130 `cancelled` al acotarla; QC-133 `cancelled` (absorbida). Resumen en `progress/history.md`.
**Quedan abiertos**: (1) carpetas `.worktrees/QC-130-...` y `.worktrees/QC-132-...` sin borrar (archivo en uso en Windows; ramas ya desregistradas), borrar a mano; (2) **`dev` con 3 rojos de `cd7f07a6`**, arreglo en `fix/rojos-de-cd7f07a6` (PR aparte); (3) **QC-114 `pending` por decision humana** con spec aprobado, worktree y rama intactos: retoma directo en F2.1; (4) QC-138 y QC-139 citan «dato incompleto (QC-130)» para un caso que ya no ocurre: se corrige en su acotacion.

### QC-145 - ACOTADA con `/afinar-feature` (2026-09-22) y DESBLOQUEADA (2026-09-23)

Alcance, **12 decisiones cerradas** (11 + la presentacion que anadio QC-146) y **1 pregunta abierta** en
`specs/QC-145-pedidos-terminados-en-asignacion/requirements.md`. El alcance **crecio** al acotarla: la edicion
en Pedidos deja de cambiar el estado. **Desbloqueada el 2026-09-23**: QC-144 (PR #107) y QC-146 (PR #109) `done`.
Pendiente F1.0 (`complexity`) y F1.2.

### QC-147 - CERRADA (2026-09-23)

Nacio del chat el 2026-09-22, acotada (16 decisiones), PR #108. Resumen en `progress/history.md`.
QC-120 cancelada en el board: la absorbio.

### QC-146 - CREADA y ACOTADA con `/afinar-feature` (2026-09-22)

Nace en el board a pedido del humano («pedidos debe tener presentacion») e importada sola. Alcance y
**13 decisiones cerradas** en `specs/QC-146-presentacion-del-pedido/requirements.md`. Board: descripcion
de QC-146 reescrita; QC-145 gana la presentacion en «Terminados» y queda **bloqueada por QC-146**.

### QC-144 - ACOTADA con `/afinar-feature` (2026-09-22)

Alcance y **9 decisiones cerradas** en `specs/QC-144-rol-empacador/requirements.md`. Nace **QC-145**
(`pedidos-terminados-en-asignacion`, `pending`, bloqueada por QC-144); la vieja ficha en disco `id: 142` sin `key` pasa a ser QC-144 (el `QC-142` real del board es `permiso-propio-de-documentos`).

### QC-121 - acotada con `/afinar-feature` (2026-09-18)

Alcance, **15 decisiones cerradas** y **1 pregunta abierta** (la unidad de la linea de receta) en
`.worktrees/QC-121-unidad-como-identidad-del-item/specs/QC-121-unidad-como-identidad-del-item/requirements.md`
(sembrado DENTRO del worktree). No se copian aqui. **El board se corrigio ANTES de sembrar**: la `description` pedia **rechazar** el lote en otra unidad y el humano decidio **crear otro producto**. Ninguna ficha nueva ni cancelada. **Deroga tres decisiones de QC-91** (D6 «se calcula, no se guarda», D2 «orden y filtro se pierden», D7 «sin rechazar ni crear en el alta»). Sigue `pending`: la mueve el leader en F1.3.

### QC-110 - ACOTADA con `/afinar-feature` (2026-09-21)

Alcance, **18 decisiones cerradas** y **3 preguntas abiertas** en
`specs/QC-110-recorte-de-imagenes-del-pdf/requirements.md`. No se copian aqui. (El conteo de 17
que dijo el leader al acotar estaba mal por uno; la tabla trae 18 filas.)

**F1.2 y F1.3 hechos el 2026-09-21.** `spec_author` entrego **R1-R23** y **18 tasks** (T0-T17),
**semilla verificada intacta por `git diff`** -el diff borra UNA linea, la del marcador- y las
**18** decisiones citadas, ninguna huerfana. Tarjeta movida a *En revision*. **F1.4 APROBADO el 2026-09-21** por el humano, por chat; la tarjeta la
movio el leader a *En curso* y se deja dicho quien la movio. **La aprobacion del spec INCLUYE la
dependencia**: `sharp` ya tiene su fila en `docs/dependencias.md` con los cuatro checks del
2026-09-21. **Cupo `backend`: 1 de 2.**

**LOS CUATRO HALLAZGOS DEL DESIGN (§0) ENTRAN A F2 SIN CERRAR, y hay que decirlo**: (1) la ficha
pondra en rojo `tests/unit/documentos/qc111-alcance.test.ts` -hoy verde, 33 casos, comprobado- y
T13 la enmienda, que es tocar el test de OTRA ficha; (2) **se rasteriza DOS VECES por archivo de
`catalogo`**, aceptado y declarado, y eso pesa mas de lo que parece porque rasterizar es el paso
sin plazo propio y `maxDuration` esta en 300 s; (3) que `sharp` cargue en el runtime de Vercel es
**DESCONOCIDO**, igual que quedo `@napi-rs/canvas`; (4) las tres preguntas abiertas siguen **sin
mitigacion a proposito**, y la que mas pesa es que **no hay tope de recortes por PDF**.

**La ficha declaraba TRES preguntas abiertas y salieron OCHO mas al mirar el codigo.** Las dos que
cambiaban el alcance: el puerto `AiReader` devuelve TEXTO PLANO -QC-108 lo cerro asi-, y las
coordenadas son datos estructurados; y `DocumentStorage` esta atado a UN bucket y **no sabe subir
bytes desde el servidor**, solo firmar subidas para el navegador. Se resolvieron sin tocar ninguno
de los dos: el JSON viaja dentro del texto y lo interpreta esta ficha, y nace un puerto propio del
recorte con una sola operacion.

**DEPENDENCIA NUEVA APROBADA: `sharp`**, con los cuatro checks verificados el 2026-09-21
(v0.35.4 del 2026-08-26, 72.211.349 descargas/sem, Apache-2.0, sin deprecated). El dato que
decidio: **ya estaba instalada como `optionalDependency` de `next@16.3.0`**, asi que declararla no
hace crecer el arbol. NO sustituye a `@napi-rs/canvas` -una rasteriza paginas, la otra recorta
regiones- y entra en `serverExternalPackages` junto a ella. `complexity: medium`, con QC-106 como
patron de medida.

### QC-140 - ACOTADA con `/afinar-feature` (2026-09-21)

Alcance, **13 decisiones cerradas** y **5 preguntas abiertas** en
`specs/QC-140-catalogo-visual-de-proveedores/requirements.md`. No se copian aqui.

**El alcance CRECIO al acotarla y el board se corrigio ANTES de sembrar.** Nacio como «otra vista»
y quedo como **sustituta** de la lista de proveedores de QC-44: `/proveedores` pasa a ensenar cada
proveedor con el carrusel de sus productos. El alta, la edicion y la baja se mudan a
`/proveedores/<id>`, que QC-44 ya monta, asi que **QC-44 no queda huerfana y no se cancela** -esta
`done` y su nivel 2 sigue vivo-; se le dejo un comentario en el issue diciendolo. QC-140 gano
`complexity:high`.

**Dos cosas que conviene no perder.** (1) La carga perezosa va **con libreria por decision humana**,
y eso arrastra la regla 7: la candidata la propone `spec_author` y la aprueba el humano en **F1.4**,
con los cuatro checks y su fila en `docs/dependencias.md`. Nadie instala nada antes. (2) La imagen
**reutiliza** `EntityImage` y `MISSING_IMAGE_SRC`, verificado en codigo: ya cubre `null`, cadena
vacia y ruta que no resuelve, asi que la ficha no modela ni migra nada de imagen.

**Nacio tambien QC-139** (proveedores de lo que falta al ingresar un pedido), que aterriza en esta
misma pantalla. Se importo a `feature_list.json` junto con QC-140 y **sigue sin acotar**: tiene 4
preguntas abiertas. Se alineo con QC-138 el mismo dia -bloqueo «is blocked by» y su pregunta de
«que cuenta como inventario insuficiente» cerrada citando lo que QC-138 ya fijo-.

### QC-138 - ACOTADA con `/afinar-feature` (2026-09-21)

Alcance, **16 decisiones cerradas** y **3 preguntas abiertas** en
`specs/QC-138-estado-bloqueado-por-inventario-insuficiente/requirements.md`. No se copian aqui.

**Dos cosas que conviene no perder.** (1) La acotacion **DEROGA** una decision cerrada de QC-123:
el importe dejaba de cambiar por movimientos de inventario, y ahora un pedido que se desbloquea
**recalcula su importe** con los lotes de ese dia. Aceptado a sabiendas por el humano. (2) Nacio
**QC-141** (`reserva-de-material-del-pedido`) y **bloquea a QC-138**: sin reserva, dos pedidos
creados el mismo dia cuentan con el mismo material y los dos se ven cubiertos. `complexity` sube a
**`high`** y el board se corrigio antes de sembrar.

### QC-107 - acotada con `/afinar-feature` (2026-09-21)

Seis decisiones cerradas y dos preguntas abiertas, en
`specs/QC-107-componente-de-carga-de-archivos/requirements.md`. El board se corrigio ANTES de
sembrar: la `description` de QC-107 se reescribio y **nacio `QC-137` (sistema de notificaciones
por rol)**, en la epica Plataforma, `pending` y sin acotar. **El tiempo real salio de QC-107 a
proposito**: Realtime por Postgres Changes con la anon key no puede acotar por empresa
-`docs/architecture.md:372` y la sesion, que es la cookie de `identity` y no Supabase Auth-, asi
que esa decision, su dependencia y la enmienda al documento son de QC-137.

### QC-107 - seleccionada en F1.0 (2026-09-21)

El humano la eligio por numero tras cerrarse QC-111. Con QC-111 en `done`, la epica
**Documentos e IA** desbloquea **dos** fichas a la vez -QC-107 y QC-110-, y se tomo QC-107 por
tres razones escritas: **QC-131 la espera** como bloqueante, es lo unico que permite **disparar
una lectura real** de extremo a extremo, y **no arrastra dependencia nueva** -QC-110 si: la
libreria de recorte, con la regla 7 entera por delante-.

**`zone: frontend`** ya venia del board; **`complexity: medium`** se asigna aqui. El motivo: el
componente monta seleccion multiple de hasta 10 PDFs, una prop que decide el modo de conversion
y la vista de estado por archivo leida de la consulta que QC-111 ya publico. Son varias capas de
UI sobre **contratos ya cerrados** -QC-106 sube, QC-111 encola y expone el estado-, no una
integracion externa: por eso no es `high`. Si la acotacion decide que el refresco exige algo mas
que una consulta con SWR -por ejemplo un canal en vivo-, reevalua.

**Cupo `frontend`: 1 de 2** contando QC-114, asi que entra sin forzar nada. La interseccion de
archivos con QC-114 no se puede evaluar hasta que exista `tasks.md` -encargo para F1.4-, pero el
riesgo es bajo y conviene decir por que: QC-114 solo escribe `docs/verificacion-ios/QC-114.md`,
no toca componentes.

**PARADA EN F1.2 y no es una formalidad.** La `description` declara tres cosas abiertas -los
estados de la pantalla, **donde se monta** el componente y **como se refresca** el estado por
archivo- y ninguna se rellena con un supuesto (regla 6). «Donde se monta» es la que mas pesa:
hoy no consta ninguna pantalla que lo hospede, y sin eso no hay ruta, ni permiso, ni E2E que
escribir.

**Deuda vista al montar, y no es de esta ficha**: el `dev` local del arbol principal va **un
commit por delante de `origin/dev`** (`77f1092b`, el cierre en disco de QC-111 y QC-123). Por eso
la copia de `progress/current.md` y de `feature_list.json` de este worktree todavia pinta QC-111
y QC-123 como `in_progress`. No se toco: empujar `dev` es del humano. Es la tercera vez que
aparece este patron (ver *Deudas*).

### QC-114 - seleccionada en F1.0, y la ejecuta una persona (2026-09-18)

El humano la eligio por numero con el cupo `frontend` a **0 de 2**. `depends_on: QC-56` esta
`done`, que es justo la condicion que la ficha exige para hacer **una sola pasada** sobre las
nueve pantallas en vez de nueve pasadas sueltas.

**`zone: frontend`** (ya venia del board) y **`complexity: medium`** asignada aqui. El motivo
importa, como en QC-92: la pasada es una checklist acotada, pero **el alcance depende del
resultado**. Si la columna fijada se mueve o el scroll se lo come el body, lo que se arregla es
el **componente compartido de QC-55** -no la pantalla-, y eso lo montan las nueve: ahi
reevalua a `high`.

**Esta feature no la puede ejecutar ningun agente, y no es una limitacion del arnes sino el
punto entero de la ficha.** La T13 de QC-55 nunca se hizo, QC-55 la paso a QC-56 y QC-56 la saco
aqui. La cobertura en jsdom y el E2E en WebKit de **escritorio** no la sustituyen: `position:
fixed` dentro de un scroll anidado se comporta distinto en Safari de iOS, que es exactamente lo
que `docs/architecture.md > Regla: multiplataforma` manda comprobar en dispositivo. Lo que el
arnes aporta es el **protocolo** -que se toca, en que orden, en que pantallas- y el **registro de
evidencia**; el dedo sobre el cristal lo pone el humano.

**Dos preguntas abiertas que F1.2 tiene que cerrar y no se rellenan con un supuesto**:
(1) **donde vive la evidencia** de una prueba manual -un `docs/` con la checklist firmada, un
comentario en el issue, capturas- y que la hace auditable despues; y (2) **que pasa si falla**:
si el arreglo del componente entra en este mismo PR -y entonces `complexity` sube- o nace como
ficha aparte y QC-114 cierra como "probado, con hallazgos". Sin eso, no hay forma de escribir un
`tasks.md` que el reviewer pueda juzgar.

**ACOTADA con `/afinar-feature` el 2026-09-18**: las nueve decisiones cerradas y las dos
preguntas abiertas viven en
`.worktrees/QC-114-tabla-compartida-en-iphone-real/specs/QC-114-tabla-compartida-en-iphone-real/requirements.md`.
La acotacion **corrigio la `description` en el board**: la ficha listaba nueve pantallas de una
lista de 2026-09-15 que ya no coincide con la guardia viva de `data-table-alcance.test.ts` -no
tenia `asignacion`, alta del 2026-09-16, y nombraba un «catalogo de proveedor» que no es ruta
propia-. **Deuda que sale de aqui**: se fijo **iOS 16+** como minimo, y eso hay que escribirlo en
`docs/architecture.md > Regla: multiplataforma` por **`/afinar-regla`** — este comando no toca
reglas del arnes.

**Cruce de archivos**: `frontend` esta a **0 `in_progress`**, asi que la regla no lo exige. Las
otras dos en curso son de otra zona -QC-92 `fullstack`, QC-109 `backend`- y ninguna toca el
componente de tabla compartida.

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

- **2026-09-23 · restos de worktree en disco**: `.worktrees/QC-146-presentacion-del-pedido` y `.worktrees/QC-147-cantidades-de-receta-en-porcentaje` ya no estan registrados en git, pero sus carpetas siguen con `node_modules` bloqueados por Windows (proceso node vivo). Borrarlas a mano cuando no haya servidores ni E2E corriendo. Las ramas locales tambien quedan: ya estan mergeadas. La base `QuimiCloude_QC147` sobra y se puede borrar.
### El E2E de dev tiene 11 rojos que no son de ninguna ficha en curso (2026-09-22)

Medido por el leader al cerrar QC-146, sobre `origin/dev` limpio (`bc902800`), chromium, un worker: fallan `cierre-de-sesiones` (cierra sesiones de otra persona), `documentos` R20, `errores` R33, `inventario` R26 y QC-90 R32, `permisos` (Operador aterriza en asignacion), `presentaciones` R36, `proveedores` R51, `session` (dos casos) y `usuarios` R4/R42. Los mismos fallan en la rama de QC-146, que no los toca. Nadie tiene la ficha: hace falta una en el board.

### El E2E de dos worktrees a la vez se pisa: mismo puerto 3117 y misma base (2026-09-22)

`playwright.config.ts` fija `E2E_PORT` y `reuseExistingServer: false`, y todos los worktrees comparten la base local. Con QC-147 corriendo su E2E, la de QC-146 no pudo arrancar (puerto ocupado) y sus corridas anteriores pudieron solaparse con las de QC-147. Hasta que el puerto y la base se aislen por worktree, **una sola E2E a la vez en la maquina**.

### Carpeta huerfana `.worktrees/tmp-e2e-baseline` (2026-09-22)

Copia temporal del leader para medir el baseline del E2E y el primer hotfix. Ya no es worktree registrado (`git worktree list` no la ve) y la rama se borro; queda la carpeta porque un proceso bloqueaba un archivo. Borrarla con `cmd /c rmdir /s /q` (NO con `git worktree remove --force` ni con enlaces dentro: asi se corrompio `node_modules` del hotfix).

### Un E2E de inventario acabó en la pantalla de login, una vez y sin explicación (2026-09-19)

En la primera corrida del E2E nuevo de QC-121 (`e2e/inventario.spec.ts`, «el mismo nombre en dos
unidades son dos filas», R26), tras `loginAndLand` la navegación a la ruta de inventario acabó en la
**pantalla de login**: `inventario-title` no apareció en 60 s y el `error-context` retrata el
formulario de acceso. **No se reprodujo**: tres corridas posteriores verdes, ese paso tarda 13-22 s, y
la hipótesis de la compilación fría se descartó **a propósito** borrando `.next` (pasó igual, 21,9 s).
No queda evidencia: aquella corrida no trae traza del servidor y su `error-context.md` fue sobrescrito.
Las dos causas posibles siguen vivas: la sesión se cae al navegar, o la ruta no había compilado.

**Si vuelve a aparecer, captúralo con `--trace on`** y mira si la navegación terminó en `/login`.
El reviewer de QC-121 lo aceptó como no bloqueante (R26 tiene respaldo determinista en integración)
**con la condición de anotarlo aquí**, no solo en la bitácora de la feature.
### El baseline pierde DOS entradas y conserva SEIS, y las dos decisiones van escritas (2026-09-19)

El gate verde de QC-111 avisa de **ocho** archivos del baseline que «ya pasan». No se borran los
ocho: se borran **los dos que esta rama arreglo de verdad**, y los otros seis se quedan con su
motivo.

**Borradas, porque su causa murio en esta rama:**

| Entrada | Por que ya no aplica |
|---|---|
| `tests/unit/navegacion/qc75-convenciones.test.ts` | su motivo nombraba UN caso —«package.json no gano dependencias respecto al merge-base»— que se quedo fuera de la precondicion de rama que ya protegia a sus hermanos. Es exactamente el caso que QC-111 acoto, y la salida limpia que el propio motivo pedia: «llevar ese unico caso DENTRO de la misma precondicion de rama». Hecho |
| `tests/unit/unidades/unidades-convenciones.test.ts` | su motivo, ampliado en QC-79, decia que el unico rojo vivo era «R35 — las dependencias son EXACTAMENTE las de origin/dev». Ese caso ahora salta fuera de la rama de QC-38, que es la salida limpia que el motivo pedia |

**En `dev` seguiran verdes despues del merge**, que es la pregunta que importa antes de borrar una
entrada: las dos acotaciones saltan el caso cuando el rango **no** es el de su ficha, y en `dev` no
lo es. No se retira una red para que otro la pise.

**Los otros seis se quedan**, y el motivo es el mismo que escribio QC-92: que hoy pasen no significa
que su causa haya muerto. Las cinco estructurales pasan **segun la rama desde la que se mire** —son
guardias que censan el diff, asi que su color depende de quien pase por ahi—, y
`product-crud.int.test.ts` es un flake de saturacion cuya propia entrada fija la condicion de
retirada: **tres corridas completas seguidas** con el archivo dentro. Esta es una. Borrarlas hoy es
plantar el rojo en la rama siguiente.

### La guardia de QC-129 afirma la ausencia de dos variables que el propio repo te manda tener (2026-09-19)

**ENCARGO: ficha en el board, junto a la de las guardias de alcance.** Es la misma especie, en otro
disfraz: una afirmacion absoluta sobre el entorno en vez de sobre el arbol.

**Lo medido.** `tests/unit/composition/documentos-facade.test.ts` —en `dev`, nacido en QC-108 y
ampliado por QC-129— afirma `expect(process.env.CATALOG_PROMPT).toBeUndefined()` y lo mismo para
`FORMULA_PROMPT`. Vitest carga el `.env` en `process.env`, asi que basta con que la variable **este
declarada**, aunque sea vacia, para que el caso caiga con `expected '' to be undefined`.

**Y el repo te manda declararla**: `.env.example` trae `CATALOG_PROMPT=` y `FORMULA_PROMPT=` en sus
lineas 175 y 179, y el procedimiento de montar un worktree es **copiar ese archivo**. O sea que el
camino documentado produce el rojo. No es la maquina de nadie: le pasa a cualquiera que siga las
instrucciones.

**Lo vivio QC-111 en F2.3**: el merge con `dev` trajo el caso, el gate se puso rojo y el rojo **no
era de la rama**. Se desbloqueo quitando las dos lineas del `.env` local **por decision del humano**
—su valor era un par de comillas invertidas vacias, que QC-129 rechaza igual—, con copia de
seguridad del archivo original.

**Lo que NO vale hacer**: meter `documentos-facade.test.ts` en `tests/baseline-rojos.json`. Ese
archivo es el censo de la fachada que QC-111 acaba de arreglar —fue el bloqueante 5 de su review— y
listarlo apagaria el archivo ENTERO para el comparador, desarmando justo lo que se arreglo.

**La salida limpia, y no la decide una ficha en vuelo**: que el caso no dependa de que la variable no
exista —`vi.stubEnv`, o borrarla del entorno dentro del propio caso— para que siga afirmando lo que
de verdad quiere afirmar: que **construir la fachada sin prompt no lanza**. Toca el **R2 de una ficha
`done`**, con el precedente de la T3 de QC-81.

### Queda al menos una guardia ciega con CRLF fuera de las cinco que ya se arreglaron (2026-09-19)

**Medido en QC-111, no supuesto.** El gate completo del 2026-09-19 saco rojo
`tests/unit/pedidos/module-contract.test.ts` afirmando que `lib/composition/index.ts` consulta
`prisma.order`. **No lo consulta**: lo NOMBRA en un comentario de linea que explica quien NO puede
escribirlo —el comentario existe desde QC-87—. El barrido lo leyo como codigo.

**La causa es la que `progress/fix-guardias-crlf.md` ya tiene escrita**, y es exactamente el mismo
defecto: `leerFuente` despoja comentarios con `/\/\/.*$/` **sin normalizar `\r\n` antes**. Sobre una
linea acabada en `\r` esa regex no casa —`.` no consume `\r` y `$` sin la bandera `m` no ancla antes
de el—, asi que el comentario **sobrevive entero** al despojado. Aquel arreglo cubrio **cinco**
guardias de `tests/guards/`; los `module-contract` de `tests/unit/` **se quedaron fuera**, y este
comparte el mismo ayudante.

**Por que no se vio hasta hoy y por que no es rojo de la rama.** `.gitattributes` fija `eol=lf`, asi
que un checkout limpio no reproduce nada: el indice guarda LF. Lo que hubo aqui fue una **copia de
trabajo con CRLF** —archivos reescritos por herramienta durante la ficha—, y el gate corrio sobre
ella. Normalizada la copia (`rm` + `git checkout` de los ocho archivos con `i/lf w/crlf`), el caso
vuelve a verde sin tocar ni una linea de la guardia. **En el commit nunca hubo CRLF.**

**La deuda que queda, y es real:** la guardia sigue siendo ciega, y solo la protege que nadie edite
con CRLF. `.gitattributes` es una red, no el arreglo. Lo mismo que se hizo con las cinco —normalizar
`\r\n?` a `\n` como PRIMER paso del despojado, con su test de regresion— hay que hacerlo con los
`module-contract` que usen `leerFuente`. **Cabe en la misma ficha** que la deuda de arriba: las dos
son «la guardia mide mal, no la regla esta mal».

### Las guardias de alcance escritas como absolutos muerden a quien viene detras (2026-09-18)

**ENCARGO DEL HUMANO: abrir ficha en el board CUANDO CIERRE QC-111.** No antes, para no partir la
atencion de la ficha en vuelo.

**Lo medido, y no es una impresion.** QC-111 choco con **cinco** guardias de alcance de fichas **ya
cerradas**, y **ninguna encontro un defecto**: las cinco afirman «el repo no tiene X» cuando QC-111
tenia permiso explicito para anadir X —una dependencia que el humano aprobo en F1.4 y el primer
Route Handler del repo, que su propio spec manda construir—.

| Guardia | Que afirma de mas |
|---|---|
| `tests/unit/navegacion/qc75-convenciones.test.ts` | que QC-75 no anade dependencias... midiendo el repo entero |
| `tests/unit/unidades/unidades-convenciones.test.ts` | `package.json` identico a `origin/dev` |
| `tests/unit/pedidos-ui/pedidos-convenciones.test.ts` | ningun Route Handler en **todo** `app/` |
| `tests/unit/composition/documentos-facade.test.ts` | censo cerrado de la fachada (este SI era de QC-111) |
| `tests/unit/identity/schema/identity-schema.test.ts` | ningun enum cuyo NOMBRE case el patron del tipo de documento |

**El repo ya se lo habia dicho a si mismo.** `tests/guards/guard-identificador-de-request.test.ts`
lo lleva escrito en un comentario sobre su propio conteo: que ser un absoluto es fragil y conviene
saberlo, porque no distingue una libreria colada de una aprobada, y que **lo robusto seria comparar
contra el merge-base de la propia rama en vez de contar absolutos**.

**Precedentes de que esto ya venia pasando**: QC-33 acoto `identity-schema` el 2026-09-03 por lo
mismo, y QC-111 tuvo que acotarla otra vez el 2026-09-18. Dos fichas distintas, la misma guardia,
por la misma causa.

**Lo que la ficha tendria que decidir** (no se rellena aqui con un supuesto): si el criterio es
comparar contra el **merge-base de la propia rama**; si las guardias de una ficha ya cerrada deben
**congelarse** en vez de seguir midiendo el presente; y quien paga la reescritura de las cinco. El
`reviewer` de QC-111 lo pidio por su cuenta «con ficha propia» y dijo que **el criterio cabe en una
linea**.

**Lo que NO es**: ninguna de las cinco esta mal escrita ni sobra. Lo que sobra es su **alcance**.

### Los nombres de columna de `docs/jira.md` no son los del board (visto en F0, 2026-09-18)

`docs/jira.md` documenta cinco columnas **Backlog / Spec en revision / En curso / Hecho /
Cancelado**. El board real responde con **Por hacer / En curso / En revision / Finalizado /
Cancelado** (comprobado en las transiciones del issue QC-123, ids 11/21/31/41/2). El mapeo a
`status` no cambia -`pending` / `in_progress` / `spec_ready` / `done` / `cancelled`-, pero un
importador que compare por el nombre escrito en el doc marca **todo el board** como divergente.
No se toca `docs/jira.md` desde aqui: es una regla del arnes y va por `/afinar-regla`.

### La tarjeta de QC-114 esta en *Por hacer*, no en *En curso* (visto en F0, 2026-09-18)

El disco la tiene `in_progress` y `progress/current.md` dice que la tarjeta se movio a *En curso*
al aprobar F1.4. El board la devuelve en **Por hacer**. Se aplica la proteccion de
`docs/jira.md > Si Jira y el disco divergen`: **una feature `in_progress` no se degrada**, asi que
la ficha se queda como esta. Falta saber si alguien la movio hacia atras o si la transicion nunca
llego a escribirse.

### El gate completo esta rojo por QC-82, y no es de esta feature (2026-09-18)

`./init.sh` en el arbol principal termina en
`faltan specs para features sdd en vuelo: QC-82`: la ficha esta `spec_ready` en disco y en
*En revision* en el board, pero **no existe `specs/QC-82-*`**. Bloquea cualquier PR -el gate
completo es condicion- y ya lo anoto QC-114. No lo arregla QC-123.

### El worktree de QC-127 quedó a medio borrar — DÉCIMA vez, y el guion lo dice al revés (2026-09-19)

`./scripts/wt.sh done QC-127-decimales-caso-r14-sin-actualizar` imprimió
`fatal: '...' is not a working tree` y después el aviso de siempre, «¿archivo en uso en Windows?».
**Y aun así terminó con código de salida 0**, que es la otra mitad del problema: el guion dice que
no pudo desmontar y devuelve éxito.

**Estado real, comprobado:** el directorio **existe** bajo `.worktrees/`, **no** aparece en
`git worktree list` y dentro **no hay `.git`**. Es el patrón exacto que documenta **QC-128**: el
desregistro corre antes del borrado, el borrado falla, y lo que queda es el peor de los dos estados
—git ya no lo conoce, así que ninguna corrida futura de `wt.sh` va a reintentarlo—.

**Nada se pierde.** Todo el trabajo está commiteado y en `dev`: el último commit de la rama
(`cfe483aa`) es ancestro de `dev`, y `feature/QC-127-decimales-caso-r14-sin-actualizar` figura en
`git branch --merged dev`.

**No lo borra esta sesión**, por la misma regla con la que no lo borró QC-108: los huérfanos que ya
están en disco los barre el humano, comprobando antes que la rama figura en `git branch --merged
dev` —ya comprobado arriba—. Lo arregla de raíz **QC-128**.

**Un detalle que este caso aporta y los nueve anteriores no:** dentro de ese directorio quedó un
`.env` **sin** `CATALOG_PROMPT` ni `FORMULA_PROMPT`, que es el que desbloqueó su gate. Al barrerlo
desaparece, y no hay nada que rescatar de él: el `.env` bueno es el del árbol principal.

### El `.env` del árbol principal deja el gate en rojo con un test que no es suyo (2026-09-19, QC-127)

Lo destapó el gate completo de **QC-127**, que no toca nada de documentos.
`tests/unit/composition/documentos-facade.test.ts` (de QC-129) borra las cuatro variables de Gemini antes
del import y luego afirma que están `undefined`. Recibe **cadena vacía**.

**Medido en tres corridas antes de tocar nada**, porque «será el `.env`» es una hipótesis y no un
diagnóstico:

1. **Reproduce aislado** (`vitest run` solo ese archivo): no es contaminación de otro archivo del mismo
   worker.
2. Con **`CATALOG_PROMPT=SENTINELA` en el shell** sigue recibiendo `''`, no `SENTINELA`: el valor **no viene
   del entorno ambiente**, lo reinyecta **Vitest desde `.env`** después del `delete` previo al import.
3. **Ningún código de producción asigna** esa variable; solo la lee `strategy-prompt-env.ts:20`.

**O sea que el fallo es del TEST, no del `.env`.** Afirma una precondición de entorno en vez de controlarla.
Una máquina de desarrollo tiene derecho a declarar esas variables: es lo que `.env.example` le pide desde
QC-129. Su hermano `tests/unit/documentos/strategy-prompt-env.test.ts` la pone, la borra y la restaura en
`afterEach`, y **por eso está verde**.

**Ojo con el atajo que no funciona:** rellenar las variables con un prompt de verdad **no** pone verde el
caso —exige `toBeUndefined()`—. La única forma de que pase hoy es que la línea **no esté**.

**Lo que se hizo, por decisión humana del 2026-09-19:** se quitaron las dos líneas del `.env` **del worktree
de QC-127**, que además estaban **vacías**, con copia previa y `diff` comprobado. **NO se tocó
`tests/baseline-rojos.json`** —R15 de esa ficha lo prohibía— ni el test ajeno, que habría ampliado su diff.

**LO QUE SIGUE ABIERTO: el `.env` del árbol principal CONSERVA las dos líneas**, así que cualquier gate
completo que se corra desde aquí sale con ese rojo hasta que entre **QC-134**, que es la ficha que lo arregla
de raíz. Mientras tanto, quien se lo encuentre **no** debe darlo de alta en el baseline: apagaría los tres
casos del archivo.


### El baseline de rojos NO se poda al cerrar QC-92, y el motivo va escrito (2026-09-18)

F2.6 manda atender el aviso de entradas que «ya pasan»: se borran, **o se escribe por que se
quedan**. Aqui se quedan **las ocho**, y no por pereza.

**Siete son ESTRUCTURALES**: sus casos comparan contra un rango de git (`origin/dev...HEAD`,
`merge-base`) y **fallan al correr SOBRE `dev`**, donde ese rango esta vacio, mientras **pasan en
cualquier rama de feature**, donde no lo esta. Que la suite de QC-92 las diera verdes es exactamente
lo que se espera de una rama: **no es senal de que la deuda este saldada**. Borrarlas dejaria el gate
de `dev` en rojo el dia siguiente. La octava es el flake de saturacion de QC-58, que tampoco se ha
arreglado.

La salida limpia sigue siendo la que sus propias notas describen desde el 2026-09-04: que cada caso
de rango **se salte explicita y ruidosamente** cuando el rango no existe, en vez de fallar. Es la
misma familia que persigue **QC-99**.

### El worktree de QC-108 quedó a medio borrar — OCTAVA vez, y el patrón ya no admite dudas (2026-09-18)

`./scripts/wt.sh done QC-108-lectura-de-pdf-con-gemini` falló con
`fatal: '...' is not a working tree` y el aviso `¿archivo en uso en Windows?`. Resultado: el
worktree **queda desregistrado de git** —no sale en `git worktree list`— **pero el directorio sigue
en disco**, con `progress/`, `specs/`, `tests/` y `node_modules` a medias. `lib/` sí se borró.

**No hay nada que perder, y está comprobado**: no queda `.git`, la rama
`feature/QC-108-lectura-de-pdf-con-gemini` **figura en `git branch --merged dev`**, el PR #87 está
mergeado (`1a95e9a`) y el árbol estaba limpio en el último commit. El único archivo suelto es
`_i.txt`, **un log de una corrida de QC-77 del 2026-09-12** que lleva arrastrándose entre worktrees.

**No se borró a mano** porque la regla de oro de `wt.sh` es «ante la duda, NO borra» y un borrado no
se deshace. Se borra con `rm -rf .worktrees/QC-108-lectura-de-pdf-con-gemini` y
`git branch -d feature/QC-108-lectura-de-pdf-con-gemini` cuando el humano lo diga.

**Lo que este octavo caso añade a los siete anteriores**: el fallo **no** es aleatorio ni es sólo
«archivo en uso». `wt.sh` desregistra ANTES de borrar el directorio, así que cuando el borrado falla
—y en Windows falla con `node_modules` abierto por cualquier proceso— el estado resultante es el
peor de los dos: git ya no lo conoce, así que **ninguna corrida futura de `wt.sh` lo va a volver a
intentar**, y el directorio se queda para siempre. Por eso van ocho y ninguno se ha recuperado solo.
La salida limpia es invertir el orden —borrar primero, desregistrar después— o desregistrar sólo si
el borrado tuvo éxito. Es material para `/afinar-regla`, junto con lo del baseline y los plazos.

### El gate completo da un rojo que NO es rojo: `product-page.test.tsx` se pasa de los 20s bajo carga (2026-09-18)

`./init.sh` completo del 2026-09-18 salio con **1 fallo de 7864 tests** y lo declaro como rojo nuevo
respecto del baseline:

    FAIL |ui| tests/unit/inventario/product-page.test.tsx
      > un guardado rechazado por un campo muestra el error en linea y no cierra el panel
      Error: Test timed out in 20000ms.

**Corrido solo, ese archivo pasa 59/59 en 53s.** La corrida completa duro **868s** con la maquina
cargada: es el patron de QC-58 (`timeout-tests-ui-bajo-carga`), no una regresion.

**NO se metio en `tests/baseline-rojos.json` a proposito.** El baseline es para deuda real y
permanente; un flake intermitente ahi taparia un rojo de verdad el dia que ese archivo se rompa.
Queda anotado aqui. Si reaparece en varias corridas seguidas, la salida no es el baseline: es subir
el `testTimeout` de ese archivo o aligerar su setup.

### `dev` local iba 6 commits por delante de `origin/dev`, sin pushear (2026-09-18) — RESUELTA el mismo día

Entre ellos `13691f4`, que arregla que el gate salga con código 0 declarando rojos, y la bitácora de
QC-92 y QC-68. **Cualquier worktree montado desde `origin/dev` nacía sin eso** — le pasó al de
QC-108, y se corrigió con un fast-forward a `dev` local.

**Se pusheó el 2026-09-18** (`b625ca9..cbf0569`), por decisión del humano y antes de abrir el PR de
QC-108, para que ese PR no arrastrase seis commits de papeleo de otras dos fichas. `dev` y
`origin/dev` habían **divergido** (6 contra 3), así que hubo que traer `origin/dev` primero.

**Lo que queda dicho, porque volverá a pasar**: un worktree se monta desde `origin/dev`, no desde el
`dev` local, así que todo lo que viva sin pushear es invisible para la siguiente feature.

### `./init.sh --rapido` no puede ver una guardia de censo que vive en `tests/unit/` (2026-09-18, QC-92)

**Medido, no supuesto.** `tests/unit/inventario/schema/inventario-schema.test.ts` estuvo **rojo
desde la tanda 1 de QC-92** (commit `842d63d`, que anadio el modelo `InventoryMovement` y la
back-relation `movements`) y **las tandas 1 y 3 se cerraron con el gate rapido en verde**. Tres de
sus cuatro rojos llevaban tres tandas escondidos; el cuarto lo anadio T8.

**Tres causas simultaneas, las tres sobre `scripts/test-rapido.mjs`:**
1. `changedFiles()` filtra el diff a `.ts|.tsx|.js|.jsx|.mjs|.cjs`: **`.prisma` y `.sql` quedan
   fuera**, asi que una migracion o un cambio de esquema no selecciona nada.
2. Ese archivo **lee lo que vigila como TEXTO** —un regex sobre el contenido del barrel y una
   lectura de `db/schema.prisma` desde disco—, no lo importa. **Ningun grafo de imports lo
   relaciona jamas.**
3. Vive en `tests/unit/` y no en `tests/guards/`, asi que tampoco entra por el patron `guard`, que
   es lo unico que el modo rapido corre siempre.

Es la **quinta familia** del inventario de guardias de censo/alcance de QC-92, y la primera cuyo
defecto es **donde vive** en vez de que afirma. Es exactamente el riesgo que `design.md > 5.2` de
QC-92 dejo escrito para su propia guardia: «en `tests/guards/` y **no** en `tests/unit/` porque no
la selecciona ningun grafo de imports».

**Decision del humano del 2026-09-18: se anota y QC-92 NO se para.** El agujero es del **modo
`--rapido`**, no del gate: **`./init.sh` completo si los habria cazado**, y el cierre de la feature
lo exige igualmente. Arreglar `scripts/test-rapido.mjs` —o mover el censo a `tests/guards/`— es
cambiar el arnes, y eso va por `/afinar-regla` **en frio**: un parche a mitad de una feature en
vuelo puede poner rojas las otras ramas vivas (QC-68, QC-59, QC-96). **No se toco nada de eso.**

### El worktree de QC-59 tampoco se desmonta — SEPTIMA vez, y el gate miente en su codigo de salida (2026-09-17)

**Dos cosas distintas, las dos del arnes y ninguna de la ficha.**

**1. `wt.sh done QC-59-...` fallo con `fatal: ... is not a working tree`.** Mismo cuadro que QC-50:
el directorio sigue en disco pero git ya no lo registra, asi que no hay nada que desmontar. El
aviso del script culpa a «archivo en uso en Windows», que **es falso**: el registro se perdio
antes. No se forzo nada. La rama esta mergeada (PR #84, `b8e3d5e`), asi que el trabajo esta a
salvo y lo que queda es un arbol muerto con su `node_modules`.

**2. Y esta es la seria: `./init.sh` SALE CON CODIGO 0 AUNQUE DECLARE ROJOS NUEVOS.** Medido hoy
en la primera corrida del gate de QC-59: imprimio «hay rojos NUEVOS respecto del baseline» con un
archivo en rojo, y el proceso termino en **0**. La pantalla dice rojo y el codigo dice verde.

Hoy no engaño a nadie porque el leader lee la salida, pero **cualquier automatismo lo daria por
bueno**: un hook, un CI, un `./init.sh && git push`. Es el tipo de fallo que no se nota hasta que
mergea algo roto. Para `/afinar-regla`, y por delante de las demas deudas del gate.

**Dato para esa ficha**: el rojo era real y de la propia rama —una lista cerrada cuyo valor
correcto solo era conocible despues del merge—, asi que el caso no es hipotetico: es exactamente
el escenario en el que el codigo de salida importa.

### Los censos que muerden POR EL DIFF no estan inventariados en ningun sitio (2026-09-17)

Lo destapo QC-68: aparecieron **dos censos**, el 17 (`recipe-route-contract`, de QC-91) y el 18
(`guard-identificador-de-request`, de QC-71), que **ninguna lectura del spec podia prever** porque no
afirman sobre el codigo sino sobre **`git diff --name-only origin/dev...HEAD`**. Solo saltaron **despues
de commitear la migracion**, de uno en uno, y cada uno costo su tanda.

El `spec_author` hizo bien su trabajo —listo los dieciseis que se ven leyendo el codigo— y aun asi la
cuenta se quedo corta. **Es un agujero del arnes, no del agente**: nadie mantiene la lista de los tests
que vigilan el diff. Candidato a `/afinar-regla`, y barato: un censo de censos, o que el gate rapido los
corra siempre como hace con las guardias.

### Dos trampas de entorno del worktree recien montado (2026-09-17)

- **`next typegen` es obligatorio**: sin el, `pnpm typecheck` falla con `app/layout.tsx: TS2304: Cannot
  find name 'LayoutProps'`, que **parece un error de codigo y no lo es**. `init.sh` lo corre siempre; a
  mano, hay que acordarse. Ya mordio en QC-63 y volvio a morder aqui.
- **La Postgres local esta COMPARTIDA entre sesiones**: su `_prisma_migrations` ya trae migraciones de
  otros worktrees, asi que `pnpm run db:migrate:create` **pide un `reset` destructivo**. En QC-68 se creo
  la carpeta a mano y se aplico con `migrate deploy`. **No se ejecuto el reset**, y conviene que siga
  siendo asi.

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

### QC-121 no está en `feature_list.json` (2026-09-17) — RESUELTA el 2026-09-18

La F0 del 2026-09-18 la trajo, junto con **QC-119** (`cancelled`, epica *Canal WhatsApp* QC-118,
tambien cancelada). El disco queda en **110 fichas** y el validador da verde.

**Lo que QC-121 cambia y conviene no perder de vista**: es Inventario, `fullstack`, `pending`, y su
`depends_on: QC-91` ya esta `done`, o sea **arrancable**. Ademas **deroga la decision D7 de QC-91**
("sin rechazar nada en el alta") y devuelve `products.stock` como columna calculada. Pisa el mismo
terreno que **QC-92**, que esta `in_progress`: cuando se evalue, el cruce de archivos no es teorico.

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

### QC-110 - F2 completa y PR #105 abierto (2026-09-22)

**CUATRO vueltas de implementer y DOS de reviewer.** R1-R23 mapeados, 18 tasks cerradas, spec
intacto salvo la tabla de `Deps` de `design.md > 4`, que se corrigio por decision humana porque
se contradecia con su propio paso 6.

**EL PR SE ABRIO SIN GATE VERDE, POR DECISION HUMANA Y CON LA EVIDENCIA ESCRITA.** La suite
completa es INESTABLE BAJO CARGA: dos corridas consecutivas sobre el mismo arbol tumbaron DOS
ARCHIVOS DISTINTOS -`user-table.test.tsx` (27/27 aislado, ficha QC-126) y
`credential-setup.int.test.ts` (15/15 aislado, ficha NUEVA **QC-143**)-, ninguno tocado por esta
rama. Que en la corrida donde uno pasa caiga el otro es lo que dice que no son el mismo problema.
**Antes de sincronizar con `dev` el gate salio VERDE TRES VECES** (591 archivos, 8427/8428/8429
tests), una de ellas corrida por el propio reviewer sin fiarse del informe.

**LO QUE ESTO LE HACE A LA REGLA 5, y va en QC-143**: si la suite tumba un archivo distinto por
corrida, «gate completo en verde antes de cada PR» **no se puede cumplir repitiendo**, porque no
converge.

**Ninguno de los dos se metio en el baseline**: enmascarar un flake apaga tambien sus casos sanos,
que es lo que la review de QC-111 rechazo expresamente.

**QC-143 esta en el board pero NO en `feature_list.json`**: nacio despues del ultimo F0 y la
importa el proximo arranque de sesion.
