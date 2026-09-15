// QC-101 T11 — EL TEST DE ALCANCE de la ficha. Cubre R18, R19, R20, R21 y R22.
//
// Los cinco son requisitos de AUSENCIA: los limites de la tabla de «Decisiones cerradas» de
// `specs/QC-101-cierre-de-sesiones-de-otro-desde-la-pantalla/requirements.md`, escritos como
// requisitos para que tengan test propio. Y un requisito de ausencia no se demuestra leyendo el
// codigo, se demuestra MIDIENDO: el catalogo y el manifiesto contra los de la base de fusion, el
// cambio de la rama contra lo que la ficha aparto, y el fuente del puerto contra la decision que lo
// cerro.
//
//   * R18 — ningun permiso nuevo. El conjunto de codigos de `PERMISSIONS` es IDENTICO al de la base
//     de fusion, y `sesiones.modificar` no aparece en el catalogo ni en nada que el diff toque bajo
//     `db/` (migraciones, seed, esquema) ni en el codigo que toque bajo `lib/`. La autorizacion
//     sigue siendo `usuarios.modificar`, heredada de QC-23 (`end-all-sessions.ts:33-35`).
//   * R19 — ningun conteo de sesiones. El diff no toca `end-all-sessions.ts` -que devuelve `void`-
//     ni el puerto de revocacion, y ningun archivo anadido o modificado bajo
//     `lib/modules/identity/` declara una firma que devuelva un conteo (regla exacta en
//     `hallazgosDeConteo`). La OTRA mitad de R19 -«ningun texto de la interfaz afirma cuantas se
//     cerraron»- NO se duplica aqui: la cubre `tests/unit/configuracion-ui/user-labels.test.ts`,
//     que es donde viven los textos de esa pantalla.
//   * R20 — ninguna lista de sesiones vivas. El puerto declara EXACTAMENTE `revokeSession` y
//     `stampAll`. Es lo unico de este archivo que NO depende del rango: no es alcance de una rama,
//     es una decision permanente sobre una pieza permanente (la decision cerrada 12 de QC-23).
//   * R21 — ni el boton del PROPIO usuario (es QC-53): `endOtherSessions` no lo nombra nadie fuera
//     del dominio, del contrato del modulo y de `lib/composition`, y ningun archivo de `app/` que
//     el diff toque ofrece «cerrar mis sesiones».
//   * R22 — ninguna dependencia: los NOMBRES de `dependencies` + `devDependencies` son los mismos
//     que en la base de fusion. Complementa -no duplica- a
//     `tests/guards/guard-dependencias-aprobadas.test.ts`.
//
// ---------------------------------------------------------------------------------------------
// LA LECCION QUE ESTE ARCHIVO NO PUEDE REPETIR
// ---------------------------------------------------------------------------------------------
//
// `progress/history.md` registra que las guardias de alcance de QC-45 y QC-65 se volvieron BOMBAS
// DE RELOJERIA: mergeadas en `dev`, midieron CUALQUIER rama posterior con las reglas de una ficha
// que ya no era la suya y pusieron en rojo el gate por trabajo legitimo ajeno. Aqui la bomba tiene
// fecha: R21 dice «nadie invoca `endOtherSessions` desde la interfaz» y **QC-53** existe
// precisamente para escribir esa invocacion. Sin precondicion, este archivo se pondria rojo el dia
// que QC-53 haga su trabajo.
//
// De ahi las decisiones, copiadas del molde `tests/unit/identity/qc23-alcance.test.ts`:
//
//   1. PRECONDICION DE RAMA CONJUNTIVA (`esLaRamaDeQC101()`): los casos que miden el CAMBIO solo
//      aplican si el diff trae A LA VEZ `adapters/driving/session-actions.ts` -el archivo que nace
//      en esta ficha- y algo bajo `specs/QC-101-cierre-de-sesiones-de-otro-desde-la-pantalla/`.
//      La action sola no discrimina: QC-53 y QC-89 van a MODIFICAR ese archivo. La carpeta de spec
//      si: nace y vive en el rango de ESTA rama, y la de otra ficha trae la suya.
//   2. TRES SITUACIONES, DOS SEVERIDADES. «No puedo mirar» (el rango no resuelve) es ROJO: un test
//      que se auto-desactiva cuando no puede mirar es indistinguible de uno roto. «Esto no es lo
//      mio» y «no hay nada que mirar» son `ctx.skip()` con un mensaje que dice EN VOZ ALTA que ese
//      caso NO HA COMPROBADO NADA.
//   3. REGLAS PURAS Y EXPORTADAS, cada una con su caso de mordida: se demuestra que DISPARAN con
//      datos fabricados, y no solo que hoy no hay nada que las dispare.
//
// SOBRE LAS COPIAS. `cambiosDeLaRama`, `stripComments`, `metodosDelPuerto`, `hallazgosDeListado` y
// `dependenciasDeclaradas` estan COPIADAS de `qc23-alcance.test.ts`, y no importadas: aquel archivo
// declara sus `describe` a nivel de modulo, e importarlo desde aqui REGISTRARIA SUS CASOS OTRA VEZ
// dentro de este archivo (con su precondicion de QC-23, que en esta rama los salta, pero duplicados
// en el informe). Si una copia diverge del original, el original manda.

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, type TestContext } from 'vitest';

const RAIZ = join(__dirname, '..', '..', '..');
const RANGO = 'git merge-base origin/dev HEAD';

const ACTION = 'lib/modules/identity/adapters/driving/session-actions.ts';
const CARPETA_SPEC_DE_QC101 = 'specs/QC-101-cierre-de-sesiones-de-otro-desde-la-pantalla/';
const PUERTO = 'lib/modules/identity/ports/session-revocation-repository.ts';
const CASO_DE_USO_DEL_CIERRE = 'lib/modules/identity/domain/end-all-sessions.ts';
const CATALOGO = 'lib/modules/identity/domain/permissions.ts';
const PERMISO_PROHIBIDO = 'sesiones.modificar';

