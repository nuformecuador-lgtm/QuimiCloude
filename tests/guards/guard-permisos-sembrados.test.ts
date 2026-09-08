// T15 (QC-74) — Guardia: ningun permiso declarado se queda sin rol (R19, R21).
//
// El catalogo de permisos y el seed viven en dos constantes distintas del mismo archivo
// (`lib/modules/identity/domain/permissions.ts`), y nada del compilador las ata: `PERMISSIONS` es
// una lista `as const` y `SEED_ROLE_PERMISSIONS` es un `Record` que la referencia solo por el tipo
// `PermissionCode`. Eso deja abierta la puerta exacta que la decision 7 del humano (2026-09-07)
// manda cerrar con una guardia ejecutable: el dia que entre un modulo nuevo, quien lo escriba
// añadira su fila al catalogo —porque sin ella `requirePermission('x.consultar')` no compila— y se
// olvidara de sumarla al seed, porque olvidarse del seed NO rompe el typecheck. El permiso quedaria
// declarado, exigido por el caso de uso, y sembrado a nadie: el modulo nace inaccesible hasta para
// el Administrador, y en despliegue, no en el gate.
//
// El sentido inverso vale lo mismo por la razon opuesta: una asignacion a un codigo que el catalogo
// no declara revienta la FK `role_permissions.permission_code -> permissions.code` cuando corre el
// seed contra la base, tambien fuera del gate. Hoy el tipo `PermissionCode` lo frena, pero
// `SEED_ROLE_PERMISSIONS` esta anotado a mano (`Readonly<Record<string, readonly PermissionCode[]>>`)
// y ese `string` en la clave —mas cualquier `as` futuro— es suficiente rendija.
//
// Mismo patron que `tests/guards/guard-rol-administrador-unico.test.ts`, que es el precedente
// exacto: funciones puras exportadas, el dato REAL importado del barrel `@/lib/modules/identity`
// (nunca una copia escrita a mano, R21), fuentes sinteticos que demuestran que la regla dispara Y el
// caso simetrico que no la viola, y anclas contra el verde por vacuidad.
//
// Diferencia con el precedente: aqui NO se recorre el arbol de archivos. Lo que se compara son dos
// constantes en memoria, asi que la guardia importa el dato y no lee el disco.

import { describe, expect, it } from 'vitest'

import {
  PERMISSIONS,
  SEED_ROLE_PERMISSIONS,
  SEED_ROLES,
} from '@/lib/modules/identity'

/** Lo minimo que la regla necesita de una entrada del catalogo: su codigo. */
export type CatalogEntry = { readonly code: string }

/** Lo minimo que la regla necesita del seed: que rol recibe que codigos. */
export type SeedAssignments = Readonly<Record<string, readonly string[]>>

/** Una asignacion concreta del seed, para poder nombrar al culpable con su rol (R19). */
export type SeedAssignment = { readonly role: string; readonly code: string }

/** Todas las asignaciones del seed, aplanadas a pares `(rol, codigo)`. */
export function flattenSeedAssignments(seed: SeedAssignments): readonly SeedAssignment[] {
  return Object.entries(seed).flatMap(([role, codes]) =>
    codes.map((code) => ({ role, code })),
  )
}

/**
 * Los codigos del catalogo que NINGUN rol del seed recibe (R19).
 *
 * Es la direccion que ningun compilador cubre: sumar una fila a `PERMISSIONS` y no sumarla a
 * `SEED_ROLE_PERMISSIONS` compila perfectamente.
 */
export function findUnseededPermissions(
  catalog: readonly CatalogEntry[],
  seed: SeedAssignments,
): readonly string[] {
  const sembrados = new Set(flattenSeedAssignments(seed).map((assignment) => assignment.code))
  return catalog.filter((entry) => !sembrados.has(entry.code)).map((entry) => entry.code)
}

/**
 * La simetrica: las asignaciones del seed cuyo codigo el catalogo NO declara.
 *
 * Devuelve el par entero —no solo el codigo— porque el mensaje de fallo tiene que decir a que rol
 * pertenece la asignacion invalida para que quien la lea sepa donde borrar.
 */
export function findSeededPermissionsOutsideCatalog(
  catalog: readonly CatalogEntry[],
  seed: SeedAssignments,
): readonly SeedAssignment[] {
  const declarados = new Set(catalog.map((entry) => entry.code))
  return flattenSeedAssignments(seed).filter((assignment) => !declarados.has(assignment.code))
}

/** Formato estable para nombrar un par en un mensaje de fallo: `Operador -> pedidos.consultar`. */
function describeAssignment(assignment: SeedAssignment): string {
  return `${assignment.role} -> ${assignment.code}`
}

/**
 * Los roles que el seed de permisos DEBE nombrar, DERIVADOS de `SEED_ROLES` (R21). Escribirlos a
 * mano aqui haria que renombrar un rol dejara esta guardia vigilando un nombre inexistente, verde
 * por vacuidad, que es justo lo que el precedente documenta.
 */
const ROLES_SEMBRADOS = SEED_ROLES.map((role) => role.name)

