// QC-66 T18 — EL TEST DE ALCANCE (`design.md > 14`, fila «Unit (alcance)»).
//
// Cubre R38, R43, R45, R46 y R47, y de paso R16 (ningun `console.*` donde se fabrica la
// credencial) y R24 (el nombre del rol administrador nunca se escribe a mano).
//
// R38-R48 son requisitos de ALCANCE y son requisitos de pleno derecho, no comentarios
// (`requirements.md`, cabecera de «Como leer los requisitos que dicen no»). Lo que esta ficha
// escribe lo prueban los tests de dominio, de borde y de integracion; lo que esta ficha NO PUEDE
// TOCAR -el esquema, los tres indices unicos de QC-47, el mecanismo de bloqueo de QC-19/QC-78, la
// pantalla de QC-67 y el `package.json`- solo se prueba aqui.
//
// Estilo copiado de `tests/unit/proveedores/scope.test.ts`: se recorre el DISCO y el TEXTO, no el
// grafo de imports (eso es trabajo de `tests/guards/`), y ninguna afirmacion hace un censo GLOBAL
// del repositorio, para no romperse cuando una ficha vecina se mergee.
//
// ---------------------------------------------------------------------------------------------
// RETENSADO 2026-09-10 (MAYOR-1 del review de esta misma ficha,
// `progress/review_QC-66-crud-de-usuarios.md > 3.1`). LEER ANTES DE TOCAR NADA.
//
// Como estaba escrito, CUATRO casos -los dos de R43, el de R46 y el de R47- afirmaban sobre el
// diff `merge-base(origin/dev, HEAD)` y ANCLABAN LA NO-VACUIDAD con
// `expect(diff.length).toBeGreaterThan(0)`. El dia que este PR entre en `dev` la base de fusion
// pasa a ser HEAD, el diff queda VACIO y los cuatro se ponen ROJOS de forma determinista sobre
// `dev` limpio -medido por el reviewer, no deducido-, llevandose consigo el gate de todas las
// features siguientes (regla 5 de `CLAUDE.md`: `./init.sh` completo antes de cada PR).
//
// La justificacion vieja -«es el mismo riesgo que los cinco retensados de
// `tests/unit/recetas-ui/recipe-route-contract.test.ts`»- era FALSA, y conviene que quede escrito
// por que: esos cinco afirman que el diff **NO contiene** cosas prohibidas, asi que con un diff
// vacio **pasan**; los cuatro de aqui afirmaban que el diff **SI contiene** algo. Es el patron
// contrario. Tercer episodio de la misma clase en este repo, tras
// `tests/unit/unidades/modulo-intacto.test.ts` y `tests/unit/identity/account-status-scope.test.ts`.
//
// EL ARREGLO, y no relaja ni un `expect`: se reparte cada afirmacion en la familia que le toca.
//
//   A. LO QUE PUEDE AFIRMARSE SOBRE EL CONTENIDO SE AFIRMA SOBRE EL CONTENIDO, y sigue mordiendo
//      PARA SIEMPRE -tambien dentro de `dev` dentro de un mes-. No dependen de ningun rango git,
//      no se saltan nunca y una guardia muda da confianza falsa. Son, en este archivo: R43
//      (contenido), R38, R45 (contenido), R47 (contenido), R16 y R24. Y dos de ellas quedan MAS
//      FUERTES que lo que sustituyen:
//        - R43 pasa de «ninguna otra migracion esta en el diff» a «esta migracion, NOMBRADA POR SU
//          RUTA LITERAL, existe y es de DATOS: ni un ALTER, ni un CREATE, ni un DROP, ni en el UP
//          ni en el DOWN, y sus dos INSERT son idempotentes».
//        - R47 pasa de «`package.json` no esta en el diff» a «ninguna de las CINCO candidatas que
//          `design.md > 13` descarto esta instalada», que prohibe LO CONCRETO en vez de prohibir
//          que alguien toque un archivo compartido.
//
//   B. SOLO EL RESIDUO QUE ES INHERENTEMENTE «LO QUE ESTA RAMA ANADIO» usa el patron que `dev` ya
//      tiene: deteccion de rama (`esLaRamaDeQC66()`, conjuntiva y pura) mas `ctx.skip(...)`
//      RUIDOSO cuando la rama no es la suya, mas CASOS SINTETICOS que prueben que los detectores
//      muerden. Son cinco: que `db/schema.prisma` no este en el diff, que ninguna OTRA carpeta de
//      `db/migrations/` este, que no haya nada bajo `app/`, `components/` ni `e2e/`, que
//      `package.json` y `pnpm-lock.yaml` no esten, y que las lineas que esta rama ANADE a
//      `lib/composition/index.ts` no nombren el bloqueo.
//
//      «NO PUEDO MIRAR» (el rango git no resuelve) SIGUE SIENDO ROJO -lo lanza `archivosTocados()`
//      y hay un caso que lo comprueba-. «ESTO NO ES LO MIO» y «NO HAY NADA QUE MIRAR» quedan
//      `skipped` y lo dicen en voz alta, NUNCA verdes: un verde afirmaria «he mirado el diff de
//      QC-66 y no cruza ninguna frontera» sin haber mirado nada, que es el anti-patron de la
//      «validacion opcional» de `docs/gate.md`.
//
// POR QUE R46 NO TIENE MITAD DE CONTENIDO, Y ES CORRECTO QUE NO LA TENGA. Que nadie lo «complete»
// manana: «esta ficha no anade pantalla» es un hecho HISTORICO de esta rama, no una propiedad del
// arbol. **QC-67 va a anadir esa pantalla, legitimamente y por su propio spec**, asi que una
// guardia de contenido del tipo «no existe `app/(private)/usuarios/`» bloquearia a QC-67. Ese es
// exactamente el error que `tests/unit/unidades/modulo-intacto.test.ts` cometio y tuvo que
// deshacer. R46 es de la familia B por naturaleza, y ahi se queda.
//
// EL E2E DE ESTA FICHA SE DIFIERE A QC-67, CON MOTIVO Y POR ESCRITO (menor-6 del review). La
// decision cerrada 17, R46 y `design.md > 14` lo declaran POR ADELANTADO y no al final: QC-66 es
// backend puro y no aporta ningun flujo navegable que Playwright pueda visitar, asi que no hay
// E2E que escribir aqui. Hay precedente en el repo (QC-43 -> QC-44). **QC-67 HEREDA ESE E2E
// EXPLICITAMENTE**: es la ficha que trae la pantalla y por tanto la que tiene que cubrir el flujo
// critico de permisos de punta a punta. Queda escrito aqui para que no se pierda entre fichas.
// ---------------------------------------------------------------------------------------------
//
// DOS FAMILIAS DE ASERCION, y conviene no confundirlas:
//
//   1. Las que miran EL DISCO (la familia A de arriba). No dependen de git y muerden siempre. Su
//      riesgo de verde vacuo es una lista de archivos vacia o con un nombre mal escrito. Por eso
//      cada una comprueba primero que los archivos que nombra EXISTEN y tienen contenido, y varias
//      llevan ademas un ancla POSITIVA -el archivo que SI debe contener el patron-, para que una
//      expresion regular roma no las deje verdes sin mirar.
//
//   2. Las que miran EL CAMBIO (la familia B). Comparan contra la BASE DE FUSION con `origin/dev`
//      mas el arbol de trabajo, para que muerdan antes de commitear. Una asercion de esta familia
//      es VACUAMENTE VERDE si el diff esta vacio, asi que NO se deja en verde: o se salta en voz
//      alta (no es su rama / no hay nada que mirar) o se pone roja (el rango no resuelve).
//
// UN AVISO SOBRE LOS COMENTARIOS. Varios archivos de esta feature NOMBRAN en sus comentarios lo
// que prometen no tocar: `user-input.ts` y `user-view.ts` explican que `failedLoginAttempts`,
// `lockLevel` y `lockedUntil` no entran por ningun esquema ni salen por ninguna consulta, y que
// solo los escribe `applyGuardedChange` al salir de `blocked` (QC-95, que enmienda R45 de QC-66);
// y `user-actions.ts` dice que no tiene ningun `console.*`. Esa documentacion es informacion util y no puede poner un test rojo. Asi que antes
// de buscar se quitan los comentarios (`quitarComentariosTs`, `quitarComentariosSql`), mismo
// criterio que el retensado de QC-47 en `tests/unit/proveedores/scope.test.ts`. Lo que se mide es
// CODIGO y SQL de verdad.

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ROLE_ADMINISTRADOR } from '@/lib/modules/identity/domain/roles';

const RAIZ = join(__dirname, '..', '..', '..', '..');

const RANGO = 'git merge-base origin/dev HEAD';

