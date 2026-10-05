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
  ROLE_MAESTRO,
  SEED_ROLE_PERMISSIONS,
  ADMIN_EXCLUDED_PERMISSIONS,
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
  'asignaciones.ejecutar',
  'terminados.consultar',
  'clientes.consultar',
  'clientes.modificar',
  'documentos.consultar',
  'documentos.modificar',
  'empaque.modificar',
  'empresas.consultar',
  'empresas.modificar',
] as const

/** Los dos codigos de la plataforma: solo los recibe el Maestro. */
const CODIGOS_DE_EMPRESAS = ['empresas.consultar', 'empresas.modificar'] as const

const esDeEmpresas = (codigo: string): boolean => codigo.startsWith('empresas.')

/** Lo que en verdad recibe el Administrador: el catalogo del requisito menos los codigos
 *  excluidos (R36), nunca un total escrito a mano. */
const CODIGOS_DEL_ADMINISTRADOR = CODIGOS_DEL_REQUISITO.filter(
  (codigo) => !ADMIN_EXCLUDED_PERMISSIONS.includes(codigo),
)

/** Las entradas previas a esta ficha, copiadas a mano de `origin/dev` con sus tres campos: lo que
 *  QC-142 R2 exige es que ninguna de ellas cambie de modulo, accion ni descripcion al sumar las
 *  dos de `documentos`. */
const PERMISOS_PREVIOS = [
  {
    code: 'dashboard.consultar',
    module: 'dashboard',
    action: 'consultar',
    description: 'Consultar el panel de inicio.',
  },
  {
    code: 'inventario.consultar',
    module: 'inventario',
    action: 'consultar',
    description: 'Consultar productos y presentaciones del inventario.',
  },
  {
    code: 'inventario.modificar',
    module: 'inventario',
    action: 'modificar',
    description: 'Crear, editar y borrar productos y presentaciones del inventario.',
  },
  {
    code: 'recetas.consultar',
    module: 'recetas',
    action: 'consultar',
    description: 'Consultar recetas y sus pasos.',
  },
  {
    code: 'recetas.modificar',
    module: 'recetas',
    action: 'modificar',
    description: 'Crear, editar y borrar recetas y sus pasos.',
  },
  {
    code: 'unidades.consultar',
    module: 'unidades',
    action: 'consultar',
    description: 'Consultar las unidades de medida.',
  },
  {
    code: 'unidades.modificar',
    module: 'unidades',
    action: 'modificar',
    description: 'Crear, editar y borrar unidades de medida.',
  },
  {
    code: 'proveedores.consultar',
    module: 'proveedores',
    action: 'consultar',
    description: 'Consultar proveedores y su catalogo.',
  },
  {
    code: 'proveedores.modificar',
    module: 'proveedores',
    action: 'modificar',
    description: 'Crear, editar y borrar proveedores y lineas de su catalogo.',
  },
  {
    code: 'pedidos.consultar',
    module: 'pedidos',
    action: 'consultar',
    description: 'Consultar pedidos y su contenido.',
  },
  {
    code: 'pedidos.modificar',
    module: 'pedidos',
    action: 'modificar',
    description: 'Crear, editar, anular y borrar pedidos.',
  },
  {
    code: 'usuarios.consultar',
    module: 'usuarios',
    action: 'consultar',
    description: 'Consultar los usuarios de la empresa.',
  },
  {
    code: 'usuarios.modificar',
    module: 'usuarios',
    action: 'modificar',
    description: 'Crear, editar, borrar y cambiar el estado de cuenta de los usuarios de la empresa.',
  },
  {
    code: 'asignaciones.consultar',
    module: 'asignaciones',
    action: 'consultar',
    description: 'Consultar los pedidos asignados.',
  },
  {
    code: 'asignaciones.modificar',
    module: 'asignaciones',
    action: 'modificar',
    description: 'Asignar y desasignar responsables de un pedido.',
  },
  {
    code: 'terminados.consultar',
    module: 'terminados',
    action: 'consultar',
    description: 'Consultar todos los pedidos terminados de la empresa.',
  },
  {
    code: 'clientes.consultar',
    module: 'clientes',
    action: 'consultar',
    description: 'Consultar los clientes de la empresa.',
  },
  {
    code: 'clientes.modificar',
    module: 'clientes',
    action: 'modificar',
    description: 'Crear, editar y borrar clientes de la empresa.',
  },
] as const

