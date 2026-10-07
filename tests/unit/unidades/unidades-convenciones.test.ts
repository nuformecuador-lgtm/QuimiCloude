// QC-38 T10 — Guardias de convenciones y de limites de alcance del CRUD de unidades.
//
// Cubre R2, R23, R27, R31, R32, R34 y R35 (`specs/QC-38-crud-de-unidades/tasks.md > T10`).
//
// Este archivo es NUEVO y complementa a `module-contract.test.ts` (T9/QC-32/QC-26), que ya
// vigila la FORMA del modulo -carpetas, barrel, barrido de `prisma.unit`, exportes exactos de
// `unit-actions.ts`- y algunas de estas mismas reglas de refilon. Aqui se escriben como
// requisito de ESTA ficha, con su propio detector puro y su propio caso negativo, siguiendo el
// mismo patron que `tests/unit/pedidos-ui/pedidos-convenciones.test.ts` (QC-35/T13): cada
// comprobacion es una funcion pura sobre texto que se ejercita dos veces -contra el arbol real,
// donde debe dar "sin violaciones", y contra una fuente SINTETICA que contiene a proposito la
// violacion, donde debe morder-. Un test que no puede fallar no vigila nada.
//
// Los dos casos que dependen del DIFF (`db/schema.prisma` sin cambios, ninguna migracion nueva,
// `package.json` sin dependencias nuevas) usan `git diff --name-only origin/dev...HEAD`. Si el
// rango no esta disponible el caso se SALTA de forma explicita y ruidosa con `ctx.skip(...)` -no
// pasa en silencio, ni se declara rojo a proposito-: es el criterio que `tests/baseline-rojos.json`
// deja escrito como la salida correcta (la de `recipe-route-contract.test.ts` y
// `recetas/module-contract.test.ts`, que fallar-a-proposito apaga el archivo ENTERO para el
// comparador de rojos heredados; saltar con motivo no apaga nada y sigue siendo ruidoso en el
// reporte de la corrida).

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  NAV_SECTION_CONFIGURATION,
  PRIVATE_NAV_ITEMS,
  type NavLink,
} from '@/lib/shared/navigation/private-nav';
import { UNITS_ROUTE } from '@/lib/shared/routes';

/** Sube desde este archivo hasta la raiz del repo (la carpeta con `package.json`). Mismo
 *  ayudante que `module-contract.test.ts`, replicado a proposito: no hay un `lib/shared` de
 *  tests del que importarlo sin crear un acoplamiento nuevo entre dos archivos de guardia. */
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
const unidadesDir = join(repoRoot, 'lib', 'modules', 'unidades');

function toPosix(file: string): string {
  return file.split(sep).join('/');
}

function etiqueta(file: string): string {
  return toPosix(relative(repoRoot, file));
}

function leer(file: string): string {
  return readFileSync(file, 'utf8');
}

/** Fuente sin comentarios: las guardias miran CODIGO, no prosa que cita el propio literal que
 *  prohiben para explicar por que lo prohiben (mismo motivo que en `module-contract.test.ts`). */
function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, '');
}

/** Todos los archivos bajo `dir`, recursivamente. Rutas absolutas. */
function filesIn(dir: string): readonly string[] {
  if (!existsSync(dir)) return [];
  const salida: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) salida.push(...filesIn(full));
    else salida.push(full);
  }
  return salida.sort();
}

function sourcesIn(dir: string): readonly string[] {
  return filesIn(dir).filter((file) => /\.tsx?$/.test(file));
}

const unidadesSources = sourcesIn(unidadesDir);

