// QC-74 — Guardia: el catalogo de permisos y sus asignaciones NO son administrables desde la
// aplicacion (R5).
//
// R5 dice que no debe existir ninguna via de aplicacion —Server Action, route handler ni caso de
// uso— que cree, edite o borre un permiso del catalogo (`permissions`) ni una asignacion
// permiso-rol (`role_permissions`): esas dos tablas solo cambian por MIGRACION y por SEED. Es un
// requisito NEGATIVO, y un requisito negativo no lo sostiene ningun test de comportamiento: no se
// puede llamar a la funcion que no existe. Lo unico que puede demostrarlo es un barrido del arbol
// de archivos que afirme que la via sigue sin existir. Sin esta guardia, R5 se cumple hoy por
// casualidad —porque nadie la escribio todavia— y deja de cumplirse el dia que alguien escriba
// `prisma.rolePermission.create(...)` en un `permission-actions.ts`, que compila perfectamente y
// no rompe ni un test.
//
// Sigue la TECNICA de `tests/guards/guard-rol-administrador-unico.test.ts` y de
// `tests/guards/guard-autorizacion-por-permiso.test.ts`: `findRepoRoot`, barrido recursivo del
// codigo de produccion, `stripComments` (linea antes que bloque), funciones puras exportadas,
// patrones DERIVADOS de constantes documentadas y fuentes sinteticos que demuestran que la regla
// dispara Y el caso simetrico que no la viola.
//
// Esta guardia cubre las DOS mitades de R5:
//   1. Que nadie ESCRIBA sobre las tres tablas (barrido de produccion, con una unica exencion).
//   2. Que el CONTRATO no ofrezca por donde hacerlo: ni el puerto del seed declara metodos de
//      modificacion, ni los modulos de negocio exportan un caso de uso que mute permisos.
//
// Lo que esta guardia NO cubre, dicho para que nadie lo suponga: que la migracion y el seed hagan
// lo correcto. Eso lo cubren `tests/guards/guard-permisos-sembrados.test.ts` y los tests del seed.
//
// La tabla `roles` entra con el mismo criterio: el rol de un usuario tambien cuelga de un
// catalogo cerrado que solo cambia por migracion y seed, y la unica escritura de produccion hoy
// es la del mismo adaptador que ya estaba exento.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/** Sube desde este archivo hasta la raiz del repo (la carpeta con `package.json`). */
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

/** Directorios de codigo de PRODUCCION. Se barren en profundidad. */
const PRODUCTION_DIRS = ['lib', 'app', 'components', 'hooks'];

const IGNORED_DIRS = new Set(['node_modules', '.next', '.git', '.prisma', 'dist', '.worktrees']);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

/** Los seis modulos de negocio: el alcance de la comprobacion de contrato sobre barriles y
 * Server Actions. `identity` queda fuera a proposito: es el dueño del catalogo y del seed. */
const BUSINESS_MODULES = ['inventario', 'recetas', 'unidades', 'proveedores', 'pedidos', 'clientes'];

/**
 * Los tres modelos de Prisma que este catalogo declara intocables desde la aplicacion, con el
 * nombre tal cual esta en `db/schema.prisma` (`model Permission` -> tabla `permissions`,
 * `model RolePermission` -> tabla `role_permissions`, `model Role` -> tabla `roles`). El accessor
 * del cliente de Prisma es el nombre del modelo con la primera letra en minuscula, asi que se
 * DERIVA de aqui en vez de escribirse a mano: si el schema renombrara un modelo, el ultimo caso
 * de este archivo lo dice en vez de dejar la guardia vigilando un accessor inexistente (verde por
 * vacuidad).
 */
const PERMISSION_MODELS = ['Permission', 'RolePermission', 'Role'] as const;

/**
 * Los verbos de ESCRITURA del cliente de Prisma: los ocho metodos que crean, modifican o borran
 * filas. La lista es cerrada y esta escrita entera a proposito, porque lo que R5 prohibe es
 * exactamente este conjunto y nada mas.
 *
 * Las LECTURAS (`findFirst`, `findMany`, `findUnique`, `findUniqueOrThrow`, `count`, `aggregate`,
 * `groupBy`) NO son infraccion y no aparecen aqui: `requirePermission` necesita leer el catalogo
 * en cada sesion, y el propio seed lee antes de decidir que crear. Prohibir la lectura dejaria la
 * aplicacion sin poder autorizar.
 *
 * `createManyAndReturn` esta incluido aunque hoy no se use en ningun sitio: es una escritura con
 * otro nombre, y una guardia que solo conoce los metodos que ya se usan es una guardia que se
 * salta el primero que entre.
 */
