// QC-23 T22 — EL TEST DE ALCANCE de la ficha. Cubre R19, R47 y R51.
//
// Los tres son requisitos de AUSENCIA: dicen lo que esta ficha NO hace y lo que nadie debe poder
// hacer despues. Un requisito de ausencia no se demuestra leyendo el codigo -«mira, no hay
// ninguna pagina»-, se demuestra MIDIENDO: el manifiesto contra el que habia, el cambio de la
// rama contra la base de fusion, y el TIPO del puerto contra la decision cerrada que lo escribio.
//
//   * R19 (decision cerrada 12) — `SessionRevocationRepository` NO EXPONE NINGUN METODO DE
//     LISTADO. «Ensename mis dispositivos» no debe ni poder EXPRESARSE: sin un listado en el
//     tipo, no compila y nadie lo anade por descuido en una tanda apurada. Es lo unico de este
//     archivo que NO depende del rango, porque no es alcance de una rama: es una decision
//     permanente sobre una pieza permanente.
//   * R47 — el conjunto de dependencias declaradas en `package.json` es el MISMO que en la base
//     de fusion. Se comparan NOMBRES y no el archivo entero: lo que R47 prohibe es que entre una
//     libreria, no que se toque una linea de `scripts`. Complementa -no duplica- a
//     `tests/guards/guard-dependencias-aprobadas.test.ts`, que comprueba otra cosa: que toda
//     dependencia DECLARADA tenga su fila aprobada en `docs/dependencias.md`. Las dos tienen que
//     estar verdes a la vez.
//   * R51 — la ficha no anadio ninguna pagina, ruta, componente ni Server Action, y las dos
//     operaciones de cierre en bloque NO SON INVOCABLES desde la interfaz. Esa mitad es de
//     **QC-101** (el boton del administrador) y **QC-53** (el del usuario), a proposito.
//
// ---------------------------------------------------------------------------------------------
// LA LECCION QUE ESTE ARCHIVO NO PUEDE REPETIR
// ---------------------------------------------------------------------------------------------
//
// `progress/history.md` registra que las guardias de alcance de QC-45 y QC-65 se volvieron BOMBAS
// DE RELOJERIA: mergeadas en `dev`, empezaron a medir CUALQUIER rama posterior con las reglas de
// alcance de una ficha que ya no era la suya, y pusieron en rojo el gate completo por trabajo
// legitimo ajeno. Aqui duele especialmente: R51 dice «ninguna Server Action invoca esto» y QC-101
// existe precisamente para escribir esa Server Action. Sin precondicion, este archivo se pondria
// rojo el dia que QC-101 haga su trabajo.
//
// De ahi las decisiones de este archivo, copiadas de `tests/unit/identity/qc78-alcance.test.ts`,
// que a su vez las tomo de `account-status-scope.test.ts` y de `qc75-convenciones.test.ts`:
//
//   1. PRECONDICION DE RAMA CONJUNTIVA (`esLaRamaDeQC23()`): los casos que miden el CAMBIO solo
//      aplican si el diff trae A LA VEZ `ports/session-revocation-repository.ts` -el archivo que
//      solo nace en esta ficha- y algo bajo `specs/QC-23-registro-de-sesiones/`. La carpeta de
//      spec discrimina de verdad: nace y vive dentro del rango de ESTA rama y no aparece en el de
//      otra ficha, que trae la suya.
//   2. TRES SITUACIONES, DOS SEVERIDADES. «No puedo mirar» (el rango no resuelve) es ROJO: un
//      test que se auto-desactiva cuando no puede mirar es indistinguible de uno roto. «Esto no
//      es lo mio» y «no hay nada que mirar» son `ctx.skip()` con un mensaje que dice EN VOZ ALTA
//      que ese caso NO HA COMPROBADO NADA.
//   3. REGLAS PURAS Y EXPORTADAS, con su caso de mordida: se demuestra que DISPARAN con datos
//      fabricados, y no solo que hoy no hay nada que las dispare.

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, type TestContext } from 'vitest';

const RAIZ = join(__dirname, '..', '..', '..');
const RANGO = 'git merge-base origin/dev HEAD';

