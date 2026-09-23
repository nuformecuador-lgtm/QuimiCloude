// Guardia: los literales 'PRODUCT' | 'MACHINE' | 'PACKAGING' tienen UN dueño en produccion:
// `lib/modules/inventario/domain/product-type.ts` (`PRODUCT_TYPES`). Cualquier otro sitio que
// escriba el literal a mano puede desincronizarse en silencio si el catalogo cambia — mismo
// motivo y mismo patron que `tests/guards/guard-rol-administrador-unico.test.ts` (R1/R11 alli).
//
// Vive en `tests/guards/` y no en `tests/unit/`: barre el arbol de PRODUCCION completo
// (`lib`, `app`, `components`, `hooks` + `.ts`/`.tsx` de primer nivel de la raiz). `tests/`,
// `e2e/`, `scripts/` y `db/` quedan fuera: los tests citan los literales a proposito (fixtures),
// y `db/` es donde el enum Postgres y las migraciones DEBEN escribirlos.
//
// LO QUE ESTA GUARDIA NO PUEDE VER: si el valor concreto de `PRODUCT_TYPES` sigue coincidiendo
// con el enum de Prisma/Postgres — eso es texto de `schema.prisma`/`migration.sql`, fuera del
// barrido de `.ts`. Tampoco si un consumidor importa el catalogo y luego lo copia a mano en un
// objeto local: solo mira literales entre comillas, no aliases.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { PRODUCT_TYPES, PRODUCT_TYPE_VALUES } from '@/lib/modules/inventario';

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

/** Directorios de codigo de PRODUCCION. Se barren en profundidad. */
const PRODUCTION_DIRS = ['lib', 'app', 'components', 'hooks'];

const IGNORED_DIRS = new Set(['node_modules', '.next', '.git', '.prisma', 'dist', '.worktrees']);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

/**
 * El unico archivo autorizado a declarar un literal de tipo de producto entre comillas: ahi
 * vive el catalogo `PRODUCT_TYPES`. Ningun exento mas: un segundo sitio «inocente» es exactamente
 * la deuda que esta guardia existe para impedir.
 */
const EXENTOS = ['lib/modules/inventario/domain/product-type.ts'];

/** Ruta comparable: separadores POSIX, para que esto corra igual en Windows. */
function toPosix(file: string): string {
  return file.split(sep).join('/');
}

function readDirEntries(dir: string): { name: string; isDirectory: boolean }[] {
  let names: readonly string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names.map((name) => ({ name, isDirectory: statSync(join(dir, name)).isDirectory() }));
}

function listSourceFiles(dir: string): readonly string[] {
  return readDirEntries(dir).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory) {
      return IGNORED_DIRS.has(entry.name) ? [] : listSourceFiles(full);
    }
    return SOURCE_EXTENSIONS.has(extname(entry.name)) ? [full] : [];
  });
}

/**
 * Los comentarios explican; no ejecutan. Se quitan antes de juzgar el codigo.
 *
 * **El orden importa: los de LINEA primero, los de BLOQUE despues.** Mismo razonamiento que
 * `guard-rol-administrador-unico.test.ts`: al reves, un `//` con un comodin `/*` dentro abre un
 * bloque falso y se traga el codigo debajo.
 */