const PRISMA_WRITE_VERBS = [
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
] as const;

/**
 * Los verbos de escritura que, en el NOMBRE de un export, delatan un caso de uso que muta
 * permisos: `createPermission`, `assignPermissionToRole`, `revokeRolePermission`. Son nombres de
 * negocio, no metodos de Prisma, por eso la lista es distinta de `PRISMA_WRITE_VERBS`.
 * `requirePermission` —el unico export sobre permisos que los modulos de negocio si tienen— no
 * contiene ninguno: leer un permiso para autorizar no es mutarlo.
 */
const EXPORT_WRITE_VERBS = ['create', 'update', 'delete', 'assign', 'revoke', 'grant'] as const;

/**
 * La UNICA exencion, y su razon: `initial-access-repository-prisma.ts` es el adaptador del SEED, o
 * sea la via permitida que R5 nombra junto con la migracion. Es el archivo que ejecuta
 * `createPermissions` y `createRolePermissions` del puerto, y por eso contiene —tiene que
 * contener— `db.permission.createMany` y `db.rolePermission.createMany`.
 *
 * Es una exencion de UN archivo, no de la carpeta ni del modulo: `identity` entero exento dejaria
 * entrar una Server Action de administracion de permisos dentro de `identity` sin que nada avise,
 * que es justo lo que R5 prohibe.
 *
 * La exencion esta ANCLADA en el caso «la exencion sigue siendo necesaria...»: si ese archivo
 * dejara de escribir sobre las dos tablas, la exencion sobra y hay que revisarla (el seed se movio
 * de sitio, y la guardia estaria perdonando a un archivo inocente mientras el culpable nuevo pasa
 * sin mirar).
 */
const EXENTOS = [
  'lib/modules/identity/adapters/driven/persistence/initial-access-repository-prisma.ts',
];

/** El puerto del seed: la otra mitad de R5. Si el contrato no ofrece modificar, nadie modifica. */
const PUERTO_DEL_SEED = 'lib/modules/identity/ports/initial-access-repository.ts';

/** Ruta comparable: separadores POSIX, para que esto corra igual en Windows. */
function toPosix(file: string): string {
  return file.split(sep).join('/');
}

function readDirEntries(dir: string): { name: string; isDirectory: boolean }[] {
  let names: readonly string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names.map((name) => ({ name, isDirectory: statSync(join(dir, name)).isDirectory() }));
}

function listSourceFiles(dir: string): readonly string[] {
  return readDirEntries(dir).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory) {
      return IGNORED_DIRS.has(entry.name) ? [] : listSourceFiles(full);
    }
    return SOURCE_EXTENSIONS.has(extname(entry.name)) ? [full] : [];
  });
}

/**
 * Los comentarios explican; no ejecutan. Se quitan antes de juzgar el codigo — si no, este mismo
 * repo se pondria en rojo por documentacion: el JSDoc del puerto dice «NINGUNO de `upsert`,
 * `update` ni `delete`» y varios archivos explican por que no se escribe el catalogo.
 *
 * **El orden importa: los de LINEA primero, los de BLOQUE despues.** Al reves, un comentario de
 * linea que contenga una apertura de bloque abre un bloque FALSO que se cierra en el siguiente
 * cierre de bloque del archivo (tipicamente el proximo JSDoc) y se traga todo lo que haya en
 * medio, imports incluidos. El caso real esta documentado en `guard-firma-sesion-unica.test.ts` y
 * repetido en `guard-rol-administrador-unico.test.ts`: un comentario de linea con el comodin
 * `app/**` dejaba `middleware.ts` reducido a su `export const config`, y la guardia pasaba en
 * VERDE sin haber mirado el archivo. Quitando primero la linea entera, esa apertura desaparece
 * junto con el comentario que la contiene y nunca llega a abrir nada. No lo "simplifiques" de
 * vuelta: el caso «no se ciega...» de mas abajo vigila exactamente eso.
 */
