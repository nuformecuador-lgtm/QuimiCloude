// QC-57 T3 — Guardia: el contrato de lista es UNO aunque el archivo sea seis (R31, R32).
//
// `lib/modules/<m>/domain/list-query.ts` esta duplicado a proposito en los seis modulos con
// listado: el dominio no puede importar `lib/shared/**` (decision cerrada 13,
// `docs/architecture.md > La regla de dependencias`), asi que se comparte la FORMA y no el
// archivo. **Seis copias sin esta guardia no son un contrato, son seis contratos parecidos**
// (`design.md > 2.1`, riesgo 3).
//
// Tres bloques, y ninguno sobra:
//   1. **Equivalencia de comportamiento** (R32): la misma bateria canonica contra los seis
//      esquemas, exigiendo el mismo veredicto y la MISMA salida saneada. Cada caso se compara
//      contra un esperado ESCRITO -no solo contra el primer modulo-: seis copias igual de mal
//      seguirian de acuerdo entre si.
//   2. **Equivalencia de texto**: los seis fuentes son identicos salvo el nombre del modulo en
//      la cabecera. Coge la divergencia que todavia no ha llegado a cambiar el comportamiento
//      -un comentario borrado, un tope movido en una rama sin probar-.
//   3. **Pureza del dominio** (R31): ninguno importa `lib/shared`, `@prisma/client`, `next/` ni
//      `components/`. Se lee el FUENTE, como el resto de `tests/guards/`.
//
// Los bloques 2 y 3 se ejercitan ademas contra fuentes SINTETICOS que los violan: un
// `expect(hallazgos).toEqual([])` sobre el repo real, solo, no demuestra que la regla dispare.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { ListQuery, ListQueryable } from '@/lib/modules/inventario/domain/list-query';
import * as identity from '@/lib/modules/identity/domain/list-query';
import * as inventario from '@/lib/modules/inventario/domain/list-query';
import * as pedidos from '@/lib/modules/pedidos/domain/list-query';
import * as proveedores from '@/lib/modules/proveedores/domain/list-query';
import * as recetas from '@/lib/modules/recetas/domain/list-query';
import * as unidades from '@/lib/modules/unidades/domain/list-query';

/** Sube desde este archivo hasta la raiz del repo (la carpeta con `package.json`). */
function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (;;) {
    try {
      readFileSync(join(dir, 'package.json'));
      return dir;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) throw new Error(`no se encontro package.json subiendo desde ${startDir}`);
      dir = parent;
    }
  }
}

const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)));

/**
 * Los SEIS modulos con listado. QC-57 nacio con CINCO (`design.md > 1`: siete listas en cinco
 * carpetas de modulo) y **QC-66 anade la sexta copia**, `identity`, para el listado de usuarios
 * (su `design.md > 8.1`): misma firma abierta, misma bateria, mismo fuente.
 */
const MODULOS = [
  { nombre: 'inventario', contrato: inventario },
  { nombre: 'recetas', contrato: recetas },
  { nombre: 'proveedores', contrato: proveedores },
  { nombre: 'unidades', contrato: unidades },
  { nombre: 'pedidos', contrato: pedidos },
  { nombre: 'identity', contrato: identity },
] as const;

const NOMBRES_DE_MODULO = MODULOS.map((m) => m.nombre);

/**
 * Lista blanca canonica de la bateria. No es la de ningun listado real: la equivalencia que se
 * exige aqui es la del CONTRATO, y una lista blanca real haria que el veredicto dependiera de
 * los campos de esa tabla en vez de la forma.
 */
const CANONICA: ListQueryable = {
  sortable: ['name', 'createdAt'],
  filterable: { name: 'text', stock: 'numberRange', unitId: 'select', createdAt: 'dateRange' },
  searchable: true,
};

/** La gemela sin busqueda: es la situacion real de pedidos (R17). */
const CANONICA_SIN_BUSQUEDA: ListQueryable = { ...CANONICA, searchable: false };

