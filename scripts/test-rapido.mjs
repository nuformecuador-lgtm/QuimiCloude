#!/usr/bin/env node
/**
 * `pnpm run test:rapido` — el gate de cerrar tanda (`docs/gate.md`).
 *
 * Corre DOS cosas, y las dos importan:
 *   1. Los tests que el GRAFO DE IMPORTS relaciona con el diff contra `origin/dev`,
 *      calculado con TRES puntos (merge-base), no contra el ultimo commit: una tanda de
 *      tres commits mirando solo el tercero es un agujero.
 *   2. TODAS las guardias (patron `guard`), siempre. Las guardias recorren el arbol de
 *      archivos en vez de importar lo que vigilan, asi que ningun grafo las selecciona.
 *
 * Sale en verde cuando la seleccion esta vacia (`--passWithNoTests`): el diff puede no tocar
 * ningun archivo con tests, y un repo recien montado puede no tener guardias. "Sin tests seleccionados" no es un
 * fallo; un fallo es un test rojo.
 *
 * Node y no bash a proposito: este repo se trabaja tambien desde Windows.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

// Se invoca el CLI de vitest con `node <bin>` y SIN shell a proposito: con `shell: true`,
// cmd.exe parte las rutas con parentesis (`app/(public)/layout.tsx`) y el comando revienta.
const require = createRequire(import.meta.url);
const VITEST_BIN = path.join(path.dirname(require.resolve('vitest/package.json')), 'vitest.mjs');

// La rama de integracion sale del perfil (`arnes.config.json > ramas.integracion`).
function ramaDeIntegracion() {
  try {
    return JSON.parse(readFileSync('arnes.config.json', 'utf8')).ramas?.integracion ?? 'dev';
  } catch {
    return 'dev';
  }
}
const BASE_REF = process.env.TEST_RAPIDO_BASE ?? `origin/${ramaDeIntegracion()}`;

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

// Rojos heredados (`tests/baseline-rojos.json`): deuda AJENA ya registrada. El modo rapido no compara
// contra el baseline como el completo, asi que sin esto bastaba con tocar un archivo de la lista
// (un comentario, una cita) para que el gate local saliera rojo por algo que no es tuyo. Se
// excluyen de la seleccion y se dice cuales; el CI los sigue corriendo y comparando.
function rojosHeredados() {
  try {
    return Object.keys(JSON.parse(readFileSync('tests/baseline-rojos.json', 'utf8')).archivos ?? {});
  } catch {
    return [];
  }
}
const HEREDADOS = rojosHeredados();
const EXCLUIR = HEREDADOS.flatMap((f) => ['--exclude', f]);

// Un test heredado que esta en el diff entraria por nombre aunque se excluya por glob: fuera tambien.
const files = changedFiles().filter((f) => !HEREDADOS.includes(f));

let status = 0;

if (files.length === 0) {
  console.log(`[test:rapido] el diff vs ${BASE_REF} no toca codigo con tests: nada que relacionar.`);
} else {
  status = runVitest(
    ['related', '--run', '--passWithNoTests', ...EXCLUIR, ...files],
    `tests relacionados con ${files.length} archivo(s) del diff vs ${BASE_REF}`,
  );
}

if (status === 0) {
  status = runVitest(['run', 'guard', '--passWithNoTests', ...EXCLUIR], 'todas las guardias');
}

if (HEREDADOS.length > 0) {
  console.log(`
[test:rapido] ${HEREDADOS.length} rojo(s) heredado(s) del baseline excluidos de esta seleccion; el CI los compara.`);
}
process.exit(status);
