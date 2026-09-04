import { execSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { SUPPLIERS_ROUTE, supplierDetailRoute } from '@/lib/shared/routes';

/**
 * Guardias de convencion de QC-44 (`specs/QC-44-pantalla-de-proveedores/tasks.md > T17`).
 * Cubre **R2, R3, R42, R43, R44, R45, R46 y R49**.
 *
 * **Que hace este archivo y que NO.** La feature ya tiene dos guardias de contrato de ruta:
 * `supplier-route-contract.test.ts` (ruta de lista) y `catalog-route-contract.test.ts` (ruta de
 * detalle). Este archivo **no las reescribe**: solo cierra lo que ninguna de las dos vigila.
 * El reparto, explicito para que nadie duplique manana:
 *
 * | Comprobacion                                    | Donde vive                                   |
 * | ----------------------------------------------- | -------------------------------------------- |
 * | literal `'/proveedores'` y `"/proveedores"`      | las dos guardias de ruta (cada una la suya)  |
 * | literal en PLANTILLA (backtick)                  | guardia del detalle; AQUI para la lista (R2) |
 * | componentes sueltos / barrel / `use client`      | las dos guardias de ruta                     |
 * | importe por ruta profunda DESDE FUERA de la ruta | AQUI, barrido de todo el arbol (R42)         |
 * | `fetch` a `/api` propia                          | guardia de la lista                          |
 * | `fetch` a CUALQUIER ruta propia                  | guardia del detalle; AQUI para la lista (R43)|
 * | cliente que importa composicion / BD             | guardia del detalle; AQUI para la lista (R46)|
 * | `components/ui/` sin tocar                       | AQUI (R44)                                   |
 * | `package.json` sin cambios                       | AQUI (R45)                                   |
 * | `lib/modules/**`, `db/**`, composicion sin tocar | AQUI, sobre el DIFF (R49)                    |
 * | armazon privado heredado y no re-creado (R50)    | `guard-herencia-armazon-privado.test.ts`     |
 *
 * La ultima fila esta aqui solo como indice: R50 —layout, barra lateral, navegacion privada,
 * region de avisos, primitivas y utilidades de test **heredadas y no duplicadas**— vive en su
 * propio archivo porque pregunta por lo que NO existe en el arbol, no por como esta escrito lo que
 * si existe. Ese archivo **no reimplementa** el caso de `components/ui/` de aqui: lo cita, y se
 * pone rojo si desaparece. Si tocas el nombre de ese caso o el intocable `primitivas`, mira alli.
 *
 * Las tres ultimas no se pueden ver leyendo un archivo: son propiedades del **cambio**, no del
 * arbol. Se miran sobre el diff de la rama y sobre el arbol de trabajo. Y siguiendo lo que pide
 * `docs/verification.md > Rojos heredados`, cuando el rango `origin/dev..HEAD` **no existe** el
 * caso se **salta explicitamente** en vez de ponerse rojo: asi este archivo no necesita entrar en
 * `tests/baseline-rojos.json` y sus otros casos siguen mordiendo en cualquier rama.
 */

const RAIZ = join(__dirname, '..', '..', '..');

/** Las dos rutas, DERIVADAS de la constante y del helper (R2, R3): nunca escritas a mano. */
const CARPETA_LISTA = join('app', '(private)', SUPPLIERS_ROUTE.replace(/^\//, ''));
const CARPETA_DETALLE = join('app', '(private)', supplierDetailRoute('[id]').replace(/^\//, ''));

/** Carpetas del repo que se barren buscando importes por ruta profunda (R42). */
const CARPETAS_DEL_REPO = ['app', 'components', 'lib', 'tests'] as const;

/** Marca con la que esta feature firma sus commits, para separarlos de lo que llega de `dev`. */
const MARCA_DE_LA_FEATURE = 'QC-44';

/** Rutas que R44, R45 y R49 declaran intocables para esta feature. */
const INTOCABLES = {
  primitivas: 'components/ui/',
  modulos: 'lib/modules/',
  baseDeDatos: 'db/',
  composicion: 'lib/composition/index.ts',
  manifiesto: 'package.json',
} as const;

function leer(rutaRelativa: string): string {
  return readFileSync(join(RAIZ, rutaRelativa), 'utf8');
}

/** Ruta comparable en Windows y en POSIX. */
function aPosix(ruta: string): string {
  return ruta.split('\\').join('/');
}

/** Fuente sin lineas de comentario: las guardias miran codigo, no prosa. */
function fuenteSinComentarios(rutaRelativa: string): string {
  return leer(rutaRelativa)
    .split('\n')
    .filter((linea) => {
      const limpia = linea.trim();
      return !(limpia.startsWith('//') || limpia.startsWith('*') || limpia.startsWith('/*'));
    })
    .join('\n');
}

/** Todas las fuentes `.ts`/`.tsx` bajo `carpeta`, recursivo, en rutas relativas a la raiz. */
function fuentesBajo(carpeta: string): string[] {
  const encontradas: string[] = [];

  const recorrer = (directorio: string) => {
    for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
      const completa = join(directorio, entrada.name);
      if (entrada.isDirectory()) {
        if (entrada.name === 'node_modules' || entrada.name === '.next') continue;
        recorrer(completa);
        continue;
      }
      if (entrada.name.endsWith('.ts') || entrada.name.endsWith('.tsx')) {
        encontradas.push(aPosix(relative(RAIZ, completa)));
      }
    }
  };

  recorrer(join(RAIZ, carpeta));
  return encontradas.sort();
}

/** Fuentes de la ruta de LISTA, sin las de la ruta de detalle (que cuelga de la misma carpeta). */
const FUENTES_DE_LA_LISTA = fuentesBajo(CARPETA_LISTA).filter(
  (ruta) => !ruta.startsWith(`${aPosix(CARPETA_DETALLE)}/`),
);

/** Las de la lista que declaran frontera de cliente: R46 va sobre estas. */
const CLIENTES_DE_LA_LISTA = FUENTES_DE_LA_LISTA.filter((ruta) =>
  new RegExp(`^\\s*['"]use client['"]`, 'm').test(leer(ruta)),
);

function git(comando: string): string {
  return execSync(comando, { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

/**
 * Archivos que **esta feature** ha tocado: los de sus commits propios en `origin/dev..HEAD` mas
 * los del arbol de trabajo (para que la guardia muerda antes incluso de commitear).
 *
 * Devuelve `null` cuando el rango no esta disponible —no hay `origin/dev`, o ya se fusiono y no
 * quedan commits de la feature—: ahi el caso se salta, no se pone rojo. Un rango inexistente no
 * es una violacion, es la ausencia de la comprobacion, y decirlo es mas honesto que fallar.
 *
 * Los commits se filtran por la marca de la feature y NO por el rango entero a proposito: la rama
 * arrastra fusiones de `dev` con trabajo ajeno (p. ej. `components/ui/textarea.tsx`, de otra
 * feature) y atribuirselo a QC-44 pondria la guardia roja por algo que QC-44 no hizo.
 */
function archivosTocadosPorLaFeature(): string[] | null {
  let commits: string[];
  try {
    commits = git(`git log --no-merges --format=%H "--grep=${MARCA_DE_LA_FEATURE}" origin/dev..HEAD`)
      .split('\n')
      .map((linea) => linea.trim())
      .filter((linea) => linea.length > 0);
  } catch {
    return null;
  }

  if (commits.length === 0) return null;

  // Un solo `git show` para todos los commits en vez de uno por commit: arrancar `git` en Windows
  // no es barato y esto se paga una vez por archivo de test.
  const tocados = new Set<string>();
  for (const ruta of git(`git show --pretty=format: --name-only ${commits.join(' ')}`).split('\n')) {
    const limpia = ruta.trim();
    if (limpia.length > 0) tocados.add(aPosix(limpia));
  }

  // El arbol de trabajo cuenta: crear un archivo en `components/ui/` y no commitearlo sigue
  // siendo crearlo.
  for (const linea of git('git status --porcelain').split('\n')) {
    if (linea.trim().length === 0) continue;
    const camino = linea.slice(3).trim();
    const destino = camino.includes(' -> ') ? camino.split(' -> ')[1] : camino;
    tocados.add(aPosix(destino.replace(/^"|"$/g, '')));
  }

  return [...tocados].sort();
}

/**
 * Se calcula UNA vez, al cargar el archivo, y no dentro de cada caso: los tres casos del diff
 * preguntan lo mismo, y hacerlo dentro del caso lo dejaba a merced del timeout de test cuando la
 * suite corre en paralelo y `git` tarda en arrancar.
 */
const TOCADOS_POR_LA_FEATURE = archivosTocadosPorLaFeature();

describe('convenciones de la feature de proveedores', () => {
  it('la ruta de lista no construye la URL con una plantilla sobre el literal', () => {
    // R2, R3 — las dos guardias de ruta ya prohiben `'/proveedores'` y `"/proveedores"`. Falta la
    // tercera forma de escribir una cadena en TypeScript, que es justo la que usaria quien quisiera
    // montar la URL del detalle a mano: `` `/proveedores/${id}` ``. Se deriva del helper o no se
    // escribe. La guardia del detalle ya vigila esa tercera forma en SU ruta; esta es la mitad
    // que faltaba.
    const enPlantilla = `\`${SUPPLIERS_ROUTE}`;

    for (const archivo of FUENTES_DE_LA_LISTA) {
      expect(leer(archivo), `${archivo} incrusta ${enPlantilla} en una plantilla`).not.toContain(
        enPlantilla,
      );
    }
  });

  it('nadie fuera de las dos rutas importa sus componentes por ruta profunda', () => {
    // R42 — las guardias de ruta miran a `page.tsx` importando su propio barrel. Esto mira el otro
    // lado: cualquier archivo del repo que se salte el barrel y entre por el archivo concreto.
    // El barrel existe para que la ruta pueda reorganizar sus componentes sin romper a nadie; un
    // importe profundo desde fuera lo anula.
    const barriles = [
      `@/${aPosix(CARPETA_LISTA)}/components`,
      `@/${aPosix(CARPETA_DETALLE)}/components`,
    ];

    const profundos: string[] = [];
    for (const carpeta of CARPETAS_DEL_REPO) {
      for (const archivo of fuentesBajo(carpeta)) {
        if (archivo.startsWith(`${aPosix(CARPETA_LISTA)}/`)) continue;
        const fuente = fuenteSinComentarios(archivo);
        for (const barril of barriles) {
          const profundo = new RegExp(
            `from '${barril.replace(/[[\]()]/g, (c) => `\\${c}`)}/[^']+'`,
          );
          if (profundo.test(fuente)) profundos.push(`${archivo} -> ${barril}/...`);
        }
      }
    }

    expect(profundos, `importes por ruta profunda: ${profundos.join(', ')}`).toEqual([]);
  });

  it('la ruta de lista no llama a ninguna ruta propia con fetch', () => {
    // R43 — la guardia de la lista solo prohibe `fetch('/api...')`. Una ruta propia no tiene por
    // que colgar de `/api`: toda lectura y toda mutacion pasan por Server Actions, asi que ningun
    // `fetch` a una ruta del propio origen —absoluta o relativa— es legitimo aqui. La guardia del
    // detalle ya lo vigila para su ruta.
    for (const archivo of FUENTES_DE_LA_LISTA) {
      const fuente = fuenteSinComentarios(archivo);
      expect(fuente, `${archivo} llama a una ruta propia con fetch`).not.toMatch(
        /fetch\(\s*['"`]\//,
      );
      expect(fuente, `${archivo} llama a una ruta propia con fetch`).not.toMatch(
        /fetch\(\s*['"`]\.{1,2}\//,
      );
    }
  });

  it('ningun componente de cliente de la lista importa la composicion ni la base de datos', () => {
    // R46 — los datos bajan por props desde el Server Component o llegan por Server Action. Un
    // componente de cliente que importe `lib/composition` o el cliente de base de datos arrastraria
    // Prisma —y las credenciales— al navegador. La guardia del detalle ya lo comprueba para su
    // ruta; esta es la mitad que faltaba.
    expect(CLIENTES_DE_LA_LISTA.length, 'la lista deberia tener componentes de cliente').toBeGreaterThan(0);

    for (const archivo of CLIENTES_DE_LA_LISTA) {
      const fuente = fuenteSinComentarios(archivo);
      expect(fuente, `${archivo} importa la composicion`).not.toContain('@/lib/composition');
      expect(fuente, `${archivo} importa el cliente de base de datos`).not.toContain(
        '@/lib/shared/db',
      );
      expect(fuente, `${archivo} importa Prisma`).not.toContain('@prisma/client');
      expect(fuente, `${archivo} importa el esquema de datos`).not.toContain('@/db');
    }
  });

  it('la feature no edita ni crea nada en components/ui/', (ctx) => {
    // R44 — las primitivas entran por `npx shadcn add` y se dejan como llegan. Editarlas a mano
    // convierte una copia versionada de la libreria en un fork silencioso que nadie vuelve a poder
    // regenerar.
    const tocados = TOCADOS_POR_LA_FEATURE;
    if (tocados === null) {
      ctx.skip(
        'el rango git origin/dev..HEAD no tiene commits de esta feature: no hay diff que mirar',
      );
      return;
    }

    const primitivas = tocados.filter((ruta) => ruta.startsWith(INTOCABLES.primitivas));
    expect(primitivas, `la feature toca primitivas de UI: ${primitivas.join(', ')}`).toEqual([]);
  });

  it('la feature no cambia package.json', (ctx) => {
    // R45 — ninguna dependencia nueva. El formulario se construye con `<form action>` +
    // `useActionState`, que ya estan en el repo. Se comprueba por dos vias porque miden cosas
    // distintas: que la feature no lo haya tocado, y que su contenido siga siendo el de `dev`.
    const tocados = TOCADOS_POR_LA_FEATURE;
    if (tocados === null) {
      ctx.skip(
        'el rango git origin/dev..HEAD no tiene commits de esta feature: no hay diff que mirar',
      );
      return;
    }

    expect(
      tocados.filter((ruta) => ruta === INTOCABLES.manifiesto),
      'la feature toca package.json',
    ).toEqual([]);

    const enDev = JSON.parse(git(`git show origin/dev:${INTOCABLES.manifiesto}`)) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const aqui = JSON.parse(leer(INTOCABLES.manifiesto)) as typeof enDev;

    expect(aqui.dependencies ?? {}, 'las dependencias no son las de dev').toEqual(
      enDev.dependencies ?? {},
    );
    expect(aqui.devDependencies ?? {}, 'las dependencias de desarrollo no son las de dev').toEqual(
      enDev.devDependencies ?? {},
    );
  });

  it('la feature no modifica los modulos, el esquema de datos ni el punto de composicion', (ctx) => {
    // R49 — los modulos se consumen solo por su contrato publico y sus adaptadores driving, ya
    // existentes. La guardia del detalle comprueba los IMPORTES; esto comprueba el CAMBIO, que es
    // lo unico que puede delatar una edicion en un archivo que la ruta ni siquiera importa.
    // `lib/composition/route-role-rules.ts` SI se modifica: lo autoriza R6 y por eso el intocable
    // es el barrel `index.ts`, no la carpeta entera.
    const tocados = TOCADOS_POR_LA_FEATURE;
    if (tocados === null) {
      ctx.skip(
        'el rango git origin/dev..HEAD no tiene commits de esta feature: no hay diff que mirar',
      );
      return;
    }

    const prohibidos = tocados.filter(
      (ruta) =>
        ruta.startsWith(INTOCABLES.modulos) ||
        ruta.startsWith(INTOCABLES.baseDeDatos) ||
        ruta === INTOCABLES.composicion,
    );

    expect(prohibidos, `la feature toca archivos intocables: ${prohibidos.join(', ')}`).toEqual([]);
  });
});