type Saneada = { readonly query: ListQuery; readonly ignored: readonly string[] };

type CasoAceptado = {
  readonly nombre: string;
  readonly entrada: unknown;
  readonly esperado: Saneada;
};

const ACEPTADOS: readonly CasoAceptado[] = [
  {
    nombre: 'entrada valida completa',
    entrada: {
      page: 2,
      pageSize: 25,
      sort: { columnId: 'name', direction: 'desc' },
      filters: {
        name: { kind: 'text', value: 'sosa' },
        stock: { kind: 'numberRange', min: 0, max: 10 },
        unitId: { kind: 'select', values: ['u1', 'u2'] },
        createdAt: { kind: 'dateRange', from: '2026-01-01', to: '2026-01-31' },
      },
      search: 'buffer',
    },
    esperado: {
      query: {
        page: 2,
        pageSize: 25,
        sort: { columnId: 'name', direction: 'desc' },
        filters: {
          name: { kind: 'text', value: 'sosa' },
          stock: { kind: 'numberRange', min: 0, max: 10 },
          unitId: { kind: 'select', values: ['u1', 'u2'] },
          createdAt: { kind: 'dateRange', from: '2026-01-01', to: '2026-01-31' },
        },
        search: 'buffer',
      },
      ignored: [],
    },
  },
  {
    nombre: 'campo no declarado en el orden (R5)',
    entrada: { sort: { columnId: 'nombre', direction: 'asc' } },
    esperado: { query: { page: 1, sort: null, filters: {}, search: '' }, ignored: ['nombre'] },
  },
  {
    nombre: 'forma de filtro equivocada sobre un campo declarado (R8)',
    entrada: { filters: { name: { kind: 'numberRange', min: 1, max: 2 } } },
    esperado: { query: { page: 1, sort: null, filters: {}, search: '' }, ignored: ['name'] },
  },
  {
    nombre: 'deletedAt como orden y como filtro (R7)',
    entrada: {
      sort: { columnId: 'deletedAt', direction: 'desc' },
      filters: { deletedAt: { kind: 'dateRange', from: '2026-01-01', to: null } },
    },
    esperado: { query: { page: 1, sort: null, filters: {}, search: '' }, ignored: ['deletedAt'] },
  },
  {
    nombre: 'busqueda de solo espacios equivale a sin busqueda (R20)',
    entrada: { search: '   ' },
    esperado: { query: { page: 1, sort: null, filters: {}, search: '' }, ignored: [] },
  },
];

const RECHAZADOS: readonly { readonly nombre: string; readonly entrada: unknown }[] = [
  {
    nombre: 'una LISTA de ordenes (R9)',
    entrada: {
      sort: [
        { columnId: 'name', direction: 'asc' },
        { columnId: 'createdAt', direction: 'desc' },
      ],
    },
  },
  {
    nombre: 'un QUINTO kind de filtro (R12)',
    entrada: { filters: { name: { kind: 'regex', pattern: 'sosa' } } },
  },
  { nombre: 'una direccion de orden fuera de asc/desc (R9)', entrada: { sort: { columnId: 'name', direction: 'ASC' } } },
  { nombre: 'una pagina que no es entero positivo (R1)', entrada: { page: 0 } },
  // El tope de la busqueda entra en la bateria porque es exactamente el tipo de divergencia
  // silenciosa que un modulo podria mover en solitario sin romper ningun test suyo.
  { nombre: 'una busqueda mas larga que el tope de 120 (R20)', entrada: { search: 'a'.repeat(121) } },
];

/** Fuente real de la copia de un modulo. */
function fuenteDe(modulo: string): string {
  return readFileSync(join(repoRoot, 'lib', 'modules', modulo, 'domain', 'list-query.ts'), 'utf8');
}

