# Flujo de orquestación

> Extraído de `AGENTS.md` para que no se reenvíe en cada invocación de subagente: Claude Code
> carga la jerarquía de `CLAUDE.md` entera en cada una, y este contenido solo lo usa el leader.
> Las reglas no negociables siguen en `AGENTS.md`, que sí ve todo el mundo.


Divulgacion progresiva: no cargues todo de golpe. Este archivo te dice **a quien
delegar, en que orden y que leer** en cada paso. Los detalles finos viven en
`docs/` y se leen bajo demanda.

## Los siete subagentes

| Subagente | Hace | NO hace |
| --- | --- | --- |
| `spec_author` | Escribe `requirements.md` (EARS), `design.md`, `tasks.md` | No escribe codigo de `src/` |
| `implementer` | Coordina `frontend_dev` y `backend_dev`, ejecuta task en orden, corre tests | No implementa directamente; no se autoaprueba |
| `frontend_dev` | Componentes, paginas, hooks, layouts con shadcn/ui + Tailwind + SWR | No toca backend, DB ni APIs |
| `backend_dev` | Controllers, services, repos, migraciones Prisma, RLS, Server Actions | No toca UI ni componentes |
| `reviewer` | Verifica trazabilidad `R<n>`->test, checklist contra `docs/` y `CHECKPOINTS.md` | No edita codigo |
| `extractor` | Inventaria un modulo ya implementado y escribe su prompt portable + cuestionario en `extracciones/<slug>/` | No modifica el modulo ni escribe specs |
| `leader` (tu) | Orquesta, transiciona estados, mantiene `progress/` | No edita codigo |

Las **mejoras al propio arnes** (reglas, docs, archivos de agente) no se aplican en caliente:
entran por el comando `/afinar-regla`, que interroga los ejes omitidos y propone el parche
antes de escribir. Los requisitos de producto siguen entrando por el board (F0), no por ahi — y
una vez la ficha esta en el board, se acota con `/afinar-feature` antes de F1.2: ese comando
cierra el alcance y las decisiones con el humano y **siembra** `specs/<key>-<slug>/requirements.md`
para que `spec_author` no las descubra escribiendo. Y `/extraer-modulo` mira en la direccion
contraria: toma un modulo **ya construido** en `dev` y saca de el un prompt portable y el
cuestionario de las decisiones que tomo sin dejarlas escritas, en `extracciones/<slug>/`, para
poder reimplementarlo en otro proyecto. Es solo lectura y no entra en el ciclo SDD.

Son la misma herramienta sobre los tres sujetos del repo: `/afinar-regla` afina el arnes,
`/afinar-feature` afina una feature que aun no existe, `/extraer-modulo` interroga un modulo que
ya existe.

## Estrategia de ramas

```
main <- (solo humano mergea) -- dev <- PR <- feature/<key>-<slug>
```

- Las feature branches nacen de `dev`.
- Los agentes **nunca** tocan `main`. Solo pueden crear branches, pushear y abrir
  PRs hacia `dev`.
- El merge `dev -> main` lo hace el humano cuando `dev` esta estable.

## Worktrees

Cada feature vive en su propio worktree, **dentro** del repo y bajo `.worktrees/`
(ignorado en git):

```
labs/                                  <- worktree principal, siempre en `dev`
  .worktrees/8-paginacion/             <- feature/8-paginacion
  .worktrees/9-manejador-errores/      <- feature/9-manejador-errores
```

Se monta en F1.0 y se desmonta en F2.5, y **las dos puntas las hace `scripts/wt.sh`**:

```
./scripts/wt.sh new 8 paginacion    # F1.0: crea worktree + rama desde dev
./scripts/wt.sh done 8-paginacion   # F2.5: lo desmonta cuando el PR ya esta mergeado
```

Reglas:

- El worktree principal se queda en `dev` y **nadie hace `git checkout` en el**. Todo el
  trabajo de una feature ocurre dentro de su `.worktrees/<key>-<slug>/`.
- Un worktree por feature. Si la zona admite dos features en paralelo, son dos worktrees.
- `wt.sh done` **se niega a borrar** si el arbol esta sucio, si la rama no esta integrada
  en `dev`, o si el worktree esta bloqueado. Eso no es un error: es la guarda.

Esto no existia antes y el coste fue medible: en un proyecto anterior con este mismo
arnes se acumularon **80 worktrees registrados**, ninguno prunable, repartidos en cuatro
sitios distintos — carpetas hermanas del repo, la raiz de `C:`, el scratchpad del harness
y `.claude/worktrees/`. Se creaban en cada feature y ningun paso del flujo los quitaba.
Detalle completo en `docs/worktrees.md`.

