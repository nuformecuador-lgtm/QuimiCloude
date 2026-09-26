// La tabla compartida queda INTACTA (copia de `data-table-intacta-usuarios.test.ts`).
//
// Se prohiben DOS cosas: declarar una tabla o una barra de paginacion propias, y modificar
// cualquier archivo de `components/shared/data-table/`. Lo primero se ve por fuente —
// `clientes-convenciones.test.ts` ya comprueba que `customer-table.tsx` entra por el
// barrel compartido y no hay ninguna copia bajo la ruta—. Lo segundo es una propiedad del
// DIFF: se mide contra el merge-base con `dev`, calculado en cada ejecucion (el porque, en el
// comentario de `REFERENCIAS_DE_DEV`), y si el rango no existe el caso se SALTA con el motivo
// escrito, nunca en verde silencioso.
//
// La segunda mitad no depende de git: afirma sobre la FUENTE del contrato compartido, para que
// quede escrito que la columna de acciones de clientes cabe con lo que el contrato YA publica
// (`cell` devuelve `ReactNode`) y que nadie le anadio un mecanismo de acciones de fila.
//
// La sensibilidad de la segunda mitad se ejerce sobre un CONTRATO FABRICADO en un tmpdir, nunca
// sobre el real: se escribe una version sintetica de `data-table-types.ts` con la violacion
// dentro y se comprueba que el MISMO detector la encuentra, y que el contrato real —sin la
// violacion— sigue limpio.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, type TestContext } from 'vitest';

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

/** La UNICA carpeta que esta feature no puede tocar: la tabla compartida. */
const INTOCABLE = 'components/shared/data-table';

const REFERENCIAS_DE_DEV = ['origin/dev', 'dev'] as const;

function git(args: readonly string[]): string {
  return execFileSync('git', [...args], { cwd: repoRoot, encoding: 'utf8' });
}

/** El merge-base entre la primera referencia de `dev` disponible y `HEAD`, o `null`. */
function baseDeLaRama(): string | null {
  for (const referencia of REFERENCIAS_DE_DEV) {
    try {
      return git(['merge-base', referencia, 'HEAD']).trim();
    } catch {
      // Se prueba la siguiente referencia.
    }
  }
  return null;
}

const BASE_DE_LA_RAMA = baseDeLaRama();

const SIN_BASE =
  `ninguna de las referencias ${REFERENCIAS_DE_DEV.join(', ')} esta disponible: no se puede ` +
  'calcular el merge-base, asi que esta guardia NO ha comprobado nada';

/** Archivos cambiados bajo `rutas` respecto de `base`, contra el ARBOL DE TRABAJO. */
function archivosCambiados(base: string, rutas: readonly string[]): readonly string[] {
  return git(['diff', '--name-only', base, '--', ...rutas])
    .split('\n')
    .map((linea) => linea.trim())
    .filter((linea) => linea !== '');
}

/** Archivos NUEVOS sin seguimiento bajo `rutas`: `git diff` no los ve todavia. */
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

/**
 * LA PRECONDICION DE RAMA, copiada de `data-table-intacta-usuarios.test.ts` y de
 * `usuarios-convenciones.test.ts`: la senal es CONJUNTIVA (el `page.tsx` de la ruta de clientes
 * MAS la carpeta de spec de esta ficha), para que la guardia no acuse a una rama ajena de tocar
 * la tabla compartida cuando ni siquiera es la rama de esta pantalla.
 */
const ARCHIVO_CENTRAL_DE_QC155 = 'app/(private)/clientes/page.tsx';
const CARPETA_SPEC_DE_QC155 = 'specs/QC-155-pantalla-de-clientes/';

export function esLaRamaDeQC155(tocados: readonly string[]): boolean {
  return (
    tocados.includes(ARCHIVO_CENTRAL_DE_QC155) &&
    tocados.some((archivo) => archivo.startsWith(CARPETA_SPEC_DE_QC155))
  );
}

