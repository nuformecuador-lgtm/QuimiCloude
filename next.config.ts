import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Paquetes que NO se empaquetan: se cargan con `require` en ejecucion.
   *
   * `@napi-rs/canvas` no es JavaScript, es un envoltorio sobre un binario compilado
   * (`skia.<plataforma>.node`) que su `js-binding.js` elige por plataforma y arquitectura en
   * tiempo de EJECUCION. Turbopack no puede meterlo en un chunk ESM -un `.node` no tiene module
   * id- y el build entero falla con «non-ecmascript placeable asset».
   *
   * Medido el 2026-09-21: sin esta linea `next build` sale con exit 1; con ella, exit 0.
   *
   * Que el adaptador ya lo cargue con `await import()` NO basta: un especificador literal sigue
   * siendo analizable, asi que el bundler lo mete en el grafo igual. La carga diferida ayuda en
   * ejecucion, no en compilacion.
   *
   * `tests/unit/documentos/canvas-no-empaquetado.test.ts` lo hace cumplir.
   */
  serverExternalPackages: ['@napi-rs/canvas'],
};

export default nextConfig;