## Evaluacion automatica de `zone` y `complexity`

El leader evalua cada feature `pending` antes de lanzar spec_author. Los campos
`zone`, `complexity` y `branch` se dejan `null` en `feature_list.json`; el leader
los asigna.

### Criterios para `zone`

| Zone | Senales en la description |
| --- | --- |
| `frontend` | "pantalla", "menu", "componente", "UI", "boton", "sidebar", "tabla reusable", "toast", "paginacion", "carga masiva" |
| `backend` | "migracion", "seed", "tabla", "RLS", "API", "endpoint", "manejador de errores" (global) |
| `fullstack` | ambas categorias presentes en la misma feature |

**Particion de `fullstack`:** si la feature evalua como `fullstack`, el leader la
parte en dos:

```
Feature original: "catalogo" (fullstack)
  +-- feature/6-catalogo-backend  (zone: backend, depends_on: null)
  +-- feature/7-catalogo-frontend (zone: frontend, depends_on: 6)
```

La feature hija con `depends_on` no arranca hasta que la dependencia este `done`.
El leader actualiza `feature_list.json` con las dos features y documenta la
particion en `progress/current.md > Evaluaciones`.

### Criterios para `complexity`

| Complexity | Senales |
| --- | --- |
| `low` | 1 archivo/tabla, sin logica condicional compleja |
| `medium` | 2-3 capas, condiciones, multiples archivos |
| `high` | multi-feature, webhooks, integraciones externas |

## Modelos

**Ningun subagente fija modelo: todos HEREDAN el de la sesion.** El frontmatter de
`.claude/agents/*.md` no lleva `model:`, y el leader no pasa override al delegar salvo razon
concreta para esa llamada.

Antes habia una tabla que asignaba `opus-4.8` a los seis agentes por igual — la misma columna
repetida tres veces, o sea que no discriminaba nada por `complexity`. El 2026-07-31 ese id dejo de
estar disponible y en un proyecto anterior con este arnes **un `backend_dev` murio al arrancar**
sin escribir una linea;
`spec_author` y `reviewer` siguieron funcionando porque no fijaban modelo. Un id escrito a mano
envejece y rompe el arnes entero en silencio; la herencia no. Si algun dia hace falta discriminar por
`complexity`, se hace en la llamada concreta, no en el frontmatter.

## Paralelismo

Se permite un maximo de **2 features concurrentes por zona** (`frontend`, `backend`,
`fullstack`), siempre que no haya conflicto de archivos con las que ya estan `in_progress`.

| Feature A | Feature B | Paralelo? |
| --- | --- | --- |
| `frontend` | `backend` | Si |
| `frontend` | `frontend` | Si (max 2, validando sin conflicto de archivos) |
| `backend` | `backend` | Si (max 2, validando sin conflicto de archivos) |

### Validacion de conflicto entre features de la misma zona

Antes de lanzar una feature de zona `Z` cuando ya hay `N` features `in_progress`
en esa zona (`N < 2`), el leader debe:

1. Listar los archivos que las features `in_progress` de zona `Z` estan tocando,
   consultando `progress/impl_<feature>.md` de cada una.
2. Revisar en `specs/<nueva-feature>/tasks.md` los archivos esperados.
3. Si hay **interseccion de archivos** entre la nueva feature y las `in_progress`,
   esa feature se **bloquea** hasta que alguna de las que tocan esos archivos pase
   a `done`.
4. Si no hay interseccion (o la nueva es la primera de su zona), se permite el
   paralelismo.
5. Si ya hay 2 features `in_progress` en zona `Z`, se espera a que una pase a
   `done` antes de evaluar la siguiente.

Feature con `depends_on` no arranca hasta que su dependencia este `done`.

## Flujo de una feature (dos fases)

### Fase 0 — Importar el board

