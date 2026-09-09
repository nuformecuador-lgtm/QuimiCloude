// QC-39 T3 — Contrato de la ruta de unidades: R8, R12 y R13.
//
// Lo que esta task promete es invisible renderizando: que la URL viva en UNA sola constante de
// `lib/shared/routes.ts`, que el prefijo privado la cubra —lo que garantiza SESION, no
// autorizacion (R13)— y que la pantalla exija sus DOS permisos antes de mirar siquiera la URL
// (R12). Mismo patron que `presentations-route-contract.test.ts`, del que se copia el barrido de
// literales y el test de fuente.
//
// Ojo con lo que este test NO dice: que la pantalla se sirva **no autoriza ningun dato** (R14). El
// corte sobre los datos lo siguen tomando los casos de uso de `unidades` con `requirePermission`,
// y esta pantalla no lo repite.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

// El catalogo de permisos se toma del BARREL de `identity`, nunca por ruta profunda (QC-54): es su
// unica fuente, y de el se DERIVAN los codigos que se esperan en la pantalla.
import { PERMISSIONS } from '@/lib/modules/identity';
import {
  DASHBOARD_ROUTE,
  FORMULAS_ROUTE,
  INVENTORY_ROUTE,
  ORDERS_ROUTE,
  PRESENTATIONS_ROUTE,
  PRIVATE_ROUTE_PREFIXES,
  SUPPLIERS_ROUTE,
  UNITS_ROUTE,
} from '@/lib/shared/routes';

const RAIZ = join(__dirname, '..', '..', '..');

/** La pantalla, DERIVADA de la constante (R8): el route group `(private)` no aporta segmento. */
const PAGE_PATH = `app/(private)${UNITS_ROUTE}/page.tsx`;

/** El unico archivo del producto autorizado a contener la URL como texto (R8). */
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

/** Los dos codigos que exige la pantalla, DERIVADOS del catalogo de `identity` (R12). */
const PERMISOS_DE_LA_PANTALLA: readonly string[] = PERMISSIONS.filter(
  (entrada) => entrada.module === 'unidades',
).map((entrada) => entrada.code);

describe('la ruta de unidades se declara una sola vez (R8)', () => {
  it('la constante existe, vale la URL esperada y vive en lib/shared/routes.ts', () => {
    expect(UNITS_ROUTE).toBe('/configuracion/unidades');
    expect(fuenteSinComentarios(ARCHIVO_DE_LA_CONSTANTE)).toContain('export const UNITS_ROUTE');
  });

  it('no se declara una constante para el tramo intermedio /configuracion', async () => {
    // Sigue sin haber pantalla en `/configuracion`: una constante que no lleva a ninguna parte
    // seria la deuda de los cinco items de QC-11. El segmento aparece solo dentro de las dos
    // constantes hermanas.
    const rutas: Record<string, unknown> = await import('@/lib/shared/routes');

    const declaradas = Object.entries(rutas).filter(
      ([, valor]) => valor === '/configuracion' || valor === '/configuracion/',
    );
    expect(declaradas.map(([nombre]) => nombre)).toEqual([]);
    expect(rutas.CONFIGURATION_ROUTE).toBeUndefined();
  });

  it('ningun otro archivo de lib/, app/ ni components/ incrusta la URL como literal', () => {
    const infractores = fuentesDe('lib', 'app', 'components')
      .filter((ruta) => ruta !== ARCHIVO_DE_LA_CONSTANTE)
      .filter((ruta) => fuenteSinComentarios(ruta).includes(UNITS_ROUTE));

    expect(infractores, `deben derivar de UNITS_ROUTE en vez de escribir «${UNITS_ROUTE}»`).toEqual(
      [],
    );
  });

  it('quien la use la IMPORTA de lib/shared/routes, no la redeclara', () => {
    const codigo = fuenteSinComentarios(join('lib', 'shared', 'navigation', 'private-nav.ts'));
    expect(codigo).toContain('UNITS_ROUTE');
    expect(codigo).not.toContain('const UNITS_ROUTE =');
  });
});