function git(comando: string): string {
  return execSync(comando, { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function aPosix(ruta: string): string {
  return ruta.split('\\').join('/');
}

/**
 * La base de fusion con `origin/dev`, o `null` si el rango no esta disponible aqui (sin remoto,
 * clon superficial). Mismo helper que `baseDeFusionConDev()` en
 * `tests/unit/identity/account-status-scope.test.ts`.
 */
function baseDeFusionConDev(): string | null {
  try {
    const base = git('git merge-base origin/dev HEAD').trim();
    return base.length === 0 ? null : base;
  } catch {
    return null;
  }
}

/**
 * Los archivos que ESTA RAMA toca respecto de la base de fusion con `origin/dev`, mas los del
 * arbol de trabajo (para que la guardia muerda antes de commitear).
 *
 * LANZA -a proposito- si el rango no se puede calcular: «no puedo mirar» es ROJO. Antes devolvia
 * `[]` y quien llamaba anclaba la no-vacuidad, que es justo el antipatron que MAYOR-1 describe: ese
 * ancla tambien se disparaba en el caso legitimo de «la rama ya esta en el tronco y no hay diff».
 * La razon de no usar `dev...HEAD` es la misma que anota `account-status-scope.test.ts`: el `dev`
 * LOCAL va por detras del remoto y el rango arrastraria trabajo ajeno ya mergeado.
 */
function archivosTocados(): readonly string[] {
  const base = baseDeFusionConDev();
  if (base === null) {
    throw new Error(
      `No se pudo calcular el diff contra \`${RANGO}\`, asi que el alcance de rama de QC-66 NO se ` +
        'ha comprobado. Esta guardia falla en vez de pasar en silencio.',
    );
  }

  const tocados = new Set<string>();
  for (const linea of git(`git diff --name-only ${base}`).split('\n')) {
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

/** Las lineas que esta rama AÑADE a un archivo preexistente y compartido. */
function lineasAnadidasEn(ruta: string): readonly string[] {
  const base = baseDeFusionConDev();
  if (base === null) {
    throw new Error(
      `No se pudo calcular el diff contra \`${RANGO}\`, asi que las lineas que esta rama anade a ` +
        `${ruta} NO se han comprobado. Esta guardia falla en vez de pasar en silencio.`,
    );
  }
  return git(`git diff -U0 ${base} -- ${ruta}`)
    .split('\n')
    .filter((linea) => linea.startsWith('+') && !linea.startsWith('+++'))
    .map((linea) => linea.slice(1));
}

function leer(ruta: string): string {
  return readFileSync(join(RAIZ, ruta), 'utf8');
}

/** Sin comentarios de linea ni de bloque: un comentario que explique la frontera no la cruza. */
function quitarComentariosTs(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

/** Lo mismo para SQL: `--` de linea y `/* *\/` de bloque. */
function quitarComentariosSql(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

// ---------------------------------------------------------------------------------------------
// LO QUE ESTA FEATURE CONSTRUYE, NOMBRADO UNO A UNO
//
// Las cuatro listas de abajo son los archivos de PRODUCCION de QC-66, sacados de
// `git diff --name-only $(git merge-base origin/dev HEAD) -- lib/` y cotejados con
// `design.md > 1`. Se escriben a mano y NO se derivan del diff: derivarlas del diff haria que el
// caso se midiera a si mismo y que un archivo olvidado saliera verde por no estar en la lista.
//
// Nota sobre `design.md > 1`: la tabla de disenio enumera DOS adaptadores driven de persistencia
// menos de los que hay en disco, porque el contrato de lista de QC-57 obligo a anadir
// `list-query-sql.ts` (el traductor del orden y el filtro) y su puerto `list-query-log.ts` al
// implementar T7/T13. Son cuatro archivos bajo `adapters/`, no tres: lo que manda es el disco, y
// el caso de R45 los comprueba uno por uno.
// ---------------------------------------------------------------------------------------------

/** Los CATORCE archivos nuevos de `domain/` (R42: los seis casos de uso viven aqui). */
const DOMAIN_NUEVO = [
  'lib/modules/identity/domain/actor.ts',
  // menor-10 del review: este archivo nacio al mover `toBirthDate` fuera de `create-user.ts`
  // (menor-7) y se quedo FUERA de esta lista, con el ancla congelada en 20 mientras el disco
  // tenia 21. El defecto no era el numero: era que NADIE lo vigilaba y el ancla pasaba en verde
  // ignorandolo -el mismo patron que costo MAYOR-1-. Entra aqui para que las comprobaciones de
  // R45, R16 y R24 lo recorran como a los demas.
  'lib/modules/identity/domain/birth-date.ts',
  'lib/modules/identity/domain/create-user.ts',
  'lib/modules/identity/domain/delete-user.ts',
  'lib/modules/identity/domain/errors.ts',
  'lib/modules/identity/domain/get-user.ts',
  'lib/modules/identity/domain/list-query.ts',
  'lib/modules/identity/domain/list-users.ts',
  'lib/modules/identity/domain/page.ts',
  'lib/modules/identity/domain/set-user-account-status.ts',
  'lib/modules/identity/domain/update-user.ts',
  'lib/modules/identity/domain/user-input.ts',
  'lib/modules/identity/domain/user-queryable.ts',
  'lib/modules/identity/domain/user-view.ts',
] as const;

/** Los TRES puertos nuevos. */
const PORTS_NUEVOS = [
  'lib/modules/identity/ports/initial-credential-factory.ts',
  'lib/modules/identity/ports/list-query-log.ts',
  'lib/modules/identity/ports/user-admin-repository.ts',
] as const;

/** Los CUATRO adaptadores nuevos: tres driven y el driving de las seis Server Actions. */
const ADAPTERS_NUEVOS = [
  'lib/modules/identity/adapters/driven/persistence/list-query-sql.ts',
  'lib/modules/identity/adapters/driven/persistence/user-admin-prisma.ts',
  'lib/modules/identity/adapters/driven/security/initial-credential-factory-crypto.ts',
  'lib/modules/identity/adapters/driving/user-actions.ts',
] as const;

/** Los VEINTIUN archivos de produccion que esta feature CREA. */
const ARCHIVOS_NUEVOS_DE_LA_FEATURE = [
  ...DOMAIN_NUEVO,
  ...PORTS_NUEVOS,
  ...ADAPTERS_NUEVOS,
] as const;

/**
 * El archivo PREEXISTENTE y COMPARTIDO del punto de composicion. No se mide entero -lo comparten
 * los once modulos y varias fichas en vuelo, QC-78 incluida- sino SOLO las lineas que esta rama
 * le anade: medirlo entero acusaria en falso a cualquier vecino.
 */
const COMPOSICION = 'lib/composition/index.ts';

/** Los SEIS casos de uso, para el caso de R16. */
const SEIS_CASOS_DE_USO = [
  'lib/modules/identity/domain/create-user.ts',
  'lib/modules/identity/domain/get-user.ts',
  'lib/modules/identity/domain/list-users.ts',
  'lib/modules/identity/domain/update-user.ts',
  'lib/modules/identity/domain/delete-user.ts',
  'lib/modules/identity/domain/set-user-account-status.ts',
] as const;

const ADAPTADOR_DE_CREDENCIAL =
  'lib/modules/identity/adapters/driven/security/initial-credential-factory-crypto.ts';
const SERVER_ACTIONS = 'lib/modules/identity/adapters/driving/user-actions.ts';

/**
 * LA UNICA migracion de esta feature (T4), nombrada POR SU RUTA LITERAL, con sus dos archivos. La
 * ruta se escribe a mano y se afirma que EXISTE: si alguien la renombra, el caso de R43 cae en vez
 * de quedarse mudo midiendo un archivo que ya no esta.
 */
const CARPETA_DE_LA_MIGRACION = 'db/migrations/20260910120000_user_permissions_catalog';
const ARCHIVOS_DE_LA_MIGRACION = [
  `${CARPETA_DE_LA_MIGRACION}/down.sql`,
  `${CARPETA_DE_LA_MIGRACION}/migration.sql`,
] as const;

/** La migracion de QC-47 que SI declara los tres indices unicos: el ancla positiva de R38. */
const MIGRACION_DE_QC47 =
  'db/migrations/20260904180600_companies_and_user_company/migration.sql';

/** Los tres indices unicos por empresa de QC-47 (R38): esta ficha no los nombra. */
const TRES_INDICES_UNICOS = [
  'users_email_unique',
  'users_username_unique',
  'users_document_unique',
] as const;

/** Las tres sentencias de DDL que R43 prohibe en la migracion del catalogo: es de DATOS. */
const SENTENCIAS_DE_ESQUEMA = ['ALTER', 'CREATE', 'DROP'] as const;

/**
 * Las CINCO dependencias candidatas que `design.md > 13` descarto, una a una y con su motivo:
 * `generate-password`, `nanoid` y `secure-random-password` para fabricar la credencial -lo hace
 * `randomInt` de `node:crypto` detras de un puerto, y la garantia que importa es la verificacion
 * contra la politica propia de QC-19, que ninguna libreria conoce-, y `libphonenumber-js` y
 * `validator` para validar formatos -aqui NO se valida ningun formato (`design.md > 6.1`)-.
 *
 * Esto es la mitad de CONTENIDO de R47 y es MAS FUERTE que «`package.json` no esta en el diff»:
 * prohibe LO CONCRETO que la ficha descarto, para siempre y en cualquier rama, en vez de prohibir
 * que alguien toque un archivo compartido.
 */
const CANDIDATAS_DESCARTADAS = [
  'generate-password',
  'nanoid',
  'secure-random-password',
  'libphonenumber-js',
  'validator',
] as const;

/** Una dependencia que SI esta instalada y aprobada: el ancla positiva de R47 (`bcryptjs`, R15). */
const DEPENDENCIA_QUE_SI_ESTA = 'bcryptjs';

/**
 * Las SEIS grafias del mecanismo de bloqueo de QC-19/QC-78 (R45): las tres columnas y sus tres
 * nombres de campo en el cliente Prisma. Se buscan las seis porque cualquiera de ellas seria el
 * mecanismo colandose: `prisma.user.update({ data: { lockLevel: 0 } })` no escribe nunca la
 * cadena `lock_level`.
 */
const GRAFIAS_DEL_BLOQUEO = [
  'failed_login_attempts',
  'lock_level',
  'locked_until',
  'failedLoginAttempts',
  'lockLevel',
  'lockedUntil',
] as const;

/**
 * El dueno del mecanismo, que SI nombra las tres columnas: el ancla positiva de R45. Si un dia
 * dejara de nombrarlas, las seis grafias de arriba estarian midiendo aire y este caso lo dice.
 */
const DUENO_DEL_BLOQUEO =
  'lib/modules/identity/adapters/driven/persistence/user-credentials-prisma.ts';

// ---------------------------------------------------------------------------------------------
// RETENSADO 2026-09-15 (QC-95, desbloqueo-manual-limpia-el-conteo). LEER ANTES DE TOCAR R45.
//
// Informe: `progress/review_QC-95-desbloqueo-manual-limpia-el-conteo-2026-09-15.md > B1`. El caso
// de contenido de R45 exigia CERO grafias del bloqueo en los veintiun archivos de QC-66. QC-95, con
// spec aprobado, ENMIENDA R45: al salir de `blocked`, la MISMA escritura que mueve el estado limpia
// los tres contadores (QC-95 R1, R3, R6). Esa escritura vive en `applyGuardedChange` de
// `user-admin-prisma.ts` y nombra por fuerza `failedLoginAttempts`, `lockLevel` y `lockedUntil`.
// El caso quedo ROJO en `dev` con esos tres hallazgos: la guardia lee disco, no importa nada, y
// `vitest related` no la selecciono antes del merge.
//
// Se RETENSA NOMBRANDO LA EXCEPCION -como se enmiendan las fichas entre si en
// `tests/unit/identity/account-status-scope.test.ts`-, NO relajando el barrido:
//
//   1. UNA excepcion, para UN archivo (`user-admin-prisma.ts`) y UN fragmento: el spread
//      condicional
//        ...(input.lockState === null ? {} : { failedLoginAttempts: input.lockState.failedAttempts,
//          lockLevel: input.lockState.lockLevel, lockedUntil: input.lockState.lockedUntil })
//      El patron tolera espacios y saltos de linea (un reformateo de Prettier no lo rompe), pero
//      EXIGE la condicion de no nulo y los tres valores leidos de `input.lockState`. Un literal
//      `0, 0, null` o un spread sin condicion NO encajan y caen en el barrido.
//   2. Tiene que aparecer EXACTAMENTE UNA VEZ en el archivo, y DENTRO de `applyGuardedChange`
//      (desde su `export async function` hasta su `}` de cierre en la columna 0, el siguiente
//      `export` de nivel superior o el final del archivo, lo que llegue antes). Es ROJO si aparece
//      cero veces (alguien quito la enmienda: hay que revisar la guardia, no dejar una excepcion
//      huerfana), si aparece dos o si aparece fuera de esa funcion.
//   3. Se quita ESE fragmento y el resto del archivo pasa el barrido ORIGINAL de las seis grafias.
//      Sigue siendo hallazgo una columna en un `select`, en `create`, en `updateAliveInCompany` o en
//      la rama `delete`, una lectura, o un literal.
//   4. Los otros veinte archivos no cambian: cero grafias.
//
// La logica vive en funciones PURAS y EXPORTADAS (`hallazgosDeLaExcepcionQC95` y sus piezas), y el
// ultimo `describe` las ejercita con fuentes SINTETICAS. Una excepcion probada solo contra el arbol
// real no demuestra que muerda.
//
// El caso de RAMA de R45 sobre `lib/composition/index.ts` NO cambia: QC-95 no toca composicion.
// ---------------------------------------------------------------------------------------------

/** El UNICO archivo de la feature al que QC-95 (enmienda R45 de QC-66) deja nombrar los contadores. */
const ARCHIVO_DE_LA_EXCEPCION_QC95 =
  'lib/modules/identity/adapters/driven/persistence/user-admin-prisma.ts';

/** La firma de la UNICA funcion donde puede vivir el fragmento autorizado. */
const FIRMA_DE_APPLY_GUARDED_CHANGE = /^export\s+async\s+function\s+applyGuardedChange\b/m;

/** Una secuencia de tokens literales con espacios LIBRES entre ellos (saltos de linea incluidos). */
function tokensConEspaciosLibres(tokens: readonly string[]): string {
  return tokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
}

/**
 * El fragmento que QC-95 autoriza, como FUENTE de expresion regular (se instancia en cada uso para
 * no arrastrar el `lastIndex` de una `g` compartida). Exige, token a token, la condicion
 * `input.lockState === null`, la rama vacia y los tres valores leidos de `input.lockState`. Solo
 * tolera espacios y la coma final que Prettier pone en la version multilinea.
 */
const FUENTE_DEL_FRAGMENTO_AUTORIZADO_QC95 =
  tokensConEspaciosLibres([
    '...', '(', 'input', '.', 'lockState', '===', 'null', '?', '{', '}', ':', '{',
    'failedLoginAttempts', ':', 'input', '.', 'lockState', '.', 'failedAttempts', ',',
    'lockLevel', ':', 'input', '.', 'lockState', '.', 'lockLevel', ',',
    'lockedUntil', ':', 'input', '.', 'lockState', '.', 'lockedUntil',
  ]) + '(?:\\s*,)?\\s*\\}\\s*\\)';

interface Tramo {
  readonly inicio: number;
  readonly fin: number;
}

/**
 * Los limites `[inicio, fin)` de `applyGuardedChange` en `codigo`, o `null` si la funcion no esta.
 * El fin es lo PRIMERO que llegue de: su `}` de cierre en la columna 0, el siguiente `export` de
 * nivel superior o el final del archivo. Asi, una funcion NO exportada escrita debajo tampoco cuenta
 * como «dentro».
 */
export function limitesDeApplyGuardedChange(codigo: string): Tramo | null {
  const firma = FIRMA_DE_APPLY_GUARDED_CHANGE.exec(codigo);
  if (firma === null) return null;
  const tras = firma.index + firma[0].length;
  const resto = codigo.slice(tras);
  const cierre = /^\}/m.exec(resto);
  const siguienteExport = /^export\b/m.exec(resto);
  const candidatos = [codigo.length];
  if (cierre !== null) candidatos.push(tras + cierre.index + 1);
  if (siguienteExport !== null) candidatos.push(tras + siguienteExport.index);
  return { inicio: firma.index, fin: Math.min(...candidatos) };
}

/** Cada aparicion del fragmento autorizado por QC-95 en `codigo`, en orden. */
export function aparicionesDelFragmentoAutorizado(codigo: string): readonly Tramo[] {
  const patron = new RegExp(FUENTE_DEL_FRAGMENTO_AUTORIZADO_QC95, 'g');
  const apariciones: Tramo[] = [];
  for (let m = patron.exec(codigo); m !== null; m = patron.exec(codigo)) {
    apariciones.push({ inicio: m.index, fin: m.index + m[0].length });
  }
  return apariciones;
}

/** El barrido ORIGINAL de R45: que grafias del bloqueo aparecen en `codigo`. */
export function grafiasDelBloqueoEn(codigo: string): readonly string[] {
  return GRAFIAS_DEL_BLOQUEO.filter((grafia) => codigo.includes(grafia));
}

/**
 * QC-95 enmienda R45 de QC-66: los hallazgos de R45 en `user-admin-prisma.ts`, medidos sobre su
 * fuente SIN comentarios. Lista vacia = el archivo solo nombra los contadores en el unico spread
 * condicional autorizado, dentro de `applyGuardedChange`.
 */
export function hallazgosDeLaExcepcionQC95(codigo: string): readonly string[] {
  const hallazgos: string[] = [];
  const cuerpo = limitesDeApplyGuardedChange(codigo);
  if (cuerpo === null) {
    hallazgos.push(
      'no se encuentra `export async function applyGuardedChange`: la excepcion de QC-95 no tiene ' +
        'donde anclarse',
    );
  }

  const apariciones = aparicionesDelFragmentoAutorizado(codigo);
  const dentro = apariciones.filter(
    (tramo) => cuerpo !== null && tramo.inicio >= cuerpo.inicio && tramo.fin <= cuerpo.fin,
  );
  const fuera = apariciones.length - dentro.length;

  if (apariciones.length === 0) {
    hallazgos.push(
      'el spread condicional que autoriza QC-95 no aparece (0 apariciones): si se quito la ' +
        'enmienda, hay que retirar tambien esta excepcion en vez de dejarla huerfana',
    );
  }
  if (apariciones.length > 1) {
    hallazgos.push(
      `el spread condicional que autoriza QC-95 aparece ${apariciones.length} veces: se autoriza UNA`,
    );
  }
  if (fuera > 0) {
    hallazgos.push(
      `el spread condicional que autoriza QC-95 aparece ${fuera} vez/veces FUERA de applyGuardedChange`,
    );
  }

  // Se quita UNA sola aparicion, y solo si esta DENTRO de `applyGuardedChange`. Todo lo demas
  // -una copia, un spread fuera, un literal- pasa el barrido original.
  const autorizada = dentro[0];
  const resto =
    autorizada === undefined
      ? codigo
      : `${codigo.slice(0, autorizada.inicio)} ${codigo.slice(autorizada.fin)}`;
  for (const grafia of grafiasDelBloqueoEn(resto)) {
    hallazgos.push(`\`${grafia}\` fuera del unico spread condicional autorizado`);
  }
  return hallazgos;
}

/** Un `console.<algo>` de verdad, no la palabra en un comentario (los comentarios ya se quitan). */
const LLAMADA_A_CONSOLA = /\bconsole\s*\./;

/**
 * El archivo de `identity` que SI llama a la consola hoy (`console.warn` en el middleware de
 * ruta): el ancla positiva de R16. Sin el, un patron roto dejaria el caso verde sin mirar.
 */
const QUIEN_SI_USA_LA_CONSOLA = 'lib/modules/identity/adapters/driving/route-guard-middleware.ts';

/**
 * El literal del nombre del rol administrador ENTRE COMILLAS, construido desde la constante
 * importada y nunca copiado a mano (R24: «DEBE tomar el nombre del rol administrador de la
 * constante ya existente `ROLE_ADMINISTRADOR`»). Entre comillas a proposito: un comentario que
 * diga «el Administrador pasa por la misma ruta de permiso» no escribe ningun literal.
 */
const LITERAL_DEL_ROL = new RegExp(`['"\`]${ROLE_ADMINISTRADOR}['"\`]`);

/** Quien SI declara la constante, y por tanto el unico que escribe el literal: ancla positiva. */
const DUENO_DEL_NOMBRE_DEL_ROL = 'lib/modules/identity/domain/roles.ts';

// ---------------------------------------------------------------------------------------------
// FAMILIA B: LOS DETECTORES DE ALCANCE DE RAMA
//
// Los cuatro son funciones PURAS y EXPORTADAS, para poder ejercitarlas con listas SINTETICAS y
// demostrar que muerden sin depender de en que rama corra el gate. Un detector que solo se
// ejercita contra el arbol real no demuestra nunca que pueda fallar, y con el salto de rama por
// delante eso vaciaria la guardia, que seria peor que el problema que el salto arregla.
// ---------------------------------------------------------------------------------------------

/** R43: `db/schema.prisma` es el unico sitio donde se declaran columnas, indices y tipos. */
export function cambiosDeEsquema(tocados: readonly string[]): readonly string[] {
  return tocados.filter((ruta) => ruta === 'db/schema.prisma');
}

/** R43: cualquier carpeta de `db/migrations/` que no sea la del catalogo de permisos (T4). */
export function migracionesAjenas(tocados: readonly string[]): readonly string[] {
  return tocados
    .filter(
      (ruta) =>
        ruta.startsWith('db/migrations/') &&
        !(ARCHIVOS_DE_LA_MIGRACION as readonly string[]).includes(ruta),
    )
    .sort();
}

/**
 * R46: nada bajo `app/`, `components/` ni `e2e/`, y tampoco un adaptador de navegacion o de menu
 * colado dentro de `lib/`, que es el otro camino por el que la pantalla se escaparia.
 */
export function infraccionesDeInterfaz(tocados: readonly string[]): readonly string[] {
  return tocados.filter(
    (ruta) =>
      ruta.startsWith('app/') ||
      ruta.startsWith('components/') ||
      ruta.startsWith('e2e/') ||
      (ruta.startsWith('lib/') && /nav|menu|sidebar|breadcrumb/i.test(ruta)),
  );
}

/** R47: los dos archivos por los que entra una dependencia. */
export function cambiosDeDependencias(tocados: readonly string[]): readonly string[] {
  return tocados.filter((ruta) => ruta === 'package.json' || ruta === 'pnpm-lock.yaml');
}

/**
 * LA PRECONDICION DE RAMA. Los cinco casos de la familia B SOLO aplican en la rama de QC-66: R43,
 * R46 y R47 hablan del alcance de ESTA ficha, no del de las demas. Fuera de su rama quedan MUDOS.
 *
 * La senal es CONJUNTIVA y son DOS, como en `esLaRamaDeQC65()` y `esLaRamaDeQC39()`: el archivo
 * CENTRAL de la ficha -`create-user.ts`, ninguna rama implementa QC-66 sin el- mas su carpeta de
 * spec. Con una sola no basta: otra ficha podria rozar `create-user.ts` (QC-67 lo va a consumir),
 * y la carpeta de spec discrimina de verdad porque nace y vive dentro del rango de QC-66 y no
 * aparece jamas en el rango de otra ficha, que trae la SUYA.
 *
 * No se usa este archivo de test como senal, justamente porque otras fichas lo enmiendan al
 * chocar con el -como acaba de hacer este retensado-.
 */
const ARCHIVO_CENTRAL_DE_QC66 = 'lib/modules/identity/domain/create-user.ts';
const CARPETA_SPEC_DE_QC66 = 'specs/QC-66-crud-de-usuarios/';

export function esLaRamaDeQC66(tocados: readonly string[]): boolean {
  return (
    tocados.includes(ARCHIVO_CENTRAL_DE_QC66) &&
    tocados.some((ruta) => ruta.startsWith(CARPETA_SPEC_DE_QC66))
  );
}

/** El minimo que necesita un `ctx` de vitest para saltar: asi se puede pasar uno sintetico. */
interface ConSalto {
  readonly skip: (nota: string) => never;
}

/**
 * El salto SINTETICO del ultimo `describe`: una senal propia, para no confundirla con un fallo de
 * asercion. El `ctx.skip` de vitest tambien lanza, asi que imitarlo es exactamente lo que hace
 * falta para poder afirmar «aqui se salta» en vez de «aqui se falla».
 */
class SaltoSimulado extends Error {
  constructor() {
    super('salto simulado');
    this.name = 'SaltoSimulado';
  }
}

/**
 * El diff de la rama, o un SALTO RUIDOSO. Tres desenlaces, y los tres dicen la verdad:
 *
 *   - el rango no resuelve -> ROJO, lo lanza `archivosTocados()`: «no puedo mirar»;
 *   - la rama no es la de QC-66 (incluido el diff VACIO, que no trae ninguna de las dos senales)
 *     -> `skipped` diciendo por que: «esto no es lo mio» / «no hay nada que mirar»;
 *   - la rama es la de QC-66 -> el diff, y los casos vigilan exactamente igual que antes.
 *
 * El segundo desenlace es el que cierra MAYOR-1: en `dev`, con este PR ya dentro y el arbol
 * limpio, el diff es `[]`, `esLaRamaDeQC66([])` es `false` y los cinco casos quedan SALTADOS en
 * vez de rojos. Nunca verdes.
 *
 * `tocados` se inyecta a proposito para poder ejercitar este desenlace con una lista sintetica
 * -ver el ultimo `describe`-: es la unica forma honesta de probar el caso «diff vacio» sin
 * mergear nada.
 */
function diffOMudo(ctx: ConSalto, tocados: readonly string[] = archivosTocados()): readonly string[] {
  if (!esLaRamaDeQC66(tocados)) {
    ctx.skip(
      tocados.length === 0
        ? 'el diff contra `' +
            RANGO +
            '` esta VACIO (la rama ya esta en el tronco, o el arbol esta limpio sobre `dev`): no ' +
            'hay cambio que revisar, asi que este caso NO ha comprobado nada. Se declara SALTADO y ' +
            'no verde a proposito.'
        : 'el diff no trae a la vez `' +
            ARCHIVO_CENTRAL_DE_QC66 +
            '` y `' +
            CARPETA_SPEC_DE_QC66 +
            '`: esta NO es la rama de QC-66, asi que este caso NO ha comprobado nada. R43, R46 y ' +
            'R47 son el alcance de ESA ficha y no le aplican a ninguna otra.',
    );
  }
  return tocados;
}

describe('el rango git esta disponible: la familia de rama puede mirar de verdad', () => {
  it(`\`${RANGO}\` resuelve; si no, estos casos fallan ruidosamente`, () => {
    // «No puedo mirar» es ROJO y se comprueba aqui, una sola vez. Lo que NO es rojo es «he mirado
    // y esto no es mi rama»: eso se salta, y esa es toda la diferencia que arregla MAYOR-1.
    expect(() => archivosTocados()).not.toThrow();
  });
});

describe('alcance de QC-66 (crud-de-usuarios) — CONTENIDO: muerde siempre, tambien dentro de dev', () => {
  it('R43 — la migracion del catalogo existe, es de DATOS y no lleva ni un ALTER, CREATE ni DROP', () => {
    // R43: «Esta feature NO DEBE añadir, quitar ni modificar ninguna columna, tabla, indice,
    // restriccion ni tipo de la base». La unica puerta que R43 deja abierta es una migracion de
    // DATOS (T4: «Cero ALTER, CREATE y DROP»), y esta es la mitad de CONTENIDO de esa frontera:
    // se mide el TEXTO de los dos archivos de la migracion, no el diff, asi que sigue mordiendo
    // dentro de `dev` dentro de un mes. La otra mitad -que no haya ninguna OTRA migracion- es
    // inherentemente de rama y vive mas abajo.

    // ANCLA POSITIVA, y es la que sostiene el caso: la carpeta, nombrada por su ruta LITERAL,
    // EXISTE con sus dos archivos. Si alguien la renombra, esto cae en vez de quedarse mudo.
    expect(
      existsSync(join(RAIZ, CARPETA_DE_LA_MIGRACION)),
      `${CARPETA_DE_LA_MIGRACION} no existe: la migracion de T4 se renombro o se borro, y este ` +
        'caso estaria midiendo un archivo que no esta',
    ).toBe(true);
    for (const archivo of ARCHIVOS_DE_LA_MIGRACION) {
      expect(existsSync(join(RAIZ, archivo)), `${archivo} no existe`).toBe(true);
      expect(leer(archivo).trim().length, `${archivo} esta vacio: no prueba nada`).toBeGreaterThan(0);
    }

    const up = leer(`${CARPETA_DE_LA_MIGRACION}/migration.sql`);
    expect(
      up,
      'el UP de la migracion del catalogo no inserta en `permissions`: no es la migracion esperada',
    ).toMatch(/INSERT\s+INTO\s+"permissions"/i);
    expect(
      up,
      'el UP de la migracion del catalogo no asigna los permisos en `role_permissions`: no es la ' +
        'migracion esperada',
    ).toMatch(/INSERT\s+INTO\s+"role_permissions"/i);

    // Los DOS `INSERT` son idempotentes (R11): aplicar la migracion sobre una base donde el seed
    // ya sembro los codigos no falla y no reescribe nada. Sin esto, «es de datos» no seria cierto
    // del todo: un UP que explota a medias deja la base en un estado que nadie declaro.
    //
    // Se cuenta sobre el SQL SIN COMENTARIOS a proposito: la cabecera del archivo explica la
    // idempotencia con esas mismas palabras, y contarla ahi daria tres en vez de dos.
    const upSinComentarios = quitarComentariosSql(up);
    const conflictos = upSinComentarios.match(/ON\s+CONFLICT\b[^;]*?DO\s+NOTHING/gi) ?? [];
    expect(
      conflictos.length,
      'el UP de la migracion del catalogo no tiene sus DOS `ON CONFLICT ... DO NOTHING` (R11: es ' +
        `idempotente). Encontrados: ${conflictos.length}`,
    ).toBe(2);

    // Y el DDL, en los DOS archivos: ni el UP ni el DOWN tocan un objeto del esquema. El DOWN
    // tambien, porque un `down.sql` con un `DROP` seria exactamente el cambio de esquema que R43
    // prohibe, solo que diferido al rollback.
    for (const archivo of ARCHIVOS_DE_LA_MIGRACION) {
      const sinComentarios = quitarComentariosSql(leer(archivo));
      for (const sentencia of SENTENCIAS_DE_ESQUEMA) {
        expect(
          sinComentarios,
          `${archivo} contiene un ${sentencia}: R43 dice que esta migracion solo mueve FILAS`,
        ).not.toMatch(new RegExp(`\\b${sentencia}\\b`, 'i'));
      }
    }
  });

  it('R38 — ninguna migracion de esta feature nombra los tres indices unicos de QC-47 ni toca ningun indice', () => {
    // R38: «esta feature NO DEBE modificar, recrear ni renombrar los tres indices unicos de
    // QC-47 (`users_email_unique`, `users_username_unique`, `users_document_unique`), ni añadir
    // ninguna migracion de indices». Son los indices PARCIALES `WHERE deleted_at IS NULL` que
    // hacen que el borrado logico LIBERE correo, usuario y documento dentro de la empresa:
    // recrearlos sin el `WHERE` romperia R38 por su otra mitad, la del comportamiento.

    // ANCLA POSITIVA, y es la que sostiene todo el caso: la migracion de QC-47 SI nombra los
    // tres. Si el dia que alguien renombre un indice estos literales dejaran de existir en el
    // repositorio, el `not.toMatch` de abajo seria aire y este ancla lo delata.
    const qc47 = leer(MIGRACION_DE_QC47);
    for (const indice of TRES_INDICES_UNICOS) {
      expect(
        qc47,
        `${MIGRACION_DE_QC47} ya no declara \`${indice}\`: los literales que vigila R38 cambiaron ` +
          'de nombre y este caso estaria midiendo aire',
      ).toContain(indice);
    }

    for (const archivo of ARCHIVOS_DE_LA_MIGRACION) {
      expect(existsSync(join(RAIZ, archivo)), `${archivo} no existe`).toBe(true);
      const sql = quitarComentariosSql(leer(archivo));
      expect(sql.trim().length, `${archivo} esta vacio: no prueba nada`).toBeGreaterThan(0);

      for (const indice of TRES_INDICES_UNICOS) {
        expect(sql, `${archivo} nombra \`${indice}\`, y R38 dice que esta ficha no lo toca`).not.toContain(
          indice,
        );
      }
      for (const sentencia of ['CREATE INDEX', 'DROP INDEX', 'CREATE UNIQUE INDEX'] as const) {
        expect(
          sql,
          `${archivo} contiene un ${sentencia}: R38 prohibe cualquier migracion de indices aqui`,
        ).not.toMatch(new RegExp(sentencia.replace(/ /g, '\\s+'), 'i'));
      }
    }
  });

  it('R45 (QC-95 enmienda R45 de QC-66) — ningun archivo de produccion de la feature lee ni escribe los tres contadores de bloqueo de QC-19, salvo el unico spread condicional de applyGuardedChange', () => {
    // R45 de QC-66, TAL COMO LO ENMIENDA QC-95. El R45 original decia: «ninguna de las seis
    // operaciones lee ni escribe `failed_login_attempts`, `lock_level` ni `locked_until`, y limpiar
    // el contador al salir de `blocked` ES DE QC-78». QC-95 enmienda R45 de QC-66: esa limpieza la
    // hace ahora `applyGuardedChange`, en la misma escritura que mueve el estado, y SOLO cuando el
    // destino no es `blocked`. Todo lo demas de R45 sigue en pie: ninguna operacion LEE los
    // contadores y ninguna otra los escribe.
    //
    // LA EXCEPCION, y es la unica (ver el bloque «RETENSADO 2026-09-15 (QC-95)» encima de
    // `ARCHIVO_DE_LA_EXCEPCION_QC95`): en `user-admin-prisma.ts` se tolera UN spread condicional,
    // dentro de `applyGuardedChange`, con la condicion de no nulo y los tres valores leidos de
    // `input.lockState`. Tiene que aparecer exactamente una vez. Se quita y el resto del archivo
    // pasa el barrido original. Los otros veinte archivos se miden como siempre: cero grafias.
    //
    // Esta es la mitad de CONTENIDO: los VEINTIUN archivos que la ficha CREA son suyos y se miden
    // enteros, sin git, para siempre. La otra mitad -las lineas que la rama anade al punto de
    // composicion, que es PREEXISTENTE y compartido- es inherentemente de rama y vive mas abajo.

    // ANCLA POSITIVA: el dueno del mecanismo SI nombra las columnas. Sin esto, una de las seis
    // grafias mal escrita dejaria el caso entero verde sin mirar.
    const dueno = leer(DUENO_DEL_BLOQUEO);
    for (const grafia of ['failed_login_attempts', 'lockLevel'] as const) {
      expect(
        dueno,
        `${DUENO_DEL_BLOQUEO} ya no nombra \`${grafia}\`: las grafias que vigila R45 cambiaron y ` +
          'este caso estaria midiendo aire',
      ).toContain(grafia);
    }

    // ANCLA DE LA LISTA: los veinte archivos nombrados EXISTEN y tienen contenido. Un nombre mal
    // escrito, o un archivo vacio, dejaria el bucle pasando por la razon equivocada.
    expect(ARCHIVOS_NUEVOS_DE_LA_FEATURE.length, 'la lista de archivos de la feature esta vacia').toBe(
      21,
    );
    for (const archivo of ARCHIVOS_NUEVOS_DE_LA_FEATURE) {
      expect(existsSync(join(RAIZ, archivo)), `${archivo} no existe en el disco`).toBe(true);
      expect(leer(archivo).length, `${archivo} esta vacio: no prueba nada`).toBeGreaterThan(0);
    }

    // ANCLA DE LA EXCEPCION: el archivo exceptuado ES uno de los veintiuno. Si saliera de la lista,
    // la excepcion no se aplicaria a nada y nadie lo notaria.
    expect(
      (ARCHIVOS_NUEVOS_DE_LA_FEATURE as readonly string[]).includes(ARCHIVO_DE_LA_EXCEPCION_QC95),
      `${ARCHIVO_DE_LA_EXCEPCION_QC95} ya no esta en la lista de la feature: la excepcion de QC-95 ` +
        'no se aplica a nada',
    ).toBe(true);

    const hallazgos: string[] = [];
    for (const archivo of ARCHIVOS_NUEVOS_DE_LA_FEATURE) {
      const codigo = quitarComentariosTs(leer(archivo));
      if (archivo === ARCHIVO_DE_LA_EXCEPCION_QC95) {
        // QC-95 enmienda R45 de QC-66: la excepcion nombrada, y el barrido original sobre el resto.
        for (const hallazgo of hallazgosDeLaExcepcionQC95(codigo)) {
          hallazgos.push(`${archivo}: ${hallazgo}`);
        }
        continue;
      }
      for (const grafia of GRAFIAS_DEL_BLOQUEO) {
        if (codigo.includes(grafia)) hallazgos.push(`${archivo}: ${grafia}`);
      }
    }
    expect(
      hallazgos,
      'QC-66 toca el mecanismo de bloqueo de QC-19/QC-78 mas alla de lo que QC-95 enmienda R45 de ' +
        'QC-66 (un unico spread condicional sobre `input.lockState` dentro de applyGuardedChange): ' +
        hallazgos.join('; '),
    ).toEqual([]);
  });

  it('R47 — ninguna de las cinco dependencias que design.md > 13 descarto esta instalada', () => {
    // R47: «NO DEBE incorporar ninguna dependencia de terceros nueva: la generacion al azar sale
    // del `crypto` de Node detrás de un puerto y el hash de la bcrypt ya instalada». `design.md
    // > 13` lo cierra sin abrir ninguna propuesta, asi que los cuatro checks de salud no llegan
    // a evaluarse.
    //
    // Esta es la mitad de CONTENIDO, y es MAS FUERTE que la que sustituye: antes se afirmaba que
    // `package.json` no estaba en el diff, lo que deja de significar nada el dia que el diff esta
    // vacio. Ahora se prohibe LO CONCRETO -las cinco candidatas, por nombre-, y eso muerde para
    // siempre y en cualquier rama. La mitad de rama -«esta rama no toco `package.json`»- sigue
    // existiendo mas abajo.
    const manifiesto = JSON.parse(leer('package.json')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const instaladas = {
      ...(manifiesto.dependencies ?? {}),
      ...(manifiesto.devDependencies ?? {}),
    };

    // ANCLA POSITIVA: el manifiesto se leyo de verdad y trae lo que la ficha SI usa (`bcryptjs`,
    // R15). Sin esto, un `package.json` mal leido dejaria el bucle de abajo verde sin mirar.
    expect(
      Object.keys(instaladas).length,
      'package.json no declaro ninguna dependencia: no se leyo el manifiesto de verdad',
    ).toBeGreaterThan(10);
    expect(
      Object.keys(instaladas),
      `package.json ya no declara \`${DEPENDENCIA_QUE_SI_ESTA}\`: el hash de R15 sale de ahi y ` +
        'este caso estaria midiendo aire',
    ).toContain(DEPENDENCIA_QUE_SI_ESTA);

    const coladas = CANDIDATAS_DESCARTADAS.filter((nombre) => nombre in instaladas);
    expect(
      coladas,
      'R47 y la regla 7 de CLAUDE.md: `design.md > 13` descarto estas candidatas UNA A UNA, y ' +
        'ninguna dependencia entra sin aprobacion humana y su fila en docs/dependencias.md. ' +
        `Estan instaladas: ${coladas.join(', ')}`,
    ).toEqual([]);
  });

  it('R16 — ni el adaptador de credencial, ni los seis casos de uso, ni las Server Actions escriben en consola', () => {
    // R16: «La contraseña generada NO DEBE salir del sistema por NINGUNA via: no se devuelve en
    // el resultado del alta ni en ninguna otra respuesta, no aparece en ningun mensaje de error,
    // no se escribe en ningun registro ni en ninguna traza». Un `console.log` de depuracion en el
    // camino de la credencial es exactamente la traza que R16 prohibe, y el sitio donde mas
    // facil se cuela es el adaptador que la fabrica.

    // ANCLA POSITIVA: hay un archivo de `identity` que SI llama a la consola, asi que el patron
    // encuentra llamadas de verdad. Sin esto, un `LLAMADA_A_CONSOLA` roto dejaria el caso verde.
    expect(
      quitarComentariosTs(leer(QUIEN_SI_USA_LA_CONSOLA)),
      `${QUIEN_SI_USA_LA_CONSOLA} ya no llama a la consola: el patron de R16 estaria midiendo aire`,
    ).toMatch(LLAMADA_A_CONSOLA);

    const vigilados = [ADAPTADOR_DE_CREDENCIAL, ...SEIS_CASOS_DE_USO, SERVER_ACTIONS] as const;
    const hallazgos: string[] = [];
    for (const archivo of vigilados) {
      expect(existsSync(join(RAIZ, archivo)), `${archivo} no existe en el disco`).toBe(true);
      const codigo = quitarComentariosTs(leer(archivo));
      expect(codigo.trim().length, `${archivo} esta vacio: no prueba nada`).toBeGreaterThan(0);
      if (LLAMADA_A_CONSOLA.test(codigo)) hallazgos.push(archivo);
    }
    expect(
      hallazgos,
      'R16: una traza en el camino de la credencial generada es una via por la que sale. ' +
        `Llaman a la consola: ${hallazgos.join(', ')}`,
    ).toEqual([]);
  });

  it('R24 — ningun archivo nuevo de la feature escribe a mano el nombre del rol administrador', () => {
    // R24: «DEBE tomar el nombre del rol administrador de la constante ya existente
    // `ROLE_ADMINISTRADOR` de `lib/modules/identity/domain/roles.ts`, y NO DEBE declarar ninguna
    // constante nueva ni escribir el literal en ningun archivo de esta feature». Es la leccion de
    // QC-54, que gasto una ficha entera en unificar los seis sitios que comparaban contra el
    // literal; la guarda del ultimo administrador (R22) seria el septimo.
    //
    // El patron se CONSTRUYE desde la constante importada, nunca se copia: si el rol se
    // renombrara, esta guardia lo sigue.

    // ANCLA POSITIVA: quien declara la constante SI escribe el literal. Si este `toMatch` cayera,
    // `LITERAL_DEL_ROL` estaria mal formado y el bucle de abajo seria aire.
    expect(
      leer(DUENO_DEL_NOMBRE_DEL_ROL),
      `${DUENO_DEL_NOMBRE_DEL_ROL} deberia declarar el literal del rol: es el unico que puede`,
    ).toMatch(LITERAL_DEL_ROL);

    // `roles.ts` queda EXCLUIDO a proposito -es el dueno de la constante- y, de hecho, no esta en
    // la lista porque no es un archivo nuevo de esta feature. Se afirma para que se lea.
    expect(
      (ARCHIVOS_NUEVOS_DE_LA_FEATURE as readonly string[]).includes(DUENO_DEL_NOMBRE_DEL_ROL),
      'roles.ts no es un archivo de esta feature: es quien declara la constante de R24',
    ).toBe(false);

    const hallazgos: string[] = [];
    for (const archivo of ARCHIVOS_NUEVOS_DE_LA_FEATURE) {
      const codigo = quitarComentariosTs(leer(archivo));
      if (LITERAL_DEL_ROL.test(codigo)) hallazgos.push(archivo);
    }
    expect(
      hallazgos,
      `R24: el nombre del rol administrador sale de ROLE_ADMINISTRADOR, nunca de un literal. ` +
        `Lo escriben a mano: ${hallazgos.join(', ')}`,
    ).toEqual([]);
  });
});

describe('alcance de QC-66 — EL CAMBIO: lo que esta rama anadio, y solo en su rama', () => {
  it('R43 — db/schema.prisma no esta en el diff de la rama', (ctx) => {
    // R43: «Esta feature NO DEBE añadir, quitar ni modificar ninguna columna, tabla, indice,
    // restriccion ni tipo de la base». `db/schema.prisma` es el unico sitio donde se declaran, y
    // el `tasks.md` lo declara con un **NO** rotundo en la tabla de archivos compartidos. Cero
    // diff, no «diff pequeno».
    //
    // Esto NO puede ser de contenido: el esquema existe y lo escriben otras fichas (el modelo
    // `User` lo aportaron la feature 4, QC-47 y QC-65). Lo unico afirmable es que ESTA rama no lo
    // movio, que es un hecho del cambio.
    const diff = diffOMudo(ctx);
    expect(
      cambiosDeEsquema(diff),
      'db/schema.prisma esta en el diff de la rama, y R43 dice que esta feature no lo toca: ' +
        'el modelo `User` lo aportaron la feature 4, QC-47 y QC-65, y esta ficha solo lo consume',
    ).toEqual([]);
  });

  it('R43 — ninguna OTRA carpeta de db/migrations/ esta en el diff de la rama', (ctx) => {
    // La otra mitad de R43, complementaria de la de contenido: una SEGUNDA migracion seria alcance
    // escapandose por la unica puerta que R43 deja abierta. Tampoco puede ser de contenido: el
    // repositorio tiene veintitantas migraciones legitimas de otras fichas.
    const diff = diffOMudo(ctx);
    const ajenas = migracionesAjenas(diff);
    expect(
      ajenas,
      'la unica migracion de QC-66 es la del catalogo de permisos (T4); cualquier otra carpeta ' +
        `de db/migrations/ en el diff es alcance escapandose: ${ajenas.join(', ')}`,
    ).toEqual([]);
  });

  it('R46 — la rama no anade nada bajo app/, components/ ni e2e/, ni ningun adaptador de navegacion', (ctx) => {
    // R46: «NO DEBE incluir ninguna pantalla, pagina, componente de interfaz ni ruta bajo `app/`
    // o `components/` -van a QC-67-, ni ningun adaptador de navegacion o de menu; por lo tanto no
    // aporta ningun flujo navegable que un test E2E pueda visitar».
    //
    // ESTE CASO NO TIENE -NI DEBE TENER- MITAD DE CONTENIDO, y conviene que quede escrito para que
    // nadie lo «complete» manana: «esta ficha no anade pantalla» es un hecho HISTORICO de esta
    // rama, no una propiedad del arbol. **QC-67 va a anadir `app/(private)/usuarios/`
    // legitimamente**, asi que una guardia de contenido del tipo «esa carpeta no existe» la
    // bloquearia. Es el error exacto que `tests/unit/unidades/modulo-intacto.test.ts` cometio y
    // tuvo que deshacer. R46 es de esta familia por naturaleza.
    //
    // El E2E se difiere AQUI y CON MOTIVO (decision cerrada 17, `design.md > 14`), no al final y
    // no por olvido: no hay pantalla que Playwright pueda abrir. QC-67 lo hereda explicitamente
    // -ver la cabecera de este archivo-.
    const diff = diffOMudo(ctx);
    const enLaInterfaz = infraccionesDeInterfaz(diff);
    expect(
      enLaInterfaz,
      'QC-66 es backend puro: la pantalla es QC-67 y el E2E se difiere con motivo (decision 17). ' +
        'R46 prohibe tambien el adaptador de navegacion o de menu dentro de lib/. ' +
        `Esto esta en el diff: ${enLaInterfaz.join(', ')}`,
    ).toEqual([]);
  });

  it('R47 — package.json ni pnpm-lock.yaml estan en el diff de la rama', (ctx) => {
    // La mitad de rama de R47, complementaria de la de contenido: no solo no entro ninguna de las
    // cinco candidatas descartadas, sino que esta rama no abrio los dos archivos por los que
    // entraria CUALQUIER otra. No puede ser de contenido: `package.json` existe y las demas
    // fichas lo cambian con permiso.
    const diff = diffOMudo(ctx);
    const deDependencias = cambiosDeDependencias(diff);
    expect(
      deDependencias,
      'R47 y la regla 7 de CLAUDE.md: ninguna dependencia entra en esta ficha, y ninguna entra ' +
        `sin aprobacion humana y su fila en docs/dependencias.md. Esto cambio: ${deDependencias.join(', ')}`,
    ).toEqual([]);
  });

  it('R45 — las lineas que esta rama anade a lib/composition/index.ts no nombran el bloqueo', (ctx) => {
    // El complemento de rama del caso de contenido de R45. `lib/composition/index.ts` es
    // PREEXISTENTE y lo comparten los once modulos y varias fichas en vuelo (QC-78 entre ellas,
    // que es la dueña del mecanismo de bloqueo y VA a nombrarlo aqui con pleno derecho). Medirlo
    // entero acusaria en falso a ese vecino, asi que se mide SOLO lo que esta rama le AÑADE, y eso
    // es por definicion una afirmacion sobre el cambio: fuera de la rama de QC-66 queda MUDA.
    diffOMudo(ctx);

    const anadidas = lineasAnadidasEn(COMPOSICION);
    expect(
      anadidas.length,
      `la rama de QC-66 no anade ninguna linea a ${COMPOSICION}, y tiene que anadir el cableado ` +
        'de sus seis casos de uso (design.md > 11): este caso no esta midiendo lo que cree',
    ).toBeGreaterThan(0);

    const codigoAnadido = quitarComentariosTs(anadidas.join('\n'));
    const hallazgos = GRAFIAS_DEL_BLOQUEO.filter((grafia) => codigoAnadido.includes(grafia));
    expect(
      hallazgos,
      `${COMPOSICION} gana lineas que nombran el mecanismo de bloqueo de QC-19/QC-78, y R45 se lo ` +
        `prohibe a esta ficha: ${hallazgos.join(', ')}`,
    ).toEqual([]);
  });
});

/**
 * QUE EL SALTO NO VACIE LA GUARDIA (anadido con el retensado de MAYOR-1).
 *
 * Una guardia que se salta siempre no protege nada, y seria peor que el problema que el salto
 * arregla. Estos casos ejercitan las CINCO funciones puras con listas SINTETICAS, sin depender de
 * en que rama corra el gate: la deteccion de rama en los dos sentidos, los cuatro detectores con y
 * sin violacion, y -el que cierra MAYOR-1- el desenlace con el diff VACIO.
 */
describe('el salto no vacia la guardia: en la rama de QC-66 sigue mordiendo', () => {
  /** El alcance LEGITIMO de esta ficha, en miniatura: las dos senales mas lo que si puede tocar. */
  const RAMA_DE_QC66 = [
    ARCHIVO_CENTRAL_DE_QC66,
    'lib/modules/identity/ports/user-admin-repository.ts',
    'lib/modules/identity/adapters/driving/user-actions.ts',
    'lib/composition/index.ts',
    ...ARCHIVOS_DE_LA_MIGRACION,
    'specs/QC-66-crud-de-usuarios/requirements.md',
    'tests/unit/identity/usuarios/scope.test.ts',
  ];

  it('reconoce la rama de QC-66 por sus DOS senales, y NO reconoce otra', () => {
    expect(esLaRamaDeQC66(RAMA_DE_QC66)).toBe(true);

    // La senal es CONJUNTIVA: con una sola no basta. `create-user.ts` lo va a rozar QC-67 cuando
    // construya la pantalla sobre estos casos de uso, y cualquier ficha trae SU carpeta de spec.
    expect(esLaRamaDeQC66([ARCHIVO_CENTRAL_DE_QC66])).toBe(false);
    expect(esLaRamaDeQC66(['specs/QC-66-crud-de-usuarios/design.md'])).toBe(false);

    // El diff de otra ficha: QC-67 (la pantalla) tocando el dominio de esta y trayendo su spec.
    expect(
      esLaRamaDeQC66([
        'app/(private)/usuarios/page.tsx',
        'lib/modules/identity/domain/user-view.ts',
        'specs/QC-67-pantalla-de-usuarios/requirements.md',
      ]),
    ).toBe(false);
    // Y el de QC-78 (el estado de cuenta en el acceso), que comparte modulo pero no las senales.
    expect(
      esLaRamaDeQC66([
        'lib/modules/identity/domain/account-lock.ts',
        'lib/composition/index.ts',
        'specs/QC-78-estado-en-el-acceso/requirements.md',
      ]),
    ).toBe(false);
  });

  it('EL CASO QUE CIERRA MAYOR-1: con el diff VACIO los casos de rama se SALTAN, no fallan', () => {
    // El dia que este PR entre en `dev`, la base de fusion pasa a ser HEAD y el diff queda vacio.
    // Se simula inyectando esa lista vacia en el mismo helper que usan los cinco casos de arriba,
    // que es la forma honesta de probarlo sin mergear nada: si el desenlace fuera un fallo, este
    // `expect` veria un error de asercion en vez del salto.
    expect(esLaRamaDeQC66([])).toBe(false);

    const notas: string[] = [];
    const ctxFalso: ConSalto = {
      skip: (nota: string): never => {
        notas.push(nota);
        throw new SaltoSimulado();
      },
    };

    expect(() => diffOMudo(ctxFalso, [])).toThrow(SaltoSimulado);
    expect(notas, 'con el diff vacio el helper tiene que SALTAR, una vez y diciendo por que').toHaveLength(
      1,
    );
    expect(notas[0]).toContain('VACIO');
    expect(notas[0]).toContain('NO ha comprobado nada');

    // Y fuera de la rama de QC-66 -diff con cambios, pero ajenos- tambien salta, con OTRO motivo.
    notas.length = 0;
    expect(() => diffOMudo(ctxFalso, ['app/(private)/usuarios/page.tsx'])).toThrow(SaltoSimulado);
    expect(notas[0]).toContain('NO es la rama de QC-66');

    // En cambio, DENTRO de su rama el helper no salta y devuelve el diff entero para que los casos
    // lo midan: el salto no se tragó la guardia.
    const devuelto = diffOMudo(ctxFalso, RAMA_DE_QC66);
    expect(devuelto).toEqual(RAMA_DE_QC66);
    expect(notas, 'dentro de su rama el helper NO debe saltar').toHaveLength(1);
  });

  it('los cuatro detectores de rama MUERDEN con listas sinteticas', () => {
    // R43, por sus dos caminos.
    expect(cambiosDeEsquema([...RAMA_DE_QC66, 'db/schema.prisma'])).toEqual(['db/schema.prisma']);
    expect(
      migracionesAjenas([
        ...RAMA_DE_QC66,
        'db/migrations/20260911090000_users_extra_column/migration.sql',
      ]),
    ).toEqual(['db/migrations/20260911090000_users_extra_column/migration.sql']);

    // R46, por los cuatro caminos: pagina, componente, E2E y adaptador de navegacion en `lib/`.
    expect(infraccionesDeInterfaz([...RAMA_DE_QC66, 'app/(private)/usuarios/page.tsx'])).toEqual([
      'app/(private)/usuarios/page.tsx',
    ]);
    expect(infraccionesDeInterfaz([...RAMA_DE_QC66, 'components/shared/users-table.tsx'])).toEqual([
      'components/shared/users-table.tsx',
    ]);
    expect(infraccionesDeInterfaz([...RAMA_DE_QC66, 'e2e/usuarios.spec.ts'])).toEqual([
      'e2e/usuarios.spec.ts',
    ]);
    expect(
      infraccionesDeInterfaz([
        ...RAMA_DE_QC66,
        'lib/modules/navegacion/adapters/driving/user-menu.ts',
      ]),
    ).toEqual(['lib/modules/navegacion/adapters/driving/user-menu.ts']);

    // R47, por los dos archivos.
    expect(cambiosDeDependencias([...RAMA_DE_QC66, 'package.json'])).toEqual(['package.json']);
    expect(cambiosDeDependencias([...RAMA_DE_QC66, 'pnpm-lock.yaml'])).toEqual(['pnpm-lock.yaml']);

    // Y todos ellos siguen mordiendo dentro de la rama, que es donde tienen que morder.
    expect(esLaRamaDeQC66([...RAMA_DE_QC66, 'db/schema.prisma'])).toBe(true);
  });

  it('y ninguno muerde con el alcance legitimo de esta ficha', () => {
    // El alcance de QC-66 completo: los veinte archivos de produccion, la composicion, su unica
    // migracion, su spec y sus tests. Si alguno de los detectores mordiera aqui, estaria acusando
    // a la ficha de lo que su propio spec le manda hacer.
    const legitimo = [
      ...ARCHIVOS_NUEVOS_DE_LA_FEATURE,
      COMPOSICION,
      ...ARCHIVOS_DE_LA_MIGRACION,
      'specs/QC-66-crud-de-usuarios/tasks.md',
      'tests/unit/identity/usuarios/scope.test.ts',
      'tests/integration/identity/user-admin-prisma.test.ts',
      'progress/impl_QC-66-crud-de-usuarios.md',
    ];
    expect(esLaRamaDeQC66(legitimo)).toBe(true);
    expect(cambiosDeEsquema(legitimo)).toEqual([]);
    expect(migracionesAjenas(legitimo)).toEqual([]);
    expect(infraccionesDeInterfaz(legitimo)).toEqual([]);
    expect(cambiosDeDependencias(legitimo)).toEqual([]);
  });
});

/**
 * QC-95 enmienda R45 de QC-66: QUE LA EXCEPCION MUERDA (RETENSADO 2026-09-15, informe
 * `progress/review_QC-95-desbloqueo-manual-limpia-el-conteo-2026-09-15.md > B1`).
 *
 * Una excepcion que solo se ejercita contra el arbol real demuestra que deja pasar lo legitimo,
 * no que se niegue a dejar pasar lo demas. Aqui se le dan adaptadores SINTETICOS con cada forma
 * conocida de colarse, y un caso contra el archivo real que afirma que la excepcion hace falta y
 * basta.
 */
describe('QC-95 enmienda R45 de QC-66: la excepcion de applyGuardedChange muerde', () => {
  const SPREAD_MULTILINEA = [
    '...(input.lockState === null ? {} : {',
    '        failedLoginAttempts: input.lockState.failedAttempts,',
    '        lockLevel: input.lockState.lockLevel,',
    '        lockedUntil: input.lockState.lockedUntil,',
    '      }),',
  ].join('\n');
  const SPREAD_EN_UNA_LINEA =
    '...(input.lockState === null ? {} : { failedLoginAttempts: input.lockState.failedAttempts, ' +
    'lockLevel: input.lockState.lockLevel, lockedUntil: input.lockState.lockedUntil }),';
  const SPREAD_SIN_ESPACIOS =
    '...(input.lockState===null?{}:{failedLoginAttempts:input.lockState.failedAttempts,' +
    'lockLevel:input.lockState.lockLevel,lockedUntil:input.lockState.lockedUntil}),';
  const SPREAD_SIN_CONDICION =
    '...{ failedLoginAttempts: input.lockState.failedAttempts, ' +
    'lockLevel: input.lockState.lockLevel, lockedUntil: input.lockState.lockedUntil },';
  const SPREAD_CON_LITERALES =
    '...(input.lockState === null ? {} : { failedLoginAttempts: 0, lockLevel: 0, lockedUntil: null }),';

  /** Un `user-admin-prisma.ts` en miniatura, con huecos donde inyectar cada variante. */
  function adaptador(partes: {
    readonly select?: string;
    readonly update?: string;
    readonly apply: string;
    readonly tras?: string;
  }): string {
    return [
      "import { prisma } from '@/lib/shared/prisma';",
      '',
      'const USER_ROW_SELECT = {',
      '  id: true,',
      '  accountStatus: true,',
      partes.select ?? '',
      '} as const;',
      '',
      'export async function updateAliveInCompany(input: Changes): Promise<number> {',
      '  const { count } = await prisma.user.updateMany({',
      '    where: { id: input.id, deletedAt: null },',
      `    data: { updatedAt: input.now, ${partes.update ?? ''} },`,
      '  });',
      '  return count;',
      '}',
      '',
      'export async function applyGuardedChange(input: GuardedChange): Promise<GuardedOutcome> {',
      '  const { count } = await prisma.user.updateMany({',
      '    where: { id: input.id, deletedAt: null },',
      "    data: input.kind === 'delete' ? { deletedAt: input.now } : {",
      '      accountStatus: input.accountStatus,',
      '      updatedAt: input.now,',
      `      ${partes.apply}`,
      '    },',
      '  });',
      "  return count === 1 ? 'ok' : 'not_found';",
      '}',
      partes.tras ?? '',
    ].join('\n');
  }

  const LAS_TRES_GRAFIAS_FUERA = [
    '`failedLoginAttempts` fuera del unico spread condicional autorizado',
    '`lockLevel` fuera del unico spread condicional autorizado',
    '`lockedUntil` fuera del unico spread condicional autorizado',
  ];

  it('(f) el fragmento legitimo, multilinea, en una linea o sin espacios, no da hallazgos', () => {
    for (const spread of [SPREAD_MULTILINEA, SPREAD_EN_UNA_LINEA, SPREAD_SIN_ESPACIOS]) {
      const fuente = adaptador({ apply: spread });
      expect(aparicionesDelFragmentoAutorizado(fuente), spread).toHaveLength(1);
      // Sin la excepcion, el barrido original veria las tres: la excepcion es la que las deja pasar.
      expect(grafiasDelBloqueoEn(fuente)).toEqual(['failedLoginAttempts', 'lockLevel', 'lockedUntil']);
      expect(hallazgosDeLaExcepcionQC95(fuente), spread).toEqual([]);
    }
  });

  it('(a) una segunda aparicion de `lockedUntil` en USER_ROW_SELECT es hallazgo aunque el spread sea legitimo', () => {
    const fuente = adaptador({ select: '  lockedUntil: true,', apply: SPREAD_MULTILINEA });
    expect(hallazgosDeLaExcepcionQC95(fuente)).toEqual([
      '`lockedUntil` fuera del unico spread condicional autorizado',
    ]);
  });

  it('(b) el spread FUERA de applyGuardedChange es rojo: en otro export y en una funcion no exportada debajo', () => {
    const enUpdate = adaptador({ update: SPREAD_EN_UNA_LINEA, apply: '' });
    expect(hallazgosDeLaExcepcionQC95(enUpdate)).toEqual([
      'el spread condicional que autoriza QC-95 aparece 1 vez/veces FUERA de applyGuardedChange',
      ...LAS_TRES_GRAFIAS_FUERA,
    ]);

    const enHelperDebajo = adaptador({
      apply: '',
      tras: ['', 'function conContadores(input: GuardedChange) {', `  return { ${SPREAD_EN_UNA_LINEA} };`, '}'].join(
        '\n',
      ),
    });
    expect(hallazgosDeLaExcepcionQC95(enHelperDebajo)).toEqual([
      'el spread condicional que autoriza QC-95 aparece 1 vez/veces FUERA de applyGuardedChange',
      ...LAS_TRES_GRAFIAS_FUERA,
    ]);
  });

  it('(c) el spread SIN la condicion de no nulo no encaja con la excepcion y es rojo', () => {
    const fuente = adaptador({ apply: SPREAD_SIN_CONDICION });
    expect(aparicionesDelFragmentoAutorizado(fuente)).toEqual([]);
    expect(hallazgosDeLaExcepcionQC95(fuente)).toEqual([
      expect.stringContaining('(0 apariciones)'),
      ...LAS_TRES_GRAFIAS_FUERA,
    ]);
  });

  it('(d) el spread con LITERALES 0, 0, null no encaja con la excepcion y es rojo', () => {
    const fuente = adaptador({ apply: SPREAD_CON_LITERALES });
    expect(aparicionesDelFragmentoAutorizado(fuente)).toEqual([]);
    expect(hallazgosDeLaExcepcionQC95(fuente)).toEqual([
      expect.stringContaining('(0 apariciones)'),
      ...LAS_TRES_GRAFIAS_FUERA,
    ]);
  });

  it('(e) el spread DUPLICADO dentro de applyGuardedChange es rojo', () => {
    const fuente = adaptador({ apply: `${SPREAD_MULTILINEA}\n      ${SPREAD_EN_UNA_LINEA}` });
    expect(hallazgosDeLaExcepcionQC95(fuente)).toEqual([
      'el spread condicional que autoriza QC-95 aparece 2 veces: se autoriza UNA',
      ...LAS_TRES_GRAFIAS_FUERA,
    ]);
  });

  it('sin la enmienda (cero apariciones) o sin applyGuardedChange, la excepcion huerfana es roja', () => {
    expect(hallazgosDeLaExcepcionQC95(adaptador({ apply: '' }))).toEqual([
      expect.stringContaining('(0 apariciones)'),
    ]);

    const sinLaFuncion = adaptador({ apply: SPREAD_MULTILINEA }).replace(
      'export async function applyGuardedChange',
      'export async function applyChange',
    );
    expect(hallazgosDeLaExcepcionQC95(sinLaFuncion)).toEqual([
      expect.stringContaining('no se encuentra `export async function applyGuardedChange`'),
      'el spread condicional que autoriza QC-95 aparece 1 vez/veces FUERA de applyGuardedChange',
      ...LAS_TRES_GRAFIAS_FUERA,
    ]);
  });

  it('contra el archivo REAL: una unica aparicion, dentro de applyGuardedChange, y cero hallazgos', () => {
    expect(existsSync(join(RAIZ, ARCHIVO_DE_LA_EXCEPCION_QC95))).toBe(true);
    const codigo = quitarComentariosTs(leer(ARCHIVO_DE_LA_EXCEPCION_QC95));

    const cuerpo = limitesDeApplyGuardedChange(codigo);
    expect(cuerpo, 'user-admin-prisma.ts ya no declara applyGuardedChange').not.toBeNull();

    const apariciones = aparicionesDelFragmentoAutorizado(codigo);
    expect(apariciones, 'QC-95 enmienda R45 de QC-66: el spread autorizado aparece UNA vez').toHaveLength(1);
    const [unica] = apariciones;
    expect(unica !== undefined && cuerpo !== null && unica.inicio >= cuerpo.inicio && unica.fin <= cuerpo.fin).toBe(
      true,
    );

    // ANCLA: sin la excepcion, el archivo real SI nombra las tres grafias. Si dejara de hacerlo,
    // la excepcion sobraria y habria que retirarla.
    expect(grafiasDelBloqueoEn(codigo)).toEqual(['failedLoginAttempts', 'lockLevel', 'lockedUntil']);

    expect(
      hallazgosDeLaExcepcionQC95(codigo),
      'QC-95 enmienda R45 de QC-66: el archivo real no deberia tener hallazgos',
    ).toEqual([]);
  });
});
