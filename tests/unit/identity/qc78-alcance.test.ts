// QC-78 T13 — LA GUARDIA DE ALCANCE de la ficha. Cubre R23, R26 y R27.
//
// Los tres son requisitos de ausencia: dicen lo que esta ficha NO hace. Un requisito de ausencia
// no se demuestra leyendo codigo -«mira, no hay migracion»-, se demuestra MIDIENDO el cambio. Por
// eso todo lo que se afirma aqui se afirma sobre el DIFF DE LA RAMA contra la base de fusion con
// `origin/dev` (`git merge-base origin/dev HEAD`), mas el arbol de trabajo para que muerda antes
// incluso de commitear:
//
//   * R26 — cero cambios en `db/schema.prisma` y cero cambios bajo `db/migrations/`.
//   * R27 — cero cambios en `package.json` (y en `pnpm-lock.yaml`, que es su sombra: un lock que
//     se mueve sin que se mueva el manifiesto sigue siendo una dependencia entrando).
//   * R23 — ningun cron, `setInterval`, `setTimeout` recurrente ni proceso de fondo nuevo, y
//     ningun route handler nuevo bajo `app/api/`.
//
// Se mide sobre los archivos AGREGADOS/MODIFICADOS del diff, NO sobre el arbol entero. Un censo del
// arbol se pondria rojo por `setTimeout` legitimos de UI ajena que esta ficha ni toca ni conoce.
//
// ---------------------------------------------------------------------------------------------
// LA LECCION QUE ESTA GUARDIA NO PUEDE REPETIR
// ---------------------------------------------------------------------------------------------
//
// `progress/history.md` registra que las guardias de alcance de QC-45 y QC-65 se volvieron BOMBAS
// DE RELOJERIA: escritas por una ficha, quedaron mergeadas en `dev` y empezaron a medir CUALQUIER
// rama posterior con las reglas de alcance de una ficha que ya no era la suya, poniendo en rojo el
// gate completo -que es obligatorio antes de cada PR- por trabajo legitimo ajeno. Tres episodios de
// la misma clase (`tests/unit/navegacion/qc75-convenciones.test.ts`, el de QC-38 y el de QC-65).
//
// De ahi las tres decisiones de diseno de este archivo, que NO son opcionales:
//
//   1. PRECONDICION DE RAMA CONJUNTIVA (`esLaRamaDeQC78()`): los casos que miran el cambio solo
//      aplican si el diff trae A LA VEZ `lib/modules/identity/domain/effective-account-status.ts`
//      -el archivo central de esta ficha, el unico sitio que traduce «lo que dice la columna» a
//      «lo que significa ahora»- Y algo bajo `specs/QC-78-estado-de-cuenta-en-el-acceso/`. La
//      carpeta de spec discrimina de verdad porque nace y vive dentro del rango de ESTA rama y no
//      aparece jamas en el de otra ficha, que trae la SUYA. Deliberadamente NO se usa este propio
//      archivo de test como senal: otras fichas lo enmendaran al chocar con el, y entonces la
//      senal les diria que son QC-78.
//
//   2. TRES SITUACIONES, DOS SEVERIDADES. No son la misma cosa y no se tratan igual:
//        - «NO PUEDO mirar» — `git merge-base origin/dev HEAD` no resuelve (sin remoto, clon
//          superficial): ROJO. Lanza. Una guardia que se auto-desactiva cuando no puede mirar es
//          indistinguible de una guardia rota.
//        - «ESTO NO ES LO MIO» — la precondicion de rama no se cumple: `ctx.skip()`.
//        - «NO HAY NADA QUE MIRAR» — el rango existe pero esta vacio (corriendo sobre `dev` con el
//          arbol limpio, en cuanto esta ficha se mergee): `ctx.skip()`.
//      Los dos saltos van con un mensaje que dice EN VOZ ALTA que ese caso NO HA COMPROBADO NADA.
//      Nunca verdes: un verde ahi afirmaria «he revisado el diff de QC-78 y no cruza ninguna
//      frontera», que seria falso, y ese falso verde es justo lo que taparia el dia que la guardia
//      dejara de mirar de verdad.
//
//   3. ANCLAS QUE NO DEPENDEN DEL RANGO. Sin ellas, un helper roto -o un `git` que devuelve vacio-
//      dejaria todo en verde sin haber leido un solo byte. Se comprueba que `db/schema.prisma`
//      existe y trae esquema de verdad, que `package.json` existe y parsea con dependencias, y que
//      las tres reglas DISPARAN con listas y fuentes fabricados (y no disparan con los limpios).
//
// El idioma de git -`RANGO`, `git()`, `aPosix()`, los archivos tocados- se copia tal cual de
// `tests/unit/identity/account-status-scope.test.ts`, que a su vez lo tomo de
// `tests/unit/navegacion/qc75-convenciones.test.ts` y `tests/unit/unidades/modulo-intacto.test.ts`.

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, type TestContext } from 'vitest';

