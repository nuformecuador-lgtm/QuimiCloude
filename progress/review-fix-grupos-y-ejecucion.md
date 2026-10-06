# Review — fix grupos solo activos + titulo de ejecucion (2026-10-05)

Rama: `fix/grupos-solo-miembros-activos` (base `origin/dev` 404a0204). Sin ficha: fixes directos
aprobados por el humano.

## Ronda 1 — RECHAZADO (3 bloqueantes)

1. Comentarios nuevos de produccion citan `R<n>` (`docs/conventions.md > Comentarios`):
   `work-group-prisma.ts`, `add-work-group-member.ts`, `ports/work-group-repository.ts`.
2. Dos E2E comparan `order-execution-title` con el numero exacto y romperan con
   `#Pedido - receta`: `e2e/pedido-en-varias-presentaciones.spec.ts:308`,
   `e2e/envases-del-pedido.spec.ts:606`.
3. QC-85 sin enmienda: su R28 fija los candidatos en `listUsersAction`; preguntas abiertas 1 y 2
   quedan resueltas por las decisiones nuevas y no consta.

Menores: `progress/fix-grupos-solo-activos.md` decia que el actor si podia meterse a si mismo;
`describe` del test de ejecucion dice «nombre del producto»; comentarios «SIETE errores» de
`identity/index.ts` (preexistentes); filtro de activos en memoria aceptado, registrar como deuda.

Gate `./init.sh` completo: `init OK`, sin rojos nuevos (8 archivos en baseline, incluidos los 4 de
viewport y `account-status-scope` por `list-responsible-candidates.ts`).

Fuera del commit: archivos sin seguimiento ajenos (`.opencode/`, `.serena/`, `opencode.json`,
`docs/grafo-de-codigo.md`, `docs/opencode.md`, `informes/`, `scripts/*opencode*`,
`scripts/check-modelos.mjs`, `specs/QC-202-*`, `.claude/.headroom_*`).

## Ronda 2

APROBADO. Los 3 bloqueantes cerrados; ninguno nuevo. Sin cambios de codigo de produccion desde la
ronda 1 (solo comentarios, specs, e2e, un `describe` y progress), asi que el `./init.sh` verde de la
ronda 1 sigue valiendo.

Menores nuevos, no bloquean: falta un verbo («`admits` es la regla del dominio») en
`ports/work-group-repository.ts`; una linea de comentario larga en `work-group-prisma.ts`.

E2E `pedido-en-varias-presentaciones` y `envases-del-pedido`: NO corridos (un `next dev` ocupa el
directorio). Texto esperado verificado contra `formatOrderExecutionTitle`.
