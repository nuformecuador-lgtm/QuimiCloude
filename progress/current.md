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
| QC-58 | timeout-tests-ui-bajo-carga | Inventario | frontend | in_progress | feature/QC-58-timeout-tests-ui-bajo-carga | **17/17 tasks, `d1e966d`**. T11: cinco `./init.sh` completos seguidos, **las cinco exit 0** (234/234 archivos, 2839 casos). R9 y R13 reformulados conservando la redaccion anterior. `reviewer` corriendo (F2.2). Base propia `QuimiCloude_QC58` montada — el worktree venia sin `.env` |
| QC-65 | estado-de-cuenta-de-usuario | Identidad y acceso | backend | in_progress | feature/QC-65-estado-de-cuenta-de-usuario | **Spec aprobado por el humano el 2026-09-08** (F1.4), tarjeta en *En curso*. Rama sincronizada con `origin/dev` ANTES de implementar, para no chocar con los tests del seed que QC-38 acababa de tocar. `implementer` en curso (F2.1) |
| QC-39 | pantalla-de-unidades | Catálogos | frontend | in_progress | feature/QC-39-pantalla-de-unidades | **Spec aprobado por el humano el 2026-09-08** (F1.4). 50 requisitos EARS, 35 decisiones cerradas, cero preguntas abiertas. `implementer` en curso (F2.1). **Conflicto acotado con QC-58**: la tarea que amplía `app-sidebar.test.tsx` y `private-layout-menu.test.tsx` va **al final**, cuando QC-58 esté `done` |
| QC-63 | ejecutar-receta-operador | Recetas | fullstack | pending | feature/QC-63-ejecutar-receta-operador | **F1.0 hecho el 2026-09-08**: worktree desde `origin/dev` (`516e9c0`), `complexity: medium`. **Pendiente F1.2**: la ficha trae una pregunta abierta escrita en el board y la partición `fullstack` sin decidir, así que toca `/afinar-feature` antes del `spec_author` |

### QC-47 — arranque del 2026-09-04 (F1.0)

Arrancada por decisión humana explícita («arranca con 47»), no por el orden de `id`. Zona
`backend`, `complexity: medium` y `depends_on: null` ya venían evaluadas del board; no hizo falta
empujar labels a Jira. Worktree montado desde `origin/dev` (`855fae6`) — **ojo: el `dev` local va
25 commits por delante de `origin/dev`**, así que el worktree nace sin los merges de `fix-ui` ni
los cierres de QC-52/QC-55. Se resuelve solo en F2.3, pero conviene saberlo antes de medir un
diff.

**Aviso de conflicto de archivos para F2.0, no para F1.** QC-34 (`backend`, `in_progress`) toca
`db/schema.prisma` y `lib/composition/index.ts`, que es exactamente donde va a caer el modelo de
empresa y membresías. La validación de `AGENTS.md > Paralelismo` se hace contra
`specs/<feature>/tasks.md`, que en F1.0 todavía no existe: por eso el spec se escribe igual —no
toca código— pero **la implementación de QC-47 no arranca hasta que QC-34 esté `done`**, o hasta
que sus `tasks.md` demuestren que no hay intersección real. Anotado aquí para que no se decida
dos veces.

**Base de datos propia pendiente.** Van cuatro veces que el drift de base entre worktrees bloquea
una feature, y QC-47 introduce migración nueva sobre `users`: cuando entre en F2, `QuimiCloude_QC47`
antes de la primera migración, no después.



La feature **QC-54 — unificar-constante-rol-administrador** se cerró el 2026-09-07 (PR #42, merge
`fa116cd`): resumen en `progress/history.md`, tarjeta a *Finalizado*. 17 requisitos con test y
`reviewer` **en una sola ronda** (0 mayores, 5 menores), que verificó abriendo los tests y probó
la guardia nueva con dos mutaciones propias. Deja **una sola** definición de «es Administrador»:
`ROLE_ADMINISTRADOR` en `identity/domain/roles.ts` y `requireAdmin` parametrizado por el error, con
`tests/guards/guard-rol-administrador-unico.test.ts` impidiendo la reincidencia. `wt.sh done` **volvió a fallar en Windows** —desregistró el worktree pero dejó el árbol en disco por las rutas largas de pnpm—, rematado con `rm -rf` + `git worktree prune`; van seis veces y sigue sin ficha.

**Desbloquea QC-74** (`modelo-de-permisos`), que nació hoy con `depends_on: QC-54` justo por esto:
sustituir una implementación de la regla es quirúrgico, sustituir las cinco copias era el trabajo
que esta ficha acababa de hacer. La zona `backend` queda sin ninguna feature `in_progress`.

**El árbol principal está 3 adelante y 10 atrás de `origin/dev`, y con cambios sin commitear.** Los
cierres de QC-35 y QC-48 ya están escritos en el `feature_list.json` local y **no en `origin/dev`**,
que sigue viéndolas `in_progress`; el de QC-54 se suma ahora al mismo montón. No se reconcilió aquí
a propósito —hay trabajo sin commitear de por medio— pero es lo primero que hay que resolver antes
de arrancar nada: `origin/dev` y el disco local no dicen lo mismo sobre tres fichas.

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

La feature **QC-55 — tabla-de-datos-compartida** se cerró el 2026-09-04 (PR #33, merge
`c2f61ec`): resumen en `progress/history.md`, worktree desmontado y rama borrada. 36 requisitos con
test y `reviewer` en dos rondas (RECHAZADO → APROBADO). **Nació en esta misma sesión**: la ficha no
existía en el board, y acotarla con `/afinar-feature` creó además **QC-56** y **QC-57**.

Lo que deja abierto, todo en QC-56 y escrito en su ficha del board: **la comprobación del `sticky`
anidado en Safari de iOS (T13)**, que allí es exigible y bloqueante —aquí no había pantalla que
abrir—; `DataTableColumn` sin ancho, así que todas las columnas caen en los 150 px por defecto;
`focusColumnFilter` sin acotar por `tableId`; y **cómo se declara una columna de acciones de fila,
sin lo cual la migración de productos no se puede completar**. **QC-57 sigue sin acotar**: hasta
que exista, el orden, los filtros y la búsqueda se emiten y nadie los honra.

**El aviso del gate sobre dos archivos del baseline que ya pasan** —`recipe-route-contract.test.ts`
y `module-contract.test.ts`— es deuda vieja de `dev` que se arregló sola. No se limpió desde QC-55
para no ensuciar su PR; sigue pendiente.

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

### QC-39 — F2.0: el conflicto con QC-58, medido y acotado (2026-09-08)

La validación de `AGENTS.md > Paralelismo` **falló**: el `tasks.md` de QC-39 y el diff de QC-58 se
cruzan en **dos archivos**, `tests/unit/app-sidebar.test.tsx` y
`tests/unit/navegacion/private-layout-menu.test.tsx`. No es una corazonada: se calculó la
intersección real entre los 31 archivos que el spec declara y los 50 del diff de QC-58.

**Qué hace cada una ahí.** QC-58 cambia `userEvent.setup()` por `setupUser()` —18 líneas entre los
dos, mecánicas y ya commiteadas—. QC-39 quiere **ampliarlos** para tensar sus anclas de seis ítems a
siete. El peligro concreto, y tiene nombre: **si los tests nuevos de QC-39 llaman a
`userEvent.setup()`, revierten a QC-58 en silencio** al mergearse las dos.

**Decisión humana**: arranca igual, y **la única tarea que toca esos dos archivos se deja para el
final**, cuando QC-58 esté `done`. R9 y R10 no pierden trazabilidad —su test principal es
`private-nav-unidades.test.ts`, que es archivo nuevo—, y los otros 29 archivos de la ficha no rozan
a QC-58. Al `implementer` se le dio la instrucción explícita de usar `setupUser()` del helper y
nunca `userEvent.setup()`.

### QC-63 — arranque del 2026-09-08 (F1.0)

Arrancada por decisión humana explícita («63»). Worktree montado desde `origin/dev` (`516e9c0`).
`zone: fullstack` venía del board; **`complexity` evaluada aquí como `medium`** y escrita como
label en Jira: son dos capas y varios archivos, con condiciones de verdad, pero sin integración
externa ni webhooks que la lleven a `high`.

**Lo que QC-62 y QC-64 le dejan hecho, y es lo que abarata la mitad frontend.**
`components/shared/step-reader/step-reader.tsx` recibe **todo por props** y su propia cabecera
dice literalmente que «**QC-63 podrá montarlo en la ruta del Operador pasándole otro `onFinish`
sin tocar una línea de aquí**». No lee datos, no importa `lib/composition`, ni Server Actions, ni
`next/navigation`, y un test de fuente lo afirma. La ficha monta el componente; no lo reescribe.

**Lo que sí es trabajo de backend real, medido en el código.** El Operador nace con **exactamente
un permiso**: `SEED_ROLE_PERMISSIONS[ROLE_OPERADOR] = ['inventario.consultar']` en
`identity/domain/permissions.ts`. Las dos pantallas de recetas cortan con
`requirePagePermission('recetas.consultar')`, y QC-74 decidió que **no hay implicación entre
permisos**: hoy el Operador recibe 404 en cualquier receta. Abrirle la lectura es tocar el
catálogo de permisos y/o el seed, no pintar una pantalla.

**Dos cosas quedan sin decidir y por eso no se lanza `spec_author` todavía:**

1. **La pregunta abierta que trae la propia ficha del board**: si el bloqueo de *Siguiente* —que
   en QC-62 impide avanzar mientras queden elementos sin marcar— necesita **una vía de escape con
   motivo escrito** cuando lo use un operario en turno. Registrar quién marcó qué y cuándo está
   fuera de alcance y eso sí está escrito.
2. **Si se parte en dos.** `AGENTS.md > Partición de fullstack` dice que una feature `fullstack`
   se parte en `backend` + `frontend` con `depends_on`. Aquí eso tiene un coste concreto: la zona
   `frontend` está **llena** (QC-58 y QC-39), así que la mitad frontend quedaría en cola detrás de
   dos fichas, mientras que como `fullstack` la zona está **vacía** y arranca ya. El precedente de
   QC-39 —que amplió un contrato de lectura y **no se partió**— apunta en la misma dirección. Se
   cierra al acotar, no aquí.

**Aviso de conflicto de archivos con el árbol principal.** `dev` local tiene sin commitear 27
archivos modificados y dos nuevos (`app/(private)/produccion/formulas/components/unit-group.ts` y
su test) que se autodescriben como «QC-26bis». Caen en `produccion/formulas/`, que es exactamente
donde trabaja esta ficha. No es conflicto de zona —no hay ninguna feature registrada que los
reclame— pero sí de archivos, y hay que resolver a quién pertenecen antes de F2.

### QC-39 — acotada con `/afinar-feature` (2026-09-08)

Alcance, 35 decisiones cerradas y **cero preguntas abiertas** en
`specs/QC-39-pantalla-de-unidades/requirements.md`. Esa es la fuente; aquí no se copia la tabla.

**Lo que la acotación corrigió del board**, y por eso se editó el issue antes de sembrar: la ficha
pedía que las unidades **de sistema se distinguieran visualmente** de las de la empresa, y el humano
decidió lo contrario — el ámbito es **manejo interno**, no hay columna que lo muestre y la única
señal es que esa fila **no trae botones**. También quedaron cerradas las cuatro cosas que la ficha
dejaba «para decidir al acotar»: panel lateral, sí a búsqueda/orden/paginación, los **dos** permisos
(`unidades.consultar` **y** `unidades.modificar`, porque QC-74 decidió que modificar no implica
consultar) y sí a E2E ligera, que cierra el diferimiento de QC-38.

**El hallazgo que cambia el tamaño de la ficha y no estaba anotado en ningún sitio**: la lista tiene
que pintar la equivalencia y saber si la unidad es de sistema, y **el contrato de lectura no trae ni
una cosa ni la otra** — `UnitRef` es `id`/`name`/`symbol` y `UNIT_SELECT` proyecta esos tres. La
amplía **esta ficha**, que sigue siendo `frontend` y **no se parte en dos**. Cumple de paso el
encargo que QC-38 dejó escrito en `unit-actions.ts`: «quien abre la puerta al contrato aquí es
QC-39».

### QC-39 — arranque del 2026-09-08 (F1.0)

Arrancada por decisión humana explícita («arranca 39»). Worktree montado desde `origin/dev`
(`516e9c0`), que **ya trae el merge del PR #47**: la ficha nació creyéndose bloqueada por QC-38 y no
lo está —el merge entró mientras se montaba—. `zone: frontend` venía del board; **`complexity`
evaluada aquí como `medium`** y escrita como label en Jira: son varias capas y varios archivos
(página, tabla, panel lateral, diálogo de borrado, más el paso de parámetros por la Server Action),
con condiciones de verdad —unidad de sistema vs. de empresa— y no un archivo suelto.

**Lo que QC-45 le deja resuelto y no se vuelve a decidir**: la familia de pantallas de Configuración
(tabla compartida de QC-55, búsqueda y orden de QC-57, panel lateral, E2E ligera), la sección
`CONFIGURACION` del menú ya creada con su ítem, y **la columna de acciones de fila** —la pregunta
abierta 4 de QC-55—, que se declara como columna normal con `pinnable: false`.

