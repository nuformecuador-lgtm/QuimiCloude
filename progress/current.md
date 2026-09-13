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
| QC-87 | asignar-responsables-a-un-pedido | Pedidos | backend | in_progress | feature/QC-87-asignar-responsables-a-un-pedido | **Acotada el 2026-09-12** (ver *Evaluaciones*): 12 decisiones cerradas, cero preguntas abiertas, y **cierra las TRES preguntas que venian arrastrandose** de QC-86 y QC-85. **F1.0 hecho, con particion**: era `fullstack` y se partio en **backend (esta) + frontend (QC-102)**, con el issue creado, enlazado «is blocked by» y las dos descripciones reescritas para que ninguna mienta. `complexity: medium`, worktree montado desde `origin/dev`. `spec_author` entrego **R1-R51** y **15 tasks**, con la semilla **verificada intacta**. Las 12 decisiones mapeadas -las de pantalla al requisito de **limite R50**- y **cinco hallazgos en `design.md > 0`** sin tocar ninguna. Tarjeta a *En revision* (F1.3). **TRES preguntas abiertas, cada una con el requisito que cae si se decide lo contrario**: si se puede asignar suelta a una cuenta no `active` (hoy R18 lo rechaza), si un `CANCELADO` admite desasignar (hoy R11 lo trata como el entregado) y si «quitar un grupo» es de esta mitad o de QC-102 (hoy R32-R34). **Spec APROBADO por el humano el 2026-09-12** (F1.4), y las **tres preguntas abiertas quedan ABIERTAS** con su respuesta por defecto ya escrita como requisito (R18, R11 y R32-R34). **PERO LA IMPLEMENTACION NO ARRANCA, y esta medido**: `backend` tiene **3 `in_progress`** -QC-23 y QC-77, de sesiones paralelas, mas esta- y el tope son **2**. Ademas **QC-77 esta reescribiendo el aislamiento de la base en los tests de integracion**, que es exactamente donde QC-87 va a escribir los suyos: es el choque de archivos que la regla existe para evitar, el mismo trato que QC-83 frente a QC-65. Decision humana: **espera a que QC-23 o QC-77 pase a `done`**. Tarjeta devuelta a *En revision* para que el board no diga que hay trabajo en curso que no lo hay. Worktree montado y spec listo: **DESBLOQUEADA el 2026-09-13**: QC-77 se mergeo en `dev` (PR #65), asi que el motivo real de la espera -que reescribia el aislamiento de la base bajo los tests de integracion- **desaparecio**: QC-87 escribe encima de la forma nueva en vez de sobre algo que se movia. Su ficha sigue `in_progress` en el JSON porque **esa sesion no ha corrido su F2.5**; verificado que el PR esta mergeado. `implementer` en curso (F2.1), con el encargo de **fusionar `dev` ANTES de escribir un solo test de integracion** |
| QC-102 | responsables-en-la-pantalla-de-pedidos | Pedidos | frontend | pending | feature/QC-102-responsables-en-la-pantalla-de-pedidos | **Nacida el 2026-09-12 al partir QC-87** en F1.0. El panel lateral de responsables, los avatares con el nombre del grupo y **el E2E del recorrido completo**. `depends_on: QC-87`: **no arranca hasta que la mitad backend este `done`**. Sin `complexity` todavia; las decisiones cerradas de las dos mitades viven en la semilla de QC-87. La primitiva `avatar` **ya existe**, verificado en disco, asi que no hay que invocar la CLI de shadcn |
| QC-77 | aislamiento-de-la-base-en-tests-de-integracion | Plataforma | backend | in_progress | feature/QC-77-aislamiento-de-la-base-en-tests-de-integracion | **Acotada con `/afinar-feature` el 2026-09-12** (ver *Evaluaciones*): 11 decisiones cerradas y dos preguntas abiertas con respuesta por defecto que no bloquea. **F1.0 hecho**: `complexity: medium` escrita como label en el board junto al parrafo de alcance cerrado, y worktree montado. La rama nacio de `d424044` y se adelanto por `--ff-only` hasta `20fa041` para que la semilla viaje dentro. `.env` copiado del principal. `backend` arranca **sin ninguna otra `in_progress`** (QC-23 esta en `spec_ready`, que no ocupa cupo). **F1.2 entregado**: `spec_author` escribio **31 requisitos EARS**, **10 alternativas descartadas** y **18 tasks**, con la semilla **verificada intacta** -lo unico que cambio del archivo sembrado es la linea del marcador-. **No se creyo el brief del leader y acerto**: el grep de `inRolledBackTransaction` devuelve **19** archivos y la verdad son **18** -`work-group-crud` usa el patron para un sondeo suelto y committea el resto-, asi que la guardia pasa a ser un **censo explicito** y no un grep. Deja ademas escrita la receta de dos pasos que necesita la migracion de QC-49 para construir la plantilla, que no estaba en ningun sitio. Un desconocido **declarado, no inventado**: como llega `DATABASE_URL` del `globalSetup` al worker; T4 lo mide y trae plan B. Tarjeta a *En revision* y ruta comentada en el issue (F1.3). **Spec APROBADO por el humano el 2026-09-12** (F1.4), tarjeta en *En curso*. Sin dependencia nueva, asi que no hay fila que anadir a `docs/dependencias.md`. `implementer` en curso (F2.1) |
| QC-63 | ejecutar-receta-operador | Recetas | fullstack | pending | feature/QC-63-ejecutar-receta-operador | **Acotada con `/afinar-feature` el 2026-09-08 y BLOQUEADA**: la acotación destapó que el Operador entra por **pedidos asignados**, no por recetas, y creó seis fichas (QC-83…QC-88). `depends_on: QC-62, QC-64, QC-88`. No arranca; worktree desmontado |
| QC-81 | lote-y-fecha-de-compra | Inventario | backend | pending | feature/QC-81-lote-y-fecha-de-compra | **Nacida del chat el 2026-09-08**, creada en el board y enlazada «is blocked by QC-49». `complexity: medium`. **DESBLOQUEADA el 2026-09-12**: QC-49 cerro y `products.company_id` ya esta en `dev`, asi que la unicidad de `lote` por empresa es construible. Lista para F1.0 |
| QC-82 | registro-de-ejecucion-de-receta | Recetas | backend | pending | feature/QC-82-registro-de-ejecucion-de-receta | **Nacida del chat el 2026-09-08** y creada en el board (QC-27), enlazada «relates to QC-63». `complexity: medium`, sin dependencias. **Pendiente F1.0 y F1.2**: ampliada el 2026-09-08 con `canceled` en el enum y un `reason` anulable; cerrado que cancelar sin motivo no se puede; quedan SEIS preguntas abiertas -entre ellas si el motivo vale fuera de la cancelacion, que se guarda en el paso y que significa «el tiempo»-, asi que toca `/afinar-feature` antes del `spec_author` |
| QC-23 | registro-de-sesiones | Identidad y acceso | backend | pending | feature/QC-23-registro-de-sesiones | **RE-ACOTADA el 2026-09-12** con `/afinar-feature`, tras descubrir en F1.4 que su spec era del 2026-09-03 y no mencionaba QC-65, QC-66, QC-67, QC-70, QC-71, QC-78 ni QC-79. Las **25 decisiones cerradas** y las **cero preguntas abiertas** viven en `specs/QC-23-registro-de-sesiones/requirements.md`; no se copian aqui. `complexity: high` reevaluada. **Rama REHECHA desde `origin/dev`** por decision humana —no mergeada—, con el spec viejo conservado en la etiqueta `spec-descartado/QC-23-2026-09-03`. Worktree con **base propia `QuimiCloude_QC23`**, 27 migraciones y seed. **Siguiente paso: `spec_author` (F1.2)** |

## Evaluaciones

### QC-87 - acotada con `/afinar-feature` (2026-09-12)

Alcance, **12 decisiones cerradas** y **cero preguntas abiertas** en
`specs/QC-87-asignar-responsables-a-un-pedido/requirements.md`. No se copian aqui.

**Esta acotacion CIERRA LAS TRES preguntas abiertas que venian arrastrandose**, y ese es su
valor principal: las dos que dejo **QC-86** -que estados admiten asignacion, y que pasa al
reaplicar un grupo- y la que **QC-85** dejo escrita expresamente para esta ficha -si se asigna a
cuentas no activas-. Las tres estaban escritas, ninguna se redescubrio implementando.

**El board se corrigio antes de sembrar**: su `description` decia que lo del pedido entregado
«se decide al acotar». Ahora dice la decision: **ENTREGADO congela la asignacion y CANCELADO no
admite asignacion nueva; solo se asigna sobre PENDIENTE y EN_CURSO**. Los otros tres campos
seguian diciendo la verdad y las dos fichas del «Lo que NO entra» (QC-86, QC-88) existen.

**Sigue siendo `fullstack`: se parte en backend + frontend en F1.0**, no aqui.

**Y se verifico en disco lo que en QC-85 costo una parada**: la primitiva `avatar` **ya existe**
en `components/ui/`, asi que no hay que invocar la CLI de shadcn ni arriesgar otra dependencia
arrastrada como `cn@0.3.0`.

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