/**
 * Texto comparable entre modulos: se neutraliza LO UNICO que puede diferir legitimamente, el
 * nombre del modulo en la cabecera y en la primera linea de la ruta. Todo lo demas tiene que
 * coincidir caracter a caracter, y los finales de linea se normalizan para que esto corra igual
 * en Windows.
 */
export function textoComparable(fuente: string): string {
  return fuente
    .split('\r\n')
    .join('\n')
    .replace(/lib\/modules\/[a-z]+\/domain\/list-query\.ts/g, 'lib/modules/<m>/domain/list-query.ts')
    .replace(/modulo `[a-z]+`/g, 'modulo `<m>`');
}

/** Prefijos que el dominio NO puede importar (R31, `docs/architecture.md`). */
const IMPORTS_PROHIBIDOS: readonly string[] = ['@/lib/shared', '@prisma/client', 'next/', '@/components'];

/**
 * Especificadores importados por un fuente, sean `import ... from '<x>'`, `import '<x>'` o
 * `require('<x>')`. Se mira el import, no el texto suelto: un comentario que nombre
 * `lib/shared` no es una dependencia (bloque 14 de `guard-arquitectura-modulos`).
 */
export function especificadoresImportados(fuente: string): readonly string[] {
  const encontrados: string[] = [];
  const patrones = [/from\s+['"]([^'"]+)['"]/g, /import\s+['"]([^'"]+)['"]/g, /require\(\s*['"]([^'"]+)['"]\s*\)/g];
  for (const patron of patrones) {
    for (const coincidencia of fuente.matchAll(patron)) {
      const especificador = coincidencia[1];
      if (especificador !== undefined) encontrados.push(especificador);
    }
  }
  return encontrados;
}

/** Los imports prohibidos de un fuente. Lista vacia = limpio. */
export function importsProhibidos(fuente: string): readonly string[] {
  return especificadoresImportados(fuente).filter((especificador) =>
    IMPORTS_PROHIBIDOS.some(
      (prohibido) =>
        especificador === prohibido ||
        especificador.startsWith(prohibido.endsWith('/') ? prohibido : `${prohibido}/`),
    ),
  );
}

