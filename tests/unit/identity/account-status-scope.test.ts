// QC-65 T14 — LA GUARDIA DE ALCANCE (`design.md > 5.2`, ultima fila). Cubre R18, R19, R20 y R21.
//
// R18-R21 son requisitos de ALCANCE, y son requisitos de pleno derecho, no comentarios
// (`requirements.md`, cabecera de la seccion): lo que QC-65 escribe es poco; lo que NO puede
// tocar es lo que la hace segura. Se testean como los demas, con una guardia que cae si alguien
// cruza la frontera.
//
// Lo que esta guardia promete no se ve ejecutando nada: es una propiedad del ARBOL y del CAMBIO.
// Por eso mira dos cosas distintas:
//   - el arbol: que ningun archivo de produccion nombre el estado fuera de una lista CERRADA;
//   - el cambio: que el diff de la rama no toque lo que la ficha declaro intocable.
//
// **Si el rango git no esta disponible, este archivo FALLA RUIDOSAMENTE**, no se salta y no pasa
// en silencio (misma leccion y mismo patron que `tests/unit/configuracion-ui/data-table-intacta.test.ts`):
// una guardia que se auto-desactiva cuando no puede mirar es indistinguible de una guardia rota.
// Las unicas excepciones —y no son excepciones a ese principio, sino su otra cara— son que la rama
// NO SEA LA DE QC-65 (sus reglas de alcance no le aplican a otra ficha) o que no haya tocado NADA:
// ahi los casos que miran el CAMBIO quedan `skipped` y lo dicen en voz alta, nunca verdes. Ver
// `tocadosOMudo()` y `esLaRamaDeQC65()` mas abajo: «no puedo mirar» es rojo; «esto no es lo mio» y
// «no hay nada que mirar» son mudos y ruidosos.

import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, type TestContext } from 'vitest';

const RAIZ = join(__dirname, '..', '..', '..');

/**
 * El rango contra el que se compara: la BASE DE FUSION con `origin/dev`, calculada en cada
 * ejecucion con `git merge-base origin/dev HEAD`.
 *
 * Antes era el literal `dev...HEAD`, y eso media la rama equivocada: el `dev` LOCAL de este repo
 * va por detras del remoto —18 commits, visto el 2026-09-08—, asi que el rango arrastraba trabajo
 * AJENO ya mergeado y se lo atribuia a la rama en curso. La base de fusion con `origin/dev` mide
 * solo lo que ESTA rama anade sobre el tronco, y sigue siendo correcta despues de cualquier merge.
 * Es el mismo idioma que ya usan `tests/unit/navegacion/qc75-convenciones.test.ts` y
 * `tests/unit/unidades/modulo-intacto.test.ts`, de donde se copia.
 */
const RANGO = 'git merge-base origin/dev HEAD';

