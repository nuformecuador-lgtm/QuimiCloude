# review QC-229 — despliegue-automatico-a-produccion (2026-10-08)

Diff revisado: `origin/dev...cf44b30d` (4 commits). Feature `sdd: false`: sin spec; alcance = ficha
QC-229 + `progress/features/QC-229.md > Decisiones`.

## Checklist

### CHECKPOINTS.md
- [n/a] Especificacion (requirements/design/tasks, `## Lo que ya existe`): `sdd: false`, decision del humano.
- [x] Equipo: assignee en la ficha; rama publicada en origin (`cf44b30d` = HEAD).
- [n/a] Trazabilidad `R<n>`: no hay R. La bitacora trae el mapa alcance -> test, y cada punto tiene su test.
- [x] Typecheck: exit 0 (`./init.sh`).
- [x] Lint: 0 errores, 7 warnings que ya estaban, en archivos ajenos.
- [ ] **gate-completo verde: NO lo estara.** `tests/unit/identity/seed/deploy-hook.test.ts` sale rojo (hallazgo 1).
- [n/a] E2E de flujo critico: no toca ninguno.
- [x] Dependencias: `package.json` sin dependencias nuevas. La CLI de Vercel va por `npx` en CI, fuera de `package.json` (hallazgo 4).
- [x] Sin secretos hardcodeados: los tres van por `secrets.*`, y GitHub los enmascara en el log. No hay `set -x` ni `echo` de ningun secret. Solo se imprime la URL del despliegue.
- [x] Webhooks: n/a.
- [x] Configuracion: nada que dependa del entorno quedo hardcodeado (org y proyecto salen de secrets).
- [x] `./init.sh` (rapido) en verde en el worktree, pero **no** selecciona el test que se rompe (hallazgo 1).
- [ ] review OK: no, ver veredicto.
- [ ] Cierre / worktree: pendiente (lo hace el leader).

### docs/checkpoints-proyecto.md
- [x] Calidad de codigo: typecheck y lint, ok. No toca UI.
- [n/a] Datos y seguridad, modulos hexagonales, permisos: no toca modelos, consultas, modulos ni pantallas.
- [x] Migraciones: no anade ninguna.

### Reglas del reviewer (perfil-agentes, 5 a 9)
- [x] 5 Calidad y seguridad: permisos `contents: read`, `concurrency` sin cancelar, secrets presentes o fallo con mensaje claro, sin secretos en el codigo.
- [n/a] 6 Multiplataforma.
- [x] 7 Dependencias: `package.json` solo cambia `scripts.build`.
- [n/a] 8 Aislamiento por empresa.
- [x] 9 Comentarios: ninguna linea anadida en `scripts/build.mjs` ni en `desplegar.yml` cita `QC-<n>`, `R<n>`, `design.md` ni «decision cerrada».

### Verificacion ejecutada
- `./init.sh`: exit 0. `vitest related` eligio solo `tests/unit/scripts/build.test.ts` y la guardia nueva. 57 guardias en verde.
- `pnpm exec vitest run tests/unit/identity/seed/deploy-hook.test.ts tests/unit/scripts/build.test.ts tests/guards/guard-despliegue-produccion.test.ts`: **2 rojos** en deploy-hook, 25 verdes.
- `tests/baseline-rojos.json`: no lista `deploy-hook.test.ts`, asi que el rojo es nuevo.
- La guardia muerde. Probe 6 mutaciones y cada una da 1 rojo; todas revertidas, el arbol quedo limpio:
  - rama extra en `branches`;
  - `vercel@latest`;
  - sin `--prod`;
  - `contents: write`;
  - `pull_request_target` en el `on:`;
  - `scripts.build` vuelto a una cadena de `&&`.
- El unitario muerde:
  - `=== 'production'` cambiado por `!== 'preview'`: 3 rojos;
  - `MIGRAR` metido en `SIN_BASE`: 4 rojos.
