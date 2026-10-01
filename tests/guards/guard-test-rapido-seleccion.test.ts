// Guardia: `pnpm run test:rapido` selecciona por IMPORT DIRECTO y por carpeta de modulo, no
// por el grafo de imports entero.
//
// Existe por un incidente del 2026-10-01: con `vitest related`, el rapido de una rama
// seleccionaba 539 archivos y 7.755 tests, tardaba mas de 10 minutos —la mayor parte
// importando modulos, no corriendo tests— y se corto dos veces por memoria. Un gate de
// cerrar tanda que no termina no es un gate. Detalle en `docs/verification.md > La seleccion
// del rapido: import directo, no el grafo entero`.
//
// Se prueba la funcion pura con un arbol en memoria. El caso de los dos saltos es el que la
// hace valer: sin el, esto pasaria igual con una seleccion que volviera a seguir el grafo
// entero (`docs/verification.md > Probar que muerde, no que pasa`).

import { describe, expect, it } from 'vitest'

import { seleccionarTests } from '../../scripts/test-rapido-seleccion.mjs'

function seleccionar(cambiados: string[], fuentes: Record<string, string>): string[] {
  return seleccionarTests({
    cambiados,
    tests: Object.keys(fuentes),
    leer: (ruta: string) => fuentes[ruta] ?? '',
  })
}

describe('seleccion de test:rapido', () => {
  it('entra un test que importa el archivo cambiado con `@/`', () => {
    const elegidos = seleccionar(['lib/shared/fechas.ts'], {
      'tests/unit/shared/fechas.test.ts': "import { hoy } from '@/lib/shared/fechas'\n",
      'tests/unit/shared/otra.test.ts': "import { x } from '@/lib/shared/otra'\n",
    })
    expect(elegidos).toEqual(['tests/unit/shared/fechas.test.ts'])
  })

  it('entra un test que importa el archivo cambiado con ruta relativa', () => {
    const elegidos = seleccionar(['scripts/validate-features.mjs'], {
      'tests/guards/guard-validador.test.ts':
        "import { validar } from '../../scripts/validate-features.mjs'\n",
      'tests/guards/guard-otra.test.ts': "import { y } from '../../scripts/otro.mjs'\n",
    })
    expect(elegidos).toEqual(['tests/guards/guard-validador.test.ts'])
  })

  it('entra un test que solo menciona el archivo cambiado en `vi.mock`', () => {
    const elegidos = seleccionar(['lib/shared/correo.ts'], {
      'tests/unit/shared/envio.test.ts': "vi.mock('@/lib/shared/correo', () => ({}))\n",
    })
    expect(elegidos).toEqual(['tests/unit/shared/envio.test.ts'])
  })

  it('NO entra un test que llega al archivo cambiado a dos saltos de import', () => {
    // `lib/shared/intermedio.ts` importa `lib/shared/base.ts`; el test solo importa el
    // intermedio. La seleccion no sigue esa cadena.
    const elegidos = seleccionar(['lib/shared/base.ts'], {
      'tests/unit/shared/intermedio.test.ts': "import { f } from '@/lib/shared/intermedio'\n",
    })
    expect(elegidos).toEqual([])
  })

  it('tocar un modulo mete los tests de su carpeta unit e integration, y no los de otro', () => {
    const elegidos = seleccionar(['lib/modules/recetas/x.ts'], {
      'tests/unit/recetas/a.test.ts': "import { a } from '@/lib/modules/recetas/otra-cosa'\n",
      'tests/integration/recetas/b.int.test.ts': "import { b } from '@/lib/composition'\n",
      'tests/unit/pedidos/c.test.ts': "import { c } from '@/lib/modules/pedidos'\n",
    })
    expect(elegidos).toEqual([
      'tests/integration/recetas/b.int.test.ts',
      'tests/unit/recetas/a.test.ts',
    ])
  })

  it('un test que esta en el diff entra siempre', () => {
    const elegidos = seleccionar(['tests/unit/shared/nuevo.test.ts'], {
      'tests/unit/shared/nuevo.test.ts': "import { describe } from 'vitest'\n",
    })
    expect(elegidos).toEqual(['tests/unit/shared/nuevo.test.ts'])
  })

  it('un import del contrato de un modulo entra si cambia su `index.ts`', () => {
    const elegidos = seleccionar(['lib/modules/recetas/index.ts'], {
      'tests/unit/pedidos/usa-recetas.test.ts': "import { r } from '@/lib/modules/recetas'\n",
    })
    expect(elegidos).toContain('tests/unit/pedidos/usa-recetas.test.ts')
  })
})
