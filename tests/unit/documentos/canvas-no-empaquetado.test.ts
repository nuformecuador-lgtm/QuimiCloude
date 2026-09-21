/**
 * Guardia: el par nativo de rasterizado tiene que seguir fuera del empaquetado.
 *
 * NACE DE UN FALLO REAL. `@napi-rs/canvas` entro con QC-106 y `next.config.ts` seguia tal cual lo
 * genero `create-next-app`, vacio. Resultado, medido el 2026-09-21 sobre `dev` intacto:
 * `next build` sale con EXIT 1 y «non-ecmascript placeable asset». Tres fichas de PDF -QC-106,
 * QC-108 y QC-111- pasaron el gate en verde con la aplicacion sin poder compilar, porque NINGUN
 * nivel del arnes compila para produccion (QC-135).
 *
 * Se afirma sobre la CONFIGURACION y no sobre el resultado del build a proposito: correr
 * `next build` dentro de un test de unidad lo convertiria en minutos. Quien comprueba el build de
 * verdad es el gate, cuando QC-135 lo meta; esto solo evita que alguien borre la linea sin darse
 * cuenta de lo que sujeta.
 */
import { describe, expect, it } from 'vitest';

import nextConfig from '@/next.config';

/** El paquete cuyo binario `.node` no es empaquetable: lo elige su `js-binding.js` en ejecucion. */
const PAR_NATIVO_DE_RASTERIZADO = '@napi-rs/canvas';

describe('documentos — el par nativo de rasterizado no se empaqueta', () => {
  it('`serverExternalPackages` existe y no esta vacio', () => {
    // Sin esto, los dos casos de abajo pasarian por vacuidad si alguien borrara la clave entera.
    expect(nextConfig.serverExternalPackages).toBeDefined();
    expect(nextConfig.serverExternalPackages?.length ?? 0).toBeGreaterThan(0);
  });

  it('e incluye el par nativo de rasterizado, sin el cual `next build` no termina', () => {
    expect(nextConfig.serverExternalPackages).toContain(PAR_NATIVO_DE_RASTERIZADO);
  });

  it('y la comprobacion MUERDE ante una lista que no lo lleva', () => {
    // Control positivo: sin el, este archivo pasaria aunque la afirmacion no mirase nada.
    const sinElPar = ['otro-paquete'];
    expect(sinElPar).not.toContain(PAR_NATIVO_DE_RASTERIZADO);
    expect([PAR_NATIVO_DE_RASTERIZADO]).toContain(PAR_NATIVO_DE_RASTERIZADO);
  });
});
