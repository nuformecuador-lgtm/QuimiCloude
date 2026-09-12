/**
 * QC-77 — `globalSetup` del proyecto `integration`.
 *
 * Corre **una vez por corrida**, en el proceso principal de Vitest y antes de que arranque
 * ningun worker. Es el sitio donde nace y muere la base efimera de la corrida
 * (`design.md > 4` y `> 5`). El ciclo de vida en si —plantilla, copia, rastro, barrido— vive
 * en `tests/helpers/test-database.ts`; aqui solo se orquesta y se publica el resultado.
 *
 * El orden importa y no es arbitrario:
 *
 *   1. barrido de lo que dejo colgando una corrida anterior de ESTE worktree (R9), antes de
 *      crear nada: si la maquina se apago a mitad, la base huerfana se va ahora;
 *   2. plantilla asegurada (R2, R3, R5, R6) — se paga una vez por conjunto de migraciones;
 *   3. `CREATE DATABASE ... TEMPLATE` (R1) y rastro en disco;
 *   4. se publica la URL en el entorno, que es como la ve el worker;
 *   5. se dice por consola contra que base va a correr la corrida;
 *   6. se enganchan SIGINT y SIGTERM (R8);
 *   7. se devuelve el teardown (R7).
 *
 * **Como llega la URL al worker.** Mutando `process.env`. No es una suposicion: T4 lo midio
 * con una sonda sobre Vitest 4.1.10 (`progress/qc77-mediciones/T4.md`, P1 = SI). El pool es `forks`,
 * asi que el worker es un proceso hijo que hereda el entorno del padre en el `spawn`.
 * `provide()`/`inject()` tambien funciona y queda como plan B medido, pero el design manda
 * usar el primario si funciona. **Si algun dia alguien declara `pool` en `vitest.config.mts`,
 * esa medicion caduca** y hay que repetirla, no deducirla. La red que convierte una rotura de
 * esta propagacion en un rojo ruidoso —en vez de en «los 41 archivos contra la base de
 * desarrollo» en silencio— es el guardian de `_setup.ts`.
 *
 * **No hay corto-circuito para `--rapido`.** `design.md > 4` lo condicionaba a la medicion:
 * T4 (P2 = NO) comprobo que Vitest **no** ejecuta el `globalSetup` de este proyecto cuando el
 * filtro no selecciona ningun archivo suyo. Como no lo ejecuta, no hay coste que evitar y no
 * se escribe ninguna variable de escape: una sola regla, sin excepciones (R11).
 *
 * Identificadores en ingles (R31); los mensajes por consola, en castellano.
 */
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import {
  createRunDatabase,
  destroyRunDatabase,
  dropRunDatabaseSync,
  ensureTemplateDatabase,
  reclaimAbandonedDatabases,
  resolveDevelopmentUrl,
  type RunDatabase,
} from '../helpers/test-database'

/**
 * Raiz del worktree, deducida de la ruta de ESTE archivo y no de `process.cwd()`: el cwd
 * depende de desde donde se invoque Vitest, y la identidad del dueno de la base (R9, R10) no
 * puede depender de eso.
 */
const worktreePath = fileURLToPath(new URL('../..', import.meta.url))

/**
 * El nombre que la corrida publica para que el worker pueda comprobarlo (R12).
 *
 * Hace falta un segundo canal ademas de `DATABASE_URL`: el guardian tiene que distinguir
 * «apunta a una base `qct_`» de «apunta a **esta** base `qct_`». Sin esto, una base efimera
 * de otra corrida pasaria el patron sin ser la suya.
 */
const RUN_DATABASE_ENV = 'QC77_RUN_DATABASE'

/** Las senales que si se pueden atender. Un `SIGKILL` no ejecuta nada: para eso esta el rastro. */
const HANDLED_SIGNALS = ['SIGINT', 'SIGTERM'] as const

function log(message: string): void {
  console.log(`test-db: ${message}`)
}

