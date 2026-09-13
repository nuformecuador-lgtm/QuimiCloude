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
| QC-93 | aterrizaje-sin-permiso-de-modulo | Identidad y acceso | fullstack | spec_ready | feature/QC-93-aterrizaje-sin-permiso-de-modulo | **F1.0-F1.3 hechos el 2026-09-13; PARADA EN F1.4 esperando aprobacion humana**. Acotada el 2026-09-13: 10 decisiones cerradas, cero abiertas. **NO se parte en backend + frontend**, y no es un olvido: la decision cerrada dice que los 23 fallos son una unica causa raiz y que partirla dejaria media suite rota con dos fichas tocando los mismos archivos. Cupo comprobado: `fullstack` tenia **0 `in_progress`**. Worktree desde `origin/dev`, con el merge de QC-87 (PR #67) dentro. `spec_author` entrego **R1-R24** y **13 tasks** (commit `679f340`), con la **semilla verificada intacta por diff** contra `f5d310a`. **Tres hallazgos medidos en `design.md > 0`, ninguno tocado**: (1) **no hay indicio de agujero real de permisos** -el corte va en cada `page.tsx` con `requirePagePermission` y los items ocultos no viajan en el HTML-; (2) **tres de las cuatro lineas de la ficha estan desplazadas** -inventario `:571` y no `:306`, pedidos `:447`, proveedores `:467`; recetas `:376` es exacta-; (3) **los 23 fallos NO se reconstruyen en disco**: la causa raiz alcanza a 4 tests = 8 ejecuciones rojas en dos motores, y `errores.spec.ts` solo crea Administrador, asi que su rojo es de otra cosa. **La cifra no se forzo**: T1 mide antes, T12 despues y R24 exige causa nombrada por cada rojo superviviente. Tarjeta en *En revision* con la ruta comentada. **Una decision para el humano al aprobar**: el spec anade una **guardia en `tests/guards/`** (R9) y un unit test del helper -lo unico de esta feature que el gate puede ejecutar-. Sin dependencias nuevas |
| QC-102 | responsables-en-la-pantalla-de-pedidos | Pedidos | frontend | pending | feature/QC-102-responsables-en-la-pantalla-de-pedidos | **Nacida el 2026-09-12 al partir QC-87** en F1.0. El panel lateral de responsables, los avatares con el nombre del grupo y **el E2E del recorrido completo**. `depends_on: QC-87`: **DESBLOQUEADA el 2026-09-13**, la mitad backend se mergeo en `dev` (PR #67) y esta `done`. Lista para F1.0. Sin `complexity` todavia; las decisiones cerradas de las dos mitades viven en la semilla de QC-87. La primitiva `avatar` **ya existe**, verificado en disco, asi que no hay que invocar la CLI de shadcn |
| QC-63 | ejecutar-receta-operador | Recetas | fullstack | pending | feature/QC-63-ejecutar-receta-operador | **Acotada con `/afinar-feature` el 2026-09-08 y BLOQUEADA**: la acotación destapó que el Operador entra por **pedidos asignados**, no por recetas, y creó seis fichas (QC-83…QC-88). `depends_on: QC-62, QC-64, QC-88`. No arranca; worktree desmontado |
| QC-81 | lote-y-fecha-de-compra | Inventario | backend | pending | feature/QC-81-lote-y-fecha-de-compra | **Nacida del chat el 2026-09-08**, creada en el board y enlazada «is blocked by QC-49». `complexity: medium`. **DESBLOQUEADA el 2026-09-12**: QC-49 cerro y `products.company_id` ya esta en `dev`, asi que la unicidad de `lote` por empresa es construible. Lista para F1.0 |
| QC-82 | registro-de-ejecucion-de-receta | Recetas | backend | pending | feature/QC-82-registro-de-ejecucion-de-receta | **Nacida del chat el 2026-09-08** y creada en el board (QC-27), enlazada «relates to QC-63». `complexity: medium`, sin dependencias. **Pendiente F1.0 y F1.2**: ampliada el 2026-09-08 con `canceled` en el enum y un `reason` anulable; cerrado que cancelar sin motivo no se puede; quedan SEIS preguntas abiertas -entre ellas si el motivo vale fuera de la cancelacion, que se guarda en el paso y que significa «el tiempo»-, asi que toca `/afinar-feature` antes del `spec_author` |
| QC-23 | registro-de-sesiones | Identidad y acceso | backend | in_progress | feature/QC-23-registro-de-sesiones | **RE-ACOTADA el 2026-09-12** con `/afinar-feature`, tras descubrir en F1.4 que su spec era del 2026-09-03 y no mencionaba QC-65, QC-66, QC-67, QC-70, QC-71, QC-78 ni QC-79. Las **25 decisiones cerradas** y las **cero preguntas abiertas** viven en `specs/QC-23-registro-de-sesiones/requirements.md`; no se copian aqui. `complexity: high` reevaluada. **Rama REHECHA desde `origin/dev`** por decision humana —no mergeada—, con el spec viejo conservado en la etiqueta `spec-descartado/QC-23-2026-09-03`. Worktree con **base propia `QuimiCloude_QC23`**, 27 migraciones y seed. **Esa linea estaba CONGELADA en el 2026-09-12 y era falsa: la feature esta a un merge de cerrar.** Estado real verificado en disco el 2026-09-13: `spec_author` entrego **R1-R51** y **24 tasks, las 24 marcadas**; `implementer` cerro F2.1 con 7 commits propios; **F2.2 APROBADO por el `reviewer`** en segunda ronda -la primera fue RECHAZADO por 1 mayor, ya corregido-, queda solo un menor 8 de documentacion de cabecera que se puede cerrar al paso en QC-89; **F2.3 hecho** (`origin/dev` mergeado, 15 commits con QC-77 dentro, y el centinela de QC-85 resuelto a favor de `dev`). **F2.4 CERRADO el 2026-09-13**: se committeo la tanda que quedaba suelta -el arreglo del arranque caido de integracion en `tests/helpers/test-database.ts`, las DOS garantias nuevas de `init.sh` y las dos entradas nuevas del censo `aislamiento.json`- y el gate completo dio **`== init OK ==`, exit 0: 419 archivos, 6028 verdes, 66 saltados y CERO rojos**, ni siquiera los 8 heredados. **PR #66 abierto** hacia `dev` (https://github.com/singularis-co/QuimiCloude/pull/66). **Ya existia de una pasada anterior**, asi que no se abrio otro: se le reescribio el cuerpo con las cifras de esta corrida y la seccion del arreglo del gate, y se conservo su titulo. **Siguiente paso: F2.5, que espera a que el humano mergee el PR** |

## Evaluaciones

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
