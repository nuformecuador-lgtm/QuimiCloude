// QC-45 T4 — La tabla compartida y las primitivas quedan INTACTAS: R20, R31, R33.
//
// Lo que esta guardia promete no se ve renderizando: es una propiedad del **cambio**, no del
// arbol. R20 prohibe anadir a `components/shared/data-table/` ninguna propiedad ni mecanismo nuevo
// para pintar acciones de fila —la columna de acciones es una columna normal cuyo `cell` devuelve
// `ReactNode`—, y R31/R33 prohiben tocar `components/ui/`. Las dos cosas se comprueban sobre el
// diff contra `dev`.
//
// **Si el rango git no esta disponible, este archivo FALLA RUIDOSAMENTE.** No se salta y no pasa
// en silencio: es la leccion de `tests/baseline-rojos.json`. Una guardia que se auto-desactiva
// cuando no puede mirar es indistinguible de una guardia rota, y aqui lo que se vigila —«no
// abrir el componente compartido»— es justo la tentacion que aparece al construir la columna de
// acciones. Se usa `dev...HEAD`, que en esta rama SI resuelve, mas el arbol de trabajo, para que
// la guardia muerda antes incluso de commitear.

import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const RAIZ = join(__dirname, '..', '..', '..');

/** Las dos carpetas que esta feature NO puede tocar (R20, R31, R33). */
const INTOCABLES = ['components/shared/data-table/', 'components/ui/'] as const;

/** El rango contra el que se compara. `dev` es la rama de la que sale el worktree. */
const RANGO = 'dev...HEAD';

function git(comando: string): string {
  return execSync(comando, { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function aPosix(ruta: string): string {
  return ruta.split('\\').join('/');
}

/**
 * Archivos que esta rama ha tocado respecto de `dev`: los del rango **mas** los del arbol de
 * trabajo. Lanza —a proposito— si el rango no se puede calcular: quien lea el fallo tiene que
 * enterarse de que la comprobacion no se hizo, no creerse que salio verde.
 */
function archivosTocados(): readonly string[] {
  let delRango: string;
  try {
    delRango = git(`git diff --name-only ${RANGO}`);
  } catch (error) {
    throw new Error(
      `No se pudo calcular el diff \`${RANGO}\`, asi que R20/R31/R33 NO se han comprobado. ` +
        'Esta guardia falla en vez de pasar en silencio (ver `tests/baseline-rojos.json`). ' +
        `Causa: ${String(error)}`,
    );
  }

  const tocados = new Set<string>();
  for (const linea of delRango.split('\n')) {
    const limpia = linea.trim();
    if (limpia.length > 0) tocados.add(aPosix(limpia));
  }

  for (const linea of git('git status --porcelain').split('\n')) {
    if (linea.trim().length === 0) continue;
    const camino = linea.slice(3).trim();
    const destino = camino.includes(' -> ') ? camino.split(' -> ')[1] : camino;
    tocados.add(aPosix(destino.replace(/^"|"$/g, '')));
  }

  return [...tocados].sort();
}

/** Texto del archivo sin comentarios: una palabra citada en un comentario no es codigo. */
function fuenteSinComentarios(ruta: string): string {
  return readFileSync(join(RAIZ, ruta), 'utf8')
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

describe('el rango git esta disponible: la guardia puede mirar de verdad', () => {
  it(`\`git diff --name-only ${RANGO}\` resuelve; si no, este archivo falla ruidosamente`, () => {
    expect(() => archivosTocados()).not.toThrow();
    // Y devuelve algo: esta feature ha tocado archivos, aunque sea solo en el arbol de trabajo.
    expect(archivosTocados().length).toBeGreaterThan(0);
  });
});

describe('esta feature no abre la tabla compartida ni las primitivas (R20, R31, R33)', () => {
  it('ningun archivo tocado vive en `components/shared/data-table/` ni en `components/ui/`', () => {
    const violaciones = archivosTocados().filter((ruta) =>
      INTOCABLES.some((carpeta) => ruta.startsWith(carpeta)),
    );

    expect(violaciones).toEqual([]);
  });
});

describe('la tabla compartida no gana ningun mecanismo nuevo de acciones de fila (R20)', () => {
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
