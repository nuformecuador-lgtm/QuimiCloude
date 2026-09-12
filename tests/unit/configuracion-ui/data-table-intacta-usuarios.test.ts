// QC-67 T8 — La tabla compartida y las primitivas quedan INTACTAS: R9, R37, R39.
//
// Lo que esta guardia promete no se ve renderizando: es una propiedad del **cambio**, no del
// arbol. R9 prohibe anadir a `components/shared/data-table/` ninguna propiedad ni mecanismo nuevo
// para pintar acciones de fila —la columna de acciones es una columna normal cuyo `cell` devuelve
// `ReactNode`— y R37 prohibe escribir o editar a mano nada de `components/ui/`. Las dos cosas se
// comprueban sobre lo que ESTA rama anade respecto del `dev` actual: el diff contra el
// **merge-base**, calculado en cada ejecucion —el porque, en el comentario de `REFERENCIAS_DE_DEV`—.
//
// El diff se hace contra el ARBOL DE TRABAJO —no contra `HEAD`—, asi que una modificacion sin
// commitear tambien cae. Si no hay ninguna referencia de `dev` donde corre la suite, el caso se
// SALTA de forma explicita y ruidosa con `ctx.skip(...)`: no pasa en silencio.
//
// La segunda mitad no depende de git: se afirma sobre la FUENTE del contrato compartido, que es lo
// que de verdad consume la pantalla.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, type TestContext } from 'vitest';

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
 * Las referencias que nombran la rama de integracion, en orden de preferencia. La base contra la
 * que se mide esta feature es el **merge-base** entre `dev` y `HEAD`, calculado en CADA ejecucion.
 *
 * Aqui vivio un SHA congelado (`5e84433`, el `dev` del que nacio el worktree) justificado con que
 * «asi el criterio no cambia por debajo si `dev` avanza». El argumento era falso y el efecto, el
 * contrario: `git diff <sha> -- <rutas>` (DOS puntos) compara arbol contra arbol, de modo que en
 * cuanto la rama se sincronizo con `dev` el rango se trago todo lo que `dev` traia —la migracion
 * `20260911120000_presentation_unit`, que es de QC-80— y se lo atribuyo a esta feature. R37 se
 * puso roja sin que la feature hubiera abierto un solo intocable. Esto se corrigio tras esa
 * sincronizacion real, no por gusto: el SHA congelado estaba MAL.
 *
 * El merge-base conserva —y refuerza— la propiedad que aquel comentario buscaba: la pregunta pasa
 * a ser «que anade MI rama sobre el `dev` ACTUAL», que es justo lo que R37 quiere saber, y el
 * criterio no se afloja porque `dev` avance, porque lo que `dev` aporta nunca cuenta como mio.
 */
const REFERENCIAS_DE_DEV = ['origin/dev', 'dev'] as const;

/** Las dos carpetas que esta feature NO puede tocar (R9, R37). */
const INTOCABLES = ['components/shared/data-table', 'components/ui'] as const;

function git(args: readonly string[]): string {
  return execFileSync('git', [...args], { cwd: repoRoot, encoding: 'utf8' });
}

/**
 * El merge-base entre la primera referencia de `dev` disponible y `HEAD`, o `null` si no hay
 * ninguna a mano. `null` NO es verde: quien depende de la base se salta con el motivo escrito.
 */
function baseDeLaRama(): string | null {
  for (const referencia of REFERENCIAS_DE_DEV) {
    try {
      return git(['merge-base', referencia, 'HEAD']).trim();
    } catch {
      // Esa referencia no existe aqui: se prueba la siguiente.
    }
  }
  return null;
}

/** Se calcula una sola vez: el grafo no se mueve mientras corre la suite. */
const BASE_DE_LA_RAMA = baseDeLaRama();

/** El motivo que se escribe cuando no hay base: un salto explicito, nunca un verde silencioso. */
const SIN_BASE =
  `ninguna de las referencias ${REFERENCIAS_DE_DEV.join(', ')} esta disponible: no se puede ` +
  'calcular el merge-base, asi que esta guardia NO ha comprobado nada';

/**
 * Los archivos cambiados bajo `rutas` respecto del merge-base. El base va como commit suelto y no
 * como `origin/dev...HEAD` a proposito: la forma de tres puntos solo mira commits, y aqui hace
 * falta que el ARBOL DE TRABAJO cuente.
 */
function archivosCambiados(base: string, rutas: readonly string[]): readonly string[] {
  return git(['diff', '--name-only', base, '--', ...rutas])
    .split('\n')
    .map((linea) => linea.trim())
    .filter((linea) => linea !== '');
}

