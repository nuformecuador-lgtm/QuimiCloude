import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PERMISSIONS } from '@/lib/modules/identity';
import { PRIVATE_NAV_ITEMS, type NavLink } from '@/lib/shared/navigation/private-nav';
import { DASHBOARD_ROUTE, executionTraceRoute } from '@/lib/shared/routes';

/**
 * Contrato de la ruta del dashboard: R1, R6, R7, R8, R9, R10, R11 y R12
 * (`specs/QC-12-dashboard-en-blanco/tasks.md > T4`).
 *
 * **Guardias de codigo, sin DOM.** Todo lo que esta feature promete «no hacer» —no consultar
 * datos, no validar sesion, no incrustar rutas literales, no tocar la navegacion— es
 * invisible renderizando: si manana la pantalla empezase a leer cookies o a redirigir, ningun
 * assert de DOM se pondria rojo. Mismo patron que las guardias de
 * `tests/unit/private-layout.test.tsx`.
 *
 * Nota del 2026-10-08 (QC-167 T12, R20, R25): el area se rellena con la lista del recorrido y
 * nace la pagina de detalle. R6, R7 y R8 siguen aplicandose enteros a `page.tsx` y
 * `dashboard-content.tsx`, porque la consulta vive en la seccion y no en ellos; la seccion, la
 * tabla y el detalle entran en las fuentes vigiladas por `100vh` / `hover`, y la ruta del detalle
 * se deriva de `executionTraceRoute`.
 */

const RAIZ = join(__dirname, '..', '..');

/** Fuente sin lineas de comentario: las guardias miran codigo, no prosa. */
function fuenteSinComentarios(rutaRelativa: string): string {
  return readFileSync(join(RAIZ, rutaRelativa), 'utf8')
    .split('\n')
    .filter((linea) => {
      const limpia = linea.trim();
      return !(limpia.startsWith('//') || limpia.startsWith('*') || limpia.startsWith('/*'));
    })
    .join('\n');
}

/**
 * Ruta del archivo de pagina **derivada de la constante**, no escrita a mano (R10).
 *
 * El nombre de la carpeta es el unico punto del repo donde la ruta aparece como texto, y solo
 * porque el App Router lo exige; el route group `(private)` no aporta segmento de URL.
 */
const PAGE_PATH = `app/(private)${DASHBOARD_ROUTE}/page.tsx`;
const CONTENT_PATH = `app/(private)${DASHBOARD_ROUTE}/components/dashboard-content.tsx`;
const BARREL_PATH = `app/(private)${DASHBOARD_ROUTE}/components/index.ts`;

/** Las dos fuentes de la feature que renderizan algo. */
const FUENTES_DE_LA_PANTALLA = [PAGE_PATH, CONTENT_PATH] as const;

/**
 * 2026-10-08: el segmento dinamico del detalle sale de `executionTraceRoute` con el nombre de
 * parametro del App Router, nunca de un literal `recorrido`.
 */
const DETAIL_DIR = `app/(private)${executionTraceRoute('[id]')}`;
const DETAIL_PAGE_PATH = `${DETAIL_DIR}/page.tsx`;
const DETAIL_COMPONENT_PATH = `${DETAIL_DIR}/components/execution-trace-detail.tsx`;
const SECTION_PATH = `app/(private)${DASHBOARD_ROUTE}/components/execution-trace-list-section.tsx`;
const TABLE_PATH = `app/(private)${DASHBOARD_ROUTE}/components/execution-trace-table.tsx`;

/**
 * 2026-10-08: lo que vigila la regla multiplataforma. Amplia `FUENTES_DE_LA_PANTALLA` sin
 * sustituirla: R6, R7 y R8 siguen midiendose solo sobre la pagina y el area.
 */
const FUENTES_MULTIPLATAFORMA = [
  ...FUENTES_DE_LA_PANTALLA,
  SECTION_PATH,
  TABLE_PATH,
  DETAIL_PAGE_PATH,
  DETAIL_COMPONENT_PATH,
] as const;

/**
 * El **unico** import de `lib/modules/` que `page.tsx` tiene permitido (QC-75 R6, R10).
 *
 * Se declara como constante y de aqui sale tanto la excepcion del caso negativo como el caso
 * positivo: si el helper se moviera de archivo, ambos se ponen rojos a la vez en vez de quedar uno
 * vigilando una ruta que ya no existe.
 */
