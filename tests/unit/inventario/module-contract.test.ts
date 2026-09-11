// T11 (QC-90, alta-del-primer-lote) — LIMITES DE ALCANCE del modulo `inventario`.
//
// Esta ficha ENSANCHA el modulo: le mete la escritura del primer lote. Dos cosas que
// deliberadamente NO entran quedan aqui escritas como test, porque son ausencias y una
// ausencia no la protege nadie salvo que alguien la afirme en positivo:
//
//   R30 — el contrato publico NO expone ninguna operacion de LISTAR, EDITAR ni BORRAR lotes.
//         «Listar, editar y borrar lotes» no tiene ficha y no se crea aqui
//         (`requirements.md > Alcance > Lo que NO entra`): nace el dia que alguien lo pida.
//
//   R31 — el listado de productos NO devuelve presentacion, asi que al elegir un producto
//         existente en el autocomplete el selector de presentacion queda VACIO. Es la
//         **alternativa B de `design.md > 10`**, DESCARTADA a proposito: servir la presentacion
//         del ultimo lote obligaria a devolverla en `ProductView` -el tipo que consumen el
//         listado, la ficha y `getProduct`- y a meter un join «ultimo lote» en la consulta mas
//         caliente de la pantalla, que ademas pisa el terreno de QC-91. **El coste aceptado,
//         textual: al elegir un producto existente el selector de presentacion queda en blanco
//         y hay que elegirla a mano.** El hilo del componente (`presentationId`/
//         `presentationName` opcionales en `ProductNameOption`) se deja puesto, pero HOY NUNCA
//         VIENE POBLADO.
//
// Por que un archivo NUEVO y no `scope.test.ts` ni `product-route-contract.test.ts`: el
// primero es el alcance de QC-20 medido sobre el ARBOL DE ARCHIVOS (que no haya route handlers
// ni una segunda pantalla del catalogo) y el segundo es el contrato de la RUTA
// `app/(private)/inventario`. Lo que R30 mira no es ni una cosa ni la otra: es el CONTRATO DEL
// MODULO (`lib/modules/inventario/index.ts`), y el precedente de este repo para eso tiene
// nombre propio -`tests/unit/recetas/module-contract.test.ts`-. R31 le hace pareja natural: es
// la frontera entre ese contrato (`ProductView`) y su unico consumidor afectado.
//
// Cubre R30, R31.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import * as inventario from '@/lib/modules/inventario';
import type { ProductView } from '@/lib/modules/inventario';

/** Sube desde este archivo hasta la raiz del repo (la carpeta con `package.json`). */
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

/**
 * Quita comentarios de linea y de bloque. Hace falta de verdad: los dos archivos que se leen
 * aqui EXPLICAN EN PROSA por que no llevan presentacion, y esa prosa no es una declaracion.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*/, ''))
    .join('\n');
}

/** Parte un identificador en palabras: `addBatchToAlive` -> add, batch, to, alive. */
function words(identifier: string): readonly string[] {
  return identifier
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 0);
}

/**
 * Palabras que denotan las TRES operaciones que R30 prohibe. `create` NO esta, y no es un
 * descuido: el alta del primer lote es justo lo que esta ficha construye, y su esquema
 * (`createProductWithFirstBatchSchema`) se publica a proposito.
 */
const OPERACIONES_PROHIBIDAS = new Set([
  // listar / leer
  'list',
  'listar',
  'get',
  'find',
  'fetch',
  'read',
  'query',
  'search',
  'buscar',
  'obtener',
  // editar
  'update',
  'edit',
  'patch',
  'modify',
  'actualizar',
  'editar',
  'modificar',
  // borrar
  'delete',
  'remove',
  'destroy',
  'archive',
  'borrar',
  'eliminar',
]);

/** Palabras que hacen que un export hable de LOTES y no de otra cosa. */
const PALABRAS_DE_LOTE = new Set(['batch', 'batches', 'lot', 'lots', 'lote', 'lotes']);

describe('QC-90 R30 — el contrato de inventario no ofrece listar, editar ni borrar lotes', () => {
  // Se mira lo que el barrel EXPORTA DE VERDAD -las claves del modulo ya cargado-, no un regex
  // sobre su texto: un regex se engana con un comentario, con un reexport indirecto o con un
  // `export * from`. Aqui solo aparecen los exports de VALOR, que es exactamente lo que una
  // «operacion» es: un tipo no ejecuta nada y desaparece al compilar.
  const claves = Object.keys(inventario).sort();

  it('el barrel se pudo cargar y publica exports de valor (ancla anti-vacuidad)', () => {
    // Sin esto, un barrel que dejara de exportar -o un import que devolviera `{}`- haria pasar
    // en verde el caso de abajo sin haber mirado nada. Las dos claves citadas son las que esta
    // misma ficha publico en T3: si desaparecen, el sujeto de R30 cambio y hay que revisarlo.
    expect(
      claves.length,
      'el barrel de inventario no expone ningun export de valor: este archivo no vigila nada',
    ).toBeGreaterThan(10);
    expect(claves).toContain('createProductWithFirstBatchSchema');
    expect(claves).toContain('PRODUCT_BATCH_LOT_MAX_LENGTH');
  });

  it('ningun export del contrato denota listar, editar ni borrar lotes', () => {
    // La regla NO es una lista negra de nombres concretos -de esas hay que acordarse, y nadie
    // se acuerda-: es estructural. Cualquier export NUEVO cuyo nombre junte una palabra de lote
    // con un verbo de listar/editar/borrar pone esto rojo, se llame `listProductBatches`,
    // `deleteBatch`, `batchQuery` o `updateLote`.
    const infractores = claves.filter((clave) => {
      const partes = words(clave);
      return (
        partes.some((parte) => PALABRAS_DE_LOTE.has(parte)) &&
        partes.some((parte) => OPERACIONES_PROHIBIDAS.has(parte))
      );
    });
    expect(
      infractores,
      `el contrato publico de inventario expone operaciones de lote que R30 prohibe: ${infractores.join(', ')}. ` +
        'Listar, editar y borrar lotes NO tiene ficha (requirements.md > Lo que NO entra): si hace falta, se pide una.',
    ).toEqual([]);
  });
});

