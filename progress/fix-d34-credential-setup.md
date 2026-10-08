# D34 — `credential-setup.int.test.ts` R11 intermitente en CI

Fecha: 2026-10-07 · Rama: `chore/ci-velocidad-y-d34` · Requisito: QC-79 R11 (un solo enlace vivo
por persona, garantizado por el índice parcial `credential_setup_tokens_one_live_per_user`).

## Causa raíz: orden de arranque (no el pool ni la consulta de `pg_stat_activity`)

El caso lanzaba el `$transaction` del bloqueo (`SELECT … FOR UPDATE` sobre el enlace anterior) y,
**en el mismo tick y sin esperar a que el bloqueo estuviera tomado**, las dos emisiones. Si una
emisión llegaba a su paso 1 (`updateMany`) antes que el `FOR UPDATE`, ganaba sin esperar, insertaba
y confirmaba en milisegundos; el bloqueo y la otra emisión quedaban encolados tras ELLA solo un
instante, o el bloqueo atrapaba ya la fila nueva y solo había 1 esperando. En ningún caso se veían
2 sesiones con `wait_event_type = 'Lock'` de forma sostenida → `waitForLockWaiters` agotaba sus 5 s
→ «carrera no ejercida». Alargar el plazo no ayuda: ya no queda nada esperando.

Descartado: el pool. Cada emisión va por su propio `PrismaClient` (pool por defecto ≥ 3) y el
bloqueo + el sondeo por el `prisma` global; nada compite por conexión.

**Evidencia (reproducción determinista).** Con un retardo inyectado temporalmente en el bloqueo
antes del `FOR UPDATE` (simula un runner lento que lo planifica tarde), sobre el código ORIGINAL:
- `setTimeout(0)`: 1 de 3 corridas de R11 en rojo; 5 ms: 2 de 3; 20 ms y 100 ms: 3 de 3.
- El error es exactamente el de CI: `las 2 emisiones no llegaron a encolarse tras el bloqueo`.
Sin retardo y con 24 hilos de carga en local no se reprodujo (10/10 verdes): la máquina tiene 12
núcleos y Postgres corre en la VM de Docker; el runner de CI tiene 2 vCPU compartidas.

**No es un bug de producción.** El adaptador (`credential-setup-link-prisma.ts`) es correcto; el
fallo estaba solo en cómo el test fuerza la carrera. No se tocó código de producción.

## Arreglo (solo en el test)

`tests/integration/identity/credential-setup.int.test.ts`, caso R11 concurrente:
1. El bloqueo abre una puerta `sostenido` cuando su `FOR UPDATE` ya devolvió; el test hace
   `await Promise.race([sostenido.opened, bloqueo])` y SOLO entonces lanza las dos emisiones.
   El `race` contra `bloqueo` convierte un fallo del bloqueo en error inmediato, no en cuelgue.
2. Se afirma `filasBloqueadas === 1`: el bloqueo atrapó el enlace anterior (con 0 no habría carrera).
3. `gate.open()` va en `finally` tras `waitForLockWaiters`: si la espera fallara, el bloqueo no
   queda colgado 10 s reteniendo la fila que la limpieza tiene que borrar.
4. Cabecera del archivo actualizada con el porqué (D34).

Con el arreglo y el mismo retardo inyectado (0, 5 y 100 ms): 15/15 verdes en las tres.

## Prueba de que muerde

Temporalmente, `DROP INDEX "credential_setup_tokens_one_live_per_user"` al inicio del caso (en la
base efímera de la corrida): las 3 corridas de R11 en rojo con
`AssertionError: expected [ …(2) ] to have a length of 1 but got 2` (las dos emisiones ganan).
Restaurado; el resto del archivo siguió verde. Toda instrumentación temporal (`D34-TMP`) retirada.

## Corridas

- 20 corridas consecutivas del archivo tras el arreglo: **20/20 verdes** (15/15 tests cada una).
- 10 corridas con 24 hilos de CPU ocupados en paralelo: **10/10 verdes**.
- Comando: `pnpm exec vitest run --project integration tests/integration/identity/credential-setup.int.test.ts`.

## Otros cambios

- `tests/baseline-rojos.json`: borrada la entrada del archivo.
- `progress/deudas.md` D34: marcada `(resuelta)` con línea **Estado:** (no había convención previa
  de deuda resuelta en el archivo; se sigue el estilo de los sufijos `(¿vigente?)`). Sin reordenar.

## Verificación

- `pnpm run typecheck`: exit 0 (tras `next typegen`, ver D3). `pnpm run lint`: exit 0 (avisos
  previos en otros archivos). `pnpm exec vitest run guard`: 52 archivos, 702 passed, 11 skipped.
- Nota de entorno: el worktree no tenía `prisma generate`; se generó para poder correr.

Veredicto: R11 determinista, sigue mordiendo; fuera del baseline.
