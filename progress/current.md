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
| QC-85 | pantalla-de-grupos-de-trabajo | Identidad y acceso | frontend | in_progress | feature/QC-85-pantalla-de-grupos-de-trabajo | **Acotada con `/afinar-feature` el 2026-09-12** (ver *Evaluaciones*): 13 decisiones cerradas, cero preguntas abiertas, y **el board se actualizo antes de sembrar** -la ficha pedia un conteo de miembros que **no es alcanzable desde el frontend**, asi que salio del alcance y nacio **QC-100**-. **F1.0 hecho**: `complexity: medium` -pestana con tabla, panel lateral, dialogo y E2E, mismo peso que QC-67/QC-45/QC-39; no es `high` como QC-26/QC-44 porque no monta ninguna ruta nueva-, labels escritas en el issue y worktree montado desde `origin/dev`. `frontend` arranca **sin ninguna otra `in_progress`**. `spec_author` entrego **R1-R43** y **15 tasks en 4 tandas**, con la semilla **verificada intacta** (cabecera, Alcance y las 13 decisiones). **Dos hallazgos anotados en `design.md > 10` sin tocar una decision ni una linea de `lib/modules/`**: el actor **no sale** en la consulta de personas de QC-66 (su dec. 12), asi que quien administra no puede autoanadirse; y anadir a alguien con cuenta no activa **crea la fila pero no se ve**. Tarjeta a *En revision* y ruta comentada en el issue (F1.3). **Spec APROBADO por el humano el 2026-09-12** (F1.4), tarjeta en *En curso*. **Las dos preguntas abiertas quedan ABIERTAS**, con su respuesta por defecto escrita en `design.md > 10` y sin cambiar el comportamiento: el actor no puede autoanadirse (la consulta de QC-66 no lo devuelve, su dec. 12) y el buscador **no** muestra el estado de cuenta. `implementer` en curso (F2.1) con base propia `QuimiCloude_QC85` -que aqui se usa de verdad, porque la ficha lleva E2E- y el encargo de remigrarla tras cada merge |
| QC-23 | registro-de-sesiones | Identidad y acceso | backend | spec_ready | feature/QC-23-registro-de-sesiones | esperando aprobación humana del spec (F1.4) |
| QC-63 | ejecutar-receta-operador | Recetas | fullstack | pending | feature/QC-63-ejecutar-receta-operador | **Acotada con `/afinar-feature` el 2026-09-08 y BLOQUEADA**: la acotación destapó que el Operador entra por **pedidos asignados**, no por recetas, y creó seis fichas (QC-83…QC-88). `depends_on: QC-62, QC-64, QC-88`. No arranca; worktree desmontado |
| QC-81 | lote-y-fecha-de-compra | Inventario | backend | pending | feature/QC-81-lote-y-fecha-de-compra | **Nacida del chat el 2026-09-08**, creada en el board y enlazada «is blocked by QC-49». `complexity: medium`. **DESBLOQUEADA el 2026-09-12**: QC-49 cerro y `products.company_id` ya esta en `dev`, asi que la unicidad de `lote` por empresa es construible. Lista para F1.0 |
| QC-82 | registro-de-ejecucion-de-receta | Recetas | backend | pending | feature/QC-82-registro-de-ejecucion-de-receta | **Nacida del chat el 2026-09-08** y creada en el board (QC-27), enlazada «relates to QC-63». `complexity: medium`, sin dependencias. **Pendiente F1.0 y F1.2**: ampliada el 2026-09-08 con `canceled` en el enum y un `reason` anulable; cerrado que cancelar sin motivo no se puede; quedan SEIS preguntas abiertas -entre ellas si el motivo vale fuera de la cancelacion, que se guarda en el paso y que significa «el tiempo»-, asi que toca `/afinar-feature` antes del `spec_author` |

## Evaluaciones

### QC-77 - F2.1 implementada, 17/18 tasks (2026-09-12)

**Falta solo T18: `./init.sh` completo, que por enunciado lo corre el LEADER.** Despues, `reviewer`.

Bitacora: `progress/impl_QC-77-aislamiento-de-la-base-en-tests-de-integracion.md`. Evidencia cruda
por task en `progress/qc77-mediciones/` (14 archivos). **Los 31 requisitos mapeados**: 12 con test
automatico, 19 con medicion pegada, 7 con las dos cosas.

Lo que hay que saber sin abrir la bitacora:

- **Funciona**: los 41 archivos de integracion, **630/630 casos, tres corridas seguidas en verde**,
  cada una sobre su base efimera. Los **13 rojos** de la linea base desaparecieron y el `23505` del
  correlativo **no aparecio**. La base de desarrollo quedo identica (conteo por tabla, tres veces).
- **La puerta de diseno (T4) se midio y no contradijo nada**: `process.env` del `globalSetup` **si**
  llega al worker (pool `forks`), y el `globalSetup` **no** corre con cero archivos seleccionados,
  asi que **no se escribio el corto-circuito** ni se toco `scripts/test-rapido.mjs`.
- **Una cosa del design no funcionaba y se cambio**: el borrado ante Ctrl-C tiene que ser
  **sincrono**, porque Vitest hace `setTimeout(() => process.exit(), 1)` en su propio handler y un
  `DROP` con `await` no llega. Convertirlo en `async` reabre el agujero.
- **Alcance respetado**: nada bajo `app/`, `lib/`, `components/`, `db/` ni `e2e/`; ninguno de los 41
  archivos de `tests/integration/**` modificado (R22); `package.json` solo gana el script `db:test`
  y **ninguna dependencia** (R23).
- **Anadido que NO estaba en `tasks.md`** y que el reviewer debe poder rechazar:
  `tests/unit/test-database/nombres-y-huella.test.ts`, 18 casos sobre las funciones puras, porque
  R4/R5/R6/R28/R30/R31 se apoyaban solo en mediciones que no vuelven a correr.
- **`dev` se movio 15 commits** mientras corria la ficha (ultimo: merge de QC-85, PR #64). **Hay que
  mergear `dev` antes del gate y del PR**, y el gate que vale es el de despues del merge.

### Deudas que deja abiertas, todas **fuera** del alcance de QC-77

1. **`scripts/test-rapido.mjs` corre las guardias solo `if (status === 0)`**: si la primera mitad
   sale roja, **las guardias no corren**. «El rapido corre siempre todas las guardias» es cierto
   solo hasta el primer rojo. Medido en T16. Candidato a ficha.
2. **Un worktree recien montado no pasa `pnpm run typecheck`** hasta correr `pnpm exec next typegen`
   (`app/layout.tsx` usa `LayoutProps`, que Next genera en `.next/types`, y `.next` no viaja con el
   worktree). Tres subagentes tropezaron con el mismo `TS2304`. Candidato a ficha o a una linea en
   `docs/worktrees.md`.
3. **`db:test clean --force` no tiene filtro**: todo o nada sobre los SAFE. Candidato a `--solo`.
4. **R10 no se probo de punta a punta** (dos worktrees distintos a la vez): los worktrees vivos no
   tienen la libreria y correr alli habria ensuciado la base de desarrollo — el bug que la ficha
   cierra. Se cierra solo cuando QC-77 este en `dev`.
5. **Las bases heredadas siguen todas en pie.** `db:test list` marca hoy 9 SAFE, pero **barrerlas es
   decision del humano** y no se pidio. El reparto SAFE/HOLD **cambia solo** segun se desmontan
   worktrees: se barre mirando la salida del momento, no una lista copiada.

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
