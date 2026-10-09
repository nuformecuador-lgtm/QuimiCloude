// QC-85 T13 — El ALCANCE de la ficha: lo que esta pantalla NO toca (R4, R5, R12, R16, R36, R37,
// R39, R41).
//
// Es el centinela que cierra el mapa de trazabilidad. Lo que promete no se ve renderizando nada:
// son propiedades del **cambio** —que tal carpeta no aparezca en el diff— y de la **forma de los
// tests** de esta carpeta. Por eso aqui no se monta ni un componente.
//
// El diff se mide contra el **merge-base** con `dev`, calculado en CADA ejecucion, y sobre el
// ARBOL DE TRABAJO —no contra `HEAD`—, asi que una modificacion sin commitear tambien cae. Ademas
// se miran los archivos SIN SEGUIMIENTO: casi todo lo que esta ficha anade todavia no esta en el
// indice, y un archivo nuevo escrito a mano no aparece jamas en `git diff`. Un centinela que solo
// mirara el diff daria verde con `components/ui/` reescrito a mano al lado.
//
// **Un SHA congelado aqui esta PROHIBIDO.** Ya produjo dos fallos documentados en este repo
// (`data-table-intacta-usuarios.test.ts` y `data-table-intacta-unidades.test.ts`): `git diff <sha>
// -- .` compara arbol contra arbol, asi que en cuanto la rama se sincroniza con `dev` el rango se
// traga todo lo que `dev` traia y se lo atribuye a esta feature —565 archivos ajenos en el caso de
// unidades—.
//
// **La precondicion de rama es el NOMBRE de la rama**, igual que en `guard-piezas-base.test.ts` y en
// los `qc1xx-alcance.test.ts` de documentos: no se inventa una segunda manera. Hasta el 2026-10-08
// se deducia del diff (archivo central + carpeta de spec), y QC-231 la rompio: esa rama trae
// legitimamente `work-group-table.tsx` y enmienda specs ajenos, y este archivo se creyo en casa.
//
// **Anti-vacuidad.** Cada `toEqual([])` de aqui lleva su caso simetrico que demuestra que el
// detector muerde: que el mismo barrido, apuntado a la carpeta de la pantalla, NO devuelve vacio;
// que el detector de copy encuentra una consulta por texto cuando la hay. Un `toEqual([])` sin
// mordiente es un falso verde.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, type TestContext } from 'vitest';

import { ERROR_CODES } from '@/lib/modules/errores';
import { PRIVATE_NAV_ITEMS, type NavItem } from '@/lib/shared/navigation/private-nav';
import { PRIVATE_ROUTE_PREFIXES, USERS_ROUTE } from '@/lib/shared/routes';

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
 * que se mide esta feature es el **merge-base** entre `dev` y `HEAD`, calculado en CADA ejecucion:
 * la pregunta es «que anade MI rama sobre el `dev` ACTUAL», y lo que `dev` aporta no cuenta nunca
 * como mio.
 */
const REFERENCIAS_DE_DEV = ['origin/dev', 'dev'] as const;

