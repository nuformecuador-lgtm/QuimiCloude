// Guardia de alcance de QC-91: afirma el ESTADO NUEVO en positivo, sobre fuentes nombradas, no un
// censo de ausencia sobre `lib/` y `app/` enteros. No mira ningun diff ni ninguna rama: lee las
// mismas fuentes que ya usa el resto del arnes y las compara con fuentes fabricadas.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Copia local del extractor de `qc81-alcance.test.ts`: importar ese archivo directamente
 * ejecutaria tambien sus `describe` de nivel superior por efecto secundario, duplicando su
 * suite dentro de esta. La logica es identica y no depende de nada de este modulo.
 */
function stripComments(fuente: string): string {
  let salida = '';
  let i = 0;
  while (i < fuente.length) {
    const c = fuente[i];
    const siguiente = fuente[i + 1];
    if (c === '/' && siguiente === '/') {
      while (i < fuente.length && fuente[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && siguiente === '*') {
      const fin = fuente.indexOf('*/', i + 2);
      i = fin === -1 ? fuente.length : fin + 2;
      salida += ' ';
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const inicio = i;
      i += 1;
      while (i < fuente.length && fuente[i] !== c) {
        if (fuente[i] === '\\') i += 1;
        i += 1;
      }
      i += 1;
      salida += fuente.slice(inicio, i);
      continue;
    }
    salida += c;
    i += 1;
  }
  return salida;
}

function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (;;) {
    try {
      readFileSync(join(dir, 'package.json'));
      return dir;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) throw new Error(`no se encontro package.json subiendo desde ${startDir}`);
      dir = parent;
    }
  }
}

const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)));

function leer(rutaRelativa: string): string {
  return readFileSync(join(repoRoot, rutaRelativa), 'utf8');
}

const MODULO = 'lib/modules/inventario';
const PRODUCT_VIEW = `${MODULO}/domain/product-view.ts`;
const PRODUCT_CATALOG = `${MODULO}/domain/product-catalog.ts`;
const PRODUCT_INPUT = `${MODULO}/domain/product-input.ts`;
const PRODUCT_STOCK = `${MODULO}/domain/product-stock.ts`;
const PRODUCT_PRISMA = `${MODULO}/adapters/driven/persistence/product-prisma.ts`;
const PRODUCT_CATALOG_PRISMA = `${MODULO}/adapters/driven/persistence/product-catalog-prisma.ts`;
const SCHEMA = 'db/schema.prisma';

// ---------------------------------------------------------------------------------------------
// EXTRACTORES DE UN BLOQUE CON LLAVES BALANCEADAS
// ---------------------------------------------------------------------------------------------

/** El cuerpo `{ ... }` que sigue al encabezado dado, con balance de llaves (no el primer `}`). */
function bloqueTrasEncabezado(codigoSinComentarios: string, encabezado: string): string | null {
  const inicio = codigoSinComentarios.indexOf(encabezado);
  if (inicio === -1) return null;
  const llave = codigoSinComentarios.indexOf('{', inicio);
  if (llave === -1) return null;
  let profundidad = 0;
  let fin = -1;
  for (let i = llave; i < codigoSinComentarios.length; i += 1) {
    if (codigoSinComentarios[i] === '{') profundidad += 1;
    if (codigoSinComentarios[i] === '}') {
      profundidad -= 1;
      if (profundidad === 0) {
        fin = i;
        break;
      }
    }
  }
  return fin === -1 ? null : codigoSinComentarios.slice(inicio, fin + 1);
}

/** El cuerpo de `export type <nombre> = { ... }`, o `null` si el tipo no existe con esa forma. */
export function cuerpoDeTipo(fuente: string, nombre: string): string | null {
  return bloqueTrasEncabezado(stripComments(fuente), `export type ${nombre} = {`);
}

/** El cuerpo de `export const <nombre> = { ... }`, o `null` si la constante no existe con esa forma. */
export function cuerpoDeConst(fuente: string, nombre: string): string | null {
  return bloqueTrasEncabezado(stripComments(fuente), `export const ${nombre} = {`);
}

/**
 * La llave que abre el CUERPO de la funcion, saltando el tipo de retorno: uno como
 * `Promise<{ stock: number } | null>` trae sus propias llaves y angulos, y la primera `{` tras el
 * cierre de parametros puede ser una de esas, no la del cuerpo.
 */
