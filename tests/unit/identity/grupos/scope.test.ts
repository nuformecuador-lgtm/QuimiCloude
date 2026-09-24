// QC-84 T17 — EL TEST DE ALCANCE (`design.md > 10`, fila «Unit (alcance)»).
//
// Cubre R46, R47, R48, R49 y R50 —los cinco requisitos de ALCANCE de la ficha—, y ademas las
// mitades que `tasks.md > Trazabilidad` le encarga a este archivo y a ningun otro: **R45** (todo
// identificador de base que la feature nombra es INGLES, `snake_case` y viene de QC-83, sin
// introducir ninguno nuevo), **R13** (ninguna segunda normalizacion, y el estado efectivo se
// pregunta a la unica definicion en vez de comparar `'active'` a mano) y **R4** (ningun archivo
// nuevo incrusta el nombre de un rol).
//
// R46-R50 son requisitos de PLENO DERECHO, no comentarios (`requirements.md`, «Como leer los
// requisitos que dicen no»). Lo que esta ficha escribe lo prueban los tests de dominio, de borde,
// de driving y de integracion; lo que esta ficha NO PUEDE TOCAR —el esquema y las migraciones de
// QC-83, el catalogo cerrado de permisos, la pantalla de QC-85, el `package.json` y las tablas de
// asignacion de QC-86— solo se prueba aqui.
//
// Estilo copiado de `tests/unit/identity/usuarios/scope.test.ts` y de
// `tests/unit/identity/roles/scope.test.ts`, incluido el retensado de MAYOR-1 y COMO RESUELVEN EL
// RANGO DE GIT: se mide contra la BASE DE FUSION con `origin/dev` mas el arbol de trabajo, nunca
// contra la punta de `origin/dev`. Se recorre el DISCO y el TEXTO, no el grafo de imports (eso es
// trabajo de `tests/guards/`), y ninguna afirmacion hace un censo GLOBAL del repositorio, para no
// romperse cuando una ficha vecina se mergee.
//
// DOS FAMILIAS DE ASERCION, y conviene no confundirlas:
//
//   A. LAS QUE MIRAN EL CONTENIDO. No dependen de git y muerden SIEMPRE, tambien dentro de `dev`
//      dentro de un mes. Su riesgo de verde vacuo es una lista vacia o un nombre mal escrito, asi
//      que cada una comprueba que los archivos que nombra EXISTEN y tienen contenido, y lleva un
//      ANCLA POSITIVA —el archivo que SI contiene el patron— para que una expresion regular roma
//      no la deje verde sin mirar. Aqui son R47, R50, R45, R13, R4 y la mitad de contenido de R49.
//
//   B. LAS QUE MIRAN EL CAMBIO. «Esta rama no toco `db/**` / no anadio una dependencia / no anadio
//      una pantalla» es un hecho HISTORICO de la rama, no una propiedad del arbol: QC-85 VA a crear
//      `app/(private)/grupos/` con pleno derecho y otras fichas anaden migraciones con pleno
//      derecho, asi que estas NO pueden ser de contenido. Y NO se dejan en verde cuando no hay nada
//      que mirar: «no puedo mirar» (el rango no resuelve) es ROJO, y «esto no es mi rama» / «el
//      diff esta vacio» queda SALTADO Y RUIDOSO, nunca verde. Aqui son R46, R48, R49 y la mitad de
//      rama de R50.
//
// UN AVISO SOBRE LOS COMENTARIOS, y aqui es CRITICO. Varios archivos de esta feature NOMBRAN en sus
// comentarios justo lo que prometen no hacer: `rename-work-group.ts` y `delete-work-group.ts`
// explican que no importan `@/lib/modules/asignaciones` ni nombran `order_assignments`,
// `list-work-group-members.ts` explica por que un `WHERE account_status = 'active'` a secas no
// bastaria, y `create-work-group.ts` dice que aqui no hay ningun `toLowerCase`. Esa documentacion es
// informacion util y no puede poner un test rojo. Asi que antes de buscar se quitan los comentarios
// (`quitarComentariosTs`), mismo criterio que el retensado de QC-47 en
// `tests/unit/proveedores/scope.test.ts`. Lo que se mide es CODIGO de verdad.

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PERMISSIONS } from '@/lib/modules/identity/domain/permissions';
import { ROLE_ADMINISTRADOR, ROLE_OPERADOR } from '@/lib/modules/identity/domain/roles';

const RAIZ = join(__dirname, '..', '..', '..', '..');

const RANGO = 'git merge-base origin/dev HEAD';

