// T16 (QC-74) — Guardia: ningun servicio de negocio autoriza por nombre de rol (R20, R21).
//
// QC-74 movio los cinco modulos de negocio (`inventario`, `recetas`, `unidades`, `proveedores`,
// `pedidos`) de «el actor es Administrador» a `requirePermission(actor, codigo)`, y les quito el
// campo `roleName` del `Actor` (R18). El typecheck sostiene ESE estado —hoy `Actor` no tiene
// `roleName`, asi que leerlo no compila—, pero no sostiene la REGLA: nada impide que el proximo
// modulo, o el proximo caso de uso de estos cinco, vuelva a añadir `roleName` a su propio `Actor`,
// compare `'Administrador'` a mano o importe `ROLE_ADMINISTRADOR` del barrel de `identity`. Todo eso
// compila perfectamente y reintroduce en silencio la deuda que esta ficha acaba de pagar. Esta
// guardia es la unica red para ese caso (R20).
//
// Es la hermana de `tests/guards/guard-permisos-sembrados.test.ts` (R19) y sigue el patron de
// `tests/guards/guard-rol-administrador-unico.test.ts`, que es el precedente exacto de la TECNICA:
// `findRepoRoot`, barrido del arbol de archivos de produccion, `stripComments`, funciones puras
// exportadas, patron DERIVADO del dato real y nunca escrito a mano (R21), y fuentes sinteticos que
// demuestran que la regla dispara Y el caso simetrico que no la viola.
//
// Diferencia con ese precedente: alli se vigila que el literal del rol tenga UN SOLO dueño en todo
// el codigo de produccion; aqui se vigila que los CINCO MODULOS DE NEGOCIO no autoricen por rol de
// ninguna de las formas conocidas. Por eso el barrido es mas estrecho y la lista de patrones, mas
// ancha.
//
// Lo que esta guardia NO cubre, dicho para que nadie lo suponga (`design.md > 6.2`): que el permiso
// exigido en cada caso de uso sea *el correcto* (R16). Eso no es analizable por texto; lo cubren los
// tests de autorizacion por caso de uso.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ROLE_ADMINISTRADOR,
  ROLE_EMPACADOR,
  ROLE_MAESTRO,
  ROLE_OPERADOR,
} from '@/lib/modules/identity';

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

/**
 * Los seis modulos de negocio: el alcance EXACTO de R18 y R20. Se barren en profundidad.
 *
 * El barrido es a proposito mas estrecho que el de `guard-rol-administrador-unico.test.ts` (que
 * recorre `lib`, `app`, `components`, `hooks` y la raiz). Las exenciones de `design.md > 6.2` no se
 * implementan como una lista de perdones sobre un barrido ancho —una lista de perdones se convierte
 * en un colador— sino eligiendo el alcance: todo lo que no esta aqui esta fuera por construccion.
 * Cada cosa que queda fuera, con su razon:
 *
 * - `lib/modules/identity/**` — el nombre del rol es SUYO: lo declara (`roles.ts`), lo siembra
 *   (`SEED_ROLES`), lo firma en la cookie y lo muestra en la cabecera. Prohibirle `roleName` a
 *   `identity` seria prohibirle su propio dominio.
 * - `lib/composition/**` y `middleware.ts` — cableado, no logica de negocio. `middleware.ts` es un
 *   cascaron que reexporta el handler de `identity`.
 * - `tests/`, `e2e/`, `scripts/`, `db/` — mencionan los nombres de rol A PROPOSITO: este mismo
 *   archivo los escribe, los tests de autorizacion construyen actores, el seed los siembra.
 *
 * **QC-75 se llevo el corte de rutas por rol**: la lista ruta->rol ya no existe, el middleware ya
 * no lee `claims.roleName` y ninguna decision del borde depende del rol (R16). Aqui eso solo
 * significa que dos anclas viejas —las que exigian que ese archivo y ese middleware SIGUIERAN
 * nombrando el rol— se retiraron. El barrido, los cinco modulos de negocio y los patrones no
 * cambian: lo que esta guardia vigila es el servicio, y eso sigue igual.
 *
 * La exencion de `identity` tiene ancla mas abajo («la exencion de identity es la declarada...»):
 * si dejara de contener lo que se le perdona, la exencion sobra y hay que revisarla.
 *
 * **AMPLIADO 2026-09-13 por QC-87 (T13): `asignaciones` es el SEXTO.** Eran cinco desde QC-74.
 * QC-86 creo el modulo con solo dos tipos y sin ninguna operacion, asi que no habia nada que
 * autorizar; QC-87 estrena sus cuatro casos de uso y con ellos `asignaciones.modificar` (su R1).
 * Sin esta linea el modulo nuevo quedaria FUERA del barrido y la guardia pasaria en verde sin
 * mirarlo, que es justo el agujero que el caso «el barrido encuentra los seis modulos» vigila.
 */
