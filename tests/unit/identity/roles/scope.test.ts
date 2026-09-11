// QC-94 T12 — EL TEST DE ALCANCE (`design.md > 9.1`, fila `roles/scope.test.ts`).
//
// Cubre R4, R7, R12, R15, R17, R18, R19, R20 y R21. R11, R12 y R17–R21 son requisitos de ALCANCE
// y son requisitos de pleno derecho, no comentarios (`requirements.md`, «Como leer los requisitos
// que dicen no»). Lo que esta ficha escribe lo prueban los tests de dominio, de borde y de
// integracion; lo que esta ficha NO PUEDE TOCAR —el esquema, las migraciones, el catalogo de
// permisos, la pantalla de QC-67 y el `package.json`— solo se prueba aqui.
//
// Estilo copiado de `tests/unit/identity/usuarios/scope.test.ts`, incluido su retensado de
// MAYOR-1: se recorre el DISCO y el TEXTO, no el grafo de imports (eso es trabajo de
// `tests/guards/`), y ninguna afirmacion hace un censo GLOBAL del repositorio.
//
// DOS FAMILIAS DE ASERCION, y conviene no confundirlas:
//
//   A. LAS QUE MIRAN EL CONTENIDO. No dependen de git y muerden SIEMPRE, tambien dentro de `dev`
//      dentro de un mes. Su riesgo de verde vacuo es una lista vacia o un nombre mal escrito, asi
//      que cada una comprueba que los archivos que nombra EXISTEN y tienen contenido, y lleva un
//      ANCLA POSITIVA —el archivo que SI contiene el patron— para que una expresion regular roma
//      no la deje verde sin mirar. Aqui son R15, R17, R12, R21, R4 y la mitad de contenido de R7.
//
//   B. LAS QUE MIRAN EL CAMBIO. «Esta rama no anadio una migracion / una dependencia / una
//      pantalla» es un hecho HISTORICO de la rama, no una propiedad del arbol: QC-67 VA a crear
//      `app/(private)/usuarios/` con pleno derecho y otras fichas anaden migraciones con pleno
//      derecho, asi que estas NO pueden ser de contenido. Comparan contra la base de fusion con
//      `origin/dev` mas el arbol de trabajo, para morder antes de commitear, y NO se dejan en
//      verde cuando no hay nada que mirar: «no puedo mirar» (el rango no resuelve) es ROJO, y
//      «esto no es mi rama» / «el diff esta vacio» queda SALTADO Y RUIDOSO, nunca verde. Aqui son
//      R19, R20, R18 y la mitad de rama de R7.
//
// UN AVISO SOBRE LOS COMENTARIOS. Varios archivos de esta feature NOMBRAN en sus comentarios lo
// que prometen no hacer: el puerto explica que no tiene escritura, el adaptador driven que no hay
// ningun `create`, y `role-view.ts` que no usa el contrato de listado. Esa documentacion es
// informacion util y no puede poner un test rojo, asi que antes de buscar se quitan los
// comentarios (`quitarComentariosTs`). Lo que se mide es CODIGO de verdad.

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
 * LANZA —a proposito— si el rango no se puede calcular: «no puedo mirar» es ROJO. La razon de no
 * usar `dev...HEAD` es la que ya anota `usuarios/scope.test.ts`: el `dev` LOCAL va por detras del
 * remoto y el rango arrastraria trabajo ajeno ya mergeado.
 */
