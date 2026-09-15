import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { FORMULAS_ROUTE } from '@/lib/shared/routes';

const RAIZ = join(__dirname, '..', '..', '..');

function leer(rutaRelativa: string): string {
  return readFileSync(join(RAIZ, rutaRelativa), 'utf8');
}

function fuenteSinComentarios(rutaRelativa: string): string {
  return leer(rutaRelativa)
    .split('\n')
    .filter((linea) => {
      const limpia = linea.trim();
      return !(limpia.startsWith('//') || limpia.startsWith('*') || limpia.startsWith('/*'));
    })
    .join('\n');
}

function enRutaDePosix(ruta: string): string {
  return ruta.split(sep).join('/');
}

function fuentesBajo(carpetaRelativa: string): string[] {
  const encontradas: string[] = [];

  const recorrer = (directorio: string) => {
    for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
      const completa = join(directorio, entrada.name);
      if (entrada.isDirectory()) {
        if (entrada.name === 'node_modules' || entrada.name === '.next') continue;
        recorrer(completa);
        continue;
      }
      if (entrada.name.endsWith('.ts') || entrada.name.endsWith('.tsx')) {
        encontradas.push(relative(RAIZ, completa).split('\\').join('/'));
      }
    }
  };

  recorrer(join(RAIZ, carpetaRelativa));
  return encontradas.sort();
}

