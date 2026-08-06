#!/usr/bin/env node
/**
 * `pnpm run test:rapido` — el gate de cerrar tanda (`docs/verification.md`).
 *
 * Corre DOS cosas, y las dos importan:
 *   1. Los tests que el GRAFO DE IMPORTS relaciona con el diff contra `origin/dev`,
 *      calculado con TRES puntos (merge-base), no contra el ultimo commit: una tanda de
 *      tres commits mirando solo el tercero es un agujero.
 *   2. TODAS las guardias (patron `guard`), siempre. Las guardias recorren el arbol de
 *      archivos en vez de importar lo que vigilan, asi que ningun grafo las selecciona.
 *
 * Sale en verde cuando la seleccion esta vacia (`--passWithNoTests`): hoy no hay guardias
 * y el diff puede no tocar ningun archivo con tests. "Sin tests seleccionados" no es un
 * fallo; un fallo es un test rojo.
 *
 * Node y no bash a proposito: este repo se trabaja tambien desde Windows.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

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

function runVitest(args, label) {
  console.log(`\n[test:rapido] ${label}`);
  console.log(`[test:rapido] -> vitest ${args.join(' ')}`);
  const result = spawnSync(process.execPath, [VITEST_BIN, ...args], { stdio: 'inherit' });
  return result.status ?? 1;
}

const files = changedFiles();

let status = 0;

if (files.length === 0) {
  console.log(`[test:rapido] el diff vs ${BASE_REF} no toca codigo con tests: nada que relacionar.`);
} else {
  status = runVitest(
    ['related', '--run', '--passWithNoTests', ...files],
    `tests relacionados con ${files.length} archivo(s) del diff vs ${BASE_REF}`,
  );
}

if (status === 0) {
  status = runVitest(['run', 'guard', '--passWithNoTests'], 'todas las guardias');
}

process.exit(status);
