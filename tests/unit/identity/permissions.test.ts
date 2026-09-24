// QC-74 T1 — el catalogo de permisos es el UNICO dueño de los codigos (R1-R4) y `SEED_ROLE_PERMISSIONS`
// el UNICO dueño de lo que tiene cada rol (R8, R9). Este test lee ambos por el barrel, que es como los
// consume el resto del repo, y comprueba tambien lo que NO debe estar ahi (R6).

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  PERMISSIONS,
  ROLE_ADMINISTRADOR,
  ROLE_OPERADOR,
  ROLE_EMPACADOR,
  SEED_ROLE_PERMISSIONS,
} from '@/lib/modules/identity'

/** Los codigos del catalogo, copiados a mano -no derivados de el-: si el catalogo cambia, este
 *  test tiene que cambiar tambien, que es justamente lo que se quiere. */
const CODIGOS_DEL_REQUISITO = [
  'dashboard.consultar',
  'inventario.consultar',
  'inventario.modificar',
  'recetas.consultar',
  'recetas.modificar',
  'unidades.consultar',
  'unidades.modificar',
  'proveedores.consultar',
  'proveedores.modificar',
  'pedidos.consultar',
  'pedidos.modificar',
  'usuarios.consultar',
  'usuarios.modificar',
  'asignaciones.consultar',
  'asignaciones.modificar',
  'terminados.consultar',
  'clientes.consultar',
  'clientes.modificar',
  'documentos.consultar',
  'documentos.modificar',
] as const

/** Los nombres de modulo del repositorio, mas `usuarios` y `terminados`: no son carpetas reales de
 *  `lib/modules/` -viven dentro de `identity`- pero valen igual como `<modulo>` porque el codigo
 *  lo lee una persona. */
const MODULOS = [
  'inventario',
  'recetas',
  'unidades',
  'proveedores',
  'pedidos',
  'dashboard',
  'usuarios',
  'asignaciones',
  'terminados',
  'clientes',
  'documentos',
]

/** Modulos con casos de uso de escritura (R3) y sin ellos (R4). */
const MODULOS_CON_ESCRITURA = [
  'inventario',
  'recetas',
  'proveedores',
  'pedidos',
  'unidades',
  'usuarios',
  'asignaciones',
  'clientes',
  'documentos',
]
const MODULOS_SIN_ESCRITURA = ['dashboard', 'terminados']

const codigos = PERMISSIONS.map((permiso) => permiso.code)

