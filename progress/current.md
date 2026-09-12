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
| QC-77 | aislamiento-de-la-base-en-tests-de-integracion | Plataforma | backend | spec_ready | feature/QC-77-aislamiento-de-la-base-en-tests-de-integracion | **Acotada con `/afinar-feature` el 2026-09-12** (ver *Evaluaciones*): 11 decisiones cerradas y dos preguntas abiertas con respuesta por defecto que no bloquea. **F1.0 hecho**: `complexity: medium` escrita como label en el board junto al parrafo de alcance cerrado, y worktree montado. La rama nacio de `d424044` y se adelanto por `--ff-only` hasta `20fa041` para que la semilla viaje dentro. `.env` copiado del principal. `backend` arranca **sin ninguna otra `in_progress`** (QC-23 esta en `spec_ready`, que no ocupa cupo). **F1.2 entregado**: `spec_author` escribio **31 requisitos EARS**, **10 alternativas descartadas** y **18 tasks**, con la semilla **verificada intacta** -lo unico que cambio del archivo sembrado es la linea del marcador-. **No se creyo el brief del leader y acerto**: el grep de `inRolledBackTransaction` devuelve **19** archivos y la verdad son **18** -`work-group-crud` usa el patron para un sondeo suelto y committea el resto-, asi que la guardia pasa a ser un **censo explicito** y no un grep. Deja ademas escrita la receta de dos pasos que necesita la migracion de QC-49 para construir la plantilla, que no estaba en ningun sitio. Un desconocido **declarado, no inventado**: como llega `DATABASE_URL` del `globalSetup` al worker; T4 lo mide y trae plan B. Tarjeta a *En revision* y ruta comentada en el issue (F1.3). **F1.4: esperando aprobacion humana** |
| QC-85 | pantalla-de-grupos-de-trabajo | Identidad y acceso | frontend | in_progress | feature/QC-85-pantalla-de-grupos-de-trabajo | **Acotada con `/afinar-feature` el 2026-09-12** (ver *Evaluaciones*): 13 decisiones cerradas, cero preguntas abiertas, y **el board se actualizo antes de sembrar** -la ficha pedia un conteo de miembros que **no es alcanzable desde el frontend**, asi que salio del alcance y nacio **QC-100**-. **F1.0 hecho**: `complexity: medium` -pestana con tabla, panel lateral, dialogo y E2E, mismo peso que QC-67/QC-45/QC-39; no es `high` como QC-26/QC-44 porque no monta ninguna ruta nueva-, labels escritas en el issue y worktree montado desde `origin/dev`. `frontend` arranca **sin ninguna otra `in_progress`**. `spec_author` entrego **R1-R43** y **15 tasks en 4 tandas**, con la semilla **verificada intacta** (cabecera, Alcance y las 13 decisiones). **Dos hallazgos anotados en `design.md > 10` sin tocar una decision ni una linea de `lib/modules/`**: el actor **no sale** en la consulta de personas de QC-66 (su dec. 12), asi que quien administra no puede autoanadirse; y anadir a alguien con cuenta no activa **crea la fila pero no se ve**. Tarjeta a *En revision* y ruta comentada en el issue (F1.3). **Spec APROBADO por el humano el 2026-09-12** (F1.4), tarjeta en *En curso*. **Las dos preguntas abiertas quedan ABIERTAS**, con su respuesta por defecto escrita en `design.md > 10` y sin cambiar el comportamiento: el actor no puede autoanadirse (la consulta de QC-66 no lo devuelve, su dec. 12) y el buscador **no** muestra el estado de cuenta. `implementer` en curso (F2.1) con base propia `QuimiCloude_QC85` -que aqui se usa de verdad, porque la ficha lleva E2E- y el encargo de remigrarla tras cada merge |
| QC-63 | ejecutar-receta-operador | Recetas | fullstack | pending | feature/QC-63-ejecutar-receta-operador | **Acotada con `/afinar-feature` el 2026-09-08 y BLOQUEADA**: la acotación destapó que el Operador entra por **pedidos asignados**, no por recetas, y creó seis fichas (QC-83…QC-88). `depends_on: QC-62, QC-64, QC-88`. No arranca; worktree desmontado |
| QC-81 | lote-y-fecha-de-compra | Inventario | backend | pending | feature/QC-81-lote-y-fecha-de-compra | **Nacida del chat el 2026-09-08**, creada en el board y enlazada «is blocked by QC-49». `complexity: medium`. **DESBLOQUEADA el 2026-09-12**: QC-49 cerro y `products.company_id` ya esta en `dev`, asi que la unicidad de `lote` por empresa es construible. Lista para F1.0 |
| QC-82 | registro-de-ejecucion-de-receta | Recetas | backend | pending | feature/QC-82-registro-de-ejecucion-de-receta | **Nacida del chat el 2026-09-08** y creada en el board (QC-27), enlazada «relates to QC-63». `complexity: medium`, sin dependencias. **Pendiente F1.0 y F1.2**: ampliada el 2026-09-08 con `canceled` en el enum y un `reason` anulable; cerrado que cancelar sin motivo no se puede; quedan SEIS preguntas abiertas -entre ellas si el motivo vale fuera de la cancelacion, que se guarda en el paso y que significa «el tiempo»-, asi que toca `/afinar-feature` antes del `spec_author` |
| QC-23 | registro-de-sesiones | Identidad y acceso | backend | pending | feature/QC-23-registro-de-sesiones | **RE-ACOTADA el 2026-09-12** con `/afinar-feature`, tras descubrir en F1.4 que su spec era del 2026-09-03 y no mencionaba QC-65, QC-66, QC-67, QC-70, QC-71, QC-78 ni QC-79. Las **25 decisiones cerradas** y las **cero preguntas abiertas** viven en `specs/QC-23-registro-de-sesiones/requirements.md`; no se copian aqui. `complexity: high` reevaluada. **Rama REHECHA desde `origin/dev`** por decision humana —no mergeada—, con el spec viejo conservado en la etiqueta `spec-descartado/QC-23-2026-09-03`. Worktree con **base propia `QuimiCloude_QC23`**, 27 migraciones y seed. **Siguiente paso: `spec_author` (F1.2)** |

## Evaluaciones

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