const PUERTO = 'lib/modules/identity/ports/session-revocation-repository.ts';

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
 * del arbol de trabajo, para que esto muerda ANTES de commitear.
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
      `No se pudo calcular el diff contra \`${RANGO}\`, asi que R47 y R51 NO se han comprobado. ` +
        `Este test falla en vez de pasar en silencio. Causa: ${String(error)}`,
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

  // `--untracked-files=all` NO es decorativo: por defecto `git status --porcelain` COLAPSA una
  // carpeta sin seguimiento en una sola linea y no lista lo que hay dentro, que es justo donde
  // viviria la pantalla que R51 prohibe. Leccion ya medida en `qc78-alcance.test.ts`.
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

const CARPETA_SPEC_DE_QC23 = 'specs/QC-23-registro-de-sesiones/';

/** Conjuntiva a proposito: las dos senales, o esto no es la rama de QC-23. Ver la cabecera. */
export function esLaRamaDeQC23(rutas: readonly string[]): boolean {
  return rutas.includes(PUERTO) && rutas.some((ruta) => ruta.startsWith(CARPETA_SPEC_DE_QC23));
}

function cambiosOMudo(ctx: Pick<TestContext, 'skip'>): readonly Cambio[] {
  const cambios = cambiosDeLaRama();
  if (cambios.length === 0) {
    ctx.skip(
      'la rama no toca ningun archivo respecto de la base de fusion con `origin/dev`: no hay diff ' +
        'que revisar, asi que este caso NO HA COMPROBADO NADA (ni R47 ni R51).',
    );
  }
  if (!esLaRamaDeQC23(rutasDe(cambios))) {
    ctx.skip(
      'el rango no trae a la vez `' +
        PUERTO +
        '` y `' +
        CARPETA_SPEC_DE_QC23 +
        '`: esta NO es la rama de QC-23, asi que este caso NO HA COMPROBADO NADA. R47 y R51 son ' +
        'el alcance de ESA ficha y no le aplican a ninguna otra -QC-101 y QC-53 vienen justo a ' +
        'escribir la interfaz que R51 aparta- (la leccion de QC-45 y QC-65 en `progress/history.md`).',
    );
  }
  return cambios;
}

// ---------------------------------------------------------------------------------------------
// LAS REGLAS, COMO FUNCIONES PURAS
// ---------------------------------------------------------------------------------------------

/**
 * Copia deliberada de `stripComments` de `qc78-alcance.test.ts`. Hace falta porque los archivos
 * de esta ficha NOMBRAN en su prosa justo lo que prohiben -el puerto explica en su cabecera que
 * no hay listado, y lo nombra para explicarlo-, y sin descontar comentarios las reglas nacerian
 * rojas por documentar su propia razon de ser.
 *
 * **El orden importa: los de LINEA primero, los de BLOQUE despues.** Al reves, un comentario de
 * linea que contenga una apertura de bloque abre un bloque FALSO que se traga el codigo de abajo.
 */
