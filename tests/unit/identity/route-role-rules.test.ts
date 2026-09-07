// QC-9 T8 — El gancho de reglas ruta→rol (R12). Dominio puro: sin Next, sin cookies, sin base (R20).
// QC-22 T14 — La PRIMERA regla real del repositorio (R4).
//
// Las reglas del primer bloque siguen siendo SINTETICAS a proposito (`design.md > 4.3`): asi lo
// que se ejercita de `findRouteRule` es la BUSQUEDA, sin depender de que la lista real diga hoy
// una cosa u otra. El segundo bloque, en cambio, mira la lista REAL.

import { readFileSync } from 'node:fs';

import { ROUTE_ROLE_RULES } from '@/lib/composition/route-role-rules';
import { findRouteRule, type RouteRoleRule } from '@/lib/modules/identity/domain/route-role-rules';
import { ROLE_ADMINISTRADOR } from '@/lib/modules/identity';
import {
  FORMULAS_ROUTE,
  INVENTORY_ROUTE,
  NEW_RECIPE_ROUTE,
  ORDERS_ROUTE,
  recipeEditRoute,
  SUPPLIERS_ROUTE,
  supplierDetailRoute,
} from '@/lib/shared/routes';

const PRODUCTOS: RouteRoleRule = { prefix: '/productos', roles: ['Administrador', 'Operador'] };
const PRODUCTOS_NUEVO: RouteRoleRule = { prefix: '/productos/nuevo', roles: ['Administrador'] };
const REGLAS: readonly RouteRoleRule[] = [PRODUCTOS, PRODUCTOS_NUEVO];

describe('findRouteRule', () => {
  // R12
  it('devuelve null cuando ninguna regla casa', () => {
    expect(findRouteRule(REGLAS, '/dashboard')).toBeNull();
  });

  it('devuelve null cuando no hay reglas', () => {
    expect(findRouteRule([], '/productos')).toBeNull();
  });

  it('casa la ruta exacta del prefijo', () => {
    expect(findRouteRule(REGLAS, '/productos')).toBe(PRODUCTOS);
  });

  it('casa una ruta que cuelga del prefijo', () => {
    expect(findRouteRule(REGLAS, '/productos/abc-123')).toBe(PRODUCTOS);
  });

  // El criterio del prefijo mas largo es lo que permite que una subruta sea MAS estricta.
  it('gana el prefijo mas largo que case, no el primero de la lista', () => {
    expect(findRouteRule(REGLAS, '/productos/nuevo')).toBe(PRODUCTOS_NUEVO);
    expect(findRouteRule([PRODUCTOS_NUEVO, PRODUCTOS], '/productos/nuevo')).toBe(PRODUCTOS_NUEVO);
  });

  it('el resultado no depende del orden en que se declaren las reglas', () => {
    expect(findRouteRule([...REGLAS].reverse(), '/productos/nuevo')).toBe(PRODUCTOS_NUEVO);
    expect(findRouteRule([...REGLAS].reverse(), '/productos')).toBe(PRODUCTOS);
  });

  // Un prefijo casa por segmentos: `/productos` no cubre `/productosx`, que es otra pantalla.
  it('no casa una ruta que solo comparte el texto del prefijo sin limite de segmento', () => {
    expect(findRouteRule(REGLAS, '/productosx')).toBeNull();
  });
});

