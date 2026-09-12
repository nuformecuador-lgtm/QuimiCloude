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
//
// **Los casos que miden el DIFF llevan ademas una PRECONDICION DE RAMA** (2026-09-12): solo miden
// si el rango es el de QC-45. El porque, con el caso que lo destapo, en el comentario de
// `esLaRamaDeQC45`. Los casos que afirman sobre el CONTENIDO de la tabla compartida no dependen de
// la rama y corren siempre.

import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

import { describe, expect, it, type TestContext } from 'vitest';

const RAIZ = join(__dirname, '..', '..', '..');

/** Las dos carpetas que esta feature NO puede tocar (R20, R31, R33). */
const INTOCABLES = ['components/shared/data-table/', 'components/ui/'] as const;

/** El rango contra el que se compara. `dev` es la rama de la que sale el worktree. */
const RANGO = 'dev...HEAD';

/** La carpeta de la pantalla de QC-45: el ancla de no-vacuidad de esta guardia. */
const CARPETA_DE_LA_PANTALLA = 'app/(private)/configuracion/presentaciones/';

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

/**
 * LA PRECONDICION DE RAMA (anadida el 2026-09-12 desde la rama de QC-85).
 *
 * Este archivo sabia contra QUE comparar (`dev...HEAD` mas el arbol de trabajo) pero no comprobaba
 * QUE RAMA estaba midiendo. Mientras QC-45 vivia en su worktree eso no se notaba; **en cuanto QC-45
 * se mergeo en `dev`, este archivo empezo a medir CUALQUIER rama con las reglas de alcance de
 * QC-45**. Lo destapo QC-85 (pantalla de grupos de trabajo) el 2026-09-12: su R37 autoriza anadir
 * una primitiva por la CLI de shadcn —el unico camino permitido— y el archivo resultante,
 * **`components/ui/tabs.tsx`**, puso en rojo esta guardia ajena con `expected [
 * 'components/ui/tabs.tsx' ] to deeply equal []`. R20/R31/R33 son el alcance de QC-45 y no le
 * aplican a ninguna otra ficha.
 *
 * Y el agujero no era solo el rojo falso: era tambien el **verde falso**. Una rama ajena que no
 * toque `components/ui/` salia verde aqui, y ese verde decia «he revisado el diff de QC-45 y no
 * abre la tabla compartida» sin haber mirado el diff de QC-45 en absoluto.
 *
 * Es la misma leccion, y la misma cura, que `tests/unit/identity/account-status-scope.test.ts` y
 * `tests/unit/configuracion-ui/data-table-intacta-usuarios.test.ts`. **Se copia su forma a
 * proposito, sin inventar una tercera**: que el repo tenga varias maneras de decir lo mismo es la
 * mitad del problema que se esta arreglando.
 *
 * LA SENAL es CONJUNTIVA: el archivo central de la pantalla **mas** la carpeta de spec de la propia
 * ficha. La carpeta de spec discrimina de verdad porque nace y vive dentro del rango de QC-45 y no
 * aparece jamas en el rango de otra ficha, que trae la SUYA. No se usa este archivo de test como
 * senal, justamente porque otras fichas lo enmiendan al chocar con el.
 *
 * **Esto ENDURECE la precondicion, no relaja la comprobacion**: en la rama real de QC-45 las dos
 * senales estan presentes y los casos de abajo corren exactamente igual, con la misma lista cerrada
 * de `INTOCABLES` —que no se toca, y a la que no se le anade ninguna excepcion— y las mismas
 * igualdades. Fuera de su rama quedan `skipped`, nunca verdes.
 */
const ARCHIVO_CENTRAL_DE_QC45 = `${CARPETA_DE_LA_PANTALLA}page.tsx`;
const CARPETA_SPEC_DE_QC45 = 'specs/QC-45-pantalla-de-presentaciones/';

export function esLaRamaDeQC45(tocados: readonly string[]): boolean {
  return (
    tocados.includes(ARCHIVO_CENTRAL_DE_QC45) &&
    tocados.some((archivo) => archivo.startsWith(CARPETA_SPEC_DE_QC45))
  );
}

/** Salta el caso —ruidosamente, con el motivo escrito— cuando la rama no es la de QC-45. */
function saltarSiNoEsLaRamaDeQC45(ctx: Pick<TestContext, 'skip'>): void {
  const tocados = archivosTocados();

  if (tocados.length === 0) {
    ctx.skip(
      `la rama no toca ningun archivo respecto de \`${RANGO}\`: no hay diff que revisar, asi que ` +
        'este caso NO ha comprobado nada. Ocurre al correr el gate sobre `dev` con el arbol limpio.',
    );
    return;
  }

  if (!esLaRamaDeQC45(tocados)) {
    ctx.skip(
      'el rango no trae a la vez `' +
        ARCHIVO_CENTRAL_DE_QC45 +
        '` y `' +
        CARPETA_SPEC_DE_QC45 +
        '`: esta NO es la rama de QC-45, asi que este caso NO ha comprobado nada. R20, R31 y R33 ' +
        'son el alcance de ESA ficha y no le aplican a ninguna otra.',
    );
  }
}

describe('el rango git esta disponible: la guardia puede mirar de verdad', () => {
  // Esto NO depende de la rama: si `dev...HEAD` no resuelve, la guardia no puede mirar en ninguna
  // rama y tiene que enterarse todo el mundo. Se queda corriendo siempre.
  it(`\`git diff --name-only ${RANGO}\` resuelve; si no, este archivo falla ruidosamente`, () => {
    expect(() => archivosTocados()).not.toThrow();
  });

  it('el detector muerde: comparando la carpeta de la pantalla, el diff NO sale vacio', (ctx) => {
    saltarSiNoEsLaRamaDeQC45(ctx);

    // La no-vacuidad SI depende de la rama: «esta rama ha tocado archivos» solo dice algo si la
    // rama es la de QC-45. Acotado a la carpeta de SU pantalla —como el hermano ya curado—, que en
    // la rama de QC-45 cambia siempre: ahi estan las piezas de la feature. Asi «lista vacia» en el
    // caso de abajo no puede serlo por vacuidad.
    const deLaPantalla = archivosTocados().filter((ruta) =>
      ruta.startsWith(CARPETA_DE_LA_PANTALLA),
    );

    expect(deLaPantalla.length).toBeGreaterThan(0);
  });
});

describe('esta feature no abre la tabla compartida ni las primitivas (R20, R31, R33)', () => {
  it('ningun archivo tocado vive en `components/shared/data-table/` ni en `components/ui/`', (ctx) => {
    saltarSiNoEsLaRamaDeQC45(ctx);

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
