// QC-45 T1, reescrito en la ronda 2 (2026-09-08) — Contrato de la ruta de presentaciones: R2, R5
// y R6.
//
// **Este archivo afirmaba que `lib/composition/route-role-rules.ts` tenia una fila
// `{prefix: PRESENTATIONS_ROUTE, roles: [Administrador]}`.** QC-75 (`menu-y-rutas-por-permiso`)
// BORRO ese archivo y el mecanismo entero: el borde ya no corta por nombre de rol (QC-75 R16). Lo
// que ata hoy esta ruta a quien puede verla es el corte por PERMISO en la propia pantalla:
// `await requirePagePermission('inventario.modificar')` como primera linea de `page.tsx` (QC-75
// R6). Mismo camino que recorrio `tests/unit/pedidos-ui/permiso-ruta-pedidos.test.ts`, de donde se
// copia el test de fuente.
//
// Lo que esta task promete sigue siendo invisible renderizando: que la URL viva en UNA sola
// constante de `lib/shared/routes.ts`, que el prefijo privado la cubra y que la pantalla exija su
// permiso. Mismo patron que `tests/unit/pedidos-ui/order-route-contract.test.ts` y
// `tests/unit/dashboard-route-contract.test.ts`.
//
// Ojo con lo que este test NO dice: que la pantalla se sirva **no autoriza ningun dato** (QC-9
// R29). El corte sobre los datos lo siguen tomando los cuatro casos de uso de `inventario` con
// `requirePermission` (QC-20 D2), y esta pantalla no lo repite (R7).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

// El catalogo de permisos se toma del BARREL de `identity`, nunca por ruta profunda (QC-54): es
// su unica fuente, y de el se DERIVA el codigo que se espera en la pantalla.
import { PERMISSIONS } from '@/lib/modules/identity';
import { PRIVATE_NAV_ITEMS, type NavLink } from '@/lib/shared/navigation/private-nav';
import {
  DASHBOARD_ROUTE,
  FORMULAS_ROUTE,
  INVENTORY_ROUTE,
  ORDERS_ROUTE,
  PRESENTATIONS_ROUTE,
  PRIVATE_ROUTE_PREFIXES,
  SUPPLIERS_ROUTE,
} from '@/lib/shared/routes';

const RAIZ = join(__dirname, '..', '..', '..');

/** La pantalla, DERIVADA de la constante (R2): el route group `(private)` no aporta segmento. */
const PAGE_PATH = `app/(private)${PRESENTATIONS_ROUTE}/page.tsx`;

/** El unico archivo del producto autorizado a contener la URL como texto (R2). */
const ARCHIVO_DE_LA_CONSTANTE = join('lib', 'shared', 'routes.ts');

