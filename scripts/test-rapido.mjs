#!/usr/bin/env node
/**
 * `pnpm run test:rapido` — el gate de cerrar tanda (`docs/verification.md`).
 *
 * Corre DOS cosas, y las dos importan:
 *   1. Los tests que tocan de cerca el diff contra `origin/dev`: los del propio diff, los que
 *      IMPORTAN DIRECTAMENTE un archivo cambiado y los de la carpeta de cada modulo tocado
 *      (reglas en `test-rapido-seleccion.mjs`). No el grafo de imports entero: eso arrastraba
 *      media suite y el rapido dejaba de serlo. El diff va con TRES puntos (merge-base), no
 *      contra el ultimo commit: una tanda de tres commits mirando solo el tercero es un agujero.
 *   2. TODAS las guardias (patron `guard`), siempre. Las guardias recorren el arbol de
 *      archivos en vez de importar lo que vigilan, asi que ninguna seleccion por imports
 *      las encuentra.
 *
 * Sale en verde cuando la seleccion esta vacia (`--passWithNoTests`): el diff puede no tocar
 * ningun archivo con tests. "Sin tests seleccionados" no es un fallo; un fallo es un test rojo.
 *
 * Node y no bash a proposito: este repo se trabaja tambien desde Windows.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { porImportODiff, seleccionarTests } from './test-rapido-seleccion.mjs';

// Se invoca el CLI de vitest con `node <bin>` y SIN shell a proposito: con `shell: true`,
// cmd.exe parte las rutas con parentesis (`app/(public)/layout.tsx`) y el comando revienta.
const require = createRequire(import.meta.url);
const VITEST_BIN = path.join(path.dirname(require.resolve('vitest/package.json')), 'vitest.mjs');

const BASE_REF = process.env.TEST_RAPIDO_BASE ?? 'origin/dev';

/** Ficheros del diff vs `BASE_REF` (tres puntos) que siguen existiendo en disco. */
function changedFiles() {
  const revParse = spawnSync('git', ['rev-parse', '--verify', '--quiet', BASE_REF], {
    encoding: 'utf8',
  });
  if (revParse.status !== 0) {
    console.log(`[test:rapido] '${BASE_REF}' no existe; se omite la seleccion por diff.`);
    return [];
  }

  const diff = spawnSync('git', ['diff', '--name-only', `${BASE_REF}...HEAD`], {
    encoding: 'utf8',
  });
  if (diff.status !== 0) {
    console.log(`[test:rapido] no se pudo calcular el diff vs ${BASE_REF}; se omite.`);
    return [];
  }

  return diff.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((file) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file))
    .filter((file) => existsSync(file));
}

/** Todos los `*.test.ts` / `*.test.tsx` bajo `tests/`, en posix y relativos a la raiz. */
function testFiles() {
  if (!existsSync('tests')) return [];
  return readdirSync('tests', { recursive: true })
    .map((entry) => path.posix.join('tests', String(entry).replace(/\\/g, '/')))
    .filter((file) => /\.test\.tsx?$/.test(file));
}

function runVitest(args, label) {
  console.log(`\n[test:rapido] ${label}`);
  console.log(`[test:rapido] -> vitest ${args.join(' ')}`);
  const result = spawnSync(process.execPath, [VITEST_BIN, ...args], { stdio: 'inherit' });
  return result.status ?? 1;
}

const files = changedFiles();

let status = 0;

if (files.length === 0) {
  console.log(`[test:rapido] el diff vs ${BASE_REF} no toca codigo: nada que seleccionar.`);
} else {
  const tests = testFiles();
  const leer = (file) => readFileSync(file, 'utf8');
  const seleccion = seleccionarTests({ cambiados: files, tests, leer });
  const directos = porImportODiff({ cambiados: files, tests, leer }).length;

  if (seleccion.length === 0) {
    console.log(
      `[test:rapido] ningun test importa directamente los ${files.length} archivo(s) del diff vs ${BASE_REF}.`,
    );
  } else {
    console.log(
      `[test:rapido] ${seleccion.length} test(s): ${directos} por import directo o del diff + ${seleccion.length - directos} por carpeta de modulo`,
    );
    status = runVitest(
      ['run', '--passWithNoTests', ...seleccion],
      `tests seleccionados para ${files.length} archivo(s) del diff vs ${BASE_REF}`,
    );
  }
}

if (status === 0) {
  status = runVitest(['run', 'guard', '--passWithNoTests'], 'todas las guardias');
}

process.exit(status);
