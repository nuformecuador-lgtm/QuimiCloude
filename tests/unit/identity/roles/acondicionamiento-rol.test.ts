// El rol Administrador de acondicionamiento: nace al final de SEED_ROLES sin mover a los otros
// cuatro, su literal solo se escribe en `roles.ts`, es global, y el codigo de su permiso solo se
// nombra en el catalogo, en los casos de uso que lo exigen y en los dos consumidores que no son
// caso de uso: el predicado de las vistas de `/asignacion` y la pagina del detalle.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ROLE_ACONDICIONAMIENTO,
  ROLE_ADMINISTRADOR,
  ROLE_EMPACADOR,
  ROLE_MAESTRO,
  ROLE_OPERADOR,
  SEED_ROLES,
} from '@/lib/modules/identity';

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

const PRODUCTION_DIRS = ['lib', 'app', 'components', 'hooks'];

const IGNORED_DIRS = new Set(['node_modules', '.next', '.git', '.prisma', 'dist', '.worktrees']);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

const CATALOGO_DE_ROLES = 'lib/modules/identity/domain/roles.ts';
const CATALOGO_DE_PERMISOS = 'lib/modules/identity/domain/permissions.ts';

const CODIGO_DEL_PERMISO = 'acondicionamiento.modificar';

// Las rutas EXACTAS que nombran el permiso, ademas del catalogo. Una ruta nueva se abre aqui a mano,
// en la lista que le toca.
const CASOS_DE_USO_QUE_LO_EXIGEN = [
  'lib/modules/asignaciones/domain/finish-conditioning.ts',
  'lib/modules/asignaciones/domain/start-conditioning.ts',
  'lib/modules/asignaciones/domain/list-conditioning-orders.ts',
  'lib/modules/asignaciones/domain/list-conditioned-orders.ts',
  'lib/modules/asignaciones/domain/get-conditioning-order.ts',
  'lib/modules/asignaciones/domain/list-conditioning-team-candidates.ts',
  // 2026-10-09 (QC-219 R26): guardar los datos de lote y listar «Entregados».
  'lib/modules/asignaciones/domain/save-conditioning-batch-data.ts',
  'lib/modules/asignaciones/domain/list-delivered-conditioned-orders.ts',
] as const;

// Consumidores que no son caso de uso, cada uno con la forma exacta en que debe nombrar el permiso.
const PREDICADO_DE_VISTAS = 'lib/modules/asignaciones/domain/assignment-views.ts';
const PAGINA_DEL_DETALLE = 'app/(private)/asignacion/acondicionamiento/[id]/page.tsx';
const CONSUMIDORES_QUE_NO_SON_CASO_DE_USO = [PREDICADO_DE_VISTAS, PAGINA_DEL_DETALLE] as const;

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

const LITERAL_DEL_ROL = literalPattern(ROLE_ACONDICIONAMIENTO);
const LITERAL_DEL_PERMISO = literalPattern(CODIGO_DEL_PERMISO);

export function mentionsAcondicionamientoRoleLiteral(source: string): boolean {
  return LITERAL_DEL_ROL.test(stripComments(source));
}

export function mentionsAcondicionamientoCode(source: string): boolean {
  return LITERAL_DEL_PERMISO.test(stripComments(source));
}

function findProductionFilesWhere(root: string, test: (source: string) => boolean): readonly string[] {
  return listProductionFiles(root)
    .filter((absPath) => test(readFileSync(absPath, 'utf8')))
    .map((absPath) => toPosix(absPath.slice(root.length + 1)));
}