/** Texto del archivo sin comentarios: un literal citado dentro de un comentario no es codigo. */
function fuenteSinComentarios(rutaRelativa: string): string {
  return readFileSync(join(RAIZ, rutaRelativa), 'utf8')
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/** Todos los archivos de fuente bajo los directorios dados, relativos a la raiz del repo. */
function fuentesDe(...directorios: readonly string[]): readonly string[] {
  const encontrados: string[] = [];

  const recorrer = (absoluto: string): void => {
    for (const entrada of readdirSync(absoluto)) {
      if (entrada === 'node_modules' || entrada === '.next') {
        continue;
      }
      const hijo = join(absoluto, entrada);
      if (statSync(hijo).isDirectory()) {
        recorrer(hijo);
      } else if (/\.(ts|tsx|js|jsx|mts|cts)$/.test(entrada)) {
        encontrados.push(relative(RAIZ, hijo));
      }
    }
  };

  for (const directorio of directorios) {
    recorrer(join(RAIZ, directorio));
  }
  return encontrados;
}

/** Todos los items de navegacion, aplanando los grupos en sus hijos. */
const NAV_APLANADO: readonly NavLink[] = PRIVATE_NAV_ITEMS.flatMap((item) =>
  item.kind === 'group' ? item.items : [item],
);

describe('la ruta de presentaciones se declara una sola vez (R2)', () => {
  it('la constante existe, vale la URL esperada y vive en lib/shared/routes.ts (R2)', () => {
    expect(PRESENTATIONS_ROUTE).toBe('/configuracion/presentaciones');
    expect(fuenteSinComentarios(ARCHIVO_DE_LA_CONSTANTE)).toContain(
      'export const PRESENTATIONS_ROUTE',
    );
  });

  it('no se declara una constante para el tramo intermedio /configuracion (R2, design 2)', async () => {
    // No hay pantalla en `/configuracion`: una constante que no lleva a ninguna parte seria la
    // deuda de los cinco items de QC-11. El segmento aparece **una sola vez**, dentro de
    // `PRESENTATIONS_ROUTE`.
    const rutas: Record<string, unknown> = await import('@/lib/shared/routes');

    const declaradas = Object.entries(rutas).filter(
      ([, valor]) => valor === '/configuracion' || valor === '/configuracion/',
    );
    expect(declaradas.map(([nombre]) => nombre)).toEqual([]);
    expect(rutas.CONFIGURATION_ROUTE).toBeUndefined();
  });

  it('ningun otro archivo de lib/, app/ ni components/ incrusta la URL como literal (R2)', () => {
    const infractores = fuentesDe('lib', 'app', 'components')
      .filter((ruta) => ruta !== ARCHIVO_DE_LA_CONSTANTE)
      .filter((ruta) => fuenteSinComentarios(ruta).includes(PRESENTATIONS_ROUTE));

    expect(
      infractores,
      `deben derivar de PRESENTATIONS_ROUTE en vez de escribir «${PRESENTATIONS_ROUTE}»`,
    ).toEqual([]);
  });

  it('quien la use la IMPORTA de lib/shared/routes, no la redeclara (R2)', () => {
    // Antes se comprobaba sobre `lib/composition/route-role-rules.ts`, que QC-75 borro. El
    // consumidor de hoy es la navegacion privada, que declara el item del menu con esta misma
    // constante en vez de escribir la URL a mano.
    const codigo = fuenteSinComentarios(join('lib', 'shared', 'navigation', 'private-nav.ts'));
    expect(codigo).toContain('PRESENTATIONS_ROUTE');
    expect(codigo).not.toContain('const PRESENTATIONS_ROUTE =');
  });
});

describe('el prefijo privado cubre la pantalla de presentaciones (R5)', () => {
  it('PRESENTATIONS_ROUTE esta en PRIVATE_ROUTE_PREFIXES exactamente UNA vez (R5)', () => {
    // Sin esta fila, `(private)` no aparece en la URL y la pantalla se serviria SIN sesion.
    expect(PRIVATE_ROUTE_PREFIXES.filter((prefijo) => prefijo === PRESENTATIONS_ROUTE)).toEqual([
      PRESENTATIONS_ROUTE,
    ]);
  });

  it('los prefijos que ya existian no se sustituyeron: se anadio uno (R5)', () => {
    for (const prefijo of [
      DASHBOARD_ROUTE,
      INVENTORY_ROUTE,
      FORMULAS_ROUTE,
      SUPPLIERS_ROUTE,
      ORDERS_ROUTE,
    ]) {
      expect(PRIVATE_ROUTE_PREFIXES).toContain(prefijo);
    }
  });
});

describe('la pantalla exige el permiso inventario.modificar (R6, QC-75 R6)', () => {
  it('page.tsx abre con requirePagePermission y el codigo sale del catalogo (R6)', () => {
    // El codigo se DERIVA del catalogo de `identity`, nunca se escribe a mano: si alguien lo
    // renombrara, esto se pondria rojo en vez de quedarse vigilando un permiso inexistente.
    const permiso = PERMISSIONS.find(
      (entrada) => entrada.module === 'inventario' && entrada.action === 'modificar',
    );
    expect(permiso, 'el catalogo de identity deberia tener inventario.modificar').toBeDefined();

    expect(fuenteSinComentarios(PAGE_PATH)).toContain(`requirePagePermission('${permiso?.code}')`);
  });

  it('la llamada esta ANTES de resolver searchParams y de pintar nada (R6)', () => {
    // Los comentarios se quitan antes de juzgar, igual que hace
    // `tests/guards/guard-pantallas-exigen-permiso.test.ts`: el JSDoc de la pagina NOMBRA la
    // llamada y su codigo, asi que sin eso la prosa bastaria para dar el test por satisfecho.
    const codigo = fuenteSinComentarios(PAGE_PATH);

    const corte = codigo.indexOf('requirePagePermission(');
    const lectura = codigo.indexOf('await searchParams');
    expect(corte, 'la pagina no llama a requirePagePermission').toBeGreaterThanOrEqual(0);
    expect(lectura, 'la pagina deberia resolver searchParams').toBeGreaterThanOrEqual(0);
    expect(corte).toBeLessThan(lectura);
  });

  it('NO es `inventario.consultar`: esta pantalla administra el catalogo (R6)', () => {
    // El Operador del seed lleva `inventario.consultar` y solo ese. Si la pantalla exigiera
    // `consultar`, entraria a una pantalla cuyo proposito entero es escribir (R21, R27).
    expect(fuenteSinComentarios(PAGE_PATH)).not.toContain(
      "requirePagePermission('inventario.consultar')",
    );
  });

  it('el item de menu declara EL MISMO permiso que exige la pantalla (R4, R6)', () => {
    // Si se desincronizaran, el enlace saldria en el menu de quien recibe un 404 al pulsarlo.
    const enlace = NAV_APLANADO.find((item) => item.href === PRESENTATIONS_ROUTE);

    expect(enlace, 'PRIVATE_NAV_ITEMS deberia tener el item de presentaciones').toBeDefined();
    expect(fuenteSinComentarios(PAGE_PATH)).toContain(
      `requirePagePermission('${enlace?.permission}')`,
    );
  });
});