**El encargo que QC-38 le dejó escrito en el código, y es el hallazgo de este arranque.**
`listUnitsAction()` no acepta argumentos: pide el catálogo entero y su comentario dice literalmente
que **«quien abra la puerta al contrato aquí es QC-39»**, porque mientras no hubiera pantalla que
emitiera orden, filtro o página, exponerlo era un parámetro que nadie mandaba. El caso de uso
`listUnits(input, actor)` **ya** admite la consulta y devuelve `readonly UnitRef[] | Page<UnitRef>`,
así que el trabajo es el paso de parámetros por el adaptador, no lógica nueva. **Ojo al alcance**:
eso toca `lib/modules/unidades/adapters/driving/unit-actions.ts`, que no es UI. La ficha sigue siendo
`frontend`, pero conviene que el spec lo declare en vez de que aparezca a mitad de la implementación.

**Preguntas abiertas que la ficha arrastra y que `/afinar-feature` debería cerrar antes del spec:**
una ruta o dos, formulario en modal o en página, si hace falta E2E, **qué permiso corta la pantalla**
(el board dice «depende del permiso que cierre el CRUD de unidades», y QC-45 sentó el precedente de
declarar `inventario.modificar` con su motivo escrito), **cómo se pinta la equivalencia**
(«1 kg = 1000 gr») y **cómo se distingue visualmente una unidad de sistema** cuando no ofrece editar
ni borrar.
### QC-65 — acotada con `/afinar-feature` (2026-09-08)

Alcance, 12 decisiones cerradas y cero preguntas abiertas en
`specs/QC-65-estado-de-cuenta-de-usuario/requirements.md`. La acotación **cambió el alcance** y el
board se actualizó primero: QC-65, QC-66 y QC-67 reescritas (el estado deja de ser un sí/no y pasa
a cuatro valores —`active`, `pending`, `inactive`, `blocked`—, la cuenta nace `pending` y se guarda
quién y cuándo la cambió), más dos fichas nuevas: **QC-78** (el estado manda en el acceso; unifica
`blocked` con el bloqueo por intentos fallidos de QC-19) y **QC-79** (contraseña opcional al crear
y enlace para establecerla; **arrastra envío de correo, dependencia nueva con aprobación humana**).
`complexity: low` y `zone: backend` escritas como labels en Jira.

### QC-45 — pantalla-de-presentaciones: CERRADA el 2026-09-08 (PR #46, merge `fb144c8`)

Resumen completo en `progress/history.md`; el arranque, el acotado, las tres rondas y el review ya no
se releen desde aquí. Tarjeta a *Finalizado* con la URL del PR comentada en el issue, ficha a `done`
y worktree desmontado. `reviewer` **APROBADO** en las dos rondas que revisó (0 mayores), **36/36
requisitos con test ejecutado**, E2E verde en Chromium y WebKit.

**La cerró otra sesión, y esa es la lección.** El PR #46 se mergeó el 2026-09-08 a las 17:06Z y la
sesión que la implementó nunca corrió F2.5 ni F2.6: la ficha siguió `in_progress` con la rama ya
dentro de `dev`. **Es la tercera vez** —QC-8 y QC-30 antes—, y sigue dependiendo de que quien mergea
se acuerde. Material de `/afinar-regla` que ya estaba anotado y que hoy vuelve a cobrarse.

**El gate completo se corrió en el cierre, no antes del PR** (`tests/integration/` estaba rojo por la
migración de QC-76 sobre la base compartida, así que se mergeó con `--rapido`). Desde el worktree:
typecheck ✓, lint ✓, las siete validaciones del arnés ✓, **3145 verdes de 3177**, y **ninguno de los
23 rojos es de la ficha** — 17 el flake de carga del baseline, 2 el mismo flake sin entrada propia y
4 el artefacto de medir `dev...HEAD` sobre una rama ya mergeada (rango vacío).

**Deudas que deja, ninguna suya de cerrar:**

- **T10 sigue pendiente y ningún agente puede hacerla**: la comprobación manual del scroll contenido
  en la tabla en un **WebKit real**. El E2E corrió en WebKit y pasó, pero no es lo que T10 pide.
- **Dos rojos nuevos sin entrada en `tests/baseline-rojos.json`**: `identity-facade.test.ts` y
  `login-form-uncontrolled-warning.test.tsx`. **Medidos**: pasan 9/9 aislados y solo caen bajo la
  carga de la suite completa, que es exactamente **QC-58**. O entran al baseline con su motivo, o
  QC-58 los arregla; hoy ponen el gate rojo sin decir nada nuevo.
- **El árbol principal no puede correr el gate**: `prisma generate` cae con `EPERM` sobre
  `query_engine-windows.dll.node` porque otro proceso lo tiene tomado, así que su cliente no tiene
  los campos que QC-76 añadió a `Unit` y el typecheck da 41 errores en `lib/modules/unidades` y
  `tests/integration/unidades`. **Cliente desactualizado, no código roto** — en el worktree, con el
  cliente regenerado, el mismo typecheck pasa limpio. Se arregla soltando el proceso que retiene el
  `.dll` y regenerando.
- **QC-45 resolvió la pregunta abierta 4 de QC-55** —la columna de acciones de fila, declarada como
  columna normal con `pinnable: false`— y **QC-56 hereda esa respuesta**.
- **Excepción declarada a QC-75 R5**, escrita en `design.md > 3.2`: el ítem de menú declara
  `inventario.modificar` y no `<módulo>.consultar`. **QC-39 debe usar `unidades.consultar`** salvo que
  caiga en el mismo aprieto.
### QC-58 — timeout-tests-ui-bajo-carga (acotada el 2026-09-07)

- El alcance y las **8 decisiones cerradas** viven en
  `specs/QC-58-timeout-tests-ui-bajo-carga/requirements.md`. Esa es la fuente; aquí no se copia
  la tabla. **Cero preguntas abiertas.**
- **Lo que la acotación corrigió de la ficha**, y son tres cosas: el arreglo va a **los tres**
  proyectos de Vitest y no solo a `ui` —el gate tumbó `composition/identity-facade`, del proyecto
  `node`, que no teclea nada—; el plazo tiene **número** (de 5000 a 15000 ms); y la prueba tiene
  **criterio verificable** (cinco corridas seguidas de la batería completa, las cinco verdes,
  heredando de `docs/verification.md` que una corrida verde no prueba nada).
- **Board actualizado antes de sembrar (Paso 5):** `description` de QC-58 reescrita con esas tres
  correcciones, y **QC-77 creada** (`zone:backend`, parent QC-16 Plataforma, sin `complexity` —la
  asigna el leader en F1.0—) para la colisión de correlativo en la base de integración, que salió
  de QC-58 a propósito: es estado residual, no plazo.
- `zone` **sigue `frontend`** aunque toque la config de los tres proyectos: `fullstack` dispararía
  la partición en dos fichas, que no tiene sentido para un arreglo de configuración.


### QC-38 — crud-de-unidades (acotada el 2026-09-07)

- El alcance y las **22 decisiones cerradas** viven en
  `specs/QC-38-crud-de-unidades/requirements.md` — esa es la fuente, aquí solo se enlaza.
  **Cero preguntas abiertas.**
- **Cuatro decisiones del humano**: autoriza **por permiso** (modelo de QC-74, no un
  `requireAdmin` nuevo); **consultar sigue siendo solo del Administrador**, se conserva lo de
  QC-32 y no se abre al Operador; **60 caracteres el nombre y 10 el símbolo**, solo en la
  validación y sin migración; y la edición es **reemplazo completo**.
- **Cierra la pregunta abierta 5 de QC-32.** Con ella, las tres de QC-32 quedan cerradas: la 1 y
  la 3 al acotar QC-76, la 5 aquí. Anotado como comentario en el issue; su spec no se toca.
- **Board actualizado antes de tocar disco**: `complexity: medium` (se aparta del precedente —
  QC-20 y QC-25, los dos CRUD hermanos, son `high` — porque son tres casos de uso sobre un
  catálogo de un solo campo, sin migración propia y con la lectura ya construida);
  `depends_on` gana **QC-74** con su link *is blocked by*; `description` con las cuatro
  decisiones.
- **Contexto de la corrida:** se acotó QC-38 y no QC-39 porque QC-39 está a tres fichas de
  distancia (QC-76 → QC-38 → QC-39) y la pantalla no tendría qué consumir. Y se hizo con el árbol
  principal ocupado por otra sesión: hubo que esperar a que cerrara su merge de `origin/dev`
  (`af5d258`, QC-54 + QC-74) porque `feature_list.json` estaba en conflicto.
### QC-76 — equivalencia y ambito de unidades (creada y acotada el 2026-09-07)

**Segunda corrida el 2026-09-07: sembrada.** Las 30 decisiones cerradas y el alcance viven en
`specs/QC-76-equivalencia-y-ambito-de-unidades/requirements.md` — esa es la fuente, aquí solo se
enlaza. **Cero preguntas abiertas.** La acotación descubrió que el listado de unidades **ya
existe** (`listUnits`, de QC-26 y QC-57) y que `getSessionContext()` ya trae el `companyId`
desde QC-48, así que **el filtro empresa-o-sistema entra en QC-76** y no en QC-38: la ficha deja
de ser solo esquema y su `complexity` sube a **high** en el board. Se cerraron además las
preguntas abiertas **1 y 3 de QC-32** —el símbolo pasa a ser único cuando existe, con el ámbito
del nombre; presentación y unidad no convergen—, anotado como comentario en el issue QC-32 sin
tocar su spec. QC-38 reescrita: pierde la consulta, gana las validaciones de la equivalencia.

- **Corrida de `/afinar-feature` que NO sembró `specs/`**: lo pedido no tenía ficha. QC-32
  (`modelo-unidades`) está `done` y no se pisa, así que la extensión del modelo nació como ficha
  nueva —**QC-76**, épica Catálogos, `zone: backend`, `complexity: medium`, *is blocked by* QC-32
  y QC-48—. Una ficha nueva nace `pending` en Backlog y se acota en su propia corrida
  (`/afinar-feature`), así que **las decisiones viven hoy en la `description` del issue**, no en
  un `requirements.md`. Esa corrida está pendiente y es la que escribirá
  `specs/QC-76-equivalencia-y-ambito-de-unidades/requirements.md`.
- **Nueve decisiones del humano**, resumidas: equivalencia como **factor decimal exacto de 4
  decimales** (nunca `float`, heredado de QC-33) hacia la unidad de la que se deriva, **mayor que
  cero**; derivación de **un solo nivel** (tonelada = 1.000.000 de gramos, no 1000 kilogramos);
  **no existe campo `system`** —«de sistema» es exactamente «sin `company_id`»—, lo que **cambia
  la petición original**, que sí pedía el campo; unidades de sistema de **solo lectura**;
  **unicidad del nombre medida dentro de la empresa**; consulta que trae empresa **o** sistema,
  por **un único punto de consulta** del módulo; **migración nueva**, sin editar
  `20260903121404_units_catalog`, que ya está aplicada; y el módulo **publica la conversión pero
  ningún consumidor la usa** todavía.
- **Reabre la pregunta abierta 1 del dominio.** QC-14 la cerró y QC-32 la revisó diciendo «una
  sola unidad por elemento y **sin conversiones**, la unidad es puramente anotativa». Ahora sí hay
  conversión. Anotado en `docs/architecture.md > Preguntas abiertas del dominio`.
- **Board actualizado ANTES de tocar disco** (`docs/jira.md`): QC-76 creada con sus labels y sus
  links; **QC-51 (`aislamiento-por-empresa-en-unidades`) movida a Cancelado** con comentario —
  decía que cada empresa tiene sus propias unidades y que el arrancador se siembra por empresa, y
  la decisión fue la contraria; lo único suyo que sobrevive es la unicidad por empresa, que entra
  en QC-76—; **QC-38** con el filtro empresa-o-sistema, el rechazo a editar o borrar unidades de
  sistema y las validaciones de la equivalencia, y su `depends_on` ahora incluye QC-76;
  **QC-39** con la ruta `configuracion/unidades` y las columnas de la lista.
- **Queda abierto**: si la pantalla de presentaciones (QC-45) vive también bajo esa sección
  Configuración; qué permiso exige ver y editar unidades (lo cierra QC-38); y si el símbolo debe
  ser único, abierta desde QC-32.

#### QC-76 — la base, y el gate en rojo que no era suyo (2026-09-08)

**La migración de QC-76 está aplicada en la base de desarrollo** (`20260907190000_units_equivalence_and_scope`).
Se aplicó tras una decisión del humano: la base arrastraba una unidad residual de un test
(`24e8c214-c000-4e30-bd0b-5cd0101366aa`, «Unidad 109c4e85…») cuyo símbolo `kg` duplicaba el de
`kilogramo` y hacía fallar con `23505` el índice único que exige R15. Verificadas **cero
referencias** en `products.unit_id`, `recipe_lines.unit_id` y `supplier_catalog_lines.unit_id`
antes de tocarla; el humano eligió **borrarla** frente a anularle el símbolo. Quedan las cuatro de
sistema. El `implementer` corrió después `db:rollback` y `db:migrate` de verdad, así que el UP, el
DOWN y el re-UP están ejercitados contra el esquema real, no en transacción deshecha.

**El `./init.sh --rapido` da rojo y el rojo NO es de esta feature.** Dos corridas seguidas, sin
tocar una línea entre medias:

| Corrida | Archivos en rojo | Tests en rojo | Extra |
| --- | --- | --- | --- |
| 1 | 7 | 18 | `Worker exited unexpectedly` |
| 2 | 3 | 6 | — |

Los tres de la segunda son de UI —`proveedores-ui/catalog-line-sheet`, `pedidos-ui/order-sheet`,
`pedidos-ui/order-form`— y **aislados dan 41/41 verdes**. **Cero fallos en `unidades` en las dos
corridas.** Es el flake de UI bajo carga, que es exactamente lo que existe para arreglar **QC-58**,
y aquí queda medido: la no-determinación entre corridas (18 → 6) es la prueba, no una impresión.
**Mientras QC-58 no cierre, ningún gate completo de este repo puede salir verde de forma fiable**,
y eso bloquea el F2.4 de cualquier feature, no solo el de esta.


#### QC-76 — arranque del 2026-09-07 (F1.0/F1.1)

Arrancada por **decisión humana explícita** («76»), tras preguntar qué se podía avanzar. Se pidió
QC-38 y **no se pudo**: su `depends_on` incluye QC-76, que sigue `pending`, y `AGENTS.md >
Paralelismo` no deja arrancar una ficha con una dependencia sin cerrar. QC-76 es exactamente lo
que la desbloquea.

