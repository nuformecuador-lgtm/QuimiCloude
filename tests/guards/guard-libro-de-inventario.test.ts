// Guardia: todo camino de escritura de `product_batches` bajo `lib/` tiene que asentar su
// movimiento en la misma transaccion (R28, D12). Vive en `tests/guards/` y no en `tests/unit/`
// porque barre fuentes como texto: ningun grafo de imports la relacionaria con un cambio.
//
// LO QUE ESTA GUARDIA NO PUEDE VER, y hay que decirlo en voz alta: que `writeMovement` se llame
// con la `tx` correcta y con el mismo delta que el `UPDATE`. Eso lo cubre el test de cuadre del
// libro (R29), no esta guardia.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CARPETA_LIB = 'lib';
const PRODUCT_PRISMA = 'lib/modules/inventario/adapters/driven/persistence/product-prisma.ts';
const CAMINOS_ESPERADOS = [
  'createWithFirstBatch',
  'addBatchToAlive',
  'adjustBatchStock',
  'consumeBatchStock',
  'receiveFinishedGoods',
  'addImportedFinishedGoodsBatch',
  // QC-223 2026-10-08: la salida de producto terminado hacia un cliente, septimo camino.
  'dispatchFinishedGoods',
  // QC-224 2026-10-09: la vuelta al lote de una entrega anulada, octavo camino.
  'returnFinishedGoods',
] as const;
const CARPETAS_IGNORADAS = new Set(['node_modules', '.next', '.git', 'dist', 'coverage']);
const SUFIJOS_FUENTE = ['.ts', '.tsx'];

function leer(rutaRelativa: string): string {
  return readFileSync(join(RAIZ, rutaRelativa), 'utf8');
}

/** Los archivos fuente bajo `lib/`, en ruta relativa al repo y con `/` siempre. */
function archivosBajoLib(): string[] {
  const encontrados: string[] = [];
  const base = join(RAIZ, CARPETA_LIB);

  const recorrer = (directorio: string, relativa: string) => {
    for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
      const completa = join(directorio, entrada.name);
      const relativaHija = relativa === '' ? entrada.name : `${relativa}/${entrada.name}`;
      if (entrada.isDirectory()) {
        if (CARPETAS_IGNORADAS.has(entrada.name)) continue;
        recorrer(completa, relativaHija);
        continue;
      }
      if (SUFIJOS_FUENTE.some((sufijo) => entrada.name.endsWith(sufijo))) {
        encontrados.push(`${CARPETA_LIB}/${relativaHija}`);
      }
    }
  };

  recorrer(base, '');
  return encontrados.sort();
}

// -------------------------------------------------------------------------------------------
// EXTRACTORES, propios de este archivo (no importados de otra guardia: la logica es identica
// en espiritu a la de `qc91-alcance.test.ts`, pero importar ese archivo ejecutaria tambien sus
// `describe` de nivel superior por efecto secundario).
// -------------------------------------------------------------------------------------------

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

/** El indice del `)` que cierra la lista de parametros que abre en `aperturaParametros`. */
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