describe('QC-90 R31 — el listado de productos no devuelve presentacion', () => {
  // Mordida en TIEMPO DE COMPILACION, ademas de la de tiempo de test: si alguien anade
  // `presentationId` o `presentationName` a `ProductView`, `pnpm run typecheck` se pone rojo
  // aqui mismo. Es la mitad que un barrido de texto no puede dar.
  type SinPresentacion<T> = 'presentationId' extends keyof T
    ? never
    : 'presentationName' extends keyof T
      ? never
      : true;
  const productViewSigueSinPresentacion: SinPresentacion<ProductView> = true;
  void productViewSigueSinPresentacion;

  it('ProductView sigue sin declarar presentacion', () => {
    // R31, alternativa B de `design.md > 10`: la presentacion se mudo al LOTE el 2026-09-09 y
    // esta ficha NO la devuelve al producto.
    const fuente = stripComments(
      readFileSync(
        join(repoRoot, 'lib', 'modules', 'inventario', 'domain', 'product-view.ts'),
        'utf8',
      ),
    );
    const bloque = /export type ProductView = \{([\s\S]*?)^\}/m.exec(fuente);
    expect(
      bloque,
      'no se encontro la declaracion de ProductView: este caso no vigila nada',
    ).not.toBeNull();
    const cuerpo = bloque?.[1] ?? '';
    expect(cuerpo, 'ancla anti-vacuidad: el cuerpo de ProductView debe traer sus campos').toContain(
      'qtyAlert',
    );
    expect(
      cuerpo,
      'ProductView volvio a declarar presentacion: eso es la alternativa B de `design.md > 10`, ' +
        'descartada y declarada fuera de alcance en R31. Si ahora hace falta, pasa por la ficha ' +
        'que corresponda (QC-91 reabre esa misma consulta), no por aqui.',
    ).not.toMatch(/presentation/i);
  });

  it('la opcion del autocomplete de nombre llega sin presentationId poblado desde el listado', () => {
    // El hilo esta puesto en `ProductNameOption` -`presentationId`/`presentationName`
    // OPCIONALES- pero `listProductsAction` devuelve `ProductView`, que no los trae: el mapeo
    // del picker solo puede poblar `id`, `name` y `qtyAlert`. Coste aceptado de R31 y de la
    // alternativa B: al elegir un producto existente el selector de presentacion queda EN
    // BLANCO y se elige a mano.
    const picker = stripComments(
      readFileSync(
        join(repoRoot, 'app', '(private)', 'inventario', 'components', 'product-name-picker.tsx'),
        'utf8',
      ),
    );

    // Los dos campos siguen siendo OPCIONALES en el tipo: volverlos obligatorios seria afirmar
    // que el listado los trae, y hoy no los trae.
    expect(picker, 'ProductNameOption debe declarar presentationId opcional').toMatch(
      /readonly presentationId\?:/,
    );
    expect(picker, 'ProductNameOption debe declarar presentationName opcional').toMatch(
      /readonly presentationName\?:/,
    );

    // El mapeo de la pagina del listado a opciones: ahi es donde se poblarian si vinieran.
    const mapeo = /result\.data\.items\.map\(\(item\) => \(\{([\s\S]*?)\}\)\)/.exec(picker);
    expect(
      mapeo,
      'no se encontro el mapeo de listProductsAction a opciones en product-name-picker.tsx: ' +
        'este caso no vigila nada',
    ).not.toBeNull();
    const cuerpo = mapeo?.[1] ?? '';
    expect(cuerpo, 'ancla anti-vacuidad: el mapeo debe poblar al menos el nombre').toContain(
      'name:',
    );
    expect(
      cuerpo,
      'el picker esta poblando la presentacion desde el listado: eso es la alternativa B de ' +
        '`design.md > 10`, descartada en R31 porque obliga a devolver presentacion en ' +
        'ProductView y a meter un join «ultimo lote» en la consulta mas caliente de la pantalla.',
    ).not.toMatch(/presentation/i);
  });
});