function git(args: readonly string[]): string {
  return execFileSync('git', [...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
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

function lineas(salida: string): readonly string[] {
  return salida
    .split('\n')
    .map((linea) => linea.trim())
    .filter((linea) => linea !== '');
}

/**
 * Los archivos cambiados bajo `rutas` respecto del merge-base. El base va como commit suelto y no
 * como `origin/dev...HEAD` a proposito: la forma de tres puntos solo mira commits, y aqui hace
 * falta que el ARBOL DE TRABAJO cuente.
 *
 * Los BORRADOS cuentan aqui a proposito: un «diff vacio en tal carpeta» tiene que morder tambien
 * si alguien borra un archivo de ella. Quien vaya a LEER los archivos usa
 * `archivosPresentesCambiados`, que los excluye.
 */
function archivosCambiados(base: string, rutas: readonly string[]): readonly string[] {
  return lineas(git(['diff', '--name-only', base, '--', ...rutas]));
}

/**
 * Lo mismo, sin los borrados (`--diff-filter=d`): es la lista que se puede LEER del disco. Sin el
 * filtro, un archivo borrado por la rama sale en el diff y `readFileSync` revienta con ENOENT.
 */
function archivosPresentesCambiados(base: string, rutas: readonly string[]): readonly string[] {
  return lineas(git(['diff', '--name-only', '--diff-filter=d', base, '--', ...rutas]));
}

/**
 * Archivos NUEVOS sin seguimiento bajo `rutas`. `git diff` no los ve —todavia no estan en el
 * indice—, asi que un archivo escrito a mano se colaria si solo se mirara el diff.
 */
function archivosSinSeguimiento(rutas: readonly string[]): readonly string[] {
  return lineas(git(['ls-files', '--others', '--exclude-standard', '--', ...rutas]));
}

/** Todo lo que esta rama aporta bajo `rutas`: modificado **y** nuevo sin seguimiento. */
function aportadosPorLaRama(base: string, rutas: readonly string[]): readonly string[] {
  return [...archivosCambiados(base, rutas), ...archivosSinSeguimiento(rutas)].sort();
}

/** Los archivos que el repo tiene versionados bajo `rutas`, sin mirar el diff. */
function archivosVersionados(rutas: readonly string[]): readonly string[] {
  return lineas(git(['ls-files', '--', ...rutas]));
}

/**
 * LA PRECONDICION DE RAMA.
 *
 * Un centinela de alcance que no comprueba QUE RAMA esta midiendo acaba aplicando las reglas de
 * SU ficha al trabajo legitimo de otra. Ya paso: `data-table-intacta-usuarios.test.ts` empezo a
 * medir cualquier rama con el alcance de QC-67 en cuanto QC-67 se mergeo en `dev`, y lo destapo
 * QC-84 con un `expected 0 to be greater than 0`.
 *
 * LA SENAL es el NOMBRE de la rama, comparado por IGUALDAD exacta. Antes era CONJUNTIVA sobre el
 * diff —`work-group-table.tsx` mas algo bajo la carpeta de spec de QC-85—, con la premisa de que
 * esa carpeta «no aparece jamas en el rango de otra ficha». QC-231 desmintio la premisa: una
 * ficha de componentizacion toca `work-group-table.tsx` y enmienda specs ajenos con todo derecho,
 * y este archivo midio su rama con el alcance de QC-85. Que el diff contenga archivos compartidos
 * NO dice de quien es la rama; su nombre si.
 *
 * Fuera de un checkout con rama —CI hace checkout del PR en HEAD separado— se cae a
 * `GITHUB_HEAD_REF`, que GitHub Actions rellena con la rama de origen del PR.
 *
 * **Esto ENDURECE la precondicion, no relaja la comprobacion**: en la rama de QC-85 todos los
 * casos corren igual, con las mismas listas cerradas y las mismas igualdades, y el ancla de abajo
 * exige ademas que su diff traiga la obra de la ficha. Fuera de su rama quedan `skipped` —nunca
 * verdes—: un verde diria «he revisado el diff de QC-85» sin haber mirado nada.
 */
const RAMA_DE_QC85 = 'feature/QC-85-pantalla-de-grupos-de-trabajo';

/** La rama del checkout; en HEAD separado (CI), la rama de origen del PR. `null` si no hay ninguna. */
function ramaActual(): string | null {
  let rama: string;
  try {
    rama = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  } catch {
    return null;
  }
  if (rama === 'HEAD') rama = (process.env.GITHUB_HEAD_REF ?? '').trim();
  return rama.length === 0 ? null : rama;
}

/** Se calcula una sola vez: la rama no cambia mientras corre la suite. */
const RAMA_ACTUAL = ramaActual();

export function esLaRamaDeQC85(rama: string | null): boolean {
  return rama === RAMA_DE_QC85;
}

/**
 * LA OBRA de QC-85 en el diff: el archivo central de la pantalla de grupos **mas** la carpeta de
 * spec de la ficha. YA NO decide si un caso mide —eso lo decide el nombre de la rama—: sirve al
 * ancla de no-vacuidad, que en la rama de QC-85 exige que el diff traiga de verdad su trabajo.
 *
 * El archivo central es `work-group-table.tsx` y **no** `usuarios/page.tsx`: esa segunda es de
 * QC-67 —que tambien vive en esta pantalla—.
 */
const ARCHIVO_CENTRAL_DE_QC85 =
  'app/(private)/configuracion/usuarios/components/work-group-table.tsx';
const CARPETA_SPEC_DE_QC85 = 'specs/QC-85-pantalla-de-grupos-de-trabajo/';

function diffTraeLaObraDeQC85(tocados: readonly string[]): boolean {
  return (
    tocados.includes(ARCHIVO_CENTRAL_DE_QC85) &&
    tocados.some((archivo) => archivo.startsWith(CARPETA_SPEC_DE_QC85))
  );
}

/** El motivo que se escribe fuera de la rama de QC-85. Lo comparten el preambulo y el ancla. */
function motivoNoEsLaRamaDeQC85(rama: string | null): string {
  return (
    (rama === null
      ? 'no se pudo leer la rama actual (ni con git ni por `GITHUB_HEAD_REF`)'
      : `la rama actual es '${rama}' y no '${RAMA_DE_QC85}'`) +
    ': esta NO es la rama de QC-85, asi que este caso NO ha comprobado nada. El alcance de esta ' +
    'ficha no le aplica a ninguna otra rama, aunque su diff traiga archivos de esta pantalla.'
  );
}

/**
 * El motivo que se escribe cuando la rama no aporta NADA. Vive suelto porque lo comparten el
 * preambulo de los casos que miden el diff y el ancla de no-vacuidad.
 */
const RAMA_SIN_APORTES =
  'la rama no toca ningun archivo respecto del merge-base con `dev`: no hay diff que revisar, ' +
  'asi que este caso NO ha comprobado nada.';

/**
 * Salta el caso —ruidosamente, con el motivo escrito— cuando la rama no es la de QC-85, o cuando
 * siendolo no aporta nada. Se pide TODO el arbol (`.`) y tambien lo SIN SEGUIMIENTO.
 */
function saltarSiNoEsLaRamaDeQC85(ctx: Pick<TestContext, 'skip'>, base: string): void {
  if (!esLaRamaDeQC85(RAMA_ACTUAL)) {
    ctx.skip(motivoNoEsLaRamaDeQC85(RAMA_ACTUAL));
    return;
  }

  if (aportadosPorLaRama(base, ['.']).length === 0) {
    ctx.skip(RAMA_SIN_APORTES);
  }
}

/** El preambulo que repiten todos los casos que miden el diff. Devuelve la base ya comprobada. */
function baseDeEstaRama(ctx: Pick<TestContext, 'skip'>): string {
  if (BASE_DE_LA_RAMA === null) {
    ctx.skip(SIN_BASE);
    throw new Error('inalcanzable: `ctx.skip` aborta el caso');
  }
  saltarSiNoEsLaRamaDeQC85(ctx, BASE_DE_LA_RAMA);
  return BASE_DE_LA_RAMA;
}

/** La carpeta de la pantalla: es lo que esta ficha SI toca, y por eso sirve de mordiente. */
const CARPETA_DE_LA_PANTALLA = 'app/(private)/configuracion/usuarios';

/** La carpeta de los unitarios de esta ficha. */
const CARPETA_DE_LOS_TESTS = 'tests/unit/configuracion-ui/grupos';

function fuente(ruta: string): string {
  return readFileSync(join(repoRoot, ruta), 'utf8');
}

/** Texto del archivo sin comentarios: una palabra citada en un comentario no es codigo. */
function fuenteSinComentarios(ruta: string): string {
  return fuente(ruta)
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/**
 * Los archivos de la pantalla que ESTA rama aporta: se derivan del diff, no de una lista a mano.
 * Son archivos que se van a LEER, asi que los borrados quedan fuera (`archivosPresentesCambiados`):
 * un archivo que la rama borro no tiene contenido que revisar y leerlo revienta con ENOENT.
 */
function archivosDeLaPantalla(): readonly string[] {
  if (BASE_DE_LA_RAMA === null) return [];
  return [
    ...archivosPresentesCambiados(BASE_DE_LA_RAMA, [CARPETA_DE_LA_PANTALLA]),
    ...archivosSinSeguimiento([CARPETA_DE_LA_PANTALLA]),
  ]
    .sort()
    .filter((archivo) => /\.tsx?$/.test(archivo));
}

// ---------------------------------------------------------------------------------------------
// La precondicion, probada como lo que es: una funcion pura
// ---------------------------------------------------------------------------------------------

describe('la senal de RAMA discrimina de verdad la rama de QC-85', () => {
  /** Lo que el diff de QC-85 traia: el archivo central y su carpeta de spec. */
  const OBRA_COMPLETA = [
    ARCHIVO_CENTRAL_DE_QC85,
    `${CARPETA_SPEC_DE_QC85}requirements.md`,
    'progress/current.md',
  ];

  it('con el nombre exacto de su rama, es la rama de QC-85', () => {
    expect(esLaRamaDeQC85(RAMA_DE_QC85)).toBe(true);
  });

  it('es IGUALDAD, no prefijo ni parecido: ni una ficha vecina ni un sufijo cuentan', () => {
    expect(esLaRamaDeQC85(`${RAMA_DE_QC85}-bis`)).toBe(false);
    expect(esLaRamaDeQC85('feature/QC-850-pantalla-de-grupos-de-trabajo')).toBe(false);
    expect(esLaRamaDeQC85('QC-85-pantalla-de-grupos-de-trabajo')).toBe(false);
    expect(esLaRamaDeQC85('dev')).toBe(false);
  });

  it('sin rama legible —HEAD separado sin `GITHUB_HEAD_REF`— no lo es: salta, no mide', () => {
    expect(esLaRamaDeQC85(null)).toBe(false);
    expect(esLaRamaDeQC85('HEAD')).toBe(false);
  });

  it('y la rama de QC-67 —que vive en esta MISMA pantalla— no cuenta como la de QC-85', () => {
    expect(esLaRamaDeQC85('feature/QC-67-pantalla-de-usuarios')).toBe(false);
  });

  it('la rama de QC-231, que trae `work-group-table.tsx` y enmienda specs ajenos, NO cuenta', () => {
    // El caso que motivo el cambio de senal, escrito como muestra que muerde. El diff de esa rama
    // toca el archivo central de esta pantalla; si ademas enmendara el spec de QC-85, la senal
    // vieja —la obra en el diff— la habria tomado por la rama de QC-85. El nombre no se equivoca.
    const diffDeQC231 = [
      ARCHIVO_CENTRAL_DE_QC85,
      `${CARPETA_SPEC_DE_QC85}design.md`,
      'specs/QC-231-componentizacion-piezas-base/design.md',
    ];

    expect(diffTraeLaObraDeQC85(diffDeQC231)).toBe(true);
    expect(esLaRamaDeQC85('feature/QC-231-componentizacion-piezas-base')).toBe(false);
  });

  it('la obra en el diff sigue siendo CONJUNTIVA: el ancla de abajo exige las dos piezas', () => {
    expect(diffTraeLaObraDeQC85(OBRA_COMPLETA)).toBe(true);
    expect(diffTraeLaObraDeQC85(OBRA_COMPLETA.filter((a) => a !== ARCHIVO_CENTRAL_DE_QC85))).toBe(
      false,
    );
    expect(diffTraeLaObraDeQC85([ARCHIVO_CENTRAL_DE_QC85, 'progress/current.md'])).toBe(false);
    expect(
      diffTraeLaObraDeQC85([
        'app/(private)/configuracion/usuarios/page.tsx',
        'specs/QC-67-pantalla-de-usuarios/requirements.md',
      ]),
    ).toBe(false);
  });

  it('esta ejecucion SI es la rama de QC-85: ningun caso de abajo se ha saltado en silencio', (ctx) => {
    // Ancla de no-vacuidad. En la rama de QC-85 los casos que miden el diff corren, y este exige
    // ademas que ese diff traiga de verdad la obra de la ficha: si la rama se llamara asi pero no
    // aportara su pantalla, todos los casos medirian un diff ajeno y el archivo seria decorativo.
    //
    // Fuera de la rama de QC-85 —el estado NORMAL desde su merge en `dev` (PR #64)— se salta
    // ruidosamente, con el motivo escrito, por la misma via que sus hermanos.
    if (BASE_DE_LA_RAMA === null) {
      ctx.skip(SIN_BASE);
      return;
    }

    if (!esLaRamaDeQC85(RAMA_ACTUAL)) {
      ctx.skip(motivoNoEsLaRamaDeQC85(RAMA_ACTUAL));
      return;
    }

    const tocados = aportadosPorLaRama(BASE_DE_LA_RAMA, ['.']);

    if (tocados.length === 0) {
      ctx.skip(RAMA_SIN_APORTES);
      return;
    }

    expect(
      diffTraeLaObraDeQC85(tocados),
      `la rama de QC-85 tiene que aportar \`${ARCHIVO_CENTRAL_DE_QC85}\` y algo bajo \`${CARPETA_SPEC_DE_QC85}\``,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// R4 — ninguna ruta, segmento ni pagina nueva
// ---------------------------------------------------------------------------------------------

/** Los archivos que el App Router convierte en una ruta servible. */
const ARCHIVOS_DE_RUTA = /^app\/.+\/(page|route|layout|template|default)\.tsx?$/;

describe('esta ficha no crea ninguna ruta ni pagina nueva (R4)', () => {
  it('ningun archivo de ruta nace bajo `app/`: la pestana vive donde ya vivia la pantalla', (ctx) => {
    const base = baseDeEstaRama(ctx);

    // El `page.tsx` de usuarios SE MODIFICA (T2 le mete el conmutador), pero eso no es «crear una
    // ruta»: lo que R4 prohibe es que aparezca uno NUEVO. Por eso aqui se miran solo las altas.
    const rutasNuevas = archivosSinSeguimiento(['app']).filter((archivo) =>
      ARCHIVOS_DE_RUTA.test(archivo),
    );

    expect(rutasNuevas, `R4: esta ficha anadio rutas nuevas: ${rutasNuevas.join(', ')}`).toEqual([]);

    // Y lo que SI cambia bajo `app/` es exactamente la carpeta de la pantalla heredada.
    const fueraDeLaPantalla = aportadosPorLaRama(base, ['app']).filter(
      (archivo) => !archivo.startsWith(`${CARPETA_DE_LA_PANTALLA}/`),
    );

    expect(fueraDeLaPantalla).toEqual([]);
  });

  it('el detector muerde: el mismo patron SI reconoce las paginas privadas que ya existen', () => {
    // El caso simetrico: si `ARCHIVOS_DE_RUTA` estuviera mal escrito, el `toEqual([])` de arriba
    // seria verde por vacuidad. Sobre el arbol versionado encuentra las pantallas de verdad.
    const paginasPrivadas = archivosVersionados(['app/(private)']).filter((archivo) =>
      ARCHIVOS_DE_RUTA.test(archivo),
    );

    expect(paginasPrivadas.length).toBeGreaterThan(3);
    expect(paginasPrivadas).toContain(`${CARPETA_DE_LA_PANTALLA}/page.tsx`);
  });

  it('`lib/shared/routes.ts` no cambia: ni `USERS_ROUTE` ni `PRIVATE_ROUTE_PREFIXES`', (ctx) => {
    const base = baseDeEstaRama(ctx);

    expect(aportadosPorLaRama(base, ['lib/shared/routes.ts'])).toEqual([]);
  });

  it('y la lista de prefijos privados sigue cubriendo la pantalla sin ganar ninguna fila', () => {
    // Ancla que no depende de git: el prefijo de la pantalla esta, y ninguno nombra la pestana.
    // La cobertura prefijo <-> `page.tsx` la vigila `guard-rutas-privadas-cubiertas`, que esta
    // ficha NO toca: aqui solo se comprueba que la lista no gano ninguna fila propia.
    expect(PRIVATE_ROUTE_PREFIXES).toContain(USERS_ROUTE);

    const prefijosQueNombranLaPestana = PRIVATE_ROUTE_PREFIXES.filter((prefijo) =>
      /grupo|tab=/i.test(prefijo),
    );

    expect(prefijosQueNombranLaPestana).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// R5 — el menu privado no gana nada
// ---------------------------------------------------------------------------------------------

/** Aplana el menu: los grupos tienen hijos, y un item nuevo podria esconderse dentro de uno. */
function itemsPlanos(items: readonly NavItem[]): readonly NavItem[] {
  return items.flatMap((item) => (item.kind === 'group' ? [item, ...item.items] : [item]));
}

describe('el menu privado no gana ningun item ni ningun permiso de navegacion (R5)', () => {
  it('diff vacio en `lib/shared/navigation/`: ni el menu ni su filtrado se tocan', (ctx) => {
    const base = baseDeEstaRama(ctx);

    const tocados = aportadosPorLaRama(base, ['lib/shared/navigation']);

    expect(tocados, `R5: esta ficha toco el menu privado: ${tocados.join(', ')}`).toEqual([]);
  });

  it('el detector muerde: apuntado a la carpeta de la pantalla, NO sale vacio', (ctx) => {
    const base = baseDeEstaRama(ctx);

    // Si el `--` estuviera mal puesto o el rango mal calculado, git no miraria nada y el caso de
    // arriba seria verde sin haber comprobado nada. La carpeta de la pantalla SI cambia.
    expect(aportadosPorLaRama(base, [CARPETA_DE_LA_PANTALLA]).length).toBeGreaterThan(0);
  });

  it('ningun item del menu nombra la pestana de grupos, ni por destino ni por permiso', () => {
    const sospechosos = itemsPlanos(PRIVATE_NAV_ITEMS).filter((item) =>
      /grupo|tab=/i.test(JSON.stringify(item)),
    );

    expect(sospechosos).toEqual([]);
  });

  it('y el item de usuarios sigue apuntando al destino canonico, sin parametro de pestana', () => {
    const usuarios = itemsPlanos(PRIVATE_NAV_ITEMS).filter(
      (item) => item.kind === 'link' && item.href === USERS_ROUTE,
    );

    expect(usuarios).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------
// R16 — las listas blancas de consulta no se amplian
// ---------------------------------------------------------------------------------------------

/** Donde viven las dos listas blancas de grupos, la del listado y la de miembros. */
const LISTAS_BLANCAS_DE_GRUPOS = 'lib/modules/identity/domain/work-group-queryable.ts';

/** Lo que la tabla compartida llama «declarar un filtro» en una columna. */
const DECLARACION_DE_FILTRO = /\bfilter\s*:/;

describe('las dos listas blancas de consulta de grupos no se amplian (R16)', () => {
  it('`WORK_GROUP_QUERYABLE` y `WORK_GROUP_MEMBER_QUERYABLE` no cambian: diff vacio', (ctx) => {
    const base = baseDeEstaRama(ctx);

    const tocados = aportadosPorLaRama(base, [LISTAS_BLANCAS_DE_GRUPOS]);

    expect(tocados, 'R16: la lista blanca de grupos se toco desde la pantalla').toEqual([]);
  });

  it('ningun archivo de la pantalla declara un filtro de columna', (ctx) => {
    // La lista blanca no declara ningun filtrable —lo congela `work-group-list-params.test.ts`—,
    // asi que ofrecer un filtro seria pedirle al modulo algo que no admite.
    //
    // `archivosDeLaPantalla()` sale del DIFF de la rama: sin el preambulo, cualquier rama que tocara
    // la pantalla de usuarios —p.ej. la columna con filtro de la pestana de personas— le caeria.
    baseDeEstaRama(ctx);

    const conFiltro = archivosDeLaPantalla().filter((archivo) =>
      DECLARACION_DE_FILTRO.test(fuenteSinComentarios(archivo)),
    );

    expect(conFiltro, `R16: declaran filtro: ${conFiltro.join(', ')}`).toEqual([]);
  });

  it('el detector muerde: el mismo patron SI encuentra el filtro de la pestana de personas', () => {
    // La pestana de personas SI filtra por estado de cuenta (QC-67). Si el patron no lo viera, el
    // caso de arriba seria verde por vacuidad.
    expect(
      DECLARACION_DE_FILTRO.test(
        fuenteSinComentarios(`${CARPETA_DE_LA_PANTALLA}/components/user-columns.tsx`),
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// R36 — no se escribe backend
// ---------------------------------------------------------------------------------------------

/** Las carpetas de backend que esta ficha no abre: dominio, datos y punto de composicion. */
const CARPETAS_DE_BACKEND = ['lib/modules', 'db', 'lib/composition'] as const;

/** Las rutas EXACTAS por las que entran las operaciones que esta pantalla consume. */
const ADAPTADORES_DRIVING = [
  '@/lib/modules/identity/adapters/driving/work-group-actions',
  '@/lib/modules/identity/adapters/driving/user-actions',
] as const;

/** Las operaciones de QC-84 que consume la pantalla, mas la consulta de personas de QC-66. */
const OPERACIONES_CONSUMIDAS = [
  'createWorkGroupAction',
  'renameWorkGroupAction',
  'deleteWorkGroupAction',
  'addWorkGroupMemberAction',
  'removeWorkGroupMemberAction',
  'listWorkGroupsAction',
  'listWorkGroupMembersAction',
  'listWorkGroupCandidatesAction',
  'listUsersAction',
] as const;

interface ImportacionLeida {
  readonly archivo: string;
  readonly origen: string;
  readonly simbolo: string;
}

/** Lee los imports con llaves de un archivo y devuelve un par por simbolo, ya sin `type` ni alias. */
function importaciones(archivo: string): readonly ImportacionLeida[] {
  const texto = fuenteSinComentarios(archivo);
  const patron = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*'([^']+)'/g;
  const leidas: ImportacionLeida[] = [];

  for (const coincidencia of texto.matchAll(patron)) {
    const origen = coincidencia[2]!;
    for (const bruto of coincidencia[1]!.split(',')) {
      const simbolo = bruto.replace(/\btype\b/, '').split(' as ')[0]!.trim();
      if (simbolo !== '') leidas.push({ archivo, origen, simbolo });
    }
  }

  return leidas;
}

function importacionesDeLaPantalla(): readonly ImportacionLeida[] {
  return archivosDeLaPantalla().flatMap(importaciones);
}

function esAdaptadorDriving(origen: string): boolean {
  return (ADAPTADORES_DRIVING as readonly string[]).includes(origen);
}

describe('toda escritura y toda lectura pasan por operaciones YA publicadas (R36)', () => {
  it('diff vacio en `lib/modules/**`, `db/**` y `lib/composition/**`', (ctx) => {
    const base = baseDeEstaRama(ctx);

    const tocados = aportadosPorLaRama(base, CARPETAS_DE_BACKEND);

    expect(tocados, `R36: esta ficha escribio backend: ${tocados.join(', ')}`).toEqual([]);
  });

  it('cada operacion entra por su RUTA EXACTA, nunca por el barrel del modulo', (ctx) => {
    // QC-101 lo destapo. Este caso miraba `archivosDeLaPantalla()` —que sale del DIFF de la rama—
    // sin la precondicion de rama que ya protegia a sus hermanos: una guardia de alcance sin
    // precondicion de rama, la misma «bomba de relojeria» que describen QC-45 y QC-65. Cualquier
    // rama que tocara la pantalla de usuarios le caia, y QC-101 la toco para montar el cierre de
    // sesiones. Con el mismo preambulo que sus hermanos, fuera de la rama de QC-85 se salta
    // ruidosamente, no pasa en verde; dentro de ella mide exactamente lo mismo que antes.
    baseDeEstaRama(ctx);

    // Se miran DOS cosas: que ninguna de las operaciones entre por otra puerta, y que el
    // barrel publico del modulo no aporte NINGUN simbolo terminado en `Action`. Lo segundo es lo
    // que cierra la puerta al `import { listWorkGroupsAction } from '@/lib/modules/identity'` que
    // R36 prohibe. `AlertDialogAction` —el boton de confirmar del primitivo— tambien acaba en
    // `Action` y no es una operacion: por eso el criterio es el ORIGEN, no solo el sufijo.
    const porOtraPuerta = importacionesDeLaPantalla().filter(
      (leida) =>
        (OPERACIONES_CONSUMIDAS as readonly string[]).includes(leida.simbolo)
          ? !esAdaptadorDriving(leida.origen)
          : leida.simbolo.endsWith('Action') && leida.origen.startsWith('@/lib/modules'),
    );

    expect(
      porOtraPuerta.map((leida) => `${leida.archivo}: ${leida.simbolo} <- ${leida.origen}`),
    ).toEqual([]);
  });

  it('y las operaciones consumidas SE importan de verdad: el detector no mira al vacio', (ctx) => {
    // Este caso mide el DIFF, aunque no lo parezca: `archivosDeLaPantalla()` deriva su lista de lo
    // que la rama APORTA bajo la carpeta de la pantalla. Fuera de la rama de QC-85 esa lista esta
    // vacia —sobre `dev` sus archivos ya no los aporta nadie— y el caso no tiene nada que escanear.
    // Le falta el mismo preambulo que a sus hermanos: se salta ruidosamente, no pasa en verde.
    baseDeEstaRama(ctx);

    const importadas = new Set(
      importacionesDeLaPantalla()
        .filter((leida) => esAdaptadorDriving(leida.origen))
        .map((leida) => leida.simbolo),
    );

    for (const operacion of OPERACIONES_CONSUMIDAS) {
      expect(importadas, `la pantalla deberia consumir ${operacion}`).toContain(operacion);
    }
  });

  it('ningun archivo de la pantalla llama a una ruta propia con `fetch`', (ctx) => {
    // Mismo preambulo que sus hermanos: la lista sale del diff de la rama.
    baseDeEstaRama(ctx);

    const conFetch = archivosDeLaPantalla().filter((archivo) =>
      /\bfetch\s*\(/.test(fuenteSinComentarios(archivo)),
    );

    expect(conFetch, `R36: usan fetch: ${conFetch.join(', ')}`).toEqual([]);
  });

  it('ni nace ningun route handler: `app/api/` no aparece en el diff', (ctx) => {
    const base = baseDeEstaRama(ctx);

    expect(aportadosPorLaRama(base, ['app/api'])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// R37 — ninguna dependencia nueva, y la UNICA excepcion de `components/ui/` va NOMBRADA
// ---------------------------------------------------------------------------------------------

/**
 * **La excepcion, escrita con su fecha y su motivo, no escondida.**
 *
 * El 2026-09-12 esta ficha trajo `components/ui/tabs.tsx` con `pnpm dlx shadcn@latest add tabs`,
 * que es exactamente lo que R37 MANDA hacer: la primitiva del conmutador viene de la CLI y nunca
 * se escribe a mano. Es por tanto un archivo NUEVO y autorizado, no la modificacion de ninguna
 * primitiva existente —que es lo que R37 prohibe—.
 *
 * La CLI, ademas, genero ese archivo con `import { cn } from "cn"` y anadio `cn@0.3.0` al
 * manifiesto. `cn@0.3.0` hace exactamente lo que `lib/utils.ts` ya hace en este repo, asi que el
 * humano decidio NO instalarla y corregir a mano esa unica linea a `@/lib/utils`. Que ninguna
 * primitiva vuelva a importar `cn` de otro sitio lo vigila
 * `tests/guards/guard-primitivas-ui-usan-el-cn-del-repo.test.ts`, guardia nueva de esta ficha:
 * **aqui no se duplica esa comprobacion**, y quien busque el import lo encuentra alli. Lo que se
 * comprueba aqui es el ALCANCE: que el alta es esa y ninguna mas.
 *
 * La asercion es una IGUALDAD contra esta lista cerrada. Nunca una desigualdad: «como mucho un
 * archivo» dejaria entrar al siguiente.
 */
const ALTAS_AUTORIZADAS_EN_PRIMITIVAS = ['components/ui/tabs.tsx'] as const;

describe('ninguna dependencia de terceros nueva (R37)', () => {
  it('`package.json` y `pnpm-lock.yaml` no cambian', (ctx) => {
    const base = baseDeEstaRama(ctx);

    const tocados = aportadosPorLaRama(base, ['package.json', 'pnpm-lock.yaml']);

    expect(tocados, `R37: el manifiesto cambio: ${tocados.join(', ')}`).toEqual([]);
  });

  it('de `components/ui/` esta rama aporta EXACTAMENTE la primitiva de pestanas', (ctx) => {
    const base = baseDeEstaRama(ctx);

    // Se mide lo que la rama APORTA —diff MAS archivos sin seguimiento—, no una de las dos
    // mitades. Aqui vivieron dos casos, uno por mitad: uno exigia `archivosCambiados === []` y el
    // otro `archivosSinSeguimiento === [tabs.tsx]`. Los dos se pusieron rojos EL MISMO DIA en que
    // el trabajo se commiteo, sin que cambiara ni un byte de `components/ui/`: lo unico que paso
    // es que `tabs.tsx` dejo de estar sin seguimiento y paso a estar en el diff.
    //
    // Eso era fragilidad del METODO, no rigor: R37 habla de QUE archivos toca la ficha, y eso no
    // puede depender de si ya se commitearon. La union no afloja nada —la igualdad sigue siendo
    // contra la MISMA lista cerrada de un solo elemento— y ademas cierra el agujero simetrico:
    // antes, modificar una primitiva existente Y dejarla sin commitear se colaba por la rendija
    // entre los dos casos.
    const aportadas = aportadosPorLaRama(base, ['components/ui']);

    expect(
      aportadas,
      `R37: de components/ui/ solo puede salir la primitiva traida por la CLI; salieron: ${aportadas.join(', ')}`,
    ).toEqual([...ALTAS_AUTORIZADAS_EN_PRIMITIVAS]);
  });
});

// ---------------------------------------------------------------------------------------------
// R12 y R39 — lo heredado se hereda: ni la tabla compartida ni las guardias se tocan
// ---------------------------------------------------------------------------------------------

/**
 * El alta de esta ficha en `tests/guards/`, nombrada. Es un archivo NUEVO —una guardia de mas, que
 * TENSA—, no la modificacion de ninguna existente: R39 prohibe relajar lo heredado, no prohibe
 * anadir vigilancia. Igualdad contra lista cerrada, como arriba.
 */
const ALTAS_AUTORIZADAS_EN_GUARDIAS = [
  'tests/guards/guard-primitivas-ui-usan-el-cn-del-repo.test.ts',
] as const;

/**
 * La UNICA guardia heredada que esta ficha modifica, nombrada una a una (2026-09-12).
 *
 * `guard-identificador-de-request.test.ts` compara `e2e/*.spec.ts` contra la lista **CERRADA**
 * `E2E_ESPERADOS`, y el E2E que R42 exige —`e2e/grupos-de-trabajo.spec.ts`— la ponia roja. Su
 * propio comentario dice que la lista es cerrada y que **su punto de extension por diseno es
 * darse de alta en ella**; QC-67 hizo exactamente esto en su T15 con `usuarios.spec.ts`, y su
 * comentario sigue a la vista unas lineas mas abajo en el mismo archivo.
 *
 * **Eso es TENSAR, que es lo que R39 manda, y no relajar**: el ancla se queda igual de estrecha
 * —la comparacion sigue siendo contra una lista cerrada, con el archivo nombrado uno a uno— y la
 * decision de QC-71 R21 sigue intacta, porque este E2E no prueba el identificador de peticion
 * sino el recorrido de la pestana. Si manana alguien deja caer OTRO `.spec.ts` sin darlo de alta,
 * aquella guardia se pone roja igual que antes.
 *
 * Se nombra AQUI, en igualdad contra lista cerrada, en vez de excluir `tests/guards/` del barrido:
 * excluir la carpeta dejaria pasar en silencio la modificacion de cualquier otra guardia, que es
 * justo lo que R39 prohibe.
 */
const GUARDIAS_HEREDADAS_QUE_ESTA_FICHA_TENSA = [
  'tests/guards/guard-identificador-de-request.test.ts',
] as const;

/** El E2E que R42 exige, y que es el motivo del alta de arriba. */
const E2E_DE_ESTA_FICHA = 'grupos-de-trabajo.spec.ts';

/** La guardia heredada que esta ficha tensa, en singular: el caso de abajo mide SU diff. */
const GUARDIA_TENSADA = GUARDIAS_HEREDADAS_QUE_ESTA_FICHA_TENSA[0];

/** Separadores de la salida de `git --numstat`, nombrados para no incrustar escapes sueltos. */
const SALTO_DE_LINEA = String.fromCharCode(10);
const TABULADOR = String.fromCharCode(9);

describe('la tabla compartida y las guardias heredadas quedan intactas (R12, R39)', () => {
  it('diff vacio en `components/shared/data-table/**`: se consume, no se edita', (ctx) => {
    const base = baseDeEstaRama(ctx);

    const tocados = aportadosPorLaRama(base, ['components/shared/data-table']);

    expect(tocados, `R12: la tabla compartida se toco: ${tocados.join(', ')}`).toEqual([]);
  });

  it('de `tests/guards/` esta rama aporta exactamente el alta nueva y la guardia que TENSA', (ctx) => {
    const base = baseDeEstaRama(ctx);

    // Misma leccion que en `components/ui/`: se mide lo APORTADO —diff mas sin seguimiento—, y no
    // una de las dos mitades, porque cual de las dos aplica depende de si ya se commiteo.
    const aportadas = aportadosPorLaRama(base, ['tests/guards']);

    const esperadas = [
      ...ALTAS_AUTORIZADAS_EN_GUARDIAS,
      ...GUARDIAS_HEREDADAS_QUE_ESTA_FICHA_TENSA,
    ].sort();

    expect(
      aportadas,
      `R39: de tests/guards/ solo pueden salir el alta nueva y la guardia tensada; salieron: ${aportadas.join(', ')}`,
    ).toEqual(esperadas);
  });

  it('y lo que esa guardia gana es un ALTA, no una asercion relajada: cero lineas borradas', (ctx) => {
    const base = baseDeEstaRama(ctx);

    // ANTI-RELAJACION, y es la mitad importante del caso de arriba: permitir que el archivo
    // cambie no dice NADA sobre en que direccion cambio. Aqui se mide. `--numstat` da
    // `anadidas <TAB> borradas <TAB> ruta`, y **borradas === 0** significa que no se quito ni una
    // linea: no se puede haber aflojado un `toEqual`, ni comentado un caso, ni acortado una lista
    // sin borrar algo. Lo unico que cabe es anadir, que es lo que R39 llama «tensar».
    const [numstat] = git(['diff', '--numstat', base, '--', GUARDIA_TENSADA])
      .split(SALTO_DE_LINEA)
      .filter((linea) => linea.trim() !== '');

    expect(numstat, `no hay diff para ${GUARDIA_TENSADA}`).toBeDefined();

    const [anadidas, borradas] = (numstat ?? '').split(TABULADOR);

    expect(
      borradas,
      `R39: ${GUARDIA_TENSADA} borro lineas. Un alta en una lista cerrada solo ANADE; ` +
        'borrar es la firma de una asercion relajada',
    ).toBe('0');
    expect(Number(anadidas), 'el alta tiene que anadir algo de verdad').toBeGreaterThan(0);

    // Y el spec se nombra UNO A UNO en la lista cerrada, no por patron ni por glob.
    expect(
      fuenteSinComentarios(GUARDIA_TENSADA),
      'el spec de esta ficha debe estar nombrado en la lista cerrada',
    ).toContain(`'${E2E_DE_ESTA_FICHA}'`);
    expect(
      existsSync(join(repoRoot, 'e2e', E2E_DE_ESTA_FICHA)),
      'el E2E que R42 exige tiene que existir de verdad',
    ).toBe(true);
  });

  it('y la guardia NUEVA es un archivo que antes no existia, no una heredada disfrazada', (ctx) => {
    const base = baseDeEstaRama(ctx);

    // `--diff-filter=A`: solo altas. Que un archivo este en la lista de «nuevos» tiene que ser un
    // hecho de git, no una afirmacion de este test.
    const altas = git(['diff', '--name-only', '--diff-filter=A', base, '--', 'tests/guards'])
      .split(SALTO_DE_LINEA)
      .map((linea) => linea.trim())
      .filter((linea) => linea !== '')
      .concat(archivosSinSeguimiento(['tests/guards']))
      .sort();

    expect(altas, `R39: altas en tests/guards/: ${altas.join(', ')}`).toEqual([
      ...ALTAS_AUTORIZADAS_EN_GUARDIAS,
    ]);
  });
});

// ---------------------------------------------------------------------------------------------
// R41 — los tests de esta carpeta no afirman sobre literales de copy
// ---------------------------------------------------------------------------------------------

/** Consultas que buscan por el TEXTO VISIBLE: si el copy cambia, el test se rompe. */
const CONSULTA_POR_TEXTO = /\b(?:get|find|query)(?:All)?By(?:Text|Title|AltText|DisplayValue)\s*\(/g;

/** Un nombre accesible escrito como literal dentro de una consulta por rol. */
const NOMBRE_ACCESIBLE_LITERAL = /ByRole\(\s*['"`][^'"`]*['"`]\s*,\s*\{[^}]*name\s*:\s*['"`]/g;

/**
 * Formas admitidas de identificar (R41): rol ARIA, `data-testid` o una constante EXPORTADA por el
 * barrel de la pantalla. La tercera no es un adorno: `usuarios-tabs.test.ts` y
 * `work-group-list-params.test.ts` son puros —sin DOM, sin React— y se apoyan enteros en las
 * constantes del barrel, que es exactamente lo que R41 admite.
 */
const IDENTIFICACION_ADMITIDA =
  /ByRole\(|ByTestId\(|data-testid|from '@\/app\/\(private\)\/configuracion\/usuarios\/components'/;

/** Un literal suelto afirmado como contenido de texto. */
const TEXTO_AFIRMADO_LITERAL = /toHaveTextContent\(\s*'([^']*)'\s*\)/g;

/**
 * Este mismo archivo queda fuera del barrido, y no por comodidad: es el DETECTOR, no un test de la
 * pantalla. No monta ningun componente ni consulta ningun DOM, y contiene a proposito la muestra
 * sintetica `MUESTRA_CON_COPY` —con un `getByText` y un nombre accesible literal— que prueba que
 * los patrones muerden. Si se barriera a si mismo se acusaria de su propio mordiente.
 */
const ESTE_DETECTOR = 'alcance.test.ts';

function testsDeEstaCarpeta(): readonly string[] {
  return readdirSync(join(repoRoot, CARPETA_DE_LOS_TESTS))
    .filter((nombre) => /\.test\.tsx?$/.test(nombre) && nombre !== ESTE_DETECTOR)
    .map((nombre) => `${CARPETA_DE_LOS_TESTS}/${nombre}`)
    .sort();
}

/** Las coincidencias de `patron` en `texto`. Se reutiliza para probar que el detector muerde. */
function coincidencias(texto: string, patron: RegExp): readonly string[] {
  return [...texto.matchAll(new RegExp(patron.source, patron.flags))].map(
    (coincidencia) => coincidencia[0],
  );
}

/**
 * Una muestra sintetica con las formas prohibidas, para probar que los patrones muerden.
 *
 * Las familias de consulta se ARMAN en tiempo de ejecucion —`['By', 'Text'].join('')`— y no se
 * escriben enteras, a proposito: `configuracion-convenciones.test.ts` barre esta misma carpeta
 * buscando consultas por copy (es la otra mitad de R41, heredada y mas estricta), y una muestra
 * escrita literal la pondria roja acusando a este detector justo de lo que persigue. La muestra
 * sigue siendo exactamente la misma cadena en ejecucion; lo unico que cambia es que el patron no
 * aparece en el TEXTO del archivo.
 */
const FAMILIA_POR_TEXTO = ['By', 'Text'].join('');
const FAMILIA_POR_TITULO = ['By', 'Title'].join('');
const FAMILIA_POR_ROL = ['By', 'Role'].join('');

const MUESTRA_CON_COPY = [
  `screen.get${FAMILIA_POR_TEXTO}('Crear grupo de trabajo');`,
  `screen.getAll${FAMILIA_POR_TITULO}('Editar');`,
  `screen.get${FAMILIA_POR_ROL}('button', { name: 'Guardar cambios' });`,
].join('\n');

describe('los tests de esta carpeta identifican por rol, testid o constante (R41)', () => {
  it('ninguno consulta por el TEXTO visible', () => {
    const infractores = testsDeEstaCarpeta().filter(
      (archivo) => coincidencias(fuenteSinComentarios(archivo), CONSULTA_POR_TEXTO).length > 0,
    );

    expect(infractores, `R41: consultan por copy: ${infractores.join(', ')}`).toEqual([]);
  });

  it('ninguno escribe el nombre accesible como literal dentro de una consulta por rol', () => {
    const infractores = testsDeEstaCarpeta().filter(
      (archivo) =>
        coincidencias(fuenteSinComentarios(archivo), NOMBRE_ACCESIBLE_LITERAL).length > 0,
    );

    expect(infractores, `R41: nombre accesible literal en: ${infractores.join(', ')}`).toEqual([]);
  });

  it('el detector muerde: sobre una muestra con copy encuentra las TRES formas', () => {
    // El caso simetrico obligatorio. Sin el, los dos `toEqual([])` de arriba podrian ser verdes
    // porque el patron estuviera mal escrito y no reconociera nada en ningun sitio.
    expect(coincidencias(MUESTRA_CON_COPY, CONSULTA_POR_TEXTO)).toHaveLength(2);
    expect(coincidencias(MUESTRA_CON_COPY, NOMBRE_ACCESIBLE_LITERAL)).toHaveLength(1);
  });

  it('cada literal afirmado como texto es un CODIGO ESTABLE del catalogo, no copy', () => {
    // Afirmar sobre `'unauthorized'` no es afirmar sobre copy: es el codigo del contrato, que R24,
    // R29 y R34 obligan a distinguir por codigo y nunca por su texto. Lo que R41 prohibe es el
    // MENSAJE. Se comprueba contra `ERROR_CODES` IMPORTADO, no contra una lista escrita aqui.
    const literales = testsDeEstaCarpeta().flatMap((archivo) =>
      [...fuenteSinComentarios(archivo).matchAll(TEXTO_AFIRMADO_LITERAL)].map((coincidencia) => ({
        archivo,
        literal: coincidencia[1]!,
      })),
    );

    const queSonCopy = literales.filter(
      ({ literal }) => !(ERROR_CODES as readonly string[]).includes(literal),
    );

    expect(
      queSonCopy.map(({ archivo, literal }) => `${archivo}: ${literal}`),
      'R41: estos literales no son codigos del catalogo, son copy',
    ).toEqual([]);

    // Mordiente: si nadie afirmara texto, el filtro de arriba seria vacio por vacuidad.
    expect(literales.length).toBeGreaterThan(0);
  });

  it('y todos identifican por alguna de las formas admitidas: el barrido lee archivos de verdad', () => {
    const archivos = testsDeEstaCarpeta();

    expect(archivos.length).toBeGreaterThanOrEqual(15);

    const sinIdentificacionAdmitida = archivos.filter(
      (archivo) => !IDENTIFICACION_ADMITIDA.test(fuente(archivo)),
    );

    expect(sinIdentificacionAdmitida).toEqual([]);
  });
});