- **Lo que la bloqueaba ya no existe.** Esta ficha estaba parada por conflicto de archivos con
  QC-74, que tocaba su misma superficie (`lib/modules/unidades/**`, `db/schema.prisma`).
  **QC-74 cerró hoy** (PR #43, merge `95b9b51`), así que el conflicto se disolvió.
- **Cupo y conflicto, los dos verdes.** `backend` no tiene ninguna `in_progress`: QC-23 está en
  `spec_ready` esperando aprobación humana y vive en el módulo de sesiones — cero intersección
  con `unidades`.
- **Zone, complexity y branch ya venían evaluadas** (`backend`, `high`, con sus labels en el
  issue desde la acotación). No hizo falta empujar nada a Jira en este paso.
- **EL WORKTREE CUELGA DE `origin/dev`, y esta vez no es preferencia.** Las dos ramas siguen
  **divergidas** (`origin/dev` +18, `dev` local +16). Los 18 que le faltan al local son **QC-54
  entero y QC-74 entero** — y QC-74 reescribió los archivos de `unidades` que esta ficha toca.
  Colgarla de `dev` local sería construir sobre un módulo que ya no existe así. Los 16 locales
  sin pushear son todos frontend (autocomplete, tabla compartida, columna de imagen): no le hacen
  falta a una ficha de esquema y service.
- **El requirements sembrado y el board importado entraron a la rama en `7a3203b`**, primer
  commit del worktree. Nacida de `origin/dev`, la rama no conocía ni el
  `specs/QC-76-.../requirements.md` que sembró `/afinar-feature` ni las tres celdas que la
  importación de hoy cambió en `feature_list.json` (QC-74 a `done`, complexity de QC-45 y
  QC-75). Es exactamente lo que hizo abortar el gate dos veces en QC-74, prevenido de entrada.
- **F1.2 sin escala en `/afinar-feature`**: el requirements ya trae 30 decisiones cerradas y
  **cero preguntas abiertas**. `spec_author` solo escribe `## Requisitos (EARS)`, `design.md` y
  `tasks.md`; el bloque de Alcance y la tabla de decisiones no se reabren.


La feature **QC-74 — modelo-de-permisos** se cerró el 2026-09-07 (PR #43, merge `95b9b51`):
resumen en `progress/history.md`, tarjeta en *Finalizado*. 24 requisitos con test y `reviewer`
**en una sola ronda** (0 mayores, 6 menores), que probó la trazabilidad con **11 mutaciones**.
Deja diez permisos `<modulo>.<accion>` en base, `assertPermission` encima de la única
`assertAdminRole` que dejó QC-54, y tres guardias contra la reincidencia. **Desbloquea QC-75.**

**El gate abortó dos veces sin llegar a mirar código**, las dos por el `feature_list.json` de la
rama: nació de `origin/dev`, que no conocía el board importado ese día. Corregido en `e5b0949`
trayendo la copia del board, no parcheando filas. Es el coste medido de tener el board importado
solo en el árbol principal sin commitear — y **sigue sin resolverse**.

**`wt.sh done` falló en Windows por séptima vez**: desregistró el worktree y dejó el árbol en
disco. Rematado con `rm -rf` + `git worktree prune`. Sigue sin ficha.

**Dos menores del reviewer salen con destino y sin ficha todavía**, los dos `/afinar-regla`: las
guardias son ciegas a comentarios de línea con finales CRLF —deuda **heredada** de QC-54, en
**cuatro** guardias, que muerde con `core.autocrlf=true`— y `docs/architecture.md > Dominio` sigue
nombrando tres tablas exentas de columna de empresa cuando ya son cinco.

### QC-75 — menu-y-rutas-por-permiso: CERRADA el 2026-09-08 (PR #44, merge `bc343cf`)

Resumen completo en `progress/history.md`; el detalle del arranque, el acotado y las diez
decisiones cerradas ya no se relee desde aquí. Tarjeta a *Finalizado*, worktree desmontado y ramas
local y remota borradas. `reviewer` **APROBADO en una sola ronda** (0 mayores, 3 menores) con siete
mutaciones al código de producción, y `./init.sh` completo en verde antes del PR.

**Lo que hereda quien siga:** los tres menores están vivos y ninguno es de esta ficha arreglar —
**M1**, no hay guardia de fuente de que el layout privado nunca llame a `notFound()` (hoy lo
sostienen los comentarios y el E2E; una línea en `qc75-convenciones` lo cazaría en `--rapido`);
**M2**, operativo, `e2e/permisos.spec.ts` **depende del seed de QC-6/QC-74** para el rol `Operador`,
así que fuera de su worktree la base tiene que estar sembrada o el E2E falla —con mensaje explícito,
eso sí—; **M3**, `CHECKPOINTS.md > Permisos` sigue diciendo «vía `cookies()`», mecanismo que la
página ya no toca y que el propio `dashboard-route-contract` le **prohíbe** nombrar.

**Cierra la deuda provisional que QC-45 declaró al acotarse**: el ítem de Configuración que se
ocultaba a mano al no Administrador queda sustituido por el menú armado en el servidor con permisos.
El desmontaje volvió a fallar en Windows por las rutas largas de pnpm —**séptima vez**, y sigue sin
ficha—: `wt.sh done` desregistró el worktree pero dejó el árbol en disco, rematado con `robocopy /MIR`
contra un directorio vacío (`rm -rf` y `Remove-Item -Recurse` no bastan) más `git worktree prune`.


### QC-74 — arranque del 2026-09-07 (F1.0)

Elegida por decisión humana explícita («arranca 74»). `zone: backend`, `complexity: high` y
`depends_on: QC-54` ya venían del board, y las labels del issue (`zone:backend`,
`complexity:high`) estaban correctas: **no hizo falta empujar nada a Jira**. La zona `backend`
tenía **cero** features `in_progress` al arrancar (QC-23 está en `spec_ready`, que no cuenta para
el cupo), así que no hubo validación de conflicto que hacer.

**El worktree nace de `origin/dev` (`fa116cd`), no del `dev` local.** No es un detalle: el merge de
QC-54 —del que esta ficha depende— está **solo** en `origin/dev`; el `dev` local va 3 adelante y
**10 atrás**, y con 61 archivos sin commitear. `wt.sh new` resuelve la base con `resolve_base`, que
prefiere `origin/dev`, así que salió bien por construcción y no por acierto. Si alguien monta el
worktree a mano desde el `dev` local, QC-74 nace sin la pieza que sustituye.

**La semilla de `/afinar-feature` estaba sin commitear en el árbol principal** (`specs/QC-74-…/`
sale como `??` en `git status`), así que no existía dentro del worktree recién creado: se copió a
mano antes de lanzar `spec_author`. Mismo caso en `specs/QC-70-…/` y `specs/QC-71-…/`, que siguen
untracked y le pasará lo mismo a quien las arranque.

**Reconciliar `origin/dev` con el disco sigue pendiente** y se avisó antes de arrancar: los cierres
de QC-35, QC-48 y QC-54 están escritos en el `feature_list.json` local y no en el remoto. F1 no
toca código y el worktree ya está aislado, así que no bloquea la especificación — pero sí hay que
resolverlo antes de F2.3.

### QC-74 y QC-75 — permisos por módulo: dos fichas nuevas, QC-74 acotada y sembrada (2026-09-07)

Nacen las dos en esta sesión (épica QC-17). **QC-74 — `modelo-de-permisos`** (`backend`,
`complexity: high`, `depends_on: QC-54`) queda acotada con `/afinar-feature`: once decisiones
cerradas y dos preguntas abiertas en `specs/QC-74-modelo-de-permisos/requirements.md` — no se
releen desde aquí. **QC-75 — `menu-y-rutas-por-permiso`** (`fullstack`, sin `complexity`) nace
`pending` en Backlog y **no se siembra**: se acota cuando le toque.

**Por qué son dos y no una.** «El menú se filtra y la ruta da 404» no es implementable solo: hoy
los cinco módulos autorizan preguntando por el nombre del rol dentro del service, y
`docs/architecture.md` es explícito en que un permiso implementado solo como corte de ruta **no
cuenta como implementado**. QC-74 cambia la frontera real (service), QC-75 la parte visible.

**Dos cosas que se midieron y cambiaron el alcance.** La propuesta original mandaba el listado de
rutas permitidas dentro de la cookie firmada: se descartó — duplica el mapa de URLs fuera del
código, crece sin techo en cada petición y hereda los 8 h de envejecimiento del rol firmado
(QC-9 R30). El set de permisos se deriva en el layout desde la base, que ya lee al usuario en cada
render privado. Y **el permiso por empresa no se preguntó**: `docs/architecture.md > Dominio` ya lo
lista entre lo que el reviewer rechaza como sobre-ingeniería.

**Choque directo con QC-54, que está `in_progress` ahora mismo.** Los cinco `requireAdmin` que
aquélla está unificando son exactamente lo que QC-74 sustituye por `requirePermission`. Decisión
humana: QC-54 se termina y QC-74 va encima, con `depends_on: QC-54` escrito en el board. Sustituir
una implementación es quirúrgico; sustituir cinco copias es el trabajo que QC-54 ya está haciendo.

**QC-63 se refuerza:** su ficha ya pedía por escrito que el Operador pueda consultar recetas sin
poder modificarlas, que es justo la granularidad elegida. Pero el Operador **no** nace con ese
permiso: nace solo con «consultar inventario», y QC-63 abre lo suyo con su propio motivo.

**Alcance que creció en QC-75 y que conviene ver antes de acotarla:** el login deja de llevar
siempre a `/dashboard` —el dashboard pasa a exigir permiso como cualquier módulo— y lleva a la
primera pantalla con permiso. Eso abre el caso «un rol sin ninguna pantalla», que queda **sin
decidir a propósito** en su ficha.


### QC-54 — F2.0 hecha y F2.1 RETENIDA: el conflicto con QC-48 está medido (2026-09-07)

Spec aprobado por el humano y tarjeta en *En curso*. `status: in_progress`. Zona `backend` queda
**2/2** (QC-48 y QC-54), o sea en el límite y sin margen para una tercera.

**La validación de `AGENTS.md > Paralelismo` ya se puede hacer de verdad** —`tasks.md` existe en
las dos fichas, que es contra lo que manda validar— y **da conflicto**. Cruzando los archivos con
ruta que declara cada `tasks.md` (28 y 28):

| Archivo | QC-54 lo necesita para | QC-48 lo necesita para |
|---|---|---|
| `lib/modules/identity/index.ts` | publicar `assertAdminRole` en el contrato | publicar la empresa en la sesión |
| `tests/guards/guard-middleware-edge.test.ts` | probar que leer el rol de `identity` no ensucia el borde | probar que la empresa firmada no ensucia el borde |

**Por eso F2.1 no se lanza.** La regla es explícita: con intersección de archivos, la feature nueva
espera a que la que ya está dentro pase a `done`. No es una precaución mía.

**QC-48 está cerca de cerrar, no empezando:** siete commits en su rama, T1–T12 con E2E incluido,
bitácora con el mapa R1–R28 escrita y `dev` ya mergeado (o sea su F2.3 hecha). La espera debería
ser corta, y **el orden favorece a QC-48**: si QC-54 tocara el barrel primero, el conflicto se lo
comería la feature que ya tiene doce tasks hechas.

**Lo que desbloquea F2.1**, cualquiera de las dos: QC-48 pasa a `done`, o el humano decide asumir
el merge a mano sobre esos dos archivos.

### QC-71 — identificador-de-request: acotada y sembrada (2026-09-07)

Siete decisiones cerradas y **dos preguntas abiertas** en `specs/QC-71-identificador-de-request/requirements.md` — no se releen desde aquí. `backend` → `fullstack`, `complexity: medium`, `depends_on: QC-70` sin cambios, y la `description` del board reescrita antes de sembrar. **Reabrió una fila de QC-70 cerrada ese mismo día**: el error genérico sí lleva el identificador de vuelta al navegador. Se añadió la fila sustitutoria a la tabla de QC-70 y se corrigió su `description` en el board; el resto de ese archivo no se tocó.

Las dos preguntas abiertas no son pereza y conviene no rellenarlas a ojo: Next admite **un solo** `middleware` y hoy lo ocupa el portero de rutas de `identity` (QC-9), y el id tiene que cruzar del borde a la Server Action —dos ejecuciones, dos runtimes, una cabecera como único canal—. `tests/guards/guard-middleware-edge.test.ts` recorre el cierre de imports completo desde `middleware.ts` y prohíbe `node:crypto`, `crypto`, `@prisma/client` y `next/headers`: es la guardia que esta ficha va a rozar, y su modo de fallo es no verse hasta el despliegue.

**QC-54 pasó a `in_progress` mientras acotaba**, desde la otra sesión de leader y por la vía buena (F1.4 aprobada, tarjeta en *En curso*) — su propia entrada, arriba, lo cuenta. El validador pasó de `in_progress=3` a `=4` sin que yo tocara ningún `status`: son 2 de `backend` y 2 de `frontend`, así que la regla de máx. 2 por zona se respeta. Refuerza el `depends_on: QC-54` que QC-70 ya lleva: ya no es una precaución, es una feature viva sobre los mismos cinco `domain/errors.ts`.

### QC-70 — errores-centralizados: nacida, acotada y sembrada (2026-09-07)

Ficha creada en esta sesión junto a QC-71 (identificador de petición). Acotada con `/afinar-feature`: diez decisiones cerradas y una pregunta abierta en `specs/QC-70-errores-centralizados/requirements.md` — no se releen desde aquí. El alcance **creció y cambió de zona**: `backend` → `fullstack`, `complexity: high`, `depends_on: QC-54`, y la `description` del board se reescribió antes de sembrar. Dos premisas de la ficha original **se cayeron al medirlas**: los códigos de error ya son estables y compartidos de hecho (siete pantallas deciden por ellos), así que el `code: 30` numérico que pedía la ficha se descartó; y «un solo tipo de error» choca con una decisión ya cerrada de QC-54, que está a medio construir en su propio worktree. Salió **QC-72** (`internacionalizacion-de-textos`): «preparado para traducir» arrastra una decisión de aplicación entera y una dependencia nueva que no caben en una ficha de errores.

### QC-54 — unificar-constante-rol-administrador: arranque del 2026-09-07 (F1.0)

**OTRA SESIÓN DE LEADER LLEVA QC-48, y eso cambia el paralelismo de QC-54 (2026-09-07).** Al sembrar
esta ficha el validador pasó de `in_progress=2` a `=3` sin que yo tocara ningún `status`. No es un
error: QC-48 pasó a `in_progress` desde fuera de esta sesión. Comprobado — su worktree tiene cinco
archivos de `identity` modificados sin commitear (`domain/session-claims.ts`, `domain/session.ts`,
`adapters/driven/session/session-token.ts` y sus dos tests) más un `specs/QC-48-tenant-en-la-sesion/`
sin trackear, y su tarjeta ya está en *En curso* en el board.

**Qué implica.** La zona `backend` deja de estar vacía: con QC-48 dentro, QC-54 sería la segunda, que
es el límite y no una violación. Pero ahora **sí hay validación de conflicto de archivos que hacer**
(`AGENTS.md > Paralelismo`), y la intersección probable es real: QC-54 tiene que tocar
`lib/modules/identity/domain/roles.ts` y **`lib/modules/identity/index.ts`** para publicar el
`requireAdmin` genérico, y QC-48 está reescribiendo el dominio de sesión de ese mismo módulo y muy
probablemente su barrel.

**Qué NO bloquea.** F1.2 sigue adelante: `spec_author` no toca código. Es el mismo razonamiento que
QC-47 dejó escrito el 2026-09-04 — la validación se hace contra `specs/<feature>/tasks.md`, que
todavía no existe.

**Qué SÍ bloquea, y queda anotado para no decidirlo dos veces:** la implementación de QC-54 **no
arranca (F2.0)** hasta que QC-48 esté `done`, o hasta que sus `tasks.md` demuestren que no tocan
`lib/modules/identity/index.ts`. Y con dos sesiones vivas sobre el mismo repo, **el que llegue
segundo al barrel de `identity` se come el conflicto**.

**Acotada y sembrada el 2026-09-07** con `/afinar-feature`: nueve decisiones cerradas en
`specs/QC-54-unificar-constante-rol-administrador/requirements.md`, cero preguntas abiertas. El
alcance **creció** —entra también unificar los cinco `requireAdmin` y una guardia contra la
reincidencia—, así que la `complexity` subió a `high` y la `description` del board se reescribió
antes de sembrar. Dos de las tres preguntas que iba a hacer **se cayeron al medirlas**: la deuda de
centinela que la ficha atribuía a este import no existe, y el borde no corre riesgo. Las tres
decisiones abiertas que anoté arriba quedan cerradas en ese archivo — no se releen desde aquí.

Elegida por decisión humana explícita («comienza con 54»). Zona `backend`, que estaba **vacía de
`in_progress`** —las dos en curso, QC-35 y QC-64, son `frontend` y llenan su cupo—, así que es la
primera de su zona y el paralelismo no necesita validación de conflicto contra nadie de `backend`.
`depends_on: null`. Worktree montado desde `origin/dev` = `738d9a9`.

**`complexity` asignada: `medium`, no `low`.** La ficha parece un buscar-y-reemplazar y no lo es:
`ADMIN_ROLE_NAME` está **exportado en el barrel** de `inventario`, `recetas` y `unidades`
(`lib/modules/<m>/index.ts`), así que retirarlo **cambia el contrato público de tres módulos**. Son
tres declaraciones a borrar, tres barriles a tocar y una veintena de consumidores, la mitad de ellos
tests de autorización de cuatro módulos. Verificado en el árbol antes de asignar: la ficha describe
el estado real.

**Lo que ya está bien y no se toca:** `pedidos` y `proveedores` ya importan `ROLE_ADMINISTRADOR` de
`@/lib/modules/identity` (`domain/actor.ts` de cada uno). Son el patrón destino, no trabajo
pendiente. La ficha decía «solo proveedores»; son dos.

**El valor de la cadena no puede cambiar, solo de dónde se lee.** `'Administrador'` viaja **firmado
en la cookie de sesión** (QC-8/QC-9) y está en `SEED_ROLES`, o sea en la base. Renombrarlo invalida
todas las sesiones vivas y desalinea el seed. Esta ficha mueve el origen del literal, nunca el
literal.

**Aviso de conflicto que la regla NO cubre, y por eso queda escrito.** QC-64
(`editor-y-lectura-de-pasos`, `in_progress`) es `frontend`, y `AGENTS.md > Paralelismo` solo valida
intersección de archivos **dentro de la misma zona**: formalmente no hay nada que validar. Pero
QC-54 tiene que editar `lib/modules/recetas/index.ts` y `lib/modules/recetas/domain/actor.ts`, y
QC-64 vive en recetas. El riesgo no es de regla, es de merge en F2.3. Comprobar contra
`progress/impl_QC-64-*` antes de que el implementer entre en el barrel de recetas.

**Decisiones que la ficha deja abiertas y que el spec no debe rellenar con un supuesto:**

1. ¿`ADMIN_ROLE_NAME` **desaparece** de los tres barriles, o se queda como re-export de
   `ROLE_ADMINISTRADOR` durante una transición? Lo primero es la ficha tal cual está escrita; lo
   segundo evita romper a los consumidores de golpe. No es lo mismo y cambia el diff entero.
2. `lib/composition/route-role-rules.ts` importa hoy `ADMIN_ROLE_NAME` **del barrel de
   `inventario`**, y ese import es justo el que en QC-22 encendió el centinela que prohíbe importar
   ese barrel como valor fuera de `lib/composition` — el centinela se **acotó** para permitirlo.
   Al pasar el import a `identity`, ¿se **revierte** esa acotación del centinela, que es la deuda
   que la ficha dice que era evitable, o se deja como está? La ficha lo cuenta como motivación pero
   no lo pide.
3. ¿Entra una **guardia ejecutable** que impida que un módulo nuevo vuelva a declarar su propio
   literal `'Administrador'`? Sin ella la ficha limpia el presente y no el futuro, que es el motivo
   por el que existe.


### QC-35 — pantalla-de-pedidos: acotada y sembrada (2026-09-06)

Arrancada por decision humana explicita («arranca con 35»), retomando la F1.2 que quedo en pausa
el 2026-09-04. Alcance, decisiones y preguntas abiertas en
**`specs/QC-35-pantalla-de-pedidos/requirements.md`** — 32 decisiones cerradas y 5 preguntas
abiertas. No se copian aqui: ese archivo es la fuente.

Lo que la acotacion movio fuera del disco, y por que importa para la proxima F0:

- **Ficha nueva: `QC-68` — busqueda-y-total-en-el-listado-de-pedidos** (`backend`, `pending`, epica
  QC-31, sin `complexity` porque la asigna el leader en F1.0). Recoge las dos cosas que la pantalla
  pide y el backend no da: buscar por nombre de receta —QC-57 dejo `orders` como la unica de las
  siete listas con `searchable: false`, y esta escrito por que— y el **total del pedido calculado en
  el servidor**, que cierra la pregunta abierta 3 que QC-34 le habia remitido a esta ficha.
- **El total se calcula en el SERVIDOR y no en la pantalla, y eso evita una dependencia.** Los dos
  importes son `Decimal(14,4)`; multiplicarlos con `number` pierde precision, asi que hacerlo en el
  cliente obligaria a meter `decimal.js` con sus cuatro checks de salud y su aprobacion humana
  (regla 7). Prisma ya opera decimales del lado del servidor: la consulta devolvera `total` como
  cadena. **Ninguna dependencia nueva entra por esta via.**
- **QC-35 NO queda bloqueada por QC-68** —decision humana del 2026-09-06—. La pantalla nace **sin
  caja de busqueda y sin columna de total** en vez de nacer con las dos sin funcionar, que es
  exactamente lo que QC-56 advirtio por escrito («migrar antes dejaria cabeceras que no hacen
  nada»). Enchufarlas cuando QC-68 este `done` es una ficha de frontend posterior **que todavia no
  existe y que no se creo aqui**: se crea cuando QC-68 cierre.
- **`description` de QC-35 reescrita en el board antes de sembrar**, como manda
  `docs/jira.md > Cuando el disco descubre que el board esta desactualizado`. La version vieja
  dejaba la forma de la pantalla «para la acotacion» y no mencionaba ni la tabla compartida ni el
  total; sin reescribirla, la proxima F0 la habria reimportado y el spec quedaba huerfano de su
  ficha.

**Esta pantalla es el primer consumidor de la tabla compartida de QC-55**, mergeada el 2026-09-04 y
hasta hoy sin estrenar. Con ella hereda la **pregunta abierta 4 de QC-55** —como se declara una
columna de ACCIONES de fila—, que **es bloqueante y no se puede esquivar**: la lista necesita
editar, cancelar y borrar por fila y hoy la configuracion de columnas solo devuelve texto. Lo que
QC-35 resuelva ahi es lo que QC-56 adopta despues. La comprobacion en **Safari de iOS real** NO se
mueve: sigue siendo de QC-56, por decision humana del 2026-09-04.

**Lo que la acotacion NO tuvo que preguntar, porque ya estaba en el codigo mergeado:** el orden por
defecto (`priority desc, createdAt asc`), los filtros de estado y prioridad, `recipeName` y
`unitName` en la salida, y los seis campos ordenables de `ORDER_QUERYABLE`. Todo eso lo dejaron
QC-34 y QC-57; se verifico en el codigo antes de preguntar, no se dio por supuesto.


### QC-48 — tenant-en-la-sesion: arranque del 2026-09-06 (F1.0-F1.1)

Arrancada por decision humana explicita, y es la de mas rendimiento del tablero: de ella cuelgan
**cinco** fichas (QC-49, QC-50, QC-51, QC-59, QC-60).

- **Nada que evaluar**: `zone: backend`, `complexity: medium`, `depends_on: QC-47` y `branch` ya
  venian del board, y las labels (`zone:backend`, `complexity:medium`, `sdd`,
  `slug:tenant-en-la-sesion`) estan puestas. No hizo falta empujar nada a Jira en F1.0.
- **`depends_on` satisfecha**: QC-47 cerrada hoy (PR #37, merge `45bdf18`).
- **Cupo de zona**: `backend` tiene **0** features `in_progress` tras cerrar QC-47 y QC-57. Sin
  nada con lo que chocar, no hubo validacion de conflicto de archivos que hacer. Queda **un
  segundo hueco** de backend libre.
- **Worktree montado** en `.worktrees/QC-48-tenant-en-la-sesion` desde `origin/dev` (`738d9a9`),
  que ya trae dentro el modelo de empresa de QC-47 — condicion para poder escribir contra el.
- **F1.2 pendiente: hay que acotarla antes de lanzar `spec_author`.** No existe
  `specs/QC-48-tenant-en-la-sesion/requirements.md` y la ficha arrastra una pregunta abierta
  escrita en su propia description.
- **ACOTADA con `/afinar-feature` el 2026-09-06.** Las nueve decisiones cerradas y la unica
  pregunta abierta viven en `specs/QC-48-tenant-en-la-sesion/requirements.md`; no se copian aqui.
  La acotacion toco el board dos veces: se reescribio la `description` de QC-48 (hablaba de
  "membresia" y de una pregunta sin materia) y se creo **QC-69 — Alta de usuarios**, que
  **se cancelo el mismo dia por duplicada**: la absorbe **QC-66 — crud-de-usuarios**, que la otra
  sesion habia anadido a `feature_list.json` sin commitear despues de la ultima lectura del leader.
  La regla que la motivo —el usuario nuevo hereda la empresa del administrador que lo crea— queda
  comentada en QC-66.
- **La pregunta abierta que hereda ya no se puede responder como esta escrita, y eso hay que
  resolverlo al acotar.** Dice: «si un usuario llega a tener mas de una membresia y todavia no hay
  selector, con cual inicia sesion». Pero **QC-47 se reacoto a una empresa por usuario**
  (`users.company_id` obligatoria, sin tabla de pertenencias), asi que hoy **no puede haber mas de
  una**: la pregunta no tiene materia contra el modelo que se acaba de mergear. Hay que decidir si
  se declara cerrada por el modelo o si se convierte en otra cosa —por ejemplo, que pasa si la
  empresa del usuario se borra o deja de ser suya a mitad de sesion, que el middleware si tiene que
  contestar—. La description de la ficha tambien deberia dejar de hablar de «membresia», como ya se
  corrigio en los docs del arnes.

### QC-64 — editor-y-lectura-de-pasos: arranque del 2026-09-06 (F1.0–F1.2)

Arrancada por decisión humana explícita («avanza con 64»), no por el orden de `id`.

- **Nada que evaluar**: `zone: frontend`, `complexity: high`, `depends_on: QC-62` y `branch` ya
  venían asignados de la partición del 2026-09-04, y las labels están en el board desde entonces.
  No hizo falta empujar nada a Jira en F1.0.
- **`depends_on` satisfecha**: QC-62 está `done` y mergeada (PR #36, merge `aa4d551`).
- **Cupo de zona**: `frontend` tiene **0** features `in_progress` — QC-44 cerró con el PR #35 y su
  fila en la tabla de arriba había quedado desactualizada en `in_progress`; corregida hoy. QC-35
  sigue `pending`. No hubo que validar conflicto de archivos porque no hay nada `in_progress` en la
  zona con lo que chocar.
- **Worktree montado** en `.worktrees/QC-64-editor-y-lectura-de-pasos` desde `dev`, que hoy
  coincide con `origin/dev` (`30d0266`): el worktree nace con QC-62 dentro, que es la condición
  para poder escribir contra su contrato.
- **F1.2 sin `/afinar-feature`**: `requirements.md` ya estaba sembrado el 2026-09-04 (alcance, 10
  decisiones cerradas, 2 preguntas abiertas). `spec_author` solo rellena `## Requisitos (EARS)` y
  escribe `design.md` y `tasks.md`, dentro del worktree.
- **La librería del editor se aprueba con el spec (F1.4)**, por la regla 7: el `design.md` la
  propone con los cuatro checks y su fila para `docs/dependencias.md`; la fila **no** se añade
  hasta que el humano apruebe.
- **Spec escrito y tarjeta en *En revisión* (F1.2–F1.3).** R1–R28, `design.md` y T1–T15 en el
  commit `0044950` de la rama. `spec_author` dejó la tabla de los cuatro checks **en blanco** y
  lo dijo, porque corre sin shell ni red; **los corrió el leader** y los cuatro **pasan** en los
  nueve paquetes de TipTap `3.31.3`. Verificado además **sobre el paquete publicado** (`npm pack`)
  que `TaskList`/`TaskItem` viven en `@tiptap/extension-list`: **nueve** entradas directas, no
  once. Las nueve filas de `docs/dependencias.md` **no se escriben hasta la aprobación**.
- **Aprobada por el humano el 2026-09-06 (F1.4 → F2.0).** Con el spec entra la **dependencia**:
  nueve entradas de TipTap fijadas a `3.31.3`, todas `aprobada` y ninguna `excepcion`, escritas en
  `docs/dependencias.md` **antes** de instalar nada (commit `3c26268`). Tarjeta en *En curso* y
  `implementer` lanzado desde **T2**; T1 queda cerrada.

### QC-62 — pasos-de-receta-enriquecidos: nacida, acotada, sembrada y **partida** (2026-09-04)

- **Nació en esta sesión.** La ficha no existía en el board y `/afinar-feature` paró por su guarda
  del paso 0. Se creó **QC-62** en Jira (épica QC-27 Recetas) y después se acotó.
- **Sembrada** en `specs/QC-62-pasos-de-receta-enriquecidos/requirements.md` y
  `specs/QC-64-editor-y-lectura-de-pasos/requirements.md`. La fuente son esos archivos; aquí no se
  copian las tablas.
- **Partida en dos (F1.0)**, por decisión humana explícita al aplicar la regla de partición de
  `fullstack` de `AGENTS.md > F1.0`: **QC-62** se queda con el contrato (`zone: backend`,
  `complexity: medium`) y **QC-64 — editor-y-lectura-de-pasos** nace con la pantalla
  (`zone: frontend`, `complexity: high`, `depends_on: QC-62`). Las 12 decisiones cerradas de la
  acotación se repartieron entre las dos: 8 al contrato, 10 a la pantalla, ninguna se perdió ni se
  duplicó con distinto texto.
- **Board actualizado antes de sembrar (Paso 5):** `description` de QC-62 reescrita dos veces —la
  segunda al partir—, labels `zone:backend` y `complexity:medium`; **QC-64** creada con
  `zone:frontend`, `complexity:high` y link *is blocked by* → QC-62; y **QC-63 —
  ejecutar-receta-operador** creada antes de la partición, ahora bloqueada también por QC-64, que
  es quien construye el componente que ella necesita.
- **Decisión destructiva y consciente**: la migración de QC-62 **deja sin pasos** a las recetas
  existentes. No se convierten. Es irreversible y está escrita así en el spec.
- **Dependencia sin cerrar**: el editor enriquecido entra por el `design.md` de **QC-64** con los
  cuatro checks, y se aprueba con ese spec (F1.4). El diseño apunta a TipTap/ProseMirror, **sin
  cerrar**.
- **Sin conflicto de archivos con QC-47** (`backend`, `in_progress`): QC-47 vive en
  `db/schema.prisma` y en el módulo de multiempresa; QC-62 **no abre `db/schema.prisma`** por
  decisión cerrada y se queda dentro de `lib/modules/recetas/`.
- **Diseño acordado** (tres direcciones exploradas, elegida la C):
  https://claude.ai/code/artifact/fef7d60d-55c7-4ace-ad59-43415b442319

### QC-57 — orden-y-filtro-en-listados: acotada y sembrada (2026-09-04)

- **Sembrada en `specs/QC-57-orden-y-filtro-en-listados/requirements.md`** — 19 decisiones cerradas
  y 2 preguntas abiertas. La fuente es ese archivo; aquí no se copia la tabla.
- **Board actualizado antes de sembrar (Paso 5)**: `description` reescrita y label
  `complexity:high`. Ninguna ficha nueva ni huérfana.
- **El alcance creció respecto a la ficha de ayer, por decisión del humano**: contrato genérico
  y abierto para **las siete listas**, no solo las dos que QC-56 necesita; **la búsqueda pasa a
  ignorar acentos**; y **los índices entran aquí**, lo que convierte la ficha en una que **trae
  migración** en vez de ser backend puro sin esquema.
- **Dos cosas que la acotación descubrió leyendo el repo y que la ficha de ayer daba por falsas**:
  productos **ya** busca por nombre (`productQuerySchema`, del selector de ingredientes) y pedidos
  **ya** filtra por estado y prioridad (QC-34). Las dos **se migran** al contrato nuevo, lo que
  obliga a adaptar sus llamantes.
- **`pageQuerySchema` está copiado en cuatro módulos y NO se unifica**: el dominio no puede
  importar `lib/shared/` (QC-15). La duplicación es deliberada y queda escrita para que nadie la
  «arregle».
- **QC-44 verificada como cerrada** (PR #35, *Finalizado*), así que el choque que se temía sobre
  el listado de proveedores no existe.

### QC-35 — pantalla-de-pedidos: F1.0 (2026-09-04)

- **Arranca porque se despejaron las dos cosas que la bloqueaban el mismo dia**: su `depends_on`
  **QC-34** paso a `done` (PR #34, merge `4c98fe1`) y **QC-44** cerro (PR #35, merge `f966a7b`),
  que era el choque de archivos real — las dos pantallas necesitan `lib/shared/routes.ts`,
  `lib/shared/navigation/private-nav.ts` y `lib/composition/route-role-rules.ts`. Con QC-44 en
  `done`, la zona `frontend` queda con **cero** features `in_progress` y sin interseccion viva.
- **`complexity: high`**, evaluada aqui y escrita como label en el issue (no la traia). Mismo
  criterio que **QC-26** y **QC-44**, las dos pantallas comparables: lista paginada con filtros,
  formulario de alta y edicion, una accion propia con dialogo —cancelar, que exige motivo— y
  estados prohibidos que la interfaz tiene que reflejar en vez de dejar intentar.
- **Lo que cambio el terreno desde que se escribio la ficha:** **QC-55** mergeo la **tabla de
  datos compartida** (`components/shared/`), que hasta hoy no tenia ningun consumidor. Si esta
  pantalla la estrena o copia el esqueleto de productos y recetas es **decision de la acotacion**,
  no del spec, y arrastra a **QC-56**.
- Worktree montado en `.worktrees/QC-35-pantalla-de-pedidos` desde `origin/dev` ya sincronizado.
- **F1.2 en pausa**: la propia `description` dice que la forma de la pantalla se decide al acotar,
  y QC-34 le hereda dos preguntas abiertas (si la consulta devuelve el total calculado y si la
  edicion es reemplazo completo). Se corre `/afinar-feature` antes de lanzar `spec_author`.

### QC-58 — arranque del 2026-09-07 (F1.0)

Arrancada por **decisión humana explícita** («arranca 58»), no por el orden de `id`: por `id` la
primera `frontend` desbloqueada era **QC-45** (`pantalla-de-presentaciones`). Se prefiere QC-58
porque **QC-74 termina en T18 «gate completo»** y el flake dejaría ese cierre en rojo intermitente.

- **Cupo y conflicto, los dos verdes.** `frontend` tenía **cero** features `in_progress`. La única
  `in_progress` del repo es QC-74, de zona `backend`, que toca `lib/modules/**` y `db/`: cero
  intersección con lo que QC-58 va a tocar (`vitest.config.mts`, `tests/**`).
- **Zona, complexity y branch ya venían evaluadas** del board (`frontend`, `medium`,
  `feature/QC-58-timeout-tests-ui-bajo-carga`). No hizo falta empujar labels a Jira.
- **El worktree hubo que rebasarlo, y no es un detalle.** `wt.sh new` lo creó desde `origin/dev`
  (`fa116cd`), pero **`dev` local va 10 commits por delante y sin pushear**, y esos commits son
  justo la superficie que esta ficha tiene que estabilizar: `5e66471` (el primitivo de
  autocomplete y su hook de consulta paginada) y los tres refactores que pasan los selectores de
  ingrediente, receta y presentación a ese componente (`bf9f165`, `7ac616b`, `df76e44`). Medir el
  plazo contra un árbol sin eso sería medir el código equivocado. Se hizo `git reset --hard dev`
  sobre la rama recién creada —local, reversible, la rama aún no tenía trabajo— y `pnpm install`.
- **Deuda que esto abre, y hay que cerrarla antes de F2.4:** la rama cuelga de un `dev` que el
  remoto no conoce. Mientras `dev` no se pushee, el PR hacia `dev` arrastraría los 10 commits.

**Terreno medido antes de especificar** (en el worktree, sobre `df76e44`):

- **224 llamadas a `userEvent.setup()` repartidas en 33 archivos.** Solo **2** pasan opciones.
- **`tests/unit/recetas-ui/recipe-form.test.tsx:201` ya usa `{ delay: null }`.** El arreglo que la
  ficha propone ya tiene precedente dentro del repo, aplicado a mano en un solo archivo.
- **`tests/unit/async-autocomplete.test.tsx:248` usa `{ delay: 20 }` a propósito**, por el debounce
  del autocomplete. Un `delay: null` global y ciego lo rompería: el arreglo **tiene que admitir
  excepción explícita**, y eso es una decisión de acotación, no un detalle de implementación.
- **`vitest.config.mts` no fija `testTimeout` en ningún proyecto**: el proyecto `ui` corre con el
  default de 5000 ms, que es exactamente el número del error.
- El proyecto `ui` es `tests/**/*.test.tsx` + `tests/ui/**/*.test.ts`, con `setupFiles:
  ['./tests/setup.ts']`, que hoy solo importa `@testing-library/jest-dom/vitest`. Es el punto
  natural donde un helper compartido de `userEvent` podría vivir sin tocar 33 archivos.

**El gate completo corrido en `dev` el 2026-09-07 amplía el alcance de la ficha.** Terminó en rojo
con 4 fallos; los dos que no estaban en el baseline se corrieron solos, como manda
`docs/verification.md`, y **los dos pasan en aislado**:

| Fallo | Aislado | Qué es |
|---|---|---|
| `tests/unit/composition/identity-facade.test.ts` | 5/5 en 2,5 s | `Test timed out in 5000ms` en `await import('@/lib/composition')` |
| `tests/integration/pedidos/order-repository.int.test.ts` | 7/7 en 1,5 s | colisión `(order_year, order_sequence)=(2882,1)` |
| `tests/unit/proveedores-ui/catalog-line-sheet.test.tsx` | (en baseline) | el flake de esta ficha, vivo |
| `tests/unit/recetas-ui/recipe-route-contract.test.ts` | (en baseline) | falla por la migración de QC-35 en el diff, **no** por el motivo que dice su nota de baseline |

Dos consecuencias, las dos para la acotación:

1. **La ficha se queda corta al acotar el arreglo al proyecto `ui` y a `userEvent`.**
   `identity-facade.test.ts` corre en el proyecto **`node`**, no teclea nada, y muere con el mismo
   `Test timed out in 5000ms` cargando el barril de composición. O sea que el plazo de 5 s es corto
   también para *importar*, no solo para teclear — que es exactamente lo que la propia reescritura
   de la ficha dice («la causa no es cuántos procesos hay sino que el plazo es demasiado corto»),
   pero su alcance escrito no lo recoge. Hay que decidir si `testTimeout` sube en los tres
   proyectos o solo en `ui`.
2. **Apareció una enfermedad distinta que no es de QC-58 y hoy no tiene ficha.** La colisión de
   `order-repository.int.test.ts` es estado residual en la base de integración compartida, no
   plazo: el proyecto `integration` ya corre con `fileParallelism: false` y aun así choca en la
   clave `(order_year, order_sequence)`. No entra aquí; necesita ficha propia en el board.

Y una corrección a `tests/baseline-rojos.json` que esta ficha debería llevarse por delante:
`recipe-route-contract.test.ts` está listado por el motivo estructural del rango de git vacío, pero
hoy falla por **otra** cosa —la migración de QC-35 aparece en el diff—. La nota miente sobre por
qué está ahí.

### El flake de la suite de UI no es de paralelizacion, y casi me cuesta el gate (2026-09-04)

Al cerrar QC-47 aparecieron rojos en archivos que la ficha no toca, y cambiando de archivo en cada
corrida. **Diagnostiqué mal**: dije que era saturación por workers y que `--maxWorkers=2` lo
curaba, apoyándome en **una** corrida verde. Repetida, volvió a fallar. Lo medido, sobre la misma
rama y la misma máquina (12 núcleos, 3,4 GB libres): por defecto 2 archivos rojos en 114 s; con 4
workers 1 rojo en 335 s; con 2 workers **1 rojo en 541 s**. Bajar workers multiplica por cinco el
gate y no elimina el fallo.

La causa real es la que **QC-58 ya describía bien desde el principio** y yo desestimé: el plazo de
5 s es demasiado corto para `userEvent` en una máquina cargada. El error es siempre
`Test timed out in 5000ms`. Lección para el arnés: **una corrida verde no es prueba de nada**
cuando el fallo que investigas es intermitente — hay que repetir antes de concluir, y yo no lo hice
antes de proponer un arreglo.

- Escrito en `docs/verification.md > Los flakes de saturación: qué son, y qué NO los cura`, con la
  tabla de medidas y el criterio barato para distinguirlo de un rojo de verdad (correr el archivo
  solo).
- **QC-58 reescrita en el board**: pasa de «el flake del formulario de productos» a la causa real,
  con la limpieza del baseline dentro. Nuevo slug `timeout-tests-ui-bajo-carga`.
- **El baseline pasó de 3 a 5 entradas por mi mano** (las dos de `proveedores-ui`), y eso es
  justo el vertedero contra el que avisa su propia nota. Se retiran **todas** las de esta causa en
  el cambio que arregle el plazo, no antes.

### QC-47 — modelo-empresa-y-membresias: acotada y sembrada (2026-09-04)

- **Sembrada en `specs/QC-47-modelo-empresa-y-membresias/requirements.md`** — 15 decisiones
  cerradas y 3 preguntas abiertas. La fuente es ese archivo; aquí no se copia la tabla.
- **Board actualizado antes de sembrar (Paso 5):** `description` reescrita y label
  `complexity:high` (era `medium`). Lo que la subió: **el rol sale de `users` y pasa a la
  pertenencia**, así que la ficha arrastra el seed (QC-6) y el login (QC-7), y su `down.sql`
  tiene que devolver `role_id` a `users`.
- **Antes hubo que reescribir una regla del arnés**, y no era opcional: `docs/architecture.md >
  Dominio` decía como regla no opinable «un solo tenant, no hay `empresa_id` ni aislamiento por
  tenant», que es exactamente lo que el `reviewer` habría citado para rechazar QC-47 entera.
  Corrida de `/afinar-regla` en el commit `3b9b464`: el punto 1 pasa a **multiempresa en los
  datos de operación, un solo sistema en la identidad**, con línea nueva en `reviewer.md`,
  casilla nueva en `CHECKPOINTS.md` y la pregunta abierta del dominio n.º 5 (moneda por empresa,
  porque QC-14 y QC-42 cerraron «la moneda es implícita» citando la regla vieja).
- **Tres fichas nuevas en el board**, todas deuda que la épica QC-46 se había dejado fuera:
  **QC-59** aislamiento en proveedores y **QC-60** en pedidos (los dos módulos ya construidos que
  nadie iba a aislar), y **QC-61**, la guardia de esquema que hace cumplir la columna de empresa —
  sale como ficha porque es código y `/afinar-regla` solo escribe markdown del arnés.
- **El aviso de conflicto con QC-34 de más arriba quedó obsoleto el mismo día**: otra sesión cerró
  QC-34 y QC-55 mientras esto se acotaba, así que `backend` queda sin nada en curso y F2.0 de
  QC-47 ya no espera a nadie. Lo que sí sigue vivo: el worktree nació de `origin/dev` (`855fae6`)
  y le faltan los merges posteriores — hay que traerlos antes de lanzar `spec_author`.

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

> **SUPERADA el 2026-09-04 por la sesión de arranque de QC-44.** QC-52 se mergeó en `dev`
> (PR #32, merge `855fae6`) y otra sesión está haciendo su cierre; el humano dio la orden
> de arrancar. Lo que sigue queda como registro de por qué esperó, no como estado actual.

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

### QC-34 — crud-de-pedidos: CERRADA el 2026-09-04 (PR #34, merge `4c98fe1`)

Resumen completo en `progress/history.md`. El alcance y las 25 decisiones cerradas al acotar
viven en `specs/QC-34-crud-de-pedidos/requirements.md`. **Desbloquea QC-35.**

- **QC-52 acotada con `/afinar-feature` el 2026-09-03.** Alcance, 16 decisiones cerradas y 3 preguntas abiertas en `specs/QC-52-separar-producto-de-catalogo-de-proveedor/requirements.md`; no se copian aquí. Nació de una decisión del humano posterior al merge de QC-43 y **arrastra tres features ya mergeadas** (QC-20, QC-22 y el propio QC-43, del que se caen las reglas que dependían del producto). El board se actualizó antes de sembrar: `description` reescrita y `complexity: high` asignada. También se importaron a `feature_list.json` las fichas **QC-52** y **QC-54**, creadas en el board despues de la ultima F0.
- **QC-44 acotada con `/afinar-feature` el 2026-09-04.** Alcance, 26 decisiones cerradas y 3
  preguntas abiertas en `specs/QC-44-pantalla-de-proveedores/requirements.md`; no se copian aqui.
  El board se actualizo ANTES de sembrar: `description` reescrita contra la forma post-QC-52 y
  link *is blocked by* **QC-52** anadido, porque esa ficha borra el `product_id` de la linea que
  la pantalla iba a mostrar. `complexity: high`.

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

### ~~`dev` local y `origin/dev` DIVERGIERON~~ → RESUELTO Y PUSHEADO (2026-09-07)

> **Cerrado el mismo día.** Merge `af5d258`, `dev` pusheado (`95b9b51..af5d258`) y las dos ramas
> en sync. Gate completo **verde**: 233/233 archivos, 2842/2842 tests, cero rojos — incluidas las
> 5 entradas del baseline, que esta corrida pasaron todas.
>
> **El criterio que resolvió los 7 conflictos, en una línea: la autorización de QC-74 gana, la
> forma del pedido local gana.** No eran alternativas, eran ejes distintos que cayeron en las
> mismas funciones. Detalle archivo por archivo en el mensaje de `af5d258`.
>
> **Dos cosas que el conflicto no dijo y hubo que ver aparte:**
>
> 1. **`UnitNotFoundError` no se podía reimportar.** Los dos lados del conflicto lo incluían en la
>    lista de errores, pero el `errors.ts` ya mergeado no lo exporta —su propio comentario dice
>    que desapareció con la unidad—. Aceptar cualquiera de los dos lados tal cual rompía el
>    typecheck.
> 2. **Una baja del automerge, sin conflicto y rota igual.** QC-74 reescribió
>    `tests/unit/inventario/authorization.test.ts` en otra rama mientras aquí entraba la columna
>    de imagen del producto. Tocaron líneas distintas, git no dijo nada, y el fixture
>    `PRODUCTO_EN_BASE` quedó sin el `imagePath` que `ProductView` ahora exige. **Lección: en un
>    merge de dos ramas largas, los conflictos que git marca son el suelo, no el techo — el
>    typecheck encontró lo que el merge no.**
>
> **Falsa alarma que costó un rato, anotada para no repetirla:**
> `tests/unit/pedidos-ui/pedidos-convenciones.test.ts` se puso rojo acusando a QC-35 de tocar
> `lib/modules/recetas/**` y `lib/modules/unidades/**`. No era cierto: ese centinela suma
> `git status --porcelain` al rango de commits, y con el merge **staged** el árbol tenía los ~140
> archivos de QC-74 encima. Se puso verde solo al commitear el merge. Correr un centinela de
> alcance con un merge a medias en el índice no informa de nada.
>
> **La deuda de la rama de QC-58 quedó cerrada**: se rebasó sobre el `dev` unificado (`af5d258`) y
> ya tiene QC-54, QC-74, el autocomplete y los cambios de pedidos.
>
> Lo que sigue abierto, y no es de este merge: hubo que correr `prisma generate` por los modelos
> nuevos y dio `EPERM` —otra sesión tenía el motor bloqueado—. Alcanzó a regenerar los tipos y el
> gate pasó, pero conviene repetirlo limpio cuando las demás sesiones paren.

#### Lo que decía mientras estaba abierto

**No es un problema de QC-58; lo encontro QC-58 al montarse.** Al intentar publicar `dev` el push
salio rechazado por *non-fast-forward*: las dos ramas se habian separado. Van **15 commits
locales** que el remoto no tiene y **18 remotos** que el local no tiene.

Lo que trae `origin/dev` y aqui no esta: **QC-54 entero** (los 10 commits que unifican
`ROLE_ADMINISTRADOR` y `requireAdmin`) y **QC-74 ya mergeado por otra sesion** — esta su migracion
`db/migrations/20260907183034_permissions_and_role_permissions`. Lo que hay aqui y alla no: el
primitivo de **autocomplete** (`5e66471`) con los tres refactores de selector, el cambio de pedidos
que **quita unidad y precio unitario** (`dee47c1`), el interruptor de tema, la columna de imagen y
el rename de `product-columns`.

**El merge se probo y se aborto.** `dev` quedo limpio en `1b87bb4`, sin conflictos en el arbol,
porque hay al menos otras dos sesiones trabajando encima y dejarlo a medias las bloquearia. Un
`git merge-tree` previo habia dado limpio, pero fue contra una foto vieja: entre ese probe y el
merge real se movieron **las dos** puntas. Leccion: el probe de merge caduca en cuanto otra sesion
commitea, asi que vale para decidir, no para prometer.

**Los 6 archivos en conflicto, y por que.** El choque es la interseccion de QC-74 —que sustituye
«es Administrador» por `assertPermission` dentro de cada servicio— con el trabajo local de pedidos
—que le quita al pedido la unidad y el precio unitario—. Los dos reescriben las mismas funciones:

| Archivo | Naturaleza |
|---|---|
| `lib/modules/pedidos/domain/create-order.ts` | semantico: autorizacion (QC-74) vs. firma sin unidad/precio (local) |
| `lib/modules/pedidos/domain/get-order.ts` | idem |
| `lib/modules/pedidos/domain/update-order.ts` | idem |
| `tests/unit/pedidos/authorization.test.ts` | los tests de las dos versiones de la regla |
| `tests/unit/recetas-ui/recipe-route-contract.test.ts` | el centinela de alcance por diff, tocado por los dos lados |
| `feature_list.json` | estado del board escrito en paralelo por dos sesiones |
| `specs/QC-74-modelo-de-permisos/requirements.md` | add/add: sembrado dos veces, aqui y en la rama que se mergeo |

**Ninguno es trivial y ninguno lo resuelve el leader**, que por `CLAUDE.md` no edita codigo. Son
decisiones de que version de la regla de autorizacion sobrevive sobre una firma que cambio debajo.
Va a `implementer` con las dos ramas delante, o al humano.

**Consecuencia para QC-58, a cerrar antes de F2.4:** su rama se rebaso sobre `dev` local, o sea que
hoy le faltan QC-54 y QC-74. En cuanto `dev` integre `origin/dev` hay que volver a rebasarla.
Mientras tanto la ficha se puede especificar sin problema —toca `vitest.config.mts` y `tests/**`,
no `lib/modules/**`—, pero **no se puede dar por medida**: el arreglo del plazo hay que demostrarlo
contra el arbol unificado, no contra este.


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

### El flake de saturación ya no es una molestia: es una puerta cerrada (2026-09-08)

**Ninguna feature de este repo puede enseñar hoy un `./init.sh` completo en verde**, y eso bloquea
el F2.4 de todas. Medido desde QC-38, dos corridas completas seguidas sin tocar una línea entre
medias:

| Corrida | Archivos en rojo fuera del baseline |
| --- | --- |
| 1 | `composition/identity-facade`, `pedidos-ui/order-form`, `pedidos-ui/order-sheet` |
| 2 (tras meter esos tres en el baseline) | `ui/login-form-uncontrolled-warning` — que en la 1 estaba verde |

Los cuatro **pasan en aislado**. El conjunto **rota**, así que el baseline no lo absorbe: llenarlo
a mano es lo que su propia cabecera llama «un vertedero», y encima el gate ya avisa de que **4 de
sus 5 entradas ya pasan**. Se revirtieron las tres que se habían añadido, por decisión del humano.

**Lo arregla QC-58**, que está en vuelo y avanzando (12/17 tasks, commit `6454043`). QC-38 queda
lista y esperándola: su PR se abre en cuanto QC-58 mergee. La suite completa da **3187 de 3213
verdes**, con `typecheck`, `lint` y `tests/integration` entero limpios.

### Dos agujeros del gate arreglados desde QC-38 (2026-09-08)

Los dos por `/afinar-regla`, y **entran por la rama de QC-38** —no por `dev`— porque `dev` local
está **26 commits por detrás** de `origin/dev`, ni siquiera tiene el archivo del centinela, y
arrastra trabajo sin commitear de otra sesión. Commit `7cd478b`.

1. **`init.sh` no cargaba el `.env`.** La integración se conecta con `DATABASE_URL` y nadie la
   cargaba por ella: `prisma.config.ts` solo lo hace para el CLI de Prisma y Vitest no lee `.env`
   en este proyecto. El veredicto del gate dependía del shell que lo lanzara —la misma rama dio
   **23 archivos y 32 tests en rojo** desde un shell limpio y **1 archivo y 2 tests** con el `.env`
   cargado—, y el rojo se leía como fallo de código porque Prisma dice «Validation Error» y no
   «falta una variable». Ahora lo carga el gate, salvo que `DATABASE_URL` venga ya del entorno.
2. **El centinela de QC-75 ponía en rojo el gate de todas las demás ramas.** Exigía que el diff
   `origin/dev...HEAD` contuviera su propio `private-nav.ts`; sabía saltarse desde `dev` —rango
   vacío— pero en cualquier otra rama de feature fallaba, y su caso de R22 marcaba como
   «intocables» archivos que otras fichas sí tocan con permiso del humano (a QC-38 le saltó por el
   catálogo de permisos). Ahora se salta cuando el rango no trae su archivo central; **en la rama
   de QC-75 se comporta exactamente igual que antes**. Ojo: el archivo es de QC-75, que está en
   vuelo, así que puede darle un conflicto pequeño al mergear.


### QC-58 es MÁS ANCHA de lo que dice su ficha: el plazo de 5 s, no `userEvent` (2026-09-08)

**Medido, no supuesto.** Al correr `./init.sh` completo en el worktree de QC-45 salieron 6
archivos rojos fuera del baseline. Los seis **reproducen en `dev` limpio**, sin esa rama de por
medio, así que ninguno era de QC-45.

Lo que importa es **por qué**. Uno de ellos, `tests/unit/composition/identity-facade.test.ts`,
fallaba **los mismos 5 casos en dos corridas seguidas** y parecía una regresión determinista de la
tanda que se mergeó en cuatro horas (QC-74, QC-75 y QC-76). No lo era: el error no es una
aserción sino `Test timed out in 5000ms`, y **con `--testTimeout=30000` pasa 5/5**.

**Y ese archivo es `|node|`: no monta UI y no usa `userEvent`.** La ficha QC-58 describe el
problema como un flake de `userEvent` escribiendo en formularios controlados —«las teclas llegan
intercaladas»—. Esto demuestra que la causa es **más simple y más ancha**: el plazo por defecto de
**5 s es corto bajo carga**, con o sin `userEvent`. Quien acote QC-58 debería partir de aquí, y no
de la hipótesis del retardo entre teclas.

**La carga tiene nombre:** tres sesiones de Claude corriendo suites a la vez en la misma máquina.
Un gate que compite con otros dos no mide el código, mide la máquina. **Los otros cinco rojos
—`order-form`, `order-sheet`, `recipe-picker`, `data-table-filter-date`, `sidebar-mobile`—
cambiaron entre dos corridas consecutivas**, que es la firma del flake.

**Nada se añadió a `tests/baseline-rojos.json`:** un rojo que desaparece subiendo el plazo no es
deuda de `dev`, y el propio archivo advierte contra volverse un vertedero.

### QC-38 — arranque del 2026-09-08 (F1.0/F1.1)

Arrancada por decisión humana explícita («arranca»), y es la ficha que se pidió al abrir la
sesión: entonces estaba **bloqueada** por `depends_on`, y QC-76 se hizo para desbloquearla.

- **Las tres dependencias, `done`**: QC-32 (el catálogo), QC-76 (equivalencia y ámbito, mergeada
  hoy en el PR #45) y QC-74 (el modelo de permisos).
- **Cupo y conflicto, los dos verdes.** `backend` tiene **cero** features `in_progress` —QC-23
  sigue en `spec_ready` esperando aprobación humana—. Las tres en vuelo son QC-45 y QC-58
  (`frontend`, el máximo de su zona) y QC-75 (`fullstack`). Sin intersección: ninguna toca
  `lib/modules/unidades`.
- **Zone, complexity y branch ya venían evaluadas** del board (`backend`, `medium`). Sin empujón
  a Jira en este paso.
- **Worktree desde `origin/dev`**, que ya contiene QC-76: esta ficha construye encima de su
  esquema, así que colgarla de otra base sería construir sobre un modelo que no existe.
- **El validador del gate pasó desde dentro del worktree a la primera** — es la primera ficha que
  estrena el arreglo del arnés (`05d47f5`) que QC-76 tuvo que hacer para poder cerrarse.
- **F1.2 sin escala en `/afinar-feature`**: el requirements está sembrado y con **cero preguntas
  abiertas**. Además esa acotación cerró la **pregunta abierta 5 de QC-32** («¿un nombre en blanco
  es un nombre?»), con lo que QC-32 se queda sin ninguna viva.


### QC-76, al cerrar (2026-09-08)

- **`wt.sh done` falló en Windows por OCTAVA vez.** Desregistró el worktree de git —`git worktree
  list` ya no lo muestra— pero dejó el árbol en disco, y esta vez el `rm -rf` de remate **también
  falló**: `Device or resource busy`, dos intentos. Queda `.worktrees/QC-76-equivalencia-y-ambito-de-unidades`
  huérfano, sin registrar y sin trabajo dentro que perder (rama mergeada en `dev`, merge `5ee52fe`).
  Se puede borrar a mano cuando ningún proceso lo tenga abierto. **Sigue sin ficha**, y ya es la
  octava: `AGENTS.md > Worktrees` dice que un HOLD no bloquea el cierre, y no lo bloqueó, pero
  esto ya no es un HOLD de la guarda sino un fallo del propio desmontaje.
- **Cuatro archivos del baseline ya pasan** y el gate avisa de que tocaría limpiarlos:
  `tests/unit/inventario/product-page.test.tsx`, `tests/unit/proveedores-ui/catalog-line-sheet.test.tsx`,
  `tests/unit/proveedores-ui/supplier-page.test.tsx` y `tests/unit/recetas/module-contract.test.ts`.
  Un baseline que lista rojos que ya no existen deja de medir lo que dice medir.
- **QC-77 (`aislamiento-de-la-base-en-tests-de-integracion`) sigue `pending` y sin acotar**, y esta
  ficha la justificó sola: la base de desarrollo es compartida entre worktrees, así que aplicar una
  migración desde una rama rompe los tests de integración de TODAS las demás hasta que esa rama
  mergea. La sesión de QC-45 lo reportó desde el otro lado.
- **Dos menores del reviewer salen sin cerrar**: R37 se cierra por inspección sin test directo, y
  `docs/architecture.md > Dominio` sigue listando «unidades (QC-51)», ficha cancelada al acotar QC-76.


### La base de desarrollo es COMPARTIDA y ya rompió el gate de otra feature (2026-09-08)

**Síntoma:** `./init.sh` completo da rojo en **14 archivos, todos de `tests/integration/`**, en el
worktree de QC-45 — que no toca ni la base ni unidades.

**Causa, verificada y no supuesta:** la migración `20260907190000_units_equivalence_and_scope`
(de **QC-76**) **NO está en `dev`** —vive solo en su rama— pero **sí está aplicada a la base
compartida**, y crea `units_system_symbol_unique`. Los fixtures de integración siembran
`symbol: 'x'` fijo (`tests/integration/unidades/unidades-constraints.int.test.ts` y
`unit-repository.int.test.ts`) porque se escribieron cuando el símbolo **no** era único. Así que
cualquier worktree cuyo `schema.prisma` no tenga aún ese índice corre contra una base que sí lo
tiene. **Rompe a todos: pedidos, proveedores y recetas también siembran unidades.**

**Por qué importa más de lo que parece:** el arnés exige `./init.sh` completo en verde **antes de
cada PR, sin excepción** (regla 5 de `CLAUDE.md`). Mientras esto siga así, **ninguna feature puede
abrir PR**, y no por un fallo suyo.

**Lo que NO se hizo, y con criterio:** no se añadió a `tests/baseline-rojos.json` —no es deuda de
`dev`, es un estado transitorio de una base— ni se limpiaron filas a mano, porque tocar esa base
rompería a las otras dos sesiones.

**Salidas posibles:** que **QC-76 mergee** (entonces el esquema de `dev` coincide con la base y los
fixtures se actualizan **en QC-76**, que es quien introduce la restricción); que aterrice **QC-77**
(`aislamiento-de-la-base-en-tests-de-integracion`, ya en el backlog, que es exactamente esto); o
resetear la base compartida, que rompería a quien esté a media migración. **Decisión del humano.**

### El puerto 3117 de Playwright es fijo y compartido (2026-09-08)

Dos E2E de worktrees distintos **se excluyen entre sí**. Además el proceso de Playwright no carga
`.env` por su cuenta: hay que exportar las variables. Anotado al correr los E2E de QC-45.

### `docs/jira.md` documenta cinco columnas del board que ya no existen (2026-09-07, hallazgo de QC-54)

Al hacer F1.3 de QC-54 la tabla de `docs/jira.md > 3` no sirvió: mapea `Backlog`,
**`Spec en revisión`**, `En curso`, `Hecho` y `Cancelado`, y el board real tiene **`Por hacer`,
`En curso`, `En revisión`, `Finalizado` y `Cancelado`**. Tres de los cinco nombres cambiaron, y
el que más importa —la puerta de aprobación humana— es justo uno de ellos.

**No lo resolví adivinando: lo resolví leyendo el precedente.** QC-23 lleva desde el 2026-09-03 en
`spec_ready` y su tarjeta está en **`En revisión`** (id de transición `31`). O sea la convención
viva del board es `spec_ready` → *En revisión*, y así se movió QC-54.

**Por qué queda aquí y no arreglado:** `docs/jira.md` es arnés, y el arnés se cambia por
`/afinar-regla` (CLAUDE.md, mapa rápido), no en caliente desde el ciclo de una feature. El parche
es la tabla de columnas y las dos menciones a *Spec en revisión* de las líneas ~40 y ~173-174.
Mientras no se aplique, cada F1.3 futuro vuelve a tropezar con lo mismo.

### FALSA ALARMA, y la lección vale más que el susto: el gate rojo era `dev` atrasado (2026-09-06)

**Anulada la nota que ocupaba este sitio.** Decía que el gate de `dev` estaba rojo porque el
worktree de **QC-57** había escrito su migración en la base compartida `QuimiCloude` teniendo el
`.env` mal apuntado. **Era falso y la conclusión estaba invertida.**

Lo que pasaba de verdad: **QC-57 ya estaba mergeada** (PR #38, `738d9a9`, mergeado el 2026-09-07
02:33Z) y también QC-47 (PR #37, 02:27Z). La base compartida no estaba adelantada: estaba **al
día**. Quien estaba atrasado era el **worktree principal**, parado en `30d0266`, con un
`schema.prisma` anterior a `products.name_normalized`. Por eso `product.create()` moría: el código
no escribía una columna `NOT NULL` que la base ya exigía **con razón**.

- **El error de razonamiento, para no repetirlo:** `prisma migrate diff` dice **qué** difiere, no
  **quién** se movió. Ver una columna en la base y no en el `schema.prisma` admite dos lecturas
  —la base se adelantó, o el código se atrasó— y elegí la primera porque encajaba con cinco
  incidentes previos de drift entre worktrees. El precedente hizo de atajo y el atajo estaba mal.
  **`git fetch && git log dev..origin/dev` habría costado tres segundos y era la pregunta
  correcta**; el `.env` de QC-57 apuntando a la compartida es cierto pero **no era la causa**, y
  fue justo lo que confirmó la hipótesis equivocada.
- **Lo aportó el humano, no el diagnóstico:** «57 ya fue mergeada». Sin esa frase el arreglo
  propuesto —aplicar el `down.sql` de QC-57 a la base— **habría roto la base compartida de
  verdad**, quitándole una columna que `dev` ya necesita. Que la decisión fuera «no toques nada»
  es lo único que dejó el error sin coste.
- **Lo que sí queda en pie de la nota anulada**, porque se midió aparte: `sidebar-mobile.test.tsx`
  con `STACK_TRACE_ERROR` es el **flake de saturación** —corrido solo pasa 7/7—, y los dos
  `module-contract` con «el rango `origin/dev...HEAD` no estaba disponible» siguen en el baseline
  con un motivo escrito que ya se sabe equivocado. Esa segunda sigue siendo candidata a
  `/afinar-regla`.
- **Deuda real que esto destapa:** nada en el arranque de sesión comprueba que el worktree
  principal esté a la altura de `origin/dev`. `CLAUDE.md > Arranque de sesión` manda importar el
  board y correr `./init.sh`, y ninguno de los dos mira el remoto — así que la sesión arranca
  contra un `dev` viejo sin que nada lo diga, y el gate falla por un motivo que no tiene que ver
  con lo que se está haciendo. Ya pasó antes (ver «El worktree principal quedó fuera de `dev`»,
  2026-09-03): **es la segunda vez**. Candidata a `/afinar-regla`.

- **Confirmado con la medición, ya con `dev` al día (2026-09-07):**
  `prisma migrate diff --from-schema-datamodel --to-schema-datasource` **no reporta ni una columna**
  de diferencia contra `QuimiCloude`, `products.name_normalized` incluida. Lo único que sigue
  saliendo son **índices y claves foráneas** que viven en SQL crudo dentro de las migraciones y que
  `db/schema.prisma` no declara: deriva estructural conocida, de otra naturaleza, y **no** el fallo
  que rompía los diez archivos de integración. Que nadie la confunda con una regresión.

### El commit `89e8589` lleva un mensaje que no le corresponde (2026-09-07)

Segunda vez que pasa (la primera fue `7a3af59`, más abajo), y por la misma causa: **dos sesiones de
leader escribiendo `progress/current.md` a la vez**. La sesión de QC-64 fue a añadir la medición de
arriba, su edición **no aplicó** —el ancla que buscaba ya no existía, porque la otra sesión había
reescrito el archivo—, y el `git add` que venía detrás commiteó **el trabajo sin commitear de la
otra sesión** con el mensaje de la medición.

- **Qué hay de verdad en `89e8589`:** la fila de QC-35 pasando a `spec_ready`, la de QC-48 recién
  montada, y la retirada de las filas de QC-57 y QC-47. **Nada de eso lo escribió esa sesión.**
- **No se reescribe la historia**: el commit se queda y esta nota es la corrección.
- **La lección operativa:** encadenar `git add` a una edición que puede no aplicar es cómo se
  commitea trabajo ajeno. Si la edición falla, el `add` no debe correr —y `git diff --stat` antes
  del commit lo habría cazado en un segundo—.

### QC-57 y QC-47 están mergeadas y el board todavía no lo sabe (2026-09-06)

**Y se pisaron entre ellas: `dev` NO compila.** Los dos PRs se mergearon con **seis minutos de
diferencia** y ninguno vio al otro. QC-47 hizo `companyId` **obligatorio** en `users`; los dos
tests que QC-57 estrenó crean usuarios sin ese campo:

```
tests/integration/inventario/list-query-indexes.int.test.ts(77,5)
tests/integration/pedidos/list-query-orders.int.test.ts(131,7)
  error TS2322: Property 'companyId' is missing ... but required in type 'UserUncheckedCreateInput'
```

Son **dos errores de typecheck y nada más** —el resto de la suite no se llega a correr porque el
gate para ahí—, así que el arreglo es pequeño: darles `companyId` como ya hacen los demás tests de
integración. **No lo hace el leader** (no edita código) y no es de QC-35: pertenece al cierre de
QC-47 y QC-57, que además está a medias. Mientras siga así, **`./init.sh` no puede terminar en
verde en `dev` ni en ninguna rama que nazca de él**, y eso incluye la futura rama de QC-35.

**Y hay una segunda trampa detrás de esa, que costó una corrida entera:** aunque el código estuviera
bien, el **cliente Prisma generado se queda viejo** cuando `dev` avanza con una migración. El
síntoma es un typecheck lleno de `Property 'company' does not exist on type 'TransactionClient'` y
`'nameNormalized' does not exist`, que **parece** código roto y no lo es. `npx prisma generate`
lo arregla. Nada en `./init.sh` lo hace ni lo comprueba: es la tercera cosa que el arranque de
sesión no mira, junto con el remoto. Candidata a `/afinar-regla` en el mismo paquete.


PR #38 (QC-57) y PR #37 (QC-47) se mergearon el 2026-09-07 02:27–02:33Z. Sus dos tarjetas siguen
en *En curso* y sus dos fichas siguen `in_progress` en `feature_list.json`, así que **F2.5 está
pendiente para las dos**: pasar a `done`, mover la tarjeta a *Hecho*, comentar la URL del PR y
desmontar el worktree (`./scripts/wt.sh done <key>-<slug>`, con `--assume-merged` si el merge fue
squash). Hasta que se haga, la zona `backend` figura con sus **dos** plazas ocupadas y ninguna
feature `backend` nueva puede arrancar.

### `pg_trgm` entra como dependencia de infraestructura que NINGUNA guardia vigila (2026-09-04, QC-57)

`docs/dependencias.md` y su guardia comparan **entradas de `package.json`**. Una extensión de
Postgres no aparece en ninguna de las dos listas, así que **no lleva fila y el gate no la ve**.

- **Aprobada por el humano el 2026-09-04** al cerrar QC-57, sobre dato medido: `pg_trgm` ya está
  **disponible** en el servidor (`pg_available_extensions` la da en `1.6`, sin instalar), así que
  cuesta una línea en la migración y otra en el `down`.
- **Por qué se aceptó**: la alternativa era bajar la búsqueda de subcadena a prefijo, lo que
  habría degradado en silencio el selector de ingredientes, que ya busca por subcadena.
- **El riesgo, escrito**: si la base se mudara a un Postgres sin `pg_trgm`, la migración falla y
  **nada en el repo lo avisaría antes**. Queda como candidata a ficha propia si algún día hay más
  de una extensión.

### `products.name_normalized` es NOT NULL y YA ESTA APLICADA en la base compartida (2026-09-04, QC-57)

**Aviso operativo para toda sesion que cree productos.** La migracion
`20260904160000_list_query_indexes` de QC-57 esta **aplicada en la base compartida `QuimiCloude`**
y anade `products.name_normalized` **`NOT NULL` y SIN default**. Es la otra cara de lo que QC-62
anoto justo debajo, y por eso van juntas.

**Sintoma**: cualquier rama cuyo `db/schema.prisma` no declare `nameNormalized` —o cuyo cliente
Prisma este generado de antes— se lleva un **`23502` / `Null constraint violation on the fields:
(name_normalized)`** al crear un producto, y `prisma.product.create` rechaza el campo con
`Unknown argument nameNormalized`.

**Riesgo vivo hoy**: hay **cuatro worktrees** y **QC-47 esta `in_progress` tocando
`schema.prisma`**.

**Que hacer si te pasa** (por orden de coste): `git merge origin/dev` para traer el modelo, y
**`pnpm exec prisma generate`** despues — el cliente resuelve el `.env` y el esquema **en tiempo
de generacion**, asi que regenerar es obligatorio y no opcional.

**Lo que NO se debe hacer, y esta descartado por escrito:** ponerle un `SET DEFAULT ''` a la
columna. Cambiaria un `23502` **ruidoso** por **filas invisibles a la busqueda** —un producto con
la clave normalizada vacia no lo encuentra nadie y nada avisa—, que es mucho peor que un fallo que
se ve. Rechazado por el reviewer de QC-57 y compartido.

### `pageQuerySchema` quedo HUERFANO en produccion (2026-09-04, QC-57)

Tras QC-57 los siete listados validan con `createListQuerySchema()`, asi que `pageQuerySchema`
**no tiene ni un uso en `lib/` ni en `app/`** (grep exhaustivo). Sigue, sin embargo:

- **declarado en cuatro `domain/page.ts`** (`inventario`, `pedidos`, `proveedores`, `recetas`;
  `unidades` nunca lo tuvo),
- **exportado por esos cuatro barrels**, o sea publicado como contrato del modulo,
- y **cubierto por 6 tests** que, en la practica, prueban **codigo muerto**.

Su forma de `page`/`pageSize` esta replicada literalmente dentro de `createListQuerySchema()`, asi
que **borrarlo no perderia ninguna garantia**.

**Por que no se hizo en QC-57**: ninguna task lo pedia, y **retirar un simbolo publico del barrel
de cuatro modulos no se hace de paso** — toca el contrato de cuatro modulos y sus tests. El
aplazamiento lo acepta el reviewer **con la condicion de que quede escrito**, y esto es ese
escrito. **Candidata a ficha propia.**

### Quinta vez: el drift de la base compartida bloquea la integracion (QC-62, 2026-09-04)

El humano decidio **no** montar base propia para QC-62 y abrir el PR con los rojos declarados. Lo
que se midio, para que la proxima sesion no repita el diagnostico:

- La base `QuimiCloude` tiene aplicada `20260904160000_list_query_indexes`, **que esta rama no
  tiene**, y su columna `products.name_normalized` es `NOT NULL`. El modelo `Product` de
  `db/schema.prisma` en esta rama **no** declara `nameNormalized`, asi que la fixture no puede
  pasarlo: `prisma.product.create` responde `Unknown argument nameNormalized`.
- Por eso **9 archivos de `tests/integration/`** caen con el mismo `Null constraint violation on
  the fields: (name_normalized)` — los tres de `inventario`, los tres de `recetas`,
  `pedidos/pedidos-constraints`, `proveedores/catalog-line` y `unidades/unidades-constraints`.
  **Fallan igual en `dev`**: no es regresion de ninguna feature, es la base yendo por delante del
  codigo.
- El primer diagnostico del leader —«fixtures viejas de QC-52»— **era falso**, y el encargo de
  arreglarlas era inaplicable. Lo tumbo el implementer con medidas, no con opinion.

**Dos agujeros del gate que esto destapo, y que siguen sin dueno:**

1. `./init.sh` da por bueno su check de `.env presente` mientras la integracion cae con
   `DATABASE_URL not found`: **vitest no carga `.env`** y hay que exportarlo a mano
   (`set -a && . ./.env && set +a`). Un worktree recien montado da un **verde falso** en
   integracion.
2. Las dos guardias gemelas de alcance del modulo `recetas` —`tests/unit/recetas/module-contract.test.ts`
   y `tests/unit/recetas-ui/recipe-route-contract.test.ts:555`— **ya no dicen lo mismo**: QC-62
   actualizo la primera con su lista de archivos permitidos y la segunda sigue con la vieja, tapada
   por `baseline-rojos.json` con un motivo escrito que **ya no es el que ocurre**. Replicar las
   listas alli no la pondria verde igualmente (detras espera `tocaDb` por la migracion, que es la
   deuda R44 ya anotada), asi que se deja **declarado, no tapado**.

**Un hallazgo que si se corrigio**: la migracion de QC-62 y la foranea compartian marca de tiempo
exacta (`20260904160000`). Prisma las distingue por nombre, pero el orden entre dos que empatan
queda al azar — y la de QC-62 **borra datos de forma irreversible**. Renombrada a
`20260904181500_recipe_steps_reset`.

### La base propia de QC-34 ya se borro; la deuda de fondo sigue viva (2026-09-04)

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
- **Hecho al cerrar la ficha:** `QuimiCloude_QC34` **borrada** a mano, porque
  `./scripts/wt.sh done` no sabe que existe. Ese paso manual es la deuda, y **sigue viva para la
  proxima feature**: nada en `wt.sh new` crea la base ni nada en `wt.sh done` la retira.
- **Bases huerfanas comprobadas hoy contra el servidor:** `QuimiCloude_QC14` y
  `QuimiCloude_FIXGATE` siguen vivas con sus features cerradas hace dias. `QuimiCloude_QC44` esta
  en uso por la sesion paralela y no se toca.

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

La feature **QC-44 — pantalla-de-proveedores** se cerró el 2026-09-04 (PR #35, merge `f966a7b`),
pero su F2.6 quedó sin hacer hasta el 2026-09-07: la fila de esta tabla siguió diciendo
`in_progress` tres días y no había entrada en `history.md`. Ya la tiene, y con ella las cinco deudas
que el reviewer anotó (0 mayores, 6 menores, una sola ronda). El worktree ya estaba desmontado; la
rama `feature/QC-44-pantalla-de-proveedores` seguía viva y se borró al escribir esto.

De esas deudas, **una tiene ficha y sigue `pending`: QC-58 (`timeout-tests-ui-bajo-carga`)** —
`catalog-line-sheet.test.tsx` teclea siete campos con `userEvent` y agota los 5000 ms por defecto
bajo carga. No es un rojo real, pero pondrá el gate en rojo por el reloj de la máquina.