- Humo: `VERCEL=1 VERCEL_ENV=preview node scripts/build.mjs` sin `prisma` en PATH imprime la linea de salto, solo intenta `prisma generate` y sale con exit 1. El fallo se propaga.
- Quien llama a `pnpm build`:
  - ni `gate.yml` ni `init.sh` lo llaman;
  - Playwright levanta `next dev` y no pasa por el build;
  - la doc de migracion manual (`pnpm run db:migrate`) no cambia.

  Fuera de Vercel, el build local corre los mismos cuatro pasos, en el mismo orden y cortando al primer fallo.
- Caminos de una preview: dentro de Vercel solo `VERCEL_ENV === 'production'` migra o siembra. Preview, development, vacio o ausente no tocan la base. No hay integracion de Git (no hay previews automaticas). Un `vercel` sin `--prod` lanzado a mano da `preview`, y se salta la base.

## Hallazgos

1. **BLOQUEANTE** — `tests/unit/identity/seed/deploy-hook.test.ts:54-78` (QC-6 R19/R20) sale rojo con el nuevo `package.json:7`:
   - «scripts.build contiene los cuatro comandos, en orden»: rojo.
   - «los cuatro comandos van unidos por &&»: rojo.

   `./init.sh` rapido no lo ve porque `vitest related` no relaciona `package.json` con ese test. El check `gate-completo` lo vera, y no esta en el baseline. Falta adaptar ese test al nuevo contrato. No vale borrarlo: QC-6 R19/R20 dicen que el seed corre en cada despliegue de produccion y que, si falla, el despliegue falla. La forma de cubrirlo ahora:
   - fuera de Vercel y con `VERCEL_ENV=production`, `pasosDelBuild` devuelve migrar, generar, sembrar y compilar, en ese orden (ya lo cubre `build.test.ts`; el test de QC-6 puede apoyarse en el o citarlo);
   - un paso con exit distinto de 0 corta el build con exit distinto de 0. Esto hoy **no lo cubre ningun test**: `main()` en `scripts/build.mjs:49-62` no tiene test. Antes, R20 lo garantizaba el `&&`; ahora depende de `if (r.status !== 0) process.exit(...)`.

   Hace falta un test que lo fije: por ejemplo, extraer el bucle con un `spawn` inyectable, o lanzar `node scripts/build.mjs` con un PATH sin `prisma` y afirmar exit != 0 y que `next build` no llega a correr.
2. **menor** — `progress/features/QC-229.md`, linea de la tanda 1: dice «migrate y seed solo con `VERCEL_ENV=production` o sin `VERCEL_ENV`». Esto contradice el codigo final (`cf44b30d`), donde sin `VERCEL_ENV` dentro de Vercel no se migra. Lo corrige el leader.
3. **menor** — la guardia no fija ni `concurrency` (`cancel-in-progress: false`) ni el paso que falla si falta un secret (`.github/workflows/desplegar.yml:28-30` y `:52-66`), y los dos estan en el alcance. Quitar el `concurrency` permitiria dos `migrate deploy` a la vez sobre produccion. Conviene una afirmacion para cada uno.
4. **menor** — la CLI `vercel@63.1.0` (`.github/workflows/desplegar.yml:79`) es una herramienta de terceros nueva en el pipeline. No entra en `package.json`, asi que la guardia de dependencias no aplica, y el humano eligio «CLI y token». Aun asi, no hay acta de los cuatro checks ni de la version elegida. La version existe (`npm view vercel@63.1.0` la devuelve). Ademas, `npx` resuelve sus dependencias transitivas sin lockfile. Sugerencia: anotarlo en `## Decisiones` de la ficha.
5. **menor** — `progress/features/QC-229.md`, `## Decisiones`: deja versionados en texto plano el org ID y el project ID de Vercel. No son secretos, pero en el workflow se tratan como secrets y `.vercel/` esta en `.gitignore`. Hay que decidir uno de los dos criterios.
6. **menor** — `desplegar.yml:79` pasa el token por `--token` en la linea de comandos. GitHub lo enmascara en el log, pero queda en la lista de procesos del runner, que es efimero. Riesgo bajo; anotado.

## Veredicto

**RECHAZADO** por el hallazgo 1: un test que ya existia (`deploy-hook.test.ts`, QC-6 R19/R20) queda rojo y el CI no pasara. Ademas, la propagacion del fallo del seed al build (R20) no la cubre ningun test. Los menores no bloquean.
