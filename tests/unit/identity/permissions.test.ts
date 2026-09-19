// QC-74 T1 — el catalogo de permisos es el UNICO dueño de los codigos (R1-R4) y `SEED_ROLE_PERMISSIONS`
// el UNICO dueño de lo que tiene cada rol (R8, R9). Este test lee ambos por el barrel, que es como los
// consume el resto del repo, y comprueba tambien lo que NO debe estar ahi (R6).

import { describe, expect, it } from 'vitest'

import {
  PERMISSIONS,
  ROLE_ADMINISTRADOR,
  ROLE_OPERADOR,
  SEED_ROLE_PERMISSIONS,
} from '@/lib/modules/identity'

/** Los quince codigos, copiados a mano DESDE EL REQUISITO R2 -no derivados del catalogo-: si el
 *  catalogo cambia, este test tiene que cambiar tambien, que es justamente lo que se quiere.
 *  Eran diez en QC-74; QC-38 sumo `unidades.modificar` al darle escritura a `unidades`,
 *  enmendando QC-74 R2; QC-66 sumo los dos de `usuarios` (su R8), enmendando QC-74 R1; QC-86 suma
 *  los dos de `asignaciones` (su R25), volviendo a enmendar QC-74 R2: once, trece y ahora quince
 *  (ver `lib/modules/identity/domain/permissions.ts`). */
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
] as const

/** Los nombres de modulo del repositorio (R1), mas `usuarios`. `usuarios` NO es una carpeta de
 *  `lib/modules/` -los usuarios viven dentro de `identity`- y vale igual como `<modulo>` porque el
 *  codigo lo lee una persona: es la SEGUNDA enmienda a QC-74 R1, la de la decision cerrada 2 de
 *  QC-66 (su R12), escrita en `lib/modules/identity/domain/permissions.ts`. `asignaciones`, que
 *  entra con QC-86, NO necesita esa enmienda: SI es una carpeta real de `lib/modules/`, asi que
 *  cumple QC-74 R1 al pie de la letra. */
const MODULOS = [
  'inventario',
  'recetas',
  'unidades',
  'proveedores',
  'pedidos',
  'dashboard',
  'usuarios',
  'asignaciones',
]

/** Modulos con casos de uso de escritura (R3) y sin ellos (R4). `unidades` paso a tener
 *  escritura con QC-38, asi que ya no esta entre los que solo consultan; `usuarios` nace con
 *  escritura en QC-66 -alta, edicion, borrado y estado de cuenta, todos bajo `usuarios.modificar`-,
 *  y entra aqui por la misma enmienda de la decision 2. `asignaciones` nace con escritura en QC-86
 *  -asignar y desasignar responsables, las dos bajo `asignaciones.modificar`-. */
const MODULOS_CON_ESCRITURA = [
  'inventario',
  'recetas',
  'proveedores',
  'pedidos',
  'unidades',
  'usuarios',
  'asignaciones',
]
const MODULOS_SIN_ESCRITURA = ['dashboard']

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

  it('R2: contiene exactamente los quince codigos del requisito, ni uno mas ni uno menos', () => {
    expect(codigos).toEqual([...CODIGOS_DEL_REQUISITO])
    expect(new Set(codigos).size).toBe(15)
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
})

describe('QC-74 — los permisos sembrados por rol (R8, R9, R6)', () => {
  it('R8: el Administrador tiene los quince permisos, escritos uno a uno', () => {
    expect(SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]).toEqual([...CODIGOS_DEL_REQUISITO])
  })

  it('R8: no hay comodin ni regla implicita en el conjunto del Administrador', () => {
    // La decision 2 del humano (2026-09-07) prohibe el comodin: los quince van escritos uno a uno.
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

  // QC-123 (R15) — el importe del pedido se protege con `pedidos.consultar`, que ya existe:
  // la ficha NO suma ningun permiso. Reutiliza `CODIGOS_DEL_REQUISITO` -el mismo catalogo de
  // arriba, copiado del requisito- en vez de duplicar la verdad en una lista nueva.
  it('el catalogo sigue teniendo quince permisos (R15)', () => {
    expect(codigos).toEqual([...CODIGOS_DEL_REQUISITO])
    expect(codigos).toHaveLength(15)
    expect(SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]).toEqual([
      'inventario.consultar',
      'asignaciones.consultar',
    ])
  })

  it('R6: el seed asigna permisos SOLO a roles, sin ninguna clave de empresa', () => {
    expect(Object.keys(SEED_ROLE_PERMISSIONS).sort()).toEqual(
      [ROLE_ADMINISTRADOR, ROLE_OPERADOR].sort(),
    )
    for (const asignados of Object.values(SEED_ROLE_PERMISSIONS)) {
      for (const codigo of asignados) {
        expect(typeof codigo).toBe('string')
      }
    }
  })
})