/** Los nombres de modulo del repositorio, mas `usuarios`, `terminados` y `empresas`: no son
 *  carpetas reales de `lib/modules/` -viven dentro de `identity`- pero valen igual como `<modulo>`
 *  porque el codigo lo lee una persona. */
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
  'empaque',
  'empresas',
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
  'empresas',
]
const MODULOS_SIN_ESCRITURA = ['dashboard', 'terminados']
/** Modulos que solo escriben, sin consulta propia (R34): quien tiene el permiso ya ve el pedido
 *  por otra via. */
const MODULOS_SOLO_ESCRITURA = ['empaque']

const codigos = PERMISSIONS.map((permiso) => permiso.code)

/** Toda accion es `consultar` o `modificar`, salvo `ejecutar`, que solo se admite en `asignaciones`. */
function accionAdmitida(permiso: { module: string; action: string }): boolean {
  if (permiso.action === 'consultar' || permiso.action === 'modificar') return true
  return permiso.action === 'ejecutar' && permiso.module === 'asignaciones'
}

/** El Operador, escrito a mano: el conjunto exacto es el contrato, no «al menos estos». */
const PERMISOS_DEL_OPERADOR = [
  'inventario.consultar',
  'asignaciones.consultar',
  'asignaciones.ejecutar',
] as const

/** Las acciones de cada modulo con escritura; `asignaciones` es el unico que suma `ejecutar`. */
const accionesEsperadasConEscritura = (modulo: string): string[] =>
  modulo === 'asignaciones' ? ['consultar', 'ejecutar', 'modificar'] : ['consultar', 'modificar']