describe('guardia — ningun permiso declarado se queda sin rol (R19, R21)', () => {
  it('todo permiso del catalogo esta asignado a al menos un rol del seed', () => {
    const huerfanos = findUnseededPermissions(PERMISSIONS, SEED_ROLE_PERMISSIONS)

    expect(
      huerfanos,
      huerfanos.length === 0
        ? undefined
        : `Estos permisos estan declarados en PERMISSIONS y ningun rol los recibe en ` +
            `SEED_ROLE_PERMISSIONS: ${huerfanos.join(', ')}. ` +
            'Un permiso sin rol deja su modulo inaccesible hasta para el Administrador, y el ' +
            'typecheck no lo ve: si sumaste un modulo nuevo al catalogo, sumalo tambien al seed ' +
            "en 'lib/modules/identity/domain/permissions.ts' (R19).",
    ).toEqual([])
  })

  it('toda asignacion del seed apunta a un permiso que el catalogo declara', () => {
    const invalidas = findSeededPermissionsOutsideCatalog(PERMISSIONS, SEED_ROLE_PERMISSIONS)

    expect(
      invalidas.map(describeAssignment),
      invalidas.length === 0
        ? undefined
        : 'Estas asignaciones del seed apuntan a un codigo que PERMISSIONS no declara: ' +
            `${invalidas.map(describeAssignment).join(', ')}. ` +
            'La FK role_permissions.permission_code -> permissions.code las rechazaria al correr ' +
            'el seed contra la base, o sea en el despliegue y no aqui. Declara el permiso en el ' +
            'catalogo o borra la asignacion.',
    ).toEqual([])
  })

  // Anclas contra el verde por vacuidad: sin ellas, un catalogo vaciado por accidente dejaria los
  // dos casos de arriba en verde sin haber comparado nada.
  it('el catalogo real no esta vacio y tiene exactamente once permisos', () => {
    expect(PERMISSIONS.length).toBeGreaterThan(0)
    expect(
      PERMISSIONS.length,
      'El catalogo es cerrado y tiene once entradas (QC-74 R2, enmendado por QC-38). Si esta ' +
        'ficha lo cambia a proposito, actualiza este numero; si no, alguien borro o duplico una ' +
        'fila de PERMISSIONS.',
    ).toBe(11)

    const codigos = PERMISSIONS.map((entry) => entry.code)
    expect(new Set(codigos).size, `Hay codigos repetidos en PERMISSIONS: ${codigos.join(', ')}`).toBe(
      codigos.length,
    )
  })

  it('el seed nombra exactamente los roles de SEED_ROLES, y ninguno se queda sin permisos', () => {
    expect(Object.keys(SEED_ROLE_PERMISSIONS).sort()).toEqual([...ROLES_SEMBRADOS].sort())

    for (const role of ROLES_SEMBRADOS) {
      expect(
        SEED_ROLE_PERMISSIONS[role]?.length ?? 0,
        `El rol '${role}' esta en SEED_ROLES y no recibe ningun permiso en SEED_ROLE_PERMISSIONS.`,
      ).toBeGreaterThan(0)
    }
  })

  // Casos sinteticos (R21): la regla se demuestra sobre datos fabricados aqui, para que se vea que
  // dispara ante la infraccion y que NO dispara ante el caso correcto simetrico.
  it('la regla dispara con un catalogo sintetico que declara un permiso sin asignar', () => {
    const catalogo = [
      { code: 'inventario.consultar' },
      { code: 'inventario.modificar' },
      // El modulo nuevo que alguien sumo al catalogo y olvido sumar al seed:
      { code: 'compras.consultar' },
    ]
    const seed = {
      Administrador: ['inventario.consultar', 'inventario.modificar'],
      Operador: ['inventario.consultar'],
    }

    expect(findUnseededPermissions(catalogo, seed)).toEqual(['compras.consultar'])
  })

  it('la regla NO dispara con el caso correcto simetrico: el mismo catalogo con el permiso sembrado', () => {
    const catalogo = [
      { code: 'inventario.consultar' },
      { code: 'inventario.modificar' },
      { code: 'compras.consultar' },
    ]
    const seed = {
      Administrador: ['inventario.consultar', 'inventario.modificar', 'compras.consultar'],
      Operador: ['inventario.consultar'],
    }

    expect(findUnseededPermissions(catalogo, seed)).toEqual([])

    // Basta con que UN rol lo reciba, no todos: el Operador sigue sin 'compras.consultar' y eso no
    // es una infraccion (R9 le da exactamente un permiso a proposito).
    expect(findUnseededPermissions(catalogo, { Operador: seed.Operador })).toEqual([
      'inventario.modificar',
      'compras.consultar',
    ])
  })

  it('la simetrica dispara con un seed que asigna un codigo fuera del catalogo, nombrando el rol', () => {
    const catalogo = [{ code: 'inventario.consultar' }]
    const seed = {
      Administrador: ['inventario.consultar'],
      Operador: ['inventario.consultar', 'inventaro.consultar'],
    }

    expect(findSeededPermissionsOutsideCatalog(catalogo, seed)).toEqual([
      { role: 'Operador', code: 'inventaro.consultar' },
    ])
  })

  it('la simetrica NO dispara con el caso correcto: todo lo sembrado esta en el catalogo', () => {
    const catalogo = [{ code: 'inventario.consultar' }, { code: 'inventario.modificar' }]
    const seed = {
      Administrador: ['inventario.consultar', 'inventario.modificar'],
      Operador: ['inventario.consultar'],
    }

    expect(findSeededPermissionsOutsideCatalog(catalogo, seed)).toEqual([])
  })

  it('las dos direcciones son independientes: un catalogo vacio con seed lleno solo dispara la simetrica', () => {
    const seed = { Administrador: ['inventario.consultar'] }

    // Sin catalogo no hay nada huerfano que reportar...
    expect(findUnseededPermissions([], seed)).toEqual([])
    // ...pero toda asignacion queda fuera del catalogo. Por eso el ancla del tamaño de PERMISSIONS
    // es parte de la guardia y no un adorno.
    expect(findSeededPermissionsOutsideCatalog([], seed)).toEqual([
      { role: 'Administrador', code: 'inventario.consultar' },
    ])
  })
})