const BUSINESS_MODULES = ['inventario', 'recetas', 'unidades', 'proveedores', 'pedidos', 'asignaciones', 'clientes'];

const IGNORED_DIRS = new Set(['node_modules', '.next', '.git', '.prisma', 'dist', '.worktrees']);

/**
 * `design.md > 6.2` dice «los archivos `.ts`», y hoy no hay ni un `.tsx` bajo estos seis modulos
 * (son dominio, puertos y adaptadores: no tienen JSX). Se incluye `.tsx` igualmente porque un
 * componente que apareciera ahi caeria bajo exactamente la misma regla, y ampliar el barrido no
 * puede debilitarlo.
 */
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

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
 * Los comentarios explican; no ejecutan. Se quitan antes de juzgar el codigo — si no, la prosa de un
 * `errors.ts` que dice «actor sin rol Administrador» (que existe hoy, literalmente, en
 * `lib/modules/inventario/domain/errors.ts` y en `lib/modules/pedidos/domain/errors.ts`) pondria la
 * guardia en rojo por documentar su propia historia.
 *
 * **El orden importa: los de LINEA primero, los de BLOQUE despues.** Al reves, un comentario de
 * linea que contenga una apertura de bloque abre un bloque FALSO que se cierra en el siguiente
 * cierre de bloque del archivo (tipicamente el proximo JSDoc) y se traga todo lo que haya en medio,
 * imports incluidos. El caso real esta documentado en `guard-firma-sesion-unica.test.ts` y repetido
 * en `guard-rol-administrador-unico.test.ts`: un comentario de linea con el comodin `app/**` dejaba
 * `middleware.ts` reducido a su `export const config`, y la guardia pasaba en VERDE sin haber mirado
 * el archivo. Quitando primero la linea entera, esa apertura desaparece junto con el comentario que
 * la contiene y nunca llega a abrir nada. No lo "simplifiques" de vuelta: el caso «no se ciega...»
 * de mas abajo vigila exactamente eso.
 */