describe('el prefijo privado cubre la pantalla de unidades (R13)', () => {
  it('UNITS_ROUTE esta en PRIVATE_ROUTE_PREFIXES exactamente UNA vez', () => {
    // Sin esta fila, `(private)` no aparece en la URL y la pantalla se serviria SIN sesion. Una
    // fila duplicada no rompe el middleware pero delata que la lista se edito a ciegas.
    expect(PRIVATE_ROUTE_PREFIXES.filter((prefijo) => prefijo === UNITS_ROUTE)).toEqual([
      UNITS_ROUTE,
    ]);
  });

  it('los prefijos que ya existian no se sustituyeron: se anadio uno', () => {
    for (const prefijo of [
      DASHBOARD_ROUTE,
      INVENTORY_ROUTE,
      FORMULAS_ROUTE,
      SUPPLIERS_ROUTE,
      ORDERS_ROUTE,
      PRESENTATIONS_ROUTE,
    ]) {
      expect(PRIVATE_ROUTE_PREFIXES).toContain(prefijo);
    }
  });

  it('la cobertura del prefijo NO es el control de autorizacion (R13)', () => {
    // Estar en la lista garantiza sesion en el borde y nada mas: quien decide si esta pantalla se
    // ve son los `requirePagePermission` del bloque de abajo. Ambas garantias existen a la vez.
    expect(PRIVATE_ROUTE_PREFIXES).toContain(UNITS_ROUTE);
    expect(fuenteSinComentarios(PAGE_PATH)).toContain('requirePagePermission(');
  });
});

describe('la pantalla exige los DOS permisos de unidades (R12)', () => {
  it('ancla: el catalogo de identity declara los dos codigos de unidades', () => {
    // Anti-vacuidad: con la lista vacia, los `toContain` de abajo no comprobarian nada.
    expect([...PERMISOS_DE_LA_PANTALLA].sort()).toEqual([
      'unidades.consultar',
      'unidades.modificar',
    ]);
  });

  it('page.tsx llama a requirePagePermission con CADA uno de los dos codigos', () => {
    // Los codigos se DERIVAN del catalogo, nunca se escriben a mano: si alguien los renombrara,
    // esto se pondria rojo en vez de quedarse vigilando un permiso inexistente.
    const codigo = fuenteSinComentarios(PAGE_PATH);

    for (const permiso of PERMISOS_DE_LA_PANTALLA) {
      expect(codigo, `la pagina deberia exigir ${permiso}`).toContain(
        `requirePagePermission('${permiso}')`,
      );
    }
  });

  it('son exactamente DOS llamadas, ni una de mas ni una de menos', () => {
    const llamadas = fuenteSinComentarios(PAGE_PATH).match(/requirePagePermission\(/g) ?? [];

    expect(llamadas).toHaveLength(PERMISOS_DE_LA_PANTALLA.length);
  });

  it('las dos llamadas estan ANTES de resolver searchParams y de pintar nada', () => {
    // Los comentarios se quitan antes de juzgar, igual que hace
    // `tests/guards/guard-pantallas-exigen-permiso.test.ts`: el JSDoc de la pagina NOMBRA las
    // llamadas y sus codigos, asi que sin eso la prosa bastaria para dar el test por satisfecho.
    const codigo = fuenteSinComentarios(PAGE_PATH);

    const lectura = codigo.indexOf('await searchParams');
    expect(lectura, 'la pagina deberia resolver searchParams').toBeGreaterThanOrEqual(0);

    for (const permiso of PERMISOS_DE_LA_PANTALLA) {
      const corte = codigo.indexOf(`requirePagePermission('${permiso}')`);
      expect(corte, `la pagina no exige ${permiso}`).toBeGreaterThanOrEqual(0);
      expect(corte, `${permiso} se exige DESPUES de leer la URL`).toBeLessThan(lectura);
    }
  });
});
