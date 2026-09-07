// QC-35 T1 — Contrato de la ruta de pedidos: R2 y R4.
//
// Lo que esta task promete es invisible renderizando: que la URL viva en UNA sola constante de
// `lib/shared/routes.ts`, que **no** haya helper de detalle —no hay pagina de detalle (R1)— y que
// el prefijo privado la cubra.
//
// **Falta a proposito** el caso de «existe `app/(private)${ORDERS_ROUTE}/page.tsx`»: la pagina la
// crea T5 y afirmarlo aqui dejaria el test rojo hasta entonces. T5 lo anade a este archivo.

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { ROUTE_ROLE_RULES } from '@/lib/composition/route-role-rules';
import { findRouteRule } from '@/lib/modules/identity/domain/route-role-rules';
import { ADMIN_ROLE_NAME } from '@/lib/modules/inventario';
import {
  DASHBOARD_ROUTE,
  FORMULAS_ROUTE,
  INVENTORY_ROUTE,
  ORDERS_ROUTE,
  PRIVATE_ROUTE_PREFIXES,
  SUPPLIERS_ROUTE,
} from '@/lib/shared/routes';

/** Texto del archivo sin comentarios: un literal citado dentro de un comentario no es codigo. */
function fuenteSinComentarios(ruta: string): string {
  return readFileSync(ruta, 'utf8')
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

describe('la ruta de pedidos se declara una sola vez (R2)', () => {
  it('la constante vive en lib/shared/routes.ts (R2)', () => {
    expect(fuenteSinComentarios('lib/shared/routes.ts')).toContain('export const ORDERS_ROUTE');
  });

  it('no se declara un helper de ruta de detalle: no hay pagina de detalle (R1, R2)', async () => {
    const rutas: Record<string, unknown> = await import('@/lib/shared/routes');

    // Ni `orderDetailRoute` ni ninguna otra funcion cuyo nombre hable de un pedido.
    const funcionesDePedido = Object.entries(rutas).filter(
      ([nombre, valor]) =>
        typeof valor === 'function' && /order|pedido/i.test(nombre) && nombre !== 'ORDERS_ROUTE',
    );
    expect(funcionesDePedido.map(([nombre]) => nombre)).toEqual([]);
  });

  it('nadie redeclara la constante: private-nav y la regla ruta->rol la IMPORTAN (R2)', () => {
    for (const ruta of [
      'lib/shared/navigation/private-nav.ts',
      'lib/composition/route-role-rules.ts',
    ]) {
      const codigo = fuenteSinComentarios(ruta);
      expect(codigo, `${ruta} no puede redeclarar ORDERS_ROUTE`).not.toContain(
        'const ORDERS_ROUTE =',
      );
      expect(codigo).toContain('ORDERS_ROUTE');
    }
  });
});

describe('el prefijo privado cubre la pantalla de pedidos (R4)', () => {
  it('ORDERS_ROUTE esta en PRIVATE_ROUTE_PREFIXES exactamente UNA vez (R4)', () => {
    // Sin esta fila, `(private)` no aparece en la URL y la pantalla se serviria SIN sesion.
    expect(PRIVATE_ROUTE_PREFIXES.filter((prefijo) => prefijo === ORDERS_ROUTE)).toEqual([
      ORDERS_ROUTE,
    ]);
  });

  it('los prefijos que ya existian no se sustituyeron: se anadio uno (R4)', () => {
    for (const prefijo of [DASHBOARD_ROUTE, INVENTORY_ROUTE, FORMULAS_ROUTE, SUPPLIERS_ROUTE]) {
      expect(PRIVATE_ROUTE_PREFIXES).toContain(prefijo);
    }
  });

  it('existe la fila ruta->rol de pedidos y casa por segmentos con la constante (R4, R5)', () => {
    expect(findRouteRule(ROUTE_ROLE_RULES, ORDERS_ROUTE)?.roles).toEqual([ADMIN_ROLE_NAME]);
    expect(findRouteRule(ROUTE_ROLE_RULES, `${ORDERS_ROUTE}X`)).toBeNull();
  });
});