function llaveDeCuerpoTrasParametros(codigo: string, cierreParametros: number): number {
  let profundidadAngulos = 0;
  let profundidadLlavesDeTipo = 0;
  for (let i = cierreParametros + 1; i < codigo.length; i += 1) {
    const caracter = codigo[i];
    if (caracter === '<') {
      profundidadAngulos += 1;
    } else if (caracter === '>') {
      profundidadAngulos = Math.max(0, profundidadAngulos - 1);
    } else if (caracter === '{') {
      if (profundidadAngulos === 0 && profundidadLlavesDeTipo === 0) return i;
      profundidadLlavesDeTipo += 1;
    } else if (caracter === '}') {
      profundidadLlavesDeTipo = Math.max(0, profundidadLlavesDeTipo - 1);
    }
  }
  return -1;
}

/** El indice del `)` que CIERRA la lista de parametros que abre en `aperturaParametros`. */
function cierreDeParametros(codigo: string, aperturaParametros: number): number {
  let profundidad = 0;
  for (let i = aperturaParametros; i < codigo.length; i += 1) {
    if (codigo[i] === '(') profundidad += 1;
    if (codigo[i] === ')') {
      profundidad -= 1;
      if (profundidad === 0) return i;
    }
  }
  return -1;
}

/**
 * El cuerpo de `[export] [async] function <nombre>(...) { ... }` completo, con balance de
 * llaves. Los prefijos exportados van primero para que una funcion exportada nunca se corte por
 * un prefijo mas corto que tambien casa dentro de ella (`function foo(` dentro de `export
 * function foo(`).
 */
export function cuerpoDeFuncion(fuente: string, nombre: string): string | null {
  const codigo = stripComments(fuente);
  for (const prefijo of ['export async function ', 'export function ', 'async function ', 'function ']) {
    const inicio = codigo.indexOf(`${prefijo}${nombre}(`);
    if (inicio === -1) continue;
    const cierreParametros = cierreDeParametros(codigo, codigo.indexOf('(', inicio));
    if (cierreParametros === -1) return null;
    const llave = llaveDeCuerpoTrasParametros(codigo, cierreParametros);
    if (llave === -1) return null;
    let profundidad = 0;
    for (let i = llave; i < codigo.length; i += 1) {
      if (codigo[i] === '{') profundidad += 1;
      if (codigo[i] === '}') {
        profundidad -= 1;
        if (profundidad === 0) return codigo.slice(inicio, i + 1);
      }
    }
    return null;
  }
  return null;
}

/** Modelo de Prisma: `model <nombre> { ... }`. */
export function cuerpoDeModelo(fuente: string, nombre: string): string | null {
  return bloqueTrasEncabezado(stripComments(fuente), `model ${nombre} {`);
}

// ---------------------------------------------------------------------------------------------
// DETECTORES (puros)
// ---------------------------------------------------------------------------------------------

/** Un campo `stockByUnit` declarado -la existencia agregada por unidad-. */
export function exponeStockPorUnidad(cuerpo: string): boolean {
  return /\bstockByUnit\b/.test(cuerpo);
}

/**
 * Un campo `stock` PLANO -numero suelto-, distinto de `stockByUnit`: el `\b` tras `stock` no
 * cruza a `ByUnit` porque los dos son caracteres de palabra, asi que esta expresion nunca muerde
 * el campo agregado por error.
 */
export function declaraCampoStockPlano(cuerpo: string): boolean {
  return /\bstock\b\s*\??\s*:/.test(cuerpo);
}

/** Ni siquiera la palabra `stock` aparece -para `NewProduct`, que no escribe ninguna existencia. */
export function mencionaStock(cuerpo: string): boolean {
  return /\bstock/i.test(cuerpo);
}

/**
 * La agregacion pasa por lotes con su unidad y por `sumStockByUnit` o `singleUnitStock` -esta
 * ultima delega en la primera-: es como se deriva del lote.
 */
