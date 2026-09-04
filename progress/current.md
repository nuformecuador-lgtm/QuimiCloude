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
| QC-23 | registro-de-sesiones | Identidad y acceso | backend | spec_ready | feature/QC-23-registro-de-sesiones | esperando aprobación humana del spec (F1.4) |
| QC-34 | crud-de-pedidos | Pedidos | backend | in_progress | feature/QC-34-crud-de-pedidos | implementer (spec aprobado por el humano el 2026-09-04) |
| QC-55 | tabla-de-datos-compartida | Plataforma | frontend | in_progress | feature/QC-55-tabla-de-datos-compartida | implementer (spec aprobado por el humano el 2026-09-04) |

La feature **QC-52 — separar-producto-de-catalogo-de-proveedor** se cerró el 2026-09-04 (PR #32,
merge `855fae6`): resumen en `progress/history.md`, worktree desmontado, rama borrada y **base
propia `QuimiCloude_QC52` eliminada**. 34 requisitos con test y `reviewer` en **una sola ronda**
(0 mayores, 6 menores, cinco ajenos a la ficha) — la ficha llegó acotada por `/afinar-feature` con
16 decisiones cerradas antes del spec, y se notó. **Desbloquea QC-44.**

**Tres deudas de arnés que destapó y que no le tocaban:** falta un `.gitattributes` (un subagente
convirtió 15 archivos a CRLF y el diff pasó a marcar 497 líneas donde el cambio real son 19); la
entrada de `recipe-route-contract.test.ts` en `baseline-rojos.json` **documenta un motivo que ya no
es el que ocurre** —en las ramas de feature falla porque la guardia R44 de QC-26 muerde a cualquier
rama que toque `db/`, y la cura que el propio baseline propone no arregla ese caso—; y **`./init.sh`
no corre Playwright**, así que el E2E de inventario estuvo roto en `dev` por dos motivos
independientes sin que ningún gate lo dijera. Las tres son candidatas a `/afinar-regla`.

**Corrección a una nota de este archivo:** que sin `set -a && . ./.env && set +a` el gate pegue
contra la base compartida **no es cierto en este repo**. Se midió: el cliente Prisma generado lee el
`.env` al importarse y `prisma.config.ts` llama a `process.loadEnvFile()`. Sourcear sigue siendo
buena idea por no depender de un implícito, pero la base propia no es decorativa sin ello.

**Cuarta vez que el drift de base entre worktrees bloquea una feature**, y esta vez QC-52 fue quien
rompió a QC-34 al aplicar su migración a la compartida. Siguen vivas y huérfanas
`QuimiCloude_FIXGATE` y `QuimiCloude_QC14`; `QuimiCloude_QC34` sigue en uso.