export function stripComments(source: string): string {
  return source
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/**
 * Los metodos que declara la interfaz del puerto, leidos del FUENTE y no del tipo: un test que
 * importara el tipo no podria decir «y ninguno mas», porque los tipos no existen en ejecucion.
 *
 * Se toman los identificadores seguidos de `(` en el primer nivel de sangria del cuerpo de la
 * interfaz -dos espacios-, que es como los deja el formateador del repo; las claves de los
 * objetos de entrada viven a cuatro y no cuentan.
 */
export function metodosDelPuerto(fuente: string): string[] {
  const codigo = stripComments(fuente);
  const cuerpo = /export interface SessionRevocationRepository\s*\{([\s\S]*?)\n\}/.exec(codigo);
  if (cuerpo === null) {
    throw new Error(
      `No se encontro la interfaz \`SessionRevocationRepository\` en ${PUERTO}. Si se renombro, ` +
        'este test dejo de vigilar la decision cerrada 12 y hay que arreglarlo, no borrarlo.',
    );
  }
  const metodos: string[] = [];
  for (const linea of cuerpo[1].split('\n')) {
    const match = /^ {2}([A-Za-z_$][\w$]*)\s*\(/.exec(linea);
    if (match) metodos.push(match[1]);
  }
  return metodos.sort();
}

/**
 * Las formas de LISTADO que la decision cerrada 12 prohibe en este puerto. Se miran sobre el
 * fuente ya sin comentarios y en TODO el archivo, no solo en el cuerpo de la interfaz: asi el
 * hallazgo aparece igual si alguien declara el listado en un tipo auxiliar o con otra sangria.
 *
 * `stampAll` y `revokeSession` no casan ninguna: la primera no devuelve nada de nadie y la
 * segunda habla de UNA sesion. Lo que se prohibe es poder PREGUNTAR por las sesiones.
 */
const FORMAS_DE_LISTADO: readonly { readonly patron: RegExp; readonly motivo: string }[] = [
  { patron: /\blist[A-Z]\w*\s*\(/, motivo: 'declara un listado (list...)' },
  { patron: /\bfind[A-Z]\w*\s*\(/, motivo: 'declara una busqueda (find...)' },
  { patron: /\bget[A-Z]\w*\s*\(/, motivo: 'declara un lector (get...)' },
  { patron: /\bsearch\w*\s*\(/i, motivo: 'declara una busqueda (search...)' },
  { patron: /\b\w*[Ss]essions\s*\(/, motivo: 'declara una operacion sobre sesiones EN PLURAL' },
  { patron: /\b\w*[Dd]evices?\s*\(/, motivo: 'declara una operacion sobre dispositivos' },
];

/** Los motivos por los que el fuente del puerto infringe R19. Vacio = limpio. */
export function hallazgosDeListado(fuente: string): string[] {
  const codigo = stripComments(fuente);
  return FORMAS_DE_LISTADO.filter(({ patron }) => patron.test(codigo)).map(({ motivo }) => motivo);
}

/** R47 — los NOMBRES de `dependencies` + `devDependencies` de un `package.json`. */
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

/** R47 — lo que hay ahora y no habia en la base de fusion. */
export function dependenciasNuevas(antes: readonly string[], ahora: readonly string[]): string[] {
  const previas = new Set(antes);
  return ahora.filter((nombre) => !previas.has(nombre)).sort();
}

/**
 * R51 — los archivos AGREGADOS por la rama que serian una pantalla, una ruta, un componente o una
 * Server Action. Solo los agregados: modificar un archivo existente de la interfaz no crea
 * ninguna via de invocacion nueva, y de que NADIE invoque las dos operaciones se encarga la regla
 * de mas abajo, que es la que muerde de verdad.
 */
export function superficieDeInterfazNueva(cambios: readonly Cambio[]): string[] {
  return cambios
    .filter((cambio) => cambio.estado === 'A')
    .map((cambio) => cambio.ruta)
    .filter((ruta) => !ruta.startsWith('tests/') && !ruta.startsWith('e2e/'))
    .filter(
      (ruta) =>
        ruta.startsWith('app/') ||
        ruta.startsWith('components/') ||
        ruta.startsWith('hooks/') ||
        /\/adapters\/driving\//.test(ruta),
    )
    .sort();
}

/**
 * R51 — quien NOMBRA las dos operaciones de cierre en bloque, en todo el codigo del repo.
 *
 * Que existan y esten probadas es el trabajo de esta ficha; que se puedan PULSAR no lo es. La
 * lista blanca es corta a proposito: el dominio que las define, el contrato que las reexporta y
 * el punto de composicion que las cablea. Cualquier otro archivo -una Server Action, una pagina,
 * un componente- es exactamente lo que R51 aparta hacia QC-101 y QC-53.
 */
const INVOCACION_PERMITIDA: readonly string[] = [
  'lib/composition/index.ts',
  'lib/modules/identity/index.ts',
  'lib/modules/identity/domain/end-all-sessions.ts',
  'lib/modules/identity/domain/end-other-sessions.ts',
];

export function invocacionesFueraDeSitio(archivos: readonly string[]): string[] {
  return archivos.filter((ruta) => !INVOCACION_PERMITIDA.includes(ruta)).sort();
}

/** Los archivos de codigo que nombran las dos operaciones, incluidos los sin seguimiento. */
function archivosQueNombranElCierreEnBloque(): string[] {
  let salida: string;
  try {
    salida = git(
      'git grep -l --untracked -E "endAllSessions|endOtherSessions" -- app components hooks lib middleware.ts',
    );
  } catch {
    // `git grep` sale con codigo 1 cuando no encuentra nada: sin coincidencias no hay infraccion.
    return [];
  }
  return salida
    .split('\n')
    .map((linea) => aPosix(linea.trim()))
    .filter((ruta) => ruta.length > 0)
    .sort();
}

// ---------------------------------------------------------------------------------------------
// ANCLAS — no dependen del rango, y sin ellas todo lo de abajo podria estar verde sin mirar
// ---------------------------------------------------------------------------------------------

describe('el test de alcance sabe leer de verdad (anclas independientes del rango)', () => {
  it('el puerto existe y trae la interfaz que se vigila', () => {
    expect(existsSync(join(RAIZ, PUERTO))).toBe(true);
    expect(leer(PUERTO)).toMatch(/export interface SessionRevocationRepository\s*\{/);
  });

  it('`package.json` existe, parsea y declara dependencias', () => {
    expect(existsSync(join(RAIZ, 'package.json'))).toBe(true);
    const nombres = dependenciasDeclaradas(leer('package.json'));
    expect(nombres.length).toBeGreaterThan(0);
    expect(nombres).toContain('@prisma/client');
  });

  it(`\`${RANGO}\` resuelve; si no, este test falla ruidosamente en vez de saltarse`, () => {
    expect(() => cambiosDeLaRama()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------------------------
// R19 — «ensename mis dispositivos» no debe ni poder expresarse (decision cerrada 12)
// ---------------------------------------------------------------------------------------------

describe('R19 — el puerto de la revocacion no expone ningun listado', () => {
  it('declara EXACTAMENTE `revokeSession` y `stampAll`, y ni un metodo mas', () => {
    expect(
      metodosDelPuerto(leer(PUERTO)),
      'QC-23 R19 / decision cerrada 12: `SessionRevocationRepository` tiene DOS metodos y no ' +
        'puede ganar un tercero por descuido. Si hiciera falta uno nuevo, es una conversacion ' +
        'sobre el contrato -y sobre la decision cerrada-, no una linea mas en el tipo.',
    ).toEqual(['revokeSession', 'stampAll']);
  });

  it('no declara ninguna forma de listado de sesiones ni de dispositivos', () => {
    const hallazgos = hallazgosDeListado(leer(PUERTO));
    expect(
      hallazgos,
      'QC-23 R19 / decision cerrada 12: «el usuario NO ve sus dispositivos abiertos, y no genera ' +
        'ficha». Un listado obliga a leer N filas por peticion -justo lo que QC-28 viene a ' +
        `quitar- y ademas no se puede: este ERP no guarda las sesiones ABIERTAS. Hallazgos en ` +
        `${PUERTO}: ${hallazgos.join(', ')}`,
    ).toEqual([]);
  });

  it('las dos reglas disparan con un puerto fabricado que si lista', () => {
    const conListado = [
      'export interface SessionRevocationRepository {',
      '  revokeSession(input: { sessionId: string }): Promise<void>;',
      '  stampAll(input: { userId: string }): Promise<string>;',
      '  listSessions(userId: string): Promise<unknown[]>;',
      '}',
      '',
    ].join('\n');

    expect(metodosDelPuerto(conListado)).toEqual(['listSessions', 'revokeSession', 'stampAll']);
    expect(hallazgosDeListado(conListado)).toContain('declara un listado (list...)');

    const limpio = [
      '// Aqui NO hay ningun listSessions() ni findDevices(): ese es el sentido de la decision 12.',
      'export interface SessionRevocationRepository {',
      '  revokeSession(input: { sessionId: string }): Promise<void>;',
      '  stampAll(input: { userId: string }): Promise<string>;',
      '}',
      '',
    ].join('\n');

    expect(metodosDelPuerto(limpio)).toEqual(['revokeSession', 'stampAll']);
    expect(hallazgosDeListado(limpio)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// R47 — ninguna dependencia nueva
// ---------------------------------------------------------------------------------------------

describe('R47 — package.json no gano ninguna dependencia', () => {
  it('el conjunto de dependencias es el mismo que en la base de fusion con `origin/dev`', (ctx) => {
    cambiosOMudo(ctx);
    const base = baseDeFusionConDev();
    expect(base).not.toBeNull();
    const antes = dependenciasDeclaradas(git(`git show ${base}:package.json`));
    const nuevas = dependenciasNuevas(antes, dependenciasDeclaradas(leer('package.json')));

    expect(
      nuevas,
      'QC-23 R47: esta ficha es esquema, migracion y dominio; `crypto.randomUUID()` es API de ' +
        'plataforma y la firma no cambia, asi que NO entra ninguna libreria. Y ninguna entra en ' +
        'este repo sin los cuatro checks de salud, su fila en `docs/dependencias.md` y aprobacion ' +
        `humana (regla 7 de CLAUDE.md). Dependencias nuevas: ${nuevas.join(', ')}`,
    ).toEqual([]);
  });

  it('la regla dispara con un manifiesto fabricado y no con uno igual', () => {
    expect(dependenciasNuevas(['zod'], ['jsonwebtoken', 'zod'])).toEqual(['jsonwebtoken']);
    expect(dependenciasNuevas(['zod', 'bcryptjs'], ['zod', 'bcryptjs'])).toEqual([]);
    // Cambiar la VERSION no es una dependencia nueva, y esta regla no finge lo contrario.
    expect(
      dependenciasNuevas(
        dependenciasDeclaradas('{"dependencies":{"zod":"^3"}}'),
        dependenciasDeclaradas('{"dependencies":{"zod":"^4"}}'),
      ),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// R51 — ni pantalla, ni ruta, ni componente, ni Server Action
// ---------------------------------------------------------------------------------------------

describe('R51 — la ficha no anadio ninguna superficie de interfaz', () => {
  it('el cambio no agrega ninguna pagina, ruta, componente ni adaptador driving', (ctx) => {
    const cambios = cambiosOMudo(ctx);
    const superficie = superficieDeInterfazNueva(cambios);

    expect(
      superficie,
      'QC-23 R51: la operacion de R26 queda IMPLEMENTADA Y PROBADA en el dominio, y esta ficha no ' +
        'crea ninguna pantalla, ruta, componente ni Server Action para invocarla. El boton del ' +
        'administrador es QC-101 y el del usuario es QC-53. Archivos agregados que cruzan la ' +
        `frontera:\n${superficie.join('\n')}`,
    ).toEqual([]);
  });

  it('nadie fuera del dominio, el contrato y el punto de composicion nombra el cierre en bloque', (ctx) => {
    cambiosOMudo(ctx);
    const fuera = invocacionesFueraDeSitio(archivosQueNombranElCierreEnBloque());

    expect(
      fuera,
      'QC-23 R51: `endAllSessions` y `endOtherSessions` existen, estan cableadas y no se pueden ' +
        'pulsar. Quien las nombre fuera del dominio que las define, del contrato que las reexporta ' +
        'y de `lib/composition` que las cablea esta construyendo la mitad que esta ficha aparto a ' +
        `QC-101 y QC-53. Archivos:\n${fuera.join('\n')}`,
    ).toEqual([]);
  });

  it('las dos reglas disparan con un cambio fabricado y no con uno limpio', () => {
    const fabricado: Cambio[] = [
      { ruta: 'app/(private)/sesiones/page.tsx', estado: 'A' },
      { ruta: 'components/shared/cerrar-sesiones-button.tsx', estado: 'A' },
      { ruta: 'lib/modules/identity/adapters/driving/session-actions.ts', estado: 'A' },
      { ruta: 'lib/modules/identity/domain/end-all-sessions.ts', estado: 'A' },
      { ruta: 'app/(private)/usuarios/page.tsx', estado: 'M' },
      { ruta: 'tests/unit/identity/end-all-sessions.test.ts', estado: 'A' },
    ];
    expect(superficieDeInterfazNueva(fabricado)).toEqual([
      'app/(private)/sesiones/page.tsx',
      'components/shared/cerrar-sesiones-button.tsx',
      'lib/modules/identity/adapters/driving/session-actions.ts',
    ]);

    expect(
      superficieDeInterfazNueva([
        { ruta: 'lib/composition/index.ts', estado: 'M' },
        { ruta: 'lib/modules/identity/domain/end-session.ts', estado: 'A' },
        { ruta: 'tests/unit/identity/qc23-alcance.test.ts', estado: 'A' },
      ]),
    ).toEqual([]);

    expect(
      invocacionesFueraDeSitio([
        'lib/composition/index.ts',
        'lib/modules/identity/adapters/driving/session-actions.ts',
        'app/(private)/usuarios/components/user-row-menu.tsx',
      ]),
    ).toEqual([
      'app/(private)/usuarios/components/user-row-menu.tsx',
      'lib/modules/identity/adapters/driving/session-actions.ts',
    ]);

    expect(invocacionesFueraDeSitio([...INVOCACION_PERMITIDA])).toEqual([]);
  });
});
