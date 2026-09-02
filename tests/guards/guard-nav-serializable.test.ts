import { describe, expect, it } from 'vitest';

import { PRIVATE_NAV_ITEMS } from '@/lib/shared/navigation/private-nav';

/**
 * Guardia: lo que cruza la frontera servidor→cliente tiene que ser serializable.
 *
 * `PRIVATE_NAV_ITEMS` lo lee `app/(private)/layout.tsx`, que es Server Component, y se lo pasa
 * por props a `AppSidebar`, que es cliente. React exige que todo lo que cruza sea un objeto
 * plano; si no, la aplicacion revienta **en ejecucion**:
 *
 *     Only plain objects can be passed to Client Components from Server Components.
 *     Classes or other objects with methods are not supported.
 *
 * **Esto ya paso** (2026-09-02): el array llevaba el componente de icono de `lucide-react`
 * —un objeto con `$$typeof` y `render`— y la zona privada dejo de cargar. El gate completo
 * estaba en verde: 64 archivos y 637 tests, incluidos once escritos ese mismo dia sobre esa
 * misma barra lateral, con sus cuatro mordidas.
 *
 * Ninguno podia verlo, y no por descuido: **en jsdom no existe la frontera**. Todo se
 * renderiza en cliente, asi que un icono no serializable funciona perfectamente en los tests
 * y falla en el navegador. Por eso esta guardia mira el DATO y no el render: es el unico
 * angulo desde el que el fallo es visible sin levantar la aplicacion.
 */

/** Recorre el arbol y devuelve la ruta de todo valor que no sobreviva a `JSON`. */
function rutasNoSerializables(valor: unknown, ruta = 'PRIVATE_NAV_ITEMS'): readonly string[] {
  if (valor === null) return [];

  const tipo = typeof valor;

  if (tipo === 'function' || tipo === 'symbol' || tipo === 'bigint') {
    return [`${ruta} es ${tipo}`];
  }

  if (tipo !== 'object') return [];

  if (Array.isArray(valor)) {
    return valor.flatMap((elemento, indice) =>
      rutasNoSerializables(elemento, `${ruta}[${indice}]`),
    );
  }

  const prototipo = Object.getPrototypeOf(valor);
  if (prototipo !== Object.prototype && prototipo !== null) {
    return [`${ruta} no es un objeto plano (${prototipo?.constructor?.name ?? 'desconocido'})`];
  }

  return Object.entries(valor as Record<string, unknown>).flatMap(([clave, hijo]) =>
    rutasNoSerializables(hijo, `${ruta}.${clave}`),
  );
}

describe('guardia: la navegacion privada cruza a un Client Component', () => {
  it('no contiene ningun valor que React rechace al serializar', () => {
    expect(rutasNoSerializables(PRIVATE_NAV_ITEMS)).toEqual([]);
  });

  it('sobrevive a una vuelta por JSON sin perder nada', () => {
    // Una funcion o un componente no desaparecen del objeto: `JSON.stringify` los omite, asi
    // que la ida y vuelta deja de ser identica. Es la comprobacion que caza un icono metido
    // como componente aunque `rutasNoSerializables` cambiara de criterio.
    expect(JSON.parse(JSON.stringify(PRIVATE_NAV_ITEMS))).toEqual(PRIVATE_NAV_ITEMS);
  });

  it('cada icono declarado es una cadena, nunca el componente', () => {
    for (const item of PRIVATE_NAV_ITEMS) {
      expect(typeof item.icon, `${item.testId} declara el icono como objeto`).toBe('string');

      if (item.kind !== 'group') continue;

      for (const hijo of item.items) {
        if (hijo.icon === undefined) continue;
        expect(typeof hijo.icon, `${hijo.testId} declara el icono como objeto`).toBe('string');
      }
    }
  });
});