function stripComments(source: string): string {
  return source
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * El patron se DERIVA de los valores de `PRODUCT_TYPES`, nunca se escribe a mano. Si el catalogo
 * anade o renombra un tipo, esta guardia sigue vigilando el conjunto correcto sin tocar este
 * archivo; si `PRODUCT_TYPES` quedara vacia, el `it` de anclas de mas abajo lo dice en vez de
 * pasar en verde por vacuidad.
 */
const LITERALES_DE_TIPO = new RegExp(
  PRODUCT_TYPE_VALUES.map((valor) => `['"\`]${escapeRegExp(valor)}['"\`]`).join('|'),
);

/** `true` si el fuente (sin comentarios) declara un literal de tipo de producto entre comillas. */
export function mentionsProductTypeLiteral(source: string): boolean {
  return LITERALES_DE_TIPO.test(stripComments(source));
}

/** Archivos `.ts`/`.tsx` sueltos en el PRIMER NIVEL del repositorio (no recursivo). */
export function listRootLevelSourceFiles(root: string): readonly string[] {
  return readDirEntries(root)
    .filter((entry) => !entry.isDirectory && SOURCE_EXTENSIONS.has(extname(entry.name)))
    .map((entry) => join(root, entry.name));
}

/** Todo el codigo de produccion barrido por la guardia. */
export function listProductionFiles(root: string): readonly string[] {
  return [
    ...PRODUCTION_DIRS.flatMap((dirName) => listSourceFiles(join(root, dirName))),
    ...listRootLevelSourceFiles(root),
  ];
}

/** Archivos de produccion (rutas relativas en POSIX) que declaran un literal de tipo. */
export function findProductTypeLiteralDeclarations(root: string): readonly string[] {
  return listProductionFiles(root)
    .filter((absPath) => mentionsProductTypeLiteral(readFileSync(absPath, 'utf8')))
    .map((absPath) => toPosix(absPath.slice(root.length + 1)));
}

describe('guardia — un unico dueño de los literales de tipo de producto', () => {
  it('el literal solo aparece en product-type.ts, salvo ese exento nombrado', () => {
    const conElLiteral = findProductTypeLiteralDeclarations(repoRoot);
    const intrusos = conElLiteral.filter((file) => !EXENTOS.includes(file));

    expect(
      intrusos,
      intrusos.length === 0
        ? undefined
        : 'Los literales PRODUCT/MACHINE/PACKAGING tienen un unico dueño en produccion: ' +
          'lib/modules/inventario/domain/product-type.ts (PRODUCT_TYPES). ' +
          `Se encontro el literal declarado tambien en: ${intrusos.join(', ')}. ` +
          "No repitas la cadena ahi: importa PRODUCT_TYPES del barrel '@/lib/modules/inventario' " +
          '(nunca por ruta profunda, nunca desde otro barrel). ' +
          'Un literal con dos dueños se desincroniza en silencio si el catalogo cambia.',
    ).toEqual([]);

    // Ancla del exento: si product-type.ts dejara de casar, la guardia tiene que avisar, no
    // callarse en un verde por vacuidad.
    expect(conElLiteral).toContain('lib/modules/inventario/domain/product-type.ts');
  });

  it('la regla deriva el patron de PRODUCT_TYPES y reconoce las tres comillas', () => {
    expect(mentionsProductTypeLiteral("const x = 'MACHINE';")).toBe(true);
    expect(mentionsProductTypeLiteral('const x = "PACKAGING";')).toBe(true);
    expect(mentionsProductTypeLiteral('const x = `PRODUCT`;')).toBe(true);
    // Dentro de un comentario no es infraccion.
    expect(mentionsProductTypeLiteral("// ver PRODUCT o MACHINE")).toBe(false);
    expect(mentionsProductTypeLiteral('/** usa "MACHINE" con cuidado */')).toBe(false);
    // Importar el catalogo no declara ningun literal.
    expect(
      mentionsProductTypeLiteral("import { PRODUCT_TYPES } from '@/lib/modules/inventario';"),
    ).toBe(false);
  });

  // Regresion del cegado de stripComments: mismo patron que guard-rol-administrador-unico.
  it('no se ciega: un comentario de linea con `/*` NO esconde el literal que va debajo', () => {
    const cegado = [
      '// ... `/*` (nota)',
      "export const tipo = 'MACHINE';",
      '/** JSDoc posterior que cierra el bloque falso. */',
      'export const otra = 1;',
    ].join('\n');

    expect(
      mentionsProductTypeLiteral(cegado),
      'stripComments quita los comentarios de LINEA antes que los de BLOQUE. Si alguien invierte ' +
        'ese orden, un comentario de linea que mencione un comodin se traga el codigo que tenga ' +
        'debajo y esta guardia pasa en verde sin haber mirado el archivo.',
    ).toBe(true);
    expect(mentionsProductTypeLiteral(cegado.split('\n').slice(1).join('\n'))).toBe(true);
  });

  it('el barrido incluye la raiz y excluye tests/, e2e/, scripts/ y db/', () => {
    const relativos = listProductionFiles(repoRoot).map((absPath) =>
      toPosix(absPath.slice(repoRoot.length + 1)),
    );

    expect(relativos).toContain('next.config.ts');
    expect(relativos.some((file) => file.startsWith('tests/'))).toBe(false);
    expect(relativos.some((file) => file.startsWith('e2e/'))).toBe(false);
    expect(relativos.some((file) => file.startsWith('scripts/'))).toBe(false);
    expect(relativos.some((file) => file.startsWith('db/'))).toBe(false);
    expect(relativos).toContain('lib/modules/inventario/domain/product-type.ts');
  });

  it('PRODUCT_TYPES sigue teniendo los tres tipos y PRODUCT_TYPE_VALUES no diverge', () => {
    expect(PRODUCT_TYPES.PRODUCT).toBe('PRODUCT');
    expect(PRODUCT_TYPES.MACHINE).toBe('MACHINE');
    expect(PRODUCT_TYPES.PACKAGING).toBe('PACKAGING');
    expect([...PRODUCT_TYPE_VALUES].sort()).toEqual(
      [PRODUCT_TYPES.PRODUCT, PRODUCT_TYPES.MACHINE, PRODUCT_TYPES.PACKAGING].sort(),
    );
    expect(PRODUCT_TYPE_VALUES).toHaveLength(3);
  });
});