0. (F0) **Antes de nada, sincroniza desde Jira.** El board manda; `feature_list.json` es
   su copia de trabajo en disco. El leader, con las herramientas MCP de `atlassian`:
   - Lee los issues del proyecto **filtrando las epicas por tipo**
     (`project = <jira.project> AND issuetype != Epic`, tomando el valor del bloque
     `jira` de `feature_list.json`) y **regenera `feature_list.json`**: altas y
     bajas, `description`, `status` (por la columna) y `depends_on` (por los issue links
     "is blocked by").
   - Guarda `epic` = el key de la epica padre (campo `parent` del issue) **y `epic_name` = su
     summary** (`QC-17` → «Identidad y acceso»). El nombre se almacena y no se deriva: el gate
     corre sin red y no puede resolver un key contra Jira. **Es agrupacion
     por modulo, no dependencia**: no altera el orden ni el cupo de paralelismo. Una epica
     NO es una feature; si alguna acaba en `feature_list.json`, el filtro de arriba fallo y
     el validador lo marca en rojo.
   - Deriva `branch` = `feature/<key>-<slug>` y `spec_path` = `specs/<key>-<slug>`, donde
     `key` es el issue key tal cual (`QC-15`). **No se almacenan en Jira**: se calculan.
     El `id` numerico es **solo el fallback** para una ficha que todavia no tiene issue: si
     hay `key`, nada se deriva del numero. Lo que ya existe en disco con el nombre viejo
     (`specs/11-...`, `.worktrees/5-...`) **no se renombra**: se apunta a la carpeta real.
   - **Dos cosas no se degradan nunca desde el board**: una feature `in_progress` (hay un
     worktree y una rama con trabajo real) y una `zone`/`complexity` ya evaluada cuyo
     issue perdio las labels. En ambos casos se conserva el valor del JSON, se re-escribe
     en Jira y se anota en `progress/current.md > Deudas y cosas abiertas`.
   - **El bloque `jira` no se regenera nunca.** F0 reescribe `features` y solo `features`.
     Ese bloque dice contra que board trabaja este repo, y es lo unico que puede delatar
     una importacion apuntada al proyecto equivocado: si se regenerara desde el board,
     diria siempre que si. El gate (bloque 0 de `scripts/validate-features.mjs`) falla en
     rojo si alguna ficha no lleva ese prefijo.
   - Despues corre `./init.sh`, que valida el resultado de la importacion.

   Contrato de campos completo, columnas del board y que hacer si divergen:
   **`docs/jira.md`**. Si el MCP de `atlassian` no responde, **no inventes el estado**:
   trabaja con el `feature_list.json` que hay en disco y avisa al humano de que no se pudo
   sincronizar.

### Fase 1 — Especificacion

1. (F1.0) **Evaluacion, seleccion y branch.** El leader:
   - Escanea TODAS las features `pending` en orden de `id`.
   - Para cada una con `zone`/`complexity`/`branch` en `null`, evalua usando los
     criterios de arriba y actualiza `feature_list.json` con los valores asignados.
   - Documenta cada evaluacion en `progress/current.md > Evaluaciones`.
   - Agrupa las features `in_progress` por `zone` y cuenta cuantas hay en cada una.
   - Recorre las `pending` (ya evaluadas) en orden de `id` y selecciona la
     **primera** que cumpla **ambas** condiciones:
     a. Su zona tiene **menos de 2** features `in_progress`.
     b. Pasa la **validacion de conflicto** de archivos (ver `## Paralelismo`):
        ningun archivo de `specs/<feature>/tasks.md` intersecta con los archivos
        que estan tocando las features `in_progress` de la misma zona.
   - Si la zona ya tiene 2 features `in_progress`, o hay conflicto de archivos,
     saltea la feature y evalua la siguiente.
   - Si ninguna feature `pending` pasa el filtro, espera a que una feature
     `in_progress` pase a `done` y vuelve a este paso.
   - Si la feature seleccionada evalua como `fullstack`, la parte en dos features
     (`backend` + `frontend`), las registra en `feature_list.json` con `depends_on`
     y vuelve a este paso para la feature `backend` (la `frontend` queda bloqueada
     por `depends_on`).
   - Genera `branch` como `feature/<key>-<slug>` (ej. `feature/QC-8-paginacion`).
   - Monta el worktree de la feature: `./scripts/wt.sh new <key> <slug>`. Eso crea la
     rama desde `dev` **y** el directorio `.worktrees/<key>-<slug>/` donde se trabajara.
     Es idempotente: si ya existe, lo reporta y sigue. **No hagas `git checkout` en el
     worktree principal**, que se queda en `dev` (ver `## Worktrees`).
   - Actualiza `feature_list.json` con `zone`, `complexity` y `branch`.
   - **Escribe `zone` y `complexity` como labels en el issue de Jira**
     (`zone:backend`, `complexity:medium`). Es el unico empujon hacia Jira del ciclo, y
     sin el la importacion de la proxima sesion (F0) borraria la evaluacion. Si la
     feature se partio en dos, crea el segundo issue y enlaza la dependencia con
     "is blocked by".
   - Documenta la evaluacion y particion en `progress/current.md > Evaluaciones`.