/**
 * Archivos NUEVOS sin seguimiento bajo `rutas`. `git diff` no los ve —todavia no estan en el
 * indice—, asi que escribir a mano un primitivo en `components/ui/` se colaria si solo se mirara
 * el diff. Aqui se miran tambien, que es justo la tentacion que R37 vigila.
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

/**
 * LA PRECONDICION DE RAMA (anadida el 2026-09-11 desde la rama de QC-84).
 *
 * `1a9e2c4` arreglo el RANGO de este centinela —merge-base en vez de un SHA congelado— y dejo
 * pendiente el SUJETO: seguia sin comprobar QUE RAMA estaba midiendo. Mientras QC-67 vivia en su
 * worktree eso no se notaba; **en cuanto QC-67 se mergeo en `dev`, este archivo empezo a medir
 * CUALQUIER rama con las reglas de alcance de QC-67**. Lo destapo QC-84 al sincronizar: su ancla de
 * no-vacuidad fallaba con `expected 0 to be greater than 0` porque una rama de backend no toca la
 * carpeta de la pantalla de usuarios —y fallaba igual corriendo el gate sobre `dev` con el arbol
 * limpio, donde el diff contra el propio merge-base es de CERO archivos—.
 *
 * Es la misma leccion, y la misma cura, que `tests/unit/identity/account-status-scope.test.ts`
 * escribio en su cabecera: «aplicarlas a otra rama no mide nada, solo pone en rojo trabajo legitimo
 * ajeno». **Se copia su forma a proposito, sin inventar una segunda**: que el repo tenga dos
 * maneras de decir lo mismo es la mitad del problema que se esta arreglando.
 *
 * LA SENAL es CONJUNTIVA: el archivo central de la pantalla **mas** la carpeta de spec de la propia
 * ficha. La carpeta de spec discrimina de verdad porque nace y vive dentro del rango de QC-67 y no
 * aparece jamas en el rango de otra ficha, que trae la SUYA. No se usa este archivo de test como
 * senal, justamente porque otras fichas lo enmiendan al chocar con el.
 *
 * **Esto ENDURECE la precondicion, no relaja la comprobacion**: en la rama real de QC-67 las dos
 * senales estan presentes y los dos casos de abajo corren exactamente igual, con las mismas listas
 * cerradas y las mismas igualdades. Fuera de su rama quedan `skipped` —nunca verdes—: un verde
 * diria «he revisado el diff de QC-67 y no abre la tabla compartida» sin haber mirado nada.
 */
const ARCHIVO_CENTRAL_DE_QC67 = 'app/(private)/configuracion/usuarios/page.tsx';
const CARPETA_SPEC_DE_QC67 = 'specs/QC-67-pantalla-de-usuarios/';

export function esLaRamaDeQC67(tocados: readonly string[]): boolean {
  return (
    tocados.includes(ARCHIVO_CENTRAL_DE_QC67) &&
    tocados.some((archivo) => archivo.startsWith(CARPETA_SPEC_DE_QC67))
  );
}

/**
 * Salta el caso —ruidosamente, con el motivo escrito— cuando la rama no es la de QC-67. El diff se
 * pide sobre TODO el arbol (`.`) y no solo sobre las rutas vigiladas: la senal vive fuera de ellas.
 */
function saltarSiNoEsLaRamaDeQC67(ctx: Pick<TestContext, 'skip'>, base: string): void {
  const tocados = archivosCambiados(base, ['.']);

  if (tocados.length === 0) {
    ctx.skip(
      'la rama no toca ningun archivo respecto del merge-base con `dev`: no hay diff que ' +
        'revisar, asi que este caso NO ha comprobado nada. Ocurre al correr el gate sobre `dev` ' +
        'con el arbol limpio.',
    );
    return;
  }

  if (!esLaRamaDeQC67(tocados)) {
    ctx.skip(
      'el rango no trae a la vez `' +
        ARCHIVO_CENTRAL_DE_QC67 +
        '` y `' +
        CARPETA_SPEC_DE_QC67 +
        '`: esta NO es la rama de QC-67, asi que este caso NO ha comprobado nada. R9 y R37 son ' +
        'el alcance de ESA ficha y no le aplican a ninguna otra.',
    );
  }
}

describe('esta feature no abre la tabla compartida ni las primitivas (R9, R37)', () => {
  it('ningun archivo de `components/shared/data-table/` ni de `components/ui/` cambia', (ctx) => {
    if (BASE_DE_LA_RAMA === null) {
      ctx.skip(SIN_BASE);
      return;
    }
    saltarSiNoEsLaRamaDeQC67(ctx, BASE_DE_LA_RAMA);

    const tocados = [
      ...archivosCambiados(BASE_DE_LA_RAMA, INTOCABLES),
      ...archivosSinSeguimiento(INTOCABLES),
    ];

    expect(tocados, `QC-67 modifico archivos intocables: ${tocados.join(', ')}`).toEqual([]);
  });

  it('el detector muerde: comparando la carpeta de la pantalla, el diff NO sale vacio', (ctx) => {
    if (BASE_DE_LA_RAMA === null) {
      ctx.skip(SIN_BASE);
      return;
    }
    saltarSiNoEsLaRamaDeQC67(ctx, BASE_DE_LA_RAMA);

    // El caso simetrico, para que «lista vacia» no pueda serlo por vacuidad —por ejemplo porque el
    // `--` estuviera mal puesto, o porque el rango se calculara mal, y git no mirara nada—. La
    // carpeta de la pantalla SI cambia respecto del merge-base: ahi estan las piezas de la feature.
    const cambiados = archivosCambiados(BASE_DE_LA_RAMA, ['app/(private)/configuracion/usuarios']);

    expect(cambiados.length).toBeGreaterThan(0);
  });
});

describe('la tabla compartida no gana ningun mecanismo nuevo de acciones de fila (R9)', () => {
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