describe('guardia — el contrato de listados es uno solo en los seis modulos', () => {
  describe('bloque 1 — mismo veredicto y misma salida saneada (R32)', () => {
    it('los seis modulos exportan la fabrica del esquema y el saneador', () => {
      const incompletos = MODULOS.filter(
        ({ contrato }) =>
          typeof contrato.createListQuerySchema !== 'function' ||
          typeof contrato.sanitizeListQuery !== 'function',
      ).map(({ nombre }) => nombre);

      expect(incompletos).toEqual([]);
    });

    it.each(ACEPTADOS)('acepta y sanea igual en los seis: $nombre', ({ entrada, esperado }) => {
      const resultados = MODULOS.map(({ nombre, contrato }) => {
        const query = contrato.createListQuerySchema().parse(entrada);
        return { nombre, saneada: contrato.sanitizeListQuery(query, CANONICA) };
      });

      // Contra un esperado ESCRITO: que los seis coincidan entre si no basta si los seis
      // estan mal (`design.md > 2.1`).
      for (const { nombre, saneada } of resultados) {
        expect(`${nombre}: ${JSON.stringify(saneada)}`).toBe(`${nombre}: ${JSON.stringify(esperado)}`);
      }
    });

    it.each(RECHAZADOS)('rechaza en los seis: $nombre', ({ entrada }) => {
      const aceptantes = MODULOS.filter(
        ({ contrato }) => contrato.createListQuerySchema().safeParse(entrada).success,
      ).map(({ nombre }) => nombre);

      expect(aceptantes).toEqual([]);
    });

    it('omite la busqueda igual en los seis cuando el listado no busca (R17)', () => {
      const resultados = MODULOS.map(({ nombre, contrato }) => {
        const query = contrato.createListQuerySchema().parse({ search: 'sosa' });
        return { nombre, saneada: contrato.sanitizeListQuery(query, CANONICA_SIN_BUSQUEDA) };
      });

      for (const { nombre, saneada } of resultados) {
        expect({ nombre, ...saneada }).toEqual({
          nombre,
          query: { page: 1, sort: null, filters: {}, search: '' },
          ignored: ['search'],
        });
      }
    });

    it('aplica los mismos defectos en los seis', () => {
      // R1 — sin `pageSize`: el 10 y el tope de 25 son del adaptador (R29), no del esquema.
      const defectos = MODULOS.map(({ contrato }) =>
        JSON.stringify(contrato.createListQuerySchema().parse({})),
      );

      expect(new Set(defectos).size).toBe(1);
      expect(defectos[0]).toBe(JSON.stringify({ page: 1, sort: null, filters: {}, search: '' }));
    });
  });

  describe('bloque 2 — los seis fuentes son la misma copia', () => {
    it('coinciden caracter a caracter salvo el nombre del modulo', () => {
      const textos = NOMBRES_DE_MODULO.map((modulo) => ({
        modulo,
        texto: textoComparable(fuenteDe(modulo)),
      }));
      const referencia = textos[0];
      if (referencia === undefined) throw new Error('no hay ningun modulo que comparar');

      const divergentes = textos
        .filter(({ texto }) => texto !== referencia.texto)
        .map(({ modulo }) => modulo);

      expect(divergentes).toEqual([]);
    });

    it('detecta una divergencia sintetica de una sola linea', () => {
      // Sin esto, el aserto de arriba podria estar verde por no comparar nada.
      const original = fuenteDe('inventario');
      const divergente = original.replace('SEARCH_MAX_LENGTH = 120', 'SEARCH_MAX_LENGTH = 200');

      expect(divergente).not.toBe(original);
      expect(textoComparable(divergente)).not.toBe(textoComparable(original));
    });

    it('NO se confunde con el nombre del modulo en la cabecera', () => {
      // El caso simetrico: lo unico que puede diferir, difiere, y la guardia sigue verde.
      expect(textoComparable(fuenteDe('pedidos'))).toBe(textoComparable(fuenteDe('recetas')));
    });
  });

  describe('bloque 3 — el dominio del contrato solo depende de zod (R31)', () => {
    it('ninguno de los seis importa lib/shared, Prisma, next ni components', () => {
      const hallazgos = NOMBRES_DE_MODULO.flatMap((modulo) =>
        importsProhibidos(fuenteDe(modulo)).map((especificador) => `${modulo}: ${especificador}`),
      );

      expect(hallazgos).toEqual([]);
    });

    it('los seis importan zod y nada mas', () => {
      const hallazgos = NOMBRES_DE_MODULO.flatMap((modulo) =>
        especificadoresImportados(fuenteDe(modulo))
          .filter((especificador) => especificador !== 'zod')
          .map((especificador) => `${modulo}: ${especificador}`),
      );

      expect(hallazgos).toEqual([]);
    });

    it('dispara con un fuente sintetico que importa lo prohibido, y no con uno limpio', () => {
      const sucio = [
        "import { z } from 'zod';",
        "import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';",
        "import type { Prisma } from '@prisma/client';",
        "import { cookies } from 'next/headers';",
        "import type { DataTableParams } from '@/components/shared/data-table/data-table-types';",
      ].join('\n');

      expect(importsProhibidos(sucio)).toEqual([
        '@/lib/shared/pagination',
        '@prisma/client',
        'next/headers',
        '@/components/shared/data-table/data-table-types',
      ]);
      expect(importsProhibidos("import { z } from 'zod';")).toEqual([]);
    });

    it('no se ciega por un comentario que nombre una ruta prohibida', () => {
      const conComentario = [
        '// El dominio NO puede importar @/lib/shared/pagination (R31).',
        "import { z } from 'zod';",
      ].join('\n');

      expect(importsProhibidos(conComentario)).toEqual([]);
    });
  });
});
