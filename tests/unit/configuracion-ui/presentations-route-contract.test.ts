// QC-45 T1 — Contrato de la ruta de presentaciones: R2, R5 y R6.
//
// Lo que esta task promete es invisible renderizando: que la URL viva en UNA sola constante de
// `lib/shared/routes.ts`, que el prefijo privado la cubra y que exista UNA fila ruta->rol que la
// restrinja al Administrador. Mismo patron que `tests/unit/pedidos-ui/order-route-contract.test.ts`
// y `tests/unit/dashboard-route-contract.test.ts`.
//
// Ojo con lo que este test NO dice: que una regla deje pasar **no autoriza nada** (QC-9 R29). El
// corte real lo siguen tomando los cuatro casos de uso de `inventario` con `requirePermission`
// (QC-20 D2), y esta pantalla no lo repite (R7).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

// La lista real de reglas es CABLEADO y vive en `lib/composition/` (QC-22).
import { ROUTE_ROLE_RULES } from '@/lib/composition/route-role-rules';
// `findRouteRule` y `ROLE_ADMINISTRADOR` se toman del BARREL de `identity`, nunca por ruta
// profunda (QC-54): es su unica fuente.
import { findRouteRule, ROLE_ADMINISTRADOR } from '@/lib/modules/identity';
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
    const codigo = fuenteSinComentarios(join('lib', 'composition', 'route-role-rules.ts'));
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

describe('la regla ruta->rol restringe la pantalla al Administrador (R6)', () => {
  it('hay exactamente UNA fila con ese prefijo, y con roles [Administrador] (R6)', () => {
    const filas = ROUTE_ROLE_RULES.filter((regla) => regla.prefix === PRESENTATIONS_ROUTE);

    expect(filas).toHaveLength(1);
    expect(filas[0]).toEqual({ prefix: PRESENTATIONS_ROUTE, roles: [ROLE_ADMINISTRADOR] });
  });

  it('findRouteRule resuelve la ruta y cualquier subcamino a esa misma regla (R6)', () => {
    expect(findRouteRule(ROUTE_ROLE_RULES, PRESENTATIONS_ROUTE)).toEqual({
      prefix: PRESENTATIONS_ROUTE,
      roles: [ROLE_ADMINISTRADOR],
    });
    expect(findRouteRule(ROUTE_ROLE_RULES, `${PRESENTATIONS_ROUTE}/algo`)?.roles).toEqual([
      ROLE_ADMINISTRADOR,
    ]);
  });

  it('una ruta que solo comparte el texto del prefijo, sin limite de segmento, no queda cubierta (R6)', () => {
    // Trampa deliberada: si la busqueda usase `startsWith` a secas, esto casaria por error.
    expect(findRouteRule(ROUTE_ROLE_RULES, `${PRESENTATIONS_ROUTE}X`)).toBeNull();
    // Y el tramo intermedio, que no tiene pantalla, tampoco tiene regla propia.
    expect(findRouteRule(ROUTE_ROLE_RULES, '/configuracion')).toBeNull();
  });

  it('las reglas anteriores siguen en pie: se anadio una fila, no se sustituyo (R6)', () => {
    for (const ruta of [INVENTORY_ROUTE, FORMULAS_ROUTE, SUPPLIERS_ROUTE, ORDERS_ROUTE]) {
      expect(findRouteRule(ROUTE_ROLE_RULES, ruta)?.roles).toEqual([ROLE_ADMINISTRADOR]);
    }
  });
});