2. (F1.1) Registra la feature en `progress/current.md > Features en curso`.
3. (F1.2) **Antes de lanzar nada**: si la feature ya tiene preguntas abiertas o encargos
   anotados en `progress/current.md > Evaluaciones` y **no** existe todavia
   `specs/<key>-<slug>/requirements.md`, ofrece al humano correr `/afinar-feature` primero.
   No es bloqueante —el flujo sin sembrar sigue siendo valido—, pero lanzar el spec sabiendo
   que va a volver con preguntas ya escritas es pagar la ronda dos veces: los tres specs
   escritos hasta hoy necesitaron una o dos revisiones completas por eso.
   Si esa acotacion cambia el alcance, el comando **actualiza el board antes de sembrar** y no
   al reves (`docs/jira.md > Cuando el disco descubre que el board esta desactualizado`).

   Lanza `spec_author` con el nombre de la feature y modelo segun complexity. Produce:
   - `specs/<feature>/requirements.md` — requisitos en EARS, numerados `R1`, `R2`…
   - `specs/<feature>/design.md` — decisiones tecnicas + una alternativa descartada.
   - `specs/<feature>/tasks.md` — checklist de pasos discretos.
4. (F1.3) Cambia la feature a `spec_ready` en `feature_list.json`, **mueve la tarjeta a
   la columna *Spec en revision*** y comenta en el issue la ruta de `specs/<feature>/`.
5. (F1.4) **PARA. Pide aprobacion humana.** Dile al usuario que revise los 3 archivos.
   No avances hasta un "aprobado" explicito. Si pide cambios, vuelve al paso F1.2.
   **La forma canonica de aprobar es mover la tarjeta de *Spec en revision* a *En
   curso***: queda con autor y fecha, en vez de perderse en el chat. Un "aprobado"
   escrito tambien vale — entonces mueve tu la tarjeta al pasar a F2.0.
   Si el `design.md` propone una librería nueva, **la aprobación del spec incluye la
   dependencia**: al aprobar, el leader añade su fila a `docs/dependencias.md`.


### Fase 2 — Implementacion

6. (F2.0) Con la aprobacion, cambia la feature a `in_progress` y asegura que la tarjeta
   esta en *En curso*.
7. (F2.1) Lanza `implementer` (que delega en `frontend_dev` y `backend_dev`). Sigue
   `tasks.md` una a una, marcando `[x]`. Escribe su parte en
   `progress/impl_<feature>.md` (archivos tocados, mapa `R<n> -> test`, salida de
   los tests).
8. (F2.2) Lanza `reviewer` con modelo segun complexity. Verifica contra `docs/`,
   `specs/<feature>/` y `CHECKPOINTS.md`. Escribe `progress/review_<feature>.md`.
   Si hay hallazgos mayores, son bloqueantes: vuelve al implementer.
9. (F2.3) **Sincronizacion con `dev`.** El implementer:
   - `git fetch origin dev`
   - `git merge origin/dev` en la feature branch.
   - Resuelve conflictos triviales automaticamente.
   - Si un conflicto es ambiguo (no sabe que version conservar), **pregunta al humano**
     y registra el conflicto en `progress/current.md > Conflictos pendientes`.
   - **Si el merge trae migraciones, las aplica a la base de SU feature** (`prisma migrate deploy`)
     antes de verificar nada. El gate regenera el *cliente* de Prisma solo, pero no ejecuta las
     migraciones: sin este paso, los tests de integracion dan rojos que no son de la rama. Paso a
     paso y el porque: `docs/verification.md > El gate regenera los artefactos`.
   - Hace `git push` de los cambios resueltos.
10. (F2.4) **PR hacia `dev`.** El implementer:
    - Corre `./init.sh` **completo** (sin flags) antes de abrir el PR, sin excepcion.
    - Ejecuta `gh pr create --base dev --title "feat(<feature>): <description>"`.
    - Reporta la URL del PR al humano.
11. (F2.5) Cuando el humano aprueba y mergea el PR en GitHub, cambia la feature a
    `done`, **mueve la tarjeta a *Hecho* y comenta la URL del PR en el issue**, y
    **desmonta su worktree**: `./scripts/wt.sh done <key>-<slug>`.
    - Si el script devuelve HOLD (arbol sucio, rama sin integrar, worktree bloqueado),
      **no insistas ni fuerces**: anota el worktree y su razon en
      `progress/current.md > Deudas y cosas abiertas` y sigue. Un worktree retenido no
      bloquea el cierre de la feature; lo que si costaria caro es borrar trabajo.
    - Si el PR se mergeo con **squash**, GitHub reescribe los commits y la rama nunca
      figura como ancestro de `dev`: ahi va `./scripts/wt.sh done <key>-<slug>
      --assume-merged`, que salta solo esa guarda y mantiene las otras tres.
12. (F2.6) Añade un resumen a `progress/history.md` (append-only) y limpia la
    feature de `progress/current.md`.
