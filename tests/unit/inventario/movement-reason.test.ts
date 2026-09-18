// Barrido de fuentes: prueba que anadir un motivo no exige tocar ninguna otra fuente (R9), no
// solo que la constante tenga cuatro valores.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { MOVEMENT_REASONS, type MovementReason } from '@/lib/modules/inventario/domain/movement-reason';

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

const IGNORED_DIRS = new Set(['node_modules', '.next', '.git', '.prisma', 'dist', '.worktrees']);
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const SCAN_ROOTS = ['app', 'lib'];
const OWN_FILE = 'lib/modules/inventario/domain/movement-reason.ts';

function toPosix(file: string): string {
  return file.split(sep).join('/').split('\\').join('/');
}

function listSourceFiles(dir: string): readonly string[] {
  let names: readonly string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names.flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      return IGNORED_DIRS.has(name) ? [] : listSourceFiles(full);
    }
    return SOURCE_EXTENSIONS.has(extname(name)) ? [full] : [];
  });
}

type SourceFile = { relPath: string; content: string };

function readSourceFiles(): readonly SourceFile[] {
  return SCAN_ROOTS.flatMap((root) =>
    listSourceFiles(join(repoRoot, root)).map((absPath) => ({
      relPath: toPosix(relative(repoRoot, absPath)),
      content: readFileSync(absPath, 'utf8'),
    })),
  );
}

/** Un archivo enumera los motivos a mano si repite al menos dos literales del conjunto cerrado. */
function findHardcodedReasonFindings(files: readonly SourceFile[]): readonly string[] {
  return files
    .filter((file) => file.relPath !== OWN_FILE)
    .flatMap((file) => {
      const literales = MOVEMENT_REASONS.filter((reason) =>
        new RegExp(`['"\`]${reason}['"\`]`).test(file.content),
      );
      return literales.length >= 2
        ? [`${file.relPath}: enumera los motivos a mano (${literales.join(', ')})`]
        : [];
    });
}

describe('movement-reason', () => {
  it('declara el conjunto cerrado y su tipo derivado', () => {
    const motivos: readonly string[] = MOVEMENT_REASONS;
    expect(motivos).toEqual(['merma', 'rotura', 'conteo_fisico', 'error_de_carga']);
    const motivo: MovementReason = 'merma';
    expect(MOVEMENT_REASONS).toContain(motivo);
  });

  it('muerde: una fuente fabricada que enumera dos o mas motivos a mano', () => {
    const hallazgos = findHardcodedReasonFindings([
      {
        relPath: 'lib/modules/inventario/domain/otra-cosa.ts',
        content: `const motivos = ['merma', 'rotura', 'conteo_fisico', 'error_de_carga'];`,
      },
    ]);
    expect(hallazgos).toEqual([
      "lib/modules/inventario/domain/otra-cosa.ts: enumera los motivos a mano (merma, rotura, conteo_fisico, error_de_carga)",
    ]);
  });

  it('limpio: una fuente fabricada que importa el conjunto en vez de repetirlo', () => {
    const hallazgos = findHardcodedReasonFindings([
      {
        relPath: 'lib/modules/inventario/domain/otra-cosa.ts',
        content: `import { MOVEMENT_REASONS } from './movement-reason';\nconst schema = z.enum(MOVEMENT_REASONS);`,
      },
    ]);
    expect(hallazgos).toEqual([]);
  });

  it('R9 — ninguna fuente bajo app/ ni lib/ enumera los motivos a mano: todo consumidor deriva de la constante', () => {
    expect(findHardcodedReasonFindings(readSourceFiles())).toEqual([]);
  });
});
