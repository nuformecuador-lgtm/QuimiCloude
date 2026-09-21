import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Paquetes que NO se empaquetan: se cargan con `require` en ejecucion.
   *
   * Son DOS y cada uno hace un papel distinto: `@napi-rs/canvas` RASTERIZA paginas del PDF a PNG,
   * `sharp` RECORTA una region de esa imagen ya rasterizada. Los dos son binarios nativos, no
   * JavaScript: cada uno es un envoltorio sobre un binario compilado que su propio cargador elige
   * por plataforma y arquitectura en tiempo de EJECUCION. Turbopack no puede meter ninguno de los
   * dos en un chunk ESM -un binario nativo no tiene module id- y el build entero falla con
   * «non-ecmascript placeable asset» si falta cualquiera de las dos entradas.
   *
   * Medido el 2026-09-21: sin la linea de `@napi-rs/canvas` `next build` sale con exit 1; con ella,
   * exit 0.
   *
   * Que el adaptador ya los cargue con `await import()` NO basta: un especificador literal sigue
   * siendo analizable, asi que el bundler lo mete en el grafo igual. La carga diferida ayuda en
   * ejecucion, no en compilacion.
   *
   * `tests/unit/documentos/canvas-no-empaquetado.test.ts` lo hace cumplir.
   */
  serverExternalPackages: ['@napi-rs/canvas', 'sharp'],
};

export default nextConfig;