describe('QC-74 — el catalogo de permisos (R1, R2, R3, R4, R6)', () => {
  it('R1: cada codigo es `<modulo>.<accion>` en español y en minusculas', () => {
    for (const permiso of PERMISSIONS) {
      expect(permiso.code).toBe(`${permiso.module}.${permiso.action}`)
      expect(permiso.code).toMatch(/^[a-z]+\.[a-z]+$/)
      expect(accionAdmitida(permiso), permiso.code).toBe(true)
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
      (codigo) =>
        codigo !== 'documentos.consultar' &&
        codigo !== 'documentos.modificar' &&
        codigo !== 'empaque.modificar' &&
        !esDeEmpresas(codigo),
    )

    expect(codigos).toEqual([
      ...catalogoPrevio,
      'documentos.consultar',
      'documentos.modificar',
      'empaque.modificar',
      ...CODIGOS_DE_EMPRESAS,
    ])
    expect(codigos.filter((codigo) => codigo.startsWith('documentos.'))).toEqual([
      'documentos.consultar',
      'documentos.modificar',
    ])
  })

  it('QC-142 R2: las entradas previas conservan su modulo, accion y descripcion exactos', () => {
    for (const previo of PERMISOS_PREVIOS) {
      const actual = PERMISSIONS.find((permiso) => permiso.code === previo.code)
      expect(actual, `${previo.code} deberia seguir en el catalogo`).toEqual(previo)
    }
  })

  it('R2: cada entrada trae descripcion no vacia', () => {
    for (const permiso of PERMISSIONS) {
      expect(permiso.description.trim().length).toBeGreaterThan(0)
    }
  })

  it('R3: cada modulo con escritura declara consultar Y modificar (y asignaciones, ademas, ejecutar)', () => {
    for (const modulo of MODULOS_CON_ESCRITURA) {
      const acciones = PERMISSIONS.filter((p) => p.module === modulo).map((p) => p.action)

      expect([...acciones].sort(), modulo).toEqual(accionesEsperadasConEscritura(modulo))
    }
  })

  it('R4: `dashboard` declara UNICAMENTE consultar', () => {
    for (const modulo of MODULOS_SIN_ESCRITURA) {
      const acciones = PERMISSIONS.filter((p) => p.module === modulo).map((p) => p.action)

      expect(acciones).toEqual(['consultar'])
    }
  })

  it('R34: `empaque` declara UNICAMENTE modificar, sin consultar', () => {
    for (const modulo of MODULOS_SOLO_ESCRITURA) {
      const acciones = PERMISSIONS.filter((p) => p.module === modulo).map((p) => p.action)

      expect(acciones).toEqual(['modificar'])
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
        codigo !== 'documentos.modificar' &&
        codigo !== 'empaque.modificar' &&
        !esDeEmpresas(codigo),
    )

    expect(codigos).toEqual([
      ...catalogoPrevio,
      'clientes.consultar',
      'clientes.modificar',
      'documentos.consultar',
      'documentos.modificar',
      'empaque.modificar',
      ...CODIGOS_DE_EMPRESAS,
    ])
  })

  it('QC-144 R5: el catalogo es el previo mas terminados.consultar en su posicion, ningun otro codigo cambia', () => {
    const indiceDeTerminados = CODIGOS_DEL_REQUISITO.indexOf('terminados.consultar')
    const catalogoPrevio = CODIGOS_DEL_REQUISITO.slice(0, indiceDeTerminados)
    const posteriores = CODIGOS_DEL_REQUISITO.slice(indiceDeTerminados + 1)

    expect(codigos).toEqual([...catalogoPrevio, 'terminados.consultar', ...posteriores])
  })

  it('R34: el catalogo contiene empaque.modificar con su modulo, accion y descripcion exactos', () => {
    expect(PERMISSIONS).toContainEqual({
      code: 'empaque.modificar',
      module: 'empaque',
      action: 'modificar',
      description: 'Comenzar y terminar el empaque de los pedidos de la empresa.',
    })
  })

  it('R35: el catalogo es el previo mas empaque.modificar en su posicion, con solo los empresas.* detras, ningun otro codigo cambia', () => {
    const catalogoPrevio = CODIGOS_DEL_REQUISITO.filter(
      (codigo) => codigo !== 'empaque.modificar' && !esDeEmpresas(codigo),
    )

    expect(codigos).toEqual([...catalogoPrevio, 'empaque.modificar', ...CODIGOS_DE_EMPRESAS])
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

  it('R34: la enmienda de empaque.modificar en el fuente no cita ficha ni requisito', () => {
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
    const parrafoDeLaEnmienda = parrafos.find((parrafo) => parrafo.includes('empaque.modificar'))

    expect(parrafoDeLaEnmienda).toBeDefined()
    const lineas = parrafoDeLaEnmienda!.split('\n')
    expect(lineas.length).toBeLessThanOrEqual(5)
    expect(parrafoDeLaEnmienda).toContain('empaque.modificar')
    expect(parrafoDeLaEnmienda).not.toMatch(citaFichaORequisito)
  })

  it('R6: el detector de citas caza un JSDoc sintetico que si nombra una ficha', () => {
    const citaFichaORequisito = /QC-\d+|\bR\d+\b|design\.md|decisi[oó]n cerrada/i
    const parrafoSintetico =
      ' * Cuarta enmienda al catalogo cerrado (QC-144): suma terminados.consultar en lib/modules/.'

    expect(parrafoSintetico).toMatch(citaFichaORequisito)
  })
})

describe('QC-74 — los permisos sembrados por rol (R8, R9, R6)', () => {
  it('R8 (enmendado por R36): el Administrador tiene el catalogo menos los codigos excluidos, escrito uno a uno', () => {
    expect(SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]).toEqual([...CODIGOS_DEL_ADMINISTRADOR])
  })

  it('R36: el Administrador NO recibe empaque.modificar', () => {
    expect(SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]).not.toContain('empaque.modificar')
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

  it('R9 (enmendado por QC-86 R26 y QC-201 R3): el Operador tiene exactamente inventario.consultar, asignaciones.consultar y asignaciones.ejecutar', () => {
    expect(SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]).toEqual([...PERMISOS_DEL_OPERADOR])
  })

  it('QC-38 R4: el Administrador tiene unidades.modificar Y unidades.consultar, escritos uno a uno', () => {
    expect(SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]).toContain('unidades.consultar')
    expect(SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]).toContain('unidades.modificar')
  })

  it('QC-38 R4: el Operador no recibe ninguno de unidades (su conjunto exacto lo enmendo QC-86)', () => {
    expect(SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]).toEqual([...PERMISOS_DEL_OPERADOR])
    expect(SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]).not.toContain('unidades.consultar')
    expect(SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]).not.toContain('unidades.modificar')
  })

  it('QC-86 R25: el Administrador tiene asignaciones.consultar Y asignaciones.modificar, escritos uno a uno', () => {
    expect(SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]).toContain('asignaciones.consultar')
    expect(SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]).toContain('asignaciones.modificar')
  })

  it('QC-86 R27: el Operador recibe asignaciones.consultar y NO asignaciones.modificar', () => {
    expect(SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]).toEqual([...PERMISOS_DEL_OPERADOR])
    expect(SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]).not.toContain('asignaciones.modificar')
  })

  it('QC-66 R9: el Administrador tiene usuarios.consultar Y usuarios.modificar, escritos uno a uno', () => {
    expect(SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]).toContain('usuarios.consultar')
    expect(SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]).toContain('usuarios.modificar')
  })

  it('QC-66 R9: el Operador no recibe ninguno de los dos permisos de usuarios', () => {
    expect(SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]).toEqual([...PERMISOS_DEL_OPERADOR])
    expect(SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]).not.toContain('usuarios.consultar')
    expect(SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]).not.toContain('usuarios.modificar')
  })

  it('R36 (enmendado desde QC-144 R8): el Empacador tiene exactamente asignaciones.consultar, terminados.consultar y empaque.modificar', () => {
    expect(SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR]).toEqual([
      'asignaciones.consultar',
      'terminados.consultar',
      'empaque.modificar',
    ])
  })

  it('QC-144 R8: el Empacador NO recibe inventario.consultar ni asignaciones.modificar', () => {
    expect(SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR]).not.toContain('inventario.consultar')
    expect(SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR]).not.toContain('asignaciones.modificar')
  })

  it('R36: el Operador no cambia y no recibe empaque.modificar', () => {
    expect(SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]).toEqual([...PERMISOS_DEL_OPERADOR])
    expect(SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]).not.toContain('empaque.modificar')
  })

  it('QC-144 R9 (enmendado por R36): el Administrador incluye terminados.consultar y el catalogo menos los excluidos, uno a uno', () => {
    expect(SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]).toContain('terminados.consultar')
    expect(SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]).toEqual([...CODIGOS_DEL_ADMINISTRADOR])
  })

  it('R22 (enmendado por R36): el Administrador incluye clientes.consultar y clientes.modificar, escritos uno a uno', () => {
    expect(SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]).toContain('clientes.consultar')
    expect(SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]).toContain('clientes.modificar')
    expect(SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]).toEqual([...CODIGOS_DEL_ADMINISTRADOR])
  })

  it('R22: el Operador y el Empacador conservan exactamente los permisos que tenian, sin clientes.*', () => {
    expect(SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]).toEqual([...PERMISOS_DEL_OPERADOR])
    expect(SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR]).toEqual([
      'asignaciones.consultar',
      'terminados.consultar',
      'empaque.modificar',
    ])
    expect(SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]).not.toContain('clientes.consultar')
    expect(SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]).not.toContain('clientes.modificar')
    expect(SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR]).not.toContain('clientes.consultar')
    expect(SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR]).not.toContain('clientes.modificar')
  })

  it('QC-144 R10 (enmendado por QC-201 R3): el Operador sigue con exactamente sus permisos, sin terminados.consultar', () => {
    expect(SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]).toEqual([...PERMISOS_DEL_OPERADOR])
    expect(SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]).not.toContain('terminados.consultar')
  })

  // QC-123 (R15) — el importe del pedido se protege con `pedidos.consultar`, que ya existe:
  // la ficha NO suma ningun permiso. Reutiliza `CODIGOS_DEL_REQUISITO` -el mismo catalogo de
  // arriba, copiado del requisito- en vez de duplicar la verdad en una lista nueva.
  it('el catalogo sigue siendo el del requisito, sin cambios en el Operador (R15, QC-144)', () => {
    expect(codigos).toEqual([...CODIGOS_DEL_REQUISITO])
    expect(SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]).toEqual([...PERMISOS_DEL_OPERADOR])
  })

  it('QC-142 R12 (enmendado por R36): el Administrador incluye documentos.consultar y documentos.modificar, escritos uno a uno', () => {
    expect(SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]).toContain('documentos.consultar')
    expect(SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]).toContain('documentos.modificar')
    expect(SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]).toEqual([...CODIGOS_DEL_ADMINISTRADOR])
  })

  it('QC-142 R12: el Operador y el Empacador conservan exactamente los permisos que tenian, sin documentos.*', () => {
    expect(SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]).toEqual([...PERMISOS_DEL_OPERADOR])
    expect(SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR]).toEqual([
      'asignaciones.consultar',
      'terminados.consultar',
      'empaque.modificar',
    ])
    expect(SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]).not.toContain('documentos.consultar')
    expect(SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]).not.toContain('documentos.modificar')
    expect(SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR]).not.toContain('documentos.consultar')
    expect(SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR]).not.toContain('documentos.modificar')
  })

  it('R6: el seed asigna permisos SOLO a roles, sin ninguna clave de empresa', () => {
    expect(Object.keys(SEED_ROLE_PERMISSIONS).sort()).toEqual(
      [ROLE_ADMINISTRADOR, ROLE_OPERADOR, ROLE_EMPACADOR, ROLE_MAESTRO].sort(),
    )
    for (const asignados of Object.values(SEED_ROLE_PERMISSIONS)) {
      for (const codigo of asignados) {
        expect(typeof codigo).toBe('string')
      }
    }
  })
})

