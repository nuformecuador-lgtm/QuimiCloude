// Contrato de la ruta de clientes: R1 y R2.
//
// Copia del patron de `usuarios-route-contract.test.ts`: la URL vive en UNA sola constante de
// `lib/shared/routes.ts`, ningun archivo de producto la incrusta como literal, y el prefijo
// privado la cubre -lo que garantiza SESION, no autorizacion-.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ASSIGNED_ORDERS_ROUTE,
  CUSTOMERS_ROUTE,
  DASHBOARD_ROUTE,
  FORMULAS_ROUTE,
  INVENTORY_ROUTE,
  ORDERS_ROUTE,
  PRESENTATIONS_ROUTE,
  PRIVATE_ROUTE_PREFIXES,
  SUPPLIERS_ROUTE,
  UNITS_ROUTE,
  USERS_ROUTE,
} from '@/lib/shared/routes';

const RAIZ = join(__dirname, '..', '..', '..');

/** La pantalla, DERIVADA de la constante (R1): el route group `(private)` no aporta segmento. */
const PAGE_DIR = `app/(private)${CUSTOMERS_ROUTE}`;
const PAGE_PATH = `${PAGE_DIR}/page.tsx`;

/** El unico archivo del producto autorizado a contener la URL como texto (R1). */
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
    if (!existsSyncSafe(absoluto)) return;
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

function existsSyncSafe(ruta: string): boolean {
  try {
    statSync(ruta);
    return true;
  } catch {
    return false;
  }
}

describe('la ruta de clientes se declara una sola vez (R1)', () => {
  it('la constante existe, vale la URL esperada y vive en lib/shared/routes.ts', () => {
    expect(CUSTOMERS_ROUTE).toBe('/clientes');
    expect(fuenteSinComentarios(ARCHIVO_DE_LA_CONSTANTE)).toContain('export const CUSTOMERS_ROUTE');
  });

  it('la pantalla vive en la ruta DERIVADA de la constante, no en una escrita a mano', () => {
    expect(() => readFileSync(join(RAIZ, PAGE_PATH), 'utf8')).not.toThrow();
  });

  // Un literal de VERDAD es la URL entera entre comillas -nunca un import de modulo como
  // `@/lib/modules/clientes`, que contiene la misma subcadena sin ser la ruta.
  const LITERAL_DE_LA_URL = new RegExp(`(['"\`])${CUSTOMERS_ROUTE}\\1`);

  it('ningun otro archivo de lib/, app/ ni components/ incrusta la URL como literal', () => {
    const infractores = fuentesDe('lib', 'app', 'components')
      .filter((ruta) => ruta !== ARCHIVO_DE_LA_CONSTANTE)
      .filter((ruta) => LITERAL_DE_LA_URL.test(fuenteSinComentarios(ruta)));

    expect(
      infractores,
      `deben derivar de CUSTOMERS_ROUTE en vez de escribir «${CUSTOMERS_ROUTE}»`,
    ).toEqual([]);
  });

  it('ningun archivo de la propia ruta contiene el literal /clientes', () => {
    // La pagina y sus componentes reciben la constante por import; ninguno la vuelve a escribir.
    const infractores = fuentesDe(PAGE_DIR).filter((ruta) =>
      LITERAL_DE_LA_URL.test(fuenteSinComentarios(ruta)),
    );

    expect(infractores).toEqual([]);
  });

  it('quien la use la IMPORTA de lib/shared/routes, no la redeclara', () => {
    const codigo = fuenteSinComentarios(join('lib', 'shared', 'navigation', 'private-nav.ts'));
    expect(codigo).toContain('CUSTOMERS_ROUTE');
    expect(codigo).not.toContain('const CUSTOMERS_ROUTE =');
  });
});

describe('el prefijo privado cubre la pantalla de clientes (R2)', () => {
  it('CUSTOMERS_ROUTE esta en PRIVATE_ROUTE_PREFIXES exactamente UNA vez', () => {
    expect(PRIVATE_ROUTE_PREFIXES.filter((prefijo) => prefijo === CUSTOMERS_ROUTE)).toEqual([
      CUSTOMERS_ROUTE,
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
      UNITS_ROUTE,
      USERS_ROUTE,
      ASSIGNED_ORDERS_ROUTE,
    ]) {
      expect(PRIVATE_ROUTE_PREFIXES).toContain(prefijo);
    }
  });

  it('la cobertura del prefijo NO es el control de autorizacion (R2)', () => {
    // Estar en la lista garantiza sesion en el borde y nada mas: quien decide si esta pantalla se
    // ve es el `requirePagePermission` de su `page.tsx`. Ambas garantias existen a la vez y
    // ninguna sustituye a la otra.
    expect(PRIVATE_ROUTE_PREFIXES).toContain(CUSTOMERS_ROUTE);
    expect(fuenteSinComentarios(PAGE_PATH)).toContain('requirePagePermission(');
  });
});