/** El cuerpo de `export [async] function <nombre>(...) { ... }`, o `null` si no existe con esa forma. */
function cuerpoDeFuncion(fuente: string, nombre: string): string | null {
  const codigo = stripComments(fuente);
  for (const prefijo of ['export async function ', 'export function ']) {
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

type FuncionExportada = { readonly nombre: string; readonly inicio: number; readonly fin: number };

/** Todas las `export [async] function <nombre>(...) { ... }` de una fuente ya sin comentarios,
 *  con su rango de cuerpo balanceado por llaves. */
function funcionesExportadas(codigoSinComentarios: string): FuncionExportada[] {
  const funciones: FuncionExportada[] = [];
  const patronEncabezado = /export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/g;
  let encabezado: RegExpExecArray | null;
  while ((encabezado = patronEncabezado.exec(codigoSinComentarios)) !== null) {
    const nombre = encabezado[1];
    const aperturaParametros = codigoSinComentarios.indexOf('(', encabezado.index);
    const cierreParametros = cierreDeParametros(codigoSinComentarios, aperturaParametros);
    if (cierreParametros === -1) continue;
    const llave = llaveDeCuerpoTrasParametros(codigoSinComentarios, cierreParametros);
    if (llave === -1) continue;
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
    if (fin === -1) continue;
    funciones.push({ nombre, inicio: encabezado.index, fin });
  }
  return funciones;
}

const METODOS_DE_ESCRITURA = ['create', 'createMany', 'update', 'updateMany', 'upsert'] as const;
const PATRON_ESCRITURA_DE_LOTE = new RegExp(
  `\\.productBatch\\.(?:${METODOS_DE_ESCRITURA.join('|')})\\s*\\(`,
  'g',
);

/**
 * Cada llamada que cambia una fila de `product_batches`, con el nombre de la funcion exportada
 * que la contiene -o `null` si no vive dentro de ninguna-. Puro: no toca disco.
 */
function caminosDeEscritura(fuente: string): Array<{ readonly nombreFuncion: string | null }> {
  const codigo = stripComments(fuente);
  const funciones = funcionesExportadas(codigo);
  const patron = new RegExp(PATRON_ESCRITURA_DE_LOTE.source, 'g');
  const caminos: Array<{ readonly nombreFuncion: string | null }> = [];
  let match: RegExpExecArray | null;
  while ((match = patron.exec(codigo)) !== null) {
    const indice = match.index;
    const contenedora = funciones.find((f) => indice >= f.inicio && indice <= f.fin);
    caminos.push({ nombreFuncion: contenedora ? contenedora.nombre : null });
  }
  return caminos;
}

/** Las etiquetas `archivo::funcion` de una fuente ya leida, para un archivo dado. */
function etiquetasDeArchivo(archivo: string, fuente: string): string[] {
  return caminosDeEscritura(fuente).map(
    (camino) => `${archivo}::${camino.nombreFuncion ?? '(fuera de una funcion exportada nombrada)'}`,
  );
}

/** El censo real: todas las etiquetas de escritura de `product_batches` bajo `lib/`. */
function censoReal(): string[] {
  const etiquetas = archivosBajoLib().flatMap((archivo) => etiquetasDeArchivo(archivo, leer(archivo)));
  return [...new Set(etiquetas)].sort();
}

/** `true` si el cuerpo de la funcion existe Y asienta con `writeMovement(`. Si la funcion no
 *  existe con esa forma, esto es `false` -no `null`, no una excepcion-: la guardia se pone roja,
 *  no se queda muda vigilando el vacio. */
function contieneAsientoEnCuerpo(fuente: string, nombreFuncion: string): boolean {
  const cuerpo = cuerpoDeFuncion(fuente, nombreFuncion);
  return cuerpo !== null && /writeMovement\s*\(/.test(cuerpo);
}

const CENSO_ESPERADO = CAMINOS_ESPERADOS.map((nombre) => `${PRODUCT_PRISMA}::${nombre}`).sort();

// -------------------------------------------------------------------------------------------
// EL CENSO SOBRE EL ARBOL REAL
// -------------------------------------------------------------------------------------------

describe('guardia: censo de caminos de escritura de product_batches bajo lib/ (R28)', () => {
  it('el recorrido de lib/ encuentra archivos y no se ha quedado vacio', () => {
    const archivos = archivosBajoLib();
    expect(
      archivos.length,
      `el recorrido de ${CARPETA_LIB}/**/*.ts(x) deberia encontrar cientos de archivos y ` +
        `encontro ${archivos.length}. Si encontro pocos o ninguno, la carpeta o el filtro cambiaron ` +
        'y esta guardia esta pasando en vacio.',
    ).toBeGreaterThan(50);
  });

  // QC-223 2026-10-08: + dispatchFinishedGoods en el titulo, igual que en CAMINOS_ESPERADOS.
  // QC-224 2026-10-09: + returnFinishedGoods en el titulo, igual que en CAMINOS_ESPERADOS.
  it('el censo de caminos de escritura es exactamente { createWithFirstBatch, addBatchToAlive, adjustBatchStock, consumeBatchStock, receiveFinishedGoods, addImportedFinishedGoodsBatch, dispatchFinishedGoods, returnFinishedGoods }', () => {
    const real = censoReal();
    expect(
      real,
      `Caminos de escritura de product_batches encontrados bajo ${CARPETA_LIB}/:\n` +
        `${real.map((etiqueta) => `  - ${etiqueta}`).join('\n')}\n` +
        `Se esperaba exactamente:\n${CENSO_ESPERADO.map((etiqueta) => `  - ${etiqueta}`).join('\n')}\n` +
        'Un camino de mas -o uno en un archivo que no sea product-prisma.ts- es un hallazgo: ' +
        'alguien anadio una escritura de lote sin pasar por esta guardia.',
    ).toEqual(CENSO_ESPERADO);
  });

  for (const nombre of CAMINOS_ESPERADOS) {
    it(`el camino ${nombre} de product-prisma.ts asienta con writeMovement(`, () => {
      expect(
        contieneAsientoEnCuerpo(leer(PRODUCT_PRISMA), nombre),
        `${PRODUCT_PRISMA} :: ${nombre} no contiene una llamada a writeMovement( dentro de su ` +
          'cuerpo -o la funcion ya no existe con esa forma-: cambia la existencia de un lote sin ' +
          'dejar su asiento.',
      ).toBe(true);
    });
  }
});

// -------------------------------------------------------------------------------------------
// LOS DETECTORES, PROBADOS CON FUENTES FABRICADAS
// -------------------------------------------------------------------------------------------

describe('guardia: los detectores muerden sobre fuentes fabricadas, no solo sobre el arbol real', () => {
  it('un cuarto camino de escritura, fabricado, aparece en el censo con su propio nombre', () => {
    const fuente = [
      'export async function createWithFirstBatch(tx) {',
      '  await tx.productBatch.create({ data: {} });',
      '}',
      'export async function rogueWrite(tx) {',
      '  await tx.productBatch.create({ data: {} });',
      '}',
    ].join('\n');

    const etiquetas = etiquetasDeArchivo('lib/fabricado.ts', fuente);
    expect(etiquetas).toEqual([
      'lib/fabricado.ts::createWithFirstBatch',
      'lib/fabricado.ts::rogueWrite',
    ]);
  });

  it('un productBatch.update fabricado fuera de toda funcion exportada nombrada tambien se censa', () => {
    const fuente = 'await tx.productBatch.update({ where: { id: 1 }, data: { stock: 1 } });';
    const etiquetas = etiquetasDeArchivo('lib/fabricado.ts', fuente);
    expect(etiquetas).toEqual(['lib/fabricado.ts::(fuera de una funcion exportada nombrada)']);
  });

  it('un camino fabricado con writeMovement en su cuerpo da verde', () => {
    const fuente = [
      'export async function adjustBatchStock(tx) {',
      '  await tx.productBatch.update({ where: {}, data: {} });',
      '  await writeMovement(tx, {}, now, scope);',
      '}',
    ].join('\n');
    expect(contieneAsientoEnCuerpo(fuente, 'adjustBatchStock')).toBe(true);
  });

  it('el mismo camino fabricado SIN su writeMovement -el asiento le fue quitado- da rojo', () => {
    const fuente = [
      'export async function adjustBatchStock(tx) {',
      '  await tx.productBatch.update({ where: {}, data: {} });',
      '}',
    ].join('\n');
    expect(contieneAsientoEnCuerpo(fuente, 'adjustBatchStock')).toBe(false);
  });

  it('writeMovement( en OTRA funcion no cuenta como asiento del camino pedido', () => {
    const fuente = [
      'export async function adjustBatchStock(tx) {',
      '  await tx.productBatch.update({ where: {}, data: {} });',
      '}',
      'export async function otraCosa(tx) {',
      '  await writeMovement(tx, {}, now, scope);',
      '}',
    ].join('\n');
    expect(contieneAsientoEnCuerpo(fuente, 'adjustBatchStock')).toBe(false);
  });

  it('si el lector no encuentra el cuerpo pedido, la guardia se pone roja -no muda-', () => {
    const fuente = 'export async function otraFuncion(tx) { return 1; }';
    expect(contieneAsientoEnCuerpo(fuente, 'adjustBatchStock')).toBe(false);
  });

  it('cuerpoDeFuncion respeta el balance de llaves y un tipo de retorno con su propia llave', () => {
    const fuente = [
      'export async function adjustBatchStock(id: string): Promise<{ stock: number } | null> {',
      '  return { stock: 1 };',
      '}',
      'export function otraCosa() {',
      '  return { stock: 2 };',
      '}',
    ].join('\n');
    const cuerpo = cuerpoDeFuncion(fuente, 'adjustBatchStock');
    expect(cuerpo).not.toBeNull();
    expect(cuerpo).not.toContain('otraCosa');
    expect(cuerpo).not.toContain('stock: 2');
  });

  it('funcionesExportadas no confunde el cierre de una funcion con el de la siguiente', () => {
    const codigo = stripComments(
      [
        'export function primera(a) {',
        '  return { x: a };',
        '}',
        'export function segunda(b) {',
        '  return { y: b };',
        '}',
      ].join('\n'),
    );
    const funciones = funcionesExportadas(codigo);
    expect(funciones.map((f) => f.nombre)).toEqual(['primera', 'segunda']);
    expect(codigo.slice(funciones[0].inicio, funciones[0].fin + 1)).not.toContain('segunda');
  });
});
