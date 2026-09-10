// QC-39 T7 — La tabla compartida y las primitivas quedan INTACTAS: R15, R31, R45, R47.
//
// Lo que esta guardia promete no se ve renderizando: es una propiedad del **cambio**, no del
// arbol. R31 prohibe anadir a `components/shared/data-table/` ninguna propiedad ni mecanismo nuevo
// para pintar acciones de fila —la columna de acciones es una columna normal cuyo `cell` devuelve
// `ReactNode`— y R45 prohibe escribir o editar a mano nada de `components/ui/`. Las dos cosas se
// comprueban sobre el diff contra la RAMA BASE de la feature, igual que
// `tests/unit/unidades/modulo-intacto.test.ts`, que es el hermano de esta guardia en la capa del
// modulo.
//
// El diff se hace contra el ARBOL DE TRABAJO —no contra `HEAD`—, asi que una modificacion sin
// commitear tambien cae. Si el commit base no esta disponible donde corre la suite, el caso se
// SALTA de forma explicita y ruidosa con `ctx.skip(...)`: no pasa en silencio.
//
// La segunda mitad no depende de git: se afirma sobre la FUENTE del contrato compartido, que es lo
// que de verdad consume la pantalla.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/** Sube desde este archivo hasta la raiz del repo (la carpeta con `package.json`). Aqui la «raiz»
 *  puede ser un WORKTREE, donde `.git` es un archivo y no una carpeta; los comandos de git
 *  funcionan igual porque comparten la base de objetos. */
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

/**
 * La RAMA BASE de esta feature: `origin/dev` en el momento de montar el worktree. Es un commit y no
 * una referencia movil, para que el criterio no cambie por debajo si `origin/dev` avanza mientras
 * la rama esta viva. La misma que usa `tests/unit/unidades/modulo-intacto.test.ts`.
 */
const RAMA_BASE = '516e9c0';

/** Las dos carpetas que esta feature NO puede tocar (R31, R45, R47). */
const INTOCABLES = ['components/shared/data-table', 'components/ui'] as const;

function git(args: readonly string[]): string {
  return execFileSync('git', [...args], { cwd: repoRoot, encoding: 'utf8' });
}

/** `true` si el commit base esta disponible aqui; si no, los casos que dependen de el se saltan. */
function baseDisponible(): boolean {
  try {
    git(['rev-parse', '--verify', `${RAMA_BASE}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

function archivosCambiados(rutas: readonly string[]): readonly string[] {
  return git(['diff', '--name-only', RAMA_BASE, '--', ...rutas])
    .split('\n')
    .map((linea) => linea.trim())
    .filter((linea) => linea !== '');
}

/**
 * Archivos NUEVOS sin seguimiento bajo `rutas`. `git diff` no los ve —todavia no estan en el
 * indice—, asi que escribir a mano un primitivo en `components/ui/` se colaria si solo se mirara el
 * diff. Aqui se miran tambien, que es justo la tentacion que R45 vigila.
 */
function archivosSinSeguimiento(rutas: readonly string[]): readonly string[] {
  return git(['ls-files', '--others', '--exclude-standard', '--', ...rutas])
    .split('\n')
    .map((linea) => linea.trim())
    .filter((linea) => linea !== '');
}

/** Texto del archivo sin comentarios: una palabra citada en un comentario no es codigo. */
function fuenteSinComentarios(ruta: string): string {
  return readFileSync(join(repoRoot, ruta), 'utf8')
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

describe('esta feature no abre la tabla compartida ni las primitivas (R31, R45)', () => {
  it('ningun archivo de `components/shared/data-table/` ni de `components/ui/` cambia', (ctx) => {
    if (!baseDisponible()) {
      ctx.skip(`el commit base ${RAMA_BASE} no esta disponible: no se puede comparar el diff`);
      return;
    }

    const tocados = [...archivosCambiados(INTOCABLES), ...archivosSinSeguimiento(INTOCABLES)];

    expect(tocados, `QC-39 modifico archivos intocables: ${tocados.join(', ')}`).toEqual([]);
  });

  it('el detector muerde: comparando la carpeta de la pantalla, el diff NO sale vacio', (ctx) => {
    if (!baseDisponible()) {
      ctx.skip(`el commit base ${RAMA_BASE} no esta disponible: no se puede comparar el diff`);
      return;
    }

    // El caso simetrico, para que «lista vacia» no pueda serlo por vacuidad —por ejemplo porque el
    // `--` estuviera mal puesto y git no mirara nada—. La carpeta de la pantalla SI cambio respecto
    // a la rama base: las piezas puras de T5 y T6 ya estan ahi.
    const cambiados = archivosCambiados(['app/(private)/configuracion/unidades']);

    expect(cambiados.length).toBeGreaterThan(0);
  });
});

describe('la tabla compartida no gana ningun mecanismo nuevo de acciones de fila (R31)', () => {
  it('su contrato no declara `renderRowActions` ni ninguna prop equivalente', () => {
    const contrato = fuenteSinComentarios('components/shared/data-table/data-table-types.ts');

    for (const prohibida of [
      'renderRowActions',
      'rowActions',
      'actionsColumn',
      'renderActions',
      'rowActionsRenderer',
    ]) {
      expect(contrato, `el contrato compartido no debe declarar ${prohibida}`).not.toContain(
        prohibida,
      );
    }
  });

  it('el barrel publico no exporta ninguna pieza de acciones de fila', () => {
    const barrel = fuenteSinComentarios('components/shared/data-table/index.ts');

    expect(barrel.toLowerCase()).not.toContain('rowaction');
    expect(barrel.toLowerCase()).not.toContain('renderactions');
  });

  it('la columna de acciones cabe con lo que el contrato YA publica: `cell` devuelve ReactNode', () => {
    const contrato = fuenteSinComentarios('components/shared/data-table/data-table-types.ts');

    expect(contrato).toContain('cell: (row: TRow) => ReactNode');
    expect(contrato).toContain('pinnable?: boolean');
  });
});