describe('ROUTE_ROLE_RULES — la lista real', () => {
  // CENTINELA INVERTIDO el 2026-09-03 (QC-22 T14, R4) y AMPLIADO el 2026-09-03 (QC-26 T23, R6).
  //
  // Hasta QC-9 este bloque afirmaba que la lista estaba «vacia a proposito (D8)», con el encargo
  // escrito de que «la primera regla sera la pantalla de productos, solo Administrador». QC-22
  // trajo exactamente esa pantalla y el centinela paso a exigir la UNICA fila declarada. QC-26
  // anade la SEGUNDA fila — la pantalla de recetas — y el centinela se amplia otra vez, no se
  // relaja: sigue exigiendo la lista EXACTA y COMPLETA, en el orden real. Anadir una tercera
  // regla sin ficha que la respalde sigue poniendo esto en rojo, que es para lo que el centinela
  // existe. Borrar la fila de `FORMULAS_ROUTE` de `ROUTE_ROLE_RULES` pone este test en rojo.
  //
  // La lista vive en `lib/composition/` desde el 2026-09-03: nombrar las rutas exige
  // `INVENTORY_ROUTE` y `FORMULAS_ROUTE` de `lib/shared/routes` —que el dominio no puede
  // importar—. El rol ya no es motivo: `ROLE_ADMINISTRADOR` sale del barrel de `identity`,
  // igual que en cualquier otro consumidor.
  it('declara exactamente cuatro reglas, en orden: inventario, recetas, proveedores y pedidos, las cuatro solo Administrador (R4, R6)', () => {
    // AMPLIADO otra vez el 2026-09-04 (QC-44 T3, R6): la TERCERA fila es la pantalla de
    // proveedores. El centinela no se relaja: sigue exigiendo la lista EXACTA y COMPLETA, en el
    // orden real, asi que una cuarta regla sin ficha que la respalde vuelve a ponerlo en rojo.
    expect(ROUTE_ROLE_RULES).toEqual([
      { prefix: INVENTORY_ROUTE, roles: [ROLE_ADMINISTRADOR] },
      { prefix: FORMULAS_ROUTE, roles: [ROLE_ADMINISTRADOR] },
      { prefix: SUPPLIERS_ROUTE, roles: [ROLE_ADMINISTRADOR] },
      // AMPLIADO otra vez el 2026-09-06 (QC-35 T3, R5): la CUARTA fila es la pantalla de
      // pedidos. El centinela sigue exigiendo la lista EXACTA y COMPLETA, en el orden real, asi
      // que una quinta regla sin ficha que la respalde vuelve a ponerlo en rojo.
      { prefix: ORDERS_ROUTE, roles: [ROLE_ADMINISTRADOR] },
    ]);
  });

  // QC-44 R6 — UNA sola fila cubre la lista y el detalle: la busqueda casa por segmentos.
  it('la regla de proveedores cubre la lista y la pagina de detalle, y es la MISMA fila (R6)', () => {
    const detalle = supplierDetailRoute('22222222-2222-4222-8222-222222222222');

    expect(findRouteRule(ROUTE_ROLE_RULES, SUPPLIERS_ROUTE)?.roles).toEqual([ROLE_ADMINISTRADOR]);
    expect(findRouteRule(ROUTE_ROLE_RULES, detalle)?.roles).toEqual([ROLE_ADMINISTRADOR]);
    expect(findRouteRule(ROUTE_ROLE_RULES, detalle)).toBe(
      findRouteRule(ROUTE_ROLE_RULES, SUPPLIERS_ROUTE),
    );

    // Y no casa lo que solo comparte el texto del prefijo sin limite de segmento.
    expect(findRouteRule(ROUTE_ROLE_RULES, `${SUPPLIERS_ROUTE}X`)).toBeNull();
  });

  it('la regla se aplica a la ruta de inventario y a lo que cuelgue de ella (R4)', () => {
    expect(findRouteRule(ROUTE_ROLE_RULES, INVENTORY_ROUTE)?.roles).toEqual([ROLE_ADMINISTRADOR]);
    expect(findRouteRule(ROUTE_ROLE_RULES, `${INVENTORY_ROUTE}/nuevo`)?.roles).toEqual([
      ROLE_ADMINISTRADOR,
    ]);
  });

  // R6 — la regla de recetas cubre la lista Y sus dos subrutas de formulario: alta y edicion.
  // La regla de inventario (R4) sigue existiendo: se anade, no se sustituye.
  it('la regla de recetas cubre la lista y sus dos subrutas de formulario, y la de inventario sigue en pie (R6)', () => {
    expect(findRouteRule(ROUTE_ROLE_RULES, FORMULAS_ROUTE)?.roles).toEqual([ROLE_ADMINISTRADOR]);
    expect(findRouteRule(ROUTE_ROLE_RULES, NEW_RECIPE_ROUTE)?.roles).toEqual([ROLE_ADMINISTRADOR]);
    expect(
      findRouteRule(ROUTE_ROLE_RULES, recipeEditRoute('11111111-1111-4111-8111-111111111111'))
        ?.roles,
    ).toEqual([ROLE_ADMINISTRADOR]);

    // La regla que casa con las dos subrutas es la MISMA fila que casa con la lista: no hay
    // una tercera fila escondida solo para el formulario.
    expect(findRouteRule(ROUTE_ROLE_RULES, NEW_RECIPE_ROUTE)).toBe(
      findRouteRule(ROUTE_ROLE_RULES, FORMULAS_ROUTE),
    );

    // Y la regla de inventario (R4) sigue exactamente igual: no se sustituyo.
    expect(findRouteRule(ROUTE_ROLE_RULES, INVENTORY_ROUTE)?.roles).toEqual([ROLE_ADMINISTRADOR]);
  });

  // Lo que la ficha NO hace: cerrar el resto del area privada. Cada ficha anade su fila.
  it('ninguna otra ruta privada gana regla por el camino', () => {
    expect(findRouteRule(ROUTE_ROLE_RULES, '/dashboard')).toBeNull();
    expect(findRouteRule(ROUTE_ROLE_RULES, '/dashboard/reportes')).toBeNull();
  });

  // R2 — la fila se deriva de la constante unica de ruta; el literal no se reescribe aqui.
  it('las filas se derivan de INVENTORY_ROUTE, FORMULAS_ROUTE, SUPPLIERS_ROUTE, ORDERS_ROUTE y ROLE_ADMINISTRADOR, no de literales propios', () => {
    const fuente = readFileSync('lib/composition/route-role-rules.ts', 'utf8')
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, ' ');

    expect(fuente).toContain("from '@/lib/shared/routes'");
    expect(fuente).toContain("from '@/lib/modules/identity'");
    expect(fuente).not.toContain(`'${INVENTORY_ROUTE}'`);
    expect(fuente).not.toContain(`'${FORMULAS_ROUTE}'`);
    expect(fuente).not.toContain(`'${SUPPLIERS_ROUTE}'`);
    expect(fuente).not.toContain(`'${ORDERS_ROUTE}'`);
    expect(fuente).not.toContain(`'${ROLE_ADMINISTRADOR}'`);
  });
});