const HELPER_PERMISO_NOMBRE = 'requirePagePermission';
const HELPER_PERMISO_MODULO = '@/lib/modules/identity/adapters/driving/require-page-permission';

/** La linea exacta del import permitido, en cualquiera de las dos comillas y con o sin `;`. */
const IMPORT_PERMITIDO = new RegExp(
  `^import\\s*\\{\\s*${HELPER_PERMISO_NOMBRE}\\s*\\}\\s*from\\s*['"]${HELPER_PERMISO_MODULO}['"];?$`,
);

/** Lo que R6 prohibe a la pantalla: datos, red, cookies y cualquier atajo a la composicion. */
const PROHIBIDOS_DE_DATOS = [
  'fetch(',
  'cookies',
  'prisma',
  'supabase',
  '@/lib/composition',
  '@/lib/modules/',
] as const;

/**
 * Descuenta **solo** la linea del import permitido. No se salta el archivo entero ni relaja la
 * lista: quita esa linea y despues juzga todo lo demas con la prohibicion completa.
 */
function sinElImportDelHelper(codigo: string): string {
  return codigo
    .split('\n')
    .filter((linea) => !IMPORT_PERMITIDO.test(linea.trim()))
    .join('\n');
}

/** Los textos prohibidos que el codigo dado contiene. Vacio = limpio. */
function infraccionesDeDatos(codigo: string): string[] {
  const enMinusculas = codigo.toLowerCase();
  return PROHIBIDOS_DE_DATOS.filter((prohibido) => enMinusculas.includes(prohibido.toLowerCase()));
}