function archivosTocados(): readonly string[] {
  const base = baseDeFusionConDev();
  if (base === null) {
    throw new Error(
      `No se pudo calcular el diff contra \`${RANGO}\`, asi que el alcance de rama de QC-94 NO se ` +
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
// que un archivo olvidado saliera verde por no estar en la lista. Son los CINCO archivos de
// produccion que `design.md > 1` y `tasks.md` declaran como NUEVOS.
// ---------------------------------------------------------------------------------------------

const ARCHIVOS_NUEVOS_DE_LA_FEATURE = [
  'lib/modules/identity/domain/role-view.ts',
  'lib/modules/identity/domain/list-roles.ts',
  'lib/modules/identity/ports/role-catalog-repository.ts',
  'lib/modules/identity/adapters/driven/persistence/role-catalog-prisma.ts',
  'lib/modules/identity/adapters/driving/role-actions.ts',
] as const;

/** El CONTRATO del modulo: el archivo de R15. */
const CONTRATO = 'lib/modules/identity/index.ts';

/** La Server Action que R15 prohibe reexportar, por su ruta y por su nombre de modulo. */
const SERVER_ACTION = 'lib/modules/identity/adapters/driving/role-actions.ts';

/** El adaptador driven: el unico archivo de la feature que habla con la base. */
const ADAPTADOR_DRIVEN =
  'lib/modules/identity/adapters/driven/persistence/role-catalog-prisma.ts';

/** Quien SI usa el contrato de listado de QC-57: el ancla positiva de R12. */
const DUENO_DEL_CONTRATO_DE_LISTADO = 'lib/modules/identity/domain/list-users.ts';

/** Quien SI declara el literal del nombre del rol: el ancla positiva de R4. */
const DUENO_DEL_NOMBRE_DEL_ROL = 'lib/modules/identity/domain/roles.ts';

/** Una migracion que SI declara RLS: el ancla positiva de la mitad de contenido de R7. */
const MIGRACION_CON_RLS = 'db/migrations/20260806122638_users_and_roles/migration.sql';

/**
 * Las CUATRO escrituras de Prisma sobre el catalogo, en sus grafias singular y masiva (R17).
 * Se buscan sobre `role.` y `rolePermission.` —los dos modelos que R17 nombra— porque cualquiera
 * de ellas seria la escritura colandose: `prisma.role.update({...})` no escribe nunca la cadena
 * `UPDATE "roles"`.
 */
const ESCRITURAS_SOBRE_EL_CATALOGO =
  /\b(role|rolePermission)s?\s*\.\s*(create|update|upsert|delete)(Many)?\s*\(/i;

/** El SQL crudo equivalente, por si alguien se saltara el cliente (R17). */
const SQL_DE_ESCRITURA_SOBRE_EL_CATALOGO =
  /(insert\s+into|update|delete\s+from)\s+"?(roles|role_permissions)"?/i;

/** Las cuatro grafias del contrato de listado de QC-57 que R12 prohibe aqui. */
const GRAFIAS_DEL_CONTRATO_DE_LISTADO = [
  'ListQuery',
  'sanitizeListQuery',
  'ROLE_QUERYABLE',
  'ListQueryable',
] as const;

/** `Page` se busca aparte, como PALABRA: `Page` aparece dentro de `ListPage`, `pageSize`... */
const TIPO_PAGE = /\bPage\b/;

/** Las dos grafias por las que una policy de RLS entraria en un archivo de esta feature (R7). */
const GRAFIAS_DE_RLS = [/\bROW\s+LEVEL\s+SECURITY\b/i, /\b(CREATE|ALTER|DROP)\s+POLICY\b/i] as const;

/**
 * El literal de un nombre de rol ENTRE COMILLAS, construido desde las constantes importadas y
 * nunca copiado a mano (R4: «ningun archivo nuevo de `lib/modules/identity/**` de esta ficha
 * incrusta el literal `'Administrador'` ni ningun otro nombre de rol»). Entre comillas a
 * proposito: un comentario que diga «el Administrador pasa por aqui» no escribe ningun literal.
 */
const LITERALES_DE_ROL = [ROLE_ADMINISTRADOR, ROLE_OPERADOR].map(
  (nombre) => new RegExp(`['"\`]${nombre}['"\`]`),
);

/** El catalogo cerrado de permisos, que esta ficha NO toca (R21). */
const PERMISOS_ESPERADOS = 13;

/** Los DOS codigos que esta ficha reutiliza, y que por tanto tienen que seguir existiendo. */
const LOS_DOS_CODIGOS = ['usuarios.consultar', 'usuarios.modificar'] as const;

// ---------------------------------------------------------------------------------------------
// FAMILIA A: EL CONTENIDO. Muerde siempre, tambien dentro de `dev`.
// ---------------------------------------------------------------------------------------------

describe('alcance de QC-94 (consulta-de-roles) — CONTENIDO: muerde siempre', () => {
  it('los cinco archivos que esta ficha crea existen y no estan vacios', () => {
    // ANCLA DE LA LISTA, y sostiene a todos los casos de abajo: un nombre mal escrito o un archivo
    // vacio dejaria cada bucle pasando por la razon equivocada.
    expect(ARCHIVOS_NUEVOS_DE_LA_FEATURE.length, 'la lista de archivos de la feature esta vacia').toBe(
      5,
    );
    for (const archivo of ARCHIVOS_NUEVOS_DE_LA_FEATURE) {
      expect(existsSync(join(RAIZ, archivo)), `${archivo} no existe en el disco`).toBe(true);
      expect(leer(archivo).trim().length, `${archivo} esta vacio: no prueba nada`).toBeGreaterThan(0);
    }
  });

  it('R15 — el contrato del modulo NO reexporta la Server Action de esta ficha', () => {
    // R15: «La Server Action de esta feature NO DEBE reexportarse desde
    // `lib/modules/identity/index.ts`: el contrato sigue reexportando SOLO simbolos de `./domain`,
    // sin `'use server'`, `@prisma/client` ni `next/*` en su cierre transitivo, de modo que QC-67
    // la importe por su RUTA EXACTA y el contrato siga importable desde un componente de cliente».
    const contrato = quitarComentariosTs(leer(CONTRATO));

    // ANCLA POSITIVA: el contrato SI reexporta el caso de uso (T10). Sin esto, un contrato vacio o
    // mal leido dejaria los `not.toContain` de abajo verdes sin mirar nada.
    expect(
      contrato,
      `${CONTRATO} ya no reexporta el caso de uso de QC-94: este caso estaria midiendo aire`,
    ).toContain('./domain/list-roles');
    expect(contrato).toContain('./domain/role-view');

    for (const prohibido of ['role-actions', 'adapters/', 'ports/'] as const) {
      expect(
        contrato,
        `${CONTRATO} nombra \`${prohibido}\`: el contrato solo reexporta de ./domain (R15, R16)`,
      ).not.toContain(prohibido);
    }
    // Y el contrato no declara `'use server'` por su cuenta.
    expect(contrato).not.toContain('use server');
  });

  it('R17 — ningun archivo nuevo escribe sobre `role` ni sobre `role_permissions`', () => {
    // R17: «ningun metodo del puerto nuevo escribe, y ningun archivo nuevo ejecuta un `create`,
    // `update`, `upsert` o `delete` sobre `roles` ni sobre `role_permissions`». El catalogo es
    // cerrado y solo cambia por migracion y seed (QC-4).

    // ANCLA POSITIVA de los dos detectores: reconocen una escritura de verdad cuando la ven, y
    // NO acusan a la lectura que esta ficha si hace (`prisma.role.findMany`).
    expect(ESCRITURAS_SOBRE_EL_CATALOGO.test('await prisma.role.create({ data })')).toBe(true);
    expect(ESCRITURAS_SOBRE_EL_CATALOGO.test('prisma.rolePermission.deleteMany({ where })')).toBe(
      true,
    );
    expect(ESCRITURAS_SOBRE_EL_CATALOGO.test('prisma.role.findMany({ select })')).toBe(false);
    expect(SQL_DE_ESCRITURA_SOBRE_EL_CATALOGO.test('INSERT INTO "roles" (id, name)')).toBe(true);
    expect(SQL_DE_ESCRITURA_SOBRE_EL_CATALOGO.test('SELECT id, name FROM "roles"')).toBe(false);

    // Y el adaptador driven SI contiene la lectura: si un dia dejara de hacerlo, el detector
    // estaria vigilando un archivo que ya no habla con la tabla.
    expect(
      quitarComentariosTs(leer(ADAPTADOR_DRIVEN)),
      `${ADAPTADOR_DRIVEN} ya no lee `.concat('`prisma.role.findMany`: este caso mide aire'),
    ).toContain('prisma.role.findMany');

    const hallazgos: string[] = [];
    for (const archivo of ARCHIVOS_NUEVOS_DE_LA_FEATURE) {
      const codigo = quitarComentariosTs(leer(archivo));
      if (ESCRITURAS_SOBRE_EL_CATALOGO.test(codigo)) hallazgos.push(`${archivo}: cliente Prisma`);
      if (SQL_DE_ESCRITURA_SOBRE_EL_CATALOGO.test(codigo)) hallazgos.push(`${archivo}: SQL crudo`);
    }
    expect(
      hallazgos,
      'R17: esta ficha SOLO LEE el catalogo de roles; crear, editar o borrar roles es QC-4. ' +
        `Escriben: ${hallazgos.join('; ')}`,
    ).toEqual([]);
  });

  it('R12 — ningun archivo nuevo usa el contrato de listado de QC-57 ni declara ROLE_QUERYABLE', () => {
    // R12: «no recibe ningun argumento de consulta ademas del actor, NO DEBE usar el contrato de
    // listado de QC-57 (`ListQuery`, `Page`, `sanitizeListQuery`) y NO DEBE declarar ninguna lista
    // blanca de campos consultables para `Role`». El catalogo es cerrado y corto y se devuelve
    // entero; traerlo seria una SEPTIMA copia del contrato dentro de `identity`
    // (`design.md > 8.1`).

    // ANCLA POSITIVA: el listado de usuarios SI usa el contrato, asi que las grafias existen y se
    // escriben tal y como este caso las busca.
    const dueno = quitarComentariosTs(leer(DUENO_DEL_CONTRATO_DE_LISTADO));
    expect(
      dueno,
      `${DUENO_DEL_CONTRATO_DE_LISTADO} ya no usa \`sanitizeListQuery\`: las grafias que vigila ` +
        'R12 cambiaron y este caso estaria midiendo aire',
    ).toContain('sanitizeListQuery');
    expect(dueno).toMatch(TIPO_PAGE);

    const hallazgos: string[] = [];
    for (const archivo of ARCHIVOS_NUEVOS_DE_LA_FEATURE) {
      const codigo = quitarComentariosTs(leer(archivo));
      for (const grafia of GRAFIAS_DEL_CONTRATO_DE_LISTADO) {
        if (codigo.includes(grafia)) hallazgos.push(`${archivo}: ${grafia}`);
      }
      if (TIPO_PAGE.test(codigo)) hallazgos.push(`${archivo}: Page`);
    }
    expect(
      hallazgos,
      'R12: esta consulta no pagina, no busca y no ordena a peticion; si algun dia hace falta, ' +
        `es una ficha, no un hueco de esta (design.md > 8.1). Lo usan: ${hallazgos.join('; ')}`,
    ).toEqual([]);
  });

  it('R21 — el catalogo de permisos sigue teniendo TRECE entradas y ninguna de roles', () => {
    // R21: «NO DEBE anadir, quitar ni renombrar ningun permiso del catalogo cerrado: reutiliza los
    // dos codigos que ya creo QC-66, y el catalogo DEBE seguir teniendo TRECE entradas despues de
    // esta ficha». `roles.consultar` esta descartado POR EL HUMANO (decision cerrada 2,
    // `design.md > 8.4`): habria costado su migracion de catalogo, su seed y el ripple de los
    // tests que lo cuentan, para una consulta que solo sirve a la pantalla de usuarios.
    expect(
      PERMISSIONS.length,
      'el catalogo de permisos cambio de tamano, y R21 dice que esta ficha no lo toca',
    ).toBe(PERMISOS_ESPERADOS);

    const codigos = PERMISSIONS.map((permiso) => permiso.code);

    // Los DOS que esta ficha REUTILIZA siguen ahi: sin ellos, `list-roles.ts` no compilaria, pero
    // el caso lo dice en voz alta en vez de dejarlo a la casualidad.
    for (const codigo of LOS_DOS_CODIGOS) {
      expect(codigos, `el catalogo ya no trae \`${codigo}\`, que es el que autoriza esta consulta`)
        .toContain(codigo);
    }

    // Y ninguno NUEVO del modulo de roles: el permiso propio se descarto.
    const deRoles = codigos.filter((codigo) => codigo.startsWith('roles.'));
    expect(
      deRoles,
      'R21 y la decision cerrada 2: esta consulta NO trae un permiso propio. ' +
        `Aparecieron: ${deRoles.join(', ')}`,
    ).toEqual([]);
  });

  it('R4 — ningun archivo nuevo escribe a mano el nombre de un rol', () => {
    // R4: «La decision de autorizar NO DEBE depender del ROL del actor: el caso de uso no lee, no
    // recibe y no compara el rol de quien pide, y ningun archivo nuevo de `lib/modules/identity/**`
    // de esta ficha incrusta el literal `'Administrador'` ni ningun otro nombre de rol». Es la
    // leccion de QC-54, que gasto una ficha entera en unificar los seis sitios que comparaban
    // contra el literal.
    //
    // Los patrones se CONSTRUYEN desde las constantes importadas, nunca se copian: si un rol se
    // renombrara, esta guardia lo sigue.

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
      'R4: autoriza el PERMISO, nunca el nombre del rol. Lo escriben a mano: ' +
        hallazgos.join('; '),
    ).toEqual([]);
  });

  it('R7 — ningun archivo nuevo declara ni se apoya en una policy de RLS', () => {
    // R7: «NO DEBE crear, modificar ni suprimir ninguna policy de ROW LEVEL SECURITY, y NO DEBE
    // apoyarse en ninguna para cumplir R1: una policy de RLS NO cuenta como permiso implementado»
    // (`docs/architecture.md > Acceso a datos y autorizacion`). La frontera real es el service, y
    // quien la sostiene es `requireAnyPermission` en la primera linea de `list-roles.ts`.

    // ANCLA POSITIVA: hay una migracion que SI declara RLS, asi que los patrones encuentran
    // declaraciones de verdad y no estan midiendo aire.
    const conRls = leer(MIGRACION_CON_RLS);
    expect(
      conRls,
      `${MIGRACION_CON_RLS} ya no declara RLS: los patrones de R7 estarian midiendo aire`,
    ).toMatch(GRAFIAS_DE_RLS[0]);

    const hallazgos: string[] = [];
    for (const archivo of ARCHIVOS_NUEVOS_DE_LA_FEATURE) {
      const codigo = quitarComentariosTs(leer(archivo));
      for (const patron of GRAFIAS_DE_RLS) {
        if (patron.test(codigo)) hallazgos.push(`${archivo}: ${patron}`);
      }
    }
    expect(
      hallazgos,
      `R7: la autorizacion de esta consulta vive en el service. Nombran una policy: ${hallazgos.join('; ')}`,
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// FAMILIA B: LOS DETECTORES DE ALCANCE DE RAMA
//
// Los cuatro son funciones PURAS y EXPORTADAS, para poder ejercitarlas con listas SINTETICAS y
// demostrar que muerden sin depender de en que rama corra el gate. Un detector que solo se
// ejercita contra el arbol real no demuestra nunca que pueda fallar.
// ---------------------------------------------------------------------------------------------

/** R19: `db/schema.prisma` es el unico sitio donde se declaran modelos, columnas y tipos. */
export function cambiosDeEsquema(tocados: readonly string[]): readonly string[] {
  return tocados.filter((ruta) => ruta === 'db/schema.prisma');
}

/** R19 y R7: CUALQUIER carpeta de `db/migrations/`. Esta ficha no tiene ni una: la tabla `roles`
 *  existe desde QC-4 y esta sembrada, y una policy de RLS solo puede entrar por aqui. */
export function migracionesDeLaRama(tocados: readonly string[]): readonly string[] {
  return tocados.filter((ruta) => ruta.startsWith('db/migrations/')).sort();
}

/** R18: nada bajo `app/`, `components/` ni `e2e/` —el selector es QC-67—, y tampoco un adaptador
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

/** R20: los dos archivos por los que entra una dependencia. */
export function cambiosDeDependencias(tocados: readonly string[]): readonly string[] {
  return tocados.filter((ruta) => ruta === 'package.json' || ruta === 'pnpm-lock.yaml');
}

/**
 * LA PRECONDICION DE RAMA. Los cuatro casos de la familia B SOLO aplican en la rama de QC-94: R18,
 * R19 y R20 hablan del alcance de ESTA ficha, no del de las demas. Fuera de su rama quedan MUDOS.
 *
 * La senal es CONJUNTIVA y son DOS, como en `esLaRamaDeQC66()`: el archivo CENTRAL de la ficha
 * —`list-roles.ts`, ninguna rama implementa QC-94 sin el— mas su carpeta de spec. Con una sola no
 * basta: QC-67 va a consumir `list-roles.ts` legitimamente, y la carpeta de spec discrimina de
 * verdad porque nace y vive dentro del rango de QC-94 y no aparece jamas en el de otra ficha.
 *
 * No se usa este archivo de test como senal, justamente porque otras fichas lo enmiendan al
 * chocar con el.
 */
const ARCHIVO_CENTRAL_DE_QC94 = 'lib/modules/identity/domain/list-roles.ts';
const CARPETA_SPEC_DE_QC94 = 'specs/QC-94-consulta-de-roles/';

export function esLaRamaDeQC94(tocados: readonly string[]): boolean {
  return (
    tocados.includes(ARCHIVO_CENTRAL_DE_QC94) &&
    tocados.some((ruta) => ruta.startsWith(CARPETA_SPEC_DE_QC94))
  );
}

/** El minimo que necesita un `ctx` de vitest para saltar: asi se puede pasar uno sintetico. */
interface ConSalto {
  readonly skip: (nota: string) => never;
}

/** El salto SINTETICO del ultimo `describe`: una senal propia, para no confundirla con un fallo
 *  de asercion. El `ctx.skip` de vitest tambien lanza, asi que imitarlo es lo que hace falta. */
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
 *   - no es la rama de QC-94 (incluido el diff VACIO, que no trae ninguna de las dos senales)
 *     -> `skipped` diciendo por que;
 *   - es la rama de QC-94 -> el diff, y los casos vigilan.
 *
 * `tocados` se inyecta a proposito para poder ejercitar los desenlaces con una lista sintetica.
 */
function diffOMudo(
  ctx: ConSalto,
  tocados: readonly string[] = archivosTocados(),
): readonly string[] {
  if (!esLaRamaDeQC94(tocados)) {
    ctx.skip(
      tocados.length === 0
        ? 'el diff contra `' +
            RANGO +
            '` esta VACIO (la rama ya esta en el tronco, o el arbol esta limpio sobre `dev`): no ' +
            'hay cambio que revisar, asi que este caso NO ha comprobado nada. Se declara SALTADO ' +
            'y no verde a proposito.'
        : 'el diff no trae a la vez `' +
            ARCHIVO_CENTRAL_DE_QC94 +
            '` y `' +
            CARPETA_SPEC_DE_QC94 +
            '`: esta NO es la rama de QC-94, asi que este caso NO ha comprobado nada. R18, R19 y ' +
            'R20 son el alcance de ESA ficha y no le aplican a ninguna otra.',
    );
  }
  return tocados;
}

describe('el rango git esta disponible: la familia de rama puede mirar de verdad', () => {
  it(`\`${RANGO}\` resuelve; si no, estos casos fallan ruidosamente`, () => {
    // «No puedo mirar» es ROJO y se comprueba aqui, una sola vez. Lo que NO es rojo es «he mirado
    // y esto no es mi rama»: eso se salta.
    expect(() => archivosTocados()).not.toThrow();
  });
});

describe('alcance de QC-94 — EL CAMBIO: lo que esta rama anadio, y solo en su rama', () => {
  it('R19 — db/schema.prisma no esta en el diff de la rama: CERO diff', (ctx) => {
    // R19: «NO DEBE anadir ninguna migracion ni modificar `db/schema.prisma`: no crea ni cambia
    // ninguna tabla, columna, indice, restriccion ni tipo, y no inserta ni borra ninguna fila».
    // El modelo `Role` esta completo desde QC-4 y esta ficha SOLO LO LEE.
    //
    // Esto NO puede ser de contenido: el esquema existe y lo escriben otras fichas. Lo unico
    // afirmable es que ESTA rama no lo movio, que es un hecho del cambio.
    const diff = diffOMudo(ctx);
    expect(
      cambiosDeEsquema(diff),
      'db/schema.prisma esta en el diff, y R19 dice que esta feature no lo toca: el modelo `Role` ' +
        'lo aporto QC-4 y esta ficha solo lo consume',
    ).toEqual([]);
  });

  it('R19, R7 — la rama no anade NINGUNA carpeta de db/migrations/', (ctx) => {
    // La otra mitad de R19, y la mitad de rama de R7: una migracion es el unico sitio por el que
    // entraria un cambio de esquema o una policy de RLS. Tampoco puede ser de contenido: el
    // repositorio tiene veintitantas migraciones legitimas de otras fichas.
    const diff = diffOMudo(ctx);
    const migraciones = migracionesDeLaRama(diff);
    expect(
      migraciones,
      'QC-94 no tiene ninguna migracion: la tabla `roles` existe desde QC-4 y esta sembrada, y ' +
        `una policy de RLS solo entraria por aqui (R7, R19). Esto esta en el diff: ${migraciones.join(', ')}`,
    ).toEqual([]);
  });

  it('R18 — la rama no anade nada bajo app/, components/ ni e2e/', (ctx) => {
    // R18: «NO DEBE incluir ninguna pantalla, pagina, componente de interfaz ni ruta bajo `app/`
    // o `components/` —el selector es QC-67—; por lo tanto no aporta ningun flujo navegable que un
    // test E2E pueda visitar, y su verificacion es unitaria y de integracion».
    //
    // ESTE CASO NO TIENE —NI DEBE TENER— MITAD DE CONTENIDO: «esta ficha no anade pantalla» es un
    // hecho HISTORICO de esta rama, no una propiedad del arbol. QC-67 va a anadir el selector
    // legitimamente, y una guardia de contenido lo bloquearia. Es el error exacto que
    // `tests/unit/unidades/modulo-intacto.test.ts` cometio y tuvo que deshacer.
    //
    // El E2E se difiere AQUI y CON MOTIVO (decision cerrada 7, `design.md > 9`), no al final y no
    // por olvido: no hay pantalla que Playwright pueda abrir. QC-67 lo hereda explicitamente —su
    // E2E ya crea un usuario eligiendo rol, es decir, ejerce esta consulta de extremo a extremo—.
    const diff = diffOMudo(ctx);
    const enLaInterfaz = infraccionesDeInterfaz(diff);
    expect(
      enLaInterfaz,
      'QC-94 es backend puro: el selector es QC-67 y el E2E se difiere con motivo (decision 7). ' +
        `Esto esta en el diff: ${enLaInterfaz.join(', ')}`,
    ).toEqual([]);
  });

  it('R20 — package.json ni pnpm-lock.yaml estan en el diff de la rama', (ctx) => {
    // R20: «NO DEBE incorporar ninguna dependencia de terceros nueva». `design.md > 10` lo cierra
    // sin abrir ninguna propuesta: los cuatro checks de salud no llegan a evaluarse. Ni siquiera
    // una utilidad de ordenacion, porque el orden lo hace la base con `ORDER BY name ASC`.
    const diff = diffOMudo(ctx);
    const deDependencias = cambiosDeDependencias(diff);
    expect(
      deDependencias,
      'R20 y la regla 7 de CLAUDE.md: ninguna dependencia entra en esta ficha, y ninguna entra ' +
        `sin aprobacion humana y su fila en docs/dependencias.md. Esto cambio: ${deDependencias.join(', ')}`,
    ).toEqual([]);
  });
});

/**
 * QUE EL SALTO NO VACIE LA GUARDIA (la leccion de MAYOR-1 en `usuarios/scope.test.ts`).
 *
 * Una guardia que se salta siempre no protege nada. Estos casos ejercitan las CINCO funciones
 * puras con listas SINTETICAS, sin depender de en que rama corra el gate.
 */
describe('el salto no vacia la guardia: en la rama de QC-94 sigue mordiendo', () => {
  /** El alcance LEGITIMO de esta ficha, en miniatura: las dos senales mas lo que si puede tocar. */
  const RAMA_DE_QC94 = [
    ARCHIVO_CENTRAL_DE_QC94,
    'lib/modules/identity/ports/role-catalog-repository.ts',
    'lib/modules/identity/adapters/driving/role-actions.ts',
    'lib/modules/identity/index.ts',
    'lib/composition/index.ts',
    'specs/QC-94-consulta-de-roles/requirements.md',
    'tests/unit/identity/roles/scope.test.ts',
  ];

  it('reconoce la rama de QC-94 por sus DOS senales, y NO reconoce otra', () => {
    expect(esLaRamaDeQC94(RAMA_DE_QC94)).toBe(true);

    // La senal es CONJUNTIVA: con una sola no basta. QC-67 va a consumir `list-roles.ts`, y
    // cualquier ficha trae SU carpeta de spec.
    expect(esLaRamaDeQC94([ARCHIVO_CENTRAL_DE_QC94])).toBe(false);
    expect(esLaRamaDeQC94(['specs/QC-94-consulta-de-roles/design.md'])).toBe(false);

    // El diff de otra ficha: QC-67 (el selector) consumiendo esta consulta y trayendo su spec.
    expect(
      esLaRamaDeQC94([
        'app/(private)/usuarios/page.tsx',
        'lib/modules/identity/domain/list-roles.ts',
        'specs/QC-67-pantalla-de-usuarios/requirements.md',
      ]),
    ).toBe(false);
  });

  it('con el diff VACIO los casos de rama se SALTAN, no fallan', () => {
    // El dia que este PR entre en `dev`, la base de fusion pasa a ser HEAD y el diff queda vacio.
    // Se simula inyectando esa lista vacia en el mismo helper que usan los casos de arriba.
    expect(esLaRamaDeQC94([])).toBe(false);

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

    // Y fuera de la rama de QC-94 —diff con cambios, pero ajenos— tambien salta, con OTRO motivo.
    notas.length = 0;
    expect(() => diffOMudo(ctxFalso, ['app/(private)/usuarios/page.tsx'])).toThrow(SaltoSimulado);
    expect(notas[0]).toContain('NO es la rama de QC-94');

    // En cambio, DENTRO de su rama el helper no salta y devuelve el diff entero.
    const devuelto = diffOMudo(ctxFalso, RAMA_DE_QC94);
    expect(devuelto).toEqual(RAMA_DE_QC94);
    expect(notas, 'dentro de su rama el helper NO debe saltar').toHaveLength(1);
  });

  it('los cuatro detectores de rama MUERDEN con listas sinteticas', () => {
    // R19, por sus dos caminos.
    expect(cambiosDeEsquema([...RAMA_DE_QC94, 'db/schema.prisma'])).toEqual(['db/schema.prisma']);
    expect(
      migracionesDeLaRama([
        ...RAMA_DE_QC94,
        'db/migrations/20260911090000_roles_description/migration.sql',
      ]),
    ).toEqual(['db/migrations/20260911090000_roles_description/migration.sql']);

    // R18, por los cuatro caminos: pagina, componente, E2E y adaptador de navegacion en `lib/`.
    expect(infraccionesDeInterfaz([...RAMA_DE_QC94, 'app/(private)/usuarios/page.tsx'])).toEqual([
      'app/(private)/usuarios/page.tsx',
    ]);
    expect(infraccionesDeInterfaz([...RAMA_DE_QC94, 'components/shared/role-select.tsx'])).toEqual([
      'components/shared/role-select.tsx',
    ]);
    expect(infraccionesDeInterfaz([...RAMA_DE_QC94, 'e2e/roles.spec.ts'])).toEqual([
      'e2e/roles.spec.ts',
    ]);
    expect(
      infraccionesDeInterfaz([
        ...RAMA_DE_QC94,
        'lib/modules/navegacion/adapters/driving/role-menu.ts',
      ]),
    ).toEqual(['lib/modules/navegacion/adapters/driving/role-menu.ts']);

    // R20, por los dos archivos.
    expect(cambiosDeDependencias([...RAMA_DE_QC94, 'package.json'])).toEqual(['package.json']);
    expect(cambiosDeDependencias([...RAMA_DE_QC94, 'pnpm-lock.yaml'])).toEqual(['pnpm-lock.yaml']);

    // Y todos ellos siguen mordiendo dentro de la rama, que es donde tienen que morder.
    expect(esLaRamaDeQC94([...RAMA_DE_QC94, 'db/schema.prisma'])).toBe(true);
  });

  it('y ninguno muerde con el alcance legitimo de esta ficha', () => {
    // El alcance de QC-94 completo: los cinco archivos de produccion, los dos de dominio que
    // amplia, el contrato, la composicion, su spec y sus tests. Si alguno de los detectores
    // mordiera aqui, estaria acusando a la ficha de lo que su propio spec le manda hacer.
    const legitimo = [
      ...ARCHIVOS_NUEVOS_DE_LA_FEATURE,
      'lib/modules/identity/domain/require-permission.ts',
      'lib/modules/identity/domain/actor.ts',
      CONTRATO,
      'lib/composition/index.ts',
      'specs/QC-94-consulta-de-roles/tasks.md',
      'tests/unit/identity/roles/scope.test.ts',
      'tests/integration/identity/role-catalog.int.test.ts',
      'progress/impl_QC-94-consulta-de-roles.md',
    ];
    expect(esLaRamaDeQC94(legitimo)).toBe(true);
    expect(cambiosDeEsquema(legitimo)).toEqual([]);
    expect(migracionesDeLaRama(legitimo)).toEqual([]);
    expect(infraccionesDeInterfaz(legitimo)).toEqual([]);
    expect(cambiosDeDependencias(legitimo)).toEqual([]);
  });

  it('el detector de interfaz NO acusa a la Server Action de esta ficha', () => {
    // `adapters/driving/role-actions.ts` esta bajo `lib/` y es legitimo: R18 prohibe la PANTALLA,
    // no la frontera de servidor. Si el patron de navegacion se ensanchara hasta morderlo, este
    // caso lo dice.
    expect(infraccionesDeInterfaz([SERVER_ACTION])).toEqual([]);
  });
});
