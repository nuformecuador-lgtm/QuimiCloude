# QC-221 — permiso-y-modulo-de-integraciones · review

Reviewer · 2026-10-08 · vuelta 1 (completa) · rama `feature/QC-221-permiso-y-modulo-de-integraciones`
(HEAD 3e946587) contra `origin/dev`. Grafo: no hizo falta; el diff es pequeño y se leyó entero con
Read/Grep.

## Verificación ejecutada por el reviewer

| Comando | Resultado |
|---|---|
| `pnpm run typecheck` | OK, sin errores |
| `pnpm run lint` | `0 errors, 7 warnings` (preexistentes, ningún archivo del diff) |
| `vitest run` de los 7 unitarios nuevos/tocados | `7 passed · 227 passed, 3 skipped` (los 3 skip son el R22 de QC-75, que se salta fuera de su rama) |
| `vitest run guard` | `55 passed · 742 passed, 11 skipped` |
| los 3 `.int` nuevos/tocados (base efímera) | `3 passed · 49 passed` |
| `catalog-line.int.test.ts` | 1 rojo (R32), ajeno: depende del idioma del Postgres local (`progress/deudas.md` D33); el diff no toca `proveedores` |
| `git merge-tree HEAD origin/dev` | merge limpio (dev va 37 commits por delante, con QC-167 ya mergeada) |

Rojos de `./init.sh` reportados por el leader: `scope.test.ts`, `module-contract.test.ts` y
`pantallas-exigen-permiso.test.tsx` están en `tests/baseline-rojos.json` (comprobado), y
`catalog-line` es de entorno. No se atribuyen a esta feature.

## Checklist

### Especificación
- [x] `requirements.md` con R1–R23 en EARS.
- [x] `design.md` con alternativas descartadas (§9).
- [ ] `tasks.md` con todas las tasks `[x]`: **T11 sigue `[ ]`** (ver hallazgo 1).
- [x] `design.md` abre con `## Lo que ya existe`, con búsqueda hecha. El diff no re-crea nada de
      esa lista: `ai-config-env.ts` no se toca y no había nada `integraciones` antes.

### Equipo
- [x] Assignee (Christian Quevedo) y rama publicada con `wt.sh new` (`progress/features/QC-221.md`).

### Trazabilidad
- [x] El mapa `R<n> -> test` de R1–R23 está en `progress/impl_…md`.
- [x] Cada R tiene un test real que afirma algo, y casi todos con su caso de sensibilidad:

| R | Test verificado | Nota |
|---|---|---|
| R1, R2, R3, R5, R6 | `tests/unit/identity/permissions.test.ts` › bloque «QC-221 — …» | Entrada exacta, cola exacta, simétrico del párrafo JSDoc, Admin = previo escrito a mano + código, los otros 4 roles exactos |
| R4 | `integrations-permission-migration.test.ts` › 2 casos «R4» | Barrido de migraciones y detector de escrituras con sintético |
| R7 | `session-user.int.test.ts` › 2 casos «R7» | Admin, Operador, Empacador y Admin. de acondicionamiento. El Maestro no está (hallazgo 2) |
| R8, R9, R10–R13 | `tests/unit/integraciones/module-shape.test.ts` | R8 reutiliza `findForbiddenPatternsInSource` de la guardia, con sintético. R9 tiene anticegado |
| R14, R15 | `tests/unit/integraciones/integration-routes.test.ts` | |
| R16, R17, R19, R20 | estático y `.int` de la migración | El `.int` ejecuta el SQL **leído del archivo** dentro de una transacción con rollback |
| R18, R21 | `identity-seed.int.test.ts` › 2 casos «QC-221» | |
| R22, R23 | revisión | El diff no toca `e2e/`, `app/`, `components/`, `hooks/`, `lib/shared/navigation/`, `middleware.ts`, `route-guard-middleware.ts`, `lib/composition/`, `package.json`, `pnpm-lock.yaml` ni `db/schema.prisma` (comprobado con `git diff --name-only`) |

### Calidad de código
- [x] typecheck y lint.
- [ ] `gate-completo` en CI: pendiente de PR (lo decide CI).
- [x] Flujo crítico «permisos» sin E2E: diferida a QC-222 por decisión cerrada D5. La aprobó el
      humano, y no hay pantalla ni consumidor del permiso que recorrer. No es hallazgo; QC-222 la
      hereda.
- [x] Sin dependencias nuevas.

### Seguridad y configuración
- [x] Sin secretos ni configuración por entorno hardcodeada.
- [x] Sin webhooks.

### Perfil (`docs/checkpoints-proyecto.md` y `docs/perfil-agentes.md > reviewer` 5–9)
- [x] Sin tablas nuevas, así que no aplican RLS ni la columna de empresa. La migración solo
      escribe filas en `permissions` y `role_permissions`, que ya tienen RLS forzada.
- [x] «Cada permiso se valida en el caso de uso»: no aplica todavía. Por alcance aprobado, ningún
      caso de uso ni página lo exige (R9 lo vigila). Lo trae QC-222.
- [x] Migración versionada y reversible, con `down.sql`. El leader dejó el ciclo
      `migrate → rollback → migrate` en la bitácora, y el `.int` del DOWN lo reproduce.
- [x] Módulo hexagonal: `index.ts` con `export {};` y carpetas con `.gitkeep`. Nadie lo importa.
      `lib/shared/routes.ts` sigue siendo hoja.
- [x] Sin UI, así que la regla multiplataforma no aplica.
- [x] Comentarios: ninguna línea añadida en producción cita `QC-<n>`, `R<n>`, `design.md` ni
      «decisión cerrada» (grep sobre las líneas `+` de `lib/` y `db/`). El `(R5)` del JSDoc del
      catálogo es preexistente y el diff no lo toca. El párrafo nuevo tiene 4 líneas.

