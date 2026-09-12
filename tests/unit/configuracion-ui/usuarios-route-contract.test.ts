// QC-67 T1 — Contrato de la ruta de usuarios: R1 y R5.
//
// Lo que esta task promete es invisible renderizando: que la URL viva en UNA sola constante de
// `lib/shared/routes.ts`, que ningun archivo de producto la incruste como literal y que el prefijo
// privado la cubra —lo que garantiza SESION, no autorizacion (R5)—. Mismo patron que
// `units-route-contract.test.ts`, de donde se copian el barrido de literales y la lectura de
// fuente sin comentarios.
//
// Ojo con lo que este test NO dice: que la pantalla se sirva **no autoriza ningun dato**. El corte
// por permiso es R4 y lo comprueba `usuarios-page.test.tsx`; la autorizacion de verdad la siguen
// tomando los casos de uso de `identity` con `requirePermission`, y esta pantalla no la repite.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
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
const PAGE_PATH = `app/(private)${USERS_ROUTE}/page.tsx`;

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

describe('la ruta de usuarios se declara una sola vez (R1)', () => {
  it('la constante existe, vale la URL esperada y vive en lib/shared/routes.ts', () => {
    expect(USERS_ROUTE).toBe('/configuracion/usuarios');
    expect(fuenteSinComentarios(ARCHIVO_DE_LA_CONSTANTE)).toContain('export const USERS_ROUTE');
  });

  it('la pantalla vive en la ruta DERIVADA de la constante, no en una escrita a mano', () => {
    // `app/(private)${USERS_ROUTE}/page.tsx`: el nombre de las carpetas es solo la forma en que el
    // App Router materializa la constante. Se lee el archivo EN DISCO, no una lista al lado.
    expect(() => readFileSync(join(RAIZ, PAGE_PATH), 'utf8')).not.toThrow();
  });

  it('sigue sin declararse una constante para el tramo intermedio /configuracion', async () => {
    // La tercera hermana de la seccion no cambia esto: sigue sin haber pantalla en `/configuracion`
    // y una constante que no lleva a ninguna parte seria la deuda de los cinco items de QC-11.
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
      .filter((ruta) => fuenteSinComentarios(ruta).includes(USERS_ROUTE));

    expect(infractores, `deben derivar de USERS_ROUTE en vez de escribir «${USERS_ROUTE}»`).toEqual(
      [],
    );
  });

  it('quien la use la IMPORTA de lib/shared/routes, no la redeclara', () => {
    const codigo = fuenteSinComentarios(join('lib', 'shared', 'navigation', 'private-nav.ts'));
    expect(codigo).toContain('USERS_ROUTE');
    expect(codigo).not.toContain('const USERS_ROUTE =');
  });
});

describe('el prefijo privado cubre la pantalla de usuarios (R5)', () => {
  it('USERS_ROUTE esta en PRIVATE_ROUTE_PREFIXES exactamente UNA vez', () => {
    // Sin esta fila, `(private)` no aparece en la URL y la pantalla se serviria SIN sesion. Una
    // fila duplicada no rompe el middleware pero delata que la lista se edito a ciegas.
    expect(PRIVATE_ROUTE_PREFIXES.filter((prefijo) => prefijo === USERS_ROUTE)).toEqual([
      USERS_ROUTE,
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
    ]) {
      expect(PRIVATE_ROUTE_PREFIXES).toContain(prefijo);
    }
  });

  it('la cobertura del prefijo NO es el control de autorizacion (R5)', () => {
    // Estar en la lista garantiza sesion en el borde y nada mas: quien decide si esta pantalla se
    // ve es el `requirePagePermission` de su `page.tsx` (R4). Ambas garantias existen a la vez y
    // ninguna sustituye a la otra.
    expect(PRIVATE_ROUTE_PREFIXES).toContain(USERS_ROUTE);
    expect(fuenteSinComentarios(PAGE_PATH)).toContain('requirePagePermission(');
  });
});