function git(comando: string): string {
  return execSync(comando, { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function aPosix(ruta: string): string {
  return ruta.split('\\').join('/');
}

function leer(ruta: string): string {
  return readFileSync(join(RAIZ, ruta), 'utf8');
}

/** La base de fusion con `origin/dev`, o `null` si el rango no esta disponible aqui. */
function baseDeFusionConDev(): string | null {
  try {
    return git(RANGO).trim();
  } catch {
    return null;
  }
}

/** Como `baseDeFusionConDev`, pero LANZA: los casos que la usan ya pasaron la precondicion. */
function baseObligatoria(): string {
  const base = baseDeFusionConDev();
  if (base === null) {
    throw new Error(
      `\`${RANGO}\` no resolvio, asi que este caso NO se ha comprobado. Falla en vez de pasar.`,
    );
  }
  return base;
}

export type Cambio = { readonly ruta: string; readonly estado: 'A' | 'M' | 'D' };

function combinar(
  anterior: Cambio['estado'] | undefined,
  nuevo: Cambio['estado'],
): Cambio['estado'] {
  if (anterior === undefined) return nuevo;
  if (anterior === 'A' || nuevo === 'A') return 'A';
  if (anterior === 'D' || nuevo === 'D') return 'D';
  return 'M';
}

function estadoDesdeGit(codigo: string): Cambio['estado'] {
  if (codigo.startsWith('A') || codigo.startsWith('?') || codigo.startsWith('C')) return 'A';
  if (codigo.startsWith('D')) return 'D';
  return 'M';
}

/**
 * Los cambios de esta rama respecto de la base de fusion con `origin/dev`: los del rango MAS los
 * del arbol de trabajo, para que esto muerda ANTES de commitear. Copia de `qc23-alcance.test.ts`.
 *
 * LANZA -a proposito- si el rango no se puede calcular: «no puedo mirar» es rojo.
 */
export function cambiosDeLaRama(): readonly Cambio[] {
  let delRango: string;
  try {
    const base = baseDeFusionConDev();
    if (base === null) throw new Error('`git merge-base origin/dev HEAD` no resolvio');
    delRango = git(`git diff --name-status ${base}`);
  } catch (error) {
    throw new Error(
      `No se pudo calcular el diff contra \`${RANGO}\`, asi que R18, R19, R21 y R22 NO se han ` +
        `comprobado. Este test falla en vez de pasar en silencio. Causa: ${String(error)}`,
    );
  }

  const porRuta = new Map<string, Cambio['estado']>();

  for (const linea of delRango.split('\n')) {
    const limpia = linea.trim();
    if (limpia.length === 0) continue;
    const partes = limpia.split('\t');
    const codigo = partes[0] ?? 'M';
    const ruta = aPosix((partes[partes.length - 1] ?? '').trim());
    if (ruta.length === 0) continue;
    porRuta.set(ruta, combinar(porRuta.get(ruta), estadoDesdeGit(codigo)));
  }

  // `--untracked-files=all` NO es decorativo: sin el, `git status --porcelain` COLAPSA una carpeta
  // sin seguimiento en una sola linea y no lista lo que hay dentro (leccion de `qc78-alcance`).
  for (const linea of git('git status --porcelain --untracked-files=all').split('\n')) {
    if (linea.trim().length === 0) continue;
    const codigo = linea.slice(0, 2).trim();
    const camino = linea.slice(3).trim();
    const destino = camino.includes(' -> ') ? (camino.split(' -> ')[1] ?? camino) : camino;
    const ruta = aPosix(destino.replace(/^"|"$/g, ''));
    if (ruta.length === 0 || ruta.endsWith('/')) continue;
    porRuta.set(ruta, combinar(porRuta.get(ruta), estadoDesdeGit(codigo)));
  }

  return [...porRuta.entries()]
    .map(([ruta, estado]) => ({ ruta, estado }))
    .sort((uno, otro) => uno.ruta.localeCompare(otro.ruta));
}

export function rutasDe(cambios: readonly Cambio[]): readonly string[] {
  return cambios.map((cambio) => cambio.ruta);
}

// ---------------------------------------------------------------------------------------------
// LA PRECONDICION DE RAMA
// ---------------------------------------------------------------------------------------------

/** Conjuntiva a proposito: las dos senales, o esto no es la rama de QC-101. Ver la cabecera. */
export function esLaRamaDeQC101(rutas: readonly string[]): boolean {
  return rutas.includes(ACTION) && rutas.some((ruta) => ruta.startsWith(CARPETA_SPEC_DE_QC101));
}

function cambiosOMudo(ctx: Pick<TestContext, 'skip'>): readonly Cambio[] {
  const cambios = cambiosDeLaRama();
  if (cambios.length === 0) {
    ctx.skip(
      'la rama no toca ningun archivo respecto de la base de fusion con `origin/dev`: no hay diff ' +
        'que revisar, asi que este caso NO HA COMPROBADO NADA (ni R18, ni R19, ni R21, ni R22).',
    );
  }
  if (!esLaRamaDeQC101(rutasDe(cambios))) {
    ctx.skip(
      'el rango no trae a la vez `' +
        ACTION +
        '` y `' +
        CARPETA_SPEC_DE_QC101 +
        '`: esta NO es la rama de QC-101, asi que este caso NO HA COMPROBADO NADA. R18, R19, R21 y ' +
        'R22 son el alcance de ESA ficha y no le aplican a ninguna otra -QC-53 viene justo a ' +
        'escribir el boton del propio usuario que R21 aparta- (la leccion de QC-45 y QC-65 en ' +
        '`progress/history.md`).',
    );
  }
  return cambios;
}

/** Los archivos que el diff AGREGA o MODIFICA (los borrados no se pueden leer del disco). */
function vivosDelDiff(cambios: readonly Cambio[]): readonly string[] {
  return cambios.filter((cambio) => cambio.estado !== 'D').map((cambio) => cambio.ruta);
}

function leerSiExiste(ruta: string): string | null {
  return existsSync(join(RAIZ, ruta)) ? leer(ruta) : null;
}

// ---------------------------------------------------------------------------------------------
// LAS REGLAS, COMO FUNCIONES PURAS
// ---------------------------------------------------------------------------------------------

/**
 * Copia de `stripComments` de `qc23-alcance.test.ts`. Hace falta porque los archivos de esta zona
 * NOMBRAN en su prosa justo lo que prohiben -`end-all-sessions.ts` explica por que no hay
 * `sesiones.modificar`, y la action explica que no devuelve cuantas sesiones cerro-, y sin
 * descontar comentarios las reglas nacerian rojas por documentar su propia razon de ser.
 *
 * **El orden importa: los de LINEA primero, los de BLOQUE despues.**
 */
export function stripComments(source: string): string {
  return source
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/** Lo mismo para SQL: comentarios `-- ...` de linea y `/* ... *\/` de bloque. */
export function stripSqlComments(source: string): string {
  return source
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/** Lo que dos conjuntos de nombres NO comparten, en los dos sentidos. Vacio y vacio = identicos. */
export function diferenciaDeConjuntos(
  antes: readonly string[],
  ahora: readonly string[],
): { readonly anadidos: string[]; readonly quitados: string[] } {
  const previos = new Set(antes);
  const actuales = new Set(ahora);
  return {
    anadidos: [...actuales].filter((nombre) => !previos.has(nombre)).sort(),
    quitados: [...previos].filter((nombre) => !actuales.has(nombre)).sort(),
  };
}

// --- R18 -------------------------------------------------------------------------------------

/**
 * R18 — los codigos del catalogo cerrado, leidos del FUENTE de `permissions.ts` (el de ahora o el
 * de la base de fusion por `git show`): las cadenas `code: '...'` dentro del arreglo `PERMISSIONS`.
 * Se lee el fuente y no el valor importado porque el de la base de fusion NO se puede importar.
 *
 * LANZA si no encuentra el arreglo o no hay ningun codigo: un catalogo ilegible daria dos conjuntos
 * vacios, «identicos», y el caso pasaria sin mirar.
 */
export function codigosDelCatalogo(fuente: string): string[] {
  const codigo = stripComments(fuente);
  const cuerpo = /export const PERMISSIONS\s*=\s*\[([\s\S]*?)\]\s*as const/.exec(codigo);
  if (cuerpo === null) {
    throw new Error(
      `No se encontro \`export const PERMISSIONS = [...] as const\` en ${CATALOGO}. Si se ` +
        'renombro o se movio, este test dejo de vigilar R18 y hay que arreglarlo, no borrarlo.',
    );
  }
  const codigos = [...(cuerpo[1] ?? '').matchAll(/\bcode:\s*['"]([^'"]+)['"]/g)].map(
    (match) => match[1] ?? '',
  );
  if (codigos.length === 0) {
    throw new Error(`\`PERMISSIONS\` en ${CATALOGO} no declara ningun \`code\` legible.`);
  }
  return codigos.sort();
}

/**
 * R18 — los archivos (agregados o modificados) que mencionan `sesiones.modificar` EN CODIGO, sin
 * contar comentarios: bajo `db/` (migraciones SQL, seed, esquema) y bajo `lib/`. Recibe el lector
 * por parametro para poder fabricar el caso de mordida sin tocar el disco.
 */
export function mencionesDelPermisoProhibido(
  rutas: readonly string[],
  leerFuente: (ruta: string) => string | null,
): string[] {
  return rutas
    .filter((ruta) => ruta.startsWith('db/') || ruta.startsWith('lib/'))
    .filter((ruta) => {
      const fuente = leerFuente(ruta);
      if (fuente === null) return false;
      const codigo = ruta.endsWith('.sql') ? stripSqlComments(fuente) : stripComments(fuente);
      return codigo.includes(PERMISO_PROHIBIDO);
    })
    .sort();
}

// --- R19 -------------------------------------------------------------------------------------

/** R19 — los archivos que devuelven `void` o un resultado discriminado y que el diff NO debe tocar. */
const SIN_TOCAR_POR_R19: readonly string[] = [CASO_DE_USO_DEL_CIERRE, PUERTO];

export function archivosDelCierreTocados(cambios: readonly Cambio[]): string[] {
  return cambios
    .filter((cambio) => SIN_TOCAR_POR_R19.includes(cambio.ruta))
    .map((cambio) => `${cambio.ruta} (${cambio.estado})`)
    .sort();
}

/**
 * R19 — LA REGLA DE «NINGUN CONTEO», y su criterio.
 *
 * Un conteo de sesiones no se reconoce por su nombre en todos los casos, asi que la regla tiene dos
 * pisos, y se aplica sobre el fuente SIN comentarios de cada archivo agregado o modificado bajo
 * `lib/modules/identity/`:
 *
 *   1. EN CUALQUIER ARCHIVO DEL MODULO: un identificador que NOMBRA un conteo de sesiones
 *      (`sessionCount`, `closedSessionsCount`, `countSessions`, `numberOfSessions`, `totalSessions`,
 *      `sessionsClosed`, `revokedCount`...).
 *   2. EN LOS ARCHIVOS DE SESION (ruta con `session`, p. ej. `session-actions.ts`): ninguna firma que
 *      devuelva un numero (`): number`, `Promise<number>`, `=> number`) y ninguna clave de tipo
 *      numerica (`closed: number`). Es donde un conteo se colaria SIN nombre de conteo: un
 *      `{ status: 'success'; closed: number }` en el estado de la action. Hoy el estado de exito es
 *      `{ status: 'success' }` y nada mas (R5), y el caso de uso devuelve `void`.
 *
 * El segundo piso NO se aplica al resto del modulo a proposito: `list-query.ts` o `page.ts` tienen
 * numeros legitimos (pagina, tamano) que no son de sesiones, y convertirlos en rojo seria ruido.
 */
const NOMBRES_DE_CONTEO: readonly { readonly patron: RegExp; readonly motivo: string }[] = [
  {
    patron: /\b\w*[Ss]essions?(?:Count|Total|Closed|Revoked|Number)\w*\b/,
    motivo: 'nombra un conteo de sesiones (session...Count/Total/Closed)',
  },
  {
    patron: /\b(?:count|total|numberOf|num)\w*Sessions?\b/i,
    motivo: 'nombra un conteo de sesiones (count/total/numberOf...Sessions)',
  },
  { patron: /\brevokedCount\b|\bclosedCount\b/, motivo: 'nombra un conteo de revocaciones' },
];

const FIRMAS_NUMERICAS: readonly { readonly patron: RegExp; readonly motivo: string }[] = [
  { patron: /\bPromise<\s*number\s*>/, motivo: 'declara una firma que devuelve Promise<number>' },
  { patron: /\)\s*:\s*number\b/, motivo: 'declara una funcion que devuelve number' },
  { patron: /=>\s*number\b/, motivo: 'declara un tipo funcion que devuelve number' },
  { patron: /\b[A-Za-z_$][\w$]*\??\s*:\s*number\b/, motivo: 'declara una clave numerica' },
];

export function hallazgosDeConteo(ruta: string, fuente: string): string[] {
  if (!ruta.startsWith('lib/modules/identity/')) return [];
  const codigo = stripComments(fuente);
  const reglas = /session/i.test(ruta) ? [...NOMBRES_DE_CONTEO, ...FIRMAS_NUMERICAS] : NOMBRES_DE_CONTEO;
  return reglas.filter(({ patron }) => patron.test(codigo)).map(({ motivo }) => motivo);
}

// --- R20 (copia de `qc23-alcance.test.ts`) -----------------------------------------------------

/**
 * Los metodos que declara la interfaz del puerto, leidos del FUENTE y no del tipo: un test que
 * importara el tipo no podria decir «y ninguno mas». Identificadores seguidos de `(` a dos espacios
 * de sangria dentro del cuerpo de la interfaz; las claves de los objetos de entrada viven a cuatro.
 */
export function metodosDelPuerto(fuente: string): string[] {
  const codigo = stripComments(fuente);
  const cuerpo = /export interface SessionRevocationRepository\s*\{([\s\S]*?)\n\}/.exec(codigo);
  if (cuerpo === null) {
    throw new Error(
      `No se encontro la interfaz \`SessionRevocationRepository\` en ${PUERTO}. Si se renombro, ` +
        'este test dejo de vigilar R20 y hay que arreglarlo, no borrarlo.',
    );
  }
  const metodos: string[] = [];
  for (const linea of (cuerpo[1] ?? '').split('\n')) {
    const match = /^ {2}([A-Za-z_$][\w$]*)\s*\(/.exec(linea);
    if (match?.[1] !== undefined) metodos.push(match[1]);
  }
  return metodos.sort();
}

const FORMAS_DE_LISTADO: readonly { readonly patron: RegExp; readonly motivo: string }[] = [
  { patron: /\blist[A-Z]\w*\s*\(/, motivo: 'declara un listado (list...)' },
  { patron: /\bfind[A-Z]\w*\s*\(/, motivo: 'declara una busqueda (find...)' },
  { patron: /\bget[A-Z]\w*\s*\(/, motivo: 'declara un lector (get...)' },
  { patron: /\bsearch\w*\s*\(/i, motivo: 'declara una busqueda (search...)' },
  { patron: /\b\w*[Ss]essions\s*\(/, motivo: 'declara una operacion sobre sesiones EN PLURAL' },
  { patron: /\b\w*[Dd]evices?\s*\(/, motivo: 'declara una operacion sobre dispositivos' },
];

/** Los motivos por los que el fuente del puerto infringe R20. Vacio = limpio. */
export function hallazgosDeListado(fuente: string): string[] {
  const codigo = stripComments(fuente);
  return FORMAS_DE_LISTADO.filter(({ patron }) => patron.test(codigo)).map(({ motivo }) => motivo);
}

// --- R21 -------------------------------------------------------------------------------------

/**
 * R21 — quien puede NOMBRAR `endOtherSessions` (el cierre «de mis otras sesiones», de QC-53): el
 * dominio que la define, el contrato que la reexporta y el punto de composicion que la cablea. Los
 * tests no entran en la busqueda. Cualquier otro archivo -de `app/`, `components/`, `hooks/` o un
 * `adapters/driving/`- es exactamente el boton que esta ficha aparta hacia QC-53.
 *
 * La coincidencia distingue mayusculas: `createEndOtherSessions` (la factoria, que si reexporta el
 * contrato) no es `endOtherSessions`; `endOtherSessionsAction` SI lo es, y es justo lo que se busca.
 */
export function nombraEndOtherSessions(fuente: string): boolean {
  return /endOtherSessions/.test(stripComments(fuente));
}

export function endOtherSessionsFueraDeSitio(archivos: readonly string[]): string[] {
  return archivos
    .filter(
      (ruta) =>
        ruta !== 'lib/composition/index.ts' &&
        ruta !== 'lib/modules/identity/index.ts' &&
        !ruta.startsWith('lib/modules/identity/domain/'),
    )
    .sort();
}

/**
 * R21 — LA REGLA DE «CERRAR MIS SESIONES», y su criterio. Sobre el fuente SIN comentarios (los de
 * JSX `{/* *\/}` incluidos) de cada archivo de `app/` que el diff AGREGA o MODIFICA -R21 dice
 * «ninguna pantalla nueva NI EXISTENTE», asi que se miran las dos-, cualquiera de estas formas:
 *
 *   - «cerrar (todas) mis/tus (otras) sesiones», en cualquier caja: el texto del boton de QC-53;
 *   - «otros dispositivos» / «demas dispositivos»: el cierre de las OTRAS sesiones de uno mismo;
 *   - un identificador `endMySessions`, `closeOwnSessions`...: la accion con otro nombre.
 *
 * NO dispara con «Cerrar sesion» (el logout, singular y ya existente) ni con «Cerrar todas las
 * sesiones de Ana Rodriguez» (lo que esta ficha SI ofrece, sobre OTRA persona). Tampoco con «sus
 * sesiones», a proposito: en esta pantalla «sus» es la persona del panel, no quien pulsa.
 */
const FORMAS_DE_CIERRE_PROPIO: readonly { readonly patron: RegExp; readonly motivo: string }[] = [
  {
    patron: /cerrar\s+(?:todas\s+)?(?:mis|tus)\s+(?:otras\s+)?sesiones/i,
    motivo: 'ofrece «cerrar mis/tus sesiones»',
  },
  {
    patron: /(?:otros|dem[aá]s)\s+dispositivos/i,
    motivo: 'ofrece cerrar la sesion en los otros dispositivos de uno mismo',
  },
  {
    patron: /\b(?:end|close|cerrar)(?:My|Own|Mis)\w*Sessions?\b/i,
    motivo: 'declara una accion de cierre de las sesiones propias',
  },
];

export function hallazgosDeCierrePropio(fuente: string): string[] {
  const codigo = stripComments(fuente);
  return FORMAS_DE_CIERRE_PROPIO.filter(({ patron }) => patron.test(codigo)).map(
    ({ motivo }) => motivo,
  );
}

/** Los archivos del codigo (sin tests) que nombran `endOtherSessions`, incluidos los sin seguimiento. */
function archivosQueNombranEndOtherSessions(): string[] {
  let salida: string;
  try {
    salida = git(
      'git grep -l --untracked -E "endOtherSessions" -- app components hooks lib middleware.ts',
    );
  } catch {
    // `git grep` sale con codigo 1 cuando no encuentra nada: sin coincidencias no hay infraccion.
    return [];
  }
  return salida
    .split('\n')
    .map((linea) => aPosix(linea.trim()))
    .filter((ruta) => ruta.length > 0)
    .filter((ruta) => nombraEndOtherSessions(leer(ruta)))
    .sort();
}

// --- R22 (copia de `qc23-alcance.test.ts`) -----------------------------------------------------

/** R22 — los NOMBRES de `dependencies` + `devDependencies` de un `package.json`. */
export function dependenciasDeclaradas(manifiesto: string): string[] {
  const paquete = JSON.parse(manifiesto) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  return [
    ...Object.keys(paquete.dependencies ?? {}),
    ...Object.keys(paquete.devDependencies ?? {}),
  ].sort();
}

// ---------------------------------------------------------------------------------------------
// ANCLAS — no dependen del rango, y sin ellas todo lo de abajo podria estar verde sin mirar
// ---------------------------------------------------------------------------------------------

describe('QC-101 — el test de alcance sabe leer de verdad (anclas independientes del rango)', () => {
  it('el catalogo de permisos existe y se lee con `usuarios.modificar` dentro y sin `sesiones.modificar`', () => {
    expect(existsSync(join(RAIZ, CATALOGO))).toBe(true);
    const codigos = codigosDelCatalogo(leer(CATALOGO));
    expect(codigos.length).toBeGreaterThan(0);
    expect(codigos).toContain('usuarios.modificar');
    expect(codigos).not.toContain(PERMISO_PROHIBIDO);
  });

  it('el puerto existe y trae la interfaz que se vigila', () => {
    expect(existsSync(join(RAIZ, PUERTO))).toBe(true);
    expect(leer(PUERTO)).toMatch(/export interface SessionRevocationRepository\s*\{/);
  });

  it('`package.json` existe, parsea y declara dependencias', () => {
    const nombres = dependenciasDeclaradas(leer('package.json'));
    expect(nombres.length).toBeGreaterThan(0);
    expect(nombres).toContain('@prisma/client');
  });

  it(`\`${RANGO}\` resuelve; si no, este test falla ruidosamente en vez de saltarse`, () => {
    expect(() => cambiosDeLaRama()).not.toThrow();
  });

  it('la precondicion es conjuntiva: una senal sola no basta', () => {
    expect(esLaRamaDeQC101([ACTION, `${CARPETA_SPEC_DE_QC101}tasks.md`])).toBe(true);
    // QC-53 modificara la action, pero trae SU carpeta de spec: no es esta rama.
    expect(esLaRamaDeQC101([ACTION, 'specs/QC-53-cerrar-mis-sesiones/tasks.md'])).toBe(false);
    expect(esLaRamaDeQC101([`${CARPETA_SPEC_DE_QC101}tasks.md`])).toBe(false);
    expect(esLaRamaDeQC101([])).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// R18 — ningun permiso nuevo
// ---------------------------------------------------------------------------------------------

describe('R18 — el catalogo de permisos no cambia y no nace `sesiones.modificar`', () => {
  it('el conjunto de codigos del catalogo es identico al de la base de fusion con `origin/dev`', (ctx) => {
    cambiosOMudo(ctx);
    const base = baseObligatoria();
    const antes = codigosDelCatalogo(git(`git show ${base}:${CATALOGO}`));
    const diferencia = diferenciaDeConjuntos(antes, codigosDelCatalogo(leer(CATALOGO)));

    expect(
      diferencia,
      'QC-101 R18: esta ficha NO toca el catalogo cerrado de permisos. La autorizacion del cierre ' +
        'es `usuarios.modificar`, heredada de QC-23, y un `sesiones.modificar` seria la cuarta ' +
        'enmienda al catalogo de QC-74, con migracion y seed de `role_permissions`, sin separar ' +
        `ninguna capacidad real (\`end-all-sessions.ts:33-35\`). Anadidos: ` +
        `${diferencia.anadidos.join(', ')} · Quitados: ${diferencia.quitados.join(', ')}`,
    ).toEqual({ anadidos: [], quitados: [] });
  });

  it('`sesiones.modificar` no aparece en codigo de `db/` ni de `lib/` que el diff toque', (ctx) => {
    const cambios = cambiosOMudo(ctx);
    const menciones = mencionesDelPermisoProhibido(vivosDelDiff(cambios), leerSiExiste);

    expect(
      menciones,
      'QC-101 R18: ningun archivo que la rama agrega o modifica bajo `db/` (migracion, seed, ' +
        'esquema) o `lib/` declara `sesiones.modificar` fuera de un comentario. Archivos:\n' +
        menciones.join('\n'),
    ).toEqual([]);
  });

  it('las reglas de R18 disparan con un catalogo y un diff fabricados, y no con unos limpios', () => {
    const catalogo = (codigos: readonly string[]): string =>
      [
        '// Aqui NO hay ningun code: \'sesiones.modificar\', y se dice en un comentario.',
        'export const PERMISSIONS = [',
        ...codigos.map((codigo) => `  { code: '${codigo}', module: 'x', action: 'y' },`),
        '] as const;',
      ].join('\n');

    const antes = codigosDelCatalogo(catalogo(['usuarios.consultar', 'usuarios.modificar']));
    expect(antes).toEqual(['usuarios.consultar', 'usuarios.modificar']);

    expect(
      diferenciaDeConjuntos(
        antes,
        codigosDelCatalogo(catalogo(['usuarios.consultar', 'usuarios.modificar', 'sesiones.modificar'])),
      ),
    ).toEqual({ anadidos: ['sesiones.modificar'], quitados: [] });
    // Quitar un permiso tampoco es «identico».
    expect(diferenciaDeConjuntos(antes, codigosDelCatalogo(catalogo(['usuarios.consultar'])))).toEqual(
      { anadidos: [], quitados: ['usuarios.modificar'] },
    );
    expect(diferenciaDeConjuntos(antes, [...antes].reverse())).toEqual({ anadidos: [], quitados: [] });
    // Un catalogo ilegible NO pasa como «vacio e identico»: lanza.
    expect(() => codigosDelCatalogo('export const OTRA_COSA = [];')).toThrow();

    const fuentes: Record<string, string> = {
      'db/migrations/20260915000000_sesiones/migration.sql':
        "INSERT INTO permissions (code) VALUES ('sesiones.modificar');",
      'db/seed.ts': "const extra = ['sesiones.modificar'];",
      'lib/modules/identity/domain/end-all-sessions.ts':
        "// NO un permiso nuevo `sesiones.modificar`\nrequirePermission(actor, 'usuarios.modificar');",
      'db/migrations/20260915000001_limpia/migration.sql':
        "-- sin sesiones.modificar, a proposito\nSELECT 1;",
      'app/(private)/configuracion/usuarios/page.tsx': "const x = 'sesiones.modificar';",
    };
    const leerFabricado = (ruta: string): string | null => fuentes[ruta] ?? null;

    expect(mencionesDelPermisoProhibido(Object.keys(fuentes), leerFabricado)).toEqual([
      'db/migrations/20260915000000_sesiones/migration.sql',
      'db/seed.ts',
    ]);
    expect(
      mencionesDelPermisoProhibido(
        [
          'lib/modules/identity/domain/end-all-sessions.ts',
          'db/migrations/20260915000001_limpia/migration.sql',
          'db/no-existe.sql',
        ],
        leerFabricado,
      ),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// R19 — ningun conteo de sesiones
// ---------------------------------------------------------------------------------------------

describe('R19 — el dominio no gana ningun conteo de sesiones', () => {
  it('el diff no toca `end-all-sessions.ts` ni el puerto de revocacion', (ctx) => {
    const cambios = cambiosOMudo(ctx);
    const tocados = archivosDelCierreTocados(cambios);

    expect(
      tocados,
      'QC-101 R19: `end-all-sessions.ts` devuelve `void` y el puerto devuelve `ok | not_found`; ' +
        'contar sesiones cerradas exigiria la lectura por peticion que QC-23 descarto a proposito. ' +
        'Ademas tocar el puerto despierta la guardia de alcance de QC-23 (`design.md > 0`, ' +
        `hallazgo 2). Archivos tocados:\n${tocados.join('\n')}`,
    ).toEqual([]);
  });

  it('ningun archivo agregado o modificado bajo `lib/modules/identity/` declara un conteo', (ctx) => {
    const cambios = cambiosOMudo(ctx);
    const hallazgos = vivosDelDiff(cambios)
      .filter((ruta) => ruta.startsWith('lib/modules/identity/'))
      .flatMap((ruta) => {
        const fuente = leerSiExiste(ruta);
        if (fuente === null) return [];
        return hallazgosDeConteo(ruta, fuente).map((motivo) => `${ruta}: ${motivo}`);
      });

    expect(
      hallazgos,
      'QC-101 R19: el cierre confirma la accion sin prometer numero, porque el sistema NO SABE ' +
        'cuantas sesiones cerro. Ninguna firma nueva o modificada del modulo devuelve un conteo ' +
        '(el texto de la interfaz lo vigila `user-labels.test.ts`). Hallazgos:\n' +
        hallazgos.join('\n'),
    ).toEqual([]);
  });

  it('las reglas de R19 disparan con cambios y firmas fabricados, y no con unos limpios', () => {
    expect(
      archivosDelCierreTocados([
        { ruta: CASO_DE_USO_DEL_CIERRE, estado: 'M' },
        { ruta: PUERTO, estado: 'M' },
        { ruta: ACTION, estado: 'A' },
      ]),
    ).toEqual([`${CASO_DE_USO_DEL_CIERRE} (M)`, `${PUERTO} (M)`]);
    expect(
      archivosDelCierreTocados([
        { ruta: ACTION, estado: 'A' },
        { ruta: 'lib/modules/identity/domain/end-other-sessions.ts', estado: 'M' },
      ]),
    ).toEqual([]);

    // El estado de exito con una clave numerica: el conteo que se cuela SIN nombre de conteo.
    const actionConConteo = [
      "export type EndSessionsFormState = { status: 'idle' } | { status: 'success'; closed: number };",
    ].join('\n');
    expect(hallazgosDeConteo(ACTION, actionConConteo)).toContain('declara una clave numerica');

    const casoDeUsoConConteo = [
      'export function createEndAllSessions() {',
      '  return async function endAllSessions(actor: Actor, id: string): Promise<number> {',
      '    return 0;',
      '  };',
      '}',
    ].join('\n');
    expect(hallazgosDeConteo(CASO_DE_USO_DEL_CIERRE, casoDeUsoConConteo)).toContain(
      'declara una firma que devuelve Promise<number>',
    );

    // Fuera de un archivo de sesion, el nombre de conteo muerde igual.
    expect(
      hallazgosDeConteo(
        'lib/modules/identity/domain/user-view.ts',
        'export type UserRow = { id: string; activeSessionCount: number };',
      ),
    ).toContain('nombra un conteo de sesiones (session...Count/Total/Closed)');
    expect(
      hallazgosDeConteo('lib/modules/identity/domain/x.ts', 'export const countSessions = () => 1;'),
    ).toContain('nombra un conteo de sesiones (count/total/numberOf...Sessions)');

    // Limpio: la action real de esta ficha, con su prosa que SI habla de «cuantas sesiones».
    const actionLimpia = [
      '/** EXITO SIN DATOS (R5, R19): ni cuantas sesiones se cerraron, ni un sessionCount. */',
      "export type EndSessionsFormState = { status: 'idle' } | { status: 'success' } | ErrorState;",
      'export async function endAllSessionsAction(',
      '  _prevState: EndSessionsFormState,',
      '  formData: FormData,',
      '): Promise<EndSessionsFormState> {',
      "  return { status: 'success' };",
      '}',
    ].join('\n');
    expect(hallazgosDeConteo(ACTION, actionLimpia)).toEqual([]);
    // Un numero legitimo fuera de los archivos de sesion no es un conteo de sesiones.
    expect(
      hallazgosDeConteo('lib/modules/identity/domain/page.ts', 'export type Page = { size: number };'),
    ).toEqual([]);
    // Y nada fuera del modulo `identity` le compete a esta regla.
    expect(hallazgosDeConteo('lib/shared/session-x.ts', 'const n: number = 1;')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// R20 — ninguna lista de sesiones vivas (ANCLA: no depende del rango)
// ---------------------------------------------------------------------------------------------

describe('R20 — el puerto de la revocacion sigue sin listado (independiente del rango)', () => {
  it('declara EXACTAMENTE `revokeSession` y `stampAll`, y ni un metodo mas', () => {
    expect(
      metodosDelPuerto(leer(PUERTO)),
      'QC-101 R20 (QC-23 decision cerrada 12): `SessionRevocationRepository` tiene DOS metodos. La ' +
        'revocacion es un SELLO DE TIEMPO, no un borrado por sesion: no hay ninguna lista de ' +
        'sesiones vivas que exponer, y esta ficha no la crea.',
    ).toEqual(['revokeSession', 'stampAll']);
  });

  it('no declara ninguna forma de listado, busqueda o lectura', () => {
    const hallazgos = hallazgosDeListado(leer(PUERTO));
    expect(
      hallazgos,
      `QC-101 R20: el puerto no puede PREGUNTAR por las sesiones. Hallazgos en ${PUERTO}: ` +
        hallazgos.join(', '),
    ).toEqual([]);
  });

  it('las reglas de R20 disparan con un puerto fabricado que si lista, y no con uno limpio', () => {
    const conListado = [
      'export interface SessionRevocationRepository {',
      '  revokeSession(input: { sessionId: string }): Promise<void>;',
      "  stampAll(input: { userId: string }): Promise<'ok' | 'not_found'>;",
      '  getAliveSessions(userId: string): Promise<unknown[]>;',
      '}',
      '',
    ].join('\n');
    expect(metodosDelPuerto(conListado)).toEqual(['getAliveSessions', 'revokeSession', 'stampAll']);
    expect(hallazgosDeListado(conListado)).toContain('declara un lector (get...)');
    expect(hallazgosDeListado(conListado)).toContain('declara una operacion sobre sesiones EN PLURAL');

    const limpio = [
      '// Aqui NO hay ningun listSessions() ni getAliveSessions(): es la decision 12.',
      'export interface SessionRevocationRepository {',
      '  revokeSession(input: { sessionId: string }): Promise<void>;',
      "  stampAll(input: { userId: string }): Promise<'ok' | 'not_found'>;",
      '}',
      '',
    ].join('\n');
    expect(metodosDelPuerto(limpio)).toEqual(['revokeSession', 'stampAll']);
    expect(hallazgosDeListado(limpio)).toEqual([]);
    expect(() => metodosDelPuerto('export interface OtroPuerto {\n}')).toThrow();
  });
});

// ---------------------------------------------------------------------------------------------
// R21 — ni el boton del propio usuario (QC-53)
// ---------------------------------------------------------------------------------------------

describe('R21 — la ficha no ofrece el cierre de las sesiones propias', () => {
  it('nadie fuera del dominio, el contrato y `lib/composition` nombra `endOtherSessions`', (ctx) => {
    cambiosOMudo(ctx);
    const fuera = endOtherSessionsFueraDeSitio(archivosQueNombranEndOtherSessions());

    expect(
      fuera,
      'QC-101 R21: `endOtherSessions` es el cierre de LAS OTRAS SESIONES DE UNO MISMO, y su boton ' +
        'es QC-53, con su aviso de lo que va a pasar. Ningun archivo de `app/`, `components/`, ' +
        '`hooks/` ni `adapters/driving/` lo nombra en esta ficha. Archivos:\n' +
        fuera.join('\n'),
    ).toEqual([]);
  });

  it('ningun archivo de `app/` que el diff agrega o modifica ofrece «cerrar mis sesiones»', (ctx) => {
    const cambios = cambiosOMudo(ctx);
    const hallazgos = vivosDelDiff(cambios)
      .filter((ruta) => ruta.startsWith('app/'))
      .flatMap((ruta) => {
        const fuente = leerSiExiste(ruta);
        if (fuente === null) return [];
        return hallazgosDeCierrePropio(fuente).map((motivo) => `${ruta}: ${motivo}`);
      });

    expect(
      hallazgos,
      'QC-101 R21: esta pantalla cierra las sesiones de OTRA persona, y nunca se ofrece sobre uno ' +
        'mismo. «Cerrar mis sesiones» es QC-53. Hallazgos:\n' +
        hallazgos.join('\n'),
    ).toEqual([]);
  });

  it('las reglas de R21 disparan con archivos y textos fabricados, y no con unos limpios', () => {
    expect(
      endOtherSessionsFueraDeSitio([
        'lib/composition/index.ts',
        'lib/modules/identity/index.ts',
        'lib/modules/identity/domain/end-other-sessions.ts',
        ACTION,
        'app/(private)/perfil/components/end-my-sessions-button.tsx',
        'hooks/use-end-other-sessions.ts',
      ]),
    ).toEqual([
      'app/(private)/perfil/components/end-my-sessions-button.tsx',
      'hooks/use-end-other-sessions.ts',
      ACTION,
    ].sort());
    expect(
      endOtherSessionsFueraDeSitio([
        'lib/composition/index.ts',
        'lib/modules/identity/index.ts',
        'lib/modules/identity/domain/end-other-sessions.ts',
      ]),
    ).toEqual([]);

    expect(nombraEndOtherSessions('await identity.endOtherSessions(actor, token);')).toBe(true);
    expect(nombraEndOtherSessions('export async function endOtherSessionsAction() {}')).toBe(true);
    expect(nombraEndOtherSessions('// esto NO es endOtherSessions: eso es QC-53')).toBe(false);
    expect(nombraEndOtherSessions('export { createEndOtherSessions } from "./domain";')).toBe(false);

    expect(hallazgosDeCierrePropio('<Button>Cerrar todas mis sesiones</Button>')).toContain(
      'ofrece «cerrar mis/tus sesiones»',
    );
    expect(
      hallazgosDeCierrePropio("export const label = 'Cerrar la sesion en los otros dispositivos';"),
    ).toContain('ofrece cerrar la sesion en los otros dispositivos de uno mismo');
    expect(hallazgosDeCierrePropio('export function closeOwnSessions() {}')).toContain(
      'declara una accion de cierre de las sesiones propias',
    );

    const limpio = [
      '{/* Aqui NO se ofrece «cerrar mis sesiones»: eso es QC-53. */}',
      '// ni se cierra en los otros dispositivos',
      '<Button>Cerrar sesion</Button>',
      'export const endUserSessionsLabel = (name: string) => `Cerrar todas las sesiones de ${name}`;',
      'export const toastText = (name: string) => `Se cerraron las sesiones de ${name}.`;',
    ].join('\n');
    expect(hallazgosDeCierrePropio(limpio)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// R22 — ninguna dependencia nueva
// ---------------------------------------------------------------------------------------------

describe('R22 — package.json no cambia su conjunto de dependencias', () => {
  it('los nombres de `dependencies` + `devDependencies` son identicos a los de la base de fusion', (ctx) => {
    cambiosOMudo(ctx);
    const base = baseObligatoria();
    const antes = dependenciasDeclaradas(git(`git show ${base}:package.json`));
    const diferencia = diferenciaDeConjuntos(antes, dependenciasDeclaradas(leer('package.json')));

    expect(
      diferencia,
      'QC-101 R22: `AlertDialog` y `Button` ya estan en `components/ui/`, `sonner` da el aviso y ' +
        'Playwright el E2E, asi que NO entra ninguna libreria ni se ejecuta `npx shadcn add`. Y ' +
        'ninguna entra en este repo sin los cuatro checks de salud, su fila en ' +
        '`docs/dependencias.md` y aprobacion humana (regla 7). Anadidas: ' +
        `${diferencia.anadidos.join(', ')} · Quitadas: ${diferencia.quitados.join(', ')}`,
    ).toEqual({ anadidos: [], quitados: [] });
  });

  it('la regla de R22 dispara con un manifiesto fabricado y no con uno igual', () => {
    const antes = dependenciasDeclaradas(
      '{"dependencies":{"zod":"^3","sonner":"^2"},"devDependencies":{"vitest":"^3"}}',
    );
    expect(
      diferenciaDeConjuntos(
        antes,
        dependenciasDeclaradas(
          '{"dependencies":{"zod":"^3","sonner":"^2","@radix-ui/react-dropdown-menu":"^2"},"devDependencies":{"vitest":"^3"}}',
        ),
      ),
    ).toEqual({ anadidos: ['@radix-ui/react-dropdown-menu'], quitados: [] });
    // Mover una dependencia de `dependencies` a `devDependencies` no cambia el conjunto de nombres.
    expect(
      diferenciaDeConjuntos(
        antes,
        dependenciasDeclaradas('{"dependencies":{"zod":"^3"},"devDependencies":{"vitest":"^3","sonner":"^2"}}'),
      ),
    ).toEqual({ anadidos: [], quitados: [] });
    // Cambiar la VERSION tampoco, y esta regla no finge lo contrario.
    expect(
      diferenciaDeConjuntos(
        dependenciasDeclaradas('{"dependencies":{"zod":"^3"}}'),
        dependenciasDeclaradas('{"dependencies":{"zod":"^4"}}'),
      ),
    ).toEqual({ anadidos: [], quitados: [] });
  });
});