export function derivaDeLotesConSumStockByUnit(cuerpo: string): boolean {
  return (
    /\b(?:sumStockByUnit|singleUnitStock)\s*\(/.test(cuerpo) &&
    /\b(?:batches|productBatch)\b/.test(cuerpo) &&
    /\bunitId\b/.test(cuerpo)
  );
}

/**
 * Sumar la existencia por fuera de `sumStockByUnit` -el unico sitio que agrega, por diseno-: un
 * `reduce`, un `_sum` de Prisma, un `SUM(...)` de SQL crudo o un acumulador `+=`.
 */
export function sumaPropia(cuerpo: string): string[] {
  const hallazgos: string[] = [];
  if (/\.reduce\s*\(/.test(cuerpo)) hallazgos.push('suma con reduce(...)');
  if (/\b_sum\b/.test(cuerpo)) hallazgos.push('agrega con _sum');
  if (/\bSUM\s*\(/i.test(cuerpo)) hallazgos.push('suma con SUM(...) en SQL crudo');
  if (/[^=!<>]\+=/.test(cuerpo)) hallazgos.push('acumula con +=');
  return hallazgos;
}

/**
 * Escrituras que borran, reemplazan en bloque o multiplican filas de `product_batches`, tipadas o
 * en SQL crudo. `update` simple NO esta aqui: tiene su propio detector, `llamaAUpdateFueraDe`, que
 * lo permite en un unico sitio nombrado.
 */
export function escrituraDestructivaDeLotes(fuente: string): string[] {
  const codigo = stripComments(fuente);
  const hallazgos: string[] = [];
  if (/\.productBatch\.(?:delete|deleteMany|updateMany|upsert)\s*\(/.test(codigo)) {
    hallazgos.push('llama a un metodo de escritura destructiva sobre productBatch');
  }
  if (/DELETE\s+FROM\s+"?product_batches"?/i.test(codigo)) {
    hallazgos.push('DELETE crudo sobre product_batches');
  }
  if (/UPDATE\s+"?product_batches"?\s+SET/i.test(codigo)) {
    hallazgos.push('UPDATE crudo sobre product_batches');
  }
  return hallazgos;
}

/**
 * `true` si `.productBatch.update(` aparece en algun lugar del archivo QUE NO sea el cuerpo de
 * `nombreFuncionPermitida`. Aisla ese cuerpo con `cuerpoDeFuncion` y busca en el resto, para que
 * un `update` movido a otra funcion -o uno nuevo, en cualquier sitio distinto- siga dando rojo.
 */
export function llamaAUpdateFueraDe(fuente: string, nombreFuncionPermitida: string): boolean {
  const codigo = stripComments(fuente);
  const cuerpoPermitido = cuerpoDeFuncion(fuente, nombreFuncionPermitida);
  const resto = cuerpoPermitido === null ? codigo : codigo.replace(stripComments(cuerpoPermitido), '');
  return /\.productBatch\.update\s*\(/.test(resto);
}

// ---------------------------------------------------------------------------------------------
// R1 — LA EXISTENCIA SE DERIVA DE LOS LOTES; `sumStockByUnit` ES EL UNICO SITIO QUE SUMA
// ---------------------------------------------------------------------------------------------

describe('QC-91 R1 — la existencia sale de sumar filas de lote, no de un numero propio', () => {
  it('R1: recalculateProductStock arma la existencia desde los lotes con singleUnitStock', () => {
    const cuerpo = cuerpoDeFuncion(leer(PRODUCT_PRISMA), 'recalculateProductStock');
    expect(
      cuerpo,
      'recalculateProductStock no existe con esa forma: el sujeto de esta prueba cambio',
    ).not.toBeNull();
    expect(derivaDeLotesConSumStockByUnit(cuerpo as string)).toBe(true);
    expect(sumaPropia(cuerpo as string)).toEqual([]);
  });

  it('R1: toProductView ya no deriva nada de los lotes: lee la columna guardada tal cual', () => {
    const cuerpo = cuerpoDeFuncion(leer(PRODUCT_PRISMA), 'toProductView');
    expect(cuerpo, 'toProductView no existe con esa forma: el sujeto de esta prueba cambio').not.toBeNull();
    expect(derivaDeLotesConSumStockByUnit(cuerpo as string)).toBe(false);
    expect(cuerpo as string).not.toMatch(/\bbatches\b/);
    expect(sumaPropia(cuerpo as string)).toEqual([]);
  });

  it('R14: product-catalog-prisma.ts arma stockByUnit desde la columna guardada, sin volver a sumar lotes', () => {
    const cuerpo = cuerpoDeFuncion(leer(PRODUCT_CATALOG_PRISMA), 'findProductRefs');
    expect(cuerpo, 'findProductRefs no existe con esa forma: el sujeto de esta prueba cambio').not.toBeNull();
    expect(cuerpo as string).not.toMatch(/sumStockByUnit\s*\(/);
    expect(cuerpo as string).toMatch(/\bunitId\b/);
    expect(cuerpo as string).toMatch(/\bstock\b/);
  });

  it('R1: los tres escritores de producto no suman por su cuenta', () => {
    const fuente = leer(PRODUCT_PRISMA);
    for (const nombre of ['createProduct', 'updateAliveProduct', 'createWithFirstBatch']) {
      const cuerpo = cuerpoDeFuncion(fuente, nombre);
      expect(cuerpo, `${nombre} no existe con esa forma: el sujeto de esta prueba cambio`).not.toBeNull();
      expect(sumaPropia(cuerpo as string), `${nombre} suma por su cuenta`).toEqual([]);
    }
  });

  it('R1: sumStockByUnit sigue siendo la unica funcion que agrupa y suma en su archivo', () => {
    const fuente = leer(PRODUCT_STOCK);
    expect(fuente).toMatch(/export function sumStockByUnit\s*\(/);
    // Agrupa con un Map y acumula con una asignacion, no con reduce/_sum/SQL: son formas
    // equivalentes de sumar, y esta es la unica permitida aqui porque es dominio puro.
    expect(fuente).toMatch(/totals\.set\(/);
  });

  it('R1: el detector de suma propia muerde con fuentes fabricadas y no con una limpia', () => {
    expect(sumaPropia('const t = rows.reduce((a, b) => a + b.stock, 0);')).toEqual([
      'suma con reduce(...)',
    ]);
    expect(sumaPropia('await tx.productBatch.aggregate({ _sum: { stock: true } });')).toEqual([
      'agrega con _sum',
    ]);
    expect(sumaPropia('await tx.$queryRaw`SELECT SUM("stock") FROM product_batches`;')).toEqual([
      'suma con SUM(...) en SQL crudo',
    ]);
    expect(sumaPropia('total += batch.stock;')).toEqual(['acumula con +=']);
    expect(
      sumaPropia('stockByUnit: sumStockByUnit(row.batches.map((b) => ({ stock: b.stock, unitId: b.unitId })))'),
    ).toEqual([]);
  });

  it('R1: el detector de derivacion muerde solo cuando estan los tres ingredientes', () => {
    expect(derivaDeLotesConSumStockByUnit('sumStockByUnit(row.batches.map((b) => ({ unitId: b.unitId })))')).toBe(
      true,
    );
    expect(
      derivaDeLotesConSumStockByUnit(
        'singleUnitStock(rows.map((row) => ({ unitId: row.presentation.unitId })))\ntx.productBatch.findMany(',
      ),
    ).toBe(true);
    expect(derivaDeLotesConSumStockByUnit('const stock = product.stock ?? 0;')).toBe(false);
    expect(derivaDeLotesConSumStockByUnit('sumStockByUnit([])')).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// R11 — LOS CONTRATOS PUBLICAN LA EXISTENCIA POR UNIDAD, NO UN NUMERO PLANO
// ---------------------------------------------------------------------------------------------

describe('QC-91 R11 — ProductRef expone stockByUnit; ProductView expone la existencia guardada; NewProduct y el alta no llevan existencia', () => {
  it('R14: ProductView expone stock, la existencia guardada, y no stockByUnit', () => {
    const cuerpo = cuerpoDeTipo(leer(PRODUCT_VIEW), 'ProductView');
    expect(cuerpo, 'ProductView no existe con esa forma: el sujeto de esta prueba cambio').not.toBeNull();
    expect(exponeStockPorUnidad(cuerpo as string)).toBe(false);
    expect(declaraCampoStockPlano(cuerpo as string)).toBe(true);
  });

  it('R11: NewProduct no lleva ninguna existencia -ni plana ni por unidad-', () => {
    const cuerpo = cuerpoDeTipo(leer(PRODUCT_VIEW), 'NewProduct');
    expect(cuerpo, 'NewProduct no existe con esa forma: el sujeto de esta prueba cambio').not.toBeNull();
    expect(mencionaStock(cuerpo as string)).toBe(false);
  });

  it('R11: ProductRef expone stockByUnit y no un campo stock plano', () => {
    const cuerpo = cuerpoDeTipo(leer(PRODUCT_CATALOG), 'ProductRef');
    expect(cuerpo, 'ProductRef no existe con esa forma: el sujeto de esta prueba cambio').not.toBeNull();
    expect(exponeStockPorUnidad(cuerpo as string)).toBe(true);
    expect(declaraCampoStockPlano(cuerpo as string)).toBe(false);
  });

  it('R11: los campos compartidos de alta/edicion (productFieldsShape) no llevan existencia', () => {
    const cuerpo = cuerpoDeConst(leer(PRODUCT_INPUT), 'productFieldsShape');
    expect(cuerpo, 'productFieldsShape no existe con esa forma: el sujeto de esta prueba cambio').not.toBeNull();
    expect(mencionaStock(cuerpo as string)).toBe(false);
    // updateProductSchema ya NO es un alias de createProductSchema: es una union discriminada
    // por `type` que NO conoce el lote (R9, R26). El alta es la union con lote.
    expect(leer(PRODUCT_INPUT)).toMatch(/export const updateProductSchema = withDefaultType\(updateUnion\)/);
    expect(leer(PRODUCT_INPUT)).toMatch(/export const createProductSchema = withDefaultType\(createUnion\)/);
  });

  it('R14: PRODUCT_SELECT trae products.stock y products.unit_id, sin catalogo de lotes', () => {
    const cuerpo = cuerpoDeConst(leer(PRODUCT_PRISMA), 'PRODUCT_SELECT');
    expect(cuerpo, 'PRODUCT_SELECT no existe con esa forma: el sujeto de esta prueba cambio').not.toBeNull();
    expect(declaraCampoStockPlano(cuerpo as string)).toBe(true);
    expect(cuerpo).not.toMatch(/\bbatches\s*:/);
  });

  it('R11: los tres escritores de producto no escriben products.stock', () => {
    const fuente = leer(PRODUCT_PRISMA);
    for (const nombre of ['createProduct', 'updateAliveProduct', 'createWithFirstBatch']) {
      const cuerpo = cuerpoDeFuncion(fuente, nombre);
      expect(cuerpo, `${nombre} no existe con esa forma: el sujeto de esta prueba cambio`).not.toBeNull();
      expect(declaraCampoStockPlano(cuerpo as string), `${nombre} escribe un campo stock`).toBe(false);
    }
  });

  it('R11: el detector de campo plano muerde con `stock:` y no con `stockByUnit:`', () => {
    expect(declaraCampoStockPlano('readonly stock: number | null;')).toBe(true);
    expect(declaraCampoStockPlano('stock?: number;')).toBe(true);
    expect(declaraCampoStockPlano('readonly stockByUnit: readonly ProductStockByUnit[];')).toBe(false);
    expect(exponeStockPorUnidad('readonly stockByUnit: readonly ProductStockByUnit[];')).toBe(true);
    expect(mencionaStock('readonly name: string; readonly qtyAlert?: number | null;')).toBe(false);
    expect(mencionaStock('readonly stock: number | null;')).toBe(true);
  });

  it('R11: si T8 se revirtiera -stock de vuelta en los contratos- el detector lo cazaria', () => {
    const productViewRevertido = [
      'export type ProductView = {',
      '  readonly id: string;',
      '  readonly stock: number | null;',
      '};',
    ].join('\n');
    const cuerpo = cuerpoDeTipo(productViewRevertido, 'ProductView');
    expect(cuerpo).not.toBeNull();
    expect(declaraCampoStockPlano(cuerpo as string)).toBe(true);

    const productSelectRevertido = [
      'export const PRODUCT_SELECT = {',
      '  id: true,',
      '  stock: true,',
      '} satisfies Prisma.ProductSelect;',
    ].join('\n');
    const cuerpoSelect = cuerpoDeConst(productSelectRevertido, 'PRODUCT_SELECT');
    expect(cuerpoSelect).not.toBeNull();
    expect(declaraCampoStockPlano(cuerpoSelect as string)).toBe(true);

    const createProductRevertido = [
      'export async function createProduct(data, now, scope) {',
      '  const created = await prisma.product.create({',
      '    data: { name: data.name, stock: data.stock ?? null },',
      '  });',
      '  return { id: created.id };',
      '}',
    ].join('\n');
    const cuerpoCreate = cuerpoDeFuncion(createProductRevertido, 'createProduct');
    expect(cuerpoCreate).not.toBeNull();
    expect(declaraCampoStockPlano(cuerpoCreate as string)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// R21 — EL CALCULO NO BORRA NI MODIFICA NINGUNA FILA DE LOTE
// ---------------------------------------------------------------------------------------------

// Nota (2026-09-17): esta guardia dejo de exigir CERO llamadas a `productBatch.update` en todo
// `product-prisma.ts`. Ahora permite exactamente UNA, dentro del cuerpo de `adjustBatchStock`, y
// sigue prohibiendo: cualquier `update` en cualquier OTRA funcion; `delete`, `deleteMany` y
// `upsert` sobre `productBatch` en cualquier funcion, incluida `adjustBatchStock`; y cualquier
// `DELETE`/`UPDATE` crudo sobre la tabla. No se afirma en positivo que `adjustBatchStock` DEBA
// tener un `update` -esta guardia no fija ese estado-, solo que si hay uno en el archivo, no
// puede estar en ningun otro sitio.
describe('QC-91 R21 — calcular y dejar de escribir la existencia no toca ninguna fila de lote', () => {
  it('R21: product_batches.stock sigue intacto en el esquema', () => {
    const cuerpo = cuerpoDeModelo(leer(SCHEMA), 'ProductBatch');
    expect(cuerpo, 'el modelo ProductBatch no existe con esa forma: el sujeto de esta prueba cambio').not.toBeNull();
    expect(cuerpo).toMatch(/\bstock\s+Int\b/);
  });

  it('R21: product-prisma.ts no borra, reemplaza en bloque ni multiplica filas de product_batches', () => {
    expect(escrituraDestructivaDeLotes(leer(PRODUCT_PRISMA))).toEqual([]);
  });

  it('R21: product-catalog-prisma.ts no borra ni modifica filas de product_batches', () => {
    expect(escrituraDestructivaDeLotes(leer(PRODUCT_CATALOG_PRISMA))).toEqual([]);
    expect(llamaAUpdateFueraDe(leer(PRODUCT_CATALOG_PRISMA), 'adjustBatchStock')).toBe(false);
  });

  it('R21: el alta y el agregado de lote siguen creando; el unico update vive en adjustBatchStock', () => {
    const fuente = leer(PRODUCT_PRISMA);
    expect(fuente).toMatch(/tx\.productBatch\.create\s*\(/);
    expect(llamaAUpdateFueraDe(fuente, 'adjustBatchStock')).toBe(false);
  });

  it('R21: el detector de escrituras destructivas muerde con fuentes fabricadas y no con una limpia', () => {
    expect(escrituraDestructivaDeLotes('await tx.productBatch.delete({ where });')).toEqual([
      'llama a un metodo de escritura destructiva sobre productBatch',
    ]);
    expect(escrituraDestructivaDeLotes('await tx.productBatch.deleteMany({ where });')).toEqual([
      'llama a un metodo de escritura destructiva sobre productBatch',
    ]);
    expect(escrituraDestructivaDeLotes('await tx.productBatch.upsert({ where, create, update });')).toEqual([
      'llama a un metodo de escritura destructiva sobre productBatch',
    ]);
    expect(
      escrituraDestructivaDeLotes('await tx.$executeRaw`DELETE FROM "product_batches" WHERE id = ${id}`;'),
    ).toEqual(['DELETE crudo sobre product_batches']);
    expect(
      escrituraDestructivaDeLotes('await tx.$executeRaw`UPDATE "product_batches" SET stock = 0`;'),
    ).toEqual(['UPDATE crudo sobre product_batches']);
    expect(escrituraDestructivaDeLotes('await tx.productBatch.create({ data: {} });')).toEqual([]);
    // `update` simple ya NO es hallazgo de este detector: lo cubre `llamaAUpdateFueraDe`.
    expect(escrituraDestructivaDeLotes('await tx.productBatch.update({ where, data: {} });')).toEqual([]);
    // Un comentario que mencione borrar un lote no es codigo que borre un lote.
    expect(escrituraDestructivaDeLotes('// aqui NO se llama a tx.productBatch.delete(...)')).toEqual([]);
  });

  describe('llamaAUpdateFueraDe — el update de adjustBatchStock queda aislado del resto (R27)', () => {
    it('R27: un update DENTRO de adjustBatchStock no cuenta como hallazgo', () => {
      const fuente = [
        'export function otraCosa() {',
        '  return 1;',
        '}',
        'export async function adjustBatchStock(batchId) {',
        '  return tx.productBatch.update({ where: { id: batchId } });',
        '}',
      ].join('\n');
      expect(llamaAUpdateFueraDe(fuente, 'adjustBatchStock')).toBe(false);
    });

    it('R27: el MISMO update movido a OTRA funcion si cuenta como hallazgo', () => {
      const fuente = [
        'export async function adjustBatchStock(batchId) {',
        '  return 1;',
        '}',
        'export function otraFuncion() {',
        '  return tx.productBatch.update({ where: { id: 1 } });',
        '}',
      ].join('\n');
      expect(llamaAUpdateFueraDe(fuente, 'adjustBatchStock')).toBe(true);
    });

    it('R27: sin ningun update en el archivo, no hay hallazgo', () => {
      const fuente = 'export async function adjustBatchStock() { return 1; }';
      expect(llamaAUpdateFueraDe(fuente, 'adjustBatchStock')).toBe(false);
    });

    it('R27: un tipo de retorno con su propia llave -Promise<{ stock: number } | null>- no confunde al cuerpo', () => {
      const fuente = [
        'export async function adjustBatchStock(batchId: string): Promise<{ stock: number } | null> {',
        '  return tx.productBatch.update({ where: { id: batchId } });',
        '}',
        'export function otraFuncion(): void {',
        '  return undefined;',
        '}',
      ].join('\n');
      expect(llamaAUpdateFueraDe(fuente, 'adjustBatchStock')).toBe(false);
    });

    it('R27: delete, deleteMany y el SQL crudo siguen dando hallazgo pase lo que pase con update', () => {
      expect(escrituraDestructivaDeLotes('await tx.productBatch.delete({ where });')).not.toEqual([]);
      expect(escrituraDestructivaDeLotes('await tx.productBatch.deleteMany({ where });')).not.toEqual([]);
      expect(
        escrituraDestructivaDeLotes('await tx.$executeRaw`DELETE FROM "product_batches" WHERE id = ${id}`;'),
      ).not.toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------------------------
// LOS EXTRACTORES, PROBADOS SOBRE FUENTES FABRICADAS
// ---------------------------------------------------------------------------------------------

describe('QC-91 — los extractores de bloques no se confunden con codigo parecido', () => {
  it('cuerpoDeTipo aisla el tipo pedido y no se cuela a otro con nombre parecido', () => {
    const fuente = [
      'export type ProductRef = {',
      '  readonly id: string;',
      '};',
      'export type ProductRefundido = {',
      '  readonly stock: number;',
      '};',
    ].join('\n');
    const cuerpo = cuerpoDeTipo(fuente, 'ProductRef');
    expect(cuerpo).not.toBeNull();
    expect(cuerpo).not.toContain('ProductRefundido');
    expect(cuerpo).not.toContain('stock: number');
    expect(cuerpoDeTipo(fuente, 'NoExiste')).toBeNull();
  });

  it('cuerpoDeFuncion respeta el balance de llaves de la propia funcion', () => {
    const fuente = [
      'export function toProductView(row) {',
      '  return { stockByUnit: sumStockByUnit(row.batches.map((b) => ({ unitId: b.unitId }))) };',
      '}',
      'export function otraCosa() {',
      '  return { stock: 1 };',
      '}',
    ].join('\n');
    const cuerpo = cuerpoDeFuncion(fuente, 'toProductView');
    expect(cuerpo).not.toBeNull();
    expect(cuerpo).not.toContain('otraCosa');
    expect(cuerpo).not.toContain('stock: 1');
  });

  it('cuerpoDeModelo aisla el modelo de Prisma pedido', () => {
    const fuente = [
      'model Product {',
      '  id String @id',
      '}',
      'model ProductBatch {',
      '  stock Int',
      '}',
    ].join('\n');
    const cuerpo = cuerpoDeModelo(fuente, 'ProductBatch');
    expect(cuerpo).not.toBeNull();
    expect(cuerpo).toMatch(/\bstock\s+Int\b/);
    expect(cuerpoDeModelo(fuente, 'Product')).not.toContain('stock');
  });
});
