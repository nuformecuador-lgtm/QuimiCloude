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
| QC-101 | cierre-de-sesiones-de-otro-desde-la-pantalla | Identidad y acceso | fullstack | pending | feature/QC-101-cierre-de-sesiones-de-otro-desde-la-pantalla | **F1.0-F1.2 (acotacion) hechos el 2026-09-13**. Acotada con `/afinar-feature` (ver *Evaluaciones*): **10 decisiones cerradas, cero abiertas**. **La `zone` cambio de `frontend` a `fullstack`** —falta la Server Action, no solo el boton— y gana `complexity:medium`. Tres de las cinco preguntas abiertas las contesto el disco. Worktree montado desde `origin/dev`. **Siguiente: lanzar `spec_author`** |
| QC-93 | aterrizaje-sin-permiso-de-modulo | Identidad y acceso | fullstack | spec_ready | feature/QC-93-aterrizaje-sin-permiso-de-modulo | **F1.0-F1.3 hechos el 2026-09-13; PARADA EN F1.4 esperando aprobacion humana**. Acotada el 2026-09-13: 10 decisiones cerradas, cero abiertas. **NO se parte en backend + frontend**, y no es un olvido: la decision cerrada dice que los 23 fallos son una unica causa raiz y que partirla dejaria media suite rota con dos fichas tocando los mismos archivos. Cupo comprobado: `fullstack` tenia **0 `in_progress`**. Worktree desde `origin/dev`, con el merge de QC-87 (PR #67) dentro. `spec_author` entrego **R1-R24** y **13 tasks** (commit `679f340`), con la **semilla verificada intacta por diff** contra `f5d310a`. **Tres hallazgos medidos en `design.md > 0`, ninguno tocado**: (1) **no hay indicio de agujero real de permisos** -el corte va en cada `page.tsx` con `requirePagePermission` y los items ocultos no viajan en el HTML-; (2) **tres de las cuatro lineas de la ficha estan desplazadas** -inventario `:571` y no `:306`, pedidos `:447`, proveedores `:467`; recetas `:376` es exacta-; (3) **los 23 fallos NO se reconstruyen en disco**: la causa raiz alcanza a 4 tests = 8 ejecuciones rojas en dos motores, y `errores.spec.ts` solo crea Administrador, asi que su rojo es de otra cosa. **La cifra no se forzo**: T1 mide antes, T12 despues y R24 exige causa nombrada por cada rojo superviviente. Tarjeta en *En revision* con la ruta comentada. **Una decision para el humano al aprobar**: el spec anade una **guardia en `tests/guards/`** (R9) y un unit test del helper -lo unico de esta feature que el gate puede ejecutar-. Sin dependencias nuevas |
| QC-102 | responsables-en-la-pantalla-de-pedidos | Pedidos | fullstack | in_progress | feature/QC-102-responsables-en-la-pantalla-de-pedidos | **ACOTADA con `/afinar-feature` el 2026-09-13**: alcance, **13 decisiones cerradas** y **cero preguntas abiertas** en `specs/QC-102-responsables-en-la-pantalla-de-pedidos/requirements.md`. No se copian aqui. **Nacida el 2026-09-12 al partir QC-87** en F1.0. El panel lateral de responsables, los avatares con el nombre del grupo y **el E2E del recorrido completo**. `depends_on: QC-87`: **DESBLOQUEADA el 2026-09-13**, la mitad backend se mergeo en `dev` (PR #67) y esta `done`. Lista para F1.0. Sin `complexity` todavia; las decisiones cerradas de las dos mitades viven en la semilla de QC-87. La primitiva `avatar` **ya existe**, verificado en disco, asi que no hay que invocar la CLI de shadcn **F1.0 y F1.1 hechos el 2026-09-13**: worktree montado desde `origin/dev` y **adelantado con `--ff-only` hasta `4a9bc4f`** para que la semilla viaje dentro (`.env` copiado del principal). **NO se parte en backend + frontend**, y es deliberado: ya ES la mitad de pantalla de QC-87, y lo que la hizo crecer a `fullstack` al acotar es **una sola consulta en lote** —responsables de varios pedidos a la vez, una por pagina, ni un join ni una consulta por fila—; partirla crearia una tercera ficha para una funcion. Mismo criterio que QC-93 hoy. Cupo comprobado: `fullstack` con **0 `in_progress`**; `depends_on: QC-87`, **`done`**. Labels del board verificados (`zone:fullstack`, `complexity:high`): **el leader los piso por error y los restauro en el acto** —comparo el board contra una foto de `feature_list.json` ANTERIOR al merge de `origin/dev` y creyo ver una divergencia que no existia—. **F1.2 entregado** (`48f5af7`): **41 requisitos EARS** -R1-R15 el lote, R16-R36 la pantalla, R37-R38 el E2E, R39-R41 los limites-, **18 tasks**, **4 alternativas descartadas** y **5 hallazgos**, con la semilla **verificada por el leader**: la unica linea que cambia del archivo sembrado es el marcador `_Pendiente_`. Lo que la semilla dejaba abierto -DONDE se compone el lote, que era diseno y no acotacion- se decide **en la pantalla**, en el Server Component, porque `asignaciones` ya importa el contrato de `pedidos` y hacerlo dentro de `listOrders` cerraria el ciclo. Tarjeta a *En revision* y ruta comentada en el issue (F1.3). **Spec APROBADO por el humano el 2026-09-13** (F1.4), tarjeta en *En curso* (F2.0). Sin dependencia nueva, asi que no hay fila que anadir a `docs/dependencias.md` —verificado en el `design.md > 5`—. `implementer` en curso (F2.1). El hallazgo 1 pide mirada: el buscador de personas y el selector de grupos exigen **`usuarios.consultar`**, un TERCER permiso que la decision 2 no nombra; hoy el spec lo degrada como ya hace `loadFormCatalogs` |
| QC-63 | ejecutar-receta-operador | Recetas | fullstack | pending | feature/QC-63-ejecutar-receta-operador | **Acotada con `/afinar-feature` el 2026-09-08 y BLOQUEADA**: la acotación destapó que el Operador entra por **pedidos asignados**, no por recetas, y creó seis fichas (QC-83…QC-88). `depends_on: QC-62, QC-64, QC-88`. No arranca; worktree desmontado |
| QC-81 | lote-y-fecha-de-compra | Inventario | backend | spec_ready | feature/QC-81-lote-y-fecha-de-compra | **F1.0-F1.3 hechos el 2026-09-13; PARADA EN F1.4 esperando aprobacion humana**. Acotada hoy (ver *Evaluaciones*): **12 decisiones cerradas, cero abiertas**. La ficha estaba **derogada en su premisa**; el board se corrigio antes de sembrar y nacio **QC-103** con la pantalla. Cupo libre: cero `in_progress` en toda zona. `spec_author` entrego **R1-R33** y **13 tasks** (commit `be486b5`), **semilla verificada intacta por diff**, y cada decision citada como `[D1]-[D12]` en al menos un requisito. **La concurrencia se resuelve en la base**: `max(lot::bigint)+1` dentro de la misma transaccion que inserta, con `pg_advisory_xact_lock` por empresa **como sentencia anterior al SELECT** -en `READ COMMITTED` un lock pedido dentro del calculo leeria un maximo viejo-, e indice unico `(company_id, lot)` como garantia dura; choque en lote generado reintenta 3 veces, choque en lote tecleado **nunca** reintenta. **DOS COSAS ESPERAN DECISION HUMANA en F1.4**: (1) `tests/unit/inventario/schema/inventario-schema.test.ts:1082` **se pondra rojo por hacer justo lo que la ficha pide** -afirma que `lot` es opcional-, y T3 lo actualiza con el precedente del propio archivo; (2) `batch_duplicate_lot`, **sexta enmienda al catalogo cerrado de errores**, con plan B escrito. **Doce sitios asumen hoy `lot` nulo**, tabulados con `archivo:linea` en `design.md > 0`. Sin dependencias nuevas |
| QC-82 | registro-de-ejecucion-de-receta | Recetas | backend | pending | feature/QC-82-registro-de-ejecucion-de-receta | **Nacida del chat el 2026-09-08** y creada en el board (QC-27), enlazada «relates to QC-63». `complexity: medium`, sin dependencias. **Pendiente F1.0 y F1.2**: ampliada el 2026-09-08 con `canceled` en el enum y un `reason` anulable; cerrado que cancelar sin motivo no se puede; quedan SEIS preguntas abiertas -entre ellas si el motivo vale fuera de la cancelacion, que se guarda en el paso y que significa «el tiempo»-, asi que toca `/afinar-feature` antes del `spec_author` |

## Evaluaciones

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