## Los puntos que pidió mirar el leader

**Migración `20261008120843_integrations_permission`, creada a mano (D3).** Correcta.
- El UP son dos `INSERT … ON CONFLICT … DO NOTHING`, idempotentes y sin reescribir filas. Va al rol
  `Administrador` por nombre y no hereda.
- Los literales coinciden con `PERMISSIONS`: el test estático compara contra la constante
  importada, y el `.int` compara la fila resultante.
- El seed no cambia y crea solo lo que falta (R18, probado con dos corridas).
- El DOWN borra primero `role_permissions` y después `permissions`. Es el orden que exige
  `role_permissions_permission_code_fkey ON DELETE RESTRICT`, y es la única FK que apunta a
  `permissions` (grep en `db/migrations`). Es naturalmente idempotente.
- El timestamp es posterior a la última migración de `dev` y de los demás worktrees montados
  (`20261007120100`). No hay DDL, así que el drift de Prisma no interviene.

**3 archivos fuera de `tasks.md`.** No relajan nada:
- `recipe-route-contract.test.ts`: la lista CERRADA de exports suma tres nombres. Con QC-167 en
  dev, el merge con `executionTraceRoute` sale limpio y la lista sigue ordenada con `.sort()`.
- `guard-identificador-de-request.test.ts`: `MIGRACIONES_ESPERADAS` suma la carpeta, con el mismo
  patrón que QC-216. La migración no menciona el identificador.
- `aislamiento.json`: declara el `.int` nuevo en `transaccion`, y eso es lo que hace
  (`inRolledBackTransaction` en los 4 casos).

**Cambios aditivos en `routes.ts` y `permissions.test.ts`.** Lo son. `routes.ts` suma 3 constantes
y 2 líneas de comentario tras `CUSTOMERS_ROUTE`, sin tocar nada más. En `permissions.test.ts`, los
bloques previos solo filtran el código nuevo de la cola: siguen con `toEqual` exacto, sin pasar a
`toContain`. QC-167 ya está en dev y el merge-tree no da conflicto en ninguno de los dos archivos.

## Hallazgos

1. **BLOQUEANTE (de forma, mecánico): T11 sigue `[ ]` en `tasks.md`.**
   - `CHECKPOINTS.md > Especificación` exige todas las tasks marcadas.
   - Lo sustantivo de T11 está hecho: el mapa R1–R23 está en la bitácora, el diff no toca ninguna
     ruta prohibida y los 4 rojos de `./init.sh` son ajenos (3 en baseline y 1 de entorno). Así
     lo deja `progress/features/QC-221.md > Tandas`.
   - Falta marcar `[x]` T11 citando esa nota. No hace falta tocar código. La vuelta 2 solo
     comprueba la casilla.
2. **menor: R7 dice «cualquier otro rol de semilla», y el caso de sesión no incluye al Maestro.**
   Queda cubierto indirectamente:
   - el R6 unitario fija que el Maestro tiene exactamente `empresas.consultar` y
     `empresas.modificar`;
   - `session-user.int.test.ts:434` (QC-161) ya afirma que la sesión del Maestro es exactamente su
     conjunto sembrado.

   Añadirlo explícito sería más claro, pero no es necesario.
3. **menor: la rama va 37 commits por detrás de `origin/dev`.** El merge es limpio, pero conviene
   traer dev antes del PR, para que `gate-completo` corra sobre el árbol combinado. En dev ya está
   QC-167, que toca `routes.ts` y `recipe-route-contract.test.ts`.

## Veredicto

**RECHAZADO**, solo por el hallazgo 1 (casilla de T11). El código, la migración y los tests están
bien. Una vez marcada T11, queda OK sin más cambios.

## Vuelta 2 (acotada a 3e946587..0058ad79, más el merge 5d16b8e7)

### Checklist
- [x] **Hallazgo 1 (BLOQUEANTE) resuelto.** T11 está marcada `[x]` en `tasks.md`, y T1–T11 están todas en `[x]`.
  La nota de cierre cita `progress/features/QC-221.md > Tandas` (2026-10-08). Esa nota existe y
  dice lo mismo: hay 4 rojos ajenos (3 de baseline que el `--exclude` no sacó en Windows, más
  `catalog-line.int.test.ts`, que también está rojo en dev). La bitácora `impl_` añade una línea
  coherente.
- [x] **El diff del arreglo solo toca documentación.** Son `tasks.md` (+6/-1) y `impl_…md` (+1); no hay código ni tests.
- [x] **El merge de origin/dev (5d16b8e7, padres 0058ad79 y 39a5ff68) no altera QC-221.**
  `git diff 0058ad79 5d16b8e7` sobre los 26 archivos de la feature solo muestra 4 archivos, con
  altas aditivas de QC-167:
  - `routes.ts`: `executionTraceRoute`;
  - `guard-identificador-de-request.test.ts`: `recorrido-ejecucion.spec.ts`;
  - `aislamiento.json`: 2 entradas;
  - `recipe-route-contract.test.ts`: `executionTraceRoute`.

  No borra ni modifica ninguna línea de QC-221, ni toca `db/migrations/`.
- [x] **Tests verdes en 5d16b8e7.** Corrí `npx vitest run` sobre:
  - `tests/unit/identity/permissions.test.ts`;
  - `tests/unit/recetas-ui/recipe-route-contract.test.ts`;
  - `tests/unit/integraciones/`;
  - `tests/guards/guard-identificador-de-request.test.ts`.

  Resultado: 5 archivos y 163 tests en verde.

### Hallazgos
- Ninguno nuevo. Los menores 2 y 3 de la vuelta 1 siguen como estaban. El 3 queda resuelto
  por el merge de dev.

### Veredicto
**OK**
