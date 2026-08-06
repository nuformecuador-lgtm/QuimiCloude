# harnessConfig — el arnés SDD, extraído

Copia autocontenida de **toda la configuración del arnés** de este repo. Sirve para
llevar el arnés a otro proyecto, o para leerlo entero sin el ruido de las specs y las
bitácoras que se vayan acumulando.

**Nada de lo que hay aquí modifica el arnés vivo.** Los archivos del repo (`CLAUDE.md`,
`AGENTS.md`, `.claude/`, `docs/`, `scripts/`, `init.sh`, `feature_list.json`,
`progress/`, `specs/`) quedan intactos; esto es una copia paralela.

## Qué hay

| Ruta | Origen | Estado |
|---|---|---|
| `CLAUDE.md` | raíz | copia literal |
| `AGENTS.md` | raíz | copia literal |
| `CHECKPOINTS.md` | raíz | copia literal |
| `init.sh` | raíz | copia literal (el gate: `./init.sh` y `./init.sh --rapido`) |
| `scripts/wt.sh` | `scripts/` | copia literal (ciclo de vida de los worktrees) |
| `.mcp.json` | raíz | copia literal (servidores MCP) |
| `docs/architecture.md` · `conventions.md` · `specs.md` · `verification.md` · `worktrees.md` | `docs/` | copia literal — los que los subagentes leen |
| `.claude/agents/*.md` | `.claude/agents/` | copia literal, los 6 subagentes |
| `.claude/settings.json` | `.claude/` | copia literal (hooks del arnés) |
| `.claude/settings.local.json` | `.claude/` | copia literal (permisos + MCP habilitado) |
| `feature_list.json` | — | una única ficha de ejemplo |
| `progress/current.md` | — | solo los encabezados que el leader espera |
| `progress/history.md` | — | solo el encabezado y el formato de entrada |
| `progress/impl_1-ejemplo-*.md` · `review_1-ejemplo-*.md` | — | ejemplo del formato de bitácora |
| `specs/1-ejemplo-*/` | — | ejemplo de los 3 archivos SDD (requirements EARS / design / tasks) |

## Qué se omite a propósito

- **Los historiales reales**: `progress/history.md`, `progress/current.md` y los
  `impl_*.md` / `review_*.md` de features cerradas. Crecen sin techo y no son
  configuración.
- **Las specs reales**: queda una sola como ejemplo de formato.
- **El `feature_list.json` real**, con su narrativa de decisiones por ficha.
- **`.claude/skills/`**: son skills de terceros instaladas, no parte del arnés.
- Todo lo que es la app en sí: `app/`, `lib/`, `tests/`, `db/`, `package.json`, configs
  de build.

## Si lo trasplantas a otro proyecto, revisa esto

1. **`init.sh`** asume `pnpm`, `jq` y los scripts `typecheck` / `lint` / `test` / `test:rapido`
   en `package.json`, más `db/migrations/*/down.sql`. Sin esos scripts el gate **avisa y sigue**
   (`warn`), no falla: verifica que existan o el gate no mide nada.
2. **`.claude/settings.local.json`** trae permisos de esta máquina; revísalos allá.
3. **`scripts/wt.sh` monta los worktrees en `.worktrees/` dentro del repo**, y esta copia
   NO incluye `.gitignore`, `tsconfig.json` ni `eslint.config.mjs`. En el repo destino
   hay que excluir esa carpeta en los tres, o `lint` y `typecheck` recorrerán una copia
   completa del árbol por cada worktree abierto:
   `/.worktrees/` en `.gitignore`, `".worktrees/**"` en `globalIgnores` de eslint, y
   `.worktrees` en el `exclude` de `tsconfig.json`. Ver `docs/worktrees.md`.
4. **`.mcp.json`** resuelve el proyecto de Supabase por `${SUPABASE_PROJECT_REF}` y la
   clave de Context7 por `${CONTEXT7_API_KEY}`: ambas salen del entorno, no del repo.
   Defínelas allá o los servidores MCP no levantan.
5. **`docs/architecture.md`** describe el dominio, el stack y los principios de este
   proyecto (un ERP mono-tenant). Es el documento a reescribir en destino; los otros de
   `docs/` son genéricos.
6. **`CLAUDE.md` regla 1** y el paso 3 de `init.sh` fijan el máximo de 2 features
   `in_progress` por zona: si lo cambias, cámbialo en los dos sitios (y en
   `AGENTS.md > Paralelismo`).

## Arranque en limpio

```
./init.sh                      # debe terminar en verde
```
Luego: `CLAUDE.md` → `AGENTS.md` → primera ficha `pending` de `feature_list.json`.
