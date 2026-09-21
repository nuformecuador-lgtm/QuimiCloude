import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El rasterizado de PDF carga un binario `.node` en ejecucion. Si Next empaqueta el paquete
  // para el servidor, ese binario se queda fuera del bundle y la carga falla con "Cannot find
  // native binding": declararlo externo hace que se resuelva desde `node_modules` al ejecutar.
  serverExternalPackages: ["@napi-rs/canvas"],
};

export default nextConfig;
