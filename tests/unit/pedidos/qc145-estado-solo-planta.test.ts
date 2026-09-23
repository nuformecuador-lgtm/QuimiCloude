// Test de fuente: quien escribe la fecha de terminado y el estado del pedido, y el alcance del
// esquema y las dependencias. Mismo patron que `tests/unit/identity/roles/empacador-rol.test.ts`
// (barrido de `lib/**` sobre el fuente sin comentarios) y `tests/unit/identity/qc78-alcance.test.ts`
// (diff contra la base de fusion con `origin/dev`).

import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { PERMISSIONS } from '@/lib/modules/identity';

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

// -------------------------------------------------------------------------------------------
// Barrido de fuente sobre lib/** (mismo idioma que empacador-rol.test.ts)
// -------------------------------------------------------------------------------------------

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

/** Solo `lib/**`: el alcance exacto que citan R5 y R10. */
function listLibFiles(root: string): readonly string[] {
  return listSourceFiles(join(root, 'lib'));
}

/**
 * Comentarios de LINEA primero, de BLOQUE despues (mismo orden que `empacador-rol.test.ts`: al
 * reves, un comentario de linea con una apertura de bloque se traga codigo real).
 */
export function stripComments(source: string): string {
  return source
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/**
 * Extrae, del fuente ya sin comentarios, el texto balanceado en llaves de cada bloque que sigue
 * a la palabra `data:` -la forma exacta en que Prisma recibe lo que escribe en `create`,
 * `update`, `updateMany`, `createMany` y `upsert` en este repo (comprobado: `createOrder` usa
 * SQL crudo con `VALUES (...)`, sin `data:`, asi que no aparece aqui y no hace falta excluirlo
 * a mano).
 */
export function extractDataBlocks(source: string): readonly string[] {
  const codigo = stripComments(source);
  const blocks: string[] = [];
  const marker = /\bdata\s*:\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(codigo)) !== null) {
    const start = match.index + match[0].length - 1; // posicion de la '{' de apertura
    let depth = 0;
    let end = start;
    for (let i = start; i < codigo.length; i += 1) {
      if (codigo[i] === '{') depth += 1;
      else if (codigo[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    blocks.push(codigo.slice(start, end + 1));
  }
  return blocks;
}

type Hallazgo = { readonly ruta: string; readonly bloques: readonly string[] };

/** Archivos de `lib/**` (ruta relativa POSIX) cuyos bloques `data:` cumplen `predicate`. */
function findDataBlockMatches(
  root: string,
  predicate: (block: string) => boolean,
): readonly Hallazgo[] {
  return listLibFiles(root)
    .map((absPath) => {
      const bloques = extractDataBlocks(readFileSync(absPath, 'utf8')).filter(predicate);
      return { ruta: toPosix(absPath.slice(root.length + 1)), bloques };
    })
    .filter((hallazgo) => hallazgo.bloques.length > 0);
}

const ORDER_CATALOG_PRISMA = 'lib/modules/pedidos/adapters/driven/persistence/order-catalog-prisma.ts';
const ORDER_PRISMA = 'lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts';

describe('R5 — finishedAt/finished_at solo se escribe en transitionAliveOrder', () => {
  it('ningun bloque `data:` de lib/** fuera de order-catalog-prisma.ts nombra finishedAt/finished_at', () => {
    const conLaColumna = findDataBlockMatches(repoRoot, (block) => /finishedAt|finished_at/.test(block));

    expect(
      conLaColumna.map((hallazgo) => hallazgo.ruta),
      conLaColumna.length === 1 && conLaColumna[0]?.ruta === ORDER_CATALOG_PRISMA
        ? undefined
        : 'finishedAt/finished_at solo puede escribirse en el `data:` de transitionAliveOrder ' +
            `(${ORDER_CATALOG_PRISMA}). Se encontro tambien en, o en un numero distinto de bloques ` +
            `de ese archivo: ${JSON.stringify(conLaColumna)}.`,
    ).toEqual([ORDER_CATALOG_PRISMA]);
  });

  it('order-catalog-prisma.ts tiene exactamente un bloque `data:` que nombra finishedAt (el de transitionAliveOrder)', () => {
    const fuente = readFileSync(join(repoRoot, ORDER_CATALOG_PRISMA), 'utf8');
    const bloques = extractDataBlocks(fuente).filter((block) => /finishedAt/.test(block));

    expect(bloques).toHaveLength(1);
    expect(bloques[0]).toMatch(/status\s*:\s*to\b/);
  });

  it('las escrituras conocidas que R5 nombra -create, updateAliveOrder, cancelAliveOrder, softDeleteAliveOrder- no llevan finishedAt', () => {
    const fuente = readFileSync(join(repoRoot, ORDER_PRISMA), 'utf8');
    const bloques = extractDataBlocks(fuente);

    expect(bloques.length).toBeGreaterThan(0);
    for (const bloque of bloques) {
      expect(bloque).not.toMatch(/finishedAt|finished_at/);
    }
  });

  it('dispara con un fuente sintetico que escribe finishedAt en un data de create/update', () => {
    const sintetico = "prisma.order.update({ where: { id }, data: { finishedAt: now } });";
    const bloques = extractDataBlocks(sintetico).filter((block) => /finishedAt/.test(block));

    expect(bloques).toHaveLength(1);
  });

  it('el caso simetrico: el mismo nombre dentro de un comentario, o fuera de un `data:`, no cuenta', () => {
    const sintetico =
      '// finishedAt se escribe en otra parte\nconst finishedAt = row.finishedAt;\nprisma.order.update({ where: { id }, data: { status: to } });';

    const bloques = extractDataBlocks(sintetico).filter((block) => /finishedAt/.test(block));

    expect(bloques).toHaveLength(0);
  });
});

describe('R10 — EN_CURSO/ENTREGADO solo los escribe transitionAliveOrder; updateAliveOrder ya no escribe status', () => {
  it('ningun bloque `data:` de lib/** fija status a mano en EN_CURSO ni ENTREGADO', () => {
    // El patron busca `status: 'EN_CURSO'` o `status: 'ENTREGADO'` como VALOR escrito, no
    // cualquier mencion del literal: `...(to === 'ENTREGADO' ? { finishedAt: now } : {})` de
    // transitionAliveOrder es una COMPARACION dentro del mismo bloque `data:`, no una escritura
    // de `status` a mano, y no debe disparar esta regla (el caso simetrico, mas abajo, lo fija).
    const conElLiteral = findDataBlockMatches(repoRoot, (block) =>
      /\bstatus\s*:\s*['"`](EN_CURSO|ENTREGADO)['"`]/.test(block),
    );

    expect(
      conElLiteral,
      conElLiteral.length === 0
        ? undefined
        : 'Ningun `data:` de lib/** debe fijar EN_CURSO/ENTREGADO como literal: ' +
            'transitionAliveOrder los recibe parametrizados (`status: to`), nunca a mano. ' +
            `Se encontro en: ${JSON.stringify(conElLiteral)}.`,
    ).toEqual([]);
  });

  it('transitionAliveOrder (order-catalog-prisma.ts) es el unico bloque `data:` de ese archivo que fija `status`', () => {
    const fuente = readFileSync(join(repoRoot, ORDER_CATALOG_PRISMA), 'utf8');
    const bloques = extractDataBlocks(fuente);
    const conStatus = bloques.filter((block) => /\bstatus\s*:/.test(block));

    expect(conStatus).toHaveLength(1);
    expect(conStatus[0]).toMatch(/status\s*:\s*to\b/);
  });

  it('updateAliveOrder ya no escribe status: su bloque `data:` en order-prisma.ts no lleva la clave', () => {
    const fuente = readFileSync(join(repoRoot, ORDER_PRISMA), 'utf8');
    const inicio = fuente.indexOf('export async function updateAliveOrder');
    expect(inicio).toBeGreaterThanOrEqual(0);
    const finFuncion = fuente.indexOf('\n}', inicio);
    const cuerpo = fuente.slice(inicio, finFuncion);
    const bloques = extractDataBlocks(cuerpo);

    expect(bloques).toHaveLength(1);
    expect(bloques[0]).not.toMatch(/\bstatus\s*:/);
  });

  it('cancelAliveOrder si escribe status, pero solo el literal CANCELADO, nunca EN_CURSO ni ENTREGADO', () => {
    const fuente = readFileSync(join(repoRoot, ORDER_PRISMA), 'utf8');
    const inicio = fuente.indexOf('export async function cancelAliveOrder');
    expect(inicio).toBeGreaterThanOrEqual(0);
    const finFuncion = fuente.indexOf('\n}', inicio);
    const cuerpo = fuente.slice(inicio, finFuncion);
    const bloques = extractDataBlocks(cuerpo).filter((block) => /\bstatus\s*:/.test(block));

    expect(bloques).toHaveLength(1);
    expect(bloques[0]).toMatch(/status\s*:\s*['"`]CANCELADO['"`]/);
    expect(bloques[0]).not.toMatch(/['"`](EN_CURSO|ENTREGADO)['"`]/);
  });

  it('arrancar (start-assigned-order.ts) y finalizar (finish-assigned-order.ts) solo llaman al puerto, nunca a prisma directamente', () => {
    for (const ruta of [
      'lib/modules/asignaciones/domain/start-assigned-order.ts',
      'lib/modules/asignaciones/domain/finish-assigned-order.ts',
    ]) {
      const fuente = stripComments(readFileSync(join(repoRoot, ruta), 'utf8'));
      expect(fuente).not.toMatch(/\bprisma\./);
      expect(fuente).toMatch(/\.transitionAliveById\(/);
    }
  });

  it('dispara con un fuente sintetico que fija EN_CURSO a mano en un data de escritura', () => {
    const sintetico = "prisma.order.updateMany({ where: { id }, data: { status: 'EN_CURSO' } });";
    const hallado = extractDataBlocks(sintetico).some((block) =>
      /\bstatus\s*:\s*['"`](EN_CURSO|ENTREGADO)['"`]/.test(block),
    );

    expect(hallado).toBe(true);
  });

  it('el caso simetrico: comparar `to` contra ENTREGADO dentro del mismo `data:` no es una escritura a mano', () => {
    const sintetico =
      "prisma.order.updateMany({ where: { id }, data: { status: to, ...(to === 'ENTREGADO' ? { finishedAt: now } : {}) } });";
    const hallado = extractDataBlocks(sintetico).some((block) =>
      /\bstatus\s*:\s*['"`](EN_CURSO|ENTREGADO)['"`]/.test(block),
    );

    expect(hallado).toBe(false);
  });
});

// -------------------------------------------------------------------------------------------
// R16 — el catalogo sigue en 16 permisos
// -------------------------------------------------------------------------------------------

describe('R16 — el catalogo de permisos sigue en dieciseis codigos', () => {
  it('PERMISSIONS tiene exactamente 16 entradas', () => {
    expect(PERMISSIONS).toHaveLength(16);
  });

  it('PERMISSIONS no repite ningun codigo', () => {
    const codigos = PERMISSIONS.map((permiso) => permiso.code);
    expect(new Set(codigos).size).toBe(codigos.length);
  });
});

// -------------------------------------------------------------------------------------------
// R29 — sin dependencias nuevas ni tablas nuevas, comparado contra origin/dev
// -------------------------------------------------------------------------------------------

function git(comando: string): string {
  return execSync(comando, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

/** El `package.json` de la base de fusion con `origin/dev`, o `null` si no se puede leer sin red. */
function packageJsonDeDev(): { dependencies: Record<string, string>; devDependencies: Record<string, string> } | null {
  try {
    const base = git('git merge-base origin/dev HEAD').trim();
    const contenido = git(`git show ${base}:package.json`);
    return JSON.parse(contenido) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
  } catch {
    return null;
  }
}

function paquetesDe(pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }): Set<string> {
  return new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]);
}

describe('R29 — package.json sin dependencias nuevas respecto a origin/dev', () => {
  it('ningun paquete de dependencies/devDependencies actual falta en la base de fusion con origin/dev', () => {
    const deDev = packageJsonDeDev();
    if (deDev === null) {
      // «No puedo mirar» no es un verde silencioso: se reporta y se detiene el caso, sin fingir
      // que la comparacion se hizo.
      throw new Error(
        'No se pudo leer package.json de la base de fusion con origin/dev ' +
          '(`git merge-base origin/dev HEAD` + `git show <base>:package.json`), asi que R29 ' +
          'no se ha comprobado en este caso.',
      );
    }

    const actual = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    const nuevos = [...paquetesDe(actual)].filter((nombre) => !paquetesDe(deDev).has(nombre)).sort();

    expect(
      nuevos,
      nuevos.length === 0
        ? undefined
        : `Esta ficha no debe anadir dependencias (R29). Nuevas respecto a origin/dev: ${nuevos.join(', ')}.`,
    ).toEqual([]);
  });
});

describe('R29 — el esquema no gana modelos ni tablas: el unico cambio es la columna de R1', () => {
  /** Nombres de `model X {` del esquema, en el texto dado. */
  function modelosDe(schema: string): string[] {
    return [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((match) => match[1] as string).sort();
  }

  it('los modelos de db/schema.prisma son los mismos que en la base de fusion con origin/dev', () => {
    let modelosDev: string[];
    try {
      const base = git('git merge-base origin/dev HEAD').trim();
      modelosDev = modelosDe(git(`git show ${base}:db/schema.prisma`));
    } catch (error) {
      throw new Error(
        'No se pudo leer db/schema.prisma de la base de fusion con origin/dev, asi que la ' +
          `parte de esquema de R29 no se ha comprobado en este caso. Causa: ${String(error)}`,
      );
    }

    const modelosActuales = modelosDe(readFileSync(join(repoRoot, 'db', 'schema.prisma'), 'utf8'));

    expect(modelosActuales).toEqual(modelosDev);
  });

  it('dispara con un esquema sintetico que gana un modelo respecto del de referencia', () => {
    function modelosDe(schema: string): string[] {
      return [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((match) => match[1] as string).sort();
    }

    const referencia = 'model Order {\n  id String\n}\n';
    const conModeloNuevo = referencia + '\nmodel OrderFinishedLog {\n  id String\n}\n';

    expect(modelosDe(conModeloNuevo)).not.toEqual(modelosDe(referencia));
  });
});
