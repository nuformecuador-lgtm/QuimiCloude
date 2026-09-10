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
// DOS FAMILIAS DE ASERCION, y conviene no confundirlas:
//
//   1. Las que miran EL CAMBIO (R43 sobre `db/schema.prisma`, R46, R47). Comparan contra la BASE
//      DE FUSION con `origin/dev` mas el arbol de trabajo, para que muerdan antes de commitear.
//      Una asercion de esta familia es VACUAMENTE VERDE si el rango git no esta disponible: un
//      `diff` vacio deja toda lista filtrada en `[]` sin haber mirado nada. Por eso cada una
//      ANCLA la no-vacuidad primero -`expect(diff.length).toBeGreaterThan(0)` con su mensaje-,
//      exactamente como hacen los cinco retensados de
//      `tests/unit/recetas-ui/recipe-route-contract.test.ts`. Si el rango falla, el caso se pone
//      ROJO diciendolo; NO se salta en silencio.
//
//      El ancla afirma sobre LO QUE ESTA RAMA SI CAMBIA -que cambia algo-, nunca sobre un archivo
//      concreto de otra ficha. Esa es justo la forma en que se equivocaron
//      `tests/unit/unidades/modulo-intacto.test.ts` (exige `unit-prisma.ts` en el diff) y
//      `tests/unit/unidades/unidades-convenciones.test.ts` (exige un `e2e/unidades.spec.ts`
//      nuevo): estan estructuralmente rojos en cualquier rama que no sea la suya. Aqui no se
//      imita ese patron.
//
//   2. Las que miran EL DISCO (R38, R45, R16, R24). No dependen de git. Su riesgo de verde
//      vacuo es el contrario: una lista de archivos vacia o con un nombre mal escrito. Por eso
//      cada una comprueba primero que los archivos que nombra EXISTEN y tienen contenido, y
//      varias llevan ademas un ancla POSITIVA -el archivo que SI debe contener el patron-, para
//      que una expresion regular roma no las deje verdes sin mirar.
//
// UN AVISO SOBRE LOS COMENTARIOS. Varios archivos de esta feature NOMBRAN en sus comentarios lo
// que prometen no tocar: `user-input.ts` y `user-view.ts` explican que `failedLoginAttempts`,
// `lockLevel` y `lockedUntil` quedan fuera por R45, y `user-actions.ts` dice que no tiene ningun
// `console.*`. Esa documentacion es informacion util y no puede poner un test rojo. Asi que antes
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
 * Los archivos que ESTA RAMA toca respecto de la base de fusion con `origin/dev`, mas los del
 * arbol de trabajo (para que la guardia muerda antes de commitear).
 *
 * Devuelve `[]` -no lanza- si el rango no esta disponible: quien llama ANCLA la no-vacuidad y se
 * pone rojo con su propio mensaje. Es el mismo contrato que el `try/catch` de
 * `recipe-route-contract.test.ts`, y la razon de no usar `dev...HEAD` es la misma que anota
 * `account-status-scope.test.ts`: el `dev` LOCAL va por detras del remoto y el rango arrastraria
 * trabajo ajeno ya mergeado.
 */
function diffDeLaRama(): readonly string[] {
  const tocados = new Set<string>();
  try {
    const base = git('git merge-base origin/dev HEAD').trim();
    if (base.length === 0) return [];
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
  } catch {
    // El rango no esta disponible. NO se deja en verde: se devuelve la lista vacia a proposito y
    // el ancla de no-vacuidad de cada caso lo pone ROJO diciendolo. Un entorno sin `origin/dev`
    // alcanzable no es un entorno donde este alcance se cumpla: es uno donde no se ha mirado nada.
    return [];
  }
  return [...tocados].sort();
}

/** Las lineas que esta rama AÑADE a un archivo preexistente y compartido. */
function lineasAnadidasEn(ruta: string): readonly string[] {
  try {
    const base = git('git merge-base origin/dev HEAD').trim();
    if (base.length === 0) return [];
    return git(`git diff -U0 ${base} -- ${ruta}`)
      .split('\n')
      .filter((linea) => linea.startsWith('+') && !linea.startsWith('+++'))
      .map((linea) => linea.slice(1));
  } catch {
    return [];
  }
}

const ANCLA_DEL_RANGO =
  `el diff contra \`${RANGO}\` vino VACIO: el rango no estaba disponible y este caso NO ha ` +
  'comprobado nada. No se deja en verde a proposito.';

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