describe('R1 — el rol nace al final de SEED_ROLES y los otros cuatro quedan intactos', () => {
  it('R1: SEED_ROLES tiene una fila Administrador de acondicionamiento con descripcion no vacia', () => {
    const fila = SEED_ROLES.find((rol) => rol.name === ROLE_ACONDICIONAMIENTO);

    expect(fila).toBeDefined();
    expect(fila?.description.trim().length).toBeGreaterThan(0);
  });

  it('R1: Administrador, Operador, Empacador y Maestro conservan su nombre y su descripcion exactos', () => {
    const descripcionDe = (nombre: string) =>
      SEED_ROLES.find((rol) => rol.name === nombre)?.description;

    expect(ROLE_ADMINISTRADOR).toBe('Administrador');
    expect(ROLE_OPERADOR).toBe('Operador');
    expect(ROLE_EMPACADOR).toBe('Empacador');
    expect(ROLE_MAESTRO).toBe('Maestro');
    expect(descripcionDe(ROLE_ADMINISTRADOR)).toBe('Acceso total al sistema.');
    expect(descripcionDe(ROLE_OPERADOR)).toBe('Operacion del dia a dia.');
    expect(descripcionDe(ROLE_EMPACADOR)).toBe(
      'Prepara los pedidos asignados y consulta los terminados.',
    );
    expect(descripcionDe(ROLE_MAESTRO)).toBe('Dueno de la plataforma: gestiona las empresas.');
  });

  it('R1: el rol es el ultimo y los cuatro de antes conservan su orden relativo', () => {
    expect(SEED_ROLES.map((rol) => rol.name)).toEqual([
      ROLE_ADMINISTRADOR,
      ROLE_OPERADOR,
      ROLE_EMPACADOR,
      ROLE_MAESTRO,
      ROLE_ACONDICIONAMIENTO,
    ]);
  });
});

describe('R2 — el literal del rol tiene un unico dueño en produccion', () => {
  it('R2: solo aparece entre comillas en lib/modules/identity/domain/roles.ts', () => {
    const conElLiteral = findProductionFilesWhere(repoRoot, mentionsAcondicionamientoRoleLiteral);

    expect(
      conElLiteral,
      `El rol ${ROLE_ACONDICIONAMIENTO} tiene un unico dueño: ${CATALOGO_DE_ROLES}. ` +
        `Se encontro el literal tambien en: ${conElLiteral.join(', ')}. ` +
        "Importa ROLE_ACONDICIONAMIENTO del barrel '@/lib/modules/identity' en vez de repetir la cadena.",
    ).toEqual([CATALOGO_DE_ROLES]);
  });

  it('R2: dispara con un fuente sintetico que declara el literal, con cualquiera de las tres comillas', () => {
    expect(mentionsAcondicionamientoRoleLiteral(`const x = '${ROLE_ACONDICIONAMIENTO}';`)).toBe(true);
    expect(mentionsAcondicionamientoRoleLiteral(`const x = "${ROLE_ACONDICIONAMIENTO}";`)).toBe(true);
    expect(mentionsAcondicionamientoRoleLiteral(`const x = \`${ROLE_ACONDICIONAMIENTO}\`;`)).toBe(true);
  });

  it('R2: el caso simetrico: importar la constante, nombrar el literal en un comentario o el literal del Administrador no disparan', () => {
    expect(
      mentionsAcondicionamientoRoleLiteral(
        "import { ROLE_ACONDICIONAMIENTO } from '@/lib/modules/identity';",
      ),
    ).toBe(false);
    expect(
      mentionsAcondicionamientoRoleLiteral(`// el rol '${ROLE_ACONDICIONAMIENTO}' se importa, no se copia`),
    ).toBe(false);
    expect(mentionsAcondicionamientoRoleLiteral(`/* '${ROLE_ACONDICIONAMIENTO}' */ const x = 1;`)).toBe(
      false,
    );
    expect(mentionsAcondicionamientoRoleLiteral(`const x = '${ROLE_ADMINISTRADOR}';`)).toBe(false);
  });
});

describe('R3 — el rol es global: una sola fila y Role sin campo de empresa', () => {
  it('R3: el modelo Role de db/schema.prisma no declara ninguna columna de empresa', () => {
    const schema = readFileSync(join(repoRoot, 'db', 'schema.prisma'), 'utf8');
    const inicio = schema.indexOf('model Role {');
    expect(inicio).toBeGreaterThanOrEqual(0);
    const bloque = schema.slice(inicio, schema.indexOf('\n}', inicio));

    expect(bloque).toMatch(/\bname\b/);
    expect(bloque).not.toMatch(/companyId/);
    expect(bloque).not.toMatch(/company_id/);
    expect(bloque).not.toMatch(/Company/);
  });

  it('R3: SEED_ROLES declara una sola fila con el nombre del rol', () => {
    expect(SEED_ROLES.filter((rol) => rol.name === ROLE_ACONDICIONAMIENTO)).toHaveLength(1);
  });
});

