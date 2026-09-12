// T9 (QC-25) — Adaptador driven de `ProductCatalog` en `inventario`.
//
// HONESTIDAD: este archivo NO toca Postgres, mismo criterio que
// `tests/unit/inventario/product-prisma.test.ts`. Solo prueba el mapeo PURO
// (`toProductRef`) y el atajo sin consulta de `findRefs([])`. La garantia REAL de que
// `findRefs` solo devuelve productos vivos (R17, `deleted_at IS NULL` en el `where`) la
// da el test de integracion contra Postgres real
// `tests/integration/recetas/recipe-lines.int.test.ts`, describe `'R17: findProductRefs
// solo devuelve productos vivos'` -ese es el que muerde si alguien quita el filtro; este
// archivo, con mocks, no podria detectarlo.

import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  findProductRefs,
  toProductRef,
} from '@/lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma';

describe('toProductRef', () => {
  it('mapea id, name y stock tal cual', () => {
    const ref = toProductRef({
      id: 'p-1',
      name: 'Acido sulfurico',
      stock: 12,
    });
    expect(ref).toEqual({
      id: 'p-1',
      name: 'Acido sulfurico',
      stock: 12,
    });
  });

  it('conserva stock null cuando el producto no declara existencia', () => {
    const ref = toProductRef({
      id: 'p-1',
      name: 'Acido sulfurico',
      stock: null,
    });
    expect(ref.stock).toBeNull();
  });

  it('la referencia publica NO lleva unidad, ni la vieja ni la derivada (QC-80, R21)', () => {
    // R21 — `ProductRef` es lo que `inventario` publica a OTROS modulos, y `unitId` se retira
    // de ahi SIN SUSTITUTO: el unico llamante de `findRefs` es `recetas`, que lo pide para
    // saber si el producto sigue vivo y para su nombre y su existencia. La unidad de una linea
    // de receta es `recipe_lines.unit_id`, propia de `recetas` y ajena a esta ficha.
    //
    // Se afirma sobre las CLAVES del objeto devuelto y no solo con el compilador: un `as` en el
    // adaptador dejaria pasar el campo sin que el typecheck dijera nada. Y tampoco aparece
    // `latestBatchUnitId`: el contrato publico no cambia de campo, pierde uno que nadie usaba.
    const ref = toProductRef({ id: 'p-1', name: 'Acido sulfurico', stock: 0 });
    expect(Object.keys(ref).sort()).toEqual(['id', 'name', 'stock']);
    expect(Object.keys(ref)).not.toContain('unitId');
    expect(Object.keys(ref)).not.toContain('latestBatchUnitId');
  });
});

describe('findRefs con lista vacia', () => {
  it('con una lista vacia de ids no consulta la base y devuelve una lista vacia', async () => {
    // R17: `findRefs([])` no dispara ninguna consulta -evita un `IN ()` sin sentido.
    const refs = await findProductRefs([]);
    expect(refs).toEqual([]);
  });
});

// AMPLIACION 2026-09-11 (QC-49, R29) — `findRefs` SE QUEDA SIN AMBITO, Y ESO ESTA ESCRITO.
//
// QC-49 acota por empresa TODA consulta y TODA escritura del modulo (R13). `findProductRefs` es
// la UNICA excepcion, y el requisito no pide solo que se quede fuera: pide que se quede fuera
// **con el motivo citado y el destino nombrado**, para que dentro de seis meses nadie lo lea
// como un olvido y lo "arregle" -o, peor, como un permiso para dejar sin ambito la siguiente
// consulta-.
//
// Por eso este bloque afirma DOS cosas distintas: (a) la firma efectivamente no gano el ambito
// -comprobable ejecutando-, y (b) la excepcion esta documentada donde toca, con su `R29` y su
// `QC-50` -comprobable leyendo el archivo-. Sin (b) el test seria verde y la deuda, invisible.
describe('QC-49 R29 — findRefs sin ambito de empresa, como excepcion explicita', () => {
  const RAIZ_PERSISTENCIA = path.join(
    process.cwd(),
    'lib',
    'modules',
    'inventario',
    'adapters',
    'driven',
    'persistence',
  );
  const FUENTE_CATALOGO = path.join(RAIZ_PERSISTENCIA, 'product-catalog-prisma.ts');
  const FUENTE_AMBITO = path.join(RAIZ_PERSISTENCIA, 'company-scope.ts');

  /** El codigo, sin comentarios: la prosa documenta la excepcion y no debe contaminar (a). */
  function codigoSinComentarios(archivo: string): string {
    return readFileSync(archivo, 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
  }

  it('la firma NO gano el ambito: sigue recibiendo solo los identificadores', async () => {
    // Un argumento y nada mas. Si alguien le anadiera el `scope` -"por coherencia"-, `recetas`
    // tendria que pasarlo y esta ficha habria invadido otro modulo (R28).
    expect(findProductRefs).toHaveLength(1);

    // Y sigue resolviendo sin ambito: la llamada del atajo no necesita ninguna empresa.
    await expect(findProductRefs([])).resolves.toEqual([]);
  });

  it('el CODIGO del adaptador no compone ningun ambito de empresa', () => {
    // Falsable: en cuanto alguien escriba `companyId` o importe `./company-scope` en el
    // adaptador del catalogo, esto cae -y con razon: ese cambio es QC-50, no esta ficha-.
    const codigo = codigoSinComentarios(FUENTE_CATALOGO);

    expect(codigo).not.toContain('companyId');
    expect(codigo).not.toContain('company-scope');
    expect(codigo).not.toContain('InventoryScope');
  });

  it('la excepcion esta DOCUMENTADA en el adaptador, con el requisito y el destino QC-50', () => {
    // (b): el motivo citado. Es lo que separa una excepcion aprobada de un olvido.
    const fuente = readFileSync(FUENTE_CATALOGO, 'utf-8');

    expect(fuente).toContain('R29');
    expect(fuente).toContain('QC-50');
  });

  it('el punto unico de consulta tambien nombra la excepcion, para que no se lea como regla', () => {
    // La otra mitad: quien lea `company-scope.ts` -el sitio donde vive LA definicion de «de la
    // empresa»- tiene que enterarse alli mismo de que hay una consulta fuera, cual es y adonde
    // va. Si la excepcion solo estuviera en el archivo excluido, nadie la encontraria.
    const fuente = readFileSync(FUENTE_AMBITO, 'utf-8');

    expect(fuente).toContain('findProductRefs');
    expect(fuente).toContain('R29');
    expect(fuente).toContain('QC-50');
  });
});