describe('QC-74 — el catalogo de permisos (R1, R2, R3, R4, R6)', () => {
  it('R1: cada codigo es `<modulo>.<accion>` en español y en minusculas', () => {
    for (const permiso of PERMISSIONS) {
      expect(permiso.code).toBe(`${permiso.module}.${permiso.action}`)
      expect(permiso.code).toMatch(/^[a-z]+\.[a-z]+$/)
      expect(permiso.action === 'consultar' || permiso.action === 'modificar').toBe(true)
    }
  })

  it('R1: todo modulo declarado es un modulo del repositorio', () => {
    for (const permiso of PERMISSIONS) {
      expect(MODULOS).toContain(permiso.module)
    }
  })

  it('R2: contiene exactamente los codigos del requisito, sin duplicados', () => {
    expect(codigos).toEqual([...CODIGOS_DEL_REQUISITO])
    expect(new Set(codigos).size).toBe(codigos.length)
  })

  it('QC-142 R1: el catalogo contiene documentos.consultar y documentos.modificar con su modulo, accion y descripcion exactos', () => {
    expect(PERMISSIONS).toContainEqual({
      code: 'documentos.consultar',
      module: 'documentos',
      action: 'consultar',
      description: 'Consultar los documentos de la empresa y el estado de su procesamiento.',
    })
    expect(PERMISSIONS).toContainEqual({
      code: 'documentos.modificar',
      module: 'documentos',
      action: 'modificar',
      description: 'Subir documentos PDF y encolar su procesamiento.',
    })
  })

  it('QC-142 R2: el catalogo es el previo mas los dos codigos de documentos, ningun otro codigo documentos.* existe', () => {
    const catalogoPrevio = CODIGOS_DEL_REQUISITO.filter(
      (codigo) => codigo !== 'documentos.consultar' && codigo !== 'documentos.modificar',
    )

    expect(codigos).toEqual([...catalogoPrevio, 'documentos.consultar', 'documentos.modificar'])
    expect(codigos.filter((codigo) => codigo.startsWith('documentos.'))).toEqual([
      'documentos.consultar',
      'documentos.modificar',
    ])
  })

  it('R2: cada entrada trae descripcion no vacia', () => {
    for (const permiso of PERMISSIONS) {
      expect(permiso.description.trim().length).toBeGreaterThan(0)
    }
  })

  it('R3: cada modulo con escritura declara consultar Y modificar', () => {
    for (const modulo of MODULOS_CON_ESCRITURA) {
      const acciones = PERMISSIONS.filter((p) => p.module === modulo).map((p) => p.action)

      expect([...acciones].sort()).toEqual(['consultar', 'modificar'])
    }
  })

  it('R4: `dashboard` declara UNICAMENTE consultar', () => {
    for (const modulo of MODULOS_SIN_ESCRITURA) {
      const acciones = PERMISSIONS.filter((p) => p.module === modulo).map((p) => p.action)

      expect(acciones).toEqual(['consultar'])
    }
  })

  it('R6: ninguna entrada del catalogo lleva campo de empresa', () => {
    for (const permiso of PERMISSIONS) {
      expect(Object.keys(permiso).sort()).toEqual(['action', 'code', 'description', 'module'])
    }
  })

  it('QC-144 R4: el catalogo contiene terminados.consultar con su modulo, accion y descripcion exactos', () => {
    expect(PERMISSIONS).toContainEqual({
      code: 'terminados.consultar',
      module: 'terminados',
      action: 'consultar',
      description: 'Consultar todos los pedidos terminados de la empresa.',
    })
  })

  it('R21: el catalogo contiene clientes.consultar y clientes.modificar con su modulo, accion y descripcion exactos', () => {
    expect(PERMISSIONS).toContainEqual({
      code: 'clientes.consultar',
      module: 'clientes',
      action: 'consultar',
      description: 'Consultar los clientes de la empresa.',
    })
    expect(PERMISSIONS).toContainEqual({
      code: 'clientes.modificar',
      module: 'clientes',
      action: 'modificar',
      description: 'Crear, editar y borrar clientes de la empresa.',
    })
  })

  it('R21: el catalogo es el previo mas clientes.* mas documentos.*, en orden relativo', () => {
    const catalogoPrevio = CODIGOS_DEL_REQUISITO.filter(
      (codigo) =>
        codigo !== 'clientes.consultar' &&
        codigo !== 'clientes.modificar' &&
        codigo !== 'documentos.consultar' &&
        codigo !== 'documentos.modificar',
    )

    expect(codigos).toEqual([
      ...catalogoPrevio,
      'clientes.consultar',
      'clientes.modificar',
      'documentos.consultar',
      'documentos.modificar',
    ])
  })

  it('QC-144 R5: el catalogo es el previo mas terminados.consultar en su posicion, ningun otro codigo cambia', () => {
    const indiceDeTerminados = CODIGOS_DEL_REQUISITO.indexOf('terminados.consultar')
    const catalogoPrevio = CODIGOS_DEL_REQUISITO.slice(0, indiceDeTerminados)
    const posteriores = CODIGOS_DEL_REQUISITO.slice(indiceDeTerminados + 1)

    expect(codigos).toEqual([...catalogoPrevio, 'terminados.consultar', ...posteriores])
  })

  it('R6: la enmienda de terminados.consultar en el fuente no cita ficha ni requisito', () => {
    const raiz = join(__dirname, '..', '..', '..')
    const fuente = readFileSync(
      join(raiz, 'lib', 'modules', 'identity', 'domain', 'permissions.ts'),
      'utf8',
    )
    const citaFichaORequisito = /QC-\d+|\bR\d+\b|design\.md|decisi[oó]n cerrada/i
    const jsdoc = fuente.match(/\/\*\*([\s\S]*?)\*\/\s*export const PERMISSIONS/)?.[1] ?? ''
    const parrafos = jsdoc
      .split(/\n\s*\*\s*\n/)
      .map((bloque) => bloque.trim())
      .filter(Boolean)
    const primeraFrase = (parrafos[0] ?? '').split('.')[0] ?? ''
    const parrafoDeLaEnmienda = parrafos.find((parrafo) => parrafo.includes('terminados.consultar'))

    expect(parrafoDeLaEnmienda).toBeDefined()
    const lineas = parrafoDeLaEnmienda!.split('\n')
    expect(lineas.length).toBeLessThanOrEqual(5)
    expect(parrafoDeLaEnmienda).toMatch(/enmienda/i)
    expect(parrafoDeLaEnmienda).toContain('lib/modules/')
    expect(parrafoDeLaEnmienda).not.toMatch(citaFichaORequisito)
    expect(primeraFrase).not.toMatch(citaFichaORequisito)
  })

  it('R25: la enmienda de clientes.consultar/clientes.modificar en el fuente no cita ficha ni requisito', () => {
    const raiz = join(__dirname, '..', '..', '..')
    const fuente = readFileSync(
      join(raiz, 'lib', 'modules', 'identity', 'domain', 'permissions.ts'),
      'utf8',
    )
    const citaFichaORequisito = /QC-\d+|\bR\d+\b|design\.md|decisi[oó]n cerrada/i
    const jsdoc = fuente.match(/\/\*\*([\s\S]*?)\*\/\s*export const PERMISSIONS/)?.[1] ?? ''
    const parrafos = jsdoc
      .split(/\n\s*\*\s*\n/)
      .map((bloque) => bloque.trim())
      .filter(Boolean)
    const primeraFrase = (parrafos[0] ?? '').split('.')[0] ?? ''
    const parrafoDeLaEnmienda = parrafos.find((parrafo) => parrafo.includes('clientes.consultar'))

    expect(parrafoDeLaEnmienda).toBeDefined()
    const lineas = parrafoDeLaEnmienda!.split('\n')
    expect(lineas.length).toBeLessThanOrEqual(5)
    expect(parrafoDeLaEnmienda).toMatch(/enmienda/i)
    expect(parrafoDeLaEnmienda).toContain('clientes.consultar')
    expect(parrafoDeLaEnmienda).toContain('clientes.modificar')
    expect(parrafoDeLaEnmienda).not.toMatch(citaFichaORequisito)
    expect(primeraFrase).not.toMatch(citaFichaORequisito)
  })

  it('R6: el detector de citas caza un JSDoc sintetico que si nombra una ficha', () => {
    const citaFichaORequisito = /QC-\d+|\bR\d+\b|design\.md|decisi[oó]n cerrada/i
    const parrafoSintetico =
      ' * Cuarta enmienda al catalogo cerrado (QC-144): suma terminados.consultar en lib/modules/.'

    expect(parrafoSintetico).toMatch(citaFichaORequisito)
  })
})

