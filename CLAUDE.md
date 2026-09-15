@AGENTS.md

<!--
  Este archivo es deliberadamente delgado. Todo el arnés —las siete reglas no negociables, el
  arranque de sesión, el mapa y la orquestación— vive en `AGENTS.md`, y aquí sólo se importa.

  El motivo no es estético. opencode lee `AGENTS.md` y `CLAUDE.md`, pero su doc dice: "The first
  matching file wins in each category. For example, if you have both `AGENTS.md` and `CLAUDE.md`,
  only `AGENTS.md` is used." Con las reglas viviendo en `CLAUDE.md`, como estaban hasta ahora,
  opencode NO las cargaba: ni el SDD obligatorio, ni el máximo de features en paralelo, ni el
  gate, ni la aprobación de dependencias. Silenciosamente.

  La doc de Claude Code recomienda exactamente esta forma para el caso inverso: "Claude Code
  reads `CLAUDE.md`, not `AGENTS.md`. If your repository already uses `AGENTS.md` for other
  coding agents, create a `CLAUDE.md` that imports it."

  El `@AGENTS.md` de arriba NO puede ir entre backticks: el parser de imports salta los code
  spans y quedaría como texto literal.
-->

## Específico de Claude Code

- Los subagentes se lanzan con la **Task tool**. El equivalente en opencode es la herramienta
  `task`, y su alcance se limita con `permission.task` en `opencode.json`.
- Los recordatorios del ciclo son hooks en `.claude/settings.json` (`PostToolUse` y `Stop`).
  En opencode son un plugin, `.opencode/plugins/arnes.js`, con el mismo contenido.
- Los permisos viven en `.claude/settings.local.json`, donde **gana el `deny`**. En opencode
  viven en `opencode.json` y gana **la última regla que hace match**: el mismo permiso escrito
  en el mismo orden significa cosas distintas en cada herramienta. Detalle en `docs/opencode.md`.