/** Los TRECE archivos nuevos de `domain/` (R42: los seis casos de uso viven aqui). */
const DOMAIN_NUEVO = [
  'lib/modules/identity/domain/actor.ts',
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

/** Los VEINTE archivos de produccion que esta feature CREA. */
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

/** LA UNICA migracion de esta feature (T4), nombrada, con sus dos archivos. */
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

describe('alcance de QC-66 (crud-de-usuarios): ni esquema, ni indices, ni bloqueo, ni pantalla, ni dependencias', () => {
  it('R43 — el diff de la rama no toca db/schema.prisma', () => {
    // R43: «Esta feature NO DEBE añadir, quitar ni modificar ninguna columna, tabla, indice,
    // restriccion ni tipo de la base». `db/schema.prisma` es el unico sitio donde se declaran, y
    // el `tasks.md` lo declara con un **NO** rotundo en la tabla de archivos compartidos. Cero
    // diff, no «diff pequeno».
    const diff = diffDeLaRama();

    // ANCLA DE NO-VACUIDAD. Sin esto el `filter` de abajo devuelve `[]` con el rango caido y el
    // caso pasaria en verde sin haber mirado un solo archivo.
    expect(diff.length, ANCLA_DEL_RANGO).toBeGreaterThan(0);

    expect(
      diff.filter((ruta) => ruta === 'db/schema.prisma'),
      'db/schema.prisma esta en el diff de la rama, y R43 dice que esta feature no lo toca: ' +
        'el modelo `User` lo aportaron la feature 4, QC-47 y QC-65, y esta ficha solo lo consume',
    ).toEqual([]);
  });

  it('R43 — la unica migracion de la rama es la del catalogo, y no lleva ni un ALTER, CREATE ni DROP', () => {
    // Dos mitades, y ninguna basta sola:
    //   1. EL DIFF: ninguna otra carpeta de `db/migrations/` aparece. Una segunda migracion seria
    //      alcance escapandose por la unica puerta que R43 deja abierta.
    //   2. EL TEXTO: el UP de esa unica migracion es de DATOS. Ni `ALTER`, ni `CREATE`, ni `DROP`
    //      (T4: «Cero ALTER, CREATE y DROP»).
    const diff = diffDeLaRama();
    expect(diff.length, ANCLA_DEL_RANGO).toBeGreaterThan(0);

    const migracionesEnElDiff = diff
      .filter((ruta) => ruta.startsWith('db/migrations/'))
      .sort();
    expect(
      migracionesEnElDiff,
      'la unica migracion de QC-66 es la del catalogo de permisos (T4); cualquier otra carpeta ' +
        `de db/migrations/ en el diff es alcance escapandose: ${migracionesEnElDiff.join(', ')}`,
    ).toEqual([...ARCHIVOS_DE_LA_MIGRACION]);

    // ANCLA POSITIVA sobre el disco: la migracion existe y es la de DATOS que se espera. Sin
    // esto, un archivo vacio -o renombrado- dejaria el `not.toMatch` de abajo en verde.
    const up = leer(`${CARPETA_DE_LA_MIGRACION}/migration.sql`);
    expect(
      up,
      'el UP de la migracion del catalogo no inserta en `permissions`: no es la migracion esperada',
    ).toMatch(/INSERT\s+INTO\s+"permissions"/i);

    const upSinComentarios = quitarComentariosSql(up);
    for (const sentencia of ['ALTER', 'CREATE', 'DROP'] as const) {
      expect(
        upSinComentarios,
        `el UP de la migracion del catalogo contiene un ${sentencia}: R43 dice que solo inserta filas`,
      ).not.toMatch(new RegExp(`\\b${sentencia}\\b`, 'i'));
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

  it('R45 — ningun archivo de produccion de la feature lee ni escribe los tres contadores de bloqueo de QC-19', () => {
    // R45: «ninguna de las seis operaciones lee ni escribe `failed_login_attempts`, `lock_level`
    // ni `locked_until`, y limpiar el contador al salir de `blocked` ES DE QC-78». Esta es la
    // frontera que evita que dos fichas en vuelo se pisen el mismo mecanismo.

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
      20,
    );
    for (const archivo of ARCHIVOS_NUEVOS_DE_LA_FEATURE) {
      expect(existsSync(join(RAIZ, archivo)), `${archivo} no existe en el disco`).toBe(true);
      expect(leer(archivo).length, `${archivo} esta vacio: no prueba nada`).toBeGreaterThan(0);
    }

    const hallazgos: string[] = [];
    for (const archivo of ARCHIVOS_NUEVOS_DE_LA_FEATURE) {
      const codigo = quitarComentariosTs(leer(archivo));
      for (const grafia of GRAFIAS_DEL_BLOQUEO) {
        if (codigo.includes(grafia)) hallazgos.push(`${archivo}: ${grafia}`);
      }
    }

    // `lib/composition/index.ts` es PREEXISTENTE y lo comparten los once modulos y varias fichas
    // en vuelo (QC-78 entre ellas). Se mide SOLO lo que esta rama le AÑADE: medirlo entero
    // acusaria en falso a un vecino por una linea que no es de QC-66.
    const anadidas = lineasAnadidasEn(COMPOSICION);
    expect(
      anadidas.length,
      `no se pudieron leer las lineas que esta rama anade a ${COMPOSICION} (rango git caido): ` +
        'este trozo del caso NO ha comprobado nada',
    ).toBeGreaterThan(0);
    const codigoAnadido = quitarComentariosTs(anadidas.join('\n'));
    for (const grafia of GRAFIAS_DEL_BLOQUEO) {
      if (codigoAnadido.includes(grafia)) hallazgos.push(`${COMPOSICION} (linea nueva): ${grafia}`);
    }

    expect(
      hallazgos,
      'QC-66 toca el mecanismo de bloqueo de QC-19/QC-78, y R45 se lo prohibe: ' +
        hallazgos.join('; '),
    ).toEqual([]);
  });

  it('R46 — la rama no anade nada bajo app/, components/ ni e2e/, ni ningun adaptador de navegacion', () => {
    // R46: «NO DEBE incluir ninguna pantalla, pagina, componente de interfaz ni ruta bajo `app/`
    // o `components/` -van a QC-67-, ni ningun adaptador de navegacion o de menu; por lo tanto no
    // aporta ningun flujo navegable que un test E2E pueda visitar». El E2E se difiere AQUI y CON
    // MOTIVO (decision cerrada 17, `design.md > 14`), no al final y no por olvido: no hay
    // pantalla que Playwright pueda abrir.
    const diff = diffDeLaRama();
    expect(diff.length, ANCLA_DEL_RANGO).toBeGreaterThan(0);

    const enLaUi = diff.filter(
      (ruta) =>
        ruta.startsWith('app/') || ruta.startsWith('components/') || ruta.startsWith('e2e/'),
    );
    expect(
      enLaUi,
      'QC-66 es backend puro: la pantalla es QC-67 y el E2E se difiere con motivo (decision 17). ' +
        `Esto esta en el diff: ${enLaUi.join(', ')}`,
    ).toEqual([]);

    // Y no se cuela por el otro camino: un adaptador de navegacion o de menu dentro de `lib/`.
    const navegacion = diff.filter(
      (ruta) => ruta.startsWith('lib/') && /nav|menu|sidebar|breadcrumb/i.test(ruta),
    );
    expect(
      navegacion,
      `R46 prohibe tambien el adaptador de navegacion o de menu: ${navegacion.join(', ')}`,
    ).toEqual([]);
  });

  it('R47 — la rama no toca package.json ni pnpm-lock.yaml', () => {
    // R47: «NO DEBE incorporar ninguna dependencia de terceros nueva: la generacion al azar sale
    // del `crypto` de Node detrás de un puerto y el hash de la bcrypt ya instalada». `design.md
    // > 13` lo cierra sin abrir ninguna propuesta, asi que los cuatro checks de salud no llegan
    // a evaluarse.
    //
    // Se afirma la forma FUERTE -que los dos archivos no estan en el diff-, no la debil de
    // comparar `dependencies` contra la base: si no estan en el diff, no pueden haber cambiado.
    const diff = diffDeLaRama();
    expect(diff.length, ANCLA_DEL_RANGO).toBeGreaterThan(0);

    const deDependencias = diff.filter(
      (ruta) => ruta === 'package.json' || ruta === 'pnpm-lock.yaml',
    );
    expect(
      deDependencias,
      'R47 y la regla 7 de CLAUDE.md: ninguna dependencia entra en esta ficha, y ninguna entra ' +
        `sin aprobacion humana y su fila en docs/dependencias.md. Esto cambio: ${deDependencias.join(', ')}`,
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
