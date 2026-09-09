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

function esLaRamaDeQC65(tocados: readonly string[]): boolean {
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

    const prohibidos = tocados.filter(
      (archivo) =>
        archivo.startsWith('app/') ||
        archivo.startsWith('components/') ||
        archivo.startsWith('hooks/') ||
        archivo === 'middleware.ts' ||
        /^lib\/modules\/[^/]+\/adapters\/driving\//.test(archivo),
    );
    expect(prohibidos).toEqual([]);
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
