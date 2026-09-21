/**
 * Guardia: los binarios nativos que tocan imagenes del PDF tienen que seguir fuera del
 * empaquetado.
 *
 * NACE DE UN FALLO REAL. `@napi-rs/canvas` entro con QC-106 y `next.config.ts` seguia tal cual lo
 * genero `create-next-app`, vacio. Resultado, medido el 2026-09-21 sobre `dev` intacto:
 * `next build` sale con EXIT 1 y «non-ecmascript placeable asset». Tres fichas de PDF -QC-106,
 * QC-108 y QC-111- pasaron el gate en verde con la aplicacion sin poder compilar, porque NINGUN
 * nivel del arnes compila para produccion (QC-135).
 *
 * AHORA SON DOS PAQUETES, no uno: `sharp` entra con QC-110 para recortar la region que la IA
 * senala sobre la pagina ya rasterizada, y es tan binario nativo como `@napi-rs/canvas`. Cada uno
 * hace un papel distinto -uno rasteriza la pagina entera, el otro recorta una region- y los dos
 * tienen que seguir en `serverExternalPackages` o el build vuelve a caer igual que en QC-106.
 *
 * Se afirma sobre la CONFIGURACION y no sobre el resultado del build a proposito: correr
 * `next build` dentro de un test de unidad lo convertiria en minutos. Quien comprueba el build de
 * verdad es el gate, cuando QC-135 lo meta; esto solo evita que alguien borre una linea sin darse
 * cuenta de lo que sujeta.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import nextConfig from '@/next.config';

/** El paquete cuyo binario `.node` rasteriza cada pagina del PDF a PNG. */
const RASTERIZADOR = '@napi-rs/canvas';

/** El paquete cuyo binario nativo recorta una region de esa imagen ya rasterizada. */
const RECORTADOR = 'sharp';

describe('documentos — los binarios nativos de imagen no se empaquetan', () => {
  it('`serverExternalPackages` existe y no esta vacio', () => {
    // Sin esto, los casos de abajo pasarian por vacuidad si alguien borrara la clave entera.
    expect(nextConfig.serverExternalPackages).toBeDefined();
    expect(nextConfig.serverExternalPackages?.length ?? 0).toBeGreaterThan(0);
  });

  it('R10 — incluye el rasterizador, sin el cual `next build` no termina', () => {
    expect(nextConfig.serverExternalPackages).toContain(RASTERIZADOR);
  });

  it('R10 — y la comprobacion MUERDE ante una lista a la que le falta el rasterizador', () => {
    // Control positivo: sin el, este archivo pasaria aunque la afirmacion no mirase nada.
    const sinElRasterizador = [RECORTADOR];
    expect(sinElRasterizador).not.toContain(RASTERIZADOR);
    expect([RASTERIZADOR]).toContain(RASTERIZADOR);
  });

  it('R11 — incluye el recortador, tan binario nativo como el rasterizador', () => {
    expect(nextConfig.serverExternalPackages).toContain(RECORTADOR);
  });

  it('R11 — y la comprobacion MUERDE ante una lista a la que le falta el recortador', () => {
    // Control positivo: sin el, este archivo pasaria aunque la afirmacion no mirase nada.
    const sinElRecortador = [RASTERIZADOR];
    expect(sinElRecortador).not.toContain(RECORTADOR);
    expect([RECORTADOR]).toContain(RECORTADOR);
  });

  it('R11 — el rasterizador SIGUE siendo quien carga el par nativo de rasterizado', () => {
    const adaptador = readFileSync(
      join(process.cwd(), 'lib/modules/documentos/adapters/driven/pdf/pdf-converter-unpdf.ts'),
      'utf-8',
    );

    expect(adaptador).toContain(RASTERIZADOR);
  });

  it('R11 — y la comprobacion MUERDE ante un archivo que no lo cite', () => {
    // Control positivo: sin el, el caso de arriba pasaria aunque la afirmacion no mirase nada.
    const sinLaCita = 'export function renderPages() {}';
    expect(sinLaCita).not.toContain(RASTERIZADOR);
    expect(`import '${RASTERIZADOR}'`).toContain(RASTERIZADOR);
  });
});