const CARPETA_RUTA = join('app', '(private)', FORMULAS_ROUTE.replace(/^\//, ''));
const COMPONENTES_PATH = join(CARPETA_RUTA, 'components');
const FUENTES_DE_LA_RUTA = fuentesBajo(CARPETA_RUTA);

const RECIPE_PAGE_TEST = 'tests/unit/recetas-ui/recipe-page.test.tsx';
const SUPPLIER_PAGE_TEST = 'tests/unit/proveedores-ui/supplier-page.test.tsx';
const ESTE_ARCHIVO = 'tests/unit/shared/migracion-listas-alcance.test.ts';

const TESTS_DE_LA_MIGRACION = [
  RECIPE_PAGE_TEST,
  SUPPLIER_PAGE_TEST,
  'tests/unit/recetas-ui/recipe-list-params.test.ts',
  'tests/unit/proveedores-ui/supplier-list-params.test.ts',
  'tests/unit/recetas-ui/recipe-route-contract.test.ts',
  'tests/unit/proveedores-ui/supplier-route-contract.test.ts',
  ESTE_ARCHIVO,
] as const;

const E2E_CON_RECORRIDO_DE_BUSQUEDA = ['e2e/recetas.spec.ts', 'e2e/proveedores.spec.ts'] as const;

const CONSULTA_POR_TEXTO =
  /\b(?:get|find|query)(?:All)?By(?:Text|Title|AltText|DisplayValue|LabelText|PlaceholderText)\s*\(/g;

const NOMBRE_ACCESIBLE_LITERAL = /ByRole\(\s*['"`][^'"`]*['"`]\s*,\s*\{[^}]*name\s*:\s*['"`]/g;

const LOCALIZADOR_E2E_POR_TEXTO = /\bgetBy(?:Text|Title|AltText|Placeholder)\s*\(/g;

const ETIQUETA_E2E_LITERAL = /\bgetByLabel\(\s*['"`]/g;

const PATRONES_UNITARIOS = [CONSULTA_POR_TEXTO, NOMBRE_ACCESIBLE_LITERAL] as const;

const PATRONES_E2E = [
  LOCALIZADOR_E2E_POR_TEXTO,
  ETIQUETA_E2E_LITERAL,
  NOMBRE_ACCESIBLE_LITERAL,
] as const;

const MOTIVO_IDENTIFICADOR =
  'busca REFERENCIA_DEL_CASO, el identificador de peticion que devuelve el doble ' +
  '(tests/helpers/identificador-de-request.ts): es un dato de fixture, no copy. Heredado de QC-71.';

/** Cada caso se nombra por describe y titulo: en recipe-page hay dos casos con el mismo titulo. */
const ADMITIDOS = [
  {
    archivo: RECIPE_PAGE_TEST,
    describe: 'lista de recetas — el identificador del error inesperado (QC-71 R17, R18)',
    caso: 'el error inesperado ensena el identificador como texto, con su etiqueta',
    motivo: MOTIVO_IDENTIFICADOR,
  },
  {
    archivo: RECIPE_PAGE_TEST,
    describe: 'borrado de receta — el identificador del error inesperado (QC-71 R17, R18)',
    caso: 'el error inesperado ensena el identificador como texto, con su etiqueta',
    motivo: MOTIVO_IDENTIFICADOR,
  },
  {
    archivo: SUPPLIER_PAGE_TEST,
    describe: 'pantalla de proveedores — el identificador del error inesperado (QC-71 R17, R18)',
    caso: 'la lista con el error inesperado ensena el identificador como texto y con su etiqueta',
    motivo: MOTIVO_IDENTIFICADOR,
  },
  {
    archivo: SUPPLIER_PAGE_TEST,
    describe: 'pantalla de proveedores — el identificador del error inesperado (QC-71 R17, R18)',
    caso: 'el formulario conserva el identificador que devolvio la operacion',
    motivo: MOTIVO_IDENTIFICADOR,
  },
  {
    archivo: SUPPLIER_PAGE_TEST,
    describe: 'pantalla de proveedores — el identificador del error inesperado (QC-71 R17, R18)',
    caso: 'el dialogo de baja ensena el identificador del error inesperado',
    motivo: MOTIVO_IDENTIFICADOR,
  },
] as const;

type Hallazgo = { archivo: string; describe: string; caso: string; linea: number; texto: string };

const TITULO_DE_CASO = /\b(?:it|test)(?:\.(?:only|skip|todo))?\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
const TITULO_DE_DESCRIBE =
  /\b(?:test\.)?describe(?:\.(?:only|skip))?\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;

function ultimoTituloAntesDe(fuente: string, patron: RegExp, indice: number): string {
  let titulo = '(fuera de todo bloque)';
  for (const encaje of fuente.matchAll(new RegExp(patron.source, patron.flags))) {
    if (encaje.index >= indice) break;
    titulo = encaje[2];
  }
  return titulo;
}

function hallazgos(archivo: string, fuente: string, patrones: readonly RegExp[]): Hallazgo[] {
  return patrones.flatMap((patron) =>
    [...fuente.matchAll(new RegExp(patron.source, patron.flags))].map((encaje) => ({
      archivo,
      describe: ultimoTituloAntesDe(fuente, TITULO_DE_DESCRIBE, encaje.index),
      caso: ultimoTituloAntesDe(fuente, TITULO_DE_CASO, encaje.index),
      linea: fuente.slice(0, encaje.index).split('\n').length,
      texto: encaje[0],
    })),
  );
}

function clave({ archivo, describe, caso }: { archivo: string; describe: string; caso: string }) {
  return `${archivo} > ${describe} > ${caso}`;
}

/** El bloque del recorrido de busqueda y orden, desde su `test(` hasta el cierre a su misma sangria. */
function bloqueDelRecorridoDeBusqueda(archivo: string): string {
  const lineas = leer(archivo).split('\n');
  const inicios = lineas
    .map((linea, indice) => ({ linea, indice }))
    .filter(({ linea }) => /^\s*test\(\s*(['"`])busca .*\(R26\)\1/.test(linea));

  expect(inicios, `${archivo} debe tener exactamente un test de busqueda (R26)`).toHaveLength(1);

  const { linea: apertura, indice: inicio } = inicios[0];
  const sangria = apertura.match(/^\s*/)?.[0] ?? '';
  const fin = lineas.findIndex((linea, indice) => indice > inicio && linea === `${sangria}});`);

  expect(fin, `${archivo}: no se encontro el cierre del test de busqueda (R26)`).toBeGreaterThan(
    inicio,
  );

  return lineas.slice(inicio, fin + 1).join('\n');
}

const POR = 'By';
const MUESTRA_UNITARIA = [
  "describe('bloque de muestra', () => {",
  "  it('caso de muestra', () => {",
  `    screen.get${POR}Text('Recetas');`,
  `    screen.findAll${POR}DisplayValue('Cloro');`,
  `    screen.get${POR}Role('button', { name: 'Guardar' });`,
  '  });',
  '});',
].join('\n');

const MUESTRA_E2E = [
  `page.get${POR}Text('Buscar');`,
  `page.get${POR}Placeholder('Nombre');`,
  `page.get${POR}Label('Buscar');`,
  `page.get${POR}Role('button', { name: 'Buscar' });`,
  `page.get${POR}Label(SEARCH_LABEL);`,
].join('\n');

describe('alcance de la migracion de las listas a la tabla compartida', () => {
  it('R25: los tests de pantalla, parser y contrato no localizan por copy, salvo los casos admitidos', () => {
    const encontrados = TESTS_DE_LA_MIGRACION.flatMap((archivo) =>
      hallazgos(archivo, fuenteSinComentarios(archivo), PATRONES_UNITARIOS),
    );

    const admitidos = new Set(ADMITIDOS.map(clave));
    const noAdmitidos = encontrados.filter((hallazgo) => !admitidos.has(clave(hallazgo)));

    expect(
      noAdmitidos.map(({ archivo, caso, linea, texto }) => `${archivo}:${linea} «${caso}» ${texto}`),
      'localizan por copy en vez de por rol, data-testid o constante',
    ).toEqual([]);

    const conHallazgo = new Set(encontrados.map(clave));
    expect(
      ADMITIDOS.map(clave).filter((admitido) => !conHallazgo.has(admitido)),
      'admision sobrante: el caso ya no consulta por texto, o cambio de nombre; se borra de la lista',
    ).toEqual([]);

    for (const { motivo } of ADMITIDOS) {
      expect(motivo.length, 'cada admitido lleva su motivo').toBeGreaterThan(0);
    }
  });

  it('R25: el recorrido de busqueda y orden de los dos E2E no localiza por copy', () => {
    for (const archivo of E2E_CON_RECORRIDO_DE_BUSQUEDA) {
      const bloque = bloqueDelRecorridoDeBusqueda(archivo);

      expect(bloque, `${archivo}: el bloque leido debe localizar por data-testid`).toContain(
        'getByTestId(',
      );
      expect(
        hallazgos(archivo, bloque, PATRONES_E2E).map(({ texto }) => texto),
        `${archivo}: el test de busqueda (R26) localiza por copy`,
      ).toEqual([]);
    }
  });

  it('R25: el detector muerde sobre una muestra con las formas prohibidas', () => {
    const unitarios = hallazgos('muestra', MUESTRA_UNITARIA, PATRONES_UNITARIOS);
    expect(unitarios).toHaveLength(3);
    expect(new Set(unitarios.map(clave))).toEqual(
      new Set(['muestra > bloque de muestra > caso de muestra']),
    );

    expect(hallazgos('muestra', MUESTRA_E2E, PATRONES_E2E)).toHaveLength(4);
  });

  it('R30: la lista no conserva tabla ni barra propias y si su vacio, su error y su esqueleto', () => {
    const nombres = readdirSync(join(RAIZ, COMPONENTES_PATH));
    const esqueleto = enRutaDePosix(join(COMPONENTES_PATH, 'recipe-table-skeleton.tsx'));
    const tabla = enRutaDePosix(join(COMPONENTES_PATH, 'recipe-table.tsx'));

    for (const borrado of ['recipe-list-toolbar.tsx', 'recipe-columns.ts']) {
      expect(nombres, `${COMPONENTES_PATH} no deberia tener ${borrado}`).not.toContain(borrado);
    }
    expect(
      nombres.filter((nombre) => /toolbar|pagination/i.test(nombre)),
      'la barra y la paginacion las pinta la tabla compartida',
    ).toEqual([]);

    const importaTablaPrimitiva = /from\s*['"]@\/components\/ui\/table['"]/;
    expect(
      FUENTES_DE_LA_RUTA.filter(
        (ruta) => ruta !== esqueleto && importaTablaPrimitiva.test(fuenteSinComentarios(ruta)),
      ),
      'solo el esqueleto puede seguir montando la tabla primitiva',
    ).toEqual([]);

    for (const conservado of [
      enRutaDePosix(join(COMPONENTES_PATH, 'recipe-list-empty.tsx')),
      enRutaDePosix(join(COMPONENTES_PATH, 'recipe-list-error.tsx')),
      esqueleto,
    ]) {
      expect(existsSync(join(RAIZ, conservado)), `deberia existir ${conservado}`).toBe(true);
    }

    expect(fuenteSinComentarios(tabla)).toMatch(
      /from\s*['"]@\/components\/shared\/data-table['"]/,
    );
  });
});
