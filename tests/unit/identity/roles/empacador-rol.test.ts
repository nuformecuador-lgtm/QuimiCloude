// T7 (QC-144) — Guardia y unit del rol Empacador (R1, R2, R3, R16).
//
// R1: el rol nace en SEED_ROLES con descripcion no vacia, y los otros dos roles quedan intactos.
// R2: el literal `Empacador` tiene un unico dueño en produccion, `roles.ts` -- barrido, mismo
// patron que `tests/guards/guard-rol-administrador-unico.test.ts`, reescrito en este archivo
// porque protege un requisito de ESTA ficha, no una convencion transversal (design.md > 4).
// R3: el modelo `Role` de `db/schema.prisma` es global, sin campo de empresa.
// R16: nadie en esta ficha consume `terminados.consultar` todavia; el mismo barrido, sobre otro
// literal, lo demuestra. QC-145 tendra que relajar este caso cuando lo consuma.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ROLE_ADMINISTRADOR,
  ROLE_EMPACADOR,
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

/** Mismo alcance que `guard-rol-administrador-unico.test.ts` (design.md > 4). */
const PRODUCTION_DIRS = ['lib', 'app', 'components', 'hooks'];

const IGNORED_DIRS = new Set(['node_modules', '.next', '.git', '.prisma', 'dist', '.worktrees']);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

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

/** Mismo barrido que `guard-rol-administrador-unico.test.ts`: `PRODUCTION_DIRS` + raiz. */
function listProductionFiles(root: string): readonly string[] {
  return [
    ...PRODUCTION_DIRS.flatMap((dirName) => listSourceFiles(join(root, dirName))),
    ...listRootLevelSourceFiles(root),
  ];
}

/**
 * Comentarios de LINEA primero, de BLOQUE despues (mismo orden que el precedente, por el mismo
 * motivo: al reves, un comentario de linea con una apertura de bloque se traga codigo real).
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

/** El literal buscado se DERIVA de `ROLE_EMPACADOR`, nunca se escribe a mano en este archivo. */
function literalPattern(value: string): RegExp {
  return new RegExp(`['"\`]${escapeRegExp(value)}['"\`]`);
}

const LITERAL_EMPACADOR = literalPattern(ROLE_EMPACADOR);

/** `true` si el fuente (sin comentarios) declara el literal entre comillas. */
export function mentionsEmpacadorLiteral(source: string): boolean {
  return LITERAL_EMPACADOR.test(stripComments(source));
}

/** Archivos de produccion (rutas relativas POSIX) que declaran el literal del rol Empacador. */
function findEmpacadorLiteralDeclarations(root: string): readonly string[] {
  return listProductionFiles(root)
    .filter((absPath) => mentionsEmpacadorLiteral(readFileSync(absPath, 'utf8')))
    .map((absPath) => toPosix(absPath.slice(root.length + 1)));
}

/** `true` si el fuente (sin comentarios) declara el codigo `terminados.consultar` entre comillas. */
export function mentionsTerminadosConsultarLiteral(source: string): boolean {
  return literalPattern('terminados.consultar').test(stripComments(source));
}

function findTerminadosConsultarDeclarations(root: string): readonly string[] {
  return listProductionFiles(root)
    .filter((absPath) => mentionsTerminadosConsultarLiteral(readFileSync(absPath, 'utf8')))
    .map((absPath) => toPosix(absPath.slice(root.length + 1)));
}

describe('R1 — el rol Empacador nace en SEED_ROLES, los otros dos quedan intactos', () => {
  it('SEED_ROLES tiene una fila Empacador con descripcion no vacia', () => {
    const fila = SEED_ROLES.find((rol) => rol.name === ROLE_EMPACADOR);

    expect(fila).toBeDefined();
    expect(fila?.description).toBeTruthy();
    expect(fila?.description.trim().length).toBeGreaterThan(0);
  });

  it('Administrador y Operador conservan su nombre y su descripcion exactos', () => {
    const admin = SEED_ROLES.find((rol) => rol.name === ROLE_ADMINISTRADOR);
    const operador = SEED_ROLES.find((rol) => rol.name === ROLE_OPERADOR);

    expect(admin?.description).toBe('Acceso total al sistema.');
    expect(operador?.description).toBe('Operacion del dia a dia.');
  });

  it('SEED_ROLES tiene exactamente tres filas: Administrador, Operador y Empacador', () => {
    expect(SEED_ROLES.map((rol) => rol.name)).toEqual([
      ROLE_ADMINISTRADOR,
      ROLE_OPERADOR,
      ROLE_EMPACADOR,
    ]);
  });
});

