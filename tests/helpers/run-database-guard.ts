/**
 * QC-77 — el juicio del guardian de R12, extraido de `tests/integration/_setup.ts`.
 *
 * Por que vive aparte: `_setup.ts` hace su comprobacion **en el cuerpo del modulo** —tiene
 * que lanzar antes de que el archivo de test se importe—, asi que importarlo desde un test
 * dispararia el aborto en vez de medirlo. Aqui esta el mismo juicio como funcion **pura**:
 * recibe el entorno, devuelve el mensaje de aborto (o `undefined` si todo esta bien) y no
 * decide nada sobre el proceso. Quien lanza es `_setup.ts`.
 *
 * **Sin dependencias y sin efectos al importarse**: lo carga cada worker una vez por archivo
 * de test, asi que tiene que ser barato. Nada de `pg`, nada de leer disco, nada de `.env`.
 *
 * Identificadores en ingles (R31); el mensaje, en castellano, como el resto del arnes.
 */

/** Lo publica `_global-setup.ts`. Su ausencia es, en si misma, el fallo que R12 describe. */
export const RUN_DATABASE_ENV = 'QC77_RUN_DATABASE'

/** Mismo prefijo reservado que usa `tests/helpers/test-database.ts` para nombrar. */
const TEST_DATABASE_NAME_PATTERN = /^qct_[a-z0-9_]{1,58}$/

/** Las tres variables que deciden contra que base va a correr un archivo de integracion. */
export interface DatabaseGuardEnvironment {
  DATABASE_URL?: string
  DIRECT_URL?: string
  QC77_RUN_DATABASE?: string
}

/**
 * El nombre de la base dentro de una URL de conexion. Se lee con `new URL` y no con una
 * expresion regular porque la contrasena puede contener cualquier cosa, incluida una barra.
 */
function databaseNameOf(url: string): string | undefined {
  try {
    const path = new URL(url).pathname.replace(/^\//, '')
    return path === '' ? undefined : decodeURIComponent(path)
  } catch {
    return undefined
  }
}

/**
 * El mensaje **nombra la base que encontro** (R12 lo exige literalmente): sin eso, quien lo
 * lea no sabe si el problema es que apunta a desarrollo, a la de otra corrida o a ninguna.
 */
function abortMessage(found: string, detail: string): string {
  return (
    `test-db: ABORTADO antes del primer caso. Los tests de integracion apuntan a ${found}, ` +
    `y ${detail} ` +
    'Correrlos asi ensuciaria una base que no es de esta corrida (QC-77, R12). ' +
    'La base la crea `tests/integration/_global-setup.ts`; si este mensaje aparece, lo que ' +
    'fallo es la propagacion del entorno del proceso principal al worker — ver ' +
    '`progress/qc77-mediciones/T4.md`.'
  )
}

/**
 * Los cinco desenlaces que distingue el guardian, **en este orden**:
 *
 *   1. de `DATABASE_URL` no sale ningun nombre de base (incluida: sin definir),
 *   2. el nombre no lleva el prefijo reservado `qct_` — tipicamente, la base de desarrollo,
 *   3. la corrida no publico ninguna base en `QC77_RUN_DATABASE`,
 *   4. el nombre es `qct_` pero **de otra corrida**,
 *   5. `DIRECT_URL` apunta a otra base que `DATABASE_URL`.
 *
 * Devuelve el mensaje de aborto, o `undefined` si la conexion apunta a la base de esta
 * corrida por las dos variables.
 */
export function runDatabaseGuardFailure(env: DatabaseGuardEnvironment): string | undefined {
  const expected = env.QC77_RUN_DATABASE
  const databaseUrl = env.DATABASE_URL
  const found = databaseUrl === undefined ? undefined : databaseNameOf(databaseUrl)

  if (found === undefined) {
    return abortMessage(
      databaseUrl === undefined ? '«(DATABASE_URL sin definir)»' : `«${databaseUrl}»`,
      'de ahi no se puede leer ningun nombre de base.',
    )
  }
  if (!TEST_DATABASE_NAME_PATTERN.test(found)) {
    return abortMessage(
      `«${found}»`,
      'ese nombre no es el de una base efimera de test (prefijo `qct_`).',
    )
  }
  if (expected === undefined || expected === '') {
    return abortMessage(`«${found}»`, `esta corrida no publico ninguna base en ${RUN_DATABASE_ENV}.`)
  }
  if (found !== expected) {
    return abortMessage(`«${found}»`, `la base de esta corrida es «${expected}».`)
  }

  // La `DIRECT_URL` es la que usa Prisma Migrate y cualquier cosa que evite el pooler. Dejarla
  // en la de desarrollo mientras `DATABASE_URL` va a la efimera es medio agujero, y medio
  // agujero es un agujero.
  const direct = env.DIRECT_URL
  if (direct !== undefined && databaseNameOf(direct) !== expected) {
    return abortMessage(
      `«${found}» pero con DIRECT_URL en «${databaseNameOf(direct) ?? direct}»`,
      `las dos tienen que apuntar a «${expected}».`,
    )
  }

  return undefined
}
