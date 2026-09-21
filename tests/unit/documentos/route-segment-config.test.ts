/**
 * Guardia: la configuracion de segmento del webhook de la cola tiene que seguir siendo algo que
 * Next sepa leer.
 *
 * NACE DE UN FALLO REAL, no de una precaucion. QC-111 mergeo `export { POST, runtime } from '...'`
 * y eso rompe `next build` entero: «Next.js can't recognize the exported `runtime` field in route.
 * It mustn't be reexported». Paso gate completo en verde -576 archivos, 8289 tests- y dos vueltas
 * de reviewer, porque NINGUN nivel del arnes compila para produccion (QC-135).
 *
 * Esta guardia afirma sobre UN archivo, el suyo, y no sobre el arbol entero: es justo lo que
 * QC-111 dejo escrito como deuda sobre las guardias de alcance escritas como absolutos.
 *
 * Se lee el archivo con `fs` en vez de importarlo A PROPOSITO: lo que hay que comprobar es la
 * FORMA DEL CODIGO -que el valor sea un literal-, y un import solo devolveria el valor ya
 * evaluado, que es exactamente lo que no distingue un literal de una expresion.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MAX_JOB_MAX_DURATION_SECONDS } from '@/lib/modules/documentos/domain/processing-timeouts';

const RUTA = join(process.cwd(), 'app', 'api', 'documentos', 'trabajos', 'route.ts');

/**
 * CRLF normalizado antes de nada. Es el defecto que `progress/fix-guardias-crlf.md` ya arreglo en
 * cinco guardias y que sigue vivo en otra: un `$` de fin de linea no casa si queda un `\r` delante.
 */
function fuente(): string {
  return readFileSync(RUTA, 'utf8').replace(/\r\n/g, '\n');
}

/**
 * La fuente SIN comentarios, que es sobre lo que se puede afirmar «el codigo hace X».
 *
 * Hace falta de verdad, no por prolijidad: el docblock de `route.ts` CITA la forma prohibida
 * (`export { runtime } from ...`) para explicar por que esta prohibida, y sin despojar comentarios
 * la guardia se muerde a si misma. Primero los de bloque y luego los de linea, y siempre despues
 * de normalizar CRLF.
 */
function codigoSinComentarios(): string {
  return fuente()
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

/** Los campos que Next extrae del archivo de ruta y que, por tanto, no se pueden reexportar. */
const CAMPOS_DE_CONFIGURACION = [
  'runtime',
  'maxDuration',
  'dynamic',
  'dynamicParams',
  'revalidate',
  'preferredRegion',
] as const;

/**
 * Los campos de configuracion que aparecen en una reexportacion.
 *
 * Se comparan IDENTIFICADORES EXACTOS, partiendo el bloque por comas, en vez de buscar el nombre
 * dentro del texto: `POSTruntime` no es `runtime`, y un `as` de renombrado no debe colarse.
 */
function reexportaConfig(codigo: string): readonly string[] {
  const culpables: string[] = [];
  for (const bloque of codigo.matchAll(/export\s*\{([^}]*)\}\s*from\s*['"][^'"]+['"]/g)) {
    const nombres = (bloque[1] ?? '')
      .split(',')
      .map((parte) => parte.trim().split(/\s+as\s+/)[0]?.trim() ?? '')
      .filter((nombre) => nombre.length > 0);

    for (const campo of CAMPOS_DE_CONFIGURACION) {
      if (nombres.includes(campo)) culpables.push(campo);
    }
  }
  return culpables;
}

/** El valor de `maxDuration` SOLO si esta escrito como literal numerico. */
function maxDurationLiteral(codigo: string): number | null {
  const encontrado = /^export const maxDuration = (\d+);$/m.exec(codigo);
  return encontrado ? Number(encontrado[1]) : null;
}

describe('documentos — la configuracion de segmento del webhook de la cola', () => {
  it('NO reexporta ningun campo de configuracion: Next no lo reconoce y el build falla', () => {
    const culpables = reexportaConfig(codigoSinComentarios());
    expect(culpables, `reexportados: ${culpables.join(', ')}`).toEqual([]);
  });

  it('y el detector MUERDE ante la forma exacta que rompio el build', () => {
    // Control positivo: sin esto, la afirmacion de arriba pasaria aunque el detector no mirara.
    expect(
      reexportaConfig("export { POST, runtime } from '@/lib/modules/documentos/x';"),
    ).toEqual(['runtime']);
    expect(reexportaConfig("export { POST } from '@/lib/modules/documentos/x';")).toEqual([]);
  });

  it('declara `runtime` como literal en el propio archivo de ruta', () => {
    expect(codigoSinComentarios()).toMatch(/^export const runtime = 'nodejs';$/m);
  });

  it('declara `maxDuration` como LITERAL, nunca como expresion ni desde process.env', () => {
    // Una expresion compila, pero Next extrae este campo analizando el archivo estaticamente: el
    // valor no llegaria al build output y la funcion correria con el defecto de la plataforma.
    expect(codigoSinComentarios()).not.toMatch(/export const maxDuration =.*process\.env/);
    expect(maxDurationLiteral(codigoSinComentarios()), 'maxDuration no es un literal numerico').not.toBeNull();
  });

  it('y ese literal no pasa del techo que admite la plataforma', () => {
    const valor = maxDurationLiteral(codigoSinComentarios());
    expect(valor).not.toBeNull();
    expect(valor as number).toBeLessThanOrEqual(MAX_JOB_MAX_DURATION_SECONDS);
    expect(valor as number).toBeGreaterThan(0);
  });
});