describe('R2 — el literal del rol Empacador tiene un unico dueño en produccion', () => {
  it('solo aparece en lib/modules/identity/domain/roles.ts', () => {
    const conElLiteral = findEmpacadorLiteralDeclarations(repoRoot);

    expect(
      conElLiteral,
      conElLiteral.length === 1 && conElLiteral[0] === 'lib/modules/identity/domain/roles.ts'
        ? undefined
        : 'El rol Empacador tiene un unico dueño (R2): lib/modules/identity/domain/roles.ts. ' +
            `Se encontro el literal declarado tambien en: ${conElLiteral.join(', ')}. ` +
            "Importa ROLE_EMPACADOR del barrel '@/lib/modules/identity' en vez de repetir la cadena.",
    ).toEqual(['lib/modules/identity/domain/roles.ts']);
  });

  it('dispara con un fuente sintetico que declara el literal, con cualquiera de las tres comillas', () => {
    expect(mentionsEmpacadorLiteral(`const x = '${ROLE_EMPACADOR}';`)).toBe(true);
    expect(mentionsEmpacadorLiteral(`const x = "${ROLE_EMPACADOR}";`)).toBe(true);
    expect(mentionsEmpacadorLiteral(`const x = \`${ROLE_EMPACADOR}\`;`)).toBe(true);
  });

  it('el caso simetrico: importar ROLE_EMPACADOR del barrel no declara ningun literal', () => {
    expect(
      mentionsEmpacadorLiteral("import { ROLE_EMPACADOR } from '@/lib/modules/identity';"),
    ).toBe(false);
    // Y el mismo literal dentro de un comentario tampoco es una infraccion.
    expect(mentionsEmpacadorLiteral(`// no confundir con '${ROLE_EMPACADOR}' que es el rol bueno`)).toBe(
      false,
    );
  });
});

describe('R3 — el rol Empacador es global: Role no lleva campo de empresa', () => {
  it('el modelo Role de db/schema.prisma no declara ninguna columna de empresa', () => {
    const schema = readFileSync(join(repoRoot, 'db', 'schema.prisma'), 'utf8');
    const inicio = schema.indexOf('model Role {');
    expect(inicio).toBeGreaterThanOrEqual(0);
    const fin = schema.indexOf('\n}', inicio);
    const bloque = schema.slice(inicio, fin);

    expect(bloque).not.toMatch(/companyId/);
    expect(bloque).not.toMatch(/company_id/);
    expect(bloque).not.toMatch(/Company/);
  });
});

describe('R16 — ningun archivo de produccion distinto de permissions.ts exige terminados.consultar', () => {
  it('el codigo `terminados.consultar` solo aparece en lib/modules/identity/domain/permissions.ts', () => {
    const conElCodigo = findTerminadosConsultarDeclarations(repoRoot);

    expect(
      conElCodigo,
      conElCodigo.length === 1 && conElCodigo[0] === 'lib/modules/identity/domain/permissions.ts'
        ? undefined
        : 'terminados.consultar no tiene todavia ningun consumidor fuera del catalogo (QC-144 R16): ' +
            'lib/modules/identity/domain/permissions.ts. ' +
            `Se encontro tambien en: ${conElCodigo.join(', ')}. ` +
            'Si estas construyendo la lista de pedidos terminados, esa es QC-145: es la ficha ' +
            'que tiene que relajar este caso, no esta.',
    ).toEqual(['lib/modules/identity/domain/permissions.ts']);
  });

  it('dispara con un fuente sintetico que exige el codigo, con cualquiera de las tres comillas', () => {
    expect(mentionsTerminadosConsultarLiteral("requirePermission(actor, 'terminados.consultar')")).toBe(
      true,
    );
    expect(mentionsTerminadosConsultarLiteral('requirePermission(actor, "terminados.consultar")')).toBe(
      true,
    );
    expect(mentionsTerminadosConsultarLiteral('requirePermission(actor, `terminados.consultar`)')).toBe(
      true,
    );
  });

  it('el caso simetrico: el mismo codigo dentro de un comentario no es una infraccion', () => {
    expect(
      mentionsTerminadosConsultarLiteral('// QC-145 exigira terminados.consultar aqui'),
    ).toBe(false);
  });
});