describe('R17, R21 — solo el catalogo, los casos de uso del acondicionamiento y sus dos consumidores nombran acondicionamiento.modificar', () => {
  const permitidos: readonly string[] = [
    CATALOGO_DE_PERMISOS,
    ...CASOS_DE_USO_QUE_LO_EXIGEN,
    ...CONSUMIDORES_QUE_NO_SON_CASO_DE_USO,
  ];

  it('R21, R31, QC-219 R26: son once rutas exactas: el catalogo, ocho casos de uso (con los candidatos del equipo, guardar los datos de lote y «Entregados») y dos consumidores', () => {
    expect(new Set(permitidos).size).toBe(11);
  });

  it('R17, R21: el codigo solo aparece en el catalogo de permisos y en las rutas exactas abiertas', () => {
    const conElCodigo = findProductionFilesWhere(repoRoot, mentionsAcondicionamientoCode);
    const inesperados = conElCodigo.filter((ruta) => !permitidos.includes(ruta));

    expect(
      inesperados,
      `${CODIGO_DEL_PERMISO} solo puede nombrarse en ${permitidos.join(', ')}. ` +
        `Se encontro tambien en: ${inesperados.join(', ')}. ` +
        'Si eres la ficha que empieza a exigir este permiso en otro sitio, abre aqui la ruta exacta ' +
        'que lo exige. No lo conviertas en un toContain.',
    ).toEqual([]);
    // Anti-cegado: el barrido ve el catalogo y todas las rutas abiertas, y ninguna sobra.
    expect([...conElCodigo].sort()).toEqual([...permitidos].sort());
  });

  it('R17, R21: cada caso de uso abierto exige el permiso con requirePermission, no lo nombra de pasada', () => {
    for (const ruta of CASOS_DE_USO_QUE_LO_EXIGEN) {
      const fuente = readFileSync(join(repoRoot, ruta), 'utf8');
      expect(fuente, ruta).toMatch(/requirePermission\(actor, 'acondicionamiento\.modificar'\)/);
    }
  });

  it('R21: el predicado de las vistas lo consulta con hasPermission, por permiso y nunca por rol', () => {
    const fuente = stripComments(readFileSync(join(repoRoot, PREDICADO_DE_VISTAS), 'utf8'));

    expect(fuente).toMatch(/const (\w+): PermissionCode = 'acondicionamiento\.modificar'/);
    const constante = /const (\w+): PermissionCode = 'acondicionamiento\.modificar'/.exec(fuente)?.[1] ?? '';
    expect(fuente).toContain(`hasPermission(bearer, ${constante})`);
    expect(fuente).not.toMatch(/ROLE_[A-Z]+/);
  });

  it('R21: la pagina del detalle lo exige con requirePagePermission', () => {
    const fuente = readFileSync(join(repoRoot, PAGINA_DEL_DETALLE), 'utf8');

    expect(fuente).toMatch(/requirePagePermission\(['"]acondicionamiento\.modificar['"]\)/);
  });

  it('R17, R21: dispara con un fuente sintetico que exige el codigo, con cualquiera de las tres comillas', () => {
    expect(mentionsAcondicionamientoCode(`requirePermission(actor, '${CODIGO_DEL_PERMISO}')`)).toBe(true);
    expect(mentionsAcondicionamientoCode(`requirePermission(actor, "${CODIGO_DEL_PERMISO}")`)).toBe(true);
    expect(mentionsAcondicionamientoCode(`requirePermission(actor, \`${CODIGO_DEL_PERMISO}\`)`)).toBe(true);
  });

  it('R21: una ruta sintetica que nombra el codigo y no esta abierta sale como inesperada', () => {
    const sintetico = 'lib/modules/asignaciones/domain/otra-cosa.ts';
    const encontrados = [...permitidos, sintetico];

    expect(encontrados.filter((ruta) => !permitidos.includes(ruta))).toEqual([sintetico]);
    expect(mentionsAcondicionamientoCode(`requirePermission(actor, '${CODIGO_DEL_PERMISO}')`)).toBe(true);
  });

  it('R17: el caso simetrico: el codigo dentro de un comentario no es una infraccion', () => {
    expect(mentionsAcondicionamientoCode(`// exigira ${CODIGO_DEL_PERMISO} aqui`)).toBe(false);
    expect(mentionsAcondicionamientoCode(`/* '${CODIGO_DEL_PERMISO}' */ const x = 1;`)).toBe(false);
  });
});
