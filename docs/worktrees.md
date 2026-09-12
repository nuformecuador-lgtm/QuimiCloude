# Worktrees — un checkout por feature, montado y desmontado

Cada feature trabaja en su propio worktree. Se monta al arrancar la feature (F1.0) y se
desmonta cuando el humano mergea el PR (F2.5). Las dos puntas las hace `scripts/wt.sh`;
nadie crea ni borra worktrees a mano.

## Por que existe este documento

Antes el arnés solo hablaba de ramas: `git checkout -b <branch> origin/dev` en un único
checkout. Los worktrees entraban por la puerta de atrás —los crea el harness para aislar
subagentes, o el humano cuando quiere dos features abiertas a la vez— y **ningún paso del
flujo los quitaba**. El ciclo documentado (`pending → spec_ready → in_progress → done`)
era solo estado lógico: cubría rama, PR y bitácora en markdown, y nada de desmontaje.

El coste no es teórico: está medido sobre un proyecto anterior que corría este mismo
arnés sin el paso de desmontaje. Al hacer por fin el inventario había **80 worktrees
registrados y 0 prunables** —todos con directorio vivo en disco— repartidos en cuatro
sitios que nadie llevaba juntos:

| Dónde | Cuántos | Quién los creaba |
|---|---|---|
| carpetas hermanas del repo | 57 | el humano, a mano |
| `C:/w125`, `C:/wbk`, `C:/wfix`… | 19 | el humano, para acortar rutas en Windows |
| `.claude/worktrees/agent-*` | 7 | el harness (`EnterWorktree`) |
| scratchpad de la sesión | 4 | el harness |

El más antiguo llevaba casi dos meses ahí. De los 80, **62 eran desmontables sin perder
nada** y 18 tenían trabajo real retenido — uno de ellos con 133 archivos sin commitear.
Es decir: el problema no era solo el disco, era que había trabajo sin guardar escondido
en carpetas que nadie miraba.

## Dónde viven

Dentro del repo, bajo `.worktrees/` (ignorado en `.gitignore`):

```
labs/                                  <- worktree principal, siempre en `dev`
  .worktrees/8-paginacion/             <- feature/8-paginacion
  .worktrees/9-manejador-errores/      <- feature/9-manejador-errores
```

Dentro del repo y no como carpetas hermanas **a propósito**: así un solo `rm` del repo se
lo lleva todo y nunca aparecen huérfanas en el directorio padre, que es exactamente cómo
se llegó a las 57 carpetas hermanas del inventario de arriba.

El precio de meterlas dentro es que cada worktree es una copia completa del árbol, así
que hay que excluirlo del toolchain o `lint`/`typecheck` empiezan a ver N copias de cada
archivo. Está hecho en tres sitios y **si trasplantas el arnés a otro repo hay que
rehacerlo**, porque `harnessConfig/` no lleva estos archivos:

- `.gitignore` → `/.worktrees/`
- `eslint.config.mjs` → `".worktrees/**"` en `globalIgnores`
- `tsconfig.json` → `.worktrees` en `exclude`

## Los comandos

```bash
./scripts/wt.sh new 8 paginacion      # F1.0 — crea rama feature/8-paginacion + worktree
./scripts/wt.sh done 8-paginacion     # F2.5 — lo desmonta si es seguro
./scripts/wt.sh list                  # inventario con veredicto por worktree
./scripts/wt.sh clean                 # dry-run: qué se podría desmontar
./scripts/wt.sh clean --force         # lo ejecuta
```

Opciones: `-C <repo>` para operar sobre otro repo (`-C ../otro-repo`), `--base <ref>` para
fijar contra qué se mide "mergeado" (por defecto se autodetecta `origin/dev`), y
`--assume-merged` para el caso de squash (abajo).

`new` es idempotente: si el worktree ya existe lo reporta y sale bien, así que reanudar
una sesión a medias no rompe nada.

## Las cuatro guardas

`done` y `clean` no borran nada sin pasar por estas cuatro. Cualquiera que salte deja el
worktree en pie con el veredicto `HOLD` y su razón:

1. **Es el worktree principal.** Nunca se toca, pase lo que pase.
2. **Está bloqueado** con `git worktree lock`. Alguien lo protegió a propósito.
3. **Tiene cambios sin commitear** (`git status --porcelain` no vacío). Este es el que
   habría salvado los 133 archivos sin commitear del inventario de arriba.
4. **Su rama no está integrada en la base.** Se comprueba con `merge-base --is-ancestor`
   y, si falla, con `git cherry` (que cubre rebase y cherry-pick: los sha cambian pero
   los parches ya están arriba).

Un worktree cuyo directorio ya no existe se marca `SAFE`: no hay nada que perder, solo
queda el registro y lo limpia `git worktree prune`.

La regla que ordena todo esto: **ante la duda, no se borra**. El coste de dejar un
worktree de más es disco; el de borrar uno con trabajo sin guardar es trabajo perdido.
No son comparables, así que las guardas son deliberadamente pesimistas.

## Qué hacer con un HOLD

`done` devuelve código 3 y no borra nada. Eso **no bloquea el cierre de la feature**:
la feature pasa a `done` igual, y el worktree retenido se anota en
`progress/current.md > Deudas y cosas abiertas` con la razón que dio el script. Lo único
que no vale es dejarlo ahí en silencio — que es precisamente cómo se llega a 80.

Luego, según la razón:

- **sucio** → entra al worktree, mira qué hay y decide: commitear, descartar o dejarlo.
- **no mergeada** → o el PR no se mergeó todavía, o se mergeó con **squash**. GitHub
  reescribe los commits al hacer squash, así que la rama nunca figura como ancestro de
  `dev` aunque su contenido sí esté. Para ese caso:
  `./scripts/wt.sh done 8-paginacion --assume-merged`, que salta **solo** la guarda 4 y
  mantiene las otras tres.
- **bloqueado** → `git worktree unlock <path>` si ya no hace falta la protección.

## El gate


Y desde el 2026-09-12, `./init.sh` **deja el entorno al día antes de mirar nada**: regenera el
cliente de Prisma y los tipos de ruta de Next, y reinstala si cambió el lock. Un worktree recién
montado no trae ninguna de las tres cosas, y sus errores no nombran su causa. El porqué, la tabla
de síntomas engañosos y el coste medido: `docs/verification.md > El gate regenera los artefactos`.
Lo que sigue siendo tuyo: aplicar a **tu** base las migraciones que traiga un merge con `dev`.

`./init.sh` cuenta los worktrees registrados y avisa si hay más de 5 además del
principal, o si alguno quedó con el directorio borrado. Es `warn`, **no `fail`**: un gate
rojo por tareas domésticas bloquearía trabajo real y la respuesta previsible sería
ignorar el gate, que es justo lo que la regla 5 de `CLAUDE.md` intenta evitar. Pero
tampoco puede ser invisible: en este repo lo que no sale en `./init.sh` no existe, y así
fue como se llegó a 80 sin que nadie se enterara.

### El validador mira el repo entero, no el worktree (2026-09-08)

`scripts/validate-features.mjs` resuelve `specs/` y `.worktrees/*/specs` contra la **raíz del
repo**, no contra el directorio actual, y si no puede localizarla **falla**.

Antes los resolvía contra el directorio actual, y como el gate se corre **dentro** del worktree
de la feature, desde ahí `.worktrees/` no existe: solo se veía el `specs/` de la propia rama.
Cualquier otra feature en vuelo daba «faltan specs para features sdd en vuelo», con sus specs
sanos en disco a un directorio de distancia, y el gate abortaba en el paso 3 **sin llegar a
mirar código**. Como el gate completo es obligatorio antes de cada PR (regla 5 de `CLAUDE.md`),
eso bloqueaba el F2.4 de **todas** las features a la vez, no solo el de la que lo sufría.

Pasó tres veces antes de arreglarse: dos en QC-74 —anotadas en `progress/current.md` como
«sigue sin resolverse»— y la tercera en QC-76, con QC-45 y QC-75 en vuelo.

La copia del board que manda **sigue siendo la de la rama**: es la que su PR va a mergear. Lo
que cambia es dónde busca los specs, no a quién le cree.