describe('QC-161 — los permisos de empresas y el Maestro (R5-R9)', () => {
  const citaFichaORequisito = /QC-\d+|\bR\d+\b|design\.md|decisi[oó]n cerrada/i
  const ORDINALES = [
    'primera',
    'segunda',
    'tercera',
    'cuarta',
    'quinta',
    'sexta',
    'septima',
    'octava',
    'novena',
    'decima',
  ]

  /** El parrafo del JSDoc de `PERMISSIONS` que cumple lo que se pide a la enmienda de empresas. */
  function esLaEnmiendaDeEmpresas(parrafo: string): boolean {
    const ordinal = parrafo.match(/\*\*(\S+) enmienda al catalogo cerrado\*\*/i)?.[1]?.toLowerCase()
    return (
      parrafo.split('\n').length <= 5 &&
      ordinal !== undefined &&
      ORDINALES.includes(ordinal) &&
      CODIGOS_DE_EMPRESAS.every((codigo) => parrafo.includes(codigo)) &&
      parrafo.includes('lib/modules/') &&
      !citaFichaORequisito.test(parrafo)
    )
  }

  function parrafosDelCatalogo(): string[] {
    const raiz = join(__dirname, '..', '..', '..')
    const fuente = readFileSync(
      join(raiz, 'lib', 'modules', 'identity', 'domain', 'permissions.ts'),
      'utf8',
    ).replace(/\r\n/g, '\n')
    const jsdoc = fuente.match(/\/\*\*([\s\S]*?)\*\/\s*export const PERMISSIONS/)?.[1] ?? ''
    return jsdoc
      .split(/\n\s*\*\s*\n/)
      .map((bloque) => bloque.trim())
      .filter(Boolean)
  }

  it('R5: el catalogo contiene empresas.consultar y empresas.modificar y ningun otro empresas.*', () => {
    for (const codigo of CODIGOS_DE_EMPRESAS) {
      expect(codigos).toContain(codigo)
    }
    expect(codigos.filter(esDeEmpresas)).toEqual([...CODIGOS_DE_EMPRESAS])
  })

  it('R5: todo codigo que el catalogo tenia antes sigue en el, en el mismo orden', () => {
    const previos = CODIGOS_DEL_REQUISITO.filter((codigo) => !esDeEmpresas(codigo))

    expect(codigos.filter((codigo) => !esDeEmpresas(codigo))).toEqual(previos)
    for (const previo of PERMISOS_PREVIOS) {
      expect(PERMISSIONS.find((permiso) => permiso.code === previo.code)).toEqual(previo)
    }
  })

  it('R6: los dos codigos tienen modulo empresas, su accion y descripcion no vacia', () => {
    const consultar = PERMISSIONS.find((permiso) => permiso.code === 'empresas.consultar')
    const modificar = PERMISSIONS.find((permiso) => permiso.code === 'empresas.modificar')

    expect(consultar?.module).toBe('empresas')
    expect(consultar?.action).toBe('consultar')
    expect(consultar?.description.trim().length).toBeGreaterThan(0)
    expect(modificar?.module).toBe('empresas')
    expect(modificar?.action).toBe('modificar')
    expect(modificar?.description.trim().length).toBeGreaterThan(0)
  })

  it('R6: la descripcion de empresas.modificar nombra el alta, la edicion y la baja', () => {
    const descripcion =
      PERMISSIONS.find((permiso) => permiso.code === 'empresas.modificar')?.description ?? ''

    expect(descripcion).toMatch(/\balta\b/i)
    expect(descripcion).toMatch(/\bedit/i)
    expect(descripcion).toMatch(/\bbaja\b/i)
  })

  it('R7: el JSDoc del catalogo tiene el parrafo de la enmienda de empresas, con ordinal y sin citas', () => {
    const parrafos = parrafosDelCatalogo()
    const enmienda = parrafos.find((parrafo) => parrafo.includes('empresas.consultar'))

    expect(enmienda).toBeDefined()
    expect(esLaEnmiendaDeEmpresas(enmienda!)).toBe(true)
    expect(enmienda).toMatch(/enmienda/i)
    expect(enmienda).toContain('lib/modules/')
    expect(enmienda).not.toMatch(citaFichaORequisito)
    const primeraFrase = (parrafos[0] ?? '').split('.')[0] ?? ''
    expect(primeraFrase).not.toMatch(citaFichaORequisito)
  })

  it('R7: el caso simetrico: el detector rechaza parrafos sinteticos que citan, no tienen ordinal o pasan de cinco lineas', () => {
    const bueno =
      '* **Novena enmienda al catalogo cerrado**: suma `empresas.consultar` y `empresas.modificar`;\n' +
      '* su modulo no es una carpeta de `lib/modules/`.'
    expect(esLaEnmiendaDeEmpresas(bueno)).toBe(true)

    expect(esLaEnmiendaDeEmpresas(`${bueno} Ver QC-161.`)).toBe(false)
    expect(esLaEnmiendaDeEmpresas(`${bueno} Lo pide R7.`)).toBe(false)
    expect(esLaEnmiendaDeEmpresas(`${bueno} Ver design.md.`)).toBe(false)
    expect(esLaEnmiendaDeEmpresas(bueno.replace('**Novena enmienda', '**Otra enmienda'))).toBe(false)
    expect(esLaEnmiendaDeEmpresas(bueno.replace('`lib/modules/`', 'una carpeta'))).toBe(false)
    expect(esLaEnmiendaDeEmpresas(bueno.replace('`empresas.modificar`', 'otro'))).toBe(false)
    expect(esLaEnmiendaDeEmpresas(`${bueno}\n* a\n* b\n* c\n* d`)).toBe(false)
  })

  it('R8: el Maestro recibe exactamente empresas.consultar y empresas.modificar, escritos uno a uno', () => {
    expect(SEED_ROLE_PERMISSIONS[ROLE_MAESTRO]).toEqual(['empresas.consultar', 'empresas.modificar'])
  })

  it('R9: el Administrador no tiene ningun empresas.* y sigue siendo el catalogo menos los excluidos', () => {
    expect((SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR] ?? []).filter(esDeEmpresas)).toEqual([])
    expect(ADMIN_EXCLUDED_PERMISSIONS).toEqual(expect.arrayContaining([...CODIGOS_DE_EMPRESAS]))
    expect(SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]).toEqual(
      CODIGOS_DEL_REQUISITO.filter((codigo) => !esDeEmpresas(codigo) && codigo !== 'empaque.modificar'),
    )
  })

  it('R9: Operador y Empacador conservan exactamente sus permisos y ninguno tiene empresas.*', () => {
    expect(SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]).toEqual([...PERMISOS_DEL_OPERADOR])
    expect(SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR]).toEqual([
      'asignaciones.consultar',
      'terminados.consultar',
      'empaque.modificar',
    ])
    for (const rol of [ROLE_ADMINISTRADOR, ROLE_OPERADOR, ROLE_EMPACADOR]) {
      expect((SEED_ROLE_PERMISSIONS[rol] ?? []).filter(esDeEmpresas), rol).toEqual([])
    }
  })
})