function saltarSiNoEsLaRamaDeQC155(ctx: Pick<TestContext, 'skip'>, base: string): void {
  const tocados = archivosCambiados(base, ['.']);

  if (tocados.length === 0) {
    ctx.skip(
      'la rama no toca ningun archivo respecto del merge-base con `dev`: no hay diff que revisar, ' +
        'asi que este caso NO ha comprobado nada. Ocurre al correr el gate sobre `dev` con el ' +
        'arbol limpio.',
    );
    return;
  }

  if (!esLaRamaDeQC155(tocados)) {
    ctx.skip(
      'el rango no trae a la vez `' +
        ARCHIVO_CENTRAL_DE_QC155 +
        '` y `' +
        CARPETA_SPEC_DE_QC155 +
        '`: esta NO es la rama de QC-155, asi que este caso NO ha comprobado nada. R9 es el ' +
        'alcance de ESA ficha y no le aplica a ninguna otra.',
    );
  }
}

describe('esta feature no abre la tabla compartida (R9)', () => {
  it('ningun archivo de `components/shared/data-table/` cambia', (ctx) => {
    if (BASE_DE_LA_RAMA === null) {
      ctx.skip(SIN_BASE);
      return;
    }
    saltarSiNoEsLaRamaDeQC155(ctx, BASE_DE_LA_RAMA);

    const tocados = [
      ...archivosCambiados(BASE_DE_LA_RAMA, [INTOCABLE]),
      ...archivosSinSeguimiento([INTOCABLE]),
    ];

    expect(tocados, `QC-155 modifico la tabla compartida: ${tocados.join(', ')}`).toEqual([]);
  });

  it('el detector muerde: comparando la carpeta de la pantalla, el diff NO sale vacio', (ctx) => {
    if (BASE_DE_LA_RAMA === null) {
      ctx.skip(SIN_BASE);
      return;
    }
    saltarSiNoEsLaRamaDeQC155(ctx, BASE_DE_LA_RAMA);

    const cambiados = archivosCambiados(BASE_DE_LA_RAMA, ['app/(private)/clientes']);
    expect(cambiados.length).toBeGreaterThan(0);
  });
});

describe('la tabla compartida no gana ningun mecanismo nuevo de acciones de fila (R9)', () => {
  it('su contrato no declara `renderRowActions` ni ninguna prop equivalente', () => {
    const contrato = fuenteSinComentarios('components/shared/data-table/data-table-types.ts');

    for (const prohibida of ['renderRowActions', 'rowActions', 'actionsColumn', 'renderActions', 'rowActionsRenderer']) {
      expect(contrato, `el contrato compartido no debe declarar ${prohibida}`).not.toContain(prohibida);
    }
  });

  it('el barrel publico no exporta ninguna pieza de acciones de fila', () => {
    const barrel = fuenteSinComentarios('components/shared/data-table/index.ts');

    expect(barrel.toLowerCase()).not.toContain('rowaction');
    expect(barrel.toLowerCase()).not.toContain('renderactions');
  });

  it('la columna de acciones de clientes cabe con lo que el contrato YA publica: `cell` devuelve ReactNode', () => {
    const contrato = fuenteSinComentarios('components/shared/data-table/data-table-types.ts');

    expect(contrato).toContain('cell: (row: TRow) => ReactNode');
    expect(contrato).toContain('pinnable?: boolean');
  });

  it('sensibilidad: un contrato FABRICADO en un tmpdir con `renderRowActions` dispara la misma comprobacion', () => {
    const detectaMecanismoNuevo = (contrato: string): string[] =>
      ['renderRowActions', 'rowActions', 'actionsColumn', 'renderActions', 'rowActionsRenderer'].filter(
        (prohibida) => contrato.includes(prohibida),
      );

    const raiz = mkdtempSync(join(tmpdir(), 'qc155-data-table-intacta-'));
    try {
      const contratoConMecanismoNuevo = [
        'export type DataTableColumn<TRow> = {',
        '  readonly cell: (row: TRow) => ReactNode;',
        '  readonly renderRowActions?: (row: TRow) => ReactNode;',
        '};',
      ].join('\n');
      const rutaFabricada = join(raiz, 'data-table-types.ts');
      writeFileSync(rutaFabricada, contratoConMecanismoNuevo);

      const hallazgos = detectaMecanismoNuevo(readFileSync(rutaFabricada, 'utf8'));
      expect(hallazgos).toContain('renderRowActions');

      // El caso simetrico: el contrato REAL, sin la violacion, no dispara nada.
      const contratoReal = fuenteSinComentarios('components/shared/data-table/data-table-types.ts');
      expect(detectaMecanismoNuevo(contratoReal)).toEqual([]);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });
});