export default async function setup(): Promise<() => Promise<void>> {
  const developmentUrl = resolveDevelopmentUrl(worktreePath)

  // 1. Lo que dejo colgando una corrida que murio sin borrar su base (R9). Solo rastros de
  //    este worktree y solo con el pid ya muerto: la propia libreria lo comprueba y dice por
  //    consola cual borro y por que.
  await reclaimAbandonedDatabases(worktreePath)

  // 2 y 3. Plantilla (cache por huella de migraciones) y copia de la corrida.
  const context = { repoRoot: worktreePath, worktreePath, developmentUrl }
  const template = await ensureTemplateDatabase(context)
  const run = await createRunDatabase({ ...context, templateDatabase: template })

  // 4. Publicar. Se escriben LAS DOS: en local apuntan al mismo sitio
  //    (`prisma.config.ts:25-27`) y dejar `DIRECT_URL` en la de desarrollo seria justo el
  //    agujero que esta ficha cierra.
  process.env.DATABASE_URL = run.url
  process.env.DIRECT_URL = run.url
  process.env[RUN_DATABASE_ENV] = run.name

  // 5. Decirlo. Una corrida de integracion que no dice contra que base fue no es auditable.
  log(`la corrida de integracion va contra ${run.name} (copia de ${template}).`)

  // 6. Senales (capa 2 de `design.md > 5`). Se relanza la senal sobre uno mismo con el
  //    handler ya quitado, para no cambiar el codigo de salida que ve la consola.
  //    NO se usa `process.on('exit')`: alli no se puede hacer nada asincrono y un
  //    `DROP DATABASE` lo es.
  const teardown = createTeardown(run, developmentUrl)
  for (const signal of HANDLED_SIGNALS) {
    process.once(signal, () => {
      log(`recibido ${signal}: borrando ${run.name} antes de salir.`)
      dropSynchronously(run, developmentUrl)
      // El handler era `once`, o sea que ya no esta puesto: relanzar la senal deja que siga
      // su curso normal (el handler de Vitest, si esta, o la accion por defecto) y el codigo
      // de salida que ve la consola no cambia por culpa de esta limpieza.
      process.kill(process.pid, signal)
    })
  }

  // 7. El teardown normal (R7). Vitest lo llama termine la corrida como termine.
  return teardown
}

/**
 * El borrado de la base en el camino de la senal (R8). Es **sincrono a proposito**, y no un
 * `await destroyRunDatabase(...)`: Vitest tiene su propio handler de `SIGINT`/`SIGTERM` que
 * termina en `setTimeout(() => process.exit(), 1)`, asi que una promesa no llega a resolverse
 * y la base sobrevive al Ctrl-C. El porque completo, con la cita y la medicion de T8, vive
 * junto a `dropRunDatabaseSync` en `tests/helpers/test-database.ts`. **Leelo antes de
 * convertir esto en asincrono.**
 */
function dropSynchronously(run: RunDatabase, developmentUrl: string): void {
  try {
    dropRunDatabaseSync(run.name, developmentUrl)
  } catch (error) {
    // Si falla, el rastro se queda a proposito: es lo que hace que la corrida siguiente la
    // reclame (R9, capa 3). Callarlo seria dejar una base colgando sin que nadie lo sepa.
    console.warn(
      `test-db: no se pudo borrar ${run.name} al recibir la senal: ` +
        `${error instanceof Error ? error.message : String(error)} ` +
        'El rastro sigue en `.qc-test-db/`, asi que la proxima corrida la reclamara.',
    )
    return
  }
  rmSync(run.tracePath, { force: true })
  log(`borrada la base de la corrida: ${run.name}.`)
}

/**
 * El borrado, idempotente: lo llaman tanto el teardown de Vitest como el handler de senal, y
 * en una corrida interrumpida pueden llegar los dos. Un `DROP` de mas seria inofensivo, pero
 * un error dentro de un handler de senal si tapa el motivo real de la salida.
 */
function createTeardown(run: RunDatabase, developmentUrl: string): () => Promise<void> {
  let done = false
  return async () => {
    if (done) return
    done = true
    try {
      await destroyRunDatabase(run, developmentUrl)
      log(`borrada la base de la corrida: ${run.name}.`)
    } catch (error) {
      // Si el borrado falla, la corrida no se convierte en roja por eso —el veredicto de los
      // tests ya esta dado—, pero el rastro sigue en disco y la corrida siguiente la recoge
      // (R9). Lo que no se puede hacer es callarlo.
      console.warn(
        `test-db: no se pudo borrar ${run.name}: ${error instanceof Error ? error.message : String(error)}. ` +
          'El rastro sigue en `.qc-test-db/`, asi que la proxima corrida la reclamara.',
      )
    }
  }
}
