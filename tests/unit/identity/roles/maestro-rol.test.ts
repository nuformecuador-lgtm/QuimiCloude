// Unit y barrido del rol Maestro: nace al final de SEED_ROLES con descripcion no vacia y los
// otros tres quedan intactos; el literal `Maestro` tiene un unico dueño en produccion,
// `roles.ts`; el modelo `Role` de `db/schema.prisma` es global, sin campo de empresa; y
// `empresas.consultar`/`empresas.modificar` solo se nombran en el catalogo. Mismo barrido que
// `empacador-rol.test.ts`, reescrito aqui porque protege requisitos propios de esta ficha.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ROLE_ADMINISTRADOR,
  ROLE_EMPACADOR,
  ROLE_MAESTRO,
  ROLE_OPERADOR,
  SEED_ROLES,
} from '@/lib/modules/identity';

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

/** Mismo alcance que `guard-rol-administrador-unico.test.ts`. */
const PRODUCTION_DIRS = ['lib', 'app', 'components', 'hooks'];

const IGNORED_DIRS = new Set(['node_modules', '.next', '.git', '.prisma', 'dist', '.worktrees']);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

const CATALOGO_DE_ROLES = 'lib/modules/identity/domain/roles.ts';
const CATALOGO_DE_PERMISOS = 'lib/modules/identity/domain/permissions.ts';

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

function listRootLevelSourceFiles(root: string): readonly string[] {
  return readDirEntries(root)
    .filter((entry) => !entry.isDirectory && SOURCE_EXTENSIONS.has(extname(entry.name)))
    .map((entry) => join(root, entry.name));
}

function listProductionFiles(root: string): readonly string[] {
  return [
    ...PRODUCTION_DIRS.flatMap((dirName) => listSourceFiles(join(root, dirName))),
    ...listRootLevelSourceFiles(root),
  ];
}

/**
 * Comentarios de LINEA primero, de BLOQUE despues: al reves, un comentario de linea con una
 * apertura de bloque se traga codigo real.
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

function literalPattern(value: string): RegExp {
  return new RegExp(`['"\`]${escapeRegExp(value)}['"\`]`);
}

/** El literal buscado se DERIVA de `ROLE_MAESTRO`, nunca se escribe a mano en este archivo. */
const LITERAL_MAESTRO = literalPattern(ROLE_MAESTRO);

export function mentionsMaestroLiteral(source: string): boolean {
  return LITERAL_MAESTRO.test(stripComments(source));
}

const CODIGOS_DE_EMPRESAS = ['empresas.consultar', 'empresas.modificar'] as const;

export function mentionsEmpresasCode(source: string): boolean {
  const sinComentarios = stripComments(source);
  return CODIGOS_DE_EMPRESAS.some((codigo) => literalPattern(codigo).test(sinComentarios));
}

function findProductionFilesWhere(root: string, test: (source: string) => boolean): readonly string[] {
  return listProductionFiles(root)
    .filter((absPath) => test(readFileSync(absPath, 'utf8')))
    .map((absPath) => toPosix(absPath.slice(root.length + 1)));
}

describe('R2 — el rol Maestro nace en SEED_ROLES, los otros tres quedan intactos', () => {
  it('R2: SEED_ROLES tiene una fila Maestro con descripcion no vacia', () => {
    const fila = SEED_ROLES.find((rol) => rol.name === ROLE_MAESTRO);

    expect(fila).toBeDefined();
    expect(fila?.description.trim().length).toBeGreaterThan(0);
  });

  it('R2: Administrador, Operador y Empacador conservan su nombre y su descripcion exactos', () => {
    const descripcionDe = (nombre: string) =>
      SEED_ROLES.find((rol) => rol.name === nombre)?.description;

    expect(descripcionDe(ROLE_ADMINISTRADOR)).toBe('Acceso total al sistema.');
    expect(descripcionDe(ROLE_OPERADOR)).toBe('Operacion del dia a dia.');
    expect(descripcionDe(ROLE_EMPACADOR)).toBe(
      'Prepara los pedidos asignados y consulta los terminados.',
    );
  });

  it('R2: el Maestro va al final y los tres roles de antes conservan su orden', () => {
    expect(SEED_ROLES.map((rol) => rol.name)).toEqual([
      ROLE_ADMINISTRADOR,
      ROLE_OPERADOR,
      ROLE_EMPACADOR,
      ROLE_MAESTRO,
    ]);
  });
});