function git(comando: string): string {
  return execSync(comando, { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function aPosix(ruta: string): string {
  return ruta.split('\\').join('/');
}

/** La base de fusion con `origin/dev`, o `null` si el rango no esta disponible aqui. */
function baseDeFusionConDev(): string | null {
  try {
    const base = git(RANGO).trim();
    return base.length === 0 ? null : base;
  } catch {
    return null;
  }
}

/**
 * Los archivos que ESTA RAMA toca respecto de la BASE DE FUSION con `origin/dev`, mas los del
 * arbol de trabajo (para que la guardia muerda antes de commitear).
 *
 * LANZA —a proposito— si el rango no se puede calcular: «no puedo mirar» es ROJO. La razon de no
 * usar `dev...HEAD` ni la punta de `origin/dev` es la que ya anotan `usuarios/scope.test.ts` y
 * `roles/scope.test.ts`: contra la PUNTA el rango arrastraria el trabajo ajeno que se mergeo
 * mientras esta rama vivia, y esta guardia acusaria a esta ficha de lo que hicieron otras.
 */
function archivosTocados(): readonly string[] {
  const base = baseDeFusionConDev();
  if (base === null) {
    throw new Error(
      `No se pudo calcular el diff contra \`${RANGO}\`, asi que el alcance de rama de QC-84 NO se ` +
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

// ---------------------------------------------------------------------------------------------
// LO QUE ESTA FEATURE CONSTRUYE, NOMBRADO UNO A UNO
//
// Se escribe a mano y NO se deriva del diff: derivarla haria que el caso se midiera a si mismo y
// que un archivo olvidado saliera verde por no estar en la lista. Son los TRECE archivos de
// produccion que `design.md > 1` y `tasks.md` declaran como NUEVOS.
// ---------------------------------------------------------------------------------------------

/** Los DIEZ archivos nuevos de `domain/`: los siete casos de uso mas sus tres tipos. */
const DOMAIN_NUEVO = [
  'lib/modules/identity/domain/add-work-group-member.ts',
  'lib/modules/identity/domain/create-work-group.ts',
  'lib/modules/identity/domain/delete-work-group.ts',
  'lib/modules/identity/domain/list-work-group-members.ts',
  'lib/modules/identity/domain/list-work-groups.ts',
  'lib/modules/identity/domain/remove-work-group-member.ts',
  'lib/modules/identity/domain/rename-work-group.ts',
  'lib/modules/identity/domain/work-group-input.ts',
  'lib/modules/identity/domain/work-group-queryable.ts',
  'lib/modules/identity/domain/work-group-view.ts',
] as const;

/** El UNICO puerto nuevo: por el piden los siete casos de uso. */
const PORTS_NUEVOS = ['lib/modules/identity/ports/work-group-repository.ts'] as const;

/** Los DOS adaptadores nuevos: el driven de Prisma y el driving de las siete Server Actions. */
const ADAPTERS_NUEVOS = [
  'lib/modules/identity/adapters/driven/persistence/work-group-prisma.ts',
  'lib/modules/identity/adapters/driving/work-group-actions.ts',
] as const;

/** Los TRECE archivos de produccion que esta feature CREA. */
const ARCHIVOS_NUEVOS_DE_LA_FEATURE = [
  ...DOMAIN_NUEVO,
  ...PORTS_NUEVOS,
  ...ADAPTERS_NUEVOS,
] as const;

/**
 * Los DOS archivos PREEXISTENTES y COMPARTIDOS a los que la rama anade cableado. No se miden
 * enteros —los comparten los once modulos y varias fichas en vuelo— sino SOLO las lineas que esta
 * rama les anade: medirlos enteros acusaria en falso a cualquier vecino.
 */
const COMPOSICION = 'lib/composition/index.ts';
const CONTRATO = 'lib/modules/identity/index.ts';

/** El adaptador driven: el unico archivo de la feature que habla con la base. */
const ADAPTADOR_DRIVEN = 'lib/modules/identity/adapters/driven/persistence/work-group-prisma.ts';

// ---------------------------------------------------------------------------------------------
// R47 — EL CATALOGO CERRADO DE PERMISOS
// ---------------------------------------------------------------------------------------------

/**
 * El catalogo cerrado de permisos, que esta ficha NO toca (R47): «el catalogo DEBE seguir teniendo
 * QUINCE entradas despues de esta ficha, y los tests que afirman ese numero **no se tocan**».
 *
 * El numero tiene historia escrita en `lib/modules/identity/domain/permissions.ts` y ha ido
 * subiendo con cada enmienda al catalogo. Esta ficha reutiliza `usuarios.consultar` y
 * `usuarios.modificar` y no crea ninguno.
 *
 * Se importa `PERMISSIONS` y se cuenta: NO se toca `permissions.ts` ni ninguno de los tests ajenos
 * que ya afirman este numero (`tests/unit/identity/permissions.test.ts`,
 * `tests/guards/guard-permisos-sembrados.test.ts`), que es exactamente lo que R47 exige.
 */
const PERMISOS_ESPERADOS = 18;

/** Los DOS codigos que esta ficha reutiliza, y que por tanto tienen que seguir existiendo. */
const LOS_DOS_CODIGOS = ['usuarios.consultar', 'usuarios.modificar'] as const;

// ---------------------------------------------------------------------------------------------
// R50 — LA ASIGNACION DE PEDIDOS ES DE QC-86, Y ESTA FICHA NI LA LEE NI LA ESCRIBE
// ---------------------------------------------------------------------------------------------

/**
 * Las TRES grafias por las que la asignacion de pedidos se colaria en un archivo de esta feature:
 * la tabla, el modelo del cliente Prisma y el contrato del modulo vecino. Se buscan las tres porque
 * cualquiera de ellas seria la frontera rota: `prisma.orderAssignment.updateMany({...})` no escribe
 * nunca la cadena `order_assignments`, y un `import` del contrato de `asignaciones` tampoco.
 */
const GRAFIAS_DE_LA_ASIGNACION = [
  'order_assignments',
  'prisma.orderAssignment',
  '@/lib/modules/asignaciones',
] as const;

/**
 * Las DOS anclas positivas de R50: quien SI nombra la tabla (la migracion de QC-86) y quien SI
 * nombra el modelo del cliente (el test de integracion de T16, que la lee **con pleno derecho**:
 * la frontera de modulo vigila `lib/modules/**`, no `tests/**`; `design.md > 10`, primer aviso).
 * Sin ellas, una grafia mal escrita dejaria el bucle de abajo verde sin mirar nada.
 */
const MIGRACION_DE_QC86 = 'db/migrations/20260911120000_order_assignments/migration.sql';
const TEST_QUE_SI_LEE_LA_ASIGNACION =
  'tests/integration/identity/work-group-assignments.int.test.ts';

// ---------------------------------------------------------------------------------------------
// R45 — IDENTIFICADORES DE BASE: EN INGLES, `snake_case` Y NINGUNO NUEVO
// ---------------------------------------------------------------------------------------------

/**
 * Todo literal en forma `snake_case` que aparezca en el codigo de la feature. Dos clases muy
 * distintas caen en este patron y por eso hay dos listas: los IDENTIFICADORES DE BASE, que R45
 * gobierna, y los DISCRIMINANTES de los tipos de resultado del puerto, que son TypeScript y no
 * tocan la base. Cualquier literal que no este en ninguna de las dos pone el caso rojo: esa es la
 * forma de cazar un identificador NUEVO.
 */
const LITERAL_SNAKE_CASE = /['"`]([a-z][a-z0-9]*(?:_[a-z0-9]+)+)['"`]/g;

/**
 * Los CINCO identificadores de base que la feature nombra, todos creados por **QC-83** y por tanto
 * ninguno nuevo (R45: «consume los que creo QC-83»). El caso comprueba uno a uno que aparecen
 * VERBATIM en la migracion de QC-83: si esta ficha inventara `grupo_id` o `nombre_normalizado`, no
 * estaria en esta lista y el caso caeria.
 */
const IDENTIFICADORES_DE_QC83 = [
  'name_normalized',
  'user_id',
  'work_group_id',
  'work_group_members_pkey',
  'work_groups_name_unique',
] as const;

/** La migracion de QC-83, que es quien los CREO: el ancla positiva de R45. */
const MIGRACION_DE_QC83 = 'db/migrations/20260908210000_work_groups_and_members/migration.sql';

/**
 * Los discriminantes `snake_case` de los tipos de resultado del puerto y de los casos de uso. No
 * son identificadores de base: son etiquetas de uniones discriminadas de TypeScript, viven solo en
 * memoria y ninguna viaja a Postgres. Se enumeran a mano para que un identificador de base NUEVO no
 * se cuele haciendose pasar por una de ellas.
 */
const DISCRIMINANTES_DE_RESULTADO = [
  'already_member',
  'duplicate_name',
  'group_not_found',
  'member_not_found',
  'not_found',
  'user_not_found',
] as const;

/** Los modelos del cliente Prisma que el adaptador usa: los tres tienen que estar en el esquema. */
const MODELO_DE_PRISMA = /prisma\.([a-z][A-Za-z0-9]*)\s*\./g;

// ---------------------------------------------------------------------------------------------
// R13 — UNA SOLA DEFINICION DE «MISMO NOMBRE» Y UNA SOLA DEFINICION DE «ACTIVA»
// ---------------------------------------------------------------------------------------------

/**
 * El literal `'active'` ENTRE COMILLAS. R19 manda filtrar por el **estado efectivo** que resuelve
 * la unica definicion del modulo —`effectiveAccountStatus`, QC-78 R7—, y R13 prohibe declarar una
 * segunda normalizacion de lo que ya esta definido una vez. Un `if (user.accountStatus ===
 * 'active')` en un archivo de esta feature seria exactamente esa segunda definicion: una fila
 * bloqueada por intentos fallidos puede seguir diciendo `active` en la columna con el plazo
 * vigente, y una `blocked` con el plazo vencido vuelve a estar activa sin que nadie escriba nada.
 *
 * Entre comillas a proposito: asi `'inactive'` —que los casos de uso SI comparan legitimamente, es
 * uno de los cuatro estados del catalogo— no cuenta como hallazgo, porque delante de `active` lleva
 * una `n` y no una comilla.
 */
const LITERAL_ACTIVE = /['"`]active['"`]/;

/** Quien SI declara ese literal, y es el UNICO que puede: el ancla positiva. */
const DUENO_DEL_ESTADO_EFECTIVO = 'lib/modules/identity/domain/effective-account-status.ts';

/**
 * Las DOS formas de declarar una segunda normalizacion del nombre de grupo (R13): rebajar el texto
 * a mano o pasarlo por `String.prototype.normalize`. La unica definicion es
 * `normalizeWorkGroupName` (QC-83 R3), publicada por el contrato de `identity`.
 */
const SEGUNDA_NORMALIZACION = [/\.toLowerCase\s*\(/, /\.normalize\s*\(/] as const;

/**
 * Los DOS duenos de la normalizacion, y conviene distinguirlos porque hacen cosas distintas:
 *
 *   - `work-group-name.ts` (QC-83 R3) es la UNICA DEFINICION que el contrato publica y la que esta
 *     ficha tiene que usar. No rebaja el texto por su cuenta: DELEGA en `normalizeKey`.
 *   - `normalize-key.ts` es donde el texto se rebaja de verdad (`toLowerCase`, `normalize`), y por
 *     eso es el ANCLA POSITIVA de los patrones: si un dia dejara de hacerlo, `SEGUNDA_NORMALIZACION`
 *     estaria midiendo aire y la prohibicion de abajo seria trivialmente cierta.
 */
const DUENO_DE_LA_NORMALIZACION = 'lib/modules/identity/domain/normalize-key.ts';
const DEFINICION_PUBLICA_DEL_NOMBRE = 'lib/modules/identity/domain/work-group-name.ts';

/** Los DOS casos de uso que escriben el nombre y por tanto tienen que PEDIRSELO al dueno. */
const QUIENES_NORMALIZAN = [
  'lib/modules/identity/domain/create-work-group.ts',
  'lib/modules/identity/domain/rename-work-group.ts',
] as const;

// ---------------------------------------------------------------------------------------------
// R4 — EL NOMBRE DEL ROL NO SE ESCRIBE A MANO
// ---------------------------------------------------------------------------------------------

/**
 * El literal de un nombre de rol ENTRE COMILLAS, construido desde las constantes importadas y nunca
 * copiado a mano (R4: «ningun archivo nuevo de esta ficha incrusta el literal `'Administrador'` ni
 * ningun otro nombre de rol»). Es la leccion de QC-54, que gasto una ficha entera en unificar los
 * seis sitios que comparaban contra el literal. Si un rol se renombrara, esta guardia lo sigue.
 */
const LITERALES_DE_ROL = [ROLE_ADMINISTRADOR, ROLE_OPERADOR].map(
  (nombre) => new RegExp(`['"\`]${nombre}['"\`]`),
);

/** Quien SI declara las constantes, y por tanto el unico que escribe los literales. */
const DUENO_DEL_NOMBRE_DEL_ROL = 'lib/modules/identity/domain/roles.ts';

// ---------------------------------------------------------------------------------------------
// R49 — NINGUNA DEPENDENCIA NUEVA
// ---------------------------------------------------------------------------------------------

/**
 * Las DOS candidatas que `design.md > 11` descarto por su nombre: una libreria de *slug* o de
 * normalizacion de texto. No entran porque la normalizacion del nombre de grupo YA existe, es la
 * unica definicion publicada por el contrato (R13), y sustituirla cambiaria en silencio el
 * contenido de la columna `name_normalized` que QC-83 ya escribio.
 *
 * Esta es la mitad de CONTENIDO de R49 y es MAS FUERTE que «`package.json` no esta en el diff»:
 * prohibe LO CONCRETO que la ficha descarto, para siempre y en cualquier rama.
 */
const CANDIDATAS_DESCARTADAS = ['slugify', 'unidecode'] as const;

/** Una dependencia que SI esta instalada y aprobada: el ancla positiva de R49. */
const DEPENDENCIA_QUE_SI_ESTA = 'zod';

// ---------------------------------------------------------------------------------------------
// FAMILIA A: EL CONTENIDO. Muerde siempre, tambien dentro de `dev`.
// ---------------------------------------------------------------------------------------------

describe('alcance de QC-84 (crud-de-grupos-de-trabajo) — CONTENIDO: muerde siempre', () => {
  it('los trece archivos que esta ficha crea existen y no estan vacios', () => {
    // ANCLA DE LA LISTA, y sostiene a todos los casos de abajo: un nombre mal escrito o un archivo
    // vacio dejaria cada bucle pasando por la razon equivocada.
    expect(
      ARCHIVOS_NUEVOS_DE_LA_FEATURE.length,
      'la lista de archivos de la feature esta vacia',
    ).toBe(13);
    for (const archivo of ARCHIVOS_NUEVOS_DE_LA_FEATURE) {
      expect(existsSync(join(RAIZ, archivo)), `${archivo} no existe en el disco`).toBe(true);
      expect(leer(archivo).trim().length, `${archivo} esta vacio: no prueba nada`).toBeGreaterThan(
        0,
      );
    }
  });

  it('R47 — el catalogo de permisos sigue teniendo QUINCE entradas y ninguna de grupos', () => {
    // R47: «NO DEBE anadir, quitar ni renombrar ningun permiso del catalogo cerrado: reutiliza
    // `usuarios.consultar` y `usuarios.modificar`, el catalogo DEBE seguir teniendo QUINCE entradas
    // despues de esta ficha, y los tests que afirman ese numero no se tocan».
    expect(
      PERMISSIONS.length,
      'el catalogo de permisos cambio de tamano, y R47 dice que esta ficha no lo toca',
    ).toBe(PERMISOS_ESPERADOS);

    const codigos = PERMISSIONS.map((permiso) => permiso.code);

    // Los DOS que esta ficha REUTILIZA siguen ahi: sin ellos, los siete casos de uso no
    // autorizarian nada, pero el caso lo dice en voz alta en vez de dejarlo a la casualidad.
    for (const codigo of LOS_DOS_CODIGOS) {
      expect(
        codigos,
        `el catalogo ya no trae \`${codigo}\`, que es el que autoriza las siete operaciones`,
      ).toContain(codigo);
    }

    // Y ninguno NUEVO del modulo de grupos: el permiso propio nunca se propuso (decision 1).
    const deGrupos = codigos.filter(
      (codigo) => codigo.startsWith('grupos.') || codigo.startsWith('work-groups.'),
    );
    expect(
      deGrupos,
      'R47 y la decision cerrada 1: esta ficha NO trae un permiso propio. ' +
        `Aparecieron: ${deGrupos.join(', ')}`,
    ).toEqual([]);
  });

  it('R50 — ningun archivo de produccion de la feature nombra la asignacion de pedidos', () => {
    // R50: «NO DEBE administrar ni modificar la asignacion de pedidos: ninguna de sus operaciones
    // escribe en las tablas de QC-86, ninguna deriva responsables de la pertenencia vigente, y a
    // quien se puede asignar segun su estado de cuenta es de QC-87 y no se decide aqui».
    //
    // Que las filas de `order_assignments` sobrevivan al renombre y a la baja lo prueba
    // `work-group-assignments.int.test.ts` (T16, R18/R39). Lo que se prueba AQUI es la otra mitad:
    // que ningun archivo de PRODUCCION de esta ficha conozca siquiera esa tabla.

    // ANCLAS POSITIVAS: la tabla existe y se nombra asi (migracion de QC-86), y hay un archivo que
    // SI usa el modelo del cliente (el test de integracion de T16, que puede). Sin esto, una grafia
    // mal escrita dejaria el bucle de abajo verde sin mirar nada.
    expect(
      leer(MIGRACION_DE_QC86),
      `${MIGRACION_DE_QC86} ya no nombra \`order_assignments\`: las grafias de R50 miden aire`,
    ).toContain('order_assignments');
    expect(
      leer(TEST_QUE_SI_LEE_LA_ASIGNACION),
      `${TEST_QUE_SI_LEE_LA_ASIGNACION} ya no lee \`prisma.orderAssignment\`: la grafia del ` +
        'cliente que vigila R50 cambio y este caso estaria midiendo aire',
    ).toContain('prisma.orderAssignment');

    const hallazgos: string[] = [];
    for (const archivo of ARCHIVOS_NUEVOS_DE_LA_FEATURE) {
      const codigo = quitarComentariosTs(leer(archivo));
      for (const grafia of GRAFIAS_DE_LA_ASIGNACION) {
        if (codigo.includes(grafia)) hallazgos.push(`${archivo}: ${grafia}`);
      }
    }
    expect(
      hallazgos,
      'R50: administrar la asignacion de pedidos es de QC-86, que CONSUME el grupo y no al reves. ' +
        `La nombran: ${hallazgos.join('; ')}`,
    ).toEqual([]);
  });

  it('R45 — todo identificador de base que la feature nombra es ingles, snake_case y lo creo QC-83', () => {
    // R45: «Todo identificador de base de datos que esta feature nombre DEBE ir en INGLES y
    // `snake_case`, y la feature NO DEBE introducir ninguno nuevo: consume los que creo QC-83».
    //
    // Se mide al reves de como se suele: en vez de buscar palabras en espanol -una lista que nunca
    // esta completa-, se recorre CADA literal `snake_case` del codigo de la feature y se exige que
    // este en una de las DOS listas cerradas. Un identificador nuevo, se llame `grupo_id` o
    // `work_group_label`, no esta en ninguna y el caso cae.

    // ANCLA POSITIVA: los cinco que la lista declara aparecen VERBATIM en la migracion de QC-83.
    // Eso es lo que demuestra que ninguno es nuevo; si alguien renombrara uno, esto cae primero.
    const qc83 = leer(MIGRACION_DE_QC83);
    for (const identificador of IDENTIFICADORES_DE_QC83) {
      expect(
        qc83,
        `${MIGRACION_DE_QC83} no declara \`${identificador}\`: o no lo creo QC-83 -y entonces esta ` +
          'ficha lo introdujo, que es justo lo que R45 prohibe- o el nombre cambio',
      ).toContain(identificador);
      // Y la forma: ASCII, minusculas y `snake_case`. `ñ`, acentos o `camelCase` caen aqui.
      expect(identificador, `\`${identificador}\` no es snake_case ASCII`).toMatch(
        /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/,
      );
    }

    const permitidos = new Set<string>([
      ...IDENTIFICADORES_DE_QC83,
      ...DISCRIMINANTES_DE_RESULTADO,
    ]);
    const desconocidos: string[] = [];
    let literalesVistos = 0;
    for (const archivo of ARCHIVOS_NUEVOS_DE_LA_FEATURE) {
      const codigo = quitarComentariosTs(leer(archivo));
      for (const encontrado of codigo.matchAll(LITERAL_SNAKE_CASE)) {
        literalesVistos += 1;
        const literal = encontrado[1] ?? '';
        if (!permitidos.has(literal)) desconocidos.push(`${archivo}: ${literal}`);
      }
    }

    // ANCLA DE NO-VACUIDAD: el barrido encontro literales de verdad. Un patron roto dejaria
    // `desconocidos` vacio y el caso verde sin haber mirado ni un identificador.
    expect(
      literalesVistos,
      'el barrido no encontro ningun literal snake_case en los trece archivos: el patron de R45 ' +
        'esta midiendo aire',
    ).toBeGreaterThan(10);

    expect(
      desconocidos,
      'R45: esta ficha CONSUME los identificadores de QC-83 y no introduce ninguno. Si alguno de ' +
        'estos es un identificador de base nuevo, sobra; si es un discriminante de TypeScript, va ' +
        `nombrado en DISCRIMINANTES_DE_RESULTADO con su motivo. Sin clasificar: ${desconocidos.join('; ')}`,
    ).toEqual([]);

    // Y los modelos del cliente Prisma que el adaptador toca estan DECLARADOS en el esquema: un
    // modelo nuevo seria un cambio de esquema disfrazado de `prisma.loQueSea`.
    const esquema = leer('db/schema.prisma');
    const modelos = [
      ...new Set(
        [...quitarComentariosTs(leer(ADAPTADOR_DRIVEN)).matchAll(MODELO_DE_PRISMA)].map(
          (encontrado) => encontrado[1] ?? '',
        ),
      ),
    ].filter((modelo) => modelo.length > 0);
    expect(
      modelos.length,
      `${ADAPTADOR_DRIVEN} no usa ningun modelo del cliente Prisma: este caso mide aire`,
    ).toBeGreaterThan(0);
    for (const modelo of modelos) {
      const declarado = `model ${modelo.charAt(0).toUpperCase()}${modelo.slice(1)} `;
      expect(
        esquema,
        `db/schema.prisma no declara \`${declarado.trim()}\`, que ${ADAPTADOR_DRIVEN} usa: R45 y ` +
          'R46 dicen que esta ficha consume el modelo de QC-83, no lo amplia',
      ).toContain(declarado);
    }
  });

  it('R13 — ninguna segunda normalizacion del nombre, y ninguna segunda definicion de «activa»', () => {
    // R13: «DEBE calcular el nombre normalizado con la UNICA definicion de "mismo nombre de grupo"
    // que publica el contrato publico de `identity` (`normalizeWorkGroupName`, QC-83 R3), y NO DEBE
    // declarar ninguna segunda normalizacion ni comparar nombres por su forma original».
    //
    // Y su gemela en el otro eje: R19 manda filtrar por el ESTADO EFECTIVO que resuelve
    // `effectiveAccountStatus` (QC-78 R7), no por la columna. Comparar `'active'` a mano en un
    // archivo de esta feature seria una segunda definicion de «cuenta activa», con dos formas de
    // equivocarse que los tests de T13 cubren desde el otro lado: la fila bloqueada por intentos
    // que sigue diciendo `active` con el plazo vigente, y la `blocked` cuyo plazo ya vencio.

    // ANCLAS POSITIVAS: los dos duenos SI escriben lo que aqui se prohibe copiar.
    expect(
      leer(DUENO_DEL_ESTADO_EFECTIVO),
      `${DUENO_DEL_ESTADO_EFECTIVO} ya no escribe el literal \`'active'\`: el patron mide aire`,
    ).toMatch(LITERAL_ACTIVE);
    const normalizador = quitarComentariosTs(leer(DUENO_DE_LA_NORMALIZACION));
    expect(
      SEGUNDA_NORMALIZACION.some((patron) => patron.test(normalizador)),
      `${DUENO_DE_LA_NORMALIZACION} ya no normaliza el texto: los patrones de R13 miden aire`,
    ).toBe(true);
    // Y la definicion PUBLICA sigue delegando en ese unico normalizador en vez de tener la suya:
    // si `work-group-name.ts` se copiara el `toLowerCase`, ya serian dos.
    expect(
      quitarComentariosTs(leer(DEFINICION_PUBLICA_DEL_NOMBRE)),
      `${DEFINICION_PUBLICA_DEL_NOMBRE} ya no delega en \`normalizeKey\`: la unica definicion de ` +
        '«mismo nombre de grupo» (QC-83 R3) se partio en dos',
    ).toContain('normalizeKey');

    // Y los dos casos de uso que escriben el nombre SI le piden la forma canonica al dueno: si un
    // dia dejaran de importarla, la prohibicion de abajo seria trivialmente cierta y falsa.
    for (const archivo of QUIENES_NORMALIZAN) {
      expect(
        quitarComentariosTs(leer(archivo)),
        `${archivo} ya no usa \`normalizeWorkGroupName\`: o normaliza por su cuenta o no normaliza`,
      ).toContain('normalizeWorkGroupName');
    }

    const hallazgos: string[] = [];
    for (const archivo of ARCHIVOS_NUEVOS_DE_LA_FEATURE) {
      const codigo = quitarComentariosTs(leer(archivo));
      if (LITERAL_ACTIVE.test(codigo)) hallazgos.push(`${archivo}: compara 'active' a mano`);
      for (const patron of SEGUNDA_NORMALIZACION) {
        if (patron.test(codigo)) hallazgos.push(`${archivo}: normaliza por su cuenta (${patron})`);
      }
    }
    expect(
      hallazgos,
      'R13 y R19: «mismo nombre» y «cuenta activa» tienen UNA definicion cada una, y estan en ' +
        `${DUENO_DE_LA_NORMALIZACION} y en ${DUENO_DEL_ESTADO_EFECTIVO}. ` +
        `Declaran una segunda: ${hallazgos.join('; ')}`,
    ).toEqual([]);
  });

  it('R4 — ningun archivo nuevo escribe a mano el nombre de un rol', () => {
    // R4: «La decision de autorizar NO DEBE depender del NOMBRE DEL ROL del actor: ninguna de las
    // siete operaciones lee, recibe ni compara el rol de quien pide, y ningun archivo nuevo de esta
    // ficha incrusta el literal `'Administrador'` ni ningun otro nombre de rol».

    // ANCLA POSITIVA: quien declara las constantes SI escribe los literales.
    const dueno = leer(DUENO_DEL_NOMBRE_DEL_ROL);
    for (const patron of LITERALES_DE_ROL) {
      expect(
        dueno,
        `${DUENO_DEL_NOMBRE_DEL_ROL} deberia declarar ${patron}: es el unico que puede`,
      ).toMatch(patron);
    }
    expect(
      (ARCHIVOS_NUEVOS_DE_LA_FEATURE as readonly string[]).includes(DUENO_DEL_NOMBRE_DEL_ROL),
      'roles.ts no es un archivo de esta feature: es quien declara las constantes de R4',
    ).toBe(false);

    const hallazgos: string[] = [];
    for (const archivo of ARCHIVOS_NUEVOS_DE_LA_FEATURE) {
      const codigo = quitarComentariosTs(leer(archivo));
      for (const patron of LITERALES_DE_ROL) {
        if (patron.test(codigo)) hallazgos.push(`${archivo}: ${patron}`);
      }
    }
    expect(
      hallazgos,
      `R4: autoriza el PERMISO, nunca el nombre del rol. Lo escriben a mano: ${hallazgos.join('; ')}`,
    ).toEqual([]);
  });

  it('R49 — ninguna de las candidatas que design.md > 11 descarto esta instalada', () => {
    // R49: «NO DEBE incorporar ninguna dependencia de terceros nueva». `design.md > 11` lo cierra
    // sin abrir ninguna propuesta -los cuatro checks de salud no llegan a evaluarse- y nombra la
    // unica candidata que podria parecerlo: una libreria de *slug*/normalizacion de texto.
    const manifiesto = JSON.parse(leer('package.json')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const instaladas = {
      ...(manifiesto.dependencies ?? {}),
      ...(manifiesto.devDependencies ?? {}),
    };

    // ANCLA POSITIVA: el manifiesto se leyo de verdad y trae lo que la ficha SI usa (`zod`, R14).
    expect(
      Object.keys(instaladas).length,
      'package.json no declaro ninguna dependencia: no se leyo el manifiesto de verdad',
    ).toBeGreaterThan(10);
    expect(
      Object.keys(instaladas),
      `package.json ya no declara \`${DEPENDENCIA_QUE_SI_ESTA}\`: el borde de R14 sale de ahi y ` +
        'este caso estaria midiendo aire',
    ).toContain(DEPENDENCIA_QUE_SI_ESTA);

    const coladas = CANDIDATAS_DESCARTADAS.filter((nombre) => nombre in instaladas);
    expect(
      coladas,
      'R49 y la regla 7 de CLAUDE.md: `design.md > 11` descarto la normalizacion de terceros por ' +
        'su nombre, y ninguna dependencia entra sin aprobacion humana y su fila en ' +
        `docs/dependencias.md. Estan instaladas: ${coladas.join(', ')}`,
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// FAMILIA B: LOS DETECTORES DE ALCANCE DE RAMA
//
// Los cuatro son funciones PURAS y EXPORTADAS, para poder ejercitarlas con listas SINTETICAS y
// demostrar que muerden sin depender de en que rama corra el gate. Un detector que solo se ejercita
// contra el arbol real no demuestra nunca que pueda fallar.
// ---------------------------------------------------------------------------------------------

/** R46: `db/schema.prisma` es el unico sitio donde se declaran modelos, columnas y tipos. */
export function cambiosDeEsquema(tocados: readonly string[]): readonly string[] {
  return tocados.filter((ruta) => ruta === 'db/schema.prisma');
}

/**
 * R46: CUALQUIER archivo bajo `db/` —migraciones incluidas—. El requisito es literal: «el diff de
 * `db/**` de esta feature DEBE ser VACIO». El modelo entero, sus dos FK compuestas y el indice
 * unico parcial son de QC-83 y estan mergeados.
 */
export function cambiosEnLaBase(tocados: readonly string[]): readonly string[] {
  return tocados.filter((ruta) => ruta.startsWith('db/')).sort();
}

/** R48: nada bajo `app/`, `components/` ni `e2e/` —la pantalla es QC-85—, y tampoco un adaptador
 *  de navegacion o de menu colado dentro de `lib/`, que es el otro camino de escape. */
export function infraccionesDeInterfaz(tocados: readonly string[]): readonly string[] {
  return tocados.filter(
    (ruta) =>
      ruta.startsWith('app/') ||
      ruta.startsWith('components/') ||
      ruta.startsWith('e2e/') ||
      (ruta.startsWith('lib/') && /nav|menu|sidebar|breadcrumb/i.test(ruta)),
  );
}

/** R49: los dos archivos por los que entra una dependencia. */
export function cambiosDeDependencias(tocados: readonly string[]): readonly string[] {
  return tocados.filter((ruta) => ruta === 'package.json' || ruta === 'pnpm-lock.yaml');
}

/**
 * LA PRECONDICION DE RAMA. Los casos de la familia B SOLO aplican en la rama de QC-84: R46, R48 y
 * R49 hablan del alcance de ESTA ficha, no del de las demas. Fuera de su rama quedan MUDOS.
 *
 * La senal es CONJUNTIVA y son DOS, como en `esLaRamaDeQC66()` y `esLaRamaDeQC94()`: el archivo
 * CENTRAL de la ficha —`create-work-group.ts`, ninguna rama implementa QC-84 sin el— mas su carpeta
 * de spec. Con una sola no basta: QC-85 va a consumir los casos de uso legitimamente, y la carpeta
 * de spec discrimina de verdad porque nace y vive dentro del rango de QC-84 y no aparece jamas en
 * el rango de otra ficha, que trae la SUYA.
 *
 * No se usa este archivo de test como senal, justamente porque otras fichas lo enmiendan al chocar
 * con el.
 */
const ARCHIVO_CENTRAL_DE_QC84 = 'lib/modules/identity/domain/create-work-group.ts';
const CARPETA_SPEC_DE_QC84 = 'specs/QC-84-crud-de-grupos-de-trabajo/';

export function esLaRamaDeQC84(tocados: readonly string[]): boolean {
  return (
    tocados.includes(ARCHIVO_CENTRAL_DE_QC84) &&
    tocados.some((ruta) => ruta.startsWith(CARPETA_SPEC_DE_QC84))
  );
}

/** El minimo que necesita un `ctx` de vitest para saltar: asi se puede pasar uno sintetico. */
interface ConSalto {
  readonly skip: (nota: string) => never;
}

/** El salto SINTETICO del ultimo `describe`: una senal propia, para no confundirla con un fallo de
 *  asercion. El `ctx.skip` de vitest tambien lanza, asi que imitarlo es lo que hace falta. */
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
 *   - no es la rama de QC-84 (incluido el diff VACIO, que no trae ninguna de las dos senales)
 *     -> `skipped` diciendo por que;
 *   - es la rama de QC-84 -> el diff, y los casos vigilan.
 *
 * `tocados` se inyecta a proposito para poder ejercitar los desenlaces con una lista sintetica: es
 * la unica forma honesta de probar el caso «diff vacio» sin mergear nada.
 */
function diffOMudo(
  ctx: ConSalto,
  tocados: readonly string[] = archivosTocados(),
): readonly string[] {
  if (!esLaRamaDeQC84(tocados)) {
    ctx.skip(
      tocados.length === 0
        ? 'el diff contra `' +
            RANGO +
            '` esta VACIO (la rama ya esta en el tronco, o el arbol esta limpio sobre `dev`): no ' +
            'hay cambio que revisar, asi que este caso NO ha comprobado nada. Se declara SALTADO ' +
            'y no verde a proposito.'
        : 'el diff no trae a la vez `' +
            ARCHIVO_CENTRAL_DE_QC84 +
            '` y `' +
            CARPETA_SPEC_DE_QC84 +
            '`: esta NO es la rama de QC-84, asi que este caso NO ha comprobado nada. R46, R48 y ' +
            'R49 son el alcance de ESA ficha y no le aplican a ninguna otra.',
    );
  }
  return tocados;
}

describe('el rango git esta disponible: la familia de rama puede mirar de verdad', () => {
  it(`\`${RANGO}\` resuelve; si no, estos casos fallan ruidosamente`, () => {
    // «No puedo mirar» es ROJO y se comprueba aqui, una sola vez. Lo que NO es rojo es «he mirado
    // y esto no es mi rama»: eso se salta, y esa es toda la diferencia.
    expect(() => archivosTocados()).not.toThrow();
  });
});

describe('alcance de QC-84 — EL CAMBIO: lo que esta rama anadio, y solo en su rama', () => {
  it('R46 — db/schema.prisma no esta en el diff de la rama: CERO diff', (ctx) => {
    // R46: «NO DEBE modificar `db/schema.prisma` ni anadir, editar ni revertir ninguna migracion».
    // El modelo entero -`WorkGroup`, `WorkGroupMember`, `name_normalized`, el indice unico parcial
    // y las dos FK compuestas- es de QC-83 y esta mergeado.
    //
    // Esto NO puede ser de contenido: el esquema existe y lo escriben otras fichas. Lo unico
    // afirmable es que ESTA rama no lo movio, que es un hecho del cambio.
    const diff = diffOMudo(ctx);
    expect(
      cambiosDeEsquema(diff),
      'db/schema.prisma esta en el diff, y R46 dice que esta feature no lo toca: el modelo lo ' +
        'aporto QC-83 y esta ficha solo lo consume',
    ).toEqual([]);
  });

  it('R46 — el diff de db/** entero esta VACIO: ninguna migracion, ni nueva ni revertida', (ctx) => {
    // La otra mitad de R46, y es literal: «el diff de `db/**` de esta feature DEBE ser vacio». Una
    // migracion es el unico sitio por el que entraria una columna, un indice, una FK o una fila
    // sembrada. Tampoco puede ser de contenido: el repositorio tiene decenas de migraciones
    // legitimas de otras fichas.
    const diff = diffOMudo(ctx);
    const enLaBase = cambiosEnLaBase(diff);
    expect(
      enLaBase,
      'QC-84 no tiene ninguna migracion y no toca la base: si esta ficha necesita tocar `db/`, ' +
        `algo se entendio mal (Alcance, R46). Esto esta en el diff: ${enLaBase.join(', ')}`,
    ).toEqual([]);
  });

  it('R48 — la rama no anade nada bajo app/, components/ ni e2e/', (ctx) => {
    // R48: «NO DEBE incluir ninguna pantalla, pagina, componente de interfaz ni ruta bajo `app/` o
    // `components/` -van a QC-85-; por lo tanto no aporta ningun flujo navegable que un test E2E
    // pueda visitar, su verificacion es unitaria y de integracion, el E2E se difiere AQUI y CON
    // MOTIVO a QC-85, y los E2E existentes DEBEN seguir pasando sin cambios en su guion».
    //
    // ESTE CASO NO TIENE —NI DEBE TENER— MITAD DE CONTENIDO, y conviene que quede escrito para que
    // nadie lo «complete» manana: «esta ficha no anade pantalla» es un hecho HISTORICO de esta
    // rama, no una propiedad del arbol. QC-85 va a crear su pantalla legitimamente, y una guardia
    // de contenido del tipo «esa carpeta no existe» la bloquearia. Es el error exacto que
    // `tests/unit/unidades/modulo-intacto.test.ts` cometio y tuvo que deshacer.
    //
    // Que `e2e/` este en la lista cubre la segunda mitad de R48: si esta rama tocara el guion de un
    // E2E existente para que siguiera verde, eso seria el cambio que R48 prohibe.
    const diff = diffOMudo(ctx);
    const enLaInterfaz = infraccionesDeInterfaz(diff);
    expect(
      enLaInterfaz,
      'QC-84 es backend puro: la pantalla es QC-85 y el E2E se difiere con motivo (decision 16). ' +
        `Esto esta en el diff: ${enLaInterfaz.join(', ')}`,
    ).toEqual([]);
  });

  it('R49 — package.json ni pnpm-lock.yaml estan en el diff de la rama', (ctx) => {
    // La mitad de rama de R49, complementaria de la de contenido: no solo no entro ninguna de las
    // candidatas descartadas, sino que esta rama no abrio los dos archivos por los que entraria
    // CUALQUIER otra. No puede ser de contenido: `package.json` existe y las demas fichas lo
    // cambian con permiso.
    const diff = diffOMudo(ctx);
    const deDependencias = cambiosDeDependencias(diff);
    expect(
      deDependencias,
      'R49 y la regla 7 de CLAUDE.md: ninguna dependencia entra en esta ficha, y ninguna entra ' +
        `sin aprobacion humana y su fila en docs/dependencias.md. Esto cambio: ${deDependencias.join(', ')}`,
    ).toEqual([]);
  });

  it('R50 — las lineas que esta rama anade al contrato y a la composicion no nombran la asignacion', (ctx) => {
    // El complemento de rama del caso de contenido de R50. `lib/composition/index.ts` y
    // `lib/modules/identity/index.ts` son PREEXISTENTES y los comparten los once modulos y varias
    // fichas: `asignaciones` (QC-86) es la duena de esa tabla y la nombra ahi con pleno derecho.
    // Medirlos enteros acusaria en falso a ese vecino, asi que se mide SOLO lo que esta rama les
    // ANADE, y eso es por definicion una afirmacion sobre el cambio: fuera de la rama queda MUDA.
    diffOMudo(ctx);

    const hallazgos: string[] = [];
    for (const compartido of [COMPOSICION, CONTRATO] as const) {
      const anadidas = lineasAnadidasEn(compartido);
      expect(
        anadidas.length,
        `la rama de QC-84 no anade ninguna linea a ${compartido}, y tiene que anadir el cableado ` +
          'de sus siete casos de uso (design.md > 1, T10): este caso no esta midiendo lo que cree',
      ).toBeGreaterThan(0);

      const codigoAnadido = quitarComentariosTs(anadidas.join('\n'));
      for (const grafia of GRAFIAS_DE_LA_ASIGNACION) {
        if (codigoAnadido.includes(grafia)) hallazgos.push(`${compartido}: ${grafia}`);
      }
    }
    expect(
      hallazgos,
      'R50: esta ficha administra el GRUPO; quien consume el grupo para asignar pedidos es QC-86, ' +
        `y su cableado no se toca desde aqui. Hallado: ${hallazgos.join('; ')}`,
    ).toEqual([]);
  });
});

/**
 * QUE EL SALTO NO VACIE LA GUARDIA (la leccion de MAYOR-1 en `usuarios/scope.test.ts`).
 *
 * Una guardia que se salta siempre no protege nada, y seria peor que el problema que el salto
 * arregla. Estos casos ejercitan las CINCO funciones puras con listas SINTETICAS, sin depender de
 * en que rama corra el gate.
 */
describe('el salto no vacia la guardia: en la rama de QC-84 sigue mordiendo', () => {
  /** El alcance LEGITIMO de esta ficha, en miniatura: las dos senales mas lo que si puede tocar. */
  const RAMA_DE_QC84 = [
    ARCHIVO_CENTRAL_DE_QC84,
    'lib/modules/identity/ports/work-group-repository.ts',
    'lib/modules/identity/adapters/driving/work-group-actions.ts',
    CONTRATO,
    COMPOSICION,
    'specs/QC-84-crud-de-grupos-de-trabajo/requirements.md',
    'tests/unit/identity/grupos/scope.test.ts',
  ];

  it('reconoce la rama de QC-84 por sus DOS senales, y NO reconoce otra', () => {
    expect(esLaRamaDeQC84(RAMA_DE_QC84)).toBe(true);

    // La senal es CONJUNTIVA: con una sola no basta. QC-85 va a consumir `create-work-group.ts`, y
    // cualquier ficha trae SU carpeta de spec.
    expect(esLaRamaDeQC84([ARCHIVO_CENTRAL_DE_QC84])).toBe(false);
    expect(esLaRamaDeQC84(['specs/QC-84-crud-de-grupos-de-trabajo/design.md'])).toBe(false);

    // El diff de otra ficha: QC-85 (la pantalla) consumiendo estos casos de uso y trayendo su spec.
    expect(
      esLaRamaDeQC84([
        'app/(private)/grupos/page.tsx',
        'lib/modules/identity/domain/create-work-group.ts',
        'specs/QC-85-pantalla-de-grupos/requirements.md',
      ]),
    ).toBe(false);
    // Y el de QC-86 (la asignacion), que consume el grupo pero no lo administra.
    expect(
      esLaRamaDeQC84([
        'lib/modules/asignaciones/domain/order-assignment.ts',
        'db/migrations/20260911120000_order_assignments/migration.sql',
        'specs/QC-86-modelo-de-asignacion-de-pedidos/requirements.md',
      ]),
    ).toBe(false);
  });

  it('con el diff VACIO los casos de rama se SALTAN, no fallan', () => {
    // El dia que este PR entre en `dev`, la base de fusion pasa a ser HEAD y el diff queda vacio.
    // Se simula inyectando esa lista vacia en el mismo helper que usan los casos de arriba: si el
    // desenlace fuera un fallo, este `expect` veria un error de asercion en vez del salto.
    expect(esLaRamaDeQC84([])).toBe(false);

    const notas: string[] = [];
    const ctxFalso: ConSalto = {
      skip: (nota: string): never => {
        notas.push(nota);
        throw new SaltoSimulado();
      },
    };

    expect(() => diffOMudo(ctxFalso, [])).toThrow(SaltoSimulado);
    expect(
      notas,
      'con el diff vacio el helper tiene que SALTAR, una vez y diciendo por que',
    ).toHaveLength(1);
    expect(notas[0]).toContain('VACIO');
    expect(notas[0]).toContain('NO ha comprobado nada');

    // Y fuera de la rama de QC-84 —diff con cambios, pero ajenos— tambien salta, con OTRO motivo.
    notas.length = 0;
    expect(() => diffOMudo(ctxFalso, ['app/(private)/grupos/page.tsx'])).toThrow(SaltoSimulado);
    expect(notas[0]).toContain('NO es la rama de QC-84');

    // En cambio, DENTRO de su rama el helper no salta y devuelve el diff entero para que los casos
    // lo midan: el salto no se trago la guardia.
    const devuelto = diffOMudo(ctxFalso, RAMA_DE_QC84);
    expect(devuelto).toEqual(RAMA_DE_QC84);
    expect(notas, 'dentro de su rama el helper NO debe saltar').toHaveLength(1);
  });

  it('los cuatro detectores de rama MUERDEN con listas sinteticas', () => {
    // R46, por sus dos caminos.
    expect(cambiosDeEsquema([...RAMA_DE_QC84, 'db/schema.prisma'])).toEqual(['db/schema.prisma']);
    expect(
      cambiosEnLaBase([
        ...RAMA_DE_QC84,
        'db/migrations/20260912090000_work_groups_extra_column/migration.sql',
      ]),
    ).toEqual(['db/migrations/20260912090000_work_groups_extra_column/migration.sql']);
    // Y cualquier otra cosa bajo `db/` cuenta igual: R46 habla del diff de `db/**` ENTERO.
    expect(cambiosEnLaBase([...RAMA_DE_QC84, 'db/seed.ts'])).toEqual(['db/seed.ts']);

    // R48, por los cuatro caminos: pagina, componente, E2E y adaptador de navegacion en `lib/`.
    expect(infraccionesDeInterfaz([...RAMA_DE_QC84, 'app/(private)/grupos/page.tsx'])).toEqual([
      'app/(private)/grupos/page.tsx',
    ]);
    expect(
      infraccionesDeInterfaz([...RAMA_DE_QC84, 'components/shared/work-groups-table.tsx']),
    ).toEqual(['components/shared/work-groups-table.tsx']);
    expect(infraccionesDeInterfaz([...RAMA_DE_QC84, 'e2e/grupos.spec.ts'])).toEqual([
      'e2e/grupos.spec.ts',
    ]);
    expect(
      infraccionesDeInterfaz([
        ...RAMA_DE_QC84,
        'lib/modules/navegacion/adapters/driving/work-group-menu.ts',
      ]),
    ).toEqual(['lib/modules/navegacion/adapters/driving/work-group-menu.ts']);

    // R49, por los dos archivos.
    expect(cambiosDeDependencias([...RAMA_DE_QC84, 'package.json'])).toEqual(['package.json']);
    expect(cambiosDeDependencias([...RAMA_DE_QC84, 'pnpm-lock.yaml'])).toEqual(['pnpm-lock.yaml']);

    // Y todos ellos siguen mordiendo dentro de la rama, que es donde tienen que morder.
    expect(esLaRamaDeQC84([...RAMA_DE_QC84, 'db/schema.prisma'])).toBe(true);
  });

  it('y ninguno muerde con el alcance legitimo de esta ficha', () => {
    // El alcance de QC-84 completo: los trece archivos de produccion, los dos compartidos que
    // amplia, el catalogo de errores de QC-70, su spec y sus tests. Si alguno de los detectores
    // mordiera aqui, estaria acusando a la ficha de lo que su propio spec le manda hacer.
    const legitimo = [
      ...ARCHIVOS_NUEVOS_DE_LA_FEATURE,
      CONTRATO,
      COMPOSICION,
      'lib/modules/identity/domain/errors.ts',
      'lib/modules/errores/domain/error-catalog.ts',
      'lib/modules/errores/domain/error-codes.ts',
      'specs/QC-84-crud-de-grupos-de-trabajo/tasks.md',
      'tests/unit/identity/grupos/scope.test.ts',
      'tests/integration/identity/work-group-crud.int.test.ts',
      'progress/impl_QC-84-crud-de-grupos-de-trabajo.md',
    ];
    expect(esLaRamaDeQC84(legitimo)).toBe(true);
    expect(cambiosDeEsquema(legitimo)).toEqual([]);
    expect(cambiosEnLaBase(legitimo)).toEqual([]);
    expect(infraccionesDeInterfaz(legitimo)).toEqual([]);
    expect(cambiosDeDependencias(legitimo)).toEqual([]);
  });

  it('el detector de interfaz NO acusa a las Server Actions de esta ficha', () => {
    // `adapters/driving/work-group-actions.ts` esta bajo `lib/` y es legitimo: R48 prohibe la
    // PANTALLA, no la frontera de servidor. Si el patron de navegacion se ensanchara hasta
    // morderlo, este caso lo dice.
    expect(
      infraccionesDeInterfaz(['lib/modules/identity/adapters/driving/work-group-actions.ts']),
    ).toEqual([]);
  });
});