export function stripComments(source: string): string {
  return source
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/** Una forma prohibida de tocar los permisos, con nombre propio para decirla en el fallo. */
export type ForbiddenWrite = {
  /** Como se nombra en el mensaje de fallo. */
  readonly nombre: string;
  /** El reconocedor. Sin bandera `g`: un regex global guarda `lastIndex` entre llamadas. */
  readonly regex: RegExp;
};

/** El accessor del cliente de Prisma para un modelo: `RolePermission` -> `rolePermission`. */
function prismaAccessor(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

/**
 * Un patron por modelo, DERIVADO de `PERMISSION_MODELS` y `PRISMA_WRITE_VERBS`.
 *
 * El receptor se deja libre (`\.<accessor>\.<verbo>`) y no se ancla a `prisma.`: en este repo el
 * adaptador del seed escribe como `db.permission.createMany` dentro de un `$transaction`, y una
 * guardia que solo mirara `prisma.` no habria visto ni la unica escritura que hoy existe —habria
 * pasado en verde por no saber leer el codigo real—. `tx.`, `client.` o cualquier alias caen
 * igual.
 *
 * El `\b` final es lo que separa lectura de escritura sin dejar huecos: `create` no casa dentro de
 * `createMany` (el motor retrocede y prueba la alternativa larga), y `findMany` no casa con nada.
 * El plural tampoco confunde: `actor.permissions.create` no tiene `.permission.`.
 */
export function buildForbiddenWrites(): readonly ForbiddenWrite[] {
  const verbos = PRISMA_WRITE_VERBS.join('|');
  return PERMISSION_MODELS.map((model) => {
    const accessor = prismaAccessor(model);
    return {
      nombre: `escritura Prisma sobre ${accessor}`,
      regex: new RegExp(`\\.${accessor}\\.(?:${verbos})\\b`),
    };
  });
}

const FORBIDDEN_WRITES = buildForbiddenWrites();

/**
 * El SQL crudo equivalente a las escrituras de Prisma, por si alguien se saltara el cliente:
 * un `INSERT INTO`, `UPDATE` o `DELETE FROM` que nombre una de las tres tablas. Se aplica a las
 * tres y no solo a `roles` porque cuesta lo mismo y hoy ninguna tiene una via de escritura en SQL
 * crudo fuera de la migracion.
 */
const RAW_SQL_WRITE_PATTERN = /(insert\s+into|update|delete\s+from)\s+"?(roles|permissions|role_permissions)"?\b/i;

/** Las escrituras de SQL crudo que aparecen en un fuente ya sin comentarios, una por tabla. */
function findRawSqlWritesInStrippedSource(code: string): readonly string[] {
  const encontradas = new Set<string>();
  for (const match of code.matchAll(new RegExp(RAW_SQL_WRITE_PATTERN.source, 'gi'))) {
    encontradas.add(`escritura SQL sobre ${match[2]}`);
  }
  return [...encontradas];
}

/**
 * Los nombres de las escrituras prohibidas que aparecen en un fuente, ya sin comentarios: las de
 * Prisma y las de SQL crudo.
 *
 * Devuelve los NOMBRES y no un booleano para que el mensaje de fallo pueda decir *que* encontro:
 * tocar el catalogo y tocar las asignaciones se arreglan distinto.
 */
export function findPermissionWritesInSource(source: string): readonly string[] {
  const code = stripComments(source);
  const deLosVerbosDePrisma = FORBIDDEN_WRITES.filter((write) => write.regex.test(code)).map(
    (write) => write.nombre,
  );
  return [...deLosVerbosDePrisma, ...findRawSqlWritesInStrippedSource(code)];
}

/**
 * Archivos `.ts`/`.tsx` sueltos en el PRIMER NIVEL del repositorio (no recursivo): hoy
 * `middleware.ts`, `next.config.ts`, `next-env.d.ts`, `playwright.config.ts` y `prisma.config.ts`.
 */
export function listRootLevelSourceFiles(root: string): readonly string[] {
  return readDirEntries(root)
    .filter((entry) => !entry.isDirectory && SOURCE_EXTENSIONS.has(extname(entry.name)))
    .map((entry) => join(root, entry.name));
}

/**
 * Todo el codigo de produccion barrido: `PRODUCTION_DIRS` en profundidad mas la raiz. `tests/`,
 * `e2e/`, `scripts/` y `db/` quedan fuera: este mismo archivo escribe los patrones prohibidos a
 * proposito, y `db/` es —junto al seed— la via PERMITIDA de R5, asi que barrerla seria poner en
 * rojo exactamente lo que el requisito autoriza.
 */
export function listProductionFiles(root: string): readonly string[] {
  return [
    ...PRODUCTION_DIRS.flatMap((dirName) => listSourceFiles(join(root, dirName))),
    ...listRootLevelSourceFiles(root),
  ];
}

/** Un archivo culpable y las escrituras prohibidas que contiene. */
export type Offense = {
  /** Ruta relativa a la raiz del repo, en POSIX: el archivo que hay que abrir y arreglar. */
  readonly file: string;
  readonly patterns: readonly string[];
};

/** Los archivos de produccion que escriben sobre `permissions` o `role_permissions` (R5). */
export function findPermissionWriteOffenses(root: string): readonly Offense[] {
  return listProductionFiles(root)
    .map((absPath) => ({
      file: toPosix(absPath.slice(root.length + 1)),
      patterns: findPermissionWritesInSource(readFileSync(absPath, 'utf8')),
    }))
    .filter((offense) => offense.patterns.length > 0);
}

/** Formato estable para nombrar al culpable: `ruta (escritura Prisma sobre permission)`. */
function describeOffense(offense: Offense): string {
  return `${offense.file} (${offense.patterns.join(', ')})`;
}

/**
 * Los nombres que un fuente EXPORTA: los de las listas `export { a, b as c }` (quedandose con el
 * alias, que es lo que ve quien importa) y los de las declaraciones exportadas
 * (`export function x`, `export const x`, `export type X`...). `export * from` no aporta nombres
 * legibles aqui, y no hace falta: lo que reexporta ya se barre en su propio archivo.
 */
export function listExportedNames(source: string): readonly string[] {
  const code = stripComments(source);
  const nombres: string[] = [];

  for (const match of code.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const clause of match[1].split(',')) {
      // De `Foo as Bar` interesa `Bar`; de `type Foo`, `Foo`. En ambos casos, el ultimo token.
      const tokens = clause.trim().split(/\s+/).filter(Boolean);
      const last = tokens[tokens.length - 1];
      if (last !== undefined && last !== 'default' && /^[A-Za-z_$][\w$]*$/.test(last)) {
        nombres.push(last);
      }
    }
  }

  const declaracion =
    /export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|var|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g;
  for (const match of code.matchAll(declaracion)) {
    nombres.push(match[1]);
  }

  return nombres;
}

/**
 * `true` si el nombre de un export delata un caso de uso que MUTA permisos: menciona
 * permiso/permission Y lleva un verbo de escritura. El patron se deriva de `EXPORT_WRITE_VERBS`,
 * no se enumera caso a caso.
 *
 * `permis` cubre a la vez `permiso`, `permisos`, `Permission` y `Permissions`, que es como se
 * nombraria esto tanto en castellano como en ingles.
 */
export function isPermissionMutationName(name: string): boolean {
  return (
    /permis/i.test(name) && new RegExp(`(?:${EXPORT_WRITE_VERBS.join('|')})`, 'i').test(name)
  );
}

/**
 * Los archivos de CONTRATO de los cinco modulos de negocio: su barrel y todo lo que cuelga de
 * `adapters/driving/**` (las Server Actions y los route handlers). Son las dos unicas superficies
 * por las que un caso de uso llega a la aplicacion, o sea las dos que R5 nombra.
 */
export function listContractFiles(root: string): readonly string[] {
  return BUSINESS_MODULES.flatMap((moduleName) => {
    const moduleDir = join(root, 'lib', 'modules', moduleName);
    return [
      ...listSourceFiles(join(moduleDir, 'adapters', 'driving')),
      join(moduleDir, 'index.ts'),
    ];
  });
}

/** Un archivo de contrato y los exports suyos que mutarian permisos. */
export type MutationExport = {
  readonly file: string;
  readonly exports: readonly string[];
};

/** Barriles y Server Actions que exponen un caso de uso de mutacion de permisos (R5). */
export function findPermissionMutationExports(root: string): readonly MutationExport[] {
  return listContractFiles(root)
    .map((absPath) => ({
      file: toPosix(absPath.slice(root.length + 1)),
      exports: listExportedNames(readFileSync(absPath, 'utf8')).filter(isPermissionMutationName),
    }))
    .filter((entry) => entry.exports.length > 0);
}

/**
 * Los metodos de modificacion declarados en el fuente de un puerto: cualquier identificador que
 * empiece por `upsert`, `update` o `delete` y este seguido de un parentesis de firma. El puerto
 * del seed no debe tener ninguno (R5): que el contrato no lo ofrezca es lo que hace imposible
 * escribirlo por descuido, incluso desde `identity`.
 */
export function findMutationMethodsInPortSource(source: string): readonly string[] {
  return [...stripComments(source).matchAll(/\b(upsert|update|delete)[A-Za-z0-9_$]*(?=\s*\()/gi)]
    .map((match) => match[0])
    .filter((name, index, all) => all.indexOf(name) === index);
}

describe('guardia — los roles, los permisos y sus asignaciones no son administrables desde la app (R5)', () => {
  it('ningun archivo de produccion escribe sobre roles, permissions ni role_permissions, salvo el adaptador del seed', () => {
    const culpables = findPermissionWriteOffenses(repoRoot).filter(
      (offense) => !EXENTOS.includes(offense.file),
    );

    expect(
      culpables.map(describeOffense),
      culpables.length === 0
        ? undefined
        : 'Estos archivos de produccion escriben sobre el catalogo de roles, el de permisos o ' +
            `sobre las asignaciones permiso-rol: ${culpables.map(describeOffense).join('; ')}. ` +
            'Esto lo prohibe: el catalogo y las asignaciones SOLO cambian por migracion (db/) y ' +
            'por el seed (lib/modules/identity/.../initial-access-repository-prisma.ts). ' +
            'Si hace falta un rol, un permiso o una asignacion nuevos, van al catalogo y al seed ' +
            'de `lib/modules/identity/domain/roles.ts` o `permissions.ts` y, si toca retirar ' +
            'algo, a una migracion con su down.sql — no a una Server Action. Un catalogo ' +
            'editable en caliente convierte el modelo de autorizacion en algo que cualquiera con ' +
            'acceso a la UI puede ampliarse a si mismo.',
    ).toEqual([]);
  });

  // Ancla anti-vacuidad: sin esto, un barrido que no encontrara NADA —una carpeta renombrada, un
  // `PRODUCTION_DIRS` mal escrito— dejaria el caso de arriba en verde sin haber leido un archivo.
  it('el barrido cubre el codigo de produccion entero: los cinco modulos, identity y la raiz', () => {
    const relativos = listProductionFiles(repoRoot).map((absPath) =>
      toPosix(absPath.slice(repoRoot.length + 1)),
    );

    expect(
      relativos.length,
      `El barrido solo encontro ${relativos.length} archivos de produccion. Eran mas de 300 ` +
        'cuando se escribio esta guardia; un numero asi de bajo significa que el recorrido se ' +
        'rompio, no que el codigo adelgazo.',
    ).toBeGreaterThan(200);

    for (const moduleName of [...BUSINESS_MODULES, 'identity']) {
      expect(
        relativos.some((file) => file.startsWith(`lib/modules/${moduleName}/`)),
        `El barrido no encontro ningun archivo en lib/modules/${moduleName}/: estaria pasando en ` +
          'verde sin mirar ese modulo.',
      ).toBe(true);
    }

    // El archivo que hoy contiene la unica escritura tiene que ESTAR en el barrido: se le perdona
    // por la lista de exentos, no por no haberlo mirado.
    expect(relativos).toContain(EXENTOS[0]);

    // Los `.ts` sueltos de la raiz entran; las carpetas que no son produccion, no.
    expect(relativos).toContain('middleware.ts');
    expect(relativos.some((file) => file.startsWith('tests/'))).toBe(false);
    expect(relativos.some((file) => file.startsWith('e2e/'))).toBe(false);
    expect(relativos.some((file) => file.startsWith('scripts/'))).toBe(false);
    expect(relativos.some((file) => file.startsWith('db/'))).toBe(false);
  });

  it('la exencion sigue siendo necesaria: el adaptador del seed es el unico que escribe, y escribe', () => {
    const conEscritura = findPermissionWriteOffenses(repoRoot).map((offense) => offense.file);

    expect(
      conEscritura,
      `${EXENTOS[0]} esta exento porque es el adaptador del SEED: la via permitida junto con la ` +
        'migracion. Si ya no escribe sobre roles, permissions ni role_permissions, la exencion ' +
        'sobra: quitala de EXENTOS y revisa donde se mudo el seed, porque mientras tanto esta ' +
        'guardia estaria perdonando a un archivo inocente.',
    ).toContain(EXENTOS[0]);

    // Y escribe sobre LAS TRES tablas: si perdiera una, el seed dejo de sembrar una parte.
    const delSeed = findPermissionWritesInSource(readFileSync(join(repoRoot, EXENTOS[0]), 'utf8'));
    expect(delSeed).toEqual([
      'escritura Prisma sobre permission',
      'escritura Prisma sobre rolePermission',
      'escritura Prisma sobre role',
    ]);

    // La exencion es de UN archivo, no de la carpeta: cualquier otro archivo de identity que
    // escribiera seguiria siendo culpable.
    expect(conEscritura).toEqual([EXENTOS[0]]);
  });

  // Casos sinteticos: la regla se demuestra sobre fuentes fabricados aqui, para que se vea que
  // dispara ante la infraccion y que NO dispara ante el caso correcto simetrico.
  it('dispara con un permission-actions.ts sintetico que crea una asignacion permiso-rol', () => {
    const accionProhibida = [
      "'use server';",
      '',
      "import { prisma } from '@/lib/shared/prisma';",
      '',
      'export async function assignPermissionToRole(roleId: string, permissionCode: string) {',
      '  return prisma.rolePermission.create({ data: { roleId, permissionCode } });',
      '}',
    ].join('\n');

    expect(findPermissionWritesInSource(accionProhibida)).toEqual([
      'escritura Prisma sobre rolePermission',
    ]);
  });

  it('dispara con un permission-actions.ts sintetico que borra permisos del catalogo', () => {
    const accionProhibida = [
      "'use server';",
      '',
      'export async function deletePermissions(codes: readonly string[]) {',
      '  await prisma.permission.deleteMany({ where: { code: { in: [...codes] } } });',
      '}',
    ].join('\n');

    expect(findPermissionWritesInSource(accionProhibida)).toEqual([
      'escritura Prisma sobre permission',
    ]);

    // Los ocho verbos de escritura caen igual, con cualquier receptor (`prisma`, `db`, `tx`).
    for (const verbo of PRISMA_WRITE_VERBS) {
      expect(
        findPermissionWritesInSource(`await tx.permission.${verbo}({ data });`),
        `el verbo de escritura ${verbo} tiene que caer`,
      ).toEqual(['escritura Prisma sobre permission']);
    }
  });

  it('R27: dispara con un role-actions.ts sintetico que crea un rol', () => {
    const accionProhibida = [
      "'use server';",
      '',
      "import { prisma } from '@/lib/shared/prisma';",
      '',
      'export async function createRole(name: string, description: string) {',
      '  return prisma.role.create({ data: { name, description } });',
      '}',
    ].join('\n');

    expect(findPermissionWritesInSource(accionProhibida)).toEqual(['escritura Prisma sobre role']);

    // Los ocho verbos de escritura caen igual sobre `role`, con cualquier receptor.
    for (const verbo of PRISMA_WRITE_VERBS) {
      expect(
        findPermissionWritesInSource(`await tx.role.${verbo}({ data });`),
        `el verbo de escritura ${verbo} sobre role tiene que caer`,
      ).toEqual(['escritura Prisma sobre role']);
    }
  });

  it('R27: dispara con SQL crudo de escritura sobre roles, permissions o role_permissions', () => {
    expect(
      findPermissionWritesInSource('await tx.$executeRaw`DELETE FROM "roles" WHERE "id" = ${id}`;'),
    ).toEqual(['escritura SQL sobre roles']);
    expect(
      findPermissionWritesInSource(`await tx.$executeRawUnsafe('INSERT INTO "permissions" ("code") VALUES ($1)');`),
    ).toEqual(['escritura SQL sobre permissions']);
    expect(
      findPermissionWritesInSource(`await tx.$executeRawUnsafe('UPDATE role_permissions SET permission_code = $1');`),
    ).toEqual(['escritura SQL sobre role_permissions']);
  });

  it('R27: NO dispara con lecturas sobre role, ni con SQL de lectura sobre roles', () => {
    const soloLectura = [
      'export async function listRoles() {',
      '  const filas = await prisma.role.findMany({ orderBy: { name: "asc" } });',
      '  const uno = await prisma.role.findUniqueOrThrow({ where: { id } });',
      '  const total = await prisma.role.count();',
      '  return { filas, uno, total };',
      '}',
    ].join('\n');

    expect(findPermissionWritesInSource(soloLectura)).toEqual([]);
    expect(findPermissionWritesInSource('const sql = \'SELECT "id", "name" FROM "roles"\';')).toEqual(
      [],
    );

    // El plural tampoco confunde: `actor.roles` es el campo del Actor, no el modelo `Role`.
    expect(findPermissionWritesInSource('const r = actor.roles.create;')).toEqual([]);
  });

  it('NO dispara con un fuente que solo LEE el catalogo de permisos', () => {
    const soloLectura = [
      'export async function listPermissions() {',
      '  const rows = await prisma.permission.findMany({ orderBy: { code: "asc" } });',
      '  const total = await prisma.rolePermission.count();',
      '  const uno = await prisma.permission.findUnique({ where: { code: "x" } });',
      '  const otro = await prisma.rolePermission.findFirst({ where: { roleId: "r" } });',
      '  return { rows, total, uno, otro };',
      '}',
    ].join('\n');

    expect(
      findPermissionWritesInSource(soloLectura),
      'Las lecturas no son una infraccion de R5: `requirePermission` necesita leer el catalogo en ' +
        'cada sesion. Si esto se pone en rojo, la lista de verbos se contamino con un `find*`.',
    ).toEqual([]);

    // El plural tampoco confunde: `actor.permissions` es el campo del Actor, no el modelo.
    expect(findPermissionWritesInSource('const p = actor.permissions.create;')).toEqual([]);
  });

  it('NO dispara con un comentario —de linea o de bloque— que mencione una escritura', () => {
    expect(
      findPermissionWritesInSource('// nadie debe llamar a prisma.permission.create fuera del seed'),
    ).toEqual([]);
    expect(
      findPermissionWritesInSource(
        '/** El seed usa db.permission.createMany y db.rolePermission.createMany. */',
      ),
    ).toEqual([]);
    expect(
      findPermissionWritesInSource('// nadie debe llamar a prisma.role.create fuera del seed'),
    ).toEqual([]);
    expect(
      findPermissionWritesInSource('/** El SQL prohibido seria INSERT INTO "roles" (...). */'),
    ).toEqual([]);
  });

  // Regresion del cegado de stripComments: mismo patron que guard-rol-administrador-unico.test.ts.
  it('no se ciega: un comentario de linea con un comodin `app/` + dos asteriscos NO esconde la escritura que va debajo', () => {
    const cegado = [
      '// las guardias barren app/** con las mismas reglas',
      'await prisma.permission.create({ data: fila });',
      '/** JSDoc posterior que cierra el bloque falso. */',
      'export const otra = 1;',
    ].join('\n');

    expect(
      findPermissionWritesInSource(cegado),
      'stripComments quita los comentarios de LINEA antes que los de BLOQUE. Si alguien invierte ' +
        'ese orden, un comentario de linea que mencione una ruta con comodin se traga el codigo ' +
        'que tenga debajo y esta guardia pasa en verde sin haber mirado el archivo.',
    ).toEqual(['escritura Prisma sobre permission']);

    // Y el mismo fuente sin la linea de comentario da lo mismo: lo que se afirma es que el
    // comentario NO cambia el veredicto, no que el fuente case por casualidad.
    expect(findPermissionWritesInSource(cegado.split('\n').slice(1).join('\n'))).toEqual([
      'escritura Prisma sobre permission',
    ]);
  });

  it('el puerto del seed no declara ningun metodo upsert, update ni delete', () => {
    const source = readFileSync(join(repoRoot, PUERTO_DEL_SEED), 'utf8');
    const mutadores = findMutationMethodsInPortSource(source);

    expect(
      mutadores,
      `${PUERTO_DEL_SEED} declara metodos de modificacion: ${mutadores.join(', ')}. El puerto del ` +
        'seed solo lee y crea (R5, R10): una fila del catalogo que ya existe jamas se pisa, y ' +
        'retirar un permiso es una migracion explicita con su down.sql. Que el contrato no ofrezca ' +
        'por donde modificar es lo que hace imposible modificarlo por descuido.',
    ).toEqual([]);

    // Ancla anti-vacuidad del propio caso: el puerto existe, sigue siendo el del seed y si declara
    // los metodos de creacion que se le permiten. Un archivo vacio tambien daria [].
    expect(source).toContain('createPermissions');
    expect(source).toContain('createRolePermissions');
    expect(findMutationMethodsInPortSource('deletePermission(code: string): Promise<void>;')).toEqual(
      ['deletePermission'],
    );
  });

  it('ningun barrel ni Server Action de los cinco modulos exporta un caso de uso que mute permisos', () => {
    const culpables = findPermissionMutationExports(repoRoot);

    expect(
      culpables.map((entry) => `${entry.file} (${entry.exports.join(', ')})`),
      culpables.length === 0
        ? undefined
        : 'Estos contratos exportan un caso de uso que muta permisos: ' +
            `${culpables.map((entry) => `${entry.file} (${entry.exports.join(', ')})`).join('; ')}. ` +
            'R5 no admite ninguna via de aplicacion —Server Action, route handler ni caso de uso— ' +
            'que cree, edite o borre permisos o asignaciones.',
    ).toEqual([]);

    // Ancla anti-vacuidad: el barrido de contratos encuentra los cinco barriles y las Server
    // Actions, y `listExportedNames` sabe leerlos de verdad (si devolviera [] siempre, el caso de
    // arriba estaria verde por no haber parseado nada).
    const contratos = listContractFiles(repoRoot).map((absPath) =>
      toPosix(absPath.slice(repoRoot.length + 1)),
    );
    for (const moduleName of BUSINESS_MODULES) {
      expect(contratos).toContain(`lib/modules/${moduleName}/index.ts`);
    }
    expect(contratos.filter((file) => file.includes('/adapters/driving/')).length).toBeGreaterThan(4);
    expect(
      listExportedNames(readFileSync(join(repoRoot, 'lib/modules/pedidos/index.ts'), 'utf8')),
    ).toContain('requirePermission');
  });

  it('el nombre de un export delata la mutacion solo si lleva permiso Y un verbo de escritura', () => {
    // Dispara: las formas en que se llamaria una administracion de permisos.
    expect(isPermissionMutationName('createPermission')).toBe(true);
    expect(isPermissionMutationName('assignPermissionToRole')).toBe(true);
    expect(isPermissionMutationName('revokeRolePermission')).toBe(true);
    expect(isPermissionMutationName('grantPermisoAction')).toBe(true);
    expect(isPermissionMutationName('deletePermisos')).toBe(true);

    // Limite conocido, dicho en voz alta: los verbos de EXPORT_WRITE_VERBS son los ingleses, que
    // es como se nombran los casos de uso en este repo (`createOrder`, `updateRecipe`). Un export
    // llamado `borrarPermisoDelCatalogo` no lo caza ESTE caso... pero su implementacion si cae en
    // el barrido de escrituras de Prisma de mas arriba, que no depende de como se llame nada. Las
    // dos mitades juntas son la red; ninguna sola.
    expect(isPermissionMutationName('borrarPermisoDelCatalogo')).toBe(false);
    expect(
      findPermissionWritesInSource(
        [
          'export async function borrarPermisoDelCatalogo(code: string) {',
          '  await prisma.permission.delete({ where: { code } });',
          '}',
        ].join('\n'),
      ),
    ).toEqual(['escritura Prisma sobre permission']);

    // NO dispara: leer un permiso para autorizar no es mutarlo, y crear un pedido tampoco.
    expect(isPermissionMutationName('requirePermission')).toBe(false);
    expect(isPermissionMutationName('PermissionCode')).toBe(false);
    expect(isPermissionMutationName('createOrder')).toBe(false);

    // Y `listExportedNames` extrae el nombre por el que se importa: el alias, no el original.
    const barrelSintetico = [
      "export { createPermission as grantPermission } from './domain/create-permission';",
      "export type { PermissionCode } from './domain/permissions';",
      'export async function assignPermissionToRole() {}',
    ].join('\n');
    expect(listExportedNames(barrelSintetico)).toEqual([
      'grantPermission',
      'PermissionCode',
      'assignPermissionToRole',
    ]);
    expect(listExportedNames(barrelSintetico).filter(isPermissionMutationName)).toEqual([
      'grantPermission',
      'assignPermissionToRole',
    ]);
  });

  // Ancla de las constantes: si el schema renombrara los modelos, el patron derivado dejaria de
  // corresponder a nada y esta guardia quedaria verde por vacuidad. Este caso lo dice.
  it('los modelos y los verbos se derivan de constantes documentadas que siguen existiendo', () => {
    const schema = readFileSync(join(repoRoot, 'db', 'schema.prisma'), 'utf8');
    for (const model of PERMISSION_MODELS) {
      expect(
        new RegExp(`^model ${model} \\{`, 'm').test(schema),
        `db/schema.prisma ya no declara \`model ${model}\`. PERMISSION_MODELS quedo desactualizado ` +
          'y esta guardia esta vigilando un accessor de Prisma que no existe.',
      ).toBe(true);
    }

    expect(buildForbiddenWrites().map((write) => write.nombre)).toEqual([
      'escritura Prisma sobre permission',
      'escritura Prisma sobre rolePermission',
      'escritura Prisma sobre role',
    ]);

    // Ningun patron lleva la bandera `g`: un regex global guarda `lastIndex` entre llamadas y haria
    // que el mismo fuente diera veredictos distintos segun el orden de los archivos barridos.
    for (const write of buildForbiddenWrites()) {
      expect(write.regex.global, `el patron ${write.nombre} no debe ser global`).toBe(false);
    }
    expect(RAW_SQL_WRITE_PATTERN.global, 'el patron de SQL crudo no debe ser global').toBe(false);

    // Las lecturas NO estan en la lista de verbos: es la mitad del contrato de esta guardia.
    for (const lectura of ['findFirst', 'findMany', 'findUnique', 'count']) {
      expect(PRISMA_WRITE_VERBS).not.toContain(lectura);
    }
  });
});
