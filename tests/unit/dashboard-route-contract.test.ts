import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PRIVATE_NAV_ITEMS, type NavLink } from '@/lib/shared/navigation/private-nav';
import { DASHBOARD_ROUTE } from '@/lib/shared/routes';

/**
 * Contrato de la ruta del dashboard: R1, R6, R7, R8, R9, R10, R11 y R12
 * (`specs/QC-12-dashboard-en-blanco/tasks.md > T4`).
 *
 * **Guardias de codigo, sin DOM.** Todo lo que esta feature promete «no hacer» —no consultar
 * datos, no validar sesion, no incrustar rutas literales, no tocar la navegacion— es
 * invisible renderizando: si manana la pantalla empezase a leer cookies o a redirigir, ningun
 * assert de DOM se pondria rojo. Mismo patron que las guardias de
 * `tests/unit/private-layout.test.tsx`.
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

describe('contrato de la ruta del dashboard', () => {
  it('la pagina vive en la ruta que declara DASHBOARD_ROUTE', () => {
    // R1
    expect(existsSync(join(RAIZ, PAGE_PATH)), `deberia existir ${PAGE_PATH}`).toBe(true);
    expect(existsSync(join(RAIZ, CONTENT_PATH)), `deberia existir ${CONTENT_PATH}`).toBe(true);
    expect(existsSync(join(RAIZ, BARREL_PATH)), `deberia existir ${BARREL_PATH}`).toBe(true);
  });

  it('la ubicacion de la ruta se deriva de DASHBOARD_ROUTE y la pagina no incrusta literales de ruta', () => {
    // R10 — la ruta esperada sale de la constante; la pagina no repite ese texto por su cuenta.
    expect(existsSync(join(RAIZ, PAGE_PATH))).toBe(true);

    const codigo = fuenteSinComentarios(PAGE_PATH);
    expect(codigo, `page.tsx no debe incrustar el literal «${DASHBOARD_ROUTE}»`).not.toContain(
      DASHBOARD_ROUTE,
    );
  });

  it('la pantalla no consulta datos, red ni cookies', () => {
    // R6
    const prohibidos = [
      'fetch(',
      'cookies',
      'prisma',
      'supabase',
      '@/lib/composition',
      '@/lib/modules/',
    ];

    for (const ruta of FUENTES_DE_LA_PANTALLA) {
      const codigo = fuenteSinComentarios(ruta).toLowerCase();
      for (const prohibido of prohibidos) {
        expect(codigo, `${ruta} no debe contener «${prohibido}»`).not.toContain(
          prohibido.toLowerCase(),
        );
      }
    }
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
    // R11 — parte positiva: el item del sidebar y la nueva ruta salen de la MISMA constante,
    // asi que el enlace deja de dar 404 sin que esta feature edite la navegacion.
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
    // se revele al pasar el puntero. No hay controles interactivos en esta pantalla, asi que la
    // guardia afirma que ninguna clase `hover:` acompana a una utilidad que oculte contenido.
    const utilidadesQueOcultan = ['hidden', 'invisible', 'opacity-0', 'sr-only'];

    for (const ruta of FUENTES_DE_LA_PANTALLA) {
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
