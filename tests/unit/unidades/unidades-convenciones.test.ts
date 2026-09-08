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
  it('db/schema.prisma no cambia respecto de origin/dev', (ctx) => {
    const cambiados = archivosCambiadosDesdeDev();
    if (cambiados === null) {
      ctx.skip('el rango git origin/dev...HEAD no esta disponible: este caso no comprobo nada');
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
// R34 — ninguna pantalla, ruta ni item de menu de unidades; ningun .spec.ts nuevo en e2e/.
// -------------------------------------------------------------------------------------------

describe('R34 — esta ficha no abre ningun flujo navegable', () => {
  it('no existe ninguna pantalla de unidades bajo app/(private)/', () => {
    for (const ruta of [
      join(repoRoot, 'app', '(private)', 'unidades'),
      join(repoRoot, 'app', '(private)', 'units'),
    ]) {
      expect(existsSync(ruta), `${etiqueta(ruta)} no debe existir`).toBe(false);
    }
  });

  it('ningun archivo de navegacion privada declara un item de menu de unidades', () => {
    const nav = join(repoRoot, 'lib', 'shared', 'navigation', 'private-nav.ts');
    if (!existsSync(nav)) return;

    const fuente = sinComentarios(leer(nav));
    expect(fuente, 'la navegacion privada nombra unidades').not.toMatch(/\bunidades\b/i);
  });

  it('e2e/ no gana ningun archivo .spec.ts nuevo respecto de origin/dev', (ctx) => {
    const cambiados = archivosCambiadosDesdeDev();
    if (cambiados === null) {
      ctx.skip('el rango git origin/dev...HEAD no esta disponible: este caso no comprobo nada');
      return;
    }

    const nuevosSpecs = cambiados.filter((ruta) => ruta.startsWith('e2e/') && ruta.endsWith('.spec.ts'));
    expect(nuevosSpecs, `nuevos .spec.ts bajo e2e/: ${nuevosSpecs.join(', ')}`).toEqual([]);
  });
});