describe('contrato de la ruta del dashboard', () => {
  it('la pagina vive en la ruta que declara DASHBOARD_ROUTE', () => {
    // R1
    expect(existsSync(join(RAIZ, PAGE_PATH)), `deberia existir ${PAGE_PATH}`).toBe(true);
    expect(existsSync(join(RAIZ, CONTENT_PATH)), `deberia existir ${CONTENT_PATH}`).toBe(true);
    expect(existsSync(join(RAIZ, BARREL_PATH)), `deberia existir ${BARREL_PATH}`).toBe(true);
  });

  it('R20: la pagina del detalle vive en la ruta que declara executionTraceRoute', () => {
    // Anadido el 2026-10-08 (QC-167 T12). Sin esto, renombrar la carpeta dejaria los enlaces de
    // la lista apuntando a un 404 sin que nada se pusiera rojo.
    expect(DETAIL_DIR.startsWith(`app/(private)${DASHBOARD_ROUTE}/`)).toBe(true);
    expect(existsSync(join(RAIZ, DETAIL_PAGE_PATH)), `deberia existir ${DETAIL_PAGE_PATH}`).toBe(
      true,
    );
    expect(
      existsSync(join(RAIZ, DETAIL_COMPONENT_PATH)),
      `deberia existir ${DETAIL_COMPONENT_PATH}`,
    ).toBe(true);
  });

  it('la ubicacion de la ruta se deriva de DASHBOARD_ROUTE y la pagina no incrusta literales de ruta', () => {
    // R10 — la ruta esperada sale de la constante; la pagina no repite ese texto por su cuenta.
    expect(existsSync(join(RAIZ, PAGE_PATH))).toBe(true);

    const codigo = fuenteSinComentarios(PAGE_PATH);
    expect(codigo, `page.tsx no debe incrustar el literal «${DASHBOARD_ROUTE}»`).not.toContain(
      DASHBOARD_ROUTE,
    );
  });

  // ACOTADO por QC-75 T12 (antes: prohibicion ciega sobre las dos fuentes).
  //
  // QC-12 R6 afirma que esta pantalla **no consulta datos**, y sigue siendo cierto. Lo que cambio
  // es que QC-75 R6 mete en `page.tsx` el corte por permiso: una linea que importa
  // `requirePagePermission` de `lib/modules/identity`. Ese helper NO trae datos del dashboard:
  // resuelve **la misma lectura de sesion que el layout privado ya hace** (R19) y decide servir,
  // redirigir al login o responder 404. Es control de acceso, no una consulta — y tiene que vivir
  // en la pagina porque layout y pagina se renderizan en paralelo (`design.md > 2.1`).
  //
  // Por eso la excepcion es de **una linea concreta**, no del archivo: se descuenta el import
  // permitido y despues se aplica la lista entera. Saltarse `page.tsx` con un `continue` habria
  // apagado el centinela justo donde mas facil es colar una consulta.
  it('la pantalla no consulta datos, red ni cookies (salvo el corte por permiso de la pagina)', () => {
    // R6 — el componente de ruta sigue con la prohibicion ENTERA: ni una excepcion.
    expect(
      infraccionesDeDatos(fuenteSinComentarios(CONTENT_PATH)),
      `${CONTENT_PATH} no debe consultar datos, red, cookies ni composicion`,
    ).toEqual([]);

    // Y la pagina, con la lista completa aplicada a todo lo que no sea esa unica linea.
    expect(
      infraccionesDeDatos(sinElImportDelHelper(fuenteSinComentarios(PAGE_PATH))),
      `${PAGE_PATH} solo puede importar «${HELPER_PERMISO_MODULO}» de lib/modules`,
    ).toEqual([]);
  });

  it('la pagina exige dashboard.consultar y ese import permitido existe de verdad', () => {
    // QC-75 R6, R10 — parte POSITIVA, para que la excepcion de arriba no pueda quedar verde por
    // vacuidad: si manana alguien borrase el corte por permiso, no habria nada que descontar y la
    // prohibicion volveria a pasar en silencio con la pantalla desprotegida.
    //
    // El codigo se DERIVA del catalogo de `identity`, nunca se escribe a mano: si lo renombraran,
    // esto se pone rojo en vez de vigilar un permiso inexistente.
    const permiso = PERMISSIONS.find(
      (entrada) => entrada.module === 'dashboard' && entrada.action === 'consultar',
    );
    expect(permiso, 'el catalogo de identity deberia tener dashboard.consultar').toBeDefined();

    const codigo = fuenteSinComentarios(PAGE_PATH);
    expect(codigo, `${PAGE_PATH} deberia exigir su permiso`).toContain(
      `${HELPER_PERMISO_NOMBRE}('${permiso?.code}')`,
    );

    expect(
      codigo.split('\n').filter((linea) => IMPORT_PERMITIDO.test(linea.trim())),
      `${PAGE_PATH} deberia importar ${HELPER_PERMISO_NOMBRE} desde ${HELPER_PERMISO_MODULO}`,
    ).toHaveLength(1);
  });

  it('la excepcion del import permitido no es un colador', () => {
    // Fuente FABRICADA: importa el helper permitido y ademas la composicion. Si la excepcion
    // estuviera escrita como «esta pagina queda fuera del centinela», este caso pasaria limpio.
    const fuenteFabricada = [
      `import { ${HELPER_PERMISO_NOMBRE} } from '${HELPER_PERMISO_MODULO}';`,
      "import { identity } from '@/lib/composition';",
      '',
      'export default async function PaginaQueSeCuela() {',
      `  await ${HELPER_PERMISO_NOMBRE}('dashboard.consultar');`,
      '  return identity.getSessionUser();',
      '}',
    ].join('\n');

    expect(infraccionesDeDatos(sinElImportDelHelper(fuenteFabricada))).toContain(
      '@/lib/composition',
    );

    // Y un segundo import de `lib/modules/` tampoco se cuela por la puerta del primero.
    const conOtroModulo = `import { listOrdersAction } from '@/lib/modules/pedidos/adapters/driving/order-actions';\n${fuenteFabricada}`;
    expect(infraccionesDeDatos(sinElImportDelHelper(conOtroModulo))).toContain('@/lib/modules/');
  });

  it('la pantalla y su componente de ruta se renderizan en servidor', () => {
    // R7
    const prohibidos = ['use client', 'useState', 'useEffect', 'onClick'];

    for (const ruta of FUENTES_DE_LA_PANTALLA) {
      const codigo = fuenteSinComentarios(ruta);
      for (const prohibido of prohibidos) {
        expect(codigo, `${ruta} no debe contener «${prohibido}»`).not.toContain(prohibido);
      }
    }

    // El barrel tampoco declara frontera cliente/servidor: eso va en cada componente.
    expect(fuenteSinComentarios(BARREL_PATH)).not.toContain('use client');
  });

  it('la pantalla no valida sesion ni protege la ruta', () => {
    // R8 — la guardia de sesion es alcance de QC-13; hoy la ruta no esta protegida y eso es
    // conocido y aceptado (`requirements.md > Decisiones cerradas`).
    const codigo = fuenteSinComentarios(PAGE_PATH);

    for (const prohibido of ['redirect', 'next/headers', 'getSessionUser']) {
      expect(codigo, `page.tsx no debe contener «${prohibido}»`).not.toContain(prohibido);
    }
  });

  it('el componente de ruta se expone por el barrel y la pagina no importa por ruta profunda', () => {
    // R9
    const barrel = fuenteSinComentarios(BARREL_PATH);
    expect(barrel).toContain('DashboardContent');
    expect(barrel).toMatch(/export\s*\{[^}]*DashboardContent[^}]*\}/);

    const codigo = fuenteSinComentarios(PAGE_PATH);
    expect(codigo).toContain("from './components'");
    expect(codigo).not.toContain('./components/dashboard-content');
    expect(codigo).not.toContain("from './dashboard-content'");
  });

  it('el item Dashboard de la navegacion apunta a la misma constante que ubica la pantalla', () => {
    // El item esta oculto del menu temporalmente, pero conserva el destino para cuando vuelva.
    // 2026-10-08 (QC-167): el humano pide volver a mostrar el item Dashboard. Vuelve la parte
    // positiva original: un unico enlace del menu apunta a `DASHBOARD_ROUTE`.
    const enlaces = PRIVATE_NAV_ITEMS.filter((item): item is NavLink => item.kind === 'link');
    const alDashboard = enlaces.filter((enlace) => enlace.href === DASHBOARD_ROUTE);

    expect(alDashboard).toHaveLength(1);

    // Parte negativa, con un matiz que no se puede simplificar: `page.tsx` **si** importa
    // `BRAND_LABEL` de `private-nav` para la metadata (R5), y eso es correcto — es leer una
    // constante de marca. Lo que R11 prohibe es **escribir o redefinir la navegacion**, asi
    // que la guardia va sobre eso: ninguna fuente de la feature toca la coleccion de items ni
    // redeclara constantes de ruta. Una prohibicion ciega de importar `private-nav` seria
    // falsa aqui y habria que borrarla al primer cambio, que es como mueren las guardias.
    for (const ruta of FUENTES_DE_LA_PANTALLA) {
      const codigo = fuenteSinComentarios(ruta);
      expect(codigo, `${ruta} no debe tocar la coleccion de navegacion`).not.toContain(
        'PRIVATE_NAV_ITEMS',
      );
      expect(codigo, `${ruta} no debe redeclarar constantes de ruta`).not.toMatch(
        /export\s+const\s+\w*_ROUTE\b/,
      );
    }
  });

  it('no usa 100vh ni hover como unica via', () => {
    // R12 — regla multiplataforma: nada de alto de viewport fijo (iOS/Android), y nada que solo
    // se revele al pasar el puntero: ninguna clase `hover:` acompana a una utilidad que oculte
    // contenido. Ampliado el 2026-10-08 (QC-167 T12, R25): la lista del recorrido, su tabla y el
    // detalle entran en las fuentes vigiladas; la regla no se afloja.
    const utilidadesQueOcultan = ['hidden', 'invisible', 'opacity-0', 'sr-only'];

    for (const ruta of FUENTES_MULTIPLATAFORMA) {
      const codigo = fuenteSinComentarios(ruta);

      expect(codigo, `${ruta} no debe usar 100vh`).not.toContain('100vh');

      for (const linea of codigo.split('\n')) {
        if (!linea.includes('hover:')) {
          continue;
        }
        for (const utilidad of utilidadesQueOcultan) {
          expect(
            linea,
            `${ruta}: «hover:» no puede ser la unica via de revelar «${utilidad}»`,
          ).not.toContain(utilidad);
        }
      }
    }
  });
});
