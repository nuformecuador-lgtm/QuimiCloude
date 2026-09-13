# QC-77 — tanda de limpieza: el `DROP` sincrono del camino de senal, sin duplicar

Tanda acotada, no feature nueva. El agente de T7 dejo el borrado sincrono del handler de
senal (R8) **copiado** en el `globalSetup` porque no tenia permiso para editar la libreria.
Su nota: «si se quiere sin duplicación, hace falta un `dropRunDatabaseSync` en la librería».
Esto es exactamente eso.

## Antes / despues

| | Antes | Despues |
|---|---|---|
| `DROP DATABASE ... WITH (FORCE)` sincrono | `tests/integration/_global-setup.ts` → `dropSynchronously`, con su propio `spawnSync`, su propio `node -e` con `pg`, su propia copia del patron `/^qct_[a-z0-9_]{1,58}$/` y su propia resolucion de `/postgres` (`new URL(...)` a mano) | `tests/helpers/test-database.ts` → **`dropRunDatabaseSync(name, developmentUrl?)`**, hermano sincrono de `dropRunDatabase`: mismo `assertTestDatabaseName` **antes** de construir el DDL, mismo `quoteIdentifier`/`DROP ... WITH (FORCE)`, misma `adminUrl(developmentUrl ?? resolveDevelopmentUrl())` |
| `dropSynchronously` en el `globalSetup` | ~55 lineas: script embebido + `spawnSync` + aviso | 20 lineas: `try { dropRunDatabaseSync(...) } catch { warn }` + `rmSync` del rastro + log |
| El comentario del **por que** sincrono (cita del `setTimeout(() => process.exit(), 1)` de Vitest en `addCleanupListeners`, medido en T8) | en el `globalSetup` | **en la libreria**, junto a `dropRunDatabaseSync`, con el aviso explicito de que convertirlo en `async` devuelve la base viva tras Ctrl-C; en el `globalSetup` queda la remision corta |

Detalles del movimiento:

- **Ninguna dependencia nueva (R23).** Sigue siendo un `node -e` con `pg`, que ya es
  dependencia. Un cambio de fondo: al hijo se le pasa ahora la **ruta ya resuelta** de `pg`
  (`createRequire(import.meta.url).resolve('pg')`) en vez de un `require('pg')` que dependia
  de que el `cwd` del hijo fuera el worktree. La libreria la puede llamar cualquiera desde
  cualquier cwd; el `globalSetup` fijaba `cwd: worktreePath` a mano.
- **El fallo se propaga como excepcion**, no como aviso desde dentro: `dropRunDatabaseSync`
  lanza con el codigo y el `stderr` del hijo, y quien llama decide. El `globalSetup` sigue
  haciendo lo mismo que antes — avisar y **dejar el rastro en pie** para que la corrida
  siguiente lo reclame (R9, capa 3).
- **El comportamiento no cambia**: sigue borrando sincronamente y sigue relanzando la senal
  sobre si mismo con el handler ya quitado (`process.once` + `process.kill(process.pid, signal)`),
  para no alterar el codigo de salida.
- **Divergencia menor con el enunciado:** la firma pedida era `(name, adminUrl?)`. Se
  implemento `(name: string, developmentUrl?: string): void`, igual que su hermano
  `dropRunDatabase`: el segundo argumento **no** es una URL de administracion ya hecha, es la
  URL de desarrollo de la que la funcion deriva `/postgres` (misma resolucion, mismo helper
  `adminUrl`). Llamarlo `adminUrl` habria mentido sobre lo que hay que pasarle.

Archivos tocados (solo estos dos, como pedia el encargo):

- `tests/helpers/test-database.ts`
- `tests/integration/_global-setup.ts`

## Verificacion

### `pnpm run typecheck`

```
> quimicloude@0.1.0 typecheck
> tsc --noEmit
```
(sin salida = verde)

### `pnpm run lint`

```
> quimicloude@0.1.0 lint
> eslint
```
(sin salida = verde)

### La prueba que cuenta: Ctrl-C de verdad a mitad de corrida (R8)

Receta de `progress/_qc77_T7-T9.md > Desenlace 2`, las tres cosas que hay que acertar en
Windows: `CTRL_C_EVENT` al **grupo de procesos propio** desde el mismo proceso que lanza la
corrida, quitar el `SetConsoleCtrlHandler(NULL, TRUE)` **heredable** antes de crear el hijo (y
ponerlo despues solo para uno mismo), y lanzar `node node_modules/vitest/vitest.mjs`, no
`pnpm`/`cmd`. Lanzador temporal en `%TEMP%`, **borrado al terminar**.

```
bases qct_ ANTES:    qct_tpl_1db8043a68e0
rastros ANTES:       (ninguno)

[runner] vitest pid=13104
 RUN  v4.1.10 C:/.../.worktrees/QC-77-aislamiento-de-la-base-en-tests-de-integracion
test-db: plantilla reutilizada: qct_tpl_1db8043a68e0 (las migraciones no han cambiado)
test-db: la corrida de integracion va contra qct_qc77_7a512e99_mtymt9ue_a40 (copia de qct_tpl_1db8043a68e0).
test-db: recibido SIGINT: borrando qct_qc77_7a512e99_mtymt9ue_a40 antes de salir.
CTRL_C_EVENT enviado a los 20 s: True
test-db: borrada la base de la corrida: qct_qc77_7a512e99_mtymt9ue_a40.
[runner] vitest termino code=1

bases qct_ DESPUES:  qct_tpl_1db8043a68e0
rastros DESPUES:     (ninguno)
```

Corrida cortada a mitad (no hay resumen de `Test Files`), base borrada **antes** de salir, y el
codigo de salida lo sigue poniendo Vitest (1). Igual que en T8, ahora con el `DROP` viviendo en
un solo sitio. De las `qct_` solo queda la plantilla, que es cache legitima.

### Corrida normal, para confirmar que el teardown asincrono (R7) sigue intacto

```
$ pnpm exec vitest run tests/integration/identity/identity-seed.int.test.ts
test-db: plantilla reutilizada: qct_tpl_1db8043a68e0 (las migraciones no han cambiado)
test-db: la corrida de integracion va contra qct_qc77_7a512e99_mtymq7bo_e2c (copia de qct_tpl_1db8043a68e0).
 Test Files  1 passed (1)
      Tests  14 passed (14)
   Duration  6.86s
test-db: borrada la base de la corrida: qct_qc77_7a512e99_mtymq7bo_e2c.
```

No se corrio la suite completa, ni `./init.sh`, ni `--project integration` entero: fuera del
alcance de esta tanda.

## Veredicto

La duplicacion queda resuelta —el `DROP` sincrono vive solo en la libreria— y el camino de
senal sigue borrando la base, medido con un Ctrl-C real.