La feature **QC-26 — pantalla-de-recetas** se cerró el 2026-09-03 (PR #29, merge `4c4ee11`):
resumen en `progress/history.md`, worktree desmontado, rama borrada y **base propia
`QuimiCloude_QC26` eliminada**. **Cierra la épica Recetas** — QC-24 el modelo, QC-25 el CRUD,
QC-26 la pantalla. 54 requisitos con test y `reviewer` en dos rondas (3 mayores → 0, **15
mutaciones**). **Queda T25 sin hacer y ningún agente puede cerrarla**: la verificación manual en
un móvil real (375 px, arrastrar un paso con el dedo, zoom al enfocar). Si al probarlo aparece
algo, es ficha nueva.

La feature **QC-13 — guardia-de-sesion-en-navegacion** se cerró el 2026-09-03 (PR #27, merge
`045074c`): resumen en `progress/history.md`. El menú privado queda con **Dashboard, Inventario y
Producción**; `FORMULAS_ROUTE` se conservó intacta para **QC-26**, que se la queda.

La feature **QC-33 — modelo-pedidos** se cerró el 2026-09-03 (PR #26, merge `73c2fb6`):
resumen en `progress/history.md`. Desbloquea **QC-34**.

La feature **QC-30 — rediseno-login** se cerró el 2026-09-03, pero **su PR [#20] se había
mergeado el 2026-09-02 a las 22:55Z**: la sesión que la implementó nunca corrió F2.5 ni F2.6, así
que la ficha pasó un día entera en `in_progress` y la tarjeta en *En curso* con la rama ya
integrada. La cierra otra sesión por decisión humana, igual que pasó con **QC-8**. Es la segunda
vez: el cierre depende hoy de que quien mergea se acuerde, y eso ya falló dos veces — anotado como
material de `/afinar-regla`. Resumen en `history.md`.

La feature **QC-25 — crud-de-recetas** se cerró el 2026-09-03 (PR #23, merge `1001ec1`):
resumen en `progress/history.md`, worktree desmontado, rama borrada y **base propia
`QuimiCloude_QC25` eliminada**. 50 requisitos vigentes con test —R15 derogado— y `reviewer` en dos
rondas (RECHAZADO por dos mayores → APROBADO, con **12 mutaciones repetidas** por el propio
reviewer, 11 muertas). **Desbloquea QC-26 — pantalla-de-recetas.** Tres cosas que costaron y que
están en `history.md`: cinco cortes 529 que obligaron a implementar con Sonnet, la llegada de QC-32
a `dev` a mitad de implementación —que derogó R15 y obligó a adaptar en caliente—, y el drift de la
base compartida entre worktrees, resuelto **a mano por segunda vez** con una base propia.

La feature **QC-20 — crud-de-productos** se cerró el 2026-09-02 (PR #19, merge `1be1021`):
resumen en `progress/history.md`, worktree desmontado, rama borrada y **base propia
`QuimiCloude_QC20` eliminada**. 37 requisitos con test y 40 mutaciones verificadas; `reviewer`
en dos rondas (RECHAZADO por un mayor de documento → APROBADO, 0 mayores). Rompió los tests de
alcance de **tres** features anteriores —QC-14, QC-19 y QC-24—, todos por la misma causa: una
feature no puede cumplir la afirmación de alcance de otra, y `related` no los ve porque leen el
árbol de archivos. Desbloquea **QC-22** y **QC-25**.

La feature **QC-21 — ayuda-visual-de-contrasena** se cerró el 2026-09-02 (PR #17, merge
`3775102`): resumen en `progress/history.md`, worktree desmontado y rama borrada — `wt.sh done`
falló a medias en Windows por tercera vez seguida, rematado con `rmdir /s /q` + `git worktree
prune`. En F2.3 apareció el **`add/add`** que había avisado otra sesión: la versión SEMILLA de
`requirements.md` (57 líneas) había llegado a `dev` por el PR #16 para desbloquear su gate.
**Resuelto a favor de la rama** (177 líneas, con la R5 corregida): resolverlo al revés habría
perdido 120 líneas de spec Y reintroducido el requisito insatisfactible que B2 acababa de
cerrar. El conflicto de este archivo, en cambio, resultó ser **cero conflictos reales** al
normalizar las tres versiones: todo era fin de línea, van tres veces hoy.

La feature **QC-8 — sesion-actual-y-logout** se cerró el 2026-09-02 (PR #13, merge `dc090e0`):
la llevó **otra sesión de leader**. Su tarjeta ya estaba en *Finalizado* y el PR mergeado, pero la
ficha seguía `pending` en `feature_list.json` y eso **bloqueaba a QC-20** por `depends_on`. Se pasa
a `done` aquí, por decisión humana del 2026-09-02. Su worktree ya no está montado. El resumen en
`history.md` le corresponde a la sesión que la implementó.

La feature **QC-19 — politica-de-contrasenas** se cerró el 2026-09-02 (PR #14, merge
`11664e1`): resumen en `progress/history.md`, worktree desmontado y rama borrada. `wt.sh done`
volvió a fallar a medias en Windows, igual que en QC-6 —desregistra el worktree pero no borra
`node_modules`—; rematado con `rmdir /s /q` + `git worktree prune`. El PR llegó **CONFLICTING**
porque `origin/dev` había avanzado 24 commits con el merge de QC-8: conflictos en
`lib/composition/index.ts` (unión mecánica, el cuerpo ya mergeado determinaba los imports) y en
este archivo (unión de deudas). El tercero **no vino marcado**: git auto-mergeó `feature_list.json`
dejando **QC-23 duplicada** —las dos sesiones importaron la misma ficha en sitios distintos del
array— y eso lo cazó `./init.sh`, no el merge. Gate completo con las dos features juntas:
46 archivos, 478 tests.

La feature **QC-29 — tema-claro-oscuro** se cerró el 2026-09-02 (PR #16, merge `afd9054`): resumen en `progress/history.md`. Worktree desmontado —`wt.sh done` volvió a fallar en Windows, cuarta vez el mismo día, rematado con `rm -rf` + `git worktree prune`—. **Deja rastro en `dev`: la semilla corta de `specs/QC-21-…/requirements.md`**, puenteada para que el validador no bloqueara el gate. La sesión que lleva QC-21 está avisada y la resuelve en su F2.3 a favor de su rama; **no se resuelve a favor de `dev`**, que perdería 120 líneas y restauraría una R5 insatisfactible. Con este cierre **QC-30 queda desbloqueada**.

La feature **QC-12 — dashboard-en-blanco** se cerró el 2026-09-02 (PR #12, merge `b154fa9`):
resumen en `progress/history.md`. Ciclo completo en una sesión y **la primera feature puramente
aditiva del repo** — 9 archivos, todos `A`, sin tocar QC-11 ni QC-15. Su worktree **no se pudo
desmontar con `wt.sh done`** (el mismo fallo de Windows que quedó documentado al cerrar QC-6, esta
vez el mismo día): se desregistró pero dejó el árbol en disco, y se remató a mano con `rm -rf` +
`git worktree prune`, sabiendo que lo único sin versionar eran `node_modules`, `.env` y
`tsconfig.tsbuildinfo`. Rama local borrada.

La feature **QC-24 — modelo-recetas** se cerró el 2026-09-02 (PR #15, merge `81e3ffc`):
resumen en `progress/history.md`, worktree desmontado y rama borrada. Primera feature de la
épica **QC-27 Recetas** y primer módulo hexagonal creado desde cero. El `reviewer` **rechazó dos
veces** antes del OK, y las tres rondas las resolvió midiendo por mutación. De paso acotó **cinco
aserciones de QC-14 y QC-19** que afirmaban el censo global del repo, más un sexto fallo escondido
(un barrido que leía los comentarios del esquema). `wt.sh done` volvió a fallar en Windows —
tercera vez el mismo día— y se remató con `rm -rf` + `git worktree prune`.

La feature **QC-9 — proteccion-de-rutas-privadas** se cerró el 2026-09-02 (PR #21, merge
`864eeb7`): resumen en `progress/history.md`, worktree desmontado y rama borrada. **Desbloquea a
QC-13, QC-22, QC-23 y QC-25** de golpe. La firma de sesión migró a WebCrypto manteniendo **una
sola** implementación del HMAC y salida idéntica byte a byte, y el rol pasa a viajar dentro del
token. Destapó dos cosas que valían más que la feature: **dos guardias de seguridad estaban
ciegas** por el orden en que quitaban comentarios, y **su E2E encontró que `dev` llevaba rota la
zona privada entera** con todo el mundo en verde, porque el gate no corre E2E. `wt.sh done` falló
por cuarta vez el mismo día.

Worktrees: `.worktrees/11-layout-privado-con-sidebar` (retenido, ver deudas) y
`.worktrees/fix-login-field-control-uncontrolled` (SAFE, desmontable). Los de QC-15 y QC-14 se
desmontaron limpios. El `.worktrees/QC-7-login-usuario-y-contrasena` lo montó la
**segunda sesión de leader** (`.env`, `pnpm install`, `prisma generate` y `next typegen`
hechos a mano). Queda además una carpeta huérfana `.worktrees/1-modelo-usuarios-y-roles/`
sin worktree registrado detrás, anotada en deudas.

La feature **QC-6 — seed-roles-y-usuario-inicial** se cerró el 2026-09-02 (PR #11, merge
`683e6ce`): resumen en `progress/history.md`, worktree desmontado y rama borrada. El
`git worktree remove` de `wt.sh done` **falló a medias en Windows** —desregistró el worktree
pero no pudo borrar `node_modules` por rutas largas de pnpm—; se cerró con `rmdir /s /q` +
`git worktree prune`. Su cierre **desbloquea a QC-19**, que estaba en `spec_ready` esperando
precisamente a esta ficha y ahora tiene el slot de `backend` libre.

La feature **QC-7 — login-usuario-y-contrasena** se cerró el 2026-09-02 (PR #9, merge
`10f9a07`): la ficha estaba todavía como `in_progress` en `feature_list.json` aunque el PR ya
estaba mergeado en `dev`; se pasa a `done` aquí. Falta desmontar su worktree y mover la
tarjeta a *Hecho* en el board.

La feature **QC-14 — modelo-producto** se cerró el 2026-09-02 (PR #10, merge
`abdef6b`): resumen en `progress/history.md`, worktree desmontado. El PR llegó en
`CONFLICTING` con `progress/current.md` chocando entero — era **fin de línea**, no contenido,
y tapaba el borrado accidental de tres deudas abiertas. Ver la lección en el historial.

La feature **QC-15 — arquitectura-hexagonal-y-modulos** se cerró el 2026-09-01 (PR #8, merge
`f79ba5d`): resumen en `progress/history.md`, worktree desmontado y rama local borrada. El
`reviewer` rechazó la guardia **dos veces** por bypass demostrado; la lección está en el
historial y en `harnessConfig/hexagonal/tests/guards/README.md`.

La feature **QC-11 — layout-privado-con-sidebar** se cerró el 2026-09-01 (PR #6, merge
`02883f8`): resumen en `progress/history.md`. Su worktree **no se pudo desmontar**, ver deudas.

La feature **QC-5 — hash-y-verificacion-de-contrasena** se cerró el 2026-09-01 (PR #7, merge
`697cca7`): resumen en `progress/history.md`, worktree desmontado. Se hizo **dos veces** —
la primera con scrypt a mano, parada en el PR por sobre-ingeniería y rehecha con bcrypt.

La feature **7 — pantalla-de-login** se cerró el 2026-08-06 (PR #2, merge `9ac5a5c`):
resumen en `progress/history.md`, worktree desmontado y rama local borrada.

**QC-7 — login-usuario-y-contrasena: la complejidad real fue `high`, no la que trae el board.**
La ficha llego **sin complejidad asignada**. Lo que se estimo como "verificar credenciales y
emitir cookie" (`medium`) paso a `high` el 2026-09-01, cuando el humano respondio la pregunta
abierta 2 con una politica concreta de bloqueo de cuenta: eso arrastro **persistencia,
migracion con su `down.sql`, un puerto y un adaptador de escritura mas, y una tanda entera de
tests** a una feature que no tenia ninguna. El bloqueo entro como **alcance anadido**, no
estaba en la description original. Se decidio dejarlo dentro de QC-7 y no sacarlo a ficha
propia (razonamiento en `specs/QC-7-.../design.md > 11`): es el mismo camino de codigo, y la
respuesta uniforme en contenido y en tiempo hay que disenarla **una vez** — retrofitear
uniformidad sobre un login ya mergeado es exactamente como se cuelan los oraculos.

## Evaluaciones

### QC-55 — tabla-de-datos-compartida: acotada y sembrada (2026-09-04)

- **Sembrada en `specs/QC-55-tabla-de-datos-compartida/requirements.md`** — 21 decisiones cerradas
  y 2 preguntas abiertas. La fuente es ese archivo; aquí no se copia la tabla.
- **Board actualizado antes de sembrar (Paso 5):** `description` reescrita, label
  `complexity:high`, y **QC-57 `orden-y-filtro-en-listados`** creada (`zone:backend`, parent
  QC-16) con link *blocks* hacia QC-56. Es la «ficha de backend nueva» a la que QC-22 remitió el
  2026-09-03 y que QC-26 repitió; **cierra también la deuda de búsqueda por texto**, que llevaba
  dos fichas anotada sin dueño.
- **Dos dependencias aprobadas por el humano**, con los cuatro checks corridos y escritos:
  `@tanstack/react-table` 9.2.4 y `react-day-picker` 10.0.1. **`rsuite` se descartó** pese a pasar
  los cuatro, por sus 14 dependencias (incluida `rsuite-table`) y su sistema de tema propio. Las
  filas de `docs/dependencias.md` las escribe la implementación.
- **Excepción declarada** a `docs/architecture.md > Regla: sin sobre-ingeniería`: se promueve a
  `shared/` sin consumidor, con los dos identificados en QC-56. Está escrita en el spec para que
  el reviewer no la lea como desvío.
- **Sin E2E, diferido con motivo**: ninguna pantalla usa el componente en esta ficha. Lo trae QC-56.

### QC-55 y QC-56 — creadas al acotar la tabla compartida (2026-09-04)

- **Nacen del intento de acotar una feature que no existía.** `/afinar-feature` paró en su Paso 0:
  no había ficha en el board ni en `feature_list.json`. Se crearon las dos en Jira antes de sembrar
  nada, como manda `docs/jira.md > Cuando el disco descubre que el board está desactualizado`.
- **Sin épica nueva.** El humano descartó crear «Componentes del sistema» y las colgó de
  **QC-16 Plataforma**, que ya se define como «el armazón que comparten todos los módulos» y cuya
  propia descripción pide ser la única excepción al criterio «una épica = un módulo».
- **QC-55 no migra nada.** Entrega el componente; adoptarlo en productos y recetas es QC-56, que
  nace `is blocked by` QC-55 **y** QC-52 (las dos editan `product-table.tsx`).
- **`complexity` sigue `null` en ambas** a propósito: la asigna el leader en F1.0.
- **Ninguna está sembrada.** QC-55 se acota con su propia corrida de `/afinar-feature`; los ejes
  que quedaron identificados y sin cerrar son: el contrato de la config de filtros, si el `onChange`
  escribe la URL o estado de React, quién pinta vacío/error/skeleton, y qué pantalla lo estrena.
- **Divergencia detectada y NO tocada:** el board tiene **QC-52 en *En curso*** y
  `feature_list.json` la trae `pending`. Este comando solo refleja las fichas que tocó; lo corrige
  el F0 de la próxima sesión.

### QC-44 — pantalla-de-proveedores: F0 + F1.0 (2026-09-04)

- **NO arranca. Decisión del humano: espera a QC-52.** El `requirements.md` sembrado de QC-52 lo
  dice con todas las letras en su bloque de alcance: *«Lo que NO entra: la pantalla del catálogo de
  proveedores: es QC-44, que todavía no existe y **solo nace con más alcance**»*. QC-52 rehace la
  línea de catálogo entera —pierde `product_id`, gana `name`, `presentation_id`, `unit_id`,
  `image_path` y `deleted_at`, y la presentación pasa a obligatoria—, así que una pantalla
  especificada hoy contra el CRUD de QC-43 nace muerta: formulario, tabla y tests se escribirían
  sobre columnas que QC-52 borra. **El cupo no era el problema** (`frontend` con 0 `in_progress`);
  lo era el alcance.
- **`depends_on` en el board dice solo QC-43, y se queda así.** La dependencia real con QC-52 no se
  añade como link «is blocked by» porque QC-52 no *bloquea* a QC-44: la *redefine*. Cuando QC-52
  cierre, QC-44 se acota con `/afinar-feature` contra la estructura nueva y de ahí sale su alcance
  ampliado. Anotado aquí para que la próxima sesión no lea el board y arranque.
- **`complexity` sigue `null` a propósito.** Evaluarla ahora sería evaluar una ficha cuyo alcance
  aún no existe. Se asigna al acotar.
- **F0 de esta sesión**, corrida en paralelo con la de QC-34 y con el mismo resultado en lo
  sustantivo: 43 issues `Tarea`, todo coincide salvo **QC-40 `ajuste-sidebar`** (*Cancelado* en el
  board), que se importó como `cancelled`. Las dos sesiones la vieron faltar y la escribió una
  sola: el `feature_list.json` quedó con 43 fichas y sin duplicados, verificado.

### QC-34 — crud-de-pedidos: F0 + F1.0 (2026-09-04)

- **F0 — importación del board.** 43 issues de tipo `Tarea` en `QC`. Comparado campo a campo
  contra `feature_list.json` (`status`, `epic`, `epic_name`, `zone`, `complexity`, `slug`, `sdd`,
  `depends_on`): coinciden en las 42 fichas de disco salvo una. **Divergencia real: QC-23 estaba
  en el board en *En revisión* y en disco como `pending`** — manda el board, así que pasa a
  `spec_ready` (su `requirements.md` sembrado ya existe, el gate lo acepta). **QC-40 `ajuste-sidebar`** (board: *Cancelado*) **no estaba
  en disco al empezar la comparación y sí al terminarla**: la sesión paralela que lleva QC-52 la
  importó a mitad de esta F0. Se conserva como `cancelled` — invierte el criterio del 2026-09-03,
  que la dejaba fuera a propósito, y no la revierte esta sesión por ser trabajo ajeno en vuelo. Nada que empujar a Jira: QC-34 ya tiene `zone:backend`, `complexity:high`, `sdd` y
  `slug:crud-de-pedidos`.
- **El gate completo terminó en ROJO antes de tocar nada, y ninguno de los cinco archivos es de
  esta sesión.** Diagnóstico uno por uno, corriéndolos aislados:
  - `tests/integration/identity/identity-seed.int.test.ts` (8 casos) — **rojo de verdad y
    reproducible en aislado**: `tx.user.deleteMany()` viola una FK porque la base local tiene
    **datos hechos a mano** (6 productos, 1 receta, 2 líneas) cuyo `created_by` apunta al usuario
    semilla. El test asume que ningún otro módulo tiene filas apuntando a `users`, supuesto que
    dejó de ser cierto en cuanto QC-20/QC-24 empezaron a guardar autoría. Se limpia la base o se
    endurece el test; **es decisión del humano porque son sus datos de prueba manual**.
  - `tests/integration/proveedores/supplier-crud.int.test.ts` y
    `tests/unit/inventario/product-page.test.tsx` — **flakes bajo carga**: los dos pasan al
    correrlos solos (`supplier` tiene 0 filas; el campo del formulario recibió las teclas
    intercaladas, patrón conocido de jsdom).
  - `tests/unit/recetas/module-contract.test.ts` y
    `tests/unit/recetas-ui/recipe-route-contract.test.ts` — **artefacto de correr el gate sobre
    `dev`**: exigen que `origin/dev...HEAD` traiga diff y en `dev` ese rango está vacío
    (`HEAD == origin/dev`). Dentro del worktree de una feature pasan.
- **F1.0.** `zone: backend`, `complexity: high` y `branch` ya venían evaluados del board; no se
  reevalúa nada. `depends_on` **QC-33** y **QC-8**, las dos `done`. Cupo: **cero** features
  `in_progress` en `backend` (QC-23 está `spec_ready`, no consume cupo). Sin conflicto de archivos:
  lo único en vuelo es **QC-52**, de zona `fullstack` —zonas distintas corren en paralelo sin
  restricción— y toca inventario/proveedores, no `lib/modules/pedidos`.
- Worktree montado en `.worktrees/QC-34-crud-de-pedidos`.
- **F1.2 en pausa a propósito**: la ficha llega con **preguntas abiertas escritas en su propia
  `description`** —qué rol puede consultar/crear/editar/borrar, si el Operador ve solo los suyos,
  y si hay filtros por estado o prioridad— y **no existe** `specs/QC-34-crud-de-pedidos/`. Es
  exactamente el caso que F1.2 manda ofrecer `/afinar-feature` antes de lanzar `spec_author`.
- **QC-34 acotada con `/afinar-feature` el 2026-09-04.** Alcance, **24 decisiones cerradas** y **2
  preguntas abiertas** en `specs/QC-34-crud-de-pedidos/requirements.md` — esa es la fuente, aqui
  solo se enlaza. La acotacion **crecio la ficha**: el humano anadio un **cuarto estado
  `CANCELADO` con motivo obligatorio**, asi que QC-34 deja de ser solo casos de uso y **trae
  migracion** (valor nuevo del enum, columna del motivo, y el `CHECK` de borrado de QC-33 ampliado
  para que tampoco se borre un cancelado). Cierra ademas las **tres cosas que QC-33 dejo escritas
  para aqui**: permisos (solo Administrador), transiciones (solo hacia delante, con `ENTREGADO` y
  `CANCELADO` finales) y quien calcula el correlativo (**secuencia de la base por ano**, que
  cierra su pregunta abierta 2). **Board actualizado ANTES de sembrar**: se reescribio la
  `description` de **QC-34** entera y se ajusto la de **QC-35**, que seguia pidiendo un campo de
  fecha de solicitud que ya no existe y no sabia nada de cancelar. `zone`, `complexity` y
  `depends_on` no cambian; no se creo ni cancelo ninguna ficha.

- **QC-52 acotada con `/afinar-feature` el 2026-09-03.** Alcance, 16 decisiones cerradas y 3 preguntas abiertas en `specs/QC-52-separar-producto-de-catalogo-de-proveedor/requirements.md`; no se copian aquí. Nació de una decisión del humano posterior al merge de QC-43 y **arrastra tres features ya mergeadas** (QC-20, QC-22 y el propio QC-43, del que se caen las reglas que dependían del producto). El board se actualizó antes de sembrar: `description` reescrita y `complexity: high` asignada. También se importaron a `feature_list.json` las fichas **QC-52** y **QC-54**, creadas en el board despues de la ultima F0.

### QC-23 — registro-de-sesiones (acotada el 2026-09-03)

- El alcance y las **20 decisiones cerradas** viven en
  `specs/QC-23-registro-de-sesiones/requirements.md` — esa es la fuente, aquí solo se enlaza.
  Quedan **2 preguntas abiertas**.
- **La decisión que define la ficha: son DOS mecanismos, no uno.** Un **sello por usuario** para
  el cierre total y un **identificador de sesión** en el token más el registro de las cerradas
  para el cierre individual. El humano rechazó la propuesta barata —un solo sello, aceptando que
  cerrar sesión cerrara todo— porque quiso separar la comodidad del usuario de la acción de
  seguridad: **cerrar sesión cierra solo ese dispositivo; el administrador cierra siempre todo**.
- **Verificado al acotar, no supuesto:** el token **ya lleva `iat`**
  (`lib/modules/identity/domain/session-claims.ts`), así que el sello no toca el formato. El
  identificador de sesión **sí** lo cambia, y las sesiones vivas se rompen otra vez — se acepta
  con el criterio que ya usó **QC-9**.
- **Cierra la deuda que QC-9 dejó con nombre y apellido**: un cambio de rol o una baja cortan las
  sesiones al instante. Hoy eso vive como test de caracterización del límite en **QC-9 R30**.
- **Choque de diseño que conviene tener presente para QC-28:** la revocación **falla cerrada**
  (si no se puede comprobar, se corta) y la caché de QC-28 **falla abierta** por requisito
  explícito. Son opuestos, así que **el estado de revocación no puede vivir solo en la memoria
  rápida**. Es la razón por la que QC-23 va antes que QC-28.
- **Corrección a un análisis previo de esta sesión:** se dijo que QC-28 no podría cumplir su
  promesa de efecto inmediato porque el rol viaja firmado. **Es inexacto**: **QC-8 D2** ya resuelve
  el usuario contra la base en cada petición y aplica el rol actual, así que la promesa sí es
  alcanzable; el rol firmado solo gobierna el **borde**, que **QC-9** dejó dicho que no es la
  frontera de seguridad. Lo que no cambia es que QC-23 sigue haciendo falta: nada de eso invalida
  un token copiado.
- **Board actualizado ANTES de sembrar**: `description` reescrita con las seis decisiones nuevas y
  **`complexity: null → high`** (dos mecanismos, cambio de formato del token, migración, permisos
  con test, y un camino que atraviesa todas las peticiones). `zone` y `depends_on` no cambian.
- **Ficha nueva: QC-53 — Cerrar mis sesiones desde mi cuenta** (`frontend`, épica QC-17, *is
  blocked by* QC-23), para el botón del usuario. Nace `pending` en Backlog y **no se siembra**.
- **El botón del administrador NO tiene ficha, y es deliberado**: no existe pantalla de
  administración de usuarios en todo el board, así que la ficha no tendría dónde colgarse.
  Crearla obligaría a inventar una épica. Queda como pregunta abierta 2, con la capacidad
  implementada y sin forma de invocarse desde la interfaz.

### QC-43 — crud-de-proveedores: F1.0 (2026-09-03)

### QC-13 — guardia-de-sesion-en-navegacion (2026-09-03)

- **Acotada con `/afinar-feature`**: alcance, 15 decisiones cerradas y 5 preguntas abiertas en
  `specs/QC-13-guardia-de-sesion-en-navegacion/requirements.md`.
- **Su `description` mentia y se reescribio en el board ANTES de sembrar.** La ficha se redacto
  antes de que existiera QC-9, que se llevo casi todo su alcance: validar la cookie, redirigir en
  los dos sentidos, el formulario autenticando, el layout con el usuario real y el logout ya
  estaban entregados por QC-9, QC-8, QC-11 y QC-12. **Verificado en el codigo, no en los
  documentos.** Y el E2E que QC-12 le difirio **ya existe** (`e2e/session.spec.ts`, QC-9 R24):
  esa deuda se cierra por constatacion.
- **Cuatro campos corregidos en el issue**: `zone` de `fullstack` a **`frontend`** (sin particion),
  `complexity` de `medium` a **`low`**, `depends_on` con **QC-22** anadida (el E2E pasa a necesitar
  `/inventario`), y la `description` nueva. Reflejado en `feature_list.json`.
- **Lo que queda de verdad**: quitar **4** de los 5 enlaces que dan 404 y sus constantes, conservar
  la capacidad de agrupar de `AppSidebar` moviendo su test a fixture propia, y hacer que el
  recorrido E2E del retorno pida `/inventario` en vez de `/dashboard`.
- **CHOQUE CON QC-26 detectado en la validacion de conflicto de F1.0, y evitado a tiempo.** El
  quinto enlace, **Formulas, NO se toca: es de QC-26**, cuyo R5 lo convierte en el catalogo de
  recetas («NO DEBE seguir presentando la etiqueta Formulas»). QC-13 lo borraba. Su spec **no esta
  en `dev`**, solo dentro de `.worktrees/QC-26-pantalla-de-recetas`, asi que el cruce solo se ve
  entrando a leerlo — y **el validador no lo automatiza**: es comprobacion del leader. Corregido en
  el spec sembrado, en el board y en `feature_list.json` antes de montar nada.
- **Sigue habiendo interseccion de archivos con QC-26** (`private-nav.ts`, `app-sidebar.test.tsx`):
  el alcance ya no se solapa pero el archivo si, y **quien mergee segundo se come el conflicto**.
  Sincronizar con `dev` justo antes del PR, no solo al empezar.
- **La raiz `/` queda fuera y SIN ficha**, por decision explicita del humano: mas adelante habra una
  pantalla de inicio de verdad y entonces nacera su tarjeta. Hasta entonces la primera pantalla del
  ERP sigue siendo la plantilla de `create-next-app`, publica. Anotado como pregunta abierta 5.

- **Gate de `dev` en verde** al arrancar (97 archivos), y el propio gate avisó de que la entrada
  del baseline que dejó QC-22 **ya pasaba**: era la guardia de dependencias, roja por la fila de
  `@supabase/storage-js` de QC-25, y QC-25 ya está mergeada. **Retirada**; el baseline vuelve a
  estar vacío, que es como informa.
- **`zone: backend` y `complexity: high` ya venían del board**, con las cuatro labels puestas
  (`sdd`, `slug:crud-de-proveedores`, `zone:backend`, `complexity:high`). No hizo falta empujar
  nada a Jira: esta vez la evaluación ya estaba hecha.
- **Cupo, con la regla nueva de una feature por zona Y épica.** La única en vuelo es **QC-33**
  (backend · épica QC-31 Pedidos). QC-43 es backend · **QC-41 Proveedores**: par distinto, así que
  entra. Con la regla vieja de «2 por zona» habría entrado igual, pero por poco.
- **Dependencias**: QC-42 y QC-8, las dos `done` y `Finalizado` en el board. Worktree en
  `.worktrees/QC-43-crud-de-proveedores`, rama desde `origin/dev` en `d532662` (el merge del PR
  #25, que es justo QC-42).
- **Parada en F1.2, y aquí no es una formalidad.** QC-42 no dejó preguntas vagas: dejó **encargos
  con destinatario**. Su `requirements.md` y su `design.md` nombran a QC-43 quince veces. Lo que
  cae de lleno en esta ficha:
  1. **El contacto en blanco.** La decisión 7 de QC-42 exige «al menos teléfono o correo», pero el
     `CHECK` de la base solo mira **ausencia de valor**: `phone = ''` lo satisface igual que un
     teléfono real. La posición por defecto escrita es que **QC-43 lo rechace con zod**. Si la
     respuesta fuera que la base también debe impedirlo, es otro `CHECK` y cambiarlo con
     proveedores cargados obliga a limpiar datos.
  2. **El rastro de quién edita una línea del catálogo.** La línea no lleva columnas de autor
     (decisión 14, heredada de `recipe_lines`), pero allí editar una línea es editar la fórmula y
     el rastro queda en `recipes.updated_by`; aquí **subir el costo es un hecho comercial propio**.
     Dos caminos y ninguno gratis: que QC-43 toque `suppliers.updated_by` (barato, impreciso) o
     columnas de auditoría propias (una migración más).
  3. **¿Un costo de 0 es válido?** Hoy la base solo prohíbe negativos. Una muestra gratis lo
     justifica; un cero por descuido, no.
  4. **El mínimo de compra no dice en qué se mide**: se lee según la unidad del producto, que
     QC-32 dejó **opcional**.
  5. **El filtro de borrado lógico en las consultas lo pone QC-43**: QC-42 no tiene ninguna.
  Y además: los puertos, los adaptadores driven y driving del módulo `proveedores` están **vacíos
  con `.gitkeep`** esperando a esta ficha, y la autorización en el service la fija QC-43
  (decisión 20 de QC-42).
  No existe `specs/QC-43-crud-de-proveedores/`. **Se ofreció `/afinar-feature QC-43`**: lanzar
  `spec_author` sin cerrar esos cinco puntos es pagar la ronda dos veces, y aquí están escritos
  con nombre.
- **Acotada con `/afinar-feature` el 2026-09-03.** Alcance, 16 decisiones cerradas y 4 preguntas abiertas en `specs/QC-43-crud-de-proveedores/requirements.md`; no se copian aquí. **Cambió el alcance en dos cosas y las dos se escribieron en el issue ANTES de sembrar**: los permisos pasan de «usuarios con sesión iniciada» a **solo el Administrador**, y la ficha **trae tres cambios de esquema sobre QC-42** —contacto en blanco rechazado también en la base, costo estrictamente mayor que cero, y columnas de autor en la línea del catálogo—, baratos porque las tablas están vacías. Ninguna ficha nueva ni huérfana.

### QC-33 — modelo-pedidos (acotada el 2026-09-03)

- El alcance y las **26 decisiones cerradas** viven en
  `specs/QC-33-modelo-pedidos/requirements.md` — esa es la fuente, aquí solo se enlaza. Queda
  **1 pregunta abierta**.
- **Cierra la pregunta abierta n.º 4 del dominio**, la de contabilidad e impuestos, que llevaba
  abierta desde el inicio del proyecto: el ERP **no factura ni liquida impuestos**, el dinero sí
  entra al modelo con `decimal(14,4)`, y los totales son **internos y derivados**, no columnas.
  `docs/architecture.md` queda actualizado. De las cuatro originales ya solo siguen abiertas la
  **2** (lote y vencimiento) y la **3** (FDS/GHS).
- **Tres decisiones se apartan de un precedente, y las tres a conciencia:** los conjuntos
  cerrados van como **enum de Prisma** y no como tabla tipo `DocumentType` (**QC-4**), asumiendo
  que añadir un valor será una migración del tipo; la unidad es **obligatoria**, siguiendo a
  QC-24 y no a QC-14; y «un pedido entregado no se borra» se garantiza con **`CHECK` en la base**
  y no solo con validación de aplicación en QC-34, por la filosofía de **QC-20 D16**.
- **El pedido no tiene cliente, y es deliberado.** No hay catálogo de clientes ni ficha que lo
  cree, y **no se creó ninguna**. El humano asumió el coste: añadirlo después obliga a decidir
  qué cliente llevaban los pedidos ya cargados.
- **Board actualizado ANTES de sembrar**, y con dos correcciones que la acotación descubrió: la
  ficha decía que el estado «debe poder crecer sin migrar» (falso con enum) y que el pedido
  guarda una **fecha de solicitud** propia (se elimina: la pone el sistema y no se edita, o sea
  que es `created_at`). Se le sumaron el correlativo **por año**, que el precio es **unitario**,
  que la unidad es obligatoria y que un pedido entregado no se borra. `zone`, `complexity` y
  `depends_on` no cambian. No se creó ni canceló ninguna ficha.
- **No arranca todavía**: la zona `backend` está en **2 de 2** (QC-25 y QC-42), así que F1.0
  espera a que una pase a `done`. La ficha sigue `pending` en Backlog.

Una entrada por feature evaluada (paso F1.0 de `AGENTS.md`): qué `zone` y
`complexity` se le asignaron y por qué, y si hubo partición de una `fullstack`.

### QC-22 — pantalla-de-productos: F1.0 (2026-09-03)

- **Arranque de sesión: el gate estaba ROJO en `dev` antes de tocar nada.** `pnpm typecheck`
  fallaba con 24 errores TS2353/TS2339 en `inventario` (`nameNormalized`, `createdBy`,
  `updatedBy` «no existen» en los tipos de Prisma). No era una regresión de código: el schema
  `db/schema.prisma` sí los declara desde el merge de QC-20 (`1be1021`) — lo que estaba viejo
  era el **cliente generado** en `node_modules`. `pnpm prisma generate --schema db/schema.prisma`
  lo dejó en verde. Ver *Deudas* para la grieta que esto destapa.
- **Rojo transitorio en la primera corrida.** Tras el generate, 3 tests de `login-form` cayeron
  por `Test timed out in 5000ms` (`tests/ui/login-form-uncontrolled-warning.test.tsx` y
  `tests/unit/login-form.test.tsx`). Aislados pasan los 29 en 10 s; la corrida completa venía
  con `environment 416s` contra los 63 s de la corrida sana. Es saturación de la máquina, no
  regresión. **Gate completo verde: 89 archivos, 957 tests.**
- **`zone: frontend`** — la description es íntegramente capa visual: «pantalla», «lista
  paginada», «formulario», «estados (vacío, cargando, error)». Las operaciones ya existen y
  las expone QC-20 como Server Actions, así que no hay trabajo de backend.
- **`complexity: medium`** — dos catálogos (productos y presentaciones) con CRUD completo y
  tres estados de carga cada uno: son varios archivos y varias capas, pero sin integración
  externa ni webhooks que la empujen a `high`. Evaluada aquí y **empujada al issue** como
  label `complexity:medium`; el board solo traía `zone:frontend`.
- **Cupo y conflicto.** `frontend` tenía 1 `in_progress` (QC-30) de 2 permitidas. Validación
  de archivos contra `progress/impl_QC-30-rediseno-login.md`: QC-30 toca
  `app/(public)/login/*`, `app/globals.css` y `components/ui/`; QC-22 vive bajo
  `app/(private)/`. Sin intersección, y QC-30 ya cerró su ciclo de código —solo espera el
  merge humano del PR #20—, así que ni siquiera puede crecer hacia esos archivos.
- **Parada en F1.2.** La description **delega explícitamente** el alcance al acotado: «la forma
  de la pantalla —una ruta o dos, formulario en modal o en página, búsqueda y orden— se decide
  al acotar esta ficha, y ahí también se decide si hace falta prueba de extremo a extremo». No
  existe `specs/QC-22-pantalla-de-productos/requirements.md`. Lanzar `spec_author` en crudo
  sería pagar la ronda dos veces. Se ofreció `/afinar-feature QC-22`.
- **Acotada con `/afinar-feature` el 2026-09-03.** El alcance, las 22 decisiones cerradas y la unica pregunta abierta viven en `specs/QC-22-pantalla-de-productos/requirements.md`; no se copian aqui. Cambio de alcance: la ficha se queda **solo con productos** y la pantalla de presentaciones salio a **QC-45**, creada en el board ese dia (epica QC-18, `is blocked by` QC-22). La `description` de QC-22 se reescribio en el issue y las dos cosas estan reflejadas en `feature_list.json`.
- **Dos ampliaciones de alcance aprobadas por el humano el 2026-09-03, ya en implementación.** Las
  dos salieron del mismo sitio: montar el `<Toaster />` y declarar la primera regla ruta→rol
  tocan supuestos que otras features dejaron escritos, y R32 del spec limita los archivos
  heredados a cuatro. Ninguna se resolvió a ojo.
  1. **`tests/unit/sidebar-mobile.test.tsx:171`** (R30 de QC-11) quedó obsoleta al montar la
     región de avisos. **No es regresión**, y el leader lo verificó: neutralizando esa línea el
     resto del test pasa, **incluida la 172** —`queryByRole('main')` sigue devolviendo `null`—,
     que es la que protege el comportamiento de verdad. La causa es `markOthers` de Base UI, que
     en cuanto existe un `[aria-live]` mueve el `aria-hidden` a los hijos **a propósito**, para
     que los toasts se sigan anunciando con el modal abierto. Autorizado tocar ese archivo
     **solo** para que la aserción afirme el resultado en vez de la granularidad del marcado, con
     fecha y motivo dentro del test.
  2. **`route-role-rules.ts` importaba `@/lib/shared/routes` desde `domain/`**, que
     `docs/architecture.md > La regla de dependencias` prohíbe y
     `tests/guards/guard-arquitectura-modulos.test.ts` detecta. Lo introdujo T3. Decisión del
     humano: **la lista concreta de reglas se muda al adaptador driving**
     (`route-guard-middleware.ts`), que sí puede importar `lib/shared`; el dominio conserva el
     tipo y `findRouteRule`, que **ya recibía las reglas por parámetro** —la arquitectura estaba
     preparada para esto y el único consumidor de la constante era ese adaptador—. Se descartó
     declarar `/inventario` dentro de `identity`: rompería la decisión de «una sola constante por
     ruta», que es justo el caso que `private-nav.ts` documenta («así se acaba con `/dashboard` y
     `/panel` conviviendo»).

### QC-26 — pantalla-de-recetas: F1.0 (2026-09-03)

- **Cupo, con la regla nueva.** `(frontend, QC-27)` está libre: en vuelo solo hay `(backend, QC-31)`
  —QC-33— y `(backend, QC-41)` —QC-42—. Con la regla vieja de «2 por zona» habría dado igual; con la
  nueva importa la épica, y ninguna otra ficha de Recetas está en curso. Su dependencia **QC-25 se
  cerró hoy**, así que entra desbloqueada.
- **`complexity: high`, asignada por el leader** (venía `null` del board) y **escrita como label en
  el issue**, sin lo cual la próxima importación la borraría. No es el mismo caso que **QC-22**
  (`medium`, la pantalla de productos): aquella es una tabla con alta y edición en un panel; esta
  suma **sub-formulario de líneas de producto** —añadir, quitar, cantidad y unidad por línea—,
  **editor de pasos ordenados** y **subida de imagen con vista previa y estado propio**. Son tres
  superficies con estado que no existen en QC-22.
- **Sin partición.** Es toda capa visual: las nueve operaciones ya existen y las expone QC-25 como
  Server Actions. La `description` lo dice y la frontera está limpia.
- **Se para en F1.2 y se ofrece `/afinar-feature`**, y aquí no es una recomendación de estilo: la
  propia `description` dice que **la forma de la pantalla se decide al acotar esta ficha** —una ruta
  o dos, formulario en modal o en página, cómo se agregan, quitan y reordenan líneas y pasos,
  búsqueda y orden— **y que ahí también se decide si hace falta E2E**. Lanzar `spec_author` sin eso
  es pedirle que invente el producto.
- **Acotada y sembrada el 2026-09-03** con `/afinar-feature`: 18 decisiones cerradas y 3 preguntas
  abiertas en **`specs/QC-26-pantalla-de-recetas/requirements.md`** (en el worktree) — esa es la
  fuente, aquí no se copia. **El board SÍ cambió**: la `description` se reescribió antes de sembrar
  porque la ficha decía «es la capa visual» y ahora incluye una operación de backend. Tres cosas
  que salieron de la acotación y que nadie había visto: **el selector de unidad no tenía de dónde
  leer** —QC-32 creó la tabla y sembró cuatro unidades pero no expuso consulta, así que la pantalla
  habría quedado muerta—; **la URL no se inventa**, se toma el placeholder «Fórmulas»
  (`/produccion/formulas`) y su etiqueta pasa a «Recetas»; y **`dnd-kit` falla el check 2** (sin
  publicar desde 2024-12-05), así que entra como **`excepcion`** aprobada explícitamente, no como
  `aprobada`. Su fila en `docs/dependencias.md` la escribe el leader en F1.4 y **debe decir qué
  check falló y por qué se aceptó**.
- **Contexto fresco que la acotación hereda de QC-25, y que conviene no volver a preguntar:** el
  listado **no trae las líneas** y el detalle sí; la edición manda **la lista final completa** y el
  servidor concilia; la imagen se guarda como **ruta** y la URL pública se compone al leer; el
  bucket es **público**; los autores llegan como **ids**, no como nombres —resolverlos es alcance de
  esta ficha, vía el contrato de `identity`—; y la unidad de la línea es **referencia al catálogo de
  `unidades`**, no texto libre.

### QC-25 — crud-de-recetas: F0 + F1.0 (2026-09-03)

- **F0 — importación del board.** 34 issues de tipo `Tarea` en `QC`. Comparado campo a campo
  contra `feature_list.json`: `status`, `epic`, `zone`, `complexity`, `slug` y `depends_on`
  **coinciden en las 33 fichas**. Única divergencia: **QC-40 `ajuste-sidebar` está en el board
  como *Cancelado* y no está en disco** — es deliberado (se canceló y el ajuste va como arreglo
  en `feature/fix-ajuste-sidebar`, sin ficha), así que la importación no la añade. No hizo falta
  reescribir nada: el único cambio de esta sesión ya estaba en el árbol sucio (QC-9 → `done`).
- **El gate falló en el primer intento y no era deuda de nadie**: `pnpm typecheck` reventó con
  ~25 errores de `nameNormalized` / `createdBy` / `updatedBy` inexistentes en los tipos de
  Prisma. Es **exactamente el síntoma ya documentado** en `history.md` (el cliente generado
  queda por detrás tras cada merge): `pnpm exec prisma generate` y verde. Vale la pena que
  `./init.sh` lo detecte solo, pero eso es material de `/afinar-regla`.
- **Un rojo de la suite completa que NO es un rojo:** `tests/ui/login-form-uncontrolled-warning.test.tsx`
  falló 2 de 4 por *timeout* de 5 s bajo carga, y **pasa 4/4 corriéndolo solo** (6 s). Es flake de
  `userEvent` en jsdom, no deuda: **no se añade a `baseline-rojos.json`**, que sigue vacío.
- **`zone: backend`, `complexity: high`** — ya evaluadas y escritas como labels en el issue; F1.0
  las confirma, no las reasigna. Sin partición: la description es toda servidor y dice
  explícitamente que «la pantalla va aparte» (QC-26).
- **Cupo y conflictos:** la zona `backend` tiene **0 features `in_progress`** (QC-30, la única en
  curso, es `frontend`), así que entra sin agotar el cupo de 2. Dependencias `QC-24`, `QC-20` y
  `QC-8`: las tres `done`. Worktree montado con `./scripts/wt.sh new QC-25 crud-de-recetas`.
- **Se para en F1.2 y se ofrece `/afinar-feature`**, porque se cumplen las dos condiciones que
  lo piden: no existe `specs/QC-25-crud-de-recetas/requirements.md`, y la ficha llega con
  **tres preguntas abiertas ya escritas** (destino del archivo en Storage al borrar la receta,
  límites de la imagen —tamaño, tipos, bucket público o privado—, y si una receta produce algo)
  **más una dependencia sin aprobar**: el cliente de Supabase, que entra por la regla 7 con sus
  cuatro checks de salud y su fila en `docs/dependencias.md`. Lanzar `spec_author` sin cerrar
  eso es pagar la ronda dos veces.
- **Acotada y sembrada el 2026-09-03** con `/afinar-feature`: 22 decisiones cerradas y 4 preguntas
  abiertas en **`specs/QC-25-crud-de-recetas/requirements.md`** — esa es la fuente, aquí no se
  copia. Las tres preguntas que traía la ficha quedaron cerradas (el archivo de Storage sobrevive
  al borrado de la receta y solo se borra al reemplazarlo; **bucket público**, con su consecuencia
  escrita; 5 MB y JPEG/PNG/WebP), y la de negocio —si una receta produce algo— sigue abierta
  porque no la decide un agente. Dependencia **aprobada por el humano**: `@supabase/storage-js` y
  **solo** ese sub-paquete, no `supabase-js` entero, para que el cliente de datos que
  `CHECKPOINTS.md` prohíbe ni exista en el repo; los cuatro checks pasan (MIT, publicado el
  2026-09-02, 25,3M descargas/semana, no deprecada) y su fila en `docs/dependencias.md` va en F1.4.
  **El board no se tocó**: `zone`, `complexity`, `depends_on` y la `description` siguen siendo
  ciertos, y todo lo que sale del alcance ya tiene ficha (QC-26 la pantalla, QC-32 la unidad).
- **F1.2 — `spec_author`, y lo que encontró.** 49 requisitos y 19 tasks, sin migración propia. Dejó
  **tres preguntas** que las 23 decisiones no cubrían, y la tercera es un hallazgo real, no una duda
  de estilo: **R17 y R18 se contradicen** en un caso concreto —R18 garantiza que la receta conserva
  la línea de un producto dado de baja, R17 exige que el producto exista para guardar, y el contrato
  `ProductCatalog` de `inventario` solo devuelve productos vivos—, así que **editarle la descripción
  a una receta con un producto de baja habría fallado** por una línea que ya tenía. El humano cerró
  las tres el mismo día: se admite la línea preexistente y se exige existencia **solo para los
  productos nuevos** (R45/R46); quitar la imagen sin poner otra **sí borra el archivo** —lo que
  deroga la frase «es el único borrado de Storage», tachada en su fila con el motivo, y obliga a que
  los dos caminos compartan la misma operación del puerto (R47/R48)—; y un borrado de archivo
  fallido **no revierte** la edición ya guardada (R49). La 5 se cerró **contra** la posición por
  defecto del diseño, y `design.md > 13.1` quedó marcada como descartada con lo que se implementa.
- **[override de modelo, con su razón escrita — F2.1 de QC-25, 2026-09-03]** El `implementer` se
  lanzó con **Sonnet** en vez de heredar el modelo de la sesión, que es lo que manda
  `AGENTS.md > Modelos`. La razón concreta, que es la que esa regla exige: **cinco arranques
  seguidos murieron con `529 Overloaded` de la API contra `claude-opus-5`**, y los cinco perdieron
  el 100 % del trabajo porque cayeron antes de escribir una línea. Se probó esperar cinco minutos,
  reanudar el mismo subagente y lanzar uno nuevo con contexto limpio: los tres fallaron igual, así
  que **no era la transcripción acumulada** —esa hipótesis quedó descartada por el intento con
  agente nuevo—. La sesión del leader nunca falló contra el mismo modelo: lo que rebotaba era el
  arranque de subagentes. Decisión humana del 2026-09-03. **Mitigación**: el `reviewer` de F2.2
  hereda el modelo de la sesión y tiene el encargo explícito de morder fuerte en las tres partes
  sutiles del spec —la conciliación de líneas, la validación solo de productos nuevos (R45/R46) y
  los tres estados de la imagen (R47–R49)—, que es donde un modelo distinto mete deuda callada.
- **[lección para `/afinar-regla`] Los cinco cortes de hoy son la misma lección que ya está escrita
  en `AGENTS.md > Regla del gate`** sobre los cinco subagentes que murieron en corridas largas de
  verificación — pero allí solo se aplicó al gate. Lo que faltaba decir es que **un subagente tiene
  que escribir en disco a medida que avanza**, no al final: marcar cada task en cuanto cierra y
  commitear al cerrar cada grupo. Con eso, un corte cuesta la tanda en curso; sin eso, cuesta todo.
  Es la regla 3 de `CLAUDE.md` aplicada al subagente y no solo al chat.
- **[deuda de QC-25, no bloqueante — menor-10 de la review]** Se puede hacer que
  `isUniqueNameViolation` (`lib/modules/recetas/adapters/driven/persistence/recipe-prisma.ts`)
  devuelva **siempre `false`** y los 39 tests de integración de recetas siguen verdes. **Ningún
  test miente**: R10 prueba el índice único con SQL crudo y R8 prueba la traducción del dominio
  con un doble; lo que queda huérfano es **la costura del adaptador**, que ningún requisito
  nombra. El reviewer lo verificó contra Postgres real y no lo consideró bloqueante. Está dicho
  en el PR #23, no tapado.
- **[deuda de infraestructura — EL `.env` DE UN WORKTREE NO LO LEE EL RUNNER DE TESTS]** Es la más
  cara de las de hoy y explica dos incidentes. `init.sh` **solo comprueba que el archivo exista**; no
  lo exporta, y Vitest tampoco lo carga. Lo que decide a qué base pegan los tests de integración es
  **la variable del entorno del proceso**, que apunta a la base compartida. Consecuencias reales: el
  primer gate de QC-26 dio **12 archivos en rojo** por correr contra la base de otra sesión, y el
  bloqueo de QC-25 se «resolvió» dando base propia al worktree cuando en realidad el gate seguía
  pegando contra la compartida —lo que lo salvó fue que para entonces ya tenía la migración de
  unidades aplicada—. **La conclusión sigue siendo correcta** (un worktree necesita base propia),
  pero **el mecanismo estaba a medias**: sin `set -a && . ./.env && set +a`, la base propia es
  decorativa. Forma de la regla, a afinar: si el arnés declara base por worktree, **`init.sh` tiene
  que cargar el `.env` del worktree**, porque acordarse a mano ya falló dos veces en una sesión.
- **[deuda del arnés — `git add -A` en un repo con dos sesiones]** Causó el **MAYOR 2** de la review
  de QC-26: un `git add -A` en el worktree principal —que estaba en la rama `fix-ux` con trabajo sin
  commitear de la sesión hermana— arrastró **seis archivos ajenos** a la rama de QC-26, violando R48
  y R51. Se arregló devolviéndolos al estado de `dev` (nada se perdió: siguen en `fix-ux`). La raíz
  es doble: **alguien hizo `checkout` en el worktree principal**, que `AGENTS.md` prohíbe
  explícitamente, y el leader usó `git add -A` en vez de nombrar sus archivos. Las dos mitades son
  material de `/afinar-regla`.
- **[deuda de infraestructura — hay una base de datos HUÉRFANA]** Al borrar `QuimiCloude_QC25` en
  el cierre de QC-25 se vio que **`QuimiCloude_QC14` sigue existiendo**, aunque QC-14 se cerró hace
  días. Nadie la borró porque el desmontaje de un worktree **no sabe nada de la base propia**: son
  dos pasos manuales y solo uno está en `wt.sh`. Van dos bases vivas de features cerradas si nadie
  mira. Mismo material de `/afinar-regla` que el punto siguiente.
- **[deuda de infraestructura — el drift de base entre worktrees]** Varios worktrees compartían
  **una sola base física** (`localhost:5432/QuimiCloude`), y la sesión hermana aplicó ahí
  migraciones de QC-32 y QC-42 que renombraron columnas. Eso **bloqueó los tests de integración
  de QC-25** hasta que se le dio base propia (`QuimiCloude_QC25`), replicando lo que ya se había
  hecho con `QuimiCloude_QC20`. Se ha resuelto **a mano dos veces**: no hay nada en `wt.sh new`
  ni en `docs/worktrees.md` que lo automatice ni lo documente, así que la tercera feature en
  paralelo volverá a tropezar. Material de `/afinar-regla`.
- **[deuda del arnés] La columna del board se llama «En revisión», no «Spec en revisión»** como
  afirma `docs/jira.md > El board de este repo`. El mapeo de F0 que traduce columna → `status` está
  escrito contra el nombre que no es; hoy no rompió nada porque ninguna ficha estaba en esa columna
  al importar, pero la próxima importación con una ficha ahí la mapearía mal. **No se parchea a
  mano**: es documentación del arnés y entra por `/afinar-regla`.

### QC-42 / QC-43 / QC-44 — proveedores (2026-09-02)

- **Fichas nuevas, nacidas en el board** a peticion del humano: epica **QC-41 «Proveedores»**
  (modulo de dominio propio, no cuelga de Catalogos ni de Inventario — decision humana) con
  `QC-42 modelo-proveedores` (`zone: backend`, `complexity: medium` — dos tablas y una regla
  cruzada), `QC-43 crud-de-proveedores` (`zone: backend`, `complexity: high`, mismo patron que
  QC-20) y `QC-44 pantalla-de-proveedores` (`zone: frontend`, `complexity` sin asignar, como sus
  hermanas QC-22 y QC-39). Labels `sdd` / `slug:` / `zone:` / `complexity:` escritos en cada issue.
- Links «is blocked by»: QC-42 ← QC-14 (`productId` del catalogo), QC-43 ← QC-42 y QC-8,
  QC-44 ← QC-43. Reflejadas en `feature_list.json` — solo esas tres, como manda `docs/jira.md`.
- **No estan acotadas.** Quedan abiertas al menos: moneda y precision de `costo`, unidad de
  `minimo_compra` (¿la unidad del producto, QC-32?) y de `tiempo_entrega` (¿dias?), si el
  proveedor se borra o se inactiva, y si el nombre completo es unico. Se cierran con
  `/afinar-feature` antes de F1.2.
- **QC-42 acotada el 2026-09-03** con `/afinar-feature`: alcance, 22 decisiones cerradas y 5
  preguntas abiertas en `specs/QC-42-modelo-proveedores/requirements.md`. El board no cambio
  (los cuatro campos seguian siendo ciertos, QC-43 y QC-44 ya existen, ninguna ficha quedo
  huerfana), asi que tampoco cambio `feature_list.json`. QC-43 y QC-44 siguen SIN acotar.

### QC-21 — ayuda-visual-de-contrasena (2026-09-02)

- `zone: frontend`, `complexity: medium`. La description es UI pura («ver los requisitos», «a
  medida que escribe») y las reglas ya existen probadas en QC-19: aquí no hay nada de backend.
  No es `low` porque son varios archivos con estado vivo y siete reglas que pintar. Labels
  `zone:frontend` y `complexity:medium` escritos en el issue.
- **Acotada con `/afinar-feature` el 2026-09-02.** Las decisiones cerradas y lo que queda abierto
  viven en `specs/QC-21-ayuda-visual-de-contrasena/requirements.md`; no se copian aquí.
- **La acotación descubrió que la ficha no tenía dónde vivir**: hoy **ninguna pantalla fija o
  cambia una contraseña** —el login solo verifica—, así que el componente nacía sin consumidor.
  Decisión humana: se construye igual, y se creó en el board **QC-36 — cambiar-mi-contrasena**
  (épica QC-17, `zone: fullstack`, *is blocked by* QC-21) como su primer consumidor. QC-36 cierra
  además un agujero abierto: `must_change_credential` lo escribe el seed de QC-6 y **no lo lee
  nadie**, o sea que el usuario inicial nace obligado a cambiar su contraseña y no tiene por dónde.
- La acotación **cambió el alcance**, así que se reescribió la `description` en el issue QC-21
  antes de sembrar, y se le añadieron los labels `sdd` y `slug:` que le faltaban del contrato.
  `zone` y `complexity` no cambiaron.

### Épica nueva: QC-31 — Pedidos, y sus fichas (2026-09-02, decisión humana)

- El humano pidió la épica de pedidos con «el modelo, el crud y el front». Se creó **QC-31 —
  Pedidos** y salieron **cuatro** fichas, no tres: **QC-33** modelo-pedidos (`backend`,
  `medium`), **QC-34** crud-de-pedidos (`backend`, `high`), **QC-35** pantalla-de-pedidos
  (`frontend`, `complexity` sin evaluar hasta acotarla, igual que QC-26), y **QC-32**
  modelo-unidades.
- **QC-32 no cuelga de QC-31** (nació bajo QC-18 Inventario y el 2026-09-02, al acotarla, se movió a la épica nueva QC-37 — Catálogos), y es la ficha que la conversación
  descubrió: el humano decidió que la unidad separada es un **catálogo compartido**, así que
  reemplaza el texto libre `Product.unit` y la unidad anotativa de la línea de receta. Eso la
  saca del alcance de pedidos — toca inventario y recetas — y la convierte en dependencia de
  QC-33. Bloqueada por **QC-24**, que hoy está `in_progress` y está creando esas líneas de
  receta: tocar su columna antes de que cierre es colisión segura.
- Las otras tres decisiones humanas, tomadas antes de escribir las fichas: **un pedido es una
  sola línea** (receta, cantidad, precio, unidad) y no cabecera con ítems; **el precio de venta
  se escribe a mano** en el pedido, así que la receta *no* gana columna de precio y QC-24 no se
  toca por esto; y el pedido lleva además **fecha de solicitud**, **prioridad** (opcional, baja
  por defecto, conjunto cerrado y ordenado: baja/media/alta/crítica), **estado** (pendiente, en
  curso, entregado) y **autoría** creó/modificó.
- **Modelos en inglés** (`Unit`, `Order`), como manda la convención de `db/schema.prisma`.
- Lo que queda abierto y se cierra con `/afinar-feature`, no aquí: qué se hace con los textos
  libres de unidad ya guardados (QC-32), la forma técnica de los dos conjuntos cerrados —
  catálogo tipo `DocumentType` o enum — y las transiciones válidas de estado (QC-33), y **qué
  rol puede qué** sobre pedidos (QC-34), que es lo que decide también quién ve la pantalla.
- `depends_on` por issue links «is blocked by»: QC-32 ← QC-24; QC-33 ← QC-32, QC-24;
  QC-34 ← QC-33, QC-8; QC-35 ← QC-34. Ninguna arranca todavía: las cuatro nacen `pending` en
  Backlog y el cupo de `in_progress` no se mueve.

### QC-30 — rediseno-login (acotada el 2026-09-02)

- El alcance y las **14 decisiones cerradas** viven en `specs/QC-30-rediseno-login/requirements.md`
  — esa es la fuente, aquí solo se enlaza. Quedan **2 preguntas abiertas**. Los valores exactos del
  diseño (vidrio, burbujas, medidas) están en `design-input-login.md`, que dejó la sesión de QC-29.
- **Traspaso entre sesiones:** `labs-65` la había reclamado sin trabajo empezado y la soltó al
  pedírselo. No había rama, worktree, spec ni commits — distinto del caso de QC-20, donde sí los
  había. La lección se aplicó al revés que por la mañana: preguntar antes, no deducir del silencio.
- Las dos decisiones del humano al acotar: **los 44 px de alto aplican SOLO al login**, no a toda
  la aplicación (regla acotada, fuera de `@layer` y sin editar `components/ui/`, precedente de
  QC-29); y **la vista móvil entra**. El artboard móvil lo había dibujado la sesión de diseño por
  criterio propio y el humano no lo había pedido: entra porque lo decidió hoy, no porque el canvas
  lo trajera.
- Board actualizado **antes** de sembrar: `description` reescrita con esas dos decisiones.
  `zone: frontend` y `complexity: medium` no cambian. No se creó ni canceló ninguna ficha.
- **Colisión conocida y pactada:** `app/globals.css` lo toca en paralelo la rama
  `feature/fix-ajuste-sidebar`, **sin ficha** (QC-40 se canceló y el ajuste va como arreglo
  directo), así que ese trabajo no figura como `in_progress` en ninguna parte. Acuerdo: bloques
  separados, nadie reordena ni reindenta el archivo, y quien vaya a tocar líneas del otro avisa
  antes de escribir.

### QC-32 — modelo-unidades (acotada el 2026-09-02)

- El alcance y las **19 decisiones cerradas** viven en
  `specs/QC-32-modelo-unidades/requirements.md` — esa es la fuente, aquí solo se enlaza.
  Quedan **3 preguntas abiertas**.
- **La decisión que cambia el mapa: `unidades` es un módulo hexagonal propio**, no parte de
  `inventario`. Inventario, recetas y pedidos lo consumen por su contrato público. Como la
  frontera de la épica es la del módulo (`docs/jira.md`), se creó la épica **QC-37 —
  Catálogos** y la ficha se movió allí desde QC-18.
- **Reabre la pregunta abierta n.º 1 del dominio**, que QC-14 cerró el 2026-09-01 como texto
  libre asumiendo a conciencia el coste de normalizar después. `docs/architecture.md` queda
  actualizado: ya no es «texto libre», es este catálogo.
- Board actualizado **antes** de sembrar: `parent` → QC-37, `complexity: medium → high` (ya no
  es una tabla: es un módulo nuevo, su seed, y alterar dos tablas ajenas) y `description`
  reescrita con lo acordado.
- **Dos fichas nuevas** que descubrió el «Lo que NO entra»: **QC-38 — CRUD de unidades**
  (`backend`, *is blocked by* QC-32) y **QC-39 — Pantalla de unidades** (`frontend`, *is blocked
  by* QC-38). El humano pidió una sola ficha «CRUD + pantalla»; se partió en dos porque una
  evaluaría como `fullstack` y `AGENTS.md` obliga al leader a partirla igual en F1.0. Nacen
  `pending` en Backlog y **no se siembran**.
- Sin esas dos fichas el catálogo era **inadministrable**: sin pantalla, la única forma de crear
  una unidad sería el seed. Por eso el seed arrancador (kg, g, L, mL, unidad) entra en QC-32 y no
  se difiere.

### QC-30 — rediseno-login (ficha creada en esta sesión, 2026-09-02)

- **`zone: frontend`, `complexity: medium`.** Es una pantalla y su hoja de estilo: sin
  migración, sin endpoint, sin tocar la Server Action. Medium y no low porque toca cuatro
  archivos, dos efectos nuevos (vidrio y animación) y una decisión de alcance sobre
  `components/ui/`.
- **`epic: QC-17` y no `QC-16`.** La épica agrupa por **módulo**, no por naturaleza del
  trabajo (`docs/jira.md`): el login es la pantalla de `identity`, aunque lo que cambia sea
  presentación. QC-29 fue a Plataforma porque el tema es armazón transversal; esta no.
- **`depends_on: QC-29`, y es una dependencia real, no de cortesía.** Los dos rediseños
  escriben `app/globals.css`. Si corrieran en paralelo serían dos features de la misma zona
  con intersección de archivos, que es justo lo que bloquea
  `AGENTS.md > Paralelismo`. Además el login se pinta **con** los tokens de QC-29: sin ellos
  no hay nada que aplicar.
- **La decisión que hereda, no que toma:** subir campos y botón a 44 px sin editar
  `components/ui/`. QC-29 ya resolvió el mismo problema para la barra lateral (reglas en
  `globals.css` **fuera** de `@layer`, porque dentro de `@layer base` pierden contra las
  utilidades y el test sale verde en falso). El spec de QC-30 sigue ese precedente o lo
  contradice por escrito.
- **Aviso que el spec debe recoger:** subir el input a 44 px por regla global cambia **todos**
  los inputs de la aplicación, no solo los del login.
- **No se sembró `requirements.md`.** Lo sembrado es material de diseño
  (`design-input-login.md`); la ficha se acota cuando le toque, no ahora.

### QC-29 — tema-claro-oscuro (ficha creada en esta sesión, 2026-09-02)

- **`zone: frontend`.** La description dice «esquema de color», «barra lateral», «control en el
  encabezado»: señales de frontend según la tabla de `AGENTS.md`. No hay migración, ni endpoint,
  ni RLS. **No es `fullstack` aunque toque `app/layout.tsx`**: ese archivo es el armazón de UI,
  no una capa de datos, y partirla en dos features solo crearía dos fichas peleándose por
  `globals.css`.
- **`complexity: medium`.** Varios archivos (`globals.css`, layout raíz, provider, control del
  encabezado, tests) y una dependencia nueva, pero sin lógica condicional profunda ni integración
  externa. No es `low` (no es un archivo) ni `high` (no hay webhooks ni multi-feature).
- **Una sola ficha y no dos** (decisión humana del 2026-09-02): los tokens de color y el
  conmutador tocan los mismos archivos. Partirlos daría intersección de archivos entre dos
  features de la misma zona, que es exactamente lo que la validación de conflicto de
  `AGENTS.md > Paralelismo` bloquea.
- **El origen no es el board, es un diseño.** El humano aprobó el canvas primero y pidió la
  feature después; la ficha se creó en Jira **antes** de tocar el JSON, para no invertir el orden
  que exige `docs/jira.md`. La description del issue la redactó el leader en nombre del humano
  con su sí explícito, como hace `/afinar-feature`.
- **Pregunta que el spec debe dejar abierta, no resolver:** los `--chart-*` siguen siendo cinco
  grises y no hay ninguna gráfica en el repo. Re-colorearlos sin consumidor es inventar (regla 6
  de `CLAUDE.md`).
- **Decisión que el spec sí debe tomar explícitamente:** si las medidas del diseño (item de 44 px,
  panel de 272 px, degradado) entran en esta ficha, porque tocan `components/ui/sidebar.tsx`, que
  es shadcn sin editar.

### QC-24 — modelo-recetas (acotada el 2026-09-02)

- El alcance y las **18 decisiones cerradas** viven en `specs/QC-24-modelo-recetas/requirements.md`
  — esa es la fuente, aquí solo se enlaza. Quedan **2 preguntas abiertas**, las dos caras de cerrar
  después: si hará falta historial de versiones de fórmula, y si `decimal(14,4)` basta para una
  cantidad de receta (se hereda de `cost`, que es dinero).
- **La decisión que cambia el mapa: `recetas` es un módulo hexagonal propio**, no parte de
  `inventario`. La línea de receta conoce al producto por el contrato público de `inventario`,
  nunca por su tabla. Es coherente con que la épica se separase el mismo día.
- Board actualizado **antes** de sembrar: `complexity: medium → high` (ya no son dos tablas, es un
  módulo nuevo con su cableado) y `description` ampliada con las columnas de auditoría, que
  **las crea esta ficha** y no el CRUD — a diferencia de QC-14/QC-20, donde la auditoría se decidió
  cuando el modelo ya estaba mergeado.

### QC-9 — proteccion-de-rutas-privadas (evaluada y acotada el 2026-09-02)

- **F1.0:** `zone: backend` —crea `middleware.ts`, no toca ni una pantalla— y `complexity: high`,
  **no por tamaño sino por el runtime**: el middleware corre en el borde, donde no existe
  `node:crypto`, y la sesión de QC-8 se firma justo con eso. Labels escritas en el board.
- El alcance y las **14 decisiones cerradas** viven en
  `specs/QC-9-proteccion-de-rutas-privadas/requirements.md`. **Sin preguntas abiertas.**
- **La decisión que agranda la ficha: la firma migra a WebCrypto**, para que siga habiendo **una
  sola** implementación del HMAC (R5 de QC-8) y el middleware pueda validar de verdad. Eso
  significa **tocar código de QC-8, que ya está mergeada**. La restricción que lo hace seguro la
  puso el humano: **el formato del token no cambia**, así que las sesiones emitidas siguen
  valiendo y los tests de QC-8 deben seguir verdes byte a byte.
- **Dos encargos que esta ficha arrastra y que el spec no puede olvidar:** ampliar
  `PRODUCTION_DIRS` y `SCAN_ROOTS` a los `.ts` de primer nivel **antes** de escribir
  `middleware.ts` (hoy un `createHmac` en la raíz pasa el gate en verde), y **actualizar
  `docs/architecture.md > Permisos y autenticacion`**, que dice que el middleware «verifica
  existencia de cookie» — lo que esta ficha deja de ser cierto, y es el documento con el que el
  reviewer juzga.
- Board actualizado **antes** de sembrar: `description` reescrita con la migración de la firma, la
  protección por convención, la vuelta a la ruta pedida y el desvío a dashboard por falta de
  permiso.

### Épica nueva: QC-27 — Recetas (2026-09-02, decisión humana)

- Las tres fichas de recetas (**QC-24** modelo, **QC-25** CRUD, **QC-26** pantalla) nacieron
  colgadas de **QC-18 Inventario**. El humano decidió el 2026-09-02 que **recetas es una épica
  aparte**, y se creó **QC-27 — Recetas**, con las tres reasignadas por `parent` en el board y
  `epic` / `epic_name` actualizados en `feature_list.json`.
- **Es agrupación, no dependencia** (`docs/jira.md`): la épica no cambia el orden ni el cupo de
  paralelismo. Lo que sigue mandando es `depends_on`, y QC-24 sigue bloqueada por QC-14 igual que
  antes. La frontera es la misma del módulo hexagonal: Inventario responde «qué hay y cuánto»,
  Recetas responde «cómo se compone». Comparten la entidad producto, y esa costura se cruza por el
  contrato público del módulo, nunca por su tabla (**QC-15**).
- **De paso se corrigió una divergencia:** `feature_list.json` **no tenía QC-23** («Registro de
  sesiones y cierre en todos los dispositivos», épica QC-17, bloqueada por QC-8), creada en el
  board por la sesión que acotó QC-8. Se importó completa. Sin esto, el siguiente F0 la habría
  traído de golpe y nadie sabría de dónde salió.
- **Divergencia que NO se toca**, porque es de otra sesión: **QC-8 está *En curso* en el board y
  `pending` en el disco**. La sesión que la tiene montada en `.worktrees/QC-8-sesion-actual-y-logout`
  es quien debe pasarla a `in_progress`. Anotado aquí para que no se pierda.

### Feature 1 — modelo-usuarios-y-roles

- `zone: backend`. La description es toda persistencia ("persistir", tablas,
  unicidad, borrado de rol). No hay ninguna señal de UI. Sin partición.
- `complexity: medium`. No es una tabla sola: son dos entidades, una relación
  obligatoria 1:N con restricción de borrado, un tipo cerrado para el documento y
  tres restricciones de unicidad (usuario, correo, tipo+número). Toca schema,
  migración y tests.
- `branch: feature/1-modelo-usuarios-y-roles`, worktree montado desde `origin/dev`.
- Paralelismo: primera feature de la zona `backend`, 0 `in_progress`. Sin conflicto
  de archivos que validar.
- Bloqueo de infraestructura **resuelto (2026-08-06)**: el humano añadió `.env` con
  `DATABASE_URL`. Copiado también a `.worktrees/1-modelo-usuarios-y-roles/.env`
  porque los worktrees no lo heredan (`.env*` está en `.gitignore:38`).
- Respuestas del humano que cierran preguntas abiertas del spec: teléfono y fecha de
  nacimiento **obligatorios**; correo y usuario **case-insensitive** en unicidad y
  validación; `created_at` / `updated_at` / `deleted_at` (o sea, **borrado lógico**);
  identificadores de la DB **en inglés**. Spec aprobado el 2026-08-06.


### Feature 8 — layout-privado-con-sidebar

- `zone: frontend`. La description es toda UI ("maquetación", "barra lateral",
  "enlaces de navegación", "ocultar y mostrar"). Confirmada por el humano el
  2026-08-06 junto con 7 y 9 como maquetación sin dependencia de backend.
  `depends_on: null`. Sin partición.
- `complexity: medium`. No es una pantalla: es el armazón compartido (layout de
  route group + sidebar con tres regiones + estado responsive abierto/cerrado +
  la costura de props y del disparador de logout que consume la feature 10).
  Varios archivos y estado condicional.
- `branch: feature/8-layout-privado-con-sidebar`, worktree montado desde `origin/dev`.
- Paralelismo — **cupo OK, conflicto de archivos SÍ**. La zona `frontend` tiene 1
  feature `in_progress` (la 7), o sea que hay cupo para la segunda. Pero la
  validación de conflicto (`AGENTS.md > Paralelismo`) da intersección real con lo
  que la feature 7 está tocando, según `specs/7-pantalla-de-login/tasks.md`:
  `package.json` / `pnpm-lock.yaml` (T1, T2, T3, T3b, T4), `app/globals.css`
  (T2, lo reescribe `shadcn init`), `components.json` y `lib/utils.ts` (T2), y
  `components/ui/button.tsx` (T3). Además la 7 **todavía no ha aterrizado**: en
  `origin/dev` no existen ni shadcn/ui ni Vitest ni `components/ui/`, así que la 8
  no tiene sobre qué construir.
- Decisión: se avanza la **fase 1 (spec)**, que solo escribe en
  `specs/8-layout-privado-con-sidebar/` y no intersecta con nada. La **fase 2
  (implementación) queda bloqueada** hasta que la feature 7 pase a `done` y su
  base (shadcn/ui inicializado, Vitest, `components/ui/`) esté en `dev`. El spec
  debe tratar esa base como precondición heredada, no volver a crearla.
- Costura con la feature 10 (hereda el patrón de la 7): los datos del usuario de
  sesión entran **por props** y el cerrar sesión es un **disparador vacío**. El
  spec debe congelar ese contrato para que la 10 lo sustituya sin tocar UI.
- Respuestas del humano (2026-08-06) que cierran las 10 preguntas abiertas del spec,
  y **spec aprobado** con ellas incorporadas:
  1. Navegación con soporte de **ítem simple y ítem con submenú**; 5 ítems de ejemplo
     quemados (Dashboard, Inventario, Notificaciones + 2 con submenú). Son
     **placeholder**: sus rutas no existen y las sustituye la feature de cada módulo.
  2. El pie muestra **nombre y rol**.
  3. Avatar por **iniciales**.
  4. El pie es un **menú desplegable** (`dropdown-menu` de shadcn), no un botón suelto.
  5. **Los dos mecanismos de colapso**: modo icono en escritorio **y** ocultar/mostrar
     responsive en pantallas angostas.
  6. Marca: «QuimiCloude», versión corta **«QC»** para el modo icono.
  7. `displayName` llega **ya compuesto** por quien provee la sesión. La UI no compone
     nombre y apellidos.
  8. **Sin `<Toaster />`** en la zona privada por ahora.
  9. Route group **`app/(private)/`** (decisión humana; se aparta del `(dashboard)` de
     `docs/architecture.md`, y así queda registrado para el reviewer).
  10. **E2E diferido**: no hay zona privada que visitar todavía. Ver deudas.
- Las dos preguntas que quedaron vivas tras la primera ronda también las cerró el
  humano el 2026-08-06: el estado colapsado de la barra **sí se persiste** entre
  navegaciones (cookie `sidebar_state` del primitivo de shadcn; es **preferencia de
  UI, no sesión**, y por eso no contradice que la 8 no toque sesión ni BD), y el menú
  de usuario **no lleva entrada de perfil**: sólo el cierre de sesión. Con esto el
  spec queda **sin preguntas abiertas**.

### QC-14 — modelo-producto (antes «modelo-inventario»)

- **Acotada con `/afinar-feature` el 2026-09-01.** El alcance, las 17 decisiones cerradas y
  las 4 preguntas que quedan abiertas viven en
  `specs/QC-14-modelo-producto/requirements.md` — esa es la fuente, aquí solo se enlaza.
- El board se actualizó **antes** de sembrar (`docs/jira.md > Cuando el disco descubre que el
  board está desactualizado`): QC-14 cambió `summary` a «Modelo de producto», su
  `description` entera y el label `slug:modelo-producto`. `zone`, `complexity` y `depends_on`
  no cambiaron. Se creó **QC-20 — CRUD de productos** (épica QC-18, `zone:fullstack`,
  bloqueada por QC-14) para lo que esta ficha deja fuera.
- **`feature_list.json` todavía trae la versión vieja** (`name: modelo-inventario`,
  `spec_path: specs/QC-14-modelo-inventario`, y sin QC-20). No lo edita este comando: entra
  en el siguiente **F0** del leader, que reimporta el board. Hasta entonces el `spec_path` de
  la ficha y la carpeta real del spec no coinciden — el gate no se ve afectado porque QC-14
  está en `pending`.
- Lo de abajo es la evaluación original del 2026-08-06, cuando la ficha era
  «modelo-inventario». Se conserva por trazabilidad; donde contradiga a la acotación del
  2026-09-01, **manda el `requirements.md`**.

- **Arranque de fase 1 el 2026-09-01 (esta sesión).** `zone`, `complexity`, `branch` y las
  labels de Jira ya estaban puestas; `depends_on: QC-15` está `done`, así que la dependencia
  no bloquea. `feature_list.json` ya trae la versión nueva (`modelo-producto`), o sea que la
  desincronización que anotaba el punto de arriba **ya se resolvió** en el F0 de esta sesión.
- **Paralelismo — cupo NO, conflicto de archivos NO.** La zona `backend` tiene **2**
  `in_progress` (QC-6 y QC-7), o sea el cupo lleno: por la condición (a) de `AGENTS.md > F1.0`
  la selección automática habría salteado QC-14. Se avanza igualmente la **fase 1** por
  decisión humana explícita («comienza con qc-14»), y eso **no viola la regla 1 de
  `CLAUDE.md`**: escribir el spec deja la ficha en `spec_ready`, no en `in_progress`, así que
  no consume slot. Mismo precedente que la feature 8. La **fase 2 queda bloqueada** hasta que
  QC-6 o QC-7 pase a `done`.
- Conflicto de archivos con las dos `in_progress`: **ninguno**. QC-6 y QC-7 viven en
  `lib/modules/identity/**`, `lib/composition/` y el modelo `User`; QC-14 crea el módulo
  `inventario` y dos tablas nuevas. El único archivo compartido es `db/schema.prisma` (las
  tres añaden modelos o columnas, aditivo) y la carpeta de migraciones — el mismo riesgo de
  `_prisma_migrations` que ya está anotado para QC-6, y es razón de más para que la fase 2
  espere en vez de ser una tercera cadena de migración en vuelo.
- Worktree montado desde `origin/dev` y luego **`git merge dev`**, porque la siembra de
  `/afinar-feature` (`specs/QC-14-modelo-producto/requirements.md`) vive en el commit
  `5708bc3`, que está **solo en `dev` local y sin pushear**. Sin ese merge el `spec_author`
  no habría visto ni una de las 17 decisiones cerradas. `.env` copiado a mano (deuda de
  `wt.sh new`). **`pnpm install` / `prisma generate` / `next typegen` no se corrieron**: la
  fase 1 no ejecuta nada. Van al arrancar la fase 2.

- **Spec escrito el 2026-09-01** (24 requisitos R1–R24, todos mapeados a un test en
  `tasks.md > Trazabilidad`). Tres archivos de test nuevos —
  `tests/unit/inventario/schema/inventario-schema.test.ts`,
  `tests/unit/inventario/schema/inventario-migration.test.ts` y
  `tests/integration/inventario/inventario-constraints.int.test.ts` — más R20, R21 y R24, que los
  cierran guardias **ya existentes** y cubren la migración nueva sin tocarlas. Sin dependencias
  nuevas y sin E2E. Ficha en `spec_ready`, tarjeta en *En revisión*.
- **Contradicción entre decisiones cerradas, detectada por el `spec_author` y NO resuelta por él
  (bien hecho: es del humano).** La decisión 11 pide borrado lógico con `deleted_at` en las dos
  tablas «heredado de QC-4»; la 4 exige que una presentación con productos asignados no se pueda
  borrar. Si `presentations` lleva `deleted_at`, «borrar» pasa a ser un `UPDATE` y **ninguna FK
  puede bloquear un `UPDATE`**: la garantía de la 4 se evapora en silencio. QC-4 ya vivió este
  choque y lo resolvió dejando su catálogo (`roles`) **sin** `deleted_at` — está documentado en
  `db/schema.prisma` y en `specs/4-modelo-usuarios-y-roles/design.md > 2.2`. El diseño hereda esa
  salida y la deja como pregunta abierta. Los requisitos están redactados para no depender de la
  respuesta: R14 exige el rechazo del borrado sea cual sea el mecanismo, así que ninguna de las
  dos respuestas obliga a renumerar.
- **Cinco preguntas abiertas nuevas** que deja el diseño, todas en `design.md > 9` y ninguna
  bloqueante del modelo: si `min_purchase` es `NOT NULL DEFAULT 0` o anulable con defecto (la
  decisión 8 admite las dos lecturas); si `presentations` lleva `deleted_at` (la contradicción de
  arriba); si el nombre de una presentación es único (nadie lo decidió; el diseño **no** crea el
  índice, y añadirlo después exigirá limpiar duplicados); si `delivery_time` admite negativos (la
  decisión 7 enumera cuatro columnas y no lo incluye, así que se queda sin `CHECK` y un plazo
  negativo entraría); y si un `name` vacío es un nombre (sin `CHECK` de longitud, queda como
  validación de borde en QC-20, igual que hizo QC-4).

- **SPEC APROBADO por el humano el 2026-09-01** («sigue con 14», reafirmado tras plantearle
  las preguntas). Los tres archivos quedan congelados en el commit `c2a4f43`. La tarjeta **NO**
  se mueve a *En curso* todavía: eso es F2.0 y F2.0 está bloqueado (ver abajo), así que moverla
  dejaría board y disco divergentes por una fase que no ha empezado.
- **Las cinco preguntas abiertas se cierran adoptando la posición que el `design.md` ya tomó**,
  por decisión del leader ante la reafirmación del humano. Ninguna es invención: las cinco
  siguen el precedente documentado de QC-4, así que el `implementer` arranca sin ambigüedad y
  **no hay que editar el spec** — el diseño ya las implementa.
  1. **`presentations` NO lleva `deleted_at`.** Solo `created_at` / `updated_at`. Resuelve la
     contradicción 4-vs-11 a favor de la 4, que es la que expresa una garantía de la base: con
     `deleted_at`, «borrar» sería un `UPDATE` y la FK `ON DELETE RESTRICT` no podría impedir
     nada. Es literalmente lo que QC-4 decidió para su catálogo `roles`
     (`specs/4-modelo-usuarios-y-roles/design.md > 2.2`). `products` sí lleva las tres marcas.
     **La decisión 11 queda matizada, no derogada**: el borrado lógico aplica a las tablas de
     operación, no a los catálogos.
  2. **`min_purchase` es `INTEGER NOT NULL DEFAULT 0`.** «No indicar» vale 0, y nunca hay
     `NULL`: nadie pidió distinguir «sin dato» de «cero», y esa distinción se paga en cada
     consulta futura de QC-20 en adelante.
  3. **El nombre de una presentación NO es único.** Se mantiene la ausencia de índice que toma
     el diseño, por coherencia con la decisión 6 (el nombre del producto tampoco lo es) y
     porque nadie lo pidió. **Anotado como el más caro de revertir de los cinco**: añadir el
     índice después exige limpiar duplicados primero. Si el catálogo se llena a mano, revisar
     en QC-20.
  4. **`delivery_time` se queda SIN `CHECK`.** La decisión cerrada 7 enumera cuatro columnas y
     no lo incluye; añadirle la restricción sería ampliar una decisión del humano por cuenta
     propia. **Consecuencia asumida y anotada: hoy un plazo de entrega negativo entra en la
     base.** Es una línea de migración cuando alguien lo quiera cerrar.
  5. **Sin `CHECK` de nombre no vacío.** `''` es un nombre válido en la base; la validación de
     borde vive en la capa de aplicación, que es QC-20. Mismo criterio que QC-4.
- **F2.0 BLOQUEADO, y no por criterio sino por el gate.** `scripts/validate-features.mjs` cuenta
  las `in_progress` por zona y falla a partir de tres; `backend` ya tiene QC-6 y QC-7. Pasar
  QC-14 a `in_progress` pondría `./init.sh` en rojo, o sea que la regla 1 de `CLAUDE.md` aquí es
  mecánica, no interpretable. **Lo que libera el slot** es que QC-7 cierre, o que el humano
  devuelva QC-6 a `spec_ready`: QC-6 está parada en F2.1 desde que se aprobó su spec y **su
  implementer nunca se lanzó**, así que hoy ocupa un slot por contabilidad y no por trabajo en
  vuelo. Esa decisión es del humano y no la toma el leader.
- Worktree **preparado para fase 2 por adelantado** (`pnpm install`, `prisma generate`,
  `next typegen`), que es la deuda conocida de `wt.sh new` y la que hizo fallar el typecheck de
  QC-7 con `Cannot find name 'LayoutProps'`. Así el arranque de F2.1 no gasta la primera tanda
  en montar el entorno.

### Feature 11 — modelo-inventario

- Alta de backlog del 2026-08-06 a pedido del humano, y **alcance acotado por él en la
  misma sesión**: solo modelo, presentación como tabla propia y obligatoria, y
  `alertQuantity` solo se almacena (sin acciones).
- `zone: backend`. Tras el recorte no queda ninguna señal de UI: es "persistir",
  tablas y una relación. El ítem «Inventario» del sidebar de la feature 8 sigue siendo
  placeholder — **esta feature no lo resuelve**. Sin partición.
- `complexity: medium`. Misma forma que la feature 1 aunque más chica: dos entidades,
  relación 1:N obligatoria con restricción de borrado, schema + migración + tests.
  Encaja en "2-3 capas, múltiples archivos"; `low` es una tabla sola y aquí son dos.
- `branch: feature/11-modelo-inventario`. **Worktree todavía no montado**: la feature
  sigue en `pending` y no se ha lanzado la fase 1.
- Paralelismo: la zona `backend` tiene 1 `in_progress` (la 2), o sea cupo para una
  segunda. Conflicto de archivos **sin validar todavía** — no existe
  `specs/11-modelo-inventario/tasks.md`. Ojo con el precedente de la 7: `schema.prisma`
  y la carpeta de migraciones son infraestructura compartida y la feature 2 no las toca,
  pero la 3 sí lo hará.
- `depends_on: null`. No depende de usuarios ni de sesión: es un modelo independiente.
  No se ordena detrás de las 3–6 por dependencia, solo por prioridad del humano.
- Encargos para el spec, derivados del recorte: la presentación es **tabla**, no enum de
  Prisma ni `text` — el motivo es que crezca sin migración. `alertQuantity` es una
  columna y nada más: el spec **no** debe añadir campo calculado de "bajo de existencias",
  ni trigger, ni notificación; si aparece, es alcance inventado.
- Preguntas abiertas que hereda el spec (**no las rellenes con supuestos**): tipo y
  precisión de `quantity` y `alertQuantity` (¿entero o decimal? ¿se admite negativo?),
  obligatoriedad de cada campo, unicidad de `description` y del nombre de la
  presentación, y si aplica el borrado lógico + `created_at`/`updated_at`/`deleted_at`
  que el humano fijó en la feature 1. Los identificadores de la DB van **en inglés**,
  por la misma decisión.

### Feature 15 — arquitectura-hexagonal-y-modulos

- Alta de backlog del 2026-09-01 a pedido del humano: reestructurar a arquitectura
  hexagonal y desacoplar los modulos. Nacio en el board (`QC-15`) como manda
  `docs/jira.md`; `feature_list.json` se actualizo desde ahi.
- **Alcance decidido por el humano en la misma sesion: ahora y bloqueante.** Se hace con
  poco codigo escrito (schema de identidad, stub de login, pantalla de login) y todo el
  backlog posterior nace ya sobre la estructura nueva. Las dos alternativas que se
  ofrecieron —migracion incremental conviviendo dos estructuras, o piloto solo en
  `identity`— quedaron descartadas.
- `zone: fullstack`. Toca `lib/` entero (dominio, puertos, adaptadores, composicion) y
  tambien como las rutas de `app/` consumen esa capa. **Sin partir todavia**: la particion
  de `AGENTS.md > Particion de fullstack` se decide en F1.0, y aqui hay un argumento fuerte
  para **no** partirla — media reestructuracion mergeada deja el repo con dos estructuras
  conviviendo, que es justo lo que esta feature existe para evitar. Si en F1.0 se parte,
  que sea por capas secuenciales (primero el nucleo y su guardia, luego el reencable de
  `app/`), no por frontend/backend en paralelo.
- `complexity: high`. Es multi-feature por definicion: reorganiza el codigo de las features
  4, 5 y 10, reescribe `docs/architecture.md` (que es lo que el reviewer usa para juzgar) y
  deja una guardia de dependencias nueva.
- `depends_on: [5, 11]` (issue links "is blocked by" en el board). No arranca hasta cerrar
  las dos features en vuelo: mover sus archivos a media implementacion garantiza conflicto.
- **Bloquea a 6, 7, 8, 9, 12, 13 y 14**, con sus links creados en Jira. Ninguna de esas
  arranca antes que la 15; si alguna se adelanta, se escribe sobre la estructura vieja y
  hay que migrarla despues.
- Encargos para el spec, que salen de lo ya decidido en `docs/architecture.md` y no deben
  reinventarse: el dominio no importa Prisma ni Next; el cableado puerto→adaptador vive en
  **un solo** punto de composicion; entre modulos solo se consume el contrato publicado,
  nunca repositorio, modelo de Prisma ni tabla ajena; y la migracion de lo existente es
  **sin cambio de comportamiento** — los tests que hoy pasan siguen pasando, y eso es lo que
  demuestra que la reestructuracion no rompio nada.
- **Spec escrito el 2026-09-01** (21 requisitos R1–R21, todos con test en `tasks.md >
  Trazabilidad`). Las cuatro preguntas que heredaba quedan **cerradas con su porqué**:
  1. **Raíz en `lib/modules/<modulo>/`, no un `src/` nuevo.** Un `src/` obligaría a tocar
     `tsconfig.json`, `components.json`, `vitest.config.mts`, `eslint.config.mjs` y —el
     argumento que decide— `SCANNED_DIRS` de `guard-password-never-plaintext`, que se
     quedaría **verde barriendo nada**. A cambio, `lib/` queda acotada por regla a
     `modules/`, `shared/`, `composition/` y `utils.ts`.
  2. **Un solo `db/schema.prisma`.** El multiarchivo *sí* está soportado (verificado sobre
     la instalación real, prisma 6.19.3), y aun así se descarta: no parte la propiedad,
     rompe los tests y guardias que leen el esquema por ruta fija, y las FK cruzan módulos
     igual. La frontera llega a persistencia por convención `/// @module <modulo>` más la
     regla «solo el dueño consulta sus modelos».
  3. **La guardia es un test propio en `tests/guards/`, sin dependencia nueva.**
     `import/no-restricted-paths` sólo expresa 4 de las 15 reglas, y meter
     `eslint-plugin-boundaries` abriría la puerta de dependencias con los cuatro checks de
     salud **no verificables sin red** (regla 6).
  4. **`components/` y `hooks/` quedan fuera.** Sus rutas las fija `components.json` de
     shadcn, la UI compartida no pertenece a un módulo, y la convención de componentes de
     ruta con barrel queda intacta.
- **Preguntas abiertas que deja el spec** (no bloquean la aprobación): idioma de los nombres
  de módulo (`identity` frente a `inventario` — hoy están mezclados); si un módulo puede leer
  modelos ajenos dentro de un `include` de Prisma o debe pedirlos al contrato (se eligió lo
  estricto, a revisar en QC-14); y dónde vivirán los componentes propios de un módulo cuando
  aparezca el primer caso.
- **Fuera de alcance por ser cambio de comportamiento, y bien excluido:** hoy
  `verifyCredentials` devuelve siempre `{ ok: false }` y `getSessionUser` devuelve relleno
  fijo. Se migran **tal cual**; hacerlos funcionar es QC-7 y QC-8.
- La guardia ejecutable es parte del entregable, no un extra: sin ella la regla de
  direccion de dependencias vuelve a ser una linea en un `.md` que nadie hace cumplir.
  Tiene precedente en el repo (`tests/guards/`).
- Preguntas abiertas que hereda el spec (**no las rellenes con supuestos**): donde vive la
  raiz de los modulos (`lib/modules/` frente a un `src/` nuevo, que cambia `tsconfig` y
  todos los alias); si el schema de Prisma se parte por modulo o sigue siendo uno solo
  (`db/schema.prisma` es infraestructura compartida); que herramienta hace cumplir la
  guardia (regla de ESLint tipo `import/no-restricted-paths` frente a un test propio como
  los de `tests/guards/`); y si `components/` y `hooks/` entran en la modularizacion o se
  quedan como estan.

### QC-6 — seed-roles-y-usuario-inicial (2026-09-01)

- `zone: backend`. La description es persistencia pura: "la base arranque con", roles,
  usuario ya creado, "correrse mas de una vez sin duplicar". Cero senal de UI. **Sin
  particion**: no hay nada que un `frontend_dev` pueda tocar aqui.
- `complexity: medium`, no `low`. Parece un script suelto y no lo es, por tres razones que
  ya estan en el codigo:
  1. El usuario inicial necesita **diez columnas `NOT NULL`** (`first_names`, `last_names`,
     `birth_date`, `email`, `phone`, `document_type_code`, `document_number`, `username`,
     `password_hash`, `role_id`) mas la FK a `document_types`, cuyo unico valor hoy es `CC`.
  2. La contrasena debe entrar por el puerto `PasswordHasher`
     (`lib/modules/identity/ports/password-hasher.ts`), no llamando a bcrypt directo: la
     guardia `guard-password-never-plaintext` y la direccion de dependencias de QC-15 lo
     exigen.
  3. **La idempotencia no es un `upsert`.** Las tres unicidades de `users` son indices
     **funcionales (`lower(...)`) y parciales (`WHERE deleted_at IS NULL`)** escritos a mano
     en la migracion; Prisma no los modela, asi que `prisma.user.upsert` no tiene un
     `where` unico al que agarrarse. Roles si es un `upsert` por `name`. Ver el comentario
     del modelo `User` en `db/schema.prisma`.
- `branch: feature/QC-6-seed-roles-y-usuario-inicial`, worktree montado desde `origin/dev`.
- Paralelismo: zona `backend` con **0 features `in_progress`** registradas. Sin conflicto de
  archivos que validar. Salvedad: existe un worktree de QC-7 que este leader no monto (ver
  deudas); si QC-7 esta viva, seria la segunda de la zona y habria que comprobar
  interseccion — el seed toca `db/seed.ts` y el catalogo de roles, QC-7 toca
  `verifyCredentials` y el adaptador de sesion, asi que a priori no se cruzan.
- **Acotada con `/afinar-feature` el 2026-09-01.** Las decisiones cerradas y lo que queda
  abierto viven en `specs/QC-6-seed-roles-y-usuario-inicial/requirements.md`; no se copian
  aqui. La acotacion **cambio el alcance** y por eso se reescribio la `description` en el
  issue QC-6 antes de sembrar (paso 5): la ficha ahora incluye una **migracion aditiva** para
  la marca de "debe cambiar la contrasena" y el arranque automatico del seed tras cada
  despliegue. `zone`, `complexity` y `depends_on` no cambiaron.
- Preguntas que quedaron abiertas antes de la acotacion, ya respondidas ahi (se dejan por
  trazabilidad): *cuales* son "los roles base" y con que descripcion; que datos concretos lleva el
  usuario inicial y de donde salen su usuario y contrasena (¿variables de entorno? ¿valores
  fijos? ¿obliga a cambiarla al primer login?); que rol se le asigna; si el seed tambien
  siembra `document_types` (`CC`) o eso ya lo hizo la migracion de QC-4; y que significa
  exactamente "sin romper nada" en la segunda corrida — si un rol o el usuario fueron
  editados a mano despues del primer seed, ¿se respetan o se reescriben?


### QC-19 — politica-de-contrasenas (2026-09-01, ficha creada en esta sesión)

- Nació al acotar QC-6: la política de contraseñas salió de allí como pregunta abierta y se
  creó como **issue propio** (QC-19, épica `QC-17`), porque `/afinar-feature` solo acepta
  fichas que ya existen en el board.
- `zone: backend`, `complexity: medium`. **No se parte**: la ayuda visual mientras se escribe
  se separó a su propia ficha (**QC-21**), así que aquí no queda nada de UI.
- Acotada con `/afinar-feature` el mismo día. Decisiones cerradas en
  `specs/QC-19-politica-de-contrasenas/requirements.md`. La acotación reescribió su
  `description` en el board antes de sembrar.
- **Trae una dependencia nueva sin aprobar**: la lista de contraseñas filtradas viene de una
  librería, y eso es la regla 7 de `CLAUDE.md` — cuatro checks de salud, fila en
  `docs/dependencias.md` y aprobación humana **antes** de instalar. Si ninguna librería
  convence, la decisión se reabre.
- `depends_on: QC-6, QC-7`. Bloquea a QC-21.

### QC-21 — ayuda-visual-de-contrasena (2026-09-01, ficha creada en esta sesión)

- Salió de la acotación de QC-19: mostrar los requisitos marcándose a medida que se escribe
  la contraseña. Épica `QC-17`, bloqueada por QC-19. `zone`/`complexity` **sin evaluar**.

### QC-20 — crud-de-productos (2026-09-01, ficha del humano, importada en F0)

- Apareció en el board durante esta sesión; no la creó el leader. Épica `QC-18 Inventario`,
  `zone: fullstack` (label puesta en el board), bloqueada por QC-14. `complexity` sin evaluar.
- **Al ser `fullstack` habrá que partirla** en backend + frontend cuando le toque F1.0
  (`AGENTS.md > Partición de fullstack`).
- **Acotada con `/afinar-feature` el 2026-09-02.** El alcance y las 18 decisiones cerradas
  viven en `specs/QC-20-crud-de-productos/requirements.md` — esa es la fuente, aquí solo se
  enlaza. Sin preguntas abiertas. Se partió: QC-20 se queda con `zone: backend` y
  `complexity: high`; la pantalla nació como **QC-22 — Pantalla de productos**
  (`zone: frontend`, épica QC-18, bloqueada por QC-20, `pending` en Backlog y **sin sembrar**).
  Se añadió **QC-8 como bloqueante** de QC-20: el service necesita saber quién está en sesión.
  Board actualizado **antes** de sembrar (labels, `description`, los dos links y la ficha
  nueva) y `feature_list.json` reflejado en la misma corrida.

### QC-14 — el board la reescribió (2026-09-01)

- Dejó de ser `modelo-inventario` y ahora es **`modelo-producto`**: nuevo summary, nueva
  `slug:modelo-producto` y una `description` mucho más larga y concreta. En disco se
  actualizaron `name`, `description`, `branch` y `spec_path`; no había spec que renombrar.
- **Su nueva `description` cierra de hecho la pregunta abierta 1 del dominio** («unidades de
  medida»): dice que la unidad es texto libre opcional y que **no hay conversión entre
  unidades**. Queda pendiente trasladarlo a `docs/architecture.md > Preguntas abiertas del
  dominio`, pero es de la acotación de QC-14, no de esta sesión.


### QC-7 — login-usuario-y-contrasena (2026-09-01)

> Esta entrada se escribió, **otra sesión de leader la sobrescribió**, y se rehízo. Ver
> `
### QC-24 / QC-25 / QC-26 — recetas (fichas creadas, no acotadas)

- Creadas en el board el 2026-09-02 desde `/afinar-feature`, épica **QC-18 Inventario**,
  todas `pending` en *Backlog*. **No se sembró ningún `requirements.md`**: son fichas nuevas,
  y cada una se acota con su propia corrida del comando cuando le toque.
- **QC-24 modelo-recetas** — `zone: backend`, `complexity: medium`. Bloqueada por QC-14.
  Espejo de QC-14: solo esquema y migración.
- **QC-25 crud-de-recetas** — `zone: backend`, `complexity: high`. Bloqueada por QC-24, QC-20
  y QC-8. Es `high` porque además del CRUD trae la subida de imagen a Supabase Storage.
- **QC-26 pantalla-de-recetas** — `zone: frontend`, sin `complexity` (la asigna F1.0, igual
  que QC-22). Bloqueada por QC-25.
- **Dependencia nueva sin aprobar, anotada aquí para que no aparezca a mitad del spec:**
  QC-25 necesita un cliente de Supabase (`@supabase/supabase-js` o equivalente) que **no está
  en `package.json` ni en `docs/dependencias.md`**. Entra por la regla 7 de `CLAUDE.md`:
  cuatro checks de salud, fila en `docs/dependencias.md` y aprobación humana antes de instalar.
- Decisiones que el humano ya cerró al pedir las fichas, y que su acotación hereda sin
  reabrir: cantidad de línea **decimal exacto** (nunca `float`), unidad de línea **texto libre
  obligatorio y anotativo** (coherente con la pregunta 1 del dominio, cerrada en QC-14), **un
  producto no se repite** dentro de una receta, **nombre de receta único** normalizado sin
  acentos ni mayúsculas (precedente de las presentaciones en QC-20), borrar un producto usado
  **sí se permite** y la receta conserva la línea, **solo Administrador** validado en el
  service (precedente de QC-20), `image_url` **opcional** con subida a Storage, y `steps`
  como **lista ordenada de textos** en una columna `jsonb`.
- Quedan abiertas, sin rellenar con supuestos: si una receta produce algo (rendimiento /
  producto resultante); qué pasa con el archivo en Storage al borrar la receta; y los límites
  de la imagen (tamaño, tipos, bucket público o privado). Las tres las decide la acotación de
  QC-25, salvo la primera, que es de negocio y no tiene ficha.


### La base compartida tiene una fila residual que rompe el gate de TODAS las sesiones (2026-09-03)

`tests/integration/identity/identity-seed.int.test.ts` sale rojo con **8 casos** en cualquier
worktree, `dev` incluido — verificado, no deducido. **No es un defecto de código**: es estado sucio
de la base compartida.

- **La fila:** un producto `FeldesQuack` en `products`, creado el 2026-09-03 a las 19:36 UTC, con
  `created_by`/`updated_by` apuntando al admin del seed. Encaja con una corrida de **QC-22** sin
  limpiar.
- **El mecanismo:** `resetIdentityToEmptyState` hace `DELETE FROM users` dentro de una transacción
  y la FK `products_created_by_fkey` lo bloquea con `23503`.
- **Decisión del humano (2026-09-03): no se borra la fila, no se arregla el helper y NO se mete al
  baseline.** El baseline es para deuda ajena de `dev`; esto es transitorio, y enmascararlo ahí
  ocultaría para siempre un test que volverá a pasar solo. Se declaró en el PR #26.
- **La causa de fondo, que sigue viva:** `resetIdentityToEmptyState` borra usuarios sin limpiar
  antes las tablas que los referencian, así que **cualquier feature futura con una FK a `users`
  puede volver a provocarlo** — y QC-33 acaba de añadir dos. Candidato a ficha propia.

### El gate rápido no ve los tests de alcance de otros módulos (2026-09-03, confirmado por QC-33)

El implementer de QC-33 reportó **1** rojo; el gate completo destapó **6**, y **5 eran suyos**: las
afirmaciones de QC-4, QC-14 y QC-24 de que en todo el esquema no existe ningún enum, que los dos
enums de QC-33 dejaron viejas. `vitest related` no los relaciona porque no los une el árbol de
archivos sino una afirmación sobre el repositorio entero. **Es el mismo agujero que ya costó caro
en QC-20**, y es la razón por la que el gate completo antes del PR no es ceremonia.

### El worktree principal quedó fuera de `dev` (2026-09-03)

`AGENTS.md > Worktrees` dice que el worktree principal se queda en `dev` y **nadie hace `git
checkout` en él**. Hoy alguien lo dejó en **`fix-ux`**, y el commit de cierre de QC-33 aterrizó allí
en vez de en `dev`: `git push origin dev` empujaba la rama `dev` local, desactualizada, y salía
rechazado. Se resolvió aplicando el cierre sobre `dev` desde un worktree temporal, **sin tocar
`fix-ux`**. Si esa rama tiene trabajo vivo, merece su propio worktree.
## Conflictos pendientes > DOS SESIONES DE LEADER`.

- `zone: backend`. La description es toda servidor: verificar credenciales, responder sin
  revelar cuál falló, emitir cookie. La pantalla ya existe (QC-10, `done`). Sin partición.
- `complexity: medium` → **`high`** tras las decisiones humanas (label actualizada en el
  issue). Requisitos: 21 → **31**.
- Worktree desde `origin/dev`, con `.env`, `pnpm install`, `prisma generate` y **`next
  typegen`**. Sin ese último, `pnpm typecheck` falla con `Cannot find name 'LayoutProps'`.
  Es la deuda de `wt.sh new`, que ya tropieza en su tercera feature.

**Decisiones humanas del 2026-09-01** (respuestas a las preguntas abiertas del spec):

1. **Sesión de 8 h, sin «recordarme».**
2. **5 intentos fallidos bloquean la cuenta, con bloqueo temporal creciente** (1/5/15/60 min
   con tope). El bloqueo permanente se descartó **porque no hay pantalla de administración**
   en el repo ni en el backlog: dejaría al usuario fuera hasta tocar la base a mano. El riesgo
   de abuso —cualquiera deja fuera a otro con 5 fallos— **se asume explícitamente**: ERP de un
   solo tenant, usuarios conocidos, sin registro público. Se ofreció límite por IP y **se
   descartó**: más trabajo del pedido y falsificable en Vercel si no se configura bien.
3. **Playwright aprobado.** Los cuatro checks se corrieron contra el registro real, no de
   memoria: v1.62.1, no deprecada, publicada el 2026-09-01, Apache-2.0, 58.4M descargas/semana.
4. **El bloqueo se queda DENTRO de QC-7**, no sale a ficha aparte: el contador se lee y escribe
   dentro de `verifyCredentials` —el mismo camino de código—, la respuesta uniforme en
   contenido y en tiempo hay que diseñarla una sola vez para los tres caminos, y partirlo
   dejaría un login mergeado **sin ningún freno** mientras QC-8 y QC-9 construyen encima.
5. **QC-7 entra primero en fase 2, antes que QC-6.** Resuelve el conflicto entre las dos
   sesiones. Razón de fondo: QC-7 añade tres columnas a `User`, que es justo lo que el seed
   tiene que rellenar; al revés, QC-6 habría que rehacerlo.

**Aprendizaje del arnés, verificado:** `guard-dependencias-aprobadas` es **bidireccional**.
Añadir la fila de un paquete sin instalarlo da rojo igual que instalarlo sin fila. Se intentó
registrar Playwright por adelantado, salió rojo y se revirtió: la fila y la instalación van en
la misma task o no van.

**Columnas nuevas en `User`:** `failed_login_attempts` (`Int @default(0)`), `lock_level`
(`Int @default(0)`) y `locked_until` (`DateTime?`), con migración reversible y el
`/// @module identity` intacto.

**Sigue abierto y no bloquea**: auditoría de accesos; si `next/headers` puede vivir en
`adapters/driven/**` —hay que anotar esa fila en `docs/architecture.md`—; y la rotación del
`SESSION_SECRET`, que hoy es uno solo y rotarlo corta todas las sesiones.

**Riesgo que hereda el implementer:** `tests/unit/identity/login-action.test.ts` afirma hoy
literalmente «mientras no hay verificación real». Cuando la haya, ese test miente. Acotado en
la task T6b, no suelto.
## Conflictos pendientes

### QUIÉN LLEVA QUÉ, AHORA MISMO (2026-09-02) — leer ANTES de tocar un worktree ajeno

> **~~QC-20 la lleva una sesión VIVA~~ → CERRADA el 2026-09-02 (PR #19).** Se conserva el aviso
> porque su lección sigue vigente. Lo que decía: Rama `feature/QC-20-crud-de-productos`, worktree
> `.worktrees/QC-20-crud-de-productos`, base propia `QuimiCloude_QC20`. T1–T11 y T15 hechas;
> **T12 en curso**. F2.3 ya hecho (merge de `origin/dev` con QC-24, tres conflictos resueltos).
> **No escribas en esa rama ni en ese worktree.**
>
> **Un worktree limpio y sin commits recientes NO significa libre.** Hoy `labs-4b` estuvo a
> punto de arrancar T12 en paralelo porque el último commit era de hacía 72 minutos: el agente
> estaba parado esperando instrucciones del leader, no abandonado. Preguntar antes de entrar
> costó un mensaje; entrar a ciegas habría puesto dos implementers en la misma rama.
>
> **Esta sección es el sitio donde se anota qué ficha lleva cada sesión.** Existe desde el
> principio y hasta hoy nadie la había usado para esto — por eso la coordinación dependía de
> que hubiera alguien escuchando en el canal directo. Si tomas una ficha, anótala aquí; si la
> sueltas, bórrala. Acordado entre las sesiones de QC-20 y QC-24, y va a `/afinar-regla` como
> regla del arnés.


### Quién lleva qué ahora mismo (2026-09-02) — **anótalo aquí antes de entrar en una rama ajena**

Esta sección existía y **nadie la estaba usando**: hoy cuatro sesiones han trabajado en paralelo
coordinándose por mensajes directos, que funciona solo mientras las dos partes estén vivas. El
incidente que lo demuestra: `labs-4b` anunció que iba a continuar **QC-20 desde T12** porque el
worktree estaba limpio y el último commit era de hacía 72 minutos — y QC-20 **la lleva `labs-60`**,
que estaba a media revisión con trabajo posiblemente sin commitear. Se evitó porque `labs-4b`
preguntó antes y porque había alguien despierto para contestar. **Eso es suerte, no proceso.**

| Ficha | Sesión | Estado | Aviso para quien pase por aquí |
|---|---|---|---|
| **QC-9** | esta sesión (`labs-96`) | `spec_ready`, spec en revisión por el `spec_author` tras meter el rol en el token | Toca `session-cookie.ts` **de QC-8, ya mergeada**, y ampliará las dos guardias a los `.ts` de primer nivel. No entres sin avisar |
| **QC-20** | `labs-60` | `spec_ready`, T1–T11 commiteadas, en fase 2 | **T12 son las Server Actions y tocan `lib/composition/index.ts`** — el archivo más disputado del repo hoy |
| **QC-21** | `labs-6d` | en curso | Su spec **no está commiteado en `dev`**: deja rojo el gate de quien corra `./init.sh` desde su propio worktree |
| **QC-29** | `labs-65` | reviewer OK, pendiente de gate y PR | — |

**Regla de convivencia que hoy nos habría ahorrado tres sustos:** antes de entrar en una rama
ajena, de acotar un test de alcance de otra feature, o de escribir dentro de un módulo ajeno, se
avisa. Si no hay a quién avisar, **se anota aquí**. Va a `/afinar-regla` como candidata 3.

### ~~El gate completo está ROJO en `dev` por fixtures E2E de QC-7 sin limpiar~~ → **RESUELTO** (2026-09-01)

> **Cerrado el mismo día.** Al ir a limpiar los fixtures, la base compartida ya estaba sin
> ellos: **0 usuarios y 0 roles**. No la limpió esta sesión. Se comprobó que fue un borrado
> **acotado a las filas**, no un reset: la migración `20260901220609_user_login_lockout` de
> QC-7 sigue aplicada y `document_types` conserva su `CC`, así que **el trabajo de QC-7 está
> intacto**. Verificado: `tests/integration/identity` pasa **23/23** y `./init.sh` **completo**
> sale verde en `dev` (**220/220**, sin rojos nuevos).
>
> **Los dos defectos de fondo NO están resueltos y volverán**, así que lo de abajo se conserva:
> el E2E de QC-7 sigue sin limpiar lo que siembra (cada corrida vuelve a ensuciar la base), y
> los tests de integración de QC-4 siguen afirmando que la tabla está vacía — lo que **QC-6
> romperá por definición**, porque es un seed cuyo trabajo es dejar filas.
>
> La salida estructural ya tiene precedente en el repo: **una base por worktree**, que es lo
> que se hizo con `QuimiCloude_QC14` y lo que destrabó QC-14 en dos minutos.

### El gate completo está ROJO en `dev` por fixtures E2E de QC-7 sin limpiar (2026-09-01, histórico)

Descubierto al correr `./init.sh` completo desde la sesión de QC-14. **9 tests en rojo, todos
en `tests/integration/identity/identity-constraints.int.test.ts`**, y ninguno es de QC-14: esta
feature no ha tocado una sola línea de código.

**Causa raíz, verificada contra la base real:** la base de `dev` tiene **4 usuarios y 4 roles
con prefijo `qc7_e2e_`**, creados el 2026-09-02T00:19Z. Son fixtures del E2E de Playwright que
introdujo QC-7 y que **no se limpian al terminar**. Los tests de integración de QC-4 afirman
`expect(await tx.user.count()).toBe(0)` dentro de una transacción que luego revierten — con 4
filas ajenas ya sembradas, la aserción cae. `baseline-rojos.json` está **vacío a propósito**,
así que cualquier archivo rojo es bloqueante por diseño.

**No se borró nada.** Las filas son estado en vuelo de **otra sesión de leader** que está
implementando QC-7 ahora mismo; borrarlas a media corrida podría romperle el run. La limpieza
la decide el humano. Es un `DELETE` sobre las filas con prefijo `qc7_e2e_` (primero usuarios,
luego roles, por la FK).

**Pero la causa raíz no es la suciedad: son dos defectos de diseño que se cruzan.**

1. **El E2E de QC-7 no limpia lo que siembra.** Cada corrida deja cuatro usuarios y cuatro
   roles más. Es deuda de QC-7 y debe cerrarse **dentro de QC-7**, antes de su PR — si no, su
   propio `./init.sh` completo de F2.4 saldrá rojo por su propia mano.
2. **Los tests de integración de QC-4 asumen que la tabla está vacía.** Esa suposición es
   frágil y va a volver a romperse: **QC-6 es literalmente un seed cuyo trabajo es dejar filas**
   en `users` y `roles`. En cuanto QC-6 corra, estos mismos 9 tests caen otra vez. Hay que
   cambiar la aserción de «la tabla está vacía» a «no existe la fila que acabo de intentar
   insertar», que es lo que el test de verdad quiere demostrar.

Es exactamente el choque de base compartida que esta misma sección ya anticipaba para QC-6 y
QC-7, materializado — y una razón más para que QC-14 **no** sea una tercera cadena de
migraciones en vuelo contra la misma base.


### DOS SESIONES DE LEADER EN PARALELO SOBRE EL MISMO REPO (2026-09-01) — YA HUBO PÉRDIDA

**Actualización: dejó de ser hipotético.** La entrada de evaluación de QC-7 en
`## Evaluaciones` se escribió y **desapareció**, sobrescrita por la otra sesión al reescribir
este archivo. Se rehízo a mano. `feature_list.json` sí sobrevivió, pero por suerte: las dos
sesiones hacen read-modify-write sin cerrojo y la última escritura gana.

**Mitigación decidida el 2026-09-01: QC-7 entra primero en fase 2 y QC-6 espera.** Eso
elimina el choque de archivos (`lib/composition/index.ts`, `lib/modules/identity/`), pero
**no** el de `progress/current.md` ni el de `feature_list.json`, que siguen sin protección.

**Confirmado desde la sesión de QC-6 (2026-09-01, 17:2x).** El humano aprobó el spec de QC-6
y la ficha pasó a `in_progress` (F2.0), pero **el implementer NO se lanzó**: la validación de
conflicto de `AGENTS.md > Paralelismo` da intersección con QC-7, que ya está a medio
implementar (sus tasks marcadas `[x]` hasta la creación de su migración). Archivos que se
cruzan: `db/schema.prisma` (las dos añaden columnas al modelo `User`), `db/migrations/`,
`lib/modules/identity/index.ts`, `lib/composition/index.ts` y
`tests/unit/identity/schema/identity-migration.test.ts`.

**QC-6 queda parada en F2.1 y conserva su slot** de la zona `backend`: aprobada, con worktree
montado en `f79ba5d` y spec completo. Arranca en cuanto QC-7 pase a `done`.

Lo que más pesa no son las columnas —son aditivas y con nombres distintos, se mezclan solas—
sino que **la verificación central de QC-6 es correr el seed dos veces contra una base real**,
o sea aplicar migraciones, mientras QC-7 está ejercitando `db:migrate` y `db:rollback` contra
esa misma base. Dos cadenas de migración en vuelo comparten `_prisma_migrations`, y ahí el
historial miente en silencio: es exactamente el fallo que `docs/architecture.md > Migraciones
up/down` advierte que no apunta a su causa.


Una sesión evaluó y montó **QC-6**; otra, en paralelo y sin saberlo, evaluó y montó **QC-7**
y lanzó su `spec_author`. Las dos escriben en `feature_list.json` y en este archivo. No se ha
perdido nada todavía —la evaluación de QC-7 sobrevivió y los dos worktrees están registrados—
pero eso es suerte, no diseño: el arnés no tiene cerrojo y la última escritura gana.

**La fase 1 no corre peligro**: cada `spec_author` escribe solo en su `specs/<key>/`. El
choque llega en **fase 2**, y es previsible por archivo:

| Archivo | QC-6 (seed) | QC-7 (login) |
| --- | --- | --- |
| `lib/composition/index.ts` | probable | **seguro** (cablea el puerto nuevo) |
| `lib/modules/identity/domain/**` | probable | **seguro** (`verify-credentials` deja de ser stub) |
| `lib/modules/identity/ports/**` | posible | **seguro** (puerto hacia la persistencia) |
| `db/schema.prisma` | no | no |

Las dos son `zone: backend`, así que la regla de máx. 2 se cumple **por número** — y es justo
el caso que `AGENTS.md > Validación de conflicto` dice que hay que mirar aparte: cupo OK,
conflicto de archivos SÍ. **Decisión humana pendiente**: cuál de las dos entra primero en fase
2, o si una de las dos sesiones para.

Precedente que conviene recordar: las features 1 y 7 corrieron en paralelo, ambas montaron
Vitest desde cero, y git auto-mergeó en silencio dos configuraciones incompatibles. Aquí el
riesgo es el mismo con `lib/composition/index.ts`.


Conflictos de merge ambiguos que el implementer no resolvió solo y esperan
decisión humana (paso F2.3).

### ~~Feature 7 ← `dev` — infraestructura de tests duplicada~~ → **RESUELTO** (2026-08-06)

Al hacer `git merge origin/dev` en `feature/7-pantalla-de-login`, tras el merge del PR de
la feature 1. Resuelto con decisión humana y mergeado en el PR #2; gate completo verde
(89/89 tests, las dos suites conviviendo). Se conserva aquí como registro de la causa raíz.

Las features 1 y 7 corrieron en paralelo y **las dos montaron Vitest desde cero**, cada una
sin saber de la otra. Git solo marcó conflicto en `package.json` y `pnpm-lock.yaml`; el resto
son **archivos distintos que hacen lo mismo**, que git auto-mergea en silencio y dejan el
repo con dos configuraciones peleándose:

| Pieza | `dev` (feature 1) | `feature/7` | Choque |
| --- | --- | --- | --- |
| Config de Vitest | `vitest.config.mts`, `environment: 'node'`, `passWithNoTests` | `vitest.config.ts`, `environment: 'jsdom'`, `globals`, `setupFiles`, plugin de React | **Incompatible en una sola config.** Los tests de esquema/integración necesitan `node`; los de UI necesitan `jsdom`. Además dos archivos de config es ambigüedad de resolución. |
| `test:rapido` | `tsx scripts/test-rapido.ts` | `node scripts/test-rapido.mjs` | Dos scripts, mismo trabajo. El de la 7 evita el shell **a propósito**: las rutas con paréntesis (`app/(public)`) rompen en Windows. |
| `test:guardias` | `vitest run guard` | `vitest run guard --passWithNoTests` | Menor. |

`package.json` y `pnpm-lock.yaml`: el resto es **unión** de dependencias (Prisma/pg/tsx de la
1; shadcn/sonner/zod/jsdom/Testing Library de la 7), sin ambigüedad real.

**Resolución (decisión humana, 2026-08-06):** una sola `vitest.config.mts` con dos
`projects` — `node` para esquema/integración/guardias, `jsdom` para UI — repartidos **por
convención** (`*.test.tsx` y `tests/ui/**` van a jsdom) y no por lista de archivos, para que
un test nuevo caiga solo en el proyecto correcto. Se conserva el `test:rapido` de la feature
7 por el fix de Windows. `tests/unit/smoke.test.ts` → `tests/ui/smoke.test.ts`.

**Lección para el arnés — el paralelismo entre zonas no está cubierto.** La validación de
conflicto de `AGENTS.md > Paralelismo` solo compara features de la **misma** zona. Estas dos
eran `backend` y `frontend`, así que ningún paso las comparó — y ambas necesitaban montar la
misma infraestructura transversal (el runner de tests). Git tampoco ayudó: solo marcó
conflicto en `package.json` y el lockfile; `vitest.config.mts` vs `vitest.config.ts` y
`test-rapido.ts` vs `test-rapido.mjs` son **archivos distintos** y se auto-mergean en
silencio. Si dos features de zonas distintas van a tocar infraestructura compartida
(runner, config de build, `package.json`), hay que detectarlo en F1.0 aunque las zonas
difieran.

### Guardia `guard-password-never-plaintext` vs. feature 7 → **RESUELTO** (2026-08-06)

La guardia de la feature 1 (R11) marcaba en rojo el formulario de login: 5 hallazgos, tres
falsos positivos del heurístico (`FORGOT_PASSWORD_ROUTE`, `PASSWORD_ERROR_ID`,
`passwordError`) y dos de contraseña **en tránsito** (`password` en la action y en el schema
zod). Ninguno almacenaba nada. Decisión humana: **afinar, no reducir cobertura**. Se afinó el
heurístico por forma del identificador (último segmento en `route, path, url, href, id, ids,
error, errors, message, label, placeholder, field, input`; se dejaron fuera a propósito
`name, key, type, value, data, text`, que sí pueden ser columnas reales) y se acotó una
allowlist **por ruta de archivo** a exactamente `lib/actions/login.ts` y `lib/types/auth.ts`.
Tests nuevos impiden que esa allowlist se convierta en un agujero: el mismo identificador en
`db/`, `scripts/` o cualquier otro archivo de `lib/` sigue dando rojo.

## Deudas y cosas abiertas

### QC-34 tiene base propia `QuimiCloude_QC34` — hay que BORRARLA al cerrar la ficha (2026-09-04)

Tercera vez que el drift de base entre worktrees bloquea una feature, y tercera vez que se resuelve
a mano: la sesion paralela de **QC-52** aplico su migracion a la base compartida y eso revento los
tests de integracion de QC-34 con un `P2022` en cualquier lectura de `orders`. Se replico lo de
**QC-20**, **QC-25** y **QC-26**: base propia para el worktree.

- **Creada** `QuimiCloude_QC34`, con `DATABASE_URL` y `DIRECT_URL` del `.env` del worktree
  apuntando ahi y `prisma migrate deploy` aplicado.
- **Efecto colateral bueno:** con base limpia, `tests/integration/identity/identity-seed.int.test.ts`
  vuelve a **verde** dentro del worktree. Su rojo era de los datos hechos a mano en la compartida,
  que siguen ahi y siguen sin tocarse por decision del humano.
- **La trampa de siempre:** ni `init.sh` ni Vitest cargan ese `.env`. Sin
  `set -a && . ./.env && set +a` delante, el gate pega contra la compartida y la base propia es
  decorativa. Ya estaba escrito en este archivo y volvio a pasar hoy.
- **Deuda que esto crea:** `./scripts/wt.sh done` no sabe nada de la base propia, asi que **al
  cerrar QC-34 hay que borrar `QuimiCloude_QC34` a mano**. Siguen vivas y huerfanas
  `QuimiCloude_QC14` y `QuimiCloude_FIXGATE`, comprobado hoy contra el servidor.

### Aviso cruzado a la sesion de QC-52 (2026-09-04)

Cuando la migracion de QC-34 (`cancellation_reason` en `orders`) llegue a `dev`, la copia de
`tests/integration/pedidos/pedidos-constraints.int.test.ts` **que vive en `dev`** se pondra roja:
afirma la lista exacta de columnas de `orders`. **En la rama de QC-34 ya esta corregida**, asi que
se arregla sola al mergear; el ruido es solo mientras las dos ramas convivan. Nadie tiene que tocar
el worktree principal por esto.

### El commit `7a3af59` lleva un mensaje que no le corresponde (2026-09-04)

Ese commit dice «base propia QuimiCloude_QC34 y aviso cruzado a QC-52» y **lo que contiene es
trabajo de la sesion paralela**: QC-55 pasando a `in_progress` y su fila en la tabla de arriba. Fue
un `git commit -am` del leader de QC-34 sobre un arbol que la otra sesion acababa de tocar. **No se
perdio nada y no se reescribe la historia** —hay dos sesiones sobre `dev`—, pero es el mismo agujero
que ya causo el MAYOR 2 de la review de QC-26: **commitear sin nombrar los archivos en un repo con
dos sesiones vivas**. La nota real va en este commit.

### La base compartida quedó por delante de `dev`: el gate de `dev` NO puede pasar (2026-09-04)

A las **07:42** la sesión paralela que lleva **QC-52** aplicó
`20260904123854_split_product_and_supplier_catalog` sobre el esquema `public` de la base
compartida `QuimiCloude`. **Verificado, no deducido:** `products` ya no tiene `cost`,
`min_purchase` ni `delivery_time`.

- **Consecuencia inmediata:** cualquier `product.create()` desde código de `dev` muere con
  **SQLSTATE 42703**, así que `./init.sh` sobre `dev` —o sobre cualquier rama que no sea la de
  QC-52— **no puede terminar en verde en esta máquina** hasta que QC-52 mergee. Comprobado con
  `git stash`: los mismos fallos con y sin cambios locales.
- **Ojo con el mensaje de error:** Prisma lo reporta como ``The column `existe` does not exist``.
  Es un artefacto de parsear el error de Postgres en español (`no existe la columna ...`). **No
  hay ninguna columna `existe`**; no pierdas media hora buscándola.
- **Cómo se sorteó, y es la salida recomendada mientras dure:** dar a la rama su propia base.
  `feature/fix-gate-rojos-dev` corre contra **`QuimiCloude_FIXGATE`** (creada, migrada y
  sembrada; `.env` del worktree, fuera de git) y con eso el gate completo da **139/139 archivos y
  1529/1529 tests**. Mismo patrón que `QuimiCloude_QC26`.
- **La causa de fondo, que no arregla ninguna ficha:** todas las sesiones comparten **un solo
  Postgres**, así que la primera que toque el esquema deja el gate rojo para todas las demás.
  Hoy pasó **dos veces en media hora** —primero filas de prueba hechas a mano, después una
  migración— y la primera vez costó un diagnóstico completo. **Una base por worktree es candidato
  a ficha propia del arnés** (`/afinar-regla`), no a parche de sesión.
- **Falsa pista descartada, para que nadie la vuelva a seguir:** durante unos minutos existió un
  esquema `public_shadow_qc52` que duplicaba cada FK en `pg_constraint`. Era la *shadow database*
  que `prisma migrate dev` crea y destruye, no un esquema abandonado. El filtro por `public` que
  añadió el PR #31 a esas consultas se queda porque inmuniza contra esa ventana, pero **no era la
  causa** del rojo que persistía.

### Actualización a la deuda del rojo de `identity-seed` (2026-09-04)

La decisión del **2026-09-03** —«no se borra la fila, no se arregla el helper y NO se mete al
baseline»— **queda sustituida por la del humano del 2026-09-04**: se arregla el helper. Va en el
**PR #31**. `resetIdentityToEmptyState` ya no depende de con qué datos arranque la base local, y
la causa de fondo que quedó escrita el 2026-09-03 —«cualquier feature futura con una FK a `users`
puede volver a provocarlo»— **queda cerrada**: el orden de borrado se deriva del catálogo, no de
una lista. Se comprobó contra la base ya migrada por QC-52, con las dos FK nuevas de
`supplier_catalog_lines`: 10/10 en verde.

Lo que **no** se cerró y sigue vivo es la fila residual como problema de convivencia: ver la deuda
de la base compartida, justo arriba.

### La base compartida tiene una fila residual que rompe el gate de TODAS las sesiones (2026-09-03)

`tests/integration/identity/identity-seed.int.test.ts` sale rojo con **8 casos** en cualquier
worktree, `dev` incluido — verificado, no deducido. **No es un defecto de código**: es estado sucio
de la base compartida.

- **La fila:** un producto `FeldesQuack` en `products`, creado el 2026-09-03 a las 19:36 UTC, con
  `created_by`/`updated_by` apuntando al admin del seed y `deleted_at` nulo. Encaja con una corrida
  de **QC-22** sin limpiar.
- **El mecanismo:** `resetIdentityToEmptyState` hace `DELETE FROM users` dentro de una transacción
  y la FK `products_created_by_fkey` lo bloquea con `23503`.
- **Estado comprobado de la base:** 1 producto, 0 recetas, 4 unidades, 1 usuario. `orders` con 0
  filas, así que ninguna FK de QC-33 participa.
- **Decisión del humano (2026-09-03): no se borra la fila, no se arregla el helper y NO se mete al
  baseline.** El baseline es para deuda ajena de `dev`; esto es transitorio, y enmascararlo ahí
  ocultaría para siempre un test que volverá a pasar solo en cuanto la fila desaparezca. Se declara
  en el PR y se anota aquí.
- **La causa de fondo, que sigue viva:** `resetIdentityToEmptyState` borra usuarios sin limpiar
  antes las tablas que los referencian, así que **cualquier feature futura con una FK a `users`
  puede volver a provocarlo**. Arreglarlo es candidato a ficha propia.
- **Actualización 2026-09-04 (F0 de QC-34):** sigue rojo y **ha crecido**. La base local ya no
  tiene una fila residual sino **6 productos, 1 receta y 2 líneas**, hechos a mano probando la UI
  (encajan con el commit `c0c16af` «fix: ui errors»). El humano **ratifica la decisión**: no se
  borran los datos, no se mete al baseline, se declara y se sigue. Los otros cuatro archivos rojos
  de esa corrida **no son deuda**: dos son flakes bajo carga —pasan en aislado— y dos exigen diff
  en `origin/dev...HEAD`, vacío cuando el gate corre sobre `dev`.

### El gate rápido no ve los tests de alcance de otros módulos (2026-09-03, confirmado por QC-33)

El implementer de QC-33 reportó **1** rojo; el gate completo destapó **6**, y **5 eran suyos**: las
afirmaciones de QC-4, QC-14 y QC-24 de que en todo el esquema no existe ningún enum, que los dos
enums de QC-33 dejaron viejas. `vitest related` no los relaciona porque no los une el árbol de
archivos sino una afirmación sobre el repositorio entero. **Es el mismo agujero que ya costó caro
en QC-20**, y es la razón por la que el gate completo antes del PR no es ceremonia.

- **[arnés — la regla 1 NO cambió: sigue siendo «máximo 2 `in_progress` por zona»]** Varias notas
  de este archivo dan por hecha una regla nueva de «1 por zona y **por épica**». **Esa regla no
  existe en `dev`**: `CLAUDE.md`, `AGENTS.md`, `scripts/validate-features.mjs` y
  `.claude/agents/leader.md` conservan el límite original — verificado el 2026-09-03, no deducido.
  Se llegó a redactar con `/afinar-regla` y **el humano pidió revertirla**; se revirtió entera,
  incluidos los espejos git-ignorados de `harnessConfig/`. Quien lea aquí «cupo libre con la regla
  nueva» está leyendo una nota que envejeció mal: **el validador cuenta por zona, no por épica**, y
  es él quien manda.

### QC-32 se cerró el 2026-09-03 — lo que deja abierto

Resumen completo en `progress/history.md`. Lo que sigue vivo:

- **[arnés — `prisma migrate dev --create-only` propone BORRAR todas las claves foráneas que
  cruzan de módulo, y aplicarlo destruiría en silencio la integridad de tres features ya
  mergeadas.]** El 2026-09-03, generando la migración de QC-43, el CLI de Prisma añadió **diez
  `DROP CONSTRAINT`** de *drift* sobre `products`, `recipes`, `recipe_lines`, `suppliers` y
  `supplier_catalog_lines`. **Ninguno lo había pedido nadie.** La causa es una consecuencia
  directa de una decisión deliberada del repo: esas FK son **escalares sin `@relation`**
  —convención que QC-20, QC-24 y QC-42 tomaron a conciencia para que un módulo no arrastre el
  modelo de otro—, así que Prisma no las ve en el `schema.prisma`, las lee como sobras de la base
  y propone eliminarlas.
  **Por qué es grave:** el `DROP` no falla, no avisa y no deja rastro en el diff salvo que alguien
  lea el SQL generado línea a línea. Una migración aplicada con esos diez `DROP` deja la base sin
  ninguna de las FK entre módulos, y **los tests de integración seguirían en verde** porque
  comprueban el camino feliz, no que la restricción exista. El fallo aparecería mucho después, con
  datos huérfanos que ya nadie puede reconstruir.
  **Hoy se salvó porque el `backend_dev` los leyó y los borró a mano**, y lo dejó anotado en la
  cabecera del `migration.sql` con un test estático que vigila que la migración contenga **solo**
  los tres cambios de la ficha. Eso es criterio individual, no arnés: la próxima vez puede no
  haberlo. **Candidata para `/afinar-regla`**: o el gate compara el censo de FK de la base contra
  el esperado, o `docs/architecture.md` documenta el paso obligatorio de auditar el SQL generado
  antes de aceptarlo, junto a la convención de FK escalares que lo provoca.
- **[arnés — `wt.sh new` deja el worktree a medio montar, y hoy costó CINCO tropiezos seguidos
  antes de poder correr el gate. Es la candidata más concreta y más barata para `/afinar-regla`.]**
  El 2026-09-03, al montar `.worktrees/QC-43-crud-de-proveedores`, el gate no pudo correr hasta
  hacer **cinco cosas a mano** que el script no hace y que ningún documento lista juntas:
  1. **`.env`** — hay que copiarlo del worktree principal; sin él, `init.sh` avisa pero los tests
     de integración ya han fallado.
  2. **Exportarlo a mano** (`set -a && . ./.env && set +a`) — porque **Vitest no lo carga en un
     worktree y en `dev` sí**, con archivos idénticos y mismo config. Causa raíz aún sin
     identificar (deuda aparte).
  3. **`pnpm install`** — el worktree nace sin `node_modules`; el error que da es
     `Local package.json exists, but node_modules missing`, que no aparece hasta que fallan
     `db:migrate` y `db:seed`.
  4. **`pnpm prisma generate`** — sin esto, `typecheck` falla con `Module '@prisma/client' has no
     exported member 'Prisma'`. **Cuarta vez en el día** que el cliente sin regenerar rompe algo.
  5. **`pnpm exec next typegen`** — sin esto, `typecheck` falla con
     `Cannot find name 'LayoutProps'` en `app/layout.tsx`, un tipo que genera Next.
  Y para una feature con migraciones, **una sexta**: crear su base propia y apuntar el `.env` ahí
  (ver la deuda de la base compartida). Las seis son mecánicas y ninguna requiere criterio: son
  exactamente lo que un script debe hacer. **`wt.sh new` debería dejarlas hechas** —y `wt.sh done`
  eliminar la base—, o como mínimo imprimirlas en orden al terminar. Hoy el leader las descubre
  una a una, cada una tras un error distinto, y un subagente que se las encuentre las lee como
  «algo está roto».
- **[arnés — TRES features en paralelo comparten UNA base de datos, y dos de ellas dejaron `dev`
  roto en integración sin que nadie se enterara. Es la deuda más cara de esta sesión.]**
  El 2026-09-03, al correr el gate de QC-22, fallaron 4 archivos de integración de `inventario` y
  `recetas`. **No era de QC-22**: los mismos tests fallaban en `dev` sin una sola línea de la
  feature. La causa, verificada consultando `_prisma_migrations` en la base: la base compartida
  `QuimiCloude` tiene **dos migraciones aplicadas que `dev` no tiene en disco** —
  `20260903121404_units_catalog` (QC-32, aplicada 15:50) y
  `20260903131417_suppliers_and_supplier_catalog_lines` (QC-42, 14:33)—, cada una viviendo solo en
  la rama de su feature. `units_catalog` convierte la unidad de la línea de receta de texto libre
  a clave foránea, así que `recipeLine.create({ unit: 'kg' })` dejó de funcionar contra un esquema
  que ningún `schema.prisma` de `dev` describe.
  **Por qué duele:** `./init.sh` en `dev` es el contrato de «esto está sano», y lo puede romper
  cualquier sesión paralela sin tocar `dev`. El leader que se lo encuentre gasta la sesión
  diagnosticando algo que no es suyo — hoy costó unas cuantas corridas — y, peor, **puede leerlo
  como una regresión de su propia feature** y devolvérsela al implementer.
  **Lo que ya existía y se dejó de usar:** QC-20 tuvo base propia (`QuimiCloude_QC20`), creada y
  eliminada al cerrar. QC-30, QC-32 y QC-42 copian el `.env` de `dev` tal cual y pegan contra la
  base compartida. La regla de paralelismo de `AGENTS.md` valida **conflicto de archivos** entre
  features de la misma zona, pero **no dice nada de la base**, que es estado compartido tanto o
  más frágil — y las tres features en curso son de zonas distintas, así que el cupo por zona ni
  siquiera las mira.
  **Lo que se hizo hoy, y sirve de receta:** se creó `QuimiCloude_QC22`, se apuntó el `.env` del
  worktree a ella y se corrieron `db:migrate` + `db:seed`. Los 4 rojos desaparecieron y el gate
  pasó a 1012/1014. `wt.sh new` podría crear la base y `wt.sh done` eliminarla, igual que ya monta
  y desmonta el worktree. **Candidata fuerte para `/afinar-regla`.**
- **[arnés — en un worktree, Vitest NO carga el `.env`; en `dev` sí, y no sé por qué.]** Mismo día:
  con `.env` presente y byte a byte idéntico al de `dev`, misma versión de Vitest (4.1.10), mismo
  `vitest.config.mts` (comparado con `diff`: idénticos) y sin `envDir` ni `root` propios, los tests
  de integración en `.worktrees/QC-22-*` fallaban con `Environment variable not found:
  DATABASE_URL`, mientras el mismo archivo pasaba en `dev`. Se resuelve exportando a mano antes de
  correr: `set -a && . ./.env && set +a`. **La causa raíz sigue sin identificar** y no se rellena
  con un supuesto (regla 6). Mientras tanto, cualquiera que corra el gate en un worktree y no lo
  sepa verá ~8 archivos de integración en rojo y creerá que rompió algo. Merece o un arreglo en
  `init.sh` (que cargue el `.env` él mismo) o, como mínimo, una línea en `docs/worktrees.md`.
- **menor-6, el único con cobertura real:** ninguna aserción automática comprueba **las cuatro
  filas en la base**; la evidencia es el log de la tarea. `unidades-constraints.int.test.ts` ya
  corre contra Postgres y un caso acotado costaría poco.
- **menor-7 y menor-8** — deriva de documentación: la tabla de trazabilidad de
  `specs/QC-32-modelo-unidades/tasks.md` (filas R16 y R19) y el mapa `R<n> → test` de
  `progress/impl_QC-32-modelo-unidades.md > T14` citan artefactos que la ronda 3 borró.
- **menor-9** — la mitad negativa de R26 se apoya en una lista de nombres literales; lo que cierra
  la red es el barrido. **Para QC-38.**
- **Preguntas abiertas que siguen abiertas:** si el símbolo debe ser único cuando existe (n.º 1) y
  si presentación y unidad convergen (n.º 3).

**Dos cosas resueltas que conviene no reabrir:** `tests/` fuera del barrido de
`module-contract.test.ts` es frontera legítima —extenderlo volvería R15/R16 **incomprobables**
contra base real, porque `recipe_lines.unit_id` es `NOT NULL` con FK—; y la migración de QC-42
aplicada en la base local no invalidó la evidencia, con la salvedad de que se obtuvo revirtiendo y
reaplicando QC-32 *por debajo* de una migración posterior, cosa que `migrate deploy` no hará en
producción.

### Arranque de un worktree: falta `pnpm install` y `next typegen` (2026-09-03, hallazgo de QC-32)

Montar un worktree con `wt.sh new` no deja el árbol compilable: además del `.env` hacen falta
`pnpm install` y `pnpm exec next typegen`. Sin lo último `app/layout.tsx` no compila, porque
`LayoutProps` vive en `.next/types`, que está git-ignorado, y **el gate sale rojo por algo ajeno a
lo que estés haciendo**. Se reproduce en rama limpia. `docs/worktrees.md` no lo dice. Candidato a
`/afinar-regla`, no se aplicó en caliente.

Lo que condiciona trabajo futuro y no tiene ficha propia todavía.

- **[arnés — el repo no tiene `.gitattributes`, y un subagente hinchó un diff de 21 a 189 líneas
  sin que nada avisara.]** El 2026-09-03, implementando QC-22, un agente reescribió
  `app/(private)/layout.tsx` **entero en CRLF** para un cambio de ~15 líneas. `git diff` marcó
  189 líneas cambiadas: todo el archivo como borrado y re-añadido. Ni `typecheck`, ni `lint`, ni
  el gate lo ven —el código es idéntico—, pero en un PR es ruido que esconde el cambio real y
  hace imposible revisar. Lo normalizó el leader con `sed -i 's/\r$//'`. Un `.gitattributes` con
  `* text=auto eol=lf` lo cierra de raíz, y un bloque del gate que rechace archivos versionados
  con CRLF lo haría visible en el momento. Candidata para `/afinar-regla`.
- **[arnés — la regla del gate protege de las corridas largas, pero no del coste de REPONER un
  transcript grande.]** El mismo día, el `implementer` de QC-22 murió **dos veces** con
  `529 Overloaded`: la primera a mitad del trabajo (tras cerrar T0–T2), y la segunda **en su
  primera petición al reanudarlo**, sin avanzar nada. `AGENTS.md > Regla del gate` ya documenta
  que las corridas largas rompen el stream, y por eso ningún subagente corre la suite; lo que no
  estaba escrito es que **reanudar un agente con ~150k tokens de transcript es igual de frágil**,
  porque cada reanudación repone todo el contexto de golpe. Lo que funcionó: **tirar el
  transcript y lanzar un agente nuevo acotado a dos tareas**, con instrucciones de leer solo las
  secciones del spec que esas tareas referencian. La lección práctica: cuando un `implementer` de
  20 tareas se cae, no lo reanimes — reparte lo que queda en bloques pequeños con contexto
  mínimo. Vale para `/afinar-regla` sobre `AGENTS.md > Regla del gate`.
- **[arnés — el gate no regenera el cliente de Prisma, y por eso `dev` amaneció en rojo sin que
  nadie rompiera nada.]** El 2026-09-03 `./init.sh` falló en `typecheck` con 24 errores en
  `inventario`: el cliente generado en `node_modules` era anterior al merge de QC-20, que añadió
  `nameNormalized`, `createdBy` y `updatedBy` a `db/schema.prisma`. El arreglo fue
  `pnpm prisma generate`, cero cambios de código. El coste no es el minuto que tarda: es que
  **el rojo era indistinguible de una regresión real** y se fue en diagnosticarlo. Un
  `prisma generate` al principio de `init.sh` (o un guard que compare la mtime del schema contra
  la del cliente) lo cierra. Candidata para `/afinar-regla`.
- **[máquina — la suite completa hace flake por timeout bajo carga.]** En la misma corrida, 3
  tests de `login-form` cayeron con `Test timed out in 5000ms` y aislados pasaron los 29. La
  diferencia: `environment 416s` contra 63 s. No hay nada roto, pero un leader con menos contexto
  lo lee como regresión y devuelve la feature al implementer. O sube el `testTimeout` de los
  tests con `userEvent`, o el gate reintenta una vez el archivo rojo antes de declararlo.
- **[arnés — EL GATE NO CORRE E2E, y por eso `dev` pudo estar roto en runtime con todo en verde.
  Candidata 5 para `/afinar-regla`, y la más cara de las cinco.]** El 2026-09-02, **toda la zona
  privada devolvía 500** en `origin/dev` —`Functions cannot be passed directly to Client
  Components`, porque `PRIVATE_NAV_ITEMS` llevaba componentes de `lucide-react` dentro de los datos
  que el layout pasa a `<AppSidebar>` (`'use client'`)—, introducido por `05efbbe` (PR #18,
  sidebar). Mientras tanto: `./init.sh` **completo** daba **73 archivos y 794 tests en verde** en la
  rama de QC-9, y 642 en la de QC-29. Los dos números eran ciertos.
  **Las tres razones por las que nadie lo vio, y ninguna es descuido:**
  1. **El gate no ejecuta E2E.** `pnpm run e2e` va aparte y no entra en `./init.sh`.
  2. **`e2e/login.spec.ts` pasa en verde con esos mismos 500 en el log**, porque espera por
     **ruta** (`waitForURL`) y no por contenido — y `waitForURL` se cumple con un 500 detrás. Un
     E2E así *parece* verificar el render y no verifica nada de él.
  3. **En jsdom no existe la frontera servidor/cliente**: todo se renderiza en cliente y un icono
     no serializable funciona perfectamente. La sesión del sidebar escribió **once tests con
     mutaciones sobre esa misma barra el mismo día** y ninguno podía cazarlo. No es cobertura
     insuficiente: es una **clase de fallo estructuralmente invisible al runner unitario**.
  **Lo cazó el E2E de QC-9, que es el primer test del repo que renderiza de verdad una pantalla
  privada.** Sin esa feature, el defecto podía haber vivido en `dev` indefinidamente.
  **Defensa barata que ya existe**, escrita por la sesión del sidebar:
  `tests/guards/guard-nav-serializable.test.ts` afirma sobre **el dato** —recorre el array y falla
  si algo no sobrevive a `JSON`— en vez de sobre el render. Ese es el patrón a generalizar.

- **[arnés — el rescate del validador NO es simétrico entre la raíz y los worktrees. Candidata 2
  para `/afinar-regla`.]** `tieneSpec()` de `scripts/validate-features.mjs` busca el spec en tres
  sitios y el tercero es `.worktrees/<slug>/specs/`, **resuelto contra el cwd**. Desde la raíz
  funciona; **desde dentro de un worktree ese tercer sitio no existe**, así que toda feature en
  vuelo cuyo spec no esté en `dev` se ve como spec faltante. Y el gate previo al PR se corre
  **dentro del worktree por diseño** (F2.4 valida tu rama, no el árbol de `dev`), o sea que el
  falso rojo aparece **en el momento de menos margen** y señala a una feature ajena.
  **Reproducido por tres sesiones el 2026-09-02**: desde QC-24 (señalando a QC-29), desde QC-21
  (señalando a QC-24) y desde QC-29 (señalando a QC-9 y QC-21). Arreglo probable: resolver el
  directorio de worktrees contra el worktree **principal** (`git worktree list --porcelain`), que
  es lo que `scripts/wt.sh` ya hace por esta misma razón y con el comentario que lo explica — el
  validador no heredó esa lección. Alternativa: que el flujo obligue a que el spec entre en `dev`
  al pasar la ficha a `in_progress`.
  **Coste real medido hoy:** dos sesiones se puentearon copiando specs ajenos a su rama, y eso
  generó un `add/add` en `specs/QC-24-modelo-recetas/requirements.md` donde **resolver a favor de
  `dev` habría borrado el spec entero** (246 líneas por 61).
- **[arnés — dos features que acotan el mismo test de alcance deben hablarlo ANTES. Candidata 3
  para `/afinar-regla`, aportada por la sesión de QC-20.]** Los dos casos del 2026-09-02, con
  resultado opuesto y medido: en `inventario-schema.test.ts` QC-20 y QC-24 lo acotaron **por
  separado y sin avisarse**, y acabó en conflicto de contenido que hay que resolver por unión —
  resolverlo «a favor de una versión» pierde en silencio lo que la otra protegía. En
  `credential-policy-contract.test.ts` **se habló antes**, no se tocó dos veces, y salió un test
  **mejor que el de cualquiera de los dos**: QC-24 aportó el hueco de `app/` que la versión de
  QC-20 dejaba abierto, y QC-20 verificó que la guardia hexagonal **no** lo cubría en vez de
  aceptar el argumento de su implementer. Coste de hablarlo: tres mensajes. Mismo criterio para
  **escribir dentro de un módulo ajeno**: `product-catalog.ts` estaba en el `design.md` de QC-24 y
  en su PR, pero la sesión de QC-20 lo descubrió resolviendo un conflicto y lo leyó como intrusión.
  **Matiz que aporta la sesión de QC-20, y que es el que hace la regla aplicable:** el aviso previo
  solo es barato **si hay a quién avisar**. Hoy funcionó porque había dos sesiones hablando por un
  canal directo. La regla escrita tiene que decir **dónde se deja el aviso cuando no hay nadie
  escuchando** — el sitio natural es `progress/current.md > Conflictos pendientes`, que ya existe
  exactamente para esto y que hoy **no usó ninguna de las dos sesiones**. Sin esa parte, la regla
  se cumple solo cuando hay suerte.

- **[arnés — `lib/composition/index.ts` serializa de facto la zona backend. Candidata 4 para
  `/afinar-regla`, aportada por la sesión de QC-20.]** Ese archivo ha aparecido como conflicto en
  **todas** las parejas de features backend del 2026-09-02: QC-6/QC-8 y QC-19/QC-20. El punto único
  de composición es correcto y es una regla explícita de `docs/architecture.md`, pero al ser un
  archivo único que toda feature con un puerto nuevo tiene que tocar, **contradice en la práctica la
  regla 1 de `CLAUDE.md`**, que permite dos features en paralelo por zona. QC-24 se libró **solo
  por casualidad**: su spec dejó el cableado del `ProductCatalog` para QC-25. No hay arreglo obvio
  —partir la composición por módulo tiene su propio coste— y por eso es material de `/afinar-regla`
  y no de una feature.

- **[arnés — tests de feature que afirman el censo GLOBAL del repo. Encargo del humano el
  2026-09-02: proponer la regla por `/afinar-regla` al cerrar QC-24.]** Tres features distintas
  han escrito aserciones del tipo «mi feature añade exactamente N modelos / N migraciones»
  comprobando **todo** el esquema o **todo** `db/migrations/`. Pasan el día que se escriben y
  ponen en rojo a la feature siguiente, que no tiene culpa. **Cuatro casos reales, todos del
  2026-09-02**, y los cuatro los tuvo que acotar QC-24:
  - `tests/unit/inventario/schema/inventario-schema.test.ts` (QC-14): enumeraba todos los modelos
    del esquema, y exigía `inventario/domain/` vacía con el barrel literal `export {};` — que es
    justo lo que QC-24 cambia por diseño.
  - `tests/unit/identity/credential-policy-contract.test.ts` (QC-19): `expected [Array(7)] to
    deeply equal [Array(5)]` (modelos) y `expected […(5)] to deeply equal […(4)]` (migraciones).
  **Lo que agrava el patrón:** esos tests leen las fuentes **del disco** en vez de importarlas, así
  que `vitest related` no los engancha y **`./init.sh --rapido` no los corre**. El fallo aparece
  tarde, en el gate completo de otra persona, y parece un problema de quien llega.
  **Forma de la regla, a afinar:** un test de feature mide lo que **su** feature garantiza sobre sí
  misma; si su aserción se rompe cuando llega la feature siguiente, estaba midiendo el repo. El
  criterio que ya funcionó dos veces: contar por `/// @module`, o afirmar sobre el **diff de la
  feature**, en vez de sobre el censo global. Ambas acotaciones las validó el reviewer por
  mutación y quedaron **más** estrictas que el original, no más laxas.

- **[board — QC-29 entró sin F0 completo (2026-09-02)]** La ficha se creó en Jira y se añadió a
  `feature_list.json` **de forma incremental**, sin regenerar el archivo entero desde el board como
  manda F0. Fue deliberado: el árbol tenía cambios sin commitear (`feature_list.json`,
  `progress/current.md`, `specs/QC-24-modelo-recetas/` sin trackear) y una regeneración completa a
  media sesión los habría pisado. Es el mismo alcance acotado con que `/afinar-feature` escribe en
  el JSON («solo las fichas que acaba de tocar»). **Pendiente: correr F0 completo al abrir la
  próxima sesión**, que reconciliará QC-29 con el resto del board.

- **[board — dos empujones a Jira quedaron sin hacer por el MCP caído (2026-09-02)]** El servidor
  `atlassian` dejó de responder a media sesión: dos llamadas abortaron por timeout (120 s y 300 s).
  Quedan pendientes, **los dos sobre QC-24**: (1) el **comentario** de F1.3 con el detalle del spec
  y la ruta de `specs/QC-24-modelo-recetas/`, y (2) la **transición de la tarjeta a *En curso***
  tras la aprobación humana del 2026-09-02 (F2.0). El disco **sí** está al día: la ficha está
  `in_progress` en `feature_list.json` y el ciclo no depende de Jira (regla 3 de `CLAUDE.md`, el
  gate corre sin red). Pero mientras no se empujen, **el board dice *En revisión* y el disco dice
  `in_progress`**, y el próximo F0 vería una feature `in_progress` cuya tarjeta está en otra
  columna: eso NO se degrada (`docs/jira.md > Si Jira y el disco divergen`, excepción 1), así que
  el disco gana y hay que mover la tarjeta a mano.

- **[QC-19 — el despliegue en un entorno nuevo falla si la `SEED_ADMIN_*` no cumple la politica]**
  Consecuencia querida de R18 y prevista en `design.md > 7.2`, pero conviene leerla aqui **antes**
  de desplegar: desde esta ficha, el seed de instalacion evalua la politica antes de hashear, asi
  que una credencial de instalacion que no cumpla **aborta el arranque** (`pnpm run build` corre
  `prisma migrate deploy && tsx scripts/seed.ts`). El fallo es ruidoso y dice que reglas incumple
  —nunca la credencial—, que es justo lo que se queria; pero quien prepare un entorno nuevo tiene
  que fijar una `SEED_ADMIN_*` de 8 a 64 caracteres, con mayuscula, minuscula, digito y simbolo, y
  que no este entre las filtradas conocidas. La del entorno local ya cumple: verificado.
- **[QC-19 — `P4ssw0rd!` pasa la politica]** No hay des-leetificacion ni recorte de sufijos: una
  variante de una contrasena filtrada cuela aunque su forma base este en la lista
  (`design.md > 4` y `> 11`). Puntuar fuerza esta fuera del alcance de la ficha; si algun dia
  hace falta, es ficha nueva, no un parche al adaptador.
- **[QC-19 — la lista de filtradas envejece y nadie la refresca]** Las 49 233 entradas vienen de
  `@zxcvbn-ts/language-common@4.1.3` y solo se actualizan cuando se actualice la dependencia. No
  hay refresco automatico y esta ficha no lo trae.
- **[QC-19 — la guardia de R19 no comprueba el ORDEN de las llamadas]**
  `guard-politica-de-contrasenas` es un barrido de texto: ve que un archivo que hashea referencia
  tambien la politica, no que la llame **antes** ni que respete su resultado. Para el unico punto
  que hoy fija una contrasena —el seed— ese hueco esta tapado por un test de comportamiento
  (`seed-initial-access.test.ts`, "si la politica rechaza la credencial de instalacion, no se
  hashea ni se escribe nada"). **Todo punto nuevo que fije contrasenas necesita el suyo**: la
  guardia atrapa el olvido completo, no el orden.
- **[QC-19 — QC-21 hereda pintar los mensajes]** El modulo exporta `CREDENTIAL_RULES` (siete
  codigos estables, independientes del idioma) y `evaluateCredentialRules`, sincrona y usable en
  el navegador. QC-21 pinta los requisitos a partir de ese catalogo y **no vuelve a declarar las
  reglas**: una segunda copia es exactamente lo que la fila "la regla vive en el dominio" vino a
  impedir.
- **[QC-12 — E2E diferido a QC-13]** El dashboard no tiene prueba de extremo a extremo, y se
  difirió **con motivo escrito en el spec**: hoy no hay sesión real ni flujo navegable que
  visitar. Lo recoge QC-13, que es la que conecta la guardia de sesión.
- **[QC-12 — `/dashboard` existe y NO está protegida]** La ruta responde 200 a cualquiera. Es
  consecuencia esperada de que QC-13 esté `pending`, no un olvido: hasta entonces la zona
  «privada» lo es de nombre. Igual conviene tenerlo presente si algo se despliega antes.
- **[QC-12 — el ítem «Dashboard» del sidebar sigue dando 404]** Decisión humana del 2026-09-02:
  QC-12 crea la ruta pero **no** reconecta el ítem del menú; lo hace QC-13. O sea que la pantalla
  existe y el enlace del menú sigue roto hasta entonces.
- **[QC-12 — `app/page.tsx` sigue siendo la plantilla de `create-next-app`]** La raíz `/` del ERP
  es la página de bienvenida de Next.js. Nadie ha decidido si debe redirigir al dashboard o al
  login, y **ninguna ficha del backlog lo cubre**. Es la pregunta abierta que dejó el spec de
  QC-12; candidata a ficha nueva de una línea.
- **[arnés — `vitest related` no engancha las guardias que leen las fuentes del disco]** Un test
  que abre el archivo fuente en vez de importarlo no aparece en el grafo de `vitest related`, así
  que **`./init.sh --rapido` puede no correrlo** aunque el cambio lo afecte. Verificado en QC-12
  con `tests/unit/dashboard-route-contract.test.ts`, y es el mismo patrón que
  `tests/unit/identity/login-action.test.ts` y `logout-action.test.ts`. El gate completo sí las
  corre, así que no es un agujero de merge, pero sí del modo rápido. La salida que sugiere el
  reviewer: nombrarlas `guard-…` o moverlas a `tests/guards/`, que el modo rápido corre siempre.
  Entra por `/afinar-regla`.
- **[arnés — QC-20 aporta la evidencia que faltaba: DOS gates rápidos EN VERDE sobre una rama ROJA]**
  Complementa la entrada de arriba y la de los tests de alcance; no la repite. Lo nuevo es que aquí
  el fallo **no apareció tarde en el gate de otro**: no apareció **en absoluto** durante dos grupos
  de trabajo. `tests/unit/identity/credential-policy-contract.test.ts` › `esta feature no anade
  migraciones ni columnas` llevaba rojo **desde la task T2 de QC-20**, y el leader corrió y dio por
  buenos **dos `./init.sh --rapido`** en ese intervalo. Se descubrió por casualidad, porque el
  implementer exigió a un subagente correr `tests/unit/` y `tests/ui/` **enteros** en una task que
  tocaba un contrato compartido.
  **El mecanismo, en dos condiciones que se dan a la vez:** (1) el test **no** vive en
  `tests/guards/` ni se llama `guard-…`, así que `pnpm run test:guardias` no lo recoge; y (2)
  afirma sobre el **árbol de archivos** en vez de importar lo que vigila, así que **ningún grafo de
  imports lo selecciona jamás**. No es que la selección *pueda* fallar: por construcción **nunca**
  lo selecciona. Las dos condiciones juntas lo hacen invisible para el modo rápido **entero**.
  **Regla de trabajo mientras no se arregle**, adoptada por QC-20 a partir del Grupo C: correr
  `tests/unit/` y `tests/ui/` **enteros** al cerrar cada grupo, además del gate del leader. Es lo
  que destapó éste. La salida de fondo sigue siendo la de arriba: que `scripts/test-rapido.mjs`
  incluya siempre los tests que barren el árbol, igual que ya incluye todas las guardias.
- **[arnés — coordinación entre sesiones paralelas: hoy funcionó por suerte, no por regla]**
  Acordada entre la sesión de QC-20 y la de QC-24, con **dos casos contrastados el 2026-09-02**
  que salieron distinto precisamente por esto:
  - `tests/unit/inventario/schema/inventario-schema.test.ts` — las dos features acotaron **el mismo
    test de alcance sin hablarlo**. Acabó en conflicto de contenido resuelto por unión, y con una
    **incompatibilidad real** de por medio: dos aserciones de la versión de QC-24 que QC-20 no
    puede cumplir por diseño (`adapters/driving` vacía, y «todo export del contrato es
    `export type`»), porque QC-20 es justo la ficha que añade Server Actions y publica factories.
  - `tests/unit/identity/credential-policy-contract.test.ts` — **se habló antes**, no se tocó dos
    veces, y salió una aserción **mejor que la que tenía cualquiera de las dos features por
    separado**. Coste: tres mensajes.
  **Forma propuesta:** cuando una feature vaya a acotar un test de alcance de otra, o a escribir
  dentro de un módulo ajeno, **se avisa a quien la lleva antes de tocarlo**. No es regla de código,
  es de coordinación, y este repo corre dos y tres sesiones a la vez **por diseño**.
  **El matiz sin el cual la regla no sirve:** el aviso previo solo es barato **si hay a quién
  avisar**. Hoy funcionó porque había dos sesiones hablándose. La regla escrita tiene que decir
  **dónde se deja el aviso cuando no hay nadie escuchando**: `progress/current.md > Conflictos
  pendientes` existe exactamente para eso y **hoy no lo usó ninguna de las dos sesiones**. Sin ese
  destino, la regla se cumple solo cuando hay suerte.
  **Y engancha con el punto único de composición:** `lib/composition/index.ts` ha salido como
  conflicto en **todas las parejas backend del día** (QC-6/QC-8, QC-19/QC-20). Un punto único de
  cableado es correcto arquitectónicamente, pero **serializa de facto la zona backend**, lo que
  contradice la regla del arnés que permite dos features en paralelo por zona. QC-24 se libró
  **solo** porque dejó su cableado para QC-25 — o sea, por reparto de alcance, no porque el
  problema no exista. Va a `/afinar-regla`; no se parchea a mano.
- **[arnés — `scripts/db-rollback.ts` elige la migración por el DISCO, no por lo aplicado]**
  Medido en QC-20 (T13, 2026-09-02) al comprobar si los `down.sql` de QC-24 y QC-20 componen
  sobre la cadena de seis migraciones. **No se ha arreglado a mano a propósito**: es
  infraestructura compartida por todas las sesiones y `CLAUDE.md` manda que las mejoras al arnés
  entren por `/afinar-regla`.
  **Causa, en una línea:** `findLastMigration()` hace `readdirSync(MIGRATIONS_DIR).sort().at(-1)`
  y **nunca consulta `_prisma_migrations`** para saber cuál está realmente aplicada. Solo toca esa
  tabla después, para borrar la fila.
  **Tres efectos, de gravedad distinta:**
  1. **No encadena.** Dos ejecuciones seguidas revierten **la misma** migración. Medido: el
     primer y el segundo `db:rollback` imprimieron ambos
     `20260902170759_product_audit_and_presentation_uniqueness revertida.`, las tablas de recetas
     siguieron intactas y solo desapareció **una** fila de `_prisma_migrations`, no dos.
  2. **Sale con éxito cuando no ha revertido nada.** El aviso **sí existe** —línea 145,
     «aviso — no tenía fila en `_prisma_migrations`, no se borró ninguna», y remite a
     `prisma migrate status`—, pero acto seguido la línea 151 imprime `<migracion> revertida.` y
     el proceso sale con **código 0**. No es un no-op invisible: es un **aviso enterrado bajo un
     mensaje de éxito**, que en la práctica se lee igual de mal y que **un script que encadene
     rollbacks no puede detectar**, porque mira el código de salida.
  3. **El peligroso, y no es hipotético: nos pasó durante horas.** Si en el disco hay una
     migración con timestamp **posterior** que todavía **no está aplicada** —exactamente la
     situación de QC-20 mientras QC-24 ya estaba mergeada y la nuestra no—, `db:rollback` ejecuta
     **su** `down.sql` contra una base donde nunca se aplicó, y el operador cree haber revertido
     la última aplicada. Con `IF EXISTS` **miente en silencio**; **sin `IF EXISTS`, revienta**. Y
     nada obliga a que un `down.sql` lleve `IF EXISTS`: el gate solo comprueba que **el archivo
     exista**, no su contenido.
  **Propuesta para quien corra `/afinar-regla`,** para no partir de cero: leer la **última fila
  aplicada** de `_prisma_migrations` (`ORDER BY finished_at DESC LIMIT 1`, con `finished_at NOT
  NULL`) y usar **esa** como objetivo; **abortar** —no avisar— si no coincide con el último
  directorio del disco, porque esa discrepancia significa justo el caso 3; y salir con **código
  distinto de 0** cuando no se borra ninguna fila.
  **Lo que este hallazgo NO invalida:** el `down.sql` de QC-20 es correcto y su ciclo de un salto
  es reversible, verificado con snapshot del esquema en cinco dimensiones (columnas, constraints,
  índices, RLS y `_prisma_migrations`) y **cero diferencias** entre antes y después.
- **[QC-20 — los puertos de `inventario` no aceptan `TransactionClient`, y eso condiciona sus tests
  de integración]** Dirigida a **quien toque esos puertos**: probablemente QC-22, o quien añada
  los movimientos de inventario.
  **El hecho:** los adaptadores driven (`product-prisma.ts`, `presentation-prisma.ts`) usan el
  cliente Prisma **global**, porque los puertos de `design.md > 7` no reciben
  `Prisma.TransactionClient`. Consecuencia: una llamada al adaptador **dentro** de
  `prisma.$transaction(...)` **no participa** de esa transacción y hace COMMIT real.
  **Lo que obligó a hacer en T14:** los tests que verifican una restricción de la base (R7, y toda
  `presentation-uniqueness.int.test.ts`) sí usan `tx` + `SAVEPOINT` + `ROLLBACK` como manda la
  doctrina de `inventario-constraints.int.test.ts`; pero los que ejercitan **el adaptador de
  verdad** usan **fixtures reales con borrado explícito por id en `finally`**. Es una desviación
  consciente de esa doctrina, declarada en `progress/impl_QC-20-crud-de-productos.md`.
  **Evidencia de que hoy no se fuga nada:** dos pasadas seguidas dan **106/106 idénticas**, y el
  recuento posterior de `products`, `presentations` y `users` es **0, 0, 0**. Verificado además de
  forma independiente por el leader contra la base, junto con el índice único y las tres FK con
  `confdeltype='r'`.
  **El coste honesto:** un test interrumpido entre el fixture y su `finally` puede dejar filas.
  **Acotado**: la base es **propia de este worktree** (`QuimiCloude_QC20`), así que no alcanza a
  ninguna otra sesión — que es exactamente para lo que se montó.
  **Por qué no se arregló en QC-20:** la salida limpia es que los puertos acepten un
  `TransactionClient`, y eso **cambia la firma de los cinco métodos de `ProductRepository`** (y de
  los cuatro de `PresentationRepository`). Es rediseño, no alcance de T14, y tocar una firma de
  puerto es justo el cambio que `vitest related` no propaga a sus llamadores.
- **[QC-12 — la verificación visual multiplataforma no la hizo nadie con ojos]** No hay navegador
  con emulación de dispositivo en este entorno. Lo verificado es el HTML servido y jsdom a 375 y
  1280 px, más las guardias de que no hay alto de viewport fijo, ni `:hover`, ni controles. El
  reviewer lo dio por **aceptable con nota**, no por excepción: queda como **verificación humana
  pendiente**.
- **Las pruebas de mutacion sobre archivos de PRODUCCION no pueden correr en paralelo.** Al
  cerrar los menores de QC-8, tres subagentes trabajaban a la vez y **dos mutaron
  `session-cookie.ts` simultaneamente** para probar guardias distintas: uno quitaba
  `timingSafeEqual`, otro dejaba `clearSession` en no-op. En un sondeo intermedio el
  implementer se encontro **produccion mutada** y la restauro desde `HEAD` sin saber que su
  dueno iba a revertirla segundos despues. Acabo bien **solo** porque ambos caminos llevaban al
  mismo contenido y porque se comprobo antes que el unico diff era la mutacion — pero el riesgo
  real era **comitear produccion rota**, y ningun test lo habria cazado: el arbol estaba verde
  entre mutacion y mutacion. Regla a fijar en `/afinar-regla`: una prueba de mutacion se
  serializa o se hace sobre una copia, y **nunca** sobre un archivo que otro agente esta
  tocando. Ver `progress/impl_QC-8-sesion-actual-y-logout.md > Un apunte de proceso`.

- **[QC-9, ANTES de escribir `middleware.ts`] Las guardias no barren los `.ts` de la raíz del
  repo.** `tests/guards/guard-firma-sesion-unica.test.ts` (QC-8) usa
  `PRODUCTION_DIRS = ['lib','app','components','hooks']` y
  `tests/guards/guard-arquitectura-modulos.test.ts` (QC-15) usa el mismo
  `SCAN_ROOTS = ['app','components','hooks','lib']`. **Ninguna de las dos mira los archivos de
  primer nivel**, así que un `middleware.ts` en la raíz con su propio `createHmac` pasaría en
  verde: lo verificó el `reviewer` de QC-8 creando el archivo (2 passed) y borrándolo después.
  R5 dice «en el repositorio», no «en `lib/`». No es una regresión de QC-8 —es la misma
  limitación ya aceptada en la revisión de QC-15—, pero **`middleware.ts` es justo el archivo
  que QC-9 va a crear para verificar la firma de sesión en el runtime Edge**, o sea el candidato
  número uno a segunda implementación del HMAC, que es exactamente lo que R5 prohíbe.
  **QC-9 debe ampliar los dos barridos a los `.ts` de primer nivel antes de escribir ese
  archivo.** Menor 4 de `progress/review_QC-8-sesion-actual-y-logout.md`.

- **El repo no tiene `.gitattributes` y eso fabrica conflictos falsos.** `core.autocrlf`
  está en `false` y los archivos conviven con fines de línea mezclados: `progress/current.md`
  está guardado en **CRLF** y `history.md`, `db/schema.prisma`, `package.json` y
  `feature_list.json` en **LF**. Cuando una rama reescribe un archivo entero cambiando el fin
  de línea, git no puede alinear ni una línea con el ancestro y el archivo choca **completo**,
  tapando el cambio real — y de paso puede colar un borrado accidental sin que nadie lo vea.
  Pasó tres veces al cerrar QC-14 (ver historial). Se resuelve con `* text=auto eol=lf` y una
  normalización única del árbol. **Entra por `/afinar-regla`**, no a mano.
  **Y las herramientas obvias para diagnosticarlo MIENTEN** — verificado el 2026-09-02 por dos
  sesiones por separado, cada una por su cuenta: `grep -c $'\r' archivo` **no interpreta el
  patrón** y acaba contando **todas** las líneas, así que un archivo sin un solo CR devuelve el
  total y parece perfecto; `file` tampoco reporta CRLF de forma fiable en archivos con líneas
  muy largas. Lo que **sí** funciona: **`xxd`** sobre la primera y la última línea —mirar si
  terminan en `0d0a` o en `0a`— y **`git diff --numstat`**, donde un cambio de dos líneas que
  sale como «983 insertadas / 971 borradas» significa que se convirtió el archivo entero.
  Además, en este repo **`awk` y `sed -i` reescriben `current.md` de CRLF a LF sin avisar**: al
  cerrar QC-8 estuvieron a punto de colar el **cuarto** conflicto de archivo completo del día.
  Para editarlo, herramienta que preserve los bytes, y comprobar el `--numstat` antes de
  commitear.
- **`docs/jira.md` llama *Hecho* a la columna que en el board se llama *Finalizado*** (status
  id `10003`, transición `41`). Verificado el 2026-09-02 al cerrar QC-14. Es el mismo tipo de
  desajuste ya anotado para *Spec en revisión* / *En revisión*: el mapeo a `done` es correcto,
  pero el nombre literal no existe en el board.
- **`docs/jira.md` llama *Spec en revisión* a una columna que en el board se llama *En
  revisión*** (status id `10002`). Verificado el 2026-09-01 al mover QC-14. Es solo el nombre —
  el mapeo a `spec_ready` es correcto y no hay otra columna que se le parezca— pero un leader
  que busque la columna por su nombre literal no la encuentra. Corregir `docs/jira.md` o
  renombrar la columna.
- **Dos deudas de este archivo estaban desactualizadas y se corrigen aquí (2026-09-01).**
  `dev` local **no** está 52 commits por detrás de `origin/dev`: está **1 adelante, 0 atrás**
  (el commit de siembra `5708bc3`, sin pushear). El conflicto de contenido de
  `progress/current.md` se resolvió solo al mergear el PR #8. Y `lib/modules/` de QC-15 sí está
  en el árbol principal.
- **La siembra de `/afinar-feature` vive en un commit sin pushear.** `5708bc3` está solo en
  `dev` local: cualquier worktree montado desde `origin/dev` nace **sin** los `requirements.md`
  de QC-6, QC-14 y QC-19. Al montar el de QC-14 hubo que hacerle `git merge dev` encima; sin
  eso el `spec_author` no habría visto ninguna de las 17 decisiones cerradas. Se arregla
  pusheando `dev`, y mientras tanto es una trampa para la próxima feature sembrada.

- **[feature 4 — memoria y concurrencia en Vercel]** Con los parámetros vigentes cada verificación
  de contraseña reserva ~64 MiB y tarda ~750 ms en la máquina de referencia. No hay dato en `docs/`
  sobre el plan de Vercel ni sobre la memoria configurada de las funciones, así que el número de
  logins concurrentes por instancia está sin acotar. **Hay que confirmarlo antes de la feature 4.**
  Si la memoria resultara baja, la salida es bajar al conjunto equivalente `{ n: 32768, r: 8, p: 3 }`
  (`specs/2-.../design.md > 3.3`), no cambiar de algoritmo.
  (Pregunta abierta 3 de `specs/2-hash-y-verificacion-de-contrasena/requirements.md`.)
- **[feature 4 — rehash en el login]** El formato del hash permite detectar parámetros viejos, pero
  regenerar el valor es una **escritura** en `users`, fuera del alcance de la feature 2. Falta
  decidir si la feature 4 rehashea al vuelo en cada login exitoso o si la rotación es un script
  puntual. El formato soporta las dos; por eso el módulo **no exporta `needsRehash`**.
  (Pregunta abierta 4 de `specs/2-hash-y-verificacion-de-contrasena/requirements.md`.)
- **[arnés — worktrees sin artefactos generados]** Un worktree recién montado no puede pasar
  `pnpm typecheck`: le faltan `node_modules`, el cliente de Prisma y los tipos de Next. Hoy hay que
  correr a mano `pnpm install --frozen-lockfile`, `pnpm exec prisma generate` y `pnpm exec next
  typegen`. Candidato a que lo haga `scripts/wt.sh new`.
- **[QC-8 — el logout borra la cookie, no revoca el token]** La sesion es un token firmado sin
  estado, no una fila en una tabla: no hay revocacion. El logout de QC-8 borrara la cookie del
  navegador, pero un valor ya firmado que alguien hubiera copiado sigue siendo valido hasta su
  `exp` (8 h). Riesgo acotado y reversible: migrar a sesiones opacas toca **solo**
  `session-cookie.ts` y el lector de QC-8; el dominio y los puertos no se enteran.
  (`specs/QC-7-.../design.md > 6.2`.)
- **[QC-7 — bloqueo POR CUENTA, sin limite por IP]** Cualquiera puede dejar fuera a un usuario
  conocido hasta 60 minutos con 5 intentos fallidos. **Riesgo de DoS dirigido asumido
  explicitamente por el humano el 2026-09-01** (D12): ERP de un solo tenant, usuarios conocidos
  y sin registro publico. El limite por IP se ofrecio y se descarto: sobre Vercel la IP llega
  por `x-forwarded-for`, falsificable si el borde no esta bien configurado, y daria una
  sensacion de proteccion que no es real. (`design.md > 6.5`.)
- **[QC-7 — un usuario bloqueado no sabe que lo esta]** El mensaje es el generico, sin
  excepcion: un "cuenta bloqueada" delataria que el nombre de usuario existe. Coste real para
  el usuario legitimo, hasta 60 minutos sin entender por que. **Revisar cuando exista la
  recuperacion de contrasena** (hoy `FORGOT_PASSWORD_ROUTE` da 404, deuda de QC-10): avisar por
  correo al dueno de la cuenta es el canal que no filtra nada a terceros. (`design.md > 5.5`.)
- **[QC-7 — el nivel de escalada no decae con el tiempo]** Solo baja con un login exitoso. Una
  ventana de "buen comportamiento" (bajar un nivel tras 24 h sin fallos) exigiria una cuarta
  columna con la fecha del ultimo fallo y una regla mas que testear, para acotar algo que ya
  esta acotado en 60 minutos. Si el humano lo quiere, es una columna y una linea.
- **[QC-4 / arnes — un test de integracion afirma sobre el estado GLOBAL de la tabla]**
  `identity-constraints.int.test.ts` usa `expect(await tx.user.count()).toBe(0)` en tres
  puntos. Al aparecer el segundo archivo de integracion (QC-7) eso se convirtio en una carrera:
  ver `progress/impl_QC-7-login-usuario-y-contrasena.md > 6.2`. **Contenido** serializando
  `tests/integration/` en `vitest.config.mts`, no reparado: el arreglo de fondo es acotar esa
  asercion a sus propias filas, y es de QC-4. Ojo, la serializacion vale **dentro de una
  corrida**; dos procesos de vitest a la vez contra la misma base siguen chocando.
- **[arnes — el `.env` del repo no tiene `DIRECT_URL`]** `db/schema.prisma` la declara y sin
  ella `prisma migrate` falla con `P1012`. `.env.example` si la documenta: el incompleto es el
  `.env` real. Se anadio a mano en el worktree de QC-7 (base local en `localhost:5432`, o sea
  el mismo valor que `DATABASE_URL`). Candidato a que lo cubra `scripts/wt.sh new` junto con el
  resto de artefactos generados.
- **[QC-7 — el registro del fallo bajo contencion extrema puede perder un intento]** El contador
  se escribe con compare-and-set y hasta 10 reintentos con relectura (`design.md > 5.7`). Si los
  10 pierden la carrera, ese intento no se cuenta. **No es una perdida del bloqueo**: el contador
  es monotono y el bloqueo acaba disparandose igual; es un intento sin contar bajo contencion
  brutal. Se acepta frente a las alternativas —meter la tabla de escalada en SQL, o obligar al
  dominio a correr dentro de una transaccion— que estan descartadas y razonadas en `design.md > 5.7`.
- **[arnes — un E2E interrumpido deja basura que pone rojo el gate de otra feature]** Un
  `pnpm run e2e` cortado a medias (al reviewer se lo corto el disco lleno) dejo 4 usuarios y 4
  roles `qc7_e2e_*` huerfanos, y eso puso **9 tests rojos** en `identity-constraints.int.test.ts`,
  que afirma que la tabla `users` esta vacia. Mitigado en QC-7: el `afterAll` del E2E borra por
  prefijo y no por ids en memoria, cada borrado aislado, y hay barrido defensivo de huerfanos de
  mas de una hora al empezar. **La causa de fondo sigue siendo la misma que obligo a serializar
  la integracion**: un test de QC-4 que afirma sobre el estado global de la tabla.
- **[QC-7 — el CAS del login no puede pisar un bloqueo vigente, y el porque]** El predicado del
  compare-and-set compara los enteros por igualdad y el bloqueo por **rango**
  (`locked_until IS NULL OR <= now`). No es cosmetico: sin esa condicion, el par
  `(failed_login_attempts, lock_level)` sufre un **ABA** —`(0,1)` es a la vez bloqueo fresco y
  bloqueo caducado— y un intento con estado obsoleto **borraba un bloqueo activo**, o sea que un
  atacante bloqueado podia desbloquearse. Detectado por el reviewer ejecutandolo, cerrado con la
  condicion de rango y con test discriminante. **Quien toque ese `where` en QC-8 o QC-9 tiene que
  leer `design.md > 5.7` antes**: la version anterior de ese documento declaraba el caso imposible
  con una premisa falsa.

Cerradas, para que nadie las busque abiertas: la pregunta 3 de la feature 1 (columnas
`password_algorithm` / `password_updated_at`) se responde **NO** en `specs/2-.../design.md > 8`, y la
pregunta 5 (pepper) la cerró el humano el 2026-08-06 con un no (`design.md > 8.1`).
- ~~No hay `.env` ni `DATABASE_URL`~~ → **resuelto el 2026-08-06** por el humano.
  ~~Ni `.env.example`~~ → lo añadió la feature 1, con placeholders y sin credenciales.
  Sigue sin decidirse qué Postgres usa **CI**, solo el local. Y los worktrees nuevos
  necesitan que se les copie el `.env` a mano; `scripts/wt.sh new` no lo hace.
- **Worktree 1 a medio desmontar.** `./scripts/wt.sh done 1-modelo-usuarios-y-roles`
  falló: eliminó el registro de git y el `.git` del worktree, pero **no pudo borrar el
  directorio** `.worktrees/1-modelo-usuarios-y-roles/` («Device or resource busy» en
  dos intentos, algún proceso lo tiene abierto en Windows). No se forzó. Comprobado
  antes de rendirse que **todo su contenido está en `origin/dev`** salvo
  `tsconfig.tsbuildinfo`, que es un artefacto de build: no hay trabajo que perder.
  La rama local ya se borró. Queda borrar la carpeta a mano cuando se libere.
- **Antes del primer deploy** (heredado de la feature 1): verificar que el rol de
  Prisma en Supabase tenga BYPASSRLS. Con `FORCE` RLS y cero policies, si no lo tiene,
  toda query de la app devuelve vacío.
- **Feature 8 — fase 2 bloqueada por la 7.** La implementación de la 8 no arranca
  hasta que la feature 7 esté `done` y su base esté en `dev` (shadcn/ui inicializado,
  Vitest, `components/ui/`). El spec la trata como precondición heredada y su T0 falla
  ruidosamente si falta. Motivo completo en `## Evaluaciones > Feature 8`.
- **Feature 8 — E2E diferido** por decisión humana del 2026-08-06: la zona privada no
  tiene ninguna pantalla que visitar todavía (la primera es la feature 9). Hay que
  retomarlo cuando exista, en la 9 o en la 10.
- **Feature 8 — ítems de navegación de ejemplo.** Los 5 ítems quemados (Dashboard,
  Inventario, Notificaciones y dos con submenú) son **placeholder** con rutas que hoy
  dan 404. Cada feature de módulo debe sustituir el suyo; si el backlog crece sin que
  nadie los toque, quedan como enlaces rotos.
- **Feature 8 — el «modo icono» no muestra iconos.** El tipo `NavItem` no tiene campo de
  icono, ni en el spec aprobado, así que el modo colapsado deja el texto recortado en vez
  de iconos. La implementación es **conforme al spec**; el hueco es del spec. Decisión
  pendiente: añadir el campo y los iconos (cambia `NavItem`, la colección de ejemplo y los
  tests de R24-R27) o aceptar el recorte.
- **Feature 8 — la costura con la 10 son DOS archivos, no uno.** El design dice que
  `lib/services/session-stub.ts` es el único que la feature 10 reescribe; también tendrá
  que tocar `lib/actions/logout.ts` (el `redirect`), lo que romperá a propósito las
  guardias de R22/R35. Ninguno de los dos es UI, así que el criterio de «cero archivos de
  UI tocados» se mantiene — pero la 10 debe saberlo antes de empezar.
- **Feature 8 — atajo global Ctrl/Cmd+B.** El `SidebarProvider` lo trae de fábrica: ningún
  requisito lo pide y no tiene test. Queda anotado para que no aparezca luego como
  comportamiento fantasma. Desactivarlo exigiría editar `components/ui/`.
- **Feature 8 — `design.md > 5.5` contiene una afirmación falsa** ya corregida en la
  implementación: dice que el `SidebarProvider` lee la cookie `sidebar_state` al montar, y
  no la lee nunca (sólo la escribe). R28 se resolvió leyéndola en el layout de servidor.
  Si alguien vuelve al design a documentarse, leerá algo que no es cierto.
- **Feature 7 — shadcn ahora genera sobre Base UI, no Radix.** Al inicializar shadcn en
  este repo (2026-08-06) el CLI usó **Base UI** por defecto. Todo `components/ui/` que
  vino detrás (y el que generen las features 8 y 9) sale sobre esa base, no sobre Radix
  como asumía `docs/architecture.md`. No es un defecto, pero es la convención real del
  repo a partir de ahora: hay que actualizar `docs/architecture.md` o dejarlo escrito
  antes de que alguien genere componentes asumiendo Radix.
- **Feature 7 — `sonner` vs el `toast` nuevo de shadcn.** Se instaló `sonner` siguiendo el
  spec, pero el `toast` de shadcn ya no es el legacy deprecado que el `design.md` asumía:
  hoy es uno nuevo sobre Base UI y plenamente vigente. La decisión quedó tomada sobre una
  premisa desactualizada. Funciona y está testeado; revisar si se consolida `sonner` como
  el estándar del repo o se migra antes de que las features 8/9/10 lo repliquen.
- **Feature 7 — falta revisión visual humana.** `shadcn init` reescribió `app/globals.css`
  y dejó un `--font-sans` circular que rompía la tipografía; se corrigió, pero **nadie ha
  mirado `/` ni `/login` en el navegador**. Los tests no cubren aspecto. **Ya está mergeado
  en `dev` sin esa revisión**: sigue pendiente y ahora afecta a lo que construyan la 8 y la 9
  encima.
- **Feature 7 — enlace de recuperación de contraseña sin destino.** R22 maqueta el enlace
  apuntando a `/recuperar-contrasena`, que hoy da **404**. Ninguna feature del backlog
  cubre la recuperación: hay que darla de alta o el enlace queda roto en producción. El
  slug tampoco está confirmado por el humano.
- **Feature 7 — la firma del stub se quedará corta en la feature 10** (hallazgo menor M5
  del reviewer). `lib/services/login-stub.ts` es el único archivo que la 10 sustituye,
  pero su firma actual no contempla todo lo que la autenticación real necesitará. Revisar
  al especificar la 10.
- **Feature 7 — E2E del camino feliz diferido** a la feature 10, por default aprobado con
  el spec: hoy no hay `/dashboard` (feature 9) ni auth real al que llegar. Aquí solo se
  cubre el destino de la redirección.
- **Worktree huérfano: `.worktrees/1-modelo-usuarios-y-roles`.** Carpeta **vacía** que git ya
  no registra como worktree; `rm` falla con «Device or resource busy» (algún proceso de
  Windows la tiene tomada). No bloquea nada y no contiene trabajo. Se anota en vez de
  forzarla, como manda `AGENTS.md > F2.5`. Se borra sola al reiniciar o cerrando el proceso
  que la retiene. La de la feature 7 sí se pudo limpiar.
- **Convención nueva (2026-08-06): componentes de ruta en `components/` con barrel.**
  Cada ruta agrupa sus componentes propios bajo `<ruta>/components/` con un `index.ts` que
  los reexporta; `page.tsx` importa desde el barrel, nunca por ruta profunda, y en la raíz
  de la ruta solo quedan archivos del App Router. Escrita en
  `docs/architecture.md > Componentes`, añadida a los anti-patrones que el reviewer rechaza
  y a `.claude/agents/frontend_dev.md`. Sincronizada con `harnessConfig/`. Aplicada ya a
  `app/(public)/login/` en el PR #2.
  **Pendiente de arrastre:** los specs de las features **8 y 9 se escribieron antes** de
  esta regla, y la 8 ya está `spec_ready` con el spec aprobado. Sus `tasks.md` y `design.md`
  describen rutas de archivo que ya no cumplen la convención — hay que revisarlos antes de
  arrancar su fase 2, o el reviewer las rechazará por anti-patrón.
- **`dev` local divergió de `origin/dev` (2026-09-01).** El local tiene 1 commit sin pushear
  (`7914cd1`, «integrar Jira, guardias de dependencias y renumerar specs») y `origin/dev` tiene
  **35** que el local no tiene. `git merge --ff-only` aborta. No se forzó ni se commiteó nada:
  el árbol de trabajo tiene además cambios sin commitear del arnés (contrato `key`, épicas).
  **Decisión humana pendiente**: mergear `origin/dev` en el local resolviendo a mano, o
  rebasar ese commit. Mientras tanto no bloquea: el worktree de QC-15 se montó **desde
  `origin/dev`**, así que trabaja sobre la base correcta y completa.
- **Worktree `11-layout-privado-con-sidebar` retenido.** `wt.sh done` devolvió HOLD por árbol
  sucio: 3 renombrados staged de `specs/8-…` a `specs/11-…`. No se forzó, como manda
  `AGENTS.md > F2.5`. Ese renombrado ya está hecho en el worktree principal, así que lo de
  dentro es trabajo duplicado y no hay nada que perder; se puede descartar y desmontar, pero
  eso es descartar cambios y lo decide el humano.
- **QC-15 es `fullstack` y sigue SIN partir.** La partición de `AGENTS.md > Partición de
  fullstack` se evaluó y se decidió no aplicarla: media reestructuración mergeada deja el repo
  con dos estructuras conviviendo, que es justo lo que la feature existe para evitar. Queda
  registrado para que el `reviewer` no lo marque como incumplimiento.
- **`harnessConfig/` está en `.gitignore:12`, así que `harnessConfig/hexagonal/` NO viaja por
  git.** Descubierto el 2026-09-01 al copiar ahí la guardia. Vive solo en este disco. Si la
  intención es que la configuración hexagonal sea reutilizable en otro proyecto o por otra
  persona, hay que **decidir**: sacar `harnessConfig/` del `.gitignore`, versionar solo
  `harnessConfig/hexagonal/` con una excepción (`!/harnessConfig/hexagonal`), o moverla a un
  repo aparte. Mientras tanto, un `git clean -xdf` se la lleva por delante.
- **`dev` local está 52 commits por detrás de `origin/dev`.** El `git merge --ff-only` aborta
  por un solo archivo: `progress/current.md`, que tiene cambios sin commitear míos y del que
  `dev` añade 20 líneas de deudas de features anteriores. La divergencia de commits **ya se
  resolvió sola** (`7914cd1` llegó a `origin/dev` dentro del PR #8): queda solo el conflicto
  de contenido. No bloquea trabajo nuevo —los worktrees se montan desde `origin/dev`— pero
  conviene resolverlo antes de la siguiente feature.
- **Trabajo del arnés sin commitear en el worktree principal**, independiente de QC-15 y
  pendiente de su propio commit: el contrato `key` (identidad por issue key de Jira),
  las épicas (`epic` en `feature_list.json` + filtro `issuetype != Epic` en F0), y las
  guardias nuevas del validador. Conviven con ediciones tuyas en `CLAUDE.md`, `docs/specs.md`,
  `spec_author.md` y el comando nuevo `afinar-feature`, que **no toqué**.
- **`harnessConfig/hexagonal/` creada el 2026-09-01**, tras aprobarse el `design.md` de QC-15
  y derivada literalmente de él: contrato estructural (`docs/architecture-hexagonal.md`),
  fragmentos para `backend_dev` / `frontend_dev` / `reviewer`, y `plantilla-modulo/`. Es
  **aditiva y opcional**: no toca el flujo del arnés, solo dónde vive el código.
  **Falta la guardia**: `tests/guards/guard-arquitectura-modulos.test.ts` se copia ahí
  **cuando QC-15 cierre**, no antes — una guardia que nadie ha visto en rojo no está
  verificada. Mientras tanto, `hexagonal/tests/guards/README.md` documenta los cinco
  bloques que comprueba. **Pendiente**: hacer esa copia en F2.5.
- **Convención nueva (2026-09-01): el backlog se agrupa por épicas, y la épica es el módulo.**
  Tres épicas en el board — `QC-16` Plataforma, `QC-17` Identidad y acceso, `QC-18`
  Inventario — y las 12 features colgadas de la suya por el campo `parent`.
  `feature_list.json` lleva `epic` con el key de la épica. **Agrupa, no bloquea**: el orden
  lo siguen marcando `depends_on` y la regla de máx. 2 `in_progress` por zona, que se
  cuentan sobre features y nunca por épica.
  La frontera de cada épica es la misma que la del módulo hexagonal que crea `QC-15`, con
  una excepción consciente: **Plataforma no es un módulo de dominio**, es el armazón donde
  se montan los demás, y conviene que sea la única excepción o se convierte en el cajón de
  todo lo transversal. Por eso la pantalla de login (`QC-10`) está en Identidad y no en
  Plataforma aunque sea UI: es un adaptador del módulo de identidad.
  **El agujero que esto abría, ya cerrado:** F0 importaba con `project = QC` a secas y
  habría metido las tres épicas en `feature_list.json` como features fantasma. El filtro es
  ahora `project = QC AND issuetype != Epic` (`AGENTS.md > F0`), y el validador tiene una
  guardia que lo caza sin red: si el `epic` de una ficha apunta al `key` de otra ficha del
  mismo archivo, es que una épica se importó como feature.
- **Convención nueva (2026-09-01): la identidad de una feature es el `key` de Jira.**
  `feature_list.json` lleva ahora `key` (`QC-15`) como primer campo; el `id` numérico queda
  **solo como fallback** para una ficha que aún no tiene issue, y el validador exige que
  coincida con el número del key. `depends_on` se escribe con keys, y `branch`, `spec_path`
  y `.worktrees/` se derivan de `feature/<key>-<slug>`. Escrita en
  `docs/jira.md > El contrato de campos`, propagada a `AGENTS.md` (F0 y F1.0),
  `.claude/agents/leader.md` y `scripts/wt.sh`; sincronizada con `harnessConfig/`.
  **Pendiente de arrastre:** por decisión humana **no se renombró nada de lo que ya existía**,
  así que conviven dos convenciones en disco — `specs/4-…`, `specs/10-…`,
  `specs/11-…` y los worktrees `5-…` y `11-…` siguen con el nombre numérico, y solo
  lo nuevo nace como `QC-<n>-<slug>`. El validador acepta los dos prefijos a propósito; si
  algún día se quiere unificar, es una tanda de renombrados con sus ramas, no un parche de
  markdown.
- **`branch` y `spec_path` de tres fichas estaban apuntando a carpetas borradas.** Al
  reescribir el JSON se corrigieron contra lo que hay en disco: QC-4 → `specs/4-…`,
  QC-10 → `specs/10-…`, QC-11 → `specs/11-…` y `feature/11-layout-privado-con-sidebar`
  (el JSON decía `feature/8-…`, que es la rama vieja). Las ramas ya mergeadas de QC-4 y
  QC-10 se conservan con su nombre histórico: renombrarlas no arregla nada y rompe la
  trazabilidad del PR.
- **Feature 8 — la zona privada se queda sin toasts.** Decisión humana del 2026-08-06
  («no lo agregues por ahora»). Si una feature privada necesita notificaciones, ahí se
  decide dónde montar el `<Toaster />` — la 7 solo montó el de la zona pública.
- **Feature 5 — el tope de 64 caracteres no está en el input del formulario.** El máximo vive
  en el schema zod (`lib/types/auth.ts`), así que el usuario puede escribir 100 caracteres y
  solo recibe el error al enviar. Falta el `maxLength` en el `Input` de `/login`; es zona de
  `frontend_dev` y quedó fuera del alcance de una feature de backend.
- **Feature 5 — fuga de temporización en `verifyPasswordHash`.** Un `storedHash` que no casa
  el formato de bcrypt devuelve `false` de inmediato, frente a ~10² ms de uno válido: es un
  oráculo de enumeración de usuarios por canal lateral. **Se resuelve en la feature 7
  (login)**, no en el módulo — el arreglo es que el login gaste el mismo tiempo haya o no
  usuario, no que este helper mienta sobre el suyo.
- **Feature 5 — `CREDENTIAL_MAX_LENGTH` es más ancho que lo que restringe.** Solo acota la
  contraseña; `username` no tiene máximo. `SECRET_MAX_LENGTH` sería más preciso y esquiva
  igual la guardia `guard-password-never-plaintext`, que es lo que obligó a apartarse del
  `PASSWORD_MAX_LENGTH` que pedía el spec. Rename de 4 sitios, sin decidir.
- **Feature 5 — `bcryptjs` sin registro de dependencias.** `docs/dependencias.md` no existe
  en el repo, así que hoy no es exigible; si esa tabla se crea, `bcryptjs` necesita su fila.
- **`scripts/wt.sh new` deja el worktree a medio montar, y ya van dos features.** No copia
  `.env` (la 1 y la 2 lo hicieron a mano) y no genera el cliente de Prisma: en la feature 5 el
  `pnpm install` dejó `node_modules` sin `.prisma/client` y el gate completo cayó en una suite
  de integración por eso, no por el cambio. Se arregló con `pnpm exec prisma generate --schema
  db/schema.prisma`. Es trabajo del script, no del que monta el worktree.
- **Lección de la feature 5, para las que vienen: elegir la primitiva en vez de la librería
  fue lo que generó el 80% del código.** La primera versión implementaba scrypt de
  `node:crypto` a mano y llegó completa y revisada hasta el PR, donde el humano la paró.
  Casi todo lo que tenía —formato de almacenamiento, parseo, validación de parámetros de
  coste, comparación en tiempo constante— no respondía a ningún requisito del producto:
  reconstruía a mano lo que una librería de hashing ya trae hecho. Cuando un spec crezca a
  18 requisitos para una feature marcada `complexity: low`, esa desproporción es la señal.
- **QC-7 la lleva otra sesión en paralelo.** Al arrancar QC-6 apareció un worktree
  `.worktrees/QC-7-login-usuario-y-contrasena` que este leader no montó, con QC-7 marcada
  `pending`; una hora después la ficha ya estaba en `spec_ready` con `zone: backend` sin que
  este leader la tocara. **No es huérfano: hay otra sesión trabajándola.** Consecuencia para
  el cupo: cuando QC-7 pase a `in_progress`, la zona `backend` tendrá dos (con QC-6) y ahí se
  agota el máximo — QC-19 tendrá que esperar. Antes de lanzar el implementer de cualquiera de
  las dos hay que validar intersección de archivos: el seed toca el catálogo de roles y el
  arranque de la base, QC-7 toca `verifyCredentials` y el adaptador de sesión.
- **Carpeta huérfana de la numeración vieja.**
  `.worktrees/1-modelo-usuarios-y-roles/` no tiene worktree registrado detrás (`git worktree
  list` no la lista): es borrable a mano, pero no sin que un humano lo confirme.
- **`.worktrees/fix-login-field-control-uncontrolled` está SAFE y nadie lo desmonta.**
  `wt.sh list` lo da como mergeado en `origin/dev` y desmontable. No pertenece a ninguna
  feature del board, así que ningún paso F2.5 va a llegar a él: se queda hasta que alguien
  corra `./scripts/wt.sh clean --force`.

### Anotadas por QC-21 — ayuda-visual-de-contrasena (2026-09-02)

- **`guard-password-never-plaintext` es CIEGA a las propiedades opcionales.** Destapado por el
  reviewer de QC-21 rompiendo el codigo a proposito: `readonly password: string;` sale ROJO, pero
  **`readonly password?: string;` sale VERDE**. El `?` separa el identificador de los `:`/`=` que
  exige el regex de `declaredIdentifiers`
  (`/(?:^|[{,;(])\s*(?:readonly\s+)?['"]?([A-Za-z_$][\w$]*)['"]?\s*[:=]/gm`), asi que el
  identificador no se captura. **La forma exacta que lo evade es `nombre?:`** — es decir, toda
  propiedad opcional de TypeScript. No es solo cosa de QC-21: la guardia barre `db/`, `lib/`,
  `app/` y `scripts/`, y en los cuatro es ciega a la misma forma. QC-21 lo tapo **solo para sus
  tres archivos** con un centinela local (`ninguna propiedad opcional nueva nombra la contrasena
  sin acabar en hash`), sin tocar ni relajar la guardia. **Ampliar la guardia es
  `/afinar-regla`**, no una ficha de producto.
- **`guard-password-never-plaintext` no barre `components/`.** R22 de QC-21 lo cubre solo para sus
  tres archivos; cualquier otro componente del repo sigue fuera del barrido. Tambien
  `/afinar-regla`.
- **Importar el detector desde el archivo de la guardia duplica la ejecucion de sus 6 tests.**
  `tests/unit/credential-help-contract.test.ts` importa `findPlaintextPasswordDeclarations` de
  `tests/guards/guard-password-never-plaintext.test.ts` (lo exige `design.md > 8.3`, para heredar
  el criterio en vez de copiarlo). Como ese archivo tiene `describe` de nivel superior, sus 6
  `it(...)` se registran tambien bajo el importador y **se ejecutan dos veces**, inflando el conteo
  de la suite. No rompe nada. La solucion limpia —extraer el detector a un modulo no-test que la
  guardia reexporte— toca un archivo de guardia compartido: `/afinar-regla`.
- **Altura del campo por debajo de 44x44 px.** `credential-field.tsx` renderiza
  `components/ui/input.tsx` sin editar (`h-8` = 32 px) y `docs/architecture.md > Interaccion` pide
  44x44. Excepcion declarada en `design.md > 6` + pregunta abierta 4 de QC-21. El `font-size` si
  cumple (16 px en movil). **Subirlo es alcance de QC-29/QC-30** y debe cerrarse antes de que
  QC-36 ponga el componente delante de un usuario.
- **Nadie ve el componente de QC-21 hasta QC-36**, y **`components/shared/` se estrena con un
  componente que hoy usa cero features** (`design.md > 2.1`). Deuda aceptada por escrito en la
  fila 1 de las decisiones cerradas.
- **`scripts/validate-features.mjs` no resuelve `.worktrees` desde dentro de un worktree.**
  `WT_DIR = '.worktrees'` (linea 18) se resuelve contra el cwd, asi que `./init.sh` aborta dentro de
  cualquier worktree con `faltan specs para features sdd en vuelo: <otra feature>` — QC-21 convivio
  con ese rojo por decision humana del 2026-09-02. Desde la raiz pasa en verde. `/afinar-regla`.
