import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

import { SUPPLIERS_ROUTE, supplierDetailRoute } from '@/lib/shared/routes';

/**
 * Guardia de **herencia del armazon privado** de QC-44. Cubre **R50** y solo R50
 * (`specs/QC-44-pantalla-de-proveedores/requirements.md`), que es el unico requisito de la
 * ficha sin ningun test: el layout privado, la barra lateral, la navegacion privada, la region
 * de avisos, las primitivas ya instaladas y las utilidades de test **se heredan montadas** y no
 * se re-crean ni se duplican.
 *
 * **Por que un archivo nuevo y no una seccion mas en `guard-convenciones-proveedores.test.ts`.**
 * Aquel archivo tiene una tabla de reparto en su cabecera para que nadie duplique, y sus casos
 * responden a una pregunta distinta: *como esta escrita* la feature (literales, barriles, fetch,
 * importes de cliente) y *que archivos ajenos toca*. R50 pregunta otra cosa: *que NO existe* en el
 * arbol. Su barrido es el arbol de archivos completo —incluido `components/`, que ninguna guardia
 * de ruta mira— y su motivo tambien es otro: `design.md > 0` («Conclusion operativa») lo ata al
 * choque entre las features 4 y 10 que ya ocurrio una vez en este repo, y que es lo que hizo que
 * `tasks.md` abra con T0. Mezclarlo alli habria escondido ese motivo dentro de otra tabla. La fila
 * queda anotada en la tabla de reparto del archivo hermano, que sigue siendo el indice.
 *
 * **Lo que NO hace este archivo, a proposito:** no vuelve a comprobar que la feature deje
 * `components/ui/` sin tocar. Eso es la parte de «las primitivas ya instaladas» de R50 y **ya la
 * vigila** `guard-convenciones-proveedores.test.ts > la feature no edita ni crea nada en
 * components/ui/` (R44, sobre el diff). Aqui solo se comprueba que esa guardia **sigue existiendo**
 * y sigue mirando `components/ui/`: si alguien la borra, R50 se queda sin esa mitad y este caso lo
 * dice, en vez de duplicar la comprobacion y que manana haya dos que se contradigan.
 *
 * **Barrido de arbol, no de grafo de importes.** Un componente duplicado que nadie importa todavia
 * sigue siendo un duplicado: es justo la forma en que dos features en paralelo se pisan. Por eso se
 * mira `readdirSync`, no los `import`.
 *
 * El unico caso que necesita `git` —«no hay componente nuevo en `components/`»— se **salta
 * explicitamente** cuando el rango no existe (`docs/verification.md > Rojos heredados`), y usa el
 * MISMO criterio que el archivo hermano: commits del rango filtrados por la marca `QC-44` mas el
 * arbol de trabajo. El rango entero no vale: arrastra fusiones de `dev` con trabajo ajeno
 * (`components/ui/textarea.tsx` viene de `1b88d69 fix(ui)`, que no es de QC-44).
 */

const RAIZ = join(__dirname, '..', '..', '..');