function git(comando: string): string {
  return execSync(comando, { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

/**
 * La base de fusion con `origin/dev`, o `null` si el rango no esta disponible aqui (sin remoto,
 * clon superficial). Mismo helper que `mergeBaseConDev()` en `qc75-convenciones.test.ts`: devuelve
 * `null` y quien lo llama decide. Aqui, quien lo llama LANZA —ver `archivosTocados()`—, porque la
 * doctrina de este archivo es que «no puedo mirar» es rojo.
 */
function baseDeFusionConDev(): string | null {
  try {
    return git('git merge-base origin/dev HEAD').trim();
  } catch {
    return null;
  }
}

function aPosix(ruta: string): string {
  return ruta.split('\\').join('/');
}

/**
 * Archivos que esta rama ha tocado respecto de la base de fusion con `origin/dev`: los del rango
 * MAS los del arbol de trabajo, para que la guardia muerda antes incluso de commitear. Lanza
 * —a proposito— si el rango no se puede calcular.
 */
function archivosTocados(): readonly string[] {
  let delRango: string;
  try {
    const base = baseDeFusionConDev();
    if (base === null) throw new Error('`git merge-base origin/dev HEAD` no resolvio');
    delRango = git(`git diff --name-only ${base}`);
  } catch (error) {
    throw new Error(
      `No se pudo calcular el diff contra \`${RANGO}\`, asi que R18/R20/R21 NO se han comprobado. ` +
        'Esta guardia falla en vez de pasar en silencio. ' +
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
    const destino = camino.includes(' -> ') ? (camino.split(' -> ')[1] ?? camino) : camino;
    tocados.add(aPosix(destino.replace(/^"|"$/g, '')));
  }
  return [...tocados].sort();
}

/**
 * Como se nombra el estado de cuenta en cualquiera de sus tres grafias: el campo del cliente
 * Prisma (`accountStatus`), la columna (`account_status`) y las constantes del dominio
 * (`USER_ACCOUNT_STATUSES`, `SEED_ADMIN_ACCOUNT_STATUS`). Va SIN distinguir mayusculas a
 * proposito: reexportar la constante desde un contrato tambien es tocar el estado, y una
 * guardia que solo mirara `accountStatus` dejaria pasar `ACCOUNT_STATUS`.
 */
const MENCION_DEL_ESTADO = /account[_ ]?status/i;

/** Las carpetas de produccion que R19 vigila, mas el middleware. */
const RAICES_DE_PRODUCCION = ['lib', 'app', 'components', 'hooks'] as const;
const ARCHIVOS_SUELTOS_DE_PRODUCCION = ['middleware.ts'] as const;

const EXTENSIONES = ['.ts', '.tsx'] as const;
const CARPETAS_IGNORADAS = new Set(['node_modules', '.next', '.git', 'generated']);

function listarArchivos(relativa: string): readonly string[] {
  const absoluta = join(RAIZ, relativa);
  const encontrados: string[] = [];
  for (const entrada of readdirSync(absoluta)) {
    if (CARPETAS_IGNORADAS.has(entrada)) continue;
    const hijaRelativa = `${relativa}/${entrada}`;
    if (statSync(join(RAIZ, hijaRelativa)).isDirectory()) {
      encontrados.push(...listarArchivos(hijaRelativa));
      continue;
    }
    if (EXTENSIONES.some((extension) => entrada.endsWith(extension))) encontrados.push(hijaRelativa);
  }
  return encontrados;
}

/** Todos los archivos de produccion que R19 alcanza, en rutas POSIX relativas a la raiz. */
function archivosDeProduccion(): readonly string[] {
  const archivos = RAICES_DE_PRODUCCION.flatMap((raiz) => listarArchivos(raiz));
  return [...archivos, ...ARCHIVOS_SUELTOS_DE_PRODUCCION].sort();
}

function leer(ruta: string): string {
  return readFileSync(join(RAIZ, ruta), 'utf8');
}

/**
 * LA LISTA CERRADA de R19: los UNICOS archivos de produccion que pueden nombrar el estado de
 * cuenta. Son el dominio que lo declara —la unica definicion del conjunto (R3)—, su reexport en
 * el contrato del modulo, y el camino del seed, que es lo unico que lo ESCRIBE (R7): el puerto,
 * el caso de uso y el adaptador Prisma.
 *
 * Los otros dos sitios permitidos, `db/schema.prisma` y el `migration.sql`, no son TypeScript y
 * quedan fuera de estas carpetas; se comprueban aparte, mas abajo.
 *
 * Se compara con IGUALDAD, nunca con `toContain`: la lista tiene que quedarse quieta. La lista
 * CRECE cuando una ficha nueva empieza legitimamente a nombrar el estado, y cada entrada se
 * NOMBRA UNA A UNA con el motivo de su grupo (ver el bloque RETENSADO de abajo); nunca se
 * sustituye por un `toContain` ni por un filtro que excluya una carpeta entera.
 */
const SITIOS_PERMITIDOS = [
  'lib/modules/identity/adapters/driven/persistence/initial-access-repository-prisma.ts',
  'lib/modules/identity/domain/account-status.ts',
  'lib/modules/identity/domain/seed-initial-access.ts',
  'lib/modules/identity/index.ts',
  'lib/modules/identity/ports/initial-access-repository.ts',

  // RETENSADO 2026-09-10 (QC-66, crud-de-usuarios). Hasta hoy esta lista tenia CINCO entradas y
  // su premisa era «NADIE lee todavia el estado para decidir nada; quien lo lea llega en QC-78 y
  // esta lista es la conversacion que tendra que abrir». **QC-66 es precisamente la ficha que
  // empieza a leer y a escribir el estado de cuenta**, asi que la premisa caduco POR DISENO, no
  // por defecto: el alta lo fija en `pending` (R13), el listado filtra por el (R29), la fila y la
  // ficha lo devuelven (R31, R32) y hay un caso de uso entero dedicado a moverlo (R25, R26).
  //
  // El centinela se RETENSA, no se borra ni se afloja. Lo que protegia de verdad no era la
  // ausencia: era que el estado no apareciese por GOTEO, repartido por el repositorio y sin ficha
  // que lo respalde. Eso sigue vigente y es lo que se vigila ahora: la lista sigue siendo CERRADA
  // y comparada con IGUALDAD, asi que cualquier archivo FUERA de ella pone el caso rojo igual que
  // antes. Mismo trato que recibieron los cinco retensados de
  // `tests/unit/recetas-ui/recipe-route-contract.test.ts`.
  //
  // Los cambios son ADITIVOS y van en su propio bloque rotulado a proposito: **QC-78 («el estado
  // de cuenta en el acceso») esta `in_progress` en otra sesion** y va a anadir SUS sitios a esta
  // misma lista. Nada de lo que habia arriba se reordena ni se reformatea, para que el merge de
  // QC-78 sea un anadido al lado de este bloque y no un conflicto en la misma linea.
  //
  // GRUPO 1 — el CONTRATO de los seis casos de uso de QC-66 (`domain/` y `ports/`). El estado es
  // parte de lo que declaran: el alta lo escribe (R13), la entrada lo excluye a proposito y lo
  // dice (R20), el campo consultable lo declara (R29), los dos tipos de salida lo llevan (R31,
  // R32), y moverlo es un caso de uso con su puerto (R25, R26).
  'lib/modules/identity/domain/create-user.ts',
  'lib/modules/identity/domain/set-user-account-status.ts',
  'lib/modules/identity/domain/user-input.ts',
  'lib/modules/identity/domain/user-queryable.ts',
  'lib/modules/identity/domain/user-view.ts',
  'lib/modules/identity/ports/user-admin-repository.ts',

  // GRUPO 2 — los dos adaptadores driven de persistencia, que ESCRIBEN y FILTRAN la columna:
  // `user-admin-prisma.ts` la enumera en su `select` y la actualiza al mover el estado, y
  // `list-query-sql.ts` la traduce a la clausula del filtro del listado (R29).
  'lib/modules/identity/adapters/driven/persistence/list-query-sql.ts',
  'lib/modules/identity/adapters/driven/persistence/user-admin-prisma.ts',

  // GRUPO 3 — el adaptador driving, que TRADUCE la mutacion: la Server Action lee
  // `accountStatus` del `FormData` y se lo pasa al caso de uso (R40). Lo nombra de forma
  // funcional y no se puede quitar sin quitar la operacion.
  'lib/modules/identity/adapters/driving/user-actions.ts',

  // GRUPO 4 — el punto de composicion, y aqui NO HAY ALTERNATIVA: la clave de la fachada se
  // llama `setUserAccountStatus`. El nombre lo fija `design.md > 11` y lo exige R25, asi que
  // `lib/composition/index.ts` nombra el estado por su NOMBRE DE CLAVE, no porque lea la columna.
  'lib/composition/index.ts',
] as const;

/** Las dos piezas de QC-19 que esta ficha declara intocables (R18). */
const PIEZAS_DE_QC19 = [
  'lib/modules/identity/domain/verify-credentials.ts',
  'lib/modules/identity/domain/account-lock.ts',
] as const;

/**
 * Los dos casos en que los tres casos que miran el CAMBIO (R18, R20, R21) quedan MUDOS:
 *
 *   1. LA RAMA NO ES LA DE QC-65 (ver `esLaRamaDeQC65()` mas abajo). Estas reglas son el alcance
 *      de esa ficha; aplicarlas a otra rama no mide nada, solo pone en rojo trabajo legitimo ajeno.
 *   2. EL CASO DEGENERADO: la rama no ha tocado NADA respecto de la base de fusion con
 *      `origin/dev`. Ocurre en cuanto QC-65 se
 *      mergea y alguien corre esta guardia sobre `dev` con el arbol limpio: no hay diff que
 *      inspeccionar.
 *
 * En ambos, los tres casos se declaran `skipped` en vez de verdes: un verde afirmaria «he revisado
 * el diff de QC-65 y no cruza ninguna frontera», que seria falso, y ese falso verde es justo lo que
 * taparia el dia que la guardia deje de mirar de verdad. El salto dice lo unico cierto: que ese
 * caso NO ha comprobado nada.
 *
 * Esto NO contradice la cabecera de este archivo, porque son dos situaciones distintas:
 *   - «NO PUEDO mirar» (el rango git no resuelve) sigue siendo ROJO — lo lanza `archivosTocados()`;
 *   - «he mirado y NO HABIA NADA que mirar» es lo unico que queda mudo.
 * Nada mas se relaja: en una rama con cambios reales los tres casos vigilan exactamente igual que
 * antes, con las mismas listas cerradas y las mismas igualdades.
 */
/**
 * Las infracciones de alcance de R20 sobre una lista de archivos. Funcion PURA y exportada: los
 * casos de abajo la ejercitan contra el arbol real -donde debe salir vacia- y contra listas
 * sinteticas -donde debe morder-. Una guardia que solo se ejercita contra el arbol real no
 * demuestra que pueda fallar.
 */
export function infraccionesDeAlcance(tocados: readonly string[]): readonly string[] {
  return tocados.filter(
    (archivo) =>
      archivo.startsWith('app/') ||
      archivo.startsWith('components/') ||
      archivo.startsWith('hooks/') ||
      archivo === 'middleware.ts' ||
      /^lib\/modules\/[^/]+\/adapters\/driving\//.test(archivo),
  );
}

/**
 * ESTOS CASOS SOLO APLICAN EN LA RAMA DE QC-65 (anadido el 2026-09-08).
 *
 * Antes bastaba con que el rango NO estuviera vacio, y el efecto era que este centinela ponia en
 * ROJO el gate completo de cualquier otra rama de feature: sus reglas son sobre el alcance de
 * ESTA ficha -«QC-65 no toca `app/`, `components/` ni `hooks/`»- y las declaraban intocables para
 * todo el mundo. Visto desde QC-70 el 2026-09-08, que toca once archivos de `app/` **con permiso
 * explicito del humano** y sacaba 18 rutas «prohibidas» que no lo eran. Como el gate completo es
 * obligatorio antes de cada PR (regla 5 de `CLAUDE.md`), bloqueaba el cierre de todo el repo.
 *
 * MISMO ARREGLO Y MISMA FORMA que `tests/unit/navegacion/qc75-convenciones.test.ts`, commit
 * `7cd478b`. En la rama de QC-65 el comportamiento NO cambia: el archivo central esta en el rango
 * y los tres casos vigilan exactamente igual que antes, con las mismas listas cerradas.
 *
 * Fuera de su rama quedan MUDOS (`skipped`), nunca verdes: un verde diria «he revisado el diff y
 * no cruza ninguna frontera» sin haber mirado nada, que es el anti-patron de la «validacion
 * opcional» de `docs/verification.md`.
 */
function tocadosOMudo(ctx: Pick<TestContext, 'skip'>): readonly string[] {
  const tocados = archivosTocados();
  if (!esLaRamaDeQC65(tocados)) {
    ctx.skip(
      'el rango no trae a la vez `' +
        ARCHIVO_CENTRAL_DE_QC65 +
        '` y `' +
        CARPETA_SPEC_DE_QC65 +
        '`: esta NO es la rama de QC-65, asi que este caso NO ha comprobado nada. ' +
        'R18/R20/R21 son el alcance de ESA ficha y no le aplican a ninguna otra.',
    );
  }
  if (tocados.length === 0) {
    ctx.skip(
      'la rama no toca ningun archivo respecto de la base de fusion con `origin/dev`: no hay ' +
        'diff que revisar, asi que este caso NO ha comprobado nada',
    );
  }
  return tocados;
}

/**
 * LA PRECONDICION DE RAMA. Esta guardia SOLO aplica en la rama de QC-65: R18, R20 y R21 hablan del
 * alcance de ESA ficha —«ni caso de uso de cambio, ni adaptador driving, ni ruta, ni Server Action,
 * ni pantalla»—, no del de las demas.
 *
 * Por que cambia: el centinela nunca comprobo QUE RAMA estaba midiendo. Mientras QC-65 vivia en su
 * worktree eso no se notaba; en cuanto se mergeo en `dev`, empezo a medir CUALQUIER rama con las
 * reglas de alcance de QC-65. Lo descubrio QC-39 el 2026-09-08 al construir su pantalla: es una
 * ficha `frontend` cuyo trabajo entero es crear `app/(private)/configuracion/unidades/`, y sus 16
 * archivos salieron listados como infractores de R20. Ninguno lo era: son exactamente lo que su
 * spec manda construir.
 *
 * TERCER EPISODIO DE LA MISMA CLASE en este repo, tras `tests/unit/navegacion/qc75-convenciones.test.ts`
 * y el de QC-38: un centinela de alcance escrito por una ficha que, ya mergeada, pone en rojo el
 * gate de todas las ramas siguientes. De ahi que la senal se elija CONJUNTIVA y copiando el patron
 * ya usado alli.
 *
 * La senal: el archivo central del dominio del estado MAS la carpeta de spec de la propia ficha.
 * La carpeta de spec discrimina de verdad porque nace y vive dentro del rango de QC-65 y no aparece
 * jamas en el rango de ninguna otra ficha, que trae la SUYA. No se usa este archivo de test como
 * senal, justamente porque otras fichas lo enmiendan al chocar con el, como esta.
 *
 * Esto ENDURECE la precondicion, no relaja la comprobacion: en la rama real de QC-65 ambas senales
 * estan presentes y los casos de abajo corren exactamente igual y con la misma severidad.
 */
const ARCHIVO_CENTRAL_DE_QC65 = 'lib/modules/identity/domain/account-status.ts';
const CARPETA_SPEC_DE_QC65 = 'specs/QC-65-estado-de-cuenta-de-usuario/';

export function esLaRamaDeQC65(tocados: readonly string[]): boolean {
  return (
    tocados.includes(ARCHIVO_CENTRAL_DE_QC65) &&
    tocados.some((archivo) => archivo.startsWith(CARPETA_SPEC_DE_QC65))
  );
}

describe('el rango git esta disponible: la guardia puede mirar de verdad', () => {
  it(`\`${RANGO}\` resuelve; si no, este archivo falla ruidosamente`, () => {
    expect(() => archivosTocados()).not.toThrow();
  });
});

describe('R18 — el bloqueo por intentos fallidos de QC-19 no se toca', () => {
  it('ni verify-credentials ni account-lock mencionan el estado de cuenta', () => {
    // Primero: los dos archivos existen y tienen contenido (una lectura vacia no prueba nada).
    for (const pieza of PIEZAS_DE_QC19) {
      const fuente = leer(pieza);
      expect(fuente.length).toBeGreaterThan(0);
      expect(fuente).not.toMatch(MENCION_DEL_ESTADO);
    }
    // Y siguen hablando de lo suyo: si alguien vaciara el archivo, el `not.toMatch` de arriba
    // pasaria en verde. Esta linea es la que impide ese falso positivo.
    expect(leer('lib/modules/identity/domain/account-lock.ts')).toMatch(/failed[_A-Za-z]*attempts/i);
  });

  it('el diff de la rama no toca ninguno de los dos archivos', (ctx) => {
    // Si la rama no toca nada, este caso queda mudo (`skipped`) en vez de afirmar en vacuo.
    const tocados = tocadosOMudo(ctx);
    expect(tocados.filter((archivo) => (PIEZAS_DE_QC19 as readonly string[]).includes(archivo))).toEqual([]);
  });
});

describe('R19 — el estado de cuenta se nombra EXACTAMENTE donde su ficha lo declara, y en ningun otro sitio', () => {
  it('los archivos de produccion que nombran el estado son EXACTAMENTE los de la lista cerrada', () => {
    const archivos = archivosDeProduccion();
    // Primero: el barrido encontro arbol de verdad. Un `readdir` que devolviera poco dejaria
    // la igualdad de abajo en verde por la razon equivocada.
    expect(archivos.length).toBeGreaterThan(100);
    expect(archivos).toContain('middleware.ts');

    const queLoNombran = archivos.filter((archivo) => MENCION_DEL_ESTADO.test(leer(archivo)));
    // IGUALDAD, no `toContain`: cualquier archivo nuevo que lo nombre pone esto en rojo.
    expect(queLoNombran).toEqual([...SITIOS_PERMITIDOS].sort());
  });

  it('ni el login, ni la sesion, ni el middleware, ni la UI lo nombran', () => {
    // Los cinco caminos por los que una lectura de estado se colaria primero, dichos por su
    // nombre para que el fallo se lea solo. Ninguno esta en la lista permitida.
    const caminosSensibles = [
      'lib/modules/identity/domain/verify-credentials.ts',
      'lib/modules/identity/domain/resolve-session-user.ts',
      'lib/modules/identity/domain/session-user.ts',
      'lib/modules/identity/domain/route-access.ts',
      'middleware.ts',
    ] as const;
    for (const camino of caminosSensibles) {
      expect((SITIOS_PERMITIDOS as readonly string[]).includes(camino)).toBe(false);
      expect(leer(camino)).not.toMatch(MENCION_DEL_ESTADO);
    }
  });

  it('el esquema y la migracion, que son los otros dos sitios permitidos, si lo nombran', () => {
    // El ancla positiva: sin esto, un `MENCION_DEL_ESTADO` roto dejaria toda la guardia en
    // verde sin mirar nada.
    expect(leer('db/schema.prisma')).toMatch(MENCION_DEL_ESTADO);
    expect(leer('db/migrations/20260908190002_user_account_status/migration.sql')).toMatch(
      MENCION_DEL_ESTADO,
    );
    for (const permitido of SITIOS_PERMITIDOS) {
      expect(leer(permitido)).toMatch(MENCION_DEL_ESTADO);
    }
  });
});

describe('R20 — ni caso de uso de cambio, ni adaptador driving, ni ruta, ni Server Action, ni pantalla', () => {
  it('el diff de la rama no toca app/, components/ ni hooks/, y no anade ningun adaptador driving', (ctx) => {
    // Si la rama no toca nada, este caso queda mudo (`skipped`) en vez de afirmar en vacuo.
    const tocados = tocadosOMudo(ctx);

    expect(infraccionesDeAlcance(tocados)).toEqual([]);
  });

  it('el unico adaptador driving que nombra el estado es el que declara su ficha', () => {
    // El complemento del caso anterior sobre el ARBOL: aunque el diff no lo delatara (por
    // ejemplo si `dev` avanzara), ningun driving puede nombrar el estado. Se deriva de la
    // lista cerrada, no de una segunda lista escrita a mano.
    //
    // RETENSADO 2026-09-10 (QC-66), forzado por el retensado de `SITIOS_PERMITIDOS`: este caso se
    // DERIVA de esa lista, asi que anadirle el driving de QC-66 lo ponia rojo por construccion.
    // La premisa vieja —«ningun driving, ni Server Action»— era el alcance de QC-65, y caduco con
    // la ficha que SI trae las Server Actions (QC-66 R40). La excepcion se NOMBRA una a una y la
    // igualdad sigue siendo exacta: un SEGUNDO driving que nombre el estado —o una ruta API
    // disfrazada— sigue poniendo este caso rojo igual que antes.
    const DRIVING_DE_QC66 = ['lib/modules/identity/adapters/driving/user-actions.ts'] as const;
    const drivings = SITIOS_PERMITIDOS.filter(
      (archivo) => archivo.includes('/adapters/driving/'),
    ).filter((archivo) => !(DRIVING_DE_QC66 as readonly string[]).includes(archivo));
    expect(drivings).toEqual([]);
  });
});

describe('R21 — ninguna dependencia nueva', () => {
  it('el diff de la rama no toca package.json ni pnpm-lock.yaml', (ctx) => {
    // Si la rama no toca nada, este caso queda mudo (`skipped`) en vez de afirmar en vacuo.
    const tocados = tocadosOMudo(ctx);
    expect(tocados.filter((archivo) => archivo === 'package.json' || archivo === 'pnpm-lock.yaml')).toEqual(
      [],
    );
  });
});

/**
 * QUE ESTE CENTINELA SIGA MORDIENDO EN SU PROPIA RAMA (anadido el 2026-09-08, con el arreglo del
 * salto de arriba).
 *
 * Una guardia que se salta siempre no protege nada, y seria peor que el problema que el salto
 * arregla. Estos casos ejercitan las dos funciones puras con listas SINTETICAS, sin depender de
 * en que rama corra el gate: la deteccion de rama en los dos sentidos, y las infracciones de R20
 * con y sin violacion.
 */
describe('el salto no vacia la guardia: en la rama de QC-65 sigue mordiendo', () => {
  const RAMA_DE_QC65 = [
    'lib/modules/identity/domain/account-status.ts',
    'lib/modules/identity/index.ts',
    'specs/QC-65-estado-de-cuenta-de-usuario/requirements.md',
  ];

  it('reconoce la rama de QC-65 por sus DOS senales, y NO reconoce otra', () => {
    expect(esLaRamaDeQC65(RAMA_DE_QC65)).toBe(true);
    // El diff real de QC-70: toca `app/` y un adaptador driving, pero ninguna de las dos senales.
    expect(
      esLaRamaDeQC65([
        'app/(private)/proveedores/[id]/page.tsx',
        'lib/modules/unidades/adapters/driving/unit-actions.ts',
      ]),
    ).toBe(false);
    // Y la senal es CONJUNTIVA: con el archivo central solo -que otra ficha podria rozar- no basta.
    expect(esLaRamaDeQC65(['lib/modules/identity/domain/account-status.ts'])).toBe(false);
    expect(esLaRamaDeQC65(['specs/QC-65-estado-de-cuenta-de-usuario/design.md'])).toBe(false);
  });

  it('dentro de su rama, R20 MUERDE con una pantalla, un componente, un hook o un driving', () => {
    const infractora = [...RAMA_DE_QC65, 'app/(private)/cuentas/page.tsx'];
    expect(esLaRamaDeQC65(infractora)).toBe(true);
    expect(infraccionesDeAlcance(infractora)).toEqual(['app/(private)/cuentas/page.tsx']);

    expect(infraccionesDeAlcance([...RAMA_DE_QC65, 'components/shared/estado-cuenta.tsx'])).toEqual([
      'components/shared/estado-cuenta.tsx',
    ]);
    expect(infraccionesDeAlcance([...RAMA_DE_QC65, 'hooks/use-estado-cuenta.ts'])).toEqual([
      'hooks/use-estado-cuenta.ts',
    ]);
    expect(infraccionesDeAlcance([...RAMA_DE_QC65, 'middleware.ts'])).toEqual(['middleware.ts']);
    expect(
      infraccionesDeAlcance([
        ...RAMA_DE_QC65,
        'lib/modules/identity/adapters/driving/account-status-actions.ts',
      ]),
    ).toEqual(['lib/modules/identity/adapters/driving/account-status-actions.ts']);
  });

  it('y no muerde con el alcance legitimo de QC-65', () => {
    expect(
      infraccionesDeAlcance([
        ...RAMA_DE_QC65,
        'lib/modules/identity/ports/initial-access-repository.ts',
        'lib/modules/identity/domain/seed-initial-access.ts',
        'db/schema.prisma',
      ]),
    ).toEqual([]);
  });
});
