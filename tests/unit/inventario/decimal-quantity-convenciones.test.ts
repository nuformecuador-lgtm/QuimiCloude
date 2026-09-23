// Guardia de convencion: las cantidades decimales de inventario y de la tabla de ingredientes
// del pedido nunca cruzan por coma flotante binaria (R6, `specs/QC-141-reserva-de-material-del-
// pedido/tasks.md > T5`). No hay guardia de ruta que cubra `app/(private)/inventario/components`
// hoy con este alcance -`product-route-contract.test.ts` vigila otras quince reglas, no esta-, y
// `order-ingredients-table.tsx` no vive bajo esa ruta: por eso este archivo, con la MISMA forma
// que `conversionesDeImporte` de `tests/unit/pedidos-ui/pedidos-convenciones.test.ts` -detector
// puro + barrido real + caso negativo que demuestra que la guardia muerde-.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(__dirname, '..', '..', '..');

/** Los archivos de T5 que pintan o teclean una cantidad decimal. */
const ARCHIVOS_VIGILADOS = [
  'app/(private)/inventario/components/product-columns.tsx',
  'app/(private)/inventario/components/product-batches-panel.tsx',
  'app/(private)/inventario/components/product-form.tsx',
  'app/(private)/inventario/components/adjust-batch-dialog.tsx',
  'app/(private)/inventario/components/product-cost-amount.ts',
  'app/(private)/pedidos/components/order-ingredients-table.tsx',
] as const;

function leer(rutaRelativa: string): string {
  return readFileSync(join(RAIZ, rutaRelativa), 'utf8');
}

/** Fuente sin comentarios: las guardias miran codigo, no prosa que cite el propio patron. */
function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/**
 * `Number(`, `parseFloat(` y `.toFixed(` sobre una cantidad decimal: las tres formas de que un
 * `decimal(14,4)` pase por el binario de coma flotante. Ninguna de las tres tiene uso legitimo en
 * estos seis archivos -a diferencia de `product-list-params.ts`, que si usa `Number(` para la
 * pagina y el tamano de pagina de la URL, enteros de consulta y no cantidades-.
 */
function conversionesDeComaFlotante(fuente: string): string[] {
  const violaciones: string[] = [];

  sinComentarios(fuente)
    .split('\n')
    .forEach((linea, indice) => {
      const numero = indice + 1;
      if (/\bNumber\s*\(/.test(linea)) violaciones.push(`${numero}: Number(`);
      if (/\bparseFloat\s*\(/.test(linea)) violaciones.push(`${numero}: parseFloat(`);
      if (/\.toFixed\s*\(/.test(linea)) violaciones.push(`${numero}: toFixed(`);
    });

  return violaciones;
}

describe('las cantidades decimales de inventario no pasan por coma flotante (R6)', () => {
  it('ninguno de los seis archivos de T5 usa Number(, parseFloat( ni .toFixed(', () => {
    const culpables = ARCHIVOS_VIGILADOS.flatMap((archivo) =>
      conversionesDeComaFlotante(leer(archivo)).map((detalle) => `${archivo}:${detalle}`),
    );

    expect(culpables, culpables.join(', ')).toEqual([]);
  });

  it('y el detector FALLA ante las tres formas, sin morder a un comentario que las cite', () => {
    expect(conversionesDeComaFlotante('const q = Number(product.stock);')).not.toEqual([]);
    expect(conversionesDeComaFlotante('const q = parseFloat(batch.stock);')).not.toEqual([]);
    expect(conversionesDeComaFlotante('const q = stock.toFixed(2);')).not.toEqual([]);

    expect(
      conversionesDeComaFlotante('// nunca uses Number( aqui: rompe el decimal exacto'),
    ).toEqual([]);
  });
});