/** Las dos carpetas de la feature, DERIVADAS de la constante y del helper: nunca escritas a mano. */
const CARPETA_LISTA = join('app', '(private)', SUPPLIERS_ROUTE.replace(/^\//, ''));
const CARPETA_DETALLE = join('app', '(private)', supplierDetailRoute('[id]').replace(/^\//, ''));

/** El armazon que se hereda: existe una vez, aqui, y esta feature no lo replica. */
const LAYOUT_PRIVADO = join('app', '(private)', 'layout.tsx');
const HELPER_DE_VIEWPORT = join('tests', 'helpers', 'viewport.ts');

/** La guardia hermana que ya cubre la parte de «primitivas ya instaladas» (R44). */
const GUARDIA_DE_CONVENCIONES = join(
  'tests',
  'unit',
  'proveedores-ui',
  'guard-convenciones-proveedores.test.ts',
);

/** Marca con la que esta feature firma sus commits, para separarlos de lo que llega de `dev`. */
const MARCA_DE_LA_FEATURE = 'QC-44';

/**
 * Nombres de archivo que delatarian una re-creacion del armazon: barra lateral, navegacion privada
 * o region de avisos. Se mira el NOMBRE porque es lo que se ve en el arbol antes de que nadie
 * importe nada.
 */
const NOMBRES_DE_ARMAZON = /(sidebar|(^|-)nav(-|\.)|navigation|toaster)/i;

/** Marcas de que un archivo MONTA la region de avisos, en vez de limitarse a emitir un aviso. */
const MONTA_REGION_DE_AVISOS = /<\s*Toaster\b/;

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

/** Todos los archivos bajo `carpeta`, recursivo, en rutas relativas a la raiz (cualquier extension). */
function archivosBajo(carpeta: string): string[] {
  const encontrados: string[] = [];

  const recorrer = (directorio: string) => {
    for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
      const completa = join(directorio, entrada.name);
      if (entrada.isDirectory()) {
        if (entrada.name === 'node_modules' || entrada.name === '.next') continue;
        recorrer(completa);
        continue;
      }
      encontrados.push(aPosix(relative(RAIZ, completa)));
    }
  };

  recorrer(join(RAIZ, carpeta));
  return encontrados.sort();
}

/** Fuentes `.ts`/`.tsx` bajo `carpeta`. */
function fuentesBajo(carpeta: string): string[] {
  return archivosBajo(carpeta).filter((ruta) => ruta.endsWith('.ts') || ruta.endsWith('.tsx'));
}

/** Todo lo que cuelga de las dos rutas de la feature (el detalle cuelga de la lista). */
const ARCHIVOS_DE_LA_FEATURE = archivosBajo(CARPETA_LISTA);

/**
 * Barrer la carpeta de la lista cubre tambien la del detalle **porque el detalle cuelga de ella**,
 * y eso no es un supuesto: se comprueba aqui, derivado del helper de ruta. Si manana el detalle
 * dejara de colgar de la lista, todos los casos de este archivo se quedarian mirando media feature
 * en silencio.
 */
const DETALLE_CUELGA_DE_LA_LISTA = aPosix(CARPETA_DETALLE).startsWith(`${aPosix(CARPETA_LISTA)}/`);

function git(comando: string): string {
  return execSync(comando, { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

/**
 * Archivos que **esta feature** ha tocado. Mismo criterio que
 * `guard-convenciones-proveedores.test.ts` (ver su cabecera): commits propios del rango
 * `origin/dev..HEAD` filtrados por la marca, mas el arbol de trabajo.
 *
 * `null` cuando el rango no esta disponible: ahi el caso se salta, no se pone rojo.
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

  const tocados = new Set<string>();
  for (const ruta of git(`git show --pretty=format: --name-only ${commits.join(' ')}`).split('\n')) {
    const limpia = ruta.trim();
    if (limpia.length > 0) tocados.add(aPosix(limpia));
  }

  for (const linea of git('git status --porcelain').split('\n')) {
    if (linea.trim().length === 0) continue;
    const camino = linea.slice(3).trim();
    const destino = camino.includes(' -> ') ? camino.split(' -> ')[1] : camino;
    tocados.add(aPosix(destino.replace(/^"|"$/g, '')));
  }

  return [...tocados].sort();
}

/** Se calcula UNA vez al cargar el archivo: arrancar `git` en Windows no es barato. */
const TOCADOS_POR_LA_FEATURE = archivosTocadosPorLaFeature();

describe('herencia del armazon privado en la feature de proveedores (R50)', () => {
  it('las dos rutas no declaran ningun layout propio: heredan el de la zona privada', () => {
    // R50 — el layout privado (sesion, `SidebarProvider`, cabecera, `<Toaster />`) existe una sola
    // vez. Un `layout.tsx` en `proveedores/` o en `[id]/` no «personaliza» nada: anida un segundo
    // armazon dentro del heredado y duplica lo que el padre ya monta.
    expect(
      DETALLE_CUELGA_DE_LA_LISTA,
      `${aPosix(CARPETA_DETALLE)} ya no cuelga de ${aPosix(CARPETA_LISTA)}: el barrido de este archivo se quedaria corto`,
    ).toBe(true);

    const propios = ARCHIVOS_DE_LA_FEATURE.filter((ruta) => basename(ruta) === 'layout.tsx');

    expect(propios, `las rutas declaran layout propio: ${propios.join(', ')}`).toEqual([]);

    // Y el que se hereda sigue en su sitio: sin el, la ausencia de arriba no probaria herencia,
    // probaria que no hay layout en absoluto.
    expect(existsSync(join(RAIZ, LAYOUT_PRIVADO)), `falta ${aPosix(LAYOUT_PRIVADO)}`).toBe(true);
  });

  it('las dos rutas no traen componente propio de barra lateral, navegacion ni avisos', () => {
    // R50 — barrido por NOMBRE de archivo en el arbol de las dos rutas. Un `supplier-sidebar.tsx`
    // o un `catalog-nav.tsx` seria exactamente la re-creacion que R50 prohibe, y se veria en el
    // arbol antes de que nadie lo importase.
    const sospechosos = ARCHIVOS_DE_LA_FEATURE.filter((ruta) =>
      NOMBRES_DE_ARMAZON.test(basename(ruta)),
    );

    expect(
      sospechosos,
      `las rutas re-crean piezas del armazon: ${sospechosos.join(', ')}`,
    ).toEqual([]);
  });

  it('las dos rutas no montan la barra lateral ni la navegacion privada', () => {
    // R50 — la otra mitad del caso anterior: el nombre puede disfrazarse, el montaje no. Las
    // pantallas son contenido DENTRO del armazon; montar `SidebarProvider` o `AppSidebar` aqui
    // anidaria una segunda barra lateral dentro de la heredada.
    //
    // Leer etiquetas de `private-nav` SI es legitimo y no se toca: `page.tsx` lo hace para el
    // titulo (R4). Consumir la navegacion no es re-crearla.
    for (const archivo of fuentesBajo(CARPETA_LISTA)) {
      const fuente = fuenteSinComentarios(archivo);
      expect(fuente, `${archivo} monta la barra lateral`).not.toMatch(/<\s*SidebarProvider\b/);
      expect(fuente, `${archivo} monta la barra lateral`).not.toMatch(/<\s*AppSidebar\b/);
      expect(fuente, `${archivo} importa el componente de barra lateral`).not.toContain(
        '@/components/private/app-sidebar',
      );
      expect(fuente, `${archivo} redefine los items de navegacion privada`).not.toMatch(
        /(const|let)\s+\w*NAV_ITEMS\w*\s*=/,
      );
    }
  });

  it('la region de avisos sigue montada solo en el layout privado', () => {
    // R50 — la feature emite avisos (`toast(...)` desde `sonner`), que es lo correcto, pero NO
    // monta un segundo `<Toaster />`. Dos regiones en el arbol duplican cada aviso y rompen el
    // anuncio de lectores de pantalla, que veria dos `aria-live` compitiendo.
    //
    // Se afirma sobre el arbol entero de `app/` y `components/`, no solo sobre las dos rutas: el
    // duplicado podria colarse en un componente compartido que la feature monte.
    const montadores = [...fuentesBajo('app'), ...fuentesBajo('components')].filter(
      (archivo) =>
        // `components/ui/sonner.tsx` DEFINE el primitivo (`export function Toaster`), no lo monta.
        archivo !== 'components/ui/sonner.tsx' &&
        MONTA_REGION_DE_AVISOS.test(fuenteSinComentarios(archivo)),
    );

    // La zona publica monta la suya; en la privada, el unico es el layout heredado.
    const enLaZonaPrivada = montadores.filter((archivo) => archivo.includes('/(private)/'));

    expect(
      enLaZonaPrivada,
      `hay mas de una region de avisos en la zona privada: ${enLaZonaPrivada.join(', ')}`,
    ).toEqual([aPosix(LAYOUT_PRIVADO)]);

    const enLasRutas = montadores.filter((archivo) => archivo.startsWith(`${aPosix(CARPETA_LISTA)}/`));
    expect(
      enLasRutas,
      `la feature monta su propia region de avisos: ${enLasRutas.join(', ')}`,
    ).toEqual([]);
  });

  it('la feature no anade ningun componente de armazon a components/', (ctx) => {
    // R50 — la parte que el arbol no puede contestar solo: `components/private/app-sidebar.tsx` y
    // `components/ui/sonner.tsx` ya existian, asi que lo que hay que mirar es si esta feature ha
    // CREADO o EDITADO algo ahi. Se mira sobre el cambio, con el criterio del archivo hermano.
    //
    // `components/shared/presentation-select.tsx` SI lo toca la feature y es legitimo: es la
    // reubicacion que declara `design.md > 8.1`, y no es una pieza del armazon.
    const tocados = TOCADOS_POR_LA_FEATURE;
    if (tocados === null) {
      ctx.skip(
        'el rango git origin/dev..HEAD no tiene commits de esta feature: no hay diff que mirar',
      );
      return;
    }

    const armazon = tocados.filter(
      (ruta) =>
        ruta.startsWith('components/') &&
        (ruta.startsWith('components/private/') || NOMBRES_DE_ARMAZON.test(basename(ruta))),
    );

    expect(
      armazon,
      `la feature crea o edita piezas del armazon en components/: ${armazon.join(', ')}`,
    ).toEqual([]);
  });

  it('la parte de «primitivas ya instaladas» la cubre la guardia de convenciones, y sigue viva', () => {
    // R50 y R44 — no se duplica la comprobacion: se CITA. Si alguien borra ese caso, esta feature
    // se queda sin la mitad de R50 que vigila `components/ui/` y nadie se entera; esto lo grita.
    expect(
      existsSync(join(RAIZ, GUARDIA_DE_CONVENCIONES)),
      `falta ${aPosix(GUARDIA_DE_CONVENCIONES)}, que es quien vigila components/ui/`,
    ).toBe(true);

    const guardia = leer(GUARDIA_DE_CONVENCIONES);
    expect(
      guardia,
      'la guardia de convenciones ya no comprueba que components/ui/ quede sin tocar',
    ).toContain('la feature no edita ni crea nada en components/ui/');
    expect(guardia, 'la guardia de convenciones ya no mira components/ui/').toContain(
      "primitivas: 'components/ui/'",
    );
  });

  it('los tests de la feature importan el helper de viewport heredado, no lo reimplementan', () => {
    // R50 — `tests/helpers/viewport.ts` es la utilidad de test que se hereda. Una copia suya en
    // otro archivo no es un detalle de estilo: el stub de `matchMedia` es global, y dos versiones
    // divergentes vuelven el resultado dependiente de que archivo cargo antes.
    expect(existsSync(join(RAIZ, HELPER_DE_VIEWPORT)), `falta ${aPosix(HELPER_DE_VIEWPORT)}`).toBe(
      true,
    );

    // **Alcance: los archivos de test de ESTA feature**, que son los suyos de
    // `tests/unit/proveedores-ui/` mas cualquier otro bajo `tests/` que la feature haya tocado.
    // No se barre `tests/` entero a proposito: `tests/unit/theme/*` instala su propio doble de
    // `matchMedia` para `prefers-color-scheme` —otra consulta, otra feature, y anterior a esta—,
    // y ponerse rojo por eso seria un rojo heredado que R50 no reclama
    // (`docs/verification.md > Rojos heredados`). R50 habla de lo que duplica QC-44.
    const tocadosBajoTests = (TOCADOS_POR_LA_FEATURE ?? []).filter(
      (ruta) => ruta.startsWith('tests/') && /\.tsx?$/.test(ruta) && existsSync(join(RAIZ, ruta)),
    );
    const alcance = [
      ...new Set([...fuentesBajo(join('tests', 'unit', 'proveedores-ui')), ...tocadosBajoTests]),
    ].sort();

    const copias: string[] = [];
    for (const archivo of alcance) {
      if (archivo === aPosix(HELPER_DE_VIEWPORT)) continue;
      const fuente = fuenteSinComentarios(archivo);

      // Reexportar o redeclarar la API del helper, o instalar el stub de `matchMedia` a mano:
      // las tres son la misma duplicacion, escrita de tres formas.
      if (
        /export\s+(const|function)\s+(setViewportWidth|resetViewport|WIDE_VIEWPORT|NARROW_VIEWPORT)\b/.test(
          fuente,
        ) ||
        /Object\.defineProperty\(\s*window\s*,\s*['"]matchMedia['"]/.test(fuente) ||
        /window\.matchMedia\s*=/.test(fuente)
      ) {
        copias.push(archivo);
      }
    }

    expect(copias, `el helper de viewport esta duplicado en: ${copias.join(', ')}`).toEqual([]);

    // Y la feature lo USA: si ningun test suyo lo importara, la ausencia de copias no probaria
    // herencia, probaria que el helper no hace falta aqui.
    const usuarios = fuentesBajo(join('tests', 'unit', 'proveedores-ui')).filter((archivo) =>
      /from\s+['"][^'"]*helpers\/viewport['"]/.test(leer(archivo)),
    );

    expect(
      usuarios.length,
      'ningun test de la feature importa tests/helpers/viewport.ts',
    ).toBeGreaterThan(0);
  });
});