const RAIZ = join(__dirname, '..', '..', '..');

/**
 * El rango contra el que se compara: la BASE DE FUSION con `origin/dev`, calculada en cada
 * ejecucion. No el literal `dev...HEAD`: el `dev` LOCAL de este repo va por detras del remoto, y
 * ese rango arrastraria trabajo AJENO ya mergeado y se lo atribuiria a esta rama.
 */
const RANGO = 'git merge-base origin/dev HEAD';

function git(comando: string): string {
  return execSync(comando, { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

/** La base de fusion con `origin/dev`, o `null` si el rango no esta disponible aqui. */
function baseDeFusionConDev(): string | null {
  try {
    return git(RANGO).trim();
  } catch {
    return null;
  }
}

function aPosix(ruta: string): string {
  return ruta.split('\\').join('/');
}

/** Un archivo del cambio y como entro: agregado, modificado o borrado. */
export type Cambio = { readonly ruta: string; readonly estado: 'A' | 'M' | 'D' };

function combinar(
  anterior: Cambio['estado'] | undefined,
  nuevo: Cambio['estado'],
): Cambio['estado'] {
  // Un archivo puede aparecer en el rango y otra vez en el arbol de trabajo. Si en cualquiera de
  // los dos entro como AGREGADO, es nuevo para esta rama: `A` gana. `D` solo se queda si nada
  // mas lo contradice.
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
 * del arbol de trabajo (incluidos los archivos sin seguimiento, que cuentan como agregados).
 *
 * LANZA -a proposito- si el rango no se puede calcular: «no puedo mirar» es rojo. Ver la cabecera.
 */
export function cambiosDeLaRama(): readonly Cambio[] {
  let delRango: string;
  try {
    const base = baseDeFusionConDev();
    if (base === null) throw new Error('`git merge-base origin/dev HEAD` no resolvio');
    delRango = git(`git diff --name-status ${base}`);
  } catch (error) {
    throw new Error(
      `No se pudo calcular el diff contra \`${RANGO}\`, asi que R23/R26/R27 NO se han comprobado. ` +
        'Esta guardia falla en vez de pasar en silencio. ' +
        `Causa: ${String(error)}`,
    );
  }

  const porRuta = new Map<string, Cambio['estado']>();

  for (const linea of delRango.split('\n')) {
    const limpia = linea.trim();
    if (limpia.length === 0) continue;
    const partes = limpia.split('\t');
    const codigo = partes[0] ?? 'M';
    // Los renombrados (`R100`) traen origen y destino; el destino es lo que esta rama deja escrito.
    const ruta = aPosix((partes[partes.length - 1] ?? '').trim());
    if (ruta.length === 0) continue;
    porRuta.set(ruta, combinar(porRuta.get(ruta), estadoDesdeGit(codigo)));
  }

  // `--untracked-files=all` NO es decorativo: por defecto `git status --porcelain` COLAPSA una
  // carpeta sin seguimiento en una sola linea con la carpeta (`?? app/api/`) y no lista lo que hay
  // dentro. La demostracion de mordida de T13 lo destapo: el `app/api/tmp-qc78/route.ts` fabricado
  // a proposito para poner R23 en rojo dejo la guardia en VERDE, porque lo que llegaba aqui era
  // `app/api/`, que ni casa con `route.ts` ni existe como archivo que leer. Con `-uall` llega el
  // archivo. Si alguien lo quita, esta guardia deja de ver justo lo que mas le importa: lo NUEVO.
  for (const linea of git('git status --porcelain --untracked-files=all').split('\n')) {
    if (linea.trim().length === 0) continue;
    const codigo = linea.slice(0, 2).trim();
    const camino = linea.slice(3).trim();
    const destino = camino.includes(' -> ') ? (camino.split(' -> ')[1] ?? camino) : camino;
    const ruta = aPosix(destino.replace(/^"|"$/g, ''));
    // Cinturon y tirantes por si alguien corre esto con otro `status.showUntrackedFiles`: una
    // entrada de CARPETA no es un archivo, no se puede leer y no puede ser un route handler.
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

const ARCHIVO_CENTRAL_DE_QC78 = 'lib/modules/identity/domain/effective-account-status.ts';
const CARPETA_SPEC_DE_QC78 = 'specs/QC-78-estado-de-cuenta-en-el-acceso/';

/** Conjuntiva a proposito: las dos senales, o esto no es la rama de QC-78. Ver la cabecera. */
export function esLaRamaDeQC78(rutas: readonly string[]): boolean {
  return (
    rutas.includes(ARCHIVO_CENTRAL_DE_QC78) &&
    rutas.some((ruta) => ruta.startsWith(CARPETA_SPEC_DE_QC78))
  );
}

/**
 * Los cambios de la rama, o un `skip` ruidoso si esta guardia no tiene nada que decir aqui.
 * Las dos unicas salidas mudas son «no hay nada que mirar» y «esto no es lo mio»; «no puedo
 * mirar» ya lanzo dentro de `cambiosDeLaRama()`.
 */
function cambiosOMudo(ctx: Pick<TestContext, 'skip'>): readonly Cambio[] {
  const cambios = cambiosDeLaRama();
  if (cambios.length === 0) {
    ctx.skip(
      'la rama no toca ningun archivo respecto de la base de fusion con `origin/dev`: no hay diff ' +
        'que revisar, asi que este caso NO HA COMPROBADO NADA (ni R23, ni R26, ni R27).',
    );
  }
  if (!esLaRamaDeQC78(rutasDe(cambios))) {
    ctx.skip(
      'el rango no trae a la vez `' +
        ARCHIVO_CENTRAL_DE_QC78 +
        '` y `' +
        CARPETA_SPEC_DE_QC78 +
        '`: esta NO es la rama de QC-78, asi que este caso NO HA COMPROBADO NADA. R23/R26/R27 son ' +
        'el alcance de ESA ficha y no le aplican a ninguna otra (la leccion de QC-45 y QC-65 en ' +
        '`progress/history.md`).',
    );
  }
  return cambios;
}

// ---------------------------------------------------------------------------------------------
// LAS TRES REGLAS, COMO FUNCIONES PURAS
// ---------------------------------------------------------------------------------------------
//
// Puras y exportadas, como el resto de guardias del repo: asi se demuestra que DISPARAN con datos
// fabricados, y no solo que hoy no hay nada que las dispare.

/** R26 — el esquema y las migraciones. */
export function infraccionesDeEsquema(rutas: readonly string[]): string[] {
  return rutas
    .filter((ruta) => ruta === 'db/schema.prisma' || ruta.startsWith('db/migrations/'))
    .sort();
}

/** R27 — el manifiesto y su sombra, el lock. */
export function infraccionesDeDependencias(rutas: readonly string[]): string[] {
  return rutas.filter((ruta) => ruta === 'package.json' || ruta === 'pnpm-lock.yaml').sort();
}

/** R23 — route handlers NUEVOS bajo `app/api/`. Los ya existentes que se modifiquen no cuentan. */
export function rutasDeApiNuevas(cambios: readonly Cambio[]): string[] {
  return cambios
    .filter(
      (cambio) =>
        cambio.estado === 'A' &&
        cambio.ruta.startsWith('app/api/') &&
        /\/route\.(ts|tsx|js|mjs)$/.test(cambio.ruta),
    )
    .map((cambio) => cambio.ruta)
    .sort();
}

/**
 * Copia deliberada de `stripComments` de `tests/unit/navegacion/qc75-convenciones.test.ts`.
 *
 * Hace falta porque los archivos de esta ficha MENCIONAN el cron y el temporizador en su prosa a
 * proposito -este mismo archivo lo hace en su cabecera, y `tasks.md` tambien-, justo para advertir
 * de que no se deben usar. Sin descontar comentarios, la regla naceria roja por documentar su
 * propia razon de ser.
 *
 * **El orden importa: los de LINEA primero, los de BLOQUE despues.** Al reves, un comentario de
 * linea que contenga una apertura de bloque abre un bloque FALSO que se traga el codigo de debajo
 * hasta el proximo cierre, y la regla pasa en verde sin mirar nada. Trampa ya medida en
 * `guard-firma-sesion-unica.test.ts`. El caso de regresion de mas abajo vigila exactamente esto.
 */
export function stripComments(source: string): string {
  return source
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/**
 * Las formas de «proceso de fondo» que R23 prohibe, cada una con el motivo que se imprime cuando
 * cae. Se miran sobre el CODIGO, ya sin comentarios.
 *
 * `setTimeout` entra entero y no solo «el recurrente»: distinguir un `setTimeout` que se
 * reprograma a si mismo de uno que no lo hace no se puede hacer leyendo un fuente sin analizarlo,
 * y el criterio de R23 -«nada corrige estados vencidos por su cuenta»- no admite la version
 * dudosa. Esta ficha no necesita ninguno: el plazo vencido se cocina EN MEMORIA al leer la ficha
 * (R7) y se corrige en el camino de escritura del login (R15, R16). Si un dia hiciera falta un
 * temporizador legitimo en un archivo de esta rama, la conversacion es sobre el spec, no sobre
 * esta lista.
 */
const FORMAS_DE_FONDO: readonly { readonly patron: RegExp; readonly motivo: string }[] = [
  { patron: /\bsetInterval\s*\(/, motivo: 'usa setInterval(...)' },
  { patron: /\bsetTimeout\s*\(/, motivo: 'usa setTimeout(...)' },
  { patron: /\bcrons?\b/i, motivo: 'menciona un cron' },
  { patron: /\bschedule[A-Za-z]*\s*\(/i, motivo: 'programa una tarea (schedule...)' },
  { patron: /\bunstable_after\s*\(|\bwaitUntil\s*\(/, motivo: 'difiere trabajo tras la respuesta' },
  { patron: /\bnew\s+Worker\s*\(/, motivo: 'arranca un worker' },
  { patron: /node:child_process|['"]child_process['"]/, motivo: 'lanza un proceso hijo' },
];

/** Los motivos por los que un fuente infringe R23. Vacio = limpio. */
export function hallazgosDeFondo(fuente: string): string[] {
  const codigo = stripComments(fuente);
  return FORMAS_DE_FONDO.filter(({ patron }) => patron.test(codigo)).map(({ motivo }) => motivo);
}

/**
 * Que archivos del cambio se escanean para R23: los de PRODUCCION que existen en disco.
 *
 * Quedan fuera los borrados (no hay nada que leer), los tests y los E2E -una espera de Playwright
 * no es un proceso de fondo del sistema, y ademas este mismo archivo fabrica fuentes con un
 * `setInterval` dentro para demostrar que la regla muerde- y todo lo que no sea codigo ni
 * configuracion de despliegue.
 */
export function archivosEscaneables(cambios: readonly Cambio[]): string[] {
  return cambios
    .filter((cambio) => cambio.estado !== 'D')
    .map((cambio) => cambio.ruta)
    .filter((ruta) => !ruta.startsWith('tests/') && !ruta.startsWith('e2e/'))
    .filter((ruta) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(ruta) || ruta === 'vercel.json')
    .filter((ruta) => existsSync(join(RAIZ, ruta)))
    .sort();
}

function leer(ruta: string): string {
  return readFileSync(join(RAIZ, ruta), 'utf8');
}

// ---------------------------------------------------------------------------------------------
// ANCLAS — no dependen del rango, y sin ellas todo lo de arriba podria estar en verde sin mirar
// ---------------------------------------------------------------------------------------------

describe('la guardia sabe leer de verdad (anclas independientes del rango)', () => {
  it('`db/schema.prisma` existe y trae esquema de verdad', () => {
    expect(existsSync(join(RAIZ, 'db/schema.prisma'))).toBe(true);
    const fuente = leer('db/schema.prisma');
    expect(fuente.length).toBeGreaterThan(500);
    expect(fuente).toMatch(/model\s+\w+\s*\{/);
    // El campo del que va esta ficha YA existe: eso es lo que hace que R26 pueda ser «sin cambios».
    expect(fuente).toMatch(/account_status|accountStatus/);
  });

  it('`package.json` existe, parsea y declara dependencias', () => {
    expect(existsSync(join(RAIZ, 'package.json'))).toBe(true);
    const paquete = JSON.parse(leer('package.json')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(Object.keys(paquete.dependencies ?? {}).length).toBeGreaterThan(0);
    expect(Object.keys(paquete.devDependencies ?? {}).length).toBeGreaterThan(0);
  });

  it(`\`${RANGO}\` resuelve; si no, esta guardia falla ruidosamente en vez de saltarse`, () => {
    expect(() => cambiosDeLaRama()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------------------------
// R26 — ni columna, ni tabla, ni enum, ni migracion
// ---------------------------------------------------------------------------------------------

describe('R26 — el esquema y las migraciones quedan sin cambios', () => {
  it('el diff de la rama no toca db/schema.prisma ni db/migrations/', (ctx) => {
    const cambios = cambiosOMudo(ctx);
    const infracciones = infraccionesDeEsquema(rutasDe(cambios));
    expect(
      infracciones,
      'QC-78 R26: esta ficha NO anade columna, tabla, enum ni migracion. Solo cambia quien escribe ' +
        'y quien lee `account_status`, `failed_login_attempts`, `lock_level` y `locked_until`, que ' +
        `ya existen. Archivos del diff que cruzan la frontera:\n${infracciones.join('\n')}`,
    ).toEqual([]);
  });

  it('la regla de esquema dispara con una lista fabricada y no con una limpia', () => {
    expect(
      infraccionesDeEsquema([
        'lib/modules/identity/domain/effective-account-status.ts',
        'db/schema.prisma',
        'db/migrations/20260909000000_algo/migration.sql',
        'db/migrations/20260909000000_algo/down.sql',
      ]),
    ).toEqual([
      'db/migrations/20260909000000_algo/down.sql',
      'db/migrations/20260909000000_algo/migration.sql',
      'db/schema.prisma',
    ]);

    expect(
      infraccionesDeEsquema([
        'lib/modules/identity/domain/verify-credentials.ts',
        'tests/unit/identity/qc78-alcance.test.ts',
        'docs/architecture.md',
      ]),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// R27 — ninguna dependencia nueva
// ---------------------------------------------------------------------------------------------

describe('R27 — package.json queda sin cambios', () => {
  it('el diff de la rama no toca package.json ni pnpm-lock.yaml', (ctx) => {
    const cambios = cambiosOMudo(ctx);
    const infracciones = infraccionesDeDependencias(rutasDe(cambios));
    expect(
      infracciones,
      'QC-78 R27: ninguna dependencia entra en esta ficha, y ninguna entra en este repo sin los ' +
        'cuatro checks de salud, su fila en `docs/dependencias.md` y aprobacion humana (regla 7 de ' +
        `CLAUDE.md). Archivos del diff que cruzan la frontera:\n${infracciones.join('\n')}`,
    ).toEqual([]);
  });

  it('la regla de dependencias dispara con una lista fabricada y no con una limpia', () => {
    expect(infraccionesDeDependencias(['package.json', 'lib/x.ts'])).toEqual(['package.json']);
    // La sombra sola tambien cuenta: un lock que se mueve es una dependencia entrando.
    expect(infraccionesDeDependencias(['pnpm-lock.yaml'])).toEqual(['pnpm-lock.yaml']);
    expect(infraccionesDeDependencias(['docs/dependencias.md', 'lib/package.json.ts'])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// R23 — ni cron, ni temporizador, ni proceso de fondo, ni route handler nuevo
// ---------------------------------------------------------------------------------------------

describe('R23 — nada corrige estados vencidos por su cuenta', () => {
  it('ningun archivo de produccion del diff arranca un proceso de fondo', (ctx) => {
    const cambios = cambiosOMudo(ctx);
    const escaneables = archivosEscaneables(cambios);

    // Ancla local: si el filtro dejara la lista vacia, el `toEqual([])` de abajo pasaria en verde
    // sin haber leido un solo archivo. Esta rama SIEMPRE trae produccion: el archivo central.
    expect(
      escaneables,
      'el diff de QC-78 no trae ningun archivo de produccion escaneable: el filtro esta mal y ' +
        'este caso no habria mirado nada.',
    ).toContain(ARCHIVO_CENTRAL_DE_QC78);

    const hallazgos = escaneables.flatMap((ruta) =>
      hallazgosDeFondo(leer(ruta)).map((motivo) => `${ruta}: ${motivo}`),
    );
    expect(
      hallazgos,
      'QC-78 R23: ninguna tarea programada, cron ni proceso de fondo corrige estados vencidos. El ' +
        'plazo vencido se cocina EN MEMORIA al leer la ficha (R7) y se corrige en el camino de ' +
        `escritura del login (R15, R16). Hallazgos:\n${hallazgos.join('\n')}`,
    ).toEqual([]);
  });

  it('el diff no anade ningun route handler bajo app/api/', (ctx) => {
    const cambios = cambiosOMudo(ctx);
    const nuevas = rutasDeApiNuevas(cambios);
    expect(
      nuevas,
      'QC-78 R23: esta ficha no expone ningun endpoint. Todo lo que hace ocurre en el camino que ' +
        `ya existe -login y resolucion de sesion-. Route handlers nuevos:\n${nuevas.join('\n')}`,
    ).toEqual([]);
  });

  it('la regla de fondo dispara con fuentes fabricados y no con uno limpio', () => {
    expect(hallazgosDeFondo('export const t = setInterval(() => revisar(), 60000);')).toEqual([
      'usa setInterval(...)',
    ]);
    expect(hallazgosDeFondo('function reprogramar() { setTimeout(reprogramar, 1000); }')).toEqual([
      'usa setTimeout(...)',
    ]);
    expect(
      hallazgosDeFondo('import cron from "node-cron"; cron.schedule("* * * * *", corregir);'),
    ).toEqual(['menciona un cron', 'programa una tarea (schedule...)']);
    expect(hallazgosDeFondo('import { spawn } from "node:child_process";')).toEqual([
      'lanza un proceso hijo',
    ]);
    expect(hallazgosDeFondo('const w = new Worker("./tarea.js");')).toEqual(['arranca un worker']);

    // El simetrico: el dominio real de esta ficha, que habla de plazos vencidos sin programar nada.
    expect(
      hallazgosDeFondo(
        'export function effectiveAccountStatus(ficha, ahora) {\n' +
          '  if (ficha.status !== "blocked") return ficha.status;\n' +
          '  return ficha.lockedUntil !== null && ficha.lockedUntil <= ahora ? "active" : "blocked";\n' +
          '}',
      ),
    ).toEqual([]);
  });

  it('la regla de fondo no se ciega: un comentario de linea no esconde el codigo de debajo', () => {
    const cegado = [
      '// QC-78 R23: aqui no hay ningun /* temporizador */ programado',
      'export function arrancar() { setInterval(revisar, 60000); }',
      '/** JSDoc posterior que cerraria el bloque falso. */',
      'export const revalidate = 0;',
    ].join('\n');

    expect(
      hallazgosDeFondo(cegado),
      'stripComments quita los comentarios de LINEA antes que los de BLOQUE. Si alguien invierte ' +
        'ese orden, un comentario de linea con una apertura de bloque se traga el codigo de debajo ' +
        'y esta regla pasa en verde sin mirar el archivo.',
    ).toEqual(['usa setInterval(...)']);

    // Y sin el comentario el veredicto es el mismo: lo que se afirma es que el comentario NO
    // cambia el resultado, no que el fuente case por casualidad.
    expect(hallazgosDeFondo(cegado.split('\n').slice(1).join('\n'))).toEqual([
      'usa setInterval(...)',
    ]);
  });

  it('la regla de route handlers dispara con cambios fabricados y no con los ajenos', () => {
    expect(
      rutasDeApiNuevas([
        { ruta: 'app/api/cuentas/route.ts', estado: 'A' },
        { ruta: 'lib/modules/identity/domain/verify-credentials.ts', estado: 'M' },
      ]),
    ).toEqual(['app/api/cuentas/route.ts']);

    // Un route handler que YA existia y solo se modifica no es «nuevo»; una pagina bajo `app/`
    // que no es `route.*` tampoco; y un `route.ts` fuera de `app/api/` tampoco.
    expect(
      rutasDeApiNuevas([
        { ruta: 'app/api/webhooks/route.ts', estado: 'M' },
        { ruta: 'app/(private)/pedidos/page.tsx', estado: 'A' },
        { ruta: 'lib/shared/route.ts', estado: 'A' },
      ]),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// LA PRECONDICION, PROBADA
// ---------------------------------------------------------------------------------------------
//
// Si `esLaRamaDeQC78()` mintiera hacia el «si», esta guardia se convertiria en la bomba de
// relojeria que la cabecera describe. Si mintiera hacia el «no», se apagaria en su propia rama.
// Las dos direcciones se prueban aqui con listas fabricadas, sin tocar git.

describe('la precondicion de rama distingue QC-78 de cualquier otra ficha', () => {
  it('dice que si solo con las DOS senales a la vez', () => {
    expect(esLaRamaDeQC78([ARCHIVO_CENTRAL_DE_QC78, `${CARPETA_SPEC_DE_QC78}tasks.md`])).toBe(true);
  });

  it('dice que no con una sola de las dos', () => {
    expect(esLaRamaDeQC78([ARCHIVO_CENTRAL_DE_QC78])).toBe(false);
    expect(esLaRamaDeQC78([`${CARPETA_SPEC_DE_QC78}design.md`])).toBe(false);
  });

  it('dice que no en la rama de otra ficha que toca el mismo modulo', () => {
    expect(
      esLaRamaDeQC78([
        'lib/modules/identity/domain/account-status.ts',
        'lib/modules/identity/index.ts',
        'specs/QC-66-desbloqueo-administrativo/tasks.md',
        // Y tampoco si esa ficha enmienda ESTE archivo de test al chocar con el: por eso el
        // propio archivo NO es una de las senales.
        'tests/unit/identity/qc78-alcance.test.ts',
      ]),
    ).toBe(false);
  });

  it('y las dos senales son rutas que existen hoy: si no, la guardia se apagaria sola', () => {
    // Que la precondicion no se pudra: si alguien renombra el archivo central, esto avisa en vez
    // de dejar la guardia muda para siempre.
    expect(
      existsSync(join(RAIZ, ARCHIVO_CENTRAL_DE_QC78)),
      `no existe ${ARCHIVO_CENTRAL_DE_QC78}: la precondicion nunca se cumpliria y R23/R26/R27 ` +
        'quedarian saltados en su propia rama.',
    ).toBe(true);
    expect(existsSync(join(RAIZ, CARPETA_SPEC_DE_QC78))).toBe(true);
  });
});
