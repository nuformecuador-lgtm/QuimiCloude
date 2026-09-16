/**
 * QC-104 T2 — Ambito de peticion para memoizar una lectura mientras dura UNA peticion
 * (`design.md > 2.3`). Una sola memoizacion, dos fuentes de ambito:
 *
 *   1. **Pintado de una pantalla**: el ambito que React da por peticion con `cache`.
 *   2. **Invocacion de una Server Action**: un ambito explicito con `AsyncLocalStorage`,
 *      que es modulo de Node y no una dependencia npm (R20).
 *
 * Si no hay ninguno de los dos, NO se memoiza nada y cada llamada lee (R7).
 *
 * `lib/shared/` es HOJA del grafo: no importa modulos ni `lib/composition`
 * (`docs/architecture.md > La regla de dependencias`; guardia, bloque 9). Los UNICOS
 * imports de este archivo son `react` (dependencia heredada, `docs/dependencias.md`) y
 * `node:async_hooks` (modulo de Node): R20 no admite ninguno mas, y lo comprueba una
 * prueba de fuente en `tests/unit/shared/request-scope.test.ts`.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

import { cache } from 'react';

export type RequestScope = {
  /**
   * Envuelve una funcion sin argumentos: dentro de un ambito de peticion se evalua UNA
   * vez y todas las llamadas reciben la MISMA promesa; fuera de ambito se evalua en cada
   * llamada (R7).
   */
  requestScoped<T>(compute: () => Promise<T>): () => Promise<T>;
  /**
   * Ejecuta `fn` dentro de un ambito de peticion. Si ya hay uno activo (explicito o de
   * pintado), lo REUTILIZA; si no, abre uno explicito que muere cuando `fn` termina.
   */
  runInRequestScope<T>(fn: () => Promise<T>): Promise<T>;
};

/**
 * Fabrica del ambito. `renderStore` se inyecta para que los tests puedan simular el
 * ambito de pintado: en Vitest el `cache` real de React no memoiza nada
 * (`design.md > 0`, H5), asi que ejercitar React de verdad no probaria el cableado.
 */
export function createRequestScope(deps: { renderStore: () => Map<object, unknown> }): RequestScope {
  const explicitStorage = new AsyncLocalStorage<Map<object, unknown>>();

  /**
   * El almacen activo, en el orden de busqueda de `design.md > 2.3`. Devuelve `null`
   * cuando no hay ningun ambito.
   */
  function activeStore(): Map<object, unknown> | null {
    const explicit = explicitStorage.getStore();
    if (explicit) return explicit;
    // Ambito de pintado: dentro de una peticion de React las dos llamadas devuelven el
    // MISMO `Map`; fuera, `cache` reevalua la funcion y salen distintos. Se apoya en el
    // contrato documentado de `React.cache` («same request -> same result»), no en ningun
    // campo interno (`design.md > 2.3`, punto 2).
    const first = deps.renderStore();
    const second = deps.renderStore();
    return first === second ? first : null;
  }

  function requestScoped<T>(compute: () => Promise<T>): () => Promise<T> {
    // Clave propia y estable de ESTA funcion envuelta dentro del `Map` de la peticion.
    const key: object = {};
    return () => {
      const store = activeStore();
      if (!store) return compute();
      const shared = store.get(key);
      if (shared !== undefined) return shared as Promise<T>;
      // Se guarda la PROMESA, no el valor: dos llamadas simultaneas comparten la consulta
      // en vuelo, y una promesa rechazada tambien se comparte —nadie reintenta dentro de
      // la peticion (R9).
      const pending = compute();
      store.set(key, pending);
      return pending;
    };
  }

  async function runInRequestScope<T>(fn: () => Promise<T>): Promise<T> {
    // Una Server Action invocada por un componente de servidor MIENTRAS se pinta comparte
    // la lectura del pintado en vez de abrir la suya (`design.md > 2.4`).
    if (activeStore()) return fn();
    return explicitStorage.run(new Map<object, unknown>(), fn);
  }

  return { requestScoped, runInRequestScope };
}

/** Instancia de produccion: el ambito de pintado es el de React (`design.md > 2.3`). */
export const { requestScoped, runInRequestScope } = createRequestScope({
  renderStore: cache(() => new Map<object, unknown>()),
});