export function stripComments(source: string): string {
  return source
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/** Escapa metacaracteres de regex, para que el patron derivado sea correcto sea cual sea el valor. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Una forma prohibida de autorizar, con nombre propio para poder decirla en el mensaje de fallo. */
export type ForbiddenPattern = {
  /** Como se nombra en el mensaje de fallo. */
  readonly nombre: string;
  /** El reconocedor. Sin bandera `g`: un regex global guarda `lastIndex` entre llamadas. */
  readonly regex: RegExp;
};

/**
 * Las tres familias de infraccion de R20, todas DERIVADAS del dato real (R21).
 *
 * Los literales se construyen desde `ROLE_ADMINISTRADOR` y `ROLE_OPERADOR` importados del barrel de
 * `identity`, nunca escribiendo `"'Administrador'"` a mano. Escribirlo a mano tenia dos agujeros ya
 * medidos y documentados en `guard-rol-administrador-unico.test.ts`: (a) buscar solo la comilla
 * simple deja pasar la doble y el backtick, y ninguna regla de lint obliga a una comilla concreta;
 * y (b) si `identity` renombrara el rol, la guardia seguiria vigilando un nombre inexistente y
 * quedaria VERDE POR VACUIDAD.
 *
 * Las tres familias:
 *
 * 1. El literal del rol entre comillas — la comparacion a mano, la peor version.
 * 2. Los identificadores `ROLE_ADMINISTRADOR`, `ROLE_OPERADOR`, `ROLE_EMPACADOR`, `ROLE_MAESTRO`,
 *    `assertAdminRole` y `requireAdmin` — autorizar por rol importando la constante o una
 *    comprobacion «es Administrador» hecha a mano. Compila y es exactamente lo que esta guardia prohibe.
 * 3. El identificador `roleName` — el campo que R18 saca del `Actor` de estos seis modulos. Que hoy
 *    no compile es una casualidad del tipo actual, no una regla: quien lo reintroduzca en su `Actor`
 *    lo hara compilar de nuevo.
 *
 * `ROLE_EMPACADOR` y su literal entran con el mismo criterio: la diferencia entre el Empacador y el
 * Operador es solo el conjunto de permisos sembrado, asi que compararlos por nombre o importar su
 * constante en un modulo de negocio es la misma deuda que esta guardia ya vigila para los otros dos.
 *
 * `ROLE_MAESTRO` y su literal, igual: lo que el Maestro puede hacer lo dicen sus permisos, y un
 * modulo de negocio que lo reconociera por su nombre se saltaria esa ruta.
 */
export function buildForbiddenPatterns(): readonly ForbiddenPattern[] {
  const literal = (role: string) => new RegExp(`['"\`]${escapeRegExp(role)}['"\`]`);
  return [
    { nombre: `literal del rol ${ROLE_ADMINISTRADOR}`, regex: literal(ROLE_ADMINISTRADOR) },
    { nombre: `literal del rol ${ROLE_OPERADOR}`, regex: literal(ROLE_OPERADOR) },
    { nombre: `literal del rol ${ROLE_EMPACADOR}`, regex: literal(ROLE_EMPACADOR) },
    { nombre: `literal del rol ${ROLE_MAESTRO}`, regex: literal(ROLE_MAESTRO) },
    { nombre: 'ROLE_ADMINISTRADOR', regex: /\bROLE_ADMINISTRADOR\b/ },
    { nombre: 'ROLE_OPERADOR', regex: /\bROLE_OPERADOR\b/ },
    { nombre: 'ROLE_EMPACADOR', regex: /\bROLE_EMPACADOR\b/ },
    { nombre: 'ROLE_MAESTRO', regex: /\bROLE_MAESTRO\b/ },
    { nombre: 'assertAdminRole', regex: /\bassertAdminRole\b/ },
    { nombre: 'requireAdmin', regex: /\brequireAdmin\b/ },
    { nombre: 'roleName', regex: /\broleName\b/ },
  ];
}

const FORBIDDEN_PATTERNS = buildForbiddenPatterns();

/**
 * Los nombres de las formas prohibidas que aparecen en un fuente, ya sin comentarios.
 *
 * Devuelve los NOMBRES y no un booleano para que el mensaje de fallo pueda decir *que* encontro en
 * cada archivo: «roleName» y «literal del rol Administrador» se arreglan distinto.
 */
export function findForbiddenPatternsInSource(source: string): readonly string[] {
  const code = stripComments(source);
  return FORBIDDEN_PATTERNS.filter((pattern) => pattern.regex.test(code)).map(
    (pattern) => pattern.nombre,
  );
}

/** Todos los `.ts`/`.tsx` de los seis modulos de negocio (rutas absolutas). */
export function listBusinessModuleFiles(root: string): readonly string[] {
  return BUSINESS_MODULES.flatMap((moduleName) =>
    listSourceFiles(join(root, 'lib', 'modules', moduleName)),
  );
}

/** Un archivo culpable y las formas prohibidas que contiene. */
export type Offense = {
  /** Ruta relativa a la raiz del repo, en POSIX: el archivo que hay que abrir y arreglar. */
  readonly file: string;
  readonly patterns: readonly string[];
};

/** Los archivos de los seis modulos de negocio que autorizan (o pueden autorizar) por rol (R20). */
export function findRoleAuthorizationOffenses(root: string): readonly Offense[] {
  return listBusinessModuleFiles(root)
    .map((absPath) => ({
      file: toPosix(absPath.slice(root.length + 1)),
      patterns: findForbiddenPatternsInSource(readFileSync(absPath, 'utf8')),
    }))
    .filter((offense) => offense.patterns.length > 0);
}

/** Formato estable para nombrar al culpable: `lib/modules/pedidos/domain/actor.ts (roleName)`. */
function describeOffense(offense: Offense): string {
  return `${offense.file} (${offense.patterns.join(', ')})`;
}

describe('guardia — ningun servicio de negocio autoriza por nombre de rol (R20, R21)', () => {
  it('ningun archivo de los seis modulos de negocio usa el rol para autorizar', () => {
    const culpables = findRoleAuthorizationOffenses(repoRoot);

    expect(
      culpables.map(describeOffense),
      culpables.length === 0
        ? undefined
        : 'Estos archivos de los modulos de negocio autorizan por nombre de rol: ' +
            `${culpables.map(describeOffense).join('; ')}. ` +
            'Los seis modulos autorizan por PERMISO (R12, R18): usa ' +
            '`requirePermission(actor, <codigo>)` del `actor.ts` del propio modulo y deja el ' +
            '`Actor` como `{ id, permissions }`. El nombre del rol es de `identity`; un modulo de ' +
            'negocio que lo lea vuelve a atar la autorizacion a un rol concreto y deja el modelo ' +
            'de permisos sin efecto.',
    ).toEqual([]);
  });

  // Ancla anti-vacuidad: sin esto, un barrido que no encontrara NINGUN archivo —una carpeta
  // renombrada, un `BUSINESS_MODULES` mal escrito— dejaria el caso de arriba en verde sin haber
  // leido nada.
  it('el barrido encuentra los seis modulos y una cantidad razonable de archivos', () => {
    const relativos = listBusinessModuleFiles(repoRoot).map((absPath) =>
      toPosix(absPath.slice(repoRoot.length + 1)),
    );

    for (const moduleName of BUSINESS_MODULES) {
      const delModulo = relativos.filter((file) =>
        file.startsWith(`lib/modules/${moduleName}/`),
      );
      expect(
        delModulo.length,
        `El barrido no encontro ningun archivo en lib/modules/${moduleName}/. ` +
          'O el modulo se renombro, o BUSINESS_MODULES quedo desactualizado: en cualquiera de los ' +
          'dos casos esta guardia estaria pasando en verde sin mirar ese modulo.',
      ).toBeGreaterThan(0);
    }

    expect(
      relativos.length,
      `El barrido solo encontro ${relativos.length} archivos en los seis modulos de negocio. ` +
        'Eran mas de cien cuando se escribio esta guardia; un numero asi de bajo significa que el ' +
        'recorrido se rompio, no que el codigo adelgazo.',
    ).toBeGreaterThan(80);

    // Los cinco `actor.ts` —el archivo donde vive la decision de autorizacion de cada modulo— son
    // los que esta guardia existe para vigilar. Si alguno no entrara al barrido, sobraria la guardia.
    for (const moduleName of BUSINESS_MODULES) {
      expect(relativos).toContain(`lib/modules/${moduleName}/domain/actor.ts`);
    }
  });

  // Ancla de la exencion (`design.md > 6.2`): `identity` queda fuera del barrido porque el nombre
  // del rol es suyo a proposito. Si dejara de contener lo que se le perdona, la exencion sobra.
  it('la exencion de identity es la declarada: sigue siendo el dueño del literal del rol', () => {
    const leer = (file: string) => readFileSync(join(repoRoot, file), 'utf8');

    // `identity` es el dueño del nombre del rol: lo declara en `roles.ts`, y desde QC-75 ese es el
    // UNICO archivo de produccion que lo escribe (lo vigila `guard-rol-administrador-unico`).
    expect(findForbiddenPatternsInSource(leer('lib/modules/identity/domain/roles.ts'))).toContain(
      `literal del rol ${ROLE_ADMINISTRADOR}`,
    );

    // Y ninguno de esos archivos entra al barrido: la exencion es por ALCANCE, no por lista de
    // perdones sobre un barrido ancho.
    const barridos = listBusinessModuleFiles(repoRoot).map((absPath) =>
      toPosix(absPath.slice(repoRoot.length + 1)),
    );
    expect(barridos.some((file) => file.startsWith('lib/modules/identity/'))).toBe(false);
    expect(barridos.some((file) => file.startsWith('lib/composition/'))).toBe(false);
    expect(barridos.some((file) => file.startsWith('tests/'))).toBe(false);
    expect(barridos.some((file) => file.startsWith('e2e/'))).toBe(false);
    expect(barridos.some((file) => file.startsWith('scripts/'))).toBe(false);
    expect(barridos.some((file) => file.startsWith('db/'))).toBe(false);
    expect(barridos).not.toContain('middleware.ts');
  });

  // Casos sinteticos (R21): la regla se demuestra sobre fuentes fabricados aqui, para que se vea que
  // dispara ante cada forma de la infraccion y que NO dispara ante el caso correcto simetrico.
  it('dispara con un actor.ts sintetico que vuelve a poner roleName en el Actor', () => {
    const actorConRol = [
      "import { UnauthorizedError } from './errors';",
      '',
      'export type Actor = {',
      '  readonly id: string;',
      '  readonly roleName: string | null;',
      '};',
    ].join('\n');

    expect(findForbiddenPatternsInSource(actorConRol)).toEqual(['roleName']);
  });

  it('dispara con un actor.ts sintetico que compara el literal del rol, con cualquiera de las tres comillas', () => {
    const conLiteral = (comilla: string) =>
      [
        'export function requireAdministrador(actor: Actor): void {',
        `  if (actor.role !== ${comilla}${ROLE_ADMINISTRADOR}${comilla}) throw new UnauthorizedError();`,
        '}',
      ].join('\n');

    // Comilla simple, doble y backtick: los tres agujeros que una comparacion escrita a mano deja
    // abiertos, porque ninguna regla de lint obliga a una comilla concreta.
    expect(findForbiddenPatternsInSource(conLiteral("'"))).toEqual([
      `literal del rol ${ROLE_ADMINISTRADOR}`,
    ]);
    expect(findForbiddenPatternsInSource(conLiteral('"'))).toEqual([
      `literal del rol ${ROLE_ADMINISTRADOR}`,
    ]);
    expect(findForbiddenPatternsInSource(conLiteral('`'))).toEqual([
      `literal del rol ${ROLE_ADMINISTRADOR}`,
    ]);

    // El rol Operador vale igual: autorizar por «no es Operador» es autorizar por rol.
    expect(findForbiddenPatternsInSource(`const x = '${ROLE_OPERADOR}';`)).toEqual([
      `literal del rol ${ROLE_OPERADOR}`,
    ]);
  });

  it('dispara con la comprobacion «es Administrador» heredada de QC-54, importada o envuelta', () => {
    const heredado = [
      "import { assertAdminRole, ROLE_ADMINISTRADOR } from '@/lib/modules/identity';",
      '',
      'export function requireAdmin(actor: Actor | null | undefined): asserts actor is Actor {',
      '  assertAdminRole(actor, () => new UnauthorizedError());',
      '}',
    ].join('\n');

    expect(findForbiddenPatternsInSource(heredado)).toEqual([
      'ROLE_ADMINISTRADOR',
      'assertAdminRole',
      'requireAdmin',
    ]);
  });

  it('NO dispara con el actor.ts REAL de cada modulo, que autoriza por permiso', () => {
    // El caso simetrico se toma del disco, no de una copia: si `requirePermission` volviera a
    // llamarse `requireAdmin`, este caso tiene que enterarse.
    for (const moduleName of BUSINESS_MODULES) {
      const file = `lib/modules/${moduleName}/domain/actor.ts`;
      const source = readFileSync(join(repoRoot, file), 'utf8');

      expect(findForbiddenPatternsInSource(source), `${file} no deberia autorizar por rol`).toEqual(
        [],
      );
      // Y que ademas autorice por permiso, para que el verde no sea el de un archivo vacio.
      expect(source).toContain('requirePermission');
      expect(source).toContain('permissions');
    }
  });

  it('NO dispara con un comentario —de linea o de bloque— que mencione el rol', () => {
    // La prosa que explica de donde viene el codigo no es una infraccion. Hoy mismo
    // `lib/modules/inventario/domain/errors.ts` dice «actor sin rol Administrador» en un JSDoc y
    // `lib/modules/pedidos/domain/errors.ts` nombra `ROLE_ADMINISTRADOR` en otro: sin esto, la
    // guardia estaria en rojo desde el primer dia por documentacion.
    expect(
      findForbiddenPatternsInSource(`// antes esto comparaba con '${ROLE_ADMINISTRADOR}'`),
    ).toEqual([]);
    expect(
      findForbiddenPatternsInSource(
        `/** R2, R3: actor ausente, o con rol distinto de ${ROLE_ADMINISTRADOR}. Ya no se usa roleName. */`,
      ),
    ).toEqual([]);
    expect(
      findForbiddenPatternsInSource(
        ['/**', ' * Historia: aqui vivia requireAdmin/assertAdminRole (QC-54).', ' */'].join('\n'),
      ),
    ).toEqual([]);
  });

  // Regresion del cegado de stripComments: mismo patron que guard-rol-administrador-unico.test.ts.
  it('no se ciega: un comentario de linea con un comodin `app/` + dos asteriscos NO esconde la infraccion que va debajo', () => {
    const cegado = [
      '// las guardias barren app/** con las mismas reglas (R19)',
      "export const rolBueno = 'Administrador';",
      '/** JSDoc posterior que cierra el bloque falso. */',
      'export const otra = 1;',
    ].join('\n');

    expect(
      findForbiddenPatternsInSource(cegado),
      'stripComments quita los comentarios de LINEA antes que los de BLOQUE. Si alguien invierte ' +
        'ese orden, un comentario de linea que mencione una ruta con comodin se traga el codigo ' +
        'que tenga debajo y esta guardia pasa en verde sin haber mirado el archivo.',
    ).toEqual([`literal del rol ${ROLE_ADMINISTRADOR}`]);

    // Y el mismo fuente sin la linea de comentario tiene que dar lo mismo: lo que se afirma es que
    // el comentario NO cambia el veredicto, no que el fuente case por casualidad.
    expect(findForbiddenPatternsInSource(cegado.split('\n').slice(1).join('\n'))).toEqual([
      `literal del rol ${ROLE_ADMINISTRADOR}`,
    ]);
  });

  // Ancla del valor (R21): si `identity` renombrara los roles, el patron derivado cambia con el, y
  // este caso lo dice en vez de dejar la guardia vigilando un nombre inexistente.
  it('QC-161 R16: los patrones se derivan de los roles reales de identity, que siguen siendo Administrador, Operador, Empacador y Maestro', () => {
    expect(ROLE_ADMINISTRADOR).toBe('Administrador');
    expect(ROLE_OPERADOR).toBe('Operador');
    expect(ROLE_EMPACADOR).toBe('Empacador');
    expect(ROLE_MAESTRO).toBe('Maestro');

    const nombres = buildForbiddenPatterns().map((pattern) => pattern.nombre);
    expect(nombres).toEqual([
      'literal del rol Administrador',
      'literal del rol Operador',
      'literal del rol Empacador',
      'literal del rol Maestro',
      'ROLE_ADMINISTRADOR',
      'ROLE_OPERADOR',
      'ROLE_EMPACADOR',
      'ROLE_MAESTRO',
      'assertAdminRole',
      'requireAdmin',
      'roleName',
    ]);

    // Ningun patron lleva la bandera `g`: un regex global guarda `lastIndex` entre llamadas y haria
    // que el mismo fuente diera veredictos distintos segun el orden de los archivos barridos.
    for (const pattern of buildForbiddenPatterns()) {
      expect(pattern.regex.global, `el patron ${pattern.nombre} no debe ser global`).toBe(false);
    }
  });

  // Casos sinteticos propios del rol Empacador, misma tecnica que los de Administrador/Operador de
  // mas arriba: la regla dispara con el literal Y con la constante, y no dispara con el literal
  // dentro de un comentario.
  it('QC-144 R11: dispara con un actor.ts sintetico que compara el literal del rol Empacador', () => {
    const conLiteral = (comilla: string) =>
      [
        'export function requireEmpacador(actor: Actor): void {',
        `  if (actor.role !== ${comilla}${ROLE_EMPACADOR}${comilla}) throw new UnauthorizedError();`,
        '}',
      ].join('\n');

    expect(findForbiddenPatternsInSource(conLiteral("'"))).toEqual([
      `literal del rol ${ROLE_EMPACADOR}`,
    ]);
    expect(findForbiddenPatternsInSource(conLiteral('"'))).toEqual([
      `literal del rol ${ROLE_EMPACADOR}`,
    ]);
    expect(findForbiddenPatternsInSource(conLiteral('`'))).toEqual([
      `literal del rol ${ROLE_EMPACADOR}`,
    ]);
  });

  it('QC-144 R11: dispara con un actor.ts sintetico que importa y usa ROLE_EMPACADOR', () => {
    const conConstante = [
      "import { ROLE_EMPACADOR } from '@/lib/modules/identity';",
      '',
      'export function requireEmpacador(actor: Actor): void {',
      '  if (actor.role !== ROLE_EMPACADOR) throw new UnauthorizedError();',
      '}',
    ].join('\n');

    expect(findForbiddenPatternsInSource(conConstante)).toEqual(['ROLE_EMPACADOR']);
  });

  it('QC-144 R11: el caso simetrico — el literal del rol Empacador dentro de un comentario NO dispara', () => {
    expect(
      findForbiddenPatternsInSource(`// el Empacador hereda la pantalla del Operador, no compara '${ROLE_EMPACADOR}'`),
    ).toEqual([]);
    expect(
      findForbiddenPatternsInSource(`/** ROLE_EMPACADOR se importa del barrel, no se compara por rol */`),
    ).toEqual([]);
  });

  // Casos sinteticos del rol Maestro, misma tecnica que los del Empacador.
  it('QC-161 R16: dispara con un actor.ts sintetico que compara el literal del rol Maestro', () => {
    const conLiteral = (comilla: string) =>
      [
        'export function requireMaestro(actor: Actor): void {',
        `  if (actor.role !== ${comilla}${ROLE_MAESTRO}${comilla}) throw new UnauthorizedError();`,
        '}',
      ].join('\n');

    for (const comilla of ["'", '"', '`']) {
      expect(findForbiddenPatternsInSource(conLiteral(comilla)), `comilla ${comilla}`).toEqual([
        `literal del rol ${ROLE_MAESTRO}`,
      ]);
    }
  });

  it('QC-161 R16: dispara con un actor.ts sintetico que importa y usa ROLE_MAESTRO', () => {
    const conConstante = [
      "import { ROLE_MAESTRO } from '@/lib/modules/identity';",
      '',
      'export function requireMaestro(actor: Actor): void {',
      '  if (actor.role !== ROLE_MAESTRO) throw new UnauthorizedError();',
      '}',
    ].join('\n');

    expect(findForbiddenPatternsInSource(conConstante)).toEqual(['ROLE_MAESTRO']);
  });

  it('QC-161 R16: el caso simetrico — el rol Maestro dentro de un comentario NO dispara', () => {
    expect(
      findForbiddenPatternsInSource(`// el Maestro entra por sus permisos, no por '${ROLE_MAESTRO}'`),
    ).toEqual([]);
    expect(
      findForbiddenPatternsInSource(`/** ROLE_MAESTRO no se compara: se exige el permiso */`),
    ).toEqual([]);
  });
});