function git(comando: string): string {
  return execSync(comando, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

/** Archivos que cambian entre `origin/dev` y `HEAD` (commiteados) MAS lo que hay en el arbol de
 *  trabajo (para morder antes incluso de commitear). `null` si el rango no esta disponible. */
function archivosCambiadosDesdeDev(): string[] | null {
  let deCommits: string[];
  try {
    deCommits = git('git diff --name-only origin/dev...HEAD')
      .split('\n')
      .map((linea) => linea.trim())
      .filter((linea) => linea.length > 0);
  } catch {
    return null;
  }

  const enArbol = git('git status --porcelain')
    .split('\n')
    .map((linea) => linea.trim())
    .filter((linea) => linea.length > 0)
    .map((linea) => {
      const camino = linea.slice(3).trim();
      const destino = camino.includes(' -> ') ? camino.split(' -> ')[1] : camino;
      return destino.replace(/^"|"$/g, '');
    });

  return [...new Set([...deCommits, ...enArbol])].map(toPosix).sort();
}

// -------------------------------------------------------------------------------------------
// R2 — autorizacion por PERMISO, nunca por nombre de rol.
// -------------------------------------------------------------------------------------------

/** Los cinco patrones que R2 prohibe en `lib/modules/unidades/**`: dos literales de rol -como
 *  identificador o como cadena-, dos constantes que representan un rol, y las dos funciones que
 *  autorizarian por rol en vez de por permiso. Lista cerrada, no libre: `Administrador` y
 *  `Operador` SI pueden aparecer en prosa de un comentario -ya se filtra por `sinComentarios`- o
 *  como parte de otra palabra mas larga que no sea el rol (`\b` a los dos lados evita eso). */
function comparacionesPorRol(fuente: string): string[] {
  const codigo = sinComentarios(fuente);
  const patrones: readonly [RegExp, string][] = [
    [/\bAdministrador\b/, 'Administrador'],
    [/\bOperador\b/, 'Operador'],
    [/\bROLE_ADMINISTRADOR\b/, 'ROLE_ADMINISTRADOR'],
    [/\bROLE_OPERADOR\b/, 'ROLE_OPERADOR'],
    [/\brequireAdmin\b/, 'requireAdmin'],
    [/\bassertAdminRole\b/, 'assertAdminRole'],
  ];
  return patrones.filter(([patron]) => patron.test(codigo)).map(([, nombre]) => nombre);
}

describe('R2 — unidades autoriza por permiso, nunca por nombre de rol', () => {
  it('ningun archivo de lib/modules/unidades compara contra un nombre de rol', () => {
    expect(unidadesSources.length, 'el barrido no encontro fuentes de unidades').toBeGreaterThan(5);

    const culpables = unidadesSources.flatMap((file) =>
      comparacionesPorRol(leer(file)).map((patron) => `${etiqueta(file)}: ${patron}`),
    );

    expect(culpables, culpables.join(', ')).toEqual([]);
  });

  it('y la guardia MUERDE ante cada una de las seis formas prohibidas, sin morder a lo legitimo', () => {
    expect(comparacionesPorRol(`if (actor.roleName === 'Administrador') { }`)).toContain(
      'Administrador',
    );
    expect(comparacionesPorRol(`if (role === 'Operador') { }`)).toContain('Operador');
    expect(comparacionesPorRol(`import { ROLE_ADMINISTRADOR } from '@/lib/modules/identity';`)).toContain(
      'ROLE_ADMINISTRADOR',
    );
    expect(comparacionesPorRol(`if (role === ROLE_OPERADOR) { }`)).toContain('ROLE_OPERADOR');
    expect(comparacionesPorRol(`requireAdmin(actor);`)).toContain('requireAdmin');
    expect(comparacionesPorRol(`assertAdminRole(actor);`)).toContain('assertAdminRole');

    // Legitimo: autorizar por PERMISO, que es justo lo que R2 manda.
    expect(comparacionesPorRol(`requirePermission(actor, 'unidades.modificar');`)).toEqual([]);
    // Y no muerde dentro de una palabra mas larga que no es el rol.
    expect(comparacionesPorRol(`const administradorDeSistemas = true;`)).toEqual([]);
    // Ni en un comentario, que ya se filtra.
    expect(comparacionesPorRol(`// solo el Administrador podia hacer esto antes de QC-74`)).toEqual(
      [],
    );
  });
});

// -------------------------------------------------------------------------------------------
// R27 — ningun Route Handler ni endpoint HTTP para las operaciones de unidades.
// -------------------------------------------------------------------------------------------

describe('R27 — las tres operaciones de escritura solo existen como Server Actions', () => {
  it('no existe ningun route.ts nuevo para unidades ni bajo app/api/units(idades)', () => {
    for (const ruta of [
      join(repoRoot, 'app', 'api', 'units'),
      join(repoRoot, 'app', 'api', 'unidades'),
    ]) {
      expect(existsSync(ruta), `${etiqueta(ruta)} no debe existir`).toBe(false);
    }
  });

  it('ningun route.ts del repo importa nada del modulo unidades', () => {
    const manejadores = sourcesIn(join(repoRoot, 'app')).filter((file) => /\/route\.tsx?$/.test(file));

    const culpables = manejadores.filter((file) =>
      /['"]@\/lib\/modules\/unidades/.test(sinComentarios(leer(file))),
    );

    expect(culpables.map(etiqueta), 'un route handler conoce el modulo unidades').toEqual([]);
  });

  it('y la guardia MUERDE ante un route handler que importe unidades', () => {
    const fuenteSintetica = `import { createUnitAction } from '@/lib/modules/unidades/adapters/driving/unit-actions';`;
    expect(/['"]@\/lib\/modules\/unidades/.test(sinComentarios(fuenteSintetica))).toBe(true);
  });
});

// -------------------------------------------------------------------------------------------
// R31 — el barrel sigue siendo importable desde cliente: sin 'use server' en su cierre.
// -------------------------------------------------------------------------------------------

/** Especificadores de import/reexport relativos de un fuente. */
function importSpecifiers(source: string): readonly string[] {
  const specs = new Set<string>();
  for (const match of sinComentarios(source).matchAll(/\bfrom\s+'([^']+)'/g)) specs.add(match[1] as string);
  return [...specs];
}

function resolveRelative(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = join(dirname(fromFile), spec);
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function reachableFrom(entry: string): readonly string[] {
  const vistos = new Set<string>([entry]);
  const pendientes = [entry];
  while (pendientes.length > 0) {
    const file = pendientes.pop() as string;
    for (const spec of importSpecifiers(leer(file))) {
      const destino = resolveRelative(file, spec);
      if (destino === null || vistos.has(destino)) continue;
      vistos.add(destino);
      pendientes.push(destino);
    }
  }
  return [...vistos];
}

describe("R31 — el cierre de imports del barrel no contiene 'use server' ni reexporta una action", () => {
  const barrel = join(unidadesDir, 'index.ts');

  it("ningun archivo alcanzable desde index.ts declara 'use server'", () => {
    const alcanzables = reachableFrom(barrel);
    expect(alcanzables.length).toBeGreaterThan(1);

    const culpables = alcanzables.filter((file) => /['"]use server['"]/.test(sinComentarios(leer(file))));
    expect(culpables.map(etiqueta), "algun archivo alcanzable declara 'use server'").toEqual([]);
  });

  it('el barrel no reexporta ninguna de las cuatro Server Actions', () => {
    const contrato = sinComentarios(leer(barrel));
    for (const action of ['listUnitsAction', 'createUnitAction', 'updateUnitAction', 'deleteUnitAction']) {
      expect(contrato, `el barrel reexporta ${action}`).not.toMatch(new RegExp(`\\b${action}\\b`));
    }
  });

  it("y la guardia MUERDE ante un barrel sintetico que reexporta una action o declara 'use server'", () => {
    expect(/['"]use server['"]/.test(sinComentarios(`'use server';\nexport {};`))).toBe(true);
    const barrelSintetico = `export { createUnitAction } from './adapters/driving/unit-actions';`;
    expect(sinComentarios(barrelSintetico)).toMatch(/\bcreateUnitAction\b/);
  });
});

// -------------------------------------------------------------------------------------------
// R23 + R32 — sin `deleted_at`, sin tocar el esquema, sin migracion nueva.
// -------------------------------------------------------------------------------------------

describe('R23 — el catalogo de unidades sigue sin borrado logico', () => {
  it('db/schema.prisma no declara deleted_at (ni equivalente) en el modelo Unit', () => {
    const schema = readFileSync(join(repoRoot, 'db', 'schema.prisma'), 'utf8');
    const modelo = /model Unit \{([\s\S]*?)\n\}/.exec(schema)?.[1] ?? '';
    expect(modelo.length, 'no se encontro el modelo Unit en db/schema.prisma').toBeGreaterThan(0);

    expect(modelo, 'el modelo Unit declara deleted_at').not.toMatch(/deleted_at|deletedAt/i);
  });
});

describe('R32 — esta ficha no toca db/schema.prisma ni anade ninguna migracion', () => {
  // ESTA GUARDIA SOLO APLICA EN LA RAMA DE QC-38. R32 es una regla sobre el ALCANCE de ESTA
  // ficha -«el CRUD de unidades se hace sin tocar la base»-, no una prohibicion general de que
  // nadie en el repo toque `db/`. El sujeto de la medicion es el diff `origin/dev...HEAD`, que en
  // otra rama es el diff de OTRA feature: ahi los dos casos de abajo no miden a QC-38, miden a un
  // desconocido, y el veredicto no significa nada.
  //
  // Antes esto no se distinguia, y con QC-38 ya mergeada en `dev` el efecto fue que R32 mordia a
  // cualquier rama que tocara `db/` -visto desde QC-65 el 2026-09-08, que anade una columna de
  // estado de cuenta y su migracion con permiso del humano-: dos casos rojos por trabajo ajeno y
  // legitimo. Como el gate completo es obligatorio antes de cada PR (regla 5 de `CLAUDE.md`), un
  // centinela sin dueno bloquea el cierre de todo el repo.
  //
  // El centinela es `unit-actions.ts`, el archivo donde viven las tres Server Actions de
  // escritura de QC-38: es la superficie que R27 y R31 nombran, ninguna rama puede implementar
  // esta ficha sin tocarlo, y ninguna otra ficha tiene motivo para hacerlo. No sirve de centinela
  // nada de `db/` -esquema o migracion-, que es justo lo que las otras fichas tambien tocan.
  //
  // Fuera de la rama de QC-38 estos dos casos quedan MUDOS (`skipped`), nunca verdes: un verde
  // diria «comprobado» sin haber mirado nada, que es el anti-patron de la «validacion opcional»
  // de `docs/gate.md`. Dentro de su rama vigilan exactamente igual que antes.
  //
  // RETENSADO 2026-09-08, y no es un adorno: un archivo solo NO identificaba la rama. QC-70
  // -catalogo unico de errores- sustituye la copia de `toErrorState` de LOS SIETE adaptadores
  // driving del repo, `unit-actions.ts` incluido, asi que con un unico centinela esta guardia
  // creia estar en la rama de QC-38 estando en la de QC-70. Hacen falta LOS DOS: el puerto de
  // escritura es creacion propia de QC-38 y ninguna ficha transversal tiene motivo para tocarlo.
  // Los tres viven en ambito de MODULO (ver arriba de este archivo): R34 los usa tambien.

  it('db/schema.prisma no cambia respecto de origin/dev', (ctx) => {
    const cambiados = archivosCambiadosDesdeDev();
    if (cambiados === null) {
      ctx.skip('el rango git origin/dev...HEAD no esta disponible: este caso no comprobo nada');
      return;
    }
    if (!esLaRamaDeQC38) {
      ctx.skip(
        'el rango trae archivos pero ninguno es `' + ARCHIVO_CENTRAL + '`: esta NO es la rama de ' +
          'QC-38, asi que R32 no le aplica y este caso NO ha comprobado nada.',
      );
      return;
    }

    expect(cambiados, 'db/schema.prisma aparece en el diff de la feature').not.toContain(
      'db/schema.prisma',
    );
  });

  it('no se anade ninguna carpeta nueva bajo db/migrations/', (ctx) => {
    const cambiados = archivosCambiadosDesdeDev();
    if (cambiados === null) {
      ctx.skip('el rango git origin/dev...HEAD no esta disponible: este caso no comprobo nada');
      return;
    }
    if (!esLaRamaDeQC38) {
      ctx.skip(
        'el rango trae archivos pero ninguno es `' + ARCHIVO_CENTRAL + '`: esta NO es la rama de ' +
          'QC-38, asi que R32 no le aplica y este caso NO ha comprobado nada.',
      );
      return;
    }

    const migraciones = cambiados.filter((ruta) => ruta.startsWith('db/migrations/'));
    expect(migraciones, `la feature toca db/migrations/: ${migraciones.join(', ')}`).toEqual([]);
  });

  it('y la guardia del diff MUERDE si el schema o una migracion aparecen en la lista', () => {
    const conSchema = ['db/schema.prisma', 'lib/modules/unidades/index.ts'];
    expect(conSchema).toContain('db/schema.prisma');

    const conMigracion = ['db/migrations/20260908120000_algo/migration.sql'];
    expect(conMigracion.filter((ruta) => ruta.startsWith('db/migrations/'))).not.toEqual([]);
  });
});

// -------------------------------------------------------------------------------------------
// R35 — ninguna dependencia de terceros nueva.
// -------------------------------------------------------------------------------------------

describe('R35 — ninguna dependencia nueva en package.json', () => {
  it('las dependencias y devDependencies son EXACTAMENTE las de origin/dev', (ctx) => {
    // 2026-09-18: acotado a la rama de QC-38 con el MISMO patron que R32/R34 en este archivo -esta
    // guardia es sobre el ALCANCE de ESTA ficha, no una prohibicion general de sumar una
    // dependencia aprobada en otra rama-. Sin el salto, cualquier rama que sume una dependencia
    // propia y aprobada (QC-111 suma `@upstash/qstash`, aprobada junto con su Route Handler) hacia
    // fallar este caso por una pregunta que no es la suya. Fuera de la rama de QC-38, la pregunta
    // complementaria -que toda dependencia declarada tenga su fila en `docs/dependencias.md`- ya
    // la responde `tests/guards/guard-dependencias-aprobadas.test.ts`, que esta verde y no se toca.
    // En la rama real de QC-38 este caso sigue midiendo exactamente igual.
    if (!esLaRamaDeQC38) {
      ctx.skip(
        'el rango trae archivos pero ninguno es `' + ARCHIVO_CENTRAL + '`: esta NO es la rama de ' +
          'QC-38, asi que R35 no le aplica y este caso NO ha comprobado nada.',
      );
      return;
    }

    let enDevTexto: string;
    try {
      enDevTexto = git('git show origin/dev:package.json');
    } catch {
      ctx.skip('el rango git origin/dev no esta disponible: este caso no comprobo nada');
      return;
    }

    const enDev = JSON.parse(enDevTexto) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const aqui = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as typeof enDev;

    expect(aqui.dependencies ?? {}, 'dependencies difiere de origin/dev').toEqual(
      enDev.dependencies ?? {},
    );
    expect(aqui.devDependencies ?? {}, 'devDependencies difiere de origin/dev').toEqual(
      enDev.devDependencies ?? {},
    );
  });
});

// -------------------------------------------------------------------------------------------
// R34 — anclas de QC-38 relevadas por QC-39 el 2026-09-08 (R47: tensar, nunca aflojar): el MODULO
// sigue sin abrir flujo navegable, y el item de menu y el unico spec e2e quedan fijados en su
// forma exacta.
// -------------------------------------------------------------------------------------------

/**
 * LOS ARCHIVOS CENTRALES DE QC-38, en ambito de modulo porque los usan R32 y R34. El porque
 * detallado esta en el comentario largo de R32, mas abajo.
 */
const ARCHIVOS_CENTRALES = [
  'lib/modules/unidades/adapters/driving/unit-actions.ts',
  'lib/modules/unidades/ports/unit-write-repository.ts',
] as const;
const ARCHIVO_CENTRAL = ARCHIVOS_CENTRALES.join('` y `');

/** Puro, para poder ejercitarlo con rangos sinteticos en los dos sentidos. */
function esRamaDeQC38(cambiados: readonly string[] | null): boolean {
  return cambiados !== null && ARCHIVOS_CENTRALES.every((archivo) => cambiados.includes(archivo));
}

const esLaRamaDeQC38 = esRamaDeQC38(archivosCambiadosDesdeDev());

/** Los `.spec.ts` de `e2e/` que trae un rango. Puro y ejercitado en los dos sentidos mas abajo. */
function nuevosSpecsE2e(cambiados: readonly string[]): readonly string[] {
  return cambiados.filter((ruta) => ruta.startsWith('e2e/') && ruta.endsWith('.spec.ts'));
}

/** Las ocho formas en que un archivo del MODULO abriria flujo navegable por su cuenta: importar o
 *  nombrar la navegacion privada, tipar un item de menu, declarar una constante de ruta de
 *  pantalla, escribir un destino o un identificador de item, o navegar. El modulo es dominio y
 *  adaptadores: la pantalla la abren `app/` y `lib/shared/navigation/`, nunca `lib/modules/**`. */
function declaracionesDeNavegacion(fuente: string): string[] {
  const codigo = sinComentarios(fuente);
  const patrones: readonly [RegExp, string][] = [
    [/\blib\/shared\/navigation\b/, 'lib/shared/navigation'],
    [/\bPRIVATE_NAV_ITEMS\b/, 'PRIVATE_NAV_ITEMS'],
    [/\bNavLink\b/, 'NavLink'],
    [/\bNavItem\b/, 'NavItem'],
    [/\b[A-Z][A-Z0-9_]*_ROUTE\s*=/, 'declaracion de ruta de pantalla'],
    [/\bhref\b/, 'href'],
    [/\btestId\b/, 'testId'],
    [/\bredirect\b/, 'redirect'],
  ];
  return patrones.filter(([patron]) => patron.test(codigo)).map(([, nombre]) => nombre);
}

/** Cuantos casos `test(...)` declara una fuente de Playwright. Cuenta solo la llamada DIRECTA:
 *  `test.describe(`, `test.beforeAll(`, `test.setTimeout(` y demas ayudantes llevan punto delante
 *  del parentesis y no son recorridos. Funcion pura: se ejercita contra el spec real y contra
 *  fuentes sinteticas donde debe morder. */
function casosTest(fuente: string): number {
  return [...fuente.matchAll(/(^|[^.\w$])test\s*\(/g)].length;
}

describe('R34 — esta ficha no abre ningun flujo navegable', () => {
  it('no existe ninguna pantalla de unidades bajo app/(private)/', () => {
    for (const ruta of [
      join(repoRoot, 'app', '(private)', 'unidades'),
      join(repoRoot, 'app', '(private)', 'units'),
    ]) {
      expect(existsSync(ruta), `${etiqueta(ruta)} no debe existir`).toBe(false);
    }
  });

  // El ancla la puso QC-38 (T10) el 2026-09-08 con la pregunta contraria —«la navegacion privada
  // NO nombra unidades»— porque aquella ficha era el CRUD y no abria pantalla. **QC-39 es
  // justamente la ficha que la abre** (`specs/QC-39-pantalla-de-unidades/requirements.md > R9,
  // R10`), asi que ese enunciado ya no describe la realidad y dejarlo pasaria por relajar la
  // guardia. R47 manda TENSARLA, nunca aflojarla ni borrarla: el caso releva la pregunta el
  // 2026-09-08 y afirma mas, no menos. Antes se pedia «cero items»; ahora se pide **EXACTAMENTE
  // uno**, con su destino derivado de la constante IMPORTADA, su permiso y su seccion. Que no
  // aparezca un segundo item de unidades sigue prohibido, y ademas se fija la forma del unico
  // que hay.
  it('la navegacion privada declara EXACTAMENTE un item de unidades, a UNITS_ROUTE, con unidades.consultar y en Configuración', () => {
    const items: readonly NavLink[] = PRIVATE_NAV_ITEMS.flatMap((item) =>
      item.kind === 'group' ? item.items : [item],
    );

    const deUnidades = items.filter((item) => item.href === UNITS_ROUTE);
    expect(deUnidades, `items que apuntan a ${UNITS_ROUTE}`).toHaveLength(1);

    const unidades = deUnidades[0] as NavLink;
    expect(unidades.permission).toBe('unidades.consultar');
    expect(unidades.section).toBe(NAV_SECTION_CONFIGURATION);

    // El `href` sale de la constante, no de un literal escrito en la navegacion (R8 de QC-39).
    const nav = join(repoRoot, 'lib', 'shared', 'navigation', 'private-nav.ts');
    const fuenteNav = sinComentarios(leer(nav));
    expect(fuenteNav, 'la navegacion no importa UNITS_ROUTE').toMatch(/\bUNITS_ROUTE\b/);
    expect(fuenteNav, 'la navegacion incrusta la URL como literal').not.toContain(UNITS_ROUTE);
  });

  // Y lo que el ancla original protegia de verdad SIGUE protegido, ahora explicito: el MODULO no
  // abre flujo navegable por su cuenta. Quien lo abre es `app/` mas `lib/shared/navigation/`; si
  // manana una ruta de pantalla, un item de menu o un import de la navegacion se colaran dentro
  // de `lib/modules/unidades/**`, esto se pone rojo.
  it('ningun archivo de lib/modules/unidades declara navegacion, ruta de pantalla ni item de menu', () => {
    expect(unidadesSources.length, 'el barrido no encontro fuentes de unidades').toBeGreaterThan(5);

    const culpables = unidadesSources.flatMap((file) =>
      declaracionesDeNavegacion(leer(file)).map((patron) => `${etiqueta(file)}: ${patron}`),
    );

    expect(culpables, culpables.join(', ')).toEqual([]);
  });

  it('y la guardia de navegacion en el modulo MUERDE ante cada forma prohibida, sin morder a lo legitimo', () => {
    expect(declaracionesDeNavegacion(`import { PRIVATE_NAV_ITEMS } from '@/lib/shared/navigation/private-nav';`)).toEqual(
      expect.arrayContaining(['lib/shared/navigation', 'PRIVATE_NAV_ITEMS']),
    );
    expect(declaracionesDeNavegacion(`const item: NavLink = { kind: 'link' };`)).toContain('NavLink');
    expect(declaracionesDeNavegacion(`export const UNIT_SCREEN_ROUTE = '/una/ruta';`)).toContain(
      'declaracion de ruta de pantalla',
    );
    expect(declaracionesDeNavegacion(`const destino = { href: '/x', testId: 'nav-unidades' };`)).toEqual(
      expect.arrayContaining(['href', 'testId']),
    );
    expect(declaracionesDeNavegacion(`redirect(UNITS_ROUTE);`)).toContain('redirect');

    // Legitimo: el modulo hace su trabajo de dominio y no habla de pantallas.
    expect(declaracionesDeNavegacion(`export async function listUnitsAction(query: UnitListQuery) {}`)).toEqual([]);
    // Ni muerde en un comentario, que ya se filtra.
    expect(declaracionesDeNavegacion(`// el item de menu vive en private-nav.ts, no aqui`)).toEqual([]);
  });

  // Segunda ancla relevada, mismo criterio que la del menu unos casos mas arriba. La puso QC-38
  // (T10) el 2026-09-08 preguntando «e2e/ no gana ningun .spec.ts nuevo», porque aquella ficha era
  // el CRUD y dejo el recorrido de extremo a extremo DIFERIDO, apuntando por nombre a QC-39.
  // **QC-39 (T14, R50) es quien lo escribe**, asi que el 2026-09-08 releva la pregunta: el ancla no
  // se borra ni se afloja —R47 manda TENSARLA—, cambia de enunciado y afirma MAS. Antes se pedia
  // «cero specs nuevos»; ahora se pide **EXACTAMENTE uno**, y ademas que sea `e2e/unidades.spec.ts`
  // y que cubra los DOS recorridos de R50. Un segundo spec inesperado lo pone rojo igual que antes
  // lo ponia rojo el primero, y borrar uno de los dos recorridos tambien. Se afirma sobre la forma
  // del archivo —la constante de ruta importada y el numero de casos `test(...)`—, nunca sobre
  // textos de interfaz, que son copy y cambian sin que cambie el contrato.
  it('e2e/ gana EXACTAMENTE un .spec.ts nuevo respecto de origin/dev, y es el de unidades', (ctx) => {
    const cambiados = archivosCambiadosDesdeDev();
    if (cambiados === null) {
      ctx.skip('el rango git origin/dev...HEAD no esta disponible: este caso no comprobo nada');
      return;
    }
    // MISMO SALTO que los dos casos de R32 (anadido el 2026-09-08): «esta ficha no abre ningun
    // flujo navegable» es una regla sobre el alcance de QC-38, no sobre el de las demas. Sin el,
    // este caso ponia en ROJO el gate completo de cualquier rama que anadiera un E2E con permiso
    // del humano -visto desde QC-70, cuyo `e2e/errores.spec.ts` lo exige su R33-.
    if (!esLaRamaDeQC38) {
      ctx.skip(
        'el rango trae archivos pero no `' + ARCHIVO_CENTRAL + '`: esta NO es la rama de ' +
          'QC-38, asi que R34 no le aplica y este caso NO ha comprobado nada.',
      );
      return;
    }

    expect(nuevosSpecsE2e(cambiados), `nuevos .spec.ts bajo e2e/: ${nuevosSpecsE2e(cambiados).join(', ')}`).toEqual([
      'e2e/unidades.spec.ts',
    ]);
  });

  it('e2e/unidades.spec.ts deriva la URL de UNITS_ROUTE y declara los DOS casos que R50 exige', () => {
    const spec = join(repoRoot, 'e2e', 'unidades.spec.ts');
    expect(existsSync(spec), `${etiqueta(spec)} debe existir`).toBe(true);

    const codigo = sinComentarios(leer(spec));
    expect(codigo, 'el spec no nombra UNITS_ROUTE: estaria incrustando la URL a mano').toMatch(
      /\bUNITS_ROUTE\b/,
    );
    // `test.describe(`, `test.beforeAll(` y compania no cuentan: solo la llamada directa `test(`.
    expect(casosTest(codigo), 'el spec no declara exactamente dos casos test(...)').toBe(2);
  });

  it('y el contador de casos MUERDE si el spec pierde un recorrido o gana uno de mas', () => {
    expect(casosTest(`test('alta', async () => {});\ntest('404', async () => {});`)).toBe(2);
    expect(casosTest(`test.describe('x', () => { test('solo uno', async () => {}); });`)).toBe(1);
    // Los ayudantes de Playwright no son casos y no deben inflar la cuenta.
    expect(casosTest(`test.beforeAll(async () => {});\ntest.setTimeout(1000);`)).toBe(0);
  });

  // Que el salto de arriba no vacie la guardia: una que se salta siempre no protege nada. Se
  // ejercita la deteccion de rama en los dos sentidos y el detector de specs con y sin violacion,
  // sin depender de en que rama corra el gate.
  it('y dentro de la rama de QC-38 la guardia de e2e/ MUERDE', () => {
    const ramaDeQC38 = [...ARCHIVOS_CENTRALES, 'lib/modules/unidades/domain/create-unit.ts'];
    expect(esRamaDeQC38(ramaDeQC38)).toBe(true);
    // El diff real de QC-70: toca `unit-actions.ts` -uno de los siete adaptadores driving que
    // migra- pero NO el puerto de escritura. Con un solo centinela esto daba `true`.
    expect(
      esRamaDeQC38([
        'lib/modules/unidades/adapters/driving/unit-actions.ts',
        'lib/modules/errores/index.ts',
        'e2e/errores.spec.ts',
      ]),
    ).toBe(false);
    expect(esRamaDeQC38(null)).toBe(false);

    expect(nuevosSpecsE2e([...ramaDeQC38, 'e2e/unidades.spec.ts'])).toEqual(['e2e/unidades.spec.ts']);
    expect(nuevosSpecsE2e([...ramaDeQC38, 'e2e/session.spec.ts', 'e2e/otra.spec.ts'])).toEqual([
      'e2e/session.spec.ts',
      'e2e/otra.spec.ts',
    ]);
    // Y no muerde con lo que NO es un spec de e2e.
    expect(nuevosSpecsE2e([...ramaDeQC38, 'e2e/helpers/datos.ts', 'tests/unit/unidades/x.test.ts'])).toEqual([]);
  });
});