describe('QC-201 — el permiso asignaciones.ejecutar (R1, R2, R3, R4, R14)', () => {
  const EJECUTAR = {
    code: 'asignaciones.ejecutar',
    module: 'asignaciones',
    action: 'ejecutar',
    description: 'Entrar, comenzar y terminar la ejecución de los pedidos asignados.',
  } as const

  /** Las entradas posteriores a `PERMISOS_PREVIOS`, copiadas a mano con sus tres campos. */
  const PERMISOS_POSTERIORES = [
    {
      code: 'documentos.consultar',
      module: 'documentos',
      action: 'consultar',
      description: 'Consultar los documentos de la empresa y el estado de su procesamiento.',
    },
    {
      code: 'documentos.modificar',
      module: 'documentos',
      action: 'modificar',
      description: 'Subir documentos PDF y encolar su procesamiento.',
    },
    {
      code: 'empaque.modificar',
      module: 'empaque',
      action: 'modificar',
      description: 'Comenzar y terminar el empaque de los pedidos de la empresa.',
    },
    {
      code: 'empresas.consultar',
      module: 'empresas',
      action: 'consultar',
      description: 'Consultar las empresas de la plataforma.',
    },
    {
      code: 'empresas.modificar',
      module: 'empresas',
      action: 'modificar',
      description: 'Dar de alta, editar y dar de baja empresas de la plataforma.',
    },
  ] as const

  it('R1: el catalogo contiene asignaciones.ejecutar con su modulo, accion y descripcion exactos, una sola vez', () => {
    expect(PERMISSIONS).toContainEqual(EJECUTAR)
    expect(codigos.indexOf('asignaciones.ejecutar')).toBe(codigos.lastIndexOf('asignaciones.ejecutar'))
  })

  it('R1: el catalogo es el previo mas asignaciones.ejecutar justo detras de asignaciones.modificar', () => {
    const sinEjecutar = codigos.filter((codigo) => codigo !== 'asignaciones.ejecutar')
    const indice = sinEjecutar.indexOf('asignaciones.modificar')

    expect(sinEjecutar).toEqual([...PERMISOS_PREVIOS, ...PERMISOS_POSTERIORES].map((p) => p.code))
    expect(codigos).toEqual([
      ...sinEjecutar.slice(0, indice + 1),
      'asignaciones.ejecutar',
      ...sinEjecutar.slice(indice + 1),
    ])
  })

  it('R1: todas las entradas previas conservan su modulo, accion y descripcion exactos', () => {
    const previas = PERMISSIONS.filter((permiso) => permiso.code !== 'asignaciones.ejecutar')

    expect(previas).toEqual([...PERMISOS_PREVIOS, ...PERMISOS_POSTERIORES])
  })

  it('R2: ejecutar solo existe en asignaciones; el resto de modulos declara unicamente consultar y/o modificar', () => {
    expect(PERMISSIONS.filter((p) => p.action === 'ejecutar').map((p) => p.module)).toEqual([
      'asignaciones',
    ])
    for (const permiso of PERMISSIONS.filter((p) => p.module !== 'asignaciones')) {
      expect(['consultar', 'modificar'], permiso.code).toContain(permiso.action)
    }
  })

  it('R2: la regla de acciones rechaza ejecutar en cualquier otro modulo y cualquier otra accion', () => {
    expect(accionAdmitida({ module: 'asignaciones', action: 'ejecutar' })).toBe(true)
    expect(accionAdmitida({ module: 'pedidos', action: 'ejecutar' })).toBe(false)
    expect(accionAdmitida({ module: 'empaque', action: 'ejecutar' })).toBe(false)
    expect(accionAdmitida({ module: 'asignaciones', action: 'borrar' })).toBe(false)
    expect(accionesEsperadasConEscritura('pedidos')).toEqual(['consultar', 'modificar'])
  })

  it('R2: el JSDoc del catalogo explica la accion ejecutar sin citar ficha ni requisito', () => {
    const raiz = join(__dirname, '..', '..', '..')
    const fuente = readFileSync(
      join(raiz, 'lib', 'modules', 'identity', 'domain', 'permissions.ts'),
      'utf8',
    ).replace(/\r\n/g, '\n')
    const jsdoc = fuente.match(/\/\*\*([\s\S]*?)\*\/\s*export const PERMISSIONS/)?.[1] ?? ''
    const parrafo = jsdoc
      .split(/\n\s*\*\s*\n/)
      .find((bloque) => bloque.includes('asignaciones.ejecutar'))

    expect(parrafo).toBeDefined()
    expect(parrafo!.split('\n').length).toBeLessThanOrEqual(5)
    expect(parrafo).not.toMatch(/QC-\d+|\bR\d+\b|design\.md|decisi[oó]n cerrada/i)
  })

  it('R3: el Administrador recibe asignaciones.ejecutar justo tras asignaciones.modificar y el resto no cambia', () => {
    const admin = SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR] ?? []
    const sinEjecutar = admin.filter((codigo) => codigo !== 'asignaciones.ejecutar')

    expect(admin).toEqual([...CODIGOS_DEL_ADMINISTRADOR])
    expect(admin.indexOf('asignaciones.ejecutar')).toBe(admin.indexOf('asignaciones.modificar') + 1)
    expect(sinEjecutar).toEqual([
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
    ])
  })

  it('R3: el Operador recibe asignaciones.ejecutar y conserva exactamente lo que tenia', () => {
    const operador = SEED_ROLE_PERMISSIONS[ROLE_OPERADOR] ?? []

    expect(operador).toEqual(['inventario.consultar', 'asignaciones.consultar', 'asignaciones.ejecutar'])
    expect(operador.filter((codigo) => codigo !== 'asignaciones.ejecutar')).toEqual([
      'inventario.consultar',
      'asignaciones.consultar',
    ])
  })

  it('R4: ni el Empacador ni el Maestro reciben asignaciones.ejecutar y el Empacador sigue igual', () => {
    expect(SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR]).toEqual([
      'asignaciones.consultar',
      'terminados.consultar',
      'empaque.modificar',
    ])
    expect(SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR]).not.toContain('asignaciones.ejecutar')
    expect(SEED_ROLE_PERMISSIONS[ROLE_MAESTRO]).toEqual(['empresas.consultar', 'empresas.modificar'])
    expect(SEED_ROLE_PERMISSIONS[ROLE_MAESTRO]).not.toContain('asignaciones.ejecutar')
  })

  it('R14: asignaciones.ejecutar no entra en ADMIN_EXCLUDED_PERMISSIONS, que no cambia', () => {
    expect(ADMIN_EXCLUDED_PERMISSIONS).not.toContain('asignaciones.ejecutar')
    expect(ADMIN_EXCLUDED_PERMISSIONS).toEqual([
      'empaque.modificar',
      'empresas.consultar',
      'empresas.modificar',
    ])
  })
})