describe('R3 — el literal del rol Maestro tiene un unico dueño en produccion', () => {
  it('R3: solo aparece en lib/modules/identity/domain/roles.ts', () => {
    const conElLiteral = findProductionFilesWhere(repoRoot, mentionsMaestroLiteral);

    expect(
      conElLiteral,
      `El rol Maestro tiene un unico dueño: ${CATALOGO_DE_ROLES}. ` +
        `Se encontro el literal declarado tambien en: ${conElLiteral.join(', ')}. ` +
        "Importa ROLE_MAESTRO del barrel '@/lib/modules/identity' en vez de repetir la cadena.",
    ).toEqual([CATALOGO_DE_ROLES]);
  });

  it('R3: dispara con un fuente sintetico que declara el literal, con cualquiera de las tres comillas', () => {
    expect(mentionsMaestroLiteral(`const x = '${ROLE_MAESTRO}';`)).toBe(true);
    expect(mentionsMaestroLiteral(`const x = "${ROLE_MAESTRO}";`)).toBe(true);
    expect(mentionsMaestroLiteral(`const x = \`${ROLE_MAESTRO}\`;`)).toBe(true);
  });

  it('R3: el caso simetrico: importar la constante o nombrar el literal en un comentario no dispara', () => {
    expect(mentionsMaestroLiteral("import { ROLE_MAESTRO } from '@/lib/modules/identity';")).toBe(
      false,
    );
    expect(mentionsMaestroLiteral(`// el rol '${ROLE_MAESTRO}' se importa, no se copia`)).toBe(false);
    expect(mentionsMaestroLiteral(`/* '${ROLE_MAESTRO}' */ const x = 1;`)).toBe(false);
  });
});

describe('R4 — el rol Maestro es global: Role no lleva campo de empresa', () => {
  it('R4: el modelo Role de db/schema.prisma no declara ninguna columna de empresa', () => {
    const schema = readFileSync(join(repoRoot, 'db', 'schema.prisma'), 'utf8');
    const inicio = schema.indexOf('model Role {');
    expect(inicio).toBeGreaterThanOrEqual(0);
    const bloque = schema.slice(inicio, schema.indexOf('\n}', inicio));

    expect(bloque).not.toMatch(/companyId/);
    expect(bloque).not.toMatch(/company_id/);
    expect(bloque).not.toMatch(/Company/);
  });

  it('R4: SEED_ROLES declara una sola fila Maestro', () => {
    expect(SEED_ROLES.filter((rol) => rol.name === ROLE_MAESTRO)).toHaveLength(1);
  });
});

describe('R17 — ningun archivo de produccion fuera del catalogo nombra los permisos de empresas', () => {
  it('R17: empresas.consultar y empresas.modificar solo aparecen en el catalogo de permisos', () => {
    const conElCodigo = findProductionFilesWhere(repoRoot, mentionsEmpresasCode);
    const inesperados = conElCodigo.filter((ruta) => ruta !== CATALOGO_DE_PERMISOS);

    expect(
      inesperados,
      `empresas.consultar y empresas.modificar solo pueden nombrarse en ${CATALOGO_DE_PERMISOS}. ` +
        `Se encontraron tambien en: ${inesperados.join(', ')}. ` +
        'Si eres QC-162 (o la ficha que empiece a exigir estos permisos), relaja este barrido ' +
        'abriendo aqui las rutas exactas que los exigen, como hizo empacador-rol.test.ts.',
    ).toEqual([]);
    // Anti-cegado: el barrido si ve el catalogo, que declara los dos codigos.
    expect(conElCodigo).toEqual([CATALOGO_DE_PERMISOS]);
  });

  it('R17: dispara con un fuente sintetico que exige cualquiera de los dos codigos', () => {
    expect(mentionsEmpresasCode("requirePermission(actor, 'empresas.consultar')")).toBe(true);
    expect(mentionsEmpresasCode('requirePermission(actor, "empresas.modificar")')).toBe(true);
    expect(mentionsEmpresasCode('requirePermission(actor, `empresas.modificar`)')).toBe(true);
  });

  it('R17: el caso simetrico: los codigos dentro de un comentario no son una infraccion', () => {
    expect(mentionsEmpresasCode('// exigira empresas.consultar aqui')).toBe(false);
    expect(mentionsEmpresasCode("/* 'empresas.modificar' */ const x = 1;")).toBe(false);
  });
});