describe('QC-74 — los permisos sembrados por rol (R8, R9, R6)', () => {
  it('R8: el Administrador tiene el conjunto completo del catalogo, escrito uno a uno', () => {
    expect(SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]).toEqual([...CODIGOS_DEL_REQUISITO])
  })

  it('R8: no hay comodin ni regla implicita en el conjunto del Administrador', () => {
    // Este caso vigila las dos formas en las que un comodin se colaria por la puerta de atras.
    for (const codigo of SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR] ?? []) {
      // 1. Ningun codigo asignado es un comodin ni lo contiene ('*', 'inventario.*', 'todo'...).
      expect(codigo).not.toMatch(/[*]/)
      // 2. Todo codigo asignado es un permiso REAL del catalogo, con su forma exacta: nada de
      //    tokens especiales que el resolvedor tuviera que interpretar.
      expect(codigos).toContain(codigo)
    }
  })

  // QC-74 R9 decia «exactamente un permiso»; QC-86 R26 le suma `asignaciones.consultar` y pasan a
  // ser DOS, y ni uno mas (QC-86 R27). La lista sigue escrita entera a mano: el conjunto exacto es
  // el contrato, no «al menos estos».
  it('R9 (enmendado por QC-86 R26): el Operador tiene exactamente dos permisos: inventario.consultar y asignaciones.consultar', () => {
    expect(SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]).toEqual([
      'inventario.consultar',
      'asignaciones.consultar',
    ])
  })

  it('QC-38 R4: el Administrador tiene unidades.modificar Y unidades.consultar, escritos uno a uno', () => {
    expect(SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]).toContain('unidades.consultar')
    expect(SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]).toContain('unidades.modificar')
  })

  it('QC-38 R4: el Operador no recibe ninguno de unidades (su conjunto exacto lo enmendo QC-86)', () => {
    expect(SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]).toEqual([
      'inventario.consultar',
      'asignaciones.consultar',
    ])
    expect(SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]).not.toContain('unidades.consultar')
    expect(SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]).not.toContain('unidades.modificar')
  })

  it('QC-86 R25: el Administrador tiene asignaciones.consultar Y asignaciones.modificar, escritos uno a uno', () => {
    expect(SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]).toContain('asignaciones.consultar')
    expect(SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]).toContain('asignaciones.modificar')
  })

  it('QC-86 R27: el Operador recibe asignaciones.consultar y NO asignaciones.modificar', () => {
    expect(SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]).toEqual([
      'inventario.consultar',
      'asignaciones.consultar',
    ])
    expect(SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]).not.toContain('asignaciones.modificar')
  })

  it('QC-66 R9: el Administrador tiene usuarios.consultar Y usuarios.modificar, escritos uno a uno', () => {
    expect(SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]).toContain('usuarios.consultar')
    expect(SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]).toContain('usuarios.modificar')
  })

  it('QC-66 R9: el Operador no recibe ninguno de los dos permisos de usuarios', () => {
    expect(SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]).toEqual([
      'inventario.consultar',
      'asignaciones.consultar',
    ])
    expect(SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]).not.toContain('usuarios.consultar')
    expect(SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]).not.toContain('usuarios.modificar')
  })

  it('QC-144 R8: el Empacador tiene exactamente asignaciones.consultar y terminados.consultar', () => {
    expect(SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR]).toEqual([
      'asignaciones.consultar',
      'terminados.consultar',
    ])
  })

  it('QC-144 R8: el Empacador NO recibe inventario.consultar ni asignaciones.modificar', () => {
    expect(SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR]).not.toContain('inventario.consultar')
    expect(SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR]).not.toContain('asignaciones.modificar')
  })

  it('QC-144 R9: el Administrador incluye terminados.consultar y el conjunto completo, uno a uno', () => {
    expect(SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]).toContain('terminados.consultar')
    expect(SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]).toEqual([...CODIGOS_DEL_REQUISITO])
  })

  it('R22: el Administrador incluye clientes.consultar y clientes.modificar, escritos uno a uno', () => {
    expect(SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]).toContain('clientes.consultar')
    expect(SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]).toContain('clientes.modificar')
    expect(SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]).toEqual([...CODIGOS_DEL_REQUISITO])
  })

  it('R22: el Operador y el Empacador conservan exactamente los permisos que tenian, sin clientes.*', () => {
    expect(SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]).toEqual([
      'inventario.consultar',
      'asignaciones.consultar',
    ])
    expect(SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR]).toEqual([
      'asignaciones.consultar',
      'terminados.consultar',
    ])
    expect(SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]).not.toContain('clientes.consultar')
    expect(SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]).not.toContain('clientes.modificar')
    expect(SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR]).not.toContain('clientes.consultar')
    expect(SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR]).not.toContain('clientes.modificar')
  })

  it('QC-144 R10: el Operador sigue con exactamente inventario.consultar y asignaciones.consultar, sin terminados.consultar', () => {
    expect(SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]).toEqual([
      'inventario.consultar',
      'asignaciones.consultar',
    ])
    expect(SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]).not.toContain('terminados.consultar')
  })

  // QC-123 (R15) — el importe del pedido se protege con `pedidos.consultar`, que ya existe:
  // la ficha NO suma ningun permiso. Reutiliza `CODIGOS_DEL_REQUISITO` -el mismo catalogo de
  // arriba, copiado del requisito- en vez de duplicar la verdad en una lista nueva.
  it('el catalogo sigue siendo el del requisito, sin cambios en el Operador (R15, QC-144)', () => {
    expect(codigos).toEqual([...CODIGOS_DEL_REQUISITO])
    expect(SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]).toEqual([
      'inventario.consultar',
      'asignaciones.consultar',
    ])
  })

  it('QC-142 R12: el Administrador incluye documentos.consultar y documentos.modificar, escritos uno a uno', () => {
    expect(SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]).toContain('documentos.consultar')
    expect(SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]).toContain('documentos.modificar')
    expect(SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]).toEqual([...CODIGOS_DEL_REQUISITO])
  })

  it('QC-142 R12: el Operador y el Empacador conservan exactamente los permisos que tenian, sin documentos.*', () => {
    expect(SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]).toEqual([
      'inventario.consultar',
      'asignaciones.consultar',
    ])
    expect(SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR]).toEqual([
      'asignaciones.consultar',
      'terminados.consultar',
    ])
    expect(SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]).not.toContain('documentos.consultar')
    expect(SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]).not.toContain('documentos.modificar')
    expect(SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR]).not.toContain('documentos.consultar')
    expect(SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR]).not.toContain('documentos.modificar')
  })

  it('R6: el seed asigna permisos SOLO a roles, sin ninguna clave de empresa', () => {
    expect(Object.keys(SEED_ROLE_PERMISSIONS).sort()).toEqual(
      [ROLE_ADMINISTRADOR, ROLE_OPERADOR, ROLE_EMPACADOR].sort(),
    )
    for (const asignados of Object.values(SEED_ROLE_PERMISSIONS)) {
      for (const codigo of asignados) {
        expect(typeof codigo).toBe('string')
      }
    }
  })
})
