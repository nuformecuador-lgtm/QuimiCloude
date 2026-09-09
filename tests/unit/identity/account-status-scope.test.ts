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
// La unica excepcion —y no es una excepcion a ese principio, sino su otra cara— es que la rama no
// haya tocado NADA: ahi los casos que miran el CAMBIO quedan `skipped`, nunca verdes. Ver
// `tocadosOMudo()` mas abajo: «no puedo mirar» es rojo; «no hay nada que mirar» es mudo.

import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, type TestContext } from 'vitest';

const RAIZ = join(__dirname, '..', '..', '..');

/** El rango contra el que se compara. `dev` es la rama de la que sale el worktree. */
const RANGO = 'dev...HEAD';

function git(comando: string): string {
  return execSync(comando, { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function aPosix(ruta: string): string {
  return ruta.split('\\').join('/');
}

/**
 * Archivos que esta rama ha tocado respecto de `dev`: los del rango MAS los del arbol de
 * trabajo, para que la guardia muerda antes incluso de commitear. Lanza —a proposito— si el
 * rango no se puede calcular.
 */
function archivosTocados(): readonly string[] {
  let delRango: string;
  try {
    delRango = git(`git diff --name-only ${RANGO}`);
  } catch (error) {
    throw new Error(
      `No se pudo calcular el diff \`${RANGO}\`, asi que R18/R20/R21 NO se han comprobado. ` +
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
 * Se compara con IGUALDAD, nunca con `toContain`: la lista tiene que quedarse quieta. NADIE lee
 * todavia el estado para decidir nada —ni el login, ni la sesion, ni el middleware, ni la UI—;
 * quien lo lea llega en QC-78 y esta lista es la conversacion que tendra que abrir.
 */
const SITIOS_PERMITIDOS = [
  'lib/modules/identity/adapters/driven/persistence/initial-access-repository-prisma.ts',
  'lib/modules/identity/domain/account-status.ts',
  'lib/modules/identity/domain/seed-initial-access.ts',
  'lib/modules/identity/index.ts',
  'lib/modules/identity/ports/initial-access-repository.ts',
] as const;

/** Las dos piezas de QC-19 que esta ficha declara intocables (R18). */
const PIEZAS_DE_QC19 = [
  'lib/modules/identity/domain/verify-credentials.ts',
  'lib/modules/identity/domain/account-lock.ts',
] as const;

/**
 * El caso degenerado: la rama no ha tocado NADA respecto de `dev`. Ocurre en cuanto QC-65 se
 * mergea y alguien corre esta guardia sobre `dev` con el arbol limpio. Entonces no hay diff que
 * inspeccionar, y los tres casos que miran el CAMBIO (R18, R20, R21) se declaran `skipped` en
 * vez de verdes: un verde afirmaria «he revisado el diff y no cruza ninguna frontera», que seria
 * falso, y ese falso verde es justo lo que taparia el dia que la guardia deje de mirar de verdad.
 * `skipped` dice lo unico cierto: no habia nada que revisar.
 *
 * Esto NO contradice la cabecera de este archivo, porque son dos situaciones distintas:
 *   - «NO PUEDO mirar» (el rango git no resuelve) sigue siendo ROJO — lo lanza `archivosTocados()`;
 *   - «he mirado y NO HABIA NADA que mirar» es lo unico que queda mudo.
 * Nada mas se relaja: en una rama con cambios reales los tres casos vigilan exactamente igual que
 * antes, con las mismas listas cerradas y las mismas igualdades.
 */
/**
 * EL ARCHIVO CENTRAL DE QC-65. Es el dominio que DECLARA el estado de cuenta: ninguna rama puede
 * implementar esta ficha sin tocarlo, y ninguna otra ficha tiene motivo para hacerlo. Que aparezca
 * en el rango es lo que dice «esta ES la rama de QC-65».
 */
const ARCHIVO_CENTRAL = 'lib/modules/identity/domain/account-status.ts';

/** Puro y exportado para poder ejercitarlo con listas sinteticas, en los dos sentidos. */
export function esLaRamaDeQC65(tocados: readonly string[]): boolean {
  return tocados.includes(ARCHIVO_CENTRAL);
}

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
  if (tocados.length === 0) {
    ctx.skip('la rama no toca ningun archivo respecto de `dev`: no hay diff que revisar');
  }
  if (!esLaRamaDeQC65(tocados)) {
    ctx.skip(
      'el rango trae archivos pero ninguno es `' +
        ARCHIVO_CENTRAL +
        '`: esta NO es la rama de QC-65, asi que su alcance no le aplica y este caso NO ha ' +
        'comprobado nada.',
    );
  }
  return tocados;
}

describe('el rango git esta disponible: la guardia puede mirar de verdad', () => {
  it(`\`git diff --name-only ${RANGO}\` resuelve; si no, este archivo falla ruidosamente`, () => {
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

describe('R19 — nadie lee todavia el estado de cuenta', () => {
  it('los archivos de produccion que nombran el estado son EXACTAMENTE los cinco permitidos', () => {
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

  it('el modulo identity no gana ningun archivo driving que nombre el estado', () => {
    // El complemento del caso anterior sobre el ARBOL: aunque el diff no lo delatara (por
    // ejemplo si `dev` avanzara), ningun driving puede nombrar el estado. Se deriva de la
    // lista cerrada, no de una segunda lista escrita a mano.
    const drivings = SITIOS_PERMITIDOS.filter((archivo) => archivo.includes('/adapters/driving/'));
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
  ];

  it('reconoce la rama de QC-65 por su archivo central, y NO reconoce otra', () => {
    expect(esLaRamaDeQC65(RAMA_DE_QC65)).toBe(true);
    // El diff real de QC-70: toca `app/` y un adaptador driving, pero NO el archivo central.
    expect(
      esLaRamaDeQC65([
        'app/(private)/proveedores/[id]/page.tsx',
        'lib/modules/unidades/adapters/driving/unit-actions.ts',
      ]),
    ).toBe(false);
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
